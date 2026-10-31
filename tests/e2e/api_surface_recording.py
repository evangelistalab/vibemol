"""CI recording of a declared API-member removal; never an ordinary comparison waiver."""
import argparse
import copy
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

GOLDEN = 'tests/baselines/characterize.json.gz'


def declaration(value):
    assert set(value) == {'schemaVersion', 'baseCommit', 'baselineGzipSha256', 'captures', 'delta', 'authority'}, value
    assert type(value['schemaVersion']) is int and value['schemaVersion'] == 1 and type(value['captures']) is int and value['captures'] == 102, value
    assert re.fullmatch(r'[0-9a-f]{40}', value['baseCommit']), value
    assert re.fullmatch(r'[0-9a-f]{64}', value['baselineGzipSha256']), value
    delta = value['delta']
    assert set(delta) == {'operation', 'namespace', 'member'}, delta
    assert delta['operation'] == 'remove-api-member', delta
    assert re.fullmatch(r'VibeMol[A-Za-z0-9_]+', delta['namespace']), delta
    assert re.fullmatch(r'[A-Za-z_$][A-Za-z0-9_$]*', delta['member']), delta
    assert isinstance(value['authority'], str) and value['authority'].strip(), value
    return value


def exact_difference(expected, actual, path=()):
    """No float tolerance, bool/int coercion, ignored keys or version mapping."""
    if type(expected) is not type(actual):
        return dict(path=list(path), expectedType=type(expected).__name__, actualType=type(actual).__name__)
    if isinstance(expected, dict):
        if set(expected) != set(actual):
            return dict(path=list(path), missing=sorted(set(expected)-set(actual)), added=sorted(set(actual)-set(expected)))
        for key in expected:
            diff = exact_difference(expected[key], actual[key], path+(key,))
            if diff: return diff
    elif isinstance(expected, list):
        if len(expected) != len(actual):
            return dict(path=list(path), expectedLength=len(expected), actualLength=len(actual))
        for index, (left, right) in enumerate(zip(expected, actual)):
            diff = exact_difference(left, right, path+(index,))
            if diff: return diff
    elif expected != actual or (isinstance(expected,float) and expected.hex()!=actual.hex()):
        return dict(path=list(path), expected=expected, actual=actual)
    return None


def expected_removal(previous, spec):
    spec = declaration(spec)
    assert type(previous) is dict and len(previous) == spec['captures'], (len(previous), spec['captures'])
    expected, removals = copy.deepcopy(previous), []
    namespace, member = spec['delta']['namespace'], spec['delta']['member']
    for name, capture in expected.items():
        members = capture['api'][namespace]
        assert type(members) is list and members.count(member) == 1, (name, namespace, member, members)
        members.remove(member)
        removals.append(dict(capture=name, path=['api', namespace], removedMember=member))
    assert len(removals) == 102, removals
    return expected, removals


def verify_captures(previous, actual, spec):
    expected, removals = expected_removal(previous, spec)
    diff = exact_difference(expected, actual)
    report = dict(delta=spec['delta'], expectedRemovals=102, actualRemovals=len(removals),
                  removals=removals, residualDifference=diff, zeroOtherChanges=diff is None)
    print('[declared-api-delta] '+json.dumps(report, sort_keys=True), flush=True)
    assert diff is None, ('Undeclared capture change; refuse baseline recording', diff)
    return report


def read_previous(root, spec):
    spec = declaration(spec)
    raw = subprocess.check_output(['git', 'show', spec['baseCommit']+':'+GOLDEN], cwd=root)
    assert hashlib.sha256(raw).hexdigest() == spec['baselineGzipSha256'], 'Immutable previous baseline digest differs'
    previous = json.loads(gzip.decompress(raw))['captures']
    expected_removal(previous, spec)  # Declare/validate the complete delta before any browser starts.
    return previous


def require_mode(actual, commit):
    expected = dict(ci='true', event='workflow_dispatch', head=commit, githubSha=commit,
                    updateBaseline=True, injectHarness=False, prepareFixtures=False, runs=2, matrixRunIndex=None,
                    releaseTag=None, shallow='false')
    mode = dict(actual)
    ref = mode.pop('ref')
    print('[api-recording-mode] '+json.dumps(dict(actual=mode, expected=expected, ref=ref),sort_keys=True),flush=True)
    assert re.fullmatch(r'[0-9a-f]{40}', commit or ''), 'Full immutable source commit required'
    assert isinstance(ref,str) and ref.startswith('refs/heads/'), 'API recording must run on an ordinary branch'
    assert mode == expected, (mode, expected)


def require_source(root, source_root, args, report_path):
    from release_baseline_recording import require_exact_archive
    root, source_root = Path(root).resolve(), Path(source_root).resolve()
    spec_path = Path(args.record_api_delta)
    assert not spec_path.is_absolute() and '..' not in spec_path.parts, 'Declaration must be a tracked relative path'
    spec = declaration(json.loads((root/spec_path).read_text()))
    commit = args.record_source_commit
    git = lambda *parts: subprocess.check_output(['git', *parts],cwd=root,text=True).strip()
    require_mode(dict(ci=os.environ.get('GITHUB_ACTIONS'),event=os.environ.get('GITHUB_EVENT_NAME'),
        head=git('rev-parse','HEAD'),githubSha=os.environ.get('GITHUB_SHA'),ref=os.environ.get('GITHUB_REF'),
        updateBaseline=args.update_baseline,injectHarness=args.inject_harness,prepareFixtures=args.prepare_fixtures,
        runs=args.runs,matrixRunIndex=args.matrix_run_index,releaseTag=args.record_release_tag,
        shallow=git('rev-parse','--is-shallow-repository')),commit)
    subprocess.run(['git','merge-base','--is-ancestor',spec['baseCommit'],commit],cwd=root,check=True)
    archived = require_exact_archive(root,source_root,commit)
    committed = subprocess.check_output(['git','show',commit+':'+str(spec_path)],cwd=root)
    assert committed == (root/spec_path).read_bytes() == (source_root/spec_path).read_bytes(), 'Declaration differs from tested source'
    previous = read_previous(root,spec)
    proof = dict(status='passed',recordingMode='declared-api-removal',commit=commit,baseCommit=spec['baseCommit'],
        tree=git('rev-parse',commit+'^{tree}'),declaration=spec,declarationSha256=hashlib.sha256(committed).hexdigest(),
        archivedFiles=archived,allArchivedBlobsMatchCommit=True,sourceRefAtCapture=os.environ.get('GITHUB_REF'),
        ciRunId=os.environ.get('GITHUB_RUN_ID'),ciRunAttempt=os.environ.get('GITHUB_RUN_ATTEMPT'))
    Path(report_path).write_text(json.dumps(proof,indent=2)+'\n')
    return dict(commit=commit,tag='declared-api-removal'), previous, spec


def compare(folder, root, declaration_path, commit):
    spec = declaration(json.loads(Path(declaration_path).read_text()))
    previous = read_previous(root,spec)
    captures, digests, jobs = [], [], []
    for index in (1,2):
        artifact = Path(folder)/('characterization-baseline-'+str(index))
        proof = json.loads((artifact/'api-baseline-source.json').read_text())
        assert proof['status']=='passed' and proof['recordingMode']=='declared-api-removal',proof
        assert proof['commit']==commit and proof['declaration']==spec and proof['allArchivedBlobsMatchCommit'],proof
        golden = json.loads(gzip.decompress((artifact/'characterize.json.gz').read_bytes()))
        assert golden['baseline']['commit']==commit and golden['baseline']['tag']=='declared-api-removal',golden['baseline']
        provenance = golden['baseline']['captureProvenance']
        assert provenance['os']=='Linux' and provenance['ci']['provider']=='GitHub Actions',provenance
        summary=json.loads((artifact/'characterize-summary.json').read_text())
        assert summary['api']==next(iter(golden['captures'].values()))['api'], 'Summary does not match actual captures'
        assert summary['goldenSha256']==hashlib.sha256(gzip.decompress((artifact/'characterize.json.gz').read_bytes())).hexdigest()
        for run in (1,2):
            raw=(artifact/f'characterize-run-{run}.json').read_bytes()
            current=json.loads(raw)
            result=verify_captures(previous,current,spec)
            assert exact_difference(golden['captures'],current) is None,'Promoted golden differs from the raw capture'
            captures.append(current);digests.append(hashlib.sha256(raw).hexdigest())
            jobs.append(dict(job=index,run=run,sha256=digests[-1],deltaVerified=result['zeroOtherChanges']))
    assert all(exact_difference(captures[0],c) is None for c in captures), 'Independent CI recordings differ'
    assert len(set(digests))==1, 'The four raw serializations must repeat exactly'
    report=dict(status='passed',sourceCommit=commit,declaration=spec,independentCiJobs=2,runsPerJob=2,
        capturesPerRun=102,memberRemovalsPerRun=102,residualDifferences=0,fourSerializationsExactlyIdentical=True,records=jobs)
    (Path(folder)/'ci-comparison.json').write_text(json.dumps(report,indent=2)+'\n')
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder',type=Path)
    parser.add_argument('--declaration',type=Path,required=True)
    parser.add_argument('--expected-commit',required=True)
    args=parser.parse_args()
    print(json.dumps(compare(args.folder,Path(__file__).resolve().parents[2],args.declaration,args.expected_commit),indent=2))


if __name__=='__main__':main()
