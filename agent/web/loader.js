// Single entry point for the Claude connector, requested by index.html after app.js.
(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('agent') !== '1') return;
  if (document.getElementById('vibemolAgentMount')) return;

  const github = document.getElementById('githubRepoLink');
  if (!github) return;
  const mount = document.createElement('span');
  mount.id = 'vibemolAgentMount';
  github.after(mount);

  document.querySelector('#helpModal .vm-helpSection:last-child')?.insertAdjacentHTML('beforebegin', `
    <section class="vm-helpSection" data-agent-help>
      <h3 class="vm-section-label">Claude</h3>
      <div class="vm-helpGrid">
        <div class="vm-helpRow"><div class="vm-helpKeys"><kbd class="vm-key-pill">L</kbd></div><div class="vm-helpDescription">Lasso part of the page to show it to Claude</div></div>
      </div>
    </section>`);

  const script = document.currentScript;
  const base = new URL('./', script && script.src ? script.src : location.href);
  // Carry the release version from the loader URL into every requested asset.
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
