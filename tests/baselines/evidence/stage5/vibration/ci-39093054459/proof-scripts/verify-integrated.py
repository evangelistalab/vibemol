"""Verify the entire tested tree on pushed integration and preserve the user's edit."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

folder=Path(sys.argv[1]);config=json.loads((folder/'candidate.json').read_text())
git=lambda *a:subprocess.check_output(['git',*a],text=True).strip();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
repo='evangelistalab/vibemol'
assert git('branch','--show-current')=='codex/app-js-decomposition'
merge=json.loads(subprocess.check_output(['gh','pr','view',str(config['pr']),'--repo',repo,'--json','state,mergeCommit,headRefOid,baseRefOid,mergedAt,url'],text=True))
assert merge['state']=='MERGED' and merge['headRefOid']==config['head']
head=git('rev-parse','HEAD');assert head==merge['mergeCommit']['oid']
assert git('rev-parse','HEAD^{tree}')==config['tree']
assert git('rev-list','--parents','-n','1','HEAD').split()==[head,config['base'],config['head']]
for name,key in [('app.js','appSha256'),('vibration.js','moduleSha256'),('qa-characterize.js','qaSha256')]:assert sha(Path('assets/app/js')/name)==config[key]
assert len(re.findall(r'^  let ',Path('assets/app/js/app.js').read_text(),re.M))==256
assert git('status','--porcelain')=='M .gitignore'
assert sha(Path('.gitignore'))=='30d1ada8b5dd3a028c11de6ed57b3e56d295b99e8fcc81109ac5ef6be4de1fde'
assert hashlib.sha256(subprocess.check_output(['git','diff','--','.gitignore'])).hexdigest()=='b7ae3de7feec3f41e9584eacd68ed152312547a32e75ff2fd773144c6b0401d9'
remote=json.loads(subprocess.check_output(['gh','api','repos/'+repo+'/git/ref/heads/codex/app-js-decomposition'],text=True));assert remote['object']['sha']==head
proof=dict(status='passed',integration=head,testedHead=config['head'],testedTree=config['tree'],entireTreeMatches=True,appSha256=config['appSha256'],moduleSha256=config['moduleSha256'],qaSha256=config['qaSha256'],trackedLet=256,controllerInputs=13,periodicFactoryInputs=11,pushed=True,userGitignorePreserved=True)
(folder/'merge.json').write_text(json.dumps(merge,indent=2)+'\n');(folder/'integration-verification.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(proof,indent=2))
