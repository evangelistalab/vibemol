# Coordinates placement audit — issue #53

Mechanism and design input only, before a product fix. Issue #52 is separate.

## Existing shared behavior

VibeMol has shared movement and bounds behavior, but **no general inter-surface
placement/collision policy**. `floating-panels.js` registers floating shells,
adds pointer/keyboard dragging, retains manual positions, clamps them to the
viewport with a 12px margin, and manages active/manual z-order. Its `constrain`
function receives one surface's dimensions and viewport bounds, not other open
surfaces. `edit-ui.js:positionFloatingPopover` positions one trigger/popover pair
against the viewport and an optional top inset. `VmListPopover` similarly uses
its own anchor and viewport. Neither receives an obstacle set.

Workbench's model allocates right/bottom dock regions and resizes the usable
canvas; display-window exclusivity prevents some panels coexisting. These are
real shared policies, but neither arbitrates arbitrary floating surfaces. Some
features such as the axes have local obstacle avoidance; that is not reused by
selection cards. `renderEditSelectionTranslateCue` independently positions the
card from projected atom bounds, toolbar and viewport limits. It does not ask
where Coordinates is open. Manual placement and editing also freeze different
parts of the positioning lifecycle.

## What these three reports have in common — and do not

- #53 is a product collision: in run 40159501600, Coordinates is at (766,68),
  422 x 260.671875, z24; the unmoved selection cue is at (908,73),
  280 x 154.78125, z34. Delete center (1167,221.890625) belongs to
  `editSelectionPosition`. The Delete handler never receives a native click.
- #17 concerned the Metal popover's responsive size/clamping/toolbar clearance.
  Its fix did not establish cross-surface exclusion.
- PR49's Carboxyl interception was a harness precondition: a deliberately open
  catalog owned the point where the test tried to click the canvas. Dismissing
  it before that canvas action was appropriate. It is not evidence of a third
  independently diagnosed product placement defect.

These expose a shared *absence* of a general policy, but they are not three
instances of one proven product bug. Another local avoidance rule would leave
that general absence in place; it must be disclosed rather than presented as a
systemic solution. No shared solver is requested or implemented here.

## Information a shared policy would need

1. Visible interactive rectangles in one CSS coordinate space, including portals,
   docked panels, toolbar reservations and true stacking/hit-test order.
2. Surface owner/parent group, anchor, allowed overlaps, preferred placements,
   clearance and minimum usable dimensions.
3. Explicit priority: modal/menu, focused editor, active tool, persistent panel;
   which surface may move, and which manual placement must remain pinned.
4. Lifecycle inputs: open/close, resize, scrolling, scene projection, content size,
   mode and docking changes; one invalidation/observation point.
5. A deliberate no-fit policy for narrow viewports: scroll, collapse, reflow or
   dismissal. Merely raising z-order swaps which live control becomes unusable.
   Do not move a card while a user edits it or silently overwrite a manual drag.

## Unmasked-region diagnostic and regression assertion

`coordinates_region_diagnostic.py` executes original row-action assertions in
legacy and Workbench contexts, plus the formerly masked legacy orbital region.
Only native Coordinates clicks measured to be intercepted by the selection card
can continue via a labeled DOM click. Every such native failure remains a
failure in the report; assertions after a bypass do not prove native input.
Unknown failures stop their case, with the rest unexecuted; fresh independent
cases still expose later masking. Original waits and predicates are unchanged;
the CI toolchain uses the ordinary lockfile. This diagnostic cannot accept a PR.

Before choosing the product cut, report that run's failures and downstream
coverage. The eventual ordinary regression must require the intended Delete (or
child) to own its native click point and retain stable atom-ID/bond assertions,
first-click inline editing, Undo/Redo, Enter/Space and Workbench coverage. No
production placement rule or accepted-set change is included in the classifier
PR.
