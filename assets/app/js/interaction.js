(function (global) {
  /**
   * Check whether keyboard focus is currently inside an editable form control.
   * @returns {boolean}
   */
  function isTypingInInput() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA') return true;
    if (tag === 'SELECT') return false;
    if (tag === 'INPUT') {
      const type = String(el.getAttribute('type') || el.type || 'text').toLowerCase();
      return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(type);
    }
    return !!(typeof el.isContentEditable === 'boolean' && el.isContentEditable);
  }

  /**
   * Normalize keyboard events so single-character keys are lowercase.
   * @param {KeyboardEvent} e
   * @returns {string}
   */
  function normKey(e) {
    let k = e.key || '';
    if (k.length === 1) k = k.toLowerCase();
    return k;
  }

  /**
   * Build a scoped shortcut registry with `keydown`/`keyup` channels.
   * Scope-specific handlers override global handlers for the same key.
   * @param {string[]} scopes
   * @returns {{
   *   shortcuts: Record<string, Record<string, Record<string, Function>>>,
   *   bind: (kind:string, scope:string, key:string, fn:Function) => void,
   *   handle: (e:KeyboardEvent, kind:string, mode:string) => void
   * }}
   */
  function createShortcutRegistry(scopes = []) {
    /**
     * Create a plain dictionary with no prototype chain.
     * @returns {Record<string, Function>}
     */
    const map = () => Object.create(null);
    const shortcuts = {
      down: { global: map() },
      up: { global: map() },
    };

    for (const scope of scopes) {
      shortcuts.down[scope] = map();
      shortcuts.up[scope] = map();
    }

    /**
     * Ensure a shortcut bucket exists for a key event kind + scope pair.
     * @param {string} kind
     * @param {string} scope
     */
    function ensureScope(kind, scope) {
      if (!shortcuts[kind]) shortcuts[kind] = { global: map() };
      if (!shortcuts[kind][scope]) shortcuts[kind][scope] = map();
    }

    /**
     * Register a shortcut callback.
     * @param {string} kind
     * @param {string} scope
     * @param {string} key
     * @param {Function} fn
     */
    function bind(kind, scope, key, fn) {
      ensureScope(kind, scope);
      shortcuts[kind][scope][key] = fn;
    }

    /**
     * Route an incoming key event to the best-matching callback.
     * Matching order: active mode scope, then global scope.
     * @param {KeyboardEvent} e
     * @param {string} kind
     * @param {string} mode
     */
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
