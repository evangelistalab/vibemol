import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateInContext, loadGlobalModules } from './load-global-module.mjs';

function loadUffAdapterContext() {
  return loadGlobalModules([
    'assets/app/js/structure.js',
    'assets/app/js/element-utils.js',
    'assets/app/js/bond-inference.js',
    'assets/app/js/uff.js',
    'assets/app/js/uff-adapter.js',
  ], {
    globals: {
      ATOM_Z_TO_DATA: {
        1: { symbol: 'H' },
        6: { symbol: 'C' },
        7: { symbol: 'N' },
        8: { symbol: 'O' },
        16: { symbol: 'S' },
      },
    },
  });
}

function makeRing(elements, orders, hydrogenCounts, radius = 1.395) {
  const atomicNumbers = { C: 6, N: 7, O: 8, S: 16 };
  const atoms = elements.map((element, i) => {
    const angle = 2 * Math.PI * i / elements.length;
    return { id: `a${i}`, Z: atomicNumbers[element], x: radius * Math.cos(angle), y: radius * Math.sin(angle), z: 0 };
  });
  const bonds = orders.map((order, i) => ({
    a: atoms[i].id, b: atoms[(i + 1) % atoms.length].id, order, origin: 'explicit',
  }));
  hydrogenCounts.forEach((count, i) => {
    const angle = 2 * Math.PI * i / elements.length;
    for (let j = 0; j < count; j++) {
      const id = `h${i}-${j}`;
      atoms.push({ id, Z: 1, x: (radius + 1.08) * Math.cos(angle), y: (radius + 1.08) * Math.sin(angle), z: j * 0.5 });
      bonds.push({ a: atoms[i].id, b: id, order: 1, origin: 'explicit' });
    }
  });
  return { atoms, bonds };
}

test('UFF optimizes either benzene bond pattern to one C–C distance without changing its stored bonds', () => {
  const { VibeMolUFFAdapter: adapter } = loadUffAdapterContext();
  for (const orders of [[2, 1, 2, 1, 2, 1], [1, 2, 1, 2, 1, 2]]) {
    const vol = makeRing(Array(6).fill('C'), orders, Array(6).fill(1));
    const originalBonds = structuredClone(vol.bonds);
    const { system } = adapter.createLocalUffContextFromVolume(vol, [0]);
    const terms = Array.from(system.bondTerms).filter(({ i, j }) => i < 6 && j < 6);
    assert.deepEqual(Array.from(system.atomTypes.slice(0, 6)), Array(6).fill('C_R'));
    assert.deepEqual(terms.map(({ bondOrder }) => bondOrder), Array(6).fill(1.5));
    const result = adapter.optimizeVolumeWithUFF(vol);
    const lengths = orders.map((_, i) => {
      const a = vol.atoms[i], b = vol.atoms[(i + 1) % orders.length];
      return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    });
    const spread = Math.max(...lengths) - Math.min(...lengths);
    assert.ok(spread < 1e-4 && lengths.every(len => Math.abs(len - 1.4) < 0.02),
      JSON.stringify({ orders, lengths, spread, expected: 'one ring distance near 1.4 Å, spread < 0.0001 Å' }));
    assert.ok(result.energyAfter < result.energyBefore, JSON.stringify(result));
    assert.deepEqual(vol.bonds, originalBonds);
  }
});

test('UFF types heteroaromatic and fused rings, while retaining localized orders in a nonaromatic ring', () => {
  const { VibeMolUFFAdapter: adapter } = loadUffAdapterContext();
  const pyridine = makeRing(['N', 'C', 'C', 'C', 'C', 'C'], [2, 1, 2, 1, 2, 1], [0, 1, 1, 1, 1, 1]);
  const furan = makeRing(['O', 'C', 'C', 'C', 'C'], [1, 2, 1, 2, 1], [0, 1, 1, 1, 1]);
  const thiophene = makeRing(['S', 'C', 'C', 'C', 'C'], [1, 2, 1, 2, 1], [0, 1, 1, 1, 1]);
  const cyclohexadiene = makeRing(Array(6).fill('C'), [2, 1, 2, 1, 1, 1], [1, 1, 1, 1, 2, 2]);
  const fused = {
    atoms: Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, Z: 6 })),
    bonds: [[0, 1], [1, 3], [3, 7], [7, 6], [6, 2], [2, 0], [1, 5], [5, 9], [9, 8], [8, 4], [4, 0]]
      .map(([i, j], index) => ({ a: `a${i}`, b: `a${j}`, order: [1, 3, 5, 7, 9].includes(index) ? 2 : 1, origin: 'explicit' })),
  };
  for (const [volume, ringAtoms, resonantType, expectedOrders] of [
    [pyridine, 6, 'N_R', Array(6).fill(1.5)],
    [furan, 5, 'O_R', Array(5).fill(1.5)],
    [thiophene, 5, 'S_R', Array(5).fill(1.5)],
    [cyclohexadiene, 6, 'C_2', [1, 1, 1, 1, 2, 2]],
    [fused, 10, 'C_R', Array(11).fill(1.5)],
  ]) {
    const { system } = adapter.createLocalUffContextFromVolume(volume, [0]);
    assert.equal(system.atomTypes[0], resonantType);
    assert.deepEqual(Array.from(system.bondTerms).filter(({ i, j }) => i < ringAtoms && j < ringAtoms)
      .map(({ bondOrder }) => bondOrder).sort(), expectedOrders);
  }
});

test('UFF keeps indole’s fused resonant rings near their bond lengths without rewriting stored orders', () => {
  const { VibeMolUFFAdapter: adapter } = loadUffAdapterContext();
  const { molecules } = JSON.parse(readFileSync(new URL('../fixtures/aromatic-hydrogen.json', import.meta.url)));
  const fixture = molecules.find(({ name }) => name === 'indole');
  const atomicNumbers = { H: 1, C: 6, N: 7 };
  const atoms = fixture.atoms.map(([symbol, x, y, z], i) => ({ id: `a${i}`, Z: atomicNumbers[symbol], x, y, z }));
  const edges = [[0,1,1],[0,6,1],[0,9,1],[1,2,2],[1,4,1],[2,3,1],[2,5,1],[3,6,2],[3,10,1],
    [4,7,2],[4,11,1],[5,8,2],[5,12,1],[6,13,1],[7,8,1],[7,14,1],[8,15,1]];
  const bonds = edges.map(([i, j, order]) => ({ a: atoms[i].id, b: atoms[j].id, order, origin: 'explicit' }));
  const volume = { atoms, bonds };
  const stored = structuredClone(bonds);
  const { system } = adapter.createLocalUffContextFromVolume(volume, [0]);
  const ringOrders = Array.from(system.bondTerms).filter(({ i, j }) => i < 9 && j < 9).map(term => term.bondOrder);
  assert.deepEqual(ringOrders, Array(10).fill(1.5));
  adapter.optimizeVolumeWithUFF(volume);
  const lengths = edges.filter(([, j]) => j < 9).map(([i, j]) => {
    const a = atoms[i], b = atoms[j];
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  });
  assert.ok(lengths.every(length => length > 1.345 && length < 1.42),
    JSON.stringify({ lengths, expected: 'all ring bonds in (1.345, 1.42) Å' }));
  assert.deepEqual(volume.bonds, stored);
});

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
