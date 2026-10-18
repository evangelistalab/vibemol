**Stopped: CI gate miss; this PR remains unmerged.**

Consolidates nine Symmetry DOM-cache lets into the existing private `els` table, and resolves the shared canvas launcher alias to one canonical `els.displayWindowAdaptiveMenuEl` field. Queries, listeners, null guards and priming remain at their original points. The canonical launcher uses its original single query and plain snapshot field; it gains no second accessor.

Mutable module lets **275 → 265**, reaching the Stage3 let target. App conversion is **+86/−86**, 33,069 lines and 1,181 top-level function declarations. All 1,190 existing function declarations and the complete app match the independent audit after **81 lexical substitutions in 10 functions**. Both panel controller lets and help-focus state remain intact.

This group introduces no controller or dependency interface. Its inventory is **nine caches + one canonical alias**, or eleven inventory items including the existing helper. That sum is not an extraction dependency count. The periodic-table controller remains at 19 actual inputs; its separately authorized hand-off follows this PR.

## Binding inventory

| Cache / alias | DOM ID | Original query |
| --- | --- | ---: |
| `canvasAdaptiveMenuEl` | `displayWindowAdaptiveMenu` | 6952 |
| `editSymmetryTargetSummaryEl` | `editSymmetryTargetSummary` | 8229 |
| `editSymmetryExactResultCardEl` | `editSymmetryExactResultCard` | 8230 |
| `editSymmetryExactResultEl` | `editSymmetryExactResult` | 8231 |
| `editSymmetryToleranceSelectEl` | `editSymmetryToleranceSelect` | 8232 |
| `editSymmetryElementSelectEl` | `editSymmetryElementSelect` | 8233 |
| `editSymmetryCandidatesEl` | `editSymmetryCandidates` | 8234 |
| `editSymmetryApplyBtnEl` | `editSymmetryApplyBtn` | 8235 |
| `editSymmetryCancelBtnEl` | `editSymmetryCancelBtn` | 8236 |
| `editSymmetryAutoBtnEl` | `editSymmetryAutoBtn` | 8237 |

All nine helper registrations occupy the original query lines. The bridge retains its `canvasAdaptiveMenuEl` key and reads the canonical entry. The field is assigned once at the original const lookup; its previous redundant alias line becomes an explanatory comment. The completed cache inventory is 40 accessor conversions plus one alias. Source audit, binding inventory and reproducible scripts are in `tests/baselines/evidence/stage3/symmetry/`.

## Manual verification

Tagged base: `v0.9.5-pre-refactor` (`1c609b3`, appSHA8f782e42993468ec3abcf513b7befdae5c5e67dd8885a8883f3bdfcb0aba95b5). Proposed appSHA40853e5b547e34e8fa9e7dddcc5d11d4df50fe7186de1d9dad4130d302cfc95c. Verification uses unchanged suite replay and native browser events, without claiming human interaction.

All four affected stock suites passed once on each source, with identical test hashes, assertions and waits: `symmetry_panel.py`, `workbench_bar.py`, `workbench_consistency.py`, `floating_panels.py`. Proposed durations are22.83/30.57/41.78/35.77s. These cover preview/cancel/apply/Undo, selection, mode suspension and return, Build coexistence, focus/Escape, panel/dock/float/minimize/reopen, saved layout and responsive behavior.

The additional native matrix passed all four Workbench/legacy × light/dark cases on each source, with **exactly equal observations** and no page errors. Each case exercises Td preview/Cancel/Apply, element-guide selection, Apply Undo/Auto/Auto Undo, two offered tolerance values, mode suspension, keyboard close/reopen, shared-launcher mode projection, Coordinates/Camera exclusivity,390px responsive activation and a real file-input scene change. The fixture explicitly reopens a transient legacy popup after Undo and activates the inspected compact tab before checking bounds, preserving the existing lifecycle. Initial new-collector mistakes (fixture extension/readiness, unsupported tolerance and lifecycle assumptions) are retained as diagnostics; no shipped assertion, wait or production behavior was changed to resolve them.

Existing 0.9.x findings remain carried: #3, #11, axis Escape, mode Coordinates Delete and #17; #5/#14/#15 remain separate follow-ups. The unchanged #17 direct-switch/bounds assertions and failed evidence stay preserved. No accepted CI workflow is added.

## Validation and one-candidate CI

`make check` and **433 JS / 29 Python unit tests** passed. Local characterization passed **102 unchanged captures twice**, exact serialized repeat and zero diagnostic pixel differences in1016.04s. All **52 composed slots across eight contexts** independently passed the current exercise validator and every firing minimum. Workbench is47live+5issue-backed absent; legacy48live+4absent. Actual mode counts are408Workbench/9legacy, presented39/32; panel transitions669–1064, DOM replacements2966–5432, session restore1 in every context. No baseline re-recording is authorized. Local renderer observation: Chromium145.0.7632.6, ANGLE/Vulkan SwiftShader (LLVM10.0.0); the exact GPU strings are saved with the source hash.

The single automatic candidate run [38994402382](https://github.com/evangelistalab/vibemol/actions/runs/38994402382), attempt 1, **failed the aggregate gate: 33 passing / 4 failing / 37 executed once**. The three accepted raw workflows remain unchanged. The additional failure is `edit_tool.py`: after switching Transform → Build at a 320×1000 viewport, the existing `.wb-tools` assertion `el.scrollWidth <= el.clientWidth + 1` fails with `AssertionError: 320`. This is a gate miss, not an infrastructure failure. Its tagged-base status is unclassified; no reproduction, retry, production fix or gate change was performed. **Do not merge this candidate.**

The other conjunctions were independently checked against this run's downloaded raw artifacts and validated checkout/source identity. Both 102-capture workers match unchanged committed goldens and each other exactly, with zero diagnostic pixel differences. All 52 composed slots in all eight contexts satisfy the fixed Workbench 47-live+5-known-absent / legacy 48-live+4-known-absent compositions and current firing minima. Checks/unit and WebKit passed. Worker green means evidence collection; the browser join remained failed locally and on CI.

Smoke #11 fired at **trajectory after the second download**; the vibration video-export section was not reached. Looks completed successfully in **1905.27s / 31.75min**, including both Studio and Properties `material_families` paths; no material-preset timeout recurred on this run. The historical intermittent remains open. CI used Playwright 1.64.0 / Chromium 156.0.8078.4 with Linux SwiftShader.

Actual full workflow time, creation to final job completion including setup, queues, artifacts and joins, was **1977s / 32.95min**, versus **132.93min**: 99.98min less, **75.21% reduction / 4.03× speedup**. This is a nonpassing cold-cache run (all eight restores missed), not acceptance evidence. The critical worker was balanced-3 (1919.05s browser batch, 1958s job); Smoke was not critical. Characterization workers took 923.00/1082.85s internally (967/1133s jobs), then a 15s join; browser join took 13s.

Frozen head `537e95ff462b5f2eb5fd6d3518e4525c0ea18e2f`, base `e35da9ca4721ad0645f9b0744aa38bfd9ca4b18d`, and tree `65706809c7c337ee42a11a531e34eb2bb09c2000` remain unchanged. GitHub checkout `307d59a03744db9ba803937f1ad7bc1b2544337d` has the same tree and the exact base/head parents. Integration remains at **let 275**; let 265 exists only on the unmerged candidate. Colors and the stage-boundary soak have not started.

## Prior immutable evidence carried here

Selection #18 merged/pushed as`e35da9c` only after its own run38989104040 proved the complete34/3/37/102x2/52x8 conjunction. #11 fired at vibration after its second download; Looks17.03min, full CI31.97min (75.95% less than132.93min,4.16×, eight cold cache misses). Its historical #hint incomplete is classified as a flake under the user's pre-decided34/3 outcome, without gate or baseline changes. Raw/compressed logs, structured captures, exact counts and source/run provenance are committed on this later branch; its tested candidate was not changed. CI19's separately sourced sharding/performance evidence is carried with its own provenance.

AGENTS keeps exactly one canonical tagged-base rule adjacent to the stop paragraph; all broader stop language defers to it. Live inventory52 is explicit and historical43-slot records remain historical. The mailbox handoff records blocker 2 before any Symmetry merge or Colors/soak work. No next-stage feature is included.
