import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests/e2e'))
import browser_suite


class WorkflowContractTests(unittest.TestCase):
    def run_script(self,body):
        prefix='import sys\nsys.path.insert(0,'+repr(str(ROOT/'tests/e2e'))+')\nfrom workflow_contract import workflow_step\n'
        return subprocess.run([sys.executable,'-c',prefix+body],capture_output=True,text=True)
    def test_original_assertion_is_uncaught_and_bound(self):
        r=self.run_script("with workflow_step('axis_gizmo.py','escape-canvas-focus','axis-endpoint.escape.canvas-focus',{}):\n assert False, 'original comparand'\n")
        self.assertNotEqual(r.returncode,0)
        self.assertIn('AssertionError: original comparand',r.stderr)
        row=json.loads(r.stdout.split('[workflow-step] ',1)[1])
        end=json.loads(r.stderr.rsplit('[workflow-exception] ',1)[1])
        self.assertEqual(row['token'],end['token'])
    def test_caught_step_cannot_label_later_unrelated_assertion(self):
        r=self.run_script("try:\n with workflow_step('axis_gizmo.py','escape-canvas-focus','axis-endpoint.escape.canvas-focus',{}):\n  assert False\nexcept AssertionError: pass\nassert False\n")
        self.assertNotEqual(r.returncode,0)
        terminal=json.loads(r.stderr.rsplit('[workflow-exception] ',1)[1])
        self.assertIsNone(terminal['token'])
        self.assertIsNone(browser_suite.failure_workflow('axis_gizmo.py',r.stdout+r.stderr))
    def test_passed_step_cannot_label_later_failure(self):
        r=self.run_script("with workflow_step('axis_gizmo.py','escape-canvas-focus','axis-endpoint.escape.canvas-focus',{}):\n assert True\nassert False\n")
        terminal=json.loads(r.stderr.rsplit('[workflow-exception] ',1)[1])
        self.assertIsNone(terminal['token'])
    def test_readback_failure_preserves_original_error_and_fails_closed(self):
        r=self.run_script("def broken(): raise ValueError('readback unavailable')\nwith workflow_step('axis_gizmo.py','escape-canvas-focus','axis-endpoint.escape.canvas-focus',broken):\n assert False, 'original failure'\n")
        self.assertIn('AssertionError: original failure',r.stderr)
        self.assertNotIn('ValueError:',r.stderr)
        self.assertIsNone(browser_suite.failure_workflow('axis_gizmo.py',r.stdout+r.stderr))
    def test_native_error_identity_type_and_message_are_preserved(self):
        r=self.run_script("with workflow_step('mode_consistency.py','coordinates-delete-selection-card','coordinates.row1.native-delete',{}):\n raise TimeoutError('native click original message')\n")
        self.assertIn('TimeoutError: native click original message',r.stderr)
        self.assertIn('"exceptionType": "TimeoutError"',r.stderr)
    def test_success_does_not_change_exit_or_original_assertion(self):
        r=self.run_script("with workflow_step('axis_gizmo.py','escape-canvas-focus','axis-endpoint.escape.canvas-focus',{}):\n assert True\n")
        self.assertEqual(r.returncode,0)
        self.assertIn('"outcome": "passed"',r.stdout)
        self.assertNotIn('[workflow-exception]',r.stderr)


if __name__=='__main__':unittest.main()
