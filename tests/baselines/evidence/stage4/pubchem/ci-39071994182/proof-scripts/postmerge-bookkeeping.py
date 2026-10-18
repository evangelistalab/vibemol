"""Documentation-only completion; executable only after the full fixed gate/merge."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess

p=argparse.ArgumentParser();p.add_argument('--ci',type=Path,required=True);a=p.parse_args()
r=Path('/Users/fevange/Source/vibemol');ci=a.ci.resolve()
cfg=json.loads((ci/'candidate.json').read_text());v=json.loads((ci/'candidate-verification.json').read_text())
integration=json.loads((ci/'integration-verification.json').read_text());timing=json.loads((ci/'timing-vs-132.93.json').read_text())
git=lambda *args:subprocess.check_output(['git',*args],cwd=r,text=True).strip()
assert v['candidateConjunctionVerified'] and v['allElevenJobsPassed'] and v['independentJoinsMatchCi']
assert git('rev-parse','HEAD')==integration['integrationCommit'] and git('rev-parse','HEAD^{tree}')==cfg['tree']
assert hashlib.sha256((r/'assets/app/js/app.js').read_bytes()).hexdigest()==cfg['appSha256']
assert len(re.findall(r'^  let ',(r/'assets/app/js/app.js').read_text(),re.M))==262
protected=['assets','src','index.html','Makefile','.github','tools','tests/e2e','tests/unit','tests/fixtures']
assert not git('diff','--name-only','--',*protected)
prefix='tests/baselines/evidence/stage4/pubchem/ci-'+str(cfg['runId'])+'/'
path=r/'tests/baselines/refactor-stage-risk.json';risk=json.loads(path.read_text())
previous=risk.get('latestCiGateAttempt',{})
history='historicalCompleteCiGates' if previous.get('counts')==[34,3,37] else 'historicalRejectedCiGateAttempts'
if previous and not any(x.get('run')==previous.get('run') for x in risk.setdefault(history,[])):risk[history].append(previous)
risk['latestCiGateAttempt']=dict(pr=24,head=cfg['head'],base=cfg['base'],run=cfg['runUrl'],attempt=1,
 integrationCommit=integration['integrationCommit'],status='Corrected PubChem candidate: own first automatic ordinary conjunction passed, exact-head merged and tested-tree-identical integration verified/pushed. Original failed candidate remains rejected.',
 counts=[34,3,37],issue11Workflow=v['browser']['issue11Workflow'],vibrationReached=v['browser']['vibrationReachedThisRun'],evidence=prefix+'candidate-verification.json',wallTimeVs13293=timing)
risk['currentBrowserBaseline'].update(passed=34,failed=3,total=37,evidence=prefix+'artifacts/browser-results/browser-results.json',
 provenance='Corrected PubChem PR24 own first ordinary run independently verified and merged. Original failed run39057387687 and diagnostics remain separate, rejected as merge evidence.',
 ciRunUrl=cfg['runUrl'],sourceAppSha256=cfg['appSha256'],issue11Workflow=v['browser']['issue11Workflow'],vibrationExportReached=v['browser']['vibrationReachedThisRun'])
risk['currentBrowserBaseline']['gate']['satisfied']=True
stage=next(x for x in risk['stages'] if x['stage']==4)
stage.update(status='Complete: corrected PubChem candidate passed its own first ordinary full gate, merged and pushed.',
 pr=cfg['prUrl'],head=cfg['head'],mergeCommit=integration['integrationCommit'],ciRun=cfg['runUrl'],ordinaryCiRun=cfg['runUrl'],ordinaryCiCounts=[34,3,37],trackedLetAcceptedIntegration=262,trackedLetCandidate=262,ciEvidence=prefix+'candidate-verification.json',
 wallTimeVs13293=timing,issue11Workflow=v['browser']['issue11Workflow'],vibrationReached=v['browser']['vibrationReachedThisRun'],
 appearanceMaterialPresetIntermittent=v['appearanceMaterialPresetIntermittent'],trackedLetAfter=262,actualDependencies=13,
 materialPresetCoverage={'status':'both required paths completed on the fixed candidate','bothMaterialFamiliesPathsReached':True,
 'recurrenceAssessment':'did not recur in this completed run; remains open intermittent','priorFailedRun39057387687':'not covered this run'})
path.write_text(json.dumps(risk,indent=2)+'\n')
path=r/'tests/baselines/pubchem-validation.json';summary=json.loads(path.read_text())
summary.update(status='Complete: authorized ordering correction, own first ordinary fixed-candidate full gate, exact-head merge and pushed integration.',
 pr=cfg['prUrl'],candidateHead=cfg['head'],ciRun=cfg['runUrl'],ciAttempt=1,ciEvidence=prefix+'candidate-verification.json',
 integrationCommit=integration['integrationCommit'],ciGate=[34,3,37],shardedWallTimeMinutes=timing['workflowMinutes'],
 restorationFailureFinding={'issue':25,'fixedHere':False,'taggedInducedFailure':'warning only, partial settings/reference state'},
 constructionOrderAudit='Stages1–3 and fixed4 passed; original4 rejected as negative control',periodicFactoryInputs=11)
path.write_text(json.dumps(summary,indent=2)+'\n')
path=r/'AGENTS.md';s=path.read_text();start=s.index('- **Stage 4 PubChem ordering correction');end=s.index('\n',start)
looks=v['appearanceMaterialPresetIntermittent'];site=v['browser']['issue11Workflow']['site']
line=(f"- **Stage 4 PubChem is complete through PR #24**, with the directly authorized ordering correction: inert construction immediately after `els`, original queries/listeners and **13 used dependencies**, tracked app lets **265 → 262**. Corrected head `{cfg['head']}` passed its own first automatic ordinary CI **{cfg['runId']} attempt 1**: **34/3/37**, all37 once, **102 unchanged goldens twice/exact repeat**, fixed **52-slot composition in eight contexts/all minima**, checks **433 JS/29 Python** and WebKit. #11 fired at **{site} after the second download**; vibration-export reach **{v['browser']['vibrationReachedThisRun']}**. Looks completed **both Studio/Properties material paths** in **{looks['looksSeconds']:.2f}s/{looks['looksMinutes']:.2f}min**; no material-preset timeout in this completed run, risk remains open. Whole sharded CI **{timing['workflowMinutes']:.4f}min**, **{timing['reductionPercent']:.2f}% less/{timing['speedup']:.3f}×** versus132.93min. Exact-head merge `{integration['integrationCommit']}` matched the tested tree and was pushed before documentation bookkeeping. Original `25fd30a`/CI39057387687 remains a rejected32/5/37 candidate; diagnostic39062919011 and tagged fault injection never supplied a gate. Separate restoration issue **#25** stays carried/unfixed. Evidence: `{prefix}`. Stage5 remains design only.")
s=s[:start]+line+s[end:]
s=s.replace('Stage 4 PubChem has its authorized ordering correction pending its own complete first-pass gate; Stage 5 design is accepted without implementation release.','Stage 4 PubChem is complete with its corrected candidate; Stage 5 design is accepted without implementation release.')
assert s.count('**Standing conversion rule')==1 and all(s.count(f'**({i})**')==1 for i in (1,2,3))
path.write_text(s)
report=dict(stage=4,status='complete',completedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
 correctedCandidate=cfg,ordinaryGate=v,timing=timing,preDocumentationIntegration=integration,
 restorationError={'issue':25,'caughtBy':'restoreAppearancePresetAutosave','logging':'console.warn','pageerror':False,'rollback':False,'taggedInducedFailureReproduced':True,'fixedHere':False},
 chosenFix='Existing inert constructor moved immediately after els; no eager DOM/network/input-callback work, all eager inputs ready/hoisted; queries/listeners unchanged.',
 inverseAudit='Stages1–3 and corrected4 pass; original4 rejected; conservative cross-module callback exposure, every reading reference and introduced helper/module scope retained.',
 lets={'before':265,'after':262},controllerDependencies=13,periodicFactoryInputs=11,
 stage5='Accepted design/notes only; no implementation; #11 mirror hypothesis remains refuted.',
 bookkeeping='Documentation/evidence only after exact-head merge. Production, shipped harness/tool, fixtures and goldens remain the tested bytes.')
(r/'tests/baselines/evidence/stage4/pubchem/completion.json').write_text(json.dumps(report,indent=2)+'\n')
assert not git('diff','--name-only','--',*protected)
print(json.dumps({'stage4':'complete','trackedLet':262,'controllerDependencies':13,'periodicFactoryInputs':11,'productionChangedByBookkeeping':False}))
