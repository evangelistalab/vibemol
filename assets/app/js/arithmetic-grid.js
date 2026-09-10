(function (global) {
  'use strict';

  const BOHR_TO_ANG = 0.529177210903;
  const MAX_TARGET_VOXELS = 16 * 1024 * 1024;
  const MAX_WORKING_BYTES = 256 * 1024 * 1024;

  function normalizeOperation(value) {
    const key = String(value || '').trim();
    if (key === 'product' || key === 'abs') return key;
    return 'linear_combination';
  }

  function createIndexFunction(nxyz) {
    const ny = Number(nxyz && nxyz[1]) || 0;
    const nz = Number(nxyz && nxyz[2]) || 0;
    return (i, j, k) => (i * ny + j) * nz + k;
  }

  function getOperandLabel(operand, index) {
    return String(operand && operand.label || `Operand ${index + 1}`);
  }

  function getVoxelCount(nxyz) {
    const nx = Number(nxyz && nxyz[0]);
    const ny = Number(nxyz && nxyz[1]);
    const nz = Number(nxyz && nxyz[2]);
    if (![nx, ny, nz].every(Number.isFinite)) return NaN;
    return nx * ny * nz;
  }

  function hasGridData(vol) {
    if (!vol || !Array.isArray(vol.nxyz) || typeof vol.idx !== 'function') return false;
    const nx = Number(vol.nxyz[0]);
    const ny = Number(vol.nxyz[1]);
    const nz = Number(vol.nxyz[2]);
    if (![nx, ny, nz].every(Number.isFinite) || nx <= 0 || ny <= 0 || nz <= 0) return false;
    const count = getVoxelCount(vol.nxyz);
    return !!(vol.data && typeof vol.data.length === 'number' && vol.data.length >= count);
  }

  function sameGrid(a, b) {
    if (!(a && b)) return false;
    const dimsA = Array.isArray(a.nxyz) ? a.nxyz : [];
    const dimsB = Array.isArray(b.nxyz) ? b.nxyz : [];
    if (dimsA.length !== dimsB.length) return false;
    for (let i = 0; i < dimsA.length; i += 1) {
      if (Number(dimsA[i]) !== Number(dimsB[i])) return false;
    }
    const originA = Array.isArray(a.origin) ? a.origin : [];
    const originB = Array.isArray(b.origin) ? b.origin : [];
    if (originA.length !== originB.length) return false;
    for (let i = 0; i < originA.length; i += 1) {
      if (Number(originA[i]) !== Number(originB[i])) return false;
    }
    const axesA = Array.isArray(a.axes) ? a.axes : [];
    const axesB = Array.isArray(b.axes) ? b.axes : [];
    if (axesA.length !== axesB.length) return false;
    for (let i = 0; i < axesA.length; i += 1) {
      const axisA = Array.isArray(axesA[i]) ? axesA[i] : [];
      const axisB = Array.isArray(axesB[i]) ? axesB[i] : [];
      if (axisA.length !== axisB.length) return false;
      for (let j = 0; j < axisA.length; j += 1) {
        if (Number(axisA[j]) !== Number(axisB[j])) return false;
      }
    }
    const dataA = a.data;
    const dataB = b.data;
    return !!(dataA && dataB && dataA.length === dataB.length);
  }

  function inspectAxisAlignedGrid(vol, label) {
    if (!hasGridData(vol)) {
      return { ok: false, kind: 'invalid', error: `Operand ${label} has an invalid grid` };
    }
    const nxyz = [
      Number(vol.nxyz[0]),
      Number(vol.nxyz[1]),
      Number(vol.nxyz[2]),
    ];
    if (!nxyz.every((value) => Number.isInteger(value) && value > 0)) {
      return { ok: false, kind: 'invalid', error: `Operand ${label} has an invalid grid` };
    }
    const origin = Array.isArray(vol.origin) ? vol.origin.slice(0, 3).map(Number) : [0, 0, 0];
    if (origin.length !== 3 || !origin.every(Number.isFinite)) {
      return { ok: false, kind: 'invalid', error: `Operand ${label} has an invalid grid` };
    }
    const axes = Array.isArray(vol.axes) ? vol.axes : [];
    if (axes.length < 3) {
      return { ok: false, kind: 'invalid', error: `Operand ${label} has an invalid grid` };
    }
    const step = [0, 0, 0];
    for (let i = 0; i < 3; i += 1) {
      const axis = Array.isArray(axes[i]) ? axes[i].slice(0, 3).map(Number) : [];
      if (axis.length !== 3 || !axis.every(Number.isFinite)) {
        return { ok: false, kind: 'invalid', error: `Operand ${label} has an invalid grid` };
      }
      for (let j = 0; j < 3; j += 1) {
        if (i !== j && Number(axis[j]) !== 0) {
          return { ok: false, kind: 'non_orthogonal', error: 'Non-orthogonal grids are not supported in this version' };
        }
      }
      const diagonal = Number(axis[i]);
      if (!(Number.isFinite(diagonal) && diagonal > 0)) {
        return { ok: false, kind: 'invalid', error: `Operand ${label} has an invalid grid` };
      }
      step[i] = diagonal;
    }
    return {
      ok: true,
      origin,
      step,
      nxyz,
      axes: [[step[0], 0, 0], [0, step[1], 0], [0, 0, step[2]]],
    };
  }

  function buildTargetGrid(specs, firstVol) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const step = [Infinity, Infinity, Infinity];
    for (const spec of specs) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], spec.origin[axis]);
        max[axis] = Math.max(max[axis], spec.origin[axis] + (spec.nxyz[axis] - 1) * spec.step[axis]);
        step[axis] = Math.min(step[axis], spec.step[axis]);
      }
    }
    if (![...min, ...max, ...step].every(Number.isFinite) || step.some((value) => value <= 0)) {
      return { ok: false, error: 'Selected operands do not define a valid target grid' };
    }
    const nxyz = step.map((spacing, axis) => Math.max(1, Math.ceil((max[axis] - min[axis]) / spacing - 1e-10) + 1));
    const count = getVoxelCount(nxyz);
    if (!(Number.isSafeInteger(count) && count > 0)) {
      return { ok: false, kind: 'too_large', error: 'The common grid exceeds the arithmetic memory limit. Use coarser or smaller grids.' };
    }
    const axes = [[step[0], 0, 0], [0, step[1], 0], [0, 0, step[2]]];
    return {
      ok: true,
      target: {
        origin: min,
        step,
        nxyz,
        axes,
        idx: createIndexFunction(nxyz),
      },
      baseVol: Object.assign({}, firstVol, {
        origin: min.slice(),
        axes: axes.map((axis) => axis.slice()),
        nxyz: nxyz.slice(),
        idx: createIndexFunction(nxyz),
        data: null,
      }),
      resamplePlan: {
        origin: min.slice(),
        axes: axes.map((axis) => axis.slice()),
        step: step.slice(),
        stepAng: step.map((value) => value * BOHR_TO_ANG),
        nxyz: nxyz.slice(),
        voxelCount: count,
      },
    };
  }

  function validateInputGrids(operands, limits = {}) {
    const entries = Array.isArray(operands) ? operands : [];
    if (!entries.length) return { ok: false, error: 'Choose at least one operand.' };
    const firstVol = entries[0] && entries[0].vol;
    if (!hasGridData(firstVol)) return { ok: false, error: 'Selected operand has no grid data.' };
    for (let index = 0; index < entries.length; index += 1) {
      const vol = entries[index] && entries[index].vol;
      if (!hasGridData(vol)) return { ok: false, error: 'Selected operand has no grid data.' };
    }
    const specs = [];
    for (let index = 0; index < entries.length; index += 1) {
      const label = getOperandLabel(entries[index], index);
      const spec = inspectAxisAlignedGrid(entries[index].vol, label);
      if (!spec.ok) return { ok: false, error: spec.error, immediate: true, kind: spec.kind };
      specs.push(spec);
    }
    const same = entries.every((entry) => sameGrid(firstVol, entry.vol));
    const target = same
      ? { ok: true, baseVol: firstVol, resamplePlan: null }
      : buildTargetGrid(specs, firstVol);
    if (!target.ok) return Object.assign({ immediate: true }, target);
    const voxelCount = getVoxelCount(target.baseVol.nxyz);
    const sourceBytes = entries.reduce((sum, entry) => sum + (entry.vol.data.byteLength || entry.vol.data.length * 8), 0);
    // Account for immutable source buffers, worker copies, and the result.
    const workingBytes = sourceBytes * 2 + voxelCount * 4;
    const maxVoxels = Math.min(Number(limits.maxVoxels) || MAX_TARGET_VOXELS, MAX_TARGET_VOXELS);
    const maxBytes = Math.min(Number(limits.maxBytes) || MAX_WORKING_BYTES, MAX_WORKING_BYTES);
    if (voxelCount > maxVoxels || workingBytes > maxBytes) {
      return { ok: false, immediate: true, kind: 'too_large', error: 'The common grid exceeds the arithmetic memory limit. Use coarser or smaller grids.' };
    }
    return {
      ok: true,
      voxelCount,
      workingBytes,
      baseVol: target.baseVol,
      sameGrid: same,
      resamplePlan: target.resamplePlan,
      specs,
    };
  }

  function readVoxel(data, nxyz, i, j, k) {
    const ny = nxyz[1];
    const nz = nxyz[2];
    return Number(data[(i * ny + j) * nz + k]) || 0;
  }

  function sampleTrilinear(spec, data, x, y, z) {
    let u = (x - spec.origin[0]) / spec.step[0];
    let v = (y - spec.origin[1]) / spec.step[1];
    let w = (z - spec.origin[2]) / spec.step[2];
    const nx = spec.nxyz[0];
    const ny = spec.nxyz[1];
    const nz = spec.nxyz[2];
    const tolerance = 1e-10;
    if (u < -tolerance || v < -tolerance || w < -tolerance || u > nx - 1 + tolerance || v > ny - 1 + tolerance || w > nz - 1 + tolerance) return 0;
    u = Math.max(0, Math.min(nx - 1, u));
    v = Math.max(0, Math.min(ny - 1, v));
    w = Math.max(0, Math.min(nz - 1, w));
    const i0 = Math.floor(u);
    const j0 = Math.floor(v);
    const k0 = Math.floor(w);
    const i1 = Math.min(i0 + 1, nx - 1);
    const j1 = Math.min(j0 + 1, ny - 1);
    const k1 = Math.min(k0 + 1, nz - 1);
    const fu = u - i0;
    const fv = v - j0;
    const fw = w - k0;

    const v000 = readVoxel(data, spec.nxyz, i0, j0, k0);
    const v001 = readVoxel(data, spec.nxyz, i0, j0, k1);
    const v010 = readVoxel(data, spec.nxyz, i0, j1, k0);
    const v011 = readVoxel(data, spec.nxyz, i0, j1, k1);
    const v100 = readVoxel(data, spec.nxyz, i1, j0, k0);
    const v101 = readVoxel(data, spec.nxyz, i1, j0, k1);
    const v110 = readVoxel(data, spec.nxyz, i1, j1, k0);
    const v111 = readVoxel(data, spec.nxyz, i1, j1, k1);

    const v00 = v000 * (1 - fw) + v001 * fw;
    const v01 = v010 * (1 - fw) + v011 * fw;
    const v10 = v100 * (1 - fw) + v101 * fw;
    const v11 = v110 * (1 - fw) + v111 * fw;
    const v0 = v00 * (1 - fv) + v01 * fv;
    const v1 = v10 * (1 - fv) + v11 * fv;
    return v0 * (1 - fu) + v1 * fu;
  }

  function createComputation(operation, operands, outputName, limits = {}) {
    const op = normalizeOperation(operation);
    const entries = Array.isArray(operands) ? operands : [];
    if (op === 'abs' && entries.length !== 1) return { ok: false, error: 'Abs requires exactly one operand.' };
    if (op === 'product' && entries.length < 2) return { ok: false, error: 'Product requires at least two operands.' };
    const grid = validateInputGrids(entries, limits);
    if (!grid.ok) return grid;
    const out = new Float32Array(grid.voxelCount);
    const [, ny, nz] = grid.baseVol.nxyz;
    let cursor = 0;
    function step(budget = 32768) {
      const end = Math.min(out.length, cursor + budget);
      for (; cursor < end; cursor += 1) {
        let value = op === 'product' ? 1 : 0;
        const i = Math.floor(cursor / (ny * nz));
        const j = Math.floor(cursor / nz) % ny;
        const k = cursor % nz;
        for (let n = 0; n < entries.length; n += 1) {
          const entry = entries[n];
          const sample = grid.sameGrid ? Number(entry.vol.data[cursor]) || 0 : sampleTrilinear(
            grid.specs[n], entry.vol.data,
            grid.baseVol.origin[0] + i * grid.resamplePlan.step[0],
            grid.baseVol.origin[1] + j * grid.resamplePlan.step[1],
            grid.baseVol.origin[2] + k * grid.resamplePlan.step[2]
          );
          if (op === 'abs') value = Math.abs(sample);
          else if (op === 'product') value *= sample;
          else value += (Number.isFinite(Number(entry.coefficient)) ? Number(entry.coefficient) : 1) * sample;
        }
        out[cursor] = value;
      }
      return cursor === out.length;
    }
    const result = { ok: true, outputName, baseVol: grid.baseVol, data: out, sameGrid: grid.sameGrid, resamplePlan: grid.resamplePlan };
    return { ok: true, step, result };
  }

  function compute(operation, operands, outputName, limits) {
    const computation = createComputation(operation, operands, outputName, limits);
    if (!computation.ok) return computation;
    while (!computation.step()) { /* Synchronous entry point for workers and small unit fixtures. */ }
    return computation.result;
  }

  function formatNumber(value, precision = 3) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    if (n === 0) return '0';
    const raw = n.toPrecision(precision);
    const parts = raw.split(/e/i);
    const mantissa = parts[0].replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '');
    return parts.length > 1 ? `${mantissa}e${parts[1]}` : mantissa;
  }

  function formatResampleNotice(plan) {
    if (!(plan && Array.isArray(plan.nxyz) && Array.isArray(plan.stepAng))) return '';
    const dims = plan.nxyz.map((value) => Math.max(0, Number(value) | 0)).join('\u00d7');
    const steps = plan.stepAng || [];
    const sameStep = steps.length >= 3 && Math.abs(steps[0] - steps[1]) < 1e-12 && Math.abs(steps[0] - steps[2]) < 1e-12;
    const stepText = sameStep
      ? formatNumber(steps[0], 3)
      : steps.slice(0, 3).map((value) => formatNumber(value, 3)).join('\u00d7');
    return `\u24d8 Resampling onto common grid: ${dims} voxels (${stepText} \u00c5)`;
  }

  global.VibeMolArithmeticGrid = Object.freeze({
    MAX_TARGET_VOXELS,
    MAX_WORKING_BYTES,
    normalizeOperation,
    createComputation,
    sameGrid,
    inspectAxisAlignedGrid,
    validateInputGrids,
    sampleTrilinear,
    compute,
    formatResampleNotice,
  });
})(typeof window !== 'undefined' ? window : globalThis);
