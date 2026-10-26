import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'e2e'))
from navigation_budget import NavigationClock,interval_union

class NavigationBudget(unittest.TestCase):
    def row(self,doc,now,tasks=(),gaps=(),origin=1000,dropped=0):
        return dict(document=doc,href='local',originMs=origin,observedAbsoluteMs=now,
                    longTasks=list(tasks),heartbeatGaps=list(gaps),droppedLongTasks=dropped,droppedHeartbeatGaps=0,observerError=None)
    def test_network_wait_with_running_heartbeats_receives_no_credit(self):
        c=NavigationClock(1000,100);r=c.observe(self.row('a',1101))
        self.assertFalse(r['withinBudget']);self.assertEqual(r['discountedMs'],0)
    def test_page_cpu_work_receives_credit_and_is_not_performance_evidence(self):
        c=NavigationClock(1000,100);r=c.observe(self.row('a',1780,[dict(startTime=0,duration=780)]))
        self.assertTrue(r['withinBudget']);self.assertEqual(r['wallElapsedMs'],780);self.assertEqual(r['responsiveElapsedMs'],0)
    def test_union_across_documents_excludes_unobserved_transition(self):
        c=NavigationClock(1000,100)
        c.observe(self.row('a',1060,[dict(startTime=0,duration=60)]))
        r=c.observe(self.row('b',1200,gaps=[dict(startTime=0,duration=40)],origin=1160))
        self.assertEqual(r['discountedMs'],100);self.assertEqual(r['responsiveElapsedMs'],100)
    def test_overlapping_longtask_and_heartbeat_do_not_double_credit(self):
        self.assertEqual(interval_union([dict(startTime=0,duration=80),dict(startTime=40,duration=80)],0,120),120)
    def test_missing_intervals_charge_all_time(self):
        c=NavigationClock(1000,100);r=c.observe(self.row('a',1200,[dict(startTime=0,duration=200)],dropped=1))
        self.assertFalse(r['withinBudget']);self.assertEqual(r['discountedMs'],0)
    def test_latched_expiry_cannot_be_repaired_by_later_load(self):
        c=NavigationClock(1000,100);first=c.observe(self.row('a',1101));r=c.observe(self.row('a',1200,[dict(startTime=0,duration=200)]))
        self.assertEqual(r,first);self.assertFalse(r['withinBudget'])
    def test_hard_ceiling_still_fails_fully_credited_work(self):
        c=NavigationClock(1000,100,180000);r=c.observe(self.row('a',181001,[dict(startTime=0,duration=180001)]))
        self.assertTrue(r['hardWallExceeded']);self.assertFalse(r['withinBudget'])

from contextlib import redirect_stdout
from unittest.mock import patch
import io,json,tempfile
from navigation_budget import goto_with_budget
class UnsupportedContext:
    def new_cdp_session(self,page):raise RuntimeError('CDP unavailable')
class UnsupportedPage:
    context=UnsupportedContext()
    def __init__(self,error=None):self.handlers={};self.calls=[];self.exposures=0;self.error=error
    def expose_binding(self,*args):self.exposures+=1
    def on(self,name,fn):self.handlers[name]=fn
    def remove_listener(self,name,fn):self.handlers.pop(name,None)
    def evaluate(self,*args):return dict(readyState='complete')
    def goto(self,url,**kwargs):
        self.calls.append(kwargs)
        if self.error:raise self.error
        self.handlers['load']();return 'original response'
class NavigationFallback(unittest.TestCase):
    def test_unsupported_browser_keeps_original30s_not_blind180s(self):
        page=UnsupportedPage()
        with tempfile.TemporaryDirectory()as tmp,patch.dict('os.environ',{'VIBEMOL_TEST_ARTIFACT_DIR':tmp}),redirect_stdout(io.StringIO()):
            result=goto_with_budget(page,'local',tmp,label='fallback')
            row=json.loads((Path(tmp)/'navigation-budget-fallback.json').read_text())
        self.assertEqual(result,'original response');self.assertEqual(page.calls,[dict(wait_until='load',timeout=30000)])
        self.assertFalse(row['covered']);self.assertTrue(row['bridgeDisarmed']);self.assertEqual(page.handlers,{})
    def test_transport_exception_is_preserved(self):
        original=RuntimeError('connection refused');page=UnsupportedPage(original)
        with tempfile.TemporaryDirectory()as tmp,patch.dict('os.environ',{'VIBEMOL_TEST_ARTIFACT_DIR':tmp}),redirect_stdout(io.StringIO()):
            with self.assertRaises(RuntimeError)as caught:goto_with_budget(page,'local',tmp,label='transport')
        self.assertIs(caught.exception,original);self.assertEqual(page.handlers,{})
    def test_one_inactive_bridge_is_reused_per_page(self):
        page=UnsupportedPage()
        with tempfile.TemporaryDirectory()as tmp,patch.dict('os.environ',{'VIBEMOL_TEST_ARTIFACT_DIR':tmp}),redirect_stdout(io.StringIO()):
            for label in ['first','second']:goto_with_budget(page,'local',tmp,label=label)
        self.assertEqual(page.exposures,1)

class NavigationCompletion(unittest.TestCase):
    def row(self,doc,now,event='heartbeat'):
        return dict(document=doc,href='local',originMs=1000,observedAbsoluteMs=now,longTasks=[],heartbeatGaps=[],event=event)
    def test_completed_load_latches_before_later_host_readback(self):
        c=NavigationClock(1000,100);first=c.observe(self.row('new',1050,'completed-load'))
        self.assertTrue(first['withinBudget']);self.assertEqual(c.observe(self.row('new',1500)),first)
    def test_previous_document_load_cannot_complete_new_navigation(self):
        c=NavigationClock(1000,100,previous_document='old');c.observe(self.row('old',1010,'completed-load'))
        self.assertIsNone(c.completed);self.assertFalse(c.observe(self.row('old',1101))['withinBudget'])

class NavigationFailurePreservation(unittest.TestCase):
    def test_same_document_navigation_keeps_original_deadline(self):
        page=UnsupportedPage();page.url='local#old'
        with tempfile.TemporaryDirectory()as tmp,patch.dict('os.environ',{'VIBEMOL_TEST_ARTIFACT_DIR':tmp}),redirect_stdout(io.StringIO()):
            goto_with_budget(page,'local#new',tmp,label='same-document')
        self.assertEqual(page.exposures,0);self.assertEqual(page.calls,[dict(wait_until='load',timeout=30000)])
    def test_artifact_failure_does_not_replace_transport_exception(self):
        original=RuntimeError('transport primary');page=UnsupportedPage(original)
        with tempfile.TemporaryDirectory()as tmp,patch.dict('os.environ',{'VIBEMOL_TEST_ARTIFACT_DIR':tmp}),patch.object(Path,'write_text',side_effect=OSError('artifact unavailable')),redirect_stdout(io.StringIO()):
            with self.assertRaises(RuntimeError)as caught:goto_with_budget(page,'local',tmp,label='io')
        self.assertIs(caught.exception,original)
    def test_cleanup_failure_cannot_pass_an_otherwise_successful_load(self):
        class Session:
            def on(self,*args):pass
            def send(self,*args):raise RuntimeError('setup unavailable')
            def detach(self):raise RuntimeError('not detached')
        class Context:
            def new_cdp_session(self,page):return Session()
        page=UnsupportedPage();page.context=Context()
        with tempfile.TemporaryDirectory()as tmp,patch.dict('os.environ',{'VIBEMOL_TEST_ARTIFACT_DIR':tmp}),redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(AssertionError,'cleanup failed'):goto_with_budget(page,'local',tmp,label='cleanup')
            record=json.loads((Path(tmp)/'navigation-budget-cleanup.json').read_text())
        self.assertEqual(record['outcome'],'failed');self.assertTrue(record['bridgeDisarmed'])
