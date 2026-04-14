(function () {
  const SHOW_DELAY_MS = 400;
  const HIDE_DELAY_MS = 80;
  const POINTER_GRACE_MS = 200;
  const VIEWPORT_PAD_PX = 8;
  const VALID_PLACEMENTS = new Set(['bottom', 'top', 'left', 'right']);

  let tooltipEl = null;
  let currentTarget = null;
  let currentTriggerKind = null;
  let showTimer = null;
  let hideTimer = null;
  let installed = false;
  let mutationObserver = null;
  let lastPointerX = Number.NaN;
  let lastPointerY = Number.NaN;
  let lastPointerDownAt = 0;
  let lastPointerDownTarget = null;

  function ensureTooltipElement() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'vm-tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    tooltipEl.setAttribute('aria-hidden', 'true');
    tooltipEl.style.visibility = 'hidden';
    document.body.appendChild(tooltipEl);
    return tooltipEl;
  }

  function clearTimers() {
    if (showTimer) {
      window.clearTimeout(showTimer);
      showTimer = null;
    }
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function getTooltipTarget(node) {
    return node instanceof Element ? node.closest('[data-tooltip]') : null;
  }

  function getTooltipText(target) {
    return String(target && target.getAttribute ? target.getAttribute('data-tooltip') || '' : '').trim();
  }

  function getTooltipPlacement(target) {
    const raw = String(target && target.getAttribute ? target.getAttribute('data-tooltip-placement') || '' : '').trim().toLowerCase();
    return VALID_PLACEMENTS.has(raw) ? raw : 'bottom';
  }

  function hideTooltip() {
    clearTimers();
    currentTarget = null;
    currentTriggerKind = null;
    if (!tooltipEl) return;
    tooltipEl.classList.remove('vm-tooltip--visible');
    tooltipEl.setAttribute('aria-hidden', 'true');
    tooltipEl.style.visibility = 'hidden';
    tooltipEl.style.left = '0px';
    tooltipEl.style.top = '0px';
    tooltipEl.textContent = '';
    tooltipEl.removeAttribute('data-placement');
  }

  function positionTooltip(target) {
    const el = ensureTooltipElement();
    if (!target || !document.documentElement.contains(target)) {
      hideTooltip();
      return;
    }

    const placement = getTooltipPlacement(target);
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = el.getBoundingClientRect();
    const gap = 8;
    let left = 0;
    let top = 0;

    switch (placement) {
      case 'top':
        left = targetRect.left + (targetRect.width * 0.5) - (tooltipRect.width * 0.5);
        top = targetRect.top - tooltipRect.height - gap;
        break;
      case 'right':
        left = targetRect.right + gap;
        top = targetRect.top + (targetRect.height * 0.5) - (tooltipRect.height * 0.5);
        break;
      case 'left':
        left = targetRect.left - tooltipRect.width - gap;
        top = targetRect.top + (targetRect.height * 0.5) - (tooltipRect.height * 0.5);
        break;
      case 'bottom':
      default:
        left = targetRect.left + (targetRect.width * 0.5) - (tooltipRect.width * 0.5);
        top = targetRect.bottom + gap;
        break;
    }

    left = Math.max(VIEWPORT_PAD_PX, Math.min(left, window.innerWidth - tooltipRect.width - VIEWPORT_PAD_PX));
    top = Math.max(VIEWPORT_PAD_PX, Math.min(top, window.innerHeight - tooltipRect.height - VIEWPORT_PAD_PX));

    el.dataset.placement = placement;
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }

  function isTooltipVisible() {
    return !!(tooltipEl && tooltipEl.getAttribute('aria-hidden') === 'false');
  }

  function isFinitePointerCoord(value) {
    return Number.isFinite(value);
  }

  function isPointerInsideTarget(target, clientX, clientY) {
    if (!target || !document.documentElement.contains(target)) return false;
    if (!isFinitePointerCoord(clientX) || !isFinitePointerCoord(clientY)) return false;
    const rect = target.getBoundingClientRect();
    return clientX >= rect.left
      && clientX <= rect.right
      && clientY >= rect.top
      && clientY <= rect.bottom;
  }

  function syncPointerTooltipVisibility(delay) {
    if (currentTriggerKind !== 'pointer' || !isTooltipVisible()) return;
    if (!currentTarget || !document.documentElement.contains(currentTarget)) {
      hideTooltip();
      return;
    }
    if (isPointerInsideTarget(currentTarget, lastPointerX, lastPointerY)) {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
      positionTooltip(currentTarget);
      return;
    }
    scheduleHide(currentTarget, typeof delay === 'number' ? delay : POINTER_GRACE_MS);
  }

  function showTooltipNow(target, triggerKind) {
    clearTimers();
    if (!target || !document.documentElement.contains(target)) {
      hideTooltip();
      return;
    }
    const content = getTooltipText(target);
    if (!content) {
      hideTooltip();
      return;
    }
    currentTarget = target;
    currentTriggerKind = triggerKind === 'focus' ? 'focus' : 'pointer';
    const el = ensureTooltipElement();
    el.textContent = content;
    el.style.visibility = 'hidden';
    el.classList.add('vm-tooltip--visible');
    el.setAttribute('aria-hidden', 'false');
    window.requestAnimationFrame(() => {
      if (currentTarget !== target) return;
      positionTooltip(target);
      el.style.visibility = 'visible';
    });
  }

  function scheduleShow(target) {
    clearTimers();
    if (currentTarget && currentTarget !== target && isTooltipVisible()) {
      hideTooltip();
    }
    currentTarget = target;
    currentTriggerKind = 'pointer';
    showTimer = window.setTimeout(() => {
      if (currentTarget === target) showTooltipNow(target);
    }, SHOW_DELAY_MS);
  }

  function scheduleHide(target, delay) {
    clearTimers();
    hideTimer = window.setTimeout(() => {
      if (!target || currentTarget === target) hideTooltip();
    }, typeof delay === 'number' ? delay : HIDE_DELAY_MS);
  }

  function handleMouseOver(event) {
    const target = getTooltipTarget(event.target);
    if (!target) return;
    const related = getTooltipTarget(event.relatedTarget);
    if (related === target) return;
    scheduleShow(target);
  }

  function handleMouseOut(event) {
    const target = getTooltipTarget(event.target);
    if (!target || currentTarget !== target) return;
    const related = getTooltipTarget(event.relatedTarget);
    if (related === target) return;
    scheduleHide(target, HIDE_DELAY_MS);
  }

  function handleFocusIn(event) {
    const target = getTooltipTarget(event.target);
    if (!target) return;
    if (lastPointerDownTarget === target && (Date.now() - lastPointerDownAt) < 600) return;
    showTooltipNow(target, 'focus');
  }

  function handleFocusOut(event) {
    const target = getTooltipTarget(event.target);
    if (!target || currentTarget !== target) return;
    const related = getTooltipTarget(event.relatedTarget);
    if (related === target) return;
    scheduleHide(target, 0);
  }

  function handlePointerDown(event) {
    lastPointerDownAt = Date.now();
    lastPointerDownTarget = getTooltipTarget(event.target);
    if (!currentTarget) return;
    hideTooltip();
  }

  function handleViewportChange() {
    if (!currentTarget || !tooltipEl || tooltipEl.getAttribute('aria-hidden') === 'true') return;
    if (currentTriggerKind === 'pointer') {
      syncPointerTooltipVisibility(0);
      return;
    }
    positionTooltip(currentTarget);
  }

  function handleMouseMove(event) {
    lastPointerX = Number(event.clientX);
    lastPointerY = Number(event.clientY);
    syncPointerTooltipVisibility(POINTER_GRACE_MS);
  }

  function installGlobalTooltipDelegation() {
    if (installed) return;
    installed = true;
    ensureTooltipElement();
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);
    mutationObserver = new MutationObserver(() => {
      if (currentTarget && !document.documentElement.contains(currentTarget)) hideTooltip();
    });
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.VibeMolTooltip = Object.freeze({
    hideTooltip,
    installGlobalTooltipDelegation,
  });
})();
