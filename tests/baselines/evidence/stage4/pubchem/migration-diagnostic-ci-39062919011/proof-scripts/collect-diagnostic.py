"""Collect exactly one completed three-source diagnostic attempt, without retries."""
import concurrent.futures
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import zipfile

folder=Path(__file__).resolve().parent
repo='evangelistalab/vibemol'; run_id='39062919011'; head='323fbf9332a49477f99cb3a447bb4037335ed104'
ci=folder/('ci-'+run_id)
assert not ci.exists()
gh=lambda *args:subprocess.check_output(['gh',*args],timeout=240)
run_bytes=gh('run','view',run_id,'--repo',repo,'--json','databaseId,headSha,status,conclusion,url,createdAt,updatedAt,attempt,jobs')
run=json.loads(run_bytes)
assert run['status']=='completed' and run['headSha']==head and run['attempt']==1
ci.mkdir();(ci/'run.json').write_bytes(run_bytes)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    tasks={'run.log':pool.submit(gh,'run','view',run_id,'--repo',repo,'--log'),
           'artifact-index.json':pool.submit(gh,'api',f'repos/{repo}/actions/runs/{run_id}/artifacts')}
    for name,f in tasks.items():(ci/name).write_bytes(f.result())
index=json.loads((ci/'artifact-index.json').read_text())
assert index['total_count']==len(index['artifacts'])==3
assert {a['name'] for a in index['artifacts']}=={'look-migration-'+x for x in ['tagged','integration','pubchem']}
def download(a):
    assert not a['expired'] and a['workflow_run']['id']==int(run_id) and a['workflow_run']['head_sha']==head
    raw=gh('api',f"repos/{repo}/actions/artifacts/{a['id']}/zip")
    digest=hashlib.sha256(raw).hexdigest();assert a['digest']=='sha256:'+digest
    path=ci/(a['name']+'.zip');path.write_bytes(raw);dest=ci/a['name'];dest.mkdir()
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        for e in z.infolist():
            rel=PurePosixPath(e.filename)
            assert not rel.is_absolute() and '..' not in rel.parts
            assert (e.external_attr>>16)&0o170000!=0o120000
        z.extractall(dest)
    return {'name':a['name'],'id':a['id'],'sha256':digest,'bytes':len(raw),'githubDigestMatched':True}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:proof=list(pool.map(download,index['artifacts']))
(ci/'collection-complete.json').write_text(json.dumps({'runId':int(run_id),'attempt':1,'harnessHead':head,'artifacts':proof},indent=2)+'\n')
print(json.dumps({'runId':int(run_id),'conclusion':run['conclusion'],'artifacts':proof},indent=2))
