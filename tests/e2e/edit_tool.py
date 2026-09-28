#!/usr/bin/env python3
"""Armed Edit tool, Escape ladder, keyboard semantics and visual contrast fixtures."""
import json
import premerge as p


def state(page):
    return page.evaluate('()=>VibeMolTesting.getEditBuildState()')


def arm(page, name='carbon'):
    page.locator('#canvas').focus();page.keyboard.press('/')
    page.locator('#editBuildSearch').fill(name);page.locator('#editBuildSearch').press('Enter')
    page.wait_for_function('()=>document.getElementById("editAdaptiveAddAtomBtn").getAttribute("aria-checked")==="true"')


def tool(page, name):
    page.wait_for_function('(name)=>document.getElementById(name).getAttribute("aria-checked")==="true"',
                           arg='editTransformToolBtn' if name=='transform' else 'editAdaptiveAddAtomBtn')
    radios=page.locator('#editToolStrip [role="radio"]')
    assert radios.count()==2
    assert radios.evaluate_all('(els)=>els.filter(e=>e.tabIndex===0).length')==1
    assert radios.evaluate_all('(els)=>els.filter(e=>e.getAttribute("aria-checked")==="true").length')==1
    assert page.locator('#editToolStrip [aria-pressed]').count()==0
    assert page.locator('#editToolStrip').get_attribute('aria-label')=='Edit tool'
    assert not page.evaluate('()=>document.getElementById("editAdaptiveAddAtomMeta")?.textContent.trim()')


def close_build(page):
    page.locator('#editAdaptiveAddAtomPopover').get_by_role('button',name='Close Build',exact=True).click()


def run(page, url):
    page.goto(url+'?appearanceStudy=1');page.wait_for_function('()=>window.VibeMolWorkbench')
    page.locator('#modeEditBtn').click();tool(page,'build')
    assert 'Click to place carbon' in state(page)['hint']
    assert page.locator('#editToolStrip [role="radio"]').evaluate_all('(els)=>els.map(e=>e.id)') == ['editAdaptiveAddAtomBtn', 'editTransformToolBtn']
    assert page.locator('#editTransformToolBtn').inner_text() == 'Transform'
    page.mouse.move(900,340)
    page.wait_for_function('()=>VibeMolTesting.getEditBuildState().gestureVoidPreviewVisible')
    page.locator('#editTransformToolBtn').click();tool(page,'transform')
    assert 'first atom' in state(page)['hint'] and 'Select atoms to edit' not in state(page)['hint']
    page.mouse.click(900,340)
    assert not p.snapshot(page)['scenes'], 'Transform unexpectedly created a structure'
    arm(page);tool(page,'build')
    assert page.locator('#editAdaptiveAddAtomBtn').get_attribute('aria-label')=='Build, carbon'
    assert page.locator('#editAdaptiveAddAtomBtn .vm-tool-badge').inner_text()=='C'
    # Escape with focus in the palette must disarm, not merely close its panel.
    page.locator('#editBuildSearch').focus();page.keyboard.press('Escape');tool(page,'transform')
    assert page.locator('#editAdaptiveAddAtomPopover').is_visible()
    arm(page);close_build(page);page.mouse.move(900,340)
    page.wait_for_function('()=>VibeMolTesting.getEditBuildState().gestureVoidPreviewVisible')
    assert page.locator('#editToolOverlay').is_visible()
    assert page.locator('.vm-build-cursor').is_visible()
    assert page.locator('#canvas').evaluate('el=>getComputedStyle(el).cursor')=='none'
    page.screenshot(path=str(p.ARTIFACTS/'edit-build-panel-closed.png'))
    page.mouse.click(900,340)
    page.wait_for_function('()=>VibeMolStructure.exportActive().volume.atoms.length>0')
    # Atom operator cancellation removes the provisional atom, stays armed.
    page.keyboard.press('Escape');tool(page,'build')
    page.keyboard.press('Escape');tool(page,'transform')
    assert page.locator('#editToolOverlay').is_hidden()
    assert page.locator('.vm-build-cursor').is_hidden()
    assert page.locator('#canvas').evaluate('el=>getComputedStyle(el).cursor')!='none'
    # An atom click selects without replacing its element; Esc clears selection.
    assert p.load(page,[{'name':'one.xyz','text':'1\noxygen\nO 0 0 0'}])['ok']
    page.locator('#modeDisplayBtn').click()
    page.locator('#modeEditBtn').click();tool(page,'build')
    page.locator('#editTransformToolBtn').click()
    box=page.locator('#canvas').bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
    page.mouse.click(x,y)
    page.wait_for_function('()=>VibeMolTesting.getEditSelectionCount()===1')
    assert page.evaluate('()=>VibeMolStructure.exportActive().volume.atoms[0].Z')==8
    assert 'Esc clears selection' in state(page)['hint']
    # Escape in an editable coordinate retains its native draft cancellation.
    page.wait_for_function('()=>document.querySelector(\'[data-selection-axis="x"]\').value==="0.0000"')
    coordinate=page.locator('[data-selection-axis="x"]');original=coordinate.input_value()
    coordinate.fill('99');coordinate.press('Escape')
    assert coordinate.input_value()==original, (original, coordinate.input_value())
    assert page.evaluate('()=>VibeMolTesting.getEditSelectionCount()')==1
    page.locator('#canvas').focus()
    page.keyboard.press('Escape');page.wait_for_function('()=>!VibeMolTesting.getEditSelectionCount()')
    # Fragment and molecule sessions keep their payload after cancellation.
    for name,kind in [('phenyl','fragment'),('benzene','molecule')]:
        arm(page,name);close_build(page)
        box=page.locator('#canvas').bounding_box();page.mouse.click(box['x']+box['width']*.8,box['y']+box['height']*.3)
        page.wait_for_function('()=>VibeMolTesting.getEditBuildState().moleculePlacementActive')
        assert state(page)['moleculePlacementKind']==kind
        assert 'Esc cancels placement' in state(page)['hint']
        page.keyboard.press('Escape');tool(page,'build')
        assert not state(page)['moleculePlacementActive'] and state(page)['payload']['kind']==kind
        page.keyboard.press('Escape');tool(page,'transform')
    # One Tab stop. Arrows select without throwing keyboard focus into the palette.
    page.locator('#editTransformToolBtn').focus();page.keyboard.press('Home');tool(page,'build')
    assert page.locator('#editAdaptiveAddAtomBtn').evaluate('el=>document.activeElement===el')
    page.keyboard.press('End');tool(page,'transform')
    page.keyboard.press('Tab');assert page.locator('#editToolStrip').evaluate('el=>!el.contains(document.activeElement)')
    arm(page);close_build(page)
    page.locator('#modeDisplayBtn').click();assert page.locator('#editToolStrip').is_hidden()
    page.locator('#modeEditBtn').click();tool(page,'build')
    # Existing bar remains usable at all supported widths.
    for width in [320,390,768,1440,1920]:
        page.set_viewport_size({'width':width,'height':1000});page.locator('#editTransformToolBtn').focus()
        page.keyboard.press('ArrowRight');tool(page,'build')
        page.wait_for_timeout(100)
        assert page.locator('.wb-tools').evaluate('el=>el.scrollWidth<=el.clientWidth+1'),width
        assert page.locator('#editToolStrip').evaluate('''el=>[...el.querySelectorAll('button')].every(b=>{
          const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})'''),width
        page.keyboard.press('ArrowLeft');tool(page,'transform')
    print('[edit tool] arming, selection, atom/fragment/molecule Escape, ARIA, keyboard, modes and widths: passed',flush=True)


def visual_schemes(browser, url):
    # Edit intentionally suppresses surfaces. Override suppression ONLY in this
    # isolated QA page to inspect neutral indicators against real orbital lobes.
    page=browser.new_page(viewport={'width':1440,'height':1000})
    source=(p.ROOT/'assets/app/js/app.js').read_text()
    source=source.replace('const suppressSurfaces = currentMode === MODES.EDIT ||', 'const suppressSurfaces =')
    page.route('**/assets/app/js/app.js',lambda route:route.fulfill(body=source,content_type='text/javascript'))
    page.goto(url+'?appearanceStudy=1');page.wait_for_function('()=>window.VibeMolWorkbench')
    assert p.load(page,[{'name':'hydrogen-2p.cube','text':p.hydrogen_2p_cube()}])['ok']
    page.locator('#modeEditBtn').click();arm(page);close_build(page)
    # Restored surfaces also activate the View-only hover tooltip; hide that
    # QA artifact so it cannot cover the creation badge under inspection.
    page.add_style_tag(content='#surfaceHoverLabel { display: none !important; }')
    schemes=page.locator('#schemeSelect option').evaluate_all('(els)=>els.map(e=>e.value).filter(v=>v && v!=="custom")')
    assert len(schemes)==5,schemes
    report={}
    for theme in ['light','dark']:
        if page.locator('#themeToggleInput').is_checked() != (theme == 'dark'):
            page.locator('#themeToggleShell').click()
        for scheme in schemes:
            page.locator('#schemeSelect').evaluate('(el,v)=>{el.value=v;el.dispatchEvent(new Event("change",{bubbles:true}))}',scheme)
            page.mouse.move(875,390);page.wait_for_timeout(250)
            assert page.locator('.vm-build-cursor').is_visible()
            assert any(m['visible'] for m in page.evaluate('()=>VibeMolTesting.getSurfaceMaterialSnapshot()'))
            page.screenshot(path=str(p.ARTIFACTS/f'edit-build-{scheme}-{theme}.png'))
        report[theme]=page.evaluate('''()=>{
          const root=getComputedStyle(document.documentElement),badge=getComputedStyle(document.querySelector('.vm-build-cursor .vm-tool-badge'));
          return {accent:root.getPropertyValue('--vm-color-tool-active').trim(),panel:root.getPropertyValue('--vm-color-surface-panel').trim(),text:badge.color};
        }''')
    (p.ARTIFACTS/'edit-tool-colors.json').write_text(json.dumps(report,indent=2))
    page.close();print('[edit tool] both themes × five orbital schemes rendered (QA-only surface visibility): passed',flush=True)


def main():
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
        page=browser.new_page(viewport={'width':1440,'height':1000});errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.dismiss())
        try:
            run(page,url);visual_schemes(browser,url);assert not errors,errors
        except Exception:
            p.write_failure_artifacts(page,p.ARTIFACTS,'edit-tool-failure',errors,[]);raise
        finally:browser.close()


if __name__=='__main__':main()
