import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGlobalModule } from './load-global-module.mjs';

const model = loadGlobalModule('assets/app/js/vectors-model.js', { globals: { structuredClone } }).VibeMolVectorsModel;
const vol = { atoms: [{ id: 'a', Z: 8 }, { id: 'b', Z: 1 }] };
const plain = value => structuredClone(value);
const input = { name: 'forces', color: '#4400FF', values: [[0, 0, 0], [0.25, -0, 0]],
  atomicNumbers: [8, 1], maxLength: 1 };
const arrow = { name: 'transition', color: '#AA0044', vector: [1, 0, 0], length: 2, heads: 'both' };

test('atom vectors use the current IDs and resolve the longest vector to the requested size', () => {
  const plan = plain(model.atomSetPlan(vol, input));
  assert.deepEqual(plan.xyzVectors, {
    sets: [{ name: 'forces', color: '#4400FF', scale: 4 }],
    byAtomId: { a: [[0, 0, 0]], b: [[0.25, -0, 0]] },
  });
  const list = plain(model.describe({ ...vol, ...plan }));
  assert.deepEqual(list.atomicNumbers, [8, 1]);
  assert.equal(list.sets[0].drawnMaxLengthAngstrom, 1);
  assert.equal(model.atomSetPlan(vol, { ...input, values: [[0, 0, 0], [0, 0, 0]] }).xyzVectors.sets[0].scale, 1);
});

test('vector inputs reject inconsistent scales, arrays, identities and origins before updating storage', () => {
  const cases = [
    ['scale', () => model.atomSetPlan(vol, { ...input, scale: 2 })],
    ['values', () => model.atomSetPlan(vol, { ...input, values: [[0, 0, 0]] })],
    ['values', () => model.atomSetPlan(vol, { ...input, values: [[NaN, 0, 0], [0, 0, 0]] })],
    ['atomicNumbers', () => model.atomSetPlan(vol, { ...input, atomicNumbers: [1, 8] })],
    ['origin', () => model.arrowPlan(vol, { ...arrow, anchor: 'point' })],
    ['origin', () => model.arrowPlan(vol, { ...arrow, origin: [0, 0, 0] })],
    ['length', () => model.arrowPlan(vol, { ...arrow, length: 21 })],
  ];
  for (const [field, action] of cases) {
    assert.throws(action, error => error.field === field && error.message.includes(field));
  }
  const stored = model.atomSetPlan(vol, input);
  assert.throws(() => model.arrowPlan({ ...vol, ...stored }, { ...arrow, name: input.name }),
    error => error.field === 'name');
  assert.equal(Object.hasOwn(vol, 'xyzVectors'), false);
});

test('free arrow origins translate only on a whole structure and rotation affects both kinds', () => {
  const atoms = model.atomSetPlan(vol, input);
  const free = model.arrowPlan({ ...vol, ...atoms }, { ...arrow, anchor: 'point', origin: [2, 1, 0] });
  const rotate = ([x, y, z]) => [-y, x, z];
  const trans = plain(model.transform(vol, free, null, null, [0, 0, 0], [1, 2, 3]));
  assert.deepEqual(trans.arrows.items[0].origin, [3, 3, 3]);
  assert.deepEqual(trans.arrows.items[0].vector, [1, 0, 0]);
  assert.equal(trans.xyzVectors, undefined);
  assert.deepEqual(plain(model.transform(vol, free, [1], null, [0, 0, 0], [1, 2, 3])), {});
  const rotated = plain(model.transform(vol, free, null, rotate, [0, 0, 0], [0, 0, 0]));
  assert.deepEqual(rotated.xyzVectors.byAtomId.b, [[0, 0.25, 0]]);
  assert.deepEqual(rotated.arrows.items[0].origin, [-1, 2, 0]);
  assert.deepEqual(rotated.arrows.items[0].vector, [-0, 1, 0]);
  model.validateArrows(free.arrows, free.xyzVectors);
  assert.throws(() => model.validateArrows({ items: [] }), error => error.field === 'arrows');
  assert.throws(() => model.validateArrows(free.arrows, { sets: [{ name: arrow.name }] }),
    error => error.field === 'name');
  assert.equal(model.remove({ ...vol, ...free }, { name: arrow.name }).arrows, undefined);
  assert.equal(model.remove({ ...vol, ...free }, { name: input.name }).xyzVectors, undefined);
});

function savedVectors() {
  const atoms = model.atomSetPlan(vol, input);
  return model.arrowPlan({ ...vol, ...atoms }, { ...arrow, anchor: 'point', origin: [2, 1, 0] });
}

test('restore replaces vector sets and arrows while preserving other volume fields', () => {
  const state = savedVectors();
  const record = { ...vol, ...savedVectors() };
  record.xyzVectors.sets[0].name = 'old set';
  record.arrows.items[0].name = 'old arrow';
  model.restore(record, state);
  assert.deepEqual(plain(record), plain({ ...vol, ...state }));
  assert.equal(record.atoms, vol.atoms);
  assert.deepEqual(Object.keys(model), ['describe', 'atomSetPlan', 'arrowPlan', 'remove', 'validateArrows', 'transform', 'restore']);
  assert.equal(Object.isFrozen(model), true);
});

test('restore deletes whichever vector fields the snapshot omits', () => {
  const { xyzVectors, arrows } = savedVectors();
  const record = { ...vol, xyzVectors, arrows };
  model.restore(record, { xyzVectors });
  assert.equal(Object.hasOwn(record, 'arrows'), false);
  assert.deepEqual(plain(record.xyzVectors), plain(xyzVectors));
  model.restore(record, { arrows });
  assert.equal(Object.hasOwn(record, 'xyzVectors'), false);
  assert.deepEqual(plain(record.arrows), plain(arrows));
  model.restore(record, {});
  assert.deepEqual(record, vol);
});

test('restore leaves existing field references untouched for an undefined snapshot', () => {
  const { xyzVectors, arrows } = savedVectors();
  const record = { ...vol, xyzVectors, arrows };
  model.restore(record, undefined);
  assert.equal(record.xyzVectors, xyzVectors);
  assert.equal(record.arrows, arrows);
  assert.equal(record.atoms, vol.atoms);
});

test('restore validates the entire snapshot before changing any field', () => {
  const { xyzVectors, arrows } = savedVectors();
  const record = { ...vol, xyzVectors, arrows };
  const invalidArrow = savedVectors();
  invalidArrow.xyzVectors.sets[0].name = 'replacement';
  invalidArrow.arrows.items[0].origin = [Infinity, 0, 0];
  const invalidVector = savedVectors();
  invalidVector.xyzVectors.byAtomId.a = [];
  const expected = plain(record);
  for (const [invalid, field] of [[invalidArrow, 'origin'], [invalidVector, 'xyzVectors'], [null, 'vectors']]) {
    assert.throws(() => model.restore(record, invalid), error => error.field === field);
    assert.equal(record.xyzVectors, xyzVectors);
    assert.equal(record.arrows, arrows);
    assert.deepEqual(plain(record), expected);
  }
});

test('restore does not alias the input sets, vector components or arrow origins', () => {
  const record = { ...vol };
  const state = savedVectors();
  model.restore(record, state);
  state.xyzVectors.sets[0].color = '#FFFFFF';
  state.xyzVectors.byAtomId.b[0][1] = 2;
  state.arrows.items[0].origin[0] = 9;
  assert.equal(record.xyzVectors.sets[0].color, input.color);
  assert.equal(record.xyzVectors.byAtomId.b[0][1], -0);
  assert.equal(record.arrows.items[0].origin[0], 2);
  record.xyzVectors.byAtomId.b[0][0] = 7;
  record.arrows.items[0].vector[0] = 3;
  assert.equal(state.xyzVectors.byAtomId.b[0][0], 0.25);
  assert.equal(state.arrows.items[0].vector[0], 1);
});
