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
    { id: 'bond:atom-1:atom-2', a: 'atom-1', b: 'atom-2', order: 1, kind: 'normal', origin: 'perceived' },
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
    { id: 'bond:atom-1:atom-2', a: 'atom-1', b: 'atom-2', order: 1, kind: 'normal', origin: 'explicit' },
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
    { id: 'bond:atom-1:atom-2', a: 'atom-1', b: 'atom-2', order: 1, kind: 'blocked', origin: 'explicit' },
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
  const duplicateBond = result.bondSnapshot.find((bond) => bond.a === result.newAtoms[0].id && bond.b === result.newAtoms[1].id);
  assert.deepEqual(duplicateBond, {
    id: `bond:${[result.newAtoms[0].id, result.newAtoms[1].id].sort().join(':')}`,
    a: result.newAtoms[0].id,
    b: result.newAtoms[1].id,
    order: 2,
    kind: 'normal',
    origin: 'explicit',
  });
});
