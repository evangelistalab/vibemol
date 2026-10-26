"""Exercise deadline evidence with synthetic clocks; never launch the Figure suite."""
import contextlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tests/e2e'))
from figure_preview_diagnostics import INSTALL_OBSERVER, PREVIEW_PREDICATE, wait_for_preview, STALL_RUNTIME


class FakePage:
    def __init__(self, *, wait_error=None, readback_error=None):
        self.wait_error, self.readback_error = wait_error, readback_error
        self.waits, self.evaluations = [], []
        self.handle = type('Handle',(),{'dispose':lambda self:None})()
        self.result=dict(done=True,passed=True,timing=dict(withinBudget=True))

    def evaluate(self, expression, arg=None):
        self.evaluations.append((expression, arg))
        if 'begin(' in expression:
            return dict(startedAtMs=1000, timeoutMs=arg['timeoutMs'], deadlineAtMs=31000)
        if 'step(false)' in expression:return self.result
        if self.readback_error:
            raise self.readback_error
        return dict(deadlineSample=dict(observedAtMs=31000, image=dict(src='')),
                    readback=dict(observedAtMs=42000, image=dict(src='blob:later')))

    def evaluate_handle(self,*args):return self.handle

    def wait_for_function(self, expression, **options):
        self.waits.append((expression, options))
        if self.wait_error:
            raise self.wait_error
        return self.handle


NODE_CLOCK = r'''
const assert = require('node:assert/strict'), vm = require('node:vm');
let now = 0, timer, timerCleared = false, taskObserver, imageObserver;
const img = {src: '', hidden: true, complete: true, naturalWidth: 0,
  getAttribute: () => img.src || null};
const context = {window: {}, performance: {now: () => now},
  document: {querySelector: selector => selector.endsWith(' img') ? img : {}},
  PerformanceObserver: class {
    static supportedEntryTypes=['longtask'];
    constructor(callback) {this.callback = callback; this.pending = []; taskObserver = this;}
    observe() {}
    takeRecords() {const rows = this.pending; this.pending = []; return rows;}
    disconnect() {this.disconnected = true;}
  },
  MutationObserver: class {
    constructor(callback) {this.callback = callback; imageObserver = this;}
    observe() {}
    disconnect() {this.disconnected = true;}
  },
  setTimeout: (fn,ms) => {if(ms===30000)timer = fn; return 1;},
  clearTimeout: () => {timerCleared = true;}
};
vm.runInNewContext('(' + HOOK + ')()', context);
const diagnostic = context.window.__vmFigurePreviewDiagnostics;
now = 1000; diagnostic.begin({timeoutMs:30000,hardWallMs:180000});
'''


class FigurePreviewEvidence(unittest.TestCase):
    def run_clock(self, scenario):
        script = 'const HOOK = '+json.dumps(INSTALL_OBSERVER.replace('__STALL_RUNTIME__',STALL_RUNTIME))+';\n'+NODE_CLOCK+scenario
        result = subprocess.run(['node', '-e', script], text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stdout+result.stderr)

    def test_success_keeps_exact_predicate_and_uses_shared_budget(self):
        page = FakePage()
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(wait_for_preview(page, tmp),page.result)
            report = json.loads((Path(tmp)/'figure-preview-wait.json').read_text())
        self.assertEqual(len(page.waits),1)
        expression,options=page.waits[0]
        self.assertIn(PREVIEW_PREDICATE,expression)
        self.assertEqual(options['timeout'],180000)
        self.assertEqual(report['timeoutMs'],30000)
        self.assertEqual(report['hardWallMs'],180000)
        self.assertEqual(report['outcome'], 'passed')
        self.assertGreaterEqual(report['readbackQueryElapsedMs'], 0)

    def test_timeout_keeps_original_exception_and_distinct_deadline_readback(self):
        error = TimeoutError('original preview deadline')
        page, output = FakePage(wait_error=error), io.StringIO()
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(output):
            with self.assertRaises(TimeoutError) as caught:
                wait_for_preview(page, tmp)
            report = json.loads((Path(tmp)/'figure-preview-wait.json').read_text())
        self.assertIs(caught.exception, error)
        self.assertEqual(len(page.waits), 1)
        self.assertEqual(report['browser']['deadlineSample']['image']['src'], '')
        self.assertEqual(report['browser']['readback']['image']['src'], 'blob:later')
        self.assertIn('[figure-preview-wait]', output.getvalue())
        self.assertEqual(report['exception'], 'TimeoutError')

    def test_failed_readback_does_not_mask_original_timeout_or_retry(self):
        error = TimeoutError('original preview deadline')
        page = FakePage(wait_error=error, readback_error=RuntimeError('renderer unavailable'))
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(TimeoutError) as caught:
                wait_for_preview(page, tmp)
            report = json.loads((Path(tmp)/'figure-preview-wait.json').read_text())
        self.assertIs(caught.exception, error)
        self.assertEqual(len(page.waits), 1)
        self.assertEqual(report['readbackError'], 'renderer unavailable')
        self.assertNotIn('browser', report)

    def test_failed_wait_setup_records_wall_and_preserves_exception(self):
        original=RuntimeError('begin failed')
        class BrokenPage(FakePage):
            def evaluate(self,expression,arg=None):
                if 'begin('in expression:raise original
                return super().evaluate(expression,arg)
        page=BrokenPage();output=io.StringIO()
        with tempfile.TemporaryDirectory()as tmp,contextlib.redirect_stdout(output):
            with self.assertRaises(RuntimeError)as caught:wait_for_preview(page,tmp)
            report=json.loads((Path(tmp)/'figure-preview-wait.json').read_text())
        self.assertIs(caught.exception,original)
        self.assertFalse(report['waitStarted'])
        wall=json.loads(next(x.split('] ',1)[1]for x in output.getvalue().splitlines()if x.startswith('[wait-wall] ')))
        self.assertEqual(wall['outcome'],'failed')
        self.assertGreaterEqual(wall['hostAttemptWallMs'],0)

    def test_41518ms_stall_marks_late_deadline_sample_and_flushes_tasks(self):
        self.run_clock(r'''
taskObserver.pending.push({startTime: 20000, duration: 41518, name: 'self', entryType: 'longtask'});
now = 61518; img.src = 'blob:completed'; imageObserver.callback(); timer();
now = 62000; const result = diagnostic.finish();
assert.equal(result.deadlineSample.observedAtMs, 61518);
assert.equal(result.deadlineSample.latenessMs, 30518);
assert.equal(result.deadlineSample.image.src, 'blob:completed');
assert.equal(result.lastImageObservationBeforeDeadline.image.src, '');
assert.equal(result.readback.observedAtMs, 62000);
assert.equal(result.readbackAfterDeadlineMs, 31000);
assert.equal(result.longTasksCrossingDeadline[0].duration, 41518);
assert.equal(result.droppedLongTasks, 0);
assert(taskObserver.disconnected && imageObserver.disconnected && timerCleared);
''')

    def test_on_time_deadline_image_is_not_replaced_by_later_blob(self):
        self.run_clock(r'''
now = 31000; timer();
now = 32000; img.src = 'blob:late'; imageObserver.callback();
now = 32500; const result = diagnostic.finish();
assert.equal(result.deadlineSample.latenessMs, 0);
assert.equal(result.deadlineSample.image.src, '');
assert.equal(result.readback.image.src, 'blob:late');
assert.equal(result.longTasksCrossingDeadline.length, 0);
''')

    def test_prelude_tasks_are_retained_but_not_claimed_to_cross_deadline(self):
        self.run_clock(r'''
taskObserver.pending.push({startTime: 100, duration: 600, name: 'self', entryType: 'longtask'});
now = 10000; img.src = 'blob:early'; imageObserver.callback();
now = 31000; timer(); const result = diagnostic.finish();
assert.equal(result.longTasks.length, 1);
assert.equal(result.longTasksCrossingDeadline.length, 0);
assert.equal(result.lastImageObservationBeforeDeadline.image.src, 'blob:early');
assert.equal(result.deadlineSample.image.src, 'blob:early');
''')


if __name__ == '__main__':
    unittest.main()
