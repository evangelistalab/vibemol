# Stage 5 seam audit — design only

Audited immutable commit `6c583556bcc84bff9442602a7dd8aed056b4a660` (accepted Stage 3). App SHA-256: `03beb5dc5739daecf46a2dfa989565983d4f7f17743e9a83f560ec413214456d`. Line references below refer to this commit, not the subsequently edited Stage 4 worktree. The initial read-only audit changed no production, test, golden, repository documentation, branch, issue or commit and ran no browser, suite or network request. Its accepted design was subsequently promoted to repository notes at the direct human request; Stage 5 production remains untouched.

The reviewer input was read only at the user's explicit direction: `ops/review/stage5-seam-notes.md`. The retired mailbox's protocol, state and reply were not read or changed.

## Conclusion

The **17 module lets** inventory is correct. The claim that **four are duplicated playback clocks is not**. Two trajectory names are compatibility mirrors. The two vibration names are its only authoritative live playback clock. Vibration has no `vib.playing`, `vib.lastStepMs` or `vib._lastStepMs` counterpart in the audited sources.

The existing trajectory clock is a discrete frame/FPS/end-point policy. Vibration advances continuous phase with a capped elapsed time. Reusing its current `advance` function would change vibration behavior. There is a possible shared elapsed-time primitive, but it is not the existing complete abstraction, and it does not itself remove four duplicated states.

I agree with **vibration before the remaining symmetry presentation work**. I do not recommend the reviewer's 5a unchanged. A corrected 5a can remove the **two actual trajectory mirrors** and establish explicit read/write playback boundaries while retaining both existing advancement policies. Vibration's authoritative pair should become private controller state during 5b; moving it is not deduplicating another clock. A generalized discrete/continuous clock is optional subsequent design work. The shared mirrored-clock explanation for #11 is refuted; no #11 side-effect fix is justified.

Broad one-controller extractions project **22 inputs apiece** under the explicit boundaries below. They should not be written as those cuts. Narrower real cuts project **trajectory 8**, **vibration runtime/panel 13**, and **symmetry panel 11** inputs. These narrower proposals deliberately leave named host responsibilities outside each module; they are not claims that every feature mention disappears from app.js. No new `deps.host`/service-bag wrapper is proposed to disguise a large interface.

Supporting files named below (`source/`, `projections.json`, `app-analysis.json`, `provenance.json`, and `analyze.cjs`) refer to the original audit directory `out/test-artifacts/stage5-seam-audit-6c58355/`. All source references remain pinned to the immutable accepted commit above.

## Method and counting convention

`source/` contains `git show` snapshots from the accepted commit; `provenance.json` records every file hash. `analyze.cjs` uses Babel bindings/scopes, referenced identifiers, assignments, incoming callers and write locations. `app-analysis.json` preserves full per-function external references and module-binding reads/writes. Name-based feature inventories were manually corrected for real ownership: for example `isMirrorSymmetryEligible` at app.js:3574 is a bond-radius helper, not the Symmetry tool. `applyMasterFrameToSyncedTrajectories` is in the trajectory scope even though the singular `trajectory` spelling does not match its name. Parsing helpers with no `vibration` in their names were included when evaluating the broad vibration boundary.

Counts below are genuine top-level factory inputs, including semantic host callbacks, mode/current-record getters, metadata and module references. Standard JavaScript/browser facilities (`Math`, typed arrays, `document`, RAF, timers, DPR) are listed as platform facilities, not application dependencies. A cohesive existing module counts once, with the methods it needs named below. A DOM-only `els` object counts once, with all fields listed. Mutable application context is exposed through specific getters rather than a one-time copied value. The broader cuts count their host edit/geometry/window operations individually. Feature constants that move into their owning feature are not constructor dependencies; their public compatibility exports would be retained for app callers.

## The 17 module lets

| Feature | Names at accepted source | Count |
|---|---|---:|
| Trajectory | `trajectoryVideoController` :53; `userDismissedTrajectoryPopover` :1627; `trajectoryUiController` :5273; `trajectoryPlaying` :5298; `trajectoryLastStepMs` :5299 | 5 |
| Symmetry | `symmetryController` :1233; `symmetryPreviewState` :1234; `symmetryPopoverAnalysisCache` :1235; `symmetryPopoverCurrentGroupLabel` :1236; `symmetryPopoverResultHighlightTimer` :1237; `symmetryPopoverElementsRenderKey` :1238; `symmetryPopoverSelectedElementId` :1239 | 7 |
| Vibration | `vibrationVideoController` :54; `vibrationPlaying` :5301; `vibrationLastStepMs` :5302; `vibrationHideSmallFrequencies` :5303; `vibrationPanelLayoutRaf` :5304 | 5 |

These are not seventeen equivalent feature-data variables: four are controller holders, several are panel/cache state, and only the trajectory pair duplicates record/master clock data. The reviewer's six remaining symmetry *presentation* lets plus one existing controller is correct.

### Actual playback ownership

- Trajectory's authoritative independent clock is on `info.traj` (`playing`, `_lastStepMs`, frame/FPS/loop); synchronized trajectories use `sceneGraphController`'s `syncMaster` (`playing`, `lastStepMs`, frame/FPS). See app.js:5361–5375 and :6277–6346.
- `trajectoryPlaying` is copied from the active trajectory/master at :5558, :6218, :6343 and :6359. Its **only read** is the no-trajectory cleanup condition at :6280. Removing it requires preserving the cleanup and UI synchronization when the last playing independent trajectory disappears; simply deleting the conditional's mirror term can change that edge case.
- `trajectoryLastStepMs` has **zero reads** and nine assignment sites (:5559, :6196, :6219, :6344, :6360, :6382, :7166, :7212, :7221). It is a write-only compatibility shadow.
- The trajectory exporter already gets and sets the **record/master** values directly at :7141–7166. It does not read either compatibility shadow. The comment describing the pair as video-export compatibility is stale relative to this adapter.
- Vibration's real playback state is `vibrationPlaying` / `vibrationLastStepMs`. Its volume metadata holds phase, selected mode, amplitude, speed, equilibrium and frameBuffer, not a second playing/timestamp pair (:5583–5606, :30329–30340). The animation loop reads these two module values directly (:6114–6149), and the exporter uses them directly (:7266–7272).
- Vibration state has legitimate external transactions that must call its future API: mode/scene changes, panel close (:11671), coordinate edits, source attachment (:30343), batch export (:32334–32377), figure output (:32480–32505), session/recovery reset (:32644–32646), and normal controls (:28602–28676). Multiple code paths writing a single owner are not the same as two independently stored copies.

### Existing clock applicability

`trajectory-clock.js:25–38` computes integer frame steps using a rounded 1–120 FPS rate, retains sub-frame remainder, maps loop/end frames and returns `rawFrame`, `frame`, `playing`, `lastStepMs`, `advanced`. Its `normalize` also uses trajectory-specific `frameIndex/currentFrame`, `_lastStepMs`, `syncEnabled` (:4–14).

Vibration app.js:6127–6136 instead advances `phase += clamp((now-last)/1000, 0, 0.2) * speed * 2π`, with a first-tick seed, continuous phase and a one-cycle export boundary. The existing helper cannot express that phase/speed/capped-delta policy without an additional method or changed semantics. A shared low-level elapsed-time function could preserve both policies only with their differences explicit; do not quantize vibration into trajectory frames or drop the vibration 0.2-second cap.

## Trajectory boundary and dependencies

### Broad candidate: 22 inputs — reject before implementation

Moving every trajectory-named app function plus the plural synchronization helper and UI forwarding helper would take metadata lookup, scene focus, frame playback, UI synchronization, panel lifecycle, and cross-feature mutual exclusion together. The complete input list is:

1. `els` — trajectory controls/panel DOM fields listed below.
2. `TrajectoryClock` — existing `normalize`, `mapFrame`, `advance`.
3. `TrajectoryUi` — existing `createTrajectoryUi`.
4. `sceneGraphController` — scene/layer/focus enumeration and master-state ownership.
5. `getActiveRecord` — live `currentIndex`/`volumes` selection.
6. `isEditMode` — live mode predicate.
7. `focusScene`.
8. `activateSceneFocusRecord`.
9. `applyAtomCoordinateFrame` — app geometry/bond/selection update operation.
10. `markSessionChanged`.
11. `getVideoController` — shared exporter instance, including `syncUi`, `isActive`, `isRecording`, `getTargetRecord`, `discardForTargetRecordChange`, `handlePanelClosed`, `resolveAdvance`.
12. `setElementTextPreservingNode`.
13. `setMotionPanelButtonGlyph`.
14. `setTooltipText`.
15. `restoreActiveVibrationEquilibrium`.
16. `syncVibrationControls`.
17. `setVibrationPlaybackState` — the existing two direct writes need a genuine state-owner API; not two copied values.
18. `setFloatingPanelOpen`.
19. `isFloatingPanelCurrentlyOpen`.
20. `closeExclusiveDisplayWindows`.
21. `NON_EDIT_WINDOW_ID` (`TRAJECTORY_PANEL`).
22. `updateDisplayWindowAdaptiveMenuUi`.

`els` covers `trajectoryPanel`, `trajectoryPanelBtn`, `trajectoryRow`, `trajectoryRow2`, `trajectoryBondModeNote`, `trajectoryFrameEl`, `trajectoryFrameLabel`, `trajectoryNowPlaying`, `trajectoryPlayBtn`, `trajectoryResetBtn`, `trajectoryLoopEl`, `trajectoryFpsEl`, `trajectorySceneListEl`, `trajectorySyncMasterEl`. Close buttons and the shared export DOM remain in the app's wiring when the shared exporter construction stays there. The broad candidate would privately own the UI holder, user-dismissal flag and compatibility pair; the video controller remains owned by the common renderer/export integration.

This count already keeps the common `createCanvasVideoExportController` construction in app.js. Pulling its renderer/crop/tooltip/recording configuration into this feature would add more dependencies, not improve the projection.

### Recommended different cut: playback/scene-clock core, 8 inputs

Proposed `trajectory-playback.js` owns the trajectory info validation, master/independent frame-clock normalization and advancement, frame application, play/pause/stop/reset/sync policy and dynamic-trajectory-bond eligibility. It retains authoritative clocks on their existing record/master objects. Move the 24 functions in app.js:5361–5440, :5465–5500 and :6156–6384 excluding `focusTrajectoryInfoScene`, plus the two pure predicates at :9187 and :9240. `cloneTrajectoryState` :28723 can also move as a pure export with no additional dependency. The two shadows can then be removed with the last-record cleanup explicitly preserved.

Its full input list is:

1. `sceneGraphController` — `getState`, `getScenes`, `listLayers`, `getFocusedScene`; the scene/master owners remain the same.
2. `getActiveRecord` — one existing app selection operation, not a scene/settings service bag.
3. `TrajectoryClock` — `normalize`, `mapFrame`, `advance`.
4. `applyAtomCoordinateFrame` — existing renderer/geometry adapter.
5. `markSessionChanged`.
6. `isEditMode`.
7. `syncTrajectoryControls` — existing host UI function, called at the original `syncUi` boundaries.
8. `getVideoController` — only target-record comparison and `resolveAdvance` in the core's tick path.

No DOM, metadata palette or render mesh is needed by this core. The existing UI rendering, focus activation, floating-window/exclusive behavior, vibration mutual exclusion, video construction/capture/restore, presets/sessions and batch/figure orchestration remain host-owned and call the exported core methods. Do not label those retained responsibilities as extracted.

The already-existing `trajectory-ui.js:4–5` interface has **17** flat inputs today. This is real existing coupling, not a new under-15 interface. A later UI regrouping should consume the genuine cohesive playback controller and explicitly expose its method surface rather than construct a new arbitrary callback bag. It is not part of this proposed 8-input core cut.

## Vibration boundary and dependencies

### Broad candidate: 22 inputs — reject before implementation

Taking runtime/panel rendering, panel lifecycle, undo-state clone, all ORCA/Psi4/JSON readers and matching/attachment together covers **42 declarations**, not just the reviewer’s name-grep count. Helper declarations without `vibration` in their names are part of the parser graph. The complete input list, with feature constants moved to their owner, is:

1. `els` — the vibration panel/control/spectrum/table DOM fields below.
2. `getRecords` — live `volumes` for attachment matching.
3. `getCurrentIndex` — live attachment preference and active-record index; do not pass a stale index.
4. `isEditMode`.
5. `snapshotAtomCoordinates` — common coordinate-edit helper, also used outside vibration.
6. `applyAtomCoordinateFrame`.
7. `markSessionChanged`.
8. `UI_PALETTE` — IR drawing colors.
9. `escapeHtml` — common app formatting helper.
10. `getVideoController` — shared exporter operations.
11. `setTooltipText`.
12. `setMotionPanelButtonGlyph`.
13. `updateDisplayWindowAdaptiveMenuUi`.
14. `closeExclusiveDisplayWindows`.
15. `NON_EDIT_WINDOW_ID` (`VIBRATION_PANEL`).
16. `setFloatingPanelOpen`.
17. `getElementSymbol` — preserve this caller’s metadata/fallback policy.
18. `ATOM_Z_TO_DATA`.
19. `ATOM_SYMBOL_TO_Z`.
20. `looksLikePsi4OutputText` — existing IO-utils export.
21. `parsePsi4Geometry` — existing parser export.
22. `BOHR_TO_ANG` — derive the current reciprocal identically for attachment conversions.

Feature-owned constants are `VIBRATION_KIND`, amplitude/speed defaults, the low-frequency threshold, IR minimum/sigma and the two cm⁻¹ display strings. These are immutable data, not hidden host callbacks. The generic conversion constant and both metadata tables remain counted explicitly.

This scope excludes common exporter construction and cross-feature event orchestration. Moving the full late click/change adapters too would additionally require `stopAllTrajectoryPlayback`, `syncTrajectoryControls` and `toNum`, so a whole-feature-with-all-wiring cut is larger still.

### Recommended different cut: vibration runtime and panel renderer, 13 inputs

Proposed `vibration.js` owns the 14 functions at app.js:5583–6149, its authoritative playing/timestamp pair, hide-small-frequencies flag and layout RAF. It owns mode validation/active-info normalization, equilibrium/phase application, phase advancement, spectrum/table rendering, control synchronization and deferred panel layout. The shared exporter holder remains in the app. It exposes explicit `getPlaybackState`/`setPlaybackState` (reset timestamp where the existing caller does), phase/restore/sync methods, hide-small flag get/set, layout cancellation, and feature constants needed by parser/undo callers.

Its complete inputs are:

1. `els`.
2. `getActiveRecord` — live selected record.
3. `snapshotAtomCoordinates`.
4. `applyAtomCoordinateFrame`.
5. `markSessionChanged`.
6. `isEditMode`.
7. `UI_PALETTE` — the IR fields currently used by spectrum rendering.
8. `escapeHtml`.
9. `getVideoController` — `isActive`, `isRecording` where needed by host wiring, `getTargetRecord`, `discardForTargetRecordChange`, `syncUi`, `resolveAdvance`.
10. `setTooltipText`.
11. `setMotionPanelButtonGlyph`.
12. `setVibrationPanelOpen` — existing host floating-window/exclusive operation; the controller invokes its no-data close branch at the original point.
13. `updateDisplayWindowAdaptiveMenuUi`.

`els` fields: `vibrationPanel`, `vibrationPanelBtn`, `vibrationRow`, `vibrationRow2`, `vibrationSpectrumWrap`, `vibrationSpectrumCanvas`, `vibrationSpectrumMeta`, `vibrationModeTableWrap`, `vibrationModeTable`, `vibrationModeTableBody`, `vibrationModeEmpty`, `vibrationNowPlaying`, `vibrationModeLabel`, `vibrationPlayBtn`, `vibrationFreqLabel`, `vibrationAmplitudeEl`, `vibrationSpeedEl`. If the existing host-bound hide-small checkbox is later moved with its listener, its DOM field joins `els`; its feature-state setter already exists in the proposed API. The original listeners remain bound at the original late app wiring point in this cut.

Retain the ORCA/Psi4/JSON readers, matching/attachment transaction, undo clone and generic geometry helper in app.js for this runtime cut. The common video adapters, mutually exclusive trajectory controls, panel show/close shell, session/recovery, batch and figure transactions call the new controller explicitly. No duplicate app playback pair remains.

A separate natural format cut is also available: pure reader declarations app.js:29329–30156 into `vibration-format.js`, **6 inputs**: `getElementSymbol`, `ATOM_Z_TO_DATA`, `ATOM_SYMBOL_TO_Z`, `looksLikePsi4OutputText`, `parsePsi4Geometry`, `BOHR_TO_ANG`. It owns the immutable `VIBRATION_KIND` tag. Matching/attachment still belongs to the file/scene host because it chooses and mutates loaded records. This is a genuine parser boundary, not a wrapper invented to reduce the runtime constructor count. It needs separate validation of JSON, Hessian matrices and Psi4 geometry/unit/intensity paths before any implementation is released.

## Symmetry boundary and dependencies

### Broad candidate: 22 inputs — reject before implementation

The existing `symmetry.js` really has **1,618 lines** and exports `VibeMolSymmetry` (:1611–1617), not `VibeMolElementUtils`. It already owns analysis, preview generation and `createEditSymmetryController` (:1571–1609). Its existing controller takes tolerance options; it does not own the app's six popover/presentation lets.

Moving all **37 actual tool functions** at app.js:18463–19092 together also takes scene-overlay rendering, selected-atom resolution, edit snapshots/Undo and Workbench launch coordination. Its full input list is:

1. `els` — the eleven fields below.
2. `Symmetry` — existing `createEditSymmetryController`, `analyzePointGroup`, `buildSymmetryPreview`, `describeSymmetryElements` (retain current null/fallback behavior).
3. `THREE` — guide geometry/material construction.
4. `Workbench` — `isDocked`, `setFocus`, `open`.
5. `getActiveRecord`.
6. `isEditMode`.
7. `workspaceEnabled` — stable launch-layout choice.
8. `getEditAtomSelection`.
9. `normalizeVolumeAtom`.
10. `resolveVolumeAtomId`.
11. `cloneCoordinateSnapshot`.
12. `finalizeCoordinateSnapshotEdit` — existing Undo/geometry/rebuild transaction.
13. `symmetryElementGuideGroup` — app scene ownership.
14. `disposeOverlayTree`.
15. `positionFloatingPopoverUi`.
16. `clearGestureVoidPreview`.
17. `hideSelectionCoordinationCuePopover`.
18. `hideSelectionFragmentCuePopover`.
19. `hideBuildPopover`.
20. `refreshGestureUi` — current `editGestureController.refreshUi()` operation, not a copied controller state.
21. `updateEditAdaptiveMenuUi`.
22. `setHintMessage`.

Tolerance constants (default/exact/max/options) and the existing analysis-controller instance move into their natural feature owner; they are not input-count tricks. `isMirrorSymmetryEligible` at :3574 stays with bond rendering.

### Recommended different cut: symmetry panel state/presentation, 11 inputs

Proposed `symmetry-panel.js` owns the existing analysis-controller instance and six popover/presentation lets, tolerance/cache keys, candidate and element options, selected-candidate state, result highlighting, reset/hide and render behavior. It takes the **24 functions** enumerated in `projections.json`. It exposes selection/tolerance/cache/reset/render operations and selection data for the app's existing apply transaction and guards. No app copies of the six states remain.

Its complete inputs are:

1. `els`.
2. `Symmetry` — `createEditSymmetryController`, `analyzePointGroup`, `describeSymmetryElements`.
3. `resolveEditSymmetryTarget` — existing selected/whole-structure target operation; record/selection/unit normalization remain owned by edit orchestration.
4. `resolveVolumeAtomId` — target cache identity.
5. `workspaceEnabled`.
6. `isEditMode`.
7. `clearSymmetryElementGuide` — existing scene-overlay teardown operation.
8. `renderSymmetryElementGuide` — existing scene-overlay rendering operation, receiving the selected element id explicitly rather than reading an app mirror.
9. `positionSymmetryPopover` — existing Workbench/dock-aware positioning function.
10. `updateEditAdaptiveMenuUi`.
11. `setHintMessage`.

`els` fields: `editAdaptiveSymmetryPopoverEl`, `editAdaptiveSymmetryBtn`, `editSymmetryCandidatesEl`, `editSymmetryToleranceSelectEl`, `editSymmetryExactResultCardEl`, `editSymmetryExactResultEl`, `editSymmetryElementSelectEl`, `editSymmetryTargetSummaryEl`, `editSymmetryApplyBtnEl`, `editSymmetryCancelBtnEl`, `editSymmetryAutoBtnEl`. The current panel subset does not itself read the trigger field, but the shared positioning owner does; including the existing canonical field is DOM grouping, not an extra non-DOM input.

The host keeps `showSymmetryPopover`, Workbench focus/open and sibling-popup cancellation, `positionSymmetryPopover`, target resolution, the Three.js guide tree/functions, `applyActiveSymmetryPreview`, `autoApplyHighestSymmetry`, snapshot/coordinate mutation and Undo finalization. Existing listeners call panel methods and the existing app apply/auto handlers at their original binding points. The host's apply/auto code reads/writes the controller's selection through methods; it does not retain a second `symmetryPreviewState`. The existing geometry and transaction dependencies are not silently part of the 11-input controller; they are explicitly retained host responsibilities.

## #11 mirrored-clock hypothesis — refuted

The filed symptom really has appeared in **both exporters**. The accepted Symmetry CI 39034824420 reached vibration and failed there after the second download; accepted Colors CI 39039061120 failed at trajectory and did not reach vibration export. These are different recorded sites, not proof of identical causes.

The common exporter supplies a more direct lifecycle seam than the suggested four-mirror story:

1. `trajectory-video.js:255–272` privately owns an export state machine with `mode`, target record, crop, recorder, pending-stop and restore state. `isRecording` / `isActive` at :283–288 read **`state.mode`**, not playback clocks. Overlay visibility and its `dataset.state` derive from that mode (:332–344).
2. `getPlaybackState` is listed as a required option (:244) but is **never invoked** anywhere in the 825-line module. The trajectory's supplied getter already reads the authoritative record/master state, and the vibration getter reads its authoritative pair.
3. Natural end flows through feature advancement → `resolveAdvance` (:644–648) → `pendingStopAfterRender` → `copyFrameAfterRender` (:504–518) → `stopRecording` → MediaRecorder `onstop` → `finalizeExport`.
4. Manual second-stop flows from the common Save button handler (:738–748) directly into `stopRecording` (:473–501). It stops playback and the recorder; it does not decide idle status from a playing mirror.
5. `finalizeExport` sets `state.mode = IDLE` and clears target/crop/recorder state **before** restoring feature state, issuing the download and syncing controls (:436–470). A playback restore does not directly change `state.mode` to selecting.
6. The same Save handler opens a fresh crop selection when it sees IDLE (:749–753). Therefore a natural-completion/late-click interleaving can, by source structure, generate a second download followed by a fresh selecting state. This is only a candidate interleaving. No event trace proving it was the failing run's cause was collected in this audit.
7. Smoke explicitly observes recording, clicks Save to stop early, observes download count two, then calls `wait_for_video_idle` (smoke.py:4387–4394 and :4524–4531). The source does not establish that the state remained recording between the asynchronous observation and the later native click.

**Disposition — refuted:** the proposed duplicated-playing/timestamp-mirror mechanism does not explain #11 across the two exporters. Vibration has no mirror, trajectory export does not read its shadows, and common exporter idle/recording is owned by `state.mode`; `getPlaybackState` is never invoked. This is a closed hypothesis, not an open explanation to re-raise from similar variable names. The observed #11 product defect itself remains open and its actual cause has not been established. Do not promise a Stage 5a side-effect fix or add an export-lifecycle behavior change to this structural extraction.

A future authorized diagnostic should record ordered timestamps for native pointerdown/click, `startRecording`, `resolveAdvance`, `pendingStopAfterRender`, `stopRecording` entry, MediaRecorder onstop, `finalizeExport`, download, `openCropOverlay`, both feature playback owners and target record at every transition. Compare the same failing workflow before/after. This audit does not authorize or run that diagnostic.

## Ordering recommendation and release boundary

1. **Corrected 5a:** remove only the two actual trajectory compatibility shadows with the no-last-record cleanup preserved; optionally cut the cohesive 8-input trajectory playback core. Define authoritative playback get/set/reset APIs for exporter/session/batch/figure callers. Keep discrete frame advancement and continuous vibration phase policies unchanged. A pure shared elapsed-time primitive has zero controller-constructor dependencies, but its call parameters/policies still need explicit semantic review; it is optional rather than a prerequisite justified by the false four-duplicate claim.
2. **5b vibration:** take the 13-input runtime/panel boundary and move its real playback owner inside. Vibration has the largest unstarted runtime/parser surface; settling state/export/session adapters here gives the clearest ownership gain. Separate the six-input pure format cut if its parsing move is also wanted. Do not claim the 13-input runtime boundary extracts parsing/attachment or all 345 mentions.
3. **5c symmetry:** take the 11-input panel boundary after the more entangled playback work. Analysis is already extracted; this pass moves presentation state and cache/wiring without pulling scene/Undo/Workbench coordination into an over-budget constructor. Symmetry itself does **not** depend on a playback clock; 5a is not a technical prerequisite for 5c.

The human accepted this design and corrected 5a → 5b → 5c ordering on 2026-10-17. Acceptance releases no Stage 5 implementation and promises no four-duplicate reduction. Relocating two authoritative vibration values differs from deleting duplicated values, and any new controller holder changes the app-let arithmetic. Recount after a concrete accepted cut; preserve the standing gate and all carried findings. No Stage 5 code was written.

## Accepted design record (2026-10-17)

The human accepted the 17-let inventory, two true trajectory shadows, authoritative vibration pair, distinct discrete/continuous policies, corrected ordering and different 8/13/11-input seams. All three broad 22-input cuts reached the 20-input design stop before code was written. The mirrored-clock hypothesis for #11 is **refuted**. No Stage 5 implementation has begun.
