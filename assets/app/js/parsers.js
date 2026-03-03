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
 * Build a tokenizer positioned at the first scalar voxel value for CUBE data.
 * Handles negative-`natoms` dataset-id headers and ORCA legacy extra data-id lines.
 * @param {string[]} lines
 * @param {number} dataStartLine
 * @param {number} natomsRaw
 * @param {boolean} isORCA
 * @returns {() => (number|null)}
 */
function createCubeDataTokenizer(lines, dataStartLine, natomsRaw, isORCA) {
  // Standard CUBE with natoms < 0: one dataset header value (N) followed by N ids.
  if ((natomsRaw | 0) < 0) {
    const nextNumber = createNumberTokenizer(lines, dataStartLine);
    const nDatasetsRaw = nextNumber();
    if (nDatasetsRaw == null || !Number.isFinite(nDatasetsRaw) || !Number.isInteger(nDatasetsRaw) || nDatasetsRaw <= 0) {
      throw new Error('Malformed CUBE dataset header (invalid dataset count after atom block).');
    }
    const nDatasets = nDatasetsRaw | 0;
    for (let i = 0; i < nDatasets; i++) {
      const datasetId = nextNumber();
      if (datasetId == null || !Number.isFinite(datasetId)) {
        throw new Error('Malformed CUBE dataset header (missing dataset ids after atom block).');
      }
    }
    return nextNumber;
  }

  // ORCA compatibility: some files include one extra "<count> <id>" line before data.
  if (isORCA) {
    const raw = (lines[dataStartLine] || '').trim();
    if (raw) {
      const parts = raw.split(/\s+/);
      const maybeLegacyIds = (
        parts.length === 2
        && /^[-+]?\d+$/.test(parts[0])
        && /^[-+]?\d+$/.test(parts[1])
      );
      if (maybeLegacyIds) return createNumberTokenizer(lines, dataStartLine + 1);
    }
  }
  return createNumberTokenizer(lines, dataStartLine);
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
  const isORCA = /ORCA/i.test(lines[0] || '');

  if (lines.length < 6) throw new Error('Not enough lines for a CUBE file.');

  const title = lines[0];
  const comment = lines[1];

  // Generic "(x,y)" capture anywhere on the 2nd line (your regex)
  let isoHint = null;
  {
    const m = comment.match(/\(([-+]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*,\s*([-+]?\d*\.?\d+(?:[eE][+-]?\d+)?)\)/);
    if (m) isoHint = parseFloat(m[1]); // take the first number as suggested level
  }

  // natoms / origin line
  const L3raw = (lines[2] || '').trim();
  if (!L3raw) throw new Error('Malformed CUBE header at line 3 (missing atom count and origin).');
  const L3 = L3raw.split(/\s+/);
  if (L3.length < 4) throw new Error('Malformed CUBE header at line 3 (expected: natoms ox oy oz).');
  const natomsRaw = Number(L3[0]);
  if (!Number.isFinite(natomsRaw) || !Number.isInteger(natomsRaw)) {
    throw new Error('Malformed CUBE header at line 3 (invalid atom count).');
  }
  const natoms = natomsRaw | 0;
  const atomCount = Math.abs(natoms);
  const origin = [Number(L3[1]), Number(L3[2]), Number(L3[3])];
  if (!origin.every(Number.isFinite)) {
    throw new Error('Malformed CUBE header at line 3 (invalid origin coordinates).');
  }

  // grid counts + per-voxel step vectors (Bohr)
  const sx = ((lines[3] || '').trim()).split(/\s+/).map(Number); // [numx, ax, ay, az]
  const sy = ((lines[4] || '').trim()).split(/\s+/).map(Number); // [numy, bx, by, bz]
  const sz = ((lines[5] || '').trim()).split(/\s+/).map(Number); // [numz, cx, cy, cz]
  if (sx.length < 4 || sy.length < 4 || sz.length < 4) {
    throw new Error('Malformed CUBE grid header at lines 4-6 (expected nx/ny/nz and axis vectors).');
  }
  if (![sx[0], sx[1], sx[2], sx[3], sy[0], sy[1], sy[2], sy[3], sz[0], sz[1], sz[2], sz[3]].every(Number.isFinite)) {
    throw new Error('Malformed CUBE grid header at lines 4-6 (non-numeric values).');
  }
  const numx = Math.abs(sx[0]) | 0, numy = Math.abs(sy[0]) | 0, numz = Math.abs(sz[0]) | 0;
  if (numx <= 0 || numy <= 0 || numz <= 0) {
    throw new Error('Malformed CUBE grid header at lines 4-6 (grid counts must be positive).');
  }
  const ax = sx.slice(1, 4); // per-voxel step along i
  const ay = sy.slice(1, 4); // per-voxel step along j
  const az = sz.slice(1, 4); // per-voxel step along k

  // atoms: Z, q, x, y, z  (positions in Bohr)
  const atoms = [];
  for (let i = 0; i < atomCount; i++) {
    const lineNo = 7 + i;
    const raw = (lines[6 + i] || '').trim();
    if (!raw) throw new Error(`Malformed CUBE atom line ${lineNo} (missing atom record).`);
    const p = raw.split(/\s+/).slice(0, 5).map(Number);
    if (p.length < 5 || !p.every(Number.isFinite)) {
      throw new Error(`Malformed CUBE atom line ${lineNo} (expected: Z q x y z).`);
    }
    atoms.push({ Z: p[0], q: p[1], x: p[2], y: p[3], z: p[4] });
  }

  // volumetric data (z fastest, then y, then x) — reshape (numx,numy,numz)
  const dataStartLine = 6 + atomCount;
  const total = numx * numy * numz;
  const nextNumber = createCubeDataTokenizer(lines, dataStartLine, natoms, isORCA);
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
    natoms: atomCount,
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
  const isORCA = /ORCA/i.test(lines[0] || '');
  if (lines.length < 6) throw new Error('Not enough lines for a CUBE file.');
  const title = lines[0];
  const comment = lines[1] || '';
  let isoHint = null;
  try {
    const m = comment.match(/\(([-+]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*,\s*([-+]?\d*\.?\d+(?:[eE][+-]?\d+)?)\)/);
    if (m) isoHint = parseFloat(m[1]);
  } catch { }
  const L3raw = (lines[2] || '').trim();
  if (!L3raw) throw new Error('Malformed 2C CUBE header at line 3 (missing atom count and origin).');
  const L3 = L3raw.split(/\s+/);
  if (L3.length < 4) throw new Error('Malformed 2C CUBE header at line 3 (expected: natoms ox oy oz).');
  const natomsRaw = Number(L3[0]);
  if (!Number.isFinite(natomsRaw) || !Number.isInteger(natomsRaw)) {
    throw new Error('Malformed 2C CUBE header at line 3 (invalid atom count).');
  }
  const natoms = natomsRaw | 0;
  const atomCount = Math.abs(natoms);
  const origin = [Number(L3[1]), Number(L3[2]), Number(L3[3])];
  if (!origin.every(Number.isFinite)) {
    throw new Error('Malformed 2C CUBE header at line 3 (invalid origin coordinates).');
  }
  const sx = ((lines[3] || '').trim()).split(/\s+/).map(Number);
  const sy = ((lines[4] || '').trim()).split(/\s+/).map(Number);
  const sz = ((lines[5] || '').trim()).split(/\s+/).map(Number);
  if (sx.length < 4 || sy.length < 4 || sz.length < 4) {
    throw new Error('Malformed 2C CUBE grid header at lines 4-6 (expected nx/ny/nz and axis vectors).');
  }
  if (![sx[0], sx[1], sx[2], sx[3], sy[0], sy[1], sy[2], sy[3], sz[0], sz[1], sz[2], sz[3]].every(Number.isFinite)) {
    throw new Error('Malformed 2C CUBE grid header at lines 4-6 (non-numeric values).');
  }
  const numx = Math.abs(sx[0]) | 0, numy = Math.abs(sy[0]) | 0, numz = Math.abs(sz[0]) | 0;
  if (numx <= 0 || numy <= 0 || numz <= 0) {
    throw new Error('Malformed 2C CUBE grid header at lines 4-6 (grid counts must be positive).');
  }
  const ax = sx.slice(1, 4);
  const ay = sy.slice(1, 4);
  const az = sz.slice(1, 4);
  const atoms = [];
  for (let i = 0; i < atomCount; i++) {
    const lineNo = 7 + i;
    const raw = (lines[6 + i] || '').trim();
    if (!raw) throw new Error(`Malformed 2C CUBE atom line ${lineNo} (missing atom record).`);
    const p = raw.split(/\s+/).slice(0, 5).map(Number);
    if (p.length < 5 || !p.every(Number.isFinite)) {
      throw new Error(`Malformed 2C CUBE atom line ${lineNo} (expected: Z q x y z).`);
    }
    atoms.push({ Z: p[0], q: p[1], x: p[2], y: p[3], z: p[4] });
  }
  const dataStartLine = 6 + atomCount;
  const nextNumber = createCubeDataTokenizer(lines, dataStartLine, natoms, isORCA);
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
  const vol = { title, comment, natoms: atomCount, origin, nxyz: [numx, numy, numz], axes: [ax, ay, az], atoms, alphaRe, alphaIm, betaRe, betaIm, idx, units: 'bohr', isoHint, isTwoComponent };
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
  if (lines.length === 0) throw new Error('Empty XYZ file.');
  const countRaw = (lines[0] || '').trim();
  if (!countRaw) throw new Error('Malformed XYZ file: first line must be the atom count.');
  const natomsVal = Number(countRaw);
  if (!Number.isFinite(natomsVal) || !Number.isInteger(natomsVal) || natomsVal < 0) {
    throw new Error('Malformed XYZ file: first line must be a non-negative integer atom count.');
  }
  const natoms = natomsVal | 0;
  if (lines.length < natoms + 2) {
    throw new Error(`Malformed XYZ file: expected ${natoms} atom lines after the comment line, found ${Math.max(0, lines.length - 2)}.`);
  }
  const comment = lines[1] || '';
  const atoms = [];
  for (let i = 0; i < natoms; i++) {
    const lineNo = i + 3;
    const l = (lines[i + 2] || '').trim();
    if (!l) throw new Error(`Malformed XYZ file at line ${lineNo}: missing atom record.`);
    const parts = l.split(/\s+/);
    if (parts.length < 4) {
      throw new Error(`Malformed XYZ file at line ${lineNo}: expected "Symbol X Y Z".`);
    }
    const sym = parts[0];
    const symbolKey = sym.toUpperCase();
    const hasSymbol = !!(window.ATOM_SYMBOL_TO_Z && Object.prototype.hasOwnProperty.call(window.ATOM_SYMBOL_TO_Z, symbolKey));
    if (!hasSymbol) {
      throw new Error(`Malformed XYZ file at line ${lineNo}: unknown element symbol "${sym}".`);
    }
    const Z = window.ATOM_SYMBOL_TO_Z[symbolKey];
    const x = parseFloat(parts[1]);
    const y = parseFloat(parts[2]);
    const z = parseFloat(parts[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error(`Malformed XYZ file at line ${lineNo}: coordinates must be numeric.`);
    }
    atoms.push({ Z, q: 0, x, y, z }); // XYZ is in Å already
  }

  for (let i = 2 + natoms; i < lines.length; i++) {
    if ((lines[i] || '').trim()) {
      throw new Error(`Malformed XYZ file: unexpected extra content at line ${i + 1}.`);
    }
  }
  /**
   * Placeholder indexer for atom-only XYZ records (no voxel grid).
   * @param {number} i
   * @param {number} j
   * @param {number} k
   * @returns {number}
   */
  const idx = (i, j, k) => 0;
  return { title: 'XYZ', comment, natoms, origin: [0, 0, 0], nxyz: [0, 0, 0], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], atoms, data: new Float32Array(0), idx, units: 'angstrom', kind: 'xyz' };
}

  global.VibeMolParsers = { arrayMinMax, parseCube, parseTwoComponentCube, parseXYZ };
})(window);
