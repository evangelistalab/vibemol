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
- PNG export and XYZ export
- Portable preset save/load (web and CLI compatible)
- Molden molecular-orbital parsing, grid generation, and rendering

## Project Layout
- `index.html`: UI shell, controls, and required script loading order.
- `assets/app/js/app.js`: main app orchestration, scene lifecycle, style logic, preset API, file loading.
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
- `assets/app/js/structure.js`: minimal incremental structure schema helpers (atoms, bonds, builder annotations, structure export/import support).
- `assets/app/js/bond-editing.js`: bond tool popup/create/delete controller.
- `assets/app/js/edit-ui.js`: adaptive edit menu, floating popover, and operator-panel UI helpers.
- `assets/app/js/edit-placement.js`: add-atom / fragment / molecule / fuse-ring placement workflows.
- `assets/app/js/edit-tools.js`: edit-tool state, selection coordination, and transient edit cleanup.
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
- `notebooks/vibemol_notebook_demo.ipynb`: notebook demo (PNG render + iframe auto-load via postMessage).

## Runtime Model
No build step is required for the web app. It runs directly from static files.

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
16. `assets/app/js/bond-editing.js`
17. `assets/app/js/edit-ui.js`
18. `assets/app/js/edit-placement.js`
19. `assets/app/js/edit-tools.js`
20. `assets/app/js/app.js`

`assets/app/js/app.js` requires global modules:
- `window.VibeMolParsers`
- `window.VibeMolRendering`
- `window.VibeMolInteraction`
- `window.VibeMolUI`
- `window.VibeMolViewUtils`
- `window.VibeMolEditUtils`
- `window.VibeMolEditCommands`
- `window.VibeMolEditState`
- `window.VibeMolIOUtils`
- `window.VibeMolFragments`
- `window.VibeMolStructureCore`
- `window.VibeMolBondEditing`
- `window.VibeMolEditUi`
- `window.VibeMolEditPlacement`
- `window.VibeMolEditTools`

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
- Molden files expose Molden-specific toolbar controls for MO selection and grid step/padding.
- Vibrational mode controls (mode index, play/pause, amplitude, speed, frequency) are shown in View panel when available.
- Trajectory playback and vibrational playback are mutually exclusive for one active file.
- View controls include `COM → Origin`, principal-axis alignment, orthographic toggle, and `+X/+Y/+Z` camera presets; shortcut `R` shifts active molecule center of mass to origin.
- `View` and `Coordinates` are separate floating windows; the coordinates window can toggle between angstrom and bohr display and supports inline atom editing.
- Malformed file imports (`.xyz`, `.cube`, `.2ccube`) are surfaced via popup errors.
- Multi-frame `.xyz` files are parsed as trajectories and can be animated from View panel controls.
- Autoiso caches per file/component/orbital and falls back to synchronous estimation when the worker path is unavailable.
- Surface hover metrics are shown only for normalized orbital-like grids (`∫q² dV ≈ 1`) and are cached per surface.
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
- Edit mode defaults to `Add` on entry.
- Edit mode now uses an adaptive floating menu instead of the old visible toolbox.
- Edit tools currently include `Selection`, `Move`, `Add`, `Bond`, `Transform`, and `Delete`.
- Selection supports click-to-replace, `Shift+click` toggle, empty-click clear, and `Cmd/Ctrl+A` select-all.
- Add tool includes cursor-relative placement with automatic angle snapping (`180°`, `120°`, `109.5°`, `90°`, `60°`).
- Hold `Shift` during add-grow placement to bypass angle snap.
- Add mode includes `Atom`, `Fragment`, and `Molecule` submodes.
- Add atom uses a right-side last-operation operator panel with live XYZ editing plus `Enter` confirm / `Esc` cancel.
- Fragment insertion uses the shared fragment catalog and supports starter-group attach flows (for example methyl and hydroxyl geometry overrides).
- Standalone molecules can be placed by click/drag/click with quaternion rotation around the preview COM.
- Standalone molecule placement includes a right-side operator panel with live XYZ/rotation editing and axis-align actions.
- Transform mode supports bond hover, bond-side selection, additive selection, explicit rotate-fragment and rotate-bond actions, and post-transform cleanup.
- Edit undo/redo history is active (`Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`).
- Delete tool and hover-delete (`Backspace`/`Delete`) are active.
- Bond tool creates bonds by clicking two atoms, edits order through an in-scene popup (`1–4,0`), and supports right-click delete.
- Structures now persist explicit `vol.bonds` with `{ id, a, b, order, kind }` and builder annotations under `vol.annotations.builder.byAtomId`.
- `Save Structure` exports the active editable record as a reproducible `vibemol.structure` JSON document.
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
Bond-order inference lives in `assets/app/js/app.js` and is enabled only when the `multi bonds` toggle is on.

1. Candidate bond generation (`collectBondCandidates`):
- Build edges from interatomic distances using covalent radii.
- Keep pairs where `0.4 Å < d(i,j) <= 1.15 * (r_cov(i) + r_cov(j))`.
- Initialize each kept edge with `order = 1`.

2. Conservative chemistry limits (`getPairMaxBondOrder`):
- Never promote transition-metal, lanthanide, or actinide pairs.
- Never promote pairs containing monovalent main-group atoms (`H`, `F`, `Cl`, `Br`, `I`).
- Otherwise allow up to:
  - triple: `C-C`, `C-N`, `N-N`
  - double: common main-group pairs (`C-O`, `C-S`, `N-O`, `O-O`, `P-S`, etc.)
  - single: everything else

3. Target valence assignment (`chooseTargetValence`):
- Use a small main-group valence table (for example `C:4`, `N:3/5`, `O:2`, `S:2/4/6`).
- Pick the smallest allowed valence that is `>=` current connectivity; if none, pick the largest allowed.
- Metals/f-block keep their current connectivity as target (no valence-driven promotion).

4. Greedy bond promotion (`inferBondOrders`):
- Compute per-atom valence deficits: `deficit = targetValence - currentValence`.
- Repeatedly choose the promotable edge with highest score:
  - edge must still be below `maxOrder`
  - both endpoint deficits must be positive
  - score = `(deficit_i + deficit_j) + distanceBonus`
  - `distanceBonus` favors shorter-than-reference bonds via `len/singleRef`
- Promote that edge by `+1` bond order, decrement both deficits, repeat until no valid promotion.

5. Rendering usage:
- The inferred `order` drives single/double/triple component generation.
- For double/triple bonds, component offsets are placed in a local plane estimated from neighbor geometry (`getBondPlaneOffsetDirection`) so orientation roughly follows local molecular structure.

Scope note:
- This is a pragmatic heuristic for organic/main-group systems.
- It is not a formal bond-order solver and intentionally avoids aggressive inference for metals and f-block chemistry.

## Commands
Run web app locally:
- `python3 -m http.server`
- Open `http://localhost:8000/`

Fast JS syntax checks:
- `node --check assets/app/js/fragments.js`
- `node --check assets/app/js/parsers.js`
- `node --check assets/app/js/rendering.js`
- `node --check assets/app/js/interaction.js`
- `node --check assets/app/js/ui.js`
- `node --check assets/app/js/app.js`

Python API setup:
- `python3 -m venv .venv`
- `source .venv/bin/activate`
- `pip install -r api/requirements.txt`
- `python -m playwright install chromium`

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
9. In edit mode, test `Selection` behavior: click, `Shift+click`, empty-click clear, and `Cmd/Ctrl+A`.
10. In edit mode, test `Add > Atom`, `Add > Fragment`, and `Add > Molecule`, including the add-atom and add-molecule operator panels plus undo/redo and `Esc` cancel for molecule placement.
11. In edit mode, test the bond tool: atom-to-atom create, clicked-bond popup `1–4,0`, and right-click bond delete.
12. Use `Save Structure`, then drag-drop the exported `vibemol.structure` file back into the app and verify explicit bond orders survive round-trip.
13. Open `View` and `Coordinates`; verify orthographic toggle, COM/orientation actions, angstrom/bohr switching, and inline coordinate edits.
14. Save/load a preset in web UI and verify settings round-trip, including `extensions.builder` when fragment operations exist.
15. Run CLI with `--preset` and with `.vibemolrc` auto-discovery.
16. Save PNG and export XYZ; check browser console for errors.

## Deployment Notes
- Main deployment target is static hosting from repository root (`index.html`).
- `.nojekyll` must remain present for GitHub Pages compatibility.
