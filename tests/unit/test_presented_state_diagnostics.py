import io
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'e2e'))
from helpers import wait_for_presented_state


class PresentedStateDiagnostics(unittest.TestCase):
    def test_failed_wait_retains_boundary_state_and_original_exception(self):
        original=ValueError('Original wait timeout')
        class Boundary:
            disposed=False
            def dispose(self):self.disposed=True
        boundary=Boundary()
        class Page:
            def evaluate_handle(self,*args):return boundary
            def wait_for_function(self,expression,**kwargs):
                self.expression,self.options=expression,kwargs
                raise original
            def evaluate(self,*args):return dict(observedAtMs=42,presentation=dict(actual=False,expected=True),state=dict(actual=99,expected=100))
        page=Page();diagnostics=dict(reader='()=>null')
        with redirect_stdout(io.StringIO()):
            with self.assertRaises(ValueError) as caught:
                wait_for_presented_state(page,'()=>false',timeout=30000,diagnostics=diagnostics)
        self.assertIs(caught.exception,original)
        self.assertTrue(boundary.disposed)
        self.assertEqual(page.expression.count('boundary.presented && (()=>false)()'),1)
        self.assertIn('return ready;',page.expression)
        self.assertNotIn('async',page.expression)
        self.assertEqual(page.options['timeout'],30000)
        self.assertEqual([r['phase']for r in diagnostics['observations']],['before wait','failed'])
        self.assertFalse(diagnostics['observations'][-1]['presentation']['actual'])

    def test_readback_failure_does_not_replace_the_wait_failure(self):
        original=ValueError('Original wait timeout')
        class Boundary:
            def dispose(self):pass
        class Page:
            def evaluate_handle(self,*args):return Boundary()
            def wait_for_function(self,*args,**kwargs):raise original
            def evaluate(self,*args):raise RuntimeError('Renderer readback failed')
        diagnostics=dict(reader='()=>null')
        with redirect_stdout(io.StringIO()):
            with self.assertRaises(ValueError) as caught:
                wait_for_presented_state(Page(),'()=>false',diagnostics=diagnostics)
        self.assertIs(caught.exception,original)
        self.assertEqual(len(diagnostics['errors']),2)

    def test_existing_callers_do_not_gain_extra_readbacks(self):
        class Boundary:
            def dispose(self):pass
        class Page:
            def evaluate_handle(self,*args):return Boundary()
            def wait_for_function(self,*args,**kwargs):pass
            def evaluate(self,*args):raise AssertionError('Unrequested diagnostic')
        wait_for_presented_state(Page(),'()=>true')


if __name__=='__main__':unittest.main()
