import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';

const plain = (value) => JSON.parse(JSON.stringify(value));

function createEditToolsHarness() {
  const context = loadGlobalModule('assets/app/js/edit-tools.js');
  const editToolsApi = context.window.VibeMolEditTools;
  const EDIT_TOOL = {
    SELECT: 'select',
    MOVE: 'move',
    ADD: 'add',
    BOND: 'bond',
    TRANSFORM: 'transform',
    DELETE: 'delete',
  };
  const EDIT_BOND_ACTION = { SET: 'set' };
  const EDIT_ADD_MODE = { ATOM: 'atom', FRAGMENT: 'fragment', MOLECULE: 'molecule' };
  const EDIT_FRAGMENT_ATTACH_POLICY = { AUTO: 'auto', FUSE_RING: 'fuse_ring' };
  const EDIT_TRANSFORM_MODE = { MOVE: 'move', ROTATE_FRAGMENT: 'rotate_fragment', ROTATE_BOND: 'rotate_bond' };
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
    editAtomSelectionIndices: [],
    editTool: EDIT_TOOL.MOVE,
    editAddMode: EDIT_ADD_MODE.ATOM,
    editAddElementZ: 6,
    editAddFragmentAttachPolicy: EDIT_FRAGMENT_ATTACH_POLICY.AUTO,
    editTransformMode: EDIT_TRANSFORM_MODE.MOVE,
    editTransformScope: 'fragment',
    editBondAction: null,
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
    updateAxisButtons: 0,
    refreshActiveAddGrowPreview: 0,
    clearMeasurementSelectionForContextChange: 0,
    setCoordsHoveredAtomIndex: [],
    setCoordsInlineEditState: [],
    hintMessages: [],
    selectionChanges: [],
    bondClearState: [],
  };
  const controller = editToolsApi.createEditToolsController({
    state,
    EDIT_TOOL,
    EDIT_BOND_ACTION,
    EDIT_ADD_MODE,
    EDIT_FRAGMENT_ATTACH_POLICY,
    EDIT_TRANSFORM_MODE,
    getActiveRecord: () => record,
    isEditMode: () => true,
    finalizeAddAtomOperatorSession: () => { calls.finalizeAddAtomOperatorSession += 1; return true; },
    hideAllAdaptiveToolPopovers: () => { calls.hideAllAdaptiveToolPopovers += 1; },
    updateAxisGuideLine: () => {},
    clearAddGrowPreview: () => { calls.clearAddGrowPreview += 1; },
    clearMoleculePlacementPreview: () => { calls.clearMoleculePlacementPreview += 1; },
    clearFuseRingPreview: () => { calls.clearFuseRingPreview += 1; },
    clearEditBondPendingSelection: () => { calls.clearEditBondPendingSelection += 1; },
    clearTransformState: () => { calls.clearTransformState += 1; },
    clearTransformSelection: () => { calls.clearTransformSelection += 1; },
    clearHover: () => { calls.clearHover += 1; },
    updateEditToolboxUi: () => { calls.updateEditToolboxUi += 1; },
    updateAxisButtons: () => { calls.updateAxisButtons += 1; },
    getCurrentFragmentDefinition: () => ({ name: 'Hydroxyl', formula: 'OH', preferredBondOrder: 1 }),
    getCurrentMoleculeDefinition: () => ({ name: 'Benzene', formula: 'C6H6', id: 'benzene' }),
    getElementSymbol: (z) => ({ 1: 'H', 6: 'C', 8: 'O' }[z] || '?'),
    getElementName: (z) => ({ 1: 'Hydrogen', 6: 'Carbon', 8: 'Oxygen' }[z] || 'Unknown'),
    getEditFragmentAttachPolicyLabel: (value) => String(value),
    getEditTransformModeLabel: (value) => String(value),
    getEditTransformScopeLabel: (value) => String(value),
    refreshActiveAddGrowPreview: () => { calls.refreshActiveAddGrowPreview += 1; },
    normalizeEditAddBondOrder: (value) => Math.max(1, Math.min(4, Number(value) || 1)),
    setHintMessage: (message) => { calls.hintMessages.push(String(message || '')); },
    onSelectionChanged: (next, prev, changed) => { calls.selectionChanges.push({ next, prev, changed }); },
    clearMeasurementSelectionForContextChange: () => { calls.clearMeasurementSelectionForContextChange += 1; },
    setCoordsHoveredAtomIndex: (value) => { calls.setCoordsHoveredAtomIndex.push(value); },
    setCoordsInlineEditState: (value) => { calls.setCoordsInlineEditState.push(value); },
    getBondEditing: () => ({ clearState: (payload) => { calls.bondClearState.push(payload); } }),
  });
  return { controller, state, calls, EDIT_TOOL, EDIT_ADD_MODE, EDIT_BOND_ACTION };
}

test('edit-tools selection logic supports replace, toggle, and select-all', () => {
  const { controller, calls } = createEditToolsHarness();

  assert.deepEqual(plain(controller.normalizeEditAtomSelection([2, 2, 1, -1, 9], { atoms: [{}, {}, {}] })), [1, 2]);
  assert.equal(controller.applyEditAtomSelectionClick(1, false), true);
  assert.deepEqual(plain(controller.getEditAtomSelection()), [1]);
  assert.equal(controller.applyEditAtomSelectionClick(2, true), true);
  assert.deepEqual(plain(controller.getEditAtomSelection()), [1, 2]);
  assert.equal(controller.applyEditAtomSelectionClick(1, true), true);
  assert.deepEqual(plain(controller.getEditAtomSelection()), [2]);
  assert.equal(controller.selectAllEditAtoms(), true);
  assert.deepEqual(plain(controller.getEditAtomSelection()), [0, 1, 2]);
  assert.match(calls.hintMessages.at(-1), /Selected all 3 atoms/);
});

test('edit-tools tool transitions finalize add-atom sessions and reset transient state', () => {
  const { controller, state, calls, EDIT_TOOL, EDIT_ADD_MODE, EDIT_BOND_ACTION } = createEditToolsHarness();

  state.editTool = EDIT_TOOL.ADD;
  state.editAddMode = EDIT_ADD_MODE.ATOM;
  state.addAtomOperatorSession = { id: 'session-1' };
  controller.setEditTool(EDIT_TOOL.BOND);

  assert.equal(state.editTool, EDIT_TOOL.BOND);
  assert.equal(state.editBondAction, EDIT_BOND_ACTION.SET);
  assert.equal(calls.finalizeAddAtomOperatorSession, 1);
  assert.equal(calls.clearAddGrowPreview, 1);
  assert.equal(calls.updateEditToolboxUi, 1);
  assert.match(calls.hintMessages.at(-1), /Bond/);

  state.addAtomOperatorSession = { id: 'session-2' };
  controller.setEditAddMode(EDIT_ADD_MODE.MOLECULE);
  assert.equal(state.editAddMode, EDIT_ADD_MODE.MOLECULE);
  assert.equal(calls.finalizeAddAtomOperatorSession, 2);
  assert.equal(calls.clearAddGrowPreview >= 2, true);
  assert.equal(calls.refreshActiveAddGrowPreview >= 1, true);
});

test('edit-tools clearTransientInteractionState clears selection, pointer state, and bond tool transient state', () => {
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
