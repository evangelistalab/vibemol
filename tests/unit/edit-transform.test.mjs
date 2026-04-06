import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';

function createThreeStub() {
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.isVector3 = true;
    }
    clone() { return new Vector3(this.x, this.y, this.z); }
    copy(other) { this.x = other.x; this.y = other.y; this.z = other.z; return this; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    add(other) { this.x += other.x; this.y += other.y; this.z += other.z; return this; }
    sub(other) { this.x -= other.x; this.y -= other.y; this.z -= other.z; return this; }
    multiplyScalar(value) { this.x *= value; this.y *= value; this.z *= value; return this; }
    addScaledVector(other, scale) {
      this.x += other.x * scale;
      this.y += other.y * scale;
      this.z += other.z * scale;
      return this;
    }
    dot(other) { return this.x * other.x + this.y * other.y + this.z * other.z; }
    crossVectors(a, b) {
      const x = a.y * b.z - a.z * b.y;
      const y = a.z * b.x - a.x * b.z;
      const z = a.x * b.y - a.y * b.x;
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
    normalize() {
      const len = Math.sqrt(this.lengthSq()) || 1;
      this.x /= len;
      this.y /= len;
      this.z /= len;
      return this;
    }
    distanceTo(other) { return Math.sqrt(this.distanceToSquared(other)); }
    distanceToSquared(other) {
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const dz = this.z - other.z;
      return dx * dx + dy * dy + dz * dz;
    }
    applyQuaternion(q) {
      const x = this.x;
      const y = this.y;
      const z = this.z;
      const qx = q.x;
      const qy = q.y;
      const qz = q.z;
      const qw = q.w;

      const ix = qw * x + qy * z - qz * y;
      const iy = qw * y + qz * x - qx * z;
      const iz = qw * z + qx * y - qy * x;
      const iw = -qx * x - qy * y - qz * z;

      this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
      this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
      this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
      return this;
    }
  }

  class Quaternion {
    constructor(x = 0, y = 0, z = 0, w = 1) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
      this.isQuaternion = true;
    }
    clone() { return new Quaternion(this.x, this.y, this.z, this.w); }
    copy(other) {
      this.x = other.x;
      this.y = other.y;
      this.z = other.z;
      this.w = other.w;
      return this;
    }
    identity() {
      this.x = 0;
      this.y = 0;
      this.z = 0;
      this.w = 1;
      return this;
    }
    normalize() {
      const len = Math.hypot(this.x, this.y, this.z, this.w) || 1;
      this.x /= len;
      this.y /= len;
      this.z /= len;
      this.w /= len;
      return this;
    }
    multiply(other) {
      return this.multiplyQuaternions(this, other);
    }
    premultiply(other) {
      return this.multiplyQuaternions(other, this);
    }
    multiplyQuaternions(a, b) {
      const qax = a.x;
      const qay = a.y;
      const qaz = a.z;
      const qaw = a.w;
      const qbx = b.x;
      const qby = b.y;
      const qbz = b.z;
      const qbw = b.w;
      this.x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
      this.y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
      this.z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
      this.w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;
      return this;
    }
    setFromAxisAngle(axis, angle) {
      const half = angle * 0.5;
      const s = Math.sin(half);
      this.x = axis.x * s;
      this.y = axis.y * s;
      this.z = axis.z * s;
      this.w = Math.cos(half);
      return this;
    }
    setFromEuler(euler) {
      const c1 = Math.cos(euler.x * 0.5);
      const c2 = Math.cos(euler.y * 0.5);
      const c3 = Math.cos(euler.z * 0.5);
      const s1 = Math.sin(euler.x * 0.5);
      const s2 = Math.sin(euler.y * 0.5);
      const s3 = Math.sin(euler.z * 0.5);
      this.x = s1 * c2 * c3 + c1 * s2 * s3;
      this.y = c1 * s2 * c3 - s1 * c2 * s3;
      this.z = c1 * c2 * s3 + s1 * s2 * c3;
      this.w = c1 * c2 * c3 - s1 * s2 * s3;
      return this;
    }
  }

  class Euler {
    constructor(x = 0, y = 0, z = 0, order = 'XYZ') {
      this.x = x;
      this.y = y;
      this.z = z;
      this.order = order;
    }
    setFromQuaternion(q, order = 'XYZ') {
      const sqx = q.x * q.x;
      const sqy = q.y * q.y;
      const sqz = q.z * q.z;
      const sqw = q.w * q.w;
      this.order = order;
      this.x = Math.atan2(2 * (q.w * q.x + q.y * q.z), sqw - sqx - sqy + sqz);
      this.y = Math.asin(Math.max(-1, Math.min(1, 2 * (q.w * q.y - q.z * q.x))));
      this.z = Math.atan2(2 * (q.w * q.z + q.x * q.y), sqw + sqx - sqy - sqz);
      return this;
    }
  }

  class Plane {
    constructor() {
      this.normal = new Vector3(0, 0, 1);
      this.constant = 0;
    }
    setFromNormalAndCoplanarPoint(normal, point) {
      this.normal = normal.clone().normalize();
      this.constant = -this.normal.dot(point);
      return this;
    }
  }

  return {
    Vector3,
    Quaternion,
    Euler,
    Plane,
    MathUtils: {
      degToRad: (value) => value * Math.PI / 180,
      radToDeg: (value) => value * 180 / Math.PI,
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    },
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createHarness(initialSelection = [0, 1]) {
  const THREE = createThreeStub();
  const context = loadGlobalModule('assets/app/js/edit-transform.js', {
    globals: { THREE },
  });
  const record = {
    title: 'fixture.xyz',
    vol: {
      atoms: [
        { id: 'atom-1', Z: 6, x: 0, y: 0, z: 0 },
        { id: 'atom-2', Z: 6, x: 1, y: 0, z: 0 },
        { id: 'atom-3', Z: 1, x: 2, y: 0, z: 0 },
      ],
      bonds: [],
    },
  };
  const atomGroup = {
    children: record.vol.atoms.map((atom) => ({ position: new THREE.Vector3(atom.x, atom.y, atom.z) })),
  };
  const bondGroup = { children: [] };
  const controls = { enabled: true };
  const camera = {
    up: new THREE.Vector3(0, 1, 0),
    getWorldDirection(target) {
      return target.set(0, 0, -1);
    },
  };
  const raycaster = {
    currentPoint: new THREE.Vector3(),
    ray: {
      intersectPlane(_plane, target) {
        target.copy(raycaster.currentPoint);
        return true;
      },
    },
  };
  let selection = initialSelection.slice();
  let mode = 'edit';
  const state = {
    dragActive: false,
    dragAtomIndex: -1,
    dragTargetIndices: [],
    dragStartWorldPositions: [],
    dragPivotWorld: null,
    dragPivotStartWorld: null,
    dragStartPos: null,
    dragOrigMeshPos: null,
    dragOrigAtomUnits: null,
    dragPlane: null,
    dragPlaneStart: null,
    dragAxis: 'none',
    moveOperatorBaseline: null,
    rotateOperatorBaseline: null,
    rotateDragActive: false,
    rotateDragAxis: 'none',
    rotateDragPlane: null,
    rotateDragStartDir: null,
    rotateDragLastClientX: 0,
    rotateDragLastClientY: 0,
    dragBeforeAtomsSnapshot: null,
    dragBeforeBondSnapshot: null,
  };
  const calls = {
    selection: [],
    history: [],
    beginViewRotate: 0,
    updateMoveGizmo: 0,
    updateRotateGizmo: 0,
    updateSelectionVisuals: 0,
    rebuildScene: 0,
    rebuildBondsFromAtoms: 0,
    updateBondsInPlace: 0,
    renderRibbon: [],
    editClickIndex: [],
    editMoved: [],
    clearEmptyClickSelection: [],
    hintMessages: [],
  };
  let editMovedFlag = false;

  function snapshotAtoms(vol) {
    return vol.atoms.map((atom) => ({ ...atom }));
  }

  function atomIds(indices) {
    return indices.map((idx) => record.vol.atoms[idx].id);
  }

  const controller = context.window.VibeMolEditTransform.createEditTransformController({
    THREE,
    state,
    MODES: { EDIT: 'edit' },
    getMode: () => mode,
    getActiveRecord: () => record,
    getSelection: () => selection.slice(),
    setSelection: (next) => {
      selection = next.slice();
      calls.selection.push(next.slice());
    },
    getAtomGroup: () => atomGroup,
    getBondGroup: () => bondGroup,
    getCamera: () => camera,
    getControls: () => controls,
    atomUnitsToAng: (_vol, atom) => new THREE.Vector3(atom.x, atom.y, atom.z),
    worldToAtomUnits: (_vol, world) => [world.x, world.y, world.z],
    ensureVolumeAtomIds: () => {},
    ensureAtomId: (atom) => atom.id,
    cloneAtomsSnapshot: snapshotAtoms,
    cloneBondSnapshot: (vol) => (Array.isArray(vol.bonds) ? vol.bonds.map((bond) => ({ ...bond })) : []),
    atomsSnapshotsEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    pushEditHistoryEntry: (_record, before, after, label) => {
      calls.history.push({ label, before: plain(before), after: plain(after) });
    },
    rebuildBondsFromAtoms: () => { calls.rebuildBondsFromAtoms += 1; },
    updateBondsInPlace: () => { calls.updateBondsInPlace += 1; },
    rebuildScene: () => { calls.rebuildScene += 1; },
    updateSelectionVisuals: () => { calls.updateSelectionVisuals += 1; },
    updateMoveGizmo: () => { calls.updateMoveGizmo += 1; },
    updateRotateGizmo: () => { calls.updateRotateGizmo += 1; },
    getSelectionCenterWorld: (indices, vol) => {
      const selected = Array.isArray(indices) ? indices : [];
      const center = new THREE.Vector3();
      for (const idx of selected) center.add(atomGroup.children[idx].position.clone());
      return selected.length ? center.multiplyScalar(1 / selected.length) : null;
    },
    setRaycasterFromEvent: (event) => {
      if (event && event.hitPoint && event.hitPoint.isVector3) raycaster.currentPoint.copy(event.hitPoint);
      else raycaster.currentPoint.set(Number(event.clientX) || 0, Number(event.clientY) || 0, 0);
    },
    getRaycaster: () => raycaster,
    setMoveHover: () => {},
    setRotateHover: () => {},
    clearGizmoHover: () => {},
    renderRibbon: (value) => { calls.renderRibbon.push(value); },
    isEditMode: () => true,
  });

  return {
    THREE,
    controller,
    state,
    calls,
    record,
    atomGroup,
    setMode: (value) => { mode = value; },
    setEditMoved: (value) => { editMovedFlag = !!value; },
    getSelection: () => selection.slice(),
    atomIds,
  };
}

test('edit-transform rotate baseline tracks the current selection', () => {
  const harness = createHarness([0, 1]);
  const baseline = harness.controller.ensureRotateBaseline();
  assert.ok(baseline);
  assert.equal(baseline.indices.length, 2);
  assert.deepEqual(plain(baseline.indices), [0, 1]);
  assert.equal(baseline.startCenterWorld.x, 0.5);
});

test('edit-transform move drag stores selection targets and creates move history on finish', () => {
  const harness = createHarness([2]);
  const startWorld = new harness.THREE.Vector3(2, 0, 0);
  assert.equal(
    harness.controller.startMoveDrag({ clientX: 0, clientY: 0, hitPoint: startWorld.clone() }, [2], startWorld.clone(), { axis: 'none' }),
    true
  );
  assert.deepEqual(plain(harness.atomIds(harness.state.dragTargetIndices)), ['atom-3']);
  assert.equal(harness.state.dragActive, true);

  harness.controller.updateMoveDrag({ clientX: 1, clientY: 0, hitPoint: new harness.THREE.Vector3(2.5, 0, 0) });
  assert.equal(harness.record.vol.atoms[2].x, 2.5);
  assert.equal(harness.controller.finishMoveDrag(), true);
  assert.equal(harness.calls.history.at(-1).label, 'Move atom');
});

test('edit-transform rotate drag creates rotate history on finish', () => {
  const harness = createHarness([0, 1]);
  assert.equal(
    harness.controller.startRotateDrag(
      { clientX: 0, clientY: 0, hitPoint: new harness.THREE.Vector3(0, 1, 0) },
      [0, 1],
      { axis: 'none' }
    ),
    true
  );
  harness.controller.updateRotateDrag({ clientX: 24, clientY: 12 });
  assert.equal(harness.controller.finishRotateDrag(), true);
  assert.equal(harness.calls.history.at(-1).label, 'Rotate 2 atoms');
});

test('edit-transform clearAllTransformState cancels move and rotate drags', () => {
  const moveHarness = createHarness([0, 1]);
  assert.equal(
    moveHarness.controller.startMoveDrag(
      { clientX: 0, clientY: 0, hitPoint: new moveHarness.THREE.Vector3(0, 0, 0) },
      [0, 1],
      new moveHarness.THREE.Vector3(0, 0, 0),
      { axis: 'none' }
    ),
    true
  );
  moveHarness.controller.clearAllTransformState();
  assert.equal(moveHarness.state.dragActive, false);

  const rotateHarness = createHarness([0, 1]);
  assert.equal(
    rotateHarness.controller.startRotateDrag({ clientX: 0, clientY: 0, hitPoint: new rotateHarness.THREE.Vector3(0, 1, 0) }, [0, 1], { axis: 'none' }),
    true
  );
  rotateHarness.controller.clearAllTransformState();
  assert.equal(rotateHarness.state.rotateDragActive, false);
});
