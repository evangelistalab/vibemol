# Selection and Build API reconnaissance

Measured unchanged main `d281e8f` using PR83's native CDP browser harness,
Chromium 156.0.8078.4, with settled presentation, no page errors and normal
browser/profile/server teardown. No production API or feature was added for
this reconnaissance.

Seven relevant live product facades expose **40 members / 33 functions**.
They cover file/session/structure transport, presets, Calculations, active UFF
and Figure. **None exposes incremental Edit selection or Build mutation.**
`VibeMolTesting` has 42 functions, of which the inventory explicitly names 28
Edit/Build-related functions. This is an enumeration of those surfaces, not a
count of all possible user operations.

| Capability | Existing route | Boundary |
| --- | --- | --- |
| Load files or restore a workspace | `VibeMolEmbed.loadFiles`, `VibeMolSession.import/importText` | Product API; whole-source/workspace transactions |
| Read/import active geometry | `VibeMolStructure.exportActive/exportActiveText/importFromText` | Product API; copied envelope and append/finalize import, not a granular edit command |
| Calculation atom focus | `VibeMolCalculations.state/selectAtoms/toggleAtom` | Product API; separate from Edit selection and orbital assignments |
| MINAO shell/component and plane assignments | `selectShell/selectComponent/addPlane`, `configure/export` | Product API; already reaches forte2 text/specification output |
| Optimize active structure | `VibeMolUFFLocal.optimizeActiveStructureWithUff` | Product global; not a general Build interface |
| Resolve catalog query or create a fragment instance | `VibeMolFragments.resolveCatalogQuery/buildCatalogInstance` | Pure product module; returns caller data, does not place into the app |
| Read/set Edit atom selection | `getEditSelectionIndices/Count`, `setEditSelectionIndices` | Testing only; active app mutation via private selection helper |
| Inspect Build payload, hit/ghost locations, bond/transform state | Enumerated testing readbacks and projections | Testing only; some values depend on transient UI/pointer state |
| Move selection by simulated drag | `performSelectionMoveDrag` | Testing only; private transform controller and pixel coordinates |
| Attach a fragment, activate a halo ghost, replace terminal H | Testing attachment/halo/replacement functions | Testing only; requires pre-existing private payload, anchor and placement state |
| Copy/paste current Edit selection | Testing clipboard functions | Testing only; native clipboard/UI preconditions, not a portable mutation contract |
| Choose active atom/fragment/molecule payload | `setEditAddElement/Fragment/Molecule` | Private app wiring |
| Place standalone atoms/molecules or commit a fused ring | App/placement controller start/commit functions | Private live controller; public factory is not its active instance |
| Create/change/delete bonds, delete atoms, numeric transforms | Bond/placement/transform controllers and app handlers | Private live state and UI wiring |
| Apply coordination/metal preferences; structural Undo/Redo | App/edit-state controller paths | Private live state; pure StructureCore helpers operate on caller-owned volumes |

Native receipts separately confirm supported workspace import, copied structure
export, Testing Edit selection `[0]`, supported Calculation atom focus and a real
MINAO component assignment, plus pure fusionphenyl query/instantiation. The pure
fragment calls leave active atom count at 3. `selectAtoms` alone creates focus,
not MINAO assignments; the component call is necessary to produce nonempty AVAS
specifications. These distinctions were measured rather than inferred from names.

## Consequence for the two proposed consumers

The forte2 export substrate already has a live supported Calculations interface.
Feeding it a structure is supported through file, structure or session import.
AI-driven incremental construction has useful primitives and testing examples,
but no supported active-app selection/placement transaction boundary today.
Calling a public controller factory does not solve that: its app dependencies
and active instance are private. Testing hooks can demonstrate reachability but
should not be presented as a supported user API.

Preset builder extensions restore/prune operation annotations on existing atoms;
they do not replay placement to construct geometry. Native CDP can also drive
ordinary controls; that is UI automation rather than an active geometry API.

Whole-structure import can express a resulting molecule, including bonds and
annotations. It does not provide incremental selection, placement intent,
existing-scene targeting, cancellation, validation/readback or history semantics.
Those remain product contract questions if an incremental interface is proposed.
No such interface, command bus, interchange feature or Undo implementation is
authorized or built by this reconnaissance.

The native probe is finite, not a combinatorial Build test or merge gate. Export
enumeration alone does not establish semantic support; the live invocation bodies
and factory/instance distinction were cross-checked. Exact member lists and
receipts: `tests/baselines/selection-build-api-reachability.json`.
