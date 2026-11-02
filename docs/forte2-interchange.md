# forte2 export and CAS selection

The Subspace panel's **Complete active space (CAS)** method accepts total active electrons and active orbitals. RHF and ROHF count spatial orbitals. ROHF includes all singly occupied orbitals in both totals, for either sign of `ms`; the remaining electrons must form pairs. GHF counts spinors directly, without doubling. The other selection methods retain their existing spatial-pair convention for GHF.

This targets [forte2 PR283](https://github.com/evangelistalab/forte2/pull/283), merged at `e03c169bdf1b2aac62ea4197cd0ffa1b875d3b9f`. Generated input emits a Python tuple, for example `cas=(8, 6)`, and omits other selector-specific arguments. It never emits `selection_method="cas"`: forte2 accepts the tuple and internally selects its separate-count algorithm. A MINAO preview is not an SCF MO count. VibeMol checks integer types, electron capacity, spin parity, inclusion of singly occupied orbitals and occupied-electron availability; forte2 must check actual virtual-orbital availability after building the reference. The panel reports this deferred check. A zero occupied or virtual sector is allowed when forte2 allows it, with a warning.

For the same upstream target, negative-ms ROHF separate counts now use the absolute singly occupied count. The old signed-ms rejection is obsolete. Generated GHF input supplies `System(x2c=X2CParams(x2c_type="so"))`; it does not change the speed of light or add an SNSO approximation. These are explicit target-compatibility changes, not claims that old forte2 behaved incorrectly.

## Export-only product API

`VibeMolForte2.export(request)` returns `{ok, value, mutation: {state: 'none'}}`, or `{ok: false, error, mutation: {state: 'none'}}`. Errors include a code, path and actual/expected comparands. Results and their nested arrays are frozen, owned copies. No selection, structure, MINAO assignment, source buffer or session setting is written. There is no import or calculation execution.

```js
const context = VibeMolEdit.context().value;
const result = VibeMolForte2.export({
  system: {systemId: context.systemId, fingerprint: context.fingerprint},
  fragment: {kind: 'labels', labels: ['C1', 'C3']},
  avas: {planes: [{kind: 'piPlane', seed: {kind: 'element', element: 'C'}}]}
});
```

At least one of `fragment` and `avas` is required. `system` is optional; when supplied, it must match the current target. `fragment` uses the validated Edit predicates: `all`, `ids`, `labels`, `element`, fragment `owned`/`footprint`, connected `component`, `union`, `intersection`, `difference` and `piPlane`. These materialize an ASET atom set in the exact exported geometry. ASET's `fragment` means an atom set, not a Build catalog entry. Element-relative labels and ranges are one-based, preserving source atom order.

`avas: {}` exports current MINAO/Calculations shell and component assignments and current π planes. Atom focus alone is not an orbital assignment. Optional `avas.planes` must be explicit top-level `piPlane` predicates; their SVD plane fit uses the existing non-collinearity and 0.1 Å RMS contract. Every member must have a whole p shell, without conflicting partial components. `planes: []` removes planes from the exported copy only. Duplicate planes fail. Orbital-type `subspace` is always derived from MINAO; this API does not accept arbitrary orbital strings or filter scientific assignments through an Edit selection.

The output contains Angstrom geometry, stable atom IDs and labels, ASET/AVAS keyword data, CAS partition diagnostics, reference settings when exporting AVAS, app/backend provenance, and Python `xyz`, `aset_kwargs` and `avas_kwargs` definitions. The Python representation, including the tuple, is authoritative when passing these values to forte2. JSON's CAS array is descriptive transport data; passing that list directly as forte2's `cas` would be invalid. This is input preparation, not a complete SCF/ASET execution recipe. The existing Subspace **Copy input** action still generates the complete AVAS calculation script.

Calculations and Edit may hold different record objects. Export compares their complete ordered atom IDs, atomic numbers and coordinates and rejects differing geometry (`GEOMETRY_TARGET_MISMATCH`). It never remaps by proximity or ordinal. Normalization and pruning run on a copy; any lost assignment, plane or option fails (`AVAS_SELECTION_SHORTFALL` / `AVAS_SETTINGS_SHORTFALL`). Stale fingerprints, busy interactions, missing atoms/elements, invalid ordinals, invalid planes and invalid AVAS/CAS settings fail before producing an export. No structural-write operation is involved; a stable trajectory or volumetric source may supply its current geometry.

## Verification and scope

The shared formatter/controller has 12 inputs (five host inputs and seven named helpers), under the limit of 15. The MINAO snapshot bridge has four closure inputs: `measurementRecord`, `calculationsModel`, `editApiDifference`, `editApiFault`. It uses one existing owner rather than duplicating its scientific logic. The input inventory is checked by `tools/audit-forte2.cjs`, and construction order by the standing inverse audit.

`tools/diagnostics/forte2_cas_oracle.py` regenerates the committed oracle from an exact pinned, source-hash-checked local forte2 checkout. It refuses another revision. The CAS arithmetic is compared to 1,428 executions of the exact upstream parameter checker (453 accepted) with synthetic SCF metadata, not a calculation. Existing non-CAS scripts are checked byte-for-byte, with only the two compatibility changes above declared. The native phase declares 68 checkpoints before CI: 30 in each Workbench theme and four export/API checks in each legacy theme. The native Subspace panel belongs to Workbench; the legacy API checks do not pretend that a legacy Subspace launcher exists. The suite, worker and join independently assert this composition. Each fresh context is retired; zero residual contexts is required.

Authoring failures remain in ignored artifacts: the initial CAS session save exposed the scalar-only session validator; the initial four-layout UI matrix incorrectly expected a legacy Subspace panel. The session validator now allows precisely a two-number `cas` pair and rejects unrelated arrays. These diagnostics are not ordinary-gate evidence.

The default capture DOM and options remain unchanged until CAS is selected. Two new namespaces are declared for CI recording: `VibeMolForte2Format` with two members and `VibeMolForte2` with one. The recorder must prove exactly 204 namespace additions / 306 member strings across 102 captures, with zero other changed values. No tolerance, version mapping or comparison exception is added.

Undo remains design-only. Remaining Testing wrapper conversions remain held, including the isolated fragment-cue behavior review. No existing native-click suite is converted to the new selection API; reduced canvas choreography is downstream work.
