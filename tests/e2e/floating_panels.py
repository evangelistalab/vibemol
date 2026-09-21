#!/usr/bin/env python3
"""Shared dragging across every popup shell and live display/edit workflows."""
import math
import json
import premerge as p


def drag(page, panel, dx=70, dy=40):
    handle = panel.locator('[data-vm-drag-handle]').first
    handle.wait_for(state='visible')
    handle.hover()
    before = panel.bounding_box()
    box = handle.bounding_box()
    x, y = box['x'] + min(30, box['width']/2), box['y'] + min(15, box['height']/2)
    page.mouse.move(x, y); page.mouse.down()
    page.mouse.move(x+dx, y+dy, steps=6); page.mouse.up()
    after = panel.bounding_box()
    expected_x = max(12, min(before['x']+dx, page.viewport_size['width']-after['width']-12))
    expected_y = max(12, min(before['y']+dy, page.viewport_size['height']-after['height']-12))
    assert math.isclose(after['x'], expected_x, abs_tol=1), (before, after)
    assert math.isclose(after['y'], expected_y, abs_tol=1), (before, after)
    assert panel.get_attribute('data-vm-floating-moved') == 'true'
    return after


def catalog_contract(page):
    assert p.load(page, [{'name':'a.cube','text':p.cube(-1)}, {'name':'b.cube','text':p.cube(1)}])['ok']
    a, b = p.cubes(page)
    page.locator(f'.vm-outliner-row[data-id="{a["id"]}"]').click()
    page.locator(f'.vm-outliner-row[data-id="{b["id"]}"]').click(modifiers=['ControlOrMeta'])
    p.context_item(page, a['id'], 'Combine (2)...')
    page.locator('.vm-combine-popover__button.is-secondary').click()
    panels = page.locator('[data-vm-floating-panel]')
    assert panels.count() == 24
    # Clone each real shell to exercise its layout and shared movement without
    # the app hiding contextually unavailable tools. Live workflows below use
    # the originals, the running renderer and normal opening/closing commands.
    page.evaluate('''() => {
      const raf=window.requestAnimationFrame;
      window.requestAnimationFrame=fn=>fn.name==='render'?0:raf(fn);
      document.querySelectorAll('[data-vm-floating-panel]').forEach(el=>{
        el.hidden=true; el.setAttribute('aria-hidden','true'); el.style.display='none';
      });
    }''')
    structure = page.evaluate('() => VibeMolStructure.exportActive().volume')
    for i in range(panels.count()):
        panels.nth(i).evaluate('''source => {
          const el=source.cloneNode(true);
          el.setAttribute('data-floating-contract','');
          document.body.append(el);
          VibeMolFloatingPanels.register(el,{label:source.getAttribute('data-vm-floating-panel'),handle:'[data-vm-drag-handle]'});
        }''')
        panel = page.locator('[data-floating-contract]')
        label = panel.get_attribute('data-vm-floating-panel')
        panel.evaluate('''el => {
          el.hidden=false; el.style.display=''; el.classList.add('open'); el.setAttribute('aria-hidden','false');
          const backdrop=el.closest('#helpOverlay,#elementColorOverlay,.vm-canvas-video-export__overlay');
          if(backdrop){backdrop.hidden=false;backdrop.setAttribute('aria-hidden','false');backdrop.style.display='flex';}
          el.style.position='fixed'; el.style.left='400px'; el.style.top='110px'; el.style.bottom='auto'; el.style.right='auto';
          el.style.zIndex='10060';
          if(getComputedStyle(el).display==='none') el.style.display='block';
        }''')
        after = drag(page, panel)
        # Legacy layout code can keep calculating anchor positions without
        # overwriting a manual placement, even when it rerenders a header.
        panel.evaluate("el => { el.style.left='16px'; el.style.top='20px'; }")
        assert panel.bounding_box() == after, label
        panel.evaluate("el=>{el.hidden=true;el.hidden=false;}")
        assert panel.bounding_box() == after, label
        handle = panel.locator('[data-vm-drag-handle]').first
        handle.focus(); page.keyboard.press('Alt+ArrowLeft')
        assert abs(panel.bounding_box()['x']-max(12, after['x']-10))<1, label
        page.keyboard.press('Alt+Home')
        assert panel.get_attribute('data-vm-floating-moved') is None, label
        panel.evaluate('''el=>{
          el.hidden=true; el.style.display='none'; el.setAttribute('aria-hidden','true');
          const backdrop=el.closest('#helpOverlay,#elementColorOverlay,.vm-canvas-video-export__overlay');
          if(backdrop){backdrop.setAttribute('aria-hidden','true');backdrop.style.display='none';}
        }''')
        panel.evaluate('el=>el.remove()')
        print('[floating] drag, live placement, reopen and keyboard:', label, flush=True)
    assert page.evaluate('() => VibeMolStructure.exportActive().volume') == structure


def live_workflows(page):
    assert p.load(page, [{'name':'orbitals.molden','text':p.MOLDEN}])['ok']
    orbitals = page.locator('#moldenInspector')
    moved = drag(page, orbitals)
    page.locator('#moldenEnergyFilter').fill('0.1')
    page.locator('#moldenEnergyFilter').press('Tab')
    assert orbitals.bounding_box() == moved
    assert page.evaluate('() => window.__moldenGridBuilds') == []
    page.locator('#moldenInspectorClose').click()
    page.locator('#moldenInspectorBtn').evaluate('el=>el.click()')
    assert orbitals.bounding_box() == moved
    for button, panel_id in [('viewInspectorBtn','viewInspector'),('viewPanelBtn','sidePanel'),('coordsPanelBtn','coordsPanel')]:
        page.locator('#'+button).evaluate('el=>el.click()')
        panel=page.locator('#'+panel_id)
        before=page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
        drag(page,panel)
        after=page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
        assert before['mode']==after['mode'] and before['controlsEnabled']==after['controlsEnabled'],(before,after)
        for vector in ['camera','target','up']:
            assert all(math.isclose(before[vector][axis],after[vector][axis],abs_tol=1e-9) for axis in ['x','y','z']),(before,after)
    page.locator('#displayInspectorBtn').click()
    page.locator('#appearanceResetBtn').click()
    reset=page.locator('#appearanceResetPopover')
    assert reset.evaluate('el=>el.parentElement===document.body')
    before=page.evaluate('() => VibeMolAppearanceLooks.snapshot().settings')
    drag(page,reset,dx=400)
    page.locator('#appearanceResetCancelBtn').click()
    assert page.evaluate('() => VibeMolAppearanceLooks.snapshot().settings')==before

    page.locator('#modeEditBtn').click()
    # Coordinates now remains available in Edit. Close it explicitly before
    # exercising selection tools at the same position on the canvas.
    assert page.locator('#coordsPanel').is_visible()
    page.locator('#coordsPanelClose').click()
    page.locator('#editAdaptiveAddAtomBtn').evaluate('el=>el.click()')
    build=page.locator('#editAdaptiveAddAtomPopover'); moved=drag(page,build)
    page.locator('#editBuildSearch').fill('carbon')
    assert build.bounding_box()['x']==moved['x'] and build.bounding_box()['y']==moved['y']
    page.screenshot(path=str(p.ARTIFACTS/'floating-build.png'))
    page.locator('#editAdaptiveAddAtomBtn').evaluate('el=>el.click()')
    assert build.get_attribute('aria-hidden')=='true'
    page.locator('#editAdaptiveAddAtomBtn').evaluate('el=>el.click()')
    assert build.bounding_box()['x']==moved['x'] and build.bounding_box()['y']==moved['y']
    page.locator('#editAdaptiveAddAtomBtn').evaluate('el=>el.click()')
    page.evaluate('() => VibeMolTesting.setEditSelectionIndices([0])')
    selection=page.locator('#editSelectionTranslateCue')
    drag(page,selection)
    operator=page.locator('#editAddAtomOperatorPanel')
    operator.wait_for(state='visible')
    collapsed=operator.get_attribute('data-collapsed')
    drag(page,operator)
    assert operator.get_attribute('data-collapsed')==collapsed, 'Drag must not collapse the panel'
    page.locator('#editAddAtomOperatorHeader').click()
    assert operator.get_attribute('data-collapsed')!=collapsed, 'A plain click must still collapse/expand'
    print('[floating] live orbital filters, exclusive windows, camera safety, reset cancel, Build search and operator clicks: passed',flush=True)


def live_menus_and_video(page):
    assert p.load(page, [{'name':'a.cube','text':p.cube(-1)}, {'name':'b.cube','text':p.cube(1)}])['ok']
    a,b=p.cubes(page)
    page.locator(f'.vm-outliner-row[data-id="{a["id"]}"]').click()
    page.locator(f'.vm-outliner-row[data-id="{b["id"]}"]').click(modifiers=['ControlOrMeta'])
    p.context_item(page,a['id'],'Combine (2)...')
    arithmetic=page.locator('.vm-combine-popover'); moved=drag(page,arithmetic,dx=200)
    # Operation changes rebuild the form and its header. Preserve the handle and
    # placement without dismissing the form or running an arithmetic operation.
    operation=arithmetic.locator('.vm-combine-popover__select').first
    options=operation.locator('option').evaluate_all('els=>els.map(el=>el.value)')
    operation.select_option(next(value for value in options if value!=operation.input_value()))
    assert arithmetic.bounding_box()['x']==moved['x'] and arithmetic.bounding_box()['y']==moved['y']
    assert arithmetic.locator('[data-vm-drag-handle]').count()==1
    page.set_viewport_size({'width':1300,'height':900})
    assert arithmetic.is_visible()
    arithmetic.locator('.vm-combine-popover__button.is-secondary').click()
    page.locator('#sceneOutlinerAddBtn').click()
    menu=page.locator('.vm-outliner-context-menu'); drag(page,menu,dx=300)
    count=len(p.snapshot(page)['scenes'])
    menu.get_by_role('menuitem',name='Create empty scene',exact=True).click()
    assert len(p.snapshot(page)['scenes'])==count+1
    page.locator('#modeDisplayBtn').click()

    vibration=json.dumps({'kind':'vibemol.vibrations','version':1,'units':'angstrom',
        'atomCount':3,'atomSymbols':['C','O','H'],'modes':[
            {'frequencyCm1':245,'displacements':[0.1,0,0,-0.1,0,0,0,0,0]},
            {'frequencyCm1':650,'displacements':[0,0.1,0,0,0,0,0,-0.1,0]}]})
    fixtures=[('trajectory',[{'name':'path.xyz','text':p.trajectory_text(3)}]),
        ('vibration',[{'name':'mode.xyz','text':'3\nModes\nC 0 0 0\nO 1.2 0 0\nH -1 0 0\n'},
                      {'name':'mode.vib.json','text':vibration}])]
    for prefix,files in fixtures:
        assert p.load(page,files)['ok']
        if not page.locator('#'+prefix+'Panel').is_visible():
            page.locator('#'+prefix+'PanelBtn').evaluate('el=>el.click()')
        drag(page,page.locator('#'+prefix+'Panel'),dx=-150,dy=30)
        page.locator('#'+prefix+'SaveVideoBtn').click()
        frame=page.locator('#'+prefix+'VideoCropFrame'); before=frame.bounding_box()
        actions=page.locator('#'+prefix+'VideoCropActions'); moved=drag(page,actions,dx=-60,dy=-80)
        assert frame.bounding_box()==before,'Moving recording controls must not change the crop'
        page.locator('#'+prefix+'VideoCropCancelBtn').click()
        assert not actions.is_visible()
        page.locator('#'+prefix+'SaveVideoBtn').click()
        assert actions.bounding_box()==moved
        page.locator('#'+prefix+'VideoCropCancelBtn').click()
    print('[floating] rebuilt arithmetic forms, scene-menu actions, trajectory/frequency panels and independent recording controls: passed',flush=True)


def touch_and_resize(page):
    page.locator('#helpBtn').click()
    modal=page.locator('#helpModal')
    before=modal.bounding_box(); handle=modal.locator('[data-vm-drag-handle]').first.bounding_box()
    x,y=handle['x']+30,handle['y']+18
    cdp=page.context.new_cdp_session(page)
    for kind,px,py in [('touchStart',x,y),('touchMove',x+60,y+30),('touchEnd',0,0)]:
        cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[] if kind=='touchEnd' else [{'x':px,'y':py}]})
    after=modal.bounding_box()
    assert abs(after['x']-before['x']-60)<1 and abs(after['y']-before['y']-30)<1,(before,after)
    page.set_viewport_size({'width':390,'height':640})
    page.wait_for_function('''() => { const b=document.getElementById('helpModal').getBoundingClientRect();
      return b.left>=11&&b.top>=11&&b.right<=innerWidth-11&&b.bottom<=innerHeight-11; }''')
    page.locator('#helpClose').click()
    page.keyboard.press('Shift+Slash')
    assert modal.get_attribute('data-vm-floating-moved')=='true'
    page.screenshot(path=str(p.ARTIFACTS/'floating-help-mobile.png'))
    print('[floating] touch dragging, small viewport bounds and modal reopen: passed',flush=True)


def main():
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True)
        try:
            for run in [live_workflows,live_menus_and_video,touch_and_resize,catalog_contract]:
                context=browser.new_context(viewport={'width':1440,'height':1000},has_touch=True)
                context.add_init_script('('+p.MOLDEN_GRID_OBSERVER+')()')
                page=context.new_page();errors=[];console_errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.on('console',lambda message:console_errors.append(message.text) if message.type=='error' else None)
                page.on('dialog',lambda dialog:dialog.dismiss())
                try:
                    page.goto(url+'?workspaceLab=0&appearanceStudy=1',wait_until='domcontentloaded')
                    page.wait_for_function('() => window.VibeMolAppearanceLooks')
                    run(page)
                    assert not errors,errors
                except Exception:
                    p.write_failure_artifacts(page,p.ARTIFACTS,'floating-'+run.__name__,errors,console_errors)
                    raise
                finally: context.close()
        finally: browser.close()


if __name__=='__main__': main()
