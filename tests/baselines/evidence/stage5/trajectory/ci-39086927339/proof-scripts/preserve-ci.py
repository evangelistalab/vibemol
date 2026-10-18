"""Copy durable readbacks/provenance; full generated data stays in ignored raw archive."""
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import sys

folder=Path(sys.argv[1]);destination=Path(sys.argv[2]);raw=folder/'artifacts'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda p:json.loads(p.read_text())
config=read(folder/'candidate.json');decision=read(folder/'candidate-verification.json');archive=read(folder/'immutable-evidence-proof.json')
assert archive['allEntriesReadBackAndMatched'] and archive['head']==config['head']==decision['head']
assert sha(folder/archive['archive'])==archive['sha256']
assert not destination.exists(), 'Do not replace an earlier durable bundle'
destination.mkdir(parents=True)
for name in ['candidate.json','run.json','artifact-index.json','artifact-inventory-assessment.json','checkout-commit.json','collection-complete.json',
             'candidate-verification.json','identity-firing-counts.json','timing-vs-132.93.json','downloaded-sha256.json',
             'immutable-evidence-proof.json','immutable-evidence.tar.gz.sha256','archive-input-manifest.json',
             'pre-merge-verification.json','merge.json','integration-verification.json','stop-disposition.json']:
    path=folder/name
    if path.exists():shutil.copy2(path,destination/name)
for name in ['run.log','pr.json','source-audit.json','local-validation.json','construction-order.json','independent-verification.log']:
    path=folder/name
    if path.exists():(destination/(name+'.gz')).write_bytes(gzip.compress(path.read_bytes(),mtime=0))
for sub in ['artifacts','independent','source-reaudit']:
    source=folder/sub
    if not source.exists():continue
    for path in sorted(source.rglob('*')):
        if not path.is_file() or path.suffix not in {'.json','.jsonl','.log','.txt','.html','.cjs'}:continue
        relative=path.relative_to(folder);target=destination/relative;target.parent.mkdir(parents=True,exist_ok=True)
        target.with_name(target.name+'.gz').write_bytes(gzip.compress(path.read_bytes(),mtime=0))
scripts=destination/'proof-scripts';scripts.mkdir()
for name in ['collect-completed-sharded-run.py','verify-ci.py','measure-sharded-run.py','audit-source.cjs','seal-ci.py','premerge.py','preserve-ci.py','verify-integrated.py']:
    path=folder.parent/name
    if path.exists():shutil.copy2(path,scripts/name)
note=dict(runId=config['runId'],attempt=1,head=config['head'],base=config['base'],tree=config['tree'],
    candidateConjunctionVerified=decision['candidateConjunctionVerified'],stopReasons=decision['stopReasons'],
    rawArchive=dict(name=archive['archive'],bytes=archive['bytes'],sha256=archive['sha256'],entries=archive['entries'],allEntriesReadBackAndMatched=True),
    preservation='All original ZIPs, raw logs, screenshots/HTML and captures remain untouched in the ignored attempt folder and sealed archive. This durable bundle preserves structured readbacks, logs, identities, assertions and per-file hashes; it never upgrades a failed gate to acceptance.')
(destination/'README.json').write_text(json.dumps(note,indent=2)+'\n')
hashes={str(p.relative_to(destination)):sha(p) for p in sorted(destination.rglob('*')) if p.is_file()}
(destination/'durable-file-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n')
assert all(sha(destination/name)==value for name,value in hashes.items())
print(json.dumps(dict(files=len(hashes),destination=str(destination),candidateConjunctionVerified=decision['candidateConjunctionVerified'],archiveSha256=archive['sha256']),indent=2))
