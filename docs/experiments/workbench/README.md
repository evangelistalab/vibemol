# Workbench: room for the molecule

**Recommendation:** give persistent inspectors a home around the canvas, with floating windows available when useful. Keep short-lived actions close to the molecule. The user should spend their time looking at chemistry, with very little time arranging windows.

Workbench was developed on `codex/window-workspace-lab` and is the default interface in v0.9.0:

- [Open Workbench](../../../)
- [Try it with the methane orbital demo](../../../?workspaceLab=1&workspaceDemo=1)
- Existing `?workspaceLab=1` links open the same interface. Use `?workspaceLab=0` only for the older interface.

## The interaction

1. **Modes, commands, and panels have distinct controls.** View / Measure / Edit is a segmented radio group at the start of the bar, including with the sidebar collapsed or Focus active. Contextual commands follow it; Clear measurements belongs to this group in Measure. A single Panels menu lists available inspectors with checkmarks and their Right/Bottom/Floating locations. Its badge counts open panels, including inactive dock tabs. Coordinates, Camera, and Properties remain available in all three modes. Quick actions sits directly between the mode commands and Panels: COM → Origin, point camera to COM, align principal axes, and +X/+Y/+Z views. The six original controls retain their handlers, tooltips, and accessible names; they are disabled until a structure is available. Theme and sidebar controls remain in the same bar.
2. **Two resizable docks.** Use the right side for inspection and the bottom for tables or playback. A dock reserves canvas space instead of covering the molecule. Tabs retain the real controls and their state.
3. **Drag to dock.** Pull a window out by its header grip. Near the right or bottom edge, a preview shows where it will land. Release to dock. The header's `…` menu offers the same choices without dragging.
4. **Minimize without losing context.** A minimized window has an unchecked row marked Minimized in the Panels menu. Choosing it restores its tab or floating position. Choosing a checked row closes that window; use its dock tab to bring an already open window to the front. Choosing a menu item dismisses the menu and moves focus to the opened inspector.
5. **Focus and return.** Focus clears the workspace chrome; the molecule gets the available viewport. Escape or Back to workspace restores the previous panels, tabs, sizes, and sidebar state.
6. **Workspaces for different jobs.** Layout offers Explore, Analyze, and Style. Users can name and save their own arrangements. Saving an existing name updates that workspace. Window positions and dock sizes are remembered independently of molecular files and rendering presets.
7. **A small-screen version.** The bar wraps its command groups as needed to keep all mode labels and actions reachable. The canvas and docks reserve the measured bar height. Windows share one tabbed bottom panel when there is insufficient horizontal room. Desktop docking preferences are retained when returning to a larger window.

Edit uses the same bar for Build, Symmetry, and Optimize. Their names and actions stay stable when Build opens; hydrogen adjustment and bond-order controls remain in Build and its existing shortcuts. Build and Symmetry are Edit-only panels in the Panels menu, docked right by default. Their toolbar buttons and `/` (Build) or `S` (Symmetry) shortcuts reveal the corresponding tab or restore it from minimization. Both support right/bottom docking, floating, resizing, Focus, and named layouts just like the other panels. Their headers remain visible while their contents scroll. Symmetry follows the current atom selection without blocking editing or closing Build. Selecting a symmetry candidate changes no coordinates until Apply or Auto; Cancel clears the candidate. Quick actions is shared across View, Measure, and Edit in the top bar; it is no longer a panel or a Panels-menu entry. The old floating launcher is hidden in every mode. The floating question-mark Help button is removed; Help remains in the sidebar and on `?`. Corner axes sit at the bottom left with 16 px of clearance above the hint bar, including when docks resize or the hint wraps. Focus releases the hidden hint’s space.

Analysis inspectors (Orbitals, Trajectory, Frequencies, Spinor info) are temporarily hidden while editing and return with their selected tabs, sizes, and minimized state. A real data/source change still closes an unavailable inspector. Mode switches never replace a workspace layout or compute deferred orbitals. Edit still pauses playback and temporarily suppresses surfaces. Measure preserves visible surfaces/clouds and picks atoms directly; switching View/Measure reuses the rendered surfaces. Measure exposes Clear measurements, while Edit and View restore their own hints. Changing modes preserves Focus, floating positions, dock sizes, selected tabs, and minimized state. Build/Symmetry return to Edit with their open/minimized state and placement; Build search and Symmetry tolerance are retained. Searching filters the palette; Enter or a result click selects a payload and returns keyboard focus to the canvas without closing Build; leaving the field keeps the query. Closing or minimizing either Edit panel is an explicit user choice. Saved layouts retain panel state and placement, but do not persist search text, tolerance, or chemistry payloads. Temporary chemistry previews and the selected symmetry candidate are cleared when leaving Edit. `M` opens Measure from View or Edit; `E` opens Edit from View or Measure. `C` and `V` expose Coordinates and Camera; `Q` exits Focus and focuses the first Quick action in every mode; editing shortcuts retain their other meanings.

Dock separators support arrow keys, with Shift for fine adjustment. Dock tabs retain their existing Left/Right/Home/End behavior. The mode selector has one Tab stop; Left/Right/Up/Down wrap selection and focus together, and Home/End choose the first/last mode. Panels supports Up/Down/Home/End and typing a panel name. Escape returns focus to Panels; Tab leaves the menu, and an outside click dismisses it. Window menus and Focus have explicit buttons; no new global shortcuts compete with molecular editing. Opening Build or Symmetry by keyboard exits Focus. Escape inside a window closes that window, while text controls retain their editing behavior.

Properties is one dockable/floating inspector with Object and Look tabs. Object follows structure/orbital selection, including mixed selections; Look owns the portable style and shared material. The left sidebar stays dedicated to scene management. Axes, projection, and depth-of-field controls live in Camera. Coordinates can be read/copied/exported in every mode, but edited only in Edit. See [the consolidation notes](inspector-consolidation.md) for scope, migration, and verification details.

## What belongs where

| Interface role | Prototype behavior | Reason |
| --- | --- | --- |
| Orbitals, Coordinates, Properties, Camera, Trajectory, Frequencies, Spinor info | Tabbed right/bottom docks, or floating windows | These remain useful while inspecting the molecule. |
| Quick actions | Six direct commands in the top bar | Camera/geometry actions should be available without opening an inspector. |
| Build | Edit-only dockable panel, also launched from the top bar or `/` | Keep the atom/fragment/molecule catalog available while placing and editing. It suspends outside Edit without losing layout or search. |
| Symmetry | Edit-only dockable panel, also launched from the top bar or `S` | Inspect the current selection, compare point groups, and apply or cancel symmetrization while retaining panel layout. |
| Selection tools, bond/coordination menus, placement operators | Movable contextual interfaces | These remain tied to the current selection or unfinished chemistry operation. |
| Confirmations, Help, element-color editor, recording controls | Existing dialog/popover behavior and movement | A confirmation should stay attached to its current task. |

The study uses the existing typography, palette, buttons, sliders, input rows, and icon set. New styling is limited to the tools bar, dock tabs, separators, and snap feedback. Repeated window titles are replaced by a compact grip when the dock tab already supplies the title.

## Sources and decisions

These are primary references for interaction ideas, not a claim that any product has universally the best UX.

| Reference | What informed this proposal |
| --- | --- |
| [Figma: our approach to designing UI3](https://www.figma.com/blog/our-approach-to-designing-ui3/) | Figma restored resizable docked navigation/properties panels after users reported that floating panels cramped the canvas and slowed work. Its minimized UI also informed the reversible Focus interaction. |
| [VS Code: custom layout](https://code.visualstudio.com/docs/configure/custom-layout) | Movable views, distinct side/bottom regions, panel alignment, keyboard alternatives, and a mode that hides surrounding UI. |
| [Adobe Photoshop: workspace overview](https://helpx.adobe.com/photoshop/desktop/get-started/learn-the-basics/workspace-overview.html) | Grouped panels, task-relevant controls, and a workspace switcher that organizes a complex professional tool. |

My design judgment is to combine stable docks with deliberate floating, visible text labels where space permits, and one reversible Focus action. A desktop full of overlapping windows places too much layout work on the user.

## Implementation boundaries

`workbench-model.js` validates layouts and computes bounded regions. `workbench.js` orchestrates the original inspector nodes through a narrow app adapter; controls and scientific state remain in their existing controllers. The shared floating-panel controller emits drag lifecycle events. It retains floating coordinates while another layout owns a docked panel's placement. No GUI framework or new runtime dependency is required.

The bar derives one `{open, dock, active}` record per catalog entry from the window host and existing layout state. Menu checkmarks consume `open`; unchanged dock-tab markup consumes `active`. An inactive tab remains open. Minimized inspectors retain their controller state but are excluded from the menu's open count until restored. This projection adds no persisted fields. The mode group alone uses selected styling; Build exposes `aria-expanded`, commands remain ghost buttons, and the Panels rows use `menuitemcheckbox`. No `aria-pressed` attributes appear in the bar. Bar labels compact when space is tight; the number of available panels never increases bar width. Dock sizing and responsive placement rules are unchanged; wrapped bar height is measured so panels never cover command rows.

Workbench starts by default; `workspaceLab=0` explicitly selects the older interface. The `VibeMolWorkbenchHost.enabled` flag shares this decision with the dock controller. The existing browser storage key `vibemol.workbench.lab.v1` is retained so saved layouts survive the release; it stores placements, sizes, open/minimized windows, selected tabs, floating coordinates, and up to eight named layouts. Corrupt or unavailable storage falls back safely. Old Quick actions (`viewInspector`) entries are dropped from saved layouts without changing the remaining panels; Analyze uses Camera as its fallback when no orbitals are available. Loading a layout never generates deferred orbital grids or modifies coordinates, molecular topology, materials, isovalues, or camera pose.

Normal launches, including old `workspaceLab=1` links, restore saved appearance and startup defaults and enable session autosave/recovery. Only explicit `appearanceStudy=1` or `workspaceDemo=1` pages skip persistence. Explicit session save/open remains available there. Demo loading is opt-in and only starts in an empty scene. It opens a bundled methane orbital, with Properties on the right and Coordinates below the canvas. `tests/e2e/workbench_release.py` verifies the default launch, old links, last appearance, startup defaults, recovery, and Python renderer compatibility.

## What to evaluate next

- Whether Orbitals should always dock right on import, or respect a saved floating preference (the prototype respects the preference).
- Whether the Analyze layout should open Coordinates or prefer a trajectory/frequency table when available (the prototype prefers playback data).
- Whether users need two simultaneous orbital tables or a second floating instance. The current prototype keeps one live instance of each inspector.
- Named-workspace deletion/reordering and cross-device layout export can follow if the basic interaction earns its place.

Validation covers real inspector controls, preserved data and deferred orbitals, tab selection, docking previews, resizing, minimize/restore, Focus, named-layout persistence, themes, responsive bounds, and an unchanged default launch path. See `tests/e2e/workbench.py` and `tests/unit/workbench-model.test.mjs`.
`tests/e2e/workbench_bar.py` checks the bar's ARIA contract, keyboard behavior, center-point hit testing, conditional panel rows, shared-dock checkmarks, and overflow in all modes at 11 widths from 320 to 1920 px. It installs the console QA helpers as `window.__vmqa`, writes `workbench-bar-report.json`, and captures the three desktop modes plus menu/mobile/theme screenshots. It also verifies the relocated Quick actions against real molecular/camera state, their `Q` shortcut, empty-scene disabling, and the legacy popup.
`tests/e2e/workbench_consistency.py` covers moved Appearance controls, styling, mode-preserved layouts/Focus/Build search/Symmetry tolerance, coordinate permissions in both launch paths, actual atom-pair measurements through an opaque surface, and revealing Appearance from a deferred Orbitals group without computing grids. Mode coverage also exercises buttons and keyboard transitions, suspended/restored inspectors, stable Edit controls, desktop/mobile popup bounds, sidebar/Focus access, and clearing a real atom-pair measurement.
Escape on the canvas clears measurement/edit selection without closing persistent inspector tabs. An active edit operator or placement preview cancels first. Escape inside a focused inspector still closes that inspector; modal confirmations and contextual edit cancellation retain their handlers.

The complete `tests/e2e/smoke.py` suite covers edit gestures, inline coordinate edits in Edit mode, trajectories, vibration exports, and standard/2C surface and cloud transparency.

`tests/e2e/build_panel.py` covers Build docking, selection without dismissal, atom placement, molecule-preview cancellation, inactive/minimized restoration, preserved mode/search state, named-layout reload, responsive scrolling, and legacy popup behavior.

`tests/e2e/symmetry_panel.py` covers Edit-only availability, candidate Apply/Cancel and undo, live atom selection, Build placement with Symmetry open, docking/minimization, Focus/keyboard access, layout reloads, and stationary headers on mobile. The legacy editing smoke suite covers the original popup workflow.
