#!/usr/bin/env python3
"""Native appearance components, fast material edits, and portable looks."""
from __future__ import annotations
import json
import math
from pathlib import Path
import premerge as p


def state(page):
    return page.evaluate('() => VibeMolAppearanceLooks.snapshot()')


def rendering(page):
    return state(page)['settings']['appearance.rendering']


def editor(page):
    if page.locator('#displayInspectorBtn').get_attribute('aria-expanded') != 'true':
        page.locator('#displayInspectorBtn').click()


def target(page, value):
    editor(page)
    page.locator(f'#appearanceMaterialTarget [data-target="{value}"]').click()


def value(page, control, number):
    p.set_surface_control(page, '#' + control, number)


def camera_equal(before, after):
    assert before['mode'] == after['mode']
    for vector in ['camera', 'target', 'up']:
        assert all(math.isclose(before[vector][axis], after[vector][axis], abs_tol=1e-8) for axis in ['x','y','z'])


def components_and_saving(page, context, url):
    assert p.load(page,[{'name':'pyridine.xyz','text':(p.ROOT/'assets/fragments/pyridine.xyz').read_text()}])['ok']
    molecule = page.evaluate('() => VibeMolStructure.exportActive().volume')
    camera = page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
    editor(page)
    assert page.locator('#appearanceMoleculeStyleGroup button').all_text_contents() == ['Basic','Toon','Kit']
    assert page.locator('.vm-look-card').count() == 0
    for style, expected in [('basic','MeshPhysicalMaterial'),('toon','MeshToonMaterial'),('kit','MeshPhongMaterial')]:
        page.locator(f'#appearanceMoleculeStyleGroup [data-value="{style}"]').click()
        assert state(page)['activeLook']['id'] == style
        assert page.locator('#lookModified').inner_text() == ''
        assert all(mat['type']==expected for mat in page.evaluate('() => VibeMolTesting.getLookMaterialSnapshot()'))
        assert page.evaluate('() => VibeMolStructure.exportActive().volume.atoms') == molecule['atoms']
        assert page.evaluate('() => VibeMolStructure.exportActive().volume.bonds') == molecule['bonds']
        camera_equal(camera,page.evaluate('() => VibeMolTesting.getCameraSnapshot()'))
    geometry = rendering(page)['geometry']; lighting = rendering(page)['lighting']; palette = rendering(page)['coloring']
    target(page,'atoms'); page.locator('#appearanceMaterialModel').select_option('toon')
    assert rendering(page)['geometry'] == geometry and rendering(page)['lighting'] == lighting and rendering(page)['coloring'] == palette
    assert rendering(page)['materials']['bonds']['model'] == 'phong'
    assert all(bond['connectorStyle'].startswith('kit') for bond in page.evaluate('() => VibeMolTesting.getBondCarrierSnapshots()'))
    target(page,'bonds'); page.locator('#appearanceLinkBonds').check()
    assert page.locator('#appearanceMaterialModel').is_disabled()
    page.locator('#appearanceLinkBonds').uncheck()
    assert rendering(page)['materials']['bonds']['model'] == 'toon'
    page.locator('#appearanceMaterialModel').select_option('physical')
    value(page,'appearanceMaterialRoughness',0.67)
    assert rendering(page)['materials']['atoms']['model'] == 'toon'
    assert rendering(page)['materials']['bonds']['roughness'] == 0.67
    assert all(mat['type']=='MeshPhysicalMaterial' and mat['roughness']==0.67 for mat in page.evaluate('() => VibeMolTesting.getLookMaterialSnapshot("bonds")'))
    page.locator('#lookRevert').click()
    assert rendering(page)['materials']['atoms']['model'] == 'phong'
    # Native slider: one undo step for the whole drag, including its final change.
    target(page,'atoms'); page.locator('#appearanceMaterialModel').select_option('physical')
    original=rendering(page)['materials']['atoms']['roughness']
    page.locator('#appearanceMaterialRoughnessRange').evaluate("el => { for (const value of [550,620,740]) { el.value=value; el.dispatchEvent(new Event('input',{bubbles:true})); } el.dispatchEvent(new Event('change',{bubbles:true})); }")
    assert rendering(page)['materials']['atoms']['roughness'] == 0.74
    page.locator('#lookUndo').click()
    assert rendering(page)['materials']['atoms']['roughness'] == original
    page.locator('#appearanceMaterialRoughness').fill('0.58');page.locator('#appearanceMaterialRoughness').press('Enter')
    assert rendering(page)['materials']['atoms']['roughness']==0.58
    page.locator('#lookUndo').click()
    assert rendering(page)['materials']['atoms']['roughness']==original
    value(page,'appearanceMaterialRoughness',0.62)
    page.locator('#lookSave').click(); page.locator('#lookNameInput').fill('My figures');page.locator('#lookNameInput').press('Enter')
    assert len(state(page)['saved']) == 1 and page.locator('#lookModified').inner_text() == ''
    saved=state(page)['settings']
    page.locator('#lookSaveDetails > summary').click();page.locator('#lookDefault').click()
    page.locator('#appearanceMoleculeStyleGroup [data-value="basic"]').click()
    second=context.new_page();second.goto(url);second.wait_for_function('() => window.VibeMolAppearanceLooks')
    assert state(second)['settings'] == saved
    second.close()
    page.locator('#lookSaved').select_option(state(page)['saved'][0]['id'])
    with page.expect_download() as download: page.locator('#lookExport').click()
    exported=json.loads(Path(download.value.path()).read_text())
    assert exported['meta']['lookVersion']==2 and 'surface.iso' not in exported['settings']
    fresh=context.browser.new_context();other=fresh.new_page();other.goto(url);other.wait_for_function('() => window.VibeMolAppearanceLooks')
    other.locator('#lookFileInput').set_input_files({'name':'my.look.json','mimeType':'application/json','buffer':json.dumps(exported).encode()})
    other.wait_for_function('() => VibeMolAppearanceLooks.snapshot().saved.length===1')
    assert state(other)['settings']==saved
    bad=json.loads(json.dumps(exported));bad['settings']['appearance.rendering']['materials']['atoms']['roughness']=-1
    before=state(other)
    other.locator('#lookFileInput').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(bad).encode()})
    other.wait_for_function('() => document.querySelector("#lookStatus").textContent.includes("Invalid look setting")')
    assert state(other)==before
    fresh.close()
    # Reusable materials keep per-element accents and never carry geometry/light.
    target(page,'atoms');page.locator('#materialLibraryFields').locator('..').locator('summary').click()
    page.locator('#materialName').fill('Soft highlight');page.locator('#saveMaterial').click()
    swatch=page.evaluate('() => JSON.parse(localStorage.getItem("vibemol.materials.v1"))[0]')
    assert swatch['material']==rendering(page)['materials']['atoms']
    with page.expect_download() as download:page.locator('#exportMaterial').click()
    material_file=json.loads(Path(download.value.path()).read_text())
    assert set(material_file)=={'kind','version','name','material'}
    page.locator('#appearanceMaterialPreset').select_option('matte');page.locator('#appearanceMaterialPreset').select_option(swatch['id'])
    assert rendering(page)['materials']['atoms']==swatch['material']
    page.locator('#lookClearDefault').click();value(page,'appearanceMaterialRoughness',0.44)
    page.wait_for_function('() => JSON.parse(localStorage.getItem("vibemol.autosavePreset")).settings["appearance.rendering"].materials.atoms.roughness===0.44')
    page.reload();page.wait_for_function('() => window.VibeMolAppearanceLooks')
    assert rendering(page)['materials']['atoms']['roughness']==0.44
    assert state(page)['saved'][0]['settings']==saved
    editor(page);page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert page.locator('#appearanceMaterialModel').evaluate('el => el.classList.contains("vm-select")')
    print('[looks] native components, independence, linked bonds, undo, libraries, import/export, defaults, reload: passed',flush=True)


def surfaces_and_sessions(page,context,url):
    assert p.load(page,[{'name':'orbitals.molden','text':p.MOLDEN}])['ok']
    before=p.cubes(page);editor(page)
    page.locator('#appearanceMoleculeStyleGroup [data-value="toon"]').click();target(page,'surfaces')
    page.locator('#appearanceMaterialPreset').select_option('enamel')
    assert all(layer['material']['roughness']==0.28 for layer in p.cubes(page))
    assert page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot().length')==0
    assert [layer['visible'] for layer in p.cubes(page)] == [layer['visible'] for layer in before]
    page.locator(f'.vm-outliner-row[data-id="{before[1]["id"]}"]').click()
    page.locator('#lookFinishScope').select_option('selected');value(page,'appearanceMaterialRoughness',0.72)
    assert [layer['material']['roughness'] for layer in p.cubes(page)]==[0.28,0.72,0.28]
    for old,layer in zip(before,p.cubes(page)):
        for key in ['id','iso','isoPending','autoIso']:assert old[key]==layer[key], (key,old,layer)
    page.locator('#lookFinishScope').select_option('group')
    assert page.locator('#appearanceMaterialRoughness').input_value()==''
    value(page,'appearanceMaterialHighlight',1.4)
    assert [layer['material']['roughness'] for layer in p.cubes(page)]==[0.28,0.72,0.28]
    assert all(layer['material']['specularIntensity']==1.4 for layer in p.cubes(page))
    saved=page.evaluate('async () => VibeMolSession.export()');exact=state(page)
    fresh=context.browser.new_context();other=fresh.new_page();other.goto(url);other.wait_for_function('() => window.VibeMolAppearanceLooks')
    assert other.evaluate('async saved => VibeMolSession.import(saved)',saved)['ok']
    assert state(other)['settings']==exact['settings'] and p.cubes(other)==p.cubes(page)
    fresh.close()
    assert p.load(page,[{'name':'orbital.cube','text':p.hydrogen_2p_cube()}])['ok']
    target(page,'surfaces');page.locator('#appearanceMaterialPreset').select_option('enamel')
    initial=page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()');assert len(initial)==2
    ids=[item['geometryId'] for item in initial];camera=page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
    value(page,'appearanceMaterialRoughness',0.43)
    assert all(mat['roughness']==0.43 for mat in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()'))
    page.locator('#appearanceMaterialModel').select_option('toon')
    page.locator('#appearanceLightingSection > summary').click();value(page,'appearanceLightdirIntensity',2.4)
    page.evaluate('() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    pixels=page.locator('canvas').first.evaluate('el=>el.toDataURL()')
    value(page,'appearanceLightexposure',0.6)
    page.evaluate('() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    assert page.locator('canvas').first.evaluate('el=>el.toDataURL()')!=pixels, 'Exposure must affect the rendered image'
    value(page,'appearanceLightexposure',1)
    page.locator('#appearanceGeometrySection > summary').click();page.locator('#appearanceConnector').select_option('kit')
    assert [item['geometryId'] for item in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')]==ids
    camera_equal(camera,page.evaluate('() => VibeMolTesting.getCameraSnapshot()'))
    page.locator('#appearanceMaterialModel').select_option('physical');value(page,'appearanceMaterialOpacity',0.65)
    assert all(mat['opacity']==0.65 for mat in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()'))
    p.redraw(page)
    assert all(mat['roughness']==0.43 for mat in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()'))
    before=state(page)
    error=page.evaluate('''() => {
      const preset=VibeMolPreset.export();preset.settings['global.backgroundColor']='#123456';
      preset.settings['appearance.rendering'].materials.atoms.roughness=-1;
      try { VibeMolPreset.import(preset,{mode:'strict'}); return ''; } catch(error) { return error.message; }
    }''')
    assert 'Invalid material roughness' in error and state(page)==before
    print('[looks] deferred and mixed orbitals, property-only edits, unchanged geometry, opacity, session round-trip: passed',flush=True)


def main():
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True)
        try:
            for run in [components_and_saving,surfaces_and_sessions]:
                context=browser.new_context(viewport={'width':1200,'height':1000},device_scale_factor=1)
                page=context.new_page();errors=[];console_errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.on('console',lambda message:console_errors.append(message.text) if message.type=='error' else None)
                page.on('dialog',lambda dialog:dialog.dismiss())
                try:
                    page.goto(url);page.wait_for_function('() => window.VibeMolAppearanceLooks');run(page,context,url)
                    assert not errors,errors
                except Exception:
                    p.write_failure_artifacts(page,p.ARTIFACTS,'looks-'+run.__name__,errors,console_errors);raise
                finally:context.close()
        finally:browser.close()


if __name__=='__main__':main()
