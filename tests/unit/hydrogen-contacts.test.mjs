import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';
const { VibeMolHydrogenBonds: H, THREE } = loadGlobalModules(['assets/vendor/js/three.min.js', 'assets/app/js/hydrogen-bonds.js']);
const atom = (Z, x, y = 0, z = 0, formalCharge = 0) => ({ Z, pos: new THREE.Vector3(x, y, z), formalCharge });
const edge = (i, j, order = 1, style = 'covalent') => ({ i, j, order, style });
const water = () => [atom(8, 0), atom(1, 1), atom(8, 2.8), atom(1, 3.15, .9), atom(1, -.3, .9), atom(1, 3.15, -.9)];
const waterEdges = [edge(0, 1), edge(0, 4), edge(2, 3), edge(2, 5)];

test('explicit water dimer yields one directed contact without changing chemical bonds', () => {
  const atoms = water(), before = JSON.stringify([atoms, waterEdges]);
  const contacts = H.inferContacts(atoms, waterEdges);
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].donor, 0); assert.equal(contacts[0].hydrogen, 1); assert.equal(contacts[0].acceptor, 2);
  assert.ok(Math.abs(contacts[0].distance - 1.8) < 1e-12);
  assert.equal(contacts[0].angle, 180);
  assert.equal(JSON.stringify([atoms, waterEdges]), before);
});

test('distance, direction, overlap and stretched donor limits reject false contacts', () => {
  const accept = (x, y = 0) => H.inferContacts([atom(8, 0), atom(1, 1), atom(8, x, y)], [edge(0, 1)]).length;
  assert.equal(accept(3.5), 1); assert.equal(accept(3.5001), 0);
  assert.equal(accept(2.1999), 0); assert.equal(accept(1, 2), 0); assert.equal(accept(-1), 0);
  const angle = 120 * Math.PI / 180;
  assert.equal(accept(1 - 2 * Math.cos(angle), 2 * Math.sin(angle)), 1);
  assert.equal(accept(1 - 2 * Math.cos(angle - .001), 2 * Math.sin(angle - .001)), 0);
  assert.equal(H.inferContacts([atom(8, 0), atom(1, 1.5), atom(8, 3.2)], [edge(0, 1)]).length, 0);
});

test('hydrogen must have exactly one covalent heteroatom donor; nearby heteroatoms alone are insufficient', () => {
  for (const z of [1, 6, 11, 26]) assert.equal(H.inferContacts([atom(z, 0), atom(1, 1), atom(8, 2.8)], [edge(0, 1)]).length, 0);
  for (const edges of [[], [edge(0, 1, 2)], [edge(0, 1, 1, 'metal-dative')], [edge(0, 1), edge(1, 2)], [edge(0, 1), edge(0, 2)]]) {
    assert.equal(H.inferContacts([atom(8, 0), atom(1, 1), atom(8, 2.8)], edges).length, 0);
  }
  for (const z of [7, 8, 9, 16]) assert.equal(H.inferContacts([atom(z, 0), atom(1, 1), atom(8, 2.8)], [edge(0, 1)]).length, 1);
});

test('charged/saturated nitrogen, amides, pyrrole, organic fluorine and acid OH are not acceptors', () => {
  const base = [atom(8, 0), atom(1, 1)];
  const check = (tail, edges) => H.inferContacts([...base, ...tail], [edge(0, 1), ...edges]).filter(c => c.acceptor === 2).length;
  assert.equal(check([atom(7, 2.8, 0, 0, 1)], []), 0);
  assert.equal(check([atom(7, 2.8), atom(6, 4), atom(8, 5)], [edge(2, 3), edge(3, 4, 2)]), 0);
  assert.equal(check([atom(7, 2.8), ...[1, 2, 3, 4].map(i => atom(6, 4, i))], [3, 4, 5, 6].map(j => edge(2, j))), 0);
  assert.equal(check([atom(9, 2.8), atom(6, 4)], [edge(2, 3)]), 0);
  assert.equal(check([atom(8, 2.8), atom(1, 3.8), atom(6, 4), atom(8, 5)], [edge(2, 3), edge(2, 4), edge(4, 5, 2)]), 0);
  const ringAtoms = [atom(7, 2.8), ...[1, 2, 3, 4].map(i => atom(6, 4, i)), atom(1, 3.7)];
  assert.equal(check(ringAtoms, [edge(2, 3), edge(3, 4, 2), edge(4, 5), edge(5, 6, 2), edge(6, 2), edge(2, 7)]), 0);
  // Pyridine-like N and aniline-like amine remain acceptors.
  assert.equal(check([atom(7, 2.8), atom(6, 4), atom(6, 4, 1)], [edge(2, 3), edge(2, 4, 2)]), 1);
  assert.equal(check([atom(7, 2.8), atom(6, 4), atom(6, 5), atom(1, 3.5, .5), atom(1, 3.5, -.5)], [edge(2, 3), edge(3, 4, 2), edge(2, 5), edge(2, 6)]), 1);
});

test('spatial cells handle negative coordinates, multiple acceptors and invalid points', () => {
  const atoms = water().map(a => ({ ...a, pos: a.pos.clone().addScalar(-100) }));
  assert.equal(H.inferContacts(atoms, waterEdges).length, 1);
  atoms.push(atom(8, -97.2, -99.8, -100), atom(8, NaN), atom(8, Infinity));
  assert.equal(H.inferContacts(atoms, waterEdges).length, 2);
  assert.equal(H.inferContacts(Array.from({ length: 2000 }, (_, i) => atom(i % 2 ? 11 : 17, i)), []).length, 0);
});

test('dashed graphics reuse buffers, disappear/reappear after motion, and cannot be picked as chemical bonds', () => {
  const atoms = water(), group = new THREE.Group(), mat = new THREE.MeshBasicMaterial();
  H.updateGraphics(THREE, group, atoms, waterEdges, mat);
  const mesh = group.children[0], capacity = mesh.instanceMatrix.count;
  assert.ok(mesh.count > 1 && mesh.count <= capacity); assert.equal(mesh.userData.contacts.length, 1);
  const hits = []; mesh.raycast({}, hits); assert.equal(hits.length, 0);
  mesh.computeBoundingBox(); mesh.computeBoundingSphere();
  atoms[2].pos.x = 10;
  H.updateGraphics(THREE, group, atoms, waterEdges, mat);
  assert.equal(group.children[0], mesh); assert.equal(mesh.count, 0); assert.equal(mesh.visible, false);
  assert.equal(mesh.boundingBox, null); assert.equal(mesh.boundingSphere, null);
  atoms[2].pos.x = 2.8;
  H.updateGraphics(THREE, group, atoms, waterEdges, mat);
  assert.equal(group.children[0], mesh); assert.equal(mesh.visible, true);
  const blank = new THREE.Group(); atoms[2].pos.x = 10;
  H.updateGraphics(THREE, blank, atoms, waterEdges, mat);
  assert.equal(blank.children.length, 1, 'empty graphics retain the update path');
});
