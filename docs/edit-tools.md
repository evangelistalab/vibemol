# Edit tools

Edit has two tools: **Build** (left) and **Transform** (right). The Workbench mode row still contains View, Measure, Edit, and Calculations. Entering Edit arms Build with the current entity, without opening its palette. The tool strip is a separate radio group; arrow keys select and focus its radios, and Tab visits only the checked tool.

In Transform, left-click selects atoms, bond centers, or either bond end without changing bond order. A center selects the bond; an end selects the attached side for rotation or distance adjustment. Shift-click toggles atom selection. In both Build and Transform, right-click does nothing; right-drag (also with Shift) rotates the scene even when starting over atoms or bonds, preserving selection, geometry, and pending placement previews. With an atom loaded in Build, hovering any exposed part of a bond highlights the whole bond (including every cylinder or dash); clicking cycles its order. Fragment fusion and molecule placement retain their left-click gestures. Select an atom in Transform, then enable Build at open site (+) to choose an attachment anchor. Switching tools retains the loaded atom, fragment, or molecule. Choosing an entity in the Build palette arms Build. The Build radio also arms the current entity and opens its palette; `/` retains its existing open/focus behavior. Closing, docking, or minimizing the palette does not disarm Build. The Panels menu remains the panel-visibility control.

The strip, pointer badge, viewport border, and hint derive from the existing edit intent and selection-build cue. They add no persisted tool state to presets or sessions. The old `editAdaptiveAddAtomMeta` node is removed. The strip does not use `aria-pressed` or overload its selected state to mean that the palette is open.

Escape resolves creation actions before clearing selections:

1. Cancel a provisional atom, fragment, molecule, fuse-ring, or grow placement; keep Build armed.
2. Disarm Build and switch to Transform, retaining the selection.
3. Clear the selection in Transform.
4. With none of those active, leave the edit state unchanged. Existing dialog, panel, and Focus dismissal remain available.

Edit hints remain visible and describe the current action and next Escape. Operation feedback appears below that instruction. Native modal dialogs retain their own keyboard handling.

## Placement and styling

The atom ghost is a translucent sphere at the existing placement-plane intersection, using the active molecule style, element color, and rendered atom radius. It reuses the shared ghost material helpers and does not intercept molecular picking. Its geometry and material are disposed with the preview. Fragment and molecule previews, placement geometry, attachment policies, and hydrogen adjustment are unchanged.

The pointer crosshair keeps its neutral white/dark treatment and the viewport tag identifies the armed atom, fragment, or molecule. Only the entity badge, tool selection treatment, hint tag, and 2px inset viewport border use the new accent. The border uses `--vm-color-tool-active-soft`, a 40% mix with transparency, and follows the canvas rectangle as docks and the top bar resize. Pointer decorations have no pointer events, and stay below panels.

| Theme | `--vm-color-tool-active` | Badge foreground | Text contrast / solid accent against panel |
| --- | --- | --- | --- |
| Light | `#087e8b` | `#ffffff` | 4.81:1 |
| Dark | `#63d4df` | `#0f141c` | 10.56:1 |

Accent against the theme base is 4.24:1 in light and 11.06:1 in dark. The white/dark (`#17202b`) crosshair strokes contrast with each other at 16.43:1. The subdued border is supplementary; the tool is also identified by its label, radio state, cursor form, and persistent hint.

## Validation

- `tests/unit/edit-tool-ui.test.mjs`: empty-scene guidance, entity names, and Escape precedence in instruction text.
- `tests/e2e/edit_tool.py`: exclusive radios, one Tab stop, arrow navigation, panel-independent arming, atom selection without replacement, provisional placement cancellation, fragment/molecule cancellation, mode reset, and 320–1920px layouts.
- `tests/e2e/build_bonds.py`: whole-bond hover and Build-only cycling, release hit validation, undo/redo, multiple/curved/dashed bonds, and hydrogen limits.
- `tests/e2e/build_orbit.py`: right-click and right-drag behavior for atoms, fragments, and molecules, Shift-right-drag, payload retention across tool switches, and preservation of pending molecule previews.
- `tests/e2e/transform_selection.py`: left-click atom/bond-center/bond-end selection, Shift toggles, scope transitions, and right-drag orbit over every target in both projections without modifying geometry or selection.
- `tests/e2e/workbench_bar.py` and `tests/e2e/build_panel.py`: existing menus, docking, modes, search, and layouts.
- `tests/e2e/smoke.py`: full legacy editing regression, with explicit arming before creation and separate disarm/selection-clear Escape assertions.

The Edit tool test also renders screenshots in Emory, National, Bright, Electron, and Tableau, in both themes. **Edit normally hides orbital surfaces.** The color-comparison fixtures override that suppression only inside a routed test page; production behavior is unchanged. The test also hides the resulting View-only surface tooltip so the placement badge is unobstructed. Screenshots are written to `VIBEMOL_TEST_ARTIFACT_DIR` (or `out/test-artifacts`).
