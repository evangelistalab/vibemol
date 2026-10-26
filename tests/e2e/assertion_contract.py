"""Shared numeric tolerances and event-anchored harness assertions (#43/#50)."""
from __future__ import annotations
from contextlib import contextmanager, suppress
import json
import math
from pathlib import Path
import time
from wall_times import record_wait_wall

# #43: this budget cannot reliably catch a product slowdown: it credits the
# page's own awaited work as well as descheduling. It is a functional value/
# eventual-completion guard, not a performance detector. Correct slow results
# can pass up to the180s ceiling; uncredited responsive time can still expire.
# Compare the independent raw wall records to the stored reference for review;
# no performance drift threshold is imposed.
# Existing budgets, not larger values inferred from host/RAF observation delay.
BUDGET_MS = {'native-selection': 600, 'native-clipboard': 5000, 'false-presented-control': 100,
             'resize-readiness': 30_000, 'figure-preview': 30_000, 'navigation-load': 30_000}  # Existing Playwright default, made explicit; #70.
HARD_WALL_MS = 180_000
RUNTIME = Path(__file__).with_name('assertion_runtime.js').read_text()
STALL_RUNTIME = Path(__file__).with_name('stall_diagnostics.js').read_text()


def budget_ms(policy):
    return BUDGET_MS[policy]


def numbers_close(actual, expected, *, rel_tol=1e-9, abs_tol=1e-12):
    # Callers retain their original type/structure checks and tolerance values.
    return math.isclose(actual, expected, rel_tol=rel_tol, abs_tol=abs_tol)


@contextmanager
def state_after_input(page, reader, expected, *, label, policy='native-selection',
                      event='pointerup', selector='#canvas', key=None, asynchronous=False,
                      require_transition=False, arg=None, site='native-selection'):
    """Capture the value at native completion, or a DOM-backed async arrival.

    No polling frame, sleep, retry, selection repair or host-clock deadline.
    Native completion is latched, never repaired by a later arrival. Timing uses
    the original responsive budget plus an independent180s hard wall.
    """
    config = dict(mode='event-dom' if asynchronous else 'native', label=label,
                  expected=expected, budgetMs=budget_ms(policy), hardWallMs=HARD_WALL_MS, event=event,
                  selector=selector, key=key, requireTransition=require_transition, arg=arg, site=site)
    expression = '(payload)=>(' + RUNTIME + ')(payload,(' + reader + '),(' + STALL_RUNTIME + '))'
    receipt=None;checked=False;last_result=None;attempt_error=None
    attempt_started=time.monotonic()
    def check():
        nonlocal checked,last_result
        readback_started = time.monotonic()
        if asynchronous:
            page.wait_for_function('receipt=>!receipt.received || receipt.complete',arg=receipt,timeout=HARD_WALL_MS,polling=50)
        result = page.evaluate('receipt=>receipt.snapshot()', receipt)
        result['readbackQueryElapsedMs'] = (time.monotonic()-readback_started)*1000
        checked=True;last_result=result
        print('[shared-assertion] ' + json.dumps(result), flush=True)
        assert result['passed'], result
        return result
    try:
        receipt=page.evaluate_handle(expression,config)
        yield check
    except BaseException as original_error:
        attempt_error=type(original_error).__name__
        if receipt is not None and not checked:
            with suppress(Exception):
                last_result=page.evaluate('receipt=>receipt.snapshot()',receipt)
                last_result['inputActionError']=dict(exception=attempt_error,error=str(original_error))
                print('[shared-assertion] '+json.dumps(last_result),flush=True)
        raise
    finally:
        outcome='failed' if attempt_error else 'passed' if checked and last_result['passed'] else 'unasserted'
        record_wait_wall(site=site,label=label,kind='native-receipt' if not asynchronous else 'DOM-backed-receipt',
            outcome=outcome,host_elapsed_ms=(time.monotonic()-attempt_started)*1000,
            browser=(last_result or {}).get('stalls'),policy=policy,error_type=attempt_error)
        if receipt is not None:
            with suppress(Exception):page.evaluate('receipt=>receipt.dispose()',receipt)
            with suppress(Exception):receipt.dispose()


@contextmanager
def deadline_diagnostics(page, *, label, policy, site, prelude=None):
    """Install before prelude; charge only observed responsive wait time."""
    budget = budget_ms(policy)
    report = dict(label=label,site=site,policy=policy,timeoutMs=budget,hardWallMs=HARD_WALL_MS,waitStarted=False,
                  clockAlignment='Browser anchor precedes caller preparation and the wait RPC. Use caller preparation/readback elapsed times and actual browser observation timestamps; this anchor is not an exact Playwright deadline.')
    receipt = None
    anchor_started = time.monotonic()
    started = anchor_started
    outcome, error = 'passed', None
    try:
        try:
            receipt = page.evaluate_handle('''config => {
              const observer=(''' + STALL_RUNTIME + ''')();
              let budget=null;
              const begin=()=>{budget=observer.budget(performance.now(),config.budgetMs,config.hardWallMs);};
              if(!config.deferredStart)begin();
              return {dispose:observer.dispose,begin,
                step:ready=>budget.step(ready),
                finish:()=>budget?.result?.timing || (budget ? budget.sample() : observer.sample({}))};
            }''', dict(budgetMs=budget,hardWallMs=HARD_WALL_MS,deferredStart=prelude is not None))
            report['_receipt'] = receipt
        except Exception as diagnostic_error:
            report['installError'] = str(diagnostic_error)
        if prelude is not None:
            prelude_started = time.monotonic()
            try:
                prelude()
            finally:
                report['preludeElapsedMs'] = (time.monotonic()-prelude_started)*1000
            # The observer covers the resize itself, but the unchanged wait's
            # deadline starts afterwards. Never charge prelude time to the wait.
            anchor_started = time.monotonic()
            try:
                if receipt is not None: page.evaluate('receipt=>receipt.begin()', receipt)
            except Exception as diagnostic_error:
                report['anchorError'] = str(diagnostic_error)
        started = time.monotonic()
        report['waitStarted'] = True
        yield report
    except BaseException as caught:
        outcome, error = 'failed', dict(exception=type(caught).__name__,error=str(caught))
        raise
    finally:
        report.pop('_receipt',None)
        report.update(outcome=outcome,anchorCallElapsedMs=(started-anchor_started)*1000,
                      waitElapsedMs=(time.monotonic()-started)*1000)
        if error: report.update(error)
        readback_started = time.monotonic()
        try:
            if receipt is not None:
                report['browser'] = page.evaluate('receipt=>receipt.finish()', receipt)
        except Exception as diagnostic_error:
            report['readbackError'] = str(diagnostic_error)
        report['readbackQueryElapsedMs'] = (time.monotonic()-readback_started)*1000
        print('[shared-deadline] ' + json.dumps(report),flush=True)
        record_wait_wall(site=site,label=label,kind='readiness',outcome=outcome,
            host_elapsed_ms=report['waitElapsedMs'],browser=report.get('browser'),policy=policy,
            error_type=(error or {}).get('exception'))
        if receipt is not None:
            with suppress(Exception): page.evaluate('receipt=>receipt.dispose()', receipt)
            with suppress(Exception): receipt.dispose()


def wait_for_budget(page, predicate, report, *, arg=None):
    """Exact synchronous predicate; responsive budget and independent hard wall.

    No retries after a failed observation. False values remain false regardless
    of discounts, and a correct value beyond either budget is still a failure.
    """
    receipt = report.get('_receipt')
    if receipt is None:
        report['fallback'] = 'No timing owner: charge all wall time at original deadline'
        return page.wait_for_function(predicate,arg=arg,timeout=report['timeoutMs'])
    expression='payload => payload.receipt.step((' + predicate + ')(payload.arg)).done'
    page.wait_for_function(expression,arg=dict(receipt=receipt,arg=arg),
                           timeout=report['hardWallMs'],polling=50)
    result=page.evaluate('receipt=>receipt.step(false)',receipt)
    report['budgetResult'] = result
    if not result['passed']:
        from playwright.sync_api import TimeoutError
        raise TimeoutError('Shared assertion expired: '+json.dumps(result))
    return result
