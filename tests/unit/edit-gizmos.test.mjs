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
    lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
    normalize() {
      const len = Math.sqrt(this.lengthSq()) || 1;
      this.x /= len;
      this.y /= len;
      this.z /= len;
      return this;
    }
  }

  class Quaternion {
    setFromUnitVectors() { return this; }
  }

  class Color {
    constructor(value = 0) {
      this.hex = typeof value === 'number' ? value : Number(value) || 0;
    }
    clone() { return new Color(this.hex); }
    lerp(other) { this.hex = other.hex; return this; }
    multiplyScalar() { return this; }
    getHex() { return this.hex; }
    setHex(value) { this.hex = value; return this; }
  }

  class Group {
    constructor() {
      this.children = [];
      this.userData = {};
      this.visible = true;
      this.position = new Vector3();
      this.scale = {
        x: 1,
        y: 1,
        z: 1,
        scalar: 1,
        setScalar(value) {
          this.x = value;
          this.y = value;
          this.z = value;
          this.scalar = value;
          return this;
        },
      };
      this.quaternion = new Quaternion();
      this.rotation = { x: 0, y: 0, z: 0 };
      this.renderOrder = 0;
      this.parent = null;
    }
    add(...children) {
      for (const child of children) {
        if (!child) continue;
        child.parent = this;
        this.children.push(child);
      }
    }
  }

  class Mesh extends Group {
    constructor(geometry, material) {
      super();
      this.geometry = geometry;
      this.material = material;
    }
  }

  class MeshPhongMaterial {
    constructor(options = {}) {
      this.color = options.color || new Color(0);
      this.emissive = options.emissive || new Color(0);
      this.opacity = options.opacity ?? 1;
      this.transparent = !!options.transparent;
      this.depthTest = !!options.depthTest;
      this.depthWrite = !!options.depthWrite;
      this.side = options.side;
      this.shininess = options.shininess ?? 0;
    }
  }

  class CylinderGeometry { constructor(...args) { this.args = args; } }
  class ConeGeometry { constructor(...args) { this.args = args; } }
  class TorusGeometry { constructor(...args) { this.args = args; } }

  return {
    Vector3,
    Quaternion,
    Color,
    Group,
    Mesh,
    MeshPhongMaterial,
    CylinderGeometry,
    ConeGeometry,
    TorusGeometry,
    DoubleSide: 'DoubleSide',
  };
}

function createHarness() {
  const THREE = createThreeStub();
  const state = {
    mode: 'edit',
    tool: 'atom_manipulation',
    dragMode: 'translate',
    selection: [0, 1],
    transformContext: null,
    record: { vol: { atoms: [{ Z: 6 }, { Z: 6 }] } },
  };
  const raycaster = {
    hits: [],
    intersectObjects() {
      return this.hits;
    },
  };
  const context = loadGlobalModule('assets/app/js/edit-gizmos.js', {
    globals: { THREE },
  });
  const contentGroup = new THREE.Group();
  const controller = context.window.VibeMolEditGizmos.createEditGizmosController({
    THREE,
    contentGroup,
    raycaster,
    setRaycasterFromEvent: () => {},
    getMode: () => state.mode,
    getEditIntent: () => state.tool,
    getSelection: () => state.selection.slice(),
    getSelectionDragMode: () => state.dragMode,
    getTransformSelectionContext: () => state.transformContext,
    getActiveRecord: () => state.record,
    getSelectionCenterWorld: () => new THREE.Vector3(1, 2, 3),
    getSelectionGizmoLength: () => 1.4,
    getMoveDragPivotWorld: () => null,
    getRotateDragCenterWorld: () => null,
    MODES: { EDIT: 'edit' },
    EDIT_INTENT: { ATOM_MANIPULATION: 'atom_manipulation' },
  });
  return { THREE, state, raycaster, controller };
}

test('edit-gizmos move gizmo updates, picks, and highlights hovered axis', () => {
  const { THREE, controller, raycaster } = createHarness();

  controller.updateMove();
  const moveGroup = controller.getMoveGroup();
  assert.equal(moveGroup.visible, true);
  assert.equal(moveGroup.scale.scalar, 1.4);

  const xAxisGroup = moveGroup.children.find((child) => child.userData.moveSelectionAxis === 'x');
  assert.ok(xAxisGroup);
  raycaster.hits = [{ object: xAxisGroup.children[0], point: new THREE.Vector3(3, 0, 0) }];
  const hit = controller.pickMoveHit({ clientX: 10, clientY: 20 });
  assert.equal(hit.axis, 'x');

  controller.setMoveHover('x');
  assert.equal(xAxisGroup.userData.moveSelectionMaterial.opacity, 1);
  controller.setMoveHover('');
  assert.equal(xAxisGroup.userData.moveSelectionMaterial.opacity, 0.96);
});

test('edit-gizmos rotate gizmo updates, picks, and stays hidden outside edit mode', () => {
  const { THREE, state, controller, raycaster } = createHarness();

  state.dragMode = 'rotate';
  controller.updateRotate();
  const rotateGroup = controller.getRotateGroup();
  assert.equal(rotateGroup.visible, true);

  const yAxisGroup = rotateGroup.children.find((child) => child.userData.rotateSelectionAxis === 'y');
  assert.ok(yAxisGroup);
  raycaster.hits = [{ object: yAxisGroup.children[0], point: new THREE.Vector3(0, 3, 0) }];
  const rotateHit = controller.pickRotateHit({ clientX: 4, clientY: 5 });
  assert.equal(rotateHit.axis, 'y');

  controller.setRotateHover('y');
  assert.equal(yAxisGroup.userData.rotateSelectionMaterial.opacity, 1);

  state.mode = 'display';
  controller.updateRotate();
  assert.equal(rotateGroup.visible, false);
  assert.equal(controller.pickRotateHit({ clientX: 0, clientY: 0 }), null);
});

test('edit-gizmos exposes move and rotate gizmos in atom manipulation for multi-atom selection only', () => {
  const { THREE, state, controller, raycaster } = createHarness();

  state.tool = 'atom_manipulation';
  state.selection = [0, 1];
  state.dragMode = 'translate';

  controller.updateMove();
  controller.updateRotate();
  assert.equal(controller.getMoveGroup().visible, true);
  assert.equal(controller.getRotateGroup().visible, false);

  const moveXAxisGroup = controller.getMoveGroup().children.find((child) => child.userData.moveSelectionAxis === 'x');
  assert.ok(moveXAxisGroup);

  raycaster.hits = [{ object: moveXAxisGroup.children[0], point: new THREE.Vector3(2, 0, 0) }];
  assert.equal(controller.pickMoveHit({ clientX: 1, clientY: 2 }).axis, 'x');
  assert.equal(controller.pickRotateHit({ clientX: 3, clientY: 4 }), null);

  state.dragMode = 'rotate';
  controller.updateMove();
  controller.updateRotate();
  assert.equal(controller.getMoveGroup().visible, false);
  assert.equal(controller.getRotateGroup().visible, true);
  const rotateZAxisGroup = controller.getRotateGroup().children.find((child) => child.userData.rotateSelectionAxis === 'z');
  assert.ok(rotateZAxisGroup);
  raycaster.hits = [{ object: rotateZAxisGroup.children[0], point: new THREE.Vector3(0, 0, 2) }];
  assert.equal(controller.pickRotateHit({ clientX: 3, clientY: 4 }).axis, 'z');
  assert.equal(controller.pickMoveHit({ clientX: 1, clientY: 2 }), null);

  state.selection = [0];
  controller.updateMove();
  controller.updateRotate();
  assert.equal(controller.getMoveGroup().visible, false);
  assert.equal(controller.getRotateGroup().visible, false);
  assert.equal(controller.pickMoveHit({ clientX: 5, clientY: 6 }), null);
  assert.equal(controller.pickRotateHit({ clientX: 5, clientY: 6 }), null);
});

test('edit-gizmos stay hidden for bond-side transform selection context', () => {
  const { state, controller } = createHarness();

  state.tool = 'atom_manipulation';
  state.dragMode = 'rotate';
  state.selection = [0, 1];
  state.transformContext = {
    type: 'bond',
    selectedAtomIndex: 1,
    anchorAtomIndex: 0,
    bondIndices: [0, 1],
  };

  controller.updateMove();
  controller.updateRotate();

  assert.equal(controller.getMoveGroup().visible, false);
  assert.equal(controller.getRotateGroup().visible, false);
  assert.equal(controller.pickMoveHit({ clientX: 0, clientY: 0 }), null);
  assert.equal(controller.pickRotateHit({ clientX: 0, clientY: 0 }), null);
});
