# VibeMol

Static molecular visualization app for `.cube/.cub`, `.2ccube`, and `.xyz` files, with a companion Python automation client.
It also accepts vibrational sidecar inputs (`.vib.json`, `.vmodes.json`, `.modes.json`, ORCA `.hess`, Psi4 Molden normal-mode files, and Psi4 `.dat/.out` frequency outputs).

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
- Vibrational mode playback from sidecar JSON (`.vib.json`), ORCA Hessian files (`.hess`), and Psi4 vibration outputs (`.molden`, `.dat`, `.out`)

## Web Quick Start
```bash
python3 -m http.server
```
Open `http://localhost:8000/`.

`assets/data/sample.cube` autoloads when served over HTTP.

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
- `index.html`: UI shell and script order
- `assets/app/js/app.js`: core app orchestration
- `assets/app/js/parsers.js`: file parsers
- `assets/app/js/rendering.js`: rendering/stat helpers
- `assets/app/js/interaction.js`: shortcut/input helpers
- `assets/app/js/ui.js`: coords/XYZ formatting helpers
- `api/vibemol_client.py`: Playwright automation client

## Development Checks
```bash
node --check assets/app/js/parsers.js
node --check assets/app/js/rendering.js
node --check assets/app/js/interaction.js
node --check assets/app/js/ui.js
node --check assets/app/js/app.js
```

## Deployment
- Static deployment from repository root (`index.html`)
- `.nojekyll` is required for GitHub Pages compatibility
