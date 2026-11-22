import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGlobalModule } from './load-global-module.mjs';

function load() {
  return loadGlobalModule('assets/app/js/command-registry.js', { globals: { structuredClone } });
}

const definition = (overrides = {}) => ({
  id: 'test.echo',
  title: 'Echo',
  params: { type: 'object', properties: {}, required: [], additionalProperties: false },
  mutates: false,
  target: 'TestHost.echo',
  run: (params, api) => api.call('TestHost.echo', params),
  ...overrides,
});
const plain = value => structuredClone(value);

test('discovery is sorted, serializable, owned and independent of the target', () => {
  const host = load();
  Object.defineProperty(host, 'TestHost', { get: () => assert.fail('Target resolved during discovery') });
  const first = definition({ id: 'test.a' });
  const second = definition({ id: 'test.b' });
  const registry = host.VibeMolCommandRegistry.createCommandRegistry([second, first]);
  const expected = [first, second].map(({ id, title, params, mutates, target }) => ({ id, title, params, mutates, target }));
  assert.deepEqual(JSON.parse(JSON.stringify(registry.list())), expected);
  assert.deepEqual(plain(registry.describe('test.a')), expected[0]);
  assert.equal(registry.describe('test.missing'), null);
  registry.list()[0].params.required.push('extra');
  first.params.required.push('extra');
  assert.deepEqual(plain(registry.describe('test.a').params.required), []);
});

test('schema checks each supported keyword and reports precise paths', () => {
  const { validateParams } = load().VibeMolCommandRegistry;
  const schema = {
    type: 'object', required: ['items', 'enabled'], additionalProperties: false,
    properties: {
      items: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'integer', minimum: 1, maximum: 4 } },
      enabled: { type: 'boolean' },
      method: { type: 'string', enum: ['one', 'two'] },
      nested: { type: 'object', properties: { number: { type: 'number' } }, additionalProperties: false },
    },
  };
  assert.deepEqual(plain(validateParams(schema, { items: [1, 4], enabled: false, method: 'two', nested: { number: 1.5 } })), { ok: true });
  const paths = input => Array.from(validateParams(schema, input).errors, error => error.path);
  assert.deepEqual(paths(null), ['$']);
  assert.deepEqual(paths({}), ['$.items', '$.enabled']);
  assert.deepEqual(paths({ items: 'no', enabled: 1 }), ['$.items', '$.enabled']);
  assert.deepEqual(paths({ items: [], enabled: true }), ['$.items']);
  assert.deepEqual(paths({ items: [0, 5, 1.1], enabled: true }), ['$.items', '$.items[0]', '$.items[1]', '$.items[2]']);
  assert.deepEqual(paths({ items: [1], enabled: true, method: 'three', nested: { number: Infinity, unknown: false }, extra: 1 }),
    ['$.method', '$.nested.number', '$.nested.unknown', '$.extra']);
  assert.equal(validateParams({ type: 'object', enum: [{ a: 1, b: 2 }] }, { b: 2, a: 1 }).ok, true);
});

test('registration rejects duplicate IDs, invalid definitions and unknown nested keywords', () => {
  const { createCommandRegistry } = load().VibeMolCommandRegistry;
  assert.throws(() => createCommandRegistry([definition(), definition()]), /Duplicate/);
  for (const invalid of [{ id: 'NoDots' }, { title: '' }, { mutates: 'false' }, { target: 'missing' }, { run: null }, { params: [] }]) {
    assert.throws(() => createCommandRegistry([definition(invalid)]), /Invalid/);
  }
  for (const invalid of [
    { type: 'object', additionalProperties: true },
    { type: 'object', required: ['key', 'key'] },
    { type: 'object', properties: { arr: { type: 'array', minItems: 4, maxItems: 2 } } },
    { type: 'object', properties: { option: { type: 'string', enum: [] } } },
  ]) {
    assert.throws(() => createCommandRegistry([definition({ params: invalid })]), /Invalid|supported/);
  }
  assert.throws(() => createCommandRegistry([definition({
    params: { type: 'object', properties: { nested: { type: 'array', items: { type: 'string', pattern: '.' } } } },
  })]), /Unsupported schema keyword "pattern"/);
});

test('run resolves every error envelope, including hostile thrown values', async () => {
  const host = load();
  const registry = host.VibeMolCommandRegistry.createCommandRegistry([definition()]);
  const run = params => registry.run('test.echo', params);
  assert.equal(typeof run({}).then, 'function');
  assert.equal((await registry.run('missing')).error.code, 'unknown-command');
  const invalid = await run({ unknown: true });
  assert.equal(invalid.error.code, 'invalid-params');
  assert.equal(invalid.error.details[0].path, '$.unknown');
  assert.equal((await run({})).error.code, 'not-available');
  host.TestHost = { echo: 1 };
  assert.equal((await run({})).error.code, 'not-available');
  host.TestHost.echo = () => { throw new RangeError('outside range'); };
  assert.deepEqual(plain(await run({})), {
    ok: false, error: { code: 'failed', message: 'outside range', details: { name: 'RangeError' } },
  });
  host.TestHost.echo = () => Promise.reject(new SyntaxError('parse error'));
  assert.equal((await run({})).error.details.name, 'SyntaxError');
  host.TestHost.echo = () => new Proxy({}, { get: () => { throw new Error('getter'); } });
  assert.equal((await run({})).error.code, 'failed');
  host.TestHost.echo = () => { throw undefined; };
  assert.equal((await run({})).error.code, 'failed');
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  host.TestHost.echo = () => { throw revoked.proxy; };
  assert.equal((await run({})).error.code, 'failed');
  host.TestHost.echo = () => ({ fn: () => {} });
  assert.equal((await run({})).error.details.code, 'non-serializable-result');
});

test('run snapshots parameters before forwarding and owns the result', async () => {
  const host = load();
  const registry = host.VibeMolCommandRegistry.createCommandRegistry([definition({ params: {
    type: 'object', properties: { values: { type: 'array', items: { type: 'integer' } } }, additionalProperties: false,
  } })]);
  const input = { values: [1, 2] };
  let forwarded;
  host.TestHost = { async echo(params) { await Promise.resolve(); forwarded = params; return params; } };
  const pending = registry.run('test.echo', input);
  input.values.push(3);
  const result = await pending;
  assert.deepEqual(plain(result), { ok: true, value: { values: [1, 2] } });
  forwarded.values.push(4);
  assert.deepEqual(result.value.values, [1, 2]);
});

test('open objects accept plain data and reject accessors and shared memory', async () => {
  const host = load();
  host.TestHost = { echo: params => params };
  const registry = host.VibeMolCommandRegistry.createCommandRegistry([definition({ params: { type: 'object' } })]);
  const run = params => registry.run('test.echo', params);
  assert.deepEqual(plain(await run({ nested: { value: null } })), { ok: true, value: { nested: { value: null } } });
  assert.equal((await run({ nested: new SharedArrayBuffer(8) })).error.code, 'invalid-params');
  let read = false;
  assert.equal((await run({ get nested() { read = true; return {}; } })).error.code, 'invalid-params');
  assert.equal(read, false);
});
