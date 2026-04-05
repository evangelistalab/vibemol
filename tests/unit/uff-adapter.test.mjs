import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateInContext, loadGlobalModules } from './load-global-module.mjs';

function loadUffAdapterContext() {
  return loadGlobalModules([
    'assets/app/js/structure.js',
    'assets/app/js/uff.js',
    'assets/app/js/uff-adapter.js',
  ], {
    globals: {
      ATOM_Z_TO_DATA: {
        1: { symbol: 'H' },
        6: { symbol: 'C' },
        8: { symbol: 'O' },
      },
    },
  });
}

test('uff-adapter builds one local UFF context from volume bonds while ignoring blocked bonds', () => {
  const context = loadUffAdapterContext();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const core = window.VibeMolStructureCore;
    const vol = {
      atoms: [
        { id: 'a1', Z: 6, x: 0.0, y: 0.0, z: 0.0, formalCharge: 0 },
        { id: 'a2', Z: 6, x: 1.34, y: 0.0, z: 0.0, formalCharge: 0 },
        { id: 'a3', Z: 1, x: 2.34, y: 0.0, z: 0.0, formalCharge: 0 },
        { id: 'a4', Z: 1, x: 0.0, y: 1.09, z: 0.0, formalCharge: 0 },
      ],
      bonds: [
        { a: 'a1', b: 'a2', order: 2, kind: 'normal', origin: 'explicit' },
        { a: 'a2', b: 'a3', order: 1, kind: 'normal', origin: 'explicit' },
        { a: 'a1', b: 'a4', order: 1, kind: 'blocked', origin: 'explicit' },
      ],
      annotations: { builder: { byAtomId: {} }, coordination: { byAtomId: {} } },
    };
    core.ensureVolumeSchema(vol, { inferMissingBonds: false });
    const adapted = window.VibeMolUFFAdapter.createLocalUffContextFromVolume(vol, [1], {
      atomUnitsToAng: (_vol, atom) => ({ x: atom.x, y: atom.y, z: atom.z }),
      cloneBondSnapshot: core.cloneBondSnapshot,
      ensureAtomId: core.ensureAtomId,
      getElementSymbol: (z) => ({ 1: 'H', 6: 'C', 8: 'O' }[z] || ''),
    });
    return {
      systemAtomCount: adapted.system.nAtoms,
      systemBondCount: adapted.system.bonds.length,
      bondOrders: adapted.system.bondOrders.slice(),
      seedSystem: adapted.seedSystemAtomIndices.slice(),
      contextGlobal: adapted.contextGlobalAtomIndices.slice(),
      movableGlobal: adapted.movableGlobalAtomIndices.slice(),
      unsupported: adapted.unsupportedGlobalAtomIndices.slice(),
      omittedBondCount: adapted.omittedBondCount,
    };
  })())`));

  assert.equal(result.systemAtomCount, 4);
  assert.equal(result.systemBondCount, 2);
  assert.deepEqual(result.bondOrders, [2, 1]);
  assert.deepEqual(result.seedSystem, [1]);
  assert.deepEqual(result.contextGlobal, [0, 1, 2]);
  assert.deepEqual(result.movableGlobal, [1]);
  assert.deepEqual(result.unsupported, []);
  assert.equal(result.omittedBondCount, 0);
});

test('uff local context excludes unrelated nonbonded pairs from local gradients', () => {
  const context = loadUffAdapterContext();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const adapted = window.VibeMolUFFAdapter.createLocalUffContextFromVolume({
      atoms: [
        { id: 'h1', Z: 1, x: 0.0, y: 0.0, z: 0.0, formalCharge: 0 },
        { id: 'h2', Z: 1, x: 1.5, y: 0.0, z: 0.0, formalCharge: 0 },
      ],
      bonds: [],
      annotations: { builder: { byAtomId: {} }, coordination: { byAtomId: {} } },
    }, [0], {
      atomUnitsToAng: (_vol, atom) => ({ x: atom.x, y: atom.y, z: atom.z }),
      getElementSymbol: (z) => ({ 1: 'H', 6: 'C', 8: 'O' }[z] || ''),
    });
    const grad = window.VibeMolUFF.localGradient(adapted.system, adapted.context, { onlyMovable: true });
    return {
      contextGlobal: adapted.contextGlobalAtomIndices.slice(),
      nonbondedPairs: adapted.context.nonbondedPairs.slice(),
      grad: Array.from(grad).map((value) => Number(value.toFixed(6))),
    };
  })())`));

  assert.deepEqual(result.contextGlobal, [0]);
  assert.deepEqual(result.nonbondedPairs, []);
  assert.deepEqual(result.grad, [0, 0, 0, 0, 0, 0]);
});

test('uff-adapter hydrogen-only relaxation moves hydrogens while keeping heavy atoms fixed', () => {
  const context = loadUffAdapterContext();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const core = window.VibeMolStructureCore;
    const vol = {
      atoms: [
        { id: 'c1', Z: 6, x: 0.0, y: 0.0, z: 0.0, formalCharge: 0 },
        { id: 'h1', Z: 1, x: 2.4, y: 0.35, z: 0.0, formalCharge: 0 },
      ],
      bonds: [
        { a: 'c1', b: 'h1', order: 1, kind: 'normal', origin: 'explicit' },
      ],
      annotations: { builder: { byAtomId: {} }, coordination: { byAtomId: {} } },
    };
    core.ensureVolumeSchema(vol, { inferMissingBonds: false });
    const adapted = window.VibeMolUFFAdapter.createLocalUffContextFromVolume(vol, [1], {
      atomUnitsToAng: (_vol, atom) => ({ x: atom.x, y: atom.y, z: atom.z }),
      cloneBondSnapshot: core.cloneBondSnapshot,
      ensureAtomId: core.ensureAtomId,
      getElementSymbol: (z) => ({ 1: 'H', 6: 'C', 8: 'O' }[z] || ''),
      shellAtomIndices: [0],
      bondedNeighborhoodHops: 0,
    });
    const beforeCarbon = Array.from(adapted.system.xyz.slice(0, 3));
    const beforeDistance = Math.sqrt(
      Math.pow(adapted.system.xyz[3] - adapted.system.xyz[0], 2) +
      Math.pow(adapted.system.xyz[4] - adapted.system.xyz[1], 2) +
      Math.pow(adapted.system.xyz[5] - adapted.system.xyz[2], 2)
    );
    const relaxed = window.VibeMolUFFAdapter.relaxHydrogenOnlyLocalContext(adapted, {
      maxIter: 20,
      stepAng: 0.03,
      maxStepAng: 0.05,
    });
    const afterCarbon = Array.from(adapted.system.xyz.slice(0, 3));
    const afterDistance = Math.sqrt(
      Math.pow(adapted.system.xyz[3] - adapted.system.xyz[0], 2) +
      Math.pow(adapted.system.xyz[4] - adapted.system.xyz[1], 2) +
      Math.pow(adapted.system.xyz[5] - adapted.system.xyz[2], 2)
    );
    return {
      beforeCarbon,
      afterCarbon,
      beforeDistance: Number(beforeDistance.toFixed(6)),
      afterDistance: Number(afterDistance.toFixed(6)),
      movedGlobal: relaxed.movedGlobalAtomIndices.slice(),
      maxDisplacementAng: Number(relaxed.maxDisplacementAng.toFixed(6)),
      acceptedIterations: relaxed.acceptedIterations,
    };
  })())`));

  assert.deepEqual(result.beforeCarbon, result.afterCarbon);
  assert.deepEqual(result.movedGlobal, [1]);
  assert.ok(result.maxDisplacementAng > 0.01);
  assert.ok(result.afterDistance < result.beforeDistance);
  assert.ok(result.acceptedIterations >= 1);
});

test('uff inversion terms are created for planar sp2 centers and vanish in-plane', () => {
  const context = loadUffAdapterContext();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const system = window.VibeMolUFF.createUFFSystem(
      ['C', 'O', 'H', 'H'],
      [
        0.0, 0.0, 0.0,
        1.22, 0.0, 0.0,
        -0.62, 0.93, 0.0,
        -0.62, -0.93, 0.0,
      ],
      [
        [0, 1],
        [0, 2],
        [0, 3],
      ],
      { bondOrders: [2, 1, 1] }
    );
    const planar = window.VibeMolUFF.energyComponents(system);
    system.xyz[8] = 0.35;
    const distorted = window.VibeMolUFF.energyComponents(system);
    const local = window.VibeMolUFF.createLocalOptimizationContext(system, [0], { bondedNeighborhoodHops: 0 });
    return {
      inversionTermCount: system.inversionTerms.length,
      inversionTermsByCarbon: system.inversionTermsByAtom[0].length,
      localInversionTermCount: local.inversionTerms.length,
      planarInversion: Number(planar.inversion.toFixed(8)),
      distortedInversion: Number(distorted.inversion.toFixed(8)),
    };
  })())`));

  assert.equal(result.inversionTermCount, 3);
  assert.equal(result.inversionTermsByCarbon, 3);
  assert.equal(result.localInversionTermCount, 3);
  assert.equal(result.planarInversion, 0);
  assert.ok(result.distortedInversion > 0.01);
});

test('uff-adapter optimizeVolumeWithUFF lowers energy and writes coordinates back to the volume', () => {
  const context = loadUffAdapterContext();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const core = window.VibeMolStructureCore;
    const vol = {
      atoms: [
        { id: 'c1', Z: 6, x: 0.0, y: 0.0, z: 0.0, formalCharge: 0 },
        { id: 'h1', Z: 1, x: 2.4, y: 0.0, z: 0.0, formalCharge: 0 },
      ],
      bonds: [
        { a: 'c1', b: 'h1', order: 1, kind: 'normal', origin: 'explicit' },
      ],
      annotations: { builder: { byAtomId: {} }, coordination: { byAtomId: {} } },
    };
    core.ensureVolumeSchema(vol, { inferMissingBonds: false });
    const beforeDistance = Math.abs((vol.atoms[1].x || 0) - (vol.atoms[0].x || 0));
    const result = window.VibeMolUFFAdapter.optimizeVolumeWithUFF(vol, {
      atomUnitsToAng: (_vol, atom) => ({ x: atom.x, y: atom.y, z: atom.z }),
      worldToAtomUnits: (_vol, point) => [point.x, point.y, point.z],
      cloneBondSnapshot: core.cloneBondSnapshot,
      ensureAtomId: core.ensureAtomId,
      getElementSymbol: (z) => ({ 1: 'H', 6: 'C', 8: 'O' }[z] || ''),
      minimizeOptions: { maxIter: 60, tol: 1e-4, dt0: 0.01, dtMax: 0.08 },
    });
    const afterDistance = Math.sqrt(
      Math.pow((vol.atoms[1].x || 0) - (vol.atoms[0].x || 0), 2) +
      Math.pow((vol.atoms[1].y || 0) - (vol.atoms[0].y || 0), 2) +
      Math.pow((vol.atoms[1].z || 0) - (vol.atoms[0].z || 0), 2)
    );
    return {
      moved: result.moved,
      supportedAtomCount: result.supportedAtomCount,
      energyBefore: Number(result.energyBefore.toFixed(6)),
      energyAfter: Number(result.energyAfter.toFixed(6)),
      beforeDistance: Number(beforeDistance.toFixed(6)),
      afterDistance: Number(afterDistance.toFixed(6)),
      movedGlobal: result.movedGlobalAtomIndices.slice(),
    };
  })())`));

  assert.equal(result.supportedAtomCount, 2);
  assert.equal(result.moved, 2);
  assert.deepEqual(result.movedGlobal, [0, 1]);
  assert.ok(result.energyAfter < result.energyBefore);
  assert.ok(result.afterDistance < result.beforeDistance);
});
