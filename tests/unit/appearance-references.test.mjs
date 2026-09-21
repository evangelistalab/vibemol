import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
function setup() {
  const { VibeMolLooks: L } = loadGlobalModules(['assets/app/js/appearance-model.js', 'assets/app/js/appearance-looks.js']);
  return { L, refs: L.createReferenceController(), look: id => L.builtins.find(look => look.id === id) };
}

test('every mixed baseline is pristine against its two references without changing either recipe', () => {
  const { L, refs } = setup(), originals = copy(L.builtins);
  for (const style of L.builtins) for (const colors of L.builtins) {
    refs.select(style, 'style');refs.select(colors, 'colors');
    const live = L.baseline(style.settings, colors.settings), state = refs.project(live);
    assert.equal(state.styleModified, false);assert.equal(state.colorsModified, false);
    assert.equal(state.label, style.id === colors.id ? style.name : `${style.name} style · ${colors.name} colors`);
    assert.ok(L.equal(state.baseline, live));assert.ok(L.styleEqual(live, style.settings));assert.ok(L.colorsEqual(live, colors.settings));
  }
  assert.deepEqual(copy(L.builtins), originals);
});

test('edits keep identity and flag the right axis including nested coloring and followTheme', () => {
  const { L, refs, look } = setup();refs.select(look('classic'));
  const original = copy(look('classic').settings);
  for (const edit of [live => { live['global.backgroundColor'] = '#123456'; },
    live => { live['appearance.rendering'].coloring.bondColor = '#123456'; },
    live => { live['appearance.rendering'].lighting.followTheme = true; }]) {
    const live = copy(original);edit(live);const state = refs.project(live);
    assert.equal(state.styleModified, false);assert.equal(state.colorsModified, true);
    assert.equal(state.colorsRef.id, 'classic');assert.equal(state.label, 'Classic');
  }
  const live = copy(original);live['molecule.feature.shadows'] = false;
  assert.equal(refs.project(live).styleModified, true);assert.equal(refs.project(live).colorsModified, false);
  assert.deepEqual(copy(refs.project(live).baseline), original);
});

test('user aliases stay selected by id; rename, deletion and null baselines preserve live settings', () => {
  const { L, refs, look } = setup();
  const saved = { ...copy(look('basic')), id: 'user-copy', name: 'QA Basic copy' };
  refs.setLibrary([saved]);refs.select(look('opal'), 'style');refs.select(saved, 'colors');
  const live = L.baseline(look('opal').settings, saved.settings), original = copy(live);
  assert.equal(refs.project(live).colorsRef.id, saved.id);
  assert.equal(refs.project(live).label, 'Opal style · QA Basic copy colors');
  refs.setLibrary([{ ...saved, name: 'Renamed' }]);assert.equal(refs.project(live).label, 'Opal style · Renamed colors');
  refs.remove(saved.id);assert.equal(refs.project(live).label, 'Opal style · Custom colors');
  live['global.backgroundColor'] = '#123456';assert.equal(refs.project(live).colorsModified, false);
  refs.restore({ styleRef: null, colorsRef: null });
  const state = refs.project(live);assert.equal(state.label, 'Custom');assert.equal(state.styleModified, false);
  assert.deepEqual(copy(state.baseline), copy(live));assert.equal(original['global.backgroundColor'], saved.settings['global.backgroundColor']);
});

test('portable references retain two user baselines and exact nulls without re-inference', () => {
  const { L, refs, look } = setup();
  const style = { ...copy(look('opal')), id: 'user-style', name: 'Personal style' };
  const colors = { ...copy(look('basic')), id: 'user-colors', name: 'Identical to Basic colors' };
  refs.setLibrary([style, colors]);refs.select(style, 'style');refs.select(colors, 'colors');
  const stored = refs.exportState(), restored = L.createReferenceController();restored.restore(copy(stored));
  assert.deepEqual(copy(restored.get()), copy(refs.get()));assert.equal(stored.looks.length, 2);
  const live = L.baseline(style.settings, colors.settings);
  assert.equal(restored.project(live).label, 'Personal style style · Identical to Basic colors colors');
  assert.equal(restored.project(live).colorsModified, false);
  restored.restore({ styleRef: null, colorsRef: null });assert.equal(restored.project(look('basic').settings).label, 'Custom');
  restored.restore({ styleRef: {kind:'user',id:'missing'}, colorsRef: {kind:'builtin',id:'nocturne'} });
  assert.equal(restored.get().styleRef, null);assert.equal(restored.project(live).label, 'Custom style · Nocturne colors');
});

test('legacy migration uses recorded style identity and deterministic color precedence only once', () => {
  const { L, refs, look } = setup();
  const live = L.baseline(look('opal').settings, look('classic').settings);
  refs.migrate(live, {...copy(look('opal')), settings: live});
  assert.deepEqual(copy(refs.get()), { styleRef:{kind:'builtin',id:'opal'}, colorsRef:{kind:'builtin',id:'classic'} });
  assert.equal(refs.project(live).styleModified, false);assert.equal(refs.project(live).colorsModified, false);
  refs.migrate(look('classic').settings, look('opal'));
  assert.equal(refs.get().styleRef.id, 'opal');assert.equal(refs.project(look('classic').settings).styleModified, true);
  const alias = {...copy(look('basic')), id:'user-basic', name:'Copy'};
  refs.setLibrary([alias]);refs.migrate(alias.settings, alias);
  assert.equal(refs.get().colorsRef.id, alias.id, 'recorded style wins a color tie');
  refs.migrate(alias.settings);
  assert.equal(refs.get().styleRef, null, 'duplicate styles are not guessed');
  assert.equal(refs.get().colorsRef.id, 'basic', 'built-ins precede identical user schemes');
  const custom = copy(alias.settings);custom['global.backgroundColor']='#123456';
  const alpha = {...alias,id:'user-alpha',name:'Alpha',settings:custom}, zeta = {...alpha,id:'user-zeta',name:'Zeta'};
  refs.setLibrary([zeta,alpha]);refs.migrate(custom);
  assert.equal(refs.get().colorsRef.id,'user-alpha');
  refs.project(look('opal').settings);assert.equal(refs.get().colorsRef.id,'user-alpha','projection never infers identity');
});

test('malformed reference metadata is rejected before restoration', () => {
  const { L, refs } = setup(), before = copy(refs.get());
  for (const value of [null, {}, {styleRef:{kind:'other',id:'basic'},colorsRef:null},
    {styleRef:null,colorsRef:{kind:'user',id:'../bad'}}, {styleRef:null,colorsRef:null,looks:[{id:'user-invalid'}]}]) {
    assert.throws(() => refs.restore(value));assert.deepEqual(copy(refs.get()),before);
  }
  assert.throws(() => L.normalizeReferenceState({styleRef:null,colorsRef:null,looks:[copy(L.builtins[0])]}));
});
