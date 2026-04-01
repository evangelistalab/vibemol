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

  function applyThreeAxisOperatorPanelUi(options = {}) {
    const panelEl = options.panelEl || null;
    const isVisible = !!options.isVisible;
    if (panelEl) {
      panelEl.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
      panelEl.setAttribute('data-collapsed', options.collapsed ? 'true' : 'false');
    }
    if (!isVisible) return false;
    if (typeof options.positionPanel === 'function') options.positionPanel();
    if (options.headerEl) options.headerEl.setAttribute('aria-expanded', options.collapsed ? 'false' : 'true');
    if (options.chevronEl) options.chevronEl.textContent = options.collapsed ? '▸' : '▾';
    if (options.labelEl) options.labelEl.textContent = String(options.labelText || '');
    return true;
  }

  /**
   * Refresh one floating move operator panel.
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
   *   displacement: {x:number,y:number,z:number},
   *   positionPanel: ()=>void,
   * }} options
   */
  function updateMoveOperatorPanelUi(options = {}) {
    if (!applyThreeAxisOperatorPanelUi(options)) return;
    const displacement = options.displacement || { x: 0, y: 0, z: 0 };
    if (options.xEl && document.activeElement !== options.xEl) options.xEl.value = Number(displacement.x).toFixed(3);
    if (options.yEl && document.activeElement !== options.yEl) options.yEl.value = Number(displacement.y).toFixed(3);
    if (options.zEl && document.activeElement !== options.zEl) options.zEl.value = Number(displacement.z).toFixed(3);
  }

  /**
   * Refresh one floating rotate operator panel.
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
   *   rotation: {x:number,y:number,z:number},
   *   positionPanel: ()=>void,
   * }} options
   */
  function updateRotateOperatorPanelUi(options = {}) {
    if (!applyThreeAxisOperatorPanelUi(options)) return;
    const rotation = options.rotation || { x: 0, y: 0, z: 0 };
    if (options.xEl && document.activeElement !== options.xEl) options.xEl.value = Number(rotation.x).toFixed(1);
    if (options.yEl && document.activeElement !== options.yEl) options.yEl.value = Number(rotation.y).toFixed(1);
    if (options.zEl && document.activeElement !== options.zEl) options.zEl.value = Number(rotation.z).toFixed(1);
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
    positionRightOperatorPanel,
    updateAddAtomOperatorPanelUi,
    updateAddMoleculeOperatorPanelUi,
    updateMoveOperatorPanelUi,
    updateRotateOperatorPanelUi,
    createAdaptivePopoverController,
    bindAdaptivePopoverItem,
  });
})(window);
