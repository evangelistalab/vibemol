import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';

function assets(baseURI = 'https://vibemol.org/', extras = {}) {
  const scriptBase = extras.VSCODE_BASE_URI ? `${extras.VSCODE_BASE_URI}/` : baseURI;
  return loadGlobalModule('assets/app/js/asset-urls.js', { globals: {
    URL,
    document: { baseURI, currentScript: { src: new URL('assets/app/js/asset-urls.js', scriptBase).href } },
    ...extras,
  } }).VibeMolAssets;
}

test('bundled URLs share the runtime version, preserving queries, hashes and relative paths', () => {
  const a = assets();
  assert.equal(a.url('./assets/app/js/app.js'), `./assets/app/js/app.js?v=${a.version}`);
  assert.equal(a.url('src/styles/tokens.css?theme=dark&v=old&v=duplicate#font'),
    `src/styles/tokens.css?theme=dark&v=${a.version}#font`);
  const absolute = 'https://vibemol.org/assets/fragments/methyl.xyz';
  assert.equal(a.url(absolute), `${absolute}?v=${a.version}`);
  assert.equal(a.url(a.url(absolute)), a.url(absolute));
});

test('third-party, user data, downloads and navigation URLs are untouched', () => {
  const a = assets();
  for (const url of ['https://pubchem.ncbi.nlm.nih.gov/rest/pug?x=1',
    'https://cdn.example/assets/a.js?signature=abc', '//other.example/assets/a.js',
    'blob:https://vibemol.org/123', 'data:image/svg+xml,<svg/>', '#help',
    '?view=edit', 'uploads/structure.xyz?token=a', 'https://vibemol.org/user.cube']) {
    assert.equal(a.url(url), url);
  }
});

test('subdirectory, local file and VS Code roots retain their own asset scope', () => {
  for (const base of ['https://example.org/vibemol/', 'file:///work/vibemol/']) {
    const a = assets(base);
    assert.equal(a.url('assets/app/js/app.js'), `assets/app/js/app.js?v=${a.version}`);
    assert.equal(a.url('../other/assets/secret.xyz?x=1'), '../other/assets/secret.xyz?x=1');
  }
  const a = assets('vscode-webview://editor/index.html', { VSCODE_BASE_URI: 'https://resource.example/app' });
  assert.equal(a.url('assets/data/sample.cube'), `assets/data/sample.cube?v=${a.version}`);
  assert.equal(a.url('https://resource.example/app/assets/data/sample.cube'),
    `https://resource.example/app/assets/data/sample.cube?v=${a.version}`);
});
