"""Seal accepted or failed attempt evidence; sealing never grants acceptance."""
import hashlib
import json
from pathlib import Path
import sys
import tarfile

folder=Path(sys.argv[1]);read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
config=read(folder/'candidate.json');run=read(folder/'run.json');decision=read(folder/'candidate-verification.json')
assert run['status']=='completed' and run['attempt']==1 and run['databaseId']==config['runId']
assert run['headSha']==config['head']==decision['head']
assert read(folder/'collection-complete.json')['head']==config['head']
archive=folder/'immutable-evidence.tar.gz'
assert not archive.exists() and not (folder/'immutable-evidence-proof.json').exists()
files=[p for p in sorted(folder.rglob('*')) if p.is_file() and p.name not in {'watch.log'}]
assert all(not p.is_symlink() for p in files)
manifest={str(p.relative_to(folder)):dict(bytes=p.stat().st_size,sha256=sha(p)) for p in files}
(folder/'archive-input-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
files.append(folder/'archive-input-manifest.json')
with tarfile.open(archive,'w:gz') as target:
    for file in files:target.add(file,arcname=str(file.relative_to(folder)),recursive=False)
expected={str(p.relative_to(folder)):sha(p) for p in files}
verified={}
with tarfile.open(archive,'r:gz') as source:
    for entry in source:
        assert entry.isfile() and entry.name in expected and entry.name not in verified
        digest=hashlib.sha256()
        with source.extractfile(entry) as stream:
            for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
        verified[entry.name]=digest.hexdigest()
assert verified==expected
proof=dict(runId=config['runId'],attempt=1,head=config['head'],tree=config['tree'],
    candidateConjunctionVerified=decision['candidateConjunctionVerified'],
    usableAsMergeGate=decision['candidateConjunctionVerified'],archive=archive.name,bytes=archive.stat().st_size,
    sha256=sha(archive),entries=len(verified),allEntriesReadBackAndMatched=True,entryHashes=verified,
    lateProofPolicy='Merge/integration or stop-handoff documentation created after this seal stays separate; raw evidence is never rewritten.')
(folder/'immutable-evidence-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
(folder/'immutable-evidence.tar.gz.sha256').write_text(proof['sha256']+'  '+archive.name+'\n')
print(json.dumps({k:v for k,v in proof.items() if k!='entryHashes'},indent=2))
