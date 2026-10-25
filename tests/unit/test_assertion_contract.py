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
        report=json.loads(output.getvalue().split('] ',1)[1])
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
