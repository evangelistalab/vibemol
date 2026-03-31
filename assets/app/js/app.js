(function () {
  // --- Constants & helpers ---
  const BOHR_TO_ANG = 0.529177210903;
  // App version displayed in Help
  const APP_VERSION = '0.6.5';
  const HINT_NAVIGATION = 'Orbit: mouse drag • Zoom: wheel • Pan: right-drag';
  const HINT_STYLE_KEYS = 'Style: 1=Default 2=Toon 3=Kit 4=Glossy';
  const HINT_START = '';
  const VIBRATION_KIND = 'vibemol.vibrations';
  const VIBRATION_DEFAULT_AMPLITUDE = 0.5;
  const VIBRATION_DEFAULT_SPEED = 0.75;
  const VIBRATION_HIDE_SMALL_FREQ_THRESHOLD_CM1 = 5.0;
  const VIBRATION_IR_MIN_FREQ_CM1 = 20;
  const VIBRATION_IR_DEFAULT_SIGMA_CM1 = 28;
  const CM_INV_TEXT = 'cm⁻¹';
  const CM_INV_HTML = 'cm<sup>−1</sup>';
  const AUTO_ISO_TARGET_FRACTION = 0.85;
  const AUTO_ISO_HISTOGRAM_BINS = 512;
  const AUTO_ISO_MAX_SAMPLES = 650000;
  const AUTO_ISO_WORKER_THRESHOLD_SAMPLES = 250000;
  const AUTO_ISO_WORKER_TIMEOUT_MS = 15000;
  const MOLDEN_GRID_PADDING_ANG = 3.0;
  const MOLDEN_GRID_TARGET_STEP_ANG = 0.35;
  const MOLDEN_GRID_MAX_AXIS = 84;
  const MOLDEN_GRID_MIN_AXIS = 36;
  const MOLDEN_GRID_MAX_TOTAL_POINTS = 360000;
  const DEFAULT_2C_COMPONENT_MODE = 'alphaBetaPhase';
  const DEFAULT_ISO_VALUE = 0.02;
  const HEADER_HAPPY_EMOJIS = Object.freeze(['🙂', '😊', '😄', '😃', '😁', '😎', '🤓', '😺', '🤠', '🫡', '😇', '😍', '🫡', '🥳']);
  /**
   * Centralized app color palette used by canvas drawing and inline style snippets.
   * Keep color edits here so visual tuning stays coherent.
   */
  const UI_PALETTE = Object.freeze({
    white: '#ffffff',
    black: '#000000',
    phaseWheelStrokeDark: 'rgba(0,0,0,0.9)',
    phaseWheelStrokeLight: 'rgba(255,255,255,0.95)',
    periodicSymbolFill: 'rgba(235,242,252,0.95)',
    periodicSymbolStroke: 'rgba(10,16,26,0.8)',
    irAxisStroke: 'rgba(142, 168, 200, 0.35)',
    irTextMuted: '#93a6bf',
    irCurve: '#8fc5ff',
    irSelectedLine: '#ff9d21',
    irSelectedBand: 'rgba(255, 157, 33, 0.22)',
    irSelectedText: '#ffb155',
    irAxisText: '#92a5bf',
    shortcutKeyBg: '#1a2230',
    shortcutKeyText: '#e9f1ff',
    shortcutKeyBorder: '#2a3546',
    editBadgeDisplayBorder: '#4aa3ff',
    editBadgeDisplayBg: 'rgba(74, 163, 255, 0.18)',
    editBadgeAddBorder: '#57cd8a',
    editBadgeAddBg: 'rgba(87, 205, 138, 0.2)',
    editBadgeTransformBorder: '#b790ff',
    editBadgeTransformBg: 'rgba(183, 144, 255, 0.2)',
    editBadgeDeleteBorder: '#ff7373',
    editBadgeDeleteBg: 'rgba(255, 115, 115, 0.2)',
    quickPickTextOnLight: '#0f1a2b',
    quickPickTextOnLightAlt: '#0b1220',
    quickPickTextOnDark: '#f4f8ff',
    quickPickFallbackBg: '#1a2230',
    quickPickFallbackFg: '#eef6ff',
    measurementLabelBg: 'rgba(20,22,24,0.85)',
    measurementLabelBgHover: 'rgba(20,112,255,0.94)',
    measurementLabelText: '#e8eef6',
    atomLabelTextDefault: '#f3f7ff',
  });
  const SURFACE_COLOR_SCHEMES = Object.freeze({
    emory: Object.freeze({ pos: '#f2a900', neg: '#0033a0' }),
    national: Object.freeze({ pos: '#e60000', neg: '#0033a0' }),
    bright: Object.freeze({ pos: '#ffcc00', neg: '#00bfff' }),
    electron: Object.freeze({ pos: '#ff00bf', neg: '#2eb82e' }),
    classic: Object.freeze({ pos: '#1f77b4', neg: '#d62728' }),
  });
  const DEFAULT_SURFACE_SCHEME = SURFACE_COLOR_SCHEMES.emory;
  const DEFAULT_POS_SURFACE_COLOR = DEFAULT_SURFACE_SCHEME.pos;
  const DEFAULT_NEG_SURFACE_COLOR = DEFAULT_SURFACE_SCHEME.neg;

  const { arrayMinMax, parseCube, parseTwoComponentCube, parseXYZ, parseMolden } = window.VibeMolParsers || {};
  if (![arrayMinMax, parseCube, parseTwoComponentCube, parseXYZ, parseMolden].every(fn => typeof fn === 'function')) {
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

  const {
    copyCameraPose: copyCameraPoseUtil,
    computeOrthographicFrustum,
  } = window.VibeMolViewUtils || {};
  if (![copyCameraPoseUtil, computeOrthographicFrustum].every(fn => typeof fn === 'function')) {
    throw new Error('VibeMolViewUtils is not loaded. Ensure assets/app/js/view-utils.js is included before assets/app/js/app.js.');
  }

  const {
    computeMassPropertiesFromAtoms,
    computeInertiaTensorFromAtoms,
    eigenSymmetric3x3,
  } = window.VibeMolEditUtils || {};
  if (![computeMassPropertiesFromAtoms, computeInertiaTensorFromAtoms, eigenSymmetric3x3].every(fn => typeof fn === 'function')) {
    throw new Error('VibeMolEditUtils is not loaded. Ensure assets/app/js/edit-utils.js is included before assets/app/js/app.js.');
  }

  const { createAtomSnapshotCommand } = window.VibeMolEditCommands || {};
  if (![createAtomSnapshotCommand].every(fn => typeof fn === 'function')) {
    throw new Error('VibeMolEditCommands is not loaded. Ensure assets/app/js/edit-commands.js is included before assets/app/js/app.js.');
  }

  const { createEditStateController } = window.VibeMolEditState || {};
  if (![createEditStateController].every(fn => typeof fn === 'function')) {
    throw new Error('VibeMolEditState is not loaded. Ensure assets/app/js/edit-state.js is included before assets/app/js/app.js.');
  }

  const { detectInputFileKind } = window.VibeMolIOUtils || {};
  if (![detectInputFileKind].every(fn => typeof fn === 'function')) {
    throw new Error('VibeMolIOUtils is not loaded. Ensure assets/app/js/io-utils.js is included before assets/app/js/app.js.');
  }

  const {
    cloneJsonLike,
    cloneJsonStructuredData,
    isPlainObject,
    cloneStructuredData,
    normalizeEditAddBondOrder,
    allocateBuilderAtomId,
    allocateBuilderGroupId,
    allocateBuilderOpId,
    absorbObservedBuilderId,
    ensureAtomId,
    ensureVolumeAtomIds,
    getBuilderAnnotationsMap,
    normalizeVolumeAtom,
    resolveVolumeAtomId,
    getAtomBuilderMeta,
    setAtomBuilderMeta,
    migrateLegacyBuilderAnnotations,
    buildVolumeBondId,
    normalizeVolumeBondKind,
    normalizeVolumeBondRecord,
    ensureVolumeSchema: ensureVolumeSchemaCore,
    cloneBondSnapshot,
    bondSnapshotsEqual,
    findVolumeBondRecordIndex,
    upsertVolumeBond,
    removeVolumeBond,
    rehydrateClonedVolume: rehydrateClonedVolumeCore,
  } = window.VibeMolStructureCore || {};
  if (![
    cloneJsonLike,
    cloneJsonStructuredData,
    isPlainObject,
    cloneStructuredData,
    normalizeEditAddBondOrder,
    allocateBuilderAtomId,
    allocateBuilderGroupId,
    allocateBuilderOpId,
    absorbObservedBuilderId,
    ensureAtomId,
    ensureVolumeAtomIds,
    getBuilderAnnotationsMap,
    normalizeVolumeAtom,
    resolveVolumeAtomId,
    getAtomBuilderMeta,
    setAtomBuilderMeta,
    migrateLegacyBuilderAnnotations,
    buildVolumeBondId,
    normalizeVolumeBondKind,
    normalizeVolumeBondRecord,
    ensureVolumeSchemaCore,
    cloneBondSnapshot,
    bondSnapshotsEqual,
    findVolumeBondRecordIndex,
    upsertVolumeBond,
    removeVolumeBond,
    rehydrateClonedVolumeCore,
  ].every(fn => typeof fn === 'function')) {
    throw new Error('VibeMolStructureCore is not loaded. Ensure assets/app/js/structure.js is included before assets/app/js/app.js.');
  }

  const { createBondEditingController } = window.VibeMolBondEditing || {};
  if (![createBondEditingController].every(fn => typeof fn === 'function')) {
    throw new Error('VibeMolBondEditing is not loaded. Ensure assets/app/js/bond-editing.js is included before assets/app/js/app.js.');
  }

  const {
    positionAdaptiveMenu: positionAdaptiveMenuUi,
    updateAdaptiveMenuUi: updateAdaptiveMenuUiHelper,
    positionRightOperatorPanel: positionRightOperatorPanelUi,
    updateAddAtomOperatorPanelUi,
    updateAddMoleculeOperatorPanelUi,
    createAdaptivePopoverController,
    bindAdaptivePopoverItem,
  } = window.VibeMolEditUi || {};
  if (![
    positionAdaptiveMenuUi,
    updateAdaptiveMenuUiHelper,
    positionRightOperatorPanelUi,
    updateAddAtomOperatorPanelUi,
    updateAddMoleculeOperatorPanelUi,
    createAdaptivePopoverController,
    bindAdaptivePopoverItem,
  ].every(fn => typeof fn === 'function')) {
    throw new Error('VibeMolEditUi is not loaded. Ensure assets/app/js/edit-ui.js is included before assets/app/js/app.js.');
  }

  const { createEditPlacementController } = window.VibeMolEditPlacement || {};
  if (![createEditPlacementController].every(fn => typeof fn === 'function')) {
    throw new Error('VibeMolEditPlacement is not loaded. Ensure assets/app/js/edit-placement.js is included before assets/app/js/app.js.');
  }

  const { createEditToolsController } = window.VibeMolEditTools || {};
  if (![createEditToolsController].every(fn => typeof fn === 'function')) {
    throw new Error('VibeMolEditTools is not loaded. Ensure assets/app/js/edit-tools.js is included before assets/app/js/app.js.');
  }

  const { atomUnitsToAng, worldToAtomUnits, voxelToWorld, makeIsosurface } = window.VibeMolVolumeGeometry || {};
  if (![atomUnitsToAng, worldToAtomUnits, voxelToWorld, makeIsosurface].every(fn => typeof fn === 'function')) {
    throw new Error('VibeMolVolumeGeometry is not loaded. Ensure assets/app/js/volume-geometry.js is included before assets/app/js/app.js.');
  }

  const {
    getCovalentRadiusAngstrom,
    isLanthanideOrActinideAtomicNumber,
    isMonovalentMainGroupAtomicNumber,
    getAllowedMainGroupValences,
    chooseTargetValence,
    getPairMaxBondOrder,
    collectBondCandidates,
    inferBondOrders,
    buildBondAdjacency,
    getUndirectedPairKey,
    findSimpleCyclesOfSize,
    enforceAlternatingSixRingBondOrders,
    inferAromaticSixRings,
    isTransitionMetalAtomicNumber,
  } = window.VibeMolBondInference || {};
  if (![
    getCovalentRadiusAngstrom,
    isLanthanideOrActinideAtomicNumber,
    isMonovalentMainGroupAtomicNumber,
    getAllowedMainGroupValences,
    chooseTargetValence,
    getPairMaxBondOrder,
    collectBondCandidates,
    inferBondOrders,
    buildBondAdjacency,
    getUndirectedPairKey,
    findSimpleCyclesOfSize,
    enforceAlternatingSixRingBondOrders,
    inferAromaticSixRings,
    isTransitionMetalAtomicNumber,
  ].every(fn => typeof fn === 'function')) {
    throw new Error('VibeMolBondInference is not loaded. Ensure assets/app/js/bond-inference.js is included before assets/app/js/app.js.');
  }

  const { createAutoIsoController } = window.VibeMolAutoIso || {};
  if (![createAutoIsoController].every(fn => typeof fn === 'function')) {
    throw new Error('VibeMolAutoIso is not loaded. Ensure assets/app/js/autoiso.js is included before assets/app/js/app.js.');
  }

  const { hsvToRgb, make2CPhaseIsosurface, make2CTotalColoredIsosurface } = window.VibeMolVolume2C || {};
  if (![hsvToRgb, make2CPhaseIsosurface, make2CTotalColoredIsosurface].every(fn => typeof fn === 'function')) {
    throw new Error('VibeMolVolume2C is not loaded. Ensure assets/app/js/volume-2c.js is included before assets/app/js/app.js.');
  }

  const {
    FRAGMENT_LIBRARY,
    getCatalogEntries,
    resolveCatalogQuery,
    getCatalogEntryById,
    buildCatalogInstance,
    resolveFragmentQuery,
    getFragmentById,
    buildFragmentInstance,
    loadFragmentLibraryFromManifest,
  } = window.VibeMolFragments || {};
  if (
    !Array.isArray(FRAGMENT_LIBRARY)
    || ![
      getCatalogEntries,
      resolveCatalogQuery,
      getCatalogEntryById,
      buildCatalogInstance,
      resolveFragmentQuery,
      getFragmentById,
      buildFragmentInstance,
    ].every(fn => typeof fn === 'function')
  ) {
    throw new Error('VibeMolFragments is not loaded. Ensure assets/app/js/fragments.js is included before assets/app/js/app.js.');
  }

  // (subsample removed)

  // Coordinate conversions between stored atom units and world Å
  const ANG_TO_BOHR = 1.0 / BOHR_TO_ANG;
  // --- Two‑component phase‑hued isosurface (Alpha/Beta) ---
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
    ctx.lineWidth = Math.max(2, Math.round(2 * dpr)); ctx.strokeStyle = UI_PALETTE.phaseWheelStrokeDark; ctx.stroke();
    ctx.lineWidth = Math.max(1, Math.round(1 * dpr)); ctx.strokeStyle = UI_PALETTE.phaseWheelStrokeLight; ctx.stroke();

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
      ctx.lineWidth = Math.max(2, Math.round(2 * dpr)); ctx.strokeStyle = UI_PALETTE.phaseWheelStrokeDark; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.lineWidth = Math.max(1, Math.round(1 * dpr)); ctx.strokeStyle = UI_PALETTE.phaseWheelStrokeLight; ctx.stroke();

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
      ctx.lineWidth = Math.max(3, Math.round(3 * dpr)); ctx.strokeStyle = UI_PALETTE.phaseWheelStrokeDark; ctx.strokeText(t.label, tx, ty);
      ctx.fillStyle = UI_PALETTE.phaseWheelStrokeLight; ctx.fillText(t.label, tx, ty);
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
    ctx.lineWidth = Math.max(3, Math.round(3 * dpr)); ctx.strokeStyle = UI_PALETTE.phaseWheelStrokeDark; ctx.strokeText(label, cx, ly);
    ctx.fillStyle = UI_PALETTE.phaseWheelStrokeLight; ctx.fillText(label, cx, ly);
  }

  // --- Three.js scene setup ---
  const canvas = document.getElementById('canvas');
  const canvasEl = canvas;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.autoClear = false; // allow overlay rendering in same canvas
  const rendererDrawBufferSize = new THREE.Vector2();
  const currentViewportMetrics = {
    cssWidth: 1,
    cssHeight: 1,
    bufferWidth: 1,
    bufferHeight: 1,
    dpr: 1,
  };
  let adaptivePopoverController = null;

  /**
   * Read one CSS viewport size from the active drop region.
   * @returns {{width:number,height:number}}
   */
  function readViewportCssSize() {
    const rect = dropViewportEl && typeof dropViewportEl.getBoundingClientRect === 'function'
      ? dropViewportEl.getBoundingClientRect()
      : null;
    return {
      width: Math.max(1, Math.round(rect ? rect.width : window.innerWidth)),
      height: Math.max(1, Math.round(rect ? rect.height : window.innerHeight)),
    };
  }

  /**
   * Read the current viewport metrics in CSS pixels and buffer pixels.
   * @returns {{cssWidth:number,cssHeight:number,bufferWidth:number,bufferHeight:number,dpr:number}}
   */
  function readRendererViewportMetrics() {
    renderer.getDrawingBufferSize(rendererDrawBufferSize);
    return {
      cssWidth: Math.max(1, Math.round(currentViewportMetrics.cssWidth || 1)),
      cssHeight: Math.max(1, Math.round(currentViewportMetrics.cssHeight || 1)),
      bufferWidth: Math.max(1, Math.round(rendererDrawBufferSize.x || 1)),
      bufferHeight: Math.max(1, Math.round(rendererDrawBufferSize.y || 1)),
      dpr: Math.max(1, Number(currentViewportMetrics.dpr) || 1),
    };
  }

  /**
   * Apply one CSS-space viewport to the renderer backing store.
   * @param {{cssWidth:number,cssHeight:number,dpr:number}} metrics
   */
  function resizeRendererToViewport(metrics) {
    const cssWidth = Math.max(1, Math.round(metrics && metrics.cssWidth));
    const cssHeight = Math.max(1, Math.round(metrics && metrics.cssHeight));
    const dpr = Math.max(1, Number(metrics && metrics.dpr) || 1);
    renderer.setPixelRatio(1);
    renderer.setSize(
      Math.max(1, Math.round(cssWidth * dpr)),
      Math.max(1, Math.round(cssHeight * dpr)),
      false
    );
    if (canvas) {
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    }
    currentViewportMetrics.cssWidth = cssWidth;
    currentViewportMetrics.cssHeight = cssHeight;
    currentViewportMetrics.dpr = dpr;
    const next = readRendererViewportMetrics();
    currentViewportMetrics.bufferWidth = next.bufferWidth;
    currentViewportMetrics.bufferHeight = next.bufferHeight;
  }

  /**
   * Convert one CSS-space rectangle to buffer-space viewport/scissor coordinates.
   * @param {{cssWidth:number,cssHeight:number,bufferWidth:number,bufferHeight:number}} metrics
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   * @returns {{x:number,y:number,width:number,height:number}}
   */
  function cssRectToBufferRect(metrics, x, y, width, height) {
    const cssWidth = Math.max(1, Number(metrics && metrics.cssWidth) || 1);
    const cssHeight = Math.max(1, Number(metrics && metrics.cssHeight) || 1);
    const bufferWidth = Math.max(1, Number(metrics && metrics.bufferWidth) || 1);
    const bufferHeight = Math.max(1, Number(metrics && metrics.bufferHeight) || 1);
    const scaleX = bufferWidth / cssWidth;
    const scaleY = bufferHeight / cssHeight;
    return {
      x: Math.round((Number(x) || 0) * scaleX),
      y: Math.round((Number(y) || 0) * scaleY),
      width: Math.max(1, Math.round((Number(width) || 0) * scaleX)),
      height: Math.max(1, Math.round((Number(height) || 0) * scaleY)),
    };
  }
  const scene = new THREE.Scene();
  // Default to white background
  scene.background = new THREE.Color(0xffffff);
  const DEFAULT_PERSPECTIVE_FOV = 45;
  const perspectiveCamera = new THREE.PerspectiveCamera(DEFAULT_PERSPECTIVE_FOV, 2, 0.1, 1e6);
  const DEFAULT_VIEW_UP = new THREE.Vector3(0, 0, 1);
  perspectiveCamera.position.set(6, 6, 6);
  perspectiveCamera.up.copy(DEFAULT_VIEW_UP);
  const orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1e6);
  orthographicCamera.position.copy(perspectiveCamera.position);
  orthographicCamera.quaternion.copy(perspectiveCamera.quaternion);
  orthographicCamera.up.copy(perspectiveCamera.up);
  // Centralized camera/view state (mode + active camera + remembered default view pose).
  const viewState = {
    mode: 'perspective',
    camera: perspectiveCamera,
    perspectiveCamera,
    orthographicCamera,
    defaultView: null,
  };
  let camera = viewState.camera;
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.update();
  controls.enableDamping = true;
  // Rotation is handled below with quaternion orbiting to avoid pole locking.
  controls.enableRotate = false;
  // Default rotate speed
  controls.rotateSpeed = 1.5;

  /**
   * Update the active camera projection parameters for one viewport size.
   * Width/height are CSS viewport dimensions, not drawing-buffer dimensions.
   * @param {number} width
   * @param {number} height
   */
  function updateActiveCameraProjection(width, height) {
    const w = Math.max(1, Number(width) || 1);
    const h = Math.max(1, Number(height) || 1);
    const aspect = w / h;
    if (viewState.mode === 'orthographic') {
      const dist = Math.max(0.01, orthographicCamera.position.distanceTo(controls.target));
      const frustum = computeOrthographicFrustum(aspect, dist, perspectiveCamera.fov || DEFAULT_PERSPECTIVE_FOV);
      orthographicCamera.left = frustum.left;
      orthographicCamera.right = frustum.right;
      orthographicCamera.top = frustum.top;
      orthographicCamera.bottom = frustum.bottom;
      orthographicCamera.near = Math.max(0.01, dist / 100);
      orthographicCamera.far = Math.max(orthographicCamera.near + 10, dist * 20 + Math.abs(frustum.top) * 10);
      orthographicCamera.updateProjectionMatrix();
      return;
    }
    perspectiveCamera.aspect = aspect;
    perspectiveCamera.updateProjectionMatrix();
  }

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x081018, 2.0);
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(1, 1, 1);
  const amb = new THREE.AmbientLight(0x999999, 0.65);
  const rim = new THREE.DirectionalLight(0x9fb8ff, 0.0);
  rim.position.set(-1.4, 1.0, -0.8);
  scene.add(hemi, dir, amb, rim);

  /**
   * Build the lightweight XY-plane edit grid shown only in edit mode.
   * @returns {THREE.GridHelper}
   */
  function buildEditGridHelper() {
    const helper = new THREE.GridHelper(48, 48, 0x92a0b4, 0xc3ccd8);
    helper.rotation.x = -Math.PI / 2;
    helper.position.set(0, 0, 0);
    helper.renderOrder = -20;
    const materials = Array.isArray(helper.material) ? helper.material : [helper.material];
    for (const material of materials) {
      if (!material) continue;
      material.transparent = true;
      material.opacity = 0.5;
      material.depthWrite = false;
      material.toneMapped = false;
    }
    helper.visible = false;
    return helper;
  }

  const editGridHelper = buildEditGridHelper();
  scene.add(editGridHelper);

  /**
   * Compute the current Add > Atom placement plane.
   * This is the single source of truth for add-ray intersections.
   * @returns {{plane:THREE.Plane,normal:THREE.Vector3,point:THREE.Vector3}|null}
   */
  function getCurrentAddAtomPlacementPlaneState() {
    const planeNormal = new THREE.Vector3();
    camera.getWorldDirection(planeNormal);
    if (planeNormal.lengthSq() < 1e-10) planeNormal.set(0, 0, -1);
    planeNormal.normalize();

    const planePoint = (addGrowActive && addGrowAnchorPos)
      ? addGrowAnchorPos.clone()
      : new THREE.Vector3(0, 0, 0);
    return {
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planePoint),
      normal: planeNormal,
      point: planePoint,
    };
  }

  /**
   * Synchronize edit-mode construction helpers with the active tool and camera.
   */
  function updateEditPlaneHelpers() {
    if (!editGridHelper) return;
    editGridHelper.visible = (currentMode === MODES.EDIT);
  }

  // Resizer
  const dropViewportEl = document.getElementById('drop');
  /**
   * Resize the renderer and camera to match the active viewport area.
   * Uses the drop container bounds so sidebar layout changes keep correct aspect.
   */
  function resize() {
    const cssSize = readViewportCssSize();
    resizeRendererToViewport({
      cssWidth: cssSize.width,
      cssHeight: cssSize.height,
      dpr: Math.min(2, window.devicePixelRatio || 1),
    });
    updateActiveCameraProjection(currentViewportMetrics.cssWidth, currentViewportMetrics.cssHeight);
    const vibrationPanelEl = document.getElementById('vibrationPanel');
    if (vibrationPanelEl && vibrationPanelEl.classList.contains('open')) {
      scheduleVibrationPanelLayoutSync(1);
    }
    positionEditAdaptiveMenu();
    if (adaptivePopoverController) adaptivePopoverController.positionVisible();
    const addAtomOperatorPanelEl = document.getElementById('editAddAtomOperatorPanel');
    if (addAtomOperatorPanelEl && addAtomOperatorPanelEl.getAttribute('aria-hidden') === 'false') {
      positionAddAtomOperatorPanel();
    }
    const addMoleculeOperatorPanelEl = document.getElementById('editAddMoleculeOperatorPanel');
    if (addMoleculeOperatorPanelEl && addMoleculeOperatorPanelEl.getAttribute('aria-hidden') === 'false') {
      positionAddMoleculeOperatorPanel();
    }
    const currentBondOrderPopupEl = document.getElementById('bondOrderPopup');
    if (currentBondOrderPopupEl && currentBondOrderPopupEl.getAttribute('aria-hidden') === 'false') {
      if (bondEditing) bondEditing.positionPopup();
    }
  }
  window.addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined' && dropViewportEl) {
    const dropResizeObserver = new ResizeObserver(() => resize());
    dropResizeObserver.observe(dropViewportEl);
  }
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

  const dofPostScene = new THREE.Scene();
  const dofPostCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let dofRenderTarget = null;
  const dofUniforms = {
    tColor: { value: null },
    tDepth: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    focusDistance: { value: 8.0 },
    focusRange: { value: 1.5 },
    blurAmount: { value: 4.0 },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000.0 },
    isPerspective: { value: 1.0 },
  };
  /**
   * Create the fullscreen depth-of-field postprocess material.
   * @param {Record<string, {value:any}>} uniforms
   * @returns {THREE.ShaderMaterial}
   */
  function createDofPostMaterial(uniforms) {
    return new THREE.ShaderMaterial({
      uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform vec2 resolution;
        uniform float focusDistance;
        uniform float focusRange;
        uniform float blurAmount;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform float isPerspective;
        varying vec2 vUv;

        float linearizeDepth(float depth) {
          if (isPerspective < 0.5) {
            return mix(cameraNear, cameraFar, depth);
          }
          float z = depth * 2.0 - 1.0;
          return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
        }

        vec4 sampleColor(vec2 uv) {
          return texture2D(tColor, clamp(uv, vec2(0.0), vec2(1.0)));
        }

        void main() {
          vec4 base = sampleColor(vUv);
          float depth = texture2D(tDepth, vUv).r;
          float linearDepth = linearizeDepth(depth);
          float range = max(0.001, focusRange);
          float blurFactor = clamp(abs(linearDepth - focusDistance) / range, 0.0, 1.0);
          float radius = blurAmount * blurFactor;
          vec4 outColor = base;
          if (radius >= 0.01) {
            vec2 texel = 1.0 / max(resolution, vec2(1.0));
            vec2 offsets[12];
            offsets[0] = vec2( 1.0,  0.0);
            offsets[1] = vec2(-1.0,  0.0);
            offsets[2] = vec2( 0.0,  1.0);
            offsets[3] = vec2( 0.0, -1.0);
            offsets[4] = vec2( 0.7071,  0.7071);
            offsets[5] = vec2(-0.7071,  0.7071);
            offsets[6] = vec2( 0.7071, -0.7071);
            offsets[7] = vec2(-0.7071, -0.7071);
            offsets[8] = vec2( 1.6,  0.0);
            offsets[9] = vec2(-1.6,  0.0);
            offsets[10] = vec2( 0.0,  1.6);
            offsets[11] = vec2( 0.0, -1.6);
            vec4 accum = base * 0.18;
            float weight = 0.18;
            for (int i = 0; i < 12; ++i) {
              float tapWeight = (i < 8) ? 0.08 : 0.045;
              accum += sampleColor(vUv + offsets[i] * texel * radius) * tapWeight;
              weight += tapWeight;
            }
            outColor = accum / weight;
          }
          gl_FragColor = outColor;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
  }
  const dofPostMaterial = createDofPostMaterial(dofUniforms);
  const dofPostQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), dofPostMaterial);
  dofPostScene.add(dofPostQuad);

  // State
  let volumes = []; // {name, vol}
  let currentIndex = -1;
  let meshes = []; // active meshes (pos/neg)
  let hoverSurfaceMesh = null;
  let atomGroup = new THREE.Group();
  let bondGroup = new THREE.Group();
  let cloudGroup = new THREE.Group();
  let boxHelper = null;
  // Coordinate table/export display units in the Coordinates window.
  let coordsDisplayUnits = 'angstrom';
  let coordsHoveredAtomIndex = -1;
  let coordsInlineEditState = null;
  let showSurfaces = true; // toggle iso-surface visibility
  let renderMode = 'surface';
  let cloudType = 'cubes';
  // Autoiso mode applies one cached 85%-density isovalue per orbital/component.
  let autoIsoEnabled = false;
  // Display inferred multiple bonds (double/triple/quadruple) as parallel connectors.
  let showMultiBonds = true;
  // Display element symbols over atoms.
  let showAtomLabels = false;
  // Append per-atom index as subscript on atom labels.
  let showAtomLabelNumbers = false;
  // Display-mode left-drag orbit state. We keep OrbitControls for pan/zoom,
  // but rotate the camera manually with quaternions to remove spherical stalls.
  let viewRotateActive = false;
  let viewRotatePointerId = null;
  let viewRotateLastClientX = 0;
  let viewRotateLastClientY = 0;
  // Atom label shell meshes that should rotate to keep text visible to camera.
  const atomLabelTrackTargets = [];
  let atomLabelCapGeometry = null;
  // Per-element color overrides (z -> "#rrggbb"), used when element colors are enabled.
  const elementColorOverrides = new Map();
  // Remember surface visibility when entering a work mode (edit/measure) to restore on exit to display
  let __savedShowSurfaces = null;
  // Current iso-surface material style
  let surfaceStyle = 'emissive';
  // Current atom/bond material style
  let moleculeStyle = 'default';
  // Independent molecule appearance features.
  let moleculeFogEnabled = false;
  let moleculeFogDepth = 14.0;
  let moleculeBlackbodyEnabled = false;
  let moleculeBlackbodyColdColor = '#2f0202';
  let moleculeBlackbodyHotColor = '#eaf6ff';
  let moleculeInkEnabled = false;
  let moleculeAtomOpacity = 1.0;
  let moleculeBondOpacity = 1.0;
  const dofState = {
    enabled: false,
    focusMode: 'auto',
    focusDistance: 8.0,
    focusRange: 1.5,
    blurAmount: 4.0,
  };

  /**
   * Clamp the depth-of-field focus mode.
   * @returns {'auto'|'manual'}
   */
  function getDofFocusMode() {
    return dofState.focusMode === 'manual' ? 'manual' : 'auto';
  }

  /**
   * Clamp the manual depth-of-field focus distance.
   * @returns {number}
   */
  function getDofFocusDistance() {
    return Math.max(0.5, Math.min(80, Number.isFinite(dofState.focusDistance) ? dofState.focusDistance : 8.0));
  }

  /**
   * Clamp the depth-of-field in-focus range.
   * @returns {number}
   */
  function getDofFocusRange() {
    return Math.max(0.1, Math.min(20, Number.isFinite(dofState.focusRange) ? dofState.focusRange : 1.5));
  }

  /**
   * Clamp the maximum depth-of-field blur radius.
   * @returns {number}
   */
  function getDofBlurAmount() {
    return Math.max(0, Math.min(12, Number.isFinite(dofState.blurAmount) ? dofState.blurAmount : 4.0));
  }

  /**
   * Compute the active focus distance for the current camera.
   * @returns {number}
   */
  function getActiveDofFocusDistance() {
    if (getDofFocusMode() === 'manual') return getDofFocusDistance();
    const target = controls && controls.target ? controls.target : new THREE.Vector3();
    return Math.max(camera.near || 0.1, camera.position.distanceTo(target));
  }

  /**
   * Check whether DOF should run for the current frame.
   * @returns {boolean}
   */
  function isDepthOfFieldActive() {
    return !!dofState.enabled && getDofBlurAmount() > 0.001;
  }

  /**
   * Dispose the current DOF render target.
   */
  function disposeDofRenderTarget() {
    if (!dofRenderTarget) return;
    try { if (dofRenderTarget.depthTexture) dofRenderTarget.depthTexture.dispose(); } catch { }
    try { dofRenderTarget.dispose(); } catch { }
    dofRenderTarget = null;
  }

  /**
   * Dispose all DOF postprocess resources.
   */
  function disposeDofPostprocessResources() {
    disposeDofRenderTarget();
    try {
      if (dofPostQuad.geometry && dofPostQuad.geometry.dispose) dofPostQuad.geometry.dispose();
    } catch { }
    try {
      if (dofPostMaterial && dofPostMaterial.dispose) dofPostMaterial.dispose();
    } catch { }
  }

  /**
   * Ensure one DOF render target exists for the current viewport size.
   * @param {{bufferWidth:number,bufferHeight:number}} metrics
   * @returns {THREE.WebGLRenderTarget}
   */
  function ensureDofRenderTarget(metrics) {
    const width = Math.max(1, Number(metrics && metrics.bufferWidth) || 1);
    const height = Math.max(1, Number(metrics && metrics.bufferHeight) || 1);
    if (!dofRenderTarget || dofRenderTarget.width !== width || dofRenderTarget.height !== height) {
      disposeDofRenderTarget();
      const target = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        depthBuffer: true,
        stencilBuffer: false,
      });
      target.texture.generateMipmaps = false;
      target.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
      target.depthTexture.minFilter = THREE.NearestFilter;
      target.depthTexture.magFilter = THREE.NearestFilter;
      dofRenderTarget = target;
    }
    return dofRenderTarget;
  }

  /**
   * Update shader uniforms for the current depth-of-field pass.
   * @param {{bufferWidth:number,bufferHeight:number}} metrics
   * @param {THREE.WebGLRenderTarget} target
   */
  function updateDofUniformState(metrics, target) {
    dofUniforms.tColor.value = target.texture;
    dofUniforms.tDepth.value = target.depthTexture || null;
    dofUniforms.resolution.value.set(
      Math.max(1, Number(metrics && metrics.bufferWidth) || 1),
      Math.max(1, Number(metrics && metrics.bufferHeight) || 1)
    );
    dofUniforms.focusDistance.value = getActiveDofFocusDistance();
    dofUniforms.focusRange.value = getDofFocusRange();
    dofUniforms.blurAmount.value = getDofBlurAmount();
    dofUniforms.cameraNear.value = Math.max(0.001, camera.near || 0.1);
    dofUniforms.cameraFar.value = Math.max(dofUniforms.cameraNear.value + 1, camera.far || 1000.0);
    dofUniforms.isPerspective.value = viewState.mode === 'orthographic' ? 0.0 : 1.0;
  }

  /**
   * Composite the current DOF render target onto the main canvas.
   * @param {{bufferWidth:number,bufferHeight:number}} metrics
   * @param {THREE.WebGLRenderTarget} target
   */
  function renderDepthOfFieldComposite(metrics, target) {
    updateDofUniformState(metrics, target);
    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, metrics.bufferWidth, metrics.bufferHeight);
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.render(dofPostScene, dofPostCamera);
  }

  /**
   * Prepare the postprocess target for this frame.
   * @param {{bufferWidth:number,bufferHeight:number}} metrics
   * @returns {THREE.WebGLRenderTarget|null}
   */
  function beginPostprocessFrame(metrics) {
    if (!isDepthOfFieldActive()) {
      renderer.setRenderTarget(null);
      return null;
    }
    try {
      const target = ensureDofRenderTarget(metrics);
      renderer.setRenderTarget(target);
      return target;
    } catch (err) {
      console.warn('[DOF] Postprocess disabled:', err);
      dofState.enabled = false;
      syncDofControlState();
      disposeDofRenderTarget();
      renderer.setRenderTarget(null);
      return null;
    }
  }

  /**
   * Render the main scene into the currently bound render target.
   * @param {{bufferWidth:number,bufferHeight:number}} metrics
   */
  function renderSceneFrame(metrics) {
    let didSplit = false;
    try {
      didSplit = renderAlphaBetaSplitPass(metrics);
    } catch { }
    if (!didSplit) renderMainScenePass(metrics);
  }

  /**
   * Finish the postprocess frame and restore the default framebuffer.
   * @param {{bufferWidth:number,bufferHeight:number}} metrics
   * @param {THREE.WebGLRenderTarget|null} target
   */
  function endPostprocessFrame(metrics, target) {
    if (target) {
      renderDepthOfFieldComposite(metrics, target);
      return;
    }
    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
  }
  const MOLECULE_STYLE_KEYS = Object.freeze([
    'default',
    'toon',
    'kit',
    'glossy',
  ]);
  const MOLECULE_STYLE_ALIASES = Object.freeze({
    fancy: 'toon',
    studio: 'kit',
  });
  const MOLECULE_STYLE_SET = new Set(MOLECULE_STYLE_KEYS);
  const MOLECULE_STYLE_PROFILE = Object.freeze({
    default: Object.freeze({
      key: 'default',
      atomScaleMain: 1.2,
      atomScaleTransitionMetal: 1.2,
      sphereWidthSegments: 28,
      sphereHeightSegments: 18,
      bondRadius: 0.099,
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
      stylizedMolecule: false,
      aromaticDashColor: 0x2f4a74,
      aromaticDashOpacity: 0.94,
      lighting: Object.freeze({
        hemiColor: 0xf4f9ff,
        hemiGroundColor: 0x1e2a3c,
        hemiIntensity: 1.22,
        dirColor: 0xffffff,
        dirIntensity: 2.6,
        dirPos: Object.freeze([1.45, 1.32, 1.24]),
        ambColor: 0xa7b4c9,
        ambIntensity: 0.22,
        rimColor: 0x8db5ff,
        rimIntensity: 1.3,
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
    hideSurfaceHoverLabel();
    setSurfaceHover(null);
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
    const profile = getMoleculeStyleProfile();
    const lighting = profile.lighting;
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

    let bg = null;
    if (bgColor && bgColor.value) {
      try { bg = new THREE.Color(bgColor.value); } catch { bg = null; }
    }
    if (moleculeInkEnabled) {
      bg = new THREE.Color(0xffffff);
      hemi.groundColor.setHex(0xf5f5f5);
      rim.intensity = Math.min(rim.intensity, 0.35);
    }
    if (bg) scene.background = bg;

    if (moleculeFogEnabled) {
      const fogColor = bg ? bg.clone() : new THREE.Color(0xdbe5f1);
      const fogFar = getMoleculeFogDepth();
      const fogNear = Math.max(0.5, fogFar * 0.23);
      scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
    } else {
      scene.fog = null;
    }
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
   * Get centered lateral offset coefficients for drawing multiple bond components.
   * Coefficients are expressed in the local (u, v) frame orthogonal to the bond axis.
   * For order=3, components are arranged at 120 degrees around the bond axis.
   * For order=4, components are arranged in a square around the bond axis.
   * @param {number} order
   * @returns {Array<[number, number]>}
   */
  function getBondComponentOffsets(order) {
    if (order >= 4) {
      const q = Math.SQRT1_2; // 45° square points (unit radius)
      return [[q, q], [-q, q], [-q, -q], [q, -q]];
    }
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
   * Infer the lateral offset direction for multi-component bonds from
   * neighboring bonded atoms, so multi-bond components roughly follow the
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
   * Convert RGB tuple ([0..255]) to lowercase hex string.
   * @param {number[]} rgb
   * @returns {string}
   */
  function rgbTupleToHex(rgb) {
    if (!Array.isArray(rgb) || rgb.length < 3) return UI_PALETTE.white;
    const toHex = (n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
    return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
  }

  /**
   * Normalize a CSS hex color string.
   * @param {*} value
   * @param {string} fallback
   * @returns {string}
   */
  function normalizeHexColor(value, fallback = UI_PALETTE.white) {
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
    return UI_PALETTE.white;
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
   * Clamp a style scalar to [0, 1].
   * @param {*} value
   * @returns {number}
   */
  function clampStyleScalar(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  /**
   * Clamp the fog far-distance control (near plane is derived from this value).
   * @returns {number}
   */
  function getMoleculeFogDepth() {
    const n = Number(moleculeFogDepth);
    if (!Number.isFinite(n)) return 14.0;
    return Math.max(6.0, Math.min(40.0, n));
  }

  /**
   * Approximate blackbody-like color ramp for scalar-driven styling.
   * 0.0 -> deep red, 1.0 -> white/blue-hot.
   * @param {number} scalar
   * @returns {THREE.Color}
   */
  function blackbodyColorFromScalar(scalar) {
    const t = clampStyleScalar(scalar);
    const cold = new THREE.Color(moleculeBlackbodyColdColor || '#2f0202');
    const hot = new THREE.Color(moleculeBlackbodyHotColor || '#eaf6ff');
    const shaped = Math.pow(t, 0.82);
    return cold.lerp(hot, shaped);
  }

  /**
   * Resolve the display color for an element under the active molecule style.
   * @param {number} z
   * @returns {THREE.Color}
   */
  function getAtomRenderColor(z, context = null) {
    const styleKey = getMoleculeStyleProfile().key;
    const useElementColors = isElementColoringEnabled();
    const hasColorOverride = elementColorOverrides.has(z | 0);
    const styleScalar = clampStyleScalar(context && context.scalar);
    let atomColor = getElementBaseColor(z);

    if (moleculeBlackbodyEnabled) {
      return blackbodyColorFromScalar(styleScalar);
    }
    if (moleculeInkEnabled) {
      if (!useElementColors) return new THREE.Color(0xf3f3f3);
      return atomColor.clone().lerp(new THREE.Color(0xffffff), 0.84);
    }

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
      if (!useElementColors) {
        if (isTransitionMetalAtomicNumber(z)) return new THREE.Color(0xf1c970);
        if (z === 1) return new THREE.Color(0xe5f2ff);
        return new THREE.Color(0xbfd8ff);
      }
      if (!hasColorOverride && isTransitionMetalAtomicNumber(z)) return new THREE.Color(0xf1c970);
      // Preserve element hue while shifting toward a glassy pastel tint.
      const c = atomColor.clone();
      const hsl = { h: 0, s: 0, l: 0 };
      c.getHSL(hsl);
      c.setHSL(
        hsl.h,
        Math.min(1, hsl.s * 0.84 + 0.08),
        Math.min(1, hsl.l * 0.88 + 0.08)
      );
      return c;
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
  function getBondRenderColor(atomColor, z, context = null) {
    const styleKey = getMoleculeStyleProfile().key;
    const hasColorOverride = elementColorOverrides.has(z | 0);
    const styleScalar = clampStyleScalar(context && context.scalar);

    if (moleculeBlackbodyEnabled) {
      return blackbodyColorFromScalar(styleScalar).lerp(new THREE.Color(0xffffff), 0.08);
    }
    if (moleculeInkEnabled) {
      return atomColor.clone().lerp(new THREE.Color(0xffffff), 0.72);
    }

    if (styleKey === 'kit') {
      if (!hasColorOverride && isTransitionMetalAtomicNumber(z)) return new THREE.Color(0xd3ba8e);
      if (hasColorOverride) return atomColor.clone().lerp(new THREE.Color(0xffffff), 0.32);
      return new THREE.Color(0xe2e7ee);
    }
    if (styleKey === 'glossy') {
      // In glossy mode, bond endpoint colors must exactly match atom colors.
      return atomColor.clone();
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
   * Get the rendered atom display radius for the current molecule style.
   * This matches the real atom render path (sphere radius 0.5 scaled by
   * covalent radius and style factor).
   * @param {number} z
   * @returns {number}
   */
  function getRenderedAtomDisplayRadius(z) {
    return 0.5 * getCovalentRadiusAngstrom(z) * getAtomRenderScaleFactor(z);
  }

  /**
   * Get the preview bond radius for the active molecule style.
   * @returns {number}
   */
  function getPreviewBondRadius() {
    const profile = getMoleculeStyleProfile();
    return profile.key === 'glossy' ? getGlossyBondCenterRadius() : profile.bondRadius;
  }

  /**
   * Compute one preview bond placement trimmed to sit just inside the rendered
   * atom spheres instead of running center-to-center.
   * @param {THREE.Vector3} aPos
   * @param {THREE.Vector3} bPos
   * @param {number} aZ
   * @param {number} bZ
   * @param {{bondRadius?:number,surfaceInset?:number,minGeomLen?:number}} [options]
   * @returns {{valid:boolean,len:number,dirNorm:THREE.Vector3,geomLen:number,mid:THREE.Vector3,aEnd:THREE.Vector3,bEnd:THREE.Vector3,trimA:number,trimB:number,bondRadius:number}}
   */
  function getPreviewBondSegmentPlacement(aPos, bPos, aZ, bZ, options = {}) {
    const bondRadius = Math.max(
      1e-4,
      Number.isFinite(options.bondRadius) ? Number(options.bondRadius) : getPreviewBondRadius()
    );
    const surfaceInset = Number.isFinite(options.surfaceInset) ? Number(options.surfaceInset) : 0.01;
    const minGeomLen = Math.max(0.0, Number.isFinite(options.minGeomLen) ? Number(options.minGeomLen) : 0.03);
    let trimA = Math.max(0, getSphereSectionAxisDistance(getRenderedAtomDisplayRadius(aZ | 0), bondRadius) - surfaceInset);
    let trimB = Math.max(0, getSphereSectionAxisDistance(getRenderedAtomDisplayRadius(bZ | 0), bondRadius) - surfaceInset);
    const rawLen = aPos.distanceTo(bPos);
    const maxTrim = Math.max(0, rawLen - minGeomLen);
    const trimSum = trimA + trimB;
    if (trimSum > maxTrim && trimSum > 1e-8) {
      const s = maxTrim / trimSum;
      trimA *= s;
      trimB *= s;
    }
    const placement = computeBondSegmentPlacement(aPos, bPos, trimA, trimB, minGeomLen);
    return {
      ...placement,
      trimA,
      trimB,
      bondRadius,
    };
  }

  /**
   * Create the unified solid glossy material used by both atoms and bonds.
   * Bond meshes pass `vertexColors: true` so gradients still render.
   * @param {{color?:THREE.Color|number|string, vertexColors?:boolean}} [options]
   * @returns {THREE.MeshPhysicalMaterial}
   */
  function createGlossySolidMaterial(options = {}) {
    const {
      color = 0xffffff,
      vertexColors = false,
    } = options;
    return new THREE.MeshPhysicalMaterial({
      color,
      vertexColors: !!vertexColors,
      roughness: 0.045,
      metalness: 0.03,
      clearcoat: 1.0,
      clearcoatRoughness: 0.015,
      reflectivity: 0.85,
      transparent: false,
      opacity: 1.0,
      transmission: 0.0,
      depthWrite: true,
    });
  }

  /**
   * Apply one global opacity control to a material.
   * @param {THREE.Material} material
   * @param {number} opacity
   * @returns {THREE.Material}
   */
  function applyGlobalMaterialOpacity(material, opacity) {
    if (!material || typeof material !== 'object') return material;
    const alpha = Math.max(0.05, Math.min(1, Number.isFinite(opacity) ? opacity : 1));
    if ('opacity' in material) material.opacity = alpha;
    if ('transparent' in material) material.transparent = alpha < 0.999 || !!material.transparent;
    if ('depthWrite' in material) material.depthWrite = alpha >= 0.999;
    material.needsUpdate = true;
    return material;
  }

  /**
   * Create an atom material that matches the active molecule style.
   * @param {THREE.Color} color
   * @param {number} z
   * @returns {THREE.Material}
   */
  function createAtomMaterial(color, z) {
    const styleKey = getMoleculeStyleProfile().key;
    let mat = null;
    if (styleKey === 'kit') {
      const isTransitionMetal = isTransitionMetalAtomicNumber(z);
      mat = new THREE.MeshPhongMaterial({
        color,
        specular: isTransitionMetal ? 0xffe7b8 : 0xffffff,
        shininess: isTransitionMetal ? 175 : 145,
        emissive: isTransitionMetal
          ? new THREE.Color(0x2b2213)
          : color.clone().multiplyScalar(z === 6 ? 0.012 : 0.02),
        emissiveIntensity: isTransitionMetal ? 0.18 : 0.06,
      });
    } else if (styleKey === 'glossy') {
      const shellColor = color.clone();
      mat = createGlossySolidMaterial({ color: shellColor, vertexColors: false });
    } else if (styleKey === 'toon') {
      const isTransitionMetal = isTransitionMetalAtomicNumber(z);
      const emissiveBoost = isTransitionMetal ? 0.42 : 0.26;
      const emissiveTint = isTransitionMetal ? new THREE.Color(0xffe2a3) : new THREE.Color(0xffffff);
      const emissive = color.clone().multiplyScalar(emissiveBoost).lerp(emissiveTint, isTransitionMetal ? 0.12 : 0.06);
      mat = new THREE.MeshToonMaterial({
        color,
        gradientMap: getToonGradientTexture('atom'),
        emissive,
        emissiveIntensity: isTransitionMetal ? 0.82 : 0.56,
      });
    } else {
      mat = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.16,
        metalness: 0.08,
        clearcoat: 0.82,
        clearcoatRoughness: 0.12,
        reflectivity: 0.62,
      });
    }

    if (moleculeInkEnabled) {
      if ('specular' in mat) mat.specular = new THREE.Color(0xffffff);
      if ('shininess' in mat) mat.shininess = 10;
      if ('color' in mat && mat.color) mat.color.lerp(new THREE.Color(0xffffff), 0.15);
    }
    return applyGlobalMaterialOpacity(mat, moleculeAtomOpacity);
  }

  /**
   * Create the additive specular shell used for stylized molecule hotspots.
   * @param {number} z
   * @returns {THREE.Material}
   */
  function createAtomHighlightMaterial(z) {
    const styleKey = getMoleculeStyleProfile().key;
    const isTransitionMetal = isTransitionMetalAtomicNumber(z);
    const opacityScale = Math.max(0.05, Math.min(1, moleculeAtomOpacity));
    if (moleculeInkEnabled) {
      return new THREE.MeshPhongMaterial({
        color: 0xffffff,
        specular: 0xffffff,
        shininess: 12,
        transparent: true,
        opacity: 0.12 * opacityScale,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        side: THREE.FrontSide,
      });
    }
    if (useGlossyMoleculeStyle()) {
      return new THREE.MeshPhongMaterial({
        color: isTransitionMetal ? 0xfff0d0 : 0xeaf6ff,
        specular: 0xffffff,
        shininess: isTransitionMetal ? 280 : 340,
        emissive: isTransitionMetal ? new THREE.Color(0x443114) : new THREE.Color(0x182a46),
        emissiveIntensity: isTransitionMetal ? 0.08 : 0.05,
        transparent: true,
        opacity: (isTransitionMetal ? 0.28 : 0.24) * opacityScale,
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
      opacity: (isTransitionMetal ? 0.52 : 0.34) * opacityScale,
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
   * Get (or create) the shared bond material for the current molecule style.
   * @returns {THREE.Material}
   */
  function getBondMaterial() {
    const key = getMoleculeStyleProfile().key;
    const cacheKey = `${key}:ink=${moleculeInkEnabled ? 1 : 0}:alpha=${moleculeBondOpacity.toFixed(3)}`;
    if (bondMaterialCache.has(cacheKey)) return bondMaterialCache.get(cacheKey);

    let mat;
    if (key === 'glossy') {
      mat = createGlossySolidMaterial({ color: 0xffffff, vertexColors: true });
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
        vertexColors: true,
        roughness: 0.14,
        metalness: 0.08,
        clearcoat: 0.68,
        clearcoatRoughness: 0.14,
        reflectivity: 0.58,
      });
    }
    if (moleculeInkEnabled) {
      if ('color' in mat && mat.color) mat.color.lerp(new THREE.Color(0xffffff), 0.2);
      if ('specular' in mat) mat.specular = new THREE.Color(0xffffff);
      if ('shininess' in mat) mat.shininess = 12;
    }
    applyGlobalMaterialOpacity(mat, moleculeBondOpacity);
    bondMaterialCache.set(cacheKey, mat);
    return mat;
  }

  /**
   * Get (or create) the shared outline material used by stylized bond shells.
   * @returns {THREE.Material|null}
   */
  function getStylizedBondOutlineMaterial() {
    // Allow glossy bond outlines even when glossy no longer uses the broader
    // "stylized molecule" shading stack.
    const profile = getMoleculeStyleProfile();
    const styleKey = profile.key;
    const useOutline = useStylizedMoleculeStyle() || styleKey === 'glossy' || moleculeInkEnabled;
    if (!useOutline) return null;
    const alphaKey = Math.max(0.35, Math.min(1, moleculeBondOpacity)).toFixed(3);
    const key = `${styleKey}:outline:ink=${moleculeInkEnabled ? 1 : 0}:alpha=${alphaKey}`;
    if (bondMaterialCache.has(key)) return bondMaterialCache.get(key);
    const mat = (styleKey === 'glossy')
      ? new THREE.MeshBasicMaterial({
        // Match glossy atom outline styling (dark contour shell).
        color: 0x07142c,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.95 * Math.max(0.35, Math.min(1, moleculeBondOpacity)),
        depthWrite: false,
      })
      : new THREE.MeshBasicMaterial({
        color: moleculeInkEnabled ? 0x171717 : 0x334050,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.86 * Math.max(0.35, Math.min(1, moleculeBondOpacity)),
        depthWrite: false,
      });
    bondMaterialCache.set(key, mat);
    return mat;
  }

  /**
   * Get (or create) the shared highlight material used by stylized bond shells.
   * @returns {THREE.Material|null}
   */
  function getStylizedBondHighlightMaterial() {
    const styleKey = getMoleculeStyleProfile().key;
    // Glossy also uses a highlight shell so bonds and atoms read with the
    // same shiny response under light.
    if (!(useStylizedMoleculeStyle() || styleKey === 'glossy')) return null;
    const key = styleKey === 'glossy' ? 'glossy:highlight' : 'toon:highlight';
    if (bondMaterialCache.has(key)) return bondMaterialCache.get(key);
    const mat = new THREE.MeshPhongMaterial({
      color: styleKey === 'glossy' ? 0xe8f5ff : 0xa4c2f2,
      specular: 0xffffff,
      shininess: styleKey === 'glossy' ? 280 : 160,
      transparent: true,
      opacity: styleKey === 'glossy' ? 0.22 : 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.FrontSide,
    });
    bondMaterialCache.set(key, mat);
    return mat;
  }

  /**
   * Get (or create) the material used by 3D aromatic ring dash segments.
   * @returns {THREE.Material}
   */
  function getAromaticRingMaterial() {
    const profile = getMoleculeStyleProfile();
    const styleKey = profile.key;
    const key = `aromatic:ring:${styleKey}`;
    if (bondMaterialCache.has(key)) return bondMaterialCache.get(key);

    const color = profile.aromaticDashColor;
    const opacity = Number.isFinite(profile.aromaticDashOpacity) ? profile.aromaticDashOpacity : 1.0;
    let mat;
    if (styleKey === 'toon') {
      mat = new THREE.MeshToonMaterial({
        color,
        gradientMap: getToonGradientTexture('bond'),
      });
    } else if (styleKey === 'glossy') {
      mat = new THREE.MeshPhongMaterial({
        color,
        specular: 0xeaf4ff,
        shininess: 210,
      });
    } else {
      mat = new THREE.MeshPhongMaterial({
        color,
        specular: 0xaab2c2,
        shininess: 90,
      });
    }
    const finalOpacity = opacity * Math.max(0.05, Math.min(1, moleculeBondOpacity));
    mat.transparent = finalOpacity < 0.999;
    mat.opacity = finalOpacity;
    mat.depthWrite = finalOpacity >= 0.999;
    mat.depthTest = true;
    bondMaterialCache.set(key, mat);
    return mat;
  }

  /**
   * Add a 3D dashed aromatic ring guide inside a planar six-member ring.
   * Dash segments are rendered as short capped cylinders so they obey depth
   * testing and clip correctly behind atoms/bonds.
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

    const profile = getMoleculeStyleProfile();
    const baseBondRadius = profile.key === 'glossy' ? getGlossyBondCenterRadius() : profile.bondRadius;
    const dashRadius = Math.max(0.012, Math.min(0.042, baseBondRadius * 0.42));
    const circumference = 2 * Math.PI * radius;
    const dashCount = Math.max(10, Math.min(28, Math.round(circumference / 0.26)));
    const sectorAngle = (2 * Math.PI) / dashCount;
    const dashAngle = sectorAngle * 0.58;
    const halfDashAngle = dashAngle * 0.5;
    const dashChordLength = Math.max(0.02, 2 * radius * Math.sin(halfDashAngle));
    const radialSegments = useStylizedMoleculeStyle() ? 14 : 10;
    const dashGeom = new THREE.CylinderGeometry(
      dashRadius,
      dashRadius,
      dashChordLength,
      radialSegments,
      1,
      false
    );
    const dashLift = dashRadius * 0.1;
    const yAxis = new THREE.Vector3(0, 1, 0);
    const material = getAromaticRingMaterial();

    const pointOnRing = (angle) => center.clone()
      .addScaledVector(basisU, Math.cos(angle) * radius)
      .addScaledVector(basisV, Math.sin(angle) * radius);

    for (let k = 0; k < dashCount; k++) {
      const midAngle = k * sectorAngle;
      const p0 = pointOnRing(midAngle - halfDashAngle);
      const p1 = pointOnRing(midAngle + halfDashAngle);
      const seg = p1.clone().sub(p0);
      const segLenSq = seg.lengthSq();
      if (segLenSq < 1e-12) continue;
      const segDir = seg.clone().multiplyScalar(1 / Math.sqrt(segLenSq));
      const dash = new THREE.Mesh(dashGeom, material);
      dash.position.copy(p0).addScaledVector(seg, 0.5).addScaledVector(normal, dashLift);
      dash.quaternion.setFromUnitVectors(yAxis, segDir);
      dash.renderOrder = 14;
      dash.userData = { type: 'aromaticRingDash' };
      group.add(dash);
    }
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
   * Apply an end-to-end gradient to a tube generated as ring-major vertices.
   * @param {THREE.BufferGeometry} geom
   * @param {number} tubularSegments
   * @param {number} radialSegments
   * @param {THREE.Color} colorA
   * @param {THREE.Color} colorB
   */
  function applyTubeRingGradient(geom, tubularSegments, radialSegments, colorA, colorB) {
    const pos = geom.getAttribute('position');
    if (!pos) return;
    const ringCount = Math.max(2, (tubularSegments | 0) + 1);
    const rSeg = Math.max(3, radialSegments | 0);
    const expectedCount = ringCount * rSeg;
    if (pos.count < expectedCount) {
      applyBondGradient(geom, colorA, colorB);
      return;
    }
    const tmp = new THREE.Color();
    const colors = new Float32Array(pos.count * 3);
    for (let ring = 0; ring < ringCount; ring++) {
      const t = ring / Math.max(1, ringCount - 1);
      tmp.copy(colorA).lerp(colorB, t);
      for (let j = 0; j < rSeg; j++) {
        const idx = ring * rSeg + j;
        const base = idx * 3;
        colors[base + 0] = tmp.r;
        colors[base + 1] = tmp.g;
        colors[base + 2] = tmp.b;
      }
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  /**
   * Fill one geometry with a single vertex color.
   * @param {THREE.BufferGeometry} geom
   * @param {THREE.Color} color
   */
  function applySolidVertexColor(geom, color) {
    const pos = geom.getAttribute('position');
    if (!pos) return;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const base = i * 3;
      colors[base + 0] = color.r;
      colors[base + 1] = color.g;
      colors[base + 2] = color.b;
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  /**
   * Build a glossy connector geometry that is thinner in the center and fuller near the ends.
   * The geometry is revolved around the Y axis and later oriented along the bond vector.
   * @param {number} length
   * @param {number} centerRadius
   * @param {number} endRadiusA Radius at y=-L/2 (atom A side).
   * @param {number} [endRadiusB=endRadiusA] Radius at y=+L/2 (atom B side).
   * @param {number} [endSlopeA=-0.58] Endpoint slope dr/dy at y=-L/2.
   * @param {number} [endSlopeB=0.58] Endpoint slope dr/dy at y=+L/2.
   * @returns {THREE.BufferGeometry}
   */
  function createGlossyBondConnectorGeometry(
    length,
    centerRadius,
    endRadiusA,
    endRadiusB = endRadiusA,
    endSlopeA = -0.58,
    endSlopeB = 0.58
  ) {
    const L = Math.max(1e-4, length);
    const cR = Math.max(1e-4, centerRadius);
    const eRA = Math.max(cR, endRadiusA);
    const eRB = Math.max(cR, endRadiusB);
    const samples = 20;
    const profile = [];
    const halfL = L * 0.5;
    const minEnd = Math.min(eRA, eRB);
    // Fuller center profile while still staying below the end-seat radii.
    const centerTarget = cR * 1.28;
    const centerCap = minEnd * 0.98;
    const cMid = Math.max(cR * 1.1, Math.min(centerTarget, centerCap));
    const mA = Number.isFinite(endSlopeA) ? endSlopeA : -0.58;
    const mB = Number.isFinite(endSlopeB) ? endSlopeB : 0.58;

    /**
     * Cubic Hermite interpolation.
     * @param {number} x 0..1
     * @param {number} r0
     * @param {number} r1
     * @param {number} m0 Derivative wrt y at start.
     * @param {number} m1 Derivative wrt y at end.
     * @param {number} h Segment length in y.
     * @returns {number}
     */
    const hermite = (x, r0, r1, m0, m1, h) => {
      const x2 = x * x;
      const x3 = x2 * x;
      const h00 = 2 * x3 - 3 * x2 + 1;
      const h10 = x3 - 2 * x2 + x;
      const h01 = -2 * x3 + 3 * x2;
      const h11 = x3 - x2;
      return h00 * r0 + h10 * (h * m0) + h01 * r1 + h11 * (h * m1);
    };

    for (let i = 0; i <= samples; i++) {
      const t = i / samples; // 0..1 along bond
      const y = -halfL + t * L;
      let r;
      if (t <= 0.5) {
        const x = t * 2;
        r = hermite(x, eRA, cMid, mA, 0, halfL);
      } else {
        const x = (t - 0.5) * 2;
        r = hermite(x, cMid, eRB, 0, mB, halfL);
      }
      if (i === 0) r = eRA;
      if (i === samples) r = eRB;
      r = Math.max(cR, Math.min(Math.max(eRA, eRB) * 1.02, r));
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
    const text = typeof symbol === 'string' ? symbol.trim().slice(0, 12) : '?';
    const fg = normalizeHexColor(textHex, UI_PALETTE.atomLabelTextDefault);
    const stroke = normalizeHexColor(strokeHex, UI_PALETTE.black);
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

  const ATOM_LABEL_SUBSCRIPT_DIGITS = Object.freeze({
    '0': '₀',
    '1': '₁',
    '2': '₂',
    '3': '₃',
    '4': '₄',
    '5': '₅',
    '6': '₆',
    '7': '₇',
    '8': '₈',
    '9': '₉',
  });

  /**
   * Convert a one-based atom index to unicode subscript digits.
   * @param {number} atomNumber1Based
   * @returns {string}
   */
  function toSubscriptDigits(atomNumber1Based) {
    const text = String(Math.max(1, Math.round(atomNumber1Based)));
    let out = '';
    for (const ch of text) out += (ATOM_LABEL_SUBSCRIPT_DIGITS[ch] || ch);
    return out;
  }

  /**
   * Build the visible atom label text based on current label settings.
   * @param {string} symbol
   * @param {number} atomIndex0Based
   * @returns {string}
   */
  function getAtomLabelText(symbol, atomIndex0Based) {
    const base = (typeof symbol === 'string' && symbol.trim()) ? symbol.trim() : '?';
    if (!showAtomLabelNumbers) return base;
    return `${base}${toSubscriptDigits((atomIndex0Based | 0) + 1)}`;
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
    const profile = getMoleculeStyleProfile();
    const isToonStyle = profile.key === 'toon';
    const isGlossyStyle = profile.key === 'glossy';
    const isInkStyle = !!moleculeInkEnabled;
    const isStylizedStyle = isToonStyle || isGlossyStyle;
    const usesOutline = isStylizedStyle || isInkStyle;
    const atomGeom = new THREE.SphereGeometry(
      0.5,
      profile.sphereWidthSegments,
      profile.sphereHeightSegments
    );
    const stylizedOutlineMat = usesOutline
      ? new THREE.MeshBasicMaterial({
        color: isGlossyStyle ? 0x07142c : isInkStyle ? 0x171717 : 0x303846,
        side: THREE.BackSide,
        transparent: true,
        opacity: (isGlossyStyle ? 0.95 : 0.9) * Math.max(0.35, Math.min(1, moleculeAtomOpacity)),
        depthWrite: false,
      })
      : null;
    const materialCache = new Map();
    const highlightMaterialCache = new Map();
    const labelMaterialCache = new Map();
    const toAng = (vol.units === 'angstrom');
    const hydrogenDisplayRadius = 0.5 * getCovalentRadiusAngstrom(1) * getAtomRenderScaleFactor(1);
    const baseOutlineScale = isGlossyStyle ? 1.05 : isInkStyle ? 1.09 : isToonStyle ? 1.08 : 1.0;
    // Keep atom outline shell thickness constant across atom sizes (match hydrogen).
    const targetOutlineThickness = Math.max(1e-4, hydrogenDisplayRadius * Math.max(0, baseOutlineScale - 1));
    const atomEntries = [];
    const positions = [];
    for (let atomIndex = 0; atomIndex < (vol.atoms || []).length; atomIndex++) {
      const a = vol.atoms[atomIndex];
      const z = a.Z | 0;
      const px = toAng ? a.x : a.x * BOHR_TO_ANG;
      const py = toAng ? a.y : a.y * BOHR_TO_ANG;
      const pz = toAng ? a.z : a.z * BOHR_TO_ANG;
      let pos = new THREE.Vector3(px, py, pz);
      atomEntries.push({ atom: a, z, pos, atomIndex });
      positions.push(pos);
    }
    const radialStats = computePositionRadialStats(positions);
    for (const entry of atomEntries) {
      const { z, pos, atomIndex } = entry;
      const r = getCovalentRadiusAngstrom(z);
      const styleScalar = Math.max(
        0,
        Math.min(1, pos.distanceTo(radialStats.center) / Math.max(1e-8, radialStats.maxDistance))
      );
      const atomColor = getAtomRenderColor(z, { scalar: styleScalar });
      const isTransitionMetal = isTransitionMetalAtomicNumber(z);
      const matKey = `${moleculeStyle}:${atomColor.getHexString()}:${isTransitionMetal ? 'tm' : 'main'}`;
      let mat = materialCache.get(matKey);
      if (!mat) {
        mat = createAtomMaterial(atomColor, z);
        materialCache.set(matKey, mat);
      }
      const mesh = new THREE.Mesh(atomGeom, mat);
      mesh.position.copy(pos);
      const atomScale = r * getAtomRenderScaleFactor(z);
      mesh.scale.setScalar(atomScale);
      if (stylizedOutlineMat) {
        const outline = new THREE.Mesh(atomGeom, stylizedOutlineMat);
        const displayRadius = 0.5 * atomScale;
        const outlineScale = isInkStyle
          ? computeInkOutlineScale(displayRadius, pos)
          : 1 + (targetOutlineThickness / Math.max(1e-4, displayRadius));
        outline.scale.setScalar(Math.max(1.001, Math.min(1.2, outlineScale)));
        outline.userData = { type: 'atomOutline' };
        mesh.add(outline);
      }
      // Keep additive highlight shells for toon/blackbody only.
      // Glossy highlight shells tend to create bright seam rings at joins.
      if (isToonStyle || moleculeBlackbodyEnabled) {
        const highlightKey = `${moleculeStyle}:${isTransitionMetal ? 'tm' : 'main'}`;
        let highlightMat = highlightMaterialCache.get(highlightKey);
        if (!highlightMat) {
          highlightMat = createAtomHighlightMaterial(z);
          highlightMaterialCache.set(highlightKey, highlightMat);
        }
        const highlight = new THREE.Mesh(atomGeom, highlightMat);
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
        const labelText = getAtomLabelText(symbol, atomIndex);
        const labelHex = UI_PALETTE.white;
        const labelStrokeHex = getReadableLabelDarkenedHex(atomColor, 0.25);
        const labelKey = `${labelText}:${labelHex}:${labelStrokeHex}`;
        let labelMat = labelMaterialCache.get(labelKey);
        if (!labelMat) {
          labelMat = createAtomLabelSurfaceMaterial(labelText, labelHex, labelStrokeHex);
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
      mesh.userData = {
        type: 'atom',
        index: group.children.length,
        displayRadius: 0.5 * atomScale,
      };
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
   * @returns {Array<{pos:THREE.Vector3,Z:number,color:THREE.Color|null,bondColor:THREE.Color|null,displayRadius:number,styleScalar:number}>}
   */
  function buildBondAtomRecords(vol, options = {}) {
    const includeRenderColor = options.includeRenderColor !== false;
    const atomPositions = [];
    const toAng = (vol.units === 'angstrom');
    const positions = [];
    for (const a of vol.atoms) {
      const z = a.Z | 0;
      const px = toAng ? a.x : a.x * BOHR_TO_ANG;
      const py = toAng ? a.y : a.y * BOHR_TO_ANG;
      const pz = toAng ? a.z : a.z * BOHR_TO_ANG;
      const pos = new THREE.Vector3(px, py, pz);
      positions.push(pos);
      atomPositions.push({
        pos,
        Z: z,
        color: null,
        bondColor: null,
        styleScalar: 0,
        // Sphere geometry radius is 0.5, then scaled by the style-dependent atom scale factor.
        displayRadius: 0.5 * getCovalentRadiusAngstrom(z) * getAtomRenderScaleFactor(z),
      });
    }
    let center = new THREE.Vector3();
    if (positions.length) {
      for (const p of positions) center.add(p);
      center.multiplyScalar(1 / positions.length);
    }
    let maxDistance = 1e-8;
    for (const p of positions) {
      const d = p.distanceTo(center);
      if (d > maxDistance) maxDistance = d;
    }
    for (const rec of atomPositions) {
      const styleScalar = Math.max(0, Math.min(1, rec.pos.distanceTo(center) / maxDistance));
      rec.styleScalar = styleScalar;
      if (!includeRenderColor) continue;
      const atomColor = getAtomRenderColor(rec.Z, { scalar: styleScalar });
      rec.color = atomColor;
      rec.bondColor = getBondRenderColor(atomColor, rec.Z, { scalar: styleScalar });
    }
    return atomPositions;
  }

  /**
   * Compute center and max radial distance for a set of vectors.
   * @param {THREE.Vector3[]} positions
   * @returns {{center:THREE.Vector3,maxDistance:number}}
   */
  function computePositionRadialStats(positions) {
    const center = new THREE.Vector3();
    if (!positions || !positions.length) return { center, maxDistance: 1 };
    for (const p of positions) center.add(p);
    center.multiplyScalar(1 / positions.length);
    let maxDistance = 1e-8;
    for (const p of positions) {
      const d = p.distanceTo(center);
      if (d > maxDistance) maxDistance = d;
    }
    return { center, maxDistance };
  }

  /**
   * Compute a variable ink-style outline scale based on camera distance.
   * Closer atoms receive slightly thicker outlines.
   * @param {number} radius
   * @param {THREE.Vector3} worldPos
   * @returns {number}
   */
  function computeInkOutlineScale(radius, worldPos) {
    const displayRadius = Math.max(1e-6, Number(radius) || 1e-6);
    const distance = Math.max(0.2, camera.position.distanceTo(worldPos || new THREE.Vector3()));
    const near = 2.0;
    const far = 14.0;
    const t = Math.max(0, Math.min(1, (distance - near) / Math.max(1e-6, far - near)));
    const thickness = THREE.MathUtils.lerp(displayRadius * 0.16, displayRadius * 0.055, t);
    return 1 + thickness / displayRadius;
  }

  /**
   * Update ink-style variable outline thickness each frame.
   */
  function updateInkOutlineThickness() {
    if (!moleculeInkEnabled) return;
    if (!atomGroup || !atomGroup.children) return;
    for (const atomMesh of atomGroup.children) {
      if (!atomMesh || !atomMesh.children || !atomMesh.children.length) continue;
      const radius = Number(atomMesh.userData && atomMesh.userData.displayRadius) || 0;
      if (!(radius > 0)) continue;
      for (const child of atomMesh.children) {
        if (!child || !child.userData || child.userData.type !== 'atomOutline') continue;
        const scale = computeInkOutlineScale(radius, atomMesh.position);
        child.scale.setScalar(Math.max(1.001, Math.min(1.25, scale)));
      }
    }
    if (!bondGroup || !bondGroup.children) return;
    for (const bondMesh of bondGroup.children) {
      if (!bondMesh || !bondMesh.children || !bondMesh.children.length) continue;
      const radius = Number(bondMesh.userData && bondMesh.userData.bondDisplayRadius) || 0;
      if (!(radius > 0)) continue;
      for (const child of bondMesh.children) {
        if (!child || !child.userData || child.userData.type !== 'bondOutline') continue;
        const scale = computeInkOutlineScale(radius, bondMesh.position);
        child.scale.set(Math.max(1.001, Math.min(1.25, scale)), 1.0, Math.max(1.001, Math.min(1.25, scale)));
      }
    }
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
    const isInkStyle = !!moleculeInkEnabled;
    const usesTrimmedConnector = !!profile.usesTrimmedConnector;
    const atomPositions = buildBondAtomRecords(vol);
    const bondEdges = getVolumeBondEdges(vol, atomPositions);
    const bondMat = getBondMaterial();
    // Keep bond outlines in toon/glossy/ink.
    const stylizedBondOutlineMat = (isToonStyle || isGlossyStyle || isInkStyle) ? getStylizedBondOutlineMaterial() : null;
    // First-pass glossy seam cleanup:
    // disable additive highlight shell on glossy bonds to avoid bright seam bands
    // where bond and atom shells meet.
    const stylizedBondHighlightMat = isToonStyle ? getStylizedBondHighlightMaterial() : null;
    const up = new THREE.Vector3(0, 1, 0);
    const glossyCenterRadius = getGlossyBondCenterRadius();
    const glossyEndRadius = getGlossyBondEndRadius();
    const kitCenterRadius = profile.bondRadius;
    const kitCollarRadius = profile.kitCollarRadius || 0.114;
    const bondRadius = isGlossyStyle ? glossyCenterRadius : profile.bondRadius;
    const bondRadialSegments = profile.bondRadialSegments;
    const bondHeightSegments = profile.bondHeightSegments;
    // Glossy mode forces single connectors to avoid multi-bond overlap artifacts.
    const multiBondRenderingEnabled = !!showMultiBonds && !isGlossyStyle;
    const renderEdges = bondEdges.map((edge) => ({
      id: edge.id,
      a: edge.a,
      b: edge.b,
      i: edge.i,
      j: edge.j,
      len: edge.len,
      order: multiBondRenderingEnabled ? normalizeEditAddBondOrder(edge.order || 1) : 1,
      kind: edge.kind,
      maxOrder: edge.maxOrder,
    }));
    const aromaticRings = multiBondRenderingEnabled
      ? inferAromaticSixRings(atomPositions, renderEdges)
      : [];
    const bondAdjacency = multiBondRenderingEnabled
      ? buildBondAdjacency(renderEdges, atomPositions.length)
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
      const offsetU = Number.isFinite(componentOffsetU) ? componentOffsetU : 0;
      const offsetV = Number.isFinite(componentOffsetV) ? componentOffsetV : 0;
      const lateralOffset = Math.hypot(offsetU, offsetV);
      const componentCenterRadius = bondRadius;
      let localTrimA = Math.max(0, Number.isFinite(trimA) ? trimA : 0);
      let localTrimB = Math.max(0, Number.isFinite(trimB) ? trimB : 0);
      let localGeomLen = geomLen;
      let localMid = mid;
      // For default-mode multiple bonds, compensate seat depth for lateral
      // component offset so connector ends remain hidden inside the spheres.
      if (profile.key === 'default' && !isKitStyle && !isGlossyStyle && order >= 2) {
        // Order-4 components need deeper seating so their clipped ends stay hidden.
        const defaultMultiSeatOverlap = order >= 4 ? 0.06 : (order >= 3 ? 0.06 : 0.02);
        const seatAFromOffset = Math.sqrt(Math.max(
          0,
          a.displayRadius * a.displayRadius
            - lateralOffset * lateralOffset
            - componentCenterRadius * componentCenterRadius
        ));
        const seatBFromOffset = Math.sqrt(Math.max(
          0,
          b.displayRadius * b.displayRadius
            - lateralOffset * lateralOffset
            - componentCenterRadius * componentCenterRadius
        ));
        localTrimA = Math.max(0, seatAFromOffset - defaultMultiSeatOverlap);
        localTrimB = Math.max(0, seatBFromOffset - defaultMultiSeatOverlap);
        const maxTrim = Math.max(0, len - 0.16);
        const trimSum = localTrimA + localTrimB;
        if (trimSum > maxTrim && trimSum > 1e-8) {
          const s = maxTrim / trimSum;
          localTrimA *= s;
          localTrimB *= s;
        }
        const adjustedPlacement = computeBondSegmentPlacement(a.pos, b.pos, localTrimA, localTrimB, 0.08);
        if (adjustedPlacement.valid) {
          localGeomLen = adjustedPlacement.geomLen;
          // Preserve per-component lateral offset (multi-bond separation).
          // Only update length here; caller-provided `mid` already includes
          // the component displacement in the local bond plane.
        }
      }
      const seatA = localTrimA;
      const seatB = localTrimB;
      const glossyEndRadiusRawA = isGlossyStyle
        ? Math.sqrt(Math.max(
          0,
          a.displayRadius * a.displayRadius - seatA * seatA - lateralOffset * lateralOffset
        ))
        : glossyEndRadius;
      const glossyEndRadiusRawB = isGlossyStyle
        ? Math.sqrt(Math.max(
          0,
          b.displayRadius * b.displayRadius - seatB * seatB - lateralOffset * lateralOffset
        ))
        : glossyEndRadius;
      // Use exact geometric contact radius at the sphere seat (no shrink gap).
      const glossySeamRadiusScale = 1.0;
      const glossyEndRadiusA = isGlossyStyle ? glossyEndRadiusRawA * glossySeamRadiusScale : glossyEndRadiusRawA;
      const glossyEndRadiusB = isGlossyStyle ? glossyEndRadiusRawB * glossySeamRadiusScale : glossyEndRadiusRawB;
      // Funnel-style join: do not match sphere tangents exactly, but keep seam
      // curvature gentler than the local sphere slope to avoid dipping inside.
      const glossyFunnelScale = 0.62;
      const glossyFunnelMinSlope = 0.16;
      const sphereSlopeMagA = seatA / Math.max(1e-5, glossyEndRadiusA);
      const sphereSlopeMagB = seatB / Math.max(1e-5, glossyEndRadiusB);
      const glossyEndSlopeA = isGlossyStyle
        ? -Math.max(glossyFunnelMinSlope, sphereSlopeMagA * glossyFunnelScale)
        : -0.58;
      const glossyEndSlopeB = isGlossyStyle
        ? +Math.max(glossyFunnelMinSlope, sphereSlopeMagB * glossyFunnelScale)
        : 0.58;
      const geom = isGlossyStyle
        ? createGlossyBondConnectorGeometry(
          localGeomLen,
          componentCenterRadius,
          glossyEndRadiusA,
          glossyEndRadiusB,
          glossyEndSlopeA,
          glossyEndSlopeB
        )
        : isKitStyle
          ? createKitCollaredBondGeometry(localGeomLen, componentCenterRadius, kitCollarRadius)
            : new THREE.CylinderGeometry(componentCenterRadius, componentCenterRadius, localGeomLen, bondRadialSegments, bondHeightSegments, false);
      if (!isKitStyle) {
        const gradientColorA = a.bondColor || a.color;
        const gradientColorB = b.bondColor || b.color;
        if (gradientColorA && gradientColorB) applyBondGradient(geom, gradientColorA, gradientColorB);
      }
      const cyl = new THREE.Mesh(geom, bondMat);
      if (stylizedBondOutlineMat) {
        const outline = new THREE.Mesh(geom, stylizedBondOutlineMat);
        const outlineScale = isGlossyStyle ? 1.05 : isInkStyle ? 1.08 : 1.18;
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
      cyl.position.copy(localMid);
      const q = new THREE.Quaternion().setFromUnitVectors(up, dirNorm);
      cyl.setRotationFromQuaternion(q);
      cyl.userData = {
        bondId: renderEdges.find((edge) => edge.i === i && edge.j === j && edge.order === order && edge.kind === 'normal')?.id || buildVolumeBondId(ensureAtomId(vol.atoms[i]), ensureAtomId(vol.atoms[j])),
        baseLen: len,
        baseGeomLen: localGeomLen,
        trimA: localTrimA,
        trimB: localTrimB,
        i,
        j,
        bondOrder: order,
        bondKind: 'normal',
        bondComponentOffset: offsetU,
        bondComponentOffsetU: offsetU,
        bondComponentOffsetV: offsetV,
        connectorStyle: isKitStyle ? 'kit' : isGlossyStyle ? 'glossy' : 'default',
        connectorCenterRadius: componentCenterRadius,
        connectorEndRadius: isKitStyle ? kitCollarRadius : isGlossyStyle ? Math.max(glossyEndRadiusA, glossyEndRadiusB) : componentCenterRadius,
        connectorEndRadiusA: isGlossyStyle ? glossyEndRadiusA : undefined,
        connectorEndRadiusB: isGlossyStyle ? glossyEndRadiusB : undefined,
        bondDisplayRadius: Math.max(0.01, componentCenterRadius),
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
    function addKitCurvedBondComponent(
      i, j, order, len, geomLen, trimA, trimB, aPos, bPos, aRadius, bRadius, dirNorm,
      offsetDirection, offsetDistance, componentOffsetU, componentOffsetV
    ) {
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
      const bulgeGain = order >= 4 ? 1.95 : order >= 3 ? 1.75 : 1.4;
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
        bondOrder: Math.max(2, Math.min(4, order | 0)),
        bondComponentOffset: Number.isFinite(componentOffsetU) ? componentOffsetU : 0,
        bondComponentOffsetU: Number.isFinite(componentOffsetU) ? componentOffsetU : 0,
        bondComponentOffsetV: Number.isFinite(componentOffsetV) ? componentOffsetV : 0,
        connectorStyle: 'kitCurved',
        connectorCenterRadius: bondRadius,
        connectorEndRadius: kitCollarRadius,
      };
      group.add(connector);
    }

    for (const edge of renderEdges) {
      const i = edge.i;
      const j = edge.j;
      const a = atomPositions[i];
      const b = atomPositions[j];
      const order = multiBondRenderingEnabled ? Math.max(1, Math.min(4, edge.order | 0)) : 1;
      const basePlacement = computeBondSegmentPlacement(a.pos, b.pos, 0, 0, 0);
      if (!basePlacement.valid) continue;
      const len = basePlacement.len;
      const dirNorm = basePlacement.dirNorm;

      let trimA = 0;
      let trimB = 0;
      let geomLen = basePlacement.geomLen;
      let mid = basePlacement.mid;
      const useDefaultSurfaceSeat = profile.key === 'default';
      if (usesTrimmedConnector || useDefaultSurfaceSeat) {
        const connectorEndRadius = isGlossyStyle
          ? glossyEndRadius
          : (isKitStyle ? kitCollarRadius : bondRadius);
        if (isGlossyStyle) {
          // In glossy mode, seat connectors 3/4 of the atom radius from the center.
          // This shortens tube length and narrows the endpoint profile.
          const glossySeatFraction = 0.78;
          const glossySeatInset = 0.0;
          trimA = Math.max(0, a.displayRadius * glossySeatFraction + glossySeatInset);
          trimB = Math.max(0, b.displayRadius * glossySeatFraction + glossySeatInset);
        } else if (useDefaultSurfaceSeat) {
          // Default mode: seat at sphere contact for constant bond radius and
          // add a tiny overlap so bonds dip slightly into atom shells.
          const defaultSeatOverlap = 0.01;
          trimA = Math.max(0, getSphereSectionAxisDistance(a.displayRadius, bondRadius) - defaultSeatOverlap);
          trimB = Math.max(0, getSphereSectionAxisDistance(b.displayRadius, bondRadius) - defaultSeatOverlap);
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
    updateTransformBondSelectionHalos();
    updateTransformSelectionGuides();
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

  const autoIsoController = createAutoIsoController({
    isPhaseLikeComponent,
    targetFraction: AUTO_ISO_TARGET_FRACTION,
    histogramBins: AUTO_ISO_HISTOGRAM_BINS,
    maxSamples: AUTO_ISO_MAX_SAMPLES,
    workerThresholdSamples: AUTO_ISO_WORKER_THRESHOLD_SAMPLES,
    workerTimeoutMs: AUTO_ISO_WORKER_TIMEOUT_MS,
    hasVolumetricGrid,
    formatIsoInputValue,
    getCurrentIndex: () => currentIndex,
    getVolumes: () => volumes,
    getComponentMode,
    isAutoIsoEnabled: () => autoIsoEnabled,
    setIsoInputValue: (value) => {
      if (isoInput) isoInput.value = value;
    },
    hasIsoInput: () => !!isoInput,
    rebuildScene,
  });
  window.addEventListener('beforeunload', disposeDofPostprocessResources);

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
   * Collect visible scene bounds used for camera fitting.
   * @returns {{contentBox:THREE.Box3,atomBox:THREE.Box3,hasContent:boolean,hasAtoms:boolean}}
   */
  function collectVisibleSceneBounds() {
    const contentBox = new THREE.Box3();
    const atomBox = new THREE.Box3();
    let hasContent = false;
    let hasAtoms = false;
    for (const m of meshes) {
      contentBox.expandByObject(m);
      hasContent = true;
    }
    if (atomGroup.children.length) {
      contentBox.expandByObject(atomGroup);
      atomBox.expandByObject(atomGroup);
      hasContent = true;
      hasAtoms = true;
    }
    if (bondGroup.children.length) {
      contentBox.expandByObject(bondGroup);
      hasContent = true;
    }
    if (boxHelper) {
      contentBox.expandByObject(boxHelper);
      hasContent = true;
    }
    return { contentBox, atomBox, hasContent, hasAtoms };
  }

  /**
   * Choose one fit center for the current scene.
   * @param {{contentBox:THREE.Box3,atomBox:THREE.Box3,hasAtoms:boolean}} bounds
   * @returns {THREE.Vector3}
   */
  function computeSceneFitCenter(bounds) {
    const center = new THREE.Vector3();
    if (bounds && bounds.hasAtoms && bounds.atomBox && !bounds.atomBox.isEmpty()) {
      return bounds.atomBox.getCenter(center);
    }
    return bounds.contentBox.getCenter(center);
  }

  /**
   * Compute fit geometry for the current scene bounds and center.
   * @param {{contentBox:THREE.Box3}} bounds
   * @param {THREE.Vector3} center
   * @param {number} cssAspect
   * @param {number} fovDeg
   * @returns {{fitRadius:number,fitDiameter:number,distance:number}}
   */
  function computeSceneFitGeometry(bounds, center, cssAspect, fovDeg) {
    const box = bounds && bounds.contentBox;
    const size = new THREE.Vector3();
    box.getSize(size);
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];
    let fitRadius = 0;
    for (const corner of corners) fitRadius = Math.max(fitRadius, center.distanceTo(corner));
    if (!(fitRadius > 1e-6)) fitRadius = Math.max(size.x, size.y, size.z) * 0.5;

    const aspect = Math.max(1e-6, Number(cssAspect) || 1);
    const verticalHalfFov = THREE.MathUtils.degToRad(Math.max(1, Number(fovDeg) || DEFAULT_PERSPECTIVE_FOV) * 0.5);
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
    const limitingHalfFov = Math.max(1e-6, Math.min(verticalHalfFov, horizontalHalfFov));
    const FIT_MARGIN = 1.12;
    const fitDiameter = Math.max(1e-6, fitRadius * 2);
    const distance = Math.max(0.01, (fitRadius * FIT_MARGIN) / Math.sin(limitingHalfFov));
    return { fitRadius, fitDiameter, distance };
  }

  /**
   * Apply one computed camera fit to the active view/camera.
   * @param {THREE.Vector3} center
   * @param {number} distance
   * @param {number} fitDiameter
   */
  function applySceneCameraFit(center, distance, fitDiameter) {
    const dir = new THREE.Vector3(1, 1, 1).normalize();
    const aspect = Math.max(1e-6, currentViewportMetrics.cssWidth / Math.max(1, currentViewportMetrics.cssHeight));
    perspectiveCamera.up.copy(DEFAULT_VIEW_UP);
    orthographicCamera.up.copy(DEFAULT_VIEW_UP);
    camera.up.copy(DEFAULT_VIEW_UP);
    camera.position.copy(center.clone().add(dir.multiplyScalar(distance)));
    if (viewState.mode === 'orthographic') {
      const frustum = computeOrthographicFrustum(aspect, distance, perspectiveCamera.fov || DEFAULT_PERSPECTIVE_FOV);
      orthographicCamera.left = frustum.left;
      orthographicCamera.right = frustum.right;
      orthographicCamera.top = frustum.top;
      orthographicCamera.bottom = frustum.bottom;
      orthographicCamera.near = Math.max(0.01, distance / 100);
      orthographicCamera.far = Math.max(orthographicCamera.near + 10, distance * 10 + fitDiameter);
      orthographicCamera.updateProjectionMatrix();
    } else {
      perspectiveCamera.near = Math.max(0.01, distance / 100);
      perspectiveCamera.far = distance * 10 + fitDiameter;
      perspectiveCamera.updateProjectionMatrix();
    }
    controls.target.copy(center);
    controls.update();
  }

  /**
   * Fit camera position and clipping planes to the current visible content bounds.
   */
  function fitCameraToScene() {
    const metrics = readRendererViewportMetrics();
    const bounds = collectVisibleSceneBounds();
    if (!bounds.hasContent || bounds.contentBox.isEmpty()) return;
    const center = computeSceneFitCenter(bounds);
    const fit = computeSceneFitGeometry(
      bounds,
      center,
      metrics.cssWidth / Math.max(1, metrics.cssHeight),
      perspectiveCamera.fov || DEFAULT_PERSPECTIVE_FOV
    );
    applySceneCameraFit(center, fit.distance, fit.fitDiameter);
  }

  let trajectoryPlaying = false;
  let trajectoryLastStepMs = 0;
  let vibrationPlaying = false;
  let vibrationLastStepMs = 0;
  let vibrationHideSmallFrequencies = true;
  let vibrationPanelLayoutRaf = 0;
  /**
   * Snapshot atom coordinates from one volume into a flat native-units array.
   * @param {*} vol
   * @param {number} atomCount
   * @returns {Float32Array}
   */
  function snapshotAtomCoordinates(vol, atomCount) {
    const count = Math.max(0, atomCount | 0);
    const frame = new Float32Array(count * 3);
    if (!vol || !Array.isArray(vol.atoms)) return frame;
    for (let i = 0; i < count; i++) {
      const a = vol.atoms[i];
      if (!a) continue;
      frame[3 * i + 0] = Number(a.x) || 0;
      frame[3 * i + 1] = Number(a.y) || 0;
      frame[3 * i + 2] = Number(a.z) || 0;
    }
    return frame;
  }
  /**
   * Apply one flat atom-coordinate frame to data + atom meshes and refresh bonds.
   * @param {*} vol
   * @param {Float32Array|number[]} frame
   * @param {number} atomCount
   */
  function applyAtomCoordinateFrame(vol, frame, atomCount) {
    if (!vol || !Array.isArray(vol.atoms) || !frame) return;
    const count = Math.max(0, Math.min(atomCount | 0, vol.atoms.length));
    const toAng = vol.units === 'angstrom';
    for (let i = 0; i < count; i++) {
      const x = Number(frame[3 * i + 0]) || 0;
      const y = Number(frame[3 * i + 1]) || 0;
      const z = Number(frame[3 * i + 2]) || 0;
      const a = vol.atoms[i];
      if (!a) continue;
      a.x = x; a.y = y; a.z = z;
      if (atomGroup && atomGroup.children && atomGroup.children[i]) {
        const mesh = atomGroup.children[i];
        if (mesh && mesh.position) {
          if (toAng) mesh.position.set(x, y, z);
          else mesh.position.set(x * BOHR_TO_ANG, y * BOHR_TO_ANG, z * BOHR_TO_ANG);
        }
      }
    }
    if (bondGroup && bondGroup.children && bondGroup.children.length) updateBondsInPlace();
    if (currentMode === MODES.MEASURE) {
      updateSelectedHalos();
      updateEditSelectionVisuals();
    }
  }
  /**
   * Resolve trajectory metadata for the active volume.
   * @returns {{enabled:boolean,record:*,vol:*,traj:*,atomCount:number,frameCount:number}}
   */
  function getActiveTrajectoryInfo() {
    const record = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null;
    const vol = record && record.vol;
    const atomCount = (vol && Array.isArray(vol.atoms)) ? vol.atoms.length : 0;
    const traj = vol && vol.trajectory;
    if (!traj || !Array.isArray(traj.frames) || traj.frames.length <= 1 || atomCount <= 0) {
      return { enabled: false, record, vol, traj: null, atomCount, frameCount: 0 };
    }
    const frameSize = atomCount * 3;
    const valid = traj.frames.every((frame) => frame && frame.length === frameSize);
    if (!valid) return { enabled: false, record, vol, traj: null, atomCount, frameCount: 0 };
    return { enabled: true, record, vol, traj, atomCount, frameCount: traj.frames.length };
  }

  /**
   * Update one floating-panel icon button glyph while preserving its element structure.
   * @param {HTMLElement|null} btn
   * @param {string} glyph
   */
  function setMotionPanelButtonGlyph(btn, glyph) {
    if (!btn) return;
    const iconEl = btn.querySelector ? btn.querySelector('.motionPanelIconGlyph') : null;
    if (iconEl) iconEl.textContent = String(glyph || '');
    else btn.textContent = String(glyph || '');
  }
  /**
   * Update trajectory controls visibility and values for the active file.
   */
  function syncTrajectoryControls() {
    const info = getActiveTrajectoryInfo();
    if (trajectoryPanelBtn) {
      trajectoryPanelBtn.style.display = info.enabled ? '' : 'none';
      trajectoryPanelBtn.title = info.enabled
        ? 'Trajectory controls'
        : 'No trajectory data in active file';
    }
    if (trajectoryRow) trajectoryRow.style.display = info.enabled ? 'grid' : 'none';
    if (trajectoryRow2) trajectoryRow2.style.display = info.enabled ? 'grid' : 'none';
    if (!info.enabled) {
      setTrajectoryPanelOpen(false, { syncUi: false });
      stopTrajectoryPlayback({ syncUi: false });
      if (trajectoryNowPlaying) trajectoryNowPlaying.textContent = 'No trajectory selected';
      return;
    }

    const traj = info.traj;
    traj.frameIndex = Math.max(0, Math.min(info.frameCount - 1, Number(traj.frameIndex) | 0));
    traj.fps = Math.max(1, Math.min(120, Math.round(Number(traj.fps) || 12)));
    traj.loop = traj.loop !== false;

    if (trajectoryFrameEl) {
      trajectoryFrameEl.max = String(Math.max(0, info.frameCount - 1));
      trajectoryFrameEl.value = String(traj.frameIndex);
    }
    if (trajectoryFrameLabel) trajectoryFrameLabel.textContent = `${traj.frameIndex + 1}/${info.frameCount}`;
    if (trajectoryNowPlaying) {
      trajectoryNowPlaying.textContent = `Frame ${traj.frameIndex + 1}/${info.frameCount} • ${traj.fps} fps${traj.loop ? ' • loop' : ''}`;
    }
    setMotionPanelButtonGlyph(trajectoryPlayBtn, trajectoryPlaying ? 'pause' : 'play_arrow');
    if (trajectoryLoopEl) trajectoryLoopEl.checked = !!traj.loop;
    if (trajectoryFpsEl && document.activeElement !== trajectoryFpsEl) trajectoryFpsEl.value = String(traj.fps);
  }
  /**
   * Resolve vibrational-mode metadata for the active volume.
   * @returns {{enabled:boolean,record:*,vol:*,vib:*,atomCount:number,modeCount:number,mode:*}}
   */
  function getActiveVibrationInfo() {
    const record = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null;
    const vol = record && record.vol;
    const atomCount = (vol && Array.isArray(vol.atoms)) ? vol.atoms.length : 0;
    const vib = vol && vol.vibration;
    if (!vib || !Array.isArray(vib.modes) || vib.modes.length === 0 || atomCount <= 0) {
      return { enabled: false, record, vol, vib: null, atomCount, modeCount: 0, mode: null };
    }
    const frameSize = atomCount * 3;
    const validModes = vib.modes.every((m) => m && m.displacements && m.displacements.length === frameSize);
    if (!validModes) return { enabled: false, record, vol, vib: null, atomCount, modeCount: 0, mode: null };
    if (!vib.equilibrium || vib.equilibrium.length !== frameSize) {
      vib.equilibrium = snapshotAtomCoordinates(vol, atomCount);
    }
    if (!vib.frameBuffer || vib.frameBuffer.length !== frameSize) {
      vib.frameBuffer = new Float32Array(frameSize);
    }
    const modeCount = vib.modes.length;
    vib.modeIndex = Math.max(0, Math.min(modeCount - 1, Number(vib.modeIndex) | 0));
    vib.amplitude = Math.max(0, Math.min(8, Number.isFinite(Number(vib.amplitude)) ? Number(vib.amplitude) : VIBRATION_DEFAULT_AMPLITUDE));
    vib.speed = Math.max(0.1, Math.min(30, Number.isFinite(Number(vib.speed)) ? Number(vib.speed) : VIBRATION_DEFAULT_SPEED));
    const mode = vib.modes[vib.modeIndex] || vib.modes[0];
    return { enabled: true, record, vol, vib, atomCount, modeCount, mode };
  }

  /**
   * Format one mode frequency for the vibration table.
   * Negative values are shown as imaginary frequencies (`|w|i`).
   * @param {*} value
   * @returns {string}
   */
  function formatVibrationFrequencyCell(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '--';
    const mag = Math.abs(n).toFixed(1);
    return n < 0 ? `${mag}i` : mag;
  }

  /**
   * Format one mode IR intensity cell.
   * @param {*} value
   * @returns {string}
   */
  function formatVibrationIntensityCell(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '--';
    return n.toFixed(1);
  }

  /**
   * Resolve one mode IR intensity in km/mol when available.
   * Accepts a few compatibility aliases used by sidecar payloads.
   * @param {*} mode
   * @returns {number}
   */
  function getVibrationModeIrIntensity(mode) {
    const n = Number(
      mode && (mode.irIntensityKmMol ?? mode.irIntensity ?? mode.intensityKmMol ?? mode.intensity)
    );
    if (!Number.isFinite(n)) return NaN;
    return Math.max(0, n);
  }

  /**
   * Build one list of spectrum peaks from the currently visible modes.
   * @param {*} vib
   * @param {number[]} visibleIndices
   * @returns {{peaks:Array<{modeIndex:number,freqCm1:number,intensity:number}>,hasExplicitIntensities:boolean}}
   */
  function collectVisibleVibrationSpectrumPeaks(vib, visibleIndices) {
    const peaks = [];
    let hasExplicitIntensities = false;
    const indices = Array.isArray(visibleIndices) ? visibleIndices : [];
    for (const idx of indices) {
      const mode = vib && vib.modes ? vib.modes[idx] : null;
      const rawFreq = Number(mode && mode.frequencyCm1);
      if (!Number.isFinite(rawFreq)) continue;
      const freqCm1 = Math.abs(rawFreq);
      if (!(freqCm1 >= VIBRATION_IR_MIN_FREQ_CM1)) continue;
      const parsedIntensity = getVibrationModeIrIntensity(mode);
      let intensity = parsedIntensity;
      if (Number.isFinite(parsedIntensity)) {
        hasExplicitIntensities = true;
      }
      peaks.push({
        modeIndex: idx,
        freqCm1,
        intensity,
      });
    }
    if (hasExplicitIntensities) {
      for (const p of peaks) {
        if (!Number.isFinite(p.intensity)) p.intensity = 0;
      }
    } else {
      for (const p of peaks) p.intensity = 1;
    }
    if (hasExplicitIntensities) {
      const maxExplicit = peaks.reduce((m, p) => Number.isFinite(p.intensity) ? Math.max(m, p.intensity) : m, 0);
      if (!(maxExplicit > 0)) {
        for (const p of peaks) p.intensity = 1;
        hasExplicitIntensities = false;
      }
    }
    return { peaks, hasExplicitIntensities };
  }

  /**
   * Draw the IR spectrum preview for the active vibrational payload.
   * Peaks are rendered as Gaussian-broadened sticks and the selected mode
   * is highlighted in bright orange.
   * @param {{enabled:boolean,vib?:*}} info
   * @param {{visibleIndices:number[]}=} tableState
   */
  function renderVibrationSpectrum(info, tableState = null) {
    if (!vibrationSpectrumWrap || !vibrationSpectrumCanvas) return;
    if (!(info && info.enabled && info.vib && Array.isArray(info.vib.modes) && info.vib.modes.length > 0)) {
      vibrationSpectrumWrap.style.display = 'none';
      if (vibrationSpectrumMeta) vibrationSpectrumMeta.textContent = 'IR spectrum preview';
      return;
    }
    const vib = info.vib;
    const visibleIndices = (tableState && Array.isArray(tableState.visibleIndices))
      ? tableState.visibleIndices
      : getVisibleVibrationModeIndices(vib);
    const peakData = collectVisibleVibrationSpectrumPeaks(vib, visibleIndices);
    const peaks = peakData.peaks;
    const hasExplicitIntensities = peakData.hasExplicitIntensities;

    vibrationSpectrumWrap.style.display = 'block';
    if (vibrationSpectrumMeta) {
      vibrationSpectrumMeta.textContent = hasExplicitIntensities
        ? `IR spectrum (${CM_INV_TEXT}, using parsed intensities)`
        : `IR spectrum (${CM_INV_TEXT}, relative intensities)`;
    }

    const ctx = vibrationSpectrumCanvas.getContext('2d');
    if (!ctx) return;
    const cssW = Math.max(220, Math.round(vibrationSpectrumCanvas.clientWidth || 0));
    const cssH = Math.max(88, Math.round(vibrationSpectrumCanvas.clientHeight || 128));
    const dpr = Math.max(1, Math.min(2, Number(window.devicePixelRatio) || 1));
    const pxW = Math.max(1, Math.round(cssW * dpr));
    const pxH = Math.max(1, Math.round(cssH * dpr));
    if (vibrationSpectrumCanvas.width !== pxW || vibrationSpectrumCanvas.height !== pxH) {
      vibrationSpectrumCanvas.width = pxW;
      vibrationSpectrumCanvas.height = pxH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const padL = 36;
    const padR = 10;
    const padT = 8;
    const padB = 20;
    const innerW = Math.max(1, cssW - padL - padR);
    const innerH = Math.max(1, cssH - padT - padB);

    ctx.strokeStyle = UI_PALETTE.irAxisStroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT + innerH + 0.5);
    ctx.lineTo(padL + innerW, padT + innerH + 0.5);
    ctx.stroke();

    if (peaks.length === 0) {
      ctx.fillStyle = UI_PALETTE.irTextMuted;
      ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No visible IR-active frequencies', padL + innerW * 0.5, padT + innerH * 0.58);
      if (vibrationSpectrumMeta) {
        vibrationSpectrumMeta.textContent = `IR spectrum (${CM_INV_TEXT}) unavailable for current visible modes`;
      }
      return;
    }

    let minFreq = peaks[0].freqCm1;
    let maxFreq = peaks[0].freqCm1;
    for (let i = 1; i < peaks.length; i++) {
      const f = peaks[i].freqCm1;
      if (f < minFreq) minFreq = f;
      if (f > maxFreq) maxFreq = f;
    }
    const spanRaw = Math.max(1, maxFreq - minFreq);
    const minSpan = 420;
    const span = Math.max(minSpan, spanRaw * 1.18);
    const centerFreq = 0.5 * (minFreq + maxFreq);
    const xMin = Math.max(0, centerFreq - span * 0.5);
    const xMax = xMin + span;
    const sigma = Math.max(12, Math.min(48, Math.max(VIBRATION_IR_DEFAULT_SIGMA_CM1, span * 0.04)));

    let maxIntensity = 0;
    for (const p of peaks) maxIntensity = Math.max(maxIntensity, Number(p.intensity) || 0);
    maxIntensity = Math.max(1e-8, maxIntensity);
    const normalized = peaks.map((p) => ({
      modeIndex: p.modeIndex,
      freqCm1: p.freqCm1,
      amp: Math.max(0, (Number(p.intensity) || 0) / maxIntensity),
    }));

    /**
     * Evaluate broadened intensity at one frequency coordinate.
     * @param {number} xFreq
     * @returns {number}
     */
    function spectrumAt(xFreq) {
      let y = 0;
      for (const p of normalized) {
        const z = (xFreq - p.freqCm1) / sigma;
        y += p.amp * Math.exp(-0.5 * z * z);
      }
      return y;
    }

    const ySamples = new Float32Array(innerW + 1);
    let yMax = 0;
    for (let i = 0; i <= innerW; i++) {
      const xFreq = xMin + (i / innerW) * (xMax - xMin);
      const y = spectrumAt(xFreq);
      ySamples[i] = y;
      if (y > yMax) yMax = y;
    }
    yMax = Math.max(1e-8, yMax);

    ctx.strokeStyle = UI_PALETTE.irCurve;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i <= innerW; i++) {
      const x = padL + i;
      const y = padT + innerH - (ySamples[i] / yMax) * innerH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const selected = normalized.find((p) => p.modeIndex === (vib.modeIndex | 0));
    if (selected && Number.isFinite(selected.freqCm1)) {
      const xSel = padL + ((selected.freqCm1 - xMin) / (xMax - xMin)) * innerW;
      if (xSel >= padL - 2 && xSel <= padL + innerW + 2) {
        const ySel = spectrumAt(selected.freqCm1);
        const yPx = padT + innerH - (ySel / yMax) * innerH;
        ctx.strokeStyle = UI_PALETTE.irSelectedLine;
        ctx.fillStyle = UI_PALETTE.irSelectedBand;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(xSel, padT + innerH);
        ctx.lineTo(xSel, yPx);
        ctx.stroke();

        const bandHalfFreq = Math.max(14, sigma * 0.9);
        const leftFreq = Math.max(xMin, selected.freqCm1 - bandHalfFreq);
        const rightFreq = Math.min(xMax, selected.freqCm1 + bandHalfFreq);
        const leftIdx = Math.max(0, Math.min(innerW, Math.floor(((leftFreq - xMin) / (xMax - xMin)) * innerW)));
        const rightIdx = Math.max(0, Math.min(innerW, Math.ceil(((rightFreq - xMin) / (xMax - xMin)) * innerW)));
        if (rightIdx > leftIdx) {
          ctx.beginPath();
          ctx.moveTo(padL + leftIdx, padT + innerH);
          for (let i = leftIdx; i <= rightIdx; i++) {
            const x = padL + i;
            const y = padT + innerH - (ySamples[i] / yMax) * innerH;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(padL + rightIdx, padT + innerH);
          ctx.closePath();
          ctx.fill();
        }

        ctx.fillStyle = UI_PALETTE.irSelectedText;
        ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
        ctx.textAlign = 'left';
        const selectedLabel = `${selected.freqCm1.toFixed(1)} ${CM_INV_TEXT}`;
        const textX = Math.min(padL + innerW - 92, Math.max(padL + 2, xSel + 5));
        const textY = Math.max(padT + 12, yPx - 6);
        ctx.fillText(selectedLabel, textX, textY);
      }
    }

    ctx.fillStyle = UI_PALETTE.irAxisText;
    ctx.font = '10px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(xMin)}`, padL, cssH - 6);
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round((xMin + xMax) * 0.5)}`, padL + innerW * 0.5, cssH - 6);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(xMax)} ${CM_INV_TEXT}`, padL + innerW, cssH - 6);
  }

  /**
   * Return true when a mode should be hidden by the low-frequency filter.
   * @param {*} mode
   * @returns {boolean}
   */
  function shouldHideVibrationMode(mode) {
    if (!vibrationHideSmallFrequencies) return false;
    const freq = Number(mode && mode.frequencyCm1);
    if (!Number.isFinite(freq)) return false;
    return Math.abs(freq) < VIBRATION_HIDE_SMALL_FREQ_THRESHOLD_CM1;
  }

  /**
   * Build a list of visible mode indices for the current vibration payload.
   * @param {*} vib
   * @returns {number[]}
   */
  function getVisibleVibrationModeIndices(vib) {
    if (!vib || !Array.isArray(vib.modes)) return [];
    const out = [];
    for (let i = 0; i < vib.modes.length; i++) {
      if (!shouldHideVibrationMode(vib.modes[i])) out.push(i);
    }
    return out;
  }

  /**
   * Render the clickable vibration frequency table.
   * @param {{enabled:boolean,vib?:*,modeCount?:number}=} info
   * @returns {{visibleIndices:number[],visibleCount:number,modeCount:number}}
   */
  function renderVibrationModeTable(info) {
    const emptyState = { visibleIndices: [], visibleCount: 0, modeCount: 0 };
    if (!vibrationModeTableWrap || !vibrationModeTable || !vibrationModeTableBody || !vibrationModeEmpty) return emptyState;
    if (!(info && info.enabled && info.vib && Array.isArray(info.vib.modes) && info.vib.modes.length > 0)) {
      vibrationModeTableWrap.style.display = 'none';
      vibrationModeEmpty.style.display = 'none';
      vibrationModeTableBody.innerHTML = '';
      vibrationModeTable.setAttribute('data-has-intensity', 'false');
      return emptyState;
    }
    const vib = info.vib;
    const modeCount = Math.max(0, info.modeCount | 0);
    const visibleIndices = getVisibleVibrationModeIndices(vib);
    const hasAnyIntensity = visibleIndices.some((i) => {
      const mode = vib.modes[i] || null;
      return Number.isFinite(getVibrationModeIrIntensity(mode));
    });
    vibrationModeTable.setAttribute('data-has-intensity', hasAnyIntensity ? 'true' : 'false');
    const rows = [];
    for (const i of visibleIndices) {
      const mode = vib.modes[i] || {};
      const rawLabel = (typeof mode.label === 'string' && mode.label.trim()) ? mode.label.trim() : `Mode ${i + 1}`;
      const activeClass = (i === (vib.modeIndex | 0)) ? ' active' : '';
      const freqCell = formatVibrationFrequencyCell(mode.frequencyCm1);
      const intensity = getVibrationModeIrIntensity(mode);
      const intensityCell = hasAnyIntensity ? formatVibrationIntensityCell(intensity) : '--';
      rows.push(
        `<tr class="mode-row${activeClass}" data-mode-index="${i}" title="Select ${escapeHtml(rawLabel)}">`
        + `<td><button class="vibrationPlayCell" data-action="play" data-mode-index="${i}" title="Play ${escapeHtml(rawLabel)}">${(i === (vib.modeIndex | 0) && vibrationPlaying) ? 'pause' : 'play_arrow'}</button></td>`
        + `<td>${i + 1}</td>`
        + `<td>${escapeHtml(rawLabel)}</td>`
        + `<td>${escapeHtml(freqCell)}</td>`
        + `<td class="vibrationIntensityCol">${escapeHtml(intensityCell)}</td>`
        + '</tr>'
      );
    }
    vibrationModeTableBody.innerHTML = rows.join('');
    const visibleCount = visibleIndices.length;
    vibrationModeTableWrap.style.display = visibleCount > 0 ? 'block' : 'none';
    vibrationModeEmpty.style.display = modeCount > 0 && visibleCount === 0 ? 'block' : 'none';
    if (modeCount > 0 && visibleCount === 0 && vibrationHideSmallFrequencies) {
      vibrationModeEmpty.textContent = `No visible modes: |freq| < ${VIBRATION_HIDE_SMALL_FREQ_THRESHOLD_CM1.toFixed(1)} ${CM_INV_TEXT} are hidden.`;
    } else {
      vibrationModeEmpty.textContent = 'No vibrational modes available for the active file.';
    }
    return { visibleIndices, visibleCount, modeCount };
  }

  /**
   * Update vibrational-mode controls for the active record.
   */
  function syncVibrationControls() {
    const info = getActiveVibrationInfo();
    if (vibrationToolbarSection) vibrationToolbarSection.style.display = info.enabled ? '' : 'none';
    if (vibrationPanelBtn) {
      vibrationPanelBtn.title = info.enabled
        ? 'Vibrational mode controls'
        : 'No vibrational mode data in active file';
    }
    if (vibrationRow) vibrationRow.style.display = info.enabled ? 'grid' : 'none';
    if (vibrationRow2) vibrationRow2.style.display = info.enabled ? 'grid' : 'none';
    if (vibrationSpectrumWrap) vibrationSpectrumWrap.style.display = info.enabled ? 'block' : 'none';
    if (!info.enabled) {
      renderVibrationModeTable(info);
      renderVibrationSpectrum(info);
      setVibrationPanelOpen(false);
      vibrationPlaying = false;
      vibrationLastStepMs = 0;
      if (vibrationNowPlaying) vibrationNowPlaying.textContent = 'No mode selected';
      return;
    }
    const vib = info.vib;
    const visibleIndices = getVisibleVibrationModeIndices(vib);
    const currentModeIndex = vib.modeIndex | 0;
    const hasCurrentVisible = visibleIndices.includes(currentModeIndex);
    let activeModeChanged = false;
    if (!hasCurrentVisible && visibleIndices.length > 0) {
      vib.modeIndex = visibleIndices[0];
      vib.phase = 0;
      activeModeChanged = true;
    }

    const tableState = renderVibrationModeTable(info);
    if (tableState.visibleCount <= 0) {
      vibrationPlaying = false;
      vibrationLastStepMs = 0;
      vib.phase = 0;
      applyAtomCoordinateFrame(info.vol, vib.equilibrium, info.atomCount);
      if (vibrationModeLabel) vibrationModeLabel.textContent = 'No visible mode';
      if (vibrationNowPlaying) {
        vibrationNowPlaying.textContent = vibrationHideSmallFrequencies
          ? `No visible mode (|freq| < ${VIBRATION_HIDE_SMALL_FREQ_THRESHOLD_CM1.toFixed(1)} ${CM_INV_TEXT} hidden)`
          : 'No mode selected';
      }
      setMotionPanelButtonGlyph(vibrationPlayBtn, 'play_arrow');
      if (vibrationFreqLabel) vibrationFreqLabel.innerHTML = `-- ${CM_INV_HTML}`;
      renderVibrationSpectrum(info, tableState);
      return;
    }

    if (activeModeChanged) {
      if (vibrationPlaying) vibrationLastStepMs = 0;
      else applyActiveVibrationPhase(0, { syncUi: false });
    }
    const mode = vib.modes[vib.modeIndex] || info.mode;
    const labelSuffix = (mode && typeof mode.label === 'string' && mode.label.trim())
      ? ` ${mode.label.trim()}`
      : '';
    const freq = Number(mode && mode.frequencyCm1);
    const freqText = Number.isFinite(freq) ? `${freq.toFixed(1)} ${CM_INV_TEXT}` : `-- ${CM_INV_TEXT}`;
    if (vibrationModeLabel) vibrationModeLabel.textContent = `${vib.modeIndex + 1}/${info.modeCount}${labelSuffix}`;
    if (vibrationNowPlaying) vibrationNowPlaying.textContent = `Selected: ${vib.modeIndex + 1}/${info.modeCount}${labelSuffix} • ${freqText}`;
    setMotionPanelButtonGlyph(vibrationPlayBtn, vibrationPlaying ? 'pause' : 'play_arrow');
    if (vibrationAmplitudeEl && document.activeElement !== vibrationAmplitudeEl) {
      vibrationAmplitudeEl.value = Number(vib.amplitude).toFixed(2);
    }
    if (vibrationSpeedEl && document.activeElement !== vibrationSpeedEl) {
      vibrationSpeedEl.value = Number(vib.speed).toFixed(2);
    }
    if (vibrationFreqLabel) vibrationFreqLabel.innerHTML = Number.isFinite(freq)
      ? `${freq.toFixed(1)} ${CM_INV_HTML}`
      : `-- ${CM_INV_HTML}`;
    renderVibrationSpectrum(info, tableState);
  }

  /**
   * Redraw vibration UI after the floating panel has entered layout.
   * This avoids first-open canvas stretch when initial render happens while hidden.
   * @param {number=} rafFrames
   */
  function scheduleVibrationPanelLayoutSync(rafFrames = 2) {
    const frames = Math.max(1, Math.round(Number(rafFrames) || 1));
    if (vibrationPanelLayoutRaf) {
      cancelAnimationFrame(vibrationPanelLayoutRaf);
      vibrationPanelLayoutRaf = 0;
    }
    /**
     * @param {number} remaining
     */
    const tick = (remaining) => {
      vibrationPanelLayoutRaf = requestAnimationFrame(() => {
        if (remaining > 1) {
          tick(remaining - 1);
          return;
        }
        vibrationPanelLayoutRaf = 0;
        if (!vibrationPanel || !vibrationPanel.classList.contains('open')) return;
        syncVibrationControls();
      });
    };
    tick(frames);
  }
  /**
   * Restore active vibrational displacement to equilibrium geometry.
   * @param {{syncUi?:boolean}=} options
   * @returns {boolean}
   */
  function restoreActiveVibrationEquilibrium(options = {}) {
    const info = getActiveVibrationInfo();
    if (!info.enabled) return false;
    const syncUi = options.syncUi !== false;
    const vib = info.vib;
    vib.phase = 0;
    applyAtomCoordinateFrame(info.vol, vib.equilibrium, info.atomCount);
    if (syncUi) syncVibrationControls();
    return true;
  }
  /**
   * Apply the selected vibrational mode at one phase angle.
   * @param {number} phase
   * @param {{syncUi?:boolean}=} options
   * @returns {boolean}
   */
  function applyActiveVibrationPhase(phase, options = {}) {
    const info = getActiveVibrationInfo();
    if (!info.enabled) return false;
    const syncUi = options.syncUi !== false;
    const vib = info.vib;
    const mode = info.mode;
    const wave = Math.sin(Number(phase) || 0);
    const amp = Number(vib.amplitude) || 0;
    const eq = vib.equilibrium;
    const disp = mode.displacements;
    const frame = vib.frameBuffer;
    for (let i = 0; i < frame.length; i++) {
      frame[i] = eq[i] + (amp * disp[i] * wave);
    }
    vib.phase = Number(phase) || 0;
    applyAtomCoordinateFrame(info.vol, frame, info.atomCount);
    if (syncUi) syncVibrationControls();
    return true;
  }
  /**
   * Advance active vibrational playback from wall-clock time.
   * @param {number} nowMs
   */
  function updateVibrationPlayback(nowMs) {
    const info = getActiveVibrationInfo();
    if (!info.enabled) {
      if (vibrationPlaying) {
        vibrationPlaying = false;
        vibrationLastStepMs = 0;
        syncVibrationControls();
      }
      return;
    }
    if (!vibrationPlaying) return;
    if (currentMode === MODES.EDIT) return;

    const vib = info.vib;
    const speed = Math.max(0.1, Math.min(30, Number(vib.speed) || VIBRATION_DEFAULT_SPEED));
    vib.speed = speed;
    if (vibrationLastStepMs <= 0) {
      vibrationLastStepMs = nowMs;
      return;
    }
    const dtSec = Math.max(0, Math.min(0.2, (nowMs - vibrationLastStepMs) / 1000));
    vibrationLastStepMs = nowMs;
    const nextPhase = (Number(vib.phase) || 0) + dtSec * speed * Math.PI * 2;
    applyActiveVibrationPhase(nextPhase, { syncUi: false });
  }
  /**
   * Apply one trajectory frame to active atom positions and refresh geometry transforms.
   * @param {number} frameIndex
   * @param {{syncUi?:boolean}=} options
   * @returns {boolean}
   */
  function applyTrajectoryFrame(frameIndex, options = {}) {
    const info = getActiveTrajectoryInfo();
    if (!info.enabled) return false;
    const syncUi = options.syncUi !== false;
    const traj = info.traj;
    const frame = traj.frames[Math.max(0, Math.min(info.frameCount - 1, Number(frameIndex) | 0))];
    if (!frame) return false;
    const nextIndex = Math.max(0, Math.min(info.frameCount - 1, Number(frameIndex) | 0));
    traj.frameIndex = nextIndex;
    applyAtomCoordinateFrame(info.vol, frame, info.atomCount);
    if (syncUi) syncTrajectoryControls();
    return true;
  }
  /**
   * Advance trajectory playback based on elapsed wall clock time.
   * @param {number} nowMs
   */
  function updateTrajectoryPlayback(nowMs) {
    const info = getActiveTrajectoryInfo();
    if (!info.enabled) {
      if (trajectoryPlaying) {
        trajectoryPlaying = false;
        trajectoryLastStepMs = 0;
        syncTrajectoryControls();
      }
      return;
    }
    if (!trajectoryPlaying) return;
    if (currentMode === MODES.EDIT) return;

    const traj = info.traj;
    const fps = Math.max(1, Math.min(120, Math.round(Number(traj.fps) || 12)));
    traj.fps = fps;
    const stepMs = 1000 / fps;
    if (trajectoryLastStepMs <= 0) {
      trajectoryLastStepMs = nowMs;
      return;
    }
    const elapsed = nowMs - trajectoryLastStepMs;
    if (elapsed < stepMs) return;
    const steps = Math.max(1, Math.floor(elapsed / stepMs));
    trajectoryLastStepMs += steps * stepMs;

    let next = (traj.frameIndex | 0) + steps;
    if (next >= info.frameCount) {
      if (traj.loop) next = next % info.frameCount;
      else {
        next = info.frameCount - 1;
        trajectoryPlaying = false;
        trajectoryLastStepMs = 0;
      }
    }
    applyTrajectoryFrame(next, { syncUi: true });
  }

  /**
   * Stop trajectory playback and optionally refresh trajectory controls.
   * @param {{syncUi?:boolean}=} options
   */
  function stopTrajectoryPlayback(options = {}) {
    trajectoryPlaying = false;
    trajectoryLastStepMs = 0;
    if (options.syncUi !== false) syncTrajectoryControls();
  }

  // Simple FPS meter (EMA smoothed)
  let __fpsLast = performance.now();
  let __fpsAccMs = 0;
  let __fpsFrames = 0;
  let __fpsEMA = 0;

  /**
   * Find alpha/beta render objects for split 2C rendering.
   * @returns {{alphaObject:THREE.Object3D,betaObject:THREE.Object3D}|null}
   */
  function findAlphaBetaRenderObjects() {
    let alphaObject = meshes.find(m => m && m.userData && m.userData.phaseHue && m.userData.which === 'alpha');
    let betaObject = meshes.find(m => m && m.userData && m.userData.phaseHue && m.userData.which === 'beta');
    if ((!alphaObject || !betaObject) && cloudGroup && cloudGroup.children) {
      /**
       * Find a phase object in the cloud group.
       * @param {'alpha'|'beta'} which
       * @returns {THREE.Object3D|undefined}
       */
      const findInCloud = (which) => cloudGroup.children.find(o => o && o.userData && o.userData.phaseHue && o.userData.which === which);
      if (!alphaObject) alphaObject = findInCloud('alpha');
      if (!betaObject) betaObject = findInCloud('beta');
    }
    if (!alphaObject || !betaObject) return null;
    return { alphaObject, betaObject };
  }

  /**
   * Render the active 2C alpha/beta phase split view when available.
   * @param {{cssWidth:number,cssHeight:number,bufferWidth:number,bufferHeight:number}} metrics
   * @returns {boolean}
   */
  function renderAlphaBetaSplitPass(metrics) {
    const record = volumes[currentIndex];
    const vol = record && record.vol;
    const mode = record && record.component;
    if (!(vol && vol.isTwoComponent && mode === 'alphaBetaPhase')) return false;
    const renderObjects = findAlphaBetaRenderObjects();
    if (!renderObjects) return false;
    const leftWidth = Math.max(1, Math.floor(metrics.bufferWidth / 2));
    const rightWidth = Math.max(1, metrics.bufferWidth - leftWidth);
    const cssHalfWidth = Math.max(1, metrics.cssWidth / 2);
    const { alphaObject, betaObject } = renderObjects;
    const prevAlphaVisible = alphaObject.visible;
    const prevBetaVisible = betaObject.visible;
    renderer.clear();
    renderer.setScissorTest(true);
    try {
      betaObject.visible = false;
      alphaObject.visible = true;
      renderer.setScissor(0, 0, leftWidth, metrics.bufferHeight);
      renderer.setViewport(0, 0, leftWidth, metrics.bufferHeight);
      updateActiveCameraProjection(cssHalfWidth, metrics.cssHeight);
      renderer.render(scene, camera);

      renderer.clearDepth();
      alphaObject.visible = false;
      betaObject.visible = true;
      renderer.setScissor(leftWidth, 0, rightWidth, metrics.bufferHeight);
      renderer.setViewport(leftWidth, 0, rightWidth, metrics.bufferHeight);
      updateActiveCameraProjection(cssHalfWidth, metrics.cssHeight);
      renderer.render(scene, camera);
      return true;
    } finally {
      alphaObject.visible = prevAlphaVisible;
      betaObject.visible = prevBetaVisible;
      renderer.setScissorTest(false);
      updateActiveCameraProjection(metrics.cssWidth, metrics.cssHeight);
    }
  }

  /**
   * Render the main scene into one full viewport.
   * @param {{bufferWidth:number,bufferHeight:number}} metrics
   */
  function renderMainScenePass(metrics) {
    renderer.clear();
    renderer.setViewport(0, 0, metrics.bufferWidth, metrics.bufferHeight);
    renderer.setScissorTest(false);
    renderer.render(scene, camera);
  }

  /**
   * Render the bottom-left axis overlay.
   * @param {{cssWidth:number,cssHeight:number,bufferWidth:number,bufferHeight:number}} metrics
   */
  function renderAxisOverlayPass(metrics) {
    if (!window.__showAxes__) return;
    axisGizmo.quaternion.copy(camera.quaternion).invert();
    const px = Math.max(64, Math.min(128, Math.floor(Math.min(metrics.cssWidth, metrics.cssHeight) / 5)));
    const margin = 10;
    const rect = cssRectToBufferRect(metrics, margin, margin, px, px);
    renderer.clearDepth();
    renderer.setScissorTest(true);
    renderer.setScissor(rect.x, rect.y, rect.width, rect.height);
    renderer.setViewport(rect.x, rect.y, rect.width, rect.height);
    renderer.render(axisScene, axisCamera);
    renderer.setScissorTest(false);
  }

  /**
   * Main animation loop: render scene, optional split-view, FPS meter, and axis overlay.
   */
  function render() {
    const now = performance.now();
    updateTrajectoryPlayback(now);
    updateVibrationPlayback(now);
    controls.update();
    updateEditPlaneHelpers();
    updateTrackedAtomLabelOrientation();
    updateInkOutlineThickness();
    const metrics = readRendererViewportMetrics();
    const dofTarget = beginPostprocessFrame(metrics);
    renderSceneFrame(metrics);
    endPostprocessFrame(metrics, dofTarget);

    // FPS update
    const dt = now - __fpsLast; __fpsLast = now;
    __fpsAccMs += dt; __fpsFrames += 1;
    if (__fpsAccMs >= 500) {
      const inst = (__fpsFrames * 1000) / __fpsAccMs;
      __fpsEMA = (__fpsEMA === 0) ? inst : (__fpsEMA * 0.8 + inst * 0.2);
      const el = document.getElementById('fpsValue');
      if (el) el.textContent = __fpsEMA.toFixed(1);
      __fpsAccMs = 0; __fpsFrames = 0;
    }

    renderAxisOverlayPass(metrics);

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  // --- UI wiring ---
  const fileInput = document.getElementById('fileInput');
  const openBtn = document.getElementById('openBtn');
  const newFileBtn = document.getElementById('newFileBtn');
  const duplicateFileBtn = document.getElementById('duplicateFileBtn');
  const removeFileBtn = document.getElementById('removeFileBtn');
  const fileSelect = document.getElementById('fileSelect');
  const isoInput = document.getElementById('iso');
  const autoIsoBtn = document.getElementById('autoIsoBtn');
  const opInput = document.getElementById('opacity');
  const opacityPercentEl = document.getElementById('opacityPercent');
  const posColor = document.getElementById('posColor');
  const posColorHexEl = document.getElementById('posColorHex');
  const posColorSwatchEl = document.getElementById('posColorSwatch');
  const negColor = document.getElementById('negColor');
  const negColorHexEl = document.getElementById('negColorHex');
  const negColorSwatchEl = document.getElementById('negColorSwatch');
  const bgColor = document.getElementById('bgColor');
  const bgColorHexEl = document.getElementById('bgColorHex');
  const bgColorSwatchEl = document.getElementById('bgColorSwatch');
  const toggleAtoms = document.getElementById('showAtoms');
  const toggleBonds = document.getElementById('showBonds');
  const toggleMultiBonds = document.getElementById('showMultiBonds');
  const toggleAtomLabels = document.getElementById('showAtomLabels');
  const toggleAtomLabelNumbers = document.getElementById('showAtomLabelNumbers');
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
  const saveStructureBtn = document.getElementById('saveStructureBtn');
  const surfBtn = document.getElementById('surfBtn');
  const clearBtn = document.getElementById('clearBtn');
  const helpBtn = document.getElementById('helpBtn');
  // Side panel controls
  const viewInspectorBtn = document.getElementById('viewInspectorBtn');
  const viewInspectorToggleIcon = document.getElementById('viewInspectorToggleIcon');
  const viewInspector = document.getElementById('viewInspector');
  const viewPanelBtn = document.getElementById('viewPanelBtn');
  const coordsPanelBtn = document.getElementById('coordsPanelBtn');
  const displayInspectorBtn = document.getElementById('displayInspectorBtn');
  const displayInspectorToggleIcon = document.getElementById('displayInspectorToggleIcon');
  const displayInspector = document.getElementById('displayInspector');
  const moldenToolbarSection = document.getElementById('moldenToolbarSection');
  const moldenInspectorBtn = document.getElementById('moldenInspectorBtn');
  const moldenInspectorToggleIcon = document.getElementById('moldenInspectorToggleIcon');
  const moldenInspector = document.getElementById('moldenInspector');
  const vibrationToolbarSection = document.getElementById('vibrationToolbarSection');
  const trajectoryPanelBtn = document.getElementById('trajectoryPanelBtn');
  const vibrationPanelBtn = document.getElementById('vibrationPanelBtn');
  const sidePanel = document.getElementById('sidePanel');
  const sideClose = document.getElementById('sideClose');
  const coordsPanel = document.getElementById('coordsPanel');
  const coordsPanelTitle = document.getElementById('coordsPanelTitle');
  const coordsUnitsBtn = document.getElementById('coordsUnitsBtn');
  const coordsPanelClose = document.getElementById('coordsPanelClose');
  const trajectoryPanel = document.getElementById('trajectoryPanel');
  const trajectoryResetBtn = document.getElementById('trajectoryResetBtn');
  const trajectoryPanelClose = document.getElementById('trajectoryPanelClose');
  const vibrationPanel = document.getElementById('vibrationPanel');
  const vibrationResetBtn = document.getElementById('vibrationResetBtn');
  const vibrationPanelClose = document.getElementById('vibrationPanelClose');
  const helpOverlay = document.getElementById('helpOverlay');
  const helpClose = document.getElementById('helpClose');
  const versionText = document.getElementById('versionText');
  if (versionText) versionText.textContent = APP_VERSION;
  const toolbarVersion = document.getElementById('toolbarVersion');
  if (toolbarVersion) toolbarVersion.textContent = `v${APP_VERSION}`;
  const emptyStateVersion = document.getElementById('emptyStateVersion');
  if (emptyStateVersion) emptyStateVersion.textContent = `v${APP_VERSION}`;
  const coordsContent = document.getElementById('coordsContent');
  const pubchemMetaWrap = document.getElementById('pubchemMetaWrap');
  const pubchemMetaContent = document.getElementById('pubchemMetaContent');
  const copyXYZBtn = document.getElementById('copyXYZ');
  const downloadXYZBtn = document.getElementById('downloadXYZ');
  // View controls
  const shiftX = document.getElementById('shiftX');
  const shiftY = document.getElementById('shiftY');
  const shiftZ = document.getElementById('shiftZ');
  const centerMassBtn = document.getElementById('centerMassBtn');
  const alignInertiaBtn = document.getElementById('alignInertiaBtn');
  const projectionModeBtn = document.getElementById('projectionModeBtn');
  const projectionModeLabel = document.getElementById('projectionModeLabel');
  const projectionModeState = document.getElementById('projectionModeState');
  const viewAxisXBtn = document.getElementById('viewAxisXBtn');
  const viewAxisYBtn = document.getElementById('viewAxisYBtn');
  const viewAxisZBtn = document.getElementById('viewAxisZBtn');
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
  const trajectoryRow = document.getElementById('trajectoryRow');
  const trajectoryRow2 = document.getElementById('trajectoryRow2');
  const trajectoryPlayBtn = document.getElementById('trajectoryPlayBtn');
  const trajectoryNowPlaying = document.getElementById('trajectoryNowPlaying');
  const trajectoryFrameEl = document.getElementById('trajectoryFrame');
  const trajectoryFrameLabel = document.getElementById('trajectoryFrameLabel');
  const trajectoryFpsEl = document.getElementById('trajectoryFps');
  const trajectoryLoopEl = document.getElementById('trajectoryLoop');
  const vibrationRow = document.getElementById('vibrationRow');
  const vibrationRow2 = document.getElementById('vibrationRow2');
  const vibrationHideLowFreqEl = document.getElementById('vibrationHideLowFreq');
  const vibrationPlayBtn = document.getElementById('vibrationPlayBtn');
  const vibrationNowPlaying = document.getElementById('vibrationNowPlaying');
  const vibrationModeLabel = document.getElementById('vibrationModeLabel');
  const vibrationAmplitudeEl = document.getElementById('vibrationAmplitude');
  const vibrationSpeedEl = document.getElementById('vibrationSpeed');
  const vibrationFreqLabel = document.getElementById('vibrationFreqLabel');
  const vibrationSpectrumWrap = document.getElementById('vibrationSpectrumWrap');
  const vibrationSpectrumCanvas = document.getElementById('vibrationSpectrumCanvas');
  const vibrationSpectrumMeta = document.getElementById('vibrationSpectrumMeta');
  const vibrationModeTable = document.getElementById('vibrationModeTable');
  const vibrationModeTableWrap = document.getElementById('vibrationModeTableWrap');
  const vibrationModeTableBody = document.getElementById('vibrationModeTableBody');
  const vibrationModeEmpty = document.getElementById('vibrationModeEmpty');
  if (toggleMultiBonds) showMultiBonds = !!toggleMultiBonds.checked;
  if (toggleAtomLabels) showAtomLabels = !!toggleAtomLabels.checked;
  if (toggleAtomLabelNumbers) showAtomLabelNumbers = !!toggleAtomLabelNumbers.checked;
  syncAtomLabelNumberToggleState();
  const viewReset = document.getElementById('viewReset');
  const styleSelect = document.getElementById('styleSelect');
  const pointCameraComBtn = document.getElementById('pointCameraComBtn');
  const moleculeStyleSel = document.getElementById('moleculeStyle');
  const rowGlossyBond = document.getElementById('rowGlossyBond');
  const glossyBondRadiusEl = document.getElementById('glossyBondRadius');
  const moleculeFogToggleEl = document.getElementById('moleculeFogToggle');
  const rowMoleculeFogDepth = document.getElementById('rowMoleculeFogDepth');
  const moleculeFogDepthEl = document.getElementById('moleculeFogDepth');
  const moleculeFogDepthValueEl = document.getElementById('moleculeFogDepthValue');
  const moleculeInkToggleEl = document.getElementById('moleculeInkToggle');
  const moleculeAtomOpacityEl = document.getElementById('moleculeAtomOpacity');
  const moleculeBondOpacityEl = document.getElementById('moleculeBondOpacity');
  const moleculeBlackbodyToggleEl = document.getElementById('moleculeBlackbodyToggle');
  const rowBlackbodyColors = document.getElementById('rowBlackbodyColors');
  const blackbodyColdColorEl = document.getElementById('blackbodyColdColor');
  const blackbodyColdHexEl = document.getElementById('blackbodyColdHex');
  const blackbodyColdSwatchEl = document.getElementById('blackbodyColdSwatch');
  const blackbodyHotColorEl = document.getElementById('blackbodyHotColor');
  const blackbodyHotHexEl = document.getElementById('blackbodyHotHex');
  const blackbodyHotSwatchEl = document.getElementById('blackbodyHotSwatch');
  const dofToggleEl = document.getElementById('dofToggle');
  const rowDofFocusMode = document.getElementById('rowDofFocusMode');
  const dofFocusModeEl = document.getElementById('dofFocusMode');
  const rowDofFocusDistance = document.getElementById('rowDofFocusDistance');
  const dofFocusDistanceEl = document.getElementById('dofFocusDistance');
  const rowDofFocusRange = document.getElementById('rowDofFocusRange');
  const dofFocusRangeEl = document.getElementById('dofFocusRange');
  const rowDofBlurAmount = document.getElementById('rowDofBlurAmount');
  const dofBlurAmountEl = document.getElementById('dofBlurAmount');
  const schemeSelect = document.getElementById('schemeSelect');
  const renderModeSel = document.getElementById('renderMode');
  const twoComponentModeRow = document.getElementById('twoComponentModeRow');
  const twoComponentModeSelect = document.getElementById('twoComponentModeSelect');
  const phaseWheelEl = document.getElementById('phaseWheel');
  const moldenMoRow = document.getElementById('moldenMoRow');
  const moldenMoSelect = document.getElementById('moldenMoSelect');
  const moldenMoSummary = document.getElementById('moldenMoSummary');
  const moldenGridRow = document.getElementById('moldenGridRow');
  const moldenGridPaddingRow = document.getElementById('moldenGridPaddingRow');
  const moldenGridStepEl = document.getElementById('moldenGridStep');
  const moldenGridPaddingEl = document.getElementById('moldenGridPadding');
  const moldenGridSummary = document.getElementById('moldenGridSummary');
  const cloudTypeSel = document.getElementById('cloudType');
  const cloudStrideEl = document.getElementById('cloudStride');
  const cloudAlphaEl = document.getElementById('cloudAlpha');
  const axisLockEl = document.getElementById('axisLock');
  const axisXBtn = document.getElementById('axisX');
  const axisYBtn = document.getElementById('axisY');
  const axisZBtn = document.getElementById('axisZ');
  const editAdaptiveMenuEl = document.getElementById('editAdaptiveMenu');
  const editAdaptiveSelectionBtn = document.getElementById('editAdaptiveSelectionBtn');
  const editAdaptiveSelectionMetaEl = document.getElementById('editAdaptiveSelectionMeta');
  const editAdaptiveMoveBtn = document.getElementById('editAdaptiveMoveBtn');
  const editAdaptiveAddAtomBtn = document.getElementById('editAdaptiveAddAtomBtn');
  const editAdaptiveAddAtomMetaEl = document.getElementById('editAdaptiveAddAtomMeta');
  const editAdaptiveAddFragmentBtn = document.getElementById('editAdaptiveAddFragmentBtn');
  const editAdaptiveAddFragmentMetaEl = document.getElementById('editAdaptiveAddFragmentMeta');
  const editAdaptiveAddMoleculeBtn = document.getElementById('editAdaptiveAddMoleculeBtn');
  const editAdaptiveAddMoleculeMetaEl = document.getElementById('editAdaptiveAddMoleculeMeta');
  const editAdaptiveBondBtn = document.getElementById('editAdaptiveBondBtn');
  const editAdaptiveBondMetaEl = document.getElementById('editAdaptiveBondMeta');
  const editAdaptiveTransformBtn = document.getElementById('editAdaptiveTransformBtn');
  const editAdaptiveTransformMetaEl = document.getElementById('editAdaptiveTransformMeta');
  const editAdaptiveDeleteBtn = document.getElementById('editAdaptiveDeleteBtn');
  const editAdaptiveAddAtomPopoverEl = document.getElementById('editAdaptiveAddAtomPopover');
  const editAdaptiveAddFragmentPopoverEl = document.getElementById('editAdaptiveAddFragmentPopover');
  const editAdaptiveAddMoleculePopoverEl = document.getElementById('editAdaptiveAddMoleculePopover');
  const editAdaptiveTransformPopoverEl = document.getElementById('editAdaptiveTransformPopover');
  const editAddAtomOperatorPanelEl = document.getElementById('editAddAtomOperatorPanel');
  const editAddAtomOperatorHeaderEl = document.getElementById('editAddAtomOperatorHeader');
  const editAddAtomOperatorChevronEl = document.getElementById('editAddAtomOperatorChevron');
  const editAddAtomOperatorLabelEl = document.getElementById('editAddAtomOperatorLabel');
  const editAddAtomOperatorXEl = document.getElementById('editAddAtomOperatorX');
  const editAddAtomOperatorYEl = document.getElementById('editAddAtomOperatorY');
  const editAddAtomOperatorZEl = document.getElementById('editAddAtomOperatorZ');
  const editAddMoleculeOperatorPanelEl = document.getElementById('editAddMoleculeOperatorPanel');
  const editAddMoleculeOperatorHeaderEl = document.getElementById('editAddMoleculeOperatorHeader');
  const editAddMoleculeOperatorChevronEl = document.getElementById('editAddMoleculeOperatorChevron');
  const editAddMoleculeOperatorLabelEl = document.getElementById('editAddMoleculeOperatorLabel');
  const editAddMoleculeOperatorXEl = document.getElementById('editAddMoleculeOperatorX');
  const editAddMoleculeOperatorYEl = document.getElementById('editAddMoleculeOperatorY');
  const editAddMoleculeOperatorZEl = document.getElementById('editAddMoleculeOperatorZ');
  const editAddMoleculeOperatorRotXEl = document.getElementById('editAddMoleculeOperatorRotX');
  const editAddMoleculeOperatorRotYEl = document.getElementById('editAddMoleculeOperatorRotY');
  const editAddMoleculeOperatorRotZEl = document.getElementById('editAddMoleculeOperatorRotZ');
  const editAddMoleculeOperatorAlignXBtn = document.getElementById('editAddMoleculeOperatorAlignX');
  const editAddMoleculeOperatorAlignYBtn = document.getElementById('editAddMoleculeOperatorAlignY');
  const editAddMoleculeOperatorAlignZBtn = document.getElementById('editAddMoleculeOperatorAlignZ');
  const bondOrderPopupEl = document.getElementById('bondOrderPopup');
  const bondOrderPopupButtonsEl = document.getElementById('bondOrderPopupButtons');
  const editToolboxEl = document.getElementById('editToolbox');
  const editToolSelectBtn = document.getElementById('editToolSelectBtn');
  const editToolMoveBtn = document.getElementById('editToolMoveBtn');
  const editToolAddBtn = document.getElementById('editToolAddBtn');
  const editToolBondBtn = document.getElementById('editToolBondBtn');
  const editToolTransformBtn = document.getElementById('editToolTransformBtn');
  const editToolDeleteBtn = document.getElementById('editToolDeleteBtn');
  const editAddPaneEl = document.getElementById('editAddPane');
  const editBondPaneEl = document.getElementById('editBondPane');
  const editTransformPaneEl = document.getElementById('editTransformPane');
  const editBondOrderEl = document.getElementById('editBondOrder');
  const editBondQuickEl = document.getElementById('editBondQuick');
  const editBondActionEl = document.getElementById('editBondAction');
  const editBondCurrentEl = document.getElementById('editBondCurrent');
  const editTransformScopeEl = document.getElementById('editTransformScope');
  const editTransformModeEl = document.getElementById('editTransformMode');
  const editTransformCleanupAutoEl = document.getElementById('editTransformCleanupAuto');
  const editTransformCurrentEl = document.getElementById('editTransformCurrent');
  const editAddModeAtomBtn = document.getElementById('editAddModeAtomBtn');
  const editAddModeFragmentBtn = document.getElementById('editAddModeFragmentBtn');
  const editAddModeMoleculeBtn = document.getElementById('editAddModeMoleculeBtn');
  const editAddAtomPaneEl = document.getElementById('editAddAtomPane');
  const editAddFragmentPaneEl = document.getElementById('editAddFragmentPane');
  const editAddMoleculePaneEl = document.getElementById('editAddMoleculePane');
  const editAddSearchEl = document.getElementById('editAddSearch');
  const editAddSuggestionsEl = document.getElementById('editAddSuggestions');
  const editAddQuickEl = document.getElementById('editAddQuick');
  const editAddCurrentEl = document.getElementById('editAddCurrent');
  const editFragmentSearchEl = document.getElementById('editFragmentSearch');
  const editFragmentSuggestionsEl = document.getElementById('editFragmentSuggestions');
  const editFragmentQuickEl = document.getElementById('editFragmentQuick');
  const editFragmentAttachPolicyEl = document.getElementById('editFragmentAttachPolicy');
  const editFragmentCurrentEl = document.getElementById('editFragmentCurrent');
  const editCleanupAutoEl = document.getElementById('editCleanupAuto');
  const editCleanupBondLengthEl = document.getElementById('editCleanupBondLength');
  const editCleanupOverlapEl = document.getElementById('editCleanupOverlap');
  const editCleanupStrengthEl = document.getElementById('editCleanupStrength');
  const editCleanupStrengthValueEl = document.getElementById('editCleanupStrengthValue');
  const editCleanupApplyBtn = document.getElementById('editCleanupApplyBtn');
  const editMoleculeSearchEl = document.getElementById('editMoleculeSearch');
  const editMoleculeSuggestionsEl = document.getElementById('editMoleculeSuggestions');
  const editMoleculeQuickEl = document.getElementById('editMoleculeQuick');
  const editMoleculeCurrentEl = document.getElementById('editMoleculeCurrent');
  const editMoleculeAlignXBtn = document.getElementById('editMoleculeAlignXBtn');
  const editMoleculeAlignYBtn = document.getElementById('editMoleculeAlignYBtn');
  const editMoleculeAlignZBtn = document.getElementById('editMoleculeAlignZBtn');
  const shortcutRibbon = document.getElementById('shortcutRibbon');
  const hintEl = document.getElementById('hint');
  const emptyStateEl = document.getElementById('emptyState');
  const emptyStateCardEl = document.getElementById('emptyStateCard');
  const emptyStateDropZoneEl = document.getElementById('emptyStateDropZone');
  const emptyStateOpenBtn = document.getElementById('emptyStateOpenBtn');
  const emptyStateSampleBtn = document.getElementById('emptyStateSampleBtn');
  const emptyStateMethaneBtn = document.getElementById('emptyStateMethaneBtn');
  const emptyState2cBtn = document.getElementById('emptyState2cBtn');
  const pubchemQueryInput = document.getElementById('pubchemQuery');
  const pubchemLoadBtn = document.getElementById('pubchemLoadBtn');
  const pubchemSuggestionsEl = document.getElementById('pubchemSuggestions');
  const toolbarEl = document.getElementById('toolbar');
  const toolbarTooltipEl = document.getElementById('toolbarTooltip');
  const toolbarCollapseBtn = document.getElementById('toolbarCollapseBtn');
  const toolbarShowBtn = document.getElementById('toolbarShowBtn');
  const modeDisplayBtn = document.getElementById('modeDisplayBtn');
  const modeMeasureBtn = document.getElementById('modeMeasureBtn');
  const modeEditBtn = document.getElementById('modeEditBtn');
  const brandEmojiEl = document.getElementById('brandEmoji');
  const surfaceHoverLabelEl = (() => {
    const el = document.createElement('div');
    el.id = 'surfaceHoverLabel';
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, {
      position: 'fixed',
      left: '-9999px',
      top: '-9999px',
      maxWidth: '240px',
      padding: '7px 10px',
      borderRadius: '10px',
      background: 'rgba(16, 22, 34, 0.92)',
      color: '#edf4ff',
      border: '1px solid rgba(134, 158, 194, 0.28)',
      boxShadow: '0 8px 22px rgba(4, 8, 16, 0.28)',
      font: '600 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
      letterSpacing: '0.01em',
      pointerEvents: 'none',
      zIndex: '1700',
      whiteSpace: 'nowrap',
      opacity: '0',
      transition: 'opacity 80ms ease',
    });
    document.body.appendChild(el);
    return el;
  })();
  let toolbarTooltipAnchorEl = null;
  let global2CComponentMode = DEFAULT_2C_COMPONENT_MODE;
  if (twoComponentModeSelect) twoComponentModeSelect.value = global2CComponentMode;

  /**
   * Build one compact option label for a parsed Molden molecular orbital.
   * @param {*} mo
   * @param {number} index
   * @returns {string}
   */
  function formatMoldenMoOptionLabel(mo, index) {
    const parts = [`MO ${index + 1}`];
    if (mo && typeof mo.symmetry === 'string' && mo.symmetry.trim()) parts.push(mo.symmetry.trim());
    if (mo && Number.isFinite(mo.energy)) parts.push(`E=${mo.energy.toFixed(3)}`);
    if (mo && Number.isFinite(mo.occupation)) parts.push(`occ=${mo.occupation.toFixed(2)}`);
    return parts.join(' • ');
  }

  /**
   * Normalize Molden spin text for compact UI display.
   * @param {*} spin
   * @returns {string}
   */
  function formatMoldenSpinLabel(spin) {
    const raw = (typeof spin === 'string') ? spin.trim().toLowerCase() : '';
    if (raw === 'alpha' || raw === 'a') return 'α';
    if (raw === 'beta' || raw === 'b') return 'β';
    return (typeof spin === 'string') ? spin.trim() : '';
  }

  /**
   * Build one short summary line for the selected Molden molecular orbital.
   * @param {*} mo
   * @param {number} moCount
   * @param {number} basisCount
   * @returns {string}
   */
  function formatMoldenMoSummary(mo, moCount, basisCount) {
    if (!mo) return `${moCount} orbitals`;
    const parts = [];
    const spinLabel = formatMoldenSpinLabel(mo.spin);
    if (spinLabel) parts.push(`Spin ${spinLabel}`);
    if (Number.isFinite(mo.energy)) parts.push(`E ${mo.energy.toFixed(3)}`);
    if (Number.isFinite(mo.occupation)) parts.push(`Occ ${mo.occupation.toFixed(2)}`);
    return parts.join(' • ');
  }

  /**
   * Clamp Molden grid spacing to the supported UI range.
   * @param {*} value
   * @returns {number}
   */
  function normalizeMoldenGridStepAng(value) {
    return Math.max(0.12, Math.min(1.20, asFiniteNumber(value, MOLDEN_GRID_TARGET_STEP_ANG)));
  }

  /**
   * Clamp Molden grid padding to the supported UI range.
   * @param {*} value
   * @returns {number}
   */
  function normalizeMoldenGridPaddingAng(value) {
    return Math.max(0.5, Math.min(8.0, asFiniteNumber(value, MOLDEN_GRID_PADDING_ANG)));
  }

  /**
   * Read one record's Molden grid settings with defaults.
   * @param {*} record
   * @returns {{stepAng:number,paddingAng:number}}
   */
  function getMoldenGridSettings(record) {
    return {
      stepAng: normalizeMoldenGridStepAng(record && record.moldenGridStepAng),
      paddingAng: normalizeMoldenGridPaddingAng(record && record.moldenGridPaddingAng),
    };
  }

  /**
   * Build one compact summary of the active Molden orbital grid.
   * @param {*} record
   * @returns {string}
   */
  function formatMoldenGridSummary(record) {
    const vol = record && record.vol;
    if (!vol || vol.kind !== 'molden') return '';
    let spec = null;
    try {
      spec = buildMoldenGridSpec(vol, getMoldenGridSettings(record));
    } catch {
      spec = null;
    }
    if (!spec || !Array.isArray(spec.nxyz)) return '';
    const [nx, ny, nz] = spec.nxyz;
    return `Grid ${nx}×${ny}×${nz} • ${(nx * ny * nz).toLocaleString()} points`;
  }

  /**
   * Sync Molden MO controls for the active record.
   * @param {*} record
   */
  function updateMoldenMoControls(record) {
    if (!moldenMoRow || !moldenMoSelect || !moldenMoSummary || !moldenGridRow || !moldenGridPaddingRow || !moldenGridStepEl || !moldenGridPaddingEl || !moldenGridSummary) return;
    const vol = record && record.vol;
    const molden = vol && vol.kind === 'molden' && vol.molden ? vol.molden : null;
    if (!molden || !Array.isArray(molden.mos) || molden.mos.length === 0) {
      if (moldenToolbarSection) moldenToolbarSection.style.display = 'none';
      setMoldenInspectorOpen(false);
      moldenMoRow.style.display = 'none';
      moldenGridRow.style.display = 'none';
      moldenGridPaddingRow.style.display = 'none';
      moldenMoSelect.innerHTML = '';
      moldenMoSummary.textContent = '';
      moldenGridSummary.textContent = '';
      return;
    }
    if (moldenToolbarSection) moldenToolbarSection.style.display = '';
    moldenMoRow.style.display = 'grid';
    moldenGridRow.style.display = 'grid';
    moldenGridPaddingRow.style.display = 'grid';
    const moCount = molden.mos.length;
    const basisCount = Number.isFinite(molden.basisCount) ? molden.basisCount : 0;
    let selectedIndex = Number.isInteger(record.moldenMoIndex) ? record.moldenMoIndex : 0;
    if (selectedIndex < 0 || selectedIndex >= moCount) selectedIndex = 0;
    record.moldenMoIndex = selectedIndex;
    moldenMoSelect.innerHTML = '';
    for (let i = 0; i < moCount; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = formatMoldenMoOptionLabel(molden.mos[i], i);
      moldenMoSelect.appendChild(opt);
    }
    moldenMoSelect.value = String(selectedIndex);
    moldenMoSelect.title = 'Select one molecular orbital parsed from the Molden file for surface/cloud rendering.';
    moldenMoSummary.textContent = formatMoldenMoSummary(molden.mos[selectedIndex], moCount, basisCount);
    const gridSettings = getMoldenGridSettings(record);
    moldenGridStepEl.value = gridSettings.stepAng.toFixed(2);
    moldenGridPaddingEl.value = gridSettings.paddingAng.toFixed(1);
    moldenGridSummary.textContent = formatMoldenGridSummary(record);
  }

  const triggerOpenFiles = () => fileInput.click();
  openBtn.onclick = triggerOpenFiles;
  if (newFileBtn) {
    newFileBtn.onclick = () => {
      const record = createNewEditableVolumeRecord();
      rebuildScene({ preserveView: true });
      setHintMessage(`Created ${record.name}.`);
    };
  }

  /**
   * Rebuild derived fields on one cloned volume.
   * @param {*} vol
   * @returns {*}
   */
  function rehydrateClonedVolume(vol) {
    return rehydrateClonedVolumeCore(vol, { ensureVolumeSchema });
  }

  /**
   * Build a unique duplicate file name preserving the original extension.
   * @param {string} name
   * @returns {string}
   */
  function buildDuplicateVolumeName(name) {
    const raw = String(name || '').trim() || 'untitled.xyz';
    const m = /^(.*?)(\.[^.]*)?$/.exec(raw) || [];
    const stem = (m[1] && m[1].trim()) || 'untitled';
    const ext = m[2] || '';
    return getUniqueVolumeName(`${stem} copy${ext}`);
  }

  /**
   * Sync the active-file selector and file action enablement with `currentIndex`.
   */
  function syncActiveVolumeControls() {
    refreshFileSelect();
    if (!fileSelect) return;
    if (currentIndex >= 0 && fileSelect.options.length > currentIndex) {
      fileSelect.value = String(currentIndex);
    } else if (currentIndex < 0) {
      fileSelect.value = '';
    }
  }

  /**
   * Clamp one candidate active-file index against the current volume list.
   * Returns `-1` when no loaded file exists.
   * @param {*} index
   * @returns {number}
   */
  function normalizeActiveVolumeIndex(index) {
    if (!Array.isArray(volumes) || volumes.length === 0) return -1;
    const numeric = Number(index);
    if (!Number.isFinite(numeric)) {
      const fallback = Number.isFinite(currentIndex) ? currentIndex : 0;
      return Math.max(0, Math.min(fallback, volumes.length - 1));
    }
    return Math.max(0, Math.min(Math.trunc(numeric), volumes.length - 1));
  }

  /**
   * Activate one loaded record and synchronize scene/UI state.
   * @param {*} index
   * @param {{preserveView?:boolean,rebuild?:boolean,skipAutoIso?:boolean,clearTransient?:boolean,clearSceneWhenEmpty?:boolean}=} options
   * @returns {number}
   */
  function activateVolumeIndex(index, options = {}) {
    const preserveView = !!options.preserveView;
    const shouldRebuild = options.rebuild !== false;
    const skipAutoIso = !!options.skipAutoIso;
    const clearTransient = options.clearTransient !== false;
    const clearSceneWhenEmpty = !!options.clearSceneWhenEmpty;
    if (addAtomOperatorSession) finalizeAddAtomOperatorSession({ announce: false });
    if (clearTransient) clearTransientInteractionState();
    currentIndex = normalizeActiveVolumeIndex(index);
    syncActiveVolumeControls();
    if (currentIndex >= 0 && volumes[currentIndex]) {
      if (shouldRebuild) {
        rebuildScene({ preserveView, skipAutoIso });
      } else {
        updateSidePanel();
        updateEmptyStateVisibility();
      }
      return currentIndex;
    }
    if (clearSceneWhenEmpty) clearSceneMeshes();
    updateSidePanel();
    updateEmptyStateVisibility();
    return -1;
  }

  /**
   * Duplicate the active file record and make the copy active.
   */
  function duplicateActiveVolumeRecord() {
    const record = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null;
    if (!record || !record.vol) {
      setHintMessage('No active file to duplicate.');
      return;
    }
    const duplicate = Object.assign({}, cloneStructuredData(record), {
      name: buildDuplicateVolumeName(record.name),
      isSample: false,
    });
    duplicate.vol = rehydrateClonedVolume(cloneStructuredData(record.vol));
    volumes.push(duplicate);
    activateVolumeIndex(volumes.length - 1, { preserveView: true });
    setHintMessage(`Duplicated ${record.name} as ${duplicate.name}.`);
  }

  /**
   * Remove the active file record.
   */
  function removeActiveVolumeRecord() {
    const record = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null;
    if (!record) {
      setHintMessage('No active file to remove.');
      return;
    }
    const removedName = String(record.name || 'file');
    if (addAtomOperatorSession && addAtomOperatorSession.record === record) {
      addAtomOperatorSession = null;
      updateAddAtomOperatorUi();
    } else if (addAtomOperatorSession) {
      finalizeAddAtomOperatorSession({ announce: false });
    }
    clearTransientInteractionState();
    volumes.splice(currentIndex, 1);
    pruneEditHistory();
    if (volumes.length === 0) {
      activateVolumeIndex(-1, { rebuild: false, clearSceneWhenEmpty: true });
      setNavigationHint(HINT_START, { includeStyles: true });
      setHintMessage(`Removed ${removedName}.`);
      return;
    }
    activateVolumeIndex(currentIndex, { preserveView: true });
    setHintMessage(`Removed ${removedName}.`);
  }

  if (duplicateFileBtn) duplicateFileBtn.onclick = () => duplicateActiveVolumeRecord();
  if (removeFileBtn) removeFileBtn.onclick = () => removeActiveVolumeRecord();
  if (emptyStateOpenBtn) emptyStateOpenBtn.onclick = triggerOpenFiles;
  if (emptyStateSampleBtn) {
    emptyStateSampleBtn.onclick = async () => {
      const ok = await loadSampleCube();
      if (!ok) setHintMessage('Could not load sample.cube. Check assets/data/sample.cube.');
    };
  }
  if (emptyStateMethaneBtn) {
    emptyStateMethaneBtn.onclick = async () => {
      const ok = await loadBundledVolumeSet([
        './assets/data/methane/canonical_1.cube',
        './assets/data/methane/canonical_2.cube',
        './assets/data/methane/canonical_3.cube',
        './assets/data/methane/canonical_4.cube',
        './assets/data/methane/localized_1.cube',
        './assets/data/methane/localized_2.cube',
        './assets/data/methane/localized_3.cube',
        './assets/data/methane/localized_4.cube',
      ], 'methane valence orbitals');
      if (!ok) setHintMessage('Could not load methane valence orbitals. Check assets/data/methane.');
    };
  }
  if (emptyState2cBtn) {
    emptyState2cBtn.onclick = async () => {
      const ok = await loadBundledVolumeSet([
        './assets/data/2ccubes/orbital_0.2ccube',
        './assets/data/2ccubes/orbital_1.2ccube',
        './assets/data/2ccubes/orbital_2.2ccube',
        './assets/data/2ccubes/orbital_3.2ccube',
        './assets/data/2ccubes/orbital_4.2ccube',
        './assets/data/2ccubes/orbital_5.2ccube',
        './assets/data/2ccubes/orbital_6.2ccube',
        './assets/data/2ccubes/orbital_7.2ccube',
        './assets/data/2ccubes/orbital_8.2ccube',
      ], '2-component cube set');
      if (!ok) setHintMessage('Could not load 2-component cube set. Check assets/data/2ccubes.');
    };
  }
  // Toggle surface rendering button
  /**
   * Synchronize surface toggle UI state.
   */
  const updateSurfBtn = () => {
    if (!surfBtn) return;
    const isCheckbox = typeof surfBtn.type === 'string' && surfBtn.type.toLowerCase() === 'checkbox';
    if (isCheckbox) {
      surfBtn.checked = !!showSurfaces;
      surfBtn.title = 'Toggle iso-surface rendering';
      return;
    }
    surfBtn.textContent = showSurfaces ? 'Hide Surfaces' : 'Show Surfaces';
  };
  updateSurfBtn();

  /**
   * Sync opacity readout text (`NN%`) beside the surface opacity slider.
   */
  function updateOpacityPercentLabel() {
    if (!opacityPercentEl) return;
    const raw = parseFloat((opInput && opInput.value) || '1');
    const clamped = Math.max(0.05, Math.min(1, Number.isFinite(raw) ? raw : 1));
    opacityPercentEl.textContent = `${Math.round(clamped * 100)}%`;
  }
  updateOpacityPercentLabel();

  /**
   * Synchronize custom color picker chips (swatch + uppercase hex text).
   */
  function syncColorPickerFields() {
    /** @type {Array<[HTMLInputElement|null, HTMLElement|null, HTMLElement|null]>} */
    const fields = [
      [posColor, posColorHexEl, posColorSwatchEl],
      [negColor, negColorHexEl, negColorSwatchEl],
      [bgColor, bgColorHexEl, bgColorSwatchEl],
      [blackbodyColdColorEl, blackbodyColdHexEl, blackbodyColdSwatchEl],
      [blackbodyHotColorEl, blackbodyHotHexEl, blackbodyHotSwatchEl],
    ];
    for (const [inputEl, hexEl, swatchEl] of fields) {
      if (!inputEl) continue;
      const hex = String(inputEl.value || UI_PALETTE.black).replace('#', '').toUpperCase();
      if (hexEl) hexEl.textContent = hex;
      if (swatchEl) swatchEl.style.backgroundColor = inputEl.value || UI_PALETTE.black;
    }
  }
  syncColorPickerFields();

  /**
   * Format one isovalue for compact display in the numeric input.
   * @param {number} value
   * @returns {string}
   */
  function formatIsoInputValue(value) {
    const v = Math.max(0, Number.isFinite(value) ? value : 0);
    return v.toFixed(4).replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '');
  }

  /**
   * Check whether one parsed record provides a valid volumetric grid.
   * @param {*} vol
   * @returns {boolean}
   */
  function hasVolumetricGrid(vol) {
    return !!(vol
      && Array.isArray(vol.nxyz)
      && vol.nxyz[0] > 0
      && vol.nxyz[1] > 0
      && vol.nxyz[2] > 0
      && typeof vol.idx === 'function');
  }

  /**
   * Reset Molden-generated grid fields so the record behaves like an atom-only structure.
   * @param {*} vol
   */
  function clearMoldenGrid(vol) {
    if (!vol || vol.kind !== 'molden') return;
    vol.origin = [0, 0, 0];
    vol.nxyz = [0, 0, 0];
    vol.axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    vol.data = new Float32Array(0);
    vol.idx = () => 0;
  }

  /**
   * Build one compact atom-position signature for Molden grid caching.
   * @param {*} vol
   * @returns {string}
   */
  function buildMoldenAtomSignature(vol) {
    if (!vol || !Array.isArray(vol.atoms)) return 'empty';
    const scale = vol.units === 'angstrom' ? 1 : BOHR_TO_ANG;
    return vol.atoms.map((atom) => {
      const x = (Number(atom && atom.x) || 0) * scale;
      const y = (Number(atom && atom.y) || 0) * scale;
      const z = (Number(atom && atom.z) || 0) * scale;
      return `${atom && atom.Z ? atom.Z : 0}:${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    }).join('|');
  }

  /**
   * Build one regular Cartesian grid around the active Molden geometry.
   * Grid coordinates are stored in bohr to match existing scalar-field paths.
   * @param {*} vol
   * @returns {{origin:number[],axes:number[][],nxyz:number[],stepBohr:number,stepAng:number}}
   */
  function buildMoldenGridSpec(vol, settings = null) {
    const atoms = Array.isArray(vol && vol.atoms) ? vol.atoms : [];
    const gridSettings = settings || getMoldenGridSettings(null);
    const paddingAng = normalizeMoldenGridPaddingAng(gridSettings.paddingAng);
    const requestedStepAng = normalizeMoldenGridStepAng(gridSettings.stepAng);
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const atom of atoms) {
      const p = atomUnitsToAng(vol, atom);
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.z < minZ) minZ = p.z;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
      if (p.z > maxZ) maxZ = p.z;
    }
    if (!Number.isFinite(minX)) {
      minX = minY = minZ = -paddingAng;
      maxX = maxY = maxZ = paddingAng;
    }
    minX -= paddingAng;
    minY -= paddingAng;
    minZ -= paddingAng;
    maxX += paddingAng;
    maxY += paddingAng;
    maxZ += paddingAng;

    let stepAng = requestedStepAng;
    let nx = Math.max(MOLDEN_GRID_MIN_AXIS, Math.min(MOLDEN_GRID_MAX_AXIS, Math.ceil((maxX - minX) / stepAng) + 1));
    let ny = Math.max(MOLDEN_GRID_MIN_AXIS, Math.min(MOLDEN_GRID_MAX_AXIS, Math.ceil((maxY - minY) / stepAng) + 1));
    let nz = Math.max(MOLDEN_GRID_MIN_AXIS, Math.min(MOLDEN_GRID_MAX_AXIS, Math.ceil((maxZ - minZ) / stepAng) + 1));
    let total = nx * ny * nz;
    if (total > MOLDEN_GRID_MAX_TOTAL_POINTS) {
      const scale = Math.cbrt(total / MOLDEN_GRID_MAX_TOTAL_POINTS);
      stepAng *= scale;
      nx = Math.max(MOLDEN_GRID_MIN_AXIS, Math.min(MOLDEN_GRID_MAX_AXIS, Math.ceil((maxX - minX) / stepAng) + 1));
      ny = Math.max(MOLDEN_GRID_MIN_AXIS, Math.min(MOLDEN_GRID_MAX_AXIS, Math.ceil((maxY - minY) / stepAng) + 1));
      nz = Math.max(MOLDEN_GRID_MIN_AXIS, Math.min(MOLDEN_GRID_MAX_AXIS, Math.ceil((maxZ - minZ) / stepAng) + 1));
    }
    const stepBohr = stepAng * ANG_TO_BOHR;
    return {
      origin: [minX * ANG_TO_BOHR, minY * ANG_TO_BOHR, minZ * ANG_TO_BOHR],
      axes: [[stepBohr, 0, 0], [0, stepBohr, 0], [0, 0, stepBohr]],
      nxyz: [nx, ny, nz],
      stepBohr,
      stepAng,
    };
  }

  /**
   * Build relative coordinate tables for one grid axis.
   * @param {number} count
   * @param {number} originBohr
   * @param {number} stepBohr
   * @param {number} centerBohr
   * @returns {{coord:Float64Array,sq:Float64Array}}
   */
  function buildMoldenAxisTables(count, originBohr, stepBohr, centerBohr) {
    const coord = new Float64Array(count);
    const sq = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const delta = originBohr + stepBohr * i - centerBohr;
      coord[i] = delta;
      sq[i] = delta * delta;
    }
    return { coord, sq };
  }

  /**
   * Count Molden basis functions for one shell label given angular flags.
   * @param {string} label
   * @param {{d?:string,f?:string,g?:string}} angularFlags
   * @returns {number}
   */
  function countMoldenShellFunctionCount(label, angularFlags) {
    const shell = String(label || '').trim().toLowerCase();
    if (shell === 's') return 1;
    if (shell === 'p') return 3;
    if (shell === 'sp') return 4;
    if (shell === 'd') return angularFlags && angularFlags.d === 'spherical' ? 5 : 6;
    if (shell === 'f') return angularFlags && angularFlags.f === 'spherical' ? 7 : 10;
    if (shell === 'g') return angularFlags && angularFlags.g === 'spherical' ? 9 : 15;
    throw new Error(`Unsupported Molden shell label "${label}".`);
  }

  /**
   * Evaluate one Molden shell contribution into a scalar orbital grid.
   * Supports s/p/sp/d/f shells. G shells are rejected explicitly for now.
   * @param {Float32Array} data
   * @param {number[]} nxyz
   * @param {{coord:Float64Array,sq:Float64Array}} xAxis
   * @param {{coord:Float64Array,sq:Float64Array}} yAxis
   * @param {{coord:Float64Array,sq:Float64Array}} zAxis
   * @param {*} shell
   * @param {Float32Array} coeffs
   * @param {{d?:string,f?:string,g?:string}} angularFlags
   */
  function accumulateMoldenShellContribution(data, nxyz, xAxis, yAxis, zAxis, shell, coeffs, angularFlags) {
    const shellLabel = String(shell && shell.label || '').trim().toLowerCase();
    const [nx, ny, nz] = nxyz;
    const exByPrimitiveX = [];
    const exByPrimitiveY = [];
    const exByPrimitiveZ = [];
    const primitiveMeta = [];
    const primitives = Array.isArray(shell && shell.primitives) ? shell.primitives : [];
    if (shellLabel === 'g') {
      throw new Error('Molden MO rendering does not yet support g shells.');
    }
    for (const primitive of primitives) {
      const exponent = Number(primitive && primitive.exponent);
      if (!(Number.isFinite(exponent) && exponent > 0)) continue;
      const exX = new Float64Array(nx);
      const exY = new Float64Array(ny);
      const exZ = new Float64Array(nz);
      for (let i = 0; i < nx; i++) exX[i] = Math.exp(-exponent * xAxis.sq[i]);
      for (let j = 0; j < ny; j++) exY[j] = Math.exp(-exponent * yAxis.sq[j]);
      for (let k = 0; k < nz; k++) exZ[k] = Math.exp(-exponent * zAxis.sq[k]);
      exByPrimitiveX.push(exX);
      exByPrimitiveY.push(exY);
      exByPrimitiveZ.push(exZ);
      primitiveMeta.push({
        coeff0: Number(primitive.coefficients && primitive.coefficients[0]) || 0,
        coeff1: Number(primitive.coefficients && primitive.coefficients[1]) || 0,
      });
    }
    if (primitiveMeta.length === 0) return;
    const idx = (i, j, k) => (i * ny + j) * nz + k;

    for (let i = 0; i < nx; i++) {
      const x = xAxis.coord[i];
      const xx = x * x;
      for (let j = 0; j < ny; j++) {
        const y = yAxis.coord[j];
        const yy = y * y;
        const xy = x * y;
        for (let k = 0; k < nz; k++) {
          const z = zAxis.coord[k];
          const zz = z * z;
          const xz = x * z;
          const yz = y * z;
          const xyz = xy * z;
          let radial0 = 0;
          let radial1 = 0;
          for (let p = 0; p < primitiveMeta.length; p++) {
            const base = exByPrimitiveX[p][i] * exByPrimitiveY[p][j] * exByPrimitiveZ[p][k];
            radial0 += primitiveMeta[p].coeff0 * base;
            radial1 += primitiveMeta[p].coeff1 * base;
          }
          let value = 0;
          if (shellLabel === 's') {
            value = coeffs[0] * radial0;
          } else if (shellLabel === 'p') {
            value = radial0 * (coeffs[0] * x + coeffs[1] * y + coeffs[2] * z);
          } else if (shellLabel === 'sp') {
            value = coeffs[0] * radial0 + radial1 * (coeffs[1] * x + coeffs[2] * y + coeffs[3] * z);
          } else if (shellLabel === 'd') {
            if (angularFlags && angularFlags.d === 'spherical') {
              value = radial0 * (
                coeffs[0] * (2 * zz - xx - yy) +
                coeffs[1] * xz +
                coeffs[2] * yz +
                coeffs[3] * (xx - yy) +
                coeffs[4] * xy
              );
            } else {
              value = radial0 * (
                coeffs[0] * xx +
                coeffs[1] * yy +
                coeffs[2] * zz +
                coeffs[3] * xy +
                coeffs[4] * xz +
                coeffs[5] * yz
              );
            }
          } else if (shellLabel === 'f') {
            if (angularFlags && angularFlags.f === 'spherical') {
              value = radial0 * (
                coeffs[0] * (z * (2 * zz - 3 * xx - 3 * yy)) +
                coeffs[1] * (x * (4 * zz - xx - yy)) +
                coeffs[2] * (y * (4 * zz - xx - yy)) +
                coeffs[3] * (z * (xx - yy)) +
                coeffs[4] * xyz +
                coeffs[5] * (x * (xx - 3 * yy)) +
                coeffs[6] * (y * (3 * xx - yy))
              );
            } else {
              value = radial0 * (
                coeffs[0] * (xx * x) +
                coeffs[1] * (yy * y) +
                coeffs[2] * (zz * z) +
                coeffs[3] * (x * yy) +
                coeffs[4] * (xx * y) +
                coeffs[5] * (xx * z) +
                coeffs[6] * (x * zz) +
                coeffs[7] * (y * zz) +
                coeffs[8] * (yy * z) +
                coeffs[9] * xyz
              );
            }
          } else {
            throw new Error(`Unsupported Molden shell label "${shellLabel}".`);
          }
          data[idx(i, j, k)] += value;
        }
      }
    }
  }

  /**
   * Evaluate the selected Molden orbital onto a regular scalar grid.
   * @param {*} record
   * @param {*} vol
   */
  function ensureMoldenGridForRecord(record, vol) {
    if (!record || !vol || vol.kind !== 'molden' || !vol.molden) return;
    const molden = vol.molden;
    const mos = Array.isArray(molden.mos) ? molden.mos : [];
    const atomBlocks = molden.basis && Array.isArray(molden.basis.atomBlocks) ? molden.basis.atomBlocks : [];
    if (mos.length === 0 || atomBlocks.length === 0) {
      clearMoldenGrid(vol);
      return;
    }
    let moIndex = Number.isInteger(record.moldenMoIndex) ? record.moldenMoIndex : 0;
    if (moIndex < 0 || moIndex >= mos.length) moIndex = 0;
    record.moldenMoIndex = moIndex;
    const mo = mos[moIndex];
    if (!mo || !(mo.coefficients instanceof Float32Array) || mo.coefficients.length === 0) {
      clearMoldenGrid(vol);
      return;
    }
    const gridSettings = getMoldenGridSettings(record);
    const atomSignature = buildMoldenAtomSignature(vol);
    const cacheKey = `${moIndex}|${gridSettings.stepAng.toFixed(2)}|${gridSettings.paddingAng.toFixed(1)}|${atomSignature}`;
    if (!(record.moldenGridCache instanceof Map)) record.moldenGridCache = new Map();
    if (record.moldenGridCache.has(cacheKey)) {
      const cached = record.moldenGridCache.get(cacheKey);
      vol.origin = cached.origin.map((v) => v);
      vol.axes = cached.axes.map((axis) => axis.slice(0, 3));
      vol.nxyz = cached.nxyz.slice(0, 3);
      vol.data = cached.data.slice(0);
      vol.idx = (i, j, k) => (i * vol.nxyz[1] + j) * vol.nxyz[2] + k;
      vol.isoHint = cached.isoHint;
      return;
    }

    const grid = buildMoldenGridSpec(vol, gridSettings);
    const [nx, ny, nz] = grid.nxyz;
    const data = new Float32Array(nx * ny * nz);
    const angularFlags = molden.angularFlags || {};
    let aoOffset = 0;
    for (const atomBlock of atomBlocks) {
      const atomIndex = Number(atomBlock && atomBlock.atomIndex);
      const atom = Array.isArray(vol.atoms) ? vol.atoms[atomIndex] : null;
      if (!atom) throw new Error(`Molden MO rendering failed: basis atom index ${atomIndex + 1} is out of range.`);
      const center = atomUnitsToAng(vol, atom).multiplyScalar(ANG_TO_BOHR);
      const xAxis = buildMoldenAxisTables(nx, grid.origin[0], grid.stepBohr, center.x);
      const yAxis = buildMoldenAxisTables(ny, grid.origin[1], grid.stepBohr, center.y);
      const zAxis = buildMoldenAxisTables(nz, grid.origin[2], grid.stepBohr, center.z);
      const shells = Array.isArray(atomBlock && atomBlock.shells) ? atomBlock.shells : [];
      for (const shell of shells) {
        const count = countMoldenShellFunctionCount(shell && shell.label, angularFlags);
        if (aoOffset + count > mo.coefficients.length) {
          throw new Error(`Molden MO rendering failed: MO ${moIndex + 1} is missing coefficients for shell "${shell && shell.label}" on atom ${atomIndex + 1}.`);
        }
        const coeffs = mo.coefficients.subarray(aoOffset, aoOffset + count);
        accumulateMoldenShellContribution(data, grid.nxyz, xAxis, yAxis, zAxis, shell, coeffs, angularFlags);
        aoOffset += count;
      }
    }
    const cacheEntry = {
      origin: grid.origin.slice(0, 3),
      axes: grid.axes.map((axis) => axis.slice(0, 3)),
      nxyz: grid.nxyz.slice(0, 3),
      data: data.slice(0),
      isoHint: DEFAULT_ISO_VALUE,
    };
    record.moldenGridCache.set(cacheKey, cacheEntry);
    vol.origin = cacheEntry.origin.slice(0, 3);
    vol.axes = cacheEntry.axes.map((axis) => axis.slice(0, 3));
    vol.nxyz = cacheEntry.nxyz.slice(0, 3);
    vol.data = cacheEntry.data.slice(0);
    vol.idx = (i, j, k) => (i * vol.nxyz[1] + j) * vol.nxyz[2] + k;
    vol.isoHint = cacheEntry.isoHint;
  }

  /**
   * Enable/disable the Autoiso button depending on whether one volumetric grid is active.
   */
  function updateAutoIsoButtonState() {
    if (!autoIsoBtn) return;
    const record = currentIndex >= 0 ? volumes[currentIndex] : null;
    const vol = record && record.vol;
    const hasGrid = hasVolumetricGrid(vol);
    autoIsoBtn.disabled = false;
    autoIsoBtn.classList.toggle('active', autoIsoEnabled);
    autoIsoBtn.setAttribute('aria-pressed', autoIsoEnabled ? 'true' : 'false');
    autoIsoBtn.title = hasGrid
      ? `Autoiso ${autoIsoEnabled ? 'ON' : 'OFF'}: target ${Math.round(AUTO_ISO_TARGET_FRACTION * 100)}% density (cached per orbital/component).`
      : `Autoiso ${autoIsoEnabled ? 'ON' : 'OFF'}: load/select a .cube/.2ccube/.molden file to apply.`;
  }
  updateAutoIsoButtonState();

  /**
   * Collapse/expand the left workspace sidebar.
   * @param {boolean} collapsed
   */
  function setWorkspaceSidebarCollapsed(collapsed) {
    const isCollapsed = !!collapsed;
    document.body.classList.toggle('sidebar-collapsed', isCollapsed);
    if (toolbarEl) toolbarEl.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    hideToolbarTooltip();
    // Refresh projection immediately because sidebar open/close is now non-animated.
    resize();
  }

  if (toolbarCollapseBtn) toolbarCollapseBtn.onclick = () => setWorkspaceSidebarCollapsed(true);
  if (toolbarShowBtn) toolbarShowBtn.onclick = () => setWorkspaceSidebarCollapsed(false);
  setWorkspaceSidebarCollapsed(false);

  /**
   * Pick one happy emoji for the toolbar brand on each page load.
   */
  function setRandomBrandEmoji() {
    if (!brandEmojiEl || HEADER_HAPPY_EMOJIS.length === 0) return;
    const idx = Math.floor(Math.random() * HEADER_HAPPY_EMOJIS.length);
    brandEmojiEl.textContent = HEADER_HAPPY_EMOJIS[idx];
  }
  setRandomBrandEmoji();

  /**
   * Hide the floating toolbar tooltip.
   */
  function hideToolbarTooltip() {
    if (!toolbarTooltipEl) return;
    toolbarTooltipAnchorEl = null;
    toolbarTooltipEl.classList.remove('open');
    toolbarTooltipEl.setAttribute('aria-hidden', 'true');
    toolbarTooltipEl.style.left = '-9999px';
    toolbarTooltipEl.style.top = '-9999px';
    toolbarTooltipEl.textContent = '';
    toolbarTooltipEl.removeAttribute('data-side');
  }

  /**
   * Position the floating toolbar tooltip near one anchor control.
   * @param {HTMLElement} anchorEl
   */
  function positionToolbarTooltip(anchorEl) {
    if (!toolbarTooltipEl || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const margin = 8;
    const gap = 10;

    toolbarTooltipEl.style.left = '-9999px';
    toolbarTooltipEl.style.top = '-9999px';
    toolbarTooltipEl.classList.add('open');
    toolbarTooltipEl.setAttribute('aria-hidden', 'false');

    const tooltipW = Math.max(176, toolbarTooltipEl.offsetWidth || 0);
    const tooltipH = Math.max(22, toolbarTooltipEl.offsetHeight || 0);

    let side = 'right';
    let left = rect.right + gap;
    if (left + tooltipW > window.innerWidth - margin) {
      side = 'left';
      left = rect.left - gap - tooltipW;
    }
    if (left < margin) left = margin;

    let top = rect.top + ((rect.height - tooltipH) * 0.5);
    if (top < margin) top = margin;
    const maxTop = window.innerHeight - margin - tooltipH;
    if (top > maxTop) top = Math.max(margin, maxTop);

    toolbarTooltipEl.setAttribute('data-side', side);
    toolbarTooltipEl.style.left = `${Math.round(left)}px`;
    toolbarTooltipEl.style.top = `${Math.round(top)}px`;
  }

  /**
   * Show the floating toolbar tooltip for one control.
   * @param {HTMLElement} anchorEl
   */
  function showToolbarTooltip(anchorEl) {
    if (!toolbarTooltipEl || !anchorEl) return;
    const text = String(anchorEl.getAttribute('data-tip') || '').trim();
    if (!text) {
      hideToolbarTooltip();
      return;
    }
    toolbarTooltipAnchorEl = anchorEl;
    toolbarTooltipEl.textContent = text;
    positionToolbarTooltip(anchorEl);
  }

  /**
   * Attach floating tooltip behavior to toolbar controls with `data-tip`.
   */
  function initializeToolbarTooltips() {
    if (!toolbarEl || !toolbarTooltipEl) return;
    const targets = toolbarEl.querySelectorAll('button[data-tip]');
    targets.forEach((el) => {
      el.addEventListener('mouseenter', () => showToolbarTooltip(el));
      el.addEventListener('focus', () => showToolbarTooltip(el));
      el.addEventListener('mouseleave', () => {
        if (toolbarTooltipAnchorEl === el) hideToolbarTooltip();
      });
      el.addEventListener('blur', () => {
        if (toolbarTooltipAnchorEl === el) hideToolbarTooltip();
      });
      el.addEventListener('click', () => {
        if (toolbarTooltipAnchorEl === el) hideToolbarTooltip();
      });
    });

    window.addEventListener('resize', () => {
      if (toolbarTooltipAnchorEl) positionToolbarTooltip(toolbarTooltipAnchorEl);
    });
    document.addEventListener('scroll', () => {
      if (toolbarTooltipAnchorEl) positionToolbarTooltip(toolbarTooltipAnchorEl);
    }, true);
    document.addEventListener('pointerdown', (evt) => {
      if (!toolbarTooltipAnchorEl) return;
      if (!(toolbarEl && toolbarEl.contains(evt.target))) hideToolbarTooltip();
    });
  }
  initializeToolbarTooltips();

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
    ctx.fillStyle = UI_PALETTE.periodicSymbolFill;
    ctx.strokeStyle = UI_PALETTE.periodicSymbolStroke;
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
    // Push the key highlight higher on a top-right diagonal.
    d1.position.set(4.5, 5.0, 0.5);
    periodicTableScene.add(d1);
    const d2 = new THREE.DirectionalLight(0x9fc2ff, 0.45);
    d2.position.set(-2.6, -1.4, -2.2);
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
      { k: 'C', d: 'Toggle Coordinates window' },
      { k: 'R', d: 'Center mass at origin' },
      { k: 'Cmd/Ctrl+Z', d: 'Undo edit' },
      { k: 'Cmd/Ctrl+Shift+Z', d: 'Redo edit' },
      { k: 'V', d: 'Toggle View window' },
      { k: 'E', d: 'Edit mode' },
      { k: 'M', d: 'Measurement mode' },
      { k: '1/2/3/4', d: 'Style: Default/Toon/Kit/Glossy' },
      { k: '←/→', d: 'Prev/Next file' },
      { k: '?', d: 'Help' },
    ],
    panel: [
      { k: 'S', d: 'Save PNG' },
      { k: 'I', d: 'Toggle surfaces' },
      { k: 'C', d: 'Toggle Coordinates window' },
    ],
    help: [
      { k: '←/→', d: 'Prev/Next file' },
    ],
    edit: [
      { k: 'E', d: 'Exit edit' },
      { k: 'S', d: 'Selection tool' },
      { k: 'G', d: 'Move tool' },
      { k: 'N', d: 'Add-atom tool' },
      { k: 'F', d: 'Add-fragment tool' },
      { k: 'M', d: 'Add-molecule tool' },
      { k: 'B', d: 'Bond tool' },
      { k: 'T', d: 'Transform tool' },
      { k: 'D', d: 'Delete tool' },
      { k: 'Cmd/Ctrl+A', d: 'Select all atoms (Selection)' },
      { k: '1/2/3/4', d: 'Bond order (Add/Bond tool)' },
      { k: 'C', d: 'Coordinates window (non-Add tools)' },
      { k: 'Click', d: 'Select atom (Selection)' },
      { k: 'Shift+Click', d: 'Add/remove atom (Selection)' },
      { k: 'Click empty', d: 'Clear selection (Selection)' },
      { k: 'Click+Drag', d: 'Move atom (Move tool)' },
      { k: 'Click', d: 'Add atom (Add tool)' },
      { k: 'Click', d: 'Edit bond (Bond tool)' },
      { k: 'Click+Drag', d: 'Transform selection (Transform tool)' },
      { k: 'Click', d: 'Delete atom (Delete tool)' },
      { k: 'Backspace/Delete', d: 'Delete hovered atom' },
      { k: 'R', d: 'Center mass at origin' },
      { k: 'Cmd/Ctrl+Z', d: 'Undo edit' },
      { k: 'Cmd/Ctrl+Shift+Z', d: 'Redo edit' },
      { k: 'X/Y/Z', d: 'Axis lock' },
      { k: 'Shift+Drag', d: 'Bypass auto angle snap (Add tool)' },
    ],
    measure: [
      { k: 'M', d: 'Display mode' },
      { k: 'E', d: 'Edit mode' },
      { k: 'C', d: 'Toggle Coordinates window' },
      { k: 'Click', d: 'Select points' },
      { k: 'R', d: 'Center mass at origin' },
      { k: 'Esc', d: 'Clear measurement' },
    ],
  };

  // --- Mode system + shortcut routing ---
  const MODES = Object.freeze({ DISPLAY: 'display', EDIT: 'edit', MEASURE: 'measurement' });
  let currentMode = MODES.DISPLAY;
  /**
   * Reflect the active interaction mode in toolbar mode buttons.
   */
  function updateModeButtons() {
    /** @type {Array<[HTMLElement|null, string]>} */
    const buttons = [
      [modeDisplayBtn, MODES.DISPLAY],
      [modeMeasureBtn, MODES.MEASURE],
      [modeEditBtn, MODES.EDIT],
    ];
    for (const [btn, mode] of buttons) {
      if (!btn) continue;
      const active = currentMode === mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }
  /**
   * Transition between display/edit/measurement modes and apply side effects.
   * This keeps surface visibility and interaction state consistent across mode changes.
   * @param {string} newMode
   */
  function setMode(newMode) {
    if (currentMode === newMode) {
      updateModeButtons();
      return;
    }
    const prevMode = currentMode;
    if (prevMode === MODES.EDIT && newMode !== MODES.EDIT && addAtomOperatorSession) {
      finalizeAddAtomOperatorSession({ announce: false });
    }
    endQuaternionViewRotate();
    currentMode = newMode;
    editMode = (currentMode === MODES.EDIT);
    if (currentMode === MODES.EDIT && trajectoryPlaying) {
      stopTrajectoryPlayback({ syncUi: true });
    }
    if (currentMode === MODES.EDIT) {
      const vibInfo = getActiveVibrationInfo();
      if (vibInfo.enabled) {
        vibrationPlaying = false;
        vibrationLastStepMs = 0;
        restoreActiveVibrationEquilibrium({ syncUi: false });
        syncVibrationControls();
      }
    }
    if (currentMode === MODES.EDIT && prevMode !== MODES.EDIT) {
      // Always start edit sessions in add mode.
      setEditTool(EDIT_TOOL.ADD, { announce: false });
    }
    updateAxisButtons();
    updateEditPlaneHelpers();
    updateEditToolboxUi();
    const ctx = (currentMode === MODES.EDIT) ? 'edit' : (currentMode === MODES.MEASURE ? 'measure' : 'default');
    renderRibbon(ctx);
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
    // Clear transient edit interaction state when leaving edit mode.
    if (currentMode === MODES.DISPLAY) {
      clearTransientInteractionState({
        measurement: false,
        selection: false,
        addPreview: false,
        moleculePlacement: false,
        fusePreview: false,
        transform: false,
        pointerState: false,
      });
    }
    if (currentMode !== MODES.EDIT) {
      clearTransientInteractionState({
        measurement: false,
        selection: false,
        hover: false,
      });
    }
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
    updateModeButtons();
  }

  if (modeDisplayBtn) modeDisplayBtn.onclick = () => setMode(MODES.DISPLAY);
  if (modeMeasureBtn) modeMeasureBtn.onclick = () => setMode(MODES.MEASURE);
  if (modeEditBtn) modeEditBtn.onclick = () => setMode(MODES.EDIT);
  updateModeButtons();

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
    const shortcutKeyStyle = `background:${UI_PALETTE.shortcutKeyBg}; color:${UI_PALETTE.shortcutKeyText}; padding:1px 6px; border:1px solid ${UI_PALETTE.shortcutKeyBorder}; border-radius:4px;`;
    const parts = list.map(s => `<span style="opacity:.85"><span style="${shortcutKeyStyle}">${s.k}</span> ${s.d}</span>`);
    shortcutRibbon.innerHTML = parts.join('<span style="opacity:.35"> • </span>');
    shortcutRibbon.setAttribute('aria-hidden', 'false');
  }
  renderRibbon('default');
  if (surfBtn && typeof surfBtn.type === 'string' && surfBtn.type.toLowerCase() === 'checkbox') {
    surfBtn.onchange = () => {
      showSurfaces = !!surfBtn.checked;
      updateSurfBtn();
      rebuildScene({ preserveView: true });
    };
  } else if (surfBtn) {
    surfBtn.onclick = () => { showSurfaces = !showSurfaces; updateSurfBtn(); rebuildScene({ preserveView: true }); };
  }
  /**
   * Open/close the dedicated View floating panel.
   * @param {boolean} open
   */
  function setViewPanelOpen(open) {
    if (!sidePanel) return;
    const shouldOpen = !!open;
    sidePanel.classList.toggle('open', shouldOpen);
    sidePanel.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
    renderRibbon((shouldOpen || (coordsPanel && coordsPanel.classList.contains('open'))) ? 'panel' : 'default');
    if (viewPanelBtn) viewPanelBtn.classList.toggle('active', shouldOpen);
  }

  /**
   * Toggle View panel open/closed.
   */
  const toggleSide = () => setViewPanelOpen(!(sidePanel && sidePanel.classList.contains('open')));

  /**
   * Open the View panel.
   */
  const openSide = () => setViewPanelOpen(true);

  /**
   * Close the View panel.
   */
  const closeSide = () => setViewPanelOpen(false);

  /**
   * Open/close the coordinates floating panel.
   * @param {boolean} open
   */
  function setCoordsPanelOpen(open) {
    const shouldOpen = !!open;
    setFloatingPanelOpen(coordsPanel, shouldOpen);
    renderRibbon((shouldOpen || (sidePanel && sidePanel.classList.contains('open'))) ? 'panel' : 'default');
    if (coordsPanelBtn) coordsPanelBtn.classList.toggle('active', shouldOpen);
  }

  /**
   * Open or close one toolbar inspector and synchronize its button/icon state.
   * @param {{panel:HTMLElement|null,button:HTMLElement|null,icon:HTMLElement|null}} refs
   * @param {boolean} open
   */
  function setToolbarInspectorOpen(refs, open) {
    const panel = refs && refs.panel;
    if (!panel) return;
    const shouldOpen = !!open;
    panel.classList.toggle('open', shouldOpen);
    panel.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
    if (refs.button) refs.button.classList.toggle('active', shouldOpen);
    if (refs.icon) refs.icon.textContent = shouldOpen ? 'remove' : 'add';
  }

  /**
   * Attach click toggle behavior to one toolbar inspector shell.
   * @param {{panel:HTMLElement|null,button:HTMLElement|null,icon:HTMLElement|null}} refs
   */
  function bindToolbarInspectorToggle(refs) {
    if (!refs || !refs.button || !refs.panel) return;
    refs.button.onclick = () => setToolbarInspectorOpen(refs, !refs.panel.classList.contains('open'));
  }

  const viewInspectorRefs = { panel: viewInspector, button: viewInspectorBtn, icon: viewInspectorToggleIcon };
  const displayInspectorRefs = { panel: displayInspector, button: displayInspectorBtn, icon: displayInspectorToggleIcon };
  const moldenInspectorRefs = { panel: moldenInspector, button: moldenInspectorBtn, icon: moldenInspectorToggleIcon };

  /**
   * Open/close the compact View/Coords inspector in the toolbar.
   * @param {boolean} open
   */
  function setViewInspectorOpen(open) { setToolbarInspectorOpen(viewInspectorRefs, open); }

  bindToolbarInspectorToggle(viewInspectorRefs);
  if (viewPanelBtn) viewPanelBtn.onclick = () => setViewPanelOpen(!(sidePanel && sidePanel.classList.contains('open')));
  if (coordsPanelBtn) coordsPanelBtn.onclick = () => setCoordsPanelOpen(!(coordsPanel && coordsPanel.classList.contains('open')));
  if (sideClose) sideClose.onclick = () => setViewPanelOpen(false);
  if (coordsPanelClose) coordsPanelClose.onclick = () => setCoordsPanelOpen(false);

  /**
   * Open/close the compact display inspector panel.
   * @param {boolean} open
   */
  function setDisplayInspectorOpen(open) { setToolbarInspectorOpen(displayInspectorRefs, open); }
  bindToolbarInspectorToggle(displayInspectorRefs);

  /**
   * Open/close the dedicated Molden toolbar inspector.
   * @param {boolean} open
   */
  function setMoldenInspectorOpen(open) { setToolbarInspectorOpen(moldenInspectorRefs, open); }
  bindToolbarInspectorToggle(moldenInspectorRefs);

  /**
   * Toggle a dedicated floating motion panel.
   * @param {HTMLElement|null} panelEl
   * @param {boolean} open
   */
  function setFloatingPanelOpen(panelEl, open) {
    if (!panelEl) return;
    const shouldOpen = !!open;
    panelEl.classList.toggle('open', shouldOpen);
    panelEl.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
  }

  /**
   * Open/close trajectory controls panel.
   * @param {boolean} open
   * @param {{syncUi?:boolean}=} options
   */
  function setTrajectoryPanelOpen(open, options = {}) {
    const shouldOpen = !!open;
    if (!shouldOpen) stopTrajectoryPlayback({ syncUi: false });
    setFloatingPanelOpen(trajectoryPanel, shouldOpen);
    if (options.syncUi !== false) syncTrajectoryControls();
  }

  /**
   * Open/close vibration controls panel.
   * @param {boolean} open
   */
  function setVibrationPanelOpen(open) {
    const shouldOpen = !!open;
    if (!shouldOpen) {
      vibrationPlaying = false;
      vibrationLastStepMs = 0;
      restoreActiveVibrationEquilibrium({ syncUi: false });
      if (vibrationPanelLayoutRaf) {
        cancelAnimationFrame(vibrationPanelLayoutRaf);
        vibrationPanelLayoutRaf = 0;
      }
    }
    setFloatingPanelOpen(vibrationPanel, shouldOpen);
    if (shouldOpen) scheduleVibrationPanelLayoutSync(2);
  }

  if (trajectoryPanelBtn) {
    trajectoryPanelBtn.onclick = () => {
      setTrajectoryPanelOpen(!(trajectoryPanel && trajectoryPanel.classList.contains('open')));
    };
  }
  if (vibrationPanelBtn) {
    vibrationPanelBtn.onclick = () => {
      setVibrationPanelOpen(!(vibrationPanel && vibrationPanel.classList.contains('open')));
    };
  }
  if (trajectoryPanelClose) {
    trajectoryPanelClose.onclick = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      setTrajectoryPanelOpen(false);
    };
  }
  if (vibrationPanelClose) vibrationPanelClose.onclick = () => setVibrationPanelOpen(false);

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
    refreshActiveAddGrowPreview();
    if (moleculePlaceActive) rebuildMoleculePlacementPreviewMeshes();
    if (addFusePreviewState) rebuildFuseRingPreviewMeshes();
  }

  /**
   * Update the projection toggle button text/title to reflect current camera mode.
   */
  function updateProjectionModeUI() {
    if (!projectionModeBtn) return;
    if (viewState.mode === 'orthographic') {
      if (projectionModeLabel) projectionModeLabel.textContent = 'Orthographic';
      if (projectionModeState) projectionModeState.textContent = 'On';
      projectionModeBtn.classList.add('active');
      projectionModeBtn.setAttribute('aria-pressed', 'true');
      projectionModeBtn.title = 'Orthographic projection is ON. Click to switch to Perspective.';
      projectionModeBtn.setAttribute('data-tip', 'Orthographic: ON. Click to switch to perspective projection.');
      return;
    }
    if (projectionModeLabel) projectionModeLabel.textContent = 'Orthographic';
    if (projectionModeState) projectionModeState.textContent = 'Off';
    projectionModeBtn.classList.remove('active');
    projectionModeBtn.setAttribute('aria-pressed', 'false');
    projectionModeBtn.title = 'Orthographic projection is OFF. Click to turn it ON.';
    projectionModeBtn.setAttribute('data-tip', 'Orthographic: OFF. Click to enable orthographic projection.');
  }

  /**
   * Copy one camera pose (position/orientation/up vector) between cameras.
   * @param {THREE.Camera} src
   * @param {THREE.Camera} dst
   */
  function copyCameraPose(src, dst) {
    copyCameraPoseUtil(src, dst);
  }

  /**
   * Read current renderer viewport size with safe fallback.
   * @returns {{w:number,h:number}}
   */
  function getViewportSize() {
    return {
      w: Math.max(1, Number(currentViewportMetrics.cssWidth) || 1),
      h: Math.max(1, Number(currentViewportMetrics.cssHeight) || 1),
    };
  }

  /**
   * Toggle camera projection mode between perspective and orthographic.
   * @param {'perspective'|'orthographic'} nextMode
   * @param {{refreshUi?:boolean}=} options
   */
  function setProjectionMode(nextMode, options = {}) {
    const targetMode = nextMode === 'orthographic' ? 'orthographic' : 'perspective';
    if (targetMode === viewState.mode) {
      updateProjectionModeUI();
      return;
    }
    if (targetMode === 'orthographic') {
      copyCameraPose(perspectiveCamera, orthographicCamera);
      camera = orthographicCamera;
    } else {
      copyCameraPose(orthographicCamera, perspectiveCamera);
      camera = perspectiveCamera;
    }
    viewState.mode = targetMode;
    viewState.camera = camera;
    controls.object = camera;
    const { w, h } = getViewportSize();
    updateActiveCameraProjection(w, h);
    controls.update();
    updateProjectionModeUI();
    if (options.refreshUi !== false) refreshViewUI();
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
    updateProjectionModeUI();
  }

  // Initialize view UI
  refreshViewUI();
  controls.addEventListener('change', refreshViewUI);

  // --- Edit mode: toggle with 'E', hover highlight, drag to move ---
  let editMode = false; // mirrors currentMode === MODES.EDIT
  let hoverAtomMesh = null;
  let hoverBondObject = null;
  let transformSelectionIndices = [];
  let transformSelectionKind = 'fragment';
  let transformSelectionContext = null;
  let transformPendingSelectionTarget = null;
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
  const EDIT_TOOL = Object.freeze({ SELECT: 'select', MOVE: 'move', ADD: 'add', BOND: 'bond', TRANSFORM: 'transform', DELETE: 'delete' });
  const EDIT_BOND_ACTION = Object.freeze({ SET: 'set', DELETE: 'delete' });
  const EDIT_ADD_MODE = Object.freeze({ ATOM: 'atom', FRAGMENT: 'fragment', MOLECULE: 'molecule' });
  const CATALOG_KIND = Object.freeze({ FRAGMENT: 'fragment', MOLECULE: 'molecule' });
  const EDIT_FRAGMENT_ATTACH_POLICY = Object.freeze({
    AUTO: 'auto',
    APPEND: 'append',
    REPLACE_H: 'replace_h',
    FUSE_RING: 'fuse_ring',
  });
  const EDIT_TRANSFORM_SCOPE = Object.freeze({
    AUTO: 'auto',
    FRAGMENT: 'fragment',
    MOLECULE: 'molecule',
    ALL: 'all',
  });
  const EDIT_TRANSFORM_MODE = Object.freeze({
    MOVE: 'move',
    ROTATE_FRAGMENT: 'rotate_fragment',
    ROTATE_BOND: 'rotate_bond',
  });
  let editTool = EDIT_TOOL.ADD;
  let editAtomSelectionIndices = [];
  let editAddMode = EDIT_ADD_MODE.ATOM;
  let editAddElementZ = 6;
  let editAddBondOrder = 1;
  let editBondOrder = 1;
  let editBondAction = EDIT_BOND_ACTION.SET;
  let bondEditing = null;
  let measurementLabelHoverSprite = null;
  let measurementLabelHoverKey = '';
  let measurementLabelDragState = null;
  let editAddSearchClearedOnFocus = false;
  const editAddAtomPaneHomeParent = editAddAtomPaneEl ? editAddAtomPaneEl.parentElement : null;
  const editAddAtomPaneHomeNextSibling = editAddAtomPaneEl ? editAddAtomPaneEl.nextSibling : null;
  const editAddFragmentPaneHomeParent = editAddFragmentPaneEl ? editAddFragmentPaneEl.parentElement : null;
  const editAddFragmentPaneHomeNextSibling = editAddFragmentPaneEl ? editAddFragmentPaneEl.nextSibling : null;
  const editAddMoleculePaneHomeParent = editAddMoleculePaneEl ? editAddMoleculePaneEl.parentElement : null;
  const editAddMoleculePaneHomeNextSibling = editAddMoleculePaneEl ? editAddMoleculePaneEl.nextSibling : null;
  const editBondPaneHomeParent = editBondPaneEl ? editBondPaneEl.parentElement : null;
  const editBondPaneHomeNextSibling = editBondPaneEl ? editBondPaneEl.nextSibling : null;
  const editTransformPaneHomeParent = editTransformPaneEl ? editTransformPaneEl.parentElement : null;
  const editTransformPaneHomeNextSibling = editTransformPaneEl ? editTransformPaneEl.nextSibling : null;
  const adaptivePopoverBindings = Object.freeze({
    atom: {
      mode: EDIT_ADD_MODE.ATOM,
      triggerEl: editAdaptiveAddAtomBtn,
      popoverEl: editAdaptiveAddAtomPopoverEl,
      paneEl: editAddAtomPaneEl,
      focusEl: editAddSearchEl,
      homeParent: editAddAtomPaneHomeParent,
      homeNextSibling: editAddAtomPaneHomeNextSibling,
    },
    fragment: {
      mode: EDIT_ADD_MODE.FRAGMENT,
      triggerEl: editAdaptiveAddFragmentBtn,
      popoverEl: editAdaptiveAddFragmentPopoverEl,
      paneEl: editAddFragmentPaneEl,
      focusEl: editFragmentSearchEl,
      homeParent: editAddFragmentPaneHomeParent,
      homeNextSibling: editAddFragmentPaneHomeNextSibling,
    },
    molecule: {
      mode: EDIT_ADD_MODE.MOLECULE,
      triggerEl: editAdaptiveAddMoleculeBtn,
      popoverEl: editAdaptiveAddMoleculePopoverEl,
      paneEl: editAddMoleculePaneEl,
      focusEl: editMoleculeSearchEl,
      homeParent: editAddMoleculePaneHomeParent,
      homeNextSibling: editAddMoleculePaneHomeNextSibling,
    },
    transform: {
      mode: null,
      triggerEl: editAdaptiveTransformBtn,
      popoverEl: editAdaptiveTransformPopoverEl,
      paneEl: editTransformPaneEl,
      focusEl: editTransformScopeEl,
      homeParent: editTransformPaneHomeParent,
      homeNextSibling: editTransformPaneHomeNextSibling,
    },
  });
  let editAddFragmentAttachPolicy = EDIT_FRAGMENT_ATTACH_POLICY.AUTO;
  let editAutoCleanupEnabled = true;
  let editCleanupBondLengthEnabled = true;
  let editCleanupOverlapEnabled = true;
  let editCleanupStrength = 0.6;
  let editAddFragmentId = (getCatalogEntryById('methyl', CATALOG_KIND.FRAGMENT) && getCatalogEntryById('methyl', CATALOG_KIND.FRAGMENT).id) || ((getCatalogEntries(CATALOG_KIND.FRAGMENT)[0] && getCatalogEntries(CATALOG_KIND.FRAGMENT)[0].id) || 'methyl');
  let editAddMoleculeId = (getCatalogEntryById('benzene', CATALOG_KIND.MOLECULE) && getCatalogEntryById('benzene', CATALOG_KIND.MOLECULE).id) || ((getCatalogEntries(CATALOG_KIND.MOLECULE)[0] && getCatalogEntries(CATALOG_KIND.MOLECULE)[0].id) || 'benzene');
  let editTransformScope = EDIT_TRANSFORM_SCOPE.AUTO;
  let editTransformMode = EDIT_TRANSFORM_MODE.MOVE;
  let editTransformAutoCleanupEnabled = true;
  const EDIT_ANGLE_SNAP_OPTIONS = Object.freeze([60, 90, 109.5, 120, 180]);
  let addGrowDetectedAngleDeg = 0;
  const EDIT_QUICK_ADD_ELEMENTS = [1, 6, 7, 8, 9, 15, 16, 17, 26, 35];
  const EDIT_QUICK_FRAGMENTS = ['methyl', 'methylene', 'hydroxyl', 'amino', 'carbonyl', 'amide', 'phenyl'];
  const EDIT_QUICK_MOLECULES = ['benzene', 'pyridine', 'cyclohexane'];
  let addGrowActive = false;
  let addGrowAnchorIndex = -1;
  let addGrowAnchorPos = null;
  let addGrowNeighborDirs = [];
  let addGrowPreviewPos = null;
  let addGrowPreviewBondHit = null;
  let addAtomOperatorSession = null;
  let addAtomOperatorCollapsed = true;
  let moleculePlaceActive = false;
  let moleculePlaceOperatorCollapsed = true;
  let moleculePlaceRotating = false;
  let moleculePlaceMoved = false;
  let moleculePlaceTemplate = null;
  let moleculePlaceTemplateData = null;
  let moleculePlacePosition = new THREE.Vector3(0, 0, 0);
  let moleculePlaceQuaternion = new THREE.Quaternion();
  let moleculePlaceLastClientX = 0;
  let moleculePlaceLastClientY = 0;
  let transformActive = false;
  let transformTargetIndices = [];
  let transformTargetKind = 'molecule';
  let transformAppliesToGrid = false;
  let transformPivotWorld = null;
  let transformDragPlane = null;
  let transformPlaneStart = null;
  let transformRotateAxis = null;
  let transformRotateStartDir = null;
  let transformRotateGesture = 'move';
  let transformRotateLastClientX = 0;
  let transformRotateLastClientY = 0;
  let transformRotateAccumulatedQuaternion = new THREE.Quaternion();
  let transformBondContext = null;
  let transformPendingBackgroundClear = false;
  let transformStartPositionsWorld = [];
  let transformBeforeSnapshot = null;
  let transformMoved = false;
  const addPreviewGroup = new THREE.Group();
  contentGroup.add(addPreviewGroup);
  const addMoleculePreviewGroup = new THREE.Group();
  addPreviewGroup.add(addMoleculePreviewGroup);
  const addFusePreviewGroup = new THREE.Group();
  addPreviewGroup.add(addFusePreviewGroup);
  const addAngleGuideGroup = new THREE.Group();
  contentGroup.add(addAngleGuideGroup);
  const transformGuideGroup = new THREE.Group();
  contentGroup.add(transformGuideGroup);
  let addPreviewAtomMesh = null;
  let addPreviewBondMesh = null;
  let addFusePreviewState = null;
  let dragBeforeAtomsSnapshot = null;
  let dragBeforeBondSnapshot = null;
  const editPlacementState = {
    get addAtomOperatorSession() { return addAtomOperatorSession; },
    set addAtomOperatorSession(value) { addAtomOperatorSession = value; },
    get addAtomOperatorCollapsed() { return addAtomOperatorCollapsed; },
    set addAtomOperatorCollapsed(value) { addAtomOperatorCollapsed = !!value; },
    get moleculePlaceActive() { return moleculePlaceActive; },
    set moleculePlaceActive(value) { moleculePlaceActive = !!value; },
    get moleculePlaceOperatorCollapsed() { return moleculePlaceOperatorCollapsed; },
    set moleculePlaceOperatorCollapsed(value) { moleculePlaceOperatorCollapsed = !!value; },
    get moleculePlaceRotating() { return moleculePlaceRotating; },
    set moleculePlaceRotating(value) { moleculePlaceRotating = !!value; },
    get moleculePlaceMoved() { return moleculePlaceMoved; },
    set moleculePlaceMoved(value) { moleculePlaceMoved = !!value; },
    get moleculePlaceTemplate() { return moleculePlaceTemplate; },
    set moleculePlaceTemplate(value) { moleculePlaceTemplate = value; },
    get moleculePlaceTemplateData() { return moleculePlaceTemplateData; },
    set moleculePlaceTemplateData(value) { moleculePlaceTemplateData = value; },
    get moleculePlacePosition() { return moleculePlacePosition; },
    set moleculePlacePosition(value) { moleculePlacePosition = value; },
    get moleculePlaceQuaternion() { return moleculePlaceQuaternion; },
    set moleculePlaceQuaternion(value) { moleculePlaceQuaternion = value; },
    get moleculePlaceLastClientX() { return moleculePlaceLastClientX; },
    set moleculePlaceLastClientX(value) { moleculePlaceLastClientX = Number(value) || 0; },
    get moleculePlaceLastClientY() { return moleculePlaceLastClientY; },
    set moleculePlaceLastClientY(value) { moleculePlaceLastClientY = Number(value) || 0; },
    get addFusePreviewState() { return addFusePreviewState; },
    set addFusePreviewState(value) { addFusePreviewState = value; },
    get hoverAtomMesh() { return hoverAtomMesh; },
    set hoverAtomMesh(value) { hoverAtomMesh = value; },
  };
  const editToolState = {
    get editTool() { return editTool; },
    set editTool(value) { editTool = value; },
    get editAtomSelectionIndices() { return editAtomSelectionIndices; },
    set editAtomSelectionIndices(value) { editAtomSelectionIndices = Array.isArray(value) ? value : []; },
    get editAddMode() { return editAddMode; },
    set editAddMode(value) { editAddMode = value; },
    get editAddElementZ() { return editAddElementZ; },
    set editAddElementZ(value) { editAddElementZ = Number(value) | 0; },
    get editAddBondOrder() { return editAddBondOrder; },
    set editAddBondOrder(value) { editAddBondOrder = Number(value) | 0; },
    get editBondAction() { return editBondAction; },
    set editBondAction(value) { editBondAction = value; },
    get editAddFragmentAttachPolicy() { return editAddFragmentAttachPolicy; },
    set editAddFragmentAttachPolicy(value) { editAddFragmentAttachPolicy = value; },
    get editAddMoleculeId() { return editAddMoleculeId; },
    set editAddMoleculeId(value) { editAddMoleculeId = value; },
    get editTransformScope() { return editTransformScope; },
    set editTransformScope(value) { editTransformScope = value; },
    get editTransformMode() { return editTransformMode; },
    set editTransformMode(value) { editTransformMode = value; },
    get axisLock() { return axisLock; },
    set axisLock(value) { axisLock = value; },
    get axisKeyDown() { return axisKeyDown; },
    set axisKeyDown(value) { axisKeyDown = value; },
    get editDownPt() { return __editDownPt; },
    set editDownPt(value) { __editDownPt = value; },
    get editMoved() { return __editMoved; },
    set editMoved(value) { __editMoved = !!value; },
    get editClickIdx() { return __editClickIdx; },
    set editClickIdx(value) { __editClickIdx = Number(value) | 0; },
    get coordsInlineEditState() { return coordsInlineEditState; },
    set coordsInlineEditState(value) { coordsInlineEditState = value; },
    get addAtomOperatorSession() { return addAtomOperatorSession; },
    set addAtomOperatorSession(value) { addAtomOperatorSession = value; },
  };

  /**
   * Infer a persistent bond graph for one volume from current geometry.
   * @param {*} vol
   * @returns {Array<{id:string,a:string,b:string,order:number,kind:'normal'}>}
   */
  function inferVolumeBonds(vol) {
    if (!vol || !Array.isArray(vol.atoms)) return [];
    ensureVolumeAtomIds(vol);
    const atomPositions = buildBondAtomRecords(vol, { includeRenderColor: false });
    const edges = collectBondCandidates(atomPositions);
    inferBondOrders(atomPositions, edges);
    vol.bonds = edges.map((edge) => {
      const atomA = vol.atoms[edge.i];
      const atomB = vol.atoms[edge.j];
      const a = atomA ? ensureAtomId(atomA) : '';
      const b = atomB ? ensureAtomId(atomB) : '';
      return {
        id: buildVolumeBondId(a, b),
        a,
        b,
        order: normalizeEditAddBondOrder(edge.order || 1),
        kind: 'normal',
      };
    }).filter((bond) => bond.id && bond.a && bond.b && bond.a !== bond.b);
    return vol.bonds;
  }

  /**
   * Ensure one volume uses the minimal incremental schema.
   * @param {*} vol
   * @param {{inferMissingBonds?:boolean}=} options
   * @returns {*}
   */
  function ensureVolumeSchema(vol, options = {}) {
    return ensureVolumeSchemaCore(vol, {
      inferMissingBonds: options.inferMissingBonds,
      inferBonds: options.inferMissingBonds !== false ? inferVolumeBonds : null,
      rehydrateBuilderState: rehydrateBuilderStateForVolume,
    });
  }

  /**
   * Resolve persistent bonds to geometry-aware edge objects.
   * @param {*} vol
   * @param {Array<{pos:THREE.Vector3,Z:number,bondColor?:THREE.Color,displayRadius?:number}>} atomPositions
   * @returns {Array<{id:string,a:string,b:string,i:number,j:number,len:number,order:number,kind:'normal',maxOrder:number}>}
   */
  function getVolumeBondEdges(vol, atomPositions) {
    if (!vol || !Array.isArray(vol.atoms)) return [];
    ensureVolumeSchema(vol);
    const records = Array.isArray(atomPositions) ? atomPositions : buildBondAtomRecords(vol, { includeRenderColor: false });
    const atomIndexById = new Map();
    for (let i = 0; i < vol.atoms.length; i++) {
      const atom = vol.atoms[i];
      if (!atom) continue;
      atomIndexById.set(String(ensureAtomId(atom)), i);
    }
    const edges = [];
    const source = Array.isArray(vol.bonds) && vol.bonds.length ? vol.bonds : inferVolumeBonds(vol);
    for (const raw of source) {
      const bond = normalizeVolumeBondRecord(vol, raw);
      if (!bond) continue;
      const i = atomIndexById.get(bond.a);
      const j = atomIndexById.get(bond.b);
      if (!Number.isInteger(i) || !Number.isInteger(j) || i === j) continue;
      const aPos = records[i] && records[i].pos;
      const bPos = records[j] && records[j].pos;
      if (!aPos || !bPos || typeof aPos.distanceTo !== 'function') continue;
      edges.push({
        id: bond.id,
        a: bond.a,
        b: bond.b,
        i,
        j,
        len: aPos.distanceTo(bPos),
        order: normalizeEditAddBondOrder(bond.order || 1),
        kind: bond.kind,
        maxOrder: Math.max(
          normalizeEditAddBondOrder(bond.order || 1),
          getPairMaxBondOrder((vol.atoms[i] && vol.atoms[i].Z) | 0, (vol.atoms[j] && vol.atoms[j].Z) | 0)
        ),
      });
    }
    return edges;
  }

  /**
   * Deep-copy one atom array for history snapshots.
   * @param {{atoms?:Array<{id?:string,Z:number,x:number,y:number,z:number,formalCharge?:number}>}} vol
   * @returns {Array<{id:string,Z:number,x:number,y:number,z:number,formalCharge:number}>}
   */
  function cloneAtomsSnapshot(vol) {
    const atoms = vol && Array.isArray(vol.atoms) ? vol.atoms : [];
    return atoms.map((a) => normalizeVolumeAtom(a));
  }

  /**
   * Compare two atom snapshots by value.
   * @param {Array<{Z:number,x:number,y:number,z:number,formalCharge:number}>} a
   * @param {Array<{Z:number,x:number,y:number,z:number,formalCharge:number}>} b
   * @returns {boolean}
   */
  function atomsSnapshotsEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i], y = b[i];
      if (!x || !y) return false;
      if (String(x.id || '') !== String(y.id || '')) return false;
      if ((x.Z | 0) !== (y.Z | 0)) return false;
      if ((Number(x.formalCharge) | 0) !== (Number(y.formalCharge) | 0)) return false;
      if (Math.abs((x.x || 0) - (y.x || 0)) > 1e-12) return false;
      if (Math.abs((x.y || 0) - (y.y || 0)) > 1e-12) return false;
      if (Math.abs((x.z || 0) - (y.z || 0)) > 1e-12) return false;
    }
    return true;
  }

  /**
   * Deep-copy one volumetric grid transform snapshot (origin + axes).
   * Returns null for coordinate-only records.
   * @param {*} vol
   * @returns {{origin:number[],axes:number[][]}|null}
   */
  function cloneGridTransformSnapshot(vol) {
    if (!hasVolumetricGrid(vol)) return null;
    const originSrc = Array.isArray(vol.origin) ? vol.origin : [0, 0, 0];
    const axesSrc = Array.isArray(vol.axes) ? vol.axes : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const origin = [
      Number(originSrc[0]) || 0,
      Number(originSrc[1]) || 0,
      Number(originSrc[2]) || 0,
    ];
    const axes = [
      Array.isArray(axesSrc[0]) ? [Number(axesSrc[0][0]) || 0, Number(axesSrc[0][1]) || 0, Number(axesSrc[0][2]) || 0] : [1, 0, 0],
      Array.isArray(axesSrc[1]) ? [Number(axesSrc[1][0]) || 0, Number(axesSrc[1][1]) || 0, Number(axesSrc[1][2]) || 0] : [0, 1, 0],
      Array.isArray(axesSrc[2]) ? [Number(axesSrc[2][0]) || 0, Number(axesSrc[2][1]) || 0, Number(axesSrc[2][2]) || 0] : [0, 0, 1],
    ];
    return { origin, axes };
  }

  /**
   * Deep-copy one full coordinate snapshot for edits that may include volumetric transforms.
   * @param {*} vol
   * @returns {{atoms:Array<{Z:number,x:number,y:number,z:number,formalCharge:number}>,grid:{origin:number[],axes:number[][]}|null}}
   */
  function cloneCoordinateSnapshot(vol) {
    return {
      atoms: cloneAtomsSnapshot(vol),
      grid: cloneGridTransformSnapshot(vol),
    };
  }

  /**
   * Compare two 3-vectors by value with strict tolerance.
   * @param {number[]} a
   * @param {number[]} b
   * @returns {boolean}
   */
  function vec3Equal(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3) return false;
    if (Math.abs((a[0] || 0) - (b[0] || 0)) > 1e-12) return false;
    if (Math.abs((a[1] || 0) - (b[1] || 0)) > 1e-12) return false;
    if (Math.abs((a[2] || 0) - (b[2] || 0)) > 1e-12) return false;
    return true;
  }

  /**
   * Compare two volumetric grid snapshots by value.
   * @param {{origin:number[],axes:number[][]}|null} a
   * @param {{origin:number[],axes:number[][]}|null} b
   * @returns {boolean}
   */
  function gridSnapshotsEqual(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (!vec3Equal(a.origin, b.origin)) return false;
    if (!Array.isArray(a.axes) || !Array.isArray(b.axes) || a.axes.length < 3 || b.axes.length < 3) return false;
    if (!vec3Equal(a.axes[0], b.axes[0])) return false;
    if (!vec3Equal(a.axes[1], b.axes[1])) return false;
    if (!vec3Equal(a.axes[2], b.axes[2])) return false;
    return true;
  }

  /**
   * Compare two full coordinate snapshots.
   * @param {{atoms:Array<object>,grid:{origin:number[],axes:number[][]}|null}} a
   * @param {{atoms:Array<object>,grid:{origin:number[],axes:number[][]}|null}} b
   * @returns {boolean}
   */
  function coordinateSnapshotsEqual(a, b) {
    if (!a || !b) return false;
    if (!atomsSnapshotsEqual(a.atoms, b.atoms)) return false;
    if (!gridSnapshotsEqual(a.grid, b.grid)) return false;
    return true;
  }

  const editState = createEditStateController({
    getVolumes: () => volumes,
    getCurrentIndex: () => currentIndex,
    setCurrentIndex: (nextIndex) => { currentIndex = nextIndex; },
    ensureVolumeSchema,
    normalizeVolumeAtom,
    cloneJsonLike,
    cloneBondSnapshot,
    bondSnapshotsEqual,
    atomsSnapshotsEqual,
    coordinateSnapshotsEqual,
    createAtomSnapshotCommand,
    pruneBuilderOperationsForVolume,
    syncBuilderExtensionFromVolumes,
    activateVolumeIndex,
    clearTransientInteractionState,
    syncActiveVolumeControls,
    rebuildScene,
    updateSidePanel,
    setHintMessage,
    hasVolumetricGrid,
    editHistoryLimit: 200,
  });

  /**
   * Remove history entries whose volume records are no longer loaded.
   */
  function pruneEditHistory() {
    editState.pruneEditHistory();
  }

  /**
   * Reset edit history stacks.
   */
  function clearEditHistory() {
    editState.clearEditHistory();
  }

  /**
   * Record one reversible edit mutation for the active history stack.
   * @param {*} record
   * @param {Array<{Z:number,x:number,y:number,z:number,formalCharge:number}>} beforeAtoms
   * @param {Array<{Z:number,x:number,y:number,z:number,formalCharge:number}>} afterAtoms
   * @param {string} label
   * @param {{beforeFragmentOps?:Array<object>|null,afterFragmentOps?:Array<object>|null,beforeBonds?:Array<object>|null,afterBonds?:Array<object>|null}=} options
   */
  function pushEditHistoryEntry(record, beforeAtoms, afterAtoms, label, options = {}) {
    editState.pushEditHistoryEntry(record, beforeAtoms, afterAtoms, label, options);
  }

  /**
   * Record one reversible edit mutation including volumetric grid transform snapshots.
   * @param {*} record
   * @param {{atoms:Array<object>,grid:{origin:number[],axes:number[][]}|null}} before
   * @param {{atoms:Array<object>,grid:{origin:number[],axes:number[][]}|null}} after
   * @param {string} label
   */
  function pushCoordinateSnapshotHistoryEntry(record, before, after, label) {
    editState.pushCoordinateSnapshotHistoryEntry(record, before, after, label);
  }

  /**
   * Apply one stored atom snapshot to its volume record.
   * @param {*} record
   * @param {Array<{Z:number,x:number,y:number,z:number,formalCharge:number}>} atoms
   * @param {Array<object>|null=} fragmentOps
   * @param {Array<object>|null=} bonds
   * @returns {boolean}
   */
  function applyAtomsSnapshotToRecord(record, atoms, fragmentOps = undefined, bonds = undefined) {
    return editState.applyAtomsSnapshotToRecord(record, atoms, fragmentOps, bonds);
  }

  /**
   * Apply one full coordinate snapshot (atoms + optional grid transform) to a record.
   * @param {*} record
   * @param {{atoms:Array<{Z:number,x:number,y:number,z:number,formalCharge:number}>,grid:{origin:number[],axes:number[][]}|null}} snapshot
   * @returns {boolean}
   */
  function applyStructureSnapshotToRecord(record, snapshot) {
    return editState.applyStructureSnapshotToRecord(record, snapshot);
  }

  /**
   * Undo the most recent edit mutation.
   * @returns {boolean}
   */
  function undoLastEditAction() {
    return editState.undo();
  }

  /**
   * Redo the most recently undone edit mutation.
   * @returns {boolean}
   */
  function redoLastEditAction() {
    return editState.redo();
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
   * Normalize the explicit bond-tool action.
   * @param {*} value
   * @returns {'set'|'delete'}
   */
  function normalizeEditBondAction(value) {
    return String(value || '').trim().toLowerCase() === EDIT_BOND_ACTION.DELETE
      ? EDIT_BOND_ACTION.DELETE
      : EDIT_BOND_ACTION.SET;
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
    const scale = order >= 4 ? 0.76 : order >= 3 ? 0.82 : order === 2 ? 0.88 : 1.0;
    return Math.max(0.5, base * scale);
  }

  /**
   * Normalize a fragment id-like value.
   * @param {*} value
   * @returns {string}
   */
  function normalizeFragmentId(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  /**
   * Normalize fragment attach policy values.
   * @param {*} value
   * @returns {'auto'|'append'|'replace_h'|'fuse_ring'}
   */
  function normalizeEditFragmentAttachPolicy(value) {
    if (value === EDIT_FRAGMENT_ATTACH_POLICY.APPEND) return EDIT_FRAGMENT_ATTACH_POLICY.APPEND;
    if (value === EDIT_FRAGMENT_ATTACH_POLICY.REPLACE_H) return EDIT_FRAGMENT_ATTACH_POLICY.REPLACE_H;
    if (value === EDIT_FRAGMENT_ATTACH_POLICY.FUSE_RING) return EDIT_FRAGMENT_ATTACH_POLICY.FUSE_RING;
    return EDIT_FRAGMENT_ATTACH_POLICY.AUTO;
  }

  /**
   * Human-readable label for fragment attach policy.
   * @param {'auto'|'append'|'replace_h'|'fuse_ring'} policy
   * @returns {string}
   */
  function getEditFragmentAttachPolicyLabel(policy) {
    if (policy === EDIT_FRAGMENT_ATTACH_POLICY.APPEND) return 'Append';
    if (policy === EDIT_FRAGMENT_ATTACH_POLICY.REPLACE_H) return 'Replace H';
    if (policy === EDIT_FRAGMENT_ATTACH_POLICY.FUSE_RING) return 'Fuse ring';
    return 'Auto';
  }

  /**
   * Clamp cleanup strength to a stable 0..1 range.
   * @param {*} value
   * @returns {number}
   */
  function normalizeEditCleanupStrength(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0.6;
    return Math.max(0, Math.min(1, Math.round(n * 10) / 10));
  }

  /**
   * Refresh the cleanup strength readout in the fragment add pane.
   */
  function updateEditCleanupUiState() {
    if (editCleanupAutoEl) editCleanupAutoEl.checked = !!editAutoCleanupEnabled;
    if (editCleanupBondLengthEl) editCleanupBondLengthEl.checked = !!editCleanupBondLengthEnabled;
    if (editCleanupOverlapEl) editCleanupOverlapEl.checked = !!editCleanupOverlapEnabled;
    if (editCleanupStrengthEl && document.activeElement !== editCleanupStrengthEl) {
      editCleanupStrengthEl.value = normalizeEditCleanupStrength(editCleanupStrength).toFixed(1);
    }
    if (editCleanupStrengthValueEl) {
      editCleanupStrengthValueEl.textContent = normalizeEditCleanupStrength(editCleanupStrength).toFixed(1);
    }
  }

  /**
   * Resolve and return the currently selected fragment record.
   * @returns {*|null}
   */
  function getCurrentFragmentDefinition() {
    let fragment = getCatalogEntryById(editAddFragmentId, CATALOG_KIND.FRAGMENT);
    if (fragment) return fragment;
    const fragments = getCatalogEntries(CATALOG_KIND.FRAGMENT);
    if (!Array.isArray(fragments) || fragments.length === 0) return null;
    fragment = fragments[0];
    editAddFragmentId = fragment.id;
    return fragment;
  }

  /**
   * Resolve and return the currently selected Add-molecule record.
   * @returns {*|null}
   */
  function getCurrentMoleculeDefinition() {
    let molecule = getCatalogEntryById(editAddMoleculeId, CATALOG_KIND.MOLECULE);
    if (molecule) return molecule;
    const molecules = getCatalogEntries(CATALOG_KIND.MOLECULE);
    if (!Array.isArray(molecules) || molecules.length === 0) return null;
    molecule = getCatalogEntryById('benzene', CATALOG_KIND.MOLECULE) || molecules[0];
    editAddMoleculeId = molecule.id;
    return molecule;
  }

  /**
   * Return one connection atom descriptor from a fragment.
   * @param {*} fragment
   * @returns {{Z:number,x:number,y:number,z:number,index:number}|null}
   */
  function getFragmentConnectionAtom(fragment) {
    if (!fragment || !Array.isArray(fragment.atoms) || fragment.atoms.length === 0) return null;
    const idx = Math.max(0, Math.min(fragment.atoms.length - 1, Number(fragment.connectionAtomIndex) | 0));
    const atom = fragment.atoms[idx];
    if (!atom) return null;
    return {
      index: idx,
      Z: atom.Z | 0,
      x: Number(atom.x) || 0,
      y: Number(atom.y) || 0,
      z: Number(atom.z) || 0,
    };
  }

  /**
   * Resolve active attach settings for Add mode (atom or fragment).
   * @param {number} anchorZ
   * @returns {{mode:'atom'|'fragment'|'molecule',previewZ:number,bondOrder:number,bondLength:number,fragment:*|null}}
   */
  function getActiveAddAttachSettings(anchorZ) {
    if (editAddMode === EDIT_ADD_MODE.MOLECULE) {
      const molecule = getCurrentMoleculeDefinition();
      return {
        mode: EDIT_ADD_MODE.MOLECULE,
        previewZ: 6,
        bondOrder: 1,
        bondLength: 0,
        fragment: molecule || null,
      };
    }
    if (editAddMode === EDIT_ADD_MODE.FRAGMENT) {
      const fragment = getCurrentFragmentDefinition();
      const connAtom = getFragmentConnectionAtom(fragment);
      const z = connAtom ? (connAtom.Z | 0) : (editAddElementZ | 0);
      const preferred = fragment ? Number(fragment.preferredBondOrder) : NaN;
      const fallbackOrder = Number.isFinite(preferred) ? preferred : editAddBondOrder;
      const order = normalizeEditAddBondOrder(fallbackOrder);
      return {
        mode: EDIT_ADD_MODE.FRAGMENT,
        previewZ: z,
        bondOrder: order,
        bondLength: getEditAddBondLength(anchorZ | 0, z | 0, order),
        fragment: fragment || null,
      };
    }
    const z = editAddElementZ | 0;
    const order = normalizeEditAddBondOrder(editAddBondOrder);
    return {
      mode: EDIT_ADD_MODE.ATOM,
      previewZ: z,
      bondOrder: order,
      bondLength: getEditAddBondLength(anchorZ | 0, z | 0, order),
      fragment: null,
    };
  }

  /**
   * Create one editable empty file record and make it active.
   * @param {{name?:string}=} options
   * @returns {{name:string,vol:*}|null}
   */
  function createNewEditableVolumeRecord(options = {}) {
    return editState.createNewEditableVolumeRecord(options);
  }

  /**
   * Ensure one file name is unique among loaded records.
   * Appends ` (n)` before extension when needed.
   * @param {string} name
   * @param {{excludeRecord?:*}=} options
   * @returns {string}
   */
  function getUniqueVolumeName(name, options = {}) {
    const baseName = String(name || '').trim();
    if (!baseName) return '';
    const excludeRecord = options.excludeRecord || null;
    const lower = (s) => String(s || '').trim().toLowerCase();
    const exists = (candidate) => volumes.some((v) => v && v !== excludeRecord && lower(v.name) === lower(candidate));
    if (!exists(baseName)) return baseName;
    const m = /^(.*?)(\.[^.]*)?$/.exec(baseName) || [];
    const stem = (m[1] && m[1].trim()) || 'untitled';
    const ext = m[2] || '';
    let n = 2;
    let candidate = `${stem} (${n})${ext}`;
    while (exists(candidate)) {
      n += 1;
      candidate = `${stem} (${n})${ext}`;
    }
    return candidate;
  }

  /**
   * Ensure there is an active editable target volume and return its record.
   * If no file is loaded, this creates an empty angstrom XYZ-like record.
   * @returns {{name:string,vol:*}|null}
   */
  function ensureEditableVolumeRecord() {
    return editState.ensureEditableVolumeRecord();
  }

  const editPlacement = createEditPlacementController({
    THREE,
    state: editPlacementState,
    controls,
    addMoleculePreviewGroup,
    addFusePreviewGroup,
    clearGroup,
    clearAddGrowPreview,
    setHintMessage,
    buildCatalogInstance,
    buildMoleculePlacementData,
    rebuildMoleculePlacementPreviewMeshes,
    updateMoleculePlacementPreviewTransform,
    updateMoleculePlacementOperatorUi,
    updateAddAtomOperatorUi,
    updateEditToolboxUi,
    ensureEditableVolumeRecord,
    ensureVolumeSchema,
    cloneAtomsSnapshot,
    cloneBondSnapshot,
    cloneJsonLike,
    allocateBuilderGroupId,
    allocateBuilderOpId,
    ensureAtomId,
    ensureVolumeAtomIds,
    setAtomBuilderMeta,
    normalizeBuilderOperationEntry,
    rehydrateBuilderStateForVolume,
    syncBuilderExtensionFromVolumes,
    worldToAtomUnits,
    atomUnitsToAng,
    normalizeEditAddBondOrder,
    collectBondCandidates,
    inferBondOrders,
    upsertVolumeBond,
    pushEditHistoryEntry,
    clearHover,
    rebuildScene,
    updateSidePanel,
    getElementSymbol,
    getElementName,
    getFragmentConnectionAtom,
    getFragmentConnectionOutwardDirection,
    resolveFragmentAttachPolicy,
    applyLocalFragmentCleanup,
    evaluateBuilderPlacementWarnings,
    getEditAddBondLength,
    applyMethylAttachmentGeometry,
    applyHydroxylAttachmentGeometry,
    inferVolumeBonds,
    pruneBuilderOperationsForVolume,
    getCamera: () => camera,
    buildFuseRingPlacementGeometry,
    rebuildFuseRingPreviewMeshes,
    getEditAddMoleculeId: () => editAddMoleculeId,
    getEditAddFragmentId: () => editAddFragmentId,
    getEditAddBondOrder: () => editAddBondOrder,
    getEditAddFragmentAttachPolicy: () => editAddFragmentAttachPolicy,
    CATALOG_KIND,
    EDIT_FRAGMENT_ATTACH_POLICY,
    getVolumes: () => volumes,
    applyAtomsSnapshotToRecord,
    atomsSnapshotsEqual,
    onDeleteAtomPostprocess: (idx, removed, vol) => {
      editAtomSelectionIndices = getEditAtomSelection()
        .filter((i) => i !== idx)
        .map((i) => (i > idx ? i - 1 : i));
      editSel = editSel
        .filter((i) => i !== idx)
        .map((i) => (i > idx ? i - 1 : i));
      updateSelectedHalos();
      updateEditSelectionVisuals();
      updateEditAdaptiveMenuUi();
    },
  });

  const editTools = createEditToolsController({
    state: editToolState,
    EDIT_TOOL,
    EDIT_BOND_ACTION,
    EDIT_ADD_MODE,
    EDIT_FRAGMENT_ATTACH_POLICY,
    EDIT_TRANSFORM_MODE,
    getActiveRecord: () => ((currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null),
    isEditMode: () => editMode,
    finalizeAddAtomOperatorSession,
    hideAllAdaptiveToolPopovers,
    updateAxisGuideLine,
    clearAddGrowPreview,
    clearMoleculePlacementPreview,
    clearFuseRingPreview,
    clearEditBondPendingSelection,
    clearTransformState,
    clearTransformSelection,
    clearHover,
    updateEditToolboxUi,
    updateAxisButtons,
    getCurrentFragmentDefinition,
    getCurrentMoleculeDefinition,
    getElementSymbol,
    getElementName,
    getEditFragmentAttachPolicyLabel,
    getEditTransformModeLabel,
    getEditTransformScopeLabel,
    refreshActiveAddGrowPreview,
    normalizeEditAddBondOrder,
    setHintMessage,
    clearMeasurementSelectionForContextChange,
    setCoordsHoveredAtomIndex,
    setCoordsInlineEditState: (value) => { coordsInlineEditState = value; },
    getBondEditing: () => bondEditing,
    onSelectionChanged: () => {
      updateSelectedHalos();
      updateEditAdaptiveMenuUi();
    },
  });

  /**
   * Estimate the local \"outward\" axis from the fragment connection atom.
   * This axis points from the connection atom toward the fragment interior.
   * @param {*} fragment
   * @returns {THREE.Vector3}
   */
  function getFragmentConnectionOutwardDirection(fragment) {
    const conn = getFragmentConnectionAtom(fragment);
    if (!conn) return new THREE.Vector3(1, 0, 0);
    if (fragment && Array.isArray(fragment.linkBondDirection) && fragment.linkBondDirection.length >= 3) {
      const lx = Number(fragment.linkBondDirection[0]);
      const ly = Number(fragment.linkBondDirection[1]);
      const lz = Number(fragment.linkBondDirection[2]);
      if ([lx, ly, lz].every(Number.isFinite)) {
        const link = new THREE.Vector3(lx, ly, lz);
        if (link.lengthSq() > 1e-12) {
          // linkBondDirection points from connection atom toward anchor;
          // for placement we need the opposite (toward fragment interior).
          return link.multiplyScalar(-1).normalize();
        }
      }
    }
    const connPos = new THREE.Vector3(conn.x, conn.y, conn.z);
    const neighbors = [];
    if (Array.isArray(fragment && fragment.bonds)) {
      for (const bond of fragment.bonds) {
        if (!bond) continue;
        const i = Number(bond.i) | 0;
        const j = Number(bond.j) | 0;
        let other = -1;
        if (i === conn.index) other = j;
        else if (j === conn.index) other = i;
        if (other < 0 || !fragment.atoms[other]) continue;
        const a = fragment.atoms[other];
        neighbors.push(new THREE.Vector3(Number(a.x) || 0, Number(a.y) || 0, Number(a.z) || 0));
      }
    }
    if (neighbors.length > 0) {
      const c = new THREE.Vector3();
      for (const p of neighbors) c.add(p);
      c.multiplyScalar(1 / neighbors.length);
      const d = c.sub(connPos);
      if (d.lengthSq() > 1e-12) return d.normalize();
    }
    if (Array.isArray(fragment && fragment.atoms)) {
      const c = new THREE.Vector3();
      let count = 0;
      for (let i = 0; i < fragment.atoms.length; i++) {
        if (i === conn.index) continue;
        const a = fragment.atoms[i];
        c.add(new THREE.Vector3(Number(a.x) || 0, Number(a.y) || 0, Number(a.z) || 0));
        count += 1;
      }
      if (count > 0) {
        c.multiplyScalar(1 / count);
        const d = c.sub(connPos);
        if (d.lengthSq() > 1e-12) return d.normalize();
      }
    }
    return new THREE.Vector3(1, 0, 0);
  }

  /**
   * Find one hydrogen bonded to the anchor atom, preferring collinearity with
   * the requested placement direction.
   * @param {*} vol
   * @param {number} anchorIndex
   * @param {THREE.Vector3|null} preferredDir
   * @returns {{index:number,direction:THREE.Vector3,score:number}|null}
   */
  function findAnchorReplaceableHydrogen(vol, anchorIndex, preferredDir) {
    if (!vol || !Array.isArray(vol.atoms) || vol.atoms.length === 0) return null;
    const anchor = anchorIndex | 0;
    if (anchor < 0 || anchor >= vol.atoms.length) return null;
    const records = buildBondAtomRecords(vol, { includeRenderColor: false });
    const edges = getVolumeBondEdges(vol, records);
    let best = null;
    let bestScore = -Infinity;
    for (const edge of edges) {
      if (!edge) continue;
      let hIndex = -1;
      if (edge.i === anchor) hIndex = edge.j;
      else if (edge.j === anchor) hIndex = edge.i;
      if (hIndex < 0) continue;
      if (!vol.atoms[hIndex] || (vol.atoms[hIndex].Z | 0) !== 1) continue;
      const dir = records[hIndex].pos.clone().sub(records[anchor].pos);
      const dist = dir.length();
      if (!(dist > 1e-8)) continue;
      dir.normalize();
      const dot = (preferredDir && preferredDir.isVector3) ? dir.dot(preferredDir) : 0;
      // Favor collinearity first, then shorter H bond lengths.
      const score = dot * 2.0 - dist * 0.05;
      if (!best || score > bestScore) {
        best = { index: hIndex, direction: dir, score };
        bestScore = score;
      }
    }
    return best;
  }

  /**
   * Count severe post-placement overlaps for user warnings.
   * @param {*} vol
   * @param {number[]} newAtomIndices
   * @param {Set<number>} oldAtomIndexSet
   * @returns {{count:number,minRatio:number}}
   */
  function detectSevereFragmentOverlaps(vol, newAtomIndices, oldAtomIndexSet) {
    if (!vol || !Array.isArray(vol.atoms)) return { count: 0, minRatio: Infinity };
    const newIdx = Array.isArray(newAtomIndices) ? newAtomIndices : [];
    const oldSet = oldAtomIndexSet instanceof Set ? oldAtomIndexSet : new Set();
    let count = 0;
    let minRatio = Infinity;
    for (const i of newIdx) {
      const ai = vol.atoms[i];
      if (!ai) continue;
      const pi = atomUnitsToAng(vol, ai);
      const ri = getCovalentRadiusAngstrom(ai.Z | 0);
      for (const j of oldSet) {
        const aj = vol.atoms[j];
        if (!aj) continue;
        const pj = atomUnitsToAng(vol, aj);
        const rj = getCovalentRadiusAngstrom(aj.Z | 0);
        const sumR = Math.max(0.1, ri + rj);
        const d = pi.distanceTo(pj);
        const ratio = d / sumR;
        if (ratio < minRatio) minRatio = ratio;
        if (ratio < 0.55) count += 1;
      }
    }
    return { count, minRatio };
  }

  /**
   * Determine the active fragment attach policy for one placement.
   * @param {*} fragment
   * @param {*} vol
   * @param {number} anchorIndex
   * @param {THREE.Vector3} attachDir
   * @returns {{policy:'append'|'replace_h'|'fuse_ring',replaceHydrogen?:{index:number,direction:THREE.Vector3,score:number}|null,error?:string}}
   */
  function resolveFragmentAttachPolicy(fragment, vol, anchorIndex, attachDir) {
    const allowed = Array.isArray(fragment && fragment.attachModes) ? fragment.attachModes : [];
    const requested = normalizeEditFragmentAttachPolicy(editAddFragmentAttachPolicy);
    const replaceHydrogen = findAnchorReplaceableHydrogen(vol, anchorIndex, attachDir);
    if (requested === EDIT_FRAGMENT_ATTACH_POLICY.FUSE_RING) {
      if (!allowed.includes(EDIT_FRAGMENT_ATTACH_POLICY.FUSE_RING)) {
        return { policy: EDIT_FRAGMENT_ATTACH_POLICY.APPEND, error: 'Selected fragment does not support fuse-ring placement.' };
      }
      return { policy: EDIT_FRAGMENT_ATTACH_POLICY.FUSE_RING, replaceHydrogen: null };
    }
    if (requested === EDIT_FRAGMENT_ATTACH_POLICY.REPLACE_H) {
      if (!replaceHydrogen) {
        return { policy: EDIT_FRAGMENT_ATTACH_POLICY.REPLACE_H, replaceHydrogen: null, error: 'Replace H requires a bonded hydrogen on the anchor atom.' };
      }
      return { policy: EDIT_FRAGMENT_ATTACH_POLICY.REPLACE_H, replaceHydrogen };
    }
    if (requested === EDIT_FRAGMENT_ATTACH_POLICY.APPEND) {
      return { policy: EDIT_FRAGMENT_ATTACH_POLICY.APPEND, replaceHydrogen: null };
    }
    if (replaceHydrogen && allowed.includes(EDIT_FRAGMENT_ATTACH_POLICY.REPLACE_H)) {
      return { policy: EDIT_FRAGMENT_ATTACH_POLICY.REPLACE_H, replaceHydrogen };
    }
    return { policy: EDIT_FRAGMENT_ATTACH_POLICY.APPEND, replaceHydrogen: null };
  }

  /**
   * Reassert the intended anchor-connection bond length by rigidly shifting newly
   * inserted atoms along the anchor-connection axis.
   * @param {*} vol
   * @param {number} anchorIndex
   * @param {number[]} newIndices
   * @param {number} connectionGlobalIndex
   * @param {number} targetLengthAngstrom
   */
  function cleanupInsertedFragmentBondLength(vol, anchorIndex, newIndices, connectionGlobalIndex, targetLengthAngstrom) {
    if (!vol || !Array.isArray(vol.atoms) || !Array.isArray(newIndices)) return;
    if (anchorIndex < 0 || anchorIndex >= vol.atoms.length) return;
    if (connectionGlobalIndex < 0 || connectionGlobalIndex >= vol.atoms.length) return;
    const anchorPos = atomUnitsToAng(vol, vol.atoms[anchorIndex]);
    const connPos = atomUnitsToAng(vol, vol.atoms[connectionGlobalIndex]);
    const axis = connPos.clone().sub(anchorPos);
    const currentLength = axis.length();
    if (!(currentLength > 1e-8)) return;
    axis.normalize();
    const delta = (Number(targetLengthAngstrom) || 0) - currentLength;
    if (Math.abs(delta) <= 1e-8) return;
    for (const idx of newIndices) {
      if (!vol.atoms[idx]) continue;
      const pos = atomUnitsToAng(vol, vol.atoms[idx]).addScaledVector(axis, delta);
      const coords = worldToAtomUnits(vol, pos);
      vol.atoms[idx].x = coords[0];
      vol.atoms[idx].y = coords[1];
      vol.atoms[idx].z = coords[2];
    }
  }

  /**
   * Shift newly inserted atoms outward along the attach axis to reduce
   * severe overlaps without distorting host atoms or fragment dihedral.
   * @param {*} vol
   * @param {number[]} newIndices
   * @param {Set<number>} oldAtomIndexSet
   * @param {THREE.Vector3} attachDir
   * @param {number} strength
   * @returns {number}
   */
  function cleanupInsertedFragmentOverlapRelief(vol, newIndices, oldAtomIndexSet, attachDir, strength) {
    if (!vol || !Array.isArray(vol.atoms) || !Array.isArray(newIndices) || !(oldAtomIndexSet instanceof Set)) return 0;
    const axis = (attachDir && attachDir.isVector3) ? attachDir.clone() : new THREE.Vector3(0, 0, 1);
    if (axis.lengthSq() < 1e-10) return 0;
    axis.normalize();
    const amount = normalizeEditCleanupStrength(strength);
    if (amount <= 1e-6) return 0;
    let maxDelta = 0;
    for (const newIdxRaw of newIndices) {
      const newIdx = Number(newIdxRaw) | 0;
      const newAtom = vol.atoms[newIdx];
      if (!newAtom) continue;
      const newPos = atomUnitsToAng(vol, newAtom);
      const newRadius = getCovalentRadiusAngstrom(newAtom.Z | 0);
      for (const oldIdx of oldAtomIndexSet) {
        const oldAtom = vol.atoms[oldIdx];
        if (!oldAtom) continue;
        const oldPos = atomUnitsToAng(vol, oldAtom);
        const oldRadius = getCovalentRadiusAngstrom(oldAtom.Z | 0);
        const threshold = Math.max(0.45, 0.72 * (newRadius + oldRadius));
        const distance = newPos.distanceTo(oldPos);
        if (!(distance < threshold)) continue;
        maxDelta = Math.max(maxDelta, threshold - distance);
      }
    }
    const delta = Math.min(0.45, maxDelta * amount);
    if (!(delta > 1e-6)) return 0;
    for (const idx of newIndices) {
      if (!vol.atoms[idx]) continue;
      const pos = atomUnitsToAng(vol, vol.atoms[idx]).addScaledVector(axis, delta);
      const coords = worldToAtomUnits(vol, pos);
      vol.atoms[idx].x = coords[0];
      vol.atoms[idx].y = coords[1];
      vol.atoms[idx].z = coords[2];
    }
    return delta;
  }

  /**
   * Reassert moved-to-fixed bond lengths after one transform without moving
   * atoms outside the transformed selection.
   * @param {*} vol
   * @param {number[]} movedIndices
   * @returns {number}
   */
  function cleanupTransformedBondLengths(vol, movedIndices) {
    if (!vol || !Array.isArray(vol.atoms) || !Array.isArray(movedIndices) || !movedIndices.length) return 0;
    const moved = Array.from(new Set(movedIndices.filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < vol.atoms.length)));
    if (!moved.length) return 0;
    const movedSet = new Set(moved);
    const records = buildBondAtomRecords(vol, { includeRenderColor: false });
    const edges = getVolumeBondEdges(vol, records);
    const adjustments = new Map();
    let maxShift = 0;
    for (const edge of edges) {
      if (!edge) continue;
      const i = edge.i | 0;
      const j = edge.j | 0;
      const iMoved = movedSet.has(i);
      const jMoved = movedSet.has(j);
      if (iMoved === jMoved) continue;
      const movedIdx = iMoved ? i : j;
      const fixedIdx = iMoved ? j : i;
      const movedAtom = vol.atoms[movedIdx];
      const fixedAtom = vol.atoms[fixedIdx];
      if (!movedAtom || !fixedAtom) continue;
      const fixedPos = atomUnitsToAng(vol, fixedAtom);
      const movedPos = atomUnitsToAng(vol, movedAtom);
      let axis = movedPos.clone().sub(fixedPos);
      let currentLength = axis.length();
      if (currentLength <= 1e-10) {
        axis.set(0, 0, 1);
        currentLength = 1e-10;
      } else {
        axis.normalize();
      }
      const targetLength = getEditAddBondLength(fixedAtom.Z | 0, movedAtom.Z | 0, 1);
      const delta = targetLength - currentLength;
      if (Math.abs(delta) <= 1e-5) continue;
      const prev = adjustments.get(movedIdx) || { vec: new THREE.Vector3(), count: 0 };
      prev.vec.addScaledVector(axis, delta);
      prev.count += 1;
      adjustments.set(movedIdx, prev);
    }
    for (const [idx, entry] of adjustments.entries()) {
      const atom = vol.atoms[idx];
      if (!atom || !entry || !entry.vec) continue;
      const shift = entry.vec.clone().multiplyScalar(1 / Math.max(1, entry.count));
      maxShift = Math.max(maxShift, shift.length());
      const pos = atomUnitsToAng(vol, atom).add(shift);
      const coords = worldToAtomUnits(vol, pos);
      atom.x = coords[0];
      atom.y = coords[1];
      atom.z = coords[2];
    }
    return maxShift;
  }

  /**
   * Push moved atoms outward from severe overlaps with fixed atoms after a transform.
   * @param {*} vol
   * @param {number[]} movedIndices
   * @param {number=} strength
   * @returns {number}
   */
  function cleanupTransformedOverlapRelief(vol, movedIndices, strength = editCleanupStrength) {
    if (!vol || !Array.isArray(vol.atoms) || !Array.isArray(movedIndices) || !movedIndices.length) return 0;
    const moved = Array.from(new Set(movedIndices.filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < vol.atoms.length)));
    if (!moved.length) return 0;
    const movedSet = new Set(moved);
    const amount = normalizeEditCleanupStrength(strength);
    if (amount <= 1e-6) return 0;
    let maxShift = 0;
    for (const idx of moved) {
      const atom = vol.atoms[idx];
      if (!atom) continue;
      const pos = atomUnitsToAng(vol, atom);
      const rI = getCovalentRadiusAngstrom(atom.Z | 0);
      const shift = new THREE.Vector3();
      let contributors = 0;
      for (let j = 0; j < vol.atoms.length; j++) {
        if (movedSet.has(j)) continue;
        const other = vol.atoms[j];
        if (!other) continue;
        const otherPos = atomUnitsToAng(vol, other);
        const rJ = getCovalentRadiusAngstrom(other.Z | 0);
        const threshold = Math.max(0.45, 0.72 * (rI + rJ));
        const delta = pos.clone().sub(otherPos);
        let dist = delta.length();
        if (dist <= 1e-10) {
          delta.set(0, 0, 1);
          dist = 1e-10;
        }
        if (dist >= threshold) continue;
        delta.normalize();
        shift.addScaledVector(delta, threshold - dist);
        contributors += 1;
      }
      if (!contributors) continue;
      const applied = shift.multiplyScalar(amount / contributors);
      maxShift = Math.max(maxShift, applied.length());
      const nextPos = pos.clone().add(applied);
      const coords = worldToAtomUnits(vol, nextPos);
      atom.x = coords[0];
      atom.y = coords[1];
      atom.z = coords[2];
    }
    return maxShift;
  }

  /**
   * Apply a lightweight cleanup pass to moved atoms after a transform gesture.
   * Only moved atoms are adjusted.
   * @param {*} vol
   * @param {number[]} movedIndices
   * @returns {{bondLengthShift:number,overlapShift:number}}
   */
  function applyLocalTransformCleanup(vol, movedIndices) {
    const result = { bondLengthShift: 0, overlapShift: 0 };
    if (!editTransformAutoCleanupEnabled) return result;
    if (editCleanupBondLengthEnabled) {
      result.bondLengthShift = cleanupTransformedBondLengths(vol, movedIndices);
    }
    if (editCleanupOverlapEnabled) {
      result.overlapShift = cleanupTransformedOverlapRelief(vol, movedIndices, editCleanupStrength);
    }
    return result;
  }

  /**
   * Apply the configured lightweight fragment cleanup pass.
   * @param {*} vol
   * @param {number} anchorIndex
   * @param {number[]} newIndices
   * @param {number} connectionGlobalIndex
   * @param {number} targetLengthAngstrom
   * @param {Set<number>} oldAtomIndexSet
   * @param {THREE.Vector3} attachDir
   * @param {{force?:boolean}=} options
   * @returns {{bondLengthApplied:boolean,overlapShift:number}}
   */
  function applyLocalFragmentCleanup(vol, anchorIndex, newIndices, connectionGlobalIndex, targetLengthAngstrom, oldAtomIndexSet, attachDir, options = {}) {
    const result = { bondLengthApplied: false, overlapShift: 0 };
    if (!options.force && !editAutoCleanupEnabled) return result;
    if (editCleanupBondLengthEnabled) {
      cleanupInsertedFragmentBondLength(vol, anchorIndex, newIndices, connectionGlobalIndex, targetLengthAngstrom);
      result.bondLengthApplied = true;
    }
    if (editCleanupOverlapEnabled) {
      result.overlapShift = cleanupInsertedFragmentOverlapRelief(
        vol,
        newIndices,
        oldAtomIndexSet,
        attachDir,
        editCleanupStrength
      );
    }
    return result;
  }

  /**
   * Compute non-blocking builder warnings for newly inserted atoms.
   * @param {*} vol
   * @param {number[]} newAtomIndices
   * @param {Set<number>} oldAtomIndexSet
   * @param {number[]} hostIndices
   * @returns {{overlapCount:number,valencePressureCount:number}}
   */
  function evaluateBuilderPlacementWarnings(vol, newAtomIndices, oldAtomIndexSet, hostIndices = []) {
    const overlap = detectSevereFragmentOverlaps(vol, newAtomIndices, oldAtomIndexSet);
    if (!vol || !Array.isArray(vol.atoms)) {
      return { overlapCount: overlap.count, valencePressureCount: 0 };
    }
    const records = buildBondAtomRecords(vol, { includeRenderColor: false });
    const edges = getVolumeBondEdges(vol, records);
    const valenceByAtom = new Map();
    for (const edge of edges) {
      if (!edge) continue;
      const order = normalizeEditAddBondOrder(edge.order || 1);
      valenceByAtom.set(edge.i, (valenceByAtom.get(edge.i) || 0) + order);
      valenceByAtom.set(edge.j, (valenceByAtom.get(edge.j) || 0) + order);
    }
    const relevant = new Set([...(Array.isArray(newAtomIndices) ? newAtomIndices : []), ...(Array.isArray(hostIndices) ? hostIndices : [])]);
    let valencePressureCount = 0;
    for (const idx of relevant) {
      const atom = vol.atoms[idx];
      if (!atom) continue;
      const currentValence = valenceByAtom.get(idx) || 0;
      const target = chooseTargetValence(atom.Z | 0, currentValence);
      if (currentValence > target) valencePressureCount += 1;
    }
    return {
      overlapCount: overlap.count,
      valencePressureCount,
    };
  }

  /**
   * For methyl attachment, enforce a tetrahedral CH3 geometry relative to the
   * anchor->connection axis:
   * - angle(linked atom -> new atom, C-H) = 109.5°
   * - methyl H dihedrals around the bond axis = 0°, 120°, 240°.
   * @param {*} vol
   * @param {*} fragment
   * @param {number[]} newIndices
   * @param {THREE.Vector3} anchorWorld
   * @param {THREE.Vector3} connectionWorld
   * @param {THREE.Vector3} attachDir
   */
  function applyMethylAttachmentGeometry(vol, fragment, newIndices, anchorWorld, connectionWorld, attachDir) {
    if (!vol || !fragment || normalizeFragmentId(fragment.id) !== 'methyl') return;
    if (!Array.isArray(newIndices) || newIndices.length !== (Array.isArray(fragment.atoms) ? fragment.atoms.length : 0)) return;
    const conn = getFragmentConnectionAtom(fragment);
    if (!conn) return;

    const localHydrogenIndices = [];
    if (Array.isArray(fragment.bonds)) {
      for (const bond of fragment.bonds) {
        if (!bond) continue;
        const i = Number(bond.i) | 0;
        const j = Number(bond.j) | 0;
        let other = -1;
        if (i === conn.index) other = j;
        else if (j === conn.index) other = i;
        if (other < 0 || !fragment.atoms[other]) continue;
        if ((fragment.atoms[other].Z | 0) === 1) localHydrogenIndices.push(other);
      }
    }
    if (localHydrogenIndices.length < 3) {
      for (let i = 0; i < fragment.atoms.length; i++) {
        if (i === conn.index) continue;
        if ((fragment.atoms[i].Z | 0) === 1) localHydrogenIndices.push(i);
      }
    }
    const uniqueHydrogenLocal = Array.from(new Set(localHydrogenIndices)).slice(0, 3);
    if (uniqueHydrogenLocal.length < 3) return;

    const axis = (attachDir && attachDir.isVector3 ? attachDir.clone() : connectionWorld.clone().sub(anchorWorld));
    if (axis.lengthSq() < 1e-12) return;
    axis.normalize();
    const linkedDirectionFromCarbon = axis.clone().negate(); // C -> anchor
    let ref = new THREE.Vector3(0, 1, 0);
    if (Math.abs(ref.dot(linkedDirectionFromCarbon)) > 0.95) ref.set(1, 0, 0);
    const u = ref.sub(linkedDirectionFromCarbon.clone().multiplyScalar(ref.dot(linkedDirectionFromCarbon)));
    if (u.lengthSq() < 1e-12) return;
    u.normalize();
    const v = new THREE.Vector3().crossVectors(linkedDirectionFromCarbon, u).normalize();

    const angleDeg = 109.5;
    const angleRad = THREE.MathUtils.degToRad(angleDeg);
    const sinA = Math.sin(angleRad);
    const cosA = Math.cos(angleRad);
    const dihedralsDeg = [0, 120, 240];
    const chLen = getEditAddBondLength(conn.Z | 0, 1, 1);

    for (let k = 0; k < 3; k++) {
      const localIdx = uniqueHydrogenLocal[k];
      const globalIdx = newIndices[localIdx];
      const atom = vol.atoms[globalIdx];
      if (!atom) continue;
      const phi = THREE.MathUtils.degToRad(dihedralsDeg[k]);
      const dir = linkedDirectionFromCarbon.clone().multiplyScalar(cosA)
        .add(u.clone().multiplyScalar(sinA * Math.cos(phi)))
        .add(v.clone().multiplyScalar(sinA * Math.sin(phi)))
        .normalize();
      const hWorld = connectionWorld.clone().addScaledVector(dir, chLen);
      const coords = worldToAtomUnits(vol, hWorld);
      atom.x = coords[0];
      atom.y = coords[1];
      atom.z = coords[2];
    }
  }

  /**
   * For hydroxyl attachment, enforce a water-like L-O-H bend:
   * - angle(linked atom -> new atom, O-H) = 104.5°.
   * Azimuth around the linked-axis is deterministic (world-up projected plane).
   * @param {*} vol
   * @param {*} fragment
   * @param {number[]} newIndices
   * @param {THREE.Vector3} anchorWorld
   * @param {THREE.Vector3} connectionWorld
   */
  function applyHydroxylAttachmentGeometry(vol, fragment, newIndices, anchorWorld, connectionWorld) {
    if (!vol || !fragment || normalizeFragmentId(fragment.id) !== 'hydroxyl') return;
    if (!Array.isArray(newIndices) || newIndices.length !== (Array.isArray(fragment.atoms) ? fragment.atoms.length : 0)) return;
    const conn = getFragmentConnectionAtom(fragment);
    if (!conn) return;

    let localHydrogenIndex = -1;
    if (Array.isArray(fragment.bonds)) {
      for (const bond of fragment.bonds) {
        if (!bond) continue;
        const i = Number(bond.i) | 0;
        const j = Number(bond.j) | 0;
        let other = -1;
        if (i === conn.index) other = j;
        else if (j === conn.index) other = i;
        if (other < 0 || !fragment.atoms[other]) continue;
        if ((fragment.atoms[other].Z | 0) === 1) {
          localHydrogenIndex = other;
          break;
        }
      }
    }
    if (localHydrogenIndex < 0) {
      for (let i = 0; i < fragment.atoms.length; i++) {
        if (i === conn.index) continue;
        if ((fragment.atoms[i].Z | 0) === 1) {
          localHydrogenIndex = i;
          break;
        }
      }
    }
    if (localHydrogenIndex < 0) return;

    const globalHydrogenIndex = newIndices[localHydrogenIndex];
    const hydrogenAtom = vol.atoms[globalHydrogenIndex];
    if (!hydrogenAtom) return;

    const axisToLink = anchorWorld.clone().sub(connectionWorld);
    if (axisToLink.lengthSq() < 1e-12) return;
    axisToLink.normalize();

    let ref = new THREE.Vector3(0, 1, 0);
    if (Math.abs(ref.dot(axisToLink)) > 0.95) ref.set(1, 0, 0);
    const perp = ref.sub(axisToLink.clone().multiplyScalar(ref.dot(axisToLink)));
    if (perp.lengthSq() < 1e-12) return;
    perp.normalize();

    const angleDeg = 104.5;
    const angleRad = THREE.MathUtils.degToRad(angleDeg);
    const dir = axisToLink.clone().multiplyScalar(Math.cos(angleRad))
      .add(perp.multiplyScalar(Math.sin(angleRad)))
      .normalize();

    const connAtomLocal = fragment.atoms[conn.index];
    const hAtomLocal = fragment.atoms[localHydrogenIndex];
    const localOH = (connAtomLocal && hAtomLocal)
      ? Math.hypot(
        (Number(hAtomLocal.x) || 0) - (Number(connAtomLocal.x) || 0),
        (Number(hAtomLocal.y) || 0) - (Number(connAtomLocal.y) || 0),
        (Number(hAtomLocal.z) || 0) - (Number(connAtomLocal.z) || 0)
      )
      : NaN;
    const ohLen = Number.isFinite(localOH) && localOH > 0.1 ? localOH : 0.96;
    const hWorld = connectionWorld.clone().addScaledVector(dir, ohLen);
    const coords = worldToAtomUnits(vol, hWorld);
    hydrogenAtom.x = coords[0];
    hydrogenAtom.y = coords[1];
    hydrogenAtom.z = coords[2];
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
    const edges = getVolumeBondEdges(vol, records);
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
   * Normalize transform-scope values.
   * @param {*} value
   * @returns {'auto'|'fragment'|'molecule'|'all'}
   */
  function normalizeEditTransformScope(value) {
    if (value === EDIT_TRANSFORM_SCOPE.FRAGMENT) return EDIT_TRANSFORM_SCOPE.FRAGMENT;
    if (value === EDIT_TRANSFORM_SCOPE.MOLECULE) return EDIT_TRANSFORM_SCOPE.MOLECULE;
    if (value === EDIT_TRANSFORM_SCOPE.ALL) return EDIT_TRANSFORM_SCOPE.ALL;
    return EDIT_TRANSFORM_SCOPE.AUTO;
  }

  /**
   * Normalize transform-action values.
   * @param {*} value
   * @returns {'move'|'rotate'}
   */
  function normalizeEditTransformMode(value) {
    if (value === EDIT_TRANSFORM_MODE.ROTATE_FRAGMENT) return EDIT_TRANSFORM_MODE.ROTATE_FRAGMENT;
    if (value === EDIT_TRANSFORM_MODE.ROTATE_BOND) return EDIT_TRANSFORM_MODE.ROTATE_BOND;
    return EDIT_TRANSFORM_MODE.MOVE;
  }

  /**
   * Human-readable label for transform scope.
   * @param {'auto'|'fragment'|'molecule'|'all'} scope
   * @returns {string}
   */
  function getEditTransformScopeLabel(scope) {
    if (scope === EDIT_TRANSFORM_SCOPE.FRAGMENT) return 'Fragment';
    if (scope === EDIT_TRANSFORM_SCOPE.MOLECULE) return 'Molecule';
    if (scope === EDIT_TRANSFORM_SCOPE.ALL) return 'All atoms';
    return 'Auto';
  }

  /**
   * Human-readable label for transform action.
   * @param {'move'|'rotate'} mode
   * @returns {string}
   */
  function getEditTransformModeLabel(mode) {
    if (mode === EDIT_TRANSFORM_MODE.ROTATE_FRAGMENT) return 'Rotate fragment';
    if (mode === EDIT_TRANSFORM_MODE.ROTATE_BOND) return 'Rotate bond';
    return 'Move';
  }

  /**
   * Check whether the current transform action is rotational.
   * @param {'move'|'rotate_fragment'|'rotate_bond'} mode
   * @returns {boolean}
   */
  function isRotateTransformMode(mode) {
    return mode === EDIT_TRANSFORM_MODE.ROTATE_FRAGMENT || mode === EDIT_TRANSFORM_MODE.ROTATE_BOND;
  }

  /**
   * Resolve atom indices for the connected molecular component containing anchor atom.
   * @param {*} vol
   * @param {number} anchorIndex
   * @returns {number[]}
   */
  function getMoleculeComponentIndices(vol, anchorIndex) {
    if (!vol || !Array.isArray(vol.atoms) || vol.atoms.length === 0) return [];
    const n = vol.atoms.length | 0;
    const anchor = anchorIndex | 0;
    if (anchor < 0 || anchor >= n) return [];
    const records = buildBondAtomRecords(vol, { includeRenderColor: false });
    const edges = getVolumeBondEdges(vol, records);
    const adjacency = buildBondAdjacency(edges, n);
    const seen = new Uint8Array(n);
    const stack = [anchor];
    const out = [];
    seen[anchor] = 1;
    while (stack.length) {
      const i = stack.pop();
      out.push(i);
      const neighbors = adjacency[i];
      if (!Array.isArray(neighbors)) continue;
      for (const jRaw of neighbors) {
        const j = jRaw | 0;
        if (j < 0 || j >= n || seen[j]) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    out.sort((a, b) => a - b);
    return out.length ? out : [anchor];
  }

  /**
   * Resolve the atom subset on one side of a clicked bond by removing that edge
   * and walking the remaining graph from the chosen endpoint.
   * Cycles naturally expand to the whole connected component.
   * @param {*} vol
   * @param {number} atomA
   * @param {number} atomB
   * @param {number} seedIndex
   * @returns {number[]}
   */
  function getBondSideComponentIndices(vol, atomA, atomB, seedIndex) {
    if (!vol || !Array.isArray(vol.atoms) || vol.atoms.length === 0) return [];
    const n = vol.atoms.length | 0;
    const i = atomA | 0;
    const j = atomB | 0;
    const seed = seedIndex | 0;
    if (i < 0 || j < 0 || seed < 0 || i >= n || j >= n || seed >= n || i === j) return [];
    const records = buildBondAtomRecords(vol, { includeRenderColor: false });
    const edges = getVolumeBondEdges(vol, records);
    const adjacency = buildBondAdjacency(edges, n);
    const seen = new Uint8Array(n);
    const stack = [seed];
    const out = [];
    seen[seed] = 1;
    while (stack.length) {
      const cur = stack.pop();
      out.push(cur);
      const neighbors = adjacency[cur];
      if (!Array.isArray(neighbors)) continue;
      for (const nextRaw of neighbors) {
        const next = nextRaw | 0;
        if (next < 0 || next >= n || seen[next]) continue;
        const isCutEdge = (cur === i && next === j) || (cur === j && next === i);
        if (isCutEdge) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    out.sort((a, b) => a - b);
    return out;
  }

  /**
   * Choose which endpoint of a clicked bond should seed fragment-side selection.
   * The closer endpoint to the click point wins.
   * @param {*} vol
   * @param {{object:*,point:THREE.Vector3|null}} bondHit
   * @returns {number}
   */
  function resolveBondSideSeedIndex(vol, bondHit) {
    if (!vol || !Array.isArray(vol.atoms) || !bondHit || !bondHit.object || !bondHit.object.userData) return -1;
    const i = bondHit.object.userData.i | 0;
    const j = bondHit.object.userData.j | 0;
    if (i < 0 || j < 0 || i >= vol.atoms.length || j >= vol.atoms.length) return -1;
    if (!bondHit.point || !bondHit.point.isVector3) return i;
    const posI = atomUnitsToAng(vol, vol.atoms[i]);
    const posJ = atomUnitsToAng(vol, vol.atoms[j]);
    return bondHit.point.distanceToSquared(posI) <= bondHit.point.distanceToSquared(posJ) ? i : j;
  }

  /**
   * Resolve transform target atoms from one clicked bond side.
   * @param {*} vol
   * @param {{object:*,point:THREE.Vector3|null}} bondHit
   * @returns {{indices:number[],kind:'fragment',bond:{i:number,j:number},seedIndex:number}|null}
   */
  function resolveTransformBondTarget(vol, bondHit) {
    if (!vol || !Array.isArray(vol.atoms) || !bondHit || !bondHit.object || !bondHit.object.userData) return null;
    const i = bondHit.object.userData.i | 0;
    const j = bondHit.object.userData.j | 0;
    if (i < 0 || j < 0 || i >= vol.atoms.length || j >= vol.atoms.length || i === j) return null;
    const seedIndex = resolveBondSideSeedIndex(vol, bondHit);
    if (seedIndex < 0) return null;
    const indices = getBondSideComponentIndices(vol, i, j, seedIndex);
    if (!indices.length) return null;
    return {
      indices,
      kind: 'fragment',
      bond: { i, j },
      seedIndex,
    };
  }

  /**
   * Resolve atom indices from the latest fragment-builder operation touching one atom.
   * @param {*} vol
   * @param {number} anchorIndex
   * @returns {number[]}
   */
  function getFragmentOperationIndices(vol, anchorIndex) {
    if (!vol || !Array.isArray(vol.atoms) || !Array.isArray(vol.fragmentOps)) return [];
    const n = vol.atoms.length | 0;
    const anchor = anchorIndex | 0;
    const anchorAtomId = (anchor >= 0 && anchor < n && vol.atoms[anchor]) ? String(ensureAtomId(vol.atoms[anchor])) : '';
    const atomIndexById = new Map();
    for (let i = 0; i < n; i++) {
      const atom = vol.atoms[i];
      if (!atom) continue;
      atomIndexById.set(String(ensureAtomId(atom)), i);
    }
    for (let k = vol.fragmentOps.length - 1; k >= 0; k--) {
      const op = vol.fragmentOps[k];
      if (!op) continue;
      if (String(op.entryKind || '').trim().toLowerCase() !== CATALOG_KIND.FRAGMENT) continue;
      const filtered = [];
      const set = new Set();
      const candidateIndices = Array.isArray(op.addedAtomIds) && op.addedAtomIds.length
        ? op.addedAtomIds.map((id) => atomIndexById.get(String(id || ''))).filter((idx) => Number.isInteger(idx))
        : (Array.isArray(op.addedAtomIndices) ? op.addedAtomIndices.slice() : []);
      for (const idxRaw of candidateIndices) {
        const idx = Number(idxRaw) | 0;
        if (idx < 0 || idx >= n || set.has(idx)) continue;
        set.add(idx);
        filtered.push(idx);
      }
      if (!filtered.length) continue;
      const hostBondAtomIds = Array.isArray(op.hostBondAtomIds)
        ? op.hostBondAtomIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [];
      const addedAtomIds = Array.isArray(op.addedAtomIds)
        ? op.addedAtomIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [];
      const anchorPost = Number(op.anchorIndexPost);
      const anchorPre = Number(op.anchorIndexPre);
      const touches = set.has(anchor)
        || (!!anchorAtomId && (addedAtomIds.includes(anchorAtomId)
          || String(op.anchorAtomIdPre || '') === anchorAtomId
          || String(op.anchorAtomIdPost || '') === anchorAtomId
          || hostBondAtomIds.includes(anchorAtomId)))
        || (Number.isFinite(anchorPost) && (anchorPost | 0) === anchor)
        || (Number.isFinite(anchorPre) && (anchorPre | 0) === anchor);
      if (!touches) continue;
      filtered.sort((a, b) => a - b);
      return filtered;
    }
    return [];
  }

  /**
   * Resolve builder-group atom indices from stable atom metadata.
   * @param {*} vol
   * @param {number} anchorIndex
   * @returns {number[]}
   */
  function getBuilderGroupIndices(vol, anchorIndex) {
    if (!vol || !Array.isArray(vol.atoms)) return [];
    const atoms = vol.atoms;
    const anchor = anchorIndex | 0;
    if (anchor < 0 || anchor >= atoms.length) return [];
    const groupId = getAtomBuilderMeta(vol, anchor).groupId;
    if (!groupId) return [];
    const out = [];
    for (let i = 0; i < atoms.length; i++) {
      if (getAtomBuilderMeta(vol, i).groupId === groupId) out.push(i);
    }
    return out;
  }

  /**
   * Read one atom's builder entry kind, if present.
   * @param {*} vol
   * @param {number} anchorIndex
   * @returns {'fragment'|'molecule'|''}
   */
  function getBuilderEntryKindAtAtom(vol, anchorIndex) {
    if (!vol || !Array.isArray(vol.atoms)) return '';
    const anchor = anchorIndex | 0;
    if (anchor < 0 || anchor >= vol.atoms.length) return '';
    const kind = getAtomBuilderMeta(vol, anchor).entryKind;
    if (kind === CATALOG_KIND.FRAGMENT || kind === CATALOG_KIND.MOLECULE) return kind;
    return '';
  }

  /**
   * Resolve transform target atoms from current scope and one clicked anchor atom.
   * @param {*} vol
   * @param {number} anchorIndex
   * @returns {{indices:number[],kind:'fragment'|'molecule'|'all'}|null}
   */
  function resolveTransformAtomTarget(vol, anchorIndex) {
    if (!vol || !Array.isArray(vol.atoms) || vol.atoms.length === 0) return null;
    const n = vol.atoms.length | 0;
    const anchor = anchorIndex | 0;
    if (anchor < 0 || anchor >= n) return null;
    const scope = normalizeEditTransformScope(editTransformScope);
    const builderEntryKind = getBuilderEntryKindAtAtom(vol, anchor);
    if (scope === EDIT_TRANSFORM_SCOPE.ALL) {
      return {
        indices: Array.from({ length: n }, (_, i) => i),
        kind: 'all',
      };
    }
    const builderGroupIndices = getBuilderGroupIndices(vol, anchor);
    const fragmentIndices = builderEntryKind === CATALOG_KIND.FRAGMENT ? builderGroupIndices : [];
    const moleculeIndices = builderEntryKind === CATALOG_KIND.MOLECULE
      ? builderGroupIndices
      : getMoleculeComponentIndices(vol, anchor);
    const fallbackFragmentIndices = fragmentIndices.length ? fragmentIndices : getFragmentOperationIndices(vol, anchor);
    if (scope === EDIT_TRANSFORM_SCOPE.FRAGMENT) {
      if (!fallbackFragmentIndices.length) return null;
      return { indices: fallbackFragmentIndices, kind: 'fragment' };
    }
    if (scope === EDIT_TRANSFORM_SCOPE.MOLECULE) {
      return { indices: moleculeIndices, kind: 'molecule' };
    }
    // auto: fragment (when available) otherwise molecule/component.
    if (fallbackFragmentIndices.length) return { indices: fallbackFragmentIndices, kind: 'fragment' };
    return { indices: moleculeIndices, kind: 'molecule' };
  }

  /**
   * Compute center of one atom-index set in world coordinates.
   * @param {*} vol
   * @param {number[]} indices
   * @returns {THREE.Vector3}
   */
  function getTransformPivotWorld(vol, indices) {
    const center = new THREE.Vector3();
    if (!vol || !Array.isArray(vol.atoms) || !Array.isArray(indices) || indices.length === 0) return center;
    for (const idx of indices) center.add(atomUnitsToAng(vol, vol.atoms[idx]));
    center.multiplyScalar(1 / Math.max(1, indices.length));
    return center;
  }

  /**
   * Reset transform-drag transient state.
   * @param {{restoreControls?:boolean}=} options
   */
  function clearTransformState(options = {}) {
    const restoreControls = options.restoreControls !== false;
    transformActive = false;
    transformTargetIndices = [];
    transformTargetKind = 'molecule';
    transformAppliesToGrid = false;
    transformPivotWorld = null;
    transformDragPlane = null;
    transformPlaneStart = null;
    transformRotateAxis = null;
    transformRotateStartDir = null;
    transformRotateGesture = 'move';
    transformRotateLastClientX = 0;
    transformRotateLastClientY = 0;
    transformRotateAccumulatedQuaternion.identity();
    transformBondContext = null;
    transformPendingSelectionTarget = null;
    transformPendingBackgroundClear = false;
    transformStartPositionsWorld = [];
    transformBeforeSnapshot = null;
    transformMoved = false;
    if (restoreControls) {
      try { controls.enabled = true; } catch { }
    }
    updateTransformBondSelectionHalos();
    updateTransformSelectionGuides();
  }

  /**
   * Begin one transform drag from an already resolved atom-index target set.
   * @param {PointerEvent} e
   * @param {*} vol
   * @param {{indices:number[],kind:'fragment'|'molecule'|'all'}} target
   * @param {THREE.Vector3|null=} interactionPoint
   * @param {{type:'bond',selectedAtomIndex:number,anchorAtomIndex:number,bondIndices:[number,number]}|null=} context
   * @returns {boolean}
   */
  function beginTransformDragFromResolvedTarget(e, vol, target, interactionPoint = null, context = null) {
    if (!vol || !Array.isArray(vol.atoms) || !target || !Array.isArray(target.indices) || !target.indices.length) return false;
    clearAddGrowPreview();
    clearTransformState({ restoreControls: false });
    transformTargetIndices = target.indices.slice();
    transformTargetKind = target.kind;
    setTransformSelection(transformTargetIndices, transformTargetKind, context);
    transformBondContext = (context && context.type === 'bond')
      ? {
          type: 'bond',
          selectedAtomIndex: context.selectedAtomIndex | 0,
          anchorAtomIndex: context.anchorAtomIndex | 0,
          bondIndices: Array.isArray(context.bondIndices) ? [context.bondIndices[0] | 0, context.bondIndices[1] | 0] : [0, 0],
        }
      : null;
    transformPivotWorld = getTransformPivotWorld(vol, transformTargetIndices);
    if (transformBondContext && editTransformMode === EDIT_TRANSFORM_MODE.ROTATE_FRAGMENT) {
      transformPivotWorld = atomUnitsToAng(vol, vol.atoms[transformBondContext.selectedAtomIndex]);
    } else if (transformBondContext && editTransformMode === EDIT_TRANSFORM_MODE.ROTATE_BOND) {
      transformPivotWorld = atomUnitsToAng(vol, vol.atoms[transformBondContext.anchorAtomIndex]);
    }
    transformStartPositionsWorld = transformTargetIndices.map((idx) => atomUnitsToAng(vol, vol.atoms[idx]));
    transformBeforeSnapshot = cloneCoordinateSnapshot(vol);
    transformAppliesToGrid = !!(transformBeforeSnapshot.grid && transformTargetIndices.length === vol.atoms.length);
    transformMoved = false;

    setRaycasterFromEvent(e);
    if (isRotateTransformMode(editTransformMode)) {
      if (transformBondContext && editTransformMode === EDIT_TRANSFORM_MODE.ROTATE_BOND) {
        transformRotateGesture = 'bondQuaternion';
        transformRotateLastClientX = Number(e.clientX) || 0;
        transformRotateLastClientY = Number(e.clientY) || 0;
        transformRotateAccumulatedQuaternion.identity();
        setHintMessage('Rotate bond: Drag to reorient the selected side around the opposite atom');
      } else {
        transformRotateGesture = transformBondContext && editTransformMode === EDIT_TRANSFORM_MODE.ROTATE_FRAGMENT
          ? 'bondAxis'
          : 'viewAxis';
        transformRotateAccumulatedQuaternion.identity();
        if (transformRotateGesture === 'bondAxis') {
          transformRotateAxis = atomUnitsToAng(vol, vol.atoms[transformBondContext.selectedAtomIndex])
            .sub(atomUnitsToAng(vol, vol.atoms[transformBondContext.anchorAtomIndex]));
        } else {
          transformRotateAxis = new THREE.Vector3();
          camera.getWorldDirection(transformRotateAxis);
        }
        if (transformRotateAxis.lengthSq() < 1e-12) transformRotateAxis.set(0, 0, -1);
        transformRotateAxis.normalize();
        transformDragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(transformRotateAxis, transformPivotWorld);
        const planeHit = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(transformDragPlane, planeHit)) {
          if (interactionPoint && interactionPoint.isVector3) planeHit.copy(interactionPoint);
          else planeHit.copy(transformPivotWorld);
        }
        const startDir = planeHit.clone().sub(transformPivotWorld);
        startDir.addScaledVector(transformRotateAxis, -startDir.dot(transformRotateAxis));
        if (startDir.lengthSq() < 1e-10) {
          const fallback = (interactionPoint && interactionPoint.isVector3)
            ? interactionPoint.clone().sub(transformPivotWorld)
            : getBondPerpendicular(transformRotateAxis);
          fallback.addScaledVector(transformRotateAxis, -fallback.dot(transformRotateAxis));
          if (fallback.lengthSq() < 1e-10) fallback.copy(getBondPerpendicular(transformRotateAxis));
          startDir.copy(fallback);
        }
        transformRotateStartDir = startDir.normalize();
        if (transformRotateGesture === 'bondAxis') {
          setHintMessage('Rotate fragment: Drag to spin the selected side about the bond axis');
        } else {
          setHintMessage(`Transform ${getEditTransformScopeLabel(target.kind)}: Rotate • Drag to rotate around view axis`);
        }
      }
    } else {
      transformRotateGesture = 'move';
      const normal = new THREE.Vector3();
      camera.getWorldDirection(normal);
      if (normal.lengthSq() < 1e-12) normal.set(0, 0, -1);
      transformDragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal.normalize(), transformPivotWorld);
      transformPlaneStart = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(transformDragPlane, transformPlaneStart)) {
        if (interactionPoint && interactionPoint.isVector3) transformPlaneStart.copy(interactionPoint);
        else transformPlaneStart.copy(transformPivotWorld);
      }
      setHintMessage(`Transform ${getEditTransformScopeLabel(target.kind)}: Move • Drag to reposition`);
    }
    transformActive = true;
    try { controls.enabled = false; } catch { }
    return true;
  }

  /**
   * Begin a transform drag from the current persistent selection.
   * @param {PointerEvent} e
   * @param {THREE.Vector3|null=} interactionPoint
   * @param {{type:'bond',selectedAtomIndex:number,anchorAtomIndex:number,bondIndices:[number,number]}|null=} contextOverride
   * @returns {boolean}
   */
  function beginTransformDragFromCurrentSelection(e, interactionPoint = null, contextOverride = null) {
    const record = ensureEditableVolumeRecord();
    const vol = record && record.vol;
    if (!vol || !Array.isArray(vol.atoms) || vol.atoms.length === 0) return false;
    const indices = getActiveTransformSelectionIndices();
    if (!indices.length) return false;
    return beginTransformDragFromResolvedTarget(
      e,
      vol,
      { indices, kind: transformSelectionKind || 'fragment' },
      interactionPoint,
      contextOverride || transformSelectionContext || null
    );
  }

  /**
   * Apply transformed world-space atom positions to data + meshes.
   * @param {*} vol
   * @param {number[]} indices
   * @param {THREE.Vector3[]} worldPositions
   */
  function applyTransformWorldPositions(vol, indices, worldPositions) {
    if (!vol || !Array.isArray(vol.atoms) || !Array.isArray(indices) || !Array.isArray(worldPositions)) return;
    const count = Math.min(indices.length, worldPositions.length);
    for (let i = 0; i < count; i++) {
      const atomIdx = indices[i] | 0;
      const world = worldPositions[i];
      if (!Number.isInteger(atomIdx) || atomIdx < 0 || atomIdx >= vol.atoms.length || !world || !world.isVector3) continue;
      const atom = vol.atoms[atomIdx];
      const coords = worldToAtomUnits(vol, world);
      atom.x = coords[0];
      atom.y = coords[1];
      atom.z = coords[2];
      const mesh = atomGroup && atomGroup.children ? atomGroup.children[atomIdx] : null;
      if (mesh && mesh.position) mesh.position.copy(world);
    }
  }

  /**
   * Apply translational transform to volumetric grid from one snapshot.
   * @param {*} vol
   * @param {{origin:number[],axes:number[][]}|null} gridSnapshot
   * @param {THREE.Vector3} deltaWorld
   */
  function applyTransformGridTranslation(vol, gridSnapshot, deltaWorld) {
    if (!hasVolumetricGrid(vol) || !gridSnapshot || !deltaWorld || !deltaWorld.isVector3) return;
    const toNative = vol.units === 'angstrom' ? 1 : ANG_TO_BOHR;
    const dx = deltaWorld.x * toNative;
    const dy = deltaWorld.y * toNative;
    const dz = deltaWorld.z * toNative;
    vol.origin = [
      (Number(gridSnapshot.origin && gridSnapshot.origin[0]) || 0) + dx,
      (Number(gridSnapshot.origin && gridSnapshot.origin[1]) || 0) + dy,
      (Number(gridSnapshot.origin && gridSnapshot.origin[2]) || 0) + dz,
    ];
    vol.axes = [
      Array.isArray(gridSnapshot.axes && gridSnapshot.axes[0]) ? gridSnapshot.axes[0].slice(0, 3) : [1, 0, 0],
      Array.isArray(gridSnapshot.axes && gridSnapshot.axes[1]) ? gridSnapshot.axes[1].slice(0, 3) : [0, 1, 0],
      Array.isArray(gridSnapshot.axes && gridSnapshot.axes[2]) ? gridSnapshot.axes[2].slice(0, 3) : [0, 0, 1],
    ];
  }

  /**
   * Apply rotational transform to volumetric grid from one snapshot.
   * @param {*} vol
   * @param {{origin:number[],axes:number[][]}|null} gridSnapshot
   * @param {THREE.Vector3} pivotWorld
   * @param {THREE.Quaternion} rotation
   */
  function applyTransformGridRotation(vol, gridSnapshot, pivotWorld, rotation) {
    if (!hasVolumetricGrid(vol) || !gridSnapshot || !pivotWorld || !rotation) return;
    const toWorld = vol.units === 'angstrom' ? 1 : BOHR_TO_ANG;
    const toNative = vol.units === 'angstrom' ? 1 : ANG_TO_BOHR;
    const originWorld = new THREE.Vector3(
      (Number(gridSnapshot.origin && gridSnapshot.origin[0]) || 0) * toWorld,
      (Number(gridSnapshot.origin && gridSnapshot.origin[1]) || 0) * toWorld,
      (Number(gridSnapshot.origin && gridSnapshot.origin[2]) || 0) * toWorld
    );
    originWorld.sub(pivotWorld).applyQuaternion(rotation).add(pivotWorld);
    vol.origin = [originWorld.x * toNative, originWorld.y * toNative, originWorld.z * toNative];

    const axes = [];
    for (let i = 0; i < 3; i++) {
      const axis = Array.isArray(gridSnapshot.axes && gridSnapshot.axes[i]) ? gridSnapshot.axes[i] : [0, 0, 0];
      const axisWorld = new THREE.Vector3(
        (Number(axis[0]) || 0) * toWorld,
        (Number(axis[1]) || 0) * toWorld,
        (Number(axis[2]) || 0) * toWorld
      ).applyQuaternion(rotation);
      axes.push([axisWorld.x * toNative, axisWorld.y * toNative, axisWorld.z * toNative]);
    }
    vol.axes = axes;
  }

  /**
   * Human-readable label for the active edit sub-tool.
   * @param {'move'|'add'|'transform'|'delete'} tool
   * @returns {string}
   */
  function getEditToolLabel(tool) {
    if (tool === EDIT_TOOL.SELECT) return 'Selection';
    if (tool === EDIT_TOOL.ADD) return 'Add';
    if (tool === EDIT_TOOL.BOND) return 'Bond';
    if (tool === EDIT_TOOL.TRANSFORM) return 'Transform';
    if (tool === EDIT_TOOL.DELETE) return 'Delete';
    return 'Move';
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
    if (announce && editMode && editTool === EDIT_TOOL.ADD) {
      if (editAddMode === EDIT_ADD_MODE.FRAGMENT) setHintMessage(`Fragment attach bond order: ${editAddBondOrder} (keys 1/2/3/4)`);
      else if (editAddMode === EDIT_ADD_MODE.MOLECULE) setHintMessage('Molecule placement mode: bond order hotkeys are ignored.');
      else setHintMessage(`Add atom bond order: ${editAddBondOrder} (keys 1/2/3/4)`);
    }
  }

  /**
   * Set the active explicit bond-tool order.
   * @param {number} order
   * @param {{announce?:boolean}=} options
   */
  function setEditBondOrder(order, options = {}) {
    const announce = options.announce !== false;
    editBondOrder = normalizeEditAddBondOrder(order);
    updateEditToolboxUi({ syncSearch: false });
    if (bondEditing) bondEditing.refreshPopup();
    if (announce && editMode && editTool === EDIT_TOOL.BOND) {
      setHintMessage(`Bond tool order: ${editBondOrder} (keys 1/2/3/4).`);
    }
  }

  /**
   * Set the active explicit bond-tool action.
   * @param {*} action
   * @param {{announce?:boolean}=} options
   */
  function setEditBondAction(action, options = {}) {
    const announce = options.announce !== false;
    editBondAction = normalizeEditBondAction(action);
    if (bondEditing) bondEditing.clearState();
    if (editBondActionEl && document.activeElement !== editBondActionEl) editBondActionEl.value = editBondAction;
    updateEditToolboxUi({ syncSearch: false });
    if (!announce || !editMode || editTool !== EDIT_TOOL.BOND) return;
    setHintMessage('Bond tool: Click two atoms to create a bond • Click an existing bond to edit order • Right-click a bond or choose 0 to delete it.');
  }

  bondEditing = createBondEditingController({
    THREE,
    popupEl: bondOrderPopupEl,
    popupButtonsEl: bondOrderPopupButtonsEl,
    canvasEl,
    getCamera: () => camera,
    canUsePopup: () => currentMode === MODES.EDIT && editTool === EDIT_TOOL.BOND,
    normalizeOrder: normalizeEditAddBondOrder,
    getDisplayedOrder: getBondCarrierDisplayedOrder,
    focusCarrier: (carrier) => ensureBondOverlay(carrier, 'focusOverlay', 0x71a8ff, 0.96),
    blurCarrier: (carrier) => removeBondOverlay(carrier, 'focusOverlay'),
    onPendingSelectionChanged: () => {
      updateSelectedHalos();
      updateEditToolboxUi({ syncSearch: false });
    },
    ensureEditableRecord: ensureEditableVolumeRecord,
    ensureVolumeSchema,
    cloneBondSnapshot,
    bondSnapshotsEqual,
    cloneAtomsSnapshot,
    pushEditHistoryEntry,
    clearHover,
    rebuildScene,
    updateSidePanel,
    ensureAtomId,
    findVolumeBondRecordIndex,
    normalizeVolumeBondRecord,
    upsertVolumeBond,
    removeVolumeBond,
    getElementSymbol,
    getBondAction: () => editBondAction,
    getBondOrder: () => editBondOrder,
    setBondOrder: setEditBondOrder,
    setHintMessage,
  });

  adaptivePopoverController = createAdaptivePopoverController({
    bindings: adaptivePopoverBindings,
    onOpenMode: (kind, binding, options = {}) => {
      if (!binding) return;
      if (binding.mode) {
        setEditAddMode(binding.mode, { announce: false, syncSearch: true });
        setEditTool(EDIT_TOOL.ADD, { announce: options.announce !== false });
      }
    },
  });

  /**
   * Clear add-grow preview state/meshes.
   */
  function clearAddGrowPreview() {
    addGrowActive = false;
    addGrowAnchorIndex = -1;
    addGrowAnchorPos = null;
    addGrowNeighborDirs = [];
    addGrowPreviewPos = null;
    addGrowPreviewBondHit = null;
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
  }

  /**
   * Ensure add-grow ghost meshes exist.
   * @param {number} z
   */
  function ensureAddGrowPreviewMeshes(z) {
    if (!addPreviewAtomMesh) {
      const g = new THREE.SphereGeometry(1.0, 20, 14);
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
      const g = new THREE.CylinderGeometry(1.0, 1.0, 1.0, 16, 1, false);
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
   * @param {number} anchorZ
   * @param {number} z
   */
  function updateAddGrowPreviewMeshes(anchorPos, newPos, anchorZ, z) {
    ensureAddGrowPreviewMeshes(z);
    const atomRadius = getRenderedAtomDisplayRadius(z);
    const placement = getPreviewBondSegmentPlacement(anchorPos, newPos, anchorZ, z, { minGeomLen: 0.03 });
    addPreviewAtomMesh.position.copy(newPos);
    addPreviewAtomMesh.scale.setScalar(atomRadius);
    if (!placement.valid) {
      addPreviewBondMesh.visible = false;
      return;
    }
    addPreviewBondMesh.visible = true;
    addPreviewBondMesh.position.copy(placement.mid);
    addPreviewBondMesh.scale.set(placement.bondRadius, placement.geomLen, placement.bondRadius);
    addPreviewBondMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), placement.dirNorm);
  }

  /**
   * Draw one in-scene angle guide for the active add-grow direction.
   * @param {THREE.Vector3} anchorPos
   * @param {THREE.Vector3} newPos
   * @param {{targetDeg:number,measuredDeg:number,refDir:THREE.Vector3|null}=} snapMeta
   */
  function updateAddGrowAngleGuide(anchorPos, newPos, snapMeta = null) {
    clearGroup(addAngleGuideGroup);
    if (!anchorPos || !newPos || !snapMeta || !snapMeta.refDir) return;
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
    const measuredDeg = THREE.MathUtils.radToDeg(theta);
    const label = makeTextSprite(`${Number(measuredDeg).toFixed(1)}°`);
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
    const attach = getActiveAddAttachSettings(anchorZ);
    const dist = attach.bondLength;
    const newPos = addGrowAnchorPos.clone().addScaledVector(snapped, dist);
    addGrowPreviewPos = newPos;
    updateAddGrowPreviewMeshes(addGrowAnchorPos, newPos, anchorZ, attach.previewZ);
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
    const placementState = getCurrentAddAtomPlacementPlaneState();
    const camDir = placementState ? placementState.normal.clone() : new THREE.Vector3();
    if (!placementState) camera.getWorldDirection(camDir);
    const plane = placementState
      ? placementState.plane
      : new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, addGrowAnchorPos);
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
    addGrowDetectedAngleDeg = bypassAngleSnap ? 0 : (snapMeta.targetDeg || 0);
    const anchorZ = vol.atoms[addGrowAnchorIndex].Z | 0;
    const attach = getActiveAddAttachSettings(anchorZ);
    const dist = attach.bondLength;
    const newPos = addGrowAnchorPos.clone().addScaledVector(snapped, dist);
    addGrowPreviewPos = newPos;
    updateAddGrowPreviewMeshes(addGrowAnchorPos, newPos, anchorZ, attach.previewZ);
    const guideMeta = bypassAngleSnap
      ? applyEditAddAngleSnap(rawDir, addGrowNeighborDirs, null, camDir)
      : snapMeta;
    updateAddGrowAngleGuide(addGrowAnchorPos, newPos, guideMeta);
  }

  /**
   * Build COM-centered molecule placement data from one catalog entry.
   * @param {*} molecule
   * @returns {{id:string,name:string,formula:string,atoms:Array<{Z:number,local:THREE.Vector3}>,bonds:Array<{i:number,j:number,order:number}>,principalAxis:THREE.Vector3}|null}
   */
  function buildMoleculePlacementData(molecule) {
    if (!molecule || !Array.isArray(molecule.atoms) || molecule.atoms.length === 0) return null;
    const massProps = computeMassPropertiesFromAtoms(molecule.atoms, getAtomicMass);
    const com = massProps
      ? new THREE.Vector3(massProps.comX, massProps.comY, massProps.comZ)
      : molecule.atoms.reduce((acc, a) => {
        acc.x += Number(a && a.x) || 0;
        acc.y += Number(a && a.y) || 0;
        acc.z += Number(a && a.z) || 0;
        return acc;
      }, new THREE.Vector3()).multiplyScalar(1 / Math.max(1, molecule.atoms.length));
    const atoms = molecule.atoms.map((a) => ({
      Z: a.Z | 0,
      local: new THREE.Vector3(
        (Number(a.x) || 0) - com.x,
        (Number(a.y) || 0) - com.y,
        (Number(a.z) || 0) - com.z
      ),
    }));
    let principalAxis = new THREE.Vector3(0, 0, 1);
    try {
      const inertia = computeInertiaTensorFromAtoms(molecule.atoms, {
        comX: com.x, comY: com.y, comZ: com.z,
      }, getAtomicMass);
      const eig = eigenSymmetric3x3Jacobi(inertia);
      if (eig && Array.isArray(eig.vectors) && Array.isArray(eig.vectors[0])) {
        const v = eig.vectors[0];
        principalAxis = new THREE.Vector3(Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0);
      }
    } catch { }
    if (principalAxis.lengthSq() < 1e-10) principalAxis.set(0, 0, 1);
    principalAxis.normalize();
    return {
      id: normalizeFragmentId(molecule.id || ''),
      name: String(molecule.name || 'Molecule'),
      formula: String(molecule.formula || ''),
      atoms,
      bonds: Array.isArray(molecule.bonds) ? molecule.bonds.map((b) => ({
        i: b.i | 0, j: b.j | 0, order: Math.max(1, Math.min(4, b.order | 0)),
      })) : [],
      principalAxis,
    };
  }

  /**
   * Apply current molecule-placement pose to preview root.
   */
  function updateMoleculePlacementPreviewTransform() {
    addMoleculePreviewGroup.visible = !!moleculePlaceActive;
    if (!moleculePlaceActive) return;
    addMoleculePreviewGroup.position.copy(moleculePlacePosition);
    addMoleculePreviewGroup.quaternion.copy(moleculePlaceQuaternion);
    updateMoleculePlacementOperatorUi();
  }

  /**
   * Rebuild molecule preview meshes from current template data.
   */
  function rebuildMoleculePlacementPreviewMeshes() {
    clearGroup(addMoleculePreviewGroup);
    if (!moleculePlaceTemplateData || !Array.isArray(moleculePlaceTemplateData.atoms)) return;
    const profile = getMoleculeStyleProfile();
    const bondRadius = getPreviewBondRadius();
    const sphereWidthSegments = Math.max(16, profile.sphereWidthSegments | 0);
    const sphereHeightSegments = Math.max(12, profile.sphereHeightSegments | 0);
    const bondRadialSegments = Math.max(12, profile.bondRadialSegments | 0);
    const bondMat = new THREE.MeshPhysicalMaterial({
      color: 0xdbe3ef,
      transparent: true,
      opacity: 0.62,
      roughness: 0.25,
      metalness: 0.04,
    });
    for (const bond of moleculePlaceTemplateData.bonds || []) {
      const i = bond.i | 0;
      const j = bond.j | 0;
      const ai = moleculePlaceTemplateData.atoms[i];
      const aj = moleculePlaceTemplateData.atoms[j];
      if (!ai || !aj) continue;
      const placement = getPreviewBondSegmentPlacement(ai.local, aj.local, ai.Z | 0, aj.Z | 0, {
        bondRadius,
        minGeomLen: 0.03,
      });
      if (!placement.valid) continue;
      const geom = new THREE.CylinderGeometry(bondRadius, bondRadius, placement.geomLen, bondRadialSegments, 1, false);
      const mesh = new THREE.Mesh(geom, bondMat);
      mesh.position.copy(placement.mid);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), placement.dirNorm);
      mesh.renderOrder = 56;
      addMoleculePreviewGroup.add(mesh);
    }
    for (const atom of moleculePlaceTemplateData.atoms) {
      const z = atom.Z | 0;
      const radius = getRenderedAtomDisplayRadius(z);
      const geom = new THREE.SphereGeometry(radius, sphereWidthSegments, sphereHeightSegments);
      const mat = new THREE.MeshPhysicalMaterial({
        color: getAtomRenderColor(z),
        transparent: true,
        opacity: 0.72,
        roughness: 0.2,
        metalness: 0.08,
        clearcoat: 0.45,
        clearcoatRoughness: 0.15,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.copy(atom.local);
      mesh.renderOrder = 60;
      addMoleculePreviewGroup.add(mesh);
    }
    updateMoleculePlacementPreviewTransform();
  }

  /**
   * Clear molecule-placement preview state/meshes.
   */
  function clearMoleculePlacementPreview() {
    editPlacement.clearMoleculePlacementPreview();
  }

  /**
   * Start one interactive molecule placement at a world-space center point.
   * @param {THREE.Vector3} worldPos
   * @returns {boolean}
   */
  function startMoleculePlacementAtWorld(worldPos) {
    return editPlacement.startMoleculePlacementAtWorld(worldPos);
  }

  /**
   * Rotate active molecule placement preview from pointer movement.
   * @param {PointerEvent} e
   */
  function updateMoleculePlacementRotationFromEvent(e) {
    editPlacement.updateMoleculePlacementRotationFromEvent(e);
  }

  /**
   * Align active molecule placement orientation to one world axis.
   * Uses the molecule principal axis as the source direction.
   * @param {'x'|'y'|'z'} axis
   * @returns {boolean}
   */
  function alignMoleculePlacementToAxis(axis) {
    return editPlacement.alignMoleculePlacementToAxis(axis);
  }

  /**
   * Commit the current molecule placement preview into the active editable file.
   * @returns {boolean}
   */
  function commitMoleculePlacement() {
    return editPlacement.commitMoleculePlacement();
  }

  /**
   * Remove all fuse-ring preview state and meshes.
   */
  function clearFuseRingPreview() {
    editPlacement.clearFuseRingPreview();
  }

  /**
   * Build placed fuse-ring world geometry for preview/commit.
   * @param {*} state
   * @returns {{newAtoms:Array<{localIndex:number,Z:number,world:THREE.Vector3}>,bonds:Array<{aLocal:number,bLocal:number,aWorld:THREE.Vector3,bWorld:THREE.Vector3,aHostIndex?:number,bHostIndex?:number,order:number}>}|null}
   */
  function buildFuseRingPlacementGeometry(state) {
    if (!state || !state.fragment || !state.hostBond) return null;
    const fragment = state.fragment;
    const pair = fragment.fuseBondLocalPair || [];
    if (pair.length < 2) return null;
    const localA = fragment.atoms[pair[0]];
    const localB = fragment.atoms[pair[1]];
    const hostAAtom = state.vol && state.vol.atoms && state.vol.atoms[state.hostBond.i];
    const hostBAtom = state.vol && state.vol.atoms && state.vol.atoms[state.hostBond.j];
    if (!localA || !localB || !hostAAtom || !hostBAtom) return null;
    const localMid = new THREE.Vector3(
      ((Number(localA.x) || 0) + (Number(localB.x) || 0)) * 0.5,
      ((Number(localA.y) || 0) + (Number(localB.y) || 0)) * 0.5,
      ((Number(localA.z) || 0) + (Number(localB.z) || 0)) * 0.5
    );
    const localAxis = new THREE.Vector3(
      (Number(localB.x) || 0) - (Number(localA.x) || 0),
      (Number(localB.y) || 0) - (Number(localA.y) || 0),
      (Number(localB.z) || 0) - (Number(localA.z) || 0)
    );
    const hostAWorld = atomUnitsToAng(state.vol, hostAAtom);
    const hostBWorld = atomUnitsToAng(state.vol, hostBAtom);
    const hostMid = hostAWorld.clone().add(hostBWorld).multiplyScalar(0.5);
    const hostAxis = hostBWorld.clone().sub(hostAWorld);
    if (localAxis.lengthSq() < 1e-12 || hostAxis.lengthSq() < 1e-12) return null;
    localAxis.normalize();
    hostAxis.normalize();
    const alignQuat = new THREE.Quaternion().setFromUnitVectors(localAxis, hostAxis);
    const spinQuat = new THREE.Quaternion().setFromAxisAngle(hostAxis, Number(state.spinAngle) || 0);
    const omitted = state.omittedLocalIndices || new Set();
    const hostMap = new Map([
      [pair[0] | 0, { atomIndex: state.hostBond.i, world: hostAWorld }],
      [pair[1] | 0, { atomIndex: state.hostBond.j, world: hostBWorld }],
    ]);
    const newAtoms = [];
    const worldByLocal = new Map();
    for (let i = 0; i < fragment.atoms.length; i++) {
      if (hostMap.has(i)) {
        worldByLocal.set(i, hostMap.get(i).world.clone());
        continue;
      }
      if (omitted.has(i)) continue;
      const atom = fragment.atoms[i];
      const rel = new THREE.Vector3(
        (Number(atom.x) || 0) - localMid.x,
        (Number(atom.y) || 0) - localMid.y,
        (Number(atom.z) || 0) - localMid.z
      );
      rel.applyQuaternion(alignQuat).applyQuaternion(spinQuat);
      const world = rel.add(hostMid.clone());
      worldByLocal.set(i, world.clone());
      newAtoms.push({ localIndex: i, Z: atom.Z | 0, world });
    }
    const bonds = [];
    for (const bond of fragment.bonds || []) {
      const i = Number(bond.i) | 0;
      const j = Number(bond.j) | 0;
      const aOmitted = omitted.has(i);
      const bOmitted = omitted.has(j);
      if (aOmitted && bOmitted) continue;
      const aWorld = worldByLocal.get(i);
      const bWorld = worldByLocal.get(j);
      if (!aWorld || !bWorld) continue;
      bonds.push({
        aLocal: i,
        bLocal: j,
        aWorld,
        bWorld,
        aHostIndex: hostMap.has(i) ? hostMap.get(i).atomIndex : undefined,
        bHostIndex: hostMap.has(j) ? hostMap.get(j).atomIndex : undefined,
        order: normalizeEditAddBondOrder(bond.order || 1),
      });
    }
    return { newAtoms, bonds };
  }

  /**
   * Rebuild fuse-ring preview meshes from current state.
   */
  function rebuildFuseRingPreviewMeshes() {
    clearGroup(addFusePreviewGroup);
    addFusePreviewGroup.visible = false;
    const state = addFusePreviewState;
    const geom = buildFuseRingPlacementGeometry(state);
    if (!state || !geom) return;
    addFusePreviewGroup.visible = true;
    const profile = getMoleculeStyleProfile();
    const bondRadius = getPreviewBondRadius();
    const sphereWidthSegments = Math.max(16, profile.sphereWidthSegments | 0);
    const sphereHeightSegments = Math.max(12, profile.sphereHeightSegments | 0);
    const bondRadialSegments = Math.max(12, profile.bondRadialSegments | 0);
    const bondMat = new THREE.MeshStandardMaterial({ color: 0xc5d5ec, transparent: true, opacity: 0.78 });
    const sphereGeomCache = new Map();
    const cylGeomCache = new Map();
    const up = new THREE.Vector3(0, 1, 0);
    for (const bond of geom.bonds) {
      if (bond.aHostIndex != null && bond.bHostIndex != null) continue;
      const aAtom = bond.aHostIndex != null ? state.vol.atoms[bond.aHostIndex] : state.fragment.atoms[bond.aLocal];
      const bAtom = bond.bHostIndex != null ? state.vol.atoms[bond.bHostIndex] : state.fragment.atoms[bond.bLocal];
      const aZ = aAtom ? (aAtom.Z | 0) : 6;
      const bZ = bAtom ? (bAtom.Z | 0) : 6;
      const placement = getPreviewBondSegmentPlacement(bond.aWorld, bond.bWorld, aZ, bZ, {
        bondRadius,
        minGeomLen: 0.03,
      });
      if (!placement.valid) continue;
      const key = `${bondRadius}:${placement.geomLen.toFixed(4)}:${bondRadialSegments}`;
      let cylinder = cylGeomCache.get(key);
      if (!cylinder) {
        cylinder = new THREE.CylinderGeometry(bondRadius, bondRadius, placement.geomLen, bondRadialSegments, 1, false);
        cylGeomCache.set(key, cylinder);
      }
      const mesh = new THREE.Mesh(cylinder, bondMat);
      mesh.position.copy(placement.mid);
      mesh.quaternion.setFromUnitVectors(up, placement.dirNorm);
      mesh.renderOrder = 58;
      addFusePreviewGroup.add(mesh);
    }
    for (const atom of geom.newAtoms) {
      const radius = getRenderedAtomDisplayRadius(atom.Z | 0);
      const key = `${radius.toFixed(4)}:${sphereWidthSegments}:${sphereHeightSegments}`;
      let sphere = sphereGeomCache.get(key);
      if (!sphere) {
        sphere = new THREE.SphereGeometry(radius, sphereWidthSegments, sphereHeightSegments);
        sphereGeomCache.set(key, sphere);
      }
      const mesh = new THREE.Mesh(sphere, new THREE.MeshPhysicalMaterial({
        color: getAtomRenderColor(atom.Z | 0),
        transparent: true,
        opacity: 0.72,
        roughness: 0.2,
        metalness: 0.08,
        clearcoat: 0.45,
        clearcoatRoughness: 0.15,
      }));
      mesh.position.copy(atom.world);
      mesh.renderOrder = 60;
      addFusePreviewGroup.add(mesh);
    }
  }

  /**
   * Start one fuse-ring preview on the clicked host bond.
   * @param {*} hit
   * @returns {boolean}
   */
  function startFuseRingPlacementFromBondHit(hit) {
    return editPlacement.startFuseRingPlacementFromBondHit(hit);
  }

  /**
   * Rotate the active fuse-ring preview around the host bond axis.
   * @param {PointerEvent} e
   */
  function updateFuseRingPlacementRotationFromEvent(e) {
    editPlacement.updateFuseRingPlacementRotationFromEvent(e);
  }

  /**
   * Commit the active fuse-ring preview into the current editable volume.
   * @returns {boolean}
   */
  function commitFuseRingPlacement() {
    return editPlacement.commitFuseRingPlacement();
  }

  /**
   * Keep edit-tool controls synchronized with current edit state.
   * @param {{syncSearch?:boolean}=} options
   */
  function updateEditToolboxUi(options = {}) {
    const syncSearch = options.syncSearch !== false;
    const isEdit = editMode;
    const isSelect = editTool === EDIT_TOOL.SELECT;
    const isMove = editTool === EDIT_TOOL.MOVE;
    const isAdd = editTool === EDIT_TOOL.ADD;
    const isBond = editTool === EDIT_TOOL.BOND;
    const isTransform = editTool === EDIT_TOOL.TRANSFORM;
    const isDelete = editTool === EDIT_TOOL.DELETE;
    const isAtomAddMode = editAddMode === EDIT_ADD_MODE.ATOM;
    const isFragmentAddMode = editAddMode === EDIT_ADD_MODE.FRAGMENT;
    const isMoleculeAddMode = editAddMode === EDIT_ADD_MODE.MOLECULE;

    if (editToolboxEl) {
      editToolboxEl.setAttribute('aria-hidden', 'true');
    }
    updateEditAdaptiveMenuUi();
    updateAddAtomOperatorUi();
    updateMoleculePlacementOperatorUi();
    if (editToolSelectBtn) editToolSelectBtn.classList.toggle('active', isSelect);
    if (editToolMoveBtn) editToolMoveBtn.classList.toggle('active', isMove);
    if (editToolAddBtn) editToolAddBtn.classList.toggle('active', isAdd);
    if (editToolBondBtn) editToolBondBtn.classList.toggle('active', isBond);
    if (editToolTransformBtn) editToolTransformBtn.classList.toggle('active', isTransform);
    if (editToolDeleteBtn) editToolDeleteBtn.classList.toggle('active', isDelete);
    if ((!isEdit || !isBond) && bondEditing) bondEditing.hidePopup();
    if (editAddPaneEl) editAddPaneEl.classList.toggle('active', isEdit && isAdd);
    if (editBondPaneEl) editBondPaneEl.classList.toggle('active', isEdit && isBond);
    if (editTransformPaneEl) editTransformPaneEl.classList.toggle('active', isEdit && isTransform);
    if (editAddModeAtomBtn) editAddModeAtomBtn.classList.toggle('active', isAtomAddMode);
    if (editAddModeFragmentBtn) editAddModeFragmentBtn.classList.toggle('active', isFragmentAddMode);
    if (editAddModeMoleculeBtn) editAddModeMoleculeBtn.classList.toggle('active', isMoleculeAddMode);
    if (editAddAtomPaneEl) editAddAtomPaneEl.classList.toggle('active', isAtomAddMode);
    if (editAddFragmentPaneEl) editAddFragmentPaneEl.classList.toggle('active', isFragmentAddMode);
    if (editAddMoleculePaneEl) editAddMoleculePaneEl.classList.toggle('active', isMoleculeAddMode);
    if (editTransformScopeEl && document.activeElement !== editTransformScopeEl) editTransformScopeEl.value = normalizeEditTransformScope(editTransformScope);
    if (editTransformModeEl && document.activeElement !== editTransformModeEl) editTransformModeEl.value = normalizeEditTransformMode(editTransformMode);
    if (editTransformCleanupAutoEl) editTransformCleanupAutoEl.checked = !!editTransformAutoCleanupEnabled;
    if (editFragmentAttachPolicyEl && document.activeElement !== editFragmentAttachPolicyEl) {
      editFragmentAttachPolicyEl.value = normalizeEditFragmentAttachPolicy(editAddFragmentAttachPolicy);
    }
    updateEditCleanupUiState();

    const angleLabel = addGrowDetectedAngleDeg > 0 ? `${addGrowDetectedAngleDeg.toFixed(1)}°` : 'auto';
    const atomInfo = ATOM_Z_TO_DATA && ATOM_Z_TO_DATA[editAddElementZ];
    const atomSymbol = atomInfo && atomInfo.symbol ? atomInfo.symbol : `Z${editAddElementZ}`;
    const atomName = atomInfo && atomInfo.name ? atomInfo.name : atomSymbol;
    if (editAddCurrentEl) editAddCurrentEl.textContent = `Adding atom: ${atomName} (${atomSymbol}) • bond ${editAddBondOrder} • angle ${angleLabel}`;
    if (editBondOrderEl && document.activeElement !== editBondOrderEl) editBondOrderEl.value = String(editBondOrder);
    if (editBondActionEl && document.activeElement !== editBondActionEl) editBondActionEl.value = normalizeEditBondAction(editBondAction);
    if (editBondCurrentEl) {
      const record = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null;
      const vol = record && record.vol;
      const pendingIndex = getEditBondPendingAtomIndex(vol);
      if (pendingIndex >= 0 && vol && vol.atoms[pendingIndex]) {
        const pendingAtom = vol.atoms[pendingIndex];
        editBondCurrentEl.textContent = `Set mode • First atom: ${getElementName(pendingAtom.Z | 0)} (${getElementSymbol(pendingAtom.Z | 0)}) • Click a second atom to create a bond`;
      } else {
        editBondCurrentEl.textContent = 'Set mode • Click two atoms to create a bond • Click an existing bond to choose order or 0 to delete';
      }
    }
    const fragment = getCurrentFragmentDefinition();
    if (editFragmentAttachPolicyEl) {
      const fuseOption = editFragmentAttachPolicyEl.querySelector('option[value="fuse_ring"]');
      const supportsFuse = !!(fragment && Array.isArray(fragment.attachModes) && fragment.attachModes.includes(EDIT_FRAGMENT_ATTACH_POLICY.FUSE_RING));
      if (fuseOption) fuseOption.disabled = !supportsFuse;
      if (!supportsFuse && editAddFragmentAttachPolicy === EDIT_FRAGMENT_ATTACH_POLICY.FUSE_RING) {
        editAddFragmentAttachPolicy = EDIT_FRAGMENT_ATTACH_POLICY.AUTO;
        editFragmentAttachPolicyEl.value = EDIT_FRAGMENT_ATTACH_POLICY.AUTO;
      }
    }
    if (editFragmentCurrentEl) {
      if (fragment) {
        const atomCount = Array.isArray(fragment.atoms) ? fragment.atoms.length : 0;
        const attachModes = Array.isArray(fragment.attachModes) ? fragment.attachModes : [];
        const policy = normalizeEditFragmentAttachPolicy(editAddFragmentAttachPolicy);
        const fuseEligible = attachModes.includes(EDIT_FRAGMENT_ATTACH_POLICY.FUSE_RING);
        let cleanupLabel = 'cleanup off';
        if (editAutoCleanupEnabled) {
          const cleanupParts = [];
          if (editCleanupBondLengthEnabled) cleanupParts.push('bond');
          if (editCleanupOverlapEnabled) cleanupParts.push('relief');
          cleanupLabel = cleanupParts.length ? `cleanup ${cleanupParts.join('+')}` : 'cleanup manual only';
        }
        const modeSuffix = policy === EDIT_FRAGMENT_ATTACH_POLICY.FUSE_RING
          ? (fuseEligible ? 'bond click • drag spin • click confirm' : 'fuse ring unavailable')
          : `bond ${editAddBondOrder} • angle ${angleLabel}`;
        editFragmentCurrentEl.textContent = `Adding fragment: ${fragment.name} (${fragment.formula}) • ${atomCount} atoms • ${getEditFragmentAttachPolicyLabel(policy)} • ${modeSuffix} • ${cleanupLabel}`;
      } else {
        editFragmentCurrentEl.textContent = 'No fragment selected';
      }
    }
    const molecule = getCurrentMoleculeDefinition();
    if (editMoleculeCurrentEl) {
      if (molecule) {
        const atomCount = Array.isArray(molecule.atoms) ? molecule.atoms.length : 0;
        if (moleculePlaceActive) {
          editMoleculeCurrentEl.textContent = `Placing molecule: ${molecule.name} (${molecule.formula}) • ${atomCount} atoms • drag rotate • click to place`;
        } else {
          editMoleculeCurrentEl.textContent = `Molecule: ${molecule.name} (${molecule.formula}) • ${atomCount} atoms`;
        }
      } else {
        editMoleculeCurrentEl.textContent = 'No molecule selected';
      }
    }
    if (editTransformCurrentEl) {
      const scopeLabel = getEditTransformScopeLabel(editTransformScope);
      const modeLabel = getEditTransformModeLabel(editTransformMode);
      const selectionSummary = describeTransformSelection(
        (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex].vol : null,
        getActiveTransformSelectionIndices(),
        transformSelectionKind,
        getCurrentTransformSelectionContext()
      ).status;
      let usage = 'Click to select • drag current selection to transform';
      if (editTransformMode === EDIT_TRANSFORM_MODE.ROTATE_FRAGMENT) {
        usage = 'Click a bond to select one side • drag the current selection to spin about that bond axis • Shift-click adds another target';
      } else if (editTransformMode === EDIT_TRANSFORM_MODE.ROTATE_BOND) {
        usage = 'Click a bond to select one side • drag the current selection to rotate around the opposite atom • Shift-click adds another target';
      } else {
        usage = 'Click an atom to select its fragment or whole molecule • Click a bond to select one side • Drag current selection to move • Click empty space to clear • Shift-click adds another target';
      }
      editTransformCurrentEl.textContent = `Scope: ${scopeLabel} • Action: ${modeLabel} • Cleanup ${editTransformAutoCleanupEnabled ? 'on' : 'off'} • ${selectionSummary} • ${usage}`;
    }

    if (syncSearch && isAtomAddMode && editAddSearchEl && document.activeElement !== editAddSearchEl) {
      editAddSearchEl.value = formatEditAddElementSearchValue(editAddElementZ);
      editAddSearchClearedOnFocus = false;
    }
    if (syncSearch && isFragmentAddMode && editFragmentSearchEl && document.activeElement !== editFragmentSearchEl && fragment) {
      editFragmentSearchEl.value = `${fragment.name} (${fragment.formula}) [${fragment.id}]`;
    }
    if (syncSearch && isMoleculeAddMode && editMoleculeSearchEl && document.activeElement !== editMoleculeSearchEl && molecule) {
      editMoleculeSearchEl.value = `${molecule.name} (${molecule.formula}) [${molecule.id}]`;
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
          btn.style.color = lum > 0.6 ? UI_PALETTE.quickPickTextOnLightAlt : UI_PALETTE.quickPickTextOnDark;
        } catch {
          btn.style.background = UI_PALETTE.quickPickFallbackBg;
          btn.style.color = UI_PALETTE.quickPickFallbackFg;
        }
      });
    }
    if (editFragmentQuickEl) {
      const quickButtons = editFragmentQuickEl.querySelectorAll('button[data-fragment-id]');
      quickButtons.forEach((btn) => {
        const id = normalizeFragmentId(btn.getAttribute('data-fragment-id'));
        btn.classList.toggle('active', id === normalizeFragmentId(editAddFragmentId));
      });
    }
    if (editMoleculeQuickEl) {
      const quickButtons = editMoleculeQuickEl.querySelectorAll('button[data-molecule-id]');
      quickButtons.forEach((btn) => {
        const id = normalizeFragmentId(btn.getAttribute('data-molecule-id'));
        btn.classList.toggle('active', id === normalizeFragmentId(editAddMoleculeId));
      });
    }
    if (editBondQuickEl) {
      const quickButtons = editBondQuickEl.querySelectorAll('button[data-bond-order]');
      quickButtons.forEach((btn) => {
        const order = Number(btn.getAttribute('data-bond-order'));
        btn.classList.toggle('active', order === editBondOrder);
      });
    }
  }

  /**
   * Change the active edit sub-tool.
   * @param {'select'|'move'|'add'|'bond'|'transform'|'delete'} nextTool
   * @param {{announce?:boolean}=} options
   */
  function setEditTool(nextTool, options = {}) {
    editTools.setEditTool(nextTool, options);
  }

  /**
   * Switch between add-atom and add-fragment submodes.
   * @param {'atom'|'fragment'|'molecule'} nextMode
   * @param {{announce?:boolean,syncSearch?:boolean}=} options
   */
  function setEditAddMode(nextMode, options = {}) {
    editTools.setEditAddMode(nextMode, options);
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
   * Hide every adaptive tool popover except one optional kind.
   * @param {'atom'|'fragment'|'molecule'|'transform'|''=} exceptKind
   */
  function hideAllAdaptiveToolPopovers(exceptKind = '') {
    if (adaptivePopoverController) adaptivePopoverController.hideAll(exceptKind);
  }

  /**
   * Human-readable label shown in the Add-atom selector field.
   * @param {number} z
   * @returns {string}
   */
  function formatEditAddElementSearchValue(z) {
    const atomInfo = ATOM_Z_TO_DATA && ATOM_Z_TO_DATA[z];
    const atomSymbol = atomInfo && atomInfo.symbol ? atomInfo.symbol : `Z${z}`;
    const atomName = atomInfo && atomInfo.name ? atomInfo.name : atomSymbol;
    return `${atomSymbol} — ${atomName} (${z})`;
  }

  /**
   * Select a fragment for Add-fragment mode.
   * @param {*} fragmentId
   * @param {{announce?:boolean,syncSearch?:boolean}=} options
   * @returns {boolean}
   */
  function setEditAddFragment(fragmentId, options = {}) {
    const announce = options.announce !== false;
    const syncSearch = options.syncSearch !== false;
    const normalizedId = normalizeFragmentId(fragmentId);
    const fragment = getCatalogEntryById(normalizedId, CATALOG_KIND.FRAGMENT) || resolveCatalogQuery(fragmentId, CATALOG_KIND.FRAGMENT);
    if (!fragment) return false;
    editAddFragmentId = fragment.id;
    if (!Array.isArray(fragment.attachModes) || !fragment.attachModes.includes(EDIT_FRAGMENT_ATTACH_POLICY.FUSE_RING)) {
      clearFuseRingPreview();
    }
    editAddBondOrder = normalizeEditAddBondOrder(fragment.preferredBondOrder || editAddBondOrder);
    refreshActiveAddGrowPreview();
    updateEditToolboxUi({ syncSearch });
    if (announce && editMode && editTool === EDIT_TOOL.ADD) {
      if (editAddFragmentAttachPolicy === EDIT_FRAGMENT_ATTACH_POLICY.FUSE_RING) {
        setHintMessage(`Add fragment: ${fragment.name} (${fragment.formula}) • Fuse ring • Click a host bond`);
      } else {
        setHintMessage(`Add fragment: ${fragment.name} (${fragment.formula}) • Policy ${getEditFragmentAttachPolicyLabel(editAddFragmentAttachPolicy)}`);
      }
    }
    return true;
  }

  /**
   * Select a molecule for Add-molecule mode.
   * @param {*} moleculeId
   * @param {{announce?:boolean,syncSearch?:boolean}=} options
   * @returns {boolean}
   */
  function setEditAddMolecule(moleculeId, options = {}) {
    const announce = options.announce !== false;
    const syncSearch = options.syncSearch !== false;
    const normalizedId = normalizeFragmentId(moleculeId);
    const molecule = getCatalogEntryById(normalizedId, CATALOG_KIND.MOLECULE) || resolveCatalogQuery(moleculeId, CATALOG_KIND.MOLECULE);
    if (!molecule) return false;
    editAddMoleculeId = molecule.id;
    clearMoleculePlacementPreview();
    updateEditToolboxUi({ syncSearch });
    if (announce && editMode && editTool === EDIT_TOOL.ADD) {
      setHintMessage(`Add molecule: ${molecule.name} (${molecule.formula})`);
    }
    return true;
  }

  /**
   * Rebuild fragment suggestions and quick chips from the active fragment catalog.
   */
  function refreshEditAddFragmentControls() {
    const fragmentEntries = getCatalogEntries(CATALOG_KIND.FRAGMENT);
    if (editFragmentSuggestionsEl) {
      editFragmentSuggestionsEl.innerHTML = '';
      for (const fragment of fragmentEntries) {
        const opt = document.createElement('option');
        opt.value = `${fragment.name} (${fragment.formula}) [${fragment.id}]`;
        editFragmentSuggestionsEl.appendChild(opt);
      }
    }
    if (editFragmentQuickEl) {
      editFragmentQuickEl.innerHTML = '';
      for (const id of EDIT_QUICK_FRAGMENTS) {
        const fragment = getCatalogEntryById(id, CATALOG_KIND.FRAGMENT);
        if (!fragment) continue;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-fragment-id', fragment.id);
        btn.title = `${fragment.name} (${fragment.formula})`;
        btn.textContent = fragment.name;
        btn.onclick = () => {
          setEditAddFragment(fragment.id, { announce: true, syncSearch: true });
          setEditAddMode(EDIT_ADD_MODE.FRAGMENT, { announce: false, syncSearch: true });
        };
        editFragmentQuickEl.appendChild(btn);
      }
    }
    if (!getCurrentFragmentDefinition() && fragmentEntries[0]) editAddFragmentId = fragmentEntries[0].id;
    if (!setEditAddFragment(editAddFragmentId, { announce: false, syncSearch: true }) && fragmentEntries[0]) {
      setEditAddFragment(fragmentEntries[0].id, { announce: false, syncSearch: true });
    }
    updateEditToolboxUi({ syncSearch: true });
  }

  /**
   * Rebuild molecule suggestions and quick chips from the active catalog.
   */
  function refreshEditAddMoleculeControls() {
    const moleculeEntries = getCatalogEntries(CATALOG_KIND.MOLECULE);
    if (editMoleculeSuggestionsEl) {
      editMoleculeSuggestionsEl.innerHTML = '';
      for (const molecule of moleculeEntries) {
        const opt = document.createElement('option');
        opt.value = `${molecule.name} (${molecule.formula}) [${molecule.id}]`;
        editMoleculeSuggestionsEl.appendChild(opt);
      }
    }
    if (editMoleculeQuickEl) {
      editMoleculeQuickEl.innerHTML = '';
      for (const id of EDIT_QUICK_MOLECULES) {
        const molecule = getCatalogEntryById(id, CATALOG_KIND.MOLECULE);
        if (!molecule) continue;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-molecule-id', molecule.id);
        btn.title = `${molecule.name} (${molecule.formula})`;
        btn.textContent = molecule.name;
        btn.onclick = () => {
          setEditAddMolecule(molecule.id, { announce: true, syncSearch: true });
          setEditAddMode(EDIT_ADD_MODE.MOLECULE, { announce: false, syncSearch: true });
        };
        editMoleculeQuickEl.appendChild(btn);
      }
    }
    if (!getCurrentMoleculeDefinition() && moleculeEntries[0]) editAddMoleculeId = moleculeEntries[0].id;
    if (!setEditAddMolecule(editAddMoleculeId, { announce: false, syncSearch: true }) && moleculeEntries[0]) {
      setEditAddMolecule(moleculeEntries[0].id, { announce: false, syncSearch: true });
    }
    updateEditToolboxUi({ syncSearch: true });
  }

  /**
   * Load fragment catalog from static assets and refresh Add-fragment controls.
   */
  async function loadExternalFragmentLibrary() {
    if (typeof loadFragmentLibraryFromManifest !== 'function') return;
    try {
      const result = await loadFragmentLibraryFromManifest('./assets/fragments/library.json');
      refreshEditAddFragmentControls();
      refreshEditAddMoleculeControls();
      if (result && Array.isArray(result.errors) && result.errors.length) {
        console.warn('[Fragments] Loaded with warnings:', result.errors);
      }
      if (result && result.count > 0 && !result.skippedExternal) {
        console.info(`[Fragments] Loaded ${result.count} catalog entries from ${result.source || 'manifest'}.`);
      }
    } catch (error) {
      console.warn('[Fragments] External fragment library load failed; using built-in defaults.', error);
    }
  }

  /**
   * Populate search suggestions and quick-add chips for Add mode.
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
    if (editBondQuickEl) {
      editBondQuickEl.innerHTML = '';
      for (const order of [1, 2, 3, 4]) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-bond-order', String(order));
        btn.title = `Set bond order ${order}`;
        btn.textContent = String(order);
        btn.onclick = () => { setEditBondOrder(order, { announce: true }); };
        editBondQuickEl.appendChild(btn);
      }
    }
    refreshEditAddFragmentControls();
    refreshEditAddMoleculeControls();
    if (editAddSearchEl) {
      const commit = () => {
        const rawValue = String(editAddSearchEl.value || '').trim();
        if (!rawValue) {
          editAddSearchEl.value = formatEditAddElementSearchValue(editAddElementZ);
          editAddSearchClearedOnFocus = false;
          updateEditToolboxUi({ syncSearch: true });
          return;
        }
        const z = resolveElementQueryToZ(rawValue);
        if (!setEditAddElement(z, { announce: true, syncSearch: true })) {
          updateEditToolboxUi({ syncSearch: true });
          setHintMessage(`Element not recognized: "${rawValue}"`);
        }
      };
      editAddSearchEl.addEventListener('focus', () => {
        editAddSearchClearedOnFocus = true;
        editAddSearchEl.value = '';
      });
      editAddSearchEl.addEventListener('blur', () => {
        if (String(editAddSearchEl.value || '').trim()) {
          editAddSearchClearedOnFocus = false;
          return;
        }
        editAddSearchEl.value = formatEditAddElementSearchValue(editAddElementZ);
        editAddSearchClearedOnFocus = false;
      });
      editAddSearchEl.addEventListener('change', commit);
      editAddSearchEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        commit();
      });
      editAddSearchEl.addEventListener('input', () => {
        if (editAddSearchClearedOnFocus && String(editAddSearchEl.value || '').trim()) {
          editAddSearchClearedOnFocus = false;
        }
        updateEditToolboxUi({ syncSearch: false });
      });
    }
    if (editFragmentSearchEl) {
      const commit = () => {
        const fragment = resolveCatalogQuery(editFragmentSearchEl.value, CATALOG_KIND.FRAGMENT);
        if (!fragment || !setEditAddFragment(fragment.id, { announce: true, syncSearch: true })) {
          updateEditToolboxUi({ syncSearch: true });
          setHintMessage(`Fragment not recognized: "${String(editFragmentSearchEl.value || '').trim()}"`);
        }
      };
      editFragmentSearchEl.addEventListener('change', commit);
      editFragmentSearchEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        commit();
      });
      editFragmentSearchEl.addEventListener('input', () => updateEditToolboxUi({ syncSearch: false }));
    }
    if (editFragmentAttachPolicyEl) {
      editFragmentAttachPolicyEl.addEventListener('change', () => {
        editAddFragmentAttachPolicy = normalizeEditFragmentAttachPolicy(editFragmentAttachPolicyEl.value);
        clearAddGrowPreview();
        if (editAddFragmentAttachPolicy !== EDIT_FRAGMENT_ATTACH_POLICY.FUSE_RING) clearFuseRingPreview();
        updateEditToolboxUi({ syncSearch: false });
        if (editMode && editTool === EDIT_TOOL.ADD && editAddMode === EDIT_ADD_MODE.FRAGMENT) {
          setHintMessage(`Fragment attach policy: ${getEditFragmentAttachPolicyLabel(editAddFragmentAttachPolicy)}.`);
        }
      });
    }
    if (editCleanupAutoEl) {
      editCleanupAutoEl.addEventListener('change', () => {
        editAutoCleanupEnabled = !!editCleanupAutoEl.checked;
        updateEditToolboxUi({ syncSearch: false });
      });
    }
    if (editCleanupBondLengthEl) {
      editCleanupBondLengthEl.addEventListener('change', () => {
        editCleanupBondLengthEnabled = !!editCleanupBondLengthEl.checked;
        updateEditToolboxUi({ syncSearch: false });
      });
    }
    if (editCleanupOverlapEl) {
      editCleanupOverlapEl.addEventListener('change', () => {
        editCleanupOverlapEnabled = !!editCleanupOverlapEl.checked;
        updateEditToolboxUi({ syncSearch: false });
      });
    }
    if (editCleanupStrengthEl) {
      editCleanupStrengthEl.addEventListener('input', () => {
        editCleanupStrength = normalizeEditCleanupStrength(editCleanupStrengthEl.value);
        updateEditCleanupUiState();
      });
      editCleanupStrengthEl.addEventListener('change', () => {
        editCleanupStrength = normalizeEditCleanupStrength(editCleanupStrengthEl.value);
        updateEditCleanupUiState();
      });
    }
    if (editCleanupApplyBtn) {
      editCleanupApplyBtn.onclick = () => { void applyCleanupToLatestFragmentOperation(); };
    }
    if (editMoleculeSearchEl) {
      const commit = () => {
        const molecule = resolveCatalogQuery(editMoleculeSearchEl.value, CATALOG_KIND.MOLECULE);
        if (!molecule || !setEditAddMolecule(molecule.id, { announce: true, syncSearch: true })) {
          updateEditToolboxUi({ syncSearch: true });
          setHintMessage(`Molecule not recognized: "${String(editMoleculeSearchEl.value || '').trim()}"`);
        }
      };
      editMoleculeSearchEl.addEventListener('change', commit);
      editMoleculeSearchEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        commit();
      });
      editMoleculeSearchEl.addEventListener('input', () => updateEditToolboxUi({ syncSearch: false }));
    }
    if (editAddModeAtomBtn) editAddModeAtomBtn.onclick = () => setEditAddMode(EDIT_ADD_MODE.ATOM, { announce: true, syncSearch: true });
    if (editAddModeFragmentBtn) editAddModeFragmentBtn.onclick = () => setEditAddMode(EDIT_ADD_MODE.FRAGMENT, { announce: true, syncSearch: true });
    if (editAddModeMoleculeBtn) editAddModeMoleculeBtn.onclick = () => setEditAddMode(EDIT_ADD_MODE.MOLECULE, { announce: true, syncSearch: true });
    if (editMoleculeAlignXBtn) editMoleculeAlignXBtn.onclick = () => { if (!alignMoleculePlacementToAxis('x')) setHintMessage('Place a molecule first, then align to X.'); };
    if (editMoleculeAlignYBtn) editMoleculeAlignYBtn.onclick = () => { if (!alignMoleculePlacementToAxis('y')) setHintMessage('Place a molecule first, then align to Y.'); };
    if (editMoleculeAlignZBtn) editMoleculeAlignZBtn.onclick = () => { if (!alignMoleculePlacementToAxis('z')) setHintMessage('Place a molecule first, then align to Z.'); };
    if (editAdaptiveSelectionBtn) editAdaptiveSelectionBtn.onclick = () => setEditTool(EDIT_TOOL.SELECT);
    if (editAdaptiveMoveBtn) editAdaptiveMoveBtn.onclick = () => setEditTool(EDIT_TOOL.MOVE);
    bindAdaptivePopoverItem({
      controller: adaptivePopoverController,
      kind: 'atom',
      triggerEl: editAdaptiveAddAtomBtn,
      popoverEl: editAdaptiveAddAtomPopoverEl,
      onClick: () => adaptivePopoverController && adaptivePopoverController.openMode('atom', { announce: true, focusSearch: false }),
      clickShowsPopover: true,
      clickFocusesSearch: true,
      hoverShowsPopover: true,
      hideDelayMs: 120,
    });
    bindAdaptivePopoverItem({
      controller: adaptivePopoverController,
      kind: 'fragment',
      triggerEl: editAdaptiveAddFragmentBtn,
      popoverEl: editAdaptiveAddFragmentPopoverEl,
      onClick: () => adaptivePopoverController && adaptivePopoverController.openMode('fragment', { announce: true, focusSearch: false }),
      clickShowsPopover: true,
      clickFocusesSearch: true,
      hoverShowsPopover: true,
      hideDelayMs: 120,
    });
    bindAdaptivePopoverItem({
      controller: adaptivePopoverController,
      kind: 'molecule',
      triggerEl: editAdaptiveAddMoleculeBtn,
      popoverEl: editAdaptiveAddMoleculePopoverEl,
      onClick: () => adaptivePopoverController && adaptivePopoverController.openMode('molecule', { announce: true, focusSearch: false }),
      clickShowsPopover: true,
      clickFocusesSearch: true,
      hoverShowsPopover: true,
      hideDelayMs: 120,
    });
    if (editAdaptiveBondBtn) {
      editAdaptiveBondBtn.onclick = () => {
        hideAllAdaptiveToolPopovers();
        setEditTool(EDIT_TOOL.BOND);
      };
    }
    bindAdaptivePopoverItem({
      controller: adaptivePopoverController,
      kind: 'transform',
      triggerEl: editAdaptiveTransformBtn,
      popoverEl: editAdaptiveTransformPopoverEl,
      onClick: () => setEditTool(EDIT_TOOL.TRANSFORM),
      clickShowsPopover: true,
      clickFocusesSearch: true,
      hoverShowsPopover: true,
      hideDelayMs: 120,
    });
    if (editAdaptiveDeleteBtn) editAdaptiveDeleteBtn.onclick = () => {
      hideAllAdaptiveToolPopovers();
      setEditTool(EDIT_TOOL.DELETE);
    };
    if (editAddAtomOperatorHeaderEl) {
      editAddAtomOperatorHeaderEl.onclick = () => {
        addAtomOperatorCollapsed = !addAtomOperatorCollapsed;
        updateAddAtomOperatorUi();
      };
    }
    const bindAddAtomOperatorCoordInput = (axis, inputEl) => {
      if (!inputEl) return;
      inputEl.addEventListener('input', () => applyAddAtomOperatorInput(axis, inputEl));
      inputEl.addEventListener('change', () => applyAddAtomOperatorInput(axis, inputEl, { syncOnly: true }));
      inputEl.addEventListener('blur', () => updateAddAtomOperatorUi());
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyAddAtomOperatorInput(axis, inputEl, { syncOnly: true });
          finalizeAddAtomOperatorSession({ commit: true, announce: false });
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          finalizeAddAtomOperatorSession({ commit: false, announce: false });
        }
      });
    };
    bindAddAtomOperatorCoordInput('x', editAddAtomOperatorXEl);
    bindAddAtomOperatorCoordInput('y', editAddAtomOperatorYEl);
    bindAddAtomOperatorCoordInput('z', editAddAtomOperatorZEl);
    if (editAddMoleculeOperatorHeaderEl) {
      editAddMoleculeOperatorHeaderEl.onclick = () => {
        moleculePlaceOperatorCollapsed = !moleculePlaceOperatorCollapsed;
        updateMoleculePlacementOperatorUi();
      };
    }
    const bindMoleculeOperatorInput = (axis, inputEl, mode) => {
      if (!inputEl) return;
      inputEl.addEventListener('input', () => {
        if (mode === 'rotation') applyMoleculePlacementRotationInput(axis, inputEl);
        else applyMoleculePlacementPositionInput(axis, inputEl);
      });
      inputEl.addEventListener('change', () => {
        if (mode === 'rotation') applyMoleculePlacementRotationInput(axis, inputEl);
        else applyMoleculePlacementPositionInput(axis, inputEl);
        updateMoleculePlacementOperatorUi();
      });
      inputEl.addEventListener('blur', () => updateMoleculePlacementOperatorUi());
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (mode === 'rotation') applyMoleculePlacementRotationInput(axis, inputEl);
          else applyMoleculePlacementPositionInput(axis, inputEl);
          commitMoleculePlacement();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          clearMoleculePlacementPreview();
          updateEditToolboxUi({ syncSearch: false });
          setHintMessage('Canceled molecule placement.');
        }
      });
    };
    bindMoleculeOperatorInput('x', editAddMoleculeOperatorXEl, 'position');
    bindMoleculeOperatorInput('y', editAddMoleculeOperatorYEl, 'position');
    bindMoleculeOperatorInput('z', editAddMoleculeOperatorZEl, 'position');
    bindMoleculeOperatorInput('x', editAddMoleculeOperatorRotXEl, 'rotation');
    bindMoleculeOperatorInput('y', editAddMoleculeOperatorRotYEl, 'rotation');
    bindMoleculeOperatorInput('z', editAddMoleculeOperatorRotZEl, 'rotation');
    if (editAddMoleculeOperatorAlignXBtn) editAddMoleculeOperatorAlignXBtn.onclick = () => { if (!alignMoleculePlacementToAxis('x')) setHintMessage('Place a molecule first, then align to X.'); };
    if (editAddMoleculeOperatorAlignYBtn) editAddMoleculeOperatorAlignYBtn.onclick = () => { if (!alignMoleculePlacementToAxis('y')) setHintMessage('Place a molecule first, then align to Y.'); };
    if (editAddMoleculeOperatorAlignZBtn) editAddMoleculeOperatorAlignZBtn.onclick = () => { if (!alignMoleculePlacementToAxis('z')) setHintMessage('Place a molecule first, then align to Z.'); };
    if (editToolSelectBtn) editToolSelectBtn.onclick = () => setEditTool(EDIT_TOOL.SELECT);
    if (editToolMoveBtn) editToolMoveBtn.onclick = () => setEditTool(EDIT_TOOL.MOVE);
    if (editToolAddBtn) editToolAddBtn.onclick = () => setEditTool(EDIT_TOOL.ADD);
    if (editToolBondBtn) editToolBondBtn.onclick = () => setEditTool(EDIT_TOOL.BOND);
    if (editToolTransformBtn) editToolTransformBtn.onclick = () => setEditTool(EDIT_TOOL.TRANSFORM);
    if (editToolDeleteBtn) editToolDeleteBtn.onclick = () => setEditTool(EDIT_TOOL.DELETE);
    if (editBondOrderEl) {
      editBondOrderEl.addEventListener('change', () => {
        setEditBondOrder(editBondOrderEl.value, { announce: editMode && editTool === EDIT_TOOL.BOND });
      });
    }
    if (editBondActionEl) {
      editBondActionEl.addEventListener('change', () => {
        setEditBondAction(editBondActionEl.value, { announce: true });
      });
    }
    if (editTransformScopeEl) {
      editTransformScopeEl.addEventListener('change', () => {
        editTransformScope = normalizeEditTransformScope(editTransformScopeEl.value);
        updateEditToolboxUi({ syncSearch: false });
        updateTransformSelectionGuides();
        if (editMode && editTool === EDIT_TOOL.TRANSFORM) {
          setHintMessage(`Transform scope: ${getEditTransformScopeLabel(editTransformScope)}.`);
        }
      });
    }
    if (editTransformModeEl) {
      editTransformModeEl.addEventListener('change', () => {
        editTransformMode = normalizeEditTransformMode(editTransformModeEl.value);
        updateEditToolboxUi({ syncSearch: false });
        updateTransformSelectionGuides();
        if (editMode && editTool === EDIT_TOOL.TRANSFORM) {
          const modeLabel = getEditTransformModeLabel(editTransformMode);
          if (editTransformMode === EDIT_TRANSFORM_MODE.ROTATE_FRAGMENT) {
            setHintMessage(`Transform action: ${modeLabel} • Click a bond to select one side, then drag to spin about the bond axis • Shift-click adds another target.`);
          } else if (editTransformMode === EDIT_TRANSFORM_MODE.ROTATE_BOND) {
            setHintMessage(`Transform action: ${modeLabel} • Click a bond to select one side, then drag to rotate around the opposite atom • Shift-click adds another target.`);
          } else {
            setHintMessage(`Transform action: ${modeLabel} • Click an atom to select its fragment or whole molecule • Click a bond to select one side • Drag the current selection to move • Click empty space to clear • Shift-click adds another target.`);
          }
        }
      });
    }
    if (editTransformCleanupAutoEl) {
      editTransformCleanupAutoEl.addEventListener('change', () => {
        editTransformAutoCleanupEnabled = !!editTransformCleanupAutoEl.checked;
        updateEditToolboxUi({ syncSearch: false });
        if (editMode && editTool === EDIT_TOOL.TRANSFORM) {
          setHintMessage(`Transform cleanup: ${editTransformAutoCleanupEnabled ? 'ON' : 'OFF'}.`);
        }
      });
    }
    updateEditCleanupUiState();
    setEditAddBondOrder(editAddBondOrder, { announce: false });
    setEditBondOrder(editBondOrder, { announce: false });
    setEditBondAction(editBondAction, { announce: false });
    setEditAddMode(EDIT_ADD_MODE.ATOM, { announce: false, syncSearch: true });
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
  /**
   * End one active display-mode quaternion orbit gesture.
   * @param {PointerEvent=} e
   */
  function endQuaternionViewRotate(e) {
    if (!viewRotateActive) return;
    viewRotateActive = false;
    const pointerId = viewRotatePointerId;
    viewRotatePointerId = null;
    if (canvasEl && Number.isInteger(pointerId) && typeof canvasEl.releasePointerCapture === 'function') {
      try { canvasEl.releasePointerCapture(pointerId); } catch { }
    }
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
  }

  /**
   * Begin one quaternion-based orbit gesture on the main canvas.
   * @param {PointerEvent} e
   */
  function beginQuaternionViewRotate(e) {
    hideSurfaceHoverLabel();
    viewRotateActive = true;
    viewRotatePointerId = Number.isInteger(e.pointerId) ? e.pointerId : null;
    viewRotateLastClientX = Number(e.clientX) || 0;
    viewRotateLastClientY = Number(e.clientY) || 0;
    if (canvasEl && Number.isInteger(viewRotatePointerId) && typeof canvasEl.setPointerCapture === 'function') {
      try { canvasEl.setPointerCapture(viewRotatePointerId); } catch { }
    }
  }

  /**
   * Orbit the active camera about the current target using quaternion rotations.
   * This keeps the camera moving smoothly through the poles without OrbitControls'
   * spherical singularity.
   * @param {number} deltaX
   * @param {number} deltaY
   */
  function applyQuaternionViewOrbit(deltaX, deltaY) {
    if (!(Number.isFinite(deltaX) && Number.isFinite(deltaY))) return;
    if (Math.abs(deltaX) < 1e-6 && Math.abs(deltaY) < 1e-6) return;
    const target = controls.target.clone();
    const offset = camera.position.clone().sub(target);
    const radius = offset.length();
    if (!(radius > 1e-6)) return;

    const speed = Math.max(0.01, Number(controls.rotateSpeed) || 1.0);
    const gain = 0.0038 * speed;
    const forward = target.clone().sub(camera.position).normalize();
    let upAxis = camera.up.clone().normalize();
    if (upAxis.lengthSq() < 1e-10) upAxis.set(0, 1, 0);
    let rightAxis = new THREE.Vector3().crossVectors(forward, upAxis);
    if (rightAxis.lengthSq() < 1e-10) {
      rightAxis.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    } else {
      rightAxis.normalize();
    }

    const qYaw = new THREE.Quaternion().setFromAxisAngle(upAxis, -deltaX * gain);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(rightAxis, -deltaY * gain);
    offset.applyQuaternion(qYaw).applyQuaternion(qPitch);
    upAxis.applyQuaternion(qYaw).applyQuaternion(qPitch).normalize();

    camera.position.copy(target).add(offset);
    camera.up.copy(upAxis);
    camera.lookAt(target);
    updateActiveCameraProjection(currentViewportMetrics.cssWidth, currentViewportMetrics.cssHeight);
    refreshViewUI();
  }
  // --- Edit selection (temporary list) and visuals ---
  let editSel = []; // array of atom indices (max 3) — used in measurement mode
  let editSelGroup = new THREE.Group(); contentGroup.add(editSelGroup);
  let editSelectionClickAdditive = false;
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
    const selectedSet = new Set();
    if (currentMode === MODES.MEASURE) {
      for (const idx of editSel) selectedSet.add(idx);
    }
    if (currentMode === MODES.EDIT) {
      for (const idx of getEditAtomSelection()) selectedSet.add(idx);
    }
    if (currentMode === MODES.EDIT && editTool === EDIT_TOOL.BOND) {
      const record = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null;
      const vol = record && record.vol;
      const pendingIndex = getEditBondPendingAtomIndex(vol);
      if (pendingIndex >= 0) selectedSet.add(pendingIndex);
    }
    if (currentMode === MODES.EDIT && editTool === EDIT_TOOL.TRANSFORM) {
      for (const idx of getActiveTransformSelectionIndices()) selectedSet.add(idx);
    }
    for (let i = 0; i < atomGroup.children.length; i++) {
      const mesh = atomGroup.children[i];
      const selected = selectedSet.has(i);
      if (selected) ensureSelectHalo(mesh); else removeSelectHalo(mesh);
    }
  }
  let __editDownPt = null; let __editMoved = false; let __editClickIdx = -1;
  /**
   * Clear the current measurement/edit atom selection.
   */
  function clearEditSelection() {
    clearMeasurementLabelHover();
    cancelMeasurementLabelDrag();
    editSel = [];
    updateEditSelectionVisuals();
    updateSelectedHalos();
  }

  /**
   * Normalize one edit-mode atom selection against the active record.
   * @param {number[]} indices
   * @param {*} vol
   * @returns {number[]}
   */
  function normalizeEditAtomSelection(indices, vol) {
    return editTools.normalizeEditAtomSelection(indices, vol);
  }

  /**
   * Return the current persistent edit-mode atom selection.
   * @returns {number[]}
   */
  function getEditAtomSelection() {
    return editTools.getEditAtomSelection();
  }

  /**
   * Refresh the floating adaptive edit menu.
   */
  function updateEditAdaptiveMenuUi() {
    const isVisible = currentMode === MODES.EDIT;
    const isAtomAddActive = isVisible && editTool === EDIT_TOOL.ADD && editAddMode === EDIT_ADD_MODE.ATOM;
    const isFragmentAddActive = isVisible && editTool === EDIT_TOOL.ADD && editAddMode === EDIT_ADD_MODE.FRAGMENT;
    const isMoleculeAddActive = isVisible && editTool === EDIT_TOOL.ADD && editAddMode === EDIT_ADD_MODE.MOLECULE;
    const isBondActive = isVisible && editTool === EDIT_TOOL.BOND;
    const isTransformActive = isVisible && editTool === EDIT_TOOL.TRANSFORM;
    const isDeleteActive = isVisible && editTool === EDIT_TOOL.DELETE;
    const selectionCount = getEditAtomSelection().length;
    const fragment = getCurrentFragmentDefinition();
    const molecule = getCurrentMoleculeDefinition();
    updateAdaptiveMenuUiHelper({
      menuEl: editAdaptiveMenuEl,
      isVisible,
      positionMenu: positionEditAdaptiveMenu,
      onHideAllPopovers: hideAllAdaptiveToolPopovers,
      activeItems: [
        { el: editAdaptiveSelectionBtn, active: isVisible && editTool === EDIT_TOOL.SELECT },
        { el: editAdaptiveMoveBtn, active: isVisible && editTool === EDIT_TOOL.MOVE },
        { el: editAdaptiveAddAtomBtn, active: isAtomAddActive },
        { el: editAdaptiveAddFragmentBtn, active: isFragmentAddActive },
        { el: editAdaptiveAddMoleculeBtn, active: isMoleculeAddActive },
        { el: editAdaptiveBondBtn, active: isBondActive },
        { el: editAdaptiveTransformBtn, active: isTransformActive },
        { el: editAdaptiveDeleteBtn, active: isDeleteActive },
      ],
      metaItems: [
        {
          el: editAdaptiveSelectionMetaEl,
          text: selectionCount ? `${selectionCount} atom${selectionCount === 1 ? '' : 's'} selected` : 'Click atoms to build a selection',
        },
        { el: editAdaptiveAddAtomMetaEl, text: getElementSymbol(editAddElementZ) },
        {
          el: editAdaptiveAddFragmentMetaEl,
          text: fragment ? `${fragment.name} (${fragment.formula})` : 'Choose fragment and attach policy',
        },
        {
          el: editAdaptiveAddMoleculeMetaEl,
          text: molecule ? `${molecule.name} (${molecule.formula})` : 'Choose standalone molecule to place',
        },
        { el: editAdaptiveBondMetaEl, text: `Order ${editBondOrder} • Click bond to edit • Right-click to delete` },
        { el: editAdaptiveTransformMetaEl, text: `${getEditTransformModeLabel(editTransformMode)} • ${getEditTransformScopeLabel(editTransformScope)}` },
      ],
    });
  }

  /**
   * Anchor the adaptive edit menu against the actual sidebar edge.
   */
  function positionEditAdaptiveMenu() {
    positionAdaptiveMenuUi({
      menuEl: document.getElementById('editAdaptiveMenu'),
      toolbarEl: document.getElementById('toolbar'),
      sidebarCollapsed: document.body.classList.contains('sidebar-collapsed'),
      gap: 16,
    });
  }

  /**
   * Find one atom index by stable atom id inside a volume.
   * @param {*} vol
   * @param {string} atomId
   * @returns {number}
   */
  function findAtomIndexById(vol, atomId) {
    if (!vol || !Array.isArray(vol.atoms) || !atomId) return -1;
    const targetId = String(atomId);
    for (let i = 0; i < vol.atoms.length; i++) {
      const atom = vol.atoms[i];
      if (!atom) continue;
      if (String(ensureAtomId(atom)) === targetId) return i;
    }
    return -1;
  }

  /**
   * Resolve the current add-atom operator session against live record data.
   * @returns {{record:*,vol:*,atomIndex:number,atom:*}|null}
   */
  function resolveAddAtomOperatorSession() {
    return editPlacement.resolveAddAtomOperatorSession();
  }

  /**
   * Position one right-side operator panel against the viewport edge.
   * @param {HTMLElement|null} panelEl
   */
  function positionRightOperatorPanel(panelEl) {
    positionRightOperatorPanelUi(panelEl, { gap: 16, bottom: 24 });
  }

  /**
   * Position the floating add-atom operator panel.
   */
  function positionAddAtomOperatorPanel() {
    positionRightOperatorPanel(document.getElementById('editAddAtomOperatorPanel'));
  }

  /**
   * Position the floating add-molecule operator panel.
   */
  function positionAddMoleculeOperatorPanel() {
    positionRightOperatorPanel(document.getElementById('editAddMoleculeOperatorPanel'));
  }

  /**
   * Refresh the floating add-atom operator panel.
   */
  function updateAddAtomOperatorUi() {
    const resolved = resolveAddAtomOperatorSession();
    const isVisible = !!resolved && currentMode === MODES.EDIT;
    const world = resolved ? atomUnitsToAng(resolved.vol, resolved.atom) : { x: 0, y: 0, z: 0 };
    const symbol = resolved ? getElementSymbol((resolved.atom && resolved.atom.Z) | 0) : '';
    updateAddAtomOperatorPanelUi({
      panelEl: editAddAtomOperatorPanelEl,
      headerEl: editAddAtomOperatorHeaderEl,
      chevronEl: editAddAtomOperatorChevronEl,
      labelEl: editAddAtomOperatorLabelEl,
      xEl: editAddAtomOperatorXEl,
      yEl: editAddAtomOperatorYEl,
      zEl: editAddAtomOperatorZEl,
      isVisible,
      collapsed: addAtomOperatorCollapsed,
      labelText: `Add Atom ${symbol}`,
      world,
      positionPanel: positionAddAtomOperatorPanel,
    });
  }

  /**
   * Start one editable last-operation session for a newly added atom.
   * @param {*} record
   * @param {string} atomId
   * @param {Array<object>} beforeAtoms
   * @param {Array<object>} beforeBonds
   * @param {string} label
   */
  function beginAddAtomOperatorSession(record, atomId, beforeAtoms, beforeBonds, label) {
    editPlacement.beginAddAtomOperatorSession(record, atomId, beforeAtoms, beforeBonds, label);
  }

  /**
   * Read current molecule placement rotation as XYZ Euler degrees.
   * @returns {{x:number,y:number,z:number}}
   */
  function getMoleculePlacementEulerDegrees() {
    const euler = new THREE.Euler().setFromQuaternion(moleculePlaceQuaternion, 'XYZ');
    return {
      x: THREE.MathUtils.radToDeg(euler.x),
      y: THREE.MathUtils.radToDeg(euler.y),
      z: THREE.MathUtils.radToDeg(euler.z),
    };
  }

  /**
   * Refresh the floating add-molecule operator panel.
   */
  function updateMoleculePlacementOperatorUi() {
    const isVisible = currentMode === MODES.EDIT
      && editTool === EDIT_TOOL.ADD
      && editAddMode === EDIT_ADD_MODE.MOLECULE
      && moleculePlaceActive
      && !!moleculePlaceTemplateData;
    const rot = getMoleculePlacementEulerDegrees();
    updateAddMoleculeOperatorPanelUi({
      panelEl: editAddMoleculeOperatorPanelEl,
      headerEl: editAddMoleculeOperatorHeaderEl,
      chevronEl: editAddMoleculeOperatorChevronEl,
      labelEl: editAddMoleculeOperatorLabelEl,
      xEl: editAddMoleculeOperatorXEl,
      yEl: editAddMoleculeOperatorYEl,
      zEl: editAddMoleculeOperatorZEl,
      rotXEl: editAddMoleculeOperatorRotXEl,
      rotYEl: editAddMoleculeOperatorRotYEl,
      rotZEl: editAddMoleculeOperatorRotZEl,
      isVisible,
      collapsed: moleculePlaceOperatorCollapsed,
      labelText: `Add Molecule ${String((moleculePlaceTemplateData && moleculePlaceTemplateData.name) || 'Molecule')}`,
      position: moleculePlacePosition,
      rotation: rot,
      positionPanel: positionAddMoleculeOperatorPanel,
    });
  }

  /**
   * Apply one world-space position component typed into the molecule operator.
   * @param {'x'|'y'|'z'} axis
   * @param {HTMLInputElement|null} inputEl
   */
  function applyMoleculePlacementPositionInput(axis, inputEl) {
    if (!moleculePlaceActive || !inputEl) return;
    const nextValue = Number(String(inputEl.value || '').trim());
    if (!Number.isFinite(nextValue)) return;
    if (axis === 'x') moleculePlacePosition.x = nextValue;
    else if (axis === 'y') moleculePlacePosition.y = nextValue;
    else moleculePlacePosition.z = nextValue;
    updateMoleculePlacementPreviewTransform();
  }

  /**
   * Apply one XYZ Euler rotation value typed into the molecule operator.
   * @param {'x'|'y'|'z'} axis
   * @param {HTMLInputElement|null} inputEl
   */
  function applyMoleculePlacementRotationInput(axis, inputEl) {
    if (!moleculePlaceActive || !inputEl) return;
    const nextValue = Number(String(inputEl.value || '').trim());
    if (!Number.isFinite(nextValue)) return;
    const rot = getMoleculePlacementEulerDegrees();
    if (axis === 'x') rot.x = nextValue;
    else if (axis === 'y') rot.y = nextValue;
    else rot.z = nextValue;
    moleculePlaceQuaternion.setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(rot.x),
      THREE.MathUtils.degToRad(rot.y),
      THREE.MathUtils.degToRad(rot.z),
      'XYZ'
    ));
    moleculePlaceQuaternion.normalize();
    updateMoleculePlacementPreviewTransform();
  }

  /**
   * Apply one world-space location to the active add-atom operator session.
   * @param {THREE.Vector3} worldPos
   * @returns {boolean}
   */
  function setAddAtomOperatorWorldPosition(worldPos) {
    return editPlacement.setAddAtomOperatorWorldPosition(worldPos);
  }

  /**
   * Finish or cancel the active add-atom operator session.
   * @param {{commit?:boolean,announce?:boolean}=} options
   * @returns {boolean}
   */
  function finalizeAddAtomOperatorSession(options = {}) {
    return editPlacement.finalizeAddAtomOperatorSession(options);
  }

  /**
   * Apply one coordinate value typed into the add-atom operator panel.
   * @param {'x'|'y'|'z'} axis
   * @param {HTMLInputElement|null} inputEl
   * @param {{syncOnly?:boolean}=} options
   */
  function applyAddAtomOperatorInput(axis, inputEl, options = {}) {
    editPlacement.applyAddAtomOperatorInput(axis, inputEl, options);
  }

  /**
   * Apply one persistent edit-mode atom selection.
   * @param {number[]} indices
   * @returns {boolean}
   */
  function setEditAtomSelection(indices) {
    return editTools.setEditAtomSelection(indices);
  }

  /**
   * Clear the persistent edit-mode atom selection.
   * @returns {boolean}
   */
  function clearEditAtomSelection() {
    return editTools.clearEditAtomSelection();
  }

  /**
   * Select every atom in the active editable file.
   * @returns {boolean}
   */
  function selectAllEditAtoms() {
    return editTools.selectAllEditAtoms();
  }

  /**
   * Apply one click selection in edit mode.
   * @param {number} atomIndex
   * @param {boolean} additive
   * @returns {boolean}
   */
  function applyEditAtomSelectionClick(atomIndex, additive) {
    return editTools.applyEditAtomSelectionClick(atomIndex, additive);
  }

  /**
   * Resolve the currently pending first atom for the Bond tool to one atom index.
   * @param {*} vol
   * @returns {number}
   */
  function getEditBondPendingAtomIndex(vol) {
    return bondEditing ? bondEditing.getPendingAtomIndex(vol) : -1;
  }

  /**
   * Clear the pending first-atom selection used by the Bond tool.
   */
  function clearEditBondPendingSelection() {
    if (bondEditing) bondEditing.clearPendingSelection();
  }

  /**
   * Return the per-record measurement-label offset store.
   * Offsets are stored in angstrom/world units and keyed by atom ids so they
   * survive atom movement and record rebuilds.
   * @param {*|null} record
   * @param {boolean=} create
   * @returns {Record<string, [number, number, number]>}
   */
  function getMeasurementLabelOffsetStore(record, create = false) {
    if (!record || typeof record !== 'object') return {};
    if (!isPlainObject(record.measurementLabelOffsets)) {
      if (!create) return {};
      record.measurementLabelOffsets = {};
    }
    return record.measurementLabelOffsets;
  }

  /**
   * Build one stable atom-id token for measurement-label keys.
   * @param {*} vol
   * @param {number} atomIndex
   * @returns {string}
   */
  function getMeasurementAtomKeyToken(vol, atomIndex) {
    if (!vol || !Array.isArray(vol.atoms)) return '';
    const atom = vol.atoms[atomIndex | 0];
    return atom ? String(ensureAtomId(atom)) : '';
  }

  /**
   * Build one stable key for a distance label.
   * @param {*} vol
   * @param {number} i
   * @param {number} j
   * @returns {string}
   */
  function buildMeasurementDistanceKey(vol, i, j) {
    const a = getMeasurementAtomKeyToken(vol, i);
    const b = getMeasurementAtomKeyToken(vol, j);
    if (!a || !b) return '';
    return a < b ? `distance:${a}:${b}` : `distance:${b}:${a}`;
  }

  /**
   * Build one stable key for an angle label.
   * @param {*} vol
   * @param {number} ia
   * @param {number} ib
   * @param {number} ic
   * @returns {string}
   */
  function buildMeasurementAngleKey(vol, ia, ib, ic) {
    const a = getMeasurementAtomKeyToken(vol, ia);
    const b = getMeasurementAtomKeyToken(vol, ib);
    const c = getMeasurementAtomKeyToken(vol, ic);
    if (!a || !b || !c) return '';
    return a < c ? `angle:${a}:${b}:${c}` : `angle:${c}:${b}:${a}`;
  }

  /**
   * Build one stable key for a dihedral label.
   * @param {*} vol
   * @param {number} i
   * @param {number} j
   * @param {number} k
   * @param {number} l
   * @returns {string}
   */
  function buildMeasurementDihedralKey(vol, i, j, k, l) {
    const a = getMeasurementAtomKeyToken(vol, i);
    const b = getMeasurementAtomKeyToken(vol, j);
    const c = getMeasurementAtomKeyToken(vol, k);
    const d = getMeasurementAtomKeyToken(vol, l);
    if (!a || !b || !c || !d) return '';
    return `dihedral:${a}:${b}:${c}:${d}`;
  }

  /**
   * Read one measurement-label world offset.
   * @param {*|null} record
   * @param {string} key
   * @returns {THREE.Vector3}
   */
  function getMeasurementLabelOffset(record, key) {
    const raw = getMeasurementLabelOffsetStore(record, false)[String(key || '')];
    if (!Array.isArray(raw) || raw.length < 3) return new THREE.Vector3();
    return new THREE.Vector3(
      Number(raw[0]) || 0,
      Number(raw[1]) || 0,
      Number(raw[2]) || 0
    );
  }

  /**
   * Persist one measurement-label world offset.
   * @param {*|null} record
   * @param {string} key
   * @param {THREE.Vector3} offset
   */
  function setMeasurementLabelOffset(record, key, offset) {
    if (!record || !key || !offset || !offset.isVector3) return;
    const store = getMeasurementLabelOffsetStore(record, true);
    if (offset.lengthSq() <= 1e-12) {
      delete store[key];
      return;
    }
    store[key] = [
      Number(offset.x) || 0,
      Number(offset.y) || 0,
      Number(offset.z) || 0,
    ];
  }

  /**
   * Update the measurement-label cursor affordance.
   */
  function syncMeasurementLabelCursor() {
    if (!canvasEl) return;
    if (measurementLabelDragState) {
      canvasEl.style.cursor = 'grabbing';
      return;
    }
    if (currentMode === MODES.MEASURE && measurementLabelHoverSprite) {
      canvasEl.style.cursor = 'grab';
      return;
    }
    canvasEl.style.cursor = '';
  }

  /**
   * Apply or clear hover styling on one measurement label sprite.
   * @param {THREE.Sprite|null} sprite
   * @param {boolean} hovered
   */
  function setMeasurementLabelVisualState(sprite, hovered) {
    if (!sprite || !sprite.isSprite || !sprite.userData || !sprite.userData.measurementLabel) return;
    const data = sprite.userData.measurementLabel;
    const baseOptions = Object.assign({}, data.textOptions || {});
    const nextOptions = hovered
      ? Object.assign({}, baseOptions, { bgColor: UI_PALETTE.measurementLabelBgHover })
      : baseOptions;
    applyTextSpriteTexture(sprite, data.text, nextOptions);
    sprite.userData.measurementLabel.hovered = !!hovered;
  }

  /**
   * Set the currently hovered measurement label.
   * @param {THREE.Sprite|null} sprite
   */
  function setMeasurementLabelHover(sprite) {
    if (measurementLabelHoverSprite === sprite) return;
    if (measurementLabelHoverSprite) setMeasurementLabelVisualState(measurementLabelHoverSprite, false);
    measurementLabelHoverSprite = null;
    measurementLabelHoverKey = '';
    if (sprite && sprite.userData && sprite.userData.measurementLabel) {
      measurementLabelHoverSprite = sprite;
      measurementLabelHoverKey = String(sprite.userData.measurementLabel.key || '');
      setMeasurementLabelVisualState(sprite, true);
    }
    syncMeasurementLabelCursor();
  }

  /**
   * Clear measurement-label hover styling.
   */
  function clearMeasurementLabelHover() {
    setMeasurementLabelHover(null);
  }

  /**
   * Cancel an active measurement-label drag gesture.
   */
  function cancelMeasurementLabelDrag() {
    if (measurementLabelDragState && Number.isInteger(measurementLabelDragState.pointerId)) {
      try { canvasEl.releasePointerCapture(measurementLabelDragState.pointerId); } catch { }
    }
    measurementLabelDragState = null;
    syncMeasurementLabelCursor();
  }

  /**
   * Clear measurement selections when the active file/context changes.
   */
  function clearMeasurementSelectionForContextChange() {
    cancelMeasurementLabelDrag();
    clearMeasurementLabelHover();
    if (!editSel.length) {
      updateEditSelectionVisuals();
      updateSelectedHalos();
      return;
    }
    clearEditSelection();
  }

  /**
   * Clear short-lived interaction state that should not survive a file/context change.
   * This intentionally does not touch durable record data.
   * @param {{hover?:boolean,measurement?:boolean,selection?:boolean,addPreview?:boolean,moleculePlacement?:boolean,fusePreview?:boolean,transform?:boolean,pointerState?:boolean}=} options
   */
  function clearTransientInteractionState(options = {}) {
    editTools.clearTransientInteractionState(options);
  }

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
   * Dispose geometry/material resources for one overlay subtree.
   * @param {THREE.Object3D|null} root
   */
  function disposeOverlayTree(root) {
    if (!root || typeof root.traverse !== 'function') return;
    root.traverse((obj) => {
      if (!obj || obj === root) return;
      try { obj.geometry && obj.geometry.dispose && obj.geometry.dispose(); } catch { }
      try {
        if (Array.isArray(obj.material)) {
          for (const mat of obj.material) {
            try { mat && mat.dispose && mat.dispose(); } catch { }
          }
        } else {
          obj.material && obj.material.dispose && obj.material.dispose();
        }
      } catch { }
    });
  }

  /**
   * Build one local-space overlay clone for a bond carrier object.
   * Root overlays attach as children of the carrier, so the root transform stays identity.
   * @param {*} carrier
   * @param {number} color
   * @param {number} opacity
   * @param {number} radialScale
   * @returns {THREE.Object3D|null}
   */
  function buildBondOverlayClone(carrier, color, opacity, radialScale = 1.12) {
    const skipTypes = new Set(['bondOutline', 'bondHighlight']);
    /**
     * Clone one mesh for overlay use.
     * @param {*} mesh
     * @param {boolean} isRoot
     * @returns {THREE.Mesh|null}
     */
    const cloneOverlayMesh = (mesh, isRoot = false) => {
      if (!mesh || !mesh.isMesh || !mesh.geometry) return null;
      if (mesh.userData && skipTypes.has(mesh.userData.type)) return null;
      const overlayMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        depthTest: true,
      });
      const overlay = new THREE.Mesh(mesh.geometry.clone(), overlayMat);
      if (!isRoot) {
        overlay.position.copy(mesh.position);
        overlay.quaternion.copy(mesh.quaternion);
        overlay.scale.copy(mesh.scale);
        overlay.visible = mesh.visible !== false;
      }
      overlay.renderOrder = (mesh.renderOrder || 0) + 2;
      overlay.scale.set(
        overlay.scale.x * radialScale,
        overlay.scale.y,
        overlay.scale.z * radialScale
      );
      return overlay;
    };

    /**
     * Clone one object subtree into overlay geometry.
     * @param {*} node
     * @param {boolean} isRoot
     * @returns {THREE.Object3D|null}
     */
    const cloneNode = (node, isRoot = false) => {
      if (!node) return null;
      if (node.isMesh) return cloneOverlayMesh(node, isRoot);
      const group = new THREE.Group();
      if (!isRoot) {
        group.position.copy(node.position);
        group.quaternion.copy(node.quaternion);
        group.scale.copy(node.scale);
        group.visible = node.visible !== false;
      }
      for (const child of (node.children || [])) {
        const cloned = cloneNode(child, false);
        if (cloned) group.add(cloned);
      }
      return group.children.length ? group : null;
    };

    return cloneNode(carrier, true);
  }

  /**
   * Attach one hover/select overlay to a bond carrier.
   * @param {*} carrier
   * @param {'hoverOverlay'|'selectOverlay'} key
   * @param {number} color
   * @param {number} opacity
   * @returns {THREE.Object3D|null}
   */
  function ensureBondOverlay(carrier, key, color, opacity) {
    if (!carrier || !carrier.userData) return null;
    if (carrier.userData[key]) return carrier.userData[key];
    const overlay = buildBondOverlayClone(carrier, color, opacity);
    if (!overlay) return null;
    overlay.userData = { type: key };
    carrier.add(overlay);
    carrier.userData[key] = overlay;
    return overlay;
  }

  /**
   * Remove one hover/select overlay from a bond carrier.
   * @param {*} carrier
   * @param {'hoverOverlay'|'selectOverlay'} key
   */
  function removeBondOverlay(carrier, key) {
    if (!carrier || !carrier.userData || !carrier.userData[key]) return;
    const overlay = carrier.userData[key];
    carrier.userData[key] = null;
    try {
      carrier.remove(overlay);
      disposeOverlayTree(overlay);
    } catch { }
  }

  /**
   * Return the currently persistent transform-selection indices.
   * @returns {number[]}
   */
  function getActiveTransformSelectionIndices() {
    if (transformActive && Array.isArray(transformTargetIndices) && transformTargetIndices.length) {
      return transformTargetIndices.slice();
    }
    return Array.isArray(transformSelectionIndices) ? transformSelectionIndices.slice() : [];
  }

  /**
   * Check whether every atom in one target set is already inside the active transform selection.
   * @param {number[]} indices
   * @returns {boolean}
   */
  function isTransformTargetInsideSelection(indices) {
    const selected = new Set(getActiveTransformSelectionIndices());
    const test = Array.isArray(indices) ? indices : [];
    if (!selected.size || !test.length) return false;
    for (const idx of test) {
      if (!selected.has(idx | 0)) return false;
    }
    return true;
  }

  /**
   * Return the current bond-derived transform selection context, if any.
   * Active drag context wins over persistent selection context.
   * @returns {{type:'bond',selectedAtomIndex:number,anchorAtomIndex:number,bondIndices:[number,number]}|null}
   */
  function getCurrentTransformSelectionContext() {
    if (transformActive && transformBondContext && transformBondContext.type === 'bond') return transformBondContext;
    if (transformSelectionContext && transformSelectionContext.type === 'bond') return transformSelectionContext;
    return null;
  }

  /**
   * Apply one persistent transform selection.
   * @param {number[]} indices
   * @param {'fragment'|'molecule'|'all'} kind
   * @param {{type:'bond',selectedAtomIndex:number,anchorAtomIndex:number,bondIndices:[number,number]}|null=} context
   */
  function setTransformSelection(indices, kind = 'fragment', context = null) {
    const unique = Array.from(new Set((Array.isArray(indices) ? indices : []).filter((idx) => Number.isInteger(idx) && idx >= 0))).sort((a, b) => a - b);
    transformSelectionIndices = unique;
    transformSelectionKind = kind === 'all' ? 'all' : (kind === 'molecule' ? 'molecule' : 'fragment');
    transformSelectionContext = (context && context.type === 'bond')
      ? {
          type: 'bond',
          selectedAtomIndex: context.selectedAtomIndex | 0,
          anchorAtomIndex: context.anchorAtomIndex | 0,
          bondIndices: Array.isArray(context.bondIndices) ? [context.bondIndices[0] | 0, context.bondIndices[1] | 0] : [0, 0],
        }
      : null;
    updateSelectedHalos();
    updateTransformBondSelectionHalos();
    updateTransformSelectionGuides();
    updateEditToolboxUi({ syncSearch: false });
  }

  /**
   * Clear persistent transform selection/highlight state.
   */
  function clearTransformSelection() {
    transformSelectionIndices = [];
    transformSelectionKind = 'fragment';
    transformSelectionContext = null;
    transformPendingSelectionTarget = null;
    updateSelectedHalos();
    updateTransformBondSelectionHalos();
    updateTransformSelectionGuides();
    updateEditToolboxUi({ syncSearch: false });
  }

  /**
   * Update persistent bond highlight state for the active transform selection.
   */
  function updateTransformBondSelectionHalos() {
    if (!bondGroup || !bondGroup.children) return;
    const focusContext = (currentMode === MODES.EDIT && editTool === EDIT_TOOL.TRANSFORM)
      ? getCurrentTransformSelectionContext()
      : null;
    const focusI = focusContext && Array.isArray(focusContext.bondIndices) ? (focusContext.bondIndices[0] | 0) : -1;
    const focusJ = focusContext && Array.isArray(focusContext.bondIndices) ? (focusContext.bondIndices[1] | 0) : -1;
    const selected = new Set(
      currentMode === MODES.EDIT && editTool === EDIT_TOOL.TRANSFORM
        ? getActiveTransformSelectionIndices()
        : []
    );
    for (const carrier of bondGroup.children) {
      if (!carrier || !carrier.userData) continue;
      const i = carrier.userData.i | 0;
      const j = carrier.userData.j | 0;
      if (!Number.isInteger(i) || !Number.isInteger(j)) {
        removeBondOverlay(carrier, 'selectOverlay');
        removeBondOverlay(carrier, 'focusOverlay');
        continue;
      }
      if (selected.has(i) && selected.has(j)) ensureBondOverlay(carrier, 'selectOverlay', selHaloColor, 0.72);
      else removeBondOverlay(carrier, 'selectOverlay');
      if ((i === focusI && j === focusJ) || (i === focusJ && j === focusI)) ensureBondOverlay(carrier, 'focusOverlay', 0xff4d4f, 0.96);
      else removeBondOverlay(carrier, 'focusOverlay');
    }
  }

  /**
   * Build one small transform guide sphere.
   * @param {THREE.Vector3} position
   * @param {number} radius
   * @param {number} color
   * @param {number=} opacity
   */
  function addTransformGuideSphere(position, radius, color, opacity = 0.95) {
    if (!position || !position.isVector3 || !Number.isFinite(radius) || radius <= 0) return;
    const geom = new THREE.SphereGeometry(radius, 20, 14);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(position);
    mesh.renderOrder = 9500;
    transformGuideGroup.add(mesh);
  }

  /**
   * Build one transform guide line.
   * @param {THREE.Vector3} start
   * @param {THREE.Vector3} end
   * @param {number} color
   * @param {number=} opacity
   */
  function addTransformGuideLine(start, end, color, opacity = 0.95) {
    if (!start || !start.isVector3 || !end || !end.isVector3) return;
    if (start.distanceToSquared(end) <= 1e-12) return;
    const geom = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthWrite: false,
    });
    const line = new THREE.Line(geom, mat);
    line.renderOrder = 9495;
    transformGuideGroup.add(line);
  }

  /**
   * Refresh transform pivot/axis guide visuals for the active selection.
   */
  function updateTransformSelectionGuides() {
    clearGroup(transformGuideGroup);
    if (currentMode !== MODES.EDIT || editTool !== EDIT_TOOL.TRANSFORM) return;
    const record = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null;
    const vol = record && record.vol;
    const selectedIndices = getActiveTransformSelectionIndices();
    if (!vol || !Array.isArray(vol.atoms) || !selectedIndices.length) return;

    const guideContext = getCurrentTransformSelectionContext();
    const activeRotateAxis = transformActive && transformRotateAxis && transformRotateAxis.isVector3
      ? transformRotateAxis.clone()
      : null;

    let pivot = null;
    if (transformActive && transformPivotWorld && transformPivotWorld.isVector3) {
      pivot = transformPivotWorld.clone();
    } else if (guideContext) {
      if (editTransformMode === EDIT_TRANSFORM_MODE.ROTATE_FRAGMENT && vol.atoms[guideContext.selectedAtomIndex]) {
        pivot = atomUnitsToAng(vol, vol.atoms[guideContext.selectedAtomIndex]);
      } else if (editTransformMode === EDIT_TRANSFORM_MODE.ROTATE_BOND && vol.atoms[guideContext.anchorAtomIndex]) {
        pivot = atomUnitsToAng(vol, vol.atoms[guideContext.anchorAtomIndex]);
      }
    }
    if (!pivot) pivot = getTransformPivotWorld(vol, selectedIndices);

    let avgRadius = 0;
    let count = 0;
    for (const idx of selectedIndices) {
      const atom = vol.atoms[idx];
      if (!atom) continue;
      avgRadius += getRenderedAtomDisplayRadius(atom.Z | 0);
      count += 1;
    }
    avgRadius = count ? (avgRadius / count) : 0.35;
    const pivotRadius = Math.max(0.05, avgRadius * 0.18);
    addTransformGuideSphere(pivot, pivotRadius, selHaloColor, 0.95);

    if (guideContext && Array.isArray(guideContext.bondIndices)) {
      const i = guideContext.bondIndices[0] | 0;
      const j = guideContext.bondIndices[1] | 0;
      if (vol.atoms[i] && vol.atoms[j]) {
        const posI = atomUnitsToAng(vol, vol.atoms[i]);
        const posJ = atomUnitsToAng(vol, vol.atoms[j]);
        addTransformGuideLine(posI, posJ, 0xffffff, 0.96);
        const axis = atomUnitsToAng(vol, vol.atoms[guideContext.selectedAtomIndex])
          .sub(atomUnitsToAng(vol, vol.atoms[guideContext.anchorAtomIndex]));
        if (axis.lengthSq() > 1e-12) {
          axis.normalize();
          const axisLength = Math.max(posI.distanceTo(posJ) + avgRadius * 1.8, avgRadius * 2.4);
          const start = pivot.clone().addScaledVector(axis, -axisLength * 0.5);
          const end = pivot.clone().addScaledVector(axis, axisLength * 0.5);
          addTransformGuideLine(start, end, selHaloColor, 0.9);
        }
      }
      return;
    }

    if (activeRotateAxis && activeRotateAxis.lengthSq() > 1e-12) {
      activeRotateAxis.normalize();
      const axisLength = Math.max(avgRadius * 2.4, 1.2);
      const start = pivot.clone().addScaledVector(activeRotateAxis, -axisLength * 0.5);
      const end = pivot.clone().addScaledVector(activeRotateAxis, axisLength * 0.5);
      addTransformGuideLine(start, end, selHaloColor, 0.9);
    }
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
   * Render one canvas-backed texture for a text sprite.
   * @param {string} txt
   * @param {{uiScale?:number,bgColor?:string,textColor?:string}=} options
   * @returns {{texture:THREE.CanvasTexture,width:number,height:number,uiScale:number,bgColor:string,textColor:string}}
   */
  function createTextSpriteTexture(txt, options = {}) {
    const uiScale = Math.max(0.6, Math.min(1.5, Number(options.uiScale) || 1));
    const bgColor = (typeof options.bgColor === 'string' && options.bgColor.trim()) || UI_PALETTE.measurementLabelBg;
    const textColor = (typeof options.textColor === 'string' && options.textColor.trim()) || UI_PALETTE.measurementLabelText;
    // make a rounded rectangle canvas with text, then make a sprite from it
    const hpad = Math.max(4, Math.round(6 * uiScale));
    const wpad = Math.max(5, Math.round(8 * uiScale));
    const radius = Math.max(10, Math.round(16 * uiScale)); // px rounded corner radius (pre-scale)
    // make the font bold
    const fontPx = Math.max(14, Math.round(20 * uiScale));
    const font = `bold ${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif`;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    ctx.font = font;
    const textW = Math.ceil(ctx.measureText(txt).width);
    const w = textW + wpad * 2;
    const h = Math.max(fontPx + hpad * 2, Math.round(18 * uiScale) + hpad * 2);
    // hi-DPI backing store
    c.width = w * 2; c.height = h * 2;
    ctx.scale(2, 2);
    ctx.font = font;

    // rounded rectangle background
    const rr = Math.min(radius, w / 2, h / 2);
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.moveTo(rr, 0);
    ctx.arcTo(w, 0, w, h, rr);
    ctx.arcTo(w, h, 0, h, rr);
    ctx.arcTo(0, h, 0, 0, rr);
    ctx.arcTo(0, 0, w, 0, rr);
    ctx.closePath();
    ctx.fill();

    // text
    ctx.fillStyle = textColor;
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, wpad, h / 2);

    const texture = new THREE.CanvasTexture(c);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return { texture, width: w, height: h, uiScale, bgColor, textColor };
  }

  /**
   * Apply new text/appearance data to one existing text sprite.
   * @param {THREE.Sprite} sprite
   * @param {string} txt
   * @param {{uiScale?:number,bgColor?:string,textColor?:string}=} options
   */
  function applyTextSpriteTexture(sprite, txt, options = {}) {
    if (!sprite || !sprite.isSprite || !sprite.material) return;
    const data = createTextSpriteTexture(txt, options);
    if (sprite.material.map && sprite.material.map !== data.texture) {
      try { sprite.material.map.dispose && sprite.material.map.dispose(); } catch { }
    }
    sprite.material.map = data.texture;
    sprite.material.needsUpdate = true;
    const scale = 0.008; // tune label size relative to pixels
    sprite.scale.set(data.width * scale, data.height * scale, 1);
    if (!sprite.userData) sprite.userData = {};
    sprite.userData.textSpriteState = {
      text: txt,
      options: {
        uiScale: data.uiScale,
        bgColor: data.bgColor,
        textColor: data.textColor,
      },
    };
  }

  /**
   * Create a screen-facing text sprite used for measurements/labels.
   * @param {string} txt
   * @param {{uiScale?:number,bgColor?:string,textColor?:string}=} options
   * @returns {THREE.Sprite}
   */
  function makeTextSprite(txt, options = {}) {
    const mat = new THREE.SpriteMaterial({ depthTest: false, depthWrite: false, transparent: true });
    const spr = new THREE.Sprite(mat);
    applyTextSpriteTexture(spr, txt, options);
    return spr;
  }

  /**
   * Create one draggable measurement-label sprite.
   * @param {string} txt
   * @param {string} key
   * @param {THREE.Vector3} basePosition
   * @param {{uiScale?:number}=} options
   * @returns {THREE.Sprite}
   */
  function makeMeasurementLabelSprite(txt, key, basePosition, options = {}) {
    const sprite = makeTextSprite(txt, {
      uiScale: Number(options.uiScale) || 0.9,
      bgColor: UI_PALETTE.measurementLabelBg,
      textColor: UI_PALETTE.measurementLabelText,
    });
    const record = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null;
    const offset = getMeasurementLabelOffset(record, key);
    sprite.position.copy(basePosition).add(offset);
    sprite.renderOrder = 125;
    sprite.userData = Object.assign({}, sprite.userData || {}, {
      measurementLabel: {
        key: String(key || ''),
        text: String(txt || ''),
        basePosition: basePosition.clone(),
        textOptions: {
          uiScale: Number(options.uiScale) || 0.9,
          bgColor: UI_PALETTE.measurementLabelBg,
          textColor: UI_PALETTE.measurementLabelText,
        },
        hovered: false,
      },
    });
    if (measurementLabelHoverKey && measurementLabelHoverKey === key) {
      measurementLabelHoverSprite = sprite;
      setMeasurementLabelVisualState(sprite, true);
    }
    return sprite;
  }
  /**
   * Render distance, angle, and dihedral overlays for the current selection.
   */
  function updateEditSelectionVisuals() {
    measurementLabelHoverSprite = null;
    clearGroup(editSelGroup);
    // Only render measurement overlays in measurement mode
    if (currentMode !== MODES.MEASURE || !atomGroup || !atomGroup.children || atomGroup.children.length === 0) return;
    const record = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null;
    const vol = record && record.vol;
    if (!vol || !Array.isArray(vol.atoms)) return;
    ensureVolumeAtomIds(vol);
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
      const labelKey = buildMeasurementDistanceKey(vol, i, j);
      const label = makeMeasurementLabelSprite(fmtDist(dist), labelKey, mid, { uiScale: 0.9 });
      label.position.copy(mid);
      // slight lift towards camera to avoid z-fighting
      const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
      const basePosition = mid.clone().add(camDir.multiplyScalar(0.01));
      label.position.copy(basePosition).add(getMeasurementLabelOffset(record, labelKey));
      if (label.userData && label.userData.measurementLabel) label.userData.measurementLabel.basePosition.copy(basePosition);
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
      const basePosition = pb.clone().add(midDir.multiplyScalar(radius + 0.06));
      const labelKey = buildMeasurementAngleKey(vol, ia, ib, ic);
      const label = makeMeasurementLabelSprite(fmtDeg(theta), labelKey, basePosition, { uiScale: 0.9 });
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
            const basePosition = mid.clone().add(midDir.multiplyScalar(radius + 0.08));
            const labelKey = buildMeasurementDihedralKey(vol, i, j, k, l);
            const label = makeMeasurementLabelSprite(fmtDeg(Math.abs(phi)), labelKey, basePosition, { uiScale: 0.9 });
            editSelGroup.add(label);
          }
        }
      }
    }
    syncMeasurementLabelCursor();
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
   * Raycast and return the first draggable measurement label under the pointer.
   * @param {PointerEvent} e
   * @returns {THREE.Intersection|null}
   */
  function pickMeasurementLabelHit(e) {
    if (currentMode !== MODES.MEASURE || !editSelGroup || !editSelGroup.children || !editSelGroup.children.length) return null;
    setRaycasterFromEvent(e);
    const hits = raycaster.intersectObjects(editSelGroup.children, true);
    for (const hit of hits) {
      const obj = hit && hit.object;
      if (obj && obj.isSprite && obj.userData && obj.userData.measurementLabel) return hit;
    }
    return null;
  }

  /**
   * Start dragging one measurement label in a camera-facing plane.
   * @param {PointerEvent} e
   * @param {THREE.Intersection} hit
   * @returns {boolean}
   */
  function beginMeasurementLabelDrag(e, hit) {
    const sprite = hit && hit.object;
    const record = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null;
    const labelData = sprite && sprite.userData && sprite.userData.measurementLabel;
    if (!record || !sprite || !sprite.isSprite || !labelData || !labelData.basePosition || !labelData.basePosition.isVector3) return false;
    const key = String(labelData.key || '');
    if (!key) return false;
    setMeasurementLabelHover(sprite);
    setRaycasterFromEvent(e);
    const cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);
    if (cameraDir.lengthSq() < 1e-10) cameraDir.set(0, 0, -1);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(cameraDir.normalize(), sprite.position.clone());
    const planePoint = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, planePoint)) return false;
    measurementLabelDragState = {
      pointerId: Number.isInteger(e.pointerId) ? e.pointerId : null,
      sprite,
      key,
      record,
      plane,
      startPlanePoint: planePoint.clone(),
      initialOffset: getMeasurementLabelOffset(record, key),
    };
    try { canvasEl.setPointerCapture(e.pointerId); } catch { }
    __editMoved = false;
    syncMeasurementLabelCursor();
    return true;
  }

  /**
   * Update one active measurement-label drag gesture.
   * @param {PointerEvent} e
   */
  function updateMeasurementLabelDragFromEvent(e) {
    if (!measurementLabelDragState) return;
    const { plane, startPlanePoint, initialOffset, record, key, sprite } = measurementLabelDragState;
    if (!plane || !startPlanePoint || !sprite) return;
    setRaycasterFromEvent(e);
    const planeHit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, planeHit)) return;
    const labelData = sprite.userData && sprite.userData.measurementLabel;
    if (!labelData || !labelData.basePosition || !labelData.basePosition.isVector3) return;
    const nextOffset = initialOffset.clone().add(planeHit.sub(startPlanePoint));
    setMeasurementLabelOffset(record, key, nextOffset);
    sprite.position.copy(labelData.basePosition).add(nextOffset);
    __editMoved = true;
  }

  /**
   * Finalize one measurement-label drag gesture.
   * @param {PointerEvent=} e
   */
  function finalizeMeasurementLabelDrag(e) {
    if (!measurementLabelDragState) return false;
    const pointerId = measurementLabelDragState.pointerId;
    if (Number.isInteger(pointerId)) {
      try { canvasEl.releasePointerCapture(pointerId); } catch { }
    }
    measurementLabelDragState = null;
    if (e) {
      const hit = pickMeasurementLabelHit(e);
      setMeasurementLabelHover(hit && hit.object ? hit.object : null);
    } else {
      syncMeasurementLabelCursor();
    }
    return true;
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
   * Update hover highlighting for the currently pointed bond carrier.
   * @param {*|null} carrier
   */
  function setBondHover(carrier) {
    if (hoverBondObject === carrier) return;
    if (hoverBondObject) removeBondOverlay(hoverBondObject, 'hoverOverlay');
    hoverBondObject = null;
    if (carrier && carrier.userData) {
      const hoverColor = (editMode && (editTool === EDIT_TOOL.DELETE || (editTool === EDIT_TOOL.BOND && editBondAction === EDIT_BOND_ACTION.DELETE)))
        ? 0xff4b4b
        : 0x00a5ff;
      ensureBondOverlay(carrier, 'hoverOverlay', hoverColor, 0.82);
      hoverBondObject = carrier;
    }
  }

  /**
   * Read the effective displayed order for one bond carrier.
   * Prefers explicit bond state and falls back to the rendered carrier order.
   * @param {*|null} carrier
   * @returns {number}
   */
  function getBondCarrierDisplayedOrder(carrier) {
    if (!carrier || !carrier.userData) return 1;
    const record = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null;
    const vol = record && record.vol;
    const i = carrier.userData.i | 0;
    const j = carrier.userData.j | 0;
    if (vol && Array.isArray(vol.atoms) && i >= 0 && j >= 0 && i < vol.atoms.length && j < vol.atoms.length && i !== j) {
      const atomA = vol.atoms[i];
      const atomB = vol.atoms[j];
      const explicitIndex = findVolumeBondRecordIndex(vol, ensureAtomId(atomA), ensureAtomId(atomB));
      if (explicitIndex >= 0) {
        const explicitBond = normalizeVolumeBondRecord(vol, vol.bonds[explicitIndex]);
        if (explicitBond) return normalizeEditAddBondOrder(explicitBond.order || 1);
      }
    }
    return normalizeEditAddBondOrder(carrier.userData.bondOrder || 1);
  }

  /**
   * Update hover highlighting for the currently pointed surface mesh.
   * @param {THREE.Mesh|null} mesh
   */
  function setSurfaceHover(mesh) {
    if (hoverSurfaceMesh === mesh) return;
    if (hoverSurfaceMesh && hoverSurfaceMesh.userData && hoverSurfaceMesh.userData.surfaceHoverMaterialState) {
      const prevMat = hoverSurfaceMesh.material;
      const prevState = hoverSurfaceMesh.userData.surfaceHoverMaterialState;
      if (prevMat && prevState) {
        if (prevMat.color && prevState.color) prevMat.color.copy(prevState.color);
        if (prevMat.emissive && prevState.emissive) prevMat.emissive.copy(prevState.emissive);
        if ('emissiveIntensity' in prevMat && Number.isFinite(prevState.emissiveIntensity)) prevMat.emissiveIntensity = prevState.emissiveIntensity;
        if ('opacity' in prevMat && Number.isFinite(prevState.opacity)) prevMat.opacity = prevState.opacity;
        prevMat.needsUpdate = true;
      }
      hoverSurfaceMesh.userData.surfaceHoverMaterialState = null;
    }
    hoverSurfaceMesh = null;
    if (!mesh || !mesh.isMesh || !mesh.geometry) return;
    const mat = mesh.material;
    if (!mat) return;
    if (!mesh.userData) mesh.userData = {};
    mesh.userData.surfaceHoverMaterialState = {
      color: mat.color && mat.color.clone ? mat.color.clone() : null,
      emissive: mat.emissive && mat.emissive.clone ? mat.emissive.clone() : null,
      emissiveIntensity: Number.isFinite(mat.emissiveIntensity) ? mat.emissiveIntensity : null,
      opacity: Number.isFinite(mat.opacity) ? mat.opacity : null,
    };
    const hoverCol = new THREE.Color(0x00a5ff);
    if (mat.color) mat.color.lerp(hoverCol, 0.28);
    if (mat.emissive) {
      mat.emissive.copy(hoverCol);
      if ('emissiveIntensity' in mat) mat.emissiveIntensity = Math.max(Number(mat.emissiveIntensity) || 0, 0.95);
    } else if (mat.color) {
      mat.color.lerp(hoverCol, 0.18);
    }
    if ('opacity' in mat && Number.isFinite(mat.opacity)) mat.opacity = Math.min(1, Math.max(mat.opacity, 0.88));
    mat.needsUpdate = true;
    hoverSurfaceMesh = mesh;
  }

  /**
   * Clear hover highlight state.
   */
  function clearHover() {
    clearMeasurementLabelHover();
    setHover(null);
    setBondHover(null);
    setSurfaceHover(null);
    hideSurfaceHoverLabel();
  }

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
  loadExternalFragmentLibrary();

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
   * Walk up one object chain until a bond userData payload is found.
   * @param {*} object
   * @returns {*|null}
   */
  function getBondCarrierObject(object) {
    let cur = object || null;
    while (cur) {
      if (cur.userData && Number.isInteger(cur.userData.i) && Number.isInteger(cur.userData.j)) return cur;
      cur = cur.parent || null;
    }
    return null;
  }

  /**
   * Raycast and return the first bond hit, including wrapped groups/meshes.
   * @param {PointerEvent} e
   * @returns {{object:*,point:THREE.Vector3,distance:number}|null}
   */
  function pickBondHit(e) {
    if (!bondGroup || !bondGroup.children || bondGroup.children.length === 0) return null;
    setRaycasterFromEvent(e);
    const hits = raycaster.intersectObjects(bondGroup.children, true);
    for (const hit of hits) {
      const carrier = getBondCarrierObject(hit && hit.object);
      if (!carrier) continue;
      return {
        object: carrier,
        point: hit.point ? hit.point.clone() : null,
        distance: Number(hit.distance) || 0,
      };
    }
    return null;
  }

  /**
   * Place a new atom into the active file at one world-space coordinate.
   * @param {THREE.Vector3} worldPos
   * @returns {boolean}
   */
  function appendAtomAtWorld(worldPos) {
    const z = editAddElementZ | 0;
    if (!z || !ATOM_Z_TO_DATA || !ATOM_Z_TO_DATA[z]) return false;
    return editPlacement.appendAtomAtWorld(worldPos, z);
  }

  /**
   * Record one fragment builder operation on a volume and keep preset extension
   * storage synchronized for export/reload.
   * @param {*} record
   * @param {object} entry
   */
  function recordFragmentOperation(record, entry) {
    editPlacement.recordFragmentOperation(record, entry);
  }

  /**
   * Reapply local cleanup to the most recent live non-fused fragment insertion.
   * @returns {boolean}
   */
  function applyCleanupToLatestFragmentOperation() {
    return editPlacement.applyCleanupToLatestFragmentOperation();
  }

  /**
   * Insert the selected fragment onto one anchor atom.
   * Default attachment policy is replace-H-first, else append.
   * @param {number} anchorIndex
   * @param {THREE.Vector3} worldPos
   * @returns {boolean}
   */
  function appendFragmentAtWorld(anchorIndex, worldPos) {
    return editPlacement.appendFragmentAtWorld(anchorIndex, worldPos);
  }

  /**
   * Delete one atom by index from the active volume and rebuild scene.
   * @param {number} atomIndex
   * @returns {boolean}
   */
  function deleteAtomAtIndex(atomIndex) {
    return editPlacement.deleteAtomAtIndex(atomIndex);
  }

  /**
   * Delete the currently hovered atom in edit mode.
   * @returns {boolean}
   */
  function deleteHoveredAtom() {
    return editPlacement.deleteHoveredAtom();
  }

  /**
   * Compute mass-weighted center (native units) for one molecule.
   * @param {*} vol
   * @returns {{totalMass:number,comX:number,comY:number,comZ:number}|null}
   */
  function computeMassProperties(vol) {
    return computeMassPropertiesFromAtoms(vol && vol.atoms, getAtomicMass);
  }

  /**
   * Finalize one atom-coordinate edit action with undo snapshot + scene/UI refresh.
   * @param {*} record
   * @param {*} vol
   * @param {Array<object>} beforeAtoms
   * @param {string} actionLabel
   */
  function finalizeAtomCoordinateEdit(record, vol, beforeAtoms, actionLabel, beforeBonds = null) {
    vol.natoms = vol.atoms.length;
    const afterAtoms = cloneAtomsSnapshot(vol);
    const historyOptions = Array.isArray(beforeBonds)
      ? { beforeBonds, afterBonds: cloneBondSnapshot(vol) }
      : undefined;
    pushEditHistoryEntry(record, beforeAtoms, afterAtoms, actionLabel, historyOptions);

    clearAddGrowPreview();
    clearHover();
    if (currentMode === MODES.MEASURE) {
      clearEditSelection();
      updateSelectedHalos();
      updateEditSelectionVisuals();
    }
    rebuildScene({ preserveView: true });
    updateSidePanel();
  }

  /**
   * Finalize one coordinate edit action (atoms + optional volumetric transform) with undo snapshot.
   * @param {*} record
   * @param {*} vol
   * @param {{atoms:Array<object>,grid:{origin:number[],axes:number[][]}|null}} beforeSnapshot
   * @param {string} actionLabel
   */
  function finalizeCoordinateSnapshotEdit(record, vol, beforeSnapshot, actionLabel) {
    vol.natoms = vol.atoms.length;
    const afterSnapshot = cloneCoordinateSnapshot(vol);
    pushCoordinateSnapshotHistoryEntry(record, beforeSnapshot, afterSnapshot, actionLabel);

    clearAddGrowPreview();
    clearHover();
    if (currentMode === MODES.MEASURE) {
      clearEditSelection();
      updateSelectedHalos();
      updateEditSelectionVisuals();
    }
    rebuildScene({ preserveView: true });
    updateSidePanel();
  }

  /**
   * Apply one basis transform (rows = target basis vectors) to one Cartesian vector.
   * @param {THREE.Vector3} ex
   * @param {THREE.Vector3} ey
   * @param {THREE.Vector3} ez
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {[number, number, number]}
   */
  function applyBasisRowsToVector(ex, ey, ez, x, y, z) {
    return [
      ex.x * x + ex.y * y + ex.z * z,
      ey.x * x + ey.y * y + ey.z * z,
      ez.x * x + ez.y * y + ez.z * z,
    ];
  }

  /**
   * Translate one volumetric grid origin by one Cartesian delta in native units.
   * @param {*} vol
   * @param {number} dx
   * @param {number} dy
   * @param {number} dz
   */
  function translateVolumetricGrid(vol, dx, dy, dz) {
    if (!hasVolumetricGrid(vol)) return;
    const origin = Array.isArray(vol.origin) ? vol.origin : [0, 0, 0];
    vol.origin = [
      (Number(origin[0]) || 0) + (Number(dx) || 0),
      (Number(origin[1]) || 0) + (Number(dy) || 0),
      (Number(origin[2]) || 0) + (Number(dz) || 0),
    ];
  }

  /**
   * Rotate one volumetric grid (origin + basis vectors) around a pivot using a basis-row transform.
   * @param {*} vol
   * @param {number} comX
   * @param {number} comY
   * @param {number} comZ
   * @param {THREE.Vector3} ex
   * @param {THREE.Vector3} ey
   * @param {THREE.Vector3} ez
   */
  function rotateVolumetricGridAboutPoint(vol, comX, comY, comZ, ex, ey, ez) {
    if (!hasVolumetricGrid(vol)) return;
    const origin = Array.isArray(vol.origin) ? vol.origin : [0, 0, 0];
    const axes = Array.isArray(vol.axes) ? vol.axes : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

    const ox = (Number(origin[0]) || 0) - comX;
    const oy = (Number(origin[1]) || 0) - comY;
    const oz = (Number(origin[2]) || 0) - comZ;
    const [nox, noy, noz] = applyBasisRowsToVector(ex, ey, ez, ox, oy, oz);
    vol.origin = [comX + nox, comY + noy, comZ + noz];

    const newAxes = [];
    for (let i = 0; i < 3; i++) {
      const axis = Array.isArray(axes[i]) ? axes[i] : [0, 0, 0];
      const [ax, ay, az] = applyBasisRowsToVector(
        ex,
        ey,
        ez,
        Number(axis[0]) || 0,
        Number(axis[1]) || 0,
        Number(axis[2]) || 0
      );
      newAxes.push([ax, ay, az]);
    }
    vol.axes = newAxes;
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

    const massProps = computeMassProperties(vol);
    if (!massProps) {
      setHintMessage('Could not compute a valid center of mass.');
      return false;
    }

    const { comX, comY, comZ } = massProps;
    const shiftNormNative = Math.hypot(comX, comY, comZ);
    if (!Number.isFinite(shiftNormNative) || shiftNormNative <= 1e-12) {
      setHintMessage('Center of mass is already at the origin.');
      return false;
    }

    const beforeSnapshot = cloneCoordinateSnapshot(vol);
    for (const atom of vol.atoms) {
      atom.x = (Number(atom.x) || 0) - comX;
      atom.y = (Number(atom.y) || 0) - comY;
      atom.z = (Number(atom.z) || 0) - comZ;
    }
    translateVolumetricGrid(vol, -comX, -comY, -comZ);
    finalizeCoordinateSnapshotEdit(record, vol, beforeSnapshot, 'Center mass at origin');

    const shiftAngstrom = vol.units === 'angstrom' ? shiftNormNative : shiftNormNative * BOHR_TO_ANG;
    setHintMessage(`Shifted active molecule COM to origin (delta ${shiftAngstrom.toFixed(3)} A).`);
    return true;
  }

  /**
   * Compute eigenvalues/eigenvectors of one symmetric 3x3 matrix using Jacobi sweeps.
   * Returns eigenvectors as orthonormal basis vectors in original coordinates.
   * @param {number[][]} m
   * @returns {{values:number[], vectors:THREE.Vector3[]}}
   */
  function eigenSymmetric3x3Jacobi(m) {
    const eig = eigenSymmetric3x3(m);
    const vectors = [];
    for (const v of (eig && Array.isArray(eig.vectors) ? eig.vectors : [])) {
      const x = Number(v && v[0]) || 0;
      const y = Number(v && v[1]) || 0;
      const z = Number(v && v[2]) || 0;
      const vec = new THREE.Vector3(x, y, z);
      if (vec.lengthSq() <= 1e-20) continue;
      vectors.push(vec.normalize());
    }
    while (vectors.length < 3) {
      if (vectors.length === 0) vectors.push(new THREE.Vector3(1, 0, 0));
      else if (vectors.length === 1) vectors.push(new THREE.Vector3(0, 1, 0));
      else vectors.push(new THREE.Vector3(0, 0, 1));
    }
    return {
      values: eig && Array.isArray(eig.values) ? eig.values.slice(0, 3) : [0, 0, 0],
      vectors: vectors.slice(0, 3),
    };
  }

  /**
   * Rotate active molecule about its center of mass so principal inertia axes align to XYZ.
   * Applies to active coordinates and volumetric transform (when present), and records one undo entry.
   * @returns {boolean}
   */
  function alignActiveMoleculePrincipalAxes() {
    if (dragActive) {
      setHintMessage('Finish moving the current atom before aligning principal axes.');
      return false;
    }
    if (currentIndex < 0 || !volumes[currentIndex] || !volumes[currentIndex].vol) {
      setHintMessage('No active molecule to align.');
      return false;
    }

    const record = volumes[currentIndex];
    const vol = record.vol;
    if (!Array.isArray(vol.atoms) || vol.atoms.length < 2) {
      setHintMessage('Need at least two atoms to align principal axes.');
      return false;
    }

    const massProps = computeMassProperties(vol);
    if (!massProps) {
      setHintMessage('Could not compute a valid center of mass for principal-axis alignment.');
      return false;
    }

    const { comX, comY, comZ } = massProps;

    const inertia = computeInertiaTensorFromAtoms(vol.atoms, { comX, comY, comZ }, getAtomicMass);
    const eig = eigenSymmetric3x3Jacobi(inertia);
    if (!eig || !Array.isArray(eig.vectors) || eig.vectors.length !== 3) {
      setHintMessage('Principal-axis alignment failed (eigendecomposition).');
      return false;
    }
    const ex = eig.vectors[0];
    const ey = eig.vectors[1];
    const ez = eig.vectors[2];

    const beforeSnapshot = cloneCoordinateSnapshot(vol);
    for (const atom of vol.atoms) {
      const x = (Number(atom.x) || 0) - comX;
      const y = (Number(atom.y) || 0) - comY;
      const z = (Number(atom.z) || 0) - comZ;
      const [nx, ny, nz] = applyBasisRowsToVector(ex, ey, ez, x, y, z);
      atom.x = comX + nx;
      atom.y = comY + ny;
      atom.z = comZ + nz;
    }
    rotateVolumetricGridAboutPoint(vol, comX, comY, comZ, ex, ey, ez);
    finalizeCoordinateSnapshotEdit(record, vol, beforeSnapshot, 'Align principal axes');
    setHintMessage(hasVolumetricGrid(vol)
      ? 'Aligned principal inertia axes to X/Y/Z (atoms + volumetric grid).'
      : 'Aligned principal inertia axes to X/Y/Z.');
    return true;
  }

  /**
   * Retarget the camera so the active molecule center of mass is centered in view.
   * Keeps the current camera pose and only moves the controls target.
   * @returns {boolean}
   */
  function pointCameraAtActiveMoleculeMassCenter() {
    if (currentIndex < 0 || !volumes[currentIndex] || !volumes[currentIndex].vol) {
      setHintMessage('No active molecule to point the camera at.');
      return false;
    }

    const record = volumes[currentIndex];
    const vol = record.vol;
    if (!Array.isArray(vol.atoms) || vol.atoms.length === 0) {
      setHintMessage('Active file has no atoms.');
      return false;
    }

    const massProps = computeMassProperties(vol);
    if (!massProps) {
      setHintMessage('Could not compute a valid center of mass.');
      return false;
    }

    const target = new THREE.Vector3(
      Number(massProps.comX) || 0,
      Number(massProps.comY) || 0,
      Number(massProps.comZ) || 0
    );
    if (controls.target.distanceToSquared(target) <= 1e-14) {
      setHintMessage('Camera is already centered on the active molecule COM.');
      return false;
    }

    controls.target.copy(target);
    camera.lookAt(target);
    controls.update();
    refreshViewUI();
    setHintMessage('Pointed camera at active molecule COM.');
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
    const placementState = getCurrentAddAtomPlacementPlaneState();
    const planePoint = placementState ? placementState.point : new THREE.Vector3(0, 0, 0);
    const plane = placementState
      ? placementState.plane
      : new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, -1), planePoint);
    const p = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, p)) return p;
    return planePoint;
  }

  /**
   * Begin one transform drag gesture from a clicked atom hit.
   * @param {PointerEvent} e
   * @param {THREE.Intersection} hit
   * @returns {boolean}
   */
  function beginTransformDragFromHit(e, hit) {
    const record = ensureEditableVolumeRecord();
    const vol = record && record.vol;
    if (!vol || !Array.isArray(vol.atoms) || vol.atoms.length === 0) return false;
    if (!hit || !hit.object || !hit.object.userData) return false;
    const anchorIdx = hit.object.userData.index | 0;
    if (anchorIdx < 0 || anchorIdx >= vol.atoms.length) return false;
    const target = resolveTransformAtomTarget(vol, anchorIdx);
    if (!target || !Array.isArray(target.indices) || target.indices.length === 0) {
      if (editTransformScope === EDIT_TRANSFORM_SCOPE.FRAGMENT) {
        setHintMessage('Transform scope=Fragment needs a fragment-built atom (no fragment metadata on this atom).');
      } else {
        setHintMessage('No transform target was found for this atom.');
      }
      return false;
    }
    return beginTransformDragFromResolvedTarget(e, vol, target, hit.point || null, null);
  }

  /**
   * Begin one transform drag from a clicked bond-side target.
   * @param {PointerEvent} e
   * @param {{object:*,point:THREE.Vector3|null}} bondHit
   * @returns {boolean}
   */
  function beginTransformDragFromBondHit(e, bondHit) {
    const record = ensureEditableVolumeRecord();
    const vol = record && record.vol;
    if (!vol || !Array.isArray(vol.atoms) || vol.atoms.length === 0) return false;
    const target = resolveTransformBondTarget(vol, bondHit);
    if (!target || !Array.isArray(target.indices) || !target.indices.length) {
      setHintMessage('Transform tool: could not resolve a bond-side fragment.');
      return false;
    }
    const i = bondHit.object.userData.i | 0;
    const j = bondHit.object.userData.j | 0;
    const selectedAtomIndex = target.seedIndex | 0;
    const anchorAtomIndex = selectedAtomIndex === i ? j : i;
    return beginTransformDragFromResolvedTarget(
      e,
      vol,
      target,
      bondHit && bondHit.point ? bondHit.point : null,
      {
        type: 'bond',
        selectedAtomIndex,
        anchorAtomIndex,
        bondIndices: [i, j],
      }
    );
  }

  /**
   * Count connected components inside one selected atom subset.
   * @param {*} vol
   * @param {number[]} indices
   * @returns {number}
   */
  function countSelectedAtomComponents(vol, indices) {
    if (!vol || !Array.isArray(vol.atoms) || !Array.isArray(indices) || !indices.length) return 0;
    const selected = Array.from(new Set(indices.filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < vol.atoms.length)));
    if (!selected.length) return 0;
    const selectedSet = new Set(selected);
    const records = buildBondAtomRecords(vol, { includeRenderColor: false });
    const edges = getVolumeBondEdges(vol, records);
    const adjacency = Array.from({ length: vol.atoms.length }, () => []);
    for (const edge of edges) {
      if (!edge) continue;
      const i = edge.i | 0;
      const j = edge.j | 0;
      if (!selectedSet.has(i) || !selectedSet.has(j)) continue;
      adjacency[i].push(j);
      adjacency[j].push(i);
    }
    const seen = new Set();
    let components = 0;
    for (const start of selected) {
      if (seen.has(start)) continue;
      components += 1;
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const cur = stack.pop();
        const neighbors = adjacency[cur] || [];
        for (const next of neighbors) {
          if (seen.has(next)) continue;
          seen.add(next);
          stack.push(next);
        }
      }
    }
    return components;
  }

  /**
   * Describe the current transform selection in user-facing terms.
   * @param {*} vol
   * @param {number[]} indices
   * @param {'fragment'|'molecule'|'all'} kind
   * @param {{type:'bond',selectedAtomIndex:number,anchorAtomIndex:number,bondIndices:[number,number]}|null=} context
   * @returns {{status:string,hint:string}}
   */
  function describeTransformSelection(vol, indices, kind, context = null) {
    const selected = Array.from(new Set((Array.isArray(indices) ? indices : []).filter((idx) => Number.isInteger(idx) && idx >= 0)));
    if (!vol || !Array.isArray(vol.atoms) || !selected.length) {
      return {
        status: 'Selection: none',
        hint: 'Transform selection cleared.',
      };
    }
    const entryIds = new Set(selected.map((idx) => getAtomBuilderMeta(vol, idx).entryId).filter(Boolean));
    const entryKinds = new Set(selected.map((idx) => getAtomBuilderMeta(vol, idx).entryKind).filter(Boolean));
    const groupIds = new Set(selected.map((idx) => getAtomBuilderMeta(vol, idx).groupId).filter(Boolean));
    const selectedCount = selected.length;
    const components = countSelectedAtomComponents(vol, selected);
    const soleGroupId = groupIds.size === 1 ? groupIds.values().next().value : '';
    const isWholeGroup = soleGroupId
      ? selectedCount === vol.atoms.filter((_, atomIndex) => getAtomBuilderMeta(vol, atomIndex).groupId === soleGroupId).length
      : false;

    const getNamedLabel = () => {
      if (entryIds.size !== 1 || entryKinds.size !== 1) return null;
      const entryId = entryIds.values().next().value;
      const entryKind = entryKinds.values().next().value;
      if (entryKind !== CATALOG_KIND.FRAGMENT && entryKind !== CATALOG_KIND.MOLECULE) return null;
      const entry = getCatalogEntryById(entryId, entryKind);
      const entryName = entry && entry.name ? entry.name : entryId;
      if (entryKind === CATALOG_KIND.FRAGMENT && isWholeGroup) {
        return {
          status: `Selection: fragment ${entryName} • ${selectedCount} atoms`,
          hint: `Selected fragment: ${entryName} • ${selectedCount} atoms`,
        };
      }
      if (entryKind === CATALOG_KIND.MOLECULE && isWholeGroup) {
        return {
          status: `Selection: molecule ${entryName} • ${selectedCount} atoms`,
          hint: `Selected molecule: ${entryName} • ${selectedCount} atoms`,
        };
      }
      if (entryKind === CATALOG_KIND.MOLECULE && context && context.type === 'bond') {
        return {
          status: `Selection: bond side of ${entryName} • ${selectedCount} atoms`,
          hint: `Selected bond side: ${entryName} • ${selectedCount} atoms`,
        };
      }
      if (entryKind === CATALOG_KIND.FRAGMENT) {
        return {
          status: `Selection: fragment-derived set ${entryName} • ${selectedCount} atoms`,
          hint: `Selected fragment-derived set: ${entryName} • ${selectedCount} atoms`,
        };
      }
      return null;
    };

    const named = getNamedLabel();
    if (named) return named;

    if (kind === 'all') {
      return {
        status: `Selection: all atoms • ${selectedCount} atoms`,
        hint: `Selected all atoms • ${selectedCount} atoms`,
      };
    }
    if (components > 1) {
      return {
        status: `Selection: mixed set • ${components} targets • ${selectedCount} atoms`,
        hint: `Selected mixed set • ${components} targets • ${selectedCount} atoms`,
      };
    }
    if (kind === 'molecule') {
      return {
        status: `Selection: molecule component • ${selectedCount} atoms`,
        hint: `Selected molecule component • ${selectedCount} atoms`,
      };
    }
    if (context && context.type === 'bond') {
      return {
        status: `Selection: bond side • ${selectedCount} atoms`,
        hint: `Selected bond side • ${selectedCount} atoms`,
      };
    }
    return {
      status: `Selection: fragment • ${selectedCount} atoms`,
      hint: `Selected fragment • ${selectedCount} atoms`,
    };
  }

  /**
   * Convert one selection description into an additive-selection hint.
   * @param {{hint:string}} description
   * @returns {string}
   */
  function getAdditiveTransformSelectionHint(description) {
    const hint = description && typeof description.hint === 'string' ? description.hint : 'Selected target';
    if (hint.startsWith('Selected ')) return `Added to selection: ${hint.slice('Selected '.length)}`;
    return `Added to selection: ${hint}`;
  }

  /**
   * Apply one in-progress transform drag update from pointer position.
   * @param {PointerEvent} e
   */
  function updateTransformDragFromEvent(e) {
    if (!transformActive || !Array.isArray(transformTargetIndices) || transformTargetIndices.length === 0) return;
    const record = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null;
    const vol = record && record.vol;
    if (!vol || !Array.isArray(vol.atoms)) return;
    if (!transformPivotWorld || !transformBeforeSnapshot) return;

    const movedWorld = [];
    if (isRotateTransformMode(editTransformMode)) {
      if (transformRotateGesture === 'bondQuaternion') {
        const nextClientX = Number(e.clientX) || transformRotateLastClientX;
        const nextClientY = Number(e.clientY) || transformRotateLastClientY;
        const dx = nextClientX - transformRotateLastClientX;
        const dy = nextClientY - transformRotateLastClientY;
        transformRotateLastClientX = nextClientX;
        transformRotateLastClientY = nextClientY;
        if (Math.abs(dx) <= 1e-7 && Math.abs(dy) <= 1e-7) return;
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        if (camDir.lengthSq() < 1e-12) camDir.set(0, 0, -1);
        camDir.normalize();
        const camUp = camera.up.clone().normalize();
        if (camUp.lengthSq() < 1e-12) camUp.set(0, 1, 0);
        let camRight = new THREE.Vector3().crossVectors(camDir, camUp);
        if (camRight.lengthSq() < 1e-12) camRight = getBondPerpendicular(camDir);
        camRight.normalize();
        const deltaQ = new THREE.Quaternion()
          .setFromAxisAngle(camUp, dx * 0.01)
          .multiply(new THREE.Quaternion().setFromAxisAngle(camRight, dy * 0.01));
        transformRotateAccumulatedQuaternion.premultiply(deltaQ);
        for (const startWorld of transformStartPositionsWorld) {
          const world = startWorld.clone()
            .sub(transformPivotWorld)
            .applyQuaternion(transformRotateAccumulatedQuaternion)
            .add(transformPivotWorld);
          movedWorld.push(world);
        }
        applyTransformWorldPositions(vol, transformTargetIndices, movedWorld);
        if (transformAppliesToGrid) {
          applyTransformGridRotation(vol, transformBeforeSnapshot.grid, transformPivotWorld, transformRotateAccumulatedQuaternion);
        }
        transformMoved = true;
      } else {
        if (!transformDragPlane || !transformRotateAxis || !transformRotateStartDir) return;
        setRaycasterFromEvent(e);
        const planeHit = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(transformDragPlane, planeHit)) return;
        const currDir = planeHit.clone().sub(transformPivotWorld);
        currDir.addScaledVector(transformRotateAxis, -currDir.dot(transformRotateAxis));
        if (currDir.lengthSq() < 1e-10) return;
        currDir.normalize();
        const cross = new THREE.Vector3().crossVectors(transformRotateStartDir, currDir);
        const sin = cross.dot(transformRotateAxis);
        const cos = THREE.MathUtils.clamp(transformRotateStartDir.dot(currDir), -1, 1);
        const angle = Math.atan2(sin, cos);
        if (Math.abs(angle) <= 1e-7) return;
        const deltaQ = new THREE.Quaternion().setFromAxisAngle(transformRotateAxis, angle);
        transformRotateAccumulatedQuaternion.premultiply(deltaQ);
        transformRotateStartDir.copy(currDir);
        for (const startWorld of transformStartPositionsWorld) {
          const world = startWorld.clone()
            .sub(transformPivotWorld)
            .applyQuaternion(transformRotateAccumulatedQuaternion)
            .add(transformPivotWorld);
          movedWorld.push(world);
        }
        applyTransformWorldPositions(vol, transformTargetIndices, movedWorld);
        if (transformAppliesToGrid) {
          applyTransformGridRotation(vol, transformBeforeSnapshot.grid, transformPivotWorld, transformRotateAccumulatedQuaternion);
        }
        transformMoved = true;
      }
    } else {
      if (!transformDragPlane) return;
      setRaycasterFromEvent(e);
      const planeHit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(transformDragPlane, planeHit)) return;
      if (!transformPlaneStart) return;
      const delta = planeHit.clone().sub(transformPlaneStart);
      if (delta.lengthSq() <= 1e-12) return;
      for (const startWorld of transformStartPositionsWorld) movedWorld.push(startWorld.clone().add(delta));
      applyTransformWorldPositions(vol, transformTargetIndices, movedWorld);
      if (transformAppliesToGrid) applyTransformGridTranslation(vol, transformBeforeSnapshot.grid, delta);
      transformMoved = true;
    }

    if (bondGroup && bondGroup.children && bondGroup.children.length) updateBondsInPlace();
    updateAxisGuideLine();
    updateEditSelectionVisuals();
    updateTransformSelectionGuides();
  }

  /**
   * Finalize an active transform gesture and create one undo entry.
   */
  function finalizeTransformDrag() {
    if (!transformActive) return;
    const record = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null;
    const vol = record && record.vol;
    const beforeSnapshot = transformBeforeSnapshot;
    const modeLabel = getEditTransformModeLabel(editTransformMode);
    const targetLabel = transformTargetKind === 'fragment'
      ? 'fragment'
      : (transformTargetKind === 'all' ? 'all atoms' : 'molecule');
    const moved = transformMoved;
    clearTransformState();
    if (!moved) return;
    if (!record || !vol || !beforeSnapshot) {
      rebuildScene({ preserveView: true });
      return;
    }
    const cleanupIndices = transformTargetIndices.filter((idx) => {
      const atom = vol.atoms[idx];
      const before = beforeSnapshot && Array.isArray(beforeSnapshot.atoms) ? beforeSnapshot.atoms[idx] : null;
      if (!atom || !before) return false;
      const dx = Number(atom.x || 0) - Number(before.x || 0);
      const dy = Number(atom.y || 0) - Number(before.y || 0);
      const dz = Number(atom.z || 0) - Number(before.z || 0);
      return (dx * dx + dy * dy + dz * dz) > 1e-10;
    });
    const cleanupResult = applyLocalTransformCleanup(vol, cleanupIndices);
    const afterSnapshot = cloneCoordinateSnapshot(vol);
    pushCoordinateSnapshotHistoryEntry(record, beforeSnapshot, afterSnapshot, `${modeLabel} ${targetLabel}`);
    rebuildScene({ preserveView: true });
    updateSidePanel();
    const cleanupParts = [];
    if (cleanupResult.bondLengthShift > 1e-4) cleanupParts.push(`bond length ${cleanupResult.bondLengthShift.toFixed(2)} Å`);
    if (cleanupResult.overlapShift > 1e-4) cleanupParts.push(`overlap relief ${cleanupResult.overlapShift.toFixed(2)} Å`);
    const cleanupSuffix = cleanupParts.length ? ` • Cleanup: ${cleanupParts.join(' • ')}` : '';
    setHintMessage(`${modeLabel} ${targetLabel}.${cleanupSuffix}`);
  }

  let __lastBondUpdate = 0;
  canvasEl.addEventListener('pointermove', (e) => {
    if (viewRotateActive && viewRotatePointerId === e.pointerId) {
      const dx = (Number(e.clientX) || 0) - viewRotateLastClientX;
      const dy = (Number(e.clientY) || 0) - viewRotateLastClientY;
      viewRotateLastClientX = Number(e.clientX) || viewRotateLastClientX;
      viewRotateLastClientY = Number(e.clientY) || viewRotateLastClientY;
      let shouldRotate = true;
      if (currentMode !== MODES.DISPLAY && __editDownPt) {
        const moveDx = (Number(e.clientX) || 0) - __editDownPt.x;
        const moveDy = (Number(e.clientY) || 0) - __editDownPt.y;
        if (Math.hypot(moveDx, moveDy) > 4) __editMoved = true;
        shouldRotate = __editMoved;
      }
      if (shouldRotate) applyQuaternionViewOrbit(dx, dy);
      if (typeof e.preventDefault === 'function') e.preventDefault();
      return;
    }
    // Allow hover highlighting in Display, Edit, and Measurement modes.
    const allowHover = (currentMode === MODES.DISPLAY || currentMode === MODES.EDIT || currentMode === MODES.MEASURE);
    if (!allowHover) {
      clearMeasurementLabelHover();
      hideSurfaceHoverLabel();
      return;
    }
    // Track movement to distinguish click vs drag in measurement mode
    if ((currentMode === MODES.MEASURE || (currentMode === MODES.EDIT && editTool === EDIT_TOOL.ADD)) && __editDownPt) {
      const dx = e.clientX - __editDownPt.x, dy = e.clientY - __editDownPt.y;
      if (Math.hypot(dx, dy) > 4) __editMoved = true;
    }
    if (transformActive) {
      __editMoved = true;
      updateTransformDragFromEvent(e);
      return;
    }
    if (measurementLabelDragState) {
      __editMoved = true;
      updateMeasurementLabelDragFromEvent(e);
      return;
    }
    if (currentMode === MODES.EDIT && editTool === EDIT_TOOL.ADD && editAddMode === EDIT_ADD_MODE.MOLECULE && moleculePlaceActive && moleculePlaceRotating) {
      __editMoved = true;
      updateMoleculePlacementRotationFromEvent(e);
      return;
    }
    if (currentMode === MODES.EDIT && editTool === EDIT_TOOL.ADD && editAddMode === EDIT_ADD_MODE.FRAGMENT && addFusePreviewState && addFusePreviewState.rotating) {
      __editMoved = true;
      updateFuseRingPlacementRotationFromEvent(e);
      return;
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
    if (currentMode === MODES.MEASURE) {
      const labelHit = pickMeasurementLabelHit(e);
      if (labelHit && labelHit.object) {
        setMeasurementLabelHover(labelHit.object);
        setHover(null);
        setBondHover(null);
        setSurfaceHover(null);
        hideSurfaceHoverLabel();
        return;
      }
      clearMeasurementLabelHover();
    } else {
      clearMeasurementLabelHover();
    }
    if (currentMode === MODES.EDIT || currentMode === MODES.MEASURE) {
      const atomObj = pickAtom(e);
      if (atomObj) {
        setHover(atomObj);
        setBondHover(null);
        setSurfaceHover(null);
        hideSurfaceHoverLabel();
        return;
      }
      const bondHit = pickBondHit(e);
      setHover(null);
      setBondHover(bondHit ? bondHit.object : null);
      if (bondHit) {
        setSurfaceHover(null);
        hideSurfaceHoverLabel();
        return;
      }
    } else {
      setHover(null);
      setBondHover(null);
    }
    const record = currentIndex >= 0 ? volumes[currentIndex] : null;
    const vol = record && record.vol;
    const compMode = getComponentMode(vol);
    if (vol && vol.isTwoComponent && compMode === 'alphaBetaPhase') {
      setSurfaceHover(null);
      hideSurfaceHoverLabel();
      return;
    }
    const surfaceHit = pickSurfaceHit(e);
    if (!surfaceHit || !surfaceHit.object) {
      setSurfaceHover(null);
      hideSurfaceHoverLabel();
      return;
    }
    setSurfaceHover(surfaceHit.object);
    const iso = Math.max(0, parseFloat(isoInput.value || '0.02') || 0);
    const metric = getSurfaceMetric(record, vol, compMode, iso, surfaceHit.object);
    if (!metric) {
      hideSurfaceHoverLabel();
      return;
    }
    showSurfaceHoverLabel(e, `Inside surface: ${metric.display}`);
  });

  canvasEl.addEventListener('pointerleave', () => {
    if (!measurementLabelDragState) clearMeasurementLabelHover();
    clearHover();
  });

  canvasEl.addEventListener('contextmenu', (e) => {
    if (!(currentMode === MODES.EDIT && editTool === EDIT_TOOL.BOND)) return;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    const bondHit = pickBondHit(e);
    if (!bondHit || !bondHit.object) {
      if (bondEditing) bondEditing.hidePopup();
      return;
    }
    if (bondEditing) {
      bondEditing.hidePopup();
      bondEditing.applyToCarrier(bondHit.object, { deleteOverride: true });
    }
  });

  canvasEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (currentMode === MODES.DISPLAY) {
      beginQuaternionViewRotate(e);
      if (typeof e.preventDefault === 'function') e.preventDefault();
      return;
    }
    __editDownPt = { x: e.clientX, y: e.clientY }; __editMoved = false; __editClickIdx = -1;
    editSelectionClickAdditive = false;
    dragBeforeAtomsSnapshot = null;
    dragBeforeBondSnapshot = null;
    const obj = pickAtom(e);
    if (currentMode === MODES.EDIT) {
      if (editTool === EDIT_TOOL.SELECT) {
        editSelectionClickAdditive = !!e.shiftKey;
        if (obj && obj.userData) {
          __editClickIdx = obj.userData.index | 0;
          e.preventDefault();
        } else {
          beginQuaternionViewRotate(e);
        }
        return;
      }
      if (editTool === EDIT_TOOL.DELETE) {
        if (obj && obj.userData) {
          __editClickIdx = obj.userData.index | 0;
          e.preventDefault();
        } else {
          beginQuaternionViewRotate(e);
        }
        return;
      }
      if (editTool === EDIT_TOOL.BOND) {
        const bondHit = pickBondHit(e);
        if (bondHit && bondHit.object) {
          if (bondEditing) bondEditing.showPopupForCarrier(bondHit.object, { markClickHandled: true });
          e.preventDefault();
          return;
        }
        if (bondEditing) bondEditing.hidePopup();
        const hit = pickAtomHit(e);
        if (hit && hit.object && hit.object.userData) {
          __editClickIdx = hit.object.userData.index | 0;
          e.preventDefault();
          return;
        }
        beginQuaternionViewRotate(e);
        return;
      }
      if (editTool === EDIT_TOOL.ADD) {
        if (editAddMode === EDIT_ADD_MODE.ATOM && addAtomOperatorSession) {
          finalizeAddAtomOperatorSession({ announce: false });
        }
        if (editAddMode === EDIT_ADD_MODE.MOLECULE) {
          if (moleculePlaceActive) {
            moleculePlaceRotating = true;
            moleculePlaceMoved = false;
            moleculePlaceLastClientX = Number(e.clientX) || 0;
            moleculePlaceLastClientY = Number(e.clientY) || 0;
            try { controls.enabled = false; } catch { }
            e.preventDefault();
          }
          if (!moleculePlaceActive) beginQuaternionViewRotate(e);
          return;
        }
        if (editAddMode === EDIT_ADD_MODE.FRAGMENT && editAddFragmentAttachPolicy === EDIT_FRAGMENT_ATTACH_POLICY.FUSE_RING) {
          if (addFusePreviewState) {
            addFusePreviewState.rotating = true;
            addFusePreviewState.moved = false;
            addFusePreviewState.lastClientX = Number(e.clientX) || 0;
            try { controls.enabled = false; } catch { }
            e.preventDefault();
            return;
          }
          const bondHit = pickBondHit(e);
          if (bondHit) {
            startFuseRingPlacementFromBondHit(bondHit);
            e.preventDefault();
          } else {
            beginQuaternionViewRotate(e);
            setHintMessage('Fuse ring mode: click a host bond first.');
            e.preventDefault();
          }
          return;
        }
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
            updateAddGrowPreviewFromEvent(e);
            e.preventDefault();
          }
        } else {
          beginQuaternionViewRotate(e);
        }
        if (!hit && editAddMode === EDIT_ADD_MODE.FRAGMENT) {
          setHintMessage('Fragment mode: click an anchor atom first.');
          e.preventDefault();
        }
        // In Atom mode, if no anchor is hit, fallback remains click-to-add on release.
        return;
      }
      if (editTool === EDIT_TOOL.TRANSFORM) {
        transformPendingBackgroundClear = false;
        transformPendingSelectionTarget = null;
        const record = ensureEditableVolumeRecord();
        const vol = record && record.vol;
        const hit = pickAtomHit(e);
        if (hit && hit.object && hit.object.userData && vol && Array.isArray(vol.atoms)) {
          __editClickIdx = hit.object.userData.index | 0;
          if (!e.shiftKey && getActiveTransformSelectionIndices().includes(__editClickIdx)) {
            if (beginTransformDragFromCurrentSelection(e, hit.point || null, null)) e.preventDefault();
            return;
          }
          const anchorIdx = hit.object.userData.index | 0;
          const target = resolveTransformAtomTarget(vol, anchorIdx);
          if (!target || !Array.isArray(target.indices) || !target.indices.length) {
            if (editTransformScope === EDIT_TRANSFORM_SCOPE.FRAGMENT) {
              setHintMessage('Transform scope=Fragment needs a fragment-built atom (no fragment metadata on this atom).');
            } else {
              setHintMessage('No transform target was found for this atom.');
            }
            e.preventDefault();
            return;
          }
          if (!e.shiftKey && isTransformTargetInsideSelection(target.indices)) {
            if (beginTransformDragFromCurrentSelection(e, hit.point || null, null)) e.preventDefault();
          } else {
            transformPendingSelectionTarget = {
              target,
              context: null,
              interactionPoint: hit.point || null,
              additive: !!e.shiftKey,
            };
            e.preventDefault();
          }
          return;
        }
        const bondHit = pickBondHit(e);
        if (bondHit && vol && Array.isArray(vol.atoms)) {
          const bondI = bondHit.object.userData.i | 0;
          const bondJ = bondHit.object.userData.j | 0;
          const activeSelection = new Set(getActiveTransformSelectionIndices());
          const bondAlreadySelected = !e.shiftKey && activeSelection.has(bondI) && activeSelection.has(bondJ);
          const target = resolveTransformBondTarget(vol, bondHit);
          if (!target || !Array.isArray(target.indices) || !target.indices.length) {
            setHintMessage('Transform tool: could not resolve a bond-side fragment.');
            e.preventDefault();
            return;
          }
          const i = bondI;
          const j = bondJ;
          const selectedAtomIndex = target.seedIndex | 0;
          const anchorAtomIndex = selectedAtomIndex === i ? j : i;
          const context = {
            type: 'bond',
            selectedAtomIndex,
            anchorAtomIndex,
            bondIndices: [i, j],
          };
          if (bondAlreadySelected || (!e.shiftKey && isTransformTargetInsideSelection(target.indices))) {
            if (beginTransformDragFromCurrentSelection(e, bondHit.point || null, context)) e.preventDefault();
          } else {
            transformPendingSelectionTarget = {
              target,
              context,
              interactionPoint: bondHit.point || null,
              additive: !!e.shiftKey,
            };
            e.preventDefault();
          }
          return;
        }
        transformPendingSelectionTarget = null;
        if (!e.shiftKey && getActiveTransformSelectionIndices().length) {
          transformPendingBackgroundClear = true;
        }
        beginQuaternionViewRotate(e);
        if (editTransformMode === EDIT_TRANSFORM_MODE.ROTATE_FRAGMENT) {
          setHintMessage('Rotate fragment: click a bond to select one side. Drag the selected fragment to spin about the bond axis.');
        } else if (editTransformMode === EDIT_TRANSFORM_MODE.ROTATE_BOND) {
          setHintMessage('Rotate bond: click a bond to select one side. Drag the selected fragment to rotate around the opposite atom.');
        } else {
          setHintMessage('Transform tool: click an atom or bond to select. Drag the current selection to move it.');
        }
        return;
      }
      if (!obj || !obj.userData) {
        beginQuaternionViewRotate(e);
        return;
      }
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
        dragBeforeBondSnapshot = cloneBondSnapshot(vol);
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
      const labelHit = pickMeasurementLabelHit(e);
      if (labelHit && beginMeasurementLabelDrag(e, labelHit)) {
        e.preventDefault();
        return;
      }
      beginQuaternionViewRotate(e);
      if (!obj || !obj.userData) { __editClickIdx = -1; return; }
      __editClickIdx = obj.userData.index | 0;
      // selection is applied on pointerup if not moved
    }
  });

  canvasEl.addEventListener('pointerup', (e) => {
    if (viewRotateActive && viewRotatePointerId === e.pointerId) {
      endQuaternionViewRotate(e);
    }
    if (currentMode === MODES.EDIT) {
      if (transformActive) {
        finalizeTransformDrag();
      } else {
        if (editTool === EDIT_TOOL.TRANSFORM && transformPendingSelectionTarget && !__editMoved) {
          const pending = transformPendingSelectionTarget;
          const pendingIndices = Array.isArray(pending.target && pending.target.indices) ? pending.target.indices.slice() : [];
          if (pendingIndices.length) {
            if (pending.additive && getActiveTransformSelectionIndices().length) {
              const existing = getActiveTransformSelectionIndices();
              const merged = Array.from(new Set([...existing, ...pendingIndices]))
                .filter((idx) => Number.isInteger(idx) && idx >= 0)
                .sort((a, b) => a - b);
              const mergedKind = merged.length === (((volumes[currentIndex] && volumes[currentIndex].vol && volumes[currentIndex].vol.atoms) || []).length)
                ? 'all'
                : (transformSelectionKind === pending.target.kind ? pending.target.kind : 'fragment');
              setTransformSelection(merged, mergedKind, null);
              const description = describeTransformSelection(
                (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex].vol : null,
                merged,
                mergedKind,
                null
              );
              setHintMessage(getAdditiveTransformSelectionHint(description));
            } else {
              setTransformSelection(pendingIndices, pending.target.kind, pending.context || null);
              const description = describeTransformSelection(
                (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex].vol : null,
                pendingIndices,
                pending.target.kind,
                pending.context || null
              );
              setHintMessage(description.hint);
            }
          }
        } else if (editTool === EDIT_TOOL.TRANSFORM && transformPendingBackgroundClear && !__editMoved) {
          clearTransformSelection();
          setHintMessage('Transform selection cleared.');
        }
        transformPendingSelectionTarget = null;
        transformPendingBackgroundClear = false;
        const wasDragging = dragActive;
        if (wasDragging) {
          const record = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null;
          const vol = record && record.vol;
          const afterAtoms = vol ? cloneAtomsSnapshot(vol) : null;
          if (record && dragBeforeAtomsSnapshot && afterAtoms) {
            pushEditHistoryEntry(record, dragBeforeAtomsSnapshot, afterAtoms, 'Move atom', {
              beforeBonds: Array.isArray(dragBeforeBondSnapshot) ? dragBeforeBondSnapshot : [],
              afterBonds: vol ? cloneBondSnapshot(vol) : [],
            });
          }
          // Final rebuild to update bonds/geometry once after drag
          rebuildScene({ preserveView: true });
          dragActive = false; dragAtomIndex = -1; dragPlane = null; dragPlaneStart = null; dragStartPos = null; dragOrigMeshPos = null; dragOrigAtomUnits = null; dragBeforeAtomsSnapshot = null; dragBeforeBondSnapshot = null; dragAxis = 'none';
          controls.enabled = true;
          if (editMode) renderRibbon('edit');
          // Refresh/hide guide line after drag ends
          updateAxisGuideLine();
          updateEditSelectionVisuals();
        } else if (editTool === EDIT_TOOL.SELECT) {
          if (!__editMoved) {
            if (__editClickIdx >= 0) {
              applyEditAtomSelectionClick(__editClickIdx, editSelectionClickAdditive);
            } else if (clearEditAtomSelection()) {
              setHintMessage('Selection cleared.');
            }
          }
        } else if (editTool === EDIT_TOOL.DELETE) {
          if (!__editMoved && __editClickIdx >= 0) deleteAtomAtIndex(__editClickIdx);
        } else if (editTool === EDIT_TOOL.BOND) {
          if (!__editMoved) {
            if (bondEditing && bondEditing.consumePopupClickHandled()) {
            } else if (__editClickIdx >= 0) {
              if (bondEditing) {
                bondEditing.hidePopup();
                bondEditing.applyToAtom(__editClickIdx);
              }
            } else if (getEditBondPendingAtomIndex((currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex].vol : null) >= 0) {
              if (bondEditing) bondEditing.hidePopup();
              clearEditBondPendingSelection();
              setHintMessage('Bond tool selection cleared.');
            } else {
              if (bondEditing) bondEditing.hidePopup();
            }
          }
          if (bondEditing) bondEditing.clearState({ pendingSelection: false, popup: false });
        } else if (editTool === EDIT_TOOL.ADD) {
          if (editAddMode === EDIT_ADD_MODE.MOLECULE) {
            if (moleculePlaceActive) {
              const wasRotating = moleculePlaceRotating;
              const rotated = moleculePlaceMoved || __editMoved;
              moleculePlaceRotating = false;
              moleculePlaceMoved = false;
              try { controls.enabled = true; } catch { }
              if (!wasRotating || !rotated) commitMoleculePlacement();
            } else if (!__editMoved) {
              const hit = pickAtomHit(e);
              const addPos = computeAddAtomPosition(e, hit);
              if (addPos) startMoleculePlacementAtWorld(addPos);
            }
            __editDownPt = null; __editClickIdx = -1; __editMoved = false;
            return;
          }
          if (editAddMode === EDIT_ADD_MODE.FRAGMENT && editAddFragmentAttachPolicy === EDIT_FRAGMENT_ATTACH_POLICY.FUSE_RING) {
            if (addFusePreviewState) {
              if (addFusePreviewState.justStarted) {
                addFusePreviewState.justStarted = false;
                try { controls.enabled = true; } catch { }
                __editDownPt = null; __editClickIdx = -1; __editMoved = false;
                return;
              }
              const wasRotating = !!addFusePreviewState.rotating;
              const rotated = !!addFusePreviewState.moved || __editMoved;
              addFusePreviewState.rotating = false;
              addFusePreviewState.moved = false;
              try { controls.enabled = true; } catch { }
              if (!wasRotating || !rotated) commitFuseRingPlacement();
            } else if (!__editMoved) {
              setHintMessage('Fuse ring mode: click a host bond to start placement.');
            }
            __editDownPt = null; __editClickIdx = -1; __editMoved = false;
            return;
          }
          if (addGrowActive) {
            const anchorIdx = addGrowAnchorIndex;
            const addPos = addGrowPreviewPos ? addGrowPreviewPos.clone() : null;
            clearAddGrowPreview();
            controls.enabled = true;
            if (addPos) {
              if (editAddMode === EDIT_ADD_MODE.FRAGMENT) appendFragmentAtWorld(anchorIdx, addPos);
              else appendAtomAtWorld(addPos);
            }
          } else if (!__editMoved) {
            if (editAddMode === EDIT_ADD_MODE.FRAGMENT) {
              setHintMessage('Fragment mode: click an anchor atom to place a fragment.');
            } else {
              const hit = pickAtomHit(e);
              const addPos = computeAddAtomPosition(e, hit);
              if (addPos) appendAtomAtWorld(addPos);
            }
          }
        }
      }
    } else if (currentMode === MODES.MEASURE) {
      if (finalizeMeasurementLabelDrag(e)) {
        __editDownPt = null; __editClickIdx = -1; __editMoved = false;
        return;
      }
      // Click (no significant motion) selects/accumulates
      if (!__editMoved) {
        if (__editClickIdx >= 0) {
          addEditSelection(__editClickIdx);
          updateSelectedHalos();
          updateEditSelectionVisuals();
        } else {
          const bondHit = pickBondHit(e);
          if (!bondHit) {
            clearMeasurementSelectionForContextChange();
            setHintMessage('Measurement cleared.');
          }
        }
      }
    }
    if (!dragActive) {
      dragBeforeAtomsSnapshot = null;
      dragBeforeBondSnapshot = null;
    }
    editSelectionClickAdditive = false;
    __editDownPt = null; __editClickIdx = -1; __editMoved = false;
  });
  canvasEl.addEventListener('pointercancel', (e) => {
    if (currentMode === MODES.DISPLAY) endQuaternionViewRotate(e);
    transformPendingSelectionTarget = null;
    transformPendingBackgroundClear = false;
    if (bondEditing) bondEditing.clearState({ pendingSelection: false, popup: false });
    dragBeforeAtomsSnapshot = null;
    dragBeforeBondSnapshot = null;
    editSelectionClickAdditive = false;
    cancelMeasurementLabelDrag();
    if (addFusePreviewState) {
      addFusePreviewState.rotating = false;
      addFusePreviewState.moved = false;
      try { controls.enabled = true; } catch { }
    }
  });

  // Reset view to the initial camera/target/shift
  viewReset.onclick = () => {
    if (viewState.defaultView) {
      const defaultMode = viewState.defaultView.projectionMode === 'orthographic' ? 'orthographic' : 'perspective';
      if (defaultMode !== viewState.mode) setProjectionMode(defaultMode, { refreshUi: false });
      contentGroup.position.copy(viewState.defaultView.contentPos);
      camera.copy(viewState.defaultView.cam);
      controls.object = camera;
      const { w, h } = getViewportSize();
      updateActiveCameraProjection(w, h);
      controls.target.copy(viewState.defaultView.target);
      controls.update();
      refreshViewUI();
    } else {
      fitCameraToScene();
      refreshViewUI();
    }
  };
  // View action: translate active molecule so mass center is at world origin.
  if (centerMassBtn) centerMassBtn.onclick = () => centerActiveMoleculeMassAtOrigin();
  // View action: center the camera target on the active molecule COM.
  if (pointCameraComBtn) pointCameraComBtn.onclick = () => pointCameraAtActiveMoleculeMassCenter();
  // View action: rotate active molecule to principal-inertia frame.
  if (alignInertiaBtn) alignInertiaBtn.onclick = () => alignActiveMoleculePrincipalAxes();
  // View action: toggle camera projection model while preserving pose/target.
  if (projectionModeBtn) {
    projectionModeBtn.onclick = () => {
      const next = viewState.mode === 'orthographic' ? 'perspective' : 'orthographic';
      setProjectionMode(next);
    };
  }

  /**
   * Snap camera to one principal axis direction while keeping target and distance.
   * @param {'x'|'y'|'z'} axis
   */
  function setCameraAxisPreset(axis) {
    const key = axis === 'y' ? 'y' : (axis === 'z' ? 'z' : 'x');
    const dir = key === 'x'
      ? new THREE.Vector3(1, 0, 0)
      : (key === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1));
    const target = controls.target.clone();
    let dist = camera.position.distanceTo(target);
    if (!(Number.isFinite(dist) && dist > 1e-6)) dist = 8;
    camera.position.copy(target).addScaledVector(dir, dist);
    if (key === 'y') camera.up.set(0, 0, 1);
    else camera.up.set(0, 1, 0);
    camera.lookAt(target);
    const { w, h } = getViewportSize();
    updateActiveCameraProjection(w, h);
    controls.update();
    refreshViewUI();
    setHintMessage(`View preset: +${key.toUpperCase()}`);
  }
  if (viewAxisXBtn) viewAxisXBtn.onclick = () => setCameraAxisPreset('x');
  if (viewAxisYBtn) viewAxisYBtn.onclick = () => setCameraAxisPreset('y');
  if (viewAxisZBtn) viewAxisZBtn.onclick = () => setCameraAxisPreset('z');

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
    activateVolumeIndex(((currentIndex + delta) % n + n) % n, { preserveView: true });
  };
  bind('down', 'global', 'ArrowRight', () => nextPrev(1));
  bind('down', 'global', 'ArrowDown', () => nextPrev(1));
  bind('down', 'global', 'ArrowLeft', () => nextPrev(-1));
  bind('down', 'global', 'ArrowUp', () => nextPrev(-1));

  // Note: Esc handling removed per request. Use on-screen UI to close dialogs.

  // Display mode bindings
  bind('down', MODES.DISPLAY, 'e', () => { setMode(MODES.EDIT); });
  bind('down', MODES.DISPLAY, 'm', () => { setMode(MODES.MEASURE); });
  // Toggle View window in standard (display) mode
  bind('down', MODES.DISPLAY, 'v', () => { toggleSide(); });
  // Toggle Coordinates window in standard (display) mode
  bind('down', MODES.DISPLAY, 'c', () => { setCoordsPanelOpen(!(coordsPanel && coordsPanel.classList.contains('open'))); });

  // Edit mode bindings
  bind('down', MODES.EDIT, 'e', () => { setMode(MODES.DISPLAY); });
  bind('down', MODES.EDIT, 'm', (e) => {
    if (e && e.shiftKey) {
      setMode(MODES.MEASURE);
      return;
    }
    setEditTool(EDIT_TOOL.ADD);
    setEditAddMode(EDIT_ADD_MODE.MOLECULE, { announce: true, syncSearch: true });
  });
  bind('down', MODES.EDIT, 's', () => { setEditTool(EDIT_TOOL.SELECT); });
  bind('down', MODES.EDIT, 'g', () => { setEditTool(EDIT_TOOL.MOVE); });
  bind('down', MODES.EDIT, 'f', () => {
    setEditTool(EDIT_TOOL.ADD);
    setEditAddMode(EDIT_ADD_MODE.FRAGMENT, { announce: true, syncSearch: true });
  });
  bind('down', MODES.EDIT, 'b', () => { setEditTool(EDIT_TOOL.BOND); });
  bind('down', MODES.EDIT, 't', () => { setEditTool(EDIT_TOOL.TRANSFORM); });
  bind('down', MODES.EDIT, 'd', () => { setEditTool(EDIT_TOOL.DELETE); });
  bind('down', MODES.EDIT, 'n', () => {
    setEditTool(EDIT_TOOL.ADD);
    setEditAddMode(EDIT_ADD_MODE.ATOM, { announce: true, syncSearch: true });
  });
  bind('down', MODES.EDIT, 'c', () => {
    setCoordsPanelOpen(!(coordsPanel && coordsPanel.classList.contains('open')));
  });
  bind('down', MODES.EDIT, '1', () => {
    if (editTool === EDIT_TOOL.ADD) setEditAddBondOrder(1);
    else if (editTool === EDIT_TOOL.BOND) setEditBondOrder(1);
    else setMoleculeStyle('default');
  });
  bind('down', MODES.EDIT, '2', () => {
    if (editTool === EDIT_TOOL.ADD) setEditAddBondOrder(2);
    else if (editTool === EDIT_TOOL.BOND) setEditBondOrder(2);
    else setMoleculeStyle('toon');
  });
  bind('down', MODES.EDIT, '3', () => {
    if (editTool === EDIT_TOOL.ADD) setEditAddBondOrder(3);
    else if (editTool === EDIT_TOOL.BOND) setEditBondOrder(3);
    else setMoleculeStyle('kit');
  });
  // In Add mode, "4" selects quadruple bond preview; otherwise keep Glossy shortcut disabled in edit mode.
  bind('down', MODES.EDIT, '4', (e) => {
    if (editTool === EDIT_TOOL.ADD) {
      setEditAddBondOrder(4);
      return;
    }
    if (editTool === EDIT_TOOL.BOND) {
      setEditBondOrder(4);
      return;
    }
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
  });
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
    if (editTool === EDIT_TOOL.ADD && editAddMode === EDIT_ADD_MODE.MOLECULE && moleculePlaceActive) {
      alignMoleculePlacementToAxis(axis);
      return;
    }
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
  bind('down', MODES.EDIT, 'Escape', () => {
    if (editTool !== EDIT_TOOL.TRANSFORM) return;
    if (!getActiveTransformSelectionIndices().length && !transformActive) return;
    clearTransformState();
    clearTransformSelection();
    setHintMessage('Transform selection cleared.');
  });

  // Measurement mode bindings
  bind('down', MODES.MEASURE, 'm', () => { setMode(MODES.DISPLAY); });
  bind('down', MODES.MEASURE, 'e', () => { setMode(MODES.EDIT); });
  bind('down', MODES.MEASURE, 'c', () => { setCoordsPanelOpen(!(coordsPanel && coordsPanel.classList.contains('open'))); });
  // Esc clears current measurement selection (but does not change mode)
  bind('down', MODES.MEASURE, 'Escape', () => { clearEditSelection(); updateSelectedHalos(); updateEditSelectionVisuals(); });

  // App default starts in display mode.
  setMode(MODES.DISPLAY);

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
    if (addAtomOperatorSession) finalizeAddAtomOperatorSession({ announce: false });
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
    if (currentMode === MODES.EDIT && addAtomOperatorSession) {
      if (e.key === 'Enter' && !isTypingInInput()) {
        e.preventDefault();
        finalizeAddAtomOperatorSession({ commit: true, announce: false });
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        finalizeAddAtomOperatorSession({ commit: false, announce: false });
        return;
      }
    }
    if (currentMode === MODES.EDIT
      && editTool === EDIT_TOOL.ADD
      && editAddMode === EDIT_ADD_MODE.MOLECULE
      && moleculePlaceActive) {
      if (e.key === 'Enter' && !isTypingInInput()) {
        e.preventDefault();
        commitMoleculePlacement();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        clearMoleculePlacementPreview();
        updateEditToolboxUi({ syncSearch: false });
        setHintMessage('Canceled molecule placement.');
        return;
      }
    }
    if (currentMode === MODES.EDIT
      && editTool === EDIT_TOOL.SELECT
      && (e.ctrlKey || e.metaKey)
      && !e.shiftKey
      && !e.altKey
      && String(e.key || '').toLowerCase() === 'a') {
      if (!isTypingInInput()) {
        e.preventDefault();
        selectAllEditAtoms();
        return;
      }
    }
    if (e.key === 'Escape' && currentMode === MODES.EDIT && editTool === EDIT_TOOL.ADD && editAddMode === EDIT_ADD_MODE.FRAGMENT && addFusePreviewState) {
      e.preventDefault();
      clearFuseRingPreview();
      updateEditToolboxUi({ syncSearch: false });
      setHintMessage('Canceled fuse-ring placement.');
      return;
    }
    if (e.key === 'Escape') {
      let closed = false;
      if (displayInspector && displayInspector.classList.contains('open')) {
        setDisplayInspectorOpen(false);
        closed = true;
      }
      if (viewInspector && viewInspector.classList.contains('open')) {
        setViewInspectorOpen(false);
        closed = true;
      }
      if (sidePanel && sidePanel.classList.contains('open')) {
        setViewPanelOpen(false);
        closed = true;
      }
      if (coordsPanel && coordsPanel.classList.contains('open')) {
        setCoordsPanelOpen(false);
        closed = true;
      }
      if (trajectoryPanel && trajectoryPanel.classList.contains('open')) {
        setTrajectoryPanelOpen(false);
        closed = true;
      }
      if (vibrationPanel && vibrationPanel.classList.contains('open')) {
        setVibrationPanelOpen(false);
        closed = true;
      }
      if (closed) {
        e.preventDefault();
        return;
      }
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
   * Synchronize independent molecule feature controls.
   */
  function syncMoleculeFeatureControlsState() {
    if (moleculeFogToggleEl) moleculeFogToggleEl.checked = !!moleculeFogEnabled;
    if (rowMoleculeFogDepth) rowMoleculeFogDepth.style.display = moleculeFogEnabled ? '' : 'none';
    if (moleculeFogDepthEl) moleculeFogDepthEl.value = getMoleculeFogDepth().toFixed(1);
    if (moleculeFogDepthValueEl) moleculeFogDepthValueEl.textContent = getMoleculeFogDepth().toFixed(1);
    if (moleculeInkToggleEl) moleculeInkToggleEl.checked = !!moleculeInkEnabled;
    if (moleculeBlackbodyToggleEl) moleculeBlackbodyToggleEl.checked = !!moleculeBlackbodyEnabled;
    if (moleculeAtomOpacityEl) moleculeAtomOpacityEl.value = Number(moleculeAtomOpacity).toFixed(2);
    if (moleculeBondOpacityEl) moleculeBondOpacityEl.value = Number(moleculeBondOpacity).toFixed(2);
    if (blackbodyColdColorEl) blackbodyColdColorEl.value = normalizeHexColor(moleculeBlackbodyColdColor, '#2f0202');
    if (blackbodyHotColorEl) blackbodyHotColorEl.value = normalizeHexColor(moleculeBlackbodyHotColor, '#eaf6ff');
    if (rowBlackbodyColors) rowBlackbodyColors.style.display = moleculeBlackbodyEnabled ? '' : 'none';
    syncColorPickerFields();
  }

  /**
   * Synchronize depth-of-field controls.
   */
  function syncDofControlState() {
    const enabled = !!dofState.enabled;
    const focusMode = getDofFocusMode();
    if (dofToggleEl) dofToggleEl.checked = enabled;
    syncConditionalControlState(
      rowDofFocusMode,
      dofFocusModeEl,
      enabled,
      'Choose how depth of field determines the focus plane',
      'Enable depth of field to change focus mode'
    );
    syncConditionalControlState(
      rowDofFocusDistance,
      dofFocusDistanceEl,
      enabled && focusMode === 'manual',
      'Manual focus distance from the camera in angstrom',
      'Available when Focus mode is Manual'
    );
    syncConditionalControlState(
      rowDofFocusRange,
      dofFocusRangeEl,
      enabled,
      'Half-width of the in-focus depth band in angstrom',
      'Enable depth of field to change focus range'
    );
    syncConditionalControlState(
      rowDofBlurAmount,
      dofBlurAmountEl,
      enabled,
      'Maximum blur radius in screen pixels',
      'Enable depth of field to change blur amount'
    );
    if (dofFocusModeEl) dofFocusModeEl.value = focusMode;
    if (dofFocusDistanceEl) dofFocusDistanceEl.value = getDofFocusDistance().toFixed(1);
    if (dofFocusRangeEl) dofFocusRangeEl.value = getDofFocusRange().toFixed(1);
    if (dofBlurAmountEl) dofBlurAmountEl.value = getDofBlurAmount().toFixed(2);
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
   * Bind one DOF numeric control.
   * @param {HTMLInputElement|null} inputEl
   * @param {() => number} getValue
   * @param {(n:number) => void} setValue
   */
  function bindDofNumericControl(inputEl, getValue, setValue) {
    bindClampedNumericInput(
      inputEl,
      getValue,
      setValue,
      () => false
    );
  }

  /**
   * Apply lighting and control-state updates that depend on `moleculeStyle`.
   */
  function applyMoleculeStyleUiState() {
    applyMoleculeStyleLighting();
    syncSurfaceStyleControlState();
    syncGlossyStyleControlsState();
    syncMoleculeFeatureControlsState();
    syncDofControlState();
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
  bindClampedNumericInput(
    moleculeAtomOpacityEl,
    () => Math.max(0.05, Math.min(1, Number.isFinite(moleculeAtomOpacity) ? moleculeAtomOpacity : 1)),
    (n) => { moleculeAtomOpacity = n; },
    () => true
  );
  bindClampedNumericInput(
    moleculeBondOpacityEl,
    () => Math.max(0.05, Math.min(1, Number.isFinite(moleculeBondOpacity) ? moleculeBondOpacity : 1)),
    (n) => { moleculeBondOpacity = n; },
    () => true
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
  if (moleculeFogToggleEl) {
    moleculeFogToggleEl.onchange = () => {
      moleculeFogEnabled = !!moleculeFogToggleEl.checked;
      applyMoleculeStyleUiState();
    };
  }
  if (moleculeFogDepthEl) {
    const applyFogDepth = () => {
      const parsed = Number(moleculeFogDepthEl.value);
      if (Number.isFinite(parsed)) moleculeFogDepth = parsed;
      moleculeFogDepth = getMoleculeFogDepth();
      moleculeFogDepthEl.value = moleculeFogDepth.toFixed(1);
      if (moleculeFogDepthValueEl) moleculeFogDepthValueEl.textContent = moleculeFogDepth.toFixed(1);
      applyMoleculeStyleLighting();
    };
    applyFogDepth();
    moleculeFogDepthEl.oninput = applyFogDepth;
    moleculeFogDepthEl.onchange = applyFogDepth;
  }
  if (moleculeInkToggleEl) {
    moleculeInkToggleEl.onchange = () => {
      moleculeInkEnabled = !!moleculeInkToggleEl.checked;
      applyMoleculeStyleUiState();
      rebuildScene({ preserveView: true });
    };
  }
  if (moleculeBlackbodyToggleEl) {
    moleculeBlackbodyToggleEl.onchange = () => {
      moleculeBlackbodyEnabled = !!moleculeBlackbodyToggleEl.checked;
      applyMoleculeStyleUiState();
      rebuildScene({ preserveView: true });
    };
  }
  if (blackbodyColdColorEl) {
    const applyCold = () => {
      moleculeBlackbodyColdColor = normalizeHexColor(blackbodyColdColorEl.value, moleculeBlackbodyColdColor);
      blackbodyColdColorEl.value = moleculeBlackbodyColdColor;
      syncColorPickerFields();
      if (moleculeBlackbodyEnabled) rebuildScene({ preserveView: true });
    };
    blackbodyColdColorEl.oninput = applyCold;
    blackbodyColdColorEl.onchange = applyCold;
  }
  if (blackbodyHotColorEl) {
    const applyHot = () => {
      moleculeBlackbodyHotColor = normalizeHexColor(blackbodyHotColorEl.value, moleculeBlackbodyHotColor);
      blackbodyHotColorEl.value = moleculeBlackbodyHotColor;
      syncColorPickerFields();
      if (moleculeBlackbodyEnabled) rebuildScene({ preserveView: true });
    };
    blackbodyHotColorEl.oninput = applyHot;
    blackbodyHotColorEl.onchange = applyHot;
  }
  if (twoComponentModeSelect) {
    twoComponentModeSelect.onchange = () => {
      const comp = twoComponentModeSelect.value;
      applyGlobal2CComponent(comp);
      rebuildScene({ preserveView: true });
    };
  }
  if (moldenMoSelect) {
    moldenMoSelect.onchange = () => {
      const record = currentIndex >= 0 ? volumes[currentIndex] : null;
      const vol = record && record.vol;
      const molden = vol && vol.kind === 'molden' && vol.molden ? vol.molden : null;
      if (!record || !molden || !Array.isArray(molden.mos) || molden.mos.length === 0) return;
      let next = parseInt(moldenMoSelect.value, 10);
      if (!Number.isInteger(next) || next < 0 || next >= molden.mos.length) next = 0;
      record.moldenMoIndex = next;
      moldenMoSummary.textContent = formatMoldenMoSummary(
        molden.mos[next],
        molden.mos.length,
        Number.isFinite(molden.basisCount) ? molden.basisCount : 0
      );
      rebuildScene({ preserveView: true });
      if (moldenGridSummary) moldenGridSummary.textContent = formatMoldenGridSummary(record);
      setHintMessage(`Selected Molden MO ${next + 1} of ${molden.mos.length}.`);
    };
  }
  if (moldenGridStepEl || moldenGridPaddingEl) {
    const applyMoldenGridUi = () => {
      const record = currentIndex >= 0 ? volumes[currentIndex] : null;
      const vol = record && record.vol;
      if (!record || !vol || vol.kind !== 'molden') return;
      record.moldenGridStepAng = normalizeMoldenGridStepAng(moldenGridStepEl && moldenGridStepEl.value);
      record.moldenGridPaddingAng = normalizeMoldenGridPaddingAng(moldenGridPaddingEl && moldenGridPaddingEl.value);
      if (moldenGridStepEl) moldenGridStepEl.value = record.moldenGridStepAng.toFixed(2);
      if (moldenGridPaddingEl) moldenGridPaddingEl.value = record.moldenGridPaddingAng.toFixed(1);
      if (moldenGridSummary) moldenGridSummary.textContent = formatMoldenGridSummary(record);
      rebuildScene({ preserveView: true });
      if (moldenGridSummary) moldenGridSummary.textContent = formatMoldenGridSummary(record);
      setHintMessage(`Updated Molden grid: step ${record.moldenGridStepAng.toFixed(2)} Å, padding ${record.moldenGridPaddingAng.toFixed(1)} Å.`);
    };
    if (moldenGridStepEl) {
      moldenGridStepEl.onchange = applyMoldenGridUi;
    }
    if (moldenGridPaddingEl) {
      moldenGridPaddingEl.onchange = applyMoldenGridUi;
    }
  }

  if (dofToggleEl) {
    dofToggleEl.onchange = () => {
      dofState.enabled = !!dofToggleEl.checked;
      if (!dofState.enabled) disposeDofRenderTarget();
      syncDofControlState();
    };
  }
  if (dofFocusModeEl) {
    dofFocusModeEl.onchange = () => {
      dofState.focusMode = dofFocusModeEl.value === 'manual' ? 'manual' : 'auto';
      syncDofControlState();
    };
  }
  bindDofNumericControl(dofFocusDistanceEl, getDofFocusDistance, (n) => {
    dofState.focusDistance = Math.max(0.5, Math.min(80, Number.isFinite(n) ? n : getDofFocusDistance()));
  });
  bindDofNumericControl(dofFocusRangeEl, getDofFocusRange, (n) => {
    dofState.focusRange = Math.max(0.1, Math.min(20, Number.isFinite(n) ? n : getDofFocusRange()));
  });
  bindDofNumericControl(dofBlurAmountEl, getDofBlurAmount, (n) => {
    dofState.blurAmount = Math.max(0, Math.min(12, Number.isFinite(n) ? n : getDofBlurAmount()));
  });
  syncDofControlState();

  // Default color schemes for +/- surfaces
  if (schemeSelect) {
    schemeSelect.onchange = () => {
      const v = schemeSelect.value;
      const s = SURFACE_COLOR_SCHEMES[v];
      if (s) {
        posColor.value = s.pos;
        negColor.value = s.neg;
        syncColorPickerFields();
        updateOpacityAndColors();
      }
    };
  }

  // Render mode / cloud params
  renderMode = (renderModeSel && renderModeSel.value) || renderMode;
  cloudType = (cloudTypeSel && cloudTypeSel.value) || cloudType;
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
  const STRUCTURE_KIND = 'vibemol.structure';
  const STRUCTURE_VERSION = 1;
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
  const presetSettingSchema = new Map();
  let presetUnknownTop = {};
  let presetUnknownSettings = {};
  let presetName = 'VibeMol Preset';
  let presetMeta = {};
  let presetExtensions = {};

  /**
   * Normalize one builder operation log entry. Legacy index-based records are
   * accepted and upgraded in memory; new records retain stable ids.
   * @param {*} raw
   * @returns {object|null}
   */
  function normalizeBuilderOperationEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const entryId = normalizeFragmentId(raw.entryId || raw.fragmentId || raw.moleculeId);
    const entryKind = String(raw.entryKind || (raw.fragmentId ? CATALOG_KIND.FRAGMENT : '') || '').trim().toLowerCase()
      || (getCatalogEntryById(entryId, CATALOG_KIND.MOLECULE) ? CATALOG_KIND.MOLECULE : CATALOG_KIND.FRAGMENT);
    const attachPolicy = normalizeEditFragmentAttachPolicy(raw.attachPolicy || raw.attachMode);
    const out = {
      opId: String(raw.opId || '').trim() || allocateBuilderOpId(),
      timestamp: String(raw.timestamp || new Date().toISOString()),
      entryId,
      entryKind,
      attachPolicy,
      transform: cloneJsonLike(raw.transform) || null,
      resultingBondOrder: normalizeEditAddBondOrder(raw.resultingBondOrder || raw.preferredBondOrder || 1),
      omittedLocalAtomIndices: Array.isArray(raw.omittedLocalAtomIndices)
        ? raw.omittedLocalAtomIndices.map((v) => Number(v) | 0).filter((v) => v >= 0)
        : [],
      removedAtomIds: Array.isArray(raw.removedAtomIds)
        ? raw.removedAtomIds.map((v) => String(v || '').trim()).filter(Boolean)
        : [],
      addedAtomIds: Array.isArray(raw.addedAtomIds)
        ? raw.addedAtomIds.map((v) => String(v || '').trim()).filter(Boolean)
        : [],
    };
    if (Array.isArray(raw.hostBondAtomIds)) {
      const hostBondAtomIds = raw.hostBondAtomIds.map((v) => String(v || '').trim()).filter(Boolean);
      if (hostBondAtomIds.length >= 2) out.hostBondAtomIds = hostBondAtomIds.slice(0, 2);
    }
    if (raw.anchorAtomIdPre) out.anchorAtomIdPre = String(raw.anchorAtomIdPre).trim();
    if (raw.anchorAtomIdPost) out.anchorAtomIdPost = String(raw.anchorAtomIdPost).trim();
    if (Array.isArray(raw.removedAtomIndices)) out.removedAtomIndices = raw.removedAtomIndices.map((v) => Number(v) | 0).filter((v) => v >= 0);
    if (Array.isArray(raw.addedAtomIndices)) out.addedAtomIndices = raw.addedAtomIndices.map((v) => Number(v) | 0).filter((v) => v >= 0);
    if (Number.isInteger(raw.anchorIndexPre)) out.anchorIndexPre = Number(raw.anchorIndexPre) | 0;
    if (Number.isInteger(raw.anchorIndexPost)) out.anchorIndexPost = Number(raw.anchorIndexPost) | 0;
    if (Array.isArray(raw.hostBondIndices)) out.hostBondIndices = raw.hostBondIndices.map((v) => Number(v) | 0).filter((v) => v >= 0).slice(0, 2);
    if (raw.builderGroupId) {
      out.builderGroupId = String(raw.builderGroupId).trim();
      absorbObservedBuilderId(out.builderGroupId, 'group');
    } else {
      out.builderGroupId = allocateBuilderGroupId();
    }
    absorbObservedBuilderId(out.opId, 'op');
    return out;
  }

  /**
   * Serialize one builder operation to the ID-based preset format.
   * Legacy index fields are intentionally omitted from export.
   * @param {*} raw
   * @returns {object|null}
   */
  function serializeBuilderOperationEntry(raw) {
    const op = normalizeBuilderOperationEntry(raw);
    if (!op) return null;
    const out = {
      opId: op.opId,
      timestamp: op.timestamp,
      entryId: op.entryId,
      entryKind: op.entryKind,
      attachPolicy: op.attachPolicy,
      transform: cloneJsonLike(op.transform) || null,
      resultingBondOrder: op.resultingBondOrder,
      omittedLocalAtomIndices: Array.isArray(op.omittedLocalAtomIndices) ? op.omittedLocalAtomIndices.slice() : [],
      removedAtomIds: Array.isArray(op.removedAtomIds) ? op.removedAtomIds.slice() : [],
      addedAtomIds: Array.isArray(op.addedAtomIds) ? op.addedAtomIds.slice() : [],
      builderGroupId: op.builderGroupId,
    };
    if (op.anchorAtomIdPre) out.anchorAtomIdPre = op.anchorAtomIdPre;
    if (op.anchorAtomIdPost) out.anchorAtomIdPost = op.anchorAtomIdPost;
    if (Array.isArray(op.hostBondAtomIds) && op.hostBondAtomIds.length) out.hostBondAtomIds = op.hostBondAtomIds.slice(0, 2);
    return out;
  }

  /**
   * Resolve builder metadata for atoms from stored operation logs.
   * This does not replay geometry; it only reattaches ids/group tags when
   * present or derivable from the currently loaded atom order.
   * @param {*} vol
   */
  function rehydrateBuilderStateForVolume(vol) {
    if (!vol || !Array.isArray(vol.atoms)) return;
    ensureVolumeAtomIds(vol);
    const atoms = vol.atoms;
    const byAtomId = getBuilderAnnotationsMap(vol, true);
    const liveIds = new Set();
    for (const atom of atoms) {
      if (!atom || typeof atom !== 'object') continue;
      absorbObservedBuilderId(atom.id, 'atom');
      liveIds.add(String(atom.id || ''));
    }
    for (const atomId of Object.keys(byAtomId || {})) {
      if (!liveIds.has(atomId)) delete byAtomId[atomId];
    }
    if (!Array.isArray(vol.fragmentOps)) {
      vol.fragmentOps = [];
      return;
    }
    const normalizedOps = [];
    for (const raw of vol.fragmentOps) {
      const op = normalizeBuilderOperationEntry(raw);
      if (!op) continue;
      if ((!Array.isArray(op.addedAtomIds) || !op.addedAtomIds.length) && Array.isArray(op.addedAtomIndices)) {
        op.addedAtomIds = op.addedAtomIndices
          .map((idx) => (atoms[idx] ? ensureAtomId(atoms[idx]) : ''))
          .filter(Boolean);
      }
      if (!op.anchorAtomIdPost && Number.isInteger(op.anchorIndexPost) && atoms[op.anchorIndexPost]) {
        op.anchorAtomIdPost = ensureAtomId(atoms[op.anchorIndexPost]);
      }
      if (!op.anchorAtomIdPre && Number.isInteger(op.anchorIndexPre) && atoms[op.anchorIndexPre]) {
        op.anchorAtomIdPre = ensureAtomId(atoms[op.anchorIndexPre]);
      }
      if ((!Array.isArray(op.hostBondAtomIds) || !op.hostBondAtomIds.length) && Array.isArray(op.hostBondIndices)) {
        op.hostBondAtomIds = op.hostBondIndices
          .map((idx) => (atoms[idx] ? ensureAtomId(atoms[idx]) : ''))
          .filter(Boolean)
          .slice(0, 2);
      }
      const addedIds = Array.isArray(op.addedAtomIds) ? op.addedAtomIds : [];
      for (const atom of atoms) {
        if (!atom || !addedIds.includes(String(atom.id || ''))) continue;
        setAtomBuilderMeta(vol, atom, {
          groupId: op.builderGroupId,
          entryId: op.entryId,
          entryKind: op.entryKind,
        });
      }
      normalizedOps.push(op);
    }
    vol.fragmentOps = normalizedOps;
  }

  /**
   * Remove builder operations that no longer reference live atoms.
   * This keeps fragment-scope transform fallback stable after deletes/reloads.
   * @param {*} vol
   * @returns {boolean}
   */
  function pruneBuilderOperationsForVolume(vol) {
    if (!vol || !Array.isArray(vol.atoms)) return false;
    ensureVolumeAtomIds(vol);
    if (!Array.isArray(vol.fragmentOps)) {
      vol.fragmentOps = [];
      return false;
    }
    const liveIds = new Set(vol.atoms.map((atom) => String(ensureAtomId(atom))));
    const nextOps = [];
    let changed = false;
    for (const raw of vol.fragmentOps) {
      const op = normalizeBuilderOperationEntry(raw);
      if (!op) {
        changed = true;
        continue;
      }
      const nextAddedAtomIds = Array.isArray(op.addedAtomIds)
        ? op.addedAtomIds.map((id) => String(id || '').trim()).filter((id) => liveIds.has(id))
        : [];
      if (nextAddedAtomIds.length === 0) {
        changed = true;
        continue;
      }
      if (nextAddedAtomIds.length !== (Array.isArray(op.addedAtomIds) ? op.addedAtomIds.length : 0)) changed = true;
      op.addedAtomIds = nextAddedAtomIds;
      if (Array.isArray(op.hostBondAtomIds)) {
        const nextHostBondAtomIds = op.hostBondAtomIds
          .map((id) => String(id || '').trim())
          .filter((id) => liveIds.has(id))
          .slice(0, 2);
        if (nextHostBondAtomIds.length !== op.hostBondAtomIds.length) changed = true;
        if (nextHostBondAtomIds.length >= 2) op.hostBondAtomIds = nextHostBondAtomIds;
        else delete op.hostBondAtomIds;
      }
      if (op.anchorAtomIdPost && !liveIds.has(String(op.anchorAtomIdPost))) {
        delete op.anchorAtomIdPost;
        changed = true;
      }
      nextOps.push(op);
    }
    if (changed || nextOps.length !== vol.fragmentOps.length) vol.fragmentOps = nextOps;
    rehydrateBuilderStateForVolume(vol);
    return changed || nextOps.length !== vol.fragmentOps.length;
  }

  /**
   * Read fragment operation map from preset extensions.
   * @returns {Record<string, any[]>}
   */
  function getBuilderFragmentOpsByFileFromExtensions() {
    const builder = (presetExtensions && typeof presetExtensions === 'object') ? presetExtensions.builder : null;
    if (!builder || typeof builder !== 'object') return {};
    const map = builder.fragmentOpsByFile;
    if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
    return map;
  }

  /**
   * Apply stored builder logs from preset extensions to currently loaded files.
   * This restores in-memory operation history but intentionally does not replay ops.
   */
  function applyBuilderExtensionToLoadedVolumes() {
    const map = getBuilderFragmentOpsByFileFromExtensions();
    for (const record of volumes) {
      if (!record || !record.vol) continue;
      const key = String(record.name || '').trim();
      const stored = key && Array.isArray(map[key]) ? map[key] : null;
      if (stored) record.vol.fragmentOps = cloneJsonLike(stored) || [];
      else if (!Array.isArray(record.vol.fragmentOps)) record.vol.fragmentOps = [];
      pruneBuilderOperationsForVolume(record.vol);
    }
  }

  /**
   * Merge loaded-volume fragment logs into preset extensions for export.
   * Unknown file keys from previously loaded presets are preserved.
   */
  function syncBuilderExtensionFromVolumes() {
    const existingBuilder = (presetExtensions && typeof presetExtensions === 'object' && presetExtensions.builder && typeof presetExtensions.builder === 'object')
      ? cloneJsonLike(presetExtensions.builder)
      : {};
    const existingMap = (existingBuilder && existingBuilder.fragmentOpsByFile && typeof existingBuilder.fragmentOpsByFile === 'object' && !Array.isArray(existingBuilder.fragmentOpsByFile))
      ? cloneJsonLike(existingBuilder.fragmentOpsByFile)
      : {};
    for (const record of volumes) {
      if (!record || !record.vol) continue;
      const key = String(record.name || '').trim();
      if (!key) continue;
      if (Array.isArray(record.vol.fragmentOps) && record.vol.fragmentOps.length > 0) {
        existingMap[key] = record.vol.fragmentOps
          .map((raw) => serializeBuilderOperationEntry(raw))
          .filter(Boolean)
          .map((op) => cloneJsonLike(op));
      } else {
        delete existingMap[key];
      }
    }
    if (!presetExtensions || typeof presetExtensions !== 'object' || Array.isArray(presetExtensions)) presetExtensions = {};
    presetExtensions.builder = Object.assign({}, existingBuilder || {}, {
      version: 1,
      fragmentOpsByFile: existingMap,
    });
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
   * Keep atom-numbering availability in sync with atom-label visibility.
   * When labels are off, numbering is forced off and the control is disabled.
   */
  function syncAtomLabelNumberToggleState() {
    const labelsEnabled = !!showAtomLabels;
    if (!labelsEnabled) showAtomLabelNumbers = false;
    if (toggleAtomLabels) toggleAtomLabels.checked = labelsEnabled;
    if (toggleAtomLabelNumbers) {
      toggleAtomLabelNumbers.checked = !!showAtomLabelNumbers && labelsEnabled;
      toggleAtomLabelNumbers.disabled = !labelsEnabled;
      toggleAtomLabelNumbers.setAttribute('aria-disabled', labelsEnabled ? 'false' : 'true');
      const chip = toggleAtomLabelNumbers.closest('.toggleChip');
      if (chip) chip.style.opacity = labelsEnabled ? '1' : '0.55';
    }
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
   * Convert `#rrggbb` to RGB triplet.
   * @param {string} hex
   * @returns {[number, number, number]}
   */
  function hexToRgbTriplet(hex) {
    const h = asHexColor(hex, '#000000');
    return [
      parseInt(h.slice(1, 3), 16),
      parseInt(h.slice(3, 5), 16),
      parseInt(h.slice(5, 7), 16),
    ];
  }

  /**
   * Read current UI accent color from CSS custom properties.
   * @returns {string}
   */
  function getCurrentAccentHexColor() {
    const root = document.documentElement;
    const inlineValue = root && root.style ? root.style.getPropertyValue('--vm-accent') : '';
    const computedValue = root ? getComputedStyle(root).getPropertyValue('--vm-accent') : '';
    const fallback = '#2373eb';
    return asHexColor((inlineValue || computedValue || '').trim(), fallback);
  }

  /**
   * Apply accent palette overrides to CSS custom properties.
   * This keeps soft/outline accent variants in sync with the main accent color.
   * @param {*} value
   * @returns {string}
   */
  function applyAccentPaletteFromHex(value) {
    const root = document.documentElement;
    if (!root || !root.style) return getCurrentAccentHexColor();
    const normalized = asHexColor(value, getCurrentAccentHexColor());
    const [r, g, b] = hexToRgbTriplet(normalized);
    root.style.setProperty('--vm-accent', normalized);
    root.style.setProperty('--vm-accent-soft', `rgba(${r}, ${g}, ${b}, 0.18)`);
    root.style.setProperty('--vm-accent-outline', `rgba(${r}, ${g}, ${b}, 0.22)`);
    return normalized;
  }

  /**
   * Register one setting key in the preset registry.
   * @param {string} key
   * @param {() => any} getter
   * @param {(value:any) => void} setter
   * @param {{section?:string,type?:string,description?:string}=} options
   */
  function registerPresetSetting(key, getter, setter, options = {}) {
    const section = (typeof options.section === 'string' && options.section.trim()) ? options.section.trim() : String(key).split('.')[0];
    const type = (typeof options.type === 'string' && options.type.trim()) ? options.type.trim() : 'any';
    const description = (typeof options.description === 'string') ? options.description : '';
    presetSettingRegistry.set(key, { get: getter, set: setter });
    presetSettingSchema.set(key, Object.freeze({ key, section, type, description }));
  }

  /**
   * Export a stable snapshot of the preset schema metadata.
   * @returns {{key:string,section:string,type:string,description:string}[]}
   */
  function listPresetSettingSchema() {
    return Array.from(presetSettingSchema.values()).map((entry) => Object.assign({}, entry));
  }

  registerPresetSetting('surface.iso', () => asFiniteNumber(isoInput && isoInput.value, 0.02), (value) => {
    const n = Math.max(0, asFiniteNumber(value, 0.02));
    if (isoInput) isoInput.value = String(n);
  });
  registerPresetSetting('surface.opacity', () => asFiniteNumber(opInput && opInput.value, 1), (value) => {
    const n = Math.min(1, Math.max(0.05, asFiniteNumber(value, 1)));
    const snapped = Math.round(n / 0.05) * 0.05;
    if (opInput) opInput.value = snapped.toFixed(2);
    updateOpacityPercentLabel();
  });
  registerPresetSetting('surface.enabled', () => !!showSurfaces, (value) => { showSurfaces = asBoolean(value); });
  registerPresetSetting('surface.style', () => surfaceStyle, (value) => {
    const next = (value === 'glass' || value === 'emissive') ? value : 'emissive';
    surfaceStyle = next;
    if (styleSelect) styleSelect.value = next;
  });
  registerPresetSetting('surface.autoIsoEnabled', () => !!autoIsoEnabled, (value) => {
    autoIsoEnabled = asBoolean(value);
    updateAutoIsoButtonState();
  });
  registerPresetSetting('surface.posColor', () => (posColor && posColor.value) || DEFAULT_POS_SURFACE_COLOR, (value) => {
    if (posColor) posColor.value = asHexColor(value, posColor.value || DEFAULT_POS_SURFACE_COLOR);
    if (schemeSelect) schemeSelect.value = 'custom';
    syncColorPickerFields();
  });
  registerPresetSetting('surface.negColor', () => (negColor && negColor.value) || DEFAULT_NEG_SURFACE_COLOR, (value) => {
    if (negColor) negColor.value = asHexColor(value, negColor.value || DEFAULT_NEG_SURFACE_COLOR);
    if (schemeSelect) schemeSelect.value = 'custom';
    syncColorPickerFields();
  });
  registerPresetSetting('surface.colorScheme', () => (schemeSelect && schemeSelect.value) || 'custom', (value) => {
    if (!schemeSelect) return;
    const options = new Set(Array.from(schemeSelect.options).map((o) => o.value));
    const next = (typeof value === 'string' && options.has(value)) ? value : 'custom';
    schemeSelect.value = next;
    if (next !== 'custom' && typeof schemeSelect.onchange === 'function') schemeSelect.onchange();
  });
  registerPresetSetting('global.backgroundColor', () => (bgColor && bgColor.value) || UI_PALETTE.white, (value) => {
    if (!bgColor) return;
    bgColor.value = asHexColor(value, bgColor.value || UI_PALETTE.white);
    syncColorPickerFields();
    try { scene.background = new THREE.Color(bgColor.value); } catch { }
  });
  registerPresetSetting(
    'global.accentColor',
    () => getCurrentAccentHexColor(),
    (value) => { applyAccentPaletteFromHex(value); },
    { section: 'global', type: 'color', description: 'Primary UI accent color.' }
  );
  registerPresetSetting('global.showAtoms', () => !!(toggleAtoms && toggleAtoms.checked), (value) => {
    if (toggleAtoms) toggleAtoms.checked = asBoolean(value);
  });
  registerPresetSetting('global.showAtomLabels', () => !!showAtomLabels, (value) => {
    showAtomLabels = asBoolean(value);
    syncAtomLabelNumberToggleState();
  });
  registerPresetSetting('global.showAtomLabelNumbers', () => !!showAtomLabelNumbers, (value) => {
    showAtomLabelNumbers = asBoolean(value);
    syncAtomLabelNumberToggleState();
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
  registerPresetSetting('molecule.feature.fog', () => !!moleculeFogEnabled, (value) => {
    moleculeFogEnabled = asBoolean(value);
    applyMoleculeStyleUiState();
  });
  registerPresetSetting('molecule.feature.fog.depth', () => getMoleculeFogDepth(), (value) => {
    moleculeFogDepth = Math.max(6.0, Math.min(40.0, asFiniteNumber(value, getMoleculeFogDepth())));
    if (moleculeFogDepthEl) moleculeFogDepthEl.value = moleculeFogDepth.toFixed(1);
    if (moleculeFogDepthValueEl) moleculeFogDepthValueEl.textContent = moleculeFogDepth.toFixed(1);
    applyMoleculeStyleUiState();
  });
  registerPresetSetting('molecule.feature.blackbody.enabled', () => !!moleculeBlackbodyEnabled, (value) => {
    moleculeBlackbodyEnabled = asBoolean(value);
    applyMoleculeStyleUiState();
  });
  registerPresetSetting('molecule.feature.blackbody.coldColor', () => moleculeBlackbodyColdColor, (value) => {
    moleculeBlackbodyColdColor = asHexColor(value, moleculeBlackbodyColdColor || '#2f0202');
    if (blackbodyColdColorEl) blackbodyColdColorEl.value = moleculeBlackbodyColdColor;
    applyMoleculeStyleUiState();
  });
  registerPresetSetting('molecule.feature.blackbody.hotColor', () => moleculeBlackbodyHotColor, (value) => {
    moleculeBlackbodyHotColor = asHexColor(value, moleculeBlackbodyHotColor || '#eaf6ff');
    if (blackbodyHotColorEl) blackbodyHotColorEl.value = moleculeBlackbodyHotColor;
    applyMoleculeStyleUiState();
  });
  registerPresetSetting('molecule.feature.ink', () => !!moleculeInkEnabled, (value) => {
    moleculeInkEnabled = asBoolean(value);
    applyMoleculeStyleUiState();
  });
  registerPresetSetting('molecule.opacity.atom', () => moleculeAtomOpacity, (value) => {
    moleculeAtomOpacity = Math.max(0.05, Math.min(1, asFiniteNumber(value, moleculeAtomOpacity)));
    applyMoleculeStyleUiState();
  });
  registerPresetSetting('molecule.opacity.bond', () => moleculeBondOpacity, (value) => {
    moleculeBondOpacity = Math.max(0.05, Math.min(1, asFiniteNumber(value, moleculeBondOpacity)));
    applyMoleculeStyleUiState();
  });
  registerPresetSetting('builder.cleanup.auto', () => !!editAutoCleanupEnabled, (value) => {
    editAutoCleanupEnabled = asBoolean(value);
    updateEditCleanupUiState();
  }, { section: 'builder', type: 'boolean', description: 'Apply local fragment cleanup automatically after append/replace-H.' });
  registerPresetSetting('builder.cleanup.bondLength', () => !!editCleanupBondLengthEnabled, (value) => {
    editCleanupBondLengthEnabled = asBoolean(value);
    updateEditCleanupUiState();
  }, { section: 'builder', type: 'boolean', description: 'Reassert the anchor bond length during local fragment cleanup.' });
  registerPresetSetting('builder.cleanup.overlapRelief', () => !!editCleanupOverlapEnabled, (value) => {
    editCleanupOverlapEnabled = asBoolean(value);
    updateEditCleanupUiState();
  }, { section: 'builder', type: 'boolean', description: 'Shift newly added fragment atoms outward to reduce severe overlaps.' });
  registerPresetSetting('builder.cleanup.strength', () => normalizeEditCleanupStrength(editCleanupStrength), (value) => {
    editCleanupStrength = normalizeEditCleanupStrength(value);
    updateEditCleanupUiState();
  }, { section: 'builder', type: 'number', description: 'Strength of the lightweight local fragment cleanup pass.' });
  registerPresetSetting('builder.transformCleanup.auto', () => !!editTransformAutoCleanupEnabled, (value) => {
    editTransformAutoCleanupEnabled = asBoolean(value);
    updateEditToolboxUi({ syncSearch: false });
  }, { section: 'builder', type: 'boolean', description: 'Apply lightweight cleanup automatically after transform gestures.' });
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
  registerPresetSetting('render.dof.enabled', () => !!dofState.enabled, (value) => {
    dofState.enabled = asBoolean(value);
    if (!dofState.enabled) disposeDofRenderTarget();
    syncDofControlState();
  });
  registerPresetSetting('render.dof.focusMode', () => getDofFocusMode(), (value) => {
    dofState.focusMode = value === 'manual' ? 'manual' : 'auto';
    syncDofControlState();
  });
  registerPresetSetting('render.dof.focusDistance', () => getDofFocusDistance(), (value) => {
    dofState.focusDistance = Math.max(0.5, Math.min(80, asFiniteNumber(value, getDofFocusDistance())));
    syncDofControlState();
  });
  registerPresetSetting('render.dof.focusRange', () => getDofFocusRange(), (value) => {
    dofState.focusRange = Math.max(0.1, Math.min(20, asFiniteNumber(value, getDofFocusRange())));
    syncDofControlState();
  });
  registerPresetSetting('render.dof.blurAmount', () => getDofBlurAmount(), (value) => {
    dofState.blurAmount = Math.max(0, Math.min(12, asFiniteNumber(value, getDofBlurAmount())));
    syncDofControlState();
  });
  registerPresetSetting('twoComponent.mode', () => global2CComponentMode, (value) => {
    const next = (typeof value === 'string' && value) ? value : DEFAULT_2C_COMPONENT_MODE;
    applyGlobal2CComponent(next);
    if (twoComponentModeSelect) twoComponentModeSelect.value = next;
  });
  const viewShiftBindings = [
    { axis: 'x', input: shiftX },
    { axis: 'y', input: shiftY },
    { axis: 'z', input: shiftZ },
  ];
  for (const { axis, input } of viewShiftBindings) {
    registerPresetSetting(`view.shift.${axis}`, () => contentGroup.position[axis], (value) => {
      contentGroup.position[axis] = asFiniteNumber(value, contentGroup.position[axis]);
      if (input) input.value = Number(contentGroup.position[axis]).toFixed(3);
    }, { section: 'view', type: 'number' });
  }
  for (const axis of ['x', 'y', 'z']) {
    registerPresetSetting(`view.camera.${axis}`, () => camera.position[axis], (value) => {
      camera.position[axis] = asFiniteNumber(value, camera.position[axis]);
    }, { section: 'view', type: 'number' });
  }
  for (const axis of ['x', 'y', 'z']) {
    registerPresetSetting(`view.target.${axis}`, () => controls.target[axis], (value) => {
      controls.target[axis] = asFiniteNumber(value, controls.target[axis]);
    }, { section: 'view', type: 'number' });
  }
  registerPresetSetting('view.projection', () => viewState.mode, (value) => {
    const next = value === 'orthographic' ? 'orthographic' : 'perspective';
    setProjectionMode(next, { refreshUi: false });
  });
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
  registerPresetSetting('vibration.modeIndex', () => {
    const info = getActiveVibrationInfo();
    return info.enabled ? (info.vib.modeIndex | 0) : 0;
  }, (value) => {
    const info = getActiveVibrationInfo();
    if (!info.enabled) return;
    info.vib.modeIndex = Math.max(0, Math.min(info.modeCount - 1, Math.round(asFiniteNumber(value, info.vib.modeIndex || 0))));
    info.vib.phase = 0;
    if (info.record === volumes[currentIndex] && !getActiveTrajectoryInfo().enabled) {
      applyActiveVibrationPhase(0, { syncUi: false });
    }
    syncVibrationControls();
  });
  registerPresetSetting('vibration.amplitude', () => {
    const info = getActiveVibrationInfo();
    return info.enabled ? Number(info.vib.amplitude) : VIBRATION_DEFAULT_AMPLITUDE;
  }, (value) => {
    const info = getActiveVibrationInfo();
    if (!info.enabled) return;
    info.vib.amplitude = Math.max(0, Math.min(8, asFiniteNumber(value, info.vib.amplitude || VIBRATION_DEFAULT_AMPLITUDE)));
    if (info.record === volumes[currentIndex] && !getActiveTrajectoryInfo().enabled) {
      applyActiveVibrationPhase(info.vib.phase || 0, { syncUi: false });
    }
    syncVibrationControls();
  });
  registerPresetSetting('vibration.speed', () => {
    const info = getActiveVibrationInfo();
    return info.enabled ? Number(info.vib.speed) : VIBRATION_DEFAULT_SPEED;
  }, (value) => {
    const info = getActiveVibrationInfo();
    if (!info.enabled) return;
    info.vib.speed = Math.max(0.1, Math.min(30, asFiniteNumber(value, info.vib.speed || VIBRATION_DEFAULT_SPEED)));
    syncVibrationControls();
  });
  registerPresetSetting('vibration.hideSmallFrequencies', () => !!vibrationHideSmallFrequencies, (value) => {
    vibrationHideSmallFrequencies = asBoolean(value);
    if (vibrationHideLowFreqEl) vibrationHideLowFreqEl.checked = !!vibrationHideSmallFrequencies;
    syncVibrationControls();
  });

  /**
   * Export current app settings as a portable preset envelope.
   * Unknown fields from an imported preset are preserved on round-trip.
   * @param {{name?:string}=} options
   */
  function exportPresetEnvelope(options = {}) {
    syncBuilderExtensionFromVolumes();
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
    applyBuilderExtensionToLoadedVolumes();
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
   * Build a reproducible structure-download filename for one record.
   * @param {{name?:string}|null} record
   * @returns {string}
   */
  function buildStructureDownloadFilename(record) {
    const rawName = String(record && record.name || 'structure').trim() || 'structure';
    const safeName = rawName
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    const base = safeName.replace(/\.[^/.]+$/, '') || 'structure';
    return `${base}.structure.json`;
  }

  /**
   * Save the active structure as a reproducible JSON document.
   */
  function saveCurrentStructureToFile() {
    const record = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null;
    if (!record || !record.vol) {
      setHintMessage('No active structure to save.');
      return;
    }
    const text = `${JSON.stringify(exportActiveStructureEnvelope(), null, 2)}\n`;
    const blob = new Blob([text], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = buildStructureDownloadFilename(record);
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    setHintMessage(`Saved structure: ${link.download}`);
  }

  /**
   * Parse and apply one preset JSON payload.
   * @param {string} text
   * @param {string=} sourceLabel
   * @returns {{name:string,warnings:string[]}}
   */
  function importPresetFromText(text, sourceLabel = 'preset') {
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error(`${sourceLabel}: invalid JSON`);
    }
    const result = importPresetEnvelope(parsed, { mode: PRESET_MODE.RELAXED });
    if (result.warnings.length > 0) console.warn('[Preset] import warnings', result.warnings);
    return result;
  }

  /**
   * Export one volume to the reproducible structure-document payload.
   * @param {*} vol
   * @returns {*}
   */
  function exportStructureVolume(vol) {
    const clone = rehydrateClonedVolume(cloneStructuredData(vol));
    ensureVolumeSchema(clone);
    return cloneJsonStructuredData(clone);
  }

  /**
   * Export the active record as a versioned structure document.
   * @returns {object}
   */
  function exportActiveStructureEnvelope() {
    const record = (currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null;
    if (!record || !record.vol) throw new Error('No active structure is loaded.');
    return {
      kind: STRUCTURE_KIND,
      structureVersion: STRUCTURE_VERSION,
      appVersion: APP_VERSION,
      name: String(record.name || 'structure').trim() || 'structure',
      meta: {
        source: 'web',
        exportedAt: new Date().toISOString(),
      },
      volume: exportStructureVolume(record.vol),
      recordState: {
        measurementLabelOffsets: cloneJsonStructuredData(record.measurementLabelOffsets || {}),
        pubchemMeta: cloneJsonStructuredData(record.pubchemMeta || null),
      },
    };
  }

  /**
   * Parse one structure-document JSON payload.
   * @param {string} text
   * @param {string=} sourceLabel
   * @returns {{name:string,vol:*,extras:object}}
   */
  function parseStructureEnvelopeText(text, sourceLabel = 'structure') {
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`${sourceLabel}: invalid JSON`);
    }
    if (!isPlainObject(parsed)) throw new Error(`${sourceLabel}: structure payload must be an object.`);
    if (String(parsed.kind || '') !== STRUCTURE_KIND) {
      throw new Error(`${sourceLabel}: unexpected structure kind "${String(parsed.kind || '')}".`);
    }
    const version = Number(parsed.structureVersion);
    if (Number.isFinite(version) && version > STRUCTURE_VERSION) {
      throw new Error(`${sourceLabel}: structure version ${version} is newer than supported ${STRUCTURE_VERSION}.`);
    }
    const name = String(parsed.name || sourceLabel || 'structure').trim() || 'structure';
    if (!isPlainObject(parsed.volume)) throw new Error(`${sourceLabel}: missing "volume" object.`);
    const vol = rehydrateClonedVolume(cloneStructuredData(parsed.volume));
    ensureVolumeSchema(vol);
    const recordState = isPlainObject(parsed.recordState) ? parsed.recordState : {};
    const extras = {};
    if (isPlainObject(recordState.measurementLabelOffsets)) extras.measurementLabelOffsets = cloneJsonLike(recordState.measurementLabelOffsets) || {};
    if (isPlainObject(recordState.pubchemMeta)) extras.pubchemMeta = cloneJsonLike(recordState.pubchemMeta) || null;
    return { name, vol, extras };
  }

  /**
   * Load one structure-document text payload into the app.
   * @param {string} text
   * @param {string=} sourceLabel
   * @returns {{name:string,vol:*}}
   */
  function loadStructureFromText(text, sourceLabel = 'structure') {
    const imported = parseStructureEnvelopeText(text, sourceLabel);
    clearPlaceholderVolumesForUserLoad();
    const startIndex = volumes.length;
    appendParsedVolumeRecord(getUniqueVolumeName(imported.name), imported.vol, Object.assign({}, imported.extras || {}, { skipBuilderExtensionMerge: true }));
    finalizeLoadedVolumes(startIndex, {
      resetIsoToDefault: hasVolumetricGrid(imported.vol),
      skipAutoIsoOnInitialRebuild: hasVolumetricGrid(imported.vol),
    });
    return imported;
  }

  // Public API for browser automation and future integrations.
  window.VibeMolPreset = Object.freeze({
    kind: PRESET_KIND,
    version: PRESET_VERSION,
    listKeys: () => Array.from(presetSettingRegistry.keys()),
    listSchema: () => listPresetSettingSchema(),
    export: (options = {}) => exportPresetEnvelope(options),
    import: (preset, options = {}) => importPresetEnvelope(preset, options),
  });

  window.VibeMolStructure = Object.freeze({
    kind: STRUCTURE_KIND,
    version: STRUCTURE_VERSION,
    exportActive: () => exportActiveStructureEnvelope(),
    exportActiveText: () => `${JSON.stringify(exportActiveStructureEnvelope(), null, 2)}\n`,
    parseText: (text, sourceLabel = 'structure') => parseStructureEnvelopeText(text, sourceLabel),
    importFromText: (text, sourceLabel = 'structure') => loadStructureFromText(text, sourceLabel),
  });

  if (savePresetBtn) savePresetBtn.onclick = () => saveCurrentPresetToFile();
  if (saveStructureBtn) saveStructureBtn.onclick = () => saveCurrentStructureToFile();

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
  if (trajectoryPlayBtn) {
    let suppressNextTrajectoryClick = false;
    const toggleTrajectoryFromControl = (evt) => {
      if (evt && evt.preventDefault) evt.preventDefault();
      if (evt && evt.stopPropagation) evt.stopPropagation();
      const info = getActiveTrajectoryInfo();
      if (!info.enabled) return;
      const nextPlaying = !trajectoryPlaying;
      if (nextPlaying) {
        vibrationPlaying = false;
        vibrationLastStepMs = 0;
        restoreActiveVibrationEquilibrium({ syncUi: false });
      }
      trajectoryPlaying = nextPlaying;
      trajectoryLastStepMs = 0;
      syncTrajectoryControls();
      syncVibrationControls();
    };
    trajectoryPlayBtn.addEventListener('pointerdown', (evt) => {
      suppressNextTrajectoryClick = true;
      toggleTrajectoryFromControl(evt);
    });
    trajectoryPlayBtn.addEventListener('click', (evt) => {
      if (suppressNextTrajectoryClick) {
        suppressNextTrajectoryClick = false;
        return;
      }
      toggleTrajectoryFromControl(evt);
    });
  }
  if (trajectoryResetBtn) {
    trajectoryResetBtn.onclick = () => {
      const info = getActiveTrajectoryInfo();
      if (!info.enabled) return;
      vibrationPlaying = false;
      vibrationLastStepMs = 0;
      restoreActiveVibrationEquilibrium({ syncUi: false });
      stopTrajectoryPlayback({ syncUi: false });
      applyTrajectoryFrame(0, { syncUi: true });
      syncVibrationControls();
    };
  }
  if (trajectoryFrameEl) {
    trajectoryFrameEl.oninput = () => {
      vibrationPlaying = false;
      vibrationLastStepMs = 0;
      restoreActiveVibrationEquilibrium({ syncUi: false });
      stopTrajectoryPlayback({ syncUi: false });
      const idx = Number(trajectoryFrameEl.value);
      applyTrajectoryFrame(idx, { syncUi: true });
      syncVibrationControls();
    };
  }
  if (trajectoryFpsEl) {
    trajectoryFpsEl.onchange = () => {
      const info = getActiveTrajectoryInfo();
      if (!info.enabled) return;
      const n = Math.max(1, Math.min(120, Math.round(toNum(trajectoryFpsEl.value, info.traj.fps || 12))));
      info.traj.fps = n;
      trajectoryFpsEl.value = String(n);
      syncTrajectoryControls();
    };
  }
  if (trajectoryLoopEl) {
    trajectoryLoopEl.onchange = () => {
      const info = getActiveTrajectoryInfo();
      if (!info.enabled) return;
      info.traj.loop = !!trajectoryLoopEl.checked;
      syncTrajectoryControls();
    };
  }
  if (vibrationPlayBtn) {
    vibrationPlayBtn.onclick = () => {
      const info = getActiveVibrationInfo();
      if (!info.enabled) return;
      const nextPlaying = !vibrationPlaying;
      if (nextPlaying) {
        stopTrajectoryPlayback({ syncUi: false });
      }
      vibrationPlaying = nextPlaying;
      vibrationLastStepMs = 0;
      if (!nextPlaying) applyActiveVibrationPhase(info.vib.phase || 0, { syncUi: false });
      syncTrajectoryControls();
      syncVibrationControls();
    };
  }
  if (vibrationResetBtn) {
    vibrationResetBtn.onclick = () => {
      vibrationPlaying = false;
      vibrationLastStepMs = 0;
      restoreActiveVibrationEquilibrium({ syncUi: true });
    };
  }
  if (vibrationModeTableBody) {
    vibrationModeTableBody.onclick = (e) => {
      const row = e.target && e.target.closest ? e.target.closest('tr[data-mode-index]') : null;
      if (!row) return;
      const info = getActiveVibrationInfo();
      if (!info.enabled) return;
      const modeIndex = Number(row.getAttribute('data-mode-index'));
      if (!Number.isInteger(modeIndex) || modeIndex < 0 || modeIndex >= info.modeCount) return;
      const playBtn = e.target && e.target.closest ? e.target.closest('button[data-action=\"play\"]') : null;
      const sameMode = modeIndex === (info.vib.modeIndex | 0);
      const shouldTogglePlayback = !!playBtn && sameMode;

      info.vib.modeIndex = modeIndex;
      info.vib.phase = 0;
      stopTrajectoryPlayback({ syncUi: false });
      if (shouldTogglePlayback) {
        vibrationPlaying = !vibrationPlaying;
      } else {
        vibrationPlaying = true;
      }
      vibrationLastStepMs = 0;
      applyActiveVibrationPhase(0, { syncUi: false });
      syncTrajectoryControls();
      syncVibrationControls();
    };
  }
  if (vibrationAmplitudeEl) {
    vibrationAmplitudeEl.onchange = () => {
      const info = getActiveVibrationInfo();
      if (!info.enabled) return;
      const n = Math.max(0, Math.min(8, toNum(vibrationAmplitudeEl.value, info.vib.amplitude || VIBRATION_DEFAULT_AMPLITUDE)));
      info.vib.amplitude = n;
      vibrationAmplitudeEl.value = n.toFixed(2);
      applyActiveVibrationPhase(info.vib.phase || 0, { syncUi: true });
    };
  }
  if (vibrationSpeedEl) {
    vibrationSpeedEl.onchange = () => {
      const info = getActiveVibrationInfo();
      if (!info.enabled) return;
      const n = Math.max(0.1, Math.min(30, toNum(vibrationSpeedEl.value, info.vib.speed || VIBRATION_DEFAULT_SPEED)));
      info.vib.speed = n;
      vibrationSpeedEl.value = n.toFixed(2);
      syncVibrationControls();
    };
  }
  if (vibrationHideLowFreqEl) {
    vibrationHideLowFreqEl.checked = !!vibrationHideSmallFrequencies;
    vibrationHideLowFreqEl.onchange = () => {
      vibrationHideSmallFrequencies = !!vibrationHideLowFreqEl.checked;
      syncVibrationControls();
    };
  }

  /**
   * Normalize coordinates display units to supported values.
   * @param {string} units
   * @returns {'angstrom'|'bohr'}
   */
  function normalizeCoordsDisplayUnits(units) {
    return (String(units || '').toLowerCase() === 'bohr') ? 'bohr' : 'angstrom';
  }

  /**
   * Convert one display-space coordinate value back into the volume's native units.
   * @param {*} vol
   * @param {number} value
   * @returns {number}
   */
  function coordsDisplayValueToNative(vol, value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return NaN;
    const displayUnits = normalizeCoordsDisplayUnits(coordsDisplayUnits);
    if (displayUnits === 'bohr') {
      return vol && vol.units === 'angstrom' ? n * BOHR_TO_ANG : n;
    }
    return vol && vol.units === 'bohr' ? n * ANG_TO_BOHR : n;
  }

  /**
   * Return one atom coordinate in the currently displayed coordinates units.
   * @param {*} vol
   * @param {*} atom
   * @param {'x'|'y'|'zCoord'} field
   * @returns {number}
   */
  function getCoordsDisplayValue(vol, atom, field) {
    if (!atom) return 0;
    const raw = field === 'x' ? Number(atom.x) : field === 'y' ? Number(atom.y) : Number(atom.z);
    if (!Number.isFinite(raw)) return 0;
    const displayUnits = normalizeCoordsDisplayUnits(coordsDisplayUnits);
    if (displayUnits === 'bohr') {
      return vol && vol.units === 'angstrom' ? raw * ANG_TO_BOHR : raw;
    }
    return vol && vol.units === 'bohr' ? raw * BOHR_TO_ANG : raw;
  }

  /**
   * Deep-clone one trajectory state for undoable coordinate-panel edits.
   * @param {*} traj
   * @returns {*|null}
   */
  function cloneTrajectoryState(traj) {
    if (!traj || !Array.isArray(traj.frames)) return null;
    return {
      frames: traj.frames.map((frame) => new Float32Array(frame)),
      comments: Array.isArray(traj.comments) ? traj.comments.slice() : [],
      frameIndex: Number.isFinite(Number(traj.frameIndex)) ? Number(traj.frameIndex) | 0 : 0,
      fps: Number.isFinite(Number(traj.fps)) ? Number(traj.fps) : 12,
      loop: traj.loop !== false,
    };
  }

  /**
   * Deep-clone one vibration state for undoable coordinate-panel edits.
   * @param {*} vib
   * @returns {*|null}
   */
  function cloneVibrationState(vib) {
    if (!vib || !Array.isArray(vib.modes)) return null;
    return {
      kind: vib.kind,
      sourceName: vib.sourceName || '',
      units: vib.units || 'angstrom',
      atomCount: Number(vib.atomCount) || 0,
      atomSymbols: Array.isArray(vib.atomSymbols) ? vib.atomSymbols.slice() : null,
      modes: vib.modes.map((mode, idx) => ({
        label: mode && mode.label ? String(mode.label) : `Mode ${idx + 1}`,
        frequencyCm1: Number.isFinite(Number(mode && mode.frequencyCm1)) ? Number(mode.frequencyCm1) : NaN,
        irIntensityKmMol: Number.isFinite(Number(mode && mode.irIntensityKmMol)) ? Number(mode.irIntensityKmMol) : NaN,
        displacements: new Float32Array(mode && mode.displacements ? mode.displacements : []),
      })),
      modeIndex: Number.isFinite(Number(vib.modeIndex)) ? Number(vib.modeIndex) | 0 : 0,
      amplitude: Number.isFinite(Number(vib.amplitude)) ? Number(vib.amplitude) : VIBRATION_DEFAULT_AMPLITUDE,
      speed: Number.isFinite(Number(vib.speed)) ? Number(vib.speed) : VIBRATION_DEFAULT_SPEED,
      phase: Number.isFinite(Number(vib.phase)) ? Number(vib.phase) : 0,
      equilibrium: vib.equilibrium ? new Float32Array(vib.equilibrium) : null,
      frameBuffer: vib.frameBuffer ? new Float32Array(vib.frameBuffer) : null,
    };
  }

  /**
   * Deep-clone one Molden metadata state for undoable coordinate-panel edits.
   * Atom reordering must preserve basis-to-atom index mapping.
   * @param {*} molden
   * @returns {*|null}
   */
  function cloneMoldenState(molden) {
    if (!molden || typeof molden !== 'object') return null;
    return {
      atomUnit: molden.atomUnit || '',
      angularFlags: cloneJsonLike(molden.angularFlags) || {},
      basis: molden.basis ? {
        atomBlocks: Array.isArray(molden.basis.atomBlocks)
          ? molden.basis.atomBlocks.map((block) => ({
            atomIndex: Number(block && block.atomIndex) || 0,
            shells: Array.isArray(block && block.shells)
              ? block.shells.map((shell) => cloneJsonLike(shell) || {})
              : [],
          }))
          : [],
        aoCount: Number(molden.basis.aoCount) || 0,
      } : null,
      basisCount: Number(molden.basisCount) || 0,
      moCount: Number(molden.moCount) || 0,
      mos: Array.isArray(molden.mos)
        ? molden.mos.map((mo) => ({
          symmetry: mo && mo.symmetry ? String(mo.symmetry) : '',
          energy: Number.isFinite(Number(mo && mo.energy)) ? Number(mo.energy) : null,
          spin: mo && mo.spin ? String(mo.spin) : '',
          occupation: Number.isFinite(Number(mo && mo.occupation)) ? Number(mo.occupation) : null,
          coefficients: new Float32Array(mo && mo.coefficients ? mo.coefficients : []),
        }))
        : [],
    };
  }

  /**
   * Snapshot one active record state relevant to coordinates-panel editing.
   * @param {*} vol
   * @returns {{atoms:Array<object>,trajectory:*|null,vibration:*|null,molden:*|null}}
   */
  function cloneCoordsPanelEditState(vol) {
    return {
      atoms: cloneAtomsSnapshot(vol),
      trajectory: cloneTrajectoryState(vol && vol.trajectory),
      vibration: cloneVibrationState(vol && vol.vibration),
      molden: cloneMoldenState(vol && vol.molden),
    };
  }

  /**
   * Restore one coordinates-panel edit snapshot to a record.
   * @param {*} record
   * @param {{atoms:Array<object>,trajectory:*|null,vibration:*|null,molden:*|null}} snapshot
   * @returns {boolean}
   */
  function applyCoordsPanelEditState(record, snapshot) {
    if (!record || !record.vol || !snapshot || !Array.isArray(snapshot.atoms)) return false;
    const idx = volumes.indexOf(record);
    if (idx < 0) return false;
    const vol = record.vol;
    vol.atoms = snapshot.atoms.map((a) => normalizeVolumeAtom(a));
    if (snapshot.trajectory) vol.trajectory = cloneTrajectoryState(snapshot.trajectory);
    else delete vol.trajectory;
    if (snapshot.vibration) vol.vibration = cloneVibrationState(snapshot.vibration);
    else delete vol.vibration;
    if (snapshot.molden) vol.molden = cloneMoldenState(snapshot.molden);
    else delete vol.molden;
    vol.natoms = vol.atoms.length;
    ensureVolumeSchema(vol, { inferMissingBonds: false });
    trajectoryPlaying = false;
    trajectoryLastStepMs = 0;
    vibrationPlaying = false;
    vibrationLastStepMs = 0;
    syncBuilderExtensionFromVolumes();
    currentIndex = idx;
    clearTransientInteractionState();
    syncActiveVolumeControls();
    rebuildScene({ preserveView: true });
    updateSidePanel();
    return true;
  }

  /**
   * Record one reversible coordinates-panel edit, including atom-indexed auxiliary data.
   * @param {*} record
   * @param {{atoms:Array<object>,trajectory:*|null,vibration:*|null,molden:*|null}} before
   * @param {{atoms:Array<object>,trajectory:*|null,vibration:*|null,molden:*|null}} after
   * @param {string} label
   */
  function pushCoordsPanelEditHistoryEntry(record, before, after, label) {
    if (!record || !before || !after || !Array.isArray(before.atoms) || !Array.isArray(after.atoms)) return;
    if (atomsSnapshotsEqual(before.atoms, after.atoms)) return;
    const command = {
      type: 'coords_panel_edit',
      record,
      before,
      after,
      label: String(label || 'Edit coordinates'),
      at: Date.now(),
      undo() { return applyCoordsPanelEditState(record, before); },
      redo() { return applyCoordsPanelEditState(record, after); },
    };
    editState.pushHistoryCommand(command);
  }

  /**
   * Finish one coordinates-panel edit by recording history and refreshing the scene.
   * @param {*} record
   * @param {{atoms:Array<object>,trajectory:*|null,vibration:*|null,molden:*|null}} beforeState
   * @param {string} actionLabel
   */
  function finalizeCoordsPanelEdit(record, beforeState, actionLabel) {
    if (!record || !record.vol || !beforeState) return;
    const vol = record.vol;
    vol.natoms = Array.isArray(vol.atoms) ? vol.atoms.length : 0;
    const afterState = cloneCoordsPanelEditState(vol);
    pushCoordsPanelEditHistoryEntry(record, beforeState, afterState, actionLabel);
    trajectoryPlaying = false;
    trajectoryLastStepMs = 0;
    vibrationPlaying = false;
    vibrationLastStepMs = 0;
    clearTransientInteractionState();
    rebuildScene({ preserveView: true });
    updateSidePanel();
  }

  /**
   * Reorder one flat xyzxyz... triple array according to a newIndex->oldIndex order map.
   * @param {Float32Array|number[]|null} source
   * @param {number[]} order
   * @returns {Float32Array|null}
   */
  function reorderAtomTriplesByOrder(source, order) {
    if (!source || !Array.isArray(order)) return null;
    const out = new Float32Array(order.length * 3);
    for (let newIdx = 0; newIdx < order.length; newIdx++) {
      const oldIdx = order[newIdx] | 0;
      out[3 * newIdx + 0] = Number(source[3 * oldIdx + 0]) || 0;
      out[3 * newIdx + 1] = Number(source[3 * oldIdx + 1]) || 0;
      out[3 * newIdx + 2] = Number(source[3 * oldIdx + 2]) || 0;
    }
    return out;
  }

  /**
   * Build a newIndex->oldIndex atom order map for one move in the coordinates table.
   * @param {number} count
   * @param {number} fromIndex
   * @param {number} toIndex
   * @returns {number[]}
   */
  function buildAtomMoveOrder(count, fromIndex, toIndex) {
    const order = Array.from({ length: Math.max(0, count | 0) }, (_, idx) => idx);
    if (!(fromIndex >= 0 && fromIndex < order.length && toIndex >= 0 && toIndex < order.length)) return order;
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);
    return order;
  }

  /**
   * Apply one atom-order permutation to all atom-indexed auxiliary structures.
   * @param {*} vol
   * @param {number[]} order newIndex -> oldIndex
   */
  function applyAtomOrderToVolumeAuxState(vol, order) {
    if (!vol || !Array.isArray(order) || order.length === 0) return;
    const oldToNew = new Int32Array(order.length);
    for (let newIdx = 0; newIdx < order.length; newIdx++) oldToNew[order[newIdx] | 0] = newIdx;

    if (vol.trajectory && Array.isArray(vol.trajectory.frames)) {
      vol.trajectory.frames = vol.trajectory.frames.map((frame) => reorderAtomTriplesByOrder(frame, order) || new Float32Array(order.length * 3));
      vol.trajectory.frameIndex = Math.max(0, Math.min(vol.trajectory.frames.length - 1, Number(vol.trajectory.frameIndex) | 0));
    }
    if (vol.vibration && Array.isArray(vol.vibration.modes)) {
      if (Array.isArray(vol.vibration.atomSymbols)) {
        vol.vibration.atomSymbols = order.map((oldIdx) => String(vol.vibration.atomSymbols[oldIdx] || ''));
      }
      if (vol.vibration.equilibrium) {
        vol.vibration.equilibrium = reorderAtomTriplesByOrder(vol.vibration.equilibrium, order);
      }
      if (vol.vibration.frameBuffer) {
        vol.vibration.frameBuffer = reorderAtomTriplesByOrder(vol.vibration.frameBuffer, order);
      }
      vol.vibration.modes = vol.vibration.modes.map((mode) => ({
        ...mode,
        displacements: reorderAtomTriplesByOrder(mode && mode.displacements, order) || new Float32Array(order.length * 3),
      }));
      vol.vibration.atomCount = order.length;
      vol.vibration.modeIndex = Math.max(0, Math.min(vol.vibration.modes.length - 1, Number(vol.vibration.modeIndex) | 0));
    }
    if (vol.molden && vol.molden.basis && Array.isArray(vol.molden.basis.atomBlocks)) {
      for (const block of vol.molden.basis.atomBlocks) {
        const oldIndex = Number(block && block.atomIndex);
        if (Number.isInteger(oldIndex) && oldIndex >= 0 && oldIndex < oldToNew.length) {
          block.atomIndex = oldToNew[oldIndex];
        }
      }
    }
  }

  /**
   * Sync trajectory/vibration state after direct atom edits from the coordinates panel.
   * @param {*} vol
   */
  function syncVolumeAuxStateAfterCoordsEdit(vol) {
    if (!vol || !Array.isArray(vol.atoms)) return;
    const atomCount = vol.atoms.length;
    if (vol.trajectory && Array.isArray(vol.trajectory.frames) && vol.trajectory.frames.length) {
      const frameIndex = Math.max(0, Math.min(vol.trajectory.frames.length - 1, Number(vol.trajectory.frameIndex) | 0));
      vol.trajectory.frameIndex = frameIndex;
      vol.trajectory.frames[frameIndex] = snapshotAtomCoordinates(vol, atomCount);
    }
    if (vol.vibration && Array.isArray(vol.vibration.modes)) {
      vol.vibration.atomCount = atomCount;
      vol.vibration.atomSymbols = getVolumeAtomSymbols(vol);
      vol.vibration.phase = 0;
      vol.vibration.equilibrium = snapshotAtomCoordinates(vol, atomCount);
      vol.vibration.frameBuffer = new Float32Array(vol.vibration.equilibrium);
      vol.vibration.modeIndex = Math.max(0, Math.min(vol.vibration.modes.length - 1, Number(vol.vibration.modeIndex) | 0));
    }
  }

  /**
   * Update row hover in the Coordinates panel and mirror it into scene atom hover.
   * @param {number} atomIndex
   */
  function setCoordsHoveredAtomIndex(atomIndex) {
    const nextIndex = Number.isInteger(atomIndex) ? atomIndex : -1;
    if (coordsHoveredAtomIndex === nextIndex) return;
    if (coordsContent) {
      const prevRow = coordsContent.querySelector(`tr.coordsRowHovered[data-atom-index="${coordsHoveredAtomIndex}"]`);
      if (prevRow) prevRow.classList.remove('coordsRowHovered');
    }
    coordsHoveredAtomIndex = nextIndex;
    if (coordsContent && coordsHoveredAtomIndex >= 0) {
      const row = coordsContent.querySelector(`tr[data-atom-index="${coordsHoveredAtomIndex}"]`);
      if (row) row.classList.add('coordsRowHovered');
    }
    const record = currentIndex >= 0 ? volumes[currentIndex] : null;
    const mesh = (record && record.vol && Array.isArray(record.vol.atoms) && atomGroup && atomGroup.children && coordsHoveredAtomIndex >= 0)
      ? atomGroup.children[coordsHoveredAtomIndex]
      : null;
    setBondHover(null);
    setSurfaceHover(null);
    hideSurfaceHoverLabel();
    setHover(mesh && mesh.isMesh ? mesh : null);
  }

  /**
   * Close one in-place coordinates-table editor without mutating data.
   */
  function cancelCoordsInlineEdit() {
    if (!coordsInlineEditState) return;
    coordsInlineEditState = null;
    updateSidePanel();
  }

  /**
   * Start editing one coordinates-table cell inline.
   * @param {number} atomIndex
   * @param {'order'|'sym'|'z'|'x'|'y'|'zCoord'} field
   * @param {HTMLElement} cell
   */
  function beginCoordsInlineEdit(atomIndex, field, cell) {
    const record = currentIndex >= 0 ? volumes[currentIndex] : null;
    const vol = record && record.vol;
    if (!record || !vol || !Array.isArray(vol.atoms) || atomIndex < 0 || atomIndex >= vol.atoms.length || !cell) return;
    if (coordsInlineEditState) cancelCoordsInlineEdit();
    const atom = vol.atoms[atomIndex];
    const input = document.createElement('input');
    input.className = 'coordsCellEditor';
    if (field === 'sym') input.type = 'text';
    else input.type = 'number';
    if (field === 'order' || field === 'z') {
      input.step = '1';
      input.min = '1';
      input.inputMode = 'numeric';
    } else if (field === 'x' || field === 'y' || field === 'zCoord') {
      input.step = '0.001';
    }
    if (field === 'order') input.value = String(atomIndex + 1);
    else if (field === 'sym') input.value = getElementSymbol(atom.Z | 0);
    else if (field === 'z') input.value = String(atom.Z | 0);
    else input.value = getCoordsDisplayValue(vol, atom, field).toFixed(6).replace(/0+$/u, '').replace(/\.$/u, '');
    cell.innerHTML = '';
    cell.appendChild(input);
    coordsInlineEditState = { atomIndex, field, cell, input };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void commitCoordsInlineEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelCoordsInlineEdit();
      }
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    });
    input.addEventListener('click', (e) => {
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    });
    input.addEventListener('blur', () => { void commitCoordsInlineEdit(); });
    input.focus();
    input.select();
  }

  /**
   * Commit the currently active inline coordinates-table edit.
   */
  function commitCoordsInlineEdit() {
    const state = coordsInlineEditState;
    if (!state) return;
    coordsInlineEditState = null;
    const record = currentIndex >= 0 ? volumes[currentIndex] : null;
    const vol = record && record.vol;
    if (!record || !vol || !Array.isArray(vol.atoms)) {
      updateSidePanel();
      return;
    }
    const atomIndex = state.atomIndex | 0;
    if (atomIndex < 0 || atomIndex >= vol.atoms.length) {
      updateSidePanel();
      return;
    }
    const atom = vol.atoms[atomIndex];
    const rawValue = String(state.input && state.input.value || '').trim();
    if (!rawValue) {
      updateSidePanel();
      return;
    }
    const beforeState = cloneCoordsPanelEditState(vol);
    let actionLabel = '';
    if (state.field === 'order') {
      const nextOrder = Math.trunc(Number(rawValue));
      if (!Number.isInteger(nextOrder) || nextOrder <= 0 || nextOrder > vol.atoms.length) {
        setHintMessage(`Atom number must be between 1 and ${vol.atoms.length}.`);
        updateSidePanel();
        return;
      }
      const targetIndex = nextOrder - 1;
      if (targetIndex === atomIndex) {
        updateSidePanel();
        return;
      }
      const order = buildAtomMoveOrder(vol.atoms.length, atomIndex, targetIndex);
      const [movedAtom] = vol.atoms.splice(atomIndex, 1);
      vol.atoms.splice(targetIndex, 0, movedAtom);
      applyAtomOrderToVolumeAuxState(vol, order);
      syncVolumeAuxStateAfterCoordsEdit(vol);
      actionLabel = `Renumber atom ${atomIndex + 1} → ${nextOrder}`;
    } else if (state.field === 'sym') {
      const nextZ = resolveElementQueryToZ(rawValue);
      if (!Number.isInteger(nextZ) || nextZ <= 0 || !ATOM_Z_TO_DATA || !ATOM_Z_TO_DATA[nextZ]) {
        setHintMessage(`Invalid element symbol or name: "${rawValue}".`);
        updateSidePanel();
        return;
      }
      if ((atom.Z | 0) === nextZ) {
        updateSidePanel();
        return;
      }
      atom.Z = nextZ;
      syncVolumeAuxStateAfterCoordsEdit(vol);
      actionLabel = `Change atom ${atomIndex + 1} element to ${getElementSymbol(nextZ)}`;
    } else if (state.field === 'z') {
      const nextZ = Math.trunc(Number(rawValue));
      if (!Number.isInteger(nextZ) || nextZ <= 0 || !ATOM_Z_TO_DATA || !ATOM_Z_TO_DATA[nextZ]) {
        setHintMessage(`Atomic number must be a valid element between 1 and ${Object.keys(ATOM_Z_TO_DATA || {}).length}.`);
        updateSidePanel();
        return;
      }
      if ((atom.Z | 0) === nextZ) {
        updateSidePanel();
        return;
      }
      atom.Z = nextZ;
      syncVolumeAuxStateAfterCoordsEdit(vol);
      actionLabel = `Change atom ${atomIndex + 1} atomic number to ${nextZ}`;
    } else {
      const nextValue = coordsDisplayValueToNative(vol, Number(rawValue));
      if (!Number.isFinite(nextValue)) {
        setHintMessage(`Coordinate must be numeric: "${rawValue}".`);
        updateSidePanel();
        return;
      }
      const axis = state.field === 'x' ? 'x' : state.field === 'y' ? 'y' : 'z';
      if (Math.abs((Number(atom[axis]) || 0) - nextValue) <= 1e-12) {
        updateSidePanel();
        return;
      }
      atom[axis] = nextValue;
      syncVolumeAuxStateAfterCoordsEdit(vol);
      actionLabel = `Edit atom ${atomIndex + 1} ${axis}`;
    }
    finalizeCoordsPanelEdit(record, beforeState, actionLabel);
    setHintMessage(`${actionLabel}.`);
  }

  /**
   * Update Coordinates-window unit labels and button text.
   */
  function syncCoordsUnitsUi() {
    const units = normalizeCoordsDisplayUnits(coordsDisplayUnits);
    if (coordsPanelTitle) {
      coordsPanelTitle.textContent = units === 'bohr' ? 'Coordinates (bohr)' : 'Coordinates (Å)';
    }
    if (coordsUnitsBtn) {
      const next = units === 'bohr' ? 'Å' : 'Bohr';
      coordsUnitsBtn.textContent = next;
      coordsUnitsBtn.title = units === 'bohr'
        ? 'Show coordinates in angstrom'
        : 'Show coordinates in bohr';
      coordsUnitsBtn.setAttribute('aria-label', units === 'bohr'
        ? 'Switch coordinates to angstrom'
        : 'Switch coordinates to bohr');
    }
  }

  /**
   * Refresh coordinates panel contents for the active file.
   */
  function updateSidePanel() {
    const record = currentIndex >= 0 ? volumes[currentIndex] : null;
    coordsInlineEditState = null;
    coordsHoveredAtomIndex = -1;
    syncCoordsUnitsUi();
    coordsContent.innerHTML = renderCoordsContent(
      record,
      BOHR_TO_ANG,
      window.ATOM_Z_TO_DATA,
      normalizeCoordsDisplayUnits(coordsDisplayUnits)
    );
    updatePubChemMetadataPanel(record);
    updateMoldenMoControls(record);
    syncTrajectoryControls();
    syncVibrationControls();
    updateAutoIsoButtonState();
  }

  /**
   * Resolve one auto-iso estimate for one record and apply it to iso input.
   * Delegates to the extracted auto-iso controller.
   * @param {*} record
   * @param {*} vol
   * @param {string} compMode
   * @returns {{iso:number,cached:boolean,stride:number,pending?:boolean}|null}
   */
  function applyAutoIsoToIsoInput(record, vol, compMode) {
    return autoIsoController.applyAutoIsoToIsoInput(record, vol, compMode);
  }

  /**
   * Build XYZ text for the active record.
   * @returns {string}
   */
  function toXYZString() {
    const record = currentIndex >= 0 ? volumes[currentIndex] : null;
    return volumeToXYZ(
      record,
      BOHR_TO_ANG,
      window.ATOM_Z_TO_DATA,
      normalizeCoordsDisplayUnits(coordsDisplayUnits)
    );
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

  if (coordsUnitsBtn) {
    coordsUnitsBtn.onclick = () => {
      coordsDisplayUnits = normalizeCoordsDisplayUnits(coordsDisplayUnits) === 'bohr' ? 'angstrom' : 'bohr';
      updateSidePanel();
    };
  }

  if (coordsContent) {
    coordsContent.addEventListener('mouseover', (e) => {
      const row = e.target && typeof e.target.closest === 'function'
        ? e.target.closest('tr[data-atom-index]')
        : null;
      if (!row || !coordsContent.contains(row)) {
        setCoordsHoveredAtomIndex(-1);
        return;
      }
      const atomIndex = Number.parseInt(String(row.dataset.atomIndex || ''), 10);
      setCoordsHoveredAtomIndex(Number.isInteger(atomIndex) ? atomIndex : -1);
    });

    coordsContent.addEventListener('mouseleave', () => {
      setCoordsHoveredAtomIndex(-1);
    });

    coordsContent.addEventListener('click', (e) => {
      if (e.target && typeof e.target.closest === 'function') {
        const editor = e.target.closest('.coordsCellEditor');
        if (editor) return;
      }
      const button = e.target && typeof e.target.closest === 'function'
        ? e.target.closest('.coordsCellButton')
        : null;
      if (!button || !coordsContent.contains(button)) return;
      const atomIndex = Number.parseInt(String(button.dataset.atomIndex || ''), 10);
      const field = String(button.dataset.editField || '');
      if (!Number.isInteger(atomIndex) || atomIndex < 0) return;
      if (!['order', 'sym', 'z', 'x', 'y', 'zCoord'].includes(field)) return;
      beginCoordsInlineEdit(atomIndex, field, button.parentElement || button);
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    });
  }

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
   * Detect whether one text payload looks like Psi4 output with vibrational data.
   * @param {string} text
   * @returns {boolean}
   */
  function looksLikePsi4OutputText(text) {
    const raw = String(text || '');
    return /Psi4:\s*An Open-Source Ab Initio Electronic Structure Package/i.test(raw)
      && /==>\s*Harmonic Vibrational Analysis\s*<==/i.test(raw)
      && /Geometry\s*\(in Angstrom\)/i.test(raw);
  }

  /**
   * Parse one ORCA numeric token including Fortran D exponents.
   * @param {*} token
   * @returns {number}
   */
  function parseOrcaNumberToken(token) {
    const raw = String(token == null ? '' : token).trim();
    if (!raw) return NaN;
    const normalized = raw.replace(/[dD]/g, 'e');
    return Number(normalized);
  }

  /**
   * Extract numeric values from one text line.
   * @param {string} line
   * @returns {number[]}
   */
  function extractOrcaLineNumbers(line) {
    const nums = [];
    const matches = String(line || '').match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eEdD][-+]?\d+)?/g) || [];
    for (const m of matches) {
      const n = parseOrcaNumberToken(m);
      if (Number.isFinite(n)) nums.push(n);
    }
    return nums;
  }

  /**
   * Find the line index where one ORCA section starts.
   * @param {string[]} lines
   * @param {string} sectionName
   * @returns {number}
   */
  function findOrcaSectionLine(lines, sectionName) {
    const target = `$${String(sectionName || '').trim().toLowerCase()}`;
    for (let i = 0; i < lines.length; i++) {
      if (String(lines[i] || '').trim().toLowerCase() === target) return i;
    }
    return -1;
  }

  /**
   * Parse atom symbols and coordinates from ORCA `$atoms` section.
   * Coordinates are in bohr when present in the Hessian payload.
   * @param {string[]} lines
   * @returns {{atomCount:number|null,atomSymbols:(string[]|null),atoms:(Array<{symbol:string,x:number,y:number,z:number}>|null)}}
   */
  function parseOrcaAtomsSection(lines) {
    const sectionLine = findOrcaSectionLine(lines, 'atoms');
    if (sectionLine < 0) return { atomCount: null, atomSymbols: null, atoms: null };
    let lineIdx = sectionLine + 1;
    while (lineIdx < lines.length && !String(lines[lineIdx] || '').trim()) lineIdx++;
    if (lineIdx >= lines.length || String(lines[lineIdx] || '').trim().startsWith('$')) {
      return { atomCount: null, atomSymbols: null, atoms: null };
    }
    const countNums = extractOrcaLineNumbers(lines[lineIdx]);
    const atomCount = countNums.length > 0 ? Math.round(countNums[0]) : NaN;
    if (!Number.isInteger(atomCount) || atomCount <= 0) {
      return { atomCount: null, atomSymbols: null, atoms: null };
    }
    lineIdx += 1;
    const atomSymbols = [];
    const atoms = [];
    let hasCoordinates = true;
    while (lineIdx < lines.length && atomSymbols.length < atomCount) {
      const raw = String(lines[lineIdx] || '').trim();
      if (!raw) { lineIdx += 1; continue; }
      if (raw.startsWith('$')) break;
      const parts = raw.split(/\s+/).filter(Boolean);
      const symbol = resolveElementSymbolToken(parts[0], parts[1]);
      if (!symbol) break;
      atomSymbols.push(symbol);
      if (hasCoordinates) {
        const x = parseOrcaNumberToken(parts[parts.length - 3]);
        const y = parseOrcaNumberToken(parts[parts.length - 2]);
        const z = parseOrcaNumberToken(parts[parts.length - 1]);
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          atoms.push({ symbol, x, y, z });
        } else {
          hasCoordinates = false;
        }
      }
      lineIdx += 1;
    }
    if (atomSymbols.length !== atomCount) return { atomCount, atomSymbols: null, atoms: null };
    return {
      atomCount,
      atomSymbols,
      atoms: hasCoordinates && atoms.length === atomCount ? atoms : null,
    };
  }

  /**
   * Parse ORCA `$vibrational_frequencies` section.
   * @param {string[]} lines
   * @param {string} sourceName
   * @returns {number[]}
   */
  function parseOrcaVibrationalFrequencies(lines, sourceName) {
    const sectionLine = findOrcaSectionLine(lines, 'vibrational_frequencies');
    if (sectionLine < 0) {
      throw new Error(`ORCA integration: missing $vibrational_frequencies section in "${sourceName}".`);
    }
    let lineIdx = sectionLine + 1;
    while (lineIdx < lines.length && !String(lines[lineIdx] || '').trim()) lineIdx++;
    if (lineIdx >= lines.length || String(lines[lineIdx] || '').trim().startsWith('$')) {
      throw new Error(`ORCA integration: missing vibrational frequency count in "${sourceName}".`);
    }
    const countNums = extractOrcaLineNumbers(lines[lineIdx]);
    const modeCount = countNums.length > 0 ? Math.round(countNums[0]) : NaN;
    if (!Number.isInteger(modeCount) || modeCount <= 0) {
      throw new Error(`ORCA integration: invalid vibrational frequency count in "${sourceName}".`);
    }
    lineIdx += 1;
    const frequencies = [];
    while (lineIdx < lines.length && frequencies.length < modeCount) {
      const raw = String(lines[lineIdx] || '').trim();
      if (!raw) { lineIdx += 1; continue; }
      if (raw.startsWith('$')) break;
      const nums = extractOrcaLineNumbers(raw);
      if (nums.length === 0) { lineIdx += 1; continue; }
      if (nums.length >= 2 && Math.abs(nums[0] - Math.round(nums[0])) < 1e-6) {
        frequencies.push(nums[nums.length - 1]);
      } else {
        for (const n of nums) {
          frequencies.push(n);
          if (frequencies.length >= modeCount) break;
        }
      }
      lineIdx += 1;
    }
    if (frequencies.length < modeCount) {
      throw new Error(`ORCA integration: expected ${modeCount} frequencies, found ${frequencies.length} in "${sourceName}".`);
    }
    return frequencies.slice(0, modeCount);
  }

  /**
   * Parse ORCA `$ir_spectrum` section and return per-mode IR intensities (km/mol).
   * Returns null when section is absent.
   * @param {string[]} lines
   * @returns {number[]|null}
   */
  function parseOrcaIrSpectrumIntensities(lines) {
    const sectionLine = findOrcaSectionLine(lines, 'ir_spectrum');
    if (sectionLine < 0) return null;
    let lineIdx = sectionLine + 1;
    while (lineIdx < lines.length && !String(lines[lineIdx] || '').trim()) lineIdx++;
    if (lineIdx >= lines.length || String(lines[lineIdx] || '').trim().startsWith('$')) return null;
    const countNums = extractOrcaLineNumbers(lines[lineIdx]);
    const modeCount = countNums.length > 0 ? Math.round(countNums[0]) : NaN;
    if (!Number.isInteger(modeCount) || modeCount <= 0) return null;
    lineIdx += 1;
    const out = [];
    while (lineIdx < lines.length && out.length < modeCount) {
      const raw = String(lines[lineIdx] || '').trim();
      if (!raw) { lineIdx += 1; continue; }
      if (raw.startsWith('$')) break;
      const nums = extractOrcaLineNumbers(raw);
      if (nums.length >= 3) out.push(nums[2]);
      else if (nums.length >= 2) out.push(nums[1]);
      else if (nums.length >= 1) out.push(nums[0]);
      lineIdx += 1;
    }
    if (out.length === 0) return null;
    while (out.length < modeCount) out.push(NaN);
    return out.slice(0, modeCount);
  }

  /**
   * Parse ORCA `$normal_modes` matrix blocks.
   * @param {string[]} lines
   * @param {string} sourceName
   * @returns {{rows:number,cols:number,matrix:Float32Array[]}}
   */
  function parseOrcaNormalModesMatrix(lines, sourceName) {
    const sectionLine = findOrcaSectionLine(lines, 'normal_modes');
    if (sectionLine < 0) {
      throw new Error(`ORCA integration: missing $normal_modes section in "${sourceName}".`);
    }
    let lineIdx = sectionLine + 1;
    while (lineIdx < lines.length && !String(lines[lineIdx] || '').trim()) lineIdx++;
    if (lineIdx >= lines.length || String(lines[lineIdx] || '').trim().startsWith('$')) {
      throw new Error(`ORCA integration: missing normal-mode matrix dimensions in "${sourceName}".`);
    }
    const dims = extractOrcaLineNumbers(lines[lineIdx]);
    const rows = dims.length > 0 ? Math.round(dims[0]) : NaN;
    const cols = dims.length > 1 ? Math.round(dims[1]) : NaN;
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows <= 0 || cols <= 0) {
      throw new Error(`ORCA integration: invalid normal-mode matrix dimensions in "${sourceName}".`);
    }
    const matrix = Array.from({ length: rows }, () => new Float32Array(cols));
    const setCounts = new Uint16Array(rows * cols);
    /**
     * Detect whether one tokenized line is the start of the next ORCA column block.
     * Block headers are integer-only ascending column indices (e.g. "5 6 7 8").
     * @param {string[]} tokens
     * @returns {boolean}
     */
    function isOrcaModeBlockHeaderTokens(tokens) {
      if (!Array.isArray(tokens) || tokens.length === 0) return false;
      const ints = [];
      for (const t of tokens) {
        if (!/^[+-]?\d+$/.test(t)) return false;
        const v = Number.parseInt(t, 10);
        if (!(v >= 0 && v < cols)) return false;
        ints.push(v);
      }
      for (let i = 1; i < ints.length; i++) {
        if (!(ints[i] > ints[i - 1])) return false;
      }
      return true;
    }
    lineIdx += 1;
    while (lineIdx < lines.length) {
      const headerRaw = String(lines[lineIdx] || '').trim();
      if (!headerRaw) { lineIdx += 1; continue; }
      if (headerRaw.startsWith('$')) break;

      const headerTokens = headerRaw.split(/\s+/).filter(Boolean);
      const headerCols = [];
      let allInt = true;
      for (const t of headerTokens) {
        if (!/^[+-]?\d+$/.test(t)) { allInt = false; break; }
        const idx = Number.parseInt(t, 10);
        if (idx >= 0 && idx < cols) headerCols.push(idx);
      }
      if (!allInt || headerCols.length === 0) {
        lineIdx += 1;
        continue;
      }

      lineIdx += 1;
      while (lineIdx < lines.length) {
        const rowRaw = String(lines[lineIdx] || '').trim();
        if (!rowRaw) { lineIdx += 1; continue; }
        if (rowRaw.startsWith('$')) break;
        const rowTokens = rowRaw.split(/\s+/).filter(Boolean);
        if (rowTokens.length === 0) { lineIdx += 1; continue; }
        // ORCA prints mode matrices in blocks; when we hit the next block header,
        // hand control back to the outer loop so it can parse new column indices.
        if (isOrcaModeBlockHeaderTokens(rowTokens)) break;
        if (!/^[+-]?\d+$/.test(rowTokens[0])) break;
        const rowIndex = Number.parseInt(rowTokens[0], 10);
        if (!(rowIndex >= 0 && rowIndex < rows)) {
          lineIdx += 1;
          continue;
        }
        if (rowTokens.length < 1 + headerCols.length) {
          throw new Error(`ORCA integration: malformed row for mode matrix in "${sourceName}" near row ${rowIndex}.`);
        }
        for (let j = 0; j < headerCols.length; j++) {
          const val = parseOrcaNumberToken(rowTokens[1 + j]);
          if (!Number.isFinite(val)) {
            throw new Error(`ORCA integration: invalid mode value in "${sourceName}" at row ${rowIndex}, col ${headerCols[j]}.`);
          }
          matrix[rowIndex][headerCols[j]] = val;
          setCounts[rowIndex * cols + headerCols[j]] = 1;
        }
        lineIdx += 1;
      }
    }
    let setCount = 0;
    for (let i = 0; i < setCounts.length; i++) setCount += setCounts[i];
    if (setCount !== rows * cols) {
      throw new Error(`ORCA integration: incomplete normal-mode matrix in "${sourceName}" (${setCount}/${rows * cols} values).`);
    }
    return { rows, cols, matrix };
  }

  /**
   * Parse ORCA Hessian text into the internal vibration payload.
   * @param {string} text
   * @param {string} sourceName
   * @returns {{kind:string,version:number,units:'angstrom'|'bohr',atomCount:number,atomSymbols:(string[]|null),modes:Array<{label:string,frequencyCm1:number,displacements:Float32Array}>}}
   */
  function parseOrcaHessianVibrationPayload(text, sourceName) {
    const rawText = String(text || '');
    const lines = rawText.replace(/\r/g, '').split('\n');
    if (!/\$normal_modes/i.test(rawText) && !/\$vibrational_frequencies/i.test(rawText) && !/\$orca_hessian_file/i.test(rawText)) {
      throw new Error(`ORCA integration: "${sourceName}" does not look like an ORCA Hessian file.`);
    }
    const freqs = parseOrcaVibrationalFrequencies(lines, sourceName);
    const irIntensities = parseOrcaIrSpectrumIntensities(lines);
    const normalModes = parseOrcaNormalModesMatrix(lines, sourceName);
    if (normalModes.rows % 3 !== 0) {
      throw new Error(`ORCA integration: normal-mode row count ${normalModes.rows} is not divisible by 3 in "${sourceName}".`);
    }
    const atomCountFromModes = normalModes.rows / 3;
    const atomMeta = parseOrcaAtomsSection(lines);
    if (atomMeta.atomCount != null && atomMeta.atomCount !== atomCountFromModes) {
      throw new Error(`ORCA integration: atom count mismatch in "${sourceName}" (atoms=${atomMeta.atomCount}, modes=${atomCountFromModes}).`);
    }
    const modeCount = Math.min(freqs.length, normalModes.cols);
    const modes = [];
    for (let modeIdx = 0; modeIdx < modeCount; modeIdx++) {
      const disp = new Float32Array(atomCountFromModes * 3);
      for (let atomIdx = 0; atomIdx < atomCountFromModes; atomIdx++) {
        const rowBase = atomIdx * 3;
        disp[3 * atomIdx + 0] = normalModes.matrix[rowBase + 0][modeIdx];
        disp[3 * atomIdx + 1] = normalModes.matrix[rowBase + 1][modeIdx];
        disp[3 * atomIdx + 2] = normalModes.matrix[rowBase + 2][modeIdx];
      }
      modes.push({
        label: `Mode ${modeIdx + 1}`,
        frequencyCm1: Number.isFinite(freqs[modeIdx]) ? Number(freqs[modeIdx]) : NaN,
        irIntensityKmMol: Number.isFinite(Number(irIntensities && irIntensities[modeIdx]))
          ? Number(irIntensities[modeIdx])
          : NaN,
        displacements: disp,
      });
    }
    if (modes.length === 0) {
      throw new Error(`ORCA integration: no normal modes found in "${sourceName}".`);
    }
    return {
      kind: VIBRATION_KIND,
      version: 1,
      // ORCA normal-mode vectors are typically dimensionless in practice.
      // Use neutral scaling so amplitude slider controls displacement magnitude.
      units: 'angstrom',
      atomCount: atomCountFromModes,
      atomSymbols: atomMeta.atomSymbols,
      modes,
    };
  }

  /**
   * Build one XYZ-like volume from ORCA `$atoms` coordinates.
   * ORCA Hessian atom coordinates are in bohr.
   * @param {{atoms:(Array<{symbol:string,x:number,y:number,z:number}>|null)}} atomMeta
   * @param {string} sourceName
   * @returns {*|null}
   */
  function buildXyzVolumeFromOrcaAtoms(atomMeta, sourceName) {
    if (!atomMeta || !Array.isArray(atomMeta.atoms) || atomMeta.atoms.length === 0) return null;
    const atoms = [];
    for (let i = 0; i < atomMeta.atoms.length; i++) {
      const row = atomMeta.atoms[i];
      const symbol = String(row && row.symbol ? row.symbol : '').toUpperCase();
      const atomicNumber = ATOM_SYMBOL_TO_Z && ATOM_SYMBOL_TO_Z[symbol];
      if (!Number.isInteger(atomicNumber)) return null;
      const x = Number(row && row.x);
      const y = Number(row && row.y);
      const z = Number(row && row.z);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
      atoms.push({ Z: atomicNumber, x, y, z, formalCharge: 0 });
    }
    const idx = () => 0;
    return {
      title: 'ORCA Hessian',
      comment: sourceName || '',
      natoms: atoms.length,
      origin: [0, 0, 0],
      nxyz: [0, 0, 0],
      axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      atoms,
      data: new Float32Array(0),
      idx,
      units: 'bohr',
      kind: 'xyz',
    };
  }

  /**
   * Parse ORCA Hessian text into geometry + vibration payload.
   * When `$atoms` coordinates are present, geometry is built directly.
   * @param {string} text
   * @param {string} sourceName
   * @returns {{vol:*,payload:*}}
   */
  function parseOrcaHessianVibrationBundle(text, sourceName) {
    const payload = parseOrcaHessianVibrationPayload(text, sourceName);
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const atomMeta = parseOrcaAtomsSection(lines);
    const vol = buildXyzVolumeFromOrcaAtoms(atomMeta, sourceName);
    return { vol, payload };
  }

  /**
   * Resolve one element symbol token (symbol text or atomic number).
   * @param {*} symbolToken
   * @param {*} zToken
   * @returns {string|null}
   */
  function resolveElementSymbolToken(symbolToken, zToken = null) {
    const raw = String(symbolToken == null ? '' : symbolToken).trim();
    if (raw) {
      const upper = raw.toUpperCase();
      if (ATOM_SYMBOL_TO_Z && Number.isInteger(ATOM_SYMBOL_TO_Z[upper])) {
        return getElementSymbol(ATOM_SYMBOL_TO_Z[upper]).toUpperCase();
      }
      if (/^[+-]?\d+$/.test(raw)) {
        const z = Number.parseInt(raw, 10);
        if (Number.isInteger(z) && z > 0 && ATOM_Z_TO_DATA && ATOM_Z_TO_DATA[z]) {
          return getElementSymbol(z).toUpperCase();
        }
      }
    }
    if (zToken != null) {
      const zRaw = String(zToken).trim();
      if (/^[+-]?\d+$/.test(zRaw)) {
        const z = Number.parseInt(zRaw, 10);
        if (Number.isInteger(z) && z > 0 && ATOM_Z_TO_DATA && ATOM_Z_TO_DATA[z]) {
          return getElementSymbol(z).toUpperCase();
        }
      }
    }
    return null;
  }

  /**
   * Parse one Psi4 frequency token, supporting imaginary values like `123.4i`.
   * Imaginary values are encoded as negative frequencies.
   * @param {*} token
   * @returns {number}
   */
  function parsePsi4FrequencyToken(token) {
    const raw = String(token == null ? '' : token).trim();
    if (!raw) return NaN;
    const imag = /i$/i.test(raw);
    const core = imag ? raw.slice(0, -1) : raw;
    const val = Number(core);
    if (!Number.isFinite(val)) return NaN;
    return imag ? -Math.abs(val) : val;
  }

  /**
   * Parse one `Freq [cm^-1] ...` row from Psi4 vibration output.
   * @param {string} line
   * @param {number} expectedCount
   * @returns {number[]}
   */
  function parsePsi4FrequencyRow(line, expectedCount) {
    const s = String(line || '');
    const tail = s.replace(/.*Freq\s*\[cm\^-1\]\s*/i, '');
    const out = [];
    for (const tok of tail.trim().split(/\s+/)) {
      const f = parsePsi4FrequencyToken(tok);
      if (Number.isFinite(f)) out.push(f);
      if (out.length >= expectedCount) break;
    }
    if (out.length >= expectedCount) return out.slice(0, expectedCount);
    const fallback = extractOrcaLineNumbers(s);
    return fallback.slice(0, expectedCount);
  }

  /**
   * Parse one Psi4 `IR activ [km/mol] ...` row.
   * @param {string} line
   * @param {number} expectedCount
   * @returns {number[]}
   */
  function parsePsi4IrActivityRow(line, expectedCount) {
    const s = String(line || '');
    const tail = s.replace(/.*IR\s*activ(?:ity)?\s*\[[^\]]+\]\s*/i, '');
    const out = [];
    for (const tok of tail.trim().split(/\s+/)) {
      const v = Number(tok);
      if (Number.isFinite(v)) out.push(v);
      if (out.length >= expectedCount) break;
    }
    if (out.length >= expectedCount) return out.slice(0, expectedCount);
    const fallback = extractOrcaLineNumbers(s);
    return fallback.slice(0, expectedCount);
  }

  /**
   * Parse the last Psi4 `Geometry (in Angstrom)` block from output text.
   * @param {string[]} lines
   * @param {string} sourceName
   * @returns {{atomSymbols:string[],coords:number[][]}}
   */
  function parseLastPsi4GeometryBlock(lines, sourceName) {
    let lastAtoms = null;
    for (let i = 0; i < lines.length; i++) {
      if (!/Geometry\s*\(in\s*Angstrom\)/i.test(String(lines[i] || ''))) continue;
      let j = i + 1;
      const atoms = [];
      while (j < lines.length) {
        const raw = String(lines[j] || '');
        const line = raw.trim();
        if (!line) { j += 1; continue; }
        if (/^==>/.test(line) || /^Nuclear repulsion\b/i.test(line) || /^\$/.test(line)) break;
        if (/^Center\b/i.test(line) || /^-+/.test(line)) { j += 1; continue; }
        const parts = line.split(/\s+/);
        if (parts.length < 4) {
          if (atoms.length > 0) break;
          j += 1;
          continue;
        }
        let symbol = null;
        let x = NaN, y = NaN, z = NaN;
        // Common Psi4 geometry row: `H  x  y  z [mass]`
        symbol = resolveElementSymbolToken(parts[0], null);
        x = Number(parts[1]);
        y = Number(parts[2]);
        z = Number(parts[3]);
        if (!(symbol && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z))) {
          // Fallback row with leading index: `1 H x y z`
          symbol = resolveElementSymbolToken(parts[1], null);
          x = Number(parts[2]);
          y = Number(parts[3]);
          z = Number(parts[4]);
        }
        if (!(symbol && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z))) {
          if (atoms.length > 0) break;
          j += 1;
          continue;
        }
        atoms.push({ symbol, x, y, z });
        j += 1;
      }
      if (atoms.length > 0) lastAtoms = atoms;
    }
    if (!lastAtoms || !lastAtoms.length) {
      throw new Error(`Psi4 integration: could not find any Geometry (in Angstrom) block in "${sourceName}".`);
    }
    return {
      atomSymbols: lastAtoms.map((a) => a.symbol),
      coords: lastAtoms.map((a) => [a.x, a.y, a.z]),
    };
  }

  /**
   * Build one XYZ-like volume from parsed geometry.
   * @param {{atomSymbols:string[],coords:number[][]}} geometry
   * @param {string} sourceName
   * @returns {*}
   */
  function buildXyzVolumeFromParsedGeometry(geometry, sourceName) {
    const atomSymbols = Array.isArray(geometry && geometry.atomSymbols) ? geometry.atomSymbols : [];
    const coords = Array.isArray(geometry && geometry.coords) ? geometry.coords : [];
    if (!atomSymbols.length || atomSymbols.length !== coords.length) {
      throw new Error(`Psi4 integration: malformed geometry in "${sourceName}".`);
    }
    const atoms = [];
    for (let i = 0; i < atomSymbols.length; i++) {
      const sym = String(atomSymbols[i] || '').toUpperCase();
      const z = ATOM_SYMBOL_TO_Z && ATOM_SYMBOL_TO_Z[sym];
      if (!Number.isInteger(z)) {
        throw new Error(`Psi4 integration: unknown element symbol "${atomSymbols[i]}" in "${sourceName}".`);
      }
      const c = coords[i];
      const x = Number(c && c[0]);
      const y = Number(c && c[1]);
      const zc = Number(c && c[2]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zc)) {
        throw new Error(`Psi4 integration: invalid geometry coordinates in "${sourceName}".`);
      }
      atoms.push({ Z: z, x, y, z: zc, formalCharge: 0 });
    }
    const idx = () => 0;
    return {
      title: 'Psi4 Output',
      comment: sourceName || '',
      natoms: atoms.length,
      origin: [0, 0, 0],
      nxyz: [0, 0, 0],
      axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      atoms,
      data: new Float32Array(0),
      idx,
      units: 'angstrom',
      kind: 'xyz',
    };
  }

  /**
   * Parse Psi4 text output vibration blocks (`Vibration` table format).
   * @param {string[]} lines
   * @param {{atomSymbols:string[]}} geometry
   * @param {string} sourceName
   * @returns {{kind:string,version:number,units:'angstrom'|'bohr',atomCount:number,atomSymbols:(string[]|null),modes:Array<{label:string,frequencyCm1:number,displacements:Float32Array}>}}
   */
  function parsePsi4OutputVibrationPayload(lines, geometry, sourceName) {
    let harmonicStart = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/==>\s*Harmonic Vibrational Analysis\s*<==/i.test(String(lines[i] || ''))) {
        harmonicStart = i;
        break;
      }
    }
    if (harmonicStart < 0) {
      throw new Error(`Psi4 integration: missing "Harmonic Vibrational Analysis" section in "${sourceName}".`);
    }

    const atomCount = Array.isArray(geometry && geometry.atomSymbols) ? geometry.atomSymbols.length : 0;
    if (!(atomCount > 0)) {
      throw new Error(`Psi4 integration: missing geometry atom list for "${sourceName}".`);
    }

    const modeMap = new Map();
    let i = harmonicStart + 1;
    while (i < lines.length) {
      const vibLine = String(lines[i] || '');
      if (!/^\s*Vibration\b/i.test(vibLine)) {
        i += 1;
        continue;
      }
      const modeIndices = extractOrcaLineNumbers(vibLine)
        .map((n) => Math.round(n))
        .filter((n) => Number.isInteger(n) && n >= 0);
      if (!modeIndices.length) { i += 1; continue; }

      let freqLineIndex = -1;
      for (let j = i + 1; j < Math.min(lines.length, i + 16); j++) {
        if (/^\s*Freq\s*\[cm\^-1\]/i.test(String(lines[j] || ''))) {
          freqLineIndex = j;
          break;
        }
      }
      if (freqLineIndex < 0) { i += 1; continue; }

      const freqs = parsePsi4FrequencyRow(lines[freqLineIndex], modeIndices.length);
      if (freqs.length < modeIndices.length) {
        throw new Error(`Psi4 integration: malformed Freq row near line ${freqLineIndex + 1} in "${sourceName}".`);
      }
      let irIntensities = null;
      for (let j = freqLineIndex + 1; j < Math.min(lines.length, freqLineIndex + 12); j++) {
        if (!/^\s*IR\s*activ(?:ity)?\s*\[[^\]]+\]/i.test(String(lines[j] || ''))) continue;
        const parsed = parsePsi4IrActivityRow(lines[j], modeIndices.length);
        if (parsed.length >= modeIndices.length) {
          irIntensities = parsed.slice(0, modeIndices.length);
          break;
        }
      }

      const atomRows = [];
      let rowIdx = freqLineIndex + 1;
      while (rowIdx < lines.length) {
        const rowRaw = String(lines[rowIdx] || '');
        const row = rowRaw.trim();
        if (!row) {
          if (atomRows.length > 0) {
            // Stop on blank once at least one atom row has been read.
            break;
          }
          rowIdx += 1;
          continue;
        }
        if (/^\s*Vibration\b/i.test(row) || /^==>/.test(row) || /^\$/.test(row)) break;
        if (/^-{4,}/.test(row)) { rowIdx += 1; continue; }
        const m = row.match(/^(\d+)\s+([A-Za-z]{1,3})\s+(.+)$/);
        if (!m) {
          if (atomRows.length > 0) break;
          rowIdx += 1;
          continue;
        }
        const symbol = resolveElementSymbolToken(m[2], null);
        const nums = extractOrcaLineNumbers(m[3]);
        const needed = 3 * modeIndices.length;
        if (!(symbol && nums.length >= needed)) {
          if (atomRows.length > 0) break;
          rowIdx += 1;
          continue;
        }
        atomRows.push({
          symbol,
          values: nums.slice(0, needed),
        });
        rowIdx += 1;
      }
      if (atomRows.length !== atomCount) {
        throw new Error(`Psi4 integration: mode block near line ${i + 1} has ${atomRows.length} atoms; expected ${atomCount}.`);
      }

      for (let m = 0; m < modeIndices.length; m++) {
        const modeIndex = modeIndices[m];
        let rec = modeMap.get(modeIndex);
        if (!rec) {
          rec = {
            modeIndex,
            frequencyCm1: freqs[m],
            irIntensityKmMol: Number.isFinite(Number(irIntensities && irIntensities[m]))
              ? Number(irIntensities[m])
              : NaN,
            displacements: new Float32Array(atomCount * 3),
          };
          modeMap.set(modeIndex, rec);
        }
        rec.frequencyCm1 = freqs[m];
        if (Number.isFinite(Number(irIntensities && irIntensities[m]))) {
          rec.irIntensityKmMol = Number(irIntensities[m]);
        }
        for (let a = 0; a < atomCount; a++) {
          const vals = atomRows[a].values;
          rec.displacements[3 * a + 0] = vals[3 * m + 0];
          rec.displacements[3 * a + 1] = vals[3 * m + 1];
          rec.displacements[3 * a + 2] = vals[3 * m + 2];
        }
      }
      i = rowIdx;
    }

    const modeList = Array.from(modeMap.values()).sort((a, b) => a.modeIndex - b.modeIndex);
    if (!modeList.length) {
      throw new Error(`Psi4 integration: could not parse any vibration mode table in "${sourceName}".`);
    }
    const hasZeroBasedModeNumbering = modeList.some((m) => m.modeIndex === 0);
    return {
      kind: VIBRATION_KIND,
      version: 1,
      units: 'angstrom',
      atomCount,
      atomSymbols: geometry.atomSymbols.slice(),
      modes: modeList.map((m) => ({
        label: `Mode ${hasZeroBasedModeNumbering ? (m.modeIndex + 1) : m.modeIndex}`,
        frequencyCm1: Number.isFinite(m.frequencyCm1) ? Number(m.frequencyCm1) : NaN,
        irIntensityKmMol: Number.isFinite(m.irIntensityKmMol) ? Number(m.irIntensityKmMol) : NaN,
        displacements: m.displacements,
      })),
    };
  }

  /**
   * Parse Psi4 output `.dat/.out` into geometry + vibration payload.
   * Geometry is taken from the LAST `Geometry (in Angstrom)` block.
   * @param {string} text
   * @param {string} sourceName
   * @returns {{vol:*,payload:*}}
   */
  function parsePsi4OutputVibrationBundle(text, sourceName) {
    if (!looksLikePsi4OutputText(text)) {
      throw new Error(`Psi4 integration: "${sourceName}" does not look like a Psi4 frequency output.`);
    }
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const geometry = parseLastPsi4GeometryBlock(lines, sourceName);
    const payload = parsePsi4OutputVibrationPayload(lines, geometry, sourceName);
    const vol = buildXyzVolumeFromParsedGeometry(geometry, sourceName);
    return { vol, payload };
  }

  /**
   * Normalize vibration displacement units.
   * @param {*} units
   * @returns {'angstrom'|'bohr'}
   */
  function normalizeVibrationUnits(units) {
    const raw = String(units || 'angstrom').trim().toLowerCase();
    if (raw === 'bohr' || raw === 'a0' || raw === 'au' || raw === 'atomic') return 'bohr';
    return 'angstrom';
  }

  /**
   * Parse one displacement payload into a flat vector list.
   * Supports nested `[[dx,dy,dz], ...]` and flat `[dx,dy,dz,...]` forms.
   * @param {*} raw
   * @param {number|null} expectedAtomCount
   * @param {number} modeNumber
   * @returns {{atomCount:number, values:Float32Array}}
   */
  function parseVibrationDisplacements(raw, expectedAtomCount, modeNumber) {
    const modeLabel = `mode ${modeNumber}`;
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error(`Malformed vibration payload: ${modeLabel} is missing displacement vectors.`);
    }
    if (Array.isArray(raw[0])) {
      const atomCount = raw.length | 0;
      if (expectedAtomCount != null && atomCount !== expectedAtomCount) {
        throw new Error(`Malformed vibration payload: ${modeLabel} atom count ${atomCount} does not match ${expectedAtomCount}.`);
      }
      const out = new Float32Array(atomCount * 3);
      for (let i = 0; i < atomCount; i++) {
        const vec = raw[i];
        if (!Array.isArray(vec) || vec.length < 3) {
          throw new Error(`Malformed vibration payload: ${modeLabel} vector ${i + 1} must have 3 numeric components.`);
        }
        const dx = Number(vec[0]);
        const dy = Number(vec[1]);
        const dz = Number(vec[2]);
        if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) {
          throw new Error(`Malformed vibration payload: ${modeLabel} vector ${i + 1} contains non-numeric values.`);
        }
        out[3 * i + 0] = dx;
        out[3 * i + 1] = dy;
        out[3 * i + 2] = dz;
      }
      return { atomCount, values: out };
    }
    if (raw.length % 3 !== 0) {
      throw new Error(`Malformed vibration payload: ${modeLabel} flat displacement array length must be divisible by 3.`);
    }
    const atomCount = (raw.length / 3) | 0;
    if (expectedAtomCount != null && atomCount !== expectedAtomCount) {
      throw new Error(`Malformed vibration payload: ${modeLabel} atom count ${atomCount} does not match ${expectedAtomCount}.`);
    }
    const out = new Float32Array(atomCount * 3);
    for (let i = 0; i < out.length; i++) {
      const n = Number(raw[i]);
      if (!Number.isFinite(n)) {
        throw new Error(`Malformed vibration payload: ${modeLabel} contains non-numeric displacement data.`);
      }
      out[i] = n;
    }
    return { atomCount, values: out };
  }

  /**
   * Parse and validate one vibrational sidecar JSON payload.
   * @param {string} text
   * @param {string} sourceName
   * @returns {{kind:string,version:number,units:'angstrom'|'bohr',atomCount:number,atomSymbols:(string[]|null),modes:Array<{label:string,frequencyCm1:number,displacements:Float32Array}>}}
   */
  function parseVibrationPayload(text, sourceName) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error(`Could not parse vibration JSON "${sourceName}": ${err && err.message ? err.message : String(err)}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Malformed vibration payload "${sourceName}": root value must be a JSON object.`);
    }
    if (parsed.kind && parsed.kind !== VIBRATION_KIND) {
      throw new Error(`Malformed vibration payload "${sourceName}": unexpected kind "${String(parsed.kind)}".`);
    }

    const modesRaw = Array.isArray(parsed.modes)
      ? parsed.modes
      : (Array.isArray(parsed.vibrations) ? parsed.vibrations : null);
    if (!modesRaw || modesRaw.length === 0) {
      throw new Error(`Malformed vibration payload "${sourceName}": missing non-empty "modes" array.`);
    }

    let atomCount = Number.isInteger(parsed.atomCount) && parsed.atomCount > 0 ? (parsed.atomCount | 0) : null;
    const frequencies = Array.isArray(parsed.frequencies) ? parsed.frequencies : null;
    const irIntensities = Array.isArray(parsed.irIntensities)
      ? parsed.irIntensities
      : (Array.isArray(parsed.intensities) ? parsed.intensities : null);
    const modes = [];
    for (let i = 0; i < modesRaw.length; i++) {
      const modeRaw = modesRaw[i];
      let displacementRaw = null;
      let label = `Mode ${i + 1}`;
      let frequencyCm1 = NaN;
      let irIntensityKmMol = NaN;
      if (Array.isArray(modeRaw)) {
        displacementRaw = modeRaw;
      } else if (modeRaw && typeof modeRaw === 'object') {
        displacementRaw = modeRaw.displacements || modeRaw.vectors || modeRaw.delta || modeRaw.mode;
        if (typeof modeRaw.label === 'string' && modeRaw.label.trim()) label = modeRaw.label.trim();
        else if (typeof modeRaw.name === 'string' && modeRaw.name.trim()) label = modeRaw.name.trim();
        frequencyCm1 = Number(
          modeRaw.frequencyCm1 ?? modeRaw.frequency ?? modeRaw.wavenumber ?? modeRaw.cm1
        );
        irIntensityKmMol = Number(
          modeRaw.irIntensityKmMol ?? modeRaw.irIntensity ?? modeRaw.intensityKmMol ?? modeRaw.intensity
        );
      } else {
        throw new Error(`Malformed vibration payload "${sourceName}": mode ${i + 1} must be an object or array.`);
      }
      if (!Number.isFinite(frequencyCm1) && frequencies && i < frequencies.length) {
        frequencyCm1 = Number(frequencies[i]);
      }
      if (!Number.isFinite(irIntensityKmMol) && irIntensities && i < irIntensities.length) {
        irIntensityKmMol = Number(irIntensities[i]);
      }
      const parsedDisp = parseVibrationDisplacements(displacementRaw, atomCount, i + 1);
      atomCount = parsedDisp.atomCount;
      modes.push({
        label,
        frequencyCm1: Number.isFinite(frequencyCm1) ? frequencyCm1 : NaN,
        irIntensityKmMol: Number.isFinite(irIntensityKmMol) ? Math.max(0, irIntensityKmMol) : NaN,
        displacements: parsedDisp.values,
      });
    }
    if (!atomCount || atomCount <= 0) {
      throw new Error(`Malformed vibration payload "${sourceName}": could not infer atom count.`);
    }

    let atomSymbols = null;
    const symbolsRaw = Array.isArray(parsed.atomSymbols) ? parsed.atomSymbols : (Array.isArray(parsed.elements) ? parsed.elements : null);
    if (symbolsRaw) {
      if (symbolsRaw.length !== atomCount) {
        throw new Error(`Malformed vibration payload "${sourceName}": atomSymbols length ${symbolsRaw.length} does not match atom count ${atomCount}.`);
      }
      atomSymbols = symbolsRaw.map((sym) => String(sym || '').trim().toUpperCase());
    }

    return {
      kind: VIBRATION_KIND,
      version: Number.isFinite(Number(parsed.version)) ? Number(parsed.version) : 1,
      units: normalizeVibrationUnits(parsed.units),
      atomCount,
      atomSymbols,
      modes,
    };
  }

  /**
   * Return one uppercase element-symbol sequence for the provided volume.
   * @param {*} vol
   * @returns {string[]}
   */
  function getVolumeAtomSymbols(vol) {
    if (!vol || !Array.isArray(vol.atoms)) return [];
    const out = new Array(vol.atoms.length);
    for (let i = 0; i < vol.atoms.length; i++) {
      out[i] = getElementSymbol(vol.atoms[i] && vol.atoms[i].Z).toUpperCase();
    }
    return out;
  }

  /**
   * Normalize a file stem for cross-file pairing (for example `water` from
   * `water.xyz`, `water.hess`, or `water.vib.json`).
   * @param {*} name
   * @returns {string}
   */
  function normalizeFileStem(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    const leaf = raw.split(/[\\/]/).pop() || '';
    const lower = leaf.toLowerCase();
    const suffixes = [
      '.vib.json',
      '.vmodes.json',
      '.modes.json',
      '.2ccube',
      '.output',
      '.cube',
      '.hess',
      '.xyz',
      '.cub',
      '.out',
      '.dat',
      '.json',
    ];
    for (const suffix of suffixes) {
      if (lower.endsWith(suffix) && lower.length > suffix.length) {
        return lower.slice(0, -suffix.length);
      }
    }
    const dot = lower.lastIndexOf('.');
    return dot > 0 ? lower.slice(0, dot) : lower;
  }

  /**
   * Compare two uppercase element-symbol arrays for exact sequence equality.
   * @param {string[]} a
   * @param {string[]} b
   * @returns {boolean}
   */
  function areSymbolSequencesEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Compare two element-symbol arrays as multisets (order-insensitive).
   * @param {string[]} a
   * @param {string[]} b
   * @returns {boolean}
   */
  function areSymbolMultisetsEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    const counts = new Map();
    for (const s of a) counts.set(s, (counts.get(s) || 0) + 1);
    for (const s of b) {
      const n = counts.get(s) || 0;
      if (n <= 0) return false;
      if (n === 1) counts.delete(s);
      else counts.set(s, n - 1);
    }
    return counts.size === 0;
  }

  /**
   * Find loaded molecules that are compatible with one vibration payload.
   * @param {*} payload
   * @param {{allowPermutation?:boolean}=} options
   * @returns {Array<{index:number,record:*,vol:*,matchType:'exact'|'permuted'|'count'}>}
   */
  function findMatchingVolumesForVibrationPayload(payload, options = null) {
    const allowPermutation = !!(options && options.allowPermutation);
    const candidates = [];
    for (let i = 0; i < volumes.length; i++) {
      const record = volumes[i];
      const vol = record && record.vol;
      if (!vol || !Array.isArray(vol.atoms)) continue;
      if (vol.atoms.length !== payload.atomCount) continue;
      if (payload.atomSymbols && payload.atomSymbols.length) {
        const symbols = getVolumeAtomSymbols(vol);
        if (areSymbolSequencesEqual(symbols, payload.atomSymbols)) {
          candidates.push({ index: i, record, vol, matchType: 'exact' });
          continue;
        }
        if (!allowPermutation || !areSymbolMultisetsEqual(symbols, payload.atomSymbols)) continue;
        candidates.push({ index: i, record, vol, matchType: 'permuted' });
        continue;
      }
      candidates.push({ index: i, record, vol, matchType: 'count' });
    }
    return candidates;
  }

  /**
   * Attach one parsed vibrational payload to the best matching loaded molecule.
   * @param {string} sourceName
   * @param {*} payload
   * @param {{preferredIndex?:number,sourceStem?:string}=} options
   * @returns {{ok:boolean,error?:string,targetName?:string}}
   */
  function attachVibrationPayloadToBestVolume(sourceName, payload, options = null) {
    let candidates = findMatchingVolumesForVibrationPayload(payload);
    let usedPermutationMatch = false;
    if (
      candidates.length === 0
      && payload
      && Array.isArray(payload.atomSymbols)
      && payload.atomSymbols.length > 0
    ) {
      candidates = findMatchingVolumesForVibrationPayload(payload, { allowPermutation: true });
      usedPermutationMatch = candidates.some((c) => c && c.matchType === 'permuted');
    }
    if (candidates.length === 0) {
      return {
        ok: false,
        error: `No loaded molecule matches ${payload.atomCount} atoms for vibration payload "${sourceName}".`,
      };
    }

    const preferredIndex = Number.isFinite(options && options.preferredIndex)
      ? Math.max(0, options.preferredIndex | 0)
      : -1;
    const preferredStem = normalizeFileStem(options && options.sourceStem);
    const stemMatched = preferredStem
      ? candidates.find((c) => normalizeFileStem(c && c.record && c.record.name) === preferredStem)
      : null;
    const target = stemMatched
      || candidates.find((c) => c.index === preferredIndex)
      || candidates.find((c) => c.index === currentIndex)
      || candidates[0];
    const vol = target.vol;
    const prev = vol.vibration || {};
    const convertFactor = (payload.units === 'angstrom' && vol.units !== 'angstrom')
      ? ANG_TO_BOHR
      : (payload.units === 'bohr' && vol.units === 'angstrom')
        ? BOHR_TO_ANG
        : 1;
    const convertedModes = payload.modes.map((mode, idx) => {
      const src = mode.displacements;
      const out = new Float32Array(src.length);
      for (let i = 0; i < src.length; i++) out[i] = src[i] * convertFactor;
      return {
        label: mode.label || `Mode ${idx + 1}`,
        frequencyCm1: Number.isFinite(mode.frequencyCm1) ? Number(mode.frequencyCm1) : NaN,
        irIntensityKmMol: Number.isFinite(mode.irIntensityKmMol) ? Math.max(0, Number(mode.irIntensityKmMol)) : NaN,
        displacements: out,
      };
    });
    const atomCount = payload.atomCount | 0;
    const modeCount = convertedModes.length;
    const prevModeIndex = Number.isFinite(Number(prev.modeIndex)) ? Number(prev.modeIndex) | 0 : 0;
    const prevAmp = Number.isFinite(Number(prev.amplitude)) ? Number(prev.amplitude) : VIBRATION_DEFAULT_AMPLITUDE;
    const prevSpeed = Number.isFinite(Number(prev.speed)) ? Number(prev.speed) : VIBRATION_DEFAULT_SPEED;
    vol.vibration = {
      kind: VIBRATION_KIND,
      sourceName: sourceName || '',
      units: vol.units || 'angstrom',
      atomCount,
      atomSymbols: payload.atomSymbols ? payload.atomSymbols.slice() : getVolumeAtomSymbols(vol),
      modes: convertedModes,
      modeIndex: Math.max(0, Math.min(modeCount - 1, prevModeIndex)),
      amplitude: Math.max(0, Math.min(8, prevAmp)),
      speed: Math.max(0.1, Math.min(30, prevSpeed)),
      phase: 0,
      equilibrium: snapshotAtomCoordinates(vol, atomCount),
      frameBuffer: new Float32Array(atomCount * 3),
    };

    if (target.index === currentIndex) {
      vibrationPlaying = false;
      vibrationLastStepMs = 0;
      applyActiveVibrationPhase(0, { syncUi: false });
      syncVibrationControls();
    }
    if (usedPermutationMatch) {
      console.warn('[Vibration] Attached payload using order-insensitive symbol matching.', {
        sourceName,
        targetName: target.record && target.record.name ? target.record.name : '',
      });
    }
    return { ok: true, targetName: target.record && target.record.name ? target.record.name : '' };
  }

  /**
   * Parse one file payload into a volume using extension-based dispatch.
   * @param {string} name
   * @param {string} text
   * @returns {*}
   */
  function parseVolumeByName(name, text) {
    const kind = detectInputFileKind(name, text);
    if (kind === 'xyz') return parseXYZ(text);
    if (kind === 'molden') return parseMolden(text);
    if (kind === 'two_component_cube') return parseTwoComponentCube(text);
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
    if (vol) {
      ensureVolumeSchema(vol);
      const builderMap = getBuilderFragmentOpsByFileFromExtensions();
      const fileKey = String(name || '').trim();
      const skipBuilderExtensionMerge = !!(extras && extras.skipBuilderExtensionMerge);
      if (!skipBuilderExtensionMerge && fileKey && Array.isArray(builderMap[fileKey])) {
        vol.fragmentOps = cloneJsonLike(builderMap[fileKey]) || [];
      } else if (!Array.isArray(vol.fragmentOps)) {
        vol.fragmentOps = [];
      }
      pruneBuilderOperationsForVolume(vol);
    }
    volumes.push(meta);
    // Keep the user/default iso when importing files; only fall back to isoHint
    // if the iso field is actually empty.
    if (vol && vol.isoHint != null && isoInput.value === '') {
      isoInput.value = String(vol.isoHint);
    }
    if (vol && vol.kind === 'molden') {
      console.log('[MOLDEN] Loaded', name, {
        title: vol.title,
        natoms: vol.natoms,
        units: vol.units,
        moCount: vol.molden && vol.molden.moCount,
        basisCount: vol.molden && vol.molden.basisCount,
      });
    } else if (vol && vol.data && vol.data.length) {
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
      if (pubchemMetaWrap) pubchemMetaWrap.style.display = 'none';
      pubchemMetaContent.innerHTML = '';
      return;
    }
    if (pubchemMetaWrap) pubchemMetaWrap.style.display = 'block';
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
  function finalizeLoadedVolumes(startIndex, options = {}) {
    const resetIsoToDefault = !!options.resetIsoToDefault;
    const skipAutoIsoOnInitialRebuild = !!options.skipAutoIsoOnInitialRebuild;
    if (volumes.length > 0) {
      if (resetIsoToDefault && isoInput) isoInput.value = formatIsoInputValue(DEFAULT_ISO_VALUE);
      activateVolumeIndex(startIndex, { skipAutoIso: skipAutoIsoOnInitialRebuild });
    } else {
      syncActiveVolumeControls();
      updateEmptyStateVisibility();
    }
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
    const failures = [];
    const pendingVibrationPayloads = [];
    const importedPresetNames = [];
    const batchXyzStems = new Set();
    for (const f of arr) {
      const name = f && f.name ? f.name : '';
      if (detectInputFileKind(name, '') !== 'xyz') continue;
      const stem = normalizeFileStem(name);
      if (stem) batchXyzStems.add(stem);
    }
    const missingOrcaHessCompanions = [];
    for (const f of arr) {
      const name = f && f.name ? String(f.name) : '';
      if (!/\.hess$/iu.test(name)) continue;
      const hessStem = normalizeFileStem(name);
      if (!hessStem || !batchXyzStems.has(hessStem)) {
        missingOrcaHessCompanions.push(name || 'ORCA Hessian');
      }
    }
    if (missingOrcaHessCompanions.length > 0) {
      const header = missingOrcaHessCompanions.length === 1
        ? 'ORCA .hess warning:'
        : 'ORCA .hess warnings:';
      const body = missingOrcaHessCompanions
        .map((name, idx) => `${idx + 1}. ${name}: for ORCA vibrational imports, upload both the .xyz and .hess files together (same base name).`)
        .join('\n');
      alert(`${header}\n\n${body}`);
    }
    let hasPreparedTarget = false;
    let startIndex = -1; // index of first newly added
    let loadedCount = 0;
    let loadedVolumetricCount = 0;
    for (const f of arr) {
      try {
        const text = await f.text();
        const name = f && f.name ? f.name : '';
        const fileKind = detectInputFileKind(name, text);
        if (fileKind === 'psi4_output' || looksLikePsi4OutputText(text)) {
          const bundle = parsePsi4OutputVibrationBundle(text, name || 'Psi4 output');
          if (!hasPreparedTarget) {
            clearPlaceholderVolumesForUserLoad();
            startIndex = volumes.length;
            hasPreparedTarget = true;
          }
          appendParsedVolumeRecord(name || 'Psi4 output', bundle.vol);
          loadedCount++;
          pendingVibrationPayloads.push({
            name: name || 'Psi4 output',
            payload: bundle.payload,
            preferredIndex: volumes.length - 1,
            sourceStem: normalizeFileStem(name || 'Psi4 output'),
          });
          continue;
        }
        if (fileKind === 'orca_hess') {
          const hessStem = normalizeFileStem(name || '');
          if (!hessStem || !batchXyzStems.has(hessStem)) {
            failures.push(
              `${name || 'ORCA Hessian'}: ORCA .hess requires both the .xyz and .hess files in the same upload batch (same base name).`
            );
            continue;
          }
          const bundle = parseOrcaHessianVibrationBundle(text, name || 'ORCA Hessian');
          pendingVibrationPayloads.push({
            name: name || 'ORCA Hessian',
            payload: bundle.payload,
            sourceStem: hessStem,
          });
          continue;
        }
        const explicitVibrationFile = fileKind === 'vibration_payload';
        if (explicitVibrationFile) {
          const payload = parseVibrationPayload(text, f.name || 'vibration payload');
          pendingVibrationPayloads.push({
            name: f.name || 'vibration payload',
            payload,
            sourceStem: normalizeFileStem(f.name || 'vibration payload'),
          });
          continue;
        }
        if (fileKind === 'json') {
          let parsedJson = null;
          try { parsedJson = JSON.parse(text); } catch { }
          const looksLikeVibration = !!(
            parsedJson
            && typeof parsedJson === 'object'
            && !Array.isArray(parsedJson)
            && (
              parsedJson.kind === VIBRATION_KIND
              || Array.isArray(parsedJson.modes)
              || Array.isArray(parsedJson.vibrations)
            )
          );
          if (looksLikeVibration) {
            const payload = parseVibrationPayload(text, f.name || 'vibration payload');
            pendingVibrationPayloads.push({
              name: f.name || 'vibration payload',
              payload,
              sourceStem: normalizeFileStem(f.name || 'vibration payload'),
            });
            continue;
          }
          const looksLikePreset = !!(
            parsedJson
            && typeof parsedJson === 'object'
            && !Array.isArray(parsedJson)
            && parsedJson.kind === PRESET_KIND
          );
          if (looksLikePreset) {
            const result = importPresetFromText(text, f.name || 'preset');
            importedPresetNames.push(result.name);
            continue;
          }
          const looksLikeStructure = !!(
            parsedJson
            && typeof parsedJson === 'object'
            && !Array.isArray(parsedJson)
            && parsedJson.kind === STRUCTURE_KIND
          );
          if (looksLikeStructure) {
            const imported = parseStructureEnvelopeText(text, f.name || 'structure');
            if (!hasPreparedTarget) {
              clearPlaceholderVolumesForUserLoad();
              startIndex = volumes.length;
              hasPreparedTarget = true;
            }
            appendParsedVolumeRecord(getUniqueVolumeName(imported.name), imported.vol, Object.assign({}, imported.extras || {}, { skipBuilderExtensionMerge: true }));
            if (hasVolumetricGrid(imported.vol)) loadedVolumetricCount++;
            loadedCount++;
            continue;
          }
        }
        const vol = parseVolumeByName(f.name, text);
        if (!hasPreparedTarget) {
          clearPlaceholderVolumesForUserLoad();
          startIndex = volumes.length;
          hasPreparedTarget = true;
        }
        appendParsedVolumeRecord(f.name, vol);
        if (hasVolumetricGrid(vol)) loadedVolumetricCount++;
        loadedCount++;
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        console.error('[File import] Failed to parse', f && f.name ? f.name : '(unnamed file)', err);
        failures.push(`${f && f.name ? f.name : 'Unknown file'}: ${msg}`);
      }
    }
    if (loadedCount > 0 && startIndex >= 0) {
      finalizeLoadedVolumes(startIndex, {
        resetIsoToDefault: loadedVolumetricCount > 0,
        skipAutoIsoOnInitialRebuild: loadedVolumetricCount > 0,
      });
      if (getActiveTrajectoryInfo().enabled) {
        setTrajectoryPanelOpen(true);
      }
    } else updateEmptyStateVisibility();
    let attachedVibrationCount = 0;
    for (const item of pendingVibrationPayloads) {
      const result = attachVibrationPayloadToBestVolume(
        item.name,
        item.payload,
        { preferredIndex: item.preferredIndex, sourceStem: item.sourceStem }
      );
      if (!result.ok) {
        failures.push(`${item.name}: ${result.error || 'Could not attach vibration payload.'}`);
        continue;
      }
      attachedVibrationCount++;
    }
    if (attachedVibrationCount > 0) {
      updateSidePanel();
      if (getActiveVibrationInfo().enabled) {
        setVibrationPanelOpen(true);
      }
      setNavigationHint(`Loaded ${attachedVibrationCount} vibrational mode file${attachedVibrationCount === 1 ? '' : 's'}`);
    } else if (importedPresetNames.length > 0) {
      const label = importedPresetNames.length === 1
        ? `Loaded preset: ${importedPresetNames[0]}`
        : `Loaded ${importedPresetNames.length} preset files`;
      setNavigationHint(label);
    }
    if (failures.length > 0) {
      const header = failures.length === 1
        ? 'Could not load one file due to invalid format:'
        : `Could not load ${failures.length} files due to invalid format:`;
      const popup = `${header}\n\n${failures.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;
      setHintMessage(failures[0]);
      alert(popup);
    }
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
    pubchemLoadBtn.textContent = pubchemBusy ? 'hourglass_top' : 'arrow_downward';
    pubchemLoadBtn.title = pubchemBusy
      ? 'Loading PubChem…'
      : 'Search PubChem and load the selected molecule';
    pubchemLoadBtn.setAttribute('aria-label', pubchemBusy ? 'Loading PubChem' : 'Load from PubChem');
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

  /**
   * Decode one base64 string into bytes.
   * @param {string} raw
   * @returns {Uint8Array}
   */
  function decodeBase64Bytes(raw) {
    const input = String(raw || '').replace(/\s+/g, '');
    const out = atob(input);
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
    return bytes;
  }

  /**
   * Build one File object from embed payload data.
   * Expected shape: {name, text?, base64?, mimeType?}
   * @param {*} record
   * @param {number} index
   * @returns {File}
   */
  function buildEmbeddedFile(record, index) {
    if (!record || typeof record !== 'object') {
      throw new Error(`Embedded file entry ${index + 1} must be an object.`);
    }
    const name = String(record.name || '').trim();
    if (!name) throw new Error(`Embedded file entry ${index + 1} is missing a valid "name".`);
    const mimeType = String(record.mimeType || 'text/plain');
    if (Object.prototype.hasOwnProperty.call(record, 'text')) {
      return new File([String(record.text == null ? '' : record.text)], name, { type: mimeType });
    }
    if (Object.prototype.hasOwnProperty.call(record, 'base64')) {
      return new File([decodeBase64Bytes(record.base64)], name, { type: mimeType });
    }
    throw new Error(`Embedded file "${name}" must include "text" or "base64" content.`);
  }

  /**
   * Clear all loaded files and return to startup state.
   * @param {{includeHint?:boolean}=} options
   */
  function clearAllLoadedFiles(options = {}) {
    const includeHint = options.includeHint !== false;
    volumes = [];
    clearEditHistory();
    activateVolumeIndex(-1, { rebuild: false, clearSceneWhenEmpty: true });
    if (includeHint) setNavigationHint(HINT_START, { includeStyles: true });
  }

  /**
   * Load files passed from embedded/iframe integrations.
   * @param {Array<{name:string,text?:string,base64?:string,mimeType?:string}>} files
   * @param {{clearFirst?:boolean}=} options
   * @returns {Promise<{ok:boolean,loadedCount:number,loadedNames:string[]}>}
   */
  async function loadEmbeddedFiles(files, options = {}) {
    const arr = Array.isArray(files) ? files : [];
    if (arr.length === 0) throw new Error('No files were provided for embedded load.');
    const fileObjects = arr.map((entry, i) => buildEmbeddedFile(entry, i));
    const clearFirst = options.clearFirst !== false;
    if (clearFirst) clearAllLoadedFiles({ includeHint: false });
    const before = volumes.length;
    await handleFiles(fileObjects);
    const loadedCount = Math.max(0, volumes.length - before);
    return {
      ok: loadedCount > 0,
      loadedCount,
      loadedNames: fileObjects.map((f) => f.name),
    };
  }

  /**
   * Handle postMessage events used by notebook/embed integrations.
   * Request:  {type:'vibemol:load-files', requestId?, files:[...], options?}
   * Response: {type:'vibemol:load-files:result', requestId?, ok, loadedCount?, loadedNames?, error?}
   * @param {MessageEvent} event
   * @returns {Promise<void>}
   */
  async function handleEmbeddedLoadMessage(event) {
    const data = event && event.data;
    if (!data || typeof data !== 'object' || data.type !== 'vibemol:load-files') return;
    const requestId = data.requestId || null;
    const source = event && event.source;
    const postResult = (payload) => {
      if (!source || typeof source.postMessage !== 'function') return;
      const targetOrigin = (event.origin && event.origin !== 'null') ? event.origin : '*';
      source.postMessage(Object.assign({
        type: 'vibemol:load-files:result',
        requestId,
      }, payload), targetOrigin);
    };
    try {
      const result = await loadEmbeddedFiles(data.files, data.options || {});
      postResult(result);
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      postResult({ ok: false, error: message });
    }
  }

  window.addEventListener('message', (event) => { void handleEmbeddedLoadMessage(event); });
  window.VibeMolEmbed = Object.freeze({
    version: 1,
    loadFiles: (files, options = {}) => loadEmbeddedFiles(files, options),
  });

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
  clearBtn.onclick = () => clearAllLoadedFiles();

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
    const hasActive = currentIndex >= 0 && !!volumes[currentIndex];
    if (duplicateFileBtn) duplicateFileBtn.disabled = !hasActive;
    if (removeFileBtn) removeFileBtn.disabled = !hasActive;
    if (saveStructureBtn) saveStructureBtn.disabled = !hasActive;
  }

  fileSelect.onchange = () => {
    activateVolumeIndex(parseInt(fileSelect.value, 10), { preserveView: true });
  };

  // (subsample controls removed)

  isoInput.onchange = () => rebuildScene({ preserveView: true });
  if (autoIsoBtn) {
    autoIsoBtn.onclick = () => {
      autoIsoEnabled = !autoIsoEnabled;
      updateAutoIsoButtonState();
      if (!autoIsoEnabled) {
        setHintMessage('Autoiso OFF');
        return;
      }
      const active = currentIndex >= 0 ? volumes[currentIndex] : null;
      if (!active || !hasVolumetricGrid(active.vol)) {
        setHintMessage('Autoiso ON: load/select a .cube/.2ccube file to apply.');
        return;
      }
      rebuildScene({ preserveView: true });
      setHintMessage(`Autoiso ON (${Math.round(AUTO_ISO_TARGET_FRACTION * 100)}% target): cached per orbital/component.`);
    };
  }
  opInput.oninput = updateOpacityAndColors;
  posColor.oninput = () => {
    if (typeof schemeSelect !== 'undefined' && schemeSelect) schemeSelect.value = 'custom';
    syncColorPickerFields();
    updateOpacityAndColors();
  };
  negColor.oninput = () => {
    if (typeof schemeSelect !== 'undefined' && schemeSelect) schemeSelect.value = 'custom';
    syncColorPickerFields();
    updateOpacityAndColors();
  };
  bgColor.oninput = () => {
    syncColorPickerFields();
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
      syncAtomLabelNumberToggleState();
      rebuildScene({ preserveView: true });
    };
  }
  if (toggleAtomLabelNumbers) {
    toggleAtomLabelNumbers.onchange = () => {
      if (!showAtomLabels) {
        showAtomLabelNumbers = false;
        syncAtomLabelNumberToggleState();
        return;
      }
      showAtomLabelNumbers = !!toggleAtomLabelNumbers.checked;
      syncAtomLabelNumberToggleState();
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
    global2CComponentMode = compMode || DEFAULT_2C_COMPONENT_MODE;
    for (const record of volumes) setVolume2CComponent(record, global2CComponentMode);
  }

  /**
   * Resolve the active component mode for the current file.
   * @param {{isTwoComponent?:boolean}} vol
   * @returns {string}
   */
  function getComponentMode(vol) {
    return (vol && vol.isTwoComponent)
      ? (volumes[currentIndex].component || global2CComponentMode || DEFAULT_2C_COMPONENT_MODE)
      : 'alphaRe';
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
   * Hide the floating surface hover metric label.
   */
  function hideSurfaceHoverLabel() {
    if (!surfaceHoverLabelEl) return;
    surfaceHoverLabelEl.style.opacity = '0';
    surfaceHoverLabelEl.style.left = '-9999px';
    surfaceHoverLabelEl.style.top = '-9999px';
    surfaceHoverLabelEl.textContent = '';
    surfaceHoverLabelEl.setAttribute('aria-hidden', 'true');
  }

  /**
   * Position and show the floating surface hover metric label.
   * @param {PointerEvent} e
   * @param {string} text
   */
  function showSurfaceHoverLabel(e, text) {
    if (!surfaceHoverLabelEl || !text) return;
    surfaceHoverLabelEl.textContent = text;
    surfaceHoverLabelEl.setAttribute('aria-hidden', 'false');
    surfaceHoverLabelEl.style.opacity = '1';
    surfaceHoverLabelEl.style.left = '-9999px';
    surfaceHoverLabelEl.style.top = '-9999px';
    const pad = 14;
    const tipW = Math.max(120, surfaceHoverLabelEl.offsetWidth || 0);
    const tipH = Math.max(22, surfaceHoverLabelEl.offsetHeight || 0);
    let left = (Number(e.clientX) || 0) + 16;
    let top = (Number(e.clientY) || 0) + 18;
    const maxLeft = window.innerWidth - tipW - pad;
    const maxTop = window.innerHeight - tipH - pad;
    if (left > maxLeft) left = Math.max(pad, (Number(e.clientX) || 0) - tipW - 16);
    if (top > maxTop) top = Math.max(pad, (Number(e.clientY) || 0) - tipH - 18);
    surfaceHoverLabelEl.style.left = `${Math.round(left)}px`;
    surfaceHoverLabelEl.style.top = `${Math.round(top)}px`;
  }

  /**
   * Build one stable cache key for a hovered surface metric.
   * @param {*} record
   * @param {*} vol
   * @param {string} compMode
   * @param {number} iso
   * @param {*} mesh
   * @returns {string}
   */
  function buildSurfaceMetricCacheKey(record, vol, compMode, iso, mesh) {
    const meta = mesh && mesh.userData ? mesh.userData : {};
    const side = meta.sign || meta.which || (meta.totalBloch ? 'totalBloch' : 'surface');
    if (vol && vol.kind === 'molden') {
      const grid = getMoldenGridSettings(record);
      return [
        compMode,
        side,
        iso.toFixed(6),
        Number.isInteger(record && record.moldenMoIndex) ? record.moldenMoIndex : 0,
        grid.stepAng.toFixed(2),
        grid.paddingAng.toFixed(1),
        buildMoldenAtomSignature(vol),
      ].join('|');
    }
    return [compMode, side, iso.toFixed(6)].join('|');
  }

  /**
   * Compute one voxel-cell volume in bohr^3.
   * @param {*} vol
   * @returns {number}
   */
  function getVoxelCellVolumeBohr3(vol) {
    const ax = Array.isArray(vol && vol.axes && vol.axes[0]) ? vol.axes[0] : [1, 0, 0];
    const ay = Array.isArray(vol && vol.axes && vol.axes[1]) ? vol.axes[1] : [0, 1, 0];
    const az = Array.isArray(vol && vol.axes && vol.axes[2]) ? vol.axes[2] : [0, 0, 1];
    const a = new THREE.Vector3(Number(ax[0]) || 0, Number(ax[1]) || 0, Number(ax[2]) || 0);
    const b = new THREE.Vector3(Number(ay[0]) || 0, Number(ay[1]) || 0, Number(ay[2]) || 0);
    const c = new THREE.Vector3(Number(az[0]) || 0, Number(az[1]) || 0, Number(az[2]) || 0);
    return Math.abs(a.dot(new THREE.Vector3().crossVectors(b, c)));
  }

  /**
   * Compute and cache basic scalar-field integral statistics for one grid.
   * Used to distinguish positive-definite orbital amplitudes from true density-like fields.
   * @param {*} vol
   * @returns {{min:number,max:number,total:number,totalSquares:number,voxelVolume:number,l2Norm:number}|null}
   */
  function getScalarFieldIntegralStats(vol) {
    const data = vol && vol.data;
    if (!(data && typeof data.length === 'number' && data.length > 0)) return null;
    const voxelVolume = getVoxelCellVolumeBohr3(vol);
    if (!(Number.isFinite(voxelVolume) && voxelVolume > 0)) return null;
    const cached = vol && vol._scalarFieldIntegralStats;
    if (cached && cached.dataRef === data && cached.length === data.length && cached.voxelVolume === voxelVolume) {
      return cached;
    }
    let min = Infinity;
    let max = -Infinity;
    let total = 0;
    let totalSquares = 0;
    for (let i = 0; i < data.length; i++) {
      const q = Number(data[i]) || 0;
      if (q < min) min = q;
      if (q > max) max = q;
      total += q;
      totalSquares += q * q;
    }
    const result = {
      dataRef: data,
      length: data.length,
      min,
      max,
      total,
      totalSquares,
      voxelVolume,
      l2Norm: totalSquares * voxelVolume,
    };
    if (vol) vol._scalarFieldIntegralStats = result;
    return result;
  }

  /**
   * For generic cube-like scalar fields, only show the hover metric when the squared
   * field integrates to roughly 1.0. That is the only case where we treat the field
   * as an orbital amplitude rather than guessing.
   * @param {*} vol
   * @returns {boolean}
   */
  function isApproximatelyNormalizedOrbitalField(vol) {
    const stats = getScalarFieldIntegralStats(vol);
    if (!stats) return false;
    return Math.abs((Number(stats.l2Norm) || 0) - 1.0) <= 0.05;
  }

  /**
   * Compute the inside-surface electron-like metric for one hovered mesh.
   * Cached per record/component/iso/surface-side and computed lazily.
   * @param {*} record
   * @param {*} vol
   * @param {string} compMode
   * @param {number} iso
   * @param {*} mesh
   * @returns {{display:string,electrons:number,fraction:number,total:number,assumed:boolean}|null}
   */
  function getSurfaceMetric(record, vol, compMode, iso, mesh) {
    if (!record || !vol || !mesh || !hasVolumetricGrid(vol)) return null;
    if (vol.isTwoComponent) return null;
    const cacheKey = buildSurfaceMetricCacheKey(record, vol, compMode, iso, mesh);
    if (!(record.surfaceMetricCache instanceof Map)) record.surfaceMetricCache = new Map();
    if (record.surfaceMetricCache.has(cacheKey)) return record.surfaceMetricCache.get(cacheKey) || null;

    const meta = mesh.userData || {};
    const voxelVolume = getVoxelCellVolumeBohr3(vol);
    if (!(Number.isFinite(voxelVolume) && voxelVolume > 0)) return null;

    let insideWeight = 0;
    let totalWeight = 0;
    let electronCount = 0;
    let assumedOccupation = false;
    const len = (Array.isArray(vol.nxyz) ? ((vol.nxyz[0] | 0) * (vol.nxyz[1] | 0) * (vol.nxyz[2] | 0)) : 0) || 0;
    if (len <= 0) return null;

    if (!vol.isTwoComponent) {
      const isMoldenMo = vol.kind === 'molden';
      if (!isMoldenMo && !isApproximatelyNormalizedOrbitalField(vol)) {
        record.surfaceMetricCache.set(cacheKey, null);
        return null;
      }
      const occupancy = (vol.kind === 'molden'
        && vol.molden
        && Array.isArray(vol.molden.mos)
        && Number.isInteger(record.moldenMoIndex)
        && vol.molden.mos[record.moldenMoIndex]
        && Number.isFinite(vol.molden.mos[record.moldenMoIndex].occupation))
        ? Math.max(0, Number(vol.molden.mos[record.moldenMoIndex].occupation) || 0)
        : null;
      for (let t = 0; t < len; t++) {
        const q = Number(vol.data[t]) || 0;
        const weight = q * q;
        totalWeight += weight;
        const inside = meta.sign === 'neg' ? (q <= -iso) : (q >= iso);
        if (inside) insideWeight += weight;
      }
      const occ = Number.isFinite(occupancy) ? occupancy : 1;
      assumedOccupation = !Number.isFinite(occupancy);
      electronCount = totalWeight > 1e-16 ? (occ * insideWeight / totalWeight) : 0;
    }

    const totalElectrons = totalWeight > 1e-16
      ? (electronCount / (insideWeight > 1e-16 ? (insideWeight / totalWeight) : 1))
      : 0;
    const fraction = totalWeight > 1e-16 ? (insideWeight / totalWeight) : 0;
    const prefix = assumedOccupation ? '~' : '';
    const display = `${prefix}${electronCount.toFixed(3)} e • ${(fraction * 100).toFixed(1)}%`;
    const result = { display, electrons: electronCount, fraction, total: totalElectrons, assumed: assumedOccupation };
    record.surfaceMetricCache.set(cacheKey, result);
    return result;
  }

  /**
   * Raycast the currently rendered surface meshes.
   * @param {PointerEvent} e
   * @returns {{object:THREE.Mesh,point:THREE.Vector3|null,distance:number}|null}
   */
  function pickSurfaceHit(e) {
    if (!Array.isArray(meshes) || meshes.length === 0) return null;
    setRaycasterFromEvent(e);
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length || !hits[0].object) return null;
    return {
      object: hits[0].object,
      point: hits[0].point ? hits[0].point.clone() : null,
      distance: Number(hits[0].distance) || 0,
    };
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
      mesh.userData = { phaseHue: true, which, surfaceMetricKind: 'phase' };
      addSurfaceMesh(mesh);
      }
      return;
    }

    if (compMode === 'alphaBetaPhase') {
      const { maxA, maxB } = getAlphaBetaMagnitudeMaxima(vol);
      if (maxA >= iso) {
        const geomA = make2CPhaseIsosurface(vol, 'alpha', iso);
        const meshA = new THREE.Mesh(geomA, createIsoMaterial2C(opacity));
        meshA.userData = { phaseHue: true, which: 'alpha', surfaceMetricKind: 'phase' };
        addSurfaceMesh(meshA);
      }
      if (maxB >= iso) {
        const geomB = make2CPhaseIsosurface(vol, 'beta', iso);
        const meshB = new THREE.Mesh(geomB, createIsoMaterial2C(opacity));
        meshB.userData = { phaseHue: true, which: 'beta', surfaceMetricKind: 'phase' };
        addSurfaceMesh(meshB);
      }
      return;
    }

    if (compMode === 'totalBloch' && maxTotalDensity(vol) >= iso) {
      const geom = make2CTotalColoredIsosurface(vol, iso);
      const mat = createIsoMaterial2C(opacity);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.userData = { phaseHue: true, totalBloch: true, surfaceMetricKind: 'phase' };
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
      meshP.userData.surfaceMetricKind = 'scalar';
      addSurfaceMesh(meshP);
      if (geomP.index) console.log('[ISO+] triangles', (geomP.index.count / 3) | 0);
    }
    if (min <= -iso) {
      const geomN = makeIsosurface(vol, -iso);
      const meshN = new THREE.Mesh(geomN, negMat);
      meshN.userData.sign = 'neg';
      meshN.userData.surfaceMetricKind = 'scalar';
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
   * Keep 2C-specific Appearance controls in sync with the active volume/component mode.
   * @param {*} vol
   * @param {string} compMode
   */
  function syncTwoComponentUi(vol, compMode) {
    const is2c = !!(vol && vol.isTwoComponent);
    const effectiveMode = is2c
      ? (typeof compMode === 'string' && compMode
        ? compMode
        : (volumes[currentIndex] && volumes[currentIndex].component) || global2CComponentMode || DEFAULT_2C_COMPONENT_MODE)
      : DEFAULT_2C_COMPONENT_MODE;

    if (twoComponentModeRow) {
      twoComponentModeRow.style.display = is2c ? 'grid' : 'none';
    }
    if (twoComponentModeSelect) {
      twoComponentModeSelect.value = effectiveMode;
    }

    try {
      if (schemeSelect) {
        schemeSelect.disabled = is2c && isPhaseLikeComponent(effectiveMode);
        schemeSelect.title = schemeSelect.disabled
          ? 'Disabled: 2C mode uses intrinsic colors'
          : 'Choose default +/- surface colors';
      }
    } catch { }

    if (!phaseWheelEl) return;
    const showPhaseWheel = is2c && isPhaseLikeComponent(effectiveMode);
    phaseWheelEl.style.display = showPhaseWheel ? 'block' : 'none';
    if (showPhaseWheel) {
      drawPhaseWheel(effectiveMode, effectiveMode === 'totalBloch' ? 'bloch' : 'phase');
    }
  }

  /**
   * Update UI controls and phase legend visibility after scene rebuild.
   * @param {*} vol
   * @param {string} compMode
   */
  function updatePostRebuildUI(vol, compMode) {
    syncTwoComponentUi(vol, compMode);
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
    if (!viewState.defaultView) {
      viewState.defaultView = {
        cam: camera.clone(),
        target: controls.target.clone(),
        contentPos: contentGroup.position.clone(),
        projectionMode: viewState.mode,
      };
    }
  }

  /**
   * Recompute scene content for the active file and current render settings.
   * @param {{preserveView?:boolean, skipAutoIso?:boolean}} options
   */
  function rebuildScene(options = {}) {
    const preserveView = !!options.preserveView;
    const skipAutoIso = !!options.skipAutoIso;
    const savedCam = preserveView ? camera.clone() : null;
    const savedTarget = preserveView ? controls.target.clone() : null;
    if (currentIndex < 0) {
      updateEmptyStateVisibility();
      return;
    }

    clearSceneMeshes();
    const record = volumes[currentIndex];
    const vol = record && record.vol;
    if (vol && vol.kind === 'molden') {
      try {
        ensureMoldenGridForRecord(record, vol);
      } catch (err) {
        clearMoldenGrid(vol);
        console.error('[MOLDEN] Grid evaluation failed', err);
        setHintMessage(`Molden MO rendering failed: ${err && err.message ? err.message : String(err)}`);
      }
    }
    const compMode = getComponentMode(vol);
    selectActiveRawComponent(vol, compMode);
    const hasGrid = hasVolumetricGrid(vol);

    if (!skipAutoIso && autoIsoEnabled && hasGrid) {
      try {
        applyAutoIsoToIsoInput(record, vol, compMode);
      } catch {
        // Keep manual iso value when auto-iso estimation fails.
      }
    }

    const { min, max } = computeVolumeStats(vol, compMode, arrayMinMax);
    const iso = parseFloat(isoInput.value || "0.02");
    const opacity = parseFloat(opInput.value || "1.00");
    const posMat = createIsoMaterial('pos', opacity);
    const negMat = createIsoMaterial('neg', opacity);

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
    updateSelectedHalos();
    updateTransformBondSelectionHalos();
    updateTransformSelectionGuides();
  }

  /**
   * Update material opacity/color state in-place for already-built meshes/clouds.
   */
  function updateOpacityAndColors() {
    const op = parseFloat(opInput.value || "1.00");
    updateOpacityPercentLabel();
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
      clearEditHistory();
      volumes.push({ name: 'sample.cube', vol, isSample: true });
      if (vol.isoHint != null && (isoInput.value === '' || volumes.length === 1)) {
        isoInput.value = String(vol.isoHint);
      }
      try {
        const stats = arrayMinMax(vol.data);
        console.log('[CUBE] Loaded sample.cube', { title: vol.title, nxyz: vol.nxyz, origin: vol.origin, axes: vol.axes, natoms: vol.natoms, isoHint: vol.isoHint, min: stats.min, max: stats.max });
      } catch (e) {
        console.warn('[CUBE] Stats failed for sample.cube', e);
      }
      activateVolumeIndex(0);
      setNavigationHint('Loaded sample.cube', { includeStyles: true });
      return true;
    } catch (err) {
      console.warn('[CUBE] Could not auto-load sample.cube:', err);
      return false;
    }
  }

  /**
   * Load a bundled set of cube-like files and replace the current scene contents.
   * Used by onboarding quick actions for curated example datasets.
   * @param {string[]} filePaths
   * @param {string} label
   * @returns {Promise<boolean>}
   */
  async function loadBundledVolumeSet(filePaths, label) {
    const paths = Array.isArray(filePaths) ? filePaths.filter(Boolean) : [];
    if (!paths.length) return false;
    try {
      const records = [];
      for (const path of paths) {
        const resp = await fetch(path, { cache: 'no-store' });
        if (!resp.ok) throw new Error(`${path}: HTTP ${resp.status}`);
        const text = await resp.text();
        const name = String(path.split('/').pop() || path);
        const vol = parseVolumeByName(name, text);
        records.push({ name, vol });
      }
      volumes = [];
      currentIndex = -1;
      clearSceneMeshes();
      clearEditHistory();
      for (const item of records) appendParsedVolumeRecord(item.name, item.vol, { isSample: true });
      finalizeLoadedVolumes(0, {
        resetIsoToDefault: true,
        skipAutoIsoOnInitialRebuild: true,
      });
      setNavigationHint(`Loaded ${label}`, { includeStyles: true });
      return true;
    } catch (err) {
      console.warn(`[CUBE] Could not load bundled dataset ${label}:`, err);
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
      { Z: (ATOM_SYMBOL_TO_Z.O || 8), x: 0, y: 0, z: 0, formalCharge: 0 },
      { Z: (ATOM_SYMBOL_TO_Z.H || 1), x: hx * ANG_TO_BOHR, y: 0, z: hz * ANG_TO_BOHR, formalCharge: 0 },
      { Z: (ATOM_SYMBOL_TO_Z.H || 1), x: -hx * ANG_TO_BOHR, y: 0, z: hz * ANG_TO_BOHR, formalCharge: 0 },
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
    const vol = ensureVolumeSchema({ title: 'Demo Water', comment: '', natoms: 3, origin, nxyz: [nx, ny, nz], axes, atoms, data, idx, isoHint: null });
    volumes.push({ name: 'Demo Water', vol });
    activateVolumeIndex(0);
  }

  // Startup: begin with an empty scene and onboarding text.
  updateEmptyStateVisibility();

  // Keyboard shortcuts are handled by the mode-aware router defined above.

})();
