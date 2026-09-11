# VibeMol Product Roadmap

Reviewed on **2026-09-10** on `codex/session-save-recovery`, based on local `main` at `c0a543c`. Session save/open and recovery are implemented on this branch and await merge review. Completed items describe repository code; deployment status is tracked separately.

## Product goals

- Make molecular visualization fast, reproducible, and beautiful.
- Support both exploratory work (UI) and scripted pipelines (CLI/notebooks).
- Keep editing/building intuitive for first-time users and efficient for experts.
- Make chemistry-aware editing and preservation of user work core workflows.

## Delivered on this branch: save, reopen, and recover a complete workspace

**Save session / Open session and browser autosave/recovery now use one format.** The `.vibemol-session` bundle preserves the source data, scene/layer graph, and derived data dependencies. See [Sessions and recovery](sessions.md) for the user workflow, schema, API, and storage limits.

The beta merge made it possible to assemble multiple scenes, independently styled orbital layers, arithmetic combinations, and synchronized trajectories. Session persistence now complements the narrower existing tools:

- [Presets](../assets/app/js/preset.js) save registered settings and builder operation logs. Import applies them to loaded records; it does not recreate their source data or the scene graph.
- [Save Structure](../assets/app/js/structure-transport.js) exports the active record's volume, topology, and annotations. It does not export the whole workspace.
- Appearance autosave in [app.js](../assets/app/js/app.js) stores only settings in the appearance persistence scope.
- [Scene ownership](scene-architecture.md) remains authoritative during redraws and is now captured/restored explicitly by the session controller.

This provides the foundation for recent sessions, reproducible automation, and movie export. After this branch is reviewed and merged, the next product improvement is **bounded local heavy-atom relaxation and builder reliability**, described below.

### First milestone: portable session round-trip

- [x] Define a versioned session schema and public import/export contract. Reuse the existing preset and structure contracts, with stable source/scene/layer IDs rather than filename-based identity.
- [x] Include the source data needed to reopen offline, plus edited coordinates, explicit/perceived/suppressed bonds, builder annotations and operation logs, trajectory frames, and vibrational equilibrium/mode data. Restore the edited result directly; operation replay and saved undo history are separate future work.
- [x] Restore scene/layer names, order, membership, visibility, active scene/layer, per-layer appearance, Molden orbital/grid settings, and arithmetic recipes/dependencies. Retain sources still referenced by moved or copied layers even if their original scene was deleted.
- [x] Restore camera and playback controls: selected trajectory frame, FPS, loop and synchronization settings, and vibration mode/amplitude/speed/phase. Reopen with playback paused.
- [x] Validate the entire bundle and dependency graph before replacing the current workspace. Missing assets, unsupported versions, or invalid dependencies must leave the existing workspace intact. Keep renderer objects and disposable grid caches out of the durable schema; deduplicate source payloads.
- [x] Add a browser round-trip regression that saves a mixed workspace, opens it in a fresh page without re-uploading source files, and checks geometry/topology, layer appearance/order, distinct Molden orbitals, a derived layer chain, and synchronized trajectories. Include duplicate filenames and failed-import cases.

**Done when:** a user can close the page, reopen one session file, and continue working with the same sources, edited structures, layers, view, and playback configuration.

### Following increment: recovery

- [x] Use the same serializer for bounded, asynchronous browser autosave with a last-known-good snapshot and an explicit recovery action.
- [x] Cover reload/interruption, corrupt snapshots, and storage quota failures. A failed save must preserve the previous recoverable snapshot and expose the failure to the user.
- [ ] Add recent-session access after recovery storage exists. Browser persistence and portability limits must be documented.

## Implemented baseline

- [x] Multi-scene outliner with stable layer identity across redraws, rename/reorder/move/delete, visibility/focus, and incremental source registration.
- [x] Portable complete-session save/open; bounded browser autosave with explicit recovery, corruption fallback, quota failure handling, and cross-tab overwrite protection.
- [x] Independent Molden orbital grids; arithmetic layers with dependency updates, cancellation, worker/fallback execution, and allocation limits.
- [x] Shared import pipeline with append/replace semantics, per-file errors and partial success; batch PNG targets with graph/camera/playback restoration after success or failure.
- [x] Multi-frame XYZ playback, frame readouts, per-scene controls, and synchronized trajectories.
- [x] Vibrational playback from sidecar JSON, ORCA `.hess`, and Psi4 outputs; cropped WebM export from both trajectory and vibration panels.
- [x] Cube/2C surface and cloud rendering, Molden MO selection/grid controls, normalized-grid hover metrics, and PubChem 3D import.
- [x] Basic, Toon, and Kit molecule styles; optional shadows; gradient-derived surface normals; WBOIT surface/cloud transparency with a fallback; 2C split-view labels and spinor information.
- [x] Appearance components: independent display geometry, atom/bond/surface materials, coloring, and lighting. Native Basic/Toon/Kit presets and reusable look/material libraries preserve exact values through sessions and autosave. Additional curated presets remain under evaluation in the real-renderer comparison.
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
| Add builder operation and metadata persistence | Presets store operation logs; structure export preserves the active record. Sessions now preserve the complete workspace and logs per source. Actual operation replay remains separate future work. |
| Add local cleanup / relaxation | Bond cleanup, hydrogen repair, local hydrogen-only UFF relaxation, and whole-structure UFF optimization exist. The missing improvement is bounded **local heavy-atom** relaxation after attachment/substitution; see [uff-adapter.js](../assets/app/js/uff-adapter.js). |
| Add frame index and live measurements | Frame counters and coordinate-driven measurement overlays already exist. Physical simulation time, persistent analysis selections, RMSD traces, and trajectory reports remain. Playback FPS must not be presented as physical simulation time. |
| Add animated export (GIF / MP4 / WebM) | [trajectory-video.js](../assets/app/js/trajectory-video.js) already provides cropped WebM export for trajectories and vibrations. PNG sequences, GIF/MP4, and a deterministic CLI movie path remain. Batch PNG export currently iterates scenes/layers, not trajectory frames. |
| Create an end-to-end regression suite | The suite and CI include session recovery. Remaining extensions include broader chemistry fixtures, real recording checks, and additional browsers. |
| Add autosave; serialize playback in presets | Appearance autosave and vibration preset keys remain available. Sessions now preserve full playback configuration and support complete workspace recovery. |
| Keep builder hardening first; ongoing refactoring is completed | Replace the old blanket ranking with the ordered milestones below. The scene/arithmetic/trajectory extractions are complete; future refactors should support a specific feature or measured reliability/performance problem. |

The former Glossy molecule style and its welded connectors remain retired. **Emissive / Satin / Lacquer / Metal / Gel / Ceramic** reproduce the original material recipes across atoms, bonds, and surfaces, with save/open support. Gel replaces Glossy in the Material menu; old saved Glossy materials remain readable. The complete preset menu includes Basic / Toon / Kit / Classic / Porcelain / Ink / Opal. The first three retain display shortcuts `1/2/3`. Material controls are shared across atoms, bonds, and surfaces; studio presets include their complete lighting and tone mapping. Edit-mode `4` remains available for bond order.

Material opens from a section closed by default, with all material properties directly inside it. The former Ink outlines and Blackbody coloring toggles and their rendering code are retired; older saved flags are ignored. The curated Ink preset uses the standard material and contour controls.

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

- Keep portable session round-trip and recovery on the same versioned serializer.
- Keep the current regression gates; add targeted coverage with each milestone.
- Refactor along the ownership boundaries in [Scene architecture](scene-architecture.md). Avoid serializing renderer state or expanding `app.js` with a second persistence system.
- Revisit priorities after session save/recovery is usable and local-cleanup behavior has been evaluated on representative structures.
