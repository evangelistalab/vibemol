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

function cacheFixture(legacy = false) {
  class Mesh {}
  Mesh.prototype.onBeforeRender = () => {};
  const ids = Object.fromEntries(Array.from({ length: legacy ? 48 : 47 }, (_, i) => ['cache' + i, 'node' + i]));
  const knownAbsent = {
    editAtomsMenuEl: { id: 'editAtomsMenu', issue: 15, cached: 'null' },
    editAtomsMenuBodyEl: { id: 'editAtomsMenuBody', issue: 15, cached: 'null' },
    editAtomsMenuCurrentEl: { id: 'editAtomsMenuCurrent', issue: 15, cached: 'null' },
    editSelectionFragmentCuePopoverEl: { id: 'editSelectionFragmentCuePopover', issue: 15, cached: 'null' },
    ...(!legacy ? { elementColorBtn: { id: 'elementColorBtn', issue: 14, cached: 'detached' } } : {}),
  };
  const live = new Map(Object.values(ids).map(id => [id, { id, nodeType: 1, isConnected: true, ariaHidden: 'false' }]));
  const nodes = Object.fromEntries(Object.entries(ids).map(([name, id]) => [name, live.get(id)]));
  for (const [name, entry] of Object.entries(knownAbsent)) {
    nodes[name] = entry.cached === 'null' ? null : { id: entry.id, nodeType: 1, isConnected: false };
  }
  const globals = { location: { search: '?qa=1' }, URLSearchParams, THREE: { Mesh }, addEventListener: () => {},
    document: { getElementById: id => live.get(id) || null }, VibeMolWorkbenchHost: { enabled: !legacy },
    __vmqaElementCaches: { ids, knownAbsent, readNodes: () => nodes } };
  return { live, nodes, ids, knownAbsent, globals };
}

test('node identity rejects a detached cache even when replacement IDs and ARIA match', () => {
  const fixture = cacheFixture();
  const original = fixture.nodes.cache0;
  const context = loadGlobalModule('assets/app/js/qa-characterize.js', { globals: fixture.globals });
  assert.equal(context.__vmqa.assertElementCacheIdentity('mode switch').count, 52);
  const replacement = { ...original };
  fixture.live.set('node0', replacement);
  assert.deepEqual(replacement, original, 'The live ID/ARIA contract still matches');
  assert.throws(() => context.__vmqa.assertElementCacheIdentity('panel open'), /cache0 \(#node0\)/);
  fixture.live.set('node0', original);
  assert.throws(() => context.__vmqa.assertElementCacheIdentity('session restore'), /after panel open/);
});

test('node identity does not accept a cached null once a live node exists', () => {
  const fixture = cacheFixture(); fixture.nodes.cache0 = null;
  const context = loadGlobalModule('assets/app/js/qa-characterize.js', { globals: fixture.globals });
  assert.throws(() => context.__vmqa.assertElementCacheIdentity('panel close'), /cache0/);
});

test('known-absent composition is issue-backed and different in the two layouts', () => {
  for (const legacy of [false, true]) {
    const fixture = cacheFixture(legacy);
    const context = loadGlobalModule('assets/app/js/qa-characterize.js', { globals: fixture.globals });
    assert.equal(context.__vmqa.assertElementCacheIdentity('presented checkpoint').count, 52);
    const report = JSON.parse(JSON.stringify(context.__vmqa.elementCacheReport()));
    assert.deepEqual(report.composition, legacy ? { live: 48, knownAbsent: 4 } : { live: 47, knownAbsent: 5 });
    assert.ok(Object.values(report.knownAbsent).every(entry => Number.isInteger(entry.issue) && entry.issue > 0));
  }
});

test('an unexpected absence still fails even when both lookup and cache are null', () => {
  const fixture = cacheFixture(); fixture.live.delete('node0'); fixture.nodes.cache0 = null;
  const context = loadGlobalModule('assets/app/js/qa-characterize.js', { globals: fixture.globals });
  assert.throws(() => context.__vmqa.assertElementCacheIdentity('panel open'), /cache0/);
});

test('a known-absent slot becoming present fails and cannot be hidden by restoring absence', () => {
  const fixture = cacheFixture();
  const context = loadGlobalModule('assets/app/js/qa-characterize.js', { globals: fixture.globals });
  fixture.live.set('editAtomsMenu', { id: 'editAtomsMenu', nodeType: 1, isConnected: true });
  assert.throws(() => context.__vmqa.assertElementCacheIdentity('DOM replacement'), /editAtomsMenuEl/);
  fixture.live.delete('editAtomsMenu');
  assert.throws(() => context.__vmqa.assertElementCacheIdentity('session restore'), /after DOM replacement/);
});

test('a known-absent entry without an issue is rejected', () => {
  const fixture = cacheFixture(); delete fixture.knownAbsent.editAtomsMenuEl.issue;
  const context = loadGlobalModule('assets/app/js/qa-characterize.js', { globals: fixture.globals });
  assert.throws(() => context.__vmqa.assertElementCacheIdentity('checkpoint'), /issue-backed known-absent/);
});

test('the original inventory cannot silently omit Element Colors or absence declarations', () => {
  const fixture = cacheFixture();
  fixture.globals.__vmqaElementCaches = { ids: Object.fromEntries(Object.entries(fixture.ids).slice(0,43)), readNodes: () => fixture.nodes };
  const context = loadGlobalModule('assets/app/js/qa-characterize.js', { globals: fixture.globals });
  assert.throws(() => context.__vmqa.assertElementCacheIdentity('checkpoint'), /47 live and 5 issue-backed/);
});
