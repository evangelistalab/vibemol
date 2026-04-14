import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';

function loadHelpers() {
  const context = loadGlobalModule('src/components/VmListPopover.js');
  return context.VibeMolListPopover;
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

test('findNextEditableCellPosition walks row-major editable cells', () => {
  const helpers = loadHelpers();
  const schema = [
    { key: 'order', editable: true },
    { key: 'sym', editable: true },
    { key: 'energy', editable: false },
    { key: 'x', editable: true },
  ];
  assert.deepEqual(
    normalize(helpers.findNextEditableCellPosition(schema, 2, 0, 'sym', 1)),
    { rowIndex: 0, columnKey: 'x' },
  );
  assert.deepEqual(
    normalize(helpers.findNextEditableCellPosition(schema, 2, 1, 'order', -1)),
    { rowIndex: 0, columnKey: 'x' },
  );
  assert.equal(
    helpers.findNextEditableCellPosition(schema, 1, 0, 'x', 1),
    null,
  );
});

test('formatOrbitalSpinGlyph normalizes alpha beta and restricted labels', () => {
  const helpers = loadHelpers();
  assert.equal(helpers.formatOrbitalSpinGlyph('Alpha'), 'α');
  assert.equal(helpers.formatOrbitalSpinGlyph('beta'), 'β');
  assert.equal(helpers.formatOrbitalSpinGlyph(''), '·');
  assert.equal(helpers.formatOrbitalSpinGlyph(null), '·');
});

test('getOrbitalBoundary and formatOrbitalRelativeLabel derive HOMO/LUMO positions', () => {
  const helpers = loadHelpers();
  const items = [
    { occ: 2.0 },
    { occ: 2.0 },
    { occ: 0.0 },
    { occ: 0.0 },
  ];
  assert.deepEqual(normalize(helpers.getOrbitalBoundary(items)), { lastOccupiedIndex: 1, firstVirtualIndex: 2 });
  assert.equal(helpers.formatOrbitalRelativeLabel(items, 1), 'HOMO');
  assert.equal(helpers.formatOrbitalRelativeLabel(items, 2), 'LUMO');
  assert.equal(helpers.formatOrbitalRelativeLabel(items, 0), 'HOMO-1');
  assert.equal(helpers.formatOrbitalRelativeLabel(items, 3), 'LUMO+1');
});

test('passesOrbitalEnergyThreshold filters on absolute energy magnitude', () => {
  const helpers = loadHelpers();
  assert.equal(helpers.passesOrbitalEnergyThreshold(-0.6, 0.5), true);
  assert.equal(helpers.passesOrbitalEnergyThreshold(0.4, 0.5), false);
  assert.equal(helpers.passesOrbitalEnergyThreshold(0.1, 0), true);
});
