import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadInference() {
  const context = loadGlobalModules([
    'assets/app/js/coordination.js',
    'assets/app/js/geometry-inference.js',
  ], {
    globals: {
      ATOM_Z_TO_DATA: {
        1: { symbol: 'H', name: 'Hydrogen' },
        5: { symbol: 'B', name: 'Boron' },
        6: { symbol: 'C', name: 'Carbon' },
        7: { symbol: 'N', name: 'Nitrogen' },
        8: { symbol: 'O', name: 'Oxygen' },
        9: { symbol: 'F', name: 'Fluorine' },
        15: { symbol: 'P', name: 'Phosphorus' },
        16: { symbol: 'S', name: 'Sulfur' },
        17: { symbol: 'Cl', name: 'Chlorine' },
        28: { symbol: 'Ni', name: 'Nickel' },
        54: { symbol: 'Xe', name: 'Xenon' },
        78: { symbol: 'Pt', name: 'Platinum' },
      },
    },
  });
  return context.window.VibeMolGeometryInference;
}

test('geometry inference derives common carbon geometries from bond order', () => {
  const api = loadInference();
  const bare = plain(api.inferGeometryFromState({ z: 6, bonds: [] }));
  const doubleBond = plain(api.inferGeometryFromState({ z: 6, bonds: [{ order: 2 }] }));
  const tripleBond = plain(api.inferGeometryFromState({ z: 6, bonds: [{ order: 3 }] }));

  assert.equal(bare.geometryId, 'tetrahedral');
  assert.equal(bare.molecularLabel, 'tetrahedral');
  assert.deepEqual(bare.compatibleGeometryIds.filter((id) => id !== 'terminal'), [
    'linear',
    'trigonalPlanar',
    'tetrahedral',
  ]);

  assert.equal(doubleBond.geometryId, 'trigonalPlanar');
  assert.equal(doubleBond.molecularLabel, 'trigonal planar');
  assert.deepEqual(doubleBond.compatibleGeometryIds.filter((id) => id !== 'terminal'), [
    'linear',
    'trigonalPlanar',
  ]);

  assert.equal(tripleBond.geometryId, 'linear');
  assert.equal(tripleBond.molecularLabel, 'linear');
});

test('geometry inference derives lone-pair-bearing main-group parents from bond order', () => {
  const api = loadInference();
  const nitrogen = plain(api.inferGeometryFromState({ z: 7, bonds: [] }));
  const oxygen = plain(api.inferGeometryFromState({ z: 8, bonds: [] }));

  assert.equal(nitrogen.geometryId, 'tetrahedral');
  assert.equal(nitrogen.molecularLabel, 'trigonal pyramidal');
  assert.equal(nitrogen.fullBondCount, 3);
  assert.equal(nitrogen.lonePairs, 1);

  assert.equal(oxygen.geometryId, 'tetrahedral');
  assert.equal(oxygen.molecularLabel, 'bent');
  assert.equal(oxygen.fullBondCount, 2);
  assert.equal(oxygen.lonePairs, 2);
});

test('geometry inference handles charge-adjusted valence cases', () => {
  const api = loadInference();
  const ammonium = plain(api.inferGeometryFromState({ z: 7, formalCharge: 1, bonds: [{ order: 1 }, { order: 1 }, { order: 1 }, { order: 1 }] }));
  const hydronium = plain(api.inferGeometryFromState({ z: 8, formalCharge: 1, bonds: [{ order: 1 }, { order: 1 }, { order: 1 }] }));
  const methylAnion = plain(api.inferGeometryFromState({ z: 6, formalCharge: -1, bonds: [{ order: 1 }, { order: 1 }, { order: 1 }] }));

  assert.equal(ammonium.geometryId, 'tetrahedral');
  assert.equal(ammonium.molecularLabel, 'tetrahedral');
  assert.equal(ammonium.lonePairs, 0);

  assert.equal(hydronium.geometryId, 'tetrahedral');
  assert.equal(hydronium.molecularLabel, 'trigonal pyramidal');
  assert.equal(hydronium.lonePairs, 1);

  assert.equal(methylAnion.geometryId, 'tetrahedral');
  assert.equal(methylAnion.molecularLabel, 'trigonal pyramidal');
  assert.equal(methylAnion.lonePairs, 1);
});

test('geometry inference picks the smallest valid hypervalent expansion', () => {
  const api = loadInference();
  const sulfurDioxide = plain(api.inferGeometryFromState({ z: 16, bonds: [{ order: 2 }, { order: 2 }] }));
  const sulfurHexafluoride = plain(api.inferGeometryFromState({ z: 16, bonds: [{ order: 1 }, { order: 1 }, { order: 1 }, { order: 1 }, { order: 1 }, { order: 1 }] }));
  const xenonDifluoride = plain(api.inferGeometryFromState({ z: 54, bonds: [{ order: 1 }, { order: 1 }] }));
  const xenonTetrafluoride = plain(api.inferGeometryFromState({ z: 54, bonds: [{ order: 1 }, { order: 1 }, { order: 1 }, { order: 1 }] }));

  assert.equal(sulfurDioxide.projectedValence, 4);
  assert.equal(sulfurDioxide.geometryId, 'trigonalPlanar');
  assert.equal(sulfurDioxide.molecularLabel, 'bent');

  assert.equal(sulfurHexafluoride.projectedValence, 6);
  assert.equal(sulfurHexafluoride.geometryId, 'octahedral');

  assert.equal(xenonDifluoride.projectedValence, 2);
  assert.equal(xenonDifluoride.geometryId, 'trigonalBipyramidal');
  assert.equal(xenonDifluoride.molecularLabel, 'linear');

  assert.equal(xenonTetrafluoride.projectedValence, 4);
  assert.equal(xenonTetrafluoride.geometryId, 'octahedral');
  assert.equal(xenonTetrafluoride.molecularLabel, 'square planar');
});

test('geometry inference flags ambiguous lone-pair cases without crashing', () => {
  const api = loadInference();
  const ambiguous = plain(api.inferGeometryFromState({
    z: 5,
    formalCharge: -2,
    bonds: [{ order: 2 }, { order: 2 }],
  }));

  assert.equal(ambiguous.lonePairAmbiguous, true);
  assert.equal(typeof ambiguous.geometryId, 'string');
  assert.ok(ambiguous.geometryId.length > 0);
});

test('geometry inference treats stored coordination as a compatible preference only while open', () => {
  const api = loadInference();
  const preferredBareCarbon = plain(api.inferGeometryFromState({
    z: 6,
    bonds: [],
    preferredGeometryId: 'linear',
  }));
  const incompatibleCarbonylPreference = plain(api.inferGeometryFromState({
    z: 6,
    bonds: [{ order: 2 }],
    preferredGeometryId: 'tetrahedral',
  }));

  assert.equal(preferredBareCarbon.geometryId, 'linear');
  assert.equal(preferredBareCarbon.derivedGeometryId, 'tetrahedral');
  assert.equal(preferredBareCarbon.preferredGeometryCompatible, true);

  assert.equal(incompatibleCarbonylPreference.geometryId, 'trigonalPlanar');
  assert.equal(incompatibleCarbonylPreference.preferredGeometryCompatible, false);
});

test('transition metals stay on the coordination-number path', () => {
  const api = loadInference();
  const nickel = plain(api.inferGeometryFromState({
    z: 28,
    bonds: [{ order: 1 }, { order: 1 }, { order: 1 }, { order: 1 }],
  }));
  const platinum = plain(api.inferGeometryFromState({
    z: 78,
    bonds: [{ order: 1 }, { order: 1 }, { order: 1 }, { order: 1 }],
  }));

  assert.equal(nickel.isTM, true);
  assert.equal(nickel.geometryId, 'squarePlanar');
  assert.equal(platinum.geometryId, 'squarePlanar');
});
