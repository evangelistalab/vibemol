(function (global) {
  'use strict';

  const EXPORT_MODES = Object.freeze({
    IDLE: 'idle',
    SELECTING: 'selecting',
    RECORDING: 'recording',
  });

  const DEFAULTS = Object.freeze({
    minWidth: 160,
    minHeight: 90,
    defaultMinWidth: 320,
    defaultMinHeight: 180,
    defaultWidthRatio: 0.7,
    dimensionOffset: 6,
    actionsOffset: 8,
    captureFps: 30,
    filename: 'trajectory.webm',
  });

  function clampCanvasVideoNumber(value, min, max) {
    const lo = Number.isFinite(min) ? min : 0;
    const hi = Number.isFinite(max) ? max : lo;
    if (hi <= lo) return lo;
    const n = Number(value);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
  }

  function roundCanvasVideoEven(value, minimum = 2) {
    const floor = Math.max(2, Number.isFinite(Number(minimum)) ? Math.round(Number(minimum)) : 2);
    let out = Math.max(floor, Math.round(Number(value) || 0));
    if ((out % 2) !== 0) out += 1;
    return out;
  }

  function normalizeCanvasVideoBounds(bounds) {
    return {
      width: Math.max(1, Math.round(Number(bounds && bounds.width) || 1)),
      height: Math.max(1, Math.round(Number(bounds && bounds.height) || 1)),
    };
  }

  function normalizeCanvasVideoCropRect(rect, bounds, options = {}) {
    const nextBounds = normalizeCanvasVideoBounds(bounds);
    const minWidth = Math.min(
      Math.max(1, Number.isFinite(Number(options.minWidth)) ? Number(options.minWidth) : DEFAULTS.minWidth),
      nextBounds.width
    );
    const minHeight = Math.min(
      Math.max(1, Number.isFinite(Number(options.minHeight)) ? Number(options.minHeight) : DEFAULTS.minHeight),
      nextBounds.height
    );
    const width = clampCanvasVideoNumber(rect && rect.width, minWidth, nextBounds.width);
    const height = clampCanvasVideoNumber(rect && rect.height, minHeight, nextBounds.height);
    const x = clampCanvasVideoNumber(rect && rect.x, 0, Math.max(0, nextBounds.width - width));
    const y = clampCanvasVideoNumber(rect && rect.y, 0, Math.max(0, nextBounds.height - height));
    return { x, y, width, height };
  }

  function createDefaultCanvasVideoCropRect(bounds, options = {}) {
    const nextBounds = normalizeCanvasVideoBounds(bounds);
    const defaultWidthRatio = Number.isFinite(Number(options.defaultWidthRatio))
      ? Number(options.defaultWidthRatio)
      : DEFAULTS.defaultWidthRatio;
    const defaultMinWidth = Math.max(1, Number.isFinite(Number(options.defaultMinWidth))
      ? Number(options.defaultMinWidth)
      : DEFAULTS.defaultMinWidth);
    const defaultMinHeight = Math.max(1, Number.isFinite(Number(options.defaultMinHeight))
      ? Number(options.defaultMinHeight)
      : DEFAULTS.defaultMinHeight);
    let width = Math.round(nextBounds.width * defaultWidthRatio);
    width = Math.max(defaultMinWidth, width);
    width = Math.min(nextBounds.width, width);
    let height = Math.round((nextBounds.width * defaultWidthRatio * 9) / 16);
    height = Math.max(defaultMinHeight, height);
    height = Math.min(nextBounds.height, height);
    return normalizeCanvasVideoCropRect({
      x: Math.round((nextBounds.width - width) * 0.5),
      y: Math.round((nextBounds.height - height) * 0.5),
      width,
      height,
    }, nextBounds, options);
  }

  function resolveCanvasVideoOverlayLayout(rect, bounds, measurements = {}, options = {}) {
    const nextBounds = normalizeCanvasVideoBounds(bounds);
    const nextRect = normalizeCanvasVideoCropRect(rect, nextBounds, options);
    const dimensionWidth = Math.max(0, Number(measurements.dimensionWidth) || 0);
    const dimensionHeight = Math.max(0, Number(measurements.dimensionHeight) || 0);
    const actionsWidth = Math.max(0, Number(measurements.actionsWidth) || 0);
    const actionsHeight = Math.max(0, Number(measurements.actionsHeight) || 0);
    const dimensionOffset = Number.isFinite(Number(options.dimensionOffset))
      ? Number(options.dimensionOffset)
      : DEFAULTS.dimensionOffset;
    const actionsOffset = Number.isFinite(Number(options.actionsOffset))
      ? Number(options.actionsOffset)
      : DEFAULTS.actionsOffset;

    let dimensionLeft = nextRect.x + nextRect.width + dimensionOffset;
    let dimensionTop = nextRect.y - dimensionHeight - dimensionOffset;
    let dimensionInside = false;
    if ((dimensionLeft + dimensionWidth) > nextBounds.width || dimensionTop < 0) {
      dimensionInside = true;
      dimensionLeft = nextRect.x + nextRect.width - dimensionWidth - dimensionOffset;
      dimensionTop = nextRect.y + dimensionOffset;
    }
    dimensionLeft = clampCanvasVideoNumber(dimensionLeft, 0, Math.max(0, nextBounds.width - dimensionWidth));
    dimensionTop = clampCanvasVideoNumber(dimensionTop, 0, Math.max(0, nextBounds.height - dimensionHeight));

    const halfActionsWidth = actionsWidth * 0.5;
    const actionsLeft = clampCanvasVideoNumber(
      nextRect.x + nextRect.width * 0.5,
      halfActionsWidth,
      Math.max(halfActionsWidth, nextBounds.width - halfActionsWidth)
    );
    let actionsTop = nextRect.y + nextRect.height + actionsOffset;
    let actionsAbove = false;
    if ((actionsTop + actionsHeight) > nextBounds.height) {
      actionsAbove = true;
      actionsTop = nextRect.y - actionsHeight - actionsOffset;
    }
    actionsTop = clampCanvasVideoNumber(actionsTop, 0, Math.max(0, nextBounds.height - actionsHeight));

    return {
      rect: nextRect,
      dimensions: {
        left: dimensionLeft,
        top: dimensionTop,
        inside: dimensionInside,
      },
      actions: {
        left: actionsLeft,
        top: actionsTop,
        above: actionsAbove,
      },
    };
  }

  function supportsCanvasVideoExport(env = global) {
    const doc = env && env.document;
    const RecorderCtor = env && env.MediaRecorder;
    const CanvasCtor = env && env.HTMLCanvasElement;
    if (!doc || typeof doc.createElement !== 'function') return false;
    if (typeof RecorderCtor === 'undefined') return false;
    if (!CanvasCtor || !CanvasCtor.prototype) return false;
    if (typeof CanvasCtor.prototype.captureStream !== 'function') return false;
    const probeCanvas = doc.createElement('canvas');
    return !!(probeCanvas && typeof probeCanvas.getContext === 'function' && probeCanvas.getContext('2d'));
  }

  function getCanvasVideoMimeCandidates() {
    return [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
  }

  function createCanvasVideoRecorder(stream, RecorderCtor = global && global.MediaRecorder) {
    if (!RecorderCtor) return null;
    const candidates = getCanvasVideoMimeCandidates();
    const supported = typeof RecorderCtor.isTypeSupported === 'function'
      ? candidates.filter((candidate) => RecorderCtor.isTypeSupported(candidate))
      : candidates.slice();
    const attempts = supported.length ? supported : candidates.slice(-1);
    for (const mimeType of attempts) {
      try {
        const recorder = mimeType ? new RecorderCtor(stream, { mimeType }) : new RecorderCtor(stream);
        return { recorder, mimeType };
      } catch { }
    }
    try {
      return { recorder: new RecorderCtor(stream), mimeType: 'video/webm' };
    } catch {
      return null;
    }
  }

  function createCanvasVideoExportController(deps) {
    const options = deps || {};
    const elements = options.elements || {};
    const saveBtn = elements.saveBtn || null;
    const cropOverlayEl = elements.cropOverlayEl || null;
    const cropFrameEl = elements.cropFrameEl || null;
    const cropDimensionsEl = elements.cropDimensionsEl || null;
    const cropActionsEl = elements.cropActionsEl || null;
    const cropStartBtnEl = elements.cropStartBtnEl || null;
    const cropCancelBtnEl = elements.cropCancelBtnEl || null;
    const sourceCanvasEl = elements.sourceCanvasEl || null;
    const getDisabledElements = typeof options.getDisabledElements === 'function'
      ? options.getDisabledElements
      : () => [];
    const syncSecondaryControls = typeof options.syncSecondaryControls === 'function'
      ? options.syncSecondaryControls
      : null;
    const prepareSceneForRecording = typeof options.prepareSceneForRecording === 'function'
      ? options.prepareSceneForRecording
      : null;
    const captureSessionState = typeof options.captureSessionState === 'function'
      ? options.captureSessionState
      : null;
    const restoreSessionState = typeof options.restoreSessionState === 'function'
      ? options.restoreSessionState
      : null;
    const resolveRecordingAdvance = typeof options.resolveRecordingAdvance === 'function'
      ? options.resolveRecordingAdvance
      : null;
    const getTargetRecord = typeof options.getTargetRecord === 'function'
      ? options.getTargetRecord
      : (info) => (info && Object.prototype.hasOwnProperty.call(info, 'record') ? info.record : null);
    const labels = Object.assign({
      save: 'Save video',
      hideOverlay: 'Hide video crop overlay',
      recording: 'Recording… click to stop early',
      unsupported: 'Video export not supported in this browser',
      unavailable: 'No exportable animation in active file',
      panelClosedReason: 'Video export discarded because the panel was closed',
      sourceChangeReason: 'Video export discarded after active file change',
      completedReason: 'Video export completed',
      stoppedEarlyReason: 'Video export stopped early by the user',
      copyFailureReason: 'Video export failed while copying frames',
      recorderErrorReason: 'Video export stopped after MediaRecorder error',
      startFailureReason: 'Video export failed to start',
    }, options.labels || {});
    const icons = Object.assign({
      save: 'videocam',
      hideOverlay: 'videocam_off',
      recording: 'stop_circle',
    }, options.icons || {});
    const filename = String(options.filename || DEFAULTS.filename);
    const logPrefix = String(options.logPrefix || 'canvas-video');

    const requiredFns = [
      'getOverlayBounds',
      'getActiveInfo',
      'readRendererViewportMetrics',
      'cssRectToBufferRect',
      'hideActiveTooltip',
      'setButtonGlyph',
      'setTooltipText',
      'syncPrimaryControls',
      'getPlaybackState',
      'setPlaybackState',
      'canResumePlayback',
      'getCaptureFps',
      'startRecordingSequence',
    ];
    for (const key of requiredFns) {
      if (typeof options[key] !== 'function') {
        throw new Error(`VibeMolTrajectoryVideo requires ${key}.`);
      }
    }

    const state = {
      mode: EXPORT_MODES.IDLE,
      targetRecord: null,
      cropRectCss: null,
      drag: null,
      recorder: null,
      chunks: [],
      mimeType: '',
      captureCanvas: null,
      captureCtx: null,
      cropBufferRect: null,
      pendingStopAfterRender: false,
      stopRequested: false,
      shouldDownloadOnStop: false,
      restoreOnStop: true,
      stopReason: '',
      savedState: null,
    };

    function getMode() {
      return state.mode;
    }

    function isSelecting() {
      return state.mode === EXPORT_MODES.SELECTING;
    }

    function isRecording() {
      return state.mode === EXPORT_MODES.RECORDING;
    }

    function isActive() {
      return state.mode !== EXPORT_MODES.IDLE;
    }

    function getTargetRecordValue() {
      return state.targetRecord;
    }

    function getOverlayBounds() {
      return normalizeCanvasVideoBounds(options.getOverlayBounds());
    }

    function setButtonText(btn, text) {
      if (!btn) return;
      const next = String(text || '').trim();
      options.setTooltipText(btn, next);
      if (next) {
        btn.setAttribute('aria-label', next);
        btn.setAttribute('data-tooltip', next);
      } else {
        btn.removeAttribute('aria-label');
        btn.removeAttribute('data-tooltip');
      }
      btn.removeAttribute('title');
    }

    function listDisabledElements() {
      const raw = getDisabledElements();
      return Array.isArray(raw) ? raw.filter(Boolean) : [];
    }

    function getCropBufferRect(rectCss) {
      const metrics = options.readRendererViewportMetrics();
      const raw = options.cssRectToBufferRect(metrics, rectCss.x, rectCss.y, rectCss.width, rectCss.height);
      let width = Math.max(2, Math.min(metrics.bufferWidth - raw.x, raw.width));
      let height = Math.max(2, Math.min(metrics.bufferHeight - raw.y, raw.height));
      if ((width % 2) !== 0) width = Math.max(2, width - 1);
      if ((height % 2) !== 0) height = Math.max(2, height - 1);
      if (!(width > 1 && height > 1)) return null;
      const x = clampCanvasVideoNumber(raw.x, 0, Math.max(0, metrics.bufferWidth - width));
      const y = clampCanvasVideoNumber(raw.y, 0, Math.max(0, metrics.bufferHeight - height));
      return { x, y, width, height };
    }

    function syncOverlayLayout() {
      if (!cropOverlayEl || !cropFrameEl || !cropDimensionsEl || !cropActionsEl) return;
      const visible = isActive();
      cropOverlayEl.setAttribute('aria-hidden', visible ? 'false' : 'true');
      cropOverlayEl.dataset.state = state.mode;
      cropFrameEl.classList.toggle('is-dragging', !!(state.drag && state.drag.kind === 'move'));
      if (!visible) {
        cropFrameEl.style.left = '0px';
        cropFrameEl.style.top = '0px';
        cropFrameEl.style.width = '0px';
        cropFrameEl.style.height = '0px';
        return;
      }
      if (!isSelecting()) return;
      const bounds = getOverlayBounds();
      state.cropRectCss = normalizeCanvasVideoCropRect(
        state.cropRectCss || createDefaultCanvasVideoCropRect(bounds),
        bounds
      );
      const dimBox = cropDimensionsEl.getBoundingClientRect();
      const actionsBox = cropActionsEl.getBoundingClientRect();
      const layout = resolveCanvasVideoOverlayLayout(state.cropRectCss, bounds, {
        dimensionWidth: dimBox.width,
        dimensionHeight: dimBox.height,
        actionsWidth: actionsBox.width,
        actionsHeight: actionsBox.height,
      });
      const rect = layout.rect;
      cropFrameEl.style.left = `${rect.x}px`;
      cropFrameEl.style.top = `${rect.y}px`;
      cropFrameEl.style.width = `${rect.width}px`;
      cropFrameEl.style.height = `${rect.height}px`;
      cropDimensionsEl.textContent = `${roundCanvasVideoEven(rect.width)} × ${roundCanvasVideoEven(rect.height)}`;
      cropDimensionsEl.style.left = `${layout.dimensions.left}px`;
      cropDimensionsEl.style.top = `${layout.dimensions.top}px`;
      cropActionsEl.style.left = `${layout.actions.left}px`;
      cropActionsEl.style.top = `${layout.actions.top}px`;
    }

    function clearSelectionUi() {
      state.mode = EXPORT_MODES.IDLE;
      state.targetRecord = null;
      state.cropRectCss = null;
      state.drag = null;
      syncOverlayLayout();
    }

    function syncUi(info = null) {
      const nextInfo = info || options.getActiveInfo();
      const supported = supportsCanvasVideoExport(global);
      const selecting = isSelecting();
      const recording = isRecording();
      if (saveBtn) {
        let label = labels.save;
        let glyph = icons.save;
        let disabled = false;
        if (!supported) {
          label = labels.unsupported;
          disabled = true;
        } else if (!(nextInfo && nextInfo.enabled)) {
          label = labels.unavailable;
          disabled = true;
        } else if (recording) {
          label = labels.recording;
          glyph = icons.recording;
        } else if (selecting) {
          label = labels.hideOverlay;
          glyph = icons.hideOverlay;
        }
        saveBtn.disabled = !!disabled;
        saveBtn.classList.toggle('is-active', selecting);
        saveBtn.classList.toggle('is-recording', recording);
        saveBtn.setAttribute('aria-pressed', (selecting || recording) ? 'true' : 'false');
        options.setButtonGlyph(saveBtn, glyph);
        setButtonText(saveBtn, label);
      }
      const controlsDisabled = recording;
      for (const el of listDisabledElements()) {
        el.disabled = controlsDisabled;
      }
      syncOverlayLayout();
    }

    function commitCaptureRate(info = null) {
      const nextInfo = info || options.getActiveInfo();
      const fallback = Math.max(1, Math.min(120, Math.round(Number(DEFAULTS.captureFps) || 30)));
      const rate = Number(options.getCaptureFps(nextInfo));
      return Math.max(1, Math.min(120, Math.round(Number.isFinite(rate) ? rate : fallback)));
    }

    function downloadVideoBlob(chunks, mimeType) {
      const blob = new Blob(Array.isArray(chunks) ? chunks : [], { type: mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }

    function syncAllControls() {
      options.syncPrimaryControls();
      if (syncSecondaryControls) syncSecondaryControls();
    }

    function finalizeExport(optionsForFinalize = {}) {
      const shouldDownload = optionsForFinalize.download !== false;
      const shouldRestore = optionsForFinalize.restore !== false;
      const stopReason = String(optionsForFinalize.reason || '');
      const snapshot = state.savedState;
      const chunks = state.chunks.slice();
      const mimeType = state.mimeType || 'video/webm';
      if (state.recorder) {
        state.recorder.ondataavailable = null;
        state.recorder.onstop = null;
        state.recorder.onerror = null;
      }
      state.mode = EXPORT_MODES.IDLE;
      state.targetRecord = null;
      state.cropRectCss = null;
      state.drag = null;
      state.recorder = null;
      state.chunks = [];
      state.mimeType = '';
      state.captureCanvas = null;
      state.captureCtx = null;
      state.cropBufferRect = null;
      state.pendingStopAfterRender = false;
      state.stopRequested = false;
      state.shouldDownloadOnStop = false;
      state.restoreOnStop = true;
      state.stopReason = '';
      state.savedState = null;
      if (shouldRestore && restoreSessionState) restoreSessionState(snapshot);
      if (shouldDownload) {
        downloadVideoBlob(chunks, mimeType);
      } else if (stopReason) {
        console.info(`[${logPrefix}] ${stopReason}`);
      }
      syncAllControls();
    }

    function stopRecording(stopOptions = {}) {
      if (!isRecording()) return;
      if (state.stopRequested) return;
      state.stopRequested = true;
      state.pendingStopAfterRender = false;
      state.shouldDownloadOnStop = stopOptions.download !== false;
      state.restoreOnStop = stopOptions.restoreState !== false;
      state.stopReason = String(stopOptions.reason || '');
      options.setPlaybackState({ playing: false, lastStepMs: 0 });
      const recorder = state.recorder;
      if (!recorder || recorder.state === 'inactive') {
        finalizeExport({
          download: state.shouldDownloadOnStop,
          restore: state.restoreOnStop,
          reason: state.stopReason,
        });
        return;
      }
      try {
        recorder.stop();
      } catch (error) {
        console.error(`[${logPrefix}] Failed to stop recorder`, error);
        finalizeExport({
          download: state.shouldDownloadOnStop,
          restore: state.restoreOnStop,
          reason: state.stopReason || labels.recorderErrorReason,
        });
      }
    }

    function copyFrameAfterRender() {
      if (!isRecording()) return;
      const ctx = state.captureCtx;
      const rect = state.cropBufferRect;
      if (!ctx || !rect || !sourceCanvasEl) return;
      try {
        ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.drawImage(sourceCanvasEl, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      } catch (error) {
        console.error(`[${logPrefix}] Failed to copy cropped canvas frame`, error);
        stopRecording({ download: false, restoreState: true, reason: labels.copyFailureReason });
        return;
      }
      if (state.pendingStopAfterRender) {
        stopRecording({ download: true, restoreState: true, reason: labels.completedReason });
      }
    }

    function openCropOverlay() {
      const info = options.getActiveInfo();
      if (!(info && info.enabled) || !supportsCanvasVideoExport(global)) return;
      options.hideActiveTooltip();
      state.mode = EXPORT_MODES.SELECTING;
      state.targetRecord = getTargetRecord(info);
      state.cropRectCss = createDefaultCanvasVideoCropRect(getOverlayBounds());
      state.drag = null;
      options.syncPrimaryControls();
    }

    function closeCropOverlay() {
      if (!isSelecting()) return;
      clearSelectionUi();
      options.syncPrimaryControls();
    }

    function startRecording() {
      const info = options.getActiveInfo();
      if (!(info && info.enabled && isSelecting())) return;
      if (!supportsCanvasVideoExport(global)) {
        options.syncPrimaryControls();
        return;
      }
      const cropRectCss = normalizeCanvasVideoCropRect(
        state.cropRectCss || createDefaultCanvasVideoCropRect(getOverlayBounds()),
        getOverlayBounds()
      );
      const cropBufferRect = getCropBufferRect(cropRectCss);
      if (!cropBufferRect) return;
      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = cropBufferRect.width;
      captureCanvas.height = cropBufferRect.height;
      const captureCtx = captureCanvas.getContext('2d');
      if (!captureCtx) {
        console.error(`[${logPrefix}] 2D context unavailable for cropped recording canvas`);
        closeCropOverlay();
        return;
      }
      const captureFps = commitCaptureRate(info);
      let stream = null;
      try {
        stream = captureCanvas.captureStream(captureFps);
      } catch (error) {
        console.error(`[${logPrefix}] canvas.captureStream() failed`, error);
        closeCropOverlay();
        return;
      }
      const recorderInfo = createCanvasVideoRecorder(stream);
      if (!(recorderInfo && recorderInfo.recorder)) {
        console.error(`[${logPrefix}] MediaRecorder could not be constructed for WebM export`);
        closeCropOverlay();
        return;
      }
      if (prepareSceneForRecording) prepareSceneForRecording(info);
      options.hideActiveTooltip();
      state.mode = EXPORT_MODES.RECORDING;
      state.targetRecord = getTargetRecord(info);
      state.cropRectCss = cropRectCss;
      state.drag = null;
      state.recorder = recorderInfo.recorder;
      state.chunks = [];
      state.mimeType = recorderInfo.mimeType;
      state.captureCanvas = captureCanvas;
      state.captureCtx = captureCtx;
      state.cropBufferRect = cropBufferRect;
      state.pendingStopAfterRender = false;
      state.stopRequested = false;
      state.shouldDownloadOnStop = true;
      state.restoreOnStop = true;
      state.stopReason = '';
      state.savedState = captureSessionState ? captureSessionState(info) : null;
      recorderInfo.recorder.ondataavailable = (event) => {
        if (event && event.data && (typeof event.data.size !== 'number' || event.data.size > 0)) {
          state.chunks.push(event.data);
        }
      };
      recorderInfo.recorder.onerror = (event) => {
        console.error(`[${logPrefix}] MediaRecorder error`, event && event.error ? event.error : event);
        stopRecording({ download: false, restoreState: true, reason: labels.recorderErrorReason });
      };
      recorderInfo.recorder.onstop = () => {
        finalizeExport({
          download: state.shouldDownloadOnStop,
          restore: state.restoreOnStop,
          reason: state.stopReason,
        });
      };
      try {
        options.startRecordingSequence(info);
        recorderInfo.recorder.start();
      } catch (error) {
        console.error(`[${logPrefix}] Failed to start MediaRecorder`, error);
        finalizeExport({ download: false, restore: true, reason: labels.startFailureReason });
        return;
      }
      syncAllControls();
    }

    function discardForTargetRecordChange(reason = labels.sourceChangeReason) {
      if (isRecording()) {
        stopRecording({
          download: false,
          restoreState: false,
          reason,
        });
      } else if (isSelecting()) {
        clearSelectionUi();
      }
    }

    function handlePanelClosed(closeOptions = {}) {
      if (isRecording()) {
        stopRecording({
          download: false,
          restoreState: closeOptions.restoreState !== false,
          reason: String(closeOptions.reason || labels.panelClosedReason),
        });
      } else if (isSelecting()) {
        clearSelectionUi();
      }
    }

    function resolveAdvance(...args) {
      if (!isRecording() || !resolveRecordingAdvance) return null;
      const result = resolveRecordingAdvance(...args) || null;
      if (result && result.stopPlayback) state.pendingStopAfterRender = true;
      return result;
    }

    function beginCropDrag(event) {
      if (!isSelecting()) return;
      if (!event || event.button !== 0) return;
      if (cropActionsEl && cropActionsEl.contains(event.target)) return;
      if (!(cropFrameEl && cropFrameEl.contains(event.target))) return;
      const handleEl = event.target && event.target.closest ? event.target.closest('.vm-canvas-video-export__handle') : null;
      const corner = handleEl ? String(handleEl.dataset.corner || '') : '';
      state.drag = {
        pointerId: event.pointerId,
        kind: corner ? 'resize' : 'move',
        corner,
        startX: event.clientX,
        startY: event.clientY,
        rect: normalizeCanvasVideoCropRect(
          state.cropRectCss || createDefaultCanvasVideoCropRect(getOverlayBounds()),
          getOverlayBounds()
        ),
      };
      if (cropFrameEl) cropFrameEl.classList.toggle('is-dragging', !corner);
      if (typeof cropOverlayEl.setPointerCapture === 'function') {
        try { cropOverlayEl.setPointerCapture(event.pointerId); } catch { }
      }
      event.preventDefault();
      event.stopPropagation();
    }

    function updateCropDrag(event) {
      if (!isSelecting() || !state.drag) return;
      if ((state.drag.pointerId | 0) !== (event.pointerId | 0)) return;
      const bounds = getOverlayBounds();
      const origin = state.drag.rect;
      const dx = event.clientX - state.drag.startX;
      const dy = event.clientY - state.drag.startY;
      if (state.drag.kind === 'move') {
        state.cropRectCss = normalizeCanvasVideoCropRect({
          x: origin.x + dx,
          y: origin.y + dy,
          width: origin.width,
          height: origin.height,
        }, bounds);
      } else {
        let left = origin.x;
        let top = origin.y;
        let right = origin.x + origin.width;
        let bottom = origin.y + origin.height;
        const minWidth = Math.min(DEFAULTS.minWidth, bounds.width);
        const minHeight = Math.min(DEFAULTS.minHeight, bounds.height);
        if (state.drag.corner.includes('n')) {
          top = clampCanvasVideoNumber(origin.y + dy, 0, bottom - minHeight);
        }
        if (state.drag.corner.includes('s')) {
          bottom = clampCanvasVideoNumber(origin.y + origin.height + dy, top + minHeight, bounds.height);
        }
        if (state.drag.corner.includes('w')) {
          left = clampCanvasVideoNumber(origin.x + dx, 0, right - minWidth);
        }
        if (state.drag.corner.includes('e')) {
          right = clampCanvasVideoNumber(origin.x + origin.width + dx, left + minWidth, bounds.width);
        }
        state.cropRectCss = normalizeCanvasVideoCropRect({
          x: left,
          y: top,
          width: right - left,
          height: bottom - top,
        }, bounds);
      }
      syncOverlayLayout();
      event.preventDefault();
      event.stopPropagation();
    }

    function releaseCropDrag(event) {
      if (!state.drag) return;
      if (event && Number.isInteger(state.drag.pointerId) && cropOverlayEl && typeof cropOverlayEl.releasePointerCapture === 'function') {
        try { cropOverlayEl.releasePointerCapture(state.drag.pointerId); } catch { }
      }
      state.drag = null;
      if (cropFrameEl) cropFrameEl.classList.remove('is-dragging');
      syncOverlayLayout();
    }

    function bindEvents() {
      if (saveBtn) {
        saveBtn.addEventListener('pointerdown', (event) => {
          if (event && event.preventDefault) event.preventDefault();
          if (event && event.stopPropagation) event.stopPropagation();
        });
        saveBtn.addEventListener('click', (event) => {
          if (event && event.preventDefault) event.preventDefault();
          if (event && event.stopPropagation) event.stopPropagation();
          if (isRecording()) {
            stopRecording({
              download: true,
              restoreState: true,
              reason: labels.stoppedEarlyReason,
            });
            return;
          }
          if (isSelecting()) {
            closeCropOverlay();
            return;
          }
          openCropOverlay();
        });
      }
      if (cropStartBtnEl) cropStartBtnEl.addEventListener('click', () => startRecording());
      if (cropCancelBtnEl) cropCancelBtnEl.addEventListener('click', () => closeCropOverlay());
      if (!cropOverlayEl) return;
      cropOverlayEl.addEventListener('contextmenu', (event) => {
        if (!isActive()) return;
        event.preventDefault();
      });
      cropOverlayEl.addEventListener('wheel', (event) => {
        if (!isActive()) return;
        event.preventDefault();
      }, { passive: false });
      cropOverlayEl.addEventListener('pointerdown', beginCropDrag);
      cropOverlayEl.addEventListener('pointermove', updateCropDrag);
      cropOverlayEl.addEventListener('pointerup', (event) => {
        if (!state.drag) return;
        if ((state.drag.pointerId | 0) !== (event.pointerId | 0)) return;
        releaseCropDrag(event);
        event.preventDefault();
        event.stopPropagation();
      });
      cropOverlayEl.addEventListener('pointercancel', releaseCropDrag);
    }

    bindEvents();
    syncUi();

    return Object.freeze({
      EXPORT_MODES,
      getMode,
      isSelecting,
      isRecording,
      isActive,
      getTargetRecord: getTargetRecordValue,
      onResize: syncOverlayLayout,
      syncUi,
      commitCaptureRate,
      openCropOverlay,
      closeCropOverlay,
      startRecording,
      stopRecording,
      discardForTargetRecordChange,
      handlePanelClosed,
      resolveAdvance,
      copyFrameAfterRender,
    });
  }

  global.VibeMolTrajectoryVideo = Object.freeze({
    EXPORT_MODES,
    DEFAULTS,
    clampCanvasVideoNumber,
    roundCanvasVideoEven,
    normalizeCanvasVideoCropRect,
    createDefaultCanvasVideoCropRect,
    resolveCanvasVideoOverlayLayout,
    supportsCanvasVideoExport,
    getCanvasVideoMimeCandidates,
    createCanvasVideoRecorder,
    createCanvasVideoExportController,
    clampTrajectoryVideoNumber: clampCanvasVideoNumber,
    roundTrajectoryVideoEven: roundCanvasVideoEven,
    normalizeTrajectoryVideoCropRect: normalizeCanvasVideoCropRect,
    createDefaultTrajectoryVideoCropRect: createDefaultCanvasVideoCropRect,
    resolveTrajectoryVideoOverlayLayout: resolveCanvasVideoOverlayLayout,
    supportsTrajectoryVideoExport: supportsCanvasVideoExport,
    getTrajectoryVideoMimeCandidates: getCanvasVideoMimeCandidates,
    createTrajectoryVideoRecorder: createCanvasVideoRecorder,
    createTrajectoryVideoExportController: createCanvasVideoExportController,
  });
})(window);
