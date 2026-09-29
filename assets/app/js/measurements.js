(function (global) {
  'use strict';
  const BOHR = 0.529177210903, MAX_ENTRIES = 200;
  const sizes = { distance: 2, angle: 3, dihedral: 4 };
  const histories = new WeakMap();
  const clone = value => JSON.parse(JSON.stringify(value));
  function normalize(value = {}) {
    const seen = new Set(), entries = [];
    for (const item of Array.isArray(value?.entries) ? value.entries.slice(0, MAX_ENTRIES) : []) {
      if (!sizes[item?.type] || !Array.isArray(item.atomIds) || item.atomIds.length !== sizes[item.type]) continue;
      const atomIds = item.atomIds.map(String);
      if (atomIds.some(id => !id || id.length > 128) || new Set(atomIds).size !== atomIds.length) continue;
      const id = key(item.type, atomIds);
      if (!seen.has(id)) { entries.push({ id, type: item.type, atomIds }); seen.add(id); }
    }
    return { entries, units: value?.units === 'bohr' ? 'bohr' : 'angstrom',
      decimals: Number.isInteger(value?.decimals) ? Math.max(0, Math.min(6, value.decimals)) : 3 };
  }
  function key(type, ids) {
    // Reversing all four atoms preserves the signed dihedral convention.
    const tokens = ids.map(encodeURIComponent);
    const forward = tokens.join(':'), reverse = tokens.slice().reverse().join(':');
    return type + ':' + (forward < reverse ? forward : reverse);
  }
  function state(record) {
    if (!record) return normalize();
    if (!record.measurements) record.measurements = normalize();
    return record.measurements;
  }
  function history(record) {
    if (!histories.has(record)) histories.set(record, { undo: [], redo: [] });
    return histories.get(record);
  }
  function change(record, edit) {
    if (!record) return false;
    const before = clone(state(record)), next = clone(before); edit(next);
    if (JSON.stringify(before) === JSON.stringify(next)) return false;
    const h = history(record); h.undo.push(before); if (h.undo.length > 40) h.undo.shift(); h.redo = [];
    record.measurements = next; return true;
  }
  function add(record, atomIds) {
    return change(record, next => {
      for (const [type, size] of Object.entries(sizes)) {
        if (atomIds.length < size) continue;
        const ids = atomIds.slice(-size), id = key(type, ids);
        if (new Set(ids).size === size && !next.entries.some(item => item.id === id) && next.entries.length < MAX_ENTRIES) {
          next.entries.push({ id, type, atomIds: ids });
        }
      }
    });
  }
  function undo(record, redo = false) {
    if (!record) return false;
    const h = history(record), source = redo ? h.redo : h.undo, target = redo ? h.undo : h.redo;
    if (!source.length) return false;
    target.push(clone(state(record))); record.measurements = source.pop(); return true;
  }
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const norm = a => Math.hypot(...a);
  function value(type, p) {
    if (p.some(point => !point || point.some(v => !Number.isFinite(v)))) return null;
    if (type === 'distance') return norm(sub(p[0], p[1]));
    const a = sub(p[0], p[1]), b = sub(p[2], p[1]);
    if (norm(a) < 1e-10 || norm(b) < 1e-10) return null;
    if (type === 'angle') return Math.acos(Math.max(-1, Math.min(1, dot(a, b) / norm(a) / norm(b)))) * 180 / Math.PI;
    const u = b.map(v => v / norm(b)), c = sub(p[3], p[2]);
    const v = a.map((n, i) => n - u[i] * dot(a, u)), w = c.map((n, i) => n - u[i] * dot(c, u));
    if (norm(v) < 1e-10 || norm(w) < 1e-10) return null;
    return Math.atan2(dot(u, cross(v, w)), dot(v, w)) * 180 / Math.PI;
  }
  function rows(record) {
    const settings = state(record), atoms = record?.vol?.atoms || [], byId = new Map(atoms.map((a, i) => [String(a.id), i]));
    const scale = record?.vol?.units === 'bohr' ? BOHR : 1;
    return settings.entries.map(entry => {
      const indices = entry.atomIds.map(id => byId.get(id));
      const points = indices.map(i => atoms[i] ? [atoms[i].x * scale, atoms[i].y * scale, atoms[i].z * scale] : null);
      const raw = value(entry.type, points), unit = entry.type === 'distance' ? settings.units === 'bohr' ? 'Bohr' : 'Å' : '°';
      const converted = raw === null ? null : raw / (entry.type === 'distance' && settings.units === 'bohr' ? BOHR : 1);
      const number = converted === null ? '' : Number(converted.toFixed(settings.decimals)).toFixed(settings.decimals);
      return { ...entry, indices, points, value: raw, number, unit, atoms: indices.map(i => i === undefined ? '?' : i + 1).join('–'),
        text: converted === null ? 'Undefined' : number + ' ' + unit,
        reason: points.some(p => !p) ? 'An atom was removed' : raw === null ? 'Coincident or collinear atoms' : '' };
    });
  }
  const quote = value => '"' + String(value).replace(/"/g, '""') + '"';
  function csv(record, entries = rows(record)) {
    return [['Structure', 'Type', 'Atoms', 'Value', 'Unit', 'Status'], ...entries.map(r => [record?.name || '', r.type, r.atoms, r.number, r.unit, r.reason])]
      .map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
  }
  // Deterministic screen-space placement. Manual positions get first choice;
  // automatic labels move outwards from their anchor, with a leader line.
  function layoutLabels(items, width, height) {
    const placed = [];
    for (const item of [...items].sort((a, b) => Number(b.manual) - Number(a.manual))) {
      let best = null;
      for (let ring = 0; ring <= 24; ring++) {
        const count = ring ? 12 : 1;
        for (let i = 0; i < count; i++) {
          const angle = i * Math.PI * 2 / count, distance = ring * 12;
          const x = Math.max(item.w / 2 + 4, Math.min(width - item.w / 2 - 4, item.x + Math.cos(angle) * distance));
          const y = Math.max(item.h / 2 + 4, Math.min(height - item.h / 2 - 4, item.y + Math.sin(angle) * distance));
          const candidate = { ...item, x, y };
          if (!placed.some(p => Math.abs(x-p.x) < (item.w+p.w)/2+4 && Math.abs(y-p.y) < (item.h+p.h)/2+4)) { best = candidate; break; }
        }
        if (best || item.manual) break;
      }
      placed.push(best || { ...item, crowded: true });
    }
    return placed;
  }
  global.VibeMolMeasurements = Object.freeze({ MAX_ENTRIES, normalize, state, key, add, rows, value, csv, layoutLabels, undo,
    remove: (record, id) => change(record, next => { next.entries = next.entries.filter(item => item.id !== id); }),
    clear: record => change(record, next => { next.entries = []; }),
    configure: (record, patch) => change(record, next => Object.assign(next, normalize({ ...next, ...patch }))),
    canUndo: (record, redo = false) => !!record && history(record)[redo ? 'redo' : 'undo'].length > 0 });
})(window);
