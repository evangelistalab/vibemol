# Appearance components and looks

**Appearance → Looks → Preset** contains **Basic, Toon, Kit, Classic, Porcelain, Ink, and Opal**. Each is a complete recipe with explicit display geometry, materials, colors, lighting, and effects. Shortcuts `1/2/3` still apply Basic/Toon/Kit. Geometry and material remain independent: Kit connectors can use any material.

Basic preserves its original pairing: polished atoms/bonds and luminous, clear-coated orbital surfaces. Its surface finish uses roughness `1`, clearcoat `1`, coat roughness `0.1`, color fill `0.8`, and no metalness or environment reflections. The atom/bond recipe and lighting stay unchanged. Selecting or editing a material explicitly replaces this pairing with one shared material; Appearance Undo or Revert restores the full Basic look. The Material section explains this behavior without adding separate target controls. Other curated presets use one material throughout.

Classic, Porcelain, Ink, and Opal retain the standalone Style Lab's camera-relative key/fill/rim lights, light directions, studio environment reflections, display radii, and material response. Classic uses smooth Phong shading without tone mapping; the other studio looks use ACES. Porcelain and Opal enable shadows. Opal retains the Lab's pearlescence thickness range. Transparent surfaces and depth of field use an HDR intermediate target when supported, preserving highlight values before the final tone mapping pass.

Nocturne and Atelier remain experimental candidates in the [real-renderer comparison](experiments/style-lab/compare.html). The comparison supports methane, pyridine, metal coordination, and orbital lobes. **Materials only** holds the reference geometry, palette, background, and lighting fixed. Each preview opens the actual VibeMol editor. Study previews skip normal autosave, startup defaults, and workspace recovery; explicit saves and exports remain available.

## Native editor

- **Geometry:** cylinders or Kit connectors, independent atom/metal scales, bond radius, Kit collar radius, and curved multiple bonds. Atom radii, Mesh detail, and Size multipliers expose the remaining shape settings. Per-element radii can be edited or reset to the covalent defaults. These affect displayed shapes, never molecular coordinates or topology.
- **Bond colors:** Bonds contains a By element / Uniform menu and a color swatch (Element tint in element mode). Uniform colors also apply to metal/coordination bonds and aromatic guides. Atoms contains the Standard / Luminous / Kit palette menu; explicit element-color swatches are used exactly.
- **Material:** a section closed by default, using the same disclosure arrow as Geometry and Lighting. Opening it reveals all material controls directly, followed by Save material; there is no nested More material settings menu. Material selections and edits apply to all atoms, bonds, and surfaces, across every loaded molecule and all hidden/deferred orbitals. There are no target tabs, linking controls, or separate Finish/Shading menus. Emissive, Satin, Lacquer, Metal, Gel, and Ceramic reproduce the material recipes from `main` across all three targets. Polished, Matte, Enamel, Classic smooth, and Toon are also available. Only applicable controls appear. Adjusting a property marks the material Custom. Element and orbital phase colors remain distinct.
- **Gel:** replaces Glossy in the menu, using the original Gel recipe (roughness `0.15`, clearcoat `1`, coat roughness `0.02`, reflectivity `0.5`, color fill `0.15`, environment reflections `1.5`). Material selection preserves geometry, lighting, opacity, and scientific data. Old saved Glossy material descriptors and preset keys remain readable.
- **Opacity:** **Surfaces → Opacity** changes the selected orbital or every child of the focused Orbitals group, including hidden/deferred orbitals. Differing group values show Mixed. The slider and numeric value use the existing inspector styling and support Appearance Undo. They update surface/cloud materials without rebuilding geometry or changing the shared material recipe. Atoms and bonds are always opaque; Material has no opacity control. Legacy `molecule.opacity.atom` and `molecule.opacity.bond` settings are ignored on import and omitted from new looks/presets. Surface opacity remains portable in looks and sessions. Transient edit previews retain their visual cues.
- **Lighting & contours:** key/fill/rim/ambient strengths, key and rim directions, light colors, exposure, tone mapping, fixed-width or separate relative atom/bond contours, highlight shells, and theme-following background behavior. Palette and bond colors are independent of material choice.
- **Retired effects:** the former Ink outlines and Blackbody coloring toggles and their rendering paths have been removed. Older preset/session flags are ignored on import and omitted from new exports. The curated Ink preset uses the standard material and contour system.
- **Orbital properties:** colors, isovalues, Auto-iso, visibility, phase, and surface/cloud mode retain their group/selected-orbital behavior. Every orbital uses the current look's surface finish, including future sources.

The editor reuses these existing components:

| Purpose | Existing implementation |
| --- | --- |
| Sections and disclosures | `vm-appearance-section`, `vm-section-label`, `inspectorSubsectionSummary` |
| Aligned fields | `vm-field-row`, `vm-field-label`, `vm-field-control` |
| Preset and material menus | `vm-select` |
| Numeric controls | `VmSlider`, `vm-slider__range`, `vm-slider__value`, `vm-mono` |
| Switches and colors | `vm-toggle`, `vm-color-swatch` |
| Menus and actions | `vm-select`, `vm-btn vm-btn--ghost vm-btn--sm`, `vm-popover__actions` |
| Status text | `vm-session-status` |

`looks-ui.css` contains only hidden-state and wrapping/spacing rules. Look/material actions reuse the compact inspector button styling, including hover, disabled, and keyboard-focus states. Save/share disclosures use `vm-section-label`, and the current look name uses `vm-stat-label`. The editor follows the selected app font and theme without separate typography or color rules.

Material also exposes each Toon band's brightness, emission scale/mixing, and the pearlescence thickness interval. Basic's **Use surface finish everywhere** action adopts its original orbital finish as the shared material for editing with these same controls. See the [appearance audit](appearance-audit.md) for the complete preset-to-control inventory.

## Saving and preservation

**Undo** restores the previous appearance edit, grouping a slider drag into one step. Molecular edit undo remains separate. **Modified** compares current resolved values with the saved recipe; **Revert** reapplies the recipe. Built-ins cannot be overwritten. **Save as new** creates a named look in **My looks**. Save & share provides update, rename, delete, import/export, and an explicit default. Updating a saved look does not change a previously saved startup default until **Set as default** is used again.

**Save material** creates a reusable material swatch. Material files (`vibemol.material`, version 1) contain a name and complete descriptor, without geometry, palette, lighting, or opacity. Named materials can be updated, removed, exported, and imported as the shared material. Both libraries hold up to 50 entries; imports are limited to 128 KB. Storage failures leave the in-memory result usable and prompt export.

Look files retain the portable `vibemol.preset` envelope with `meta.lookVersion: 3`. `appearance.rendering` version 3 stores the shared `material` descriptor and an optional `surfaceMaterial` descriptor for Basic's original surface finish, alongside geometry, lighting, coloring, and effects. A missing or null `surfaceMaterial` uses the shared material. Older v3 looks retain their stored shared appearance until Basic is explicitly reapplied. `appearance.look` stores the name and baseline for Modified/Revert. Saved results do not depend on a future built-in recipe or local library entry.

Version-1 and version-2 looks remain readable. Version-2 atom/bond/surface slots migrate to the atom base material, applied everywhere; per-element and per-orbital material overrides are retired. Stored geometry, palette, light intensities, and camera are preserved. Missing rim direction and tone mapping values use their former defaults. Legacy flat material keys remain readable; the canonical rendering object takes precedence when present.

Looks preserve coordinates, topology, camera/projection, visibility, selections, playback, orbital isovalues, Auto-iso, phase mapping, and surface/cloud mode. Complete sessions and autosave/recovery preserve the material descriptors and light rig. Per-orbital colors and other scientific settings remain part of the session.

## Renderer contract

`appearance-model.js` validates and migrates geometry/material/color/light/effect data and creates Three.js materials. The shared material is independent of connector geometry. Vertex-colored surface emission remains an explicit descriptor value. Phase colors and field-gradient surface normals remain intact.

`bond-geometry.js` builds one closed cylinder for each straight bond component. Element coloring duplicates vertices at the color boundary while retaining continuous geometry and side normals; there are no internal midpoint caps. Kit's collars and curved shafts retain their geometric form, and live updates restore vertex colors when regenerating geometry.

Bond radius is a requested maximum. Each bond is capped against its smaller rendered atom, including multiple-component offsets, mesh facets, collars, and contours. End caps sit entirely inside the atom meshes. Requested settings remain portable; changes to atom size automatically update the effective bond thickness. See [bond fitting](bond-fitting.md) for the equations, limits, and hydrogen topology rules.

`appearance-looks.js` owns complete look recipes. `appearance-editor.js` binds native component controls. `looks-ui.js` manages named look/material libraries and appearance undo. `app.js` applies component patches and synchronizes the existing renderer and scene model.

Material and light changes reuse existing geometry. Geometry, palette, and contour changes rebuild molecule display meshes only. Neither route re-marches orbital surfaces nor computes deferred Molden grids. Full looks also preserve existing orbital meshes. Cloud colors and opacity update from each layer's own appearance. Edit placement previews use the same material model.

Opacity edits also reuse surface/cloud materials and cached WBOIT pass materials. Alpha uniforms are initialized before shader compilation and shared by every side/lighting variant, so the first frame uses the selected opacity. Slider changes must not recreate materials or briefly render surfaces fully opaque. `looks.py` checks consecutive rendered frames and resource identity during drags, full-opacity transitions, and material changes.

The existing **Shadows** switch applies to atoms, bonds, and isosurfaces together, including orbital, arithmetic, phase-colored, and Bloch-colored surfaces. Surfaces cast onto the molecule and other surfaces and receive shadows from them. Emission and ambient/environment lighting remain visible in shaded regions. Hidden surfaces do not cast shadows. Cloud rendering keeps its existing behavior.

Shadow maps fit the visible mesh bounds without changing the saved key-light direction. Transparent surface shadows approximate opacity using texel-scale coverage with PCF filtering; they are not refractive or colored transmission. WBOIT builds one complete shadow map before separating opaque and transparent color passes, then reuses it for those passes. Each alpha/beta viewport uses its own map, also when depth of field or standard transparency is active. The switch updates existing meshes without remeshing surfaces. Its portable key remains `molecule.feature.shadows`, so looks, presets, and sessions remain compatible. Owned surface depth materials are disposed with their meshes.

The automation API is `VibeMolAppearanceLooks.list/apply/edit/material/snapshot`. `list()` marks experimental recipes. For example:

```js
VibeMolAppearanceLooks.apply('kit');
VibeMolAppearanceLooks.edit('material', { model: 'toon' });
VibeMolAppearanceLooks.edit('material', { roughness: 0.35 });
```

Validation: `make check`, `make test-unit`, and the `looks.py`, `premerge.py`, `sessions.py`, and `smoke.py` browser suites in `tests/e2e/`. Appearance regressions cover component independence, actual materials, shared materials across deferred orbitals and future sources, unchanged surface geometry, undo, named libraries, defaults, reload, malformed imports, and portable sessions.

`surface_shadows.py`, run by `looks.py`, compares rendered pixels with only the molecule or surface shadow draws suppressed. It verifies both directions of shadowing at opaque and translucent settings, actual alpha/beta shadow draw isolation, transparency fallback, phase/Bloch surfaces, visibility, unchanged geometry on toggles, and session restoration.
