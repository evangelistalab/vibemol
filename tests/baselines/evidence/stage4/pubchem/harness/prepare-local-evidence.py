"""Preserve completed Stage4 evidence; no suite or browser invocation."""
import gzip
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

raw=Path('/Users/fevange/Source/vibemol/out/test-artifacts/stage4/pubchem')
root=raw/'source-worktree'
sys.path.insert(0,str(root/'tests/e2e'))
import characterize
base='6c583556bcc84bff9442602a7dd8aed056b4a660'
git=lambda *args:subprocess.check_output(['git','-C',str(root),*args],text=True).strip()
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
char=raw/'characterization'
e=json.loads((char/'characterize-evidence.json').read_text())
assert e['runs']==2 and e['capturesPerRun']==102 and e['exactlyIdentical']
assert (char/'characterize-run-1.json').read_bytes()==(char/'characterize-run-2.json').read_bytes()
golden=json.loads(gzip.decompress((root/'tests/baselines/characterize.json.gz').read_bytes()))
expected=characterize.expected_captures(golden,root)
for n in (1,2):
 actual=json.loads((char/f'characterize-run-{n}.json').read_text())
 assert len(actual)==102 and not characterize.first_difference(expected,actual)
assert (root/'tests/baselines/characterize.json.gz').read_bytes()==subprocess.check_output(['git','-C',str(root),'show',base+':tests/baselines/characterize.json.gz'])
counts=[]
for run in e['elementCacheIdentityRuns']:
 assert len(run['elementCacheIdentity'])==4
 for context in run['elementCacheIdentity']:
  exercise=characterize.assert_element_cache_exercise(context['identity'],context['modes'],context['panelOpenClosePairs'])
  assert exercise==context['exercise']
  counts.append({'run':run['run'],'launch':context['launch'],'theme':context['theme'],'nodeCount':context['identity']['nodeCount'],'composition':context['identity']['composition'],**exercise})
assert len(counts)==8
pair=json.loads((raw/'manual-pair-verification.json').read_text())
assert pair['status']=='passed' and pair['semanticReadbacksExact']
assert pair['taggedCases']==pair['proposedCases']==72
assert json.loads((raw/'check-result.json').read_text())['exitCode']==0
assert json.loads((raw/'unit-result.json').read_text())['exitCode']==0
unit=(raw/'unit.log').read_text()
assert re.search(r'^ℹ tests 433$',unit,re.M) and re.search(r'^ℹ pass 433$',unit,re.M) and re.search(r'^ℹ fail 0$',unit,re.M)
assert re.search(r'^Ran 29 tests ',unit,re.M) and re.search(r'^OK$',unit,re.M)
audit=json.loads((raw/'independent-source-audit/audit-report.json').read_text())
assert audit['status']=='passed' and audit['conclusions']['completeAuditCheckCount']==1227
assert audit['sha256']['proposedAppSha256']==digest(root/'assets/app/js/app.js')
assert audit['sha256']['proposedModuleSha256']==digest(root/'assets/app/js/pubchem.js')
assert e['baseline']['appSha256']==digest(root/'assets/app/js/app.js')
assert len(re.findall(r'^  let ',(root/'assets/app/js/app.js').read_text(),re.M))==262
validation={'stage':4,'group':'PubChem search/import/metadata','status':'Local verification complete; own first-pass exact-candidate ordinary CI required before merge',
 'base':base,'productionCommit':git('rev-parse','HEAD'),'appSha256':digest(root/'assets/app/js/app.js'),'pubchemSha256':digest(root/'assets/app/js/pubchem.js'),
 'qaSha256':digest(root/'assets/app/js/qa-characterize.js'),'genuineControllerInputs':[x['name'] for x in audit['dependencies']],'genuineControllerDependencyCount':13,'dependencyExclusiveLimit':15,
 'trackedLetBefore':265,'trackedLetAfter':262,'appLines':32666,'appDirectFunctionDeclarations':1163,'moduleLines':480,'moduleFunctionDeclarations':21,
 'sourceAudit':audit,'manualMatrix':pair,'checksAndUnit':{'makeCheckExitCode':0,'makeTestUnitExitCode':0,'jsTests':433,'pythonTests':29,'formattingNote':'Both completed before trimming six blank-line-only additions in the module; the independent re-audit proves every other byte exact. The candidate CI will exercise final bytes.'},
 'characterization':{'captures':102,'runs':2,'unchangedGoldens':True,'plannedNamespaceAddition':'VibeMolPubChem.createPubChemController exactly, via existing characterize-api-additions contract','exactSerializedRepeat':True,'diagnosticPixelChanges':e['sameSessionPixelChanges'],'wallTimeSeconds':e['wallTimeSeconds'],'browserVersion':e['browserVersion'],'provenance':e['baseline'],'identityContexts':8,'counts':counts},
 'ordinaryCiGate':{'passed':34,'failed':3,'total':37,'acceptedFailingSetChanged':False,'pending':True},
 'issue21':{'classification':'Intermittent Edit toolbar layout collapse at320px: clientWidth12 vs scrollWidth442; unusable in measured state','relativePriority':'Ahead of#17 in0.9.x batch','acceptedCiFailure':False,'productionFixed':False},
 'stage5':'Design-only independent audit; no implementation, shared-clock change or defect fix included.',
 'collectorDiagnostics':'Initial async browser-launch path, identical-file native-input setup and unrelated Analytics URLs in readback comparison were collector/reader issues. Exact failures and corrections are retained separately; no shipped test/assertion/golden or gate changed, and completed browser cases were not replayed.'}
(raw/'local-validation.json').write_text(json.dumps(validation,indent=2)+'\n')
(raw/'local-identity-firing-counts.json').write_text(json.dumps(counts,indent=2)+'\n')
dest=root/'tests/baselines/evidence/stage4/pubchem'
dest.mkdir(parents=True,exist_ok=False)
def copy(src,target):
 target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,target)
def gz(src,target):
 target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(gzip.compress(src.read_bytes(),mtime=0))
for name in ['local-validation.json','local-identity-firing-counts.json','manual-pair-verification.json','check-result.json','unit-result.json']:
 copy(raw/name,dest/name)
for name in ['make-check.log','unit.log','manual-tagged.log','manual-proposed.log','characterize.log']:
 gz(raw/name,dest/'logs'/(name+'.gz'))
for name in ['audit-report.json','audit-readback.json','audit-pubchem.cjs']:
 copy(raw/'independent-source-audit'/name,dest/'source-audit'/name)
copy(raw/'independent-source-audit/hash-manifest.json',dest/'source-audit/original-layout-hash-manifest.json')
for name in ['source-audit.json','function-proof.json']:
 gz(raw/'independent-source-audit'/name,dest/'source-audit'/(name+'.gz'))
(dest/'source-audit/preservation-encoding.json').write_text(json.dumps({'originalManifest':'original-layout-hash-manifest.json','gzipFiles':{'source-audit.json':'source-audit.json.gz','function-proof.json':'function-proof.json.gz'},'note':'The original manifest hashes decompressed bytes. The outer file-hashes.json hashes this preserved layout.'},indent=2)+'\n')
for name in ['dependency-audit.json','audit-dependencies.cjs','tagged-source.json','issue21-before.json','issue21-after.json','issue17-before.json','issue17-after.json']:
 copy(raw/'preflight'/name,dest/'preflight'/name)
for name in ['extract-pubchem.cjs','manual-network-matrix.py','verify-manual-pair.py','prepare-local-evidence.py','verify-pubchem-ci-candidate.py','collect-completed-sharded-run.py','measure-sharded-run.py']:
 copy(raw/name,dest/'harness'/name)
for name in ['plan.json','blank-line-formatting.json']:
 gz(raw/'conversion'/name,dest/'conversion'/(name+'.gz'))
for label in ('tagged','proposed'):
 gz(raw/'manual'/label/'manual-report.json',dest/'manual'/(label+'.json.gz'))
 for f in (raw/'manual'/label).glob('*.png'):copy(f,dest/'manual'/label/f.name)
for f in char.glob('*.json'):gz(f,dest/'characterization'/(f.name+'.gz'))
# Preserve the failed collector assertions, metadata and raw incidental events;
# generated images/HTML remain in ignored output alongside immutable originals.
for folder in ['initial-launch-failure.log','same-file-input-collector-diagnostic','pair-comparison-diagnostic']:
 p=raw/'manual'/folder
 files=[p] if p.is_file() else list(p.rglob('*'))
 for f in files:
  if f.is_file() and f.suffix in ('.json','.log','.txt','.py'):
   gz(f,dest/'collector-diagnostics'/(str(f.relative_to(raw/'manual'))+'.gz'))
for f in (raw/'independent-source-audit/harness-development').rglob('*'):
 if f.is_file() and f.suffix in ('.json','.log','.txt','.cjs'):
  gz(f,dest/'source-audit/harness-development'/(str(f.relative_to(raw/'independent-source-audit/harness-development'))+'.gz'))
hashes={str(f.relative_to(dest)):digest(f) for f in sorted(dest.rglob('*')) if f.is_file()}
(dest/'file-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n')
assert all(digest(dest/f)==h for f,h in hashes.items())
(root/'tests/baselines/pubchem-validation.json').write_text(json.dumps({'stage':4,'scope':'PubChem controller extraction','status':validation['status'],'base':base,'sourceAppSha256':validation['appSha256'],'sourcePubchemSha256':validation['pubchemSha256'],'trackedLet':[265,262],'genuineControllerInputs':validation['genuineControllerInputs'],'dependencyCount':13,'exclusiveLimit':15,'manualCasesPerSource':72,'capturesPerRun':102,'runs':2,'identitySlots':52,'identityContexts':8,'validation':'tests/baselines/evidence/stage4/pubchem/local-validation.json'},indent=2)+'\n')
print(json.dumps({'localVerification':'passed','dependencies':13,'trackedLet':262,'nativeCasesPerSource':72,'characterizationSeconds':e['wallTimeSeconds'],'capturesPerRun':102,'identityContexts':8,'preservedFiles':len(hashes)+1},indent=2))
