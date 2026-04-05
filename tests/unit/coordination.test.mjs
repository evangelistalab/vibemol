import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadCoordination() {
  const context = loadGlobalModule('assets/app/js/coordination.js', {
    globals: {
      ATOM_Z_TO_DATA: {
        6: { symbol: 'C', name: 'Carbon' },
        8: { symbol: 'O', name: 'Oxygen' },
        15: { symbol: 'P', name: 'Phosphorus' },
        16: { symbol: 'S', name: 'Sulfur' },
        28: { symbol: 'Ni', name: 'Nickel' },
        78: { symbol: 'Pt', name: 'Platinum' },
      },
    },
  });
  return context.window.VibeMolCoordination;
}

test('coordination catalog exposes tetrahedral geometry with CN 4', () => {
  const api = loadCoordination();
  const geometry = plain(api.getGeometry('tetrahedral'));
  assert.equal(geometry.id, 'tetrahedral');
  assert.equal(geometry.label, 'Tetrahedral');
  assert.equal(geometry.cn, 4);
  assert.equal(geometry.vertices.length, 4);
});

test('coordination profile lists common carbon geometries', () => {
  const api = loadCoordination();
  const profile = plain(api.getCoordinationProfile(6));
  assert.deepEqual(profile.choices.map((choice) => choice.text), [
    'Linear (2)',
    'Trigonal planar (3)',
    'Tetrahedral (4)',
  ]);
});

test('coordination profile lists common phosphorus and sulfur geometries', () => {
  const api = loadCoordination();
  assert.deepEqual(plain(api.getCoordinationProfile(15)).choices.map((choice) => choice.text), [
    'Trigonal planar (3)',
    'Tetrahedral (4)',
    'Trigonal bipyramidal (5)',
    'Octahedral (6)',
  ]);
  assert.deepEqual(plain(api.getCoordinationProfile(16)).choices.map((choice) => choice.text), [
    'Linear (2)',
    'Trigonal planar (3)',
    'Tetrahedral (4)',
    'Trigonal bipyramidal (5)',
    'Octahedral (6)',
  ]);
});

test('coordination profile lists metal-specific choices for nickel and platinum', () => {
  const api = loadCoordination();
  assert.deepEqual(plain(api.getCoordinationProfile(28)).choices.map((choice) => choice.text), [
    'Square planar (4)',
    'Tetrahedral (4)',
    'Square pyramidal (5)',
    'Octahedral (6)',
    'Trigonal prismatic (6)',
  ]);
  assert.deepEqual(plain(api.getCoordinationProfile(78)).choices.map((choice) => choice.text), [
    'Square planar (4)',
    'Tetrahedral (4)',
    'Square pyramidal (5)',
    'Octahedral (6)',
    'Trigonal prismatic (6)',
  ]);
});

test('auto coordination resolution uses local environment for carbon', () => {
  const api = loadCoordination();
  assert.equal(api.resolveAutoCoordinationChoice(6, { neighborCount: 0, bondOrderSum: 0, maxBondOrder: 1 }).geometryId, 'tetrahedral');
  assert.equal(api.resolveAutoCoordinationChoice(6, { neighborCount: 2, bondOrderSum: 3, maxBondOrder: 2 }).geometryId, 'trigonalPlanar');
  assert.equal(api.resolveAutoCoordinationChoice(6, { neighborCount: 2, bondOrderSum: 4, maxBondOrder: 2 }).geometryId, 'linear');
  assert.equal(api.resolveAutoCoordinationChoice(6, { neighborCount: 2, bondOrderSum: 3, maxBondOrder: 3 }).geometryId, 'linear');
});

test('compatibility and halo choice listing filter by current occupied count', () => {
  const api = loadCoordination();
  assert.equal(api.isCoordinationChoiceCompatible('linear', { neighborCount: 2 }), true);
  assert.equal(api.isCoordinationChoiceCompatible('linear', { neighborCount: 3 }), false);
  assert.deepEqual(plain(api.listHaloCoordinationChoices(6, { neighborCount: 3 })).map((choice) => choice.text), [
    'Trigonal planar (3)',
    'Tetrahedral (4)',
  ]);
});
