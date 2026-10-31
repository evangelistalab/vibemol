# Structural undo: proposed scope and snapshot contract

Design only; no undo implementation or command-bus work is authorized by this
document. This is the product decision for review before committing to a program.

## Scope decision

Recommend **structural edits only**: atoms, bonds, transforms, optimization,
symmetrization, coordination/metal annotations and fragment placement. Preserve
the existing separate appearance and measurement histories; camera navigation,
playback, Figure/export and graph presentation are not structural undo actions.

Source loading (including append), replacement, source/layer deletion and opening
a session are explicit structural-history boundaries. They clear the structural
history and say so before the action; they do not acquire an inverse by accident.
A rename/visibility change that preserves source identity need not clear history,
and structural undo must not revert it. A drag/preview is one entry at commit,
not one entry per pointermove; auto-H/cascade/cleanup side effects belong to that
same entry. No-op and cancelled operations add none. Cross-record structural
changes require one atomic entry containing all affected roots.

**Source deletion policy under this scope:** it is not undoable, so it does not
retain a removed source solely for undo. If loading/deletion is included instead,
deletion MUST retain the complete source, graph membership/order, references and
dependencies until the last relevant history version expires. A cube cannot be
reconstructed by its filename, a PubChem refetch, or an arithmetic recomputation.
That is a different product scope, not an optimization that this proposal hides.
The 24 MiB-source example costs at least 24 MiB while retained, even with perfect
sharing; fifty distinct such deletions retain at least 1.17 GiB. Do not implement
the broader scope without a separate decision on its memory/eviction UX.

## Mutable sets and sharing by operation

The affected set is declared before execution and verified afterward. Capture
the actual result, not an anticipated inverse. An undeclared changed field is a
transaction failure. Every atom/bond uses its stable ID; array position is also
captured where order is semantically meaningful.

| Operation class | Mutable versioned state | Shared only if unchanged |
| --- | --- | --- |
| Atom/COM displacement, rigid transform, optimize, symmetry Apply | Atom coordinates; grid origin/axes when the existing operation transforms a grid; any topology/auto-H cleanup actually performed | Scalar/spinor samples, unrelated records, basis/coefficient arrays; frame/mode data only when the operation does not write them |
| Coordinates field edit | Coordinates plus active trajectory frame; vibration equilibrium/symbols/phase/frame buffer when synchronized | Other trajectory frames, mode displacement arrays and scalar grids |
| Atom add/delete/replace; auto-H; fragment/fusion placement | Full actual created/deleted/moved atoms, IDs/order, bonds including blocked/perceived/style/origin, affected annotation maps and fragment operation records; impacted auxiliary state | Unaffected atom/bond chunks and all unaffected scientific buffers |
| Bond order/style, Clean Up Bonds | Changed bonds and inference/suppression provenance; resulting hydrogen/coordinate/annotation changes | Untouched topology, scientific fields and unrelated sources |
| Coordination or metal-mode control | Its annotation map entry plus any actual inferred-bond/geometry/hydrogen result | Other annotation entries and unchanged structure/data |
| Atom reordering | Atom order and every atom-indexed auxiliary mapping: trajectory frames, vibration symbols/equilibrium/displacements, Molden basis atom indices | Scalar grids and coefficients unaffected by the permutation |

The auxiliary rows are necessary, not speculative. Current
`applyAtomOrderToVolumeAuxState` in app.js remaps every trajectory frame and
vibration displacement and rewrites Molden basis atom indices.
`syncVolumeAuxStateAfterCoordsEdit` replaces the current trajectory frame and
vibration equilibrium. Those arrays are **not universally immutable**.

Fragment placement/fusion is the sharp edge: retain its exact pre/post structural
roots, generated hydrogens, removed atoms, IDs, topology, annotations and builder
records. Redo installs the captured post-root. It NEVER reruns catalog selection,
inference, hydrogenation, optimization or snapping. The same applies to Delete's
cascade and repair, and Optimize's numerical result. Transport timestamps are
not history state; mutation outcomes are.

Derived meshes, picking caches, halos, inferred display-only graphs and GPU
resources are invalidated/rebuilt, not retained as authoritative snapshots.
Measurement/calculation references affected by atom deletion must be included in
the declared affected root rather than left dangling. This does not merge their
separate user-facing Undo stacks; transaction invalidation rules need tests.

## Enforced copy-on-write, not a convention

History entries contain references to immutable structural versions, with
unchanged chunks shared. Proposed initial granularity is 64 atoms, 128 bonds,
individual annotation-map paths, and individual frame buffers (or bounded numeric
blocks for larger buffers). It is a starting point to benchmark, not a claimed
measured optimum.

Plain structural records/maps are recursively frozen. Numeric storage is private
behind version handles; `Object.freeze(typedArray)` is NOT a read-only guarantee.
No `.buffer`, mutable `subarray`, raw setter or writable alias escapes a sealed
version. A draft owns changed copies. Sealing transfers its buffers into private
ownership and detaches draft aliases; a read/export returns an owned copy or
non-mutating value access. Bulk renderer/worker adapters may cache disposable
read copies keyed by version, never hand out history's backing buffers.

This requires adapting the existing raw `vol.*` readers/writers; it is not a
wrapper that can coexist with arbitrary legacy writes. Every affected writer
must cross the draft/commit boundary, and a static writer census plus negative
alias tests must prove that before a class ships. The bulk-reader adapter's
cost must be measured. Initial private/cached read copies can add a constant
source-sized cost; they must not multiply with history depth. Do not claim that
using `Object.freeze` on the root alone enforces any of this.

If a structural operation really changes a scientific buffer, it obtains a new
version; history retains the old one. For example, editing one frame of the
2,000-atom trajectory copies 24,000 bytes, not its 24,000,000-byte recording.
The present eager atom-order permutation changes all frames: without a separately
verified index-indirection adapter it costs another 24,000,000 bytes per reorder.
This design does not assume that adapter exists or quietly reclassify writes as
immutable to make the estimate small.

## History size and entry policy

Recommend at most **200 entries AND 64 MiB of uniquely retained payload**. Undo
and redo share that budget; moving the cursor does not duplicate snapshots.
Count each shared buffer once; count an old buffer retained only by history in
full. Account for metadata conservatively and report chunk/buffer/entry counts.
64 MiB is a retained-payload budget, not a promise that V8/DOM/GPU RSS is 64 MiB.
Oldest complete entries may expire to meet it, with the remaining undo depth
visible. Do not silently perform an unrecorded edit when one entry exceeds the
cap: reject before live mutation and explain the limit. That behavior and the
source-history boundary are intended visible changes requiring product approval.

Sizing uses the actual 2,000-atom/5,400-bond spike fixture. Information-only JSON
sizes are not JS heap measurements, and chunk/header overhead is additional:

| Representation / operation | Per-entry information | 200-entry information |
| --- | ---: | ---: |
| Single atom old/new position | 78 B | 15.2 KiB, before chunk/container overhead |
| Interior atom removal with six bonds, empty annotations | 910 B | 177.7 KiB, before chunk/container overhead |
| All 2,000 old/new positions | 160,931 B | 30.7 MiB |
| Existing whole atom before/after payload | 297,082 B | 56.7 MiB |
| Existing atom+bond before/after payload | 1,743,085 B | 332.5 MiB; byte cap expires entries earlier |
| One changed 2,000-atom Float32 frame | 24,000 B | 4.58 MiB, plus structural state |
| Entire 1,000-frame permutation, eagerly copied | 24,000,000 B | 4.47 GiB; cap permits only about two such retained versions |

Adjacent entries share identical pre/post versions; the before/after payload rows
are deliberately conservative upper comparisons, not the intended implementation.
Small edits copy only affected chunks, so the 78/910-byte values explain why
scoping helps but must not be presented as actual per-entry allocations.
Whole-session strings would instead retain 4.79 GiB for 200 mixed-workspace
snapshots or 6.15 GiB for the modelled trajectory. They encode in 678 ms/6.43 s
respectively on the measured M1 Max. Do not use the session wire codec as the
interactive structural-history store or public session import as Undo: session
import changes mode/playback and clears current histories/UI transients.

## Verified restoration, following #25

1. Prepare a fully validated candidate root: identities, references, array types,
   dimensions and declared mutable set. Check it applies to the same live source
   generation. Do not reconstruct state by inverse floating-point arithmetic.
2. Install a prepared immutable root atomically and invalidate its derived caches.
   Retain the prior root; this is a single root swap, not a hand-maintained field
   rollback list. Pause mutable playback while committing/reading back.
3. Export the actual installed authoritative scope independently of the setter
   receipt. Compare canonical JSON with exact types, missing/null distinctions,
   atom/bond IDs/order and annotation/builder metadata. Numeric buffers require
   exact type/length/bytes; unchanged data must still have the same immutable
   version/content digest. Log requested/actual comparands on both outcomes.
4. Advance the history cursor only after exact readback. On a shortfall/exception,
   reinstate the retained prior root, verify it, keep the cursor unchanged and
   report failure. If that readback also fails, block further history actions and
   preserve both roots/evidence rather than claiming restoration succeeded.

The runtime scoped exporter must read live state, not echo the candidate. Tests
also compare against independent `VibeMolStructure.exportActive` volume and
record-state exports and auxiliary-frame/mode readbacks. Exclude only named
transport timestamps; compare every other applicable field. Full-session golden
renderings alone do not prove Undo correctness, just as they did not prove #25.

Required future differential cases: every operation above; undo/redo cycles and
branching; a fragment catalog/inference function deliberately changed between
commit and redo (redo must not call it); active-frame edits and atom reordering;
corrupted/missing dependent fields; setter returns normally but drops a field;
failed restoration plus failed recovery; raw-array alias mutation attempts;
source-generation/history boundaries; 200-entry and byte eviction; and retained
memory before/after eviction/clear. Measure edit commit, undo readback and rebuild
latency separately on the spike's atom-only, grid-heavy and trajectory workspaces.

No controller extraction is needed for the Figure runner. For a future approved
history increment, a host history unit can stay at eight explicit inputs:
readCurrentRoot, prepareCandidate, installRoot, exportActualScope,
invalidateDerived, publishStatus, retainedByteCounter and sourceGeneration.
Pure version storage/validation can remain separate. Recount actual free inputs
before coding; the under-15 and inverse construction-order gates still apply.
This document authorizes neither that increment nor a multi-stage program.
