import io,sys,unittest
from contextlib import redirect_stdout
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'e2e'))
from browser_lifetime import assert_browser_lifetime

class Browser:
    def __init__(self,contexts,connected):self.contexts=contexts;self.connected=connected
    def is_connected(self):return self.connected
class Context:
    def __init__(self,pages):self.pages=pages

class BrowserLifetime(unittest.TestCase):
    def test_retirement_requires_zero_contexts_pages_and_disconnection(self):
        records=[]
        with redirect_stdout(io.StringIO()):
            row=assert_browser_lifetime(Browser([],False),stage='retired',contexts=0,pages=0,connected=False,records=records)
        self.assertTrue(row['passed']);self.assertEqual(records,[row])
    def test_completed_background_page_fails_without_repairing_browser(self):
        browser=Browser([Context([object()])],True);records=[]
        with redirect_stdout(io.StringIO()),self.assertRaises(AssertionError):
            assert_browser_lifetime(browser,stage='next phase',contexts=0,pages=0,connected=True,records=records)
        self.assertEqual(records[0]['actual'],dict(contexts=1,pages=1,connected=True))
        self.assertEqual(len(browser.contexts),1)
        self.assertFalse(records[0]['passed'])
    def test_no_contexts_does_not_prove_the_browser_is_retired(self):
        records=[]
        with redirect_stdout(io.StringIO()),self.assertRaises(AssertionError):
            assert_browser_lifetime(Browser([],True),stage='retired',contexts=0,pages=0,connected=False,records=records)
        self.assertEqual(records[0]['actual']['contexts'],0)
        self.assertTrue(records[0]['actual']['connected'])
