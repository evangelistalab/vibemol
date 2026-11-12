(function (global) {
// Format-boundary validation deliberately needs no DOM or metadata loading.
// Keep the catalog-domain census in atomic-identity.test.mjs in step with this
// and structure's independent guard; X/Dummy is the supported zero entry.
function requireParsedAtomicNumber(z, label) {
  if (!Number.isInteger(z) || z < 0 || z > 100) {
    throw new Error(`${label}: unsupported atomic number ${String(z)} (expected an integer from 0 to 100 in the bundled catalog).`);
  }
  return z;
}
/**
 * Atom record used by parsed molecular files.
 * Coordinates use the units of their enclosing volume.
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
 * Reject malformed tokens so each value stays at its declared grid position.
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
        const token = parts[partIndex++];
        // Ordinary voxel values need no exponent normalization.
        let n = +token;
        if (Number.isNaN(n)) n = parseLooseNumber(token);
        if (Number.isFinite(n)) return n;
        throw new Error(`Malformed CUBE numeric token "${token}" at line ${lineIndex}.`);
      }
      if (!loadNextLine()) return null;
    }
  };
}

/**
 * Read exactly `length` values from a tokenizer into a `Float32Array`.
 * @param {() => (number|null)} nextNumber
 * @param {number} length
 * @param {number|null} firstValue
 * @returns {Float32Array}
 */
function readFloatArray(nextNumber, length, firstValue = null) {
  const out = new Float32Array(length);
  if (firstValue !== null) out[0] = firstValue;
  for (let i = firstValue === null ? 0 : 1; i < length; i++) {
    const n = nextNumber();
    if (n == null) {
      throw new Error(`Data size mismatch. Expected ${length}, got ${i}`);
    }
    out[i] = n;
  }
  return out;
}

// Scalar CUBE fields are interleaved with the dataset index varying fastest.
function readCubeDatasets(nextNumber, total, count) {
  if (count === 1) return [readFloatArray(nextNumber, total)];
  const fields = Array.from({ length: count }, () => new Float32Array(total));
  for (let voxel = 0; voxel < total; voxel++) {
    for (let field = 0; field < count; field++) {
      const value = nextNumber();
      if (value == null) {
        throw new Error(`Data size mismatch. Expected ${total * count}, got ${voxel * count + field}`);
      }
      fields[field][voxel] = value;
    }
  }
  return fields;
}

function parseCubeIsoHint(comment) {
  const match = comment.match(/\(([-+]?\d*\.?\d+(?:[eEdD][+-]?\d+)?)\s*,\s*([-+]?\d*\.?\d+(?:[eEdD][+-]?\d+)?)\)/);
  return match ? parseLooseNumber(match[1]) : null;
}

// Grid consumers share the Bohr representation for axes, origin, and atoms.
const CUBE_BOHR_TO_ANGSTROM = 0.529177210903;

function parseCubeHeader(text, format) {
  const lines = text.replace(/\r/g, '').split('\n');
  if (lines.length < 6) throw new Error(`Not enough lines for a ${format} file.`);
  const [title, comment] = lines;
  const header = lines[2].trim().split(/\s+/);
  const [rawAtomCount, ...coordinates] = header;
  const atomCount = Number(rawAtomCount);
  const origin = coordinates.slice(0, 3).map(parseLooseNumber);
  const nval = header[4] === undefined ? 1 : Number(header[4]);
  if (!Number.isSafeInteger(atomCount) || origin.length !== 3 || !origin.every(Number.isFinite)) {
    throw new Error(`Malformed ${format} header at line 3 (expected atom count and origin coordinates).`);
  }
  if (!Number.isSafeInteger(nval) || nval < 1 || (atomCount < 0 && nval !== 1)) {
    throw new Error(`Malformed ${format} header at line 3 (invalid NVAL for this atom count).`);
  }

  const grid = lines.slice(3, 6).map(line => line.trim().split(/\s+/).slice(0, 4).map(parseLooseNumber));
  if (grid.some(row => row.length !== 4 || !row.every(Number.isFinite) || !Number.isSafeInteger(row[0]) || row[0] === 0)) {
    throw new Error(`Malformed ${format} grid header at lines 4-6 (expected nonzero integer counts and axis vectors).`);
  }
  const angstrom = grid[0][0] < 0;
  if (grid.some(row => (row[0] < 0) !== angstrom)) {
    throw new Error(`Malformed ${format} grid header: mixed voxel-count signs leave the coordinate unit ambiguous.`);
  }
  const toBohr = value => angstrom ? value / CUBE_BOHR_TO_ANGSTROM : value;
  const nxyz = grid.map(row => Math.abs(row[0]));
  const axes = grid.map(row => row.slice(1).map(toBohr));

  const natoms = Math.abs(atomCount);
  const atoms = [];
  for (let i = 0; i < natoms; i++) {
    const lineNo = 7 + i;
    const raw = (lines[6 + i] || '').trim();
    if (!raw) throw new Error(`Malformed ${format} atom line ${lineNo} (missing atom record).`);
    const p = raw.split(/\s+/).slice(0, 5).map(parseLooseNumber);
    if (p.length < 5 || !p.every(Number.isFinite)) {
      throw new Error(`Malformed ${format} atom line ${lineNo} (expected: Z q x y z).`);
    }
    atoms.push({ Z: requireParsedAtomicNumber(p[0], `Malformed ${format} atom line ${lineNo}`),
      x: toBohr(p[2]), y: toBohr(p[3]), z: toBohr(p[4]), formalCharge: 0 });
  }

  let dataStart = 6 + natoms;
  // ORCA compatibility: some positive-atom-count cubes have one legacy id row.
  if (atomCount >= 0 && nval === 1 && /ORCA/i.test(title) && /^1\s+[-+]?\d+$/.test((lines[dataStart] || '').trim())) {
    dataStart++;
  }
  const nextNumber = createNumberTokenizer(lines, dataStart);
  let datasetIds = null;
  if (atomCount < 0) {
    const count = nextNumber();
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new Error('Malformed CUBE dataset header (invalid dataset count after atom block).');
    }
    datasetIds = [];
    for (let i = 0; i < count; i++) {
      const id = nextNumber();
      if (!Number.isSafeInteger(id)) {
        throw new Error('Malformed CUBE dataset header (missing or invalid dataset id after atom block).');
      }
      datasetIds.push(id);
    }
  }
  const count = datasetIds ? datasetIds.length : nval;
  const [numx, numy, numz] = nxyz;
  const total = numx * numy * numz;
  if (!Number.isSafeInteger(total * count) || total * count > text.length) {
    throw new Error(`Data size mismatch. The ${format} dimensions and dataset count exceed the available input.`);
  }
  const idx = (i, j, k) => (i * numy + j) * numz + k;
  const volume = { title, comment, natoms, origin: origin.map(toBohr), nxyz, axes, atoms };
  return { volume, idx, isoHint: parseCubeIsoHint(comment), total, count, datasetIds, nextNumber };
}

/** Parse a scalar CUBE, retaining separately addressable fields when present. */
function parseCube(text) {
  const { volume, idx, isoHint, total, count, datasetIds, nextNumber } = parseCubeHeader(text, 'CUBE');
  const fields = readCubeDatasets(nextNumber, total, count);
  if (nextNumber() != null) throw new Error(`Data size mismatch. More than ${total * count} CUBE values for the declared datasets.`);
  const parsed = { ...volume, data: fields[0], idx, units: 'bohr', isoHint };
  if (count > 1) {
    parsed.datasets = fields.map((data, index) => ({
      id: datasetIds?.[index] ?? null, data,
    }));
  }
  return parsed;
}

/**
 * Parse a two-component CUBE. Legacy files store four consecutive blocks
 * (or just alphaRe); an explicit four-field header declares interleaving.
 */
function parseTwoComponentCube(text) {
  const { volume, idx, isoHint, total, count, nextNumber } = parseCubeHeader(text, '2C CUBE');
  let alphaRe, alphaIm, betaRe, betaIm;
  let isTwoComponent = true;
  if (count === 4) {
    [alphaRe, alphaIm, betaRe, betaIm] = readCubeDatasets(nextNumber, total, count);
  } else if (count === 1) {
    alphaRe = readFloatArray(nextNumber, total);
    const firstCompanion = nextNumber();
    isTwoComponent = firstCompanion != null;
    if (isTwoComponent) {
      alphaIm = readFloatArray(nextNumber, total, firstCompanion);
      betaRe = readFloatArray(nextNumber, total);
      betaIm = readFloatArray(nextNumber, total);
    } else {
      alphaIm = new Float32Array(total);
      betaRe = new Float32Array(total);
      betaIm = new Float32Array(total);
    }
  } else {
    throw new Error(`A 2C CUBE needs one or four fields; this file declares ${count}. Open scalar datasets as a .cube file.`);
  }
  if (nextNumber() != null) throw new Error('Data size mismatch. Extra values after the 2C CUBE channels.');
  return { ...volume, alphaRe, alphaIm, betaRe, betaIm, idx, units: 'bohr', isoHint, isTwoComponent, data: alphaRe };
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
  const atomNumbers = [];
  let firstFrameAtoms = null;

  while (cursor < lines.length) {
    while (cursor < lines.length && !(lines[cursor] || '').trim()) cursor++;
    if (cursor >= lines.length) break;

    const blockStartLine = cursor + 1;
    const countRaw = (lines[cursor] || '').trim();
    if (!countRaw) throw new Error(`Malformed XYZ file at line ${blockStartLine}: missing atom count.`);
    const natomsVal = Number(countRaw);
    if (!Number.isSafeInteger(natomsVal) || natomsVal < 0) {
      throw new Error(`Malformed XYZ file at line ${blockStartLine}: atom count must be a non-negative integer.`);
    }
    const frameNatoms = natomsVal;
    if (natoms == null) natoms = frameNatoms;
    else if (frameNatoms !== natoms) {
      throw new Error(`Malformed XYZ trajectory at line ${blockStartLine}: atom count ${frameNatoms} does not match first frame count ${natoms}.`);
    }

    const commentIndex = cursor + 1;
    if (commentIndex >= lines.length) {
      throw new Error(`Malformed XYZ file: missing comment line after atom count at line ${blockStartLine}.`);
    }
    const comment = lines[commentIndex] || '';
    if (frameNatoms > lines.length - commentIndex - 1) {
      throw new Error(`Malformed XYZ file: expected ${frameNatoms} atom lines after line ${commentIndex + 1}, but file ended early.`);
    }

    const frame = new Float32Array(frameNatoms * 3);
    const frameAtoms = [];
    for (let i = 0; i < frameNatoms; i++) {
      const rowIndex = cursor + 2 + i;
      const lineNo = rowIndex + 1;
      const l = (lines[rowIndex] || '').trim();
      if (!l) throw new Error(`Malformed XYZ file at line ${lineNo}: missing atom record.`);
      const parts = l.split(/\s+/);
      if (parts.length < 4) {
        throw new Error(`Malformed XYZ file at line ${lineNo}: expected "Element X Y Z".`);
      }
      const sym = parts[0];
      const label = sym.toUpperCase().replace(/^([A-Z]+)\d+$/, '$1');
      const key = label === 'D' || label === 'T' ? 'H' : label;
      const table = window.ATOM_SYMBOL_TO_Z || {};
      const number = Number(sym);
      const atomicNumber = key === 'BQ' ? 0 : (!Number.isNaN(number) ? number : (Object.hasOwn(table, key) ? table[key] : null));
      if (atomicNumber === null) {
        throw new Error(`Malformed XYZ file at line ${lineNo}: unknown element symbol "${sym}".`);
      }
      const Z = requireParsedAtomicNumber(atomicNumber, `Malformed XYZ atom line ${lineNo}`);
      const x = parseLooseNumber(parts[1]);
      const y = parseLooseNumber(parts[2]);
      const z = parseLooseNumber(parts[3]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        throw new Error(`Malformed XYZ file at line ${lineNo}: coordinates must be numeric.`);
      }

      if (atomNumbers.length <= i) atomNumbers.push(Z);
      else if (atomNumbers[i] !== Z) {
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
    while (cursor < lines.length && !lines[cursor].trim()) cursor++;
    if (cursor < lines.length) {
      const next = lines[cursor].trim().split(/\s+/);
      if (next.length >= 4 && next.slice(1, 4).every(token => Number.isFinite(parseLooseNumber(token)))) {
        throw new Error(`Malformed XYZ file: atom count ${frameNatoms} at line ${blockStartLine} is too small; extra atom record at line ${cursor + 1}.`);
      }
    }
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
  const token = String(zToken == null ? '' : zToken).trim();
  const z = Number(token.replace(/[dD]/g, 'e'));
  if (token && z !== 0) return requireParsedAtomicNumber(z, `Malformed Molden [Atoms] entry at line ${lineNo}`);
  if (symbolKey && window.ATOM_SYMBOL_TO_Z && Number.isInteger(window.ATOM_SYMBOL_TO_Z[symbolKey])) {
    return requireParsedAtomicNumber(window.ATOM_SYMBOL_TO_Z[symbolKey], `Malformed Molden [Atoms] entry at line ${lineNo}`);
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

/**
 * Read the reference geometry for the last Psi4 harmonic analysis, in native units.
 * Finite-difference jobs print the reference first, followed by displaced geometries.
 * Geometry printed after the analysis belongs to later work and must be ignored.
 * @param {string[]} lines
 * @param {string} sourceName
 * @returns {{atomSymbols:string[],coords:number[][],units:'bohr'|'angstrom'}}
 */
function parsePsi4Geometry(lines, sourceName) {
  const geometryHeader = /^\s*Geometry\s*\(in\s+([^)]*)\)/i;
  let harmonicStart = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/==>\s*Harmonic Vibrational Analysis\s*<==/i.test(lines[i])) {
      harmonicStart = i;
      break;
    }
  }
  if (harmonicStart < 0) {
    throw new Error(`Psi4 integration: missing "Harmonic Vibrational Analysis" section in "${sourceName}".`);
  }

  let geometryIndex = -1;
  let finiteDifferenceDepth = 0;
  let referenceIndex = -1;
  for (let i = 0; i < harmonicStart; i++) {
    const line = lines[i];
    if (/\bFiniteDifference Computations\b/i.test(line)) {
      if (finiteDifferenceDepth++ === 0) referenceIndex = -1;
    } else if (/\bFiniteDifference Results\b/i.test(line) && finiteDifferenceDepth > 0) {
      if (--finiteDifferenceDepth === 0 && referenceIndex >= 0) geometryIndex = referenceIndex;
    } else if (geometryHeader.test(line)) {
      if (finiteDifferenceDepth === 0) geometryIndex = i;
      else if (referenceIndex < 0) referenceIndex = i;
    }
  }
  if (geometryIndex < 0) {
    throw new Error(`Psi4 integration: could not find a Geometry (in Angstrom or Bohr) block before the harmonic analysis in "${sourceName}".`);
  }
  const unitLabel = lines[geometryIndex].match(geometryHeader)[1].trim().toLowerCase();
  if (!/^(?:bohr|angstroms?)$/.test(unitLabel)) {
    throw new Error(`Psi4 integration: unsupported geometry units "${unitLabel}" in "${sourceName}".`);
  }
  const atomSymbols = [], coords = [];
  for (let i = geometryIndex + 1; i < harmonicStart; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (atomSymbols.length) break;
      continue;
    }
    if (/^Center\b/i.test(line) || /^-+/.test(line)) continue;
    if (/^==>|^Nuclear repulsion\b|^Geometry\b|^\$/i.test(line)) break;
    const parts = line.split(/\s+/);
    const offset = /^\d+$/.test(parts[0]) && /^[A-Za-z]{1,3}$/.test(parts[1] || '') ? 1 : 0;
    const token = String(parts[offset] || '').toUpperCase();
    const symbols = window.ATOM_SYMBOL_TO_Z || {};
    const symbol = Number.isInteger(symbols[token]) ? token
      : (/^\d+$/.test(token) ? Object.keys(symbols).find(key => symbols[key] === Number(token)) : null);
    const values = parts.slice(offset + 1, offset + 4).map(parseLooseNumber);
    if (!(symbol && values.length === 3 && values.every(Number.isFinite))) {
      throw new Error(`Psi4 integration: malformed geometry row at line ${i + 1} in "${sourceName}".`);
    }
    atomSymbols.push(symbol);
    coords.push(values);
  }
  if (!atomSymbols.length) throw new Error(`Psi4 integration: empty geometry in "${sourceName}".`);
  return { atomSymbols, coords, units: unitLabel === 'bohr' ? 'bohr' : 'angstrom' };
}

  global.VibeMolParsers = { arrayMinMax, parseCube, parseTwoComponentCube, parseXYZ, parseMolden, parsePsi4Geometry };
})(window);
