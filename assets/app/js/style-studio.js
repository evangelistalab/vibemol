(function (global) {
  'use strict';

  function createController({ panel, button, closeButton, onOpen }) {
    const movable = global.VibeMolFloatingPanels.register(panel, { label: 'Style Studio', handle: '.vm-list-popover__header' });
    const isOpen = () => panel.classList.contains('open');
    function setOpen(open, { focus = true } = {}) {
      const next = !!open;
      if (next === isOpen()) return;
      panel.classList.toggle('open', next);
      panel.setAttribute('aria-hidden', String(!next));
      button.setAttribute('aria-expanded', String(next));
      if (next) {
        onOpen?.();
        movable.refresh();
        if (focus) panel.querySelector('#lookPreset')?.focus({ preventScroll: true });
      } else {
        movable.cancelDrag();
        if (focus) button.focus({ preventScroll: true });
      }
    }
    button.addEventListener('click', () => {
      if (global.VibeMolWorkbench?.restoreIfHidden('styleStudio')) return;
      setOpen(!isOpen());
    });
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
    return Object.freeze({ isOpen, setOpen });
  }

  global.VibeMolStyleStudio = Object.freeze({ createController });
})(window);
