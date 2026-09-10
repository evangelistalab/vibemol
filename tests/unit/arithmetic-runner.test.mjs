import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';

function setup(options = {}) {
  const ctx = loadGlobalModules(['assets/app/js/arithmetic-grid.js', 'assets/app/js/arithmetic-runner.js']);
  const runner = ctx.VibeMolArithmeticRunner.createArithmeticRunner(options);
  return { runner, grid: ctx.VibeMolArithmeticGrid };
}
function volume(n = 2, step = 1, value = -2) {
  return { origin: [0, 0, 0], axes: [[step, 0, 0], [0, step, 0], [0, 0, step]], nxyz: [n, n, n],
    idx: (i, j, k) => (i * n + j) * n + k, data: new Float32Array(n ** 3).fill(value) };
}

test('cooperative fallback yields and preserves source buffers', async () => {
  let yields = 0;
  const { runner } = setup({ createWorker: () => { throw new Error('unavailable'); }, yieldTask: async () => { yields++; } });
  const vol = volume(40);
  const result = await runner.compute('abs', [{ vol, coefficient: 1 }], 'abs');
  assert.equal(result.ok, true);
  assert.ok(yields > 0);
  assert.equal(result.data.at(-1), 2);
  assert.equal(vol.data.at(-1), -2);
  assert.notEqual(result.data, vol.data);
});

test('fallback abort leaves no partial result available to commit', async () => {
  const abort = new AbortController();
  const { runner } = setup({ createWorker: () => null, yieldTask: async () => abort.abort() });
  const result = await runner.compute('abs', [{ vol: volume(40) }], 'abs', { signal: abort.signal });
  assert.equal(result.cancelled, true);
  assert.equal(result.data, undefined);
});

test('worker transport clones inputs, terminates, and rebuilds the resampled index function', async () => {
  let terminated = 0;
  let sent;
  const worker = { terminate: () => terminated++, postMessage(message, transfers) {
    sent = { message, transfers };
    queueMicrotask(() => {
      const operands = message.operands.map(entry => ({ ...entry, vol: { ...entry.vol,
        idx: (i, j, k) => (i * entry.vol.nxyz[1] + j) * entry.vol.nxyz[2] + k } }));
      const result = grid.compute(message.operation, operands, message.outputName);
      this.onmessage({ data: result });
    });
  } };
  const { runner, grid } = setup({ createWorker: () => worker });
  const a = volume(2, 1, 2), b = volume(3, 0.5, 5);
  const result = await runner.compute('linear_combination', [{ vol: a, coefficient: 1 }, { vol: b, coefficient: 1 }], 'sum');
  assert.equal(result.ok, true);
  assert.equal(result.baseVol.idx(2, 2, 2), 26);
  assert.equal(result.data[26], 7);
  assert.equal(typeof sent.message.operands[0].vol.idx, 'undefined');
  assert.equal(sent.transfers, undefined);
  assert.equal(a.data.length, 8);
  assert.equal(terminated, 1);
});

test('worker cancellation terminates promptly without falling back', async () => {
  const abort = new AbortController();
  let terminated = false;
  const { runner } = setup({ createWorker: () => ({
    postMessage: () => queueMicrotask(() => abort.abort()), terminate: () => { terminated = true; },
  }) });
  const result = await runner.compute('abs', [{ vol: volume() }], 'abs', { signal: abort.signal });
  assert.equal(result.cancelled, true);
  assert.equal(terminated, true);
});

test('worker startup errors fall back to the same numerical result', async () => {
  const { runner } = setup({ createWorker: () => ({ terminate() {}, postMessage() { queueMicrotask(() => this.onerror({})); } }) });
  assert.equal((await runner.compute('abs', [{ vol: volume() }], 'abs')).data[0], 2);
});

test('a worker that never replies is terminated before cooperative fallback', async () => {
  let terminated = 0;
  const { runner } = setup({ workerTimeoutMs: 5, createWorker: () => ({ postMessage() {}, terminate: () => terminated++ }) });
  const result = await runner.compute('abs', [{ vol: volume() }], 'abs');
  assert.equal(result.data[0], 2);
  assert.equal(terminated, 1);
});
