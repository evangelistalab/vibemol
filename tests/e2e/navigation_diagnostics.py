"""Observe existing goto(load) calls; no readiness/timeout/retry changes."""
from contextlib import contextmanager, suppress
import json
from pathlib import Path
import time


@contextmanager
def navigation_diagnostics(page, artifact_dir, *, label):
    started = time.monotonic()
    requests, active, events = [], {}, []
    dropped = 0
    def stamp():return (time.monotonic()-started)*1000
    def request(req):
        nonlocal dropped
        if len(requests)>=512:
            dropped+=1
            return
        row=dict(url=req.url,resourceType=req.resource_type,startedAtMs=stamp(),outcome='pending')
        requests.append(row);active[id(req)]=row
    def ended(req, outcome):
        row=active.pop(id(req),None)
        if row is None:
            events.append(dict(event='unmatched request completion',url=req.url,observedAtMs=stamp()))
            return
        row.update(outcome=outcome,completedAtMs=stamp())
        if outcome=='failed':row['failure']=req.failure
    finished=lambda req:ended(req,'finished')
    failed=lambda req:ended(req,'failed')
    dom=lambda:events.append(dict(event='domcontentloaded',observedAtMs=stamp()))
    load=lambda:events.append(dict(event='load',observedAtMs=stamp()))
    handlers={'request':request,'requestfinished':finished,'requestfailed':failed,'domcontentloaded':dom,'load':load}
    for event,handler in handlers.items():page.on(event,handler)
    report=dict(label=label,expected=dict(waitUntil='load',timeout='unchanged caller/default'),outcome='passed')
    try:
        yield report
    except BaseException as error:
        report.update(outcome='failed',exception=type(error).__name__,error=str(error))
        raise
    finally:
        report.update(waitElapsedMs=stamp(),requests=requests,pendingRequests=list(active.values()),
                      lifecycle=events,droppedRequests=dropped)
        for event,handler in handlers.items():
            with suppress(Exception):page.remove_listener(event,handler)
        readback_started=time.monotonic()
        try:
            report['readback']=page.evaluate('''()=>({url:location.href,readyState:document.readyState,
              observedAtMs:performance.now(),workbenchPresent:!!window.VibeMolWorkbench,
              looksPresent:!!window.VibeMolAppearanceLooks,
              navigation:performance.getEntriesByType('navigation').map(e=>e.toJSON()),
              unfinishedResources:performance.getEntriesByType('resource').filter(e=>!e.responseEnd)
                .map(e=>({name:e.name,initiatorType:e.initiatorType,startTime:e.startTime}))})''')
        except Exception as error:report['readbackError']=str(error)
        report['comparands']=dict(readyState=dict(actual=report.get('readback',{}).get('readyState'),expected='complete'),
            loadEventObserved=dict(actual=any(e['event']=='load'for e in events),expected=True))
        report['readbackQueryElapsedMs']=(time.monotonic()-readback_started)*1000
        report['timestampCaveat']='Request/lifecycle timestamps are host event delivery times. Readback follows completion/failure; it is never an exact deadline snapshot. No pending URL is inferred from console text.'
        try:
            path=Path(artifact_dir)/('navigation-'+label+'.json');path.parent.mkdir(parents=True,exist_ok=True)
            path.write_text(json.dumps(report,indent=2)+'\n')
        except OSError as error:report['artifactWriteError']=str(error)
        print('[navigation-comparands] '+json.dumps(report),flush=True)
