"""Issue11 input-intent regressions; issue45 owns the independent clock gate."""
import json


def install_video_clock_gate(page):
    page.evaluate('''() => {
      if(window.__videoClockGate) return;
      const realNow=performance.now.bind(performance);
      const clock={held:false, fixed:0, realNow, samples:0, armedAt:realNow()};
      // render() passes performance.now() to BOTH playback owners. Frames,
      // CSS and Playwright actionability continue; only app time is held.
      performance.now=()=>clock.held ? clock.fixed : realNow();
      const sample=()=>{if(clock.held)clock.samples++; requestAnimationFrame(sample);};
      requestAnimationFrame(sample);
      window.__videoClockGate=clock;
    }''')


def hold_video_clock(page):
    page.evaluate('''() => {
      const c=__videoClockGate;
      if(c.held) throw new Error('A prior video clock hold leaked');
      c.fixed=c.realNow(); c.armedAt=c.fixed; c.samples=0; c.held=true;
    }''')


def release_video_clock(page):
    page.evaluate('() => {__videoClockGate.held=false;}')


def video_state(page, prefix):
    return page.evaluate('''prefix => {
      const overlay=document.getElementById(prefix+'VideoCropOverlay');
      const button=document.getElementById(prefix+'SaveVideoBtn');
      const c=window.__videoClockGate;
      return {mode:overlay.dataset.state, hidden:overlay.getAttribute('aria-hidden'),
        pressed:button.getAttribute('aria-pressed'),
        playDisabled:document.getElementById(prefix+'PlayBtn').disabled,
        resetDisabled:document.getElementById(prefix+'ResetBtn').disabled,
        downloads:(window.__trajectoryVideoExportTest || window.__nativeVideoActivation)?.downloads.length,
        downloadSource:window.__trajectoryVideoExportTest ? 'smoke stub' : 'native anchor',
        clockHeld:!!c?.held, appNow:performance.now(), fixed:c?.fixed,
        realElapsedMs:c ? c.realNow()-c.armedAt : null, heldFrames:c?.samples};
    }''', prefix)


def assert_video_state(page, prefix, case, **expected):
    actual = video_state(page, prefix)
    passed = all(actual.get(key) == value for key, value in expected.items())
    print('[video-activation] '+json.dumps(dict(prefix=prefix, case=case, actual=actual,
                                               expected=expected, passed=passed)), flush=True)
    assert passed, (prefix, case, actual, expected)
    return actual


def assert_idle(page, prefix, case, downloads):
    return assert_video_state(page, prefix, case, mode='idle', hidden='true', pressed='false',
                              playDisabled=False, resetDisabled=False, downloads=downloads)


def fresh_save(page, prefix, case, downloads):
    click_save(page, prefix)
    assert_video_state(page, prefix, case, mode='selecting', hidden='false', pressed='true',
                       downloads=downloads)


def click_save(page, prefix):
    click_video_control(page, prefix, 'SaveVideoBtn')


def click_video_control(page, prefix, suffix):
    # Measure the real hit target, then deliver real pointer events. The app
    # clock gate makes correctness independent of action-delivery latency.
    hit=page.locator('#'+prefix+suffix).evaluate('''el=>{
      const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return {x,y,width:r.width,height:r.height,disabled:el.disabled,
        reachable:el.contains(document.elementFromPoint(x,y))};
    }''')
    print('[video-button-hit] '+json.dumps(dict(prefix=prefix,control=suffix,actual=hit,
          expected=dict(disabled=False,reachable=True))),flush=True)
    assert hit['width']>0 and hit['height']>0 and not hit['disabled'] and hit['reachable'],hit
    page.mouse.click(hit['x'],hit['y'])


def begin_held_recording(page, prefix, case, downloads):
    hold_video_clock(page)
    fresh_save(page, prefix, case+' fresh Save', downloads)
    click_video_control(page, prefix, 'VideoCropStartBtn')
    # startRecordingSequence resets the playback timestamp to0. With app time
    # fixed, trajectory cannot advance a frame and vibration's delta stays0.
    # Natural completion cannot reach MediaRecorder.stop()/finalizeExport,
    # regardless of host scheduling delay before the input arrives.
    row=assert_video_state(page, prefix, case+' completion held', mode='recording', hidden='false',
                           pressed='true', downloads=downloads, clockHeld=True)
    assert row['appNow'] == row['fixed'], row


def wait_download_and_idle(page, prefix, downloads):
    import time
    started=time.monotonic()
    page.evaluate('() => {window.__videoWaitComparands=[];}')
    try:
        page.wait_for_function('''({prefix,downloads}) => {
          const count=(window.__trajectoryVideoExportTest || window.__nativeVideoActivation)?.downloads.length;
          const overlay=document.getElementById(prefix+'VideoCropOverlay');
          const row={at:__videoClockGate.realNow(),count,target:downloads,countType:typeof count,
            targetType:typeof downloads,mode:overlay.dataset.state,hidden:overlay.getAttribute('aria-hidden')};
          row.passed=count===downloads && row.mode==='idle' && row.hidden==='true';
          const rows=__videoWaitComparands,prior=rows[rows.length-1];
          if(!prior || prior.count!==row.count || prior.mode!==row.mode || prior.hidden!==row.hidden || row.passed)
            rows.push(row);
          return row.passed;
        }''', arg=dict(prefix=prefix, downloads=downloads))
    finally:
        actual=video_state(page,prefix)
        print('[video-completion-wait] '+json.dumps(dict(prefix=prefix,actual=actual,
              hostElapsedMs=(time.monotonic()-started)*1000,
              polls=page.evaluate('()=>__videoWaitComparands'),
              expected=dict(downloads=downloads,mode='idle',hidden='true'))),flush=True)


def early_stop_held_recording(page, prefix, downloads, native=False):
    """Called after Start with the clock already held, before a real Stop click."""
    button=page.locator('#'+prefix+'SaveVideoBtn')
    page.evaluate('''prefix => {
      document.getElementById(prefix+'SaveVideoBtn').addEventListener('pointerdown',()=>{
        window.__videoStopPress={mode:document.getElementById(prefix+'VideoCropOverlay').dataset.state,
          clockHeld:__videoClockGate.held, appNow:performance.now(), fixed:__videoClockGate.fixed};
      },{capture:true,once:true});
    }''', prefix)
    try:
        click_save(page, prefix)
        press=page.evaluate('() => __videoStopPress')
        expected=dict(mode='recording', clockHeld=True)
        print('[video-stop-press] '+json.dumps(dict(prefix=prefix, actual=press, expected=expected)), flush=True)
        assert all(press[k]==v for k,v in expected.items()) and press['appNow']==press['fixed'], press
    finally:
        release_video_clock(page)
    if not native:
        wait_download_and_idle(page, prefix, downloads)
        assert_idle(page, prefix, 'early Stop complete', downloads)


def completion_during_activation_matrix(page, prefix, downloads, native=False):
    """Real pointer/keyboard inputs; completion is released between start and click."""
    from contextlib import nullcontext
    for path in ['pointer', 'Space', 'Enter', 'click-only']:
        case='completion during '+path
        begin_held_recording(page, prefix, case, downloads)
        button=page.locator('#'+prefix+'SaveVideoBtn')
        with (page.expect_download() if native else nullcontext()) as download_event:
            try:
                if path=='pointer':
                    box=button.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
                    page.mouse.down()
                    assert_video_state(page,prefix,case+' pressed',mode='recording',clockHeld=True,downloads=downloads)
                    release_video_clock(page)
                    if native: download_event.value
                    else: wait_download_and_idle(page,prefix,downloads+1)
                    assert_idle(page,prefix,case+' completed before release',downloads+1)
                    page.mouse.up()
                elif path=='Space':
                    button.focus();page.keyboard.down('Space')
                    assert_video_state(page,prefix,case+' keydown',mode='recording',clockHeld=True,downloads=downloads)
                    release_video_clock(page)
                    if native: download_event.value
                    else: wait_download_and_idle(page,prefix,downloads+1)
                    assert_idle(page,prefix,case+' completed before keyup',downloads+1)
                    page.keyboard.up('Space')
                elif path=='Enter':
                    button.focus();page.keyboard.down('Enter')
                    if native: download_event.value
                    else: wait_download_and_idle(page,prefix,downloads+1)
                    page.keyboard.down('Enter')  # repeat must not become a fresh Save
                    page.keyboard.up('Enter')
                else:
                    # Accessibility/programmatic click has no preceding press;
                    # its activation starts and is consumed in this same turn.
                    button.evaluate('el=>el.click()')
                    if native: download_event.value
                    else: wait_download_and_idle(page,prefix,downloads+1)
            finally:
                release_video_clock(page)
        downloads+=1
        assert_idle(page,prefix,case+' final',downloads)
        fresh_save(page,prefix,case+' legitimate subsequent Save',downloads)
        page.locator('#'+prefix+'VideoCropCancelBtn').click()
        assert_idle(page,prefix,case+' cancel fresh selection',downloads)
    print('[video-export-completion] '+json.dumps(dict(prefix=prefix, downloads=downloads,
          naturalCompletion=True, earlyStop=True, pointerCompletion=True, spaceCompletion=True,
          enterActivation=True, clickOnlyActivation=True, freshSaveAssertions=4)), flush=True)
    return downloads


def main():
    """Focused native-recorder matrix, separate from Smoke's recorder stubs."""
    import argparse
    import hashlib
    import os
    from pathlib import Path
    import traceback
    from playwright.sync_api import sync_playwright
    from helpers import run_http_server, write_failure_artifacts
    root=Path(__file__).resolve().parents[2]
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root',type=Path,default=root)
    parser.add_argument('--launch',choices=['workbench','legacy'])
    parser.add_argument('--theme',choices=['light','dark'])
    parser.add_argument('--prefix',choices=['trajectory','vibration'])
    args=parser.parse_args()
    out=Path(os.environ.get('VIBEMOL_TEST_ARTIFACT_DIR',root/'out/test-artifacts/video-activation'))
    out.mkdir(parents=True,exist_ok=True)
    cases=[]
    with run_http_server(args.source_root) as url,sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        try:
            for launch in ([args.launch] if args.launch else ['workbench','legacy']):
                for theme in ([args.theme] if args.theme else ['light','dark']):
                    for prefix in ([args.prefix] if args.prefix else ['trajectory','vibration']):
                        label=launch+'-'+theme+'-'+prefix
                        context=browser.new_context(viewport=dict(width=1512,height=1000),accept_downloads=True)
                        # Theme is fixture state; the legacy utility hit-target
                        # overlap is outside this video-activation regression.
                        context.add_init_script('localStorage.setItem("vibemol.uiTheme",'+json.dumps(theme)+');')
                        page=context.new_page();errors=[];downloads=[]
                        page.on('pageerror',lambda e:errors.append(str(e)))
                        page.on('download',lambda d:downloads.append(d))
                        try:
                            page.goto(url+'?appearanceStudy=1'+('&workspaceLab=0' if launch=='legacy' else ''),wait_until='commit')
                            page.wait_for_function('''launch=>window.VibeMolTesting && window.VibeMolWorkbenchHost
                              && (launch==='legacy' || window.VibeMolWorkbench)''',arg=launch)
                            page.evaluate('async()=>{await document.fonts.ready;}')
                            actual_theme=page.evaluate('()=>document.documentElement.dataset.theme')
                            print('[video-native-theme] '+json.dumps(dict(context=label,actual=actual_theme,expected=theme)),flush=True)
                            assert actual_theme==theme,(actual_theme,theme)
                            page.wait_for_function('theme=>document.documentElement.dataset.theme===theme',arg=theme)
                            fixture=root/'tests/fixtures/characterize'
                            files=[fixture/'trajectory.xyz'] if prefix=='trajectory' else [fixture/'vibration.xyz',fixture/'vibration.vib.json']
                            page.locator('#fileInput').set_input_files([str(p) for p in files])
                            page.wait_for_function('''prefix=>!document.getElementById(prefix+'SaveVideoBtn').disabled''',arg=prefix)
                            if page.locator('#'+prefix+'Panel').is_visible():
                                pass  # Native file loading already opened this panel.
                            elif launch=='workbench':
                                page.locator('#workbenchPanelsBtn').click()
                                page.locator('[data-window="'+prefix+'Panel"]').click()
                            else:
                                page.locator('#canvas').click();page.keyboard.press('t' if prefix=='trajectory' else 'f')
                            page.wait_for_function('''prefix=>document.getElementById(prefix+'Panel').getAttribute('aria-hidden')==='false' ''',arg=prefix)
                            install_video_clock_gate(page)
                            # Observe real anchor activation; native MediaRecorder,
                            # captureStream, URL and original click all remain intact.
                            page.evaluate('''() => {
                              const original=HTMLAnchorElement.prototype.click;
                              window.__nativeVideoActivation={downloads:[]};
                              HTMLAnchorElement.prototype.click=function(){
                                const result=original.call(this);
                                if(this.download.endsWith('.webm'))__nativeVideoActivation.downloads.push(this.download);
                                return result;
                              };
                            }''')
                            speed='#trajectoryFps' if prefix=='trajectory' else '#vibrationSpeed'
                            page.locator(speed).evaluate("el=>{el.value='1';el.dispatchEvent(new Event('change',{bubbles:true}));}")
                            fresh_save(page,prefix,'native natural Save',0)
                            with page.expect_download():
                                click_video_control(page,prefix,'VideoCropStartBtn')
                            assert_idle(page,prefix,'native natural completion',1)
                            begin_held_recording(page,prefix,'native early Stop',1)
                            with page.expect_download():early_stop_held_recording(page,prefix,2,native=True)
                            assert_idle(page,prefix,'native early Stop complete',2)
                            count=completion_during_activation_matrix(page,prefix,2,native=True)
                            # Native downloads are independent of the observed
                            # anchor count; all six must reach the browser.
                            assert len(downloads)==count==6,(len(downloads),count)
                            assert all(d.suggested_filename==prefix+'.webm' for d in downloads)
                            assert not errors,errors
                            cases.append(dict(context=label,status='passed',nativeDownloads=len(downloads),pageErrors=errors,browserVersion=browser.version))
                        except Exception:
                            try:
                                print('[video-native-failure] '+json.dumps(dict(context=label,
                                      browserDownloads=len(downloads),actual=video_state(page,prefix))),flush=True)
                            except Exception as diagnostic_error:
                                print('[video-native-readback-error] '+str(diagnostic_error),flush=True)
                            write_failure_artifacts(page,out,label,errors,[])
                            failure=traceback.format_exc();print(failure,flush=True)
                            cases.append(dict(context=label,status='failed',failure=failure,nativeDownloads=len(downloads),pageErrors=errors))
                        finally:context.close()
        finally:browser.close()
    report=dict(sourceRoot=str(args.source_root),exporterSha256=hashlib.sha256((args.source_root/'assets/app/js/trajectory-video.js').read_bytes()).hexdigest(),nativeRecorder=True,clockGateOnly=True,cases=cases)
    (out/'native-result.json').write_text(json.dumps(report,indent=2)+'\n')
    return 0 if all(c['status']=='passed' for c in cases) else 1


if __name__=='__main__':
    raise SystemExit(main())
