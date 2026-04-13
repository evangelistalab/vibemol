(function (global) {
  'use strict';

  /**
   * Position the floating adaptive edit menu against the toolbar edge.
   * @param {{
   *   menuEl: HTMLElement|null,
   *   toolbarEl: HTMLElement|null,
   *   sidebarCollapsed: boolean,
   *   gap?: number,
   * }} options
   */
  function positionAdaptiveMenu(options = {}) {
    const menuEl = options.menuEl || null;
    if (!menuEl) return;
    const gap = Number.isFinite(options.gap) ? Number(options.gap) : 16;
    let left = gap;
    const toolbarEl = options.toolbarEl || null;
    if (!options.sidebarCollapsed && toolbarEl && typeof toolbarEl.getBoundingClientRect === 'function') {
      const toolbarRect = toolbarEl.getBoundingClientRect();
      if (toolbarRect && Number.isFinite(toolbarRect.right) && toolbarRect.width > 0) {
        left = Math.round(toolbarRect.right + gap);
      }
    }
    const viewportWidth = Math.max(
      1,
      Math.round(window.innerWidth || 0),
      Math.round((document.documentElement && document.documentElement.clientWidth) || 0)
    );
    const menuWidth = Math.max(0, Math.round(menuEl.getBoundingClientRect().width || menuEl.offsetWidth || 0));
    const maxLeft = Math.max(gap, viewportWidth - menuWidth - gap);
    menuEl.style.left = `${Math.min(left, maxLeft)}px`;
  }

  /**
   * Position one floating popover to the right of a trigger.
   * @param {{
   *   popoverEl: HTMLElement|null,
   *   triggerEl: HTMLElement|null,
   *   gap?: number,
   *   defaultWidth?: number,
   *   defaultHeight?: number,
   * }} options
   */
  function positionFloatingPopover(options = {}) {
    const popoverEl = options.popoverEl || null;
    const triggerEl = options.triggerEl || null;
    if (!popoverEl || !triggerEl) return;
    const gap = Number.isFinite(options.gap) ? Number(options.gap) : 12;
    const triggerRect = triggerEl.getBoundingClientRect();
    const popoverRect = popoverEl.getBoundingClientRect();
    const viewportWidth = Math.max(
      1,
      Math.round(window.innerWidth || 0),
      Math.round((document.documentElement && document.documentElement.clientWidth) || 0)
    );
    const viewportHeight = Math.max(
      1,
      Math.round(window.innerHeight || 0),
      Math.round((document.documentElement && document.documentElement.clientHeight) || 0)
    );
    const popoverWidth = Math.max(
      1,
      Math.round(popoverRect.width || popoverEl.offsetWidth || options.defaultWidth || 260)
    );
    const popoverHeight = Math.max(
      1,
      Math.round(popoverRect.height || popoverEl.offsetHeight || options.defaultHeight || 160)
    );
    const left = Math.min(
      Math.round(triggerRect.right + gap),
      Math.max(gap, viewportWidth - popoverWidth - gap)
    );
    const centeredTop = Math.round(triggerRect.top + (triggerRect.height * 0.5) - (popoverHeight * 0.5));
    const top = Math.min(
      Math.max(gap, centeredTop),
      Math.max(gap, viewportHeight - popoverHeight - gap)
    );
    popoverEl.style.left = `${left}px`;
    popoverEl.style.top = `${top}px`;
  }

  /**
   * Restore a reparented pane to its original DOM home.
   * @param {{paneEl?:HTMLElement|null,homeParent?:HTMLElement|null,homeNextSibling?:Node|null}} binding
   */
  function restorePaneHome(binding = {}) {
    const paneEl = binding.paneEl || null;
    const homeParent = binding.homeParent || null;
    if (!paneEl || !homeParent || paneEl.parentElement === homeParent) return;
    homeParent.insertBefore(paneEl, binding.homeNextSibling || null);
  }

  /**
   * Apply the visible state, active classes, and metadata for the adaptive edit menu.
   * @param {{
   *   menuEl: HTMLElement|null,
   *   isVisible: boolean,
   *   positionMenu: ()=>void,
   *   onHideAllPopovers?: ()=>void,
   *   visibleItems?: Array<{el:HTMLElement|null,visible:boolean}>,
   *   activeItems?: Array<{el:HTMLElement|null,active:boolean}>,
   *   metaItems?: Array<{el:HTMLElement|null,text:string}>,
   * }} options
   */
  function updateAdaptiveMenuUi(options = {}) {
    const menuEl = options.menuEl || null;
    const isVisible = !!options.isVisible;
    if (menuEl) menuEl.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
    if (typeof options.positionMenu === 'function') options.positionMenu();
    if (!isVisible && typeof options.onHideAllPopovers === 'function') options.onHideAllPopovers();
    const visibleItems = Array.isArray(options.visibleItems) ? options.visibleItems : [];
    for (const item of visibleItems) {
      if (!item || !item.el) continue;
      const visible = !!item.visible;
      item.el.hidden = !visible;
      item.el.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    const activeItems = Array.isArray(options.activeItems) ? options.activeItems : [];
    for (const item of activeItems) {
      if (!item || !item.el) continue;
      item.el.classList.toggle('active', !!item.active);
    }
    const metaItems = Array.isArray(options.metaItems) ? options.metaItems : [];
    for (const item of metaItems) {
      if (!item || !item.el) continue;
      item.el.textContent = String(item.text || '');
    }
  }

  /**
   * Create one auto-hide controller for a floating adaptive menu.
   * The menu stays visible while hovered or pinned, hides after inactivity,
   * and can be revealed again by moving near the left edge.
   * @param {{
   *   menuEl?: HTMLElement|null,
   *   delayMs?: number,
   *   fadeClassName?: string,
   *   revealEdgeWidth?: number,
   *   revealSlack?: number,
   *   getPinned?: ()=>boolean,
   *   getRelatedElements?: ()=>Array<HTMLElement|null>|null,
   * }} options
   */
  function createAdaptiveMenuAutoHideController(options = {}) {
    const menuEl = options.menuEl || null;
    const delayMs = Number.isFinite(options.delayMs) ? Math.max(0, Number(options.delayMs)) : 5000;
    const fadeClassName = String(options.fadeClassName || 'is-auto-hidden').trim() || 'is-auto-hidden';
    const revealEdgeWidth = Number.isFinite(options.revealEdgeWidth) ? Math.max(8, Number(options.revealEdgeWidth)) : 64;
    const revealSlack = Number.isFinite(options.revealSlack) ? Math.max(0, Number(options.revealSlack)) : 20;
    const getPinned = typeof options.getPinned === 'function' ? options.getPinned : (() => false);
    const getRelatedElements = typeof options.getRelatedElements === 'function'
      ? options.getRelatedElements
      : (() => []);
    let enabled = false;
    let hideTimer = 0;
    let lastPointerX = Number.NaN;
    let lastPointerY = Number.NaN;

    function clearHideTimer() {
      if (!hideTimer) return;
      window.clearTimeout(hideTimer);
      hideTimer = 0;
    }

    function isMenuEligible() {
      return !!(enabled && menuEl && menuEl.getAttribute('aria-hidden') === 'false');
    }

    function isElementShown(el) {
      if (!el || !el.isConnected || el.hidden) return false;
      if (typeof el.getAttribute === 'function' && el.getAttribute('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }

    function getTrackedElements() {
      if (!menuEl) return [];
      const related = Array.isArray(getRelatedElements()) ? getRelatedElements() : [];
      return [menuEl, ...related].filter(isElementShown);
    }

    function elementContainsPoint(el, clientX, clientY) {
      if (!el || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
      const rect = el.getBoundingClientRect();
      return (
        clientX >= rect.left
        && clientX <= rect.right
        && clientY >= rect.top
        && clientY <= rect.bottom
      );
    }

    function isPointerOverTrackedElements(clientX = lastPointerX, clientY = lastPointerY) {
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
      const topEl = document.elementFromPoint(clientX, clientY);
      const tracked = getTrackedElements();
      if (topEl && tracked.some((el) => el === topEl || el.contains(topEl))) return true;
      return tracked.some((el) => elementContainsPoint(el, clientX, clientY));
    }

    function isRevealPointer(clientX = lastPointerX, clientY = lastPointerY) {
      if (!Number.isFinite(clientX)) return false;
      if (clientX <= revealEdgeWidth) return true;
      if (!menuEl || !isElementShown(menuEl) || !Number.isFinite(clientY)) return false;
      const rect = menuEl.getBoundingClientRect();
      return (
        clientX <= rect.right + revealSlack
        && clientY >= rect.top - revealSlack
        && clientY <= rect.bottom + revealSlack
      );
    }

    function applyVisibleState(isVisible) {
      if (!menuEl) return;
      menuEl.classList.toggle(fadeClassName, !isVisible);
    }

    function showMenu() {
      clearHideTimer();
      applyVisibleState(true);
    }

    function hideMenu() {
      clearHideTimer();
      if (!isMenuEligible() || !!getPinned() || isPointerOverTrackedElements()) {
        applyVisibleState(true);
        return;
      }
      applyVisibleState(false);
    }

    function scheduleHide() {
      if (!isMenuEligible() || !!getPinned()) return;
      clearHideTimer();
      hideTimer = window.setTimeout(() => {
        hideTimer = 0;
        hideMenu();
      }, delayMs);
    }

    function handlePointerMove(event) {
      if (!event) return;
      lastPointerX = Number(event.clientX);
      lastPointerY = Number(event.clientY);
      if (!isMenuEligible()) return;
      if (!!getPinned() || isPointerOverTrackedElements()) {
        showMenu();
        return;
      }
      if (isRevealPointer()) {
        showMenu();
        scheduleHide();
        return;
      }
      if (!hideTimer && !menuEl.classList.contains(fadeClassName)) scheduleHide();
    }

    function setEnabled(nextEnabled) {
      enabled = !!nextEnabled;
      clearHideTimer();
      if (!enabled || !menuEl) {
        applyVisibleState(true);
        return;
      }
      showMenu();
      if (!!getPinned() || isPointerOverTrackedElements()) return;
      scheduleHide();
    }

    if (menuEl) {
      menuEl.addEventListener('mouseenter', () => {
        if (!isMenuEligible()) return;
        showMenu();
      });
      menuEl.addEventListener('mouseleave', () => {
        if (!isMenuEligible()) return;
        scheduleHide();
      });
      menuEl.addEventListener('focusin', () => {
        if (!isMenuEligible()) return;
        showMenu();
      });
      menuEl.addEventListener('focusout', () => {
        if (!isMenuEligible()) return;
        window.setTimeout(() => {
          if (!isMenuEligible() || isPointerOverTrackedElements()) return;
          scheduleHide();
        }, 0);
      });
      document.addEventListener('pointermove', handlePointerMove, true);
    }

    return Object.freeze({
      setEnabled,
      showNow: showMenu,
      scheduleHide,
      hideNow: hideMenu,
    });
  }

  /**
   * Position one right-side operator panel against the viewport edge.
   * @param {HTMLElement|null} panelEl
   * @param {{gap?:number,bottom?:number}=} options
   */
  function positionRightOperatorPanel(panelEl, options = {}) {
    if (!panelEl) return;
    const gap = Number.isFinite(options.gap) ? Number(options.gap) : 16;
    const bottom = Number.isFinite(options.bottom) ? Number(options.bottom) : 24;
    panelEl.style.left = 'auto';
    panelEl.style.right = `${gap}px`;
    panelEl.style.bottom = `${bottom}px`;
  }

  /**
   * Refresh one floating add-atom operator panel.
   * @param {{
   *   panelEl: HTMLElement|null,
   *   headerEl: HTMLElement|null,
   *   chevronEl: HTMLElement|null,
   *   labelEl: HTMLElement|null,
   *   xEl: HTMLInputElement|null,
   *   yEl: HTMLInputElement|null,
   *   zEl: HTMLInputElement|null,
   *   isVisible: boolean,
   *   collapsed: boolean,
   *   labelText: string,
   *   world: {x:number,y:number,z:number},
   *   positionPanel: ()=>void,
   * }} options
   */
  function updateAddAtomOperatorPanelUi(options = {}) {
    const panelEl = options.panelEl || null;
    const isVisible = !!options.isVisible;
    if (panelEl) {
      panelEl.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
      panelEl.setAttribute('data-collapsed', options.collapsed ? 'true' : 'false');
    }
    if (!isVisible) return;
    if (typeof options.positionPanel === 'function') options.positionPanel();
    if (options.headerEl) options.headerEl.setAttribute('aria-expanded', options.collapsed ? 'false' : 'true');
    if (options.chevronEl) options.chevronEl.textContent = options.collapsed ? '▸' : '▾';
    if (options.labelEl) options.labelEl.textContent = String(options.labelText || '');
    const world = options.world || { x: 0, y: 0, z: 0 };
    if (options.xEl && document.activeElement !== options.xEl) options.xEl.value = Number(world.x).toFixed(3);
    if (options.yEl && document.activeElement !== options.yEl) options.yEl.value = Number(world.y).toFixed(3);
    if (options.zEl && document.activeElement !== options.zEl) options.zEl.value = Number(world.z).toFixed(3);
  }

  /**
   * Refresh one floating add-molecule operator panel.
   * @param {{
   *   panelEl: HTMLElement|null,
   *   headerEl: HTMLElement|null,
   *   chevronEl: HTMLElement|null,
   *   labelEl: HTMLElement|null,
   *   xEl: HTMLInputElement|null,
   *   yEl: HTMLInputElement|null,
   *   zEl: HTMLInputElement|null,
   *   rotXEl: HTMLInputElement|null,
   *   rotYEl: HTMLInputElement|null,
   *   rotZEl: HTMLInputElement|null,
   *   isVisible: boolean,
   *   collapsed: boolean,
   *   labelText: string,
   *   position: {x:number,y:number,z:number},
   *   rotation: {x:number,y:number,z:number},
   *   positionPanel: ()=>void,
   * }} options
   */
  function updateAddMoleculeOperatorPanelUi(options = {}) {
    const panelEl = options.panelEl || null;
    const isVisible = !!options.isVisible;
    if (panelEl) {
      panelEl.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
      panelEl.setAttribute('data-collapsed', options.collapsed ? 'true' : 'false');
    }
    if (!isVisible) return;
    if (typeof options.positionPanel === 'function') options.positionPanel();
    if (options.headerEl) options.headerEl.setAttribute('aria-expanded', options.collapsed ? 'false' : 'true');
    if (options.chevronEl) options.chevronEl.textContent = options.collapsed ? '▸' : '▾';
    if (options.labelEl) options.labelEl.textContent = String(options.labelText || '');
    const position = options.position || { x: 0, y: 0, z: 0 };
    const rotation = options.rotation || { x: 0, y: 0, z: 0 };
    if (options.xEl && document.activeElement !== options.xEl) options.xEl.value = Number(position.x).toFixed(3);
    if (options.yEl && document.activeElement !== options.yEl) options.yEl.value = Number(position.y).toFixed(3);
    if (options.zEl && document.activeElement !== options.zEl) options.zEl.value = Number(position.z).toFixed(3);
    if (options.rotXEl && document.activeElement !== options.rotXEl) options.rotXEl.value = Number(rotation.x).toFixed(1);
    if (options.rotYEl && document.activeElement !== options.rotYEl) options.rotYEl.value = Number(rotation.y).toFixed(1);
    if (options.rotZEl && document.activeElement !== options.rotZEl) options.rotZEl.value = Number(rotation.z).toFixed(1);
  }

  /**
   * Focus one input after layout settles.
   * @param {HTMLElement|null|undefined} el
   */
  function focusDeferred(el) {
    if (!el) return;
    requestAnimationFrame(() => {
      try {
        el.focus();
        if (typeof el.select === 'function') el.select();
      } catch { }
    });
  }

  /**
   * Create one adaptive popover controller for edit-mode floating panes.
   * @param {{
   *   bindings: Record<string, {
   *     mode?: string|null,
   *     triggerEl?: HTMLElement|null,
   *     popoverEl?: HTMLElement|null,
   *     paneEl?: HTMLElement|null,
   *     focusEl?: HTMLElement|null,
   *     homeParent?: HTMLElement|null,
   *     homeNextSibling?: Node|null,
   *   }>,
   *   onOpenMode?: (kind:string, binding:object, options:object)=>void,
   * }} options
   */
  function createAdaptivePopoverController(options = {}) {
    const bindings = options.bindings || Object.create(null);
    const hideTimers = Object.create(null);

    function getBinding(kind) {
      return bindings && bindings[kind] ? bindings[kind] : null;
    }

    function restore(kind) {
      const binding = getBinding(kind);
      if (!binding) return;
      restorePaneHome(binding);
    }

    function position(kind) {
      const binding = getBinding(kind);
      if (!binding) return;
      positionFloatingPopover({
        popoverEl: binding.popoverEl || null,
        triggerEl: binding.triggerEl || null,
        gap: 12,
        defaultWidth: 260,
        defaultHeight: 160,
      });
    }

    function positionVisible() {
      for (const kind of Object.keys(bindings)) {
        const binding = bindings[kind];
        if (!binding || !binding.popoverEl) continue;
        if (binding.popoverEl.getAttribute('aria-hidden') === 'false') position(kind);
      }
    }

    function hide(kind, delayMs = 0) {
      const binding = getBinding(kind);
      if (!binding) return;
      if (hideTimers[kind]) {
        clearTimeout(hideTimers[kind]);
        hideTimers[kind] = 0;
      }
      const applyHide = () => {
        if (binding.popoverEl) binding.popoverEl.setAttribute('aria-hidden', 'true');
        restore(kind);
      };
      if (delayMs > 0) {
        hideTimers[kind] = window.setTimeout(() => {
          hideTimers[kind] = 0;
          applyHide();
        }, delayMs);
      } else {
        applyHide();
      }
    }

    function hideAll(exceptKind = '') {
      for (const kind of Object.keys(bindings)) {
        if (kind === exceptKind) continue;
        hide(kind);
      }
    }

    function show(kind, options = {}) {
      const binding = getBinding(kind);
      if (!binding || !binding.popoverEl || !binding.paneEl || !binding.homeParent) return;
      hideAll(kind);
      if (hideTimers[kind]) {
        clearTimeout(hideTimers[kind]);
        hideTimers[kind] = 0;
      }
      if (binding.paneEl.parentElement !== binding.popoverEl) {
        binding.popoverEl.appendChild(binding.paneEl);
      }
      binding.popoverEl.setAttribute('aria-hidden', 'false');
      position(kind);
      if (options.focusSearch) focusDeferred(binding.focusEl || null);
    }

    function openMode(kind, modeOptions = {}) {
      const binding = getBinding(kind);
      if (!binding) return;
      if (typeof options.onOpenMode === 'function') options.onOpenMode(kind, binding, modeOptions);
      if (modeOptions.focusSearch) focusDeferred(binding.focusEl || null);
    }

    return Object.freeze({
      getBinding,
      openMode,
      restore,
      position,
      positionVisible,
      show,
      hide,
      hideAll,
    });
  }

  /**
   * Bind one adaptive toolbar item to popover hover/click behavior.
   * @param {{
   *   controller: {show:Function,hide:Function}|null,
   *   kind: string,
   *   triggerEl?: HTMLElement|null,
   *   popoverEl?: HTMLElement|null,
   *   onClick?: ()=>void,
   *   clickShowsPopover?: boolean,
   *   clickFocusesSearch?: boolean,
   *   hoverShowsPopover?: boolean,
   *   hideDelayMs?: number,
   * }} options
   */
  function bindAdaptivePopoverItem(options = {}) {
    const controller = options.controller || null;
    const kind = String(options.kind || '').trim();
    if (!controller || !kind) return;
    const triggerEl = options.triggerEl || null;
    const popoverEl = options.popoverEl || null;
    const hideDelayMs = Number.isFinite(options.hideDelayMs) ? Number(options.hideDelayMs) : 120;
    const clickShowsPopover = options.clickShowsPopover !== false;
    const clickFocusesSearch = !!options.clickFocusesSearch;
    const hoverShowsPopover = options.hoverShowsPopover !== false;
    if (triggerEl) {
      triggerEl.onclick = () => {
        if (typeof options.onClick === 'function') options.onClick();
        if (clickShowsPopover) controller.show(kind, { focusSearch: clickFocusesSearch });
      };
      if (hoverShowsPopover) {
        triggerEl.addEventListener('mouseenter', () => controller.show(kind, { focusSearch: false }));
        triggerEl.addEventListener('mouseleave', () => controller.hide(kind, hideDelayMs));
      }
    }
    if (popoverEl) {
      popoverEl.addEventListener('mouseenter', () => controller.show(kind, { focusSearch: false }));
      popoverEl.addEventListener('mouseleave', () => controller.hide(kind, hideDelayMs));
    }
  }

  global.VibeMolEditUi = Object.freeze({
    positionAdaptiveMenu,
    positionFloatingPopover,
    restorePaneHome,
    updateAdaptiveMenuUi,
    createAdaptiveMenuAutoHideController,
    positionRightOperatorPanel,
    updateAddAtomOperatorPanelUi,
    updateAddMoleculeOperatorPanelUi,
    createAdaptivePopoverController,
    bindAdaptivePopoverItem,
  });
})(window);
