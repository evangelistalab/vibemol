(function () {
  'use strict';

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

  /**
   * Normalize one optional xyz direction vector into unit-length array form.
   * @param {*} raw
   * @returns {[number,number,number]|null}
   */
  function normalizeDirectionVector(raw) {
    const arr = Array.isArray(raw) ? raw : [];
    if (arr.length < 3) return null;
    const x = Number(arr[0]);
    const y = Number(arr[1]);
    const z = Number(arr[2]);
    if (![x, y, z].every(Number.isFinite)) return null;
    const norm = Math.hypot(x, y, z);
    if (!(norm > 1e-10)) return null;
    return [x / norm, y / norm, z / norm];
  }

  /**
   * Convert one atom token (symbol or atomic number) to atomic number.
   * @param {*} token
   * @returns {number}
   */
  function atomTokenToZ(token) {
    const raw = String(token == null ? '' : token).trim();
    if (!raw) return 0;
    if (/^[+-]?\d+$/.test(raw)) {
      const z = Number(raw);
      return Number.isInteger(z) && z > 0 ? z : 0;
    }
    const cleaned = raw.replace(/[^a-z]/gi, '');
    if (!cleaned) return 0;
    const symbol = cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
    const map = (typeof window !== 'undefined' && window.ATOM_SYMBOL_TO_Z) ? window.ATOM_SYMBOL_TO_Z : null;
    if (!map) return 0;
    const z = map[symbol.toUpperCase()];
    return Number.isInteger(z) && z > 0 ? z : 0;
  }

  /**
   * Parse one fragment XYZ payload.
   * @param {string} text
   * @param {string} sourceLabel
   * @returns {Array<{Z:number,x:number,y:number,z:number}>}
   */
  function parseFragmentXyzText(text, sourceLabel) {
    const lines = String(text == null ? '' : text).replace(/\r/g, '\n').split('\n');
    const first = (lines[0] || '').trim();
    const natoms = Number.parseInt(first, 10);
    if (!Number.isInteger(natoms) || natoms <= 0) {
      throw new Error(`invalid XYZ atom count in "${sourceLabel}"`);
    }
    const atomLines = lines.slice(2).map((ln) => ln.trim()).filter(Boolean);
    if (atomLines.length < natoms) {
      throw new Error(`XYZ atom count mismatch in "${sourceLabel}" (expected ${natoms}, got ${atomLines.length})`);
    }
    const atoms = [];
    for (let i = 0; i < natoms; i++) {
      const row = atomLines[i];
      const parts = row.split(/\s+/);
      if (parts.length < 4) throw new Error(`malformed XYZ row ${i + 1} in "${sourceLabel}"`);
      const z = atomTokenToZ(parts[0]);
      const x = Number(parts[1]);
      const y = Number(parts[2]);
      const zc = Number(parts[3]);
      if (!Number.isInteger(z) || z <= 0) throw new Error(`invalid atom token "${parts[0]}" in "${sourceLabel}" row ${i + 1}`);
      if (![x, y, zc].every(Number.isFinite)) throw new Error(`invalid coordinates in "${sourceLabel}" row ${i + 1}`);
      atoms.push({ Z: z, x, y, z: zc });
    }
    return atoms;
  }

  /**
   * Resolve one possibly-relative file path against a base URL.
   * @param {string} rel
   * @param {string} base
   * @returns {string}
   */
  function resolveAgainstBaseUrl(rel, base) {
    const target = String(rel || '').trim();
    if (!target) return '';
    try {
      return new URL(target, base || (typeof location !== 'undefined' ? location.href : undefined)).toString();
    } catch {
      return target;
    }
  }

  /**
   * Build one immutable fragment record from loose input.
   * @param {*} raw
   * @returns {{id:string,name:string,formula:string,tags:string[],atoms:Array<{Z:number,x:number,y:number,z:number}>,bonds:Array<{i:number,j:number,order:number}>,connectionAtomIndex:number,preferredBondOrder:number,linkBondDirection?:[number,number,number]}|null}
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
      bonds.push({ i, j, order: Math.max(1, Math.min(4, Number.isFinite(order) ? Math.round(order) : 1)) });
    }

    const connectionAtomIndexRaw = Number(raw.connectionAtomIndex);
    const connectionAtomIndex = Number.isInteger(connectionAtomIndexRaw)
      ? Math.max(0, Math.min(atoms.length - 1, connectionAtomIndexRaw))
      : 0;
    const preferredBondOrderRaw = Number(raw.preferredBondOrder);
    const preferredBondOrder = Number.isFinite(preferredBondOrderRaw)
      ? Math.max(1, Math.min(4, Math.round(preferredBondOrderRaw)))
      : 1;
    const linkBondDirection = normalizeDirectionVector(raw.linkBondDirection || raw.linkDirection || raw.connectionDirection);

    const formula = String(raw.formula || '').trim() || inferFormulaFromAtoms(atoms);
    const tags = Array.isArray(raw.tags)
      ? raw.tags.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean)
      : [];

    const normalized = {
      id,
      name,
      formula,
      tags: Object.freeze(tags),
      atoms: Object.freeze(atoms.map((a) => Object.freeze({ ...a }))),
      bonds: Object.freeze(bonds.map((b) => Object.freeze({ ...b }))),
      connectionAtomIndex,
      preferredBondOrder,
    };
    if (linkBondDirection) normalized.linkBondDirection = Object.freeze(linkBondDirection.slice(0, 3));
    return Object.freeze(normalized);
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

  const FRAGMENT_LIBRARY = [];
  const FRAGMENT_BY_ID = new Map();

  /**
   * Replace the active fragment catalog and rebuild lookup map in-place.
   * @param {Array<*>} records
   */
  function replaceFragmentLibrary(records) {
    const normalized = (Array.isArray(records) ? records : [])
      .map(normalizeFragmentRecord)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
    FRAGMENT_LIBRARY.splice(0, FRAGMENT_LIBRARY.length, ...normalized);
    FRAGMENT_BY_ID.clear();
    for (const fragment of FRAGMENT_LIBRARY) FRAGMENT_BY_ID.set(fragment.id, fragment);
  }

  /**
   * Reset fragment catalog to built-in defaults.
   * @returns {{ok:boolean,count:number,source:string}}
   */
  function resetFragmentLibraryToBuiltins() {
    replaceFragmentLibrary(RAW_LIBRARY);
    return { ok: true, count: FRAGMENT_LIBRARY.length, source: 'builtins' };
  }

  /**
   * Resolve one free-form query to the best matching fragment.
   * @param {*} query
   * @returns {{id:string,name:string,formula:string,tags:string[],atoms:Array<{Z:number,x:number,y:number,z:number}>,bonds:Array<{i:number,j:number,order:number}>,connectionAtomIndex:number,preferredBondOrder:number,linkBondDirection?:[number,number,number]}|null}
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
   * @returns {{id:string,name:string,formula:string,tags:string[],atoms:Array<{Z:number,x:number,y:number,z:number}>,bonds:Array<{i:number,j:number,order:number}>,connectionAtomIndex:number,preferredBondOrder:number,linkBondDirection?:[number,number,number]}|null}
   */
  function getFragmentById(id) {
    const key = String(id == null ? '' : id).trim().toLowerCase();
    if (!key) return null;
    return FRAGMENT_BY_ID.get(key) || null;
  }

  /**
   * Deep-clone a fragment payload for mutable placement operations.
   * @param {*} fragmentId
   * @returns {{id:string,name:string,formula:string,tags:string[],atoms:Array<{Z:number,x:number,y:number,z:number}>,bonds:Array<{i:number,j:number,order:number}>,connectionAtomIndex:number,preferredBondOrder:number,linkBondDirection?:[number,number,number]}|null}
   */
  function buildFragmentInstance(fragmentId) {
    const src = getFragmentById(fragmentId);
    if (!src) return null;
    const instance = {
      id: src.id,
      name: src.name,
      formula: src.formula,
      tags: Array.isArray(src.tags) ? src.tags.slice() : [],
      atoms: src.atoms.map((a) => ({ Z: a.Z | 0, x: Number(a.x), y: Number(a.y), z: Number(a.z) })),
      bonds: src.bonds.map((b) => ({ i: b.i | 0, j: b.j | 0, order: Math.max(1, Math.min(4, b.order | 0)) })),
      connectionAtomIndex: Math.max(0, Math.min(src.atoms.length - 1, src.connectionAtomIndex | 0)),
      preferredBondOrder: Math.max(1, Math.min(4, src.preferredBondOrder | 0)),
    };
    if (Array.isArray(src.linkBondDirection) && src.linkBondDirection.length >= 3) {
      instance.linkBondDirection = [
        Number(src.linkBondDirection[0]) || 0,
        Number(src.linkBondDirection[1]) || 0,
        Number(src.linkBondDirection[2]) || 0,
      ];
    }
    return instance;
  }

  /**
   * Load one external fragment manifest with XYZ-backed atoms.
   * Manifest shape: { fragments:[{ id,name,xyz,bonds,... }] }.
   * @param {string} manifestUrl
   * @returns {Promise<{ok:boolean,count:number,source:string,errors:string[]}>}
   */
  async function loadFragmentLibraryFromManifest(manifestUrl = './assets/fragments/library.json') {
    const url = String(manifestUrl || '').trim() || './assets/fragments/library.json';
    let response;
    try {
      response = await fetch(url, { cache: 'no-store' });
    } catch (error) {
      throw new Error(`fragment manifest fetch failed (${url}): ${error && error.message ? error.message : String(error)}`);
    }
    if (!response || !response.ok) {
      const status = response ? `${response.status} ${response.statusText}`.trim() : 'no response';
      throw new Error(`fragment manifest fetch failed (${url}): ${status}`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error(`fragment manifest JSON parse failed (${url}): ${error && error.message ? error.message : String(error)}`);
    }

    const fragments = Array.isArray(payload)
      ? payload
      : (payload && Array.isArray(payload.fragments) ? payload.fragments : []);
    if (!fragments.length) throw new Error(`fragment manifest "${url}" does not contain any fragments`);

    const normalizedBaseUrl = response.url || resolveAgainstBaseUrl(url, (typeof location !== 'undefined' ? location.href : ''));
    const hydrated = [];
    const errors = [];
    for (const raw of fragments) {
      if (!raw || typeof raw !== 'object') continue;
      const item = { ...raw };
      try {
        if ((!Array.isArray(item.atoms) || item.atoms.length === 0) && item.xyz) {
          const xyzUrl = resolveAgainstBaseUrl(item.xyz, normalizedBaseUrl);
          const xyzResp = await fetch(xyzUrl, { cache: 'no-store' });
          if (!xyzResp || !xyzResp.ok) {
            const status = xyzResp ? `${xyzResp.status} ${xyzResp.statusText}`.trim() : 'no response';
            throw new Error(`xyz fetch failed (${item.xyz}): ${status}`);
          }
          const xyzText = await xyzResp.text();
          item.atoms = parseFragmentXyzText(xyzText, item.xyz || item.id || item.name || 'fragment.xyz');
        }
        hydrated.push(item);
      } catch (error) {
        const id = String(item.id || item.name || item.xyz || 'unknown');
        errors.push(`${id}: ${error && error.message ? error.message : String(error)}`);
      }
    }

    replaceFragmentLibrary(hydrated);
    if (FRAGMENT_LIBRARY.length === 0) {
      throw new Error(`no valid fragment records found in "${url}"${errors.length ? ` (${errors[0]})` : ''}`);
    }
    return {
      ok: true,
      count: FRAGMENT_LIBRARY.length,
      source: normalizedBaseUrl || url,
      errors,
    };
  }

  resetFragmentLibraryToBuiltins();

  window.VibeMolFragments = Object.freeze({
    FRAGMENT_LIBRARY,
    resolveFragmentQuery,
    getFragmentById,
    buildFragmentInstance,
    loadFragmentLibraryFromManifest,
    resetFragmentLibraryToBuiltins,
  });
})();
