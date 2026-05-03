# AGENTS.md

## Purpose
This repository contains `VibeMol`, a static browser app for molecular visualization, plus a Python automation client.

Supported molecular file types:
- `.cube` / `.cub`
- `.2ccube` (two-component)
- `.xyz`
- `.molden`
- `.vib.json` / `.vmodes.json` / `.modes.json` (vibrational mode sidecar data)
- `.hess` (ORCA Hessian vibrational mode source)
- `.dat` / `.out` / `.output` (Psi4 text output with harmonic analysis)

Primary capabilities:
- Iso-surface rendering and cloud rendering
- Atom/bond rendering with multiple molecule styles
- Edit mode, transform mode, and measurement mode
- Fragment attachment and standalone molecule placement in the editor
- Multi-frame XYZ trajectory playback (play/pause, frame slider, FPS, loop)
- Vibrational mode playback (mode table, amplitude, speed, hide-small-frequencies filter)
- PNG export, XYZ export, and cropped WebM export for trajectories and vibrational modes
- Portable preset save/load (web and CLI compatible)
- Molden molecular-orbital parsing, grid generation, and rendering

## Project Layout
- `Makefile`: local check/test entrypoints (`check`, `test-unit`, `test-e2e`, `test`).
- `index.html`: UI shell, controls, and required script loading order.
- `src/styles/tokens.css`: shared design tokens and theme variables.
- `src/styles/vm-tooltip.css`: shared tooltip presentation.
- `src/styles/vm-list-popover.css`: shared floating list-popover shell styling used by Coordinates, Orbitals, and Trajectory chrome.
- `assets/app/css/palette.css`: shared palette/theme utility rules.
- `assets/app/css/edit-ui.css`: edit-mode adaptive menu, cue-row, popover, and operator-panel styling.
- `assets/app/css/display-ui.css`: non-edit adaptive launcher, floating auxiliary inspector, and Appearance inspector styling.
- `src/prefs.js`: persistent UI preference helpers (theme/font pair globals).
- `src/components/VmListPopover.js`: shared schema-driven list-popover controller used by Coordinates and Orbitals.
- `src/components/VmTooltip.js`: shared root tooltip portal and delegation helpers.
- `assets/app/js/app.js`: main app orchestration, scene lifecycle, style logic, preset API, file loading.
- `assets/app/js/trajectory-video.js`: shared cropped-canvas WebM export controller for trajectory and vibration panels.
- `assets/app/js/fragments.js`: fragment/molecule catalog loading, manifest support, and fragment builders.
- `assets/app/js/parsers.js`: parsers (`parseCube`, `parseTwoComponentCube`, `parseXYZ`) including streaming tokenization.
- `assets/app/js/rendering.js`: volume/stat helpers used by `app.js`.
- `assets/app/js/interaction.js`: keyboard shortcut routing and input-focus guards.
- `assets/app/js/ui.js`: UI formatting helpers for coordinates and XYZ export text.
- `assets/app/js/view-utils.js`: viewport/camera helpers shared by `app.js`.
- `assets/app/js/edit-utils.js`: edit-mode math helpers (mass properties, inertia, eigen solve).
- `assets/app/js/edit-commands.js`: history command object creation for atom snapshots.
- `assets/app/js/edit-state.js`: editable-record bootstrap plus undo/redo history orchestration.
- `assets/app/js/io-utils.js`: input-kind detection helpers shared by drag/drop and import flows.
- `assets/app/js/structure.js`: minimal incremental structure schema helpers (atoms, styled bonds, builder/coordination/metal-bonding annotations, structure export/import support).
- `assets/app/js/volume-geometry.js`: pure atom/voxel/world coordinate and marching-cubes isosurface helpers.
- `assets/app/js/volume-2c.js`: 2C phase and Bloch-colored isosurface builders.
- `assets/app/js/bond-inference.js`: nonmetal covalent candidate generation, metal-aware coordination-style inference, bond-order inference, and aromatic six-ring detection helpers.
- `assets/app/js/coordination.js`: coordination-geometry catalog and element-aware coordination choice menus.
- `assets/app/js/geometry-inference.js`: bond-order-driven main-group geometry inference plus transition-metal coordination defaults.
- `assets/app/js/uff.js`: standalone UFF force-field implementation plus local energy/gradient helpers.
- `assets/app/js/uff-adapter.js`: thin adapter from VibeMol editable volumes into full/local UFF system contexts.
- `assets/app/js/auto-hydrogen.js`: auto-hydrogen planning heuristics and edit-mode hydrogenation controller.
- `assets/app/js/autoiso.js`: auto-iso estimation, cache, and worker orchestration controller.
- `assets/app/js/cloud-rendering.js`: standard and two-component cloud geometry builders.
- `assets/app/js/preset.js`: preset registry, import/export controller, and builder-extension preset state helpers.
- `assets/app/js/structure-transport.js`: reproducible structure envelope export/import controller and `window.VibeMolStructure` API.
- `assets/app/js/file-loader.js`: file ingestion, onboarding sample loads, drag/drop, embed file-loading controller, and XYZ text detection/normalization helpers.
- `assets/app/js/bond-editing.js`: bond tool popup/create/delete controller.
- `assets/app/js/edit-ui.js`: adaptive edit menu, floating popover, and operator-panel UI helpers.
- `assets/app/js/display-windows.js`: non-edit adaptive launcher/window catalog, exclusivity rules, positioning, and floating-inspector anchoring controller.
- `assets/app/js/appearance-ui.js`: Appearance inspector chip/action-toggle binding plus conditional-section sync controller.
- `assets/app/js/edit-placement.js`: add-atom / fragment / molecule / fuse-ring placement workflows.
- `assets/app/js/edit-tools.js`: edit-tool state, selection coordination, and transient edit cleanup.
- `assets/app/js/edit-gizmos.js`: move/rotate gizmo creation, hover state, visibility, and picking helpers.
- `assets/app/js/edit-transform.js`: shared move/rotate transform-session state, operator-panel application, and pointer-routing controller.
- `assets/app/js/edit-gestures.js`: gesture-first edit interaction controller and pointer-routing helpers for gesture mode.
- `assets/app/js/edit-halo.js`: chemistry-aware context halo controller for gesture mode (hover/selection activation, coordination labels, build-target gating, and ghost directions).
- `assets/app/js/symmetry.js`: point-group analysis, symmetrization preview/apply, and symmetry-element description helpers for edit mode.
- `assets/fragments/library.json`: external fragment/molecule catalog manifest.
- `assets/fragments/*.xyz`: fragment geometry sources using linker-at-origin / +Z bond-vector convention.
- `assets/fragments/WORKFLOW.md`: fragment authoring workflow and conventions.
- `tools/reorient_fragment_xyz.py`: reorient one fragment XYZ so atom 1 is the linker at `(0,0,0)` and atom 2 lies on `+Z`.
- `tools/sync_fragment_library.py`: sync fragment XYZ assets into `assets/fragments/library.json`.
- `assets/vendor/js/*.js`: vendored runtime dependencies loaded as globals.
- `assets/data/sample.cube`: bundled sample file used by onboarding quick action.
- `docs/experiments/`: visual/style experiments and notes.
- `api/vibemol_client.py`: Playwright-based Python client for automated renders.
- `api/README.md`: CLI usage, presets, and `.vibemolrc` behavior.
- `api/requirements.txt`: Python dependencies.
- `tests/unit/*.test.mjs`: browserless Node unit tests for structure, parser, edit-state, and edit-tool logic.
- `tests/unit/trajectory-video.test.mjs`: browserless unit coverage for the shared crop/layout video-export helpers.
- `tests/unit/load-global-module.mjs`: VM-based loader for global/IIFE modules under Node.
- `tests/e2e/smoke.py`: Playwright smoke/E2E test that starts a temporary local static server.
- `tests/e2e/helpers.py`: shared server/artifact helpers for browser smoke tests.
- `.github/workflows/ci.yml`: CI workflow for checks, unit tests, and browser smoke tests.
- `notebooks/vibemol_notebook_demo.ipynb`: notebook demo (PNG render + iframe auto-load via postMessage).

## Runtime Model
No build step is required for the web app. It runs directly from static files.

Required stylesheet order in `index.html`:
1. `src/styles/tokens.css`
2. `src/styles/vm-tooltip.css`
3. `assets/app/css/palette.css`
4. `assets/app/css/edit-ui.css`
5. `assets/app/css/display-ui.css`
6. `src/styles/vm-list-popover.css`

Required script order in `index.html`:
1. `assets/vendor/js/three.min.js`
2. `assets/vendor/js/orbit-controls.global.js`
3. `assets/vendor/js/isosurface.bundle.js`
4. `assets/vendor/js/atomic-data.js`
5. `assets/app/js/parsers.js`
6. `assets/app/js/rendering.js`
7. `assets/app/js/interaction.js`
8. `assets/app/js/ui.js`
9. `assets/app/js/view-utils.js`
10. `assets/app/js/edit-utils.js`
11. `assets/app/js/edit-commands.js`
12. `assets/app/js/edit-state.js`
13. `assets/app/js/io-utils.js`
14. `assets/app/js/fragments.js`
15. `assets/app/js/structure.js`
16. `assets/app/js/volume-geometry.js`
17. `assets/app/js/volume-2c.js`
18. `assets/app/js/bond-inference.js`
19. `assets/app/js/auto-hydrogen.js`
20. `assets/app/js/autoiso.js`
21. `assets/app/js/cloud-rendering.js`
22. `assets/app/js/bond-editing.js`
23. `assets/app/js/edit-ui.js`
24. `assets/app/js/display-windows.js`
25. `assets/app/js/appearance-ui.js`
26. `assets/app/js/edit-placement.js`
27. `assets/app/js/edit-tools.js`
28. `assets/app/js/edit-gizmos.js`
29. `assets/app/js/edit-transform.js`
30. `assets/app/js/edit-gestures.js`
31. `assets/app/js/coordination.js`
32. `assets/app/js/geometry-inference.js`
33. `assets/app/js/uff.js`
34. `assets/app/js/uff-adapter.js`
35. `assets/app/js/edit-halo.js`
36. `assets/app/js/preset.js`
37. `assets/app/js/structure-transport.js`
38. `assets/app/js/file-loader.js`
39. `assets/app/js/symmetry.js`
40. `src/prefs.js`
41. `src/components/VmListPopover.js`
42. `src/components/VmTooltip.js`
43. `assets/app/js/trajectory-video.js`
44. `assets/app/js/app.js`

`assets/app/js/app.js` requires global modules:
- `window.VibeMolParsers`
- `window.VibeMolRendering`
- `window.VibeMolInteraction`
- `window.VibeMolUI`
- `window.VibeMolListPopover`
- `window.VibeMolViewUtils`
- `window.VibeMolEditUtils`
- `window.VibeMolEditCommands`
- `window.VibeMolEditState`
- `window.VibeMolIOUtils`
- `window.VibeMolFragments`
- `window.VibeMolStructureCore`
- `window.VibeMolVolumeGeometry`
- `window.VibeMolVolume2C`
- `window.VibeMolBondInference`
- `window.VibeMolCoordination`
- `window.VibeMolGeometryInference`
- `window.VibeMolUFFAdapter`
- `window.VibeMolAutoHydrogen`
- `window.VibeMolAutoIso`
- `window.VibeMolCloudRendering`
- `window.VibeMolBondEditing`
- `window.VibeMolEditUi`
- `window.VibeMolDisplayWindows`
- `window.VibeMolAppearanceUi`
- `window.VibeMolPrefs`
- `window.VibeMolEditPlacement`
- `window.VibeMolEditTools`
- `window.VibeMolEditGizmos`
- `window.VibeMolEditTransform`
- `window.VibeMolEditGestures`
- `window.VibeMolEditHalo`
- `window.VibeMolPresetModule`
- `window.VibeMolStructureTransport`
- `window.VibeMolFileLoader`
- `window.VibeMolSymmetry`
- `window.VibeMolTrajectoryVideo`

Preset automation contract exposed globally:
- `window.VibeMolPreset.kind`
- `window.VibeMolPreset.version`
- `window.VibeMolPreset.listKeys()`
- `window.VibeMolPreset.export(options?)`
- `window.VibeMolPreset.import(preset, options?)`

## Key Behavior Notes
- 2C surface mode is global across loaded 2C files.
- Molecule styles are: `default`, `toon`, `kit` (shown as Kit), `glossy`.
- Global/display shortcuts `1/2/3/4` map to molecule styles in that order.
- In edit mode, `4` is used for quadruple-bond preview in Add mode and does not switch to `glossy`.
- `fancy` is treated as a deprecated alias for `toon` in preset/CLI compatibility paths.
- Python CLI additionally accepts deprecated alias `studio` and maps it to `kit`.
- Toon molecule style enforces toon-shaded surfaces.
- Glossy style exposes a configurable glossy bond center radius (`molecule.glossyBondRadius`).
- Camera rotation uses quaternion orbiting in all interaction modes to avoid pole locking.
- Startup opens to an empty scene with onboarding card (sample is no longer auto-loaded).
- Drag/drop file loading works on both the scene and onboarding card/drop zone.
- `.xyz` file imports and pasted XYZ text accept either standard XYZ (`natoms`, comment, coordinates) or coordinates-only rows; the first token on each row may be an element symbol or an atomic number.
- Preset JSON files can be drag-dropped directly into the app and are imported through the normal preset path.
- Reproducible structure JSON files (`kind: "vibemol.structure"`) can be drag-dropped directly into the app and preserve explicit bonds plus builder annotations.
- Edit Add mode has three submodes: `Atom`, `Fragment`, and `Molecule`.
- Standalone molecule placement is interactive: click to place, drag to rotate around COM, click again to confirm, `Esc` to cancel, `X/Y/Z` to align preview axes.
- Fragment/molecule catalog data loads from `assets/fragments/library.json` when available and falls back to built-in starter definitions.
- In direct `file://` usage, fragment catalog fetch is skipped and built-in fragment defaults are used quietly.
- Embedded integrations can auto-load files via:
  - `window.VibeMolEmbed.loadFiles(files, options?)`
  - `window.postMessage({ type: 'vibemol:load-files', files, options, requestId? }, targetOrigin)`
  - Response event: `vibemol:load-files:result` with `ok`, `loadedCount`, `loadedNames`, and optional `error`.
- Vibrational sidecar JSON files can be attached to a loaded molecule (matched by atom count, and atom symbol sequence when provided).
- ORCA `.hess` files are parsed for `$vibrational_frequencies` + `$normal_modes` and attached using the same matching logic.
- Dropping an ORCA `.hess` without a same-stem `.xyz` in the same upload batch triggers an explicit warning popup before import continues.
- Psi4 output logs (`.dat/.out`) are parsed from the harmonic table and create a molecule from the **last** `Geometry (in Angstrom)` block before attaching modes.
- Molden files expose an Orbitals floating inspector for MO selection and grid step/padding.
- The non-edit adaptive launcher lives on-canvas above Appearance, shows only context-relevant windows (`Orbitals`, `View actions`, `View`, `Coordinates`, `Trajectory`, `Frequencies`), and enforces mutual exclusivity within that launcher set.
- Vibrational mode controls (mode index, play/pause, amplitude, speed, frequency, hide-small-frequencies toggle) are shown in the Frequencies panel when available.
- The `Hide small frequencies` checkbox uses a `5.0 cm^-1` absolute-frequency threshold.
- Trajectory playback and vibrational playback are mutually exclusive for one active file.
- Trajectory and Frequencies panels both expose `Save video`, which opens a crop overlay over the 3D canvas and exports one cropped WebM pass of the current animation.
- Outside edit mode, trajectory bond rendering is dynamic per frame and does not mutate stored `vol.bonds`.
- In edit mode, the `Build` popover is toggled explicitly by the toolbar button or `/`; pressing `/` focuses the Build search field when the palette is already open. The `Symmetry` popover is toggled explicitly by the toolbar button or `S`.
- The `Symmetry` tool supports point-group analysis, RMS-based approximate fits, preview/apply/auto-apply symmetrization, and 3D symmetry-element visualization.
- Appearance is a compact accordion inspector with an always-visible `Quick style` strip and collapsed `Molecule`, `Lighting & atmosphere`, `Camera`, `Surfaces`, and `Visibility` sections; `Surfaces` and its 2C/cloud subsections appear only when relevant.
- Appearance controls include an optional `Shadows` toggle for molecule self-shadowing.
- Loaded `.2ccube` files expose the 2C quantity selector in Appearance with math-aware labels (`Re(ψ^α)`, `Im(ψ^β)`, and so on).
- In `alphaBetaPhase` split view, the canvas overlays centered `α` / `β` labels and exposes a `Spinor info` popover whose copy follows the active 2C quantity; the phase wheel sits at the lower-right above the hint bar.
- View actions include `COM → Origin`, principal-axis alignment, and `+X/+Y/+Z` camera presets; shortcut `R` shifts active molecule center of mass to origin.
- `View` and `Coordinates` are separate floating windows launched from the adaptive non-edit menu; the coordinates window can toggle between angstrom and bohr display and supports inline atom editing.
- Malformed file imports (`.xyz`, `.cube`, `.2ccube`) are surfaced via popup errors.
- Multi-frame `.xyz` files are parsed as trajectories and can be animated from the Trajectory panel controls.
- Autoiso caches per file/component/orbital and falls back to synchronous estimation when the worker path is unavailable.
- Surface hover metrics are shown only for normalized orbital-like grids (`∫q² dV ≈ 1`) and are cached per surface.
- Standard and 2C isosurface normals are derived from scalar-field gradients rather than triangle-averaged face normals, which keeps shading stable across browsers and material styles.
- Transparent isosurfaces use weighted blended order-independent transparency (WBOIT) when supported; unsupported renderers fall back to the simpler transparent path without changing the UI contract.
- Cloud rendering supports both `Cubes` and `Points`; cloud transparency uses the same WBOIT pipeline as surfaces when supported and falls back transparently when it is not.
- Preset import supports `strict` and `relaxed` modes and preserves unknown keys for round-trip safety.
- Preset `extensions.builder.fragmentOpsByFile` stores fragment-builder operation logs and restores them on load; replay is not implemented yet.
- Scene teardown performs deep, deduplicated GPU resource disposal.

## Python API Notes
- Primary script: `api/vibemol_client.py`.
- Notebook helper: `vibemol(...)` returns/displays an iframe embed and auto-loads provided files via postMessage.
- Supports single-file mode (`input_file output_png`) and batch mode (`--inputs ... --output-dir ...`).
- Supports wildcard expansion in both `--inputs` and `--extra-file`.
- `--extra-file` uploads additional sidecar files in the same request (for example `.vib.json` with `.xyz`).
- Runtime preset API (`window.VibeMolPreset`) is preferred; DOM fallback is used only when runtime API is unavailable.
- DOM fallback import/export includes newer settings:
  - `surface.enabled`
  - `surface.autoIsoEnabled`
  - `surface.colorScheme`
  - `global.showAtomLabels`
  - `global.showMultiBonds`
  - `vibration.hideSmallFrequencies`
- Client listens for page alert dialogs after upload and surfaces import failures as CLI errors.
- Style compatibility in CLI:
  - `fancy` -> `toon`
  - `studio` -> `kit`

## Edit / Builder UX Status
Implemented:
- Edit mode opens in gesture-first editing by default; the legacy adaptive tool window remains visible as the advanced/fallback surface.
- Edit tools currently include `Selection`, `Move`, `Rotate`, `Add`, `Bond`, and `Transform`; atom deletion is handled directly by `Delete` / `Backspace`.
- The old gesture HUD has been removed; current edit state is conveyed through the floating cue row, popovers, and transient previews instead.
- The `Build` palette is the source of truth for the currently loaded atom/fragment/molecule payload; it is opened by the toolbar button or `/`, and `/` focuses the Build search field when the palette is already visible.
- The Build palette exposes atoms, fragments, and molecules plus element-specific coordination and `Adjust hydrogens` behavior for single-atom placement.
- Leaving edit mode closes the `Build` palette and other edit-only floating popovers immediately; they do not persist into Display or Measure mode.
- Layer 2 context halo is active in gesture mode:
  - selecting one atom shows a chemistry-aware halo immediately
  - hovering one atom while idle for ~300 ms shows the same halo
  - main-group halo geometry is derived from explicit bond orders via `bond order -> lone pairs -> steric number -> VSEPR parent geometry`
  - open-site grow ghosts and replaceable terminal-H targets are gated by the selection `+` build cue rather than shown continuously
  - transition metals show first-pass coordination ghosts when build targets are enabled
  - floating coordination labels set a forward-looking preferred parent geometry for incomplete atoms
  - clicking a ghost or replaceable-H target places the currently loaded Build payload at that exact site
- The selection cue row supports translate/rotate, coordination, metal-bond mode, bond order/style, build (`+`), and delete actions.
- The `+` selection cue arms build targets for the currently loaded atom or fragment and is the normal way to expose open sites on a selected atom.
- Edit-mode ghost atoms and placement previews reuse the active molecule style shading, but render as semi-transparent previews (about `0.6` opacity) instead of using a separate ghost-only shading model.
- Gesture-first editing currently supports:
  - click void to place the loaded element when nothing is selected, or clear selection when atoms are selected
  - click atom to select it
  - drag from an unselected atom into void to grow chemistry
  - drag from an unselected atom to another atom to create/update/delete a bond
  - left-click on bonds is inert
  - drag from a selected atom to move the resolved move scope
  - `Alt+drag` to force atom-only movement
  - `Shift+drag` from a bond to move the downstream side
  - wheel or `1/2/3` during grow/bond drags to change the pending bond order
  - right-click on atoms/bonds selects atom or bond scope; right-click on a selected atom upgrades to whole-molecule selection
  - right-click on void rotates the camera, and `Shift+right-click` on void pans the view
- Selection supports click-to-replace, `Shift+click` toggle, empty-click clear, and `Cmd/Ctrl+A` select-all.
- Selection mode supports screen-space marquee box selection of atom centers.
- `Esc` clears the current edit selection when something is selected.
- Pressing `Space` in edit mode previews missing hydrogen placement for the current atom selection, or for the full active editable structure when nothing is selected; pressing `Space` again commits the previewed hydrogens.
- Move mode supports multi-atom selection movement, a right-side XYZ displacement operator panel, and a 3-axis translation gizmo anchored at the geometric selection center.
- Rotate mode supports multi-atom selection rotation, a right-side XYZ rotation operator panel, and a 3-axis broken-ring rotation gizmo anchored at the geometric selection center.
- Add tool includes cursor-relative placement with automatic angle snapping (`180°`, `120°`, `109.5°`, `90°`, `60°`).
- Hold `Shift` during add-grow placement to bypass angle snap.
- Add mode includes `Atom`, `Fragment`, and `Molecule` submodes.
- Add atom uses a right-side last-operation operator panel with live XYZ editing plus `Enter` confirm / `Esc` cancel.
- When `Adjust hydrogens` is enabled, committed single-atom adds perform local hydrogen adjustment automatically and respect the active coordination choice for the newly added atom.
- Fragment insertion uses the shared fragment catalog and supports starter-group attach flows (for example methyl and hydroxyl geometry overrides).
- Standalone molecules can be placed by click/drag/click with quaternion rotation around the preview COM.
- Standalone molecule placement includes a right-side operator panel with live XYZ/rotation editing and axis-align actions.
- Transform mode is the advanced bond-aware rotation tool: it supports bond hover, bond-side selection, additive selection, explicit rotate-fragment and rotate-bond actions, and post-transform cleanup.
- Replacing an atom with a lower-valence element prunes excess bonds, preferring terminal hydrogens/terminal one-valence neighbors first, then runs local hydrogen repair on the surviving center.
- Deleting atoms cascades to dangling one-valence neighbors and then repairs hydrogens on surviving frontier atoms in the same undo unit.
- Left-clicking the center of a normal bond in edit mode cycles its order `1 -> 2 -> 3 -> 4 -> 3 -> 2 -> 1`; bond-center context/right-click still selects the bond for cue-driven edits.
- Edit undo/redo history is active (`Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`).
- Direct delete via current selection or hovered atom (`Backspace`/`Delete`) is active.
- Bond tool creates bonds by clicking two atoms, edits order through an in-scene popup (`1–4,0`) for ordinary bonds, edits metal bonds through a style popup (`1 = covalent`, `2 = coordination`, `3 = dative`, `0 = none`), supports right-click delete, includes a reviewed `Clean Up Bonds` preview/apply workflow for perceived bonds, and offers `Optimize Structure` for one whole-structure UFF coordinate cleanup pass.
- Structures now persist explicit/perceived/suppressed `vol.bonds` with `{ id, a, b, order, kind, origin, style }`, where `style` is one of `covalent`, `metal-strong`, `metal-dative`, or `metal-metal`, and `kind: 'blocked'` records user-suppressed pairs that must not be auto-perceived back into existence.
- `vol.annotations.coordination.byAtomId[atomId].geometryId` is a preferred coordination target for incomplete atoms, not authoritative stored hybridization.
- `vol.annotations.metalBonding.byAtomId[atomId].mode` stores per-metal override mode (`auto`, `force_covalent`, `force_dative`, `no_bonds`) for coordination-bond inference.
- The `Symmetry` tool is available in edit mode, supports point-group analysis, RMS-based candidate filtering, preview/apply/auto-apply symmetrization, and 3D symmetry-element rendering.
- `Save Structure` exports the active editable record as a reproducible `vibemol.structure` JSON document.
- `tests/e2e/smoke.py` is the required automated regression check for edit-mode flow changes (adaptive menu, Build-search hotkeys, selection, move/rotate gizmos, add-atom/add-molecule operators, structure round-trip, bond popup editing, cleanup preview/apply, UFF structure optimization, trajectory playback, trajectory/vibration video export behavior, and WBOIT surface-transparency activation/fallback behavior).
- Atom labels and atom numbers can be toggled independently.
- New untitled editable files can be created from the toolbar and duplicated/removed from the active-file control area.
- Coordinates-window rows mirror atom hover, and the table supports inline editing of atom order, element symbol/atomic number, and Cartesian coordinates with validation.

Discussed but not implemented yet (carry-forward backlog):
- Clean first-class split between `atoms`, `fragments`, and `molecules` in the builder catalog/UX.
- Richer attach policies (`append`, `replace-H`, `fuse-ring`) and chemistry-aware guardrails.
- Local cleanup/relax after fragment attachment.
- Better transform semantics for moving/rotating disconnected molecules vs attached fragments.
- Onboarding “recent files” quick action (sample action exists; recent list not implemented).

## Bond Order Inference Algorithm
Bond perception lives in `assets/app/js/bond-inference.js`.

Persistent imported topology is now **connectivity-first with metal-aware coordination styles**:

1. Nonmetal raw candidate generation (`collectRawBondCandidates`):
- Only a supported organic/main-group allowlist is auto-bonded:
  - `H, B, C, N, O, F, Si, P, S, Cl, Br, I`
- Metal-containing pairs are handled in a separate pass.
- Candidate pairs must satisfy:
  - `0.4 Å <= d(i,j) <= 1.15 * (r_cov(i) + r_cov(j))`

2. Distance-ranked greedy acceptance (`acceptBondCandidatesByDistanceRank`):
- Sort candidates by increasing `d(i,j) / (r_cov(i) + r_cov(j))`.
- Accept shortest candidates first.
- Each accepted edge increments per-atom coordination counts.
- Each element has a hard maximum coordination cap:
  - `H 1`, `B 4`, `C 4`, `N 4`, `O 2`, `F 1`, `Si 4`, `P 5`, `S 6`, `Cl/Br/I 1`

3. Metal-aware passes:
- Metal-ligand pairs use an empirical metal-bond radius table plus ligand covalent radius.
- Accepted metal-ligand edges are classified as:
  - `metal-strong` when `dist <= 1.10 * (rM + rL)`
  - `metal-dative` when `dist <= 1.30 * (rM + rL)`
- Metal-ligand candidates are capped per metal by a metal-specific coordination-number limit.
- Metal-metal edges are detected in a separate tighter pass and stored as `style: 'metal-metal'`.

4. Persistent graph semantics:
- Geometry-based inferred bonds are stored as:
  - `order: 1` for metal styles and single-bond connectivity
  - `kind: 'normal'`
  - `origin: 'perceived'`
  - `style: 'covalent' | 'metal-strong' | 'metal-dative' | 'metal-metal'`
- User-authored or imported explicit bonds use:
  - `origin: 'explicit'`
- User-suppressed pairs are stored as:
  - `kind: 'blocked'`
  - `origin: 'explicit'`
- `kind: 'blocked'` records are not rendered and prevent later geometry-based re-perception of that pair.
- Bond-tool edits always create/upgrade bonds to `origin: 'explicit'`

5. Imported bond-order promotion:
- Imported molecules can promote nonmetal covalent single-bond connectivity to higher bond order where `inferBondOrders(...)` supports it (for example carbonyl-style double bonds).
- Builder-created/edit-session bonds are not globally reinterpreted this way; they remain under explicit edit control.

6. Metal override behavior:
- `vol.annotations.metalBonding.byAtomId[atomId].mode` can force metal inference for one atom to:
  - `auto`
  - `force_covalent`
  - `force_dative`
  - `no_bonds`
- Metal-ligand bonds count toward the metal-side coordination budget but do not count against the nonmetal ligand-side valence in geometry and auto-hydrogen planning.

7. Cleanup workflow (`classifyBondCleanupDiff`):
- Computes a reviewed diff between the current graph and the current geometry.
- Produces:
  - `additions`: newly perceived bonds not in the graph
  - `removable`: stale `origin: 'perceived'` bonds
  - `warnings`: `origin: 'explicit'` bonds that current geometry would not auto-perceive
- Cleanup apply never auto-removes explicit bonds.

8. Render-time aromatic display (`inferAromaticSixRings`):
- Benzene-like six-member carbon rings are normalized to alternating single/double order for rendering only.
- This does not overwrite stored `vol.bonds`.

9. Trajectory rendering:
- Outside edit mode, trajectory playback uses a transient per-frame perceived bond graph for rendering.
- Stored topology is unchanged and remains the graph exported by `Save Structure`.

## Commands
Run web app locally:
- `python3 -m http.server`
- Open `http://localhost:8000/`

Local test entrypoints:
- `make check`
- `make test-unit`
- `make test-e2e`
- `make test`

Fast JS syntax checks:
- `node --check assets/app/js/fragments.js`
- `node --check assets/app/js/parsers.js`
- `node --check assets/app/js/rendering.js`
- `node --check assets/app/js/interaction.js`
- `node --check assets/app/js/ui.js`
- `node --check assets/app/js/structure.js`
- `node --check assets/app/js/volume-geometry.js`
- `node --check assets/app/js/volume-2c.js`
- `node --check assets/app/js/bond-inference.js`
- `node --check assets/app/js/auto-hydrogen.js`
- `node --check assets/app/js/autoiso.js`
- `node --check assets/app/js/cloud-rendering.js`
- `node --check assets/app/js/preset.js`
- `node --check assets/app/js/structure-transport.js`
- `node --check assets/app/js/file-loader.js`
- `node --check assets/app/js/bond-editing.js`
- `node --check assets/app/js/edit-ui.js`
- `node --check assets/app/js/display-windows.js`
- `node --check assets/app/js/appearance-ui.js`
- `node --check assets/app/js/edit-state.js`
- `node --check assets/app/js/edit-placement.js`
- `node --check assets/app/js/edit-tools.js`
- `node --check assets/app/js/edit-gizmos.js`
- `node --check assets/app/js/edit-transform.js`
- `node --check assets/app/js/edit-gestures.js`
- `node --check assets/app/js/symmetry.js`
- `node --check assets/app/js/trajectory-video.js`
- `node --check src/prefs.js`
- `node --check assets/app/js/app.js`

Python API setup:
- `python3 -m venv .venv`
- `source .venv/bin/activate`
- `pip install -r api/requirements.txt`
- `python -m playwright install chromium`

CI:
- GitHub Actions workflow: `.github/workflows/ci.yml`
- `checks-and-unit` runs `make check` and `make test-unit`
- `e2e` runs `make test-e2e` and uploads `out/test-artifacts/` on failure

Python API smoke run:
- `python api/vibemol_client.py assets/data/sample.cube out/sample_toon_cli.png --style toon`
- `python api/vibemol_client.py assets/data/sample.cube out/sample_kit_cli.png --style studio`
- `python api/vibemol_client.py assets/data/sample.xyz out/sample_vib_cli.png --extra-file assets/data/sample.vib.json`

Fragment tooling:
- `python tools/reorient_fragment_xyz.py input.xyz output.xyz`
- `python tools/sync_fragment_library.py`

Repo checks:
- `git status --short`
- `git diff --stat`

## Editing Rules For Agents
- Prefer editing `assets/app/js/` modules over large inline script blocks in `index.html`.
- Preserve script load order and global contracts in `index.html`.
- Prefer extending `assets/fragments/library.json` + `assets/fragments/*.xyz` for catalog growth instead of hard-coding new fragment geometry in `app.js`.
- Keep preset key stability across web and CLI integrations when possible.
- If adding a new user-facing setting, register it in preset import/export (`presetSettingRegistry`) unless intentionally excluded.
- If changing fragment-builder data, verify both runtime catalog loading (`fragments.js`) and preset builder extensions still round-trip.
- Do not modify vendored libraries unless explicitly requested:
  - `assets/vendor/js/three.min.js`
  - `assets/vendor/js/orbit-controls.global.js`
  - `assets/vendor/js/isosurface.bundle.js`
- Keep heavy computation out of the frame loop.
- Ensure geometries/materials/textures are disposed on teardown/rebuild paths.

## Manual Validation Checklist
After non-trivial changes:
1. Launch local server and load app.
2. Verify startup shows the empty onboarding card; test both `Choose files` and `Open sample file`.
3. Load at least one `.cube`, one `.2ccube`, and one `.xyz`.
4. Confirm 2C mode selection persists across file switches.
5. Toggle surface/cloud modes and verify rendering updates.
6. Check molecule styles (`default`, `toon`, `kit/Kit`, `glossy`) and keyboard shortcuts `1/2/3/4`.
7. Enter edit mode and measurement mode; verify quaternion background rotation still works.
8. In edit mode, verify the adaptive edit menu appears and the onboarding splash hides.
9. In edit mode, test `Selection` behavior: click, `Shift+click`, empty-click clear, `Esc` clear, `Cmd/Ctrl+A`, and repeated right-click on a selected atom to upgrade to whole-molecule selection.
10. In edit mode, test the `Build` tool via button and `/`; confirm `/` opens or focuses the Build search field and that the `+` selection cue gates open-site build targets for selected atoms.
11. In edit mode, test `Add > Atom`, `Add > Fragment`, and `Add > Molecule`, including the add-atom and add-molecule operator panels, Build-palette open/close behavior across mode switches, ghost-preview readability under the active molecule style, plus undo/redo and `Esc` cancel for molecule placement.
12. In edit mode, press `Space` once on a simple unsaturated structure and verify ghost hydrogens appear without mutating the structure; press `Space` again and verify the hydrogens are added with one undoable history entry.
13. In edit mode, test `Move` and `Rotate`: gizmo hover, operator-panel input commit, drag interaction, right-click void rotate, `Shift+right-click` void pan, and undo behavior on a selected atom set.
14. In edit mode, test bond interactions: atom-to-atom create, left-click bond-center order cycling `1 -> 2 -> 3 -> 4 -> 3 -> 2 -> 1`, clicked-bond popup `1–4,0`, metal bond style popup `1/2/3/0`, right-click bond delete, `Clean Up Bonds`, and `Optimize Structure`.
15. Load a `.2ccube` and verify the Appearance `2C mode` selector, centered `α` / `β` overlay labels, `Spinor info` popover, and phase wheel placement all react correctly when switching quantities and returning to `.cube`.
16. In edit mode, test the `Symmetry` tool: open with button or `S`, preview one candidate, inspect a symmetry element in 3D, cancel/apply, and confirm the popover closes on file/mode changes.
17. Use `Save Structure`, then drag-drop the exported `vibemol.structure` file back into the app and verify explicit bond orders and metal bond styles survive round-trip.
18. Open `View`, `Coordinates`, `Trajectory`, and `Frequencies`; verify orthographic toggle, COM/orientation actions, angstrom/bohr switching, inline coordinate edits, trajectory play/reset/frame/FPS/loop, and vibration mode/amplitude/speed/hide-small-frequencies behavior.
19. Save/load a preset in web UI and verify settings round-trip, including `extensions.builder` when fragment operations exist.
20. Load standard XYZ, coordinates-only XYZ, and pasted XYZ text; verify import succeeds for all supported XYZ forms.
21. Run CLI with `--preset` and with `.vibemolrc` auto-discovery.
22. Save PNG, export XYZ, and export cropped WebM from both Trajectory and Frequencies; check browser console for errors.

## Deployment Notes
- Main deployment target is static hosting from repository root (`index.html`).
- `.nojekyll` must remain present for GitHub Pages compatibility.
