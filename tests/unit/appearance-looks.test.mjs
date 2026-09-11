import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';
const api = () => loadGlobalModule('assets/app/js/appearance-looks.js').window.VibeMolLooks;
const plain = value => JSON.parse(JSON.stringify(value));

test('native looks round-trip resolved settings without geometry or orbital computation controls', () => {
  const looks = api();
  for (const builtin of looks.builtins) {
    const file = plain(looks.exportLook(builtin));
    const reopened = looks.importLook(file);
    assert.ok(looks.equal(reopened.settings, builtin.settings));
    assert.equal(file.kind, 'vibemol.preset');
    for (const key of ['surface.iso', 'surface.autoIsoEnabled', 'surface.enabled', 'view.projection', 'view.camera.x', 'global.showAtoms']) {
      assert.ok(!(key in file.settings), key);
    }
    file.settings['view.camera.x'] = 123;
    file.settings['surface.iso'] = 0.7;
    assert.ok(!('view.camera.x' in looks.importLook(file).settings));
    assert.ok(!('surface.iso' in looks.importLook(file).settings));
    reopened.settings['global.elementColorOverrides']['6'] = '#123456';
    assert.notEqual(builtin.settings['global.elementColorOverrides']['6'], '#123456');
  }
});

test('look validation rejects malformed files before applying any settings', () => {
  const looks = api();
  for (const mutate of [
    value => { value.meta.lookVersion = 2; },
    value => { value.settings['appearance.look'].id = '../bad'; },
    value => { value.settings['appearance.look'].name = ''; },
    value => { delete value.settings['lighting.key']; },
    value => { value.settings['lighting.key'] = Infinity; },
    value => { value.settings['surface.opacity'] = 0; },
    value => { value.settings['molecule.material.polish'] = '0.4'; },
    value => { value.settings['molecule.material.finish'] = 'pathtraced'; },
    value => { value.settings['global.elementColorOverrides'] = {6:'url(bad)'}; },
    value => { value.settings['appearance.look'].thumbnail = 'https://example.com/look.png'; },
    value => { value.settings['appearance.look'].thumbnail = 'data:image/svg+xml;base64,PHN2Zz4='; },
    value => { value.settings['appearance.look'].thumbnail = 'data:image/png;base64,' + 'A'.repeat(90000); },
  ]) {
    const file = plain(looks.exportLook(looks.builtins[0])); mutate(file);
    assert.throws(() => looks.importLook(file));
  }
});

test('personal previews are portable bounded PNG data URLs', () => {
  const looks = api();
  const look = { ...plain(looks.builtins[0]), id: 'user-test', thumbnail: 'data:image/png;base64,iVBORw0KGgo=' };
  assert.equal(looks.importLook(plain(looks.exportLook(look))).thumbnail, look.thumbnail);
});

test('modified detection compares palettes by value and tolerates numeric control rounding', () => {
  const looks = api(), before = looks.builtins[0].settings, after = plain(before);
  after['global.elementColorOverrides'] = Object.fromEntries(Object.entries(after['global.elementColorOverrides']).reverse());
  after['molecule.material.polish'] += 1e-12;
  assert.ok(looks.equal(before, after));
  after['molecule.material.polish'] += 0.1;
  assert.ok(!looks.equal(before, after));
});
