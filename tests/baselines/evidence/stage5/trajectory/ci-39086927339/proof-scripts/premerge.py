"""Last exact-head conjunction check; deliberately performs no merge."""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import sys

folder=Path(sys.argv[1]);config=json.loads((folder/'candidate.json').read_text())
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
git=lambda *a:subprocess.check_output(['git',*a],text=True).strip()
repo='evangelistalab/vibemol'
gh=lambda *a:json.loads(subprocess.check_output(['gh',*a],text=True))
decision=read(folder/'candidate-verification.json');assert decision['candidateConjunctionVerified'] is True and not decision['stopReasons']
archive=read(folder/'immutable-evidence-proof.json');assert archive['usableAsMergeGate'] and archive['allEntriesReadBackAndMatched']
assert sha(folder/archive['archive'])==archive['sha256']
assert git('rev-parse','HEAD')==config['head'] and git('rev-parse','HEAD^{tree}')==config['tree'] and not git('status','--porcelain')
assert sha(Path('assets/app/js/app.js'))==config['appSha256']
assert sha(Path('assets/app/js/trajectory-playback.js'))==config['moduleSha256']
assert sha(Path('assets/app/js/qa-characterize.js'))==config['qaSha256']
for name,expected in read(folder/'archive-input-manifest.json').items():assert sha(folder/name)==expected['sha256']
pr=gh('pr','view',str(config['pr']),'--repo',repo,'--json','number,url,headRefOid,baseRefOid,state,mergeable,mergeStateStatus,statusCheckRollup')
assert pr['headRefOid']==config['head'] and pr['baseRefOid']==config['base'] and pr['state']=='OPEN'
assert pr['mergeable']=='MERGEABLE' and pr['mergeStateStatus']=='CLEAN'
run=gh('run','view',str(config['runId']),'--repo',repo,'--json','databaseId,headSha,status,conclusion,attempt,jobs')
assert run['databaseId']==config['runId'] and run['headSha']==config['head'] and run['attempt']==1
assert run['status']=='completed' and run['conclusion']=='success' and len(run['jobs'])==11
assert all(j['conclusion']=='success' for j in run['jobs'])
checks=pr['statusCheckRollup'];assert len(checks)==14
assert sum(c.get('conclusion')=='SUCCESS' for c in checks)==11
assert sum(c.get('conclusion')=='SKIPPED' for c in checks)==3
remote=gh('api','repos/'+repo+'/git/ref/heads/codex/app-js-decomposition')
assert remote['object']['sha']==config['base']
proof=dict(status='passed',head=config['head'],base=config['base'],tree=config['tree'],runId=config['runId'],attempt=1,
    pr=pr,ci=run,archiveSha256=archive['sha256'],checkedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
with (folder/'pre-merge-verification.json').open('x') as output:output.write(json.dumps(proof,indent=2)+'\n')
print(json.dumps(dict(status='passed',head=config['head'],base=config['base'],checks=14,ciJobs=11)))
