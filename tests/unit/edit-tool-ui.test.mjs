import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';
const { describe, escapeAction, createSceneTools } = loadGlobalModule('assets/app/js/edit-tool-ui.js').VibeMolEditToolUi;

test('empty and populated Transform describe real actions and the next Escape', () => {
  assert.match(describe({}).hint, /opens Build/);
  assert.doesNotMatch(describe({}).hint, /Esc/);
  assert.equal(describe({ hasAtoms: true }).hint, 'Left-click atoms or bonds to select · Right-drag to rotate · / opens Build');
  assert.match(describe({ hasAtoms: true, selected: true }).hint, /Esc clears selection · \/ opens Build$/);
});

test('placement cancellation takes precedence over Build disarming and selection clearing', () => {
  const state = { build: true, selected: true, payload: { kind: 'atom', symbol: 'C', name: 'Carbon' } };
  assert.equal(describe(state).name, 'carbon');
  assert.match(describe(state).hint, /Click to place carbon · Right-drag to rotate · Esc switches to Transform$/);
  const placing = describe({ ...state, placing: true });
  assert.match(placing.hint, /Esc discards this atom$/);
  assert.doesNotMatch(placing.hint, /switches to Transform|clears selection|Enter/);
  assert.match(describe({ ...state, placing: true, confirmable: true }).hint, /Enter confirms/);
});

test('fragment and molecule identities remain spelled out for cursor and accessibility', () => {
  for (const kind of ['fragment', 'molecule']) {
    const item = describe({ build: true, payload: { kind, name: 'Benzene' } });
    assert.equal(item.badge, 'Benzene'); assert.equal(item.name, 'Benzene');
    assert.match(item.hint, /Click to place Benzene/);
  }
});


test('the hint and handler share the same Escape decision', () => {
  for (const state of [{}, {selected:true}, {build:true,selected:true}, {build:true,placing:true}]) {
    const action=escapeAction(state),hint=describe(state).hint;
    assert.equal(hint.includes('Esc discards'),action==='cancel');
    assert.equal(hint.includes('Esc switches'),action==='transform');
    assert.equal(hint.includes('Esc clears'),action==='clear');
  }
});

test('first Edit entry follows each scene; later entries remember the user tool', () => {
  const memory=createSceneTools(),empty={},loaded={};
  assert.equal(memory.enter(empty,false).tool,'build');
  assert.equal(memory.enter(loaded,true).tool,'transform');
  memory.remember(loaded,'build');
  assert.equal(memory.enter(loaded,true).tool,'build');
  memory.remember(empty,'transform');
  assert.equal(memory.enter(empty,false).tool,'transform');
  assert.equal(memory.enter({},true).first,true);
});


test('all placement variants share unambiguous cancellation instructions', () => {
  assert.equal(describe({build:true,placing:true,confirmable:true,payload:{kind:'atom'}}).hint,
    'Adjust location · Enter confirms · Esc discards this atom');
  for (const kind of ['fragment','molecule','fused ring']) {
    const hint=describe({build:true,placing:true,confirmable:kind!=='fused ring',
      placement:{kind,name:'Phenyl',stage:kind==='fused ring'?'fuse':'catalog'}}).hint;
    assert.ok(hint.endsWith(`Esc discards this ${kind} (Phenyl)`));
    assert.doesNotMatch(hint, /•|Esc close|Esc cancel|Enter confirm(?:$|[^s])/);
    assert.ok(hint.includes(kind==='fused ring'?'Drag to spin around bond':'Drag to rotate'));
    assert.ok(hint.includes('Click again to place'));
  }
});
