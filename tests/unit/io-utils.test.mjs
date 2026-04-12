import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';

function loadIoUtils() {
  return loadGlobalModule('assets/app/js/io-utils.js', {
    globals: {
      ATOM_SYMBOL_TO_Z: {
        H: 1,
        HE: 2,
        C: 6,
        N: 7,
        O: 8,
        CL: 17,
        BR: 35,
        FE: 26,
      },
      ATOM_Z_TO_DATA: {
        1: { symbol: 'H' },
        2: { symbol: 'He' },
        6: { symbol: 'C' },
        7: { symbol: 'N' },
        8: { symbol: 'O' },
        17: { symbol: 'Cl' },
        26: { symbol: 'Fe' },
        35: { symbol: 'Br' },
      },
    },
  });
}

test('io-utils detects full XYZ text', () => {
  const context = loadIoUtils();
  const detected = context.window.VibeMolIOUtils.detectAndNormalizeXyzText(`
3
water
O 0.000 0.000 0.000
H 0.758 0.000 0.504
H -0.758 0.000 0.504
`);

  assert.ok(detected);
  assert.equal(detected.atomCount, 3);
  assert.equal(detected.wrapped, false);
  assert.match(detected.xyzText, /^3\nwater\nO /);
});

test('io-utils wraps coordinates-only XYZ text into XYZ', () => {
  const context = loadIoUtils();
  const detected = context.window.VibeMolIOUtils.detectAndNormalizeXyzText(`
Fe 0.0 0.0 0.0
Cl 1.2 0.0 0.0
Br -1.2 0.0 0.0
`, { comment: 'Clipboard import' });

  assert.ok(detected);
  assert.equal(detected.atomCount, 3);
  assert.equal(detected.wrapped, true);
  assert.equal(
    detected.xyzText,
    '3\nClipboard import\nFe 0.0 0.0 0.0\nCl 1.2 0.0 0.0\nBr -1.2 0.0 0.0\n'
  );
});

test('io-utils detects full XYZ text with atomic numbers in column 1', () => {
  const context = loadIoUtils();
  const detected = context.window.VibeMolIOUtils.detectAndNormalizeXyzText(`
3
water by Z
8 0.000 0.000 0.000
1 0.758 0.000 0.504
1 -0.758 0.000 0.504
`);

  assert.ok(detected);
  assert.equal(detected.atomCount, 3);
  assert.equal(detected.wrapped, false);
  assert.equal(
    detected.xyzText,
    '3\nwater by Z\nO 0.000 0.000 0.000\nH 0.758 0.000 0.504\nH -0.758 0.000 0.504\n'
  );
});

test('io-utils preserves multi-frame XYZ trajectory text', () => {
  const context = loadIoUtils();
  const detected = context.window.VibeMolIOUtils.detectAndNormalizeXyzText(`
2
frame 1
C 0.0 0.0 0.0
H 0.0 0.0 1.0
2
frame 2
C 0.1 0.0 0.0
H 0.1 0.0 1.0
`);

  assert.ok(detected);
  assert.equal(detected.atomCount, 2);
  assert.equal(detected.wrapped, false);
  assert.equal(
    detected.xyzText,
    '2\nframe 1\nC 0.0 0.0 0.0\nH 0.0 0.0 1.0\n2\nframe 2\nC 0.1 0.0 0.0\nH 0.1 0.0 1.0\n'
  );
});

test('io-utils wraps coordinates-only XYZ text with atomic numbers into XYZ', () => {
  const context = loadIoUtils();
  const detected = context.window.VibeMolIOUtils.detectAndNormalizeXyzText(`
26 0.0 0.0 0.0
17 1.2 0.0 0.0
35 -1.2 0.0 0.0
`, { comment: 'Clipboard import' });

  assert.ok(detected);
  assert.equal(detected.atomCount, 3);
  assert.equal(detected.wrapped, true);
  assert.equal(
    detected.xyzText,
    '3\nClipboard import\nFe 0.0 0.0 0.0\nCl 1.2 0.0 0.0\nBr -1.2 0.0 0.0\n'
  );
});

test('io-utils ignores non-XYZ text', () => {
  const context = loadIoUtils();
  const detected = context.window.VibeMolIOUtils.detectAndNormalizeXyzText('hello world\nnot a structure');

  assert.equal(detected, null);
});
