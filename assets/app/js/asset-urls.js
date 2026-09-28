(function (global) {
  'use strict';

  // Single release version. Run `make version-assets` after changing it.
  const APP_VERSION = '0.9.2';
  const scriptUrl = global.document?.currentScript?.src;
  const root = scriptUrl ? new URL('../../../', scriptUrl) : null;

  /** Version bundled assets only; never modify external or user-supplied URLs. */
  function url(value) {
    if (typeof value !== 'string' || !value || value.startsWith('#') || !root) return value;
    let resolved;
    const base = global.VSCODE_BASE_URI ? root.href : global.document.baseURI;
    try { resolved = new URL(value, base); } catch { return value; }
    if (resolved.protocol !== root.protocol || resolved.host !== root.host
      || !resolved.pathname.startsWith(root.pathname)) return value;
    const path = resolved.pathname.slice(root.pathname.length);
    if (!/^(?:assets|src)\//.test(path)) return value;
    resolved.searchParams.set('v', APP_VERSION);
    // Keep relative paths relative for file:// and the VS Code webview bridge.
    return value.split(/[?#]/, 1)[0] + resolved.search + resolved.hash;
  }

  global.VibeMolAssets = Object.freeze({ version: APP_VERSION, url });
})(typeof window !== 'undefined' ? window : globalThis);
