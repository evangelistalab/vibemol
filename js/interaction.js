(function (global) {
  function isTypingInInput() {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  function normKey(e) {
    let k = e.key || '';
    if (k.length === 1) k = k.toLowerCase();
    return k;
  }

  function createShortcutRegistry(scopes = []) {
    const map = () => Object.create(null);
    const shortcuts = {
      down: { global: map() },
      up: { global: map() },
    };

    for (const scope of scopes) {
      shortcuts.down[scope] = map();
      shortcuts.up[scope] = map();
    }

    function ensureScope(kind, scope) {
      if (!shortcuts[kind]) shortcuts[kind] = { global: map() };
      if (!shortcuts[kind][scope]) shortcuts[kind][scope] = map();
    }

    function bind(kind, scope, key, fn) {
      ensureScope(kind, scope);
      shortcuts[kind][scope][key] = fn;
    }

    function handle(e, kind, mode) {
      if (isTypingInInput()) return;
      const k = normKey(e);
      const reg = shortcuts[kind];
      if (!reg) return;
      const fn = (reg[mode] && reg[mode][k]) || (reg.global && reg.global[k]);
      if (typeof fn === 'function') fn(e);
    }

    return { shortcuts, bind, handle };
  }

  global.VibeMolInteraction = {
    isTypingInInput,
    normKey,
    createShortcutRegistry,
  };
})(window);
