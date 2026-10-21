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

function recordingController() {
  class Element {
    constructor() {
      this.events = {}; this.attrs = {}; this.dataset = {}; this.style = {};
      this.classList = { toggle() {}, remove() {} };
    }
    addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
    fire(name, fields = {}) {
      const event = { button: 0, detail: 0, preventDefault() {}, stopPropagation() {}, ...fields };
      for (const fn of this.events[name] || []) fn(event);
    }
    setAttribute(key, value) { this.attrs[key] = value; }
    removeAttribute(key) { delete this.attrs[key]; }
    getBoundingClientRect() { return { width: 20, height: 20 }; }
  }
  class Canvas { getContext() { return { clearRect() {}, drawImage() {} }; } captureStream() { return {}; } }
  const downloads = [], recorders = [];
  class Recorder {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; recorders.push(this); }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive'; this.ondataavailable?.({ data: { size: 1 } }); this.onstop?.();
    }
  }
  const context = loadGlobalModule('assets/app/js/trajectory-video.js', { globals: {
    HTMLCanvasElement: Canvas, MediaRecorder: Recorder,
    Blob: class {}, URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    document: { createElement: name => name === 'canvas' ? new Canvas() : { click() { downloads.push('webm'); } } },
  } });
  const elements = Object.fromEntries(['saveBtn', 'cropOverlayEl', 'cropFrameEl', 'cropDimensionsEl',
    'cropActionsEl', 'cropStartBtnEl', 'cropCancelBtnEl'].map(name => [name, new Element()]));
  elements.sourceCanvasEl = new Canvas();
  let controller;
  controller = context.VibeMolTrajectoryVideo.createCanvasVideoExportController({
    elements, getOverlayBounds: () => ({ width: 800, height: 600 }),
    getActiveInfo: () => ({ enabled: true }),
    readRendererViewportMetrics: () => ({ bufferWidth: 800, bufferHeight: 600 }),
    cssRectToBufferRect: () => ({ x: 0, y: 0, width: 400, height: 300 }),
    hideActiveTooltip() {}, setButtonGlyph() {}, setTooltipText() {},
    syncPrimaryControls: () => controller?.syncUi(),
    getPlaybackState: () => assert.fail('The exporter must not consume playback mirrors'),
    setPlaybackState() {}, canResumePlayback() {}, getCaptureFps: () => 30,
    startRecordingSequence() {}, resolveRecordingAdvance: () => ({ stopPlayback: true }),
  });
  const start = () => { controller.openCropOverlay(); controller.startRecording(); assert.equal(controller.getMode(), 'recording'); };
  const finish = () => { controller.resolveAdvance(); controller.copyFrameAfterRender(); };
  const idle = () => {
    assert.equal(controller.getMode(), 'idle');
    assert.equal(elements.cropOverlayEl.dataset.state, 'idle');
    assert.equal(elements.cropOverlayEl.attrs['aria-hidden'], 'true');
  };
  const freshSave = (source = 'pointer') => {
    if (source === 'pointer') elements.saveBtn.fire('pointerdown');
    if (source === 'keyboard') elements.saveBtn.fire('keydown', { key: ' ' });
    elements.saveBtn.fire('click', { detail: source === 'pointer' ? 1 : 0 });
    assert.equal(controller.getMode(), 'selecting');
    assert.equal(elements.cropOverlayEl.dataset.state, 'selecting');
    assert.equal(elements.cropOverlayEl.attrs['aria-hidden'], 'false');
  };
  return { ...elements, controller, start, finish, idle, freshSave, downloads, recorders };
}

for (const source of ['pointer', 'Space', 'Enter']) {
  test(`video activation retains ${source} Stop intent across completion and permits fresh Save`, () => {
    const f = recordingController(); f.start();
    if (source === 'pointer') f.saveBtn.fire('pointerdown');
    else f.saveBtn.fire('keydown', { key: source === 'Space' ? ' ' : 'Enter' });
    f.finish(); f.idle();
    f.saveBtn.fire('click', { detail: source === 'pointer' ? 1 : 0 });
    f.idle(); assert.equal(f.downloads.length, 1);
    f.freshSave(source === 'pointer' ? 'pointer' : 'keyboard');
  });
}

test('video activation click-only starts atomically and physical clicks require a press', () => {
  const f = recordingController(); f.start();
  f.saveBtn.fire('click', { detail: 1 }); assert.equal(f.controller.getMode(), 'recording');
  f.saveBtn.fire('click'); f.idle(); assert.equal(f.downloads.length, 1);
  f.freshSave('click-only');
});

test('video activation early Stop dispatches once and repeated Enter cannot start Save', () => {
  const f = recordingController(); f.start();
  f.saveBtn.fire('keydown', { key: 'Enter' }); f.saveBtn.fire('click'); f.idle();
  let prevented = false;
  f.saveBtn.fire('keydown', { key: 'Enter', repeat: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(f.downloads.length, 1); f.idle();
  f.freshSave();
});

for (const cancel of ['pointercancel', 'blur', 'Escape']) {
  test(`video activation clears ${cancel} intent without swallowing a later Save`, () => {
    const f = recordingController(); f.start(); f.saveBtn.fire('pointerdown');
    if (cancel === 'Escape') f.saveBtn.fire('keydown', { key: 'Escape' });
    else f.saveBtn.fire(cancel);
    f.finish(); f.saveBtn.fire('click', { detail: 1 }); f.idle();
    f.freshSave();
  });
}
