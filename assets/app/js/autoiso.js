(function (global) {
  'use strict';

  /**
   * Create one auto-iso controller with cache and worker orchestration.
   * @param {{
   *   isPhaseLikeComponent?:(compMode:string)=>boolean,
   *   targetFraction?:number,
   *   histogramBins?:number,
   *   maxSamples?:number,
   *   workerThresholdSamples?:number,
   *   workerTimeoutMs?:number,
   *   hasVolumetricGrid?:(vol:any)=>boolean,
   *   formatIsoInputValue?:(value:number)=>string,
   *   getCurrentIndex?:()=>number,
   *   getVolumes?:()=>Array<any>,
   *   getComponentMode?:(vol:any)=>string,
   *   isAutoIsoEnabled?:()=>boolean,
   *   setIsoInputValue?:(value:string)=>void,
   *   hasIsoInput?:()=>boolean,
   *   rebuildScene?:(options?:object)=>void,
   *   warn?:(...args:any[])=>void,
   *   WorkerCtor?:any,
   *   getLocationProtocol?:()=>string,
   *   createWorker?:()=>Worker|null,
   * }} options
   */
  function createAutoIsoController(options = {}) {
    const isPhaseLikeComponent = typeof options.isPhaseLikeComponent === 'function' ? options.isPhaseLikeComponent : (() => false);
    const targetFraction = Number.isFinite(options.targetFraction) ? Number(options.targetFraction) : 0.85;
    const histogramBins = Math.max(64, Number(options.histogramBins) || 512);
    const maxSamples = Math.max(1000, Number(options.maxSamples) || 650000);
    const workerThresholdSamples = Math.max(1000, Number(options.workerThresholdSamples) || 250000);
    const workerTimeoutMs = Math.max(100, Number(options.workerTimeoutMs) || 15000);
    const hasVolumetricGrid = typeof options.hasVolumetricGrid === 'function' ? options.hasVolumetricGrid : (() => false);
    const formatIsoInputValue = typeof options.formatIsoInputValue === 'function' ? options.formatIsoInputValue : ((value) => String(value));
    const getCurrentIndex = typeof options.getCurrentIndex === 'function' ? options.getCurrentIndex : (() => -1);
    const getVolumes = typeof options.getVolumes === 'function' ? options.getVolumes : (() => []);
    const getComponentMode = typeof options.getComponentMode === 'function' ? options.getComponentMode : (() => 'alphaRe');
    const isAutoIsoEnabled = typeof options.isAutoIsoEnabled === 'function' ? options.isAutoIsoEnabled : (() => false);
    const setIsoInputValue = typeof options.setIsoInputValue === 'function' ? options.setIsoInputValue : (() => {});
    const hasIsoInput = typeof options.hasIsoInput === 'function' ? options.hasIsoInput : (() => true);
    const rebuildScene = typeof options.rebuildScene === 'function' ? options.rebuildScene : (() => {});
    const warn = typeof options.warn === 'function' ? options.warn : ((...args) => console.warn(...args));
    const WorkerCtor = Object.prototype.hasOwnProperty.call(options, 'WorkerCtor') ? options.WorkerCtor : global.Worker;
    const getLocationProtocol = typeof options.getLocationProtocol === 'function'
      ? options.getLocationProtocol
      : (() => (typeof global.location !== 'undefined' ? String(global.location.protocol || '').toLowerCase() : ''));
    const createWorker = typeof options.createWorker === 'function'
      ? options.createWorker
      : (() => {
        if (typeof WorkerCtor === 'undefined' || WorkerCtor == null) return null;
        return new WorkerCtor('./assets/app/js/autoiso-worker.js');
      });

    let autoIsoWorker = null;
    let autoIsoWorkerSeq = 0;
    const autoIsoWorkerRequests = new Map();

    function pickAutoIsoSampleStride(vol) {
      const nx = (vol && vol.nxyz && vol.nxyz[0]) | 0;
      const ny = (vol && vol.nxyz && vol.nxyz[1]) | 0;
      const nz = (vol && vol.nxyz && vol.nxyz[2]) | 0;
      const total = nx * ny * nz;
      if (total <= 0 || total <= maxSamples) return 1;
      return Math.max(1, Math.ceil(Math.cbrt(total / maxSamples)));
    }

    function forEachAutoIsoSample(vol, compMode, stride, visitor) {
      if (!vol || !Array.isArray(vol.nxyz) || typeof vol.idx !== 'function') return;
      const [nx, ny, nz] = vol.nxyz;
      if (!(nx > 0 && ny > 0 && nz > 0)) return;
      const step = Math.max(1, stride | 0);

      if (vol.isTwoComponent && isPhaseLikeComponent(compMode)) {
        const reA = vol.alphaRe;
        const imA = vol.alphaIm;
        const reB = vol.betaRe;
        const imB = vol.betaIm;
        if (!reA || !imA || !reB || !imB) return;
        for (let i = 0; i < nx; i += step) {
          for (let j = 0; j < ny; j += step) {
            for (let k = 0; k < nz; k += step) {
              const t = vol.idx(i, j, k);
              if (compMode === 'alphaPhase') {
                const mA = Math.hypot(reA[t], imA[t]);
                visitor(mA, mA * mA);
                continue;
              }
              if (compMode === 'betaPhase') {
                const mB = Math.hypot(reB[t], imB[t]);
                visitor(mB, mB * mB);
                continue;
              }
              if (compMode === 'alphaBetaPhase') {
                const mA = Math.hypot(reA[t], imA[t]);
                const mB = Math.hypot(reB[t], imB[t]);
                visitor(mA, mA * mA);
                visitor(mB, mB * mB);
                continue;
              }
              if (compMode === 'totalBloch') {
                const d = reA[t] * reA[t] + imA[t] * imA[t] + reB[t] * reB[t] + imB[t] * imB[t];
                visitor(d, d);
                continue;
              }
            }
          }
        }
        return;
      }

      const data = vol.data;
      if (!data || !data.length) return;
      for (let i = 0; i < nx; i += step) {
        for (let j = 0; j < ny; j += step) {
          for (let k = 0; k < nz; k += step) {
            const v = data[vol.idx(i, j, k)];
            const av = Math.abs(v);
            visitor(av, v * v);
          }
        }
      }
    }

    function estimateAutoIsoValue(vol, compMode, targetFractionOverride, strideOverride) {
      if (!vol) return NaN;
      const stride = Math.max(1, (strideOverride == null ? pickAutoIsoSampleStride(vol) : strideOverride) | 0);
      let totalWeight = 0;
      let maxMetric = 0;

      forEachAutoIsoSample(vol, compMode, stride, (metric, weight) => {
        if (!Number.isFinite(metric) || !Number.isFinite(weight) || metric <= 0 || weight <= 0) return;
        totalWeight += weight;
        if (metric > maxMetric) maxMetric = metric;
      });

      if (!(totalWeight > 0) || !(maxMetric > 0)) return NaN;

      const hist = new Float64Array(histogramBins);
      const invScale = histogramBins / maxMetric;

      forEachAutoIsoSample(vol, compMode, stride, (metric, weight) => {
        if (!Number.isFinite(metric) || !Number.isFinite(weight) || metric <= 0 || weight <= 0) return;
        const bi = Math.max(0, Math.min(histogramBins - 1, Math.floor(metric * invScale)));
        hist[bi] += weight;
      });

      const chosenTarget = Number.isFinite(targetFractionOverride) ? Number(targetFractionOverride) : targetFraction;
      const clampedTarget = Math.max(0, Math.min(1, chosenTarget));
      const targetWeight = totalWeight * clampedTarget;
      const binWidth = maxMetric / histogramBins;
      let cumulative = 0;
      for (let b = histogramBins - 1; b >= 0; b--) {
        const w = hist[b];
        const next = cumulative + w;
        if (next >= targetWeight) {
          if (w <= 0) return Math.max(0, b * binWidth);
          const needed = Math.max(0, targetWeight - cumulative);
          const frac = Math.max(0, Math.min(1, needed / w));
          const binHi = (b + 1) * binWidth;
          const iso = binHi - frac * binWidth;
          return Math.max(0, Math.min(maxMetric, iso));
        }
        cumulative = next;
      }
      return 0;
    }

    function shouldUseAutoIsoWorker(vol) {
      if (typeof WorkerCtor === 'undefined' || WorkerCtor == null) return false;
      if (getLocationProtocol() === 'file:') return false;
      const nx = (vol && vol.nxyz && vol.nxyz[0]) | 0;
      const ny = (vol && vol.nxyz && vol.nxyz[1]) | 0;
      const nz = (vol && vol.nxyz && vol.nxyz[2]) | 0;
      return (nx * ny * nz) >= workerThresholdSamples;
    }

    function buildAutoIsoWorkerPayload(vol, compMode, targetFractionOverride, stride) {
      const payload = {
        nxyz: Array.isArray(vol && vol.nxyz) ? [vol.nxyz[0] | 0, vol.nxyz[1] | 0, vol.nxyz[2] | 0] : [0, 0, 0],
        compMode,
        targetFraction: Number.isFinite(targetFractionOverride) ? Number(targetFractionOverride) : targetFraction,
        bins: histogramBins,
        maxSamples,
        stride,
        isTwoComponent: !!(vol && vol.isTwoComponent && isPhaseLikeComponent(compMode)),
      };
      if (payload.isTwoComponent) {
        payload.alphaRe = vol.alphaRe ? vol.alphaRe.slice() : null;
        payload.alphaIm = vol.alphaIm ? vol.alphaIm.slice() : null;
        payload.betaRe = vol.betaRe ? vol.betaRe.slice() : null;
        payload.betaIm = vol.betaIm ? vol.betaIm.slice() : null;
      } else {
        payload.data = vol && vol.data ? vol.data.slice() : null;
      }
      return payload;
    }

    function ensureAutoIsoWorker() {
      if (autoIsoWorker) return autoIsoWorker;
      const worker = createWorker();
      if (!worker) return null;
      autoIsoWorker = worker;
      autoIsoWorker.onmessage = (event) => {
        const data = event && event.data ? event.data : {};
        const id = data.id;
        const pending = autoIsoWorkerRequests.get(id);
        if (!pending) return;
        autoIsoWorkerRequests.delete(id);
        clearTimeout(pending.timer);
        if (data.ok) pending.resolve({ value: Number(data.value), stride: Number(data.stride) | 0, source: 'worker' });
        else pending.reject(new Error(data.error || 'Autoiso worker failed'));
      };
      autoIsoWorker.onerror = () => {
        for (const pending of autoIsoWorkerRequests.values()) {
          clearTimeout(pending.timer);
          pending.reject(new Error('Autoiso worker crashed'));
        }
        autoIsoWorkerRequests.clear();
        try { autoIsoWorker.terminate(); } catch { }
        autoIsoWorker = null;
      };
      return autoIsoWorker;
    }

    function shutdown() {
      for (const pending of autoIsoWorkerRequests.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Autoiso worker stopped'));
      }
      autoIsoWorkerRequests.clear();
      if (autoIsoWorker) {
        try { autoIsoWorker.terminate(); } catch { }
        autoIsoWorker = null;
      }
    }

    async function estimateAutoIsoValueAsync(vol, compMode, targetFractionOverride, stride) {
      if (!shouldUseAutoIsoWorker(vol)) {
        return {
          value: estimateAutoIsoValue(vol, compMode, targetFractionOverride, stride),
          stride,
          source: 'sync',
        };
      }
      const worker = ensureAutoIsoWorker();
      if (!worker) {
        return {
          value: estimateAutoIsoValue(vol, compMode, targetFractionOverride, stride),
          stride,
          source: 'sync',
        };
      }
      const payload = buildAutoIsoWorkerPayload(vol, compMode, targetFractionOverride, stride);
      const id = ++autoIsoWorkerSeq;
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          autoIsoWorkerRequests.delete(id);
          reject(new Error('Autoiso worker timeout'));
        }, workerTimeoutMs);
        autoIsoWorkerRequests.set(id, { resolve, reject, timer });
        worker.postMessage({ id, payload });
      });
    }

    function getAutoIsoCacheKey(vol, compMode, stride) {
      const dimsKey = Array.isArray(vol && vol.nxyz) ? vol.nxyz.join('x') : 'grid';
      return `${String(compMode || 'alphaRe')}|${dimsKey}|${targetFraction.toFixed(4)}|${stride}`;
    }

    function ensureAutoIsoRecordState(record) {
      if (!record) return;
      if (!(record.autoIsoCache instanceof Map)) record.autoIsoCache = new Map();
      if (!(record.autoIsoPending instanceof Map)) record.autoIsoPending = new Map();
    }

    function scheduleAutoIsoComputation(record, vol, compMode, stride, cacheKey) {
      ensureAutoIsoRecordState(record);
      if (!record || !record.autoIsoPending || record.autoIsoPending.has(cacheKey)) return;
      const promise = estimateAutoIsoValueAsync(vol, compMode, targetFraction, stride)
        .then((result) => {
          const autoIso = result && Number(result.value);
          if (!(Number.isFinite(autoIso) && autoIso > 0)) return;
          if (record.autoIsoCache instanceof Map) record.autoIsoCache.set(cacheKey, autoIso);
          const volumes = getVolumes();
          const activeIndex = getCurrentIndex();
          const activeRecord = activeIndex >= 0 && Array.isArray(volumes) ? volumes[activeIndex] : null;
          const activeCompMode = activeRecord && activeRecord.vol ? getComponentMode(activeRecord.vol) : '';
          if (!isAutoIsoEnabled() || activeRecord !== record || activeCompMode !== compMode || !hasIsoInput()) return;
          setIsoInputValue(formatIsoInputValue(autoIso));
          rebuildScene({ preserveView: true });
        })
        .catch((err) => {
          warn('[Autoiso] async estimation failed', err);
        })
        .finally(() => {
          if (record.autoIsoPending instanceof Map) record.autoIsoPending.delete(cacheKey);
        });
      record.autoIsoPending.set(cacheKey, promise);
    }

    function applyAutoIsoToIsoInput(record, vol, compMode) {
      if (!hasIsoInput() || !hasVolumetricGrid(vol)) return null;
      const stride = pickAutoIsoSampleStride(vol);
      const cacheKey = getAutoIsoCacheKey(vol, compMode, stride);
      if (record) {
        ensureAutoIsoRecordState(record);
        if (record.autoIsoCache.has(cacheKey)) {
          const value = Number(record.autoIsoCache.get(cacheKey));
          if (Number.isFinite(value) && value > 0) {
            setIsoInputValue(formatIsoInputValue(value));
            return { iso: value, cached: true, stride };
          }
        }
        if (shouldUseAutoIsoWorker(vol)) {
          scheduleAutoIsoComputation(record, vol, compMode, stride, cacheKey);
          return { iso: NaN, cached: false, stride, pending: true };
        }
        const computed = estimateAutoIsoValue(vol, compMode, targetFraction, stride);
        if (Number.isFinite(computed) && computed > 0) {
          record.autoIsoCache.set(cacheKey, computed);
          setIsoInputValue(formatIsoInputValue(computed));
          return { iso: computed, cached: false, stride };
        }
        return null;
      }
      const fallback = estimateAutoIsoValue(vol, compMode, targetFraction, stride);
      if (!Number.isFinite(fallback) || fallback <= 0) return null;
      setIsoInputValue(formatIsoInputValue(fallback));
      return { iso: fallback, cached: false, stride };
    }

    if (typeof global.addEventListener === 'function') {
      global.addEventListener('beforeunload', shutdown);
    }

    return Object.freeze({
      pickAutoIsoSampleStride,
      forEachAutoIsoSample,
      estimateAutoIsoValue,
      shouldUseAutoIsoWorker,
      buildAutoIsoWorkerPayload,
      estimateAutoIsoValueAsync,
      getAutoIsoCacheKey,
      ensureAutoIsoRecordState,
      scheduleAutoIsoComputation,
      applyAutoIsoToIsoInput,
      shutdown,
    });
  }

  global.VibeMolAutoIso = Object.freeze({
    createAutoIsoController,
  });
})(typeof window !== 'undefined' ? window : globalThis);
