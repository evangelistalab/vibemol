(function (global) {
/**
 * Atom record used by parsed molecular files.
 * Coordinates are stored in file-native units.
 * @typedef {{Z:number,q:number,x:number,y:number,z:number}} ParsedAtom
 */

/**
 * Compute numeric bounds for an array-like sequence.
 * @param {ArrayLike<number>} a
 * @returns {{min:number,max:number}}
 */
function arrayMinMax(a) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

/**
 * Create a streaming numeric reader over whitespace-delimited text lines.
 * Invalid numeric tokens are skipped; `null` is returned once input is exhausted.
 * @param {string[]} lines
 * @param {number} startLine
 * @returns {() => (number|null)}
 */
function createNumberTokenizer(lines, startLine) {
  let lineIndex = startLine | 0;
  let parts = [];
  let partIndex = 0;

  /**
   * Advance to the next non-empty tokenized line.
   * @returns {boolean}
   */
  function loadNextLine() {
    while (lineIndex < lines.length) {
      const line = lines[lineIndex++];
      if (!line) continue;
      const nextParts = line.trim().split(/\s+/);
      if (nextParts.length && nextParts[0] !== '') {
        parts = nextParts;
        partIndex = 0;
        return true;
      }
    }
    return false;
  }

  return function nextNumber() {
    while (true) {
      if (partIndex < parts.length) {
        const n = parseFloat(parts[partIndex++]);
        if (Number.isFinite(n)) return n;
        continue;
      }
      if (!loadNextLine()) return null;
    }
  };
}

/**
 * Read exactly `length` values from a tokenizer into a `Float32Array`.
 * @param {() => (number|null)} nextNumber
 * @param {number} length
 * @returns {Float32Array}
 */
function readFloatArray(nextNumber, length) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const n = nextNumber();
    if (n == null) {
      throw new Error(`Data size mismatch. Expected ${length}, got ${i}`);
    }
    out[i] = n;
  }
  return out;
}

/**
 * Parse a Gaussian `.cube/.cub` file into the internal volume shape.
 * Handles an ORCA-specific extra header line when present.
 * @param {string} text
 * @returns {{
 *   title:string,
 *   comment:string,
 *   natoms:number,
 *   origin:number[],
 *   nxyz:number[],
 *   axes:number[][],
 *   atoms:ParsedAtom[],
 *   data:Float32Array,
 *   idx:(i:number,j:number,k:number)=>number,
 *   units:'bohr',
 *   isoHint:(number|null)
 * }}
 */
function parseCube(text) {
  // Split lines, handle CRLF
  const lines = text.replace(/\r/g, '').split('\n');

  // ORCA-specific quirk: some ORCA CUBE files include an extra header
  // line at the 9th line (1-based indexing) that contains only two numbers.
  // Detect ORCA from the first line and, if present, remove that line so
  // that atom records start where we expect.
  try {
    const isORCA = /ORCA/i.test(lines[0] || '');
    const l9 = (lines[8] || '').trim();
    if (isORCA && l9) {
      const parts = l9.split(/\s+/);
      const twoNums = parts.length === 2 && parts.every(s => isFinite(parseFloat(s)));
      if (twoNums) {
        // Remove the 9th line so downstream fixed indexing remains valid
        lines.splice(8, 1);
      }
    }
  } catch { /* keep default if anything goes wrong */ }

  if (lines.length < 6) throw new Error("Not enough lines for a CUBE file.");

  const title = lines[0];
  const comment = lines[1];

  // Generic "(x,y)" capture anywhere on the 2nd line (your regex)
  let isoHint = null;
  {
    const m = comment.match(/\(([-+]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*,\s*([-+]?\d*\.?\d+(?:[eE][+-]?\d+)?)\)/);
    if (m) isoHint = parseFloat(m[1]); // take the first number as suggested level
  }

  // natoms / origin line
  const L3 = lines[2].trim().split(/\s+/);
  const natoms = parseInt(L3[0], 10);
  const origin = [parseFloat(L3[1]), parseFloat(L3[2]), parseFloat(L3[3])];

  // grid counts + per-voxel step vectors (Bohr)
  const sx = lines[3].trim().split(/\s+/).map(Number); // [numx, ax, ay, az]
  const sy = lines[4].trim().split(/\s+/).map(Number); // [numy, bx, by, bz]
  const sz = lines[5].trim().split(/\s+/).map(Number); // [numz, cx, cy, cz]
  const numx = Math.abs(sx[0]) | 0, numy = Math.abs(sy[0]) | 0, numz = Math.abs(sz[0]) | 0;
  const ax = sx.slice(1, 4); // per-voxel step along i
  const ay = sy.slice(1, 4); // per-voxel step along j
  const az = sz.slice(1, 4); // per-voxel step along k

  // atoms: Z, q, x, y, z  (positions in Bohr)
  const atoms = [];
  for (let i = 0; i < Math.abs(natoms); i++) {
    const p = lines[6 + i].trim().split(/\s+/).map(Number);
    atoms.push({ Z: p[0], q: p[1], x: p[2], y: p[3], z: p[4] });
  }

  // volumetric data (z fastest, then y, then x) — reshape (numx,numy,numz)
  const dataStartLine = 6 + Math.abs(natoms);
  const total = numx * numy * numz;
  const nextNumber = createNumberTokenizer(lines, dataStartLine);
  const data = readFloatArray(nextNumber, total);

  // index helper matching your reshape: data[i,j,k]
  /**
   * Map voxel coordinates to a flat array index.
   * Layout is `[x][y][z]` with `z` as the fastest axis.
   * @param {number} i
   * @param {number} j
   * @param {number} k
   * @returns {number}
   */
  const idx = (i, j, k) => (i * numy + j) * numz + k;

  return {
    title, comment,
    natoms: Math.abs(natoms),
    origin,                        // Bohr
    nxyz: [numx, numy, numz],
    axes: [ax, ay, az],            // per-voxel step vectors in Bohr
    atoms, data, idx,
    units: 'bohr',                 // positions stored in Bohr
    isoHint                        // may be null if not present
  };
}

/**
 * Parse a two-component CUBE (`.2ccube`) file.
 * Expected channel order: `alphaRe`, `alphaIm`, `betaRe`, `betaIm`.
 * For single-channel fallback files, companion channels are zero-filled.
 * @param {string} text
 * @returns {{
 *   title:string,
 *   comment:string,
 *   natoms:number,
 *   origin:number[],
 *   nxyz:number[],
 *   axes:number[][],
 *   atoms:ParsedAtom[],
 *   alphaRe:Float32Array,
 *   alphaIm:Float32Array,
 *   betaRe:Float32Array,
 *   betaIm:Float32Array,
 *   data:Float32Array,
 *   idx:(i:number,j:number,k:number)=>number,
 *   units:'bohr',
 *   isoHint:(number|null),
 *   isTwoComponent:boolean
 * }}
 */
function parseTwoComponentCube(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  // ORCA-specific quirk: remove extra 9th line if present
  try {
    const isORCA = /ORCA/i.test(lines[0] || '');
    const l9 = (lines[8] || '').trim();
    if (isORCA && l9) {
      const parts = l9.split(/\s+/);
      const twoNums = parts.length === 2 && parts.every(s => isFinite(parseFloat(s)));
      if (twoNums) lines.splice(8, 1);
    }
  } catch { }
  if (lines.length < 6) throw new Error('Not enough lines for a CUBE file.');
  const title = lines[0];
  const comment = lines[1] || '';
  let isoHint = null;
  try {
    const m = comment.match(/\(([-+]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*,\s*([-+]?\d*\.?\d+(?:[eE][+-]?\d+)?)\)/);
    if (m) isoHint = parseFloat(m[1]);
  } catch { }
  const L3 = lines[2].trim().split(/\s+/);
  const natoms = Math.abs(parseInt(L3[0], 10));
  const origin = [parseFloat(L3[1]), parseFloat(L3[2]), parseFloat(L3[3])];
  const sx = lines[3].trim().split(/\s+/).map(Number);
  const sy = lines[4].trim().split(/\s+/).map(Number);
  const sz = lines[5].trim().split(/\s+/).map(Number);
  const numx = Math.abs(sx[0]) | 0, numy = Math.abs(sy[0]) | 0, numz = Math.abs(sz[0]) | 0;
  const ax = sx.slice(1, 4);
  const ay = sy.slice(1, 4);
  const az = sz.slice(1, 4);
  const atoms = [];
  for (let i = 0; i < natoms; i++) {
    const p = lines[6 + i].trim().split(/\s+/).map(Number);
    atoms.push({ Z: p[0], q: p[1], x: p[2], y: p[3], z: p[4] });
  }
  const dataStartLine = 6 + natoms;
  const nextNumber = createNumberTokenizer(lines, dataStartLine);
  const total = numx * numy * numz;
  let alphaRe, alphaIm, betaRe, betaIm, isTwoComponent = false;

  alphaRe = readFloatArray(nextNumber, total);

  const maybeAlphaIm0 = nextNumber();
  if (maybeAlphaIm0 == null) {
    // single-dataset file; keep compat by exposing zeroed companion arrays
    alphaIm = new Float32Array(total);
    betaRe = new Float32Array(total);
    betaIm = new Float32Array(total);
  } else {
    isTwoComponent = true;
    alphaIm = new Float32Array(total);
    betaRe = new Float32Array(total);
    betaIm = new Float32Array(total);

    alphaIm[0] = maybeAlphaIm0;
    for (let i = 1; i < total; i++) {
      const n = nextNumber();
      if (n == null) throw new Error(`Data size mismatch. Expected ${4 * total}, got ${total + i}`);
      alphaIm[i] = n;
    }
    for (let i = 0; i < total; i++) {
      const n = nextNumber();
      if (n == null) throw new Error(`Data size mismatch. Expected ${4 * total}, got ${2 * total + i}`);
      betaRe[i] = n;
    }
    for (let i = 0; i < total; i++) {
      const n = nextNumber();
      if (n == null) throw new Error(`Data size mismatch. Expected ${4 * total}, got ${3 * total + i}`);
      betaIm[i] = n;
    }
  }
  /**
   * Map voxel coordinates to a flat array index.
   * @param {number} i
   * @param {number} j
   * @param {number} k
   * @returns {number}
   */
  const idx = (i, j, k) => (i * numy + j) * numz + k;
  const vol = { title, comment, natoms, origin, nxyz: [numx, numy, numz], axes: [ax, ay, az], atoms, alphaRe, alphaIm, betaRe, betaIm, idx, units: 'bohr', isoHint, isTwoComponent };
  // default dataset
  vol.data = isTwoComponent ? alphaRe : alphaRe;
  return vol;
}

/**
 * Parse an XYZ file into atom-only volume metadata used by the UI/export paths.
 * XYZ coordinates are interpreted as angstrom values.
 * @param {string} text
 * @returns {{
 *   title:string,
 *   comment:string,
 *   natoms:number,
 *   origin:number[],
 *   nxyz:number[],
 *   axes:number[][],
 *   atoms:ParsedAtom[],
 *   data:Float32Array,
 *   idx:(i:number,j:number,k:number)=>number,
 *   units:'angstrom',
 *   kind:'xyz'
 * }}
 */
function parseXYZ(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  let i = 0;
  // Optional first line atom count
  let natoms = 0;
  if (lines.length > 0) {
    const maybeN = parseInt((lines[0] || '').trim(), 10);
    if (!Number.isNaN(maybeN) && maybeN >= 0) {
      natoms = maybeN | 0; i = 2; // skip count + optional comment
    }
  }
  const atoms = [];
  for (; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    const parts = l.split(/\s+/);
    if (parts.length < 4) continue;
    const sym = parts[0];
    const Z = (window.ATOM_SYMBOL_TO_Z && window.ATOM_SYMBOL_TO_Z[sym.toUpperCase()]) || 0;
    const x = parseFloat(parts[1]);
    const y = parseFloat(parts[2]);
    const z = parseFloat(parts[3]);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      atoms.push({ Z, q: 0, x, y, z }); // XYZ is in Å already
    }
  }
  if (natoms === 0) natoms = atoms.length;
  /**
   * Placeholder indexer for atom-only XYZ records (no voxel grid).
   * @param {number} i
   * @param {number} j
   * @param {number} k
   * @returns {number}
   */
  const idx = (i, j, k) => 0;
  return { title: 'XYZ', comment: '', natoms, origin: [0, 0, 0], nxyz: [0, 0, 0], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], atoms, data: new Float32Array(0), idx, units: 'angstrom', kind: 'xyz' };
}

  global.VibeMolParsers = { arrayMinMax, parseCube, parseTwoComponentCube, parseXYZ };
})(window);
