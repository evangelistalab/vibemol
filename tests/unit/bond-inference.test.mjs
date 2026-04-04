import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateInContext, loadGlobalModule } from './load-global-module.mjs';

function createThreeStub() {
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    clone() {
      return new Vector3(this.x, this.y, this.z);
    }
    add(v) {
      this.x += v.x;
      this.y += v.y;
      this.z += v.z;
      return this;
    }
    sub(v) {
      this.x -= v.x;
      this.y -= v.y;
      this.z -= v.z;
      return this;
    }
    multiplyScalar(s) {
      this.x *= s;
      this.y *= s;
      this.z *= s;
      return this;
    }
    addScaledVector(v, s) {
      this.x += v.x * s;
      this.y += v.y * s;
      this.z += v.z * s;
      return this;
    }
    dot(v) {
      return this.x * v.x + this.y * v.y + this.z * v.z;
    }
    crossVectors(a, b) {
      const x = a.y * b.z - a.z * b.y;
      const y = a.z * b.x - a.x * b.z;
      const z = a.x * b.y - a.y * b.x;
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    lengthSq() {
      return this.x * this.x + this.y * this.y + this.z * this.z;
    }
    length() {
      return Math.sqrt(this.lengthSq());
    }
    normalize() {
      const len = this.length();
      if (len > 1e-12) this.multiplyScalar(1 / len);
      return this;
    }
    distanceTo(v) {
      const dx = this.x - v.x;
      const dy = this.y - v.y;
      const dz = this.z - v.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  }
  return { Vector3 };
}

function loadBondInference() {
  return loadGlobalModule('assets/app/js/bond-inference.js', {
    globals: {
      THREE: createThreeStub(),
      ATOM_Z_TO_DATA: {
        1: { radius_covalent: 0.31 },
        5: { radius_covalent: 0.84 },
        6: { radius_covalent: 0.76 },
        7: { radius_covalent: 0.71 },
        8: { radius_covalent: 0.66 },
        9: { radius_covalent: 0.57 },
        14: { radius_covalent: 1.11 },
        15: { radius_covalent: 1.07 },
        16: { radius_covalent: 1.05 },
        17: { radius_covalent: 1.02 },
        26: { radius_covalent: 1.24 },
        35: { radius_covalent: 1.20 },
        53: { radius_covalent: 1.39 },
      },
    },
  });
}

test('bond perception accepts shortest candidates first under coordination caps', () => {
  const context = loadBondInference();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const V3 = THREE.Vector3;
    const atoms = [
      { id: 'c', Z: 6, pos: new V3(0, 0, 0) },
      { id: 'h1', Z: 1, pos: new V3(0.95, 0, 0) },
      { id: 'h2', Z: 1, pos: new V3(-0.95, 0, 0) },
      { id: 'h3', Z: 1, pos: new V3(0, 0.96, 0) },
      { id: 'h4', Z: 1, pos: new V3(0, -0.97, 0) },
      { id: 'h5', Z: 1, pos: new V3(0, 0, 1.08) },
    ];
    return window.VibeMolBondInference.perceiveBondConnectivity(atoms).map((edge) => ({
      i: edge.i,
      j: edge.j,
      len: Number(edge.len.toFixed(2)),
      order: edge.order,
    }));
  })())`));

  assert.equal(result.length, 4);
  assert.deepEqual(result.map((edge) => edge.j), [1, 2, 3, 4]);
  assert.deepEqual(result.map((edge) => edge.order), [1, 1, 1, 1]);
});

test('bond perception skips unsupported metal pairs by default', () => {
  const context = loadBondInference();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const V3 = THREE.Vector3;
    const atoms = [
      { Z: 26, pos: new V3(0, 0, 0) },
      { Z: 1, pos: new V3(1.2, 0, 0) },
    ];
    return {
      raw: window.VibeMolBondInference.collectRawBondCandidates(atoms).length,
      accepted: window.VibeMolBondInference.perceiveBondConnectivity(atoms).length,
    };
  })())`));

  assert.equal(result.raw, 0);
  assert.equal(result.accepted, 0);
});

test('persistent perceived bonds remain single-order only', () => {
  const context = loadBondInference();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const V3 = THREE.Vector3;
    const atoms = [
      { Z: 8, pos: new V3(-1.2, 0, 0) },
      { Z: 6, pos: new V3(0, 0, 0) },
      { Z: 8, pos: new V3(1.2, 0, 0) },
    ];
    return window.VibeMolBondInference.perceiveBondConnectivity(atoms).map((edge) => ({
      order: edge.order,
      maxOrder: edge.maxOrder,
    }));
  })())`));

  assert.deepEqual(result, [
    { order: 1, maxOrder: 1 },
    { order: 1, maxOrder: 1 },
  ]);
});

test('cleanup diff distinguishes additions, removable perceived bonds, and explicit warnings', () => {
  const context = loadBondInference();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const V3 = THREE.Vector3;
    const vol = {
      atoms: [
        { id: 'a1', Z: 6, x: 0, y: 0, z: 0 },
        { id: 'a2', Z: 6, x: 1.4, y: 0, z: 0 },
        { id: 'a3', Z: 6, x: 2.8, y: 0, z: 0 },
        { id: 'a4', Z: 6, x: 7.0, y: 0, z: 0 },
      ],
      bonds: [
        { id: 'bond:a1:a2', a: 'a1', b: 'a2', order: 1, kind: 'normal', origin: 'perceived' },
        { id: 'bond:a1:a3', a: 'a1', b: 'a3', order: 2, kind: 'normal', origin: 'explicit' },
        { id: 'bond:a3:a4', a: 'a3', b: 'a4', order: 1, kind: 'normal', origin: 'perceived' },
      ],
    };
    const atomPositions = [
      { Z: 6, pos: new V3(0, 0, 0) },
      { Z: 6, pos: new V3(1.4, 0, 0) },
      { Z: 6, pos: new V3(2.8, 0, 0) },
      { Z: 6, pos: new V3(7.0, 0, 0) },
    ];
    const diff = window.VibeMolBondInference.classifyBondCleanupDiff(vol, atomPositions);
    return {
      additions: diff.additions.map((bond) => String(bond.a) + '-' + String(bond.b)),
      removable: diff.removable.map((bond) => String(bond.a) + '-' + String(bond.b)),
      warnings: diff.warnings.map((bond) => String(bond.a) + '-' + String(bond.b)),
    };
  })())`));

  assert.deepEqual(result.additions, ['a2-a3']);
  assert.deepEqual(result.removable, ['a3-a4']);
  assert.deepEqual(result.warnings, ['a1-a3']);
});

test('aromatic six-ring display normalization still works from a single-order graph', () => {
  const context = loadBondInference();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const V3 = THREE.Vector3;
    const atoms = [];
    for (let k = 0; k < 6; k++) {
      const angle = (Math.PI * 2 * k) / 6;
      atoms.push({ Z: 6, pos: new V3(Math.cos(angle) * 1.4, Math.sin(angle) * 1.4, 0) });
    }
    const edges = atoms.map((_, i) => ({
      i,
      j: (i + 1) % 6,
      len: atoms[i].pos.distanceTo(atoms[(i + 1) % 6].pos),
      order: 1,
      maxOrder: 2,
    }));
    const rings = window.VibeMolBondInference.inferAromaticSixRings(atoms, edges);
    return {
      ringCount: rings.length,
      orders: edges.map((edge) => edge.order),
    };
  })())`));

  assert.equal(result.ringCount, 1);
  const joined = result.orders.join(',');
  assert.ok(joined === '1,2,1,2,1,2' || joined === '2,1,2,1,2,1');
});
