"""Independent readback and durable preservation; no new browser or test invocation."""
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT=Path('/Users/fevange/Source/vibemol');OUT=ROOT/'out/test-artifacts/stage5/vibration';WORK=OUT/'source-worktree'
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
git_bytes=lambda ref,p:subprocess.check_output(['git','show',ref+':'+p],cwd=WORK)
phase=read(OUT/'characterize-phase.json');assert phase['status']=='passed'
app_sha=sha(WORK/'assets/app/js/app.js');module_sha=sha(WORK/'assets/app/js/vibration.js')
assert phase['sourceAppSha256']==app_sha
audit=read(OUT/'source-audit-prefreeze-final/source-audit.json')
assert audit['status']=='passed' and all(x['passed'] for x in audit['checks'])
assert audit['sourceHashes']['proposedAppSha256']==app_sha and audit['sourceHashes']['proposedModuleSha256']==module_sha
recount=read(OUT/'factory-recount.json')
assert {x['name']:x['dependencyCount'] for x in recount}==dict(createPeriodicTableController=11,createPubChemController=13,createTrajectoryPlaybackController=8,createVibrationController=13)
assert all(x['allUsed'] for x in recount)
differential=read(OUT/'differential.json');assert differential['status']=='passed'
assert differential['sourceHashes']['afterApp']==app_sha and differential['sourceHashes']['module']==module_sha
assert differential['scenarioCount']==54 and differential['checkpointCount']==1659 and differential['constructorDependencyCalls']==[]
native=read(OUT/'native-report.json')
assert native['status']=='passed' and len(native['cases'])==8 and native['comparandsExactAcrossSources']
assert native['harnessSha256']==sha(OUT/'native-matrix.py') and native['sourceAppHashes']['proposed']==app_sha
tag='1c609b338344aaa49ffd11b9ee2ad834a6e0d85d';tag_root=ROOT/'out/test-artifacts/stage4/pubchem/tagged-source'
assert native['sourceAppHashes']['tagged']==hashlib.sha256(git_bytes(tag,'assets/app/js/app.js')).hexdigest()
for file in ['assets/app/js/app.js','index.html','assets/app/js/trajectory-clock.js','assets/app/js/trajectory-video.js','assets/app/js/symmetry.js']:
    assert (tag_root/file).read_bytes()==git_bytes(tag,file)
before=[c for c in native['cases'] if c['source']=='tagged'];after=[c for c in native['cases'] if c['source']=='proposed']
assert [(c['launch'],c['theme']) for c in before]==[(c['launch'],c['theme']) for c in after]
assert all(x['checks']==y['checks'] for x,y in zip(before,after))
order=read(OUT/'construction-order.json')
assert order['status']=='passed' and order['toolSha256']==sha(WORK/'tools/audit-construction-order.cjs')
assert all(s['status']=='passed' and s['matchesExpectedStatus'] for s in order['stages'])
assert order['stages'][-1]['afterSha256']==app_sha and order['stages'][-1]['modules'][0]['sha256']==module_sha
assert len(order['stages'][-1]['bindings'])==16 and sum(len(m['bindings']) for m in order['stages'][-1]['modules'])==161
unit=(OUT/'unit.log').read_text();assert re.search(r'(?:#|ℹ) tests 433\b',unit) and re.search(r'(?:#|ℹ) fail 0\b',unit)
assert 'Ran 36 tests' in unit and '\nOK\n' in unit
assert 'git diff --check' in (OUT/'check.log').read_text() and 'Traceback' not in (OUT/'check.log').read_text()
os.environ['VIBEMOL_TEST_ARTIFACT_DIR']=str(OUT/'readback')
sys.path.insert(0,str(WORK/'tests/e2e'))
import characterize as c
e=read(OUT/'characterize/characterize-evidence.json')
assert e['runs']==2 and e['capturesPerRun']==102 and e['exactlyIdentical'] and e['deterministic']
assert e['baseline']['appSha256']==app_sha
assert (OUT/'characterize/characterize-run-1.json').read_bytes()==(OUT/'characterize/characterize-run-2.json').read_bytes()
assert c.BASELINE.read_bytes()==git_bytes(audit['baseline'],'tests/baselines/characterize.json.gz')
expected=c.expected_captures(json.loads(gzip.decompress(c.BASELINE.read_bytes())),WORK)
for index in [1,2]:
    actual=read(OUT/f'characterize/characterize-run-{index}.json')
    difference=c.first_difference(expected,actual)
    assert difference is None,difference
counts=[]
for run in e['elementCacheIdentityRuns']:
    for ctx in run['elementCacheIdentity']:
        measured=c.assert_element_cache_exercise(ctx['identity'],ctx['modes'],ctx['panelOpenClosePairs'])
        assert measured==ctx['exercise']
        absent={key:dict(id=key.removesuffix('El'),issue=15,cached='null') for key in ['editAtomsMenuEl','editAtomsMenuBodyEl','editAtomsMenuCurrentEl','editSelectionFragmentCuePopoverEl']}
        if ctx['launch']=='workbench':absent['elementColorBtn']=dict(id='elementColorBtn',issue=14,cached='detached')
        assert ctx['identity']['knownAbsent']==absent
        counts.append(dict(run=run['run'],launch=ctx['launch'],theme=ctx['theme'],nodeCount=ctx['identity']['nodeCount'],composition=ctx['identity']['composition'],**measured))
assert len(counts)==8
assert app_sha==sha(WORK/'assets/app/js/app.js') and module_sha==sha(WORK/'assets/app/js/vibration.js')
local=dict(status='local verification complete',group='5b vibration runtime/panel',base=audit['baseline'],appSha256=app_sha,moduleSha256=module_sha,
    qaSha256=sha(WORK/'assets/app/js/qa-characterize.js'),trackedLetBefore=260,trackedLetAfter=256,metrics=audit['metrics'],
    controllerInputs=[d['name'] for d in audit['dependencies']],controllerDependencyCount=13,periodicFactoryDependencyCount=11,
    sourceAudit=dict(status='passed',checks=len(audit['checks']),proof=audit['proof']),
    differential=dict(status='passed',scenarios=54,checkpoints=1659,constructorDependencyCalls=0),
    manualMatrix=dict(status='passed',contexts=8,taggedContexts=4,proposedContexts=4,comparandsExactAcrossSources=True,seconds=native['seconds'],harnessSha256=native['harnessSha256'],exporterCoverage=native['exporterCoverage']),
    constructionOrder=dict(status='passed',appBindings=16,moduleBindings=161,toolSha256=order['toolSha256']),
    checksAndUnit=dict(status='passed',js=433,python=36),
    characterization=dict(status='passed',runs=2,captures=102,exactSerializedRepeat=True,goldensUnchanged=True,identityContexts=8,identityCounts=counts,pixelChanges=e['sameSessionPixelChanges'],seconds=e['wallTimeSeconds'],browserVersion=e['browserVersion']),
    ordinaryGate=dict(passed=33,failed=4,total=37,workflowKeys='Exact four manifest keys; over-performance is a stop'),
    issue11=dict(hypothesis='refuted',productDefectOpen=True,gatePolicy='Changed site/shape/disappearance during5b is a stop',referenceCi=39086927339,expectedWorkflow=dict(id='issue-11-stop-after-second-download',site='trajectory')),
    ci='Pending own first automatic ordinary conjunction; no retry supplies acceptance',
    harnessChanges='Directly authorized33/4/37 exact workflow set and over-performance rejection; shipped320px assertion gains comparand logging only; browser cache warmup fixes ref scope with identical keys.',
    collectorDiagnostics='Preserved initial native helper left recorder/download stubs active for session save; corrected collector restores browser facilities. Audit normalizers initially omitted destructuring holes/source-range metadata. No product failure, source expectation, shipped comparison, wait or tolerance was relaxed.')
(OUT/'local-validation.json').write_text(json.dumps(local,indent=2)+'\n')
dest=WORK/'tests/baselines/evidence/stage5/vibration';dest.mkdir(parents=True,exist_ok=True)
for name in ['local-validation.json','audit-source.cjs','differential.cjs','native-matrix.py','run-characterize.py','finish-local.py','factory-recount.cjs','factory-recount.json','preflight.cjs','preflight.json']:
    shutil.copy2(OUT/name,dest/name)
for name in ['source-audit-prefreeze-final/source-audit.json','differential.json','native-report.json','construction-order.json','characterize-phase.json']:
    (dest/(Path(name).name+'.gz')).write_bytes(gzip.compress((OUT/name).read_bytes(),mtime=0))
for name in ['check.log','unit.log','native.log','characterize.log','source-audit-prefreeze-final.log']:
    (dest/(name+'.gz')).write_bytes(gzip.compress((OUT/name).read_bytes(),mtime=0))
for name in ['characterize-evidence.json','characterize-cache-identity.json','characterize-run-1.json','characterize-run-2.json','characterize-pixels-1.json','characterize-pixels-2.json']:
    d=dest/'characterize';d.mkdir(exist_ok=True);(d/(name+'.gz')).write_bytes(gzip.compress((OUT/'characterize'/name).read_bytes(),mtime=0))
diagnostics=dest/'collector-diagnostics';diagnostics.mkdir(exist_ok=True)
for path in sorted((OUT/'collector-diagnostics').rglob('*')):
    if path.is_file() and path.suffix in ['.json','.log','.py']:
        target=diagnostics/path.relative_to(OUT/'collector-diagnostics');target.parent.mkdir(parents=True,exist_ok=True)
        target.with_name(target.name+'.gz').write_bytes(gzip.compress(path.read_bytes(),mtime=0))
for path in sorted(OUT.glob('source-audit-v*.log')):
    (diagnostics/(path.name+'.gz')).write_bytes(gzip.compress(path.read_bytes(),mtime=0))
hashes={str(p.relative_to(dest)):sha(p) for p in sorted(dest.rglob('*')) if p.is_file() and p.name!='durable-file-hashes.json'}
(dest/'durable-file-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n')
assert all(sha(dest/name)==value for name,value in hashes.items())
(WORK/'tests/baselines/vibration-validation.json').write_text(json.dumps(local,indent=2)+'\n')
print(json.dumps(dict(status=local['status'],letAfter=256,deps=13,sourceChecks=len(audit['checks']),nativeContexts=8,characterizeSeconds=e['wallTimeSeconds'],goldens=102,runs=2,identityContexts=8),indent=2))
