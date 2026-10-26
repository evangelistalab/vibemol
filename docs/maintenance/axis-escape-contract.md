# Axis Escape ordering contract — issue #52

This contract describes the canonical data in `ESCAPE_LADDER` and the shared
`EDIT_ESCAPE_LADDER`. The generated tables below are checked against that data. Issue #4 was a CI prerequisite umbrella; #52 owns axis
Escape and #53 owns the unrelated Coordinates collision. Fix them in separate PRs.

## Measured mechanism

Run 40159501600 on unchanged main product code observed Edit/Transform selection
`[0] -> []`, focus remaining `viewAxisNegZBtn`, `defaultPrevented: true`, and
`rootKeydownSeen: false`. Workbench's document-capture handler calls
`host.editToolEscape()` then stops immediate propagation. The Edit action is
performed, but the axis widget's `onEscape -> canvas.focus()` never runs.
Workbench capture, the Edit ladder, and the axis keyboard owner already exist on
`v0.9.5-pre-refactor`. This is not a missing widget Escape handler.

## Data-driven precedence

Every key press starts at level 1 with newly collected current availability.
Nothing caches the previous winner or carries a ladder position to the next
press. A level matches only if its applicability predicate is true. An active
Edit mode with no placement, armed Build or Transform selection therefore
**declines level 4**; Focus, panel dismissal or axis focus may then win. If no
level applies, the app leaves the event unclaimed and executes zero actions.

After selection, one winning action runs. False/throw is failure, not decline:
it surfaces without trying a lower action. For an Edit action from the axis,
returning canvas focus is completion of that same action, not a second winner.
Modal/browser-native UI retains its own ownership; a native dialog that consumes
the key does not deliver it to the page. Existing target-owned draft/activation
cancellation is offered explicitly to the table rather than preempted by a
background tool action. Each offered action has exactly one owner.

Level 7 is an actual conditional fallback, not a catch-all consume: outliner
focus can clear an explicit layer selection while retaining the active layer;
Measure clears a nonempty measurement selection; Calculations clears selected
atoms, otherwise returns to Display. Display and empty Edit scene focus have no
fallback action and decline. Axis scope reaches level 6 before scene shortcuts,
so Measure/Calculations axis Escape retains their mode and selections.

<!-- escape-ladder:start -->
| Level | Consumer | Applicability/actions in priority order |
| --- | --- | --- |
| 1 | Modal or active capture | figure.cancel → help.close → appearance-reset.close → element-colors.close → calculations-picker.close |
| 2 | Close the active command menu | menu.overflow → menu.panels → menu.window-options → menu.outliner |
| 3 | Cancel an owned field or activation draft | draft.look-name → draft.list → draft.selection-position → draft.slider → draft.atom-operator → draft.molecule-operator → draft.outliner-rename → activation.cancel · origins: field, control |
| 4 | One applicable Edit action, otherwise decline | edit.perform · modes: edit · origins: axis, scene, control, filter |
| 5 | Exit Focus, otherwise dismiss an applicable panel | focus.exit → panel.workbench → panel.list → panel.properties → panel.style-studio → panel.arithmetic → symmetry.cancel-preview → studio.close → legacy-window.close |
| 6 | Return axis focus to the canvas | axis.focus-canvas · origins: axis |
| 7 | Applicable ordinary mode fallback, otherwise decline | mode.outliner-reset — Clear an explicit outliner selection; retain active layer [control] → mode.measure-clear — Clear a nonempty measurement selection; retain mode [measurement] → mode.calculations-clear — Clear selected calculation atoms; retain mode [calculations] → mode.calculations-exit — With no calculation atoms selected, return to Display [calculations] · origins: scene, control, filter |

| Edit branch | Required current state | Action |
| --- | --- | --- |
| cancel | placing | Cancel provisional placement; retain Build |
| transform | build | Disarm Build; retain selection |
| clear | selected | Clear Transform selection |
<!-- escape-ladder:end -->

## Regression assertions and remaining questions

The checker enumerates every level × four modes × eight concrete focus holders
across four focus kinds, plus every Edit sub-ladder state (1248 cases). Applicable cases have one winner/one action; fully
inapplicable cases have none, never a fabricated no-op. Two- and three-press
sequences exercise modal→menu→Edit and cancel→disarm→clear from fresh state.

Assert actual/expected active element, Edit action and invocation count, atom IDs,
Build state, mode and camera pose. Cover all four modes, each Edit ladder rung,
open menus, editable drafts, Focus, and a second Escape. No double cancellation
or clear may occur. App startup now owns canvas focusability in both interfaces;
the legacy native cases verify it separately. The old ordinary suite aborted
before its later legacy coverage; that gap was not a pass.

There is no new controller or module state. The stateless arbiter uses current
offers from the existing owners; all 32 action types have exactly one source
provider. The checker reports every new helper's app closure reads, global
module reads and data parameters and requires each total to stay below 15. The
largest helper has 11 total inputs. The inverse construction audit covers the
app and every changed provider, including providers loaded after app startup.
Historical52 authorization required36/1/37 and retained Coordinates byte-identically.
Corrected run40237309034 satisfied that conjunction. Separate53 subsequently
passed37/0/37 and merged as91e9fb6; the current accepted set is intentionally empty.

## Corrected field ownership and action-result diagnosis

The first candidate's ordinary run40227837227 returned32/5/37 against the
authorized36/1/37 and remains rejected. Smoke stopped at Orbitals before either
exporter: that run supplies no exporter-completion coverage.

The name form had a local Escape cancel but no level3 offer. Capture closed
Studio before its field handler. It now offers its existing cancel action.
Orbitals' energy threshold is already applied, with no draft. The field origin
was excluded from Workbench dismissal while the list offer listened only inside
the table body, excluding the header input. Panel ownership now covers the
whole shell after any applicable draft; the legacy generic window owner also
accepts a committed field after the draft level declines. Plain field focus is not itself a draft.

The selection suites did have a target: a bond-center selection. Clearing even
an empty atom selection calls onSelectionChanged, which clears the bond center.
The subsequent change counter returns false because that center is already
gone. Source execution records selected:true→false and center:present→null while
the old handler returned false. The correction checks an existing target before
cleanup and an empty selection afterward. A real action failure still surfaces
and never falls through after mutation. Empty Edit declines before execution.

The old300 pure-table cases were140 level/mode/origin plus160 Edit flag cases:
fabricated offers and one selected boolean. The revised8 concrete focus holders
span canvas, axis button, editable text and form control:224 level/mode/focus
cases plus1024 cases over all32 placement/Build/atom/transform/bond-center
combinations,1248 total. The separate62-case native matrix exercises actual
name/live-energy/select owners and every selection-target combination in both
interfaces. The old field/control labels existed; these real owner paths and
the distinct bond-only target did not. Do not claim native coverage of every
abstract table cell. Corrected run40237309034 reached both exporter completion records and satisfied
the authorized36/1/37 composition.

## Causal repair and maintenance evidence (2026-10-26)

The ten `edit.perform` page errors (two Transform selection, eight Edit picking)
were repaired by the merged handler's code change, not by changing tested states.
An exact extracted-handler comparison uses the same bond-only state and real
shared controller: rejected df88b84 clears the target but returns false; merged
ff66e776 clears it and returns true. The merged handler checks applicability
before cleanup and verifies the postcondition afterward instead of consulting
a changed flag computed after callback side effects. Both original suite files
are byte-identical between those candidates. The expanded matrix adds coverage;
it did not avoid or repair the failing state.

The shared helper still has an inaccurate changed flag: the atom-selection
callback clears the bond centre before the later helper counts it. Tagged base
and accepted main both return false after a real clear. This is separately
tracked as [#71](https://github.com/evangelistalab/vibemol/issues/71); the closed Escape repair does not claim to fix that helper.

Specifying the ladder required300→1248 pure-table cases, plus62 native cases.
That growth is evidence of standing maintenance cost, not a new task. Alongside
0.11 controls, evaluate where `<dialog>`, `inert`, and focused-field ownership
can supply platform behavior instead of maintaining every rule by hand. The
working merged ladder is unchanged. See [0.11 evidence](0.11-controls-evidence.md).
