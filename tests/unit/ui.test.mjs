import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';

const BOHR_TO_ANG = 0.52917721092;
const atomData = { 1: { symbol: 'H' }, 6: { symbol: 'C' }, 8: { symbol: 'O' } };

function modules() {
  return loadGlobalModules(['assets/app/js/ui.js', 'assets/app/js/io-utils.js', 'assets/app/js/parsers.js'], {
    globals: { ATOM_Z_TO_DATA: atomData, ATOM_SYMBOL_TO_Z: { H: 1, C: 6, O: 8 } },
  });
}

test('headerless XYZ copies round-trip through the paste parser with angstrom coordinates', () => {
  const { VibeMolUI: ui, VibeMolIOUtils: io, VibeMolParsers: parsers } = modules();
  const record = { name: 'geometry.cube', vol: { title: 'A title that must not be copied', units: 'bohr', atoms: [
    { Z: 8, x: 2, y: -3, z: 4 }, { Z: 1, x: 3.5, y: -2.1, z: 4 },
  ] } };
  const text = ui.volumeToXYZ(record, BOHR_TO_ANG, atomData, 'angstrom', { includeHeader: false });
  assert.equal(text, 'O 1.058354 -1.587532 2.116709\nH 1.852120 -1.111272 2.116709');
  const detected = io.detectAndNormalizeXyzText(text);
  assert.equal(detected.atomCount, 2);
  const restored = parsers.parseXYZ(detected.xyzText);
  assert.equal(restored.units, 'angstrom');
  restored.atoms.forEach((atom, index) => {
    assert.equal(atom.Z, record.vol.atoms[index].Z);
    for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(atom[axis] - record.vol.atoms[index][axis] * BOHR_TO_ANG) < 0.00000051);
  });
});

test('selected coordinate rows retain source order and the standard XYZ export keeps its header', () => {
  const { VibeMolUI: ui } = modules();
  const record = { name: 'water.xyz', vol: { units: 'angstrom', atoms: [
    { Z: 8, x: 2, y: 3, z: 4 }, { Z: 1, x: 2.7, y: 3, z: 4.5 }, { Z: 1, x: 1.3, y: 3, z: 4.5 },
  ] } };
  const options = { includeHeader: false, atomIndices: [2, 1, 2, -1, 10] };
  assert.equal(ui.volumeToXYZ(record, BOHR_TO_ANG, atomData, 'angstrom', options),
    'H 2.700000 3.000000 4.500000\nH 1.300000 3.000000 4.500000');
  assert.equal(ui.volumeToXYZ(record, BOHR_TO_ANG, atomData, 'angstrom'),
    '3\nwater.xyz\nO 2.000000 3.000000 4.000000\nH 2.700000 3.000000 4.500000\nH 1.300000 3.000000 4.500000');
  assert.equal(ui.volumeToXYZ(null, BOHR_TO_ANG, atomData, 'angstrom', options), '');
  assert.equal(ui.volumeToXYZ({ vol: { atoms: [] } }, BOHR_TO_ANG, atomData, 'angstrom', { includeHeader: false }), '');
});
