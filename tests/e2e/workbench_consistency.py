#!/usr/bin/env python3
"""Appearance ownership, coordinate permissions, and preserved mode context."""
import math
import premerge as p
from workbench import layout, window_menu, capture, open_panel
from workbench_bar import open_menu


def mode(page, name):
    page.locator('#mode'+name+'Btn').click()
    page.wait_for_function('(m)=>VibeMolWorkbenchHost.getMode()===m',arg=name.lower())


def corner_axes(page):
    # The last WebGL viewport is the real corner-axes pass, in buffer pixels.
    bounds=page.evaluate('''async () => {
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      const canvas=document.getElementById('canvas'), box=canvas.getBoundingClientRect();
      const gl=canvas.getContext('webgl2') || canvas.getContext('webgl');
      const [x,y,w,h]=gl.getParameter(gl.VIEWPORT);
      const sx=box.width/gl.drawingBufferWidth, sy=box.height/gl.drawingBufferHeight;
      const hint=document.getElementById('hint'), style=getComputedStyle(hint);
      const hintBox=hint.getBoundingClientRect();
      const anchor=style.visibility==='hidden' || !hintBox.height ? box.bottom
        : hintBox.top - new DOMMatrixReadOnly(style.transform).m42;
      return {left:box.left+x*sx, right:box.left+(x+w)*sx, top:box.bottom-(y+h)*sy,
        bottom:box.bottom-y*sy, canvas:box.toJSON(), gap:anchor-(box.bottom-y*sy)};
    }''')
    assert 15<=bounds['gap']<=17,bounds
    assert bounds['left']>=bounds['canvas']['left']+15,bounds
    assert bounds['right']<=bounds['canvas']['right']-15,bounds
    assert bounds['top']>=bounds['canvas']['top']+15,bounds
    assert page.locator('#helpFab').count()==0


def coordinates(page):
    assert p.load(page,[{'name':'water.xyz','text':'O 0 0 0\nH 0.95 0 0\nH -0.24 0.92 0'}])['ok']
    mode(page,'Display')
    page.locator('#canvas').focus();page.keyboard.press('c')
    assert page.locator('#coordsPanel').is_visible()
    for name in ['Display','Measure']:
        mode(page,name)
        assert page.locator('#coordsContent [data-edit-field]').count()==0
        assert 'Read-only' in page.locator('#coordsFooter').inner_text()
        assert page.locator('#copyXYZ').is_enabled() and page.locator('#downloadXYZ').is_enabled()
    mode(page,'Edit')
    assert page.locator('#coordsContent [data-edit-field]').count()==18
    cell=page.locator('#coordsContent tr[data-atom-index="0"] [data-edit-field="x"]')
    cell.click();page.locator('#coordsContent .coordsCellEditor').fill('0.125')
    page.locator('#coordsContent .coordsCellEditor').press('Enter')
    assert math.isclose(page.evaluate('()=>VibeMolStructure.exportActive().volume.atoms[0].x'),0.125)
    # An unfinished editor cannot commit once a programmatic mode change happens.
    cell.click();page.locator('#coordsContent .coordsCellEditor').fill('9')
    page.locator('#modeMeasureBtn').evaluate('el=>el.click()')
    assert page.locator('#coordsContent .coordsCellEditor').count()==0
    assert math.isclose(page.evaluate('()=>VibeMolStructure.exportActive().volume.atoms[0].x'),0.125)
    print('[consistency] Coordinates: read-only View/Measure, editing and pending-edit cancellation: passed',flush=True)


def workspace(page):
    # Both atoms are inside an opaque isosurface: picking must still reach them.
    field=p.cube(0).replace('1 -4 -4 -4','2 -4 -4 -4',1).replace('1 1 0 0 0\n','1 1 0 0 0\n1 1 1.4 0 0\n',1)
    assert p.load(page,[{'name':'enclosed.cube','text':field}])['ok']
    corner_axes(page)
    assert page.locator('#toolbar #displayInspector').count()==0
    assert page.locator('#toolbar .tb-appearance').count()==0
    assert page.locator('#toolbar #appearancePresetSection').count()==0
    assert page.locator('#displayInspector').count()==0
    assert page.locator('#sidePanel #appearanceCameraSection').count()==1
    assert open_menu(page).get_by_role('menuitemcheckbox',name='Quick actions',exact=True).is_visible()
    open_panel(page,'Properties')
    appearance=page.locator('#inspector')
    assert appearance.is_visible() and appearance.get_attribute('data-wb-placement')=='right'
    page.locator('#inspectorLookTab').click()
    preset=page.locator('#lookPreset');original=preset.input_value()
    preset.select_option('classic');preset.select_option(original)
    page.locator('#inspectorClose').click()
    assert page.locator('#workbenchPanelsBtn').evaluate('el=>document.activeElement===el')
    open_panel(page,'Properties');page.locator('#inspectorObjectTab').click()
    assert page.locator('#iso').count()==1 and appearance.locator('#iso').count()==1
    assert appearance.locator('select.vm-select:visible').first.bounding_box()['height']>=30
    page.locator('#autoIsoBtn').uncheck()
    page.locator('#iso').fill('0.03');page.locator('#iso').press('Enter')
    page.wait_for_function('()=>VibeMolTesting.getSceneGraphSnapshot().scenes.flatMap(s=>s.layers).some(l=>l.kind==="cube" && Math.abs(l.iso-0.03)<0.001)')
    page.evaluate('()=>VibeMolWorkbench.open("coordsPanel")')
    corner_axes(page)
    page.evaluate('()=>VibeMolWorkbench.open("viewInspector")')
    window_menu(page,page.locator('#viewInspector'),'Minimize to Panels menu')
    page.evaluate('()=>VibeMolWorkbench.open("styleStudio")')
    open_panel(page,'Properties')
    assert appearance.is_visible()
    window_menu(page,appearance,'Float window')
    handle=appearance.locator('[data-vm-drag-handle]');box=handle.bounding_box()
    page.mouse.move(box['x']+20,box['y']+12);page.mouse.down()
    page.mouse.move(box['x']+92,box['y']+44,steps=5);page.mouse.up()
    windows=layout(page);graph=p.snapshot(page)
    materials=page.evaluate('()=>VibeMolTesting.getSurfaceMaterialSnapshot()');assert materials
    for name in ['Measure','Edit','Measure','Display']:
        mode(page,name)
        assert layout(page)==windows
        assert p.snapshot(page)==graph
        meshes=page.evaluate('()=>VibeMolTesting.getSurfaceMaterialSnapshot()')
        assert len(meshes)==len(materials)
        assert [m['geometryId'] for m in meshes]==[m['geometryId'] for m in materials]
        assert all(m['visible']==(name!='Edit') for m in meshes)
        assert appearance.is_visible()
    # View-to-Measure is only an interaction change: reuse the exact surface meshes.
    materials=page.evaluate('()=>VibeMolTesting.getSurfaceMaterialSnapshot()')
    mode(page,'Measure')
    assert page.evaluate('()=>VibeMolTesting.getSurfaceMaterialSnapshot()')==materials
    window_menu(page,appearance,'Minimize to Panels menu')
    for index in [0,1]:
        point=page.evaluate('(i)=>VibeMolTesting.projectActiveAtomToClient(i)',index)
        page.mouse.click(point['x'],point['y'])
    page.wait_for_function('()=>VibeMolTesting.getMeasurementSnapshot().labelCount>0')
    assert page.evaluate('()=>VibeMolTesting.getMeasurementSnapshot().atomIndices')==[0,1]
    open_panel(page,'Properties');assert appearance.is_visible()
    page.locator('#inspectorVisible').uncheck()
    mode(page,'Edit');mode(page,'Display')
    assert not page.locator('#inspectorVisible').is_checked()
    assert page.evaluate('()=>VibeMolTesting.getSurfaceMaterialSnapshot()')==[]
    page.locator('#inspectorVisible').check()
    # Build is suspended, preserving its search, position, and explicit close choice.
    window_menu(page,appearance,'Minimize to Panels menu')
    mode(page,'Edit');page.locator('#editAdaptiveAddAtomBtn').click()
    build=page.locator('#editAdaptiveAddAtomPopover')
    page.locator('#editBuildSearch').fill('carbon')
    handle=build.locator('[data-vm-drag-handle]');box=handle.bounding_box()
    page.mouse.move(box['x']+24,box['y']+8);page.mouse.down()
    page.mouse.move(box['x']+76,box['y']+30,steps=5);page.mouse.up()
    position=page.evaluate('()=>VibeMolFloatingPanels.get(document.getElementById("editAdaptiveAddAtomPopover")).getPosition()')
    mode(page,'Measure');assert build.is_hidden()
    mode(page,'Edit');assert build.is_visible()
    assert page.locator('#editBuildSearch').input_value()=='carbon'
    assert page.evaluate('()=>VibeMolFloatingPanels.get(document.getElementById("editAdaptiveAddAtomPopover")).getPosition()')==position
    page.locator('#editAdaptiveAddAtomBtn').click()
    mode(page,'Display');mode(page,'Edit');assert build.is_hidden()
    page.locator('#editAdaptiveSymmetryBtn').click()
    symmetry=page.locator('#editAdaptiveSymmetryPopover')
    page.locator('#editSymmetryToleranceSelect').select_option('0.100')
    handle=symmetry.locator('[data-vm-drag-handle]');box=handle.bounding_box()
    page.mouse.move(box['x']+24,box['y']+8);page.mouse.down()
    page.mouse.move(box['x']+76,box['y']+30,steps=5);page.mouse.up()
    position=page.evaluate('()=>VibeMolFloatingPanels.get(document.getElementById("editAdaptiveSymmetryPopover")).getPosition()')
    mode(page,'Display');assert symmetry.is_hidden()
    mode(page,'Edit');assert symmetry.is_visible()
    assert page.locator('#editSymmetryToleranceSelect').input_value()=='0.100'
    assert page.evaluate('()=>VibeMolFloatingPanels.get(document.getElementById("editAdaptiveSymmetryPopover")).getPosition()')==position
    page.locator('#editAdaptiveSymmetryBtn').click()
    page.locator('#workbenchFocus').click()
    for name in ['Measure','Edit','Display']:
        mode(page,name);assert layout(page)['focus']
        corner_axes(page)
    page.locator('#workbenchFocus').click()
    open_panel(page,'Properties')
    window_menu(page,appearance,'Dock right')
    capture(page,'appearance-desktop')
    page.locator('#themeToggleShell').click();capture(page,'appearance-dark')
    page.set_viewport_size({'width':390,'height':740})
    page.wait_for_function('()=>VibeMolWorkbench.snapshot().compact')
    page.get_by_role('tab',name='Properties',exact=True).click()
    assert appearance.is_visible()
    box=appearance.bounding_box()
    assert box['x']>=0 and box['x']+box['width']<=391
    assert box['y']+box['height']<=741
    page.locator('#iso').scroll_into_view_if_needed()
    corner_axes(page)
    capture(page,'appearance-mobile')
    page.set_viewport_size({'width':1440,'height':1000})
    print('[consistency] Appearance, Quick actions, surfaces, measurement picking, layouts, Build, Symmetry and Focus: passed',flush=True)


def group_scope(page):
    assert p.load(page,[{'name':'orbitals.molden','text':p.MOLDEN}])['ok']
    page.evaluate('()=>VibeMolWorkbench.open("displayInspector")')
    appearance=page.locator('#inspector')
    window_menu(page,appearance,'Minimize to Panels menu')
    orbitals=p.cubes(page)
    page.locator(f'.vm-outliner-row[data-id="{orbitals[0]["parentId"]}"]').click()
    assert appearance.is_visible(), 'Group selection must reveal a minimized Appearance panel'
    page.locator('#autoIsoBtn').uncheck()
    page.locator('#iso').fill('0.025');page.locator('#iso').press('Enter')
    assert all(math.isclose(layer['iso'],0.025) and not layer['visible'] for layer in p.cubes(page))
    assert page.evaluate('()=>__moldenGridBuilds')==[]
    print('[consistency] Orbital-group selection reveals Appearance and edits deferred layers without computing grids: passed',flush=True)


def main():
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
        page=browser.new_page(viewport={'width':1440,'height':1000})
        page.add_init_script('('+p.MOLDEN_GRID_OBSERVER+')()')
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('dialog',lambda d:d.dismiss())
        try:
            page.goto(url+'?workspaceLab=1&appearanceStudy=1');page.wait_for_function('()=>window.VibeMolWorkbench')
            workspace(page)
            page.goto(url+'?workspaceLab=1&appearanceStudy=1');page.wait_for_function('()=>window.VibeMolWorkbench')
            page.evaluate('()=>VibeMolWorkbench.applyLayout({})')
            group_scope(page)
            page.goto(url+'?workspaceLab=1&appearanceStudy=1');page.wait_for_function('()=>window.VibeMolWorkbench')
            page.evaluate('()=>VibeMolWorkbench.applyLayout({})')
            coordinates(page)
            page.goto(url+'?workspaceLab=0&appearanceStudy=1');page.wait_for_function('()=>window.VibeMolTesting')
            assert page.locator('#toolbar #displayInspector').count()==1
            assert page.locator('#toolbarModeRow').count()==1
            coordinates(page)
            corner_axes(page)
            assert not errors,errors
        except Exception:
            p.write_failure_artifacts(page,p.ARTIFACTS,'consistency-failure',errors,[]);raise
        finally:browser.close()


if __name__=='__main__':main()
