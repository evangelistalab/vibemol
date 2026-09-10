# Scene architecture

VibeMol remains a static app with global modules and no build step. `index.html` loads the model and controllers before `app.js` wires them to the renderer and existing editor.

## Ownership

`scene-graph.js` owns scene and layer identity, membership, names, order, visibility, focus, and selection. Rename, reorder, move, and deletion operate on this model. `scene-sources.js` registers new volume records incrementally, including a hidden layer for every Molden MO. These entries contain source/orbital metadata and appearance settings; registration never evaluates a scalar grid. Reconciling records cannot recreate a deleted layer. Selecting a deleted orbital again in the inspector explicitly recreates its layer.

Source records continue to carry molecule/editor data and file metadata. Explicit focus changes bind the active source to the scene's molecule layer. Copied or moved grid layers can retain a source even after its original scene is removed.

`rebuildScene()` reads the existing graph and replaces rendered objects. It does not reconstruct layers from files. Render references are cleared and GPU resources are disposed with a shared deduplication state across all layers.

Loading an active Molden file opens the Orbitals inspector outside edit mode, with no MO selected for visualization yet. Selecting an orbital in the inspector or outliner computes its grid on demand. Inspector row selection applies single-surface visibility in that layer's scene. Other layers retain their identity, appearance, and arithmetic dependencies. Rapid inspector selections coalesce into one redraw of the final selection. Grid-setting refreshes preserve manually enabled overlays, and ordinary redraws respect a closed inspector.

Focusing an Orbitals group opens Appearance for all its cube/arithmetic children, including hidden and deferred MOs. `getSurfaceAppearanceTargets()` resolves this scope separately from the explicit selection used for delete, duplicate, and arithmetic commands. Edits persist on each child through the existing layer/session state; resolving the scope never evaluates grids. Mixed values are indicated in the controls. With the group focused, Show surfaces toggles parent visibility and preserves each child's visibility choice.

`isoPending` distinguishes an unassigned Auto-iso value from the stored numeric rendering fallback. Enabling Auto-iso marks the value pending; a successful estimate or manual iso edit clears it. Pending outliner rows omit the iso label, including after Auto-iso is disabled without assigning a new value. This state is copied and saved per layer. Older sessions without the field retain their existing assigned values.

`scene-outliner.js` owns the tree DOM, rename sessions, drag feedback, context menus, and arithmetic form. It calls model/controller operations supplied by `app.js`. Its stylesheet is separate from the HTML shell. Rename inputs stay mounted during unrelated redraws.

## Grid arithmetic

Each Molden source/orbital/geometry/grid-settings combination has its own scalar grid in `grid-store.js`. Consumers treat buffers as read-only; grid metadata is frozen. The cache retains at most 16 entries and 128 MiB per source. Eviction never detaches a field already held by a consumer. Rendering or hovering an orbital does not change the selected orbital.

`getLayerSourceVolume()` reads source metadata for Appearance and arithmetic operand menus without generating grids. `getLayerCubeData()` evaluates a Molden grid only when requested for visualization, arithmetic validation/computation, or export. Unused MOs stay uncomputed when the scene redraws or an operand menu is populated.

`arithmetic-grid.js` validates grids and plans the finest-spacing union without allocating result-sized arrays. Grid bounds describe voxel centers: the final point is `origin + (n - 1) * step`. Trilinear sampling includes upper planes, edges, corners, and singleton axes; it returns zero outside the sampled domain. This implementation supports positive axis-aligned grids.

Calculations are limited to 16 million (16 × 1024²) target voxels and a conservative 256 MiB working budget that includes source buffers, worker copies, and output. Staged dependent outputs also consume that budget. Oversized calculations fail before allocation.

`arithmetic-runner.js` sends serializable grid inputs to a worker without transferring ownership of source buffers. It terminates the worker after completion or cancellation. When workers are unavailable or fail, it computes in chunks and yields to the browser between chunks. `arithmetic-layers.js` owns dependency traversal, cycle prevention, cascade deletion, and staged updates. Editing a combination commits its affected dependent results together after successful computation.

## Loading and export

Picker, drop, sample, and embedded loads use the `file-loader.js` parse → plan → commit pipeline. Parsing failures are collected per input. Valid primary files are committed before sidecars are attached, and all supported inputs in a mixed batch are processed. Structure imports use the same scene commit path while preserving their synchronous public API.

Interactive loads append scenes/layers. `VibeMolEmbed.loadFiles()` defaults to replacement; `{ clearFirst: false }` explicitly appends. Replacement occurs only when at least one primary file parsed successfully. A sidecar-only or preset-only load can update the current scene without clearing it. Invalid files produce a popup and an API error. `loadedCount` and `loadedNames` describe successfully processed input files, including sidecars and presets; `ok` is false if any input failed.

`scene-export.js` enumerates live cube/arithmetic layers, plus molecule-only scenes, as explicit batch targets. Each target is activated before rendering and capture. A `finally` path restores focus, selection, visibility, camera, active record, and playback state, including when a download fails.

## Sessions and recovery

`session-format.js` owns the versioned portable format, bounded numeric-buffer encoding, checksums, and validation of sources, grids, scene membership, and arithmetic dependencies. `session.js` captures durable fields and stages records and a graph without changing the current workspace. `app.js` installs that staged model and binds the existing renderer, camera, and preset controls. The graph reserves restored IDs; the source registry marks imported orbitals/cubes as already registered so ordinary reconciliation cannot undo saved deletion or ordering.

`session-recovery.js` uses the same serializer with a smaller size limit and a debounced IndexedDB writer. Two snapshots rotate in one transaction, a revision check prevents cross-tab overwrites, and startup recovery requires an explicit user action. Empty startup state never replaces recovery data. See [Sessions and recovery](sessions.md) for the public API, exact coverage, and persistence limits.

## Trajectories and checks

`trajectory-clock.js` computes frame advances without DOM or renderer dependencies. It retains fractional elapsed time, wraps looping tracks, and clamps non-looping tracks. The shared clock maps onto each synchronized trajectory's own frame count. `trajectory-ui.js` owns row identity and values, keeping active controls mounted while playback updates the display.

Run `make check`, `make test-unit`, and `make test-e2e`. The browser target runs `smoke.py`, `premerge.py`, and `sessions.py`, covering the editor, scene/arithmetic regressions, and portable session/recovery behavior. `VIBEMOL_TEST_ARTIFACT_DIR` can redirect failure artifacts to a temporary directory.
