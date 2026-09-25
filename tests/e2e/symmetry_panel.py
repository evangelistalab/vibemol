#!/usr/bin/env python3
"""Edit-only Symmetry panel ownership and actual symmetrization workflows."""
import premerge as p
from smoke import build_fixture_distorted_methane_structure, active_atom_positions, find_atom_click_point
from workbench import layout, window_menu, bounded_build
from workbench_bar import open_menu
from workbench_consistency import mode


def run(page, url):
    page.goto(url+'?appearanceStudy=1')
    page.wait_for_function('()=>window.VibeMolWorkbench')
    page.evaluate('()=>VibeMolWorkbench.applyLayout({})')
    page.evaluate('(text)=>VibeMolStructure.importFromText(text,"symmetry-fixture")',build_fixture_distorted_methane_structure())
    panel=page.locator('#editAdaptiveSymmetryPopover')
    trigger=page.locator('#editAdaptiveSymmetryBtn')
    tolerance=page.locator('#editSymmetryToleranceSelect')
    apply=page.locator('#editSymmetryApplyBtn')
    for name in ['Display','Measure']:
        mode(page,name)
        assert open_menu(page).get_by_role('menuitemcheckbox',name='Symmetry',exact=True).count()==0
        page.keyboard.press('Escape')
        page.evaluate('()=>VibeMolWorkbench.open("symmetryPanel")')
        assert panel.is_hidden()
    mode(page,'Edit')
    open_menu(page).get_by_role('menuitemcheckbox',name='Symmetry',exact=True).click()
    assert panel.is_visible() and panel.get_attribute('data-wb-placement')=='right'
    assert panel.get_attribute('role')=='tabpanel' and trigger.get_attribute('aria-expanded')=='true'
    bounded_build(page,panel)
    tolerance.select_option('0.100')
    candidate=panel.locator('[data-symmetry-group-id="Td"]')
    before=active_atom_positions(page)
    candidate.click();assert apply.is_enabled()
    assert active_atom_positions(page)==before
    page.locator('#editSymmetryCancelBtn').click()
    assert apply.is_disabled() and active_atom_positions(page)==before
    candidate.click();apply.click()
    assert active_atom_positions(page)!=before
    assert 'Td' in page.locator('#editSymmetryExactResult').inner_text()
    page.locator('#canvas').focus();page.keyboard.press('ControlOrMeta+z')
    assert active_atom_positions(page)==before and panel.is_visible()

    # Selection remains editable with this inspector open; its scope follows it.
    x,y=find_atom_click_point(page,0)
    page.mouse.click(x,y,button='right')
    page.wait_for_function('()=>VibeMolTesting.getEditSelectionCount()===1')
    assert 'Selected atoms (1)' in page.locator('#editSymmetryTargetSummary').inner_text()
    page.locator('#canvas').focus();page.keyboard.press('Escape')
    assert panel.is_visible()
    page.evaluate('()=>VibeMolTesting.setEditSelectionIndices([])')
    candidate.click()
    for name in ['Display','Measure']:
        mode(page,name);assert panel.is_hidden() and 'symmetryPanel' in layout(page)['open']
    mode(page,'Edit')
    assert panel.is_visible() and tolerance.input_value()=='0.100' and apply.is_disabled()
    assert active_atom_positions(page)==before

    # Build and Symmetry are independent dock tabs; neither silently closes the other.
    page.locator('#editAdaptiveAddAtomBtn').click()
    assert panel.is_hidden() and 'symmetryPanel' in layout(page)['open']
    page.locator('#editBuildSearch').fill('oxygen');page.locator('#editBuildSearch').press('Enter')
    canvas=page.locator('#canvas').bounding_box()
    page.mouse.click(canvas['x']+canvas['width']*.12,canvas['y']+canvas['height']*.2)
    page.wait_for_function('()=>VibeMolStructure.exportActive().volume.atoms.some(a=>a.Z===8)')
    page.locator('#canvas').focus();page.keyboard.press('s')
    assert panel.is_visible() and trigger.get_attribute('aria-expanded')=='true'
    assert 'buildPanel' in layout(page)['open']
    window_menu(page,panel,'Minimize to Panels menu')
    row=open_menu(page).get_by_role('menuitemcheckbox',name='Symmetry',exact=True)
    assert row.get_attribute('aria-checked')=='false' and 'Minimized' in row.inner_text()
    page.keyboard.press('Escape');mode(page,'Display');mode(page,'Edit')
    assert panel.is_hidden()
    page.locator('#canvas').focus();page.keyboard.press('s');assert panel.is_visible()
    window_menu(page,panel,'Float window')
    assert panel.get_attribute('role')=='dialog' and trigger.get_attribute('aria-haspopup')=='dialog'
    handle=panel.locator('[data-vm-drag-handle]');handle.focus();page.keyboard.press('Alt+ArrowLeft')
    position=layout(page)['positions']['symmetryPanel']
    mode(page,'Display');mode(page,'Edit')
    assert layout(page)['positions']['symmetryPanel']==position
    page.locator('#workbenchFocus').click();page.locator('#canvas').focus();page.keyboard.press('s')
    assert panel.is_visible() and not layout(page)['focus']
    panel.get_by_role('button',name='Close Symmetry',exact=True).click()
    mode(page,'Display');mode(page,'Edit');assert panel.is_hidden()

    # Layouts own visibility even when changed outside Edit; no stale popup snapshot.
    trigger.click();window_menu(page,panel,'Dock below')
    saved=layout(page)
    mode(page,'Display');page.evaluate('()=>VibeMolWorkbench.applyLayout({})')
    mode(page,'Edit');assert panel.is_hidden()
    mode(page,'Display');page.evaluate('(state)=>VibeMolWorkbench.applyLayout(state)',saved)
    mode(page,'Edit');assert panel.is_visible() and panel.get_attribute('data-wb-placement')=='bottom'
    page.wait_for_function('()=>{const state=JSON.parse(localStorage.getItem("vibemol.workbench.lab.v1")).last;return state.open.includes("symmetryPanel") && state.placements.symmetryPanel==="bottom"}')
    page.reload();page.wait_for_function('()=>window.VibeMolWorkbench')
    assert panel.is_hidden()
    page.evaluate('(text)=>VibeMolStructure.importFromText(text,"symmetry-fixture")',build_fixture_distorted_methane_structure())
    mode(page,'Edit');assert panel.is_visible() and panel.get_attribute('data-wb-placement')=='bottom'
    page.screenshot(path=str(p.ARTIFACTS/'symmetry-panel-desktop.png'))
    for width in [390,320]:
        page.set_viewport_size({'width':width,'height':780})
        page.wait_for_function('(width)=>innerWidth===width && document.body.dataset.wbCompact==="true"',arg=width)
        page.evaluate('()=>VibeMolWorkbench.open("symmetryPanel")')
        bounded_build(page,panel)
        header_before=handle.bounding_box()
        page.locator('#editSymmetryPanel').evaluate('el=>el.scrollTop=el.scrollHeight')
        assert handle.bounding_box()==header_before
        assert panel.locator('#editSymmetryPanel').evaluate('el=>el.scrollWidth<=el.clientWidth+1')
    page.screenshot(path=str(p.ARTIFACTS/'symmetry-panel-mobile.png'))
    print('[symmetry panel] modes, chemistry, selection, Build coexistence, layout persistence, keyboard and mobile: passed',flush=True)


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
            p.write_failure_artifacts(page,p.ARTIFACTS,'symmetry-panel-failure',errors,[]);raise
        finally:browser.close()


if __name__=='__main__':main()
