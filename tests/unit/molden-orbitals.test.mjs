import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { loadGlobalModule } from './load-global-module.mjs';

const source = readFileSync(new URL('../../assets/app/js/app.js', import.meta.url), 'utf8');
function extractFunction(name) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf('\n  }\n', start);
  assert.ok(start >= 0 && end > start, `Expected the app’s ${name} function`);
  return vm.runInNewContext(`(${source.slice(start, end + 4)})`);
}
const accumulate = extractFunction('accumulateMoldenShellContribution');

// PySCF 2.13.0 GTO values at these Bohr coordinates, in Molden AO order.
// The Cartesian values are divided by the square roots of the AO overlap
// diagonal, matching the normalized function convention in Molden output.
const points = [[0.37, -0.21, 0.51], [-0.28, 0.46, 0.19]];
const exponents = [1.6, 0.28];
const s = [0.26205797016002286, 0.820355384848767];
const d = [0.2805301007226814, 0.8781811848710027];
const f = [0.286796418797083, 0.897797484929999];
const cases = [
  { label: 's', contractions: s, expected: [[0.33008990761], [0.36310060973]] },
  {
    label: 'p', contractions: [0.27238502899681905, 0.8526835690335205],
    expected: [[0.20858830205, -0.11838795522, 0.28751360552], [-0.17936768887, 0.29467548886, 0.12171378888]],
  },
  {
    label: 'sp', contractions: s, pContractions: [-0.6086044659332098, 1.0954880386797776],
    expected: [
      [0.33008990761, -0.18117418161, 0.10282858956, -0.24972657465],
      [0.36310060973, 0.17812660513, -0.29263656558, -0.12087162491],
    ],
  },
  {
    label: 'd', contractions: d,
    expected: [
      [0.08988748989, 0.02895572173, 0.17077966487, -0.08836442402, 0.21459931547, -0.12179961148],
      [0.06004857604, 0.16206988126, 0.02764991831, -0.17086894618, -0.07057630386, 0.11594678491],
    ],
  },
  {
    label: 'd', spherical: true, contractions: d,
    expected: [
      [0.11135805906, 0.21459931547, -0.12179961148, 0.05276845913, -0.08836442402],
      [-0.08340931035, -0.07057630386, 0.11594678491, -0.08835304205, -0.17086894618],
    ],
  },
  {
    label: 'f', contractions: f,
    expected: [
      [0.03377600698, -0.00617534205, 0.08845322295, 0.02432923477, -0.0428657946,
        0.10410264402, 0.14349283365, -0.08144187856, 0.03353489117, -0.10233871464],
      [-0.01734734811, 0.07691879898, 0.00542025604, -0.10469301243, 0.06372618148,
        0.02632168365, -0.01786114248, 0.0293433055, 0.071041687, -0.07489866777],
    ],
  },
  {
    label: 'f', spherical: true, contractions: f,
    expected: [
      [-0.00387684253, 0.12984219265, -0.07369421745, 0.06111346665, -0.10233871464, 0.00089722775, -0.04058400451],
      [-0.05989307855, 0.01972849879, -0.03241110516, -0.03872865896, -0.07489866777, 0.0973294257, 0.00678217267],
    ],
  },
];

for (const { label, spherical, contractions, pContractions, expected } of cases) {
  const representation = spherical ? 'spherical' : 'cartesian';
  test(`Molden ${label} shell (${representation}) agrees with PySCF`, () => {
    const primitives = exponents.map((exponent, index) => ({
      exponent,
      coefficients: pContractions ? [contractions[index], pContractions[index]] : [contractions[index]],
    }));
    for (const [pointIndex, point] of points.entries()) {
      const axes = point.map(coordinate => ({ coord: [coordinate], sq: [coordinate ** 2] }));
      for (const [component, reference] of expected[pointIndex].entries()) {
        const weights = new Float32Array(expected[pointIndex].length);
        weights[component] = 1;
        const data = new Float32Array(1);
        accumulate(data, [1, 1, 1], ...axes, { label, primitives }, weights, { [label]: representation });
        assert.ok(Math.abs(data[0] - reference) < 1e-7,
          `AO ${component + 1} at ${point} Bohr: actual ${data[0]}, expected ${reference} within 1e-7`);
      }
    }
  });
}

const fixtureDir = new URL('../fixtures/molden-g/', import.meta.url);
const reference = JSON.parse(readFileSync(new URL('molden_g_reference.json', fixtureDir), 'utf8'));
const { parseMolden } = loadGlobalModule('assets/app/js/parsers.js', {
  globals: { ATOM_SYMBOL_TO_Z: { NE: 10 } },
}).VibeMolParsers;
const buildAxis = extractFunction('buildMoldenAxisTables');
const countFunctions = extractFunction('countMoldenShellFunctionCount');

function evaluateNeOrbital(point, molden, moIndex) {
  const data = new Float32Array(1);
  const axes = point.map(coordinate => buildAxis(1, coordinate, 0, 0));
  const coefficients = molden.mos[moIndex].coefficients;
  const { angularFlags } = molden;
  let offset = 0;
  for (const { shells } of molden.basis.atomBlocks) {
    for (const shell of shells) {
      const end = offset + countFunctions(shell.label, angularFlags);
      accumulate(data, [1, 1, 1], ...axes, shell, coefficients.subarray(offset, end), angularFlags);
      offset = end;
    }
  }
  assert.equal(offset, coefficients.length);
  return data[0];
}

for (const representation of ['spherical', 'cartesian']) {
  test(`Molden ${representation} g-shell MOs agree at 64 reference points`, () => {
    const { file, mos, values } = reference[representation];
    const { points_bohr: pointsBohr } = reference;
    const volume = parseMolden(readFileSync(new URL(file, fixtureDir), 'utf8'));
    assert.equal(pointsBohr.length, 64);
    assert.equal(mos.length, representation === 'spherical' ? 9 : 15);
    assert.equal(values.length, mos.length);
    assert.deepEqual(Array.from(volume.atoms, ({ Z, x, y, z }) => [Z, x, y, z]), [[10, 0, 0, 0]]);
    assert.equal(volume.molden.angularFlags.g, representation);
    const failures = [];
    for (const [row, moIndex] of mos.entries()) {
      const expected = values[row];
      assert.equal(expected.length, 64);
      const maxReference = Math.max(...expected.map(Math.abs));
      const limit = 2e-6 * maxReference;
      try {
        const actual = pointsBohr.map(point => evaluateNeOrbital(point, volume.molden, moIndex));
        // Compare signed amplitudes directly. The Molden coefficients fix the phase.
        const maxError = Math.max(...actual.map((value, index) => Math.abs(value - expected[index])));
        const result = { representation, moIndex, points: actual.length, maxReference, maxError, limit };
        console.log('[molden-g-mo] ' + JSON.stringify(result));
        if (!(maxError <= limit)) failures.push(result);
      } catch (error) {
        const result = { representation, moIndex, maxReference, limit, error: error.message };
        console.log('[molden-g-mo] ' + JSON.stringify(result));
        failures.push(result);
      }
    }
    assert.deepEqual(failures, []);
  });
}
