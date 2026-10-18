"""Documentation-only preservation of a completed, independently verified gate."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import shutil

p=argparse.ArgumentParser()
p.add_argument('--ci',type=Path,required=True)
p.add_argument('--destination',type=Path,required=True)
a=p.parse_args()
ci,dest=a.ci.resolve(),a.destination.resolve()
v=json.loads((ci/'candidate-verification.json').read_text())
assert v['candidateConjunctionVerified'] and v['allElevenJobsPassed'] and v['independentJoinsMatchCi']
assert not dest.exists(), 'Do not duplicate an already preserved run'
dest.mkdir(parents=True)
names=['candidate.json','source-audit.json','local-validation.json','run.json','artifact-index.json','pr.json','checkout-commit.json',
 'candidate-verification.json','identity-firing-counts.json','timing-vs-132.93.json','outcome-decision.json','archive-proof.json',
 'downloaded-sha256.json','collection-complete.json','merge.json','pre-merge-pr.json','pre-merge-verification.json',
 'baseline-skipped-run.json','integration-verification.json','periodic-recount.json']
names.append('construction-order.json')
for name in names:
    shutil.copyfile(ci/name,dest/name)
shutil.copytree(ci/'source-reaudit',dest/'source-reaudit')
for name in ['run.log','independent-verification.log','collection.log','timing-measurement.log','source-reaudit.log']:
    (dest/(name+'.gz')).write_bytes(gzip.compress((ci/name).read_bytes(),mtime=0))
encodings={}
for f in (ci/'artifacts').rglob('*'):
    if not f.is_file() or f.suffix not in ['.json','.log','.txt']:
        continue
    target=dest/'artifacts'/f.relative_to(ci/'artifacts')
    target.parent.mkdir(parents=True,exist_ok=True)
    if f.suffix=='.log' or (f.suffix=='.json' and f.stat().st_size>=262144):
        raw=f.read_bytes()
        original=str(target.relative_to(dest))
        target=target.with_name(target.name+'.gz')
        target.write_bytes(gzip.compress(raw,mtime=0))
        assert gzip.decompress(target.read_bytes())==raw
        encodings[original]={'storedAs':str(target.relative_to(dest)),'originalBytes':len(raw),'originalSha256':hashlib.sha256(raw).hexdigest()}
    else:
        shutil.copyfile(f,target)
(dest/'preservation-encoding.json').write_text(json.dumps({'files':encodings,'scope':'Original artifact JSON/log bytes are gzip-compressed for durable evidence; full original ZIPs and generated output stay untouched in ignored out/test-artifacts.'},indent=2)+'\n')
shutil.copytree(ci/'proof-scripts',dest/'proof-scripts')
(dest/'raw-archive-location.json').write_text(json.dumps({'path':str(ci/'immutable-evidence.tar.gz'),'sha256':hashlib.sha256((ci/'immutable-evidence.tar.gz').read_bytes()).hexdigest(),
 'scope':'All original ZIPs/logs/artifacts and independently reconstructed joins retained in ignored raw output. Durable reports and compressed raw workflow logs are preserved here.'},indent=2)+'\n')
hashes={str(f.relative_to(dest)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(dest.rglob('*')) if f.is_file()}
(dest/'durable-file-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n')
for name,digest in hashes.items():
    assert hashlib.sha256((dest/name).read_bytes()).hexdigest()==digest
print(json.dumps({'run':v['runUrl'],'files':len(hashes)+1,'allReadbackHashesMatched':True}))
