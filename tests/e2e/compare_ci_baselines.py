#!/usr/bin/env python3
"""Check exact equality of four captures from two independent CI recording jobs."""
import argparse
import gzip
import hashlib
import json
import pathlib
import subprocess
import sys


def main(folder, baseline_ref='v0.9.5-pre-refactor'):
    root = pathlib.Path(__file__).resolve().parents[2]
    expected_commit = subprocess.check_output(['git', 'rev-parse', baseline_ref + '^{commit}'], cwd=root, text=True).strip()
    if baseline_ref == 'v0.9.5-pre-refactor':
        assert expected_commit == '1c609b338344aaa49ffd11b9ee2ad834a6e0d85d', expected_commit
    captures, provenances, artifacts = [], [], []
    for number in (1, 2):
        artifact = folder / f'characterization-baseline-{number}'
        golden = json.loads(gzip.decompress((artifact / 'characterize.json.gz').read_bytes()))
        provenance = golden['baseline']['captureProvenance']
        assert provenance['os'] == 'Linux' and provenance['ci']['provider'] == 'GitHub Actions'
        comparands = {'actualCommit': golden['baseline']['commit'], 'expectedCommit': expected_commit,
                      'actualTag': golden['baseline']['tag'], 'expectedTag': baseline_ref}
        print('[baseline-recording-identity] ' + json.dumps(comparands, sort_keys=True), flush=True)
        assert golden['baseline']['commit'] == expected_commit and golden['baseline']['tag'] == baseline_ref, comparands
        if baseline_ref == 'v0.10.0':
            proof = json.loads((artifact / 'release-baseline-source.json').read_text())
            assert proof['status'] == 'passed' and proof['commit'] == expected_commit and proof['tag'] == baseline_ref, proof
            assert proof['allArchivedBlobsMatchTag'] and not proof['harnessInjection'] and not proof['fixturePreparation'], proof
            wrong_versions = [{'capture': name, 'session.appVersion': c['session'].get('appVersion'),
                               'session.preset.appVersion': c['session']['preset'].get('appVersion')}
                              for name, c in golden['captures'].items()
                              if c['session'].get('appVersion') != '0.10.0' or c['session']['preset'].get('appVersion') != '0.10.0']
            versions = {'actualLeaves': 2 * len(golden['captures']), 'expectedLeaves': 204,
                        'actualWrongValues': wrong_versions, 'expectedWrongValues': [], 'expectedVersion': '0.10.0'}
            print('[release-recorded-versions] ' + json.dumps(versions, sort_keys=True), flush=True)
            assert versions['actualLeaves'] == 204 and not wrong_versions, versions
        for run in (1, 2):
            raw = (artifact / f'characterize-run-{run}.json').read_bytes()
            captured = json.loads(raw)
            assert len(captured) == 102 and captured == golden['captures']
            captures.append(captured)
            artifacts.append({'job': number, 'run': run, 'captureSha256': hashlib.sha256(raw).hexdigest()})
        provenances.append(provenance)
    assert all(c == captures[0] for c in captures), 'The two CI recording jobs differ; do not promote this baseline.'
    assert len({a['captureSha256'] for a in artifacts}) == 1, 'Serialized CI capture bytes differ.'
    report = {'independentCiJobs': 2, 'runsPerJob': 2, 'capturesPerRun': 102,
              'exactlyIdentical': True, 'toleranceUsedForCiRepeatComparison': False,
              'provenancePerJob': provenances, 'captures': artifacts}
    (folder / 'ci-comparison.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder', type=pathlib.Path)
    parser.add_argument('--baseline-ref', choices=('v0.9.5-pre-refactor', 'v0.10.0'), default='v0.9.5-pre-refactor')
    args = parser.parse_args()
    main(args.folder, args.baseline_ref)
