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

    if (kind === 'molecule') {
      const importanceRank = Number(raw.importanceRank);
      if (Number.isInteger(importanceRank) && importanceRank > 0) {
        normalized.importanceRank = importanceRank;
      }
    }

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
        { Z: 1, x: -0.77908798, y: 0.65407176, z: -0.39877123 },
        { Z: 1, x: 0.95598626, y: 0.34767424, z: -0.39876774 },
        { Z: 1, x: -0.17689519, y: -1.00174494, z: -0.39876727 },
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
        { Z: 1, x: -0.28188820, y: -0.86477445, z: -0.30459136 },
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
        { Z: 1, x: -0.41270570, y: 0.85203533, z: -0.35681146 },
        { Z: 1, x: -0.55663861, y: -0.76579238, z: -0.35682509 },
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
        { Z: 8, x: 0.06695037, y: -1.02492994, z: -0.64344281 },
        { Z: 7, x: -0.08346059, y: 1.22004289, z: -0.58886036 },
        { Z: 1, x: -0.09302555, y: 1.26473438, z: -1.59301912 },
        { Z: 1, x: -0.14076702, y: 2.06877895, z: -0.05943815 },
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
        { Z: 6, x: 0.0, y: 0.0, z: 0.0 },
        { Z: 6, x: -0.01180028, y: 1.19421989, z: -0.71493779 },
        { Z: 6, x: -0.04167368, y: 1.19731626, z: -2.10101021 },
        { Z: 6, x: -0.05815597, y: -0.00010468, z: -2.80036117 },
        { Z: 6, x: -0.04223266, y: -1.19749071, z: -2.10089425 },
        { Z: 6, x: -0.01235288, y: -1.19429552, z: -0.71484637 },
        { Z: 1, x: 0.00523249, y: 2.13634918, z: -0.17615192 },
        { Z: 1, x: -0.04809705, y: 2.13956198, z: -2.63736740 },
        { Z: 1, x: -0.07849551, y: -0.00015474, z: -3.88395905 },
        { Z: 1, x: -0.04909643, y: -2.13977412, z: -2.63717772 },
        { Z: 1, x: 0.00424710, y: -2.13639300, z: -0.17598392 },
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
      id: 'ethyl',
      kind: 'fragment',
      name: 'Ethyl',
      formula: 'C2H5',
      tags: ['alkyl', 'organic'],
      atoms: [
        { Z: 6, x: 0.00000000, y: 0.00000000, z: 0.00000000 },
        { Z: 6, x: 0.77689265, y: 1.16679724, z: -0.58593987 },
        { Z: 1, x: 0.42392297, y: -0.94145132, z: -0.36534519 },
        { Z: 1, x: -1.03210366, y: 0.02797669, z: -0.36536933 },
        { Z: 1, x: 0.76622231, y: 1.15147265, z: -1.67826564 },
        { Z: 1, x: 1.82170115, y: 1.14496791, z: -0.26292493 },
        { Z: 1, x: 0.35421209, y: 2.12234447, z: -0.26233330 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 0, j: 2, order: 1 },
        { i: 0, j: 3, order: 1 },
        { i: 1, j: 4, order: 1 },
        { i: 1, j: 5, order: 1 },
        { i: 1, j: 6, order: 1 },
      ],
      connectionAtomIndex: 0,
      preferredBondOrder: 1,
      linkBondDirection: [0, 0, 1],
      attachModes: ['append', 'replace_h'],
    },
    {
      id: 'methoxy',
      kind: 'fragment',
      name: 'Methoxy',
      formula: 'CH3O',
      tags: ['ether', 'oxygen', 'organic'],
      atoms: [
        { Z: 8, x: 0.00000000, y: 0.00000000, z: 0.00000000 },
        { Z: 6, x: -0.72405243, y: -1.07530958, z: -0.52619226 },
        { Z: 1, x: -1.77751657, y: -1.04514750, z: -0.21234717 },
        { Z: 1, x: -0.29991756, y: -2.04008650, z: -0.21232969 },
        { Z: 1, x: -0.67737031, y: -1.00599856, z: -1.61320570 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 1, j: 2, order: 1 },
        { i: 1, j: 3, order: 1 },
        { i: 1, j: 4, order: 1 },
      ],
      connectionAtomIndex: 0,
      preferredBondOrder: 1,
      linkBondDirection: [0, 0, 1],
      attachModes: ['append', 'replace_h'],
    },
    {
      id: 'fluoro',
      kind: 'fragment',
      name: 'Fluoro',
      formula: 'F',
      tags: ['halogen', 'fluorine', 'organic'],
      atoms: [{ Z: 9, x: 0.00000000, y: 0.00000000, z: 0.00000000 }],
      bonds: [],
      connectionAtomIndex: 0,
      preferredBondOrder: 1,
      linkBondDirection: [0, 0, 1],
      attachModes: ['append', 'replace_h'],
    },
    {
      id: 'chloro',
      kind: 'fragment',
      name: 'Chloro',
      formula: 'Cl',
      tags: ['halogen', 'chlorine', 'organic'],
      atoms: [{ Z: 17, x: 0.00000000, y: 0.00000000, z: 0.00000000 }],
      bonds: [],
      connectionAtomIndex: 0,
      preferredBondOrder: 1,
      linkBondDirection: [0, 0, 1],
      attachModes: ['append', 'replace_h'],
    },
    {
      id: 'bromo',
      kind: 'fragment',
      name: 'Bromo',
      formula: 'Br',
      tags: ['halogen', 'bromine', 'organic'],
      atoms: [{ Z: 35, x: 0.00000000, y: 0.00000000, z: 0.00000000 }],
      bonds: [],
      connectionAtomIndex: 0,
      preferredBondOrder: 1,
      linkBondDirection: [0, 0, 1],
      attachModes: ['append', 'replace_h'],
    },
    {
      id: 'cyano',
      kind: 'fragment',
      name: 'Cyano',
      formula: 'CN',
      tags: ['nitrile', 'nitrogen', 'triple-bond', 'organic'],
      atoms: [
        { Z: 6, x: 0.00000000, y: 0.00000000, z: 0.00000000 },
        { Z: 7, x: 0.00000070, y: 0.00000101, z: -1.14898385 },
      ],
      bonds: [{ i: 0, j: 1, order: 3 }],
      connectionAtomIndex: 0,
      preferredBondOrder: 1,
      linkBondDirection: [0, 0, 1],
      attachModes: ['append', 'replace_h'],
    },
    {
      id: 'nitro',
      kind: 'fragment',
      name: 'Nitro',
      formula: 'NO2',
      tags: ['nitro', 'nitrogen', 'oxygen', 'organic'],
      atoms: [
        { Z: 7, x: 0.00000000, y: 0.00000000, z: 0.00000000 },
        { Z: 8, x: -0.02335241, y: -1.07546071, z: -0.55211297 },
        { Z: 8, x: -0.00433585, y: 1.07785522, z: -0.54806545 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 0, j: 2, order: 2 },
      ],
      connectionAtomIndex: 0,
      preferredBondOrder: 1,
      linkBondDirection: [0, 0, 1],
      attachModes: ['append', 'replace_h'],
    },
    {
      id: 'carboxyl',
      kind: 'fragment',
      name: 'Carboxyl',
      formula: 'CHO2',
      tags: ['carboxylic-acid', 'oxygen', 'organic'],
      atoms: [
        { Z: 6, x: 0.00000000, y: 0.00000000, z: 0.00000000 },
        { Z: 8, x: -0.21476872, y: -0.94734662, z: -0.70478975 },
        { Z: 8, x: 0.27703482, y: 1.22054082, z: -0.49625427 },
        { Z: 1, x: 0.25813213, y: 1.13532903, z: -1.45971523 },
      ],
      bonds: [
        { i: 0, j: 1, order: 2 },
        { i: 0, j: 2, order: 1 },
        { i: 2, j: 3, order: 1 },
      ],
      connectionAtomIndex: 0,
      preferredBondOrder: 1,
      linkBondDirection: [0, 0, 1],
      attachModes: ['append', 'replace_h'],
    },
    {
      id: 'isopropyl',
      kind: 'fragment',
      name: 'Isopropyl',
      formula: 'C3H7',
      tags: ['alkyl', 'branched', 'organic'],
      atoms: [
        { Z: 6, x: 0.00000000, y: 0.00000000, z: 0.00000000 },
        { Z: 6, x: 1.41198582, y: -0.15919243, z: -0.54455188 },
        { Z: 6, x: -0.91906685, y: -1.08364112, z: -0.54458446 },
        { Z: 1, x: -0.38493816, y: 0.97082275, z: -0.33789800 },
        { Z: 1, x: 1.83983453, y: -1.11737415, z: -0.23194708 },
        { Z: 1, x: 2.07175552, y: 0.63281950, z: -0.18084237 },
        { Z: 1, x: 1.42391259, y: -0.13157525, z: -1.63723195 },
        { Z: 1, x: -0.57357020, y: -2.07464893, z: -0.23246187 },
        { Z: 1, x: -0.94703854, y: -1.07132795, z: -1.63725120 },
        { Z: 1, x: -1.94222012, y: -0.95942680, z: -0.18046952 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 0, j: 2, order: 1 },
        { i: 0, j: 3, order: 1 },
        { i: 1, j: 4, order: 1 },
        { i: 1, j: 5, order: 1 },
        { i: 1, j: 6, order: 1 },
        { i: 2, j: 7, order: 1 },
        { i: 2, j: 8, order: 1 },
        { i: 2, j: 9, order: 1 },
      ],
      connectionAtomIndex: 0,
      preferredBondOrder: 1,
      linkBondDirection: [0, 0, 1],
      attachModes: ['append', 'replace_h'],
    },
    {
      id: 'tert-butyl',
      kind: 'fragment',
      name: 'tert-Butyl',
      formula: 'C4H9',
      tags: ['alkyl', 'branched', 'organic'],
      atoms: [
        { Z: 6, x: 0.00000000, y: 0.00000000, z: 0.00000000 },
        { Z: 6, x: 0.53349946, y: 1.33615764, z: -0.50882748 },
        { Z: 6, x: -1.42393059, y: -0.20615548, z: -0.50865793 },
        { Z: 6, x: 0.89049438, y: -1.13013379, z: -0.50860418 },
        { Z: 1, x: 0.54471905, y: 1.36412122, z: -1.60209157 },
        { Z: 1, x: 1.55486141, y: 1.51053868, z: -0.15873479 },
        { Z: 1, x: -0.08692278, y: 2.16602924, z: -0.15877833 },
        { Z: 1, x: -1.83231560, y: -1.15841475, z: -0.15853669 },
        { Z: 1, x: -2.08562622, y: 0.59115354, z: -0.15850718 },
        { Z: 1, x: -1.45392683, y: -0.21048554, z: -1.60192289 },
        { Z: 1, x: 1.91932038, y: -1.00769675, z: -0.15835886 },
        { Z: 1, x: 0.90935825, y: -1.15392293, z: -1.60186883 },
        { Z: 1, x: 0.53077446, y: -2.10181845, z: -0.15849285 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 0, j: 2, order: 1 },
        { i: 0, j: 3, order: 1 },
        { i: 1, j: 4, order: 1 },
        { i: 1, j: 5, order: 1 },
        { i: 1, j: 6, order: 1 },
        { i: 2, j: 7, order: 1 },
        { i: 2, j: 8, order: 1 },
        { i: 2, j: 9, order: 1 },
        { i: 3, j: 10, order: 1 },
        { i: 3, j: 11, order: 1 },
        { i: 3, j: 12, order: 1 },
      ],
      connectionAtomIndex: 0,
      preferredBondOrder: 1,
      linkBondDirection: [0, 0, 1],
      attachModes: ['append', 'replace_h'],
    },
    {
      id: 'water',
      kind: 'molecule',
      name: "Water",
      formula: 'H2O',
      importanceRank: 1,
      tags: ['water','inorganic','starter'],
      atoms: [
        { Z: 8, x: 0.00088742, y: 0.00114658, z: 0.00000000 },
        { Z: 1, x: 0.96041523, y: -0.00340532, z: 0.00000000 },
        { Z: 1, x: -0.24408966, y: 0.92888573, z: 0.00000000 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 0, j: 2, order: 1 },
      ],
    },
    {
      id: 'methane',
      kind: 'molecule',
      name: "Methane",
      formula: 'CH4',
      importanceRank: 2,
      tags: ['alkane','organic','starter'],
      atoms: [
        { Z: 6, x: 0.00000000, y: -0.00000001, z: -0.00000013 },
        { Z: 1, x: 0.62907147, y: 0.62907157, z: 0.62907164 },
        { Z: 1, x: -0.62907152, y: -0.62907156, z: 0.62907168 },
        { Z: 1, x: -0.62907159, y: 0.62907168, z: -0.62907157 },
        { Z: 1, x: 0.62907165, y: -0.62907169, z: -0.62907163 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 0, j: 2, order: 1 },
        { i: 0, j: 3, order: 1 },
        { i: 0, j: 4, order: 1 },
      ],
    },
    {
      id: 'ammonia',
      kind: 'molecule',
      name: "Ammonia",
      formula: 'NH3',
      importanceRank: 3,
      tags: ['nitrogen','inorganic','starter'],
      atoms: [
        { Z: 7, x: -0.00000007, y: -0.00000998, z: 0.10549359 },
        { Z: 1, x: 0.00000013, y: 0.94029824, z: -0.26980118 },
        { Z: 1, x: 0.81434132, y: -0.47014404, z: -0.26979622 },
        { Z: 1, x: -0.81434138, y: -0.47014422, z: -0.26979619 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 0, j: 2, order: 1 },
        { i: 0, j: 3, order: 1 },
      ],
    },
    {
      id: 'benzene',
      kind: 'molecule',
      name: "Benzene",
      formula: 'C6H6',
      importanceRank: 4,
      tags: ['aromatic','ring','organic','starter'],
      atoms: [
        { Z: 6, x: 0.00000025, y: -0.00000043, z: -0.01243340 },
        { Z: 6, x: 0.00000097, y: 1.20153435, z: -0.70624825 },
        { Z: 6, x: -0.00000023, y: 1.20153506, z: -2.09375242 },
        { Z: 6, x: 0.00000130, y: -0.00000031, z: -2.78756620 },
        { Z: 6, x: 0.00000110, y: -1.20153468, z: -2.09375191 },
        { Z: 6, x: 0.00000021, y: -1.20153467, z: -0.70624787 },
        { Z: 1, x: 0.00000103, y: 0.00000041, z: 1.07164880 },
        { Z: 1, x: 0.00000043, y: 2.14059169, z: -0.16456710 },
        { Z: 1, x: -0.00000225, y: 2.14059226, z: -2.63543265 },
        { Z: 1, x: -0.00000068, y: -0.00000034, z: -3.87164868 },
        { Z: 1, x: 0.00000148, y: -2.14059153, z: -2.63543331 },
        { Z: 1, x: -0.00000361, y: -2.14059180, z: -0.16456701 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 0, j: 5, order: 2 },
        { i: 0, j: 6, order: 1 },
        { i: 1, j: 2, order: 2 },
        { i: 1, j: 7, order: 1 },
        { i: 2, j: 3, order: 1 },
        { i: 2, j: 8, order: 1 },
        { i: 3, j: 4, order: 2 },
        { i: 3, j: 9, order: 1 },
        { i: 4, j: 5, order: 1 },
        { i: 4, j: 10, order: 1 },
        { i: 5, j: 11, order: 1 },
      ],
    },
    {
      id: 'ethanol',
      kind: 'molecule',
      name: "Ethanol",
      formula: 'C2H6O',
      importanceRank: 5,
      tags: ['alcohol','organic','solvent','starter'],
      atoms: [
        { Z: 6, x: 1.22994669, y: 0.27036458, z: 0.00240080 },
        { Z: 6, x: -0.04876095, y: -0.53874323, z: 0.01763415 },
        { Z: 8, x: -1.20922519, y: 0.26734249, z: -0.00081253 },
        { Z: 1, x: 2.10398500, y: -0.38530286, z: -0.03313283 },
        { Z: 1, x: 1.25646916, y: 0.93103482, z: -0.86660706 },
        { Z: 1, x: 1.31601962, y: 0.88680845, z: 0.90275456 },
        { Z: 1, x: -0.05814680, y: -1.21587887, z: 0.88340229 },
        { Z: 1, x: -0.11257636, y: -1.16227392, z: -0.87717006 },
        { Z: 1, x: -1.18861117, y: 0.84114853, z: 0.76923068 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 0, j: 3, order: 1 },
        { i: 0, j: 4, order: 1 },
        { i: 0, j: 5, order: 1 },
        { i: 1, j: 2, order: 1 },
        { i: 1, j: 6, order: 1 },
        { i: 1, j: 7, order: 1 },
        { i: 2, j: 8, order: 1 },
      ],
    },
    {
      id: 'carbon-dioxide',
      kind: 'molecule',
      name: "Carbon dioxide",
      formula: 'CO2',
      importanceRank: 6,
      tags: ['oxide','inorganic','linear','starter'],
      atoms: [
        { Z: 8, x: -1.15678839, y: 0.00000006, z: -0.00000003 },
        { Z: 8, x: 1.15678842, y: 0.00000006, z: -0.00000003 },
        { Z: 6, x: -0.00000003, y: -0.00000012, z: 0.00000006 },
      ],
      bonds: [
        { i: 0, j: 2, order: 2 },
        { i: 1, j: 2, order: 2 },
      ],
    },
    {
      id: 'methanol',
      kind: 'molecule',
      name: "Methanol",
      formula: 'CH4O',
      importanceRank: 7,
      tags: ['alcohol','organic','solvent','starter'],
      atoms: [
        { Z: 8, x: 0.71012444, y: -0.00005994, z: 0.00001713 },
        { Z: 6, x: -0.69877992, y: -0.01597868, z: -0.00539742 },
        { Z: 1, x: -1.11096116, y: -0.76526761, z: 0.68180909 },
        { Z: 1, x: -1.11093099, y: -0.19384710, z: -1.00643469 },
        { Z: 1, x: -1.03090070, y: 0.96773888, z: 0.32755651 },
        { Z: 1, x: 1.02554833, y: -0.85808556, z: -0.29045061 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 0, j: 5, order: 1 },
        { i: 1, j: 2, order: 1 },
        { i: 1, j: 3, order: 1 },
        { i: 1, j: 4, order: 1 },
      ],
    },
    {
      id: 'ethene',
      kind: 'molecule',
      name: "Ethene",
      formula: 'C2H4',
      importanceRank: 10,
      tags: ['alkene','organic','pi-bond','starter'],
      atoms: [
        { Z: 6, x: -0.66146345, y: 0.00000562, z: -0.00000042 },
        { Z: 6, x: 0.66149633, y: -0.00000647, z: 0.00000052 },
        { Z: 1, x: -1.23098401, y: -0.92041627, z: 0.07014595 },
        { Z: 1, x: -1.23096580, y: 0.92043887, z: -0.07014769 },
        { Z: 1, x: 1.23101585, y: 0.92041579, z: -0.07014567 },
        { Z: 1, x: 1.23100108, y: -0.92043754, z: 0.07014730 },
      ],
      bonds: [
        { i: 0, j: 1, order: 2 },
        { i: 0, j: 2, order: 1 },
        { i: 0, j: 3, order: 1 },
        { i: 1, j: 4, order: 1 },
        { i: 1, j: 5, order: 1 },
      ],
    },
    {
      id: 'ethyne',
      kind: 'molecule',
      name: "Ethyne",
      formula: 'C2H2',
      importanceRank: 11,
      tags: ['alkyne','organic','linear','starter'],
      atoms: [
        { Z: 6, x: -0.59850084, y: -0.00000009, z: -0.00000393 },
        { Z: 6, x: 0.59850097, y: -0.00000009, z: 0.00000359 },
        { Z: 1, x: -1.66317594, y: 0.00000009, z: -0.00009846 },
        { Z: 1, x: 1.66317582, y: 0.00000009, z: 0.00009880 },
      ],
      bonds: [
        { i: 0, j: 1, order: 3 },
        { i: 0, j: 2, order: 1 },
        { i: 1, j: 3, order: 1 },
      ],
    },
    {
      id: 'formaldehyde',
      kind: 'molecule',
      name: "Formaldehyde",
      formula: 'CH2O',
      importanceRank: 12,
      tags: ['carbonyl','organic','benchmark','starter'],
      atoms: [
        { Z: 8, x: 0.59050817, y: -0.00001351, z: -0.00000710 },
        { Z: 6, x: -0.60485845, y: 0.00005032, z: -0.00000009 },
        { Z: 1, x: -1.19281760, y: 0.24467115, z: -0.90754973 },
        { Z: 1, x: -1.19283213, y: -0.24450796, z: 0.90755692 },
      ],
      bonds: [
        { i: 0, j: 1, order: 2 },
        { i: 1, j: 2, order: 1 },
        { i: 1, j: 3, order: 1 },
      ],
    },
    {
      id: 'cyclohexane',
      kind: 'molecule',
      name: "Cyclohexane",
      formula: 'C6H12',
      importanceRank: 13,
      tags: ['ring','alkane','organic','starter'],
      atoms: [
        { Z: 6, x: -0.04330223, y: -1.45183549, z: -0.22901872 },
        { Z: 6, x: 1.23569571, y: -0.76337313, z: 0.22901495 },
        { Z: 6, x: 1.27895514, y: 0.68848795, z: -0.22904877 },
        { Z: 6, x: 0.04325528, y: 1.45185693, z: 0.22915133 },
        { Z: 6, x: -1.23569291, y: 0.76338290, z: -0.22909444 },
        { Z: 6, x: -1.27900517, y: -0.68841480, z: 0.22908007 },
        { Z: 1, x: -0.04518920, y: -1.51369595, z: -1.32478566 },
        { Z: 1, x: -0.07397058, y: -2.48147938, z: 0.14001710 },
        { Z: 1, x: 1.28833810, y: -0.79584187, z: 1.32478239 },
        { Z: 1, x: 2.11201951, y: -1.30480064, z: -0.14004438 },
        { Z: 1, x: 2.18607258, y: 1.17668582, z: 0.13986770 },
        { Z: 1, x: 1.33332095, y: 0.71780055, z: -1.32482237 },
        { Z: 1, x: 0.04509774, y: 1.51334013, z: 1.32494061 },
        { Z: 1, x: 0.07394806, y: 2.48155632, z: -0.13969635 },
        { Z: 1, x: -1.28795706, y: 0.79573147, z: -1.32488831 },
        { Z: 1, x: -2.11210462, y: 1.30488481, z: 0.13962674 },
        { Z: 1, x: -2.18606388, y: -1.17672452, z: -0.13983440 },
        { Z: 1, x: -1.33341744, y: -0.71766110, z: 1.32485249 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 0, j: 5, order: 1 },
        { i: 0, j: 6, order: 1 },
        { i: 0, j: 7, order: 1 },
        { i: 1, j: 2, order: 1 },
        { i: 1, j: 8, order: 1 },
        { i: 1, j: 9, order: 1 },
        { i: 2, j: 3, order: 1 },
        { i: 2, j: 10, order: 1 },
        { i: 2, j: 11, order: 1 },
        { i: 3, j: 4, order: 1 },
        { i: 3, j: 12, order: 1 },
        { i: 3, j: 13, order: 1 },
        { i: 4, j: 5, order: 1 },
        { i: 4, j: 14, order: 1 },
        { i: 4, j: 15, order: 1 },
        { i: 5, j: 16, order: 1 },
        { i: 5, j: 17, order: 1 },
      ],
    },
    {
      id: 'dinitrogen',
      kind: 'molecule',
      name: "Dinitrogen",
      formula: 'N2',
      importanceRank: 14,
      tags: ['diatomic','nitrogen','inorganic','benchmark'],
      atoms: [
        { Z: 7, x: -0.54472591, y: 0.00000000, z: 0.00000000 },
        { Z: 7, x: 0.54472591, y: 0.00000000, z: 0.00000000 },
      ],
      bonds: [
        { i: 0, j: 1, order: 3 },
      ],
    },
    {
      id: 'dioxygen',
      kind: 'molecule',
      name: "Dioxygen",
      formula: 'O2',
      importanceRank: 15,
      tags: ['diatomic','oxygen','triplet','radical','benchmark'],
      atoms: [
        { Z: 8, x: -0.59640275, y: 0.00000000, z: 0.00000000 },
        { Z: 8, x: 0.59640275, y: 0.00000000, z: 0.00000000 },
      ],
      bonds: [
        { i: 0, j: 1, order: 2 },
      ],
    },
    {
      id: 'dihydrogen',
      kind: 'molecule',
      name: "Dihydrogen",
      formula: 'H2',
      importanceRank: 16,
      tags: ['diatomic','hydrogen','inorganic','benchmark'],
      atoms: [
        { Z: 1, x: -0.37294982, y: 0.00000000, z: 0.00000000 },
        { Z: 1, x: 0.37294982, y: 0.00000000, z: 0.00000000 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
      ],
    },
    {
      id: 'carbon-monoxide',
      kind: 'molecule',
      name: "Carbon monoxide",
      formula: 'CO',
      importanceRank: 17,
      tags: ['diatomic','carbonyl','inorganic','benchmark'],
      atoms: [
        { Z: 8, x: 0.56169214, y: 0.00000000, z: 0.00000000 },
        { Z: 6, x: -0.56169214, y: 0.00000000, z: 0.00000000 },
      ],
      bonds: [
        { i: 0, j: 1, order: 3 },
      ],
    },
    {
      id: 'hydrogen-peroxide',
      kind: 'molecule',
      name: "Hydrogen peroxide",
      formula: 'H2O2',
      importanceRank: 18,
      tags: ['peroxide','oxygen','inorganic','torsion'],
      atoms: [
        { Z: 8, x: 0.71278356, y: -0.06929132, z: 0.01021859 },
        { Z: 8, x: -0.71278617, y: -0.07002057, z: -0.00206210 },
        { Z: 1, x: 0.90491746, y: -0.63478243, z: -0.74754752 },
        { Z: 1, x: -0.90491485, y: -0.54340568, z: 0.81639104 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 0, j: 2, order: 1 },
        { i: 1, j: 3, order: 1 },
      ],
    },
    {
      id: 'ethane',
      kind: 'molecule',
      name: "Ethane",
      formula: 'C2H6',
      importanceRank: 19,
      tags: ['alkane','organic','starter'],
      atoms: [
        { Z: 6, x: -0.75935180, y: 0.00001266, z: -0.00000144 },
        { Z: 6, x: 0.75935169, y: -0.00001297, z: 0.00000193 },
        { Z: 1, x: -1.15811372, y: 0.65407800, z: 0.77909669 },
        { Z: 1, x: -1.15811155, y: 0.34770976, z: -0.95598272 },
        { Z: 1, x: -1.15813637, y: -1.00172854, z: 0.17687596 },
        { Z: 1, x: 1.15811277, y: -0.34771071, z: 0.95598290 },
        { Z: 1, x: 1.15813573, y: 1.00172855, z: -0.17687472 },
        { Z: 1, x: 1.15811326, y: -0.65407675, z: -0.77909860 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 0, j: 2, order: 1 },
        { i: 0, j: 3, order: 1 },
        { i: 0, j: 4, order: 1 },
        { i: 1, j: 5, order: 1 },
        { i: 1, j: 6, order: 1 },
        { i: 1, j: 7, order: 1 },
      ],
    },
    {
      id: 'pyridine',
      kind: 'molecule',
      name: "Pyridine",
      formula: 'C5H5N',
      importanceRank: 20,
      tags: ['heteroaromatic','ring','organic','starter'],
      atoms: [
        { Z: 6, x: -0.00000163, y: 0.02231618, z: -0.07681034 },
        { Z: 7, x: -0.00000134, y: 1.18796292, z: -0.71388836 },
        { Z: 6, x: 0.00000072, y: 1.15704678, z: -2.04190433 },
        { Z: 6, x: 0.00000139, y: -0.01543190, z: -2.78349748 },
        { Z: 6, x: 0.00000138, y: -1.22369866, z: -2.10647267 },
        { Z: 6, x: 0.00000018, y: -1.20608239, z: -0.72157093 },
        { Z: 1, x: -0.00000101, y: 2.12134852, z: -2.54297201 },
        { Z: 1, x: 0.00000036, y: 0.02316019, z: -3.86613351 },
        { Z: 1, x: -0.00000134, y: -2.16254401, z: -2.64860868 },
        { Z: 1, x: -0.00000092, y: -2.12447205, z: -0.14697742 },
        { Z: 1, x: 0.00000221, y: 0.07039443, z: 1.00883573 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 0, j: 5, order: 2 },
        { i: 0, j: 10, order: 1 },
        { i: 1, j: 2, order: 2 },
        { i: 2, j: 3, order: 1 },
        { i: 2, j: 6, order: 1 },
        { i: 3, j: 4, order: 2 },
        { i: 3, j: 7, order: 1 },
        { i: 4, j: 5, order: 1 },
        { i: 4, j: 8, order: 1 },
        { i: 5, j: 9, order: 1 },
      ],
    },
    {
      id: 'acetonitrile',
      kind: 'molecule',
      name: "Acetonitrile",
      formula: 'C2H3N',
      importanceRank: 24,
      tags: ['nitrile','organic','solvent'],
      atoms: [
        { Z: 7, x: 1.23604514, y: -0.00000370, z: -0.00002477 },
        { Z: 6, x: -1.36212018, y: 0.00002120, z: 0.00002581 },
        { Z: 6, x: 0.08706129, y: 0.00000675, z: -0.00000279 },
        { Z: 1, x: -1.73699320, y: -0.83152361, z: 0.59842594 },
        { Z: 1, x: -1.73701705, y: -0.10242414, z: -1.01930398 },
        { Z: 1, x: -1.73697600, y: 0.93402350, z: 0.42097978 },
      ],
      bonds: [
        { i: 0, j: 2, order: 3 },
        { i: 1, j: 2, order: 1 },
        { i: 1, j: 3, order: 1 },
        { i: 1, j: 4, order: 1 },
        { i: 1, j: 5, order: 1 },
      ],
    },
    {
      id: 'formic-acid',
      kind: 'molecule',
      name: "Formic acid",
      formula: 'CH2O2',
      importanceRank: 36,
      tags: ['carboxylic-acid','organic'],
      atoms: [
        { Z: 8, x: -1.17459686, y: 0.17191978, z: 0.00005064 },
        { Z: 8, x: 1.07073073, y: 0.22479113, z: -0.00002780 },
        { Z: 6, x: 0.04110785, y: -0.38011311, z: 0.00005822 },
        { Z: 1, x: -0.04845042, y: -1.47550053, z: 0.00015451 },
        { Z: 1, x: -1.05419130, y: 1.13350272, z: -0.00003557 },
      ],
      bonds: [
        { i: 0, j: 2, order: 1 },
        { i: 0, j: 4, order: 1 },
        { i: 1, j: 2, order: 2 },
        { i: 2, j: 3, order: 1 },
      ],
    },
    {
      id: 'lithium-hydride',
      kind: 'molecule',
      name: "Lithium hydride",
      formula: 'LiH',
      importanceRank: 45,
      tags: ['diatomic','hydride','inorganic','benchmark'],
      atoms: [
        { Z: 3, x: 0.00124465, y: 0.00000000, z: 0.00000000 },
        { Z: 1, x: 1.59875535, y: 0.00000000, z: 0.00000000 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
      ],
    },
    {
      id: 'hydrogen-fluoride',
      kind: 'molecule',
      name: "Hydrogen fluoride",
      formula: 'HF',
      importanceRank: 46,
      tags: ['diatomic','halide','inorganic','benchmark'],
      atoms: [
        { Z: 9, x: 0.00445535, y: -0.00150999, z: -0.00837090 },
        { Z: 1, x: 0.43134465, y: -0.14619001, z: -0.81042910 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
      ],
    },
    {
      id: 'boron-trifluoride',
      kind: 'molecule',
      name: "Boron trifluoride",
      formula: 'BF3',
      importanceRank: 61,
      tags: ['inorganic','trigonal-planar','vsepr'],
      atoms: [
        { Z: 5, x: -0.00000424, y: -0.00000019, z: -0.00000024 },
        { Z: 9, x: 1.31119484, y: 0.00000023, z: 0.00000008 },
        { Z: 9, x: -0.65559515, y: 1.13553824, z: 0.00000008 },
        { Z: 9, x: -0.65559545, y: -1.13553828, z: 0.00000008 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 0, j: 2, order: 1 },
        { i: 0, j: 3, order: 1 },
      ],
    },
    {
      id: 'sulfur-dioxide',
      kind: 'molecule',
      name: "Sulfur dioxide",
      formula: 'SO2',
      importanceRank: 69,
      tags: ['inorganic','oxide','bent','vsepr'],
      atoms: [
        { Z: 16, x: 0.00000001, y: 0.00000000, z: -0.00102104 },
        { Z: 8, x: -1.23251663, y: 0.00000000, z: 0.72651052 },
        { Z: 8, x: 1.23251662, y: 0.00000000, z: 0.72651052 },
      ],
      bonds: [
        { i: 0, j: 1, order: 2 },
        { i: 0, j: 2, order: 2 },
      ],
    },
    {
      id: 'sulfur-trioxide',
      kind: 'molecule',
      name: "Sulfur trioxide",
      formula: 'SO3',
      importanceRank: 70,
      tags: ['inorganic','oxide','trigonal-planar','vsepr'],
      atoms: [
        { Z: 16, x: 0.00000013, y: 0.00000006, z: 0.00000013 },
        { Z: 8, x: 1.41935549, y: -0.00000014, z: -0.00000004 },
        { Z: 8, x: -0.70967792, y: 1.22920212, z: -0.00000004 },
        { Z: 8, x: -0.70967770, y: -1.22920203, z: -0.00000004 },
      ],
      bonds: [
        { i: 0, j: 1, order: 2 },
        { i: 0, j: 2, order: 2 },
        { i: 0, j: 3, order: 2 },
      ],
    },
    {
      id: 'nitrogen-dioxide',
      kind: 'molecule',
      name: "Nitrogen dioxide",
      formula: 'NO2',
      importanceRank: 71,
      tags: ['inorganic','oxide','radical','doublet','bent'],
      atoms: [
        { Z: 7, x: 0.00000023, y: 0.00000000, z: 0.05828929 },
        { Z: 8, x: -1.09186978, y: 0.00000000, z: 0.51285540 },
        { Z: 8, x: 1.09186955, y: 0.00000000, z: 0.51285531 },
      ],
      bonds: [
        { i: 0, j: 1, order: 2 },
        { i: 0, j: 2, order: 1 },
      ],
    },
    {
      id: 'nitrous-oxide',
      kind: 'molecule',
      name: "Nitrous oxide",
      formula: 'N2O',
      importanceRank: 72,
      tags: ['inorganic','oxide','linear'],
      atoms: [
        { Z: 7, x: -1.11688765, y: 0.00000003, z: 0.00000005 },
        { Z: 7, x: 0.00120986, y: -0.00000006, z: -0.00000009 },
        { Z: 8, x: 1.17567779, y: 0.00000003, z: 0.00000005 },
      ],
      bonds: [
        { i: 0, j: 1, order: 3 },
        { i: 1, j: 2, order: 1 },
      ],
    },
    {
      id: 'phosphorus-trifluoride',
      kind: 'molecule',
      name: "Phosphorus trifluoride",
      formula: 'PF3',
      importanceRank: 73,
      tags: ['inorganic','pyramidal','vsepr'],
      atoms: [
        { Z: 15, x: -0.00000169, y: 0.00000007, z: -0.00295223 },
        { Z: 9, x: 1.36493815, y: 0.00000002, z: -0.78201705 },
        { Z: 9, x: -0.68246819, y: 1.18207958, z: -0.78201534 },
        { Z: 9, x: -0.68246827, y: -1.18207967, z: -0.78201538 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 0, j: 2, order: 1 },
        { i: 0, j: 3, order: 1 },
      ],
    },
    {
      id: 'diborane',
      kind: 'molecule',
      name: "Diborane",
      formula: 'B2H6',
      importanceRank: 74,
      tags: ['borane','inorganic','bridging-hydrogen','three-center-bond'],
      atoms: [
        { Z: 5, x: -0.87356843, y: -0.00000025, z: 0.00000060 },
        { Z: 5, x: 0.87356873, y: -0.00000044, z: -0.00000024 },
        { Z: 1, x: 0.00000048, y: 0.98223553, z: -0.00000326 },
        { Z: 1, x: -0.00000060, y: -0.98223618, z: -0.00000130 },
        { Z: 1, x: -1.45341997, y: -0.00000022, z: 1.04004729 },
        { Z: 1, x: -1.45342264, y: 0.00000046, z: -1.04004500 },
        { Z: 1, x: 1.45341922, y: -0.00000005, z: 1.04004690 },
        { Z: 1, x: 1.45342320, y: 0.00000113, z: -1.04004499 },
      ],
      bonds: [
        { i: 0, j: 2, order: 1 },
        { i: 1, j: 2, order: 1 },
        { i: 0, j: 3, order: 1 },
        { i: 1, j: 3, order: 1 },
        { i: 0, j: 4, order: 1 },
        { i: 0, j: 5, order: 1 },
        { i: 1, j: 6, order: 1 },
        { i: 1, j: 7, order: 1 },
      ],
    },
    {
      id: 'ammonia-borane',
      kind: 'molecule',
      name: "Ammonia borane",
      formula: 'BH3NH3',
      importanceRank: 75,
      tags: ['borane','inorganic','dative-bond'],
      atoms: [
        { Z: 5, x: -0.00000160, y: -0.00000050, z: -0.85790212 },
        { Z: 7, x: -0.00000153, y: -0.00000010, z: 0.78099327 },
        { Z: 1, x: 1.16942169, y: -0.00000129, z: -1.17742593 },
        { Z: 1, x: -0.58470672, y: 1.01275558, z: -1.17742414 },
        { Z: 1, x: -0.58471062, y: -1.01275429, z: -1.17742468 },
        { Z: 1, x: 0.47396174, y: 0.82093394, z: 1.14305967 },
        { Z: 1, x: -0.94793040, y: -0.00000234, z: 1.14306474 },
        { Z: 1, x: 0.47396745, y: -0.82093101, z: 1.14305918 },
      ],
      bonds: [
        { i: 0, j: 1, order: 1 },
        { i: 0, j: 2, order: 1 },
        { i: 0, j: 3, order: 1 },
        { i: 0, j: 4, order: 1 },
        { i: 1, j: 5, order: 1 },
        { i: 1, j: 6, order: 1 },
        { i: 1, j: 7, order: 1 },
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
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'fragment' ? -1 : 1;
        if (a.kind === 'molecule' && b.kind === 'molecule') {
          const rankA = Number.isInteger(a.importanceRank) ? a.importanceRank : Number.MAX_SAFE_INTEGER;
          const rankB = Number.isInteger(b.importanceRank) ? b.importanceRank : Number.MAX_SAFE_INTEGER;
          if (rankA !== rankB) return rankA - rankB;
        }
        return a.name.localeCompare(b.name);
      });
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
      response = await fetch(window.VibeMolAssets?.url(url) || url, { cache: 'no-store' });
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
          const xyzResp = await fetch(window.VibeMolAssets?.url(xyzUrl) || xyzUrl, { cache: 'no-store' });
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
