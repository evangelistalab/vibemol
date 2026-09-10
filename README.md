# VibeMol

Static molecular visualization app for `.cube/.cub`, `.2ccube`, and `.xyz` files, with a companion Python automation client.
It also accepts vibrational sidecar inputs (`.vib.json`, `.vmodes.json`, `.modes.json`, ORCA `.hess`, and Psi4 `.dat/.out` frequency outputs).

## Features
- Surface rendering and cloud rendering modes
- 2-component CUBE support with global 2C mode selection across loaded 2C files
- Molecule styles:
  - `Basic`
  - `Toon (luminous)`
  - `Kit (collar joints)` (internal style id: `kit`)
- Edit mode and measurement mode
- Save PNG, batch export, and XYZ export
- Portable preset save/load in the web UI
- Complete session save/open, with browser autosave and recovery
- Shared preset model with CLI (`window.VibeMolPreset` + Python client)
- Vibrational mode playback from sidecar JSON (`.vib.json`), ORCA Hessian files (`.hess`), and Psi4 vibration outputs (`.dat`, `.out`)
- Click a scene's **Orbitals** header to edit all its surfaces together in Appearance: colors, iso value, Auto-iso, opacity, material, and surface/cloud mode. Hidden and uncomputed orbitals receive the settings too; Molden grids are still computed only when needed. Click an individual orbital to adjust it separately. Differing settings are marked **(mixed)**.

## Web Quick Start
```bash
python3 -m http.server
```
Open `http://localhost:8000/`.

Startup now shows the empty onboarding card. Use `Choose files` or `Open sample file` to load content.

XYZ files and pasted coordinates share the same import checks. If a structure has at least two atoms but no plausible bonds at angstrom distances, a popup offers conversion from bohr to angstroms. Choose **OK** to convert or **Cancel** to keep the original coordinates as angstroms. For trajectories, the check uses the first frame and conversion applies to every frame.

## Controls
- `1/2/3`: switch molecule style (Basic / Toon / Kit)
- `S`: save PNG
- `B`: batch export
- `I`: toggle surfaces
- `A`: toggle axes
- `V`: open view/coords panel
- `M`: measurement mode
- `E`: edit mode
- `Arrow keys`: previous/next file
- `Cmd/Ctrl+C`: copy element and XYZ coordinate rows in angstroms, without the atom-count/comment header. Copies selected atoms in Edit mode, or the active structure otherwise. Text fields and selected page text keep normal copy behavior.
- `Cmd/Ctrl+V`: paste XYZ into a new structure, including in a fresh VibeMol window. Selected atoms copied in the same Edit window retain the existing duplicate-selection behavior, including internal bonds.

## Sessions and recovery

Use **Save session** to download the entire workspace, including source data, edited structures, layers, arithmetic dependencies, appearance, and playback settings. **Open session** restores it with playback paused; the original molecular files are not required.

Browser autosave retains two snapshots and offers **Recover session** after reopening the app. See [Sessions and recovery](docs/sessions.md) for format details, storage limits, and the automation API.

## Presets
Use `Save Preset` / `Load Preset` in the web toolbar.

Preset envelope:
- `kind: "vibemol.preset"`
- `presetVersion: 1`
- `settings` as dot-keys (for example `surface.iso`, `molecule.style`, `render.mode`, `view.camera.x`)

Compatibility notes:
- `fancy` is accepted as a deprecated alias and mapped to `toon`.
- Unknown preset keys are preserved in relaxed mode for round-trip safety.

## Python API Prototype
See `api/README.md` for full usage.

Setup:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r api/requirements.txt
python -m playwright install chromium
```

Example:
```bash
python api/vibemol_client.py assets/data/sample.cube out/sample_toon_cli.png --style toon
```

The CLI supports:
- Style and iso overrides
- Preset import/export
- `.vibemolrc` auto-discovery (`./` then `$HOME`)

## Project Layout
- `Makefile`: local check/test entrypoints (`check`, `test-unit`, `test-e2e`, `test`)
- `index.html`: UI shell and script order
- `assets/app/js/app.js`: core app orchestration
- `assets/app/js/parsers.js`: file parsers
- `assets/app/js/rendering.js`: rendering/stat helpers
- `assets/app/js/interaction.js`: shortcut/input helpers
- `assets/app/js/ui.js`: coords/XYZ formatting helpers
- `assets/app/js/structure.js`: normalized structure schema helpers for atoms, bonds, and structure export/import
- `assets/app/js/volume-geometry.js`: pure atom/voxel/world coordinate conversion and marching-cubes isosurface helpers
- `assets/app/js/volume-2c.js`: 2C phase and total/Bloch-colored isosurface builders
- `assets/app/js/bond-inference.js`: covalent bond candidate generation, bond-order inference, and aromatic six-ring detection
- `assets/app/js/auto-hydrogen.js`: auto-hydrogen planning heuristics and edit-mode hydrogenation controller
- `assets/app/js/autoiso.js`: auto-iso estimation, cache, and worker orchestration controller
- `assets/app/js/cloud-rendering.js`: standard and two-component cloud geometry builders
- `assets/app/js/preset.js`: preset registry, import/export controller, and builder-extension preset state helpers
- `assets/app/js/structure-transport.js`: reproducible structure envelope export/import controller and `window.VibeMolStructure` public API
- `assets/app/js/session-format.js`, `session.js`, and `session-recovery.js`: portable workspace format, save/open, and browser autosave/recovery
- `assets/app/js/file-loader.js`: file ingestion, onboarding sample loads, drag/drop, and embed file-loading controller
- `assets/app/js/edit-state.js`: edit-history and editable-record controller
- `assets/app/js/edit-placement.js`: add/placement workflows for atoms, fragments, and molecules
- `assets/app/js/edit-tools.js`: edit tool and selection coordination
- `assets/app/js/edit-gizmos.js`: move/rotate gizmo creation, hover, and picking helpers
- `assets/app/js/edit-transform.js`: shared move/rotate transform-session and pointer-routing controller
- `assets/app/js/edit-gestures.js`: gesture-first edit interaction controller and gesture HUD coordinator
- `assets/app/js/edit-ui.js`: adaptive edit UI and operator-panel helpers
- `api/vibemol_client.py`: Playwright automation client
- `tests/unit/`: Node built-in unit tests for browserless logic modules
- `tests/e2e/`: Playwright smoke/E2E tests for the web app
- `.github/workflows/ci.yml`: CI workflow for checks, unit tests, and browser smoke tests

## Development Checks
```bash
make check
make test-unit
make test-e2e
make test
```

`make test-e2e` runs the full smoke suite, focused scene/arithmetic regressions, and session/recovery regressions, each with its own temporary local server. Set `VIBEMOL_TEST_ARTIFACT_DIR` to keep browser artifacts outside the checkout.

See the [Product roadmap](docs/roadmap.md) for implemented features, remaining work, and priorities. See [Scene architecture](docs/scene-architecture.md) for data ownership, the shared import pipeline, and arithmetic execution limits.

Relevant browserless syntax checks include:

```bash
node --check assets/app/js/volume-geometry.js
node --check assets/app/js/volume-2c.js
node --check assets/app/js/bond-inference.js
node --check assets/app/js/auto-hydrogen.js
node --check assets/app/js/autoiso.js
node --check assets/app/js/cloud-rendering.js
node --check assets/app/js/edit-gizmos.js
node --check assets/app/js/edit-transform.js
node --check assets/app/js/preset.js
node --check assets/app/js/structure-transport.js
node --check assets/app/js/file-loader.js
node --check assets/app/js/app.js
```

If Playwright is not installed yet in your current Python environment:

```bash
pip install -r api/requirements.txt
python -m playwright install chromium
```

## Deployment
- Static deployment from repository root (`index.html`)
- `.nojekyll` is required for GitHub Pages compatibility
- Keep `CNAME` (`vibemol.org`) in source for production. The beta deployment workflow removes it only from the beta mirror.
