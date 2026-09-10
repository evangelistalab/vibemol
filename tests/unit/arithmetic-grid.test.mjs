import test from 'node:test';
import assert from 'node:assert/strict';

import { loadGlobalModule } from './load-global-module.mjs';

function loadApi() {
  const context = loadGlobalModule('assets/app/js/arithmetic-grid.js');
  return context.VibeMolArithmeticGrid;
}

function makeVolume(nxyz, origin, step, valueAt) {
  const [nx, ny, nz] = nxyz;
  const data = new Float32Array(nx * ny * nz);
  const idx = (i, j, k) => (i * ny + j) * nz + k;
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let k = 0; k < nz; k += 1) {
        data[idx(i, j, k)] = Number(valueAt(i, j, k));
      }
    }
  }
  return {
    title: 'test',
    origin: origin.slice(),
    nxyz: nxyz.slice(),
    axes: [[step[0], 0, 0], [0, step[1], 0], [0, 0, step[2]]],
    atoms: [],
    data,
    idx,
    units: 'bohr',
  };
}

function operand(label, vol, coefficient = 1) {
  return { label, vol, coefficient };
}

function at(vol, data, i, j, k) {
  return Number(data[vol.idx(i, j, k)]);
}

test('arithmetic grid compute preserves exact-grid fast path', () => {
  const api = loadApi();
  const a = makeVolume([2, 2, 2], [0, 0, 0], [1, 1, 1], (i, j, k) => i + j + k);
  const b = makeVolume([2, 2, 2], [0, 0, 0], [1, 1, 1], () => 1);

  const result = api.compute('linear_combination', [operand('L0', a, 1), operand('L1', b, -1)], 'L0 - L1');

  assert.equal(result.ok, true);
  assert.equal(result.sameGrid, true);
  assert.equal(result.resamplePlan, null);
  assert.deepEqual(Array.from(result.baseVol.nxyz), [2, 2, 2]);
  assert.equal(at(result.baseVol, result.data, 0, 0, 0), -1);
  assert.equal(at(result.baseVol, result.data, 1, 1, 1), 2);
});

test('arithmetic grid resamples mismatched grids onto finest union target', () => {
  const api = loadApi();
  const low = makeVolume([2, 2, 2], [0, 0, 0], [1, 1, 1], (i, j, k) => i + j + k);
  const high = makeVolume([3, 3, 3], [0, 0, 0], [0.5, 0.5, 0.5], () => 10);

  const result = api.compute('linear_combination', [operand('L0', low, 1), operand('L1', high, 1)], 'sum');

  assert.equal(result.ok, true);
  assert.equal(result.sameGrid, false);
  assert.deepEqual(Array.from(result.baseVol.nxyz), [3, 3, 3]);
  assert.deepEqual(Array.from(result.resamplePlan.nxyz), [3, 3, 3]);
  assert.deepEqual(Array.from(result.baseVol.axes[0]), [0.5, 0, 0]);
  assert.equal(at(result.baseVol, result.data, 1, 1, 1), 11.5);
  assert.equal(at(result.baseVol, result.data, 2, 2, 2), 13);
});

test('arithmetic grid zero-extrapolates outside one operand bounding box', () => {
  const api = loadApi();
  const short = makeVolume([2, 2, 2], [0, 0, 0], [1, 1, 1], () => 2);
  const wide = makeVolume([4, 4, 4], [0, 0, 0], [1, 1, 1], () => 5);

  const result = api.compute('linear_combination', [operand('L0', short, 1), operand('L1', wide, 1)], 'sum');

  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(result.baseVol.nxyz), [4, 4, 4]);
  assert.equal(at(result.baseVol, result.data, 0, 0, 0), 7);
  assert.equal(at(result.baseVol, result.data, 2, 1, 1), 5);
});

test('arithmetic grid rejects invalid and non-orthogonal grids clearly', () => {
  const api = loadApi();
  const valid = makeVolume([2, 2, 2], [0, 0, 0], [1, 1, 1], () => 1);
  const invalid = makeVolume([2, 2, 2], [0, 0, 0], [1, 1, 1], () => 1);
  invalid.axes = [[0, 0, 0], [0, 1, 0], [0, 0, 1]];
  const rotated = makeVolume([2, 2, 2], [0, 0, 0], [1, 1, 1], () => 1);
  rotated.axes = [[1, 0.1, 0], [0, 1, 0], [0, 0, 1]];

  const invalidResult = api.compute('linear_combination', [operand('L0', valid), operand('L1', invalid)], 'bad');
  assert.equal(invalidResult.ok, false);
  assert.equal(invalidResult.error, 'Operand L1 has an invalid grid');

  const rotatedResult = api.compute('linear_combination', [operand('L0', valid), operand('L2', rotated)], 'bad');
  assert.equal(rotatedResult.ok, false);
  assert.equal(rotatedResult.error, 'Non-orthogonal grids are not supported in this version');
});

test('arithmetic grid formats resample notice with target dimensions and spacing', () => {
  const api = loadApi();
  const notice = api.formatResampleNotice({ nxyz: [84, 72, 84], stepAng: [0.1, 0.1, 0.1] });
  assert.equal(notice, '\u24d8 Resampling onto common grid: 84\u00d772\u00d784 voxels (0.1 \u00c5)');
});

test('resampling includes every upper plane, edge, and corner', () => {
  const api = loadApi();
  const short = makeVolume([2, 2, 2], [0, 0, 0], [1, 1, 1], () => 2);
  const wide = makeVolume([3, 3, 3], [0, 0, 0], [1, 1, 1], () => 5);
  const result = api.compute('linear_combination', [operand('short', short), operand('wide', wide)], 'sum');
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
    assert.equal(at(result.baseVol, result.data, i, j, k), 7, `endpoint ${i},${j},${k}`);
  }
  assert.equal(at(result.baseVol, result.data, 2, 2, 2), 5);
});

test('singleton axes and decimal endpoints retain their scalar values', () => {
  const api = loadApi();
  const plane = makeVolume([1, 2, 2], [0.1, 0.1, 0.1], [0.1, 0.1, 0.1], () => 2);
  const volume = makeVolume([2, 3, 3], [0.1, 0.1, 0.1], [0.1, 0.05, 0.05], () => 5);
  const result = api.compute('product', [operand('plane', plane), operand('volume', volume)], 'product');
  assert.equal(at(result.baseVol, result.data, 0, 2, 2), 10);
  assert.equal(at(result.baseVol, result.data, 1, 2, 2), 0);
});

test('validation plans resampling without allocating scalar buffers', () => {
  const a = makeVolume([2, 2, 2], [0, 0, 0], [1, 1, 1], () => 1);
  const b = makeVolume([3, 3, 3], [0, 0, 0], [0.5, 0.5, 0.5], () => 2);
  const context = loadGlobalModule('assets/app/js/arithmetic-grid.js', { globals: {
    Float32Array: new Proxy(Float32Array, { construct() { throw new Error('Unexpected allocation'); } }),
  } });
  for (let i = 0; i < 20; i++) {
    const plan = context.VibeMolArithmeticGrid.validateInputGrids([operand('a', a), operand('b', b)]);
    assert.equal(plan.ok, true);
    assert.equal(plan.baseVol.data, null);
    assert.equal(plan.voxelCount, 27);
  }
});

test('memory and voxel budgets reject a calculation before evaluation', () => {
  const api = loadApi();
  const a = makeVolume([2, 2, 2], [0, 0, 0], [1, 1, 1], () => 1);
  const operands = [operand('a', a)];
  assert.equal(api.validateInputGrids(operands, { maxVoxels: 7 }).kind, 'too_large');
  assert.equal(api.validateInputGrids(operands, { maxBytes: 80 }).kind, 'too_large');
  assert.equal(api.compute('abs', operands, 'abs', { maxVoxels: 7 }).ok, false);
});
