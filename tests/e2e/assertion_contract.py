"""Shared numeric tolerances and event-anchored harness assertions (#43/#50)."""
from __future__ import annotations
from contextlib import contextmanager, suppress
import json
import math
from pathlib import Path
import time

# Existing budgets, not larger values inferred from host/RAF observation delay.
BUDGET_MS = {'native-selection': 600, 'native-clipboard': 5000, 'false-presented-control': 100,
             'resize-readiness': 30_000}  # Existing Playwright default, made explicit; #70.
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
    A correct value observed after the unchanged native-event budget still fails.
    """
    config = dict(mode='event-dom' if asynchronous else 'native', label=label,
                  expected=expected, budgetMs=budget_ms(policy), event=event,
                  selector=selector, key=key, requireTransition=require_transition, arg=arg, site=site)
    expression = '(payload)=>(' + RUNTIME + ')(payload,(' + reader + '),(' + STALL_RUNTIME + '))'
    receipt = page.evaluate_handle(expression, config)
    checked = False
    def check():
        nonlocal checked
        readback_started = time.monotonic()
        result = page.evaluate('receipt=>receipt.inspect()', receipt)
        result['readbackQueryElapsedMs'] = (time.monotonic()-readback_started)*1000
        checked = True
        print('[shared-assertion] ' + json.dumps(result), flush=True)
        assert result['passed'], result
        return result
    try:
        yield check
    except BaseException as original_error:
        if not checked:
            # A failed input action must also leave attribution. Read only;
            # never await a late arrival or replace the original exception.
            with suppress(Exception):
                result = page.evaluate('receipt=>receipt.snapshot()', receipt)
                result['inputActionError'] = dict(exception=type(original_error).__name__,error=str(original_error))
                print('[shared-assertion] ' + json.dumps(result), flush=True)
        raise
    finally:
        with suppress(Exception):
            page.evaluate('receipt=>receipt.dispose()', receipt)
        with suppress(Exception):
            receipt.dispose()


@contextmanager
def deadline_diagnostics(page, *, label, policy, site, prelude=None):
    """Observe an existing bounded wait; do not change its predicate or budget."""
    budget = budget_ms(policy)
    report = dict(label=label,site=site,policy=policy,timeoutMs=budget,waitStarted=False,
                  clockAlignment='Browser anchor precedes caller preparation and the wait RPC. Use caller preparation/readback elapsed times and actual browser observation timestamps; this anchor is not an exact Playwright deadline.')
    receipt = None
    anchor_started = time.monotonic()
    started = anchor_started
    outcome, error = 'passed', None
    try:
        try:
            receipt = page.evaluate_handle('''config => {
              const observer=(''' + STALL_RUNTIME + ''')();
              let startedAtMs=config.deferredStart ? null : performance.now();
              return {dispose:observer.dispose, begin:()=>{startedAtMs=performance.now();},
                finish:()=>observer.finish({startedAtMs,
                  timeoutMs:config.budgetMs,completedAtMs:performance.now()})};
            }''', dict(budgetMs=budget, deferredStart=prelude is not None))
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
        if receipt is not None:
            with suppress(Exception): page.evaluate('receipt=>receipt.dispose()', receipt)
            with suppress(Exception): receipt.dispose()
