import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';

function createHarness(options = {}) {
  const context = loadGlobalModule('assets/app/js/edit-halo.js');
  const api = context.window.VibeMolEditHalo;
  let now = Number.isFinite(options.now) ? Number(options.now) : 0;
  let selection = Array.isArray(options.selection) ? options.selection.slice() : [];
  let loadedElementZ = Number.isInteger(options.loadedElementZ) ? (options.loadedElementZ | 0) : 6;
  const record = {
    vol: options.vol || {
      atoms: [
        { id: 'a0', Z: 6 },
      ],
      bonds: [],
    },
  };
  const positions = options.positions || {
    0: [0, 0, 0],
  };
  const calls = {
    uiStates: [],
  };
  const controller = api.createEditHaloController({
    hoverDelayMs: Number.isFinite(options.hoverDelayMs) ? Number(options.hoverDelayMs) : 300,
    isEnabled: () => true,
    isBlocked: () => false,
    getSelection: () => selection.slice(),
    getActiveRecord: () => record,
    pickAtomHit: (e) => Number.isInteger(e && e.atomIndex) ? { object: { userData: { index: e.atomIndex | 0 } } } : null,
    pickBondHit: (e) => (e && e.bondHit) || null,
    getAtomWorld: (_vol, atomIndex) => positions[atomIndex] ? positions[atomIndex].slice() : null,
    projectWorldToClient: (world) => world ? { x: 200 + (world[0] || 0) * 80, y: 200 + (world[1] || 0) * 80, visible: true } : null,
    getAutoHydrogenRule: (z) => {
      if ((z | 0) === 6) return { symbol: 'C', targetValence: 4 };
      if ((z | 0) === 7) return { symbol: 'N', targetValence: 3 };
      return null;
    },
    resolveGeometryForEnvironment: (z, env) => {
      if ((z | 0) === 6) {
        if ((env && env.maxBondOrder) >= 3) return { geometryKey: 'linear', siteCount: 2, targetBondCount: 2 };
        if ((env && env.maxBondOrder) >= 2) return { geometryKey: 'trigonal', siteCount: 3, targetBondCount: 3 };
        return { geometryKey: 'tetrahedral', siteCount: 4, targetBondCount: 4 };
      }
      if ((z | 0) === 7) return { geometryKey: 'trigonal', siteCount: 3, targetBondCount: 3 };
      return null;
    },
    isTransitionMetalAtomicNumber: (z) => !!(typeof options.isTransitionMetalAtomicNumber === 'function' ? options.isTransitionMetalAtomicNumber(z) : ((z | 0) === 26)),
    isAutoBondSupportedAtomicNumber: (z) => [6, 7].includes(z | 0),
    getElementSymbol: (z) => ({ 1: 'H', 5: 'B', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 15: 'P', 16: 'S', 17: 'Cl', 35: 'Br', 53: 'I', 26: 'Fe' }[z | 0] || `Z${z | 0}`),
    getLoadedElementZ: () => loadedElementZ,
    getGrowBondLength: () => 1.1,
    nowProvider: () => now,
    onUiStateChanged: (uiState) => calls.uiStates.push(uiState),
  });
  return {
    controller,
    calls,
    record,
    positions,
    setNow: (value) => { now = Number(value) || 0; },
    setSelection: (next) => { selection = Array.isArray(next) ? next.slice() : []; },
    setLoadedElementZ: (z) => { loadedElementZ = z | 0; },
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
  const anchor = ui.anchorClient;
  assert.ok(anchor);
  harness.controller.handlePointerMove(pointerEvent({
    clientX: anchor.x + 72,
    clientY: anchor.y,
  }));
  assert.equal(harness.getUiState().visible, true);
});

test('edit-halo bare carbon yields four tetrahedral ghost directions', () => {
  const harness = createHarness({ selection: [0] });
  harness.controller.refresh();
  const ui = harness.getUiState();
  assert.equal(ui.mode, 'main-group-open');
  assert.equal(ui.ghosts.length, 4);
});

test('edit-halo preserves ghost orientation after placing the first bond', () => {
  const harness = createHarness({ selection: [0] });
  harness.controller.refresh();
  const before = harness.getUiState();
  assert.equal(before.ghosts.length, 4);
  const chosen = before.ghosts[0];
  const remainingBefore = before.ghosts
    .filter((ghost) => ghost.index !== chosen.index)
    .map((ghost) => {
      const dx = ghost.world.x - before.anchorWorld.x;
      const dy = ghost.world.y - before.anchorWorld.y;
      const dz = ghost.world.z - before.anchorWorld.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      return [dx / len, dy / len, dz / len];
    });
  harness.record.vol.atoms.push({ id: 'a1', Z: 7 });
  harness.record.vol.bonds = [{ a: 'a0', b: 'a1', order: 1, kind: 'normal' }];
  harness.positions[1] = [chosen.world.x, chosen.world.y, chosen.world.z];
  harness.controller.refresh();
  const after = harness.getUiState();
  assert.equal(after.ghosts.length, 3);
  const remainingAfter = after.ghosts.map((ghost) => {
    const dx = ghost.world.x - after.anchorWorld.x;
    const dy = ghost.world.y - after.anchorWorld.y;
    const dz = ghost.world.z - after.anchorWorld.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return [dx / len, dy / len, dz / len];
  });
  assert.equal(remainingAfter.length, remainingBefore.length);
  for (const dir of remainingAfter) {
    const matched = remainingBefore.some((prev) => {
      const dx = Math.abs(dir[0] - prev[0]);
      const dy = Math.abs(dir[1] - prev[1]);
      const dz = Math.abs(dir[2] - prev[2]);
      return dx < 1e-6 && dy < 1e-6 && dz < 1e-6;
    });
    assert.equal(matched, true);
  }
});

test('edit-halo reuses the cached frame when the new bond round-trips with small coordinate drift', () => {
  const harness = createHarness({ selection: [0] });
  harness.controller.refresh();
  const before = harness.getUiState();
  assert.equal(before.ghosts.length, 4);
  const chosen = before.ghosts[0];
  const remainingBefore = before.ghosts
    .filter((ghost) => ghost.index !== chosen.index)
    .map((ghost) => {
      const dx = ghost.world.x - before.anchorWorld.x;
      const dy = ghost.world.y - before.anchorWorld.y;
      const dz = ghost.world.z - before.anchorWorld.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      return [dx / len, dy / len, dz / len];
    });
  harness.record.vol.atoms.push({ id: 'a1', Z: 7 });
  harness.record.vol.bonds = [{ a: 'a0', b: 'a1', order: 1, kind: 'normal' }];
  harness.positions[1] = [
    chosen.world.x + 1e-5,
    chosen.world.y - 1e-5,
    chosen.world.z + 1e-5,
  ];
  harness.controller.refresh();
  const after = harness.getUiState();
  assert.equal(after.ghosts.length, 3);
  const remainingAfter = after.ghosts.map((ghost) => {
    const dx = ghost.world.x - after.anchorWorld.x;
    const dy = ghost.world.y - after.anchorWorld.y;
    const dz = ghost.world.z - after.anchorWorld.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return [dx / len, dy / len, dz / len];
  });
  assert.equal(remainingAfter.length, remainingBefore.length);
  for (const dir of remainingAfter) {
    const matched = remainingBefore.some((prev) => {
      const dx = Math.abs(dir[0] - prev[0]);
      const dy = Math.abs(dir[1] - prev[1]);
      const dz = Math.abs(dir[2] - prev[2]);
      return dx < 1e-6 && dy < 1e-6 && dz < 1e-6;
    });
    assert.equal(matched, true);
  }
});

test('edit-halo saturated carbon yields no free-valence grow ghosts', () => {
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
  assert.equal(ui.ghosts.length, 0);
});

test('edit-halo element ring exposes the configured main-group set', () => {
  const harness = createHarness({ selection: [0] });
  harness.controller.refresh();
  const symbols = Array.from(harness.getUiState().elements, (item) => item.symbol);
  assert.deepEqual(symbols, ['H', 'B', 'C', 'N', 'O', 'F', 'P', 'S', 'Cl', 'Br', 'I']);
});

test('edit-halo outward swipe changes loaded element only via returned action', () => {
  const harness = createHarness({ selection: [0] });
  harness.controller.refresh();
  const target = harness.getUiState().elements.find((item) => item.symbol === 'N');
  const action = JSON.parse(JSON.stringify(harness.controller.handlePointerDown(pointerEvent({ clientX: target.x, clientY: target.y }))));
  assert.deepEqual(action, { type: 'set-loaded-element', z: 7 });
});

test('edit-halo ghost zone hit takes priority and returns grow action', () => {
  const harness = createHarness({ selection: [0] });
  harness.controller.refresh();
  const ghost = harness.getUiState().ghosts[0];
  const action = harness.controller.resolveSelectedAtomDragAction(0, pointerEvent({ clientX: ghost.x, clientY: ghost.y }));
  assert.equal(action?.type, 'grow');
  assert.equal(action?.atomIndex, 0);
});

test('edit-halo transition-metal atoms yield supported coordination ghosts', () => {
  const harness = createHarness({
    selection: [0],
    vol: { atoms: [{ id: 'm0', Z: 26 }], bonds: [] },
    positions: { 0: [0, 0, 0] },
    isTransitionMetalAtomicNumber: (z) => (z | 0) === 26,
  });
  harness.controller.refresh();
  const ui = harness.getUiState();
  assert.equal(ui.mode, 'metal-coordination');
  assert.ok([4, 6].includes(ui.ghosts.length));
});

test('edit-halo recognizes bond center-third as reserved without opening bond halo', () => {
  const harness = createHarness({ selection: [] });
  harness.controller.handlePointerMove(pointerEvent({ bondHit: { section: 'center' } }));
  const ui = harness.getUiState();
  assert.equal(ui.visible, false);
  assert.equal(ui.bondCenterReserved, true);
});
