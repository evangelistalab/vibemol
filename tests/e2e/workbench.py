#!/usr/bin/env python3
"""Opt-in workspace behavior against the real renderer and inspector controls."""
import math
import premerge as p
from workbench_bar import open_menu


def layout(page):
    return page.evaluate('() => VibeMolWorkbench.snapshot()')


def window_menu(page, panel, action):
    panel.locator('.wb-window-menu').click()
    page.locator('#workbenchMenu').get_by_role('button', name=action, exact=True).click()


def open_panel(page, name):
    row = open_menu(page).get_by_role('menuitemcheckbox', name=name, exact=True)
    if row.get_attribute('aria-checked') != 'true':
        row.click()
    if page.locator('#workbenchPanelsMenu').is_visible():
        page.keyboard.press('Escape')
    tab = page.get_by_role('tab', name=name, exact=True)
    if tab.count():
        tab.click()


def capture(page, name):
    page.screenshot(path=str(p.ARTIFACTS/('workbench-'+name+'.png')),animations='disabled')


def bounded_palette(page, panel):
    box=panel.bounding_box();bar=page.locator('#workbenchBar').bounding_box()
    assert box['x']>=11 and box['x']+box['width']<=page.viewport_size['width']-11,box
    assert box['y']>=bar['y']+bar['height'] and box['y']+box['height']<=page.viewport_size['height']-11,box
    assert panel.evaluate('el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+20,r.y+20))}')


def modes(page):
    page.evaluate('() => VibeMolWorkbench.applyLayout({})')
    assert p.load(page,[{'name':'modes.molden','text':p.MOLDEN}])['ok']
    page.evaluate('() => {VibeMolWorkbench.open("inspector");VibeMolWorkbench.open("moldenInspector");VibeMolWorkbench.open("coordsPanel")}')
    before=p.snapshot(page);windows=layout(page);camera=page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
    assert page.locator('#workbenchBar #toolbarModeRow').count()==1
    assert page.locator('#toolbar #toolbarModeRow').count()==0
    for mode in ['Measure','Edit','Display']:
        page.locator('#mode'+mode+'Btn').click()
        page.wait_for_function('(mode)=>document.body.dataset.wbMode===mode',arg={'Measure':'measure','Edit':'edit','Display':'display'}[mode])
        assert page.locator('#displayWindowAdaptiveMenu').is_hidden()
        for name in ['Coordinates','Properties','Camera','Quick actions']:
            assert open_menu(page).get_by_role('menuitemcheckbox',name=name,exact=True).is_visible()
        page.keyboard.press('Escape')
        assert page.locator('#coordsPanel').is_visible()
        assert ('moldenInspector' in layout(page)['open'])
        assert page.locator('#moldenInspector').is_visible()==(mode!='Edit')
        assert page.locator('#workbenchClearMeasurements').is_visible()==(mode=='Measure')
        assert page.locator('#editAdaptiveAddAtomBtn').is_visible()==(mode=='Edit')
        if mode=='Edit':assert 'opens Build' in page.locator('#hint').inner_text()
    assert layout(page)==windows
    assert p.snapshot(page)==before and page.evaluate('() => __moldenGridBuilds')==[]
    after_camera=page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
    assert after_camera['mode']==camera['mode'] and after_camera['controlsEnabled']==camera['controlsEnabled']
    for vector in ['camera','target','up']:
        for axis in ['x','y','z']:assert math.isclose(after_camera[vector][axis],camera[vector][axis],abs_tol=1e-10)

    # Mode keys follow the original callbacks; shared inspector shortcuts work in Edit.
    page.locator('#canvas').focus();page.keyboard.press('e')
    page.wait_for_function('()=>document.body.dataset.wbMode==="edit"')
    page.keyboard.press('m');assert page.locator('#modeMeasureBtn').get_attribute('aria-checked')=='true'
    page.keyboard.press('e');assert page.locator('#modeEditBtn').get_attribute('aria-checked')=='true'
    window_menu(page,page.locator('#coordsPanel'),'Minimize to Panels menu')
    page.locator('#canvas').focus();page.keyboard.press('c');assert page.locator('#coordsPanel').is_visible()
    page.keyboard.press('v');assert page.locator('#sidePanel').is_visible()
    page.keyboard.press('v');assert page.locator('#sidePanel').is_hidden()
    page.evaluate('()=>VibeMolTesting.setEditSelectionIndices([0])')
    page.locator('#canvas').focus();page.keyboard.press('Escape')
    # An active operator cancels before the underlying atom selection clears.
    if page.evaluate('()=>VibeMolTesting.getEditSelectionCount()'):
        page.keyboard.press('Escape')
    assert page.evaluate('()=>VibeMolTesting.getEditSelectionCount()')==0
    assert 'inspector' in layout(page)['open'] and page.locator('#coordsPanel').is_visible()
    page.locator('#workbenchFocus').click();page.locator('#canvas').focus();page.keyboard.press('/')
    assert not layout(page)['focus']
    build=page.locator('#editAdaptiveAddAtomPopover');bounded_palette(page,build)
    assert page.locator('#editAdaptiveAddAtomBtn .adaptiveEditItemLabel').inner_text()=='Build'
    assert page.locator('#editAdaptiveSymmetryBtn .adaptiveEditItemLabel').inner_text()=='Symmetry'
    assert page.locator('#editAdaptiveCleanStructureBtn .adaptiveEditItemLabel').inner_text()=='Optimize'
    page.locator('#editAdaptiveSymmetryBtn').click()
    assert build.is_hidden();bounded_palette(page,page.locator('#editAdaptiveSymmetryPopover'))
    page.locator('#modeMeasureBtn').click();assert page.locator('#editAdaptiveSymmetryPopover').is_hidden()
    assert page.get_by_role('tab',name='Orbitals',exact=True).is_visible()
    page.get_by_role('tab',name='Orbitals',exact=True).click()
    assert page.locator('#moldenInspector').is_visible()

    # Collapsed sidebar and Focus both retain direct access to all three modes.
    page.locator('#toolbarCollapseBtn').click()
    page.locator('#modeMeasureBtn').focus();page.keyboard.press('ArrowRight')
    assert page.locator('#modeEditBtn').get_attribute('aria-checked')=='true'
    page.locator('#workbenchFocus').click();page.locator('#modeDisplayBtn').click()
    assert layout(page)['focus']
    page.locator('#workbenchFocus').click()
    assert page.locator('#moldenInspector').is_visible()
    assert page.locator('#toolbarShowBtn').is_visible()
    page.locator('#toolbarShowBtn').click();capture(page,'modes-desktop')

    page.set_viewport_size({'width':390,'height':740})
    for mode in ['Measure','Edit','Display']:
        page.locator('#mode'+mode+'Btn').click()
        for name in ['Display','Measure','Edit']:assert page.locator('#mode'+name+'Btn').is_visible()
        bar=page.locator('#workbenchBar').bounding_box();canvas=page.locator('#canvas').bounding_box()
        assert canvas['y']>=bar['height'] and canvas['height']>=200
        if mode=='Edit':
            page.locator('#editAdaptiveAddAtomBtn').click();bounded_palette(page,build);capture(page,'modes-mobile-build')
    assert build.is_hidden();capture(page,'modes-mobile')
    page.set_viewport_size({'width':1440,'height':1000})

    # The Measure action clears actual picked atoms and the rendered distance label.
    page.evaluate('() => VibeMolWorkbench.applyLayout({})')
    assert p.load(page,[{'name':'water.xyz','text':'O 0 0 0\nH 0.95 0 0\nH -0.24 0.92 0'}])['ok']
    page.locator('#modeMeasureBtn').click()
    page.evaluate('()=>VibeMolWorkbench.open("inspector")')
    for index in [0,1]:
        point=page.evaluate('(i)=>VibeMolTesting.projectActiveAtomToClient(i)',index);page.mouse.click(point['x'],point['y'])
    page.wait_for_function('()=>VibeMolTesting.getMeasurementSnapshot().labelCount>0')
    page.keyboard.press('Escape')
    assert page.evaluate('()=>VibeMolTesting.getMeasurementSnapshot()')=={'atomIndices':[],'labelCount':0}
    assert page.locator('#inspector').is_visible()
    for index in [0,1]:
        point=page.evaluate('(i)=>VibeMolTesting.projectActiveAtomToClient(i)',index);page.mouse.click(point['x'],point['y'])
    page.wait_for_function('()=>VibeMolTesting.getMeasurementSnapshot().labelCount>0')
    page.locator('#workbenchClearMeasurements').click()
    assert page.evaluate('()=>VibeMolTesting.getMeasurementSnapshot()')=={'atomIndices':[],'labelCount':0}
    assert page.locator('#modeMeasureBtn').get_attribute('aria-checked')=='true'
    print('[workbench] mode bar, shared and suspended inspectors, stable Edit actions, palette bounds, shortcuts, Focus and measurements: passed',flush=True)


def run(page):
    assert p.load(page,[{'name':'orbitals.molden','text':p.MOLDEN}])['ok']
    orbitals=page.locator('#moldenInspector'); coordinates=page.locator('#coordsPanel')
    page.wait_for_function('() => document.getElementById("moldenInspector").dataset.wbPlacement==="right"')
    assert orbitals.is_visible()
    assert open_menu(page).get_by_role('menuitemcheckbox',name='Trajectory',exact=True).count()==0
    assert open_menu(page).get_by_role('menuitemcheckbox',name='Spinor info',exact=True).count()==0
    open_panel(page,'Coordinates')
    assert coordinates.is_visible() and orbitals.is_visible()
    canvas=page.locator('#canvas').bounding_box()
    assert canvas['x']+canvas['width'] <= orbitals.bounding_box()['x']+1
    assert canvas['y']+canvas['height'] <= page.locator('#workbenchDockBottom').bounding_box()['y']+1
    page.locator('#coordsUnitsBtn').click()
    assert 'bohr' in page.locator('#coordsPanelTitle').inner_text()
    page.locator('#moldenEnergyFilter').fill('0.1'); page.locator('#moldenEnergyFilter').press('Tab')
    before=p.snapshot(page)
    open_panel(page,'Properties')
    assert orbitals.is_hidden() and page.locator('#inspector').is_visible() and coordinates.is_visible()
    assert 'moldenInspector' in layout(page)['open']
    page.get_by_role('tab',name='Orbitals',exact=True).click()
    assert page.locator('#moldenEnergyFilter').input_value()=='0.1'
    assert page.evaluate('() => __moldenGridBuilds')==[]

    window_menu(page,orbitals,'Float window')
    assert orbitals.get_attribute('data-wb-placement')=='float'
    header=orbitals.locator('[data-vm-drag-handle]').bounding_box()
    page.mouse.move(header['x']+18,header['y']+15);page.mouse.down()
    page.mouse.move(page.viewport_size['width']-20,140,steps=12)
    assert page.locator('#workbenchSnap').is_visible()
    capture(page,'snap-preview')
    page.mouse.up()
    assert orbitals.get_attribute('data-wb-placement')=='right'
    assert page.locator('#workbenchSnap').is_hidden()
    # Tear the docked inspector out; cancelling a subsequent snap keeps it floating.
    header=orbitals.locator('[data-vm-drag-handle]').bounding_box()
    page.mouse.move(header['x']+18,header['y']+15);page.mouse.down()
    page.mouse.move(760,160,steps=10);page.mouse.up()
    assert orbitals.get_attribute('data-wb-placement')=='float'
    assert layout(page)['draggingId'] is None
    header=orbitals.locator('[data-vm-drag-handle]').bounding_box()
    page.mouse.move(header['x']+18,header['y']+15);page.mouse.down()
    page.mouse.move(page.viewport_size['width']-20,140,steps=10)
    assert page.locator('#workbenchSnap').is_visible()
    orbitals.evaluate('el=>el.dispatchEvent(new PointerEvent("pointercancel",{bubbles:true}))')
    page.mouse.up()
    assert page.locator('#workbenchSnap').is_hidden() and orbitals.get_attribute('data-wb-placement')=='float'
    page.evaluate('() => VibeMolWorkbench.place("moldenInspector","right")')
    assert p.snapshot(page)==before
    assert page.evaluate('() => __moldenGridBuilds')==[]

    size=layout(page)['rightWidth']; grip=page.get_by_role('separator',name='Resize right dock')
    grip.focus(); page.keyboard.press('ArrowLeft')
    assert layout(page)['rightWidth']==size+10
    window_menu(page,coordinates,'Minimize to Panels menu')
    assert coordinates.is_hidden() and 'coordsPanel' in layout(page)['open']
    page.locator('#canvas').focus();page.keyboard.press('c')
    assert coordinates.is_visible()
    original=layout(page)
    page.locator('#workbenchFocus').click()
    assert orbitals.is_hidden() and coordinates.is_hidden()
    assert page.locator('#canvas').bounding_box()['width']==page.viewport_size['width']
    capture(page,'focus')
    page.keyboard.press('Escape')
    assert orbitals.is_visible() and coordinates.is_visible()
    assert layout(page)==original
    assert p.snapshot(page)==before

    page.locator('#workbenchArrange').click()
    page.get_by_role('textbox',name='Workspace name').fill('Orbital analysis')
    page.get_by_role('button',name='Save workspace',exact=True).click()
    assert 'saved' in page.locator('#workbenchMenu [role="status"]').inner_text()
    page.keyboard.press('Escape')
    page.locator('#workbenchArrange').click()
    page.get_by_role('button',name='Style',exact=True).click()
    assert page.locator('#inspector').is_visible()
    page.locator('#workbenchArrange').click()
    page.get_by_role('button',name='Orbital analysis',exact=True).click()
    assert coordinates.is_visible() and orbitals.is_visible()
    assert layout(page)['rightWidth']==original['rightWidth']
    capture(page,'desktop')
    # Focus must retain the active tab when hiding the sidebar crosses a breakpoint.
    page.set_viewport_size({'width':900,'height':850})
    page.wait_for_function('() => VibeMolWorkbench.snapshot().compact')
    page.get_by_role('tab',name='Properties',exact=True).click()
    compact_layout=layout(page)
    page.locator('#workbenchFocus').click();page.keyboard.press('Escape')
    assert layout(page)==compact_layout
    page.set_viewport_size({'width':1600,'height':1000})
    page.locator('#themeToggleShell').click()
    capture(page,'dark')
    page.set_viewport_size({'width':390,'height':740})
    page.wait_for_function('() => VibeMolWorkbench.snapshot().compact')
    assert page.locator('#workbenchDockRight').is_hidden()
    assert page.locator('#workbenchDockBottom').is_visible()
    assert page.locator('#canvas').bounding_box()['height']>=200
    for name in ['Orbitals','Coordinates','Properties']:
        page.get_by_role('tab',name=name,exact=True).click()
        selected=page.locator('.wb-dock .wb-tab[aria-selected="true"]'); assert selected.get_attribute('aria-label')==name
    capture(page,'mobile')
    assert page.evaluate('() => __moldenGridBuilds')==[]
    page.set_viewport_size({'width':1600,'height':1000})
    page.evaluate('() => VibeMolWorkbench.open("moldenInspector")')
    window_menu(page,orbitals,'Float window')
    moved=orbitals.bounding_box()
    page.locator('#workbenchArrange').click()
    page.get_by_role('textbox',name='Workspace name').fill('Floating orbitals')
    page.get_by_role('button',name='Save workspace',exact=True).click()
    page.keyboard.press('Escape')
    page.reload();page.wait_for_function('() => window.VibeMolWorkbench')
    assert p.load(page,[{'name':'orbitals.molden','text':p.MOLDEN}])['ok']
    page.wait_for_function('() => document.getElementById("moldenInspector").dataset.wbPlacement==="float"')
    assert abs(orbitals.bounding_box()['x']-moved['x'])<1 and abs(orbitals.bounding_box()['y']-moved['y'])<1
    assert page.evaluate('() => __moldenGridBuilds')==[]
    # Escape closes the focused inspector even if Properties is also logically open.
    page.evaluate('() => VibeMolWorkbench.open("inspector")')
    orbitals.locator('[data-vm-drag-handle]').focus();page.keyboard.press('Escape')
    assert orbitals.is_hidden() and page.locator('#inspector').is_visible()
    # Keep molecular editing and its contextual Build palette available in the study.
    page.locator('#modeEditBtn').click()
    page.locator('#editAdaptiveAddAtomBtn').evaluate('el=>el.click()')
    build=page.locator('#editAdaptiveAddAtomPopover');assert build.is_visible()
    assert build.get_attribute('data-wb-placement') is None
    page.locator('#editBuildSearch').fill('carbon')
    page.locator('#modeDisplayBtn').click()
    assert build.is_hidden()
    print('[workbench] real inspectors, docks, snap preview, resizing, minimize, Focus, saved layouts, themes and mobile: passed',flush=True)


def main():
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True)
        try:
            context=browser.new_context(viewport={'width':1600,'height':1000})
            context.add_init_script('('+p.MOLDEN_GRID_OBSERVER+')()')
            page=context.new_page(); errors=[]; consoles=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('console',lambda m:consoles.append(m.text) if m.type=='error' else None)
            page.on('dialog',lambda d:d.dismiss())
            try:
                page.goto(url+'?appearanceStudy=1');page.wait_for_function('() => VibeMolAppearanceLooks')
                assert page.evaluate('() => typeof VibeMolWorkbench')=='undefined'
                assert page.locator('#workbenchBar').count()==0
                assert page.locator('#toolbar #toolbarModeRow').count()==1
                page.goto(url+'?workspaceLab=1');page.wait_for_function('() => window.VibeMolWorkbench')
                run(page);modes(page);assert not errors,errors
            except Exception:
                p.write_failure_artifacts(page,p.ARTIFACTS,'workbench-failure',errors,consoles);raise
            finally:context.close()
        finally:browser.close()


if __name__=='__main__':main()
