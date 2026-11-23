import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadGlobalModules } from './load-global-module.mjs';

const scripts = ['assets/app/js/command-registry.js', 'assets/app/js/commands.js'];
const inventory = JSON.parse(readFileSync(new URL('./fixtures/command-inventory.json', import.meta.url), 'utf8'));
const plain = value => structuredClone(value);
const success = value => ({ ok: true, value });

function fixture(targets = {}) {
  const host = loadGlobalModules(scripts, { globals: { structuredClone } });
  const calls = [];
  for (const [target, callback] of Object.entries(targets)) {
    const [namespace, method] = target.split('.');
    host[namespace] ??= {};
    host[namespace][method] = (...args) => {
      calls.push([target, args]);
      return callback(...args);
    };
  }
  return { commands: host.VibeMolCommands, host, calls };
}

test('the public namespaces and complete command inventory match their contracts', () => {
  const { commands, host } = fixture();
  assert.deepEqual(Object.keys(host.VibeMolCommandRegistry).sort(), ['createCommandRegistry', 'validateParams']);
  assert.deepEqual(Object.keys(commands).sort(), ['describe', 'kind', 'list', 'run', 'version']);
  assert.deepEqual(plain(commands.list()), inventory);
  for (const descriptor of inventory) assert.deepEqual(plain(commands.describe(descriptor.id)), descriptor);
  assert.equal(commands.describe('app.unknown'), null);
});

test('app.info reads both versions lazily', async () => {
  const { commands, host } = fixture();
  assert.equal(commands.kind, 'vibemol.commands');
  assert.equal(commands.version, 1);
  assert.equal((await commands.run('app.info')).error.code, 'not-available');
  host.VibeMolAssets = { version: '9.8.7' };
  assert.deepEqual(plain(await commands.run('app.info')), success({ appVersion: '9.8.7', commandVersion: 1 }));
});

const files = [{ name: 'water.xyz', base64: 'd2F0ZXI=' }];
const loadOptions = { clearFirst: false, newScenes: true };
const fileReceipt = { ok: true, loadedCount: 1, loadedNames: ['water.xyz'] };
const preset = { kind: 'vibemol.preset', settings: { 'global.showAxes': true } };
const importOptions = { mode: 'strict', applyBuilder: false };
const presetReceipt = { ok: true, applied: ['global.showAxes'], warnings: [] };
const entry = { mode: 'edit', tool: 'build' };
const context = { atoms: [{ id: 'oxygen', label: 'O1' }] };
const selection = { atomIds: ['oxygen'], indices: [0], count: 1 };
const emptySelection = { atomIds: [], indices: [], count: 0 };
const basis = { 8: [{ label: '2p' }] };
const state = { selections: [], options: { method: 'cas' } };
const forte2 = { avas: { arguments: { subspace: ['O(2p)'] } } };
const sessionReceipt = { ok: true, sourceCount: 1, sceneCount: 1 };

const forwarding = [
  ['files.load', { files, options: loadOptions }, 'VibeMolEmbed.loadFiles', [files, loadOptions], fileReceipt, fileReceipt],
  ['session.export', { maxBytes: 1024 }, 'VibeMolSession.exportText', [{ maxBytes: 1024 }], 'session', 'session'],
  ['session.import', { text: 'session' }, 'VibeMolSession.importText', ['session'], sessionReceipt, sessionReceipt],
  ['structure.export', {}, 'VibeMolStructure.exportActiveText', [], 'structure', 'structure'],
  ['preset.export', { name: 'Look' }, 'VibeMolPreset.export', [{ name: 'Look' }], preset, preset],
  ['preset.import', { preset, options: importOptions }, 'VibeMolPreset.import', [preset, importOptions], presetReceipt, presetReceipt],
  ['edit.enter', { tool: 'build' }, 'VibeMolEdit.enter', [{ tool: 'build' }], success(entry), entry],
  ['edit.context', {}, 'VibeMolEdit.context', [], success(context), context],
  ['edit.getSelection', {}, 'VibeMolEdit.getSelection', [], success(selection), selection],
  ['edit.clearSelection', {}, 'VibeMolEdit.clearSelection', [], success(emptySelection), emptySelection],
  ['calculations.ready', {}, 'VibeMolCalculations.ready', [], basis, basis],
  ['calculations.state', {}, 'VibeMolCalculations.state', [], state, state],
  ['forte2.export', { avas: {} }, 'VibeMolForte2.export', [{ avas: {} }], success(forte2), forte2],
];

for (const [id, params, target, args, returned, expected] of forwarding) {
  test(`${id} forwards its arguments and maps the product result`, async () => {
    const { commands, calls } = fixture({ [target]: () => returned });
    assert.deepEqual(plain(await commands.run(id, params)), success(expected));
    assert.deepEqual(plain(calls), [[target, args]]);
  });
}

test('edit.setSelection passes the original resolver value and reports both refusal paths', async () => {
  const selector = { kind: 'labels', labels: ['O1'] };
  const options = { mode: 'add' };
  const resolved = Object.freeze({ atomIds: ['oxygen'] });
  const reason = { code: 'ELEMENT_ABSENT', message: 'Element is absent' };
  const refusal = { ok: false, error: reason };
  let resolveResult = success(resolved);
  let applyResult = success(selection);
  const { commands, calls } = fixture({
    'VibeMolEdit.resolveSelection': () => resolveResult,
    'VibeMolEdit.setSelection': value => {
      assert.equal(value, resolved);
      return applyResult;
    },
  });
  const run = async () => plain(await commands.run('edit.setSelection', { selector, options }));
  assert.deepEqual(await run(), success(selection));
  assert.deepEqual(plain(calls), [
    ['VibeMolEdit.resolveSelection', [selector]], ['VibeMolEdit.setSelection', [resolved, options]],
  ]);
  applyResult = refusal;
  assert.deepEqual(await run(), { ok: false, error: { code: 'rejected', message: reason.message, details: reason } });
  calls.length = 0;
  resolveResult = refusal;
  assert.equal((await run()).error.code, 'rejected');
  assert.deepEqual(plain(calls), [['VibeMolEdit.resolveSelection', [selector]]]);
});

test('calculations.selectShell forwards the toggle between two state reads', async () => {
  const params = { index: 0, shell: '2p' };
  let assigned = false;
  let accept = true;
  const { commands, calls } = fixture({
    'VibeMolCalculations.state': () => ({ selections: assigned ? [{ id: 'oxygen', shells: { '2p': 'all' } }] : [] }),
    'VibeMolCalculations.selectShell': () => { if (accept) assigned = !assigned; },
  });
  for (const expected of [true, false]) {
    calls.length = 0;
    assert.deepEqual(plain(await commands.run('calculations.selectShell', params)),
      success({ requested: params, applied: true, assigned: expected }));
    assert.deepEqual(plain(calls), [
      ['VibeMolCalculations.state', []], ['VibeMolCalculations.selectShell', [0, '2p']], ['VibeMolCalculations.state', []],
    ]);
  }
  accept = false;
  assert.equal((await commands.run('calculations.selectShell', params)).error.code, 'rejected');
});

test('calculations.configure forwards the patch and compares the applied options', async () => {
  let applied = { method: 'cas' };
  const params = { cas: [2, null], method: 'cas' };
  const { commands, calls } = fixture({
    'VibeMolCalculations.state': () => ({ options: applied }),
    'VibeMolCalculations.configure': patch => {
      if (patch.method === 'cas') applied = { ...applied, ...patch };
    },
  });
  assert.deepEqual(plain(await commands.run('calculations.configure', params)),
    success({ requested: params, applied: params }));
  assert.deepEqual(plain(calls), [
    ['VibeMolCalculations.state', []], ['VibeMolCalculations.configure', [params]], ['VibeMolCalculations.state', []],
  ]);
  const refused = await commands.run('calculations.configure', { method: 'cumulative' });
  assert.equal(refused.error.code, 'rejected');
  assert.deepEqual(plain(refused.error.details.differences), ['method']);
});

test('file and preset refusals preserve their product receipts', async () => {
  const fileFailure = { ok: false, error: 'One file failed', loadedCount: 1, loadedNames: ['water.xyz'] };
  const presetFailure = { ok: false, error: 'Preset declined' };
  const { commands } = fixture({
    'VibeMolEmbed.loadFiles': async () => fileFailure,
    'VibeMolPreset.import': () => presetFailure,
  });
  const load = await commands.run('files.load', { files });
  const imported = await commands.run('preset.import', { preset });
  assert.equal(load.error.code, 'rejected');
  assert.equal(imported.error.code, 'rejected');
  assert.deepEqual(plain(load.error.details), fileFailure);
  assert.deepEqual(plain(imported.error.details), presetFailure);
});
