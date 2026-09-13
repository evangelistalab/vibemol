import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';
const api = () => loadGlobalModules(['assets/app/js/appearance-model.js', 'assets/app/js/appearance-looks.js']).window.VibeMolLooks;
const plain = value => JSON.parse(JSON.stringify(value));

test('native looks round-trip resolved settings without geometry or orbital computation controls', () => {
  const looks = api();
  for (const builtin of looks.builtins) {
    const file = plain(looks.exportLook(builtin));
    const reopened = looks.importLook(file);
    assert.ok(looks.equal(reopened.settings, builtin.settings));
    assert.equal(file.kind, 'vibemol.preset');
    for (const key of ['surface.iso', 'surface.autoIsoEnabled', 'surface.enabled', 'view.projection', 'view.camera.x', 'global.showAtoms', ...Object.keys(looks.cameraFields)]) {
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
    value => { value.meta.lookVersion = 5; },
    value => { value.settings['appearance.look'].id = '../bad'; },
    value => { value.settings['appearance.look'].name = ''; },
    value => { delete value.settings['appearance.rendering']; },
    value => { value.settings['appearance.rendering'].lighting.dirIntensity = Infinity; },
    value => { value.settings['surface.opacity'] = 0; },
    value => { value.settings['appearance.rendering'].material.roughness = '0.4'; },
    value => { value.settings['appearance.rendering'].material.model = 'pathtraced'; },
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

test('old looks retain surface opacity and discard retired atom/bond opacity', () => {
  const looks = api(), file = plain(looks.exportLook(looks.builtins[0]));
  for (const settings of [file.settings, file.settings['appearance.look'].settings]) {
    settings['molecule.opacity.atom'] = 0.2;
    settings['molecule.opacity.bond'] = 0.4;
    settings['surface.opacity'] = 0.65;
  }
  const reopened = looks.importLook(file), exported = looks.exportLook(reopened);
  assert.equal(exported.settings['surface.opacity'], 0.65);
  for (const key of ['molecule.opacity.atom', 'molecule.opacity.bond']) {
    assert.ok(!(key in reopened.settings));
    assert.ok(!(key in exported.settings));
    assert.ok(!(key in exported.settings['appearance.look'].settings));
  }
});

test('modified detection compares palettes by value and tolerates numeric control rounding', () => {
  const looks = api(), before = looks.builtins[0].settings, after = plain(before);
  after['global.elementColorOverrides'] = Object.fromEntries(Object.entries(after['global.elementColorOverrides']).reverse());
  after['appearance.rendering'].material.roughness += 1e-12;
  assert.ok(looks.equal(before, after));
  after['appearance.rendering'].material.roughness += 0.1;
  assert.ok(!looks.equal(before, after));
});

test('legacy named looks shed camera focus while full presets retain their wider scope', () => {
  const looks = api();
  for (const version of [1, 2, 3, 4]) {
    const file = plain(looks.exportLook(looks.builtins[0]));
    file.meta.lookVersion = version;
    for (const settings of [file.settings, file.settings['appearance.look'].settings]) {
      settings['render.dof.enabled'] = true;
      settings['render.dof.focusDistance'] = 22;
    }
    assert.equal(looks.isLookPreset(file), true);
    const restored = looks.importLook(file), exported = looks.exportLook(restored);
    assert.equal(exported.meta.lookVersion, 4);
    assert.ok(looks.equal(restored.settings, looks.builtins[0].settings));
    assert.ok(!('render.dof.focusDistance' in exported.settings));
    file.settings['view.projection'] = 'orthographic';
    assert.equal(looks.isLookPreset(file), false);
  }
});

test('legacy surface overrides are inferred independently and explicit matching overrides survive', () => {
  const looks = api(), defaults = plain(looks.builtins[0].settings);
  assert.deepEqual(plain(looks.surfaceOverrides(defaults, defaults)), { colors:false, opacity:false });
  assert.deepEqual(plain(looks.surfaceOverrides({ ...defaults, 'surface.opacity':0.42 }, defaults)), { colors:false, opacity:true });
  const different = { ...defaults, 'surface.posColor':'#123456' };
  assert.deepEqual(plain(looks.surfaceOverrides(different, defaults)), { colors:true, opacity:false });
  const explicit = { colors:true, opacity:false };
  const copy = looks.surfaceOverrides(defaults, defaults, explicit);
  assert.deepEqual(plain(copy), explicit);
  copy.colors = false;
  assert.equal(explicit.colors, true);
  assert.deepEqual(plain(looks.surfaceOverrides({ ...defaults, 'surface.opacity':1-1e-12, 'surface.posColor':defaults['surface.posColor'].toUpperCase() }, defaults)), { colors:false, opacity:false });
});
