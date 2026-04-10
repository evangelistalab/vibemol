import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';

function loadSymmetry() {
  return loadGlobalModules([
    'assets/app/js/edit-utils.js',
    'assets/app/js/symmetry.js',
  ]);
}

function atom(id, Z, x, y, z) {
  return { id, Z, x, y, z };
}

function buildWater() {
  return [
    atom('o', 8, 0, 0, 0),
    atom('h1', 1, 0.7586, 0, 0.5043),
    atom('h2', 1, -0.7586, 0, 0.5043),
  ];
}

function buildAmmonia() {
  return [
    atom('n', 7, 0, 0, 0.1),
    atom('h1', 1, 0.94, 0, -0.28),
    atom('h2', 1, -0.47, 0.814, -0.28),
    atom('h3', 1, -0.47, -0.814, -0.28),
  ];
}

function buildMethane() {
  return [
    atom('c', 6, 0, 0, 0),
    atom('h1', 1, 0.629118, 0.629118, 0.629118),
    atom('h2', 1, 0.629118, -0.629118, -0.629118),
    atom('h3', 1, -0.629118, 0.629118, -0.629118),
    atom('h4', 1, -0.629118, -0.629118, 0.629118),
  ];
}

function buildBenzene() {
  const atoms = [];
  const carbonRadius = 1.39;
  const hydrogenRadius = 2.48;
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i;
    atoms.push(atom(`c${i + 1}`, 6, carbonRadius * Math.cos(angle), carbonRadius * Math.sin(angle), 0));
  }
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i;
    atoms.push(atom(`h${i + 1}`, 1, hydrogenRadius * Math.cos(angle), hydrogenRadius * Math.sin(angle), 0));
  }
  return atoms;
}

function buildSF6() {
  return [
    atom('s', 16, 0, 0, 0),
    atom('f1', 9, 1.56, 0, 0),
    atom('f2', 9, -1.56, 0, 0),
    atom('f3', 9, 0, 1.56, 0),
    atom('f4', 9, 0, -1.56, 0),
    atom('f5', 9, 0, 0, 1.56),
    atom('f6', 9, 0, 0, -1.56),
  ];
}

function buildCO2() {
  return [
    atom('o1', 8, -1.16, 0, 0),
    atom('c', 6, 0, 0, 0),
    atom('o2', 8, 1.16, 0, 0),
  ];
}

function buildChiralAsymmetric() {
  return [
    atom('c', 6, 0, 0, 0),
    atom('h', 1, 1, 1, 1),
    atom('f', 9, -1, -1, 1),
    atom('cl', 17, -1, 1, -1),
    atom('br', 35, 1, -1, -1),
  ];
}

function buildDistortedMethane() {
  return [
    atom('c', 6, 0, 0, 0),
    atom('h1', 1, 0.68, 0.62, 0.63),
    atom('h2', 1, 0.58, -0.60, -0.70),
    atom('h3', 1, -0.61, 0.66, -0.60),
    atom('h4', 1, -0.67, -0.55, 0.73),
  ];
}

function rotateXY(x, y, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    (x * c) - (y * s),
    (x * s) + (y * c),
  ];
}

function buildImproperOrbit(seed, stepAngle, count, atomicNumber, prefix) {
  const atoms = [];
  for (let k = 0; k < count; k += 1) {
    const angle = stepAngle * k;
    const [x, y] = rotateXY(seed.x, seed.y, angle);
    const z = (k % 2 === 0) ? seed.z : -seed.z;
    atoms.push(atom(`${prefix}_${k + 1}`, atomicNumber, x, y, z));
  }
  return atoms;
}

function buildS4() {
  return [
    ...buildImproperOrbit({ x: 1.484828542365967, y: 0.8661667928056709, z: 0.6757731127595101 }, Math.PI * 0.5, 4, 9, 's4f'),
    ...buildImproperOrbit({ x: 0.6606512954694687, y: 0.3816200867141606, z: 0.7933204343937544 }, Math.PI * 0.5, 4, 17, 's4cl'),
  ];
}

function buildS6() {
  return [
    ...buildImproperOrbit({ x: 1.1120921368648333, y: 1.0876984176793343, z: 0.898896412399959 }, Math.PI / 3, 6, 9, 's6f'),
    ...buildImproperOrbit({ x: 0.34469090440075645, y: 1.049307240880509, z: 0.5871639669264654 }, Math.PI / 3, 6, 17, 's6cl'),
  ];
}

function analyze(context, atoms, options = {}) {
  return context.window.VibeMolSymmetry.analyzePointGroup(atoms, options);
}

test('symmetry detects exact point groups for common symmetric molecules', () => {
  const context = loadSymmetry();
  const fixtures = [
    { label: 'water', atoms: buildWater(), exact: 'C2v' },
    { label: 'ammonia', atoms: buildAmmonia(), exact: 'C3v' },
    { label: 'methane', atoms: buildMethane(), exact: 'Td' },
    { label: 'benzene', atoms: buildBenzene(), exact: 'D6h' },
    { label: 'SF6', atoms: buildSF6(), exact: 'Oh' },
    { label: 'CO2', atoms: buildCO2(), exact: 'D∞h' },
    { label: 'synthetic S4', atoms: buildS4(), exact: 'S4' },
    { label: 'synthetic S6', atoms: buildS6(), exact: 'S6' },
    { label: 'asymmetric chiral', atoms: buildChiralAsymmetric(), exact: 'C1' },
  ];

  for (const fixture of fixtures) {
    const result = analyze(context, fixture.atoms, { toleranceAng: 0.12 });
    assert.equal(result.exactGroupLabel, fixture.exact, `${fixture.label} should detect as ${fixture.exact}`);
  }
});

test('symmetry approximate candidates honor tolerance thresholds', () => {
  const context = loadSymmetry();
  const atoms = buildDistortedMethane();
  const relaxed = analyze(context, atoms, { toleranceAng: 0.12 });
  const tight = analyze(context, atoms, { toleranceAng: 0.02 });
  const relaxedGroups = relaxed.approximateCandidates.map((candidate) => candidate.groupLabel);
  const tightGroups = tight.approximateCandidates.map((candidate) => candidate.groupLabel);

  assert.ok(relaxedGroups.includes('Td'), `expected Td in relaxed candidates, got ${relaxedGroups.join(', ')}`);
  assert.ok(!tightGroups.includes('Td'), `did not expect Td in tight candidates, got ${tightGroups.join(', ')}`);
});

test('symmetry exposes visual symmetry elements for common groups', () => {
  const context = loadSymmetry();
  const api = context.window.VibeMolSymmetry;

  const waterAnalysis = analyze(context, buildWater(), { toleranceAng: 0.12 });
  const waterElements = api.describeSymmetryElements(waterAnalysis);
  const waterLabels = waterElements.map((entry) => entry.label);
  assert.ok(waterLabels.some((label) => label.startsWith('C2 axis')), `expected water to expose a C2 axis, got ${waterLabels.join(', ')}`);
  assert.ok(waterLabels.filter((label) => label.startsWith('σv plane')).length >= 2, `expected water to expose sigma-v planes, got ${waterLabels.join(', ')}`);

  const methaneAnalysis = analyze(context, buildMethane(), { toleranceAng: 0.12 });
  const methaneElements = api.describeSymmetryElements(methaneAnalysis);
  const methaneLabels = methaneElements.map((entry) => entry.label);
  assert.ok(methaneLabels.some((label) => label.startsWith('C3 axis')), `expected methane to expose C3 axes, got ${methaneLabels.join(', ')}`);
  assert.ok(methaneLabels.some((label) => label.startsWith('σd plane')), `expected methane to expose sigma-d planes, got ${methaneLabels.join(', ')}`);

  const s4Analysis = analyze(context, buildS4(), { toleranceAng: 0.12 });
  const s4Labels = api.describeSymmetryElements(s4Analysis).map((entry) => entry.label);
  assert.ok(s4Labels.some((label) => label.startsWith('S4 axis')), `expected S4 fixture to expose an S4 axis, got ${s4Labels.join(', ')}`);

  const s6Analysis = analyze(context, buildS6(), { toleranceAng: 0.12 });
  const s6Labels = api.describeSymmetryElements(s6Analysis).map((entry) => entry.label);
  assert.ok(s6Labels.some((label) => label.startsWith('S6 axis')), `expected S6 fixture to expose an S6 axis, got ${s6Labels.join(', ')}`);
});

test('symmetry preview and apply preserve indexing while improving residuals', () => {
  const context = loadSymmetry();
  const api = context.window.VibeMolSymmetry;
  const atoms = buildDistortedMethane();
  const preview = api.buildSymmetryPreview(atoms, 'Td');

  assert.ok(preview, 'expected a Td preview for distorted methane');
  assert.equal(preview.groupLabel, 'Td');
  assert.equal(preview.atoms.length, atoms.length);
  assert.ok(preview.beforeResidual.maxDisplacementAng > preview.afterResidual.maxDisplacementAng);
  assert.ok(preview.beforeResidual.maxDisplacementAng > 1e-4);
  assert.ok(preview.afterResidual.maxDisplacementAng <= 1e-4);

  const applied = api.applySymmetryPreview(atoms, preview);
  assert.equal(applied.length, atoms.length);
  assert.deepEqual(applied.map((entry) => entry.id), atoms.map((entry) => entry.id));
  assert.deepEqual(applied.map((entry) => entry.Z), atoms.map((entry) => entry.Z));

  const reapplied = analyze(context, applied, { toleranceAng: 0.02 });
  assert.equal(reapplied.exactGroupLabel, 'Td');
});

test('symmetry controller tracks tolerance, analysis, preview, and apply lifecycle', () => {
  const context = loadSymmetry();
  const api = context.window.VibeMolSymmetry;
  const controller = api.createEditSymmetryController({ toleranceAng: 0.05 });
  const atoms = buildWater();

  assert.equal(Number(controller.getTolerance().toFixed(3)), 0.05);
  controller.setTolerance(0.08);
  assert.equal(Number(controller.getTolerance().toFixed(3)), 0.08);

  const analysis = controller.analyzeTarget(atoms);
  assert.equal(analysis.exactGroupLabel, 'C2v');

  const preview = controller.buildPreview(buildDistortedMethane(), 'Td');
  assert.ok(preview);
  assert.equal(controller.getPreview(), preview);

  const applied = controller.applyPreview(buildDistortedMethane());
  assert.equal(applied.length, 5);

  controller.clearPreview();
  assert.equal(controller.getPreview(), null);
});
