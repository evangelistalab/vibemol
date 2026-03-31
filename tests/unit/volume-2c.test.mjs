import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateInContext, loadGlobalModule } from './load-global-module.mjs';

function createThreeStub() {
  class BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
    }
  }
  class BufferGeometry {
    constructor() {
      this.index = null;
      this.attributes = {};
      this.normalsComputed = false;
    }
    setIndex(attr) { this.index = attr; }
    setAttribute(name, attr) { this.attributes[name] = attr; }
    computeVertexNormals() { this.normalsComputed = true; }
  }
  return { BufferAttribute, BufferGeometry };
}

function createContext() {
  return loadGlobalModule('assets/app/js/volume-2c.js', {
    globals: {
      THREE: createThreeStub(),
      VibeMolVolumeGeometry: {
        voxelToWorld(_vol, p) {
          return [p[0] + 10, p[1] + 20, p[2] + 30];
        },
      },
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
}

test('volume-2c hsvToRgb returns canonical primaries', () => {
  const context = createContext();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify([
    window.VibeMolVolume2C.hsvToRgb(0, 1, 1),
    window.VibeMolVolume2C.hsvToRgb(1/3, 1, 1),
    window.VibeMolVolume2C.hsvToRgb(2/3, 1, 1)
  ])`));
  assert.deepEqual(result, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
});

test('volume-2c phase isosurface produces welded geometry with colors', () => {
  const context = createContext();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const vol = {
      nxyz: [2, 2, 2],
      alphaRe: new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]),
      alphaIm: new Float32Array([0, 1, 0, 0, 0, 0, 0, 0]),
      betaRe: new Float32Array([0, 0, 1, 0, 0, 0, 0, 0]),
      betaIm: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0]),
      idx(i, j, k) { return i + 2 * (j + 2 * k); },
    };
    const geom = window.VibeMolVolume2C.make2CPhaseIsosurface(vol, 'alpha', 0.1);
    return {
      index: Array.from(geom.index.array),
      positions: Array.from(geom.attributes.position.array),
      colors: Array.from(geom.attributes.color.array),
      normalsComputed: geom.normalsComputed,
    };
  })())`));
  assert.deepEqual(result.index, [0, 1, 2, 1, 2, 0]);
  assert.equal(result.positions.length, 9);
  assert.equal(result.colors.length, 9);
  assert.equal(result.normalsComputed, true);
  assert.deepEqual(result.positions.slice(0, 3), [10, 20, 30]);
});

test('volume-2c total-colored isosurface produces vertex colors', () => {
  const context = createContext();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const vol = {
      nxyz: [2, 2, 2],
      alphaRe: new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]),
      alphaIm: new Float32Array([0, 1, 0, 0, 0, 0, 0, 0]),
      betaRe: new Float32Array([0, 0, 1, 0, 0, 0, 0, 0]),
      betaIm: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0]),
      idx(i, j, k) { return i + 2 * (j + 2 * k); },
    };
    const geom = window.VibeMolVolume2C.make2CTotalColoredIsosurface(vol, 0.1);
    return {
      index: Array.from(geom.index.array),
      positions: Array.from(geom.attributes.position.array),
      colors: Array.from(geom.attributes.color.array),
      normalsComputed: geom.normalsComputed,
    };
  })())`));
  assert.deepEqual(result.index, [0, 1, 2, 1, 2, 0]);
  assert.equal(result.positions.length, 9);
  assert.equal(result.colors.length, 9);
  assert.equal(result.normalsComputed, true);
});
