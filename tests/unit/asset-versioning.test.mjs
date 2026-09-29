import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { REPO_ROOT } from './load-global-module.mjs';

test('release generation stamps all asset levels and check detects stale releases', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vibemol-asset-version-'));
  try {
    for (const dir of ['tools', 'assets/app/js', 'src/styles', 'assets/app/fonts', 'assets/app/css']) {
      fs.mkdirSync(path.join(root, dir), { recursive: true });
    }
    for (const file of ['tools/sync_asset_versions.py', 'assets/app/js/asset-urls.js']) {
      fs.copyFileSync(path.join(REPO_ROOT, file), path.join(root, file));
    }
    fs.writeFileSync(path.join(root, 'assets/app/js/first.js'), '// first');
    fs.writeFileSync(path.join(root, 'assets/app/js/second.js'), '// second');
    fs.writeFileSync(path.join(root, 'assets/app/fonts/font.woff2'), 'font');
    fs.writeFileSync(path.join(root, 'src/styles/test.css'),
      '@font-face{src:url("../../assets/app/fonts/font.woff2?subset=all#font")}');
    const html = `<link rel="stylesheet" href="src/styles/test.css">
      <script src="assets/app/js/first.js?v=old"></script>
      <script src="assets/app/js/second.js?flag=1&amp;v=old"></script>
      <script src="https://external.example/code.js"></script>
      <script>const sample = '<img src="example.png">';</script>
      <a href="notes.html">Notes</a><img src="data:image/png,test">`;
    fs.writeFileSync(path.join(root, 'index.html'), html);
    const command = ['tools/sync_asset_versions.py'];
    const options = { cwd: root, encoding: 'utf8' };
    assert.equal(spawnSync('python3', [...command, '--check'], options).status, 1);
    execFileSync('python3', [...command, '--version', '1.2.3'], options);
    execFileSync('python3', [...command, '--check'], options);
    const updated = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(updated.includes('src/styles/test.css?v=1.2.3'));
    assert.ok(updated.includes('assets/app/js/first.js?v=1.2.3'));
    assert.ok(updated.includes('assets/app/js/second.js?flag=1&amp;v=1.2.3'));
    assert.ok(updated.indexOf('first.js') < updated.indexOf('second.js'));
    assert.ok(updated.includes('<script src="https://external.example/code.js"></script>'));
    assert.ok(updated.includes("const sample = '<img src=\"example.png\">';"));
    assert.ok(updated.includes('<a href="notes.html">Notes</a><img src="data:image/png,test">'));
    assert.ok(fs.readFileSync(path.join(root, 'src/styles/test.css'), 'utf8').includes('font.woff2?subset=all&v=1.2.3#font'));
    execFileSync('python3', command, options);
    assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), updated, 'Idempotent output');
    execFileSync('python3', [...command, '--version', '1.2.4'], options);
    assert.ok(fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('first.js?v=1.2.4'));
    assert.ok(fs.readFileSync(path.join(root, 'assets/app/js/asset-urls.js'), 'utf8').includes("APP_VERSION = '1.2.4'"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
