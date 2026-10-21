"""Protect the deterministic clock gate and preservation of failed assertions."""
import contextlib
import io
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests/e2e'))
from video_export_activation import install_video_clock_gate,hold_video_clock,release_video_clock,wait_download_and_idle


class Page:
    def __init__(self,error=None,readback_error=None):
        self.error=error;self.readback_error=readback_error;self.scripts=[]
    def evaluate(self,source,arg=None):
        self.scripts.append(source)
        if source.startswith('prefix =>'):
            if self.readback_error:raise self.readback_error
            return dict(mode='idle',hidden='true',downloads=2)
        return []
    def wait_for_function(self,source,**args):
        if self.error:raise self.error


class VideoActivationHarness(unittest.TestCase):
    def test_clock_holds_across_arbitrary_host_delay_while_frames_continue(self):
        page=Page();install_video_clock_gate(page);hold_video_clock(page);release_video_clock(page)
        script='''const vm=require('node:vm'),assert=require('node:assert/strict'),fs=require('node:fs');
let real=100,frames=[];const ctx={performance:{now:()=>real},requestAnimationFrame:fn=>frames.push(fn)};ctx.window=ctx;
const run=source=>vm.runInNewContext('('+source+')()',ctx);
run(SCRIPTS[0]);run(SCRIPTS[1]);real+=86400000;
assert.equal(ctx.performance.now(),100);assert.equal(ctx.__videoClockGate.realNow(),86400100);
frames.shift()();assert.equal(ctx.__videoClockGate.samples,1);assert.equal(frames.length,1);
vm.runInNewContext(fs.readFileSync(CLOCK,'utf8'),ctx);
const tick=ctx.VibeMolTrajectoryClock.advance({frame:0,playing:true,fps:1,loop:false,lastStepMs:100},4,ctx.performance.now());
assert.equal(tick.advanced,false);assert.equal(tick.frame,0);
run(SCRIPTS[2]);assert.equal(ctx.performance.now(),86400100);
'''.replace('SCRIPTS',json.dumps(page.scripts)).replace('CLOCK',json.dumps(str(ROOT/'assets/app/js/trajectory-clock.js')))
        result=subprocess.run(['node','-e',script],text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)

    def test_original_wait_exception_survives_diagnostic_failure(self):
        error=TimeoutError('original completion failure');page=Page(error,RuntimeError('readback unavailable'))
        output=io.StringIO()
        with contextlib.redirect_stdout(output),self.assertRaises(TimeoutError) as caught:
            wait_download_and_idle(page,'trajectory',2)
        self.assertIs(caught.exception,error)
        self.assertIn('[video-completion-readback-error]',output.getvalue())

    def test_success_logs_completion_comparands(self):
        output=io.StringIO()
        with contextlib.redirect_stdout(output):wait_download_and_idle(Page(),'vibration',2)
        self.assertIn('"expected": {"downloads": 2, "mode": "idle", "hidden": "true"}',output.getvalue())


if __name__=='__main__':unittest.main()
