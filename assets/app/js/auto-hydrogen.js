(function (global) {
  'use strict';

  const {
    getCovalentRadiusAngstrom,
    isAutoBondSupportedAtomicNumber,
    countsTowardAtomValence,
  } = global.VibeMolBondInference || {};
  if (![getCovalentRadiusAngstrom, isAutoBondSupportedAtomicNumber, countsTowardAtomValence].every((fn) => typeof fn === 'function')) {
    throw new Error('VibeMolBondInference is not loaded. Ensure assets/app/js/bond-inference.js is included before assets/app/js/auto-hydrogen.js.');
  }

  const EPSILON = 1e-10;
  const AUTO_HYDROGEN_Z = 1;

  const GEOMETRY_TEMPLATES = Object.freeze({
    linear: Object.freeze([
      Object.freeze([1, 0, 0]),
      Object.freeze([-1, 0, 0]),
    ]),
    trigonal: Object.freeze([
      Object.freeze([1, 0, 0]),
      Object.freeze([-0.5, 0.8660254037844386, 0]),
      Object.freeze([-0.5, -0.8660254037844386, 0]),
    ]),
    tetrahedral: Object.freeze([
      Object.freeze([0.5773502691896258, 0.5773502691896258, 0.5773502691896258]),
      Object.freeze([0.5773502691896258, -0.5773502691896258, -0.5773502691896258]),
      Object.freeze([-0.5773502691896258, 0.5773502691896258, -0.5773502691896258]),
      Object.freeze([-0.5773502691896258, -0.5773502691896258, 0.5773502691896258]),
    ]),
    trigonalBipyramidal: Object.freeze([
      Object.freeze([0, 0, 1]),
      Object.freeze([0, 0, -1]),
      Object.freeze([1, 0, 0]),
      Object.freeze([-0.5, 0.8660254037844386, 0]),
      Object.freeze([-0.5, -0.8660254037844386, 0]),
    ]),
    octahedral: Object.freeze([
      Object.freeze([1, 0, 0]),
      Object.freeze([-1, 0, 0]),
      Object.freeze([0, 1, 0]),
      Object.freeze([0, -1, 0]),
      Object.freeze([0, 0, 1]),
      Object.freeze([0, 0, -1]),
    ]),
  });

  const AUTO_HYDROGEN_RULES = Object.freeze({
    5: Object.freeze({ symbol: 'B', targetValence: 3, targetBondCount: 3, geometryKey: 'trigonal' }),
    6: Object.freeze({ symbol: 'C', targetValence: 4 }),
    7: Object.freeze({ symbol: 'N', targetValence: 3 }),
    8: Object.freeze({ symbol: 'O', targetValence: 2 }),
    9: Object.freeze({ symbol: 'F', targetValence: 1, targetBondCount: 1, geometryKey: 'tetrahedral' }),
    14: Object.freeze({ symbol: 'Si', targetValence: 4, targetBondCount: 4, geometryKey: 'tetrahedral' }),
    15: Object.freeze({ symbol: 'P', targetValence: 3 }),
    16: Object.freeze({ symbol: 'S', targetValence: 2 }),
    17: Object.freeze({ symbol: 'Cl', targetValence: 1, targetBondCount: 1, geometryKey: 'tetrahedral' }),
    35: Object.freeze({ symbol: 'Br', targetValence: 1, targetBondCount: 1, geometryKey: 'tetrahedral' }),
    53: Object.freeze({ symbol: 'I', targetValence: 1, targetBondCount: 1, geometryKey: 'tetrahedral' }),
  });

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function vec3(x = 0, y = 0, z = 0) {
    return [Number(x) || 0, Number(y) || 0, Number(z) || 0];
  }

  function vecAdd(a, b) {
    return [
      (a[0] || 0) + (b[0] || 0),
      (a[1] || 0) + (b[1] || 0),
      (a[2] || 0) + (b[2] || 0),
    ];
  }

  function vecSub(a, b) {
    return [
      (a[0] || 0) - (b[0] || 0),
      (a[1] || 0) - (b[1] || 0),
      (a[2] || 0) - (b[2] || 0),
    ];
  }

  function vecScale(v, scalar) {
    const s = Number(scalar) || 0;
    return [(v[0] || 0) * s, (v[1] || 0) * s, (v[2] || 0) * s];
  }

  function vecDot(a, b) {
    return (a[0] || 0) * (b[0] || 0) + (a[1] || 0) * (b[1] || 0) + (a[2] || 0) * (b[2] || 0);
  }

  function vecCross(a, b) {
    return [
      (a[1] || 0) * (b[2] || 0) - (a[2] || 0) * (b[1] || 0),
      (a[2] || 0) * (b[0] || 0) - (a[0] || 0) * (b[2] || 0),
      (a[0] || 0) * (b[1] || 0) - (a[1] || 0) * (b[0] || 0),
    ];
  }

  function vecLengthSq(v) {
    return vecDot(v, v);
  }

  function vecLength(v) {
    return Math.sqrt(vecLengthSq(v));
  }

  function vecNormalize(v, fallback = [1, 0, 0]) {
    const len = vecLength(v);
    if (!(len > EPSILON)) return fallback.slice();
    return vecScale(v, 1 / len);
  }

  function vecProjectOntoPlane(v, normal) {
    const n = vecNormalize(normal);
    return vecSub(v, vecScale(n, vecDot(v, n)));
  }

  function quatIdentity() {
    return [0, 0, 0, 1];
  }

  function quatNormalize(q) {
    const len = Math.hypot(q[0] || 0, q[1] || 0, q[2] || 0, q[3] || 0);
    if (!(len > EPSILON)) return quatIdentity();
    return [(q[0] || 0) / len, (q[1] || 0) / len, (q[2] || 0) / len, (q[3] || 0) / len];
  }

  function quatMultiply(left, right) {
    const ax = left[0] || 0;
    const ay = left[1] || 0;
    const az = left[2] || 0;
    const aw = left[3] || 0;
    const bx = right[0] || 0;
    const by = right[1] || 0;
    const bz = right[2] || 0;
    const bw = right[3] || 0;
    return quatNormalize([
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz,
    ]);
  }

  function quatFromAxisAngle(axis, angle) {
    const unit = vecNormalize(axis);
    const half = (Number(angle) || 0) * 0.5;
    const s = Math.sin(half);
    return quatNormalize([unit[0] * s, unit[1] * s, unit[2] * s, Math.cos(half)]);
  }

  function quatFromUnitVectors(from, to) {
    const vFrom = vecNormalize(from);
    const vTo = vecNormalize(to);
    const dot = clamp(vecDot(vFrom, vTo), -1, 1);
    if (dot > 1 - 1e-8) return quatIdentity();
    if (dot < -1 + 1e-8) {
      let axis = vecCross([1, 0, 0], vFrom);
      if (vecLengthSq(axis) < EPSILON) axis = vecCross([0, 1, 0], vFrom);
      return quatFromAxisAngle(axis, Math.PI);
    }
    const axis = vecCross(vFrom, vTo);
    return quatNormalize([axis[0], axis[1], axis[2], 1 + dot]);
  }

  function applyQuatToVec(v, q) {
    const qx = q[0] || 0;
    const qy = q[1] || 0;
    const qz = q[2] || 0;
    const qw = q[3] || 1;
    const vx = v[0] || 0;
    const vy = v[1] || 0;
    const vz = v[2] || 0;

    const ix = qw * vx + qy * vz - qz * vy;
    const iy = qw * vy + qz * vx - qx * vz;
    const iz = qw * vz + qx * vy - qy * vx;
    const iw = -qx * vx - qy * vy - qz * vz;

    return [
      ix * qw + iw * -qx + iy * -qz - iz * -qy,
      iy * qw + iw * -qy + iz * -qx - ix * -qz,
      iz * qw + iw * -qz + ix * -qy - iy * -qx,
    ];
  }

  function signedAngleAroundAxis(from, to, axis) {
    const a = vecNormalize(vecProjectOntoPlane(from, axis), [1, 0, 0]);
    const b = vecNormalize(vecProjectOntoPlane(to, axis), [1, 0, 0]);
    const n = vecNormalize(axis);
    const cross = vecCross(a, b);
    const sin = clamp(vecDot(cross, n), -1, 1);
    const cos = clamp(vecDot(a, b), -1, 1);
    return Math.atan2(sin, cos);
  }

  function chooseReferenceOccupiedPair(occupiedDirs) {
    if (!Array.isArray(occupiedDirs) || occupiedDirs.length < 2) return [0, 0];
    let bestI = 0;
    let bestJ = 1;
    let bestScore = -Infinity;
    for (let i = 0; i < occupiedDirs.length; i += 1) {
      for (let j = i + 1; j < occupiedDirs.length; j += 1) {
        const score = 1 - clamp(vecDot(occupiedDirs[i], occupiedDirs[j]), -1, 1);
        if (score > bestScore) {
          bestScore = score;
          bestI = i;
          bestJ = j;
        }
      }
    }
    return [bestI, bestJ];
  }

  function alignTemplateToTwoVectors(templateA, templateB, targetA, targetB) {
    const q1 = quatFromUnitVectors(templateA, targetA);
    const rotatedB = applyQuatToVec(templateB, q1);
    const axis = vecNormalize(targetA);
    const projRotated = vecProjectOntoPlane(rotatedB, axis);
    const projTarget = vecProjectOntoPlane(targetB, axis);
    if (vecLengthSq(projRotated) < EPSILON || vecLengthSq(projTarget) < EPSILON) return q1;
    const angle = signedAngleAroundAxis(projRotated, projTarget, axis);
    const q2 = quatFromAxisAngle(axis, angle);
    return quatMultiply(q2, q1);
  }

  function scoreTemplateAssignment(rotatedTemplate, occupiedDirs) {
    if (!occupiedDirs.length) return { score: 0, assignment: [] };
    if (occupiedDirs.length > rotatedTemplate.length) return { score: Infinity, assignment: [] };
    let bestScore = Infinity;
    let bestAssignment = [];
    const used = new Array(rotatedTemplate.length).fill(false);
    const assignment = new Array(occupiedDirs.length).fill(-1);

    function visit(targetIndex, score) {
      if (score >= bestScore) return;
      if (targetIndex >= occupiedDirs.length) {
        bestScore = score;
        bestAssignment = assignment.slice();
        return;
      }
      for (let templateIndex = 0; templateIndex < rotatedTemplate.length; templateIndex += 1) {
        if (used[templateIndex]) continue;
        used[templateIndex] = true;
        assignment[targetIndex] = templateIndex;
        const cost = 1 - clamp(vecDot(rotatedTemplate[templateIndex], occupiedDirs[targetIndex]), -1, 1);
        visit(targetIndex + 1, score + cost);
        used[templateIndex] = false;
        assignment[targetIndex] = -1;
      }
    }

    visit(0, 0);
    return { score: bestScore, assignment: bestAssignment };
  }

  function chooseHydrogenSiteIndices(rotatedTemplate, occupiedDirs, occupiedAssignment, hydrogenCount) {
    const used = new Set((Array.isArray(occupiedAssignment) ? occupiedAssignment : []).filter((index) => Number.isInteger(index) && index >= 0));
    const available = rotatedTemplate
      .map((_dir, index) => index)
      .filter((index) => !used.has(index));
    if (hydrogenCount <= 0) return [];
    if (hydrogenCount >= available.length) return available.slice();
    let bestScore = -Infinity;
    let bestIndices = available.slice(0, hydrogenCount);
    const chosen = [];

    function scoreChosen(indices) {
      let score = 0;
      for (let i = 0; i < indices.length; i += 1) {
        const dirI = rotatedTemplate[indices[i]];
        for (let j = i + 1; j < indices.length; j += 1) {
          score += 1 - clamp(vecDot(dirI, rotatedTemplate[indices[j]]), -1, 1);
        }
        for (const occupied of occupiedDirs) {
          score += 0.75 * (1 - clamp(vecDot(dirI, occupied), -1, 1));
        }
      }
      return score;
    }

    function choose(start) {
      if (chosen.length === hydrogenCount) {
        const score = scoreChosen(chosen);
        if (score > bestScore) {
          bestScore = score;
          bestIndices = chosen.slice();
        }
        return;
      }
      for (let i = start; i < available.length; i += 1) {
        chosen.push(available[i]);
        choose(i + 1);
        chosen.pop();
      }
    }

    choose(0);
    return bestIndices;
  }

  function orientTemplate(templateDirs, occupiedDirs) {
    if (!occupiedDirs.length) {
      return {
        rotatedTemplate: templateDirs.map((dir) => dir.slice()),
        assignment: [],
      };
    }
    let best = null;
    const normalizedTemplate = templateDirs.map((dir) => vecNormalize(dir));
    const normalizedOccupied = occupiedDirs.map((dir) => vecNormalize(dir));
    if (normalizedOccupied.length === 1) {
      for (let i = 0; i < normalizedTemplate.length; i += 1) {
        const q = quatFromUnitVectors(normalizedTemplate[i], normalizedOccupied[0]);
        const rotated = normalizedTemplate.map((dir) => vecNormalize(applyQuatToVec(dir, q)));
        const score = scoreTemplateAssignment(rotated, normalizedOccupied);
        if (!best || score.score < best.score) {
          best = { score: score.score, rotatedTemplate: rotated, assignment: score.assignment };
        }
      }
      return best;
    }
    const [occupiedRefA, occupiedRefB] = chooseReferenceOccupiedPair(normalizedOccupied);
    const targetA = normalizedOccupied[occupiedRefA];
    const targetB = normalizedOccupied[occupiedRefB];
    for (let i = 0; i < normalizedTemplate.length; i += 1) {
      for (let j = 0; j < normalizedTemplate.length; j += 1) {
        if (i === j) continue;
        const q = alignTemplateToTwoVectors(normalizedTemplate[i], normalizedTemplate[j], targetA, targetB);
        const rotated = normalizedTemplate.map((dir) => vecNormalize(applyQuatToVec(dir, q)));
        const score = scoreTemplateAssignment(rotated, normalizedOccupied);
        if (!best || score.score < best.score) {
          best = { score: score.score, rotatedTemplate: rotated, assignment: score.assignment };
        }
      }
    }
    return best || {
      rotatedTemplate: normalizedTemplate.map((dir) => dir.slice()),
      assignment: [],
    };
  }

  function getGeometryTemplate(geometryKey) {
    const key = String(geometryKey || '').trim();
    const template = GEOMETRY_TEMPLATES[key] || GEOMETRY_TEMPLATES.tetrahedral;
    return template.map((dir) => dir.slice());
  }

  function getAutoHydrogenRule(z) {
    return AUTO_HYDROGEN_RULES[z | 0] || null;
  }

  function isAutoHydrogenSupportedAtomicNumber(z) {
    const n = z | 0;
    return n !== AUTO_HYDROGEN_Z && !!getAutoHydrogenRule(n) && isAutoBondSupportedAtomicNumber(n);
  }

  function resolveGeometryForEnvironment(z, env, rule) {
    if (!rule) return null;
    const atomicNumber = z | 0;
    const maxBondOrder = Math.max(1, Number(env && env.maxBondOrder) || 1);
    switch (atomicNumber) {
      case 5:
        return { geometryKey: 'trigonal', siteCount: 3, targetBondCount: 3 };
      case 6:
        if (maxBondOrder >= 3) return { geometryKey: 'linear', siteCount: 2, targetBondCount: 2 };
        if (maxBondOrder >= 2) return { geometryKey: 'trigonal', siteCount: 3, targetBondCount: 3 };
        return { geometryKey: 'tetrahedral', siteCount: 4, targetBondCount: 4 };
      case 7:
        if (maxBondOrder >= 2) return { geometryKey: 'trigonal', siteCount: 3, targetBondCount: 2 };
        return { geometryKey: 'tetrahedral', siteCount: 4, targetBondCount: 3 };
      case 8:
        if (maxBondOrder >= 2) return { geometryKey: 'trigonal', siteCount: 3, targetBondCount: 1 };
        return { geometryKey: 'tetrahedral', siteCount: 4, targetBondCount: 2 };
      case 9:
      case 17:
      case 35:
      case 53:
        return { geometryKey: 'tetrahedral', siteCount: 4, targetBondCount: 1 };
      case 14:
        return { geometryKey: 'tetrahedral', siteCount: 4, targetBondCount: 4 };
      case 15:
        if (maxBondOrder >= 2) return { geometryKey: 'trigonal', siteCount: 3, targetBondCount: 2 };
        return { geometryKey: 'tetrahedral', siteCount: 4, targetBondCount: 3 };
      case 16:
        if (maxBondOrder >= 2) return { geometryKey: 'trigonal', siteCount: 3, targetBondCount: 1 };
        return { geometryKey: 'tetrahedral', siteCount: 4, targetBondCount: 2 };
      default:
        return {
          geometryKey: rule.geometryKey || 'tetrahedral',
          siteCount: getGeometryTemplate(rule.geometryKey || 'tetrahedral').length,
          targetBondCount: Number(rule.targetBondCount) || Number(rule.targetValence) || 0,
        };
    }
  }

  function resolveBondIndex(structure, endpoint, atomIds) {
    if (typeof endpoint === 'string') return atomIds.get(String(endpoint).trim());
    if (Number.isInteger(endpoint)) return endpoint | 0;
    return -1;
  }

  function normalizeBondOrder(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(4, Math.round(n)));
  }

  function buildAtomEnvironments(structure) {
    const atoms = Array.isArray(structure && structure.atoms) ? structure.atoms : [];
    const bonds = Array.isArray(structure && structure.bonds) ? structure.bonds : [];
    const atomIds = new Map();
    atoms.forEach((atom, index) => {
      atomIds.set(String((atom && atom.id) || index), index);
    });
    const envs = atoms.map(() => ({
      bondOrderSum: 0,
      neighborCount: 0,
      maxBondOrder: 0,
      neighborIndices: [],
      occupiedDirs: [],
    }));
    for (const rawBond of bonds) {
      if (!rawBond || typeof rawBond !== 'object') continue;
      const i = resolveBondIndex(structure, rawBond.a, atomIds);
      const j = resolveBondIndex(structure, rawBond.b, atomIds);
      if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= atoms.length || j >= atoms.length || i === j) continue;
      const atomI = atoms[i] || {};
      const atomJ = atoms[j] || {};
      const posI = vec3(atomI.x, atomI.y, atomI.z);
      const posJ = vec3(atomJ.x, atomJ.y, atomJ.z);
      const deltaIJ = vecSub(posJ, posI);
      const deltaJI = vecScale(deltaIJ, -1);
      if (vecLengthSq(deltaIJ) < EPSILON) continue;
      const order = normalizeBondOrder(rawBond.order || 1);
      const envI = envs[i];
      const envJ = envs[j];
      if (countsTowardAtomValence(atomI, atomJ)) {
        envI.bondOrderSum += order;
        envI.maxBondOrder = Math.max(envI.maxBondOrder, order);
        envI.neighborIndices.push(j);
        envI.occupiedDirs.push(vecNormalize(deltaIJ));
      }
      if (countsTowardAtomValence(atomJ, atomI)) {
        envJ.bondOrderSum += order;
        envJ.maxBondOrder = Math.max(envJ.maxBondOrder, order);
        envJ.neighborIndices.push(i);
        envJ.occupiedDirs.push(vecNormalize(deltaJI));
      }
    }
    envs.forEach((env) => {
      env.neighborCount = env.neighborIndices.length;
      if (!(env.maxBondOrder > 0)) env.maxBondOrder = env.neighborCount > 0 ? 1 : 0;
    });
    return envs;
  }

  function planAtomHydrogens(atom, env, options = {}) {
    const z = Number(atom && atom.Z) | 0;
    if (!isAutoHydrogenSupportedAtomicNumber(z)) return null;
    const rule = typeof options.resolveRule === 'function'
      ? options.resolveRule(atom, env, getAutoHydrogenRule(z))
      : getAutoHydrogenRule(z);
    if (!rule || !(Number(rule.targetValence) > 0)) return null;
    const defaultGeometry = resolveGeometryForEnvironment(z, env, rule);
    const geometry = typeof options.resolveGeometry === 'function'
      ? (options.resolveGeometry(atom, env, rule, defaultGeometry) || defaultGeometry)
      : defaultGeometry;
    if (!geometry || !(geometry.siteCount > 0) || !(geometry.targetBondCount > 0)) return null;
    const bondOrderDeficit = Math.max(0, (Number(rule.targetValence) || 0) - (Number(env && env.bondOrderSum) || 0));
    const bondSiteDeficit = Math.max(0, (Number(geometry.targetBondCount) || 0) - (Number(env && env.neighborCount) || 0));
    const siteCapacity = Math.max(0, (Number(geometry.siteCount) || 0) - (Number(env && env.neighborCount) || 0));
    const hydrogenCount = Math.min(bondOrderDeficit, bondSiteDeficit, siteCapacity);
    if (!(hydrogenCount > 0)) {
      return {
        atomIndex: Number(options.atomIndex) || 0,
        atomId: String(atom && atom.id || ''),
        atomicNumber: z,
        hydrogenCount: 0,
        targetValence: Number(rule.targetValence) || 0,
        targetBondCount: Number(geometry.targetBondCount) || 0,
        geometryKey: geometry.geometryKey,
        bondOrderSum: Number(env && env.bondOrderSum) || 0,
        neighborCount: Number(env && env.neighborCount) || 0,
        hydrogens: [],
      };
    }
    const template = getGeometryTemplate(geometry.geometryKey);
    const occupiedDirs = Array.isArray(env && env.occupiedDirs) ? env.occupiedDirs.map((dir) => vecNormalize(dir)) : [];
    const oriented = orientTemplate(template, occupiedDirs);
    const chosenIndices = chooseHydrogenSiteIndices(oriented.rotatedTemplate, occupiedDirs, oriented.assignment, hydrogenCount);
    const bondLengthScale = Number.isFinite(options.bondLengthScale) ? Number(options.bondLengthScale) : 1;
    const bondLength = Math.max(0.1, (getCovalentRadiusAngstrom(z) + getCovalentRadiusAngstrom(AUTO_HYDROGEN_Z)) * bondLengthScale);
    const origin = vec3(atom && atom.x, atom && atom.y, atom && atom.z);
    const hydrogens = chosenIndices.map((templateIndex, localIndex) => {
      const dir = vecNormalize(oriented.rotatedTemplate[templateIndex]);
      const position = vecAdd(origin, vecScale(dir, bondLength));
      return {
        localIndex,
        parentIndex: Number(options.atomIndex) || 0,
        parentId: String(atom && atom.id || ''),
        direction: dir.slice(),
        bondLength,
        x: position[0],
        y: position[1],
        z: position[2],
        order: 1,
        kind: 'normal',
        origin: 'explicit',
      };
    });
    return {
      atomIndex: Number(options.atomIndex) || 0,
      atomId: String(atom && atom.id || ''),
      atomicNumber: z,
      hydrogenCount: hydrogens.length,
      targetValence: Number(rule.targetValence) || 0,
      targetBondCount: Number(geometry.targetBondCount) || 0,
      geometryKey: geometry.geometryKey,
      bondOrderSum: Number(env && env.bondOrderSum) || 0,
      neighborCount: Number(env && env.neighborCount) || 0,
      hydrogens,
    };
  }

  function buildAutoHydrogenPlan(structure, options = {}) {
    const atoms = Array.isArray(structure && structure.atoms) ? structure.atoms : [];
    const envs = buildAtomEnvironments(structure);
    const focusAtomIndices = Array.isArray(options.focusAtomIndices)
      ? Array.from(new Set(options.focusAtomIndices.map((value) => Number(value) | 0).filter((value) => value >= 0 && value < atoms.length))).sort((a, b) => a - b)
      : null;
    const targetIndices = focusAtomIndices && focusAtomIndices.length
      ? focusAtomIndices
      : atoms.map((_atom, index) => index);
    const parents = [];
    const hydrogens = [];
    const bonds = [];
    const skipped = [];
    for (const atomIndex of targetIndices) {
      const atom = atoms[atomIndex];
      if (!atom) continue;
      const plan = planAtomHydrogens(atom, envs[atomIndex], {
        atomIndex,
        resolveRule: options.resolveRule,
        resolveGeometry: options.resolveGeometry,
        bondLengthScale: options.bondLengthScale,
      });
      if (!plan) {
        skipped.push({ atomIndex, atomId: String(atom.id || ''), reason: 'unsupported' });
        continue;
      }
      if (!plan.hydrogenCount) {
        skipped.push({ atomIndex, atomId: plan.atomId, reason: 'saturated' });
        continue;
      }
      parents.push({
        atomIndex: plan.atomIndex,
        atomId: plan.atomId,
        atomicNumber: plan.atomicNumber,
        hydrogenCount: plan.hydrogenCount,
        targetValence: plan.targetValence,
        targetBondCount: plan.targetBondCount,
        geometryKey: plan.geometryKey,
      });
      for (const hydrogen of plan.hydrogens) {
        hydrogens.push(hydrogen);
        bonds.push({
          parentIndex: hydrogen.parentIndex,
          parentId: hydrogen.parentId,
          order: 1,
          kind: 'normal',
          origin: 'explicit',
        });
      }
    }
    return {
      scope: focusAtomIndices && focusAtomIndices.length ? 'selection' : 'structure',
      targetAtomIndices: targetIndices.slice(),
      parents,
      hydrogens,
      bonds,
      skipped,
      stats: {
        targetedAtomCount: targetIndices.length,
        parentCount: parents.length,
        hydrogenCount: hydrogens.length,
      },
    };
  }

  function summarizeAutoHydrogenPlan(plan) {
    const hydrogenCount = Number(plan && plan.stats && plan.stats.hydrogenCount) || 0;
    const parentCount = Number(plan && plan.stats && plan.stats.parentCount) || 0;
    const scope = String(plan && plan.scope || 'structure');
    if (hydrogenCount <= 0) {
      return scope === 'selection'
        ? 'No missing hydrogens found on the selected atoms.'
        : 'No missing hydrogens found on the current structure.';
    }
    const hydrogenLabel = hydrogenCount === 1 ? 'hydrogen' : 'hydrogens';
    const atomLabel = parentCount === 1 ? 'atom' : 'atoms';
    return `Added ${hydrogenCount} ${hydrogenLabel} to ${parentCount} ${atomLabel}.`;
  }

  function createAutoHydrogenController(options = {}) {
    const THREE = options.THREE;
    const getActiveRecord = typeof options.getActiveRecord === 'function' ? options.getActiveRecord : (() => null);
    const getSelection = typeof options.getSelection === 'function' ? options.getSelection : (() => []);
    const ensureVolumeSchema = typeof options.ensureVolumeSchema === 'function' ? options.ensureVolumeSchema : ((vol) => vol);
    const ensureAtomId = typeof options.ensureAtomId === 'function' ? options.ensureAtomId : ((atom) => String(atom && atom.id || ''));
    const getAtomBuilderMeta = typeof options.getAtomBuilderMeta === 'function' ? options.getAtomBuilderMeta : (() => ({ groupId: '', entryId: '', entryKind: '' }));
    const setAtomBuilderMeta = typeof options.setAtomBuilderMeta === 'function' ? options.setAtomBuilderMeta : (() => {});
    const atomUnitsToAng = typeof options.atomUnitsToAng === 'function' ? options.atomUnitsToAng : ((_vol, atom) => ({ x: atom && atom.x || 0, y: atom && atom.y || 0, z: atom && atom.z || 0 }));
    const worldToAtomUnits = typeof options.worldToAtomUnits === 'function' ? options.worldToAtomUnits : ((_vol, world) => [world.x || 0, world.y || 0, world.z || 0]);
    const cloneAtomsSnapshot = typeof options.cloneAtomsSnapshot === 'function' ? options.cloneAtomsSnapshot : (() => []);
    const cloneBondSnapshot = typeof options.cloneBondSnapshot === 'function' ? options.cloneBondSnapshot : (() => []);
    const cloneVolumeAnnotationsSnapshot = typeof options.cloneVolumeAnnotationsSnapshot === 'function'
      ? options.cloneVolumeAnnotationsSnapshot
      : (() => ({ builder: { byAtomId: {} }, coordination: { byAtomId: {} } }));
    const pushEditHistoryEntry = typeof options.pushEditHistoryEntry === 'function' ? options.pushEditHistoryEntry : (() => {});
    const upsertVolumeBond = typeof options.upsertVolumeBond === 'function' ? options.upsertVolumeBond : (() => null);
    const rebuildScene = typeof options.rebuildScene === 'function' ? options.rebuildScene : (() => {});
    const updateSidePanel = typeof options.updateSidePanel === 'function' ? options.updateSidePanel : (() => {});
    const updateSelectionVisuals = typeof options.updateSelectionVisuals === 'function' ? options.updateSelectionVisuals : (() => {});
    const setHintMessage = typeof options.setHintMessage === 'function' ? options.setHintMessage : (() => {});
    const finalizeAddAtomOperatorSession = typeof options.finalizeAddAtomOperatorSession === 'function' ? options.finalizeAddAtomOperatorSession : (() => false);
    const hasBlockingPlacement = typeof options.hasBlockingPlacement === 'function' ? options.hasBlockingPlacement : (() => false);
    const renderPreview = typeof options.renderPreview === 'function' ? options.renderPreview : (() => {});
    const clearPreviewRender = typeof options.clearPreviewRender === 'function' ? options.clearPreviewRender : (() => {});
    const getBlockingPlacementMessage = typeof options.getBlockingPlacementMessage === 'function'
      ? options.getBlockingPlacementMessage
      : (() => 'Finish the current placement step before adding hydrogens.');
    let previewState = null;

    function normalizeSelection(selection, atomCount) {
      const count = Math.max(0, Number(atomCount) | 0);
      return Array.from(new Set((Array.isArray(selection) ? selection : [])
        .map((value) => Number(value) | 0)
        .filter((value) => value >= 0 && value < count)))
        .sort((a, b) => a - b);
    }

    function buildSelectionKey(selection) {
      return Array.from(new Set((Array.isArray(selection) ? selection : [])
        .map((value) => Number(value) | 0)
        .filter((value) => value >= 0)))
        .sort((a, b) => a - b)
        .join(',');
    }

    function getCurrentSelection(vol) {
      const atomCount = vol && Array.isArray(vol.atoms) ? vol.atoms.length : 0;
      return normalizeSelection(getSelection(), atomCount);
    }

    function buildPreviewMessage(plan) {
      const hydrogenCount = Number(plan && plan.stats && plan.stats.hydrogenCount) || 0;
      const parentCount = Number(plan && plan.stats && plan.stats.parentCount) || 0;
      const hydrogenLabel = hydrogenCount === 1 ? 'hydrogen' : 'hydrogens';
      const atomLabel = parentCount === 1 ? 'atom' : 'atoms';
      return `Hydrogen preview: ${hydrogenCount} ${hydrogenLabel} on ${parentCount} ${atomLabel} • Press Space again to apply.`;
    }

    function buildPlanForRecord(record, options = {}) {
      const vol = record && record.vol;
      if (!vol || !Array.isArray(vol.atoms) || vol.atoms.length === 0) return null;
      ensureVolumeSchema(vol);
      const atoms = vol.atoms.map((atom) => {
        const world = atomUnitsToAng(vol, atom);
        return {
          id: ensureAtomId(atom),
          Z: Number(atom && atom.Z) | 0,
          x: Number(world && world.x) || 0,
          y: Number(world && world.y) || 0,
          z: Number(world && world.z) || 0,
          formalCharge: Number.isFinite(atom && atom.formalCharge) ? Math.round(Number(atom.formalCharge)) : 0,
        };
      });
      const bonds = Array.isArray(vol.bonds) ? cloneBondSnapshot(vol) : [];
      const selection = Array.isArray(options.selection)
        ? options.selection
        : (() => {
          const current = getSelection();
          return Array.isArray(current) ? current.slice() : [];
        })();
      return buildAutoHydrogenPlan({ atoms, bonds }, {
        focusAtomIndices: selection.length ? selection : null,
      });
    }

    function clearPreview(options = {}) {
      const quiet = !!options.quiet;
      previewState = null;
      clearPreviewRender();
      if (!quiet) setHintMessage('Hydrogen preview cleared.');
      return true;
    }

    function hasPreview() {
      return !!(previewState && previewState.plan && previewState.record && previewState.vol);
    }

    function captureContext(record, vol, selection, plan) {
      return {
        record,
        vol,
        selectionKey: buildSelectionKey(selection),
        atomCount: Array.isArray(vol && vol.atoms) ? vol.atoms.length : 0,
        bondCount: Array.isArray(vol && vol.bonds) ? vol.bonds.length : 0,
        plan,
      };
    }

    function isPreviewValidForCurrentContext() {
      if (!previewState) return false;
      const record = getActiveRecord();
      const vol = record && record.vol;
      if (!record || !vol || previewState.record !== record || previewState.vol !== vol) return false;
      const selection = getCurrentSelection(vol);
      return previewState.selectionKey === buildSelectionKey(selection)
        && previewState.atomCount === (Array.isArray(vol.atoms) ? vol.atoms.length : 0)
        && previewState.bondCount === (Array.isArray(vol.bonds) ? vol.bonds.length : 0);
    }

    function readCurrentContext() {
      const record = getActiveRecord();
      const vol = record && record.vol;
      if (!record || !vol || !Array.isArray(vol.atoms) || vol.atoms.length === 0) {
        setHintMessage('No editable atoms are available for hydrogenation.');
        return null;
      }
      if (hasBlockingPlacement()) {
        setHintMessage(getBlockingPlacementMessage());
        return null;
      }
      finalizeAddAtomOperatorSession({ commit: true, announce: false });
      ensureVolumeSchema(vol);
      const selection = getCurrentSelection(vol);
      const plan = buildPlanForRecord(record, { selection });
      if (!plan) {
        setHintMessage('No editable atoms are available for hydrogenation.');
        return null;
      }
      return { record, vol, selection, plan };
    }

    function applyPlan(context) {
      const record = context && context.record;
      const vol = context && context.vol;
      const plan = context && context.plan;
      if (!record || !vol || !plan) {
        setHintMessage('No editable atoms are available for hydrogenation.');
        return true;
      }
      if (!(plan.stats && plan.stats.hydrogenCount > 0)) {
        setHintMessage(summarizeAutoHydrogenPlan(plan));
        return true;
      }
      clearPreview({ quiet: true });
      const beforeAtoms = cloneAtomsSnapshot(vol);
      const beforeBonds = cloneBondSnapshot(vol);
      const beforeAnnotations = cloneVolumeAnnotationsSnapshot(vol);
      for (const hydrogen of plan.hydrogens) {
        const atom = {
          Z: AUTO_HYDROGEN_Z,
          x: 0,
          y: 0,
          z: 0,
          formalCharge: 0,
        };
        const world = new THREE.Vector3(Number(hydrogen.x) || 0, Number(hydrogen.y) || 0, Number(hydrogen.z) || 0);
        const atomUnits = worldToAtomUnits(vol, world);
        atom.x = Number(atomUnits[0]) || 0;
        atom.y = Number(atomUnits[1]) || 0;
        atom.z = Number(atomUnits[2]) || 0;
        ensureAtomId(atom);
        vol.atoms.push(atom);
        vol.natoms = vol.atoms.length;
        const meta = getAtomBuilderMeta(vol, hydrogen.parentIndex);
        if (meta && (meta.groupId || meta.entryId || meta.entryKind)) {
          setAtomBuilderMeta(vol, atom, meta);
        }
        upsertVolumeBond(vol, hydrogen.parentId, atom.id, hydrogen.order || 1, hydrogen.kind || 'normal', hydrogen.origin || 'explicit');
      }
      vol.natoms = vol.atoms.length;
      const afterAtoms = cloneAtomsSnapshot(vol);
      const afterBonds = cloneBondSnapshot(vol);
      const afterAnnotations = cloneVolumeAnnotationsSnapshot(vol);
      const hydrogenCount = plan.stats.hydrogenCount;
      pushEditHistoryEntry(record, beforeAtoms, afterAtoms, `Add ${hydrogenCount} hydrogen${hydrogenCount === 1 ? '' : 's'}`, {
        beforeBonds,
        afterBonds,
        beforeAnnotations,
        afterAnnotations,
      });
      rebuildScene({ preserveView: true });
      updateSelectionVisuals();
      updateSidePanel();
      setHintMessage(summarizeAutoHydrogenPlan(plan));
      return true;
    }

    function previewCurrentScope() {
      const context = readCurrentContext();
      if (!context) {
        clearPreview({ quiet: true });
        return true;
      }
      if (!(context.plan.stats && context.plan.stats.hydrogenCount > 0)) {
        clearPreview({ quiet: true });
        setHintMessage(summarizeAutoHydrogenPlan(context.plan));
        return true;
      }
      previewState = captureContext(context.record, context.vol, context.selection, context.plan);
      renderPreview(context.plan, context.record);
      setHintMessage(buildPreviewMessage(context.plan));
      return true;
    }

    function applyCurrentScope() {
      const context = readCurrentContext();
      if (!context) {
        clearPreview({ quiet: true });
        return true;
      }
      return applyPlan(context);
    }

    function applyPreview() {
      if (!isPreviewValidForCurrentContext()) {
        clearPreview({ quiet: true });
        return previewCurrentScope();
      }
      return applyPlan(previewState);
    }

    function handleShortcut() {
      if (isPreviewValidForCurrentContext()) return applyPreview();
      if (hasPreview()) clearPreview({ quiet: true });
      return previewCurrentScope();
    }

    return Object.freeze({
      buildPlanForRecord,
      clearPreview,
      hasPreview,
      previewCurrentScope,
      applyPreview,
      handleShortcut,
      applyCurrentScope,
      summarizeAutoHydrogenPlan,
    });
  }

  global.VibeMolAutoHydrogen = Object.freeze({
    AUTO_HYDROGEN_Z,
    getAutoHydrogenRule,
    isAutoHydrogenSupportedAtomicNumber,
    resolveGeometryForEnvironment,
    buildAutoHydrogenPlan,
    summarizeAutoHydrogenPlan,
    createAutoHydrogenController,
  });
})(window);
