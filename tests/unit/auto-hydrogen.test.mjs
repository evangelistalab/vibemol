import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateInContext, loadGlobalModules } from './load-global-module.mjs';

function loadAutoHydrogen(extraGlobals = {}) {
  return loadGlobalModules([
    'assets/app/js/bond-inference.js',
    'assets/app/js/auto-hydrogen.js',
  ], {
    globals: {
      ATOM_Z_TO_DATA: {
        1: { radius_covalent: 0.31 },
        5: { radius_covalent: 0.84 },
        6: { radius_covalent: 0.76 },
        7: { radius_covalent: 0.71 },
        8: { radius_covalent: 0.66 },
        9: { radius_covalent: 0.57 },
        14: { radius_covalent: 1.11 },
        15: { radius_covalent: 1.07 },
        16: { radius_covalent: 1.05 },
        17: { radius_covalent: 1.02 },
        29: { symbol: 'Cu', radius_covalent: 1.32 },
        35: { radius_covalent: 1.2 },
        53: { radius_covalent: 1.39 },
      },
      ...extraGlobals,
    },
  });
}

test('auto-hydrogen adds three tetrahedral hydrogens to a terminal carbon', () => {
  const context = loadAutoHydrogen();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const plan = window.VibeMolAutoHydrogen.buildAutoHydrogenPlan({
      atoms: [
        { id: 'c1', Z: 6, x: 0, y: 0, z: 0 },
        { id: 'c2', Z: 6, x: 1.54, y: 0, z: 0 },
      ],
      bonds: [
        { a: 'c1', b: 'c2', order: 1, kind: 'normal', origin: 'explicit' },
      ],
    }, { focusAtomIndices: [0] });
    return {
      hydrogenCount: plan.stats.hydrogenCount,
      parentCount: plan.stats.parentCount,
      directions: plan.hydrogens.map((item) => item.direction.map((v) => Number(v.toFixed(3)))),
    };
  })())`));

  assert.equal(result.hydrogenCount, 3);
  assert.equal(result.parentCount, 1);
  for (const dir of result.directions) {
    assert.ok(dir[0] < -0.2, `expected hydrogen direction to oppose the C-C bond, got ${dir.join(',')}`);
  }
});

test('auto-hydrogen uses trigonal geometry for a carbonyl carbon', () => {
  const context = loadAutoHydrogen();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const plan = window.VibeMolAutoHydrogen.buildAutoHydrogenPlan({
      atoms: [
        { id: 'c', Z: 6, x: 0, y: 0, z: 0 },
        { id: 'o', Z: 8, x: 1.22, y: 0, z: 0 },
      ],
      bonds: [
        { a: 'c', b: 'o', order: 2, kind: 'normal', origin: 'explicit' },
      ],
    }, { focusAtomIndices: [0] });
    return {
      parent: plan.parents[0],
      hydrogens: plan.hydrogens.map((item) => ({ x: item.x, y: item.y, z: item.z })),
    };
  })())`));

  assert.equal(result.parent.geometryKey, 'trigonal');
  assert.equal(result.parent.hydrogenCount, 2);
  assert.equal(result.hydrogens.length, 2);
  assert.notEqual(Math.sign(result.hydrogens[0].y || 0), Math.sign(result.hydrogens[1].y || 0));
});

test('auto-hydrogen treats alcohol oxygen as tetrahedral electron geometry and adds one hydrogen', () => {
  const context = loadAutoHydrogen();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const plan = window.VibeMolAutoHydrogen.buildAutoHydrogenPlan({
      atoms: [
        { id: 'o', Z: 8, x: 0, y: 0, z: 0 },
        { id: 'c', Z: 6, x: 1.43, y: 0, z: 0 },
      ],
      bonds: [
        { a: 'o', b: 'c', order: 1, kind: 'normal', origin: 'explicit' },
      ],
    }, { focusAtomIndices: [0] });
    return {
      parent: plan.parents[0],
      hydrogen: plan.hydrogens[0],
    };
  })())`));

  assert.equal(result.parent.geometryKey, 'tetrahedral');
  assert.equal(result.parent.hydrogenCount, 1);
  assert.ok(result.hydrogen.direction[0] < 0.2, 'expected alcohol hydrogen not to be collinear with the existing bond');
});

test('auto-hydrogen honors an explicit coordination geometry override when planning hydrogens', () => {
  const context = loadAutoHydrogen();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const plan = window.VibeMolAutoHydrogen.buildAutoHydrogenPlan({
      atoms: [
        { id: 'c', Z: 6, x: 0, y: 0, z: 0 },
      ],
      bonds: [],
    }, {
      focusAtomIndices: [0],
      resolveGeometry: (_atom, _env, _rule, fallbackGeometry) => {
        return { geometryKey: 'linear', siteCount: 2, targetBondCount: 2, fallback: fallbackGeometry && fallbackGeometry.geometryKey };
      },
    });
    return {
      hydrogenCount: plan.stats.hydrogenCount,
      parent: plan.parents[0],
    };
  })())`));

  assert.equal(result.hydrogenCount, 2);
  assert.equal(result.parent.geometryKey, 'linear');
  assert.equal(result.parent.targetBondCount, 2);
});

test('auto-hydrogen skips unsupported atoms and reports scope-sensitive summaries', () => {
  const context = loadAutoHydrogen();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const selectionPlan = window.VibeMolAutoHydrogen.buildAutoHydrogenPlan({
      atoms: [
        { id: 'fe', Z: 26, x: 0, y: 0, z: 0 },
      ],
      bonds: [],
    }, { focusAtomIndices: [0] });
    const structurePlan = window.VibeMolAutoHydrogen.buildAutoHydrogenPlan({
      atoms: [
        { id: 'c', Z: 6, x: 0, y: 0, z: 0 },
      ],
      bonds: [],
    });
    return {
      selectionSummary: window.VibeMolAutoHydrogen.summarizeAutoHydrogenPlan(selectionPlan),
      structureHydrogens: structurePlan.stats.hydrogenCount,
      skippedReason: selectionPlan.skipped[0] && selectionPlan.skipped[0].reason,
    };
  })())`));

  assert.equal(result.selectionSummary, 'No missing hydrogens found on the selected atoms.');
  assert.equal(result.structureHydrogens, 4);
  assert.equal(result.skippedReason, 'unsupported');
});

test('auto-hydrogen ignores metal-ligand bonds on the nonmetal ligand side', () => {
  const context = loadAutoHydrogen();
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const plan = window.VibeMolAutoHydrogen.buildAutoHydrogenPlan({
      atoms: [
        { id: 'n', Z: 7, x: 0, y: 0, z: 0 },
        { id: 'h1', Z: 1, x: 0.95, y: 0, z: 0 },
        { id: 'h2', Z: 1, x: -0.3, y: 0.9, z: 0 },
        { id: 'cu', Z: 29, x: -2.0, y: 0, z: 0 },
      ],
      bonds: [
        { a: 'n', b: 'h1', order: 1, kind: 'normal', origin: 'explicit' },
        { a: 'n', b: 'h2', order: 1, kind: 'normal', origin: 'explicit' },
        { a: 'n', b: 'cu', order: 1, kind: 'normal', origin: 'explicit', style: 'metal-dative' },
      ],
    }, { focusAtomIndices: [0] });
    return {
      hydrogenCount: plan.stats.hydrogenCount,
      parent: plan.parents[0],
    };
  })())`));

  assert.equal(result.hydrogenCount, 1);
  assert.equal(result.parent.atomId, 'n');
  assert.equal(result.parent.targetValence, 3);
});

test('auto-hydrogen controller previews on first shortcut and applies on second shortcut', () => {
  const context = loadAutoHydrogen({
    THREE: {
      Vector3: class Vector3 {
        constructor(x = 0, y = 0, z = 0) {
          this.x = x;
          this.y = y;
          this.z = z;
        }
      },
    },
  });
  const result = JSON.parse(evaluateInContext(context, `JSON.stringify((() => {
    const record = {
      vol: {
        atoms: [
          { id: 'c1', Z: 6, x: 0, y: 0, z: 0, formalCharge: 0 },
        ],
        bonds: [],
      },
    };
    const hints = [];
    const previewCalls = [];
    const historyLabels = [];
    const controller = window.VibeMolAutoHydrogen.createAutoHydrogenController({
      THREE,
      getActiveRecord: () => record,
      getSelection: () => [],
      ensureVolumeSchema: () => record.vol,
      ensureAtomId: (atom) => {
        if (!atom.id) atom.id = 'a' + String(record.vol.atoms.length);
        return atom.id;
      },
      getAtomBuilderMeta: () => ({}),
      setAtomBuilderMeta: () => {},
      atomUnitsToAng: (_vol, atom) => ({ x: atom.x, y: atom.y, z: atom.z }),
      worldToAtomUnits: (_vol, world) => [world.x, world.y, world.z],
      cloneAtomsSnapshot: (vol) => vol.atoms.map((atom) => ({ ...atom })),
      cloneBondSnapshot: (vol) => (vol.bonds || []).map((bond) => ({ ...bond })),
      pushEditHistoryEntry: (_record, _beforeAtoms, _afterAtoms, label) => historyLabels.push(label),
      upsertVolumeBond: (vol, a, b, order, kind, origin) => {
        vol.bonds.push({ a, b, order, kind, origin });
      },
      rebuildScene: () => {},
      updateSidePanel: () => {},
      updateSelectionVisuals: () => {},
      setHintMessage: (message) => hints.push(String(message || '')),
      finalizeAddAtomOperatorSession: () => false,
      hasBlockingPlacement: () => false,
      getBlockingPlacementMessage: () => '',
      renderPreview: (plan) => previewCalls.push(plan.hydrogens.length),
      clearPreviewRender: () => previewCalls.push('clear'),
    });
    controller.handleShortcut();
    const afterPreview = {
      atomCount: record.vol.atoms.length,
      bondCount: record.vol.bonds.length,
      hasPreview: controller.hasPreview(),
      lastHint: hints[hints.length - 1],
      previewCalls: previewCalls.slice(),
    };
    controller.handleShortcut();
    return {
      afterPreview,
      afterApply: {
        atomCount: record.vol.atoms.length,
        bondCount: record.vol.bonds.length,
        historyLabels,
        hints,
        previewCalls,
      },
    };
  })())`));

  assert.equal(result.afterPreview.atomCount, 1);
  assert.equal(result.afterPreview.bondCount, 0);
  assert.equal(result.afterPreview.hasPreview, true);
  assert.match(result.afterPreview.lastHint, /Press Space again to apply/);
  assert.deepEqual(result.afterPreview.previewCalls, [4]);

  assert.equal(result.afterApply.atomCount, 5);
  assert.equal(result.afterApply.bondCount, 4);
  assert.deepEqual(result.afterApply.historyLabels, ['Add 4 hydrogens']);
  assert.equal(result.afterApply.previewCalls[result.afterApply.previewCalls.length - 1], 'clear');
});
