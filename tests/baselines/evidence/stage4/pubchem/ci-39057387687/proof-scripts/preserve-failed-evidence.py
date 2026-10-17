"""Preserve a reviewable failed-gate record without modifying either committed tree."""
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import sys

ci = Path(sys.argv[1]).resolve()
dest = Path(sys.argv[2]).resolve()
v = json.loads((ci / 'failed-candidate-verification.json').read_text())
assert v['candidateConjunctionVerified'] is False and v['evidenceValidationPassed'] and v['independentJoinsMatchCi']
assert not dest.exists()
dest.mkdir(parents=True)
names = ['candidate.json','source-audit.json','local-validation.json','run.json','artifact-index.json','pr.json','checkout-commit.json',
         'failed-candidate-verification.json','identity-firing-counts.json','timing-vs-132.93.json','outcome-decision.json',
         'failed-archive-proof.json','downloaded-sha256.json','collection-complete.json','baseline-skipped-run.json',
         'workspace-at-stop.json','periodic-recount.json','pr-after-failed-ci.json','pr-body-after-failed-ci.md']
for name in names:
    shutil.copyfile(ci / name, dest / name)
for name in ['run.log','independent-verification.log','independent-failed-evidence.log','collection.log','timing-measurement.log']:
    data = (ci / name).read_bytes()
    target = dest / (name + '.gz')
    target.write_bytes(gzip.compress(data, mtime=0))
    assert gzip.decompress(target.read_bytes()) == data
encodings = {}
for f in sorted((ci / 'artifacts').rglob('*')):
    if not f.is_file() or f.suffix not in ['.json','.log','.txt']:
        continue
    target = dest / 'artifacts' / f.relative_to(ci / 'artifacts')
    target.parent.mkdir(parents=True, exist_ok=True)
    if f.suffix == '.log' or (f.suffix == '.json' and f.stat().st_size >= 262144):
        raw = f.read_bytes()
        original = str(target.relative_to(dest))
        target = target.with_name(target.name + '.gz')
        target.write_bytes(gzip.compress(raw, mtime=0))
        assert gzip.decompress(target.read_bytes()) == raw
        encodings[original] = {'storedAs': str(target.relative_to(dest)), 'originalBytes': len(raw), 'originalSha256': hashlib.sha256(raw).hexdigest()}
    else:
        shutil.copyfile(f, target)
(dest / 'preservation-encoding.json').write_text(json.dumps(encodings, indent=2) + '\n')
shutil.copytree(ci / 'proof-scripts', dest / 'proof-scripts')
archive = ci / 'immutable-failed-evidence.tar.gz'
(dest / 'raw-archive-location.json').write_text(json.dumps({'path': str(archive), 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
    'scope': 'All original artifact ZIPs, generated captures, logs and reconstructed joins remain unchanged in ignored raw output; no acceptance gate is supplied by this failed-run archive.'}, indent=2) + '\n')
(dest / 'README.md').write_text('''# Stage 4 PubChem — blocked first-pass CI

[PR #24](https://github.com/evangelistalab/vibemol/pull/24) remains open and frozen at `25fd30a6e273fa289f17ec999b8528e82c061631`. [Run 39057387687, attempt 1](https://github.com/evangelistalab/vibemol/actions/runs/39057387687) failed the unchanged aggregate browser gate: **32 passing / 5 failing / 37 executed once**, against required **34/3/37**. The candidate is not merged; no CI retry, replacement run, source amendment, assertion change or production fix followed. Integration remains `6c583556bcc84bff9442602a7dd8aed056b4a660` with **265** tracked lets. The proposed controller has **13** genuine inputs and **262** tracked app lets. Periodic-table remains **11** inputs.

The two unexpected failures are the same `reference_migration` assertion at `tests/e2e/look_references.py:182`, both standalone and invoked by `looks.py`:

```python
assert ids(other)==[style,colors] and flags(other)==[False,False]
```

This checks fresh-browser restoration of legacy last-appearance references and unmodified flags. Both failures were independently recovered from raw logs. The actual ids/flags were not logged, so neither the failed half nor a pre-existing/flake/regression classification is established. No new diagnostic or baseline browser run was started. The three accepted failures remain axis Escape focus interception, Coordinates Delete interception, and #11 at **trajectory after the second download**; vibration export was not reached. #21 passed this run and remains an open intermittent layout collapse, prioritized above #17; it is not an accepted fourth CI failure.

Both shipped joins were independently reconstructed from captured artifacts using validated identity. They reproduce the browser rejection and the successful **102 unchanged goldens twice / exact serialized repeat / zero diagnostic pixel changes** characterization. All **52 slots × eight contexts** retain **Workbench 47 live + 5 known absent / legacy 48 + 4**, connected identity and all minima. Actual modes **408/9**, observer modes **404/6**, presented **39/32**, panel transitions **749–1124**, DOM replacements **2982–5463**, restore **1** each. Checks **433 JS / 29 Python** and WebKit passed; ten of eleven workflow jobs succeeded. Green browser workers collected evidence; they did not accept it. All eleven raw checkout logs, checkout tree and ordered parents match the frozen source. The nine original ZIP digests match GitHub and were checked before extraction.

No `#appearanceMaterialPreset` timeout was observed. Looks stopped at the earlier migration assertion in **393.73 s / 6.56 min**, before both Studio/Properties `material_families` paths, so their required coverage is incomplete and the intermittent remains open. CI renderer was **Chromium 156.0.8078.4 / Linux SwiftShader**, Playwright **1.64.0**. Sharded wall time was **1,917 s / 31.95 min**, **75.96% less / 4.161×** versus 132.93 min, with eight cold-cache misses. These are measurements of a failed run, not acceptance evidence.

Paired native PubChem validation had already passed **72 tagged + 72 proposed** cases covering 18 scenarios across both layouts/themes, including fetch failure, malformed JSON/schema/SDF and actual CID/SDF/autocomplete `ERR_ABORTED` request failures. Source reconstruction passed **1,227** checks. Full local evidence is committed in the frozen PR under `tests/baselines/evidence/stage4/pubchem/`; `source-audit.json` and `local-validation.json` are copied here.

`failed-candidate-verification.json` explicitly records `candidateConjunctionVerified: false`. `independent-verification.log.gz` preserves the original unchanged merge verifier's failed success assertion. Raw suite failures, complete run log, source/run identity and immutable failed archive are preserved. This reviewable evidence copy is intentionally **uncommitted**: neither the frozen candidate nor accepted integration was changed to attach failed-CI bookkeeping. The user's pre-existing `.gitignore` edit is preserved exactly.

The independent Stage 5 design deliverable is `/Users/fevange/Source/vibemol/out/test-artifacts/stage5-seam-audit-6c58355/report.md`, with full dependency lists and source provenance. The 17-let inventory is correct; only the trajectory pair are mirrors, while vibration's pair are authoritative. Broad cuts project 22 inputs each; proposed narrower boundaries are trajectory core **8**, vibration runtime/panel **13**, symmetry panel **11** (optional pure vibration-format cut **6**). No Stage 5 code or #11 fix was implemented.

The next production or diagnostic decision belongs to the human. The mailbox remains retired and its monitor paused.
''')
hashes = {str(f.relative_to(dest)): hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(dest.rglob('*')) if f.is_file()}
(dest / 'durable-file-hashes.json').write_text(json.dumps(hashes, indent=2) + '\n')
assert all(hashlib.sha256((dest / name).read_bytes()).hexdigest() == digest for name, digest in hashes.items())
print(json.dumps({'files': len(hashes)+1, 'allReadbackHashesExact': True, 'destination': str(dest), 'committed': False, 'candidateConjunctionVerified': False}, indent=2))
