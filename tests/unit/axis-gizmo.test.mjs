import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';
const { THREE, VibeMolAxisGizmo: gizmo } = loadGlobalModules(['assets/vendor/js/three.min.js', 'assets/app/js/axis-gizmo.js']);

test('all six axis ends stay within the gizmo and remain opposite about its center', () => {
  const views = [new THREE.Quaternion()];
  for (let i = 0; i < 300; i++) views.push(new THREE.Quaternion().setFromEuler(new THREE.Euler(i * .73, i * .47, i * .37)));
  for (const size of [88, 96, 112, 144]) for (const q of views) {
    const nodes = gizmo.projectEndpoints(THREE, q, size);
    assert.equal(new Set(nodes.map(n => n.axis + n.sign)).size, 6);
    nodes.forEach(n => {
      assert.ok(n.x >= 14 && n.x <= size - 14 && n.y >= 14 && n.y <= size - 14, JSON.stringify(n));
      const opposite = nodes.find(other => other.axis === n.axis && other.sign !== n.sign);
      assert.ok(Math.abs(n.x + opposite.x - size) < 1e-9);
      assert.ok(Math.abs(n.y + opposite.y - size) < 1e-9);
    });
  }
});

test('head-on endpoints overlap without displacement and move continuously through alignment', () => {
  const nodes = gizmo.projectEndpoints(THREE, new THREE.Quaternion(), 144);
  const end = (axis, sign) => nodes.find(n => n.axis === axis && n.sign === sign);
  assert.ok(end('x', 1).x > end('x', -1).x);
  assert.ok(end('y', 1).y < end('y', -1).y);
  assert.equal(end('z', 1).depth, 1); assert.equal(end('z', -1).depth, -1);
  assert.equal(end('z', 1).x, 72); assert.equal(end('z', 1).y, 72);
  assert.equal(end('z', -1).x, 72); assert.equal(end('z', -1).y, 72);
  for (const angle of [-1e-4, 1e-4]) {
    const rotated = gizmo.projectEndpoints(THREE, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle), 144);
    nodes.forEach((n, i) => assert.ok(Math.hypot(n.x - rotated[i].x, n.y - rotated[i].y) < .01));
  }
});
