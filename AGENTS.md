# AGENTS.md

## Purpose
This repository contains `VibeMol`, a static browser app for molecular visualization, plus a Python automation client.

Supported molecular file types:
- `.cube` / `.cub`
- `.2ccube` (two-component)
- `.xyz`

Primary capabilities:
- Iso-surface rendering and cloud rendering
- Atom/bond rendering with multiple molecule styles
- Edit mode and measurement mode
- PNG export and XYZ export
- Portable preset save/load (web and CLI compatible)

## Project Layout
- `index.html`: UI shell, controls, and required script loading order.
- `assets/app/js/app.js`: main app orchestration, scene lifecycle, style logic, preset API, file loading.
- `assets/app/js/parsers.js`: parsers (`parseCube`, `parseTwoComponentCube`, `parseXYZ`) including streaming tokenization.
- `assets/app/js/rendering.js`: volume/stat helpers used by `app.js`.
- `assets/app/js/interaction.js`: keyboard shortcut routing and input-focus guards.
- `assets/app/js/ui.js`: UI formatting helpers for coordinates and XYZ export text.
- `assets/vendor/js/*.js`: vendored runtime dependencies loaded as globals.
- `assets/data/sample.cube`: startup sample file.
- `docs/experiments/`: visual/style experiments and notes.
- `api/vibemol_client.py`: Playwright-based Python client for automated renders.
- `api/README.md`: CLI usage, presets, and `.vibemolrc` behavior.
- `api/requirements.txt`: Python dependencies.

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
9. `assets/app/js/app.js`

`assets/app/js/app.js` requires global modules:
- `window.VibeMolParsers`
- `window.VibeMolRendering`
- `window.VibeMolInteraction`
- `window.VibeMolUI`

Preset automation contract exposed globally:
- `window.VibeMolPreset.kind`
- `window.VibeMolPreset.version`
- `window.VibeMolPreset.listKeys()`
- `window.VibeMolPreset.export(options?)`
- `window.VibeMolPreset.import(preset, options?)`

## Key Behavior Notes
- 2C surface mode is global across loaded 2C files.
- Molecule styles are: `default`, `toon`, `studio` (shown as Kit), `glossy`.
- Keyboard shortcuts `1/2/3/4` map to molecule styles in that order.
- `fancy` is treated as a deprecated alias for `toon` in preset/CLI compatibility paths.
- Toon molecule style enforces toon-shaded surfaces.
- Glossy style exposes a configurable glossy bond center radius (`molecule.glossyBondRadius`).
- Preset import supports `strict` and `relaxed` modes and preserves unknown keys for round-trip safety.
- Scene teardown performs deep, deduplicated GPU resource disposal.

## Commands
Run web app locally:
- `python3 -m http.server`
- Open `http://localhost:8000/`

Fast JS syntax checks:
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

Repo checks:
- `git status --short`
- `git diff --stat`

## Editing Rules For Agents
- Prefer editing `assets/app/js/` modules over large inline script blocks in `index.html`.
- Preserve script load order and global contracts in `index.html`.
- Keep preset key stability across web and CLI integrations when possible.
- If adding a new user-facing setting, register it in preset import/export (`presetSettingRegistry`) unless intentionally excluded.
- Do not modify vendored libraries unless explicitly requested:
  - `assets/vendor/js/three.min.js`
  - `assets/vendor/js/orbit-controls.global.js`
  - `assets/vendor/js/isosurface.bundle.js`
- Keep heavy computation out of the frame loop.
- Ensure geometries/materials/textures are disposed on teardown/rebuild paths.

## Manual Validation Checklist
After non-trivial changes:
1. Launch local server and load app.
2. Verify `assets/data/sample.cube` autoloads.
3. Load at least one `.cube`, one `.2ccube`, and one `.xyz`.
4. Confirm 2C mode selection persists across file switches.
5. Toggle surface/cloud modes and verify rendering updates.
6. Check molecule styles (`default`, `toon`, `studio/Kit`, `glossy`) and keyboard shortcuts `1/2/3/4`.
7. Enter edit mode and measurement mode; verify interactions still work.
8. Save/load a preset in web UI and verify settings round-trip.
9. Run CLI with `--preset` and with `.vibemolrc` auto-discovery.
10. Save PNG and export XYZ; check browser console for errors.

## Deployment Notes
- Main deployment target is static hosting from repository root (`index.html`).
- `.nojekyll` must remain present for GitHub Pages compatibility.
