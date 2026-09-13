# Appearance and preset controls audit

Scope: all seven curated looks, the shared material presets, molecule bond construction and live updates, the Appearance inspector, and portable look/session state.

## Style Studio scope audit

Background color is one global canvas setting, stored in each look as `global.backgroundColor`. It is now editable in both **Style Studio → Lighting & contours → Background** and **Appearance → Scene → Background**. Both controls update the same state, including Modified, grouped Appearance Undo, Revert, named looks, portable exports, autosave, and sessions. Background changes reuse existing molecule and surface meshes. **Follow UI theme** sits beside the Studio swatch: it darkens the rendered background in dark mode without altering the saved base color.

The remaining mismatches are listed below; these behaviors have not been changed by the background-control addition.

| Mismatch | Current behavior | Suggested next change |
| --- | --- | --- |
| Some global style settings are only editable outside Studio. | Atom palette and element colors are under Atoms; bond color mode/tint under Bonds; shadows and fog under Rendering. All belong to a saved look. Shadows, palettes, and colors vary between curated presets; all seven presets disable fog but still store/reset its depth. | Expose these in Studio through the same state and handlers as the sidebar. Keep the sidebar controls as shortcuts. |
| Camera focus is included in look recipes. | `render.dof.*` stores enabled state, focus mode, focus distance, focus range, and blur amount. Every curated preset disables depth of field and restores its focus defaults. Camera pose/projection are preserved. | Keep camera-dependent focus settings with the camera instead of resetting them on a style change. Decide explicitly whether blur enablement/strength should remain part of a look. |
| Orbital styling has two different application scopes. | Surfaces edits colors and opacity on the selected orbital or focused group. Saving a look captures one representative orbital; applying that look overwrites those settings on all loaded surface layers, including hidden/deferred layers and other scenes. Mixed values are indicated, but the scope change is easy to miss. | Distinguish global surface defaults from per-orbital overrides, and make replacing overrides an explicit action. Keep opacity in Surfaces as requested. |
| Appearance Undo depends on the control used. | Studio component edits, the sidebar palette/bond color controls, surface opacity, and now both background controls record Appearance Undo. Older sidebar handlers for shadows, fog, element-color edits, surface colors, and depth of field update appearance without recording that edit. | Route style edits through one shared appearance transaction path so Undo is consistent everywhere. |

Correct exclusions: camera position/rotation/projection, atom and bond visibility, axes and bounding box, coordinates/topology, orbital isovalues/Auto-iso, phase inversion, surface/cloud mode, playback, and UI font/accent/theme do not belong to a named look. These remain workspace state or app preferences. The broader appearance autosave and general preset format are intentionally not identical to a named look or a material-only file. The UI theme itself remains global; a look only chooses whether its background follows it.

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
| Standard / Luminous / Kit palette, explicit element colors | Atoms → Palette / Element colors |
| Element vs uniform bonds and base tint/color | Bonds → Bond colors / swatch |
| Physical / Phong / Toon material recipe | Material menu; applicable property controls follow the chosen material |
| Roughness, metalness, clearcoat, coat roughness, specular strength/color, reflectivity, environment intensity, shininess, tint | Material |
| Emission intensity, scale, mixing, color source and blend color | Material → Color fill / Fill scale / Fill blend / Fill from color / Fill color |
| Toon brightness array | Material → Bands / Band 1…8 |
| Iridescence amount and thickness interval | Material → Pearlescence / Pearl minimum / Pearl maximum |
| Key/fill/rim/ambient intensity, key/rim direction, exposure, tone mapping, theme following | Lighting & contours |
| Key/fill/ground/rim/ambient colors | Lighting & contours → Light colors |
| Exact key/rim XYZ coordinates, including distance used for shadow-camera placement | Lighting & contours → Light positions |
| Absolute width, relative atom/bond contour sizing, highlight shells | Lighting & contours |
| Shadows and fog | Rendering |
| Background color | Style Studio → Lighting & contours, synchronized with Appearance → Scene |
| Orbital phase colors and palette | Surfaces |
| Surface opacity | Surfaces → Opacity, scoped to the selected orbital or group; differing values show Mixed. Atoms and bonds stay opaque; their retired opacity keys are ignored on import. |
| Depth of field enabled state, focus mode/distance/range, blur strength | Camera; see the focus-scope mismatch above |

Material-model-specific controls appear only when the renderer uses them. For example, physical roughness is inactive under Toon, and environment intensity is inactive under Phong. Key/rim angles provide convenient directional adjustment; Light positions exposes the exact stored coordinates, including the key light's shadow-camera placement.

Basic intentionally retains its original atom/bond versus orbital finish pairing. **Use surface finish everywhere** adopts that exact orbital descriptor as the shared material, making its properties available in the same editor. Selecting or editing any material also returns to the shared-material policy. Undo/Revert can restore Basic's pairing. No separate material targets are introduced.

The historical `molecule.style` key is a compatibility selector for Basic/Toon/Kit, not another hidden rendering component. Resolved geometry, material, coloring, lighting, and effects determine the rendering. All added controls edit existing registered state; no additional preset version is needed.

## Validation

The Style Studio/background update passes `make check`, all 291 unit tests, and both `style_studio.py` browser scenarios using software WebGL. The background regression covers both controls, a color stream starting with an unchanged value, grouped Undo, Revert, named look export/import, appearance autosave, session restoration, actual rendered theme behavior, unchanged surface geometry, and deferred Molden orbitals. Light and dark layouts were inspected.

- Cylinder topology tests check that every welded edge belongs to two triangles, no midpoint cap exists, normals remain cylindrical, and the color transition stays sharp.
- Browser regressions inspect actual bond meshes for all seven looks, uniform colors, live Kit edits, advanced control values, Appearance Undo, and session restoration.
- Existing appearance tests cover materials, surfaces, deferred orbitals, saved looks/defaults, and fresh-page session imports. Molecular edit, trajectory, transparency, and export checks remain in the full smoke suite.

For the original bond review, all 281 unit tests and the complete appearance and premerge browser suites passed. Before/after renders were inspected for Basic, Classic, Porcelain, Ink, Kit, and Opal; the Bonds controls were checked in both UI themes. Browser checks used software WebGL after the default graphics backend timed out on ordinary UI actions.

The full smoke suite did not pass: selection-cue visibility failed during the rotate step with these changes and during the translate step when serving the unchanged committed application. These results identify an existing broader Edit/test reliability issue, not a clean end-to-end validation result. Its cause remains separate work; the focused new regression does exercise live bond updates during an actual selection drag.

Kit's curved multiple bonds retain their intentional collars and one continuous curved shaft. Those joints are geometry components, not color splits. Molecular connectivity, bond orders, atom coordinates, and the geometry inference rules are unchanged by appearance edits.
