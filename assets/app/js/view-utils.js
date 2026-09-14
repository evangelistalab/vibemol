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

  /**
   * Keep the visible geometry inside the camera's depth range without changing
   * framing. Cached local bounds avoid scanning surface/cloud vertices each frame.
   * Orthographic depth may extend behind the camera; perspective depth must stay positive.
   */
  function createCameraDepthController(THREE, minimumPadding = 3) {
    const toCamera = new THREE.Matrix4();
    const geometryVersions = new WeakMap();
    const instanceVersions = new WeakMap();
    const materialVisible = material => material && material.visible !== false && material.opacity !== 0;
    function update(root, camera) {
      camera.updateMatrixWorld(true);
      root.updateWorldMatrix(true, true);
      let nearest = Infinity, farthest = -Infinity;
      root.traverseVisible(node => {
        const geometry = node.geometry, material = node.material;
        if (!geometry || !(Array.isArray(material) ? material.some(materialVisible) : materialVisible(material))) return;
        const version = geometry.attributes.position?.version;
        if (!geometry.boundingBox || geometryVersions.get(geometry) !== version) {
          geometry.computeBoundingBox();
          geometryVersions.set(geometry, version);
        }
        let bounds = geometry.boundingBox;
        if (node.isInstancedMesh) {
          if (!node.count) return;
          const previous = instanceVersions.get(node);
          if (!node.boundingBox || !previous || previous.matrix !== node.instanceMatrix.version
            || previous.count !== node.count || previous.geometry !== version || previous.source !== geometry) {
            node.computeBoundingBox();
            instanceVersions.set(node, { matrix: node.instanceMatrix.version, count: node.count, geometry: version, source: geometry });
          }
          bounds = node.boundingBox;
        }
        if (!bounds || bounds.isEmpty()) return;
        toCamera.multiplyMatrices(camera.matrixWorldInverse, node.matrixWorld);
        const e = toCamera.elements, lo = bounds.min, hi = bounds.max;
        // Only the camera-space Z interval is needed, including transformed
        // atom radii, bond thickness, and the full extent of each orbital.
        const zMin = e[14] + e[2] * (e[2] >= 0 ? lo.x : hi.x)
          + e[6] * (e[6] >= 0 ? lo.y : hi.y) + e[10] * (e[10] >= 0 ? lo.z : hi.z);
        const zMax = e[14] + e[2] * (e[2] >= 0 ? hi.x : lo.x)
          + e[6] * (e[6] >= 0 ? hi.y : lo.y) + e[10] * (e[10] >= 0 ? hi.z : lo.z);
        nearest = Math.min(nearest, -zMax);
        farthest = Math.max(farthest, -zMin);
      });
      if (!Number.isFinite(nearest) || !Number.isFinite(farthest)) return;
      const padding = Math.max(minimumPadding, (farthest - nearest) * 0.05);
      const near = camera.isOrthographicCamera ? nearest - padding : Math.max(0.01, nearest - padding);
      const far = Math.max(near + 1, farthest + padding);
      if (camera.near === near && camera.far === far) return;
      camera.near = near; camera.far = far;
      camera.updateProjectionMatrix();
    }
    return Object.freeze({ update });
  }

  /** Match picking to the same depth interval that is rendered. */
  function setCameraRay(raycaster, ndc, camera) {
    raycaster.setFromCamera(ndc, camera);
    if (camera.isOrthographicCamera) {
      // Three starts orthographic rays at the camera plane. Start at the visible
      // near plane instead, so atoms on both sides of the camera remain selectable.
      raycaster.ray.origin.set(ndc.x, ndc.y, -1).unproject(camera);
      raycaster.near = 0;
      raycaster.far = camera.far - camera.near;
    } else {
      const e = camera.matrixWorld.elements, direction = raycaster.ray.direction;
      const cosine = Math.max(1e-6, -(e[8] * direction.x + e[9] * direction.y + e[10] * direction.z));
      raycaster.near = camera.near / cosine;
      raycaster.far = camera.far / cosine;
    }
  }

  window.VibeMolViewUtils = Object.freeze({
    copyCameraPose,
    getViewportSize,
    computePerspectiveFitDistance,
    computeOrthographicFrustum,
    createCameraDepthController,
    setCameraRay,
  });
})();
