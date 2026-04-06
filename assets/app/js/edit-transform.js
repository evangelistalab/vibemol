(function (global) {
  'use strict';

  function createEditTransformController(options = {}) {
    const THREE = options.THREE;
    const state = options.state || {};
    const MODES = options.MODES || { EDIT: 'edit' };
    const getMode = typeof options.getMode === 'function' ? options.getMode : (() => '');
    const getActiveRecord = typeof options.getActiveRecord === 'function' ? options.getActiveRecord : (() => null);
    const getSelection = typeof options.getSelection === 'function' ? options.getSelection : (() => []);
    const setSelection = typeof options.setSelection === 'function' ? options.setSelection : (() => {});
    const getAtomGroup = typeof options.getAtomGroup === 'function' ? options.getAtomGroup : (() => null);
    const getBondGroup = typeof options.getBondGroup === 'function' ? options.getBondGroup : (() => null);
    const getCamera = typeof options.getCamera === 'function' ? options.getCamera : (() => null);
    const getControls = typeof options.getControls === 'function' ? options.getControls : (() => null);
    const atomUnitsToAng = typeof options.atomUnitsToAng === 'function' ? options.atomUnitsToAng : (() => new THREE.Vector3());
    const worldToAtomUnits = typeof options.worldToAtomUnits === 'function' ? options.worldToAtomUnits : (() => [0, 0, 0]);
    const ensureVolumeAtomIds = typeof options.ensureVolumeAtomIds === 'function' ? options.ensureVolumeAtomIds : (() => {});
    const ensureAtomId = typeof options.ensureAtomId === 'function' ? options.ensureAtomId : ((atom) => String(atom && atom.id || ''));
    const cloneAtomsSnapshot = typeof options.cloneAtomsSnapshot === 'function' ? options.cloneAtomsSnapshot : (() => []);
    const cloneBondSnapshot = typeof options.cloneBondSnapshot === 'function' ? options.cloneBondSnapshot : (() => []);
    const atomsSnapshotsEqual = typeof options.atomsSnapshotsEqual === 'function' ? options.atomsSnapshotsEqual : (() => false);
    const pushEditHistoryEntry = typeof options.pushEditHistoryEntry === 'function' ? options.pushEditHistoryEntry : (() => {});
    const rebuildBondsFromAtoms = typeof options.rebuildBondsFromAtoms === 'function' ? options.rebuildBondsFromAtoms : (() => {});
    const updateBondsInPlace = typeof options.updateBondsInPlace === 'function' ? options.updateBondsInPlace : (() => {});
    const rebuildScene = typeof options.rebuildScene === 'function' ? options.rebuildScene : (() => {});
    const updateSelectionVisuals = typeof options.updateSelectionVisuals === 'function' ? options.updateSelectionVisuals : (() => {});
    const updateMoveGizmo = typeof options.updateMoveGizmo === 'function' ? options.updateMoveGizmo : (() => {});
    const updateRotateGizmo = typeof options.updateRotateGizmo === 'function' ? options.updateRotateGizmo : (() => {});
    const getSelectionCenterWorld = typeof options.getSelectionCenterWorld === 'function' ? options.getSelectionCenterWorld : (() => null);
    const setMoveHover = typeof options.setMoveHover === 'function' ? options.setMoveHover : (() => {});
    const setRotateHover = typeof options.setRotateHover === 'function' ? options.setRotateHover : (() => {});
    const clearGizmoHover = typeof options.clearGizmoHover === 'function' ? options.clearGizmoHover : (() => {});
    const renderRibbon = typeof options.renderRibbon === 'function' ? options.renderRibbon : (() => {});
    const isEditMode = typeof options.isEditMode === 'function' ? options.isEditMode : (() => false);
    const setRaycasterFromEvent = typeof options.setRaycasterFromEvent === 'function' ? options.setRaycasterFromEvent : (() => {});
    const getRaycaster = typeof options.getRaycaster === 'function' ? options.getRaycaster : (() => null);

    function buildHistoryLabel(kind, count) {
      const safeCount = Math.max(0, Number(count) || 0);
      if (kind === 'rotate') return safeCount > 1 ? `Rotate ${safeCount} atoms` : 'Rotate atom';
      return safeCount > 1 ? `Move ${safeCount} atoms` : 'Move atom';
    }

    function clearRotateBaseline() {
      state.rotateOperatorBaseline = null;
    }

    function buildSelectionKey(record, vol, indices) {
      if (!record || !vol || !Array.isArray(indices) || !indices.length) return '';
      ensureVolumeAtomIds(vol);
      const ids = indices
        .map((idx) => (vol.atoms[idx] ? ensureAtomId(vol.atoms[idx]) : ''))
        .filter(Boolean);
      return `${String(record.title || '')}::${ids.join(',')}`;
    }

    function buildRotateBaseline() {
      const record = getActiveRecord();
      const vol = record && record.vol;
      const selection = getSelection();
      const canBuild = getMode() === MODES.EDIT
        && record
        && vol
        && selection.length;
      if (!canBuild) {
        clearRotateBaseline();
        return null;
      }
      const existing = state.rotateOperatorBaseline;
      const key = buildSelectionKey(record, vol, selection);
      if (existing
        && existing.record === record
        && existing.key === key
        && Array.isArray(existing.indices)
        && existing.indices.length === selection.length) {
        return existing;
      }
      const baseline = {
        record,
        vol,
        key,
        indices: selection.slice(),
        startWorldPositions: selection.map((idx) => {
          const atomGroup = getAtomGroup();
          const mesh = atomGroup && atomGroup.children ? atomGroup.children[idx] : null;
          return mesh && mesh.position ? mesh.position.clone() : atomUnitsToAng(vol, vol.atoms[idx]);
        }),
        startCenterWorld: getSelectionCenterWorld(selection, vol) || new THREE.Vector3(),
        beforeAtoms: cloneAtomsSnapshot(vol),
        beforeBonds: cloneBondSnapshot(vol),
      };
      baseline.currentQuaternion = new THREE.Quaternion();
      state.rotateOperatorBaseline = baseline;
      return baseline;
    }

    function ensureRotateBaseline() {
      return buildRotateBaseline();
    }

    function resetRotateBaseline() {
      clearRotateBaseline();
      return ensureRotateBaseline();
    }

    function applyRotateQuaternion(rotation) {
      const baseline = ensureRotateBaseline();
      if (!baseline || !rotation || !rotation.isQuaternion) return false;
      const nextRotation = rotation.clone().normalize();
      const vol = baseline.vol;
      const atomGroup = getAtomGroup();
      for (let i = 0; i < baseline.indices.length; i += 1) {
        const idx = baseline.indices[i];
        const worldPos = baseline.startWorldPositions[i].clone()
          .sub(baseline.startCenterWorld)
          .applyQuaternion(nextRotation)
          .add(baseline.startCenterWorld);
        const mesh = atomGroup && atomGroup.children ? atomGroup.children[idx] : null;
        if (mesh && mesh.position) mesh.position.copy(worldPos);
        const atom = vol && Array.isArray(vol.atoms) ? vol.atoms[idx] : null;
        if (atom) {
          const coords = worldToAtomUnits(vol, worldPos);
          atom.x = coords[0];
          atom.y = coords[1];
          atom.z = coords[2];
        }
      }
      baseline.currentQuaternion.copy(nextRotation);
      const bondGroup = getBondGroup();
      if (bondGroup && bondGroup.children && bondGroup.children.length) updateBondsInPlace();
      updateSelectionVisuals();
      updateMoveGizmo();
      updateRotateGizmo();
      return true;
    }

    function startMoveDrag(e, indices, anchorWorld, dragOptions = {}) {
      const record = getActiveRecord();
      const vol = record && record.vol;
      const targetIndices = Array.from(new Set((Array.isArray(indices) ? indices : [])
        .map((idx) => Number(idx) | 0)
        .filter((idx) => idx >= 0 && vol && Array.isArray(vol.atoms) && idx < vol.atoms.length)));
      if (!vol || !targetIndices.length || !anchorWorld) return false;
      state.dragActive = true;
      state.dragAtomIndex = targetIndices[0] | 0;
      state.dragTargetIndices = targetIndices.slice();
      state.dragStartWorldPositions = targetIndices.map((idx) => {
        const atomGroup = getAtomGroup();
        const mesh = atomGroup && atomGroup.children ? atomGroup.children[idx] : null;
        return mesh && mesh.position ? mesh.position.clone() : atomUnitsToAng(vol, vol.atoms[idx]);
      });
      state.dragPivotWorld = getSelectionCenterWorld(targetIndices, vol) || anchorWorld.clone();
      state.dragPivotStartWorld = state.dragPivotWorld.clone();
      state.dragStartPos = anchorWorld.clone();
      state.dragOrigMeshPos = anchorWorld.clone();
      state.dragOrigAtomUnits = null;
      state.dragBeforeAtomsSnapshot = cloneAtomsSnapshot(vol);
      state.dragBeforeBondSnapshot = cloneBondSnapshot(vol);
      const camera = getCamera();
      const raycaster = getRaycaster();
      if (!camera || !raycaster) return false;
      const startClientX = Number.isFinite(Number(dragOptions.startClientX)) ? Number(dragOptions.startClientX) : (Number(e && e.clientX) || 0);
      const startClientY = Number.isFinite(Number(dragOptions.startClientY)) ? Number(dragOptions.startClientY) : (Number(e && e.clientY) || 0);
      const startRayEvent = {
        clientX: startClientX,
        clientY: startClientY,
      };
      if (e && e.hitPoint && e.hitPoint.isVector3) startRayEvent.hitPoint = e.hitPoint;
      const normal = new THREE.Vector3();
      camera.getWorldDirection(normal);
      state.dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, anchorWorld);
      setRaycasterFromEvent(startRayEvent);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(state.dragPlane, hit)) state.dragPlaneStart = hit.clone();
      else state.dragPlaneStart = anchorWorld.clone();
      state.dragAxis = dragOptions.axis === 'x' || dragOptions.axis === 'y' || dragOptions.axis === 'z' ? dragOptions.axis : 'none';
      const controls = getControls();
      try { if (controls) controls.enabled = false; } catch { }
      setMoveHover(state.dragAxis === 'none' ? '' : state.dragAxis);
      updateMoveGizmo();
      return true;
    }

    function updateMoveDrag(e) {
      if (!state.dragActive) return false;
      const raycaster = getRaycaster();
      if (!raycaster) return false;
      setRaycasterFromEvent(e);
      const hit = new THREE.Vector3();
      let delta = null;
      if (state.dragPlane && raycaster.ray.intersectPlane(state.dragPlane, hit)) {
        const move = hit.clone().sub(state.dragPlaneStart);
        if (state.dragAxis !== 'none') {
          const ax = state.dragAxis === 'x'
            ? new THREE.Vector3(1, 0, 0)
            : (state.dragAxis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1));
          delta = ax.multiplyScalar(move.dot(ax));
        } else {
          delta = move;
        }
      }
      if (!delta) return false;
      const record = getActiveRecord();
      const vol = record && record.vol;
      const atomGroup = getAtomGroup();
      if (vol && state.dragTargetIndices.length && state.dragStartWorldPositions.length === state.dragTargetIndices.length) {
        for (let i = 0; i < state.dragTargetIndices.length; i += 1) {
          const idx = state.dragTargetIndices[i];
          const startWorld = state.dragStartWorldPositions[i];
          const newPos = startWorld.clone().add(delta);
          const mesh = atomGroup && atomGroup.children ? atomGroup.children[idx] : null;
          if (mesh && mesh.position) mesh.position.copy(newPos);
          const atom = vol.atoms[idx];
          if (atom) {
            const arr = worldToAtomUnits(vol, newPos);
            atom.x = arr[0];
            atom.y = arr[1];
            atom.z = arr[2];
          }
        }
        if (state.dragPivotStartWorld) state.dragPivotWorld = state.dragPivotStartWorld.clone().add(delta);
        const bondGroup = getBondGroup();
        if (bondGroup && bondGroup.children && bondGroup.children.length) rebuildBondsFromAtoms();
      }
      updateMoveGizmo();
      updateSelectionVisuals();
      return true;
    }

    function finishMoveDrag() {
      const wasDragging = !!state.dragActive;
      if (!wasDragging) return false;
      const record = getActiveRecord();
      const vol = record && record.vol;
      const afterAtoms = vol ? cloneAtomsSnapshot(vol) : null;
      if (record && state.dragBeforeAtomsSnapshot && afterAtoms && !atomsSnapshotsEqual(state.dragBeforeAtomsSnapshot, afterAtoms)) {
        pushEditHistoryEntry(record, state.dragBeforeAtomsSnapshot, afterAtoms, buildHistoryLabel('move', state.dragTargetIndices.length), {
          beforeBonds: Array.isArray(state.dragBeforeBondSnapshot) ? state.dragBeforeBondSnapshot : [],
          afterBonds: vol ? cloneBondSnapshot(vol) : [],
        });
      }
      rebuildScene({ preserveView: true });
      state.dragActive = false;
      state.dragAtomIndex = -1;
      state.dragTargetIndices = [];
      state.dragStartWorldPositions = [];
      state.dragPivotWorld = null;
      state.dragPivotStartWorld = null;
      state.dragPlane = null;
      state.dragPlaneStart = null;
      state.dragStartPos = null;
      state.dragOrigMeshPos = null;
      state.dragOrigAtomUnits = null;
      state.dragBeforeAtomsSnapshot = null;
      state.dragBeforeBondSnapshot = null;
      state.dragAxis = 'none';
      const controls = getControls();
      try { if (controls) controls.enabled = true; } catch { }
      if (isEditMode()) renderRibbon('edit');
      setMoveHover('');
      updateMoveGizmo();
      updateSelectionVisuals();
      return true;
    }

    function cancelMoveDrag() {
      state.dragActive = false;
      state.dragAtomIndex = -1;
      state.dragTargetIndices = [];
      state.dragStartWorldPositions = [];
      state.dragPivotWorld = null;
      state.dragPivotStartWorld = null;
      state.dragPlane = null;
      state.dragPlaneStart = null;
      state.dragStartPos = null;
      state.dragOrigMeshPos = null;
      state.dragOrigAtomUnits = null;
      state.dragAxis = 'none';
      state.dragBeforeAtomsSnapshot = null;
      state.dragBeforeBondSnapshot = null;
      const controls = getControls();
      try { if (controls) controls.enabled = true; } catch { }
      setMoveHover('');
      updateMoveGizmo();
      return true;
    }

    function startRotateDrag(e, indices, dragOptions = {}) {
      const baseline = ensureRotateBaseline();
      const targetIndices = Array.from(new Set((Array.isArray(indices) ? indices : []).map((idx) => Number(idx) | 0).filter((idx) => idx >= 0)));
      if (!baseline || !targetIndices.length) {
        return false;
      }
      const startClientX = Number.isFinite(Number(dragOptions.startClientX)) ? Number(dragOptions.startClientX) : (Number(e && e.clientX) || 0);
      const startClientY = Number.isFinite(Number(dragOptions.startClientY)) ? Number(dragOptions.startClientY) : (Number(e && e.clientY) || 0);
      const startRayEvent = {
        clientX: startClientX,
        clientY: startClientY,
      };
      if (e && e.hitPoint && e.hitPoint.isVector3) startRayEvent.hitPoint = e.hitPoint;
      state.rotateDragActive = true;
      state.rotateDragAxis = dragOptions.axis === 'x' || dragOptions.axis === 'y' || dragOptions.axis === 'z' ? dragOptions.axis : 'none';
      state.rotateDragPlane = null;
      state.rotateDragStartDir = null;
      state.rotateDragLastClientX = startClientX;
      state.rotateDragLastClientY = startClientY;
      if (state.rotateDragAxis !== 'none') {
        const axisWorld = state.rotateDragAxis === 'x'
          ? new THREE.Vector3(1, 0, 0)
          : (state.rotateDragAxis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1));
        state.rotateDragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(axisWorld, baseline.startCenterWorld);
        const raycaster = getRaycaster();
        setRaycasterFromEvent(startRayEvent);
        const planeHit = new THREE.Vector3();
        if (!raycaster || !raycaster.ray.intersectPlane(state.rotateDragPlane, planeHit)) {
          state.rotateDragActive = false;
          state.rotateDragAxis = 'none';
          return false;
        }
        const startDir = planeHit.clone().sub(baseline.startCenterWorld);
        startDir.addScaledVector(axisWorld, -startDir.dot(axisWorld));
        if (startDir.lengthSq() < 1e-10) {
          state.rotateDragActive = false;
          state.rotateDragAxis = 'none';
          return false;
        }
        state.rotateDragStartDir = startDir.normalize();
      }
      const controls = getControls();
      try { if (controls) controls.enabled = false; } catch { }
      setRotateHover(state.rotateDragAxis === 'none' ? '' : state.rotateDragAxis);
      updateRotateGizmo();
      return true;
    }

    function updateRotateDrag(e) {
      if (!state.rotateDragActive) return false;
      const baseline = ensureRotateBaseline();
      if (!baseline) return false;
      if (state.rotateDragAxis === 'x' || state.rotateDragAxis === 'y' || state.rotateDragAxis === 'z') {
        if (!state.rotateDragPlane || !state.rotateDragStartDir) return false;
        const axisWorld = state.rotateDragAxis === 'x'
          ? new THREE.Vector3(1, 0, 0)
          : (state.rotateDragAxis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1));
        const raycaster = getRaycaster();
        setRaycasterFromEvent(e);
        const planeHit = new THREE.Vector3();
        if (!raycaster || !raycaster.ray.intersectPlane(state.rotateDragPlane, planeHit)) return false;
        const currDir = planeHit.clone().sub(baseline.startCenterWorld);
        currDir.addScaledVector(axisWorld, -currDir.dot(axisWorld));
        if (currDir.lengthSq() < 1e-10) return false;
        currDir.normalize();
        const cross = new THREE.Vector3().crossVectors(state.rotateDragStartDir, currDir);
        const sin = cross.dot(axisWorld);
        const cos = THREE.MathUtils.clamp(state.rotateDragStartDir.dot(currDir), -1, 1);
        const angle = Math.atan2(sin, cos);
        if (Math.abs(angle) <= 1e-7) return false;
        const deltaQ = new THREE.Quaternion().setFromAxisAngle(axisWorld, angle);
        baseline.currentQuaternion.premultiply(deltaQ);
        state.rotateDragStartDir.copy(currDir);
        applyRotateQuaternion(baseline.currentQuaternion);
        return true;
      }
      const nextClientX = Number(e.clientX) || state.rotateDragLastClientX;
      const nextClientY = Number(e.clientY) || state.rotateDragLastClientY;
      const dx = nextClientX - state.rotateDragLastClientX;
      const dy = nextClientY - state.rotateDragLastClientY;
      state.rotateDragLastClientX = nextClientX;
      state.rotateDragLastClientY = nextClientY;
      if (Math.abs(dx) <= 1e-7 && Math.abs(dy) <= 1e-7) return false;
      const camera = getCamera();
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      if (camDir.lengthSq() < 1e-12) camDir.set(0, 0, -1);
      camDir.normalize();
      const camUp = camera.up.clone().normalize();
      if (camUp.lengthSq() < 1e-12) camUp.set(0, 1, 0);
      let camRight = new THREE.Vector3().crossVectors(camDir, camUp);
      if (camRight.lengthSq() < 1e-12) camRight = new THREE.Vector3(1, 0, 0);
      camRight.normalize();
      const deltaQ = new THREE.Quaternion()
        .setFromAxisAngle(camUp, dx * 0.01)
        .multiply(new THREE.Quaternion().setFromAxisAngle(camRight, dy * 0.01));
      baseline.currentQuaternion.premultiply(deltaQ);
      applyRotateQuaternion(baseline.currentQuaternion);
      return true;
    }

    function finishRotateDrag() {
      const wasDragging = !!state.rotateDragActive;
      if (!wasDragging) return false;
      const record = getActiveRecord();
      const vol = record && record.vol;
      const baseline = state.rotateOperatorBaseline;
      const afterAtoms = vol ? cloneAtomsSnapshot(vol) : null;
      if (record && baseline && Array.isArray(baseline.beforeAtoms) && afterAtoms && !atomsSnapshotsEqual(baseline.beforeAtoms, afterAtoms)) {
        pushEditHistoryEntry(record, baseline.beforeAtoms, afterAtoms, buildHistoryLabel('rotate', baseline.indices.length), {
          beforeBonds: Array.isArray(baseline.beforeBonds) ? baseline.beforeBonds : [],
          afterBonds: vol ? cloneBondSnapshot(vol) : [],
        });
      }
      rebuildScene({ preserveView: true });
      state.rotateDragActive = false;
      state.rotateDragAxis = 'none';
      state.rotateDragPlane = null;
      state.rotateDragStartDir = null;
      state.rotateDragLastClientX = 0;
      state.rotateDragLastClientY = 0;
      const controls = getControls();
      try { if (controls) controls.enabled = true; } catch { }
      resetRotateBaseline();
      if (isEditMode()) renderRibbon('edit');
      setRotateHover('');
      updateRotateGizmo();
      updateSelectionVisuals();
      return true;
    }

    function cancelRotateDrag() {
      state.rotateDragActive = false;
      state.rotateDragAxis = 'none';
      state.rotateDragPlane = null;
      state.rotateDragStartDir = null;
      state.rotateDragLastClientX = 0;
      state.rotateDragLastClientY = 0;
      clearRotateBaseline();
      const controls = getControls();
      try { if (controls) controls.enabled = true; } catch { }
      setRotateHover('');
      updateRotateGizmo();
      return true;
    }

    function clearAllTransformState() {
      clearRotateBaseline();
      cancelMoveDrag();
      cancelRotateDrag();
      clearGizmoHover();
      updateMoveGizmo();
      updateRotateGizmo();
    }

    return Object.freeze({
      ensureRotateBaseline,
      startMoveDrag,
      updateMoveDrag,
      finishMoveDrag,
      cancelMoveDrag,
      startRotateDrag,
      updateRotateDrag,
      finishRotateDrag,
      cancelRotateDrag,
      clearAllTransformState,
    });
  }

  global.VibeMolEditTransform = Object.freeze({
    createEditTransformController,
  });
})(window);
