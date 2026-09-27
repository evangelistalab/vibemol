#!/usr/bin/env python3
"""Measurements, recovery context and compact workspace usability regressions."""
import json
import math
import os
import premerge as p


def settle(page):
    page.wait_for_timeout(250)


def snapshot(page):
    return page.evaluate('()=>VibeMolTesting.getMeasurementSnapshot()')


def pick(page, index):
    point = page.evaluate('i=>VibeMolTesting.projectActiveAtomToClient(i)', index)
    assert point['visible'], point
    page.mouse.click(point['x'], point['y']); settle(page)


def assert_labels(page):
    labels = [label for label in snapshot(page)['labels'] if label['visible']]
    assert len(labels) == 3, labels
    for i,a in enumerate(labels):
        assert a['bottom']-a['top'] >= 23, a
        for b in labels[i+1:]:
            assert a['right'] < b['left'] or b['right'] < a['left'] or a['bottom'] < b['top'] or b['bottom'] < a['top'], labels


def measurements(page, url):
    page.goto(url+'?appearanceStudy=1');page.wait_for_function('()=>window.VibeMolWorkbench')
    assert p.load(page,[{'name':'water.xyz','text':'O 0 0 0\nH 1 0 0\nH 0 1 0'}])['ok']
    page.locator('#modeMeasureBtn').click();settle(page)
    panel=page.locator('#measurementsPanel');assert panel.is_visible()
    for index in [0,1,2]:pick(page,index)
    assert len(snapshot(page)['rows']) == 3;assert_labels(page)
    page.locator('#canvas').focus();page.keyboard.press('Escape')
    assert snapshot(page)['atomIndices'] == [] and len(snapshot(page)['rows']) == 3
    panel.locator('[data-action="units"]').click();panel.locator('select').select_option('2')
    assert snapshot(page)['rows'][0]['number'] == '1.89'
    panel.locator('[data-action="copy"]').click()
    text=page.evaluate('()=>navigator.clipboard.readText()');assert '"1.89","Bohr"' in text,text
    with page.expect_download() as download:panel.locator('[data-action="csv"]').click()
    assert download.value.suggested_filename.endswith('.csv')
    assert '"Bohr"' in open(download.value.path()).read()
    panel.get_by_role('button',name='Delete angle 1–2–3',exact=True).click();assert len(snapshot(page)['rows']) == 2
    page.locator('#canvas').focus();page.keyboard.press('Control+z');assert len(snapshot(page)['rows']) == 3
    page.keyboard.press('Control+Shift+z');assert len(snapshot(page)['rows']) == 2
    panel.locator('[data-action="undo"]').click()
    page.locator('#workbenchClearMeasurements').click();assert not snapshot(page)['rows']
    panel.locator('[data-action="undo"]').click();assert len(snapshot(page)['rows']) == 3
    saved=page.evaluate('()=>VibeMolSession.export()')
    assert page.evaluate('data=>VibeMolSession.import(data)',saved)['ok']
    assert len(snapshot(page)['rows']) == 3 and snapshot(page)['rows'][0]['unit'] == 'Bohr'
    page.locator('#modeMeasureBtn').click();settle(page);assert_labels(page)
    # Close choice persists over modes; list is always reachable from Panels.
    page.evaluate('()=>VibeMolWorkbench.close("measurementsPanel")')
    page.locator('#modeEditBtn').click();page.locator('#modeMeasureBtn').click();assert panel.is_hidden()
    page.evaluate('()=>VibeMolWorkbench.open("measurementsPanel")')
    # Camera rotation and higher-resolution render preserve legible separated labels.
    page.locator('#viewAxisZBtn').click();settle(page);assert_labels(page)
    page.screenshot(path=str(p.ARTIFACTS/'measurements-light.png'))
    with page.expect_download() as exported: page.locator('#saveBtn').click()
    exported.value.save_as(p.ARTIFACTS/'measurements-export.png')
    page.set_viewport_size({'width':2200,'height':1500});settle(page);assert_labels(page)
    page.set_viewport_size({'width':390,'height':844});settle(page)
    assert panel.locator('.vm-list-popover__body').evaluate('el=>el.clientHeight') >= 50
    options=panel.locator('.vm-measurement-options')
    assert not options.evaluate('el=>el.open')
    options.locator('summary').click();assert panel.locator('[data-action="units"]').is_visible()
    options.locator('summary').click()
    page.screenshot(path=str(p.ARTIFACTS/'measurements-mobile-list.png'))
    page.set_viewport_size({'width':1512,'height':741});settle(page)
    # Surfaces hide temporarily, actual layer flags and geometry remain intact.
    page.locator('#modeDisplayBtn').click()
    field=p.cube(0).replace('1 -4 -4 -4','2 -4 -4 -4',1).replace('1 1 0 0 0\n','1 1 0 0 0\n1 1 1.4 0 0\n',1)
    assert p.load(page,[{'name':'enclosed.cube','text':field}])['ok']
    page.evaluate('()=>VibeMolPreset.import({kind:"vibemol.preset",presetVersion:1,settings:{"surface.autoIsoEnabled":false,"surface.iso":0.03,"surface.opacity":1}})')
    settle(page);graph=p.snapshot(page);before=page.evaluate('()=>VibeMolTesting.getSurfaceMaterialSnapshot()')
    assert before and all(m['visible'] for m in before)
    pose=page.evaluate('()=>VibeMolTesting.getCameraSnapshot()')
    page.locator('#modeMeasureBtn').click();settle(page)
    assert p.snapshot(page)==graph
    hidden=page.evaluate('()=>VibeMolTesting.getSurfaceMaterialSnapshot()')
    assert [m['geometryId'] for m in before]==[m['geometryId'] for m in hidden]
    assert not any(m['visible'] for m in hidden)
    assert page.evaluate('()=>VibeMolTesting.getCameraSnapshot()') != pose
    panel.locator('[data-surfaces]').check();assert not snapshot(page)['surfacesSuppressed']
    restored_pose=page.evaluate('()=>VibeMolTesting.getCameraSnapshot()')
    for vector in ['camera','target','up']:
        for axis in 'xyz': assert math.isclose(restored_pose[vector][axis],pose[vector][axis],abs_tol=1e-6)
    page.locator('#modeDisplayBtn').click();assert p.snapshot(page)==graph
    assert all(m['visible'] for m in page.evaluate('()=>VibeMolTesting.getSurfaceMaterialSnapshot()'))
    print('[measurements] persistent list, units/CSV/clipboard, undo, label layout, surfaces and camera: passed',flush=True)


def workspace(page):
    page.evaluate('()=>VibeMolWorkbench.preset("analyze")');settle(page)
    r=page.locator('#canvas').bounding_box();assert r['width']*r['height']>1512*741*.5,r
    assert page.locator('#workbenchDockBottom').is_hidden()
    assert page.locator('#coordsPanel').is_visible()
    page.locator('#workbenchArrange').click()
    assert page.locator('#workbenchMenu').get_by_role('button',name='Presentation',exact=True).count()==1
    assert page.locator('#appearancePreferencesSection').is_hidden()
    page.keyboard.press('Escape');page.locator('#workbenchPreferences').click()
    assert page.locator('#appearancePreferencesSection').is_visible()
    page.keyboard.press('Escape')
    for width,height in [(1512,741),(1080,741),(390,844)]:
        page.set_viewport_size({'width':width,'height':height});settle(page)
        canvas=page.locator('#canvas').bounding_box();assert canvas['height']>=200
        assert page.evaluate('()=>document.documentElement.scrollWidth<=innerWidth')
        if width>=760:
            assert page.locator('#toolbar').bounding_box()['width']<width*.25
            for selector in ['.vm-outliner-row__eye','#sceneOutlinerAddBtn','#themeToggleInput']:
                bounds=page.locator(selector).first.bounding_box();assert bounds['width']>=24 and bounds['height']>=24,(selector,bounds)
    page.screenshot(path=str(p.ARTIFACTS/'measurements-compact.png'))
    page.set_viewport_size({'width':1512,'height':741});settle(page)
    # Both text tokens pass AA against all shared light/dark panel backgrounds.
    for theme in ['light','dark']:
        colors=page.evaluate('''theme=>{document.documentElement.dataset.theme=theme;const s=getComputedStyle(document.documentElement);return {
          fg:['--vm-color-text-secondary','--vm-color-text-muted'].map(v=>s.getPropertyValue(v).trim()),
          bg:['--vm-color-surface-base','--vm-color-surface-panel','--vm-color-surface-raised','--vm-color-surface-chip-strong'].map(v=>s.getPropertyValue(v).trim())};}''',theme)
        def luminance(color):
            rgb=[int(color[i:i+2],16)/255 for i in [1,3,5]]
            linear=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb]
            return sum(c*w for c,w in zip(linear,[.2126,.7152,.0722]))
        for fg in colors['fg']:
            for bg in colors['bg']:
                a,b=sorted([luminance(fg),luminance(bg)]);assert (b+.05)/(a+.05)>=4.5,(theme,fg,bg,(b+.05)/(a+.05))
    page.screenshot(path=str(p.ARTIFACTS/'measurements-dark.png'))
    page.evaluate('()=>{Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"));}')
    settle(page);assert page.locator('#fpsValue').inner_text()=='Paused'
    page.evaluate('()=>{delete document.hidden;document.dispatchEvent(new Event("visibilitychange"));}')
    assert page.locator('#fpsValue').inner_text()=='—'
    print('[workspace] Analyze canvas share, responsive rail, hit targets, settings and contrast: passed',flush=True)


def recovery(page,url):
    page.goto(url);page.wait_for_function('()=>window.VibeMolRecovery?.getState().ready')
    assert p.load(page,[{'name':'hidden.xyz','text':'H 0 0 0'}])['ok']
    assert p.load(page,[{'name':'visible.xyz','text':'O 0 0 0\nH 1 0 0\nH 0 1 0'}],clear_first=False)['ok']
    saved=page.evaluate('()=>VibeMolSession.export()');first,second=saved['graph']['scenes'];first['visible']=False
    # Emulate a legacy snapshot whose source and selected scene lagged behind visibility.
    saved['activeSourceId']=first['moleculeSourceId'];saved['graph'].update(activeSceneId=first['id'],focusedSceneId=first['id'],activeLayerId=first['activeLayerId'],selectedLayerIds=[first['activeLayerId']])
    assert page.evaluate('saved=>VibeMolSession.import(saved)',saved)['ok']
    assert p.snapshot(page)['focusedSceneId']==second['id']
    assert page.evaluate('()=>VibeMolStructure.exportActive().volume.atoms.length')==3
    page.evaluate('()=>{VibeMolWorkbench.open("coordsPanel");VibeMolWorkbench.open("inspector");}')
    assert 'visible.xyz' in page.locator('#coordsPanel').inner_text()
    settle(page);before_layout=page.evaluate('()=>VibeMolWorkbench.snapshot()')
    page.evaluate('()=>VibeMolRecovery.flush({force:true})');settle(page)
    # Existing IndexedDB snapshots retain both the old graph context and stale name.
    saved['name']='hidden.xyz'
    page.evaluate('''async saved=>{
      const store=VibeMolSessionRecovery.createRecoveryStore();const {latest}=await store.read();
      await store.write({...latest,name:'hidden.xyz',text:JSON.stringify(saved)},latest.id);
    }''',saved)
    page.reload();page.wait_for_selector('#sessionRecoveryPrompt',state='visible');settle(page)
    assert '2 scenes' in page.locator('#sessionRecoveryMessage').inner_text()
    assert 'visible.xyz' in page.locator('#sessionRecoveryMessage').inner_text()
    assert page.locator('#workbenchDockRight').is_hidden() and page.locator('#workbenchDockBottom').is_hidden()
    assert page.locator('#coordsPanel').is_hidden()
    page.locator('#recoverSessionBtn').click();page.wait_for_selector('#sessionRecoveryPrompt',state='hidden');settle(page)
    assert p.snapshot(page)['focusedSceneId']==second['id']
    assert page.locator('#modeDisplayBtn').get_attribute('aria-checked')=='true'
    assert not page.locator('#autoRot').is_checked()
    assert page.evaluate('()=>VibeMolWorkbench.snapshot().activeRight')==before_layout['activeRight']
    page.evaluate('()=>VibeMolWorkbench.open("coordsPanel")')
    assert page.locator('#coordsPanel').is_visible() and 'visible.xyz' in page.locator('#coordsPanel').inner_text()
    page.screenshot(path=str(p.ARTIFACTS/'measurements-recovery.png'))
    print('[recovery] naming, visible active source, consent before docks and restore policy: passed',flush=True)


def recovery_live_panels(page,url):
    page.goto(url);page.wait_for_function('()=>window.VibeMolRecovery?.getState().ready')
    assert p.load(page,[{'name':'recoverable.xyz','text':'O 0 0 0\nH 1 0 0\nH 0 1 0'}])['ok']
    page.evaluate('()=>VibeMolWorkbench.applyLayout({open:["coordsPanel","inspector"],activeBottom:"coordsPanel",activeRight:"inspector"})')
    page.wait_for_function('()=>JSON.parse(localStorage.getItem("vibemol.workbench.lab.v1")).last.open.includes("coordsPanel")')
    assert page.evaluate('()=>VibeMolRecovery.flush({force:true})')
    original=page.evaluate('async()=> (await VibeMolSessionRecovery.createRecoveryStore().read()).latest')
    page.reload();page.wait_for_selector('#sessionRecoveryPrompt',state='visible');settle(page)
    # Saved windows stay deferred; panels explicitly opened now must still work.
    assert page.locator('#workbenchDockRight').is_hidden() and page.locator('#workbenchDockBottom').is_hidden()
    page.locator('#workbenchPanelsBtn').click()
    page.get_by_role('menuitemcheckbox',name='Properties',exact=True).click();settle(page)
    assert page.locator('#inspector').is_visible() and page.locator('#coordsPanel').is_hidden()
    assert page.locator('#sessionRecoveryPrompt').is_visible()
    page.locator('#workbenchPanelsBtn').click()
    assert page.get_by_role('menuitemcheckbox',name='Properties',exact=True).get_attribute('aria-checked')=='true'
    page.get_by_role('menuitemcheckbox',name='Properties',exact=True).click();settle(page)
    assert page.locator('#workbenchDockRight').is_hidden()
    # Reproduce the reported case: load new work without resolving recovery.
    assert p.load(page,[{'name':'current.xyz','text':'C 0 0 0\nO 0 0 1.2\nH 0 1 -1\nH 0 -1 -1'}])['ok']
    page.locator('#modeCalculationsBtn').click();page.evaluate('()=>VibeMolCalculations.ready()');settle(page)
    assert page.locator('#subspacePanel').is_visible() and page.locator('#workbenchDockRight').is_visible()
    assert page.locator('#workbenchSubspace').get_attribute('aria-expanded')=='true'
    page.locator('#workbenchPanelsBtn').click()
    subspace=page.get_by_role('menuitemcheckbox',name='Subspace',exact=True)
    assert subspace.get_attribute('aria-checked')=='true' and 'Right' in subspace.inner_text()
    subspace.click();settle(page)
    assert page.locator('#subspacePanel').is_hidden()
    page.locator('#workbenchSubspace').click();settle(page)
    assert page.locator('#subspacePanel').is_visible()
    page.evaluate('()=>VibeMolCalculations.toggleAtom(0)');settle(page)
    assert page.locator('#calculationOrbitalsPopup').is_visible()
    assert page.evaluate('()=>VibeMolCalculations.state().selectedAtomIds.length')==1
    assert page.evaluate('()=>VibeMolCalculations.export().specs')==[]
    page.screenshot(path=str(p.ARTIFACTS/'calculations-pending-recovery.png'))
    # The recovery choice and scientific snapshot are unaffected by panel actions.
    assert page.evaluate('()=>VibeMolRecovery.getState().pending')
    assert not page.evaluate('()=>VibeMolRecovery.flush({force:true})')
    assert page.evaluate('async()=> (await VibeMolSessionRecovery.createRecoveryStore().read()).latest')==original
    page.set_viewport_size({'width':850,'height':850});settle(page)
    assert page.locator('#workbenchDockBottom').is_visible() and page.locator('#subspacePanel').is_visible()
    page.locator('#recoverSessionBtn').click();page.wait_for_selector('#sessionRecoveryPrompt',state='hidden');settle(page)
    assert page.locator('#modeDisplayBtn').get_attribute('aria-checked')=='true'
    assert page.evaluate('()=>VibeMolStructure.exportActive().volume.atoms.length')==3
    assert page.locator('#coordsPanel').is_visible() or page.locator('#inspector').is_visible()
    print('[recovery] manual panels, Calculations dock/checkmarks, compact layout and preserved recovery snapshot: passed',flush=True)


def main():
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle='+os.environ.get('VIBEMOL_TEST_ANGLE','swiftshader')])
        context=browser.new_context(viewport={'width':1512,'height':850},permissions=['clipboard-read','clipboard-write'])
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.dismiss())
        try:
            measurements(page,url);workspace(page);recovery(page,url);assert not errors,errors
            context=browser.new_context(viewport={'width':1512,'height':850})
            page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.dismiss())
            recovery_live_panels(page,url);assert not errors,errors
        except Exception:
            p.write_failure_artifacts(page,p.ARTIFACTS,'measurements-failure',errors,[]);raise
        finally:browser.close()
if __name__=='__main__':main()
