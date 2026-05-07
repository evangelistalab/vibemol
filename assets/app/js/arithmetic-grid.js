(function (global) {
  'use strict';

  const BOHR_TO_ANG = 0.529177210903;
  const MAX_TARGET_VOXELS = Number.MAX_SAFE_INTEGER;

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
        max[axis] = Math.max(max[axis], spec.origin[axis] + spec.nxyz[axis] * spec.step[axis]);
        step[axis] = Math.min(step[axis], spec.step[axis]);
      }
    }
    if (![...min, ...max, ...step].every(Number.isFinite) || step.some((value) => value <= 0)) {
      return { ok: false, error: 'Selected operands do not define a valid target grid' };
    }
    const nxyz = step.map((spacing, axis) => Math.max(1, Math.ceil((max[axis] - min[axis]) / spacing)));
    const count = getVoxelCount(nxyz);
    if (!(Number.isFinite(count) && count > 0 && count <= MAX_TARGET_VOXELS)) {
      return { ok: false, error: 'Selected operands produce an invalid target grid' };
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
        data: new Float32Array(count),
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

  function validateInputGrids(operands) {
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
    if (same) return { ok: true, baseVol: firstVol, sameGrid: true, resamplePlan: null };
    const target = buildTargetGrid(specs, firstVol);
    if (!target.ok) return Object.assign({ immediate: true }, target);
    return {
      ok: true,
      baseVol: target.baseVol,
      sameGrid: false,
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
    const u = (x - spec.origin[0]) / spec.step[0];
    const v = (y - spec.origin[1]) / spec.step[1];
    const w = (z - spec.origin[2]) / spec.step[2];
    const nx = spec.nxyz[0];
    const ny = spec.nxyz[1];
    const nz = spec.nxyz[2];
    if (u < 0 || v < 0 || w < 0 || u >= nx - 1 || v >= ny - 1 || w >= nz - 1) return 0;
    const i0 = Math.floor(u);
    const j0 = Math.floor(v);
    const k0 = Math.floor(w);
    const i1 = i0 + 1;
    const j1 = j0 + 1;
    const k1 = k0 + 1;
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

  function resampleOperandToTarget(operand, spec, target) {
    const [nx, ny, nz] = target.nxyz;
    const out = new Float32Array(nx * ny * nz);
    const data = operand && operand.vol && operand.vol.data;
    let cursor = 0;
    for (let i = 0; i < nx; i += 1) {
      const x = target.origin[0] + i * target.step[0];
      for (let j = 0; j < ny; j += 1) {
        const y = target.origin[1] + j * target.step[1];
        for (let k = 0; k < nz; k += 1) {
          const z = target.origin[2] + k * target.step[2];
          out[cursor] = sampleTrilinear(spec, data, x, y, z);
          cursor += 1;
        }
      }
    }
    return out;
  }

  function compute(operation, operands, outputName) {
    const op = normalizeOperation(operation);
    const entries = Array.isArray(operands) ? operands : [];
    if (op === 'abs' && entries.length !== 1) return { ok: false, error: 'Abs requires exactly one operand.' };
    if (op === 'product' && entries.length < 2) return { ok: false, error: 'Product requires at least two operands.' };
    if (op === 'linear_combination' && entries.length < 1) return { ok: false, error: 'Choose at least one operand.' };
    const grid = validateInputGrids(entries);
    if (!grid.ok) return grid;
    const baseVol = grid.baseVol;
    const length = getVoxelCount(baseVol.nxyz);
    const out = new Float32Array(length);
    let dataByOperand = entries.map((entry) => entry.vol.data);
    if (!grid.sameGrid) {
      const target = {
        origin: grid.resamplePlan.origin,
        step: grid.resamplePlan.step,
        nxyz: grid.resamplePlan.nxyz,
      };
      dataByOperand = entries.map((entry, index) => resampleOperandToTarget(entry, grid.specs[index], target));
    }
    if (op === 'abs') {
      const data = dataByOperand[0];
      for (let i = 0; i < length; i += 1) out[i] = Math.abs(Number(data[i]) || 0);
    } else if (op === 'product') {
      out.fill(1);
      for (const data of dataByOperand) {
        for (let i = 0; i < length; i += 1) out[i] *= Number(data[i]) || 0;
      }
    } else {
      for (let operandIndex = 0; operandIndex < entries.length; operandIndex += 1) {
        const data = dataByOperand[operandIndex];
        const coefficient = Number.isFinite(Number(entries[operandIndex].coefficient))
          ? Number(entries[operandIndex].coefficient)
          : 1;
        for (let i = 0; i < length; i += 1) out[i] += coefficient * (Number(data[i]) || 0);
      }
    }
    return {
      ok: true,
      outputName,
      baseVol,
      data: out,
      sameGrid: !!grid.sameGrid,
      resamplePlan: grid.resamplePlan || null,
    };
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
    normalizeOperation,
    sameGrid,
    inspectAxisAlignedGrid,
    validateInputGrids,
    sampleTrilinear,
    compute,
    formatResampleNotice,
  });
})(typeof window !== 'undefined' ? window : globalThis);
