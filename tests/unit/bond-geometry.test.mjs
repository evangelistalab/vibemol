import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';

const { THREE, VibeMolBondGeometry: B } = loadGlobalModules([
  'assets/vendor/js/three.min.js', 'assets/app/js/bond-geometry.js',
]);

test('bond fit uses the outer rim, with size-dependent double and triple maxima', () => {
  for (const order of [1, 2, 3, 4]) {
    for (const radiusA of [0.003, 0.05, 0.462, 0.499, 1.5]) {
      const radiusB = radiusA * 1.31;
      for (const radius of [0.01, 0.105, 0.14, 0.64]) {
        const fit = B.fitBond({ radius, radiusA, radiusB, order, widthSegments: 64, heightSegments: 40 });
        const factor = order === 1 ? 1 : order === 2 ? 2.05 : 3.1;
        assert.ok(Math.abs(fit.maxRadius - fit.fitA / factor) < 1e-12);
        assert.ok(fit.radius <= radius && fit.radius > 0);
        for (const [u, v] of B.componentOffsets(order)) {
          const d = Math.hypot(u, v) * fit.spacing;
          for (const [R, t] of [[fit.fitA, fit.trimA], [fit.fitB, fit.trimB]]) {
            // Check every point around the cap, including the offending outer rim.
            for (let i = 0; i < 360; i++) {
              const angle = i * Math.PI / 180;
              const extent = Math.hypot(t, d + fit.radius * Math.cos(angle), fit.radius * Math.sin(angle));
              assert.ok(extent <= R + 1e-12, `order ${order}: cap must be fully inside both atoms`);
            }
          }
        }
        const tooThick = fit.maxRadius * 1.001;
        assert.ok(factor * tooThick > fit.fitA, 'no axial insertion can hide a bundle above the limit');
      }
    }
  }
});

test('sphere fit radius lies behind every actual triangulated sphere face', () => {
  for (const [w, h] of [[3, 2], [7, 5], [12, 8], [36, 24], [64, 40]]) {
    const g = new THREE.SphereGeometry(1, w, h), p = g.getAttribute('position'), index = g.index;
    const safeRadius = B.sphereFitRadius(1, w, h);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(p, index.getX(i)); b.fromBufferAttribute(p, index.getX(i + 1)); c.fromBufferAttribute(p, index.getX(i + 2));
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      assert.ok(Math.abs(normal.dot(a)) >= safeRadius, 'analytic safety bound must account for mesh facets');
    }
    g.dispose();
  }
});

test('joint radii and decorative shells are included in the fit', () => {
  for (const order of [1, 2, 3, 4]) {
    const fit = B.fitBond({ radius: 0.64, collarRadius: 0.35, radiusA: 0.03, radiusB: 0.06, order,
      outlineWidth: 0.04, outlineFraction: 0.2, highlightScale: 1.03 });
    const outer = Math.max(...B.componentOffsets(order).map(([u, v]) => Math.hypot(u, v) * fit.spacing)) + fit.rimRadius;
    assert.ok(Math.hypot(outer, fit.trimA) <= fit.fitA + 1e-12);
    assert.ok(Math.hypot(outer, fit.trimB) <= fit.fitB + 1e-12);
    assert.ok(fit.collarRadius < fit.radius);
  }
});

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
