(function (global) {
  'use strict';

  const EPSILON = 1e-8;
  const { countsTowardAtomValence } = global.VibeMolBondInference || {};
  const {
    getGeometry: getCoordinationGeometry,
    getCoordinationProfile,
  } = global.VibeMolCoordination || {};
  const { inferAtomGeometry } = global.VibeMolGeometryInference || {};
  if (![
    countsTowardAtomValence,
    getCoordinationGeometry,
    getCoordinationProfile,
    inferAtomGeometry,
  ].every((fn) => typeof fn === 'function')) {
    throw new Error('VibeMolEditHalo requires VibeMolBondInference, VibeMolCoordination and VibeMolGeometryInference to be loaded first.');
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function vec3(x = 0, y = 0, z = 0) {
    return [Number(x) || 0, Number(y) || 0, Number(z) || 0];
  }

  function vecSub(a, b) {
    return [(a[0] || 0) - (b[0] || 0), (a[1] || 0) - (b[1] || 0), (a[2] || 0) - (b[2] || 0)];
  }

  function vecAdd(a, b) {
    return [(a[0] || 0) + (b[0] || 0), (a[1] || 0) + (b[1] || 0), (a[2] || 0) + (b[2] || 0)];
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

  function quatNormalize(q) {
    const len = Math.hypot(q[0] || 0, q[1] || 0, q[2] || 0, q[3] || 0);
    if (!(len > EPSILON)) return [0, 0, 0, 1];
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
    if (dot > 1 - 1e-8) return [0, 0, 0, 1];
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

  function normalizeTemplate(template) {
    return (Array.isArray(template) ? template : []).map((dir) => vecNormalize(dir));
  }

  function chooseReferenceOccupiedPair(occupiedDirs) {
    if (!Array.isArray(occupiedDirs) || occupiedDirs.length < 2) return [0, 1];
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

  function sortIndicesByEquatorialPreference(template, indices) {
    return indices.slice().sort((left, right) => {
      const leftZ = Math.abs(Number(template[left] && template[left][2]) || 0);
      const rightZ = Math.abs(Number(template[right] && template[right][2]) || 0);
      if (leftZ !== rightZ) return leftZ - rightZ;
      return left - right;
    });
  }

  function chooseTransPair(template, indices) {
    if (!Array.isArray(indices) || indices.length < 2) return [];
    let bestPair = [];
    let bestDot = Infinity;
    for (let i = 0; i < indices.length; i += 1) {
      for (let j = i + 1; j < indices.length; j += 1) {
        const dot = clamp(vecDot(template[indices[i]], template[indices[j]]), -1, 1);
        if (dot < bestDot) {
          bestDot = dot;
          bestPair = [indices[i], indices[j]];
        }
      }
    }
    return bestPair;
  }

  function chooseLonePairIndices(template, remainingIndices, geometryId, lonePairs) {
    const requested = Math.max(0, lonePairs | 0);
    if (!requested || !Array.isArray(remainingIndices) || !remainingIndices.length) return [];
    if (geometryId === 'octahedral' && requested >= 2) {
      const transPair = chooseTransPair(template, remainingIndices);
      if (transPair.length === 2) {
        const leftovers = remainingIndices.filter((index) => !transPair.includes(index));
        return transPair.concat(sortIndicesByEquatorialPreference(template, leftovers)).slice(0, requested);
      }
    }
    return sortIndicesByEquatorialPreference(template, remainingIndices).slice(0, requested);
  }

  function partitionAlignedVertices(template, assignment, currentBonds, fullBondCount, lonePairs, geometryId) {
    const used = new Set((Array.isArray(assignment) ? assignment : []).filter((index) => Number.isInteger(index) && index >= 0));
    const occupiedIndices = Array.from(used.values());
    const extraOccupiedCount = Math.max(0, (currentBonds | 0) - occupiedIndices.length);
    if (extraOccupiedCount > 0) {
      const fill = sortIndicesByEquatorialPreference(template, template.map((_, index) => index).filter((index) => !used.has(index)));
      for (let i = 0; i < fill.length && occupiedIndices.length < (currentBonds | 0); i += 1) {
        const nextIndex = fill[i];
        used.add(nextIndex);
        occupiedIndices.push(nextIndex);
      }
    }
    const remainingIndices = template.map((_, index) => index).filter((index) => !used.has(index));
    const clampedLonePairs = Math.min(Math.max(0, lonePairs | 0), Math.max(0, remainingIndices.length));
    const lonePairIndices = chooseLonePairIndices(template, remainingIndices, geometryId, clampedLonePairs);
    const lonePairSet = new Set(lonePairIndices);
    const bondCapacity = Math.max(0, (fullBondCount | 0) - (currentBonds | 0));
    const ghostIndices = remainingIndices.filter((index) => !lonePairSet.has(index)).slice(0, bondCapacity);
    return {
      occupiedIndices,
      lonePairIndices,
      ghostIndices,
    };
  }

  function alignTemplateToTwoVectors(templateA, templateB, targetA, targetB) {
    const q1 = quatFromUnitVectors(templateA, targetA);
    const rotatedB = applyQuatToVec(templateB, q1);
    const axis = vecNormalize(targetA);
    const projRotated = vecProjectOntoPlane(rotatedB, axis);
    const projTarget = vecProjectOntoPlane(targetB, axis);
    if (vecLengthSq(projRotated) < EPSILON || vecLengthSq(projTarget) < EPSILON) return q1;
    const angle = signedAngleAroundAxis(projRotated, projTarget, axis);
    return quatMultiply(quatFromAxisAngle(axis, angle), q1);
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

  function alignTemplateToOccupied(template, occupiedDirs) {
    const normalizedTemplate = normalizeTemplate(template);
    const normalizedOccupied = (Array.isArray(occupiedDirs) ? occupiedDirs : []).map((dir) => vecNormalize(dir));
    if (!normalizedOccupied.length) {
      return { rotatedTemplate: normalizedTemplate.map((dir) => dir.slice()), assignment: [] };
    }
    let best = null;
    if (normalizedOccupied.length === 1) {
      for (let i = 0; i < normalizedTemplate.length; i += 1) {
        const q = quatFromUnitVectors(normalizedTemplate[i], normalizedOccupied[0]);
        const rotated = normalizedTemplate.map((dir) => vecNormalize(applyQuatToVec(dir, q)));
        const score = scoreTemplateAssignment(rotated, normalizedOccupied);
        if (!best || score.score < best.score) best = { score: score.score, rotatedTemplate: rotated, assignment: score.assignment };
      }
      return best;
    }
    const [refI, refJ] = chooseReferenceOccupiedPair(normalizedOccupied);
    const targetA = normalizedOccupied[refI];
    const targetB = normalizedOccupied[refJ];
    for (let i = 0; i < normalizedTemplate.length; i += 1) {
      for (let j = 0; j < normalizedTemplate.length; j += 1) {
        if (i === j) continue;
        const q = alignTemplateToTwoVectors(normalizedTemplate[i], normalizedTemplate[j], targetA, targetB);
        const rotated = normalizedTemplate.map((dir) => vecNormalize(applyQuatToVec(dir, q)));
        const score = scoreTemplateAssignment(rotated, normalizedOccupied);
        if (!best || score.score < best.score) best = { score: score.score, rotatedTemplate: rotated, assignment: score.assignment };
      }
    }
    return best || { rotatedTemplate: normalizedTemplate.map((dir) => dir.slice()), assignment: [] };
  }

  function buildVisibleBondList(vol) {
    const atoms = Array.isArray(vol && vol.atoms) ? vol.atoms : [];
    const bonds = Array.isArray(vol && vol.bonds) ? vol.bonds : [];
    const atomIds = new Map();
    atoms.forEach((atom, index) => atomIds.set(String((atom && atom.id) || index), index));
    const out = [];
    for (const bond of bonds) {
      if (!bond || typeof bond !== 'object') continue;
      if (String(bond.kind || 'normal') === 'blocked') continue;
      const a = typeof bond.a === 'string' ? atomIds.get(String(bond.a).trim()) : (bond.a | 0);
      const b = typeof bond.b === 'string' ? atomIds.get(String(bond.b).trim()) : (bond.b | 0);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= atoms.length || b >= atoms.length || a === b) continue;
      out.push({ a, b, order: Math.max(1, Math.min(4, Math.round(Number(bond.order) || 1))) });
    }
    return out;
  }

  function defaultNow() {
    if (global.performance && typeof global.performance.now === 'function') return global.performance.now();
    return Date.now();
  }

  function createEditHaloController(options = {}) {
    const hoverDelayMs = Number.isFinite(options.hoverDelayMs) ? Math.max(120, Number(options.hoverDelayMs)) : 300;
    const enableHoverActivation = options.enableHoverActivation !== false;
    const isEnabled = typeof options.isEnabled === 'function' ? options.isEnabled : (() => false);
    const isBlocked = typeof options.isBlocked === 'function' ? options.isBlocked : (() => false);
    const getSelection = typeof options.getSelection === 'function' ? options.getSelection : (() => []);
    const getActiveRecord = typeof options.getActiveRecord === 'function' ? options.getActiveRecord : (() => null);
    const pickAtomHit = typeof options.pickAtomHit === 'function' ? options.pickAtomHit : (() => null);
    const pickBondHit = typeof options.pickBondHit === 'function' ? options.pickBondHit : (() => null);
    const getAtomWorld = typeof options.getAtomWorld === 'function' ? options.getAtomWorld : (() => null);
    const projectWorldToClient = typeof options.projectWorldToClient === 'function' ? options.projectWorldToClient : (() => null);
    const getElementSymbol = typeof options.getElementSymbol === 'function' ? options.getElementSymbol : ((z) => `Z${z | 0}`);
    const getLoadedPayloadKind = typeof options.getLoadedPayloadKind === 'function' ? options.getLoadedPayloadKind : (() => 'atom');
    const getLoadedPayloadLabel = typeof options.getLoadedPayloadLabel === 'function' ? options.getLoadedPayloadLabel : (() => 'loaded item');
    const showAddTargets = typeof options.showAddTargets === 'function' ? options.showAddTargets : (() => true);
    const getAtomCoordinationGeometryId = typeof options.getAtomCoordinationGeometryId === 'function' ? options.getAtomCoordinationGeometryId : (() => '');
    const getGrowBondLength = typeof options.getGrowBondLength === 'function' ? options.getGrowBondLength : (() => 1.1);
    const nowProvider = typeof options.nowProvider === 'function' ? options.nowProvider : defaultNow;
    const onUiStateChanged = typeof options.onUiStateChanged === 'function' ? options.onUiStateChanged : (() => {});

    const state = {
      visible: false,
      source: '',
      atomIndex: -1,
      hoverCandidate: -1,
      hoverStartedAt: 0,
      hoverBondCenterReserved: false,
      lastPointer: null,
      descriptor: null,
      framesByRecord: new WeakMap(),
      uiState: {
        visible: false,
        atomIndex: -1,
        mode: '',
        hint: '',
        scope: '',
        anchorClient: null,
        ghosts: [],
        occupied: [],
        choices: [],
        activeZone: null,
        bondCenterReserved: false,
      },
    };

    function normalizePointerLike(e) {
      if (!e) return null;
      return Object.assign({}, e, {
        x: Number(e.clientX) || 0,
        y: Number(e.clientY) || 0,
        clientX: Number(e.clientX) || 0,
        clientY: Number(e.clientY) || 0,
      });
    }

    function sameClient(a, b) {
      if (!a || !b) return false;
      return Math.abs((a.x || 0) - (b.x || 0)) < 0.5 && Math.abs((a.y || 0) - (b.y || 0)) < 0.5;
    }

    function computeLocalEnvironment(vol, atomIndex) {
      const atoms = Array.isArray(vol && vol.atoms) ? vol.atoms : [];
      if (!atoms.length || atomIndex < 0 || atomIndex >= atoms.length) return null;
      const bonds = buildVisibleBondList(vol);
      const occupiedDirs = [];
      const neighborIndices = [];
      let bondOrderSum = 0;
      let maxBondOrder = 0;
      for (const bond of bonds) {
        if (bond.a !== atomIndex && bond.b !== atomIndex) continue;
        const other = bond.a === atomIndex ? bond.b : bond.a;
        if (!countsTowardAtomValence(atoms[atomIndex], atoms[other])) continue;
        const origin = getAtomWorld(vol, atomIndex);
        const neighbor = getAtomWorld(vol, other);
        if (!origin || !neighbor) continue;
        occupiedDirs.push(vecNormalize(vecSub(neighbor, origin)));
        neighborIndices.push(other);
        bondOrderSum += Math.max(1, Math.min(4, bond.order | 0));
        maxBondOrder = Math.max(maxBondOrder, Math.max(1, Math.min(4, bond.order | 0)));
      }
      return {
        occupiedDirs,
        neighborIndices,
        neighborCount: neighborIndices.length,
        bondOrderSum,
        maxBondOrder,
        visibleBonds: bonds,
      };
    }

    function getTemplate(geometryId) {
      const geometry = getCoordinationGeometry(geometryId) || getCoordinationGeometry('tetrahedral');
      const vertices = geometry && Array.isArray(geometry.vertices) ? geometry.vertices : [];
      return vertices.map((dir) => dir.slice());
    }

    function getAtomFrameKey(atom, atomIndex) {
      if (atom && atom.id != null && String(atom.id).trim()) return String(atom.id).trim();
      return `index:${atomIndex | 0}`;
    }

    function getRecordFrames(record) {
      if (!record || typeof record !== 'object') return null;
      let frames = state.framesByRecord.get(record);
      if (!frames) {
        frames = new Map();
        state.framesByRecord.set(record, frames);
      }
      return frames;
    }

    function resolveAlignedTemplateForAtom(record, atom, atomIndex, geometryKey, occupiedDirs) {
      const canonicalTemplate = getTemplate(geometryKey);
      const atomKey = getAtomFrameKey(atom, atomIndex);
      const frames = getRecordFrames(record);
      const cached = frames && atomKey ? frames.get(atomKey) : null;
      const template = cached
        && cached.geometryKey === geometryKey
        && Array.isArray(cached.rotatedTemplate)
        && cached.rotatedTemplate.length === canonicalTemplate.length
        ? cached.rotatedTemplate.map((dir) => dir.slice())
        : canonicalTemplate;
      const normalizedTemplate = normalizeTemplate(template);
      const cachedScore = scoreTemplateAssignment(normalizedTemplate, Array.isArray(occupiedDirs) ? occupiedDirs : []);
      const aligned = Number.isFinite(cachedScore.score) && cachedScore.score <= 1e-4
        ? { rotatedTemplate: normalizedTemplate, assignment: cachedScore.assignment }
        : (alignTemplateToOccupied(normalizedTemplate, occupiedDirs)
          || { rotatedTemplate: normalizedTemplate, assignment: [] });
      if (frames && atomKey) {
        frames.set(atomKey, {
          geometryKey,
          rotatedTemplate: Array.isArray(aligned.rotatedTemplate)
            ? aligned.rotatedTemplate.map((dir) => vecNormalize(dir))
            : normalizedTemplate,
        });
      }
      return aligned;
    }

    function buildCoordinationChoices(anchorClient, choices, activeGeometryId) {
      const items = Array.isArray(choices) ? choices : [];
      if (!anchorClient || !items.length) return [];
      const radius = items.length === 1 ? 86 : 92;
      const sectorAngle = (Math.PI * 2) / Math.max(1, items.length);
      const startAngle = -Math.PI / 2;
      return items.map((choice, index) => {
        const text = String((choice && choice.text) || '').trim();
        const angle = startAngle + sectorAngle * index + sectorAngle * 0.5;
        const width = clamp(text.length * 6.8 + 20, 82, 176);
        const height = 26;
        return {
          geometryId: String(choice && choice.geometryId || '').trim(),
          label: String(choice && choice.label || text || '').trim(),
          text,
          cn: Math.max(0, Number(choice && choice.cn) || 0),
          width,
          height,
          client: {
            x: (anchorClient.x || 0) + Math.cos(angle) * radius,
            y: (anchorClient.y || 0) + Math.sin(angle) * radius,
            visible: true,
          },
          active: String(choice && choice.geometryId || '') === String(activeGeometryId || ''),
        };
      });
    }

    function buildCoordinationDescriptor(record, vol, atomIndex, atom, env, anchorWorld) {
      const profile = getCoordinationProfile(atom.Z | 0);
      if (!profile) return null;
      const preferredGeometryId = String(getAtomCoordinationGeometryId(vol, atomIndex) || '').trim();
      const inference = inferAtomGeometry(vol, atomIndex, {
        getAtomWorld,
        preferredGeometryId,
      });
      if (!inference || !inference.geometryId) return null;
      const geometry = getCoordinationGeometry(inference.geometryId);
      if (!geometry || !Array.isArray(geometry.vertices) || !geometry.vertices.length) return null;
      const aligned = resolveAlignedTemplateForAtom(record, atom, atomIndex, geometry.id, env.occupiedDirs) || { rotatedTemplate: [], assignment: [] };
      const partition = partitionAlignedVertices(
        aligned.rotatedTemplate,
        aligned.assignment,
        inference.currentBonds,
        inference.fullBondCount,
        inference.lonePairs,
        geometry.id
      );
      const compatibleIds = new Set(Array.isArray(inference.compatibleGeometryIds) ? inference.compatibleGeometryIds : []);
      let choices = Array.isArray(profile.choices)
        ? profile.choices.filter((choice) => compatibleIds.has(String(choice && choice.geometryId || '')))
        : [];
      if (!choices.length) {
        choices = [{
          geometryId: geometry.id,
          label: geometry.label,
          text: `${geometry.label} (${geometry.cn})`,
          cn: geometry.cn,
        }];
      }
      const activeChoice = choices.find((choice) => String(choice.geometryId || '') === String(inference.geometryId || ''))
        || {
          geometryId: geometry.id,
          label: geometry.label,
          text: `${geometry.label} (${geometry.cn})`,
          cn: geometry.cn,
        };
      const growDistance = profile.isTransitionMetal
        ? Math.max(1.2, Number(getGrowBondLength(atom.Z | 0)) || 1.6)
        : Math.max(0.7, Number(getGrowBondLength(atom.Z | 0)) || 1.1);
      const addTargetsEnabled = !!showAddTargets();
      const hasOpenSites = partition.ghostIndices.length > 0;
      const ghosts = [];
      if (addTargetsEnabled) {
        for (const index of partition.ghostIndices) {
          const dir = vecNormalize(aligned.rotatedTemplate[index]);
          const world = vecAdd(anchorWorld, vecScale(dir, growDistance));
          const client = projectWorldToClient(world);
          if (!client || client.visible === false) continue;
          ghosts.push({ index, dir, world, client, recommended: ghosts.length === 0 });
        }
      }
      const occupied = env.occupiedDirs.map((dir, index) => {
        const world = vecAdd(anchorWorld, vecScale(vecNormalize(dir), growDistance * 0.85));
        const client = projectWorldToClient(world);
        return client && client.visible !== false ? { index, client } : null;
      }).filter(Boolean);
      const payloadKind = String(getLoadedPayloadKind() || '').trim().toLowerCase();
      const replaceTargets = [];
      if (addTargetsEnabled && (payloadKind === 'atom' || payloadKind === 'fragment') && (atom.Z | 0) !== 1) {
        const degreeByAtomIndex = new Map();
        for (const bond of Array.isArray(env.visibleBonds) ? env.visibleBonds : []) {
          if (!bond) continue;
          const a = bond.a | 0;
          const b = bond.b | 0;
          degreeByAtomIndex.set(a, (degreeByAtomIndex.get(a) || 0) + 1);
          degreeByAtomIndex.set(b, (degreeByAtomIndex.get(b) || 0) + 1);
        }
        for (const neighborIndex of Array.isArray(env.neighborIndices) ? env.neighborIndices : []) {
          const neighborAtom = Array.isArray(vol && vol.atoms) ? vol.atoms[neighborIndex | 0] : null;
          if (!neighborAtom || (neighborAtom.Z | 0) !== 1) continue;
          if ((degreeByAtomIndex.get(neighborIndex | 0) || 0) !== 1) continue;
          const world = getAtomWorld(vol, neighborIndex | 0);
          const client = projectWorldToClient(world);
          if (!world || !client || client.visible === false) continue;
          replaceTargets.push({
            atomIndex: neighborIndex | 0,
            world,
            client,
          });
        }
      }
      return {
        atomIndex,
        mode: profile.isTransitionMetal
          ? 'metal-coordination'
          : (hasOpenSites ? 'coordination-open' : 'coordination-saturated'),
        label: activeChoice.text,
        activeChoice,
        activeGeometryId: geometry.id,
        activeGeometryLabel: geometry.label,
        activeGeometryText: activeChoice.text,
        inference,
        addTargetsEnabled,
        ghosts,
        replaceTargets,
        occupied,
        growDistance,
        choices: buildCoordinationChoices(anchorWorld ? projectWorldToClient(anchorWorld) : null, choices, geometry.id),
      };
    }

    function buildDescriptor(atomIndex) {
      const record = getActiveRecord();
      const vol = record && record.vol;
      const atoms = Array.isArray(vol && vol.atoms) ? vol.atoms : [];
      if (atomIndex < 0 || atomIndex >= atoms.length) return null;
      const atom = atoms[atomIndex];
      const anchorWorld = getAtomWorld(vol, atomIndex);
      const anchorClient = anchorWorld ? projectWorldToClient(anchorWorld) : null;
      if (!anchorWorld || !anchorClient || anchorClient.visible === false) return null;
      const env = computeLocalEnvironment(vol, atomIndex);
      if (!env) return null;
      let descriptor = buildCoordinationDescriptor(record, vol, atomIndex, atom, env, anchorWorld);
      if (!descriptor) descriptor = { atomIndex, mode: 'atom-only', label: 'atom halo', ghosts: [], occupied: [], growDistance: 1.0 };
      descriptor.anchorWorld = anchorWorld;
      descriptor.anchorClient = anchorClient;
      descriptor.atomZ = atom.Z | 0;
      descriptor.choices = Array.isArray(descriptor.choices) ? descriptor.choices : buildCoordinationChoices(anchorClient, [], '');
      descriptor.env = env;
      return descriptor;
    }

    function getDescriptorCaptureRadius(descriptor) {
      if (!descriptor || !descriptor.anchorClient) return 0;
      return Math.max(
        40,
        ...((descriptor.choices || []).map((item) => {
          const dx = (item.client.x || 0) - (descriptor.anchorClient.x || 0);
          const dy = (item.client.y || 0) - (descriptor.anchorClient.y || 0);
          return Math.hypot(dx, dy) + Math.max(Number(item.width) || 0, Number(item.height) || 0) * 0.6;
        })),
        ...((descriptor.ghosts || []).map((ghost) => {
          const dx = (ghost.client.x || 0) - (descriptor.anchorClient.x || 0);
          const dy = (ghost.client.y || 0) - (descriptor.anchorClient.y || 0);
          return Math.hypot(dx, dy) + 18;
        })),
        ...((descriptor.replaceTargets || []).map((target) => {
          const dx = (target.client.x || 0) - (descriptor.anchorClient.x || 0);
          const dy = (target.client.y || 0) - (descriptor.anchorClient.y || 0);
          return Math.hypot(dx, dy) + 18;
        }))
      );
    }

    function polarFromPointer(anchorClient, pointer) {
      const dx = (pointer.x || 0) - (anchorClient.x || 0);
      const dy = (pointer.y || 0) - (anchorClient.y || 0);
      return { radius: Math.hypot(dx, dy), angle: Math.atan2(dy, dx), dx, dy };
    }

    function hitTestGhost(descriptor, pointer) {
      if (!descriptor || !pointer) return null;
      let best = null;
      for (const ghost of descriptor.ghosts || []) {
        const dx = (pointer.x || 0) - (ghost.client.x || 0);
        const dy = (pointer.y || 0) - (ghost.client.y || 0);
        const dist = Math.hypot(dx, dy);
        if (dist > 18) continue;
        if (!best || dist < best.dist) best = { ghost, dist };
      }
      return best ? best.ghost : null;
    }

    function hitTestReplaceTarget(descriptor, pointer) {
      if (!descriptor || !pointer) return null;
      let best = null;
      for (const target of descriptor.replaceTargets || []) {
        const dx = (pointer.x || 0) - (target.client.x || 0);
        const dy = (pointer.y || 0) - (target.client.y || 0);
        const dist = Math.hypot(dx, dy);
        if (dist > 18) continue;
        if (!best || dist < best.dist) best = { target, dist };
      }
      return best ? best.target : null;
    }

    function hitTestChoice(descriptor, pointer) {
      if (!descriptor || !pointer) return null;
      let best = null;
      for (const choice of descriptor.choices || []) {
        const halfWidth = Math.max(22, (Number(choice.width) || 0) * 0.5) + 6;
        const halfHeight = Math.max(12, (Number(choice.height) || 0) * 0.5) + 4;
        const dx = (pointer.x || 0) - (choice.client.x || 0);
        const dy = (pointer.y || 0) - (choice.client.y || 0);
        if (Math.abs(dx) > halfWidth || Math.abs(dy) > halfHeight) continue;
        const score = Math.abs(dx) + Math.abs(dy);
        if (!best || score < best.score) best = { choice, score };
      }
      return best ? best.choice : null;
    }

    function computeActiveZone(descriptor, pointer) {
      if (!descriptor || !pointer) return null;
      const replaceTarget = hitTestReplaceTarget(descriptor, pointer);
      if (replaceTarget) return { kind: 'replace', targetAtomIndex: replaceTarget.atomIndex, replaceTarget };
      const ghost = hitTestGhost(descriptor, pointer);
      if (ghost) return { kind: 'ghost', ghostIndex: ghost.index, ghost };
      const choice = hitTestChoice(descriptor, pointer);
      if (choice) return { kind: 'choice', geometryId: choice.geometryId, choice };
      return null;
    }

    function pointerWithinDescriptorOwnership(descriptor, pointer) {
      if (!descriptor || !descriptor.anchorClient || !pointer) return false;
      if (computeActiveZone(descriptor, pointer)) return true;
      const polar = polarFromPointer(descriptor.anchorClient, pointer);
      return polar.radius <= getDescriptorCaptureRadius(descriptor);
    }

    function computeReservedBondCenter(pointer) {
      if (!pointer || getSelection().length) return false;
      const bondHit = pickBondHit(pointer);
      return !!(bondHit && bondHit.section === 'center');
    }

    function buildUiState() {
      const descriptor = state.descriptor;
      const activeZone = descriptor && state.lastPointer ? computeActiveZone(descriptor, state.lastPointer) : null;
      const visible = !!(state.visible && descriptor);
      const payloadKind = String(getLoadedPayloadKind() || '').trim().toLowerCase();
      const payloadLabel = String(getLoadedPayloadLabel() || '').trim();
      const payloadText = payloadKind === 'fragment'
        ? `fragment ${payloadLabel || 'fragment'}`
        : (payloadKind === 'molecule'
          ? `molecule ${payloadLabel || 'molecule'}`
          : (payloadLabel || 'the loaded element'));
      const canShowAddTargets = payloadKind === 'atom' || payloadKind === 'fragment';
      let hint = '';
      let scope = '';
      if (visible && descriptor) {
        if (activeZone && activeZone.kind === 'choice') {
          hint = `Prefer ${activeZone.choice.text} for ${getElementSymbol(descriptor.atomZ)}`;
        } else if (activeZone && activeZone.kind === 'replace') {
          hint = `Click to replace H with ${payloadText}`;
        } else if (activeZone && activeZone.kind === 'ghost') {
          hint = `Click to place ${payloadText} in ${descriptor.activeGeometryText}`;
        } else if (descriptor.mode === 'metal-coordination') {
          hint = `Coordination halo: ${descriptor.activeGeometryText}`;
        } else if (!descriptor.addTargetsEnabled && canShowAddTargets) {
          hint = `Coordination halo: ${descriptor.activeGeometryText} • Click + to show build sites`;
        } else if ((descriptor.ghosts || []).length && (descriptor.replaceTargets || []).length) {
          hint = `Click a ghost to place ${payloadText} • Click a highlighted H to replace it`;
        } else if ((descriptor.replaceTargets || []).length) {
          hint = `Click a highlighted H to replace it with ${payloadText}`;
        } else if ((descriptor.ghosts || []).length) {
          hint = `Click a ghost to place ${payloadText} in ${descriptor.activeGeometryText}`;
        } else {
          hint = `No open sites in ${descriptor.activeGeometryText} • drag the atom body to move it`;
        }
        scope = descriptor.label;
      } else if (state.hoverBondCenterReserved) {
        hint = 'Bond midpoint: left click raises order • Right click lowers order';
        scope = 'Bond midpoint';
      }
      return {
        visible,
        atomIndex: visible && descriptor ? descriptor.atomIndex : -1,
        mode: visible && descriptor ? descriptor.mode : '',
        hint,
        scope,
        anchorClient: visible && descriptor ? descriptor.anchorClient : null,
        anchorWorld: visible && descriptor ? {
          x: descriptor.anchorWorld[0],
          y: descriptor.anchorWorld[1],
          z: descriptor.anchorWorld[2],
        } : null,
        atomZ: visible && descriptor ? (descriptor.atomZ | 0) : 0,
        captureRadius: visible && descriptor ? getDescriptorCaptureRadius(descriptor) : 0,
        ghosts: visible && descriptor ? (descriptor.ghosts || []).map((ghost) => ({
          index: ghost.index,
          x: ghost.client.x,
          y: ghost.client.y,
          world: { x: ghost.world[0], y: ghost.world[1], z: ghost.world[2] },
          recommended: !!ghost.recommended,
        })) : [],
        replaceTargets: visible && descriptor ? (descriptor.replaceTargets || []).map((target) => ({
          atomIndex: target.atomIndex | 0,
          x: target.client.x,
          y: target.client.y,
          world: { x: target.world[0], y: target.world[1], z: target.world[2] },
        })) : [],
        occupied: visible && descriptor ? (descriptor.occupied || []).map((item) => ({ x: item.client.x, y: item.client.y })) : [],
        choices: visible && descriptor ? (descriptor.choices || []).map((item) => ({
          geometryId: item.geometryId,
          label: item.label,
          text: item.text,
          cn: item.cn | 0,
          x: item.client.x,
          y: item.client.y,
          width: Number(item.width) || 0,
          height: Number(item.height) || 0,
          active: !!item.active,
        })) : [],
        activeZone,
        bondCenterReserved: !!state.hoverBondCenterReserved,
      };
    }

    function updateUi() {
      state.uiState = buildUiState();
      onUiStateChanged(state.uiState);
    }

    function clear(options = {}) {
      const quiet = !!options.quiet;
      state.visible = false;
      state.source = '';
      state.atomIndex = -1;
      state.hoverCandidate = -1;
      state.hoverStartedAt = 0;
      state.hoverBondCenterReserved = false;
      state.descriptor = null;
      if (!quiet) updateUi();
    }

    function refresh() {
      const enabled = isEnabled() && !isBlocked();
      if (!enabled) {
        if (state.visible || state.hoverBondCenterReserved || state.atomIndex >= 0) clear();
        return state.uiState;
      }
      const selection = Array.isArray(getSelection()) ? getSelection() : [];
      const now = nowProvider();
      let nextAtomIndex = -1;
      let nextSource = '';
      if (selection.length === 1) {
        nextAtomIndex = selection[0] | 0;
        nextSource = 'selection';
      } else if (enableHoverActivation && selection.length === 0 && state.hoverCandidate >= 0 && (now - state.hoverStartedAt) >= hoverDelayMs) {
        nextAtomIndex = state.hoverCandidate | 0;
        nextSource = 'hover';
      }
      state.hoverBondCenterReserved = selection.length === 0 && computeReservedBondCenter(state.lastPointer);
      if (nextAtomIndex < 0) {
        const wasVisible = state.visible || !!state.descriptor;
        state.visible = false;
        state.source = '';
        state.atomIndex = -1;
        state.descriptor = null;
        if (wasVisible || state.hoverBondCenterReserved || !state.uiState || state.uiState.visible) updateUi();
        return state.uiState;
      }
      const nextDescriptor = buildDescriptor(nextAtomIndex);
      const shouldUpdate = !state.visible
        || state.atomIndex !== nextAtomIndex
        || state.source !== nextSource
        || !state.descriptor
        || !nextDescriptor
        || !sameClient(state.descriptor.anchorClient, nextDescriptor.anchorClient);
      state.visible = !!nextDescriptor;
      state.source = nextSource;
      state.atomIndex = nextDescriptor ? nextAtomIndex : -1;
      state.descriptor = nextDescriptor;
      if (shouldUpdate) updateUi();
      else {
        const nextUi = buildUiState();
        const uiChanged = JSON.stringify(nextUi) !== JSON.stringify(state.uiState);
        if (uiChanged) {
          state.uiState = nextUi;
          onUiStateChanged(state.uiState);
        }
      }
      return state.uiState;
    }

    function handlePointerMove(e) {
      state.lastPointer = normalizePointerLike(e);
      if (!isEnabled() || isBlocked()) {
        clear();
        return false;
      }
      const selection = Array.isArray(getSelection()) ? getSelection() : [];
      if (enableHoverActivation && !selection.length) {
        let atomIndex = -1;
        if (state.visible && state.source === 'hover' && state.descriptor && pointerWithinDescriptorOwnership(state.descriptor, state.lastPointer)) {
          atomIndex = state.descriptor.atomIndex | 0;
        } else {
          const hit = pickAtomHit(e);
          atomIndex = hit && hit.object && hit.object.userData ? (hit.object.userData.index | 0) : -1;
        }
        if (atomIndex !== state.hoverCandidate) {
          state.hoverCandidate = atomIndex;
          state.hoverStartedAt = nowProvider();
        } else if (atomIndex < 0) {
          state.hoverStartedAt = 0;
        }
      } else {
        state.hoverCandidate = -1;
        state.hoverStartedAt = 0;
      }
      refresh();
      return false;
    }

    function handlePointerDown(e) {
      if (!isEnabled() || isBlocked() || !e || e.button !== 0) return null;
      state.lastPointer = normalizePointerLike(e);
      refresh();
      if (!(state.visible && state.descriptor)) return null;
      const zone = computeActiveZone(state.descriptor, state.lastPointer);
      if (!zone) return null;
      if (zone.kind === 'choice') {
        return {
          type: 'set-coordination-choice',
          atomIndex: state.descriptor.atomIndex | 0,
          geometryId: String(zone.geometryId || '').trim(),
        };
      }
      if (zone.kind === 'ghost') {
        return {
          type: 'start-grow-drag',
          atomIndex: state.descriptor.atomIndex,
          worldPosition: zone.ghost.world.slice(),
          ghostIndex: zone.ghost.index,
        };
      }
      if (zone.kind === 'replace') {
        return {
          type: 'replace-target',
          atomIndex: state.descriptor.atomIndex,
          targetAtomIndex: zone.targetAtomIndex | 0,
          worldPosition: zone.replaceTarget && Array.isArray(zone.replaceTarget.world) ? zone.replaceTarget.world.slice() : null,
        };
      }
      return null;
    }

    function handlePointerUp(e) {
      state.lastPointer = e ? normalizePointerLike(e) : state.lastPointer;
      refresh();
      return false;
    }

    function handlePointerCancel() {
      state.lastPointer = null;
      clear();
      return true;
    }

    function getUiState() {
      return state.uiState;
    }

    function getCoordinationCueState(atomIndex) {
      const descriptor = buildDescriptor(atomIndex | 0);
      if (!descriptor || !Array.isArray(descriptor.choices) || !descriptor.choices.length) return null;
      return {
        atomIndex: descriptor.atomIndex | 0,
        atomZ: descriptor.atomZ | 0,
        activeGeometryId: String(descriptor.activeGeometryId || ''),
        choices: descriptor.choices.map((choice) => ({
          geometryId: String(choice && choice.geometryId || ''),
          label: String(choice && (choice.text || choice.label) || ''),
          cn: Number(choice && choice.cn) || 0,
          active: !!(choice && choice.active),
        })),
      };
    }

    function getHighlightIndices() {
      return state.visible && state.atomIndex >= 0 ? [state.atomIndex] : [];
    }

    function isActive() {
      return !!(state.visible && state.descriptor);
    }

    function resolveSelectedAtomDragAction(atomIndex, e) {
      if (!state.visible || !state.descriptor || (state.descriptor.atomIndex | 0) !== (atomIndex | 0)) return null;
      const pointer = e ? { x: Number(e.clientX) || 0, y: Number(e.clientY) || 0 } : state.lastPointer;
      const ghost = hitTestGhost(state.descriptor, pointer);
      if (!ghost) return null;
      return {
        type: 'grow',
        atomIndex: state.descriptor.atomIndex,
        worldPosition: ghost.world.slice(),
        ghostIndex: ghost.index,
      };
    }

    updateUi();

    return Object.freeze({
      refresh,
      clear,
      handlePointerMove,
      handlePointerDown,
      handlePointerUp,
      handlePointerCancel,
      getUiState,
      getCoordinationCueState,
      getHighlightIndices,
      isActive,
      resolveSelectedAtomDragAction,
    });
  }

  global.VibeMolEditHalo = Object.freeze({
    createEditHaloController,
  });
})(window);
