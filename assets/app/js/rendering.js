(function (global) {
  const PHASE_COMPONENTS = new Set(['alphaPhase', 'betaPhase', 'alphaBetaPhase', 'totalBloch']);

  function isPhaseLikeComponent(compMode) {
    return PHASE_COMPONENTS.has(compMode);
  }

  function maxAbs(data) {
    let max = 0;
    for (let i = 0; i < data.length; i++) {
      const av = Math.abs(data[i]);
      if (av > max) max = av;
    }
    return max;
  }

  function maxMagnitude(re, im) {
    let max = 0.0;
    for (let i = 0; i < re.length; i++) {
      const m = Math.hypot(re[i], im[i]);
      if (m > max) max = m;
    }
    return max;
  }

  function maxTotalDensity(vol) {
    const reA = vol.alphaRe;
    const imA = vol.alphaIm;
    const reB = vol.betaRe;
    const imB = vol.betaIm;

    let max = 0.0;
    for (let i = 0; i < reA.length; i++) {
      const d = reA[i] * reA[i] + imA[i] * imA[i] + reB[i] * reB[i] + imB[i] * imB[i];
      if (d > max) max = d;
    }
    return max;
  }

  function getAlphaBetaMagnitudeMaxima(vol) {
    return {
      maxA: maxMagnitude(vol.alphaRe, vol.alphaIm),
      maxB: maxMagnitude(vol.betaRe, vol.betaIm),
    };
  }

  function computeVolumeStats(vol, compMode, arrayMinMax) {
    if (vol && vol.isTwoComponent && isPhaseLikeComponent(compMode)) {
      let min = Infinity;
      let max = -Infinity;

      const updateMagStats = (re, im) => {
        for (let i = 0; i < re.length; i++) {
          const m = Math.hypot(re[i], im[i]);
          if (m < min) min = m;
          if (m > max) max = m;
        }
      };

      const updateDensityStats = (reA, imA, reB, imB) => {
        for (let i = 0; i < reA.length; i++) {
          const d = reA[i] * reA[i] + imA[i] * imA[i] + reB[i] * reB[i] + imB[i] * imB[i];
          if (d < min) min = d;
          if (d > max) max = d;
        }
      };

      if (compMode === 'alphaPhase' || compMode === 'alphaBetaPhase') updateMagStats(vol.alphaRe, vol.alphaIm);
      if (compMode === 'betaPhase' || compMode === 'alphaBetaPhase') updateMagStats(vol.betaRe, vol.betaIm);
      if (compMode === 'totalBloch') updateDensityStats(vol.alphaRe, vol.alphaIm, vol.betaRe, vol.betaIm);

      return { min, max };
    }

    return arrayMinMax(vol.data || []);
  }

  global.VibeMolRendering = {
    isPhaseLikeComponent,
    maxAbs,
    maxMagnitude,
    maxTotalDensity,
    getAlphaBetaMagnitudeMaxima,
    computeVolumeStats,
  };
})(window);
