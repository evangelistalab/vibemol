#!/usr/bin/env python3
"""Execute every browser entry point, retaining failures and checking the accepted baseline."""
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

ROOT = pathlib.Path(__file__).resolve().parents[2]
MANIFEST = ROOT / 'tests/baselines/browser-suite.json'


def failure_details(log):
    sites = re.findall(r'File "[^\"]*/tests/e2e/([^\"]+)", line (\d+), in ([^\n]+)', log)
    exceptions = re.findall(r'^([\w.]*(?:Error|Exception))(?::|$)', log, re.M)
    return {'firstFailure': ({'suite': sites[-1][0], 'line': int(sites[-1][1]), 'function': sites[-1][2]}
                             if sites else None),
            'failureCallSite': ({'suite': sites[-2][0], 'line': int(sites[-2][1]), 'function': sites[-2][2]}
                                if len(sites) > 1 else None),
            'exceptionType': exceptions[-1].split('.')[-1] if exceptions else None}


def matches_known_defect(result, known):
    return (result['exitCode'] != 0 and result['firstFailure'] == known['firstFailure']
            and result['exceptionType'] == known['exceptionType']
            and result['testSha256'] == known['testSha256']
            and ('failureCallSite' not in known or result['failureCallSite'] == known['failureCallSite']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-known-defects', action='store_true',
                        help='Accept only the three fingerprinted filed failures; still report them as failing.')
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    suites, known = manifest['suites'], manifest['knownDefects']
    assert len(suites) == len(set(suites)) == manifest['expected']['total']
    out = pathlib.Path(os.environ.get('VIBEMOL_TEST_ARTIFACT_DIR', ROOT / 'out/test-artifacts/browser-suite')).resolve()
    out.mkdir(parents=True, exist_ok=True)
    source_hash = hashlib.sha256((ROOT / 'assets/app/js/app.js').read_bytes()).hexdigest()
    report = {'sourceAppSha256': source_hash, 'expected': manifest['expected'], 'suites': [],
              'method': 'Every entry point runs once, sequentially, without retries or changed assertions.'}
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        report['ciRunUrl'] = f"https://github.com/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
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
        entry = {'test': suite, 'exitCode': result.returncode,
                 'seconds': round(time.monotonic() - started, 2),
                 'testSha256': hashlib.sha256((ROOT / suite).read_bytes()).hexdigest(),
                 'rawLog': str((folder / 'run.log').relative_to(ROOT)),
                 **failure_details(log)}
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
    (out / 'browser-results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f"[browser-suite] {report['passed']} passing / {report['failed']} failing / {report['total']} suites; "
          f'accepted-baseline match: {gate}', flush=True)
    return 0 if (gate if args.allow_known_defects else not failures) else 1


if __name__ == '__main__':
    raise SystemExit(main())
