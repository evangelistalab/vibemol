#!/usr/bin/env python3
"""Release transitions against a real HTTP cache (no Playwright routing)."""
from collections import Counter
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import mimetypes
import pathlib
import re
import sys
import threading
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import sync_playwright
from helpers import read_app_version

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
from sync_asset_versions import stamp_html, stamp_css


@contextmanager
def cache_server():
    state = {'legacy': True, 'version': read_app_version(), 'requests': Counter()}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            parsed = urlsplit(self.path)
            state['requests'][self.path] += 1
            local = parsed.path.removeprefix('/vibemol/').lstrip('/')
            path = (ROOT / (local or 'index.html')).resolve()
            if local == 'prime':
                data, mime = b'<!doctype html><title>Cache priming</title>', 'text/html'
            elif ROOT not in path.parents or not path.is_file():
                self.send_error(404)
                return
            else:
                data = path.read_bytes()
                mime = mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
                if path.name == 'index.html':
                    data = stamp_html(data.decode(), path, state['version']).encode()
                elif path.suffix == '.css':
                    data = stamp_css(data.decode(), path, state['version']).encode()
                elif path.name == 'asset-urls.js':
                    data = re.sub(rb"const APP_VERSION = '[^']+';",
                                  f"const APP_VERSION = '{state['version']}';".encode(), data)
                # Stand in for a previous deployment. These exact unversioned
                # URLs must remain cached but must never execute in the new app.
                if state['legacy'] and path.suffix == '.js':
                    data += b'\n;globalThis.__staleAssetExecuted = true;\n'
            self.send_response(200)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store' if mime == 'text/html' else 'public, max-age=86400')
            self.end_headers()
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass  # A navigation may cancel an image request.

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{server.server_port}/vibemol/', state
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def exercise_dynamic_assets(page):
    result = page.evaluate('''async () => {
      await VibeMolCalculationsModel.loadBasis();
      VibeMolAppearanceLooks.openStudio();
      const vol = {origin:[0,0,0], axes:[[1,0,0],[0,1,0],[0,0,1]],
        nxyz:[11,11,11], data:new Float32Array(1331).fill(-2),
        idx:(i,j,k)=>(i*11+j)*11+k};
      const runner = VibeMolArithmeticRunner.createArithmeticRunner({
        grid:{...VibeMolArithmeticGrid, createComputation(){throw new Error('Worker unexpectedly fell back');}}});
      const arithmetic = await runner.compute('abs', [{vol}], 'test');
      const iso = VibeMolAutoIso.createAutoIsoController({
        hasVolumetricGrid:()=>true, workerThresholdSamples:1000});
      const value = await iso.estimateAutoIsoValueAsync(vol, 'alphaRe', 0.85, 1);
      iso.shutdown();
      document.getElementById('emptyStateSampleBtn').click();
      await document.fonts.ready;
      return {arithmetic: arithmetic.ok && arithmetic.data[0]===2,
        iso:Number.isFinite(value.value) && value.source==='worker'};
    }''')
    assert result == {'arithmetic': True, 'iso': True}, result


def main():
    with cache_server() as (url, server), sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1440, 'height': 1000})
        page = context.new_page()
        errors = []
        requests = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('request', lambda request: requests.append(request.url))
        try:
            page.goto(url + 'prime')
            # Prime the old, query-free URLs for every initial script, style,
            # image and font, exactly as a returning browser would have them.
            sources = (ROOT / 'index.html').read_text()
            urls = set(re.findall(r'(?:src|href)="((?:\./)?(?:assets|src)/[^"?]+)', sources))
            for font in (ROOT / 'assets/app/fonts').glob('*.woff2'):
                urls.add(str(font.relative_to(ROOT)))
            page.evaluate('urls=>Promise.all(urls.map(url=>fetch(url).then(r=>r.arrayBuffer())))', sorted(urls))
            old_app = '/vibemol/assets/app/js/app.js'
            primed = server['requests'][old_app]
            await_cached = page.evaluate("()=>fetch('assets/app/js/app.js').then(r=>r.text())")
            assert '__staleAssetExecuted' in await_cached
            assert server['requests'][old_app] == primed, 'Test must use real cached responses'
            server['legacy'] = False

            first = read_app_version()
            parts = first.split('.')
            following = '.'.join(parts[:2] + [str(int(parts[2]) + 1)])
            for version in [first, following]:
                # End the previous document's asynchronous catalog requests
                # before counting requests for the next document.
                page.goto('about:blank')
                server['version'] = version
                requests.clear()
                # Only the HTML address changes. Assets must bring their own v.
                page.goto(url + '?cb=' + version + '&appearanceStudy=1', wait_until='domcontentloaded')
                page.wait_for_function('(v)=>window.VibeMolWorkbench && document.getElementById("toolbarVersion").textContent==="v"+v', arg=version)
                assert not page.evaluate('()=>!!window.__staleAssetExecuted')
                exercise_dynamic_assets(page)
                expected = [
                    'assets/app/js/asset-urls.js', 'assets/app/js/app.js', 'src/styles/tokens.css',
                    'assets/app/js/autoiso-worker.js', 'assets/app/js/arithmetic-worker.js',
                    'assets/app/js/arithmetic-grid.js', 'assets/data/basis/cc-pvtz-minao.json',
                    'assets/data/sample.cube',
                    'assets/fragments/library.json', 'assets/fragments/methyl.xyz',
                    'assets/app/fonts/Geist-Variable.woff2',
                    'assets/environments/monochrome_studio_04_1k.png',
                    'assets/app/img/looks/studio-basic.png',
                ]
                for asset in expected:
                    if 'worker' not in asset and 'arithmetic-grid' not in asset:
                        page.wait_for_function('(path)=>performance.getEntriesByType("resource").some(e=>e.name.includes(path))',
                                               arg=asset + '?v=' + version)
                    assert server['requests'][f'/vibemol/{asset}?v={version}'] > 0, (asset, version)
                local = [r for r in requests if r.startswith((url + 'assets/', url + 'src/'))]
                assert len(local) >= 100, len(local)
                assert all(parse_qs(urlsplit(r).query).get('v') == [version] for r in local), local
                # Reloading this release should reuse cached scripts normally.
                app = f'/vibemol/assets/app/js/app.js?v={version}'
                count = server['requests'][app]
                page.goto(url + '?cb=again-' + version + '&appearanceStudy=1', wait_until='domcontentloaded')
                page.wait_for_function('()=>!!window.VibeMolWorkbench')
                assert server['requests'][app] == count
                print(f'[asset cache] v{version}: warm-cache upgrade, workers, fonts, data and same-release reuse passed', flush=True)
            assert not errors, errors
        finally:
            browser.close()


if __name__ == '__main__':
    main()
