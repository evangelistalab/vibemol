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
        nextVol.bonds = [{ a: 'atom-1', b: 'atom-2', order: 1, kind: 'normal' }];
      },
    });
    return {
      inferCalls,
      bonds: window.VibeMolStructureCore.cloneBondSnapshot(vol),
    };
  })())`));

  assert.equal(result.inferCalls, 1);
  assert.deepEqual(result.bonds, [
    { id: 'bond:atom-1:atom-2', a: 'atom-1', b: 'atom-2', order: 1, kind: 'normal' },
  ]);
});
