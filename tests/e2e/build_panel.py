#!/usr/bin/env python3
"""Build panel ownership, chemistry actions, mode suspension and saved layouts."""
import premerge as p
from workbench import layout, window_menu, bounded_build
from workbench_bar import open_menu
from workbench_consistency import mode


def run(page, url):
    page.goto(url+'?appearanceStudy=1')
    page.wait_for_function('()=>window.VibeMolWorkbench')
    page.evaluate('()=>VibeMolWorkbench.applyLayout({})')
    build=page.locator('#editAdaptiveAddAtomPopover')
    search=page.locator('#editBuildSearch')
    trigger=page.locator('#editAdaptiveAddAtomBtn')
    assert open_menu(page).get_by_role('menuitemcheckbox',name='Build',exact=True).count()==0
    page.keyboard.press('Escape')
    mode(page,'Edit')
    open_menu(page).get_by_role('menuitemcheckbox',name='Build',exact=True).click()
    assert build.is_visible() and build.get_attribute('data-wb-placement')=='right'
    bounded_build(page,build)

    # Search only filters until an explicit commit; selecting a payload keeps the
    # panel open and moves keyboard control back to molecular placement.
    search.fill('oxygen')
    before=page.evaluate('()=>VibeMolTesting.getEditBuildState().elementZ')
    build.locator('[data-vm-drag-handle]').focus()
    assert page.evaluate('()=>VibeMolTesting.getEditBuildState().elementZ')==before
    search.press('Enter')
    assert page.evaluate('()=>VibeMolTesting.getEditBuildState().elementZ')==8
    assert build.is_visible() and page.locator('#canvas').evaluate('el=>document.activeElement===el')
    box=page.locator('#canvas').bounding_box()
    point={'x':box['x']+box['width']*.42,'y':box['y']+box['height']*.42}
    page.mouse.click(**point)
    page.wait_for_function('()=>VibeMolStructure.exportActive()?.volume.atoms.some(a=>a.Z===8)')
    assert build.is_visible()
    search.fill('methyl')
    build.locator('#editFragmentQuick button:visible').first.click()
    assert page.evaluate('()=>VibeMolTesting.getEditBuildState().payload.kind')=='fragment'
    assert build.is_visible()
    search.fill('benzene');search.press('Enter')
    assert page.evaluate('()=>VibeMolTesting.getEditBuildState().payload.kind')=='molecule'
    page.mouse.click(**point)
    page.wait_for_function('()=>VibeMolTesting.getEditBuildState().moleculePlacementActive')
    mode(page,'Measure')
    assert not page.evaluate('()=>VibeMolTesting.getEditBuildState().moleculePlacementActive')
    assert build.is_hidden() and 'buildPanel' in layout(page)['open']
    mode(page,'Edit');assert build.is_visible() and search.input_value()=='benzene'

    # Build coexists with Symmetry and ordinary panel tabs. Its shortcut
    # reveals an inactive/minimized tab instead of closing the underlying panel.
    page.locator('#editAdaptiveSymmetryBtn').click()
    assert build.is_hidden() and page.locator('#editAdaptiveSymmetryPopover').is_visible()
    assert 'buildPanel' in layout(page)['open']
    page.locator('#editAdaptiveSymmetryBtn').click()
    page.evaluate('()=>VibeMolWorkbench.open("inspector")')
    assert build.is_hidden() and trigger.get_attribute('aria-expanded')=='false'
    trigger.click();assert build.is_visible()
    window_menu(page,build,'Minimize to Panels menu')
    row=open_menu(page).get_by_role('menuitemcheckbox',name='Build',exact=True)
    assert row.get_attribute('aria-checked')=='false' and 'Minimized' in row.inner_text()
    page.keyboard.press('Escape')
    mode(page,'Display');mode(page,'Edit');assert build.is_hidden()
    page.locator('#canvas').focus();page.keyboard.press('/')
    assert build.is_visible()
    page.wait_for_function('()=>document.activeElement===document.getElementById("editBuildSearch")')

    # Floating position, close choice and search survive mode/scene changes.
    window_menu(page,build,'Float window')
    assert build.get_attribute('role')=='dialog' and trigger.get_attribute('aria-haspopup')=='dialog'
    handle=build.locator('[data-vm-drag-handle]');box=handle.bounding_box()
    page.mouse.move(box['x']+20,box['y']+12);page.mouse.down()
    page.mouse.move(620,220,steps=8);page.mouse.up()
    position=layout(page)['positions']['buildPanel']
    for name in ['Display','Measure','Edit']:
        mode(page,name)
        assert layout(page)['positions']['buildPanel']==position
        assert build.is_visible()==(name=='Edit')
    build.get_by_role('button',name='Close Build',exact=True).click()
    mode(page,'Display');mode(page,'Edit');assert build.is_hidden()
    trigger.click();assert search.input_value()=='benzene'
    assert p.load(page,[{'name':'water.xyz','text':'O 0 0 0\nH .95 0 0\nH -.24 .92 0'}])['ok']
    assert build.is_visible()

    # Save a layout with Build, change layouts while outside Edit, then reload.
    # A stale transient-popup snapshot must not resurrect a closed Build panel.
    window_menu(page,build,'Dock below')
    page.locator('#workbenchArrange').click()
    page.get_by_role('textbox',name='Workspace name').fill('Building')
    page.get_by_role('button',name='Save workspace',exact=True).click()
    page.keyboard.press('Escape');mode(page,'Display')
    page.evaluate('()=>VibeMolWorkbench.applyLayout({})')
    mode(page,'Edit');assert build.is_hidden()
    mode(page,'Display');page.locator('#workbenchArrange').click()
    page.locator('#workbenchMenu').get_by_role('button',name='Building',exact=True).click()
    page.wait_for_function('()=>JSON.parse(localStorage.getItem("vibemol.workbench.lab.v1")).last.open.includes("buildPanel")')
    page.reload();page.wait_for_function('()=>window.VibeMolWorkbench')
    assert build.is_hidden()
    mode(page,'Edit');assert build.is_visible() and build.get_attribute('data-wb-placement')=='bottom'
    bounded_build(page,build)

    # Compact layout has one scrollable body; its header stays reachable.
    window_menu(page,build,'Dock right')
    page.set_viewport_size({'width':390,'height':740})
    page.wait_for_function('()=>document.getElementById("editAdaptiveAddAtomPopover").dataset.wbPlacement==="bottom"')
    bounded_build(page,build)
    header=handle.bounding_box()
    build.locator('#editMoleculeQuick button').last.scroll_into_view_if_needed()
    assert handle.bounding_box()==header
    assert build.locator('#editBuildPalette').evaluate('el=>el.scrollWidth<=el.clientWidth+1')
    page.screenshot(path=str(p.ARTIFACTS/'build-panel-mobile.png'))
    page.set_viewport_size({'width':1440,'height':1000})
    page.locator('#themeToggleShell').click()
    page.wait_for_function('''()=>getComputedStyle(document.getElementById('editAddCoordination')).backgroundColor
      === getComputedStyle(document.getElementById('editAdaptiveAddAtomPopover')).backgroundColor''')
    page.screenshot(path=str(p.ARTIFACTS/'build-panel-dark.png'))

    # Explicit legacy launches retain the popup and close-on-selection behavior.
    page.goto(url+'?workspaceLab=0&appearanceStudy=1')
    page.wait_for_function('()=>window.VibeMolTesting')
    page.locator('#modeEditBtn').click();trigger.click()
    search.fill('carbon');search.press('Enter')
    assert build.is_hidden() and build.get_attribute('data-wb-panel') is None
    print('[build panel] placement, persistent selection, docking, mode suspension, layouts, mobile and legacy: passed',flush=True)


def main():
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
        page=browser.new_page(viewport={'width':1440,'height':1000})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('dialog',lambda d:d.dismiss())
        try:
            run(page,url)
            assert not errors,errors
        except Exception:
            p.write_failure_artifacts(page,p.ARTIFACTS,'build-panel-failure',errors,[]);raise
        finally:browser.close()


if __name__=='__main__':main()
