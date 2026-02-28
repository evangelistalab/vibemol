(function () {
  // --- Constants & helpers ---
  const BOHR_TO_ANG = 0.529177210903;
  // App version displayed in Help
  const APP_VERSION = '0.4.2';

  const { arrayMinMax, parseCube, parseTwoComponentCube, parseXYZ } = window.VibeMolParsers || {};
  if (![arrayMinMax, parseCube, parseTwoComponentCube, parseXYZ].every(fn => typeof fn === 'function')) {
    throw new Error('VibeMolParsers is not loaded. Ensure assets/app/js/parsers.js is included before assets/app/js/app.js.');
  }

  const {
    maxAbs,
    isPhaseLikeComponent,
    maxMagnitude,
    maxTotalDensity,
    getAlphaBetaMagnitudeMaxima,
    computeVolumeStats,
  } = window.VibeMolRendering || {};
  if (![maxAbs, isPhaseLikeComponent, maxMagnitude, maxTotalDensity, getAlphaBetaMagnitudeMaxima, computeVolumeStats].every(fn => typeof fn === 'function')) {
    throw new Error('VibeMolRendering is not loaded. Ensure assets/app/js/rendering.js is included before assets/app/js/app.js.');
  }

  const { isTypingInInput, createShortcutRegistry } = window.VibeMolInteraction || {};
  if (![isTypingInInput, createShortcutRegistry].every(fn => typeof fn === 'function')) {
    throw new Error('VibeMolInteraction is not loaded. Ensure assets/app/js/interaction.js is included before assets/app/js/app.js.');
  }

  const { renderCoordsContent, volumeToXYZ } = window.VibeMolUI || {};
  if (![renderCoordsContent, volumeToXYZ].every(fn => typeof fn === 'function')) {
    throw new Error('VibeMolUI is not loaded. Ensure assets/app/js/ui.js is included before assets/app/js/app.js.');
  }

  // (subsample removed)

  // Coordinate conversions between stored atom units and world Å
  const ANG_TO_BOHR = 1.0 / BOHR_TO_ANG;
  /**
   * Convert atom coordinates from file units to angstrom world coordinates.
   * @param {{units?:string}} vol
   * @param {{x:number,y:number,z:number}} a
   * @returns {THREE.Vector3}
   */
  function atomUnitsToAng(vol, a) {
    if (vol.units === 'angstrom') return new THREE.Vector3(a.x, a.y, a.z);
    return new THREE.Vector3(a.x * BOHR_TO_ANG, a.y * BOHR_TO_ANG, a.z * BOHR_TO_ANG);
  }
  /**
   * Convert world-space angstrom coordinates back to the volume's native units.
   * @param {{units?:string}} vol
   * @param {THREE.Vector3} v3
   * @returns {[number, number, number]}
   */
  function worldToAtomUnits(vol, v3) {
    if (vol.units === 'angstrom') return [v3.x, v3.y, v3.z];
    return [v3.x * ANG_TO_BOHR, v3.y * ANG_TO_BOHR, v3.z * ANG_TO_BOHR];
  }

  /**
   * Map voxel-space coordinates to world-space angstroms.
   * @param {{axes:number[][],origin:number[]}} vol
   * @param {[number, number, number]} p
   * @returns {[number, number, number]}
   */
  function voxelToWorld(vol, p) {
    const a = vol.axes[0].map(v => v * BOHR_TO_ANG);
    const b = vol.axes[1].map(v => v * BOHR_TO_ANG);
    const c = vol.axes[2].map(v => v * BOHR_TO_ANG);
    const o = vol.origin ? vol.origin.map(v => v * BOHR_TO_ANG) : [0, 0, 0];
    return [
      o[0] + p[0] * a[0] + p[1] * b[0] + p[2] * c[0],
      o[1] + p[0] * a[1] + p[1] * b[1] + p[2] * c[1],
      o[2] + p[0] * a[2] + p[1] * b[2] + p[2] * c[2],
    ];
  }

  /**
   * Extract an isosurface mesh for a scalar field at a target level.
   * Vertices are welded in voxel space and then transformed into angstroms.
   * @param {{nxyz:number[],data:Float32Array,idx:(i:number,j:number,k:number)=>number,axes:number[][],origin:number[]}} vol
   * @param {number} level
   * @returns {THREE.BufferGeometry}
   */
  function makeIsosurface(vol, level) {
    const [nx, ny, nz] = vol.nxyz;
    // MarchingCubes extracts the 0-level set of the potential.
    // To get an iso-surface at `level`, return field(x)-level.
    /**
     * Sample scalar volume values in voxel space with clamped indices.
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {number}
     */
    const sampler = (x, y, z) => {
      const i = Math.max(0, Math.min(nx - 1, Math.floor(x)));
      const j = Math.max(0, Math.min(ny - 1, Math.floor(y)));
      const k = Math.max(0, Math.min(nz - 1, Math.floor(z)));
      return vol.data[vol.idx(i, j, k)];
    };
    // Marching cubes → triangles (no explicit bounds => defaults to [[0,0,0],[nx,ny,nz]])
    const result = isosurface.marchingCubes([nx, ny, nz], (x, y, z) => sampler(x, y, z) - level);

    // Weld vertices across cube boundaries by deduplicating identical voxel-space positions.
    // Quantize voxel coords to a small grid to ensure stable keys.
    const voxPos = result.positions; // array of [x,y,z] in voxel units
    /**
     * Build a stable quantized key for vertex deduplication.
     * @param {number[]} p
     * @returns {string}
     */
    const key = (p) => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)},${Math.round(p[2] * 1e6)}`;
    const map = new Map();
    const unique = [];
    const oldToNew = new Uint32Array(voxPos.length);
    for (let i = 0; i < voxPos.length; i++) {
      const k = key(voxPos[i]);
      let idx = map.get(k);
      if (idx === undefined) {
        idx = unique.length;
        map.set(k, idx);
        unique.push(voxPos[i]);
      }
      oldToNew[i] = idx;
    }

    // Remap triangle indices through the welding map
    const cells = result.cells; // array of [a,b,c]
    const indices = new Uint32Array(cells.length * 3);
    for (let t = 0; t < cells.length; t++) {
      const c = cells[t];
      indices[3 * t + 0] = oldToNew[c[0]];
      indices[3 * t + 1] = oldToNew[c[1]];
      indices[3 * t + 2] = oldToNew[c[2]];
    }

    // Build world-space positions for the unique vertices
    const positions = new Float32Array(unique.length * 3);
    for (let i = 0; i < unique.length; i++) {
      const p = voxelToWorld(vol, unique[i]); // map voxel coords to Å
      positions[3 * i + 0] = p[0];
      positions[3 * i + 1] = p[1];
      positions[3 * i + 2] = p[2];
    }

    const geom = new THREE.BufferGeometry();
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.computeVertexNormals();
    return geom;
  }

  // --- Two‑component phase‑hued isosurface (Alpha/Beta) ---
  /**
   * Convert HSV color values in [0,1] to RGB.
   * @param {number} h
   * @param {number} s
   * @param {number} v
   * @returns {[number, number, number]}
   */
  function hsvToRgb(h, s, v) {
    let r = 0, g = 0, b = 0;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return [r, g, b];
  }

  /**
   * Build a phase-colored isosurface for alpha or beta complex components.
   * Vertex hue encodes the local complex phase angle.
   * @param {{nxyz:number[],idx:(i:number,j:number,k:number)=>number,alphaRe:Float32Array,alphaIm:Float32Array,betaRe:Float32Array,betaIm:Float32Array}} vol
   * @param {'alpha'|'beta'} which
   * @param {number} level
   * @returns {THREE.BufferGeometry}
   */
  function make2CPhaseIsosurface(vol, which, level) {
    const [nx, ny, nz] = vol.nxyz;
    const isAlpha = which === 'alpha';
    const re = isAlpha ? vol.alphaRe : vol.betaRe;
    const im = isAlpha ? vol.alphaIm : vol.betaIm;
    const idx = vol.idx;
    /**
     * Clamp an index to `[0, n-1]`.
     * @param {number} x
     * @param {number} n
     * @returns {number}
     */
    const clampi = (x, n) => Math.max(0, Math.min(n - 1, x | 0));
    /**
     * Sample complex magnitude in voxel space.
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {number}
     */
    const magSampler = (x, y, z) => {
      const i = clampi(Math.floor(x), nx);
      const j = clampi(Math.floor(y), ny);
      const k = clampi(Math.floor(z), nz);
      const t = idx(i, j, k);
      const rr = re[t], ii = im[t];
      return Math.hypot(rr, ii);
    };
    const res = isosurface.marchingCubes([nx, ny, nz], (x, y, z) => magSampler(x, y, z) - level);
    const voxPos = res.positions;
    /**
     * Build a stable quantized key for vertex deduplication.
     * @param {number[]} p
     * @returns {string}
     */
    const key = (p) => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)},${Math.round(p[2] * 1e6)}`;
    const map = new Map();
    const unique = [];
    const oldToNew = new Uint32Array(voxPos.length);
    for (let i = 0; i < voxPos.length; i++) {
      const k = key(voxPos[i]);
      let id = map.get(k);
      if (id === undefined) { id = unique.length; map.set(k, id); unique.push(voxPos[i]); }
      oldToNew[i] = id;
    }
    const cells = res.cells;
    const indices = new Uint32Array(cells.length * 3);
    for (let t = 0; t < cells.length; t++) {
      const c = cells[t];
      indices[3 * t + 0] = oldToNew[c[0]];
      indices[3 * t + 1] = oldToNew[c[1]];
      indices[3 * t + 2] = oldToNew[c[2]];
    }
    const positions = new Float32Array(unique.length * 3);
    const colors = new Float32Array(unique.length * 3);
    for (let i = 0; i < unique.length; i++) {
      const p = voxelToWorld(vol, unique[i]);
      positions[3 * i + 0] = p[0];
      positions[3 * i + 1] = p[1];
      positions[3 * i + 2] = p[2];
      // Sample phase at nearest grid point
      const vi = clampi(Math.floor(unique[i][0]), nx);
      const vj = clampi(Math.floor(unique[i][1]), ny);
      const vk = clampi(Math.floor(unique[i][2]), nz);
      const t = idx(vi, vj, vk);
      const rr = re[t], ii = im[t];
      const phase = Math.atan2(ii, rr); // [-pi,pi]
      const hue = (phase + Math.PI) / (2 * Math.PI); // [0,1)
      const [r, g, b] = hsvToRgb(hue, 1.0, 1.0);
      colors[3 * i + 0] = r; colors[3 * i + 1] = g; colors[3 * i + 2] = b;
    }
    const geom = new THREE.BufferGeometry();
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    try { geom.computeVertexNormals(); } catch { }
    return geom;
  }

  /**
   * Draw the phase/Bloch legend wheel in the top-left overlay.
   * Used for all phase-like 2C render modes.
   * @param {string} modeLabel
   * @param {'phase'|'bloch'} kind
   */
  function drawPhaseWheel(modeLabel, kind = 'phase') {
    const el = document.getElementById('phaseWheelCanvas'); if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    // Work entirely in device pixels for precise centering
    const pxW = Math.max(1, Math.floor((el.clientWidth || 96) * dpr));
    const pxH = Math.max(1, Math.floor((el.clientHeight || 96) * dpr));
    el.width = pxW; el.height = pxH;
    const ctx = el.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pxW, pxH);
    const cx = pxW / 2;
    const labelSpace = Math.max(18 * dpr, 18); // reserve space at bottom for the label
    const cy = Math.floor((pxH - labelSpace) / 2);
    const R = Math.floor(Math.min(cx, cy) - 1);
    const img = ctx.createImageData(pxW, pxH);
    for (let y = 0; y < pxH; y++) {
      for (let x = 0; x < pxW; x++) {
        const dx = x - cx, dy = y - cy;
        const r2 = dx * dx + dy * dy;
        const ii = (y * pxW + x) * 4;
        if (r2 <= R * R) {
          const angle = Math.atan2(dy, dx); // [-pi,pi]
          const hue = (angle + Math.PI) / (2 * Math.PI);
          let v = 1.0;
          if (kind === 'bloch') {
            // brightness encodes |nz| with stereographic disk: r in [0,1] => |nz| = sqrt(1-r^2)
            const rNorm = Math.min(1, Math.sqrt(r2) / R);
            const nzAbs = Math.sqrt(Math.max(0, 1 - rNorm * rNorm));
            v = 0.6 + 0.4 * (1 - nzAbs);
          }
          const [r, g, b] = hsvToRgb(hue, 1.0, v);
          img.data[ii + 0] = Math.round(r * 255);
          img.data[ii + 1] = Math.round(g * 255);
          img.data[ii + 2] = Math.round(b * 255);
          img.data[ii + 3] = 255;
        } else {
          img.data[ii + 3] = 0;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    // Draw outer border circle centered around the fill
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    // double stroke for contrast
    ctx.lineWidth = Math.max(2, Math.round(2 * dpr)); ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.stroke();
    ctx.lineWidth = Math.max(1, Math.round(1 * dpr)); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.stroke();

    // Draw tick marks and labels for −π, −π/2, 0, π/2, π
    const ticks = [
      { a: 0, label: '0' },
      { a: Math.PI / 2, label: 'π/2' },
      { a: Math.PI, label: 'π' },
      { a: -Math.PI / 2, label: '−π/2' },
    ];
    ctx.font = `${Math.max(10, Math.round(10 * dpr))}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif`;
    ctx.textBaseline = 'middle';
    const tickGap = Math.max(8, Math.round(8 * dpr));
    const innerGap = Math.max(10, Math.round(10 * dpr));
    for (const t of ticks) {
      const ca = Math.cos(t.a), sa = Math.sin(t.a);
      const r1 = R - Math.max(2, Math.round(3 * dpr));
      const r2 = R;
      const x1 = cx + r1 * ca, y1 = cy + r1 * sa;
      const x2 = cx + r2 * ca, y2 = cy + r2 * sa;
      // double-stroke tick for contrast
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.lineWidth = Math.max(2, Math.round(2 * dpr)); ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.lineWidth = Math.max(1, Math.round(1 * dpr)); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.stroke();

      // Place text with collision-aware offsets
      let tx, ty;
      if (Math.abs(ca) > 0.85) {
        // Left or right: place outside horizontally
        tx = cx + (R + tickGap) * ca;
        ty = cy;
        ctx.textAlign = (ca > 0 ? 'left' : 'right');
        ctx.textBaseline = 'middle';
      } else if (sa < 0) {
        // Top: place outside above the circle
        tx = cx;
        ty = cy - (R + tickGap);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
      } else {
        // Bottom: place just inside the circle to avoid colliding with mode label
        tx = cx;
        ty = cy + (R - innerGap);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
      }
      // stroke + fill text for contrast
      ctx.lineWidth = Math.max(3, Math.round(3 * dpr)); ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.strokeText(t.label, tx, ty);
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillText(t.label, tx, ty);
    }

    // Mode label below the wheel
    let label;
    if (modeLabel === 'alphaPhase') label = 'α phase';
    else if (modeLabel === 'betaPhase') label = 'β phase';
    else if (modeLabel === 'alphaBetaPhase') label = 'α/β phase';
    else if (modeLabel === 'totalBloch') label = 'Bloch color';
    else label = '';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const ly = Math.min(pxH - Math.max(4, Math.round(4 * dpr)), cy + R + Math.max(18, Math.round(18 * dpr)));
    ctx.lineWidth = Math.max(3, Math.round(3 * dpr)); ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.strokeText(label, cx, ly);
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillText(label, cx, ly);
  }

  /**
   * Build a total-density isosurface colored with Bloch-sphere direction mapping.
   * @param {{nxyz:number[],idx:(i:number,j:number,k:number)=>number,alphaRe:Float32Array,alphaIm:Float32Array,betaRe:Float32Array,betaIm:Float32Array}} vol
   * @param {number} level
   * @returns {THREE.BufferGeometry}
   */
  function make2CTotalColoredIsosurface(vol, level) {
    const [nx, ny, nz] = vol.nxyz;
    const reA = vol.alphaRe, imA = vol.alphaIm, reB = vol.betaRe, imB = vol.betaIm;
    const idx = vol.idx;
    /**
     * Clamp an index to `[0, n-1]`.
     * @param {number} x
     * @param {number} n
     * @returns {number}
     */
    const clampi = (x, n) => Math.max(0, Math.min(n - 1, x | 0));
    /**
     * Sample total spinor density magnitude in voxel space.
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {number}
     */
    const densSampler = (x, y, z) => {
      const i = clampi(Math.floor(x), nx);
      const j = clampi(Math.floor(y), ny);
      const k = clampi(Math.floor(z), nz);
      const t = idx(i, j, k);
      const a2 = reA[t] * reA[t] + imA[t] * imA[t];
      const b2 = reB[t] * reB[t] + imB[t] * imB[t];
      return Math.sqrt(a2 + b2); // square root of the total density ρ
    };
    const res = isosurface.marchingCubes([nx, ny, nz], (x, y, z) => densSampler(x, y, z) - level);
    const voxPos = res.positions;
    /**
     * Build a stable quantized key for vertex deduplication.
     * @param {number[]} p
     * @returns {string}
     */
    const key = (p) => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)},${Math.round(p[2] * 1e6)}`;
    const map = new Map();
    const unique = [];
    const oldToNew = new Uint32Array(voxPos.length);
    for (let i = 0; i < voxPos.length; i++) {
      const k = key(voxPos[i]);
      let id = map.get(k);
      if (id === undefined) { id = unique.length; map.set(k, id); unique.push(voxPos[i]); }
      oldToNew[i] = id;
    }
    const cells = res.cells;
    const indices = new Uint32Array(cells.length * 3);
    for (let t = 0; t < cells.length; t++) {
      const c = cells[t];
      indices[3 * t + 0] = oldToNew[c[0]];
      indices[3 * t + 1] = oldToNew[c[1]];
      indices[3 * t + 2] = oldToNew[c[2]];
    }
    const positions = new Float32Array(unique.length * 3);
    for (let i = 0; i < unique.length; i++) {
      const p = voxelToWorld(vol, unique[i]);
      positions[3 * i + 0] = p[0];
      positions[3 * i + 1] = p[1];
      positions[3 * i + 2] = p[2];
    }
    // Vertex colors from Bloch sphere direction: hue = azimuth, brightness = polar
    const colors = new Float32Array(unique.length * 3);
    for (let i = 0; i < unique.length; i++) {
      const v = unique[i];
      const vi = clampi(Math.floor(v[0]), nx);
      const vj = clampi(Math.floor(v[1]), ny);
      const vk = clampi(Math.floor(v[2]), nz);
      const t = idx(vi, vj, vk);
      const ar = reA[t], ai = imA[t], br = reB[t], bi = imB[t];
      const a2 = ar * ar + ai * ai, b2 = br * br + bi * bi;
      const rho = a2 + b2; if (rho <= 1e-12) { colors[3 * i] = colors[3 * i + 1] = colors[3 * i + 2] = 0; continue; }
      const re_ab = ar * br + ai * bi;
      const im_ab = -ar * bi + ai * br;
      const nxv = 2 * re_ab / rho;
      const nyv = 2 * im_ab / rho;
      const nzv = (a2 - b2) / rho;
      // Hue from azimuth, brightness from polar angle (|nz|)
      const hue = (Math.atan2(nyv, nxv) + Math.PI) / (2 * Math.PI);
      const value = 0.6 + 0.4 * (1 - Math.abs(nzv));
      const [r, g, b] = hsvToRgb(hue, 1.0, value);
      colors[3 * i + 0] = r; colors[3 * i + 1] = g; colors[3 * i + 2] = b;
    }
    const geom = new THREE.BufferGeometry();
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    try { geom.computeVertexNormals(); } catch { }
    return geom;
  }

  // --- Three.js scene setup ---
  const canvas = document.getElementById('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.autoClear = false; // allow overlay rendering in same canvas
  const scene = new THREE.Scene();
  // Default to white background
  scene.background = new THREE.Color(0xffffff);
  const camera = new THREE.PerspectiveCamera(45, 2, 0.1, 1e6);
  camera.position.set(60, 50, 60);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  // Default rotate speed
  controls.rotateSpeed = 1.5;

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x081018, 2.0);
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(1, 1, 1);
  const amb = new THREE.AmbientLight(0x999999, 0.65);
  const rim = new THREE.DirectionalLight(0x9fb8ff, 0.0);
  rim.position.set(-1.4, 1.0, -0.8);
  scene.add(hemi, dir, amb, rim);

  // Resizer
  /**
   * Resize the renderer and camera to match the viewport.
   */
  function resize() {
    const panelH = 56; // toolbar height
    const w = window.innerWidth;
    const h = window.innerHeight - panelH;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // --- Corner axes (overlay) ---
  const axisScene = new THREE.Scene();
  // Use an orthographic camera so the gizmo stays centered without perspective shift
  const axisCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  axisCamera.position.set(0, 0, 2);
  axisCamera.lookAt(0, 0, 0);
  const axisGizmo = new THREE.Group();
  // Simple lights so the gizmo shows shaded heads/shafts
  {
    const aHemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.9);
    const aDir = new THREE.DirectionalLight(0xffffff, 1.2); aDir.position.set(1, 1, 1);
    axisScene.add(aHemi, aDir);
  }
  /**
   * Add shaded arrow.
   * @param {*} dir
   * @param {*} color
   */
  function addShadedArrow(dir, color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.15 });
    // Shaft along +Y
    const shaftLen = 0.75, shaftRad = 0.05;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftRad, shaftRad, shaftLen, 16, 1), mat);
    shaft.position.y = shaftLen / 2;
    g.add(shaft);
    // Head (cone) along +Y
    const headLen = 0.30, headRad = 0.12;
    const head = new THREE.Mesh(new THREE.ConeGeometry(headRad, headLen, 20, 1), mat);
    head.position.y = shaftLen + headLen / 2;
    g.add(head);
    // Rotate to desired direction
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    g.setRotationFromQuaternion(q);
    axisGizmo.add(g);
  }
  addShadedArrow(new THREE.Vector3(1, 0, 0), 0xff4136); // X - red
  addShadedArrow(new THREE.Vector3(0, 1, 0), 0x2ecc40); // Y - green
  addShadedArrow(new THREE.Vector3(0, 0, 1), 0x0074d9); // Z - blue
  axisScene.add(axisGizmo);

  // State
  let volumes = []; // {name, vol}
  let currentIndex = -1;
  let meshes = []; // active meshes (pos/neg)
  let atomGroup = new THREE.Group();
  let bondGroup = new THREE.Group();
  let cloudGroup = new THREE.Group();
  let boxHelper = null;
  let showSurfaces = true; // toggle iso-surface visibility
  // Remember surface visibility when entering a work mode (edit/measure) to restore on exit to display
  let __savedShowSurfaces = null;
  // Default view reference (captured on first non-preserved fit)
  let defaultView = null;
  // Current iso-surface material style
  let surfaceStyle = 'emissive';
  // Current atom/bond material style
  let moleculeStyle = 'default';
  // Center radius (Å) for glossy bond connectors
  let glossyBondRadius = 0.072;
  const bondMaterialCache = new Map();
  const toonGradientTextureCache = new Map();
  // Content group to allow whole-scene shifting
  const contentGroup = new THREE.Group();
  scene.add(contentGroup);
  contentGroup.add(atomGroup);
  contentGroup.add(bondGroup);
  contentGroup.add(cloudGroup);

  /**
   * Create per-pass registries used to avoid double-disposing shared GPU resources.
   * @returns {{geometries:Set<any>,materials:Set<any>,textures:Set<any>}}
   */
  function createDisposeState() {
    return {
      geometries: new Set(),
      materials: new Set(),
      textures: new Set(),
    };
  }

  /**
   * Dispose a material and any owned textures exactly once.
   * @param {THREE.Material} mat
   * @param {{materials:Set<any>,textures:Set<any>}} state
   */
  function disposeMaterial(mat, state) {
    if (!mat || state.materials.has(mat)) return;
    state.materials.add(mat);

    try {
      /**
       * Dispose a texture if it has not already been released.
       * @param {THREE.Texture} tex
       */
      const maybeDisposeTexture = (tex) => {
        if (!tex || !tex.dispose || state.textures.has(tex)) return;
        state.textures.add(tex);
        tex.dispose();
      };

      if (mat.map) maybeDisposeTexture(mat.map);
      if (mat.alphaMap) maybeDisposeTexture(mat.alphaMap);
      if (mat.emissiveMap) maybeDisposeTexture(mat.emissiveMap);
      if (mat.bumpMap) maybeDisposeTexture(mat.bumpMap);
      if (mat.normalMap) maybeDisposeTexture(mat.normalMap);
      if (mat.metalnessMap) maybeDisposeTexture(mat.metalnessMap);
      if (mat.roughnessMap) maybeDisposeTexture(mat.roughnessMap);
      if (mat.envMap) maybeDisposeTexture(mat.envMap);
      if (mat.transmissionMap) maybeDisposeTexture(mat.transmissionMap);
      if (mat.clearcoatMap) maybeDisposeTexture(mat.clearcoatMap);
      if (mat.clearcoatNormalMap) maybeDisposeTexture(mat.clearcoatNormalMap);
      if (mat.clearcoatRoughnessMap) maybeDisposeTexture(mat.clearcoatRoughnessMap);
      if (mat.thicknessMap) maybeDisposeTexture(mat.thicknessMap);
      if (mat.specularIntensityMap) maybeDisposeTexture(mat.specularIntensityMap);
      if (mat.specularColorMap) maybeDisposeTexture(mat.specularColorMap);
      if (mat.sheenColorMap) maybeDisposeTexture(mat.sheenColorMap);
      if (mat.sheenRoughnessMap) maybeDisposeTexture(mat.sheenRoughnessMap);

      if (mat.uniforms) {
        for (const key of Object.keys(mat.uniforms)) {
          const uniform = mat.uniforms[key];
          if (uniform && uniform.value && uniform.value.isTexture) {
            maybeDisposeTexture(uniform.value);
          }
        }
      }
    } catch { }

    try { if (mat.dispose) mat.dispose(); } catch { }
  }

  /**
   * Dispose geometry/material resources attached to a scene node.
   * @param {THREE.Object3D} node
   * @param {{geometries:Set<any>,materials:Set<any>,textures:Set<any>}} state
   */
  function disposeNode(node, state) {
    if (!node) return;

    const geom = node.geometry;
    if (geom && geom.dispose && !state.geometries.has(geom)) {
      state.geometries.add(geom);
      try { geom.dispose(); } catch { }
    }

    const mat = node.material;
    if (Array.isArray(mat)) {
      for (const m of mat) disposeMaterial(m, state);
    } else {
      disposeMaterial(mat, state);
    }
  }

  /**
   * Traverse and dispose all disposable resources in an object subtree.
   * @param {THREE.Object3D} obj
   * @param {{geometries:Set<any>,materials:Set<any>,textures:Set<any>}} state
   */
  function disposeDeep(obj, state = createDisposeState()) {
    if (!obj) return;
    try {
      if (obj.traverse) obj.traverse((o) => disposeNode(o, state));
      else disposeNode(obj, state);
    } catch { }
  }

  /**
   * Remove a group from the scene, dispose its resources, and return a fresh group.
   * @param {THREE.Group} group
   * @returns {THREE.Group}
   */
  function disposeAndReplaceGroup(group) {
    const state = createDisposeState();
    try { contentGroup.remove(group); } catch { }
    disposeDeep(group, state);
    const next = new THREE.Group();
    contentGroup.add(next);
    return next;
  }

  /**
   * Remove all currently rendered geometry groups and release GPU resources.
   */
  function clearSceneMeshes() {
    const state = createDisposeState();
    for (const m of meshes) {
      try { contentGroup.remove(m); } catch { }
      disposeDeep(m, state);
    }
    meshes = [];

    // Reset atom/bond/cloud groups with deep disposal.
    atomGroup = disposeAndReplaceGroup(atomGroup);
    bondGroup = disposeAndReplaceGroup(bondGroup);
    cloudGroup = disposeAndReplaceGroup(cloudGroup);

    if (boxHelper) {
      try { contentGroup.remove(boxHelper); } catch { }
      disposeDeep(boxHelper, state);
      boxHelper = null;
    }

    // Ensure any cached bond materials not attached to the current graph are released too.
    for (const mat of bondMaterialCache.values()) disposeMaterial(mat, state);
    bondMaterialCache.clear();
  }

  /**
   * Update scene lighting to match the active molecule style.
   */
  function applyMoleculeStyleLighting() {
    if (moleculeStyle === 'fancy') {
      hemi.color.setHex(0xf8fbff);
      hemi.groundColor.setHex(0x0f1826);
      hemi.intensity = 1.28;
      dir.color.setHex(0xffffff);
      dir.intensity = 2.25;
      dir.position.set(1.25, 1.2, 1.1);
      amb.color.setHex(0x9aa6ba);
      amb.intensity = 0.16;
      rim.color.setHex(0x9fb8ff);
      rim.intensity = 1.18;
      return;
    }
    if (moleculeStyle === 'glossy') {
      hemi.color.setHex(0xf4f9ff);
      hemi.groundColor.setHex(0x0a1324);
      hemi.intensity = 1.1;
      dir.color.setHex(0xffffff);
      dir.intensity = 2.6;
      dir.position.set(1.45, 1.32, 1.24);
      amb.color.setHex(0x7d93b2);
      amb.intensity = 0.12;
      rim.color.setHex(0x8db5ff);
      rim.intensity = 1.52;
      return;
    }
    if (moleculeStyle === 'studio') {
      hemi.color.setHex(0xfafcff);
      hemi.groundColor.setHex(0x515965);
      hemi.intensity = 1.35;
      dir.color.setHex(0xffffff);
      dir.intensity = 2.1;
      dir.position.set(1.35, 1.28, 1.18);
      amb.color.setHex(0x9ea7b2);
      amb.intensity = 0.18;
      rim.color.setHex(0xdfe7f2);
      rim.intensity = 0.75;
      return;
    }
    hemi.color.setHex(0xffffff);
    hemi.groundColor.setHex(0x081018);
    hemi.intensity = 2.0;
    dir.color.setHex(0xffffff);
    dir.intensity = 1.0;
    dir.position.set(1, 1, 1);
    amb.color.setHex(0x999999);
    amb.intensity = 0.65;
    rim.color.setHex(0x9fb8ff);
    rim.intensity = 0.0;
  }

  /**
   * Build a tiny stepped gradient texture for toon shading.
   * @param {'atom'|'bond'|'surface'} kind
   * @returns {THREE.Texture|null}
   */
  function getToonGradientTexture(kind) {
    const key = (kind === 'bond' || kind === 'surface') ? kind : 'atom';
    if (toonGradientTextureCache.has(key)) return toonGradientTextureCache.get(key);
    if (typeof document === 'undefined') return null;
    const steps = key === 'bond'
      ? [10, 72, 150, 255]
      : key === 'surface'
        ? [8, 58, 132, 214, 255]
        : [12, 64, 142, 255];
    const canvas = document.createElement('canvas');
    canvas.width = steps.length;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(steps.length, 1);
    for (let i = 0; i < steps.length; i++) {
      const v = steps[i];
      const o = i * 4;
      img.data[o + 0] = v;
      img.data[o + 1] = v;
      img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    toonGradientTextureCache.set(key, tex);
    return tex;
  }

  /**
   * Determine whether surfaces should use toon shading.
   * @returns {boolean}
   */
  function useToonSurfaceStyle() {
    return moleculeStyle === 'fancy';
  }

  /**
   * Determine whether molecule rendering is using a stylized non-default mode.
   * @returns {boolean}
   */
  function useStylizedMoleculeStyle() {
    return moleculeStyle === 'fancy' || moleculeStyle === 'glossy';
  }

  /**
   * Determine whether molecule rendering should use glossy glass-like styling.
   * @returns {boolean}
   */
  function useGlossyMoleculeStyle() {
    return moleculeStyle === 'glossy';
  }

  /**
   * Determine whether molecule rendering should use the studio collar-joint style.
   * @returns {boolean}
   */
  function useStudioMoleculeStyle() {
    return moleculeStyle === 'studio';
  }

  /**
   * Check whether element-based coloring is enabled and atomic metadata is available.
   * @returns {boolean}
   */
  function isElementColoringEnabled() {
    return !!(typeof elementColors !== 'undefined' && elementColors && elementColors.checked && ATOM_Z_TO_DATA);
  }

  /**
   * Look up the covalent radius for an atomic number in angstroms.
   * Falls back to a generic radius when element metadata is unavailable.
   * @param {number} z
   * @returns {number}
   */
  function getCovalentRadiusAngstrom(z) {
    return (ATOM_Z_TO_DATA && ATOM_Z_TO_DATA[z] && ATOM_Z_TO_DATA[z].radius_covalent) || 0.70;
  }

  /**
   * Clamp the configured glossy bond connector center radius (angstrom).
   * @returns {number}
   */
  function getGlossyBondCenterRadius() {
    const n = Number(glossyBondRadius);
    if (!Number.isFinite(n)) return 0.072;
    return Math.max(0.04, Math.min(0.16, n));
  }

  /**
   * Derive the glossy connector end radius from the center radius.
   * Keeps the welded shoulder proportion stable across sizes.
   * @returns {number}
   */
  function getGlossyBondEndRadius() {
    const c = getGlossyBondCenterRadius();
    return Math.max(c + 0.03, Math.min(0.18, c * 1.68));
  }

  /**
   * Check whether an atomic number belongs to a transition metal block.
   * @param {number} z
   * @returns {boolean}
   */
  function isTransitionMetalAtomicNumber(z) {
    const n = z | 0;
    return (
      (n >= 21 && n <= 30) ||
      (n >= 39 && n <= 48) ||
      (n >= 72 && n <= 80) ||
      (n >= 104 && n <= 112)
    );
  }

  /**
   * Resolve the raw element color from atomic metadata when enabled.
   * Falls back to white if element coloring is disabled or unavailable.
   * @param {number} z
   * @returns {THREE.Color}
   */
  function getElementBaseColor(z) {
    if (!isElementColoringEnabled()) return new THREE.Color(0xffffff);
    const info = ATOM_Z_TO_DATA[z];
    if (info && Array.isArray(info.color)) {
      const [cr, cg, cb] = info.color;
      return new THREE.Color(cr / 255, cg / 255, cb / 255);
    }
    return new THREE.Color(0xffffff);
  }

  /**
   * Resolve the display color for an element under the active molecule style.
   * @param {number} z
   * @returns {THREE.Color}
   */
  function getAtomRenderColor(z) {
    const useElementColors = isElementColoringEnabled();
    let atomColor = getElementBaseColor(z);

    if (useStudioMoleculeStyle()) {
      if (!useElementColors) return new THREE.Color(0xd6dde6);
      if (isTransitionMetalAtomicNumber(z)) return new THREE.Color(0xa78546);
      if (z === 1) return new THREE.Color(0xf4f6fa);
      if (z === 6) return new THREE.Color(0x1f2734);
      if (z === 7) return new THREE.Color(0x2ab5ff);
      if (z === 8) return new THREE.Color(0xc31722);
      const hsl = { h: 0, s: 0, l: 0 };
      atomColor.getHSL(hsl);
      atomColor.setHSL(hsl.h, Math.min(1, hsl.s * 0.95 + 0.03), Math.min(1, hsl.l * 0.9 + 0.06));
      return atomColor;
    }
    if (useGlossyMoleculeStyle()) {
      if (isTransitionMetalAtomicNumber(z)) return new THREE.Color(0xf1c970);
      if (z === 1) return new THREE.Color(0xe5f2ff);
      return new THREE.Color(0xbfd8ff);
    }
    if (moleculeStyle !== 'fancy') return atomColor;
    if (!useElementColors) return new THREE.Color(0xd0d9e6);
    if (isTransitionMetalAtomicNumber(z)) return new THREE.Color(0xf2ad1f);

    // Match the toon/luminous palette seen in the reference figure.
    if (z === 6) return new THREE.Color(0x9ca9b9); // carbon
    if (z === 1) return new THREE.Color(0xe4edf8); // hydrogen
    if (z === 7) return new THREE.Color(0x3c73ff); // nitrogen

    // For other elements, gently lift value while preserving hue identity.
    const hsl = { h: 0, s: 0, l: 0 };
    atomColor.getHSL(hsl);
    atomColor.setHSL(hsl.h, Math.min(1, hsl.s * 0.9 + 0.05), Math.min(1, hsl.l * 0.92 + 0.1));
    return atomColor;
  }

  /**
   * Derive a bond-end color from atom color for smoother toon gradients.
   * @param {THREE.Color} atomColor
   * @param {number} z
   * @returns {THREE.Color}
   */
  function getBondRenderColor(atomColor, z) {
    if (useStudioMoleculeStyle()) {
      if (isTransitionMetalAtomicNumber(z)) return new THREE.Color(0xd3ba8e);
      return new THREE.Color(0xe2e7ee);
    }
    if (useGlossyMoleculeStyle()) {
      if (isTransitionMetalAtomicNumber(z)) return new THREE.Color(0xf4d089);
      return new THREE.Color(0xbad4f8);
    }
    if (moleculeStyle !== 'fancy') return atomColor;
    if (isTransitionMetalAtomicNumber(z)) return new THREE.Color(0xefbb55);
    const c = atomColor.clone();
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL(hsl.h, Math.max(0, hsl.s * 0.55), Math.min(1, hsl.l * 0.85 + 0.16));
    return c;
  }

  /**
   * Resolve the inner glossy-core color for an atom.
   * In glossy mode the outer shell is glass-like, so this core carries most of
   * the element identity (especially when element colors are enabled).
   * @param {number} z
   * @returns {THREE.Color}
   */
  function getGlossyAtomCoreColor(z) {
    if (isTransitionMetalAtomicNumber(z)) return new THREE.Color(0xf2c14f);

    if (!isElementColoringEnabled()) {
      if (z === 1) return new THREE.Color(0xf8fbff);
      return new THREE.Color(0xa8cbff);
    }

    const c = getElementBaseColor(z);
    if (z === 1) return c.clone().lerp(new THREE.Color(0xffffff), 0.7);

    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL(
      hsl.h,
      Math.min(1, hsl.s * 0.95 + 0.03),
      Math.min(1, hsl.l * 0.82 + 0.08)
    );
    return c;
  }

  /**
   * Get the atom sphere radius scale factor for the current style.
   * @param {number} z
   * @returns {number}
   */
  function getAtomRenderScaleFactor(z) {
    if (moleculeStyle === 'studio') return isTransitionMetalAtomicNumber(z) ? 1.14 : 1.08;
    if (moleculeStyle === 'glossy') return isTransitionMetalAtomicNumber(z) ? 1.24 : 1.18;
    if (moleculeStyle === 'fancy') return isTransitionMetalAtomicNumber(z) ? 1.22 : 1.16;
    return 1.2;
  }

  /**
   * Create an atom material that matches the active molecule style.
   * @param {THREE.Color} color
   * @param {number} z
   * @returns {THREE.Material}
   */
  function createAtomMaterial(color, z) {
    if (useStudioMoleculeStyle()) {
      const isTransitionMetal = isTransitionMetalAtomicNumber(z);
      return new THREE.MeshPhongMaterial({
        color,
        specular: isTransitionMetal ? 0xffe7b8 : 0xffffff,
        shininess: isTransitionMetal ? 175 : 145,
        emissive: isTransitionMetal
          ? new THREE.Color(0x2b2213)
          : color.clone().multiplyScalar(z === 6 ? 0.012 : 0.02),
        emissiveIntensity: isTransitionMetal ? 0.18 : 0.06,
      });
    }
    if (useGlossyMoleculeStyle()) {
      const isTransitionMetal = isTransitionMetalAtomicNumber(z);
      const baseShellOpacity = 0.46;
      const baseShellThickness = 0.22;
      const shellColor = color.clone().lerp(
        new THREE.Color(0xffffff),
        isTransitionMetal ? 0.06 : 0.04
      );
      return new THREE.MeshPhysicalMaterial({
        color: shellColor,
        roughness: isTransitionMetal ? 0.08 : 0.05,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: isTransitionMetal ? 0.03 : 0.02,
        // Use a transmissive shell so the inner atom core reads through like glass.
        transmission: isTransitionMetal ? 0.62 : 0.98,
        ior: 1.2,
        thickness: isTransitionMetal
          ? Math.min(0.90, baseShellThickness + 0.06)
          : baseShellThickness,
        reflectivity: 0.12,
        transparent: true,
        opacity: isTransitionMetal
          ? Math.min(0.95, baseShellOpacity + 0.18)
          : Math.max(0.18, baseShellOpacity),
        depthWrite: true,
        attenuationDistance: isTransitionMetal ? 5.0 : 9.0,
        attenuationColor: isTransitionMetal ? new THREE.Color(0xffe2ad) : new THREE.Color(0xcfe9ff),
        emissive: isTransitionMetal ? new THREE.Color(0x33220a) : new THREE.Color(0x0b1730),
        emissiveIntensity: isTransitionMetal ? 0.02 : 0.008,
      });
    }
    if (moleculeStyle === 'fancy') {
      const isTransitionMetal = isTransitionMetalAtomicNumber(z);
      const emissiveBoost = isTransitionMetal ? 0.42 : 0.26;
      const emissiveTint = isTransitionMetal ? new THREE.Color(0xffe2a3) : new THREE.Color(0xffffff);
      const emissive = color.clone().multiplyScalar(emissiveBoost).lerp(emissiveTint, isTransitionMetal ? 0.12 : 0.06);
      return new THREE.MeshToonMaterial({
        color,
        gradientMap: getToonGradientTexture('atom'),
        emissive,
        emissiveIntensity: isTransitionMetal ? 0.82 : 0.56,
      });
    }
    return new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.16,
      metalness: 0.08,
      clearcoat: 0.82,
      clearcoatRoughness: 0.12,
      reflectivity: 0.62,
    });
  }

  /**
   * Create the additive specular shell used for stylized molecule hotspots.
   * @param {number} z
   * @returns {THREE.Material}
   */
  function createAtomHighlightMaterial(z) {
    const isTransitionMetal = isTransitionMetalAtomicNumber(z);
    if (useGlossyMoleculeStyle()) {
      return new THREE.MeshPhongMaterial({
        color: isTransitionMetal ? 0xfff0d0 : 0xeaf6ff,
        specular: 0xffffff,
        shininess: isTransitionMetal ? 280 : 340,
        emissive: isTransitionMetal ? new THREE.Color(0x443114) : new THREE.Color(0x182a46),
        emissiveIntensity: isTransitionMetal ? 0.08 : 0.05,
        transparent: true,
        opacity: isTransitionMetal ? 0.28 : 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: -0.3,
        polygonOffsetUnits: -0.3,
      });
    }
    return new THREE.MeshPhongMaterial({
      color: isTransitionMetal ? 0xffd39a : 0x88a4d2,
      specular: 0xffffff,
      shininess: isTransitionMetal ? 180 : 220,
      emissive: isTransitionMetal ? new THREE.Color(0x5a3f00) : new THREE.Color(0x172236),
      emissiveIntensity: isTransitionMetal ? 0.18 : 0.1,
      transparent: true,
      opacity: isTransitionMetal ? 0.52 : 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -0.2,
      polygonOffsetUnits: -0.2,
    });
  }

  /**
   * Create the opaque inner core material used inside glossy glass-shell atoms.
   * @param {THREE.Color} color
   * @param {number} z
   * @returns {THREE.Material}
   */
  function createGlossyAtomCoreMaterial(color, z) {
    const isTransitionMetal = isTransitionMetalAtomicNumber(z);
    return new THREE.MeshPhongMaterial({
      color,
      specular: isTransitionMetal ? 0xfff0cf : 0xf4fbff,
      shininess: isTransitionMetal ? 170 : 120,
      emissive: isTransitionMetal ? new THREE.Color(0x5a3d0a) : color.clone().multiplyScalar(0.08),
      emissiveIntensity: isTransitionMetal ? 0.12 : 0.06,
    });
  }

  /**
   * Get (or create) the shared bond material for the current molecule style.
   * @returns {THREE.Material}
   */
  function getBondMaterial() {
    const key = moleculeStyle === 'fancy'
      ? 'fancy'
      : moleculeStyle === 'glossy'
        ? 'glossy'
        : moleculeStyle === 'studio'
          ? 'studio'
        : 'default';
    if (bondMaterialCache.has(key)) return bondMaterialCache.get(key);

    let mat;
    if (key === 'glossy') {
      mat = new THREE.MeshPhysicalMaterial({
        color: 0xc2d8f8,
        vertexColors: true,
        roughness: 0.09,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        transmission: 0.9,
        ior: 1.2,
        thickness: 0.46,
        reflectivity: 0.1,
        transparent: true,
        opacity: 0.78,
        attenuationDistance: 2.2,
        attenuationColor: new THREE.Color(0xbad8ff),
        emissive: new THREE.Color(0x1e355c),
        emissiveIntensity: 0.06,
      });
    } else if (key === 'studio') {
      mat = new THREE.MeshPhongMaterial({
        color: 0xe7ebf2,
        specular: 0xffffff,
        shininess: 185,
        emissive: new THREE.Color(0x161b24),
        emissiveIntensity: 0.02,
      });
    } else if (key === 'fancy') {
      mat = new THREE.MeshToonMaterial({
        color: 0xd9e2ee,
        vertexColors: true,
        gradientMap: getToonGradientTexture('bond'),
        emissive: new THREE.Color(0x273244),
        emissiveIntensity: 0.14,
      });
    } else {
      mat = new THREE.MeshPhysicalMaterial({
        color: 0x99a5b8,
        roughness: 0.14,
        metalness: 0.08,
        clearcoat: 0.68,
        clearcoatRoughness: 0.14,
        reflectivity: 0.58,
      });
    }
    bondMaterialCache.set(key, mat);
    return mat;
  }

  /**
   * Get (or create) the shared outline material used by stylized bond shells.
   * @returns {THREE.Material|null}
   */
  function getStylizedBondOutlineMaterial() {
    if (!useStylizedMoleculeStyle()) return null;
    const key = useGlossyMoleculeStyle() ? 'glossy:outline' : 'fancy:outline';
    if (bondMaterialCache.has(key)) return bondMaterialCache.get(key);
    const mat = new THREE.MeshBasicMaterial({
      color: useGlossyMoleculeStyle() ? 0x07142c : 0x334050,
      side: THREE.BackSide,
      transparent: true,
      opacity: useGlossyMoleculeStyle() ? 0.56 : 0.86,
    });
    bondMaterialCache.set(key, mat);
    return mat;
  }

  /**
   * Get (or create) the shared highlight material used by stylized bond shells.
   * @returns {THREE.Material|null}
   */
  function getStylizedBondHighlightMaterial() {
    if (!useStylizedMoleculeStyle()) return null;
    const key = useGlossyMoleculeStyle() ? 'glossy:highlight' : 'fancy:highlight';
    if (bondMaterialCache.has(key)) return bondMaterialCache.get(key);
    const mat = new THREE.MeshPhongMaterial({
      color: useGlossyMoleculeStyle() ? 0xe8f5ff : 0xa4c2f2,
      specular: 0xffffff,
      shininess: useGlossyMoleculeStyle() ? 280 : 160,
      transparent: true,
      opacity: useGlossyMoleculeStyle() ? 0.22 : 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.FrontSide,
    });
    bondMaterialCache.set(key, mat);
    return mat;
  }

  /**
   * Apply end-to-end color interpolation to a cylinder so bonds are color-graded.
   * @param {THREE.BufferGeometry} geom
   * @param {THREE.Color} colorA
   * @param {THREE.Color} colorB
   */
  function applyBondGradient(geom, colorA, colorB) {
    const pos = geom.getAttribute('position');
    if (!pos) return;

    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const span = Math.max(1e-6, maxY - minY);
    const tmp = new THREE.Color();
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) - minY) / span;
      tmp.copy(colorA).lerp(colorB, t);
      colors[3 * i + 0] = tmp.r;
      colors[3 * i + 1] = tmp.g;
      colors[3 * i + 2] = tmp.b;
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  /**
   * Build a glossy connector geometry that is thinner in the center and fuller near the ends.
   * The geometry is revolved around the Y axis and later oriented along the bond vector.
   * @param {number} length
   * @param {number} centerRadius
   * @param {number} endRadius
   * @returns {THREE.BufferGeometry}
   */
  function createGlossyBondConnectorGeometry(length, centerRadius, endRadius) {
    const L = Math.max(1e-4, length);
    const cR = Math.max(1e-4, centerRadius);
    const eR = Math.max(cR, endRadius);
    const samples = 20;
    const profile = [];
    /**
     * Smoothly clamp a scalar into [0, 1] with cubic easing.
     * @param {number} edge0
     * @param {number} edge1
     * @param {number} x
     * @returns {number}
     */
    const smooth01 = (edge0, edge1, x) => {
      const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-8, edge1 - edge0)));
      return t * t * (3 - 2 * t);
    };

    for (let i = 0; i <= samples; i++) {
      const t = i / samples; // 0..1 along bond
      const y = -L / 2 + t * L;
      // 0 at center, 1 at ends
      const d = Math.abs(t - 0.5) * 2;

      // Smooth transition from slender center to end radius.
      const edgeBlend = smooth01(0.06, 0.96, d);
      const baseR = cR + (eR - cR) * edgeBlend;

      // Add a welded-looking shoulder bulge that fades before the exact endpoint.
      const shoulderIn = smooth01(0.52, 0.84, d);
      const shoulderOut = 1 - smooth01(0.9, 0.995, d);
      const shoulderBulge = (eR - cR) * 0.18 * shoulderIn * shoulderOut;

      // Gentle center neck so the connector reads slimmer in the middle.
      const centerNeck = (eR - cR) * 0.05 * (1 - smooth01(0.0, 0.34, d));

      let r = baseR + shoulderBulge - centerNeck;
      // Keep exact endpoint radius to avoid visible lip/chunk.
      if (i === 0 || i === samples) r = eR;
      r = Math.max(cR * 0.95, Math.min(eR * 1.045, r));
      profile.push(new THREE.Vector2(r, y));
    }

    const geom = new THREE.LatheGeometry(profile, 32);
    try { geom.computeVertexNormals(); } catch { }
    return geom;
  }

  /**
   * Build a studio-style connector with a slim shaft and collar-like flares near atom joints.
   * The profile includes a shallow groove inside each collar to produce a dark ring under light.
   * @param {number} length
   * @param {number} centerRadius
   * @param {number} collarRadius
   * @returns {THREE.BufferGeometry}
   */
  function createStudioCollaredBondGeometry(length, centerRadius, collarRadius) {
    const L = Math.max(1e-4, length);
    const cR = Math.max(1e-4, centerRadius);
    const kR = Math.max(cR * 1.2, collarRadius);
    const halfL = L * 0.5;
    const profile = [];

    // Fixed flange profile distances in angstrom from each end plane.
    const flangePlateauEnd = 0.02;
    const flangeTaperEnd = 0.04;

    // Clamp transition distances for very short bonds while preserving:
    // 0 <= plateau <= taper <= halfL.
    const eps = 1e-5;
    const plateau = Math.min(flangePlateauEnd, Math.max(0, halfL - 2 * eps));
    const taper = Math.min(flangeTaperEnd, Math.max(plateau + eps, halfL - eps));

    // Hard-coded 6 points where radius changes:
    // [-halfL, R0], [-halfL+plateau, R0], [-halfL+taper, Rb],
    // [ halfL-taper, Rb], [ halfL-plateau, R0], [ halfL, R0]
    profile.push(new THREE.Vector2(kR, -halfL));
    profile.push(new THREE.Vector2(kR, -halfL + plateau));
    profile.push(new THREE.Vector2(cR, -halfL + taper));
    profile.push(new THREE.Vector2(cR, halfL - taper));
    profile.push(new THREE.Vector2(kR, halfL - plateau));
    profile.push(new THREE.Vector2(kR, halfL));

    // Ensure strictly increasing y for LatheGeometry when bond is extremely short.
    for (let i = 1; i < profile.length; i++) {
      if (profile[i].y <= profile[i - 1].y) profile[i].y = profile[i - 1].y + eps;
    }

    const geom = new THREE.LatheGeometry(profile, 32);
    try { geom.computeVertexNormals(); } catch { }
    return geom;
  }

  /**
   * Compute where a studio connector should start relative to an atom center so the
   * flange rim (radius R0) contacts the sphere surface. Smaller spheres naturally
   * require deeper insertion because their curvature is higher.
   * @param {number} sphereRadius Rendered atom radius in angstroms.
   * @param {number} flangeRadius Studio flange outer radius R0 in angstroms.
   * @returns {number} Distance from atom center to connector start plane along bond axis.
   */
  function getStudioConnectorTrimDistance(sphereRadius, flangeRadius) {
    const Rs = Math.max(1e-6, Number(sphereRadius) || 0);
    const R0raw = Math.max(1e-6, Number(flangeRadius) || 0);
    // Keep the flange radius strictly below the sphere radius for the tangent geometry.
    const R0 = Math.min(R0raw, Math.max(1e-6, Rs - 1e-4));
    // Tangency condition for the end plane cross-section: sqrt(Rs^2 - x^2) = R0.
    let x = Math.sqrt(Math.max(0, Rs * Rs - R0 * R0));
    // Small extra overlap hides seams; tangent geometry already provides the curvature scaling.
    const seatOverlap = Math.min(0.010, Math.max(0.003, R0 * 0.035));
    x = Math.max(0, x - seatOverlap);
    return x;
  }

  /**
   * Build atom sphere meshes for the current volume.
   * Radius and color are derived from atomic metadata when available.
   * @param {{atoms:Array<{Z:number,x:number,y:number,z:number}>,units?:string}} vol
   * @returns {THREE.Group}
  */
  function buildAtoms(vol) {
    const group = new THREE.Group();
    // Atoms (spheres)
    const isFancyStyle = moleculeStyle === 'fancy';
    const isGlossyStyle = moleculeStyle === 'glossy';
    const isStudioStyle = moleculeStyle === 'studio';
    const isStylizedStyle = isFancyStyle || isGlossyStyle;
    const sphereWidthSegments = (isGlossyStyle || isStudioStyle) ? 36 : isFancyStyle ? 30 : 28;
    const sphereHeightSegments = (isGlossyStyle || isStudioStyle) ? 24 : isFancyStyle ? 20 : 18;
    const sphere = new THREE.SphereGeometry(
      0.5,
      sphereWidthSegments,
      sphereHeightSegments
    );
    const stylizedOutlineMat = isStylizedStyle
      ? new THREE.MeshBasicMaterial({
        color: isGlossyStyle ? 0x07142c : 0x303846,
        side: THREE.BackSide,
        transparent: true,
        opacity: isGlossyStyle ? 0.95 : 0.9
      })
      : null;
    const materialCache = new Map();
    const glossyCoreMaterialCache = new Map();
    const highlightMaterialCache = new Map();
    const toAng = (vol.units === 'angstrom');
    const hydrogenDisplayRadius = 0.5 * getCovalentRadiusAngstrom(1) * getAtomRenderScaleFactor(1);
    const baseOutlineScale = isGlossyStyle ? 1.05 : isFancyStyle ? 1.08 : 1.0;
    // Keep atom outline shell thickness constant across atom sizes (match hydrogen).
    const targetOutlineThickness = Math.max(1e-4, hydrogenDisplayRadius * Math.max(0, baseOutlineScale - 1));
    for (const a of vol.atoms) {
      const z = a.Z | 0;
      const r = getCovalentRadiusAngstrom(z);
      const atomColor = getAtomRenderColor(z);
      const isTransitionMetal = isTransitionMetalAtomicNumber(z);
      const matKey = `${moleculeStyle}:${atomColor.getHexString()}:${isTransitionMetal ? 'tm' : 'main'}`;
      let mat = materialCache.get(matKey);
      if (!mat) {
        mat = createAtomMaterial(atomColor, z);
        materialCache.set(matKey, mat);
      }
      const mesh = new THREE.Mesh(sphere, mat);
      const px = toAng ? a.x : a.x * BOHR_TO_ANG;
      const py = toAng ? a.y : a.y * BOHR_TO_ANG;
      const pz = toAng ? a.z : a.z * BOHR_TO_ANG;
      const pos = new THREE.Vector3(px, py, pz);
      mesh.position.copy(pos);
      const atomScale = r * getAtomRenderScaleFactor(z);
      mesh.scale.setScalar(atomScale);
      if (stylizedOutlineMat) {
        const outline = new THREE.Mesh(sphere, stylizedOutlineMat);
        const displayRadius = 0.5 * atomScale;
        const outlineScale = 1 + (targetOutlineThickness / Math.max(1e-4, displayRadius));
        outline.scale.setScalar(Math.max(1.001, Math.min(1.2, outlineScale)));
        outline.userData = { type: 'atomOutline' };
        mesh.add(outline);
      }
      if (isGlossyStyle) {
        const coreColor = getGlossyAtomCoreColor(z);
        const coreKey = `${coreColor.getHexString()}:${isTransitionMetal ? 'tm' : 'main'}`;
        let coreMat = glossyCoreMaterialCache.get(coreKey);
        if (!coreMat) {
          coreMat = createGlossyAtomCoreMaterial(coreColor, z);
          glossyCoreMaterialCache.set(coreKey, coreMat);
        }
        const core = new THREE.Mesh(sphere, coreMat);
        core.scale.setScalar(isTransitionMetal ? 0.8 : 0.7);
        core.userData = { type: 'atomCore' };
        mesh.add(core);
      }
      if (isStylizedStyle) {
        const highlightKey = `${moleculeStyle}:${isTransitionMetal ? 'tm' : 'main'}`;
        let highlightMat = highlightMaterialCache.get(highlightKey);
        if (!highlightMat) {
          highlightMat = createAtomHighlightMaterial(z);
          highlightMaterialCache.set(highlightKey, highlightMat);
        }
        const highlight = new THREE.Mesh(sphere, highlightMat);
        highlight.scale.setScalar(
          isGlossyStyle
            ? (isTransitionMetal ? 1.032 : 1.026)
            : (isTransitionMetal ? 1.035 : 1.028)
        );
        highlight.userData = { type: 'atomHighlight' };
        mesh.add(highlight);
      }
      mesh.userData = { type: 'atom', index: group.children.length };
      group.add(mesh);
    }
    return group;
  }

  /**
   * Build bond cylinder meshes using covalent-radii distance heuristics.
   * @param {{atoms:Array<{Z:number,x:number,y:number,z:number}>,units?:string}} vol
   * @returns {THREE.Group}
   */
  function buildBonds(vol) {
    const group = new THREE.Group();
    const isFancyStyle = moleculeStyle === 'fancy';
    const isGlossyStyle = moleculeStyle === 'glossy';
    const isStudioStyle = moleculeStyle === 'studio';
    const isStylizedStyle = isFancyStyle || isGlossyStyle;
    const usesTrimmedConnector = isGlossyStyle || isStudioStyle;
    const atomPositions = [];
    const toAng = (vol.units === 'angstrom');
    for (const a of vol.atoms) {
      const z = a.Z | 0;
      const px = toAng ? a.x : a.x * BOHR_TO_ANG;
      const py = toAng ? a.y : a.y * BOHR_TO_ANG;
      const pz = toAng ? a.z : a.z * BOHR_TO_ANG;
      const pos = new THREE.Vector3(px, py, pz);
      const atomColor = getAtomRenderColor(z);
      atomPositions.push({
        pos,
        Z: z,
        color: atomColor,
        bondColor: getBondRenderColor(atomColor, z),
        // Sphere geometry radius is 0.5, then scaled by the style-dependent atom scale factor.
        displayRadius: 0.5 * getCovalentRadiusAngstrom(z) * getAtomRenderScaleFactor(z),
      });
    }
    const bondMat = getBondMaterial();
    const stylizedBondOutlineMat = getStylizedBondOutlineMaterial();
    const stylizedBondHighlightMat = getStylizedBondHighlightMaterial();
    const up = new THREE.Vector3(0, 1, 0);
    const N = atomPositions.length;
    const glossyCenterRadius = getGlossyBondCenterRadius();
    const glossyEndRadius = getGlossyBondEndRadius();
    const studioCenterRadius = 0.068;
    const studioCollarRadius = 0.114;
    const bondRadius = isGlossyStyle ? glossyCenterRadius : isStudioStyle ? studioCenterRadius : isFancyStyle ? 0.102 : 0.12;
    const bondRadialSegments = isGlossyStyle ? 28 : isStudioStyle ? 20 : isFancyStyle ? 20 : 16;
    const bondHeightSegments = (isGlossyStyle || isStudioStyle || isFancyStyle) ? 1 : 2;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = atomPositions[i];
        const b = atomPositions[j];
        const ri = getCovalentRadiusAngstrom(a.Z);
        const rj = getCovalentRadiusAngstrom(b.Z);
        const cutoff = 1.15 * (ri + rj); // heuristic
        const dir = new THREE.Vector3().subVectors(b.pos, a.pos);
        const len = dir.length();
        if (len < 0.4 || len > cutoff) continue;
        const dirNorm = dir.clone().multiplyScalar(1 / Math.max(1e-12, len));
        let trimA = 0;
        let trimB = 0;
        let geomLen = len;
        let mid = new THREE.Vector3().addVectors(a.pos, b.pos).multiplyScalar(0.5);
        if (usesTrimmedConnector) {
          const connectorEndRadius = isGlossyStyle ? glossyEndRadius : studioCollarRadius;
          if (isGlossyStyle) {
            // Stop glossy bonds near the atom surfaces with a slight inset.
            const trimInset = Math.min(0.03, Math.max(0.012, connectorEndRadius * 0.18));
            trimA = Math.max(0, a.displayRadius - trimInset);
            trimB = Math.max(0, b.displayRadius - trimInset);
          } else {
            // Studio seating depends on sphere curvature; small atoms need deeper insertion.
            trimA = getStudioConnectorTrimDistance(a.displayRadius, connectorEndRadius);
            trimB = getStudioConnectorTrimDistance(b.displayRadius, connectorEndRadius);
          }
          const maxTrim = Math.max(0, len - (isStudioStyle ? 0.12 : 0.16));
          const trimSum = trimA + trimB;
          if (trimSum > maxTrim && trimSum > 1e-8) {
            const s = maxTrim / trimSum;
            trimA *= s;
            trimB *= s;
          }
          geomLen = len - trimA - trimB;
          if (geomLen < (isStudioStyle ? 0.06 : 0.08)) continue;
          const aEnd = a.pos.clone().addScaledVector(dirNorm, trimA);
          const bEnd = a.pos.clone().addScaledVector(dirNorm, len - trimB);
          mid = aEnd.add(bEnd).multiplyScalar(0.5);
        }
        const geom = isGlossyStyle
          ? createGlossyBondConnectorGeometry(geomLen, bondRadius, glossyEndRadius)
          : isStudioStyle
            ? createStudioCollaredBondGeometry(geomLen, bondRadius, studioCollarRadius)
          : new THREE.CylinderGeometry(bondRadius, bondRadius, geomLen, bondRadialSegments, bondHeightSegments, false);
        if (isStylizedStyle) applyBondGradient(geom, a.bondColor, b.bondColor);
        const cyl = new THREE.Mesh(geom, bondMat);
        if (stylizedBondOutlineMat) {
          const outline = new THREE.Mesh(geom, stylizedBondOutlineMat);
          const outlineScale = isGlossyStyle ? 1.06 : 1.18;
          outline.scale.set(outlineScale, 1.0, outlineScale);
          outline.userData = { type: 'bondOutline' };
          cyl.add(outline);
        }
        if (stylizedBondHighlightMat) {
          const highlight = new THREE.Mesh(geom, stylizedBondHighlightMat);
          const highlightScale = isGlossyStyle ? 1.012 : 1.03;
          highlight.scale.set(highlightScale, 1.0, highlightScale);
          highlight.userData = { type: 'bondHighlight' };
          cyl.add(highlight);
        }
        cyl.position.copy(mid);
        const q = new THREE.Quaternion().setFromUnitVectors(up, dirNorm);
        cyl.setRotationFromQuaternion(q);
        cyl.userData = {
          baseLen: len,
          baseGeomLen: geomLen,
          trimA,
          trimB,
          i,
          j,
          connectorStyle: isStudioStyle ? 'studio' : isGlossyStyle ? 'glossy' : 'default',
          connectorCenterRadius: bondRadius,
          connectorEndRadius: isStudioStyle ? studioCollarRadius : isGlossyStyle ? glossyEndRadius : bondRadius,
        };
        group.add(cyl);
      }
    }
    return group;
  }

  // Update existing bond cylinders transforms in place (to avoid flicker)
  /**
   * Update existing bond meshes after atom positions change.
   */
  function updateBondsInPlace() {
    if (!bondGroup || !bondGroup.children || currentIndex < 0 || !volumes[currentIndex]) return;
    const vol = volumes[currentIndex].vol; if (!vol) return;
    const toAng = (vol.units === 'angstrom');
    /**
     * Convert stored atom coordinates to a `THREE.Vector3` in angstrom units.
     * @param {{x:number,y:number,z:number}} a
     * @returns {THREE.Vector3}
     */
    const toV3 = (a) => new THREE.Vector3(toAng ? a.x : a.x * BOHR_TO_ANG, toAng ? a.y : a.y * BOHR_TO_ANG, toAng ? a.z : a.z * BOHR_TO_ANG);
    const up = new THREE.Vector3(0, 1, 0);
    for (const obj of bondGroup.children) {
      if (!obj.isMesh || !obj.userData) continue;
      const {
        i, j, baseLen, baseGeomLen, trimA = 0, trimB = 0,
        connectorStyle = 'default',
        connectorCenterRadius,
        connectorEndRadius
      } = obj.userData;
      if (i == null || j == null) continue;
      const ai = vol.atoms[i]; const aj = vol.atoms[j];
      if (!ai || !aj) continue;
      const aPos = toV3(ai); const bPos = toV3(aj);
      const dir = new THREE.Vector3().subVectors(bPos, aPos);
      const len = dir.length(); if (len < 1e-6) continue;
      const dirNorm = dir.clone().multiplyScalar(1 / len);
      let geomLen = len;
      let mid = new THREE.Vector3().addVectors(aPos, bPos).multiplyScalar(0.5);
      if (trimA || trimB) {
        geomLen = Math.max(1e-4, len - trimA - trimB);
        const aEnd = aPos.clone().addScaledVector(dirNorm, trimA);
        const bEnd = aPos.clone().addScaledVector(dirNorm, len - trimB);
        mid = aEnd.add(bEnd).multiplyScalar(0.5);
      }
      obj.position.copy(mid);
      obj.quaternion.setFromUnitVectors(up, dirNorm);
      if (connectorStyle === 'studio') {
        // Rebuild studio connector geometry to preserve fixed flange height/profile when bond length changes.
        const prevGeom = obj.geometry;
        const newGeom = createStudioCollaredBondGeometry(
          geomLen,
          Number.isFinite(connectorCenterRadius) ? connectorCenterRadius : 0.068,
          Number.isFinite(connectorEndRadius) ? connectorEndRadius : 0.114
        );
        obj.geometry = newGeom;
        if (obj.children && obj.children.length) {
          for (const child of obj.children) {
            if (child && child.isMesh) child.geometry = newGeom;
          }
        }
        try { if (prevGeom && prevGeom !== newGeom && prevGeom.dispose) prevGeom.dispose(); } catch { }
        obj.scale.set(1, 1, 1);
        obj.userData.baseGeomLen = geomLen;
      } else {
        const base = baseGeomLen || baseLen || geomLen;
        const s = geomLen / (base || geomLen);
        obj.scale.set(1, s, 1);
      }
      obj.visible = geomLen > 0.04;
    }
  }

  // Rebuild bonds from current atom positions (full rescan, bonds only)
  /**
   * Recompute the bond group from current atom positions.
   */
  function rebuildBondsFromAtoms() {
    if (currentIndex < 0 || !volumes[currentIndex]) return;
    const vol = volumes[currentIndex].vol; if (!vol) return;
    // Remove and dispose previous cylinders
    if (bondGroup) {
      contentGroup.remove(bondGroup);
      bondGroup.traverse(obj => { if (obj.isMesh) { obj.geometry?.dispose?.(); /* keep shared material */ } });
      bondGroup.clear();
    }
    bondGroup = buildBonds(vol);
    contentGroup.add(bondGroup);
  }

  /**
   * Build a wireframe bounding box around the sampled voxel domain.
   * @param {{nxyz:number[]}} vol
   * @returns {THREE.LineSegments}
   */
  function buildBox(vol) {
    const [nx, ny, nz] = vol.nxyz;
    // Use cell-corner indexing: far corner at (nx,ny,nz) works visually, but try (nx-1,...) to stay within data
    const nx1 = Math.max(0, nx - 1), ny1 = Math.max(0, ny - 1), nz1 = Math.max(0, nz - 1);
    const corners = [
      [0, 0, 0], [nx1, 0, 0], [0, ny1, 0], [0, 0, nz1],
      [nx1, ny1, 0], [nx1, 0, nz1], [0, ny1, nz1], [nx1, ny1, nz1]
    ].map(p => new THREE.Vector3(...voxelToWorld(vol, p)));
    const geom = new THREE.BufferGeometry();
    const verts = new Float32Array(24 * 3);
    const edges = [
      [0, 1], [0, 2], [0, 3], [7, 6], [7, 5], [7, 4], [1, 4], [1, 5], [2, 4], [2, 6], [3, 5], [3, 6]
    ];
    edges.forEach((e, i) => {
      verts[6 * i + 0] = corners[e[0]].x; verts[6 * i + 1] = corners[e[0]].y; verts[6 * i + 2] = corners[e[0]].z;
      verts[6 * i + 3] = corners[e[1]].x; verts[6 * i + 4] = corners[e[1]].y; verts[6 * i + 5] = corners[e[1]].z;
    });
    geom.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xd3d3d3, linewidth: 1, depthTest: false, transparent: true, opacity: 0.9 });
    return new THREE.LineSegments(geom, mat);
  }

  // --- Surface material helpers ---
  /**
   * Compute emissive tint for toon surfaces from a base sign color.
   * @param {THREE.Color} col
   * @returns {THREE.Color}
   */
  function getToonSurfaceEmissive(col) {
    return col.clone().multiplyScalar(0.22).lerp(new THREE.Color(0xffffff), 0.05);
  }

  /**
   * Create a material for positive/negative standard isosurfaces.
   * Style behavior depends on the current `surfaceStyle` selection.
   * @param {'pos'|'neg'} sign
   * @param {number} opacity
   * @returns {THREE.Material}
   */
  function createIsoMaterial(sign, opacity) {
    const col = new THREE.Color(sign === 'neg' ? negColor.value : posColor.value);
    if (useToonSurfaceStyle()) {
      return new THREE.MeshToonMaterial({
        color: col,
        gradientMap: getToonGradientTexture('surface'),
        emissive: getToonSurfaceEmissive(col),
        emissiveIntensity: 0.4,
        side: THREE.DoubleSide,
        transparent: true,
        opacity,
        depthWrite: opacity >= 0.999,
      });
    }
    if (surfaceStyle === 'glass') {
      col.multiplyScalar(2);
      return new THREE.MeshPhysicalMaterial({
        color: col,
        transmission: 1.0,
        roughness: 0.1,
        metalness: 0.0,
        clearcoat: 0.8,
        clearcoatRoughness: 0.025,
        reflectivity: 0.1,
        ior: 1.2,
        thickness: 1.0,
        side: THREE.DoubleSide,
      });
    }
    if (surfaceStyle === 'emissive') {
      return new THREE.MeshPhysicalMaterial({
        color: col,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        emissive: col.clone(),
        emissiveIntensity: 0.8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity
      });
    }
    // Fallback standard
    return new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, metalness: 0.05, side: THREE.DoubleSide, transparent: true, opacity });
  }

  // Material for 2C colored surfaces (vertex colors), matching style selection
  /**
   * Create a material for two-component vertex-colored surfaces.
   * Style behavior depends on the current `surfaceStyle` selection.
   * @param {number} opacity
   * @returns {THREE.Material}
   */
  function createIsoMaterial2C(opacity) {
    if (useToonSurfaceStyle()) {
      return new THREE.MeshToonMaterial({
        color: 0xffffff,
        vertexColors: true,
        gradientMap: getToonGradientTexture('surface'),
        emissive: new THREE.Color(0x5f7392),
        emissiveIntensity: 0.2,
        side: THREE.DoubleSide,
        transparent: true,
        opacity,
        depthWrite: opacity >= 0.999,
      });
    }
    if (surfaceStyle === 'glass') {
      // Glassy, tinted by vertex colors; drive transmission with slider
      return new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        vertexColors: true,
        transmission: 1.0,
        roughness: 0.1,
        metalness: 0.0,
        clearcoat: 0.8,
        clearcoatRoughness: 0.025,
        reflectivity: 0.1,
        ior: 1.2,
        thickness: 1.0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1.0,
      });
    }
    if (surfaceStyle === 'emissive') {
      // Emissive physical with vertex color tint
      return new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        vertexColors: true,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        emissiveIntensity: 0.0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity,
      });
    }
    // Fallback standard
    return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.05, side: THREE.DoubleSide, transparent: true, opacity });
  }

  // --- Cloud builders ---
  /**
   * Convert voxel indices to world-space cell-center coordinates.
   * @param {{axes:number[][],origin:number[]}} vol
   * @param {number} i
   * @param {number} j
   * @param {number} k
   * @returns {[number, number, number]}
   */
  function voxelCenterToWorld(vol, i, j, k) {
    // position at cell center: (i+0.5, j+0.5, k+0.5)
    return voxelToWorld(vol, [i + 0.5, j + 0.5, k + 0.5]);
  }

  /**
   * Estimate average voxel spacing in angstroms from lattice axis vectors.
   * @param {{axes:number[][]}} vol
   * @returns {number}
   */
  function estimateCellSize(vol) {
    // average step magnitude in Å
    const ax = vol.axes[0].map(v => v * BOHR_TO_ANG);
    const ay = vol.axes[1].map(v => v * BOHR_TO_ANG);
    const az = vol.axes[2].map(v => v * BOHR_TO_ANG);
    /**
     * Compute vector magnitude.
     * @param {number[]} v
     * @returns {number}
     */
    const len = v => Math.hypot(v[0], v[1], v[2]);
    return (len(ax) + len(ay) + len(az)) / 3;
  }

  /**
   * Estimate an absolute-value percentile from sampled voxels.
   * Used to derive robust upper bounds for cloud opacity mapping.
   * @param {{nxyz:number[],data:Float32Array,idx:(i:number,j:number,k:number)=>number}} vol
   * @param {number} p
   * @param {number} stride
   * @returns {number}
   */
  function absPercentile(vol, p, stride) {
    const [nx, ny, nz] = vol.nxyz;
    const step = Math.max(1, stride | 0);
    const arr = [];
    for (let i = 0; i < nx; i += step) {
      for (let j = 0; j < ny; j += step) {
        for (let k = 0; k < nz; k += step) {
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

  /**
   * Build signed scalar cloud geometry using instanced cubes.
   * Positive/negative values are emitted as separate meshes for color control.
   * @param {{nxyz:number[],axes:number[][],data:Float32Array,idx:(i:number,j:number,k:number)=>number}} vol
   * @param {{stride:number,tLow:number,alphaMax:number,hiMode?:string}} opts
   * @returns {THREE.Group}
   */
  function buildCloudCubes(vol, opts) {
    const g = new THREE.Group();
    const [nx, ny, nz] = vol.nxyz;
    const stride = Math.max(1, opts.stride | 0);
    // Compute voxel edge lengths in Å and scale so adjacent samples touch.
    const ax = vol.axes[0].map(v => v * BOHR_TO_ANG);
    const ay = vol.axes[1].map(v => v * BOHR_TO_ANG);
    const az = vol.axes[2].map(v => v * BOHR_TO_ANG);
    /**
     * Compute vector magnitude.
     * @param {number[]} v
     * @returns {number}
     */
    const len = v => Math.hypot(v[0], v[1], v[2]);
    const scaleVec = new THREE.Vector3(len(ax) * stride, len(ay) * stride, len(az) * stride);
    // Determine high bound
    const hi = opts.hiMode === 'max' ? maxAbs(vol.data) : absPercentile(vol, 0.99, Math.max(1, stride));
    const tLow = opts.tLow;
    /**
     * Clamp scalar values to [0, 1].
     * @param {number} x
     * @returns {number}
     */
    const clamp01 = x => Math.max(0, Math.min(1, x));
    // Count instances per sign
    let nPos = 0, nNeg = 0;
    for (let i = 0; i < nx; i += stride) {
      for (let j = 0; j < ny; j += stride) {
        for (let k = 0; k < nz; k += stride) {
          const v = vol.data[vol.idx(i, j, k)];
          const av = Math.abs(v);
          if (av < tLow) continue;
          if (v >= 0) nPos++; else nNeg++;
        }
      }
    }
    /**
     * Create an instanced cube mesh for one sign channel.
     * @param {number} count
     * @param {string} color
     * @returns {THREE.InstancedMesh}
     */
    const makeInst = (count, color) => {
      const geom = new THREE.BoxGeometry(1, 1, 1);
      const alpha = Math.min(1, opts.alphaMax * stride);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        transparent: alpha < 1.0,
        opacity: alpha,
        depthWrite: alpha >= 1.0,
        depthTest: true,
        dithering: true,
        polygonOffset: true,
        polygonOffsetFactor: -0.5,
        polygonOffsetUnits: -1.0,
      });
      return new THREE.InstancedMesh(geom, mat, Math.max(1, count));
    };
    const instPos = makeInst(nPos, posColor.value); instPos.userData.sign = 'pos';
    const instNeg = makeInst(nNeg, negColor.value); instNeg.userData.sign = 'neg';
    let ip = 0, ineg = 0;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (let i = 0; i < nx; i += stride) {
      for (let j = 0; j < ny; j += stride) {
        for (let k = 0; k < nz; k += stride) {
          const v = vol.data[vol.idx(i, j, k)];
          const av = Math.abs(v);
          if (av < tLow) continue;
          const pos = voxelCenterToWorld(vol, i, j, k);
          // Slightly shrink to mitigate coplanar z-fighting while still appearing contiguous
          m4.compose(new THREE.Vector3(pos[0], pos[1], pos[2]), q.identity(), s.copy(scaleVec).multiplyScalar(0.99));
          if (v >= 0) { instPos.setMatrixAt(ip++, m4); }
          else { instNeg.setMatrixAt(ineg++, m4); }
        }
      }
    }
    instPos.instanceMatrix.needsUpdate = true;
    instNeg.instanceMatrix.needsUpdate = true;
    g.add(instPos, instNeg);
    return g;
  }

  // --- 2C Cloud: phase‑hued cubes (alpha/beta) ---
  /**
   * Build phase-hued cube clouds for alpha/beta components.
   * Hue encodes local complex phase; cube alpha comes from cloud options.
   * @param {{nxyz:number[],axes:number[][],idx:(i:number,j:number,k:number)=>number,alphaRe:Float32Array,alphaIm:Float32Array,betaRe:Float32Array,betaIm:Float32Array}} vol
   * @param {'alpha'|'beta'} which
   * @param {{stride:number,tLow:number,alphaMax:number}} opts
   * @returns {THREE.Group}
   */
  function buildCloudCubes2CPhase(vol, which, opts) {
    const g = new THREE.Group();
    const [nx, ny, nz] = vol.nxyz;
    const stride = Math.max(1, opts.stride | 0);
    const re = which === 'alpha' ? vol.alphaRe : vol.betaRe;
    const im = which === 'alpha' ? vol.alphaIm : vol.betaIm;
    // Voxel scaling (Å)
    const ax = vol.axes[0].map(v => v * BOHR_TO_ANG);
    const ay = vol.axes[1].map(v => v * BOHR_TO_ANG);
    const az = vol.axes[2].map(v => v * BOHR_TO_ANG);
    /**
     * Compute vector magnitude.
     * @param {number[]} v
     * @returns {number}
     */
    const len = v => Math.hypot(v[0], v[1], v[2]);
    const scaleVec = new THREE.Vector3(len(ax) * stride, len(ay) * stride, len(az) * stride);
    // Count
    let count = 0;
    const tLow = opts.tLow;
    for (let i = 0; i < nx; i += stride) {
      for (let j = 0; j < ny; j += stride) {
        for (let k = 0; k < nz; k += stride) {
          const t = vol.idx(i, j, k);
          const mag = Math.hypot(re[t], im[t]);
          if (mag >= tLow) count++;
        }
      }
    }
    if (count === 0) return g;
    // Instanced cubes with per‑instance color (phase hue)
    const geom = new THREE.BoxGeometry(1, 1, 1);
    // Ensure a per-vertex color attribute exists (white) so vertexColors is active
    try {
      const n = geom.getAttribute('position').count;
      const carr = new Float32Array(n * 3);
      for (let i = 0; i < carr.length; i++) carr[i] = 1.0;
      geom.setAttribute('color', new THREE.BufferAttribute(carr, 3));
    } catch { }
    const alpha = Math.min(1, opts.alphaMax * stride);
    // Unlit shader that uses per-instance color (like points)
    const mat = new THREE.ShaderMaterial({
      uniforms: { uAlpha: { value: alpha } },
      vertexShader: `
        varying vec3 vColor;
        void main() {
          vColor = instanceColor;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uAlpha;
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, uAlpha);
        }
      `,
      transparent: alpha < 1.0,
      depthWrite: alpha >= 1.0,
      depthTest: true,
      dithering: true,
      polygonOffset: true,
      polygonOffsetFactor: -0.5,
      polygonOffsetUnits: -1.0,
      side: THREE.DoubleSide,
    });
    const inst = new THREE.InstancedMesh(geom, mat, count);
    inst.userData = { phaseHue: true, which };
    // Preallocate instanceColor for robust support across three.js versions
    inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    // Fill
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    // Use setColorAt for broad three.js compatibility
    let idx = 0;
    for (let i = 0; i < nx; i += stride) {
      for (let j = 0; j < ny; j += stride) {
        for (let k = 0; k < nz; k += stride) {
          const t = vol.idx(i, j, k);
          const rr = re[t], ii = im[t];
          const mag = Math.hypot(rr, ii);
          if (mag < tLow) continue;
          const pos = voxelCenterToWorld(vol, i, j, k);
          m4.compose(new THREE.Vector3(pos[0], pos[1], pos[2]), q.identity(), s.copy(scaleVec).multiplyScalar(0.99));
          inst.setMatrixAt(idx, m4);
          const phase = Math.atan2(ii, rr);
          const hue = (phase + Math.PI) / (2 * Math.PI);
          const rgb = hsvToRgb(hue, 1.0, 1.0);
          inst.instanceColor.setXYZ(idx, rgb[0], rgb[1], rgb[2]);
          idx++;
        }
      }
    }
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.instanceMatrix.needsUpdate = true;
    g.add(inst);
    return g;
  }

  // --- 2C Cloud: phase‑hued points (alpha/beta) ---
  /**
   * Build phase-hued point clouds for alpha/beta components.
   * @param {{nxyz:number[],idx:(i:number,j:number,k:number)=>number,alphaRe:Float32Array,alphaIm:Float32Array,betaRe:Float32Array,betaIm:Float32Array}} vol
   * @param {'alpha'|'beta'} which
   * @param {{stride:number,tLow:number,alphaMax:number}} opts
   * @returns {THREE.Group}
   */
  function buildCloudPoints2CPhase(vol, which, opts) {
    const g = new THREE.Group();
    const [nx, ny, nz] = vol.nxyz;
    const stride = Math.max(1, opts.stride | 0);
    const re = which === 'alpha' ? vol.alphaRe : vol.betaRe;
    const im = which === 'alpha' ? vol.alphaIm : vol.betaIm;
    const tLow = opts.tLow;
    // Determine hi bound for strength mapping from magnitudes
    const arr = [];
    for (let i = 0; i < nx; i += stride) {
      for (let j = 0; j < ny; j += stride) {
        for (let k = 0; k < nz; k += stride) {
          const t = vol.idx(i, j, k);
          arr.push(Math.hypot(re[t], im[t]));
        }
      }
    }
    if (!arr.length) return g;
    arr.sort((a, b) => a - b);
    const hi = arr[Math.floor(0.99 * (arr.length - 1))] || 0.0;
    /**
     * Clamp scalar values to [0, 1].
     * @param {number} x
     * @returns {number}
     */
    const clamp01 = x => Math.max(0, Math.min(1, x));
    const pos = [];
    const str = [];
    const col = [];
    for (let i = 0; i < nx; i += stride) {
      for (let j = 0; j < ny; j += stride) {
        for (let k = 0; k < nz; k += stride) {
          const t = vol.idx(i, j, k);
          const rr = re[t], ii = im[t];
          const mag = Math.hypot(rr, ii);
          if (mag < tLow) continue;
          const s = clamp01((mag - tLow) / Math.max(1e-12, (hi - tLow)));
          const p = voxelCenterToWorld(vol, i, j, k);
          pos.push(p[0], p[1], p[2]);
          str.push(s);
          const phase = Math.atan2(ii, rr);
          const hue = (phase + Math.PI) / (2 * Math.PI);
          const [r, g1, b] = hsvToRgb(hue, 1.0, 1.0);
          col.push(r, g1, b);
        }
      }
    }
    if (pos.length === 0) return g;
    // Shader material with per‑vertex color
    const baseSize = estimateCellSize(vol) * 12.0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uAlpha: { value: Math.min(1.0, opts.alphaMax * stride) }, uSize: { value: baseSize } },
      vertexShader: `
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
      `,
      fragmentShader: `
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
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('aStrength', new THREE.BufferAttribute(new Float32Array(str), 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(col), 3));
    const pts = new THREE.Points(geo, mat);
    pts.userData = { phaseHue: true, which };
    g.add(pts);
    return g;
  }

  // --- 2C Cloud: Bloch‑colored cubes (total density) ---
  /**
   * Build Bloch-colored cube clouds from total spinor density.
   * Hue/value encode Bloch direction while thresholding uses total density.
   * @param {{nxyz:number[],axes:number[][],idx:(i:number,j:number,k:number)=>number,alphaRe:Float32Array,alphaIm:Float32Array,betaRe:Float32Array,betaIm:Float32Array}} vol
   * @param {{stride:number,tLow:number,alphaMax:number}} opts
   * @returns {THREE.Group}
   */
  function buildCloudCubes2CTotal(vol, opts) {
    const g = new THREE.Group();
    const [nx, ny, nz] = vol.nxyz;
    const stride = Math.max(1, opts.stride | 0);
    const reA = vol.alphaRe, imA = vol.alphaIm, reB = vol.betaRe, imB = vol.betaIm;
    const tLow = opts.tLow;
    // Voxel scaling (Å)
    const ax = vol.axes[0].map(v => v * BOHR_TO_ANG);
    const ay = vol.axes[1].map(v => v * BOHR_TO_ANG);
    const az = vol.axes[2].map(v => v * BOHR_TO_ANG);
    /**
     * Compute vector magnitude.
     * @param {number[]} v
     * @returns {number}
     */
    const len = v => Math.hypot(v[0], v[1], v[2]);
    const scaleVec = new THREE.Vector3(len(ax) * stride, len(ay) * stride, len(az) * stride);
    // Count
    let count = 0;
    for (let i = 0; i < nx; i += stride) {
      for (let j = 0; j < ny; j += stride) {
        for (let k = 0; k < nz; k += stride) {
          const t = vol.idx(i, j, k);
          const a2 = reA[t] * reA[t] + imA[t] * imA[t];
          const b2 = reB[t] * reB[t] + imB[t] * imB[t];
          const rho = Math.sqrt(a2 + b2);
          if (rho >= tLow) count++;
        }
      }
    }
    if (count === 0) return g;
    const geom = new THREE.BoxGeometry(1, 1, 1);
    try {
      const n = geom.getAttribute('position').count;
      const carr = new Float32Array(n * 3);
      for (let i = 0; i < carr.length; i++) carr[i] = 1.0;
      geom.setAttribute('color', new THREE.BufferAttribute(carr, 3));
    } catch { }
    const alpha = Math.min(1, opts.alphaMax * stride);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uAlpha: { value: alpha } },
      vertexShader: `
        varying vec3 vColor;
        void main() {
          vColor = instanceColor;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uAlpha;
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, uAlpha);
        }
      `,
      transparent: alpha < 1.0,
      depthWrite: alpha >= 1.0,
      depthTest: true,
      dithering: true,
      polygonOffset: true,
      polygonOffsetFactor: -0.5,
      polygonOffsetUnits: -1.0,
      side: THREE.DoubleSide,
    });
    const inst = new THREE.InstancedMesh(geom, mat, count);
    inst.userData = { phaseHue: true, totalBloch: true };
    inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    // Use setColorAt for broad three.js compatibility
    let idx = 0;
    for (let i = 0; i < nx; i += stride) {
      for (let j = 0; j < ny; j += stride) {
        for (let k = 0; k < nz; k += stride) {
          const t = vol.idx(i, j, k);
          const ar = reA[t], ai = imA[t], br = reB[t], bi = imB[t];
          const a2 = ar * ar + ai * ai, b2 = br * br + bi * bi;
          const rho = a2 + b2; if (Math.sqrt(rho) < tLow) continue;
          const pos = voxelCenterToWorld(vol, i, j, k);
          m4.compose(new THREE.Vector3(pos[0], pos[1], pos[2]), q.identity(), s.copy(scaleVec).multiplyScalar(0.99));
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
          idx++;
        }
      }
    }
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.instanceMatrix.needsUpdate = true;
    g.add(inst);
    return g;
  }

  // --- 2C Cloud: Bloch‑colored points (total density) ---
  /**
   * Build Bloch-colored point clouds from total spinor density.
   * @param {{nxyz:number[],idx:(i:number,j:number,k:number)=>number,alphaRe:Float32Array,alphaIm:Float32Array,betaRe:Float32Array,betaIm:Float32Array}} vol
   * @param {{stride:number,tLow:number,alphaMax:number}} opts
   * @returns {THREE.Group}
   */
  function buildCloudPoints2CTotal(vol, opts) {
    const g = new THREE.Group();
    const [nx, ny, nz] = vol.nxyz;
    const stride = Math.max(1, opts.stride | 0);
    const reA = vol.alphaRe, imA = vol.alphaIm, reB = vol.betaRe, imB = vol.betaIm;
    const tLow = opts.tLow;
    // Build arrays
    const vals = [];
    for (let i = 0; i < nx; i += stride) {
      for (let j = 0; j < ny; j += stride) {
        for (let k = 0; k < nz; k += stride) {
          const t = vol.idx(i, j, k);
          const a2 = reA[t] * reA[t] + imA[t] * imA[t];
          const b2 = reB[t] * reB[t] + imB[t] * imB[t];
          vals.push(Math.sqrt(a2 + b2));
        }
      }
    }
    if (!vals.length) return g;
    vals.sort((a, b) => a - b);
    const hi = vals[Math.floor(0.99 * (vals.length - 1))] || 0.0;
    /**
     * Clamp scalar values to [0, 1].
     * @param {number} x
     * @returns {number}
     */
    const clamp01 = x => Math.max(0, Math.min(1, x));
    const pos = [], str = [], col = [];
    for (let i = 0; i < nx; i += stride) {
      for (let j = 0; j < ny; j += stride) {
        for (let k = 0; k < nz; k += stride) {
          const t = vol.idx(i, j, k);
          const ar = reA[t], ai = imA[t], br = reB[t], bi = imB[t];
          const a2 = ar * ar + ai * ai, b2 = br * br + bi * bi;
          const rho = a2 + b2; if (Math.sqrt(rho) < tLow) continue;
          const s = clamp01((Math.sqrt(rho) - tLow) / Math.max(1e-12, (hi - tLow)));
          const p = voxelCenterToWorld(vol, i, j, k);
          pos.push(p[0], p[1], p[2]);
          str.push(s);
          const re_ab = ar * br + ai * bi;
          const im_ab = -ar * bi + ai * br;
          const nxv = 2 * re_ab / rho;
          const nyv = 2 * im_ab / rho;
          const nzv = (a2 - b2) / rho;
          const hue = (Math.atan2(nyv, nxv) + Math.PI) / (2 * Math.PI);
          const value = 0.6 + 0.4 * (1 - Math.abs(nzv));
          const [r, g1, b] = hsvToRgb(hue, 1.0, value);
          col.push(r, g1, b);
        }
      }
    }
    if (!pos.length) return g;
    const baseSize = estimateCellSize(vol) * 12.0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uAlpha: { value: Math.min(1.0, opts.alphaMax * stride) }, uSize: { value: baseSize } },
      vertexShader: `
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
      `,
      fragmentShader: `
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
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('aStrength', new THREE.BufferAttribute(new Float32Array(str), 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(col), 3));
    const pts = new THREE.Points(geo, mat);
    pts.userData = { phaseHue: true, totalBloch: true };
    g.add(pts);
    return g;
  }

  /**
   * Build signed scalar cloud geometry using soft point sprites.
   * @param {{nxyz:number[],data:Float32Array,idx:(i:number,j:number,k:number)=>number}} vol
   * @param {{stride:number,tLow:number,alphaMax:number}} opts
   * @returns {THREE.Group}
   */
  function buildCloudPoints(vol, opts) {
    const g = new THREE.Group();
    const [nx, ny, nz] = vol.nxyz;
    const stride = Math.max(1, opts.stride | 0);
    const tLow = opts.tLow;
    // Determine hi bound for strength mapping
    const hi = absPercentile(vol, 0.99, Math.max(1, stride));
    /**
     * Clamp scalar values to [0, 1].
     * @param {number} x
     * @returns {number}
     */
    const clamp01 = x => Math.max(0, Math.min(1, x));
    // Collect positions and strength per sign
    const posPos = [], posNeg = [], strPos = [], strNeg = [];
    for (let i = 0; i < nx; i += stride) {
      for (let j = 0; j < ny; j += stride) {
        for (let k = 0; k < nz; k += stride) {
          const v = vol.data[vol.idx(i, j, k)];
          const av = Math.abs(v);
          if (av < tLow) continue;
          const s = clamp01((av - tLow) / Math.max(1e-12, (hi - tLow)));
          const p = voxelCenterToWorld(vol, i, j, k);
          if (v >= 0) { posPos.push(p[0], p[1], p[2]); strPos.push(s); }
          else { posNeg.push(p[0], p[1], p[2]); strNeg.push(s); }
        }
      }
    }
    // Shader material for round, shaded sprites
    const baseSize = estimateCellSize(vol) * 12.0; // uniform size, independent of stride/strength
    /**
     * Build a shader material for circular point sprites.
     * @param {string} colorHex
     * @returns {THREE.ShaderMaterial}
     */
    const makeSpriteMat = (colorHex) => new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(colorHex) },
        uAlpha: { value: Math.min(1.0, opts.alphaMax * stride) },
        uSize: { value: baseSize },
      },
      vertexShader: `
        uniform float uSize;
        attribute float aStrength;
        varying float vStrength;
        void main() {
          vStrength = aStrength;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          // approximate size attenuation (constant base size)
          float dist = -mvPosition.z;
          gl_PointSize = uSize * (300.0 / max(1.0, dist));
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uAlpha;
        varying float vStrength;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          if (d > 0.5) discard; // round sprite
          float fall = smoothstep(0.5, 0.0, d);
          float a = uAlpha * vStrength * fall;
          gl_FragColor = vec4(uColor, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
    });
    /**
     * Build a point cloud object for one sign channel.
     * @param {number[]} posArr
     * @param {number[]} strArr
     * @param {string} color
     * @param {'pos'|'neg'} sign
     * @returns {THREE.Points}
     */
    const makePoints = (posArr, strArr, color, sign) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posArr), 3));
      geo.setAttribute('aStrength', new THREE.BufferAttribute(new Float32Array(strArr), 1));
      const mat = makeSpriteMat(color);
      const pts = new THREE.Points(geo, mat);
      pts.userData.sign = sign;
      return pts;
    };
    if (posPos.length) g.add(makePoints(posPos, strPos, posColor.value, 'pos'));
    if (posNeg.length) g.add(makePoints(posNeg, strNeg, negColor.value, 'neg'));
    return g;
  }

  /**
   * Fit camera position and clipping planes to the current visible content bounds.
   */
  function fitCameraToScene() {
    const box = new THREE.Box3();
    let hasSomething = false;
    for (const m of meshes) { box.expandByObject(m); hasSomething = true; }
    if (atomGroup.children.length) { box.expandByObject(atomGroup); hasSomething = true; }
    if (bondGroup.children.length) { box.expandByObject(bondGroup); hasSomething = true; }
    if (boxHelper) { box.expandByObject(boxHelper); hasSomething = true; }
    if (!hasSomething || box.isEmpty()) return;

    const size = new THREE.Vector3(), center = new THREE.Vector3();
    box.getSize(size); box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    // Tighten fit so the model appears ~1.75x larger
    const FIT_TIGHTNESS = 1.6 / 1.75;
    const dist = maxDim * FIT_TIGHTNESS / Math.tan((camera.fov * Math.PI / 180) / 2);
    const dir = new THREE.Vector3(1, 1, 1).normalize();
    camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
    camera.near = Math.max(0.01, dist / 100);
    camera.far = dist * 10 + maxDim;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
  }

  // Simple FPS meter (EMA smoothed)
  let __fpsLast = performance.now();
  let __fpsAccMs = 0;
  let __fpsFrames = 0;
  let __fpsEMA = 0;

  /**
   * Main animation loop: render scene, optional split-view, FPS meter, and axis overlay.
   */
  function render() {
    controls.update();

    // Split render for 2C alpha/beta phase side-by-side
    let didSplit = false;
    try {
      const vrec = volumes[currentIndex];
      const v = vrec && vrec.vol;
      const mode = vrec && vrec.component;
      if (v && v.isTwoComponent && mode === 'alphaBetaPhase') {
        const w = renderer.domElement.width | 0;
        const h = renderer.domElement.height | 0;
        const half = Math.max(1, (w / 2) | 0);
        let alphaMesh = meshes.find(m => m && m.userData && m.userData.phaseHue && m.userData.which === 'alpha');
        let betaMesh = meshes.find(m => m && m.userData && m.userData.phaseHue && m.userData.which === 'beta');
        // Fallback to cloud objects if surfaces are not present
        if ((!alphaMesh || !betaMesh) && cloudGroup && cloudGroup.children) {
          /**
           * Find in cloud.
           * @param {*} which
           */
          const findInCloud = (which) => cloudGroup.children.find(o => o && o.userData && o.userData.phaseHue && o.userData.which === which);
          if (!alphaMesh) alphaMesh = findInCloud('alpha');
          if (!betaMesh) betaMesh = findInCloud('beta');
        }
        if (alphaMesh && betaMesh) {
          didSplit = true;
          renderer.clear();
          renderer.setScissorTest(true);
          const oldAspect = camera.aspect;
          const fullAspect = w / h;
          const halfAspect = half / h;
          // Left: alpha
          if (betaMesh) betaMesh.visible = false; alphaMesh.visible = true;
          renderer.setScissor(0, 0, half, h);
          renderer.setViewport(0, 0, half, h);
          camera.aspect = halfAspect; camera.updateProjectionMatrix();
          renderer.render(scene, camera);
          // Right: beta
          renderer.clearDepth();
          alphaMesh.visible = false; if (betaMesh) betaMesh.visible = true;
          renderer.setScissor(half, 0, w - half, h);
          renderer.setViewport(half, 0, w - half, h);
          camera.aspect = halfAspect; camera.updateProjectionMatrix();
          renderer.render(scene, camera);
          // Restore visibility
          alphaMesh.visible = true; if (betaMesh) betaMesh.visible = true;
          renderer.setScissorTest(false);
          // Restore full-aspect projection
          camera.aspect = fullAspect; camera.updateProjectionMatrix();
        }
      }
    } catch { }

    if (!didSplit) {
      // Main scene (single viewport)
      renderer.clear();
      renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
      renderer.setScissorTest(false);
      renderer.render(scene, camera);
    }

    // FPS update
    const now = performance.now();
    const dt = now - __fpsLast; __fpsLast = now;
    __fpsAccMs += dt; __fpsFrames += 1;
    if (__fpsAccMs >= 500) {
      const inst = (__fpsFrames * 1000) / __fpsAccMs;
      __fpsEMA = (__fpsEMA === 0) ? inst : (__fpsEMA * 0.8 + inst * 0.2);
      const el = document.getElementById('fpsValue');
      if (el) el.textContent = __fpsEMA.toFixed(1);
      __fpsAccMs = 0; __fpsFrames = 0;
    }

    // Overlay axes (bottom-left) — only if enabled
    if (window.__showAxes__) {
      // Copy view rotation only by rotating the gizmo opposite the camera
      // so it reflects world-axis orientation in the current view.
      axisGizmo.quaternion.copy(camera.quaternion).invert();
      const size = new THREE.Vector2();
      renderer.getSize(size);
      const px = Math.max(64, Math.min(128, Math.floor(Math.min(size.x, size.y) / 5)));
      const margin = 10;
      renderer.clearDepth();
      renderer.setScissorTest(true);
      renderer.setScissor(margin, margin, px, px);
      renderer.setViewport(margin, margin, px, px);
      // Orthographic camera has fixed framing; no aspect update needed
      renderer.render(axisScene, axisCamera);
    }

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  // --- UI wiring ---
  const fileInput = document.getElementById('fileInput');
  const openBtn = document.getElementById('openBtn');
  const fileSelect = document.getElementById('fileSelect');
  const isoInput = document.getElementById('iso');
  const opInput = document.getElementById('opacity');
  const posColor = document.getElementById('posColor');
  const negColor = document.getElementById('negColor');
  const bgColor = document.getElementById('bgColor');
  const toggleAtoms = document.getElementById('showAtoms');
  const toggleBonds = document.getElementById('showBonds');
  const elementColors = document.getElementById('elementColors');
  const toggleBox = document.getElementById('showBox');
  const toggleAxes = document.getElementById('showAxes');
  const saveBtn = document.getElementById('saveBtn');
  const batchBtn = document.getElementById('batchBtn');
  const surfBtn = document.getElementById('surfBtn');
  const clearBtn = document.getElementById('clearBtn');
  const helpBtn = document.getElementById('helpBtn');
  // Side panel controls
  const panelBtn = document.getElementById('panelBtn');
  const sidePanel = document.getElementById('sidePanel');
  const sideClose = document.getElementById('sideClose');
  const helpOverlay = document.getElementById('helpOverlay');
  const helpClose = document.getElementById('helpClose');
  const versionText = document.getElementById('versionText');
  if (versionText) versionText.textContent = APP_VERSION;
  const coordsContent = document.getElementById('coordsContent');
  const copyXYZBtn = document.getElementById('copyXYZ');
  const downloadXYZBtn = document.getElementById('downloadXYZ');
  // View controls
  const shiftX = document.getElementById('shiftX');
  const shiftY = document.getElementById('shiftY');
  const shiftZ = document.getElementById('shiftZ');
  const camX = document.getElementById('camX');
  const camY = document.getElementById('camY');
  const camZ = document.getElementById('camZ');
  const tgtX = document.getElementById('tgtX');
  const tgtY = document.getElementById('tgtY');
  const tgtZ = document.getElementById('tgtZ');
  const autoRot = document.getElementById('autoRot');
  const rotSpeed = document.getElementById('rotSpeed');
  const damp = document.getElementById('damp');
  const autoRotSpeed = document.getElementById('autoRotSpeed');
  const viewReset = document.getElementById('viewReset');
  const styleSelect = document.getElementById('styleSelect');
  const moleculeStyleSel = document.getElementById('moleculeStyle');
  const rowGlossyBond = document.getElementById('rowGlossyBond');
  const glossyBondRadiusEl = document.getElementById('glossyBondRadius');
  const schemeSelect = document.getElementById('schemeSelect');
  const renderModeSel = document.getElementById('renderMode');
  const componentRow = document.getElementById('componentRow');
  const componentSelect = document.getElementById('componentSelect');
  const cloudTypeSel = document.getElementById('cloudType');
  const cloudStrideEl = document.getElementById('cloudStride');
  const cloudAlphaEl = document.getElementById('cloudAlpha');
  const axisLockEl = document.getElementById('axisLock');
  const axisXBtn = document.getElementById('axisX');
  const axisYBtn = document.getElementById('axisY');
  const axisZBtn = document.getElementById('axisZ');
  const shortcutRibbon = document.getElementById('shortcutRibbon');
  let global2CComponentMode = (componentSelect && componentSelect.value) || 'alphaRe';

  openBtn.onclick = () => fileInput.click();
  // Toggle surface rendering button
  /**
   * Refresh the surface-toggle button label.
   */
  const updateSurfBtn = () => { surfBtn.textContent = showSurfaces ? 'Hide Surfaces' : 'Show Surfaces'; };
  updateSurfBtn();

  // Keyboard shortcuts registry and ribbon
  const SHORTCUTS = {
    default: [
      { k: 'S', d: 'Save PNG' },
      { k: 'B', d: 'Batch export' },
      { k: 'I', d: 'Toggle surfaces' },
      { k: 'A', d: 'Toggle axes' },
      { k: 'V', d: 'View/Coords panel' },
      { k: 'M', d: 'Measurement mode' },
      { k: '1/2/3/4', d: 'Style: Default/Toon/Kit/Glossy' },
      { k: '←/→', d: 'Prev/Next file' },
      { k: '?', d: 'Help' },
    ],
    panel: [
      { k: 'S', d: 'Save PNG' },
      { k: 'I', d: 'Toggle surfaces' },
    ],
    help: [
      { k: '←/→', d: 'Prev/Next file' },
    ],
    edit: [
      { k: 'E', d: 'Exit edit' },
      { k: 'Click+Drag', d: 'Move atom' },
      { k: 'X/Y/Z', d: 'Axis lock' },
    ],
    measure: [
      { k: 'M', d: 'Exit measurement' },
      { k: 'Click', d: 'Select points' },
      { k: 'Esc', d: 'Clear measurement' },
    ],
  };

  // --- Mode system + shortcut routing ---
  const MODES = Object.freeze({ DISPLAY: 'display', EDIT: 'edit', MEASURE: 'measurement' });
  let currentMode = MODES.DISPLAY;
  /**
   * Transition between display/edit/measurement modes and apply side effects.
   * This keeps surface visibility and interaction state consistent across mode changes.
   * @param {string} newMode
   */
  function setMode(newMode) {
    if (currentMode === newMode) return;
    const prevMode = currentMode;
    currentMode = newMode;
    editMode = (currentMode === MODES.EDIT);
    updateAxisButtons();
    const ctx = (currentMode === MODES.EDIT) ? 'edit' : (currentMode === MODES.MEASURE ? 'measure' : 'default');
    renderRibbon(ctx);
    // Camera: keep rotation enabled in all modes
    try { controls.enableRotate = true; } catch { }
    // Entering measurement mode: hide surfaces (preserve view), save prior state (once)
    if (currentMode === MODES.MEASURE && prevMode !== MODES.MEASURE) {
      if (__savedShowSurfaces === null) __savedShowSurfaces = showSurfaces;
      if (showSurfaces) {
        showSurfaces = false;
        if (typeof updateSurfBtn === 'function') updateSurfBtn();
        rebuildScene({ preserveView: true });
      }
    }
    // Entering edit mode: hide surfaces (preserve view), save prior state (once)
    if (currentMode === MODES.EDIT && prevMode !== MODES.EDIT) {
      if (__savedShowSurfaces === null) __savedShowSurfaces = showSurfaces;
      if (showSurfaces) {
        showSurfaces = false;
        if (typeof updateSurfBtn === 'function') updateSurfBtn();
        rebuildScene({ preserveView: true });
      }
    }
    // Clear hover when leaving interactive modes
    if (currentMode === MODES.DISPLAY) { clearHover(); }
    // Leaving measurement mode to display: restore surfaces and clear selection
    if (prevMode === MODES.MEASURE && currentMode === MODES.DISPLAY) {
      if (__savedShowSurfaces != null && showSurfaces !== !!__savedShowSurfaces) {
        showSurfaces = !!__savedShowSurfaces;
        if (typeof updateSurfBtn === 'function') updateSurfBtn();
        rebuildScene({ preserveView: true });
      }
      __savedShowSurfaces = null;
      clearEditSelection && clearEditSelection();
      updateSelectedHalos && updateSelectedHalos();
    }
    // Leaving edit mode to display: restore surfaces
    if (prevMode === MODES.EDIT && currentMode === MODES.DISPLAY) {
      if (__savedShowSurfaces != null && showSurfaces !== !!__savedShowSurfaces) {
        showSurfaces = !!__savedShowSurfaces;
        if (typeof updateSurfBtn === 'function') updateSurfBtn();
        rebuildScene({ preserveView: true });
      }
      __savedShowSurfaces = null;
    }
    updateAxisGuideLine && updateAxisGuideLine();
  }

  const shortcutRegistry = createShortcutRegistry([MODES.DISPLAY, MODES.EDIT, MODES.MEASURE]);
  const bind = shortcutRegistry.bind;
  const routeShortcut = shortcutRegistry.handle;
  let currentShortcutContext = 'default';
  /**
   * Render shortcut hints for the active interaction context.
   * @param {string} ctx
   */
  function renderRibbon(ctx = currentShortcutContext) {
    currentShortcutContext = ctx;
    const list = SHORTCUTS[ctx] || SHORTCUTS.default;
    if (!shortcutRibbon) return;
    const parts = list.map(s => `<span style="opacity:.85"><span style=\"background:#1a2230; color:#e9f1ff; padding:1px 6px; border:1px solid #2a3546; border-radius:4px;\">${s.k}</span> ${s.d}</span>`);
    shortcutRibbon.innerHTML = parts.join('<span style="opacity:.35"> • </span>');
    shortcutRibbon.setAttribute('aria-hidden', 'false');
  }
  renderRibbon('default');
  surfBtn.onclick = () => { showSurfaces = !showSurfaces; updateSurfBtn(); rebuildScene({ preserveView: true }); };
  /**
   * Toggle side.
   */
  const toggleSide = () => { sidePanel.classList.toggle('open'); sidePanel.setAttribute('aria-hidden', sidePanel.classList.contains('open') ? 'false' : 'true'); renderRibbon(sidePanel.classList.contains('open') ? 'panel' : 'default'); };
  /**
   * Open the side panel.
   */
  const openSide = () => { if (!sidePanel.classList.contains('open')) toggleSide(); };
  /**
   * Close the side panel.
   */
  const closeSide = () => { if (sidePanel.classList.contains('open')) { sidePanel.classList.remove('open'); sidePanel.setAttribute('aria-hidden', 'true'); renderRibbon('default'); } };
  panelBtn.onclick = toggleSide;
  sideClose.onclick = toggleSide;
  // Help modal logic
  /**
   * Open the shortcuts/help modal.
   */
  function openHelp() { helpOverlay.style.display = 'flex'; helpOverlay.setAttribute('aria-hidden', 'false'); renderRibbon('help'); }
  /**
   * Close the shortcuts/help modal.
   */
  function closeHelp() { helpOverlay.style.display = 'none'; helpOverlay.setAttribute('aria-hidden', 'true'); renderRibbon('default'); }
  if (helpBtn) helpBtn.onclick = openHelp;
  if (helpClose) helpClose.onclick = closeHelp;
  if (helpOverlay) helpOverlay.addEventListener('click', (e) => { if (e.target === helpOverlay) closeHelp(); });

  /**
   * Apply a molecule style selection from UI or keyboard shortcuts.
   * @param {'default'|'fancy'|'studio'|'glossy'} nextStyle
   */
  function setMoleculeStyle(nextStyle) {
    if (!moleculeStyleSel) return;
    const allowed = new Set(['default', 'fancy', 'studio', 'glossy']);
    const target = allowed.has(nextStyle) ? nextStyle : 'default';
    if (moleculeStyle === target && moleculeStyleSel.value === target) return;
    moleculeStyle = target;
    moleculeStyleSel.value = target;
    applyMoleculeStyleUiState();
    rebuildScene({ preserveView: true });
  }

  /**
   * Synchronize camera/target/shift form controls from the current scene state.
   */
  function refreshViewUI() {
    /**
     * Check that an input is not currently focused (to avoid overwriting edits).
     * @param {HTMLElement} el
     * @returns {boolean}
     */
    const notEditing = (el) => document.activeElement !== el;
    if (notEditing(shiftX)) shiftX.value = contentGroup.position.x.toFixed(3);
    if (notEditing(shiftY)) shiftY.value = contentGroup.position.y.toFixed(3);
    if (notEditing(shiftZ)) shiftZ.value = contentGroup.position.z.toFixed(3);
    if (notEditing(camX)) camX.value = camera.position.x.toFixed(3);
    if (notEditing(camY)) camY.value = camera.position.y.toFixed(3);
    if (notEditing(camZ)) camZ.value = camera.position.z.toFixed(3);
    if (notEditing(tgtX)) tgtX.value = controls.target.x.toFixed(3);
    if (notEditing(tgtY)) tgtY.value = controls.target.y.toFixed(3);
    if (notEditing(tgtZ)) tgtZ.value = controls.target.z.toFixed(3);
    autoRot.checked = controls.autoRotate === true;
    if (notEditing(rotSpeed)) rotSpeed.value = (controls.rotateSpeed ?? 1.0).toFixed(2);
    if (notEditing(damp)) damp.value = (controls.dampingFactor ?? 0.05).toFixed(2);
    if (notEditing(autoRotSpeed)) autoRotSpeed.value = (controls.autoRotateSpeed ?? 2.0).toFixed(2);
  }

  // Initialize view UI
  refreshViewUI();
  controls.addEventListener('change', refreshViewUI);

  // --- Edit mode: toggle with 'E', hover highlight, drag to move ---
  let editMode = false; // mirrors currentMode === MODES.EDIT
  let hoverAtomMesh = null;
  let dragActive = false;
  let dragAtomIndex = -1;
  let dragStartPos = null;
  let dragOrigMeshPos = null;
  let dragOrigAtomUnits = null;
  let dragPlane = null;
  let dragPlaneStart = null;
  let dragAxis = 'none';
  let axisLock = 'none'; // 'none'|'x'|'y'|'z'
  let axisKeyDown = null; // current held axis key ('x'|'y'|'z') to avoid auto-repeat toggling

  // Faint axis guide line shown while holding X/Y/Z in edit mode
  let axisGuideLine = null; // THREE.Line
  /**
   * Ensure the edit-mode axis guide helper exists in the scene.
   */
  function ensureAxisGuideLine() {
    if (axisGuideLine && axisGuideLine.isLine) return axisGuideLine;
    const geom = new THREE.BufferGeometry();
    // two points (start, end)
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xff4136, transparent: true, opacity: 0.5, depthTest: false });
    axisGuideLine = new THREE.Line(geom, mat);
    axisGuideLine.visible = false;
    axisGuideLine.renderOrder = 9999; // draw last
    contentGroup.add(axisGuideLine);
    return axisGuideLine;
  }
  /**
   * Return the world position of the currently selected draggable atom, if any.
   */
  function getSelectedAtomPosition() {
    if (dragActive && dragAtomIndex >= 0 && atomGroup.children[dragAtomIndex]) {
      return atomGroup.children[dragAtomIndex].position.clone();
    }
    if (hoverAtomMesh && hoverAtomMesh.position) return hoverAtomMesh.position.clone();
    return null;
  }
  /**
   * Update axis guide visibility, orientation, and placement during edit operations.
   */
  function updateAxisGuideLine() {
    try {
      const axis = axisKeyDown; // only show while key is held
      if (!editMode || !axis || !('xyz'.includes(axis))) { if (axisGuideLine) axisGuideLine.visible = false; return; }
      const pos = getSelectedAtomPosition();
      if (!pos) { if (axisGuideLine) axisGuideLine.visible = false; return; }
      ensureAxisGuideLine();
      // Determine extents along the chosen axis from current atom positions
      let minVal = Infinity, maxVal = -Infinity;
      if (atomGroup && atomGroup.children && atomGroup.children.length) {
        for (const ch of atomGroup.children) {
          if (!ch || !ch.position) continue;
          const v = axis === 'x' ? ch.position.x : axis === 'y' ? ch.position.y : ch.position.z;
          if (v < minVal) minVal = v;
          if (v > maxVal) maxVal = v;
        }
      }
      const centerVal = axis === 'x' ? pos.x : axis === 'y' ? pos.y : pos.z;
      if (!isFinite(minVal) || !isFinite(maxVal)) { minVal = centerVal - 10; maxVal = centerVal + 10; }
      const margin = 100; // set large margin // Math.max(0.5, (maxVal - minVal) * 0.1);
      minVal -= margin; maxVal += margin;
      const p0 = pos.clone();
      const p1 = pos.clone();
      if (axis === 'x') { p0.x = minVal; p1.x = maxVal; axisGuideLine.material.color.setHex(0xff4136); }
      else if (axis === 'y') { p0.y = minVal; p1.y = maxVal; axisGuideLine.material.color.setHex(0x2ecc40); }
      else { p0.z = minVal; p1.z = maxVal; axisGuideLine.material.color.setHex(0x0074d9); }
      const arr = axisGuideLine.geometry.getAttribute('position').array;
      arr[0] = p0.x; arr[1] = p0.y; arr[2] = p0.z;
      arr[3] = p1.x; arr[4] = p1.y; arr[5] = p1.z;
      axisGuideLine.geometry.attributes.position.needsUpdate = true;
      axisGuideLine.visible = true;
    } catch (e) { /* ignore */ }
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const canvasEl = document.getElementById('canvas');
  // --- Edit selection (temporary list) and visuals ---
  let editSel = []; // array of atom indices (max 3) — used in measurement mode
  let editSelGroup = new THREE.Group(); contentGroup.add(editSelGroup);
  // persistent selection halos (by atom index) for measurement mode
  const selHaloColor = 0xffa500;
  /**
   * Attach (or refresh) a visible selection halo around an atom mesh.
   * @param {THREE.Mesh} mesh
   */
  function ensureSelectHalo(mesh) {
    if (!mesh) return null;
    if (mesh.userData && mesh.userData.selectHalo) return mesh.userData.selectHalo;
    const haloGeom = mesh.geometry && mesh.geometry.clone ? mesh.geometry.clone() : null;
    if (!haloGeom) return null;
    const haloMat = new THREE.MeshBasicMaterial({ color: selHaloColor, side: THREE.BackSide, transparent: true, opacity: 0.6, depthWrite: false });
    const halo = new THREE.Mesh(haloGeom, haloMat);
    // Expand by a fixed world excess, same approach as hover halo
    let baseR = 0.5;
    try { if (mesh.geometry && mesh.geometry.parameters && typeof mesh.geometry.parameters.radius === 'number') baseR = mesh.geometry.parameters.radius; } catch { }
    const parentScale = (mesh.scale && mesh.scale.x) ? mesh.scale.x : 1.0;
    const worldR = Math.max(1e-6, baseR * parentScale);
    const k = 1.0 + (0.06 / worldR);
    halo.scale.set(k, k, k);
    halo.renderOrder = (mesh.renderOrder || 0) - 1;
    if (!mesh.userData) mesh.userData = {};
    mesh.userData.selectHalo = halo;
    mesh.add(halo);
    return halo;
  }
  /**
   * Remove and dispose a selection halo from an atom mesh.
   * @param {THREE.Mesh} mesh
   */
  function removeSelectHalo(mesh) {
    if (!mesh || !mesh.userData || !mesh.userData.selectHalo) return;
    const halo = mesh.userData.selectHalo; mesh.userData.selectHalo = null;
    try { mesh.remove(halo); disposeObj(halo); } catch { }
  }
  /**
   * Recompute which atoms should display persistent selection halos.
   */
  function updateSelectedHalos() {
    if (!atomGroup || !atomGroup.children) return;
    for (let i = 0; i < atomGroup.children.length; i++) {
      const mesh = atomGroup.children[i];
      const selected = editSel.includes(i);
      if (selected) ensureSelectHalo(mesh); else removeSelectHalo(mesh);
    }
  }
  let __editDownPt = null; let __editMoved = false; let __editClickIdx = -1;
  /**
   * Clear the current measurement/edit atom selection.
   */
  function clearEditSelection() { editSel = []; updateEditSelectionVisuals(); updateSelectedHalos(); }
  /**
   * Append an atom index to the current selection (up to 4 points).
   * @param {number} i
   */
  function addEditSelection(i) {
    if (i == null || i < 0) return;
    if (editSel.length >= 4) editSel = editSel.slice(1); // keep last 3, then push new -> last 4
    if (editSel.length && editSel[editSel.length - 1] === i) return; // ignore duplicate consecutive
    editSel.push(i);
    updateEditSelectionVisuals();
  }
  /**
   * Dispose geometry/material resources on a single object.
   * @param {THREE.Object3D} o
   */
  function disposeObj(o) {
    try { o.geometry && o.geometry.dispose && o.geometry.dispose(); } catch { }
    try { if (o.material && o.material.map && o.material.map.dispose) o.material.map.dispose(); } catch { }
    try { o.material && o.material.dispose && o.material.dispose(); } catch { }
  }
  /**
   * Dispose and remove all children of a group.
   * @param {THREE.Group} g
   */
  function clearGroup(g) {
    if (!g) return;
    for (let i = g.children.length - 1; i >= 0; i--) {
      const c = g.children[i];
      g.remove(c);
      disposeObj(c);
    }
  }
  /**
   * Create a screen-facing text sprite used for measurements/labels.
   * @param {string} txt
   * @returns {THREE.Sprite}
   */
  function makeTextSprite(txt) {
    // make a rounded rectangle canvas with text, then make a sprite from it
    const hpad = 6;
    const wpad = 8;
    const radius = 16; // px rounded corner radius (pre-scale)
    // make the font bold
    const font = 'bold 20px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    ctx.font = font;
    const textW = Math.ceil(ctx.measureText(txt).width);
    const w = textW + wpad * 2;
    const h = 18 + hpad * 2;
    // hi-DPI backing store
    c.width = w * 2; c.height = h * 2;
    ctx.scale(2, 2);
    ctx.font = font;

    // rounded rectangle background
    const rr = Math.min(radius, w / 2, h / 2);
    ctx.fillStyle = 'rgba(20,22,24,0.85)';
    ctx.beginPath();
    ctx.moveTo(rr, 0);
    ctx.arcTo(w, 0, w, h, rr);
    ctx.arcTo(w, h, 0, h, rr);
    ctx.arcTo(0, h, 0, 0, rr);
    ctx.arcTo(0, 0, w, 0, rr);
    ctx.closePath();
    ctx.fill();

    // text
    ctx.fillStyle = '#e8eef6';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, wpad, h / 2);

    // sprite from canvas
    const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const spr = new THREE.Sprite(mat);
    const scale = 0.008; // tune label size relative to pixels
    spr.scale.set(w * scale, h * scale, 1);
    return spr;
  }
  /**
   * Render distance, angle, and dihedral overlays for the current selection.
   */
  function updateEditSelectionVisuals() {
    clearGroup(editSelGroup);
    // Only render measurement overlays in measurement mode
    if (currentMode !== MODES.MEASURE || !atomGroup || !atomGroup.children || atomGroup.children.length === 0) return;
    /**
     * Get atom position by atom index.
     * @param {number} idx
     * @returns {THREE.Vector3|null}
     */
    const posOf = (idx) => (atomGroup.children[idx] && atomGroup.children[idx].position) ? atomGroup.children[idx].position.clone() : null;
    /**
     * Format a distance value for labels.
     * @param {number} d
     * @returns {string}
     */
    const fmtDist = (d) => d.toFixed(4) + ' Å';
    /**
     * Format an angle in radians as a degree label.
     * @param {number} r
     * @returns {string}
     */
    const fmtDeg = (r) => (r * 180 / Math.PI).toFixed(2) + '°';
    /**
     * Draw a measurement edge and midpoint distance label.
     * @param {number} i
     * @param {number} j
     * @param {number} color
     */
    const addEdge = (i, j, color = 0xd3d3d3) => {
      const a = posOf(i), b = posOf(j); if (!a || !b) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z]), 3));
      const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false });
      editSelGroup.add(new THREE.Line(g, m));
      // label at midpoint
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const dist = a.distanceTo(b);
      const label = makeTextSprite(fmtDist(dist));
      label.position.copy(mid);
      // slight lift towards camera to avoid z-fighting
      const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir); label.position.add(camDir.multiplyScalar(0.01));
      editSelGroup.add(label);
    };
    // Draw distances for adjacent pairs
    for (let t = 0; t < editSel.length - 1; t++) addEdge(editSel[t], editSel[t + 1]);

    // Helper to draw angle fan and numeric label for triplet a-b-c (angle at b)
    /**
     * Draw an angle fan and label for a three-atom selection.
     * @param {*} ia
     * @param {*} ib
     * @param {*} ic
     */
    const addAngle = (ia, ib, ic) => {
      const pa = posOf(ia), pb = posOf(ib), pc = posOf(ic);
      if (!pa || !pb || !pc) return;
      const v1 = pa.clone().sub(pb).normalize();
      const v2 = pc.clone().sub(pb).normalize();
      let dot = v1.dot(v2); dot = Math.max(-1, Math.min(1, dot));
      const theta = Math.acos(dot);
      const n = new THREE.Vector3().crossVectors(v1, v2);
      if (n.lengthSq() < 1e-8 || !isFinite(theta) || theta <= 0) return;
      n.normalize();
      const e1 = v1.clone();
      const e3 = n.clone();
      const e2 = new THREE.Vector3().crossVectors(e3, e1).normalize();
      const radius = Math.max(0.4, Math.min(pa.distanceTo(pb), pc.distanceTo(pb)) * 0.45);
      const segs = 48;
      const geom = new THREE.CircleGeometry(radius, segs, 0, theta);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffa500, transparent: true, opacity: 0.35, depthTest: false, side: THREE.DoubleSide });
      const fan = new THREE.Mesh(geom, mat);
      const basis = new THREE.Matrix4(); basis.makeBasis(e1, e2, e3);
      const q = new THREE.Quaternion().setFromRotationMatrix(basis);
      fan.quaternion.copy(q);
      fan.position.copy(pb.clone().add(e3.clone().multiplyScalar(0.002)));
      editSelGroup.add(fan);
      // Angle label at arc midpoint
      const midDir = e1.clone().multiplyScalar(Math.cos(theta / 2)).add(e2.clone().multiplyScalar(Math.sin(theta / 2)));
      const label = makeTextSprite(fmtDeg(theta));
      label.position.copy(pb.clone().add(midDir.multiplyScalar(radius + 0.06)));
      editSelGroup.add(label);
    };

    if (editSel.length >= 3) {
      for (let t = 0; t <= editSel.length - 3; t++) addAngle(editSel[t], editSel[t + 1], editSel[t + 2]);
    }

    // Dihedral for four atoms: 1-2-3-4
    if (editSel.length >= 4) {
      const i = editSel[0], j = editSel[1], k = editSel[2], l = editSel[3];
      const p1 = posOf(i), p2 = posOf(j), p3 = posOf(k), p4 = posOf(l);
      if (p1 && p2 && p3 && p4) {
        // Bond vectors
        const b1 = p2.clone().sub(p1);
        const b2 = p3.clone().sub(p2);
        const b3 = p4.clone().sub(p3);
        // Axis of rotation (normalized 2->3)
        const u = b2.clone().normalize();
        if (!isFinite(u.length()) || u.lengthSq() < 1e-10) { /* skip */ }
        else {
          // Project (-b1) and (b3) onto plane perpendicular to u (spanning vectors)
          const vAraw = b1.clone().negate();
          const vBraw = b3.clone();
          const vA = vAraw.clone().sub(u.clone().multiplyScalar(vAraw.dot(u)));
          const vB = vBraw.clone().sub(u.clone().multiplyScalar(vBraw.dot(u)));
          const lenA = vA.length(), lenB = vB.length();
          if (lenA > 1e-6 && lenB > 1e-6) {
            vA.multiplyScalar(1 / lenA);
            vB.multiplyScalar(1 / lenB);
            // Signed dihedral angle φ from vA -> vB around axis u
            const cosPhi = vA.dot(vB);
            const sinPhi = u.dot(new THREE.Vector3().crossVectors(vA, vB));
            const phi = Math.atan2(sinPhi, cosPhi); // [-pi, pi]
            const mid = p2.clone().add(p3).multiplyScalar(0.5);
            // Local basis: eZ along u, eX along vA, eY = eZ × eX
            const eZ = u.clone();
            const eX = vA.clone();
            const eY = new THREE.Vector3().crossVectors(eZ, eX).normalize();
            // Arc parameters so ends align with vA and vB
            const thetaStart = (phi < 0 ? phi : 0);
            const thetaLen = Math.abs(phi);
            const segs = 64;
            const radius = Math.max(0.35, Math.min(b2.length() * 0.35, 1.2));
            const geom = new THREE.CircleGeometry(radius, segs, thetaStart, thetaLen);
            const mat = new THREE.MeshBasicMaterial({ color: 0x8e44ad, transparent: true, opacity: 0.35, depthTest: false, side: THREE.DoubleSide });
            const fan = new THREE.Mesh(geom, mat);
            const basis = new THREE.Matrix4().makeBasis(eX, eY, eZ);
            fan.quaternion.setFromRotationMatrix(basis);
            fan.position.copy(mid.clone().add(eZ.clone().multiplyScalar(0.002)));
            editSelGroup.add(fan);
            // Emphasize the central bond axis
            addEdge(j, k, 0x8e44ad);
            // Dihedral label (abs degrees, 2 digits) along arc bisector
            const half = phi / 2;
            const midDir = eX.clone().multiplyScalar(Math.cos(half)).add(eY.clone().multiplyScalar(Math.sin(half))).normalize();
            const label = makeTextSprite(fmtDeg(Math.abs(phi)));
            label.position.copy(mid.clone().add(midDir.multiplyScalar(radius + 0.08)));
            editSelGroup.add(label);
          }
        }
      }
    }
  }
  /**
   * Update normalized device coordinates from a pointer event.
   * @param {PointerEvent} e
   */
  function setNDCFromEvent(e) {
    const rect = canvasEl.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }
  /**
   * Update hover highlighting for the currently pointed atom mesh.
   * @param {THREE.Mesh|null} mesh
   */
  function setHover(mesh) {
    if (hoverAtomMesh === mesh) return;
    // Remove previous halo
    if (hoverAtomMesh && hoverAtomMesh.userData && hoverAtomMesh.userData.hoverHalo) {
      const halo = hoverAtomMesh.userData.hoverHalo;
      hoverAtomMesh.remove(halo);
      try { halo.geometry && halo.geometry.dispose && halo.geometry.dispose(); } catch { }
      try { halo.material && halo.material.dispose && halo.material.dispose(); } catch { }
      hoverAtomMesh.userData.hoverHalo = null;
    }
    hoverAtomMesh = null;
    // Add orange halo to new mesh
    if (mesh && mesh.isMesh && mesh.geometry) {
      const haloGeom = mesh.geometry.clone();
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0x00a5ff,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
      const halo = new THREE.Mesh(haloGeom, haloMat);
      // Expand by a fixed world excess (e.g., 0.06 Å) regardless of atom size
      const excess = 0.06; // Å
      let baseR = 0.5; // our atom SphereGeometry radius
      try {
        if (mesh.geometry && mesh.geometry.parameters && typeof mesh.geometry.parameters.radius === 'number') {
          baseR = mesh.geometry.parameters.radius;
        }
      } catch { }
      const parentScale = (mesh.scale && mesh.scale.x) ? mesh.scale.x : 1.0; // atoms are uniformly scaled
      const worldR = Math.max(1e-6, baseR * parentScale);
      const k = 1.0 + (excess / worldR); // child local scale factor so that R*k = R + excess
      halo.scale.set(k, k, k);
      halo.renderOrder = (mesh.renderOrder || 0) - 1;
      mesh.add(halo);
      if (!mesh.userData) mesh.userData = {};
      mesh.userData.hoverHalo = halo;
      hoverAtomMesh = mesh;
    }
    // If user is holding an axis key, keep the guide line in sync
    updateAxisGuideLine();
  }
  /**
   * Clear hover highlight state.
   */
  function clearHover() { setHover(null); }

  // (axis lock uses simple axis component of the view-plane delta)

  /**
   * Refresh the axis-lock button visibility and active state.
   */
  function updateAxisButtons() {
    if (!axisLockEl) return;
    axisLockEl.style.display = editMode ? 'flex' : 'none';
    /**
     * Toggle the active class for one axis-lock button.
     * @param {HTMLElement} btn
     * @param {boolean} on
     */
    const set = (btn, on) => { if (!btn) return; btn.classList.toggle('active', !!on); };
    set(axisXBtn, axisLock === 'x'); set(axisYBtn, axisLock === 'y'); set(axisZBtn, axisLock === 'z');
  }
  if (axisXBtn) axisXBtn.onclick = () => { axisLock = (axisLock === 'x' ? 'none' : 'x'); updateAxisButtons(); };
  if (axisYBtn) axisYBtn.onclick = () => { axisLock = (axisLock === 'y' ? 'none' : 'y'); updateAxisButtons(); };
  if (axisZBtn) axisZBtn.onclick = () => { axisLock = (axisLock === 'z' ? 'none' : 'z'); updateAxisButtons(); };

  /**
   * Raycast and return the first intersected atom mesh under the pointer.
   * @param {PointerEvent} e
   * @returns {THREE.Intersection|null}
   */
  function pickAtom(e) {
    if (!atomGroup || !atomGroup.children || atomGroup.children.length === 0) return null;
    setNDCFromEvent(e);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(atomGroup.children, false);
    return hits.length > 0 ? hits[0].object : null;
  }

  let __lastBondUpdate = 0;
  canvasEl.addEventListener('pointermove', (e) => {
    // Allow hover highlighting in Edit and Measurement modes
    const allowHover = (currentMode === MODES.EDIT || currentMode === MODES.MEASURE);
    if (!allowHover) return;
    // Track movement to distinguish click vs drag in measurement mode
    if (currentMode === MODES.MEASURE && __editDownPt) {
      const dx = e.clientX - __editDownPt.x, dy = e.clientY - __editDownPt.y;
      if (Math.hypot(dx, dy) > 4) __editMoved = true;
    }
    if (dragActive) {
      __editMoved = true;
      setNDCFromEvent(e);
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      let newPos = null;
      if (dragPlane && raycaster.ray.intersectPlane(dragPlane, hit)) {
          const move = hit.clone().sub(dragPlaneStart);
          if (dragAxis !== 'none') {
            const ax = dragAxis === 'x' ? new THREE.Vector3(1, 0, 0) : dragAxis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
            const t = move.dot(ax);
            newPos = dragStartPos.clone().add(ax.multiplyScalar(t));
          } else {
            newPos = dragStartPos.clone().add(move);
          }
      }
      if (newPos) {
        // Apply to mesh and data (defer full rebuild until pointerup to avoid flicker)
        if (dragAtomIndex >= 0 && atomGroup.children[dragAtomIndex]) {
          const m = atomGroup.children[dragAtomIndex];
          m.position.copy(newPos);
          const vol = volumes[currentIndex]?.vol; if (vol) {
            const arr = worldToAtomUnits(vol, newPos);
            const a = vol.atoms[dragAtomIndex];
            a.x = arr[0]; a.y = arr[1]; a.z = arr[2];
          }
          // Update bonds by rescanning (bonds only) at ~30 FPS
          const now = performance.now();
          if (now - __lastBondUpdate > 33) { rebuildBondsFromAtoms(); __lastBondUpdate = now; }
        }
        // Move the guide line with the dragged atom
        updateAxisGuideLine();
        // Update selection overlays if any
        updateEditSelectionVisuals();
      }
      return;
    }
    const obj = pickAtom(e);
    setHover(obj);
  });

  canvasEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    __editDownPt = { x: e.clientX, y: e.clientY }; __editMoved = false; __editClickIdx = -1;
    const obj = pickAtom(e);
    if (currentMode === MODES.EDIT) {
      if (!obj || !obj.userData) return;
      dragAtomIndex = obj.userData.index | 0;
      __editClickIdx = dragAtomIndex;
      dragActive = true;
      controls.enabled = false;
      dragStartPos = obj.position.clone();
      dragOrigMeshPos = obj.position.clone();
      const vol = volumes[currentIndex]?.vol; if (vol) {
        const a = vol.atoms[dragAtomIndex];
        dragOrigAtomUnits = [a.x, a.y, a.z];
      }
      const normal = new THREE.Vector3();
      // plane orthogonal to camera-to-target axis
      camera.getWorldDirection(normal);
      dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, dragStartPos);
      const hit = new THREE.Vector3(); raycaster.ray.intersectPlane(dragPlane, hit);
      dragPlaneStart = hit.clone();
      dragAxis = axisLock;
      // Update guide line at drag start if an axis key is held
      updateAxisGuideLine();
      e.preventDefault();
    } else if (currentMode === MODES.MEASURE) {
      if (!obj || !obj.userData) { __editClickIdx = -1; return; }
      __editClickIdx = obj.userData.index | 0;
      // Pause rotation while making a measurement selection
      try { controls.enableRotate = false; } catch { }
      // selection is applied on pointerup if not moved
    }
  });

  canvasEl.addEventListener('pointerup', (e) => {
    if (currentMode === MODES.EDIT) {
      const wasDragging = dragActive;
      if (wasDragging) {
        // Final rebuild to update bonds/geometry once after drag
        rebuildScene({ preserveView: true });
        dragActive = false; dragAtomIndex = -1; dragPlane = null; dragPlaneStart = null; dragStartPos = null; dragOrigMeshPos = null; dragOrigAtomUnits = null; dragAxis = 'none';
        controls.enabled = true;
        if (editMode) renderRibbon('edit');
        // Refresh/hide guide line after drag ends
        updateAxisGuideLine();
        updateEditSelectionVisuals();
      }
    } else if (currentMode === MODES.MEASURE) {
      // Resume rotation after selection gesture
      try { controls.enableRotate = true; } catch { }
      // Click (no significant motion) selects/accumulates
      if (!__editMoved && __editClickIdx >= 0) {
        addEditSelection(__editClickIdx);
        updateSelectedHalos();
        updateEditSelectionVisuals();
      }
    }
    __editDownPt = null; __editClickIdx = -1; __editMoved = false;
  });

  // Reset view to the initial camera/target/shift
  viewReset.onclick = () => {
    if (defaultView) {
      contentGroup.position.copy(defaultView.contentPos);
      camera.copy(defaultView.cam);
      controls.target.copy(defaultView.target);
      controls.update();
      refreshViewUI();
    } else {
      fitCameraToScene();
      refreshViewUI();
    }
  };

  // --- Shortcut bindings ---
  // Global: help toggle
  /**
   * Toggle the help modal open/closed.
   */
  const toggleHelp = () => { if (helpOverlay && helpOverlay.style.display !== 'flex') openHelp(); else closeHelp(); };
  bind('down', 'global', 'h', () => toggleHelp());
  bind('down', 'global', '?', () => toggleHelp());

  // Global: save, batch, toggle surfaces/axes
  bind('down', 'global', 's', () => saveBtn && saveBtn.click());
  bind('down', 'global', 'b', () => batchBtn && batchBtn.click());
  bind('down', 'global', 'i', () => { showSurfaces = !showSurfaces; if (typeof updateSurfBtn === 'function') updateSurfBtn(); rebuildScene({ preserveView: true }); });
  bind('down', 'global', 'a', () => { window.__showAxes__ = !window.__showAxes__; if (toggleAxes) toggleAxes.checked = !!window.__showAxes__; });
  // Global: molecule style presets (1=Default, 2=Toon, 3=Kit, 4=Glossy)
  bind('down', 'global', '1', () => setMoleculeStyle('default'));
  bind('down', 'global', '2', () => setMoleculeStyle('fancy'));
  bind('down', 'global', '3', () => setMoleculeStyle('studio'));
  bind('down', 'global', '4', () => setMoleculeStyle('glossy'));

  // Global: arrows switch files
  /**
   * Move to the next/previous loaded file.
   * @param {number} delta
   */
  const nextPrev = (delta) => {
    if (isTypingInInput()) return;
    if (!Array.isArray(volumes) || volumes.length === 0) return;
    const n = volumes.length;
    currentIndex = ((currentIndex + delta) % n + n) % n;
    if (fileSelect) fileSelect.value = String(currentIndex);
    rebuildScene({ preserveView: true });
    updateSidePanel();
  };
  bind('down', 'global', 'ArrowRight', () => nextPrev(1));
  bind('down', 'global', 'ArrowDown', () => nextPrev(1));
  bind('down', 'global', 'ArrowLeft', () => nextPrev(-1));
  bind('down', 'global', 'ArrowUp', () => nextPrev(-1));

  // Note: Esc handling removed per request. Use on-screen UI to close dialogs.

  // Display mode bindings
  bind('down', MODES.DISPLAY, 'e', () => { setMode(MODES.EDIT); });
  bind('down', MODES.DISPLAY, 'm', () => { setMode(MODES.MEASURE); });
  // Show View/Coords side panel in standard (display) mode
  bind('down', MODES.DISPLAY, 'v', () => { openSide(); });

  // Edit mode bindings
  bind('down', MODES.EDIT, 'e', () => { setMode(MODES.DISPLAY); });
  bind('down', MODES.EDIT, 'm', () => { setMode(MODES.MEASURE); });
  /**
   * Enable temporary axis lock while an axis key is held.
   * @param {'x'|'y'|'z'} axis
   */
  const axisDown = (axis) => { axisKeyDown = axis; axisLock = axis; updateAxisButtons(); if (dragActive) dragAxis = axisLock; updateAxisGuideLine && updateAxisGuideLine(); };
  /**
   * Disable temporary axis lock when an axis key is released.
   * @param {'x'|'y'|'z'} axis
   */
  const axisUp = (axis) => { if (axisKeyDown === axis) { axisKeyDown = null; axisLock = 'none'; updateAxisButtons(); if (dragActive) dragAxis = axisLock; updateAxisGuideLine && updateAxisGuideLine(); } };
  bind('down', MODES.EDIT, 'x', () => axisDown('x'));
  bind('down', MODES.EDIT, 'y', () => axisDown('y'));
  bind('down', MODES.EDIT, 'z', () => axisDown('z'));
  bind('up', MODES.EDIT, 'x', () => axisUp('x'));
  bind('up', MODES.EDIT, 'y', () => axisUp('y'));
  bind('up', MODES.EDIT, 'z', () => axisUp('z'));

  // Measurement mode bindings
  bind('down', MODES.MEASURE, 'm', () => { setMode(MODES.DISPLAY); });
  // Esc clears current measurement selection (but does not change mode)
  bind('down', MODES.MEASURE, 'Escape', () => { clearEditSelection(); updateSelectedHalos(); updateEditSelectionVisuals(); });

  // Global key listeners delegate to router
  window.addEventListener('keydown', (e) => routeShortcut(e, 'down', currentMode));
  window.addEventListener('keyup', (e) => routeShortcut(e, 'up', currentMode));

  /**
   * Keep the surface-style control aligned with the active molecule style.
   * Toon mode drives surfaces through toon shading.
   */
  function syncSurfaceStyleControlState() {
    if (!styleSelect) return;
    const toonSurfaces = useToonSurfaceStyle();
    styleSelect.disabled = toonSurfaces;
    styleSelect.title = toonSurfaces
      ? 'Disabled: Toon molecule style enforces toon surfaces'
      : 'Choose iso-surface material style';
  }

  /**
   * Show or hide one mode-scoped control row and configure its input state.
   * @param {HTMLElement|null} rowEl
   * @param {HTMLInputElement|HTMLSelectElement|null} inputEl
   * @param {boolean} enabled
   * @param {string} enabledTitle
   * @param {string} disabledTitle
   */
  function syncConditionalControlState(rowEl, inputEl, enabled, enabledTitle, disabledTitle) {
    if (rowEl) rowEl.style.display = enabled ? '' : 'none';
    if (!inputEl) return;
    inputEl.disabled = !enabled;
    inputEl.title = enabled ? enabledTitle : disabledTitle;
  }

  /**
   * Show glossy-only controls when the glossy molecule style is active.
   */
  function syncGlossyStyleControlsState() {
    const enabled = useGlossyMoleculeStyle();
    syncConditionalControlState(
      rowGlossyBond,
      glossyBondRadiusEl,
      enabled,
      'Center radius for glossy bond connectors (angstrom)',
      'Available when Molecule style is Glossy'
    );
  }

  /**
   * Bind a numeric input to a clamped state value with optional live scene rebuild.
   * @param {HTMLInputElement|null} inputEl
   * @param {() => number} getClampedValue
   * @param {(n:number) => void} setValue
   * @param {(() => boolean)=} shouldRebuild
   */
  function bindClampedNumericInput(inputEl, getClampedValue, setValue, shouldRebuild) {
    if (!inputEl) return;
    const syncFromState = () => {
      const clamped = getClampedValue();
      setValue(clamped);
      inputEl.value = String(clamped);
    };
    const applyInput = () => {
      const parsed = Number(inputEl.value);
      if (Number.isFinite(parsed)) setValue(parsed);
      syncFromState();
      if (typeof shouldRebuild === 'function' && shouldRebuild()) {
        rebuildScene({ preserveView: true });
      }
    };
    syncFromState();
    inputEl.onchange = applyInput;
    // `input` enables immediate feedback while keeping logic centralized.
    inputEl.oninput = applyInput;
  }

  /**
   * Apply lighting and control-state updates that depend on `moleculeStyle`.
   */
  function applyMoleculeStyleUiState() {
    applyMoleculeStyleLighting();
    syncSurfaceStyleControlState();
    syncGlossyStyleControlsState();
  }

  // Surface style selector
  if (styleSelect) {
    styleSelect.value = surfaceStyle;
    styleSelect.onchange = () => { surfaceStyle = styleSelect.value; rebuildScene({ preserveView: true }); };
  }
  bindClampedNumericInput(
    glossyBondRadiusEl,
    getGlossyBondCenterRadius,
    (n) => { glossyBondRadius = n; },
    useGlossyMoleculeStyle
  );
  if (moleculeStyleSel) {
    moleculeStyle = moleculeStyleSel.value || moleculeStyle;
    moleculeStyleSel.value = moleculeStyle;
    applyMoleculeStyleUiState();
    moleculeStyleSel.onchange = () => {
      setMoleculeStyle(moleculeStyleSel.value || 'default');
    };
  } else {
    applyMoleculeStyleUiState();
  }
  if (componentSelect) {
    componentSelect.onchange = () => {
      const comp = componentSelect.value;
      applyGlobal2CComponent(comp);
      rebuildScene({ preserveView: true });
    };
  }

  // Default color schemes for +/- surfaces
  if (schemeSelect) {
    const schemes = {
      emory: { pos: '#f2a900', neg: '#0033a0' },
      national: { pos: '#e60000', neg: '#0033a0' },
      bright: { pos: '#ffcc00', neg: '#00bfff' },
      electron: { pos: '#ff00bf', neg: '#2eb82e' },
      classic: { pos: '#1f77b4', neg: '#d62728' },
    };
    schemeSelect.onchange = () => {
      const v = schemeSelect.value;
      const s = schemes[v];
      if (s) {
        posColor.value = s.pos;
        negColor.value = s.neg;
        updateOpacityAndColors();
      }
    };
  }

  // Render mode / cloud params
  let renderMode = (renderModeSel && renderModeSel.value) || 'surface';
  let cloudType = (cloudTypeSel && cloudTypeSel.value) || 'cubes';
  /**
   * Show/hide control rows based on whether surface or cloud mode is active.
   */
  function updateRenderModeUI() {
    const isCloud = renderMode === 'cloud';
    const rowStyle = document.getElementById('rowStyle');
    const rowCloudType = document.getElementById('rowCloudType');
    const rowCloudParams = document.getElementById('rowCloudParams');
    if (rowStyle) rowStyle.style.display = isCloud ? 'none' : '';
    if (rowCloudType) rowCloudType.style.display = isCloud ? '' : 'none';
    if (rowCloudParams) rowCloudParams.style.display = isCloud ? '' : 'none';
  }
  /**
   * Read and normalize cloud-rendering options from UI controls.
   * @returns {{type:string,stride:number,tLow:number,alphaMax:number}}
   */
  function readCloudOpts() {
    const iso = Math.abs(parseFloat((isoInput && isoInput.value) || '0')) || 0;
    return {
      type: cloudType,
      stride: Math.max(1, parseInt((cloudStrideEl && cloudStrideEl.value) || '2', 10)),
      tLow: iso > 0 ? iso : 1e-6, // threshold tied to iso value
      alphaMax: Math.min(1, Math.max(0.05, parseFloat((cloudAlphaEl && cloudAlphaEl.value) || '0.05'))),
    };
  }
  if (renderModeSel) renderModeSel.onchange = () => { renderMode = renderModeSel.value; updateRenderModeUI(); rebuildScene({ preserveView: true }); };
  if (cloudTypeSel) cloudTypeSel.onchange = () => { cloudType = cloudTypeSel.value; rebuildScene({ preserveView: true }); };
  if (cloudStrideEl) cloudStrideEl.onchange = () => rebuildScene({ preserveView: true });
  if (cloudAlphaEl) cloudAlphaEl.onchange = () => rebuildScene({ preserveView: true });
  // Initialize UI visibility based on current mode
  updateRenderModeUI();

  // Axes gizmo state
  window.__showAxes__ = true;
  if (toggleAxes) toggleAxes.checked = !!window.__showAxes__;

  // Apply handlers
  /**
   * Parse a numeric input with fallback default.
   * @param {string|number} v
   * @param {number} def
   * @returns {number}
   */
  const toNum = (v, def = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : def; };
  for (const el of [shiftX, shiftY, shiftZ]) {
    el.oninput = () => {
      contentGroup.position.set(toNum(shiftX.value, 0), toNum(shiftY.value, 0), toNum(shiftZ.value, 0));
    };
  }
  for (const el of [camX, camY, camZ]) {
    el.oninput = () => {
      camera.position.set(toNum(camX.value, camera.position.x), toNum(camY.value, camera.position.y), toNum(camZ.value, camera.position.z));
      controls.update();
    };
  }
  for (const el of [tgtX, tgtY, tgtZ]) {
    el.oninput = () => {
      controls.target.set(toNum(tgtX.value, controls.target.x), toNum(tgtY.value, controls.target.y), toNum(tgtZ.value, controls.target.z));
      controls.update();
    };
  }
  autoRot.onchange = () => { controls.autoRotate = !!autoRot.checked; };
  rotSpeed.oninput = () => { const v = toNum(rotSpeed.value, 1.0); if (Number.isFinite(v)) controls.rotateSpeed = v; };
  damp.oninput = () => { const v = toNum(damp.value, 0.05); if (Number.isFinite(v)) controls.dampingFactor = v; };
  autoRotSpeed.oninput = () => { const v = toNum(autoRotSpeed.value, 2.0); if (Number.isFinite(v)) controls.autoRotateSpeed = v; };

  /**
   * Refresh coordinates panel contents for the active file.
   */
  function updateSidePanel() {
    const record = currentIndex >= 0 ? volumes[currentIndex] : null;
    coordsContent.innerHTML = renderCoordsContent(record, BOHR_TO_ANG, window.ATOM_Z_TO_DATA);
  }

  /**
   * Build XYZ text for the active record.
   * @returns {string}
   */
  function toXYZString() {
    const record = currentIndex >= 0 ? volumes[currentIndex] : null;
    return volumeToXYZ(record, BOHR_TO_ANG, window.ATOM_Z_TO_DATA);
  }

  copyXYZBtn.onclick = async () => {
    const txt = toXYZString();
    if (!txt) return;
    try {
      await navigator.clipboard.writeText(txt);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { }
      document.body.removeChild(ta);
    }
  };

  downloadXYZBtn.onclick = () => {
    const txt = toXYZString();
    if (!txt) return;
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const base = volumes[currentIndex] ? volumes[currentIndex].name.replace(/\.[^/.]+$/, '') : 'coords';
    a.download = `${base}.xyz`;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * Parse and append newly selected/dropped files, then focus the first added file.
   * Existing demo/sample placeholder data is removed before importing user files.
   * @param {FileList|File[]} fileList
   * @returns {Promise<void>}
   */
  async function handleFiles(fileList) {
    const arr = Array.from(fileList);
    // If demo is present and this is the first real load, clear it
    if (volumes.length === 1 && volumes[0].name === 'Demo Water') {
      console.log('[CUBE] Replacing demo with loaded file(s).');
      volumes = [];
      currentIndex = -1;
      clearSceneMeshes();
    }
    // Remove sample cube if present
    if (volumes.some(v => v.isSample)) {
      console.log('[CUBE] Removing sample.cube from list before adding user files.');
      volumes = volumes.filter(v => !v.isSample);
      currentIndex = -1;
      clearSceneMeshes();
    }
    const startIndex = volumes.length; // index of first newly added
    for (const f of arr) {
      const text = await f.text();
      const lower = f.name.toLowerCase();
      let vol;
      if (lower.endsWith('.xyz')) vol = parseXYZ(text);
      else if (lower.endsWith('.2ccube')) vol = parseTwoComponentCube(text);
      else vol = parseCube(text);
      const meta = { name: f.name, vol };
      if (vol && vol.isTwoComponent) setVolume2CComponent(meta, global2CComponentMode);
      volumes.push(meta);
      // adopt hinted iso if the user hasn’t interacted yet
      if (vol.isoHint != null && (isoInput.value === '' || currentIndex === -1)) {
        isoInput.value = String(vol.isoHint);
      }
      // Debug: print parsed volume info
      if (vol.data && vol.data.length) {
        try {
          const stats = arrayMinMax(vol.data);
          console.log('[CUBE] Loaded', f.name, { title: vol.title, nxyz: vol.nxyz, origin: vol.origin, axes: vol.axes, natoms: vol.natoms, isoHint: vol.isoHint, min: stats.min, max: stats.max });
        } catch (e) {
          console.warn('[CUBE] Stats failed for', f.name, e);
        }
      } else {
        console.log('[XYZ] Loaded', f.name, { natoms: vol.natoms });
      }
    }
    refreshFileSelect();
    if (volumes.length > 0) {
      // Select the first of the newly added files
      currentIndex = startIndex;
      if (fileSelect && fileSelect.options.length > currentIndex) {
        fileSelect.value = String(currentIndex);
      }
      rebuildScene();
      updateSidePanel();
    }
  }

  fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
  const drop = document.getElementById('drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  drop.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files) handleFiles(e.dataTransfer.files); });
  // Close side panel when clicking on the scene (not during drags)
  let downPos = null;
  drop.addEventListener('pointerdown', (e) => {
    if (e.button === 0) downPos = { x: e.clientX, y: e.clientY };
    else downPos = null;
  });
  drop.addEventListener('pointerup', (e) => {
    if (!sidePanel.classList.contains('open')) { downPos = null; return; }
    if (!downPos) return;
    const dx = e.clientX - downPos.x, dy = e.clientY - downPos.y;
    const moved = Math.hypot(dx, dy) > 4; // threshold to distinguish drag
    downPos = null;
    if (!moved) closeSide();
  });

  // Clear cubes and show sample again
  clearBtn.onclick = async () => {
    volumes = [];
    currentIndex = -1;
    refreshFileSelect();
    clearSceneMeshes();
    const ok = await loadSampleCube();
    if (!ok) loadDemo();
  };

  /**
   * Rebuild the file selector options from the current `volumes` list.
   */
  function refreshFileSelect() {
    fileSelect.innerHTML = "";
    volumes.forEach((v, i) => {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = v.name;
      fileSelect.appendChild(opt);
    });
    if (currentIndex >= 0) fileSelect.value = currentIndex;
  }

  fileSelect.onchange = () => {
    currentIndex = parseInt(fileSelect.value, 10);
    // Preserve camera view (position, orientation, zoom) when switching files
    rebuildScene({ preserveView: true });
    updateSidePanel();
  };

  // (subsample controls removed)

  isoInput.onchange = () => rebuildScene({ preserveView: true });
  opInput.oninput = updateOpacityAndColors;
  posColor.oninput = () => { if (typeof schemeSelect !== 'undefined' && schemeSelect) schemeSelect.value = 'custom'; updateOpacityAndColors(); };
  negColor.oninput = () => { if (typeof schemeSelect !== 'undefined' && schemeSelect) schemeSelect.value = 'custom'; updateOpacityAndColors(); };
  bgColor.oninput = () => {
    // Update scene background to selected color
    try { scene.background = new THREE.Color(bgColor.value); } catch { }
  };
  toggleAtoms.onchange = () => rebuildScene({ preserveView: true });
  toggleBonds.onchange = () => rebuildScene({ preserveView: true });
  elementColors.onchange = () => rebuildScene({ preserveView: true });
  toggleBox.onchange = () => rebuildScene({ preserveView: true });
  if (toggleAxes) toggleAxes.onchange = () => { window.__showAxes__ = !!toggleAxes.checked; };

  /**
   * Check whether a 2C component mode maps directly to one raw data channel.
   * @param {string} compMode
   * @returns {boolean}
   */
  function isRaw2CComponent(compMode) {
    return compMode === 'alphaRe' || compMode === 'alphaIm' || compMode === 'betaRe' || compMode === 'betaIm';
  }

  /**
   * Apply a selected 2C component mode to one loaded volume record.
   * For raw-channel modes, `vol.data` is pointed at the chosen channel array.
   * @param {{vol?:any,component?:string}} record
   * @param {string} compMode
   */
  function setVolume2CComponent(record, compMode) {
    if (!record || !record.vol || !record.vol.isTwoComponent) return;
    record.component = compMode;
    if (isRaw2CComponent(compMode)) {
      record.vol.data = record.vol[compMode] || record.vol.alphaRe;
    }
  }

  /**
   * Apply one 2C component mode across all loaded two-component files.
   * @param {string} compMode
   */
  function applyGlobal2CComponent(compMode) {
    global2CComponentMode = compMode || 'alphaRe';
    for (const record of volumes) setVolume2CComponent(record, global2CComponentMode);
  }

  /**
   * Resolve the active component mode for the current file.
   * @param {{isTwoComponent?:boolean}} vol
   * @returns {string}
   */
  function getComponentMode(vol) {
    return (vol && vol.isTwoComponent) ? (volumes[currentIndex].component || global2CComponentMode || 'alphaRe') : 'alphaRe';
  }

  /**
   * Point `vol.data` to the active raw component when a raw mode is selected.
   * @param {{isTwoComponent?:boolean,data?:Float32Array,alphaRe?:Float32Array}} vol
   * @param {string} compMode
   */
  function selectActiveRawComponent(vol, compMode) {
    if (!vol || !vol.isTwoComponent) return;
    if (isRaw2CComponent(compMode)) {
      vol.data = vol[compMode] || vol.alphaRe;
    }
  }

  /**
   * Register and attach a rendered surface mesh to scene content.
   * @param {THREE.Mesh} mesh
   */
  function addSurfaceMesh(mesh) {
    contentGroup.add(mesh);
    meshes.push(mesh);
  }

  /**
   * Render isosurfaces for two-component phase/Bloch visualization modes.
   * @param {*} vol
   * @param {string} compMode
   * @param {number} iso
   * @param {number} opacity
   */
  function renderTwoComponentSurfaces(vol, compMode, iso, opacity) {
    if (compMode === 'alphaPhase' || compMode === 'betaPhase') {
      const which = compMode === 'alphaPhase' ? 'alpha' : 'beta';
      const re = which === 'alpha' ? vol.alphaRe : vol.betaRe;
      const im = which === 'alpha' ? vol.alphaIm : vol.betaIm;
      if (maxMagnitude(re, im) >= iso) {
        const geom = make2CPhaseIsosurface(vol, which, iso);
        const mat = createIsoMaterial2C(opacity);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.userData = { phaseHue: true, which };
        addSurfaceMesh(mesh);
      }
      return;
    }

    if (compMode === 'alphaBetaPhase') {
      const { maxA, maxB } = getAlphaBetaMagnitudeMaxima(vol);
      if (maxA >= iso) {
        const geomA = make2CPhaseIsosurface(vol, 'alpha', iso);
        const meshA = new THREE.Mesh(geomA, createIsoMaterial2C(opacity));
        meshA.userData = { phaseHue: true, which: 'alpha' };
        addSurfaceMesh(meshA);
      }
      if (maxB >= iso) {
        const geomB = make2CPhaseIsosurface(vol, 'beta', iso);
        const meshB = new THREE.Mesh(geomB, createIsoMaterial2C(opacity));
        meshB.userData = { phaseHue: true, which: 'beta' };
        addSurfaceMesh(meshB);
      }
      return;
    }

    if (compMode === 'totalBloch' && maxTotalDensity(vol) >= iso) {
      const geom = make2CTotalColoredIsosurface(vol, iso);
      const mat = createIsoMaterial2C(opacity);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.userData = { phaseHue: true, totalBloch: true };
      addSurfaceMesh(mesh);
    }
  }

  /**
   * Render positive and/or negative scalar isosurfaces for standard volumes.
   * @param {*} vol
   * @param {number} iso
   * @param {number} min
   * @param {number} max
   * @param {THREE.Material} posMat
   * @param {THREE.Material} negMat
   */
  function renderStandardSurfaces(vol, iso, min, max, posMat, negMat) {
    if (max >= iso) {
      const geomP = makeIsosurface(vol, iso);
      const meshP = new THREE.Mesh(geomP, posMat);
      meshP.userData.sign = 'pos';
      addSurfaceMesh(meshP);
      if (geomP.index) console.log('[ISO+] triangles', (geomP.index.count / 3) | 0);
    }
    if (min <= -iso) {
      const geomN = makeIsosurface(vol, -iso);
      const meshN = new THREE.Mesh(geomN, negMat);
      meshN.userData.sign = 'neg';
      addSurfaceMesh(meshN);
      if (geomN.index) console.log('[ISO-] triangles', (geomN.index.count / 3) | 0);
    }
  }

  /**
   * Render cloud geometry for scalar and 2C modes according to UI settings.
   * @param {*} vol
   * @param {string} compMode
   * @param {number} iso
   * @param {number} max
   */
  function renderClouds(vol, compMode, iso, max) {
    const opts = readCloudOpts();
    if (vol && vol.isTwoComponent && isPhaseLikeComponent(compMode)) {
      if (compMode === 'alphaPhase' || compMode === 'betaPhase') {
        if (max >= iso) {
          const which = compMode === 'alphaPhase' ? 'alpha' : 'beta';
          cloudGroup = (opts.type === 'points')
            ? buildCloudPoints2CPhase(vol, which, opts)
            : buildCloudCubes2CPhase(vol, which, opts);
          contentGroup.add(cloudGroup);
        }
        return;
      }

      if (compMode === 'alphaBetaPhase') {
        const { maxA, maxB } = getAlphaBetaMagnitudeMaxima(vol);
        const grp = new THREE.Group();
        if (maxA >= iso) {
          const alpha = (opts.type === 'points') ? buildCloudPoints2CPhase(vol, 'alpha', opts) : buildCloudCubes2CPhase(vol, 'alpha', opts);
          for (const c of alpha.children) grp.add(c);
        }
        if (maxB >= iso) {
          const beta = (opts.type === 'points') ? buildCloudPoints2CPhase(vol, 'beta', opts) : buildCloudCubes2CPhase(vol, 'beta', opts);
          for (const c of beta.children) grp.add(c);
        }
        cloudGroup = grp;
        contentGroup.add(cloudGroup);
        return;
      }

      if (compMode === 'totalBloch' && max >= iso) {
        cloudGroup = (opts.type === 'points') ? buildCloudPoints2CTotal(vol, opts) : buildCloudCubes2CTotal(vol, opts);
        contentGroup.add(cloudGroup);
      }
      return;
    }

    cloudGroup = (opts.type === 'points') ? buildCloudPoints(vol, opts) : buildCloudCubes(vol, opts);
    contentGroup.add(cloudGroup);
  }

  /**
   * Update UI controls and phase legend visibility after scene rebuild.
   * @param {*} vol
   * @param {string} compMode
   */
  function updatePostRebuildUI(vol, compMode) {
    if (componentRow) {
      const is2c = !!(vol && vol.isTwoComponent);
      componentRow.style.display = is2c ? 'grid' : 'none';
      if (is2c && componentSelect) {
        componentSelect.value = global2CComponentMode || volumes[currentIndex].component || 'alphaRe';
      }
    }

    try {
      if (schemeSelect) {
        const is2c = !!(vol && vol.isTwoComponent);
        schemeSelect.disabled = is2c && isPhaseLikeComponent(compMode);
        schemeSelect.title = schemeSelect.disabled
          ? 'Disabled: 2C mode uses intrinsic colors'
          : 'Choose default +/- surface colors';
      }
    } catch { }

    const wheel = document.getElementById('phaseWheel');
    if (!wheel) return;
    const is2c = !!(vol && vol.isTwoComponent);
    const show = is2c && isPhaseLikeComponent(compMode);
    wheel.style.display = show ? 'block' : 'none';
    if (show) {
      drawPhaseWheel(compMode, compMode === 'totalBloch' ? 'bloch' : 'phase');
    }
  }

  /**
   * Build non-surface geometry layers (atoms/bonds/box) after core rendering.
   * @param {*} vol
   * @param {boolean} hasGrid
   */
  function applyPostGeometry(vol, hasGrid) {
    if (toggleAtoms.checked) {
      atomGroup = buildAtoms(vol);
      contentGroup.add(atomGroup);
    }
    if (toggleBonds.checked) {
      bondGroup = buildBonds(vol);
      contentGroup.add(bondGroup);
    }
    if (toggleBox.checked && hasGrid) {
      boxHelper = buildBox(vol);
      contentGroup.add(boxHelper);
      console.log('[CUBE] Box helper added');
    }
  }

  /**
   * Apply camera policy for rebuilds: preserve current view or fit to content.
   * @param {boolean} preserveView
   * @param {THREE.Camera|null} savedCam
   * @param {THREE.Vector3|null} savedTarget
   */
  function applyCameraStrategy(preserveView, savedCam, savedTarget) {
    if (preserveView && savedCam && savedTarget) {
      camera.copy(savedCam);
      controls.target.copy(savedTarget);
      controls.update();
      return;
    }
    fitCameraToScene();
    if (!defaultView) {
      defaultView = {
        cam: camera.clone(),
        target: controls.target.clone(),
        contentPos: contentGroup.position.clone(),
      };
    }
  }

  /**
   * Recompute scene content for the active file and current render settings.
   * @param {{preserveView?:boolean}} options
   */
  function rebuildScene(options = {}) {
    const preserveView = !!options.preserveView;
    const savedCam = preserveView ? camera.clone() : null;
    const savedTarget = preserveView ? controls.target.clone() : null;
    if (currentIndex < 0) return;

    clearSceneMeshes();
    const vol = volumes[currentIndex].vol;
    const compMode = getComponentMode(vol);
    selectActiveRawComponent(vol, compMode);

    const { min, max } = computeVolumeStats(vol, compMode, arrayMinMax);
    const iso = parseFloat(isoInput.value || "0.02");
    const opacity = parseFloat(opInput.value || "1.00");
    const posMat = createIsoMaterial('pos', opacity);
    const negMat = createIsoMaterial('neg', opacity);
    const hasGrid = Array.isArray(vol.nxyz) && (vol.nxyz[0] > 0 && vol.nxyz[1] > 0 && vol.nxyz[2] > 0);

    if (renderMode === 'surface' && showSurfaces && hasGrid) {
      if (vol && vol.isTwoComponent && isPhaseLikeComponent(compMode)) {
        renderTwoComponentSurfaces(vol, compMode, iso, opacity);
      } else {
        renderStandardSurfaces(vol, iso, min, max, posMat, negMat);
      }
    } else if (renderMode === 'cloud' && showSurfaces && hasGrid) {
      renderClouds(vol, compMode, iso, max);
    }

    applyPostGeometry(vol, hasGrid);
    applyCameraStrategy(preserveView, savedCam, savedTarget);
    console.log('[CUBE] Rebuilt scene. iso=', iso, 'opacity=', opacity, 'min/max=', min, max);
    updateSidePanel();
    updatePostRebuildUI(vol, compMode);
  }

  /**
   * Update material opacity/color state in-place for already-built meshes/clouds.
   */
  function updateOpacityAndColors() {
    const op = parseFloat(opInput.value || "1.00");
    for (const m of meshes) {
      if (!m || !m.material) continue;
      if (m.userData && m.userData.phaseHue) {
        // For phase‑hued meshes, keep vertex colors, update style‑specific transparency/glassness
        const mat = m.material;
        if (mat.isMeshPhysicalMaterial && 'transmission' in mat && surfaceStyle === 'glass') {
          // Glass style: drive transmission instead of opacity
          mat.transmission = Math.max(0, Math.min(1, op));
          mat.opacity = 1.0;
        } else if (mat.isShaderMaterial && mat.uniforms && mat.uniforms.uAlpha) {
          // Custom shader materials (e.g., 2C cloud cubes)
          mat.uniforms.uAlpha.value = Math.max(0, Math.min(1, op));
        } else {
          mat.opacity = op;
          mat.transparent = true;
        }
        mat.needsUpdate = true;
        continue;
      }
      const sign = m.userData && m.userData.sign;
      const colStr = sign === 'neg' ? negColor.value : posColor.value;
      const col = new THREE.Color(colStr);
      const mat = m.material;
      // Adapt behavior to glossy physical materials
      if (mat.isMeshPhysicalMaterial) {
        if (surfaceStyle === 'glass' && 'transmission' in mat) {
          // For glass: drive transmission with slider, keep alpha at 1
          col.multiplyScalar(2);
          mat.transmission = Math.max(0, Math.min(1, op));
          mat.color.copy(col);
        } else {
          // Emissive physical (default): use opacity, keep emissiveIntensity intact
          mat.opacity = op;
          mat.transparent = true;
          mat.color.copy(col);
          if (mat.emissive) mat.emissive.copy(col);
        }
      } else {
        // Fallback materials (standard/toon)
        mat.opacity = op;
        mat.transparent = true;
        mat.color.copy(col);
        // Keep toon surface glow synchronized with sign color updates.
        if (mat.isMeshToonMaterial && mat.emissive) {
          mat.emissive.copy(getToonSurfaceEmissive(col));
        }
      }
      mat.needsUpdate = true;
    }
    // Update cloud colors and alpha as well
    if (cloudGroup && cloudGroup.children && cloudGroup.children.length) {
      for (const obj of cloudGroup.children) {
        if (!obj || !obj.material) continue;
        const mat = obj.material;
        // Update custom shader alpha if present (points and 2C cubes)
        if (mat.isShaderMaterial && mat.uniforms && mat.uniforms.uAlpha) {
          mat.uniforms.uAlpha.value = Math.max(0, Math.min(1, op));
          mat.needsUpdate = true;
        }
        // Update signed color for standard scalar clouds that use uColor
        const sign = obj.userData && obj.userData.sign;
        const colStr = sign === 'neg' ? negColor.value : posColor.value;
        if (colStr) {
          if (mat.isShaderMaterial && mat.uniforms && mat.uniforms.uColor) {
            mat.uniforms.uColor.value.set(colStr);
            mat.needsUpdate = true;
          } else if (mat.color) {
            mat.color.set(colStr);
            mat.needsUpdate = true;
          }
        }
      }
    }
  }

  saveBtn.onclick = () => {
    const link = document.createElement('a');
    const name = currentIndex >= 0 ? volumes[currentIndex].name.replace(/\.[^/.]+$/, '') : 'render';
    link.download = `${name}_iso${parseFloat(isoInput.value || "0.02").toFixed(4)}.png`;
    link.href = renderer.domElement.toDataURL('image/png');
    link.click();
  };

  batchBtn.onclick = async () => {
    if (volumes.length === 0) return;
    const keepCamera = camera.clone(); const keepTarget = controls.target.clone();

    for (let i = 0; i < volumes.length; i++) {
      currentIndex = i;
      fileSelect.value = i;
      rebuildScene();
      await new Promise(r => requestAnimationFrame(() => r()));
      const link = document.createElement('a');
      const name = volumes[i].name.replace(/\.[^/.]+$/, '');
      link.download = `${name}_iso${parseFloat(isoInput.value || "0.02").toFixed(4)}.png`;
      link.href = renderer.domElement.toDataURL('image/png');
      link.click();
      await new Promise(r => setTimeout(r, 120));
    }
    camera.copy(keepCamera); controls.target.copy(keepTarget); controls.update();
  };

  // Helpers to load the sample cube or demo
  /**
   * Load bundled sample data and make it the active record.
   * @returns {Promise<boolean>} `true` on success, `false` on fetch/parse failure.
   */
  async function loadSampleCube() {
    try {
      const resp = await fetch('./assets/data/sample.cube', { cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const vol = parseCube(text);
      volumes = [];
      currentIndex = -1;
      clearSceneMeshes();
      volumes.push({ name: 'sample.cube', vol, isSample: true });
      if (vol.isoHint != null && (isoInput.value === '' || currentIndex === -1)) {
        isoInput.value = String(vol.isoHint);
      }
      try {
        const stats = arrayMinMax(vol.data);
        console.log('[CUBE] Loaded sample.cube', { title: vol.title, nxyz: vol.nxyz, origin: vol.origin, axes: vol.axes, natoms: vol.natoms, isoHint: vol.isoHint, min: stats.min, max: stats.max });
      } catch (e) {
        console.warn('[CUBE] Stats failed for sample.cube', e);
      }
      currentIndex = 0;
      refreshFileSelect();
      rebuildScene();
      updateSidePanel();
      const hint = document.getElementById('hint');
      if (hint) hint.textContent = 'Loaded sample.cube • Orbit: mouse drag • Zoom: wheel • Pan: right-drag • Style: 1=Default 2=Toon 3=Kit 4=Glossy';
      return true;
    } catch (err) {
      console.warn('[CUBE] Could not auto-load sample.cube:', err);
      return false;
    }
  }

  /**
   * Create a small synthetic water-like demo volume as an offline fallback.
   */
  function loadDemo() {
    const ANG_TO_BOHR = 1.0 / BOHR_TO_ANG;
    const r = 0.9572; // O–H bond length
    const theta = 104.5 * Math.PI / 180; // H–O–H angle
    const hx = r * Math.sin(theta / 2);
    const hz = r * Math.cos(theta / 2);
    const atoms = [
      { Z: (ATOM_SYMBOL_TO_Z.O || 8), q: 0, x: 0, y: 0, z: 0 },
      { Z: (ATOM_SYMBOL_TO_Z.H || 1), q: 0, x: hx * ANG_TO_BOHR, y: 0, z: hz * ANG_TO_BOHR },
      { Z: (ATOM_SYMBOL_TO_Z.H || 1), q: 0, x: -hx * ANG_TO_BOHR, y: 0, z: hz * ANG_TO_BOHR },
    ];
    const nx = 20, ny = 20, nz = 20;
    const step = 0.6; // Bohr per voxel along each axis
    const axes = [[step, 0, 0], [0, step, 0], [0, 0, step]];
    const origin = [-(nx * step) / 2, -(ny * step) / 2, -(nz * step) / 2]; // Bohr
    const data = new Float32Array(nx * ny * nz);
    /**
     * Map voxel coordinates to a flat array index.
     * @param {number} i
     * @param {number} j
     * @param {number} k
     * @returns {number}
     */
    const idx = (i, j, k) => (i * ny + j) * nz + k;
    const vol = { title: 'Demo Water', comment: '', natoms: 3, origin, nxyz: [nx, ny, nz], axes, atoms, data, idx, isoHint: null };
    volumes.push({ name: 'Demo Water', vol });
    currentIndex = 0;
    refreshFileSelect();
    rebuildScene();
    updateSidePanel();
  }

  // Startup: show sample cube, fallback to demo
  (async function initLoad() {
    if (volumes.length > 0) return;
    const ok = await loadSampleCube();
    if (!ok) loadDemo();
  })();

  // Keyboard shortcuts are handled by the mode-aware router defined above.

})();
