import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../assets/app/js/app.js', import.meta.url), 'utf8');
const start = source.indexOf('  function accumulateMoldenShellContribution(');
const end = source.indexOf('\n  }\n', start);
assert.ok(start >= 0 && end > start, 'Expected the app’s Molden shell evaluator');
const accumulate = vm.runInNewContext(`(${source.slice(start, end + 4)})`);

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
