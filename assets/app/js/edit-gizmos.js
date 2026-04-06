(function (global) {
  'use strict';

  function createEditGizmosController(options = {}) {
    const THREE = options.THREE;
    const contentGroup = options.contentGroup || null;
    const raycaster = options.raycaster || null;
    const setRaycasterFromEvent = typeof options.setRaycasterFromEvent === 'function' ? options.setRaycasterFromEvent : (() => {});
    const getMode = typeof options.getMode === 'function' ? options.getMode : (() => '');
    const getEditIntent = typeof options.getEditIntent === 'function' ? options.getEditIntent : (() => '');
    const getSelection = typeof options.getSelection === 'function' ? options.getSelection : (() => []);
    const getSelectionDragMode = typeof options.getSelectionDragMode === 'function' ? options.getSelectionDragMode : (() => 'translate');
    const getTransformSelectionContext = typeof options.getTransformSelectionContext === 'function' ? options.getTransformSelectionContext : (() => null);
    const getActiveRecord = typeof options.getActiveRecord === 'function' ? options.getActiveRecord : (() => null);
    const getSelectionCenterWorld = typeof options.getSelectionCenterWorld === 'function' ? options.getSelectionCenterWorld : (() => null);
    const getSelectionGizmoLength = typeof options.getSelectionGizmoLength === 'function' ? options.getSelectionGizmoLength : (() => 0.9);
    const getMoveDragPivotWorld = typeof options.getMoveDragPivotWorld === 'function' ? options.getMoveDragPivotWorld : (() => null);
    const getRotateDragCenterWorld = typeof options.getRotateDragCenterWorld === 'function' ? options.getRotateDragCenterWorld : (() => null);
    const MODES = options.MODES || { EDIT: 'edit' };
    const EDIT_INTENT = options.EDIT_INTENT || { ATOM_MANIPULATION: 'atom_manipulation' };

    const rootGroup = new THREE.Group();
    const moveGroup = new THREE.Group();
    const rotateGroup = new THREE.Group();
    rootGroup.add(moveGroup, rotateGroup);
    if (contentGroup && typeof contentGroup.add === 'function') contentGroup.add(rootGroup);

    let moveHoverAxis = '';
    let rotateHoverAxis = '';

    function buildMoveSelectionArrow(axis, direction, color) {
      const group = new THREE.Group();
      group.userData.moveSelectionAxis = axis;
      const baseColor = new THREE.Color(color);
      const hoverColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.38);
      const baseEmissive = baseColor.clone().multiplyScalar(0.16);
      const hoverEmissive = hoverColor.clone().multiplyScalar(0.28);
      const mat = new THREE.MeshPhongMaterial({
        color: baseColor.clone(),
        emissive: baseEmissive.clone(),
        specular: new THREE.Color(0xffffff),
        shininess: 85,
        transparent: true,
        opacity: 0.96,
        depthTest: false,
        depthWrite: false,
      });
      group.userData.moveSelectionMaterial = mat;
      group.userData.moveSelectionBaseColor = baseColor.getHex();
      group.userData.moveSelectionHoverColor = hoverColor.getHex();
      group.userData.moveSelectionBaseEmissive = baseEmissive.getHex();
      group.userData.moveSelectionHoverEmissive = hoverEmissive.getHex();
      const baseGap = 0.18;
      const shaftLen = 0.72;
      const shaftRad = 0.045;
      const headLen = 0.28;
      const headRad = 0.12;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftRad, shaftRad, shaftLen, 16, 1, false), mat);
      shaft.position.y = baseGap + shaftLen * 0.5;
      shaft.renderOrder = 9998;
      shaft.userData.moveSelectionAxis = axis;
      const head = new THREE.Mesh(new THREE.ConeGeometry(headRad, headLen, 20, 1), mat);
      head.position.y = baseGap + shaftLen + headLen * 0.5;
      head.renderOrder = 9998;
      head.userData.moveSelectionAxis = axis;
      group.add(shaft, head);
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
      return group;
    }

    function ensureMoveSelectionGizmo() {
      if (moveGroup.userData.initialized) return moveGroup;
      moveGroup.userData.initialized = true;
      moveGroup.renderOrder = 9998;
      moveGroup.add(
        buildMoveSelectionArrow('x', new THREE.Vector3(1, 0, 0), 0xff4136),
        buildMoveSelectionArrow('y', new THREE.Vector3(0, 1, 0), 0x2ecc40),
        buildMoveSelectionArrow('z', new THREE.Vector3(0, 0, 1), 0x0074d9)
      );
      return moveGroup;
    }

    function setMoveHover(axis = '') {
      const nextAxis = axis === 'x' || axis === 'y' || axis === 'z' ? axis : '';
      if (moveHoverAxis === nextAxis && moveGroup.userData.initialized) return;
      moveHoverAxis = nextAxis;
      ensureMoveSelectionGizmo();
      for (const child of moveGroup.children) {
        if (!child || !child.userData) continue;
        const mat = child.userData.moveSelectionMaterial;
        if (!mat || !mat.color) continue;
        const active = !!(nextAxis && child.userData.moveSelectionAxis === nextAxis);
        mat.color.setHex(active ? child.userData.moveSelectionHoverColor : child.userData.moveSelectionBaseColor);
        if (mat.emissive) mat.emissive.setHex(active ? child.userData.moveSelectionHoverEmissive : child.userData.moveSelectionBaseEmissive);
        mat.opacity = active ? 1.0 : 0.96;
      }
    }

    function shouldExposeMoveGizmo(vol, selection) {
      if (!(getMode() === MODES.EDIT && vol && Array.isArray(selection) && selection.length)) return false;
      const transformContext = getTransformSelectionContext();
      if (transformContext && transformContext.type === 'bond') return false;
      return getEditIntent() === EDIT_INTENT.ATOM_MANIPULATION
        && selection.length >= 2
        && String(getSelectionDragMode() || '').toLowerCase() !== 'rotate';
    }

    function shouldExposeRotateGizmo(vol, selection) {
      if (!(getMode() === MODES.EDIT && vol && Array.isArray(selection) && selection.length)) return false;
      const transformContext = getTransformSelectionContext();
      if (transformContext && transformContext.type === 'bond') return false;
      return getEditIntent() === EDIT_INTENT.ATOM_MANIPULATION
        && selection.length >= 2
        && String(getSelectionDragMode() || '').toLowerCase() === 'rotate';
    }

    function updateMove() {
      const record = getActiveRecord();
      const vol = record && record.vol;
      const selection = getSelection();
      const visible = shouldExposeMoveGizmo(vol, selection);
      moveGroup.visible = visible;
      if (!visible) {
        setMoveHover('');
        return;
      }
      ensureMoveSelectionGizmo();
      const center = getMoveDragPivotWorld() || getSelectionCenterWorld(selection, vol);
      if (!center) {
        moveGroup.visible = false;
        return;
      }
      const length = getSelectionGizmoLength(selection, vol);
      moveGroup.position.copy(center);
      moveGroup.scale.setScalar(length);
      setMoveHover(moveHoverAxis);
    }

    function pickMoveHit(e) {
      const record = getActiveRecord();
      const vol = record && record.vol;
      const selection = getSelection();
      if (!shouldExposeMoveGizmo(vol, selection) || !moveGroup.visible || !raycaster) return null;
      setRaycasterFromEvent(e);
      const hits = raycaster.intersectObjects(moveGroup.children, true);
      for (const hit of hits) {
        let obj = hit && hit.object;
        while (obj) {
          const axis = obj.userData && obj.userData.moveSelectionAxis;
          if (axis === 'x' || axis === 'y' || axis === 'z') {
            return { axis, point: hit.point ? hit.point.clone() : null, object: hit.object };
          }
          obj = obj.parent;
        }
      }
      return null;
    }

    function buildRotateSelectionRing(axis, color) {
      const group = new THREE.Group();
      group.userData.rotateSelectionAxis = axis;
      const baseColor = new THREE.Color(color);
      const hoverColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.38);
      const baseEmissive = baseColor.clone().multiplyScalar(0.16);
      const hoverEmissive = hoverColor.clone().multiplyScalar(0.28);
      const mat = new THREE.MeshPhongMaterial({
        color: baseColor.clone(),
        emissive: baseEmissive.clone(),
        specular: new THREE.Color(0xffffff),
        shininess: 95,
        transparent: true,
        opacity: 0.94,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      group.userData.rotateSelectionMaterial = mat;
      group.userData.rotateSelectionBaseColor = baseColor.getHex();
      group.userData.rotateSelectionHoverColor = hoverColor.getHex();
      group.userData.rotateSelectionBaseEmissive = baseEmissive.getHex();
      group.userData.rotateSelectionHoverEmissive = hoverEmissive.getHex();
      const ringRadius = 0.82;
      const tubeRadius = 0.045;
      const gapAngle = 0.34;
      const arcAngle = Math.PI - gapAngle;
      const arcGeometry = new THREE.TorusGeometry(ringRadius, tubeRadius, 16, 72, arcAngle);
      const arcA = new THREE.Mesh(arcGeometry, mat);
      const arcB = new THREE.Mesh(arcGeometry, mat);
      arcA.rotation.z = gapAngle * 0.5;
      arcB.rotation.z = Math.PI + gapAngle * 0.5;
      arcA.renderOrder = 9997;
      arcB.renderOrder = 9997;
      arcA.userData.rotateSelectionAxis = axis;
      arcB.userData.rotateSelectionAxis = axis;
      group.add(arcA, arcB);
      if (axis === 'x') group.rotation.y = Math.PI * 0.5;
      else if (axis === 'y') group.rotation.x = Math.PI * 0.5;
      return group;
    }

    function ensureRotateSelectionGizmo() {
      if (rotateGroup.userData.initialized) return rotateGroup;
      rotateGroup.userData.initialized = true;
      rotateGroup.renderOrder = 9997;
      rotateGroup.add(
        buildRotateSelectionRing('x', 0xff4136),
        buildRotateSelectionRing('y', 0x2ecc40),
        buildRotateSelectionRing('z', 0x0074d9)
      );
      return rotateGroup;
    }

    function setRotateHover(axis = '') {
      const nextAxis = axis === 'x' || axis === 'y' || axis === 'z' ? axis : '';
      if (rotateHoverAxis === nextAxis && rotateGroup.userData.initialized) return;
      rotateHoverAxis = nextAxis;
      ensureRotateSelectionGizmo();
      for (const child of rotateGroup.children) {
        if (!child || !child.userData) continue;
        const mat = child.userData.rotateSelectionMaterial;
        if (!mat || !mat.color) continue;
        const active = !!(nextAxis && child.userData.rotateSelectionAxis === nextAxis);
        mat.color.setHex(active ? child.userData.rotateSelectionHoverColor : child.userData.rotateSelectionBaseColor);
        if (mat.emissive) mat.emissive.setHex(active ? child.userData.rotateSelectionHoverEmissive : child.userData.rotateSelectionBaseEmissive);
        mat.opacity = active ? 1.0 : 0.94;
      }
    }

    function updateRotate() {
      const record = getActiveRecord();
      const vol = record && record.vol;
      const selection = getSelection();
      const visible = shouldExposeRotateGizmo(vol, selection);
      rotateGroup.visible = visible;
      if (!visible) {
        setRotateHover('');
        return;
      }
      ensureRotateSelectionGizmo();
      const center = getRotateDragCenterWorld() || getSelectionCenterWorld(selection, vol);
      if (!center) {
        rotateGroup.visible = false;
        return;
      }
      const length = getSelectionGizmoLength(selection, vol);
      rotateGroup.position.copy(center);
      rotateGroup.scale.setScalar(length);
      setRotateHover(rotateHoverAxis);
    }

    function pickRotateHit(e) {
      const record = getActiveRecord();
      const vol = record && record.vol;
      const selection = getSelection();
      if (!shouldExposeRotateGizmo(vol, selection) || !rotateGroup.visible || !raycaster) return null;
      setRaycasterFromEvent(e);
      const hits = raycaster.intersectObjects(rotateGroup.children, true);
      for (const hit of hits) {
        let obj = hit && hit.object;
        while (obj) {
          const axis = obj.userData && obj.userData.rotateSelectionAxis;
          if (axis === 'x' || axis === 'y' || axis === 'z') {
            return { axis, point: hit.point ? hit.point.clone() : null, object: hit.object };
          }
          obj = obj.parent;
        }
      }
      return null;
    }

    function clearHover() {
      setMoveHover('');
      setRotateHover('');
    }

    return Object.freeze({
      updateMove,
      updateRotate,
      pickMoveHit,
      pickRotateHit,
      setMoveHover,
      setRotateHover,
      clearHover,
      getMoveGroup: () => moveGroup,
      getRotateGroup: () => rotateGroup,
      getRootGroup: () => rootGroup,
    });
  }

  global.VibeMolEditGizmos = Object.freeze({
    createEditGizmosController,
  });
})(window);
