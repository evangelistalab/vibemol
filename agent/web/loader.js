// Single entry point for the Claude connector. index.html includes only this
// script (after app.js) and an empty #vibemolAgentMount element; everything else
// loads from agent/web/. Removing those two lines removes the feature entirely.
(function () {
  'use strict';
  const script = document.currentScript;
  const base = new URL('./', script && script.src ? script.src : location.href);
  // index.html loads this file as loader.js?v=<release> (tools/sync_asset_versions.py
  // stamps it); pass the same version on so a release never mixes cached agent files.
  const version = (script && script.src ? new URL(script.src).searchParams.get('v') : null)
    || (window.VibeMolAssets && window.VibeMolAssets.version) || '';
  const at = file => { const u = new URL(file, base); if (version) u.searchParams.set('v', version); return u.href; };
  window.VibeMolAgentConfig = Object.assign({ baseUrl: base.href, schemaUrl: at('../tools.schema.json') }, window.VibeMolAgentConfig || {});

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = at('link.css');
  document.head.appendChild(css);

  // Order matters: config → UI reflection → host (uses app seam) → source reader → tools
  // → pairing link (renders the menu) → extensions (fills the menu, runs saved ones) → lasso.
  for (const file of ['config.js', 'identity.js', 'ui.js', 'host.js', 'source.js', 'tools.js', 'link.js', 'extensions.js', 'lasso.js']) {
    const el = document.createElement('script');
    el.src = at(file);
    el.async = false;
    document.head.appendChild(el);
  }
})();
