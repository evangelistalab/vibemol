"""Record exactly the approved right-dock layout changes on a dedicated CI branch."""
import argparse
import copy
import gzip
import hashlib
import json
import os
from collections import Counter
from pathlib import Path
import subprocess
from api_surface_recording import exact_difference, require_mode
from release_baseline_recording import require_exact_archive

BASE = '2d594bb6be90fd2893e3df8abbaf11c422616962'
BASE_DIGEST = '80c10198d1100f5bfdf6cb871474381914a7e97bc5d6a108f0a2c033fec42fe4'
SOURCE = 'd0eac338a07a33552e5b9bfc99826ce2fbf0d510'
MODE = 'layout-defaults'
REF = 'refs/heads/codex/record-right-panel-defaults-0.10.11'
DELTA_DIGEST = 'ded0c448ff4492a9b414997b63bb86e6277919bb81f93801809b69d2bcaeceac'
GOLDEN = 'tests/baselines/characterize.json.gz'
CATEGORIES = {'dom/controls': 844, 'render/viewport': 268, 'render/projection': 102}


def read_changes():
    raw = Path(__file__).with_name('right-dock-delta.json').read_bytes()
    assert hashlib.sha256(raw).hexdigest() == DELTA_DIGEST, 'Approved delta digest differs.'
    changes = json.loads(raw)
    assert len(changes) == 1214
    assert len({tuple(change['path']) for change in changes}) == 1214
    assert len({change['path'][0] for change in changes}) == 102
    assert Counter('/'.join(change['path'][1:3]) for change in changes) == CATEGORIES
    for change in changes:
        assert set(change) == {'path', 'before', 'after'}, change
        path = change['path']
        if path[1:3] == ['dom', 'controls']:
            assert len(path) == 5 and type(path[3]) is int and path[4] in ('ariaSelected', 'disabled', 'path', 'role'), path
        elif path[1:3] == ['render', 'viewport']:
            assert len(path) == 4 and path[3] in ('cssWidth', 'cssHeight', 'bufferWidth', 'bufferHeight'), path
        else:
            assert path[1:] == ['render', 'projection', 'matrix', 0], path
        assert exact_difference(change['before'], change['after']) is not None, change
    return changes


def expected_captures(previous):
    assert type(previous) is dict and len(previous) == 102
    expected = copy.deepcopy(previous)
    for change in read_changes():
        owner = expected
        for part in change['path'][:-1]:
            owner = owner[part]
        key = change['path'][-1]
        assert exact_difference(owner[key], change['before']) is None, change
        owner[key] = change['after']
    return expected


def read_previous(root):
    raw = subprocess.check_output(['git', 'show', BASE + ':' + GOLDEN], cwd=root)
    assert hashlib.sha256(raw).hexdigest() == BASE_DIGEST
    previous = json.loads(gzip.decompress(raw))['captures']
    expected_captures(previous)
    return previous


def verify(previous, actual):
    expected = expected_captures(previous)
    diff = exact_difference(expected, actual)
    report = dict(expectedChangedValues=1214, captures=102, categories=CATEGORIES,
                  residualDifference=diff, zeroOtherChanges=diff is None)
    print('[layout-defaults-delta] ' + json.dumps(report, sort_keys=True), flush=True)
    assert diff is None, ('Undeclared capture difference', diff)
    return report


def require_source(root, source_root, args, report_path):
    root, source_root = Path(root).resolve(), Path(source_root).resolve()
    commit = args.record_source_commit
    git = lambda *parts: subprocess.check_output(['git', *parts], cwd=root, text=True).strip()
    recorder = git('rev-parse', 'HEAD')
    assert args.record_layout_delta and not (args.record_api_delta or args.record_release_tag or args.record_cas_default)
    assert commit == SOURCE and git('rev-parse', 'HEAD^') == SOURCE
    require_mode(dict(ci=os.environ.get('GITHUB_ACTIONS'), event=os.environ.get('GITHUB_EVENT_NAME'),
        head=recorder, githubSha=os.environ.get('GITHUB_SHA'), ref=os.environ.get('GITHUB_REF'),
        updateBaseline=args.update_baseline, injectHarness=args.inject_harness, prepareFixtures=args.prepare_fixtures,
        runs=args.runs, matrixRunIndex=args.matrix_run_index, releaseTag=None,
        shallow=git('rev-parse', '--is-shallow-repository')), recorder)
    assert os.environ.get('GITHUB_REF') == REF
    subprocess.run(['git', 'merge-base', '--is-ancestor', BASE, commit], cwd=root, check=True)
    archived = require_exact_archive(root, source_root, commit)
    previous = read_previous(root)
    proof = dict(status='passed', recordingMode=MODE, commit=commit, recorderCheckout=recorder,
                 baseCommit=BASE, baselineGzipSha256=BASE_DIGEST, deltaSha256=DELTA_DIGEST,
                 tree=git('rev-parse', commit+'^{tree}'), archivedFiles=archived,
                 allArchivedBlobsMatchCommit=True, harnessInjection=False, fixturePreparation=False,
                 expectedChangedValues=1214, categories=CATEGORIES, sourceRefAtCapture=REF,
                 recordingWorker=os.environ.get('VIBEMOL_RECORDING_WORKER'),
                 ciRunId=os.environ.get('GITHUB_RUN_ID'), ciRunAttempt=os.environ.get('GITHUB_RUN_ATTEMPT'))
    assert proof['recordingWorker'] in ('1', '2') and proof['ciRunAttempt'] == '1'
    Path(report_path).write_text(json.dumps(proof, indent=2)+'\n')
    return dict(commit=commit, tag=MODE), previous


def compare(folder, root, commit):
    assert commit == SOURCE
    previous = read_previous(root)
    records, hashes, run_ids = [], set(), set()
    for worker in (1, 2):
        artifact = Path(folder)/f'characterization-baseline-{worker}'
        proof = json.loads((artifact/'layout-defaults-source.json').read_text())
        expected = dict(status='passed', recordingMode=MODE, commit=SOURCE, baseCommit=BASE,
                        baselineGzipSha256=BASE_DIGEST, deltaSha256=DELTA_DIGEST,
                        allArchivedBlobsMatchCommit=True, harnessInjection=False, fixturePreparation=False,
                        expectedChangedValues=1214, categories=CATEGORIES, sourceRefAtCapture=REF,
                        recordingWorker=str(worker), ciRunAttempt='1')
        assert {key: proof[key] for key in expected} == expected, proof
        run_ids.add(proof['ciRunId'])
        golden_raw = gzip.decompress((artifact/'characterize.json.gz').read_bytes())
        golden = json.loads(golden_raw)
        assert golden['baseline']['commit'] == SOURCE and golden['baseline']['tag'] == MODE
        assert golden['baseline']['captureProvenance']['os'] == 'Linux'
        summary = json.loads((artifact/'characterize-summary.json').read_text())
        assert summary['goldenSha256'] == hashlib.sha256(golden_raw).hexdigest()
        for number in (1, 2):
            raw = (artifact/f'characterize-run-{number}.json').read_bytes()
            captures = json.loads(raw)
            verify(previous, captures)
            assert exact_difference(golden['captures'], captures) is None
            receipt = json.loads((artifact/f'layout-defaults-delta-run-{number}.json').read_text())
            assert receipt == dict(expectedChangedValues=1214, captures=102, categories=CATEGORIES,
                                   residualDifference=None, zeroOtherChanges=True)
            digest = hashlib.sha256(raw).hexdigest()
            hashes.add(digest)
            records.append(dict(worker=worker, run=number, sha256=digest))
    assert len(hashes) == len(run_ids) == 1
    result = dict(status='passed', recordingMode=MODE, sourceCommit=SOURCE, baseCommit=BASE,
                  independentCiJobs=2, runsPerJob=2, capturesPerRun=102, changedValuesPerRun=1214,
                  categories=CATEGORIES, residualDifferences=0, fourSerializationsExactlyIdentical=True,
                  records=records)
    (Path(folder)/'ci-comparison.json').write_text(json.dumps(result, indent=2)+'\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder', type=Path)
    parser.add_argument('--expected-commit', required=True)
    args = parser.parse_args()
    print(json.dumps(compare(args.folder, Path(__file__).resolve().parents[2], args.expected_commit), indent=2))
