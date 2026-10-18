"""Final exact-head complete-conjunction check; deliberately performs no merge."""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import sys

folder=Path(sys.argv[1]);read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
config=read(folder/'candidate.json');git=lambda *a:subprocess.check_output(['git',*a],text=True).strip()
repo='evangelistalab/vibemol';gh=lambda *a:json.loads(subprocess.check_output(['gh',*a],text=True))
decision=read(folder/'candidate-verification.json')
assert decision['candidateConjunctionVerified'] and not decision['stopReasons'] and all(g['passed'] for g in decision['gates'].values())
assert decision['browser']['passed']==33 and decision['browser']['failed']==4 and decision['browser']['total']==37
archive=read(folder/'immutable-evidence-proof.json');assert archive['usableAsMergeGate'] and archive['allEntriesReadBackAndMatched']
assert sha(folder/archive['archive'])==archive['sha256']
for name,expected in read(folder/'archive-input-manifest.json').items():assert sha(folder/name)==expected['sha256'],name
assert git('rev-parse','HEAD')==config['head'] and git('rev-parse','HEAD^{tree}')==config['tree'] and not git('status','--porcelain')
for name,key in [('app.js','appSha256'),('vibration.js','moduleSha256'),('qa-characterize.js','qaSha256')]:assert sha(Path('assets/app/js')/name)==config[key]
pr=gh('pr','view',str(config['pr']),'--repo',repo,'--json','number,url,headRefOid,baseRefOid,state,isDraft,mergeable,mergeStateStatus,statusCheckRollup')
assert pr['headRefOid']==config['head'] and pr['baseRefOid']==config['base'] and pr['state']=='OPEN' and not pr['isDraft']
assert pr['mergeable']=='MERGEABLE' and pr['mergeStateStatus']=='CLEAN'
ci=gh('run','view',str(config['runId']),'--repo',repo,'--json','databaseId,headSha,status,conclusion,attempt,jobs')
assert ci['databaseId']==config['runId'] and ci['headSha']==config['head'] and ci['attempt']==1
assert ci['status']=='completed' and ci['conclusion']=='success' and len(ci['jobs'])==11
assert all(j['conclusion']=='success' for j in ci['jobs'])
checks=pr['statusCheckRollup'];primary=[c for c in checks if c.get('workflowName')=='CI']
assert len(primary)==11 and {c['name'] for c in primary}=={j['name'] for j in ci['jobs']}
assert all(c['conclusion']=='SUCCESS' for c in primary)
record=[c for c in checks if c.get('workflowName')=='Record characterization baseline on CI']
assert len(record)==3 and all(c['conclusion']=='SKIPPED' for c in record)
warm_checks=[c for c in checks if c.get('workflowName')=='Warm shared Playwright cache']
assert len(warm_checks) in (0,2) and all(c['conclusion']=='SUCCESS' for c in warm_checks)
assert len(checks)==14+len(warm_checks)
warm=gh('run','view',str(config['cacheWarmRun']),'--repo',repo,'--json','databaseId,headSha,status,conclusion,attempt,jobs')
assert warm['databaseId']==config['cacheWarmRun'] and warm['headSha']==config['head'] and warm['attempt']==1
assert warm['status']=='completed' and warm['conclusion']=='success' and len(warm['jobs'])==2 and all(j['conclusion']=='success' for j in warm['jobs'])
remote=gh('api','repos/'+repo+'/git/ref/heads/codex/app-js-decomposition');assert remote['object']['sha']==config['base']
proof=dict(status='passed',head=config['head'],base=config['base'],tree=config['tree'],runId=config['runId'],attempt=1,pr=pr,ci=ci,
    cacheWarmRun=warm,archiveSha256=archive['sha256'],checkedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
with (folder/'pre-merge-verification.json').open('x') as f:f.write(json.dumps(proof,indent=2)+'\n')
print(json.dumps(dict(status='passed',head=config['head'],base=config['base'],checks=len(checks),ciJobs=11,gate='33/4/37 exact four workflows')))
