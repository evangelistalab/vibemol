(function () {
  'use strict';

  /**
   * Build one immutable fragment record from loose input.
   * @param {*} raw
   * @returns {{id:string,name:string,formula:string,tags:string[],atoms:Array<{Z:number,x:number,y:number,z:number}>,bonds:Array<{i:number,j:number,order:number}>,connectionAtomIndex:number,preferredBondOrder:number}|null}
   */
  function normalizeFragmentRecord(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim().toLowerCase();
    const name = String(raw.name || '').trim();
    if (!id || !name) return null;

    const atomsIn = Array.isArray(raw.atoms) ? raw.atoms : [];
    if (atomsIn.length === 0) return null;
    const atoms = [];
    for (const a of atomsIn) {
      const z = Number(a && a.Z);
      const x = Number(a && a.x);
      const y = Number(a && a.y);
      const zc = Number(a && a.z);
      if (!Number.isFinite(z) || z <= 0) return null;
      if (![x, y, zc].every(Number.isFinite)) return null;
      atoms.push({ Z: Math.round(z), x, y, z: zc });
    }

    const bondsIn = Array.isArray(raw.bonds) ? raw.bonds : [];
    const bonds = [];
    for (const b of bondsIn) {
      const i = Number(b && b.i);
      const j = Number(b && b.j);
      const order = Number(b && b.order);
      if (!Number.isInteger(i) || !Number.isInteger(j)) continue;
      if (i < 0 || j < 0 || i >= atoms.length || j >= atoms.length || i === j) continue;
      bonds.push({ i, j, order: Math.max(1, Math.min(3, Number.isFinite(order) ? Math.round(order) : 1)) });
    }

    const connectionAtomIndexRaw = Number(raw.connectionAtomIndex);
    const connectionAtomIndex = Number.isInteger(connectionAtomIndexRaw)
      ? Math.max(0, Math.min(atoms.length - 1, connectionAtomIndexRaw))
      : 0;
    const preferredBondOrderRaw = Number(raw.preferredBondOrder);
    const preferredBondOrder = Number.isFinite(preferredBondOrderRaw)
      ? Math.max(1, Math.min(3, Math.round(preferredBondOrderRaw)))
      : 1;

    const formula = String(raw.formula || '').trim() || inferFormulaFromAtoms(atoms);
    const tags = Array.isArray(raw.tags)
      ? raw.tags.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean)
      : [];

    return Object.freeze({
      id,
      name,
      formula,
      tags: Object.freeze(tags),
      atoms: Object.freeze(atoms.map((a) => Object.freeze({ ...a }))),
      bonds: Object.freeze(bonds.map((b) => Object.freeze({ ...b }))),
      connectionAtomIndex,
      preferredBondOrder,
    });
  }

  /**
   * Infer a compact formula string from fragment atom list.
   * @param {Array<{Z:number}>} atoms
   * @returns {string}
   */
  function inferFormulaFromAtoms(atoms) {
    const counts = new Map();
    for (const a of atoms) {
      const z = Number(a && a.Z) | 0;
      if (z <= 0) continue;
      counts.set(z, (counts.get(z) || 0) + 1);
    }
    const order = [6, 1, 7, 8, 15, 16, 9, 17, 35, 53];
    const keys = Array.from(counts.keys()).sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a - b;
    });
    const symbol = (z) => {
      const data = (typeof window !== 'undefined' && window.ATOM_Z_TO_DATA)
        ? window.ATOM_Z_TO_DATA[z]
        : null;
      return data && data.symbol ? String(data.symbol) : `Z${z}`;
    };
    return keys.map((z) => `${symbol(z)}${counts.get(z) > 1 ? counts.get(z) : ''}`).join('');
  }

  const RAW_LIBRARY = [
    {
      id: 'methyl',
      name: 'Methyl',
      formula: 'CH3',
      tags: ['alkyl', 'organic', 'starter'],
      atoms: [
        { Z: 6, x: 0.0, y: 0.0, z: 0.0 },
        { Z: 1, x: 0.63, y: 0.63, z: 0.63 },
        { Z: 1, x: 0.63, y: -0.63, z: -0.63 },
        { Z: 1, x: 0.63, y: -0.63, z: 0.63 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 0, j: 2, order: 1 },
        { i: 0, j: 3, order: 1 },
      ],
      connectionAtomIndex: 0,
      preferredBondOrder: 1,
    },
    {
      id: 'methylene',
      name: 'Methylene',
      formula: 'CH2',
      tags: ['alkyl', 'organic', 'starter'],
      atoms: [
        { Z: 6, x: 0.0, y: 0.0, z: 0.0 },
        { Z: 1, x: 0.70, y: 0.60, z: 0.0 },
        { Z: 1, x: 0.70, y: -0.60, z: 0.0 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 0, j: 2, order: 1 },
      ],
      connectionAtomIndex: 0,
      preferredBondOrder: 1,
    },
    {
      id: 'hydroxyl',
      name: 'Hydroxyl',
      formula: 'OH',
      tags: ['oxygen', 'organic', 'starter'],
      atoms: [
        { Z: 8, x: 0.0, y: 0.0, z: 0.0 },
        { Z: 1, x: 0.94, y: 0.0, z: 0.0 },
      ],
      bonds: [{ i: 0, j: 1, order: 1 }],
      connectionAtomIndex: 0,
      preferredBondOrder: 1,
    },
    {
      id: 'amino',
      name: 'Amino',
      formula: 'NH2',
      tags: ['nitrogen', 'organic', 'starter'],
      atoms: [
        { Z: 7, x: 0.0, y: 0.0, z: 0.0 },
        { Z: 1, x: 0.84, y: 0.58, z: 0.0 },
        { Z: 1, x: 0.84, y: -0.58, z: 0.0 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 0, j: 2, order: 1 },
      ],
      connectionAtomIndex: 0,
      preferredBondOrder: 1,
    },
    {
      id: 'carbonyl',
      name: 'Carbonyl',
      formula: 'CO',
      tags: ['oxygen', 'double-bond', 'organic', 'starter'],
      atoms: [
        { Z: 6, x: 0.0, y: 0.0, z: 0.0 },
        { Z: 8, x: 1.23, y: 0.0, z: 0.0 },
      ],
      bonds: [{ i: 0, j: 1, order: 2 }],
      connectionAtomIndex: 0,
      preferredBondOrder: 1,
    },
    {
      id: 'amide',
      name: 'Amide',
      formula: 'CONH2',
      tags: ['amide', 'organic', 'starter'],
      atoms: [
        { Z: 6, x: 0.0, y: 0.0, z: 0.0 },
        { Z: 8, x: 1.23, y: 0.0, z: 0.0 },
        { Z: 7, x: -1.32, y: 0.0, z: 0.0 },
        { Z: 1, x: -1.92, y: 0.74, z: 0.0 },
        { Z: 1, x: -1.92, y: -0.74, z: 0.0 },
      ],
      bonds: [
        { i: 0, j: 1, order: 2 },
        { i: 0, j: 2, order: 1 },
        { i: 2, j: 3, order: 1 },
        { i: 2, j: 4, order: 1 },
      ],
      connectionAtomIndex: 0,
      preferredBondOrder: 1,
    },
    {
      id: 'phenyl',
      name: 'Phenyl',
      formula: 'C6H5',
      tags: ['aryl', 'ring', 'organic', 'starter'],
      atoms: [
        { Z: 6, x: 1.40, y: 0.0, z: 0.0 },
        { Z: 6, x: 0.70, y: 1.212, z: 0.0 },
        { Z: 6, x: -0.70, y: 1.212, z: 0.0 },
        { Z: 6, x: -1.40, y: 0.0, z: 0.0 },
        { Z: 6, x: -0.70, y: -1.212, z: 0.0 },
        { Z: 6, x: 0.70, y: -1.212, z: 0.0 },
        { Z: 1, x: 1.24, y: 2.150, z: 0.0 },
        { Z: 1, x: -1.24, y: 2.150, z: 0.0 },
        { Z: 1, x: -2.48, y: 0.0, z: 0.0 },
        { Z: 1, x: -1.24, y: -2.150, z: 0.0 },
        { Z: 1, x: 1.24, y: -2.150, z: 0.0 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 1, j: 2, order: 2 },
        { i: 2, j: 3, order: 1 },
        { i: 3, j: 4, order: 2 },
        { i: 4, j: 5, order: 1 },
        { i: 5, j: 0, order: 2 },
        { i: 1, j: 6, order: 1 },
        { i: 2, j: 7, order: 1 },
        { i: 3, j: 8, order: 1 },
        { i: 4, j: 9, order: 1 },
        { i: 5, j: 10, order: 1 },
      ],
      connectionAtomIndex: 0,
      preferredBondOrder: 1,
    },
    {
      id: 'pyridine',
      name: 'Pyridine',
      formula: 'C5H5N',
      tags: ['heteroaromatic', 'ring', 'organic', 'starter'],
      atoms: [
        { Z: 6, x: 1.40, y: 0.0, z: 0.0 },
        { Z: 7, x: 0.70, y: 1.212, z: 0.0 },
        { Z: 6, x: -0.70, y: 1.212, z: 0.0 },
        { Z: 6, x: -1.40, y: 0.0, z: 0.0 },
        { Z: 6, x: -0.70, y: -1.212, z: 0.0 },
        { Z: 6, x: 0.70, y: -1.212, z: 0.0 },
        { Z: 1, x: -1.24, y: 2.150, z: 0.0 },
        { Z: 1, x: -2.48, y: 0.0, z: 0.0 },
        { Z: 1, x: -1.24, y: -2.150, z: 0.0 },
        { Z: 1, x: 1.24, y: -2.150, z: 0.0 },
        { Z: 1, x: 2.48, y: 0.0, z: 0.0 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 1, j: 2, order: 2 },
        { i: 2, j: 3, order: 1 },
        { i: 3, j: 4, order: 2 },
        { i: 4, j: 5, order: 1 },
        { i: 5, j: 0, order: 2 },
        { i: 2, j: 6, order: 1 },
        { i: 3, j: 7, order: 1 },
        { i: 4, j: 8, order: 1 },
        { i: 5, j: 9, order: 1 },
        { i: 0, j: 10, order: 1 },
      ],
      connectionAtomIndex: 0,
      preferredBondOrder: 1,
    },
    {
      id: 'benzene',
      name: 'Benzene',
      formula: 'C6H6',
      tags: ['aromatic', 'ring', 'organic', 'starter'],
      atoms: [
        { Z: 6, x: 1.40, y: 0.0, z: 0.0 },
        { Z: 6, x: 0.70, y: 1.212, z: 0.0 },
        { Z: 6, x: -0.70, y: 1.212, z: 0.0 },
        { Z: 6, x: -1.40, y: 0.0, z: 0.0 },
        { Z: 6, x: -0.70, y: -1.212, z: 0.0 },
        { Z: 6, x: 0.70, y: -1.212, z: 0.0 },
        { Z: 1, x: 2.48, y: 0.0, z: 0.0 },
        { Z: 1, x: 1.24, y: 2.150, z: 0.0 },
        { Z: 1, x: -1.24, y: 2.150, z: 0.0 },
        { Z: 1, x: -2.48, y: 0.0, z: 0.0 },
        { Z: 1, x: -1.24, y: -2.150, z: 0.0 },
        { Z: 1, x: 1.24, y: -2.150, z: 0.0 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 1, j: 2, order: 2 },
        { i: 2, j: 3, order: 1 },
        { i: 3, j: 4, order: 2 },
        { i: 4, j: 5, order: 1 },
        { i: 5, j: 0, order: 2 },
        { i: 0, j: 6, order: 1 },
        { i: 1, j: 7, order: 1 },
        { i: 2, j: 8, order: 1 },
        { i: 3, j: 9, order: 1 },
        { i: 4, j: 10, order: 1 },
        { i: 5, j: 11, order: 1 },
      ],
      connectionAtomIndex: 0,
      preferredBondOrder: 1,
    },
    {
      id: 'cyclohexane',
      name: 'Cyclohexane',
      formula: 'C6H12',
      tags: ['ring', 'alkane', 'organic', 'starter'],
      atoms: [
        { Z: 6, x: 1.53, y: 0.0, z: 0.35 },
        { Z: 6, x: 0.77, y: 1.33, z: -0.35 },
        { Z: 6, x: -0.77, y: 1.33, z: 0.35 },
        { Z: 6, x: -1.53, y: 0.0, z: -0.35 },
        { Z: 6, x: -0.77, y: -1.33, z: 0.35 },
        { Z: 6, x: 0.77, y: -1.33, z: -0.35 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 1, j: 2, order: 1 },
        { i: 2, j: 3, order: 1 },
        { i: 3, j: 4, order: 1 },
        { i: 4, j: 5, order: 1 },
        { i: 5, j: 0, order: 1 },
      ],
      connectionAtomIndex: 0,
      preferredBondOrder: 1,
    },
  ];

  const FRAGMENT_LIBRARY = Object.freeze(
    RAW_LIBRARY
      .map(normalizeFragmentRecord)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  const FRAGMENT_BY_ID = new Map(FRAGMENT_LIBRARY.map((f) => [f.id, f]));

  /**
   * Resolve one free-form query to the best matching fragment.
   * @param {*} query
   * @returns {{id:string,name:string,formula:string,tags:string[],atoms:Array<{Z:number,x:number,y:number,z:number}>,bonds:Array<{i:number,j:number,order:number}>,connectionAtomIndex:number,preferredBondOrder:number}|null}
   */
  function resolveFragmentQuery(query) {
    const raw = String(query == null ? '' : query).trim();
    if (!raw) return null;
    const q = raw.toLowerCase();

    const bracketMatch = q.match(/\[([a-z0-9_-]+)\]\s*$/i);
    if (bracketMatch && FRAGMENT_BY_ID.has(bracketMatch[1])) return FRAGMENT_BY_ID.get(bracketMatch[1]);

    if (FRAGMENT_BY_ID.has(q)) return FRAGMENT_BY_ID.get(q);

    for (const f of FRAGMENT_LIBRARY) {
      if (f.name.toLowerCase() === q) return f;
      if (f.formula.toLowerCase() === q) return f;
      if (q.includes(`[${f.id}]`)) return f;
    }

    for (const f of FRAGMENT_LIBRARY) {
      if (f.name.toLowerCase().startsWith(q)) return f;
      if (f.id.startsWith(q)) return f;
      if (f.formula.toLowerCase().startsWith(q)) return f;
    }

    for (const f of FRAGMENT_LIBRARY) {
      if (f.tags.some((tag) => tag.includes(q))) return f;
      if (f.name.toLowerCase().includes(q)) return f;
      if (f.formula.toLowerCase().includes(q)) return f;
    }

    return null;
  }

  /**
   * Fetch one fragment by canonical id.
   * @param {*} id
   * @returns {{id:string,name:string,formula:string,tags:string[],atoms:Array<{Z:number,x:number,y:number,z:number}>,bonds:Array<{i:number,j:number,order:number}>,connectionAtomIndex:number,preferredBondOrder:number}|null}
   */
  function getFragmentById(id) {
    const key = String(id == null ? '' : id).trim().toLowerCase();
    if (!key) return null;
    return FRAGMENT_BY_ID.get(key) || null;
  }

  /**
   * Deep-clone a fragment payload for mutable placement operations.
   * @param {*} fragmentId
   * @returns {{id:string,name:string,formula:string,tags:string[],atoms:Array<{Z:number,x:number,y:number,z:number}>,bonds:Array<{i:number,j:number,order:number}>,connectionAtomIndex:number,preferredBondOrder:number}|null}
   */
  function buildFragmentInstance(fragmentId) {
    const src = getFragmentById(fragmentId);
    if (!src) return null;
    return {
      id: src.id,
      name: src.name,
      formula: src.formula,
      tags: Array.isArray(src.tags) ? src.tags.slice() : [],
      atoms: src.atoms.map((a) => ({ Z: a.Z | 0, x: Number(a.x), y: Number(a.y), z: Number(a.z) })),
      bonds: src.bonds.map((b) => ({ i: b.i | 0, j: b.j | 0, order: Math.max(1, Math.min(3, b.order | 0)) })),
      connectionAtomIndex: Math.max(0, Math.min(src.atoms.length - 1, src.connectionAtomIndex | 0)),
      preferredBondOrder: Math.max(1, Math.min(3, src.preferredBondOrder | 0)),
    };
  }

  window.VibeMolFragments = Object.freeze({
    FRAGMENT_LIBRARY,
    resolveFragmentQuery,
    getFragmentById,
    buildFragmentInstance,
  });
})();
