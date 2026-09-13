# Workbench: room for the molecule

**Recommendation:** give persistent inspectors a home around the canvas, with floating windows available when useful. Keep short-lived actions close to the molecule. The user should spend their time looking at chemistry, with very little time arranging windows.

The working prototype is on `codex/window-workspace-lab`:

- [Open Workbench](../../../?workspaceLab=1)
- [Try it with the methane orbital demo](../../../?workspaceLab=1&workspaceDemo=1)
- Open the app without these parameters to use the current interface.

## The interaction

1. **One visible tools bar in every mode.** View / Measure / Edit lives at the start of the bar, including with the sidebar collapsed or Focus active. The original mode buttons and callbacks are reused. Coordinates, Camera, View actions, and Style Studio remain available in all three modes. Opening Coordinates keeps other inspectors available. Theme and sidebar controls remain in the same bar.
2. **Two resizable docks.** Use the right side for inspection and the bottom for tables or playback. A dock reserves canvas space instead of covering the molecule. Tabs retain the real controls and their state.
3. **Drag to dock.** Pull a window out by its header grip. Near the right or bottom edge, a preview shows where it will land. Release to dock. The header's `…` menu offers the same choices without dragging.
4. **Minimize without losing context.** A minimized window leaves a small marker on its tools-bar button. Clicking the button restores its tab or floating position.
5. **Focus and return.** Focus clears the workspace chrome; the molecule gets the available viewport. Escape or Back to workspace restores the previous panels, tabs, sizes, and sidebar state.
6. **Workspaces for different jobs.** Arrange offers Explore, Analyze, and Style. Users can name and save their own arrangements. Saving an existing name updates that workspace. Window positions and dock sizes are remembered independently of molecular files and rendering presets.
7. **A small-screen version.** The bar uses two rows to keep all three mode labels visible. Windows share one tabbed bottom panel when there is insufficient horizontal room. Desktop docking preferences are retained when returning to a larger window.

Edit uses the same bar for Build, Symmetry, and Optimize. Their names and actions stay stable when Build opens; hydrogen adjustment and bond-order controls remain in Build and its existing shortcuts. Build and Symmetry open below their buttons, above the docks, with their full content reachable by scrolling. View actions retains COM/axis commands, avoiding duplicate buttons in the Edit bar. The old floating launcher is hidden in every mode.

Analysis inspectors (Orbitals, Trajectory, Frequencies, Spinor info) are temporarily hidden while editing and return with their selected tabs, sizes, and minimized state. A real data/source change still closes an unavailable inspector. Mode switches never replace a workspace layout or compute deferred orbitals. Existing playback pause and temporary surface suppression on entering Edit/Measure remain intact. Measure exposes Clear measurements, while Edit and View restore their own hints. Changing modes exits Focus so interaction controls are visible. `M` opens Measure from View or Edit; `E` opens Edit from View or Measure. `C`, `V`, and `Q` expose the same shared inspectors in every mode; editing shortcuts retain their other meanings.

Dock separators support arrow keys, with Shift for fine adjustment. Tabs and the mode selector support Left/Right/Home/End. Window menus and Focus have explicit buttons; no new global shortcuts compete with molecular editing. Opening Build or Symmetry by keyboard exits Focus. Escape inside a window closes that window, while text controls retain their editing behavior.

## What belongs where

| Interface role | Prototype behavior | Reason |
| --- | --- | --- |
| Orbitals, Coordinates, Style Studio, View actions, Camera, Trajectory, Frequencies, Spinor info | Tabbed right/bottom docks, or floating windows | These remain useful while inspecting the molecule. |
| Build, Symmetry, selection tools, bond/coordination menus, placement operators | Movable contextual interfaces; Build/Symmetry launch from the shared top bar | Their geometry and gesture workflows need a dedicated edit-workspace study before changing their ownership. |
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

The experiment starts only with `workspaceLab=1`. Its browser storage key is `vibemol.workbench.lab.v1`; it stores placements, sizes, open/minimized windows, selected tabs, floating coordinates, and up to eight named layouts. Corrupt or unavailable storage falls back safely. Loading a layout never generates deferred orbital grids or modifies coordinates, molecular topology, materials, isovalues, or camera pose.

Workspace Lab uses the existing study mode, so it does not overwrite ordinary appearance defaults or session recovery. Explicit session save/open remains available. Demo loading is opt-in and only starts in an empty scene. It opens a bundled methane orbital, with Style Studio on the right and Coordinates below the canvas.

## What to evaluate next

- Whether Orbitals should always dock right on import, or respect a saved floating preference (the prototype respects the preference).
- Whether the Analyze layout should open Coordinates or prefer a trajectory/frequency table when available (the prototype prefers playback data).
- Whether Build and Symmetry benefit from a dedicated Edit workspace; test growing molecules, operator panels, and preview cancellation before adding them to docks.
- Whether users need two simultaneous orbital tables or a second floating instance. The current prototype keeps one live instance of each inspector.
- Named-workspace deletion/reordering and cross-device layout export can follow if the basic interaction earns its place.

Validation covers real inspector controls, preserved data and deferred orbitals, tab selection, docking previews, resizing, minimize/restore, Focus, named-layout persistence, themes, responsive bounds, and an unchanged default launch path. See `tests/e2e/workbench.py` and `tests/unit/workbench-model.test.mjs`.
Mode coverage also exercises buttons and keyboard transitions, suspended/restored inspectors, stable Edit controls, desktop/mobile popup bounds, sidebar/Focus access, and clearing a real atom-pair measurement.
Escape on the canvas clears measurement/edit selection without closing persistent inspector tabs. An active edit operator or placement preview cancels first. Escape inside a focused inspector still closes that inspector; modal confirmations and contextual edit cancellation retain their handlers.

The broader edit-mode smoke suite is not clean in the local Chromium/SwiftShader configuration. Unchanged `main` (`a894f57`) reproduces a timeout at its hover-delete assertion (`tests/e2e/smoke.py:1810`); a later branch run reached the rotate-selection check and failed to see its cue (`:2970`). The latter has not been isolated as the same baseline issue. These failures are recorded separately from focused Workbench validation.
