# Floating interfaces

All 24 custom floating interfaces share `assets/app/js/floating-panels.js`:

| Interface | Drag handle |
| --- | --- |
| Style Studio | Title bar |
| Orbitals | Title bar; filter and close controls remain interactive |
| Quick actions | Quick actions heading |
| Spinor information | Title bar |
| View | Title bar |
| Coordinates | Title bar; units/copy/close controls remain interactive |
| Trajectory | Title bar; playback/export buttons remain interactive |
| Frequencies | Title bar; playback/export buttons remain interactive |
| Keyboard shortcuts | Dialog title bar |
| Element colors | Dialog title bar |
| Reset appearance confirmation | Confirmation title |
| Display/edit window launcher | Small grip above the tools |
| Build palette | Build heading |
| Symmetry | Symmetry title row |
| Selection tools | Small grip beside the tool buttons |
| Coordination choices | Coordination heading |
| Metal bond mode choices | Metal bond mode heading |
| Bond order/metal bond popup | Popup title |
| Atom placement operator | Collapsible header |
| Molecule placement operator | Collapsible header |
| Trajectory recording controls | Small grip beside recording buttons |
| Frequency recording controls | Small grip beside recording buttons |
| Scene/outliner context menus | Existing confirmation title or a compact actions heading |
| Orbital arithmetic editor | Combine/Edit combination title |

The outliner menu shell covers Create scene, scene/molecule/orbital actions, and delete confirmations. The arithmetic shell covers creating and editing combinations. Both register when first created and keep their handles through content replacement.

Drag a heading or grip with a mouse, pen, or touch. Focus the handle and use **Alt + arrow keys** to move by 10 px, or **Alt + Shift + arrow keys** for 1 px. **Alt + Home** restores automatic positioning. Header tooltips explain these controls. A click on an operator header still collapses/expands it; dragging does not activate that action. Buttons, fields, links, filters, sliders, and scrolling retain their normal behavior.

Manual positions survive closing/reopening and ordinary scene/menu refreshes for the current page. They stay within the viewport when the window or panel size changes. Positions are transient: looks, portable presets, saved sessions, and recovery do not save them. Reload starts with the usual placements.

`floating-panels.css` changes movement, bounds, focus feedback, and grips only. Existing panel colors, fonts, controls, and modal backdrops are reused. Manual viewport coordinates use separate CSS properties so older anchor calculations cannot overwrite them. The appearance-reset confirmation is portaled out of the scrolling sidebar so dragging it is not clipped by the sidebar. Dynamic menus keep their normal outside-click/Escape behavior; a manually placed menu stays open on viewport changes.

Browser/OS interfaces (native select menus, color/file pickers, and alert/confirm/prompt dialogs) are controlled by the browser. They do not expose draggable title bars to page code. The docked sidebar, onboarding card, tooltips, axes, phase legend, selection marquee, and scientific hover labels are not popup windows. Video crop frames already have their own drag/resize behavior; their companion recording controls now move independently.

Validation is in `tests/e2e/floating_panels.py`, `tests/e2e/style_studio.py`, and `tests/unit/floating-panels.test.mjs`. The browser tests cover every registered shell plus live window/edit workflows, interactive header controls, pointer/keyboard movement, touch, bounds, reopening, and camera/structure preservation.
