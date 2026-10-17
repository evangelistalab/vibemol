# Stage 4 PubChem — blocked first-pass CI

[PR #24](https://github.com/evangelistalab/vibemol/pull/24) remains open and frozen at `25fd30a6e273fa289f17ec999b8528e82c061631`. [Run 39057387687, attempt 1](https://github.com/evangelistalab/vibemol/actions/runs/39057387687) failed the unchanged aggregate browser gate: **32 passing / 5 failing / 37 executed once**, against required **34/3/37**. The candidate is not merged; no CI retry, replacement run, source amendment, assertion change or production fix followed. Integration remains `6c583556bcc84bff9442602a7dd8aed056b4a660` with **265** tracked lets. The proposed controller has **13** genuine inputs and **262** tracked app lets. Periodic-table remains **11** inputs.

The two unexpected failures are the same `reference_migration` assertion at `tests/e2e/look_references.py:182`, both standalone and invoked by `looks.py`:

```python
assert ids(other)==[style,colors] and flags(other)==[False,False]
```

This checks fresh-browser restoration of legacy last-appearance references and unmodified flags. Both failures were independently recovered from raw logs. The actual ids/flags were not logged, so neither the failed half nor a pre-existing/flake/regression classification is established. No new diagnostic or baseline browser run was started. The three accepted failures remain axis Escape focus interception, Coordinates Delete interception, and #11 at **trajectory after the second download**; vibration export was not reached. #21 passed this run and remains an open intermittent layout collapse, prioritized above #17; it is not an accepted fourth CI failure.

Both shipped joins were independently reconstructed from captured artifacts using validated identity. They reproduce the browser rejection and the successful **102 unchanged goldens twice / exact serialized repeat / zero diagnostic pixel changes** characterization. All **52 slots × eight contexts** retain **Workbench 47 live + 5 known absent / legacy 48 + 4**, connected identity and all minima. Actual modes **408/9**, observer modes **404/6**, presented **39/32**, panel transitions **749–1124**, DOM replacements **2982–5463**, restore **1** each. Checks **433 JS / 29 Python** and WebKit passed; ten of eleven workflow jobs succeeded. Green browser workers collected evidence; they did not accept it. All eleven raw checkout logs, checkout tree and ordered parents match the frozen source. The nine original ZIP digests match GitHub and were checked before extraction.

**`#appearanceMaterialPreset` was not covered this run.** Looks stopped at the earlier migration assertion in **393.73 s / 6.56 min**, before both Studio/Properties `material_families` paths, so their required coverage is incomplete and the intermittent remains open. CI renderer was **Chromium 156.0.8078.4 / Linux SwiftShader**, Playwright **1.64.0**. Sharded wall time was **1,917 s / 31.95 min**, **75.96% less / 4.161×** versus 132.93 min, with eight cold-cache misses. These are measurements of a failed run, not acceptance evidence.

Paired native PubChem validation had already passed **72 tagged + 72 proposed** cases covering 18 scenarios across both layouts/themes, including fetch failure, malformed JSON/schema/SDF and actual CID/SDF/autocomplete `ERR_ABORTED` request failures. Source reconstruction passed **1,227** checks. Full local evidence is committed in the frozen PR under `tests/baselines/evidence/stage4/pubchem/`; `source-audit.json` and `local-validation.json` are copied here.

`failed-candidate-verification.json` explicitly records `candidateConjunctionVerified: false`. `independent-verification.log.gz` preserves the original unchanged merge verifier's failed success assertion. Raw suite failures, complete run log, source/run identity and immutable failed archive are preserved. This reviewable evidence copy is intentionally **uncommitted**: neither the frozen candidate nor accepted integration was changed to attach failed-CI bookkeeping. The user's pre-existing `.gitignore` edit is preserved exactly.

The independent Stage 5 design deliverable is `/Users/fevange/Source/vibemol/out/test-artifacts/stage5-seam-audit-6c58355/report.md`, with full dependency lists and source provenance. The 17-let inventory is correct; only the trajectory pair are mirrors, while vibration's pair are authoritative. Broad cuts project 22 inputs each; proposed narrower boundaries are trajectory core **8**, vibration runtime/panel **13**, symmetry panel **11** (optional pure vibration-format cut **6**). No Stage 5 code or #11 fix was implemented.

The next production or diagnostic decision belongs to the human. The mailbox remains retired and its monitor paused.

The human corrected this coverage wording on 2026-10-17. `coverage-status-correction.json` supersedes the old “no timeout observed” description in archived reports. Original raw logs, assertions, artifact ZIPs and their sealed archive remain unchanged.

## Subsequent instrumented classification

The direct-human three-source diagnostic39062919011 passed tagged and integration and failed only candidate25fd30a. Expected IDs `[opal,classic]` / flags `[false,false]`; candidate actual `[basic,basic]` / `[true,true]`. Rendering settings match across sources. This is a candidate-only initialization regression, not a carried finding. See `../migration-diagnostic-ci-39062919011/README.md`. PR24 stays held; no production fix or merge followed. Earlier unclassified reports remain historical snapshots.
