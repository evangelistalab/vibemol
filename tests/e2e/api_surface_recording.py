"""CI recording of an exact enumerated API delta; never an ordinary comparison waiver."""
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
CONNECTOR_MODE = 'connector-shell-dom-id'
CONNECTOR_REF = 'refs/heads/codex/connector-shell-recording'
CONNECTOR_DECLARATION = Path('tests/baselines/connector-shell-delta.json')
CONNECTOR_SOURCE = 'cd2b70dc3ef0c41b380d4e341f131cb4aec6d0d6'
CONNECTOR_TREE = '88f3e30c68c56eb72c7117bf2e9ac52defc96adf'
CONNECTOR_BASE = 'a4f4a753b31aae5ccbfa1e8c4e03939c281a5b99'
CONNECTOR_GOLDEN = 'fd5d9011685d44e1f7225afe05b9fbfed865e53f150f20d6e0be6743d15e43de'
CONNECTOR_ID = 'connectorPilotButton'


def declaration(value):
    assert set(value) == {'schemaVersion', 'baseCommit', 'baselineGzipSha256', 'captures', 'delta', 'authority'}, value
    assert type(value['schemaVersion']) is int and value['schemaVersion'] in (1, 2, 3) and type(value['captures']) is int and value['captures'] == 102, value
    assert re.fullmatch(r'[0-9a-f]{40}', value['baseCommit']), value
    assert re.fullmatch(r'[0-9a-f]{64}', value['baselineGzipSha256']), value
    assert isinstance(value['authority'], str) and value['authority'].strip(), value
    if value['schemaVersion'] == 3:
        assert value['baseCommit'] == CONNECTOR_BASE and value['baselineGzipSha256'] == CONNECTOR_GOLDEN, value
        assert value['delta'] == [dict(operation='add-dom-id', id=CONNECTOR_ID)], value
        return value
    deltas = [value['delta']] if value['schemaVersion'] == 1 else value['delta']
    assert isinstance(deltas,list) and deltas, value
    identities=set()
    for delta in deltas:
        assert type(delta) is dict, delta
        assert re.fullmatch(r'VibeMol[A-Za-z0-9_]+', delta.get('namespace','')), delta
        operation=delta.get('operation')
        if operation == 'remove-api-member' or (value['schemaVersion']==2 and operation=='add-api-member'):
            assert set(delta)=={'operation','namespace','member'},delta
            assert re.fullmatch(r'[A-Za-z_$][A-Za-z0-9_$]*',delta['member']),delta
            identity=(delta['namespace'],delta['member'])
        else:
            assert value['schemaVersion']==2 and operation=='add-api-namespace',delta
            assert set(delta)=={'operation','namespace','members'},delta
            members=delta['members']
            assert type(members) is list and members and all(type(m) is str and re.fullmatch(r'[A-Za-z_$][A-Za-z0-9_$]*',m) for m in members),delta
            assert members==sorted(set(members)),delta
            identity=(delta['namespace'],None)
        assert identity not in identities,('Repeated delta',identity)
        assert not any(ns==identity[0] and (member is None or identity[1] is None) for ns,member in identities),('Conflicting namespace deltas',identity)
        identities.add(identity)
    return value


def recording_mode(spec):
    if spec['schemaVersion'] == 3:
        return CONNECTOR_MODE
    return 'declared-api-removal' if spec['schemaVersion']==1 else 'declared-api-delta'


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
    """Legacy function name retained; schema2 is an exact declared API delta."""
    spec=declaration(spec)
    assert type(previous) is dict and len(previous)==spec['captures'],(len(previous),spec['captures'])
    expected,changes=copy.deepcopy(previous),[]
    deltas=[spec['delta']] if spec['schemaVersion']==1 else spec['delta']
    for name,capture in expected.items():
        for delta in deltas:
            if delta['operation'] == 'add-dom-id':
                ids = capture['dom']['ids']
                assert type(ids) is list and ids == sorted(set(ids)) and CONNECTOR_ID not in ids, (name, ids)
                ids.append(CONNECTOR_ID)
                ids.sort()
                changes.append(dict(capture=name, path=['dom', 'ids', ids.index(CONNECTOR_ID)], addedDomId=CONNECTOR_ID))
                continue
            namespace=delta['namespace']
            if delta['operation']=='remove-api-member':
                member=delta['member'];members=capture['api'][namespace]
                assert type(members) is list and members.count(member)==1,(name,namespace,member,members)
                members.remove(member)
                changes.append(dict(capture=name,path=['api',namespace],removedMember=member))
            elif delta['operation']=='add-api-member':
                member=delta['member'];members=capture['api'][namespace]
                assert type(members) is list and member not in members and members==sorted(set(members)),(name,namespace,member,members)
                members.append(member);members.sort()
                changes.append(dict(capture=name,path=['api',namespace],addedMember=member))
            else:
                assert namespace not in capture['api'],('Namespace already exists',name,namespace)
                capture['api'][namespace]=list(delta['members'])
                changes.append(dict(capture=name,path=['api',namespace],addedMembers=list(delta['members'])))
    assert len(changes)==102*len(deltas),changes
    return expected,changes


def verify_captures(previous, actual, spec):
    expected,changes=expected_removal(previous,spec)
    diff=exact_difference(expected,actual)
    deltas=[spec['delta']] if spec['schemaVersion']==1 else spec['delta']
    removal_count=102*sum(d['operation']=='remove-api-member' for d in deltas)
    namespace_count=102*sum(d['operation']=='add-api-namespace' for d in deltas)
    member_additions=102*sum(d['operation']=='add-api-member' for d in deltas)
    report=dict(delta=spec['delta'],expectedRemovals=removal_count,actualRemovals=sum('removedMember' in c for c in changes),
                expectedMemberAdditions=member_additions,actualMemberAdditions=sum('addedMember' in c for c in changes),expectedNamespaceAdditions=namespace_count,actualNamespaceAdditions=sum('addedMembers' in c for c in changes),
                changes=changes,residualDifference=diff,zeroOtherChanges=diff is None)
    if recording_mode(spec) == CONNECTOR_MODE:
        report.update(expectedDomIdAdditions=102, actualDomIdAdditions=len(changes) if diff is None else None)
    print('[declared-api-delta] '+json.dumps(report,sort_keys=True),flush=True)
    assert diff is None,('Undeclared capture change; refuse baseline recording',diff)
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
    recorder = git('rev-parse', 'HEAD')
    connector = recording_mode(spec) == CONNECTOR_MODE
    require_mode(dict(ci=os.environ.get('GITHUB_ACTIONS'),event=os.environ.get('GITHUB_EVENT_NAME'),
        head=recorder,githubSha=os.environ.get('GITHUB_SHA'),ref=os.environ.get('GITHUB_REF'),
        updateBaseline=args.update_baseline,injectHarness=args.inject_harness,prepareFixtures=args.prepare_fixtures,
        runs=args.runs,matrixRunIndex=args.matrix_run_index,releaseTag=args.record_release_tag,
        shallow=git('rev-parse','--is-shallow-repository')),recorder if connector else commit)
    if connector:
        assert commit == CONNECTOR_SOURCE and git('rev-parse', commit + '^{tree}') == CONNECTOR_TREE, commit
        assert git('rev-list', '--parents', '-n', '1', recorder).split() == [recorder, commit], recorder
        assert spec_path == CONNECTOR_DECLARATION and os.environ.get('GITHUB_REF') == CONNECTOR_REF, spec_path
        assert os.environ.get('GITHUB_RUN_ATTEMPT') == '1', 'Only the first recording attempt is authorized'
        assert os.environ.get('VIBEMOL_RECORDING_WORKER') in ('1', '2'), 'Require two identified recording workers'
    subprocess.run(['git','merge-base','--is-ancestor',spec['baseCommit'],commit],cwd=root,check=True)
    archived = require_exact_archive(root,source_root,commit)
    committed = subprocess.check_output(['git','show',recorder+':'+str(spec_path)],cwd=root)
    assert committed == (root/spec_path).read_bytes(), 'Declaration differs from recorder commit'
    if not connector:
        assert committed == (source_root/spec_path).read_bytes(), 'Declaration differs from tested source'
    previous = read_previous(root,spec)
    proof = dict(status='passed',recordingMode=recording_mode(spec),commit=commit,baseCommit=spec['baseCommit'],
        tree=git('rev-parse',commit+'^{tree}'),declaration=spec,declarationSha256=hashlib.sha256(committed).hexdigest(),
        archivedFiles=archived,allArchivedBlobsMatchCommit=True,sourceRefAtCapture=os.environ.get('GITHUB_REF'),
        ciRunId=os.environ.get('GITHUB_RUN_ID'),ciRunAttempt=os.environ.get('GITHUB_RUN_ATTEMPT'))
    if connector:
        proof.update(recorderCommit=recorder, recordingWorker=os.environ['VIBEMOL_RECORDING_WORKER'])
    Path(report_path).write_text(json.dumps(proof,indent=2)+'\n')
    return dict(commit=commit,tag=recording_mode(spec)), previous, spec


def compare(folder, root, declaration_path, commit):
    spec = declaration(json.loads(Path(declaration_path).read_text()))
    previous = read_previous(root,spec)
    captures, digests, jobs = [], [], []
    connector = recording_mode(spec) == CONNECTOR_MODE
    recorder_runs = set()
    for index in (1,2):
        artifact = Path(folder)/('characterization-baseline-'+str(index))
        proof = json.loads((artifact/'api-baseline-source.json').read_text())
        assert proof['status']=='passed' and proof['recordingMode']==recording_mode(spec),proof
        assert proof['commit']==commit and proof['declaration']==spec and proof['allArchivedBlobsMatchCommit'],proof
        golden = json.loads(gzip.decompress((artifact/'characterize.json.gz').read_bytes()))
        assert golden['baseline']['commit']==commit and golden['baseline']['tag']==recording_mode(spec),golden['baseline']
        provenance = golden['baseline']['captureProvenance']
        assert provenance['os']=='Linux' and provenance['ci']['provider']=='GitHub Actions',provenance
        if connector:
            assert proof['tree'] == CONNECTOR_TREE and proof['sourceRefAtCapture'] == CONNECTOR_REF, proof
            assert proof['recordingWorker'] == str(index) and proof['ciRunAttempt'] == '1', proof
            assert provenance['ci']['runAttempt'] == '1' and provenance['ci']['runUrl'].endswith('/' + proof['ciRunId']), provenance
            recorder_runs.add((proof['recorderCommit'], proof['ciRunId']))
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
        capturesPerRun=102,memberRemovalsPerRun=result['actualRemovals'],namespaceAdditionsPerRun=result['actualNamespaceAdditions'],residualDifferences=0,fourSerializationsExactlyIdentical=True,records=jobs)
    if connector:
        assert len(recorder_runs) == 1, recorder_runs
        recorder, run_id = recorder_runs.pop()
        report.update(sourceTree=CONNECTOR_TREE, recorderCommit=recorder, ciRunId=run_id,
                      domIdAdditionsPerRun=result['actualDomIdAdditions'])
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
