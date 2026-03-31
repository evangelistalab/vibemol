# VibeMol

Static molecular visualization app for `.cube/.cub`, `.2ccube`, and `.xyz` files, with a companion Python automation client.
It also accepts vibrational sidecar inputs (`.vib.json`, `.vmodes.json`, `.modes.json`, ORCA `.hess`, and Psi4 `.dat/.out` frequency outputs).

## Features
- Surface rendering and cloud rendering modes
- 2-component CUBE support with global 2C mode selection across loaded 2C files
- Molecule styles:
  - `Default`
  - `Toon (luminous)`
  - `Kit (collar joints)` (internal style id: `kit`)
  - `Glossy (glass edge)`
- Edit mode and measurement mode
- Save PNG, batch export, and XYZ export
- Portable preset save/load in the web UI
- Shared preset model with CLI (`window.VibeMolPreset` + Python client)
- Vibrational mode playback from sidecar JSON (`.vib.json`), ORCA Hessian files (`.hess`), and Psi4 vibration outputs (`.dat`, `.out`)

## Web Quick Start
```bash
python3 -m http.server
```
Open `http://localhost:8000/`.

Startup now shows the empty onboarding card. Use `Choose files` or `Open sample file` to load content.

## Controls
- `1/2/3/4`: switch molecule style (Default / Toon / Kit / Glossy)
- `S`: save PNG
- `B`: batch export
- `I`: toggle surfaces
- `A`: toggle axes
- `V`: open view/coords panel
- `M`: measurement mode
- `E`: edit mode
- `Arrow keys`: previous/next file

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
- `assets/app/js/edit-state.js`: edit-history and editable-record controller
- `assets/app/js/edit-placement.js`: add/placement workflows for atoms, fragments, and molecules
- `assets/app/js/edit-tools.js`: edit tool and selection coordination
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

`make test-e2e` starts its own temporary local server; do not start a second server first.

If Playwright is not installed yet in your current Python environment:

```bash
pip install -r api/requirements.txt
python -m playwright install chromium
```

## Deployment
- Static deployment from repository root (`index.html`)
- `.nojekyll` is required for GitHub Pages compatibility
