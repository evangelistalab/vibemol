(function (global) {
  'use strict';

  function createController({ panel, button, closeButton, onOpen }) {
    const header = panel.querySelector('.vm-list-popover__header');
    let position = null, drag = null;
    const isOpen = () => panel.classList.contains('open');
    function place(left = position?.left ?? 12, top = position?.top ?? 72) {
      const box = panel.getBoundingClientRect();
      position = {
        left: Math.max(12, Math.min(left, global.innerWidth - box.width - 12)),
        top: Math.max(12, Math.min(top, global.innerHeight - box.height - 12)),
      };
      panel.style.left = position.left + 'px';
      panel.style.top = position.top + 'px';
    }
    function setOpen(open, { focus = true } = {}) {
      const next = !!open;
      if (next === isOpen()) return;
      panel.classList.toggle('open', next);
      panel.setAttribute('aria-hidden', String(!next));
      button.setAttribute('aria-expanded', String(next));
      if (next) {
        onOpen?.();
        place();
        if (focus) panel.querySelector('#lookPreset')?.focus({ preventScroll: true });
      } else {
        endDrag();
        if (focus) button.focus({ preventScroll: true });
      }
    }
    function endDrag() {
      if (drag && header.hasPointerCapture(drag.id)) header.releasePointerCapture(drag.id);
      drag = null;
      header.classList.remove('is-dragging');
    }
    button.addEventListener('click', () => setOpen(!isOpen()));
    closeButton.addEventListener('click', () => setOpen(false));
    panel.addEventListener('keydown', event => {
      // Controls keep native typing and navigation without triggering scene tools.
      event.stopPropagation();
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        setOpen(false);
      }
    });
    panel.addEventListener('keyup', event => event.stopPropagation());
    header.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button, input, select')) return;
      const box = panel.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX - box.left, y: event.clientY - box.top };
      header.setPointerCapture(event.pointerId);
      header.classList.add('is-dragging');
      event.preventDefault();
    });
    header.addEventListener('pointermove', event => {
      if (drag?.id === event.pointerId) place(event.clientX - drag.x, event.clientY - drag.y);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) header.addEventListener(type, endDrag);
    global.addEventListener('resize', () => { if (isOpen()) place(); });
    return Object.freeze({ isOpen, setOpen });
  }

  global.VibeMolStyleStudio = Object.freeze({ createController });
})(window);
