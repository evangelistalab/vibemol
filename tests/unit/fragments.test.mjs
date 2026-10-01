import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { loadGlobalModule, REPO_ROOT } from './load-global-module.mjs';

const ATOMIC_NUMBER = Object.freeze({ H: 1, Li: 3, B: 5, C: 6, N: 7, O: 8, F: 9, P: 15, S: 16, Cl: 17, Br: 35 });

function readXyz(relativePath) {
  const lines = fs.readFileSync(path.resolve(REPO_ROOT, 'assets/fragments', relativePath), 'utf8')
    .trimEnd()
    .split(/\r?\n/);
  const atomCount = Number(lines[0]);
  assert.ok(Number.isInteger(atomCount) && atomCount > 0);
  return lines.slice(2, atomCount + 2).map((line) => {
    const [symbol, x, y, z] = line.trim().split(/\s+/);
    return { Z: ATOMIC_NUMBER[symbol], x: Number(x), y: Number(y), z: Number(z) };
  });
}

function canonicalBonds(bonds) {
  return Array.from(bonds, ({ i, j, order }) => ({
    i: Math.min(i, j),
    j: Math.max(i, j),
    order,
  })).sort((a, b) => a.i - b.i || a.j - b.j || a.order - b.order);
}

test('built-in molecule fallbacks match the XYZ-backed manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, 'assets/fragments/library.json'), 'utf8'));
  const context = loadGlobalModule('assets/app/js/fragments.js');
  const molecules = manifest.entries.filter((entry) => entry.kind === 'molecule');
  const importanceOrder = [
    'water',
    'methane',
    'ammonia',
    'benzene',
    'ethanol',
    'carbon-dioxide',
    'methanol',
    'ethene',
    'ethyne',
    'formaldehyde',
    'cyclohexane',
    'dinitrogen',
    'dioxygen',
    'dihydrogen',
    'carbon-monoxide',
    'hydrogen-peroxide',
    'ethane',
    'pyridine',
    'acetonitrile',
    'formic-acid',
    'lithium-hydride',
    'hydrogen-fluoride',
    'boron-trifluoride',
    'sulfur-dioxide',
    'sulfur-trioxide',
    'nitrogen-dioxide',
    'nitrous-oxide',
    'phosphorus-trifluoride',
    'diborane',
    'ammonia-borane',
  ];

  assert.deepEqual(molecules.map((entry) => entry.id), importanceOrder);
  assert.deepEqual(molecules.map((entry) => entry.importanceRank), [
    1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    24, 36, 45, 46, 61, 69, 70, 71, 72, 73, 74, 75,
  ]);
  assert.deepEqual(
    Array.from(context.VibeMolFragments.getCatalogEntries('molecule'), (entry) => entry.id),
    importanceOrder
  );
  for (const entry of molecules) {
    const builtIn = context.VibeMolFragments.buildCatalogInstance(entry.id, 'molecule');
    const xyzAtoms = readXyz(entry.xyz);
    assert.ok(builtIn, `missing built-in molecule: ${entry.id}`);
    assert.equal(builtIn.atoms.length, xyzAtoms.length, `${entry.id} atom count`);
    for (let index = 0; index < xyzAtoms.length; index += 1) {
      assert.equal(builtIn.atoms[index].Z, xyzAtoms[index].Z, `${entry.id} atom ${index} element`);
      for (const axis of ['x', 'y', 'z']) {
        assert.ok(
          Math.abs(builtIn.atoms[index][axis] - xyzAtoms[index][axis]) < 1e-8,
          `${entry.id} atom ${index} ${axis} coordinate`
        );
      }
    }
    assert.deepEqual(canonicalBonds(builtIn.bonds), canonicalBonds(entry.bonds), `${entry.id} bonds`);
  }
});

test('capped fragment fallbacks match their XYZ geometries and attachment convention', () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, 'assets/fragments/library.json'), 'utf8'));
  const context = loadGlobalModule('assets/app/js/fragments.js');
  const cappedIds = [
    'methyl', 'hydroxyl', 'amino', 'amide', 'phenyl', 'ethyl', 'methoxy',
    'fluoro', 'chloro', 'bromo', 'cyano', 'nitro', 'carboxyl', 'isopropyl',
    'tert-butyl',
  ];

  for (const id of cappedIds) {
    const entry = manifest.entries.find((candidate) => candidate.kind === 'fragment' && candidate.id === id);
    assert.ok(entry, `missing manifest fragment: ${id}`);
    const builtIn = context.VibeMolFragments.buildCatalogInstance(id, 'fragment');
    const xyzAtoms = readXyz(entry.xyz);
    assert.ok(builtIn, `missing built-in fragment: ${id}`);
    assert.deepEqual(Array.from(entry.linkBondDirection), [0, 0, 1], `${id} attachment direction`);
    assert.equal(builtIn.connectionAtomIndex, 0, `${id} connection atom`);
    assert.equal(builtIn.atoms.length, xyzAtoms.length, `${id} atom count`);
    for (let index = 0; index < xyzAtoms.length; index += 1) {
      assert.equal(builtIn.atoms[index].Z, xyzAtoms[index].Z, `${id} atom ${index} element`);
      for (const axis of ['x', 'y', 'z']) {
        assert.ok(
          Math.abs(builtIn.atoms[index][axis] - xyzAtoms[index][axis]) < 1e-8,
          `${id} atom ${index} ${axis} coordinate`
        );
      }
    }
    assert.deepEqual(canonicalBonds(builtIn.bonds), canonicalBonds(entry.bonds), `${id} bonds`);
    for (const axis of ['x', 'y', 'z']) {
      assert.ok(Math.abs(xyzAtoms[0][axis]) < 1e-10, `${id} linker ${axis} origin`);
    }
  }
});

test('DFT-expanded molecule templates have complete compositions and topologies', () => {
  const context = loadGlobalModule('assets/app/js/fragments.js');
  const expected = {
    'carbon-dioxide': { atoms: { 6: 1, 8: 2 }, bonds: 2 },
    methanol: { atoms: { 1: 4, 6: 1, 8: 1 }, bonds: 5 },
    ethene: { atoms: { 1: 4, 6: 2 }, bonds: 5 },
    ethyne: { atoms: { 1: 2, 6: 2 }, bonds: 3 },
    formaldehyde: { atoms: { 1: 2, 6: 1, 8: 1 }, bonds: 3 },
    dinitrogen: { atoms: { 7: 2 }, bonds: 1 },
    dioxygen: { atoms: { 8: 2 }, bonds: 1 },
    dihydrogen: { atoms: { 1: 2 }, bonds: 1 },
    'carbon-monoxide': { atoms: { 6: 1, 8: 1 }, bonds: 1 },
    'hydrogen-peroxide': { atoms: { 1: 2, 8: 2 }, bonds: 3 },
    ethane: { atoms: { 1: 6, 6: 2 }, bonds: 7 },
    acetonitrile: { atoms: { 1: 3, 6: 2, 7: 1 }, bonds: 5 },
    'formic-acid': { atoms: { 1: 2, 6: 1, 8: 2 }, bonds: 4 },
    'lithium-hydride': { atoms: { 1: 1, 3: 1 }, bonds: 1 },
    'hydrogen-fluoride': { atoms: { 1: 1, 9: 1 }, bonds: 1 },
    'boron-trifluoride': { atoms: { 5: 1, 9: 3 }, bonds: 3 },
    'sulfur-dioxide': { atoms: { 8: 2, 16: 1 }, bonds: 2 },
    'sulfur-trioxide': { atoms: { 8: 3, 16: 1 }, bonds: 3 },
    'nitrogen-dioxide': { atoms: { 7: 1, 8: 2 }, bonds: 2 },
    'nitrous-oxide': { atoms: { 7: 2, 8: 1 }, bonds: 2 },
    'phosphorus-trifluoride': { atoms: { 9: 3, 15: 1 }, bonds: 3 },
    diborane: { atoms: { 1: 6, 5: 2 }, bonds: 8 },
    'ammonia-borane': { atoms: { 1: 6, 5: 1, 7: 1 }, bonds: 7 },
  };

  for (const [id, shape] of Object.entries(expected)) {
    const molecule = context.VibeMolFragments.buildCatalogInstance(id, 'molecule');
    const elementCounts = molecule.atoms.reduce((counts, atom) => {
      counts[atom.Z] = (counts[atom.Z] || 0) + 1;
      return counts;
    }, {});
    assert.deepEqual({ ...elementCounts }, shape.atoms, `${id} composition`);
    assert.equal(molecule.bonds.length, shape.bonds, `${id} bond count`);
  }
});

test('top-five molecule templates have complete atoms and bonds', () => {
  const context = loadGlobalModule('assets/app/js/fragments.js');
  const expected = {
    water: { atoms: { 1: 2, 8: 1 }, bonds: 2 },
    methane: { atoms: { 1: 4, 6: 1 }, bonds: 4 },
    ammonia: { atoms: { 1: 3, 7: 1 }, bonds: 3 },
    benzene: { atoms: { 1: 6, 6: 6 }, bonds: 12 },
    ethanol: { atoms: { 1: 6, 6: 2, 8: 1 }, bonds: 8 },
  };

  for (const [id, shape] of Object.entries(expected)) {
    const molecule = context.VibeMolFragments.buildCatalogInstance(id, 'molecule');
    const elementCounts = molecule.atoms.reduce((counts, atom) => {
      counts[atom.Z] = (counts[atom.Z] || 0) + 1;
      return counts;
    }, {});
    assert.deepEqual({ ...elementCounts }, shape.atoms, `${id} composition`);
    assert.equal(molecule.bonds.length, shape.bonds, `${id} bond count`);
  }
});

test('cyclohexane is a complete C6H12 chair template', () => {
  const context = loadGlobalModule('assets/app/js/fragments.js');
  const cyclohexane = context.VibeMolFragments.buildCatalogInstance('cyclohexane', 'molecule');
  const elementCounts = cyclohexane.atoms.reduce((counts, atom) => {
    counts[atom.Z] = (counts[atom.Z] || 0) + 1;
    return counts;
  }, {});

  assert.deepEqual({ ...elementCounts }, { 1: 12, 6: 6 });
  assert.equal(cyclohexane.bonds.length, 18);
  assert.equal(cyclohexane.bonds.filter((bond) => (
    cyclohexane.atoms[bond.i].Z === 1 || cyclohexane.atoms[bond.j].Z === 1
  )).length, 12);
});
