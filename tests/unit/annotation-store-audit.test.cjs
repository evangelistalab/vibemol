'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {unit, analyze} = require('../../tools/audit-capabilities.cjs');
const {scanUnit, collect} = require('../../tools/audit-annotation-stores.cjs');
function scan(code) {
  const discovered = new Set(), edges = [];
  scanUnit(unit('assets/app/js/structure.js', code), (...args) => edges.push(args), discovered, new Map());
  return {discovered: [...discovered], edges};
}
test('argument-less returns decline map discovery without rendering a null AST', () => {
  assert.deepEqual(scan('function early(vol) { if (!vol) return; return null; }').discovered, []);
});
test('map discovery is structural and ignores formatting and unrelated return values', () => {
  assert.deepEqual(scan(`function map(vol) { return (vol /* comment */ .annotations.coordination.byAtomId); }
    function unrelated() { return other.annotations.falsePositive.byAtomId; }`).discovered, ['coordination']);
});
test('bare yield, valued yield, await and both arrow-body forms have safe traversal', () => {
  const code = `function* empty() { yield; return; }
    function* valued(vol) { yield vol; return vol; }
    async function wait(vol) { await vol; return; }
    const block = () => {}; const expression = () => 3;
    function fail() { throw new Error('expected'); }`;
  assert.deepEqual(scan(code).discovered, []);
  // The companion capability scanner already guards absent nodes in resolve/object.
  assert.equal(analyze([unit('assets/app/js/optional.js', code)],
    {harnessNamespaces: [], consoleNamespaces: [], consoleReasons: {}, limits: []}).entries.length, 0);
});
test('await, throw and arrow bodies require an expression or block by grammar', () => {
  for (const code of ['async function f() { await; }', 'function f() { throw; }', 'const f = () =>;']) {
    assert.throws(() => unit('invalid.js', code), SyntaxError, code);
  }
});
test('the actual corpus containing bare returns inventories all three stores', () => {
  const result = collect();
  assert.deepEqual(result.assessments.map(x => x.store), ['builder', 'coordination', 'metalBonding']);
  assert.deepEqual(result.missingPurposes, []);
  assert.equal(result.edges.length, 112);
});
