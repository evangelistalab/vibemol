(function (global) {
  'use strict';

  // Keep the legacy symbol policies distinct: UI labels trim strings, chemistry
  // profiles coerce atomic numbers/symbols, and bond inference reads raw symbols.
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
    return (table && table[z] && table[z].symbol) || '';
  }

  function isTransitionMetalAtomicNumber(z) {
    const n = z | 0;
    return (
      (n >= 21 && n <= 30) ||
      (n >= 39 && n <= 48) ||
      (n >= 72 && n <= 80) ||
      (n >= 104 && n <= 112)
    );
  }

  function isLanthanideOrActinideAtomicNumber(z) {
    const n = z | 0;
    return (n >= 57 && n <= 71) || (n >= 89 && n <= 103);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampOrZero(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  // Symmetry's original nesting chooses the upper bound for reversed ranges.
  function clampWithUpperPriority(value, min, max) {
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
