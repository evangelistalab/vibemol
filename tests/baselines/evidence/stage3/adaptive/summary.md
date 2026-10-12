# Stage 3 adaptive caches — draft evidence

Eleven `editAdaptive*` module caches now use the existing lazy memoized `els` helper. Registration and priming remain at the original nine chip and two Build/Symmetry popover wiring points. A missing node can still resolve later; a detached cached node is never silently refreshed. IDs, object keys, null guards, listener installation and keyboard behavior are preserved.

Parent: merged Build PR #8, `4db82178ee662735059717c006e10aff70592044`. The preceding Build CI conjunction is saved separately in [ci-38162234951](../build/ci-38162234951/summary.md); it is evidence for Build only. **The adaptive candidate's complete CI result is pending. This draft is not authorized to merge.**

## Inventory and source audit

All eleven queries remain unconditional statements in the app IIFE. These lines refer to the merged parent and proposed source; their lines happen to remain equal. The earlier pre-stage audit's offsets are retained separately in [binding-inventory.json](binding-inventory.json).

| Wiring site | Cache field | DOM ID | Parent query / proposed registration |
| --- | --- | --- | --- |
| Adaptive chips | `editAdaptiveAddAtomBtn` | `editAdaptiveAddAtomBtn` | 8089 / 8089 |
| Adaptive chips | `editAdaptiveSymmetryBtn` | `editAdaptiveSymmetryBtn` | 8090 / 8090 |
| Adaptive chips | `editAdaptiveSymmetryMetaEl` | `editAdaptiveSymmetryMeta` | 8091 / 8091 |
| Adaptive chips | `editAdaptiveCleanStructureBtn` | `editAdaptiveCleanStructureBtn` | 8092 / 8092 |
| Adaptive chips | `editAdaptiveCleanStructureMetaEl` | `editAdaptiveCleanStructureMeta` | 8093 / 8093 |
| Adaptive chips | `editAdaptiveShiftComBtn` | `editAdaptiveShiftComBtn` | 8094 / 8094 |
| Adaptive chips | `editAdaptiveShiftComMetaEl` | `editAdaptiveShiftComMeta` | 8095 / 8095 |
| Adaptive chips | `editAdaptiveAlignPrincipalBtn` | `editAdaptiveAlignPrincipalBtn` | 8096 / 8096 |
| Adaptive chips | `editAdaptiveAlignPrincipalMetaEl` | `editAdaptiveAlignPrincipalMeta` | 8097 / 8097 |
| Build/Symmetry popovers | `editAdaptiveAddAtomPopoverEl` | `editAdaptiveAddAtomPopover` | 8223 / 8223 |
| Build/Symmetry popovers | `editAdaptiveSymmetryPopoverEl` | `editAdaptiveSymmetryPopover` | 8224 / 8224 |

Module `let` declaration lines: **302 → 291**, with 15 of the stage's 41 cache bindings converted cumulatively. App length remains **33,037 lines** and the top-level function count remains **1,181**. The whole accepted stage is 40 accessors plus one alias, with corrected target 306 → 265; the older 313 → 270 used the pre-Stage-2, unsegmented baseline.

[source-audit.json](source-audit.json) verifies the entire app is byte-exact after only the eleven declarations/registrations and 75 lexical reference substitutions. All **1,190** existing function declarations, including nine nested declarations, match exactly after those substitutions; 14 function bodies reference this group. There are no shadowed `els` references. The QA source remains byte-identical to the merged parent.

`calculationsPanel` and `measurementsPanel` remain module controller lets. `helpRestoreFocusEl` remains focus-restoration state. The `canvasAdaptiveMenuEl` alias and every other cache group are unchanged. The periodic-table controller has **19 explicit dependencies before and after this group**, including nine DOM inputs; its planned `els` hand-off belongs to a later group and its actual reduced count remains unmeasured.

## Local characterization and firing counts

`make check` passed and all **428 JavaScript / 16 Python** unit tests passed. Two local characterization runs each captured **102** checkpoints, matched the unchanged goldens with the approved float-only tolerance, and repeated **exactly**. There were no session pixel changes. OS/browser provenance is Darwin 25.6.0, arm64, Chromium 145.0.7632.6. CI remains the golden capture home; this work does not re-record goldens.

All **43** identities passed in eight run/launch/theme contexts after mode changes, panel transitions and session restore. Every reason minimum passed, including observer mode firings beyond the explicit checks. Actual **local** counts follow; these are not an adaptive CI gate result.

| Run | Launch | Theme | Presented checkpoint | Mode switch | Observer panel transition | DOM replacement | Session restore |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | Workbench | Light | 39 | 408 | 1052 | 5319 | 1 |
| 1 | Workbench | Dark | 39 | 408 | 1064 | 5434 | 1 |
| 1 | Legacy | Light | 32 | 9 | 669 | 2969 | 1 |
| 1 | Legacy | Dark | 32 | 9 | 678 | 3078 | 1 |
| 2 | Workbench | Light | 39 | 408 | 1064 | 5319 | 1 |
| 2 | Workbench | Dark | 39 | 408 | 1052 | 5430 | 1 |
| 2 | Legacy | Light | 32 | 9 | 669 | 2965 | 1 |
| 2 | Legacy | Dark | 32 | 9 | 681 | 3077 | 1 |

Minima per context: presented 39 Workbench / 32 legacy; mode switch 5 Workbench / 4 legacy; observer panel transition 2; DOM replacement 1; session restore 1. Workbench has 404 observed mode checks beyond four explicit calls; legacy has six beyond three. Aggregate: **284 presented, 1,668 mode, 6,929 panel, 33,591 DOM and 8 restore**. See [local-reason-counts.json](local-reason-counts.json) and [characterize-cache-identity.json](characterize-cache-identity.json).

## Manual verification

Verification used serial Playwright native pointer/DOM/keyboard events, preserved suite assertions and recorded screenshots on both `v0.9.5-pre-refactor` (`1c609b3`) and the proposed source. This records direct UI replays and agent screenshot inspection; it does not claim human actions. Generic characterization was not substituted for these interactions.

| Affected suite / probe | Workflows | Tagged base | Proposed source |
| --- | --- | --- | --- |
| `edit_tool.py` | Loaded/empty initial tool choice; arming and selection; atom/fragment/molecule placement and Escape ladder; keyboard, ARIA, modes, widths and both-theme rendering | Passed once | Passed once |
| `build_panel.py` | Search/filter/commit; retained selection and placement hosts; dock/float/minimize; mode suspension; saved layout, mobile and legacy reopen | Passed once | Passed once |
| `symmetry_panel.py` | Button/S entry; candidate/preview/apply/cancel/Undo; target and scene changes; Build coexistence; mode/layout persistence, keyboard and mobile | Passed once | Passed once |
| `workbench_bar.py` | All four modes; keyboard focus; panel checkmarks; 11 widths at 320–1920 px; themes; COM/orientation, Q/Focus and legacy quick actions | Passed once | Passed once |
| `floating_panels.py` | Live Build search/operator controls; drag/reopen and keyboard; touch, viewport bounds and dynamic handles | Passed once | Passed once |
| Legacy adaptive actions | Every chip/button/meta getter; COM, principal alignment, Undo, slash focus/close, Symmetry button/key close and Optimize, in both themes | Passed | Passed, including 43 identities after actions |

The action probe confirms COM at the origin within `1e-10`, principal-inertia off-diagonals below `1e-8`, pairwise-distance preservation within `1e-9`, exact Undo restoration and bond shortening after UFF. Action results and all nine chip states are exactly equal across sources. Existing test assertions and waits are unchanged; each existing suite ran once per source with no retry.

The additional, initially uncommitted action probe targeted a Workbench-only Transform button in the legacy launch. Source and captured DOM establish that locator mistake before any action executed. The corrected probe observes the loaded-scene Transform intent on a presented frame, citing `5f6a390` (v0.9.2). The first failed evidence remains in [classification.json](manual/tagged-base/actions-initial-targeting/classification.json); no production fix or existing-test relaxation accompanied the correction. Full result/log/screenshot links are in [manual-verification.json](manual-verification.json).

## CI gate and open defects

[browser-results.json](browser-results.json) explicitly records **adaptive CI pending**, with no actual suite total claimed. One CI run on the rebased adaptive candidate must establish **34 passing / 3 failing / 37**, both unchanged 102-capture runs, all 43 identities in eight contexts and all reason minima. Evidence from the merged Build parent cannot establish the adaptive candidate's conjunction.

The accepted failures remain identified by suite/workflow: `axis_gizmo.py` Escape interception prevents canvas focus; `mode_consistency.py` selection card covers Coordinates Delete; `smoke.py` #11 after the second download at either the trajectory or vibration `wait_for_video_idle`. Record which #11 site fires on this candidate. Any other failure stops; no rerun or gate adjustment is authorized.

Production #3, axis-gizmo, mode-consistency and #11 remain outside this refactor. The `#appearanceMaterialPreset` intermittent remains open against Stage 3; the `looks.py` material-families path is unchanged and stays reachable in the full suite. If it recurs, probe creation/replacement, cached identity and listener closure references against the parent before classification. Soak once at the complete stage boundary. This continuation ends at the adaptive draft; no other group or draft merge is authorized.
