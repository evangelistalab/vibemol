# Atom coordinate transforms and vector state

The owners below were inventoried on the VibeMol 0.10.14 code used by Step 3b. Follow the actual atom writes and their transaction boundaries. Positions used for grid-only operations, previews, and camera motion are separate from the live atom coordinates.

## Rigid paths

| Entry | Coordinate owner | Transform available at the write |
| --- | --- | --- |
| COM → Origin, View and Quick actions | `app.js` · `centerActiveMoleculeMassAtOrigin`, `translateVolumetricGrid` | Whole-structure translation by `[-comX, -comY, -comZ]` in native units. Convert the delta to Å for free point origins. |
| Align principal axes, View and Quick actions | `app.js` · `alignActiveMoleculePrincipalAxes`, `applyBasisRowsToVector`, `rotateVolumetricGridAboutPoint` | Whole-structure rotation by the exact inertia basis rows about the native COM. The same basis applies to components and the point origin in Å. |
| Edit axis gizmo or free move, including the operator cue | `edit-transform.js` · `startMoveDrag`, `updateMoveDrag`, `finishMoveDrag`, `cancelMoveDrag` | Translation by the ray/drag-plane delta in Å, projected onto an axis for an axis drag. The target indices and initial positions are captured at pointer-down. |
| Edit absolute selection position / COM fields | `edit-transform.js` · `setSelectionPosition` | One-axis translation of the selected IDs by the new field value minus the previous selection coordinate in Å. |
| Position fields for an existing atom and attached hydrogens | `edit-placement.js` · `setAddAtomOperatorWorldPosition`, `translateAtomsByWorldDelta`, `finalizeAddAtomOperatorSession`. The selection entry point is `app.js` · `beginSelectedAtomManipulationOperatorSession`. | Existing-atom branch applies the same exact `deltaWorld` to the atom and the elected directly bonded hydrogens. The add-atom branch belongs to Build. |
| Edit constrained ring or free rotation | `edit-transform.js` · `buildRotateBaseline`, `startRotateDrag`, `updateRotateDrag`, `applyRotateQuaternion`, `finishRotateDrag`, `cancelRotateDrag` | Rotate the baseline selection by the same normalized quaternion about `startCenterWorld` in Å. The selection scope and world pivot are already retained through commit/cancel. |
| Transform bond-side angle, free 3D, bond-axis and view-axis rotation | `app.js` · `beginTransformDragFromResolvedTarget`, `updateTransformDragFromEvent`, `applyTransformWorldPositions`, `applyTransformGridRotation`, `finalizeTransformDrag` | Rotate baseline positions by `transformRotateAccumulatedQuaternion` about `transformPivotWorld`. The quaternion is built by either exact incremental axis rotation or the existing direction-to-direction calculation. |
| Transform bond-side distance | `app.js` · `updateTransformDragFromEvent`, `applyTransformWorldPositions` | Translate the selected side by the bond axis times the difference between the clamped bond length and its initial length. Components stay unchanged. |
| Reposition existing ligands on coordination-geometry change | `app.js` · `describeMetalLigandMoves`, `applyAtomCoordinationChoice` | Several disjoint rotations about the metal center. The planner computes a quaternion per ligand from the old and fitted site directions. The metal remains fixed. |
| Validated Edit API translate | `app.js` · `createEditApiBuildService` (`translate`), `createEditApiCommitter`, `editApiHistory` | The planner validates `delta` in Å and resolves the in-app atom IDs before committing the canonical candidate. Only a whole-structure translation moves a free point origin. |

## Other coordinate writes

| Entry | Owner | Classification |
| --- | --- | --- |
| UFF and local relaxations | `app.js` · `optimizeActiveStructureWithUff`, `relaxHydrogensLocallyInVolume`. Coordinate writes are in `uff-adapter.js` · `optimizeVolumeWithUFF`. | Non-rigid geometry changes. |
| Symmetrize | `app.js` · `applySymmetryPreviewToTarget`, `applyActiveSymmetryPreview` | Non-rigid point projection with preview and rollback. |
| Per-atom coordinate table typing | `app.js` · `applyCoordsPopoverEdit` | Independent atom edits. |
| Build, fragment/molecule placement and hydrogen adjustment | `edit-placement.js` · `commitMoleculePlacement`, `appendAtomAtWorld`, `appendFragmentAtWorld`; `app.js` · `applyLocalFragmentCleanup`, `applyMethylAttachmentGeometry`, `applyHydroxylAttachmentGeometry`, `applyAutomaticHydrogenAdjustmentToVolume` | Topology changes and locally independent coordinates. Rotation of a template while positioning new atoms is part of placement. |
| Cleanup helpers following a Transform gesture | `app.js` · `applyLocalTransformCleanup`, `cleanupTransformedBondLengths`, `cleanupTransformedOverlapRelief` | Non-rigid cleanup. The rigid gesture owns the rotation before its cleanup. |
| Delete, replace and restore topology | `app.js` · `deleteAtomAtIndex`, `deleteSelectedAtoms`, `removeAtomsById`, `replaceGestureTerminalHydrogenFromAnchor`; `edit-state.js` · `applyRecordSpatialState` | Structure changes or snapshot restoration. Vector storage uses stable IDs. |
| Load / capture restore, trajectory playback and vibration | `app.js` · `applyAtomCoordinateFrame`; `trajectory-playback.js` · `applyTrajectoryFrameForInfo`; `session.js` | Replaces coordinates or restores stored state. There is no common rigid transform to apply to stored vectors. |
