"""Independently verify the unchanged Stage5b candidate's single completed attempt."""
import copy
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import traceback

ROOT=Path.cwd();config=json.loads(Path(sys.argv[1]).read_text())
folder=Path(config['artifactDir']);art=folder/'artifacts'
sys.path.insert(0,str(ROOT/'tests/e2e'))
import browser_suite
import join_browser_shards
import join_characterize
from ci_evidence import artifact_identity,digest
read=lambda p:json.loads(p.read_text())
git=lambda *a:subprocess.check_output(['git',*a],text=True).strip()
assert git('rev-parse','HEAD')==config['head'] and not git('status','--porcelain')
assert git('rev-parse','HEAD^{tree}')==config['tree']
for name,key in [('app.js','appSha256'),('vibration.js','moduleSha256'),('qa-characterize.js','qaSha256')]:
    assert digest(ROOT/'assets/app/js'/name)==config[key]
for filename,key in [('source-audit.json','sourceAuditSha256'),('local-validation.json','localValidationSha256')]:
    assert digest(folder/filename)==config[key]
assert digest(folder/'frozen-source-audit/source-audit.json')==config['frozenSourceAuditSha256']
audit=read(folder/'frozen-source-audit/source-audit.json')
assert audit['status']=='passed' and audit['sourceHead']==config['head'] and audit['baseline']==config['base']
assert all(c['passed'] for c in audit['checks']) and len(audit['checks'])==config['sourceAuditChecks']
assert digest(ROOT/'tests/baselines/evidence/stage5/vibration/audit-source.cjs')==config['sourceAuditScriptSha256']
assert audit['sourceHashes']['proposedAppSha256']==config['appSha256']
assert audit['sourceHashes']['proposedModuleSha256']==config['moduleSha256']
assert audit['controllerDependencyCount']==13 and [d['name'] for d in audit['dependencies']]==config['controllerInputs']
assert all(d['actualReferences']>0 for d in audit['dependencies'])
assert audit['proof']['wholeAppReconstructed'] and audit['proof']['allExistingDeclarationsAccounted']
assert audit['proof']['allMovedBodiesExactAfterLexicalAdapterSubstitution'] and audit['proof']['continuousPhaseAnd02sCapUnchanged']
assert audit['metrics']['beforeApp']['trackedTwoSpaceLetDeclarationLines']==260
assert audit['metrics']['proposedApp']['trackedTwoSpaceLetDeclarationLines']==256
assert audit['metrics']['proposedApp']['lines']==31917
assert git('diff','--name-only',config['base'],'--','assets','src','index.html').splitlines()==[
    'assets/app/js/app.js','assets/app/js/vibration.js','index.html']
assert git('diff','--name-only',config['base'],'--','tests/e2e','tests/fixtures').splitlines()==[
    'tests/e2e/browser_suite.py','tests/e2e/edit_tool.py','tests/e2e/join_browser_shards.py']
assert not git('diff',config['base'],'--','tests/baselines/characterize.json.gz','tests/baselines/color-contrast.json','assets/app/js/trajectory-video.js')
assert digest(ROOT/'tests/baselines/stage5/run-policy.json')==config['runPolicySha256']
manifest=read(ROOT/'tests/baselines/browser-suite.json')
expected_counts={'passed':33,'failed':4,'total':37}
assert manifest['expected']==expected_counts
expected_keys={('tests/e2e/axis_gizmo.py','escape-canvas-focus'),('tests/e2e/mode_consistency.py','coordinates-delete-selection-card'),
    ('tests/e2e/smoke.py','issue-11-stop-after-second-download'),('tests/e2e/edit_tool.py','issue-21-edit-toolbar-layout-collapse-320')}
assert {(name,value['workflow']) for name,value in manifest['knownDefects'].items()}==expected_keys
run=read(folder/'run.json');pr=read(folder/'pr.json');checkout=read(folder/'checkout-commit.json');index=read(folder/'artifact-index.json')
raw_log=(folder/'run.log').read_text()
assert run['databaseId']==config['runId'] and run['attempt']==1 and run['headSha']==config['head'] and run['status']=='completed'
assert pr['headRefOid']==config['head'] and pr['baseRefOid']==config['base'] and pr['state']=='OPEN'
assert checkout['tree']['sha']==config['tree'] and [p['sha'] for p in checkout['parents']]==[config['base'],config['head']]
shards=['smoke','looks','balanced-1','balanced-2','balanced-3']
names={'checks-and-unit','WebKit Properties interactions','Exact characterization repeat and goldens','Aggregate browser gate (33/4/37)'}|{f'Browser suites ({s})' for s in shards}|{f'Characterization ({i})' for i in (1,2)}
jobs={j['name']:j for j in run['jobs']};assert set(jobs)==names and len(jobs)==len(run['jobs'])==11
assert all(j['status']=='completed' for j in jobs.values())
assert {line.split('\t',1)[0] for line in raw_log.splitlines() if re.search(r'Z '+checkout['sha']+'$',line)}==names
expected_artifacts={'browser-suite-'+s for s in shards}|{'browser-results','characterize-1','characterize-2','characterization-results','construction-order'}
if any(a['name']=='webkit-properties' for a in index['artifacts']):expected_artifacts.add('webkit-properties')
assert index['total_count']==len(index['artifacts'])==len(expected_artifacts)
assert {a['name'] for a in index['artifacts']}=={p.name for p in art.iterdir()}==expected_artifacts
assert all(not a['expired'] and a['workflow_run']['id']==config['runId'] and a['workflow_run']['head_sha']==config['head'] for a in index['artifacts'])
identity=artifact_identity(ROOT);identity.update(commit=checkout['sha'],ciRunUrl=run['url'],ciRunAttempt='1')
assert read(art/'construction-order/identity.json')==identity
order=read(art/'construction-order/report.json')
assert order['toolSha256']==digest(ROOT/'tools/audit-construction-order.cjs')
assert order['stages'][-1]['afterSha256']==config['appSha256'] and order['stages'][-1]['modules'][0]['sha256']==config['moduleSha256']
assert len(order['stages'][-1]['bindings'])==16
assert sum(len(m['bindings']) for m in order['stages'][-1]['modules'])==161
gates={};stop=[]
def gate(name,actual,expected=True):
    passed=actual==expected;gates[name]=dict(actual=actual,expected=expected,passed=passed)
    print(json.dumps(dict(gate=name,**gates[name]),sort_keys=True),flush=True)
    if not passed:stop.append(name)
gate('all eleven jobs successful',all(j['conclusion']=='success' for j in jobs.values()))
gate('overall conclusion',run['conclusion'],'success')
gate('required construction order',order['status'],'passed')
gate('all audited stages passed',all(s['status']=='passed' and s['matchesExpectedStatus'] for s in order['stages']))
b=join_browser_shards.join_reports(art,folder/'independent/browser-suite',expected_identity=identity)
def portable(report):
    report=copy.deepcopy(report)
    for e in report['suites']:e.pop('rawLog')
    return report
assert portable(b)==portable(read(art/'browser-results/browser-results.json'))
gate('all37 suites once',b['allExecutedOnce'])
gate('exact33/4/37 counts',{k:b[k] for k in expected_counts},expected_counts)
gate('exact raw failing workflow set',{(e['test'],(e['failureWorkflow'] or {}).get('id')) for e in b['suites'] if e['exitCode']}==expected_keys)
gate('ordinary aggregate accepted',b['matchesAcceptedBaseline'])
gate('unchanged #11 behavior',b.get('issue11Workflow'),config['issue11Workflow'])
smoke=next(e for e in b['suites'] if e['test']=='tests/e2e/smoke.py')
gate('#11 origin/caller shape without line matching',
    dict(exceptionType=smoke['exceptionType'],origin={k:(smoke['firstFailure'] or {}).get(k) for k in ('suite','function')},caller={k:(smoke['failureCallSite'] or {}).get(k) for k in ('suite','function')}),
    dict(exceptionType='TimeoutError',origin=dict(suite='ci_gate_diagnostics.py',function='wait_for_video_idle'),caller=dict(suite='smoke.py',function='main')))
edit=next(e for e in b['suites'] if e['test']=='tests/e2e/edit_tool.py')
edit_log=Path(edit['rawLog']).read_text()
measurements=[json.loads(s) for s in re.findall(r'^\[edit-tool-layout\] (.+)$',edit_log,re.M)]
gate('shipped #21 comparands emitted',bool(measurements))
width=measurements[-1] if measurements else None
gate('#21 readback at320',width['viewportWidth'] if width else None,320)
gate('#21 measured actual layout failure',width['passed'] if width else None,False)
c=None
try:
    c=join_characterize.join_reports(art,folder/'independent/characterize',expected_identity=identity)
    assert c==read(art/'characterization-results/characterize-evidence.json')
    gate('102 unchanged goldens twice/exact repeat,52slots/eight contexts/all minima',True)
except Exception:
    (folder/'independent-characterization-failure.log').write_text(traceback.format_exc())
    gate('102 unchanged goldens twice/exact repeat,52slots/eight contexts/all minima',False)
looks=next(e for e in b['suites'] if e['test']=='tests/e2e/looks.py')
looks_log=(art/'browser-suite-looks/browser-suite/looks/run.log').read_text()
paths={p:f'[materials] {p}: families, controls, recipe matching, undo, personal libraries, sessions: passed' in looks_log for p in ('Studio','Properties')}
gate('Looks completed',looks['exitCode'],0)
gate('Looks raw completion without timeout',not re.search(r'TimeoutError|Traceback \(most recent call last\)',looks_log))
for path,done in paths.items():gate(path+' material-family path',done)
gate('WebKit Properties',jobs['WebKit Properties interactions']['conclusion'],'success')
unit='\n'.join(line for line in raw_log.splitlines() if line.startswith('checks-and-unit\tUnit tests\t'))
gate('JS unit count',re.findall(r'(?:#|ℹ) tests (\d+)',unit),['433'])
gate('Python unit count',re.findall(r'Ran (\d+) tests',unit),['36'])
local=read(folder/'local-validation.json')
assert local['status']=='local verification complete' and local['appSha256']==config['appSha256'] and local['moduleSha256']==config['moduleSha256']
assert local['manualMatrix']['contexts']==8 and local['manualMatrix']['comparandsExactAcrossSources']
assert local['differential']['scenarios']==54 and local['differential']['checkpoints']==1659
timing=read(folder/'timing-vs-132.93.json')
gate('cache fix: all eight workers restored',timing['cache']['restoreHits'],8)
gate('cache fix: no cold worker miss',timing['cache']['restoreMisses'],0)
renderer=read(art/'browser-suite-smoke/browser-suite/smoke/renderer.json');assert renderer['ciRunUrl']==run['url']
if c:assert renderer['browserVersion']==c['browserVersion']
counts=[dict(run=r['run'],launch=x['launch'],theme=x['theme'],nodeCount=x['identity']['nodeCount'],composition=x['identity']['composition'],**x['exercise']) for r in c['elementCacheIdentityRuns'] for x in r['elementCacheIdentity']] if c else []
timeout='appearanceMaterialPreset' in looks_log and ('TimeoutError' in looks_log or 'Timeout' in looks_log)
report=dict(group='5b vibration runtime/panel',head=config['head'],base=config['base'],tree=config['tree'],runId=config['runId'],runUrl=run['url'],attempt=1,pr=config['pr'],checkoutMergeCommit=checkout['sha'],
    candidateConjunctionVerified=all(g['passed'] for g in gates.values()),stopReasons=stop,gates=gates,
    failedJobs=[dict(name=j['name'],conclusion=j['conclusion']) for j in jobs.values() if j['conclusion']!='success'],
    browser=dict(passed=b['passed'],failed=b['failed'],total=b['total'],allExecutedOnce=b['allExecutedOnce'],acceptedFailures=[e for e in b['suites'] if e['exitCode']],issue11Workflow=b['issue11Workflow'],vibrationReachedThisRun=b['issue11Workflow'].get('site')=='vibration',editTool320=width),
    characterization=dict(runs=2,capturesPerRun=102,identityContexts=len(counts),counts=counts,unchangedGoldensMatched=bool(c),exactSerializedRepeat=bool(c),pixelChangesDiagnosticOnly=c['sameSessionPixelChanges'] if c else None),
    appearanceMaterialPresetIntermittent=dict(looksSeconds=looks['wallTimeSeconds'],looksMinutes=looks['wallTimeSeconds']/60,materialFamilyPaths=paths,bothMaterialFamiliesPathsReached=all(paths.values()),recurred=timeout if all(paths.values()) or timeout else None,coverageDisposition='both paths completed' if all(paths.values()) else 'not covered this run',riskRemainsOpen=True),
    constructionOrder=dict(status=order['status'],appBindings=16,moduleBindings=161,toolSha256=order['toolSha256']),renderer=renderer,
    controllerInputs=config['controllerInputs'],controllerInterfaceCount=13,periodicFactoryInputs=11,trackedLetBefore=260,trackedLetAfter=256,sourceAudit=dict(status=audit['status'],checks=len(audit['checks']),proof=audit['proof'],metrics=audit['metrics']),timing=timing)
(folder/'candidate-verification.json').write_text(json.dumps(report,indent=2)+'\n')
(folder/'identity-firing-counts.json').write_text(json.dumps(counts,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['candidateConjunctionVerified','stopReasons','browser','appearanceMaterialPresetIntermittent','constructionOrder']},indent=2),flush=True)
raise SystemExit(0 if report['candidateConjunctionVerified'] else 1)
