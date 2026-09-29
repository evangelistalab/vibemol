// Single entry point for the Claude connector. index.html includes only this
// script (after app.js) and an empty #vibemolAgentMount element; everything else
// loads from agent/web/. Removing those two lines removes the feature entirely.
(function () {
  'use strict';
  const script = document.currentScript;
  const base = new URL('./', script && script.src ? script.src : location.href);
  window.VibeMolAgentConfig = Object.assign({ baseUrl: base.href, schemaUrl: new URL('../tools.schema.json', base).href }, window.VibeMolAgentConfig || {});

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('link.css', base).href;
  document.head.appendChild(css);

  // Order matters: config → UI reflection → host (uses app seam) → source reader → tools
  // → pairing link (renders the menu) → extensions (fills the menu, runs saved ones) → lasso.
  for (const file of ['config.js', 'identity.js', 'ui.js', 'host.js', 'source.js', 'tools.js', 'link.js', 'extensions.js', 'lasso.js']) {
    const el = document.createElement('script');
    el.src = new URL(file, base).href;
    el.async = false;
    document.head.appendChild(el);
  }
})();
