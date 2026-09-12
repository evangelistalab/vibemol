import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';

const { THREE, VibeMolBondGeometry: B } = loadGlobalModules([
  'assets/vendor/js/three.min.js', 'assets/app/js/bond-geometry.js',
]);

function checkClosedCylinder(geometry, length) {
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  const indices = geometry.index ? Array.from(geometry.index.array) : Array.from({length:positions.count}, (_, i) => i);
  const point = i => [positions.getX(i), positions.getY(i), positions.getZ(i)].map(n => Math.round(n * 1e6)).join(',');
  const edges = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = indices.slice(i, i + 3);
    const ys = triangle.map(j => positions.getY(j));
    // End caps are allowed only at the two outer ends, never at the color seam.
    if (Math.max(...ys) - Math.min(...ys) < 1e-8) assert.ok(Math.abs(Math.abs(ys[0]) - length / 2) < 1e-6);
    for (let k = 0; k < 3; k++) {
      const edge = [point(triangle[k]), point(triangle[(k + 1) % 3])].sort().join('|');
      edges.set(edge, (edges.get(edge) || 0) + 1);
    }
  }
  assert.ok([...edges.values()].every(count => count === 2), 'every geometric edge belongs to exactly two triangles');
  for (let i = 0; i < positions.count; i++) {
    if (Math.abs(positions.getY(i)) < 1e-8) {
      assert.ok(Math.abs(normals.getY(i)) < 1e-8, 'the middle ring keeps cylinder-side normals');
      assert.ok(Math.abs(normals.getX(i) ** 2 + normals.getZ(i) ** 2 - 1) < 1e-6);
    }
  }
}

test('uniform bonds use one closed indexed cylinder without a color seam', () => {
  for (const segments of [16,20,36]) {
    const g = B.createCylinder(THREE,0.1,2.5,segments,1);
    assert.ok(g.index); assert.equal(g.getAttribute('color'),undefined);
    checkClosedCylinder(g,2.5); g.dispose();
  }
});

test('element-colored cylinders are watertight with a sharp, uncapped midpoint', () => {
  const a = new THREE.Color('#ff0000'), b = new THREE.Color('#0000ff');
  for (const rings of [1,2,3,8]) {
    const g = B.createCylinder(THREE,0.1,2.5,20,rings,a,b);
    checkClosedCylinder(g,2.5);
    const p = g.getAttribute('position'), color = g.getAttribute('color');
    let lower = 0, upper = 0;
    for (let i = 0; i < p.count; i += 3) {
      const expected = p.getY(i) + p.getY(i+1) + p.getY(i+2) > 0 ? b : a;
      if (expected === a) lower++; else upper++;
      for (let j = i; j < i+3; j++) {
        assert.equal(color.getX(j),expected.r); assert.equal(color.getZ(j),expected.b);
      }
    }
    assert.ok(lower && upper); g.dispose();
  }
});

test('equal rendered endpoint colors retain indexed geometry regardless of atomic identity', () => {
  const a = new THREE.Color('#505050');
  const g = B.createCylinder(THREE,0.1,2.5,16,2,a,a.clone());
  assert.ok(g.index); checkClosedCylinder(g,2.5);
  const c = g.getAttribute('color');
  assert.ok(Array.from(c.array).every(value => Math.abs(value-a.r) < 1e-7)); g.dispose();
});
