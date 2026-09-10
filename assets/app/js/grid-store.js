(function (global) {
  'use strict';

  // Grid buffers belong to this cache and are read-only to consumers. Changing
  // an orbital or grid setting selects a new entry instead of replacing data.
  function createGridStore({ maxEntriesPerSource = 16, maxBytesPerSource = 128 * 1024 * 1024 } = {}) {
    const sources = new WeakMap();
    const maxEntries = Math.max(1, Number(maxEntriesPerSource) || 16);
    const maxBytes = Math.max(1, Number(maxBytesPerSource) || 128 * 1024 * 1024);
    function get(source, key, evaluate) {
      let entries = sources.get(source);
      if (!entries) { entries = new Map(); sources.set(source, entries); }
      if (entries.has(key)) {
        const grid = entries.get(key);
        entries.delete(key);
        entries.set(key, grid);
        return grid;
      }
      const grid = evaluate();
      if (!grid) return null;
      Object.freeze(grid.origin);
      grid.axes.forEach(Object.freeze);
      Object.freeze(grid.axes);
      Object.freeze(grid.nxyz);
      Object.freeze(grid);
      entries.set(key, grid);
      let bytes = Array.from(entries.values()).reduce((sum, entry) => sum + (entry.data.byteLength || entry.data.length * 4), 0);
      while (entries.size && (entries.size > maxEntries || bytes > maxBytes)) {
        const oldest = entries.keys().next().value;
        const data = entries.get(oldest).data;
        bytes -= data.byteLength || data.length * 4;
        entries.delete(oldest);
      }
      return grid;
    }
    return Object.freeze({ get, invalidate: source => sources.delete(source) });
  }
  global.VibeMolGridStore = Object.freeze({ createGridStore });
})(typeof window !== 'undefined' ? window : globalThis);
