"""Read back completed proof and preserve it; never starts another test/browser."""
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT=Path('/Users/fevange/Source/vibemol');OUT=ROOT/'out/test-artifacts/stage5/trajectory';WORK=OUT/'source-worktree'
read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
git_bytes=lambda ref,p:subprocess.check_output(['git','show',ref+':'+p],cwd=WORK)
assert read(OUT/'characterize-phase.json')['status']=='passed'
soak=read(OUT/'soak-phase.json');assert soak['status']=='passed' and len(soak['cases'])==4 and soak['seconds']>=240
assert all(c['status']=='passed' and len(c['checkpoints'])==8 for c in soak['cases'])
audit=read(OUT/'source-audit-prefreeze/source-audit.json');assert audit['status']=='passed' and all(c['passed'] for c in audit['checks'])
app_sha=sha(WORK/'assets/app/js/app.js');module_sha=sha(WORK/'assets/app/js/trajectory-playback.js')
assert soak['sourceAppSha256']==app_sha and soak['harnessSha256']==sha(OUT/'soak.py')
assert audit['sourceHashes']['proposedAppSha256']==app_sha and audit['sourceHashes']['proposedModuleSha256']==module_sha
recount=read(OUT/'factory-recount.json')
assert {x['name']:x['dependencyCount'] for x in recount}=={'createPeriodicTableController':11,'createPubChemController':13,'createTrajectoryPlaybackController':8}
assert all(x['allUsed'] and all(v['references']>0 for v in x['inputs']) for x in recount)
differential=read(OUT/'differential.json');assert differential['status']=='passed'
assert differential['sourceHashes']['afterApp']==app_sha and differential['sourceHashes']['module']==module_sha
assert differential['scenarioCount']==109 and differential['checkpointCount']==2559
assert differential['constructorDependencyCalls']==[]
native=read(OUT/'native-report.json');assert native['status']=='passed' and len(native['cases'])==8
assert native['harnessSha256']==sha(OUT/'native-matrix.py') and native['sourceAppHashes']['proposed']==app_sha
tag='1c609b338344aaa49ffd11b9ee2ad834a6e0d85d'
assert native['sourceAppHashes']['tagged']==hashlib.sha256(git_bytes(tag,'assets/app/js/app.js')).hexdigest()
tag_root=ROOT/'out/test-artifacts/stage4/pubchem/tagged-source'
for file in ['assets/app/js/app.js','index.html','assets/app/js/trajectory-clock.js','assets/app/js/trajectory-ui.js','assets/app/js/trajectory-video.js']:
    assert (tag_root/file).read_bytes()==git_bytes(tag,file)
before=[c for c in native['cases'] if c['source']=='tagged'];after=[c for c in native['cases'] if c['source']=='proposed']
assert [(c['launch'],c['theme']) for c in before]==[(c['launch'],c['theme']) for c in after]
assert all(x['checks']==y['checks'] for x,y in zip(before,after))
order=read(OUT/'construction-order-retro.json');assert order['status']=='passed' and len(order['stages'])==11
assert order['toolSha256']==sha(WORK/'tools/audit-construction-order.cjs')
assert all(s['status']==('review-required' if s['label']=='Stage 4 original (negative control)' else 'passed') for s in order['stages'])
assert order['stages'][-1]['afterSha256']==app_sha
assert order['stages'][-1]['modules'][0]['sha256']==module_sha
assert len(order['stages'][-1]['bindings'])==29 and sum(len(m['bindings']) for m in order['stages'][-1]['modules'])==129
unit=(OUT/'unit-final.log').read_text();assert re.search(r'(?:#|ℹ) tests 433\b',unit) and re.search(r'(?:#|ℹ) fail 0\b',unit)
assert 'Ran 34 tests' in unit and '\nOK\n' in unit
assert 'git diff --check' in (OUT/'check-final.log').read_text() and 'Traceback' not in (OUT/'check-final.log').read_text()
os.environ['VIBEMOL_TEST_ARTIFACT_DIR']=str(OUT/'readback')
sys.path.insert(0,str(WORK/'tests/e2e'))
import characterize as c
e=read(OUT/'characterize/characterize-evidence.json')
assert e['runs']==2 and e['capturesPerRun']==102 and e['exactlyIdentical'] and e['deterministic']
assert e['baseline']['appSha256']==app_sha
assert (OUT/'characterize/characterize-run-1.json').read_bytes()==(OUT/'characterize/characterize-run-2.json').read_bytes()
assert c.BASELINE.read_bytes()==git_bytes(audit['baseline'],'tests/baselines/characterize.json.gz')
expected=c.expected_captures(json.loads(gzip.decompress(c.BASELINE.read_bytes())),WORK)
for run in [1,2]:
    actual=read(OUT/f'characterize/characterize-run-{run}.json')
    difference=c.first_difference(expected,actual)
    assert difference is None,difference
counts=[]
for run in e['elementCacheIdentityRuns']:
    for ctx in run['elementCacheIdentity']:
        measured=c.assert_element_cache_exercise(ctx['identity'],ctx['modes'],ctx['panelOpenClosePairs'])
        assert measured==ctx['exercise']
        absent={key:{'id':key.removesuffix('El'),'issue':15,'cached':'null'} for key in ['editAtomsMenuEl','editAtomsMenuBodyEl','editAtomsMenuCurrentEl','editSelectionFragmentCuePopoverEl']}
        if ctx['launch']=='workbench':absent['elementColorBtn']=dict(id='elementColorBtn',issue=14,cached='detached')
        assert ctx['identity']['knownAbsent']==absent
        counts.append(dict(run=run['run'],launch=ctx['launch'],theme=ctx['theme'],nodeCount=ctx['identity']['nodeCount'],composition=ctx['identity']['composition'],**measured))
assert len(counts)==8
assert app_sha==sha(WORK/'assets/app/js/app.js') and module_sha==sha(WORK/'assets/app/js/trajectory-playback.js')
local=dict(status='local verification complete',group='5a trajectory playback core',base=audit['baseline'],appSha256=app_sha,moduleSha256=module_sha,
    qaSha256=sha(WORK/'assets/app/js/qa-characterize.js'),trackedLetBefore=262,trackedLetAfter=260,appLines=32385,appDirectFunctionDeclarations=1163,
    controllerInputs=[d['name'] for d in audit['dependencies']],controllerDependencyCount=8,periodicFactoryDependencyCount=11,
    sourceAudit=dict(status='passed',checks=len(audit['checks']),proof=audit['proof']),
    differential=dict(status='passed',scenarios=109,checkpoints=2559,constructorDependencyCalls=0),
    manualMatrix=dict(status='passed',contexts=8,taggedContexts=4,proposedContexts=4,comparandsExactAcrossSources=True,seconds=native['seconds'],harnessSha256=native['harnessSha256']),
    soak=dict(status='passed',contexts=4,seconds=soak['seconds'],checkpoints=32,harnessSha256=soak['harnessSha256']),
    constructionOrder=dict(status='passed',appBindings=29,moduleBindings=129,retroStages1to4Passed=True,originalPubchemNegativeControlRejected=True,toolSha256=order['toolSha256']),
    checksAndUnit=dict(status='passed',js=433,python=34),
    characterization=dict(status='passed',runs=2,captures=102,exactSerializedRepeat=True,goldensUnchanged=True,identityContexts=8,identityCounts=counts,pixelChanges=e['sameSessionPixelChanges'],seconds=e['wallTimeSeconds'],browserVersion=e['browserVersion']),
    issue11=dict(hypothesis='refuted',productDefectOpen=True,gatePolicy='Any changed site/shape/disappearance is a stop',referenceCi=39071994182,expectedWorkflow=dict(id='issue-11-stop-after-second-download',site='trajectory')),
    ci='Not run yet; own first automatic ordinary conjunction still required',collectorDiagnostics='Preserved failed collector setup: CJS module variable name, map(Array.from) callback arity, portable session missing master playing/timestamp fields, and ordinary file picker append semantics. No shipped assertion, expected value, wait or production bug was changed to pass a test.')
(OUT/'local-validation.json').write_text(json.dumps(local,indent=2)+'\n')
dest=WORK/'tests/baselines/evidence/stage5/trajectory';dest.mkdir(parents=True,exist_ok=True)
for file in ['local-validation.json','audit-source.cjs','differential.cjs','native-matrix.py','soak.py','run-characterize.py','finish-local.py','factory-recount.json','construction-order-retro-config.json','construction-self-test-final.log','source-audit-prefreeze-verified.log','differential-final.log']:
    shutil.copy2(OUT/file,dest/file)
for file in ['source-audit-prefreeze/source-audit.json','differential.json','native-report.json','construction-order-retro.json','construction-order-initial.json','characterize-phase.json','soak-phase.json']:
    target=dest/(Path(file).name+'.gz');target.write_bytes(gzip.compress((OUT/file).read_bytes(),mtime=0))
for file in ['check-final.log','unit-final.log','native-final.log','characterize.log','construction-order-retro.log','construction-order-initial.log','soak.log']:
    (dest/(file+'.gz')).write_bytes(gzip.compress((OUT/file).read_bytes(),mtime=0))
for file in ['characterize-evidence.json','characterize-cache-identity.json','characterize-run-1.json','characterize-run-2.json','characterize-pixels-1.json','characterize-pixels-2.json']:
    d=dest/'characterize';d.mkdir(exist_ok=True);(d/(file+'.gz')).write_bytes(gzip.compress((OUT/'characterize'/file).read_bytes(),mtime=0))
diagnostics=dest/'collector-diagnostics';diagnostics.mkdir(exist_ok=True)
for path in sorted((OUT/'collector-diagnostics').rglob('*')):
    if path.is_file() and path.suffix in ['.json','.log','.py']:
        target=diagnostics/path.relative_to(OUT/'collector-diagnostics');target.parent.mkdir(parents=True,exist_ok=True)
        target.with_name(target.name+'.gz').write_bytes(gzip.compress(path.read_bytes(),mtime=0))
hashes={str(p.relative_to(dest)):sha(p) for p in sorted(dest.rglob('*')) if p.is_file() and p.name!='durable-file-hashes.json'}
(dest/'durable-file-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n')
assert all(sha(dest/name)==value for name,value in hashes.items())
(WORK/'tests/baselines/trajectory-playback-validation.json').write_text(json.dumps(local,indent=2)+'\n')
print(json.dumps(dict(status=local['status'],letAfter=260,deps=8,sourceChecks=len(audit['checks']),nativeContexts=8,soakSeconds=soak['seconds'],characterizeSeconds=e['wallTimeSeconds'],goldens=102,runs=2,identityContexts=8),indent=2))
