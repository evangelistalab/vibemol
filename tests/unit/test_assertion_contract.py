import sys
from contextlib import redirect_stdout
import io
import json
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'e2e'))
from assertion_contract import budget_ms,numbers_close,deadline_diagnostics


class AssertionContract(unittest.TestCase):
    def test_budgets_are_the_existing_values_not_a_new_round_timeout(self):
        self.assertEqual(budget_ms('native-selection'),600)
        self.assertEqual(budget_ms('native-clipboard'),5000)
        self.assertEqual(budget_ms('false-presented-control'),100)
        self.assertEqual(budget_ms('resize-readiness'),30000)
        self.assertEqual(budget_ms('figure-preview'),30000)
        with self.assertRaises(KeyError):budget_ms('unreviewed-policy')

    def test_original_numeric_boundary_still_rejects_a_millionth(self):
        self.assertTrue(numbers_close(1.0+1e-11,1.0))
        self.assertFalse(numbers_close(1.0+1e-6,1.0))
        self.assertFalse(numbers_close(float('nan'),float('nan')))

    def test_diagnostic_failure_cannot_replace_the_original_wait_exception(self):
        class Handle:
            def dispose(self): pass
        class Page:
            def evaluate_handle(self,*args):return Handle()
            def evaluate(self,*args):raise RuntimeError('Diagnostic readback failed')
        original=ValueError('Original wait failure')
        output=io.StringIO()
        with redirect_stdout(output):
            with self.assertRaises(ValueError) as caught:
                with deadline_diagnostics(Page(),label='control',policy='false-presented-control',site='test'):
                    raise original
        self.assertIs(caught.exception,original)
        report=json.loads(next(line.split('] ',1)[1]for line in output.getvalue().splitlines()if line.startswith('[shared-deadline] ')))
        wall=json.loads(next(line.split('] ',1)[1]for line in output.getvalue().splitlines()if line.startswith('[wait-wall] ')))
        self.assertEqual(wall['outcome'],'failed')
        self.assertGreaterEqual(wall['hostAttemptWallMs'],0)
        self.assertIsNone(wall['browserWallMs'])
        self.assertEqual(report['exception'],'ValueError')
        self.assertEqual(report['readbackError'],'Diagnostic readback failed')
        self.assertEqual(report['timeoutMs'],100)

    def test_diagnostic_install_failure_does_not_skip_or_fail_a_passing_wait(self):
        class Page:
            def evaluate_handle(self,*args):raise RuntimeError('Observer install failed')
        ran=False
        with redirect_stdout(io.StringIO()):
            with deadline_diagnostics(Page(),label='control',policy='false-presented-control',site='test') as report:
                ran=True
        self.assertTrue(ran)
        self.assertEqual(report['outcome'],'passed')
        self.assertEqual(report['installError'],'Observer install failed')

    def test_resize_observer_precedes_action_and_deadline_follows_it(self):
        calls=[]
        class Handle:
            def dispose(self): pass
        class Page:
            def evaluate_handle(self,*args):calls.append('observer');return Handle()
            def evaluate(self,expression,*args):
                calls.append('begin' if 'begin()' in expression else 'readback' if 'finish()' in expression else 'dispose')
                return {}
        with redirect_stdout(io.StringIO()):
            with deadline_diagnostics(Page(),label='resize',policy='resize-readiness',site='test',
                    prelude=lambda:calls.append('resize')):
                calls.append('wait')
        self.assertEqual(calls[:4],['observer','resize','begin','wait'])

    def test_resize_action_exception_is_preserved_and_wait_is_not_started(self):
        calls=[]
        class Handle:
            def dispose(self): pass
        class Page:
            def evaluate_handle(self,*args):return Handle()
            def evaluate(self,expression,*args):calls.append(expression);return {}
        original=ValueError('Resize action failed')
        def action():raise original
        with redirect_stdout(io.StringIO()):
            with self.assertRaises(ValueError) as caught:
                with deadline_diagnostics(Page(),label='resize',policy='resize-readiness',site='test',prelude=action):
                    self.fail('Wait must not start after a failed action')
        self.assertIs(caught.exception,original)
        self.assertFalse(any('begin()'in x for x in calls))
