(function (global) {
  'use strict';

  const DEFAULT_SYMMETRY_TOLERANCE_ANG = 0.05;
  const EXACT_SYMMETRY_TOLERANCE_ANG = 1e-3;
  const MAX_SYMMETRY_TOLERANCE_ANG = 1.0;
  const SYMMETRY_TOLERANCE_OPTIONS_ANG = Object.freeze([0.05, 0.1, 0.25, 0.5, 1.0]);

  // Analysis and coordinate transactions remain in their existing owners.
  // Creation is inert; initialize the analysis child at the original app site.
  function createSymmetryPanelController(deps) {
    const {
      els,
      Symmetry,
      resolveEditSymmetryTarget,
      resolveVolumeAtomId,
      workspaceEnabled,
      isEditMode,
      clearSymmetryElementGuide,
      renderSymmetryElementGuide,
      positionSymmetryPopover,
      updateEditAdaptiveMenuUi,
      setHintMessage,
    } = deps;
    let symmetryController = null;
    let symmetryPreviewState = null;
    let symmetryPopoverAnalysisCache = null;
    let symmetryPopoverCurrentGroupLabel = '';
    let symmetryPopoverResultHighlightTimer = 0;
    let symmetryPopoverElementsRenderKey = '';
    let symmetryPopoverSelectedElementId = '';

    function initializeAnalysisController() {
      symmetryController = Symmetry.createEditSymmetryController({ toleranceAng: DEFAULT_SYMMETRY_TOLERANCE_ANG });
    }
    function getAnalysisController() { return symmetryController; }
    function getPreviewState() { return symmetryPreviewState; }
    function setPreviewState(value) { symmetryPreviewState = value; }
    function getSelectedElementId() { return symmetryPopoverSelectedElementId; }
    function setSelectedElementId(value) { symmetryPopoverSelectedElementId = value; }
    function setCurrentGroupLabel(value) { symmetryPopoverCurrentGroupLabel = value; }

    function isSymmetryPopoverOpen() {
      return !!(els.editAdaptiveSymmetryPopoverEl && els.editAdaptiveSymmetryPopoverEl.getAttribute('aria-hidden') === 'false');
    }

    function getSymmetryTargetKey(target) {
      if (!target) return '';
      return target.indices.map((index) => {
        const atom = target.vol && target.vol.atoms && target.vol.atoms[index];
        return resolveVolumeAtomId(target.vol, atom) || `idx:${index}`;
      }).join('|');
    }

    function invalidateSymmetryPopoverAnalysisCache() {
      symmetryPopoverAnalysisCache = null;
      if (els.editSymmetryCandidatesEl && els.editSymmetryCandidatesEl.dataset) {
        delete els.editSymmetryCandidatesEl.dataset.renderKey;
      }
      symmetryPopoverElementsRenderKey = '';
    }

    function buildSymmetryAnalysisCacheKey(target, toleranceAng) {
      if (!target || !Array.isArray(target.atoms)) return '';
      const parts = [
        String(target.scopeLabel || ''),
        String(getSymmetryTargetKey(target) || ''),
        Number(toleranceAng || 0).toFixed(6),
      ];
      for (const atom of target.atoms) {
        parts.push([
          String(atom && atom.id || ''),
          Number(atom && atom.Z) || 0,
          (Number(atom && atom.x) || 0).toFixed(6),
          (Number(atom && atom.y) || 0).toFixed(6),
          (Number(atom && atom.z) || 0).toFixed(6),
        ].join('|'));
      }
      return parts.join(';');
    }

    function getSymmetryPopoverAnalysis(target) {
      if (!target) return null;
      const toleranceAng = symmetryController ? symmetryController.getTolerance() : DEFAULT_SYMMETRY_TOLERANCE_ANG;
      const cacheKey = buildSymmetryAnalysisCacheKey(target, toleranceAng);
      if (
        symmetryPopoverAnalysisCache
        && symmetryPopoverAnalysisCache.key === cacheKey
        && symmetryPopoverAnalysisCache.analysis
      ) {
        return symmetryPopoverAnalysisCache.analysis;
      }
      const analysis = symmetryController
        ? symmetryController.analyzeTarget(target.atoms, { toleranceAng })
        : Symmetry.analyzePointGroup(target.atoms, { toleranceAng: DEFAULT_SYMMETRY_TOLERANCE_ANG });
      symmetryPopoverAnalysisCache = {
        key: cacheKey,
        analysis,
      };
      return analysis;
    }

    function clearSymmetryPreview(options = {}) {
      const keepPopover = !!options.keepPopover;
      const quiet = !!options.quiet;
      symmetryPreviewState = null;
      if (symmetryController) symmetryController.clearPreview();
      clearSymmetryElementGuide();
      invalidateSymmetryPopoverAnalysisCache();
      // Clearing a chemistry operation must not close a Workbench panel. Only
      // hideSymmetryPopover handles an explicit close in that interface.
      if (!workspaceEnabled && !keepPopover && els.editAdaptiveSymmetryPopoverEl) {
        els.editAdaptiveSymmetryPopoverEl.setAttribute('aria-hidden', 'true');
      }
      if (!quiet) updateEditAdaptiveMenuUi();
    }

    function snapSymmetryTolerance(value) {
      const raw = Math.max(EXACT_SYMMETRY_TOLERANCE_ANG, Math.min(MAX_SYMMETRY_TOLERANCE_ANG, Number(value) || DEFAULT_SYMMETRY_TOLERANCE_ANG));
      let best = SYMMETRY_TOLERANCE_OPTIONS_ANG[0];
      let bestDelta = Math.abs(raw - best);
      for (let i = 1; i < SYMMETRY_TOLERANCE_OPTIONS_ANG.length; i++) {
        const candidate = SYMMETRY_TOLERANCE_OPTIONS_ANG[i];
        const delta = Math.abs(raw - candidate);
        if (delta + 1e-12 < bestDelta) {
          best = candidate;
          bestDelta = delta;
        }
      }
      return best;
    }

    function syncSymmetryToleranceUi() {
      const value = snapSymmetryTolerance(symmetryController ? symmetryController.getTolerance() : DEFAULT_SYMMETRY_TOLERANCE_ANG);
      if (els.editSymmetryToleranceSelectEl && document.activeElement !== els.editSymmetryToleranceSelectEl) {
        els.editSymmetryToleranceSelectEl.value = value.toFixed(3);
      }
    }

    function findInternalSymmetryCandidate(analysis, groupId) {
      const internal = analysis && analysis._internal;
      const candidates = internal && Array.isArray(internal.approximateCandidates) ? internal.approximateCandidates : [];
      return candidates.find((candidate) => candidate && candidate.groupId === groupId) || null;
    }

    function getSymmetryPopoverCandidateList(analysis) {
      const internal = analysis && analysis._internal;
      return internal && Array.isArray(internal.approximateCandidates)
        ? internal.approximateCandidates.filter(Boolean)
        : [];
    }

    function getSymmetryPopoverSelectedGroupId() {
      return symmetryPreviewState && symmetryPreviewState.groupId
        ? String(symmetryPreviewState.groupId || '')
        : '';
    }

    function getSymmetryPopoverSelectedCandidate(analysis) {
      const groupId = getSymmetryPopoverSelectedGroupId();
      if (!groupId) return null;
      return findInternalSymmetryCandidate(analysis, groupId);
    }

    function getSymmetryElementDisplayAnalysis(analysis) {
      const selectedCandidate = getSymmetryPopoverSelectedCandidate(analysis);
      const internal = analysis && analysis._internal;
      if (!selectedCandidate || !internal || !internal.centeredState) return analysis;
      return {
        ...analysis,
        exactGroupId: selectedCandidate.groupId,
        exactGroupLabel: selectedCandidate.groupLabel,
        exactCandidate: selectedCandidate,
        _internal: {
          ...internal,
          exactCandidate: selectedCandidate,
        },
      };
    }

    function clearSymmetryCurrentGroupHighlight() {
      if (symmetryPopoverResultHighlightTimer) {
        clearTimeout(symmetryPopoverResultHighlightTimer);
        symmetryPopoverResultHighlightTimer = 0;
      }
      if (els.editSymmetryExactResultCardEl) {
        els.editSymmetryExactResultCardEl.classList.remove('is-updated');
      }
    }

    function updateSymmetryCurrentGroupUi(groupLabel, options = {}) {
      const label = String(groupLabel || 'C1').trim() || 'C1';
      const allowHighlight = options.highlightChange !== false;
      const previousLabel = String(symmetryPopoverCurrentGroupLabel || '').trim();
      if (els.editSymmetryExactResultEl) {
        els.editSymmetryExactResultEl.textContent = `Current point group: ${label}`;
      }
      const shouldHighlight = !!(allowHighlight && previousLabel && previousLabel !== label);
      symmetryPopoverCurrentGroupLabel = label;
      if (!els.editSymmetryExactResultCardEl) return;
      clearSymmetryCurrentGroupHighlight();
      if (!shouldHighlight) return;
      els.editSymmetryExactResultCardEl.classList.add('is-updated');
      symmetryPopoverResultHighlightTimer = window.setTimeout(() => {
        symmetryPopoverResultHighlightTimer = 0;
        if (els.editSymmetryExactResultCardEl) {
          els.editSymmetryExactResultCardEl.classList.remove('is-updated');
        }
      }, 1400);
    }

    function buildSymmetryElementOptionHtml(element) {
      return `<option value="${String(element.id || '')}">${String(element.label || '')}</option>`;
    }

    function renderSymmetryElementOptions(analysis) {
      if (!els.editSymmetryElementSelectEl) return [];
      const displayAnalysis = getSymmetryElementDisplayAnalysis(analysis);
      const elements = Symmetry.describeSymmetryElements(displayAnalysis) || [];
      const renderKey = elements.map((element) => [
        String(element.id || ''),
        String(element.label || ''),
        String(element.type || ''),
      ].join('|')).join(';');
      if (symmetryPopoverElementsRenderKey !== renderKey) {
        els.editSymmetryElementSelectEl.innerHTML = [
          '<option value="">None</option>',
          ...elements.map(buildSymmetryElementOptionHtml),
        ].join('');
        symmetryPopoverElementsRenderKey = renderKey;
      }
      if (!elements.some((element) => String(element.id || '') === symmetryPopoverSelectedElementId)) {
        symmetryPopoverSelectedElementId = '';
      }
      els.editSymmetryElementSelectEl.disabled = elements.length === 0;
      els.editSymmetryElementSelectEl.value = symmetryPopoverSelectedElementId;
      return elements;
    }

    function formatSymmetryResidual(value) {
      return `${(Number(value) || 0).toFixed(3)} Å`;
    }

    function renderSymmetryCandidates(analysis) {
      if (!els.editSymmetryCandidatesEl) return;
      const selectedGroupId = getSymmetryPopoverSelectedGroupId();
      const currentGroupId = analysis ? String(analysis.exactGroupId || '') : '';
      const candidates = getSymmetryPopoverCandidateList(analysis);
      if (!candidates.length) {
        const emptyKey = `empty:${selectedGroupId}`;
        if (els.editSymmetryCandidatesEl.dataset.renderKey !== emptyKey) {
          els.editSymmetryCandidatesEl.innerHTML = '<div class="editSymmetryEmptyState">No approximate point groups within the current tolerance.</div>';
          els.editSymmetryCandidatesEl.dataset.renderKey = emptyKey;
        }
        return;
      }
      const renderKey = [
        currentGroupId,
        selectedGroupId,
        ...candidates.map((candidate) => [
          String(candidate.groupId || ''),
          Number(candidate.rmsDisplacementAng || 0).toFixed(6),
        ].join('|')),
      ].join(';');
      if (els.editSymmetryCandidatesEl.dataset.renderKey === renderKey) return;
      els.editSymmetryCandidatesEl.innerHTML = candidates.map((candidate) => {
        const groupId = String(candidate.groupId || '');
        const classNames = ['editSymmetryCandidateBtn'];
        if (groupId === currentGroupId) classNames.push('is-current');
        if (groupId === selectedGroupId) classNames.push('is-active');
        return [
          `<button class="${classNames.join(' ')}" type="button" data-symmetry-group-id="${groupId}">`,
          '<span class="material-symbols-rounded editSymmetryCandidateIcon" aria-hidden="true">blur_circular</span>',
          '<span class="editSymmetryCandidateBody">',
          `<span class="editSymmetryCandidateLabel">${candidate.groupLabel}</span>`,
          '<span class="editSymmetryCandidateMetrics">',
          `<span class="editSymmetryCandidateMeta rms-value">rms ${formatSymmetryResidual(candidate.rmsDisplacementAng)}</span>`,
          '</span>',
          '</span>',
          '</button>',
        ].join('');
      }).join('');
      els.editSymmetryCandidatesEl.dataset.renderKey = renderKey;
    }

    function renderSymmetryPopover() {
      if (!isEditMode()) return;
      if (!els.editAdaptiveSymmetryPopoverEl || els.editAdaptiveSymmetryPopoverEl.getAttribute('aria-hidden') === 'true') return;
      const target = resolveEditSymmetryTarget();
      syncSymmetryToleranceUi();
      if (!target) {
        if (els.editSymmetryTargetSummaryEl) els.editSymmetryTargetSummaryEl.textContent = 'Whole structure (0 atoms)';
        updateSymmetryCurrentGroupUi('C1', { highlightChange: false });
        if (els.editSymmetryElementSelectEl) {
          els.editSymmetryElementSelectEl.innerHTML = '<option value="">None</option>';
          els.editSymmetryElementSelectEl.disabled = true;
        }
        symmetryPreviewState = null;
        symmetryPopoverSelectedElementId = '';
        if (els.editSymmetryCandidatesEl) els.editSymmetryCandidatesEl.innerHTML = '<div class="editSymmetryEmptyState">No editable atoms available.</div>';
        if (els.editSymmetryApplyBtnEl) els.editSymmetryApplyBtnEl.disabled = true;
        if (els.editSymmetryCancelBtnEl) els.editSymmetryCancelBtnEl.disabled = !getSymmetryPopoverSelectedGroupId();
        if (els.editSymmetryAutoBtnEl) els.editSymmetryAutoBtnEl.disabled = true;
        clearSymmetryElementGuide();
        positionSymmetryPopover();
        return;
      }
      const analysis = getSymmetryPopoverAnalysis(target);
      if (symmetryPreviewState && !getSymmetryPopoverSelectedCandidate(analysis)) {
        symmetryPreviewState = null;
      }
      if (els.editSymmetryTargetSummaryEl) els.editSymmetryTargetSummaryEl.textContent = target.scopeLabel;
      updateSymmetryCurrentGroupUi(analysis.exactGroupLabel);
      renderSymmetryElementOptions(analysis);
      renderSymmetryCandidates(analysis);
      const selectedCandidate = getSymmetryPopoverSelectedCandidate(analysis);
      const autoCandidate = getSymmetryPopoverCandidateList(analysis)[0] || null;
      if (els.editSymmetryApplyBtnEl) els.editSymmetryApplyBtnEl.disabled = !selectedCandidate;
      if (els.editSymmetryCancelBtnEl) els.editSymmetryCancelBtnEl.disabled = !getSymmetryPopoverSelectedGroupId();
      if (els.editSymmetryAutoBtnEl) els.editSymmetryAutoBtnEl.disabled = !(autoCandidate && autoCandidate.groupId && autoCandidate.groupId !== 'C1');
      renderSymmetryElementGuide(analysis, target, symmetryPopoverSelectedElementId);
      positionSymmetryPopover();
    }

    function hideSymmetryPopover(delayMs = 0, options = {}) {
      if (typeof delayMs === 'object' && delayMs !== null) {
        options = delayMs;
        delayMs = 0;
      }
      const applyHide = () => {
        clearSymmetryCurrentGroupHighlight();
        symmetryPopoverCurrentGroupLabel = '';
        symmetryPopoverSelectedElementId = '';
        clearSymmetryElementGuide();
        clearSymmetryPreview({ restore: options.restore !== false, keepPopover: false, quiet: true });
        els.editAdaptiveSymmetryPopoverEl?.setAttribute('aria-hidden', 'true');
        if (!options.quiet) updateEditAdaptiveMenuUi();
      };
      applyHide();
    }

    function setSymmetryTolerance(nextValue) {
      const value = snapSymmetryTolerance(nextValue);
      if (symmetryController) symmetryController.setTolerance(value);
      syncSymmetryToleranceUi();
      invalidateSymmetryPopoverAnalysisCache();
      clearSymmetryPreview({ restore: true, keepPopover: true, quiet: true });
      renderSymmetryPopover();
      return value;
    }

    function previewSymmetryCandidate(groupId) {
      const target = resolveEditSymmetryTarget();
      if (!target) return false;
      const analysis = getSymmetryPopoverAnalysis(target);
      const candidate = findInternalSymmetryCandidate(analysis, groupId);
      if (!candidate) return false;
      symmetryPreviewState = {
        record: target.record,
        targetKey: getSymmetryTargetKey(target),
        targetIndices: target.indices.slice(),
        groupId: candidate.groupId,
      };
      if (symmetryController) symmetryController.clearPreview();
      renderSymmetryPopover();
      setHintMessage(`Selected symmetry ${candidate.groupLabel}. Click Apply or Auto to symmetrize.`);
      return true;
    }

    function cancelSymmetryPreview() {
      if (!symmetryPreviewState) return false;
      clearSymmetryPreview({ restore: true, keepPopover: true, quiet: true });
      renderSymmetryPopover();
      setHintMessage('Cleared symmetry selection.');
      return true;
    }

    return Object.freeze({
      isSymmetryPopoverOpen,
      getSymmetryTargetKey,
      invalidateSymmetryPopoverAnalysisCache,
      buildSymmetryAnalysisCacheKey,
      getSymmetryPopoverAnalysis,
      clearSymmetryPreview,
      snapSymmetryTolerance,
      syncSymmetryToleranceUi,
      findInternalSymmetryCandidate,
      getSymmetryPopoverCandidateList,
      getSymmetryPopoverSelectedGroupId,
      getSymmetryPopoverSelectedCandidate,
      getSymmetryElementDisplayAnalysis,
      clearSymmetryCurrentGroupHighlight,
      updateSymmetryCurrentGroupUi,
      buildSymmetryElementOptionHtml,
      renderSymmetryElementOptions,
      formatSymmetryResidual,
      renderSymmetryCandidates,
      renderSymmetryPopover,
      hideSymmetryPopover,
      setSymmetryTolerance,
      previewSymmetryCandidate,
      cancelSymmetryPreview,
      initializeAnalysisController,
      getAnalysisController,
      getPreviewState,
      setPreviewState,
      getSelectedElementId,
      setSelectedElementId,
      setCurrentGroupLabel,
    });
  }

  global.VibeMolSymmetryPanel = Object.freeze({
    DEFAULT_SYMMETRY_TOLERANCE_ANG,
    EXACT_SYMMETRY_TOLERANCE_ANG,
    MAX_SYMMETRY_TOLERANCE_ANG,
    SYMMETRY_TOLERANCE_OPTIONS_ANG,
    createSymmetryPanelController,
  });
})(typeof window !== 'undefined' ? window : globalThis);
