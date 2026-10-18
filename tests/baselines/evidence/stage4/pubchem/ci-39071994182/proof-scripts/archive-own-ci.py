"""Seal the completed immutable candidate evidence before an exact-head merge."""
import datetime
import hashlib
import json
from pathlib import Path
import sys
import tarfile

folder=Path(sys.argv[1]).resolve()
cfg=json.loads((folder/'candidate.json').read_text())
v=json.loads((folder/'candidate-verification.json').read_text())
assert v['candidateConjunctionVerified'] and v['allElevenJobsPassed'] and v['independentJoinsMatchCi']
archive=folder/'immutable-evidence.tar.gz'
assert not archive.exists() and not (folder/'archive-proof.json').exists()
files=[f for f in sorted(folder.rglob('*')) if f.is_file() and f.name not in ['watch.log','archive-proof.json','immutable-evidence.tar.gz','immutable-evidence.tar.gz.sha256']]
hashes={str(f.relative_to(folder)):hashlib.sha256(f.read_bytes()).hexdigest() for f in files}
manifest=folder/'archive-manifest.json'
assert not manifest.exists()
manifest.write_text(json.dumps(hashes,indent=2)+'\n')
files.append(manifest)
with tarfile.open(archive,'w:gz') as tar:
 for f in files:tar.add(f,arcname=str(f.relative_to(folder)),recursive=False)
with tarfile.open(archive,'r:gz') as tar:
 members=tar.getmembers()
 assert len(members)==len(files)
 for member in members:
  assert member.isfile()
  data=tar.extractfile(member).read()
  assert data==(folder/member.name).read_bytes()
  if member.name in hashes:assert hashlib.sha256(data).hexdigest()==hashes[member.name]
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
(folder/'immutable-evidence.tar.gz.sha256').write_text(digest+'  immutable-evidence.tar.gz\n')
proof={'head':cfg['head'],'base':cfg['base'],'tree':cfg['tree'],'runId':cfg['runId'],'attempt':1,
 'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'path':str(archive),'sha256':digest,'bytes':archive.stat().st_size,
 'entries':len(files),'allArchiveEntriesReadbackExact':True,'preMerge':True,'lateMergeAndIntegrationProofStoredSeparately':True}
(folder/'archive-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(proof,indent=2))
