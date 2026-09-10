(function (global) {
  'use strict';

  function createEditGestureController(options = {}) {
    const dragThresholdPx = Number.isFinite(options.dragThresholdPx) ? Math.max(2, Number(options.dragThresholdPx)) : 6;
    const isEnabled = typeof options.isEnabled === 'function' ? options.isEnabled : (() => false);
    const getEditIntent = typeof options.getEditIntent === 'function' ? options.getEditIntent : (() => '');
    const EDIT_INTENT = options.EDIT_INTENT || Object.freeze({
      ATOM_MANIPULATION: 'atom_manipulation',
      ADD_MOLECULE: 'add_molecule',
    });
    const getSelection = typeof options.getSelection === 'function' ? options.getSelection : (() => []);
    const setSelection = typeof options.setSelection === 'function' ? options.setSelection : (() => false);
    const applySelectionClick = typeof options.applySelectionClick === 'function' ? options.applySelectionClick : (() => false);
    const clearSelection = typeof options.clearSelection === 'function' ? options.clearSelection : (() => false);
    const pickAtomObject = typeof options.pickAtomObject === 'function' ? options.pickAtomObject : (() => null);
    const pickBondHit = typeof options.pickBondHit === 'function' ? options.pickBondHit : (() => null);
    const resolveGrowDragAnchorIndex = typeof options.resolveGrowDragAnchorIndex === 'function'
      ? options.resolveGrowDragAnchorIndex
      : ((atomIndex) => (atomIndex | 0));
    const applyBondCenterClick = typeof options.applyBondCenterClick === 'function' ? options.applyBondCenterClick : (() => false);
    const showVoidPlacementPreview = typeof options.showVoidPlacementPreview === 'function' ? options.showVoidPlacementPreview : (() => false);
    const hideVoidPlacementPreview = typeof options.hideVoidPlacementPreview === 'function' ? options.hideVoidPlacementPreview : (() => {});
    const placeVoidAtom = typeof options.placeVoidAtom === 'function' ? options.placeVoidAtom : (() => null);
    const beginGrowDrag = typeof options.beginGrowDrag === 'function' ? options.beginGrowDrag : (() => false);
    const updateGrowDrag = typeof options.updateGrowDrag === 'function' ? options.updateGrowDrag : (() => ({ targetAtomIndex: -1 }));
    const commitGrowDrag = typeof options.commitGrowDrag === 'function' ? options.commitGrowDrag : (() => null);
    const cancelGrowDrag = typeof options.cancelGrowDrag === 'function' ? options.cancelGrowDrag : (() => {});
    const getSelectionDragMode = typeof options.getSelectionDragMode === 'function' ? options.getSelectionDragMode : (() => 'translate');
    const startMoveDrag = typeof options.startMoveDrag === 'function' ? options.startMoveDrag : (() => false);
    const updateMoveDrag = typeof options.updateMoveDrag === 'function' ? options.updateMoveDrag : (() => false);
    const finishMoveDrag = typeof options.finishMoveDrag === 'function' ? options.finishMoveDrag : (() => false);
    const cancelMoveDrag = typeof options.cancelMoveDrag === 'function' ? options.cancelMoveDrag : (() => {});
    const startRotateDrag = typeof options.startRotateDrag === 'function' ? options.startRotateDrag : (() => false);
    const updateRotateDrag = typeof options.updateRotateDrag === 'function' ? options.updateRotateDrag : (() => false);
    const finishRotateDrag = typeof options.finishRotateDrag === 'function' ? options.finishRotateDrag : (() => false);
    const cancelRotateDrag = typeof options.cancelRotateDrag === 'function' ? options.cancelRotateDrag : (() => {});
    const resolveMoveScope = typeof options.resolveMoveScope === 'function' ? options.resolveMoveScope : (() => ({ indices: [], label: 'No move scope', anchorWorld: null }));
    const resolveDownstreamMoveScope = typeof options.resolveDownstreamMoveScope === 'function' ? options.resolveDownstreamMoveScope : (() => ({ indices: [], label: 'No downstream scope', anchorWorld: null }));
    const getAtomWorldPosition = typeof options.getAtomWorldPosition === 'function' ? options.getAtomWorldPosition : (() => null);
    const cyclePendingBondOrder = typeof options.cyclePendingBondOrder === 'function' ? options.cyclePendingBondOrder : (() => 1);
    const setPendingBondOrder = typeof options.setPendingBondOrder === 'function' ? options.setPendingBondOrder : (() => 1);
    const onUiStateChanged = typeof options.onUiStateChanged === 'function' ? options.onUiStateChanged : (() => {});
    const setHintMessage = typeof options.setHintMessage === 'function' ? options.setHintMessage : (() => {});
    const startBoxSelection = typeof options.startBoxSelection === 'function' ? options.startBoxSelection : (() => false);
    const updateBoxSelection = typeof options.updateBoxSelection === 'function' ? options.updateBoxSelection : (() => false);
    const finishBoxSelection = typeof options.finishBoxSelection === 'function' ? options.finishBoxSelection : (() => false);
    const cancelBoxSelection = typeof options.cancelBoxSelection === 'function' ? options.cancelBoxSelection : (() => {});
    const capturePointer = typeof options.capturePointer === 'function' ? options.capturePointer : (() => {});
    const releasePointer = typeof options.releasePointer === 'function' ? options.releasePointer : (() => {});
    const beginViewRotate = typeof options.beginViewRotate === 'function' ? options.beginViewRotate : (() => {});
    const handleExternalPointerDown = typeof options.handleExternalPointerDown === 'function' ? options.handleExternalPointerDown : (() => false);
    const handleExternalPointerMove = typeof options.handleExternalPointerMove === 'function' ? options.handleExternalPointerMove : (() => false);
    const handleExternalPointerUp = typeof options.handleExternalPointerUp === 'function' ? options.handleExternalPointerUp : (() => false);
    const handleExternalPointerCancel = typeof options.handleExternalPointerCancel === 'function' ? options.handleExternalPointerCancel : (() => false);

    const state = {
      gestureState: 'idle',
      press: null,
      hoverAtomIndex: -1,
      hoverBondHit: null,
      lastCenterBondHover: null,
      voidPreviewVisible: false,
      currentMoveScopeIndices: [],
      bondTargetIndex: -1,
      activePointerId: null,
    };

    function syncSelectionScope() {
      const selection = Array.isArray(getSelection()) ? getSelection() : [];
      if (selection.length > 1) {
        state.currentMoveScopeIndices = selection.slice();
        return;
      }
      if (selection.length === 1) {
        const resolved = resolveMoveScope(selection[0], { atomOnly: false, preview: true }) || {};
        state.currentMoveScopeIndices = Array.isArray(resolved.indices) ? resolved.indices.slice() : selection.slice();
        return;
      }
      state.currentMoveScopeIndices = [];
    }

    function movementExceeded(e) {
      if (!state.press) return false;
      const dx = (Number(e && e.clientX) || 0) - state.press.clientX;
      const dy = (Number(e && e.clientY) || 0) - state.press.clientY;
      return (dx * dx + dy * dy) >= (dragThresholdPx * dragThresholdPx);
    }

    function buildUiState() {
      return {
        gestureState: state.gestureState,
        highlightIndices: Array.isArray(state.currentMoveScopeIndices) ? state.currentMoveScopeIndices.slice() : [],
      };
    }

    function notifyUi() {
      onUiStateChanged(buildUiState());
    }

    function updateLastCenterBondHover(e, bondHit) {
      const clientX = Number(e && e.clientX);
      const clientY = Number(e && e.clientY);
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
      if (bondHit && bondHit.object && bondHit.section === 'center') {
        state.lastCenterBondHover = {
          bondHit,
          clientX,
          clientY,
        };
        return;
      }
      if (!state.lastCenterBondHover) return;
      const dx = clientX - state.lastCenterBondHover.clientX;
      const dy = clientY - state.lastCenterBondHover.clientY;
      if ((dx * dx + dy * dy) > (18 * 18)) state.lastCenterBondHover = null;
    }

    function getStickyCenterBondHit(e) {
      if (!state.lastCenterBondHover) return null;
      const clientX = Number(e && e.clientX);
      const clientY = Number(e && e.clientY);
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
      const dx = clientX - state.lastCenterBondHover.clientX;
      const dy = clientY - state.lastCenterBondHover.clientY;
      if ((dx * dx + dy * dy) > (18 * 18)) return null;
      const hit = state.lastCenterBondHover.bondHit;
      return hit && hit.object && hit.section === 'center' ? hit : null;
    }

    function resolveBondCenterClickHit(e) {
      const pickedBondHit = pickBondHit(e);
      if (pickedBondHit && pickedBondHit.object) {
        return pickedBondHit.section === 'center'
          ? pickedBondHit
          : null;
      }
      const hoveredCenterBondHit = state.hoverBondHit && state.hoverBondHit.object && state.hoverBondHit.section === 'center'
        ? state.hoverBondHit
        : null;
      if (hoveredCenterBondHit) return hoveredCenterBondHit;
      const stickyCenterBondHit = getStickyCenterBondHit(e);
      if (stickyCenterBondHit) return stickyCenterBondHit;
      return null;
    }

    function updateIdleHover(e) {
      if (!isEnabled()) {
        state.hoverAtomIndex = -1;
        state.hoverBondHit = null;
        state.lastCenterBondHover = null;
        state.voidPreviewVisible = false;
        state.currentMoveScopeIndices = [];
        hideVoidPlacementPreview();
        notifyUi();
        return;
      }
      const selection = Array.isArray(getSelection()) ? getSelection() : [];
      const atomObj = pickAtomObject(e);
      const atomIndex = atomObj && atomObj.userData ? (atomObj.userData.index | 0) : -1;
      const bondHit = atomIndex < 0 ? pickBondHit(e) : null;
      state.hoverAtomIndex = atomIndex;
      state.hoverBondHit = bondHit || null;
      updateLastCenterBondHover(e, bondHit || null);
      if (!selection.length && atomIndex < 0 && !bondHit) {
        state.voidPreviewVisible = !!showVoidPlacementPreview(e);
      } else {
        state.voidPreviewVisible = false;
        hideVoidPlacementPreview();
      }
      syncSelectionScope();
      notifyUi();
    }

    function clearState() {
      const pointerId = state.activePointerId;
      state.gestureState = 'idle';
      state.press = null;
      state.activePointerId = null;
      state.bondTargetIndex = -1;
      state.voidPreviewVisible = false;
      state.lastCenterBondHover = null;
      state.currentMoveScopeIndices = [];
      hideVoidPlacementPreview();
      cancelGrowDrag();
      cancelMoveDrag();
      cancelRotateDrag();
      cancelBoxSelection();
      if (pointerId != null) releasePointer(pointerId);
      notifyUi();
    }

    function startMoveFromResolvedScope(e, resolved) {
      if (!resolved || !Array.isArray(resolved.indices) || !resolved.indices.length) return false;
      const nextSelection = resolved.indices.slice();
      setSelection(nextSelection);
      state.currentMoveScopeIndices = nextSelection.slice();
      if (!startMoveDrag(e, nextSelection, resolved.anchorWorld || null, { axis: 'none' })) return false;
      state.gestureState = 'move-drag';
      notifyUi();
      return true;
    }

    function startRotateFromResolvedScope(e, resolved) {
      if (!resolved || !Array.isArray(resolved.indices) || !resolved.indices.length) return false;
      const nextSelection = resolved.indices.slice();
      setSelection(nextSelection);
      state.currentMoveScopeIndices = nextSelection.slice();
      if (!startRotateDrag(e, nextSelection, { axis: 'none' })) return false;
      state.gestureState = 'rotate-drag';
      notifyUi();
      return true;
    }

    function maybeBeginDrag(e) {
      if (!state.press || !movementExceeded(e)) return false;
      function startAndApplyMove(resolved) {
        const started = startMoveDrag(e, Array.isArray(resolved && resolved.indices) ? resolved.indices.slice() : [], resolved && resolved.anchorWorld ? resolved.anchorWorld : null, {
          axis: 'none',
          startClientX: state.press ? state.press.clientX : Number(e && e.clientX) || 0,
          startClientY: state.press ? state.press.clientY : Number(e && e.clientY) || 0,
        });
        if (!started) return false;
        const nextSelection = Array.isArray(resolved && resolved.indices) ? resolved.indices.slice() : [];
        setSelection(nextSelection);
        state.currentMoveScopeIndices = nextSelection.slice();
        state.gestureState = 'move-drag';
        notifyUi();
        updateMoveDrag(e);
        return true;
      }
      function startAndApplyRotate(resolved) {
        const started = startRotateDrag(e, Array.isArray(resolved && resolved.indices) ? resolved.indices.slice() : [], {
          axis: 'none',
          startClientX: state.press ? state.press.clientX : Number(e && e.clientX) || 0,
          startClientY: state.press ? state.press.clientY : Number(e && e.clientY) || 0,
        });
        if (!started) return false;
        const nextSelection = Array.isArray(resolved && resolved.indices) ? resolved.indices.slice() : [];
        setSelection(nextSelection);
        state.currentMoveScopeIndices = nextSelection.slice();
        state.gestureState = 'rotate-drag';
        notifyUi();
        updateRotateDrag(e);
        return true;
      }
      if (state.press.kind === 'bond-inert') {
        state.press = null;
        if (state.activePointerId != null) releasePointer(state.activePointerId);
        state.activePointerId = null;
        updateIdleHover(e);
        return false;
      }
      if (state.press.kind === 'selected-atom') {
        const selectionDragMode = getSelectionDragMode() === 'rotate' ? 'rotate' : 'translate';
        const resolved = resolveMoveScope(state.press.atomIndex, {
          atomOnly: selectionDragMode === 'rotate' ? false : !!state.press.altKey,
          preview: false,
        });
        return selectionDragMode === 'rotate'
          ? startAndApplyRotate(resolved)
          : startAndApplyMove(resolved);
      }
      if (state.press.kind === 'void-clear' || state.press.kind === 'void-place') {
        hideVoidPlacementPreview();
        state.voidPreviewVisible = false;
        if (!startBoxSelection(state.press.clientX, state.press.clientY, Number(e && e.clientX) || 0, Number(e && e.clientY) || 0)) {
          return false;
        }
        state.gestureState = 'box-select-drag';
        notifyUi();
        return true;
      }
      if (state.press.kind === 'bond-downstream') {
        const resolved = resolveDownstreamMoveScope(state.press.bondHit, {
          preview: false,
        });
        return startAndApplyMove(resolved);
      }
      if (state.press.kind === 'atom-press-pending') {
        const growAnchorIndex = Number.isInteger(state.press.growAtomIndex)
          ? (state.press.growAtomIndex | 0)
          : (state.press.atomIndex | 0);
        if (!beginGrowDrag(e, growAnchorIndex)) return false;
        state.gestureState = 'grow-drag';
        const growState = updateGrowDrag(e) || {};
        state.bondTargetIndex = Number.isInteger(growState.targetAtomIndex) ? (growState.targetAtomIndex | 0) : -1;
        notifyUi();
        return true;
      }
      return false;
    }

    function startGrowDragFromHalo(e, atomIndex, growOptions = {}) {
      state.press = {
        kind: 'halo-grow',
        clientX: Number(e && e.clientX) || 0,
        clientY: Number(e && e.clientY) || 0,
        pointerId: e && Number.isInteger(e.pointerId) ? e.pointerId : null,
        atomIndex: atomIndex | 0,
      };
      state.activePointerId = state.press.pointerId;
      state.hoverAtomIndex = atomIndex | 0;
      state.voidPreviewVisible = false;
      hideVoidPlacementPreview();
      if (state.activePointerId != null) capturePointer(state.activePointerId);
      if (!beginGrowDrag(e, atomIndex, growOptions || {})) {
        if (state.activePointerId != null) releasePointer(state.activePointerId);
        state.press = null;
        state.activePointerId = null;
        notifyUi();
        return false;
      }
      state.gestureState = 'grow-drag';
      state.bondTargetIndex = -1;
      notifyUi();
      return true;
    }

    function handlePointerDown(e) {
      if (!isEnabled() || !e || e.button !== 0) return false;
      const intent = getEditIntent();
      state.press = null;
      state.activePointerId = e.pointerId;
      if (handleExternalPointerDown(intent, e, state)) return true;
      if (intent === EDIT_INTENT.ADD_MOLECULE || intent === EDIT_INTENT.ADD_FRAGMENT) return false;
      const selection = Array.isArray(getSelection()) ? getSelection() : [];
      const atomObj = pickAtomObject(e);
      const atomIndex = atomObj && atomObj.userData ? (atomObj.userData.index | 0) : -1;
      if (atomIndex >= 0) {
        state.press = {
          kind: selection.includes(atomIndex) ? 'selected-atom' : 'atom-press-pending',
          clientX: Number(e.clientX) || 0,
          clientY: Number(e.clientY) || 0,
          pointerId: e.pointerId,
          atomIndex,
          growAtomIndex: resolveGrowDragAnchorIndex(atomIndex, e),
          additive: !!e.shiftKey,
          altKey: !!e.altKey,
        };
        state.hoverAtomIndex = atomIndex;
        state.voidPreviewVisible = false;
        hideVoidPlacementPreview();
        capturePointer(e.pointerId);
        notifyUi();
        return true;
      }
      const pickedBondHit = pickBondHit(e);
      if (pickedBondHit && pickedBondHit.object) {
        state.press = {
          kind: 'bond-inert',
          clientX: Number(e.clientX) || 0,
          clientY: Number(e.clientY) || 0,
          pointerId: e.pointerId,
          bondHit: pickedBondHit,
        };
        state.hoverAtomIndex = -1;
        state.hoverBondHit = pickedBondHit;
        state.voidPreviewVisible = false;
        hideVoidPlacementPreview();
        capturePointer(e.pointerId);
        notifyUi();
        return true;
      }
      state.press = {
        kind: selection.length ? 'void-clear' : 'void-place',
        clientX: Number(e.clientX) || 0,
        clientY: Number(e.clientY) || 0,
        pointerId: e.pointerId,
        additive: !!e.shiftKey,
      };
      capturePointer(e.pointerId);
      notifyUi();
      return true;
    }

    function handlePointerMove(e) {
      if (!isEnabled()) return false;
      const intent = getEditIntent();
      if (handleExternalPointerMove(intent, e, state)) return true;
      if (state.gestureState === 'move-drag') {
        updateMoveDrag(e);
        return true;
      }
      if (state.gestureState === 'rotate-drag') {
        updateRotateDrag(e);
        return true;
      }
      if (state.gestureState === 'box-select-drag') {
        updateBoxSelection(
          state.press ? state.press.clientX : 0,
          state.press ? state.press.clientY : 0,
          Number(e && e.clientX) || 0,
          Number(e && e.clientY) || 0,
        );
        return true;
      }
      if (state.gestureState === 'grow-drag') {
        const growState = updateGrowDrag(e) || {};
        state.bondTargetIndex = Number.isInteger(growState.targetAtomIndex) ? (growState.targetAtomIndex | 0) : -1;
        notifyUi();
        return true;
      }
      if (state.press && maybeBeginDrag(e)) return true;
      updateIdleHover(e);
      return false;
    }

    function handlePointerUp(e) {
      if (!isEnabled()) return false;
      const intent = getEditIntent();
      const activePointerId = state.activePointerId;
      const press = state.press;
      if (handleExternalPointerUp(intent, e, state)) return true;
      if (state.gestureState === 'move-drag') {
        finishMoveDrag();
        state.gestureState = 'idle';
        state.press = null;
        if (activePointerId != null) releasePointer(activePointerId);
        state.activePointerId = null;
        updateIdleHover(e);
        return true;
      }
      if (state.gestureState === 'rotate-drag') {
        finishRotateDrag();
        state.gestureState = 'idle';
        state.press = null;
        if (activePointerId != null) releasePointer(activePointerId);
        state.activePointerId = null;
        updateIdleHover(e);
        return true;
      }
      if (state.gestureState === 'box-select-drag') {
        finishBoxSelection(!!(press && press.additive));
        state.gestureState = 'idle';
        state.press = null;
        if (activePointerId != null) releasePointer(activePointerId);
        state.activePointerId = null;
        updateIdleHover(e);
        return true;
      }
      if (state.gestureState === 'grow-drag') {
        const growState = updateGrowDrag(e) || {};
        state.bondTargetIndex = Number.isInteger(growState.targetAtomIndex) ? (growState.targetAtomIndex | 0) : -1;
        const result = commitGrowDrag({ targetAtomIndex: state.bondTargetIndex }) || null;
        cancelGrowDrag();
        state.gestureState = 'idle';
        state.press = null;
        state.bondTargetIndex = -1;
        if (result && Array.isArray(result.selection) && result.selection.length) setSelection(result.selection);
        if (activePointerId != null) releasePointer(activePointerId);
        state.activePointerId = null;
        updateIdleHover(e);
        return true;
      }
      if (!press) {
        if (activePointerId != null) releasePointer(activePointerId);
        state.activePointerId = null;
        updateIdleHover(e);
        return false;
      }
      state.press = null;
      if (press.kind === 'bond-inert') {
        const bondCenterHit = press.bondHit && press.bondHit.object && press.bondHit.section === 'center'
          ? press.bondHit
          : resolveBondCenterClickHit(e);
        if (bondCenterHit && applyBondCenterClick(bondCenterHit, e)) {
          if (activePointerId != null) releasePointer(activePointerId);
          state.activePointerId = null;
          updateIdleHover(e);
          return true;
        }
      } else if (press.kind === 'void-clear') {
        if (clearSelection()) setHintMessage('Selection cleared.');
      } else if (press.kind === 'void-place') {
        const result = placeVoidAtom(e) || null;
        if (result && Array.isArray(result.selection) && result.selection.length) setSelection(result.selection);
      }
      if (activePointerId != null) releasePointer(activePointerId);
      state.activePointerId = null;
      updateIdleHover(e);
      return true;
    }

    function handlePointerCancel() {
      const intent = getEditIntent();
      if (handleExternalPointerCancel(intent, state)) return true;
      const hadState = !!(
        state.press
        || state.gestureState === 'move-drag'
        || state.gestureState === 'rotate-drag'
        || state.gestureState === 'grow-drag'
        || state.gestureState === 'box-select-drag'
      );
      clearState();
      return hadState;
    }

    function handleWheel(e) {
      if (!isEnabled() || state.gestureState !== 'grow-drag') return false;
      const delta = Number(e && e.deltaY) || 0;
      cyclePendingBondOrder(delta > 0 ? 1 : -1);
      notifyUi();
      return true;
    }

    function handleBondOrderKey(order) {
      if (!isEnabled() || state.gestureState !== 'grow-drag') return false;
      const next = Math.max(1, Math.min(3, Number(order) || 1));
      setPendingBondOrder(next);
      notifyUi();
      return true;
    }

    function getHighlightIndices() {
      if (state.gestureState !== 'move-drag') return [];
      return Array.isArray(state.currentMoveScopeIndices) ? state.currentMoveScopeIndices.slice() : [];
    }

    function getUiState() {
      return buildUiState();
    }

    function getHoverBondHit() {
      return state.hoverBondHit && state.hoverBondHit.object
        ? { ...state.hoverBondHit }
        : null;
    }

    function refreshUi() {
      syncSelectionScope();
      notifyUi();
    }

    notifyUi();

    return Object.freeze({
      clearState,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      handlePointerCancel,
      handleWheel,
      handleBondOrderKey,
      startGrowDragFromHalo,
      getHighlightIndices,
      getHoverBondHit,
      resolveBondCenterClickHit,
      getUiState,
      refreshUi,
    });
  }

  global.VibeMolEditGestures = Object.freeze({
    createEditGestureController,
  });
})(window);
