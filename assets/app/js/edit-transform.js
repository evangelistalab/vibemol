(function (global) {
  'use strict';

  function createEditTransformController(options = {}) {
    const THREE = options.THREE;
    const state = options.state || {};
    const MODES = options.MODES || { EDIT: 'edit' };
    const EDIT_TOOL = options.EDIT_TOOL || { MOVE: 'move', ROTATE: 'rotate' };
    const getMode = typeof options.getMode === 'function' ? options.getMode : (() => '');
    const getEditTool = typeof options.getEditTool === 'function' ? options.getEditTool : (() => '');
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
    const updateMoveOperatorUi = typeof options.updateMoveOperatorUi === 'function' ? options.updateMoveOperatorUi : (() => {});
    const updateRotateOperatorUi = typeof options.updateRotateOperatorUi === 'function' ? options.updateRotateOperatorUi : (() => {});
    const getSelectionCenterWorld = typeof options.getSelectionCenterWorld === 'function' ? options.getSelectionCenterWorld : (() => null);
    const setRaycasterFromEvent = typeof options.setRaycasterFromEvent === 'function' ? options.setRaycasterFromEvent : (() => {});
    const getRaycaster = typeof options.getRaycaster === 'function' ? options.getRaycaster : (() => null);
    const pickMoveHit = typeof options.pickMoveHit === 'function' ? options.pickMoveHit : (() => null);
    const pickRotateHit = typeof options.pickRotateHit === 'function' ? options.pickRotateHit : (() => null);
    const setMoveHover = typeof options.setMoveHover === 'function' ? options.setMoveHover : (() => {});
    const setRotateHover = typeof options.setRotateHover === 'function' ? options.setRotateHover : (() => {});
    const clearGizmoHover = typeof options.clearGizmoHover === 'function' ? options.clearGizmoHover : (() => {});
    const beginViewRotate = typeof options.beginViewRotate === 'function' ? options.beginViewRotate : (() => {});
    const setEditClickIndex = typeof options.setEditClickIndex === 'function' ? options.setEditClickIndex : (() => {});
    const setEditMoved = typeof options.setEditMoved === 'function' ? options.setEditMoved : (() => {});
    const getEditMoved = typeof options.getEditMoved === 'function' ? options.getEditMoved : (() => false);
    const clearEmptyClickSelection = typeof options.clearEmptyClickSelection === 'function' ? options.clearEmptyClickSelection : (() => false);
    const setHintMessage = typeof options.setHintMessage === 'function' ? options.setHintMessage : (() => {});
    const renderRibbon = typeof options.renderRibbon === 'function' ? options.renderRibbon : (() => {});
    const isEditMode = typeof options.isEditMode === 'function' ? options.isEditMode : (() => false);

    function buildHistoryLabel(kind, count) {
      const safeCount = Math.max(0, Number(count) || 0);
      if (kind === 'rotate') return safeCount > 1 ? `Rotate ${safeCount} atoms` : 'Rotate atom';
      return safeCount > 1 ? `Move ${safeCount} atoms` : 'Move atom';
    }

    function clearMoveBaseline() {
      state.moveOperatorBaseline = null;
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

    function buildBaseline(tool) {
      const record = getActiveRecord();
      const vol = record && record.vol;
      const selection = getSelection();
      const isMove = tool === EDIT_TOOL.MOVE;
      if (!(getMode() === MODES.EDIT && getEditTool() === tool && record && vol && selection.length)) {
        if (isMove) clearMoveBaseline();
        else clearRotateBaseline();
        return null;
      }
      const existing = isMove ? state.moveOperatorBaseline : state.rotateOperatorBaseline;
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
      if (!isMove) baseline.currentQuaternion = new THREE.Quaternion();
      if (isMove) state.moveOperatorBaseline = baseline;
      else state.rotateOperatorBaseline = baseline;
      return baseline;
    }

    function ensureMoveBaseline() {
      return buildBaseline(EDIT_TOOL.MOVE);
    }

    function ensureRotateBaseline() {
      return buildBaseline(EDIT_TOOL.ROTATE);
    }

    function resetMoveBaseline() {
      clearMoveBaseline();
      return ensureMoveBaseline();
    }

    function resetRotateBaseline() {
      clearRotateBaseline();
      return ensureRotateBaseline();
    }

    function getMoveDisplacement() {
      const baseline = ensureMoveBaseline();
      if (!baseline) return new THREE.Vector3();
      const center = getSelectionCenterWorld(baseline.indices, baseline.vol);
      if (!center) return new THREE.Vector3();
      return center.sub(baseline.startCenterWorld);
    }

    function applyMoveDisplacement(delta) {
      const baseline = ensureMoveBaseline();
      if (!baseline || !delta) return false;
      const vol = baseline.vol;
      const atomGroup = getAtomGroup();
      for (let i = 0; i < baseline.indices.length; i += 1) {
        const idx = baseline.indices[i];
        const worldPos = baseline.startWorldPositions[i].clone().add(delta);
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
      const bondGroup = getBondGroup();
      if (bondGroup && bondGroup.children && bondGroup.children.length) rebuildBondsFromAtoms();
      updateSelectionVisuals();
      updateMoveGizmo();
      return true;
    }

    function commitMove(label = 'Move selection') {
      const baseline = state.moveOperatorBaseline;
      if (!baseline || !baseline.record || !baseline.vol || !Array.isArray(baseline.beforeAtoms)) return false;
      const afterAtoms = cloneAtomsSnapshot(baseline.vol);
      if (atomsSnapshotsEqual(baseline.beforeAtoms, afterAtoms)) {
        resetMoveBaseline();
        updateMoveOperatorUi();
        return false;
      }
      pushEditHistoryEntry(baseline.record, baseline.beforeAtoms, afterAtoms, label, {
        beforeBonds: Array.isArray(baseline.beforeBonds) ? baseline.beforeBonds : [],
        afterBonds: cloneBondSnapshot(baseline.vol),
      });
      resetMoveBaseline();
      updateMoveOperatorUi();
      return true;
    }

    function revertMove() {
      const baseline = state.moveOperatorBaseline;
      if (!baseline || !baseline.vol) return false;
      const atomGroup = getAtomGroup();
      for (let i = 0; i < baseline.indices.length; i += 1) {
        const idx = baseline.indices[i];
        const worldPos = baseline.startWorldPositions[i];
        const mesh = atomGroup && atomGroup.children ? atomGroup.children[idx] : null;
        if (mesh && mesh.position) mesh.position.copy(worldPos);
        const atom = baseline.vol.atoms[idx];
        if (atom) {
          const coords = worldToAtomUnits(baseline.vol, worldPos);
          atom.x = coords[0];
          atom.y = coords[1];
          atom.z = coords[2];
        }
      }
      const bondGroup = getBondGroup();
      if (bondGroup && bondGroup.children && bondGroup.children.length) rebuildBondsFromAtoms();
      updateSelectionVisuals();
      updateMoveGizmo();
      updateMoveOperatorUi();
      return true;
    }

    function applyMoveOperatorInput(axis, inputEl, options = {}) {
      const baseline = ensureMoveBaseline();
      if (!baseline || !inputEl) return;
      const current = getMoveDisplacement();
      const next = current.clone();
      const raw = Number(String(inputEl.value || '').trim());
      if (!Number.isFinite(raw)) return;
      if (axis === 'x') next.x = raw;
      else if (axis === 'y') next.y = raw;
      else next.z = raw;
      applyMoveDisplacement(next);
      if (options.commit) commitMove(buildHistoryLabel('move', baseline.indices.length));
    }

    function getRotateEulerDegrees() {
      const baseline = ensureRotateBaseline();
      if (!baseline || !baseline.currentQuaternion) return { x: 0, y: 0, z: 0 };
      const euler = new THREE.Euler().setFromQuaternion(baseline.currentQuaternion, 'XYZ');
      return {
        x: THREE.MathUtils.radToDeg(euler.x),
        y: THREE.MathUtils.radToDeg(euler.y),
        z: THREE.MathUtils.radToDeg(euler.z),
      };
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
      updateRotateOperatorUi();
      return true;
    }

    function commitRotate(label = 'Rotate selection') {
      const baseline = state.rotateOperatorBaseline;
      if (!baseline || !baseline.record || !baseline.vol || !Array.isArray(baseline.beforeAtoms)) return false;
      const afterAtoms = cloneAtomsSnapshot(baseline.vol);
      if (atomsSnapshotsEqual(baseline.beforeAtoms, afterAtoms)) {
        resetRotateBaseline();
        updateRotateOperatorUi();
        return false;
      }
      pushEditHistoryEntry(baseline.record, baseline.beforeAtoms, afterAtoms, label, {
        beforeBonds: Array.isArray(baseline.beforeBonds) ? baseline.beforeBonds : [],
        afterBonds: cloneBondSnapshot(baseline.vol),
      });
      resetRotateBaseline();
      updateRotateOperatorUi();
      return true;
    }

    function revertRotate() {
      const baseline = state.rotateOperatorBaseline;
      if (!baseline || !baseline.vol) return false;
      const atomGroup = getAtomGroup();
      for (let i = 0; i < baseline.indices.length; i += 1) {
        const idx = baseline.indices[i];
        const worldPos = baseline.startWorldPositions[i];
        const mesh = atomGroup && atomGroup.children ? atomGroup.children[idx] : null;
        if (mesh && mesh.position) mesh.position.copy(worldPos);
        const atom = baseline.vol.atoms[idx];
        if (atom) {
          const coords = worldToAtomUnits(baseline.vol, worldPos);
          atom.x = coords[0];
          atom.y = coords[1];
          atom.z = coords[2];
        }
      }
      baseline.currentQuaternion.identity();
      const bondGroup = getBondGroup();
      if (bondGroup && bondGroup.children && bondGroup.children.length) updateBondsInPlace();
      updateSelectionVisuals();
      updateMoveGizmo();
      updateRotateGizmo();
      updateRotateOperatorUi();
      return true;
    }

    function applyRotateOperatorInput(axis, inputEl, options = {}) {
      const baseline = ensureRotateBaseline();
      if (!baseline || !inputEl) return;
      const raw = Number(String(inputEl.value || '').trim());
      if (!Number.isFinite(raw)) return;
      const next = getRotateEulerDegrees();
      if (axis === 'x') next.x = raw;
      else if (axis === 'y') next.y = raw;
      else next.z = raw;
      const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(next.x),
        THREE.MathUtils.degToRad(next.y),
        THREE.MathUtils.degToRad(next.z),
        'XYZ'
      ));
      applyRotateQuaternion(rotation);
      if (options.commit) commitRotate(buildHistoryLabel('rotate', baseline.indices.length));
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
      const normal = new THREE.Vector3();
      camera.getWorldDirection(normal);
      state.dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, anchorWorld);
      setRaycasterFromEvent(e);
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
      resetMoveBaseline();
      if (isEditMode()) renderRibbon('edit');
      setMoveHover('');
      updateMoveGizmo();
      updateMoveOperatorUi();
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
      updateMoveOperatorUi();
      return true;
    }

    function startRotateDrag(e, indices, dragOptions = {}) {
      const baseline = ensureRotateBaseline();
      const targetIndices = Array.from(new Set((Array.isArray(indices) ? indices : []).map((idx) => Number(idx) | 0).filter((idx) => idx >= 0)));
      if (!baseline || !targetIndices.length) return false;
      state.rotateDragActive = true;
      state.rotateDragAxis = dragOptions.axis === 'x' || dragOptions.axis === 'y' || dragOptions.axis === 'z' ? dragOptions.axis : 'none';
      state.rotateDragPlane = null;
      state.rotateDragStartDir = null;
      state.rotateDragLastClientX = Number(e.clientX) || 0;
      state.rotateDragLastClientY = Number(e.clientY) || 0;
      if (state.rotateDragAxis !== 'none') {
        const axisWorld = state.rotateDragAxis === 'x'
          ? new THREE.Vector3(1, 0, 0)
          : (state.rotateDragAxis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1));
        state.rotateDragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(axisWorld, baseline.startCenterWorld);
        const raycaster = getRaycaster();
        setRaycasterFromEvent(e);
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
      updateRotateOperatorUi();
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
      const controls = getControls();
      try { if (controls) controls.enabled = true; } catch { }
      setRotateHover('');
      updateRotateGizmo();
      updateRotateOperatorUi();
      return true;
    }

    function clearAllTransformState() {
      clearMoveBaseline();
      clearRotateBaseline();
      cancelMoveDrag();
      cancelRotateDrag();
      clearGizmoHover();
      updateMoveOperatorUi();
      updateRotateOperatorUi();
      updateMoveGizmo();
      updateRotateGizmo();
    }

    function handlePointerMove(e) {
      if (state.rotateDragActive) {
        setEditMoved(true);
        updateRotateDrag(e);
        return true;
      }
      if (state.dragActive) {
        setEditMoved(true);
        updateMoveDrag(e);
        return true;
      }
      if (getMode() !== MODES.EDIT) return false;
      if (getEditTool() === EDIT_TOOL.MOVE) {
        const gizmoHit = pickMoveHit(e);
        setMoveHover(gizmoHit ? gizmoHit.axis : '');
        setRotateHover('');
        return !!gizmoHit;
      }
      if (getEditTool() === EDIT_TOOL.ROTATE) {
        const gizmoHit = pickRotateHit(e);
        setRotateHover(gizmoHit ? gizmoHit.axis : '');
        setMoveHover('');
        return !!gizmoHit;
      }
      clearGizmoHover();
      return false;
    }

    function handlePointerDown(e, obj) {
      if (getMode() !== MODES.EDIT) return false;
      state.backgroundClickPending = false;
      if (getEditTool() === EDIT_TOOL.ROTATE) {
        const record = getActiveRecord();
        const vol = record && record.vol;
        const selection = getSelection();
        const gizmoHit = selection.length ? pickRotateHit(e) : null;
        if (gizmoHit && vol) {
          if (startRotateDrag(e, selection, { axis: gizmoHit.axis })) {
            setEditClickIndex(selection[0] | 0);
            return true;
          }
        }
        if (!obj || !obj.userData) {
          state.backgroundClickPending = true;
          beginViewRotate(e);
          return true;
        }
        const idx = obj.userData.index | 0;
        const rotateIndices = (selection.length && selection.includes(idx)) ? selection.slice() : [idx];
        if (!(selection.length && selection.includes(idx))) setSelection([idx]);
        if (startRotateDrag(e, rotateIndices)) {
          setEditClickIndex(idx);
          return true;
        }
        beginViewRotate(e);
        return true;
      }
      if (getEditTool() === EDIT_TOOL.MOVE) {
        const record = getActiveRecord();
        const vol = record && record.vol;
        const selection = getSelection();
        const gizmoHit = selection.length ? pickMoveHit(e) : null;
        if (gizmoHit && vol) {
          const center = getSelectionCenterWorld(selection, vol);
          if (center && startMoveDrag(e, selection, center, { axis: gizmoHit.axis })) {
            setEditClickIndex(selection[0] | 0);
            return true;
          }
        }
        if (!obj || !obj.userData) {
          state.backgroundClickPending = true;
          beginViewRotate(e);
          return true;
        }
        const idx = obj.userData.index | 0;
        const moveIndices = (selection.length && selection.includes(idx)) ? selection.slice() : [idx];
        if (!(selection.length && selection.includes(idx))) setSelection([idx]);
        if (startMoveDrag(e, moveIndices, obj.position.clone())) {
          setEditClickIndex(idx);
          return true;
        }
        beginViewRotate(e);
        return true;
      }
      return false;
    }

    function handlePointerUp() {
      if (getMode() !== MODES.EDIT) return false;
      if (state.rotateDragActive) {
        finishRotateDrag();
        return true;
      }
      if (state.dragActive) {
        finishMoveDrag();
        return true;
      }
      if (state.backgroundClickPending) {
        state.backgroundClickPending = false;
        if (!getEditMoved() && clearEmptyClickSelection({ selection: true, bondEdit: true, transform: false })) {
          setHintMessage('Selection cleared.');
        }
        return true;
      }
      return false;
    }

    function handlePointerCancel() {
      const hadState = !!(state.dragActive || state.rotateDragActive);
      state.backgroundClickPending = false;
      cancelRotateDrag();
      cancelMoveDrag();
      clearGizmoHover();
      resetMoveBaseline();
      resetRotateBaseline();
      updateMoveOperatorUi();
      updateRotateOperatorUi();
      updateMoveGizmo();
      updateRotateGizmo();
      return hadState;
    }

    return Object.freeze({
      ensureMoveBaseline,
      clearMoveBaseline,
      resetMoveBaseline,
      getMoveDisplacement,
      applyMoveDisplacement,
      commitMove,
      revertMove,
      applyMoveOperatorInput,
      ensureRotateBaseline,
      clearRotateBaseline,
      resetRotateBaseline,
      getRotateEulerDegrees,
      applyRotateQuaternion,
      commitRotate,
      revertRotate,
      applyRotateOperatorInput,
      startMoveDrag,
      updateMoveDrag,
      finishMoveDrag,
      cancelMoveDrag,
      startRotateDrag,
      updateRotateDrag,
      finishRotateDrag,
      cancelRotateDrag,
      clearAllTransformState,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      handlePointerCancel,
    });
  }

  global.VibeMolEditTransform = Object.freeze({
    createEditTransformController,
  });
})(window);
