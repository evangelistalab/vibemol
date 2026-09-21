import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';
const api = () => loadGlobalModules(['assets/app/js/appearance-model.js', 'assets/app/js/appearance-looks.js']).window.VibeMolLooks;
const plain = value => JSON.parse(JSON.stringify(value));

test('legacy Classic surface palettes migrate before Look validation without touching Classic recipes', () => {
  const looks = api(), legacy = plain(looks.builtins.find(look => look.id === 'classic'));
  Object.assign(legacy.settings, { 'surface.colorScheme':'classic', 'surface.posColor':'#1f77b4', 'surface.negColor':'#d62728' });
  assert.equal(looks.surfaceColorSchemes.classic, undefined);
  assert.deepEqual(plain(looks.surfaceColorSchemes.tableau), { pos:'#1f77b4', neg:'#d62728' });
  for (const id of ['national', 'emory', 'bright', 'electron', 'custom', 'future', 'constructor', '__proto__']) {
    assert.equal(looks.normalizeSurfaceScheme(id), id);
  }
  assert.equal(looks.normalizeSurfaceScheme('classic'), 'tableau');
  for (const complete of [true, false]) assert.equal(looks.settings(legacy.settings, complete)['surface.colorScheme'], 'tableau');
  const normalized = looks.normalizeLook(legacy);
  assert.equal(normalized.id, 'classic');
  assert.equal(normalized.settings['surface.colorScheme'], 'tableau');
  assert.ok(looks.colorsEqual(legacy.settings, normalized.settings));
  assert.equal(looks.surfaceOverrides(legacy.settings, normalized.settings).colors, false);
  const file = { kind:'vibemol.preset', presetVersion:1, meta:{lookVersion:4},
    settings:{ ...legacy.settings, 'appearance.look':legacy } };
  assert.deepEqual(plain(looks.importLook(file)), plain(normalized));
  const exported = looks.exportLook(legacy);
  for (const settings of [exported.settings, exported.settings['appearance.look'].settings]) {
    assert.equal(settings['surface.colorScheme'], 'tableau');
    assert.equal(settings['surface.posColor'], '#1f77b4');
    assert.equal(settings['surface.negColor'], '#d62728');
  }
  assert.equal(legacy.settings['surface.colorScheme'], 'classic', 'normalization does not mutate input');
  assert.equal(looks.colors(looks.builtins.find(look => look.id === 'classic').settings)['surface.posColor'], '#e60000');
  assert.equal(looks.materialRecipe('classic').material.model, 'phong');
});

test('surface exports include resolved palette colors even when old saved swatches are stale', () => {
  const looks = api(), look = plain(looks.builtins[0]);
  look.settings['surface.colorScheme'] = 'tableau';
  const file = looks.exportLook(look);
  assert.equal(file.settings['surface.posColor'], '#1f77b4');
  assert.equal(file.settings['surface.negColor'], '#d62728');
  const future = { ...file.settings, 'surface.colorScheme':'future-palette' };
  assert.equal(looks.colors(future)['surface.posColor'], '#1f77b4');
  assert.equal(looks.colors(future)['surface.negColor'], '#d62728');
});

test('look and color composition preserve independent components and input recipes', () => {
  const looks=api();
  for(const look of looks.builtins) for(const palette of looks.builtins) {
    const before=plain(look.settings),colorsBefore=plain(palette.settings);
    const mixed=looks.withColors(look.settings,palette.settings);
    assert.ok(looks.colorsEqual(mixed,palette.settings));
    for(const key of Object.keys(looks.fields).filter(key=>!looks.colorKeys.includes(key)&&key!=='appearance.rendering')) {
      assert.deepEqual(plain(mixed[key]),before[key],key);
    }
    const rendering=mixed['appearance.rendering'],original=before['appearance.rendering'];
    for(const key of ['material','surfaceMaterial','geometry','effects']) assert.deepEqual(plain(rendering[key]),original[key],key);
    assert.deepEqual({...plain(rendering.lighting),followTheme:original.lighting.followTheme},original.lighting);
    assert.deepEqual(plain(look.settings),before);assert.deepEqual(plain(palette.settings),colorsBefore);
    const saved={...plain(look),settings:mixed};
    assert.ok(looks.equal(looks.importLook(looks.exportLook(saved)).settings,mixed));
  }
});

test('color scheme matching ignores material/lighting/opacity and compares maps by value', () => {
  const looks=api(),original=looks.builtins.find(item=>item.id==='classic').settings,edited=plain(original);
  edited['surface.opacity']=0.4;
  edited['appearance.rendering'].material=plain(looks.materialRecipe('gel').material);
  edited['appearance.rendering'].lighting.dirIntensity=5;
  edited['global.elementColorOverrides']=Object.fromEntries(Object.entries(edited['global.elementColorOverrides']).reverse());
  assert.ok(looks.colorsEqual(original,edited));
  for(const change of [
    value=>value['global.backgroundColor']='#123456',
    value=>value['appearance.rendering'].lighting.followTheme=!value['appearance.rendering'].lighting.followTheme,
    value=>value['appearance.rendering'].coloring.elementBonds=true,
    value=>value['global.elementColorOverrides']['6']='#123456',
    value=>{value['surface.colorScheme']='custom';value['surface.posColor']='#123456';},
  ]) { const changed=plain(edited);change(changed);assert.ok(!looks.colorsEqual(original,changed)); }
  const old=plain(original);old['surface.posColor']='#123456';
  assert.ok(looks.colorsEqual(original,old),'named palettes ignore stale inactive swatches');
  assert.equal(looks.colors(old)['surface.posColor'],looks.surfaceColorSchemes.national.pos);
});

test('three families partition the recipes and provide valid starting materials', () => {
  const looks=api();
  const expected={physical:['basic','emissive','gel','matte','metal','opal','porcelain'],phong:['classic','kit'],toon:['ink','toon']};
  assert.deepEqual(plain(looks.materialFamilies.map(item=>item.id)),Object.keys(expected));
  for(const family of looks.materialFamilies) {
    assert.deepEqual(plain(looks.materialPresets.filter(item=>item.family===family.id).map(item=>item.id)),expected[family.id]);
    assert.equal(looks.materialRecipe(family.defaultRecipe).material.model,family.id);
    assert.ok(Object.isFrozen(family));
  }
});

test('every visible look has an exact independent material recipe', () => {
  const looks = api();
  assert.deepEqual(plain(looks.materialPresets.map(item => item.name)),
    ['Basic', 'Classic', 'Emissive', 'Gel', 'Ink', 'Kit', 'Matte', 'Metal', 'Opal', 'Porcelain', 'Toon']);
  for (const look of looks.builtins.filter(item => !item.experimental)) {
    const rendering = look.settings['appearance.rendering'], recipe = looks.materialRecipe(look.id);
    const expected = plain({ material: rendering.material, surfaceMaterial: rendering.surfaceMaterial });
    assert.deepEqual(plain(recipe), expected, look.id);
    recipe.material.toonSteps[0] = 0;
    recipe.material.roughness = 0;
    if (recipe.surfaceMaterial) recipe.surfaceMaterial.emissiveIntensity = 0;
    assert.deepEqual(plain(looks.materialRecipe(look.id)), expected, look.id);
    assert.deepEqual(plain({ material: rendering.material, surfaceMaterial: rendering.surfaceMaterial }), expected, look.id);
  }
  assert.throws(() => looks.materialRecipe('unknown'));
});

test('retiring a menu finish does not alter saved material descriptors', () => {
  const { VibeMolLooks: looks, VibeMolAppearanceModel: model } = loadGlobalModules([
    'assets/app/js/appearance-model.js', 'assets/app/js/appearance-looks.js',
  ]).window;
  const retired = ['satin', 'lacquer', 'ceramic', 'enamel', 'glossy'].map(id => model.surfacePreset(id));
  retired.push(model.material({roughness:0.16,metalness:0.08,clearcoat:0.82,clearcoatRoughness:0.12,reflectivity:0.62}),
    model.material({ model:'phong', shininess:30, specularColor:'#777777' }));
  for (const material of retired) {
    const look = plain(looks.builtins[0]);
    look.settings['appearance.rendering'].material = material;
    look.settings['appearance.rendering'].surfaceMaterial = null;
    const restored = looks.importLook(plain(looks.exportLook(look)));
    assert.deepEqual(plain(restored.settings['appearance.rendering'].material), plain(material));
    assert.equal(restored.settings['appearance.rendering'].surfaceMaterial, null);
  }
});

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

test('look Modified ignores inactive material settings and legacy tags but keeps other components exact', () => {
  const looks=api(),before=looks.builtins.find(item=>item.id==='kit').settings,after=plain(before);
  Object.assign(after['appearance.rendering'].material,{roughness:0.1,clearcoat:0.7,envMapIntensity:2});
  after['surface.materialPreset']='metal';
  assert.ok(looks.equal(before,after));
  for(const [section,key,value] of [['material','shininess',90],['geometry','bondRadius',0.15],
    ['lighting','dirIntensity',4],['effects','highlights',true],['coloring','bondColor','#abcdef']]) {
    const changed=plain(after);changed['appearance.rendering'][section][key]=value;
    assert.ok(!looks.equal(before,changed),`${section}.${key}`);
  }
  after['appearance.rendering'].surfaceMaterial=plain(after['appearance.rendering'].material);
  assert.ok(!looks.equal(before,after),'explicit older surface finish remains distinct');
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
