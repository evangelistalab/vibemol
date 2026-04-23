import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';

function createHarness(options = {}) {
  const context = loadGlobalModule('assets/app/js/edit-gestures.js');
  const api = context.window.VibeMolEditGestures;
  let selection = Array.isArray(options.selection) ? options.selection.slice() : [];
  let pendingBondOrder = Number.isFinite(options.pendingBondOrder) ? Number(options.pendingBondOrder) : 1;
  const calls = {
    selectionClicks: [],
    bondCenterClicks: [],
    setSelection: [],
    clearSelection: 0,
    startBoxSelection: [],
    updateBoxSelection: [],
    finishBoxSelection: [],
    cancelBoxSelection: 0,
    showVoidPreview: 0,
    hideVoidPreview: 0,
    placeVoidAtom: 0,
    beginGrowDrag: [],
    updateGrowDrag: [],
    commitGrowDrag: [],
    cancelGrowDrag: 0,
    startMoveDrag: [],
    startRotateDrag: [],
    updateMoveDrag: 0,
    updateRotateDrag: 0,
    finishMoveDrag: 0,
    finishRotateDrag: 0,
    cancelMoveDrag: 0,
    cancelRotateDrag: 0,
    resolveMoveScope: [],
    resolveDownstreamMoveScope: [],
    cyclePendingBondOrder: [],
    setPendingBondOrder: [],
    uiStates: [],
    hints: [],
    capturePointer: [],
    releasePointer: [],
  };
  const controller = api.createEditGestureController({
    isEnabled: () => true,
    getSelection: () => selection.slice(),
    setSelection: (next) => {
      selection = Array.isArray(next) ? next.slice() : [];
      calls.setSelection.push(selection.slice());
      return true;
    },
    applySelectionClick: (atomIndex, additive) => {
      calls.selectionClicks.push({ atomIndex, additive: !!additive });
      if (additive) {
        const set = new Set(selection);
        if (set.has(atomIndex)) set.delete(atomIndex); else set.add(atomIndex);
        selection = Array.from(set).sort((a, b) => a - b);
      } else {
        selection = [atomIndex | 0];
      }
      return true;
    },
    clearSelection: () => {
      const hadSelection = selection.length > 0;
      selection = [];
      calls.clearSelection += 1;
      return hadSelection;
    },
    applySelectionBox: (atomIndices, additive) => {
      if (additive) {
        const set = new Set(selection);
        for (const atomIndex of Array.isArray(atomIndices) ? atomIndices : []) set.add(atomIndex | 0);
        selection = Array.from(set).sort((a, b) => a - b);
      } else {
        selection = Array.isArray(atomIndices) ? atomIndices.map((atomIndex) => atomIndex | 0) : [];
      }
      return true;
    },
    pickAtomObject: (e) => Number.isInteger(e && e.atomIndex) ? { userData: { index: e.atomIndex | 0 } } : null,
    pickBondHit: (e) => (e && e.bondHit) || null,
    applyBondCenterClick: (bondHit) => {
      calls.bondCenterClicks.push(bondHit);
      return true;
    },
    showVoidPlacementPreview: () => {
      calls.showVoidPreview += 1;
      return true;
    },
    hideVoidPlacementPreview: () => {
      calls.hideVoidPreview += 1;
    },
    placeVoidAtom: () => {
      calls.placeVoidAtom += 1;
      selection = [99];
      return { selection: [99] };
    },
    beginGrowDrag: (_e, atomIndex) => {
      calls.beginGrowDrag.push(atomIndex | 0);
      return true;
    },
    updateGrowDrag: (e) => {
      const targetAtomIndex = Number.isInteger(e && e.targetAtomIndex) ? (e.targetAtomIndex | 0) : -1;
      calls.updateGrowDrag.push(targetAtomIndex);
      return { targetAtomIndex };
    },
    commitGrowDrag: (payload) => {
      calls.commitGrowDrag.push(payload);
      return { selection: [] };
    },
    cancelGrowDrag: () => {
      calls.cancelGrowDrag += 1;
    },
    startMoveDrag: (_e, indices, anchorWorld) => {
      calls.startMoveDrag.push({ indices: Array.isArray(indices) ? indices.slice() : [], anchorWorld });
      return true;
    },
    startRotateDrag: (_e, indices, dragOptions) => {
      calls.startRotateDrag.push({
        indices: Array.isArray(indices) ? indices.slice() : [],
        dragOptions: dragOptions || {},
      });
      return true;
    },
    updateMoveDrag: () => {
      calls.updateMoveDrag += 1;
      return true;
    },
    updateRotateDrag: () => {
      calls.updateRotateDrag += 1;
      return true;
    },
    finishMoveDrag: () => {
      calls.finishMoveDrag += 1;
      return true;
    },
    finishRotateDrag: () => {
      calls.finishRotateDrag += 1;
      return true;
    },
    cancelMoveDrag: () => {
      calls.cancelMoveDrag += 1;
    },
    cancelRotateDrag: () => {
      calls.cancelRotateDrag += 1;
    },
    resolveMoveScope: (atomIndex, resolveOptions = {}) => {
      calls.resolveMoveScope.push({ atomIndex: atomIndex | 0, atomOnly: !!resolveOptions.atomOnly, preview: !!resolveOptions.preview });
      if (typeof options.resolveMoveScope === 'function') return options.resolveMoveScope(atomIndex, resolveOptions);
      const indices = resolveOptions.atomOnly ? [atomIndex | 0] : [atomIndex | 0, (atomIndex | 0) + 1];
      return {
        indices,
        label: resolveOptions.atomOnly ? 'Move scope: atom only' : 'Move scope: fragment',
        anchorWorld: { x: atomIndex | 0, y: 0, z: 0 },
      };
    },
    resolveDownstreamMoveScope: (bondHit) => {
      calls.resolveDownstreamMoveScope.push(bondHit);
      if (typeof options.resolveDownstreamMoveScope === 'function') return options.resolveDownstreamMoveScope(bondHit);
      return {
        indices: [4, 5],
        label: 'Move scope: downstream',
        anchorWorld: { x: 4, y: 0, z: 0 },
      };
    },
    shouldPreferGrowDrag: (atomIndex) => !!(typeof options.shouldPreferGrowDrag === 'function' && options.shouldPreferGrowDrag(atomIndex)),
    getSelectionDragMode: typeof options.getSelectionDragMode === 'function' ? options.getSelectionDragMode : (() => 'translate'),
    getPendingBondOrder: () => pendingBondOrder,
    cyclePendingBondOrder: (step) => {
      calls.cyclePendingBondOrder.push(step);
      pendingBondOrder += step < 0 ? -1 : 1;
      if (pendingBondOrder < 1) pendingBondOrder = 3;
      if (pendingBondOrder > 3) pendingBondOrder = 1;
      return pendingBondOrder;
    },
    setPendingBondOrder: (order) => {
      pendingBondOrder = Math.max(1, Math.min(3, Number(order) || 1));
      calls.setPendingBondOrder.push(pendingBondOrder);
      return pendingBondOrder;
    },
    getLoadedElementSymbol: () => 'C',
    getLoadedElementName: () => 'Carbon',
    onUiStateChanged: (uiState) => {
      calls.uiStates.push(uiState);
    },
    setHintMessage: (message) => {
      calls.hints.push(String(message || ''));
    },
    startBoxSelection: (startX, startY, clientX, clientY) => {
      calls.startBoxSelection.push({ startX, startY, clientX, clientY });
      return true;
    },
    updateBoxSelection: (startX, startY, clientX, clientY) => {
      calls.updateBoxSelection.push({ startX, startY, clientX, clientY });
      return true;
    },
    finishBoxSelection: (additive) => {
      calls.finishBoxSelection.push({ additive: !!additive });
      if (typeof options.finishBoxSelection === 'function') return options.finishBoxSelection(additive, selection);
      selection = !!additive ? Array.from(new Set([...selection, 7, 8])).sort((a, b) => a - b) : [7, 8];
      return true;
    },
    cancelBoxSelection: () => {
      calls.cancelBoxSelection += 1;
    },
    handleExternalPointerDown: typeof options.handleExternalPointerDown === 'function'
      ? options.handleExternalPointerDown
      : (() => false),
    handleExternalPointerMove: typeof options.handleExternalPointerMove === 'function'
      ? options.handleExternalPointerMove
      : (() => false),
    handleExternalPointerUp: typeof options.handleExternalPointerUp === 'function'
      ? options.handleExternalPointerUp
      : (() => false),
    handleExternalPointerCancel: typeof options.handleExternalPointerCancel === 'function'
      ? options.handleExternalPointerCancel
      : (() => false),
    capturePointer: (pointerId) => calls.capturePointer.push(pointerId),
    releasePointer: (pointerId) => calls.releasePointer.push(pointerId),
  });
  return {
    controller,
    calls,
    getSelection: () => selection.slice(),
    getPendingBondOrder: () => pendingBondOrder,
  };
}

function pointerEvent(overrides = {}) {
  return {
    button: 0,
    pointerId: 1,
    clientX: 10,
    clientY: 10,
    shiftKey: false,
    altKey: false,
    ...overrides,
  };
}

test('edit-gestures places on void when selection is empty', () => {
  const { controller, calls, getSelection } = createHarness({ selection: [] });

  assert.equal(controller.handlePointerDown(pointerEvent()), true);
  assert.equal(controller.handlePointerUp(pointerEvent()), true);

  assert.equal(calls.placeVoidAtom, 1);
  assert.deepEqual(getSelection(), [99]);
});

test('edit-gestures clears selection on void click when something is selected', () => {
  const { controller, calls, getSelection } = createHarness({ selection: [2, 3] });

  controller.handlePointerDown(pointerEvent());
  controller.handlePointerUp(pointerEvent());

  assert.equal(calls.clearSelection, 1);
  assert.deepEqual(getSelection(), []);
});

test('edit-gestures void drag starts and applies box selection, then cleans it up', () => {
  const { controller, calls, getSelection } = createHarness({ selection: [] });

  controller.handlePointerDown(pointerEvent({ clientX: 0, clientY: 0 }));
  controller.handlePointerMove(pointerEvent({ clientX: 20, clientY: 20 }));
  controller.handlePointerMove(pointerEvent({ clientX: 30, clientY: 24 }));
  controller.handlePointerUp(pointerEvent({ clientX: 30, clientY: 24 }));

  assert.equal(calls.placeVoidAtom, 0);
  assert.equal(calls.clearSelection, 0);
  assert.equal(calls.startBoxSelection.length, 1);
  assert.equal(calls.updateBoxSelection.length >= 1, true);
  assert.deepEqual(calls.finishBoxSelection, [{ additive: false }]);
  assert.deepEqual(getSelection(), [7, 8]);
});

test('edit-gestures left-click on atom does not change selection', () => {
  const { controller, calls, getSelection } = createHarness({ selection: [] });

  controller.handlePointerDown(pointerEvent({ atomIndex: 2, detail: 1 }));
  controller.handlePointerUp(pointerEvent({ atomIndex: 2, detail: 1 }));

  assert.deepEqual(calls.selectionClicks, []);
  assert.deepEqual(getSelection(), []);
});

test('edit-gestures left click on bond center-third delegates to bond order cycling', () => {
  const { controller, calls, getSelection } = createHarness({ selection: [4] });

  controller.handlePointerDown(pointerEvent({ bondHit: { object: { id: 'bond-1' }, section: 'center' } }));
  controller.handlePointerUp(pointerEvent({ bondHit: { object: { id: 'bond-1' }, section: 'center' } }));

  assert.equal(calls.bondCenterClicks.length, 1);
  assert.equal(calls.bondCenterClicks[0].section, 'center');
  assert.deepEqual(getSelection(), [4]);
  assert.equal(calls.selectionClicks.length, 0);
  assert.equal(calls.placeVoidAtom, 0);
});

test('edit-gestures bond center click resolver does not override a current near-side hit', () => {
  const { controller } = createHarness({ selection: [] });

  controller.handlePointerMove(pointerEvent({ bondHit: { object: { id: 'bond-1' }, section: 'center' } }));

  const resolved = controller.resolveBondCenterClickHit(
    pointerEvent({ bondHit: { object: { id: 'bond-1' }, section: 'nearB' } })
  );

  assert.equal(resolved, null);
});

test('edit-gestures left double-click on atom remains inert', () => {
  const { controller, calls, getSelection } = createHarness({ selection: [] });

  controller.handlePointerDown(pointerEvent({ atomIndex: 1, detail: 2 }));
  controller.handlePointerUp(pointerEvent({ atomIndex: 1, detail: 2 }));

  assert.deepEqual(calls.selectionClicks, []);
  assert.deepEqual(getSelection(), []);
});

test('edit-gestures repeated left-clicks on the same atom do not change selection', () => {
  const { controller, calls, getSelection } = createHarness({ selection: [] });

  controller.handlePointerDown(pointerEvent({ atomIndex: 0, timeStamp: 100 }));
  controller.handlePointerUp(pointerEvent({ atomIndex: 0, timeStamp: 100 }));
  controller.handlePointerDown(pointerEvent({ atomIndex: 0, timeStamp: 250 }));
  controller.handlePointerUp(pointerEvent({ atomIndex: 0, timeStamp: 250 }));

  assert.deepEqual(calls.selectionClicks, []);
  assert.deepEqual(getSelection(), []);
});

test('edit-gestures resolves selected-atom drag to move by default', () => {
  const { controller, calls } = createHarness({
    selection: [1],
    resolveMoveScope: (atomIndex, resolveOptions = {}) => ({
      indices: resolveOptions.atomOnly ? [atomIndex] : [atomIndex],
      label: 'Move scope: atom',
      anchorWorld: { x: atomIndex | 0, y: 0, z: 0 },
    }),
  });

  controller.handlePointerDown(pointerEvent({ atomIndex: 1, clientX: 0, clientY: 0 }));
  controller.handlePointerMove(pointerEvent({ atomIndex: 1, clientX: 20, clientY: 0 }));

  assert.equal(calls.beginGrowDrag.length, 0);
  assert.equal(calls.startMoveDrag.length, 1);
  assert.equal(calls.updateMoveDrag, 1);
  assert.deepEqual(calls.startMoveDrag[0].indices, [1]);
});

test('edit-gestures selected terminal atom still moves instead of growing', () => {
  const { controller, calls } = createHarness({
    selection: [0],
    resolveMoveScope: (atomIndex, resolveOptions = {}) => ({
      indices: resolveOptions.atomOnly ? [atomIndex] : [atomIndex],
      label: 'Move scope: atom',
      anchorWorld: { x: atomIndex | 0, y: 0, z: 0 },
    }),
    shouldPreferGrowDrag: (atomIndex) => atomIndex === 0,
  });

  controller.handlePointerDown(pointerEvent({ atomIndex: 0, clientX: 0, clientY: 0 }));
  controller.handlePointerMove(pointerEvent({ atomIndex: 0, clientX: 20, clientY: 0, targetAtomIndex: -1 }));

  assert.deepEqual(calls.beginGrowDrag, []);
  assert.equal(calls.startMoveDrag.length, 1);
  assert.deepEqual(calls.startMoveDrag[0].indices, [0]);
});

test('edit-gestures resolves unselected-atom drag to grow instead of move', () => {
  const { controller, calls } = createHarness({ selection: [2] });

  controller.handlePointerDown(pointerEvent({ atomIndex: 0, clientX: 0, clientY: 0 }));
  controller.handlePointerMove(pointerEvent({ atomIndex: 0, clientX: 18, clientY: 0 }));

  assert.deepEqual(calls.beginGrowDrag, [0]);
  assert.equal(calls.startMoveDrag.length, 0);
});

test('edit-gestures prefers an atom hit over an overlapping bond hit on left drag', () => {
  const bondHit = { object: { id: 'bond-carrier' }, section: 'nearA', point: { x: 0, y: 0, z: 0 } };
  const { controller, calls } = createHarness({ selection: [] });

  controller.handlePointerDown(pointerEvent({ atomIndex: 0, bondHit, clientX: 0, clientY: 0 }));
  controller.handlePointerMove(pointerEvent({ atomIndex: 0, bondHit, clientX: 18, clientY: 0 }));

  assert.deepEqual(calls.beginGrowDrag, [0]);
  assert.equal(calls.startMoveDrag.length, 0);
});

test('edit-gestures passes the hovered target atom into grow commit and updates pending bond order controls', () => {
  const { controller, calls, getPendingBondOrder } = createHarness({ selection: [1], pendingBondOrder: 1 });

  controller.handlePointerDown(pointerEvent({ atomIndex: 0, clientX: 0, clientY: 0 }));
  controller.handlePointerMove(pointerEvent({ atomIndex: 0, clientX: 18, clientY: 0, targetAtomIndex: 2 }));
  assert.equal(controller.handleWheel({ deltaY: 100 }), true);
  assert.equal(getPendingBondOrder(), 2);
  assert.equal(controller.handleBondOrderKey(3), true);
  assert.equal(getPendingBondOrder(), 3);
  controller.handlePointerUp(pointerEvent({ targetAtomIndex: 2 }));

  assert.equal(calls.commitGrowDrag.at(-1)?.targetAtomIndex, 2);
  assert.deepEqual(calls.cyclePendingBondOrder, [1]);
  assert.deepEqual(calls.setPendingBondOrder, [3]);
});

test('edit-gestures alt-drag forces atom-only move scope', () => {
  const { controller, calls } = createHarness({ selection: [1] });

  controller.handlePointerDown(pointerEvent({ atomIndex: 1, clientX: 0, clientY: 0, altKey: true }));
  controller.handlePointerMove(pointerEvent({ atomIndex: 1, clientX: 12, clientY: 0, altKey: true }));

  assert.equal(calls.resolveMoveScope.at(-1).atomOnly, true);
  assert.deepEqual(calls.startMoveDrag.at(-1).indices, [1]);
});

test('edit-gestures rotate cue in atom manipulation starts rotate drag without rotate intent', () => {
  const { controller, calls } = createHarness({
    selection: [1, 2],
    getSelectionDragMode: () => 'rotate',
    resolveMoveScope: (atomIndex, resolveOptions = {}) => ({
      indices: resolveOptions.atomOnly ? [atomIndex] : [1, 2],
      label: 'Rotate scope: fragment',
      anchorWorld: { x: atomIndex | 0, y: 0, z: 0 },
    }),
  });

  controller.handlePointerDown(pointerEvent({ atomIndex: 1, clientX: 0, clientY: 0 }));
  controller.handlePointerMove(pointerEvent({ atomIndex: 1, clientX: 20, clientY: 0 }));

  assert.equal(calls.beginGrowDrag.length, 0);
  assert.equal(calls.startMoveDrag.length, 0);
  assert.equal(calls.startRotateDrag.length, 1);
  assert.equal(calls.updateRotateDrag, 1);
  assert.deepEqual(calls.startRotateDrag[0].indices, [1, 2]);
  assert.equal(calls.startRotateDrag[0].dragOptions.axis, 'none');
  assert.equal(controller.getUiState().gestureState, 'rotate-drag');
});

test('edit-gestures allows external drag handlers to own move and release without internal gesture state', () => {
  const external = { active: false, down: 0, move: 0, up: 0 };
  const { controller } = createHarness({
    handleExternalPointerDown: (_intent, _e, state) => {
      external.down += 1;
      external.active = true;
      state.press = null;
      return true;
    },
    handleExternalPointerMove: () => {
      if (!external.active) return false;
      external.move += 1;
      return true;
    },
    handleExternalPointerUp: () => {
      if (!external.active) return false;
      external.up += 1;
      external.active = false;
      return true;
    },
  });

  assert.equal(controller.handlePointerDown(pointerEvent({ pointerId: 7 })), true);
  assert.equal(controller.handlePointerMove(pointerEvent({ pointerId: 7, clientX: 16, clientY: 18 })), true);
  assert.equal(controller.handlePointerUp(pointerEvent({ pointerId: 7, clientX: 16, clientY: 18 })), true);
  assert.deepEqual(external, { active: false, down: 1, move: 1, up: 1 });
});

test('edit-gestures left click on a bond side is inert even with shift held', () => {
  const bondHit = { object: { id: 'bond-carrier' }, section: 'nearB', point: { x: 1, y: 2, z: 3 } };
  const { controller, calls, getSelection } = createHarness({ selection: [2] });

  controller.handlePointerDown(pointerEvent({ shiftKey: true, bondHit, clientX: 0, clientY: 0 }));
  controller.handlePointerMove(pointerEvent({ shiftKey: true, bondHit, clientX: 12, clientY: 0 }));
  controller.handlePointerUp(pointerEvent({ shiftKey: true, bondHit, clientX: 12, clientY: 0 }));

  assert.equal(calls.resolveDownstreamMoveScope.length, 0);
  assert.equal(calls.startMoveDrag.length, 0);
  assert.deepEqual(getSelection(), [2]);
});

test('edit-gestures can start a grow drag directly from a halo action', () => {
  const { controller, calls } = createHarness({ selection: [0] });

  const started = controller.startGrowDragFromHalo(
    pointerEvent({ pointerId: 9, clientX: 12, clientY: 18 }),
    0,
    { initialWorldPos: [1.1, 0, 0] }
  );

  assert.equal(started, true);
  assert.deepEqual(calls.beginGrowDrag, [0]);
  assert.deepEqual(calls.capturePointer, [9]);
  assert.equal(controller.getUiState().gestureState, 'grow-drag');
});
