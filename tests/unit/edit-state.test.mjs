import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';

const plain = (value) => JSON.parse(JSON.stringify(value));

function createEditStateHarness() {
  const context = loadGlobalModules([
    'assets/app/js/structure.js',
    'assets/app/js/edit-state.js',
  ]);
  const structure = context.window.VibeMolStructureCore;
  const editStateApi = context.window.VibeMolEditState;
  const volumes = [];
  let currentIndex = -1;
  const calls = {
    clearTransientInteractionState: 0,
    syncActiveVolumeControls: 0,
    rebuildScene: 0,
    updateSidePanel: 0,
    ensureVolumeSchema: [],
  };
  let hintMessage = '';
  const controller = editStateApi.createEditStateController({
    getVolumes: () => volumes,
    getCurrentIndex: () => currentIndex,
    setCurrentIndex: (value) => { currentIndex = value; },
    ensureVolumeSchema: (vol, options = {}) => {
      calls.ensureVolumeSchema.push(plain(options));
      return structure.ensureVolumeSchema(vol, Object.assign({ inferMissingBonds: false }, options));
    },
    normalizeVolumeAtom: structure.normalizeVolumeAtom,
    cloneJsonLike: structure.cloneJsonLike,
    cloneBondSnapshot: structure.cloneBondSnapshot,
    bondSnapshotsEqual: structure.bondSnapshotsEqual,
    atomsSnapshotsEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    coordinateSnapshotsEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    createAtomSnapshotCommand: ({ record, before, after, beforeFragmentOps, afterFragmentOps, beforeBonds, afterBonds, beforeAnnotations, afterAnnotations, label, at }) => ({
      type: 'atom_snapshot',
      record,
      before,
      after,
      beforeFragmentOps,
      afterFragmentOps,
      beforeBonds,
      afterBonds,
      beforeAnnotations,
      afterAnnotations,
      label,
      at,
      undo({ applyAtomsSnapshotToRecord }) {
        return applyAtomsSnapshotToRecord(record, before, beforeFragmentOps, beforeBonds, beforeAnnotations);
      },
      redo({ applyAtomsSnapshotToRecord }) {
        return applyAtomsSnapshotToRecord(record, after, afterFragmentOps, afterBonds, afterAnnotations);
      },
    }),
    pruneBuilderOperationsForVolume: () => {},
    syncBuilderExtensionFromVolumes: () => {},
    activateVolumeIndex: (index) => { currentIndex = index; },
    clearTransientInteractionState: () => { calls.clearTransientInteractionState += 1; },
    syncActiveVolumeControls: () => { calls.syncActiveVolumeControls += 1; },
    rebuildScene: () => { calls.rebuildScene += 1; },
    updateSidePanel: () => { calls.updateSidePanel += 1; },
    setHintMessage: (message) => { hintMessage = String(message || ''); },
    hasVolumetricGrid: () => true,
    editHistoryLimit: 10,
  });
  return { structure, controller, volumes, calls, getHint: () => hintMessage, setCurrentIndex: (value) => { currentIndex = value; } };
}

test('edit-state bootstraps an empty editable record', () => {
  const { controller, volumes } = createEditStateHarness();
  const record = controller.ensureEditableVolumeRecord();

  assert.ok(record);
  assert.equal(volumes.length, 1);
  assert.equal(record.name, 'untitled-1.xyz');
  assert.equal(record.vol.natoms, 0);
  assert.deepEqual(plain(record.vol.atoms), []);
  assert.deepEqual(plain(record.vol.bonds), []);
  assert.deepEqual(plain(record.vol.annotations), {
    builder: { byAtomId: {} },
    coordination: { byAtomId: {} },
    metalBonding: { byAtomId: {} },
  });
});

test('edit-state undo and redo preserve atom and bond snapshots', () => {
  const { controller, structure, volumes, getHint } = createEditStateHarness();
  const record = controller.ensureEditableVolumeRecord();
  const beforeAtoms = [
    structure.normalizeVolumeAtom({ id: 'atom-1', Z: 6, x: 0, y: 0, z: 0, formalCharge: 0 }),
  ];
  const afterAtoms = [
    structure.normalizeVolumeAtom({ id: 'atom-1', Z: 6, x: 0, y: 0, z: 0, formalCharge: 0 }),
    structure.normalizeVolumeAtom({ id: 'atom-2', Z: 8, x: 1.2, y: 0, z: 0, formalCharge: 0 }),
  ];
  const afterBonds = [{ id: 'bond:atom-1:atom-2', a: 'atom-1', b: 'atom-2', order: 2, kind: 'normal' }];

  record.vol.atoms = beforeAtoms.map((atom) => structure.cloneJsonLike(atom));
  record.vol.natoms = record.vol.atoms.length;
  controller.applyAtomsSnapshotToRecord(record, afterAtoms, [], afterBonds);
  controller.pushEditHistoryEntry(record, beforeAtoms, afterAtoms, 'Add oxygen', {
    beforeFragmentOps: [],
    afterFragmentOps: [],
    beforeBonds: [],
    afterBonds,
  });

  assert.equal(volumes[0].vol.atoms.length, 2);
  assert.equal(volumes[0].vol.bonds.length, 1);
  assert.equal(controller.undo(), true);
  assert.equal(volumes[0].vol.atoms.length, 1);
  assert.equal(volumes[0].vol.bonds.length, 0);
  assert.match(getHint(), /Undo: Add oxygen/);
  assert.equal(controller.redo(), true);
  assert.equal(volumes[0].vol.atoms.length, 2);
  assert.equal(volumes[0].vol.bonds[0].order, 2);
  assert.match(getHint(), /Redo: Add oxygen/);
});

test('edit-state atom-only history entries preserve existing bonds and annotations', () => {
  const { controller, structure, volumes } = createEditStateHarness();
  const record = controller.ensureEditableVolumeRecord();
  const beforeAtoms = [
    structure.normalizeVolumeAtom({ id: 'atom-1', Z: 6, x: -0.75, y: 0, z: 0, formalCharge: 0 }),
    structure.normalizeVolumeAtom({ id: 'atom-2', Z: 6, x: 0.75, y: 0, z: 0, formalCharge: 0 }),
  ];
  const afterAtoms = [
    structure.normalizeVolumeAtom({ id: 'atom-1', Z: 6, x: -0.67, y: -0.04, z: 0, formalCharge: 0 }),
    structure.normalizeVolumeAtom({ id: 'atom-2', Z: 6, x: 0.67, y: 0.04, z: 0, formalCharge: 0 }),
  ];
  const bonds = [
    { id: 'bond:atom-1:atom-2', a: 'atom-1', b: 'atom-2', order: 2, kind: 'normal', origin: 'explicit', style: 'covalent' },
  ];
  const annotations = {
    builder: { byAtomId: {} },
    coordination: { byAtomId: { 'atom-1': { geometryId: 'trigonalPlanar' } } },
    metalBonding: { byAtomId: {} },
  };

  controller.applyAtomsSnapshotToRecord(record, beforeAtoms, [], bonds, annotations);
  controller.applyAtomsSnapshotToRecord(record, afterAtoms);
  controller.pushEditHistoryEntry(record, beforeAtoms, afterAtoms, 'Optimize structure');

  assert.equal(volumes[0].vol.bonds.length, 1);
  assert.equal(volumes[0].vol.bonds[0].order, 2);
  assert.equal(volumes[0].vol.annotations.coordination.byAtomId['atom-1'].geometryId, 'trigonalPlanar');

  assert.equal(controller.undo(), true);
  assert.equal(volumes[0].vol.atoms[0].x, -0.75);
  assert.equal(volumes[0].vol.bonds.length, 1);
  assert.equal(volumes[0].vol.bonds[0].order, 2);
  assert.equal(volumes[0].vol.annotations.coordination.byAtomId['atom-1'].geometryId, 'trigonalPlanar');

  assert.equal(controller.redo(), true);
  assert.equal(volumes[0].vol.atoms[0].x, -0.67);
  assert.equal(volumes[0].vol.bonds.length, 1);
  assert.equal(volumes[0].vol.bonds[0].order, 2);
  assert.equal(volumes[0].vol.annotations.coordination.byAtomId['atom-1'].geometryId, 'trigonalPlanar');
});

test('edit-state applies coordinate snapshots through undo and redo', () => {
  const { controller, structure, volumes } = createEditStateHarness();
  const record = controller.ensureEditableVolumeRecord();
  const before = {
    atoms: [structure.normalizeVolumeAtom({ id: 'atom-1', Z: 1, x: 0, y: 0, z: 0, formalCharge: 0 })],
    grid: {
      origin: [0, 0, 0],
      axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    },
  };
  const after = {
    atoms: [structure.normalizeVolumeAtom({ id: 'atom-1', Z: 1, x: 2, y: 0, z: 0, formalCharge: 0 })],
    grid: {
      origin: [2, 0, 0],
      axes: [[0, 1, 0], [1, 0, 0], [0, 0, 1]],
    },
  };

  controller.applyStructureSnapshotToRecord(record, before);
  controller.applyStructureSnapshotToRecord(record, after);
  controller.pushCoordinateSnapshotHistoryEntry(record, before, after, 'Translate atom');

  assert.equal(volumes[0].vol.atoms[0].x, 2);
  assert.deepEqual(plain(volumes[0].vol.origin), [2, 0, 0]);
  assert.equal(controller.undo(), true);
  assert.equal(volumes[0].vol.atoms[0].x, 0);
  assert.deepEqual(plain(volumes[0].vol.origin), [0, 0, 0]);
  assert.equal(controller.redo(), true);
  assert.equal(volumes[0].vol.atoms[0].x, 2);
  assert.deepEqual(plain(volumes[0].vol.axes), [[0, 1, 0], [1, 0, 0], [0, 0, 1]]);
});

test('edit-state snapshot application does not re-infer missing bonds', () => {
  const { controller, structure, calls } = createEditStateHarness();
  const record = controller.ensureEditableVolumeRecord();
  const snapshot = {
    atoms: [
      structure.normalizeVolumeAtom({ id: 'atom-1', Z: 6, x: 0, y: 0, z: 0, formalCharge: 0 }),
      structure.normalizeVolumeAtom({ id: 'atom-2', Z: 6, x: 1.4, y: 0, z: 0, formalCharge: 0 }),
    ],
    grid: {
      origin: [0, 0, 0],
      axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    },
  };

  controller.applyStructureSnapshotToRecord(record, snapshot);

  assert.deepEqual(plain(record.vol.bonds), []);
  assert.deepEqual(calls.ensureVolumeSchema.at(-1), { inferMissingBonds: false });
});
