"""Seal immutable raw failure evidence; this archive never supplies a merge gate."""
import datetime
import hashlib
import json
from pathlib import Path
import sys
import tarfile

ci = Path(sys.argv[1]).resolve()
v = json.loads((ci / 'failed-candidate-verification.json').read_text())
cfg = json.loads((ci / 'candidate.json').read_text())
assert v['evidenceValidationPassed'] and v['independentJoinsMatchCi']
assert v['candidateConjunctionVerified'] is False and v['browser']['matchesAcceptedBaseline'] is False
assert [v['browser'][k] for k in ['passed','failed','total']] == [32,5,37]
assert (ci / 'workspace-at-stop.json').exists()
archive = ci / 'immutable-failed-evidence.tar.gz'
manifest = ci / 'failed-archive-manifest.json'
assert not archive.exists() and not manifest.exists()
files = [f for f in sorted(ci.rglob('*')) if f.is_file() and f.name != 'watch.log']
hashes = {str(f.relative_to(ci)): hashlib.sha256(f.read_bytes()).hexdigest() for f in files}
manifest.write_text(json.dumps(hashes, indent=2) + '\n')
files.append(manifest)
with tarfile.open(archive, 'w:gz') as tar:
    for f in files:
        tar.add(f, arcname=str(f.relative_to(ci)), recursive=False)
with tarfile.open(archive, 'r:gz') as tar:
    members = tar.getmembers()
    assert len(members) == len(files)
    for m in members:
        assert m.isfile()
        data = tar.extractfile(m).read()
        assert data == (ci / m.name).read_bytes()
        if m.name in hashes:
            assert hashlib.sha256(data).hexdigest() == hashes[m.name]
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(ci / 'immutable-failed-evidence.tar.gz.sha256').write_text(digest + '  immutable-failed-evidence.tar.gz\n')
proof = {'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
         'head': cfg['head'], 'base': cfg['base'], 'tree': cfg['tree'], 'runId': cfg['runId'], 'attempt': 1,
         'archive': str(archive), 'sha256': digest, 'bytes': archive.stat().st_size, 'entries': len(files),
         'allEntriesReadbackExact': True, 'gateFailed': True, 'canMerge': False,
         'scope': 'Complete captured evidence of a failed first-pass ordinary gate. No retry, merge, source edit or acceptance exception.'}
(ci / 'failed-archive-proof.json').write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps(proof, indent=2))
