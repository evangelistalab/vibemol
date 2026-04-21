import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateInContext, loadGlobalModule } from './load-global-module.mjs';

function createThreeStub() {
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
  }

  class BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
      this.count = array.length / itemSize;
      this.normalized = false;
    }
  }

  class BufferGeometry {
    constructor() {
      this.index = null;
      this.attributes = {};
      this.normalsComputed = false;
    }
    setIndex(attr) {
      this.index = attr;
    }
    setAttribute(name, attr) {
      this.attributes[name] = attr;
    }
    getAttribute(name) {
      return this.attributes[name] || null;
    }
    computeVertexNormals() {
      this.normalsComputed = true;
    }
  }

  return { Vector3, BufferAttribute, BufferGeometry };
}

test('volume geometry converts atom and world coordinates between bohr and angstrom', () => {
  const context = loadGlobalModule('assets/app/js/volume-geometry.js', {
    globals: {
      THREE: createThreeStub(),
      isosurface: { marchingCubes: () => ({ positions: [], cells: [] }) },
    },
  });
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const vol = { units: 'bohr' };
    const ang = window.VibeMolVolumeGeometry.atomUnitsToAng(vol, { x: 1, y: 2, z: 3 });
    const back = window.VibeMolVolumeGeometry.worldToAtomUnits(vol, { x: ang.x, y: ang.y, z: ang.z });
    const angVol = { units: 'angstrom' };
    const same = window.VibeMolVolumeGeometry.worldToAtomUnits(angVol, { x: 1.25, y: -2.5, z: 0.5 });
    return {
      ang: [ang.x, ang.y, ang.z],
      back,
      same,
    };
  })())`));

  assert.deepEqual(result.back.map((v) => Number(v.toFixed(6))), [1, 2, 3]);
  assert.deepEqual(result.same, [1.25, -2.5, 0.5]);
  assert.deepEqual(result.ang.map((v) => Number(v.toFixed(6))), [0.529177, 1.058354, 1.587532]);
});

test('volume geometry maps voxel coordinates and welds marching-cubes vertices', () => {
  const context = loadGlobalModule('assets/app/js/volume-geometry.js', {
    globals: {
      THREE: createThreeStub(),
      isosurface: {
        marchingCubes: () => ({
          positions: [
            [0, 0, 0],
            [1, 0, 0],
            [0, 1, 0],
            [1, 0, 0],
          ],
          cells: [
            [0, 1, 2],
            [3, 2, 0],
          ],
        }),
      },
    },
  });
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const vol = {
      nxyz: [2, 2, 2],
      data: new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]),
      idx(i, j, k) { return i + 2 * (j + 2 * k); },
      origin: [0, 0, 0],
      axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    };
    const geom = window.VibeMolVolumeGeometry.makeIsosurface(vol, 0.5);
    return {
      world: window.VibeMolVolumeGeometry.voxelToWorld(vol, [1, 2, 3]),
      index: Array.from(geom.index.array),
      positions: Array.from(geom.attributes.position.array),
      normalsComputed: geom.normalsComputed,
    };
  })())`));

  assert.deepEqual(result.world.map((v) => Number(v.toFixed(6))), [0.529177, 1.058354, 1.587532]);
  assert.deepEqual(result.index, [0, 1, 2, 1, 2, 0]);
  assert.equal(result.positions.length, 9);
  assert.equal(result.normalsComputed, false);
});

test('volume geometry applies gradient-based normals to welded isosurface vertices', () => {
  const context = loadGlobalModule('assets/app/js/volume-geometry.js', {
    globals: {
      THREE: createThreeStub(),
      isosurface: {
        marchingCubes: () => ({
          positions: [
            [1.5, 1, 1],
            [1.5, 2, 1],
            [1.5, 1, 2],
            [1.5, 1, 2],
          ],
          cells: [
            [0, 1, 2],
            [0, 1, 3],
          ],
        }),
      },
    },
  });
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const data = new Float32Array(4 * 4 * 4);
    for (let k = 0; k < 4; k++) {
      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 4; i++) {
          data[i + 4 * (j + 4 * k)] = i;
        }
      }
    }
    const vol = {
      nxyz: [4, 4, 4],
      data,
      idx(i, j, k) { return i + 4 * (j + 4 * k); },
      origin: [0, 0, 0],
      axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    };
    const geom = window.VibeMolVolumeGeometry.makeIsosurface(vol, 1.5);
    return {
      uniqueVertexCount: geom.attributes.position.count,
      normals: Array.from(geom.attributes.normal.array),
      indices: Array.from(geom.index.array),
    };
  })())`));

  assert.equal(result.uniqueVertexCount, 3);
  assert.deepEqual(result.indices, [0, 1, 2, 0, 1, 2]);
  for (let i = 0; i < result.normals.length; i += 3) {
    assert.ok(result.normals[i + 0] > 0.99, `expected strong +X normal, got ${result.normals.slice(i, i + 3)}`);
    assert.ok(Math.abs(result.normals[i + 1]) < 1e-6, `expected near-zero Y normal, got ${result.normals.slice(i, i + 3)}`);
    assert.ok(Math.abs(result.normals[i + 2]) < 1e-6, `expected near-zero Z normal, got ${result.normals.slice(i, i + 3)}`);
  }
});

test('volume geometry keeps gradient normals consistent for negative lobes', () => {
  const context = loadGlobalModule('assets/app/js/volume-geometry.js', {
    globals: {
      THREE: createThreeStub(),
      isosurface: {
        marchingCubes: () => ({
          positions: [
            [1.5, 1, 1],
            [1.5, 2, 1],
            [1.5, 1, 2],
          ],
          cells: [
            [0, 1, 2],
          ],
        }),
      },
    },
  });
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const data = new Float32Array(4 * 4 * 4);
    for (let k = 0; k < 4; k++) {
      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 4; i++) {
          data[i + 4 * (j + 4 * k)] = i;
        }
      }
    }
    const vol = {
      nxyz: [4, 4, 4],
      data,
      idx(i, j, k) { return i + 4 * (j + 4 * k); },
      origin: [0, 0, 0],
      axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    };
    const geom = window.VibeMolVolumeGeometry.makeIsosurface(vol, -1.5);
    return Array.from(geom.attributes.normal.array);
  })())`));

  for (let i = 0; i < result.length; i += 3) {
    assert.ok(result[i + 0] > 0.99, `expected strong +X normal, got ${result.slice(i, i + 3)}`);
    assert.ok(Math.abs(result[i + 1]) < 1e-6, `expected near-zero Y normal, got ${result.slice(i, i + 3)}`);
    assert.ok(Math.abs(result[i + 2]) < 1e-6, `expected near-zero Z normal, got ${result.slice(i, i + 3)}`);
  }
});
