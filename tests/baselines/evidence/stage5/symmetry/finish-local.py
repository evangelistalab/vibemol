"""Read back completed evidence independently; never starts a browser or repeats tests."""
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT=Path('/Users/fevange/Source/vibemol');OUT=ROOT/'out/test-artifacts/stage5/symmetry';WORK=OUT/'source-worktree'
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
git_bytes=lambda ref,p:subprocess.check_output(['git','show',ref+':'+p],cwd=WORK)
phase=read(OUT/'characterize-phase.json');assert phase['status']=='passed'
app_sha=sha(WORK/'assets/app/js/app.js');module_sha=sha(WORK/'assets/app/js/symmetry-panel.js')
assert phase['sourceAppSha256']==app_sha
audit=read(OUT/'source-audit/source-audit.json');assert audit['status']=='passed' and all(x['passed'] for x in audit['checks'])
assert audit['sourceHashes']['proposedAppSha256']==app_sha and audit['sourceHashes']['proposedModuleSha256']==module_sha
recount=read(OUT/'factory-recount.json')
assert {x['name']:x['dependencyCount'] for x in recount}==dict(createPeriodicTableController=11,createPubChemController=13,createTrajectoryPlaybackController=8,createVibrationController=13,createSymmetryPanelController=11)
assert all(x['allUsed'] for x in recount)
diff=read(OUT/'differential/result.json');assert diff['status']=='passed' and diff['allComparandsExact']
assert diff['moduleSha256']==module_sha and diff['scenarios']==16 and diff['checkpoints']==624 and diff['constructorDependencyCalls']==0
native=read(OUT/'native/comparison.json');assert native['taggedCollectorExitCode']==native['proposedCollectorExitCode']==0
assert native['proposedAppSha256']==app_sha and native['caseObservationsExactlyEqual'] and len(native['cases'])==4
assert all(x['status']=='passed' and not x['pageErrors'] for x in native['cases'])
tag='1c609b338344aaa49ffd11b9ee2ad834a6e0d85d';tag_root=ROOT/'out/test-artifacts/stage4/pubchem/tagged-source'
assert native['taggedAppSha256']==hashlib.sha256(git_bytes(tag,'assets/app/js/app.js')).hexdigest()
for file in ['assets/app/js/app.js','index.html','assets/app/js/symmetry.js','assets/app/js/trajectory-video.js']:
    assert (tag_root/file).read_bytes()==git_bytes(tag,file)
order=read(OUT/'construction-order.json');assert order['status']=='passed' and order['toolSha256']==sha(WORK/'tools/audit-construction-order.cjs')
assert all(s['status']=='passed' and s['matchesExpectedStatus'] for s in order['stages'])
assert order['stages'][-1]['afterSha256']==app_sha and order['stages'][-1]['modules'][0]['sha256']==module_sha
assert len(order['stages'][-1]['bindings'])==27 and sum(len(m['bindings']) for m in order['stages'][-1]['modules'])==125
unit=(OUT/'check-unit.log').read_text();assert re.search(r'(?:#|ℹ) tests 433\b',unit) and re.search(r'(?:#|ℹ) fail 0\b',unit)
assert 'Ran 39 tests' in unit and '\nOK\n' in unit and 'git diff --check' in unit
os.environ['VIBEMOL_TEST_ARTIFACT_DIR']=str(OUT/'readback');sys.path.insert(0,str(WORK/'tests/e2e'))
import characterize as c
e=read(OUT/'characterize/characterize-evidence.json')
assert e['runs']==2 and e['capturesPerRun']==102 and e['exactlyIdentical'] and e['deterministic'] and e['baseline']['appSha256']==app_sha
assert (OUT/'characterize/characterize-run-1.json').read_bytes()==(OUT/'characterize/characterize-run-2.json').read_bytes()
assert c.BASELINE.read_bytes()==git_bytes(audit['baseline'],'tests/baselines/characterize.json.gz')
expected=c.expected_captures(json.loads(gzip.decompress(c.BASELINE.read_bytes())),WORK)
for index in [1,2]:
    difference=c.first_difference(expected,read(OUT/f'characterize/characterize-run-{index}.json'))
    assert difference is None,difference
counts=[]
for run in e['elementCacheIdentityRuns']:
    for ctx in run['elementCacheIdentity']:
        measured=c.assert_element_cache_exercise(ctx['identity'],ctx['modes'],ctx['panelOpenClosePairs']);assert measured==ctx['exercise']
        absent={key:dict(id=key.removesuffix('El'),issue=15,cached='null') for key in ['editAtomsMenuEl','editAtomsMenuBodyEl','editAtomsMenuCurrentEl','editSelectionFragmentCuePopoverEl']}
        if ctx['launch']=='workbench':absent['elementColorBtn']=dict(id='elementColorBtn',issue=14,cached='detached')
        assert ctx['identity']['knownAbsent']==absent
        counts.append(dict(run=run['run'],launch=ctx['launch'],theme=ctx['theme'],nodeCount=ctx['identity']['nodeCount'],composition=ctx['identity']['composition'],**measured))
assert len(counts)==8
native_seconds=sum(read(OUT/'native'/label/'result.json')['seconds'] for label in ['tagged-base','proposed'])
local=dict(status='local verification complete',group='5c symmetry presentation',base=audit['baseline'],appSha256=app_sha,moduleSha256=module_sha,qaSha256=sha(WORK/'assets/app/js/qa-characterize.js'),
 trackedLetBefore=256,trackedLetAfter=249,metrics=audit['metrics'],controllerInputs=[d['name'] for d in audit['dependencies']],controllerDependencyCount=11,periodicFactoryDependencyCount=11,
 sourceAudit=dict(status='passed',checks=len(audit['checks']),proof=audit['proof']),differential=dict(status='passed',scenarios=16,checkpoints=624,constructorDependencyCalls=0,realAnalysisModule=True),
 manualMatrix=dict(status='passed',contexts=8,taggedContexts=4,proposedContexts=4,comparandsExactAcrossSources=True,seconds=native_seconds,harnessSha256=sha(OUT/'native-matrix.py'),workflows=['tolerances','preview/cancel','apply/Undo','Auto/Undo','element guide','mode suspension/return','keyboard','shared launcher','responsive390','native session save/load','file scene change']),
 constructionOrder=dict(status='passed',appBindings=27,moduleBindings=125,toolSha256=order['toolSha256']),checksAndUnit=dict(status='passed',js=433,python=39),
 characterization=dict(status='passed',runs=2,captures=102,exactSerializedRepeat=True,goldensUnchanged=True,identityContexts=8,identityCounts=counts,pixelChanges=e['sameSessionPixelChanges'],seconds=e['wallTimeSeconds'],browserVersion=e['browserVersion']),
 ordinaryGate=dict(passed=33,failed=4,total=37,workflowKeys='exact four manifest keys; over-performance stops'),issue11=dict(hypothesis='refuted',productDefectOpen=True,exporterSourcesUnchanged=True,gatePolicy='ordinary workflow permits either second-download idle site; the extra signature stop was scoped to5a/5b'),
 ci='pending own first automatic ordinary full conjunction',harnessChanges='No shipped browser assertion or wait changes. Scope the extra5a/5b exporter policy correctly; remove ineffective feature-cache prime; record shared integration cache and require actual next-PR restores.',
 collectorDiagnostics='Preserve two interrupted tagged-control interaction mistakes: sidebar remained collapsed after390px; session correctly restored View before Edit-only Symmetry check. Corrected same native collector reopens sidebar and enters Edit, logs both comparands, then passes8cases. Differential initially omitted real element-utils dependency; bootstrap log retained. No production source or shipped assertion was relaxed.')
(OUT/'local-validation.json').write_text(json.dumps(local,indent=2)+'\n')
dest=WORK/'tests/baselines/evidence/stage5/symmetry';dest.mkdir(parents=True,exist_ok=True)
for name in ['local-validation.json','audit-source.cjs','differential.cjs','native-matrix.py','run-paired-native.py','run-characterize.py','finish-local.py','factory-recount.cjs','factory-recount.json','preflight.cjs','preflight-next-boundary.json']:
    shutil.copy2(OUT/name,dest/name)
for name in ['source-audit/source-audit.json','differential/result.json','native/comparison.json','native/tagged-base/result.json','native/proposed/result.json','construction-order.json','characterize-phase.json','integration-cache-verification.json']:
    path=dest/(name+'.gz');path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(gzip.compress((OUT/name).read_bytes(),mtime=0))
for name in ['check-unit.log','native-matrix.log','differential.log','construction-order.log','characterize.log']:
    (dest/(name+'.gz')).write_bytes(gzip.compress((OUT/name).read_bytes(),mtime=0))
for name in ['characterize-evidence.json','characterize-cache-identity.json','characterize-run-1.json','characterize-run-2.json','characterize-pixels-1.json','characterize-pixels-2.json']:
    d=dest/'characterize';d.mkdir(exist_ok=True);(d/(name+'.gz')).write_bytes(gzip.compress((OUT/'characterize'/name).read_bytes(),mtime=0))
for dirname in ['native-sidebar-collapsed-diagnostic','native-session-mode-diagnostic']:
    for path in sorted((OUT/dirname).rglob('*')):
        if path.is_file() and path.suffix in ['.json','.log','.py']:
            target=dest/'collector-diagnostics'/dirname/path.relative_to(OUT/dirname);target.parent.mkdir(parents=True,exist_ok=True);target.with_name(target.name+'.gz').write_bytes(gzip.compress(path.read_bytes(),mtime=0))
for name in ['differential-missing-element-utils.log','construction-order-bootstrap-missing-babel.log']:
    p=dest/'collector-diagnostics'/(name+'.gz');p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(gzip.compress((OUT/name).read_bytes(),mtime=0))
hashes={str(p.relative_to(dest)):sha(p) for p in sorted(dest.rglob('*')) if p.is_file() and p.name!='durable-file-hashes.json'}
(dest/'durable-file-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n');assert all(sha(dest/name)==value for name,value in hashes.items())
(WORK/'tests/baselines/symmetry-presentation-validation.json').write_text(json.dumps(local,indent=2)+'\n')
assert app_sha==sha(WORK/'assets/app/js/app.js') and module_sha==sha(WORK/'assets/app/js/symmetry-panel.js')
print(json.dumps(dict(status=local['status'],letAfter=249,deps=11,sourceChecks=len(audit['checks']),nativeContexts=8,nativeSeconds=native_seconds,characterizeSeconds=e['wallTimeSeconds'],goldens=102,runs=2,identityContexts=8),indent=2))
