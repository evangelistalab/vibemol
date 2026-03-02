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
- `assets/data/sample.cube`: bundled sample file used by onboarding quick action.
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
- Molecule styles are: `default`, `toon`, `kit` (shown as Kit), `glossy`.
- Global/display shortcuts `1/2/3/4` map to molecule styles in that order.
- In edit mode, `4` is reserved and does not switch to `glossy`.
- `fancy` is treated as a deprecated alias for `toon` in preset/CLI compatibility paths.
- Toon molecule style enforces toon-shaded surfaces.
- Glossy style exposes a configurable glossy bond center radius (`molecule.glossyBondRadius`).
- Startup opens to an empty scene with onboarding card (sample is no longer auto-loaded).
- Drag/drop file loading works on both the scene and onboarding card/drop zone.
- View panel includes `COM → Origin` action; shortcut `R` shifts active molecule center of mass to origin.
- Invalid `.xyz`, `.cube`, or `.2ccube` imports now surface parser errors in popup warnings.
- Preset import supports `strict` and `relaxed` modes and preserves unknown keys for round-trip safety.
- Scene teardown performs deep, deduplicated GPU resource disposal.

## Edit UX Status (0.4.11)
Implemented:
- Edit mode defaults to `Move` on entry.
- Add tool includes cursor-relative placement with automatic angle snapping (`180°`, `120°`, `109.5°`, `90°`, `60°`).
- Hold `Shift` during add-grow placement to bypass angle snap.
- Inline add HUD (element + bond-order quick picks) and cursor mode badge are active.
- Edit undo/redo history is active (`Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`).
- Delete tool and hover-delete (`Backspace`/`Delete`) are active.

Discussed but not implemented yet (carry-forward backlog):
- Fragment-based builder (preset fragments/rings/chains with click-to-place workflow).
- Onboarding “recent files” quick action (sample action exists; recent list not implemented).
- Next-pass builder UX around fragment insertion + constrained attachment flow (single-click attach/replace behavior).

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
2. Verify startup shows the empty onboarding card; test both `Choose files` and `Open sample file`.
3. Load at least one `.cube`, one `.2ccube`, and one `.xyz`.
4. Confirm 2C mode selection persists across file switches.
5. Toggle surface/cloud modes and verify rendering updates.
6. Check molecule styles (`default`, `toon`, `kit/Kit`, `glossy`) and keyboard shortcuts `1/2/3/4`.
7. Enter edit mode and measurement mode; verify interactions still work.
8. Save/load a preset in web UI and verify settings round-trip.
9. Run CLI with `--preset` and with `.vibemolrc` auto-discovery.
10. Save PNG and export XYZ; check browser console for errors.

## Deployment Notes
- Main deployment target is static hosting from repository root (`index.html`).
- `.nojekyll` must remain present for GitHub Pages compatibility.
