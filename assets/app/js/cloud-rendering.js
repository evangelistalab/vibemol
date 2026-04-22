(function (global) {
  'use strict';

  const BOHR_TO_ANG = 0.529177210903;
  const { voxelToWorld } = global.VibeMolVolumeGeometry || {};
  if (typeof voxelToWorld !== 'function') {
    throw new Error('VibeMolVolumeGeometry is not loaded. Ensure assets/app/js/volume-geometry.js is included before assets/app/js/cloud-rendering.js.');
  }
  const { hsvToRgb } = global.VibeMolVolume2C || {};
  if (typeof hsvToRgb !== 'function') {
    throw new Error('VibeMolVolume2C is not loaded. Ensure assets/app/js/volume-2c.js is included before assets/app/js/cloud-rendering.js.');
  }

  const CLOUD_CUBE_FILL_SCALE = 1.0;
  const CLOUD_POINT_SIZE_SCALE = 28.0;

  function voxelCenterToWorld(vol, i, j, k) {
    return voxelToWorld(vol, [i + 0.5, j + 0.5, k + 0.5]);
  }

  function estimateCellSize(vol) {
    const ax = vol.axes[0].map((v) => v * BOHR_TO_ANG);
    const ay = vol.axes[1].map((v) => v * BOHR_TO_ANG);
    const az = vol.axes[2].map((v) => v * BOHR_TO_ANG);
    const len = (v) => Math.hypot(v[0], v[1], v[2]);
    return (len(ax) + len(ay) + len(az)) / 3;
  }

  function absPercentile(vol, p) {
    const [nx, ny, nz] = vol.nxyz;
    const arr = [];
    for (let i = 0; i < nx; i += 1) {
      for (let j = 0; j < ny; j += 1) {
        for (let k = 0; k < nz; k += 1) {
          const v = Math.abs(vol.data[vol.idx(i, j, k)]);
          arr.push(v);
        }
      }
    }
    if (arr.length === 0) return 0;
    arr.sort((a, b) => a - b);
    const idx = Math.min(arr.length - 1, Math.max(0, Math.floor(p * (arr.length - 1))));
    return arr[idx];
  }

  function computeCloudPointBaseSize(vol) {
    return estimateCellSize(vol) * CLOUD_POINT_SIZE_SCALE;
  }

  function forEachCloudVoxel(vol, visit) {
    const [nx, ny, nz] = vol.nxyz;
    for (let i = 0; i < nx; i += 1) {
      for (let j = 0; j < ny; j += 1) {
        for (let k = 0; k < nz; k += 1) {
          visit(i, j, k, vol.idx(i, j, k));
        }
      }
    }
  }

  function createCloudCubeScaleVector(vol) {
    const ax = vol.axes[0].map((v) => v * BOHR_TO_ANG);
    const ay = vol.axes[1].map((v) => v * BOHR_TO_ANG);
    const az = vol.axes[2].map((v) => v * BOHR_TO_ANG);
    const len = (v) => Math.hypot(v[0], v[1], v[2]);
    return new global.THREE.Vector3(len(ax), len(ay), len(az));
  }

  function createVertexColoredCubeGeometry() {
    const geom = new global.THREE.BoxGeometry(1, 1, 1);
    try {
      const n = geom.getAttribute('position').count;
      const carr = new Float32Array(n * 3);
      for (let i = 0; i < carr.length; i += 1) carr[i] = 1.0;
      geom.setAttribute('color', new global.THREE.BufferAttribute(carr, 3));
    } catch {}
    return geom;
  }

  function createCloudCubeMaterial(options = {}) {
    const alpha = Math.min(1, Number(options.alpha) || 0);
    if (options.vertexColors) {
      return new global.THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: alpha < 1.0,
        opacity: alpha,
        depthWrite: alpha >= 1.0,
        depthTest: true,
        dithering: true,
        polygonOffset: true,
        polygonOffsetFactor: -0.5,
        polygonOffsetUnits: -1.0,
        side: global.THREE.DoubleSide,
        toneMapped: false,
      });
    }
    return new global.THREE.MeshStandardMaterial({
      color: new global.THREE.Color(options.color || '#ffffff'),
      transparent: alpha < 1.0,
      opacity: alpha,
      depthWrite: alpha >= 1.0,
      depthTest: true,
      dithering: true,
      polygonOffset: true,
      polygonOffsetFactor: -0.5,
      polygonOffsetUnits: -1.0,
    });
  }

  function createPointCloudGeometry(positions, strengths, colors) {
    const geo = new global.THREE.BufferGeometry();
    geo.setAttribute('position', new global.THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('aStrength', new global.THREE.BufferAttribute(new Float32Array(strengths), 1));
    if (Array.isArray(colors) || colors instanceof Float32Array) {
      geo.setAttribute('aColor', new global.THREE.BufferAttribute(new Float32Array(colors), 3));
    }
    return geo;
  }

  function createPointCloudMaterial(opts) {
    const alpha = Math.min(1.0, Number(opts && opts.alpha) || 0);
    const size = Math.max(1e-6, Number(opts && opts.size) || 1);
    const vertexColors = !!(opts && opts.vertexColors);
    const uniforms = {
      uAlpha: { value: alpha },
      uSize: { value: size },
    };
    if (!vertexColors) {
      uniforms.uColor = { value: new global.THREE.Color(opts && opts.colorHex ? opts.colorHex : '#ffffff') };
    }
    return new global.THREE.ShaderMaterial({
      uniforms,
      vertexShader: vertexColors
        ? `
          uniform float uSize;
          attribute float aStrength;
          attribute vec3 aColor;
          varying float vStrength;
          varying vec3 vColor;
          void main() {
            vStrength = aStrength;
            vColor = aColor;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            float dist = -mvPosition.z;
            gl_PointSize = uSize * (300.0 / max(1.0, dist));
            gl_Position = projectionMatrix * mvPosition;
          }
        `
        : `
          uniform float uSize;
          attribute float aStrength;
          varying float vStrength;
          void main() {
            vStrength = aStrength;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            float dist = -mvPosition.z;
            gl_PointSize = uSize * (300.0 / max(1.0, dist));
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
      fragmentShader: vertexColors
        ? `
          uniform float uAlpha;
          varying float vStrength;
          varying vec3 vColor;
          void main() {
            vec2 uv = gl_PointCoord - vec2(0.5);
            float d = length(uv);
            if (d > 0.5) discard;
            float fall = smoothstep(0.5, 0.0, d);
            float a = uAlpha * vStrength * fall;
            gl_FragColor = vec4(vColor, a);
          }
        `
        : `
          uniform vec3 uColor;
          uniform float uAlpha;
          varying float vStrength;
          void main() {
            vec2 uv = gl_PointCoord - vec2(0.5);
            float d = length(uv);
            if (d > 0.5) discard;
            float fall = smoothstep(0.5, 0.0, d);
            float a = uAlpha * vStrength * fall;
            gl_FragColor = vec4(uColor, a);
          }
        `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: global.THREE.NormalBlending,
    });
  }

  function buildCloudCubes(vol, opts) {
    const g = new global.THREE.Group();
    const scaleVec = createCloudCubeScaleVector(vol);
    const tLow = opts.tLow;
    let nPos = 0;
    let nNeg = 0;
    forEachCloudVoxel(vol, (i, j, k, t) => {
      const v = vol.data[t];
      const av = Math.abs(v);
      if (av < tLow) return;
      if (v >= 0) nPos += 1;
      else nNeg += 1;
    });
    const makeInst = (count, color) => {
      const geom = new global.THREE.BoxGeometry(1, 1, 1);
      const mat = createCloudCubeMaterial({ alpha: opts.alphaMax, color });
      return new global.THREE.InstancedMesh(geom, mat, Math.max(1, count));
    };
    const instPos = makeInst(nPos, opts.posColorHex);
    instPos.userData.sign = 'pos';
    instPos.userData.vmCloudKind = 'scalar-cubes';
    const instNeg = makeInst(nNeg, opts.negColorHex);
    instNeg.userData.sign = 'neg';
    instNeg.userData.vmCloudKind = 'scalar-cubes';
    let ip = 0;
    let ineg = 0;
    const m4 = new global.THREE.Matrix4();
    const q = new global.THREE.Quaternion();
    const s = new global.THREE.Vector3();
    forEachCloudVoxel(vol, (i, j, k, t) => {
      const v = vol.data[t];
      const av = Math.abs(v);
      if (av < tLow) return;
      const pos = voxelCenterToWorld(vol, i, j, k);
      m4.compose(
        new global.THREE.Vector3(pos[0], pos[1], pos[2]),
        q.identity(),
        s.copy(scaleVec).multiplyScalar(CLOUD_CUBE_FILL_SCALE)
      );
      if (v >= 0) instPos.setMatrixAt(ip++, m4);
      else instNeg.setMatrixAt(ineg++, m4);
    });
    instPos.instanceMatrix.needsUpdate = true;
    instNeg.instanceMatrix.needsUpdate = true;
    g.add(instPos, instNeg);
    return g;
  }

  function buildCloudCubes2CPhase(vol, which, opts) {
    const g = new global.THREE.Group();
    const re = which === 'alpha' ? vol.alphaRe : vol.betaRe;
    const im = which === 'alpha' ? vol.alphaIm : vol.betaIm;
    const scaleVec = createCloudCubeScaleVector(vol);
    let count = 0;
    const tLow = opts.tLow;
    forEachCloudVoxel(vol, (_i, _j, _k, t) => {
      const mag = Math.hypot(re[t], im[t]);
      if (mag >= tLow) count += 1;
    });
    if (count === 0) return g;
    const geom = createVertexColoredCubeGeometry();
    const mat = createCloudCubeMaterial({ alpha: opts.alphaMax, vertexColors: true });
    const inst = new global.THREE.InstancedMesh(geom, mat, count);
    inst.userData = { phaseHue: true, which, vmCloudKind: 'phase-cubes' };
    inst.instanceColor = new global.THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    const m4 = new global.THREE.Matrix4();
    const q = new global.THREE.Quaternion();
    const s = new global.THREE.Vector3();
    let idx = 0;
    forEachCloudVoxel(vol, (i, j, k, t) => {
      const rr = re[t];
      const ii = im[t];
      const mag = Math.hypot(rr, ii);
      if (mag < tLow) return;
      const pos = voxelCenterToWorld(vol, i, j, k);
      m4.compose(new global.THREE.Vector3(pos[0], pos[1], pos[2]), q.identity(), s.copy(scaleVec).multiplyScalar(CLOUD_CUBE_FILL_SCALE));
      inst.setMatrixAt(idx, m4);
      const phase = Math.atan2(ii, rr);
      const hue = (phase + Math.PI) / (2 * Math.PI);
      const rgb = hsvToRgb(hue, 1.0, 1.0);
      inst.instanceColor.setXYZ(idx, rgb[0], rgb[1], rgb[2]);
      idx += 1;
    });
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.instanceMatrix.needsUpdate = true;
    g.add(inst);
    return g;
  }

  function buildCloudPoints2CPhase(vol, which, opts) {
    const g = new global.THREE.Group();
    const re = which === 'alpha' ? vol.alphaRe : vol.betaRe;
    const im = which === 'alpha' ? vol.alphaIm : vol.betaIm;
    const tLow = opts.tLow;
    const arr = [];
    forEachCloudVoxel(vol, (_i, _j, _k, t) => {
      arr.push(Math.hypot(re[t], im[t]));
    });
    if (!arr.length) return g;
    arr.sort((a, b) => a - b);
    const hi = arr[Math.floor(0.99 * (arr.length - 1))] || 0.0;
    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    const pos = [];
    const str = [];
    const col = [];
    forEachCloudVoxel(vol, (i, j, k, t) => {
      const rr = re[t];
      const ii = im[t];
      const mag = Math.hypot(rr, ii);
      if (mag < tLow) return;
      const strength = clamp01((mag - tLow) / Math.max(1e-12, hi - tLow));
      const p = voxelCenterToWorld(vol, i, j, k);
      pos.push(p[0], p[1], p[2]);
      str.push(strength);
      const phase = Math.atan2(ii, rr);
      const hue = (phase + Math.PI) / (2 * Math.PI);
      const [r, g1, b] = hsvToRgb(hue, 1.0, 1.0);
      col.push(r, g1, b);
    });
    if (!pos.length) return g;
    const baseSize = computeCloudPointBaseSize(vol);
    const mat = createPointCloudMaterial({
      alpha: opts.alphaMax,
      size: baseSize,
      vertexColors: true,
    });
    const geo = createPointCloudGeometry(pos, str, col);
    const pts = new global.THREE.Points(geo, mat);
    pts.userData = { phaseHue: true, which, vmCloudKind: 'phase-points' };
    g.add(pts);
    return g;
  }

  function buildCloudCubes2CTotal(vol, opts) {
    const g = new global.THREE.Group();
    const reA = vol.alphaRe;
    const imA = vol.alphaIm;
    const reB = vol.betaRe;
    const imB = vol.betaIm;
    const tLow = opts.tLow;
    const scaleVec = createCloudCubeScaleVector(vol);
    let count = 0;
    forEachCloudVoxel(vol, (_i, _j, _k, t) => {
      const a2 = reA[t] * reA[t] + imA[t] * imA[t];
      const b2 = reB[t] * reB[t] + imB[t] * imB[t];
      const rho = Math.sqrt(a2 + b2);
      if (rho >= tLow) count += 1;
    });
    if (count === 0) return g;
    const geom = createVertexColoredCubeGeometry();
    const mat = createCloudCubeMaterial({ alpha: opts.alphaMax, vertexColors: true });
    const inst = new global.THREE.InstancedMesh(geom, mat, count);
    inst.userData = { phaseHue: true, totalBloch: true, vmCloudKind: 'bloch-cubes' };
    inst.instanceColor = new global.THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    const m4 = new global.THREE.Matrix4();
    const q = new global.THREE.Quaternion();
    const s = new global.THREE.Vector3();
    let idx = 0;
    forEachCloudVoxel(vol, (i, j, k, t) => {
      const ar = reA[t];
      const ai = imA[t];
      const br = reB[t];
      const bi = imB[t];
      const a2 = ar * ar + ai * ai;
      const b2 = br * br + bi * bi;
      const rho = a2 + b2;
      if (Math.sqrt(rho) < tLow) return;
      const pos = voxelCenterToWorld(vol, i, j, k);
      m4.compose(new global.THREE.Vector3(pos[0], pos[1], pos[2]), q.identity(), s.copy(scaleVec).multiplyScalar(CLOUD_CUBE_FILL_SCALE));
      inst.setMatrixAt(idx, m4);
      const re_ab = ar * br + ai * bi;
      const im_ab = -ar * bi + ai * br;
      const nxv = 2 * re_ab / rho;
      const nyv = 2 * im_ab / rho;
      const nzv = (a2 - b2) / rho;
      const hue = (Math.atan2(nyv, nxv) + Math.PI) / (2 * Math.PI);
      const value = 0.6 + 0.4 * (1 - Math.abs(nzv));
      const rgb = hsvToRgb(hue, 1.0, value);
      inst.instanceColor.setXYZ(idx, rgb[0], rgb[1], rgb[2]);
      idx += 1;
    });
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.instanceMatrix.needsUpdate = true;
    g.add(inst);
    return g;
  }

  function buildCloudPoints2CTotal(vol, opts) {
    const g = new global.THREE.Group();
    const reA = vol.alphaRe;
    const imA = vol.alphaIm;
    const reB = vol.betaRe;
    const imB = vol.betaIm;
    const tLow = opts.tLow;
    const vals = [];
    forEachCloudVoxel(vol, (_i, _j, _k, t) => {
      const a2 = reA[t] * reA[t] + imA[t] * imA[t];
      const b2 = reB[t] * reB[t] + imB[t] * imB[t];
      vals.push(Math.sqrt(a2 + b2));
    });
    if (!vals.length) return g;
    vals.sort((a, b) => a - b);
    const hi = vals[Math.floor(0.99 * (vals.length - 1))] || 0.0;
    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    const pos = [];
    const str = [];
    const col = [];
    forEachCloudVoxel(vol, (i, j, k, t) => {
      const ar = reA[t];
      const ai = imA[t];
      const br = reB[t];
      const bi = imB[t];
      const a2 = ar * ar + ai * ai;
      const b2 = br * br + bi * bi;
      const rho = a2 + b2;
      if (Math.sqrt(rho) < tLow) return;
      const strength = clamp01((Math.sqrt(rho) - tLow) / Math.max(1e-12, hi - tLow));
      const p = voxelCenterToWorld(vol, i, j, k);
      pos.push(p[0], p[1], p[2]);
      str.push(strength);
      const re_ab = ar * br + ai * bi;
      const im_ab = -ar * bi + ai * br;
      const nxv = 2 * re_ab / rho;
      const nyv = 2 * im_ab / rho;
      const nzv = (a2 - b2) / rho;
      const hue = (Math.atan2(nyv, nxv) + Math.PI) / (2 * Math.PI);
      const value = 0.6 + 0.4 * (1 - Math.abs(nzv));
      const [r, g1, b] = hsvToRgb(hue, 1.0, value);
      col.push(r, g1, b);
    });
    if (!pos.length) return g;
    const baseSize = computeCloudPointBaseSize(vol);
    const mat = createPointCloudMaterial({
      alpha: opts.alphaMax,
      size: baseSize,
      vertexColors: true,
    });
    const geo = createPointCloudGeometry(pos, str, col);
    const pts = new global.THREE.Points(geo, mat);
    pts.userData = { phaseHue: true, totalBloch: true, vmCloudKind: 'bloch-points' };
    g.add(pts);
    return g;
  }

  function buildCloudPoints(vol, opts) {
    const g = new global.THREE.Group();
    const tLow = opts.tLow;
    const hi = absPercentile(vol, 0.99);
    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    const posPos = [];
    const posNeg = [];
    const strPos = [];
    const strNeg = [];
    forEachCloudVoxel(vol, (i, j, k, t) => {
      const v = vol.data[t];
      const av = Math.abs(v);
      if (av < tLow) return;
      const strength = clamp01((av - tLow) / Math.max(1e-12, hi - tLow));
      const p = voxelCenterToWorld(vol, i, j, k);
      if (v >= 0) {
        posPos.push(p[0], p[1], p[2]);
        strPos.push(strength);
      } else {
        posNeg.push(p[0], p[1], p[2]);
        strNeg.push(strength);
      }
    });
    const baseSize = computeCloudPointBaseSize(vol);
    const makePoints = (posArr, strArr, color, sign) => {
      const geo = createPointCloudGeometry(posArr, strArr);
      const mat = createPointCloudMaterial({
        alpha: opts.alphaMax,
        size: baseSize,
        colorHex: color,
      });
      const pts = new global.THREE.Points(geo, mat);
      pts.userData.sign = sign;
      pts.userData.vmCloudKind = 'scalar-points';
      return pts;
    };
    if (posPos.length) g.add(makePoints(posPos, strPos, opts.posColorHex, 'pos'));
    if (posNeg.length) g.add(makePoints(posNeg, strNeg, opts.negColorHex, 'neg'));
    return g;
  }

  global.VibeMolCloudRendering = Object.freeze({
    voxelCenterToWorld,
    estimateCellSize,
    absPercentile,
    buildCloudCubes,
    buildCloudPoints,
    buildCloudCubes2CPhase,
    buildCloudPoints2CPhase,
    buildCloudCubes2CTotal,
    buildCloudPoints2CTotal,
  });
})(typeof window !== 'undefined' ? window : globalThis);
