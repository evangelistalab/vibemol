# Appearance looks

Open **Appearance → Looks** to choose Classic, Porcelain, Nocturne, Ink, Atelier, or Opal. The gallery thumbnails are rendered by VibeMol using the same pyridine coordinates and camera. A click applies the complete look across the loaded scene; **Undo look** restores the previous appearance. Keyboard molecular-edit undo remains separate.

Looks include atom/bond proportions, materials, contours, lighting, element colors, background, and orbital material/palette/opacity. They preserve coordinates, explicit bonds, camera/projection, visibility, selections, playback, orbital isovalues, Auto-iso, phase mapping, and surface/cloud mode. Applying a look uses `skipAutoIso` and never materializes deferred Molden orbitals.

**Orbital finish** is independent of molecule shading. Vivid is the gallery label for the existing `emissive` material; Enamel and Satin retain their material names. Finish changes preserve colors and opacity. The default scope is every orbital in the current molecule, including hidden and uncomputed orbitals; **Selected orbital only** targets the active cube/arithmetic layer. The picker reports mixed finishes. Existing Toon presets keep their inherited surface shading until a finish is explicitly chosen for a layer; that layer's `independentMaterial` flag persists through duplication and sessions.

Use **Polish**, **Contours**, and the existing Appearance controls to adjust a look. **Modified** compares the current values with the saved recipe. **Revert** reapplies that exact recipe; built-ins cannot be overwritten. **Save as new** stores a named copy and a small canvas thumbnail in **My looks**. **Save & share** contains update, rename, delete, export/import, and default actions. A look stores one orbital recipe; individual orbital overrides belong in a complete session.

- **Export look** writes the existing `vibemol.preset` envelope, marked with `meta.lookVersion: 1`, with resolved appearance settings and `appearance.look` metadata. **Import look** validates the complete recipe before saving and applying it. It does not import camera, isovalue, or other unrelated settings from a file.
- **Set as default** saves an independent snapshot for new windows/sessions. Subsequent adjustments and updates do not silently change that default. **Use last appearance** removes the explicit default and restores ordinary appearance-autosave behavior.
- **Save session** embeds the resolved rendering values, look name/baseline, and every layer's appearance. Restoring a session takes precedence over a local default and does not need the user's saved-look library. Older sessions without the new rendering keys use the legacy material/light defaults.
- The library holds 50 looks. Imports are limited to 128 KB; thumbnails accept bounded PNG data URLs only. If browser storage fails, the current in-memory library remains usable and the UI recommends exporting it.

`appearance-looks.js` owns the validated recipe schema and shared material factory. `looks-ui.js` owns the picker and named library. `app.js` registers the durable settings and applies appearance patches without copying iso/Auto-iso controls back into layers. Existing Basic/Toon/Kit keys and shortcuts remain supported; manually choosing one restores its original material/light policy and marks a previous look modified.

The original six-look laboratory remains available in `docs/experiments/style-lab/`. Its `vibemol.look-study` files belong to that isolated prototype. Native recipes are tuned for the app's existing lighting/color pipeline; they do not promise pixel-identical output to the prototype or across GPUs.

Validation:

```sh
make check
make test-unit
python tests/e2e/looks.py
python tests/e2e/premerge.py
python tests/e2e/sessions.py
python tests/e2e/smoke.py
```

Regenerate the built-in and orbital material thumbnails with `python tests/e2e/looks.py --thumbnails` from the repository root. The previews come directly from the app's renderer.
