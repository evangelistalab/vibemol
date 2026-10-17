"""Read completed evidence, independently verify it, preserve reviewable results."""
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

r=Path('/Users/fevange/Source/vibemol');old=r/'out/test-artifacts/stage4/pubchem';o=r/'out/test-artifacts/stage4/pubchem-fixed';w=old/'source-worktree'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda p:json.loads(p.read_text())
assert read(o/'characterize-phase.json')['status']=='passed'
assert read(o/'look-references-phase.json')['status']=='passed'
assert read(o/'manual-phase.json')['status']=='passed'
os.environ['VIBEMOL_TEST_ARTIFACT_DIR']=str(o/'readback')
sys.path.insert(0,str(w/'tests/e2e'))
import characterize as c
e=read(o/'characterize/characterize-evidence.json')
assert e['runs']==2 and e['capturesPerRun']==102 and e['exactlyIdentical'] and e['deterministic']
assert e['baseline']['appSha256']==sha(w/'assets/app/js/app.js')
assert not e['sameSessionPixelChanges']
assert (o/'characterize/characterize-run-1.json').read_bytes()==(o/'characterize/characterize-run-2.json').read_bytes()
expected=c.expected_captures(json.loads(gzip.decompress(c.BASELINE.read_bytes())),w)
for run in (1,2):
 actual=read(o/f'characterize/characterize-run-{run}.json')
 difference=c.first_difference(expected,actual)
 assert difference is None,difference
 assert len(actual)==102
prior=read(old/'characterization/characterize-evidence.json')
prior_contexts={(x['launch'],x['theme']):x for x in prior['elementCacheIdentityRuns'][0]['elementCacheIdentity']}
counts=[]
for run in e['elementCacheIdentityRuns']:
 assert len(run['elementCacheIdentity'])==4
 for ctx in run['elementCacheIdentity']:
  measured=c.assert_element_cache_exercise(ctx['identity'],ctx['modes'],ctx['panelOpenClosePairs'])
  assert measured==ctx['exercise']
  assert ctx['identity']['knownAbsent']==prior_contexts[(ctx['launch'],ctx['theme'])]['identity']['knownAbsent']
  counts.append(dict(run=run['run'],launch=ctx['launch'],theme=ctx['theme'],nodeCount=ctx['identity']['nodeCount'],composition=ctx['identity']['composition'],**measured))
assert len(counts)==8
assert 'tests 433' in (o/'unit.log').read_text() and 'fail 0' in (o/'unit.log').read_text()
assert 'Ran 29 tests' in (o/'unit.log').read_text() and '\nOK\n' in (o/'unit.log').read_text()
assert 'git diff --check' in (o/'check-configured.log').read_text() and 'Traceback' not in (o/'check-configured.log').read_text()
manual=read(o/'manual-pair-verification.json');assert manual['semanticReadbacksExact'] and manual['proposedCases']==manual['taggedCases']==72
tagged=read(old/'manual/tagged/manual-report.json');fixed=read(o/'manual/manual-report.json')
assert {x['harnessSha256'] for x in tagged['cases']}=={x['harnessSha256'] for x in fixed['cases']}
observations=[json.loads(line) for line in (o/'look-references/look-reference-migration-comparands.jsonl').read_text().splitlines()]
assert len(observations)==2
for x in observations:
 assert x['actual']['ids']==x['expectedIds'] and x['actual']['flags']==x['expectedFlags']
source=read(o/'independent-source-audit/source-audit.json')
assert source['status']=='passed' and len(source['checks'])==1229 and all(x['passed'] for x in source['checks'])
assert source['sourceHashes']['proposedAppSha256']==sha(w/'assets/app/js/app.js')
order=read(o/'construction-order-final.json')
assert order['status']=='passed' and order['toolSha256']==sha(w/'tools/audit-construction-order.cjs')
assert all(x['status']==('review-required' if x['label']=='Stage 4 original (negative control)' else 'passed') for x in order['stages'])
assert order['stages'][-1]['afterSha256']==sha(w/'assets/app/js/app.js')
normal=read(old/'local-validation.json')['sourceAudit']
normal.update(status='passed',findings=[],scope='Read-only complete-source reconstruction and inverse incoming construction-order audit, including exact authorized comparand instrumentation.',baseline=source['baselineCommit'],sha256=source['sourceHashes'],metrics=source['metrics'])
normal['conclusions'].update(completeAuditCheckCount=1229,
 factoryTiming='Existing inert constructor immediately after els, before startup callbacks; all eager inputs ready or hoisted.',
 startupHoisting='Earlier named-call-only fast-return exemption was insufficient and is superseded. Inverse audit includes cross-module callback exposure and rejects original25fd30a; fixed source has no unresolved pre-construction activation.',
 untouched='Shared HTML/hint/file-loader bodies, other runtime modules, workflows, fixtures and golden payloads unchanged. Exact authorized look_references comparand logging changes no predicates/readiness/waits. New standalone inverse audit tool is explicitly tested.',
 inverseConstructionOrder='Stages1–3 and corrected4 passed; original4 rejected as negative control; every reading reference, constructor proof and introduced local scope retained.')
normal['dependencies']=[dict(x,actualReferences=x['count']) for x in source['dependencies']]
normal['fullIndependentChecks']=source['checks']
(o/'independent-source-audit/audit-report.json').write_text(json.dumps(normal,indent=2)+'\n')
local=dict(stage=4,group='Corrected PubChem ordering',status='Fixed local verification complete; own first automatic ordinary CI required before merge',
 base='6c583556bcc84bff9442602a7dd8aed056b4a660',productionCommit='35fd791',
 appSha256=sha(w/'assets/app/js/app.js'),pubchemSha256=sha(w/'assets/app/js/pubchem.js'),qaSha256=sha(w/'assets/app/js/qa-characterize.js'),
 genuineControllerInputs=[x['name'] for x in normal['dependencies']],genuineControllerDependencyCount=13,dependencyExclusiveLimit=15,
 trackedLetBefore=265,trackedLetAfter=262,appLines=32669,appDirectFunctionDeclarations=1163,moduleLines=480,moduleFunctionDeclarations=21,
 sourceAudit=normal,manualMatrix=manual,checksAndUnit=dict(status='passed',jsTests=433,pythonTests=29),
 targetedLookMigration=dict(status='passed',suiteSeconds=read(o/'look-references-phase.json')['seconds'],observations=observations),
 characterization=dict(runs=2,captures=102,exactRepeat=True,allGoldensMatched=True,identitySlots=52,identityContexts=8,allMinimaMet=True,counts=counts,
  wallTimeSeconds=e['wallTimeSeconds'],browserVersion=e['browserVersion'],pixelChanges=0),
 constructionOrder=dict(status='passed',originalCandidateRejected=True,otherStagesPassed=True,toolSha256=order['toolSha256']),
 restorationError=dict(issue=25,taggedInducedFailureReproduced=True,caughtAs='console.warn',pageerror=False,userFacingError=False,rollback=False,fixedHere=False),
 originalCandidate=dict(head='25fd30a6e273fa289f17ec999b8528e82c061631',failedCi=39057387687,counts=[32,5,37],diagnosticCi=39062919011,usableAsMergeGate=False),
 collectorDiagnostics='Initial make-check cache-prefix setup failure and rejected characterize --output-dir CLI are preserved. Neither altered production/assertions; the rejected CLI never opened a browser. Corrected check and one valid characterization browser invocation completed. No completed UI suite was rerun.')
(o/'local-validation.json').write_text(json.dumps(local,indent=2)+'\n')
dest=w/'tests/baselines/evidence/stage4/pubchem/ordering-correction'
for name in ['local-validation.json','manual-pair-verification.json','periodic-recount.json','setup-diagnostics.json','look-references-phase.json','manual-phase.json','characterize-phase.json','finish-local.py','verify-manual-pair.py']:
 shutil.copy2(o/name,dest/name)
for name in ['check.log','check-configured.log','unit.log','look-references.log','manual.log','characterize.log','characterize-cli-setup.log']:
 (dest/(name+'.gz')).write_bytes(gzip.compress((o/name).read_bytes(),mtime=0))
for name in ['characterize-evidence.json','characterize-cache-identity.json','characterize-run-1.json','characterize-run-2.json','characterize-pixels-1.json','characterize-pixels-2.json']:
 target=dest/'characterization'/(name+'.gz');target.parent.mkdir(exist_ok=True);target.write_bytes(gzip.compress((o/'characterize'/name).read_bytes(),mtime=0))
(dest/'manual-report.json.gz').write_bytes(gzip.compress((o/'manual/manual-report.json').read_bytes(),mtime=0))
(dest/'look-reference-migration-comparands.jsonl').write_bytes((o/'look-references/look-reference-migration-comparands.jsonl').read_bytes())
for name in ['audit-pubchem.cjs','audit-report.json','source-audit.json','function-proof.json','audit-readback.json']:
 target=dest/'source-audit'/name;target.parent.mkdir(exist_ok=True)
 if name.endswith('.json'):target.with_name(name+'.gz').write_bytes(gzip.compress((o/'independent-source-audit'/name).read_bytes(),mtime=0))
 else:shutil.copy2(o/'independent-source-audit'/name,target)
d=w/'tests/baselines/evidence/stage4/pubchem/construction-order'
shutil.copy2(o/'construction-order-config.json',d/'config.json');shutil.copy2(o/'construction-order-self-test.log',d/'self-test.log');shutil.copy2(o/'construction-order-final.log',d/'summary.log')
(d/'report.json.gz').write_bytes(gzip.compress((o/'construction-order-final.json').read_bytes(),mtime=0))
for folder in [dest,d,w/'tests/baselines/evidence/stage4/pubchem/restore-fault']:
 hashes={str(p.relative_to(folder)):sha(p) for p in sorted(folder.rglob('*')) if p.is_file() and p.name!='durable-file-hashes.json'}
 (folder/'durable-file-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n')
 assert all(sha(folder/name)==value for name,value in hashes.items())
path=w/'tests/baselines/pubchem-validation.json';summary=read(path);summary.update(status=local['status'],sourceAppSha256=local['appSha256'],
 appLines=32669,appDirectFunctionDeclarations=1163,validation='tests/baselines/evidence/stage4/pubchem/ordering-correction/local-validation.json',
 originalFailedCandidate=local['originalCandidate'],restorationError=local['restorationError'],constructionOrderAudit=local['constructionOrder'],periodicFactoryInputs=11)
path.write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({'status':'passed','sourceAuditChecks':1229,'manualCases':72,'goldens':102,'runs':2,'identityContexts':8,'appLet':262,'deps':13,'characterizeSeconds':e['wallTimeSeconds']},indent=2))
