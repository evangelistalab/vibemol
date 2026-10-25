"""Shared numeric tolerances and event-anchored harness assertions (#43/#50)."""
from __future__ import annotations
from contextlib import contextmanager, suppress
import json
import math
from pathlib import Path

# Existing budgets, not larger values inferred from host/RAF observation delay.
BUDGET_MS = {'native-selection': 600, 'native-clipboard': 5000, 'false-presented-control': 100}
RUNTIME = Path(__file__).with_name('assertion_runtime.js').read_text()


def budget_ms(policy):
    return BUDGET_MS[policy]


def numbers_close(actual, expected, *, rel_tol=1e-9, abs_tol=1e-12):
    # Callers retain their original type/structure checks and tolerance values.
    return math.isclose(actual, expected, rel_tol=rel_tol, abs_tol=abs_tol)


@contextmanager
def state_after_input(page, reader, expected, *, label, policy='native-selection',
                      event='pointerup', selector='#canvas', key=None, asynchronous=False,
                      require_transition=False, arg=None):
    """Capture the value at native completion, or a DOM-backed async arrival.

    No polling frame, sleep, retry, selection repair or host-clock deadline.
    A correct value observed after the unchanged native-event budget still fails.
    """
    config = dict(mode='event-dom' if asynchronous else 'native', label=label,
                  expected=expected, budgetMs=budget_ms(policy), event=event,
                  selector=selector, key=key, requireTransition=require_transition, arg=arg)
    expression = '(payload)=>(' + RUNTIME + ')(payload,(' + reader + '))'
    receipt = page.evaluate_handle(expression, config)
    def check():
        result = page.evaluate('receipt=>receipt.inspect()', receipt)
        print('[shared-assertion] ' + json.dumps(result), flush=True)
        assert result['passed'], result
        return result
    try:
        yield check
    finally:
        with suppress(Exception):
            page.evaluate('receipt=>receipt.dispose()', receipt)
        with suppress(Exception):
            receipt.dispose()
