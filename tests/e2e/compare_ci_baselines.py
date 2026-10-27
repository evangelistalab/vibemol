#!/usr/bin/env python3
"""Check exact equality of four captures from two independent CI recording jobs."""
import argparse
import gzip
import hashlib
import json
import pathlib
import subprocess
import sys
import re

# These identify recorded datasets, not movable release labels. The 0.10.0
# captures were made at3425e02 before its release tag was corrected to44bcb5d.
BASELINE_COMMITS = {
    'v0.9.5-pre-refactor': '1c609b338344aaa49ffd11b9ee2ad834a6e0d85d',
    'v0.10.0': '3425e0231b71eeb8b8a11523806990f553265cba',
    'v0.10.1': '1c4f2a23552f9f68a9723987c3cf3bc318ccc43f',  # Actual capture source; release promotion has a different tree.
}


def resolve_baseline_commit(root, baseline_ref, expected_commit=None):
    pinned = BASELINE_COMMITS[baseline_ref]
    if pinned is not None:
        assert expected_commit in (None, pinned), (expected_commit, pinned)
        expected_commit = pinned
    assert expected_commit and re.fullmatch(r'[0-9a-f]{40}', expected_commit), 'An immutable capture commit is required.'
    resolved = subprocess.check_output(['git', 'rev-parse', expected_commit + '^{commit}'], cwd=root, text=True).strip()
    assert resolved == expected_commit, (resolved, expected_commit)
    if baseline_ref == 'v0.9.5-pre-refactor':
        original_tag = subprocess.check_output(['git', 'rev-parse', baseline_ref + '^{commit}'], cwd=root, text=True).strip()
        assert original_tag == pinned, (original_tag, pinned)
    return resolved


def main(folder, baseline_ref='v0.9.5-pre-refactor', expected_commit=None):
    root = pathlib.Path(__file__).resolve().parents[2]
    expected_commit = resolve_baseline_commit(root, baseline_ref, expected_commit)
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
        if baseline_ref in ('v0.10.0', 'v0.10.1'):
            proof = json.loads((artifact / 'release-baseline-source.json').read_text())
            assert proof['status'] == 'passed' and proof['commit'] == expected_commit and proof['tag'] == baseline_ref, proof
            if baseline_ref == 'v0.10.0':
                assert proof['allArchivedBlobsMatchTag'], proof
            else:
                assert proof['recordingMode'] == 'candidate' and proof['allArchivedBlobsMatchCommit'], proof
                assert proof['correctedReleaseBase'] == '44bcb5d534cecba27fd0ccfc60f74324a0920b73' and proof['mappingHelperAbsent'], proof
            assert not proof['harnessInjection'] and not proof['fixturePreparation'], proof
            expected_version = baseline_ref.removeprefix('v')
            wrong_versions = [{'capture': name, 'session.appVersion': c['session'].get('appVersion'),
                               'session.preset.appVersion': c['session']['preset'].get('appVersion')}
                              for name, c in golden['captures'].items()
                              if c['session'].get('appVersion') != expected_version or c['session']['preset'].get('appVersion') != expected_version]
            versions = {'actualLeaves': 2 * len(golden['captures']), 'expectedLeaves': 204,
                        'actualWrongValues': wrong_versions, 'expectedWrongValues': [], 'expectedVersion': expected_version}
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
    parser.add_argument('--baseline-ref', choices=tuple(BASELINE_COMMITS), default='v0.9.5-pre-refactor')
    parser.add_argument('--expected-commit', help='Exact capture SHA for an explicitly authorized, not-yet-pinned release recording.')
    args = parser.parse_args()
    main(args.folder, args.baseline_ref, args.expected_commit)
