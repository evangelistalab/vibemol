import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';

const api = () => loadGlobalModule('docs/experiments/style-lab/looks.js').window.StyleLabLooks;
const plain = value => JSON.parse(JSON.stringify(value));

test('look study exports every built-in as complete, independent settings', () => {
  const looks = api();
  for (const builtin of looks.builtins) {
    const exported = plain(looks.serialize(builtin.name, builtin.settings));
    const restored = plain(looks.parse(exported));
    assert.deepEqual(restored, exported);
    assert.deepEqual(restored.settings, plain(builtin.settings));
    restored.settings.carbon = '#abcdef';
    assert.notEqual(builtin.settings.carbon, restored.settings.carbon);
    assert.ok(Object.isFrozen(builtin.settings));
  }
});

test('look study rejects unsupported versions, missing settings, and unsafe values', () => {
  const looks = api();
  const valid = plain(looks.serialize('Personal look', looks.builtins[0].settings));
  for (const change of [
    value => { value.kind = 'vibemol.preset'; },
    value => { value.version = 2; },
    value => { value.name = ''; },
    value => { delete value.settings.bondRadius; },
    value => { value.settings.exposure = 50; },
    value => { value.settings.key = NaN; },
    value => { value.settings.outline = '0.01'; },
    value => { value.settings.finish = 'unknown'; },
    value => { value.settings.carbon = 'url(https://example.invalid)'; },
  ]) {
    const invalid = plain(valid); change(invalid);
    assert.throws(() => looks.parse(invalid));
  }
});

test('look study detects edits independently of object-key order', () => {
  const looks = api(), original = looks.builtins[1].settings;
  const reordered = Object.fromEntries(Object.entries(original).reverse());
  assert.equal(looks.equal(original, reordered), true);
  reordered.rim += 0.1;
  assert.equal(looks.equal(original, reordered), false);
});
