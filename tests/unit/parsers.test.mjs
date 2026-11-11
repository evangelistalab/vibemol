import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadGlobalModule } from './load-global-module.mjs';

const plain = (value) => JSON.parse(JSON.stringify(value));

function loadParsers() {
  const context = loadGlobalModule('assets/app/js/parsers.js', {
    globals: {
      ATOM_SYMBOL_TO_Z: {
        H: 1,
        C: 6,
        N: 7,
        O: 8,
      },
    },
  });
  return context.window.VibeMolParsers;
}

test('parseXYZ handles a minimal XYZ structure', () => {
  const parsers = loadParsers();
  const xyz = `2\nwater\nH 0.0 0.0 0.0\nO 0.0 0.0 0.96\n`;
  const vol = parsers.parseXYZ(xyz);

  assert.equal(vol.kind, 'xyz');
  assert.equal(vol.natoms, 2);
  assert.equal(vol.units, 'angstrom');
  assert.equal(vol.atoms[0].Z, 1);
  assert.equal(vol.atoms[1].Z, 8);
});

test('XYZ reads Fortran exponents in the initial structure and trajectory frames', () => {
  const { parseXYZ } = loadParsers();
  const xyz = '1\nFirst frame\nH 9.6D-01 -2.5d+00 1.0E-2\n1\nSecond frame\nH -3d-1 2D+1 4e-1\n';
  const vol = parseXYZ(xyz);

  assert.deepEqual(plain(vol.atoms), [{ Z: 1, x: 0.96, y: -2.5, z: 0.01, formalCharge: 0 }]);
  assert.deepEqual(Array.from(vol.trajectory.frames, frame => Array.from(frame)), [
    [0.96, -2.5, 0.01].map(Math.fround),
    [-0.3, 20, 0.4].map(Math.fround),
  ]);
  assert.throws(() => parseXYZ(xyz.replace('9.6D-01', '9.6D-')), /coordinates must be numeric/);
});

test('parseCube handles a minimal 1x1x1 cube', () => {
  const parsers = loadParsers();
  const cube = [
    'Minimal cube',
    'density (0.05, 0.10)',
    '1 0.0 0.0 0.0',
    '1 1.0 0.0 0.0',
    '1 0.0 1.0 0.0',
    '1 0.0 0.0 1.0',
    '1 0.0 0.0 0.0 0.0',
    '0.125',
  ].join('\n');
  const vol = parsers.parseCube(cube);

  assert.equal(vol.natoms, 1);
  assert.deepEqual(plain(vol.nxyz), [1, 1, 1]);
  assert.equal(vol.units, 'bohr');
  assert.equal(vol.isoHint, 0.05);
  assert.equal(vol.data.length, 1);
  assert.equal(vol.data[0], 0.125);
});

test('parseTwoComponentCube handles a minimal 2C cube', () => {
  const parsers = loadParsers();
  const cube2c = [
    'Minimal 2C cube',
    'spinor (0.02, 0.04)',
    '1 0.0 0.0 0.0',
    '1 1.0 0.0 0.0',
    '1 0.0 1.0 0.0',
    '1 0.0 0.0 1.0',
    '1 0.0 0.0 0.0 0.0',
    '0.1 0.2 0.3 0.4',
  ].join('\n');
  const vol = parsers.parseTwoComponentCube(cube2c);

  assert.equal(vol.isTwoComponent, true);
  assert.ok(Math.abs(vol.alphaRe[0] - 0.1) < 1e-6);
  assert.ok(Math.abs(vol.alphaIm[0] - 0.2) < 1e-6);
  assert.ok(Math.abs(vol.betaRe[0] - 0.3) < 1e-6);
  assert.ok(Math.abs(vol.betaIm[0] - 0.4) < 1e-6);
});

test('both cube formats read Fortran exponents in headers and voxel values', () => {
  const { parseCube, parseTwoComponentCube } = loadParsers();
  const header = [
    'Fortran cube',
    'density (5.0D-02, 1.0d-01)',
    '1 1.0D-01 0 -2.0d-01',
    '1 1.2D+00 0 0',
    '1 0 1.3d+00 0',
    '1 0 0 1.4E+00',
    '1 1.0D+00 9.6D-01 2.0d-02 0',
  ].join('\n');
  const cube = parseCube(header + '\n1.0D-01');
  const spinor = parseTwoComponentCube(header + '\n1.0D-01 -2.0d-01 3.0E-01 4.0D-01');

  for (const vol of [cube, spinor]) {
    assert.equal(vol.isoHint, 0.05);
    assert.deepEqual(plain(vol.origin), [0.1, 0, -0.2]);
    assert.deepEqual(plain(vol.axes), [[1.2, 0, 0], [0, 1.3, 0], [0, 0, 1.4]]);
    assert.deepEqual(plain(vol.atoms), [{ Z: 1, x: 0.96, y: 0.02, z: 0, formalCharge: 0 }]);
    assert.equal(vol.data[0], Math.fround(0.1));
  }
  assert.equal(spinor.isTwoComponent, true);
  assert.deepEqual([spinor.alphaRe[0], spinor.alphaIm[0], spinor.betaRe[0], spinor.betaIm[0]],
    [0.1, -0.2, 0.3, 0.4].map(Math.fround));
  assert.throws(() => parseCube(header + '\n1.0D-'), /Data size mismatch\. Expected 1, got 0/);
});

test('parseMolden handles a compact Molden payload', () => {
  const parsers = loadParsers();
  const molden = [
    '[Molden Format]',
    '[Atoms] Angs',
    'H 1 1 0.0 0.0 0.0',
    '[GTO]',
    '1 0',
    's 1 1.0',
    '  1.0 1.0',
    '[MO]',
    'Sym= A1',
    'Ene= -0.5',
    'Spin= Alpha',
    'Occup= 2.0',
    '1 1.0',
  ].join('\n');
  const vol = parsers.parseMolden(molden);

  assert.equal(vol.kind, 'molden');
  assert.equal(vol.natoms, 1);
  assert.equal(vol.molden.moCount, 1);
  assert.equal(vol.molden.basisCount, 1);
  assert.equal(vol.molden.mos[0].coefficients[0], 1.0);
});

test('Psi4 geometry uses the bohr reference instead of the last finite-difference displacement', () => {
  const text = readFileSync(new URL('../fixtures/psi4-bohr-frequencies.dat', import.meta.url), 'utf8');
  const geometry = loadParsers().parsePsi4Geometry(text.split('\n'), 'output.dat');
  assert.equal(geometry.units, 'bohr');
  assert.deepEqual(plain(geometry.atomSymbols), ['C', 'H', 'H', 'H']);
  assert.equal(geometry.coords[1][2], 1.804854386616);
  assert.equal(geometry.coords[3][2], 0);
});

test('Psi4 geometry follows the last analysis, accepts indexed angstrom rows, and ignores later jobs', () => {
  const lines = [
    'Geometry (in Bohr), charge = 0, multiplicity = 1:', '', 'H 0 0 8', '',
    '==> Harmonic Vibrational Analysis <==',
    'Geometry (in Angstroms), charge = 0, multiplicity = 1:', '',
    'Center X Y Z Mass', '------------------',
    '1 H 1.0D-2 0 -2.0E-1 1.0', '2 O 0 0 9.6D-1 16.0', '',
    '==> Harmonic Vibrational Analysis <==',
    'Geometry (in Bohr), charge = 0, multiplicity = 1:', '', 'C 9 9 9', '',
  ];
  const geometry = loadParsers().parsePsi4Geometry(lines, 'two-jobs.out');
  assert.equal(geometry.units, 'angstrom');
  assert.deepEqual(plain(geometry.atomSymbols), ['H', 'O']);
  assert.deepEqual(plain(geometry.coords), [[0.01, 0, -0.2], [0, 0, 0.96]]);
});

test('Psi4 geometry rejects missing units, missing analysis, and malformed coordinates', () => {
  const parse = text => loadParsers().parsePsi4Geometry(text.split('\n'), 'bad.dat');
  assert.throws(() => parse('==> Harmonic Vibrational Analysis <=='), /could not find a Geometry/);
  assert.throws(() => parse('Geometry (in Bohr)\nH 0 0 0'), /missing.*Harmonic Vibrational Analysis/);
  assert.throws(() => parse('Geometry (in nm)\nH 0 0 0\n\n==> Harmonic Vibrational Analysis <=='), /unsupported geometry units/);
  for (const row of ['H 0 NaN 0', 'H 1 2', 'Zz 0 0 0']) {
    assert.throws(() => parse(`Geometry (in Bohr)\n${row}\n\n==> Harmonic Vibrational Analysis <==`), /malformed geometry row/);
  }
});
