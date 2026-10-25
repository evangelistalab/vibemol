#!/usr/bin/env python3
"""Execute browser entry points once; CI shard workers defer acceptance to the join."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import time

from ci_evidence import artifact_identity, digest

ROOT = pathlib.Path(__file__).resolve().parents[2]
MANIFEST = ROOT / 'tests/baselines/browser-suite.json'
SHARDS = ROOT / 'tests/baselines/browser-shards.json'


def failure_workflow(suite, log, source=None):
    """Recognize a named failing step bound to the final uncaught exception.

    Traceback line numbers and rendered source statements are diagnostics only.
    Historical unmarked logs keep their immutable historical reports; they are
    deliberately not accepted by this contract. Closed #11/#21 have no live rule.
    """
    lines = log.rstrip().splitlines()
    if not lines or not lines[-1].startswith('[workflow-exception] '):
        return None
    try:
        terminal = json.loads(lines[-1].split(' ', 1)[1])
        records = [json.loads(line.split(' ', 1)[1]) for line in lines
                   if line.startswith('[workflow-step] ')]
    except (ValueError, TypeError):
        return None
    if (not isinstance(terminal, dict)
            or not isinstance(terminal.get('token'), str)
            or not re.fullmatch(r'[0-9a-f]{32}', terminal['token'])):
        return None
    name = pathlib.Path(suite).name
    candidates = [r for r in records if isinstance(r, dict)
                  and r.get('token') == terminal.get('token')]
    if len(candidates) != 1:
        return None
    row = candidates[0]
    exceptions = re.findall(r'^([\w.]*(?:Error|Exception))(?::|$)', log, re.M)
    if (not exceptions or row.get('schema') != 1 or row.get('suite') != name
            or terminal.get('suite') != name or row.get('outcome') != 'failed'
            or row.get('factsError') or row.get('bindingError')
            or row.get('exceptionType') != terminal.get('exceptionType')
            or exceptions[-1].split('.')[-1] != row.get('exceptionType')):
        return None
    facts = row.get('facts', {})
    if not isinstance(facts, dict):
        return None
    if (name == 'axis_gizmo.py' and row.get('workflow') == 'escape-canvas-focus'
            and row.get('step') == 'axis-endpoint.escape.canvas-focus'
            and row.get('exceptionType') == 'AssertionError'):
        before, after = facts.get('before', {}), facts.get('after', {})
        if not isinstance(before, dict) or not isinstance(after, dict):
            return None
        endpoints = {'viewAxis'+sign+axis+'Btn' for sign in ('Pos','Neg') for axis in 'XYZ'}
        if (facts.get('trigger') == {'kind':'native-keydown','key':'Escape','completed':True}
                and isinstance(before.get('focus'), str) and before['focus'] in endpoints
                and facts.get('expected') == 'canvas'
                and facts.get('actual') == after.get('focus')
                and isinstance(facts.get('actual'), str) and facts['actual'] != 'canvas'):
            return {'id': 'escape-canvas-focus'}
    if (name == 'mode_consistency.py' and row.get('workflow') == 'coordinates-delete-selection-card'
            and row.get('step') == 'coordinates.row1.native-delete'
            and row.get('exceptionType') == 'TimeoutError'):
        target, hit = facts.get('action', {}), facts.get('hit', {})
        if not isinstance(hit, dict):
            return None
        if (target == {'kind':'native-click','rowAtomIndex':1,'command':'delete'}
                and hit.get('targetVisible') is True and hit.get('targetEnabled') is True
                and hit.get('targetOwnsHit') is False and hit.get('cardOwnsHit') is True
                and hit.get('interceptorId') in ('editSelectionPosition','editSelectionTranslateCue')):
            return {'id': 'coordinates-delete-selection-card'}
    return None


def failure_details(log, suite=None, source=None):
    sites = re.findall(r'File "[^\"]*/tests/e2e/([^\"]+)", line (\d+), in ([^\n]+)', log)
    exceptions = re.findall(r'^([\w.]*(?:Error|Exception))(?::|$)', log, re.M)
    details = {'firstFailure': ({'suite': sites[-1][0], 'line': int(sites[-1][1]), 'function': sites[-1][2]}
                             if sites else None),
            'failureCallSite': ({'suite': sites[-2][0], 'line': int(sites[-2][1]), 'function': sites[-2][2]}
                                if len(sites) > 1 else None),
            'exceptionType': exceptions[-1].split('.')[-1] if exceptions else None,
            'failureWorkflow': failure_workflow(suite, log) if suite else None}
    if suite and pathlib.Path(suite).name == 'smoke.py':
        details['videoExportCompletion'] = [json.loads(x) for x in re.findall(r'^\[video-export-completion\] (.+)$', log, re.M)]
    return details


def matches_known_defect(result, known):
    workflow = result.get('failureWorkflow') or {}
    return (result['exitCode'] != 0 and workflow.get('id') == known['workflow']
            and result['exceptionType'] == known['exceptionType']
            and ('sites' not in known or workflow.get('site') in known['sites']))


def shard_assignments(plan, manifest):
    shards = plan['shards']
    names = [s['name'] for s in shards]
    suites = [test for shard in shards for test in shard['suites']]
    assert len(names) == len(set(names)) and names, 'Duplicate or empty shard inventory'
    assert all(shard['suites'] for shard in shards), 'Empty shard'
    assert len(suites) == len(set(suites)) == manifest['expected']['total'], 'Missing or duplicate suites in shard plan'
    assert set(suites) == set(manifest['suites']), 'Shard plan differs from full suite manifest'
    for test in ('tests/e2e/smoke.py', 'tests/e2e/looks.py'):
        assert next(s for s in shards if test in s['suites'])['suites'] == [test], test + ' needs its own shard'
    return {s['name']: s['suites'] for s in shards}


def finish_report(report, manifest, aggregate=True):
    failures = [e for e in report['suites'] if e['exitCode']]
    report.update(passed=sum(e['exitCode'] == 0 for e in report['suites']),
                  failed=len(failures), total=len(report['suites']))
    unexpected = [e['test'] for e in failures if not e['knownDefect']]
    actual = {key: report[key] for key in ('passed', 'failed', 'total')}
    actual_keys = {(e['test'], (e.get('failureWorkflow') or {}).get('id')) for e in failures}
    expected_keys = {(test, value['workflow']) for test, value in manifest['knownDefects'].items()}
    gate = not unexpected and actual == manifest['expected'] and actual_keys == expected_keys
    report.update(unexpectedFailures=unexpected, matchesAcceptedBaseline=gate if aggregate else None,
                  aggregationRequired=not aggregate,
                  actualFailingWorkflows=[list(k) for k in sorted(actual_keys)],
                  expectedFailingWorkflows=[list(k) for k in sorted(expected_keys)])
    smoke = next((e for e in report['suites'] if e['test'] == 'tests/e2e/smoke.py'), None)
    report['issue11Workflow'] = ({'status': 'not in this shard'} if smoke is None else
        smoke['failureWorkflow'] if smoke['knownDefect'] else
        {'status': 'passed' if smoke['exitCode'] == 0 else 'unexpected smoke failure'})
    report['videoExportCompletion'] = smoke.get('videoExportCompletion', []) if smoke else []
    return gate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-known-defects', action='store_true',
                        help='Require exactly the manifest workflows; still report them as failing.')
    parser.add_argument('--shard', help='Collect one planned shard; the join, not this worker, asserts the full gate.')
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    suites, known = manifest['suites'], manifest['knownDefects']
    assert len(suites) == len(set(suites)) == manifest['expected']['total']
    if args.shard:
        assert not args.allow_known_defects, 'A shard records outcomes; only the join accepts the full gate'
        assignments = shard_assignments(json.loads(SHARDS.read_text()), manifest)
        assert args.shard in assignments, 'Unknown shard: ' + args.shard
        suites = assignments[args.shard]
    out = pathlib.Path(os.environ.get('VIBEMOL_TEST_ARTIFACT_DIR', ROOT / 'out/test-artifacts/browser-suite')).resolve()
    out.mkdir(parents=True, exist_ok=True)
    source_hash = hashlib.sha256((ROOT / 'assets/app/js/app.js').read_bytes()).hexdigest()
    report = {'sourceAppSha256': source_hash, 'expected': manifest['expected'], 'suites': [],
              'method': 'Every entry point runs once, sequentially, without retries or changed assertions.',
              'timingMethod': 'time.monotonic wall time around each suite subprocess; includes browser/server startup'}
    report['artifactIdentity'] = artifact_identity()
    if args.shard:
        report.update(shard=args.shard, shardPlanSha256=digest(SHARDS), executionComplete=False)
        report['method'] = 'Each assigned entry point runs once, sequentially within this shard; the join asserts the aggregate gate.'
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        report['ciRunUrl'] = f"https://github.com/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
    batch_started = time.monotonic()
    for suite in suites:
        folder = out / pathlib.Path(suite).stem
        folder.mkdir(exist_ok=True)
        print(f'[browser-suite] Starting {suite}', flush=True)
        started = time.monotonic()
        with (folder / 'run.log').open('w') as log_file:
            result = subprocess.run([sys.executable, str(ROOT / suite)], cwd=ROOT,
                env={**os.environ, 'VIBEMOL_TEST_ARTIFACT_DIR': str(folder), 'PYTHONUNBUFFERED': '1'},
                stdout=log_file, stderr=subprocess.STDOUT)
        log = (folder / 'run.log').read_text()
        elapsed = round(time.monotonic() - started, 2)
        entry = {'test': suite, 'exitCode': result.returncode,
                 'seconds': elapsed, 'wallTimeSeconds': elapsed,
                 'testSha256': hashlib.sha256((ROOT / suite).read_bytes()).hexdigest(),
                 'rawLog': str((folder / 'run.log').relative_to(ROOT)),
                 **failure_details(log, suite, (ROOT / suite).read_text())}
        entry['knownDefect'] = suite in known and matches_known_defect(entry, known[suite])
        report['suites'].append(entry)
        report.update(passed=sum(e['exitCode'] == 0 for e in report['suites']),
                      failed=sum(e['exitCode'] != 0 for e in report['suites']), total=len(report['suites']))
        (out / 'browser-results.json').write_text(json.dumps(report, indent=2) + '\n')
        print('[browser-suite] ' + json.dumps(entry), flush=True)
        if result.returncode:
            print('\n'.join(log.splitlines()[-18:]), flush=True)
    assert hashlib.sha256((ROOT / 'assets/app/js/app.js').read_bytes()).hexdigest() == source_hash
    gate = finish_report(report, manifest, aggregate=not args.shard)
    report['wallTimeSeconds'] = round(time.monotonic() - batch_started, 2)
    report['executionComplete'] = True
    assert artifact_identity() == report['artifactIdentity'], 'Source changed during browser execution'
    (out / 'browser-results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f"[browser-suite] {report['passed']} passing / {report['failed']} failing / {report['total']} suites; "
          f"accepted-baseline match: {'pending aggregate join' if args.shard else gate}", flush=True)
    if args.shard:
        return 0  # Evidence collected; failing tests remain failing in the report.
    return 0 if (gate if args.allow_known_defects else not report['failed']) else 1


if __name__ == '__main__':
    raise SystemExit(main())
