(function (global) {
  'use strict';

  // Display placeholders remain available; chemistry must reject unknown identity.
  // Atomic-number validity includes X/Dummy and physical elements through118.
  // Metadata-dependent chemistry additionally requires a real table entry. The
  // bundled table currently ends at100; parser/structure guards enforce that
  // supported domain, with an explicit catalog-census tripwire.
  function requireAtomicNumber(value) {
    const z = typeof value === 'number' ? value
      : typeof value === 'string' && value.trim() ? Number(value) : NaN;
    if (!Number.isInteger(z) || z < 0 || z > 118) {
      throw new RangeError(`Unsupported atomic number: ${String(value)} (expected an integer from 0 to 118).`);
    }
    return z;
  }

  function getElementSymbol(z, table) {
    const info = table && table[z];
    if (info && typeof info.symbol === 'string' && info.symbol.trim()) return info.symbol.trim();
    return `Z${z | 0}`;
  }

  function getElementSymbolByAtomicNumber(z, table) {
    const info = table && table[z | 0];
    return info && info.symbol ? String(info.symbol) : `Z${z | 0}`;
  }

  function getElementSymbolRaw(z, table) {
    const n = requireAtomicNumber(z);
    const symbol = table && table[n] && table[n].symbol;
    if (typeof symbol !== 'string' || !symbol.trim()) {
      throw new RangeError(`Missing element metadata for atomic number ${n}.`);
    }
    return symbol.trim();
  }

  function isTransitionMetalAtomicNumber(z) {
    const n = requireAtomicNumber(z);
    return (
      (n >= 21 && n <= 30) ||
      (n >= 39 && n <= 48) ||
      (n >= 72 && n <= 80) ||
      (n >= 104 && n <= 112)
    );
  }

  function isLanthanideOrActinideAtomicNumber(z) {
    const n = requireAtomicNumber(z);
    return (n >= 57 && n <= 71) || (n >= 89 && n <= 103);
  }

  function requireClampInputs(value, min, max) {
    if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || min > max) {
      throw new RangeError(`Invalid clamp: value=${String(value)} (${typeof value}), min=${String(min)} (${typeof min}), max=${String(max)} (${typeof max}); expected finite numbers and min <= max.`);
    }
  }

  function clamp(value, min, max) {
    requireClampInputs(value, min, max);
    return Math.max(min, Math.min(max, value));
  }

  // Share rejection while preserving each finite-input IEEE/signed-zero result.
  function clampOrZero(value, min, max) {
    requireClampInputs(value, min, max);
    return Math.max(min, Math.min(max, value || 0));
  }

  function clampWithUpperPriority(value, min, max) {
    requireClampInputs(value, min, max);
    return Math.min(max, Math.max(min, value));
  }

  global.VibeMolElementUtils = Object.freeze({
    getElementSymbol,
    getElementSymbolByAtomicNumber,
    getElementSymbolRaw,
    isTransitionMetalAtomicNumber,
    isLanthanideOrActinideAtomicNumber,
    clamp,
    clampOrZero,
    clampWithUpperPriority,
  });
})(typeof window !== 'undefined' ? window : globalThis);
