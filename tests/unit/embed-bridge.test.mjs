import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGlobalModule } from './load-global-module.mjs';

const token = 'embed-bridge-test-token-0123456789abcdef';
const path = 'assets/app/js/embed-bridge.js';

function fixture(href, run) {
  const messages = [];
  const listeners = new Map();
  const interactions = [];
  const rewrites = [];
  const parent = { postMessage: (message, origin) => messages.push({ message, origin }) };
  loadGlobalModule(path, { globals: {
    URL,
    TextEncoder,
    location: { href },
    history: { replaceState: (...args) => rewrites.push(args) },
    parent,
    document: { addEventListener: (type, callback, capture) => interactions.push({ type, capture }) },
    addEventListener: (type, callback) => listeners.set(type, callback),
    VibeMolCommands: { run: async (...args) => run(...args), describe: () => ({ mutates: false }) },
  } });
  return { messages, listeners, rewrites, interactions, parent };
}

test('the bridge only installs listeners for an opted-in URL and valid fragment', async () => {
  for (const suffix of ['', '?embed=commands#vmtoken=short', `#vmtoken=${token}`]) {
    const result = fixture('https://viewer.test/' + suffix, () => assert.fail('Unexpected registry call'));
    assert.equal(result.listeners.size, 0);
    assert.deepEqual(result.interactions, []);
    assert.deepEqual(result.messages, []);
    assert.deepEqual(result.rewrites, []);
  }
  const result = fixture(`https://viewer.test/?embed=commands#vmtoken=${token}`,
    () => ({ ok: true, value: { commandVersion: 1 } }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(result.listeners.size, 1);
  assert.equal(result.rewrites[0][2], '/?embed=commands');
  assert.deepEqual(result.interactions, ['pointerup', 'keyup', 'change'].map(type => ({ type, capture: true })));
  assert.equal(result.messages[0].message.kind, 'ready');
});

test('requests observe the in-flight and UTF-8 byte limits and respond in completion order', async () => {
  const pending = [];
  const { parent, listeners, messages } = fixture(`https://viewer.test/?embed=commands#vmtoken=${token}`,
    command => command === 'app.info' ? { ok: true, value: { commandVersion: 1 } }
      : new Promise(resolve => pending.push(resolve)));
  const send = (id, params = {}, origin = 'https://notebook.test') => listeners.get('message')({
    source: parent, origin,
    data: { channel: 'vibemol.embed', v: 1, token, kind: 'request', id, command: 'test.run', params },
  });
  const requests = Array.from({ length: 32 }, (_, index) => send(String(index)));
  await send('busy');
  assert.equal(pending.length, 32);
  const reply = id => messages.find(row => row.message.id === id);
  assert.equal(reply('busy').message.result.error.details.code, 'bridge-busy');
  pending[1]({ ok: true, value: 1 });
  await requests[1];
  pending[0]({ ok: true, value: 0 });
  await requests[0];
  assert.deepEqual(messages.filter(row => row.message.kind === 'response').map(row => row.message.id), ['busy', '1', '0']);
  assert.equal(reply('1').origin, 'https://notebook.test');
  await send('oversized', { text: 'é'.repeat(26 * 1024 * 1024) }, 'null');
  assert.equal(pending.length, 32);
  assert.equal(reply('oversized').origin, '*');
  assert.equal(reply('oversized').message.result.error.details.code, 'too-large');
  for (const resolve of pending.slice(2)) resolve({ ok: false, error: { code: 'unknown-command', message: 'Unknown command' } });
  await Promise.all(requests);
});
