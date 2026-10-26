"""Chromium goto(load) budget, with cross-document observations and no retries.

Not a performance detector: page CPU work receives credit, just as in #43.
No credit for unobserved intervals or ordinary network waiting. Unsupported
browsers/setup failures keep the original navigation deadline, never180s alone.
"""
import json,time
from assertion_contract import STALL_RUNTIME,HARD_WALL_MS,budget_ms
from navigation_diagnostics import navigation_diagnostics
from wall_times import record_wait_wall


def interval_union(entries,start,end):
    rows=sorted((max(start,r['startTime']),min(end,r['startTime']+r['duration']))for r in entries
                if r['startTime']<end and r['startTime']+r['duration']>start)
    total=0;previous=float('-inf')
    for a,b in rows:total+=max(0,b-max(a,previous));previous=max(previous,b)
    return total


class NavigationClock:
    def __init__(self,start,budget,ceiling=HARD_WALL_MS,previous_document=None):
        self.start=start;self.budget=budget;self.ceiling=ceiling;self.previous_document=previous_document;self.intervals=[];self.documents={};self.lost=False;self.result=None;self.completed=None
    def observe(self,row):
        doc=self.documents.setdefault(row['document'],dict(href=row['href'],longTasks=0,heartbeatGaps=0,observerError=None))
        doc['observerError']=row.get('observerError');self.lost|=bool(row.get('droppedLongTasks')or row.get('droppedHeartbeatGaps'))
        for key in ['longTasks','heartbeatGaps']:
            for entry in row[key]:
                self.intervals.append(dict(startTime=row['originMs']+entry['startTime'],duration=entry['duration'],kind=key,document=row['document']))
                doc[key]+=1
        result=self.sample(row['observedAbsoluteMs'])
        if row.get('event')=='completed-load'and row['document']!=self.previous_document:self.completed=result
        return result
    def sample(self,end):
        if self.completed is not None:return self.completed
        wall=max(0,end-self.start);discount=0 if self.lost else interval_union(self.intervals,self.start,end)
        responsive=max(0,wall-discount);exceeded=wall>self.ceiling or responsive>self.budget
        row=dict(wait=dict(startedAtMs=self.start,timeoutMs=self.budget),observedWaitEndAtMs=end,
            wallElapsedMs=wall,discountedMs=discount,responsiveElapsedMs=responsive,responsiveBudgetMs=self.budget,
            hardWallMs=self.ceiling,withinBudget=not exceeded,responsiveExceeded=responsive>self.budget,
            hardWallExceeded=wall>self.ceiling,observationsComplete=not self.lost,intervalCountAtDecision=len(self.intervals))
        if exceeded and self.result is None:self.result=row
        return self.result or row


from weakref import WeakKeyDictionary
_BRIDGES=WeakKeyDictionary()


def goto_with_budget(page,url,artifact_dir,*,label,policy='navigation-load',site='navigation.load'):
    """Fresh-document loads: commit at original deadline, then observed load.

    Required load dispatch is unchanged; pre-commit remains bare wall clock.
    One inactive bridge may live until its Page closes.

    Each invocation removes its preload and observer/timer. The public Playwright
    binding survives navigation by design and is reused once per Page. It is
    disarmed at completion, holds no timing owner, and generates no traffic.
    """
    from playwright.sync_api import TimeoutError
    budget=budget_ms(policy);started=time.monotonic();session=None;script_id=None;clock=None
    token='__navigationBudget_'+str(id(page));binding='__vibemolNavigationBudgetBridge';messages=[];errors=[];protocol_errors=[]
    observed=dict(label=label,policy=policy,site=site,responsiveBudgetMs=budget,hardWallMs=HARD_WALL_MS,
                  performanceRegressionDetector=False,covered=False,expiredOnBudget=False,commitReached=False)
    original=None;response=None;outcome='failed';entry=None
    from pathlib import Path
    root=Path(artifact_dir);root.mkdir(parents=True,exist_ok=True)
    event_file=root/('navigation-events-'+label+'.jsonl')
    def received(row):
        try:
            with event_file.open('a')as stream:stream.write(json.dumps(row)+'\n')
        except OSError as error:
            errors.append(repr(error))
            if clock is not None:clock.lost=True
        messages.append(dict(event=row['event'],document=row['document'],observedAbsoluteMs=row['observedAbsoluteMs']))
        if clock is None:return dict(active=True,withinBudget=True)
        try:
            result=clock.observe(row)
            if not result['withinBudget']:observed['expiredOnBudget']=True
            return dict(active=True,withinBudget=result['withinBudget'])
        except Exception as error:
            errors.append(repr(error));clock.lost=True
            return dict(active=True,withinBudget=False)
    script='''(()=>{
      if(window.top!==window)return;
      const token=TOKEN,binding=BRIDGE,originMs=performance.timeOrigin;
      let observer,taskCursor=0,gapCursor=0,disposed=false,completionTimer=null;
      const state={done:false,passed:false};
      const documentId=originMs+':'+performance.now();
      const publish=event=>{
        if(disposed||!observer)return Promise.resolve();
        const sample=observer.sample({startedAtMs:observerStart});
        const tasks=sample.longTasks.slice(taskCursor);
        const fixed=sample.heartbeatGaps.filter(row=>!row.provisional);
        const gaps=[...fixed.slice(gapCursor),...sample.heartbeatGaps.filter(row=>row.provisional)];
        taskCursor=sample.longTasks.length;gapCursor=fixed.length;
        return globalThis[binding]({document:documentId,href:location.href,originMs,event,
          observedAbsoluteMs:originMs+sample.readback.observedAtMs,longTasks:tasks,heartbeatGaps:gaps,
          droppedLongTasks:sample.droppedLongTasks,droppedHeartbeatGaps:sample.droppedHeartbeatGaps,
          observerError:sample.observerError}).then(answer=>{
            if(answer.active&&(!answer.withinBudget||event==='completed-load')){state.done=true;state.passed=answer.withinBudget;}
          });
      };
      const schedule=(callback,delay)=>setTimeout(()=>{callback();publish('heartbeat')},delay);
      observer=(RUNTIME)({setTimeout:schedule});
      const observerStart=observer.sample({}).preludeStartedAtMs;
      const finish=()=>{const pending=publish('finish');observer.dispose();disposed=true;
        clearTimeout(completionTimer);removeEventListener('pagehide',hide);removeEventListener('load',loaded);delete globalThis[token];
        return pending;};
      const hide=()=>{finish()},loaded=()=>{completionTimer=setTimeout(()=>{if(!disposed)publish('completed-load')},0)};
      addEventListener('pagehide',hide,{once:true});addEventListener('load',loaded);
      Object.defineProperty(globalThis,token,{value:{finish,state,documentId},configurable:true});publish('installed');
    })()'''.replace('TOKEN',json.dumps(token)).replace('BRIDGE',json.dumps(binding)).replace('RUNTIME',STALL_RUNTIME)
    try:
        try:
            if '#'in url and url.split('#')[0]==getattr(page,'url','').split('#')[0]:
                raise ValueError('Same-document navigation retains original wall deadline')
            entry=_BRIDGES.get(page)
            if entry is None:
                entry=dict(receive=None)
                def bridge(source,row):
                    callback=entry['receive']
                    return callback(row)if callback else dict(active=False,withinBudget=True)
                page.expose_binding(binding,bridge);_BRIDGES[page]=entry
            entry['receive']=received
            session=page.context.new_cdp_session(page)
            session.send('Runtime.enable');session.send('Page.enable')
            session.on('Runtime.exceptionThrown',lambda event:protocol_errors.append(event))
            script_id=session.send('Page.addScriptToEvaluateOnNewDocument',dict(source=script))['identifier']
            setup=session.send('Runtime.evaluate',dict(expression=script,returnByValue=True))
            if 'exceptionDetails'in setup:raise RuntimeError(setup['exceptionDetails'])
            anchor=session.send('Runtime.evaluate',dict(expression=f'(()=>({{time:performance.timeOrigin+performance.now(),document:globalThis[{json.dumps(token)}]?.documentId}}))()',returnByValue=True))['result']['value']
            if not anchor.get('document'):raise RuntimeError('Previous-document observer missing')
            clock=NavigationClock(anchor['time'],budget,previous_document=anchor['document']);observed['covered']=True;observed['previousDocument']=anchor['document']
        except Exception as error:observed['setupError']=repr(error)
        with navigation_diagnostics(page,artifact_dir,label=label)as report:
            report['expected']=dict(waitUntil='load',timeout='shared navigation budget'if observed['covered']else'original deadline; no observations')
            try:
                if observed['covered']:
                    # Preserve the original bare pre-commit request deadline.
                    # The observed problem has committed markup but waits on load.
                    response=page.goto(url,wait_until='commit',timeout=budget)
                    observed['commitReached']=True
                    remaining=max(1,HARD_WALL_MS-(time.monotonic()-started)*1000)
                    page.wait_for_function('p=>globalThis[p.token]?globalThis[p.token].state.done===true:performance.timeOrigin+performance.now()-p.start>p.budget',arg=dict(token=token,start=clock.start,budget=budget),timeout=remaining,polling=50)
                else:response=page.goto(url,wait_until='load',timeout=budget)
            except BaseException as error:original=error
            finally:
                if observed['covered']and not observed['commitReached']and original is not None:
                    # The goto RPC has already failed at its original deadline.
                    # Stop the still-pending request before any context readback;
                    # evaluating during a pending commit can itself block.
                    try:
                        session.send('Page.stopLoading');observed['preCommitStoppedAfterFailure']=True
                    except Exception as error:errors.append(repr(error))
                if observed['covered']:
                    try:
                        end=session.send('Runtime.evaluate',dict(expression=f'(async()=>{{await globalThis[{json.dumps(token)}]?.finish();return performance.timeOrigin+performance.now()}})()',returnByValue=True,awaitPromise=True))
                        if 'exceptionDetails'in end:raise RuntimeError(end['exceptionDetails'])
                        observed['timing']=clock.sample(end['result']['value'])
                    except Exception as error:
                        errors.append(repr(error))
                        if clock.completed is not None:observed['timing']=clock.completed;observed['completedReceiptRetained']=True
                        else:clock.lost=True
            if observed['covered']and clock.result is not None:
                raise TimeoutError('Navigation shared budget expired: '+json.dumps(clock.result))from original
            if original is not None:raise original
            if observed['covered']and(clock.completed is None or not clock.completed['withinBudget']):
                errors.append('No successful completed-load receipt; no credit for missing observation')
                raise TimeoutError('No successful completed-load receipt: '+json.dumps(observed))
            if errors and (clock is None or clock.completed is None)and(time.monotonic()-started)*1000>budget:
                raise TimeoutError('Navigation observations missing; charge original wall budget: '+json.dumps(errors))
            outcome='passed'
    finally:
        cleanup=[]
        if session is not None:
            for method,args in [('Runtime.evaluate',dict(expression=f'globalThis[{json.dumps(token)}]?.finish()',awaitPromise=True))if script_id else(None,None),
                                ('Page.removeScriptToEvaluateOnNewDocument',dict(identifier=script_id))if script_id else(None,None)]:
                if method is None:continue
                try:
                    result=session.send(method,args)
                    if 'exceptionDetails'in result:raise RuntimeError(result['exceptionDetails'])
                    cleanup.append(dict(method=method,passed=True))
                except Exception as error:cleanup.append(dict(method=method,passed=False,error=repr(error)))
            try:session.detach();cleanup.append(dict(method='detach',passed=True))
            except Exception as error:cleanup.append(dict(method='detach',passed=False,error=repr(error)))
        if entry is not None:entry['receive']=None
        cleanup_error=None
        if outcome=='passed'and any(not row['passed']for row in cleanup):
            outcome='failed';cleanup_error=AssertionError('Navigation observer cleanup failed: '+json.dumps(cleanup))
        observed.update(cleanup=cleanup,bridgeDisarmed=entry is None or entry['receive']is None,
                        bridgeLifetime='One public exposed binding per Page, inactive after each wait; released with Page. No retained clock or observer/timer.',
                        outcome=outcome,hostWallMs=(time.monotonic()-started)*1000,
                        documents=clock.documents if clock else{},intervals=clock.intervals if clock else[],
                        messages=messages,observationErrors=errors,protocolExceptions=protocol_errors)
        from pathlib import Path
        path=Path(artifact_dir)/('navigation-budget-'+label+'.json');path.parent.mkdir(parents=True,exist_ok=True)
        try:path.write_text(json.dumps(observed,indent=2)+'\n')
        except OSError as error:observed['artifactWriteError']=repr(error)
        print('[navigation-budget] '+json.dumps(observed),flush=True)
        record_wait_wall(site=site,label=label,kind='navigation-load',outcome=outcome,
                         host_elapsed_ms=observed['hostWallMs'],browser=observed.get('timing'),policy=policy,
                         error_type=type(original or cleanup_error).__name__ if original or cleanup_error else None)
        if cleanup_error is not None:raise cleanup_error
    return response
