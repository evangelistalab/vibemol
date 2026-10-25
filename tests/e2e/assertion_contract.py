"""Shared numeric tolerances and event-anchored harness assertions (#43/#50)."""
from __future__ import annotations
from contextlib import contextmanager, suppress
import json
import math
from pathlib import Path
import time

# Existing budgets, not larger values inferred from host/RAF observation delay.
BUDGET_MS = {'native-selection': 600, 'native-clipboard': 5000, 'false-presented-control': 100}
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
        result = page.evaluate('receipt=>receipt.inspect()', receipt)
        checked = True
        print('[shared-assertion] ' + json.dumps(result), flush=True)
        assert result['passed'], result
        return result
    try:
        yield check
    except BaseException:
        if not checked:
            # A failed input action must also leave attribution. Read only;
            # never await a late arrival or replace the original exception.
            with suppress(Exception):
                result = page.evaluate('receipt=>receipt.snapshot()', receipt)
                print('[shared-assertion] ' + json.dumps(result), flush=True)
        raise
    finally:
        with suppress(Exception):
            page.evaluate('receipt=>receipt.dispose()', receipt)
        with suppress(Exception):
            receipt.dispose()


@contextmanager
def deadline_diagnostics(page, *, label, policy, site):
    """Observe an existing bounded wait; do not change its predicate or budget."""
    budget = budget_ms(policy)
    report = dict(label=label,site=site,policy=policy,timeoutMs=budget,
                  clockAlignment='Browser anchor precedes the original wait RPC; anchorCallElapsedMs bounds alignment uncertainty.')
    receipt = None
    anchor_started = time.monotonic()
    try:
        receipt = page.evaluate_handle('''config => {
          const observer=(''' + STALL_RUNTIME + ''')();
          const startedAtMs=performance.now();
          return {dispose:observer.dispose, finish:()=>observer.finish({startedAtMs,
            timeoutMs:config.budgetMs,completedAtMs:performance.now()})};
        }''', dict(budgetMs=budget))
    except Exception as diagnostic_error:
        report['installError'] = str(diagnostic_error)
    started = time.monotonic()
    outcome, error = 'passed', None
    try:
        yield report
    except BaseException as caught:
        outcome, error = 'failed', dict(exception=type(caught).__name__,error=str(caught))
        raise
    finally:
        report.update(outcome=outcome,anchorCallElapsedMs=(started-anchor_started)*1000,
                      waitElapsedMs=(time.monotonic()-started)*1000)
        if error: report.update(error)
        try:
            if receipt is not None:
                report['browser'] = page.evaluate('receipt=>receipt.finish()', receipt)
        except Exception as diagnostic_error:
            report['readbackError'] = str(diagnostic_error)
        print('[shared-deadline] ' + json.dumps(report),flush=True)
        if receipt is not None:
            with suppress(Exception): page.evaluate('receipt=>receipt.dispose()', receipt)
            with suppress(Exception): receipt.dispose()
