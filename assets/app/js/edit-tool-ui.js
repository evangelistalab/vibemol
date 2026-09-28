(function (global) {
  'use strict';

  // A projection of the existing edit intent, never a second tool state.
  function describe(state) {
    const entity = state.payload || {};
    const name = entity.kind === 'atom' ? String(entity.name || 'atom').toLowerCase() : String(entity.name || 'item');
    const badge = entity.symbol || entity.name || '';
    const build = !!state.build;
    const escape = escapeAction(state);
    const placement = state.placement || {};
    const kind = placement.kind || entity.kind || 'atom';
    const object = kind === 'atom' ? 'this atom' : `this ${kind}${placement.name || entity.name ? ` (${placement.name || entity.name})` : ''}`;
    const action = kind === 'fused ring' ? 'Drag to spin around bond · Click again to place'
      : state.placement?.stage === 'catalog' ? 'Drag to rotate · Click again to place · X/Y/Z align'
      : 'Adjust location';
    const hint = build ? state.placing
      ? `${action}${state.confirmable ? ' · Enter confirms' : ''} · Esc discards ${object}`
      : `Click to place ${name} · Right-drag to rotate · Esc switches to Transform`
      : `Left-click atoms or bonds to select · ${escape === 'clear' ? 'Esc clears selection' : 'Right-drag to rotate'} · / opens Build`;
    return { build, name, badge, hint };
  }

  function escapeAction(state) {
    return state.placing ? 'cancel' : state.build ? 'transform' : state.selected ? 'clear' : null;
  }

  // Tool intent is workspace interaction state, not a scientific preset. A
  // WeakMap releases closed scenes and does not arm tools on session restore.
  function createSceneTools() {
    const choices = new WeakMap();
    return {
      enter(scene, hasAtoms) {
        const first = !choices.has(scene);
        const tool = choices.get(scene) || (hasAtoms ? 'transform' : 'build');
        choices.set(scene, tool);
        return { tool, first };
      },
      remember(scene, tool) { if (scene) choices.set(scene, tool); },
    };
  }

  function createController({ canvas, getState, setTool, onChange }) {
    const overlay = document.createElement('div');
    overlay.id = 'editToolOverlay'; overlay.className = 'vm-edit-tool-overlay';
    overlay.setAttribute('aria-hidden', 'true'); overlay.hidden = true;
    const cursor = document.createElement('div'); cursor.className = 'vm-build-cursor'; cursor.hidden = true;
    cursor.innerHTML = '<svg width="25" height="25" viewBox="0 0 25 25"><path d="M12.5 1v8m0 7v8M1 12.5h8m7 0h8"/></svg>';
    const badge = document.createElement('span'); badge.className = 'vm-tool-badge'; cursor.append(badge);
    overlay.append(cursor); document.body.append(overlay);
    let strip, transform, build, entity, lastKey = '', lastRect = '', pointer = null;
    function move(event) {
      pointer = event.target === canvas && event.pointerType !== 'touch' ? { x: event.clientX, y: event.clientY } : null;
      position();
    }
    function position() {
      cursor.hidden = overlay.hidden || !pointer;
      if (cursor.hidden) return;
      const rect = canvas.getBoundingClientRect();
      cursor.style.left = `${pointer.x - rect.left}px`;
      cursor.style.top = `${pointer.y - rect.top}px`;
      // Keep long fragment names inside the viewport, away from the hotspot.
      cursor.classList.toggle('near-right', rect.right - pointer.x < badge.offsetWidth + 24);
      cursor.classList.toggle('near-bottom', rect.bottom - pointer.y < 48);
    }
    document.addEventListener('pointermove', move, { passive: true });
    canvas.addEventListener('pointerenter', move, { passive: true });
    canvas.addEventListener('pointerleave', () => { pointer = null; position(); });
    global.addEventListener('blur', () => { pointer = null; position(); });

    function sync() {
      const state = getState(), info = describe(state);
      const key = JSON.stringify([state.edit, state.build, state.placing, state.confirmable, state.selected, state.hasAtoms, info.badge, info.name, info.hint]);
      if (key !== lastKey) {
        lastKey = key;
        overlay.hidden = !state.edit || !info.build;
        canvas.classList.toggle('vm-build-armed', !overlay.hidden);
        badge.textContent = info.badge;
        if (strip) {
          strip.hidden = !state.edit;
          for (const [button, active] of [[build, info.build], [transform, !info.build]]) {
            button.setAttribute('aria-checked', String(active)); button.tabIndex = active ? 0 : -1;
          }
          build.setAttribute('aria-label', info.build ? `Build, ${info.name}` : 'Build');
          entity.textContent = info.build ? info.badge : '';
          entity.hidden = !info.build;
        }
        if (state.edit) onChange(info);
      }
      if (!overlay.hidden) {
        const rect = canvas.getBoundingClientRect();
        const rectKey = [rect.x, rect.y, rect.width, rect.height].join(',');
        if (rectKey !== lastRect) {
          lastRect = rectKey;
          Object.assign(overlay.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
        }
      }
      position();
    }

    function mountToolbar(parent, buildButton) {
      strip = document.createElement('div'); strip.id = 'editToolStrip'; strip.className = 'wb-edit-tools';
      strip.setAttribute('role', 'radiogroup'); strip.setAttribute('aria-label', 'Edit tool');
      transform = document.createElement('button'); transform.id = 'editTransformToolBtn'; transform.type = 'button'; transform.textContent = 'Transform';
      build = buildButton; build.replaceChildren(document.createTextNode('Build'));
      entity = document.createElement('span'); entity.className = 'vm-tool-badge'; build.append(entity);
      for (const button of [build, transform]) {
        button.className = 'vm-btn vm-btn--ghost wb-edit-tool-radio';
        button.setAttribute('role', 'radio'); button.removeAttribute('aria-pressed');
        button.removeAttribute('aria-expanded'); button.removeAttribute('aria-haspopup');
      }
      build.removeAttribute('data-tooltip'); build.removeAttribute('aria-controls');
      transform.onclick = () => { setTool('transform'); sync(); };
      build.onclick = () => { setTool('build', { openPalette: true }); sync(); };
      strip.append(build, transform); parent.append(strip);
      strip.addEventListener('keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const next = event.key === 'Home' ? build : event.key === 'End' ? transform : event.target === transform ? build : transform;
        // Arrow navigation changes tools without moving focus into a palette.
        setTool(next === transform ? 'transform' : 'build'); sync(); next.focus();
      });
      lastKey = ''; sync(); return strip;
    }
    return Object.freeze({ sync, mountToolbar });
  }
  global.VibeMolEditToolUi = Object.freeze({ describe, escapeAction, createSceneTools, createController });
})(window);
