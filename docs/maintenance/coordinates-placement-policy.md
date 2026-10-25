# Coordinates placement audit — issue #53

Issue #52 is separate. The local #53 rule below knowingly extends the fragmented
placement behavior documented here; it does not implement a shared policy.

## Existing shared behavior

VibeMol has shared movement and bounds behavior, but **no general inter-surface
placement/collision policy**. `floating-panels.js` registers floating shells,
adds pointer/keyboard dragging, retains manual positions, clamps them to the
viewport with a 12px margin, and manages active/manual z-order. Its `constrain`
function receives one surface's dimensions and viewport bounds, not other open
surfaces. `edit-ui.js:positionFloatingPopover` positions one trigger/popover pair
against the viewport and an optional top inset. `VmListPopover` supplies list,
row-action and editing behavior; it does not place surfaces. Its app-owned
shell supplies placement. Neither provides a shared obstacle set.

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

Diagnostic40203023318 completed the original regions on Python3.12.15,
Playwright1.64.1 and Chromium156.0.8078.4: legacy row actions22 assertions with
one native Delete interception and one explicit DOM-click bypass; orbital
context19 assertions with no bypass; Workbench row actions21 assertions with
no bypass. All62 executed checks held and there were no page errors. Ten
checks preceded the legacy failure, exposing52 dynamic checks behind it.
No additional native failure or failed assertion was found. Fresh later
contexts do not inherit the bypass, but remain diagnostic, not ordinary gate
evidence. See `tests/baselines/coordinates-region.json` for provenance.

The eventual ordinary regression must require the intended Delete (or
child) to own its native click point and retain stable atom-ID/bond assertions,
first-click inline editing, Undo/Redo, Enter/Space and Workbench coverage. No
production placement rule or accepted-set change is included in the classifier
PR.

## Local rule and open guard findings

For an automatically placed selection card, retain its preferred location unless
it intersects the visible Coordinates rectangle plus 12px clearance. Try the four
adjacent placements, keeping the other coordinate unchanged, and choose the
nearest clear candidate inside the existing viewport/sidebar bounds. A manually
placed card stays pinned; an active position edit retains its existing freeze.
No fit leaves the obstruction observable rather than pushing controls offscreen
or silently changing another surface. That case requires a broader product
decision. The original Coordinates lookup populates `els.coordsPanelEl` at its
existing site; an early caller sees null instead of reading a late lexical
binding. The local helper has one closure input plus seven geometry parameters.

## Updated policy recommendation and separate guard

The earlier recommendation favored a local rule for this defect rather than a
shared placement subsystem. The subsequent inspection and strict measurement
change that recommendation: nine of nine initial pairs were suspected defects,
and clipped-intersection run40230711618 found three more pairs plus additional
occluded targets. Twelve bespoke avoidance rules would extend the fragmentation
this audit identified. A shared inter-surface policy is now **justified but not
scheduled**. Evaluate it alongside the0.11 declarative-controls work; do not build
it in this repair. [#55](https://github.com/evangelistalab/vibemol/issues/55) holds
the inventory and the change in recommendation.

The strict discovery guard and its explicitly authorized twelve-pair/112-target
latent baseline will ship in their own PR. Its surface coverage remains
incomplete; its preparation does not block this local fix. Those latent
allowances are not accepted ordinary-suite failures. This PR removes only the
Coordinates accepted workflow after52 and requires37/0/37 with an intentionally
empty accepted set; matcher/join machinery stays.
