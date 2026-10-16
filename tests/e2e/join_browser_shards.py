#!/usr/bin/env python3
"""Join every planned shard, validate raw evidence and enforce the one 34/3/37 gate."""
import argparse
import json
import math
import pathlib
import shutil

import browser_suite as suite
from ci_evidence import artifact_identity, digest, require_same_artifact


def join_reports(inputs, output, root=suite.ROOT, expected_identity=None):
    manifest = json.loads((root / 'tests/baselines/browser-suite.json').read_text())
    plan_path = root / 'tests/baselines/browser-shards.json'
    assignments = suite.shard_assignments(json.loads(plan_path.read_text()), manifest)
    paths = sorted(inputs.glob('browser-suite-*/browser-suite/browser-results.json'))
    reports = [json.loads(p.read_text()) for p in paths]
    require_same_artifact(reports, expected_identity or artifact_identity(root))
    assert len(reports) == len(assignments), 'Missing or duplicate shard reports'
    assert {r['shard'] for r in reports} == set(assignments), 'Wrong shard identities'
    entries = {}
    for path, part in zip(paths, reports):
        assert part['executionComplete'] is True, 'Shard did not finish'
        assert part['shardPlanSha256'] == digest(plan_path), 'Different shard plan'
        assert [e['test'] for e in part['suites']] == assignments[part['shard']], 'Shard coverage/order differs'
        for entry in part['suites']:
            test = entry['test']
            assert test not in entries, 'Duplicate suite: ' + test
            assert type(entry['exitCode']) is int
            assert math.isfinite(entry['wallTimeSeconds']) and entry['wallTimeSeconds'] >= 0
            assert entry['testSha256'] == digest(root / test), 'Different test source: ' + test
            raw = path.parent / pathlib.Path(test).stem / 'run.log'
            details = suite.failure_details(raw.read_text(), test, (root / test).read_text())
            for key, value in details.items():
                assert entry[key] == value, 'Raw failure details differ: ' + test + '/' + key
            known = test in manifest['knownDefects'] and suite.matches_known_defect({**entry, **details}, manifest['knownDefects'][test])
            assert entry['knownDefect'] == known, 'Incorrect known-defect classification: ' + test
            dest = output / pathlib.Path(test).stem
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(raw, dest / 'run.log')
            entries[test] = {**entry, 'rawLog': str(dest / 'run.log'), 'rawFailureIndependentlyVerified': True}
    assert set(entries) == set(manifest['suites']), 'Aggregate suite coverage differs'
    report = {'artifactIdentity': reports[0]['artifactIdentity'],
              'sourceAppSha256': reports[0]['artifactIdentity']['appSha256'],
              'ciRunUrl': reports[0]['artifactIdentity']['ciRunUrl'],
              'expected': manifest['expected'], 'suites': [entries[t] for t in manifest['suites']],
              'executionComplete': True, 'shardCount': len(reports), 'allExecutedOnce': True,
              'method': 'Every planned suite once; raw logs and source/run identity checked before aggregate acceptance.',
              'shardWallTimeSeconds': {r['shard']: r['wallTimeSeconds'] for r in reports},
              'suiteWallTimeSecondsTotal': round(sum(e['wallTimeSeconds'] for e in entries.values()), 2)}
    gate = suite.finish_report(report, manifest)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'browser-results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f"[browser-join] {report['passed']} passing / {report['failed']} failing / {report['total']}; accepted workflows: {gate}")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, default=suite.ROOT / 'out/test-artifacts/browser-suite')
    args = parser.parse_args()
    return 0 if join_reports(args.input, args.output)['matchesAcceptedBaseline'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
