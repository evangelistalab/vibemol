# Remaining maintenance: mechanisms before production changes

Audited against main d849429, production app SHA256
802dae6e37e69b3abcd40e13307d57063ffb29a99f096b2a1fa1930d0d4cd89f.
No production change is included in this report.

## #5: identity validation and numerical contracts are different repairs

CUBE and 2C CUBE retain finite atomic numbers without checking catalog identity.
`normalizeVolumeAtom` subsequently applies `Number(atom.Z) | 0`. Thus6.9 becomes
carbon6 before inference, while119 survives. Bond inference's raw symbol helper
returns an empty string for119; metal classification becomes false, covalent
radius falls back to0.70Å, and maximum main-group coordination becomes0. UI labels
use Z119 instead. Merely changing the empty string to that label does not repair
the generic chemistry fallbacks.

**Z=0 is a real catalogued Dummy atom (`X`)**, with a covalent radius of0.18Å.
Rejecting everything outside1–118 would itself break an existing contract. The
identity fix should validate before bitwise coercion and before inference/live
state mutation, preserve catalogued X/0 and valid elements, and report unsupported
or fractional identity clearly. Audit CUBE/2C, Molden's parseInt path, structure
import/append, direct low-level inference callers and session compatibility;
XYZ resolves the catalog already. No unsupported identity should quietly acquire
generic chemistry. This is the first #5 PR, with valid/Dummy controls and invalid
input rejection asserted at the actual loading boundary, not just label output.

The clamp findings are a second #5 PR after agreeing an invalid-input contract.
`clampWithUpperPriority(0,1,-1)` returns-1; the other nesting returns1.
`clampOrZero(NaN,-1,1)` returns0; the others propagate NaN. Thirteen auto-hydrogen/halo vector-dot/cross
clamps use fixed[-1,1]; symmetry adds one such call; halo adds one[82,176] width
clamp; voxel sampling adds three non-reversed[0,n-1] ranges because n>=1. There are
18 production calls total (auto-hydrogen7, halo7, symmetry1, volume3). None supplies
reversed bounds. No live NaN trigger was demonstrated by this audit. The
reversed-range difference is currently a low-level API contract inconsistency,
not a reproduced UI failure. Proposed policy: reject reversed bounds and invalid
numeric values explicitly, with call-site error handling considered before any
throw is introduced. Preserve the separate four-argument Workbench layout clamp;
it has an explicit fallback contract and is outside this repair.

## #14: retired in Workbench, still supported in legacy

`elementColorBtn` is queried before Properties construction. Workbench removes
its old `.tb-appearance` ancestor, leaving the cached detached node and legacy
onclick. The normal Workbench route calls `openElementColors` through Properties /
Look / Colors / Edit. Legacy still presents and wires the old button. This is not
a globally dead control, nor a license to remove the other legacy backing
controls retained for preset/state synchronization.

Direct human choice: keep the working legacy button. Both that button's onclick
and the Style Studio openElementColors callback invoke the same
periodicTableController.setOpen(true), not parallel editor implementations.
There is one periodic controller creation, state owner and preview renderer.

Limit #14 cleanup to Workbench's dead lookup/wiring: do not cache or attach an
onclick to the launcher that Properties removes. Keep its markup, lookup and
onclick in legacy. Its Workbench known-absence contract changes explicitly from
cached detached to cached null; legacy still requires the same connected node.
No user-facing route is removed. Keep other legacy backing controls. The periodic
factory remains11 used inputs; its launcher input was excluded by PR23 already.
The legacy identity slot stays and this item removes no module let.

## #15: four null slots, dormant popup code and one timer

Both layouts have no creation/markup for editAtomsMenu, editAtomsMenuBody,
editAtomsMenuCurrent or editSelectionFragmentCuePopover. They remain null in the
cached bridge. `positionEditAtomsMenu` has zero references; its UI-update sibling
has one caller and only dead guarded DOM work. The old fragment popup opener has
zero callers; its position function is called only by that opener. The visible
fragment cue's real click handler toggles Build-cue state instead.

The old hide function has14 callers:13 immediate calls and one120ms mouseleave
call inside a null-node listener that is never installed. The hide timer belongs
to this dormant popup. The live Build pane's home parent/sibling and restoration
functions are still used by `restoreBuildPopoverPanes`; keep them. The cleanup
must prove supported pane ownership before deleting the old hide guard, rather
than assuming every parent comparison is dead merely because its target is null.

The #15 PR removes the four els/cache/bridge entries, dead menu/popup routines,
null-node listener and popup-specific CSS, and the obsolete timer after that
ownership proof. It preserves the Build button and pane behavior. These are
already els fields, so deleting four slots does not remove four module lets;
only the one timer is a candidate let reduction (measure after implementation).

Because the legacy launcher stays, #15's exact composition change is52→48:
Workbench47live+1legacy-only known-absence; legacy48live+0known-absent.
The four issue15 names, never an arbitrary count, define that removal. The
presented minima39/32 and every other firing minimum remain because live counts
are unchanged. Native Build/fragment/pane restoration and the complete ordinary
gate remain required. Declare this handoff before its CI; never change the
inventory to match a run.

## PR boundaries

Use three focused PRs: #5 identity; #5 invalid-numeric contracts; #14/#15
retired cache cleanup. The human choice to retain the legacy shortcut removes
the user-facing part of14 and makes it safe to batch with15. Identity/chemistry and numerical API policy have different regression assertions
and risks from the now behavior-preserving DOM retirement. Sharing one maintenance label is not a shared mechanism.
No new controller or module seam is needed; keep each proposed helper below15
inputs and run the construction-order audit for every introduced binding. The
ordinary accepted set remains intentionally empty. Any required golden or
identity-contract change must be explicit, never inferred from an observed run.
