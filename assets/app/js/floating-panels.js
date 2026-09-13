(function (global) {
  'use strict';

  const entries = new Map();
  const margin = 12;
  const interactive = 'button, input, select, textarea, a, label, [contenteditable="true"], [role="slider"]';
  const instructions = 'Drag to move. Alt + arrow keys move; Alt + Home restores the default position.';
  let active = null;

  function constrain(left, top, width, height, viewportWidth, viewportHeight) {
    return {
      left: Math.max(margin, Math.min(left, viewportWidth - width - margin)),
      top: Math.max(margin, Math.min(top, viewportHeight - height - margin)),
    };
  }

  function register(panel, options = {}) {
    if (!panel) return null;
    if (entries.has(panel)) return entries.get(panel).api;
    const label = options.label || panel.getAttribute('aria-label') || panel.id;
    let position = null, drag = null, generated = null, scheduled = false, suppressClick = false;
    const baseZ = Math.max(50, Number.parseInt(global.getComputedStyle(panel).zIndex, 10) || 0);
    panel.setAttribute('data-vm-floating-panel', label);
    if (options.portal) document.body.append(panel);

    const visible = () => !panel.closest('[hidden], [aria-hidden="true"]') && panel.getBoundingClientRect().width > 0;
    function activate() {
      if (active && active !== panel) active.style.setProperty('--vm-floating-z', String(entries.get(active).baseZ));
      active = panel;
      panel.style.setProperty('--vm-floating-z', String(Math.max(55, baseZ)));
    }
    function move(left, top, bringToFront = true) {
      if (!position) {
        const style = global.getComputedStyle(panel);
        const px = key => Number.parseFloat(style[key]) || 0;
        const contentBox = style.boxSizing !== 'border-box';
        panel.style.setProperty('--vm-floating-max-width', style.maxWidth === 'none' ? '100vw' : style.maxWidth);
        panel.style.setProperty('--vm-floating-max-height', style.maxHeight === 'none' ? '100dvh' : style.maxHeight);
        panel.style.setProperty('--vm-floating-extra-width', (contentBox ? px('paddingLeft') + px('paddingRight') + px('borderLeftWidth') + px('borderRightWidth') : 0) + 'px');
        panel.style.setProperty('--vm-floating-extra-height', (contentBox ? px('paddingTop') + px('paddingBottom') + px('borderTopWidth') + px('borderBottomWidth') : 0) + 'px');
      }
      const box = panel.getBoundingClientRect();
      position = constrain(left, top, box.width, box.height, global.innerWidth, global.innerHeight);
      panel.style.setProperty('--vm-floating-left', position.left + 'px');
      panel.style.setProperty('--vm-floating-top', position.top + 'px');
      panel.setAttribute('data-vm-floating-moved', 'true');
      if (bringToFront) activate();
    }
    function refreshHandles() {
      let handles = options.handle ? [...panel.querySelectorAll(options.handle)] : [];
      if (!handles.length) {
        if (!generated?.isConnected) {
          generated = document.createElement(options.grip ? 'button' : 'div');
          generated.className = options.grip ? 'vm-floating-panel__grip' : 'vm-section-label vm-floating-panel__title';
          if (options.grip) {
            generated.type = 'button';
            generated.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">drag_indicator</span>';
            if (options.inlineGrip) generated.classList.add('vm-floating-panel__grip--inline');
          } else generated.textContent = label;
          panel.prepend(generated);
        }
        handles = [generated];
      } else if (generated?.isConnected) generated.remove();
      for (const handle of handles) {
        handle.setAttribute('data-vm-drag-handle', '');
        if (!handle.hasAttribute('tabindex') && handle.tagName !== 'BUTTON') handle.tabIndex = 0;
        if (!handle.hasAttribute('aria-label')) handle.setAttribute('aria-label', `Move ${label}`);
        if (!handle.hasAttribute('data-tooltip')) handle.setAttribute('data-tooltip', instructions);
      }
    }
    function cancelDrag() {
      if (!drag) return;
      const { id, handle } = drag;
      drag.handle.classList.remove('is-dragging');
      drag = null;
      panel.removeAttribute('data-vm-floating-dragging');
      if (handle.hasPointerCapture?.(id)) handle.releasePointerCapture(id);
    }
    function refresh() {
      scheduled = false;
      refreshHandles();
      if (drag && !drag.handle.isConnected) cancelDrag();
      if (!visible()) { cancelDrag(); return; }
      if (position) move(position.left, position.top, false);
      else if (options.anchor) {
        const anchor = document.querySelector(options.anchor)?.getBoundingClientRect();
        if (anchor) {
          const box = panel.getBoundingClientRect();
          const next = constrain(anchor.right - box.width, anchor.bottom + 4, box.width, box.height, global.innerWidth, global.innerHeight);
          panel.style.left = next.left + 'px'; panel.style.top = next.top + 'px';
        }
      }
    }
    function schedule() {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(refresh);
    }
    function reset() {
      cancelDrag(); position = null;
      panel.removeAttribute('data-vm-floating-moved');
      panel.style.removeProperty('--vm-floating-left'); panel.style.removeProperty('--vm-floating-top');
      refresh();
    }
    function handleFor(event) {
      const handle = event.target.closest?.('[data-vm-drag-handle]');
      if (!handle || handle.closest('[data-vm-floating-panel]') !== panel) return null;
      const control = event.target.closest(interactive);
      return control && control !== handle ? null : handle;
    }
    panel.addEventListener('pointerdown', event => {
      suppressClick = false;
      const handle = handleFor(event);
      if (!handle || event.button !== 0 || !event.isPrimary || !visible()) return;
      const box = panel.getBoundingClientRect();
      drag = { id: event.pointerId, handle, x: event.clientX, y: event.clientY, left: box.left, top: box.top, moved: false };
      handle.setPointerCapture(event.pointerId);
      handle.focus({ preventScroll: true });
      // Stop scene gestures, while leaving an operator header's ordinary click intact.
      event.preventDefault(); event.stopPropagation();
    });
    panel.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 3) return;
      drag.moved = true;
      drag.handle.classList.add('is-dragging');
      panel.setAttribute('data-vm-floating-dragging', 'true');
      move(drag.left + dx, drag.top + dy);
      event.preventDefault(); event.stopPropagation();
    });
    panel.addEventListener('pointerup', event => {
      if (!drag || drag.id !== event.pointerId) return;
      suppressClick = drag.moved;
      cancelDrag(); event.stopPropagation();
    });
    for (const type of ['pointercancel', 'lostpointercapture']) panel.addEventListener(type, cancelDrag);
    panel.addEventListener('click', event => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    panel.addEventListener('keydown', event => {
      const handle = handleFor(event);
      if (!handle || event.target !== handle || !event.altKey) return;
      const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (event.key === 'Home') reset();
      else if (directions[event.key]) {
        const box = panel.getBoundingClientRect(), delta = event.shiftKey ? 1 : 10;
        const [x, y] = directions[event.key]; move(box.left + x * delta, box.top + y * delta);
      } else return;
      event.preventDefault(); event.stopPropagation();
    });
    const observer = new MutationObserver(schedule);
    observer.observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'class'] });
    const resizeObserver = global.ResizeObserver && new global.ResizeObserver(schedule);
    resizeObserver?.observe(panel);
    // A centered dialog may be opened by changing its backdrop rather than itself.
    const backdrop = panel.closest('#helpOverlay, #elementColorOverlay, .vm-canvas-video-export__overlay');
    if (backdrop) observer.observe(backdrop, { attributes: true, attributeFilter: ['aria-hidden', 'class', 'hidden'] });
    const api = Object.freeze({ refresh, cancelDrag, reset, getPosition: () => position && { ...position } });
    entries.set(panel, { api, baseZ });
    refresh();
    return api;
  }

  const catalog = [
    ['styleStudio', 'Style Studio', '.vm-list-popover__header'],
    ['moldenInspector', 'Orbitals', '.motionPanelHeader'],
    ['viewInspector', 'View actions', '.viewInspectorTitle'],
    ['spinorInfoPanel', 'Spinor information', '.spinorInfoPanelHead'],
    ['sidePanel', 'View', '.vm-popover__header'],
    ['coordsPanel', 'Coordinates', '.motionPanelHeader'],
    ['trajectoryPanel', 'Trajectory', '.motionPanelHeader'],
    ['vibrationPanel', 'Frequencies', '.motionPanelHeader'],
    ['helpModal', 'Keyboard shortcuts', '.vm-popover__header'],
    ['elementColorModal', 'Element colors', '#elementColorHead'],
    ['appearanceResetPopover', 'Reset appearance', '.vm-sidebar-reset-popover__title', { portal: true, anchor: '#appearanceResetBtn' }],
    ['displayWindowAdaptiveMenu', 'Window and edit tools', null, { grip: true }],
    ['editAdaptiveAddAtomPopover', 'Build'],
    ['editAdaptiveSymmetryPopover', 'Symmetry', '#editSymmetryTitleRow'],
    ['editSelectionTranslateCue', 'Selection tools', null, { grip: true, inlineGrip: true }],
    ['editSelectionCoordinationCuePopover', 'Coordination', '.editCoordinationCueHeader'],
    ['editSelectionMetalBondingCuePopover', 'Metal bond mode', '.editCoordinationCueHeader'],
    ['bondOrderPopup', 'Bond order', '#bondOrderPopupTitle'],
    ['editAddAtomOperatorPanel', 'Atom placement', '#editAddAtomOperatorHeader'],
    ['editAddMoleculeOperatorPanel', 'Molecule placement', '#editAddMoleculeOperatorHeader'],
    ['trajectoryVideoCropActions', 'Trajectory recording controls', null, { grip: true, inlineGrip: true }],
    ['vibrationVideoCropActions', 'Frequency recording controls', null, { grip: true, inlineGrip: true }],
  ];
  global.VibeMolFloatingPanels = Object.freeze({
    register, constrain,
    get: panel => entries.get(panel)?.api || null,
    list: () => [...entries].map(([panel, entry]) => ({ id: panel.id, label: panel.getAttribute('data-vm-floating-panel'), position: entry.api.getPosition() })),
  });
  for (const [id, label, handle, options] of catalog) register(document.getElementById(id), { label, handle, ...options });
  global.addEventListener('resize', () => { for (const entry of entries.values()) entry.api.refresh(); });
})(window);
