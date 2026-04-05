(function (global) {
  'use strict';

  /**
   * Create one controller for edit-tool coordination and edit-mode atom selection.
   * App-specific UI, render, and scene hooks are injected through callbacks.
   * @param {object} options
   */
  function createEditToolsController(options = {}) {
    const state = options.state || {};
    const EDIT_TOOL = options.EDIT_TOOL || {};
    const EDIT_BOND_ACTION = options.EDIT_BOND_ACTION || {};
    const EDIT_ADD_MODE = options.EDIT_ADD_MODE || {};
    const EDIT_FRAGMENT_ATTACH_POLICY = options.EDIT_FRAGMENT_ATTACH_POLICY || {};
    const EDIT_TRANSFORM_MODE = options.EDIT_TRANSFORM_MODE || {};
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
    const clearHover = typeof options.clearHover === 'function' ? options.clearHover : (() => {});
    const updateEditToolboxUi = typeof options.updateEditToolboxUi === 'function' ? options.updateEditToolboxUi : (() => {});
    const getCurrentFragmentDefinition = typeof options.getCurrentFragmentDefinition === 'function' ? options.getCurrentFragmentDefinition : (() => null);
    const getCurrentMoleculeDefinition = typeof options.getCurrentMoleculeDefinition === 'function' ? options.getCurrentMoleculeDefinition : (() => null);
    const getElementSymbol = typeof options.getElementSymbol === 'function' ? options.getElementSymbol : ((z) => String(z || '?'));
    const getElementName = typeof options.getElementName === 'function' ? options.getElementName : ((z) => String(z || '?'));
    const getEditFragmentAttachPolicyLabel = typeof options.getEditFragmentAttachPolicyLabel === 'function' ? options.getEditFragmentAttachPolicyLabel : ((value) => String(value || ''));
    const getEditTransformModeLabel = typeof options.getEditTransformModeLabel === 'function' ? options.getEditTransformModeLabel : ((value) => String(value || ''));
    const getEditTransformScopeLabel = typeof options.getEditTransformScopeLabel === 'function' ? options.getEditTransformScopeLabel : ((value) => String(value || ''));
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

    function clearEditSelectionsOnEmptyClick(clearOptions = {}) {
      const record = getActiveRecord();
      const vol = record && record.vol;
      const bondEditing = getBondEditing();
      let changed = false;
      if (clearOptions.selection !== false) {
        changed = clearEditAtomSelection() || changed;
      }
      if (clearOptions.transform !== false) {
        changed = !!clearTransformSelection() || changed;
      }
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
        if (bondEditing && typeof bondEditing.hidePopup === 'function') {
          bondEditing.hidePopup();
        }
        changed = changed || hadPendingBondSelection || hadBondPopup || clearedPendingBondSelection;
      }
      return changed;
    }

    function selectAllEditAtoms() {
      const record = getActiveRecord();
      const vol = record && record.vol;
      if (!vol || !Array.isArray(vol.atoms) || vol.atoms.length === 0) return false;
      const changed = setEditAtomSelection(vol.atoms.map((_, idx) => idx));
      if (changed) setHintMessage(`Selected all ${vol.atoms.length} atoms.`);
      else setHintMessage(`All ${vol.atoms.length} atoms are already selected.`);
      return changed;
    }

    function applyEditAtomSelectionClick(atomIndex, additive) {
      const idx = atomIndex | 0;
      const current = getEditAtomSelection();
      if (idx < 0) return false;
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

    function buildAddToolHint() {
      if (state.editAddMode === EDIT_ADD_MODE.FRAGMENT) {
        const fragment = getCurrentFragmentDefinition();
        const label = fragment ? `${fragment.name} (${fragment.formula})` : 'fragment';
        if (state.editAddFragmentAttachPolicy === EDIT_FRAGMENT_ATTACH_POLICY.FUSE_RING) {
          return `Edit tool: Add fragment (${label}) • Fuse ring mode • Click a host bond • Drag to spin • Click to confirm • Space previews/applies missing H`;
        }
        return `Edit tool: Add fragment (${label}) • ${getEditFragmentAttachPolicyLabel(state.editAddFragmentAttachPolicy)} • Click an anchor atom • Grow-drag follows the view plane • Hold Shift to bypass angle snap for free placement • Space previews/applies missing H`;
      }
      if (state.editAddMode === EDIT_ADD_MODE.MOLECULE) {
        const molecule = getCurrentMoleculeDefinition();
        const label = molecule ? `${molecule.name} (${molecule.formula})` : 'molecule';
        return `Edit tool: Add molecule (${label}) • Click to place • Drag to rotate • Click again to confirm • Space previews/applies missing H`;
      }
      return `Edit tool: Add atom (${getElementSymbol(state.editAddElementZ)}) • Cursor angle controls free placement • Grow-drag follows the view plane • Hold Shift to bypass angle snap for free placement • Space previews/applies missing H`;
    }

    function buildTransformHint() {
      const modeLabel = getEditTransformModeLabel(state.editTransformMode);
      const scopeLabel = getEditTransformScopeLabel(state.editTransformScope);
      if (state.editTransformMode === EDIT_TRANSFORM_MODE.ROTATE_BOND) {
        return `Edit tool: ${modeLabel} • Scope ${scopeLabel} • Click a bond to select one side • Drag the selection to rotate around the opposite atom • Shift-click adds another target`;
      }
      return `Edit tool: ${modeLabel} • Scope ${scopeLabel} • Click an atom to select its fragment or whole molecule • Click a bond to select one side • Drag the selection to rotate • Bond-side selections spin about the bond axis • Click empty space to clear • Shift-click adds another target`;
    }

    function setEditTool(nextTool, options = {}) {
      const announce = options.announce !== false;
      const prevTool = state.editTool;
      const leavingAddAtomOperator = !!state.addAtomOperatorSession
        && (nextTool !== EDIT_TOOL.ADD || state.editAddMode !== EDIT_ADD_MODE.ATOM);
      if (leavingAddAtomOperator) finalizeAddAtomOperatorSession({ announce: false });
      if (nextTool === EDIT_TOOL.SELECT) state.editTool = EDIT_TOOL.SELECT;
      else if (nextTool === EDIT_TOOL.MOVE) state.editTool = EDIT_TOOL.MOVE;
      else if (nextTool === EDIT_TOOL.ROTATE) state.editTool = EDIT_TOOL.ROTATE;
      else if (nextTool === EDIT_TOOL.ADD) state.editTool = EDIT_TOOL.ADD;
      else if (nextTool === EDIT_TOOL.BOND) state.editTool = EDIT_TOOL.BOND;
      else if (nextTool === EDIT_TOOL.TRANSFORM) state.editTool = EDIT_TOOL.TRANSFORM;
      else if (nextTool === EDIT_TOOL.DELETE) state.editTool = EDIT_TOOL.DELETE;
      else state.editTool = EDIT_TOOL.MOVE;
      if (state.editTool !== EDIT_TOOL.ADD && state.editTool !== EDIT_TOOL.BOND && state.editTool !== EDIT_TOOL.TRANSFORM) {
        hideAllAdaptiveToolPopovers();
      }
      if (state.editTool === EDIT_TOOL.BOND) state.editBondAction = EDIT_BOND_ACTION.SET;
      if (state.editTool !== EDIT_TOOL.ADD && prevTool === EDIT_TOOL.ADD) {
        clearAddGrowPreview();
        clearMoleculePlacementPreview();
        clearFuseRingPreview();
      }
      if (state.editTool !== EDIT_TOOL.BOND && prevTool === EDIT_TOOL.BOND) {
        clearEditBondPendingSelection();
      }
      if (state.editTool !== EDIT_TOOL.TRANSFORM && prevTool === EDIT_TOOL.TRANSFORM) {
        clearTransformState();
        clearTransformSelection();
      }
      clearHover();
      updateEditToolboxUi();
      if (!announce || !isEditMode()) return;
      if (state.editTool === EDIT_TOOL.SELECT) {
        const count = getEditAtomSelection().length;
        setHintMessage(count
          ? `Edit tool: Selection • Click to replace • Drag to box-select • Shift-click to add/remove • Shift-drag adds box hits • Cmd/Ctrl+A selects all • Space previews/applies missing H • ${count} atom${count === 1 ? '' : 's'} currently selected`
          : 'Edit tool: Selection • Click to select • Drag to box-select • Shift-click to add/remove • Click empty space to clear • Cmd/Ctrl+A selects all • Space previews/applies missing H');
        return;
      }
      if (state.editTool === EDIT_TOOL.ADD) {
        setHintMessage(buildAddToolHint());
        return;
      }
      if (state.editTool === EDIT_TOOL.BOND) {
        setHintMessage('Edit tool: Bond • Click two atoms to create a bond • Click an existing bond to edit order • Right-click a bond or choose 0 to delete it.');
        return;
      }
      if (state.editTool === EDIT_TOOL.TRANSFORM) {
        setHintMessage(buildTransformHint());
        return;
      }
      if (state.editTool === EDIT_TOOL.DELETE) {
        setHintMessage('Edit tool: Delete • Click an atom or press Backspace/Delete on hovered atom');
        return;
      }
      if (state.editTool === EDIT_TOOL.ROTATE) {
        setHintMessage('Edit tool: Rotate • Drag a selected atom to rotate the selection • Drag an axis ring to constrain rotation • Drag an unselected atom to retarget and rotate it • Background drag rotates view • Space previews/applies missing H');
        return;
      }
      setHintMessage('Edit tool: Move • Drag a selected atom to move the selection • Drag an axis arrow to constrain motion • Drag an unselected atom to retarget and move it • Background drag rotates view • Space previews/applies missing H');
    }

    function setEditAddMode(nextMode, options = {}) {
      const announce = options.announce !== false;
      const syncSearch = options.syncSearch !== false;
      const leavingAtomAddMode = !!state.addAtomOperatorSession && nextMode !== EDIT_ADD_MODE.ATOM;
      if (leavingAtomAddMode) finalizeAddAtomOperatorSession({ announce: false });
      if (nextMode === EDIT_ADD_MODE.FRAGMENT) state.editAddMode = EDIT_ADD_MODE.FRAGMENT;
      else if (nextMode === EDIT_ADD_MODE.MOLECULE) state.editAddMode = EDIT_ADD_MODE.MOLECULE;
      else state.editAddMode = EDIT_ADD_MODE.ATOM;
      if (state.editAddMode !== EDIT_ADD_MODE.MOLECULE) clearMoleculePlacementPreview();
      if (state.editAddMode !== EDIT_ADD_MODE.FRAGMENT) clearFuseRingPreview();
      if (state.editAddMode !== EDIT_ADD_MODE.ATOM) clearAddGrowPreview();
      if (state.editAddMode === EDIT_ADD_MODE.FRAGMENT) {
        const fragment = getCurrentFragmentDefinition();
        if (fragment) state.editAddBondOrder = normalizeEditAddBondOrder(fragment.preferredBondOrder || state.editAddBondOrder);
      } else if (state.editAddMode === EDIT_ADD_MODE.MOLECULE) {
        const molecule = getCurrentMoleculeDefinition();
        if (molecule) state.editAddMoleculeId = molecule.id;
      }
      refreshActiveAddGrowPreview();
      updateEditToolboxUi({ syncSearch });
      if (!announce || !isEditMode() || state.editTool !== EDIT_TOOL.ADD) return;
      if (state.editAddMode === EDIT_ADD_MODE.FRAGMENT) {
        const fragment = getCurrentFragmentDefinition();
        const label = fragment ? `${fragment.name} (${fragment.formula})` : 'fragment';
        if (state.editAddFragmentAttachPolicy === EDIT_FRAGMENT_ATTACH_POLICY.FUSE_RING) {
          setHintMessage(`Add fragment: ${label} • Fuse ring • Click a host bond • Drag to spin • Click again to confirm`);
        } else {
          setHintMessage(`Add fragment: ${label} • Policy ${getEditFragmentAttachPolicyLabel(state.editAddFragmentAttachPolicy)}`);
        }
        return;
      }
      if (state.editAddMode === EDIT_ADD_MODE.MOLECULE) {
        const molecule = getCurrentMoleculeDefinition();
        const label = molecule ? `${molecule.name} (${molecule.formula})` : 'molecule';
        setHintMessage(`Add molecule: ${label} • Click to place • Drag to rotate • Click again to confirm • X/Y/Z align`);
        return;
      }
      setHintMessage(`Add atom: ${getElementName(state.editAddElementZ)} (${getElementSymbol(state.editAddElementZ)}) • Space previews/applies missing H`);
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

    return {
      normalizeEditAtomSelection,
      getEditAtomSelection,
      setEditAtomSelection,
      clearEditAtomSelection,
      clearEditSelectionsOnEmptyClick,
      selectAllEditAtoms,
      applyEditAtomSelectionClick,
      applyEditAtomSelectionBox,
      setEditTool,
      setEditAddMode,
      clearTransientInteractionState,
    };
  }

  global.VibeMolEditTools = Object.freeze({
    createEditToolsController,
  });
})(window);
