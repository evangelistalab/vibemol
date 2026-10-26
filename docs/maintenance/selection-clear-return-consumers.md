# Shared cleanup changed flag (#71)

`clearEditSelectionsOnEmptyClick()` in edit-tools.js clears atom selection and
calls `onSelectionChanged`. The app callback can clear the bond centre before
the later bond-clear helper counts it. Tagged0.9.5 and accepted main both return
false after a real clear. #52 repaired its own applicability/postcondition
ordering; it did not repair this shared flag. #71 remains open/carried, never
an accepted ordinary failure. No production repair is included here.

The consumer census on merged PR72 (`df47c805`, app SHA256
`802dae6e37e69b3abcd40e13307d57063ffb29a99f096b2a1fa1930d0d4cd89f`)
finds these paths:

| Consumer | How it uses the result |
| --- | --- |
| app `handleEditToolEscape` |Discards it; checks applicability before clearing and actual postcondition afterward|
| app `handleFragmentIntentControllerPointerDown` |Discards it; cleanup precedes the independent placement action|
| app `setBondCenterSelectionFromHit` |Discards it; cleanup precedes explicit new selection|
| edit-tools `setEditIntent` |Discards it|
| app wrapper / gesture `clearSelection` dependency |Forwards the flag to edit-gestures|
| edit-gestures `handlePointerUp`, `void-clear` |The only production branch: calls `setHintMessage('Selection cleared.')` only on true|
| e2e Escape `setSelectionTargets` fixture |Discards it, then explicitly constructs test state; not a click repair|
| edit-tools unit test |Asserts true and separately checks state; its callback mock only logs and lacks the app's cross-selection side effect|
| edit-gestures unit fixture |Uses an atom-list-length stub; checks state/calls, not the real shared flag or missing hint|

The inaccurate false result can therefore suppress the “Selection cleared.”
status hint today. The actual clear, pointer release, idle hover update and
handled-event return proceed independently. No current save/export operation,
state-repair fallback, readiness assertion or downstream validation trusts this
flag as proof that selection is empty. The unit assertion is a real consumer
but its fixture misses the cross-selection callback mechanism. The controller
also exposes the method as an API; this repository census cannot rule out
external callers relying on that contract.
