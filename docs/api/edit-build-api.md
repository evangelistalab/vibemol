# Validated Edit selection and incremental Build

Additive implementation of the approved 12-method `VibeMolEdit` surface (split86a). Classic scripts,
no command bus, no new Undo implementation, and no existing e2e conversion.

Public `setSelection` accepts only the original `resolveSelection(...).value`.
Its private identity brand, current source fingerprint and re-resolved predicate
must all agree. JSON round-trips are deliberately not authority. Native hit
eligibility is separate: selecting a logically selectable atom through this API
never proves a click landed. The existing Testing surface is retained byte-for-byte; wrapper conversion is
a separate increment. No native click can be repaired by the product API.

Build and translation are limited to static, structure-only molecules. Resolving
selection on scientific sources is supported; attempting a structural write on
trajectory, vibration, cube or Molden returns `SOURCE_NOT_EDITABLE` with actual
source flags and the expected static scope, before mutation. Explicit new-system
creation is supported. Standalone rotation is excluded: pivot, axis and affected
fragment/bond semantics require a separate contract. Placement quaternion and
attachment/fusion spin already orient newly placed content.

## Dependency boundaries

The standing audit enumerates 41 private units and counts injected callbacks,
bound helpers and function-valued parameters, including every draft method a
planner calls. Every unit is below 15 inputs; the largest has 14. No broad host
object hides several capabilities behind one field.

| Unit | Inputs |
| --- | ---: |
| System reader / selection owner / predicate resolver | 11 / 11 / 5 |
| Candidate preparation / build application façade | 13 / 11 |
| Catalog enumeration / build-site query | 3 / 14 |
| Placement / attachment / fusion planners | 11 / 14 / 11 |
| Selection-envelope validator / insertion planner | 6 / 11 |
| Identity-realization owner / commit adapter | 5 / 11 |

Envelope validation and insertion are separate stages: the first validates the
whole payload; the second transforms and stages owned data. Identity realization
receives the three allocators and bond-ID helper explicitly. The commit adapter
receives the narrow realization operation, rather than an allocator bundle.
The exact names, callback-parameter counts and reused halo/hydrogen-kernel inputs
are recorded in `tests/baselines/edit-api.json`.

Two API units reach 14, rather than the proposal's projected maximum of 12:

- `createEditApiAttachmentPlanner`: eight injected inputs (`THREE`,
  `adjustHydrogens`, `catalog`, `geometry`, `outward`, `postprocess`, `topology`,
  `warnings`) plus six independently counted draft operations (`add`, `bond`,
  `group`, `nextAtomId`, `operation`, `remove`). Function-valued parameters are
  capabilities too; counting the draft as one input would hide the real seam.
- `createEditApiBuildQueries`: seven injected inputs (`bondLength`, `catalog`,
  `connection`, `elements`, `readSystem`, `resolve`, `sites`) plus seven direct
  validation/result helpers (`editApiCall`, `editApiData`, `editApiElement`,
  `editApiFault`, `editApiQuaternion`, `editApiShape`, `editApiTarget`). The
  complete strict-request and context checks count alongside query execution.

The reused hydrogen-adjustment kernel also reaches 14: 13 closure reads plus
the explicit draft allocator callback. All three are at the present ceiling: the rule is strictly below 15, so neither has
room for another input. Future forte2 or Build work must re-cut before adding a
capability, for example separating query validation from execution, or atom
attachment from fragment staging. No such expansion is included here.

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


## Additive boundary and verification

`tools/audit-edit-api.cjs` compares all 2,502 original app statements against
main c37bb07 and the complete 42-member Testing object byte-for-byte. Zero
wrappers and zero retirements are permitted. `performSelectionMoveDrag` is
included in that invariant. Four controls include negative cases rejecting a changed Testing
getter, an unrelated legacy statement change, and new mutable API state.

The opt-in helper additions are explicit: plane diagnostics add detailed
rejection comparands; draft hydrogen allocation avoids consuming permanent IDs;
explicit hydrogen adjustment avoids inheriting a UI preference. The audit erases
only these declared opt-in clauses and requires the original default bodies to
match exactly. Placement exposes existing pure helpers to the new owner, and
halo sites add a read-only query using the existing mathematics. Existing paths
never call the product API. No existing suite is converted.

The new product-only matrix runs additively after Premerge's original browser
retires, in one serial fresh context. It validates all twelve methods, all seven
build operation classes, resolver provenance, per-element bounds, fragment
membership, plane residuals, source-write rejection and atomic failures. Every
new comparison logs actual and expected values on both outcomes. Its wrappers
and retirement coverage are deliberately absent from this cut.

The declared recording permits exactly the new twelve-member `VibeMolEdit`
namespace in all 102 captures: 102 namespace additions / 1,224 member strings,
zero removed Testing members and zero other capture changes. Two CI workers
capture twice; all four serializations must agree. The promoted goldens then
require a complete first ordinary37/0/37 run, exact repeat, all48 identity slots
in eight contexts/all minima, units/WebKit/construction, both exporters and both
Looks material-family paths. No version mapping or comparison waiver exists.

## Deferred wrapper batches

`tests/baselines/edit-api-wrapper-plan.json` enumerates the proposed batches,
each with at most five changed Testing members including retirements. This is
an inventory for separate review, not code included in split86a. The
fragment-cue replacement wrapper is isolated: the held version clears selection
during structural commit and omits legacy anchor restoration. Its existing
postcondition expects selection[0]; accepting a different contract needs review
before any assertion or expectation changes. Instrument all four comparands
before running that batch, not after a timeout.

The second hydroxyl Smoke request means the first remaining open site for a
second attachment, not a second ghost ordinal. Template direction0 is already
occupied and the remaining identities are[1,2,3,4,5]. The projection batch will
request an available identity explicitly, retain countable substitution events,
and remove the fallback only after the caller has no substitutions. The helper
and caller remain unchanged in split86a.

## Figure causation control

Main run41314331930 did reach and pass target listing, then the remaining
runner matrix and standing buffer checks. Fresh control41379282576 checked out
unchanged main c37bb07 on the ordinary locked Ubuntu24.04 toolchain and passed
the complete native matrix, including target listing after the same prefix.
Neither control reproduces the session error seen on held041b842; causation
remains unclassified. No Figure code or deadline was changed. These diagnostics
supply no ordinary merge acceptance.

Expected downstream work, not this increment: a validated API can reduce canvas
choreography in non-input setup. Native picking and gesture checks still test
native input. Undo remains design-only, and the command-bus program stays held.
