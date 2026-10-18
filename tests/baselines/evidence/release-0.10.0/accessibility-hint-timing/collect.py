import concurrent.futures,hashlib,json,subprocess,zipfile
from pathlib import Path,PurePosixPath
out=Path(__file__).parent;repo='evangelistalab/vibemol';runid=39154813750
assert not (out/'collection-complete.json').exists()
def gh(*args):return subprocess.check_output(['gh',*map(str,args)],timeout=240)
def save(name,data):
 with (out/name).open('xb') as f:f.write(data)
r=json.loads(gh('run','view',runid,'--repo',repo,'--json','databaseId,headSha,status,conclusion,url,createdAt,updatedAt,attempt,jobs'))
assert r['status']=='completed' and r['headSha']=='629f9bd5f8e50414a23e5bc5358905337dc6dc64' and r['attempt']==1
save('run.json',(json.dumps(r,indent=2)+'\n').encode())
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 futures={pool.submit(gh,*args):name for name,args in {'run.log':['run','view',runid,'--repo',repo,'--log'],'artifact-index.json':['api',f'repos/{repo}/actions/runs/{runid}/artifacts']}.items()}
 for f in concurrent.futures.as_completed(futures):save(futures[f],f.result())
index=json.loads((out/'artifact-index.json').read_text());sources=['1c609b338344aaa49ffd11b9ee2ad834a6e0d85d','04eaf660607072b6f4bebafa3f8daef92a92afe8','323d03fa393cfe5e3df6023fbdb0a2bd19cd6eea']
assert index['total_count']==len(index['artifacts'])==3 and {a['name'] for a in index['artifacts']}=={'hint-diagnostic-'+s for s in sources}
(out/'artifact-zips').mkdir();(out/'artifacts').mkdir()
def download(a):
 assert not a['expired'] and a['workflow_run']['id']==runid and a['workflow_run']['head_sha']==r['headSha']
 data=gh('api',f"repos/{repo}/actions/artifacts/{a['id']}/zip");digest=hashlib.sha256(data).hexdigest();assert a['digest']=='sha256:'+digest
 path=out/'artifact-zips'/(a['name']+'.zip');path.write_bytes(data);dest=out/'artifacts'/a['name'];dest.mkdir()
 with zipfile.ZipFile(path) as z:
  assert z.testzip() is None
  for i in z.infolist():
   p=PurePosixPath(i.filename);assert not p.is_absolute() and '..' not in p.parts and (i.external_attr>>16)&0o170000!=0o120000
  z.extractall(dest)
 return dict(name=a['name'],sha256=digest,bytes=len(data))
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:proof=list(pool.map(download,index['artifacts']))
(out/'collection-complete.json').write_text(json.dumps(dict(runId=runid,attempt=1,artifacts=proof),indent=2)+'\n')
print(json.dumps(proof,indent=2))
