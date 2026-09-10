(function (global) {
  'use strict';

  function normalize(traj, frameCount) {
    const count = Math.max(0, Number(frameCount) | 0);
    const value = Number.isFinite(Number(traj.currentFrame)) ? Number(traj.currentFrame) : Number(traj.frameIndex);
    const frame = count ? Math.max(0, Math.min(count - 1, Number(value) | 0)) : 0;
    return {
      frameIndex: frame, currentFrame: frame,
      fps: Math.max(1, Math.min(120, Math.round(Number(traj.fps) || 12))),
      loop: traj.loop !== false, playing: !!traj.playing, syncEnabled: !!traj.syncEnabled,
      _lastStepMs: Math.max(0, Number(traj._lastStepMs) || 0),
    };
  }

  function mapFrame(frame, frameCount, loop = true) {
    const count = Math.max(0, Number(frameCount) | 0);
    if (!count) return 0;
    const index = Math.max(0, Math.floor(Number(frame) || 0));
    return loop ? index % count : Math.min(index, count - 1);
  }

  // Pure clock calculation. Applying coordinates, recording, and DOM updates
  // remain outside this module. Retaining the remainder prevents FPS drift.
  function advance(clock, frameCount, nowMs) {
    const result = { frame: clock.frame, rawFrame: clock.frame, playing: !!clock.playing, lastStepMs: clock.lastStepMs, advanced: false };
    if (!clock.playing || frameCount <= 0) return Object.assign(result, { lastStepMs: 0 });
    if (!(clock.lastStepMs > 0) || nowMs < clock.lastStepMs) return Object.assign(result, { lastStepMs: nowMs });
    const fps = Math.max(1, Math.min(120, Math.round(Number(clock.fps) || 12)));
    const interval = 1000 / fps;
    const steps = Math.floor((nowMs - clock.lastStepMs) / interval + 1e-10);
    if (steps < 1) return result;
    result.rawFrame = (Number(clock.frame) || 0) + steps;
    result.frame = mapFrame(result.rawFrame, frameCount, clock.loop !== false);
    result.playing = clock.loop !== false || result.rawFrame < frameCount;
    result.lastStepMs = result.playing ? clock.lastStepMs + steps * interval : 0;
    result.advanced = true;
    return result;
  }

  global.VibeMolTrajectoryClock = Object.freeze({ normalize, mapFrame, advance });
})(typeof window !== 'undefined' ? window : globalThis);
