#!/usr/bin/env python3
"""Shared appearance edits, camera isolation, and orbital default/override scopes."""
import json
import looks as l
import premerge as p


def change(page, control, value, event='change'):
    page.locator('#'+control).evaluate('''(el, data) => {
      if (el.type==='checkbox') el.checked=data.value; else el.value=data.value;
      el.dispatchEvent(new Event(data.event,{bubbles:true}));
    }''', {'value':value,'event':event})


def focus_settings(page):
    return page.evaluate('''() => Object.fromEntries(Object.entries(VibeMolPreset.export().settings)
      .filter(([key])=>key.startsWith('render.dof.')))''')


def layer_styles(page):
    keys=['id','parentId','opacity','colorScheme','posColor','negColor','styleOverrides','iso','autoIso','isoPending','visible','renderMode','signFlip']
    return [{key:layer[key] for key in keys} for layer in p.cubes(page)]


def shared_controls(page, context, url):
    assert p.load(page,[{'name':'pyridine.xyz','text':(p.ROOT/'assets/fragments/pyridine.xyz').read_text()}])['ok']
    l.editor(page,material=False)
    for section in ['appearanceColorsSection','appearanceLightingSection']:
        page.locator('#'+section).evaluate('el=>el.open=true')
    for control,mirror,key,value in [
        ('studioPalette','appearancePalette',None,'kit'),
        ('appearancePalette','studioPalette',None,'toon'),
        ('studioBondColorMode','appearanceBondColorMode',None,'uniform'),
        ('appearanceBondColor','studioBondColor',None,'#3579bd'),
        ('studioElementColors','visibilityElementColorsToggle','global.elementColors',False),
        ('visibilityElementColorsToggle','studioElementColors','global.elementColors',False),
        ('studioShadows','moleculeShadowsToggle','molecule.feature.shadows',False),
        ('moleculeShadowsToggle','studioShadows','molecule.feature.shadows',False),
        ('studioFog','moleculeFogToggle','molecule.feature.fog',True),
        ('moleculeFogToggle','studioFog','molecule.feature.fog',True),
    ]:
        before=l.state(page)['settings']
        change(page,control,value)
        actual=page.locator('#'+mirror).evaluate('el=>el.type==="checkbox"?el.checked:el.value')
        assert actual==value,(control,actual)
        if key: assert l.state(page)['settings'][key]==value
        assert l.state(page)['settings']!=before
        page.locator('#lookUndo').click();assert l.state(page)['settings']==before
    change(page,'studioFog',True)
    for control,mirror in [('studioFogDepth','moleculeFogDepth'),('moleculeFogDepth','studioFogDepth'),('moleculeAtomRadiusScale',None),('moleculeBondRadiusScale',None)]:
        before=l.state(page)['settings']
        values=[14,20,23] if mirror else [1,1.12,1.25]
        for value in values: change(page,control,value,'input')
        change(page,control,values[-1])
        if mirror: assert float(page.locator('#'+mirror).input_value())==23
        page.locator('#lookUndo').click();assert l.state(page)['settings']==before
    before=l.state(page)['settings']
    page.locator('#studioElementColorEdit').click()
    assert page.locator('#elementColorOverlay').is_visible()
    change(page,'elementColorPicker','#2468ab','input');change(page,'elementColorPicker','#3579bd')
    assert l.state(page)['settings']['global.elementColorOverrides']!=before['global.elementColorOverrides']
    page.locator('#elementColorClose').click();page.locator('#lookUndo').click()
    assert l.state(page)['settings']==before
    page.locator('#appearanceGeometrySection').evaluate('el=>el.open=false')
    page.screenshot(path=str(p.ARTIFACTS/'appearance-shared-controls.png'))
    print('[scopes] shared palettes, bond colors, element colors, shadows/fog, radius/fog drags and Undo: passed',flush=True)


def camera_scope(page, context, url):
    assert p.load(page,[{'name':'pyridine.xyz','text':(p.ROOT/'assets/fragments/pyridine.xyz').read_text()}])['ok']
    l.editor(page,material=False)
    for control,value in [('dofToggle',True),('dofFocusMode','manual'),('dofFocusDistance',12.5),('dofFocusRange',2.2),('dofBlurAmount',6)]:
        before=focus_settings(page)
        change(page,control,value)
        changed=focus_settings(page)
        assert changed!=before
        page.locator('#lookUndo').click();assert focus_settings(page)==before
        change(page,control,value)
    focus=focus_settings(page);camera=page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
    for preset in ['basic','classic','ink','kit','opal','porcelain','toon']:
        page.locator('#lookPreset').select_option(preset)
        assert focus_settings(page)==focus
        assert not any(key.startswith('render.dof.') for key in l.state(page)['settings'])
        assert l.pristine(page)
        l.camera_equal(camera,page.evaluate('() => VibeMolTesting.getCameraSnapshot()'))
    legacy=page.evaluate('() => VibeMolLooks.exportLook(VibeMolLooks.builtins[0])')
    legacy['meta']['lookVersion']=3
    for settings in [legacy['settings'],legacy['settings']['appearance.look']['settings']]:
        settings.update({'render.dof.enabled':False,'render.dof.focusDistance':8})
    assert page.evaluate('value=>VibeMolPreset.import(value,{mode:"strict"})',legacy)['ok']
    assert focus_settings(page)==focus
    assert p.load(page,[{'name':'legacy.look.json','text':json.dumps(legacy)}],clear_first=False)['ok']
    assert focus_settings(page)==focus
    session=page.evaluate('() => VibeMolSession.export()')
    change(page,'dofFocusDistance',9)
    assert l.pristine(page)
    page.locator('#lookUndo').click();assert focus_settings(page)==focus
    fresh=context.new_page();fresh.goto(url+'?workspaceLab=0');fresh.wait_for_function('() => window.VibeMolSession')
    assert fresh.evaluate('value=>VibeMolSession.import(value)',session)['ok']
    assert focus_settings(fresh)==focus
    fresh.close()
    print('[scopes] focus/blur Undo, every preset, legacy look API/drop imports and fresh-session camera restoration: passed',flush=True)


def orbital_scope(page, context, url):
    assert p.load(page,[{'name':'a.cube','text':p.cube(-1)},{'name':'b.cube','text':p.cube(1)}])['ok']
    l.editor(page,material=False)
    page.locator('#lookPreset').select_option('classic')
    defaults=l.state(page)['settings'];a,b=p.cubes(page)
    page.locator(f'.vm-outliner-row[data-id="{a["id"]}"]').click()
    change(page,'opacity',0.42);change(page,'posColor','#abcdef')
    assert l.state(page)['settings']==defaults
    assert p.cubes(page)[0]['styleOverrides']=={'colors':True,'opacity':True}
    page.locator(f'.vm-outliner-row[data-id="{b["id"]}"]').click()
    change(page,'opacity',1)  # Deliberate override even when equal to the default.
    protected=layer_styles(page)
    ids=[entry['geometryId'] for entry in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')]
    page.locator('#lookPreset').select_option('opal')
    after=layer_styles(page)
    for old,new in zip(protected,after):
        for key in ['iso','autoIso','isoPending','visible','renderMode','signFlip']: assert new[key]==old[key]
    assert after[0]['posColor']=='#abcdef' and after[0]['opacity']==0.42
    assert after[1]['posColor']==l.state(page)['settings']['surface.posColor']
    assert [entry['geometryId'] for entry in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')]==ids
    page.locator('#appearanceSurfaceDefaultsSection').evaluate('el=>el.open=true')
    change(page,'studioSurfaceOpacity',0.65)
    assert [layer['opacity'] for layer in p.cubes(page)]==[0.42,1]
    assert p.load(page,[{'name':'c.cube','text':p.cube(2)}],clear_first=False)['ok']
    assert p.cubes(page)[2]['opacity']==0.65 and p.cubes(page)[2]['styleOverrides']=={'colors':False,'opacity':False}
    page.locator(f'.vm-outliner-row[data-id="{a["id"]}"]').click()
    change(page,'studioSurfaceScheme','bright')
    assert p.cubes(page)[0]['posColor']=='#abcdef'
    assert p.cubes(page)[1]['colorScheme']==p.cubes(page)[2]['colorScheme']=='bright'
    page.locator('#lookSave').click();page.locator('#lookNameInput').fill('Global orbital defaults');page.locator('#lookNameInput').press('Enter')
    saved=l.state(page)['saved'][0]['settings']
    assert saved['surface.opacity']==0.65 and saved['surface.colorScheme']=='bright'
    assert saved['surface.posColor']!='#abcdef' and l.pristine(page)
    before=layer_styles(page)
    page.locator('#studioResetSurfaceOverrides').click()
    assert all(layer['styleOverrides']=={'colors':False,'opacity':False} and layer['opacity']==0.65 for layer in p.cubes(page))
    page.locator('#lookUndo').click();assert layer_styles(page)==before
    page.locator('#surfaceUseStyleColors').click()
    assert p.cubes(page)[0]['colorScheme']=='bright' and p.cubes(page)[0]['opacity']==0.42
    page.locator('#lookUndo').click();assert layer_styles(page)==before
    session=page.evaluate('() => VibeMolSession.export()')
    assert page.evaluate('value=>VibeMolSession.import(value)',session)['ok']
    assert layer_styles(page)==before
    # Sessions predating override metadata retain differing local styles.
    for scene in session['graph']['scenes']:
        for layer in scene['layers']: layer.pop('styleOverrides',None)
    assert page.evaluate('value=>VibeMolSession.import(value)',session)['ok']
    assert layer_styles(page)==before
    page.screenshot(path=str(p.ARTIFACTS/'appearance-surface-defaults.png'))
    assert p.load(page,[{'name':'orbitals.molden','text':p.MOLDEN}])['ok']
    orbitals=p.cubes(page)
    page.locator(f'.vm-outliner-row[data-id="{orbitals[0]["parentId"]}"]').click()
    change(page,'opacity',0.28)
    page.locator('#lookPreset').select_option('porcelain')
    assert all(layer['opacity']==0.28 and not layer['visible'] for layer in p.cubes(page))
    page.locator('#surfaceUseStyleOpacity').click()
    assert all(layer['opacity']==1 and layer['styleOverrides']=={'colors':False,'opacity':False} for layer in p.cubes(page))
    assert page.evaluate('() => window.__moldenGridBuilds')==[]
    print('[scopes] global surface defaults, explicit overrides, existing/future layers, reset/Undo, saved looks, legacy sessions and deferred groups: passed',flush=True)


def main():
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True)
        try:
            for run in [shared_controls,camera_scope,orbital_scope]:
                context=browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1)
                context.add_init_script('('+p.MOLDEN_GRID_OBSERVER+')()')
                page=context.new_page();errors=[];console_errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.on('console',lambda message:console_errors.append(message.text) if message.type=='error' else None)
                page.on('dialog',lambda dialog:dialog.dismiss())
                try:
                    page.goto(url+'?workspaceLab=0');page.wait_for_function('() => window.VibeMolAppearanceLooks')
                    run(page,context,url);assert not errors,errors
                except Exception:
                    p.write_failure_artifacts(page,p.ARTIFACTS,'scopes-'+run.__name__,errors,console_errors);raise
                finally:context.close()
        finally:browser.close()


if __name__=='__main__':main()
