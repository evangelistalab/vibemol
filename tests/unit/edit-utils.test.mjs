import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';

const context = loadGlobalModule('assets/app/js/edit-utils.js');
const { classifyBondHitSectionFromPoints } = context.window.VibeMolEditUtils || {};

test('edit-utils classifies hits near endpoint A, center, and endpoint B by thirds', () => {
  assert.equal(typeof classifyBondHitSectionFromPoints, 'function');

  const nearA = classifyBondHitSectionFromPoints({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 });
  const center = classifyBondHitSectionFromPoints({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, { x: 1.5, y: 0, z: 0 });
  const nearB = classifyBondHitSectionFromPoints({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, { x: 2.5, y: 0, z: 0 });

  assert.equal(nearA.section, 'nearA');
  assert.equal(nearA.t, 1 / 6);
  assert.equal(center.section, 'center');
  assert.equal(center.t, 0.5);
  assert.equal(nearB.section, 'nearB');
  assert.equal(nearB.t, 5 / 6);
});

test('edit-utils clamps off-segment hits and handles degenerate bonds conservatively', () => {
  const clampedA = classifyBondHitSectionFromPoints({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, { x: -9, y: 0, z: 0 });
  const clampedB = classifyBondHitSectionFromPoints({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, { x: 99, y: 0, z: 0 });
  const degenerate = classifyBondHitSectionFromPoints({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 });

  assert.equal(clampedA.section, 'nearA');
  assert.equal(clampedA.t, 0);
  assert.equal(clampedB.section, 'nearB');
  assert.equal(clampedB.t, 1);
  assert.equal(degenerate.section, 'center');
  assert.equal(degenerate.t, 0.5);
});
