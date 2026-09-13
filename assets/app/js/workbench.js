(function (global) {
  'use strict';
  const params = new URLSearchParams(global.location.search);
  if (params.get('workspaceLab') !== '1') return;
  const host = global.VibeMolWorkbenchHost;
  const model = global.VibeMolWorkbenchModel;
  if (!host || !model) return;
  const storageKey = 'vibemol.workbench.lab.v1';
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch (_) { /* Browser storage is optional. */ }
  let state = model.normalize(stored.last);
  let saved = Array.isArray(stored.saved) ? stored.saved.filter(item => typeof item?.name === 'string')
    .slice(0, 8).map(item => ({ name: item.name.slice(0, 48), layout: model.normalize(item.layout) })) : [];
  let focus = false, compactBeforeFocus = false, sidebarBeforeFocus = false, scheduled = false, saving = 0, lastRegionKey = '';
  let menuReturn = null, snapPlace = null, draggingId = null, narrow = global.innerWidth < 760;
  let editPanels = null;
  const pending = new Set(state.open);
  const restorePositions = new Set(Object.keys(state.positions));
  const previousOpen = new Set();
  const entries = model.catalog.map(item => ({ ...item, root: document.getElementById(item.panel), entry: host.windows.getEntry(item.id) }));
  const byId = new Map(entries.map(item => [item.id, item]));
  const body = document.body;
  body.classList.add('vm-workbench');
  const canvas = document.getElementById('canvas');
  canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'Molecule viewport');
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }), { capture: true });
  installAppearancePanel();
  if (narrow) host.setSidebarCollapsed(true);

  function icon(name) {
    const span = document.createElement('span'); span.className = 'material-symbols-rounded';
    span.setAttribute('aria-hidden', 'true'); span.textContent = name; return span;
  }
  function button(label, symbol, action, className = '') {
    const el = document.createElement('button'); el.type = 'button';
    el.className = 'vm-btn vm-btn--ghost ' + className; el.setAttribute('aria-label', label);
    if (symbol) el.append(icon(symbol));
    el.addEventListener('click', action); return el;
  }
  function label(el, text, className = '') {
    const span = document.createElement('span'); span.className = className; span.textContent = text; el.append(span); return span;
  }
  function installAppearancePanel() {
    const panel = document.getElementById('displayInspector');
    const sidebar = panel.closest('.tb-appearance');
    // Preserve the native preset shortcut; move the actual bound controls once.
    sidebar.append(document.getElementById('appearancePresetSection'));
    const launcher = document.getElementById('displayInspectorBtn');
    launcher.setAttribute('aria-haspopup', 'dialog');
    launcher.setAttribute('data-tooltip', 'Open Appearance');
    launcher.onclick = () => toggle('displayInspector');
    document.getElementById('displayInspectorToggleIcon').replaceWith(icon('open_in_new'));
    const header = document.createElement('header'); header.className = 'vm-popover__header';
    const title = document.createElement('h2'); title.id = 'workbenchAppearanceTitle'; title.textContent = 'Appearance';
    const actions = document.createElement('div'); actions.className = 'vm-popover__actions';
    const reset = document.getElementById('appearanceResetBtn');
    reset.className = 'vm-btn vm-btn--icon'; actions.append(reset);
    const dismiss = button('Close Appearance', 'close', () => close('displayInspector'), 'vm-btn--icon');
    dismiss.id = 'workbenchAppearanceClose'; actions.append(dismiss); header.append(title, actions);
    panel.classList.remove('vm-sidebar-accordion__panel');
    panel.classList.add('vm-popover', 'wb-appearance');
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', title.id);
    panel.prepend(header); document.body.append(panel);
    global.VibeMolFloatingPanels.register(panel, { label: 'Appearance', handle: '.vm-popover__header' });
    const cameraSettings = document.getElementById('appearanceCameraSection');
    cameraSettings.querySelector('.vm-section-label').textContent = 'Projection & focus';
    cameraSettings.classList.add('vm-view-section');
    document.getElementById('viewControls').append(cameraSettings);
  }
  const bar = document.createElement('nav'); bar.className = 'wb-bar'; bar.id = 'workbenchBar'; bar.setAttribute('aria-label', 'Workbench tools');
  const brand = document.createElement('div'); brand.className = 'wb-brand';
  label(brand, 'LAB', 'wb-lab');
  const modes = document.getElementById('toolbarModeRow');
  const oldModeSection = modes.closest('.tb-modes');
  bar.append(modes); oldModeSection?.remove();
  modes.querySelector('#modeDisplayBtn').setAttribute('aria-label', 'View mode');
  const tools = document.createElement('div'); tools.className = 'wb-tools'; bar.append(tools, brand);
  const editTools = document.createElement('div'); editTools.className = 'wb-context-tools'; editTools.hidden = true; tools.append(editTools);
  for (const id of ['editAdaptiveAddAtomBtn', 'editAdaptiveSymmetryBtn', 'editAdaptiveCleanStructureBtn']) {
    const control = document.getElementById(id); control.classList.add('vm-btn', 'vm-btn--ghost', 'wb-tool', 'wb-edit-tool');
    control.setAttribute('data-tooltip-placement', 'bottom'); editTools.append(control);
  }
  const clearMeasurements = button('Clear measurements', 'backspace', () => host.clearMeasurements(), 'wb-tool');
  clearMeasurements.id = 'workbenchClearMeasurements'; clearMeasurements.hidden = true;
  clearMeasurements.setAttribute('data-tooltip', 'Clear measurements (Esc)'); label(clearMeasurements, 'Clear measurements', 'wb-tool-label'); tools.append(clearMeasurements);
  for (const item of entries) {
    const tool = button(item.label, item.icon, () => toggle(item.id), 'wb-tool');
    tool.dataset.window = item.id; tool.setAttribute('data-tooltip', item.label);
    label(tool, item.label, 'wb-tool-label'); tools.append(tool); item.tool = tool;
  }
  const actions = document.createElement('div'); actions.className = 'wb-bar-actions'; bar.append(actions);
  const arrange = button('Arrange workspace', 'dashboard_customize', () => openArrange(), 'wb-arrange');
  arrange.id = 'workbenchArrange'; arrange.setAttribute('aria-haspopup', 'dialog'); label(arrange, 'Arrange');
  const focusButton = button('Focus on molecule', 'fullscreen', () => setFocus(!focus));
  focusButton.id = 'workbenchFocus'; const focusLabel = label(focusButton, 'Focus'); actions.append(arrange, focusButton);
  const utilities = document.getElementById('topRightUtilities'); if (utilities) actions.append(utilities);
  const sidebarButton = document.getElementById('toolbarShowBtn');
  if (sidebarButton) { sidebarButton.setAttribute('aria-label', 'Show scenes'); bar.prepend(sidebarButton); }
  body.append(bar);

  function dock(place, title) {
    const el = document.createElement('section'); el.className = 'wb-dock wb-dock--' + place;
    el.id = 'workbenchDock' + (place === 'right' ? 'Right' : 'Bottom'); el.setAttribute('aria-label', title); el.hidden = true;
    const tabs = document.createElement('div'); tabs.className = 'wb-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', title);
    const slot = document.createElement('div'); slot.className = 'wb-slot';
    const grip = document.createElement('div'); grip.className = 'wb-resize'; grip.tabIndex = 0;
    grip.setAttribute('role', 'separator'); grip.setAttribute('aria-label', 'Resize ' + title.toLowerCase());
    grip.setAttribute('aria-orientation', place === 'right' ? 'vertical' : 'horizontal');
    grip.setAttribute('aria-valuemin', place === 'right' ? '300' : '180'); grip.setAttribute('aria-valuemax', place === 'right' ? '680' : '480');
    el.append(tabs, slot, grip); body.append(el); installResize(grip, place);
    return { el, tabs, slot, grip, key: '' };
  }
  const docks = { right: dock('right', 'Right dock'), bottom: dock('bottom', 'Bottom dock') };
  const menu = document.createElement('section'); menu.id = 'workbenchMenu'; menu.className = 'vm-popover wb-menu';
  menu.hidden = true; menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', 'Workspace options'); body.append(menu);
  const menuMover = global.VibeMolFloatingPanels.register(menu, { label: 'Workspace options', handle: '.wb-menu-title' });
  const snap = document.createElement('div'); snap.className = 'wb-snap'; snap.id = 'workbenchSnap'; snap.hidden = true;
  const snapLabel = label(snap, ''); body.append(snap);

  function available(item) { return ['styleStudio', 'displayInspector'].includes(item.id) || (item.entry.buttonEl && !item.entry.buttonEl.hidden); }
  function open(item) { return !!item.entry.isOpen(); }
  function isParked(id) { return state.parked.includes(id); }
  function compact() { return focus ? compactBeforeFocus : model.regions({ width: innerWidth, height: innerHeight, sidebar: sidebarWidth() }).compact; }
  function sidebarWidth() { return body.classList.contains('sidebar-collapsed') ? 0 : document.getElementById('toolbar').getBoundingClientRect().right; }
  function effectivePlace(id) { return compact() ? 'bottom' : state.placements[id]; }
  function snapshot() {
    const positions = { ...state.positions };
    for (const item of entries) {
      const point = global.VibeMolFloatingPanels.get(item.root)?.getPosition();
      if (point) positions[item.id] = point;
    }
    return model.normalize({ ...state, positions, open: [...entries.filter(open).map(item => item.id), ...pending] });
  }
  function persist() {
    clearTimeout(saving);
    saving = setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify({ last: snapshot(), saved })); }
      catch (_) { /* Layout remains usable when browser storage is blocked. */ }
    }, 180);
  }
  function schedule() { if (!scheduled) { scheduled = true; queueMicrotask(sync); } }
  function activate(id) {
    const place = effectivePlace(id);
    if (place === 'right') state.activeRight = id;
    if (place === 'bottom') state.activeBottom = id;
  }
  function reveal(id, takeFocus = true) {
    const item = byId.get(id); if (!item || !available(item)) return;
    state.parked = state.parked.filter(value => value !== id); pending.delete(id);
    item.entry.setOpen(true); activate(id); sync();
    if (takeFocus) {
      const target = effectivePlace(id) === 'float' ? item.root.querySelector('[data-vm-drag-handle]') : document.getElementById('wb-tab-' + id);
      target?.focus({ preventScroll: true });
    }
  }
  function toggle(id) {
    const item = byId.get(id);
    if (open(item) && item.root.dataset.wbHidden !== 'true' && !focus) close(id); else reveal(id);
  }
  function close(id) { pending.delete(id); byId.get(id)?.entry.setOpen(false); state.parked = state.parked.filter(value => value !== id); sync(); byId.get(id)?.tool.focus({ preventScroll: true }); }
  function park(id) { if (!isParked(id)) state.parked.push(id); closeMenu(); sync(); byId.get(id)?.tool.focus(); }
  function place(id, placement, { drag = false } = {}) {
    const item = byId.get(id); if (!item) return;
    state.placements[id] = placement; state.parked = state.parked.filter(value => value !== id);
    item.root.removeAttribute('data-wb-placement'); item.root.removeAttribute('data-wb-hidden');
    activate(id); closeMenu(); sync();
    if (placement === 'float' && !drag) {
      const stage = document.getElementById('drop').getBoundingClientRect();
      const mover = global.VibeMolFloatingPanels.get(item.root), point = mover?.getPosition() || state.positions[id];
      mover?.moveTo(point?.left ?? stage.left + 32, point?.top ?? stage.top + 32);
    }
    persist();
  }
  function renderTabs(place, items, active) {
    const target = docks[place], key = items.map(item => item.id).join('|');
    if (key !== target.key) {
      target.tabs.replaceChildren(); target.key = key;
      for (const item of items) {
        const tab = button(item.label, item.icon, () => reveal(item.id, false), 'wb-tab');
        tab.setAttribute('role', 'tab'); tab.dataset.window = item.id; tab.id = 'wb-tab-' + item.id;
        tab.setAttribute('aria-controls', item.panel); label(tab, item.label); target.tabs.append(tab);
      }
    }
    for (const tab of target.tabs.children) {
      const selected = tab.dataset.window === active; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    }
  }
  function sync() {
    scheduled = false;
    body.dataset.wbMode = host.getMode();
    const isCompact = compact(); body.dataset.wbCompact = String(isCompact);
    editTools.hidden = host.getMode() !== 'edit'; clearMeasurements.hidden = host.getMode() !== 'measure';
    for (const control of editTools.children) control.setAttribute('aria-pressed', String(control.classList.contains('active')));
    for (const item of entries) {
      const requested = pending.has(item.id) && available(item);
      const restoring = requested && !open(item);
      if (requested) { pending.delete(item.id); if (restoring) item.entry.setOpen(true); }
      const isOpen = open(item);
      if (isOpen && !previousOpen.has(item.id) && !restoring) activate(item.id);
      if (isOpen) previousOpen.add(item.id); else { previousOpen.delete(item.id); if (!pending.has(item.id)) state.parked = state.parked.filter(id => id !== item.id); }
      item.tool.hidden = !available(item);
      item.tool.dataset.parked = String(isOpen && isParked(item.id));
    }
    const placementFor = id => isCompact ? 'bottom' : state.placements[id];
    const live = entries.filter(item => open(item) && available(item) && !isParked(item.id));
    const right = live.filter(item => placementFor(item.id) === 'right');
    const bottom = live.filter(item => placementFor(item.id) === 'bottom');
    // Keep a suspended inspector's preferred tab so it returns with its mode.
    for (const [key, items] of [['activeRight', right], ['activeBottom', bottom]]) {
      const selected = byId.get(state[key]);
      if (!selected || (!open(selected) && !pending.has(selected.id))) state[key] = items[0]?.id || null;
    }
    const activeRight = right.some(item => item.id === state.activeRight) ? state.activeRight : right[0]?.id;
    const activeBottom = bottom.some(item => item.id === state.activeBottom) ? state.activeBottom : bottom[0]?.id;
    const regions = model.regions({ width: innerWidth, height: innerHeight, sidebar: sidebarWidth(), right: !!right.length,
      bottom: !!bottom.length, rightWidth: state.rightWidth, bottomHeight: state.bottomHeight, focus, top: bar.getBoundingClientRect().height });
    const key = JSON.stringify(regions);
    body.style.setProperty('--wb-left', regions.left + 'px'); body.style.setProperty('--wb-right', regions.right + 'px'); body.style.setProperty('--wb-bottom', regions.bottom + 'px');
    body.style.setProperty('--wb-top', regions.top + 'px');
    docks.right.el.hidden = !regions.right; docks.bottom.el.hidden = !regions.bottom;
    renderTabs('right', right, activeRight); renderTabs('bottom', bottom, activeBottom);
    for (const item of entries) {
      const placement = placementFor(item.id), isOpen = open(item);
      const active = placement === 'float' || item.id === (placement === 'right' ? activeRight : activeBottom);
      const hidden = !available(item) || isParked(item.id) || !active || focus;
      item.root.dataset.wbHidden = String(hidden); item.root.dataset.wbPlacement = placement;
      item.root.toggleAttribute('data-vm-floating-docked', placement !== 'float');
      item.root.toggleAttribute('data-vm-floating-drag-disabled', isCompact);
      const handle = item.root.querySelector('[data-vm-drag-handle]');
      handle?.setAttribute('aria-label', isCompact ? item.label + ' window' : 'Move ' + item.label);
      handle?.setAttribute('data-tooltip', isCompact ? 'Use window options to minimize or close.' : 'Drag to move. Release near the right or bottom edge to dock.');
      if (placement !== 'float') {
        item.root.setAttribute('role', 'tabpanel'); item.root.setAttribute('aria-labelledby', 'wb-tab-' + item.id);
      } else {
        if (item.role) item.root.setAttribute('role', item.role); else item.root.removeAttribute('role');
        if (item.labelledBy) item.root.setAttribute('aria-labelledby', item.labelledBy); else item.root.removeAttribute('aria-labelledby');
      }
      if (isOpen && placement === 'float' && restorePositions.has(item.id)) {
        const point = state.positions[item.id];
        global.VibeMolFloatingPanels.get(item.root)?.moveTo(point.left, point.top); restorePositions.delete(item.id);
      }
      item.tool.setAttribute('aria-pressed', String(isOpen && !hidden));
      if (isOpen && available(item) && placement !== 'float') {
        const box = docks[placement].slot.getBoundingClientRect();
        for (const [name, value] of Object.entries({ left: box.left, top: box.top, width: box.width, height: box.height })) item.root.style.setProperty('--wb-panel-' + name, value + 'px');
      }
    }
    docks.right.grip.setAttribute('aria-valuenow', String(Math.round(regions.right)));
    docks.bottom.grip.setAttribute('aria-valuenow', String(Math.round(regions.bottom)));
    if (key !== lastRegionKey) { lastRegionKey = key; host.resize(); }
    persist();
  }

  function closeMenu(restoreFocus = false) {
    menu.hidden = true; menu.setAttribute('aria-hidden', 'true');
    menuReturn?.setAttribute('aria-expanded', 'false'); if (restoreFocus) menuReturn?.focus({ preventScroll: true });
  }
  function startMenu(trigger, title) {
    menuReturn?.setAttribute('aria-expanded', 'false'); menuReturn = trigger;
    trigger.setAttribute('aria-expanded', 'true'); menu.replaceChildren();
    const heading = document.createElement('div'); heading.className = 'wb-menu-title'; heading.textContent = title; menu.append(heading);
    menu.hidden = false; menu.setAttribute('aria-hidden', 'false'); menuMover.reset();
    const box = trigger.getBoundingClientRect();
    menu.style.left = Math.max(12, Math.min(innerWidth - 292, box.right - 280)) + 'px'; menu.style.top = Math.min(innerHeight - 300, box.bottom + 8) + 'px';
  }
  function menuAction(text, symbol, action, detail = '') {
    const actionButton = button(text, symbol, action); const content = label(actionButton, text);
    if (detail) { const sub = document.createElement('small'); sub.textContent = detail; content.append(sub); }
    menu.append(actionButton); return actionButton;
  }
  function finishMenu() {
    const box = menu.getBoundingClientRect(); menuMover.moveTo(box.left, box.top);
    menu.querySelector('button:not(:disabled)')?.focus();
  }
  function openWindowMenu(item, trigger) {
    if (!menu.hidden && menuReturn === trigger) { closeMenu(true); return; }
    startMenu(trigger, item.label);
    for (const [placement, name, symbol] of [['right', 'Dock right', 'dock_to_right'], ['bottom', 'Dock below', 'dock_to_bottom'], ['float', 'Float window', 'picture_in_picture_alt']]) {
      const action = menuAction(name, symbol, () => place(item.id, placement)); action.dataset.placement = placement;
      action.disabled = compact() && placement !== 'bottom';
    }
    menu.append(document.createElement('hr'));
    menuAction('Minimize to tools bar', 'minimize', () => park(item.id));
    menuAction('Close window', 'close', () => { closeMenu(); close(item.id); });
    finishMenu();
  }
  function applyLayout(layout) {
    if (focus) setFocus(false);
    for (const item of entries) { item.entry.setOpen(false); global.VibeMolFloatingPanels.get(item.root)?.reset(); }
    state = model.normalize(layout); pending.clear(); state.open.forEach(id => pending.add(id));
    restorePositions.clear(); Object.keys(state.positions).forEach(id => restorePositions.add(id));
    previousOpen.clear(); closeMenu(); sync();
  }
  function preset(name) {
    const next = model.normalize();
    if (name === 'analyze') {
      next.open = ['moldenInspector', 'viewInspector'].filter(id => available(byId.get(id))).slice(0, 1);
      const table = ['vibrationPanel', 'trajectoryPanel', 'coordsPanel'].find(id => available(byId.get(id)));
      if (table) next.open.push(table);
    }
    if (name === 'style') { next.open = ['styleStudio']; next.rightWidth = 560; }
    if (name === 'explore' && available(byId.get('moldenInspector'))) next.open = ['moldenInspector'];
    applyLayout(next);
  }
  function openArrange() {
    if (!menu.hidden && menuReturn === arrange) { closeMenu(true); return; }
    startMenu(arrange, 'Arrange your workspace');
    menuAction('Explore', 'deployed_code', () => preset('explore'), 'Keep the molecule in view');
    menuAction('Analyze', 'view_quilt', () => preset('analyze'), 'Inspect data alongside the molecule');
    menuAction('Style', 'palette', () => preset('style'), 'A spacious home for Style Studio');
    if (saved.length) {
      menu.append(document.createElement('hr'));
      for (const item of saved) menuAction(item.name, 'bookmark', () => applyLayout(item.layout));
    }
    menu.append(document.createElement('hr'));
    const form = document.createElement('form'); form.className = 'wb-save';
    const input = document.createElement('input'); input.type = 'text'; input.placeholder = 'Name this workspace'; input.setAttribute('aria-label', 'Workspace name'); input.maxLength = 48; input.required = true;
    const save = button('Save workspace', 'bookmark_add', () => {}); save.type = 'submit';
    const status = document.createElement('div'); status.className = 'wb-status'; status.setAttribute('role', 'status');
    form.append(input, save); menu.append(form, status);
    form.addEventListener('submit', event => {
      event.preventDefault(); const name = input.value.trim(); if (!name) return;
      saved = saved.filter(item => item.name !== name); saved.push({ name, layout: snapshot() }); saved = saved.slice(-8);
      try { localStorage.setItem(storageKey, JSON.stringify({ last: snapshot(), saved })); status.textContent = 'Workspace saved in this browser.'; }
      catch (_) { status.textContent = 'Browser storage is unavailable. This layout is kept for this tab.'; }
    });
    menuAction('Reset window positions', 'restart_alt', () => {
      for (const item of entries) global.VibeMolFloatingPanels.get(item.root)?.reset();
      preset('explore');
    });
    finishMenu();
  }
  function setFocus(value) {
    const next = !!value; if (focus === next) return;
    if (next) compactBeforeFocus = compact();
    closeMenu(); focus = next; body.dataset.wbFocus = String(focus);
    if (focus) { sidebarBeforeFocus = body.classList.contains('sidebar-collapsed'); host.setSidebarCollapsed(true); }
    else host.setSidebarCollapsed(sidebarBeforeFocus);
    focusLabel.textContent = focus ? 'Back to workspace' : 'Focus';
    focusButton.setAttribute('aria-label', focus ? 'Return to workspace' : 'Focus on molecule'); focusButton.setAttribute('aria-pressed', String(focus)); sync();
  }
  function installResize(grip, placement) {
    let gesture = null;
    const set = value => { state[placement === 'right' ? 'rightWidth' : 'bottomHeight'] = Math.max(placement === 'right' ? 300 : 180, Math.min(placement === 'right' ? 680 : 480, value)); sync(); };
    grip.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      gesture = { id: event.pointerId, start: placement === 'right' ? event.clientX : event.clientY, size: placement === 'right' ? state.rightWidth : state.bottomHeight };
      grip.setPointerCapture(event.pointerId); event.preventDefault(); event.stopPropagation();
    });
    grip.addEventListener('pointermove', event => { if (gesture?.id === event.pointerId) { set(gesture.size + gesture.start - (placement === 'right' ? event.clientX : event.clientY)); event.stopPropagation(); } });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) grip.addEventListener(type, () => { gesture = null; });
    grip.addEventListener('keydown', event => {
      const direction = placement === 'right' ? { ArrowLeft: 1, ArrowRight: -1 } : { ArrowUp: 1, ArrowDown: -1 };
      if (direction[event.key]) { set((placement === 'right' ? state.rightWidth : state.bottomHeight) + direction[event.key] * (event.shiftKey ? 1 : 10)); event.preventDefault(); event.stopPropagation(); }
    });
  }
  for (const item of entries) {
    item.role = item.root.getAttribute('role'); item.labelledBy = item.root.getAttribute('aria-labelledby');
    item.root.dataset.wbPanel = item.id;
    const header = item.root.querySelector('[data-vm-drag-handle]');
    header?.classList.add('wb-window-header');
    header?.querySelectorAll('button.secondary').forEach(control => control.classList.add('vm-btn', 'vm-btn--ghost'));
    const windowMenu = button('Window options for ' + item.label, 'more_horiz', () => openWindowMenu(item, windowMenu), 'wb-window-menu');
    windowMenu.setAttribute('aria-haspopup', 'dialog'); windowMenu.setAttribute('data-tooltip', 'Dock, float, or minimize');
    const actionGroup = header?.querySelector('.vm-list-popover__actions, .motionPanelHeaderActions, .vm-popover__actions, .actions');
    if (actionGroup) actionGroup.prepend(windowMenu); else header?.append(windowMenu);
    header?.setAttribute('data-tooltip', 'Drag to move. Release near the right or bottom edge to dock. Use window options for other placements.');
    const observer = new MutationObserver(schedule);
    observer.observe(item.root, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
    if (item.entry.buttonEl) observer.observe(item.entry.buttonEl, { attributes: true, attributeFilter: ['hidden'] });
  }
  document.querySelector('#sidePanel > header > h2').textContent = 'Camera';
  const editObserver = new MutationObserver(schedule);
  for (const control of editTools.children) editObserver.observe(control, { attributes: true, attributeFilter: ['hidden', 'class'] });
  modes.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const buttons = [...modes.querySelectorAll('button')], index = buttons.indexOf(event.target);
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    event.preventDefault(); event.stopPropagation(); buttons[next].click(); buttons[next].focus();
  });
  const sidebarObserver = new MutationObserver(schedule); sidebarObserver.observe(body, { attributes: true, attributeFilter: ['class'] });
  const modeObserver = new MutationObserver(schedule); modeObserver.observe(document.getElementById('displayWindowAdaptiveMenu'), { attributes: true, attributeFilter: ['data-mode'] });
  for (const target of Object.values(docks)) target.tabs.addEventListener('keydown', event => {
    const tabs = [...target.tabs.children], index = tabs.indexOf(event.target);
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    reveal(tabs[next].dataset.window, false); tabs[next].focus(); event.preventDefault(); event.stopPropagation();
  });
  document.addEventListener('pointerdown', event => { if (!menu.hidden && !menu.contains(event.target) && !menuReturn?.contains(event.target)) closeMenu(); });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!menu.hidden) { closeMenu(true); event.preventDefault(); event.stopImmediatePropagation(); }
    else if (focus) { setFocus(false); focusButton.focus(); event.preventDefault(); event.stopImmediatePropagation(); }
    else if (!event.target.closest('input, select, textarea, [contenteditable="true"]')) {
      const id = event.target.closest('[data-wb-panel]')?.dataset.wbPanel;
      if (byId.has(id)) { close(id); event.preventDefault(); event.stopImmediatePropagation(); }
    }
  }, true);
  menu.addEventListener('keydown', event => event.stopPropagation());
  document.addEventListener('vm-floating-drag', event => {
    const id = event.target.dataset.wbPanel; if (!byId.has(id) || compact()) return;
    const { phase, x, y } = event.detail;
    if (phase === 'start') { draggingId = id; place(id, 'float', { drag: true }); }
    if (phase === 'move') {
      snapPlace = x > innerWidth - 64 ? 'right' : y > innerHeight - 64 ? 'bottom' : null;
      snap.hidden = !snapPlace;
      if (snapPlace) {
        const region = model.regions({ width: innerWidth, height: innerHeight, sidebar: sidebarWidth(), right: snapPlace === 'right', bottom: snapPlace === 'bottom', rightWidth: state.rightWidth, bottomHeight: state.bottomHeight, top: bar.getBoundingClientRect().height });
        const left = snapPlace === 'right' ? innerWidth - region.right : region.left;
        const top = snapPlace === 'right' ? region.top : innerHeight - region.bottom;
        Object.assign(snap.style, { left: left + 'px', top: top + 'px', width: (innerWidth - left) + 'px', height: (innerHeight - top) + 'px' });
        snapLabel.textContent = 'Release to dock ' + (snapPlace === 'right' ? 'right' : 'below');
      }
    }
    if (phase === 'end' || phase === 'cancel') {
      const target = snapPlace; snap.hidden = true; snapPlace = null; draggingId = null;
      if (target && phase === 'end') place(id, target); else persist();
    }
  });
  global.addEventListener('resize', () => {
    const nextNarrow = innerWidth < 760; if (nextNarrow && !narrow) host.setSidebarCollapsed(true); narrow = nextNarrow;
    closeMenu(); sync();
  });
  global.VibeMolWorkbench = Object.freeze({
    beforeModeChange: () => {
      if (host.getMode() === 'edit') editPanels = host.captureEditPanels();
      closeMenu();
    },
    afterModeChange: () => {
      if (host.getMode() === 'edit') host.restoreEditPanels(editPanels);
      sync();
    },
    manages: id => byId.has(id),
    isDocked: id => byId.has(id) && effectivePlace(id) !== 'float',
    restoreIfHidden: id => { const item = byId.get(id); if (item && open(item) && item.root.dataset.wbHidden === 'true' && !focus) { reveal(id); return true; } return false; },
    open: reveal, close, place, park, setFocus, applyLayout, preset,
    snapshot: () => ({ ...snapshot(), focus, compact: compact(), draggingId }),
  });
  sync();
  if (params.get('workspaceDemo') === '1' && !global.VibeMolTesting.getSceneGraphSnapshot().scenes.length) {
    fetch('assets/data/methane/canonical_4.cube').then(response => { if (!response.ok) throw new Error('Demo file unavailable'); return response.text(); })
      .then(text => global.VibeMolEmbed.loadFiles([{ name: 'Methane · orbital.cube', text }], { clearFirst: false }))
      .then(result => {
        if (!result.ok) throw new Error('Demo import failed');
        global.VibeMolAppearanceLooks.apply('classic'); preset('style'); reveal('coordsPanel', false);
      })
      .catch(error => { brand.title = error.message; });
  }
})(window);
