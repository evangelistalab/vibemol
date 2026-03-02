(function () {
  // --- Constants & helpers ---
  const BOHR_TO_ANG = 0.529177210903;
  // App version displayed in Help
  const APP_VERSION = '0.4.10';
  const HINT_NAVIGATION = 'Orbit: mouse drag • Zoom: wheel • Pan: right-drag';
  const HINT_STYLE_KEYS = 'Style: 1=Default 2=Toon 3=Kit 4=Glossy';
  const HINT_START = 'Drag & drop .cube/.cub/.2ccube/.xyz files here';

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
  camera.position.set(6, 6, 6);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.update();
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
  // Display inferred multiple bonds (double/triple) as parallel connectors.
  let showMultiBonds = true;
  // Display element symbols over atoms.
  let showAtomLabels = false;
  // Atom label shell meshes that should rotate to keep text visible to camera.
  const atomLabelTrackTargets = [];
  let atomLabelCapGeometry = null;
  // Per-element color overrides (z -> "#rrggbb"), used when element colors are enabled.
  const elementColorOverrides = new Map();
  // Remember surface visibility when entering a work mode (edit/measure) to restore on exit to display
  let __savedShowSurfaces = null;
  // Default view reference (captured on first non-preserved fit)
  let defaultView = null;
  // Current iso-surface material style
  let surfaceStyle = 'emissive';
  // Current atom/bond material style
  let moleculeStyle = 'default';
  const MOLECULE_STYLE_KEYS = Object.freeze(['default', 'toon', 'kit', 'glossy']);
  const MOLECULE_STYLE_ALIASES = Object.freeze({
    fancy: 'toon',
  });
  const MOLECULE_STYLE_SET = new Set(MOLECULE_STYLE_KEYS);
  const MOLECULE_STYLE_PROFILE = Object.freeze({
    default: Object.freeze({
      key: 'default',
      atomScaleMain: 1.2,
      atomScaleTransitionMetal: 1.2,
      sphereWidthSegments: 28,
      sphereHeightSegments: 18,
      bondRadius: 0.11,
      bondRadialSegments: 16,
      bondHeightSegments: 2,
      usesTrimmedConnector: false,
      usesKitCurvedMultiBond: false,
      stylizedMolecule: false,
      aromaticDashColor: 0x4f5560,
      aromaticDashOpacity: 0.96,
      lighting: Object.freeze({
        hemiColor: 0xffffff,
        hemiGroundColor: 0x081018,
        hemiIntensity: 2.0,
        dirColor: 0xffffff,
        dirIntensity: 1.0,
        dirPos: Object.freeze([1, 1, 1]),
        ambColor: 0x999999,
        ambIntensity: 0.65,
        rimColor: 0x9fb8ff,
        rimIntensity: 0.0,
      }),
    }),
    toon: Object.freeze({
      key: 'toon',
      atomScaleMain: 1.16,
      atomScaleTransitionMetal: 1.22,
      sphereWidthSegments: 30,
      sphereHeightSegments: 20,
      bondRadius: 0.095,
      bondRadialSegments: 20,
      bondHeightSegments: 1,
      usesTrimmedConnector: false,
      usesKitCurvedMultiBond: false,
      stylizedMolecule: true,
      aromaticDashColor: 0x515a66,
      aromaticDashOpacity: 0.96,
      lighting: Object.freeze({
        hemiColor: 0xf8fbff,
        hemiGroundColor: 0x0f1826,
        hemiIntensity: 1.28,
        dirColor: 0xffffff,
        dirIntensity: 2.25,
        dirPos: Object.freeze([1.25, 1.2, 1.1]),
        ambColor: 0x9aa6ba,
        ambIntensity: 0.16,
        rimColor: 0x9fb8ff,
        rimIntensity: 1.18,
      }),
    }),
    kit: Object.freeze({
      key: 'kit',
      atomScaleMain: 1.08,
      atomScaleTransitionMetal: 1.14,
      sphereWidthSegments: 36,
      sphereHeightSegments: 24,
      bondRadius: 0.068,
      bondRadialSegments: 20,
      bondHeightSegments: 1,
      usesTrimmedConnector: true,
      usesKitCurvedMultiBond: true,
      stylizedMolecule: false,
      kitCollarRadius: 0.114,
      aromaticDashColor: 0x59616d,
      aromaticDashOpacity: 0.96,
      lighting: Object.freeze({
        hemiColor: 0xfafcff,
        hemiGroundColor: 0x515965,
        hemiIntensity: 1.35,
        dirColor: 0xffffff,
        dirIntensity: 2.1,
        dirPos: Object.freeze([1.35, 1.28, 1.18]),
        ambColor: 0x9ea7b2,
        ambIntensity: 0.18,
        rimColor: 0xdfe7f2,
        rimIntensity: 0.75,
      }),
    }),
    glossy: Object.freeze({
      key: 'glossy',
      atomScaleMain: 1.18,
      atomScaleTransitionMetal: 1.24,
      sphereWidthSegments: 36,
      sphereHeightSegments: 24,
      // Bond radius/end radius are derived dynamically from glossyBondRadius control.
      bondRadius: 0.072,
      bondRadialSegments: 28,
      bondHeightSegments: 1,
      usesTrimmedConnector: true,
      usesKitCurvedMultiBond: false,
      stylizedMolecule: true,
      aromaticDashColor: 0x2f4a74,
      aromaticDashOpacity: 0.94,
      lighting: Object.freeze({
        hemiColor: 0xf4f9ff,
        hemiGroundColor: 0x0a1324,
        hemiIntensity: 1.1,
        dirColor: 0xffffff,
        dirIntensity: 2.6,
        dirPos: Object.freeze([1.45, 1.32, 1.24]),
        ambColor: 0x7d93b2,
        ambIntensity: 0.12,
        rimColor: 0x8db5ff,
        rimIntensity: 1.52,
      }),
    }),
  });

  /**
   * Normalize molecule-style keys and compatibility aliases.
   * @param {*} value
   * @returns {'default'|'toon'|'kit'|'glossy'}
   */
  function normalizeMoleculeStyleKey(value) {
    const raw = (typeof value === 'string') ? value.trim().toLowerCase() : '';
    const mapped = MOLECULE_STYLE_ALIASES[raw] || raw;
    return MOLECULE_STYLE_SET.has(mapped) ? mapped : 'default';
  }

  /**
   * Resolve one style profile.
   * @param {*} [styleKey]
   * @returns {typeof MOLECULE_STYLE_PROFILE['default']}
   */
  function getMoleculeStyleProfile(styleKey = moleculeStyle) {
    const key = normalizeMoleculeStyleKey(styleKey);
    return MOLECULE_STYLE_PROFILE[key] || MOLECULE_STYLE_PROFILE.default;
  }
  // Center radius (Å) for glossy bond connectors
  let glossyBondRadius = 0.072;
  // Disable expensive scene rebuild fanout while applying batched preset updates.
  let suspendPresetRebuild = false;
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
    atomLabelTrackTargets.length = 0;

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
    const lighting = getMoleculeStyleProfile().lighting;
    hemi.color.setHex(lighting.hemiColor);
    hemi.groundColor.setHex(lighting.hemiGroundColor);
    hemi.intensity = lighting.hemiIntensity;
    dir.color.setHex(lighting.dirColor);
    dir.intensity = lighting.dirIntensity;
    dir.position.set(lighting.dirPos[0], lighting.dirPos[1], lighting.dirPos[2]);
    amb.color.setHex(lighting.ambColor);
    amb.intensity = lighting.ambIntensity;
    rim.color.setHex(lighting.rimColor);
    rim.intensity = lighting.rimIntensity;
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
    return getMoleculeStyleProfile().key === 'toon';
  }

  /**
   * Determine whether molecule rendering is using a stylized non-default mode.
   * @returns {boolean}
   */
  function useStylizedMoleculeStyle() {
    return !!getMoleculeStyleProfile().stylizedMolecule;
  }

  /**
   * Determine whether molecule rendering should use glossy glass-like styling.
   * @returns {boolean}
   */
  function useGlossyMoleculeStyle() {
    return getMoleculeStyleProfile().key === 'glossy';
  }

  /**
   * Determine whether molecule rendering should use the kit collar-joint style.
   * @returns {boolean}
   */
  function useKitMoleculeStyle() {
    return getMoleculeStyleProfile().key === 'kit';
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
   * Check whether an atomic number belongs to lanthanides/actinides.
   * @param {number} z
   * @returns {boolean}
   */
  function isLanthanideOrActinideAtomicNumber(z) {
    const n = z | 0;
    return (n >= 57 && n <= 71) || (n >= 89 && n <= 103);
  }

  /**
   * Detect whether an element is typically monovalent in organic chemistry.
   * @param {number} z
   * @returns {boolean}
   */
  function isMonovalentMainGroupAtomicNumber(z) {
    return z === 1 || z === 9 || z === 17 || z === 35 || z === 53;
  }

  /**
   * Return preferred valence states for a main-group element.
   * Empty result means "do not infer bond order by valence".
   * @param {number} z
   * @returns {number[]}
   */
  function getAllowedMainGroupValences(z) {
    switch (z | 0) {
      case 1: return [1]; // H
      case 5: return [3]; // B
      case 6: return [4]; // C
      case 7: return [3, 5]; // N
      case 8: return [2]; // O
      case 9: return [1]; // F
      case 14: return [4]; // Si
      case 15: return [3, 5]; // P
      case 16: return [2, 4, 6]; // S
      case 17: return [1]; // Cl
      case 35: return [1]; // Br
      case 53: return [1]; // I
      default: return [];
    }
  }

  /**
   * Pick the nearest plausible target valence that is not below the
   * current connectivity count, if possible.
   * @param {number} z
   * @param {number} currentValence
   * @returns {number}
   */
  function chooseTargetValence(z, currentValence) {
    const allowed = getAllowedMainGroupValences(z);
    if (!allowed.length) return currentValence;
    for (const v of allowed) {
      if (v >= currentValence) return v;
    }
    return allowed[allowed.length - 1];
  }

  /**
   * Resolve the maximum supported bond order for an element pair.
   * Conservative by design: only common organic/main-group pairs are promoted.
   * @param {number} zi
   * @param {number} zj
   * @returns {number}
   */
  function getPairMaxBondOrder(zi, zj) {
    const a = zi | 0;
    const b = zj | 0;
    if (isTransitionMetalAtomicNumber(a) || isTransitionMetalAtomicNumber(b)) return 1;
    if (isLanthanideOrActinideAtomicNumber(a) || isLanthanideOrActinideAtomicNumber(b)) return 1;
    if (isMonovalentMainGroupAtomicNumber(a) || isMonovalentMainGroupAtomicNumber(b)) return 1;

    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    switch (key) {
      case '6-6': // C-C
      case '6-7': // C-N
      case '7-7': // N-N
        return 3;
      case '6-8': // C-O
      case '6-15': // C-P
      case '6-16': // C-S
      case '7-8': // N-O
      case '7-15': // N-P
      case '7-16': // N-S
      case '8-8': // O-O
      case '8-15': // O-P
      case '8-16': // O-S
      case '6-14': // Si-C (normalized by sorting)
      case '15-15': // P-P
      case '15-16': // P-S
      case '16-16': // S-S
        return 2;
      default:
        return 1;
    }
  }

  /**
   * Build candidate bonds from atom positions using covalent-radius heuristics.
   * @param {Array<{pos:THREE.Vector3,Z:number}>} atomPositions
   * @returns {Array<{i:number,j:number,len:number,singleRef:number,cutoff:number,order:number,maxOrder:number}>}
   */
  function collectBondCandidates(atomPositions) {
    const edges = [];
    const n = atomPositions.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ai = atomPositions[i];
        const aj = atomPositions[j];
        const ri = getCovalentRadiusAngstrom(ai.Z);
        const rj = getCovalentRadiusAngstrom(aj.Z);
        const singleRef = ri + rj;
        const cutoff = 1.15 * singleRef;
        const len = ai.pos.distanceTo(aj.pos);
        if (len < 0.4 || len > cutoff) continue;
        edges.push({
          i,
          j,
          len,
          singleRef,
          cutoff,
          order: 1,
          maxOrder: getPairMaxBondOrder(ai.Z, aj.Z),
        });
      }
    }
    return edges;
  }

  /**
   * Infer bond orders by promoting single bonds while satisfying valence deficits.
   * This intentionally targets organic/main-group chemistry and avoids metals/f-block.
   * @param {Array<{Z:number}>} atomPositions
   * @param {Array<{i:number,j:number,len:number,singleRef:number,order:number,maxOrder:number}>} edges
   */
  function inferBondOrders(atomPositions, edges) {
    if (!edges.length) return;
    const n = atomPositions.length;
    const currentValence = new Array(n).fill(0);
    for (const e of edges) {
      currentValence[e.i] += e.order;
      currentValence[e.j] += e.order;
    }
    const targetValence = currentValence.map((v, idx) => {
      const z = atomPositions[idx].Z | 0;
      if (isTransitionMetalAtomicNumber(z) || isLanthanideOrActinideAtomicNumber(z)) return v;
      return chooseTargetValence(z, v);
    });
    const deficit = targetValence.map((v, idx) => Math.max(0, v - currentValence[idx]));

    const maxPromotions = edges.reduce((sum, e) => sum + Math.max(0, (e.maxOrder | 0) - 1), 0);
    let promotions = 0;
    while (promotions < maxPromotions) {
      let bestIdx = -1;
      let bestScore = 0;
      for (let k = 0; k < edges.length; k++) {
        const e = edges[k];
        if (e.order >= e.maxOrder) continue;
        if (deficit[e.i] <= 0 || deficit[e.j] <= 0) continue;
        const ratio = e.len / Math.max(1e-6, e.singleRef);
        const distanceBonus = Math.max(0, 1.15 - ratio) * 2.5;
        const valenceBonus = deficit[e.i] + deficit[e.j];
        const score = valenceBonus + distanceBonus;
        if (score > bestScore + 1e-8) {
          bestScore = score;
          bestIdx = k;
        }
      }
      if (bestIdx < 0) break;
      const e = edges[bestIdx];
      e.order += 1;
      deficit[e.i] = Math.max(0, deficit[e.i] - 1);
      deficit[e.j] = Math.max(0, deficit[e.j] - 1);
      promotions += 1;
    }
  }

  /**
   * Get centered lateral offset coefficients for drawing multiple bond components.
   * Coefficients are expressed in the local (u, v) frame orthogonal to the bond axis.
   * For order=3, components are arranged at 120 degrees around the bond axis.
   * @param {number} order
   * @returns {Array<[number, number]>}
   */
  function getBondComponentOffsets(order) {
    if (order >= 3) {
      const h = Math.sqrt(3) * 0.5;
      return [[1, 0], [-0.5, h], [-0.5, -h]];
    }
    if (order === 2) return [[-0.5, 0], [0.5, 0]];
    return [[0, 0]];
  }

  /**
   * Re-orient bond-component offsets in the local (u, v) frame.
   * For Kit style double bonds, rotate by +90 degrees around the bond axis so
   * the pair lies in the plane orthogonal to the nearby-atom plane estimate.
   * Triple-bond placement remains unchanged.
   * @param {number} order
   * @param {number} offsetU
   * @param {number} offsetV
   * @param {boolean} rotateDouble
   * @returns {[number, number]}
   */
  function orientBondComponentOffset(order, offsetU, offsetV, rotateDouble) {
    if (!rotateDouble || (order | 0) !== 2) return [offsetU, offsetV];
    // (u, v) -> (-v, u): +90° rotation in the local plane.
    return [-offsetV, offsetU];
  }

  /**
   * Compute a stable vector perpendicular to the bond direction.
   * @param {THREE.Vector3} dirNorm
   * @returns {THREE.Vector3}
   */
  function getBondPerpendicular(dirNorm) {
    const aux = Math.abs(dirNorm.z) < 0.9
      ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(1, 0, 0);
    const perp = new THREE.Vector3().crossVectors(dirNorm, aux);
    if (perp.lengthSq() < 1e-10) {
      perp.set(0, 1, 0).cross(dirNorm);
    }
    return perp.normalize();
  }

  /**
   * Build an undirected adjacency list from bond edges.
   * @param {Array<{i:number,j:number}>} edges
   * @param {number} atomCount
   * @returns {number[][]}
   */
  function buildBondAdjacency(edges, atomCount) {
    const n = Math.max(0, atomCount | 0);
    const adjacency = Array.from({ length: n }, () => []);
    for (const edge of edges) {
      if (!edge) continue;
      const i = edge.i | 0;
      const j = edge.j | 0;
      if (i < 0 || j < 0 || i >= n || j >= n || i === j) continue;
      adjacency[i].push(j);
      adjacency[j].push(i);
    }
    return adjacency;
  }

  /**
   * Build a canonical undirected key for an atom pair.
   * @param {number} i
   * @param {number} j
   * @returns {string}
   */
  function getUndirectedPairKey(i, j) {
    const a = (i | 0);
    const b = (j | 0);
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }

  /**
   * Canonicalize a simple cycle so duplicates (rotation/reversal) map to one key.
   * @param {number[]} cycle
   * @returns {{key:string, nodes:number[]}}
   */
  function canonicalizeCycle(cycle) {
    const n = cycle.length | 0;
    if (n <= 0) return { key: '', nodes: [] };
    let best = null;
    let bestKey = '';
    const tryVariant = (arr) => {
      for (let shift = 0; shift < n; shift++) {
        const seq = new Array(n);
        for (let k = 0; k < n; k++) seq[k] = arr[(shift + k) % n];
        const key = seq.join('-');
        if (!best || key < bestKey) {
          best = seq;
          bestKey = key;
        }
      }
    };
    tryVariant(cycle);
    tryVariant([...cycle].reverse());
    return { key: bestKey, nodes: best || cycle.slice() };
  }

  /**
   * Find simple cycles of a fixed size in an undirected adjacency list.
   * @param {number[][]} adjacency
   * @param {number} size
   * @returns {number[][]}
   */
  function findSimpleCyclesOfSize(adjacency, size) {
    const n = adjacency.length | 0;
    const target = Math.max(3, size | 0);
    const cycles = [];
    const seen = new Set();
    const path = [];
    const inPath = new Array(n).fill(false);

    /**
     * Depth-first cycle walk with start-index pruning for speed.
     * @param {number} start
     * @param {number} current
     * @param {number} depth
     */
    function dfs(start, current, depth) {
      const neighbors = adjacency[current];
      if (!Array.isArray(neighbors)) return;
      for (const next of neighbors) {
        if (next === start) {
          if (depth === target) {
            const canonical = canonicalizeCycle(path);
            if (canonical.key && !seen.has(canonical.key)) {
              seen.add(canonical.key);
              cycles.push(canonical.nodes);
            }
          }
          continue;
        }
        if (depth >= target) continue;
        if ((next | 0) < (start | 0)) continue;
        if (inPath[next]) continue;
        inPath[next] = true;
        path.push(next);
        dfs(start, next, depth + 1);
        path.pop();
        inPath[next] = false;
      }
    }

    for (let start = 0; start < n; start++) {
      path.length = 0;
      path.push(start);
      inPath[start] = true;
      dfs(start, start, 1);
      inPath[start] = false;
    }
    return cycles;
  }

  /**
   * Select one of the two alternating patterns for a six-member ring and apply
   * it as single/double bonds.
   * @param {Array<{order:number,maxOrder:number}>} edges
   * @param {number[]} ringEdgeIndices
   */
  function enforceAlternatingSixRingBondOrders(edges, ringEdgeIndices) {
    if (!Array.isArray(ringEdgeIndices) || ringEdgeIndices.length !== 6) return;
    for (const edgeIdx of ringEdgeIndices) {
      const e = edges[edgeIdx];
      if (!e || (e.maxOrder | 0) < 2) return;
    }
    const scorePattern = (phase) => {
      let score = 0;
      for (let k = 0; k < ringEdgeIndices.length; k++) {
        const e = edges[ringEdgeIndices[k]];
        const wantDouble = ((k + phase) % 2) === 0;
        const order = e.order | 0;
        if (wantDouble) {
          if (order >= 2) score += 3;
          else score += 1;
        } else if (order === 1) {
          score += 2;
        }
      }
      return score;
    };
    const phase = scorePattern(1) > scorePattern(0) ? 1 : 0;
    for (let k = 0; k < ringEdgeIndices.length; k++) {
      const edge = edges[ringEdgeIndices[k]];
      const wantDouble = ((k + phase) % 2) === 0;
      edge.order = wantDouble ? 2 : 1;
    }
  }

  /**
   * Detect benzene-like aromatic six-member carbon rings from inferred bonds.
   * Matching rings are normalized to alternating single/double order and
   * returned for dashed inner-ring rendering.
   * @param {Array<{pos:THREE.Vector3,Z:number}>} atomPositions
   * @param {Array<{i:number,j:number,len:number,order:number,maxOrder:number}>} edges
   * @returns {Array<{atoms:number[],center:THREE.Vector3,normal:THREE.Vector3,radius:number}>}
   */
  function inferAromaticSixRings(atomPositions, edges) {
    if (!Array.isArray(edges) || !edges.length) return [];
    const n = atomPositions.length | 0;
    const carbonAdj = Array.from({ length: n }, () => []);
    const edgeIndexByPair = new Map();
    for (let idx = 0; idx < edges.length; idx++) {
      const e = edges[idx];
      if (!e) continue;
      edgeIndexByPair.set(getUndirectedPairKey(e.i, e.j), idx);
    }
    for (const e of edges) {
      if (!e) continue;
      const ai = atomPositions[e.i];
      const aj = atomPositions[e.j];
      if (!ai || !aj) continue;
      if ((ai.Z | 0) !== 6 || (aj.Z | 0) !== 6) continue;
      if (e.len < 1.2 || e.len > 1.55) continue;
      carbonAdj[e.i].push(e.j);
      carbonAdj[e.j].push(e.i);
    }
    const cycles = findSimpleCyclesOfSize(carbonAdj, 6);
    const aromaticRings = [];
    for (const cycle of cycles) {
      if (!Array.isArray(cycle) || cycle.length !== 6) continue;
      let valid = true;
      const cycleSet = new Set(cycle);
      const cycleEdgeLengths = [];
      for (const atomIdx of cycle) {
        const atom = atomPositions[atomIdx];
        if (!atom || (atom.Z | 0) !== 6) { valid = false; break; }
        const neighbors = Array.isArray(carbonAdj[atomIdx]) ? carbonAdj[atomIdx] : null;
        if (!neighbors || neighbors.length < 2 || neighbors.length > 3) { valid = false; break; }
        let neighborsInCycle = 0;
        for (const nb of neighbors) {
          if (cycleSet.has(nb)) neighborsInCycle += 1;
        }
        // Ring atom must connect to exactly two ring-adjacent carbons.
        if (neighborsInCycle !== 2) { valid = false; break; }
      }
      if (!valid) continue;

      const edgeIndices = [];
      for (let k = 0; k < cycle.length; k++) {
        const i = cycle[k];
        const j = cycle[(k + 1) % cycle.length];
        const edgeIdx = edgeIndexByPair.get(getUndirectedPairKey(i, j));
        if (!Number.isInteger(edgeIdx)) { valid = false; break; }
        const edgeLen = Number(edges[edgeIdx] && edges[edgeIdx].len);
        if (!Number.isFinite(edgeLen)) { valid = false; break; }
        cycleEdgeLengths.push(edgeLen);
        edgeIndices.push(edgeIdx);
      }
      if (!valid || edgeIndices.length !== 6) continue;

      // Aromatic C6 ring edges should be relatively equalized around ~1.4 A.
      const meanLen = cycleEdgeLengths.reduce((s, v) => s + v, 0) / cycleEdgeLengths.length;
      let varLen = 0;
      for (const v of cycleEdgeLengths) {
        const d = v - meanLen;
        varLen += d * d;
      }
      const stdLen = Math.sqrt(varLen / cycleEdgeLengths.length);
      if (meanLen < 1.32 || meanLen > 1.47 || stdLen > 0.09) continue;

      const center = new THREE.Vector3();
      for (const atomIdx of cycle) center.add(atomPositions[atomIdx].pos);
      center.multiplyScalar(1 / cycle.length);

      const normal = new THREE.Vector3();
      for (let k = 0; k < cycle.length; k++) {
        const p0 = atomPositions[cycle[k]].pos.clone().sub(center);
        const p1 = atomPositions[cycle[(k + 1) % cycle.length]].pos.clone().sub(center);
        normal.add(new THREE.Vector3().crossVectors(p0, p1));
      }
      if (normal.lengthSq() < 1e-10) continue;
      normal.normalize();

      let maxPlaneDeviation = 0;
      let avgRadius = 0;
      for (const atomIdx of cycle) {
        const rel = atomPositions[atomIdx].pos.clone().sub(center);
        maxPlaneDeviation = Math.max(maxPlaneDeviation, Math.abs(rel.dot(normal)));
        const projected = rel.clone().addScaledVector(normal, -rel.dot(normal));
        avgRadius += projected.length();
      }
      avgRadius /= cycle.length;
      if (!Number.isFinite(avgRadius) || avgRadius < 0.2) continue;
      if (maxPlaneDeviation > 0.12) continue;

      enforceAlternatingSixRingBondOrders(edges, edgeIndices);
      aromaticRings.push({
        atoms: cycle.slice(),
        center,
        normal,
        radius: avgRadius * 0.56,
      });
    }
    return aromaticRings;
  }

  /**
   * Infer the lateral offset direction for multi-component bonds from
   * neighboring bonded atoms, so double/triple bonds roughly follow the
   * local molecular plane around the i-j bond.
   * @param {number} i
   * @param {number} j
   * @param {THREE.Vector3} dirNorm Unit direction from i -> j.
   * @param {Array<{pos:THREE.Vector3}>} atomPositions
   * @param {number[][]} adjacency
   * @returns {THREE.Vector3}
   */
  function getBondPlaneOffsetDirection(i, j, dirNorm, atomPositions, adjacency) {
    const fallback = getBondPerpendicular(dirNorm);
    const sideVectors = [];

    /**
     * Collect neighbor vectors for one endpoint projected onto the plane
     * perpendicular to the bond direction.
     * @param {number} center
     * @param {number} skip
     */
    function collectEndpointNeighbors(center, skip) {
      const neighbors = adjacency[center];
      if (!Array.isArray(neighbors) || !neighbors.length) return;
      const centerPos = atomPositions[center] && atomPositions[center].pos;
      if (!centerPos) return;
      for (const k of neighbors) {
        if (k === skip) continue;
        const neighborPos = atomPositions[k] && atomPositions[k].pos;
        if (!neighborPos) continue;
        const vec = new THREE.Vector3().subVectors(neighborPos, centerPos);
        const axial = dirNorm.dot(vec);
        const lateral = vec.addScaledVector(dirNorm, -axial);
        if (lateral.lengthSq() > 1e-10) sideVectors.push(lateral);
      }
    }

    collectEndpointNeighbors(i, j);
    collectEndpointNeighbors(j, i);
    if (!sideVectors.length) return fallback;

    // Build a stable local 2D frame in the plane normal to dirNorm.
    const basisA = fallback.clone().normalize();
    const basisB = new THREE.Vector3().crossVectors(dirNorm, basisA);
    if (basisB.lengthSq() < 1e-12) return fallback;
    basisB.normalize();

    // Principal direction of neighbor spread in that 2D frame.
    let xx = 0;
    let xy = 0;
    let yy = 0;
    for (const v of sideVectors) {
      const x = v.dot(basisA);
      const y = v.dot(basisB);
      xx += x * x;
      xy += x * y;
      yy += y * y;
    }
    if ((xx + yy) < 1e-10) return fallback;
    const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
    const perp = basisA.multiplyScalar(Math.cos(angle)).addScaledVector(basisB, Math.sin(angle));
    if (perp.lengthSq() < 1e-12) return fallback;
    return perp.normalize();
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
   * Convert RGB tuple ([0..255]) to lowercase hex string.
   * @param {number[]} rgb
   * @returns {string}
   */
  function rgbTupleToHex(rgb) {
    if (!Array.isArray(rgb) || rgb.length < 3) return '#ffffff';
    const toHex = (n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
    return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
  }

  /**
   * Normalize a CSS hex color string.
   * @param {*} value
   * @param {string} fallback
   * @returns {string}
   */
  function normalizeHexColor(value, fallback = '#ffffff') {
    const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
    return fallback;
  }

  /**
   * Resolve an element symbol from atomic metadata.
   * @param {number} z
   * @returns {string}
   */
  function getElementSymbol(z) {
    const info = ATOM_Z_TO_DATA && ATOM_Z_TO_DATA[z];
    if (info && typeof info.symbol === 'string' && info.symbol.trim()) return info.symbol.trim();
    return `Z${z | 0}`;
  }

  /**
   * Resolve an element display name from atomic metadata.
   * @param {number} z
   * @returns {string}
   */
  function getElementName(z) {
    const info = ATOM_Z_TO_DATA && ATOM_Z_TO_DATA[z];
    if (info && typeof info.name === 'string' && info.name.trim()) return info.name.trim();
    return getElementSymbol(z);
  }

  /**
   * Resolve one atomic mass value for center-of-mass calculations.
   * Falls back to atomic number, then 1, if metadata is missing.
   * @param {number} z
   * @returns {number}
   */
  function getAtomicMass(z) {
    const key = z | 0;
    const info = ATOM_Z_TO_DATA && ATOM_Z_TO_DATA[key];
    const mass = info ? Number(info.mass) : NaN;
    if (Number.isFinite(mass) && mass > 0) return mass;
    if (Number.isFinite(key) && key > 0) return key;
    return 1;
  }

  /**
   * Resolve the base/default element hex color from atomic metadata.
   * @param {number} z
   * @returns {string}
   */
  function getDefaultElementHexColor(z) {
    const info = ATOM_Z_TO_DATA && ATOM_Z_TO_DATA[z];
    if (info && Array.isArray(info.color)) return rgbTupleToHex(info.color);
    return '#ffffff';
  }

  /**
   * Resolve the active element hex color (override if present, else default).
   * @param {number} z
   * @returns {string}
   */
  function getActiveElementHexColor(z) {
    const key = z | 0;
    if (elementColorOverrides.has(key)) return elementColorOverrides.get(key);
    return getDefaultElementHexColor(key);
  }

  /**
   * Set or clear one element color override.
   * Override is removed if equal to default color to keep preset payload minimal.
   * @param {number} z
   * @param {string} hex
   */
  function setElementColorOverride(z, hex) {
    const key = z | 0;
    if (key < 0) return;
    const normalized = normalizeHexColor(hex, getDefaultElementHexColor(key));
    const baseHex = getDefaultElementHexColor(key);
    if (normalized === baseHex) {
      elementColorOverrides.delete(key);
      return;
    }
    elementColorOverrides.set(key, normalized);
  }

  /**
   * Export element color overrides as a plain object.
   * @returns {Record<string,string>}
   */
  function exportElementColorOverrides() {
    const out = {};
    const sorted = Array.from(elementColorOverrides.entries())
      .sort((a, b) => (a[0] | 0) - (b[0] | 0));
    for (const [z, hex] of sorted) out[String(z)] = hex;
    return out;
  }

  /**
   * Import element color overrides from an object-like value.
   * @param {*} value
   */
  function importElementColorOverrides(value) {
    elementColorOverrides.clear();
    if (!value || typeof value !== 'object') return;
    for (const [key, raw] of Object.entries(value)) {
      const z = Number(key);
      if (!Number.isInteger(z) || z < 0) continue;
      const normalized = normalizeHexColor(raw, getDefaultElementHexColor(z));
      setElementColorOverride(z, normalized);
    }
  }

  /**
   * Resolve the raw element color from atomic metadata when enabled.
   * Falls back to white if element coloring is disabled or unavailable.
   * @param {number} z
   * @returns {THREE.Color}
   */
  function getElementBaseColor(z) {
    if (!isElementColoringEnabled()) return new THREE.Color(0xffffff);
    return new THREE.Color(getActiveElementHexColor(z));
  }

  /**
   * Resolve the display color for an element under the active molecule style.
   * @param {number} z
   * @returns {THREE.Color}
   */
  function getAtomRenderColor(z) {
    const styleKey = getMoleculeStyleProfile().key;
    const useElementColors = isElementColoringEnabled();
    const hasColorOverride = elementColorOverrides.has(z | 0);
    let atomColor = getElementBaseColor(z);

    if (styleKey === 'kit') {
      if (!useElementColors) return new THREE.Color(0xd6dde6);
      if (!hasColorOverride) {
        if (isTransitionMetalAtomicNumber(z)) return new THREE.Color(0xa78546);
        if (z === 1) return new THREE.Color(0xf4f6fa);
        if (z === 6) return new THREE.Color(0x1f2734);
        if (z === 7) return new THREE.Color(0x2ab5ff);
        if (z === 8) return new THREE.Color(0xc31722);
      }
      const hsl = { h: 0, s: 0, l: 0 };
      atomColor.getHSL(hsl);
      atomColor.setHSL(hsl.h, Math.min(1, hsl.s * 0.95 + 0.03), Math.min(1, hsl.l * 0.9 + 0.06));
      return atomColor;
    }
    if (styleKey === 'glossy') {
      if (!hasColorOverride) {
        if (isTransitionMetalAtomicNumber(z)) return new THREE.Color(0xf1c970);
        if (z === 1) return new THREE.Color(0xe5f2ff);
      }
      if (hasColorOverride) return atomColor.clone().lerp(new THREE.Color(0xffffff), 0.42);
      return new THREE.Color(0xbfd8ff);
    }
    if (styleKey !== 'toon') return atomColor;
    if (!useElementColors) return new THREE.Color(0xd0d9e6);
    if (!hasColorOverride && isTransitionMetalAtomicNumber(z)) return new THREE.Color(0xf2ad1f);

    // Match the toon/luminous palette seen in the reference figure.
    if (!hasColorOverride) {
      if (z === 6) return new THREE.Color(0x9ca9b9); // carbon
      if (z === 1) return new THREE.Color(0xe4edf8); // hydrogen
      if (z === 7) return new THREE.Color(0x3c73ff); // nitrogen
    }

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
    const styleKey = getMoleculeStyleProfile().key;
    const hasColorOverride = elementColorOverrides.has(z | 0);
    if (styleKey === 'kit') {
      if (!hasColorOverride && isTransitionMetalAtomicNumber(z)) return new THREE.Color(0xd3ba8e);
      if (hasColorOverride) return atomColor.clone().lerp(new THREE.Color(0xffffff), 0.32);
      return new THREE.Color(0xe2e7ee);
    }
    if (styleKey === 'glossy') {
      if (!hasColorOverride && isTransitionMetalAtomicNumber(z)) return new THREE.Color(0xf4d089);
      if (hasColorOverride) return atomColor.clone().lerp(new THREE.Color(0xffffff), 0.22);
      return new THREE.Color(0xbad4f8);
    }
    if (styleKey !== 'toon') return atomColor;
    if (!hasColorOverride && isTransitionMetalAtomicNumber(z)) return new THREE.Color(0xefbb55);
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
    const profile = getMoleculeStyleProfile();
    return isTransitionMetalAtomicNumber(z)
      ? profile.atomScaleTransitionMetal
      : profile.atomScaleMain;
  }

  /**
   * Create an atom material that matches the active molecule style.
   * @param {THREE.Color} color
   * @param {number} z
   * @returns {THREE.Material}
   */
  function createAtomMaterial(color, z) {
    const styleKey = getMoleculeStyleProfile().key;
    if (styleKey === 'kit') {
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
    if (styleKey === 'glossy') {
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
    if (styleKey === 'toon') {
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
    const key = getMoleculeStyleProfile().key;
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
    } else if (key === 'kit') {
      mat = new THREE.MeshPhongMaterial({
        color: 0xe7ebf2,
        specular: 0xffffff,
        shininess: 185,
        emissive: new THREE.Color(0x161b24),
        emissiveIntensity: 0.02,
      });
    } else if (key === 'toon') {
      mat = new THREE.MeshToonMaterial({
        color: 0xd9e2ee,
        vertexColors: true,
        gradientMap: getToonGradientTexture('bond'),
        emissive: new THREE.Color(0x273244),
        emissiveIntensity: 0.14,
      });
    } else {
      mat = new THREE.MeshPhysicalMaterial({
        color: 0xeaecf0,
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
    const key = useGlossyMoleculeStyle() ? 'glossy:outline' : 'toon:outline';
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
    const key = useGlossyMoleculeStyle() ? 'glossy:highlight' : 'toon:highlight';
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
   * Get (or create) the dashed-line material used for aromatic ring guides.
   * @returns {THREE.Material}
   */
  function getAromaticRingMaterial() {
    const profile = getMoleculeStyleProfile();
    const styleKey = profile.key;
    const key = `aromatic:ring:${styleKey}`;
    if (bondMaterialCache.has(key)) return bondMaterialCache.get(key);
    const color = profile.aromaticDashColor;
    const opacity = profile.aromaticDashOpacity;
    const mat = new THREE.LineDashedMaterial({
      color,
      dashSize: 0.10,
      gapSize: 0.07,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: false,
    });
    bondMaterialCache.set(key, mat);
    return mat;
  }

  /**
   * Add a dashed aromatic ring guide inside a planar six-member ring.
   * @param {THREE.Group} group
   * @param {{atoms:number[],center:THREE.Vector3,normal:THREE.Vector3,radius:number}} ring
   * @param {Array<{pos:THREE.Vector3}>} atomPositions
   */
  function addAromaticDashedRing(group, ring, atomPositions) {
    if (!group || !ring || !Array.isArray(ring.atoms) || ring.atoms.length !== 6) return;
    const center = ring.center ? ring.center.clone() : new THREE.Vector3();
    const normal = ring.normal ? ring.normal.clone() : new THREE.Vector3(0, 0, 1);
    if (normal.lengthSq() < 1e-10) return;
    normal.normalize();
    let basisU = null;
    for (const atomIdx of ring.atoms) {
      const p = atomPositions[atomIdx] && atomPositions[atomIdx].pos;
      if (!p) continue;
      const candidate = p.clone().sub(center);
      candidate.addScaledVector(normal, -candidate.dot(normal));
      if (candidate.lengthSq() > 1e-10) {
        basisU = candidate.normalize();
        break;
      }
    }
    if (!basisU) basisU = getBondPerpendicular(normal);
    const basisV = new THREE.Vector3().crossVectors(normal, basisU).normalize();
    const radius = Math.max(0.16, Number.isFinite(ring.radius) ? ring.radius : 0.7);
    const points = [];
    const steps = 96;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const p = center.clone()
        .addScaledVector(basisU, Math.cos(t) * radius)
        .addScaledVector(basisV, Math.sin(t) * radius)
        .addScaledVector(normal, 0.01);
      points.push(p);
    }
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geom, getAromaticRingMaterial());
    line.computeLineDistances();
    line.renderOrder = 48;
    line.userData = { type: 'aromaticRing' };
    group.add(line);
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

  const KIT_FLANGE_PLATEAU_END = 0.02;
  const KIT_FLANGE_TAPER_END = 0.04;
  const KIT_DOUBLE_BOND_CURVE_GAIN = 4.0;
  const KIT_MULTI_BOND_SEAT_SPREAD_GAIN = 1.8;
  const KIT_FLANGE_SPHERE_OVERLAP = 0.001;
  // Keep a tiny shaft overlap inside flange tips to avoid seam flicker/tearing.
  const KIT_FLANGE_SHAFT_OVERLAP = 0.003;
  // Cap curve bulge more aggressively on short chords to avoid endpoint artifacts.
  const KIT_CURVED_SHORT_CHORD_BULGE_FRACTION = 0.30;
  const KIT_CURVED_HANDLE_SCALE = 0.44;
  const KIT_CURVED_HANDLE_OFFSET_SCALE = 0.55;

  /**
   * Build one kit flange profile revolved around Y.
   * The flange starts at y=0 (atom side) and transitions to shaft radius at y=taper.
   * @param {number} centerRadius
   * @param {number} collarRadius
   * @returns {THREE.BufferGeometry}
   */
  function createKitFlangeGeometry(centerRadius, collarRadius) {
    const cR = Math.max(1e-4, centerRadius);
    const kR = Math.max(cR * 1.2, collarRadius);
    const plateau = Math.max(1e-5, KIT_FLANGE_PLATEAU_END);
    const taper = Math.max(plateau + 1e-5, KIT_FLANGE_TAPER_END);
    const profile = [
      new THREE.Vector2(kR, 0),
      new THREE.Vector2(kR, plateau),
      new THREE.Vector2(cR, taper),
    ];
    const geom = new THREE.LatheGeometry(profile, 28);
    try { geom.computeVertexNormals(); } catch { }
    return geom;
  }

  /**
   * Build an open tube mesh around a curve using parallel-transport frames.
   * This avoids endpoint frame flips that can appear with Frenet-based tubes
   * on short/high-curvature paths.
   * @param {THREE.Curve<THREE.Vector3>} curve
   * @param {number} tubularSegments
   * @param {number} radius
   * @param {number} radialSegments
   * @param {THREE.Vector3} normalHint
   * @param {THREE.Vector3} startTangentHint
   * @param {THREE.Vector3} endTangentHint
   * @returns {THREE.BufferGeometry}
   */
  function createTransportTubeGeometry(
    curve,
    tubularSegments,
    radius,
    radialSegments,
    normalHint,
    startTangentHint,
    endTangentHint
  ) {
    const tSeg = Math.max(2, tubularSegments | 0);
    const rSeg = Math.max(8, radialSegments | 0);
    const r = Math.max(1e-5, Number(radius) || 0);

    const points = new Array(tSeg + 1);
    const tangents = new Array(tSeg + 1);
    for (let i = 0; i <= tSeg; i++) {
      const u = i / tSeg;
      points[i] = curve.getPointAt(u);
    }

    // Build tangents from sampled points (finite differences) instead of
    // curve endpoint derivatives, which are more prone to instability in the
    // final strip on short/high-curvature curves.
    const chord = new THREE.Vector3().subVectors(points[tSeg], points[0]);
    const chordDir = chord.lengthSq() > 1e-14 ? chord.normalize() : new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= tSeg; i++) {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(tSeg, i + 1)];
      let tan = new THREE.Vector3().subVectors(next, prev);
      if (tan.lengthSq() < 1e-14) {
        if (i > 0) tan = new THREE.Vector3().subVectors(points[i], points[i - 1]);
        else tan = new THREE.Vector3().subVectors(points[Math.min(tSeg, i + 1)], points[i]);
      }
      if (tan.lengthSq() < 1e-14) tan = chordDir.clone();
      tangents[i] = tan.normalize();
    }
    // Keep tangent direction continuous to prevent ring-frame flips.
    for (let i = 1; i <= tSeg; i++) {
      if (tangents[i].dot(tangents[i - 1]) < 0) tangents[i].negate();
    }

    // Endpoint tangents must match the intended sphere normals so the end ring
    // plane aligns with the local atom surface normal.
    if (startTangentHint && startTangentHint.lengthSq && startTangentHint.lengthSq() > 1e-14) {
      const t0 = startTangentHint.clone().normalize();
      if (tSeg >= 1 && tangents[1].dot(t0) < 0) t0.negate();
      tangents[0] = t0;
    }
    if (endTangentHint && endTangentHint.lengthSq && endTangentHint.lengthSq() > 1e-14) {
      const te = endTangentHint.clone().normalize();
      if (tSeg >= 1 && tangents[tSeg - 1].dot(te) < 0) te.negate();
      tangents[tSeg] = te;
    }

    const normals = new Array(tSeg + 1);
    const binormals = new Array(tSeg + 1);

    let n0 = (normalHint && normalHint.lengthSq && normalHint.lengthSq() > 1e-14)
      ? normalHint.clone()
      : getBondPerpendicular(tangents[0]);
    n0.addScaledVector(tangents[0], -n0.dot(tangents[0]));
    if (n0.lengthSq() < 1e-14) n0 = getBondPerpendicular(tangents[0]);
    n0.normalize();
    let b0 = new THREE.Vector3().crossVectors(tangents[0], n0);
    if (b0.lengthSq() < 1e-14) {
      n0 = getBondPerpendicular(tangents[0]);
      b0.crossVectors(tangents[0], n0);
    }
    b0.normalize();
    normals[0] = n0;
    binormals[0] = b0;

    const axis = new THREE.Vector3();
    for (let i = 1; i <= tSeg; i++) {
      const tPrev = tangents[i - 1];
      const tCur = tangents[i];
      let n = normals[i - 1].clone();

      axis.crossVectors(tPrev, tCur);
      const axisLen = axis.length();
      if (axisLen > 1e-8) {
        axis.multiplyScalar(1 / axisLen);
        const c = Math.max(-1, Math.min(1, tPrev.dot(tCur)));
        const angle = Math.acos(c);
        n.applyAxisAngle(axis, angle);
      }

      n.addScaledVector(tCur, -n.dot(tCur));
      if (n.lengthSq() < 1e-14) n = getBondPerpendicular(tCur); else n.normalize();

      let b = new THREE.Vector3().crossVectors(tCur, n);
      if (b.lengthSq() < 1e-14) {
        const fb = getBondPerpendicular(tCur);
        b = new THREE.Vector3().crossVectors(tCur, fb);
      }
      b.normalize();

      normals[i] = n;
      binormals[i] = b;
    }

    const ringCount = tSeg + 1;
    const vertCount = ringCount * rSeg;
    const positions = new Float32Array(vertCount * 3);
    const vertexNormals = new Float32Array(vertCount * 3);
    const twoPi = Math.PI * 2;

    let v = 0;
    for (let i = 0; i < ringCount; i++) {
      const p = points[i];
      const n = normals[i];
      const b = binormals[i];
      for (let j = 0; j < rSeg; j++) {
        const theta = (j / rSeg) * twoPi;
        const ct = Math.cos(theta);
        const st = Math.sin(theta);

        const nx = n.x * ct + b.x * st;
        const ny = n.y * ct + b.y * st;
        const nz = n.z * ct + b.z * st;

        positions[v + 0] = p.x + r * nx;
        positions[v + 1] = p.y + r * ny;
        positions[v + 2] = p.z + r * nz;
        vertexNormals[v + 0] = nx;
        vertexNormals[v + 1] = ny;
        vertexNormals[v + 2] = nz;
        v += 3;
      }
    }

    const indexCount = tSeg * rSeg * 6;
    const IndArray = vertCount > 65535 ? Uint32Array : Uint16Array;
    const indices = new IndArray(indexCount);
    let ii = 0;
    for (let i = 0; i < tSeg; i++) {
      const row = i * rSeg;
      const nextRow = (i + 1) * rSeg;
      for (let j = 0; j < rSeg; j++) {
        const jn = (j + 1) % rSeg;
        const a = row + j;
        const b = row + jn;
        const c = nextRow + j;
        const d = nextRow + jn;
        indices[ii++] = a;
        indices[ii++] = b;
        indices[ii++] = c;
        indices[ii++] = b;
        indices[ii++] = d;
        indices[ii++] = c;
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(vertexNormals, 3));
    geom.computeBoundingSphere();
    return geom;
  }

  /**
   * Build a kit-style connector with a slim shaft and collar-like flares near atom joints.
   * The profile includes a shallow groove inside each collar to produce a dark ring under light.
   * @param {number} length
   * @param {number} centerRadius
   * @param {number} collarRadius
   * @returns {THREE.BufferGeometry}
   */
  function createKitCollaredBondGeometry(length, centerRadius, collarRadius) {
    const L = Math.max(1e-4, length);
    const cR = Math.max(1e-4, centerRadius);
    const kR = Math.max(cR * 1.2, collarRadius);
    const halfL = L * 0.5;
    const profile = [];

    // Fixed flange profile distances in angstrom from each end plane.
    const flangePlateauEnd = KIT_FLANGE_PLATEAU_END;
    const flangeTaperEnd = KIT_FLANGE_TAPER_END;

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
   * Compute axis distance from a sphere center where a cross-section has a given radius.
   * @param {number} sphereRadius
   * @param {number} sectionRadius
   * @returns {number}
   */
  function getSphereSectionAxisDistance(sphereRadius, sectionRadius) {
    const Rs = Math.max(1e-6, Number(sphereRadius) || 0);
    const R0raw = Math.max(1e-6, Number(sectionRadius) || 0);
    const R0 = Math.min(R0raw, Math.max(1e-6, Rs - 1e-4));
    return Math.sqrt(Math.max(0, Rs * Rs - R0 * R0));
  }

  /**
   * Compute where a kit connector should start relative to an atom center so the
   * flange rim (radius R0) contacts the sphere surface. Smaller spheres naturally
   * require deeper insertion because their curvature is higher.
   * @param {number} sphereRadius Rendered atom radius in angstroms.
   * @param {number} flangeRadius Kit flange outer radius R0 in angstroms.
   * @returns {number} Distance from atom center to connector start plane along bond axis.
   */
  function getKitConnectorTrimDistance(sphereRadius, flangeRadius) {
    const R0 = Math.max(1e-6, Number(flangeRadius) || 0);
    let x = getSphereSectionAxisDistance(sphereRadius, R0);
    // Small extra overlap hides seams; tangent geometry already provides the curvature scaling.
    const seatOverlap = Math.min(0.010, Math.max(0.003, R0 * 0.035));
    x = Math.max(0, x - seatOverlap);
    return x;
  }

  /**
   * Compute a connector seat point from an atom center using an axial distance
   * (along bond direction) plus a lateral displacement (in the local normal plane).
   * Lateral displacement is clamped to stay inside the atom sphere.
   * @param {THREE.Vector3} center
   * @param {THREE.Vector3} axisDir Unit vector along bond axis from the atom center.
   * @param {number} seatDistance
   * @param {number} sphereRadius
   * @param {THREE.Vector3} lateralDir Unit vector in the plane normal to axisDir.
   * @param {number} lateralDistance
   * @returns {THREE.Vector3}
   */
  function getCurvedConnectorSeatPoint(center, axisDir, seatDistance, sphereRadius, lateralDir, lateralDistance) {
    const Rs = Math.max(1e-6, Number(sphereRadius) || 0);
    const axis = (axisDir && axisDir.lengthSq && axisDir.lengthSq() > 1e-12)
      ? axisDir.clone().normalize()
      : new THREE.Vector3(0, 1, 0);
    const lateral = (lateralDir && lateralDir.lengthSq && lateralDir.lengthSq() > 1e-12)
      ? lateralDir.clone().normalize()
      : new THREE.Vector3(1, 0, 0);
    const axial = Math.max(0, Math.min(Rs - 1e-6, Number(seatDistance) || 0));
    const maxLateral = Math.sqrt(Math.max(0, Rs * Rs - axial * axial));
    const lat = Math.min(Math.max(0, Number(lateralDistance) || 0), Math.max(0, maxLateral - 1e-4));
    const p = center.clone().addScaledVector(axis, axial);
    if (lat > 1e-8) p.addScaledVector(lateral, lat);
    return p;
  }

  /**
   * Reflect a point across a plane.
   * @param {THREE.Vector3} point
   * @param {THREE.Vector3} planePoint Any point on the plane.
   * @param {THREE.Vector3} planeNormal Plane normal vector.
   * @returns {THREE.Vector3}
   */
  function reflectPointAcrossPlane(point, planePoint, planeNormal) {
    const n = (planeNormal && planeNormal.lengthSq && planeNormal.lengthSq() > 1e-12)
      ? planeNormal.clone().normalize()
      : new THREE.Vector3(0, 1, 0);
    const signed = new THREE.Vector3().subVectors(point, planePoint).dot(n);
    return point.clone().addScaledVector(n, -2 * signed);
  }

  /**
   * Reflect a direction vector across a plane through the origin.
   * @param {THREE.Vector3} vector
   * @param {THREE.Vector3} planeNormal
   * @returns {THREE.Vector3}
   */
  function reflectVectorAcrossPlane(vector, planeNormal) {
    const n = (planeNormal && planeNormal.lengthSq && planeNormal.lengthSq() > 1e-12)
      ? planeNormal.clone().normalize()
      : new THREE.Vector3(0, 1, 0);
    const v = (vector && vector.lengthSq && vector.lengthSq() > 1e-12)
      ? vector.clone()
      : new THREE.Vector3(1, 0, 0);
    return v.addScaledVector(n, -2 * v.dot(n));
  }

  /**
   * Check whether a bond component can be mirrored across the bond-midpoint plane
   * without changing endpoint seat constraints.
   * @param {number} aRadius
   * @param {number} bRadius
   * @param {number} trimA
   * @param {number} trimB
   * @returns {boolean}
   */
  function isMirrorSymmetryEligible(aRadius, bRadius, trimA, trimB) {
    return (
      Math.abs((aRadius || 0) - (bRadius || 0)) <= 1e-4
      && Math.abs((trimA || 0) - (trimB || 0)) <= 1e-4
    );
  }

  /**
   * Derive a darker label color from the atom hue using HSV brightness scaling.
   * @param {THREE.Color} atomColor
   * @param {number} dimming Brightness scale in [0,1], lower values are darker.
   * @returns {string}
   */
  function getReadableLabelDarkenedHex(atomColor, dimming) {
    const c = atomColor || new THREE.Color(0xffffff);
    const rr = Math.max(0, Math.min(1, c.r));
    const gg = Math.max(0, Math.min(1, c.g));
    const bb = Math.max(0, Math.min(1, c.b));
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const d = max - min;

    // Convert RGB -> HSV so we can darken via V (brightness) while preserving hue.
    let h = 0;
    if (d > 1e-8) {
      if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
      else if (max === gg) h = ((bb - rr) / d + 2) / 6;
      else h = ((rr - gg) / d + 4) / 6;
    }
    const s = max <= 1e-8 ? 0 : d / max;
    const v = max;

    const factor = Math.max(0, Math.min(1, Number.isFinite(dimming) ? dimming : 0.36));
    const darkV = Math.max(0.02, Math.min(1, v * factor));
    const [r, g, b] = hsvToRgb(h, s, darkV);
    const out = new THREE.Color(r, g, b);
    return `#${out.getHexString()}`;
  }

  /**
   * Build a transparent text texture for one atom label.
   * @param {string} symbol
   * @param {string} textHex
   * @param {string} strokeHex
   * @returns {THREE.CanvasTexture}
   */
  function makeAtomLabelTexture(symbol, textHex, strokeHex) {
    const text = typeof symbol === 'string' ? symbol.trim().slice(0, 3) : '?';
    const fg = normalizeHexColor(textHex, '#f3f7ff');
    const stroke = normalizeHexColor(strokeHex, '#000000');
    const size = 1024;
    const fontScale = 20;
    const textX = Math.round(size * 0.5);
    const textY = Math.round(size * 0.515);
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let fontPx = Math.round((text.length >= 3 ? 108 : 128) * fontScale);
    const family = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    ctx.font = `bold ${fontPx}px ${family}`;
    // Prevent clipping when large font scales are used.
    const maxWidth = size * 0.82;
    const measured = Math.max(1, ctx.measureText(text).width || 1);
    if (measured > maxWidth) {
      fontPx = Math.max(72, Math.round(fontPx * (maxWidth / measured)));
      ctx.font = `bold ${fontPx}px ${family}`;
    }
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    // Increase border thickness to stabilize edge visibility while rotating.
    ctx.lineWidth = Math.max(10, Math.round(fontPx * 0.028));
    ctx.strokeStyle = stroke;
    ctx.fillStyle = fg;
    // Slight horizontal squeeze for narrower glyphs without changing height.
    const fontWidthScale = 0.9;
    ctx.save();
    ctx.translate(textX, textY);
    ctx.scale(fontWidthScale, 1);
    ctx.strokeText(text, 0, 0);
    ctx.fillText(text, 0, 0);
    ctx.restore();
    const tex = new THREE.CanvasTexture(c);
    if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    else if ('encoding' in tex && THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.premultiplyAlpha = true;
    try { tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1); } catch { }
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Get a curved, camera-facing cap geometry used for engraved labels.
   * The cap is built from a plane patch projected onto a sphere so UV text
   * distortion is much smaller than mapping over a full sphere.
   * @returns {THREE.BufferGeometry}
   */
  function getAtomLabelCapGeometry() {
    if (atomLabelCapGeometry) return atomLabelCapGeometry;
    const patchWidth = 0.66;
    const patchHeight = 0.56;
    const segX = 28;
    const segY = 24;
    const radius = 0.5;
    const curvatureScale = 1.5;
    const base = new THREE.PlaneGeometry(patchWidth, patchHeight, segX, segY);
    const pos = base.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const nx = px / (radius * curvatureScale);
      const ny = py / (radius * curvatureScale);
      const rr = nx * nx + ny * ny;
      const nz = rr < 0.998 ? Math.sqrt(1 - rr) : 0.045;
      pos.setXYZ(i, nx * radius, ny * radius, nz * radius);
    }
    pos.needsUpdate = true;
    try { base.computeVertexNormals(); } catch { }
    atomLabelCapGeometry = base;
    return atomLabelCapGeometry;
  }

  /**
   * Create a surface label material that renders only text pixels.
   * @param {string} symbol
   * @param {string} textHex
   * @param {string} strokeHex
   * @returns {THREE.Material}
   */
  function createAtomLabelSurfaceMaterial(symbol, textHex, strokeHex) {
    const tex = makeAtomLabelTexture(symbol, textHex, strokeHex);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: tex,
      // Use alpha test cutout (instead of alpha blending) to avoid triangle
      // sorting artifacts when the curved label shell is viewed at glancing angles.
      transparent: false,
      alphaTest: 0.18,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -0.35,
      polygonOffsetUnits: -0.35,
    });
    // Keep label colors stable regardless of scene lighting/tone mapping.
    if ('toneMapped' in mat) mat.toneMapped = false;
    return mat;
  }

  /**
   * Build atom sphere meshes for the current volume.
   * Radius and color are derived from atomic metadata when available.
   * @param {{atoms:Array<{Z:number,x:number,y:number,z:number}>,units?:string}} vol
   * @returns {THREE.Group}
  */
  function buildAtoms(vol) {
    const group = new THREE.Group();
    atomLabelTrackTargets.length = 0;
    // Atoms (spheres)
    const profile = getMoleculeStyleProfile();
    const isToonStyle = profile.key === 'toon';
    const isGlossyStyle = profile.key === 'glossy';
    const isStylizedStyle = isToonStyle || isGlossyStyle;
    const sphere = new THREE.SphereGeometry(
      0.5,
      profile.sphereWidthSegments,
      profile.sphereHeightSegments
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
    const labelMaterialCache = new Map();
    const toAng = (vol.units === 'angstrom');
    const hydrogenDisplayRadius = 0.5 * getCovalentRadiusAngstrom(1) * getAtomRenderScaleFactor(1);
    const baseOutlineScale = isGlossyStyle ? 1.05 : isToonStyle ? 1.08 : 1.0;
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
      if (showAtomLabels) {
        const symbol = getElementSymbol(z);
        const labelHex = '#ffffff';
        const labelStrokeHex = getReadableLabelDarkenedHex(atomColor, 0.25);
        const labelKey = `${symbol}:${labelHex}:${labelStrokeHex}`;
        let labelMat = labelMaterialCache.get(labelKey);
        if (!labelMat) {
          labelMat = createAtomLabelSurfaceMaterial(symbol, labelHex, labelStrokeHex);
          labelMaterialCache.set(labelKey, labelMat);
        }
        const label = new THREE.Mesh(getAtomLabelCapGeometry(), labelMat);
        // Keep label tightly seated on the atom shell while avoiding z-fighting.
        const labelLift = isGlossyStyle ? 1.009 : isToonStyle ? 1.008 : 1.007;
        // Double visible label size while preserving a small radial lift.
        const labelSizeScale = 1.425;
        label.scale.set(labelLift * labelSizeScale, labelLift * labelSizeScale, labelLift);
        label.renderOrder = 52;
        label.userData = { type: 'atomLabel' };
        mesh.add(label);
        atomLabelTrackTargets.push(label);
      }
      mesh.userData = { type: 'atom', index: group.children.length };
      group.add(mesh);
    }
    return group;
  }

  const atomLabelParentWorldQuat = new THREE.Quaternion();
  const atomLabelParentInvQuat = new THREE.Quaternion();
  const atomLabelCameraWorldQuat = new THREE.Quaternion();
  /**
   * Rotate each atom-label shell so its text patch stays visible to the camera.
   * Labels remain embedded on the atom surface while tracking the current view.
   */
  function updateTrackedAtomLabelOrientation() {
    if (!showAtomLabels || atomLabelTrackTargets.length === 0) return;
    camera.getWorldQuaternion(atomLabelCameraWorldQuat);
    for (const label of atomLabelTrackTargets) {
      if (!label || !label.parent) continue;
      label.parent.getWorldQuaternion(atomLabelParentWorldQuat);
      atomLabelParentInvQuat.copy(atomLabelParentWorldQuat).invert();
      // Keep label upright in screen space by matching camera orientation.
      label.quaternion.copy(atomLabelParentInvQuat).multiply(atomLabelCameraWorldQuat);
    }
  }

  /**
   * Build per-atom bond-render records in angstrom units.
   * @param {{atoms:Array<{Z:number,x:number,y:number,z:number}>,units?:string}} vol
   * @param {{includeRenderColor?:boolean}=} options
   * @returns {Array<{pos:THREE.Vector3,Z:number,color:THREE.Color,bondColor:THREE.Color,displayRadius:number}>}
   */
  function buildBondAtomRecords(vol, options = {}) {
    const includeRenderColor = options.includeRenderColor !== false;
    const atomPositions = [];
    const toAng = (vol.units === 'angstrom');
    for (const a of vol.atoms) {
      const z = a.Z | 0;
      const px = toAng ? a.x : a.x * BOHR_TO_ANG;
      const py = toAng ? a.y : a.y * BOHR_TO_ANG;
      const pz = toAng ? a.z : a.z * BOHR_TO_ANG;
      const pos = new THREE.Vector3(px, py, pz);
      const atomColor = includeRenderColor ? getAtomRenderColor(z) : null;
      atomPositions.push({
        pos,
        Z: z,
        color: atomColor,
        bondColor: atomColor ? getBondRenderColor(atomColor, z) : null,
        // Sphere geometry radius is 0.5, then scaled by the style-dependent atom scale factor.
        displayRadius: 0.5 * getCovalentRadiusAngstrom(z) * getAtomRenderScaleFactor(z),
      });
    }
    return atomPositions;
  }

  /**
   * Compute one bond segment placement after optional per-end trimming.
   * @param {THREE.Vector3} aPos
   * @param {THREE.Vector3} bPos
   * @param {number} trimA
   * @param {number} trimB
   * @param {number} minGeomLen
   * @returns {{valid:boolean,len:number,dirNorm:THREE.Vector3,geomLen:number,mid:THREE.Vector3,aEnd:THREE.Vector3,bEnd:THREE.Vector3}}
   */
  function computeBondSegmentPlacement(aPos, bPos, trimA = 0, trimB = 0, minGeomLen = 0.0) {
    const dir = new THREE.Vector3().subVectors(bPos, aPos);
    const len = dir.length();
    if (len < 1e-6) {
      return {
        valid: false,
        len: 0,
        dirNorm: new THREE.Vector3(0, 1, 0),
        geomLen: 0,
        mid: new THREE.Vector3(),
        aEnd: aPos.clone(),
        bEnd: bPos.clone(),
      };
    }
    const dirNorm = dir.clone().multiplyScalar(1 / Math.max(1e-12, len));
    const aEnd = aPos.clone().addScaledVector(dirNorm, trimA);
    const bEnd = aPos.clone().addScaledVector(dirNorm, len - trimB);
    const geomLen = Math.max(0, len - trimA - trimB);
    const mid = new THREE.Vector3().addVectors(aEnd, bEnd).multiplyScalar(0.5);
    return {
      valid: geomLen >= Math.max(0, minGeomLen),
      len,
      dirNorm,
      geomLen,
      mid,
      aEnd,
      bEnd,
    };
  }

  /**
   * Build bond cylinder meshes using covalent-radii distance heuristics.
   * @param {{atoms:Array<{Z:number,x:number,y:number,z:number}>,units?:string}} vol
   * @returns {THREE.Group}
   */
  function buildBonds(vol) {
    const group = new THREE.Group();
    const profile = getMoleculeStyleProfile();
    const isToonStyle = profile.key === 'toon';
    const isGlossyStyle = profile.key === 'glossy';
    const isKitStyle = profile.key === 'kit';
    const isStylizedStyle = !!profile.stylizedMolecule;
    const usesTrimmedConnector = !!profile.usesTrimmedConnector;
    const atomPositions = buildBondAtomRecords(vol);
    const bondMat = getBondMaterial();
    const stylizedBondOutlineMat = getStylizedBondOutlineMaterial();
    const stylizedBondHighlightMat = getStylizedBondHighlightMaterial();
    const up = new THREE.Vector3(0, 1, 0);
    const glossyCenterRadius = getGlossyBondCenterRadius();
    const glossyEndRadius = getGlossyBondEndRadius();
    const kitCenterRadius = profile.bondRadius;
    const kitCollarRadius = profile.kitCollarRadius || 0.114;
    const bondRadius = isGlossyStyle ? glossyCenterRadius : profile.bondRadius;
    const bondRadialSegments = profile.bondRadialSegments;
    const bondHeightSegments = profile.bondHeightSegments;
    const bondEdges = collectBondCandidates(atomPositions);
    const multiBondRenderingEnabled = !!showMultiBonds;
    if (multiBondRenderingEnabled) inferBondOrders(atomPositions, bondEdges);
    const aromaticRings = multiBondRenderingEnabled
      ? inferAromaticSixRings(atomPositions, bondEdges)
      : [];
    const bondAdjacency = multiBondRenderingEnabled
      ? buildBondAdjacency(bondEdges, atomPositions.length)
      : [];
    const componentSpacing = Math.max(0.13, bondRadius * 2.1);

    /**
     * Build and add one visible connector component for a bond.
     * @param {{bondColor:THREE.Color}} a
     * @param {{bondColor:THREE.Color}} b
     * @param {number} i
     * @param {number} j
     * @param {THREE.Vector3} dirNorm
     * @param {number} len
     * @param {number} geomLen
     * @param {THREE.Vector3} mid
     * @param {number} trimA
     * @param {number} trimB
     * @param {number} order
     * @param {number} componentOffsetU
     * @param {number} componentOffsetV
     */
    function addBondComponent(a, b, i, j, dirNorm, len, geomLen, mid, trimA, trimB, order, componentOffsetU, componentOffsetV) {
      const geom = isGlossyStyle
        ? createGlossyBondConnectorGeometry(geomLen, bondRadius, glossyEndRadius)
        : isKitStyle
          ? createKitCollaredBondGeometry(geomLen, bondRadius, kitCollarRadius)
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
        bondOrder: order,
        bondComponentOffset: Number.isFinite(componentOffsetU) ? componentOffsetU : 0,
        bondComponentOffsetU: Number.isFinite(componentOffsetU) ? componentOffsetU : 0,
        bondComponentOffsetV: Number.isFinite(componentOffsetV) ? componentOffsetV : 0,
        connectorStyle: isKitStyle ? 'kit' : isGlossyStyle ? 'glossy' : 'default',
        connectorCenterRadius: bondRadius,
        connectorEndRadius: isKitStyle ? kitCollarRadius : isGlossyStyle ? glossyEndRadius : bondRadius,
      };
      group.add(cyl);
    }

    /**
     * Build one curved kit multi-bond component using a tube shaft plus
     * fixed-shape flanges at each atom-side endpoint.
     * @param {number} i
     * @param {number} j
     * @param {number} order
     * @param {number} len
     * @param {number} geomLen
     * @param {number} trimA
     * @param {number} trimB
     * @param {THREE.Vector3} aPos
     * @param {THREE.Vector3} bPos
     * @param {number} aRadius
     * @param {number} bRadius
     * @param {THREE.Vector3} dirNorm
     * @param {THREE.Vector3} offsetDirection
     * @param {number} offsetDistance
     * @param {number} componentOffsetU
     * @param {number} componentOffsetV
     */
    function addKitCurvedBondComponent(i, j, order, len, geomLen, trimA, trimB, aPos, bPos, aRadius, bRadius, dirNorm, offsetDirection, offsetDistance, componentOffsetU, componentOffsetV) {
      const bondMid = new THREE.Vector3().addVectors(aPos, bPos).multiplyScalar(0.5);
      const symmetricEligible = isMirrorSymmetryEligible(aRadius, bRadius, trimA, trimB);

      const seatSpreadTarget = offsetDistance * KIT_MULTI_BOND_SEAT_SPREAD_GAIN;
      // Enforce bond-centered symmetry for multi-bond seats.
      const seatAxial = Math.max(0, Math.min(Number(trimA) || 0, Number(trimB) || 0));
      const maxLatA = Math.sqrt(Math.max(0, aRadius * aRadius - seatAxial * seatAxial));
      const maxLatB = Math.sqrt(Math.max(0, bRadius * bRadius - seatAxial * seatAxial));
      const seatSpread = Math.max(0, Math.min(seatSpreadTarget, maxLatA, maxLatB));
      // Place each endpoint on its own component-specific seat around the atom.
      const start = getCurvedConnectorSeatPoint(aPos, dirNorm, seatAxial, aRadius, offsetDirection, seatSpread);
      let end = getCurvedConnectorSeatPoint(
        bPos,
        dirNorm.clone().multiplyScalar(-1),
        seatAxial,
        bRadius,
        offsetDirection,
        seatSpread
      );
      if (symmetricEligible) {
        end = reflectPointAcrossPlane(start, bondMid, dirNorm);
      }
      const startNormal = new THREE.Vector3().subVectors(start, aPos);
      if (startNormal.lengthSq() < 1e-10) startNormal.copy(dirNorm); else startNormal.normalize();
      let endNormal = new THREE.Vector3().subVectors(end, bPos);
      if (symmetricEligible) {
        endNormal = reflectVectorAcrossPlane(startNormal, dirNorm).normalize();
      } else if (endNormal.lengthSq() < 1e-10) {
        endNormal.copy(dirNorm).multiplyScalar(-1);
      } else {
        endNormal.normalize();
      }

      // Place flange base planes where their outer radius matches sphere cross-sections.
      const flangeBaseStartAxial = Math.max(
        0,
        getSphereSectionAxisDistance(aRadius, kitCollarRadius) - KIT_FLANGE_SPHERE_OVERLAP
      );
      const flangeBaseEndAxial = Math.max(
        0,
        getSphereSectionAxisDistance(bRadius, kitCollarRadius) - KIT_FLANGE_SPHERE_OVERLAP
      );
      const flangeBaseStart = aPos.clone().addScaledVector(startNormal, flangeBaseStartAxial);
      let flangeBaseEnd = bPos.clone().addScaledVector(endNormal, flangeBaseEndAxial);
      if (symmetricEligible) {
        flangeBaseEnd = reflectPointAcrossPlane(flangeBaseStart, bondMid, dirNorm);
      }

      // Compute flange tip centers first, then apply a small adaptive overlap per end.
      // High-bend/short-chord cases get less overlap to avoid tube self-intersection
      // artifacts at one endpoint.
      const flangeTipStart = flangeBaseStart.clone().addScaledVector(startNormal, KIT_FLANGE_TAPER_END);
      const flangeTipEnd = flangeBaseEnd.clone().addScaledVector(endNormal, KIT_FLANGE_TAPER_END);
      const tipChordLen = Math.max(1e-6, flangeTipStart.distanceTo(flangeTipEnd));
      const axisDotStart = Math.abs(startNormal.dot(dirNorm));
      const axisDotEnd = Math.abs(endNormal.dot(dirNorm));
      const bendStart = Math.sqrt(Math.max(0, 1 - axisDotStart * axisDotStart));
      const bendEnd = Math.sqrt(Math.max(0, 1 - axisDotEnd * axisDotEnd));
      const overlapLimitByLength = Math.max(0.0005, tipChordLen * 0.12);
      const overlapStart = Math.min(
        overlapLimitByLength,
        Math.max(0.0005, KIT_FLANGE_SHAFT_OVERLAP * (1 - 0.7 * bendStart))
      );
      const overlapEnd = Math.min(
        overlapLimitByLength,
        Math.max(0.0005, KIT_FLANGE_SHAFT_OVERLAP * (1 - 0.7 * bendEnd))
      );
      const shaftStart = flangeTipStart.clone().addScaledVector(startNormal, -overlapStart);
      let shaftEnd = flangeTipEnd.clone().addScaledVector(endNormal, -overlapEnd);
      if (symmetricEligible) {
        shaftEnd = reflectPointAcrossPlane(shaftStart, bondMid, dirNorm);
      }

      // Build one smooth cubic arc that enforces endpoint tangents along
      // the local sphere normals. This removes short-bond seam gaps while
      // keeping a parabola-like center bulge.
      const chordLen = Math.max(1e-6, shaftStart.distanceTo(shaftEnd));
      const chordDir = new THREE.Vector3().subVectors(shaftEnd, shaftStart);
      const chordDirLen = Math.max(1e-8, chordDir.length());
      chordDir.multiplyScalar(1 / chordDirLen);
      let lateralDir = (offsetDirection && offsetDirection.lengthSq && offsetDirection.lengthSq() > 1e-12)
        ? offsetDirection.clone().normalize()
        : getBondPerpendicular(dirNorm);
      lateralDir.addScaledVector(chordDir, -lateralDir.dot(chordDir));
      if (lateralDir.lengthSq() < 1e-10) lateralDir = getBondPerpendicular(chordDir);
      lateralDir.normalize();

      const arcMidBase = new THREE.Vector3().addVectors(shaftStart, shaftEnd).multiplyScalar(0.5);
      const bulgeGain = order >= 3 ? 1.75 : 1.4;
      const arcBulge = Math.max(
        0.008,
        Math.min(chordLen * KIT_CURVED_SHORT_CHORD_BULGE_FRACTION, offsetDistance * bulgeGain)
      );
      const arcMidTarget = arcMidBase.addScaledVector(lateralDir, arcBulge);

      const endHandleLenRaw = chordLen * KIT_CURVED_HANDLE_SCALE
        + offsetDistance * KIT_CURVED_HANDLE_OFFSET_SCALE * Math.max(1.0, KIT_DOUBLE_BOND_CURVE_GAIN * 0.65);
      const baseHandleLen = Math.max(0.02, Math.min(chordLen * 0.5, endHandleLenRaw));
      const minHandleLen = Math.max(0.008, chordLen * 0.05);
      const maxHandleLen = Math.max(minHandleLen, chordLen * 0.75);

      // Solve cubic midpoint relation in least squares:
      // B(0.5) = (P0 + 3P1 + 3P2 + P3)/8 with
      // P1 = P0 + n0*h0, P2 = P3 - n1*h1.
      const midpoint = new THREE.Vector3().addVectors(shaftStart, shaftEnd).multiplyScalar(0.5);
      const rhs = new THREE.Vector3().subVectors(arcMidTarget, midpoint).multiplyScalar(8 / 3);
      const ab = startNormal.dot(endNormal);
      const det = Math.max(1e-6, 1 - ab * ab);
      const aR = startNormal.dot(rhs);
      const bR = endNormal.dot(rhs);
      const solvedH0 = (aR - ab * bR) / det;
      const solvedH1 = (-bR + ab * aR) / det;

      const blend = 0.55;
      const h0 = Math.max(minHandleLen, Math.min(maxHandleLen, baseHandleLen * (1 - blend) + solvedH0 * blend));
      const h1 = Math.max(minHandleLen, Math.min(maxHandleLen, baseHandleLen * (1 - blend) + solvedH1 * blend));
      const control1 = shaftStart.clone().addScaledVector(startNormal, h0);
      const control2 = shaftEnd.clone().addScaledVector(endNormal, -h1);

      const shaftCurve = new THREE.CubicBezierCurve3(shaftStart, control1, control2, shaftEnd);
      const shaftLen = Math.max(1e-6, shaftCurve.getLength());
      const shaftSegments = Math.max(24, Math.min(96, Math.ceil(shaftLen * 36)));
      const shaftGeom = createTransportTubeGeometry(
        shaftCurve,
        shaftSegments,
        bondRadius,
        22,
        lateralDir,
        startNormal,
        endNormal
      );

      const flangeStartGeom = createKitFlangeGeometry(bondRadius, kitCollarRadius);
      const flangeEndGeom = createKitFlangeGeometry(bondRadius, kitCollarRadius);
      const shaft = new THREE.Mesh(shaftGeom, bondMat);
      const flangeStart = new THREE.Mesh(flangeStartGeom, bondMat);
      const flangeEnd = new THREE.Mesh(flangeEndGeom, bondMat);

      // Align flange axis with local sphere normals.
      flangeStart.position.copy(flangeBaseStart);
      flangeStart.quaternion.setFromUnitVectors(up, startNormal);
      flangeEnd.position.copy(flangeBaseEnd);
      flangeEnd.quaternion.setFromUnitVectors(up, endNormal);

      const connector = new THREE.Group();
      connector.add(shaft, flangeStart, flangeEnd);
      connector.userData = {
        baseLen: len,
        baseGeomLen: geomLen,
        trimA,
        trimB,
        i,
        j,
        bondOrder: Math.max(2, Math.min(3, order | 0)),
        bondComponentOffset: Number.isFinite(componentOffsetU) ? componentOffsetU : 0,
        bondComponentOffsetU: Number.isFinite(componentOffsetU) ? componentOffsetU : 0,
        bondComponentOffsetV: Number.isFinite(componentOffsetV) ? componentOffsetV : 0,
        connectorStyle: 'kitCurved',
        connectorCenterRadius: bondRadius,
        connectorEndRadius: kitCollarRadius,
      };
      group.add(connector);
    }

    for (const edge of bondEdges) {
      const i = edge.i;
      const j = edge.j;
      const a = atomPositions[i];
      const b = atomPositions[j];
      const order = multiBondRenderingEnabled ? Math.max(1, Math.min(3, edge.order | 0)) : 1;
      const basePlacement = computeBondSegmentPlacement(a.pos, b.pos, 0, 0, 0);
      if (!basePlacement.valid) continue;
      const len = basePlacement.len;
      const dirNorm = basePlacement.dirNorm;

      let trimA = 0;
      let trimB = 0;
      let geomLen = basePlacement.geomLen;
      let mid = basePlacement.mid;
      if (usesTrimmedConnector) {
        const connectorEndRadius = isGlossyStyle ? glossyEndRadius : kitCollarRadius;
        if (isGlossyStyle) {
          // Stop glossy bonds near the atom surfaces with a slight inset.
          const trimInset = Math.min(0.03, Math.max(0.012, connectorEndRadius * 0.18));
          trimA = Math.max(0, a.displayRadius - trimInset);
          trimB = Math.max(0, b.displayRadius - trimInset);
        } else {
          // Kit seating depends on sphere curvature; small atoms need deeper insertion.
          trimA = getKitConnectorTrimDistance(a.displayRadius, connectorEndRadius);
          trimB = getKitConnectorTrimDistance(b.displayRadius, connectorEndRadius);
        }
        const maxTrim = Math.max(0, len - (isKitStyle ? 0.12 : 0.16));
        const trimSum = trimA + trimB;
        if (trimSum > maxTrim && trimSum > 1e-8) {
          const s = maxTrim / trimSum;
          trimA *= s;
          trimB *= s;
        }
        const minGeomLen = isKitStyle ? 0.06 : 0.08;
        const trimmedPlacement = computeBondSegmentPlacement(a.pos, b.pos, trimA, trimB, minGeomLen);
        if (!trimmedPlacement.valid) continue;
        geomLen = trimmedPlacement.geomLen;
        mid = trimmedPlacement.mid;
      }

      const offsets = multiBondRenderingEnabled ? getBondComponentOffsets(order) : [[0, 0]];
      if (offsets.length <= 1) {
        addBondComponent(a, b, i, j, dirNorm, len, geomLen, mid, trimA, trimB, order, 0, 0);
        continue;
      }
      const perp = getBondPlaneOffsetDirection(i, j, dirNorm, atomPositions, bondAdjacency);
      const perpOrtho = new THREE.Vector3().crossVectors(dirNorm, perp).normalize();
      for (const [offsetUUnit, offsetVUnit] of offsets) {
        const componentOffsetUBase = offsetUUnit * componentSpacing;
        const componentOffsetVBase = offsetVUnit * componentSpacing;
        const [componentOffsetU, componentOffsetV] = orientBondComponentOffset(
          order,
          componentOffsetUBase,
          componentOffsetVBase,
          isKitStyle
        );
        const componentVec = perp.clone().multiplyScalar(componentOffsetU).addScaledVector(perpOrtho, componentOffsetV);
        if (isKitStyle && order >= 2) {
          const offsetDistance = componentVec.length();
          const offsetDirection = offsetDistance > 1e-8
            ? componentVec.clone().multiplyScalar(1 / offsetDistance)
            : perp.clone();
          addKitCurvedBondComponent(
            i, j, order, len, geomLen, trimA, trimB,
            a.pos, b.pos, a.displayRadius, b.displayRadius, dirNorm,
            offsetDirection, offsetDistance, componentOffsetU, componentOffsetV
          );
          continue;
        }
        const componentMid = mid.clone().add(componentVec);
        addBondComponent(
          a, b, i, j, dirNorm, len, geomLen, componentMid, trimA, trimB, order, componentOffsetU, componentOffsetV
        );
      }
    }
    if (multiBondRenderingEnabled && aromaticRings.length) {
      for (const ring of aromaticRings) {
        addAromaticDashedRing(group, ring, atomPositions);
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
    const atomPositions = buildBondAtomRecords(vol, { includeRenderColor: false }).map((a) => ({ pos: a.pos }));
    const uniqueEdges = [];
    const seenEdgeKeys = new Set();
    for (const obj of bondGroup.children) {
      if (!obj || !obj.userData) continue;
      const i = obj.userData.i;
      const j = obj.userData.j;
      if (!Number.isInteger(i) || !Number.isInteger(j) || i === j) continue;
      const a = i < j ? i : j;
      const b = i < j ? j : i;
      const key = `${a}:${b}`;
      if (seenEdgeKeys.has(key)) continue;
      seenEdgeKeys.add(key);
      uniqueEdges.push({ i: a, j: b });
    }
    const bondAdjacency = buildBondAdjacency(uniqueEdges, atomPositions.length);
    const up = new THREE.Vector3(0, 1, 0);
    let needsFullRebuild = false;
    for (const obj of bondGroup.children) {
      if (!obj || !obj.userData) continue;
      const {
        i, j, baseLen, baseGeomLen, trimA = 0, trimB = 0,
        connectorStyle = 'default',
        bondComponentOffset = 0,
        bondComponentOffsetU,
        bondComponentOffsetV = 0,
        connectorCenterRadius,
        connectorEndRadius
      } = obj.userData;
      if (!obj.isMesh) {
        // Curved kit connectors are composite groups; rebuild to keep geometry consistent.
        if (connectorStyle === 'kitCurved') { needsFullRebuild = true; break; }
        continue;
      }
      if (i == null || j == null) continue;
      const aInfo = atomPositions[i];
      const bInfo = atomPositions[j];
      if (!aInfo || !bInfo) continue;
      const aPos = aInfo.pos;
      const bPos = bInfo.pos;
      const placement = computeBondSegmentPlacement(aPos, bPos, trimA, trimB, 1e-4);
      if (!placement.valid) continue;
      const len = placement.len;
      const dirNorm = placement.dirNorm;
      let geomLen = placement.geomLen;
      let mid = placement.mid;
      const componentOffsetUValue = Number.isFinite(bondComponentOffsetU)
        ? bondComponentOffsetU
        : (Number.isFinite(bondComponentOffset) ? bondComponentOffset : 0);
      const componentOffsetVValue = Number.isFinite(bondComponentOffsetV) ? bondComponentOffsetV : 0;
      if (Math.abs(componentOffsetUValue) > 1e-8 || Math.abs(componentOffsetVValue) > 1e-8) {
        const perp = getBondPlaneOffsetDirection(i, j, dirNorm, atomPositions, bondAdjacency);
        const perpOrtho = new THREE.Vector3().crossVectors(dirNorm, perp).normalize();
        mid.addScaledVector(perp, componentOffsetUValue);
        mid.addScaledVector(perpOrtho, componentOffsetVValue);
      }
      obj.position.copy(mid);
      obj.quaternion.setFromUnitVectors(up, dirNorm);
      if (connectorStyle === 'kit') {
        // Rebuild kit connector geometry to preserve fixed flange height/profile when bond length changes.
        const prevGeom = obj.geometry;
        const newGeom = createKitCollaredBondGeometry(
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
    if (needsFullRebuild) rebuildBondsFromAtoms();
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
      bondGroup.traverse(obj => {
        if (obj.isMesh || obj.isLine) {
          obj.geometry?.dispose?.(); // keep shared material caches
        }
      });
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
    updateTrackedAtomLabelOrientation();

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
  const toggleMultiBonds = document.getElementById('showMultiBonds');
  const toggleAtomLabels = document.getElementById('showAtomLabels');
  const elementColors = document.getElementById('elementColors');
  const elementColorBtn = document.getElementById('elementColorBtn');
  const elementColorOverlay = document.getElementById('elementColorOverlay');
  const elementColorClose = document.getElementById('elementColorClose');
  const periodicTableViewport = document.getElementById('periodicTableViewport');
  const periodicTableCanvas = document.getElementById('periodicTableCanvas');
  const elementColorName = document.getElementById('elementColorName');
  const elementColorPicker = document.getElementById('elementColorPicker');
  const elementColorResetOne = document.getElementById('elementColorResetOne');
  const elementColorResetAll = document.getElementById('elementColorResetAll');
  const toggleBox = document.getElementById('showBox');
  const toggleAxes = document.getElementById('showAxes');
  const saveBtn = document.getElementById('saveBtn');
  const batchBtn = document.getElementById('batchBtn');
  const savePresetBtn = document.getElementById('savePresetBtn');
  const loadPresetBtn = document.getElementById('loadPresetBtn');
  const presetInput = document.getElementById('presetInput');
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
  const pubchemMetaContent = document.getElementById('pubchemMetaContent');
  const copyXYZBtn = document.getElementById('copyXYZ');
  const downloadXYZBtn = document.getElementById('downloadXYZ');
  // View controls
  const shiftX = document.getElementById('shiftX');
  const shiftY = document.getElementById('shiftY');
  const shiftZ = document.getElementById('shiftZ');
  const centerMassBtn = document.getElementById('centerMassBtn');
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
  if (toggleMultiBonds) showMultiBonds = !!toggleMultiBonds.checked;
  if (toggleAtomLabels) showAtomLabels = !!toggleAtomLabels.checked;
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
  const editToolboxEl = document.getElementById('editToolbox');
  const editToolMoveBtn = document.getElementById('editToolMoveBtn');
  const editToolAddBtn = document.getElementById('editToolAddBtn');
  const editToolDeleteBtn = document.getElementById('editToolDeleteBtn');
  const editAddPaneEl = document.getElementById('editAddPane');
  const editAddSearchEl = document.getElementById('editAddSearch');
  const editAddSuggestionsEl = document.getElementById('editAddSuggestions');
  const editAddQuickEl = document.getElementById('editAddQuick');
  const editAddCurrentEl = document.getElementById('editAddCurrent');
  const editAddCursorHudEl = document.getElementById('editAddCursorHud');
  const editCursorBadgeEl = document.getElementById('editCursorBadge');
  const editCursorBadgeModeEl = document.getElementById('editCursorBadgeMode');
  const editCursorBadgeElementEl = document.getElementById('editCursorBadgeElement');
  const editCursorBadgeBondEl = document.getElementById('editCursorBadgeBond');
  const shortcutRibbon = document.getElementById('shortcutRibbon');
  const hintEl = document.getElementById('hint');
  const emptyStateEl = document.getElementById('emptyState');
  const emptyStateCardEl = document.getElementById('emptyStateCard');
  const emptyStateDropZoneEl = document.getElementById('emptyStateDropZone');
  const emptyStateOpenBtn = document.getElementById('emptyStateOpenBtn');
  const emptyStateSampleBtn = document.getElementById('emptyStateSampleBtn');
  const pubchemQueryInput = document.getElementById('pubchemQuery');
  const pubchemLoadBtn = document.getElementById('pubchemLoadBtn');
  const pubchemSuggestionsEl = document.getElementById('pubchemSuggestions');
  let global2CComponentMode = (componentSelect && componentSelect.value) || 'alphaRe';

  const triggerOpenFiles = () => fileInput.click();
  openBtn.onclick = triggerOpenFiles;
  if (emptyStateOpenBtn) emptyStateOpenBtn.onclick = triggerOpenFiles;
  if (emptyStateSampleBtn) {
    emptyStateSampleBtn.onclick = async () => {
      const ok = await loadSampleCube();
      if (!ok) setHintMessage('Could not load sample.cube. Check assets/data/sample.cube.');
    };
  }
  // Toggle surface rendering button
  /**
   * Refresh the surface-toggle button label.
   */
  const updateSurfBtn = () => { surfBtn.textContent = showSurfaces ? 'Hide Surfaces' : 'Show Surfaces'; };
  updateSurfBtn();

  const PERIODIC_TABLE_LAYOUT = [
    ['H', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'He'],
    ['Li', 'Be', '', '', '', '', '', '', '', '', '', '', 'B', 'C', 'N', 'O', 'F', 'Ne'],
    ['Na', 'Mg', '', '', '', '', '', '', '', '', '', '', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar'],
    ['K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr'],
    ['Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe'],
    ['Cs', 'Ba', 'La', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn'],
    ['Fr', 'Ra', 'Ac', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', ''],
    ['', '', '', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', '', '', '', ''],
  ];
  const periodicNodesByZ = new Map();
  const periodicPickTargets = [];
  let periodicTableRenderer = null;
  let periodicTableScene = null;
  let periodicTableCamera = null;
  let periodicTableControls = null;
  let periodicTableRoot = null;
  let periodicTableRaf = 0;
  const periodicRaycaster = new THREE.Raycaster();
  const periodicPointer = new THREE.Vector2();
  let selectedElementForEditor = 6;
  const PERIODIC_TABLE_NODE_SCALE = 1.25;
  const PERIODIC_TABLE_SELECTED_SCALE = 1.3;
  const PERIODIC_TABLE_SPHERE_RADIUS = 0.34;
  const PERIODIC_TABLE_OUTLINE_SCALE = 1.12;
  const PERIODIC_TABLE_VIEW_MARGIN = 1.08;

  /**
   * Build a compact symbol sprite for one periodic table sphere.
   * @param {string} symbol
   * @returns {THREE.Sprite}
   */
  function makePeriodicSymbolSprite(symbol) {
    const txt = (symbol || '?').trim().slice(0, 3);
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 54px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    ctx.fillStyle = 'rgba(235,242,252,0.95)';
    ctx.strokeStyle = 'rgba(10,16,26,0.8)';
    ctx.lineWidth = 5;
    ctx.strokeText(txt, c.width * 0.5, c.height * 0.52);
    ctx.fillText(txt, c.width * 0.5, c.height * 0.52);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(0.72, 0.36, 1);
    spr.renderOrder = 22;
    return spr;
  }

  /**
   * Return the 3D position for a periodic table slot.
   * @param {number} row
   * @param {number} col
   * @returns {THREE.Vector3}
   */
  function getPeriodicTablePosition(row, col) {
    const sx = 1.28;
    const sy = 1.12;
    const x = (col - 8.5) * sx;
    const y = (4 - row) * sy;
    // Keep lanthanides/actinides on the same depth plane as the main table.
    const z = 0;
    return new THREE.Vector3(x, y, z);
  }

  /**
   * Compute half-extents of visible periodic-table content in local scene space.
   * Includes selected-node enlargement and outline shell padding.
   * @returns {{halfW:number, halfH:number}}
   */
  function getPeriodicTableHalfExtents() {
    let maxX = 0;
    let maxY = 0;
    for (let row = 0; row < PERIODIC_TABLE_LAYOUT.length; row++) {
      const cols = PERIODIC_TABLE_LAYOUT[row];
      for (let col = 0; col < cols.length; col++) {
        const symbol = (cols[col] || '').trim();
        if (!symbol) continue;
        const z = ATOM_SYMBOL_TO_Z && ATOM_SYMBOL_TO_Z[symbol.toUpperCase()];
        if (!Number.isInteger(z) || !ATOM_Z_TO_DATA || !ATOM_Z_TO_DATA[z]) continue;
        const p = getPeriodicTablePosition(row, col);
        maxX = Math.max(maxX, Math.abs(p.x));
        maxY = Math.max(maxY, Math.abs(p.y));
      }
    }
    const shellPad = PERIODIC_TABLE_SPHERE_RADIUS
      * PERIODIC_TABLE_NODE_SCALE
      * PERIODIC_TABLE_SELECTED_SCALE
      * PERIODIC_TABLE_OUTLINE_SCALE
      + 0.12;
    return {
      halfW: maxX + shellPad,
      halfH: maxY + shellPad,
    };
  }

  /**
   * Resize the periodic-table renderer and camera to viewport size.
   */
  function resizePeriodicTableScene() {
    if (!periodicTableRenderer || !periodicTableCamera || !periodicTableViewport) return;
    const w = Math.max(10, periodicTableViewport.clientWidth | 0);
    const h = Math.max(10, periodicTableViewport.clientHeight | 0);
    periodicTableRenderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    periodicTableRenderer.setSize(w, h, false);
    const aspect = w / h;
    if (periodicTableCamera.isOrthographicCamera) {
      const ext = getPeriodicTableHalfExtents();
      const orthoHalfHeight = Math.max(ext.halfH, ext.halfW / Math.max(1e-6, aspect)) * PERIODIC_TABLE_VIEW_MARGIN;
      periodicTableCamera.left = -orthoHalfHeight * aspect;
      periodicTableCamera.right = orthoHalfHeight * aspect;
      periodicTableCamera.top = orthoHalfHeight;
      periodicTableCamera.bottom = -orthoHalfHeight;
      periodicTableCamera.zoom = 1;
    } else {
      periodicTableCamera.aspect = aspect;
    }
    periodicTableCamera.updateProjectionMatrix();
  }

  /**
   * Render one periodic-table frame.
   */
  function renderPeriodicTableFrame() {
    if (!periodicTableRenderer || !periodicTableScene || !periodicTableCamera) return;
    if (periodicTableControls) periodicTableControls.update();
    periodicTableRenderer.render(periodicTableScene, periodicTableCamera);
  }

  /**
   * Periodic-table animation loop while popup is open.
   */
  function periodicTableLoop() {
    if (!elementColorOverlay || elementColorOverlay.style.display !== 'flex') {
      periodicTableRaf = 0;
      return;
    }
    renderPeriodicTableFrame();
    periodicTableRaf = requestAnimationFrame(periodicTableLoop);
  }

  /**
   * Start periodic-table rendering loop if not already active.
   */
  function startPeriodicTableLoop() {
    if (periodicTableRaf) return;
    periodicTableRaf = requestAnimationFrame(periodicTableLoop);
  }

  /**
   * Stop periodic-table rendering loop.
   */
  function stopPeriodicTableLoop() {
    if (!periodicTableRaf) return;
    cancelAnimationFrame(periodicTableRaf);
    periodicTableRaf = 0;
  }

  /**
   * Ensure periodic-table scene resources are created.
   */
  function ensurePeriodicTableScene() {
    if (periodicTableScene || !periodicTableCanvas) return;

    periodicTableRenderer = new THREE.WebGLRenderer({
      canvas: periodicTableCanvas,
      antialias: true,
      alpha: true,
    });
    periodicTableScene = new THREE.Scene();
    periodicTableCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
    periodicTableCamera.position.set(0, 0, 32);
    periodicTableCamera.lookAt(0, 0, 0);

    periodicTableScene.add(
      new THREE.AmbientLight(0xffffff, 0.85)
    );
    const d1 = new THREE.DirectionalLight(0xffffff, 0.95);
    d1.position.set(2.0, 2.8, 3.8);
    periodicTableScene.add(d1);
    const d2 = new THREE.DirectionalLight(0x9fc2ff, 0.5);
    d2.position.set(-2.8, -1.6, -2.4);
    periodicTableScene.add(d2);

    periodicTableRoot = new THREE.Group();
    periodicTableRoot.rotation.x = 0;
    periodicTableRoot.rotation.y = 0;
    periodicTableScene.add(periodicTableRoot);

    const sphereGeom = new THREE.SphereGeometry(PERIODIC_TABLE_SPHERE_RADIUS, 24, 18);
    periodicNodesByZ.clear();
    periodicPickTargets.length = 0;
    for (let row = 0; row < PERIODIC_TABLE_LAYOUT.length; row++) {
      const cols = PERIODIC_TABLE_LAYOUT[row];
      for (let col = 0; col < cols.length; col++) {
        const symbol = (cols[col] || '').trim();
        if (!symbol) continue;
        const z = ATOM_SYMBOL_TO_Z && ATOM_SYMBOL_TO_Z[symbol.toUpperCase()];
        if (!Number.isInteger(z) || !ATOM_Z_TO_DATA || !ATOM_Z_TO_DATA[z]) continue;

        const colorHex = getActiveElementHexColor(z);
        const mat = new THREE.MeshPhongMaterial({
          color: new THREE.Color(colorHex),
          specular: 0xffffff,
          shininess: 120,
          emissive: new THREE.Color(0x08111c),
          emissiveIntensity: 0.06,
        });
        const mesh = new THREE.Mesh(sphereGeom, mat);
        mesh.position.copy(getPeriodicTablePosition(row, col));
        mesh.userData = { periodicZ: z };
        mesh.scale.setScalar(PERIODIC_TABLE_NODE_SCALE);

        const outlineMat = new THREE.MeshBasicMaterial({
          color: 0x0c1624,
          side: THREE.BackSide,
          transparent: true,
          opacity: 0.62,
        });
        const outline = new THREE.Mesh(sphereGeom, outlineMat);
        outline.scale.setScalar(PERIODIC_TABLE_OUTLINE_SCALE);
        mesh.add(outline);

        const label = makePeriodicSymbolSprite(symbol);
        label.position.set(0, 0, 0.52);
        mesh.add(label);

        periodicTableRoot.add(mesh);
        periodicNodesByZ.set(z, { mesh, outlineMat, label, symbol });
        periodicPickTargets.push(mesh);
      }
    }

    // Static preview: disable pan/zoom interactions in this panel.
    periodicTableControls = null;

    periodicTableCanvas.addEventListener('pointerdown', (e) => {
      if (!periodicTableCamera || !periodicPickTargets.length) return;
      const rect = periodicTableCanvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      periodicPointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      periodicPointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      periodicRaycaster.setFromCamera(periodicPointer, periodicTableCamera);
      const hits = periodicRaycaster.intersectObjects(periodicPickTargets, false);
      if (!hits.length) return;
      const hit = hits[0].object;
      const z = hit && hit.userData ? hit.userData.periodicZ : null;
      if (!Number.isInteger(z)) return;
      selectElementForColorEditor(z);
      renderPeriodicTableFrame();
    });

    resizePeriodicTableScene();
  }

  /**
   * Refresh one periodic-table node color/highlight from current state.
   * @param {number} z
   */
  function refreshPeriodicCell(z) {
    const node = periodicNodesByZ.get(z | 0);
    if (!node || !node.mesh || !node.mesh.material) return;
    const hex = getActiveElementHexColor(z);
    node.mesh.material.color.set(hex);
    const selected = (z | 0) === selectedElementForEditor;
    node.mesh.scale.setScalar((selected ? PERIODIC_TABLE_SELECTED_SCALE : 1.0) * PERIODIC_TABLE_NODE_SCALE);
    node.mesh.material.emissiveIntensity = selected ? 0.28 : 0.06;
    if (node.outlineMat) node.outlineMat.opacity = selected ? 0.92 : 0.62;
    if (node.label) node.label.material.opacity = selected ? 1.0 : 0.9;
  }

  /**
   * Refresh all periodic table cell swatches.
   */
  function refreshPeriodicCells() {
    for (const z of periodicNodesByZ.keys()) refreshPeriodicCell(z);
  }

  /**
   * Mark one element as selected in the color editor.
   * @param {number} z
   */
  function selectElementForColorEditor(z) {
    const next = z | 0;
    if (next < 0) return;
    selectedElementForEditor = next;
    if (elementColorPicker) {
      elementColorPicker.value = getActiveElementHexColor(selectedElementForEditor);
    }
    if (elementColorName) {
      const symbol = getElementSymbol(selectedElementForEditor);
      const name = getElementName(selectedElementForEditor);
      elementColorName.textContent = `${symbol} — ${name} (Z=${selectedElementForEditor})`;
    }
    refreshPeriodicCells();
  }

  /**
   * Build the periodic table editor scene once.
   */
  function buildPeriodicTableEditor() {
    ensurePeriodicTableScene();
    refreshPeriodicCells();
    selectElementForColorEditor(selectedElementForEditor);
    resizePeriodicTableScene();
    renderPeriodicTableFrame();
  }

  /**
   * Toggle periodic-table overlay visibility.
   * @param {boolean} open
   */
  function setElementColorOverlayOpen(open) {
    if (!elementColorOverlay) return;
    const isOpen = !!open;
    elementColorOverlay.style.display = isOpen ? 'flex' : 'none';
    elementColorOverlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    if (isOpen) {
      buildPeriodicTableEditor();
      refreshPeriodicCells();
      selectElementForColorEditor(selectedElementForEditor);
      startPeriodicTableLoop();
    } else {
      stopPeriodicTableLoop();
    }
  }

  // Keyboard shortcuts registry and ribbon
  const SHORTCUTS = {
    default: [
      { k: 'S', d: 'Save PNG' },
      { k: 'B', d: 'Batch export' },
      { k: 'I', d: 'Toggle surfaces' },
      { k: 'A', d: 'Toggle axes' },
      { k: 'R', d: 'Center mass at origin' },
      { k: 'Cmd/Ctrl+Z', d: 'Undo edit' },
      { k: 'Cmd/Ctrl+Shift+Z', d: 'Redo edit' },
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
      { k: 'G', d: 'Move tool' },
      { k: 'N', d: 'Add-atom tool' },
      { k: 'D', d: 'Delete tool' },
      { k: '1/2/3', d: 'Bond order (Add tool)' },
      { k: 'H/C/N/O', d: 'Element (Add tool)' },
      { k: 'Click+Drag', d: 'Move atom (Move tool)' },
      { k: 'Click', d: 'Add atom (Add tool)' },
      { k: 'Click', d: 'Delete atom (Delete tool)' },
      { k: 'Backspace/Delete', d: 'Delete hovered atom' },
      { k: 'R', d: 'Center mass at origin' },
      { k: 'Cmd/Ctrl+Z', d: 'Undo edit' },
      { k: 'Cmd/Ctrl+Shift+Z', d: 'Redo edit' },
      { k: 'X/Y/Z', d: 'Axis lock' },
      { k: 'Shift+Drag', d: 'Bypass auto angle snap (Add tool)' },
    ],
    measure: [
      { k: 'M', d: 'Exit measurement' },
      { k: 'Click', d: 'Select points' },
      { k: 'R', d: 'Center mass at origin' },
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
    if (currentMode === MODES.EDIT && prevMode !== MODES.EDIT) {
      // Always start edit sessions in move mode.
      setEditTool(EDIT_TOOL.MOVE, { announce: false });
    }
    updateAxisButtons();
    updateEditToolboxUi();
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
    if (currentMode !== MODES.EDIT) clearAddGrowPreview();
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
    updateEmptyStateVisibility();
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
   * @param {'default'|'toon'|'kit'|'glossy'} nextStyle
   * @param {{rebuild?:boolean}=} options
   */
  function setMoleculeStyle(nextStyle, options = {}) {
    if (!moleculeStyleSel) return;
    const target = normalizeMoleculeStyleKey(nextStyle);
    const shouldRebuild = options.rebuild !== false && !suspendPresetRebuild;
    if (moleculeStyle === target && moleculeStyleSel.value === target) return;
    moleculeStyle = target;
    moleculeStyleSel.value = target;
    applyMoleculeStyleUiState();
    if (shouldRebuild) rebuildScene({ preserveView: true });
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
  const EDIT_TOOL = Object.freeze({ MOVE: 'move', ADD: 'add', DELETE: 'delete' });
  let editTool = EDIT_TOOL.MOVE;
  let editAddElementZ = 6;
  let editAddBondOrder = 1;
  const EDIT_ANGLE_SNAP_OPTIONS = Object.freeze([60, 90, 109.5, 120, 180]);
  let addGrowDetectedAngleDeg = 0;
  const EDIT_QUICK_ADD_ELEMENTS = [1, 6, 7, 8, 9, 15, 16, 17, 26, 35];
  const EDIT_HISTORY_LIMIT = 200;
  let editUndoStack = [];
  let editRedoStack = [];
  let editAddHudPointerX = window.innerWidth * 0.5;
  let editAddHudPointerY = window.innerHeight * 0.5;
  let addGrowActive = false;
  let addGrowAnchorIndex = -1;
  let addGrowAnchorPos = null;
  let addGrowNeighborDirs = [];
  let addGrowPreviewPos = null;
  const addPreviewGroup = new THREE.Group();
  contentGroup.add(addPreviewGroup);
  const addAngleGuideGroup = new THREE.Group();
  contentGroup.add(addAngleGuideGroup);
  let addPreviewAtomMesh = null;
  let addPreviewBondMesh = null;
  let dragBeforeAtomsSnapshot = null;

  /**
   * Deep-copy one atom array for history snapshots.
   * @param {{atoms?:Array<{Z:number,q:number,x:number,y:number,z:number}>}} vol
   * @returns {Array<{Z:number,q:number,x:number,y:number,z:number}>}
   */
  function cloneAtomsSnapshot(vol) {
    const atoms = vol && Array.isArray(vol.atoms) ? vol.atoms : [];
    return atoms.map((a) => ({
      Z: a.Z | 0,
      q: Number.isFinite(a.q) ? Number(a.q) : 0,
      x: Number(a.x),
      y: Number(a.y),
      z: Number(a.z),
    }));
  }

  /**
   * Compare two atom snapshots by value.
   * @param {Array<{Z:number,q:number,x:number,y:number,z:number}>} a
   * @param {Array<{Z:number,q:number,x:number,y:number,z:number}>} b
   * @returns {boolean}
   */
  function atomsSnapshotsEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i], y = b[i];
      if (!x || !y) return false;
      if ((x.Z | 0) !== (y.Z | 0)) return false;
      if (Math.abs((x.q || 0) - (y.q || 0)) > 1e-12) return false;
      if (Math.abs((x.x || 0) - (y.x || 0)) > 1e-12) return false;
      if (Math.abs((x.y || 0) - (y.y || 0)) > 1e-12) return false;
      if (Math.abs((x.z || 0) - (y.z || 0)) > 1e-12) return false;
    }
    return true;
  }

  /**
   * Remove history entries whose volume records are no longer loaded.
   */
  function pruneEditHistory() {
    const keep = (entry) => !!entry && !!entry.record && volumes.includes(entry.record);
    editUndoStack = editUndoStack.filter(keep);
    editRedoStack = editRedoStack.filter(keep);
  }

  /**
   * Reset edit history stacks.
   */
  function clearEditHistory() {
    editUndoStack = [];
    editRedoStack = [];
  }

  /**
   * Record one reversible edit mutation for the active history stack.
   * @param {*} record
   * @param {Array<{Z:number,q:number,x:number,y:number,z:number}>} beforeAtoms
   * @param {Array<{Z:number,q:number,x:number,y:number,z:number}>} afterAtoms
   * @param {string} label
   */
  function pushEditHistoryEntry(record, beforeAtoms, afterAtoms, label) {
    if (!record || !record.vol) return;
    if (!Array.isArray(beforeAtoms) || !Array.isArray(afterAtoms)) return;
    if (atomsSnapshotsEqual(beforeAtoms, afterAtoms)) return;
    editUndoStack.push({
      record,
      before: beforeAtoms,
      after: afterAtoms,
      label: String(label || 'Edit'),
      at: Date.now(),
    });
    if (editUndoStack.length > EDIT_HISTORY_LIMIT) editUndoStack.splice(0, editUndoStack.length - EDIT_HISTORY_LIMIT);
    editRedoStack.length = 0;
  }

  /**
   * Apply one stored atom snapshot to its volume record.
   * @param {*} record
   * @param {Array<{Z:number,q:number,x:number,y:number,z:number}>} atoms
   * @returns {boolean}
   */
  function applyAtomsSnapshotToRecord(record, atoms) {
    if (!record || !record.vol || !Array.isArray(atoms)) return false;
    const idx = volumes.indexOf(record);
    if (idx < 0) return false;
    record.vol.atoms = atoms.map((a) => ({
      Z: a.Z | 0,
      q: Number.isFinite(a.q) ? Number(a.q) : 0,
      x: Number(a.x),
      y: Number(a.y),
      z: Number(a.z),
    }));
    record.vol.natoms = record.vol.atoms.length;
    currentIndex = idx;
    refreshFileSelect();
    if (fileSelect) fileSelect.value = String(currentIndex);
    clearAddGrowPreview();
    clearHover();
    clearEditSelection();
    updateSelectedHalos();
    rebuildScene({ preserveView: true });
    updateSidePanel();
    return true;
  }

  /**
   * Undo the most recent edit mutation.
   * @returns {boolean}
   */
  function undoLastEditAction() {
    pruneEditHistory();
    if (editUndoStack.length === 0) {
      setHintMessage('Nothing to undo.');
      return false;
    }
    const entry = editUndoStack.pop();
    if (!applyAtomsSnapshotToRecord(entry.record, entry.before)) {
      setHintMessage('Undo failed: target structure is no longer available.');
      return false;
    }
    editRedoStack.push(entry);
    if (editRedoStack.length > EDIT_HISTORY_LIMIT) editRedoStack.splice(0, editRedoStack.length - EDIT_HISTORY_LIMIT);
    setHintMessage(`Undo: ${entry.label}`);
    return true;
  }

  /**
   * Redo the most recently undone edit mutation.
   * @returns {boolean}
   */
  function redoLastEditAction() {
    pruneEditHistory();
    if (editRedoStack.length === 0) {
      setHintMessage('Nothing to redo.');
      return false;
    }
    const entry = editRedoStack.pop();
    if (!applyAtomsSnapshotToRecord(entry.record, entry.after)) {
      setHintMessage('Redo failed: target structure is no longer available.');
      return false;
    }
    editUndoStack.push(entry);
    if (editUndoStack.length > EDIT_HISTORY_LIMIT) editUndoStack.splice(0, editUndoStack.length - EDIT_HISTORY_LIMIT);
    setHintMessage(`Redo: ${entry.label}`);
    return true;
  }

  /**
   * Return sorted atomic numbers available in the loaded atomic data table.
   * @returns {number[]}
   */
  function getKnownElementNumbers() {
    if (!ATOM_Z_TO_DATA) return [];
    return Object.keys(ATOM_Z_TO_DATA)
      .map((k) => Number(k))
      .filter((z) => Number.isInteger(z) && z > 0 && ATOM_Z_TO_DATA[z])
      .sort((a, b) => a - b);
  }

  /**
   * Resolve a user query to an element atomic number.
   * Accepts symbol, name, or atomic number.
   * @param {*} query
   * @returns {number|null}
   */
  function resolveElementQueryToZ(query) {
    const raw = String(query || '').trim();
    if (!raw) return null;
    if (/^\d+$/.test(raw)) {
      const z = Number(raw);
      return (ATOM_Z_TO_DATA && ATOM_Z_TO_DATA[z]) ? z : null;
    }
    const trailingZ = raw.match(/\((\d{1,3})\)\s*$/);
    if (trailingZ) {
      const z = Number(trailingZ[1]);
      if (ATOM_Z_TO_DATA && ATOM_Z_TO_DATA[z]) return z;
    }
    const upper = raw.toUpperCase();
    if (ATOM_SYMBOL_TO_Z && Number.isInteger(ATOM_SYMBOL_TO_Z[upper])) {
      const z = ATOM_SYMBOL_TO_Z[upper];
      if (ATOM_Z_TO_DATA && ATOM_Z_TO_DATA[z]) return z;
    }
    const rawSymbol = raw.match(/^([A-Za-z]{1,3})\b/);
    if (rawSymbol) {
      const z = ATOM_SYMBOL_TO_Z && ATOM_SYMBOL_TO_Z[rawSymbol[1].toUpperCase()];
      if (Number.isInteger(z) && ATOM_Z_TO_DATA && ATOM_Z_TO_DATA[z]) return z;
    }
    const lower = raw.toLowerCase();
    for (const z of getKnownElementNumbers()) {
      const info = ATOM_Z_TO_DATA[z];
      const name = (info && info.name ? String(info.name) : '').toLowerCase();
      if (name === lower) return z;
    }
    for (const z of getKnownElementNumbers()) {
      const info = ATOM_Z_TO_DATA[z];
      const name = (info && info.name ? String(info.name) : '').toLowerCase();
      if (name.startsWith(lower)) return z;
    }
    return null;
  }

  /**
   * Clamp requested preview bond order to supported range [1..3].
   * @param {*} order
   * @returns {number}
   */
  function normalizeEditAddBondOrder(order) {
    const n = Number(order);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(3, Math.round(n)));
  }

  /**
   * Normalize angle snap value to supported options.
   * @param {*} value
   * @returns {number}
   */
  function normalizeEditAngleSnap(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    let best = EDIT_ANGLE_SNAP_OPTIONS[0];
    let bestDiff = Math.abs(n - best);
    for (let i = 1; i < EDIT_ANGLE_SNAP_OPTIONS.length; i++) {
      const opt = EDIT_ANGLE_SNAP_OPTIONS[i];
      const d = Math.abs(n - opt);
      if (d < bestDiff) {
        best = opt;
        bestDiff = d;
      }
    }
    return best;
  }

  /**
   * Normalize one direction projected onto a plane.
   * @param {THREE.Vector3} dir
   * @param {THREE.Vector3|null} planeNormal
   * @returns {THREE.Vector3|null}
   */
  function getProjectedUnitDirection(dir, planeNormal) {
    if (!dir || !dir.isVector3 || !planeNormal || !planeNormal.isVector3) return null;
    const n = planeNormal.clone();
    if (n.lengthSq() < 1e-12) return null;
    n.normalize();
    const p = dir.clone().sub(n.multiplyScalar(dir.dot(n)));
    if (p.lengthSq() < 1e-12) return null;
    return p.normalize();
  }

  /**
   * Apply one bond-angle constraint to add direction against neighbor bonds.
   * Chooses the candidate closest to requested direction and returns guide metadata.
   * @param {THREE.Vector3} direction
   * @param {THREE.Vector3[]} neighborDirs
   * @param {number|null|undefined} angleDeg
   * If `angleDeg` is positive, force that angle.
   * If `angleDeg` is null/undefined/0, choose the nearest among allowed angles.
   * If `angleDeg` is negative, disable angle snap (passthrough).
   * @param {THREE.Vector3|null=} viewNormal
   * Optional camera-forward direction to prioritize screen-angle tracking.
   * @returns {{dir:THREE.Vector3,targetDeg:number,measuredDeg:number,refDir:THREE.Vector3|null}}
   */
  function applyEditAddAngleSnap(direction, neighborDirs, angleDeg, viewNormal = null) {
    if (!direction || !direction.isVector3) {
      return { dir: direction || new THREE.Vector3(1, 0, 0), targetDeg: 0, measuredDeg: 0, refDir: null };
    }
    if (!Array.isArray(neighborDirs) || neighborDirs.length === 0) {
      const d = direction.clone().normalize();
      return { dir: d, targetDeg: 0, measuredDeg: 0, refDir: null };
    }
    const angleRaw = Number(angleDeg);
    if (Number.isFinite(angleRaw) && angleRaw < 0) {
      const d = direction.clone().normalize();
      return { dir: d, targetDeg: 0, measuredDeg: 0, refDir: null };
    }
    const forcedTargetDeg = normalizeEditAngleSnap(angleRaw);
    const targetAngles = forcedTargetDeg > 0 ? [forcedTargetDeg] : EDIT_ANGLE_SNAP_OPTIONS;
    const targetDir = direction.clone().normalize();
    const targetScreenDir = getProjectedUnitDirection(targetDir, viewNormal);
    let best = null;
    let bestDot = -Infinity;
    let bestRef = null;
    let bestTargetDeg = 0;
    let bestMeasured = 0;
    for (const n of neighborDirs) {
      if (!n || !n.isVector3 || n.lengthSq() < 1e-12) continue;
      const axis = n.clone().normalize();
      for (const targetDeg of targetAngles) {
        let cand = null;
        if (targetDeg >= 179.999) {
          cand = axis.clone().multiplyScalar(-1);
        } else {
          const theta = THREE.MathUtils.degToRad(targetDeg);
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);
          let tangent = targetDir.clone().sub(axis.clone().multiplyScalar(targetDir.dot(axis)));
          if (tangent.lengthSq() < 1e-12) {
            tangent = new THREE.Vector3(0, 1, 0);
            if (Math.abs(tangent.dot(axis)) > 0.9) tangent.set(1, 0, 0);
            tangent.sub(axis.clone().multiplyScalar(tangent.dot(axis)));
          }
          if (tangent.lengthSq() < 1e-12) continue;
          tangent.normalize();
          cand = tangent.multiplyScalar(sinT).add(axis.clone().multiplyScalar(cosT)).normalize();
        }
        const d = cand.dot(targetDir);
        let score = d;
        if (targetScreenDir) {
          const candScreen = getProjectedUnitDirection(cand, viewNormal);
          if (candScreen) score = candScreen.dot(targetScreenDir);
        }
        if (score > bestDot) {
          bestDot = score;
          best = cand;
          bestRef = axis;
          bestTargetDeg = targetDeg;
          const measured = THREE.MathUtils.radToDeg(Math.acos(Math.max(-1, Math.min(1, cand.dot(axis)))));
          bestMeasured = measured;
        }
      }
    }
    return {
      dir: best || targetDir,
      targetDeg: bestTargetDeg,
      measuredDeg: bestMeasured || bestTargetDeg,
      refDir: bestRef ? bestRef.clone() : null,
    };
  }

  /**
   * Estimate placement distance for add-grow preview by bond order.
   * @param {number} anchorZ
   * @param {number} newZ
   * @param {number} order
   * @returns {number}
   */
  function getEditAddBondLength(anchorZ, newZ, order) {
    const rA = getCovalentRadiusAngstrom(anchorZ | 0);
    const rB = getCovalentRadiusAngstrom(newZ | 0);
    const base = Math.max(0.6, 0.92 * (rA + rB));
    const scale = order >= 3 ? 0.82 : order === 2 ? 0.88 : 1.0;
    return Math.max(0.5, base * scale);
  }

  /**
   * Estimate local neighbor directions from one anchor atom.
   * @param {*} vol
   * @param {number} anchorIndex
   * @returns {THREE.Vector3[]}
   */
  function getEditAddNeighborDirections(vol, anchorIndex) {
    if (!vol || !Array.isArray(vol.atoms)) return [];
    const records = buildBondAtomRecords(vol, { includeRenderColor: false });
    const edges = collectBondCandidates(records);
    const dirs = [];
    for (const e of edges) {
      let j = -1;
      if (e.i === anchorIndex) j = e.j;
      else if (e.j === anchorIndex) j = e.i;
      if (j < 0) continue;
      const v = records[j].pos.clone().sub(records[anchorIndex].pos);
      if (v.lengthSq() < 1e-10) continue;
      dirs.push(v.normalize());
    }
    return dirs;
  }

  /**
   * Human-readable label for the active edit sub-tool.
   * @param {'move'|'add'|'delete'} tool
   * @returns {string}
   */
  function getEditToolLabel(tool) {
    if (tool === EDIT_TOOL.ADD) return 'Add';
    if (tool === EDIT_TOOL.DELETE) return 'Delete';
    return 'Move';
  }

  /**
   * Position the edit cursor badge near the latest pointer location.
   * @param {number} clientX
   * @param {number} clientY
   */
  function setEditCursorBadgePointer(clientX, clientY) {
    if (!editCursorBadgeEl || editCursorBadgeEl.getAttribute('aria-hidden') !== 'false') return;
    const px = Number.isFinite(clientX) ? clientX : editAddHudPointerX;
    const py = Number.isFinite(clientY) ? clientY : editAddHudPointerY;
    const vw = window.innerWidth || 1;
    const vh = window.innerHeight || 1;
    const rect = editCursorBadgeEl.getBoundingClientRect();
    let x = px + 16;
    let y = py + 16;
    if (x + rect.width > vw - 8) x = px - rect.width - 16;
    if (y + rect.height > vh - 8) y = py - rect.height - 16;
    x = Math.max(8, Math.min(vw - rect.width - 8, x));
    y = Math.max(64, Math.min(vh - rect.height - 8, y));
    editCursorBadgeEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  /**
   * Keep the edit cursor badge text/style synchronized with edit state.
   */
  function updateEditCursorBadge() {
    if (!editCursorBadgeEl) return;
    const show = !!editMode;
    editCursorBadgeEl.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (!show) return;
    const modeLabel = getEditToolLabel(editTool);
    if (editCursorBadgeModeEl) {
      editCursorBadgeModeEl.textContent = modeLabel;
      let border = '#4aa3ff';
      let bg = 'rgba(74, 163, 255, 0.18)';
      if (editTool === EDIT_TOOL.ADD) {
        border = '#57cd8a';
        bg = 'rgba(87, 205, 138, 0.2)';
      } else if (editTool === EDIT_TOOL.DELETE) {
        border = '#ff7373';
        bg = 'rgba(255, 115, 115, 0.2)';
      }
      editCursorBadgeModeEl.style.borderColor = border;
      editCursorBadgeModeEl.style.background = bg;
    }
    if (editCursorBadgeElementEl) editCursorBadgeElementEl.textContent = getElementSymbol(editAddElementZ);
    if (editCursorBadgeBondEl) editCursorBadgeBondEl.textContent = String(editAddBondOrder);
    setEditCursorBadgePointer(editAddHudPointerX, editAddHudPointerY);
  }

  /**
   * Update the add quick-HUD dock position.
   * @param {number} clientX
   * @param {number} clientY
   */
  function setEditAddHudPointer(clientX, clientY) {
    editAddHudPointerX = Number.isFinite(clientX) ? clientX : editAddHudPointerX;
    editAddHudPointerY = Number.isFinite(clientY) ? clientY : editAddHudPointerY;
    setEditCursorBadgePointer(editAddHudPointerX, editAddHudPointerY);
    if (!editAddCursorHudEl || editAddCursorHudEl.getAttribute('aria-hidden') !== 'false') return;
    const vw = window.innerWidth || 1;
    const vh = window.innerHeight || 1;
    const rect = editAddCursorHudEl.getBoundingClientRect();
    let x = Math.max(8, vw - rect.width - 12);
    let y = Math.max(64, vh - rect.height - 36);
    if (editToolboxEl && editToolboxEl.getAttribute('aria-hidden') === 'false') {
      const toolRect = editToolboxEl.getBoundingClientRect();
      x = Math.max(8, Math.round(toolRect.left));
      y = Math.max(64, Math.round(toolRect.bottom + 8));
    }
    x = Math.max(8, Math.min(vw - rect.width - 8, x));
    y = Math.max(64, Math.min(vh - rect.height - 8, y));
    editAddCursorHudEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  /**
   * Synchronize the cursor mini-picker button state and visibility.
   */
  function updateEditAddCursorHud() {
    if (!editAddCursorHudEl) return;
    const showHud = editMode && editTool === EDIT_TOOL.ADD && addGrowActive;
    editAddCursorHudEl.setAttribute('aria-hidden', showHud ? 'false' : 'true');
    if (!showHud) return;
    const buttons = editAddCursorHudEl.querySelectorAll('button');
    buttons.forEach((btn) => {
      const zAttr = btn.getAttribute('data-z');
      const orderAttr = btn.getAttribute('data-order');
      let isActive = false;
      if (zAttr != null) {
        const z = Number(zAttr);
        isActive = z === editAddElementZ;
        const hex = getActiveElementHexColor(z);
        try {
          const c = new THREE.Color(hex);
          const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
          btn.style.background = hex;
          btn.style.color = lum > 0.6 ? '#0f1a2b' : '#f4f8ff';
        } catch {
          btn.style.background = '#1a2230';
          btn.style.color = '#eef6ff';
        }
      } else if (orderAttr != null) {
        const ord = Number(orderAttr);
        isActive = ord === editAddBondOrder;
        btn.style.background = '';
        btn.style.color = '';
      }
      btn.classList.toggle('active', isActive);
    });
    setEditAddHudPointer(editAddHudPointerX, editAddHudPointerY);
  }

  /**
   * Set the active add-mode preview bond order.
   * @param {number} order
   * @param {{announce?:boolean}=} options
   */
  function setEditAddBondOrder(order, options = {}) {
    const announce = options.announce !== false;
    editAddBondOrder = normalizeEditAddBondOrder(order);
    refreshActiveAddGrowPreview();
    updateEditToolboxUi({ syncSearch: false });
    updateEditAddCursorHud();
    if (announce && editMode && editTool === EDIT_TOOL.ADD) {
      setHintMessage(`Add atom bond order: ${editAddBondOrder} (keys 1/2/3)`);
    }
  }

  /**
   * Clear add-grow preview state/meshes.
   */
  function clearAddGrowPreview() {
    addGrowActive = false;
    addGrowAnchorIndex = -1;
    addGrowAnchorPos = null;
    addGrowNeighborDirs = [];
    addGrowPreviewPos = null;
    addGrowDetectedAngleDeg = 0;
    if (addPreviewAtomMesh) {
      addPreviewGroup.remove(addPreviewAtomMesh);
      disposeObj(addPreviewAtomMesh);
      addPreviewAtomMesh = null;
    }
    if (addPreviewBondMesh) {
      addPreviewGroup.remove(addPreviewBondMesh);
      disposeObj(addPreviewBondMesh);
      addPreviewBondMesh = null;
    }
    clearGroup(addAngleGuideGroup);
    try { controls.enabled = true; } catch { }
    updateEditToolboxUi({ syncSearch: false });
    updateEditAddCursorHud();
  }

  /**
   * Ensure add-grow ghost meshes exist.
   * @param {number} z
   */
  function ensureAddGrowPreviewMeshes(z) {
    if (!addPreviewAtomMesh) {
      const g = new THREE.SphereGeometry(0.5, 20, 14);
      const m = new THREE.MeshPhysicalMaterial({
        transparent: true,
        opacity: 0.72,
        roughness: 0.2,
        metalness: 0.1,
        clearcoat: 0.45,
        clearcoatRoughness: 0.15,
      });
      addPreviewAtomMesh = new THREE.Mesh(g, m);
      addPreviewAtomMesh.renderOrder = 60;
      addPreviewGroup.add(addPreviewAtomMesh);
    }
    if (!addPreviewBondMesh) {
      const g = new THREE.CylinderGeometry(0.05, 0.05, 1.0, 16, 1, false);
      const m = new THREE.MeshPhysicalMaterial({
        color: 0xdbe3ef,
        transparent: true,
        opacity: 0.68,
        roughness: 0.25,
        metalness: 0.05,
      });
      addPreviewBondMesh = new THREE.Mesh(g, m);
      addPreviewBondMesh.renderOrder = 58;
      addPreviewGroup.add(addPreviewBondMesh);
    }
    const atomColor = getAtomRenderColor(z);
    if (addPreviewAtomMesh && addPreviewAtomMesh.material && addPreviewAtomMesh.material.color) {
      addPreviewAtomMesh.material.color.copy(atomColor);
    }
  }

  /**
   * Refresh add-grow ghost geometry placement.
   * @param {THREE.Vector3} anchorPos
   * @param {THREE.Vector3} newPos
   * @param {number} z
   */
  function updateAddGrowPreviewMeshes(anchorPos, newPos, z) {
    ensureAddGrowPreviewMeshes(z);
    const dir = newPos.clone().sub(anchorPos);
    const len = dir.length();
    if (len < 1e-8) return;
    const atomScale = getCovalentRadiusAngstrom(z) * getAtomRenderScaleFactor(z);
    addPreviewAtomMesh.position.copy(newPos);
    addPreviewAtomMesh.scale.setScalar(atomScale);
    addPreviewBondMesh.position.copy(anchorPos.clone().add(newPos).multiplyScalar(0.5));
    addPreviewBondMesh.scale.set(1, len, 1);
    addPreviewBondMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  }

  /**
   * Draw one in-scene angle guide for the active add-grow direction.
   * @param {THREE.Vector3} anchorPos
   * @param {THREE.Vector3} newPos
   * @param {{targetDeg:number,measuredDeg:number,refDir:THREE.Vector3|null}=} snapMeta
   */
  function updateAddGrowAngleGuide(anchorPos, newPos, snapMeta = null) {
    clearGroup(addAngleGuideGroup);
    if (!anchorPos || !newPos || !snapMeta || !snapMeta.refDir || !snapMeta.targetDeg) return;
    const outDir = newPos.clone().sub(anchorPos);
    if (outDir.lengthSq() < 1e-10) return;
    outDir.normalize();
    const refDir = snapMeta.refDir.clone().normalize();
    let dot = Math.max(-1, Math.min(1, refDir.dot(outDir)));
    const theta = Math.acos(dot);
    if (!Number.isFinite(theta) || theta <= 1e-6) return;
    const normal = new THREE.Vector3().crossVectors(refDir, outDir);
    if (normal.lengthSq() < 1e-12) return;
    normal.normalize();
    const e1 = refDir.clone();
    const e3 = normal.clone();
    const e2 = new THREE.Vector3().crossVectors(e3, e1).normalize();
    const bondLen = anchorPos.distanceTo(newPos);
    const radius = Math.max(0.24, Math.min(0.62, bondLen * 0.42));

    const spokeGeom = new THREE.BufferGeometry();
    spokeGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      anchorPos.x, anchorPos.y, anchorPos.z,
      anchorPos.x + e1.x * radius, anchorPos.y + e1.y * radius, anchorPos.z + e1.z * radius,
      anchorPos.x, anchorPos.y, anchorPos.z,
      anchorPos.x + outDir.x * radius, anchorPos.y + outDir.y * radius, anchorPos.z + outDir.z * radius,
    ]), 3));
    const spokeMat = new THREE.LineBasicMaterial({ color: 0x57cd8a, transparent: true, opacity: 0.9, depthTest: false });
    const spokes = new THREE.LineSegments(spokeGeom, spokeMat);
    spokes.renderOrder = 120;
    addAngleGuideGroup.add(spokes);

    const fanGeom = new THREE.CircleGeometry(radius, 40, 0, theta);
    const fanMat = new THREE.MeshBasicMaterial({
      color: 0x57cd8a,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    const fan = new THREE.Mesh(fanGeom, fanMat);
    const basis = new THREE.Matrix4().makeBasis(e1, e2, e3);
    fan.quaternion.setFromRotationMatrix(basis);
    fan.position.copy(anchorPos.clone().add(e3.clone().multiplyScalar(0.003)));
    fan.renderOrder = 119;
    addAngleGuideGroup.add(fan);

    const segs = 32;
    const arcPoints = [];
    for (let i = 0; i <= segs; i++) {
      const t = theta * (i / segs);
      const d = e1.clone().multiplyScalar(Math.cos(t)).add(e2.clone().multiplyScalar(Math.sin(t)));
      arcPoints.push(anchorPos.clone().add(d.multiplyScalar(radius)));
    }
    const arcGeom = new THREE.BufferGeometry().setFromPoints(arcPoints);
    const arcMat = new THREE.LineBasicMaterial({ color: 0x57cd8a, transparent: true, opacity: 0.96, depthTest: false });
    const arc = new THREE.Line(arcGeom, arcMat);
    arc.renderOrder = 121;
    addAngleGuideGroup.add(arc);

    const midDir = e1.clone().multiplyScalar(Math.cos(theta * 0.5)).add(e2.clone().multiplyScalar(Math.sin(theta * 0.5)));
    const label = makeTextSprite(`${Number(snapMeta.measuredDeg || snapMeta.targetDeg).toFixed(1)}°`);
    label.position.copy(anchorPos.clone().add(midDir.multiplyScalar(radius + 0.08)));
    label.renderOrder = 122;
    addAngleGuideGroup.add(label);
  }

  /**
   * Recompute the active grow preview using current element/order settings.
   */
  function refreshActiveAddGrowPreview() {
    if (!addGrowActive || !addGrowAnchorPos || !addGrowPreviewPos) return;
    const vol = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex].vol : null;
    if (!vol || !Array.isArray(vol.atoms) || addGrowAnchorIndex < 0 || addGrowAnchorIndex >= vol.atoms.length) return;
    const rawDir = addGrowPreviewPos.clone().sub(addGrowAnchorPos);
    if (rawDir.lengthSq() < 1e-8) return;
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const snapMeta = applyEditAddAngleSnap(rawDir, addGrowNeighborDirs, null, camDir);
    const snapped = snapMeta.dir.clone().normalize();
    addGrowDetectedAngleDeg = snapMeta.targetDeg || 0;
    const anchorZ = vol.atoms[addGrowAnchorIndex].Z | 0;
    const dist = getEditAddBondLength(anchorZ, editAddElementZ, editAddBondOrder);
    const newPos = addGrowAnchorPos.clone().addScaledVector(snapped, dist);
    addGrowPreviewPos = newPos;
    updateAddGrowPreviewMeshes(addGrowAnchorPos, newPos, editAddElementZ);
    updateAddGrowAngleGuide(addGrowAnchorPos, newPos, snapMeta);
  }

  /**
   * Update add-grow ghost position from the current pointer ray.
   * @param {PointerEvent} e
   */
  function updateAddGrowPreviewFromEvent(e) {
    if (!addGrowActive || !addGrowAnchorPos) return;
    const vol = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex].vol : null;
    if (!vol || !Array.isArray(vol.atoms) || addGrowAnchorIndex < 0 || addGrowAnchorIndex >= vol.atoms.length) return;
    setRaycasterFromEvent(e);
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, addGrowAnchorPos);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    let rawDir = hit.clone().sub(addGrowAnchorPos);
    if (rawDir.lengthSq() < 1e-10) {
      rawDir = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    }
    rawDir.normalize();
    const bypassAngleSnap = !!(e && e.shiftKey);
    const snapMeta = applyEditAddAngleSnap(
      rawDir,
      addGrowNeighborDirs,
      bypassAngleSnap ? -1 : null,
      camDir
    );
    const snapped = snapMeta.dir.clone().normalize();
    if (!bypassAngleSnap) addGrowDetectedAngleDeg = snapMeta.targetDeg || 0;
    const anchorZ = vol.atoms[addGrowAnchorIndex].Z | 0;
    const dist = getEditAddBondLength(anchorZ, editAddElementZ, editAddBondOrder);
    const newPos = addGrowAnchorPos.clone().addScaledVector(snapped, dist);
    addGrowPreviewPos = newPos;
    updateAddGrowPreviewMeshes(addGrowAnchorPos, newPos, editAddElementZ);
    updateAddGrowAngleGuide(addGrowAnchorPos, newPos, snapMeta);
  }

  /**
   * Keep edit-tool controls synchronized with current edit state.
   * @param {{syncSearch?:boolean}=} options
   */
  function updateEditToolboxUi(options = {}) {
    const syncSearch = options.syncSearch !== false;
    const isEdit = editMode;
    const isMove = editTool === EDIT_TOOL.MOVE;
    const isAdd = editTool === EDIT_TOOL.ADD;
    const isDelete = editTool === EDIT_TOOL.DELETE;

    if (editToolboxEl) {
      editToolboxEl.setAttribute('aria-hidden', isEdit ? 'false' : 'true');
    }
    if (editToolMoveBtn) editToolMoveBtn.classList.toggle('active', isMove);
    if (editToolAddBtn) editToolAddBtn.classList.toggle('active', isAdd);
    if (editToolDeleteBtn) editToolDeleteBtn.classList.toggle('active', isDelete);
    if (editAddPaneEl) editAddPaneEl.classList.toggle('active', isEdit && isAdd);

    const info = ATOM_Z_TO_DATA && ATOM_Z_TO_DATA[editAddElementZ];
    const symbol = info && info.symbol ? info.symbol : `Z${editAddElementZ}`;
    const name = info && info.name ? info.name : symbol;
    const angleLabel = addGrowDetectedAngleDeg > 0 ? `${addGrowDetectedAngleDeg.toFixed(1)}°` : 'auto';
    if (editAddCurrentEl) editAddCurrentEl.textContent = `Adding: ${name} (${symbol}) • bond ${editAddBondOrder} • angle ${angleLabel}`;

    if (syncSearch && editAddSearchEl && document.activeElement !== editAddSearchEl) {
      editAddSearchEl.value = `${symbol} — ${name} (${editAddElementZ})`;
    }

    if (editAddQuickEl) {
      const quickButtons = editAddQuickEl.querySelectorAll('button[data-z]');
      quickButtons.forEach((btn) => {
        const z = Number(btn.getAttribute('data-z'));
        const isSelected = z === editAddElementZ;
        btn.classList.toggle('active', isSelected);
        const bgHex = getActiveElementHexColor(z);
        try {
          const color = new THREE.Color(bgHex);
          const lum = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
          btn.style.background = bgHex;
          btn.style.color = lum > 0.6 ? '#0b1220' : '#f4f8ff';
        } catch {
          btn.style.background = '#1a2230';
          btn.style.color = '#eef6ff';
        }
      });
    }
    updateEditCursorBadge();
    updateEditAddCursorHud();
  }

  /**
   * Change the active edit sub-tool.
   * @param {'move'|'add'} nextTool
   * @param {{announce?:boolean}=} options
   */
  function setEditTool(nextTool, options = {}) {
    const announce = options.announce !== false;
    const prevTool = editTool;
    if (nextTool === EDIT_TOOL.ADD) editTool = EDIT_TOOL.ADD;
    else if (nextTool === EDIT_TOOL.DELETE) editTool = EDIT_TOOL.DELETE;
    else editTool = EDIT_TOOL.MOVE;
    if (editTool === EDIT_TOOL.ADD) {
      axisLock = 'none';
      axisKeyDown = null;
      updateAxisGuideLine();
    } else if (prevTool === EDIT_TOOL.ADD) {
      clearAddGrowPreview();
    }
    clearHover();
    updateEditToolboxUi();
    updateAxisButtons();
    if (!announce || !editMode) return;
    if (editTool === EDIT_TOOL.ADD) {
      const symbol = getElementSymbol(editAddElementZ);
      setHintMessage(`Edit tool: Add atom (${symbol}) • Cursor angle controls placement • Hold Shift to bypass angle snap`);
    } else if (editTool === EDIT_TOOL.DELETE) {
      setHintMessage('Edit tool: Delete • Click an atom or press Backspace/Delete on hovered atom');
    } else {
      setHintMessage('Edit tool: Move • Click+drag atom (X/Y/Z for axis lock)');
    }
  }

  /**
   * Select which element gets added in Add-atom edit sub-mode.
   * @param {number} z
   * @param {{announce?:boolean,syncSearch?:boolean}=} options
   * @returns {boolean}
   */
  function setEditAddElement(z, options = {}) {
    const announce = !!options.announce;
    const syncSearch = options.syncSearch !== false;
    if (!Number.isInteger(z) || z <= 0 || !ATOM_Z_TO_DATA || !ATOM_Z_TO_DATA[z]) return false;
    editAddElementZ = z;
    refreshActiveAddGrowPreview();
    updateEditToolboxUi({ syncSearch });
    if (announce && editMode && editTool === EDIT_TOOL.ADD) {
      setHintMessage(`Add atom: ${getElementName(z)} (${getElementSymbol(z)})`);
    }
    return true;
  }

  /**
   * Populate search suggestions and quick-add chips for Add-atom mode.
   */
  function buildEditAddControls() {
    if (editAddSuggestionsEl) {
      editAddSuggestionsEl.innerHTML = '';
      for (const z of getKnownElementNumbers()) {
        const info = ATOM_Z_TO_DATA[z];
        const opt = document.createElement('option');
        opt.value = `${info.symbol} — ${info.name} (${z})`;
        editAddSuggestionsEl.appendChild(opt);
      }
    }
    if (editAddQuickEl) {
      editAddQuickEl.innerHTML = '';
      for (const z of EDIT_QUICK_ADD_ELEMENTS) {
        if (!ATOM_Z_TO_DATA || !ATOM_Z_TO_DATA[z]) continue;
        const info = ATOM_Z_TO_DATA[z];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-z', String(z));
        btn.title = `${info.name} (${info.symbol})`;
        btn.textContent = info.symbol;
        btn.onclick = () => { setEditAddElement(z, { announce: true }); };
        editAddQuickEl.appendChild(btn);
      }
    }
    if (editAddSearchEl) {
      const commit = () => {
        const z = resolveElementQueryToZ(editAddSearchEl.value);
        if (!setEditAddElement(z, { announce: true, syncSearch: true })) {
          updateEditToolboxUi({ syncSearch: true });
          setHintMessage(`Element not recognized: "${String(editAddSearchEl.value || '').trim()}"`);
        }
      };
      editAddSearchEl.addEventListener('change', commit);
      editAddSearchEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        commit();
      });
      editAddSearchEl.addEventListener('input', () => updateEditToolboxUi({ syncSearch: false }));
    }
    if (editAddCursorHudEl) {
      const buttons = editAddCursorHudEl.querySelectorAll('button');
      buttons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const zAttr = btn.getAttribute('data-z');
          const orderAttr = btn.getAttribute('data-order');
          if (zAttr != null) {
            const z = Number(zAttr);
            setEditAddElement(z, { announce: true, syncSearch: true });
            return;
          }
          if (orderAttr != null) {
            setEditAddBondOrder(Number(orderAttr), { announce: true });
          }
        });
      });
    }
    if (editToolMoveBtn) editToolMoveBtn.onclick = () => setEditTool(EDIT_TOOL.MOVE);
    if (editToolAddBtn) editToolAddBtn.onclick = () => setEditTool(EDIT_TOOL.ADD);
    if (editToolDeleteBtn) editToolDeleteBtn.onclick = () => setEditTool(EDIT_TOOL.DELETE);
    setEditAddBondOrder(1, { announce: false });
    updateEditToolboxUi();
  }

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
   * Update the shared raycaster from a pointer event.
   * @param {PointerEvent} e
   */
  function setRaycasterFromEvent(e) {
    setNDCFromEvent(e);
    raycaster.setFromCamera(ndc, camera);
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
      const hoverColor = (editMode && editTool === EDIT_TOOL.DELETE) ? 0xff4b4b : 0x00a5ff;
      const haloMat = new THREE.MeshBasicMaterial({
        color: hoverColor,
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
    axisLockEl.style.display = (editMode && editTool === EDIT_TOOL.MOVE) ? 'flex' : 'none';
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
  buildEditAddControls();

  /**
   * Raycast and return the first intersected atom mesh under the pointer.
   * @param {PointerEvent} e
   * @returns {THREE.Intersection|null}
   */
  function pickAtom(e) {
    if (!atomGroup || !atomGroup.children || atomGroup.children.length === 0) return null;
    setRaycasterFromEvent(e);
    const hits = raycaster.intersectObjects(atomGroup.children, false);
    return hits.length > 0 ? hits[0].object : null;
  }

  /**
   * Raycast and return the first full hit record on an atom mesh.
   * @param {PointerEvent} e
   * @returns {THREE.Intersection|null}
   */
  function pickAtomHit(e) {
    if (!atomGroup || !atomGroup.children || atomGroup.children.length === 0) return null;
    setRaycasterFromEvent(e);
    const hits = raycaster.intersectObjects(atomGroup.children, false);
    return hits.length > 0 ? hits[0] : null;
  }

  /**
   * Place a new atom into the active file at one world-space coordinate.
   * @param {THREE.Vector3} worldPos
   * @returns {boolean}
   */
  function appendAtomAtWorld(worldPos) {
    /**
     * Ensure there is an active editable volume target.
     * If none is loaded, create an empty angstrom XYZ-like record.
     * @returns {*}
     */
    function ensureEditableVolumeRecord() {
      if (currentIndex >= 0 && volumes[currentIndex] && volumes[currentIndex].vol) return volumes[currentIndex].vol;
      const idx0 = () => 0;
      const vol = {
        title: 'Untitled molecule',
        comment: 'Created in edit mode',
        natoms: 0,
        origin: [0, 0, 0],
        nxyz: [0, 0, 0],
        axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        atoms: [],
        data: new Float32Array(0),
        idx: idx0,
        units: 'angstrom',
        isoHint: null,
      };
      const name = `untitled-${volumes.length + 1}.xyz`;
      volumes.push({ name, vol });
      currentIndex = volumes.length - 1;
      refreshFileSelect();
      if (fileSelect) fileSelect.value = String(currentIndex);
      updateSidePanel();
      return vol;
    }

    const vol = ensureEditableVolumeRecord();
    const record = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null;
    if (!vol || !Array.isArray(vol.atoms)) return false;
    const beforeAtoms = cloneAtomsSnapshot(vol);
    const z = editAddElementZ | 0;
    if (!z || !ATOM_Z_TO_DATA || !ATOM_Z_TO_DATA[z]) return false;
    const [x, y, zCoord] = worldToAtomUnits(vol, worldPos);
    vol.atoms.push({ Z: z, q: 0, x, y, z: zCoord });
    vol.natoms = vol.atoms.length;
    const afterAtoms = cloneAtomsSnapshot(vol);
    pushEditHistoryEntry(record, beforeAtoms, afterAtoms, `Add ${getElementSymbol(z)}`);
    rebuildScene({ preserveView: true });
    setHintMessage(`Added ${getElementName(z)} (${getElementSymbol(z)}) atom • Total atoms: ${vol.atoms.length}`);
    return true;
  }

  /**
   * Delete one atom by index from the active volume and rebuild scene.
   * @param {number} atomIndex
   * @returns {boolean}
   */
  function deleteAtomAtIndex(atomIndex) {
    if (currentIndex < 0 || !volumes[currentIndex]) return false;
    const vol = volumes[currentIndex].vol;
    const record = volumes[currentIndex];
    if (!vol || !Array.isArray(vol.atoms)) return false;
    const idx = atomIndex | 0;
    if (idx < 0 || idx >= vol.atoms.length) return false;
    const beforeAtoms = cloneAtomsSnapshot(vol);
    const removed = vol.atoms[idx];
    vol.atoms.splice(idx, 1);
    vol.natoms = vol.atoms.length;
    const afterAtoms = cloneAtomsSnapshot(vol);
    pushEditHistoryEntry(record, beforeAtoms, afterAtoms, `Delete ${getElementSymbol(removed.Z | 0)}`);
    editSel = editSel
      .filter((i) => i !== idx)
      .map((i) => (i > idx ? i - 1 : i));
    clearAddGrowPreview();
    clearHover();
    rebuildScene({ preserveView: true });
    updateSelectedHalos();
    updateEditSelectionVisuals();
    setHintMessage(`Deleted ${getElementName(removed.Z | 0)} (${getElementSymbol(removed.Z | 0)}) • Total atoms: ${vol.atoms.length}`);
    return true;
  }

  /**
   * Delete the currently hovered atom in edit mode.
   * @returns {boolean}
   */
  function deleteHoveredAtom() {
    if (!hoverAtomMesh || !hoverAtomMesh.userData) return false;
    const idx = hoverAtomMesh.userData.index | 0;
    return deleteAtomAtIndex(idx);
  }

  /**
   * Shift active molecule coordinates so its center of mass is at (0,0,0).
   * Applies to the active file and records one undoable edit entry.
   * @returns {boolean}
   */
  function centerActiveMoleculeMassAtOrigin() {
    if (dragActive) {
      setHintMessage('Finish moving the current atom before recentering mass.');
      return false;
    }
    if (currentIndex < 0 || !volumes[currentIndex] || !volumes[currentIndex].vol) {
      setHintMessage('No active molecule to recenter.');
      return false;
    }

    const record = volumes[currentIndex];
    const vol = record.vol;
    if (!Array.isArray(vol.atoms) || vol.atoms.length === 0) {
      setHintMessage('Active file has no atoms.');
      return false;
    }

    let totalMass = 0;
    let weightedX = 0;
    let weightedY = 0;
    let weightedZ = 0;
    for (const atom of vol.atoms) {
      const mass = getAtomicMass(atom.Z | 0);
      if (!(Number.isFinite(mass) && mass > 0)) continue;
      const x = Number(atom.x) || 0;
      const y = Number(atom.y) || 0;
      const z = Number(atom.z) || 0;
      totalMass += mass;
      weightedX += mass * x;
      weightedY += mass * y;
      weightedZ += mass * z;
    }
    if (!(Number.isFinite(totalMass) && totalMass > 0)) {
      setHintMessage('Could not compute a valid center of mass.');
      return false;
    }

    const comX = weightedX / totalMass;
    const comY = weightedY / totalMass;
    const comZ = weightedZ / totalMass;
    const shiftNormNative = Math.hypot(comX, comY, comZ);
    if (!Number.isFinite(shiftNormNative) || shiftNormNative <= 1e-12) {
      setHintMessage('Center of mass is already at the origin.');
      return false;
    }

    const beforeAtoms = cloneAtomsSnapshot(vol);
    for (const atom of vol.atoms) {
      atom.x = (Number(atom.x) || 0) - comX;
      atom.y = (Number(atom.y) || 0) - comY;
      atom.z = (Number(atom.z) || 0) - comZ;
    }
    vol.natoms = vol.atoms.length;
    const afterAtoms = cloneAtomsSnapshot(vol);
    pushEditHistoryEntry(record, beforeAtoms, afterAtoms, 'Center mass at origin');

    clearAddGrowPreview();
    clearHover();
    if (currentMode === MODES.MEASURE) {
      clearEditSelection();
      updateSelectedHalos();
      updateEditSelectionVisuals();
    }
    rebuildScene({ preserveView: true });
    updateSidePanel();

    const shiftAngstrom = vol.units === 'angstrom' ? shiftNormNative : shiftNormNative * BOHR_TO_ANG;
    setHintMessage(`Shifted active molecule COM to origin (delta ${shiftAngstrom.toFixed(3)} A).`);
    return true;
  }

  /**
   * Compute where a newly added atom should be placed for one pointer click.
   * Place atoms on a camera-facing plane (parallel to screen) through target.
   * @param {PointerEvent} e
   * @param {THREE.Intersection|null} atomHit
   * @returns {THREE.Vector3|null}
   */
  function computeAddAtomPosition(e, atomHit) {
    void atomHit;
    setRaycasterFromEvent(e);
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const planePoint = new THREE.Vector3(0, 0, 0);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, planePoint);
    const p = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, p)) return p;
    return planePoint;
  }

  let __lastBondUpdate = 0;
  canvasEl.addEventListener('pointermove', (e) => {
    setEditAddHudPointer(e.clientX, e.clientY);
    // Allow hover highlighting in Edit and Measurement modes
    const allowHover = (currentMode === MODES.EDIT || currentMode === MODES.MEASURE);
    if (!allowHover) return;
    // Track movement to distinguish click vs drag in measurement mode
    if ((currentMode === MODES.MEASURE || (currentMode === MODES.EDIT && editTool === EDIT_TOOL.ADD)) && __editDownPt) {
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
    if (currentMode === MODES.EDIT && editTool === EDIT_TOOL.ADD && addGrowActive) {
      updateAddGrowPreviewFromEvent(e);
      return;
    }
    const obj = pickAtom(e);
    setHover(obj);
  });

  canvasEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    setEditAddHudPointer(e.clientX, e.clientY);
    __editDownPt = { x: e.clientX, y: e.clientY }; __editMoved = false; __editClickIdx = -1;
    dragBeforeAtomsSnapshot = null;
    const obj = pickAtom(e);
    if (currentMode === MODES.EDIT) {
      if (editTool === EDIT_TOOL.DELETE) {
        if (obj && obj.userData) {
          __editClickIdx = obj.userData.index | 0;
          e.preventDefault();
        }
        return;
      }
      if (editTool === EDIT_TOOL.ADD) {
        const hit = pickAtomHit(e);
        if (hit && hit.object && hit.object.userData) {
          const idx = hit.object.userData.index | 0;
          const vol = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex].vol : null;
          if (vol && Array.isArray(vol.atoms) && idx >= 0 && idx < vol.atoms.length) {
            addGrowActive = true;
            addGrowAnchorIndex = idx;
            addGrowAnchorPos = hit.object.position.clone();
            addGrowNeighborDirs = getEditAddNeighborDirections(vol, idx);
            addGrowDetectedAngleDeg = 0;
            addGrowPreviewPos = null;
            controls.enabled = false;
            updateEditToolboxUi({ syncSearch: false });
            updateEditAddCursorHud();
            updateAddGrowPreviewFromEvent(e);
            e.preventDefault();
          }
        }
        // If no anchor atom is hit, fallback remains click-to-add on release.
        return;
      }
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
        dragBeforeAtomsSnapshot = cloneAtomsSnapshot(vol);
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
        const record = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null;
        const vol = record && record.vol;
        const afterAtoms = vol ? cloneAtomsSnapshot(vol) : null;
        if (record && dragBeforeAtomsSnapshot && afterAtoms) {
          pushEditHistoryEntry(record, dragBeforeAtomsSnapshot, afterAtoms, 'Move atom');
        }
        // Final rebuild to update bonds/geometry once after drag
        rebuildScene({ preserveView: true });
        dragActive = false; dragAtomIndex = -1; dragPlane = null; dragPlaneStart = null; dragStartPos = null; dragOrigMeshPos = null; dragOrigAtomUnits = null; dragBeforeAtomsSnapshot = null; dragAxis = 'none';
        controls.enabled = true;
        if (editMode) renderRibbon('edit');
        // Refresh/hide guide line after drag ends
        updateAxisGuideLine();
        updateEditSelectionVisuals();
      } else if (editTool === EDIT_TOOL.DELETE) {
        if (!__editMoved && __editClickIdx >= 0) deleteAtomAtIndex(__editClickIdx);
      } else if (editTool === EDIT_TOOL.ADD) {
        if (addGrowActive) {
          const addPos = addGrowPreviewPos ? addGrowPreviewPos.clone() : null;
          clearAddGrowPreview();
          controls.enabled = true;
          if (addPos) appendAtomAtWorld(addPos);
        } else if (!__editMoved) {
          const hit = pickAtomHit(e);
          const addPos = computeAddAtomPosition(e, hit);
          if (addPos) appendAtomAtWorld(addPos);
        }
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
    if (!dragActive) dragBeforeAtomsSnapshot = null;
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
  if (centerMassBtn) centerMassBtn.onclick = () => centerActiveMoleculeMassAtOrigin();

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
  bind('down', 'global', 'r', () => centerActiveMoleculeMassAtOrigin());
  // Global: molecule style presets (1=Default, 2=Toon, 3=Kit, 4=Glossy)
  bind('down', 'global', '1', () => setMoleculeStyle('default'));
  bind('down', 'global', '2', () => setMoleculeStyle('toon'));
  bind('down', 'global', '3', () => setMoleculeStyle('kit'));
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
  bind('down', MODES.EDIT, 'g', () => { setEditTool(EDIT_TOOL.MOVE); });
  bind('down', MODES.EDIT, 'd', () => { setEditTool(EDIT_TOOL.DELETE); });
  bind('down', MODES.EDIT, 'n', () => {
    if (editTool === EDIT_TOOL.ADD) setEditAddElement(7, { announce: true });
    else setEditTool(EDIT_TOOL.ADD);
  });
  bind('down', MODES.EDIT, 'h', (e) => {
    if (e && e.shiftKey) { toggleHelp(); return; }
    if (editTool === EDIT_TOOL.ADD) setEditAddElement(1, { announce: true });
  });
  bind('down', MODES.EDIT, 'c', () => { if (editTool === EDIT_TOOL.ADD) setEditAddElement(6, { announce: true }); });
  bind('down', MODES.EDIT, 'o', () => { if (editTool === EDIT_TOOL.ADD) setEditAddElement(8, { announce: true }); });
  bind('down', MODES.EDIT, '1', () => { if (editTool === EDIT_TOOL.ADD) setEditAddBondOrder(1); else setMoleculeStyle('default'); });
  bind('down', MODES.EDIT, '2', () => { if (editTool === EDIT_TOOL.ADD) setEditAddBondOrder(2); else setMoleculeStyle('toon'); });
  bind('down', MODES.EDIT, '3', () => { if (editTool === EDIT_TOOL.ADD) setEditAddBondOrder(3); else setMoleculeStyle('kit'); });
  // Reserve "4" in edit mode so it does not trigger the global Glossy style shortcut.
  bind('down', MODES.EDIT, '4', (e) => { if (e && typeof e.preventDefault === 'function') e.preventDefault(); });
  bind('down', MODES.EDIT, 'Backspace', (e) => {
    if (editTool !== EDIT_TOOL.DELETE) return;
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    deleteHoveredAtom();
  });
  bind('down', MODES.EDIT, 'Delete', (e) => {
    if (editTool !== EDIT_TOOL.DELETE) return;
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    deleteHoveredAtom();
  });
  /**
   * Enable temporary axis lock while an axis key is held.
   * @param {'x'|'y'|'z'} axis
   */
  const axisDown = (axis) => {
    if (editTool !== EDIT_TOOL.MOVE) return;
    axisKeyDown = axis;
    axisLock = axis;
    updateAxisButtons();
    if (dragActive) dragAxis = axisLock;
    updateAxisGuideLine && updateAxisGuideLine();
  };
  /**
   * Disable temporary axis lock when an axis key is released.
   * @param {'x'|'y'|'z'} axis
   */
  const axisUp = (axis) => {
    if (axisKeyDown === axis) {
      axisKeyDown = null;
      axisLock = 'none';
      updateAxisButtons();
      if (dragActive) dragAxis = axisLock;
      updateAxisGuideLine && updateAxisGuideLine();
    }
  };
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

  /**
   * Handle Cmd/Ctrl undo/redo shortcuts.
   * @param {KeyboardEvent} e
   * @returns {boolean} True when one undo/redo action was handled.
   */
  function handleUndoRedoHotkey(e) {
    if (isTypingInInput()) return false;
    if (!(e.ctrlKey || e.metaKey)) return false;
    const key = String(e.key || '').toLowerCase();
    const isUndo = key === 'z' && !e.shiftKey;
    const isRedo = (key === 'z' && e.shiftKey) || key === 'y';
    if (!isUndo && !isRedo) return false;
    e.preventDefault();
    if (isUndo) undoLastEditAction();
    else redoLastEditAction();
    return true;
  }

  // Global key listeners delegate to router
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elementColorOverlay && elementColorOverlay.style.display === 'flex') {
      e.preventDefault();
      setElementColorOverlayOpen(false);
      return;
    }
    if (handleUndoRedoHotkey(e)) return;
    routeShortcut(e, 'down', currentMode);
  });
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
    moleculeStyle = normalizeMoleculeStyleKey(moleculeStyleSel.value || moleculeStyle);
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

  // --- Preset import/export (shared with CLI via window.VibeMolPreset) ---
  const PRESET_KIND = 'vibemol.preset';
  const PRESET_VERSION = 1;
  const PRESET_OBJECT_VALUE_KEYS = new Set([
    'global.elementColorOverrides',
  ]);
  const PRESET_TOP_LEVEL_KEYS = new Set([
    'kind',
    'presetVersion',
    'appVersion',
    'name',
    'settings',
    'meta',
    'extensions',
  ]);
  const PRESET_MODE = Object.freeze({ STRICT: 'strict', RELAXED: 'relaxed' });
  const presetSettingRegistry = new Map();
  let presetUnknownTop = {};
  let presetUnknownSettings = {};
  let presetName = 'VibeMol Preset';
  let presetMeta = {};
  let presetExtensions = {};

  /**
   * Clone JSON-compatible data. Non-serializable values are returned as-is.
   * @template T
   * @param {T} value
   * @returns {T}
   */
  function cloneJsonLike(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
  }

  /**
   * Check if a value is a plain object.
   * @param {*} value
   * @returns {boolean}
   */
  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * Normalize strict/relaxed preset apply mode.
   * @param {*} mode
   * @returns {'strict'|'relaxed'}
   */
  function normalizePresetMode(mode) {
    return mode === PRESET_MODE.STRICT ? PRESET_MODE.STRICT : PRESET_MODE.RELAXED;
  }

  /**
   * Flatten a nested settings tree to dot-delimited keys.
   * @param {*} node
   * @param {string} prefix
   * @param {Record<string, any>} out
   * @returns {Record<string, any>}
   */
  function flattenSettingsTree(node, prefix = '', out = {}) {
    if (!isPlainObject(node)) return out;
    for (const [key, value] of Object.entries(node)) {
      const nextKey = prefix ? `${prefix}.${key}` : key;
      if (isPlainObject(value)) {
        if (PRESET_OBJECT_VALUE_KEYS.has(nextKey)) out[nextKey] = cloneJsonLike(value);
        else flattenSettingsTree(value, nextKey, out);
      }
      else out[nextKey] = value;
    }
    return out;
  }

  /**
   * Coerce a value to a finite number.
   * @param {*} value
   * @param {number} fallback
   * @returns {number}
   */
  function asFiniteNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  /**
   * Coerce a value to boolean.
   * @param {*} value
   * @returns {boolean}
   */
  function asBoolean(value) {
    return !!value;
  }

  /**
   * Normalize CSS hex color inputs to `#rrggbb`.
   * @param {*} value
   * @param {string} fallback
   * @returns {string}
   */
  function asHexColor(value, fallback) {
    if (typeof value !== 'string') return fallback;
    const v = value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(v)) return v;
    return fallback;
  }

  /**
   * Register one setting key in the preset registry.
   * @param {string} key
   * @param {() => any} getter
   * @param {(value:any) => void} setter
   */
  function registerPresetSetting(key, getter, setter) {
    presetSettingRegistry.set(key, { get: getter, set: setter });
  }

  registerPresetSetting('surface.iso', () => asFiniteNumber(isoInput && isoInput.value, 0.02), (value) => {
    const n = Math.max(0, asFiniteNumber(value, 0.02));
    if (isoInput) isoInput.value = String(n);
  });
  registerPresetSetting('surface.opacity', () => asFiniteNumber(opInput && opInput.value, 1), (value) => {
    const n = Math.min(1, Math.max(0.05, asFiniteNumber(value, 1)));
    if (opInput) opInput.value = String(n);
  });
  registerPresetSetting('surface.enabled', () => !!showSurfaces, (value) => { showSurfaces = asBoolean(value); });
  registerPresetSetting('surface.style', () => surfaceStyle, (value) => {
    const next = (value === 'glass' || value === 'emissive') ? value : 'emissive';
    surfaceStyle = next;
    if (styleSelect) styleSelect.value = next;
  });
  registerPresetSetting('surface.posColor', () => (posColor && posColor.value) || '#f2a900', (value) => {
    if (posColor) posColor.value = asHexColor(value, posColor.value || '#f2a900');
    if (schemeSelect) schemeSelect.value = 'custom';
  });
  registerPresetSetting('surface.negColor', () => (negColor && negColor.value) || '#0033a0', (value) => {
    if (negColor) negColor.value = asHexColor(value, negColor.value || '#0033a0');
    if (schemeSelect) schemeSelect.value = 'custom';
  });
  registerPresetSetting('surface.colorScheme', () => (schemeSelect && schemeSelect.value) || 'custom', (value) => {
    if (!schemeSelect) return;
    const options = new Set(Array.from(schemeSelect.options).map((o) => o.value));
    const next = (typeof value === 'string' && options.has(value)) ? value : 'custom';
    schemeSelect.value = next;
    if (next !== 'custom' && typeof schemeSelect.onchange === 'function') schemeSelect.onchange();
  });
  registerPresetSetting('global.backgroundColor', () => (bgColor && bgColor.value) || '#ffffff', (value) => {
    if (!bgColor) return;
    bgColor.value = asHexColor(value, bgColor.value || '#ffffff');
    try { scene.background = new THREE.Color(bgColor.value); } catch { }
  });
  registerPresetSetting('global.showAtoms', () => !!(toggleAtoms && toggleAtoms.checked), (value) => {
    if (toggleAtoms) toggleAtoms.checked = asBoolean(value);
  });
  registerPresetSetting('global.showAtomLabels', () => !!showAtomLabels, (value) => {
    showAtomLabels = asBoolean(value);
    if (toggleAtomLabels) toggleAtomLabels.checked = showAtomLabels;
  });
  registerPresetSetting('global.showBonds', () => !!(toggleBonds && toggleBonds.checked), (value) => {
    if (toggleBonds) toggleBonds.checked = asBoolean(value);
  });
  registerPresetSetting('global.showMultiBonds', () => !!showMultiBonds, (value) => {
    showMultiBonds = asBoolean(value);
    if (toggleMultiBonds) toggleMultiBonds.checked = showMultiBonds;
  });
  registerPresetSetting('global.elementColors', () => !!(elementColors && elementColors.checked), (value) => {
    if (elementColors) elementColors.checked = asBoolean(value);
  });
  registerPresetSetting('global.elementColorOverrides', () => exportElementColorOverrides(), (value) => {
    importElementColorOverrides(value);
    refreshPeriodicCells();
    if (elementColorPicker) elementColorPicker.value = getActiveElementHexColor(selectedElementForEditor);
  });
  registerPresetSetting('global.showBox', () => !!(toggleBox && toggleBox.checked), (value) => {
    if (toggleBox) toggleBox.checked = asBoolean(value);
  });
  registerPresetSetting('global.showAxes', () => !!window.__showAxes__, (value) => {
    window.__showAxes__ = asBoolean(value);
    if (toggleAxes) toggleAxes.checked = !!window.__showAxes__;
  });
  registerPresetSetting('molecule.style', () => moleculeStyle, (value) => {
    const normalized = normalizeMoleculeStyleKey(value);
    setMoleculeStyle(normalized, { rebuild: false });
  });
  registerPresetSetting('molecule.glossyBondRadius', () => getGlossyBondCenterRadius(), (value) => {
    glossyBondRadius = asFiniteNumber(value, getGlossyBondCenterRadius());
    glossyBondRadius = getGlossyBondCenterRadius();
    if (glossyBondRadiusEl) glossyBondRadiusEl.value = String(glossyBondRadius);
  });
  registerPresetSetting('render.mode', () => renderMode, (value) => {
    const next = value === 'cloud' ? 'cloud' : 'surface';
    renderMode = next;
    if (renderModeSel) renderModeSel.value = next;
    updateRenderModeUI();
  });
  registerPresetSetting('render.cloudType', () => cloudType, (value) => {
    const next = value === 'points' ? 'points' : 'cubes';
    cloudType = next;
    if (cloudTypeSel) cloudTypeSel.value = next;
  });
  registerPresetSetting('render.cloudStride', () => asFiniteNumber(cloudStrideEl && cloudStrideEl.value, 1), (value) => {
    const n = Math.max(1, Math.min(8, Math.round(asFiniteNumber(value, 1))));
    if (cloudStrideEl) cloudStrideEl.value = String(n);
  });
  registerPresetSetting('render.cloudAlpha', () => asFiniteNumber(cloudAlphaEl && cloudAlphaEl.value, 0.1), (value) => {
    const n = Math.max(0.025, Math.min(1, asFiniteNumber(value, 0.1)));
    if (cloudAlphaEl) cloudAlphaEl.value = String(n);
  });
  registerPresetSetting('twoComponent.mode', () => global2CComponentMode, (value) => {
    const next = (typeof value === 'string' && value) ? value : 'alphaRe';
    applyGlobal2CComponent(next);
    if (componentSelect) componentSelect.value = next;
  });
  registerPresetSetting('view.shift.x', () => contentGroup.position.x, (value) => {
    contentGroup.position.x = asFiniteNumber(value, contentGroup.position.x);
    if (shiftX) shiftX.value = contentGroup.position.x.toFixed(3);
  });
  registerPresetSetting('view.shift.y', () => contentGroup.position.y, (value) => {
    contentGroup.position.y = asFiniteNumber(value, contentGroup.position.y);
    if (shiftY) shiftY.value = contentGroup.position.y.toFixed(3);
  });
  registerPresetSetting('view.shift.z', () => contentGroup.position.z, (value) => {
    contentGroup.position.z = asFiniteNumber(value, contentGroup.position.z);
    if (shiftZ) shiftZ.value = contentGroup.position.z.toFixed(3);
  });
  registerPresetSetting('view.camera.x', () => camera.position.x, (value) => { camera.position.x = asFiniteNumber(value, camera.position.x); });
  registerPresetSetting('view.camera.y', () => camera.position.y, (value) => { camera.position.y = asFiniteNumber(value, camera.position.y); });
  registerPresetSetting('view.camera.z', () => camera.position.z, (value) => { camera.position.z = asFiniteNumber(value, camera.position.z); });
  registerPresetSetting('view.target.x', () => controls.target.x, (value) => { controls.target.x = asFiniteNumber(value, controls.target.x); });
  registerPresetSetting('view.target.y', () => controls.target.y, (value) => { controls.target.y = asFiniteNumber(value, controls.target.y); });
  registerPresetSetting('view.target.z', () => controls.target.z, (value) => { controls.target.z = asFiniteNumber(value, controls.target.z); });
  registerPresetSetting('view.autoRotate', () => !!controls.autoRotate, (value) => { controls.autoRotate = asBoolean(value); if (autoRot) autoRot.checked = !!controls.autoRotate; });
  registerPresetSetting('view.rotateSpeed', () => controls.rotateSpeed ?? 1.0, (value) => {
    controls.rotateSpeed = asFiniteNumber(value, controls.rotateSpeed ?? 1.0);
    if (rotSpeed) rotSpeed.value = Number(controls.rotateSpeed).toFixed(2);
  });
  registerPresetSetting('view.damping', () => controls.dampingFactor ?? 0.05, (value) => {
    controls.dampingFactor = asFiniteNumber(value, controls.dampingFactor ?? 0.05);
    if (damp) damp.value = Number(controls.dampingFactor).toFixed(2);
  });
  registerPresetSetting('view.autoRotateSpeed', () => controls.autoRotateSpeed ?? 2.0, (value) => {
    controls.autoRotateSpeed = asFiniteNumber(value, controls.autoRotateSpeed ?? 2.0);
    if (autoRotSpeed) autoRotSpeed.value = Number(controls.autoRotateSpeed).toFixed(2);
  });

  /**
   * Export current app settings as a portable preset envelope.
   * Unknown fields from an imported preset are preserved on round-trip.
   * @param {{name?:string}=} options
   */
  function exportPresetEnvelope(options = {}) {
    const settings = cloneJsonLike(presetUnknownSettings) || {};
    for (const [key, def] of presetSettingRegistry.entries()) settings[key] = def.get();
    const name = (typeof options.name === 'string' && options.name.trim())
      ? options.name.trim()
      : presetName;
    const now = new Date().toISOString();
    const mergedMeta = Object.assign({}, cloneJsonLike(presetMeta) || {}, {
      source: 'web',
      updatedAt: now,
    });
    if (!mergedMeta.createdAt) mergedMeta.createdAt = now;
    return Object.assign({}, cloneJsonLike(presetUnknownTop) || {}, {
      kind: PRESET_KIND,
      presetVersion: PRESET_VERSION,
      appVersion: APP_VERSION,
      name,
      settings,
      meta: mergedMeta,
      extensions: cloneJsonLike(presetExtensions) || {},
    });
  }

  /**
   * Apply one settings object to the current app.
   * @param {*} settingsLike
   * @param {{mode?:'strict'|'relaxed'}=} options
   */
  function applyPresetSettings(settingsLike, options = {}) {
    const mode = normalizePresetMode(options.mode);
    const warnings = [];
    const flatSettings = flattenSettingsTree(settingsLike);
    const unknownSettings = {};
    for (const key of Object.keys(flatSettings)) {
      if (!presetSettingRegistry.has(key)) {
        unknownSettings[key] = flatSettings[key];
        warnings.push(`Unknown setting key ignored: ${key}`);
      }
    }
    if (mode === PRESET_MODE.STRICT && Object.keys(unknownSettings).length > 0) {
      throw new Error(`Unknown setting keys: ${Object.keys(unknownSettings).join(', ')}`);
    }

    const applied = [];
    suspendPresetRebuild = true;
    try {
      for (const [key, def] of presetSettingRegistry.entries()) {
        if (!(key in flatSettings)) continue;
        let value = flatSettings[key];
        if (key === 'molecule.style') {
          const raw = (typeof value === 'string') ? value : '';
          const normalized = normalizeMoleculeStyleKey(raw);
          if (normalized !== raw) {
            warnings.push(`Mapped deprecated style value ${raw || '(empty)'} -> ${normalized}`);
          }
          value = normalized;
        }
        try {
          def.set(value);
          applied.push(key);
        } catch (err) {
          const message = `Failed setting ${key}: ${err && err.message ? err.message : String(err)}`;
          if (mode === PRESET_MODE.STRICT) throw new Error(message);
          warnings.push(message);
        }
      }
    } finally {
      suspendPresetRebuild = false;
    }

    controls.update();
    refreshViewUI();
    applyMoleculeStyleUiState();
    updateRenderModeUI();
    updateSurfBtn();
    rebuildScene({ preserveView: true });
    updateSidePanel();
    updateOpacityAndColors();

    presetUnknownSettings = cloneJsonLike(unknownSettings) || {};
    return {
      ok: true,
      mode,
      applied,
      warnings,
      unknownSettings: Object.keys(unknownSettings),
    };
  }

  /**
   * Import and apply a preset envelope.
   * @param {*} preset
   * @param {{mode?:'strict'|'relaxed'}=} options
   */
  function importPresetEnvelope(preset, options = {}) {
    const mode = normalizePresetMode(options.mode);
    if (!isPlainObject(preset)) throw new Error('Preset must be an object.');
    const warnings = [];

    const kind = preset.kind;
    if (kind !== PRESET_KIND) {
      const msg = `Unexpected preset kind: ${String(kind)} (expected ${PRESET_KIND})`;
      if (mode === PRESET_MODE.STRICT) throw new Error(msg);
      warnings.push(msg);
    }
    const parsedVersion = Number(preset.presetVersion);
    if (Number.isFinite(parsedVersion) && parsedVersion > PRESET_VERSION) {
      const msg = `Preset version ${parsedVersion} is newer than supported ${PRESET_VERSION}`;
      if (mode === PRESET_MODE.STRICT) throw new Error(msg);
      warnings.push(msg);
    }

    const unknownTop = {};
    for (const [key, value] of Object.entries(preset)) {
      if (!PRESET_TOP_LEVEL_KEYS.has(key)) unknownTop[key] = value;
    }
    presetUnknownTop = cloneJsonLike(unknownTop) || {};

    if (typeof preset.name === 'string' && preset.name.trim()) presetName = preset.name.trim();
    if (isPlainObject(preset.meta)) presetMeta = cloneJsonLike(preset.meta) || {};
    if (isPlainObject(preset.extensions)) presetExtensions = cloneJsonLike(preset.extensions) || {};

    const applyResult = applyPresetSettings(preset.settings || {}, { mode });
    return {
      ok: true,
      mode,
      kind: PRESET_KIND,
      presetVersion: PRESET_VERSION,
      applied: applyResult.applied,
      warnings: warnings.concat(applyResult.warnings),
      unknownTop: Object.keys(unknownTop),
      unknownSettings: applyResult.unknownSettings,
      name: presetName,
    };
  }

  /**
   * Save current settings to a downloadable preset file.
   */
  function saveCurrentPresetToFile() {
    // Flush pending color-picker edits so saved presets include the latest color.
    if (elementColorPicker) {
      const active = getActiveElementHexColor(selectedElementForEditor);
      const pending = normalizeHexColor(elementColorPicker.value, active);
      if (pending !== active) setElementColorOverride(selectedElementForEditor, pending);
    }
    const preset = exportPresetEnvelope();
    const blob = new Blob([`${JSON.stringify(preset, null, 2)}\n`], { type: 'application/json' });
    const link = document.createElement('a');
    const date = new Date().toISOString().replace(/[:]/g, '-').replace(/\..+/, '');
    link.download = `vibemol-preset-${date}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  /**
   * Parse and apply one uploaded preset JSON file.
   * @param {FileList|null} fileList
   */
  async function handlePresetFileUpload(fileList) {
    const file = fileList && fileList[0];
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text);
    const result = importPresetEnvelope(parsed, { mode: PRESET_MODE.RELAXED });
    setNavigationHint(`Loaded preset: ${result.name}`);
    if (result.warnings.length > 0) console.warn('[Preset] import warnings', result.warnings);
  }

  // Public API for browser automation and future integrations.
  window.VibeMolPreset = Object.freeze({
    kind: PRESET_KIND,
    version: PRESET_VERSION,
    listKeys: () => Array.from(presetSettingRegistry.keys()),
    export: (options = {}) => exportPresetEnvelope(options),
    import: (preset, options = {}) => importPresetEnvelope(preset, options),
  });

  if (savePresetBtn) savePresetBtn.onclick = () => saveCurrentPresetToFile();
  if (loadPresetBtn) loadPresetBtn.onclick = () => { if (presetInput) presetInput.click(); };
  if (presetInput) {
    presetInput.addEventListener('change', async (e) => {
      try { await handlePresetFileUpload(e.target && e.target.files); }
      catch (err) { console.error('[Preset] failed to import', err); alert(`Preset import failed: ${err.message || err}`); }
      finally { presetInput.value = ''; }
    });
  }

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
    updatePubChemMetadataPanel(record);
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
   * Remove demo/sample placeholders before importing user-provided data.
   */
  function clearPlaceholderVolumesForUserLoad() {
    let changed = false;
    if (volumes.length === 1 && volumes[0].name === 'Demo Water') {
      console.log('[CUBE] Replacing demo with loaded data.');
      volumes = [];
      currentIndex = -1;
      clearSceneMeshes();
      changed = true;
    }
    if (volumes.some(v => v.isSample)) {
      console.log('[CUBE] Removing sample.cube from list before adding user data.');
      volumes = volumes.filter(v => !v.isSample);
      currentIndex = -1;
      clearSceneMeshes();
      changed = true;
    }
    if (changed) pruneEditHistory();
  }

  /**
   * Parse one file payload into a volume using extension-based dispatch.
   * @param {string} name
   * @param {string} text
   * @returns {*}
   */
  function parseVolumeByName(name, text) {
    const lower = name.toLowerCase();
    if (lower.endsWith('.xyz')) return parseXYZ(text);
    if (lower.endsWith('.2ccube')) return parseTwoComponentCube(text);
    return parseCube(text);
  }

  /**
   * Append one parsed volume record and apply common post-processing.
   * @param {string} name
   * @param {*} vol
   * @param {Object=} extras
   */
  function appendParsedVolumeRecord(name, vol, extras = null) {
    const meta = Object.assign({ name, vol }, extras || {});
    if (vol && vol.isTwoComponent) setVolume2CComponent(meta, global2CComponentMode);
    volumes.push(meta);
    if (vol && vol.isoHint != null && (isoInput.value === '' || currentIndex === -1)) {
      isoInput.value = String(vol.isoHint);
    }
    if (vol && vol.data && vol.data.length) {
      try {
        const stats = arrayMinMax(vol.data);
        console.log('[CUBE] Loaded', name, {
          title: vol.title,
          nxyz: vol.nxyz,
          origin: vol.origin,
          axes: vol.axes,
          natoms: vol.natoms,
          isoHint: vol.isoHint,
          min: stats.min,
          max: stats.max
        });
      } catch (e) {
        console.warn('[CUBE] Stats failed for', name, e);
      }
    } else {
      console.log('[XYZ] Loaded', name, { natoms: vol ? vol.natoms : 0 });
    }
  }

  /**
   * Escape text for safe insertion into HTML.
   * @param {*} value
   * @returns {string}
   */
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Render PubChem metadata for the active record.
   * @param {*} record
   */
  function updatePubChemMetadataPanel(record) {
    if (!pubchemMetaContent) return;
    const meta = record && record.pubchemMeta;
    if (!meta) {
      pubchemMetaContent.innerHTML = '<div class="meta-empty">No PubChem metadata for active file.</div>';
      return;
    }
    const rows = [
      ['Name', meta.title || '—'],
      ['CID', meta.cid != null ? String(meta.cid) : '—'],
      ['Formula', meta.molecularFormula || '—'],
      ['Weight', meta.molecularWeight || '—'],
      ['IUPAC', meta.iupacName || '—'],
      ['SMILES', meta.connectivitySmiles || '—'],
      ['Source', meta.source || 'PubChem']
    ];
    if (meta.query) rows.splice(1, 0, ['Query', meta.query]);
    if (meta.url) rows.push(['URL', meta.url]);
    const body = rows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('');
    pubchemMetaContent.innerHTML = `<table class="meta-table"><tbody>${body}</tbody></table>`;
  }

  /**
   * Refresh selector, focus first newly added item, and rebuild scene.
   * @param {number} startIndex
   */
  function finalizeLoadedVolumes(startIndex) {
    refreshFileSelect();
    if (volumes.length > 0) {
      currentIndex = Math.max(0, Math.min(startIndex, volumes.length - 1));
      if (fileSelect && fileSelect.options.length > currentIndex) {
        fileSelect.value = String(currentIndex);
      }
      rebuildScene();
      updateSidePanel();
    }
    updateEmptyStateVisibility();
  }

  /**
   * Parse and append newly selected/dropped files, then focus the first added file.
   * Existing demo/sample placeholder data is removed before importing user files.
   * @param {FileList|File[]} fileList
   * @returns {Promise<void>}
   */
  async function handleFiles(fileList) {
    const arr = Array.from(fileList);
    if (arr.length === 0) return;
    clearPlaceholderVolumesForUserLoad();
    const startIndex = volumes.length; // index of first newly added
    for (const f of arr) {
      const text = await f.text();
      const vol = parseVolumeByName(f.name, text);
      appendParsedVolumeRecord(f.name, vol);
    }
    finalizeLoadedVolumes(startIndex);
  }

  const PUBCHEM_AUTOCOMPLETE_LIMIT = 10;
  let pubchemBusy = false;
  let pubchemSuggestTimer = null;
  let pubchemSuggestToken = 0;
  const pubchemHas3DByNameCache = new Map();
  const pubchemHas3DByCidCache = new Map();

  /**
   * Update the hint message if the hint UI element exists.
   * @param {string} message
   */
  function setHintMessage(message) {
    if (hintEl) hintEl.textContent = message;
  }

  /**
   * Compose and show a standard navigation hint.
   * @param {string} prefix
   * @param {{includeStyles?:boolean}=} options
   */
  function setNavigationHint(prefix, options = {}) {
    const includeStyles = !!options.includeStyles;
    const parts = [String(prefix || '').trim(), HINT_NAVIGATION];
    if (includeStyles) parts.push(HINT_STYLE_KEYS);
    setHintMessage(parts.filter(Boolean).join(' • '));
  }

  /**
   * Show startup instructions only when no active file is loaded.
   */
  function updateEmptyStateVisibility() {
    if (!emptyStateEl) return;
    const hasActiveVolume = currentIndex >= 0 && !!volumes[currentIndex];
    const showEmptyState = !hasActiveVolume && currentMode === MODES.DISPLAY;
    emptyStateEl.classList.toggle('hidden', !showEmptyState);
  }

  /**
   * Update PubChem autocomplete options.
   * @param {string[]} terms
   */
  function setPubChemSuggestions(terms) {
    if (!pubchemSuggestionsEl) return;
    pubchemSuggestionsEl.innerHTML = '';
    for (const term of terms) {
      const opt = document.createElement('option');
      opt.value = term;
      pubchemSuggestionsEl.appendChild(opt);
    }
  }

  /**
   * Normalize a PubChem search string.
   * @param {*} value
   * @returns {string}
   */
  function normalizePubChemQuery(value) {
    return String(value || '').trim();
  }

  /**
   * Build a canonical PubChem compound URL for one CID.
   * @param {number} cid
   * @returns {string}
   */
  function getPubChemCompoundUrl(cid) {
    return `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`;
  }

  /**
   * Fetch JSON from PubChem with consistent error handling.
   * @param {string} url
   * @param {string} context
   * @param {{allow404?:boolean}=} options
   * @returns {Promise<object|null>}
   */
  async function fetchPubChemJson(url, context, options = {}) {
    const allow404 = !!options.allow404;
    const res = await fetch(url);
    if (allow404 && res.status === 404) return null;
    if (!res.ok) throw new Error(`${context} failed (${res.status})`);
    return await res.json();
  }

  /**
   * Fetch text from PubChem with consistent error handling.
   * @param {string} url
   * @param {string} context
   * @returns {Promise<string>}
   */
  async function fetchPubChemText(url, context) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${context} failed (${res.status})`);
    return await res.text();
  }

  /**
   * Read CID list from a PUG JSON payload.
   * @param {*} data
   * @returns {number[]}
   */
  function extractPubChemCidList(data) {
    const cidsRaw = data && data.IdentifierList && Array.isArray(data.IdentifierList.CID)
      ? data.IdentifierList.CID
      : [];
    return cidsRaw.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  }

  /**
   * Build minimal metadata when PubChem property lookup is unavailable.
   * @param {number} cid
   * @param {string} query
   * @returns {{cid:number,query:string,source:string,url:string}}
   */
  function buildPubChemMetadataFallback(cid, query) {
    return {
      cid,
      query: normalizePubChemQuery(query),
      source: 'PubChem',
      url: getPubChemCompoundUrl(cid),
    };
  }

  /**
   * Check whether a conformer endpoint exists for one PubChem lookup target.
   * @param {string} cacheKey
   * @param {Map<string|number,boolean>} cache
   * @param {string} url
   * @param {string} context
   * @returns {Promise<boolean>}
   */
  async function hasPubChemConformer(cacheKey, cache, url, context) {
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const data = await fetchPubChemJson(url, context, { allow404: true });
    const has3D = !!data;
    cache.set(cacheKey, has3D);
    return has3D;
  }

  /**
   * Fetch compound name suggestions from PubChem autocomplete API.
   * @param {string} query
   * @param {number} limit
   * @returns {Promise<string[]>}
   */
  async function fetchPubChemSuggestions(query, limit = PUBCHEM_AUTOCOMPLETE_LIMIT) {
    const q = normalizePubChemQuery(query);
    if (!q) return [];
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound/${encodeURIComponent(q)}/JSON?limit=${Math.max(1, Math.min(25, limit | 0))}`;
    const data = await fetchPubChemJson(url, 'PubChem autocomplete');
    const terms = (data && data.dictionary_terms && Array.isArray(data.dictionary_terms.compound))
      ? data.dictionary_terms.compound
      : [];
    const seen = new Set();
    const unique = [];
    for (const t of terms) {
      if (typeof t !== 'string') continue;
      const key = t.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(t.trim());
    }
    if (unique.length === 0) return unique;

    // Keep only entries that have at least one 3D conformer record.
    const checks = await Promise.all(
      unique.map(async (term) => {
        try {
          return await hasPubChem3DByName(term);
        } catch (err) {
          console.warn('[PubChem] 3D availability check failed', term, err);
          return false;
        }
      })
    );

    const filtered = [];
    for (let i = 0; i < unique.length; i++) {
      if (checks[i]) filtered.push(unique[i]);
    }
    return filtered;
  }

  /**
   * Check whether a PubChem name has at least one 3D conformer entry.
   * Results are memoized to keep autocomplete responsive.
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async function hasPubChem3DByName(name) {
    const q = normalizePubChemQuery(name);
    if (!q) return false;
    const cacheKey = q.toLowerCase();
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(q)}/conformers/JSON`;
    return await hasPubChemConformer(cacheKey, pubchemHas3DByNameCache, url, 'PubChem conformer lookup');
  }

  /**
   * Check whether one CID has at least one 3D conformer.
   * @param {number} cid
   * @returns {Promise<boolean>}
   */
  async function hasPubChem3DByCid(cid) {
    const n = Number(cid);
    if (!Number.isFinite(n)) return false;
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${n}/conformers/JSON`;
    return await hasPubChemConformer(n, pubchemHas3DByCidCache, url, 'PubChem CID conformer lookup');
  }

  /**
   * Resolve the first CID that matches a PubChem name query.
   * When `require3D` is set, returns the first CID with a 3D conformer.
   * @param {string} name
   * @param {{require3D?:boolean}=} options
   * @returns {Promise<number>}
   */
  async function fetchPubChemCidByName(name, options = {}) {
    const require3D = !!options.require3D;
    const q = normalizePubChemQuery(name);
    if (!q) throw new Error('Empty PubChem query.');
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(q)}/cids/JSON`;
    const data = await fetchPubChemJson(url, 'PubChem CID lookup');
    const cids = extractPubChemCidList(data);
    if (cids.length === 0) throw new Error(`No PubChem CID found for "${q}".`);
    if (!require3D) return cids[0];

    for (const cid of cids.slice(0, 24)) {
      try {
        if (await hasPubChem3DByCid(cid)) return cid;
      } catch (err) {
        console.warn('[PubChem] CID 3D check failed', cid, err);
      }
    }
    throw new Error(`No PubChem 3D structure found for "${q}".`);
  }

  /**
   * Fetch an SDF record for one PubChem CID.
   * Prefers 3D coordinates and optionally requires 3D-only mode.
   * @param {number} cid
   * @param {{require3D?:boolean}=} options
   * @returns {Promise<string>}
   */
  async function fetchPubChemSdfByCid(cid, options = {}) {
    const require3D = !!options.require3D;
    const modes = require3D ? ['3d'] : ['3d', '2d'];
    let lastStatus = 0;
    for (const recordType of modes) {
      const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/SDF?record_type=${recordType}`;
      try {
        return await fetchPubChemText(url, 'PubChem SDF fetch');
      } catch (err) {
        const msg = String((err && err.message) || err || '');
        const m = msg.match(/\((\d+)\)$/);
        lastStatus = m ? Number(m[1]) : lastStatus;
      }
    }
    throw new Error(`PubChem SDF fetch failed for CID ${cid} (${lastStatus || 'no response'}).`);
  }

  /**
   * Fetch selected metadata fields for one PubChem CID.
   * @param {number} cid
   * @param {string} query
   * @returns {Promise<{cid:number,query:string,title:string,molecularFormula:string,molecularWeight:string,iupacName:string,connectivitySmiles:string,source:string,url:string}>}
   */
  async function fetchPubChemMetadata(cid, query = '') {
    const n = Number(cid);
    if (!Number.isFinite(n)) throw new Error(`Invalid PubChem CID: ${cid}`);
    const fields = [
      'Title',
      'IUPACName',
      'MolecularFormula',
      'MolecularWeight',
      'ConnectivitySMILES'
    ].join(',');
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${n}/property/${fields}/JSON`;
    const data = await fetchPubChemJson(url, 'PubChem metadata lookup');
    const prop = data && data.PropertyTable && Array.isArray(data.PropertyTable.Properties)
      ? data.PropertyTable.Properties[0]
      : null;
    if (!prop || typeof prop !== 'object') throw new Error(`No PubChem metadata found for CID ${n}.`);
    return {
      cid: n,
      query: normalizePubChemQuery(query),
      title: (typeof prop.Title === 'string' && prop.Title.trim()) ? prop.Title.trim() : '',
      molecularFormula: typeof prop.MolecularFormula === 'string' ? prop.MolecularFormula : '',
      molecularWeight: typeof prop.MolecularWeight === 'string' ? prop.MolecularWeight : '',
      iupacName: typeof prop.IUPACName === 'string' ? prop.IUPACName : '',
      connectivitySmiles: typeof prop.ConnectivitySMILES === 'string' ? prop.ConnectivitySMILES : '',
      source: 'PubChem',
      url: getPubChemCompoundUrl(n)
    };
  }

  /**
   * Convert an SDF mol block to XYZ text for existing parser reuse.
   * @param {string} sdfText
   * @param {string} fallbackTitle
   * @returns {string}
   */
  function sdfToXYZText(sdfText, fallbackTitle) {
    const lines = String(sdfText || '').replace(/\r/g, '').split('\n');
    if (lines.length < 5) throw new Error('Invalid SDF payload from PubChem.');
    const countsLine = lines[3] || '';
    let natoms = parseInt(countsLine.slice(0, 3).trim(), 10);
    if (!Number.isFinite(natoms)) {
      const c = countsLine.trim().split(/\s+/);
      natoms = parseInt(c[0] || '', 10);
    }
    if (!Number.isFinite(natoms) || natoms <= 0) throw new Error('Could not parse atom count from PubChem SDF.');

    const atomLines = lines.slice(4, 4 + natoms);
    if (atomLines.length !== natoms) throw new Error('PubChem SDF ended before atom block completed.');

    const xyzRows = [];
    for (const line of atomLines) {
      let x = parseFloat(line.slice(0, 10));
      let y = parseFloat(line.slice(10, 20));
      let z = parseFloat(line.slice(20, 30));
      let sym = line.slice(31, 34).trim();
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !sym) {
        const p = line.trim().split(/\s+/);
        x = parseFloat(p[0]);
        y = parseFloat(p[1]);
        z = parseFloat(p[2]);
        sym = p[3] || '';
      }
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !sym) {
        throw new Error('Failed to parse PubChem SDF atom coordinates.');
      }
      xyzRows.push(`${sym} ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}`);
    }

    return `${xyzRows.length}\n${fallbackTitle}\n${xyzRows.join('\n')}\n`;
  }

  /**
   * Enable/disable the PubChem load button during network calls.
   * @param {boolean} busy
   */
  function setPubChemBusy(busy) {
    pubchemBusy = !!busy;
    if (!pubchemLoadBtn) return;
    pubchemLoadBtn.disabled = pubchemBusy;
    pubchemLoadBtn.textContent = pubchemBusy ? 'Loading…' : 'Load';
  }

  /**
   * Import one molecule from PubChem name query and append it as XYZ.
   * @param {string} rawQuery
   * @returns {Promise<void>}
   */
  async function loadPubChemCompound(rawQuery) {
    const query = normalizePubChemQuery(rawQuery);
    if (!query || pubchemBusy) return;
    setPubChemBusy(true);
    try {
      setHintMessage(`PubChem: searching "${query}"...`);
      const cid = await fetchPubChemCidByName(query, { require3D: true });
      const sdfText = await fetchPubChemSdfByCid(cid, { require3D: true });
      let pubchemMeta = null;
      try {
        pubchemMeta = await fetchPubChemMetadata(cid, query);
      } catch (metaErr) {
        console.warn('[PubChem] metadata lookup failed', metaErr);
      }
      const xyzText = sdfToXYZText(sdfText, `PubChem CID ${cid} ${query}`);
      const vol = parseXYZ(xyzText);
      if (!vol || !Array.isArray(vol.atoms) || vol.atoms.length === 0) {
        throw new Error('PubChem import produced an empty structure.');
      }
      vol.title = `PubChem CID ${cid}`;
      vol.comment = query;
      clearPlaceholderVolumesForUserLoad();
      const startIndex = volumes.length;
      appendParsedVolumeRecord(
        `${query} [CID ${cid}].xyz`,
        vol,
        { pubchemMeta: pubchemMeta || buildPubChemMetadataFallback(cid, query) }
      );
      finalizeLoadedVolumes(startIndex);
      setNavigationHint(`Loaded PubChem: ${query} (CID ${cid})`);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      console.error('[PubChem] import failed', err);
      setHintMessage(`PubChem import failed: ${msg}`);
      alert(`PubChem import failed: ${msg}`);
    } finally {
      setPubChemBusy(false);
    }
  }

  /**
   * Debounced autocomplete lookup for the PubChem query input.
   */
  function schedulePubChemSuggestions() {
    if (!pubchemQueryInput) return;
    if (pubchemSuggestTimer) clearTimeout(pubchemSuggestTimer);
    const query = normalizePubChemQuery(pubchemQueryInput.value);
    if (query.length < 2) {
      setPubChemSuggestions([]);
      return;
    }
    const token = ++pubchemSuggestToken;
    pubchemSuggestTimer = setTimeout(async () => {
      try {
        const terms = await fetchPubChemSuggestions(query, PUBCHEM_AUTOCOMPLETE_LIMIT);
        if (token !== pubchemSuggestToken) return;
        setPubChemSuggestions(terms);
      } catch (err) {
        if (token !== pubchemSuggestToken) return;
        console.warn('[PubChem] autocomplete failed', err);
        setPubChemSuggestions([]);
      }
    }, 240);
  }

  if (pubchemQueryInput) {
    pubchemQueryInput.addEventListener('input', schedulePubChemSuggestions);
    pubchemQueryInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      loadPubChemCompound(pubchemQueryInput.value);
    });
  }
  if (pubchemLoadBtn) pubchemLoadBtn.onclick = () => loadPubChemCompound(pubchemQueryInput ? pubchemQueryInput.value : '');

  fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
  /**
   * Allow file drops on UI surfaces and route them to standard file loading.
   * @param {DragEvent} e
   */
  function handleFileDragOver(e) {
    if (!e) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }
  /**
   * Handle one dropped file payload.
   * @param {DragEvent} e
   */
  function handleFileDrop(e) {
    if (!e) return;
    e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length > 0) void handleFiles(files);
  }
  const drop = document.getElementById('drop');
  drop.addEventListener('dragover', handleFileDragOver);
  drop.addEventListener('drop', handleFileDrop);
  if (emptyStateEl) {
    emptyStateEl.addEventListener('dragover', handleFileDragOver);
    emptyStateEl.addEventListener('drop', handleFileDrop);
  }
  if (emptyStateCardEl) {
    emptyStateCardEl.addEventListener('dragover', handleFileDragOver);
    emptyStateCardEl.addEventListener('drop', handleFileDrop);
  }
  if (emptyStateDropZoneEl) {
    emptyStateDropZoneEl.addEventListener('dragover', handleFileDragOver);
    emptyStateDropZoneEl.addEventListener('drop', handleFileDrop);
  }
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

  // Clear all loaded files and return to startup state.
  clearBtn.onclick = () => {
    volumes = [];
    currentIndex = -1;
    clearEditHistory();
    refreshFileSelect();
    clearSceneMeshes();
    updateSidePanel();
    updateEmptyStateVisibility();
    setNavigationHint(HINT_START, { includeStyles: true });
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
  if (toggleMultiBonds) {
    toggleMultiBonds.onchange = () => {
      showMultiBonds = !!toggleMultiBonds.checked;
      rebuildScene({ preserveView: true });
    };
  }
  if (toggleAtomLabels) {
    toggleAtomLabels.onchange = () => {
      showAtomLabels = !!toggleAtomLabels.checked;
      rebuildScene({ preserveView: true });
    };
  }
  elementColors.onchange = () => {
    refreshPeriodicCells();
    rebuildScene({ preserveView: true });
  };
  if (elementColorBtn) elementColorBtn.onclick = () => setElementColorOverlayOpen(true);
  if (elementColorClose) elementColorClose.onclick = () => setElementColorOverlayOpen(false);
  if (elementColorOverlay) {
    elementColorOverlay.addEventListener('click', (e) => {
      if (e.target === elementColorOverlay) setElementColorOverlayOpen(false);
    });
  }
  /**
   * Apply the current picker value as an override for the selected element.
   */
  function applyElementColorPickerValue() {
    if (!elementColorPicker) return;
    setElementColorOverride(selectedElementForEditor, elementColorPicker.value);
    refreshPeriodicCell(selectedElementForEditor);
    rebuildScene({ preserveView: true });
  }
  if (elementColorPicker) {
    // Some browsers commit `<input type="color">` on `change` only.
    elementColorPicker.oninput = applyElementColorPickerValue;
    elementColorPicker.onchange = applyElementColorPickerValue;
  }
  if (elementColorResetOne) {
    elementColorResetOne.onclick = () => {
      elementColorOverrides.delete(selectedElementForEditor);
      refreshPeriodicCell(selectedElementForEditor);
      if (elementColorPicker) elementColorPicker.value = getActiveElementHexColor(selectedElementForEditor);
      rebuildScene({ preserveView: true });
    };
  }
  if (elementColorResetAll) {
    elementColorResetAll.onclick = () => {
      elementColorOverrides.clear();
      refreshPeriodicCells();
      if (elementColorPicker) elementColorPicker.value = getActiveElementHexColor(selectedElementForEditor);
      rebuildScene({ preserveView: true });
    };
  }
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
    if (currentIndex < 0) {
      updateEmptyStateVisibility();
      return;
    }

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
    updateEmptyStateVisibility();
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
      clearEditHistory();
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
      setNavigationHint('Loaded sample.cube', { includeStyles: true });
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

  // Startup: begin with an empty scene and onboarding text.
  updateEmptyStateVisibility();

  // Keyboard shortcuts are handled by the mode-aware router defined above.

})();
