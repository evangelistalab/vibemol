(function (global) {
  'use strict';

  const WINDOW_IDS = Object.freeze({
    DISPLAY_INSPECTOR: 'displayInspector',
    MOLDEN_INSPECTOR: 'moldenInspector',
    SPINOR_INFO: 'spinorInfo',
    VIEW_INSPECTOR: 'viewInspector',
    VIEW_PANEL: 'viewPanel',
    COORDS_PANEL: 'coordsPanel',
    TRAJECTORY_PANEL: 'trajectoryPanel',
    VIBRATION_PANEL: 'vibrationPanel',
    HELP_OVERLAY: 'helpOverlay',
    ELEMENT_COLOR_OVERLAY: 'elementColorOverlay',
  });

  const ESCAPABLE_WINDOW_IDS = Object.freeze([
    WINDOW_IDS.DISPLAY_INSPECTOR,
    WINDOW_IDS.MOLDEN_INSPECTOR,
    WINDOW_IDS.SPINOR_INFO,
    WINDOW_IDS.VIEW_INSPECTOR,
    WINDOW_IDS.VIEW_PANEL,
    WINDOW_IDS.COORDS_PANEL,
    WINDOW_IDS.TRAJECTORY_PANEL,
    WINDOW_IDS.VIBRATION_PANEL,
  ]);

  const EXCLUSIVE_WINDOW_IDS = Object.freeze([
    WINDOW_IDS.MOLDEN_INSPECTOR,
    WINDOW_IDS.SPINOR_INFO,
    WINDOW_IDS.VIEW_INSPECTOR,
    WINDOW_IDS.VIEW_PANEL,
    WINDOW_IDS.COORDS_PANEL,
    WINDOW_IDS.TRAJECTORY_PANEL,
    WINDOW_IDS.VIBRATION_PANEL,
  ]);

  function createDisplayWindowsController(deps) {
    const entries = Object.freeze(Object.assign({}, deps && deps.entries || {}));
    const positionFloatingPopover = deps && deps.positionFloatingPopover;
    let exclusiveSyncDepth = 0;

    if (typeof positionFloatingPopover !== 'function') {
      throw new Error('VibeMolDisplayWindows requires positionFloatingPopover.');
    }

    function getEntry(id) {
      const key = String(id || '').trim();
      if (!key) return null;
      return entries[key] || null;
    }

    function listOpenWindowIds(ids = undefined) {
      const keys = Array.isArray(ids) && ids.length ? ids : Object.keys(entries);
      return keys.filter((id) => {
        const entry = getEntry(id);
        return !!(entry && typeof entry.isOpen === 'function' && entry.isOpen());
      });
    }

    function closeWindows(ids = undefined) {
      const keys = Array.isArray(ids) && ids.length ? ids : Object.keys(entries);
      let closed = false;
      for (const id of keys) {
        const entry = getEntry(id);
        if (!entry || typeof entry.isOpen !== 'function' || typeof entry.setOpen !== 'function') continue;
        if (!entry.isOpen()) continue;
        entry.setOpen(false);
        closed = true;
      }
      return closed;
    }

    function closeExclusiveWindows(exceptId = '') {
      if (exclusiveSyncDepth > 0) return;
      exclusiveSyncDepth += 1;
      try {
        for (const id of EXCLUSIVE_WINDOW_IDS) {
          if (exceptId && id === exceptId) continue;
          const entry = getEntry(id);
          if (!entry || typeof entry.isOpen !== 'function' || typeof entry.setOpen !== 'function') continue;
          if (!entry.isOpen()) continue;
          entry.setOpen(false);
        }
      } finally {
        exclusiveSyncDepth = Math.max(0, exclusiveSyncDepth - 1);
      }
    }

    function toggleExclusiveWindow(id) {
      const entry = getEntry(id);
      if (!entry || typeof entry.isOpen !== 'function' || typeof entry.setOpen !== 'function') return;
      if (entry.isOpen()) entry.setOpen(false);
      else entry.setOpen(true);
    }

    function positionInspectorPopover(id) {
      const entry = getEntry(id);
      if (!entry || !entry.panelEl || !entry.buttonEl) return;
      if (!entry.panelEl.classList || !entry.panelEl.classList.contains('floatingAuxInspector')) return;
      positionFloatingPopover({
        popoverEl: entry.panelEl,
        triggerEl: entry.buttonEl,
        gap: 12,
        defaultWidth: 340,
        defaultHeight: 220,
      });
    }

    function positionOpenButtonAnchoredPopovers() {
      for (const id of EXCLUSIVE_WINDOW_IDS) {
        const entry = getEntry(id);
        if (!entry || typeof entry.isOpen !== 'function' || !entry.isOpen()) continue;
        positionInspectorPopover(id);
      }
    }

    return Object.freeze({
      ids: WINDOW_IDS,
      escapableIds: ESCAPABLE_WINDOW_IDS,
      exclusiveIds: EXCLUSIVE_WINDOW_IDS,
      getEntry,
      listOpenWindowIds,
      closeWindows,
      closeExclusiveWindows,
      toggleExclusiveWindow,
      positionOpenButtonAnchoredPopovers,
    });
  }

  global.VibeMolDisplayWindows = Object.freeze({
    WINDOW_IDS,
    ESCAPABLE_WINDOW_IDS,
    EXCLUSIVE_WINDOW_IDS,
    createDisplayWindowsController,
  });
})(window);
