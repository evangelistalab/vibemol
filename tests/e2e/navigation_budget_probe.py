"""Real Chromium contract for navigation; controlled resources, no app source."""
import json,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright,TimeoutError
from navigation_budget import goto_with_budget


def run(out):
    out=Path(out);out.mkdir(parents=True,exist_ok=True)
    gate=threading.Event()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def do_GET(self):
            if self.path in ['/pending.js','/pending-main']:gate.wait()
            body=('<script src="/pending.js"></script>'if self.path=='/network'else
                  '<script>const end=performance.now()+220;while(performance.now()<end){}</script><p>ready</p>'if self.path=='/cpu'else'<p>ready</p>').encode()
            try:
                self.send_response(200);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
            except (BrokenPipeError,ConnectionResetError):pass
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    base='http://127.0.0.1:'+str(server.server_port);cases=[]
    try:
        with sync_playwright()as pw:
            browser=pw.chromium.launch(headless=True)
            try:
                for path,label,policy,want in [('/cpu','navigation CPU control','false-presented-control','passed'),
                    ('/network','pending subresource control','false-presented-control','failed'),
                    ('/pending-main','pending main resource control','false-presented-control','failed'),
                    ('/ready','navigation ready control','navigation-load','passed')]:
                    print('[navigation-contract-start] '+label,flush=True)
                    context=browser.new_context();page=context.new_page();gate.clear()
                    # Diagnostic safety only: the assertions below require that
                    # this release has NOT fired when the wait decides. It cannot
                    # make a hanging resource pass or supply readiness.
                    release=threading.Timer(5,gate.set)if want=='failed'else None
                    if release is not None:release.daemon=True;release.start()
                    try:
                        rejected=False
                        try:goto_with_budget(page,base+path,out,label=label,policy=policy,site='control.navigation')
                        except TimeoutError:rejected=True
                        row=json.loads((out/('navigation-budget-'+label+'.json')).read_text())
                        actual=dict(outcome=row['outcome'],covered=row['covered'],rejected=rejected,
                            observationErrors=row['observationErrors'],gateReleased=gate.is_set(),cleanup=all(x['passed']for x in row['cleanup']))
                        expected=dict(outcome=want,covered=True,rejected=want=='failed',observationErrors=[],gateReleased=False,cleanup=True)
                        print('[navigation-contract] '+json.dumps(dict(case=label,actual=actual,expected=expected)),flush=True)
                        assert actual==expected,(label,actual,expected,row)
                        if want=='failed':
                            assert row['commitReached']==(path=='/network'),row
                            if path=='/network':assert row['expiredOnBudget']and row['timing']['responsiveExceeded'],row
                            else:assert row['timing']['wallElapsedMs']>=100,row
                        if path=='/cpu':assert row['timing']['wallElapsedMs']>100 and row['timing']['discountedMs']>0,row
                        if release is not None:release.cancel()
                        gate.set()
                        # A second ordinary navigation verifies removal of the
                        # preload, binding and current-document timer owner.
                        print('[navigation-contract-cleanup-navigation] '+label,flush=True)
                        page.goto(base+'/ready')
                        globals_left=page.evaluate("()=>Object.getOwnPropertyNames(window).filter(k=>k.startsWith('__navigationBudget_'))")
                        assert globals_left==[],globals_left
                        bridge_state=page.evaluate('()=>__vibemolNavigationBudgetBridge({})')
                        assert bridge_state==dict(active=False,withinBudget=True),bridge_state
                        cases.append(dict(case=label,actual=actual,expected=expected,timing=row['timing'],globalsAfterNextNavigation=globals_left,bridgeAfterNextNavigation=bridge_state))
                    finally:
                        if release is not None:release.cancel()
                        gate.set();context.close()
                        assert not browser.contexts,'Navigation control left a background context'
            finally:browser.close()
            assert not browser.is_connected()
        result=dict(passed=True,cases=cases,allContextsRetired=True,appLoaded=False)
        (out/'result.json').write_text(json.dumps(result,indent=2)+'\n');return result
    finally:
        gate.set();server.shutdown();server.server_close();thread.join()


if __name__=='__main__':
    import os
    run(os.environ['VIBEMOL_TEST_ARTIFACT_DIR'])
