"""Native candidate editor entry, including the retained legacy launcher."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import traceback

p = argparse.ArgumentParser()
p.add_argument('--source-root', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
source, out = a.source_root.resolve(), a.output.resolve()
out.mkdir(parents=True, exist_ok=True)
assert not (out / 'native-editor.json').exists(), 'Do not replay completed native verification'
git = lambda *args: subprocess.check_output(['git', '-C', str(source), *args], text=True).strip()
assert not git('status', '--porcelain')
head, tree = git('rev-parse', 'HEAD'), git('rev-parse', 'HEAD^{tree}')
sha = hashlib.sha256((source / 'assets/app/js/app.js').read_bytes()).hexdigest()
sys.path.insert(0, str(source / 'tests/e2e'))
from helpers import run_http_server
from playwright.sync_api import sync_playwright
fixture = out / 'carbon.xyz'
fixture.write_text('1\nColors hand-off\nC 0 0 0\n')
cases = []
with run_http_server(source) as url, sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--use-angle=swiftshader'])
    try:
        for legacy in [False, True]:
            for theme in ['light', 'dark']:
                key = ('legacy' if legacy else 'workbench') + '-' + theme
                context = browser.new_context(viewport={'width': 1512, 'height': 1000})
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                try:
                    page.goto(url + '?appearanceStudy=1' + ('&workspaceLab=0' if legacy else ''))
                    page.wait_for_function('() => !!window.VibeMolWorkbenchHost && !!window.VibeMolAppearanceLooks')
                    if page.locator('#themeToggleInput').is_checked() != (theme == 'dark'):
                        page.locator('#themeToggleInput').focus()
                        page.keyboard.press('Space')
                    assert page.locator('#themeToggleInput').is_checked() == (theme == 'dark')
                    page.locator('#fileInput').set_input_files(str(fixture))
                    page.wait_for_function('''() => {
                      try { return VibeMolStructure.exportActive()?.volume.atoms.length === 1; }
                      catch (error) { if (error.message === 'No active structure is loaded.') return false; throw error; }
                    }''')
                    if legacy:
                        page.locator('#displayInspectorBtn').click()
                        button = page.locator('#elementColorBtn')
                        route = 'Appearance → Element colors → Edit…'
                        assert button.is_visible()
                        handler = button.evaluate('node => node.onclick.toString()')
                        assert 'periodicTableController.setOpen(true)' in handler
                    else:
                        page.locator('#workbenchPanelsBtn').click()
                        page.locator('#workbenchPanelsMenu').get_by_role('menuitemcheckbox', name='Properties', exact=True).click()
                        page.locator('#inspectorLookTab').click()
                        page.locator('#appearanceColorsSection > summary').click()
                        button = page.locator('#studioElementColorEdit')
                        route = 'Panels → Properties → Look → Colors → Edit…'
                        handler = button.evaluate('node => node.onclick.toString()')
                        assert 'openElementColors' in handler
                        assert page.locator('#elementColorBtn').count() == 0
                    button.click()
                    page.wait_for_function("() => document.getElementById('elementColorOverlay').style.display === 'flex' && document.getElementById('periodicTableCanvas').width > 0")
                    assert page.locator('#elementColorOverlay').is_visible()
                    name = page.locator('#elementColorName').inner_text()
                    assert name.endswith('(Z=6)')
                    page.screenshot(path=str(out / (key + '.png')))
                    page.locator('#elementColorClose').click()
                    assert page.locator('#elementColorOverlay').is_hidden()
                    assert not errors, errors
                    cases.append({'launch': 'legacy' if legacy else 'workbench', 'theme': theme, 'route': route,
                      'handler': handler, 'opened': True, 'closed': True, 'title': name, 'pageErrors': errors})
                    (out / 'native-progress.json').write_text(json.dumps(cases, indent=2) + '\n')
                    print('NATIVE_PASS ' + key, flush=True)
                except BaseException:
                    (out / (key + '-failure.log')).write_text(traceback.format_exc())
                    (out / (key + '-failure.html')).write_text(page.content())
                    page.screenshot(path=str(out / (key + '-failure.png')))
                    raise
                finally:
                    context.close()
        report = {'head': head, 'tree': tree, 'appSha256': sha, 'method':'Native file picker, keyboard theme preference, pointer menus/buttons; no QA/private control API, source rewrite, handler replacement or sleeps.', 'cases': cases, 'browserVersion': browser.version, 'passed': True}
        (out / 'native-editor.json').write_text(json.dumps(report, indent=2) + '\n')
    finally:
        browser.close()
assert head == git('rev-parse', 'HEAD') and not git('status', '--porcelain')
assert sha == hashlib.sha256((source / 'assets/app/js/app.js').read_bytes()).hexdigest()
