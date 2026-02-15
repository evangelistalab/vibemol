# AGENTS.md

## Purpose
This repository is a static browser app (`VibeMol`) for visualizing molecular data from:
- `.cube` / `.cub`
- `.2ccube` (two-component)
- `.xyz`

Primary capabilities include isosurfaces, cloud rendering, atom/bond display, edit/measurement modes, and PNG/XYZ export.

## Project Layout
- `index.html`: UI shell and script loading order.
- `assets/app/js/app.js`: main app orchestration, scene lifecycle, rendering flow, mode handling, file loading.
- `assets/app/js/parsers.js`: file parsing logic (`parseCube`, `parseTwoComponentCube`, `parseXYZ`).
- `assets/app/js/rendering.js`: rendering/stat helpers shared by `app.js`.
- `assets/app/js/interaction.js`: keyboard shortcut routing and input focus helpers.
- `assets/app/js/ui.js`: UI formatting helpers for coordinates panel and XYZ text.
- `assets/vendor/js/three.min.js`, `assets/vendor/js/orbit-controls.global.js`, `assets/vendor/js/isosurface.bundle.js`, `assets/vendor/js/atomic-data.js`: vendor/runtime deps loaded as globals.
- `assets/data/sample.cube`: startup sample dataset.
- `docs/experiments/cloud-notes.md`: exploratory notes for cloud rendering mode.

## Runtime Model
No build step is required. The app runs directly in browser from static files.

Script order in `index.html` is required:
1. `assets/vendor/js/three.min.js`
2. `assets/vendor/js/orbit-controls.global.js`
3. `assets/vendor/js/isosurface.bundle.js`
4. `assets/vendor/js/atomic-data.js`
5. `assets/app/js/parsers.js`
6. `assets/app/js/rendering.js`
7. `assets/app/js/interaction.js`
8. `assets/app/js/ui.js`
9. `assets/app/js/app.js`

`assets/app/js/app.js` expects global APIs:
- `window.VibeMolParsers`
- `window.VibeMolRendering`
- `window.VibeMolInteraction`
- `window.VibeMolUI`

## Key Behavior Notes
- 2C surface mode is global across loaded 2C files (changing one applies to all).
- CUBE/2C parser uses streaming tokenization for volumetric data to reduce memory spikes.
- Scene teardown does deep, deduplicated GPU resource disposal during rebuilds.

## Commands
Run locally:
- `python3 -m http.server`
- Open `http://localhost:8000/`

Fast syntax checks:
- `node --check assets/app/js/parsers.js`
- `node --check assets/app/js/rendering.js`
- `node --check assets/app/js/interaction.js`
- `node --check assets/app/js/ui.js`
- `node --check assets/app/js/app.js`

Repo checks:
- `git status --short`
- `git diff --stat`

## Editing Rules For Agents
- Prefer editing `assets/app/js/` modules over adding large inline script blocks.
- Preserve script load order and global contracts in `index.html`.
- Do not modify vendored libraries unless explicitly requested:
  - `assets/vendor/js/three.min.js`
  - `assets/vendor/js/orbit-controls.global.js`
  - `assets/vendor/js/isosurface.bundle.js`
- Keep heavy computation out of frame loop where possible.
- On scene rebuild/removal paths, ensure all created geometries/materials/textures are disposed.
- If adding new global helper modules, include load guards in `app.js` similar to existing ones.

## Manual Validation Checklist
After non-trivial changes:
1. Launch local server and load app.
2. Verify `assets/data/sample.cube` autoloads.
3. Load at least one `.cube` and one `.2ccube` file.
4. Confirm 2C mode selection persists across file switches.
5. Toggle surface/cloud modes and check rendering still updates.
6. Enter edit mode and measurement mode; verify interaction still works.
7. Save PNG and export XYZ.
8. Check browser console for errors.

## Deployment Notes
- Hosted on GitHub Pages from `main` branch root.
- `.nojekyll` must remain present.
