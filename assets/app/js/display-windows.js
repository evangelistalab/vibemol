(function (global) {
  'use strict';

  const WINDOW_IDS = Object.freeze({
    DISPLAY_INSPECTOR: 'displayInspector',
    MOLDEN_INSPECTOR: 'moldenInspector',
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
    WINDOW_IDS.VIEW_INSPECTOR,
    WINDOW_IDS.VIEW_PANEL,
    WINDOW_IDS.COORDS_PANEL,
    WINDOW_IDS.TRAJECTORY_PANEL,
    WINDOW_IDS.VIBRATION_PANEL,
  ]);

  const EXCLUSIVE_WINDOW_IDS = Object.freeze([
    WINDOW_IDS.MOLDEN_INSPECTOR,
    WINDOW_IDS.VIEW_INSPECTOR,
    WINDOW_IDS.VIEW_PANEL,
    WINDOW_IDS.COORDS_PANEL,
    WINDOW_IDS.TRAJECTORY_PANEL,
    WINDOW_IDS.VIBRATION_PANEL,
  ]);

  function createDisplayWindowsController(deps) {
    const entries = Object.freeze(Object.assign({}, deps && deps.entries || {}));
    const menuEl = deps && deps.menuEl ? deps.menuEl : null;
    const positionFloatingPopover = deps && deps.positionFloatingPopover;
    const updateAdaptiveMenuUi = deps && deps.updateAdaptiveMenuUi;
    const getCurrentMode = deps && deps.getCurrentMode;
    const getDisplayModeValue = deps && deps.getDisplayModeValue;
    const getEditModeValue = deps && deps.getEditModeValue;
    const getCurrentRecord = deps && deps.getCurrentRecord;
    const getTrajectoryEnabled = deps && deps.getTrajectoryEnabled;
    const getVibrationEnabled = deps && deps.getVibrationEnabled;
    const getToolbarElement = deps && deps.getToolbarElement;
    const getMenuTopInset = deps && deps.getMenuTopInset;
    const isSidebarCollapsed = deps && deps.isSidebarCollapsed;
    let exclusiveSyncDepth = 0;

    if (typeof positionFloatingPopover !== 'function' || typeof updateAdaptiveMenuUi !== 'function') {
      throw new Error('VibeMolDisplayWindows requires positionFloatingPopover and updateAdaptiveMenuUi.');
    }
    if (typeof getCurrentMode !== 'function' || typeof getEditModeValue !== 'function') {
      throw new Error('VibeMolDisplayWindows requires getCurrentMode and getEditModeValue.');
    }
    if (typeof getCurrentRecord !== 'function' || typeof getTrajectoryEnabled !== 'function' || typeof getVibrationEnabled !== 'function') {
      throw new Error('VibeMolDisplayWindows requires record and playback state readers.');
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

    function positionAdaptiveMenu() {
      if (!menuEl) return;
      const gap = 12;
      const topInset = typeof getMenuTopInset === 'function' ? Number(getMenuTopInset()) || 56 : 56;
      let left = gap;
      let top = topInset;
      const toolbarEl = typeof getToolbarElement === 'function' ? getToolbarElement() : null;
      const collapsed = typeof isSidebarCollapsed === 'function'
        ? !!isSidebarCollapsed()
        : !!(global.document && global.document.body && global.document.body.classList.contains('sidebar-collapsed'));
      if (!collapsed && toolbarEl && typeof toolbarEl.getBoundingClientRect === 'function') {
        const toolbarRect = toolbarEl.getBoundingClientRect();
        if (toolbarRect && Number.isFinite(toolbarRect.right) && toolbarRect.width > 0) {
          left = Math.round(toolbarRect.right + gap);
        }
        if (toolbarRect && Number.isFinite(toolbarRect.top)) {
          top = Math.max(topInset, Math.round(toolbarRect.top + topInset));
        }
      }
      const viewportWidth = Math.max(
        1,
        Math.round(global.innerWidth || 0),
        Math.round((global.document && global.document.documentElement && global.document.documentElement.clientWidth) || 0)
      );
      const menuWidth = Math.max(0, Math.round(menuEl.getBoundingClientRect().width || menuEl.offsetWidth || 0));
      const maxLeft = Math.max(gap, viewportWidth - menuWidth - gap);
      menuEl.style.left = `${Math.min(left, maxLeft)}px`;
      menuEl.style.top = `${top}px`;
      menuEl.style.right = 'auto';
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

    function computeMenuState() {
      const record = getCurrentRecord() || null;
      const vol = record && record.vol ? record.vol : null;
      const hasRecord = !!record;
      const hasAtoms = !!(vol && Array.isArray(vol.atoms) && vol.atoms.length > 0);
      const molden = vol && vol.kind === 'molden' && vol.molden ? vol.molden : null;
      const showMolden = !!(molden && Array.isArray(molden.mos) && molden.mos.length > 0);
      const showViewActions = hasAtoms;
      const showView = hasRecord;
      const showCoords = hasAtoms;
      const showTrajectory = !!getTrajectoryEnabled();
      const showVibration = !!getVibrationEnabled();
      const currentMode = getCurrentMode();
      const isVisible = (
        (typeof getDisplayModeValue === 'function' ? currentMode === getDisplayModeValue() : currentMode !== getEditModeValue())
        && (showMolden || showViewActions || showView || showCoords || showTrajectory || showVibration)
      );
      return {
        showMolden,
        showViewActions,
        showView,
        showCoords,
        showTrajectory,
        showVibration,
        isVisible,
      };
    }

    function syncAdaptiveMenu() {
      const state = computeMenuState();
      const moldenEntry = getEntry(WINDOW_IDS.MOLDEN_INSPECTOR);
      const viewInspectorEntry = getEntry(WINDOW_IDS.VIEW_INSPECTOR);
      const viewPanelEntry = getEntry(WINDOW_IDS.VIEW_PANEL);
      const coordsEntry = getEntry(WINDOW_IDS.COORDS_PANEL);
      const trajectoryEntry = getEntry(WINDOW_IDS.TRAJECTORY_PANEL);
      const vibrationEntry = getEntry(WINDOW_IDS.VIBRATION_PANEL);

      if (!state.showMolden && moldenEntry && moldenEntry.isOpen()) moldenEntry.setOpen(false);
      if (!state.showViewActions && viewInspectorEntry && viewInspectorEntry.isOpen()) viewInspectorEntry.setOpen(false);
      if (!state.showView && viewPanelEntry && viewPanelEntry.isOpen()) viewPanelEntry.setOpen(false);
      if (!state.showCoords && coordsEntry && coordsEntry.isOpen()) coordsEntry.setOpen(false);
      if (!state.showTrajectory && trajectoryEntry && trajectoryEntry.isOpen()) trajectoryEntry.setOpen(false);
      if (!state.showVibration && vibrationEntry && vibrationEntry.isOpen()) vibrationEntry.setOpen(false);

      updateAdaptiveMenuUi({
        menuEl,
        isVisible: state.isVisible,
        positionMenu: positionAdaptiveMenu,
        onHideAllPopovers: () => closeWindows(EXCLUSIVE_WINDOW_IDS),
        visibleItems: [
          { el: moldenEntry && moldenEntry.buttonEl, visible: state.showMolden },
          { el: viewInspectorEntry && viewInspectorEntry.buttonEl, visible: state.showViewActions },
          { el: viewPanelEntry && viewPanelEntry.buttonEl, visible: state.showView },
          { el: coordsEntry && coordsEntry.buttonEl, visible: state.showCoords },
          { el: trajectoryEntry && trajectoryEntry.buttonEl, visible: state.showTrajectory },
          { el: vibrationEntry && vibrationEntry.buttonEl, visible: state.showVibration },
        ],
        activeItems: [
          { el: moldenEntry && moldenEntry.buttonEl, active: !!(moldenEntry && moldenEntry.isOpen()) },
          { el: viewInspectorEntry && viewInspectorEntry.buttonEl, active: !!(viewInspectorEntry && viewInspectorEntry.isOpen()) },
          { el: viewPanelEntry && viewPanelEntry.buttonEl, active: !!(viewPanelEntry && viewPanelEntry.isOpen()) },
          { el: coordsEntry && coordsEntry.buttonEl, active: !!(coordsEntry && coordsEntry.isOpen()) },
          { el: trajectoryEntry && trajectoryEntry.buttonEl, active: !!(trajectoryEntry && trajectoryEntry.isOpen()) },
          { el: vibrationEntry && vibrationEntry.buttonEl, active: !!(vibrationEntry && vibrationEntry.isOpen()) },
        ],
        metaItems: [],
      });

      if (moldenEntry && moldenEntry.isOpen()) positionInspectorPopover(WINDOW_IDS.MOLDEN_INSPECTOR);
      if (viewInspectorEntry && viewInspectorEntry.isOpen()) positionInspectorPopover(WINDOW_IDS.VIEW_INSPECTOR);
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
      syncAdaptiveMenu,
    });
  }

  global.VibeMolDisplayWindows = Object.freeze({
    WINDOW_IDS,
    ESCAPABLE_WINDOW_IDS,
    EXCLUSIVE_WINDOW_IDS,
    createDisplayWindowsController,
  });
})(window);
