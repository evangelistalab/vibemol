#!/usr/bin/env python3
"""Execute every browser entry point, retaining failures and checking the accepted baseline."""
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

ROOT = pathlib.Path(__file__).resolve().parents[2]
MANIFEST = ROOT / 'tests/baselines/browser-suite.json'


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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-known-defects', action='store_true',
                        help='Accept only the three filed workflows; still report them as failing.')
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    suites, known = manifest['suites'], manifest['knownDefects']
    assert len(suites) == len(set(suites)) == manifest['expected']['total']
    out = pathlib.Path(os.environ.get('VIBEMOL_TEST_ARTIFACT_DIR', ROOT / 'out/test-artifacts/browser-suite')).resolve()
    out.mkdir(parents=True, exist_ok=True)
    source_hash = hashlib.sha256((ROOT / 'assets/app/js/app.js').read_bytes()).hexdigest()
    report = {'sourceAppSha256': source_hash, 'expected': manifest['expected'], 'suites': [],
              'method': 'Every entry point runs once, sequentially, without retries or changed assertions.',
              'timingMethod': 'time.monotonic wall time around each suite subprocess; includes browser/server startup'}
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
    failures = [e for e in report['suites'] if e['exitCode']]
    unexpected = [e['test'] for e in failures if not e['knownDefect']]
    actual = {key: report[key] for key in ('passed', 'failed', 'total')}
    gate = not unexpected and actual == manifest['expected']
    report.update(unexpectedFailures=unexpected, matchesAcceptedBaseline=gate)
    report['wallTimeSeconds'] = round(time.monotonic() - batch_started, 2)
    smoke = next(e for e in report['suites'] if e['test'] == 'tests/e2e/smoke.py')
    report['issue11Workflow'] = (smoke['failureWorkflow'] if smoke['knownDefect'] else
                                 {'status': 'passed' if smoke['exitCode'] == 0 else 'unexpected smoke failure'})
    (out / 'browser-results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f"[browser-suite] {report['passed']} passing / {report['failed']} failing / {report['total']} suites; "
          f'accepted-baseline match: {gate}', flush=True)
    return 0 if (gate if args.allow_known_defects else not failures) else 1


if __name__ == '__main__':
    raise SystemExit(main())
