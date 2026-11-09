const assert = require('node:assert/strict');
const test = require('node:test');
const { recount, evaluateRatchet } = require('../../tools/diagnostics/recount_app_state.cjs');

test('the app metric counts bindings independently of lines, classes and nested state', () => {
  const result = recount(`(function () {
  let one = 0, two = 0; let three = 0;
  let { four, renamed: five } = {};
  class Slider {}
  function inner() { let local = 0; }
})();`);
  const actual = {
    lines: result.historicalDeclarationLines,
    astLines: result.astLetDeclarationLines,
    statements: result.astLetDeclarationStatements,
    names: result.allBindings,
    classes: result.classBindings.map(binding => binding.name),
  };
  const expected = {lines: 2, astLines: 2, statements: 3,
    names: ['five', 'four', 'one', 'three', 'two'], classes: ['Slider']};
  console.log(JSON.stringify({actual, expected}));
  assert.deepEqual(actual, expected);
});

test('the ratchet requires a base-specific authorization for raising the cap', () => {
  const base = 'base';
  const approval = {baseCommit: base, from: 260, to: 261, authorization: 'Review record'};
  const cases = [
    {name: 'at cap', count: 260, cap: 260, approvals: [], expected: true},
    {name: 'shrink', count: 259, cap: 259, approvals: [], expected: true},
    {name: 'source exceeds cap', count: 261, cap: 260, approvals: [], expected: false},
    {name: 'unapproved cap growth', count: 261, cap: 261, approvals: [], expected: false},
    {name: 'wrong base', count: 261, cap: 261, approvals: [{...approval, baseCommit: 'other'}], expected: false},
    {name: 'approved growth', count: 261, cap: 261, approvals: [approval], expected: true},
    {name: 'ambiguous approval', count: 261, cap: 261, approvals: [approval, approval], expected: false},
  ];
  const readbacks = cases.map(({name, count, cap, approvals, expected}) => {
    const result = evaluateRatchet(count, {maximumAppScopeLetBindings: cap, approvedIncreases: approvals}, 260, base);
    return {name, result, expected};
  });
  console.log(JSON.stringify(readbacks));
  for (const {name, result, expected} of readbacks) assert.equal(result.passed, expected, name);
});
