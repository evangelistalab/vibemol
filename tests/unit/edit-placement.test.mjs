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
    getElementSymbol: (z) => (z === 6 ? 'C' : z === 1 ? 'H' : '?'),
    getElementName: (z) => (z === 6 ? 'Carbon' : z === 1 ? 'Hydrogen' : 'Unknown'),
    getEditAddCoordinationGeometryId: () => '',
    pruneBuilderOperationsForVolume: () => false,
    getVolumes: () => [record],
    syncBuilderExtensionFromVolumes: () => {},
    onDeleteAtomPostprocess: () => {},
    updateSidePanel: () => {},
    updateAddAtomOperatorUi: () => {},
    setHintMessage: () => {},
  });
  return { structure, controller, record, calls, state };
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

test('edit-placement deleteAtomAtIndex prunes stale bonds without re-perceiving new ones', () => {
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
  assert.equal(record.vol.atoms.length, 2);
  assert.deepEqual(plain(record.vol.bonds), []);
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
    { id: 'bond:atom-a:atom-b', a: 'atom-a', b: 'atom-b', order: 1, kind: 'normal', origin: 'explicit' },
  ]);
  assert.equal(calls.inferVolumeBonds, 0);
  assert.deepEqual(calls.ensureVolumeSchema.at(-1), { inferMissingBonds: false });
  assert.equal(calls.history.length, 1);
});
