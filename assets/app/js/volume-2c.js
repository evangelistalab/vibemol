(function (global) {
  'use strict';

  const {
    voxelToWorld,
    sampleTrilinearGrid,
    computeGradientNormalsForVoxelPositions,
  } = global.VibeMolVolumeGeometry || {};
  if (
    typeof voxelToWorld !== 'function'
    || typeof sampleTrilinearGrid !== 'function'
    || typeof computeGradientNormalsForVoxelPositions !== 'function'
  ) {
    throw new Error('VibeMolVolumeGeometry is not loaded. Ensure assets/app/js/volume-geometry.js is included before assets/app/js/volume-2c.js.');
  }

  /**
   * Convert HSV color values in [0,1] to RGB.
   * @param {number} h
   * @param {number} s
   * @param {number} v
   * @returns {[number, number, number]}
   */
  function hsvToRgb(h, s, v) {
    let r = 0, g = 0, b = 0;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return [r, g, b];
  }

  /**
   * Build a phase-colored isosurface for alpha or beta complex components.
   * Vertex hue encodes the local complex phase angle.
   * @param {{nxyz:number[],idx:(i:number,j:number,k:number)=>number,alphaRe:Float32Array,alphaIm:Float32Array,betaRe:Float32Array,betaIm:Float32Array}} vol
   * @param {'alpha'|'beta'} which
   * @param {number} level
   * @returns {THREE.BufferGeometry}
   */
  function make2CPhaseIsosurface(vol, which, level) {
    const [nx, ny, nz] = vol.nxyz;
    const isAlpha = which === 'alpha';
    const re = isAlpha ? vol.alphaRe : vol.betaRe;
    const im = isAlpha ? vol.alphaIm : vol.betaIm;
    const idx = vol.idx;
    const clampi = (x, n) => Math.max(0, Math.min(n - 1, x | 0));
    const magnitudeAt = (i, j, k) => {
      const t = idx(i, j, k);
      const rr = re[t];
      const ii = im[t];
      return Math.hypot(rr, ii);
    };
    const magSampler = (x, y, z) => {
      const i = clampi(Math.floor(x), nx);
      const j = clampi(Math.floor(y), ny);
      const k = clampi(Math.floor(z), nz);
      return magnitudeAt(i, j, k);
    };
    const res = global.isosurface.marchingCubes([nx, ny, nz], (x, y, z) => magSampler(x, y, z) - level);
    const voxPos = res.positions;
    const key = (p) => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)},${Math.round(p[2] * 1e6)}`;
    const map = new Map();
    const unique = [];
    const oldToNew = new Uint32Array(voxPos.length);
    for (let i = 0; i < voxPos.length; i++) {
      const k = key(voxPos[i]);
      let id = map.get(k);
      if (id === undefined) { id = unique.length; map.set(k, id); unique.push(voxPos[i]); }
      oldToNew[i] = id;
    }
    const cells = res.cells;
    const indices = new Uint32Array(cells.length * 3);
    for (let t = 0; t < cells.length; t++) {
      const c = cells[t];
      indices[3 * t + 0] = oldToNew[c[0]];
      indices[3 * t + 1] = oldToNew[c[1]];
      indices[3 * t + 2] = oldToNew[c[2]];
    }
    const positions = new Float32Array(unique.length * 3);
    const colors = new Float32Array(unique.length * 3);
    for (let i = 0; i < unique.length; i++) {
      const p = voxelToWorld(vol, unique[i]);
      positions[3 * i + 0] = p[0];
      positions[3 * i + 1] = p[1];
      positions[3 * i + 2] = p[2];
      const vi = clampi(Math.floor(unique[i][0]), nx);
      const vj = clampi(Math.floor(unique[i][1]), ny);
      const vk = clampi(Math.floor(unique[i][2]), nz);
      const t = idx(vi, vj, vk);
      const rr = re[t], ii = im[t];
      const phase = Math.atan2(ii, rr);
      const hue = (phase + Math.PI) / (2 * Math.PI);
      const [r, g, b] = hsvToRgb(hue, 1.0, 1.0);
      colors[3 * i + 0] = r; colors[3 * i + 1] = g; colors[3 * i + 2] = b;
    }
    const geom = new global.THREE.BufferGeometry();
    geom.setIndex(new global.THREE.BufferAttribute(indices, 1));
    geom.setAttribute('position', new global.THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new global.THREE.BufferAttribute(colors, 3));
    geom.setAttribute('normal', new global.THREE.BufferAttribute(
      computeGradientNormalsForVoxelPositions(
        vol,
        unique,
        (gx, gy, gz) => sampleTrilinearGrid(vol.nxyz, magnitudeAt, gx, gy, gz),
        { orientation: 1, sampleStep: 0.5 }
      ),
      3
    ));
    return geom;
  }

  /**
   * Build a total-density isosurface colored with Bloch-sphere direction mapping.
   * @param {{nxyz:number[],idx:(i:number,j:number,k:number)=>number,alphaRe:Float32Array,alphaIm:Float32Array,betaRe:Float32Array,betaIm:Float32Array}} vol
   * @param {number} level
   * @returns {THREE.BufferGeometry}
   */
  function make2CTotalColoredIsosurface(vol, level) {
    const [nx, ny, nz] = vol.nxyz;
    const reA = vol.alphaRe, imA = vol.alphaIm, reB = vol.betaRe, imB = vol.betaIm;
    const idx = vol.idx;
    const clampi = (x, n) => Math.max(0, Math.min(n - 1, x | 0));
    const densityAt = (i, j, k) => {
      const t = idx(i, j, k);
      const a2 = reA[t] * reA[t] + imA[t] * imA[t];
      const b2 = reB[t] * reB[t] + imB[t] * imB[t];
      return Math.sqrt(a2 + b2);
    };
    const densSampler = (x, y, z) => {
      const i = clampi(Math.floor(x), nx);
      const j = clampi(Math.floor(y), ny);
      const k = clampi(Math.floor(z), nz);
      return densityAt(i, j, k);
    };
    const res = global.isosurface.marchingCubes([nx, ny, nz], (x, y, z) => densSampler(x, y, z) - level);
    const voxPos = res.positions;
    const key = (p) => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)},${Math.round(p[2] * 1e6)}`;
    const map = new Map();
    const unique = [];
    const oldToNew = new Uint32Array(voxPos.length);
    for (let i = 0; i < voxPos.length; i++) {
      const k = key(voxPos[i]);
      let id = map.get(k);
      if (id === undefined) { id = unique.length; map.set(k, id); unique.push(voxPos[i]); }
      oldToNew[i] = id;
    }
    const cells = res.cells;
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
    const colors = new Float32Array(unique.length * 3);
    for (let i = 0; i < unique.length; i++) {
      const v = unique[i];
      const vi = clampi(Math.floor(v[0]), nx);
      const vj = clampi(Math.floor(v[1]), ny);
      const vk = clampi(Math.floor(v[2]), nz);
      const t = idx(vi, vj, vk);
      const ar = reA[t], ai = imA[t], br = reB[t], bi = imB[t];
      const a2 = ar * ar + ai * ai, b2 = br * br + bi * bi;
      const rho = a2 + b2;
      if (rho <= 1e-12) {
        colors[3 * i] = colors[3 * i + 1] = colors[3 * i + 2] = 0;
        continue;
      }
      const re_ab = ar * br + ai * bi;
      const im_ab = -ar * bi + ai * br;
      const nxv = 2 * re_ab / rho;
      const nyv = 2 * im_ab / rho;
      const nzv = (a2 - b2) / rho;
      const hue = (Math.atan2(nyv, nxv) + Math.PI) / (2 * Math.PI);
      const value = 0.6 + 0.4 * (1 - Math.abs(nzv));
      const [r, g, b] = hsvToRgb(hue, 1.0, value);
      colors[3 * i + 0] = r; colors[3 * i + 1] = g; colors[3 * i + 2] = b;
    }
    const geom = new global.THREE.BufferGeometry();
    geom.setIndex(new global.THREE.BufferAttribute(indices, 1));
    geom.setAttribute('position', new global.THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new global.THREE.BufferAttribute(colors, 3));
    geom.setAttribute('normal', new global.THREE.BufferAttribute(
      computeGradientNormalsForVoxelPositions(
        vol,
        unique,
        (gx, gy, gz) => sampleTrilinearGrid(vol.nxyz, densityAt, gx, gy, gz),
        { orientation: 1, sampleStep: 0.5 }
      ),
      3
    ));
    return geom;
  }

  global.VibeMolVolume2C = Object.freeze({
    hsvToRgb,
    make2CPhaseIsosurface,
    make2CTotalColoredIsosurface,
  });
})(typeof window !== 'undefined' ? window : globalThis);
