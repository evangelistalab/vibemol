#!/usr/bin/env python3
"""Style Studio window, preset gallery, editing, persistence, and responsive UI."""
import json
import math
from pathlib import Path
import premerge as p


def settings(page):
    return page.evaluate('() => VibeMolAppearanceLooks.snapshot().settings')


def background_controls(page):
    def choose_color(selector, colors):
        page.locator(selector).evaluate('''(el, colors) => {
          for (const value of colors) { el.value=value; el.dispatchEvent(new Event('input',{bubbles:true})); }
          el.dispatchEvent(new Event('change',{bubbles:true}));
        }''', colors)

    def check_color(color):
        page.wait_for_function('color => ["bgColor","appearanceBackgroundColor"].every(id=>document.getElementById(id).value===color)', arg=color)
        assert settings(page)['global.backgroundColor'] == color
        previews=page.locator('#bgColorSwatch, #appearanceBackgroundColor + span').evaluate_all('els=>els.map(el=>getComputedStyle(el).backgroundColor)')
        assert len(previews)==2 and previews[0]==previews[1], previews

    def background_pixel():
        return page.evaluate('''async () => {
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          const sample=document.createElement('canvas'); sample.width=sample.height=1;
          const ctx=sample.getContext('2d'); ctx.drawImage(document.getElementById('canvas'),10,10,1,1,0,0,1,1);
          return [...ctx.getImageData(0,0,1,1).data];
        }''')

    assert p.load(page,[{'name':'orbital.cube','text':p.cube(0)}])['ok']
    page.locator('#displayInspectorBtn').click();page.locator('#styleStudioBtn').click()
    page.locator('#lookPreset').select_option('classic')
    page.locator('#appearanceGeometrySection > summary').click()
    page.locator('#appearanceLightingSection > summary').click()
    assert page.locator('#appearanceBackgroundColor').is_visible()
    original=settings(page)
    molecule=page.evaluate('() => VibeMolStructure.exportActive().volume')
    initial_pixel=background_pixel()
    for selector in ['#appearanceBackgroundColor','#bgColor']:
        camera=page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
        surfaces=page.evaluate('() => JSON.parse(JSON.stringify(VibeMolTesting.getSurfaceMaterialSnapshot()))')
        assert surfaces
        choose_color(selector,[original['global.backgroundColor'],'#112233','#284c68','#345678'])
        check_color('#345678')
        assert settings(page)=={**original,'global.backgroundColor':'#345678'}
        assert page.locator('#lookModified').inner_text()=='· Modified'
        assert page.evaluate('() => JSON.parse(JSON.stringify(VibeMolTesting.getSurfaceMaterialSnapshot()))')==surfaces
        assert page.evaluate('() => VibeMolStructure.exportActive().volume')==molecule
        after=page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
        assert after['mode']==camera['mode'] and after['controlsEnabled']==camera['controlsEnabled']
        assert all(math.isclose(after[vector][axis],camera[vector][axis],rel_tol=0,abs_tol=1e-10)
                   for vector in ['camera','target','up'] for axis in ['x','y','z']), (camera,after)
        assert background_pixel()!=initial_pixel
        page.locator('#lookUndo').click();check_color(original['global.backgroundColor'])
        assert settings(page)==original and page.locator('#lookModified').inner_text()==''

    # A named look, portable export, Revert, appearance autosave, and session all
    # retain the same shared color rather than a second Studio-only setting.
    choose_color('#appearanceBackgroundColor',['#345678'])
    page.locator('#lookSave').click();page.locator('#lookNameInput').fill('Blue background');page.locator('#lookNameInput').press('Enter')
    saved=page.evaluate('() => VibeMolAppearanceLooks.snapshot().saved[0]')
    page.locator('#lookSaveDetails > summary').click()
    with page.expect_download() as download:
        page.locator('#lookExport').click()
    exported=json.loads(Path(download.value.path()).read_text())
    assert exported['settings']['global.backgroundColor']=='#345678'
    choose_color('#bgColor',['#885522']);page.locator('#lookRevert').click();check_color('#345678')
    session=page.evaluate('() => VibeMolSession.export()')
    page.wait_for_function('() => JSON.parse(localStorage.getItem("vibemol.autosavePreset"))?.settings["global.backgroundColor"]==="#345678"')
    page.reload();page.wait_for_function('() => window.VibeMolAppearanceLooks')
    check_color('#345678')
    page.evaluate('() => VibeMolAppearanceLooks.apply("opal")');check_color('#171b2b')
    assert page.evaluate('preset=>VibeMolPreset.import(preset,{mode:"strict"})',exported)['ok']
    check_color('#345678')
    page.evaluate('() => VibeMolAppearanceLooks.apply("ink")')
    assert page.evaluate('saved=>VibeMolSession.import(saved)',session)['ok']
    check_color('#345678')
    assert page.evaluate('() => VibeMolAppearanceLooks.snapshot().activeLook.id')==saved['id']

    # Theme following changes the rendered background, never the saved base color.
    exact_pixel=background_pixel()
    page.hover('#topRightUtilities')
    page.wait_for_function('() => Number(getComputedStyle(document.querySelector("#topRightUtilitiesReveal")).opacity)>0.95')
    page.locator('#themeToggleShell').click()
    assert page.locator('html').get_attribute('data-theme')=='dark'
    assert background_pixel()==exact_pixel
    page.evaluate('() => VibeMolAppearanceLooks.openStudio()')
    page.locator('#appearanceLightingSection').evaluate('el=>el.open=true')
    page.locator('#appearanceFollowTheme').check();check_color('#345678')
    dark_pixel=background_pixel()
    assert sum(dark_pixel[:3])<sum(exact_pixel[:3]), (exact_pixel,dark_pixel)
    page.screenshot(path=str(p.ARTIFACTS/'style-studio-background-dark.png'))
    page.locator('#appearanceFollowTheme').uncheck();check_color('#345678')
    assert background_pixel()==exact_pixel

    assert p.load(page,[{'name':'orbitals.molden','text':p.MOLDEN}])['ok']
    orbitals=p.cubes(page)
    choose_color('#appearanceBackgroundColor',['#223344']);check_color('#223344')
    assert p.cubes(page)==orbitals and page.evaluate('() => window.__moldenGridBuilds')==[]
    print('[studio] shared background, grouped Undo, Revert, save/export/import, autosave, sessions, theme following and deferred orbitals: passed',flush=True)


def run(page):
    assert not page.locator('#styleStudio').is_visible()
    assert page.locator('#displayInspector #looksPanel').count() == 0
    assert p.load(page, [{'name': 'pyridine.xyz', 'text': (p.ROOT / 'assets/fragments/pyridine.xyz').read_text()}])['ok']
    molecule = page.evaluate('() => VibeMolStructure.exportActive().volume')
    camera = page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
    page.locator('#displayInspectorBtn').click()
    quick_preset = page.locator('#appearanceLookPreset')
    assert quick_preset.locator('option').evaluate_all('els=>els.slice(1).map(el=>el.textContent)') == ['Basic','Classic','Ink','Kit','Opal','Porcelain','Toon']
    quick_preset.select_option('classic')
    assert not page.locator('#styleStudio').is_visible()
    assert page.locator('#lookPreset').input_value() == 'classic'
    assert page.locator('#styleStudioBtn').bounding_box()['y'] >= quick_preset.bounding_box()['y'] + quick_preset.bounding_box()['height']
    page.locator('#styleStudioBtn').click()
    assert page.locator('#styleStudio').get_attribute('aria-hidden') == 'false'
    assert page.locator('#styleStudioBtn').get_attribute('aria-expanded') == 'true'
    assert page.locator('#styleStudio #appearanceGeometrySection, #styleStudio #appearanceMaterialsSection, #styleStudio #appearanceLightingSection').count() == 3
    assert not page.locator('#appearanceMaterialsSection').evaluate('el=>el.open')
    assert page.locator('.vm-look-card').evaluate_all('els=>els.map(el=>el.textContent)') == ['Basic','Classic','Ink','Kit','Opal','Porcelain','Toon']
    page.wait_for_function('() => [...document.querySelectorAll(".vm-look-card img")].every(im=>im.complete&&im.naturalWidth>0)')
    for name in ['basic','classic','ink','kit','opal','porcelain','toon']:
        card = page.locator(f'.vm-look-card[data-look="{name}"]')
        before = card.bounding_box(); card.hover()
        assert card.bounding_box() == before, 'Cards must stay stationary on hover'
        card.click()
        assert card.get_attribute('aria-pressed') == 'true'
        assert page.locator('#lookPreset').input_value() == name
        assert quick_preset.input_value() == name
    page.locator('.vm-look-card[data-look="classic"]').click()
    original = settings(page)
    assert page.evaluate('() => VibeMolStructure.exportActive().volume') == molecule
    assert page.evaluate('() => VibeMolTesting.getCameraSnapshot()') == camera
    page.locator('#appearanceAtomSize').fill('1.22'); page.locator('#appearanceAtomSize').press('Enter')
    assert settings(page)['appearance.rendering']['geometry']['atomScaleMain'] == 1.22
    assert page.locator('#lookModified').inner_text() == '· Modified'
    page.locator('#lookUndo').click(); assert settings(page) == original
    page.locator('#appearanceMaterialsSection > summary').click()
    page.locator('#appearanceMaterialPreset').select_option('satin')
    page.locator('#appearanceMaterialRoughness').fill('0.43'); page.locator('#appearanceMaterialRoughness').press('Enter')
    assert settings(page)['appearance.rendering']['material']['roughness'] == 0.43
    page.locator('#lookRevert').click(); assert settings(page) == original

    # Typing and native select navigation must not invoke scene mode shortcuts.
    page.locator('#lookSave').click()
    page.locator('#lookNameInput').fill('My studio look'); page.locator('#lookNameInput').press('Enter')
    assert page.locator('#styleStudio').is_visible()
    saved = page.evaluate('() => VibeMolAppearanceLooks.snapshot().saved[0]')
    assert saved['name'] == 'My studio look'
    assert quick_preset.input_value() == saved['id']
    assert quick_preset.locator('optgroup option').all_text_contents() == [saved['name']]
    assert page.locator('#modeDisplayBtn').get_attribute('aria-pressed') == 'true'
    page.locator('#styleStudioClose').click()
    quick_preset.select_option('opal')
    quick_preset.select_option(saved['id']); assert settings(page) == original
    assert not page.locator('#styleStudio').is_visible()
    page.locator('#styleStudioBtn').click()
    page.locator('#lookSaved').select_option(saved['id']); assert settings(page) == original
    page.locator('#lookSaveDetails > summary').click()
    with page.expect_download() as download:
        page.locator('#lookExport').click()
    exported = json.loads(Path(download.value.path()).read_text())
    assert exported['settings']['appearance.rendering'] == original['appearance.rendering']
    page.locator('#lookRename').click(); page.locator('#lookNameInput').press('Escape')
    assert page.locator('#styleStudio').is_visible() and not page.locator('#lookNameForm').is_visible()

    # The same controls and theme tokens are used inside and outside the window.
    fonts = page.evaluate('''() => ['#appearanceAtomSizeRow .vm-field-label','#appearanceAtomsSection .vm-field-label'].map(selector=>{
      const style=getComputedStyle(document.querySelector(selector));return [style.fontFamily,style.fontSize,style.color];
    })''')
    assert fonts[0] == fonts[1], fonts
    box = page.locator('#styleStudio').bounding_box()
    header = page.locator('#styleStudio .vm-list-popover__header').bounding_box()
    page.mouse.move(header['x']+80,header['y']+16);page.mouse.down()
    page.mouse.move(header['x']+180,header['y']+56,steps=6);page.mouse.up()
    moved = page.locator('#styleStudio').bounding_box()
    assert abs(moved['x']-box['x']-100)<1 and abs(moved['y']-box['y']-40)<1, (box,moved)
    page.locator('#styleStudioClose').click()
    assert page.locator('#styleStudioBtn').evaluate('el=>el===document.activeElement')
    assert quick_preset.locator('option:checked').inner_text() == 'My studio look'
    page.locator('#styleStudioBtn').click()
    assert page.locator('#styleStudio').bounding_box() == moved
    page.locator('#helpFab').click()
    assert page.locator('#helpOverlay').get_attribute('aria-hidden') == 'false'
    page.keyboard.press('Escape')
    assert page.locator('#helpOverlay').get_attribute('aria-hidden') == 'true'
    assert page.locator('#styleStudio').is_visible(), 'Escape dismisses Help above the Studio first'
    page.locator('#lookPreset').press('Escape')
    assert not page.locator('#styleStudio').is_visible()

    # Reload restores saved presets, while window placement/open state is transient.
    page.reload();page.wait_for_function('() => window.VibeMolAppearanceLooks')
    assert not page.locator('#styleStudio').is_visible()
    assert page.evaluate('() => VibeMolAppearanceLooks.snapshot().saved[0].name') == saved['name']
    assert p.load(page, [{'name': 'pyridine.xyz', 'text': (p.ROOT / 'assets/fragments/pyridine.xyz').read_text()}])['ok']
    if page.locator('#displayInspectorBtn').get_attribute('aria-expanded') != 'true': page.locator('#displayInspectorBtn').click()
    page.locator('#styleStudioBtn').click()
    page.locator('.vm-look-card[data-look="classic"]').click()
    page.screenshot(path=str(p.ARTIFACTS / 'style-studio-desktop.png'))
    page.locator('#appearanceMaterialsSection > summary').click()
    page.screenshot(path=str(p.ARTIFACTS / 'style-studio-materials.png'))
    page.locator('#styleStudioClose').click()
    page.hover('#topRightUtilities')
    page.wait_for_function('() => Number(getComputedStyle(document.querySelector("#topRightUtilitiesReveal")).opacity)>0.95')
    page.locator('#themeToggleShell').click();page.locator('#styleStudioBtn').click()
    assert page.locator('html').get_attribute('data-theme') == 'dark'
    page.screenshot(path=str(p.ARTIFACTS / 'style-studio-dark.png'))
    page.set_viewport_size({'width':390,'height':844})
    box = page.locator('#styleStudio').bounding_box()
    assert box['x']>=0 and box['x']+box['width']<=390 and box['y']>=0 and box['y']+box['height']<=844, box
    assert page.locator('#styleStudio').evaluate('el=>el.scrollWidth<=el.clientWidth+1')
    page.screenshot(path=str(p.ARTIFACTS / 'style-studio-mobile.png'))
    page.locator('#styleStudioClose').click()
    assert not page.locator('#styleStudio').is_visible()
    print('[studio] gallery, live edits, undo/revert, saved looks/export/reload, keyboard scope, dragging, themes and mobile: passed', flush=True)


def main():
    with p.run_http_server(p.ROOT) as url, p.sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for scenario in [run,background_controls]:
                context = browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1)
                context.add_init_script('('+p.MOLDEN_GRID_OBSERVER+')()')
                page = context.new_page();errors=[];console_errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.on('console',lambda message:console_errors.append(message.text) if message.type=='error' else None)
                page.on('dialog',lambda dialog:dialog.dismiss())
                try:
                    page.goto(url);page.wait_for_function('() => window.VibeMolAppearanceLooks')
                    scenario(page)
                    assert not errors,errors
                except Exception:
                    p.write_failure_artifacts(page,p.ARTIFACTS,'style-studio-'+scenario.__name__+'-failure',errors,console_errors);raise
                finally:
                    context.close()
        finally:
            browser.close()


if __name__ == '__main__':
    main()
