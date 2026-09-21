# Properties inspector consolidation

Implemented on `codex/window-workspace-lab` and released as the default interface in v0.9.0. The accepted design uses Object / Look tabs and shared material editing. Open the actual application; the separate review mockup is no longer the implementation target. The older Appearance and Style Studio interface remains available with `?workspaceLab=0`.

## Scope

- **Object** follows the outliner selection. Nothing selected shows an empty state. A structure and orbitals can be selected together with Command/Ctrl-click. The inspector shows selection visibility, Structure settings, and Surfaces settings with applicable counts. Surface/group commands still filter their targets to surfaces; selecting a structure does not make it an arithmetic operand or a cube-delete target.
- Structure visibility, labels, numbers, and multiple-bond rendering use each molecule layer's `moleculeDisplay` settings. These are session state; older sessions inherit the legacy global values. Changing the Look preserves these choices. Rendering, including bond updates during editing, uses the resolved layer settings.
- Surface iso, Auto-iso, phase, render mode, cloud type, and simulation box are data-dependent Object properties. They are excluded from Looks. Group edits include hidden/deferred orbitals without computing their grids. Differing values remain mixed until explicitly edited.
- Surface colors and opacity have explicit override dots and reset-to-look buttons. Reset returns selected layers to inheritance; existing Appearance Undo restores the overrides.
- **Look** owns preset selection, gallery, saved Looks, Geometry, Colors, shared Material, Lighting & contours, and background. Material changes apply to atoms, bonds, and surfaces. The Basic material option uses the approved shared Luminous finish without changing the other Look components. Every material choice and parameter edit uses one shared finish. Whole-material reset restores the complete original recipe, including an explicit surface descriptor in older saved appearances.
- Axes and depth-of-field focus live in Camera. Typeface remains an application preference and is available from Layout. Simulation boxes are per-surface. Two-component display remains global across 2C files and is explicitly labelled as such in Object; it appears whenever a selected layer has two components.

A Look must be portable across molecules. There are no reset-to-look buttons on scientific or visibility settings that are not part of a Look.

The Look tab now has independent Look and Color scheme selectors. Color schemes contain atom/bond colors, orbital defaults, and background/theme-following; material/light/geometry choices preserve them. Colors exposes the global orbital defaults separately from Object's selected-layer overrides. Existing save/open/default/session paths retain the complete combination. See `docs/appearance-looks.md` for the selection and persistence contracts.

## Implementation and compatibility

`properties-inspector.js` builds one window (`inspector`, Properties) and two accessible scope tabs once. Selection updates existing nodes; it does not reconstruct controls or lose disclosure/scroll state. Object reuses the existing bound surface controls; Look reuses the existing editor and gallery. The duplicate Appearance controls and Studio surface mirrors are absent from the Workbench DOM. Legacy global preset adapters retain their bound backing state off-DOM; the ordinary interface still uses that path.

Each scope body owns its scrollbar. The former Studio container-query rules must not create an inner scroll container on `looksPanel`: its contained overscroll traps wheel input, and WebKit can move a subsection heading between pointer-down and pointer-up. Removing those rules preserves native disclosure behavior without intercepting clicks or keyboard events.

The single window replaces Appearance and Style Studio in the Panels menu. `workbench-model.js` normalizes both old ids to `inspector`, merges duplicate entries, prefers the formerly active placement/position, and does not minimize an inspector if either old window was visible. Existing window APIs accept both aliases. Mode switches, floating positions, docks, minimized state, Focus, and named layouts retain their behavior. Scope tabs are transient and do not add a persistence key.

Portable sessions continue to exclude window layout. Existing Workbench storage (`vibemol.workbench.lab.v1`) handles layout migration. Nullable per-layer `showBox`, optional `moleculeDisplay`, and mixed structure/orbital selection round-trip through the session serializer with validation. No Look schema version or saved-library/default key changed. Legacy Looks and ordinary-launch default behavior remain compatible.

## Validation

- All 314 unit tests pass, including alias migration and mixed selection / surface-target separation.
- `tests/e2e/properties_inspector.py` covers the empty, structure, surface, and mixed states; stable DOM nodes; two-layer isolation; mixed indicators; scalar/2C selection and cloud controls; actual rendered atom visibility; reset/Undo; shared materials; saved Looks; session restoration; old window aliases; mode stability; and responsive bounds in both themes.
- `tests/e2e/appearance_controls.py` retains the previous test entry point and now runs the consolidated-inspector regression.
- `tests/e2e/properties_disclosures.py` verifies wheel scrolling, stationary first clicks on every subsection, unchanged heading/scroll positions, and native Space/Enter behavior in right, bottom, and floating layouts. It passes in Chromium and WebKit (`--browser webkit`); CI runs both engines.
- `tests/e2e/appearance_scopes.py` passes on the ordinary interface: shared appearance controls, old Look import, focus isolation, defaults/overrides, saved Looks, and sessions.
- Workbench layout, mode consistency, deferred-orbital, and bar regressions pass. The Panels menu now contains eight persistent inspectors, with one Properties entry. Bar coverage checks 320–1920 px and keyboard/ARIA behavior.
- The complete browser smoke test, JavaScript syntax checks, Python compilation, and whitespace checks pass.
- Material now uses Family and Recipe selectors. Physical contains Basic/Luminous, Emissive, Gel, Matte, Metal, Opal, and Porcelain; Smooth (Phong) contains Classic and Kit; Toon contains Ink and Toon. Each family exposes its main distinguishing controls directly, with applicable finer adjustments under Material channels. This supersedes the initial consolidation's smaller visible control counts. The browser report records current counts and checks family-specific visibility rather than enforcing a fixed total.
- Family changes apply their default recipe as one Undo step; whole-material reset restores the saved family and descriptor. Matching ignores dormant shader parameters without discarding them from saved files. Personal materials are filtered by family. `material_families` in `tests/e2e/looks.py` covers both Properties and ordinary Studio, including manual recipe matching, stable option nodes, libraries/import, Undo, and sessions.

The focused browser test writes `properties-report.json` plus `properties-empty.png`, `properties-structure.png`, `properties-surface.png`, `properties-mixed.png`, and `properties-look.png` to the configured test-artifact directory.
