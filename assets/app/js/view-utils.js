(function () {
  /**
   * Copy one camera pose (position/orientation/up vector) between cameras.
   * @param {THREE.Camera} src
   * @param {THREE.Camera} dst
   */
  function copyCameraPose(src, dst) {
    if (!src || !dst) return;
    dst.position.copy(src.position);
    dst.quaternion.copy(src.quaternion);
    dst.up.copy(src.up);
  }

  /**
   * Read renderer viewport size with safe fallback.
   * @param {*} renderer
   * @param {number=} fallbackWidth
   * @param {number=} fallbackHeight
   * @returns {{w:number,h:number}}
   */
  function getViewportSize(renderer, fallbackWidth, fallbackHeight) {
    const defaultW = Number.isFinite(fallbackWidth) ? fallbackWidth : (typeof window !== 'undefined' ? window.innerWidth : 1);
    const defaultH = Number.isFinite(fallbackHeight) ? fallbackHeight : (typeof window !== 'undefined' ? window.innerHeight : 1);
    const w = renderer && renderer.domElement ? (renderer.domElement.width || defaultW || 1) : (defaultW || 1);
    const h = renderer && renderer.domElement ? (renderer.domElement.height || defaultH || 1) : (defaultH || 1);
    return { w: Math.max(1, w), h: Math.max(1, h) };
  }

  /**
   * Compute one camera distance for perspective framing.
   * @param {number} maxDim
   * @param {number} fovDeg
   * @param {number=} tightness
   * @returns {number}
   */
  function computePerspectiveFitDistance(maxDim, fovDeg, tightness) {
    const d = Math.max(1e-6, Number(maxDim) || 0);
    const fov = Math.max(1, Number(fovDeg) || 45);
    const t = Math.max(1e-6, Number(tightness) || 1);
    return d * t / Math.tan((fov * Math.PI / 180) / 2);
  }

  /**
   * Compute orthographic frustum extents that preserve one perspective-equivalent scale.
   * @param {number} aspect
   * @param {number} distance
   * @param {number} fovDeg
   * @returns {{left:number,right:number,top:number,bottom:number}}
   */
  function computeOrthographicFrustum(aspect, distance, fovDeg) {
    const a = Math.max(1e-6, Number(aspect) || 1);
    const dist = Math.max(1e-6, Number(distance) || 1);
    const fov = Math.max(1, Number(fovDeg) || 45);
    const halfH = Math.max(1e-6, dist * Math.tan((fov * Math.PI / 180) / 2));
    return {
      left: -halfH * a,
      right: halfH * a,
      top: halfH,
      bottom: -halfH,
    };
  }

  window.VibeMolViewUtils = Object.freeze({
    copyCameraPose,
    getViewportSize,
    computePerspectiveFitDistance,
    computeOrthographicFrustum,
  });
})();
