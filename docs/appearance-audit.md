# Appearance and preset controls audit

Scope: all seven curated looks, the shared material presets, molecule bond construction and live updates, the Appearance inspector, and portable look/session state.

## Style Studio scope audit

Background color is one global canvas setting, stored in each look as `global.backgroundColor`. It is now editable in both **Style Studio → Lighting & contours → Background** and **Appearance → Scene → Background**. Both controls update the same state, including Modified, grouped Appearance Undo, Revert, named looks, portable exports, autosave, and sessions. Background changes reuse existing molecule and surface meshes. **Follow UI theme** sits beside the Studio swatch: it darkens the rendered background in dark mode without altering the saved base color.

The Studio/sidebar mismatches are resolved with these boundaries:

| Area | Behavior |
| --- | --- |
| Shared style controls | Studio **Colors** mirrors the sidebar atom palette, element-color toggle/editor, and bond color mode/tint. Studio **Lighting & contours** mirrors shadows, fog, and fog depth. Both locations edit the same registered state and use the same Appearance Undo transactions. Geometry size multipliers and element-color reset actions use that path too. |
| Camera and depth of field | All focus and blur settings stay under Camera. Selecting, reverting, importing, or applying a startup look preserves them. Camera edits support Appearance Undo without marking the look Modified. Full presets, appearance autosave, and complete sessions still save them. Old named looks discard their camera settings on import. |
| Surface defaults and overrides | Studio **Surfaces** edits the global palette, phase colors, and opacity saved with a look. These defaults apply to inherited layers and future imports. Sidebar **Surfaces** edits explicit overrides on the selected orbital/group; a deliberate edit remains an override even if it currently matches the default. Colors and opacity are tracked independently. Custom orbital values survive a look change. |
| Explicit reset and saving | The sidebar reports Style/Custom/Mixed separately for colors and opacity, with **Use style colors** and **Use style opacity** actions. Studio **Apply defaults to all orbitals** clears both overrides across loaded layers. These actions support Undo. Saving a look always captures global defaults; individual orbital edits do not mark that recipe Modified and remain in sessions. |

New look exports use `meta.lookVersion: 4`; the rendering descriptor remains version 3. Named-look imports through Studio, file loading, and the preset API use the same application path. General preset/session imports retain their broader scope. Per-layer `styleOverrides` metadata survives duplicates, source state, session save/open, and recovery. Older sessions infer overrides where local colors or opacity differ from the saved global defaults; an old file cannot record deliberate overrides that exactly matched those defaults.

Camera pose/projection, visibility, axes and bounding box, coordinates/topology, orbital isovalues/Auto-iso, phase inversion, surface/cloud mode, playback, and UI font/accent/theme remain outside named looks. Background remains a shared canvas value stored in a look, and the look can choose whether it follows the UI theme. Editing defaults, applying looks, and resetting overrides do not compute hidden Molden grids or remesh surfaces.

## Findings and changes

| Finding | Result |
| --- | --- |
| Straight bonds between different elements were built as two independently transformed, capped cylinders even when vertex coloring was disabled. Their coincident caps and outline shells created an unnecessary midpoint seam. | Uniform bonds use one indexed cylinder. Element-colored bonds also use one cylinder, with duplicated color-boundary vertices and continuous side normals. There is no internal cap, separate midpoint transform, or overlapping half-cylinder shell. Equal endpoint colors retain indexed geometry. |
| Bond coloring controls were under Lighting & contours, separate from Bonds. | Bonds now contains **Bond colors: By element / Uniform** and a color swatch. The swatch is labeled **Element tint** in element mode and **Color** in uniform mode. |
| Metal connectors and aromatic guides ignored the uniform bond color. | Uniform coloring applies to ordinary, multiple, metal, coordination, and aromatic-guide bonds. Coordination dashes remain intentionally separated to convey their bond style. |
| A live Kit bond update replaced its geometry without recreating vertex colors. | Regenerated Kit connectors retain their endpoint colors. |
| Multiple-bond seating adjusted unequal endpoint trims without adjusting the cylinder's axial center. | Position and length now use the same adjusted trims; lateral multiple-bond offsets are preserved. |
| Custom atom swatches were still altered by the Luminous and Kit palette transforms. | Explicit element colors are used exactly; palette transforms apply to defaults. |
| Atom-scale edits silently replaced the separate metal scale. Studio presets had undisclosed element display radii. | Separate **Atom scale** and **Metal scale**, plus an **Atom radii** editor showing which elements have custom radii and allowing individual/all resets. |
| Some geometry resolutions were stored but inaccessible; Kit geometry additionally used hard-coded radial resolution. | **Mesh detail** exposes sphere segments/rings and bond segments/rings. Kit connectors use the configured radial detail. Cylinders add a midpoint ring when required for a hard color boundary. |
| Legacy radius multipliers could change the displayed result while their inputs were hidden. | **Size multipliers** exposes those existing controls. Editing base geometry preserves the multipliers instead of silently absorbing/resetting them. |
| The Toon bands control exposed only the number of bands, hiding their actual brightness values. | Every active band's brightness is editable. Changing the band count creates a fresh evenly spaced ramp. |
| Toon and Kit vary emission scaling/mixing; Opal varies the pearlescence thickness range. Those settings were inaccessible. | Fill scale, fill blend, blend color, and pearl minimum/maximum are exposed. Fill edits also clear old vertex-emission compatibility overrides consistently. |
| A single contour slider approximated Toon's relative contours and silently replaced both atom and bond settings on edit. | Explicit fixed/relative contour sizing, with exact width or separate atom/bond relative values. |
| Classic's shininess was displayed as an integer although its stored value is fractional. Imported light intensities could exceed the UI range. | Fractional shininess is displayed; light sliders cover the complete accepted range. Exposure is disabled when tone mapping is None, where it has no effect. |

## Where preset differences can be edited

| Preset data | Inspector controls |
| --- | --- |
| Cylinder / Kit connector, curved multiple bonds, atom/metal scale, bond/joint radii | Geometry |
| Per-element base display radii | Geometry → Atom radii |
| Sphere width/height detail, bond radial/axial detail | Geometry → Mesh detail |
| Legacy overall atom/bond radius multipliers | Geometry → Size multipliers |
| Standard / Luminous / Kit palette, explicit element colors | Studio → Colors → Atoms and sidebar Atoms |
| Element vs uniform bonds and base tint/color | Studio → Colors → Bonds and sidebar Bonds |
| Physical / Phong / Toon material recipe | Material menu; applicable property controls follow the chosen material |
| Roughness, metalness, clearcoat, coat roughness, specular strength/color, reflectivity, environment intensity, shininess, tint | Material |
| Emission intensity, scale, mixing, color source and blend color | Material → Color fill / Fill scale / Fill blend / Fill from color / Fill color |
| Toon brightness array | Material → Bands / Band 1…8 |
| Iridescence amount and thickness interval | Material → Pearlescence / Pearl minimum / Pearl maximum |
| Key/fill/rim/ambient intensity, key/rim direction, exposure, tone mapping, theme following | Lighting & contours |
| Key/fill/ground/rim/ambient colors | Lighting & contours → Light colors |
| Exact key/rim XYZ coordinates, including distance used for shadow-camera placement | Lighting & contours → Light positions |
| Absolute width, relative atom/bond contour sizing, highlight shells | Lighting & contours |
| Shadows and fog | Studio → Lighting & contours and sidebar Rendering |
| Background color | Style Studio → Lighting & contours, synchronized with Appearance → Scene |
| Orbital phase colors and palette | Studio → Surfaces for defaults; sidebar Surfaces for orbital/group overrides |
| Surface opacity | Studio → Surfaces for defaults; sidebar Surfaces → Opacity for orbital/group overrides. Atoms and bonds stay opaque. |
| Depth of field enabled state, focus mode/distance/range, blur strength | Camera; these view settings are excluded from named looks |

Material-model-specific controls appear only when the renderer uses them. For example, physical roughness is inactive under Toon, and environment intensity is inactive under Phong. Key/rim angles provide convenient directional adjustment; Light positions exposes the exact stored coordinates, including the key light's shadow-camera placement.

Basic intentionally retains its original atom/bond versus orbital finish pairing. **Use surface finish everywhere** adopts that exact orbital descriptor as the shared material, making its properties available in the same editor. Selecting or editing any material also returns to the shared-material policy. Undo/Revert can restore Basic's pairing. No separate material targets are introduced.

The historical `molecule.style` key is a compatibility selector for Basic/Toon/Kit, not another hidden rendering component. Resolved geometry, material, coloring, lighting, and effects determine the rendering. Shared controls edit existing registered state. Look version 4 records the new scope contract; the general preset version remains 1.

## Validation

The Studio scope update passes `make check`, all 293 unit tests, and the complete `appearance_scopes.py`, `looks.py`, `sessions.py`, `premerge.py`, and `style_studio.py` browser scenarios using software WebGL. Scope regressions cover shared controls and grouped Undo, camera isolation across all seven looks and legacy imports, default/override inheritance, explicit matching overrides, reset/Undo, global look saving, legacy session migration, and deferred Molden groups. Session checks include recovery, corruption/quota handling, cross-tab protection, and playback after restoration. Playback tests now wait for actual motion instead of fixed delays; the orbital-group test opens Studio for material edits.

The background regression covers both controls, a color stream starting with an unchanged value, grouped Undo, Revert, named look export/import, appearance autosave, session restoration, actual rendered theme behavior, unchanged surface geometry, and deferred Molden orbitals. Shared controls and surface-default layouts were visually inspected; Studio checks also cover light/dark themes and mobile bounds.

- Cylinder topology tests check that every welded edge belongs to two triangles, no midpoint cap exists, normals remain cylindrical, and the color transition stays sharp.
- Browser regressions inspect actual bond meshes for all seven looks, uniform colors, live Kit edits, advanced control values, Appearance Undo, and session restoration.
- Existing appearance tests cover materials, surfaces, deferred orbitals, saved looks/defaults, and fresh-page session imports. Molecular edit, trajectory, transparency, and export checks remain in the full smoke suite.

For the original bond review, all 281 unit tests and the complete appearance and premerge browser suites passed. Before/after renders were inspected for Basic, Classic, Porcelain, Ink, Kit, and Opal; the Bonds controls were checked in both UI themes. Browser checks used software WebGL after the default graphics backend timed out on ordinary UI actions.

The full smoke suite did not pass: selection-cue visibility failed during the rotate step with these changes and during the translate step when serving the unchanged committed application. These results identify an existing broader Edit/test reliability issue, not a clean end-to-end validation result. Its cause remains separate work; the focused new regression does exercise live bond updates during an actual selection drag.

Kit's curved multiple bonds retain their intentional collars and one continuous curved shaft. Those joints are geometry components, not color splits. Molecular connectivity, bond orders, atom coordinates, and the geometry inference rules are unchanged by appearance edits.
