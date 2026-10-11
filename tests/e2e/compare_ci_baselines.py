#!/usr/bin/env python3
"""Check exact equality of four captures from two independent CI recording jobs."""
import gzip
import hashlib
import json
import pathlib
import sys


def main(folder):
    captures, provenances, artifacts = [], [], []
    for number in (1, 2):
        artifact = folder / f'characterization-baseline-{number}'
        golden = json.loads(gzip.decompress((artifact / 'characterize.json.gz').read_bytes()))
        provenance = golden['baseline']['captureProvenance']
        assert provenance['os'] == 'Linux' and provenance['ci']['provider'] == 'GitHub Actions'
        assert golden['baseline']['commit'] == '1c609b338344aaa49ffd11b9ee2ad834a6e0d85d'
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
    main(pathlib.Path(sys.argv[1]))
