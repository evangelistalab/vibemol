# Figure composer

Open **Panels → Figure**. The panel starts in the right dock and supports the same docking, floating, and saved layouts as the other inspectors.

Choose layers, edit their labels, and drag the grips to reorder. A focused grip also supports **Alt + Up/Down**. Every cell is square; rows follow the selected count and columns. Labels use the app's current typeface and a point size converted with the output DPI. The preview shows the complete grid at its output aspect ratio.

- **Current view** captures the camera pose, quaternion, zoom, and orbit target once. Square cells preserve the vertical framing. No panel independently fits or centers its contents.
- **Fit all panels** first builds the union of the selected, rendered geometries, fits once with padding while preserving orientation, and then locks that camera. Both modes use one depth range covering the union plus at least 3 Å of buffer.
- **Shared iso off** respects each layer's Auto-iso or manual threshold. Auto-iso resolves hidden and deferred orbitals using the same estimator as the viewport, before fitting the common camera; the result is reused for capture. The original iso values and pending flags restore afterward.
- **Shared iso on** overrides per-orbital Auto-iso with the active surface's current numeric value, falling back to the first selected surface. The panel shows the fixed value and warns about differences.
- **Shared Look** is on by default. Geometry, materials, and lighting already share the current Look; this additionally applies its default surface colors and opacity instead of layer overrides. Scientific surface/cloud/2C modes remain layer data. All overrides are restored afterward.
- **PNG** is one raster figure with pHYs density metadata matching the requested DPI. The default width is 6.5 inches at 300 DPI (1950 pixels).
- **SVG** embeds each rendered PNG and keeps labels as vector text. Its page width/height are in inches and its viewBox matches the raster grid. It is not vector molecular geometry.
- **Transparent** uses an RGBA render target, without the Look background. White and Look background also fill gutters and label bands. Viewport gizmos and temporary Edit/Calculations guides are excluded.

The per-panel limit is the minimum of the GPU renderbuffer limit, texture limit, and **8192 px**. Composition is bounded at **64 megapixels**, 32767 pixels per side, and 128 panels. Requests exceeding the limits are reported in the panel and rejected before changing the renderer; there is no silent reduction of DPI. Tiled rendering above the panel cap is deferred. A 12000-pixel-wide figure can still fit the limits when split into enough columns.

Rendering resizes the backing buffer with `setSize(..., false)` and leaves its pixel ratio unchanged. Pixel-sized cloud points, fixed-size point materials, line widths, and DOF blur scale with output resolution. Molecular outlines in `appearance-model.js` use world-space geometry/radius fractions and need no pixel multiplier. Hardware GL line-width limitations remain applicable.

Rendering reuses `scene-export.js` without changing its target semantics. The camera, renderer dimensions/projection, playback, focus/selection/visibility, temporary mode suppression, and layer appearance values restore in `finally`, including cancellation or capture failure. Live previews use the same transaction at reduced resolution. A frozen viewport avoids displaying temporary render sizes. Figure settings are transient output choices, intentionally excluded from scientific presets and sessions.

```js
const targets = VibeMolFigure.listTargets();
const blob = await VibeMolFigure.compose({
  targets: targets.map(t => ({id: t.id, label: t.name})),
  cols: 3, widthIn: 6.5, dpi: 300,
  camera: 'fit', sharedIso: true, sharedLook: true,
  background: 'white', format: 'svg',
  onPanel: panel => console.log(panel.position, panel.quaternion, panel.zoom),
});
VibeMolFigure.limits(); // {gpu, panel, tiled: false}
```

`compose` returns a Blob; the panel downloads it as `<scene>-figure.png` or `.svg`. The API also accepts an AbortSignal. `_forceThrowOnPanel` (one-based) exercises failure cleanup in regression tests. `viewport()` is a read-only diagnostic snapshot.

Validation: `tests/unit/figure-composer.test.mjs`, `tests/unit/figure-renderer.test.mjs`, and `tests/e2e/figure.py`. Browser tests also write composed PNG/SVG examples for six bundled two-component orbitals and record the effective device limit.
