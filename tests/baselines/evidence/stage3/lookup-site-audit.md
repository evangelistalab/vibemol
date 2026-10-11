# Stage 3 pre-code lookup audit

Source: `e4b5e498fe818171e3205313667614cfd8d2832c` (PR #7 merge). `app.js` SHA-256: `481543d9158aaff114f73b9113baea4b00b1cdf318627546df1ff668425eebd6`.

The requested 43-name set contains **40 direct DOM lookups, one DOM alias, and two controllers**. There are **41 existing DOM caches**. No application code has been changed.

Every lookup is in the anonymous app IIFE beginning at `app.js:1`. None has a conditional, loop, lazy-open callback, or `initCalculations()` ancestor. The queries occupy four separate wiring blocks, rather than one contiguous point. The two controller constructions are later, at lines 11718 and 11743.

The following is the complete 43-name inventory, grouped by wiring site. Lines refer to the immutable pre-stage source. The function for every row is the app IIFE.

## Side-panel control wiring (1)

| Binding | DOM ID or value | Query line | Assignment line | Prefix group |
|---|---|---:|---:|---|
| `canvasAdaptiveMenuEl` | `displayWindowAdaptiveMenu` | [6940](/Users/fevange/Source/vibemol/assets/app/js/app.js:6940) | 6941 | `remainder` |

## Selection/old Atoms menu wiring (16)

| Binding | DOM ID or value | Query line | Assignment line | Prefix group |
|---|---|---:|---:|---|
| `editAtomsMenuEl` | `editAtomsMenu` | [7879](/Users/fevange/Source/vibemol/assets/app/js/app.js:7879) | 7879 | `editAtomsMenu*` |
| `editAtomsMenuBodyEl` | `editAtomsMenuBody` | [7880](/Users/fevange/Source/vibemol/assets/app/js/app.js:7880) | 7880 | `editAtomsMenu*` |
| `editAtomsMenuCurrentEl` | `editAtomsMenuCurrent` | [7881](/Users/fevange/Source/vibemol/assets/app/js/app.js:7881) | 7881 | `editAtomsMenu*` |
| `editSelectionTranslateCueEl` | `editSelectionTranslateCue` | [7882](/Users/fevange/Source/vibemol/assets/app/js/app.js:7882) | 7882 | `editSelection*` |
| `editSelectionTranslateCueButtonEl` | `editSelectionTranslateCueButton` | [7888](/Users/fevange/Source/vibemol/assets/app/js/app.js:7888) | 7888 | `editSelection*` |
| `editSelectionRotateCueButtonEl` | `editSelectionRotateCueButton` | [7889](/Users/fevange/Source/vibemol/assets/app/js/app.js:7889) | 7889 | `editSelection*` |
| `editSelectionCoordinationCueButtonEl` | `editSelectionCoordinationCueButton` | [7890](/Users/fevange/Source/vibemol/assets/app/js/app.js:7890) | 7890 | `editSelection*` |
| `editSelectionMetalBondingCueButtonEl` | `editSelectionMetalBondingCueButton` | [7891](/Users/fevange/Source/vibemol/assets/app/js/app.js:7891) | 7891 | `editSelection*` |
| `editSelectionBondOrbitCueButtonEl` | `editSelectionBondOrbitCueButton` | [7892](/Users/fevange/Source/vibemol/assets/app/js/app.js:7892) | 7892 | `editSelection*` |
| `editSelectionBondDistanceCueButtonEl` | `editSelectionBondDistanceCueButton` | [7893](/Users/fevange/Source/vibemol/assets/app/js/app.js:7893) | 7893 | `editSelection*` |
| `editSelectionBondOrderCueButtonEl` | `editSelectionBondOrderCueButton` | [7894](/Users/fevange/Source/vibemol/assets/app/js/app.js:7894) | 7894 | `editSelection*` |
| `editSelectionAddFragmentCueButtonEl` | `editSelectionAddFragmentCueButton` | [7895](/Users/fevange/Source/vibemol/assets/app/js/app.js:7895) | 7895 | `editSelection*` |
| `editSelectionDeleteCueButtonEl` | `editSelectionDeleteCueButton` | [7896](/Users/fevange/Source/vibemol/assets/app/js/app.js:7896) | 7896 | `editSelection*` |
| `editSelectionFragmentCuePopoverEl` | `editSelectionFragmentCuePopover` | [7897](/Users/fevange/Source/vibemol/assets/app/js/app.js:7897) | 7897 | `editSelection*` |
| `editSelectionCoordinationCuePopoverEl` | `editSelectionCoordinationCuePopover` | [7898](/Users/fevange/Source/vibemol/assets/app/js/app.js:7898) | 7898 | `editSelection*` |
| `editSelectionMetalBondingCuePopoverEl` | `editSelectionMetalBondingCuePopover` | [7899](/Users/fevange/Source/vibemol/assets/app/js/app.js:7899) | 7899 | `editSelection*` |

## Adaptive chip wiring (9)

| Binding | DOM ID or value | Query line | Assignment line | Prefix group |
|---|---|---:|---:|---|
| `editAdaptiveAddAtomBtn` | `editAdaptiveAddAtomBtn` | [8077](/Users/fevange/Source/vibemol/assets/app/js/app.js:8077) | 8077 | `editAdaptive*` |
| `editAdaptiveSymmetryBtn` | `editAdaptiveSymmetryBtn` | [8078](/Users/fevange/Source/vibemol/assets/app/js/app.js:8078) | 8078 | `editAdaptive*` |
| `editAdaptiveSymmetryMetaEl` | `editAdaptiveSymmetryMeta` | [8079](/Users/fevange/Source/vibemol/assets/app/js/app.js:8079) | 8079 | `editAdaptive*` |
| `editAdaptiveCleanStructureBtn` | `editAdaptiveCleanStructureBtn` | [8080](/Users/fevange/Source/vibemol/assets/app/js/app.js:8080) | 8080 | `editAdaptive*` |
| `editAdaptiveCleanStructureMetaEl` | `editAdaptiveCleanStructureMeta` | [8081](/Users/fevange/Source/vibemol/assets/app/js/app.js:8081) | 8081 | `editAdaptive*` |
| `editAdaptiveShiftComBtn` | `editAdaptiveShiftComBtn` | [8082](/Users/fevange/Source/vibemol/assets/app/js/app.js:8082) | 8082 | `editAdaptive*` |
| `editAdaptiveShiftComMetaEl` | `editAdaptiveShiftComMeta` | [8083](/Users/fevange/Source/vibemol/assets/app/js/app.js:8083) | 8083 | `editAdaptive*` |
| `editAdaptiveAlignPrincipalBtn` | `editAdaptiveAlignPrincipalBtn` | [8084](/Users/fevange/Source/vibemol/assets/app/js/app.js:8084) | 8084 | `editAdaptive*` |
| `editAdaptiveAlignPrincipalMetaEl` | `editAdaptiveAlignPrincipalMeta` | [8085](/Users/fevange/Source/vibemol/assets/app/js/app.js:8085) | 8085 | `editAdaptive*` |

## Build/Symmetry wiring (15)

| Binding | DOM ID or value | Query line | Assignment line | Prefix group |
|---|---|---:|---:|---|
| `editAdaptiveAddAtomPopoverEl` | `editAdaptiveAddAtomPopover` | [8211](/Users/fevange/Source/vibemol/assets/app/js/app.js:8211) | 8211 | `editAdaptive*` |
| `editAdaptiveSymmetryPopoverEl` | `editAdaptiveSymmetryPopover` | [8212](/Users/fevange/Source/vibemol/assets/app/js/app.js:8212) | 8212 | `editAdaptive*` |
| `editBuildSearchEl` | `editBuildSearch` | [8213](/Users/fevange/Source/vibemol/assets/app/js/app.js:8213) | 8213 | `editBuild*` |
| `editBuildAtomsHostEl` | `editBuildAtomsHost` | [8214](/Users/fevange/Source/vibemol/assets/app/js/app.js:8214) | 8214 | `editBuild*` |
| `editBuildFragmentsHostEl` | `editBuildFragmentsHost` | [8215](/Users/fevange/Source/vibemol/assets/app/js/app.js:8215) | 8215 | `editBuild*` |
| `editBuildMoleculesHostEl` | `editBuildMoleculesHost` | [8216](/Users/fevange/Source/vibemol/assets/app/js/app.js:8216) | 8216 | `editBuild*` |
| `editSymmetryTargetSummaryEl` | `editSymmetryTargetSummary` | [8217](/Users/fevange/Source/vibemol/assets/app/js/app.js:8217) | 8217 | `remainder` |
| `editSymmetryExactResultCardEl` | `editSymmetryExactResultCard` | [8218](/Users/fevange/Source/vibemol/assets/app/js/app.js:8218) | 8218 | `remainder` |
| `editSymmetryExactResultEl` | `editSymmetryExactResult` | [8219](/Users/fevange/Source/vibemol/assets/app/js/app.js:8219) | 8219 | `remainder` |
| `editSymmetryToleranceSelectEl` | `editSymmetryToleranceSelect` | [8220](/Users/fevange/Source/vibemol/assets/app/js/app.js:8220) | 8220 | `remainder` |
| `editSymmetryElementSelectEl` | `editSymmetryElementSelect` | [8221](/Users/fevange/Source/vibemol/assets/app/js/app.js:8221) | 8221 | `remainder` |
| `editSymmetryCandidatesEl` | `editSymmetryCandidates` | [8222](/Users/fevange/Source/vibemol/assets/app/js/app.js:8222) | 8222 | `remainder` |
| `editSymmetryApplyBtnEl` | `editSymmetryApplyBtn` | [8223](/Users/fevange/Source/vibemol/assets/app/js/app.js:8223) | 8223 | `remainder` |
| `editSymmetryCancelBtnEl` | `editSymmetryCancelBtn` | [8224](/Users/fevange/Source/vibemol/assets/app/js/app.js:8224) | 8224 | `remainder` |
| `editSymmetryAutoBtnEl` | `editSymmetryAutoBtn` | [8225](/Users/fevange/Source/vibemol/assets/app/js/app.js:8225) | 8225 | `remainder` |

## Analysis-controller construction (2)

| Binding | DOM ID or value | Query line | Assignment line | Prefix group |
|---|---|---:|---:|---|
| `measurementsPanel` | `window.VibeMolMeasurementsPanel.create(...)` — controller | No DOM query | 11718 | `remainder` |
| `calculationsPanel` | `window.VibeMolCalculationsPanel.create(...)` — controller | No DOM query | 11743 | `calculationsPanel` |

## Lifecycle findings

- `canvasAdaptiveMenuEl` aliases `displayWindowAdaptiveMenuEl`: the lookup is line 6940; the assignment is line 6941. It has no direct `getElementById` assignment of its own.
- `measurementsPanel` is a frozen controller (`panel`, `setOpen`, `isOpen`, `sync`), created at line 11718. Its DOM node is `measurementsPanel.panel`, built by `measurements-panel.js:create` and appended at module line 24.
- `calculationsPanel` is a frozen controller (`panel`, `setOpen`, `isOpen`, `sync`, `ensureBasis`, `showPlanes`, `setStatus`), created at line 11743. Its DOM node is `calculationsPanel.panel` with ID `subspacePanel`, built by `calculations-panel.js:create` and appended at module line 21.
- Neither controller is an element. Checking either controller directly against `getElementById` fails on the unchanged application. Their `.panel` identities can be checked separately.
- Four current queries return `null`: `editAtomsMenu`, `editAtomsMenuBody`, `editAtomsMenuCurrent`, and `editSelectionFragmentCuePopover`. No production node creation site exists for those IDs. Do not invent DOM or alter these guarded paths during consolidation.
- `helpRestoreFocusEl` remains focus-restoration state outside `els`. The non-leading `figurePanel` declarator at line 673 is also a controller, outside the 43-name set.

## Metrics and periodic-table inputs

| Measure | Pre-stage value | Proposed cache-only result |
|---|---:|---:|
| app.js lines | 32,928 | Record after implementation |
| Top-level function declarations | 1,181 | Record after implementation |
| Module-scope let declaration lines | 306 | 265 (remove 41 real caches) |
| Periodic-table explicit dependencies | 19 | Estimate 11; actual still unmeasured |

The existing metric counts two-space top-level declaration lines, matching Stage 2. Stage 2 already reduced the accepted Stage 1 app.js `let` count from 313 to 306 by moving seven renderer/selection bindings. The cumulative cache-only result would therefore be **313 → 265**, with the cache stage itself **306 → 265**. The earlier **313 → 270** figure used the pre-Stage-2 baseline and an unsegmented count; do not force it by moving controller state.

The periodic-table controller has ten non-DOM inputs and nine DOM inputs. Those nine are existing `const` bindings, outside this 43-name inventory: `elementColorBtn`, `elementColorOverlay`, `elementColorClose`, `periodicTableViewport`, `periodicTableCanvas`, `elementColorName`, `elementColorPicker`, `elementColorResetOne`, `elementColorResetAll`. Grouping them under `els` should leave 11 explicit inputs; report the actual factory count after implementation.

Read-only browser proof: [pre-code-node-proof.json](/Users/fevange/Source/vibemol/tests/baselines/evidence/stage3/pre-code-node-proof.json) records 387 passing node comparisons across all applicable Workbench/legacy modes and session restore. The two controller objects fail direct element comparison on the unchanged app; their `.panel` fields match. All values remain identical across the nine checkpoints. This probe does not implement the future panel-open/close invariant.

## Proposed amendment before the first sub-PR

Because lookups occupy separate wiring blocks, follow the requested lazy memoized-accessor design and preserve the original priming and listener-registration points. Cache only real node references; retain both panel controllers as module `let`s. Resolve the canvas alias to the same `els.displayWindowAdaptiveMenuEl` entry as its source, with no second accessor/query. Do not permanently memoize `null`, and do not hide a detached cached node by refreshing it before QA checks identity. The user accepted this corrected scope: 40 accessors plus one canonical-entry alias; both controllers remain module `let`s.

The first sub-PR should add **43 node-identity assertions**: 41 `els` fields plus the two controller `.panel` nodes. Evaluate them after each mode switch, every panel open/close, and session restore, independently of the unchanged 102 capture payloads. Include a negative check that replacing a live node while retaining its ID is detected. The null-only old nodes remain explicit in the inventory.

| Proposed order | Group | Genuine cache bindings | Passing coverage | Remaining thin paths |
|---:|---|---:|---|---|
| 1 | `editBuild*` | 4 | Build panel, edit tool, Build bonds/orbit, floating panels | Direct element/entity/palette events need the manual matrix |
| 2 | `editAdaptive*` | 11 | Edit tool, Build panel, symmetry panel, Workbench bar, floating panels | Meta/chip callbacks and legacy launch |
| 3 | remainder (`editSymmetry*`, canvas menu), plus periodic-table const inputs | 10 + 9 const inputs | Symmetry panel, periodic-table direct gate, Workbench bar/consistency | Shared menu mode/exclusivity interactions; open Looks intermittent |
| 4 | `editSelection*` | 13 | Transform selection, smoke, edit picking, Build bonds, floating panels | Coordination/metal popovers; missing fragment popover; known legacy collision/Escape defects |
| 5 | `editAtomsMenu*` | 3 | Indirect Build/legacy coverage | All three nodes are currently absent; guarded old paths are thinnest |
| — | `calculationsPanel` / `measurementsPanel` | 0; retain controllers | Calculations, Measurements, sessions | Check `.panel` identity after construction and restore; no controller extraction |

Each implemented sub-PR records its own inventory, full 37-suite sweep, original two failure locations, unchanged characterization gate, and direct workflow evidence. Merge the sub-PRs into `codex/element-cache-consolidation`; soak once at the stage boundary. Keep the `#appearanceMaterialPreset` intermittent open and probe any recurrence against this pre-change source before classifying it.

## Merge and validation evidence

[PR #7](https://github.com/evangelistalab/vibemol/pull/7) and [PR #10](https://github.com/evangelistalab/vibemol/pull/10) are merged. The corrected gate is **CI 34 passing / 3 failing / 37**: `axis_gizmo.py:130` (Escape routing), `mode_consistency.py:80` (selection card over Coordinates Delete), and original `smoke.py:4525` ([#11](https://github.com/evangelistalab/vibemol/issues/11), crop overlay after export; now caller 4531 / helper 88). Full PR #10 CI run 38110555939 reports those totals. Historical local 35/2/37 and prior Build CI 33/4/37 remain historical evidence. Confirm a new complete run under the corrected manifest before resuming #8 and the five remaining groups; any different result stops reopening. No #11 production fix is part of this stage.

GitHub CI passed checks/unit tests but stopped characterization at `$.sample/light/Display.geometry.molecule.bonds[6].z`: `2.375228488400047e-06` versus `2.3752284884000466e-06`. [Failed Linux job](https://github.com/evangelistalab/vibemol/actions/runs/38077486777/job/114287477705). That historical limitation is now resolved by the separate [PR #9](https://github.com/evangelistalab/vibemol/pull/9) portability audit, merged as `a1b00b72`. Two independent CI baseline jobs each captured twice identically. Float leaves use the approved tolerance; structure and other types remain exact. CI now reaches all 37 suites and exposes the two additional failures tracked in issue #4: `smoke.py:4525` (vibration Stop overlay closure) and `edit_picking.py:145`, called from `slab:298` (resize picking invalidation). The original lookup inventory and corrected cache scope remain unchanged.

Remaining groups, ordered by coverage: adaptive menu; periodic-table Element Colors DOM hand-off (split from the remainder, 19 dependencies before); symmetry/shared-menu remainder; selection controls; absent atoms-menu nodes. Controllers remain module lets. Every sub-PR carries its inventory and full CI 34/3/37 result; one soak at the stage boundary.
