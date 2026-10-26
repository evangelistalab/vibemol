"""Real-driver contract checks for the shared harness; no VibeMol product source."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError
from assertion_contract import state_after_input, deadline_diagnostics, budget_ms, wait_for_budget
from helpers import wait_for_presented_state


def main():
    out=Path(os.environ['VIBEMOL_TEST_ARTIFACT_DIR']);out.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True)
        page=browser.new_page()
        try:
            page.set_content('<canvas id="canvas" width="200" height="100"></canvas><div id="state"></div>')
            false_rejected=False
            try:
                with deadline_diagnostics(page,label='contract original timeout',policy='false-presented-control',
                        site='presented-state.false-control') as negative:
                    wait_for_budget(page,'()=>false',negative)
            except TimeoutError:
                false_rejected=True
            negative_comparands=dict(actual=dict(falseRejected=false_rejected,outcome=negative['outcome'],
                timeoutMs=negative['timeoutMs'],observerError=negative.get('browser',{}).get('observerError','missing')),
                expected=dict(falseRejected=True,outcome='failed',timeoutMs=100,observerError=None))
            print('[stall-observer-contract] '+json.dumps(negative_comparands),flush=True)
            assert negative_comparands['actual']==negative_comparands['expected'],negative_comparands
            page.evaluate('''() => {
                window.model=[];window.pasted=false;
                requestAnimationFrame=()=>{throw new Error('Contract must not wait for RAF')};
                document.getElementById('canvas').addEventListener('pointerup',()=>{
                    // Deliberate test-only stall, far below the unchanged600ms
                    // input budget. Prove real long-task delivery, not a mock.
                    const end=performance.now()+80;while(performance.now()<end){}
                    model=[0];
                });
                window.addEventListener('keydown',event=>{
                    if(event.key.toLowerCase()==='v' && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault();
                        queueMicrotask(()=>{pasted=true;document.getElementById('state').textContent='ready'});
                    }
                });
            }''')
            with state_after_input(page,'()=>model.slice()',[0],label='contract native') as check:
                page.mouse.click(30,30)
                native=check()
            stall_comparands=dict(actual=dict(hadOverlap=native['stalls']['hadLongTaskOverlap'],
                overlapMs=native['stalls']['longTaskOverlapMs']),expected=dict(hadOverlap=True,overlapMs='>0'))
            print('[stall-observer-contract] '+json.dumps(stall_comparands),flush=True)
            assert stall_comparands['actual']['hadOverlap'] is True and stall_comparands['actual']['overlapMs']>0,stall_comparands
            missing_failed=False
            try:
                with state_after_input(page,'()=>model.slice()',[0],label='contract missing native') as check:
                    check()
            except AssertionError:
                missing_failed=True
            assert missing_failed,'A correct pre-existing value must not prove input'
            with state_after_input(page,'()=>pasted',True,label='contract async',policy='native-clipboard',
                                   event='keydown',selector=None,key='v',asynchronous=True,require_transition=True) as check:
                page.keyboard.press('Control+v')
                asynchronous=check()
            result=dict(native=native,asynchronous=asynchronous,missingNativeRejected=missing_failed,
                        negativeControl=negative,falseStateStillRejected=false_rejected,
                        noPollingFrame=True,browser=browser.version)
            # Synthetic page CPU work:80ms+700ms busy loops, no VibeMol and no
            # induced descheduling. This proves accounting, not environment
            # attribution: awaited product work could be discounted the same way.
            page.evaluate('''()=>document.getElementById('canvas').addEventListener('pointerup',()=>{
              const end=performance.now()+700;while(performance.now()<end){}
            })''')
            with state_after_input(page,'()=>model.slice()',[0],label='synthetic CPU:80ms+700ms busy loops',site='control.synthetic-cpu') as check:
                page.mouse.click(30,30)
                stalled_native=check()
            comparands=dict(actual=dict(passed=stalled_native['passed'],
                beyondOriginalWall=stalled_native['elapsedMs']>600,
                withinResponsive=stalled_native['stalls']['responsiveElapsedMs']<=600,
                hardWallMs=stalled_native['stalls']['hardWallMs']),
                expected=dict(passed=True,beyondOriginalWall=True,withinResponsive=True,hardWallMs=180000))
            print('[budget-control] '+json.dumps(comparands),flush=True)
            assert comparands['actual']==comparands['expected'],comparands
            page.evaluate('''()=>document.getElementById('canvas').addEventListener('pointerup',()=>{
              model=[1];setTimeout(()=>{model=[0]},0);
            })''')
            wrong_rejected=False;wrong_receipt=None
            try:
                with state_after_input(page,'()=>model.slice()',[0],label='budget wrong completion') as check:
                    page.mouse.click(30,30)
                    check()
            except AssertionError as error:
                wrong_rejected=True;wrong_receipt=error.args[0]
            assert isinstance(wrong_receipt,dict) and wrong_receipt['actual']==[1] and wrong_receipt['passed']is False,wrong_receipt
            assert wrong_rejected,'A later correct state must never repair wrong native completion'
            result['budgetControls']=dict(controlNature=dict(kind='synthetic page CPU work',busyLoopsMs=[80,700],appLoaded=False,deschedulingInduced=False),stalledNative=stalled_native,wrongCompletionRejected=wrong_rejected,wrongNativeReceipt=wrong_receipt)
            # The native-input control deliberately forbids RAF. Retire it before
            # testing a distinct contract that explicitly requires presentation.
            page.close()
            page=browser.new_page()
            page.set_content('<p>Resize observation control</p><button id="resizeAction">Resize</button>')
            # #70: exercise success and failure of the existing framed wait with
            # six numeric comparands. The negative control keeps the existing100ms.
            page.evaluate('''()=>{window.resizeState={actual:[99,100,100,100,100,100],expected:[100,100,100,100,100,100]};}''')
            reader='''()=>({comparands:Object.fromEntries(['cssWidth','cssHeight','canvasWidth','canvasHeight','bufferWidth','bufferHeight']
              .map((key,i)=>[key,{actual:resizeState.actual[i],expected:resizeState.expected[i],
                passed:resizeState.actual[i]===resizeState.expected[i]}]))})'''
            predicate='()=>resizeState.actual.every((value,i)=>value===resizeState.expected[i])'
            resize_negative=dict(reader=reader,observations=[])
            resize_rejected=False
            try:
                with deadline_diagnostics(page,label='resize comparand negative control',
                        policy='false-presented-control',site='resize-comparand.negative') as resize_deadline:
                    wait_for_presented_state(page,predicate,timeout=budget_ms('false-presented-control'),diagnostics=resize_negative,budget=resize_deadline)
            except TimeoutError:
                resize_rejected=True
            last=resize_negative['observations'][-1]
            comparands=last['state']['comparands']
            check=dict(actual=dict(rejected=resize_rejected,phase=last['phase'],
                failedKeys=[k for k,v in comparands.items()if not v['passed']],errors=resize_negative.get('errors',[])),
                expected=dict(rejected=True,phase='failed',failedKeys=['cssWidth'],errors=[]))
            print('[resize-probe] '+json.dumps(check),flush=True);assert check['actual']==check['expected'],check
            check=dict(actual=dict(pollsObserved=last['pollCount']>0,pollError=last['pollError'],
                dropped=last['droppedObservations'],everyObservedPollFalse=all(not x['predicatePassed']for x in last['history']if x['phase']=='poll')),
                expected=dict(pollsObserved=True,pollError=None,dropped=0,everyObservedPollFalse=True))
            print('[resize-probe] '+json.dumps(check),flush=True);assert check['actual']==check['expected'],check
            resize_positive=dict(reader=reader,observations=[])
            page.evaluate('''()=>document.getElementById('resizeAction').addEventListener('click',()=>{
              const end=performance.now()+80;while(performance.now()<end){}resizeState.actual[0]=100;
            })''')
            def resize_prelude():
                page.locator('#resizeAction').click()
            with deadline_diagnostics(page,label='resize comparand positive control',policy='resize-readiness',
                    site='resize-comparand.positive',prelude=resize_prelude) as resize_pass_deadline:
                wait_for_presented_state(page,predicate,timeout=budget_ms('resize-readiness'),diagnostics=resize_positive,budget=resize_pass_deadline)
            last=resize_positive['observations'][-1]
            check=dict(actual=dict(phase=last['phase'],presentation=last['presentation']['actual'],
                allComparands=all(x['passed']for x in last['state']['comparands'].values()),
                timeoutMs=resize_pass_deadline['timeoutMs'],errors=resize_positive.get('errors',[])),
                expected=dict(phase='passed',presentation=True,allComparands=True,timeoutMs=30000,errors=[]))
            print('[resize-probe] '+json.dumps(check),flush=True);assert check['actual']==check['expected'],check
            check=dict(actual=dict(successfulPoll=any(x['phase']=='poll'and x['predicatePassed']is True for x in last['history']),
                pollError=last['pollError'],dropped=last['droppedObservations']),expected=dict(successfulPoll=True,pollError=None,dropped=0))
            print('[resize-probe] '+json.dumps(check),flush=True);assert check['actual']==check['expected'],check
            stalls=resize_pass_deadline['browser']
            prelude_tasks=[e for e in stalls['longTasks']if e['duration']>=50
                and e['startTime']+e['duration']<=stalls['wait']['startedAtMs']]
            check=dict(actual=dict(preludeLongTask=bool(prelude_tasks),
                preludeLeakedIntoWait=any(e in stalls['longTasksOverlappingWait']for e in prelude_tasks),observerError=stalls['observerError']),
                expected=dict(preludeLongTask=True,preludeLeakedIntoWait=False,observerError=None))
            print('[resize-probe] '+json.dumps(check),flush=True);assert check['actual']==check['expected'],check
            result['resizeDiagnostics']=dict(negative=resize_negative,negativeDeadline=resize_deadline,
                positive=resize_positive,positiveDeadline=resize_pass_deadline,falseStateStillRejected=resize_rejected)
            (out/'result.json').write_text(json.dumps(result,indent=2)+'\n')
            print('[assertion-contract-probe] '+json.dumps(result),flush=True)
        finally:
            browser.close()
        assert not browser.is_connected(),'Contract probe browser must retire before Smoke'
    return 0


if __name__=='__main__':
    raise SystemExit(main())
