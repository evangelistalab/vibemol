#!/usr/bin/env python3
"""Compare both CI characterization workers against unchanged goldens and each other."""
import argparse
import gzip
import hashlib
import json
import pathlib
import shutil

import characterize as capture
from ci_evidence import artifact_identity, require_same_artifact


def validate_identity_contexts(contexts):
    capture.require_element_cache_result(contexts, inject=False)
    assert {(c['launch'], c['theme']) for c in contexts} == {
        (launch, theme) for launch in ('workbench', 'legacy') for theme in ('light', 'dark')
    }, 'Missing or duplicate launch/theme contexts'
    for context in contexts:
        modes = ['Display', 'Measure', 'Edit'] + (['Calculations'] if context['launch'] == 'workbench' else [])
        assert context['modes'] == modes, 'Wrong modes exercised'
        panels = context['panelOpenClosePairs']
        assert len(panels) == len(set(panels)) and len(panels) >= (17 if len(modes) == 4 else 14)
        actual = capture.assert_element_cache_exercise(context['identity'], modes, panels)
        assert context['exercise'] == actual, 'Identity exercise counts differ'
        absent = {}
        if context['launch'] == 'workbench':
            absent['elementColorBtn'] = {'id': 'elementColorBtn', 'issue': 14, 'cached': 'null'}
        assert context['identity']['knownAbsent'] == absent, 'Known-absent issue/ID/disposition differs'


def join_reports(inputs, output, root=capture.ROOT, expected_identity=None):
    paths = sorted(inputs.glob('characterize-*/characterize/characterize-evidence.json'))
    reports = [json.loads(path.read_text()) for path in paths]
    require_same_artifact(reports, expected_identity or artifact_identity(root))
    assert len(reports) == 2 and sorted(r['matrixRunIndex'] for r in reports) == [1, 2], 'Both matrix runs required once'
    expected = capture.expected_captures(json.loads(gzip.decompress(capture.BASELINE.read_bytes())), root)
    assert len(expected) == 102, 'Unexpected committed capture inventory'
    runs, pixels, identity_runs = {}, {}, {}
    provenance = None
    for path, report in zip(paths, reports):
        index = report['matrixRunIndex']
        assert report['runs'] == 1 and report['requestedRuns'] == 2 and report['repeatComparisonPending'] is True
        assert report['exactlyIdentical'] is None and report['deterministic'] is None, 'One worker cannot certify a repeat'
        assert report['comparison'] == capture.COMPARISON_POLICY and report['capturesPerRun'] == 102
        assert report['baseline']['appSha256'] == report['artifactIdentity']['appSha256']
        platform = report['baseline']['captureProvenance']
        comparable = {key: platform[key] for key in ('os', 'architecture', 'browserName', 'browserVersion', 'ci')}
        assert report['browserVersion'] == platform['browserVersion'] and platform['browserName'] == 'chromium'
        if provenance is None:
            provenance = comparable
        assert comparable == provenance, 'Workers used different browser/platform versions'
        raw = (path.parent / f'characterize-run-{index}.json').read_bytes()
        structured = json.loads(raw)
        diff = capture.first_difference(expected, structured)
        assert not diff, 'Characterization regression: ' + str(diff)
        assert report['captureSha256PerRun'] == [hashlib.sha256(json.dumps(structured, indent=2).encode()).hexdigest()]
        runs[index] = raw
        pixels[index] = json.loads((path.parent / f'characterize-pixels-{index}.json').read_text())
        assert len(pixels[index]) == 64 and set(pixels[index]) <= set(structured), 'Missing pixel diagnostics'
        identity = json.loads((path.parent / 'characterize-cache-identity.json').read_text())
        require_same_artifact([identity], report['artifactIdentity'])
        assert identity['sourceAppSha256'] == report['artifactIdentity']['appSha256'] and identity['requestedRuns'] == 2
        assert identity['elementCacheIdentityRuns'] == report['elementCacheIdentityRuns']
        assert len(report['elementCacheIdentityRuns']) == 1 and report['elementCacheIdentityRuns'][0]['run'] == index
        assert report['elementCacheIdentity'] == report['elementCacheIdentityRuns'][0]['elementCacheIdentity']
        validate_identity_contexts(report['elementCacheIdentity'])
        identity_runs[index] = report['elementCacheIdentityRuns'][0]
        pin = report['sessionCameraPin']
        assert len(pin) == 2 and [p['resizeBeforePin'] for p in pin] == [True, False]
        assert all(p['structuredIdentical'] is True and p['pixelsIdentical'] is True for p in pin)
        assert len(report['console']) == 16
        assert all(not c['errors'] and not capture.unexpected_console(c['console']) for c in report['console'].values())
    assert runs[1] == runs[2], 'Matrix runs must be exactly identical, even within golden float tolerance'
    assert pixels[1].keys() == pixels[2].keys(), 'Pixel diagnostic inventory differs'
    pixel_changes = sorted(key for key in pixels[1] if pixels[1][key] != pixels[2][key])
    by_index = {report['matrixRunIndex']: report for report in reports}
    evidence = {**by_index[2], 'runs': 2, 'exactlyIdentical': True, 'deterministic': True,
                'repeatComparisonPending': False,
                'captureSha256PerRun': [by_index[i]['captureSha256PerRun'][0] for i in (1, 2)],
                'elementCacheIdentityRuns': [identity_runs[i] for i in (1, 2)],
                'sameSessionPixelChanges': pixel_changes,
                'workerWallTimeSeconds': {str(i): by_index[i]['wallTimeSeconds'] for i in (1, 2)},
                'captureProvenancePerRun': [by_index[i]['baseline']['captureProvenance'] for i in (1, 2)],
                'method': 'Two independent CI workers; unchanged goldens with float-only tolerance; exact serialized repeat; eight identity contexts independently validated.'}
    for key in ('matrixRunIndex', 'wallTimeSeconds'):
        evidence.pop(key)
    output.mkdir(parents=True, exist_ok=True)
    for path, report in zip(paths, reports):
        index = report['matrixRunIndex']
        for stem in ('characterize-run', 'characterize-pixels'):
            shutil.copyfile(path.parent / f'{stem}-{index}.json', output / f'{stem}-{index}.json')
    (output / 'characterize-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n')
    (output / 'characterize-cache-identity.json').write_text(json.dumps({
        'artifactIdentity': evidence['artifactIdentity'], 'sourceAppSha256': evidence['baseline']['appSha256'],
        'requestedRuns': 2, 'elementCacheIdentityRuns': evidence['elementCacheIdentityRuns']}, indent=2) + '\n')
    print(f'[characterize-join] 2 exact repeats, 102 captures each, 8 composed identity contexts; {len(pixel_changes)} diagnostic pixel differences')
    return evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, default=capture.ROOT / 'out/test-artifacts/characterize')
    args = parser.parse_args()
    join_reports(args.input, args.output)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
