(function () {
  const DEFAULT_TARGET = 0.85;
  const DEFAULT_BINS = 512;
  const DEFAULT_MAX_SAMPLES = 650000;

  /**
   * Choose one sampling stride for bounded worker cost.
   * @param {[number,number,number]} nxyz
   * @param {number} maxSamples
   * @returns {number}
   */
  function pickStride(nxyz, maxSamples) {
    const nx = (nxyz && nxyz[0]) | 0;
    const ny = (nxyz && nxyz[1]) | 0;
    const nz = (nxyz && nxyz[2]) | 0;
    const total = nx * ny * nz;
    if (total <= 0 || total <= maxSamples) return 1;
    return Math.max(1, Math.ceil(Math.cbrt(total / maxSamples)));
  }

  /**
   * Iterate samples for histogram estimation.
   * @param {*} payload
   * @param {number} stride
   * @param {(metric:number,weight:number)=>void} visitor
   */
  function forEachSample(payload, stride, visitor) {
    const nxyz = payload && payload.nxyz;
    const nx = (nxyz && nxyz[0]) | 0;
    const ny = (nxyz && nxyz[1]) | 0;
    const nz = (nxyz && nxyz[2]) | 0;
    if (!(nx > 0 && ny > 0 && nz > 0)) return;
    const step = Math.max(1, stride | 0);
    const idx = (i, j, k) => ((i * ny + j) * nz + k);
    const compMode = String((payload && payload.compMode) || 'alphaRe');
    const isTwoComponent = !!(payload && payload.isTwoComponent);

    if (isTwoComponent) {
      const reA = payload.alphaRe;
      const imA = payload.alphaIm;
      const reB = payload.betaRe;
      const imB = payload.betaIm;
      if (!reA || !imA || !reB || !imB) return;
      for (let i = 0; i < nx; i += step) {
        for (let j = 0; j < ny; j += step) {
          for (let k = 0; k < nz; k += step) {
            const t = idx(i, j, k);
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
            // Non-phase 2C mode defaults to alpha real channel absolute amplitude.
            const v = reA[t];
            visitor(Math.abs(v), v * v);
          }
        }
      }
      return;
    }

    const data = payload && payload.data;
    if (!data) return;
    for (let i = 0; i < nx; i += step) {
      for (let j = 0; j < ny; j += step) {
        for (let k = 0; k < nz; k += step) {
          const v = data[idx(i, j, k)];
          const av = Math.abs(v);
          visitor(av, v * v);
        }
      }
    }
  }

  /**
   * Estimate one auto-iso threshold by weighted histogram.
   * @param {*} payload
   * @returns {{value:number,stride:number}}
   */
  function estimate(payload) {
    const targetFraction = Number.isFinite(payload && payload.targetFraction) ? Number(payload.targetFraction) : DEFAULT_TARGET;
    const bins = Math.max(64, (Number(payload && payload.bins) || DEFAULT_BINS) | 0);
    const maxSamples = Math.max(1000, (Number(payload && payload.maxSamples) || DEFAULT_MAX_SAMPLES) | 0);
    const stride = Math.max(1, (payload && payload.stride) ? (payload.stride | 0) : pickStride(payload && payload.nxyz, maxSamples));

    let totalWeight = 0;
    let maxMetric = 0;
    forEachSample(payload, stride, (metric, weight) => {
      if (!Number.isFinite(metric) || !Number.isFinite(weight) || metric <= 0 || weight <= 0) return;
      totalWeight += weight;
      if (metric > maxMetric) maxMetric = metric;
    });
    if (!(totalWeight > 0) || !(maxMetric > 0)) return { value: NaN, stride };

    const hist = new Float64Array(bins);
    const invScale = bins / maxMetric;
    forEachSample(payload, stride, (metric, weight) => {
      if (!Number.isFinite(metric) || !Number.isFinite(weight) || metric <= 0 || weight <= 0) return;
      const bi = Math.max(0, Math.min(bins - 1, Math.floor(metric * invScale)));
      hist[bi] += weight;
    });

    const clampedTarget = Math.max(0, Math.min(1, targetFraction));
    const targetWeight = totalWeight * clampedTarget;
    const binWidth = maxMetric / bins;
    let cumulative = 0;
    for (let b = bins - 1; b >= 0; b--) {
      const w = hist[b];
      const next = cumulative + w;
      if (next >= targetWeight) {
        if (w <= 0) return { value: Math.max(0, b * binWidth), stride };
        const needed = Math.max(0, targetWeight - cumulative);
        const frac = Math.max(0, Math.min(1, needed / w));
        const binHi = (b + 1) * binWidth;
        const iso = binHi - frac * binWidth;
        return { value: Math.max(0, Math.min(maxMetric, iso)), stride };
      }
      cumulative = next;
    }
    return { value: 0, stride };
  }

  self.onmessage = (event) => {
    const msg = event && event.data ? event.data : {};
    const id = msg.id;
    try {
      const out = estimate(msg.payload || {});
      self.postMessage({ id, ok: true, value: out.value, stride: out.stride });
    } catch (err) {
      const reason = err && err.message ? err.message : String(err);
      self.postMessage({ id, ok: false, error: reason });
    }
  };
})();
