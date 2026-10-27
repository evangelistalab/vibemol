import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { loadGlobalModule, REPO_ROOT } from './load-global-module.mjs';

const legacy = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'tests/fixtures/element-utils-legacy.json'), 'utf8'));
const api = loadGlobalModule('assets/app/js/element-utils.js').VibeMolElementUtils;

function original(entry, table) {
  const context = vm.createContext({ ATOM_Z_TO_DATA: table });
  context.global = context;
  return vm.runInContext('(' + entry.source + ')', context);
}

function result(fn, args) {
  try { return { value: fn(...args) }; }
  catch (error) { return { error: error.name }; }
}

test('element utilities load before atomic metadata without DOM or rendering dependencies', () => {
  const forbidden = new Proxy({}, { get() { assert.fail('Pure helpers accessed a DOM/rendering dependency'); } });
  const context = loadGlobalModule('assets/app/js/element-utils.js', {
    globals: { document: forbidden, THREE: forbidden },
  });
  assert.equal(Object.isFrozen(context.VibeMolElementUtils), true);
  const contract = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'tests/baselines/characterize-summary.json'), 'utf8'));
  assert.deepEqual(Object.keys(context.VibeMolElementUtils).sort(), contract.api.VibeMolElementUtils);
  assert.equal(context.VibeMolElementUtils.getElementSymbol(6), 'Z6');
});

test('display placeholders retain compatibility while chemistry rejects invalid identity', () => {
  const entries = legacy.functions.filter(entry => entry.function === 'getElementSymbol');
  assert.equal(entries.length, 4);
  const inputs = [0, 1, 6, 6.9, '6', '006', '6.9', -1, null, undefined, NaN, Infinity, true, false];
  const tables = [undefined, null, {},
    { 1: { symbol: 'H' }, 6: { symbol: ' C ' }, '006': { symbol: 'Si' }, '6.9': { symbol: 'O' } },
    { 6: { symbol: '' } }, { 6: { symbol: '  ' } }, { 6: { symbol: 123 } },
    { 6: { symbol: 0 } }, { 6: { symbol: null } }, { 6: { symbol: { toString: () => 'Fe' } } }];
  for (const entry of entries) {
    const moved = entry.file.endsWith('/app.js') ? api.getElementSymbol
      : api.getElementSymbolByAtomicNumber;
    if (entry.file.endsWith('/bond-inference.js')) continue; // Chemistry's invalid-input policy is repaired by #5 below.
    for (const table of tables) {
      const prior = original(entry, table);
      for (const z of inputs) assert.deepEqual(result(moved, [z, table]), result(prior, [z]), entry.file + ': ' + String(z));
    }
  }
  // Demonstrate the differences being retained instead of normalizing callers.
  const spaced = { 6: { symbol: ' C ' } };
  assert.equal(api.getElementSymbol(6, spaced), 'C');
  assert.equal(api.getElementSymbolByAtomicNumber(6.9, spaced), ' C ');
  assert.throws(() => api.getElementSymbolRaw(6.9, spaced), /Unsupported atomic number/);
  assert.equal(api.getElementSymbolRaw(6, spaced), 'C');
});

test('both metal classifiers preserve every catalogued element and reject invalid identity', () => {
  const entries = legacy.functions.filter(entry => entry.function.startsWith('is'));
  assert.equal(entries.length, 6);
  const inputs = [...Array.from({ length: 119 }, (_, z) => z), '21', '57'];
  for (const entry of entries) {
    const prior = original(entry);
    for (const z of inputs) assert.deepEqual(result(api[entry.function], [z]), result(prior, [z]), entry.file + ': ' + String(z));
    for (const z of [-1,119,6.9,null,undefined,NaN,Infinity,true,21n,Symbol('z')]) {
      assert.throws(() => api[entry.function](z), /Unsupported atomic number/);
    }
  }
});

test('clamp policies preserve NaN, coercion and reversed-bound behavior from all four copies', () => {
  const entries = legacy.functions.filter(entry => entry.function === 'clamp');
  assert.equal(entries.length, 4);
  const inputs = [-Infinity, -2, -0, 0, 0.5, 2, Infinity, NaN, undefined, null, '', '0.5', 'invalid', false, 2n, Symbol('value')];
  const bounds = [[-1, 1], [1, -1], [0, 0], [NaN, 1], [-1, NaN], [-Infinity, Infinity]];
  for (const entry of entries) {
    const moved = entry.file.endsWith('/symmetry.js') ? api.clampWithUpperPriority
      : entry.file.endsWith('/volume-geometry.js') ? api.clamp : api.clampOrZero;
    const prior = original(entry);
    for (const value of inputs) for (const [min, max] of bounds) {
      assert.deepEqual(result(moved, [value, min, max]), result(prior, [value, min, max]), entry.file + ': ' + String(value));
    }
  }
  assert.equal(Number.isNaN(api.clamp(NaN, -1, 1)), true);
  assert.equal(api.clampOrZero(NaN, -1, 1), 0);
  assert.equal(api.clamp(0, 1, -1), 1);
  assert.equal(api.clampWithUpperPriority(0, 1, -1), -1);
});
