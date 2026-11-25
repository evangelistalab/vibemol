# Camera refit inventory for 0.10.17

Base: `d0c3c85a` (0.10.16). The behavior in the last column is the proposed
behavior. This inventory groups entry paths that share a camera owner.

## A. New content and initial view

| Trigger | Owner | 0.10.16 | 0.10.17 |
| --- | --- | --- | --- |
| App startup | `app.js`, camera and OrbitControls initialization | Initialize the empty view at (6, 6, 6), facing the origin with z-up. | Keep. |
| Open, drop or command-load a file into a new scene | `app.js` `handleSceneDropRecords`; `file-loader.js` `finalizeLoadedVolumes` and `app.js` `activateVolumeIndex` in the legacy interface | Reveal the load target before fitting visible bounds. Workbench preserves the pose for a same-scene import unless the caller explicitly requests otherwise. | Keep. |
| Open a bundled sample or demo | `file-loader.js` `loadSampleCube` and `loadBundledVolumeSet`; `app.js` `loadDemo` | Use the file-load fit, or activate the new demo volume directly. | Keep. |
| Start a tutorial scene | `app.js`, `vm-tutorial-ready` `load` callback | Load into a new scene, switch to View, then explicitly fit. | Keep. |
| Place the first atom or molecule in an empty enabled Edit scene | `edit-placement.js` `appendAtomAtWorld` and `commitMoleculePlacement`; `app.js` `beginGestureAddedAtomOperatorSession` | Rebuild and fit the empty-to-populated scene. Single-atom Build paths allow room for first bonds and the halo. Edits to populated scenes preserve the pose. | Keep. |
| Enter Edit or navigate to a hidden Edit target | `app.js` `setMode`, `setSceneHeaderActive` and `setActiveSceneGraphLayer` through `prepareOutlinerEditTarget` | Reveal and fit the hidden target. Existing visible targets preserve the pose. | Keep the hidden-target fit. |

The load, reveal and first-atom fits pass through `rebuildScene`,
`applyCameraStrategy`, `fitCameraToScene` and `applySceneCameraFit`.
`applyCameraStrategy` remembers the fitted view for Reset view.

## B. Automatic surface and mode fits to remove

| Trigger | Owner | 0.10.16 | 0.10.17 |
| --- | --- | --- | --- |
| Show the first orbital from the Orbitals panel | `app.js` `requestMoldenOrbitalRender` | Refits the first surface. It preserves orientation and resets target and distance. | Keep rendering and preserve the view. |
| Select the first visible orbital from the outliner row | `app.js` `setActiveSceneGraphLayer` | Refits the first Molden surface while keeping orientation. | Preserve the view. Keep the rebuild when geometry needs updating and retain the separate Edit-target reveal fit. |
| Show the first orbital with the outliner layer eye | `scene-outliner.js` `buildOutlinerRow` eye handler | Refits to canonical orientation when the first orbital becomes effectively visible. The group eye already preserves the view. | Rebuild with the view preserved for either eye. |
| Show the first orbital with `orbitals.show` | `app.js` `showProductOrbitals` → `presentMoldenProductSelection` | The first visible layer refits without `keepOrientation`. Later shows avoid the fit when another cube is visible. `orbitals.hide` already preserves the view. | Preserve the view for every show and hide. |
| Enter or leave Measure while suppressing surfaces | `app.js` `setMode` and `restoreMeasurementSurfaceView` | Saves the view when entering from surface context, schedules `frameMeasurementAtoms`, and can restore the previous view on return to View. | Keep surface suppression and panel behavior. Remove auto framing and its saved view. |
| Toggle Measurements → Show surfaces | `app.js`, `measurementsPanel` `setShowSurfaces` callback | Frames atoms on hide and restores the saved pose on show. | Only reconcile visibility, deferred geometry and panel state. |
| Enter or leave Calculations | `app.js` `setMode` | Saves the pose, schedules `frameMeasurementAtoms`, and can restore the pose on return to View. | Keep mode and panel behavior. Remove auto framing and its saved view. |
| Use `view.setMode`, including widget `set_mode` | `commands.js` → `app.js` `setProductMode` → `setMode` | Calls the same switch and waits two animation frames for its deferred fit. | Resolve once the mode is applied. Keep the response shape and the independent hidden Edit-target reveal. |

`keepOrientation` was supplied only by the panel and outliner-row paths.
Load, reset, explicit Frame atoms, `view.set`, Batch export and Figure do not
request it. Frame atoms preserves orientation separately by saving the
direction and up vector in `frameMeasurementAtoms`.

## C. Explicit view actions

| Trigger | Owner | 0.10.16 | 0.10.17 |
| --- | --- | --- | --- |
| Orbit by pointer or touch | `app.js` `applyQuaternionViewOrbit` | Rotate the camera and up vector around the target. | Keep. |
| Zoom or pan by wheel, drag or touch | `orbit-controls.global.js` `OrbitControls`; `app.js` `render` | Update the camera distance, orthographic zoom or target with damping. | Keep. |
| Turn on Auto rotate | `app.js` Auto rotate control and `render`; `OrbitControls.update` | Continue the explicitly enabled orbit on animation frames. | Keep. |
| Change camera or target fields, apply view settings through a preset | `app.js`, camera/target input handlers and `registerPresetSetting` for `view.camera.*` and `view.target.*` | Apply specified components. | Keep. |
| Switch projection | `app.js` `setProjectionMode` | Copy the pose into the chosen camera and update projection. | Keep. |
| Reset view | `app.js` `viewReset.onclick` | Restore the scene's remembered default. Fit if there is no default. | Keep the handler. Showing an orbital will no longer overwrite the load-time default. |
| Snap to an axis | `axis-gizmo.js` → `app.js` `setCameraAxisPreset` | Change direction and up while preserving target and distance. | Keep. |
| Point camera at the molecule's center of mass | `app.js` `pointCameraAtActiveMoleculeMassCenter` | Update OrbitControls' target to the center of mass. | Keep. |
| Frame atoms from Measurements | `measurements-panel.js` frame action → `app.js` `frameMeasurementAtoms` | Fit atom bounds while preserving direction and up. | Keep. |
| Reset to defaults | `app.js` `resetAppOptions` → `resetVisualizationOptions` | Apply app defaults and fit the rebuilt scene. | Keep. |
| Open a session or recovery snapshot | `session.js` and session recovery → `app.js` `applySessionState` → `restoreSessionView` | Apply saved projection, position, target, up, quaternion, zoom and FOV. On transaction failure, restore the prior view. | Keep. |
| Execute `view.set` | `commands.js` → `app.js` `setProductView` | Apply projection, optional fit and optional axis snap in the existing order. | Keep. |

## D. Export-only camera transactions

| Trigger | Owner | 0.10.16 | 0.10.17 |
| --- | --- | --- | --- |
| Batch export | `app.js` `batchBtn.onclick` and `scene-export.js` `exportTargets` | Fit each export target and restore the previous graph and pose. | Keep. |
| Figure composer and runner | `figure-renderer.js` `prepare`, `applyLocked`, `projection` and `restore` | Lock the current view or fit union bounds for export, then restore the original state. | Keep. |
| `view.snapshot` | `app.js` `captureViewportPng` | Temporarily apply projection for the export dimensions and restore the viewport and camera. No scene fit. | Keep. |

Normal rendering also updates viewport projection and depth clipping in
`app.js` `updateActiveCameraProjection` and `view-utils.js`'s depth
controller. These are distinct from changing the camera pose or zoom on
mode or visibility changes. That behavior is retained.
