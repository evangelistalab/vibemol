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
        6: { radius_covalent: 0.76 },
        7: { radius_covalent: 0.71 },
        8: { radius_covalent: 0.66 },
      },
    },
  });
}

test('bond inference collects simple covalent candidates', () => {
  const context = loadBondInference();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const V3 = THREE.Vector3;
    const atoms = [
      { Z: 6, pos: new V3(0, 0, 0) },
      { Z: 6, pos: new V3(1.4, 0, 0) },
      { Z: 1, pos: new V3(5.0, 0, 0) },
    ];
    return window.VibeMolBondInference.collectBondCandidates(atoms);
  })())`));

  assert.equal(result.length, 1);
  assert.equal(result[0].i, 0);
  assert.equal(result[0].j, 1);
  assert.equal(result[0].order, 1);
  assert.equal(result[0].maxOrder, 4);
});

test('bond inference promotes valence-compatible double bonds', () => {
  const context = loadBondInference();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const V3 = THREE.Vector3;
    const atoms = [
      { Z: 8, pos: new V3(-1.2, 0, 0) },
      { Z: 6, pos: new V3(0, 0, 0) },
      { Z: 8, pos: new V3(1.2, 0, 0) },
    ];
    const edges = window.VibeMolBondInference.collectBondCandidates(atoms);
    window.VibeMolBondInference.inferBondOrders(atoms, edges);
    return edges.map((edge) => edge.order);
  })())`));

  assert.deepEqual(result, [2, 2]);
});

test('bond inference normalizes aromatic six-rings to alternating order', () => {
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
      radius: rings[0] ? Number(rings[0].radius.toFixed(3)) : null,
    };
  })())`));

  assert.equal(result.ringCount, 1);
  const joined = result.orders.join(',');
  assert.ok(joined === '1,2,1,2,1,2' || joined === '2,1,2,1,2,1');
  assert.equal(result.radius, 0.784);
});
