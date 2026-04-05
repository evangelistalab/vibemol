(function (global) {
  'use strict';

  const EPSILON = 1e-8;
  const DEG120 = 0.8660254037844386;
  const SQRT2_INV = 0.7071067811865476;

  const GeometryId = Object.freeze({
    TERMINAL: 'terminal',
    LINEAR: 'linear',
    TRIGONAL_PLANAR: 'trigonalPlanar',
    TETRAHEDRAL: 'tetrahedral',
    SQUARE_PLANAR: 'squarePlanar',
    TRIGONAL_BIPYRAMIDAL: 'trigonalBipyramidal',
    SQUARE_PYRAMIDAL: 'squarePyramidal',
    OCTAHEDRAL: 'octahedral',
    TRIGONAL_PRISMATIC: 'trigonalPrismatic',
    PENTAGONAL_BIPYRAMIDAL: 'pentagonalBipyramidal',
    SQUARE_ANTIPRISMATIC: 'squareAntiprismatic',
  });

  function normalize(vec) {
    const x = Number(vec && vec[0]) || 0;
    const y = Number(vec && vec[1]) || 0;
    const z = Number(vec && vec[2]) || 0;
    const len = Math.hypot(x, y, z);
    if (!(len > EPSILON)) return [1, 0, 0];
    return [x / len, y / len, z / len];
  }

  function buildPlanarRing(count, phase = 0) {
    const out = [];
    const n = Math.max(1, count | 0);
    for (let i = 0; i < n; i += 1) {
      const angle = phase + (Math.PI * 2 * i) / n;
      out.push([Math.cos(angle), Math.sin(angle), 0]);
    }
    return out;
  }

  function geometryEntry(id, label, cn, vertices, shortLabel) {
    return Object.freeze({
      id,
      label,
      shortLabel: shortLabel || label,
      cn: cn | 0,
      vertices: Object.freeze((Array.isArray(vertices) ? vertices : []).map((dir) => Object.freeze(normalize(dir)))),
    });
  }

  const GEOMETRY_CATALOG = Object.freeze({
    [GeometryId.TERMINAL]: geometryEntry(GeometryId.TERMINAL, 'Terminal', 1, [[1, 0, 0]], 'Terminal'),
    [GeometryId.LINEAR]: geometryEntry(GeometryId.LINEAR, 'Linear', 2, [[1, 0, 0], [-1, 0, 0]], 'Linear'),
    [GeometryId.TRIGONAL_PLANAR]: geometryEntry(GeometryId.TRIGONAL_PLANAR, 'Trigonal planar', 3, [
      [1, 0, 0],
      [-0.5, DEG120, 0],
      [-0.5, -DEG120, 0],
    ], 'Trigonal planar'),
    [GeometryId.TETRAHEDRAL]: geometryEntry(GeometryId.TETRAHEDRAL, 'Tetrahedral', 4, [
      [0.5773502691896258, 0.5773502691896258, 0.5773502691896258],
      [0.5773502691896258, -0.5773502691896258, -0.5773502691896258],
      [-0.5773502691896258, 0.5773502691896258, -0.5773502691896258],
      [-0.5773502691896258, -0.5773502691896258, 0.5773502691896258],
    ], 'Tetrahedral'),
    [GeometryId.SQUARE_PLANAR]: geometryEntry(GeometryId.SQUARE_PLANAR, 'Square planar', 4, [
      [1, 0, 0],
      [0, 1, 0],
      [-1, 0, 0],
      [0, -1, 0],
    ], 'Square planar'),
    [GeometryId.TRIGONAL_BIPYRAMIDAL]: geometryEntry(GeometryId.TRIGONAL_BIPYRAMIDAL, 'Trigonal bipyramidal', 5, [
      ...buildPlanarRing(3),
      [0, 0, 1],
      [0, 0, -1],
    ], 'Trigonal bipyramidal'),
    [GeometryId.SQUARE_PYRAMIDAL]: geometryEntry(GeometryId.SQUARE_PYRAMIDAL, 'Square pyramidal', 5, [
      ...buildPlanarRing(4),
      [0, 0, 1],
    ], 'Square pyramidal'),
    [GeometryId.OCTAHEDRAL]: geometryEntry(GeometryId.OCTAHEDRAL, 'Octahedral', 6, [
      [1, 0, 0], [-1, 0, 0],
      [0, 1, 0], [0, -1, 0],
      [0, 0, 1], [0, 0, -1],
    ], 'Octahedral'),
    [GeometryId.TRIGONAL_PRISMATIC]: geometryEntry(GeometryId.TRIGONAL_PRISMATIC, 'Trigonal prismatic', 6, [
      normalize([1, 0, 1]),
      normalize([-0.5, DEG120, 1]),
      normalize([-0.5, -DEG120, 1]),
      normalize([1, 0, -1]),
      normalize([-0.5, DEG120, -1]),
      normalize([-0.5, -DEG120, -1]),
    ], 'Trigonal prismatic'),
    [GeometryId.PENTAGONAL_BIPYRAMIDAL]: geometryEntry(GeometryId.PENTAGONAL_BIPYRAMIDAL, 'Pentagonal bipyramidal', 7, [
      ...buildPlanarRing(5),
      [0, 0, 1],
      [0, 0, -1],
    ], 'Pentagonal bipyramidal'),
    [GeometryId.SQUARE_ANTIPRISMATIC]: geometryEntry(GeometryId.SQUARE_ANTIPRISMATIC, 'Square antiprismatic', 8, [
      normalize([1, 0, 1]),
      normalize([0, 1, 1]),
      normalize([-1, 0, 1]),
      normalize([0, -1, 1]),
      normalize([SQRT2_INV, SQRT2_INV, -1]),
      normalize([-SQRT2_INV, SQRT2_INV, -1]),
      normalize([-SQRT2_INV, -SQRT2_INV, -1]),
      normalize([SQRT2_INV, -SQRT2_INV, -1]),
    ], 'Square antiprismatic'),
  });

  const MAIN_GROUP_PROFILE_BY_Z = new Map();
  const METAL_PROFILE_BY_SYMBOL = new Map();

  function registerMainGroupProfile(zs, geometryIds, options = {}) {
    const values = Array.isArray(zs) ? zs : [zs];
    const ids = Array.isArray(geometryIds) ? geometryIds.slice() : [];
    for (const z of values) {
      MAIN_GROUP_PROFILE_BY_Z.set(z | 0, Object.freeze({
        kind: 'main-group',
        geometryIds: Object.freeze(ids.slice()),
        defaultGeometryId: options.defaultGeometryId || ids[ids.length - 1] || ids[0] || GeometryId.TERMINAL,
      }));
    }
  }

  function registerMetalProfile(symbols, geometryIds, options = {}) {
    const values = Array.isArray(symbols) ? symbols : [symbols];
    const ids = Array.isArray(geometryIds) ? geometryIds.slice() : [];
    for (const symbol of values) {
      METAL_PROFILE_BY_SYMBOL.set(String(symbol || '').trim(), Object.freeze({
        kind: 'metal',
        geometryIds: Object.freeze(ids.slice()),
        squarePlanarPreferred: !!options.squarePlanarPreferred,
        linearPreferred: !!options.linearPreferred,
        defaultGeometryId: options.defaultGeometryId || ids[0] || GeometryId.OCTAHEDRAL,
      }));
    }
  }

  registerMainGroupProfile([1], [GeometryId.TERMINAL], { defaultGeometryId: GeometryId.TERMINAL });
  registerMainGroupProfile([5, 13, 31, 49], [GeometryId.TRIGONAL_PLANAR, GeometryId.TETRAHEDRAL], { defaultGeometryId: GeometryId.TRIGONAL_PLANAR });
  registerMainGroupProfile([6, 14, 32, 50], [GeometryId.LINEAR, GeometryId.TRIGONAL_PLANAR, GeometryId.TETRAHEDRAL], { defaultGeometryId: GeometryId.TETRAHEDRAL });
  registerMainGroupProfile([7], [GeometryId.LINEAR, GeometryId.TRIGONAL_PLANAR, GeometryId.TETRAHEDRAL], { defaultGeometryId: GeometryId.TETRAHEDRAL });
  registerMainGroupProfile([8], [GeometryId.LINEAR, GeometryId.TRIGONAL_PLANAR, GeometryId.TETRAHEDRAL], { defaultGeometryId: GeometryId.TETRAHEDRAL });
  registerMainGroupProfile([9], [GeometryId.TERMINAL], { defaultGeometryId: GeometryId.TERMINAL });
  registerMainGroupProfile([15, 33, 51, 83], [GeometryId.TRIGONAL_PLANAR, GeometryId.TETRAHEDRAL, GeometryId.TRIGONAL_BIPYRAMIDAL, GeometryId.OCTAHEDRAL], { defaultGeometryId: GeometryId.TETRAHEDRAL });
  registerMainGroupProfile([16, 34, 52], [GeometryId.LINEAR, GeometryId.TRIGONAL_PLANAR, GeometryId.TETRAHEDRAL, GeometryId.TRIGONAL_BIPYRAMIDAL, GeometryId.OCTAHEDRAL], { defaultGeometryId: GeometryId.TETRAHEDRAL });
  registerMainGroupProfile([17, 35, 53], [GeometryId.LINEAR, GeometryId.TRIGONAL_BIPYRAMIDAL, GeometryId.OCTAHEDRAL], { defaultGeometryId: GeometryId.LINEAR });

  registerMetalProfile(['Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Zn', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Cd', 'Hf', 'Ta', 'W', 'Re', 'Os'], [
    GeometryId.TETRAHEDRAL,
    GeometryId.TRIGONAL_BIPYRAMIDAL,
    GeometryId.SQUARE_PYRAMIDAL,
    GeometryId.OCTAHEDRAL,
    GeometryId.TRIGONAL_PRISMATIC,
    GeometryId.PENTAGONAL_BIPYRAMIDAL,
    GeometryId.SQUARE_ANTIPRISMATIC,
  ], { defaultGeometryId: GeometryId.OCTAHEDRAL });
  registerMetalProfile(['Ni', 'Pd', 'Pt', 'Rh', 'Ir'], [
    GeometryId.SQUARE_PLANAR,
    GeometryId.TETRAHEDRAL,
    GeometryId.SQUARE_PYRAMIDAL,
    GeometryId.OCTAHEDRAL,
    GeometryId.TRIGONAL_PRISMATIC,
  ], { defaultGeometryId: GeometryId.SQUARE_PLANAR, squarePlanarPreferred: true });
  registerMetalProfile(['Cu', 'Ag', 'Au', 'Hg'], [
    GeometryId.LINEAR,
    GeometryId.TETRAHEDRAL,
    GeometryId.SQUARE_PLANAR,
    GeometryId.SQUARE_PYRAMIDAL,
    GeometryId.OCTAHEDRAL,
  ], { defaultGeometryId: GeometryId.LINEAR, linearPreferred: true });
  registerMetalProfile(['La', 'Ce', 'Nd', 'Gd', 'Lu'], [
    GeometryId.OCTAHEDRAL,
    GeometryId.PENTAGONAL_BIPYRAMIDAL,
    GeometryId.SQUARE_ANTIPRISMATIC,
  ], { defaultGeometryId: GeometryId.SQUARE_ANTIPRISMATIC });

  function getElementSymbol(z) {
    const table = global.ATOM_Z_TO_DATA || null;
    const info = table && table[z | 0];
    return info && info.symbol ? String(info.symbol) : `Z${z | 0}`;
  }

  function isTransitionMetalAtomicNumber(z) {
    const n = z | 0;
    return (n >= 21 && n <= 30) || (n >= 39 && n <= 48) || (n >= 72 && n <= 80) || (n >= 104 && n <= 112);
  }

  function isLanthanideOrActinideAtomicNumber(z) {
    const n = z | 0;
    return (n >= 57 && n <= 71) || (n >= 89 && n <= 103);
  }

  function getGeometry(id) {
    return GEOMETRY_CATALOG[String(id || '')] || null;
  }

  function listGeometryChoices(geometryIds) {
    const out = [];
    for (const geometryId of Array.isArray(geometryIds) ? geometryIds : []) {
      const geometry = getGeometry(geometryId);
      if (!geometry) continue;
      out.push(Object.freeze({
        geometryId: geometry.id,
        label: geometry.label,
        text: `${geometry.label} (${geometry.cn})`,
        cn: geometry.cn,
      }));
    }
    return out;
  }

  function getCoordinationProfile(z) {
    const atomicNumber = z | 0;
    const symbol = getElementSymbol(atomicNumber);
    const rawProfile = METAL_PROFILE_BY_SYMBOL.get(symbol)
      || MAIN_GROUP_PROFILE_BY_Z.get(atomicNumber)
      || (isTransitionMetalAtomicNumber(atomicNumber) || isLanthanideOrActinideAtomicNumber(atomicNumber)
        ? Object.freeze({
          kind: 'metal',
          geometryIds: Object.freeze([
            GeometryId.TETRAHEDRAL,
            GeometryId.TRIGONAL_BIPYRAMIDAL,
            GeometryId.SQUARE_PYRAMIDAL,
            GeometryId.OCTAHEDRAL,
          ]),
          defaultGeometryId: GeometryId.OCTAHEDRAL,
        })
        : null);
    if (!rawProfile) return null;
    const choices = listGeometryChoices(rawProfile.geometryIds);
    return Object.freeze({
      z: atomicNumber,
      symbol,
      isTransitionMetal: rawProfile.kind === 'metal',
      defaultGeometryId: rawProfile.defaultGeometryId || (choices[0] && choices[0].geometryId) || '',
      suggestedPerceptionTolerance: rawProfile.kind === 'metal' ? 1.3 : 1.15,
      choices,
    });
  }

  function isCoordinationChoiceCompatible(geometryId, env) {
    const geometry = getGeometry(geometryId);
    if (!geometry) return false;
    const neighborCount = Math.max(0, Number(env && env.neighborCount) || 0);
    return neighborCount <= geometry.cn;
  }

  function chooseNearestByCn(choices, targetCn) {
    let best = null;
    let bestDelta = Infinity;
    for (const choice of Array.isArray(choices) ? choices : []) {
      const cn = choice && Number(choice.cn);
      if (!(cn >= 0)) continue;
      const delta = Math.abs(cn - targetCn);
      if (delta < bestDelta) {
        best = choice;
        bestDelta = delta;
      }
    }
    return best;
  }

  function findChoice(choices, geometryId) {
    const target = String(geometryId || '');
    return (Array.isArray(choices) ? choices : []).find((choice) => String(choice && choice.geometryId || '') === target) || null;
  }

  function resolveMainGroupChoice(profile, env) {
    const choices = profile && Array.isArray(profile.choices) ? profile.choices : [];
    const neighborCount = Math.max(0, Number(env && env.neighborCount) || 0);
    const bondOrderSum = Math.max(0, Number(env && env.bondOrderSum) || 0);
    const maxBondOrder = Math.max(1, Number(env && env.maxBondOrder) || 1);
    const has = (id) => !!findChoice(choices, id);
    if (neighborCount >= 6 && has(GeometryId.OCTAHEDRAL)) return findChoice(choices, GeometryId.OCTAHEDRAL);
    if (neighborCount >= 5 && has(GeometryId.TRIGONAL_BIPYRAMIDAL)) return findChoice(choices, GeometryId.TRIGONAL_BIPYRAMIDAL);
    if (neighborCount >= 4) {
      if (has(GeometryId.TETRAHEDRAL)) return findChoice(choices, GeometryId.TETRAHEDRAL);
      if (has(GeometryId.SQUARE_PLANAR)) return findChoice(choices, GeometryId.SQUARE_PLANAR);
    }
    if (neighborCount >= 3 && has(GeometryId.TRIGONAL_PLANAR)) return findChoice(choices, GeometryId.TRIGONAL_PLANAR);
    if (neighborCount === 2) {
      if (has(GeometryId.LINEAR) && (maxBondOrder >= 3 || bondOrderSum >= 4)) return findChoice(choices, GeometryId.LINEAR);
      if (has(GeometryId.TRIGONAL_PLANAR) && maxBondOrder >= 2) return findChoice(choices, GeometryId.TRIGONAL_PLANAR);
      if (has(GeometryId.LINEAR)) return findChoice(choices, GeometryId.LINEAR);
    }
    if (choices.length === 1) return choices[0];
    if (maxBondOrder >= 3 && has(GeometryId.LINEAR)) return findChoice(choices, GeometryId.LINEAR);
    if (maxBondOrder >= 2 && has(GeometryId.TRIGONAL_PLANAR)) return findChoice(choices, GeometryId.TRIGONAL_PLANAR);
    if (bondOrderSum >= 5 && has(GeometryId.OCTAHEDRAL)) return findChoice(choices, GeometryId.OCTAHEDRAL);
    if (bondOrderSum >= 4 && has(GeometryId.TRIGONAL_BIPYRAMIDAL)) return findChoice(choices, GeometryId.TRIGONAL_BIPYRAMIDAL);
    if (has(GeometryId.TETRAHEDRAL)) return findChoice(choices, GeometryId.TETRAHEDRAL);
    if (has(GeometryId.TRIGONAL_PLANAR)) return findChoice(choices, GeometryId.TRIGONAL_PLANAR);
    if (has(GeometryId.LINEAR)) return findChoice(choices, GeometryId.LINEAR);
    return choices[0] || null;
  }

  function resolveMetalChoice(profile, env) {
    const choices = profile && Array.isArray(profile.choices) ? profile.choices : [];
    const neighborCount = Math.max(0, Number(env && env.neighborCount) || 0);
    if (neighborCount >= 8) return findChoice(choices, GeometryId.SQUARE_ANTIPRISMATIC) || chooseNearestByCn(choices, neighborCount);
    if (neighborCount >= 7) return findChoice(choices, GeometryId.PENTAGONAL_BIPYRAMIDAL) || chooseNearestByCn(choices, neighborCount);
    if (neighborCount >= 6) return findChoice(choices, GeometryId.OCTAHEDRAL) || findChoice(choices, GeometryId.TRIGONAL_PRISMATIC) || chooseNearestByCn(choices, neighborCount);
    if (neighborCount >= 5) return findChoice(choices, GeometryId.SQUARE_PYRAMIDAL) || findChoice(choices, GeometryId.TRIGONAL_BIPYRAMIDAL) || chooseNearestByCn(choices, neighborCount);
    if (neighborCount >= 4) return findChoice(choices, profile.defaultGeometryId) || findChoice(choices, GeometryId.SQUARE_PLANAR) || findChoice(choices, GeometryId.TETRAHEDRAL) || chooseNearestByCn(choices, neighborCount);
    if (neighborCount >= 2) return findChoice(choices, GeometryId.LINEAR) || findChoice(choices, profile.defaultGeometryId) || chooseNearestByCn(choices, neighborCount);
    return findChoice(choices, profile.defaultGeometryId) || choices[0] || null;
  }

  function resolveAutoCoordinationChoice(z, env) {
    const profile = getCoordinationProfile(z);
    if (!profile) return null;
    return profile.isTransitionMetal ? resolveMetalChoice(profile, env) : resolveMainGroupChoice(profile, env);
  }

  function listHaloCoordinationChoices(z, env) {
    const profile = getCoordinationProfile(z);
    if (!profile) return [];
    const neighborCount = Math.max(0, Number(env && env.neighborCount) || 0);
    const filtered = profile.choices.filter((choice) => (choice.cn | 0) >= neighborCount);
    return filtered.length ? filtered : profile.choices.slice();
  }

  global.VibeMolCoordination = Object.freeze({
    GeometryId,
    getGeometry,
    getCoordinationProfile,
    resolveAutoCoordinationChoice,
    listHaloCoordinationChoices,
    isCoordinationChoiceCompatible,
  });
})(typeof window !== 'undefined' ? window : globalThis);
