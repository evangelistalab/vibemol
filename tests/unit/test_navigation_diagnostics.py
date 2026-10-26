import io,json,sys,tempfile,unittest
from contextlib import redirect_stdout
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'e2e'))
from navigation_diagnostics import navigation_diagnostics

class Page:
    def __init__(self,read_error=None):self.handlers={};self.read_error=read_error
    def on(self,name,fn):self.handlers[name]=fn
    def remove_listener(self,name,fn):self.handlers.pop(name)
    def evaluate(self,*args):
        if self.read_error:raise self.read_error
        return dict(readyState='interactive',workbenchPresent=True)
class Request:
    url='https://example.invalid/asset';resource_type='script';failure='net::ERR_TIMED_OUT'

class NavigationDiagnostics(unittest.TestCase):
    def test_failed_goto_keeps_pending_url_and_original_exception(self):
        page=Page();original=TimeoutError('goto unchanged30s timeout')
        with tempfile.TemporaryDirectory()as tmp,redirect_stdout(io.StringIO()):
            with self.assertRaises(TimeoutError)as caught:
                with navigation_diagnostics(page,tmp,label='control'):
                    page.handlers['request'](Request())
                    page.handlers['domcontentloaded']()
                    raise original
            row=json.loads((Path(tmp)/'navigation-control.json').read_text())
        self.assertIs(caught.exception,original)
        self.assertEqual(row['pendingRequests'][0]['url'],Request.url)
        self.assertEqual(row['comparands']['readyState'],dict(actual='interactive',expected='complete'))
        self.assertFalse(row['comparands']['loadEventObserved']['actual'])
        self.assertEqual(page.handlers,{})
    def test_request_failure_is_named_and_does_not_fail_a_successful_goto(self):
        page=Page();req=Request()
        with tempfile.TemporaryDirectory()as tmp,redirect_stdout(io.StringIO()):
            with navigation_diagnostics(page,tmp,label='control'):
                page.handlers['request'](req);page.handlers['requestfailed'](req);page.handlers['load']()
            row=json.loads((Path(tmp)/'navigation-control.json').read_text())
        self.assertEqual(row['outcome'],'passed')
        self.assertEqual(row['pendingRequests'],[])
        self.assertEqual(row['requests'][0]['failure'],Request.failure)
        self.assertTrue(row['comparands']['loadEventObserved']['actual'])
    def test_missing_readback_does_not_replace_original_timeout(self):
        page=Page(RuntimeError('renderer unavailable'));original=TimeoutError('original')
        with tempfile.TemporaryDirectory()as tmp,redirect_stdout(io.StringIO()):
            with self.assertRaises(TimeoutError)as caught:
                with navigation_diagnostics(page,tmp,label='control'):raise original
            row=json.loads((Path(tmp)/'navigation-control.json').read_text())
        self.assertIs(caught.exception,original)
        self.assertEqual(row['readbackError'],'renderer unavailable')
        self.assertIsNone(row['comparands']['readyState']['actual'])
        self.assertEqual(page.handlers,{})
