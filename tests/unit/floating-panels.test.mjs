import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';

const { VibeMolFloatingPanels: panels } = loadGlobalModule('assets/app/js/floating-panels.js', {
  globals: { addEventListener() {} },
});

test('floating panels keep the full panel reachable at all viewport edges', () => {
  for (const [width, height, vw, vh] of [[340, 220, 1440, 900], [366, 600, 390, 640], [100, 60, 200, 100]]) {
    for (const left of [-999, 12, 150, 9999]) for (const top of [-999, 12, 150, 9999]) {
      const pos = panels.constrain(left, top, width, height, vw, vh);
      assert.ok(pos.left >= 12 && pos.top >= 12);
      assert.ok(pos.left + width <= vw - 12 && pos.top + height <= vh - 12);
    }
  }
});

test('an oversized popup retains its reachable top-left handle while CSS limits its size', () => {
  assert.equal(panels.constrain(200, 100, 900, 800, 390, 640).left, 12);
  assert.equal(panels.constrain(200, 100, 900, 800, 390, 640).top, 12);
});
