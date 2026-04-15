import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';

function loadHelpers() {
  const context = loadGlobalModule('assets/app/js/trajectory-video.js');
  return context.VibeMolTrajectoryVideo;
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

test('trajectory video crop rect clamps to bounds and minimum size', () => {
  const helpers = loadHelpers();
  assert.deepEqual(
    normalize(helpers.normalizeTrajectoryVideoCropRect(
      { x: -20, y: 999, width: 40, height: 20 },
      { width: 300, height: 200 },
    )),
    { x: 0, y: 110, width: 160, height: 90 },
  );
});

test('trajectory video default crop is centered and respects viewport limits', () => {
  const helpers = loadHelpers();
  const rect = normalize(helpers.createDefaultTrajectoryVideoCropRect({ width: 800, height: 500 }));
  assert.deepEqual(rect, { x: 120, y: 93, width: 560, height: 315 });
});

test('trajectory video overlay layout flips chrome inside the frame when edges overflow', () => {
  const helpers = loadHelpers();
  const layout = normalize(helpers.resolveTrajectoryVideoOverlayLayout(
    { x: 260, y: 10, width: 120, height: 170 },
    { width: 400, height: 200 },
    { dimensionWidth: 70, dimensionHeight: 20, actionsWidth: 120, actionsHeight: 28 },
  ));
  assert.deepEqual(layout.rect, { x: 240, y: 10, width: 160, height: 170 });
  assert.deepEqual(layout.dimensions, { left: 324, top: 16, inside: true });
  assert.deepEqual(layout.actions, { left: 320, top: 0, above: true });
});
