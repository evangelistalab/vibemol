# Call-free export follow-up

**Conclusion: no unwired capability was found in the three investigated clusters.**
The adaptive-popover lifecycle was superseded, Fragments exposes compatibility
aliases to its working catalog implementation, and coordination preferences have
working consumers from introduction. The built-and-forgotten-feature hypothesis
is **refuted by this audit**. Unused exported names are not evidence of
forgotten product behavior. This conclusion retains the audit's stated limits:
it is not a transitive reachability proof or proof that every control renders.

This is an investigation, not authorization to wire or remove the six popover /
fragment exports. The initial authorized production cleanup was retirement of
`VibeMolElementUtils.getElementSymbolByAtomicNumber`; its tests move to the
current strict helper. The subsequent human instruction also consolidates the
duplicated horizontal placement arithmetic; no obsolete controller is reconnected.
All other call-free entries remain, with explicit
per-member dispositions in `tools/capability-dispositions.json` and the inventory.

## Adaptive popovers: superseded lifecycle, leftover horizontal arithmetic

The generic controller was actually wired, not abandoned before integration:
`d1cb48a` (Extract adaptive edit UI helpers) constructs it and binds the old
Atom/Molecule popovers. `861dddf` (Unify build palette and remove cleanup
controls) replaces that construction with `adaptivePopoverController = null`,
removes the old binding calls, and supplies the unified Build lifecycle.

Current `app.js:positionBuildPopover` and `positionSymmetryPopover` still call
the live shared `edit-ui.js:positionFloatingPopover`; they do not duplicate that
placement implementation. The wrappers now know about Workbench docking,
bottom-versus-right placement, larger panel dimensions and the actual toolbar
bottom plus 12px. The old generic controller hardcodes right placement and
260×160 fallback dimensions without these inputs. Its hover/open/restore rules
also do not implement the current search, focus and docking lifecycle.

The separate `positionAdaptiveMenu` export is horizontal-only sidebar clearance.
It was used by the older edit menu, replaced by inline placement in `90d3e34`,
then by the shared canvas menu in `b9b0ceb`. The live
`app.js:positionCanvasAdaptiveMenu` retains the horizontal clamp and adds the
56px top inset, sidebar-top adjustment and explicit right reset. There is
leftover duplicated arithmetic, not a missing general positioning controller.
“Superseded” describes the lifecycle and added requirements; it is not a claim
that the current code solves every placement case better.

Neither old export supplies an inter-surface policy. `positionAdaptiveMenu`
does not read a Metal rectangle, toolbar bottom, z-order or other panel bounds.
Its horizontal viewport clamp can move a menu back under a wide sidebar.
`createAdaptivePopoverController` places only its own bound panes and delegates
to the same viewport helper already in use. It does not move the adaptive menu
around a Metal popover. Consequently reconnecting it does not solve either
#66 (Metal covers adaptive menu) or #67 (toolbar covers adaptive menu), and
does not reduce #55 to a wiring exercise. The guard's existing rectangle / hit
order model remains the useful starting point for runtime policy work.

## Fragments: compatibility aliases over the live canonical implementation

`fragments.js:1403–1407` defines three one-line backward-compatible aliases:

| Old exported name | Actual implementation |
| --- | --- |
| resolveFragmentQuery(query) | resolveCatalogQuery(query) |
| getFragmentById(id) | getCatalogEntryById(id) |
| buildFragmentInstance(id) | buildCatalogInstance(id) |

Build calls the canonical functions from that same module.
`app.js:resolveBuildPaletteQuery` checks atom, fragment, then molecule;
`setEditAddFragment` and `setEditAddMolecule` explicitly filter the kind.
`edit-placement.js` receives `buildCatalogInstance` as a dependency. There is
no second query parser or fragment clone implementation in app.js.

An actual VM readback loaded the checked-in external manifest and XYZ files:
49 entries, zero loader errors, all49 alias/canonical instance pairs exactly
equal. The important cases were:

| Query / id | Result | Attachment / fusion metadata |
| --- | --- | --- |
| fusionphenyl | fragment | append, replace_h, fuse_ring; local pair [0,1] |
| phenyl / methyl | fragment | append, replace_h; no fuse pair |
| appendmethyl | fragment | append only |
| water | molecule | fragment-filtered lookup returns null |
| unknown id / empty string | null | No fabricated fallback |

The old aliases omit the kind argument, so their historical “Fragment” names
can return a molecule. This is the one deliberate boundary difference from
Build's filtered calls, not divergent lookup logic. Attachment policy is
resolved in the placement controller from the same cloned metadata; fuse
preview checks `fuse_ring` and the local bond pair. No policy lives in the
aliases. The built-in fallback lacks fusionphenyl; its successful browser case
depends on the external catalog, which the comparison therefore loaded.

## Transition-metal coordination: preference versus coordinate editing

The stored-preference wire was present on introduction, not disconnected by the
Build/Transform split. `9adc597` introduces the annotation writer and forwards
the stored id to the halo/inference path. `2df1cfe` replaces the old radial-halo
choice click with the native Coordination menu calling the same writer. The
menu click path remains present today.

`applyAtomCoordinationChoice` has the same normalized AST SHA256 at introduction
`9adc597`, menu transition `2df1cfe`, before `5f6a390`, after `5f6a390`, and
audit source `6043d8e`:

`6b89db76cd5e61855a2c97a3cd6c44196d324101b14306bd611fa480635b72c5`

It stores a preference and pushes history with **beforeAtoms as both coordinate
snapshots**. It refreshes the halo/menu/scene but never transforms existing
ligand coordinates. Reconfiguring existing ligands was therefore never
implemented by this action; it was not lost in the later split.

The preference is consumed. Real production modules were executed on the same
NiCl4 input at four immutable source points:

| Source | Automatic inference | Stored tetrahedral preference | Existing coordinates |
| --- | --- | --- | --- |
| 9adc597 | squarePlanar | tetrahedral, compatible | unchanged |
| 5f6a390 parent | squarePlanar | tetrahedral, compatible | unchanged |
| 5f6a390 | squarePlanar | tetrahedral, compatible | unchanged |
| 6043d8e | squarePlanar | tetrahedral, compatible | unchanged |

This is a source/module investigation, not a fresh native full-UI matrix. The
inference result feeds halo construction and future open-site planning; it does
not prove a native click rearranges a saturated complex. If the reported
defect is “changing the coordination choice does not reshape my existing
complex,” the missing capability is that coordinate operation, from the start.
The claim that the annotation is wholly unread, or that the split disconnected
its inference consumer, is refuted by these readbacks.

Raw readbacks and the extracted historical handler bodies are under ignored
`out/test-artifacts/dead-capabilities/followup/`. No coordination behavior changes accompany this work.

## Authorized horizontal-placement consolidation

The current canvas wrapper now calls the existing positionAdaptiveMenu helper
for horizontal placement. It passes the existing 12px gap, window-only viewport
width and the already-read toolbar rectangle. This preserves the current clamp,
rounding and one toolbar/menu measurement per call, while the wrapper retains
its 56px/sidebar-top vertical policy and right reset. Original helper callers
retain their document-width fallback and default 16px gap. No API member,
controller, module let, collision policy or hover behavior is added. The actual
app-IIFE metric remains250 declaration lines /261 variable-let bindings. A
768-case comparison against339c4e8 matches styles and layout-read counts exactly;
construction checks pass all16 stages, including the two new locals and the
existing helper binding rechecked at its reading sites.

This promotes that one exported face from built-but-unwired to live and shrinks
the exact allowance by its identity. It does not turn the superseded popover
lifecycle into a missing capability, nor claim either #66 or #67 is fixed.

The annotation scan now matches return values structurally and declines bare
returns without printing a null AST. The sibling-node review found resolve /
object already guard missing nodes; bare yield is legal, while await, throw and
arrow bodies require arguments or bodies by grammar. Both valid arrow-body
forms and those syntax constraints are permanent controls. The scanner's actual
three-store /112-boundary corpus is also a regression control.

All 21 workflow job definitions are pinned to ubuntu-24.04. This is the immediate
compatibility measure, with [Ubuntu 26.04 follow-up #81](https://github.com/evangelistalab/vibemol/issues/81)
left open. The locked Playwright 1.64.1 already has native 26.04 WebKit and
install-deps support (ICU78). The failed run restored an ABI-ambiguous Linux
cache and launched an ICU74-linked binary; release-specific caches plus a cold /
warm native 26.04 trial are deferred. No system-library workaround is included.

Run41144464219 remains failed and its immutable evidence is preserved. The
updated PR stays held until its own complete standing conjunction is verified;
no diagnostic, local unit result or runner pin supplies acceptance by itself.
