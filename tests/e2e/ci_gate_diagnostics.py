"""Read-only CI probes for issue #4; no shipped code or algorithms are changed."""
import json
import os
import platform
from pathlib import Path


UNBOUNDED = os.environ.get('VIBEMOL_CI_UNBOUNDED_PROBE') == '1'


def record_renderer(page, folder, suite):
    details = page.evaluate('''() => {
      const canvas=document.getElementById('canvas');
      const gl=canvas.getContext('webgl2') || canvas.getContext('webgl');
      const debug=gl.getExtension('WEBGL_debug_renderer_info');
      return {vendor:gl.getParameter(gl.VENDOR), renderer:gl.getParameter(gl.RENDERER),
        unmaskedVendor:debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
        unmaskedRenderer:debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
        version:gl.getParameter(gl.VERSION)};
    }''')
    renderer = details['unmaskedRenderer'] or details['renderer']
    software = any(word in renderer.lower() for word in ('swiftshader', 'llvmpipe', 'softpipe', 'software'))
    evidence = {'suite': suite, 'os': platform.system(), 'architecture': platform.machine(),
                'browserName': 'chromium', 'browserVersion': page.context.browser.version,
                'rendererClass': 'software' if software else 'hardware-or-unidentified', **details}
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        evidence['ciRunUrl'] = f"https://github.com/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
    Path(folder).mkdir(parents=True, exist_ok=True)
    (Path(folder) / 'renderer.json').write_text(json.dumps(evidence, indent=2)+'\n')
    print('[renderer] '+json.dumps(evidence), flush=True)


def install_video_probe(page, root, folder):
    if not UNBOUNDED:
        return
    source = (root / 'assets/app/js/app.js').read_text()
    marker = 'window.VibeMolTesting = Object.freeze({'
    assert source.count(marker) == 1, marker
    source = source.replace(marker, '''window.__ciVideoState = prefix => {
      const controller=prefix==='trajectory' ? trajectoryVideoController : vibrationVideoController;
      const overlay=document.getElementById(prefix+'VideoCropOverlay');
      return {mode:controller.getMode(), recording:controller.isRecording(), active:controller.isActive(),
        overlayState:overlay.dataset.state, hidden:overlay.getAttribute('aria-hidden'),
        playDisabled:document.getElementById(prefix+'PlayBtn').disabled,
        resetDisabled:document.getElementById(prefix+'ResetBtn').disabled,
        downloads:window.__trajectoryVideoExportTest?.downloads?.length ?? null};
    };
    ''' + marker)
    page.route('**/assets/app/js/app.js*', lambda route: route.fulfill(body=source, content_type='application/javascript'))
    path = Path(folder) / 'video-state-events.jsonl'
    def record(message):
        if message.text.startswith('[video-state] '):
            with path.open('a') as stream:
                stream.write(message.text[len('[video-state] '):]+'\n')
            print(message.text, flush=True)
    page.on('console', record)


def arm_video_stop_trace(page, prefix):
    if not UNBOUNDED:
        return
    page.evaluate('''prefix => {
      window.__ciStopTrace={prefix, events:[]};
      const button=document.getElementById(prefix+'SaveVideoBtn');
      const emit=(event,state)=> {
        const entry={prefix,event,at:performance.now(),state};
        __ciStopTrace.events.push(entry);
        console.log('[video-state] '+JSON.stringify(entry));
      };
      for(const name of ['pointerdown','pointerup','click']) {
        button.addEventListener(name,()=>{
          emit(name,__ciVideoState(prefix));
          if(name==='click') queueMicrotask(()=>emit('after-click',__ciVideoState(prefix)));
        },{capture:true,once:true});
      }
      emit('before-stop-action',__ciVideoState(prefix));
    }''', prefix)


def wait_for_video_idle(page, prefix):
    if not UNBOUNDED:
        page.wait_for_function("""prefix => document.getElementById(prefix+'VideoCropOverlay')?.getAttribute('aria-hidden') === 'true'""", arg=prefix)
        return
    # Issue #4 CI discriminator: there is no duration limit or retry. Read the
    # controller as well as its live UI projection. Reject a terminal transition
    # to a NEW crop selection explicitly, rather than waiting for a timeout.
    page.wait_for_function('''async prefix => {
      await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
      const state=__ciVideoState(prefix);
      if(state.mode==='idle' && !state.active && state.hidden==='true'
        && !state.playDisabled && !state.resetDisabled) return true;
      const events=__ciStopTrace?.prefix===prefix ? __ciStopTrace.events : [];
      const click=events.find(e=>e.event==='click');
      const after=events.find(e=>e.event==='after-click');
      if(click?.state.mode==='idle' && after?.state.mode==='selecting'
        && state.mode==='selecting' && state.downloads===2) {
        console.log('[video-state] '+JSON.stringify({prefix,event:'terminal-new-selection',state}));
        throw new Error('Unbounded real-state wait: export ended before Stop click; click opened a new crop selection. '+JSON.stringify(events));
      }
      return false;
    }''', arg=prefix, timeout=0)
    print('[video-state] '+json.dumps({'prefix': prefix, 'event': 'unbounded-idle-wait-passed',
                                     'state': page.evaluate('prefix=>__ciVideoState(prefix)', prefix)}), flush=True)
