import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateInContext, loadGlobalModule } from './load-global-module.mjs';

test('structure schema normalizes atoms and migrates legacy builder annotations', () => {
  const context = loadGlobalModule('assets/app/js/structure.js');
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const vol = {
      atoms: [{
        Z: '6',
        x: '1.5',
        y: 2,
        z: null,
        formalCharge: -1,
        builderGroupId: 'group-9',
        builderEntryId: 'Benzene',
        builderEntryKind: 'Molecule',
      }],
    };
    window.VibeMolStructureCore.ensureVolumeSchema(vol, { inferMissingBonds: false });
    return {
      natoms: vol.natoms,
      atom: vol.atoms[0],
      meta: window.VibeMolStructureCore.getAtomBuilderMeta(vol, 0),
    };
  })())`));

  assert.equal(result.natoms, 1);
  assert.match(result.atom.id, /^atom-\d+$/);
  assert.equal(result.atom.Z, 6);
  assert.equal(result.atom.x, 1.5);
  assert.equal(result.atom.y, 2);
  assert.equal(result.atom.z, 0);
  assert.equal(result.atom.formalCharge, -1);
  assert.equal('builderGroupId' in result.atom, false);
  assert.deepEqual(result.meta, {
    groupId: 'group-9',
    entryId: 'benzene',
    entryKind: 'molecule',
  });
});

test('structure schema exposes empty coordination annotations by default', () => {
  const context = loadGlobalModule('assets/app/js/structure.js');
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const vol = { atoms: [{ id: 'atom-1', Z: 6, x: 0, y: 0, z: 0 }] };
    window.VibeMolStructureCore.ensureVolumeSchema(vol, { inferMissingBonds: false });
    return vol.annotations;
  })())`));

  assert.deepEqual(result, {
    builder: { byAtomId: {} },
    coordination: { byAtomId: {} },
    metalBonding: { byAtomId: {} },
  });
});

test('structure schema normalizes, updates, and deletes explicit bonds', () => {
  const context = loadGlobalModule('assets/app/js/structure.js');
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const vol = {
      atoms: [
        { id: 'atom-10', Z: 6, x: -0.7, y: 0, z: 0, formalCharge: 0 },
        { Z: 6, x: 0.7, y: 0, z: 0, formalCharge: 0 },
      ],
      bonds: [{ a: 0, b: 1, order: 2 }],
    };
    window.VibeMolStructureCore.ensureVolumeSchema(vol, { inferMissingBonds: false });
    const normalizedBond = vol.bonds[0] ? Object.assign({}, vol.bonds[0]) : null;
    const unchanged = window.VibeMolStructureCore.upsertVolumeBond(vol, vol.bonds[0].a, vol.bonds[0].b, 2);
    const updated = window.VibeMolStructureCore.upsertVolumeBond(vol, vol.bonds[0].a, vol.bonds[0].b, 3);
    const removed = window.VibeMolStructureCore.removeVolumeBond(vol, vol.bonds[0].a, vol.bonds[0].b);
    return {
      normalizedBond,
      unchanged,
      updated,
      removed,
      remainingBondCount: vol.bonds.length,
    };
  })())`));

  assert.equal(result.normalizedBond.a, 'atom-10');
  assert.match(result.normalizedBond.b, /^atom-\d+$/);
  assert.equal(result.normalizedBond.order, 2);
  assert.equal(result.normalizedBond.kind, 'normal');
  assert.equal(result.normalizedBond.origin, 'explicit');
  assert.equal(result.unchanged, 'unchanged');
  assert.equal(result.updated, 'updated');
  assert.equal(result.removed, true);
  assert.equal(result.remainingBondCount, 0);
});

test('ensureVolumeSchema can infer missing bonds via callback', () => {
  const context = loadGlobalModule('assets/app/js/structure.js');
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    let inferCalls = 0;
    const vol = {
      atoms: [
        { id: 'atom-1', Z: 1, x: 0, y: 0, z: 0, formalCharge: 0 },
        { id: 'atom-2', Z: 1, x: 0, y: 0, z: 1, formalCharge: 0 },
      ],
    };
    window.VibeMolStructureCore.ensureVolumeSchema(vol, {
      inferBonds(nextVol) {
        inferCalls += 1;
        nextVol.bonds = [{ a: 'atom-1', b: 'atom-2', order: 1, kind: 'normal', origin: 'perceived' }];
      },
    });
    return {
      inferCalls,
      bonds: window.VibeMolStructureCore.cloneBondSnapshot(vol),
    };
  })())`));

  assert.equal(result.inferCalls, 1);
  assert.deepEqual(result.bonds, [
    { id: 'bond:atom-1:atom-2', a: 'atom-1', b: 'atom-2', order: 1, kind: 'normal', origin: 'perceived', style: 'covalent' },
  ]);
});

test('missing bond origin defaults to explicit for backward compatibility', () => {
  const context = loadGlobalModule('assets/app/js/structure.js');
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const vol = {
      atoms: [
        { id: 'atom-1', Z: 6, x: 0, y: 0, z: 0 },
        { id: 'atom-2', Z: 6, x: 1.4, y: 0, z: 0 },
      ],
      bonds: [{ a: 'atom-1', b: 'atom-2', order: 1, kind: 'normal' }],
    };
    window.VibeMolStructureCore.ensureVolumeSchema(vol, { inferMissingBonds: false });
    return window.VibeMolStructureCore.cloneBondSnapshot(vol);
  })())`));

  assert.deepEqual(result, [
    { id: 'bond:atom-1:atom-2', a: 'atom-1', b: 'atom-2', order: 1, kind: 'normal', origin: 'explicit', style: 'covalent' },
  ]);
});

test('structure schema preserves blocked bond records for user-suppressed pairs', () => {
  const context = loadGlobalModule('assets/app/js/structure.js');
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const vol = {
      atoms: [
        { id: 'atom-1', Z: 6, x: 0, y: 0, z: 0 },
        { id: 'atom-2', Z: 6, x: 1.4, y: 0, z: 0 },
      ],
      bonds: [{ a: 'atom-1', b: 'atom-2', order: 1, kind: 'blocked', origin: 'explicit' }],
    };
    window.VibeMolStructureCore.ensureVolumeSchema(vol, { inferMissingBonds: false });
    return window.VibeMolStructureCore.cloneBondSnapshot(vol);
  })())`));

  assert.deepEqual(result, [
    { id: 'bond:atom-1:atom-2', a: 'atom-1', b: 'atom-2', order: 1, kind: 'blocked', origin: 'explicit', style: 'covalent' },
  ]);
});

test('updating a perceived bond can promote it to explicit provenance', () => {
  const context = loadGlobalModule('assets/app/js/structure.js');
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const vol = {
      atoms: [
        { id: 'atom-1', Z: 6, x: 0, y: 0, z: 0 },
        { id: 'atom-2', Z: 6, x: 1.4, y: 0, z: 0 },
      ],
      bonds: [{ a: 'atom-1', b: 'atom-2', order: 1, kind: 'normal', origin: 'perceived' }],
    };
    window.VibeMolStructureCore.ensureVolumeSchema(vol, { inferMissingBonds: false });
    const status = window.VibeMolStructureCore.upsertVolumeBond(vol, 'atom-1', 'atom-2', 2, 'normal', 'explicit');
    return {
      status,
      bond: window.VibeMolStructureCore.cloneBondSnapshot(vol)[0],
    };
  })())`));

  assert.equal(result.status, 'updated');
  assert.deepEqual(result.bond, {
    id: 'bond:atom-1:atom-2',
    a: 'atom-1',
    b: 'atom-2',
    order: 2,
    kind: 'normal',
    origin: 'explicit',
    style: 'covalent',
  });
});

test('structure coordination annotations normalize, update, and delete per atom', () => {
  const context = loadGlobalModule('assets/app/js/structure.js');
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const vol = {
      atoms: [
        { id: 'atom-1', Z: 6, x: 0, y: 0, z: 0 },
        { id: 'atom-2', Z: 8, x: 1.2, y: 0, z: 0 },
      ],
    };
    window.VibeMolStructureCore.ensureVolumeSchema(vol, { inferMissingBonds: false });
    const before = window.VibeMolStructureCore.getAtomCoordinationMeta(vol, 0);
    window.VibeMolStructureCore.setAtomCoordinationMeta(vol, 0, { geometryId: 'tetrahedral' });
    const afterSet = window.VibeMolStructureCore.getAtomCoordinationMeta(vol, 0);
    const snapshot = window.VibeMolStructureCore.cloneVolumeAnnotationsSnapshot(vol);
    window.VibeMolStructureCore.setAtomCoordinationMeta(vol, 0, { geometryId: '' });
    const afterClear = window.VibeMolStructureCore.getAtomCoordinationMeta(vol, 0);
    return { before, afterSet, afterClear, snapshot };
  })())`));

  assert.deepEqual(result.before, { geometryId: '' });
  assert.deepEqual(result.afterSet, { geometryId: 'tetrahedral' });
  assert.deepEqual(result.afterClear, { geometryId: '' });
  assert.deepEqual(result.snapshot, {
    builder: { byAtomId: {} },
    coordination: { byAtomId: { 'atom-1': { geometryId: 'tetrahedral' } } },
    metalBonding: { byAtomId: {} },
  });
});

test('structure metal bonding annotations normalize, update, and delete per atom', () => {
  const context = loadGlobalModule('assets/app/js/structure.js');
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const vol = {
      atoms: [
        { id: 'atom-1', Z: 26, x: 0, y: 0, z: 0 },
        { id: 'atom-2', Z: 7, x: 2.0, y: 0, z: 0 },
      ],
    };
    window.VibeMolStructureCore.ensureVolumeSchema(vol, { inferMissingBonds: false });
    const before = window.VibeMolStructureCore.getAtomMetalBondingMeta(vol, 0);
    window.VibeMolStructureCore.setAtomMetalBondingMeta(vol, 0, { mode: 'force_dative' });
    const afterSet = window.VibeMolStructureCore.getAtomMetalBondingMeta(vol, 0);
    const snapshot = window.VibeMolStructureCore.cloneVolumeAnnotationsSnapshot(vol);
    window.VibeMolStructureCore.setAtomMetalBondingMeta(vol, 0, { mode: 'auto' });
    const afterClear = window.VibeMolStructureCore.getAtomMetalBondingMeta(vol, 0);
    return { before, afterSet, afterClear, snapshot };
  })())`));

  assert.deepEqual(result.before, { mode: 'auto' });
  assert.deepEqual(result.afterSet, { mode: 'force_dative' });
  assert.deepEqual(result.afterClear, { mode: 'auto' });
  assert.deepEqual(result.snapshot, {
    builder: { byAtomId: {} },
    coordination: { byAtomId: {} },
    metalBonding: { byAtomId: { 'atom-1': { mode: 'force_dative' } } },
  });
});

test('structure schema can prune metal bonding annotations via compatibility callback', () => {
  const context = loadGlobalModule('assets/app/js/structure.js');
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const vol = {
      atoms: [
        { id: 'atom-1', Z: 26, x: 0, y: 0, z: 0 },
        { id: 'atom-2', Z: 6, x: 1.5, y: 0, z: 0 },
      ],
      annotations: {
        metalBonding: {
          byAtomId: {
            'atom-1': { mode: 'force_dative' },
            'atom-2': { mode: 'force_covalent' },
          },
        },
      },
    };
    window.VibeMolStructureCore.ensureVolumeSchema(vol, {
      inferMissingBonds: false,
      pruneAtomAnnotations: {
        isMetalBondingMetaCompatible(atomId, meta) {
          return atomId === 'atom-1' && String(meta && meta.mode || '') === 'force_dative';
        },
      },
    });
    return vol.annotations.metalBonding.byAtomId;
  })())`));

  assert.deepEqual(result, {
    'atom-1': { mode: 'force_dative' },
  });
});

test('structure schema can prune coordination annotations via compatibility callback', () => {
  const context = loadGlobalModule('assets/app/js/structure.js');
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const vol = {
      atoms: [
        { id: 'atom-1', Z: 6, x: 0, y: 0, z: 0 },
        { id: 'atom-2', Z: 8, x: 1.2, y: 0, z: 0 },
      ],
      annotations: {
        coordination: {
          byAtomId: {
            'atom-1': { geometryId: 'tetrahedral' },
            'atom-2': { geometryId: 'trigonalPlanar' },
          },
        },
      },
    };
    window.VibeMolStructureCore.ensureVolumeSchema(vol, {
      inferMissingBonds: false,
      pruneAtomAnnotations: {
        isCoordinationMetaCompatible(atomId, meta) {
          return atomId === 'atom-1' && String(meta && meta.geometryId || '') === 'tetrahedral';
        },
      },
    });
    return vol.annotations.coordination.byAtomId;
  })())`));

  assert.deepEqual(result, {
    'atom-1': { geometryId: 'tetrahedral' },
  });
});

test('structure clipboard helpers clone selected substructures with remapped builder groups and bonds', () => {
  const context = loadGlobalModule('assets/app/js/structure.js');
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const vol = {
      atoms: [
        { id: 'atom-1', Z: 6, x: -1.0, y: 0.0, z: 0.0, formalCharge: 0 },
        { id: 'atom-2', Z: 6, x: 1.0, y: 0.0, z: 0.0, formalCharge: 0 },
        { id: 'atom-3', Z: 1, x: 2.0, y: 0.0, z: 0.0, formalCharge: 0 },
      ],
      bonds: [
        { a: 'atom-1', b: 'atom-2', order: 2, kind: 'normal' },
        { a: 'atom-2', b: 'atom-3', order: 1, kind: 'normal' },
      ],
      annotations: {
        builder: {
          byAtomId: {
            'atom-1': { groupId: 'group-9', entryId: 'benzene', entryKind: 'molecule' },
            'atom-2': { groupId: 'group-9', entryId: 'benzene', entryKind: 'molecule' },
          },
        },
        coordination: {
          byAtomId: {
            'atom-1': { geometryId: 'tetrahedral' },
            'atom-2': { geometryId: 'trigonalPlanar' },
          },
        },
      },
    };
    window.VibeMolStructureCore.ensureVolumeSchema(vol, { inferMissingBonds: false });
    const payload = window.VibeMolStructureCore.buildVolumeSelectionClipboard(vol, [0, 1], {
      mapAtom(atom) {
        return { ...atom, x: atom.x + 10 };
      },
    });
    const appended = window.VibeMolStructureCore.appendVolumeSelectionClipboard(vol, payload, {
      mapAtom(atom) {
        return { ...atom, x: atom.x + 5 };
      },
    });
    return {
      payload,
      appended,
      totalAtoms: vol.atoms.length,
      totalBonds: vol.bonds.length,
      newAtoms: appended.atomIndices.map((idx) => vol.atoms[idx]),
      newMetas: appended.atomIndices.map((idx) => window.VibeMolStructureCore.getAtomBuilderMeta(vol, idx)),
      newCoordination: appended.atomIndices.map((idx) => window.VibeMolStructureCore.getAtomCoordinationMeta(vol, idx)),
      bondSnapshot: window.VibeMolStructureCore.cloneBondSnapshot(vol),
    };
  })())`));

  assert.equal(result.payload.atoms.length, 2);
  assert.equal(result.payload.bonds.length, 1);
  assert.equal(result.payload.bonds[0].order, 2);
  assert.equal(result.payload.bonds[0].origin, 'explicit');
  assert.equal(result.totalAtoms, 5);
  assert.equal(result.totalBonds, 3);
  assert.equal(result.appended.atomIndices.length, 2);
  assert.notEqual(result.newAtoms[0].id, 'atom-1');
  assert.notEqual(result.newAtoms[1].id, 'atom-2');
  assert.equal(result.newAtoms[0].x, 14);
  assert.equal(result.newAtoms[1].x, 16);
  assert.equal(result.newMetas[0].entryId, 'benzene');
  assert.equal(result.newMetas[1].entryKind, 'molecule');
  assert.match(result.newMetas[0].groupId, /^group-\d+$/);
  assert.equal(result.newMetas[0].groupId, result.newMetas[1].groupId);
  assert.notEqual(result.newMetas[0].groupId, 'group-9');
  assert.deepEqual(result.payload.atoms[0].coordinationMeta, { geometryId: 'tetrahedral' });
  assert.deepEqual(result.payload.atoms[1].coordinationMeta, { geometryId: 'trigonalPlanar' });
  assert.deepEqual(result.newCoordination, [
    { geometryId: 'tetrahedral' },
    { geometryId: 'trigonalPlanar' },
  ]);
  const duplicateBond = result.bondSnapshot.find((bond) => bond.a === result.newAtoms[0].id && bond.b === result.newAtoms[1].id);
  assert.deepEqual(duplicateBond, {
    id: `bond:${[result.newAtoms[0].id, result.newAtoms[1].id].sort().join(':')}`,
    a: result.newAtoms[0].id,
    b: result.newAtoms[1].id,
    order: 2,
    kind: 'normal',
    origin: 'explicit',
    style: 'covalent',
  });
});
