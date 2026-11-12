import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateInContext, loadGlobalModules } from './load-global-module.mjs';

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
  return loadGlobalModules(['assets/app/js/element-utils.js', 'assets/app/js/bond-inference.js'], {
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

test('bond presence uses covalent and metal distance rules without inferring bond orders', () => {
  const context = loadBondInference();
  const { hasBondCandidates, perceiveBondConnectivity } = context.VibeMolBondInference;
  const atom = (Z, x) => ({ Z, pos: new context.THREE.Vector3(x, 0, 0) });
  const cases = [
    [[], false],
    [[atom(6, 0)], false],
    [[atom(6, 0), atom(1, 1.09)], true],
    [[atom(6, 0), atom(1, 2.06)], false],
    [[atom(6, 0), atom(6, 1.54)], true],
    [[atom(6, 0), atom(6, 2.91)], false],
    [[atom(6, 0), atom(6, 0.2)], false],
    [[atom(6, 0), atom(6, NaN)], false],
    [[atom(26, 0), atom(7, 2.2)], true],
    [[atom(7, 0), atom(26, 2.2)], true],
    [[atom(26, 0), atom(26, 2.6)], true],
    [[atom(26, 0), atom(7, 4.2)], false],
  ];
  for (const [atoms, expected] of cases) {
    assert.equal(hasBondCandidates(atoms), expected);
    assert.equal(perceiveBondConnectivity(atoms).length > 0, expected);
    assert.equal(atoms.some(a => a.bonds), false);
  }
  assert.equal(hasBondCandidates([
    atom(6, 0), atom(1, 1.09), { get pos() { throw new Error('Should stop at the first plausible bond'); } },
  ]), true);
});

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

test('PubChem conjugated rings store a complete Kekulé assignment under atom and edge reordering', () => {
  const { molecules } = JSON.parse(readFileSync(new URL('../fixtures/aromatic-hydrogen.json', import.meta.url)));
  const context = loadGlobalModules([
    'assets/vendor/js/atomic-data.js', 'assets/app/js/element-utils.js', 'assets/app/js/bond-inference.js',
  ], { globals: { THREE: createThreeStub() } });
  const inference = context.VibeMolBondInference;
  const doubleCounts = {
    anthracene: 7, aspirin: 3, benzene: 3, caffeine: 2, furan: 2,
    indole: 4, naphthalene: 5, phenol: 3, pyridine: 3, toluene: 3,
  };
  assert.deepEqual(molecules.map(({ name }) => name).sort(), Object.keys(doubleCounts).sort());
  for (const { name, atoms: rows } of molecules) {
    const original = rows.map(([symbol, ...xyz]) => ({
      Z: context.ATOM_SYMBOL_TO_Z[symbol], pos: new context.THREE.Vector3(...xyz),
    }));
    const staggered = original.filter((_, index) => index % 2 === 0)
      .concat(original.filter((_, index) => index % 2 === 1).reverse());
    for (const [order, atoms] of [original, original.slice().reverse(), staggered].entries()) {
      const edges = inference.perceiveBondConnectivity(atoms);
      if (order === 2) edges.reverse();
      inference.inferBondOrders(atoms, edges);
      const adjacency = inference.buildBondAdjacency(edges, atoms.length);
      const rings = [5, 6].flatMap(size => inference.findSimpleCyclesOfSize(adjacency, size));
      const ringPairs = new Set(rings.flatMap(ring => ring.map((i, k) => (
        inference.getUndirectedPairKey(i, ring[(k + 1) % ring.length])
      ))));
      const valence = atoms.map((_, i) => edges.reduce((sum, edge) => (
        edge.i === i || edge.j === i ? sum + edge.order : sum
      ), 0));
      const actual = {
        doubleCount: edges.filter(({ i, j, order }) => order === 2 && ringPairs.has(inference.getUndirectedPairKey(i, j))).length,
        valence,
      };
      const expected = { doubleCount: doubleCounts[name], valence: atoms.map(({ Z }) => ({ 1: 1, 6: 4, 7: 3, 8: 2 })[Z]) };
      assert.deepEqual(actual, expected, JSON.stringify({ name, order, actual, expected }));
    }
  }
});

test('a planar quinone keeps its exocyclic carbonyls and only two ring double bonds', () => {
  const context = loadBondInference();
  const { perceiveBondConnectivity, inferBondOrders } = context.VibeMolBondInference;
  const atoms = Array.from({ length: 12 }, (_, index) => {
    const i = index % 6;
    const angle = i * Math.PI / 3;
    const terminalOxygen = index >= 6 && (i === 0 || i === 3);
    const radius = index < 6 ? 1.41 : 1.41 + (terminalOxygen ? 1.22 : 1.09);
    return { Z: index < 6 ? 6 : terminalOxygen ? 8 : 1,
      pos: new context.THREE.Vector3(radius * Math.cos(angle), radius * Math.sin(angle), 0) };
  });
  const edges = perceiveBondConnectivity(atoms);
  inferBondOrders(atoms, edges);
  const carbonyls = edges.filter(({ j }) => atoms[j].Z === 8).map(({ order }) => order);
  const ringDoubles = edges.filter(({ j, order }) => j < 6 && order === 2).length;
  assert.deepEqual(Array.from(carbonyls), [2, 2]);
  assert.equal(ringDoubles, 2);
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
