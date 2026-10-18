"""Temporary0.10.0 expected-metadata projection. Delete after the explicit post-ship baseline refresh."""
import copy
import hashlib
import json
from pathlib import Path
import re
import subprocess

CONTRACT_PATH='tests/baselines/release-version-mapping.json'
AUDIT_PATH='tests/baselines/evidence/release-0.10.0/preflight/version-field-consumers.json'
APP_VERSION_PATH='assets/app/js/asset-urls.js'
HARNESS_SCOPE_PATH='tests/baselines/release-accessibility-scope.json'
HARNESS_SCOPE={
    'releaseHead':'04eaf660607072b6f4bebafa3f8daef92a92afe8',
    'releaseTree':'d65e13321c8027fe555b992be4186b815a1e1be1',
    'diagnosticRun':39154813750,
    'authorization':'direct human: separate accessibility harness fix before0.10.0 publication; no production changes',
    'scope':'only the complete tree first adding this scope; same-tree merges; expires with release mapping',
}
FIXED_CONTRACT={
    'fromVersion':'0.9.5', 'toVersion':'0.10.0',
    'expectedCaptureCount':102, 'expectedMappedLeaves':204,
    'paths':[['session','appVersion'],['session','preset','appVersion']],
    'goldenSha256':'98c26a9db67b9e73a70b53628fb7b12763d41e91a303f9e3fa12f68af650be50',
    'scope':'only the complete tree of the commit first adding this contract; pure merge trees may match',
    'expires':'after0.10.0 ships: explicitly record0.10.0 CI goldens, then remove contract/helper/call',
    'authorization':'direct human; field-consumer audit confirms no behavioral read of saved appVersion values',
}


def authorized_release_tree(root, git, head_tree, original_tree):
    if head_tree == original_tree:
        return
    # The human subsequently required this separate harness-only fix before
    # publication. Pin its one complete tree by first creation too, rather than
    # turning the release exception into permission for future feature trees.
    path=root/HARNESS_SCOPE_PATH
    assert path.is_file(), dict(actualTree=head_tree,expectedReleaseTree=original_tree)
    actual=json.loads(path.read_text())
    assert actual==HARNESS_SCOPE, dict(actual=actual,expected=HARNESS_SCOPE)
    added=git('log','--diff-filter=A','--format=%H','--',HARNESS_SCOPE_PATH).splitlines()
    permitted_tree=git('rev-parse',added[0]+'^{tree}') if len(added)==1 else None
    changed=git('diff','--name-only',HARNESS_SCOPE['releaseHead'],'HEAD').splitlines()
    allowed={'AGENTS.md','docs/accessibility-qa.md','docs/refactor-release-retrospective.md',
        'tests/e2e/accessibility.py','tests/e2e/accessibility_contract.py',
        'tests/e2e/release_version_mapping.py','tests/unit/test_accessibility_contract.py',
        'tests/unit/test_release_version_mapping.py',HARNESS_SCOPE_PATH}
    unexpected=[p for p in changed if p not in allowed and
        not p.startswith('tests/baselines/evidence/release-0.10.0/')]
    comparands=dict(actualTree=head_tree,expectedHarnessTree=permitted_tree,
        actualCreationCommitCount=len(added),expectedCreationCommitCount=1,
        actualOriginalTree=original_tree,expectedOriginalTree=HARNESS_SCOPE['releaseTree'],
        actualChangedFiles=changed,actualUnexpectedFiles=unexpected,expectedUnexpectedFiles=[])
    print('[release-accessibility-scope] '+json.dumps(comparands,sort_keys=True),flush=True)
    assert len(added)==1 and head_tree==permitted_tree,comparands
    assert original_tree==HARNESS_SCOPE['releaseTree'] and unexpected==[],comparands


def map_metadata(captures):
    """Two full paths, one value pair, exactly204 leaves. No recursive name matching."""
    wrong=[];found=0
    for name,capture in captures.items():
        for path in FIXED_CONTRACT['paths']:
            owner=capture
            for key in path[:-1]:
                owner=owner.get(key) if isinstance(owner,dict) else None
            value=owner.get(path[-1]) if isinstance(owner,dict) else None
            if type(value) is str and value=='0.9.5':found+=1
            else:wrong.append(dict(capture=name,path=path,actual=value,expected='0.9.5',actualType=type(value).__name__,expectedType='str'))
    comparands=dict(actualCaptureCount=len(captures),expectedCaptureCount=102,
        actualMatchedLeaves=found,expectedMatchedLeaves=204,actualUnexpectedLeaves=wrong,expectedUnexpectedLeaves=[],
        paths=FIXED_CONTRACT['paths'],fromVersion='0.9.5',toVersion='0.10.0')
    print('[release-version-mapping] '+json.dumps(comparands,sort_keys=True),flush=True)
    assert len(captures)==102,comparands
    assert found==204,comparands
    assert wrong==[],comparands
    projected=copy.deepcopy(captures)
    for capture in projected.values():
        capture['session']['appVersion']='0.10.0'
        capture['session']['preset']['appVersion']='0.10.0'
    restored=copy.deepcopy(projected)
    for capture in restored.values():
        capture['session']['appVersion']='0.9.5'
        capture['session']['preset']['appVersion']='0.9.5'
    residual=json.dumps(restored,sort_keys=True,separators=(',',':'))!=json.dumps(captures,sort_keys=True,separators=(',',':'))
    residual_comparands=dict(actualResidualDifferences=int(residual),expectedResidualDifferences=0,mappedLeaves=found)
    print('[release-version-mapping-residual] '+json.dumps(residual_comparands,sort_keys=True),flush=True)
    assert not residual,residual_comparands
    return projected


def release_expectations(captures,source_root,golden_path):
    """Scope the exception to one immutable release tree, never a future feature commit."""
    root=Path(__file__).resolve().parents[2]
    contract_path=root/CONTRACT_PATH
    if not contract_path.exists():return captures
    if source_root.resolve()!=root:
        print('[release-version-scope] '+json.dumps(dict(actualSourceRoot=str(source_root.resolve()),
            eligibleReleaseRoot=str(root),mappingApplied=False,reason='Other source roots keep the unmodified comparison.')),flush=True)
        return captures
    contract=json.loads(contract_path.read_text())
    print('[release-version-contract] '+json.dumps(dict(actual=contract,expected=FIXED_CONTRACT),sort_keys=True),flush=True)
    assert contract==FIXED_CONTRACT,(contract,FIXED_CONTRACT)
    git=lambda *a:subprocess.check_output(['git',*a],cwd=root,text=True).strip()
    shallow=git('rev-parse','--is-shallow-repository')
    history_comparands=dict(actualShallowRepository=shallow,expectedShallowRepository='false')
    print('[release-version-history] '+json.dumps(history_comparands,sort_keys=True),flush=True)
    assert shallow=='false',history_comparands
    # Earliest creation, not last edit: touching this file cannot authorize a
    # future tree. Re-adding it later also fails the single-creation assertion.
    added=git('log','--diff-filter=A','--format=%H','--',CONTRACT_PATH).splitlines()
    head_tree=git('rev-parse','HEAD^{tree}')
    original_tree=git('rev-parse',added[0]+'^{tree}') if len(added)==1 else None
    version=re.search(r"const APP_VERSION = '([^']+)';",(source_root/APP_VERSION_PATH).read_text())
    declared=version.group(1) if version else None
    actual_sha=hashlib.sha256(Path(golden_path).read_bytes()).hexdigest()
    scope=dict(actualSourceRoot=str(source_root.resolve()),expectedSourceRoot=str(root),
        actualCreationCommits=added,actualCreationCommitCount=len(added),expectedCreationCommitCount=1,actualTree=head_tree,expectedReleaseTree=original_tree,
        actualDeclaredVersion=declared,expectedDeclaredVersion='0.10.0',actualGoldenSha256=actual_sha,
        expectedGoldenSha256=FIXED_CONTRACT['goldenSha256'])
    print('[release-version-scope] '+json.dumps(scope,sort_keys=True),flush=True)
    assert source_root.resolve()==root,scope
    assert len(added)==1,scope
    authorized_release_tree(root,git,head_tree,original_tree)
    assert declared=='0.10.0',scope
    assert actual_sha==FIXED_CONTRACT['goldenSha256'],scope
    audit=json.loads((root/AUDIT_PATH).read_text())
    approved_paths=['assets/app/js/app.js','assets/app/js/preset.js','assets/app/js/session.js',
        'assets/app/js/session-format.js','assets/app/js/structure-transport.js','api/vibemol_client.py']
    inventory_paths=[item['path'] for item in audit['inventory']]
    actual_hashes={item['path']:hashlib.sha256((root/item['path']).read_bytes()).hexdigest() for item in audit['inventory']}
    expected_hashes={item['path']:item['sha256'] for item in audit['inventory']}
    consumers=dict(actualBehavioralReads=audit['readsOfSavedAppVersionAffectBehavior'],expectedBehavioralReads=False,
        actualAuditedPaths=inventory_paths,expectedAuditedPaths=approved_paths,
        actualAuditedSourceHashes=actual_hashes,expectedAuditedSourceHashes=expected_hashes)
    print('[release-version-consumers] '+json.dumps(consumers,sort_keys=True),flush=True)
    assert audit['readsOfSavedAppVersionAffectBehavior'] is False,consumers
    assert inventory_paths==approved_paths,consumers
    assert actual_hashes==expected_hashes,consumers
    return map_metadata(captures)
