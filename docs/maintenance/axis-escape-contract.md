# Axis Escape ordering proposal — issue #52

This is the mechanism and proposed contract before a product fix. No production
handler is changed here. Issue #4 was a CI prerequisite umbrella; #52 owns axis
Escape and #53 owns the unrelated Coordinates collision. Fix them in separate PRs.

## Measured mechanism

Run 40159501600 on unchanged main product code observed Edit/Transform selection
`[0] -> []`, focus remaining `viewAxisNegZBtn`, `defaultPrevented: true`, and
`rootKeydownSeen: false`. Workbench's document-capture handler calls
`host.editToolEscape()` then stops immediate propagation. The Edit action is
performed, but the axis widget's `onEscape -> canvas.focus()` never runs.
Workbench capture, the Edit ladder, and the axis keyboard owner already exist on
`v0.9.5-pre-refactor`. This is not a missing widget Escape handler.

## Intended precedence to implement

Escape resolves one winning consumer, rather than depending on listener order.
The axis fix must express this decision explicitly; simply moving a listener or
letting the same event fall through to another Edit handler is insufficient.
Higher-priority dismissal does **not** also clear selection or return axis focus.

| Priority | Applicable state | Winning action and focus |
| --- | --- | --- |
| 1 | Browser/native modal, active Figure export, or focus owned by an application modal | Native/modal owner handles Escape; Figure cancels its capture. Do not run background Edit actions. |
| 2 | An open Workbench command menu | Close the active menu (existing order: overflow, Panels, window-options); restore that menu's return focus. |
| 3 | An editable field owns a draft | The field cancels its own draft. Build search is the existing exception: it is a filter, so the Edit ladder remains eligible. |
| 4 | Edit has a cancellable creation, armed Build, or Transform selection | Execute exactly one Edit action: cancel provisional placement, otherwise disarm Build while retaining selection, otherwise clear Transform selection. If the event originated in the axis widget, also return focus to canvas **as the completion of this same action**, not as a second consumer. Do not dismiss Focus/panels too. |
| 5 | No Edit action won and Workbench Focus is active | Exit Focus and restore the Focus button, as today. |
| 6 | No earlier consumer won and focus belongs to a dismissible panel | Close that panel and use its existing focus-return contract. |
| 7 | No earlier consumer won and an axis endpoint owns focus | Return focus to canvas. Do not activate background mode shortcuts. |
| 8 | Ordinary scene focus, no earlier consumer | Existing mode fallback below. |

This is a proposed explicit order, not a claim that today's scattered handlers
already implement every combination. Application modal handling remains owned by
its modal; the axis change must not become a rewrite of every Escape path.

| Mode | Escape from axis after higher-priority consumers | Ordinary scene fallback |
| --- | --- | --- |
| Display | Canvas focus; preserve mode, camera and selection | Existing window/outliner dismissal; no mode change merely for Escape. |
| Measure | Canvas focus; do not clear measurement selection through a background shortcut | Clear the current measurement selection, retaining Measure mode. |
| Edit | At most one cancel/disarm/clear action as above, then canvas focus; with none active, canvas focus | The same one-action Edit ladder. |
| Calculations | Canvas focus; preserve Subspace selection and Calculations mode | Clear selected calculation atoms; if none, return to Display. |

The Measure/Calculations distinction preserves the axis widget's existing scoped
keyboard behavior; their scene shortcuts must not start firing merely because
Edit's routing is repaired. The Edit ladder already deliberately applies to
non-form controls and must remain effective when an axis button has focus.

## Regression assertions and remaining questions

Assert actual/expected active element, Edit action and invocation count, atom IDs,
Build state, mode and camera pose. Cover all four modes, each Edit ladder rung,
open menus, editable drafts, Focus, and a second Escape. No double cancellation
or clear may occur. Verify legacy canvas focusability separately: only Workbench
currently sets canvas.tabIndex, and the ordinary suite aborts before its later
legacy coverage. That gap must not be called a pass.

No new controller is proposed. Keep any decision helper pure and explicit;
count real closure dependencies before implementation and require <15 and the
construction-order audit. The accepted set remains exactly the two existing
workflow keys until a separately authorized product-fix PR deliberately changes
its expected composition.
