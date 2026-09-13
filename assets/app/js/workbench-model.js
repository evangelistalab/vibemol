(function (global) {
  'use strict';
  const catalog = Object.freeze([
    { id: 'moldenInspector', panel: 'moldenInspector', label: 'Orbitals', icon: 'blur_on', place: 'right' },
    { id: 'coordsPanel', panel: 'coordsPanel', label: 'Coordinates', icon: 'table_rows', place: 'bottom' },
    { id: 'displayInspector', panel: 'displayInspector', label: 'Appearance', icon: 'tune', place: 'right' },
    { id: 'styleStudio', panel: 'styleStudio', label: 'Style Studio', icon: 'palette', place: 'right' },
    { id: 'viewInspector', panel: 'viewInspector', label: 'Quick actions', icon: 'bolt', place: 'right' },
    { id: 'viewPanel', panel: 'sidePanel', label: 'Camera', icon: 'view_in_ar', place: 'right' },
    { id: 'trajectoryPanel', panel: 'trajectoryPanel', label: 'Trajectory', icon: 'timeline', place: 'bottom' },
    { id: 'vibrationPanel', panel: 'vibrationPanel', label: 'Frequencies', icon: 'graphic_eq', place: 'bottom' },
    { id: 'spinorInfo', panel: 'spinorInfoPanel', label: 'Spinor info', icon: 'info', place: 'right' },
  ]);
  const ids = new Set(catalog.map(item => item.id));
  const clamp = (value, min, max, fallback) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : fallback));
  function normalize(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    const placements = {}, positions = {};
    for (const item of catalog) {
      const place = value.placements?.[item.id];
      placements[item.id] = ['right', 'bottom', 'float'].includes(place) ? place : item.place;
      const point = value.positions?.[item.id];
      if (point && Number.isFinite(point.left) && Number.isFinite(point.top)) positions[item.id] = {
        left: clamp(point.left, 0, 10000, 12), top: clamp(point.top, 0, 10000, 72) };
    }
    const list = key => Array.isArray(value[key]) ? [...new Set(value[key].filter(id => ids.has(id)))] : [];
    return { placements, positions, open: list('open'), parked: list('parked'),
      rightWidth: clamp(value.rightWidth, 300, 680, 380), bottomHeight: clamp(value.bottomHeight, 180, 480, 270),
      activeRight: ids.has(value.activeRight) ? value.activeRight : null,
      activeBottom: ids.has(value.activeBottom) ? value.activeBottom : null };
  }
  function regions({ width, height, sidebar = 0, right = false, bottom = false, rightWidth = 380, bottomHeight = 270, focus = false, top = 56 }) {
    const left = focus || width < 760 ? 0 : Math.max(0, Math.min(sidebar, width - 100));
    const compact = width - left < 700;
    const rw = !focus && right && !compact ? Math.min(rightWidth, width - left - 340) : 0;
    const bh = !focus && (bottom || (right && compact)) ? Math.min(bottomHeight, Math.max(100, height - top - 214)) : 0;
    return { left, compact, right: Math.max(0, rw), bottom: bh, top };
  }
  global.VibeMolWorkbenchModel = Object.freeze({ catalog, normalize, regions });
})(window);
