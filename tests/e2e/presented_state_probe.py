"""Issue #4 negative control: a false state must never satisfy a frame wait."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError
from helpers import wait_for_presented_state
from assertion_contract import budget_ms


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        # Demonstrate the original error independently of VibeMol: a Promise
        # resolving false is accepted because the immediate return is truthy.
        old_result = page.wait_for_function('async () => false').json_value()
        assert old_result is False
        false_rejected = False
        try:
            # This bounded negative control deliberately can NEVER pass. The
            # actual app-state probes use timeout=0, without timeout retries.
            wait_for_presented_state(page, '() => false', timeout=budget_ms('false-presented-control'))
        except TimeoutError:
            false_rejected = True
        assert false_rejected, 'A false presented-state predicate was accepted'
        wait_for_presented_state(page, '() => true', timeout=0)
        report = {'oldAsyncPredicateReturnedFalseWithoutWaiting': old_result is False,
                  'newFalsePredicateRejected': false_rejected,
                  'newTruePredicatePassed': True, 'browserVersion': browser.version}
        out = Path(os.environ['VIBEMOL_TEST_ARTIFACT_DIR'])
        out.mkdir(parents=True, exist_ok=True)
        (out/'presented-state-negative-control.json').write_text(json.dumps(report, indent=2)+'\n')
        print(json.dumps(report), flush=True)
        browser.close()


if __name__ == '__main__':
    main()
