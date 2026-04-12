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
        1: { symbol: 'H', radius_covalent: 0.31 },
        5: { symbol: 'B', radius_covalent: 0.84 },
        6: { symbol: 'C', radius_covalent: 0.76 },
        7: { symbol: 'N', radius_covalent: 0.71 },
        8: { symbol: 'O', radius_covalent: 0.66 },
        9: { symbol: 'F', radius_covalent: 0.57 },
        14: { symbol: 'Si', radius_covalent: 1.11 },
        15: { symbol: 'P', radius_covalent: 1.07 },
        16: { symbol: 'S', radius_covalent: 1.05 },
        17: { symbol: 'Cl', radius_covalent: 1.02 },
        26: { symbol: 'Fe', radius_covalent: 1.24 },
        35: { symbol: 'Br', radius_covalent: 1.20 },
        53: { symbol: 'I', radius_covalent: 1.39 },
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

test('metal-ligand perception classifies strong, dative, and absent contacts', () => {
  const context = loadBondInference();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const V3 = THREE.Vector3;
    const atoms = [
      { Z: 26, pos: new V3(0, 0, 0) },
      { Z: 7, pos: new V3(1.95, 0, 0) },
      { Z: 7, pos: new V3(0, 2.50, 0) },
      { Z: 7, pos: new V3(0, 0, 3.05) },
    ];
    return window.VibeMolBondInference.perceiveBondConnectivity(atoms).map((edge) => ({
      i: edge.i,
      j: edge.j,
      style: edge.style,
    }));
  })())`));

  assert.deepEqual(result, [
    { i: 0, j: 1, style: 'metal-strong' },
    { i: 0, j: 2, style: 'metal-dative' },
  ]);
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

test('metal coordination caps accept nearest candidates first', () => {
  const context = loadBondInference();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const V3 = THREE.Vector3;
    const atoms = [{ Z: 26, pos: new V3(0, 0, 0) }];
    const positions = [
      [1.90, 0.00, 0.00],
      [-1.94, 0.00, 0.00],
      [0.00, 1.98, 0.00],
      [0.00, -2.02, 0.00],
      [0.00, 0.00, 2.06],
      [0.00, 0.00, -2.10],
      [2.14, 2.14, 2.14],
    ];
    positions.forEach((coords) => {
      atoms.push({ Z: 7, pos: new V3(coords[0], coords[1], coords[2]) });
    });
    return window.VibeMolBondInference.perceiveBondConnectivity(atoms).map((edge) => ({
      j: edge.j,
      style: edge.style,
    }));
  })())`));

  assert.equal(result.length, 6);
  assert.deepEqual(result.map((edge) => edge.j), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(result.map((edge) => edge.style), [
    'metal-strong',
    'metal-strong',
    'metal-strong',
    'metal-strong',
    'metal-dative',
    'metal-dative',
  ]);
});

test('metal-metal perception emits dedicated metal-metal style', () => {
  const context = loadBondInference();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const V3 = THREE.Vector3;
    const atoms = [
      { Z: 26, pos: new V3(0, 0, 0) },
      { Z: 26, pos: new V3(2.80, 0, 0) },
    ];
    return window.VibeMolBondInference.perceiveBondConnectivity(atoms);
  })())`));

  assert.equal(result.length, 1);
  assert.equal(result[0].style, 'metal-metal');
});

test('metal bond overrides can force covalent, dative, or none', () => {
  const context = loadBondInference();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const V3 = THREE.Vector3;
    const basePair = [
      { Z: 26, pos: new V3(0, 0, 0) },
      { Z: 7, pos: new V3(2.55, 0, 0) },
    ];
    const forceCovalent = basePair.map((atom, index) => index === 0 ? { ...atom, metalBondMode: 'force_covalent' } : atom);
    const forceDative = basePair.map((atom, index) => index === 0 ? { ...atom, metalBondMode: 'force_dative' } : atom);
    const noBonds = basePair.map((atom, index) => index === 0 ? { ...atom, metalBondMode: 'no_bonds' } : atom);
    return {
      forceCovalent: window.VibeMolBondInference.perceiveBondConnectivity(forceCovalent).map((edge) => edge.style),
      forceDative: window.VibeMolBondInference.perceiveBondConnectivity(forceDative).map((edge) => edge.style),
      noBonds: window.VibeMolBondInference.perceiveBondConnectivity(noBonds).map((edge) => edge.style),
    };
  })())`));

  assert.deepEqual(result.forceCovalent, []);
  assert.deepEqual(result.forceDative, ['metal-dative']);
  assert.deepEqual(result.noBonds, []);
});

test('bond-order promotion can infer imported carbonyl-style doubles from connectivity', () => {
  const context = loadBondInference();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const V3 = THREE.Vector3;
    const atoms = [
      { Z: 8, pos: new V3(-1.16, 0, 0) },
      { Z: 6, pos: new V3(0, 0, 0) },
      { Z: 8, pos: new V3(1.16, 0, 0) },
    ];
    const edges = window.VibeMolBondInference.perceiveBondConnectivity(atoms);
    window.VibeMolBondInference.inferBondOrders(atoms, edges);
    return edges.map((edge) => ({
      order: edge.order,
      maxOrder: edge.maxOrder,
    }));
  })())`));

  assert.deepEqual(result, [
    { order: 2, maxOrder: 2 },
    { order: 2, maxOrder: 2 },
  ]);
});

test('bond-order promotion can infer imported carbon-carbon triples from connectivity', () => {
  const context = loadBondInference();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const V3 = THREE.Vector3;
    const atoms = [
      { Z: 6, pos: new V3(0, 0, 0) },
      { Z: 1, pos: new V3(0, 1.06, 0) },
      { Z: 6, pos: new V3(1.20, 0, 0) },
      { Z: 6, pos: new V3(2.62, 0, 0) },
    ];
    const edges = window.VibeMolBondInference.perceiveBondConnectivity(atoms);
    window.VibeMolBondInference.inferBondOrders(atoms, edges);
    return edges.map((edge) => ({
      i: edge.i,
      j: edge.j,
      order: edge.order,
      maxOrder: edge.maxOrder,
    }));
  })())`));

  assert.deepEqual(result, [
    { i: 0, j: 1, order: 1, maxOrder: 1 },
    { i: 0, j: 2, order: 3, maxOrder: 4 },
    { i: 2, j: 3, order: 1, maxOrder: 4 },
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

test('cleanup diff suppresses blocked metal pairs and carries perceived styles', () => {
  const context = loadBondInference();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const V3 = THREE.Vector3;
    const vol = {
      atoms: [
        { id: 'fe', Z: 26, x: 0, y: 0, z: 0 },
        { id: 'n1', Z: 7, x: 2.0, y: 0, z: 0 },
        { id: 'n2', Z: 7, x: 0, y: 2.5, z: 0 },
      ],
      bonds: [
        { id: 'bond:fe:n1', a: 'fe', b: 'n1', order: 1, kind: 'blocked', origin: 'explicit' },
      ],
    };
    const atomPositions = [
      { Z: 26, pos: new V3(0, 0, 0) },
      { Z: 7, pos: new V3(2.0, 0, 0) },
      { Z: 7, pos: new V3(0, 2.5, 0) },
    ];
    const diff = window.VibeMolBondInference.classifyBondCleanupDiff(vol, atomPositions);
    return {
      additions: diff.additions.map((bond) => ({ a: bond.a, b: bond.b, style: bond.style })),
      perceived: diff.perceived.map((bond) => ({ a: bond.a, b: bond.b, style: bond.style })),
    };
  })())`));

  assert.deepEqual(result.additions, [
    { a: 'fe', b: 'n2', style: 'metal-dative' },
  ]);
  assert.deepEqual(result.perceived, [
    { a: 'fe', b: 'n1', style: 'metal-strong' },
    { a: 'fe', b: 'n2', style: 'metal-dative' },
  ]);
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
