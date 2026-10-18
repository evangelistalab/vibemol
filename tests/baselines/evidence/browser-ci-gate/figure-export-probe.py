"""One native-UI export probe for issue #11; no injected app code or QA APIs."""
import functools
import http.server
import json
import pathlib
import platform
import threading
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[4]
OUT = ROOT / 'out/test-artifacts/browser-ci-gate/figure-probe'
OUT.mkdir(parents=True, exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True,
        executable_path='/Users/fevange/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell',
        args=['--use-angle=metal'])
    page = browser.new_page(viewport={'width':1440, 'height':1000}, accept_downloads=True)
    downloads = []
    page.on('download', lambda download: downloads.append(download))
    try:
        page.goto(f'http://127.0.0.1:{server.server_port}/?appearanceStudy=1', wait_until='networkidle')
        page.locator('#fileInput').set_input_files(str(ROOT / 'tests/baselines/evidence/browser-ci-followup/two-frame.xyz'))
        page.wait_for_function('()=>document.querySelectorAll(".vm-outliner-row").length > 0')
        page.locator('#workbenchPanelsBtn').click()
        page.locator('[data-window="figurePanel"]').click()
        page.wait_for_function('()=>document.querySelector("#figurePanel img").src.startsWith("blob:")')
        panel = page.locator('#figurePanel')
        panel.locator('#figure-widthIn').fill('4')
        panel.locator('#figure-widthIn').press('Tab')
        panel.locator('#figure-dpi').fill('300')
        panel.locator('#figure-dpi').press('Tab')
        panel.locator('#figure-format').select_option('png')
        page.wait_for_function('()=>!document.querySelector("#figurePanel [data-export]").disabled')
        renderer = page.evaluate('''()=>{const gl=document.getElementById('canvas').getContext('webgl2');
          const d=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(d.UNMASKED_RENDERER_WEBGL);}''')
        page.evaluate('''()=>{
          const panel=document.getElementById('figurePanel'),button=panel.querySelector('[data-export]');
          window.__figureProbe={events:[],clicks:0};
          const emit=event=>__figureProbe.events.push({event,at:performance.now(),disabled:button.disabled,
            label:button.textContent.trim(),status:panel.querySelector('[data-status]').textContent,
            cropOverlays:[...document.querySelectorAll('[id$="VideoCropOverlay"]')].map(el=>({id:el.id,hidden:el.getAttribute('aria-hidden'),state:el.dataset.state}))});
          for(const name of ['pointerdown','pointerup','click'])button.addEventListener(name,()=>{if(name==='click')__figureProbe.clicks++;emit(name);});
          new MutationObserver(()=>emit('export-ui-change')).observe(panel,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled']});
        }''')
        button = panel.locator('[data-export]')
        with page.expect_download() as download:
            button.click()
        download.value.save_as(OUT / download.value.suggested_filename)
        # Unlike Save/Stop, one figure activation starts and finishes an export.
        # Holding a subsequent pointer over the now-idle action cannot change
        # that action into crop selection: it remains Export throughout.
        page.wait_for_function('()=>document.querySelector("#figurePanel [data-status]").textContent === "Figure downloaded." && !document.querySelector("#figurePanel [data-export]").disabled')
        box = button.bounding_box()
        page.mouse.move(box['x']+box['width']/2, box['y']+box['height']/2)
        page.mouse.down()
        held = page.evaluate('()=>({label:document.querySelector("#figurePanel [data-export]").textContent.trim(),disabled:document.querySelector("#figurePanel [data-export]").disabled})')
        with page.expect_download() as second:
            page.mouse.up()
        second.value.save_as(OUT / ('second-'+second.value.suggested_filename))
        page.wait_for_function('()=>document.querySelector("#figurePanel [data-status]").textContent === "Figure downloaded." && !document.querySelector("#figurePanel [data-export]").disabled')
        page.screenshot(path=str(OUT/'figure-export.png'))
        result={'os':platform.system(),'architecture':platform.machine(),'browserName':'chromium',
            'browserVersion':browser.version,'renderer':renderer,'pointerHeldOnCompletedAction':held,
            'nativeDownloads':len(downloads),'observations':page.evaluate('()=>__figureProbe'),
            'sourceConclusion':'No Save/Stop/crop state dispatch. onclick always calls download(); pending guards concurrent export and disables the button. Completion clears pending and enables the same Export action.',
            'scope':'One PNG public-UI probe, two activations. SVG shares the identical download() dispatch; no production fix.'}
        (OUT/'result.json').write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps({k:v for k,v in result.items() if k!='observations'}),flush=True)
    finally:
        browser.close()
        server.shutdown()
