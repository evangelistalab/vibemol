import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';

function createHarness(options = {}) {
  const context = loadGlobalModules([
    'assets/app/js/structure.js',
    'assets/app/js/bond-editing.js',
  ]);
  const core = context.window.VibeMolStructureCore;
  const api = context.window.VibeMolBondEditing;
  const initialOrder = Number.isFinite(options.order) ? Number(options.order) : 1;
  const initialKind = String(options.kind || 'normal');
  const initialOrigin = String(options.origin || 'perceived');
  const initialStyle = String(options.style || 'covalent');
  const atomZ1 = Number.isFinite(options.atomZ1) ? Number(options.atomZ1) : 6;
  const atomZ2 = Number.isFinite(options.atomZ2) ? Number(options.atomZ2) : 6;
  const withBond = options.withBond !== false;
  const record = {
    vol: {
      atoms: [
        { id: 'atom-1', Z: atomZ1, x: -0.7, y: 0, z: 0, formalCharge: 0 },
        { id: 'atom-2', Z: atomZ2, x: 0.7, y: 0, z: 0, formalCharge: 0 },
      ],
      bonds: withBond ? [
        { id: 'bond:atom-1:atom-2', a: 'atom-1', b: 'atom-2', order: initialOrder, kind: initialKind, origin: initialOrigin, style: initialStyle },
      ] : [],
      annotations: { builder: { byAtomId: {} }, coordination: { byAtomId: {} }, metalBonding: { byAtomId: {} } },
      fragmentOps: [],
    },
  };
  core.ensureVolumeSchema(record.vol, { inferMissingBonds: false });
  const calls = {
    hints: [],
    history: [],
    rebuilds: 0,
    sidePanelUpdates: 0,
    clearedHover: 0,
    hydrogenAdjustments: [],
  };
  const adjustHydrogensAfterBondEdit = typeof options.adjustHydrogensAfterBondEdit === 'function'
    ? options.adjustHydrogensAfterBondEdit
    : ((vol, atomIndices, adjustOptions = {}) => {
      calls.hydrogenAdjustments.push({
        atomIndices: Array.isArray(atomIndices) ? atomIndices.slice() : [],
        hasPreferredDirMap: !!(adjustOptions && adjustOptions.preferredDirByAtomId && typeof adjustOptions.preferredDirByAtomId.get === 'function'),
      });
      return { added: 0, removed: 0 };
    });
  const controller = api.createBondEditingController({
    THREE: options.THREE || {
      Vector3: class Vector3 {
        constructor(x = 0, y = 0, z = 0) {
          this.x = x;
          this.y = y;
          this.z = z;
        }
      },
    },
    popupEl: null,
    popupTitleEl: null,
    popupButtonsEl: null,
    canvasEl: null,
    getCamera: () => null,
    canUsePopup: () => false,
    normalizeOrder: core.normalizeEditAddBondOrder,
    getDisplayedOrder: (carrier) => Math.max(0, Math.min(4, Math.round(Number(carrier?.userData?.bondOrder) || 0))),
    focusCarrier: () => {},
    blurCarrier: () => {},
    onPendingSelectionChanged: () => {},
    ensureEditableRecord: () => record,
    ensureVolumeSchema: (vol) => core.ensureVolumeSchema(vol, { inferMissingBonds: false }),
    cloneBondSnapshot: core.cloneBondSnapshot,
    bondSnapshotsEqual: core.bondSnapshotsEqual,
    cloneAtomsSnapshot: (vol) => JSON.parse(JSON.stringify(vol.atoms || [])),
    cloneVolumeAnnotationsSnapshot: core.cloneVolumeAnnotationsSnapshot,
    atomUnitsToAng: (_vol, atom) => ({ x: atom.x, y: atom.y, z: atom.z }),
    adjustHydrogensAfterBondEdit,
    pushEditHistoryEntry: (_record, beforeAtoms, afterAtoms, label, historyOptions = {}) => {
      calls.history.push({
        label: String(label || ''),
        beforeAtoms: beforeAtoms || [],
        afterAtoms: afterAtoms || [],
        beforeBonds: historyOptions.beforeBonds || [],
        afterBonds: historyOptions.afterBonds || [],
        beforeAnnotations: historyOptions.beforeAnnotations || null,
        afterAnnotations: historyOptions.afterAnnotations || null,
      });
    },
    clearHover: () => { calls.clearedHover += 1; },
    rebuildScene: () => { calls.rebuilds += 1; },
    updateSidePanel: () => { calls.sidePanelUpdates += 1; },
    ensureAtomId: core.ensureAtomId,
    findVolumeBondRecordIndex: core.findVolumeBondRecordIndex,
    normalizeVolumeBondRecord: core.normalizeVolumeBondRecord,
    normalizeVolumeBondStyle: core.normalizeVolumeBondStyle,
    upsertVolumeBond: core.upsertVolumeBond,
    removeVolumeBond: core.removeVolumeBond,
    getElementSymbol: (z) => ({ 6: 'C', 7: 'N', 26: 'Fe' }[z] || '?'),
    isMetalAtomZ: (z) => z === 26,
    getBondStyleLabel: (style) => ({
      'covalent': 'Covalent',
      'metal-strong': 'Coordination',
      'metal-dative': 'Dative',
      'metal-metal': 'Metal-metal',
    }[String(style || 'covalent')] || String(style || 'covalent')),
    resolveDefaultBondStyle: (atomA, atomB) => ((atomA && atomA.Z === 26) || (atomB && atomB.Z === 26))
      ? (((atomA && atomA.Z === 26) && (atomB && atomB.Z === 26)) ? 'metal-metal' : 'metal-strong')
      : 'covalent',
    getBondAction: () => 'set',
    getBondOrder: () => 1,
    setBondOrder: () => {},
    setHintMessage: (message) => { calls.hints.push(String(message || '')); },
  });
  return {
    core,
    controller,
    record,
    calls,
    carrier: { userData: { i: 0, j: 1, bondOrder: initialOrder, bondStyle: initialStyle } },
  };
}

test('bond-editing stepCarrierOrder raises one displayed bond order and makes the bond explicit', () => {
  const { controller, record, calls, carrier } = createHarness({ order: 1, origin: 'perceived' });

  assert.equal(controller.stepCarrierOrder(carrier, 1), true);

  const bond = record.vol.bonds[0];
  assert.equal(bond.order, 2);
  assert.equal(bond.kind, 'normal');
  assert.equal(bond.origin, 'explicit');
  assert.equal(calls.history.length, 1);
  assert.match(calls.hints.at(-1), /order 2/i);
});

test('bond-editing stepCarrierOrder is bounded at quadruple bonds', () => {
  const { controller, record, calls, carrier } = createHarness({ order: 4, origin: 'explicit' });

  assert.equal(controller.stepCarrierOrder(carrier, 1), false);

  const bond = record.vol.bonds[0];
  assert.equal(bond.order, 4);
  assert.equal(bond.kind, 'normal');
  assert.equal(calls.history.length, 0);
  assert.match(calls.hints.at(-1), /already order 4/i);
});

test('bond-editing stepCarrierOrder reduces a single bond to deleted state at zero', () => {
  const { controller, record, calls, carrier } = createHarness({ order: 1, origin: 'perceived' });

  assert.equal(controller.stepCarrierOrder(carrier, -1), true);

  const bond = record.vol.bonds[0];
  assert.equal(bond.order, 1);
  assert.equal(bond.kind, 'blocked');
  assert.equal(bond.origin, 'explicit');
  assert.equal(calls.history.length, 1);
  assert.match(calls.hints.at(-1), /deleted/i);
});

test('bond-editing bond-order changes run local hydrogen adjustment for both bonded atoms', () => {
  const { controller, record, calls, carrier } = createHarness({
    order: 1,
    origin: 'explicit',
    adjustHydrogensAfterBondEdit: (vol, atomIndices, adjustOptions = {}) => {
      calls.hydrogenAdjustments.push({
        atomIndices: Array.isArray(atomIndices) ? atomIndices.slice() : [],
        hasPreferredDirMap: !!(adjustOptions && adjustOptions.preferredDirByAtomId && typeof adjustOptions.preferredDirByAtomId.get === 'function'),
      });
      vol.atoms.push({ id: 'atom-h', Z: 1, x: 0, y: 1, z: 0, formalCharge: 0 });
      vol.natoms = vol.atoms.length;
      vol.annotations = vol.annotations || {};
      vol.annotations.coordination = vol.annotations.coordination || { byAtomId: {} };
      vol.annotations.coordination.byAtomId = vol.annotations.coordination.byAtomId || {};
      vol.annotations.coordination.byAtomId['atom-1'] = { geometryId: 'trigonalPlanar' };
      return { added: 1, removed: 0 };
    },
  });

  assert.equal(controller.stepCarrierOrder(carrier, 1), true);
  assert.equal(calls.hydrogenAdjustments.length, 1);
  assert.equal(JSON.stringify(calls.hydrogenAdjustments[0].atomIndices), JSON.stringify([0, 1]));
  assert.equal(calls.hydrogenAdjustments[0].hasPreferredDirMap, true);
  assert.equal(calls.history.length, 1);
  assert.equal(calls.history[0].beforeAtoms.length, 2);
  assert.equal(calls.history[0].afterAtoms.length, 3);
  assert.equal(calls.history[0].beforeAnnotations?.coordination?.byAtomId?.['atom-1'], undefined);
  assert.equal(calls.history[0].afterAnnotations?.coordination?.byAtomId?.['atom-1']?.geometryId, 'trigonalPlanar');
  assert.equal(record.vol.bonds[0].order, 2);
});

test('bond-editing stepCarrierOrder cycles metal bonds through coordination styles', () => {
  const { controller, record, calls, carrier } = createHarness({
    atomZ1: 26,
    atomZ2: 7,
    style: 'covalent',
    origin: 'explicit',
  });

  assert.equal(controller.stepCarrierOrder(carrier, 1), true);
  assert.equal(record.vol.bonds[0].style, 'metal-strong');
  assert.match(calls.hints.at(-1), /coordination/i);

  carrier.userData.bondStyle = 'metal-strong';
  assert.equal(controller.stepCarrierOrder(carrier, 1), true);
  assert.equal(record.vol.bonds[0].style, 'metal-dative');
  assert.match(calls.hints.at(-1), /dative/i);
});

test('bond-editing applyToAtom defaults new explicit metal bonds to coordination style', () => {
  const { controller, record, calls } = createHarness({
    atomZ1: 26,
    atomZ2: 7,
    withBond: false,
  });

  assert.equal(controller.applyToAtom(0), true);
  assert.equal(controller.applyToAtom(1), true);
  assert.equal(record.vol.bonds.length, 1);
  assert.equal(record.vol.bonds[0].order, 1);
  assert.equal(record.vol.bonds[0].style, 'metal-strong');
  assert.equal(record.vol.bonds[0].origin, 'explicit');
  assert.match(calls.hints.at(-1), /coordination/i);
});

test('bond-editing applyToAtomPair can block a metal bond explicitly', () => {
  const { controller, record, calls } = createHarness({
    atomZ1: 26,
    atomZ2: 7,
    style: 'metal-strong',
    origin: 'explicit',
  });

  assert.equal(controller.applyToAtomPair(0, 1, { deleteOverride: true }), true);
  assert.equal(record.vol.bonds[0].kind, 'blocked');
  assert.equal(record.vol.bonds[0].origin, 'explicit');
  assert.match(calls.hints.at(-1), /deleted/i);
});
