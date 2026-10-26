"""Exact Figure blob predicate under the shared responsive/wall budget."""
import contextlib
import json
from pathlib import Path
import time
from assertion_contract import STALL_RUNTIME,HARD_WALL_MS,wait_for_budget,budget_ms


PREVIEW_TIMEOUT_MS = budget_ms('figure-preview')
PREVIEW_PREDICATE = '()=>document.querySelector("#figurePanel img").src.startsWith("blob:")'

INSTALL_OBSERVER = r'''() => {
  const stalls=(__STALL_RUNTIME__)();
  let budget=null;
  const startedAtMs = performance.now(), imageHistory = [];
  let droppedImages = 0;
  let timer = null, wait = null, deadlineSample = null;
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
  const imageObserver = new MutationObserver(() => sample('image mutation delivered'));
  imageObserver.observe(document.querySelector('#figurePanel'), {subtree: true,
    childList: true, attributes: true, attributeFilter: ['src', 'hidden']});
  sample('prelude start');
  window.__vmFigurePreviewDiagnostics = {
    begin({timeoutMs,hardWallMs}) {
      const before = sample('wait start');
      wait = {startedAtMs: before.observedAtMs, timeoutMs,
        deadlineAtMs: before.observedAtMs + timeoutMs};
      budget=stalls.budget(before.observedAtMs,timeoutMs,hardWallMs);
      timer = setTimeout(() => {
        const state = sample('deadline callback');
        deadlineSample = {...state, scheduledAtMs: wait.deadlineAtMs,
          latenessMs: state.observedAtMs - wait.deadlineAtMs};
      }, timeoutMs);
      return wait;
    },
    step(ready) {return budget.step(ready);},
    finish() {
      const timing=budget.result?.timing || budget.sample();stalls.dispose();
      imageObserver.disconnect(); clearTimeout(timer);
      const readback = sample('readback');
      return {...timing,preludeStartedAtMs: startedAtMs, wait, deadlineSample, readback,
        readbackAfterDeadlineMs: readback.observedAtMs - wait.deadlineAtMs,
        lastImageObservationBeforeDeadline: imageHistory.filter(row =>
          row.observedAtMs <= wait.deadlineAtMs).slice(-1)[0] || null,
        imageHistory, droppedImages,
        samplingCaveat: 'A blocked renderer delays the deadline callback. Use actual observation times and lateness; a late readback is not an exact deadline snapshot. Image mutation times are observer delivery times.'};
    }
  };
}'''


def install_preview_diagnostics(page):
    """Start before the fixture/export prelude; observe only, without extra frames."""
    page.evaluate(INSTALL_OBSERVER.replace('__STALL_RUNTIME__',STALL_RUNTIME))


def wait_for_preview(page, artifact_dir):
    """Keep the exact blob predicate and report both responsive and hard-wall limits."""
    anchor_started = time.monotonic()
    anchor = page.evaluate('config => window.__vmFigurePreviewDiagnostics.begin(config)',
                           dict(timeoutMs=PREVIEW_TIMEOUT_MS,hardWallMs=HARD_WALL_MS))
    receipt=page.evaluate_handle('()=>window.__vmFigurePreviewDiagnostics')
    budget_report=dict(_receipt=receipt,timeoutMs=PREVIEW_TIMEOUT_MS,hardWallMs=HARD_WALL_MS)
    started, wall_started = time.monotonic(), time.time()

    def capture(outcome, error=None):
        caught = time.monotonic()
        report = dict(outcome=outcome, predicate=PREVIEW_PREDICATE,
                      timeoutMs=PREVIEW_TIMEOUT_MS, hardWallMs=HARD_WALL_MS,browserAnchor=anchor,
                      budgetResult=budget_report.get('budgetResult'),
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
        result = wait_for_budget(page,PREVIEW_PREDICATE,budget_report)
    except Exception as error:
        capture('failed', error)
        raise
    else:
        capture('passed')
        return result
    finally:
        with contextlib.suppress(Exception):receipt.dispose()
