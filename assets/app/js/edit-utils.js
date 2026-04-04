(function () {
  function getPointComponent(point, key) {
    return Number(point && point[key]) || 0;
  }

  /**
   * Classify one bond hit into endpoint-third or center-third along A->B.
   * Accepts Vector3-like or plain {x,y,z} points.
   * @param {{x:number,y:number,z:number}} pointA
   * @param {{x:number,y:number,z:number}} pointB
   * @param {{x:number,y:number,z:number}} hitPoint
   * @returns {{section:'nearA'|'center'|'nearB', t:number}}
   */
  function classifyBondHitSectionFromPoints(pointA, pointB, hitPoint) {
    const ax = getPointComponent(pointA, 'x');
    const ay = getPointComponent(pointA, 'y');
    const az = getPointComponent(pointA, 'z');
    const bx = getPointComponent(pointB, 'x');
    const by = getPointComponent(pointB, 'y');
    const bz = getPointComponent(pointB, 'z');
    const hx = getPointComponent(hitPoint, 'x');
    const hy = getPointComponent(hitPoint, 'y');
    const hz = getPointComponent(hitPoint, 'z');
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const lenSq = dx * dx + dy * dy + dz * dz;
    if (!(Number.isFinite(lenSq) && lenSq > 1e-12)) {
      return { section: 'center', t: 0.5 };
    }
    const rawT = ((hx - ax) * dx + (hy - ay) * dy + (hz - az) * dz) / lenSq;
    const t = Math.max(0, Math.min(1, rawT));
    if (t <= (1 / 3)) return { section: 'nearA', t };
    if (t >= (2 / 3)) return { section: 'nearB', t };
    return { section: 'center', t };
  }

  /**
   * Compute mass-weighted center for one atom list (native units).
   * @param {Array<{Z:number,x:number,y:number,z:number}>} atoms
   * @param {(z:number)=>number} getMass
   * @returns {{totalMass:number,comX:number,comY:number,comZ:number}|null}
   */
  function computeMassPropertiesFromAtoms(atoms, getMass) {
    if (!Array.isArray(atoms) || atoms.length === 0 || typeof getMass !== 'function') return null;
    let totalMass = 0;
    let weightedX = 0;
    let weightedY = 0;
    let weightedZ = 0;
    for (const atom of atoms) {
      const mass = getMass((atom && atom.Z) | 0);
      if (!(Number.isFinite(mass) && mass > 0)) continue;
      const x = Number(atom && atom.x) || 0;
      const y = Number(atom && atom.y) || 0;
      const z = Number(atom && atom.z) || 0;
      totalMass += mass;
      weightedX += mass * x;
      weightedY += mass * y;
      weightedZ += mass * z;
    }
    if (!(Number.isFinite(totalMass) && totalMass > 0)) return null;
    return {
      totalMass,
      comX: weightedX / totalMass,
      comY: weightedY / totalMass,
      comZ: weightedZ / totalMass,
    };
  }

  /**
   * Build symmetric inertia tensor around one center.
   * @param {Array<{Z:number,x:number,y:number,z:number}>} atoms
   * @param {{comX:number,comY:number,comZ:number}} center
   * @param {(z:number)=>number} getMass
   * @returns {number[][]}
   */
  function computeInertiaTensorFromAtoms(atoms, center, getMass) {
    const cX = Number(center && center.comX) || 0;
    const cY = Number(center && center.comY) || 0;
    const cZ = Number(center && center.comZ) || 0;
    let ixx = 0; let iyy = 0; let izz = 0;
    let ixy = 0; let ixz = 0; let iyz = 0;
    if (!Array.isArray(atoms) || typeof getMass !== 'function') {
      return [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    }
    for (const atom of atoms) {
      const m = getMass((atom && atom.Z) | 0);
      if (!(Number.isFinite(m) && m > 0)) continue;
      const x = (Number(atom && atom.x) || 0) - cX;
      const y = (Number(atom && atom.y) || 0) - cY;
      const z = (Number(atom && atom.z) || 0) - cZ;
      ixx += m * (y * y + z * z);
      iyy += m * (x * x + z * z);
      izz += m * (x * x + y * y);
      ixy -= m * x * y;
      ixz -= m * x * z;
      iyz -= m * y * z;
    }
    return [
      [ixx, ixy, ixz],
      [ixy, iyy, iyz],
      [ixz, iyz, izz],
    ];
  }

  /**
   * Jacobi eigen decomposition for a symmetric 3x3 matrix.
   * @param {number[][]} m
   * @returns {{values:number[], vectors:number[][]}}
   */
  function eigenSymmetric3x3(m) {
    const a = [
      [Number(m && m[0] && m[0][0]) || 0, Number(m && m[0] && m[0][1]) || 0, Number(m && m[0] && m[0][2]) || 0],
      [Number(m && m[1] && m[1][0]) || 0, Number(m && m[1] && m[1][1]) || 0, Number(m && m[1] && m[1][2]) || 0],
      [Number(m && m[2] && m[2][0]) || 0, Number(m && m[2] && m[2][1]) || 0, Number(m && m[2] && m[2][2]) || 0],
    ];
    const v = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const pairs = [[0, 1], [0, 2], [1, 2]];
    for (let iter = 0; iter < 24; iter++) {
      let p = 0;
      let q = 1;
      let maxAbs = Math.abs(a[p][q]);
      for (let i = 1; i < pairs.length; i++) {
        const ii = pairs[i][0];
        const jj = pairs[i][1];
        const absVal = Math.abs(a[ii][jj]);
        if (absVal > maxAbs) {
          maxAbs = absVal;
          p = ii;
          q = jj;
        }
      }
      if (maxAbs < 1e-12) break;
      const app = a[p][p];
      const aqq = a[q][q];
      const apq = a[p][q];
      const phi = 0.5 * Math.atan2(2 * apq, (aqq - app));
      const c = Math.cos(phi);
      const s = Math.sin(phi);

      for (let k = 0; k < 3; k++) {
        const akp = a[k][p];
        const akq = a[k][q];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k];
        const aqk = a[q][k];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
      }
      a[p][q] = 0;
      a[q][p] = 0;

      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p];
        const vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }

    const values = [a[0][0], a[1][1], a[2][2]];
    const vectors = [
      [v[0][0], v[1][0], v[2][0]],
      [v[0][1], v[1][1], v[2][1]],
      [v[0][2], v[1][2], v[2][2]],
    ];
    const order = [0, 1, 2].sort((i, j) => values[i] - values[j]);
    const sortedValues = order.map((i) => values[i]);
    const sortedVectors = order.map((i) => vectors[i].slice());

    // Keep right-handed basis.
    const ax = sortedVectors[0];
    const ay = sortedVectors[1];
    const az = sortedVectors[2];
    const crossZ = [
      ax[1] * ay[2] - ax[2] * ay[1],
      ax[2] * ay[0] - ax[0] * ay[2],
      ax[0] * ay[1] - ax[1] * ay[0],
    ];
    const handedness = crossZ[0] * az[0] + crossZ[1] * az[1] + crossZ[2] * az[2];
    if (handedness < 0) {
      sortedVectors[2][0] *= -1;
      sortedVectors[2][1] *= -1;
      sortedVectors[2][2] *= -1;
    }

    return { values: sortedValues, vectors: sortedVectors };
  }

  window.VibeMolEditUtils = Object.freeze({
    classifyBondHitSectionFromPoints,
    computeMassPropertiesFromAtoms,
    computeInertiaTensorFromAtoms,
    eigenSymmetric3x3,
  });
})();
