import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGlobalModule } from './load-global-module.mjs';

test('characterization is inert without the explicit qa=1 query', () => {
  for (const search of ['', '?qa=0', '?qa=true', '?QA=1']) {
    const context = loadGlobalModule('assets/app/js/qa-characterize.js', {
      globals: { location: { search }, URLSearchParams,
        addEventListener: () => assert.fail('A normal launch installed a QA listener') },
    });
    assert.equal(context.__vmqa, undefined);
  }
});

test('QA observes rendering while preserving existing callbacks and global APIs', () => {
  const calls = [], events = [];
  class Mesh {}
  const original = function (...args) { calls.push({ receiver: this, args }); return 17; };
  Mesh.prototype.onBeforeRender = original;
  const context = loadGlobalModule('assets/app/js/qa-characterize.js', {
    globals: { location: { search: '?qa=1' }, URLSearchParams, THREE: { Mesh },
      VibeMolExample: Object.freeze({ create: () => null, version: 1 }),
      addEventListener: name => events.push(name) },
  });
  const mesh = new Mesh();
  mesh.userData = { type: 'atom' };
  assert.equal(mesh.onBeforeRender('renderer', 'scene', 'camera'), 17);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].receiver, mesh);
  assert.deepEqual(calls[0].args, ['renderer', 'scene', 'camera']);
  assert.deepEqual(events, ['error', 'unhandledrejection']);
  assert.deepEqual(JSON.parse(JSON.stringify(context.__vmqa.apiSurface())), {
    VibeMolExample: ['create', 'version'],
  });
  assert.equal(Object.isFrozen(context.__vmqa), true);
  assert.equal(context.__vmqa.characterizeVersion, 1);
});

test('session comparison masks capture clocks while preserving scientific data and metadata shape', async () => {
  class Mesh {}
  Mesh.prototype.onBeforeRender = () => {};
  const stamp = '2026-10-09T10:20:30.000Z';
  const payload = { savedAt: stamp, preset: { meta: { createdAt: stamp, updatedAt: stamp } },
    source: { updatedAt: stamp, coordinates: [1.00000000000001, -0.12345678901234] } };
  const context = loadGlobalModule('assets/app/js/qa-characterize.js', { globals: {
    location: { search: '?qa=1' }, URLSearchParams, THREE: { Mesh }, addEventListener: () => {},
    VibeMolSession: { export: async () => JSON.parse(JSON.stringify(payload)) },
    VibeMolSessionFormat: { encode: async value => JSON.stringify(value), decode: async value => JSON.parse(value) },
  } });
  const snapshot = JSON.parse(JSON.stringify(await context.__vmqa.decodedSession()));
  assert.equal(snapshot.savedAt, '[capture timestamp]');
  assert.deepEqual(snapshot.preset.meta, { createdAt: '[capture timestamp]', updatedAt: '[capture timestamp]' });
  assert.deepEqual(snapshot.source, payload.source);
  payload.preset.meta.createdAt = 'invalid-date';
  delete payload.preset.meta.updatedAt;
  const invalid = JSON.parse(JSON.stringify(await context.__vmqa.decodedSession()));
  assert.equal(invalid.preset.meta.createdAt, 'invalid-date');
  assert.equal(Object.hasOwn(invalid.preset.meta, 'updatedAt'), false);
});
