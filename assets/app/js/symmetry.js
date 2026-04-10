(function (global) {
  'use strict';

  const editUtils = global.VibeMolEditUtils || {};
  const externalEigenSymmetric3x3 = typeof editUtils.eigenSymmetric3x3 === 'function'
    ? editUtils.eigenSymmetric3x3
    : null;

  const EPS = 1e-9;
  const DEFAULT_TOLERANCE_ANG = 0.05;
  const EXACT_TOLERANCE_ANG = 1e-3;
  const MAX_GENERIC_N = 6;
  const MAX_AXIS_CANDIDATES = 18;
  const MAX_FRAME_CANDIDATES = 48;
  const EIGEN_DEGENERACY_REL_TOL = 0.08;
  const GENERIC_GROUP_SPEC_CACHE = new Map();
  const CANDIDATE_GROUP_IDS = Object.freeze(buildCandidateGroupIds());
  const CENTERED_ANALYSIS_CACHE = new WeakMap();

  function localEigenSymmetric3x3(m) {
    const a = [
      [Number(m && m[0] && m[0][0]) || 0, Number(m && m[0] && m[0][1]) || 0, Number(m && m[0] && m[0][2]) || 0],
      [Number(m && m[1] && m[1][0]) || 0, Number(m && m[1] && m[1][1]) || 0, Number(m && m[1] && m[1][2]) || 0],
      [Number(m && m[2] && m[2][0]) || 0, Number(m && m[2] && m[2][1]) || 0, Number(m && m[2] && m[2][2]) || 0],
    ];
    const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
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
    const order = [0, 1, 2].sort((i, j) => values[j] - values[i]);
    const sortedValues = order.map((i) => values[i]);
    const sortedVectors = order.map((i) => vectors[i].slice());
    const ax = sortedVectors[0];
    const ay = sortedVectors[1];
    const az = sortedVectors[2];
    const crossZ = cross(ax, ay);
    if (dot(crossZ, az) < 0) sortedVectors[2] = scale(az, -1);
    return { values: sortedValues, vectors: sortedVectors };
  }

  function eigenSymmetric3x3(m) {
    return externalEigenSymmetric3x3 ? externalEigenSymmetric3x3(m) : localEigenSymmetric3x3(m);
  }

  function vec(x = 0, y = 0, z = 0) {
    return [Number(x) || 0, Number(y) || 0, Number(z) || 0];
  }

  function cloneVec(v) {
    return vec(v && v[0], v && v[1], v && v[2]);
  }

  function add(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }

  function sub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function scale(v, s) {
    return [v[0] * s, v[1] * s, v[2] * s];
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function lengthSq(v) {
    return dot(v, v);
  }

  function length(v) {
    return Math.sqrt(lengthSq(v));
  }

  function normalize(v) {
    const len = length(v);
    if (!(len > EPS)) return null;
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  function distanceSq(a, b) {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return dx * dx + dy * dy + dz * dz;
  }

  function distance(a, b) {
    return Math.sqrt(distanceSq(a, b));
  }

  function averageVec(list) {
    if (!Array.isArray(list) || !list.length) return vec(0, 0, 0);
    let x = 0;
    let y = 0;
    let z = 0;
    for (const item of list) {
      x += item[0] || 0;
      y += item[1] || 0;
      z += item[2] || 0;
    }
    return [x / list.length, y / list.length, z / list.length];
  }

  function matIdentity() {
    return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  }

  function matDiagonal(x, y, z) {
    return [[x, 0, 0], [0, y, 0], [0, 0, z]];
  }

  function matTranspose(m) {
    return [
      [m[0][0], m[1][0], m[2][0]],
      [m[0][1], m[1][1], m[2][1]],
      [m[0][2], m[1][2], m[2][2]],
    ];
  }

  function matMul(a, b) {
    const out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        out[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
      }
    }
    return out;
  }

  function matVecMul(m, v) {
    return [
      m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
      m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
      m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ];
  }

  function matDet(m) {
    return (
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
      - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
      + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    );
  }

  function matInverse(m) {
    const det = matDet(m);
    if (!(Math.abs(det) > EPS)) return null;
    const invDet = 1 / det;
    return [
      [
        (m[1][1] * m[2][2] - m[1][2] * m[2][1]) * invDet,
        (m[0][2] * m[2][1] - m[0][1] * m[2][2]) * invDet,
        (m[0][1] * m[1][2] - m[0][2] * m[1][1]) * invDet,
      ],
      [
        (m[1][2] * m[2][0] - m[1][0] * m[2][2]) * invDet,
        (m[0][0] * m[2][2] - m[0][2] * m[2][0]) * invDet,
        (m[0][2] * m[1][0] - m[0][0] * m[1][2]) * invDet,
      ],
      [
        (m[1][0] * m[2][1] - m[1][1] * m[2][0]) * invDet,
        (m[0][1] * m[2][0] - m[0][0] * m[2][1]) * invDet,
        (m[0][0] * m[1][1] - m[0][1] * m[1][0]) * invDet,
      ],
    ];
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function matsApproxEqual(a, b, tol = 1e-8) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (Math.abs((a[i][j] || 0) - (b[i][j] || 0)) > tol) return false;
      }
    }
    return true;
  }

  function rotationMatrix(axis, angle) {
    const n = normalize(axis);
    if (!n) return matIdentity();
    const [x, y, z] = n;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;
    return [
      [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
      [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
      [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
    ];
  }

  function reflectionMatrix(normal) {
    const n = normalize(normal);
    if (!n) return matIdentity();
    const [x, y, z] = n;
    return [
      [1 - 2 * x * x, -2 * x * y, -2 * x * z],
      [-2 * y * x, 1 - 2 * y * y, -2 * y * z],
      [-2 * z * x, -2 * z * y, 1 - 2 * z * z],
    ];
  }

  function improperRotationMatrix(axis, angle) {
    const n = normalize(axis);
    if (!n) return matIdentity();
    return matMul(reflectionMatrix(n), rotationMatrix(n, angle));
  }

  function canonicalizeDirection(dir) {
    const n = normalize(dir);
    if (!n) return null;
    if (Math.abs(n[0]) > 1e-8) return n[0] < 0 ? scale(n, -1) : n;
    if (Math.abs(n[1]) > 1e-8) return n[1] < 0 ? scale(n, -1) : n;
    if (Math.abs(n[2]) > 1e-8) return n[2] < 0 ? scale(n, -1) : n;
    return n;
  }

  function directionsEquivalent(a, b, tol = 1e-5) {
    const na = normalize(a);
    const nb = normalize(b);
    if (!na || !nb) return false;
    return Math.abs(dot(na, nb)) >= 1 - tol;
  }

  function worldDirectionFromFrame(frame, localDir) {
    if (!frame) return canonicalizeDirection(localDir);
    const world = add(
      add(scale(frame.x, Number(localDir && localDir[0]) || 0), scale(frame.y, Number(localDir && localDir[1]) || 0)),
      scale(frame.z, Number(localDir && localDir[2]) || 0)
    );
    return canonicalizeDirection(world);
  }

  function traceOfMatrix(m) {
    return (m[0][0] || 0) + (m[1][1] || 0) + (m[2][2] || 0);
  }

  function isNegativeIdentityMatrix(m, tol = 1e-6) {
    return matsApproxEqual(m, matDiagonal(-1, -1, -1), tol);
  }

  function isIdentityMatrix(m, tol = 1e-6) {
    return matsApproxEqual(m, matIdentity(), tol);
  }

  function isReflectionLikeMatrix(m, tol = 1e-6) {
    return matDet(m) < 0 && matsApproxEqual(matMul(m, m), matIdentity(), tol) && !isNegativeIdentityMatrix(m, tol);
  }

  function axisFromHalfTurnMatrix(m) {
    const xx = Math.max(0, (1 + (m[0][0] || 0)) * 0.5);
    const yy = Math.max(0, (1 + (m[1][1] || 0)) * 0.5);
    const zz = Math.max(0, (1 + (m[2][2] || 0)) * 0.5);
    const axis = [
      Math.sqrt(xx),
      Math.sqrt(yy),
      Math.sqrt(zz),
    ];
    if (axis[0] > 1e-6) axis[1] = ((m[0][1] || 0) + (m[1][0] || 0)) / (4 * axis[0]);
    if (axis[0] > 1e-6) axis[2] = ((m[0][2] || 0) + (m[2][0] || 0)) / (4 * axis[0]);
    if (!(length(axis) > 1e-6) && axis[1] > 1e-6) axis[2] = ((m[1][2] || 0) + (m[2][1] || 0)) / (4 * axis[1]);
    if (!(length(axis) > 1e-6)) {
      const rows = [
        [1 + (m[0][0] || 0), (m[0][1] || 0), (m[0][2] || 0)],
        [(m[1][0] || 0), 1 + (m[1][1] || 0), (m[1][2] || 0)],
        [(m[2][0] || 0), (m[2][1] || 0), 1 + (m[2][2] || 0)],
      ].sort((a, b) => lengthSq(b) - lengthSq(a));
      return canonicalizeDirection(rows[0]);
    }
    return canonicalizeDirection(axis);
  }

  function extractRotationElementFromMatrix(m) {
    if (!(matDet(m) > 0)) return null;
    if (isIdentityMatrix(m)) return null;
    const cosine = clamp((traceOfMatrix(m) - 1) * 0.5, -1, 1);
    const angle = Math.acos(cosine);
    if (!(angle > 1e-6)) return null;
    const skewAxis = [
      (m[2][1] || 0) - (m[1][2] || 0),
      (m[0][2] || 0) - (m[2][0] || 0),
      (m[1][0] || 0) - (m[0][1] || 0),
    ];
    const axis = length(skewAxis) > 1e-6
      ? canonicalizeDirection(skewAxis)
      : axisFromHalfTurnMatrix(m);
    if (!axis) return null;
    return {
      type: 'axis',
      axis,
      angle,
      order: Math.max(2, Math.round((2 * Math.PI) / angle)),
    };
  }

  function extractReflectionNormalFromMatrix(m) {
    if (!isReflectionLikeMatrix(m)) return null;
    const rows = [
      [1 - (m[0][0] || 0), -(m[0][1] || 0), -(m[0][2] || 0)],
      [-(m[1][0] || 0), 1 - (m[1][1] || 0), -(m[1][2] || 0)],
      [-(m[2][0] || 0), -(m[2][1] || 0), 1 - (m[2][2] || 0)],
    ].sort((a, b) => lengthSq(b) - lengthSq(a));
    return canonicalizeDirection(rows[0]);
  }

  function buildFrame(zAxis, xRef) {
    const z = normalize(zAxis);
    if (!z) return null;
    let x = null;
    if (xRef) {
      const projected = sub(xRef, scale(z, dot(xRef, z)));
      x = normalize(projected);
    }
    if (!x) {
      const fallback = Math.abs(z[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
      x = normalize(sub(fallback, scale(z, dot(fallback, z))));
    }
    if (!x) return null;
    let y = normalize(cross(z, x));
    if (!y) return null;
    x = normalize(cross(y, z));
    if (!x) return null;
    return { x, y, z };
  }

  function localToWorld(frame, local, centroid) {
    return add(
      add(scale(frame.x, local[0]), scale(frame.y, local[1])),
      add(scale(frame.z, local[2]), centroid)
    );
  }

  function worldToLocal(frame, world) {
    return [dot(world, frame.x), dot(world, frame.y), dot(world, frame.z)];
  }

  function cloneTargetAtoms(targetAtoms) {
    return (Array.isArray(targetAtoms) ? targetAtoms : []).map((atom, index) => ({
      id: atom && atom.id != null ? String(atom.id) : `atom-${index + 1}`,
      Z: (atom && atom.Z) | 0,
      x: Number(atom && atom.x) || 0,
      y: Number(atom && atom.y) || 0,
      z: Number(atom && atom.z) || 0,
      formalCharge: (Number(atom && atom.formalCharge) | 0) || 0,
    }));
  }

  function centerTargetAtoms(targetAtoms) {
    const atoms = cloneTargetAtoms(targetAtoms);
    if (!atoms.length) {
      return { atoms, centroid: vec(0, 0, 0), centered: [] };
    }
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const atom of atoms) {
      cx += atom.x;
      cy += atom.y;
      cz += atom.z;
    }
    cx /= atoms.length;
    cy /= atoms.length;
    cz /= atoms.length;
    const centroid = [cx, cy, cz];
    const centered = atoms.map((atom) => ({
      atom,
      local: [atom.x - cx, atom.y - cy, atom.z - cz],
    }));
    return { atoms, centroid, centered };
  }

  function computeCovariance(centered) {
    let xx = 0; let xy = 0; let xz = 0;
    let yy = 0; let yz = 0; let zz = 0;
    const count = Math.max(1, centered.length);
    for (const entry of centered) {
      const p = entry.local;
      xx += p[0] * p[0];
      xy += p[0] * p[1];
      xz += p[0] * p[2];
      yy += p[1] * p[1];
      yz += p[1] * p[2];
      zz += p[2] * p[2];
    }
    return [
      [xx / count, xy / count, xz / count],
      [xy / count, yy / count, yz / count],
      [xz / count, yz / count, zz / count],
    ];
  }

  function getCenteredAnalysisCache(centered) {
    let cache = CENTERED_ANALYSIS_CACHE.get(centered);
    if (!cache) {
      cache = {
        covariance: null,
        eigen: null,
        axisCandidates: null,
        frameCandidates: null,
        linearAxis: undefined,
        candidateByGroup: new Map(),
      };
      CENTERED_ANALYSIS_CACHE.set(centered, cache);
    }
    return cache;
  }

  function getCenteredCovariance(centered) {
    const cache = getCenteredAnalysisCache(centered);
    if (!cache.covariance) cache.covariance = computeCovariance(centered);
    return cache.covariance;
  }

  function getCenteredEigen(centered) {
    const cache = getCenteredAnalysisCache(centered);
    if (!cache.eigen) cache.eigen = eigenSymmetric3x3(getCenteredCovariance(centered));
    return cache.eigen;
  }

  function hasNearDegenerateEigenbasis(eigen) {
    const values = eigen && Array.isArray(eigen.values) ? eigen.values : [];
    if (values.length < 3) return true;
    const scaleValue = Math.max(
      Math.abs(Number(values[0]) || 0),
      Math.abs(Number(values[1]) || 0),
      Math.abs(Number(values[2]) || 0),
      EPS
    );
    return (
      Math.abs((values[0] || 0) - (values[1] || 0)) <= scaleValue * EIGEN_DEGENERACY_REL_TOL
      || Math.abs((values[1] || 0) - (values[2] || 0)) <= scaleValue * EIGEN_DEGENERACY_REL_TOL
    );
  }

  function dedupeAxes(axes, tol = 0.996) {
    const out = [];
    for (const axis of axes) {
      const n = normalize(axis);
      if (!n) continue;
      let duplicate = false;
      for (const existing of out) {
        if (Math.abs(dot(existing, n)) >= tol) {
          duplicate = true;
          break;
        }
      }
      if (!duplicate) out.push(n);
    }
    return out;
  }

  function collectShortestPairAxes(centered, limit = MAX_AXIS_CANDIDATES) {
    const pairs = [];
    for (let i = 0; i < centered.length; i++) {
      for (let j = i + 1; j < centered.length; j++) {
        const delta = sub(centered[j].local, centered[i].local);
        const lenSq = lengthSq(delta);
        if (!(lenSq > 1e-10)) continue;
        pairs.push({ delta, lenSq });
      }
    }
    pairs.sort((a, b) => a.lenSq - b.lenSq);
    return pairs.slice(0, Math.max(0, limit)).map((entry) => entry.delta);
  }

  function collectAxisCandidates(centered) {
    const cache = getCenteredAnalysisCache(centered);
    if (cache.axisCandidates) return cache.axisCandidates;
    const eigen = getCenteredEigen(centered);
    const axes = [];
    for (const vector of (eigen && Array.isArray(eigen.vectors) ? eigen.vectors : [])) axes.push(vector);

    if (hasNearDegenerateEigenbasis(eigen)) {
      const atomAxes = centered
        .filter((entry) => lengthSq(entry.local) > 1e-10)
        .slice()
        .sort((a, b) => lengthSq(b.local) - lengthSq(a.local))
        .map((entry) => entry.local);
      for (const axis of atomAxes) {
        axes.push(axis);
        if (dedupeAxes(axes).length >= MAX_AXIS_CANDIDATES) break;
      }
      if (dedupeAxes(axes).length < Math.min(MAX_AXIS_CANDIDATES, 8)) {
        const pairAxes = collectShortestPairAxes(centered, MAX_AXIS_CANDIDATES);
        for (const axis of pairAxes) {
          axes.push(axis);
          if (dedupeAxes(axes).length >= MAX_AXIS_CANDIDATES) break;
        }
      }
    }
    cache.axisCandidates = dedupeAxes(axes).slice(0, MAX_AXIS_CANDIDATES);
    return cache.axisCandidates;
  }

  function collectFrameCandidates(centered) {
    const cache = getCenteredAnalysisCache(centered);
    if (cache.frameCandidates) return cache.frameCandidates;
    const axes = collectAxisCandidates(centered);
    const zAxes = axes;
    const refs = axes;
    const frames = [];
    const seen = [];
    const addFrame = (frame) => {
      if (!frame) return;
      for (const existing of seen) {
        if (Math.abs(dot(existing.z, frame.z)) >= 0.997 && Math.abs(dot(existing.x, frame.x)) >= 0.997) return;
      }
      seen.push(frame);
      frames.push(frame);
    };
    for (const z of zAxes) {
      let added = false;
      for (const ref of refs) {
        const frame = buildFrame(z, ref);
        if (!frame) continue;
        addFrame(frame);
        added = true;
      }
      if (!added) addFrame(buildFrame(z, null));
    }
    if (!frames.length) addFrame(buildFrame([0, 0, 1], [1, 0, 0]));
    cache.frameCandidates = frames.slice(0, MAX_FRAME_CANDIDATES);
    return cache.frameCandidates;
  }

  function transformCenteredToFrame(centered, frame) {
    return centered.map((entry) => ({
      atom: entry.atom,
      local: worldToLocal(frame, entry.local),
    }));
  }

  function bucketIndicesByAtomicNumber(atoms) {
    const map = new Map();
    atoms.forEach((entry, index) => {
      const key = (entry.atom && entry.atom.Z) | 0;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(index);
    });
    return map;
  }

  function solveAssignment(costMatrix) {
    const n = Array.isArray(costMatrix) ? costMatrix.length : 0;
    if (!n) return [];
    const m = Array.isArray(costMatrix[0]) ? costMatrix[0].length : 0;
    if (!m) return [];
    const u = new Array(n + 1).fill(0);
    const v = new Array(m + 1).fill(0);
    const p = new Array(m + 1).fill(0);
    const way = new Array(m + 1).fill(0);
    for (let i = 1; i <= n; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Array(m + 1).fill(Infinity);
      const used = new Array(m + 1).fill(false);
      do {
        used[j0] = true;
        const i0 = p[j0];
        let delta = Infinity;
        let j1 = 0;
        for (let j = 1; j <= m; j++) {
          if (used[j]) continue;
          const cur = (Number(costMatrix[i0 - 1][j - 1]) || 0) - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
        for (let j = 0; j <= m; j++) {
          if (used[j]) {
            u[p[j]] += delta;
            v[j] -= delta;
          } else {
            minv[j] -= delta;
          }
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do {
        const j1 = way[j0];
        p[j0] = p[j1];
        j0 = j1;
      } while (j0 !== 0);
    }
    const assignment = new Array(n).fill(-1);
    for (let j = 1; j <= m; j++) {
      if (p[j] > 0 && p[j] <= n) assignment[p[j] - 1] = j - 1;
    }
    return assignment;
  }

  function scoreOperations(localAtoms, ops) {
    const buckets = bucketIndicesByAtomicNumber(localAtoms);
    const original = localAtoms.map((entry) => cloneVec(entry.local));
    const permutations = [];
    let sumSq = 0;
    let count = 0;
    let maxDisplacement = 0;
    for (const op of ops) {
      const transformed = original.map((point) => matVecMul(op, point));
      const permutation = new Array(original.length).fill(-1);
      for (const indices of buckets.values()) {
        const cost = indices.map((sourceIndex) => indices.map((targetIndex) => distanceSq(transformed[sourceIndex], original[targetIndex])));
        const assignment = solveAssignment(cost);
        for (let row = 0; row < indices.length; row++) {
          const sourceIndex = indices[row];
          const targetIndex = indices[assignment[row]];
          permutation[sourceIndex] = targetIndex;
          const displacement = Math.sqrt(Math.max(0, cost[row][assignment[row]] || 0));
          if (displacement > maxDisplacement) maxDisplacement = displacement;
          sumSq += displacement * displacement;
          count += 1;
        }
      }
      permutations.push(permutation);
    }
    return {
      maxDisplacementAng: maxDisplacement,
      rmsDisplacementAng: count ? Math.sqrt(sumSq / count) : 0,
      permutations,
    };
  }

  function projectWithOperations(localCoords, ops, permutations) {
    const next = localCoords.map((coord) => cloneVec(coord));
    const opCount = Math.max(1, ops.length);
    for (let i = 0; i < localCoords.length; i++) {
      let accum = [0, 0, 0];
      for (let opIndex = 0; opIndex < ops.length; opIndex++) {
        const op = ops[opIndex];
        const perm = permutations[opIndex] || [];
        const mappedIndex = perm[i] >= 0 ? perm[i] : i;
        const mapped = localCoords[mappedIndex] || localCoords[i];
        const back = matVecMul(matTranspose(op), mapped);
        accum = add(accum, back);
      }
      next[i] = scale(accum, 1 / opCount);
    }
    const centroid = averageVec(next);
    for (let i = 0; i < next.length; i++) next[i] = sub(next[i], centroid);
    return next;
  }

  function iterateOperationProjection(localAtoms, ops, maxPasses = 5) {
    let coords = localAtoms.map((entry) => cloneVec(entry.local));
    let beforeResidual = null;
    let finalScore = null;
    for (let pass = 0; pass < maxPasses; pass++) {
      const scored = scoreOperations(coords.map((local, index) => ({ atom: localAtoms[index].atom, local })), ops);
      if (!beforeResidual) beforeResidual = scored;
      const next = projectWithOperations(coords, ops, scored.permutations);
      let maxDelta = 0;
      for (let i = 0; i < coords.length; i++) {
        maxDelta = Math.max(maxDelta, distance(coords[i], next[i]));
      }
      coords = next;
      finalScore = scoreOperations(coords.map((local, index) => ({ atom: localAtoms[index].atom, local })), ops);
      if (maxDelta < 1e-4) break;
    }
    return {
      localCoords: coords,
      beforeResidual: beforeResidual || finalScore || { maxDisplacementAng: 0, rmsDisplacementAng: 0 },
      afterResidual: finalScore || beforeResidual || { maxDisplacementAng: 0, rmsDisplacementAng: 0 },
    };
  }

  function buildGenericGroupOperations(groupId) {
    if (GENERIC_GROUP_SPEC_CACHE.has(groupId)) return GENERIC_GROUP_SPEC_CACHE.get(groupId);
    let spec = null;
    if (groupId === 'C1') {
      spec = { groupId, label: 'C1', order: 1, ops: [matIdentity()] };
    } else if (groupId === 'Ci') {
      spec = { groupId, label: 'Ci', order: 2, ops: [matIdentity(), matDiagonal(-1, -1, -1)] };
    } else if (groupId === 'Cs') {
      spec = { groupId, label: 'Cs', order: 2, ops: groupClosure([reflectionMatrix([0, 0, 1])]), expectedOrder: 2 };
    }
    let match = /^C(\d+)(v|h)?$/u.exec(groupId);
    if (!spec && match) {
      const n = Number(match[1]) || 1;
      const suffix = String(match[2] || '');
      const generators = [rotationMatrix([0, 0, 1], (2 * Math.PI) / n)];
      let expectedOrder = n;
      if (suffix === 'v') {
        generators.push(matDiagonal(1, -1, 1));
        expectedOrder = 2 * n;
      } else if (suffix === 'h') {
        generators.push(matDiagonal(1, 1, -1));
        expectedOrder = 2 * n;
      }
      spec = {
        groupId,
        label: suffix ? `C${n}${suffix}` : `C${n}`,
        order: expectedOrder,
        ops: groupClosure(generators),
        expectedOrder,
      };
    }
    match = /^D(\d+)(h|d)?$/u.exec(groupId);
    if (!spec && match) {
      const n = Number(match[1]) || 2;
      const suffix = String(match[2] || '');
      const generators = [rotationMatrix([0, 0, 1], (2 * Math.PI) / n), rotationMatrix([1, 0, 0], Math.PI)];
      let expectedOrder = 2 * n;
      if (suffix === 'h') {
        generators.push(matDiagonal(1, 1, -1));
        expectedOrder = 4 * n;
      } else if (suffix === 'd') {
        const planeAngle = Math.PI / (2 * n);
        generators.push(matMul(rotationMatrix([0, 0, 1], planeAngle), matMul(matDiagonal(1, -1, 1), rotationMatrix([0, 0, 1], -planeAngle))));
        expectedOrder = 4 * n;
      }
      spec = {
        groupId,
        label: suffix ? `D${n}${suffix}` : `D${n}`,
        order: expectedOrder,
        ops: groupClosure(generators),
        expectedOrder,
      };
    }
    match = /^S(\d+)$/u.exec(groupId);
    if (!spec && match) {
      const n = Number(match[1]) || 0;
      if (n > 2 && n % 2 === 0) {
        spec = {
          groupId,
          label: `S${n}`,
          order: n,
          ops: groupClosure([improperRotationMatrix([0, 0, 1], (2 * Math.PI) / n)]),
          expectedOrder: n,
        };
      }
    }
    GENERIC_GROUP_SPEC_CACHE.set(groupId, spec);
    return spec;
  }

  function groupClosure(generators) {
    const ops = [matIdentity()];
    const queue = [matIdentity()];
    const gens = Array.isArray(generators) ? generators.filter(Boolean) : [];
    while (queue.length) {
      const current = queue.shift();
      for (const generator of gens) {
        const next = matMul(current, generator);
        if (!ops.some((op) => matsApproxEqual(op, next))) {
          ops.push(next);
          queue.push(next);
        }
      }
      if (ops.length > 256) break;
    }
    return ops;
  }

  function candidateOrder(groupId) {
    if (groupId === 'Cinfv') return 1000;
    if (groupId === 'Dinfh') return 1001;
    if (groupId === 'Td') return 24;
    if (groupId === 'Oh') return 48;
    if (groupId === 'Ih') return 120;
    const spec = buildGenericGroupOperations(groupId);
    if (spec) return spec.order;
    return 1;
  }

  function labelForGroup(groupId) {
    if (groupId === 'Cinfv') return 'C∞v';
    if (groupId === 'Dinfh') return 'D∞h';
    return String(groupId || 'C1');
  }

  function rankCandidates(a, b) {
    if ((b.order || 0) !== (a.order || 0)) return (b.order || 0) - (a.order || 0);
    if ((a.rmsDisplacementAng || 0) !== (b.rmsDisplacementAng || 0)) return (a.rmsDisplacementAng || 0) - (b.rmsDisplacementAng || 0);
    return (a.maxDisplacementAng || 0) - (b.maxDisplacementAng || 0);
  }

  function pickBestCandidate(candidates) {
    const list = (Array.isArray(candidates) ? candidates : []).filter(Boolean).slice().sort(rankCandidates);
    return list[0] || null;
  }

  function buildCandidateFromGeneric(groupId, centered, frame) {
    const spec = buildGenericGroupOperations(groupId);
    if (!spec || !frame) return null;
    const localAtoms = transformCenteredToFrame(centered, frame);
    const score = scoreOperations(localAtoms, spec.ops);
    return {
      groupId,
      groupLabel: labelForGroup(groupId),
      order: spec.order,
      maxDisplacementAng: score.maxDisplacementAng,
      rmsDisplacementAng: score.rmsDisplacementAng,
      kind: 'generic',
      frame,
      ops: spec.ops,
      expectedOrder: spec.expectedOrder || spec.order,
    };
  }

  function findBestGenericCandidate(groupId, centered) {
    if (groupId === 'C1') {
      return {
        groupId: 'C1',
        groupLabel: 'C1',
        order: 1,
        maxDisplacementAng: 0,
        rmsDisplacementAng: 0,
        kind: 'generic',
        frame: buildFrame([0, 0, 1], [1, 0, 0]),
        ops: [matIdentity()],
      };
    }
    if (groupId === 'Ci') {
      const frame = buildFrame([0, 0, 1], [1, 0, 0]);
      return buildCandidateFromGeneric(groupId, centered, frame);
    }
    const frames = collectFrameCandidates(centered);
    const candidates = [];
    for (const frame of frames) {
      const candidate = buildCandidateFromGeneric(groupId, centered, frame);
      if (candidate) candidates.push(candidate);
    }
    return pickBestCandidate(candidates);
  }

  function computeLinearAxis(centered) {
    const cache = getCenteredAnalysisCache(centered);
    if (cache.linearAxis !== undefined) return cache.linearAxis;
    if (!centered.length) return normalize([0, 0, 1]);
    let best = null;
    let bestLenSq = 0;
    for (let i = 0; i < centered.length; i++) {
      for (let j = i + 1; j < centered.length; j++) {
        const delta = sub(centered[j].local, centered[i].local);
        const lenSq = lengthSq(delta);
        if (lenSq > bestLenSq) {
          bestLenSq = lenSq;
          best = delta;
        }
      }
    }
    if (bestLenSq > 1e-10) {
      cache.linearAxis = normalize(best);
      return cache.linearAxis;
    }
    const frames = collectFrameCandidates(centered);
    cache.linearAxis = frames.length ? cloneVec(frames[0].z) : [0, 0, 1];
    return cache.linearAxis;
  }

  function projectOntoAxis(point, axis) {
    const t = dot(point, axis);
    return scale(axis, t);
  }

  function findBestLinearCandidate(groupId, centered) {
    const axis = computeLinearAxis(centered);
    if (!axis) return null;
    let maxRadial = 0;
    let sumRadialSq = 0;
    for (const entry of centered) {
      const projected = projectOntoAxis(entry.local, axis);
      const radial = distance(entry.local, projected);
      maxRadial = Math.max(maxRadial, radial);
      sumRadialSq += radial * radial;
    }
    const rmsRadial = Math.sqrt(sumRadialSq / Math.max(1, centered.length));
    if (groupId === 'Cinfv') {
      return {
        groupId,
        groupLabel: labelForGroup(groupId),
        order: candidateOrder(groupId),
        maxDisplacementAng: maxRadial,
        rmsDisplacementAng: rmsRadial,
        kind: 'linear',
        axis,
      };
    }
    const frame = buildFrame(axis, [1, 0, 0]);
    const localAtoms = transformCenteredToFrame(centered, frame);
    const score = scoreOperations(localAtoms, [matIdentity(), matDiagonal(-1, -1, -1)]);
    return {
      groupId,
      groupLabel: labelForGroup(groupId),
      order: candidateOrder(groupId),
      maxDisplacementAng: Math.max(maxRadial, score.maxDisplacementAng),
      rmsDisplacementAng: Math.max(rmsRadial, score.rmsDisplacementAng),
      kind: 'linear',
      axis,
      frame,
      ops: [matIdentity(), matDiagonal(-1, -1, -1)],
    };
  }

  const TETRA_TEMPLATE = [
    normalize([1, 1, 1]),
    normalize([1, -1, -1]),
    normalize([-1, 1, -1]),
    normalize([-1, -1, 1]),
  ].filter(Boolean);

  const OCTA_TEMPLATE = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];

  const GOLDEN = (1 + Math.sqrt(5)) / 2;
  const ICOSA_TEMPLATE = [
    normalize([-1, GOLDEN, 0]), normalize([1, GOLDEN, 0]), normalize([-1, -GOLDEN, 0]), normalize([1, -GOLDEN, 0]),
    normalize([0, -1, GOLDEN]), normalize([0, 1, GOLDEN]), normalize([0, -1, -GOLDEN]), normalize([0, 1, -GOLDEN]),
    normalize([GOLDEN, 0, -1]), normalize([GOLDEN, 0, 1]), normalize([-GOLDEN, 0, -1]), normalize([-GOLDEN, 0, 1]),
  ].filter(Boolean);

  function permutationsOfIndices(count) {
    const out = [];
    const current = [];
    const used = new Array(count).fill(false);
    function visit() {
      if (current.length === count) {
        out.push(current.slice());
        return;
      }
      for (let i = 0; i < count; i++) {
        if (used[i]) continue;
        used[i] = true;
        current.push(i);
        visit();
        current.pop();
        used[i] = false;
      }
    }
    visit();
    return out;
  }

  const PERMUTATIONS_4 = permutationsOfIndices(4);
  const PERMUTATIONS_6 = permutationsOfIndices(6);

  function closestRotationFromCovariance(covariance) {
    let x = [
      [covariance[0][0], covariance[0][1], covariance[0][2]],
      [covariance[1][0], covariance[1][1], covariance[1][2]],
      [covariance[2][0], covariance[2][1], covariance[2][2]],
    ];
    for (let i = 0; i < 20; i++) {
      const inv = matInverse(x);
      if (!inv) break;
      const invT = matTranspose(inv);
      const next = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          next[r][c] = 0.5 * (x[r][c] + invT[r][c]);
        }
      }
      x = next;
    }
    if (matDet(x) < 0) {
      x[0][2] *= -1;
      x[1][2] *= -1;
      x[2][2] *= -1;
    }
    return x;
  }

  function fitTemplateByPermutation(unitPoints, template, permutations) {
    let best = null;
    for (const perm of permutations) {
      const covariance = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let i = 0; i < unitPoints.length; i++) {
        const a = unitPoints[i];
        const b = template[perm[i]];
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) covariance[r][c] += a[r] * b[c];
        }
      }
      const rotation = closestRotationFromCovariance(covariance);
      let maxResidual = 0;
      let sumSq = 0;
      const assignedTemplate = [];
      for (let i = 0; i < unitPoints.length; i++) {
        const predicted = matVecMul(rotation, template[perm[i]]);
        assignedTemplate.push(predicted);
        const d = distance(unitPoints[i], predicted);
        maxResidual = Math.max(maxResidual, d);
        sumSq += d * d;
      }
      const rmsResidual = Math.sqrt(sumSq / Math.max(1, unitPoints.length));
      const candidate = { rotation, perm: perm.slice(), maxResidual, rmsResidual, assignedTemplate };
      if (!best || candidate.maxResidual < best.maxResidual - 1e-9 || (Math.abs(candidate.maxResidual - best.maxResidual) <= 1e-9 && candidate.rmsResidual < best.rmsResidual)) {
        best = candidate;
      }
    }
    return best;
  }

  function fitTemplateIterative(unitPoints, template, seeds) {
    let best = null;
    const initialRotations = [];
    if (Array.isArray(seeds)) {
      for (const seed of seeds) {
        if (seed && seed.x && seed.y && seed.z) initialRotations.push([seed.x.slice(), seed.y.slice(), seed.z.slice()]);
      }
    }
    if (!initialRotations.length) initialRotations.push(matIdentity());
    for (const initial of initialRotations) {
      let rotation = initial;
      let perm = null;
      for (let iter = 0; iter < 8; iter++) {
        const rotatedTemplate = template.map((point) => matVecMul(rotation, point));
        const cost = unitPoints.map((point) => rotatedTemplate.map((candidate) => distanceSq(point, candidate)));
        perm = solveAssignment(cost);
        const covariance = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        for (let i = 0; i < unitPoints.length; i++) {
          const a = unitPoints[i];
          const b = template[perm[i]];
          for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) covariance[r][c] += a[r] * b[c];
          }
        }
        rotation = closestRotationFromCovariance(covariance);
      }
      const assignedTemplate = [];
      let maxResidual = 0;
      let sumSq = 0;
      for (let i = 0; i < unitPoints.length; i++) {
        const predicted = matVecMul(rotation, template[perm[i]]);
        assignedTemplate.push(predicted);
        const d = distance(unitPoints[i], predicted);
        maxResidual = Math.max(maxResidual, d);
        sumSq += d * d;
      }
      const candidate = {
        rotation,
        perm: perm ? perm.slice() : unitPoints.map((_, index) => index),
        maxResidual,
        rmsResidual: Math.sqrt(sumSq / Math.max(1, unitPoints.length)),
        assignedTemplate,
      };
      if (!best || candidate.maxResidual < best.maxResidual - 1e-9 || (Math.abs(candidate.maxResidual - best.maxResidual) <= 1e-9 && candidate.rmsResidual < best.rmsResidual)) best = candidate;
    }
    return best;
  }

  function detectCenteredShell(centered, expectedShellCount) {
    if (centered.length !== expectedShellCount + 1) return null;
    const radii = centered.map((entry) => length(entry.local));
    let centerIndex = 0;
    for (let i = 1; i < radii.length; i++) {
      if (radii[i] < radii[centerIndex]) centerIndex = i;
    }
    const shell = [];
    for (let i = 0; i < centered.length; i++) {
      if (i === centerIndex) continue;
      shell.push({ index: i, atom: centered[i].atom, local: centered[i].local, radius: radii[i] });
    }
    if (!shell.length || shell.some((entry) => entry.atom.Z !== shell[0].atom.Z)) return null;
    const avgRadius = shell.reduce((sum, entry) => sum + entry.radius, 0) / shell.length;
    if (!(avgRadius > EPS)) return null;
    const centerRadius = radii[centerIndex] || 0;
    if (centerRadius > Math.max(0.2, avgRadius * 0.35)) return null;
    return { centerIndex, shell, avgRadius };
  }

  function quickRejectShellGroup(groupId, centered) {
    if (groupId === 'Td') return centered.length !== 5;
    if (groupId === 'Oh') return centered.length !== 7;
    if (groupId === 'Ih') return centered.length !== 13;
    return false;
  }

  function buildSpecialShellCandidate(groupId, centered, frameSeeds) {
    let detected = null;
    let template = null;
    let permutations = null;
    if (groupId === 'Td') {
      detected = detectCenteredShell(centered, 4);
      template = TETRA_TEMPLATE;
      permutations = PERMUTATIONS_4;
    } else if (groupId === 'Oh') {
      detected = detectCenteredShell(centered, 6);
      template = OCTA_TEMPLATE;
      permutations = PERMUTATIONS_6;
    } else if (groupId === 'Ih') {
      detected = detectCenteredShell(centered, 12);
      template = ICOSA_TEMPLATE;
    }
    if (!detected || !template) return null;
    const unitPoints = detected.shell.map((entry) => normalize(entry.local)).filter(Boolean);
    if (unitPoints.length !== detected.shell.length) return null;
    const effectiveFrameSeeds = Array.isArray(frameSeeds) && frameSeeds.length
      ? frameSeeds
      : (groupId === 'Ih' ? collectFrameCandidates(centered) : []);
    const fit = permutations
      ? fitTemplateByPermutation(unitPoints, template, permutations)
      : fitTemplateIterative(unitPoints, template, effectiveFrameSeeds);
    if (!fit) return null;
    let maxDisplacement = 0;
    let sumSq = 0;
    const predictedWorld = centered.map((entry) => cloneVec(entry.local));
    predictedWorld[detected.centerIndex] = [0, 0, 0];
    for (let i = 0; i < detected.shell.length; i++) {
      const entry = detected.shell[i];
      const predicted = scale(fit.assignedTemplate[i], detected.avgRadius);
      predictedWorld[entry.index] = predicted;
      const displacement = distance(entry.local, predicted);
      maxDisplacement = Math.max(maxDisplacement, displacement);
      sumSq += displacement * displacement;
    }
    const rmsDisplacement = Math.sqrt(sumSq / Math.max(1, detected.shell.length));
    return {
      groupId,
      groupLabel: labelForGroup(groupId),
      order: candidateOrder(groupId),
      maxDisplacementAng: maxDisplacement,
      rmsDisplacementAng: rmsDisplacement,
      kind: 'special-shell',
      centerIndex: detected.centerIndex,
      avgRadius: detected.avgRadius,
      predictedLocalCoords: predictedWorld,
      rotation: fit.rotation,
    };
  }

  function buildCandidateGroupIds() {
    const ids = ['C1', 'Cs', 'Ci'];
    for (let n = 2; n <= MAX_GENERIC_N; n++) {
      ids.push(`C${n}`);
      ids.push(`C${n}v`);
      ids.push(`C${n}h`);
      ids.push(`D${n}`);
      ids.push(`D${n}h`);
      ids.push(`D${n}d`);
      if (n > 2 && n % 2 === 0) ids.push(`S${n}`);
    }
    ids.push('Td', 'Oh', 'Ih', 'Cinfv', 'Dinfh');
    return ids;
  }

  function enumerateCandidateGroups() {
    return CANDIDATE_GROUP_IDS;
  }

  function buildCandidateForGroup(groupId, centered) {
    const cache = getCenteredAnalysisCache(centered);
    if (cache.candidateByGroup.has(groupId)) return cache.candidateByGroup.get(groupId);
    let candidate = null;
    if (groupId === 'C1') candidate = findBestGenericCandidate('C1', centered);
    else if (groupId === 'Cinfv' || groupId === 'Dinfh') candidate = findBestLinearCandidate(groupId, centered);
    else if (groupId === 'Td' || groupId === 'Oh' || groupId === 'Ih') {
      candidate = quickRejectShellGroup(groupId, centered)
        ? null
        : buildSpecialShellCandidate(groupId, centered);
    } else candidate = findBestGenericCandidate(groupId, centered);
    cache.candidateByGroup.set(groupId, candidate || null);
    return candidate;
  }

  function buildApproximateCandidates(centered, toleranceAng) {
    const candidates = [];
    for (const groupId of enumerateCandidateGroups()) {
      const candidate = buildCandidateForGroup(groupId, centered);
      if (!candidate) continue;
      if (candidate.rmsDisplacementAng <= toleranceAng + 1e-12) candidates.push(candidate);
    }
    const deduped = new Map();
    for (const candidate of candidates) {
      const existing = deduped.get(candidate.groupId);
      if (!existing || rankCandidates(candidate, existing) < 0) deduped.set(candidate.groupId, candidate);
    }
    return Array.from(deduped.values()).sort(rankCandidates);
  }

  function sanitizeCandidate(candidate) {
    return candidate ? {
      groupId: candidate.groupId,
      groupLabel: candidate.groupLabel,
      order: candidate.order,
      maxDisplacementAng: candidate.maxDisplacementAng,
      rmsDisplacementAng: candidate.rmsDisplacementAng,
    } : null;
  }

  function frameFromRotationMatrix(rotation) {
    if (!rotation) return buildFrame([0, 0, 1], [1, 0, 0]);
    return {
      x: canonicalizeDirection([rotation[0][0], rotation[1][0], rotation[2][0]]) || [1, 0, 0],
      y: canonicalizeDirection([rotation[0][1], rotation[1][1], rotation[2][1]]) || [0, 1, 0],
      z: canonicalizeDirection([rotation[0][2], rotation[1][2], rotation[2][2]]) || [0, 0, 1],
    };
  }

  function classifyPlaneLabel(groupId, localNormal) {
    const n = normalize(localNormal);
    if (!n) return 'σ plane';
    if (groupId === 'Cs') return 'σ plane';
    if (Math.abs(Math.abs(n[2]) - 1) <= 1e-5) return 'σh plane';
    if (/v$/u.test(groupId)) return 'σv plane';
    if (/d$/u.test(groupId)) return 'σd plane';
    return 'σ plane';
  }

  function addElementUnique(elements, next, options = {}) {
    if (!next) return;
    const tol = Number(options.tol) || 1e-5;
    if (next.type === 'center') {
      if (elements.some((entry) => entry.type === 'center')) return;
      elements.push(next);
      return;
    }
    if (next.type === 'plane') {
      if (elements.some((entry) => entry.type === 'plane' && directionsEquivalent(entry.normal, next.normal, tol))) return;
      elements.push(next);
      return;
    }
    if (next.type === 'axis') {
      const existing = elements.find((entry) => entry.type === 'axis' && directionsEquivalent(entry.axis, next.axis, tol));
      if (!existing) {
        elements.push(next);
        return;
      }
      if ((next.order || 0) > (existing.order || 0)) {
        existing.order = next.order;
        existing.label = next.label;
      }
    }
  }

  function finalizeElementLabels(elements) {
    const familyCounts = new Map();
    for (const entry of elements) {
      const base = String(entry.label || '').trim();
      familyCounts.set(base, (familyCounts.get(base) || 0) + 1);
    }
    const familyIndex = new Map();
    for (const entry of elements) {
      const base = String(entry.label || '').trim();
      const total = familyCounts.get(base) || 0;
      if (total <= 1) continue;
      const next = (familyIndex.get(base) || 0) + 1;
      familyIndex.set(base, next);
      entry.label = `${base} ${next}`;
    }
    for (let i = 0; i < elements.length; i++) {
      const entry = elements[i];
      entry.id = entry.id || `element-${i + 1}`;
    }
  }

  function buildSpecialShellElements(candidate, centeredState) {
    const elements = [];
    const frame = frameFromRotationMatrix(candidate && candidate.rotation);
    const groupId = String(candidate && candidate.groupId || '');
    if (groupId === 'Td') {
      for (const dir of TETRA_TEMPLATE) {
        addElementUnique(elements, {
          type: 'axis',
          axis: worldDirectionFromFrame(frame, dir),
          order: 3,
          label: 'C3 axis',
        });
      }
      for (const dir of OCTA_TEMPLATE.slice(0, 3)) {
        addElementUnique(elements, {
          type: 'axis',
          axis: worldDirectionFromFrame(frame, dir),
          order: 2,
          label: 'C2 axis',
        });
      }
      const planeNormals = [
        normalize([1, 1, 0]), normalize([1, -1, 0]),
        normalize([1, 0, 1]), normalize([1, 0, -1]),
        normalize([0, 1, 1]), normalize([0, 1, -1]),
      ].filter(Boolean);
      for (const normal of planeNormals) {
        addElementUnique(elements, {
          type: 'plane',
          normal: worldDirectionFromFrame(frame, normal),
          label: 'σd plane',
        });
      }
    } else if (groupId === 'Oh') {
      addElementUnique(elements, { type: 'center', point: centeredState.centroid.slice(), label: 'Inversion center' });
      for (const dir of OCTA_TEMPLATE.slice(0, 3)) {
        addElementUnique(elements, {
          type: 'axis',
          axis: worldDirectionFromFrame(frame, dir),
          order: 4,
          label: 'C4 axis',
        });
      }
      const c3Dirs = [
        normalize([1, 1, 1]), normalize([1, 1, -1]),
        normalize([1, -1, 1]), normalize([-1, 1, 1]),
      ].filter(Boolean);
      for (const dir of c3Dirs) {
        addElementUnique(elements, {
          type: 'axis',
          axis: worldDirectionFromFrame(frame, dir),
          order: 3,
          label: 'C3 axis',
        });
      }
      const c2Dirs = [
        normalize([1, 1, 0]), normalize([1, -1, 0]),
        normalize([1, 0, 1]), normalize([1, 0, -1]),
        normalize([0, 1, 1]), normalize([0, 1, -1]),
      ].filter(Boolean);
      for (const dir of c2Dirs) {
        addElementUnique(elements, {
          type: 'axis',
          axis: worldDirectionFromFrame(frame, dir),
          order: 2,
          label: 'C2 axis',
        });
        addElementUnique(elements, {
          type: 'plane',
          normal: worldDirectionFromFrame(frame, dir),
          label: 'σd plane',
        });
      }
      for (const normal of OCTA_TEMPLATE.slice(0, 3)) {
        addElementUnique(elements, {
          type: 'plane',
          normal: worldDirectionFromFrame(frame, normal),
          label: 'σh plane',
        });
      }
    } else if (groupId === 'Ih') {
      addElementUnique(elements, { type: 'center', point: centeredState.centroid.slice(), label: 'Inversion center' });
      for (const dir of ICOSA_TEMPLATE) {
        addElementUnique(elements, {
          type: 'axis',
          axis: worldDirectionFromFrame(frame, dir),
          order: 5,
          label: 'C5 axis',
        });
      }
    }
    finalizeElementLabels(elements);
    return elements;
  }

  function describeSymmetryElements(analysis) {
    const internal = analysis && analysis._internal;
    const centeredState = internal && internal.centeredState;
    const candidate = internal && internal.exactCandidate;
    if (!centeredState || !candidate) return [];
    if (candidate.kind === 'special-shell') return buildSpecialShellElements(candidate, centeredState);
    const elements = [];
    if (candidate.kind === 'linear') {
      const axis = canonicalizeDirection(candidate.axis || [0, 0, 1]) || [0, 0, 1];
      const frame = candidate.frame || buildFrame(axis, [1, 0, 0]);
      addElementUnique(elements, { type: 'axis', axis, order: Infinity, label: 'C∞ axis' });
      addElementUnique(elements, { type: 'plane', normal: worldDirectionFromFrame(frame, [0, 1, 0]), label: 'σv plane' });
      if (candidate.groupId === 'Dinfh') {
        addElementUnique(elements, { type: 'center', point: centeredState.centroid.slice(), label: 'Inversion center' });
        addElementUnique(elements, { type: 'plane', normal: axis, label: 'σh plane' });
        addElementUnique(elements, { type: 'axis', axis: worldDirectionFromFrame(frame, [1, 0, 0]), order: 2, label: 'C2 axis' });
      }
      finalizeElementLabels(elements);
      return elements;
    }
    const frame = candidate.frame || buildFrame([0, 0, 1], [1, 0, 0]);
    const improperMatch = /^S(\d+)$/u.exec(String(candidate.groupId || ''));
    if (improperMatch) {
      const order = Number(improperMatch[1]) || 0;
      if (order > 0) {
        addElementUnique(elements, {
          type: 'axis',
          axis: worldDirectionFromFrame(frame, [0, 0, 1]),
          order,
          label: `S${order} axis`,
        });
      }
    }
    const ops = Array.isArray(candidate.ops) ? candidate.ops : [];
    for (const op of ops) {
      if (!op || isIdentityMatrix(op)) continue;
      if (isNegativeIdentityMatrix(op)) {
        addElementUnique(elements, { type: 'center', point: centeredState.centroid.slice(), label: 'Inversion center' });
        continue;
      }
      const reflectionNormal = extractReflectionNormalFromMatrix(op);
      if (reflectionNormal) {
        addElementUnique(elements, {
          type: 'plane',
          normal: worldDirectionFromFrame(frame, reflectionNormal),
          label: classifyPlaneLabel(candidate.groupId, reflectionNormal),
        });
        continue;
      }
      const rotation = extractRotationElementFromMatrix(op);
      if (rotation) {
        addElementUnique(elements, {
          type: 'axis',
          axis: worldDirectionFromFrame(frame, rotation.axis),
          order: rotation.order,
          label: `C${rotation.order} axis`,
        });
      }
    }
    finalizeElementLabels(elements);
    return elements;
  }

  function analyzePointGroup(targetAtoms, options = {}) {
    const toleranceAng = Math.max(EXACT_TOLERANCE_ANG, Number(options.toleranceAng) || DEFAULT_TOLERANCE_ANG);
    const centeredState = centerTargetAtoms(targetAtoms);
    const centered = centeredState.centered;
    const approximateCandidates = buildApproximateCandidates(centered, toleranceAng);
    const exactCandidate = pickBestCandidate(approximateCandidates.filter((candidate) => (
      candidate && (candidate.rmsDisplacementAng || 0) <= EXACT_TOLERANCE_ANG + 1e-12
    ))) || {
      groupId: 'C1',
      groupLabel: 'C1',
      order: 1,
      maxDisplacementAng: 0,
      rmsDisplacementAng: 0,
      kind: 'generic',
      frame: buildFrame([0, 0, 1], [1, 0, 0]),
      ops: [matIdentity()],
    };
    return {
      targetAtomCount: centeredState.atoms.length,
      toleranceAng,
      exactGroupId: exactCandidate.groupId,
      exactGroupLabel: exactCandidate.groupLabel,
      exactCandidate: sanitizeCandidate(exactCandidate),
      approximateCandidates: approximateCandidates.map(sanitizeCandidate),
      _internal: {
        centeredState,
        exactCandidate,
        approximateCandidates,
      },
    };
  }

  function buildPreviewFromCandidate(targetAtoms, candidate, options = {}) {
    if (!candidate) return null;
    const centeredState = options.centeredState || centerTargetAtoms(targetAtoms);
    const centered = centeredState.centered;
    let projectedLocal = null;
    let beforeResidual = { maxDisplacementAng: 0, rmsDisplacementAng: 0 };
    let afterResidual = { maxDisplacementAng: 0, rmsDisplacementAng: 0 };
    if (candidate.kind === 'special-shell') {
      projectedLocal = candidate.predictedLocalCoords.map((coord) => cloneVec(coord));
      beforeResidual = {
        maxDisplacementAng: candidate.maxDisplacementAng,
        rmsDisplacementAng: candidate.rmsDisplacementAng,
      };
      afterResidual = { maxDisplacementAng: 0, rmsDisplacementAng: 0 };
    } else if (candidate.kind === 'linear') {
      const axis = candidate.axis || [0, 0, 1];
      projectedLocal = centered.map((entry) => projectOntoAxis(entry.local, axis));
      if (candidate.groupId === 'Dinfh') {
        const frame = candidate.frame || buildFrame(axis, [1, 0, 0]);
        const projectedAtoms = projectedLocal.map((local, index) => ({ atom: centered[index].atom, local: worldToLocal(frame, local) }));
        const iterated = iterateOperationProjection(projectedAtoms, candidate.ops || [matIdentity(), matDiagonal(-1, -1, -1)]);
        projectedLocal = iterated.localCoords.map((local) => localToWorld(frame, local, [0, 0, 0]));
        afterResidual = iterated.afterResidual;
      }
      beforeResidual = {
        maxDisplacementAng: candidate.maxDisplacementAng,
        rmsDisplacementAng: candidate.rmsDisplacementAng,
      };
    } else {
      const localAtoms = transformCenteredToFrame(centered, candidate.frame || buildFrame([0, 0, 1], [1, 0, 0]));
      const iterated = iterateOperationProjection(localAtoms, candidate.ops || [matIdentity()]);
      projectedLocal = iterated.localCoords.map((local) => localToWorld(candidate.frame, local, [0, 0, 0]));
      beforeResidual = iterated.beforeResidual;
      afterResidual = iterated.afterResidual;
    }
    const atoms = centeredState.atoms.map((atom, index) => Object.assign({}, atom, {
      x: centeredState.centroid[0] + (projectedLocal[index] && projectedLocal[index][0] || 0),
      y: centeredState.centroid[1] + (projectedLocal[index] && projectedLocal[index][1] || 0),
      z: centeredState.centroid[2] + (projectedLocal[index] && projectedLocal[index][2] || 0),
    }));
    return {
      groupId: candidate.groupId,
      groupLabel: candidate.groupLabel,
      atoms,
      beforeResidual,
      afterResidual,
    };
  }

  function buildSymmetryPreview(targetAtoms, groupId, options = {}) {
    const centeredState = centerTargetAtoms(targetAtoms);
    const candidate = options.candidate && options.candidate.groupId === groupId
      ? options.candidate
      : buildCandidateForGroup(groupId, centeredState.centered);
    if (!candidate) return null;
    return buildPreviewFromCandidate(targetAtoms, candidate, { centeredState });
  }

  function applySymmetryPreview(targetAtoms, preview) {
    if (!preview || !Array.isArray(preview.atoms)) return cloneTargetAtoms(targetAtoms);
    return cloneTargetAtoms(preview.atoms);
  }

  function createEditSymmetryController(options = {}) {
    const state = {
      toleranceAng: Math.max(EXACT_TOLERANCE_ANG, Number(options.toleranceAng) || DEFAULT_TOLERANCE_ANG),
      analysis: null,
      preview: null,
    };
    return {
      getTolerance() {
        return state.toleranceAng;
      },
      setTolerance(nextTolerance) {
        state.toleranceAng = Math.max(EXACT_TOLERANCE_ANG, Number(nextTolerance) || DEFAULT_TOLERANCE_ANG);
        return state.toleranceAng;
      },
      getAnalysis() {
        return state.analysis;
      },
      describeElements(analysis = state.analysis) {
        return describeSymmetryElements(analysis);
      },
      analyzeTarget(targetAtoms, extraOptions = {}) {
        state.analysis = analyzePointGroup(targetAtoms, Object.assign({}, extraOptions, { toleranceAng: state.toleranceAng }));
        return state.analysis;
      },
      buildPreview(targetAtoms, groupId, extraOptions = {}) {
        state.preview = buildSymmetryPreview(targetAtoms, groupId, Object.assign({}, extraOptions, { toleranceAng: state.toleranceAng }));
        return state.preview;
      },
      getPreview() {
        return state.preview;
      },
      clearPreview() {
        state.preview = null;
      },
      applyPreview(targetAtoms, preview = state.preview) {
        return applySymmetryPreview(targetAtoms, preview);
      },
    };
  }

  global.VibeMolSymmetry = Object.freeze({
    analyzePointGroup,
    buildSymmetryPreview,
    applySymmetryPreview,
    describeSymmetryElements,
    createEditSymmetryController,
  });
})(typeof window !== 'undefined' ? window : globalThis);
