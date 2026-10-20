"""Observe Figure's existing preview deadline without changing its acceptance."""
import json
from pathlib import Path
import time


PREVIEW_TIMEOUT_MS = 30_000
PREVIEW_PREDICATE = '()=>document.querySelector("#figurePanel img").src.startsWith("blob:")'

INSTALL_OBSERVER = r'''() => {
  const startedAtMs = performance.now(), longTasks = [], imageHistory = [];
  let droppedLongTasks = 0, droppedImages = 0, observerError = null;
  let taskObserver = null, timer = null, wait = null, deadlineSample = null;
  const image = () => {
    const img = document.querySelector('#figurePanel img');
    return img ? {present: true, src: img.src, srcAttribute: img.getAttribute('src'),
      hidden: img.hidden, complete: img.complete, naturalWidth: img.naturalWidth} : {present: false};
  };
  const sample = reason => {
    const row = {observedAtMs: performance.now(), reason, image: image()};
    if (imageHistory.length < 512) imageHistory.push(row); else droppedImages++;
    return row;
  };
  const collect = entries => {
    for (const e of entries) {
      if (e.startTime + e.duration < startedAtMs) continue;
      if (longTasks.length < 4096) longTasks.push({startTime: e.startTime,
        duration: e.duration, name: e.name, entryType: e.entryType});
      else droppedLongTasks++;
    }
  };
  try {
    taskObserver = new PerformanceObserver(list => collect(list.getEntries()));
    taskObserver.observe({type: 'longtask', buffered: true});
  } catch (error) { observerError = String(error); }
  const imageObserver = new MutationObserver(() => sample('image mutation delivered'));
  imageObserver.observe(document.querySelector('#figurePanel'), {subtree: true,
    childList: true, attributes: true, attributeFilter: ['src', 'hidden']});
  sample('prelude start');
  window.__vmFigurePreviewDiagnostics = {
    begin(timeoutMs) {
      const before = sample('wait start');
      wait = {startedAtMs: before.observedAtMs, timeoutMs,
        deadlineAtMs: before.observedAtMs + timeoutMs};
      timer = setTimeout(() => {
        const state = sample('deadline callback');
        deadlineSample = {...state, scheduledAtMs: wait.deadlineAtMs,
          latenessMs: state.observedAtMs - wait.deadlineAtMs};
      }, timeoutMs);
      return wait;
    },
    finish() {
      if (taskObserver) { collect(taskObserver.takeRecords()); taskObserver.disconnect(); }
      imageObserver.disconnect(); clearTimeout(timer);
      const readback = sample('readback');
      return {preludeStartedAtMs: startedAtMs, wait, deadlineSample, readback,
        readbackAfterDeadlineMs: readback.observedAtMs - wait.deadlineAtMs,
        lastImageObservationBeforeDeadline: imageHistory.filter(row =>
          row.observedAtMs <= wait.deadlineAtMs).slice(-1)[0] || null,
        longTasks, longTasksCrossingDeadline: longTasks.filter(e =>
          e.startTime < wait.deadlineAtMs && e.startTime + e.duration >= wait.deadlineAtMs),
        imageHistory, droppedLongTasks, droppedImages, observerError,
        samplingCaveat: 'A blocked renderer delays the deadline callback. Use actual observation times and lateness; a late readback is not an exact deadline snapshot. Image mutation times are observer delivery times.'};
    }
  };
}'''


def install_preview_diagnostics(page):
    """Start before the fixture/export prelude; observe only, without extra frames."""
    page.evaluate(INSTALL_OBSERVER)


def wait_for_preview(page, artifact_dir):
    """Keep the original predicate/deadline and preserve its original exception."""
    anchor_started = time.monotonic()
    anchor = page.evaluate('timeout => window.__vmFigurePreviewDiagnostics.begin(timeout)',
                           PREVIEW_TIMEOUT_MS)
    started, wall_started = time.monotonic(), time.time()

    def capture(outcome, error=None):
        caught = time.monotonic()
        report = dict(outcome=outcome, predicate=PREVIEW_PREDICATE,
                      timeoutMs=PREVIEW_TIMEOUT_MS, browserAnchor=anchor,
                      clockAlignment='Browser timer is armed just before the wait RPC; anchorCallElapsedMs records that alignment uncertainty.',
                      anchorCallElapsedMs=(started-anchor_started)*1000,
                      waitElapsedMs=(caught-started)*1000,
                      wallWaitElapsedMs=(time.time()-wall_started)*1000)
        if error is not None:
            report.update(exception=type(error).__name__, error=str(error))
        readback_started = time.monotonic()
        try:
            report['browser'] = page.evaluate('() => window.__vmFigurePreviewDiagnostics.finish()')
        except Exception as diagnostic_error:
            report['readbackError'] = str(diagnostic_error)
        report['readbackQueryElapsedMs'] = (time.monotonic()-readback_started)*1000
        try:
            path = Path(artifact_dir) / 'figure-preview-wait.json'
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(report, indent=2)+'\n')
        except OSError as artifact_error:
            report['artifactWriteError'] = str(artifact_error)
        print('[figure-preview-wait] '+json.dumps(report), flush=True)

    try:
        result = page.wait_for_function(PREVIEW_PREDICATE, timeout=PREVIEW_TIMEOUT_MS)
    except Exception as error:
        capture('failed', error)
        raise
    capture('passed')
    return result
