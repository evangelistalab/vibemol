#!/usr/bin/env python3
"""Production Workbench launch, appearance persistence, recovery, and CLI styles."""
import sys
import premerge as p
from appearance_controls import change

sys.path.insert(0, str(p.ROOT / 'api'))
from vibemol_client import _set_style_with_alias


def release(page, url, suffix):
    page.goto(url + suffix)
    page.wait_for_function('()=>window.VibeMolWorkbench && VibeMolRecovery.getState().ready')
    assert page.locator('#workbenchBar').is_visible()
    assert page.locator('#toolbarVersion').inner_text() == 'v0.9.0'
    assert page.locator('.wb-lab, #appearanceLookPreset, #styleStudio').count() == 0
    assert 'experiment' not in page.locator('#sessionStatus').inner_text().lower()
    assert p.load(page, [{'name': 'release.cube', 'text': p.cube(0)}])['ok']
    # The Python renderer uses the public appearance API; its old DOM selector
    # is intentionally absent from Properties.
    for style, expected in [('basic', 'basic'), ('fancy', 'toon'), ('studio', 'kit')]:
        assert _set_style_with_alias(page, style) == expected
        state = page.evaluate('VibeMolAppearanceLooks.snapshot()')
        assert state['styleRef']['id'] == state['colorsRef']['id'] == expected
    page.evaluate('VibeMolAppearanceLooks.openStudio(); VibeMolAppearanceLooks.apply("classic", {includeColors:true})')
    page.locator('#lookPreset').select_option('opal')
    change(page, 'studioShadows', False)
    page.wait_for_function('()=>JSON.parse(localStorage.getItem("vibemol.autosavePreset")||"null")?.settings["appearance.references"]?.styleRef?.id==="opal"')
    before = page.evaluate('VibeMolAppearanceLooks.snapshot()')
    graph = p.snapshot(page)
    assert page.evaluate('VibeMolRecovery.flush({force:true})')
    page.reload()
    page.wait_for_function('()=>window.VibeMolWorkbench && VibeMolRecovery.getState().pending')
    after = page.evaluate('VibeMolAppearanceLooks.snapshot()')
    for key in ['settings', 'styleRef', 'colorsRef', 'label', 'styleModified', 'colorsModified']:
        assert after[key] == before[key], key
    assert p.snapshot(page)['scenes'] == [], 'Recovery stays explicit'
    page.locator('#recoverSessionBtn').click()
    page.wait_for_function('()=>!VibeMolRecovery.getState().pending')
    assert p.snapshot(page) == graph
    saved = page.evaluate('VibeMolSession.export()')
    assert page.evaluate('doc=>VibeMolSession.import(doc)', saved)['ok']
    assert p.snapshot(page) == graph
    page.evaluate('VibeMolAppearanceLooks.openStudio()')
    page.locator('#lookSaveDetails').evaluate('el=>el.open=true')
    page.locator('#lookDefault').click()
    settings = page.evaluate('VibeMolAppearanceLooks.snapshot().settings')
    page.reload()
    page.wait_for_function('()=>window.VibeMolWorkbench && window.VibeMolAppearanceLooks')
    state = page.evaluate('VibeMolAppearanceLooks.snapshot()')
    assert state['settings'] == settings and not state['styleModified'] and not state['colorsModified']
    assert state['styleRef'] == state['colorsRef']
    print(f'[release] {suffix or "/"}: default Workbench, CLI styles, last appearance, explicit recovery, sessions and startup default: passed', flush=True)


def main():
    with p.run_http_server(p.ROOT) as url, p.sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        try:
            for suffix in ['', '?workspaceLab=1']:
                context = browser.new_context(viewport={'width': 1512, 'height': 950})
                page = context.new_page(); errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                try:
                    release(page, url, suffix)
                    assert not errors, errors
                except Exception:
                    p.write_failure_artifacts(page, p.ARTIFACTS, 'workbench-release', errors, []); raise
                finally: context.close()
            for suffix, workbench, study in [('?workspaceLab=0', False, False), ('?appearanceStudy=1', True, True), ('?workspaceDemo=1', True, True)]:
                context = browser.new_context(); page = context.new_page()
                try:
                    page.goto(url + suffix); page.wait_for_function('()=>window.VibeMolAppearanceLooks')
                    assert page.evaluate('!!window.VibeMolWorkbench') == workbench
                    if study:
                        assert not page.evaluate('VibeMolRecovery.getState().ready')
                        assert not page.evaluate('localStorage.getItem("vibemol.autosavePreset")')
                    else: page.wait_for_function('()=>VibeMolRecovery.getState().ready')
                finally: context.close()
            print('[release] explicit legacy compatibility and isolated study/demo launches: passed', flush=True)
        finally: browser.close()


if __name__ == '__main__': main()
