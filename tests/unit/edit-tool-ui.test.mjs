import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';
const { describe } = loadGlobalModule('assets/app/js/edit-tool-ui.js').VibeMolEditToolUi;

test('empty and populated Transform describe real actions and the next Escape', () => {
  assert.match(describe({}).hint, /first atom/);
  assert.doesNotMatch(describe({}).hint, /Select atoms|Esc/);
  assert.equal(describe({ hasAtoms: true }).hint, 'Left-click atoms or bonds to select • Right-drag to rotate • / opens Build');
  assert.match(describe({ hasAtoms: true, selected: true }).hint, /Esc clears selection$/);
});

test('placement cancellation takes precedence over Build disarming and selection clearing', () => {
  const state = { build: true, selected: true, payload: { kind: 'atom', symbol: 'C', name: 'Carbon' } };
  assert.equal(describe(state).name, 'carbon');
  assert.match(describe(state).hint, /Click to place carbon • Right-drag to rotate • Esc switches to Transform$/);
  const placing = describe({ ...state, placing: true });
  assert.match(placing.hint, /Esc cancels placement$/);
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
