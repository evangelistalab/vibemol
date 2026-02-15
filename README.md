VibeMol
=======

A vibe-coded cube file visualization tool

A lightweight, zero-install molecular isosurface viewer for Gaussian CUBE files.

- View positive/negative orbital isosurfaces (Emory color scheme by default)
- Atom spheres + bond cylinders with element covalent radii
- Interactive camera and view controls (shift, camera, target, rotation)
- Background color, opacity, and color controls
- Drag-and-drop or auto-load `assets/data/sample.cube`

Quick start
- Serve the folder (recommended for local fetch of `assets/data/sample.cube`):
  - `python3 -m http.server` then open http://localhost:8000/
- Or open `index.html` directly (auto-load may be blocked by browser file:// policies)

Notes
- Repository name: VibeMol
- Entry point: `index.html`
- App scripts: `assets/app/js/parsers.js`, `assets/app/js/rendering.js`, `assets/app/js/interaction.js`, `assets/app/js/ui.js`, `assets/app/js/app.js`
- Local libs: `assets/vendor/js/three.min.js`, `assets/vendor/js/orbit-controls.global.js`, `assets/vendor/js/isosurface.bundle.js`, `assets/vendor/js/atomic-data.js`
- Data assets: `assets/data/sample.cube`

GitHub Pages
- URL (after enabling Pages): https://evangelistalab.github.io/vibemol/
- Enable in GitHub → Settings → Pages:
  - Source: Deploy from a branch
  - Branch: `main` — folder `/ (root)`
  - Save
- This repo includes `.nojekyll` to ensure static assets are served as-is.
