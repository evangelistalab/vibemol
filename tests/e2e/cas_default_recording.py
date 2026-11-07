"""Human-authorized CAS default recording; never an ordinary comparison exception."""
import argparse
import copy
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
from api_surface_recording import exact_difference, require_mode
from release_baseline_recording import require_exact_archive

BASE = 'e8437ceecc81806effcca61292047f4325b3920d'
BASE_DIGEST = 'adbc54eb5ab3e0e3d8bf30df399d7c30cc0fe332562d0ec953faca9a77c71b5f'
MODE = 'cas-default'
REF = 'refs/heads/codex/pr90-cas-default-recording'
IDS = ('avas-casElectrons', 'avas-casOrbitals')
RETAIN = ('sample/light/Calculations', 'sample/dark/Calculations')
GOLDEN = 'tests/baselines/characterize.json.gz'


def expected_captures(previous):
    assert type(previous) is dict and len(previous) == 102, 'Exactly102 original captures required'
    expected = copy.deepcopy(previous)
    methods, dom = [], []
    for name, capture in previous.items():
        paths = []
        for index, source in enumerate(capture['session']['sources']):
            options = source.get('recordState', {}).get('calculations', {}).get('options', {})
            if options.get('method') == 'cumulative':
                paths.append(['session', 'sources', index, 'recordState', 'calculations', 'options', 'method'])
        if not paths:
            continue
        ids = capture['dom']['ids']
        assert type(ids) is list and ids == sorted(set(ids)) and not set(IDS).intersection(ids), name
        expected[name]['dom']['ids'] = sorted(ids + list(IDS))
        dom.append(dict(capture=name, path=['dom', 'ids'], add=list(IDS)))
        if name in RETAIN:
            continue
        for path in paths:
            value = expected[name]
            for key in path[:-1]:
                value = value[key]
            assert value[path[-1]] == 'cumulative'
            value[path[-1]] = 'cas'
            methods.append(dict(capture=name, path=path, before='cumulative', after='cas'))
    assert len(methods) == 180 and len(dom) == 54, (len(methods), len(dom))
    assert all(name in previous for name in RETAIN)
    return expected, dict(methodChanges=methods, domIdChanges=dom)


def read_previous(root):
    raw = subprocess.check_output(['git', 'show', BASE + ':' + GOLDEN], cwd=root)
    assert hashlib.sha256(raw).hexdigest() == BASE_DIGEST, 'Immutable pre-default baseline digest'
    previous = json.loads(gzip.decompress(raw))['captures']
    expected_captures(previous)  # Declare every full path before a browser starts.
    return previous


def verify(previous, actual):
    expected, changes = expected_captures(previous)
    diff = exact_difference(expected, actual)
    methods = sum(_at(actual, [c['capture']] + c['path']) == 'cas' for c in changes['methodChanges'])
    additions = 0
    for change in changes['domIdChanges']:
        ids = _at(actual, [change['capture'], 'dom', 'ids'])
        ids = ids if type(ids) is list and all(type(value) is str for value in ids) else []
        additions += len(set(ids) - set(previous[change['capture']]['dom']['ids']))
    report = dict(expectedMethodLeaves=180, actualMethodLeaves=methods, expectedDomIdAdditions=108,
                  actualDomIdAdditions=additions, domCaptures=54, residualDifference=diff,
                  zeroOtherChanges=diff is None, **changes)
    print('[cas-default-delta] ' + json.dumps(report, sort_keys=True), flush=True)
    assert methods == 180 and additions == 108 and diff is None, report
    return report


def _at(value, path):
    try:
        for key in path:
            value = value[key]
    except (KeyError, IndexError, TypeError):
        return None
    return value


def require_source(root, source_root, args, report_path):
    root, source_root = Path(root).resolve(), Path(source_root).resolve()
    commit = args.record_source_commit
    git = lambda *parts: subprocess.check_output(['git', *parts], cwd=root, text=True).strip()
    assert args.record_cas_default and not (args.record_api_delta or args.record_release_tag)
    require_mode(dict(ci=os.environ.get('GITHUB_ACTIONS'), event=os.environ.get('GITHUB_EVENT_NAME'),
        head=git('rev-parse', 'HEAD'), githubSha=os.environ.get('GITHUB_SHA'), ref=os.environ.get('GITHUB_REF'),
        updateBaseline=args.update_baseline, injectHarness=args.inject_harness, prepareFixtures=args.prepare_fixtures,
        runs=args.runs, matrixRunIndex=args.matrix_run_index, releaseTag=None,
        shallow=git('rev-parse', '--is-shallow-repository')), commit)
    assert os.environ.get('GITHUB_REF') == REF, 'Dedicated authorized recording branch required'
    subprocess.run(['git', 'merge-base', '--is-ancestor', BASE, commit], cwd=root, check=True)
    count = require_exact_archive(root, source_root, commit)
    previous = read_previous(root)
    proof = dict(status='passed', recordingMode=MODE, commit=commit, baseCommit=BASE,
                 baselineGzipSha256=BASE_DIGEST, tree=git('rev-parse', commit+'^{tree}'),
                 archivedFiles=count, allArchivedBlobsMatchCommit=True, harnessInjection=False,
                 fixturePreparation=False, expectedMethodLeaves=180, expectedDomIdAdditions=108,
                 sourceRefAtCapture=REF, recordingWorker=os.environ.get('VIBEMOL_RECORDING_WORKER'),
                 ciRunId=os.environ.get('GITHUB_RUN_ID'), ciRunAttempt=os.environ.get('GITHUB_RUN_ATTEMPT'),
                 changes=expected_captures(previous)[1])
    assert proof['recordingWorker'] in ('1', '2') and proof['ciRunAttempt'] == '1'
    Path(report_path).write_text(json.dumps(proof, indent=2)+'\n')
    return dict(commit=commit, tag=MODE), previous


def compare(folder, root, commit):
    previous = read_previous(root)
    values, hashes, jobs = [], [], []
    for job in (1, 2):
        artifact = Path(folder)/f'characterization-baseline-{job}'
        proof = json.loads((artifact/'cas-default-source.json').read_text())
        assert proof['status'] == 'passed' and proof['recordingMode'] == MODE and proof['commit'] == commit
        assert proof['baseCommit'] == BASE and proof['baselineGzipSha256'] == BASE_DIGEST
        assert proof['allArchivedBlobsMatchCommit'] and not proof['harnessInjection'] and not proof['fixturePreparation']
        assert proof['expectedMethodLeaves'] == 180 and proof['expectedDomIdAdditions'] == 108
        assert proof['sourceRefAtCapture'] == REF and proof['recordingWorker'] == str(job) and proof['ciRunAttempt'] == '1'
        assert exact_difference(proof['changes'], expected_captures(previous)[1]) is None
        golden = json.loads(gzip.decompress((artifact/'characterize.json.gz').read_bytes()))
        assert golden['baseline']['commit'] == commit and golden['baseline']['tag'] == MODE
        provenance = golden['baseline']['captureProvenance']
        assert provenance['os'] == 'Linux' and provenance['ci']['provider'] == 'GitHub Actions'
        summary = json.loads((artifact/'characterize-summary.json').read_text())
        assert summary['api'] == next(iter(golden['captures'].values()))['api']
        assert summary['goldenSha256'] == hashlib.sha256(gzip.decompress((artifact/'characterize.json.gz').read_bytes())).hexdigest()
        for run in (1, 2):
            raw = (artifact/f'characterize-run-{run}.json').read_bytes()
            current = json.loads(raw)
            verify(previous, current)
            assert exact_difference(golden['captures'], current) is None
            values.append(current); hashes.append(hashlib.sha256(raw).hexdigest())
            jobs.append(dict(job=job, run=run, sha256=hashes[-1]))
    assert all(exact_difference(values[0], value) is None for value in values)
    assert len(set(hashes)) == 1, 'Four raw serializations must be identical'
    report = dict(status='passed', recordingMode=MODE, sourceCommit=commit, baseCommit=BASE,
                  independentCiJobs=2, runsPerJob=2, capturesPerRun=102, methodLeavesPerRun=180,
                  domIdAdditionsPerRun=108, residualDifferences=0, fourSerializationsExactlyIdentical=True, records=jobs)
    (Path(folder)/'ci-comparison.json').write_text(json.dumps(report, indent=2)+'\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder', type=Path)
    parser.add_argument('--expected-commit', required=True)
    args = parser.parse_args()
    print(json.dumps(compare(args.folder, Path(__file__).resolve().parents[2], args.expected_commit), indent=2))
