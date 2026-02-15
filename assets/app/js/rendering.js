(function (global) {
  const PHASE_COMPONENTS = new Set(['alphaPhase', 'betaPhase', 'alphaBetaPhase', 'totalBloch']);

  /**
   * Check whether a selected 2C component mode is phase/Bloch based.
   * @param {string} compMode
   * @returns {boolean}
   */
  function isPhaseLikeComponent(compMode) {
    return PHASE_COMPONENTS.has(compMode);
  }

  /**
   * Compute the largest absolute value in a scalar field.
   * @param {ArrayLike<number>} data
   * @returns {number}
   */
  function maxAbs(data) {
    let max = 0;
    for (let i = 0; i < data.length; i++) {
      const av = Math.abs(data[i]);
      if (av > max) max = av;
    }
    return max;
  }

  /**
   * Compute the maximum complex magnitude `sqrt(re^2 + im^2)`.
   * @param {ArrayLike<number>} re
   * @param {ArrayLike<number>} im
   * @returns {number}
   */
  function maxMagnitude(re, im) {
    let max = 0.0;
    for (let i = 0; i < re.length; i++) {
      const m = Math.hypot(re[i], im[i]);
      if (m > max) max = m;
    }
    return max;
  }

  /**
   * Compute the maximum total spinor density for a two-component volume.
   * Density is `|alpha|^2 + |beta|^2`.
   * @param {{alphaRe:ArrayLike<number>,alphaIm:ArrayLike<number>,betaRe:ArrayLike<number>,betaIm:ArrayLike<number>}} vol
   * @returns {number}
   */
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

  /**
   * Compute per-spin maxima for alpha and beta complex magnitudes.
   * @param {{alphaRe:ArrayLike<number>,alphaIm:ArrayLike<number>,betaRe:ArrayLike<number>,betaIm:ArrayLike<number>}} vol
   * @returns {{maxA:number,maxB:number}}
   */
  function getAlphaBetaMagnitudeMaxima(vol) {
    return {
      maxA: maxMagnitude(vol.alphaRe, vol.alphaIm),
      maxB: maxMagnitude(vol.betaRe, vol.betaIm),
    };
  }

  /**
   * Compute min/max values used for thresholding and UI stats.
   * For phase/Bloch modes, stats are derived from magnitudes/densities instead of raw signed values.
   * @param {{isTwoComponent?:boolean,data?:ArrayLike<number>,alphaRe?:ArrayLike<number>,alphaIm?:ArrayLike<number>,betaRe?:ArrayLike<number>,betaIm?:ArrayLike<number>}} vol
   * @param {string} compMode
   * @param {(arr:ArrayLike<number>) => {min:number,max:number}} arrayMinMax
   * @returns {{min:number,max:number}}
   */
  function computeVolumeStats(vol, compMode, arrayMinMax) {
    if (vol && vol.isTwoComponent && isPhaseLikeComponent(compMode)) {
      let min = Infinity;
      let max = -Infinity;

      /**
       * Fold complex magnitudes into the running min/max.
       * @param {ArrayLike<number>} re
       * @param {ArrayLike<number>} im
       */
      const updateMagStats = (re, im) => {
        for (let i = 0; i < re.length; i++) {
          const m = Math.hypot(re[i], im[i]);
          if (m < min) min = m;
          if (m > max) max = m;
        }
      };

      /**
       * Fold total spinor density values into the running min/max.
       * @param {ArrayLike<number>} reA
       * @param {ArrayLike<number>} imA
       * @param {ArrayLike<number>} reB
       * @param {ArrayLike<number>} imB
       */
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
