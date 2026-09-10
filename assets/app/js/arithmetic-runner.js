(function (global) {
  'use strict';

  function createArithmeticRunner(options = {}) {
    const grid = options.grid || global.VibeMolArithmeticGrid;
    const workerUrl = options.workerUrl || './assets/app/js/arithmetic-worker.js';
    const createWorker = options.createWorker || (() => new global.Worker(workerUrl));
    const yieldTask = options.yieldTask || (() => new Promise(resolve => setTimeout(resolve, 0)));
    const cancelled = () => ({ ok: false, cancelled: true, error: 'Calculation cancelled.' });

    async function compute(operation, operands, outputName, settings = {}) {
      if (settings.signal && settings.signal.aborted) return cancelled();
      const plan = grid.validateInputGrids(operands, settings.limits);
      if (!plan.ok) return plan;
      let worker;
      try { worker = createWorker(); } catch { /* file:// and unsupported worker environments use cooperative evaluation. */ }
      if (worker) {
        const result = await new Promise(resolve => {
          let finished = false;
          let timeout;
          const finish = result => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            worker.terminate();
            if (settings.signal) settings.signal.removeEventListener('abort', abort);
            resolve(result);
          };
          const abort = () => finish(cancelled());
          worker.onmessage = event => finish(event.data);
          worker.onerror = () => finish(null);
          timeout = setTimeout(() => finish(null), options.workerTimeoutMs || 60000);
          if (settings.signal) settings.signal.addEventListener('abort', abort, { once: true });
          try {
            worker.postMessage({ operation, outputName, limits: settings.limits, operands: operands.map(entry => ({
              label: entry.label,
              coefficient: entry.coefficient,
              vol: { origin: entry.vol.origin, axes: entry.vol.axes, nxyz: entry.vol.nxyz, data: entry.vol.data },
            })) });
          } catch { finish(null); }
        });
        if (result) {
          if (result.ok) {
            const [, ny, nz] = result.baseVol.nxyz;
            result.baseVol = Object.assign({}, operands[0].vol, result.baseVol, {
              data: result.data,
              idx: (i, j, k) => (i * ny + j) * nz + k,
            });
          }
          return result;
        }
      }
      const computation = grid.createComputation(operation, operands, outputName, settings.limits);
      if (!computation.ok) return computation;
      while (true) {
        if (settings.signal && settings.signal.aborted) return cancelled();
        if (computation.step(Math.max(1, Math.floor(32768 / operands.length)))) return computation.result;
        await yieldTask();
      }
    }
    return Object.freeze({ compute });
  }

  global.VibeMolArithmeticRunner = Object.freeze({ createArithmeticRunner });
})(typeof window !== 'undefined' ? window : globalThis);
