# Validated Edit selection and incremental Build

Implementation of the approved 12-method `VibeMolEdit` surface. Classic scripts,
no command bus, no new Undo implementation, and no existing e2e conversion.

Public `setSelection` accepts only the original `resolveSelection(...).value`.
Its private identity brand, current source fingerprint and re-resolved predicate
must all agree. JSON round-trips are deliberately not authority. Native hit
eligibility is separate: selecting a logically selectable atom through this API
never proves a click landed. The distinct testing adapter validates raw indices
atomically and may not recover a failed native click.

Build and translation are limited to static, structure-only molecules. Resolving
selection on scientific sources is supported; attempting a structural write on
trajectory, vibration, cube or Molden returns `SOURCE_NOT_EDITABLE` with actual
source flags and the expected static scope, before mutation. Explicit new-system
creation is supported. Standalone rotation is excluded: pivot, axis and affected
fragment/bond semantics require a separate contract. Placement quaternion and
attachment/fusion spin already orient newly placed content.

## Dependency recut before completion

The implementation audit counts genuine injected inputs **plus bound helper
reads**, rather than merely the length of `deps`. It found the initial combined
build service at 17 and catalog/site query unit at 16. These do not ship as such.
The revised cut is:

- Candidate preparation: source lookup/new snapshot, request validator, draft
  factory, placement/attachment/fusion/insertion planners and candidate validator;
  plus data, target, scope and fault helpers (13 inputs).
- Build application façade: preparation, commit, source reader, resolver receipt
  inspector, draft factory and candidate validator; plus result, scope and vector helpers (9 inputs).
- Catalog enumeration: entry reader, result wrapper and copy helper (3 inputs).
- Site resolution: the seven remaining domain inputs plus the data, element,
  fault, quaternion, shape and target helpers (13 inputs); the result wrapper
  belongs to the façade (one further input if kept locally: 14).

These are existing transaction stages, not an opaque `host` object hiding a broad
controller. Final measured lists and construction results accompany the PR.

## Calls and authority

```js
const entered = VibeMolEdit.enter({tool: 'transform'});
const resolved = VibeMolEdit.resolveSelection({kind: 'labels', labels: ['C1', 'C2']});
if (!entered.ok || !resolved.ok) throw new Error('Inspect the returned error.');
const selected = VibeMolEdit.setSelection(resolved.value, {mode: 'replace'});
```

`setSelection` also supports `add`, `remove` and `toggle`. Empty selection is
expressed by `clearSelection()`. A copied or serialized resolver result fails
`RESOLUTION_REQUIRED`; resolve the predicate again in the browser instead.
Resolution is read-only in any mode; selection writes require Edit and no active
interaction. Selectability is the logical Edit domain, including Select All,
not whether an atom is currently under an unobstructed canvas pixel.

Predicates are exact data, with no JavaScript callback, fuzzy matching or raw
product indices:

| kind | Required fields |
| --- | --- |
| `all` | none |
| `ids` | nonempty distinct stable `ids` |
| `element` | canonical `element` symbol |
| `labels` | nonempty distinct `labels`; ordinal is 1-based **within element** |
| `fragment` | placed `instanceId`, `role` (`owned` or `footprint`), optional exact `members` |
| `component` | `seed` resolving to one atom; stored normal-bond connectivity |
| `union`, `intersection` | at least two `selectors` |
| `difference` | `left`, `right` |
| `piPlane` | `seed`; existing centered-covariance/SVD-equivalent plane fit |

π planes retain the existing RMS maximum 0.100 Å and second-eigenvalue minimum
1e-8. Rejection reports measured RMS/eigenvalue; the existing two-argument
Calculations fit and error strings remain unchanged. Owned fragment membership
never includes shared fusion hosts; `footprint` requires recorded host provenance.

`context()` returns copied atoms, stable IDs, 0-based compatibility indices,
element labels, Å positions, stored topology, fragment memberships, scene/layer
location, source capabilities and interlocks. Its fingerprint includes structural
state, source classification and location. Resolutions expire after coordinate,
topology, annotation, order, source or active-system changes. No record or
scientific-buffer pointer escapes.

`copySelection(resolved.value)` returns an owned `vibemol.edit-selection` v1
Angstrom envelope. It contains selected atoms, local-index bonds and copied
builder/coordination/metal metadata; it does not read or write the OS clipboard.
The transform on insertion applies to the envelope's coordinates (it does not
silently recenter them).

## Build transactions

```js
const c = VibeMolEdit.context().value;
const request = {
  operation: 'placeAtom',
  system: {systemId: c.systemId, fingerprint: c.fingerprint},
  element: 'O', position: [3, 0, 0],
  hydrogens: 'preserve', warnings: 'reject'
};
const predicted = VibeMolEdit.validateBuild(request); // no IDs/UI/history allocated
const applied = VibeMolEdit.applyBuild(request);    // revalidates authoritatively
```

Use `system: 'new'` only when intentionally creating a new molecule. All other
writes require the current explicit header. Every build supplies `hydrogens`
(`preserve`/`adjust`) and `warnings` (`reject`/`allow`); current toolbar preferences
are never product defaults. Positions/directions/deltas are Angstrom vectors;
`quaternion` is `[x,y,z,w]`, unit length; `spinAngle` is finite radians.

| operation | Additional fields |
| --- | --- |
| `placeAtom` | `element`, `position`, optional supported `coordination` geometry |
| `placeCatalog` | exact `entryId`, `entryKind` (`fragment`/`molecule`), `position`, `quaternion` |
| `growAtom` | `element`, one-atom `anchor` predicate, nonzero `direction`, optional exact `position`, integer `bondOrder` 1–4, `attachPolicy`, optional `coordination` |
| `attachFragment` | fragment `entryId`, `anchor`, `direction`, `bondOrder`, `attachPolicy`, `spinAngle` |
| `replaceHydrogen` | `anchor`, exact `hydrogen` predicate, `bondOrder`, exactly one of `element` or fragment `entryId`; fragment requires `spinAngle` |
| `fuseFragment` | fusion-capable `entryId`, two-atom bonded `host` predicate, `bondOrder`, `spinAngle` |
| `insertSelection` | complete v1 `envelope`, `position`, `quaternion` |

Attachment policies are `append`, `replace_h`, `smart`. Explicit replacement
requires a supported terminal H and cannot degrade to append. Smart reports the
chosen policy and removed ID. Bridging H is not a terminal replacement target.
Fusion keeps the existing host IDs; template topology is prepared once and is
not inferred again on commit. Legacy operation serialization still calls fusion
`smart`; recorded `hostBondAtomIds` identifies its footprint without changing
that existing representation.

`listBuildCatalog()` enumerates the **currently available** catalog, which loads
asynchronously at startup. Unknown/unloaded IDs fail; no fallback entry is
selected. `listBuildSites({system,anchor,element|entryId,bondOrder,geometryId?,
frameQuaternion?})` reuses the halo geometry kernel on owned data. It returns
world sites, terminal-H members, eligibility reasons and context-bound site IDs;
hover, cached UI orientation and screen projection are separate test concerns.

`translate(resolved.value, delta)` is an exact atom-set translation, without
implicit fragment expansion or simulated input. Structural writes on scientific
sources remain outside this first cut. `applyBuild(request,{signal})` accepts a
native AbortSignal and checks cancellation before preparation and immediately
before synchronous commit. It never claims to cancel or roll back an applied
edit.

Candidates use local IDs and reuse the existing placement, topology, methyl,
hydroxyl, cleanup and hydrogen kernels. Only commit allocates permanent IDs and
timestamps. The spatial-state owner receives atoms, operations, bonds **and
annotations**. The complete scoped applied structure is read back and compared
against the prepared canonical candidate: types, IDs, integers, membership and
preserved fields exactly; computed floats use the existing 1e-9/1e-12 discipline.
A helper's boolean is never proof of application. Existing history recording is
reused; no new Undo stack, inverse engine or scientific source history is added.

## Results and failures

Success is `{ok:true,value,context?,requested?,applied?,changed?,mutation?}`.
Selection/build writes include requested/applied comparands and a change derived
from state. Invalid requests are `{ok:false,error:{code,path,message,details:
{actual,expected}},mutation:{state:'none'}}`. Unexpected application exceptions
or readback shortfalls return `APPLY_FAILED`/`APPLIED_MISMATCH`, actual state when
available, and `applied`/`unknown` mutation status. Do not automatically retry.
Changed fingerprints prevent reusing pre-failure requests or resolutions.

Other codes include `NO_SYSTEM`, `SYSTEM_NOT_FOUND`, `SYSTEM_INVALID`,
`STALE_CONTEXT`, `RESOLUTION_REQUIRED`, `MODE_REQUIRED`, `INTERACTION_BUSY`,
`ELEMENT_UNKNOWN`, `ELEMENT_ABSENT`, `ATOM_NOT_FOUND`, `INDEX_OUT_OF_RANGE`,
`ELEMENT_INDEX_OUT_OF_RANGE`, `EMPTY_SELECTION`, `DUPLICATE_REFERENCE`,
`FRAGMENT_NOT_FOUND`, `FRAGMENT_MEMBERSHIP`, `FRAGMENT_MEMBERSHIP_UNAVAILABLE`,
`PLANE_TOO_SMALL`, `PLANE_COLLINEAR`, `PLANE_NONCOPLANAR`, `CATALOG_NOT_FOUND`,
`CATALOG_KIND`, `ATTACH_POLICY_UNSUPPORTED`, `ANCHOR_INVALID`, `HOST_BOND_INVALID`,
`NOT_TERMINAL_H`, `NO_REPLACEABLE_H`, `SITE_STALE`, `INVALID_COORDINATES`,
`INVALID_ORIENTATION`, `INVALID_BOND_ORDER`, `HYDROGEN_BOND_INVALID`,
`INVALID_SELECTION_ENVELOPE`, `INVALID_CANDIDATE`, `WARNINGS_NOT_ACKNOWLEDGED`,
`SOURCE_NOT_EDITABLE`, `ABORTED`, and `INVALID_REQUEST`. Whole-request failure
precedes mutation; no coercion, invalid-member filtering, duplicate repair or
fallback to a first atom/site is permitted.

## Harness boundary and verification

The exact 20 wrappers, seven retired names, retained native-drag body hash and
all private unit input lists are in `tests/baselines/edit-api.json`, enforced by
`tools/audit-edit-api.cjs`. Read-only wrappers still inspect actual UI, renderer,
picking and guide state. Mutation wrappers make explicit product API requests;
they do not synthesize a successful native click. The strict raw-index testing
adapter validates every member before its legacy explicit operator-finalization
step, then delegates selection to the same validated owner. Product calls never
finalize that pending operator implicitly.

`performSelectionMoveDrag` remains byte-identical until a separately approved
native replacement. Seven unused hooks retire now. No existing e2e call site is
converted. The new product matrix is additive within Premerge, leaving 37 suites
and an intentionally empty accepted-failure set. It retires its browser/context
before returning and asserts zero residual contexts.

The declared recording contract permits exactly one new 12-member namespace and
seven Testing member removals in **each of 102 captures**, with zero other leaves
changed. Two CI workers each record twice; all four serializations must match.
The recorded baseline then requires its own complete first ordinary conjunction.
No version mapping, golden tolerance or accepted failure is introduced.

Expected downstream work, **not this increment**: semantic setup can reduce
canvas choreography in non-input checks such as `edit_picking` and Fusion phenyl.
Native picking/gesture assertions must continue testing native input. Undo stays
design-only; the command-bus/declarative-controls program remains stopped.

Final input inventory: 55 private units, maximum 14 inputs; shared halo sites 13, hydrogen adjustment 13. Callback parameters and nonstandard global THREE reads are included; browser built-ins are not domain dependencies. Exact names are enumerated in the contract.

The separate local observations record preserves the failed development Smoke
sample-load deadline and its main/candidate probes, plus the three-source native
single-atom cue interception. Tagged, main and candidate share the same blocked
rectangle. The compatibility matrix stages the legacy card with the existing
keyboard move controls before clicking, following the Metal matrix precedent;
it still requires native hit eligibility. No placement rule or latent allowance
is added. The full ordinary gate remains required and those probes supply none.

## Allocator forwarding recut

The first committed wiring forwarded an object containing three allocator
callbacks through the commit adapter. Treating that field as one input would
understate genuine inputs (15 when flattened). Before ordinary CI, replace it
with the already-planned identity-realization owner: atom allocator, group
allocator, operation allocator and bond-ID helper, plus the realization kernel
(five inputs). The commit adapter then receives that narrow realization operation
and has eleven inputs. The owner only realizes prepared IDs; it performs no
source lookup, validation, UI write or history recording. This is a transaction
stage, not an opaque host bundle. The first recording stays separate evidence
for its own source and will not be promoted for the revised commit.

The same final audit counts the private draft's method arguments as real
callbacks: placement has four, attachment six, fusion four and insertion five.
That put the combined envelope-validation/insertion unit at16. Re-cut before
ordinary CI: a pure envelope validator (six inputs) checks all atom, metadata and
bond fields; the insertion planner (six injected inputs plus five draft methods,
eleven total) only transforms and stages the validated data. Attachment is14,
placement/fusion11. No function-valued argument is treated as free data.

Identity provenance is also explicit: the private draft records every minted ID
and its kind. Realization remaps only known identity fields, never arbitrary
strings matching a prefix. Existing source IDs and opaque metadata are preserved,
even when they contain the draft prefix or the timestamp marker. Only new
operation timestamps are realized. A predicted candidate is data, not authority.
