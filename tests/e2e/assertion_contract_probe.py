"""Real-driver contract checks for the shared harness; no VibeMol product source."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from assertion_contract import state_after_input


def main():
    out=Path(os.environ['VIBEMOL_TEST_ARTIFACT_DIR']);out.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True)
        page=browser.new_page()
        try:
            page.set_content('<canvas id="canvas" width="200" height="100"></canvas><div id="state"></div>')
            page.evaluate('''() => {
                window.model=[];window.pasted=false;
                requestAnimationFrame=()=>{throw new Error('Contract must not wait for RAF')};
                document.getElementById('canvas').addEventListener('pointerup',()=>{model=[0]});
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
                        noPollingFrame=True,browser=browser.version)
            (out/'result.json').write_text(json.dumps(result,indent=2)+'\n')
            print('[assertion-contract-probe] '+json.dumps(result),flush=True)
        finally:
            browser.close()
        assert not browser.is_connected(),'Contract probe browser must retire before Smoke'
    return 0


if __name__=='__main__':
    raise SystemExit(main())
