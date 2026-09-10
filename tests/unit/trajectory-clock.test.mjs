import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';
const clock = loadGlobalModule('assets/app/js/trajectory-clock.js').VibeMolTrajectoryClock;

test('clock preserves elapsed remainder and catches up after delayed frames', () => {
  const state = { frame: 0, fps: 10, loop: true, playing: true, lastStepMs: 100 };
  const tick = clock.advance(state, 10, 455);
  assert.equal(tick.frame, 3);
  assert.equal(tick.lastStepMs, 400);
  assert.equal(clock.advance({ ...state, ...tick }, 10, 500).frame, 4);
  assert.equal(state.frame, 0);
});

test('looping and non-looping trajectories share the clock with different endpoint rules', () => {
  const state = { frame: 2, fps: 10, playing: true, lastStepMs: 100 };
  const loop = clock.advance({ ...state, loop: true }, 3, 350);
  const hold = clock.advance({ ...state, loop: false }, 3, 350);
  assert.equal(loop.frame, 1);
  assert.equal(loop.playing, true);
  assert.equal(hold.frame, 2);
  assert.equal(hold.playing, false);
  assert.equal(hold.lastStepMs, 0);
  assert.equal(hold.rawFrame, 4);
});

test('master maps unequal trajectory lengths and holds non-looping followers', () => {
  assert.deepEqual([clock.mapFrame(4, 3, true), clock.mapFrame(4, 3, false), clock.mapFrame(4, 7, true)], [1, 2, 4]);
  assert.equal(clock.mapFrame(8, 0), 0);
});

test('pause/resume and backwards time do not accumulate a jump', () => {
  const state = { frame: 2, fps: 12, loop: true, playing: false, lastStepMs: 100 };
  const paused = clock.advance(state, 5, 5000);
  assert.equal(paused.lastStepMs, 0);
  const resumed = clock.advance({ ...state, ...paused, playing: true }, 5, 6000);
  assert.equal(resumed.advanced, false);
  assert.equal(resumed.frame, 2);
  assert.equal(clock.advance({ ...state, playing: true }, 5, 50).advanced, false);
});
