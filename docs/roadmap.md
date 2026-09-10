# VibeMol Product Roadmap

Reviewed on **2026-09-10** against local `main` at `0d295af`, after the beta merge, regression fixes, and removal of Glossy rendering. Completed items describe repository code; deployment status is tracked separately.

## Product goals

- Make molecular visualization fast, reproducible, and beautiful.
- Support both exploratory work (UI) and scripted pipelines (CLI/notebooks).
- Keep editing/building intuitive for first-time users and efficient for experts.
- Make chemistry-aware editing and preservation of user work core workflows.

## Next priority: save, reopen, and recover a complete workspace

**Deliver explicit Save Session / Open Session first, then autosave and recovery using the same format.** The proposed `.vibemol-session` bundle should preserve a multi-source workspace, including its scene/layer graph and derived data dependencies.

The beta merge made it possible to assemble substantially more work in one workspace: multiple scenes, independently styled orbital layers, arithmetic combinations, and synchronized trajectories. That work currently has no complete save/reopen path:

- [Presets](../assets/app/js/preset.js) save registered settings and builder operation logs. Import applies them to loaded records; it does not recreate their source data or the scene graph.
- [Save Structure](../assets/app/js/structure-transport.js) exports the active record's volume, topology, and annotations. It does not export the whole workspace.
- Appearance autosave in [app.js](../assets/app/js/app.js) stores only settings in the appearance persistence scope.
- [Scene ownership](scene-architecture.md) now provides a model suitable for a session format, but its current persistence is across redraws within the running app.

Protecting an assembled workspace now takes priority over expanding the builder catalog or adding another visualization mode. It also provides a common foundation for recent sessions, reproducible automation, and movie export.

### First milestone: portable session round-trip

- [ ] Define a versioned session schema and public import/export contract. Reuse the existing preset and structure contracts, with stable source/scene/layer IDs rather than filename-based identity.
- [ ] Include the source data needed to reopen offline, plus edited coordinates, explicit/perceived/suppressed bonds, builder annotations and operation logs, trajectory frames, and vibrational equilibrium/mode data. Restore the edited result directly; operation replay and saved undo history are separate future work.
- [ ] Restore scene/layer names, order, membership, visibility, active scene/layer, per-layer appearance, Molden orbital/grid settings, and arithmetic recipes/dependencies. Retain sources still referenced by moved or copied layers even if their original scene was deleted.
- [ ] Restore camera and playback controls: selected trajectory frame, FPS, loop and synchronization settings, and vibration mode/amplitude/speed/phase. Reopen with playback paused.
- [ ] Validate the entire bundle and dependency graph before replacing the current workspace. Missing assets, unsupported versions, or invalid dependencies must leave the existing workspace intact. Keep renderer objects and disposable grid caches out of the durable schema; deduplicate source payloads.
- [ ] Add a browser round-trip regression that saves a mixed workspace, opens it in a fresh page without re-uploading source files, and checks geometry/topology, layer appearance/order, distinct Molden orbitals, a derived layer chain, and synchronized trajectories. Include duplicate filenames and failed-import cases.

**Done when:** a user can close the page, reopen one session file, and continue working with the same sources, edited structures, layers, view, and playback configuration.

### Following increment: recovery

- [ ] Use the same serializer for bounded, asynchronous browser autosave with a last-known-good snapshot and an explicit recovery action.
- [ ] Cover reload/interruption, corrupt snapshots, and storage quota failures. A failed save must preserve the previous recoverable snapshot and expose the failure to the user.
- [ ] Add recent-session access after recovery storage exists. Browser persistence and portability limits must be documented.

## Implemented baseline

- [x] Multi-scene outliner with stable layer identity across redraws, rename/reorder/move/delete, visibility/focus, and incremental source registration.
- [x] Independent Molden orbital grids; arithmetic layers with dependency updates, cancellation, worker/fallback execution, and allocation limits.
- [x] Shared import pipeline with append/replace semantics, per-file errors and partial success; batch PNG targets with graph/camera/playback restoration after success or failure.
- [x] Multi-frame XYZ playback, frame readouts, per-scene controls, and synchronized trajectories.
- [x] Vibrational playback from sidecar JSON, ORCA `.hess`, and Psi4 outputs; cropped WebM export from both trajectory and vibration panels.
- [x] Cube/2C surface and cloud rendering, Molden MO selection/grid controls, normalized-grid hover metrics, and PubChem 3D import.
- [x] Basic, Toon, and Kit molecule styles; optional shadows; gradient-derived surface normals; WBOIT surface/cloud transparency with a fallback; 2C split-view labels and spinor information.
- [x] Gesture editing, Build palette and selection build cue, move/rotate/transform, snapping, undo/redo, inline coordinates, and new/duplicate structure flows.
- [x] External XYZ-backed catalog with fragment/molecule kinds, atom/fragment/molecule placement, append/replace-H attachment, and supported ring-fusion preview/commit/cancel flows.
- [x] Stable builder group metadata and fragment/molecule transform scopes; preset operation-log storage and single-record structure round-trip.
- [x] Nonmetal bond-order inference/aromatic display, metal-aware bond styles and overrides, reviewed bond cleanup, hydrogen repair, and whole-structure UFF optimization.
- [x] Symmetry detection, approximate fits, symmetrization preview/apply, and symmetry-element visualization.
- [x] Quaternion camera rotation; distance/angle/dihedral measurements that refresh with trajectory coordinates in Measure mode.
- [x] Web presets and drag/drop import, Python render automation, notebook embedding/postMessage loading, and a VS Code webview package.
- [x] Modular scene/source/export/outliner, arithmetic, grid-cache, and trajectory controllers; deep GPU disposal and autoiso worker/cache handling.
- [x] Node unit tests and Playwright smoke/focused regressions, wired into `make test` and GitHub Actions. See [Makefile](../Makefile), [CI](../.github/workflows/ci.yml), [smoke tests](../tests/e2e/smoke.py), and [focused regressions](../tests/e2e/premerge.py).

## Obsolete backlog wording and corrected scope

These items should no longer be scheduled as entirely new features. Remaining work is narrower than the previous roadmap implied.

| Previous item | Current implementation and remaining scope |
| --- | --- |
| Split atoms, fragments, and molecules; add fragment/molecule identity | Catalog kinds, placement modes, stable group metadata, and group-aware transforms already exist in [fragments.js](../assets/app/js/fragments.js), [structure.js](../assets/app/js/structure.js), and `app.js`. Improve discoverability, scope/pivot feedback, and behavior after edits rather than introducing a second identity system. |
| Finish append / replace-H / fuse-ring attachment | [edit-placement.js](../assets/app/js/edit-placement.js) already implements these paths, including ring-fusion preview/commit/cancel for supported templates. Broader fusion chemistry, edge-case validation, and clearer placement warnings remain. |
| Add builder operation and metadata persistence | [preset.js](../assets/app/js/preset.js) stores operation logs and restores metadata on loaded atoms; structure export preserves the active record. Full-workspace recovery and actual operation replay remain distinct gaps. |
| Add local cleanup / relaxation | Bond cleanup, hydrogen repair, local hydrogen-only UFF relaxation, and whole-structure UFF optimization exist. The missing improvement is bounded **local heavy-atom** relaxation after attachment/substitution; see [uff-adapter.js](../assets/app/js/uff-adapter.js). |
| Add frame index and live measurements | Frame counters and coordinate-driven measurement overlays already exist. Physical simulation time, persistent analysis selections, RMSD traces, and trajectory reports remain. Playback FPS must not be presented as physical simulation time. |
| Add animated export (GIF / MP4 / WebM) | [trajectory-video.js](../assets/app/js/trajectory-video.js) already provides cropped WebM export for trajectories and vibrations. PNG sequences, GIF/MP4, and a deterministic CLI movie path remain. Batch PNG export currently iterates scenes/layers, not trajectory frames. |
| Create an end-to-end regression suite | The suite and CI already exist. Extend them with session recovery, broader chemistry fixtures, real recording checks, and additional browser coverage rather than recreating the test infrastructure. |
| Add autosave; serialize playback in presets | Appearance autosave and vibration mode/amplitude/speed preset keys already exist. Full workspace recovery and trajectory/synchronization serialization are still missing; a preset is not a session. |
| Keep builder hardening first; ongoing refactoring is completed | Replace the old blanket ranking with the ordered milestones below. The scene/arithmetic/trajectory extractions are complete; future refactors should support a specific feature or measured reliability/performance problem. |

Glossy rendering is **retired**. The supported style set is Basic / Toon / Kit, with display shortcuts `1/2/3`. It should not return as a pending style or test-matrix requirement. Edit-mode `4` remains available for bond order.

## Subsequent priorities

### 2. Local geometry cleanup and builder reliability

- [ ] Add bounded local heavy-atom relaxation after fragment attachment or substitution, reusing the UFF adapter. Show the affected region, allow preview/apply/cancel, keep remote atoms fixed, preserve topology, and make the result one undoable edit.
- [ ] Expand fixtures for replace-H, ring fusion, steric clashes, unusual valence, and unsupported force-field types. Improve explanations and override affordances using the existing placement warnings and chemistry policies.
- [ ] Refine existing fragment/molecule transform scopes, pivot choice, and selection feedback; verify group metadata through deletion, duplication, and session round-trip.

### 3. Reproducibility and integration contracts

- [ ] Publish a Web / CLI / Notebook / VS Code compatibility matrix covering imports, presets/sessions, editing, scene/layer access, and exports. Turn documented differences into focused regression cases.
- [ ] Define schema/version compatibility for presets, structures, sessions, and embed messages. Preserve existing aliases and relaxed-mode unknown-key round-tripping where supported.
- [ ] Add packaging checks for the VS Code app copy and document source-versus-bundled version provenance. The existing copy/prepublish script is a foundation, not a missing packaging pipeline.
- [ ] Build deterministic frame-sequence export from an explicit session/playback specification, then evaluate CLI movies and GIF/MP4 encoding. Camera paths and export overlays need their own specification; they are not current preset capabilities.

### 4. Scientific validation and performance

- [ ] Broaden symmetry and metal-coordination reference fixtures, document supported cases and uncertainty, and improve fit/cleanup feedback.
- [ ] Establish repeatable timing and memory benchmarks for large molecules, long trajectories, multiple orbital layers, and dependent arithmetic. Set budgets from measured baselines and check repeated load/edit/export/dispose cycles.
- [ ] Extend existing Chromium automation with representative Firefox/WebKit checks, WBOIT activation/fallback cases, and real encoded-video validation. Current video smoke coverage includes a mocked recorder.
- [ ] Continue user documentation for builder, symmetry, metal bonding, and multi-scene workflows alongside those tests.

### 5. Analysis and comparison workflows

- [ ] Add physical-time metadata/input and RMSD traces, with stable atom mapping and reference-frame selection.
- [ ] Extend live measurements into persistent selections and CSV/JSON reports over trajectories.
- [ ] Add side-by-side comparison with a shared/synchronized camera. Existing multi-scene rendering and 2C split view do not provide a general comparison layout.
- [ ] Evaluate task-oriented startup presets once common session workflows are documented.

## Deferred exploration

Reaction Guess Camera (activity-based trajectory framing) and VibeDJ (procedural audio/visual pulses) remain unimplemented ideas. They are removed from the active delivery backlog until a concrete use case justifies their priority. They are neither completed work nor commitments for the next release. Any future prototype remains opt-in.

## Delivery approach

- Finish portable session round-trip before building recovery on top of it.
- Keep the current regression gates; add targeted coverage with each milestone.
- Refactor along the ownership boundaries in [Scene architecture](scene-architecture.md). Avoid serializing renderer state or expanding `app.js` with a second persistence system.
- Revisit priorities after session save/recovery is usable and local-cleanup behavior has been evaluated on representative structures.
