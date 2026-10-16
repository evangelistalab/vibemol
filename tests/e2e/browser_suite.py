#!/usr/bin/env python3
"""Execute browser entry points once; CI shard workers defer acceptance to the join."""
from __future__ import annotations

import argparse
import ast
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


def traceback_statements(log):
    return re.findall(r'File "[^\"]*/tests/e2e/([^\"]+)", line \d+, in [^\n]+\n[ \t]+([^\n]+)', log)


def parsed_statement(text):
    try:
        return ast.parse(text.strip()).body
    except SyntaxError:
        return []


def same_statement(left, right):
    return ast.dump(left, include_attributes=False) == ast.dump(right, include_attributes=False)


def failure_workflow(suite, log, source):
    """Recognize the failed action and its workflow; line numbers are diagnostic only."""
    statements = [text for name, text in traceback_statements(log) if name == pathlib.Path(suite).name]
    if not statements:
        return None
    failed = parsed_statement(statements[-1])
    if pathlib.Path(suite).name == 'axis_gizmo.py':
        expected = parsed_statement("page.keyboard.press('Escape'); assert page.locator('#canvas').evaluate('el=>el===document.activeElement')")
        if len(failed) == len(expected) and all(same_statement(a, b) for a, b in zip(failed, expected)):
            return {'id': 'escape-canvas-focus'}
    elif pathlib.Path(suite).name == 'mode_consistency.py':
        expected = parsed_statement("page.locator('#coordsContent [data-atom-index=\"1\"] [data-coords-action=\"delete\"]').click()")
        intercepted = re.search(r'<[^\n]*id="editSelection(?:Position|TranslateCue)"[^\n]*intercepts pointer events', log)
        if len(failed) == 1 and same_statement(failed[0], expected[0]) and intercepted:
            return {'id': 'coordinates-delete-selection-card'}
    elif pathlib.Path(suite).name == 'smoke.py':
        # Both Stop-after-export paths are issue #11. The second-download wait
        # and Stop action distinguish them from every other video workflow.
        for site in ('trajectory', 'vibration'):
            expected = parsed_statement(f"wait_for_video_idle(page, '{site}')")[0]
            if len(failed) != 1 or not same_statement(failed[0], expected):
                continue
            for owner in ast.walk(ast.parse(source)):
                for value in vars(owner).values():
                    if not isinstance(value, list):
                        continue
                    for index, node in enumerate(value):
                        if not isinstance(node, ast.Expr) or not same_statement(node, expected) or index < 2:
                            continue
                        previous = value[index - 1]
                        stop = value[index - 2]
                        stop_expected = parsed_statement(f"page.locator('#{site}SaveVideoBtn').click()")[0]
                        if not isinstance(previous, ast.Expr) or not isinstance(previous.value, ast.Call):
                            continue
                        wait = previous.value
                        if (ast.unparse(wait.func) == 'page.wait_for_function' and wait.args
                                and isinstance(wait.args[0], ast.Constant) and isinstance(wait.args[0].value, str)
                                and 'window.__trajectoryVideoExportTest?.downloads?.length' in wait.args[0].value
                                and re.search(r'===\s*2\s*$', wait.args[0].value.strip())
                                and same_statement(stop, stop_expected)):
                            return {'id': 'issue-11-stop-after-second-download', 'site': site}
    return None


def failure_details(log, suite=None, source=None):
    sites = re.findall(r'File "[^\"]*/tests/e2e/([^\"]+)", line (\d+), in ([^\n]+)', log)
    exceptions = re.findall(r'^([\w.]*(?:Error|Exception))(?::|$)', log, re.M)
    return {'firstFailure': ({'suite': sites[-1][0], 'line': int(sites[-1][1]), 'function': sites[-1][2]}
                             if sites else None),
            'failureCallSite': ({'suite': sites[-2][0], 'line': int(sites[-2][1]), 'function': sites[-2][2]}
                                if len(sites) > 1 else None),
            'exceptionType': exceptions[-1].split('.')[-1] if exceptions else None,
            'failureWorkflow': failure_workflow(suite, log, source) if suite and source is not None else None}


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
    gate = not unexpected and actual == manifest['expected']
    report.update(unexpectedFailures=unexpected, matchesAcceptedBaseline=gate if aggregate else None,
                  aggregationRequired=not aggregate)
    smoke = next((e for e in report['suites'] if e['test'] == 'tests/e2e/smoke.py'), None)
    report['issue11Workflow'] = ({'status': 'not in this shard'} if smoke is None else
        smoke['failureWorkflow'] if smoke['knownDefect'] else
        {'status': 'passed' if smoke['exitCode'] == 0 else 'unexpected smoke failure'})
    return gate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-known-defects', action='store_true',
                        help='Accept only the three filed workflows; still report them as failing.')
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
