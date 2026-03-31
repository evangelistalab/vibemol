import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';

function createController(overrides = {}) {
  const context = loadGlobalModule('assets/app/js/autoiso.js', {
    globals: {
      addEventListener: () => {},
      removeEventListener: () => {},
      location: { protocol: 'http:' },
      Worker: function Worker() {},
    },
  });
  const controller = context.VibeMolAutoIso.createAutoIsoController({
    isPhaseLikeComponent: (mode) => mode === 'alphaPhase' || mode === 'betaPhase' || mode === 'alphaBetaPhase' || mode === 'totalBloch',
    targetFraction: 0.5,
    histogramBins: 64,
    maxSamples: 8,
    workerThresholdSamples: 4,
    workerTimeoutMs: 1000,
    hasVolumetricGrid: (vol) => !!(vol && Array.isArray(vol.nxyz) && vol.nxyz.every((n) => n > 0)),
    formatIsoInputValue: (value) => Number(value).toFixed(3),
    getCurrentIndex: () => 0,
    getVolumes: () => overrides.volumes || [],
    getComponentMode: (vol) => (vol && vol.componentMode) || 'alphaRe',
    isAutoIsoEnabled: () => true,
    setIsoInputValue: (value) => { overrides.lastIso.value = value; },
    hasIsoInput: () => true,
    rebuildScene: () => { overrides.rebuildCount.value += 1; },
    warn: (...args) => { overrides.warns.push(args); },
    ...overrides.options,
  });
  return { context, controller };
}

function createScalarVolume(values) {
  return {
    nxyz: [values.length, 1, 1],
    data: Float32Array.from(values),
    idx(i) { return i; },
  };
}

test('autoiso picks stride to respect sample budget', () => {
  const state = { lastIso: { value: '' }, rebuildCount: { value: 0 }, warns: [] };
  const { controller } = createController(state);
  assert.equal(controller.pickAutoIsoSampleStride({ nxyz: [2, 2, 2] }), 1);
  assert.equal(controller.pickAutoIsoSampleStride({ nxyz: [27, 27, 27] }), 3);
});

test('autoiso estimates histogram threshold for scalar data', () => {
  const state = { lastIso: { value: '' }, rebuildCount: { value: 0 }, warns: [] };
  const { controller } = createController(state);
  const iso = controller.estimateAutoIsoValue(createScalarVolume([0, 1, 2, 3]), 'alphaRe', 0.5, 1);
  assert.equal(Number(iso.toFixed(3)), 2.964);
});

test('autoiso caches applied values per record and cache key', () => {
  const state = { lastIso: { value: '' }, rebuildCount: { value: 0 }, warns: [], volumes: [] };
  const { controller } = createController(state);
  const record = {};
  const vol = createScalarVolume([0, 1, 2, 3]);
  const first = controller.applyAutoIsoToIsoInput(record, vol, 'alphaRe');
  const second = controller.applyAutoIsoToIsoInput(record, vol, 'alphaRe');
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(state.lastIso.value, '2.964');
  assert.equal(record.autoIsoCache.size, 1);
});

test('autoiso builds worker payloads for two-component phase data', () => {
  const state = { lastIso: { value: '' }, rebuildCount: { value: 0 }, warns: [] };
  const { controller } = createController(state);
  const vol = {
    nxyz: [2, 1, 1],
    isTwoComponent: true,
    alphaRe: Float32Array.from([1, 2]),
    alphaIm: Float32Array.from([3, 4]),
    betaRe: Float32Array.from([5, 6]),
    betaIm: Float32Array.from([7, 8]),
  };
  const payload = controller.buildAutoIsoWorkerPayload(vol, 'alphaPhase', 0.5, 1);
  assert.equal(payload.isTwoComponent, true);
  assert.deepEqual(Array.from(payload.alphaRe), [1, 2]);
  assert.notEqual(payload.alphaRe, vol.alphaRe);
  assert.equal(payload.data, undefined);
});
