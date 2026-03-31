import test from 'node:test';
import assert from 'node:assert/strict';
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
