import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createHarness(options = {}) {
  const context = loadGlobalModules([
    'assets/app/js/bond-inference.js',
    'assets/app/js/coordination.js',
    'assets/app/js/geometry-inference.js',
    'assets/app/js/edit-halo.js',
  ], {
    globals: {
      ATOM_Z_TO_DATA: {
        1: { symbol: 'H', name: 'Hydrogen' },
        6: { symbol: 'C', name: 'Carbon' },
        7: { symbol: 'N', name: 'Nitrogen' },
        8: { symbol: 'O', name: 'Oxygen' },
        15: { symbol: 'P', name: 'Phosphorus' },
        16: { symbol: 'S', name: 'Sulfur' },
        26: { symbol: 'Fe', name: 'Iron' },
        28: { symbol: 'Ni', name: 'Nickel' },
        78: { symbol: 'Pt', name: 'Platinum' },
      },
    },
  });
  const api = context.window.VibeMolEditHalo;
  let now = Number.isFinite(options.now) ? Number(options.now) : 0;
  let selection = Array.isArray(options.selection) ? options.selection.slice() : [];
  let addTargetsVisible = options.showAddTargets !== false;
  const record = {
    vol: options.vol || {
      atoms: [{ id: 'a0', Z: 6 }],
      bonds: [],
      annotations: { coordination: { byAtomId: {} } },
    },
  };
  if (!record.vol.annotations) record.vol.annotations = {};
  if (!record.vol.annotations.coordination) record.vol.annotations.coordination = {};
  if (!record.vol.annotations.coordination.byAtomId) record.vol.annotations.coordination.byAtomId = {};
  const positions = options.positions || { 0: [0, 0, 0] };
  const controller = api.createEditHaloController({
    hoverDelayMs: Number.isFinite(options.hoverDelayMs) ? Number(options.hoverDelayMs) : 300,
    enableHoverActivation: options.enableHoverActivation,
    isEnabled: () => true,
    isBlocked: () => false,
    getSelection: () => selection.slice(),
    getActiveRecord: () => record,
    pickAtomHit: (e) => Number.isInteger(e && e.atomIndex) ? { object: { userData: { index: e.atomIndex | 0 } } } : null,
    pickBondHit: (e) => (e && e.bondHit) || null,
    getAtomWorld: (_vol, atomIndex) => positions[atomIndex] ? positions[atomIndex].slice() : null,
    projectWorldToClient: (world) => world ? { x: 200 + (world[0] || 0) * 80, y: 200 + (world[1] || 0) * 80, visible: true } : null,
    getElementSymbol: (z) => ({ 1: 'H', 6: 'C', 7: 'N', 8: 'O', 15: 'P', 16: 'S', 26: 'Fe', 28: 'Ni', 78: 'Pt' }[z | 0] || `Z${z | 0}`),
    showAddTargets: () => addTargetsVisible,
    getAtomCoordinationGeometryId: (vol, atomIndex) => {
      const atom = Array.isArray(vol && vol.atoms) ? vol.atoms[atomIndex | 0] : null;
      const atomId = atom && atom.id != null ? String(atom.id) : '';
      return vol && vol.annotations && vol.annotations.coordination
        && vol.annotations.coordination.byAtomId
        && vol.annotations.coordination.byAtomId[atomId]
        ? String(vol.annotations.coordination.byAtomId[atomId].geometryId || '')
        : '';
    },
    getGrowBondLength: (z) => ((z | 0) === 26 ? 1.6 : 1.1),
    nowProvider: () => now,
    onUiStateChanged: () => {},
  });
  return {
    controller,
    record,
    positions,
    setNow: (value) => { now = Number(value) || 0; },
    setSelection: (next) => { selection = Array.isArray(next) ? next.slice() : []; },
    setShowAddTargets: (value) => { addTargetsVisible = !!value; },
    getUiState: () => controller.getUiState(),
  };
}

function pointerEvent(overrides = {}) {
  return {
    button: 0,
    clientX: 200,
    clientY: 200,
    ...overrides,
  };
}

function normalizedDirection(anchorWorld, ghost) {
  const dx = ghost.world.x - anchorWorld.x;
  const dy = ghost.world.y - anchorWorld.y;
  const dz = ghost.world.z - anchorWorld.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  return [dx / len, dy / len, dz / len];
}

test('edit-halo selection activates immediately', () => {
  const harness = createHarness({ selection: [0] });
  harness.controller.refresh();
  const ui = harness.getUiState();
  assert.equal(ui.visible, true);
  assert.equal(ui.atomIndex, 0);
});

test('edit-halo hover delay activates only after threshold', () => {
  const harness = createHarness({ selection: [], hoverDelayMs: 300 });
  harness.controller.handlePointerMove(pointerEvent({ atomIndex: 0 }));
  assert.equal(harness.getUiState().visible, false);
  harness.setNow(350);
  harness.controller.refresh();
  assert.equal(harness.getUiState().visible, true);
});

test('edit-halo hover halo stays visible while pointer remains inside halo-owned zone', () => {
  const harness = createHarness({ selection: [], hoverDelayMs: 300 });
  harness.controller.handlePointerMove(pointerEvent({ atomIndex: 0 }));
  harness.setNow(350);
  harness.controller.refresh();
  const ui = harness.getUiState();
  assert.equal(ui.visible, true);
  harness.controller.handlePointerMove(pointerEvent({
    clientX: ui.anchorClient.x + Math.min(72, ui.captureRadius - 4),
    clientY: ui.anchorClient.y,
  }));
  assert.equal(harness.getUiState().visible, true);
});

test('edit-halo can disable hover activation while preserving selection-driven activation', () => {
  const harness = createHarness({ selection: [], hoverDelayMs: 300, enableHoverActivation: false });
  harness.controller.handlePointerMove(pointerEvent({ atomIndex: 0 }));
  harness.setNow(350);
  harness.controller.refresh();
  assert.equal(harness.getUiState().visible, false);
  harness.setSelection([0]);
  harness.controller.refresh();
  assert.equal(harness.getUiState().visible, true);
  assert.equal(harness.getUiState().atomIndex, 0);
});

test('edit-halo bare carbon yields four tetrahedral ghost directions and coordination labels', () => {
  const harness = createHarness({ selection: [0] });
  harness.controller.refresh();
  const ui = harness.getUiState();
  assert.equal(ui.mode, 'coordination-open');
  assert.equal(ui.ghosts.length, 4);
  assert.deepEqual(plain(ui.choices).map((item) => item.text), [
    'Linear (2)',
    'Trigonal planar (3)',
    'Tetrahedral (4)',
  ]);
});

test('edit-halo hides open-site ghosts until add targets are enabled', () => {
  const harness = createHarness({ selection: [0], showAddTargets: false });
  harness.controller.refresh();
  const hiddenUi = harness.getUiState();
  assert.equal(hiddenUi.visible, true);
  assert.equal(hiddenUi.ghosts.length, 0);
  assert.match(hiddenUi.hint, /Click \+/);

  harness.setShowAddTargets(true);
  harness.controller.refresh();
  const visibleUi = harness.getUiState();
  assert.equal(visibleUi.ghosts.length, 4);
});

test('edit-halo preserves ghost orientation after placing the first bond', () => {
  const harness = createHarness({ selection: [0] });
  harness.controller.refresh();
  const before = harness.getUiState();
  const chosen = before.ghosts[0];
  const remainingBefore = before.ghosts
    .filter((ghost) => ghost.index !== chosen.index)
    .map((ghost) => normalizedDirection(before.anchorWorld, ghost));
  harness.record.vol.atoms.push({ id: 'a1', Z: 7 });
  harness.record.vol.bonds = [{ a: 'a0', b: 'a1', order: 1, kind: 'normal' }];
  harness.positions[1] = [chosen.world.x, chosen.world.y, chosen.world.z];
  harness.controller.refresh();
  const after = harness.getUiState();
  assert.equal(after.ghosts.length, 3);
  const remainingAfter = after.ghosts.map((ghost) => normalizedDirection(after.anchorWorld, ghost));
  assert.equal(remainingAfter.length, remainingBefore.length);
  for (const dir of remainingAfter) {
    const matched = remainingBefore.some((prev) => prev.every((value, index) => Math.abs(value - dir[index]) < 1e-6));
    assert.equal(matched, true);
  }
});

test('edit-halo derives trigonal-planar ghosts from a carbonyl-like partial carbon without manual selection', () => {
  const harness = createHarness({
    selection: [0],
    vol: {
      atoms: [{ id: 'a0', Z: 6 }, { id: 'a1', Z: 8 }],
      bonds: [{ a: 'a0', b: 'a1', order: 2, kind: 'normal' }],
      annotations: { coordination: { byAtomId: {} } },
    },
    positions: {
      0: [0, 0, 0],
      1: [1.2, 0, 0],
    },
  });
  harness.controller.refresh();
  const ui = harness.getUiState();
  assert.equal(ui.mode, 'coordination-open');
  assert.equal(ui.ghosts.length, 2);
  assert.deepEqual(plain(ui.choices).map((item) => item.text), [
    'Linear (2)',
    'Trigonal planar (3)',
  ]);
  assert.equal(ui.choices.find((item) => item.active)?.geometryId, 'trigonalPlanar');
});

test('edit-halo reuses the cached frame when the new bond round-trips with small coordinate drift', () => {
  const harness = createHarness({ selection: [0] });
  harness.controller.refresh();
  const before = harness.getUiState();
  const chosen = before.ghosts[0];
  const remainingBefore = before.ghosts
    .filter((ghost) => ghost.index !== chosen.index)
    .map((ghost) => normalizedDirection(before.anchorWorld, ghost));
  harness.record.vol.atoms.push({ id: 'a1', Z: 7 });
  harness.record.vol.bonds = [{ a: 'a0', b: 'a1', order: 1, kind: 'normal' }];
  harness.positions[1] = [
    chosen.world.x + 1e-5,
    chosen.world.y - 1e-5,
    chosen.world.z + 1e-5,
  ];
  harness.controller.refresh();
  const after = harness.getUiState();
  const remainingAfter = after.ghosts.map((ghost) => normalizedDirection(after.anchorWorld, ghost));
  assert.equal(remainingAfter.length, remainingBefore.length);
  for (const dir of remainingAfter) {
    const matched = remainingBefore.some((prev) => prev.every((value, index) => Math.abs(value - dir[index]) < 1e-6));
    assert.equal(matched, true);
  }
});

test('edit-halo saturated carbon yields no free-valence grow ghosts and retains choices', () => {
  const harness = createHarness({
    selection: [0],
    vol: {
      atoms: [{ id: 'a0', Z: 6 }, { id: 'a1', Z: 7 }, { id: 'a2', Z: 7 }, { id: 'a3', Z: 7 }, { id: 'a4', Z: 7 }],
      bonds: [
        { a: 'a0', b: 'a1', order: 1, kind: 'normal' },
        { a: 'a0', b: 'a2', order: 1, kind: 'normal' },
        { a: 'a0', b: 'a3', order: 1, kind: 'normal' },
        { a: 'a0', b: 'a4', order: 1, kind: 'normal' },
      ],
      annotations: { coordination: { byAtomId: {} } },
    },
    positions: {
      0: [0, 0, 0],
      1: [1, 0, 0],
      2: [-1, 0, 0],
      3: [0, 1, 0],
      4: [0, -1, 0],
    },
  });
  harness.controller.refresh();
  const ui = harness.getUiState();
  assert.equal(ui.visible, true);
  assert.equal(ui.mode, 'coordination-saturated');
  assert.equal(ui.ghosts.length, 0);
  assert.deepEqual(plain(ui.choices).map((item) => item.text), [
    'Tetrahedral (4)',
  ]);
});

test('edit-halo saturated carbon exposes replaceable terminal hydrogens for atom and fragment payloads', () => {
  const harness = createHarness({
    selection: [0],
    vol: {
      atoms: [{ id: 'a0', Z: 6 }, { id: 'h1', Z: 1 }, { id: 'h2', Z: 1 }, { id: 'h3', Z: 1 }, { id: 'h4', Z: 1 }],
      bonds: [
        { a: 'a0', b: 'h1', order: 1, kind: 'normal' },
        { a: 'a0', b: 'h2', order: 1, kind: 'normal' },
        { a: 'a0', b: 'h3', order: 1, kind: 'normal' },
        { a: 'a0', b: 'h4', order: 1, kind: 'normal' },
      ],
      annotations: { coordination: { byAtomId: {} } },
    },
    positions: {
      0: [0, 0, 0],
      1: [1, 0, 0],
      2: [-1, 0, 0],
      3: [0, 1, 0],
      4: [0, -1, 0],
    },
  });
  harness.controller.refresh();
  const ui = harness.getUiState();
  assert.equal(ui.mode, 'coordination-saturated');
  assert.equal(ui.ghosts.length, 0);
  assert.equal(ui.replaceTargets.length, 4);
  const target = ui.replaceTargets[0];
  const action = harness.controller.handlePointerDown(pointerEvent({ clientX: target.x, clientY: target.y }));
  assert.deepEqual(JSON.parse(JSON.stringify(action)), {
    type: 'replace-target',
    atomIndex: 0,
    targetAtomIndex: target.atomIndex,
    worldPosition: [target.world.x, target.world.y, target.world.z],
  });
});

test('edit-halo hides replaceable hydrogens until add targets are enabled', () => {
  const harness = createHarness({
    selection: [0],
    showAddTargets: false,
    vol: {
      atoms: [{ id: 'a0', Z: 6 }, { id: 'h1', Z: 1 }, { id: 'h2', Z: 1 }, { id: 'h3', Z: 1 }, { id: 'h4', Z: 1 }],
      bonds: [
        { a: 'a0', b: 'h1', order: 1, kind: 'normal' },
        { a: 'a0', b: 'h2', order: 1, kind: 'normal' },
        { a: 'a0', b: 'h3', order: 1, kind: 'normal' },
        { a: 'a0', b: 'h4', order: 1, kind: 'normal' },
      ],
      annotations: { coordination: { byAtomId: {} } },
    },
    positions: {
      0: [0, 0, 0],
      1: [1, 0, 0],
      2: [-1, 0, 0],
      3: [0, 1, 0],
      4: [0, -1, 0],
    },
  });
  harness.controller.refresh();
  const hiddenUi = harness.getUiState();
  assert.equal(hiddenUi.replaceTargets.length, 0);

  harness.setShowAddTargets(true);
  harness.controller.refresh();
  const visibleUi = harness.getUiState();
  assert.equal(visibleUi.replaceTargets.length, 4);
});

test('edit-halo choice click returns set-coordination-choice and ghost layout follows override', () => {
  const harness = createHarness({ selection: [0] });
  harness.controller.refresh();
  const ui = harness.getUiState();
  const linear = ui.choices.find((item) => item.geometryId === 'linear');
  assert.ok(linear);
  const action = harness.controller.handlePointerDown(pointerEvent({ clientX: linear.x, clientY: linear.y }));
  assert.deepEqual(JSON.parse(JSON.stringify(action)), {
    type: 'set-coordination-choice',
    atomIndex: 0,
    geometryId: 'linear',
  });
  harness.record.vol.annotations.coordination.byAtomId.a0 = { geometryId: 'linear' };
  harness.controller.refresh();
  const linearUi = harness.getUiState();
  assert.equal(linearUi.ghosts.length, 2);
  assert.deepEqual(plain(linearUi.choices).map((item) => item.text), [
    'Linear (2)',
    'Trigonal planar (3)',
    'Tetrahedral (4)',
  ]);
});

test('edit-halo ghost zone hit takes priority and returns grow action', () => {
  const harness = createHarness({ selection: [0] });
  harness.controller.refresh();
  const ghost = harness.getUiState().ghosts[0];
  const action = harness.controller.resolveSelectedAtomDragAction(0, pointerEvent({ clientX: ghost.x, clientY: ghost.y }));
  assert.equal(action?.type, 'grow');
  assert.equal(action?.atomIndex, 0);
});

test('edit-halo transition-metal atoms yield coordination choices and metal mode', () => {
  const harness = createHarness({
    selection: [0],
    vol: {
      atoms: [{ id: 'm0', Z: 28 }],
      bonds: [],
      annotations: { coordination: { byAtomId: {} } },
    },
    positions: { 0: [0, 0, 0] },
  });
  harness.controller.refresh();
  const ui = harness.getUiState();
  assert.equal(ui.mode, 'metal-coordination');
  assert.deepEqual(plain(ui.choices).map((item) => item.text), [
    'Square planar (4)',
    'Tetrahedral (4)',
    'Square pyramidal (5)',
    'Octahedral (6)',
    'Trigonal prismatic (6)',
  ]);
  assert.equal(ui.ghosts.length, 4);
});

test('edit-halo recognizes bond center-third as reserved without opening bond halo', () => {
  const harness = createHarness({ selection: [] });
  harness.controller.handlePointerMove(pointerEvent({ bondHit: { section: 'center' } }));
  const ui = harness.getUiState();
  assert.equal(ui.visible, false);
  assert.equal(ui.bondCenterReserved, true);
});
