(function (global) {
  'use strict';

  function createEditToolsController(options = {}) {
    const state = options.state || {};
    const EDIT_INTENT = options.EDIT_INTENT || {};
    const EDIT_ADD_MODE = options.EDIT_ADD_MODE || {};
    const EDIT_FRAGMENT_ATTACH_POLICY = options.EDIT_FRAGMENT_ATTACH_POLICY || {};
    const getActiveRecord = typeof options.getActiveRecord === 'function' ? options.getActiveRecord : (() => null);
    const isEditMode = typeof options.isEditMode === 'function' ? options.isEditMode : (() => false);
    const finalizeAddAtomOperatorSession = typeof options.finalizeAddAtomOperatorSession === 'function' ? options.finalizeAddAtomOperatorSession : (() => false);
    const hideAllAdaptiveToolPopovers = typeof options.hideAllAdaptiveToolPopovers === 'function' ? options.hideAllAdaptiveToolPopovers : (() => {});
    const clearAddGrowPreview = typeof options.clearAddGrowPreview === 'function' ? options.clearAddGrowPreview : (() => {});
    const clearMoleculePlacementPreview = typeof options.clearMoleculePlacementPreview === 'function' ? options.clearMoleculePlacementPreview : (() => {});
    const clearFuseRingPreview = typeof options.clearFuseRingPreview === 'function' ? options.clearFuseRingPreview : (() => {});
    const clearEditBondPendingSelection = typeof options.clearEditBondPendingSelection === 'function' ? options.clearEditBondPendingSelection : (() => {});
    const clearTransformState = typeof options.clearTransformState === 'function' ? options.clearTransformState : (() => {});
    const clearTransformSelection = typeof options.clearTransformSelection === 'function' ? options.clearTransformSelection : (() => {});
    const clearBondCenterSelection = typeof options.clearBondCenterSelection === 'function' ? options.clearBondCenterSelection : (() => false);
    const clearHover = typeof options.clearHover === 'function' ? options.clearHover : (() => {});
    const updateEditToolboxUi = typeof options.updateEditToolboxUi === 'function' ? options.updateEditToolboxUi : (() => {});
    const getCurrentFragmentDefinition = typeof options.getCurrentFragmentDefinition === 'function' ? options.getCurrentFragmentDefinition : (() => null);
    const getCurrentMoleculeDefinition = typeof options.getCurrentMoleculeDefinition === 'function' ? options.getCurrentMoleculeDefinition : (() => null);
    const getElementSymbol = typeof options.getElementSymbol === 'function' ? options.getElementSymbol : ((z) => String(z || '?'));
    const getElementName = typeof options.getElementName === 'function' ? options.getElementName : ((z) => String(z || '?'));
    const getEditFragmentAttachPolicyLabel = typeof options.getEditFragmentAttachPolicyLabel === 'function' ? options.getEditFragmentAttachPolicyLabel : ((value) => String(value || ''));
    const refreshActiveAddGrowPreview = typeof options.refreshActiveAddGrowPreview === 'function' ? options.refreshActiveAddGrowPreview : (() => {});
    const normalizeEditAddBondOrder = typeof options.normalizeEditAddBondOrder === 'function' ? options.normalizeEditAddBondOrder : ((value) => Number(value) || 1);
    const setHintMessage = typeof options.setHintMessage === 'function' ? options.setHintMessage : (() => {});
    const onSelectionChanged = typeof options.onSelectionChanged === 'function' ? options.onSelectionChanged : (() => {});
    const clearMeasurementSelectionForContextChange = typeof options.clearMeasurementSelectionForContextChange === 'function' ? options.clearMeasurementSelectionForContextChange : (() => {});
    const setCoordsHoveredAtomIndex = typeof options.setCoordsHoveredAtomIndex === 'function' ? options.setCoordsHoveredAtomIndex : (() => {});
    const setCoordsInlineEditState = typeof options.setCoordsInlineEditState === 'function' ? options.setCoordsInlineEditState : (() => {});
    const getBondEditing = typeof options.getBondEditing === 'function' ? options.getBondEditing : (() => null);

    function normalizeEditAtomSelection(indices, vol) {
      if (!vol || !Array.isArray(vol.atoms)) return [];
      return Array.from(new Set((Array.isArray(indices) ? indices : [])
        .map((idx) => Number(idx) | 0)
        .filter((idx) => idx >= 0 && idx < vol.atoms.length)))
        .sort((a, b) => a - b);
    }

    function getEditAtomSelection() {
      const record = getActiveRecord();
      const vol = record && record.vol;
      return normalizeEditAtomSelection(state.editAtomSelectionIndices, vol);
    }

    function setEditAtomSelection(indices) {
      const record = getActiveRecord();
      const vol = record && record.vol;
      const next = normalizeEditAtomSelection(indices, vol);
      const prev = getEditAtomSelection();
      const changed = prev.length !== next.length || prev.some((idx, i) => idx !== next[i]);
      state.editAtomSelectionIndices = next;
      onSelectionChanged(next, prev, changed);
      return changed;
    }

    function clearEditAtomSelection() {
      return setEditAtomSelection([]);
    }

    function finalizeNonSelectionAddAtomOperatorSession() {
      const session = state.addAtomOperatorSession;
      if (!session) return false;
      if (String(session.source || '') === 'selection') return false;
      return !!finalizeAddAtomOperatorSession({ announce: false });
    }

    function clearEditSelectionsOnEmptyClick(clearOptions = {}) {
      const record = getActiveRecord();
      const vol = record && record.vol;
      const bondEditing = getBondEditing();
      let changed = false;
      if (clearOptions.selection !== false) changed = finalizeNonSelectionAddAtomOperatorSession() || changed;
      if (clearOptions.selection !== false) changed = clearEditAtomSelection() || changed;
      if (clearOptions.transform !== false) changed = !!clearTransformSelection() || changed;
      if (clearOptions.bondCenter !== false) changed = !!clearBondCenterSelection() || changed;
      if (clearOptions.bondEdit !== false) {
        const hadPendingBondSelection = !!(
          bondEditing
          && typeof bondEditing.getPendingAtomIndex === 'function'
          && bondEditing.getPendingAtomIndex(vol) >= 0
        );
        const hadBondPopup = !!(
          bondEditing
          && typeof bondEditing.getPopupCarrier === 'function'
          && bondEditing.getPopupCarrier()
        );
        const clearedPendingBondSelection = !!clearEditBondPendingSelection();
        if (bondEditing && typeof bondEditing.hidePopup === 'function') bondEditing.hidePopup();
        changed = changed || hadPendingBondSelection || hadBondPopup || clearedPendingBondSelection;
      }
      return changed;
    }

    function selectAllEditAtoms() {
      const record = getActiveRecord();
      const vol = record && record.vol;
      if (!vol || !Array.isArray(vol.atoms) || vol.atoms.length === 0) return false;
      finalizeNonSelectionAddAtomOperatorSession();
      clearTransformSelection();
      const changed = setEditAtomSelection(vol.atoms.map((_, idx) => idx));
      if (changed) setHintMessage(`Selected all ${vol.atoms.length} atoms.`);
      else setHintMessage(`All ${vol.atoms.length} atoms are already selected.`);
      return changed;
    }

    function applyEditAtomSelectionClick(atomIndex, additive) {
      const idx = atomIndex | 0;
      const current = getEditAtomSelection();
      if (idx < 0) return false;
      finalizeNonSelectionAddAtomOperatorSession();
      clearTransformSelection();
      if (additive) {
        const set = new Set(current);
        if (set.has(idx)) set.delete(idx);
        else set.add(idx);
        const next = Array.from(set).sort((a, b) => a - b);
        const changed = setEditAtomSelection(next);
        if (changed) {
          const count = next.length;
          setHintMessage(count ? `Selection updated • ${count} atom${count === 1 ? '' : 's'} selected.` : 'Selection cleared.');
        }
        return changed;
      }
      const changed = setEditAtomSelection([idx]);
      if (changed) setHintMessage('Selected 1 atom.');
      return changed;
    }

    function applyEditAtomSelectionBox(atomIndices, additive) {
      const nextIndices = normalizeEditAtomSelection(atomIndices, (getActiveRecord() && getActiveRecord().vol) || null);
      finalizeNonSelectionAddAtomOperatorSession();
      clearTransformSelection();
      if (additive) {
        const merged = Array.from(new Set([...getEditAtomSelection(), ...nextIndices])).sort((a, b) => a - b);
        const changed = setEditAtomSelection(merged);
        if (changed) {
          const count = merged.length;
          setHintMessage(count ? `Selection updated • ${count} atom${count === 1 ? '' : 's'} selected.` : 'Selection cleared.');
        }
        return changed;
      }
      const changed = setEditAtomSelection(nextIndices);
      if (changed) {
        const count = nextIndices.length;
        setHintMessage(count ? `Selected ${count} atom${count === 1 ? '' : 's'}.` : 'Selection cleared.');
      }
      return changed;
    }

    function normalizeEditIntent(nextIntent) {
      if (nextIntent === EDIT_INTENT.ADD_ATOM) return EDIT_INTENT.ADD_ATOM;
      if (nextIntent === EDIT_INTENT.ADD_FRAGMENT) return EDIT_INTENT.ADD_FRAGMENT;
      if (nextIntent === EDIT_INTENT.ADD_MOLECULE) return EDIT_INTENT.ADD_MOLECULE;
      return EDIT_INTENT.ATOM_MANIPULATION;
    }

    function isFragmentIntent(intent) {
      return intent === EDIT_INTENT.ADD_FRAGMENT
        || (intent === EDIT_INTENT.ATOM_MANIPULATION && state.editAddMode === EDIT_ADD_MODE.FRAGMENT);
    }

    function isGrowPreviewIntent(intent) {
      return intent === EDIT_INTENT.ATOM_MANIPULATION
        || intent === EDIT_INTENT.ADD_ATOM
        || intent === EDIT_INTENT.ADD_FRAGMENT;
    }

    function syncDerivedAddMode() {
      if (state.editIntent === EDIT_INTENT.ADD_ATOM) state.editAddMode = EDIT_ADD_MODE.ATOM;
      else if (state.editIntent === EDIT_INTENT.ADD_FRAGMENT) state.editAddMode = EDIT_ADD_MODE.FRAGMENT;
      else if (state.editIntent === EDIT_INTENT.ADD_MOLECULE) state.editAddMode = EDIT_ADD_MODE.MOLECULE;
      else if (state.editAddMode !== EDIT_ADD_MODE.FRAGMENT) state.editAddMode = EDIT_ADD_MODE.ATOM;
    }

    function buildIntentHint() {
      if (isFragmentIntent(state.editIntent)) {
        const fragment = getCurrentFragmentDefinition();
        const label = fragment ? `${fragment.name} (${fragment.formula})` : 'fragment';
        const parts = [`Build fragment: ${label}`, `Policy ${getEditFragmentAttachPolicyLabel(state.editAddFragmentAttachPolicy)}`];
        if (fragment && Array.isArray(fragment.attachModes) && fragment.attachModes.includes('fuse_ring')) {
          parts.push('Click bond to fuse ring');
        }
        parts.push('Click atom to attach or void to place');
        return parts.join(' • ');
      }
      if (state.editIntent === EDIT_INTENT.ADD_MOLECULE) {
        const molecule = getCurrentMoleculeDefinition();
        const label = molecule ? `${molecule.name} (${molecule.formula})` : 'molecule';
        return `Build molecule: ${label} • Click to place • Drag to rotate • Click again to confirm • X/Y/Z align`;
      }
      return `Build element: ${getElementName(state.editAddElementZ)} (${getElementSymbol(state.editAddElementZ)}) • Right-click atom to select • Click void to add • Space previews/applies missing H`;
    }

    function getEditIntent() {
      return normalizeEditIntent(state.editIntent);
    }

    function setEditIntent(nextIntent, options = {}) {
      const announce = options.announce !== false;
      const syncSearch = options.syncSearch !== false;
      const closePopovers = options.closePopovers !== false;
      const preserveSelection = !!options.preserveSelection;
      const preserveAddMode = !!options.preserveAddMode;
      const prevIntent = getEditIntent();
      const normalized = normalizeEditIntent(nextIntent);
      const leavingAtomManipulation = !!state.addAtomOperatorSession && normalized !== EDIT_INTENT.ATOM_MANIPULATION;
      if (leavingAtomManipulation) finalizeAddAtomOperatorSession({ announce: false });
      state.editIntent = normalized;
      if (normalized === EDIT_INTENT.ADD_ATOM) state.editAddMode = EDIT_ADD_MODE.ATOM;
      else if (normalized === EDIT_INTENT.ADD_FRAGMENT) state.editAddMode = EDIT_ADD_MODE.FRAGMENT;
      else if (normalized === EDIT_INTENT.ADD_MOLECULE) state.editAddMode = EDIT_ADD_MODE.MOLECULE;
      else if (!preserveAddMode) state.editAddMode = EDIT_ADD_MODE.ATOM;
      syncDerivedAddMode();

      if (normalized !== EDIT_INTENT.ADD_MOLECULE) clearMoleculePlacementPreview();
      if (!isFragmentIntent(normalized)) clearFuseRingPreview();
      if (!isGrowPreviewIntent(normalized)) clearAddGrowPreview();
      if (normalized !== EDIT_INTENT.ATOM_MANIPULATION && prevIntent === EDIT_INTENT.ATOM_MANIPULATION) {
        clearEditSelectionsOnEmptyClick({ selection: !preserveSelection, transform: true, bondEdit: true });
      }
      if (normalized !== EDIT_INTENT.ATOM_MANIPULATION) {
        clearTransformState();
      }
      clearHover();
      if (closePopovers) hideAllAdaptiveToolPopovers();
      updateEditToolboxUi({ syncSearch });
      if (!announce || !isEditMode()) return;
      setHintMessage(buildIntentHint());
    }

    function setEditAddMode(nextMode, options = {}) {
      const normalizedMode = nextMode === EDIT_ADD_MODE.MOLECULE
        ? EDIT_ADD_MODE.MOLECULE
        : (nextMode === EDIT_ADD_MODE.FRAGMENT ? EDIT_ADD_MODE.FRAGMENT : EDIT_ADD_MODE.ATOM);
      if (normalizedMode === EDIT_ADD_MODE.MOLECULE) setEditIntent(EDIT_INTENT.ADD_MOLECULE, Object.assign({}, options, { preserveAddMode: true }));
      else if (normalizedMode === EDIT_ADD_MODE.FRAGMENT) {
        state.editAddMode = normalizedMode;
        setEditIntent(EDIT_INTENT.ADD_FRAGMENT, Object.assign({}, options, { preserveAddMode: true }));
      }
      else {
        state.editAddMode = normalizedMode;
        setEditIntent(EDIT_INTENT.ADD_ATOM, Object.assign({}, options, { preserveAddMode: true }));
      }
      if (state.editIntent === EDIT_INTENT.ADD_FRAGMENT || (state.editIntent === EDIT_INTENT.ATOM_MANIPULATION && state.editAddMode === EDIT_ADD_MODE.FRAGMENT)) {
        const fragment = getCurrentFragmentDefinition();
        if (fragment) state.editAddBondOrder = normalizeEditAddBondOrder(fragment.preferredBondOrder || state.editAddBondOrder);
      } else if (state.editIntent === EDIT_INTENT.ADD_MOLECULE) {
        const molecule = getCurrentMoleculeDefinition();
        if (molecule) state.editAddMoleculeId = molecule.id;
      }
      refreshActiveAddGrowPreview();
      updateEditToolboxUi({ syncSearch: options.syncSearch !== false });
    }

    function clearTransientInteractionState(clearOptions = {}) {
      if (clearOptions.addPreview !== false) clearAddGrowPreview();
      if (clearOptions.moleculePlacement !== false) clearMoleculePlacementPreview();
      if (clearOptions.fusePreview !== false) clearFuseRingPreview();
      if (clearOptions.bondEdit !== false) clearEditBondPendingSelection();
      if (clearOptions.transform !== false) {
        clearTransformState();
        clearTransformSelection();
      }
      if (clearOptions.measurement !== false) clearMeasurementSelectionForContextChange();
      if (clearOptions.selection !== false) clearEditAtomSelection();
      if (clearOptions.hover !== false) {
        setCoordsHoveredAtomIndex(-1);
        clearHover();
      }
      if (clearOptions.coordsEditor !== false) setCoordsInlineEditState(null);
      if (clearOptions.pointerState !== false) {
        state.editDownPt = null;
        state.editMoved = false;
        state.editClickIdx = -1;
        const bondEditing = getBondEditing();
        if (bondEditing) bondEditing.clearState({ pendingSelection: false });
      }
    }

    syncDerivedAddMode();

    return {
      normalizeEditAtomSelection,
      getEditAtomSelection,
      setEditAtomSelection,
      clearEditAtomSelection,
      clearEditSelectionsOnEmptyClick,
      selectAllEditAtoms,
      applyEditAtomSelectionClick,
      applyEditAtomSelectionBox,
      getEditIntent,
      setEditIntent,
      setEditAddMode,
      clearTransientInteractionState,
    };
  }

  global.VibeMolEditTools = Object.freeze({
    createEditToolsController,
  });
})(window);
