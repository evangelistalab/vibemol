import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';
const { VibeMolGridStore } = loadGlobalModule('assets/app/js/grid-store.js');
const grid = value => ({ origin: [0, 0, 0], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], nxyz: [1, 1, 1], data: new Float32Array([value]) });

test('sources and orbital/settings keys own distinct stable fields', () => {
  const store = VibeMolGridStore.createGridStore();
  const source = {}, other = {};
  const a = store.get(source, 'mo1/step1', () => grid(2));
  const b = store.get(source, 'mo2/step1', () => grid(-2));
  const c = store.get(source, 'mo1/step2', () => grid(3));
  assert.equal(store.get(source, 'mo1/step1', () => { throw new Error('cache miss'); }), a);
  assert.equal(store.get(other, 'mo1/step1', () => grid(7)).data[0], 7);
  assert.deepEqual([a.data[0], b.data[0], c.data[0]], [2, -2, 3]);
  assert.notEqual(a.data, b.data);
  assert.throws(() => { a.origin[0] = 7; }, TypeError);
});

test('LRU eviction and byte limits do not detach retained grids', () => {
  const store = VibeMolGridStore.createGridStore({ maxEntriesPerSource: 2, maxBytesPerSource: 8 });
  const source = {};
  const first = store.get(source, 'first', () => grid(1));
  store.get(source, 'second', () => grid(2));
  store.get(source, 'first', () => null);
  store.get(source, 'third', () => grid(3));
  assert.equal(store.get(source, 'second', () => grid(20)).data[0], 20);
  assert.equal(first.data[0], 1);
  store.invalidate(source);
  assert.notEqual(store.get(source, 'first', () => grid(4)), first);
});
