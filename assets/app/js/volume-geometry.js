(function (global) {
  'use strict';

  const BOHR_TO_ANG = 0.529177210903;
  const ANG_TO_BOHR = 1.0 / BOHR_TO_ANG;
  const DEFAULT_VERTEX_WELD_TOLERANCE = 1e-4;
  const DEFAULT_NORMAL_EPSILON = 1e-12;

  /**
   * Convert atom coordinates from file units to angstrom world coordinates.
   * @param {{units?:string}} vol
   * @param {{x:number,y:number,z:number}} a
   * @returns {THREE.Vector3}
   */
  function atomUnitsToAng(vol, a) {
    if (vol.units === 'angstrom') return new global.THREE.Vector3(a.x, a.y, a.z);
    return new global.THREE.Vector3(a.x * BOHR_TO_ANG, a.y * BOHR_TO_ANG, a.z * BOHR_TO_ANG);
  }

  /**
   * Convert world-space angstrom coordinates back to the volume's native units.
   * @param {{units?:string}} vol
   * @param {{x:number,y:number,z:number}} v3
   * @returns {[number, number, number]}
   */
  function worldToAtomUnits(vol, v3) {
    if (vol.units === 'angstrom') return [v3.x, v3.y, v3.z];
    return [v3.x * ANG_TO_BOHR, v3.y * ANG_TO_BOHR, v3.z * ANG_TO_BOHR];
  }

  /**
   * Map voxel-space coordinates to world-space angstroms.
   * @param {{axes:number[][],origin:number[]}} vol
   * @param {[number, number, number]} p
   * @returns {[number, number, number]}
   */
  function voxelToWorld(vol, p) {
    const a = vol.axes[0].map(v => v * BOHR_TO_ANG);
    const b = vol.axes[1].map(v => v * BOHR_TO_ANG);
    const c = vol.axes[2].map(v => v * BOHR_TO_ANG);
    const o = vol.origin ? vol.origin.map(v => v * BOHR_TO_ANG) : [0, 0, 0];
    return [
      o[0] + p[0] * a[0] + p[1] * b[0] + p[2] * c[0],
      o[1] + p[0] * a[1] + p[1] * b[1] + p[2] * c[1],
      o[2] + p[0] * a[2] + p[1] * b[2] + p[2] * c[2],
    ];
  }

  function buildGridTransform(vol) {
    const a = vol.axes[0].map(v => v * BOHR_TO_ANG);
    const b = vol.axes[1].map(v => v * BOHR_TO_ANG);
    const c = vol.axes[2].map(v => v * BOHR_TO_ANG);
    const origin = vol.origin ? vol.origin.map(v => v * BOHR_TO_ANG) : [0, 0, 0];
    const worldFromGrid = [
      a[0], b[0], c[0],
      a[1], b[1], c[1],
      a[2], b[2], c[2],
    ];
    const gridFromWorld = invertMat3(worldFromGrid);
    return {
      origin,
      worldFromGrid,
      gridFromWorld,
      normalFromGrid: transposeMat3(gridFromWorld),
    };
  }

  function invertMat3(m) {
    const a00 = m[0], a01 = m[1], a02 = m[2];
    const a10 = m[3], a11 = m[4], a12 = m[5];
    const a20 = m[6], a21 = m[7], a22 = m[8];
    const b01 = a22 * a11 - a12 * a21;
    const b11 = -a22 * a10 + a12 * a20;
    const b21 = a21 * a10 - a11 * a20;
    const det = a00 * b01 + a01 * b11 + a02 * b21;
    if (!(Number.isFinite(det) && Math.abs(det) > 1e-12)) {
      return [
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
      ];
    }
    const invDet = 1 / det;
    return [
      b01 * invDet,
      (-a22 * a01 + a02 * a21) * invDet,
      (a12 * a01 - a02 * a11) * invDet,
      b11 * invDet,
      (a22 * a00 - a02 * a20) * invDet,
      (-a12 * a00 + a02 * a10) * invDet,
      b21 * invDet,
      (-a21 * a00 + a01 * a20) * invDet,
      (a11 * a00 - a01 * a10) * invDet,
    ];
  }

  function transposeMat3(m) {
    return [
      m[0], m[3], m[6],
      m[1], m[4], m[7],
      m[2], m[5], m[8],
    ];
  }

  function applyMat3(m, x, y, z) {
    return [
      m[0] * x + m[1] * y + m[2] * z,
      m[3] * x + m[4] * y + m[5] * z,
      m[6] * x + m[7] * y + m[8] * z,
    ];
  }

  function worldToVoxel(vol, world, transform = buildGridTransform(vol)) {
    const relX = world[0] - transform.origin[0];
    const relY = world[1] - transform.origin[1];
    const relZ = world[2] - transform.origin[2];
    return applyMat3(transform.gridFromWorld, relX, relY, relZ);
  }

  function sampleTrilinearGrid(dims, readVoxel, gx, gy, gz) {
    const nx = Math.max(1, dims[0] | 0);
    const ny = Math.max(1, dims[1] | 0);
    const nz = Math.max(1, dims[2] | 0);
    const sx = clamp(gx, 0, nx - 1);
    const sy = clamp(gy, 0, ny - 1);
    const sz = clamp(gz, 0, nz - 1);
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const z0 = Math.floor(sz);
    const x1 = Math.min(x0 + 1, nx - 1);
    const y1 = Math.min(y0 + 1, ny - 1);
    const z1 = Math.min(z0 + 1, nz - 1);
    const fx = sx - x0;
    const fy = sy - y0;
    const fz = sz - z0;
    const c000 = readVoxel(x0, y0, z0);
    const c100 = readVoxel(x1, y0, z0);
    const c010 = readVoxel(x0, y1, z0);
    const c110 = readVoxel(x1, y1, z0);
    const c001 = readVoxel(x0, y0, z1);
    const c101 = readVoxel(x1, y0, z1);
    const c011 = readVoxel(x0, y1, z1);
    const c111 = readVoxel(x1, y1, z1);
    const c00 = c000 * (1 - fx) + c100 * fx;
    const c10 = c010 * (1 - fx) + c110 * fx;
    const c01 = c001 * (1 - fx) + c101 * fx;
    const c11 = c011 * (1 - fx) + c111 * fx;
    const c0 = c00 * (1 - fy) + c10 * fy;
    const c1 = c01 * (1 - fy) + c11 * fy;
    return c0 * (1 - fz) + c1 * fz;
  }

  function createScalarFieldSampler(vol, field) {
    return function sampleScalar(gx, gy, gz) {
      return sampleTrilinearGrid(vol.nxyz, (i, j, k) => field[vol.idx(i, j, k)], gx, gy, gz);
    };
  }

  function computeGradientNormalsForVoxelPositions(vol, voxelPositions, sampleField, options = {}) {
    const count = Array.isArray(voxelPositions) ? voxelPositions.length : 0;
    const normalArray = new Float32Array(count * 3);
    if (!(count > 0 && typeof sampleField === 'function')) return normalArray;

    const transform = buildGridTransform(vol);
    const sign = Number(options.orientation) < 0 ? -1 : 1;
    const sampleStep = Number.isFinite(Number(options.sampleStep)) && Number(options.sampleStep) > 0
      ? Number(options.sampleStep)
      : 0.5;

    for (let i = 0; i < count; i++) {
      const grid = voxelPositions[i];
      const dfdx = (sampleField(grid[0] + sampleStep, grid[1], grid[2]) - sampleField(grid[0] - sampleStep, grid[1], grid[2])) / (2 * sampleStep);
      const dfdy = (sampleField(grid[0], grid[1] + sampleStep, grid[2]) - sampleField(grid[0], grid[1] - sampleStep, grid[2])) / (2 * sampleStep);
      const dfdz = (sampleField(grid[0], grid[1], grid[2] + sampleStep) - sampleField(grid[0], grid[1], grid[2] - sampleStep)) / (2 * sampleStep);
      const gradWorld = applyMat3(transform.normalFromGrid, dfdx, dfdy, dfdz);
      const len = Math.hypot(gradWorld[0], gradWorld[1], gradWorld[2]);
      if (len > DEFAULT_NORMAL_EPSILON) {
        normalArray[i * 3 + 0] = sign * gradWorld[0] / len;
        normalArray[i * 3 + 1] = sign * gradWorld[1] / len;
        normalArray[i * 3 + 2] = sign * gradWorld[2] / len;
      } else {
        normalArray[i * 3 + 0] = 0;
        normalArray[i * 3 + 1] = 0;
        normalArray[i * 3 + 2] = 1;
      }
    }

    return normalArray;
  }

  function mergeGeometryVertices(geometry, tolerance = DEFAULT_VERTEX_WELD_TOLERANCE) {
    if (!(geometry && geometry.attributes && geometry.attributes.position)) return geometry;
    const positionAttr = getGeometryAttribute(geometry, 'position');
    if (!(positionAttr && positionAttr.array && positionAttr.itemSize === 3)) return geometry;
    const indexAttr = geometry.index && geometry.index.array ? geometry.index : null;
    const sourceIndices = indexAttr
      ? Array.from(indexAttr.array)
      : Array.from({ length: positionAttr.array.length / positionAttr.itemSize }, (_unused, idx) => idx);
    const attrEntries = Object.keys(geometry.attributes).map((name) => [name, getGeometryAttribute(geometry, name)]);
    const mergedAttrData = new Map(attrEntries.map(([name]) => [name, []]));
    const keyToIndex = new Map();
    const mergedIndices = new Uint32Array(sourceIndices.length);
    const invTolerance = tolerance > 0 ? 1 / tolerance : 1e4;
    let nextIndex = 0;

    for (let i = 0; i < sourceIndices.length; i++) {
      const sourceIndex = sourceIndices[i];
      const px = positionAttr.array[sourceIndex * 3 + 0];
      const py = positionAttr.array[sourceIndex * 3 + 1];
      const pz = positionAttr.array[sourceIndex * 3 + 2];
      const key = `${Math.round(px * invTolerance)},${Math.round(py * invTolerance)},${Math.round(pz * invTolerance)}`;
      let mergedIndex = keyToIndex.get(key);
      if (mergedIndex === undefined) {
        mergedIndex = nextIndex++;
        keyToIndex.set(key, mergedIndex);
        for (const [name, attr] of attrEntries) {
          const values = mergedAttrData.get(name);
          const itemSize = attr.itemSize | 0;
          const offset = sourceIndex * itemSize;
          for (let j = 0; j < itemSize; j++) values.push(attr.array[offset + j]);
        }
      }
      mergedIndices[i] = mergedIndex;
    }

    const merged = new global.THREE.BufferGeometry();
    merged.setIndex(new global.THREE.BufferAttribute(mergedIndices, 1));
    for (const [name, attr] of attrEntries) {
      const values = mergedAttrData.get(name) || [];
      const ArrayType = attr && attr.array && attr.array.constructor ? attr.array.constructor : Float32Array;
      const nextAttr = new global.THREE.BufferAttribute(new ArrayType(values), attr.itemSize);
      if (Object.prototype.hasOwnProperty.call(attr, 'normalized')) nextAttr.normalized = !!attr.normalized;
      merged.setAttribute(name, nextAttr);
    }
    return merged;
  }

  function applyGradientNormals(geometry, vol, sampleField, options = {}) {
    const welded = mergeGeometryVertices(geometry, options.mergeTolerance);
    const positionAttr = getGeometryAttribute(welded, 'position');
    if (!(positionAttr && positionAttr.array && typeof sampleField === 'function')) return welded;
    const transform = buildGridTransform(vol);

    const voxelPositions = new Array(positionAttr.count);
    for (let i = 0; i < positionAttr.count; i++) {
      voxelPositions[i] = worldToVoxel(vol, [
        positionAttr.array[i * 3 + 0],
        positionAttr.array[i * 3 + 1],
        positionAttr.array[i * 3 + 2],
      ], transform);
    }
    const normalArray = computeGradientNormalsForVoxelPositions(vol, voxelPositions, sampleField, options);
    welded.setAttribute('normal', new global.THREE.BufferAttribute(normalArray, 3));
    return welded;
  }

  function getGeometryAttribute(geometry, name) {
    if (!geometry) return null;
    if (typeof geometry.getAttribute === 'function') return geometry.getAttribute(name);
    return geometry.attributes ? geometry.attributes[name] || null : null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Extract an isosurface mesh for a scalar field at a target level.
   * Vertices are welded in voxel space and then transformed into angstroms.
   * @param {{nxyz:number[],data:Float32Array,idx:(i:number,j:number,k:number)=>number,axes:number[][],origin:number[]}} vol
   * @param {number} level
   * @returns {THREE.BufferGeometry}
   */
  function makeIsosurface(vol, level) {
    const [nx, ny, nz] = vol.nxyz;
    const sampler = (x, y, z) => {
      const i = Math.max(0, Math.min(nx - 1, Math.floor(x)));
      const j = Math.max(0, Math.min(ny - 1, Math.floor(y)));
      const k = Math.max(0, Math.min(nz - 1, Math.floor(z)));
      return vol.data[vol.idx(i, j, k)];
    };
    const result = global.isosurface.marchingCubes([nx, ny, nz], (x, y, z) => sampler(x, y, z) - level);

    const voxPos = result.positions;
    const key = (p) => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)},${Math.round(p[2] * 1e6)}`;
    const map = new Map();
    const unique = [];
    const oldToNew = new Uint32Array(voxPos.length);
    for (let i = 0; i < voxPos.length; i++) {
      const k = key(voxPos[i]);
      let idx = map.get(k);
      if (idx === undefined) {
        idx = unique.length;
        map.set(k, idx);
        unique.push(voxPos[i]);
      }
      oldToNew[i] = idx;
    }

    const cells = result.cells;
    const indices = new Uint32Array(cells.length * 3);
    for (let t = 0; t < cells.length; t++) {
      const c = cells[t];
      indices[3 * t + 0] = oldToNew[c[0]];
      indices[3 * t + 1] = oldToNew[c[1]];
      indices[3 * t + 2] = oldToNew[c[2]];
    }

    const positions = new Float32Array(unique.length * 3);
    for (let i = 0; i < unique.length; i++) {
      const p = voxelToWorld(vol, unique[i]);
      positions[3 * i + 0] = p[0];
      positions[3 * i + 1] = p[1];
      positions[3 * i + 2] = p[2];
    }
    const normals = computeGradientNormalsForVoxelPositions(vol, unique, createScalarFieldSampler(vol, vol.data), {
      orientation: 1,
      sampleStep: 0.5,
    });

    const geom = new global.THREE.BufferGeometry();
    geom.setIndex(new global.THREE.BufferAttribute(indices, 1));
    geom.setAttribute('position', new global.THREE.BufferAttribute(positions, 3));
    geom.setAttribute('normal', new global.THREE.BufferAttribute(normals, 3));
    return geom;
  }

  global.VibeMolVolumeGeometry = Object.freeze({
    atomUnitsToAng,
    worldToAtomUnits,
    voxelToWorld,
    worldToVoxel,
    buildGridTransform,
    sampleTrilinearGrid,
    createScalarFieldSampler,
    computeGradientNormalsForVoxelPositions,
    mergeGeometryVertices,
    applyGradientNormals,
    makeIsosurface,
  });
})(typeof window !== 'undefined' ? window : globalThis);
