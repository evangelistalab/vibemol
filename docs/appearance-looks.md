# Appearance components and looks

**Appearance → Looks** starts with the approved **Basic, Toon, and Kit** presets. Each is a complete recipe with explicit display geometry, materials, colors, lighting, and effects. The same three shortcuts (`1/2/3`, outside edit gestures) apply these recipes. Changing one component does not select or force another component: Kit connectors can use Toon atom shading, smooth bond shading, and Enamel orbitals together.

The other six looks (Classic, Porcelain, Nocturne, Ink, Atelier, Opal) remain experimental candidates. They are available in the [real-renderer comparison](experiments/style-lab/compare.html), not in the main preset strip. The comparison supports methane, pyridine, metal coordination, and orbital lobes. **Materials only** holds the reference geometry, palette, background, and lighting fixed. Each preview opens the actual VibeMol appearance editor; it does not implement another renderer. Study previews skip appearance autosave, startup defaults, and workspace recovery so comparisons do not replace a user's last working appearance or recovery file. Explicit named saves and exports remain available.

## Native editor

- **Geometry:** cylinders or Kit connectors, atom scale, bond radius, Kit collar radius, and curved multiple bonds. These affect displayed shapes, never molecular coordinates or chemical topology.
- **Materials:** Atoms, Bonds, or Surfaces. Bonds can link to the atom material; unlinking copies the current atom material before independent edits. Finish swatches contain material properties only. Physical, Classic smooth (Phong), and Toon shading expose the applicable controls, including roughness, shininess, specular strength, coat, reflections, emission, tint, and Toon bands. Advanced controls use the existing disclosure pattern.
- **Surface scope:** all orbitals in the active molecule, including hidden/deferred ones, or the selected orbital. Mixed values are shown explicitly. Changing one property preserves each orbital's other material properties. A finish swatch replaces the whole material descriptor while retaining colors, opacity, and isovalues.
- **Lighting & contours:** light strengths, direction, colors, exposure, contours, highlight shells, and theme-following background behavior. Palette and bond-color policy are independent from material/shader choice. Existing background, element colors, scene effects, camera, visibility, and surface controls remain in their established sections.

The editor reuses these existing components:

| Purpose | Existing implementation |
| --- | --- |
| Sections and disclosures | `vm-appearance-section`, `vm-section-label`, `inspectorSubsectionSummary` |
| Aligned fields | `vm-field-row`, `vm-field-label`, `vm-field-control` |
| Preset and material target strips | `vm-button-group`, `vm-button-group__item` |
| Numeric controls | `VmSlider`, `vm-slider__range`, `vm-slider__value`, `vm-mono` |
| Switches and colors | `vm-toggle`, `vm-color-swatch` |
| Menus and actions | `vm-select`, `secondary`, `vm-popover__actions` |
| Status text | `vm-session-status` |

`looks-ui.css` contains only hidden-state and wrapping/spacing rules. The previous gallery-specific cards, thumbnails, button skins, and slider skins were removed. The editor inherits the app's tokens, fonts, themes, and focus treatments.

## Saving and preservation

**Undo** restores the previous appearance edit, grouping a slider drag into one step. Molecular edit undo remains separate. **Modified** compares current resolved values with the saved recipe; **Revert** reapplies the recipe. Built-ins cannot be overwritten. **Save as new** creates a named look in **My looks**. Save & share provides update, rename, delete, import/export, and an explicit default. Updating a saved look does not change a previously saved startup default until **Set as default** is used again.

**Save material** creates a reusable material swatch. Material files (`vibemol.material`, version 1) contain a name and complete descriptor, without geometry, palette, lighting, or opacity. Named materials can be updated, removed, exported, and imported into the chosen target. Both libraries hold up to 50 entries; imports are limited to 128 KB. Storage failures leave the in-memory result usable and prompt export.

Look files retain the portable `vibemol.preset` envelope with `meta.lookVersion: 2`. `appearance.rendering` stores the resolved component object; `appearance.look` stores the name and baseline for Modified/Revert. No saved result depends on a future built-in recipe or a local library entry. Version-1 look files and legacy Basic/Toon/Kit preset keys migrate into explicit components. Existing deprecated style aliases continue through their compatibility paths. The old flat material/light keys remain readable for compatibility; the canonical component object takes precedence when present.

Looks preserve coordinates, explicit bonds, camera/projection, visibility, selections, playback, orbital isovalues, Auto-iso, phase mapping, and surface/cloud mode. A full look applies across loaded scenes. A look contains one surface material recipe; individual orbital overrides belong in a complete session. Session save/open and autosave/recovery store exact per-layer material descriptors, including deferred orbital settings, and restore them independently of local defaults.

## Renderer contract

`appearance-model.js` validates and migrates geometry/material/color/light/effect data and creates Three.js materials. Material slots are independent of connector geometry. Legacy per-element accents and vertex-colored surface emission are explicit descriptor values; editing an emission/property control overrides the corresponding legacy variation. Phase colors and field-gradient surface normals remain intact.

`appearance-looks.js` owns complete look recipes. `appearance-editor.js` binds native component controls. `looks-ui.js` manages named look/material libraries and appearance undo. `app.js` applies component patches and synchronizes the existing renderer and scene model.

Material and light changes reuse existing geometry. Geometry, palette, and contour changes rebuild molecule display meshes only. Neither route re-marches orbital surfaces nor computes deferred Molden grids. Full looks also preserve existing orbital meshes. Cloud colors and opacity update from each layer's own appearance. Edit placement previews use the same material model.

The automation API is `VibeMolAppearanceLooks.list/apply/edit/material/snapshot`. `list()` marks experimental recipes. For example:

```js
VibeMolAppearanceLooks.apply('kit');
VibeMolAppearanceLooks.edit('material', { model: 'toon' }, { target: 'atoms' });
VibeMolAppearanceLooks.edit('material', { roughness: 0.35 }, { target: 'surfaces', scope: 'group' });
```

Validation: `make check`, `make test-unit`, and the `looks.py`, `premerge.py`, `sessions.py`, and `smoke.py` browser suites in `tests/e2e/`. Appearance regressions cover component independence, actual materials, deferred and mixed orbital edits, unchanged surface geometry, undo, named libraries, defaults, reload, malformed imports, and portable sessions.
