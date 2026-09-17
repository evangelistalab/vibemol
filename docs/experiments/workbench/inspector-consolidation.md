# Properties inspector consolidation

This work is staged on `codex/window-workspace-lab`. The existing Workbench bar changes are its prerequisite. The two windows have **not yet been merged**: the brief requires a layout decision before Stage 2, and the actual shared material behavior needs resolving against the proposed Surface/Molecule split.

## Decisions and scope audit

- Axes are a camera orientation aid. In Workbench, `showAxes` and the backing `dofFocusMode` select now live in Camera, alongside the visible projection/focus controls.
- Simulation boxes belong to individual cube/arithmetic layers. `showBox` now lives with the selected surface controls and uses the selected layers' grids. It does not evaluate deferred molecular orbitals. A nullable `showBox` field is retained by the existing layer/session serializer; missing values inherit the legacy global setting. It is excluded from Looks.
- `renderMode` and `cloudType` are already per-layer and fit the proposed Object scope.
- Both existing material pickers deliberately call the shared material editor. Basic alone carries a legacy surface finish until a material edit. Renaming these controls to imply independent Surface/Molecule scopes would be misleading without an explicit change of behavior. The user has been asked whether to retain one shared material or add per-surface overrides.
- Molecule visibility/labels/multiple-bond controls currently use global flags; the proposed Object scope requires either selected-molecule storage or an explicit global qualifier. Two-component display mode is also intentionally global across 2C sources. These must not be silently presented as isolated layer edits.
- Portable sessions explicitly exclude window layout. Workbench stores open windows, dock positions and named layouts under `vibemol.workbench.lab.v1`. Stage 2 must normalize `displayInspector` and `styleStudio` aliases there and in window/shortcut APIs, rather than add panel state to scientific sessions.
- Look exports remain version 4; no Look schema or default-library key has changed.

## Implemented preparation

Stage 0 binds the Workbench Studio surface controls to the same selected-orbital/group edits as Appearance. Passive synchronization never writes layer values or changes Look defaults. The ordinary interface retains its existing global-default/selected-override distinction. Both Look dropdowns now list and apply saved Looks, as well as built-ins; saved identity no longer disappears or fails to apply in Studio.

Stage 1 shares physical-material parameter definitions between the material factory and editor. Shader type determines supported parameters; optional channel strengths gate dependent controls (coat roughness, pearlescent thickness and emission mixing). Clearcoat is available for Gel and Ceramic as well as Lacquer. Remaining channels use the existing disclosure component, preserving full customization. Bands are exclusive to Toon.

Row-level Look reset buttons and modified dots are prepared in the shared editor for Workbench, with existing Appearance Undo support. Complete Object indicators and the material selector's whole-recipe reset remain for Stage 3.

## Validation checkpoint

- Syntax/whitespace checks and all 312 unit tests pass.
- `tests/e2e/appearance_controls.py` passes: two-layer color isolation and both binding directions, saved Look selection, individual row reset/Undo, axes placement, per-layer box visibility and session restoration, and disclosure across every material type.
- Initial Material input/select counts: 6 for Emissive, Satin, Lacquer, Gel, Ceramic, Polished, Matte and Enamel; 4 for Metal, Classic smooth and Toon. Expanded channel controls are still available. The previous physical-material form exposed 30 inputs/selects with all dependent controls shown.
- The existing `tests/e2e/appearance_scopes.py` regression also passes, covering shared controls, camera scope, orbital defaults/overrides, legacy imports and sessions. A pre-edit Look export imports successfully and its startup default is retained.
- A matched Gel comparison at 1512 × 950 with Geometry closed and Material open reduced `looksPanel` scroll height from 1546 to 1071 pixels in a 767-pixel body (ratio 2.02 → 1.40). This measures Stage 1, before panel consolidation.
- The complete panel-height comparison and the three Object-tab screenshots must be measured after Stage 2. The current 1512 × 950 capture still has two panels and is not the final layout.

## Remaining stages

1. Confirm Object/Look tabs versus a single selection-first scrolling panel, and shared versus per-surface material behavior.
2. Build the merged `inspector` once, subscribe to existing selection changes, remove the specified duplicate nodes, and migrate window aliases without changing dock sizing or persistence.
3. Finish per-property reset/inheritance indicators in Object and Look, including whole-material resets.
4. Check old Look import, startup default, layout migration, session restoration, keyboard navigation, both themes, mobile bounds, duplicate labels/IDs, and selected-cube/molecule/empty states. Record final control counts and comparable scroll ratios and screenshots.
