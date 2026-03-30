(function (global) {
/**
 * Atom record used by parsed molecular files.
 * Coordinates are stored in file-native units.
 * @typedef {{id?:string,Z:number,x:number,y:number,z:number,formalCharge:number}} ParsedAtom
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
    atoms.push({ Z: p[0], x: p[2], y: p[3], z: p[4], formalCharge: 0 });
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
    atoms.push({ Z: p[0], x: p[2], y: p[3], z: p[4], formalCharge: 0 });
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
  let cursor = 0;
  while (cursor < lines.length && !(lines[cursor] || '').trim()) cursor++;
  if (cursor >= lines.length) throw new Error('Empty XYZ file.');

  const frames = [];
  const frameComments = [];
  let natoms = null;
  let atomSymbols = null;
  let firstFrameAtoms = null;

  while (cursor < lines.length) {
    while (cursor < lines.length && !(lines[cursor] || '').trim()) cursor++;
    if (cursor >= lines.length) break;

    const blockStartLine = cursor + 1;
    const countRaw = (lines[cursor] || '').trim();
    if (!countRaw) throw new Error(`Malformed XYZ file at line ${blockStartLine}: missing atom count.`);
    const natomsVal = Number(countRaw);
    if (!Number.isFinite(natomsVal) || !Number.isInteger(natomsVal) || natomsVal < 0) {
      throw new Error(`Malformed XYZ file at line ${blockStartLine}: atom count must be a non-negative integer.`);
    }
    const frameNatoms = natomsVal | 0;
    if (natoms == null) natoms = frameNatoms;
    else if (frameNatoms !== natoms) {
      throw new Error(`Malformed XYZ trajectory at line ${blockStartLine}: atom count ${frameNatoms} does not match first frame count ${natoms}.`);
    }

    const commentIndex = cursor + 1;
    if (commentIndex >= lines.length) {
      throw new Error(`Malformed XYZ file: missing comment line after atom count at line ${blockStartLine}.`);
    }
    const comment = lines[commentIndex] || '';

    const frame = new Float32Array(frameNatoms * 3);
    const frameAtoms = [];
    for (let i = 0; i < frameNatoms; i++) {
      const rowIndex = cursor + 2 + i;
      const lineNo = rowIndex + 1;
      if (rowIndex >= lines.length) {
        throw new Error(`Malformed XYZ file: expected ${frameNatoms} atom lines after line ${commentIndex + 1}, but file ended early.`);
      }
      const l = (lines[rowIndex] || '').trim();
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

      if (!atomSymbols) atomSymbols = [];
      if (atomSymbols.length <= i) atomSymbols.push(symbolKey);
      else if (atomSymbols[i] !== symbolKey) {
        throw new Error(`Malformed XYZ trajectory at line ${lineNo}: element sequence differs from first frame.`);
      }

      frame[3 * i + 0] = x;
      frame[3 * i + 1] = y;
      frame[3 * i + 2] = z;
      frameAtoms.push({ Z, x, y, z, formalCharge: 0 });
    }
    frames.push(frame);
    frameComments.push(comment);
    if (!firstFrameAtoms) firstFrameAtoms = frameAtoms;
    cursor += frameNatoms + 2;
  }

  if (!firstFrameAtoms || natoms == null) throw new Error('Malformed XYZ file: no atom frame found.');
  const atoms = firstFrameAtoms;
  /**
   * Placeholder indexer for atom-only XYZ records (no voxel grid).
   * @param {number} i
   * @param {number} j
   * @param {number} k
   * @returns {number}
   */
  const idx = (i, j, k) => 0;
  const vol = { title: 'XYZ', comment: frameComments[0] || '', natoms, origin: [0, 0, 0], nxyz: [0, 0, 0], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], atoms, data: new Float32Array(0), idx, units: 'angstrom', kind: 'xyz' };
  if (frames.length > 1) {
    vol.trajectory = {
      frames,
      comments: frameComments,
      frameIndex: 0,
      fps: 12,
      loop: true,
    };
  }
  return vol;
}

/**
 * Parse one numeric token, accepting Fortran `D` exponents as well as `E`.
 * @param {*} raw
 * @returns {number}
 */
function parseLooseNumber(raw) {
  const token = String(raw == null ? '' : raw).trim();
  if (!token) return NaN;
  return Number(token.replace(/[dD]/g, 'E'));
}

/**
 * Normalize one Molden element token into an atomic number.
 * @param {string} symbolToken
 * @param {*} zToken
 * @param {number} lineNo
 * @returns {number}
 */
function resolveMoldenAtomicNumber(symbolToken, zToken, lineNo) {
  const symbolRaw = String(symbolToken == null ? '' : symbolToken).trim();
  const symbolLetters = symbolRaw.replace(/[^A-Za-z]/g, '');
  const symbolKey = symbolLetters.toUpperCase();
  const z = parseInt(String(zToken == null ? '' : zToken).trim(), 10);
  if (Number.isInteger(z) && z > 0) return z;
  if (symbolKey && window.ATOM_SYMBOL_TO_Z && Number.isInteger(window.ATOM_SYMBOL_TO_Z[symbolKey])) {
    return window.ATOM_SYMBOL_TO_Z[symbolKey];
  }
  throw new Error(`Malformed Molden [Atoms] entry at line ${lineNo}: could not resolve atomic number for "${symbolRaw}".`);
}

/**
 * Split a Molden payload into named sections.
 * @param {string} text
 * @returns {{lines:string[], sections:Array<{name:string, option:string, startLine:number, lines:Array<{text:string,lineNo:number}>}>}}
 */
function splitMoldenSections(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const sections = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] || '';
    const trimmed = raw.trim();
    const sectionMatch = trimmed.match(/^\[([^\]]+)\](?:\s*(?:\(([^)]*)\)|(.+)))?\s*$/i);
    if (sectionMatch) {
      current = {
        name: sectionMatch[1].trim().toUpperCase(),
        option: String(sectionMatch[2] || sectionMatch[3] || '').trim(),
        startLine: i + 1,
        lines: [],
      };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push({ text: raw, lineNo: i + 1 });
  }
  return { lines, sections };
}

/**
 * Resolve Molden d/f/g spherical-vs-cartesian flags.
 * @param {Array<{name:string}>} sections
 * @returns {{d:'cartesian'|'spherical', f:'cartesian'|'spherical', g:'cartesian'|'spherical'}}
 */
function resolveMoldenAngularFlags(sections) {
  const flags = { d: 'cartesian', f: 'cartesian', g: 'cartesian' };
  for (const section of sections) {
    switch (section.name) {
      case '5D':
      case '5D7F':
        flags.d = 'spherical';
        flags.f = 'spherical';
        break;
      case '5D10F':
        flags.d = 'spherical';
        flags.f = 'cartesian';
        break;
      case '7F':
        flags.f = 'spherical';
        break;
      case '9G':
        flags.g = 'spherical';
        break;
      default:
        break;
    }
  }
  return flags;
}

/**
 * Count basis functions contributed by one Molden shell label.
 * @param {string} label
 * @param {{d:string,f:string,g:string}} angularFlags
 * @returns {number}
 */
function countMoldenShellFunctions(label, angularFlags) {
  const shell = String(label || '').trim().toLowerCase();
  if (shell === 's') return 1;
  if (shell === 'p') return 3;
  if (shell === 'sp') return 4;
  if (shell === 'd') return angularFlags.d === 'spherical' ? 5 : 6;
  if (shell === 'f') return angularFlags.f === 'spherical' ? 7 : 10;
  if (shell === 'g') return angularFlags.g === 'spherical' ? 9 : 15;
  throw new Error(`Unsupported Molden shell label "${label}".`);
}

/**
 * Parse the Molden [Atoms] section.
 * @param {{option:string, lines:Array<{text:string,lineNo:number}>}} section
 * @returns {{atoms:ParsedAtom[], units:'angstrom'|'bohr', atomUnitLabel:string}}
 */
function parseMoldenAtomsSection(section) {
  if (!section) throw new Error('Molden file is missing required [Atoms] section.');
  const option = String(section.option || '').trim().toUpperCase();
  let units = 'angstrom';
  if (option === 'AU') units = 'bohr';
  else if (option && option !== 'ANGS' && option !== 'ANGSTROMS' && option !== 'ANG') {
    throw new Error(`Unsupported Molden [Atoms] units "${section.option}" at line ${section.startLine}.`);
  }
  const atoms = [];
  for (const entry of section.lines) {
    const trimmed = entry.text.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 6) {
      throw new Error(`Malformed Molden [Atoms] entry at line ${entry.lineNo}: expected "Symbol index Z x y z".`);
    }
    const Z = resolveMoldenAtomicNumber(parts[0], parts[2], entry.lineNo);
    const x = parseLooseNumber(parts[3]);
    const y = parseLooseNumber(parts[4]);
    const z = parseLooseNumber(parts[5]);
    if (![x, y, z].every(Number.isFinite)) {
      throw new Error(`Malformed Molden [Atoms] entry at line ${entry.lineNo}: coordinates must be numeric.`);
    }
    atoms.push({ Z, x, y, z, formalCharge: 0 });
  }
  if (atoms.length === 0) throw new Error('Molden [Atoms] section did not contain any atoms.');
  return { atoms, units, atomUnitLabel: units === 'bohr' ? 'AU' : 'Angs' };
}

/**
 * Parse the Molden [GTO] section and count AO functions.
 * @param {{lines:Array<{text:string,lineNo:number}>}|null} section
 * @param {{d:string,f:string,g:string}} angularFlags
 * @returns {{atomBlocks:Array<{atomIndex:number,shells:Array<Object>}>, aoCount:number}}
 */
function parseMoldenGtoSection(section, angularFlags) {
  if (!section) return { atomBlocks: [], aoCount: 0 };
  const atomBlocks = [];
  let aoCount = 0;
  let currentBlock = null;
  for (let i = 0; i < section.lines.length; i++) {
    const entry = section.lines[i];
    const trimmed = entry.text.trim();
    if (!trimmed) continue;
    const atomMatch = trimmed.match(/^(\d+)(?:\s+0)?$/);
    if (atomMatch) {
      currentBlock = { atomIndex: parseInt(atomMatch[1], 10) - 1, shells: [] };
      atomBlocks.push(currentBlock);
      continue;
    }
    if (!currentBlock) {
      throw new Error(`Malformed Molden [GTO] section near line ${entry.lineNo}: shell found before atom index block.`);
    }
    const header = trimmed.split(/\s+/);
    if (header.length < 2) {
      throw new Error(`Malformed Molden [GTO] shell header at line ${entry.lineNo}.`);
    }
    const shellLabel = header[0].toLowerCase();
    const primitiveCount = parseInt(header[1], 10);
    if (!Number.isInteger(primitiveCount) || primitiveCount <= 0) {
      throw new Error(`Malformed Molden [GTO] shell header at line ${entry.lineNo}: invalid primitive count.`);
    }
    const primitives = [];
    for (let p = 0; p < primitiveCount; p++) {
      i++;
      if (i >= section.lines.length) {
        throw new Error(`Malformed Molden [GTO] shell at line ${entry.lineNo}: file ended before ${primitiveCount} primitives were read.`);
      }
      const primitiveEntry = section.lines[i];
      const primitiveTrimmed = primitiveEntry.text.trim();
      if (!primitiveTrimmed) {
        p--;
        continue;
      }
      const fields = primitiveTrimmed.split(/\s+/);
      const exponent = parseLooseNumber(fields[0]);
      if (!Number.isFinite(exponent)) {
        throw new Error(`Malformed Molden primitive at line ${primitiveEntry.lineNo}: invalid exponent.`);
      }
      if (shellLabel === 'sp') {
        if (fields.length < 3) {
          throw new Error(`Malformed Molden sp primitive at line ${primitiveEntry.lineNo}: expected exponent and two contractions.`);
        }
        const coeffS = parseLooseNumber(fields[1]);
        const coeffP = parseLooseNumber(fields[2]);
        if (![coeffS, coeffP].every(Number.isFinite)) {
          throw new Error(`Malformed Molden sp primitive at line ${primitiveEntry.lineNo}: contractions must be numeric.`);
        }
        primitives.push({ exponent, coefficients: [coeffS, coeffP] });
      } else {
        if (fields.length < 2) {
          throw new Error(`Malformed Molden primitive at line ${primitiveEntry.lineNo}: expected exponent and contraction.`);
        }
        const coeff = parseLooseNumber(fields[1]);
        if (!Number.isFinite(coeff)) {
          throw new Error(`Malformed Molden primitive at line ${primitiveEntry.lineNo}: contraction must be numeric.`);
        }
        primitives.push({ exponent, coefficients: [coeff] });
      }
    }
    currentBlock.shells.push({
      label: shellLabel,
      primitiveCount,
      primitives,
    });
    aoCount += countMoldenShellFunctions(shellLabel, angularFlags);
  }
  return { atomBlocks, aoCount };
}

/**
 * Finalize one partially parsed Molden MO record.
 * @param {Object|null} orbital
 * @param {number} basisCount
 * @returns {Object|null}
 */
function finalizeMoldenOrbital(orbital, basisCount) {
  if (!orbital || orbital.maxCoeffIndex <= 0) return null;
  const coeffCount = Math.max(basisCount | 0, orbital.maxCoeffIndex | 0);
  const coeffs = new Float32Array(coeffCount);
  for (const [index, value] of orbital.coeffMap.entries()) coeffs[index - 1] = value;
  return {
    symmetry: orbital.symmetry || '',
    energy: Number.isFinite(orbital.energy) ? orbital.energy : null,
    spin: orbital.spin || '',
    occupation: Number.isFinite(orbital.occupation) ? orbital.occupation : null,
    coefficients: coeffs,
  };
}

/**
 * Parse the Molden [MO] section into MO metadata and coefficient arrays.
 * @param {{lines:Array<{text:string,lineNo:number}>}|null} section
 * @param {number} basisCount
 * @returns {{mos:Array<Object>, moCount:number, basisCount:number}}
 */
function parseMoldenMoSection(section, basisCount) {
  if (!section) return { mos: [], moCount: 0, basisCount: basisCount | 0 };
  const mos = [];
  let current = null;
  let derivedBasisCount = basisCount | 0;

  function ensureCurrentOrbital(lineNo) {
    if (!current) {
      current = {
        symmetry: '',
        energy: null,
        spin: '',
        occupation: null,
        coeffMap: new Map(),
        maxCoeffIndex: 0,
        startedAtLine: lineNo,
      };
    }
    return current;
  }

  for (const entry of section.lines) {
    const trimmed = entry.text.trim();
    if (!trimmed) continue;
    const metaMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.*)$/);
    if (metaMatch) {
      const key = metaMatch[1].trim().toUpperCase();
      const value = String(metaMatch[2] || '').trim();
      if (key === 'SYM' && current && current.maxCoeffIndex > 0) {
        const done = finalizeMoldenOrbital(current, derivedBasisCount);
        if (done) mos.push(done);
        current = null;
      }
      const orbital = ensureCurrentOrbital(entry.lineNo);
      if (key === 'SYM') orbital.symmetry = value;
      else if (key === 'ENE') orbital.energy = parseLooseNumber(value);
      else if (key === 'SPIN') orbital.spin = value;
      else if (key === 'OCCUP') orbital.occupation = parseLooseNumber(value);
      continue;
    }
    const fields = trimmed.split(/\s+/);
    if (fields.length < 2) {
      throw new Error(`Malformed Molden [MO] line at ${entry.lineNo}: expected index and coefficient.`);
    }
    const coeffIndex = parseInt(fields[0], 10);
    const coeffValue = parseLooseNumber(fields[1]);
    if (!Number.isInteger(coeffIndex) || coeffIndex <= 0 || !Number.isFinite(coeffValue)) {
      throw new Error(`Malformed Molden [MO] coefficient line at ${entry.lineNo}.`);
    }
    const orbital = ensureCurrentOrbital(entry.lineNo);
    orbital.coeffMap.set(coeffIndex, coeffValue);
    if (coeffIndex > orbital.maxCoeffIndex) orbital.maxCoeffIndex = coeffIndex;
    if (coeffIndex > derivedBasisCount) derivedBasisCount = coeffIndex;
  }
  const done = finalizeMoldenOrbital(current, derivedBasisCount);
  if (done) mos.push(done);
  return { mos, moCount: mos.length, basisCount: derivedBasisCount };
}

/**
 * Parse a Molden file into one atom-bearing record with preserved basis/MO metadata.
 * Geometry is loaded into the scene; MO coefficients are preserved but not yet evaluated
 * onto volumetric grids in this parser.
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
 *   units:'angstrom'|'bohr',
 *   kind:'molden',
 *   molden:Object
 * }}
 */
function parseMolden(text) {
  const { sections } = splitMoldenSections(text);
  const header = String(text || '').trimStart();
  if (!/^\[molden format\]/i.test(header)) {
    throw new Error('Not a Molden file: missing [Molden Format] header.');
  }
  const atomsSection = sections.find(section => section.name === 'ATOMS');
  const titleSection = sections.find(section => section.name === 'TITLE');
  const gtoSection = sections.find(section => section.name === 'GTO') || null;
  const moSection = sections.find(section => section.name === 'MO') || null;
  const angularFlags = resolveMoldenAngularFlags(sections);
  const { atoms, units, atomUnitLabel } = parseMoldenAtomsSection(atomsSection);
  const basis = parseMoldenGtoSection(gtoSection, angularFlags);
  const orbitals = parseMoldenMoSection(moSection, basis.aoCount);
  /**
   * Placeholder indexer for Molden records (no voxel grid yet).
   * @returns {number}
   */
  const idx = () => 0;
  const titleLine = titleSection
    ? titleSection.lines.map(entry => entry.text.trim()).find(Boolean)
    : '';
  return {
    title: titleLine || 'Molden',
    comment: 'Molden Format',
    natoms: atoms.length,
    origin: [0, 0, 0],
    nxyz: [0, 0, 0],
    axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    atoms,
    data: new Float32Array(0),
    idx,
    units,
    kind: 'molden',
    molden: {
      atomUnit: atomUnitLabel,
      angularFlags,
      basis,
      basisCount: orbitals.basisCount,
      moCount: orbitals.moCount,
      mos: orbitals.mos,
    },
  };
}

  global.VibeMolParsers = { arrayMinMax, parseCube, parseTwoComponentCube, parseXYZ, parseMolden };
})(window);
