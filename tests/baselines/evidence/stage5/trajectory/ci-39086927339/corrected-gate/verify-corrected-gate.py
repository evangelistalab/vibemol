"""Independently assess a frozen Stage 5a attempt, preserving every failed gate."""
import copy
import gzip
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import traceback

ROOT=Path.cwd()
config=json.loads(Path(sys.argv[1]).read_text())
folder=Path(config['artifactDir']);art=folder/'artifacts'
sys.path.insert(0,str(ROOT/'tests/e2e'))
import browser_suite
import importlib.util
import characterize
import join_browser_shards
import join_characterize
from ci_evidence import artifact_identity,digest

read=lambda p:json.loads(p.read_text())
git=lambda *args:subprocess.check_output(['git',*args],text=True).strip()
assert git('rev-parse','HEAD')==config['head'] and not git('status','--porcelain')
assert git('rev-parse','HEAD^{tree}')==config['tree']
assert digest(ROOT/'assets/app/js/app.js')==config['appSha256']
assert digest(ROOT/'assets/app/js/trajectory-playback.js')==config['moduleSha256']
assert digest(ROOT/'assets/app/js/qa-characterize.js')==config['qaSha256']
for filename,field in [('source-audit.json','sourceAuditSha256'),('local-validation.json','localValidationSha256')]:
    assert digest(folder/filename)==config[field]
audit=read(folder/'source-reaudit/source-audit.json')
assert audit['status']=='passed' and audit['sourceHead']==config['head']
assert audit['baseline']==config['base'] and all(c['passed'] for c in audit['checks'])
assert len(audit['checks'])==1220
assert digest(ROOT/'tests/baselines/evidence/stage5/trajectory/audit-source.cjs')==config['sourceAuditScriptSha256']
assert audit['sourceHashes']['proposedAppSha256']==config['appSha256']
assert audit['sourceHashes']['proposedModuleSha256']==config['moduleSha256']
assert audit['controllerDependencyCount']==8 and [d['name'] for d in audit['dependencies']]==config['controllerInputs']
assert all(d['actualReferences']>0 for d in audit['dependencies'])
assert audit['proof']['wholeAppReconstructed'] and audit['proof']['allExistingDeclarationsAccounted']
assert audit['proof']['originalDeclarationCount']==1172 and audit['proof']['movedFunctionCount']==27
assert audit['proof']['unchangedDeclarationCount']==1143
assert audit['metrics']['beforeApp']['trackedTwoSpaceLetDeclarationLines']==262
assert audit['metrics']['proposedApp']['trackedTwoSpaceLetDeclarationLines']==260
assert audit['metrics']['proposedApp']['lines']==32385
assert audit['metrics']['proposedApp']['directIifeFunctionDeclarations']==1163
assert audit['metrics']['module']['lines']==410
assert git('diff','--name-only',config['base'],'--','assets','src','index.html').splitlines()==[
    'assets/app/js/app.js','assets/app/js/trajectory-playback.js','index.html']
assert not git('diff',config['base'],'--','tests/e2e','tests/fixtures','tests/baselines/browser-suite.json',
               'tests/baselines/browser-shards.json','tests/baselines/characterize.json.gz','tests/baselines/color-contrast.json')
assert git('diff','--name-only',config['base'],'--','tests/unit').splitlines()==['tests/unit/test_refactor_run.py']
assert digest(ROOT/'tests/baselines/stage5/run-policy.json')==config['runPolicySha256']
assert read(ROOT/'tests/baselines/stage5/run-policy.json')['issue11Workflow']==config['issue11Workflow']
assert config['issue11Workflow']=={'id':'issue-11-stop-after-second-download','site':'trajectory'}
run=read(folder/'run.json');pr=read(folder/'pr.json');checkout=read(folder/'checkout-commit.json');index=read(folder/'artifact-index.json')
raw_log=(folder/'run.log').read_text()
assert run['databaseId']==config['runId'] and run['attempt']==1 and run['headSha']==config['head'] and run['status']=='completed'
assert pr['headRefOid']==config['head'] and pr['baseRefOid']==config['base'] and pr['state']=='OPEN'
assert checkout['tree']['sha']==config['tree'] and [p['sha'] for p in checkout['parents']]==[config['base'],config['head']]
shards=['smoke','looks','balanced-1','balanced-2','balanced-3']
names={'checks-and-unit','WebKit Properties interactions','Exact characterization repeat and goldens','Aggregate browser gate (34/3/37)'}|{f'Browser suites ({s})' for s in shards}|{f'Characterization ({i})' for i in (1,2)}
jobs={j['name']:j for j in run['jobs']}
assert set(jobs)==names and len(jobs)==len(run['jobs'])==11
assert all(j['status']=='completed' for j in jobs.values())
assert {line.split('\t',1)[0] for line in raw_log.splitlines() if re.search(r'Z '+checkout['sha']+'$',line)}==names
expected_artifacts={'browser-suite-'+s for s in shards}|{'browser-results','characterize-1','characterize-2','characterization-results','construction-order'}
if any(a['name']=='webkit-properties' for a in index['artifacts']):expected_artifacts.add('webkit-properties')
assert index['total_count']==len(index['artifacts'])==len(expected_artifacts)
assert {a['name'] for a in index['artifacts']}=={p.name for p in art.iterdir()}==expected_artifacts
assert all(not a['expired'] and a['workflow_run']['id']==config['runId'] and a['workflow_run']['head_sha']==config['head'] for a in index['artifacts'])
corrected=folder/'corrected-gate'
spec=importlib.util.spec_from_file_location('corrected_browser_policy',corrected/'browser_policy.py')
policy=importlib.util.module_from_spec(spec);spec.loader.exec_module(policy)
manifest=read(corrected/'browser-suite.json')
identity=artifact_identity(ROOT);identity.update(commit=checkout['sha'],ciRunUrl=run['url'],ciRunAttempt='1')
assert read(art/'construction-order/identity.json')==identity
order=read(art/'construction-order/report.json')
assert order['toolSha256']==digest(ROOT/'tools/audit-construction-order.cjs')
assert order['stages'][-1]['afterSha256']==config['appSha256']
assert order['stages'][-1]['modules'][0]['sha256']==config['moduleSha256']
assert all(s['expectedStatus']=='passed' for s in order['stages'])
assert len(order['stages'][-1]['bindings'])==29
assert sum(b['name']=='args' and b['kind']=='param' and b['hoisted'] for b in order['stages'][-1]['bindings'])==27
assert sum(len(m['bindings']) for m in order['stages'][-1]['modules'])==129

gates={}
stop_reasons=[]
def gate(name,actual,expected=True):
    passed=actual==expected
    gates[name]=dict(actual=actual,expected=expected,passed=passed)
    print(json.dumps(dict(gate=name,**gates[name]),sort_keys=True),flush=True)
    if not passed:stop_reasons.append(name)

failed_jobs=[j for j in jobs.values() if j['conclusion']!='success']
gate('sole failed job is superseded aggregate policy', [j['name'] for j in failed_jobs], ['Aggregate browser gate (34/3/37)'])
gate('sole failed step is original aggregate workflow/count assertion',
    [s['name'] for j in failed_jobs for s in j['steps'] if s['conclusion']=='failure'],
    ['Verify all suites once, raw failure workflows and aggregate counts'])
gate('original overall conclusion preserved',run['conclusion'],'failure')
gate('required construction-order gate',order['status'],'passed')
gate('all construction stages passed',all(s['status']=='passed' for s in order['stages']))
b=join_browser_shards.join_reports(art,corrected/'independent/original-browser-suite',expected_identity=identity)
def portable(report):
    report=copy.deepcopy(report)
    for e in report['suites']:e.pop('rawLog')
    return report
assert portable(b)==portable(read(art/'browser-results/browser-results.json'))
# The original join still has to reconstruct its original report exactly.
# Only after that proof do we independently classify the same raw failures
# under the human's corrected manifest. Original artifacts remain untouched.
for entry in b['suites']:
    log=Path(entry['rawLog']).read_text()
    details=policy.failure_details(log,entry['test'],(ROOT/entry['test']).read_text())
    if entry['test']!='tests/e2e/edit_tool.py':
        assert all(entry[k]==v for k,v in details.items())
    entry.update(details)
    entry['knownDefect']=entry['test'] in manifest['knownDefects'] and policy.matches_known_defect(entry,manifest['knownDefects'][entry['test']])
b['expected']=manifest['expected']
policy.finish_report(b,manifest)
actual_keys={(e['test'],e['failureWorkflow']['id']) for e in b['suites'] if e['exitCode']}
expected_keys={(name,k['workflow']) for name,k in manifest['knownDefects'].items()}
assert actual_keys==expected_keys
assert not policy.finish_report(dict(suites=[{**e,'exitCode':0} if e['test']=='tests/e2e/edit_tool.py' else dict(e) for e in b['suites']]),manifest), '34/3 must be rejected'
(corrected/'browser-results.json').write_text(json.dumps(b,indent=2)+'\n')

gate('all 37 suites once',b['allExecutedOnce'])
gate('ordinary counts',{k:b[k] for k in ('passed','failed','total')},{'passed':33,'failed':4,'total':37})
gate('ordinary exact raw failing-workflow set',b['matchesAcceptedBaseline'])
gate('unchanged #11 behavior',b.get('issue11Workflow'),config['issue11Workflow'])
smoke=next(e for e in b['suites'] if e['test']=='tests/e2e/smoke.py')
def failure_shape(entry):
    return dict(exceptionType=entry.get('exceptionType'),
        origin={k:(entry.get('firstFailure') or {}).get(k) for k in ('suite','function')},
        caller={k:(entry.get('failureCallSite') or {}).get(k) for k in ('suite','function')})
gate('unchanged #11 exception/origin/calling workflow (no line-number acceptance)',failure_shape(smoke),
    dict(exceptionType='TimeoutError',origin=dict(suite='ci_gate_diagnostics.py',function='wait_for_video_idle'),caller=dict(suite='smoke.py',function='main')))
c=None
try:
    c=join_characterize.join_reports(art,corrected/'independent/characterize',expected_identity=identity)
    assert c==read(art/'characterization-results/characterize-evidence.json')
    gate('102 goldens twice, exact repeat,52 slots/eight contexts/all minima',True)
except Exception:
    (folder/'independent-characterization-failure.log').write_text(traceback.format_exc())
    gate('102 goldens twice, exact repeat,52 slots/eight contexts/all minima',False)
looks=next(e for e in b['suites'] if e['test']=='tests/e2e/looks.py')
looks_log=(art/'browser-suite-looks/browser-suite/looks/run.log').read_text()
paths={p:f'[materials] {p}: families, controls, recipe matching, undo, personal libraries, sessions: passed' in looks_log for p in ('Studio','Properties')}
gate('Looks completed',looks['exitCode'],0)
gate('Looks raw completion without timeout/traceback',not re.search(r'TimeoutError|Traceback \(most recent call last\)',looks_log))
gate('Studio material-family path',paths['Studio'])
gate('Properties material-family path',paths['Properties'])
gate('WebKit Properties',jobs['WebKit Properties interactions']['conclusion'],'success')
unit_lines='\n'.join(line for line in raw_log.splitlines() if line.startswith('checks-and-unit\tUnit tests\t'))
js=re.findall(r'(?:#|ℹ) tests (\d+)',unit_lines);py=re.findall(r'Ran (\d+) tests',unit_lines)
gate('JS unit count',js,['433'])
gate('Python unit count',py,['34'])
local=read(folder/'local-validation.json')
assert local['status']=='local verification complete' and local['appSha256']==config['appSha256'] and local['moduleSha256']==config['moduleSha256']
assert local['manualMatrix']['contexts']==8 and local['manualMatrix']['comparandsExactAcrossSources']
assert local['differential']['scenarios']==109 and local['differential']['checkpoints']==2559
assert local['soak']['status']=='passed' and local['soak']['contexts']==4 and local['soak']['seconds']>=240
renderer=read(art/'browser-suite-smoke/browser-suite/smoke/renderer.json')
assert renderer['ciRunUrl']==run['url']
if c:assert renderer['browserVersion']==c['browserVersion']
counts=[dict(run=r['run'],launch=x['launch'],theme=x['theme'],nodeCount=x['identity']['nodeCount'],composition=x['identity']['composition'],**x['exercise']) for r in c['elementCacheIdentityRuns'] for x in r['elementCacheIdentity']] if c else []
failures=[e for e in b['suites'] if e['exitCode']]
timeout='appearanceMaterialPreset' in looks_log and ('TimeoutError' in looks_log or 'Timeout' in looks_log)
report=dict(group='5a trajectory playback core',head=config['head'],base=config['base'],tree=config['tree'],runId=config['runId'],runUrl=run['url'],attempt=1,
    pr=config['pr'],checkoutMergeCommit=checkout['sha'],candidateConjunctionVerified=all(g['passed'] for g in gates.values()),stopReasons=stop_reasons,gates=gates,
    failedJobs=[dict(name=j['name'],conclusion=j['conclusion']) for j in jobs.values() if j['conclusion']!='success'],
    browser=dict(passed=b['passed'],failed=b['failed'],total=b['total'],allExecutedOnce=b['allExecutedOnce'],acceptedFailures=failures,issue11Workflow=b.get('issue11Workflow'),expectedIssue11Workflow=config['issue11Workflow'],vibrationReachedThisRun=b.get('issue11Workflow',{}).get('site')=='vibration'),
    characterization=dict(runs=2,capturesPerRun=102,identityContexts=len(counts),counts=counts,unchangedGoldensMatched=bool(c),exactSerializedRepeat=bool(c),pixelChangesDiagnosticOnly=c['sameSessionPixelChanges'] if c else None),
    appearanceMaterialPresetIntermittent=dict(looksSeconds=looks['wallTimeSeconds'],looksMinutes=looks['wallTimeSeconds']/60,materialFamilyPaths=paths,
        bothMaterialFamiliesPathsReached=all(paths.values()),recurred=timeout if all(paths.values()) or timeout else None,
        coverageDisposition='both paths completed' if all(paths.values()) else 'not covered this run: one or both paths incomplete',riskRemainsOpen=True),
    constructionOrder=dict(status=order['status'],appBindings=len(order['stages'][-1]['bindings']),moduleBindings=sum(len(m['bindings']) for m in order['stages'][-1]['modules']),toolSha256=order['toolSha256']),
    renderer=renderer,controllerInputs=config['controllerInputs'],controllerInterfaceCount=8,periodicFactoryInputs=11,trackedLetBefore=262,trackedLetAfter=260,
    sourceAudit=dict(status=audit['status'],checks=len(audit['checks']),proof=audit['proof'],metrics=audit['metrics']),allElevenJobsPassed=all(j['conclusion']=='success' for j in jobs.values()))
report['humanPolicyCorrection']={'authority':'direct human instruction in this chat','expected':manifest['expected'],'originalCiConclusion':'failure','onlySupersededGate':'old 34/3 aggregate assertion','noRerun':True,'originalEvidenceUnchanged':True}
(corrected/'candidate-verification.json').write_text(json.dumps(report,indent=2)+'\n')
(corrected/'identity-firing-counts.json').write_text(json.dumps(counts,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['candidateConjunctionVerified','stopReasons','appearanceMaterialPresetIntermittent','constructionOrder']},indent=2),flush=True)
raise SystemExit(0 if report['candidateConjunctionVerified'] else 1)
