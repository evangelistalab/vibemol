(function (global) {
  'use strict';

  const BOHR_TO_ANG = 0.529177210903;
  const ANG_TO_BOHR = 1.0 / BOHR_TO_ANG;

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

    const geom = new global.THREE.BufferGeometry();
    geom.setIndex(new global.THREE.BufferAttribute(indices, 1));
    geom.setAttribute('position', new global.THREE.BufferAttribute(positions, 3));
    geom.computeVertexNormals();
    return geom;
  }

  global.VibeMolVolumeGeometry = Object.freeze({
    atomUnitsToAng,
    worldToAtomUnits,
    voxelToWorld,
    makeIsosurface,
  });
})(typeof window !== 'undefined' ? window : globalThis);
