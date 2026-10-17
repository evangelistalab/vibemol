**Held: candidate-only startup-migration regression; no production fix or merge.**

PubChem search/import/metadata lived in app.js alongside scene orchestration. Move its 19 implementations into `pubchem.js`, with one controller and **13 genuine explicit dependencies**, all used. The app retains its scene/record mutation callbacks, original DOM queries and late listener binding. Placing the new constructor at the old state block introduced the early-call availability regression documented below. Tracked app lets **265 → 262**; app **32,666 lines /1,163 direct function declarations**; module **480 lines /21 declarations**.

The controller owns busy/debounce/token state and the existing availability caches. Its inputs are `els`, `escapeHtml`, `setTooltipText`, `setHintMessage`, `parseXYZ`, `handleSceneDropRecords`, `setVolumes`, `setCurrentIndex`, `clearSceneMeshes`, `clearEditHistory`, `appendParsedVolumeRecord`, `finalizeLoadedVolumes`, and `setNavigationHint`. Browser/ECMAScript globals retain their existing role. The five DOM fields use the established shared table. Registration adds one versioned script, one syntax-check entry and the exact planned `VibeMolPubChem.createPubChemController` API contract through the existing additive manifest.

## Manual verification

- Immutable tagged `v0.9.5-pre-refactor` and proposed source each passed **72 native cases**: 18 scenarios across Workbench/legacy and light/dark. PubChem geometry/metadata, dialogs, request paths/counts, busy handling and prior-scene preservation matched exactly. Coverage includes click/Enter import, empty/3D-less results, HTTP/transport failure, malformed JSON/schema/SDF, metadata fallback, CID/SDF/autocomplete request aborts, debounce/cache filtering, busy reentry and stale-suggestion suppression. Abort evidence contains actual PubChem `ERR_ABORTED` failures. Raw network/collector diagnostics are retained separately.
- Independent source audit: **1,227 checks passed**. All **1,190 original declarations** accounted for: **19** moved implementations exact after inverse lexical substitutions; **1,171** other declarations byte-identical. Complete app/module reconstructions match, but that structural audit missed an incoming hoisted call before controller initialization and did not establish behavior neutrality. Both app-owned assignments retain their order through explicit callbacks.
- `make check`, **433 JS/29 Python** unit tests passed. Local characterization passed **102 unchanged goldens twice**, exact serialized repeat, **52 slots in eight contexts**, fixed **47+5 Workbench /48+4 legacy** composition and every observer/checkpoint minimum. Local duration **1018.67s**, Chromium **145.0.7632.6**. Golden payloads, shipped suites/assertions/waits, fixtures, QA and workflows are unchanged; the planned API addition is exact.

## CI — held: confirmed candidate-only regression

The first ordinary run [39057387687 attempt 1](https://github.com/evangelistalab/vibemol/actions/runs/39057387687) failed **32/5/37** against the unchanged **34/3/37** gate. The two extra suite failures are `reference_migration` in standalone `look_references.py` and its invocation by `looks.py`. This PR stays frozen at `25fd30a6e273fa289f17ec999b8528e82c061631`, unmerged. Integration stays at `6c58355` / **265** tracked lets; the proposed controller has **262** / **13 dependencies**.

The human then authorized one instrumented [three-source diagnostic, 39062919011 attempt 1](https://github.com/evangelistalab/vibemol/actions/runs/39062919011). The same repaired suite and helper ran once against each unchanged source, in parallel, with the original waits and expected values preserved. Both ids/flags and resolved appearance state were logged before either split assertion.

| Source | Expected IDs | Actual IDs | Expected flags | Actual flags | Full suite |
|---|---|---|---|---|---|
| Tagged `1c609b3` | `[opal, classic]` | `[opal, classic]` | `[false, false]` | `[false, false]` | passed |
| Integration `6c58355` | `[opal, classic]` | `[opal, classic]` | `[false, false]` | `[false, false]` | passed |
| PubChem `25fd30a` | `[opal, classic]` | `[basic, basic]` | `[false, false]` | `[true, true]` | failed |

Both controls also passed the second `[classic, classic]` iteration. The candidate stops at the original first failing predicate. The public exported `appearance.look` is absent in all three (it is import-only); the stored legacy Opal payload, resolved references and complete resolved settings were recorded. Resolved rendering settings match exactly across all three: settings restoration happened, while candidate reference identity/migration bookkeeping did not finish. Three original artifact ZIP digests, raw checkout identities, common harness hashes and raw-log/JSONL/report comparands were independently matched. Browser **156.0.8078.4**, Playwright **1.64.0**, Linux.

**Initialization regression:** appearance API publication remains after migration; it was not moved across autosave. Instead, startup `restoreAppearancePresetAutosave()` at candidate app.js:27745 synchronously imports settings → `afterApplySettings` → `updateSidePanel` → the hoisted `updatePubChemMetadataPanel` wrapper at :30609. That wrapper now reads `const pubchemController`, constructed only at :30630. The original metadata renderer was callable before the later PubChem state block. The new early read is in the const's temporal dead zone; the restore catches the error before `afterImportSettings` can record legacy migration. The earlier extraction audit missed this incoming call before constructor availability.

Apply the human's candidate-only branch: **regression, stop and report**. No production fix, new ordinary run, gate exception, carry classification or merge followed. The narrow proposed next cut is to make controller construction available before startup restore while retaining late control binding, after verifying all constructor inputs are initialized; this is a proposal, not an implemented change.

The ordinary characterization join passed **102 unchanged goldens twice / exact repeat / zero diagnostic pixel changes**, **52 slots × eight contexts** with fixed **47+5 Workbench /48+4 legacy** composition and all minima. Checks **433 JS/29 Python** and WebKit passed. #11 fired at **trajectory after the second download**; vibration export was not reached. **`#appearanceMaterialPreset` was not covered this run:** Looks failed before either Studio/Properties material-family path, so nonrecurrence cannot be assessed and the risk remains open.

Ordinary sharded wall time: **31.95 min**, **75.96% less /4.161×** versus132.93min, eight cold-cache misses. The failed ordinary run and classification diagnostic remain separate evidence; neither supplies a complete merge conjunction. Evidence: `tests/baselines/evidence/stage4/pubchem/ci-39057387687/` and `tests/baselines/evidence/stage4/pubchem/migration-diagnostic-ci-39062919011/`.

## Carried findings

Reclassify **#21** as an intermittent **Edit toolbar layout collapse** at 320px: clientWidth **12** vs scrollWidth **442**, hidden trigger and empty hidden menu. Rank it above #17 in the 0.9.x batch. This changes its recorded impact/order; the accepted CI failing set stays the original three workflows. Other carried defects and the material-preset intermittent remain open. Stage 5 design is accepted, with corrected 5a/5b/5c ordering and the mirrored-clock #11 hypothesis recorded as refuted. The #11 defect itself remains open. This PR contains no Stage 5 implementation or defect fix.

Evidence: `tests/baselines/evidence/stage4/pubchem/` and `tests/baselines/pubchem-validation.json`.
