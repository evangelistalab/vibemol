(function (global) {
  'use strict';

  const VIBRATION_KIND = 'vibemol.vibrations';
  const VIBRATION_DEFAULT_AMPLITUDE = 0.5;
  const VIBRATION_DEFAULT_SPEED = 0.75;
  const VIBRATION_HIDE_SMALL_FREQ_THRESHOLD_CM1 = 5.0;
  const VIBRATION_IR_MIN_FREQ_CM1 = 20;
  const VIBRATION_IR_DEFAULT_SIGMA_CM1 = 28;
  const CM_INV_TEXT = 'cm⁻¹';
  const CM_INV_HTML = 'cm<sup>−1</sup>';

  // Continuous phase advancement deliberately retains its original 0.2s cap.
  // Parsing, attachment, panel shell and shared exporter construction stay host-owned.
  function createVibrationController(deps) {
    const {
      els,
      getActiveRecord,
      snapshotAtomCoordinates,
      applyAtomCoordinateFrame,
      markSessionChanged,
      isEditMode,
      UI_PALETTE,
      escapeHtml,
      getVideoController,
      setTooltipText,
      setMotionPanelButtonGlyph,
      setVibrationPanelOpen,
      updateDisplayWindowAdaptiveMenuUi,
    } = deps;
    let vibrationPlaying = false;
    let vibrationLastStepMs = 0;
    let vibrationHideSmallFrequencies = true;
    let vibrationPanelLayoutRaf = 0;

    function getPlaybackState() {
      return { playing: vibrationPlaying, lastStepMs: vibrationLastStepMs };
    }

    function setPlaybackState(nextState) {
      if (Object.prototype.hasOwnProperty.call(nextState, 'playing')) vibrationPlaying = nextState.playing;
      if (Object.prototype.hasOwnProperty.call(nextState, 'lastStepMs')) vibrationLastStepMs = nextState.lastStepMs;
    }

    function getHideSmallFrequencies() { return vibrationHideSmallFrequencies; }
    function setHideSmallFrequencies(value) { vibrationHideSmallFrequencies = value; }

    function cancelPanelLayoutSync() {
      if (vibrationPanelLayoutRaf) {
        cancelAnimationFrame(vibrationPanelLayoutRaf);
        vibrationPanelLayoutRaf = 0;
      }
    }

    function getActiveVibrationInfo() {
      const record = getActiveRecord();
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

    function formatVibrationFrequencyCell(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return '--';
      const mag = Math.abs(n).toFixed(1);
      return n < 0 ? `${mag}i` : mag;
    }

    function formatVibrationIntensityCell(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return '--';
      return n.toFixed(1);
    }

    function getVibrationModeIrIntensity(mode) {
      const n = Number(
        mode && (mode.irIntensityKmMol ?? mode.irIntensity ?? mode.intensityKmMol ?? mode.intensity)
      );
      if (!Number.isFinite(n)) return NaN;
      return Math.max(0, n);
    }

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

    function renderVibrationSpectrum(info, tableState = null) {
      if (!els.vibrationSpectrumWrap || !els.vibrationSpectrumCanvas) return;
      if (!(info && info.enabled && info.vib && Array.isArray(info.vib.modes) && info.vib.modes.length > 0)) {
        els.vibrationSpectrumWrap.style.display = 'none';
        if (els.vibrationSpectrumMeta) els.vibrationSpectrumMeta.textContent = 'IR spectrum preview';
        return;
      }
      const vib = info.vib;
      const visibleIndices = (tableState && Array.isArray(tableState.visibleIndices))
        ? tableState.visibleIndices
        : getVisibleVibrationModeIndices(vib);
      const peakData = collectVisibleVibrationSpectrumPeaks(vib, visibleIndices);
      const peaks = peakData.peaks;
      const hasExplicitIntensities = peakData.hasExplicitIntensities;

      els.vibrationSpectrumWrap.style.display = 'block';
      if (els.vibrationSpectrumMeta) {
        els.vibrationSpectrumMeta.textContent = hasExplicitIntensities
          ? `IR spectrum (${CM_INV_TEXT}, using parsed intensities)`
          : `IR spectrum (${CM_INV_TEXT}, relative intensities)`;
      }

      const ctx = els.vibrationSpectrumCanvas.getContext('2d');
      if (!ctx) return;
      const cssW = Math.max(220, Math.round(els.vibrationSpectrumCanvas.clientWidth || 0));
      const cssH = Math.max(88, Math.round(els.vibrationSpectrumCanvas.clientHeight || 128));
      const dpr = Math.max(1, Math.min(2, Number(window.devicePixelRatio) || 1));
      const pxW = Math.max(1, Math.round(cssW * dpr));
      const pxH = Math.max(1, Math.round(cssH * dpr));
      if (els.vibrationSpectrumCanvas.width !== pxW || els.vibrationSpectrumCanvas.height !== pxH) {
        els.vibrationSpectrumCanvas.width = pxW;
        els.vibrationSpectrumCanvas.height = pxH;
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
        if (els.vibrationSpectrumMeta) {
          els.vibrationSpectrumMeta.textContent = `IR spectrum (${CM_INV_TEXT}) unavailable for current visible modes`;
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

    function shouldHideVibrationMode(mode) {
      if (!vibrationHideSmallFrequencies) return false;
      const freq = Number(mode && mode.frequencyCm1);
      if (!Number.isFinite(freq)) return false;
      return Math.abs(freq) < VIBRATION_HIDE_SMALL_FREQ_THRESHOLD_CM1;
    }

    function getVisibleVibrationModeIndices(vib) {
      if (!vib || !Array.isArray(vib.modes)) return [];
      const out = [];
      for (let i = 0; i < vib.modes.length; i++) {
        if (!shouldHideVibrationMode(vib.modes[i])) out.push(i);
      }
      return out;
    }

    function renderVibrationModeTable(info) {
      const emptyState = { visibleIndices: [], visibleCount: 0, modeCount: 0 };
      if (!els.vibrationModeTableWrap || !els.vibrationModeTable || !els.vibrationModeTableBody || !els.vibrationModeEmpty) return emptyState;
      if (!(info && info.enabled && info.vib && Array.isArray(info.vib.modes) && info.vib.modes.length > 0)) {
        els.vibrationModeTableWrap.style.display = 'none';
        els.vibrationModeEmpty.style.display = 'none';
        els.vibrationModeTableBody.innerHTML = '';
        els.vibrationModeTable.setAttribute('data-has-intensity', 'false');
        return emptyState;
      }
      const vib = info.vib;
      const modeCount = Math.max(0, info.modeCount | 0);
      const visibleIndices = getVisibleVibrationModeIndices(vib);
      const hasAnyIntensity = visibleIndices.some((i) => {
        const mode = vib.modes[i] || null;
        return Number.isFinite(getVibrationModeIrIntensity(mode));
      });
      els.vibrationModeTable.setAttribute('data-has-intensity', hasAnyIntensity ? 'true' : 'false');
      const rows = [];
      for (const i of visibleIndices) {
        const mode = vib.modes[i] || {};
        const rawLabel = (typeof mode.label === 'string' && mode.label.trim()) ? mode.label.trim() : `Mode ${i + 1}`;
        const activeClass = (i === (vib.modeIndex | 0)) ? ' active' : '';
        const freqCell = formatVibrationFrequencyCell(mode.frequencyCm1);
        const intensity = getVibrationModeIrIntensity(mode);
        const intensityCell = hasAnyIntensity ? formatVibrationIntensityCell(intensity) : '--';
        rows.push(
          `<tr class="mode-row${activeClass}" data-mode-index="${i}" data-tooltip="Select ${escapeHtml(rawLabel)}">`
          + `<td><button class="vibrationPlayCell" data-action="play" data-mode-index="${i}" data-tooltip="Play ${escapeHtml(rawLabel)}">${(i === (vib.modeIndex | 0) && vibrationPlaying) ? 'pause' : 'play_arrow'}</button></td>`
          + `<td>${i + 1}</td>`
          + `<td>${escapeHtml(rawLabel)}</td>`
          + `<td>${escapeHtml(freqCell)}</td>`
          + `<td class="vibrationIntensityCol">${escapeHtml(intensityCell)}</td>`
          + '</tr>'
        );
      }
      els.vibrationModeTableBody.innerHTML = rows.join('');
      const visibleCount = visibleIndices.length;
      els.vibrationModeTableWrap.style.display = visibleCount > 0 ? 'block' : 'none';
      els.vibrationModeEmpty.style.display = modeCount > 0 && visibleCount === 0 ? 'block' : 'none';
      if (modeCount > 0 && visibleCount === 0 && vibrationHideSmallFrequencies) {
        els.vibrationModeEmpty.textContent = `No visible modes: |freq| < ${VIBRATION_HIDE_SMALL_FREQ_THRESHOLD_CM1.toFixed(1)} ${CM_INV_TEXT} are hidden.`;
      } else {
        els.vibrationModeEmpty.textContent = 'No vibrational modes available for the active file.';
      }
      return { visibleIndices, visibleCount, modeCount };
    }

    function syncVibrationControls() {
      const info = getActiveVibrationInfo();
      if (
        getVideoController()
        && getVideoController().isActive()
        && getVideoController().getTargetRecord()
        && info.enabled
        && info.record !== getVideoController().getTargetRecord()
      ) {
        getVideoController().discardForTargetRecordChange();
      }
      if (els.vibrationPanelBtn) {
        setTooltipText(els.vibrationPanelBtn, info.enabled
          ? 'Vibrational mode controls (F)'
          : 'No vibrational mode data in active file');
      }
      if (els.vibrationRow) els.vibrationRow.style.display = info.enabled ? 'grid' : 'none';
      if (els.vibrationRow2) els.vibrationRow2.style.display = info.enabled ? 'grid' : 'none';
      if (els.vibrationSpectrumWrap) els.vibrationSpectrumWrap.style.display = info.enabled ? 'block' : 'none';
      if (!info.enabled) {
        renderVibrationModeTable(info);
        renderVibrationSpectrum(info);
        setVibrationPanelOpen(false, {
          syncUi: false,
          restoreVibrationVideoState: false,
          vibrationVideoReason: 'Vibration video export discarded because vibrational data is unavailable',
        });
        vibrationPlaying = false;
        vibrationLastStepMs = 0;
        if (els.vibrationNowPlaying) els.vibrationNowPlaying.textContent = 'No mode selected';
        if (getVideoController()) getVideoController().syncUi(info);
        updateDisplayWindowAdaptiveMenuUi();
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
        applyAtomCoordinateFrame(info.vol, vib.equilibrium, info.atomCount, { record: info.record });
        if (els.vibrationModeLabel) els.vibrationModeLabel.textContent = 'No visible mode';
        if (els.vibrationNowPlaying) {
          els.vibrationNowPlaying.textContent = vibrationHideSmallFrequencies
            ? `No visible mode (|freq| < ${VIBRATION_HIDE_SMALL_FREQ_THRESHOLD_CM1.toFixed(1)} ${CM_INV_TEXT} hidden)`
            : 'No mode selected';
        }
        setMotionPanelButtonGlyph(els.vibrationPlayBtn, 'play_arrow');
        if (els.vibrationFreqLabel) els.vibrationFreqLabel.innerHTML = `-- ${CM_INV_HTML}`;
        renderVibrationSpectrum(info, tableState);
        if (getVideoController()) getVideoController().syncUi(info);
        updateDisplayWindowAdaptiveMenuUi();
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
      if (els.vibrationModeLabel) els.vibrationModeLabel.textContent = `${vib.modeIndex + 1}/${info.modeCount}${labelSuffix}`;
      if (els.vibrationNowPlaying) els.vibrationNowPlaying.textContent = `Selected: ${vib.modeIndex + 1}/${info.modeCount}${labelSuffix} • ${freqText}`;
      setMotionPanelButtonGlyph(els.vibrationPlayBtn, vibrationPlaying ? 'pause' : 'play_arrow');
      if (els.vibrationAmplitudeEl && document.activeElement !== els.vibrationAmplitudeEl) {
        els.vibrationAmplitudeEl.value = Number(vib.amplitude).toFixed(2);
      }
      if (els.vibrationSpeedEl && document.activeElement !== els.vibrationSpeedEl) {
        els.vibrationSpeedEl.value = Number(vib.speed).toFixed(2);
      }
      if (els.vibrationFreqLabel) els.vibrationFreqLabel.innerHTML = Number.isFinite(freq)
        ? `${freq.toFixed(1)} ${CM_INV_HTML}`
        : `-- ${CM_INV_HTML}`;
      renderVibrationSpectrum(info, tableState);
      if (getVideoController()) getVideoController().syncUi(info);
      updateDisplayWindowAdaptiveMenuUi();
    }

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
          if (!els.vibrationPanel || !els.vibrationPanel.classList.contains('open')) return;
          syncVibrationControls();
        });
      };
      tick(frames);
    }

    function restoreActiveVibrationEquilibrium(options = {}) {
      const info = getActiveVibrationInfo();
      if (!info.enabled) return false;
      const syncUi = options.syncUi !== false;
      const vib = info.vib;
      vib.phase = 0;
      applyAtomCoordinateFrame(info.vol, vib.equilibrium, info.atomCount, { record: info.record });
      if (syncUi) syncVibrationControls();
      return true;
    }

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
      applyAtomCoordinateFrame(info.vol, frame, info.atomCount, { record: info.record });
      if (syncUi) syncVibrationControls();
      return true;
    }

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
      if (isEditMode()) return;

      const vib = info.vib;
      const speed = Math.max(0.1, Math.min(30, Number(vib.speed) || VIBRATION_DEFAULT_SPEED));
      vib.speed = speed;
      if (vibrationLastStepMs <= 0) {
        vibrationLastStepMs = nowMs;
        return;
      }
      const dtSec = Math.max(0, Math.min(0.2, (nowMs - vibrationLastStepMs) / 1000));
      vibrationLastStepMs = nowMs;
      let nextPhase = (Number(vib.phase) || 0) + dtSec * speed * Math.PI * 2;
      const exportAdvance = getVideoController()
        ? getVideoController().resolveAdvance(nextPhase, Math.PI * 2)
        : null;
      if (exportAdvance && Object.prototype.hasOwnProperty.call(exportAdvance, 'phase')) {
        nextPhase = Number(exportAdvance.phase) || 0;
      }
      if (exportAdvance && exportAdvance.stopPlayback) {
        vibrationPlaying = false;
        vibrationLastStepMs = 0;
      }
      applyActiveVibrationPhase(nextPhase, { syncUi: false });
      markSessionChanged();
    }

    return Object.freeze({
      getActiveVibrationInfo,
      formatVibrationFrequencyCell,
      formatVibrationIntensityCell,
      getVibrationModeIrIntensity,
      collectVisibleVibrationSpectrumPeaks,
      renderVibrationSpectrum,
      shouldHideVibrationMode,
      getVisibleVibrationModeIndices,
      renderVibrationModeTable,
      syncVibrationControls,
      scheduleVibrationPanelLayoutSync,
      restoreActiveVibrationEquilibrium,
      applyActiveVibrationPhase,
      updateVibrationPlayback,
      getPlaybackState,
      setPlaybackState,
      getHideSmallFrequencies,
      setHideSmallFrequencies,
      cancelPanelLayoutSync,
    });
  }

  global.VibeMolVibration = Object.freeze({
    VIBRATION_KIND,
    VIBRATION_DEFAULT_AMPLITUDE,
    VIBRATION_DEFAULT_SPEED,
    VIBRATION_HIDE_SMALL_FREQ_THRESHOLD_CM1,
    VIBRATION_IR_MIN_FREQ_CM1,
    VIBRATION_IR_DEFAULT_SIGMA_CM1,
    CM_INV_TEXT,
    CM_INV_HTML,
    createVibrationController,
  });
})(typeof window !== 'undefined' ? window : globalThis);
