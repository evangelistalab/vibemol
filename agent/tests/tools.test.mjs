import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGlobalModules } from '../../tests/unit/load-global-module.mjs';

const schema = JSON.parse(fs.readFileSync(new URL('../tools.schema.json', import.meta.url), 'utf8'));
const load = () => loadGlobalModules(['agent/web/tools.js', 'agent/web/link.js', 'agent/web/lasso.js']).window;

function fakeApis() {
  const calls = [];
  return {
    calls,
    VibeMolAgentHost: {
      getCameraAxes: () => ({ right: [0, 0, -1], up: [0, 1, 0], towardViewer: [1, 0, 0] }),
      translateActiveMoleculeAngstrom: (dx, dy, dz, label) => { calls.push(['translate', dx, dy, dz, label]); return { movedAngstrom: [dx, dy, dz] }; },
      undo: () => { calls.push(['undo']); return true; },
      redo: () => false,
      editAtoms: op => { calls.push(['edit', op]); return { ok: true }; },
      setTrajectorySync: (ids, enabled) => { calls.push(['sync', ids, enabled]); return { ok: true }; },
      setTrajectoryPlayback: (ids, action, frame) => { calls.push(['playback', ids, action, frame]); return { ok: true }; },
    },
    VibeMolPreset: {
      kind: 'vibemol.preset', version: 1,
      listKeys: () => ['surface.isoValue'],
      import: (preset, options) => { calls.push(['preset', preset, options]); return { applied: Object.keys(preset.settings), warnings: [] }; },
    },
  };
}

test('every schema tool has a handler and vice versa', () => {
  const tools = load().VibeMolAgentTools.createAgentTools({ schema, apis: fakeApis() });
  assert.deepEqual([...tools.list()].sort(), [...tools.handlerNames()].sort());
});

test('screen-frame translation maps view axes into world axes', async () => {
  const apis = fakeApis();
  const tools = load().VibeMolAgentTools.createAgentTools({ schema, apis });
  await tools.call('vibemol_translate_molecule', { dx: 10, frame: 'screen' });
  const [, dx, dy, dz] = apis.calls[0];
  assert.deepEqual([dx, dy, dz].map(v => v + 0), [0, 0, -10]);
});

test('appearance changes reject unknown keys and pass known ones as a relaxed preset', async () => {
  const apis = fakeApis();
  const tools = load().VibeMolAgentTools.createAgentTools({ schema, apis });
  await assert.rejects(tools.call('vibemol_set_appearance', { settings: { 'nope.key': 1 } }), /Unknown setting keys/);
  const result = await tools.call('vibemol_set_appearance', { settings: { 'surface.isoValue': 0.03 } });
  assert.deepEqual([...result.applied], ['surface.isoValue']);
  assert.equal(apis.calls[0][2].mode, 'relaxed');
});

test('history only accepts undo/redo and unknown tools are refused', async () => {
  const tools = load().VibeMolAgentTools.createAgentTools({ schema, apis: fakeApis() });
  assert.equal((await tools.call('vibemol_history', { action: 'undo' })).changed, true);
  await assert.rejects(tools.call('vibemol_history', { action: 'wipe' }), /undo/);
  await assert.rejects(tools.call('eval', {}), /Unknown tool/);
});

test('pairing codes use the unambiguous alphabet and the relay format', () => {
  const link = load().VibeMolAgentLink;
  const code = link.makePairCode(n => Uint32Array.from({ length: n }, (_, i) => i * 7));
  assert.match(code, /^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
});

test('trajectory tools validate arguments before reaching the app', async () => {
  const apis = fakeApis();
  const tools = load().VibeMolAgentTools.createAgentTools({ schema, apis });
  await assert.rejects(tools.call('vibemol_set_trajectory_sync', { enabled: 'yes' }), /true or false/);
  await tools.call('vibemol_set_trajectory_sync', { enabled: true });
  assert.deepEqual(apis.calls[0].slice(0, 3), ['sync', undefined, true]);
  await assert.rejects(tools.call('vibemol_trajectory_playback', { action: 'frame' }), /frame is required/);
  await tools.call('vibemol_trajectory_playback', { action: 'frame', frame: 5, sceneIds: ['s1'] });
  assert.equal(apis.calls[1][2], 'frame');
});

test('atom moves in the screen frame are converted before reaching the app', async () => {
  const apis = fakeApis();
  const tools = load().VibeMolAgentTools.createAgentTools({ schema, apis });
  await tools.call('vibemol_edit_atoms', { operation: 'move', indices: [0], delta: [2, 0, 0], frame: 'screen' });
  assert.deepEqual(JSON.parse(JSON.stringify(apis.calls[0][1].delta)).map(v => v + 0), [0, 0, -2]);
});

test('read-only annotations live in the shared schema', () => {
  const ro = schema.tools.filter(t => t.annotations && t.annotations.readOnlyHint).map(t => t.name);
  for (const name of ['vibemol_get_state', 'vibemol_list_controls', 'vibemol_list_atoms']) assert.ok(ro.includes(name));
  assert.ok(!ro.includes('vibemol_operate_control'));
});

test('every seam member used by agent/web/host.js is exposed by app.js', () => {
  const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
  const host = read('../web/host.js');
  const app = read('../../assets/app/js/app.js');
  const block = app.slice(app.indexOf('window.VibeMolAgentSeam = Object.freeze({'));
  const seamSource = block.slice(0, block.indexOf('\n  });'));
  const exposed = new Set([...seamSource.matchAll(/^\s{4}([A-Za-z]+)[,:]/gm)].map(m => m[1]));
  const used = new Set([...host.matchAll(/\b(?:S|seam\(\))\.([A-Za-z]+)/g)].map(m => m[1]));
  const missing = [...used].filter(name => !exposed.has(name));
  assert.deepEqual(missing, []);
});

test('lasso geometry and source lookup rank the defining lines first', () => {
  const { pointInPolygon, searchSources } = load().VibeMolAgentLasso._internals;
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(pointInPolygon(5, 5, square), true);
  assert.equal(pointInPolygon(15, 5, square), false);
  const files = [
    { path: 'index.html', lines: ['<div>', '  <button id="saveBtn">Save</button>', '</div>'] },
    { path: 'assets/app/js/app.js', lines: ['// saveBtnHelper is unrelated', "const saveButton = document.getElementById('saveBtn');", "saveButton.addEventListener('click', save);", "log('#saveBtn clicked');"] },
  ];
  const hits = searchSources(files, [{ kind: 'id', value: 'saveBtn' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(hits.map(h => h.location))), ['index.html:2', 'assets/app/js/app.js:3', 'assets/app/js/app.js:2', 'assets/app/js/app.js:4']);
  assert.match(hits[1].matched, /holds #saveBtn/);
  assert.match(hits[2].snippet, /2: const saveButton = document.getElementById/);
});

test('vibemol_get_selection explains how to make a selection when none exists', async () => {
  const w = load();
  const tools = w.VibeMolAgentTools.createAgentTools({ schema, apis: w });
  await assert.rejects(tools.call('vibemol_get_selection', {}), /Lasso/);
});

test('the copy button text is the full connect message', () => {
  const link = load().VibeMolAgentLink;
  assert.equal(link.pairingPhrase('ABCDE-FGH23'), 'connect to Vibemol ABCDE-FGH23');
  assert.equal(link.LASSO_KEY, 'L');
});
