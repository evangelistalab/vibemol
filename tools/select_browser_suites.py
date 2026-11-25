"""Resolve local browser coverage from changed paths and a CI browser report."""

import argparse
from fnmatch import fnmatchcase
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'tests/baselines/browser-suite.json'
SUITE_MAP = ROOT / 'tests/baselines/suite-map.json'


def suite_rules():
    suites = json.loads(MANIFEST.read_text())['suites']
    rules = json.loads(SUITE_MAP.read_text())
    for pattern, mapped in rules.items():
        if mapped != ['*'] and (not mapped or len(set(mapped)) != len(mapped) or set(mapped) - set(suites)):
            raise ValueError(f'Unknown or duplicate browser suite in {pattern}: {mapped}')
    return suites, rules


def select_suites(paths, suites, rules, failures=()):
    reasons = {}
    for path in paths:
        for pattern, mapped in rules.items():
            if fnmatchcase(path, pattern):
                for suite in suites if mapped == ['*'] else mapped:
                    reasons.setdefault(suite, set()).add(f'{path} matches {pattern}')
    for suite in failures:
        if suite not in suites:
            raise ValueError(f'Unknown failed browser suite: {suite}')
        reasons.setdefault(suite, set()).add('failed in the supplied CI report')
    return {suite: sorted(reasons[suite]) for suite in suites if suite in reasons}


def changed_paths(base):
    def git(*args):
        raw = subprocess.check_output(['git', *args], cwd=ROOT)
        return set(raw.decode().split('\0')[:-1])

    # Include both old and new names for a rename.
    return sorted(git('diff', '--name-only', '--no-renames', '-z', base, '--')
                  | git('ls-files', '--others', '--exclude-standard', '-z'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default='origin/main')
    parser.add_argument('--failed-report', type=Path)
    parser.add_argument('--hardware-gl', action='store_true')
    parser.add_argument('--list', action='store_true')
    args = parser.parse_args()
    failures = []
    if args.failed_report:
        report = json.loads(args.failed_report.read_text())
        failures = report['unexpectedFailures']
    reasons = select_suites(changed_paths(args.base), *suite_rules(), failures)
    for suite, selected in reasons.items():
        print(f'{suite}: {", ".join(selected)}', flush=True)
    if not reasons:
        print('No mapped browser suites selected')
    if args.list or not reasons:
        return 0
    flags = ['--hardware-gl'] if args.hardware_gl else []
    return subprocess.call([sys.executable, str(ROOT/'tools/run_browser_shards_parallel.py'),
                            *flags, *reasons], cwd=ROOT)


if __name__ == '__main__':
    raise SystemExit(main())
