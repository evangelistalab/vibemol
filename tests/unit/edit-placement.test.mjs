import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createPlacementHarness() {
  const context = loadGlobalModules([
    'assets/app/js/structure.js',
    'assets/app/js/edit-placement.js',
  ]);
  const structure = context.window.VibeMolStructureCore;
  const placementApi = context.window.VibeMolEditPlacement;
  const record = {
    name: 'untitled-1.xyz',
    vol: structure.ensureVolumeSchema({
      atoms: [],
      bonds: [],
      annotations: { builder: { byAtomId: {} }, coordination: { byAtomId: {} } },
      fragmentOps: [],
      units: 'angstrom',
    }, { inferMissingBonds: false }),
  };
  const calls = {
    inferVolumeBonds: 0,
    ensureVolumeSchema: [],
    rebuildScene: 0,
    history: [],
  };
  const state = {};
  const controller = placementApi.createEditPlacementController({
    THREE: { Vector3: class Vector3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } } },
    state,
    ensureEditableVolumeRecord: () => record,
    ensureVolumeSchema: (vol, options = {}) => {
      calls.ensureVolumeSchema.push(plain(options));
      return structure.ensureVolumeSchema(vol, Object.assign({ inferMissingBonds: false }, options));
    },
    cloneAtomsSnapshot: (vol) => structure.cloneJsonLike(Array.isArray(vol && vol.atoms) ? vol.atoms : []),
    cloneBondSnapshot: structure.cloneBondSnapshot,
    cloneVolumeAnnotationsSnapshot: (vol) => structure.cloneJsonLike(vol && vol.annotations ? vol.annotations : {}),
    cloneJsonLike: structure.cloneJsonLike,
    ensureAtomId: structure.ensureAtomId,
    ensureVolumeAtomIds: structure.ensureVolumeAtomIds,
    setAtomBuilderMeta: structure.setAtomBuilderMeta,
    normalizeBuilderOperationEntry: structure.normalizeBuilderOperationEntry,
    worldToAtomUnits: (_vol, world) => [Number(world && world.x) || 0, Number(world && world.y) || 0, Number(world && world.z) || 0],
    atomUnitsToAng: (_vol, atom) => ({ x: Number(atom && atom.x) || 0, y: Number(atom && atom.y) || 0, z: Number(atom && atom.z) || 0 }),
    normalizeEditAddBondOrder: structure.normalizeEditAddBondOrder,
    upsertVolumeBond: structure.upsertVolumeBond,
    pushEditHistoryEntry: (...args) => { calls.history.push(args); },
    inferVolumeBonds: () => { calls.inferVolumeBonds += 1; return []; },
    rebuildScene: () => { calls.rebuildScene += 1; },
    getElementSymbol: (z) => (z === 6 ? 'C' : z === 1 ? 'H' : z === 5 ? 'B' : z === 8 ? 'O' : '?'),
    getElementName: (z) => (z === 6 ? 'Carbon' : z === 1 ? 'Hydrogen' : z === 5 ? 'Boron' : z === 8 ? 'Oxygen' : 'Unknown'),
    getEditAddCoordinationGeometryId: () => '',
    pruneBuilderOperationsForVolume: () => false,
    pruneVolumeAtomAnnotations: structure.pruneVolumeAtomAnnotations,
    baseValence: (z) => (z === 5 ? 3 : z === 6 ? 4 : z === 7 ? 3 : z === 8 ? 2 : z === 1 ? 1 : 0),
    getElementMaxCoordination: (z) => (z === 1 ? 1 : z === 9 ? 1 : z === 17 ? 1 : z === 35 ? 1 : z === 53 ? 1 : 0),
    countsTowardAtomValence: () => true,
    applyAutomaticHydrogenAdjustment: (vol, atomIndices, options = {}) => {
      if (String(options && options.source || '') !== 'delete') return { added: 0, removed: 0 };
      const focusSet = new Set((Array.isArray(atomIndices) ? atomIndices : []).map((value) => Number(value) | 0));
      let added = 0;
      for (const atomIndex of focusSet) {
        const atom = vol && Array.isArray(vol.atoms) ? vol.atoms[atomIndex] : null;
        if (!atom) continue;
        const targetValence = atom.Z === 5 ? 3 : atom.Z === 6 ? 4 : atom.Z === 7 ? 3 : atom.Z === 8 ? 2 : 0;
        if (!(targetValence > 0)) continue;
        const atomId = String(structure.ensureAtomId(atom));
        let currentCount = (Array.isArray(vol.bonds) ? vol.bonds : []).filter((bond) => {
          if (!bond || bond.kind === 'blocked') return false;
          return bond.a === atomId || bond.b === atomId;
        }).length;
        while (currentCount < targetValence) {
          const hydrogenId = `auto-h-${atomId}-${currentCount + 1}`;
          const hydrogen = structure.normalizeVolumeAtom({
            id: hydrogenId,
            Z: 1,
            x: (Number(atom.x) || 0) + 0.5 + currentCount,
            y: Number(atom.y) || 0,
            z: Number(atom.z) || 0,
            formalCharge: 0,
          });
          vol.atoms.push(hydrogen);
          vol.bonds.push({
            id: `bond:${atomId}:${hydrogenId}`,
            a: atomId,
            b: hydrogenId,
            order: 1,
            kind: 'normal',
            origin: 'explicit',
            style: 'covalent',
          });
          vol.natoms = vol.atoms.length;
          currentCount += 1;
          added += 1;
        }
      }
      return { added, removed: 0 };
    },
    getVolumes: () => [record],
    syncBuilderExtensionFromVolumes: () => {},
    onDeleteAtomsPostprocess: () => {},
    updateSidePanel: () => {},
    updateAddAtomOperatorUi: () => {},
    setHintMessage: () => {},
  });
  return { structure, controller, record, calls, state };
}

function seedStandaloneAtoms(record, structure, atomicNumbers) {
  record.vol.atoms = atomicNumbers.map((z, index) => structure.normalizeVolumeAtom({
    id: `atom-${index}`,
    Z: z,
    x: index,
    y: 0,
    z: 0,
    formalCharge: 0,
  }));
  record.vol.natoms = record.vol.atoms.length;
  record.vol.bonds = [];
}

function countAtomsByZ(vol) {
  const counts = new Map();
  for (const atom of Array.isArray(vol && vol.atoms) ? vol.atoms : []) {
    const z = Number(atom && atom.Z) | 0;
    counts.set(z, (counts.get(z) || 0) + 1);
  }
  return Object.fromEntries(Array.from(counts).sort((left, right) => left[0] - right[0]));
}

test('edit-placement appendAtomAtWorld does not trigger global bond inference', () => {
  const { controller, record, calls, state } = createPlacementHarness();

  const ok = controller.appendAtomAtWorld({ x: 1.5, y: 0, z: 0 }, 6);

  assert.equal(ok, true);
  assert.equal(record.vol.atoms.length, 1);
  assert.deepEqual(plain(record.vol.bonds), []);
  assert.equal(calls.inferVolumeBonds, 0);
  assert.deepEqual(calls.ensureVolumeSchema.at(-1), { inferMissingBonds: false });
  assert.equal(typeof state.addAtomOperatorSession?.atomId, 'string');
  assert.equal(state.addAtomOperatorCollapsed, true);
  assert.equal(state.addAtomOperatorSession?.translateAttachedHydrogens, true);
});

test('edit-placement void-added atom sessions commit on cancel-style finalize', () => {
  const { controller, record, calls, state } = createPlacementHarness();

  const ok = controller.appendAtomAtWorld({ x: 1.5, y: 0, z: 0 }, 6);

  assert.equal(ok, true);
  assert.equal(record.vol.atoms.length, 1);
  assert.equal(calls.history.length, 0);
  assert.equal(state.addAtomOperatorSession?.cancelCommits, true);

  const finalized = controller.finalizeAddAtomOperatorSession({ commit: false, announce: false });

  assert.equal(finalized, true);
  assert.equal(record.vol.atoms.length, 1);
  assert.equal(calls.history.length, 1);
  assert.equal(state.addAtomOperatorSession, null);
});

test('edit-placement deleteAtomsByIndex treats same-element standalone atoms as positional indices', () => {
  const { structure, controller, record, calls } = createPlacementHarness();
  seedStandaloneAtoms(record, structure, [1, 1, 1, 1, 1]);

  const ok = controller.deleteAtomsByIndex([3, 1, 3]);

  assert.equal(ok, true);
  assert.deepEqual(record.vol.atoms.map((atom) => atom.id), ['atom-0', 'atom-2', 'atom-4']);
  assert.equal(record.vol.atoms.filter((atom) => (atom.Z | 0) === 1).length, 3);
  assert.equal(record.vol.natoms, 3);
  assert.equal(calls.history.length, 1);
});

test('edit-placement deleteAtomsByIndex preserves unselected standalone atoms across element mixes', () => {
  const cases = [
    {
      atoms: [1, 1, 1, 1, 1],
      deleteIndices: [2],
      expectedCount: 4,
      expectedByZ: { 1: 4 },
    },
    {
      atoms: [1, 1, 1, 6, 6],
      deleteIndices: [0, 3],
      expectedCount: 3,
      expectedByZ: { 1: 2, 6: 1 },
    },
    {
      atoms: [1, 1, 1, 6, 6],
      deleteIndices: [0, 1],
      expectedCount: 3,
      expectedByZ: { 1: 1, 6: 2 },
    },
    {
      atoms: [1, 1, 1, 6, 6],
      deleteIndices: [],
      expectedCount: 5,
      expectedByZ: { 1: 3, 6: 2 },
    },
  ];
  for (const item of cases) {
    const { structure, controller, record } = createPlacementHarness();
    seedStandaloneAtoms(record, structure, item.atoms);

    const ok = controller.deleteAtomsByIndex(item.deleteIndices);

    assert.equal(ok, item.deleteIndices.length > 0);
    assert.equal(record.vol.atoms.length, item.expectedCount);
    assert.deepEqual(countAtomsByZ(record.vol), item.expectedByZ);
  }
});

test('edit-placement deleteAtomsByIndex handles empty and invalid index inputs explicitly', () => {
  const { structure, controller, record, calls } = createPlacementHarness();
  seedStandaloneAtoms(record, structure, [1, 1]);

  assert.equal(controller.deleteAtomsByIndex([]), false);
  assert.deepEqual(record.vol.atoms.map((atom) => atom.id), ['atom-0', 'atom-1']);
  assert.equal(calls.history.length, 0);

  for (const badInput of [[2], [-1], [1.2], ['1'], [{ Z: 1 }], null]) {
    assert.throws(
      () => controller.deleteAtomsByIndex(badInput),
      /deleteAtomsByIndex expects .*positional atom indices/
    );
  }
  assert.deepEqual(record.vol.atoms.map((atom) => atom.id), ['atom-0', 'atom-1']);
  assert.equal(calls.history.length, 0);
});

test('edit-placement deleteAtomsByIndex removes bonds for deleted atom ids only', () => {
  const { structure, controller, record } = createPlacementHarness();
  const atomA = structure.normalizeVolumeAtom({ id: 'ne-a', Z: 10, x: 0, y: 0, z: 0, formalCharge: 0 });
  const atomB = structure.normalizeVolumeAtom({ id: 'ne-b', Z: 10, x: 1, y: 0, z: 0, formalCharge: 0 });
  const atomC = structure.normalizeVolumeAtom({ id: 'ne-c', Z: 10, x: 2, y: 0, z: 0, formalCharge: 0 });
  record.vol.atoms = [atomA, atomB, atomC];
  record.vol.natoms = 3;
  record.vol.bonds = [
    { id: 'bond:ne-a:ne-b', a: 'ne-a', b: 'ne-b', order: 1, kind: 'normal', origin: 'explicit' },
    { id: 'bond:ne-b:ne-c', a: 'ne-b', b: 'ne-c', order: 1, kind: 'normal', origin: 'explicit' },
  ];

  const ok = controller.deleteAtomsByIndex([0]);

  assert.equal(ok, true);
  assert.deepEqual(record.vol.atoms.map((atom) => atom.id), ['ne-b', 'ne-c']);
  assert.deepEqual(plain(record.vol.bonds), [
    { id: 'bond:ne-b:ne-c', a: 'ne-b', b: 'ne-c', order: 1, kind: 'normal', origin: 'explicit', style: 'covalent' },
  ]);
});

test('edit-placement deleteAtomAtIndex prunes stale bonds and repairs surviving frontier valence', () => {
  const { structure, controller, record, calls } = createPlacementHarness();
  const atomA = structure.normalizeVolumeAtom({ id: 'atom-a', Z: 6, x: 0, y: 0, z: 0, formalCharge: 0 });
  const atomB = structure.normalizeVolumeAtom({ id: 'atom-b', Z: 6, x: 1.4, y: 0, z: 0, formalCharge: 0 });
  const atomC = structure.normalizeVolumeAtom({ id: 'atom-c', Z: 6, x: 2.8, y: 0, z: 0, formalCharge: 0 });
  record.vol.atoms = [atomA, atomB, atomC];
  record.vol.natoms = 3;
  record.vol.bonds = [
    { id: 'bond:atom-a:atom-b', a: 'atom-a', b: 'atom-b', order: 1, kind: 'normal', origin: 'explicit' },
    { id: 'bond:atom-b:atom-c', a: 'atom-b', b: 'atom-c', order: 1, kind: 'normal', origin: 'explicit' },
  ];

  const ok = controller.deleteAtomAtIndex(1);

  assert.equal(ok, true);
  assert.equal(record.vol.atoms.length, 10);
  assert.equal(record.vol.atoms.filter((atom) => (atom.Z | 0) === 6).length, 2);
  assert.equal(record.vol.atoms.filter((atom) => (atom.Z | 0) === 1).length, 8);
  assert.equal(record.vol.bonds.length, 8);
  assert.equal(calls.inferVolumeBonds, 0);
  assert.deepEqual(calls.ensureVolumeSchema.at(-1), { inferMissingBonds: false });
});

test('edit-placement replaceAtomElementAtIndex preserves explicit bonds without re-perceiving', () => {
  const { structure, controller, record, calls } = createPlacementHarness();
  const atomA = structure.normalizeVolumeAtom({ id: 'atom-a', Z: 6, x: 0, y: 0, z: 0, formalCharge: 0 });
  const atomB = structure.normalizeVolumeAtom({ id: 'atom-b', Z: 1, x: 1.1, y: 0, z: 0, formalCharge: 0 });
  record.vol.atoms = [atomA, atomB];
  record.vol.natoms = 2;
  record.vol.bonds = [
    { id: 'bond:atom-a:atom-b', a: 'atom-a', b: 'atom-b', order: 1, kind: 'normal', origin: 'explicit' },
  ];

  const result = controller.replaceAtomElementAtIndex(1, 6);

  assert.equal(!!result, true);
  assert.equal(record.vol.atoms.length, 2);
  assert.equal(record.vol.atoms[1].Z, 6);
  assert.equal(record.vol.atoms[1].id, 'atom-b');
  assert.deepEqual(plain(record.vol.bonds), [
    { id: 'bond:atom-a:atom-b', a: 'atom-a', b: 'atom-b', order: 1, kind: 'normal', origin: 'explicit', style: 'covalent' },
  ]);
  assert.equal(calls.inferVolumeBonds, 0);
  assert.deepEqual(calls.ensureVolumeSchema.at(-1), { inferMissingBonds: false });
  assert.equal(calls.history.length, 1);
});

test('edit-placement replaceAtomElementAtIndex removes excess terminal hydrogens for lower-valence elements', () => {
  const { structure, controller, record } = createPlacementHarness();
  const atomC = structure.normalizeVolumeAtom({ id: 'atom-c', Z: 6, x: 0, y: 0, z: 0, formalCharge: 0 });
  const atomH1 = structure.normalizeVolumeAtom({ id: 'atom-h1', Z: 1, x: 1, y: 0, z: 0, formalCharge: 0 });
  const atomH2 = structure.normalizeVolumeAtom({ id: 'atom-h2', Z: 1, x: -1, y: 0, z: 0, formalCharge: 0 });
  const atomH3 = structure.normalizeVolumeAtom({ id: 'atom-h3', Z: 1, x: 0, y: 1, z: 0, formalCharge: 0 });
  const atomH4 = structure.normalizeVolumeAtom({ id: 'atom-h4', Z: 1, x: 0, y: -1, z: 0, formalCharge: 0 });
  record.vol.atoms = [atomC, atomH1, atomH2, atomH3, atomH4];
  record.vol.natoms = 5;
  record.vol.bonds = [
    { id: 'bond:atom-c:atom-h1', a: 'atom-c', b: 'atom-h1', order: 1, kind: 'normal', origin: 'explicit' },
    { id: 'bond:atom-c:atom-h2', a: 'atom-c', b: 'atom-h2', order: 1, kind: 'normal', origin: 'explicit' },
    { id: 'bond:atom-c:atom-h3', a: 'atom-c', b: 'atom-h3', order: 1, kind: 'normal', origin: 'explicit' },
    { id: 'bond:atom-c:atom-h4', a: 'atom-c', b: 'atom-h4', order: 1, kind: 'normal', origin: 'explicit' },
  ];

  const result = controller.replaceAtomElementAtIndex(0, 5);

  assert.equal(!!result, true);
  assert.equal(record.vol.atoms.length, 4);
  assert.equal(record.vol.atoms[0].Z, 5);
  assert.equal(record.vol.bonds.length, 3);
  assert.deepEqual(
    record.vol.bonds.map((bond) => [bond.a, bond.b].sort().join(':')).sort(),
    ['atom-c:atom-h1', 'atom-c:atom-h2', 'atom-c:atom-h3']
  );
});

test('edit-placement deleteAtomsByIndex removes dangling one-valence neighbors in one operation', () => {
  const { structure, controller, record, calls } = createPlacementHarness();
  const atomO = structure.normalizeVolumeAtom({ id: 'atom-o', Z: 8, x: 0, y: 0, z: 0, formalCharge: 0 });
  const atomH1 = structure.normalizeVolumeAtom({ id: 'atom-h1', Z: 1, x: 1, y: 0, z: 0, formalCharge: 0 });
  const atomH2 = structure.normalizeVolumeAtom({ id: 'atom-h2', Z: 1, x: -1, y: 0, z: 0, formalCharge: 0 });
  record.vol.atoms = [atomO, atomH1, atomH2];
  record.vol.natoms = 3;
  record.vol.bonds = [
    { id: 'bond:atom-h1:atom-o', a: 'atom-o', b: 'atom-h1', order: 1, kind: 'normal', origin: 'explicit' },
    { id: 'bond:atom-h2:atom-o', a: 'atom-o', b: 'atom-h2', order: 1, kind: 'normal', origin: 'explicit' },
  ];

  const ok = controller.deleteAtomsByIndex([0]);

  assert.equal(ok, true);
  assert.equal(record.vol.atoms.length, 0);
  assert.deepEqual(plain(record.vol.bonds), []);
  assert.equal(calls.history.length, 1);
});

test('edit-placement deleteAtomsByIndex repairs surviving frontier valence with hydrogens', () => {
  const { structure, controller, record } = createPlacementHarness();
  const atoms = [
    structure.normalizeVolumeAtom({ id: 'c1', Z: 6, x: 0, y: 0, z: 0, formalCharge: 0 }),
    structure.normalizeVolumeAtom({ id: 'c2', Z: 6, x: 1.5, y: 0, z: 0, formalCharge: 0 }),
    structure.normalizeVolumeAtom({ id: 'c3', Z: 6, x: 3.0, y: 0, z: 0, formalCharge: 0 }),
    structure.normalizeVolumeAtom({ id: 'h1', Z: 1, x: -0.8, y: 0.8, z: 0, formalCharge: 0 }),
    structure.normalizeVolumeAtom({ id: 'h2', Z: 1, x: -0.8, y: -0.8, z: 0, formalCharge: 0 }),
    structure.normalizeVolumeAtom({ id: 'h3', Z: 1, x: 0, y: 0, z: 1, formalCharge: 0 }),
    structure.normalizeVolumeAtom({ id: 'h4', Z: 1, x: 1.5, y: 1, z: 0, formalCharge: 0 }),
    structure.normalizeVolumeAtom({ id: 'h5', Z: 1, x: 1.5, y: -1, z: 0, formalCharge: 0 }),
    structure.normalizeVolumeAtom({ id: 'h6', Z: 1, x: 3.8, y: 0.8, z: 0, formalCharge: 0 }),
    structure.normalizeVolumeAtom({ id: 'h7', Z: 1, x: 3.8, y: -0.8, z: 0, formalCharge: 0 }),
    structure.normalizeVolumeAtom({ id: 'h8', Z: 1, x: 3.0, y: 0, z: 1, formalCharge: 0 }),
  ];
  record.vol.atoms = atoms;
  record.vol.natoms = atoms.length;
  record.vol.bonds = [
    { id: 'bond:c1:c2', a: 'c1', b: 'c2', order: 1, kind: 'normal', origin: 'explicit' },
    { id: 'bond:c2:c3', a: 'c2', b: 'c3', order: 1, kind: 'normal', origin: 'explicit' },
    { id: 'bond:c1:h1', a: 'c1', b: 'h1', order: 1, kind: 'normal', origin: 'explicit' },
    { id: 'bond:c1:h2', a: 'c1', b: 'h2', order: 1, kind: 'normal', origin: 'explicit' },
    { id: 'bond:c1:h3', a: 'c1', b: 'h3', order: 1, kind: 'normal', origin: 'explicit' },
    { id: 'bond:c2:h4', a: 'c2', b: 'h4', order: 1, kind: 'normal', origin: 'explicit' },
    { id: 'bond:c2:h5', a: 'c2', b: 'h5', order: 1, kind: 'normal', origin: 'explicit' },
    { id: 'bond:c3:h6', a: 'c3', b: 'h6', order: 1, kind: 'normal', origin: 'explicit' },
    { id: 'bond:c3:h7', a: 'c3', b: 'h7', order: 1, kind: 'normal', origin: 'explicit' },
    { id: 'bond:c3:h8', a: 'c3', b: 'h8', order: 1, kind: 'normal', origin: 'explicit' },
  ];

  const ok = controller.deleteAtomsByIndex([0]);

  assert.equal(ok, true);
  assert.equal(record.vol.atoms.filter((atom) => (atom.Z | 0) === 6).length, 2);
  assert.equal(record.vol.atoms.filter((atom) => (atom.Z | 0) === 1).length, 6);
  const bondPairs = record.vol.bonds.map((bond) => [bond.a, bond.b].sort().join(':')).sort();
  assert.deepEqual(bondPairs, [
    'auto-h-c2-4:c2',
    'c2:c3',
    'c2:h4',
    'c2:h5',
    'c3:h6',
    'c3:h7',
    'c3:h8',
  ]);
});
