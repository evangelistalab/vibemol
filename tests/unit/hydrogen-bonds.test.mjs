import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';

const { VibeMolStructureCore: S, VibeMolBondInference: I, THREE } = loadGlobalModules([
  'assets/vendor/js/three.min.js', 'assets/vendor/js/atomic-data.js',
  'assets/app/js/structure.js', 'assets/app/js/bond-inference.js',
]);
const atoms = () => [
  { id: 'h', Z: 1, x: 0, y: 0, z: 0 }, { id: 'c', Z: 6, x: 1.1, y: 0, z: 0 },
  { id: 'fe', Z: 26, x: -1.6, y: 0, z: 0 }, { id: 'h2', Z: 1, x: 0, y: 0.74, z: 0 },
];

test('hydrogen mutators enforce order one and one neighbor for every bond style', () => {
  for (const style of ['covalent', 'metal-strong', 'metal-dative']) {
    const vol = { atoms: atoms(), bonds: [] };
    assert.equal(S.upsertVolumeBond(vol, 'h', 'c', 4, 'normal', 'explicit', style), 'created');
    assert.equal(vol.bonds[0].order, 1);
    assert.equal(S.upsertVolumeBond(vol, 'h', 'fe', 1, 'normal', 'explicit', style), null);
    assert.equal(S.upsertVolumeBond(vol, 'h2', 'h', 1), null, 'the occupied second endpoint also blocks creation');
    assert.match(S.getHydrogenBondError(vol, 'h', 'c', 3), /single bond/);
    assert.match(S.getHydrogenBondError(vol, 'h', 'fe', 1), /one atom/);
    assert.equal(S.upsertVolumeBond(vol, 'h', 'c', 1, 'blocked'), 'updated');
    assert.equal(S.upsertVolumeBond(vol, 'h', 'fe', 1, 'normal', 'explicit', style), 'created');
    assert.equal(S.upsertVolumeBond(vol, 'h', 'c', 1), null, 'blocked pairs cannot bypass the neighbor restriction');
    assert.equal(S.upsertVolumeBond(vol, 'missing', 'c', 1), null);
  }
});

test('legacy/imported hydrogen topology keeps explicit bonds then the nearest neighbor', () => {
  const vol = { atoms: atoms(), bonds: [
    { a: 0, b: 1, order: 3, origin: 'perceived' },
    { a: 'h', b: 'fe', order: 2, origin: 'explicit', style: 'metal-strong' },
    { a: 'h', b: 'h2', kind: 'blocked' },
    { a: 'c', b: 'fe', order: 4 },
  ] };
  S.ensureVolumeSchema(vol);
  assert.equal(vol.bonds.length, 3);
  assert.equal(vol.bonds[0].b, 'fe'); assert.equal(vol.bonds[0].order, 1);
  assert.equal(vol.bonds[1].kind, 'blocked'); assert.equal(vol.bonds[2].order, 4);
  const before = JSON.stringify(vol);
  S.ensureVolumeSchema(vol); assert.equal(JSON.stringify(vol), before, 'normalization is idempotent');
  vol.bonds = [{ a: 'h', b: 'fe' }, { a: 'h', b: 'c' }, { a: 'h', b: 'h2' }];
  S.ensureVolumeSchema(vol);
  assert.equal(vol.bonds.length, 1); assert.equal(vol.bonds[0].b, 'h2');
});

test('changing an atom to hydrogen and inferred-schema imports obey the same rule', () => {
  const vol = { atoms: atoms(), bonds: [{ a: 'c', b: 'fe', order: 3 }, { a: 'c', b: 'h2', order: 2 }] };
  vol.atoms[1].Z = 1;
  S.ensureVolumeSchema(vol);
  assert.equal(vol.bonds.length, 1); assert.equal(vol.bonds[0].order, 1);
  const imported = { atoms: atoms() };
  S.ensureVolumeSchema(imported, { inferBonds: v => { v.bonds = [{ a: 0, b: 1, order: 4 }, { a: 0, b: 2 }]; } });
  assert.equal(imported.bonds.length, 1); assert.equal(imported.bonds[0].order, 1);
});

test('covalent and metal inference share hydrogen capacity, including H2', () => {
  for (const source of [atoms().slice(0, 3), atoms()]) {
    const records = source.map(a => ({ Z: a.Z, pos: new THREE.Vector3(a.x, a.y, a.z) }));
    const edges = I.perceiveBondConnectivity(records);
    for (let i = 0; i < records.length; i++) {
      if (records[i].Z !== 1) continue;
      const attached = edges.filter(e => e.i === i || e.j === i);
      assert.ok(attached.length <= 1);
      assert.ok(attached.every(e => e.order === 1));
    }
  }
  const h2 = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.74, 0, 0)].map(pos => ({ Z: 1, pos }));
  const edges = I.perceiveBondConnectivity(h2);
  assert.equal(edges.length, 1);
  edges[0].order = 3;
  I.inferBondOrders(h2, edges);
  assert.equal(edges[0].order, 1); assert.equal(edges[0].maxOrder, 1);
});
