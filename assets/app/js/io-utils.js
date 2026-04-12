(function () {
  function getCanonicalElementSymbol(token) {
    const raw = String(token || '').trim();
    if (!raw) return '';
    const upper = raw.toUpperCase();
    if (window.ATOM_SYMBOL_TO_Z && Object.prototype.hasOwnProperty.call(window.ATOM_SYMBOL_TO_Z, upper)) {
      const z = window.ATOM_SYMBOL_TO_Z[upper];
      const info = window.ATOM_Z_TO_DATA && window.ATOM_Z_TO_DATA[z];
      return String((info && info.symbol) || raw);
    }
    const z = Number(raw);
    if (Number.isInteger(z) && z > 0) {
      const info = window.ATOM_Z_TO_DATA && window.ATOM_Z_TO_DATA[z];
      if (info && info.symbol) return String(info.symbol);
    }
    return '';
  }

  function isKnownElementSymbol(symbol) {
    return !!getCanonicalElementSymbol(symbol);
  }

  function isFiniteCoordinateToken(token) {
    const text = String(token || '').trim();
    if (!text) return false;
    return Number.isFinite(Number(text));
  }

  function isValidXyzCoordinateLine(line) {
    const parts = String(line || '').trim().split(/\s+/);
    if (parts.length < 4) return false;
    if (!isKnownElementSymbol(parts[0])) return false;
    return isFiniteCoordinateToken(parts[1])
      && isFiniteCoordinateToken(parts[2])
      && isFiniteCoordinateToken(parts[3]);
  }

  function normalizeXyzCoordinateLine(line) {
    const parts = String(line || '').trim().split(/\s+/);
    if (parts.length < 4) return '';
    const symbol = getCanonicalElementSymbol(parts[0]);
    if (!symbol) return '';
    if (!isFiniteCoordinateToken(parts[1]) || !isFiniteCoordinateToken(parts[2]) || !isFiniteCoordinateToken(parts[3])) {
      return '';
    }
    return `${symbol} ${parts[1]} ${parts[2]} ${parts[3]}`;
  }

  /**
   * Detect and normalize XYZ text in either full XYZ or coordinates-only form.
   * Returns normalized XYZ text ready for parseXYZ, or null when the text does
   * not look like an XYZ structure.
   * @param {string} text
   * @param {{comment?:string}=} options
   * @returns {{atomCount:number,wrapped:boolean,xyzText:string}|null}
   */
  function detectAndNormalizeXyzText(text, options = {}) {
    const raw = String(text == null ? '' : text).replace(/\r/g, '');
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const nonEmptyLines = trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!nonEmptyLines.length) return null;

    let cursor = 0;
    let firstFrameAtomCount = null;
    const normalizedBlocks = [];
    while (cursor < nonEmptyLines.length) {
      const countRaw = Number(nonEmptyLines[cursor]);
      if (!Number.isInteger(countRaw) || countRaw < 0) {
        normalizedBlocks.length = 0;
        break;
      }
      if (cursor + 1 >= nonEmptyLines.length) {
        normalizedBlocks.length = 0;
        break;
      }
      const frameAtomCount = countRaw | 0;
      if (firstFrameAtomCount == null) firstFrameAtomCount = frameAtomCount;
      else if (frameAtomCount !== firstFrameAtomCount) {
        normalizedBlocks.length = 0;
        break;
      }
      const atomLines = nonEmptyLines.slice(cursor + 2, cursor + 2 + frameAtomCount);
      const normalizedAtomLines = atomLines.map(normalizeXyzCoordinateLine);
      if (atomLines.length !== frameAtomCount || !normalizedAtomLines.every(Boolean)) {
        normalizedBlocks.length = 0;
        break;
      }
      normalizedBlocks.push(`${frameAtomCount}\n${nonEmptyLines[cursor + 1]}\n${normalizedAtomLines.join('\n')}`);
      cursor += frameAtomCount + 2;
    }
    if (normalizedBlocks.length && cursor === nonEmptyLines.length) {
      return {
        atomCount: firstFrameAtomCount == null ? 0 : firstFrameAtomCount,
        wrapped: false,
        xyzText: `${normalizedBlocks.join('\n')}\n`,
      };
    }

    if (nonEmptyLines.every(isValidXyzCoordinateLine)) {
      const comment = String(options.comment || 'Pasted XYZ');
      const normalizedAtomLines = nonEmptyLines.map(normalizeXyzCoordinateLine);
      return {
        atomCount: nonEmptyLines.length,
        wrapped: true,
        xyzText: `${nonEmptyLines.length}\n${comment}\n${normalizedAtomLines.join('\n')}\n`,
      };
    }

    return null;
  }

  /**
   * Detect one high-level file kind by name/content.
   * @param {string} name
   * @param {string=} text
   * @returns {'xyz'|'cube'|'two_component_cube'|'molden'|'vibration_payload'|'orca_hess'|'psi4_output'|'json'|'unknown'}
   */
  function detectInputFileKind(name, text) {
    const lower = String(name || '').trim().toLowerCase();
    const body = String(text || '');
    if (lower.endsWith('.xyz')) return 'xyz';
    if (lower.endsWith('.molden') || /^\s*\[molden format\]/im.test(body)) return 'molden';
    if (lower.endsWith('.2ccube')) return 'two_component_cube';
    if (lower.endsWith('.cube') || lower.endsWith('.cub')) return 'cube';
    if (lower.endsWith('.hess')) return 'orca_hess';
    if (lower.endsWith('.vib.json') || lower.endsWith('.vmodes.json') || lower.endsWith('.modes.json')) return 'vibration_payload';
    if (lower.endsWith('.json')) return 'json';
    if (lower.endsWith('.out') || lower.endsWith('.output') || lower.endsWith('.dat')) {
      if (/\b==>\s*geometry\s*<==/i.test(body) && /\bharmonic frequencies/i.test(body)) return 'psi4_output';
    }
    return 'unknown';
  }

  window.VibeMolIOUtils = Object.freeze({
    detectInputFileKind,
    detectAndNormalizeXyzText,
  });
})();
