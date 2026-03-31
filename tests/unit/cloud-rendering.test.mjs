import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateInContext, loadGlobalModule } from './load-global-module.mjs';

function createThreeStub() {
  class Group {
    constructor() { this.children = []; }
    add(...children) { this.children.push(...children); }
  }
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    copy(other) { this.x = other.x; this.y = other.y; this.z = other.z; return this; }
    multiplyScalar(value) { this.x *= value; this.y *= value; this.z *= value; return this; }
  }
  class Quaternion {
    identity() { return this; }
  }
  class Matrix4 {
    compose(position, quaternion, scale) {
      this.position = { x: position.x, y: position.y, z: position.z };
      this.quaternion = quaternion;
      this.scale = { x: scale.x, y: scale.y, z: scale.z };
      return this;
    }
  }
  class BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
      this.needsUpdate = false;
    }
  }
  class InstancedBufferAttribute extends BufferAttribute {
    setXYZ(index, x, y, z) {
      const base = index * 3;
      this.array[base] = x;
      this.array[base + 1] = y;
      this.array[base + 2] = z;
    }
  }
  class BufferGeometry {
    constructor() { this.attributes = {}; }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name] || null; }
  }
  class BoxGeometry extends BufferGeometry {
    constructor() {
      super();
      this.attributes.position = { count: 8 };
    }
  }
  class Color {
    constructor(value) { this.value = value; }
  }
  class MeshStandardMaterial {
    constructor(options) { this.options = options; }
  }
  class ShaderMaterial {
    constructor(options) { this.options = options; }
  }
  class InstancedMesh {
    constructor(geometry, material, count) {
      this.geometry = geometry;
      this.material = material;
      this.count = count;
      this.userData = {};
      this.instanceMatrix = { needsUpdate: false };
      this.matrices = [];
      this.instanceColor = null;
    }
    setMatrixAt(index, matrix) { this.matrices[index] = matrix; }
  }
  class Points {
    constructor(geometry, material) {
      this.geometry = geometry;
      this.material = material;
      this.userData = {};
    }
  }
  return {
    Group,
    Vector3,
    Quaternion,
    Matrix4,
    BufferAttribute,
    InstancedBufferAttribute,
    BufferGeometry,
    BoxGeometry,
    Color,
    MeshStandardMaterial,
    ShaderMaterial,
    InstancedMesh,
    Points,
    DoubleSide: 'DoubleSide',
    NormalBlending: 'NormalBlending',
  };
}

function createContext() {
  return loadGlobalModule('assets/app/js/cloud-rendering.js', {
    globals: {
      THREE: createThreeStub(),
      VibeMolVolumeGeometry: {
        voxelToWorld(_vol, p) {
          return [p[0] + 1, p[1] + 2, p[2] + 3];
        },
      },
      VibeMolRendering: {
        maxAbs(values) {
          let max = 0;
          for (const value of values) max = Math.max(max, Math.abs(value));
          return max;
        },
      },
      VibeMolVolume2C: {
        hsvToRgb(h, s, v) {
          return [h, s, v];
        },
      },
    },
  });
}

test('cloud-rendering buildCloudCubes creates signed instanced meshes', () => {
  const context = createContext();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const vol = {
      nxyz: [2, 1, 1],
      axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      data: Float32Array.from([1, -2]),
      idx(i) { return i; },
    };
    const group = window.VibeMolCloudRendering.buildCloudCubes(vol, {
      stride: 1,
      tLow: 0.5,
      alphaMax: 0.4,
      hiMode: 'max',
      posColorHex: '#ff0000',
      negColorHex: '#0000ff',
    });
    return {
      childCount: group.children.length,
      counts: group.children.map((child) => child.count),
      signs: group.children.map((child) => child.userData.sign),
    };
  })())`));
  assert.equal(result.childCount, 2);
  assert.deepEqual(result.counts, [1, 1]);
  assert.deepEqual(result.signs, ['pos', 'neg']);
});

test('cloud-rendering buildCloudPoints2CPhase returns one phase-hued points group', () => {
  const context = createContext();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const vol = {
      nxyz: [2, 1, 1],
      axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      alphaRe: Float32Array.from([1, 0]),
      alphaIm: Float32Array.from([0, 1]),
      betaRe: Float32Array.from([0, 0]),
      betaIm: Float32Array.from([0, 0]),
      idx(i) { return i; },
    };
    const group = window.VibeMolCloudRendering.buildCloudPoints2CPhase(vol, 'alpha', {
      stride: 1,
      tLow: 0.1,
      alphaMax: 0.4,
    });
    return {
      childCount: group.children.length,
      which: group.children[0] ? group.children[0].userData.which : null,
      positionCount: group.children[0] ? group.children[0].geometry.attributes.position.array.length : 0,
    };
  })())`));
  assert.equal(result.childCount, 1);
  assert.equal(result.which, 'alpha');
  assert.equal(result.positionCount, 6);
});

test('cloud-rendering buildCloudPoints2CTotal returns Bloch-colored points', () => {
  const context = createContext();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const vol = {
      nxyz: [1, 1, 1],
      axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      alphaRe: Float32Array.from([1]),
      alphaIm: Float32Array.from([0]),
      betaRe: Float32Array.from([0]),
      betaIm: Float32Array.from([0]),
      idx() { return 0; },
    };
    const group = window.VibeMolCloudRendering.buildCloudPoints2CTotal(vol, {
      stride: 1,
      tLow: 0.1,
      alphaMax: 0.4,
    });
    return {
      childCount: group.children.length,
      totalBloch: group.children[0] ? group.children[0].userData.totalBloch : false,
      colorCount: group.children[0] ? group.children[0].geometry.attributes.aColor.array.length : 0,
    };
  })())`));
  assert.equal(result.childCount, 1);
  assert.equal(result.totalBloch, true);
  assert.equal(result.colorCount, 3);
});
