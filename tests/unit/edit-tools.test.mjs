import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';

const plain = (value) => JSON.parse(JSON.stringify(value));

function createEditToolsHarness() {
  const context = loadGlobalModule('assets/app/js/edit-tools.js');
  const editToolsApi = context.window.VibeMolEditTools;
  const EDIT_INTENT = {
    ATOM_MANIPULATION: 'atom_manipulation',
    ADD_ATOM: 'add_atom',
    ADD_FRAGMENT: 'add_fragment',
    ADD_MOLECULE: 'add_molecule',
  };
  const EDIT_ADD_MODE = { ATOM: 'atom', FRAGMENT: 'fragment', MOLECULE: 'molecule' };
  const EDIT_FRAGMENT_ATTACH_POLICY = { SMART: 'smart', APPEND: 'append', REPLACE_H: 'replace_h' };
  const record = {
    vol: {
      atoms: [
        { id: 'atom-1', Z: 6 },
        { id: 'atom-2', Z: 6 },
        { id: 'atom-3', Z: 1 },
      ],
    },
  };
  const state = {
    editIntent: EDIT_INTENT.ATOM_MANIPULATION,
    editAtomSelectionIndices: [],
    editAddMode: EDIT_ADD_MODE.ATOM,
    editAddElementZ: 6,
    editAddFragmentAttachPolicy: EDIT_FRAGMENT_ATTACH_POLICY.SMART,
    addAtomOperatorSession: null,
    editDownPt: { x: 1, y: 2 },
    editMoved: true,
    editClickIdx: 2,
  };
  const calls = {
    finalizeAddAtomOperatorSession: 0,
    hideAllAdaptiveToolPopovers: 0,
    clearAddGrowPreview: 0,
    clearMoleculePlacementPreview: 0,
    clearFuseRingPreview: 0,
    clearEditBondPendingSelection: 0,
    clearTransformState: 0,
    clearTransformSelection: 0,
    clearHover: 0,
    updateEditToolboxUi: 0,
    refreshActiveAddGrowPreview: 0,
    clearMeasurementSelectionForContextChange: 0,
    setCoordsHoveredAtomIndex: [],
    setCoordsInlineEditState: [],
    hintMessages: [],
    selectionChanges: [],
    bondClearState: [],
    bondPopupHidden: 0,
    pendingBondIndex: -1,
    transformSelectionActive: false,
  };
  const controller = editToolsApi.createEditToolsController({
    state,
    EDIT_INTENT,
    EDIT_ADD_MODE,
    EDIT_FRAGMENT_ATTACH_POLICY,
    getActiveRecord: () => record,
    isEditMode: () => true,
    finalizeAddAtomOperatorSession: () => {
      calls.finalizeAddAtomOperatorSession += 1;
      state.addAtomOperatorSession = null;
      return true;
    },
    hideAllAdaptiveToolPopovers: () => { calls.hideAllAdaptiveToolPopovers += 1; },
    clearAddGrowPreview: () => { calls.clearAddGrowPreview += 1; },
    clearMoleculePlacementPreview: () => { calls.clearMoleculePlacementPreview += 1; },
    clearFuseRingPreview: () => { calls.clearFuseRingPreview += 1; },
    clearEditBondPendingSelection: () => {
      const hadPending = calls.pendingBondIndex >= 0;
      calls.clearEditBondPendingSelection += 1;
      calls.pendingBondIndex = -1;
      return hadPending;
    },
    clearTransformState: () => { calls.clearTransformState += 1; },
    clearTransformSelection: () => {
      const hadTransformSelection = !!calls.transformSelectionActive;
      calls.clearTransformSelection += 1;
      calls.transformSelectionActive = false;
      return hadTransformSelection;
    },
    clearHover: () => { calls.clearHover += 1; },
    updateEditToolboxUi: () => { calls.updateEditToolboxUi += 1; },
    getCurrentFragmentDefinition: () => ({ name: 'Hydroxyl', formula: 'OH', preferredBondOrder: 1 }),
    getCurrentMoleculeDefinition: () => ({ name: 'Benzene', formula: 'C6H6', id: 'benzene' }),
    getElementSymbol: (z) => ({ 1: 'H', 6: 'C', 8: 'O' }[z] || '?'),
    getElementName: (z) => ({ 1: 'Hydrogen', 6: 'Carbon', 8: 'Oxygen' }[z] || 'Unknown'),
    getEditFragmentAttachPolicyLabel: (value) => String(value),
    refreshActiveAddGrowPreview: () => { calls.refreshActiveAddGrowPreview += 1; },
    normalizeEditAddBondOrder: (value) => Math.max(1, Math.min(4, Number(value) || 1)),
    setHintMessage: (message) => { calls.hintMessages.push(String(message || '')); },
    onSelectionChanged: (next, prev, changed) => { calls.selectionChanges.push({ next, prev, changed }); },
    clearMeasurementSelectionForContextChange: () => { calls.clearMeasurementSelectionForContextChange += 1; },
    setCoordsHoveredAtomIndex: (value) => { calls.setCoordsHoveredAtomIndex.push(value); },
    setCoordsInlineEditState: (value) => { calls.setCoordsInlineEditState.push(value); },
    getBondEditing: () => ({
      clearState: (payload) => { calls.bondClearState.push(payload); },
      getPendingAtomIndex: () => calls.pendingBondIndex,
      getPopupCarrier: () => (calls.bondPopupHidden ? null : (calls.pendingBondIndex >= 0 ? { id: 'carrier' } : null)),
      hidePopup: () => { calls.bondPopupHidden += 1; },
    }),
  });
  return { controller, state, calls, EDIT_INTENT, EDIT_ADD_MODE };
}

test('edit-tools selection logic supports replace, toggle, and select-all', () => {
  const { controller, calls, state } = createEditToolsHarness();

  assert.deepEqual(plain(controller.normalizeEditAtomSelection([2, 2, 1, -1, 9], { atoms: [{}, {}, {}] })), [1, 2]);
  state.addAtomOperatorSession = { source: 'new-atom' };
  calls.transformSelectionActive = true;
  assert.equal(controller.applyEditAtomSelectionClick(1, false), true);
  assert.deepEqual(plain(controller.getEditAtomSelection()), [1]);
  assert.equal(calls.finalizeAddAtomOperatorSession, 1);
  assert.equal(calls.clearTransformSelection, 1);
  calls.transformSelectionActive = true;
  assert.equal(controller.applyEditAtomSelectionClick(2, true), true);
  assert.deepEqual(plain(controller.getEditAtomSelection()), [1, 2]);
  assert.equal(calls.clearTransformSelection, 2);
  calls.transformSelectionActive = true;
  assert.equal(controller.applyEditAtomSelectionClick(1, true), true);
  assert.deepEqual(plain(controller.getEditAtomSelection()), [2]);
  assert.equal(calls.clearTransformSelection, 3);
  calls.transformSelectionActive = true;
  assert.equal(controller.selectAllEditAtoms(), true);
  assert.deepEqual(plain(controller.getEditAtomSelection()), [0, 1, 2]);
  assert.equal(calls.clearTransformSelection, 4);
  assert.match(calls.hintMessages.at(-1), /Selected all 3 atoms/);
});

test('edit-tools box selection supports replace and additive merge', () => {
  const { controller, calls } = createEditToolsHarness();

  calls.transformSelectionActive = true;
  assert.equal(controller.applyEditAtomSelectionBox([0, 2], false), true);
  assert.deepEqual(plain(controller.getEditAtomSelection()), [0, 2]);
  assert.equal(calls.clearTransformSelection, 1);
  assert.match(calls.hintMessages.at(-1), /Selected 2 atoms/);

  calls.transformSelectionActive = true;
  assert.equal(controller.applyEditAtomSelectionBox([1, 2], true), true);
  assert.deepEqual(plain(controller.getEditAtomSelection()), [0, 1, 2]);
  assert.equal(calls.clearTransformSelection, 2);
  assert.match(calls.hintMessages.at(-1), /Selection updated/);

  calls.transformSelectionActive = true;
  assert.equal(controller.applyEditAtomSelectionBox([], false), true);
  assert.deepEqual(plain(controller.getEditAtomSelection()), []);
  assert.equal(calls.clearTransformSelection, 3);
  assert.equal(calls.hintMessages.at(-1), 'Selection cleared.');
});

test('edit-tools intent transitions finalize atom sessions and derive add mode', () => {
  const { controller, state, calls, EDIT_INTENT, EDIT_ADD_MODE } = createEditToolsHarness();

  state.editIntent = EDIT_INTENT.ATOM_MANIPULATION;
  state.editAddMode = EDIT_ADD_MODE.ATOM;
  state.addAtomOperatorSession = { id: 'session-1' };
  controller.setEditIntent('unused_legacy_move');

  assert.equal(state.editIntent, EDIT_INTENT.ATOM_MANIPULATION);
  assert.equal(state.editAddMode, EDIT_ADD_MODE.ATOM);
  assert.equal(calls.finalizeAddAtomOperatorSession, 0);
  assert.equal(calls.clearAddGrowPreview, 0);
  assert.equal(calls.updateEditToolboxUi, 1);
  assert.match(calls.hintMessages.at(-1), /Build/);

  controller.setEditAddMode(EDIT_ADD_MODE.ATOM);
  assert.equal(state.editIntent, EDIT_INTENT.ADD_ATOM);
  assert.equal(state.editAddMode, EDIT_ADD_MODE.ATOM);
  assert.equal(calls.finalizeAddAtomOperatorSession, 1);
  assert.match(calls.hintMessages.at(-1), /Build element/);

  state.addAtomOperatorSession = { id: 'session-2' };
  controller.setEditAddMode(EDIT_ADD_MODE.MOLECULE);
  assert.equal(state.editIntent, EDIT_INTENT.ADD_MOLECULE);
  assert.equal(state.editAddMode, EDIT_ADD_MODE.MOLECULE);
  assert.equal(calls.finalizeAddAtomOperatorSession, 2);
  assert.equal(calls.clearAddGrowPreview >= 1, true);
  assert.equal(calls.refreshActiveAddGrowPreview >= 1, true);
});

test('edit-tools fragment add mode owns fragment intent and emits a dedicated hint', () => {
  const { controller, state, calls, EDIT_INTENT, EDIT_ADD_MODE } = createEditToolsHarness();

  controller.setEditIntent(EDIT_INTENT.ATOM_MANIPULATION);
  assert.equal(state.editIntent, EDIT_INTENT.ATOM_MANIPULATION);
  assert.match(calls.hintMessages.at(-1), /Build/);

  controller.setEditAddMode(EDIT_ADD_MODE.FRAGMENT);
  assert.equal(state.editIntent, EDIT_INTENT.ADD_FRAGMENT);
  assert.equal(state.editAddMode, EDIT_ADD_MODE.FRAGMENT);
  assert.match(calls.hintMessages.at(-1), /Build fragment/);
  assert.equal(calls.clearAddGrowPreview, 0);
});

test('edit-tools intent transitions can leave popover closing to the caller', () => {
  const { controller, calls, EDIT_INTENT } = createEditToolsHarness();

  controller.setEditIntent(EDIT_INTENT.ADD_ATOM, { closePopovers: false });
  assert.equal(calls.hideAllAdaptiveToolPopovers, 0);
  assert.equal(calls.updateEditToolboxUi, 1);

  controller.setEditIntent(EDIT_INTENT.ADD_FRAGMENT);
  assert.equal(calls.hideAllAdaptiveToolPopovers, 1);
  assert.equal(calls.updateEditToolboxUi, 2);
});

test('edit-tools leaving atom manipulation clears transform transient state', () => {
  const { controller, calls, EDIT_INTENT } = createEditToolsHarness();

  controller.setEditIntent(EDIT_INTENT.ADD_MOLECULE);
  assert.equal(calls.clearTransformState, 1);
});

test('edit-tools leaving atom manipulation clears current atom, transform, and bond selection state', () => {
  const { controller, calls, EDIT_INTENT } = createEditToolsHarness();

  controller.setEditAtomSelection([0, 2]);
  calls.transformSelectionActive = true;
  calls.pendingBondIndex = 1;

  controller.setEditIntent(EDIT_INTENT.ADD_FRAGMENT);

  assert.deepEqual(plain(controller.getEditAtomSelection()), []);
  assert.equal(calls.clearTransformSelection, 1);
  assert.equal(calls.clearEditBondPendingSelection, 1);
  assert.equal(calls.bondPopupHidden, 1);
});

test('edit-tools can preserve atom selection when leaving atom manipulation intentionally', () => {
  const { controller, calls, EDIT_INTENT } = createEditToolsHarness();

  controller.setEditAtomSelection([0, 2]);
  calls.transformSelectionActive = true;
  calls.pendingBondIndex = 1;

  controller.setEditIntent(EDIT_INTENT.ADD_FRAGMENT, { preserveSelection: true });

  assert.deepEqual(plain(controller.getEditAtomSelection()), [0, 2]);
  assert.equal(calls.clearTransformSelection, 1);
  assert.equal(calls.clearEditBondPendingSelection, 1);
  assert.equal(calls.bondPopupHidden, 1);
});

test('edit-tools clearTransientInteractionState clears selection, pointer state, and bond transient state', () => {
  const { controller, state, calls } = createEditToolsHarness();

  controller.setEditAtomSelection([0, 2]);
  controller.clearTransientInteractionState();

  assert.deepEqual(plain(controller.getEditAtomSelection()), []);
  assert.equal(state.editDownPt, null);
  assert.equal(state.editMoved, false);
  assert.equal(state.editClickIdx, -1);
  assert.equal(calls.clearMeasurementSelectionForContextChange, 1);
  assert.deepEqual(calls.setCoordsHoveredAtomIndex.at(-1), -1);
  assert.deepEqual(calls.setCoordsInlineEditState.at(-1), null);
  assert.deepEqual(plain(calls.bondClearState.at(-1)), { pendingSelection: false });
});

test('edit-tools clearEditSelectionsOnEmptyClick clears atom, transform, and bond selection state together', () => {
  const { controller, calls } = createEditToolsHarness();

  controller.setEditAtomSelection([0, 2]);
  calls.transformSelectionActive = true;
  calls.pendingBondIndex = 1;

  const changed = controller.clearEditSelectionsOnEmptyClick();

  assert.equal(changed, true);
  assert.deepEqual(plain(controller.getEditAtomSelection()), []);
  assert.equal(calls.clearTransformSelection, 1);
  assert.equal(calls.clearEditBondPendingSelection, 1);
  assert.equal(calls.bondPopupHidden, 1);
});
