(function (global) {
  'use strict';

  const uff = global.VibeMolUFF || {};
  const structureCore = global.VibeMolStructureCore || {};
  const createUFFSystem = typeof uff.createUFFSystem === 'function' ? uff.createUFFSystem : null;
  const createLocalOptimizationContext = typeof uff.createLocalOptimizationContext === 'function' ? uff.createLocalOptimizationContext : null;
  const localEnergy = typeof uff.localEnergy === 'function' ? uff.localEnergy : null;
  const localGradient = typeof uff.localGradient === 'function' ? uff.localGradient : null;
  const totalEnergy = typeof uff.totalEnergy === 'function' ? uff.totalEnergy : null;
  const minimize = typeof uff.minimize === 'function' ? uff.minimize : null;
  const assignAtomType = typeof uff.assignAtomType === 'function' ? uff.assignAtomType : null;
  const cloneBondSnapshotCore = typeof structureCore.cloneBondSnapshot === 'function' ? structureCore.cloneBondSnapshot : null;
  const ensureAtomIdCore = typeof structureCore.ensureAtomId === 'function' ? structureCore.ensureAtomId : ((atom) => String(atom && atom.id || ''));

  function normalizeIndexList(indices, length) {
    const result = [];
    const seen = new Set();
    for (const raw of Array.isArray(indices) ? indices : []) {
      const idx = raw | 0;
      if (idx < 0 || idx >= length || seen.has(idx)) continue;
      seen.add(idx);
      result.push(idx);
    }
    result.sort((a, b) => a - b);
    return result;
  }

  function normalizeBondOrder(order) {
    const n = Math.round(Number(order) || 1);
    return Math.max(1, Math.min(4, n));
  }

  function normalizePoint3(pointLike) {
    if (Array.isArray(pointLike)) {
      return {
        x: Number(pointLike[0]) || 0,
        y: Number(pointLike[1]) || 0,
        z: Number(pointLike[2]) || 0,
      };
    }
    return {
      x: Number(pointLike && pointLike.x) || 0,
      y: Number(pointLike && pointLike.y) || 0,
      z: Number(pointLike && pointLike.z) || 0,
    };
  }

  function defaultAtomUnitsToAng(_vol, atom) {
    return normalizePoint3(atom);
  }

  function defaultWorldToAtomUnits(_vol, pointLike) {
    const point = normalizePoint3(pointLike);
    return [point.x, point.y, point.z];
  }

  function defaultGetElementSymbol(z) {
    const table = global.ATOM_Z_TO_DATA || {};
    const entry = table && table[z];
    return String(entry && entry.symbol || '').trim();
  }

  function snapshotVolumeBonds(vol, cloneBondSnapshotFn) {
    if (typeof cloneBondSnapshotFn === 'function') return cloneBondSnapshotFn(vol) || [];
    if (!vol || !Array.isArray(vol.bonds)) return [];
    return vol.bonds.map((bond) => ({
      id: String(bond && bond.id || ''),
      a: String(bond && bond.a || ''),
      b: String(bond && bond.b || ''),
      order: normalizeBondOrder(bond && bond.order),
      kind: String(bond && bond.kind || 'normal'),
      origin: String(bond && bond.origin || 'explicit'),
    }));
  }

  function computeCentroidFromXyz(xyz, atomCount) {
    if (!(xyz instanceof Float64Array) || !(atomCount > 0)) return { x: 0, y: 0, z: 0 };
    let x = 0;
    let y = 0;
    let z = 0;
    for (let atomIndex = 0; atomIndex < atomCount; atomIndex += 1) {
      const base = 3 * atomIndex;
      x += xyz[base];
      y += xyz[base + 1];
      z += xyz[base + 2];
    }
    return {
      x: x / atomCount,
      y: y / atomCount,
      z: z / atomCount,
    };
  }

  function createLocalUffContextFromVolume(vol, seedAtomIndices, options = {}) {
    if (!createUFFSystem || !createLocalOptimizationContext || !assignAtomType) {
      throw new Error('VibeMolUFFAdapter requires VibeMolUFF to be loaded first.');
    }
    if (!vol || !Array.isArray(vol.atoms) || !vol.atoms.length) return null;

    const atomUnitsToAng = typeof options.atomUnitsToAng === 'function' ? options.atomUnitsToAng : defaultAtomUnitsToAng;
    const getElementSymbol = typeof options.getElementSymbol === 'function' ? options.getElementSymbol : defaultGetElementSymbol;
    const cloneBondSnapshotFn = typeof options.cloneBondSnapshot === 'function' ? options.cloneBondSnapshot : cloneBondSnapshotCore;
    const ensureAtomId = typeof options.ensureAtomId === 'function' ? options.ensureAtomId : ensureAtomIdCore;
    if (options.ensureSchema === true && typeof options.ensureVolumeSchema === 'function') {
      options.ensureVolumeSchema(vol, { inferMissingBonds: false });
    }

    const includePerceivedBonds = options.includePerceivedBonds !== false;
    const includeHydrogens = options.includeHydrogens !== false;
    const atoms = vol.atoms;
    const supportedGlobalAtomIndices = [];
    const unsupportedGlobalAtomIndices = [];
    const globalToSystemAtomIndex = new Map();
    const systemAtomToId = [];
    const elements = [];
    const coords = [];

    for (let atomIndex = 0; atomIndex < atoms.length; atomIndex += 1) {
      const atom = atoms[atomIndex];
      if (!atom) {
        unsupportedGlobalAtomIndices.push(atomIndex);
        continue;
      }
      const z = Number(atom.Z) | 0;
      if (!includeHydrogens && z === 1) continue;
      const symbol = String(getElementSymbol(z) || '').trim();
      if (!symbol || !assignAtomType(symbol, 0)) {
        unsupportedGlobalAtomIndices.push(atomIndex);
        continue;
      }
      const point = normalizePoint3(atomUnitsToAng(vol, atom));
      supportedGlobalAtomIndices.push(atomIndex);
      globalToSystemAtomIndex.set(atomIndex, supportedGlobalAtomIndices.length - 1);
      systemAtomToId.push(String(ensureAtomId(atom)));
      elements.push(symbol);
      coords.push(point.x, point.y, point.z);
    }

    const atomIdToSystemIndex = new Map();
    for (let systemIndex = 0; systemIndex < systemAtomToId.length; systemIndex += 1) {
      atomIdToSystemIndex.set(systemAtomToId[systemIndex], systemIndex);
    }

    const rawBonds = snapshotVolumeBonds(vol, cloneBondSnapshotFn);
    const bonds = [];
    const bondOrders = [];
    let omittedBondCount = 0;
    for (const rawBond of rawBonds) {
      if (!rawBond) continue;
      if (String(rawBond.kind || '').toLowerCase() === 'blocked') continue;
      if (!includePerceivedBonds && String(rawBond.origin || '').toLowerCase() === 'perceived') continue;
      const left = atomIdToSystemIndex.get(String(rawBond.a || '').trim());
      const right = atomIdToSystemIndex.get(String(rawBond.b || '').trim());
      if (!Number.isInteger(left) || !Number.isInteger(right) || left === right) {
        omittedBondCount += 1;
        continue;
      }
      bonds.push(left < right ? [left, right] : [right, left]);
      bondOrders.push(normalizeBondOrder(rawBond.order));
    }

    const system = createUFFSystem(elements, coords, bonds, {
      bondOrders,
      cutoff: Number(options.cutoff) > 0 ? Number(options.cutoff) : undefined,
    });

    const seedGlobal = normalizeIndexList(seedAtomIndices, atoms.length);
    const seedSystem = seedGlobal
      .map((atomIndex) => globalToSystemAtomIndex.get(atomIndex))
      .filter((value) => Number.isInteger(value));
    const shellGlobal = normalizeIndexList(options.shellAtomIndices, atoms.length);
    const shellSystem = shellGlobal
      .map((atomIndex) => globalToSystemAtomIndex.get(atomIndex))
      .filter((value) => Number.isInteger(value));
    const context = createLocalOptimizationContext(system, seedSystem, {
      bondedNeighborhoodHops: Number.isInteger(options.bondedNeighborhoodHops) ? options.bondedNeighborhoodHops : undefined,
      shellAtomIndices: shellSystem,
    });

    return {
      system,
      context,
      systemToGlobalAtomIndex: supportedGlobalAtomIndices.slice(),
      globalToSystemAtomIndex,
      seedGlobalAtomIndices: seedGlobal,
      seedSystemAtomIndices: seedSystem,
      movableGlobalAtomIndices: Array.isArray(context && context.movableAtomIndices)
        ? context.movableAtomIndices.map((systemIndex) => supportedGlobalAtomIndices[systemIndex]).filter(Number.isInteger)
        : [],
      contextGlobalAtomIndices: Array.isArray(context && context.contextAtomIndices)
        ? context.contextAtomIndices.map((systemIndex) => supportedGlobalAtomIndices[systemIndex]).filter(Number.isInteger)
        : [],
      unsupportedGlobalAtomIndices,
      omittedBondCount,
    };
  }

  function relaxHydrogenOnlyLocalContext(adapted, options = {}) {
    if (!localEnergy || !localGradient) {
      throw new Error('VibeMolUFFAdapter requires VibeMolUFF.localEnergy/localGradient to be loaded first.');
    }
    const system = adapted && adapted.system;
    const context = adapted && adapted.context;
    if (!system || !context || !(system.xyz instanceof Float64Array) || !Array.isArray(system.elements)) return null;

    const movableSystemAtomIndices = normalizeIndexList(
      Array.isArray(context.movableAtomIndices)
        ? context.movableAtomIndices.filter((atomIndex) => String(system.elements[atomIndex] || '').trim() === 'H')
        : [],
      system.nAtoms
    );
    if (!movableSystemAtomIndices.length) {
      return {
        converged: true,
        iterations: 0,
        acceptedIterations: 0,
        movedSystemAtomIndices: [],
        movedGlobalAtomIndices: [],
        maxDisplacementAng: 0,
      };
    }

    const relaxContext = {
      ...context,
      movableAtomIndices: movableSystemAtomIndices.slice(),
      movableSet: new Set(movableSystemAtomIndices),
    };
    const maxIter = Number.isInteger(options.maxIter) ? Math.max(0, options.maxIter | 0) : 24;
    let stepAng = Number(options.stepAng) > 0 ? Number(options.stepAng) : 0.025;
    const maxStepAng = Number(options.maxStepAng) > 0 ? Number(options.maxStepAng) : 0.04;
    const minStepAng = Number(options.minStepAng) > 0 ? Number(options.minStepAng) : 1e-4;
    const forceTol = Number(options.forceTol) > 0 ? Number(options.forceTol) : 1e-3;
    const energyTol = Number(options.energyTol) >= 0 ? Number(options.energyTol) : 1e-8;
    const beforeCoords = new Map();
    for (const atomIndex of movableSystemAtomIndices) {
      const base = 3 * atomIndex;
      beforeCoords.set(atomIndex, [system.xyz[base], system.xyz[base + 1], system.xyz[base + 2]]);
    }

    let energy = localEnergy(system, relaxContext);
    if (!Number.isFinite(energy)) energy = 0;
    let acceptedIterations = 0;
    let iterations = 0;
    let converged = false;

    for (; iterations < maxIter; iterations += 1) {
      const grad = localGradient(system, relaxContext, { onlyMovable: true });
      let activeCount = 0;
      let maxForce = 0;
      for (const atomIndex of movableSystemAtomIndices) {
        const base = 3 * atomIndex;
        const fx = -grad[base];
        const fy = -grad[base + 1];
        const fz = -grad[base + 2];
        const forceMag = Math.sqrt(fx * fx + fy * fy + fz * fz);
        maxForce = Math.max(maxForce, forceMag);
        if (forceMag > forceTol) activeCount += 1;
      }
      if (!activeCount || maxForce <= forceTol) {
        converged = true;
        break;
      }

      const prevXyz = system.xyz.slice();
      let movedAny = false;
      for (const atomIndex of movableSystemAtomIndices) {
        const base = 3 * atomIndex;
        const fx = -grad[base];
        const fy = -grad[base + 1];
        const fz = -grad[base + 2];
        const forceMag = Math.sqrt(fx * fx + fy * fy + fz * fz);
        if (!(forceMag > forceTol)) continue;
        const stepScale = Math.min(stepAng, maxStepAng) / forceMag;
        system.xyz[base] += fx * stepScale;
        system.xyz[base + 1] += fy * stepScale;
        system.xyz[base + 2] += fz * stepScale;
        movedAny = true;
      }
      if (!movedAny) {
        converged = true;
        break;
      }

      const nextEnergy = localEnergy(system, relaxContext);
      if (Number.isFinite(nextEnergy) && nextEnergy <= energy - energyTol) {
        energy = nextEnergy;
        acceptedIterations += 1;
        stepAng = Math.min(maxStepAng, stepAng * 1.15);
      } else {
        system.xyz.set(prevXyz);
        stepAng *= 0.5;
        if (stepAng < minStepAng) break;
      }
    }

    const movedSystemAtomIndices = [];
    const movedGlobalAtomIndices = [];
    let maxDisplacementAng = 0;
    for (const atomIndex of movableSystemAtomIndices) {
      const before = beforeCoords.get(atomIndex);
      if (!before) continue;
      const base = 3 * atomIndex;
      const dx = system.xyz[base] - before[0];
      const dy = system.xyz[base + 1] - before[1];
      const dz = system.xyz[base + 2] - before[2];
      const displacement = Math.sqrt(dx * dx + dy * dy + dz * dz);
      maxDisplacementAng = Math.max(maxDisplacementAng, displacement);
      if (!(displacement > 1e-5)) continue;
      movedSystemAtomIndices.push(atomIndex);
      const globalIndex = Array.isArray(adapted.systemToGlobalAtomIndex) ? adapted.systemToGlobalAtomIndex[atomIndex] : undefined;
      if (Number.isInteger(globalIndex)) movedGlobalAtomIndices.push(globalIndex);
    }

    return {
      converged,
      iterations,
      acceptedIterations,
      movedSystemAtomIndices,
      movedGlobalAtomIndices,
      maxDisplacementAng,
    };
  }

  function optimizeVolumeWithUFF(vol, options = {}) {
    if (!createUFFSystem || !createLocalOptimizationContext || !assignAtomType || !totalEnergy || !minimize) {
      throw new Error('VibeMolUFFAdapter requires full VibeMolUFF optimization support to be loaded first.');
    }
    if (!vol || !Array.isArray(vol.atoms) || !vol.atoms.length) return null;

    const atomUnitsToAng = typeof options.atomUnitsToAng === 'function' ? options.atomUnitsToAng : defaultAtomUnitsToAng;
    const worldToAtomUnits = typeof options.worldToAtomUnits === 'function' ? options.worldToAtomUnits : defaultWorldToAtomUnits;
    const allAtomIndices = vol.atoms.map((_atom, atomIndex) => atomIndex);
    const adapted = createLocalUffContextFromVolume(vol, allAtomIndices, {
      ...options,
      atomUnitsToAng,
      bondedNeighborhoodHops: 0,
      shellAtomIndices: [],
      includeHydrogens: options.includeHydrogens !== false,
    });
    if (!adapted || !adapted.system || !(adapted.system.xyz instanceof Float64Array)) return null;

    const system = adapted.system;
    const beforeXyz = system.xyz.slice();
    const beforeCentroid = computeCentroidFromXyz(beforeXyz, system.nAtoms);
    const energyBefore = totalEnergy(system);
    const result = minimize(system, {
      maxIter: Number.isInteger(options.maxIter) ? options.maxIter : 120,
      tol: Number(options.tol) > 0 ? Number(options.tol) : 1e-4,
      dt0: Number(options.dt0) > 0 ? Number(options.dt0) : 0.01,
      dtMax: Number(options.dtMax) > 0 ? Number(options.dtMax) : 0.08,
      ...(options.minimizeOptions && typeof options.minimizeOptions === 'object' ? options.minimizeOptions : {}),
    });
    const afterCentroid = computeCentroidFromXyz(system.xyz, system.nAtoms);
    const shiftX = beforeCentroid.x - afterCentroid.x;
    const shiftY = beforeCentroid.y - afterCentroid.y;
    const shiftZ = beforeCentroid.z - afterCentroid.z;
    for (let atomIndex = 0; atomIndex < system.nAtoms; atomIndex += 1) {
      const base = 3 * atomIndex;
      system.xyz[base] += shiftX;
      system.xyz[base + 1] += shiftY;
      system.xyz[base + 2] += shiftZ;
    }

    let moved = 0;
    let maxDisplacementAng = 0;
    const movedGlobalAtomIndices = [];
    for (let systemIndex = 0; systemIndex < system.nAtoms; systemIndex += 1) {
      const globalIndex = Array.isArray(adapted.systemToGlobalAtomIndex) ? adapted.systemToGlobalAtomIndex[systemIndex] : undefined;
      if (!Number.isInteger(globalIndex) || globalIndex < 0 || globalIndex >= vol.atoms.length) continue;
      const atom = vol.atoms[globalIndex];
      if (!atom) continue;
      const base = 3 * systemIndex;
      const dx = system.xyz[base] - beforeXyz[base];
      const dy = system.xyz[base + 1] - beforeXyz[base + 1];
      const dz = system.xyz[base + 2] - beforeXyz[base + 2];
      const displacement = Math.sqrt(dx * dx + dy * dy + dz * dz);
      maxDisplacementAng = Math.max(maxDisplacementAng, displacement);
      const atomUnits = worldToAtomUnits(vol, {
        x: system.xyz[base],
        y: system.xyz[base + 1],
        z: system.xyz[base + 2],
      });
      const point = normalizePoint3(atomUnits);
      atom.x = point.x;
      atom.y = point.y;
      atom.z = point.z;
      if (displacement > 1e-5) {
        moved += 1;
        movedGlobalAtomIndices.push(globalIndex);
      }
    }

    return {
      ...result,
      adapted,
      moved,
      movedGlobalAtomIndices,
      maxDisplacementAng,
      supportedAtomCount: system.nAtoms,
      unsupportedGlobalAtomIndices: adapted.unsupportedGlobalAtomIndices.slice(),
      omittedBondCount: adapted.omittedBondCount,
      energyBefore,
      energyAfter: totalEnergy(system),
    };
  }

  global.VibeMolUFFAdapter = Object.freeze({
    createLocalUffContextFromVolume,
    relaxHydrogenOnlyLocalContext,
    optimizeVolumeWithUFF,
  });
})(window);
