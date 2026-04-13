(function (global) {
  'use strict';

  const FONT_KEY = 'vm.prefs.font';
  const VALID_FONT_PAIRS = new Set(['geist', 'inter', 'plex']);

  function normalizeFontPair(value) {
    return VALID_FONT_PAIRS.has(value) ? value : 'geist';
  }

  function readStorageValue(key) {
    try {
      return global.localStorage ? global.localStorage.getItem(key) : null;
    } catch (_) {
      return null;
    }
  }

  function writeStorageValue(key, value) {
    try {
      if (!global.localStorage) return;
      if (value == null || value === '' || value === 'geist') {
        global.localStorage.removeItem(key);
      } else {
        global.localStorage.setItem(key, String(value));
      }
    } catch (_) {
      // Ignore storage failures; preference simply becomes session-only.
    }
  }

  function getFontPair() {
    return normalizeFontPair(readStorageValue(FONT_KEY));
  }

  function applyFontPair(value) {
    const next = normalizeFontPair(value);
    const root = global.document && global.document.documentElement;
    if (!root) return next;
    if (next === 'geist') {
      root.removeAttribute('data-font');
    } else {
      root.setAttribute('data-font', next);
    }
    return next;
  }

  function setFontPair(value) {
    const next = normalizeFontPair(value);
    writeStorageValue(FONT_KEY, next);
    return applyFontPair(next);
  }

  global.VibeMolPrefs = Object.freeze({
    getFontPair,
    setFontPair,
    applyFontPair,
  });
})(window);
