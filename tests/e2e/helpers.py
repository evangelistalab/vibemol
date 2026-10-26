from __future__ import annotations

import contextlib
import http.client
import json
import pathlib
import re
import socket
import subprocess
import sys
import time
from typing import Iterator


def read_app_version() -> str:
    root = pathlib.Path(__file__).resolve().parents[2]
    source = (root / 'assets/app/js/asset-urls.js').read_text()
    return re.search(r"const APP_VERSION = '([^']+)';", source).group(1)


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen(1)
        return int(sock.getsockname()[1])


@contextlib.contextmanager
def run_http_server(root: pathlib.Path) -> Iterator[str]:
    port = find_free_port()
    process = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=str(root),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    base_url = f"http://127.0.0.1:{port}/"
    deadline = time.time() + 15.0
    try:
        while time.time() < deadline:
            try:
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=0.5)
                conn.request("GET", "/")
                response = conn.getresponse()
                response.read()
                if response.status < 500:
                    break
            except OSError:
                time.sleep(0.1)
            finally:
                with contextlib.suppress(Exception):
                    conn.close()  # type: ignore[name-defined]
        else:
            raise RuntimeError(f"Timed out waiting for local server at {base_url}")
        yield base_url
    finally:
        process.terminate()
        with contextlib.suppress(subprocess.TimeoutExpired):
            process.wait(timeout=5)
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)


def ensure_artifact_dir(root: pathlib.Path) -> pathlib.Path:
    root.mkdir(parents=True, exist_ok=True)
    return root


def wait_for_presented_state(page, predicate: str, *, timeout=None, diagnostics=None, budget=None) -> None:
    """Poll app state after presentation, using Stage 0's two-frame boundary.

    The app renders in requestAnimationFrame. The second callback observes the
    previous frame after presentation; the predicate checks the actual app/DOM
    state. A failed wait propagates once, without sleeping or timeout retries.
    """
    options = {} if timeout is None else {'timeout': timeout}
    # Playwright tests the immediate predicate return for truthiness: an async
    # predicate's Promise succeeds even when it later resolves to false. Keep
    # the presentation boundary separate and the polled app predicate sync.
    preparation_started = time.monotonic()
    boundary = page.evaluate_handle('''() => {
        const boundary = {presented: false};
        requestAnimationFrame(() => requestAnimationFrame(() => {boundary.presented = true;}));
        return boundary;
    }''')
    def observe(phase):
        if diagnostics is None: return
        try:
            reader = diagnostics.get('reader', '()=>null')
            readback_started = time.monotonic()
            row = page.evaluate('''({boundary,phase,timeoutMs})=>{
              if(!boundary.capture){
                const history=[];let signature=null,dropped=0,polls=0,lastPoll=null,maxPollGap=0,firstPoll=null;
                boundary.capture=(reason,ready)=>{
                  const state=(''' + reader + ''')(),observedAtMs=performance.now();
                  const row={observedAtMs,phase:reason,presentation:{actual:boundary.presented,expected:true},
                    state,predicatePassed:ready===undefined?null:!!ready};
                  if(reason==='poll'){
                    if(lastPoll!==null)maxPollGap=Math.max(maxPollGap,observedAtMs-lastPoll);
                    if(firstPoll===null)firstPoll=observedAtMs;lastPoll=observedAtMs;polls++;
                  }
                  const next=JSON.stringify([row.presentation,state,row.predicatePassed]);
                  if(next!==signature||reason!=='poll'){
                    if(history.length<256)history.push(row);else dropped++;
                    signature=next;
                  }
                  return row;
                };
                boundary.pollObserve=ready=>{
                  try{boundary.capture('poll',ready);}catch(error){boundary.pollError=String(error);}
                };
                boundary.inspect=reason=>{
                  if(reason==='passed'||reason==='failed')clearTimeout(boundary.deadlineTimer);
                  const row=boundary.capture(reason);
                  return {...row,history:history.slice(),droppedObservations:dropped,
                    pollError:boundary.pollError||null,pollCount:polls,firstPollAtMs:firstPoll,
                    lastPollAtMs:lastPoll,maxPollGapMs:maxPollGap,
                    deadlineSample:boundary.deadlineSample||null};
                };
                if(Number.isFinite(timeoutMs)&&timeoutMs>0){
                  const scheduledAtMs=performance.now()+timeoutMs;
                  boundary.deadlineTimer=setTimeout(()=>{
                    try{const row=boundary.capture('deadline callback');
                      boundary.deadlineSample={...row,scheduledAtMs,latenessMs:row.observedAtMs-scheduledAtMs};
                    }catch(error){boundary.pollError=String(error);}
                  },timeoutMs);
                }
              }
              return boundary.inspect(phase);
            }''', dict(boundary=boundary,phase=phase,timeoutMs=diagnostics.get('timeoutMs',timeout)))
            row['phase'] = phase
            row['readbackQueryElapsedMs'] = (time.monotonic()-readback_started)*1000
            diagnostics.setdefault('observations', []).append(row)
            print('[presented-state-comparands] ' + json.dumps(row), flush=True)
        except Exception as error:
            diagnostics.setdefault('errors', []).append(dict(phase=phase,error=str(error)))
            print('[presented-state-comparands] ' + json.dumps(diagnostics['errors'][-1]), flush=True)
    outcome = 'failed'
    observe('before wait')
    if diagnostics is not None:
        diagnostics['preparationElapsedMs'] = (time.monotonic()-preparation_started)*1000
        diagnostics['deadlineCaveat'] = 'The last before-wait browser observation precedes the wait RPC. Failed readbacks are later observations, never exact deadline snapshots.'
    wait_started = time.monotonic()
    try:
        expression = 'boundary => boundary.presented && (' + predicate + ')()'
        if diagnostics is not None:
            # Observe the exact original result; never replace its predicate,
            # coerce its return or retry it. The shared budget separately accounts for stalls.
            expression = 'boundary => {const ready=boundary.presented && (' + predicate + ')(); if(boundary.pollObserve)boundary.pollObserve(ready); return ready;}'
        if budget is not None and timeout != 0:
            from assertion_contract import wait_for_budget
            wait_for_budget(page,expression,budget,arg=boundary)
        else:
            page.wait_for_function(expression,arg=boundary,**options)
        outcome = 'passed'
    finally:
        if diagnostics is not None: diagnostics['waitCallElapsedMs'] = (time.monotonic()-wait_started)*1000
        observe(outcome)
        boundary.dispose()


def write_failure_artifacts(page, artifact_dir: pathlib.Path, name: str, page_errors: list[str], console_errors: list[str]) -> None:
    ensure_artifact_dir(artifact_dir)
    png_path = artifact_dir / f"{name}.png"
    html_path = artifact_dir / f"{name}.html"
    log_path = artifact_dir / f"{name}.log"
    with contextlib.suppress(Exception):
        page.screenshot(path=str(png_path), full_page=True)
    with contextlib.suppress(Exception):
        html_path.write_text(page.content(), encoding="utf-8")
    log_lines = ["[page errors]"]
    log_lines.extend(page_errors or ["(none)"])
    log_lines.append("")
    log_lines.append("[console errors]")
    log_lines.extend(console_errors or ["(none)"])
    log_path.write_text("\n".join(log_lines) + "\n", encoding="utf-8")


def run_appearance_scenarios(root: pathlib.Path, artifact_dir: pathlib.Path, scenarios) -> None:
    """Run the existing Looks scenarios independently with their original setup."""
    from playwright.sync_api import sync_playwright

    with run_http_server(root) as url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for scenario in scenarios:
                context = browser.new_context(viewport={"width": 1200, "height": 1000}, device_scale_factor=1)
                page = context.new_page()
                errors, console_errors = [], []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
                page.on("dialog", lambda dialog: dialog.dismiss())
                try:
                    page.goto(url + "?workspaceLab=0")
                    page.wait_for_function("() => window.VibeMolAppearanceLooks")
                    scenario(page, context, url)
                    assert not errors, errors
                except Exception:
                    write_failure_artifacts(page, artifact_dir, "appearance-" + scenario.__name__, errors, console_errors)
                    raise
                finally:
                    context.close()
        finally:
            browser.close()
