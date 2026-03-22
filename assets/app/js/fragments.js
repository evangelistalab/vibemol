(function () {
  'use strict';

  /**
   * Infer a compact formula string from one atom list.
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
   * Normalize one catalog kind.
   * @param {*} raw
   * @returns {'fragment'|'molecule'}
   */
  function normalizeCatalogKind(raw) {
    return String(raw || '').trim().toLowerCase() === 'molecule' ? 'molecule' : 'fragment';
  }

  /**
   * Normalize supported fragment attach modes.
   * @param {*} raw
   * @param {'fragment'|'molecule'} kind
   * @returns {string[]}
   */
  function normalizeAttachModes(raw, kind) {
    if (kind !== 'fragment') return [];
    const out = [];
    const seen = new Set();
    const add = (value) => {
      const key = String(value || '').trim().toLowerCase();
      if (key !== 'append' && key !== 'replace_h' && key !== 'fuse_ring') return;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(key);
    };
    if (Array.isArray(raw)) raw.forEach(add);
    if (!out.length) {
      add('append');
      add('replace_h');
    }
    return out;
  }

  /**
   * Normalize a fuse bond local pair.
   * @param {*} raw
   * @param {number} atomCount
   * @returns {[number,number]|null}
   */
  function normalizeFuseBondLocalPair(raw, atomCount) {
    if (!Array.isArray(raw) || raw.length < 2) return null;
    const a = Number(raw[0]);
    const b = Number(raw[1]);
    if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
    if (a < 0 || b < 0 || a >= atomCount || b >= atomCount || a === b) return null;
    return [a, b];
  }

  /**
   * Build one immutable catalog entry from loose input.
   * @param {*} raw
   * @returns {object|null}
   */
  function normalizeCatalogRecord(raw) {
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

    const kind = normalizeCatalogKind(raw.kind);
    const formula = String(raw.formula || '').trim() || inferFormulaFromAtoms(atoms);
    const tags = Array.isArray(raw.tags)
      ? raw.tags.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean)
      : [];

    const normalized = {
      id,
      kind,
      name,
      formula,
      tags: Object.freeze(tags),
      atoms: Object.freeze(atoms.map((a) => Object.freeze({ ...a }))),
      bonds: Object.freeze(bonds.map((b) => Object.freeze({ ...b }))),
    };

    if (kind === 'fragment') {
      const connectionAtomIndexRaw = Number(raw.connectionAtomIndex);
      normalized.connectionAtomIndex = Number.isInteger(connectionAtomIndexRaw)
        ? Math.max(0, Math.min(atoms.length - 1, connectionAtomIndexRaw))
        : 0;
      const preferredBondOrderRaw = Number(raw.preferredBondOrder);
      normalized.preferredBondOrder = Number.isFinite(preferredBondOrderRaw)
        ? Math.max(1, Math.min(4, Math.round(preferredBondOrderRaw)))
        : 1;
      const linkBondDirection = normalizeDirectionVector(raw.linkBondDirection || raw.linkDirection || raw.connectionDirection);
      if (linkBondDirection) normalized.linkBondDirection = Object.freeze(linkBondDirection.slice(0, 3));
      normalized.attachModes = Object.freeze(normalizeAttachModes(raw.attachModes, kind));
      const fusePair = normalizeFuseBondLocalPair(raw.fuseBondLocalPair, atoms.length);
      if (fusePair && normalized.attachModes.includes('fuse_ring')) {
        normalized.fuseBondLocalPair = Object.freeze(fusePair.slice(0, 2));
      }
    }

    return Object.freeze(normalized);
  }

  const RAW_LIBRARY = [
    {
      id: 'methyl',
      kind: 'fragment',
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
      attachModes: ['append', 'replace_h'],
    },
    {
      id: 'methylene',
      kind: 'fragment',
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
      attachModes: ['append', 'replace_h'],
    },
    {
      id: 'hydroxyl',
      kind: 'fragment',
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
      attachModes: ['append', 'replace_h'],
    },
    {
      id: 'amino',
      kind: 'fragment',
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
      attachModes: ['append', 'replace_h'],
    },
    {
      id: 'carbonyl',
      kind: 'fragment',
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
      attachModes: ['append', 'replace_h'],
    },
    {
      id: 'amide',
      kind: 'fragment',
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
      attachModes: ['append', 'replace_h'],
    },
    {
      id: 'phenyl',
      kind: 'fragment',
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
      attachModes: ['append', 'replace_h'],
    },
    {
      id: 'benzene',
      kind: 'molecule',
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
    },
    {
      id: 'pyridine',
      kind: 'molecule',
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
    },
    {
      id: 'cyclohexane',
      kind: 'molecule',
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
    },
  ];

  const FRAGMENT_LIBRARY = [];
  const FRAGMENT_BY_ID = new Map();

  /**
   * Replace the active catalog and rebuild lookup map in-place.
   * @param {Array<*>} records
   */
  function replaceFragmentLibrary(records) {
    const normalized = (Array.isArray(records) ? records : [])
      .map(normalizeCatalogRecord)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
    FRAGMENT_LIBRARY.splice(0, FRAGMENT_LIBRARY.length, ...normalized);
    FRAGMENT_BY_ID.clear();
    for (const entry of FRAGMENT_LIBRARY) FRAGMENT_BY_ID.set(entry.id, entry);
  }

  /**
   * Reset the active catalog to built-in defaults.
   * @returns {{ok:boolean,count:number,source:string}}
   */
  function resetFragmentLibraryToBuiltins() {
    replaceFragmentLibrary(RAW_LIBRARY);
    return { ok: true, count: FRAGMENT_LIBRARY.length, source: 'builtins' };
  }

  /**
   * Return catalog entries filtered by kind when requested.
   * @param {'fragment'|'molecule'=} kind
   * @returns {Array<object>}
   */
  function getCatalogEntries(kind) {
    const wanted = kind == null ? '' : normalizeCatalogKind(kind);
    if (!wanted) return FRAGMENT_LIBRARY.slice();
    return FRAGMENT_LIBRARY.filter((entry) => entry && entry.kind === wanted);
  }

  /**
   * Resolve one free-form query to the best matching catalog entry.
   * @param {*} query
   * @param {'fragment'|'molecule'=} kind
   * @returns {object|null}
   */
  function resolveCatalogQuery(query, kind) {
    const raw = String(query == null ? '' : query).trim();
    if (!raw) return null;
    const q = raw.toLowerCase();
    const list = getCatalogEntries(kind);
    const byId = new Map(list.map((entry) => [entry.id, entry]));

    const bracketMatch = q.match(/\[([a-z0-9_-]+)\]\s*$/i);
    if (bracketMatch && byId.has(bracketMatch[1])) return byId.get(bracketMatch[1]);
    if (byId.has(q)) return byId.get(q);

    for (const entry of list) {
      if (entry.name.toLowerCase() === q) return entry;
      if (entry.formula.toLowerCase() === q) return entry;
      if (q.includes(`[${entry.id}]`)) return entry;
    }
    for (const entry of list) {
      if (entry.name.toLowerCase().startsWith(q)) return entry;
      if (entry.id.startsWith(q)) return entry;
      if (entry.formula.toLowerCase().startsWith(q)) return entry;
    }
    for (const entry of list) {
      if (entry.tags.some((tag) => tag.includes(q))) return entry;
      if (entry.name.toLowerCase().includes(q)) return entry;
      if (entry.formula.toLowerCase().includes(q)) return entry;
    }
    return null;
  }

  /**
   * Fetch one catalog entry by canonical id.
   * @param {*} id
   * @param {'fragment'|'molecule'=} kind
   * @returns {object|null}
   */
  function getCatalogEntryById(id, kind) {
    const key = String(id == null ? '' : id).trim().toLowerCase();
    if (!key) return null;
    const entry = FRAGMENT_BY_ID.get(key) || null;
    if (!entry) return null;
    if (kind == null) return entry;
    return entry.kind === normalizeCatalogKind(kind) ? entry : null;
  }

  /**
   * Deep-clone one catalog entry for mutable placement operations.
   * @param {*} entryId
   * @param {'fragment'|'molecule'=} kind
   * @returns {object|null}
   */
  function buildCatalogInstance(entryId, kind) {
    const src = getCatalogEntryById(entryId, kind);
    if (!src) return null;
    const instance = {
      id: src.id,
      kind: src.kind,
      name: src.name,
      formula: src.formula,
      tags: Array.isArray(src.tags) ? src.tags.slice() : [],
      atoms: src.atoms.map((a) => ({ Z: a.Z | 0, x: Number(a.x), y: Number(a.y), z: Number(a.z) })),
      bonds: src.bonds.map((b) => ({ i: b.i | 0, j: b.j | 0, order: Math.max(1, Math.min(4, b.order | 0)) })),
    };
    if (src.kind === 'fragment') {
      instance.connectionAtomIndex = Math.max(0, Math.min(src.atoms.length - 1, src.connectionAtomIndex | 0));
      instance.preferredBondOrder = Math.max(1, Math.min(4, src.preferredBondOrder | 0));
      instance.attachModes = Array.isArray(src.attachModes) ? src.attachModes.slice() : ['append', 'replace_h'];
      if (Array.isArray(src.linkBondDirection) && src.linkBondDirection.length >= 3) {
        instance.linkBondDirection = [
          Number(src.linkBondDirection[0]) || 0,
          Number(src.linkBondDirection[1]) || 0,
          Number(src.linkBondDirection[2]) || 0,
        ];
      }
      if (Array.isArray(src.fuseBondLocalPair) && src.fuseBondLocalPair.length >= 2) {
        instance.fuseBondLocalPair = [src.fuseBondLocalPair[0] | 0, src.fuseBondLocalPair[1] | 0];
      }
    }
    return instance;
  }

  /** Backward-compatible alias. */
  function resolveFragmentQuery(query) { return resolveCatalogQuery(query); }
  /** Backward-compatible alias. */
  function getFragmentById(id) { return getCatalogEntryById(id); }
  /** Backward-compatible alias. */
  function buildFragmentInstance(fragmentId) { return buildCatalogInstance(fragmentId); }

  /**
   * Load one external catalog manifest with XYZ-backed atoms.
   * Manifest shape: { entries:[...] } with legacy support for { fragments:[...] }.
   * @param {string} manifestUrl
   * @returns {Promise<{ok:boolean,count:number,source:string,errors:string[]}>}
   */
  async function loadFragmentLibraryFromManifest(manifestUrl = './assets/fragments/library.json') {
    const url = String(manifestUrl || '').trim() || './assets/fragments/library.json';
    const protocol = (typeof location !== 'undefined' && location && typeof location.protocol === 'string')
      ? location.protocol.toLowerCase()
      : '';
    if (protocol === 'file:') {
      resetFragmentLibraryToBuiltins();
      return {
        ok: true,
        count: FRAGMENT_LIBRARY.length,
        source: 'built-in defaults (file:// mode)',
        errors: [],
        skippedExternal: true,
      };
    }
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

    const entries = Array.isArray(payload)
      ? payload
      : (payload && Array.isArray(payload.entries)
        ? payload.entries
        : (payload && Array.isArray(payload.fragments) ? payload.fragments : []));
    if (!entries.length) throw new Error(`fragment manifest "${url}" does not contain any entries`);

    const normalizedBaseUrl = response.url || resolveAgainstBaseUrl(url, (typeof location !== 'undefined' ? location.href : ''));
    const hydrated = [];
    const errors = [];
    for (const raw of entries) {
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
          item.atoms = parseFragmentXyzText(xyzText, item.xyz || item.id || item.name || 'entry.xyz');
        }
        hydrated.push(item);
      } catch (error) {
        const id = String(item.id || item.name || item.xyz || 'unknown');
        errors.push(`${id}: ${error && error.message ? error.message : String(error)}`);
      }
    }

    replaceFragmentLibrary(hydrated);
    if (FRAGMENT_LIBRARY.length === 0) {
      throw new Error(`no valid catalog entries found in "${url}"${errors.length ? ` (${errors[0]})` : ''}`);
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
    getCatalogEntries,
    resolveCatalogQuery,
    getCatalogEntryById,
    buildCatalogInstance,
    resolveFragmentQuery,
    getFragmentById,
    buildFragmentInstance,
    loadFragmentLibraryFromManifest,
    resetFragmentLibraryToBuiltins,
  });
})();
