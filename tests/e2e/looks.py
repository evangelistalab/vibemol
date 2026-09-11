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


def editor(page, material=True):
    if page.locator('#displayInspectorBtn').get_attribute('aria-expanded') != 'true':
        page.locator('#displayInspectorBtn').click()
    if material and not page.locator('#appearanceMaterialsSection').evaluate('el => el.open'):
        page.locator('#appearanceMaterialsSection > summary').click()


def value(page, control, number):
    p.set_surface_control(page, '#' + control, number)


def camera_equal(before, after):
    assert before['mode'] == after['mode']
    for vector in ['camera', 'target', 'up']:
        assert all(math.isclose(before[vector][axis], after[vector][axis], abs_tol=1e-8) for axis in ['x','y','z'])


def components_and_saving(page, context, url):
    assert p.load(page,[{'name':'pyridine.xyz','text':(p.ROOT/'assets/fragments/pyridine.xyz').read_text()}])['ok']
    molecule=page.evaluate('() => VibeMolStructure.exportActive().volume')
    camera=page.evaluate('() => VibeMolTesting.getCameraSnapshot()');editor(page,material=False)
    assert not page.locator('#appearanceMaterialsSection').evaluate('el => el.open')
    assert not page.locator('#appearanceMaterialPreset').is_visible()
    assert page.locator('#moleculeInkToggle, #moleculeBlackbodyToggle, #blackbodyColdColor, #blackbodyHotColor').count()==0
    assert page.get_by_text('More material settings',exact=True).count()==0
    summary=page.locator('#appearanceMaterialsSection > summary')
    summary.focus();summary.press('Enter')
    assert page.locator('#appearanceMaterialPreset').is_visible()
    assert page.locator('#appearanceMaterialMetalness').evaluate('el => el.closest("details").id')=='appearanceMaterialsSection'
    # Retired flags cannot change rendering or reappear in new presets, even in strict imports.
    retired={'molecule.feature.ink':True,'molecule.feature.blackbody.enabled':True,
             'molecule.feature.blackbody.coldColor':'#ff0000','molecule.feature.blackbody.hotColor':'#0000ff'}
    page.wait_for_function('() => VibeMolTesting.getLookLightingSnapshot().environment')
    original_materials=page.evaluate('() => VibeMolTesting.getLookMaterialSnapshot()')
    original_lights=page.evaluate('() => VibeMolTesting.getLookLightingSnapshot()')
    result=page.evaluate('settings => VibeMolPreset.import({kind:"vibemol.preset",presetVersion:1,settings},{mode:"strict"})',retired)
    assert result['ok'],result
    assert page.evaluate('() => VibeMolTesting.getLookMaterialSnapshot()')==original_materials
    assert page.evaluate('() => VibeMolTesting.getLookLightingSnapshot()')==original_lights
    assert not set(retired).intersection(page.evaluate('() => VibeMolPreset.listKeys()'))
    assert not set(retired).intersection(page.evaluate('() => Object.keys(VibeMolPreset.export().settings)'))
    assert page.locator('#lookPreset option').all_text_contents()[1:]==['Basic','Toon','Kit','Classic','Porcelain','Ink','Opal']
    assert page.locator('#appearanceMaterialTarget, #appearanceMaterialModel, #appearanceLinkBonds, #lookFinishScope').count()==0
    assert not page.locator('#rowSurfaceMaterialPreset').is_visible()
    for style,expected in [('basic','MeshPhysicalMaterial'),('toon','MeshToonMaterial'),('kit','MeshPhongMaterial'),
                           ('classic','MeshPhongMaterial'),('porcelain','MeshPhysicalMaterial'),('ink','MeshToonMaterial'),('opal','MeshPhysicalMaterial')]:
        page.locator('#lookPreset').select_option(style)
        assert state(page)['activeLook']['id']==style and page.locator('#lookModified').inner_text()==''
        for slot in ['atoms','bonds']:
            mats=page.evaluate('slot => VibeMolTesting.getLookMaterialSnapshot(slot)',slot)
            assert mats and all(mat['type']==expected for mat in mats)
        assert page.evaluate('() => VibeMolStructure.exportActive().volume.atoms')==molecule['atoms']
        assert page.evaluate('() => VibeMolStructure.exportActive().volume.bonds')==molecule['bonds']
        camera_equal(camera,page.evaluate('() => VibeMolTesting.getCameraSnapshot()'))
        lights=page.evaluate('() => VibeMolTesting.getLookLightingSnapshot()');recipe=rendering(page)
        assert lights['key']['intensity']==recipe['lighting']['dirIntensity'] and lights['rim']['position']==recipe['lighting']['rimPos']
        assert lights['toneMapping']==page.evaluate('mode=>mode==="aces"?THREE.ACESFilmicToneMapping:THREE.NoToneMapping',recipe['lighting']['toneMapping'])
        if style=='opal':
            page.wait_for_function('() => VibeMolTesting.getLookLightingSnapshot().environment')
            assert all(mat['envMapIntensity']==1 and mat['iridescence']==0.7 for mat in page.evaluate('() => VibeMolTesting.getLookMaterialSnapshot()'))
    page.locator('#lookPreset').select_option('kit')
    geometry=rendering(page)['geometry'];lighting=rendering(page)['lighting'];palette=rendering(page)['coloring']
    page.locator('#appearanceMaterialPreset').select_option('toon')
    assert rendering(page)['geometry']==geometry and rendering(page)['lighting']==lighting and rendering(page)['coloring']==palette
    assert all(bond['connectorStyle'].startswith('kit') for bond in page.evaluate('() => VibeMolTesting.getBondCarrierSnapshots()'))
    for slot in ['atoms','bonds']:
        assert all(mat['type']=='MeshToonMaterial' for mat in page.evaluate('slot => VibeMolTesting.getLookMaterialSnapshot(slot)',slot))
    page.locator('#appearanceMaterialPreset').select_option('polished');value(page,'appearanceMaterialRoughness',0.67)
    for slot in ['atoms','bonds']:
        assert all(mat['roughness']==0.67 for mat in page.evaluate('slot => VibeMolTesting.getLookMaterialSnapshot(slot)',slot))
    page.locator('#lookRevert').click();assert rendering(page)['material']['model']=='phong'
    # Native slider: one undo step for the whole drag, including its final change.
    editor(page); page.locator('#appearanceMaterialPreset').select_option('polished')
    original=rendering(page)['material']['roughness']
    page.locator('#appearanceMaterialRoughnessRange').evaluate("el => { for (const value of [550,620,740]) { el.value=value; el.dispatchEvent(new Event('input',{bubbles:true})); } el.dispatchEvent(new Event('change',{bubbles:true})); }")
    assert rendering(page)['material']['roughness'] == 0.74
    page.locator('#lookUndo').click()
    assert rendering(page)['material']['roughness'] == original
    page.locator('#appearanceMaterialRoughness').fill('0.58');page.locator('#appearanceMaterialRoughness').press('Enter')
    assert rendering(page)['material']['roughness']==0.58
    page.locator('#lookUndo').click()
    assert rendering(page)['material']['roughness']==original
    value(page,'appearanceMaterialRoughness',0.62)
    page.locator('#lookSave').click(); page.locator('#lookNameInput').fill('My figures');page.locator('#lookNameInput').press('Enter')
    assert len(state(page)['saved']) == 1 and page.locator('#lookModified').inner_text() == ''
    saved=state(page)['settings']
    page.locator('#lookSaveDetails > summary').click();page.locator('#lookDefault').click()
    page.locator('#lookPreset').select_option('basic')
    second=context.new_page();second.goto(url);second.wait_for_function('() => window.VibeMolAppearanceLooks')
    assert state(second)['settings'] == saved
    second.close()
    page.locator('#lookSaved').select_option(state(page)['saved'][0]['id'])
    with page.expect_download() as download: page.locator('#lookExport').click()
    exported=json.loads(Path(download.value.path()).read_text())
    assert exported['meta']['lookVersion']==3 and 'surface.iso' not in exported['settings']
    fresh=context.browser.new_context();other=fresh.new_page();other.goto(url);other.wait_for_function('() => window.VibeMolAppearanceLooks')
    other.locator('#lookFileInput').set_input_files({'name':'my.look.json','mimeType':'application/json','buffer':json.dumps(exported).encode()})
    other.wait_for_function('() => VibeMolAppearanceLooks.snapshot().saved.length===1')
    assert state(other)['settings']==saved
    bad=json.loads(json.dumps(exported));bad['settings']['appearance.rendering']['material']['roughness']=-1
    before=state(other)
    other.locator('#lookFileInput').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(bad).encode()})
    other.wait_for_function('() => document.querySelector("#lookStatus").textContent.includes("Invalid look setting")')
    assert state(other)==before
    fresh.close()
    # Reusable materials apply globally and never carry geometry or lighting.
    editor(page);page.locator('#materialLibraryFields').locator('..').locator('summary').click()
    page.locator('#materialName').fill('Soft highlight');page.locator('#saveMaterial').click()
    swatch=page.evaluate('() => JSON.parse(localStorage.getItem("vibemol.materials.v1"))[0]')
    assert swatch['material']==rendering(page)['material']
    with page.expect_download() as download:page.locator('#exportMaterial').click()
    material_file=json.loads(Path(download.value.path()).read_text())
    assert set(material_file)=={'kind','version','name','material'}
    page.locator('#appearanceMaterialPreset').select_option('matte');page.locator('#appearanceMaterialPreset').select_option(swatch['id'])
    assert rendering(page)['material']==swatch['material']
    page.locator('#lookClearDefault').click();value(page,'appearanceMaterialRoughness',0.44)
    page.wait_for_function('() => JSON.parse(localStorage.getItem("vibemol.autosavePreset")).settings["appearance.rendering"].material.roughness===0.44')
    page.reload();page.wait_for_function('() => window.VibeMolAppearanceLooks')
    assert not page.locator('#appearanceMaterialsSection').evaluate('el => el.open')
    assert rendering(page)['material']['roughness']==0.44
    assert state(page)['saved'][0]['settings']==saved
    editor(page);page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert page.locator('#appearanceMaterialPreset').evaluate('el => el.classList.contains("vm-select")')
    print('[looks] seven presets, shared material, studio lighting, undo, libraries, import/export, defaults, reload: passed',flush=True)


def surfaces_and_sessions(page,context,url):
    assert p.load(page,[{'name':'orbitals.molden','text':p.MOLDEN}])['ok']
    before=p.cubes(page);editor(page)
    page.locator('#lookPreset').select_option('toon');page.locator('#appearanceMaterialPreset').select_option('enamel')
    assert all(layer['material']['roughness']==0.28 for layer in p.cubes(page))
    assert page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot().length')==0
    value(page,'appearanceMaterialRoughness',0.72)
    assert all(layer['material']['roughness']==0.72 for layer in p.cubes(page))
    for old,layer in zip(before,p.cubes(page)):
        for key in ['id','iso','isoPending','autoIso','visible']:assert old[key]==layer[key],(key,old,layer)
    saved=page.evaluate('async () => VibeMolSession.export()');exact=state(page)
    fresh=context.browser.new_context();other=fresh.new_page();other.goto(url);other.wait_for_function('() => window.VibeMolAppearanceLooks')
    assert other.evaluate('async saved => VibeMolSession.import(saved)',saved)['ok']
    assert state(other)['settings']==exact['settings'] and p.cubes(other)==p.cubes(page)
    fresh.close()
    assert p.load(page,[{'name':'orbital.cube','text':p.hydrogen_2p_cube()}])['ok']
    # A newly loaded source inherits the same material, with no per-source finish.
    initial=page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()');assert len(initial)==2
    assert all(mat['roughness']==0.72 for mat in initial)
    ids=[item['geometryId'] for item in initial];camera=page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
    page.locator('#appearanceMaterialPreset').select_option('toon')
    assert all(mat['type']=='MeshToonMaterial' for mat in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()'))
    page.locator('#appearanceLightingSection > summary').click();value(page,'appearanceLightdirIntensity',2.4)
    page.evaluate('() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    pixels=page.locator('canvas').first.evaluate('el=>el.toDataURL()')
    value(page,'appearanceLightexposure',0.6)
    page.evaluate('() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    assert page.locator('canvas').first.evaluate('el=>el.toDataURL()')!=pixels
    value(page,'appearanceLightexposure',1)
    page.locator('#appearanceGeometrySection > summary').click();page.locator('#appearanceConnector').select_option('kit')
    assert [item['geometryId'] for item in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')]==ids
    camera_equal(camera,page.evaluate('() => VibeMolTesting.getCameraSnapshot()'))
    page.locator('#appearanceMaterialPreset').select_option('gel');value(page,'appearanceMaterialRoughness',0.43)
    value(page,'appearanceMaterialOpacity',0.65)
    assert all(mat['opacity']==0.65 for mat in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()'))
    assert state(page)['settings']['molecule.opacity.atom']==state(page)['settings']['molecule.opacity.bond']==0.65
    # ACES must work through the transparent surface compositor as well as direct rendering.
    page.locator('#appearanceToneMapping').select_option('aces')
    page.wait_for_function('() => {const s=VibeMolTesting.getWboitSnapshot();return s.active || s.fallback}')
    page.evaluate('() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    aces=page.locator('canvas').first.evaluate('el=>el.toDataURL()')
    page.locator('#appearanceToneMapping').select_option('linear')
    page.evaluate('() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    assert page.locator('canvas').first.evaluate('el=>el.toDataURL()')!=aces
    p.redraw(page)
    assert all(mat['roughness']==0.43 for mat in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()'))
    before=state(page)
    error=page.evaluate("""() => {
      const preset=VibeMolPreset.export();preset.settings['global.backgroundColor']='#123456';
      preset.settings['appearance.rendering'].material.roughness=-1;
      try { VibeMolPreset.import(preset,{mode:'strict'}); return ''; } catch(error) { return error.message; }
    }""")
    assert 'Invalid material roughness' in error and state(page)==before
    print('[looks] shared deferred orbitals, future sources, unchanged geometry, opacity, ACES transparency, sessions: passed',flush=True)


def shared_material_presets(page,context,url):
    # Reference values from main (e82dcbd), tested on actual shaders for all three targets.
    fields=['roughness','metalness','clearcoat','clearcoatRoughness','reflectivity','emissiveIntensity','envMapIntensity']
    recipes={
        'emissive':[1,0,1,0.1,0.5,0.8,0],
        'satin':[0.45,0,0,0.1,0.5,0,0.8],
        'lacquer':[0.25,0,1,0.05,0.6,0,1.2],
        'metal':[0.2,1,0,0.1,0.8,0,1.2],
        'gel':[0.15,0,1,0.02,0.5,0.15,1.5],
        'ceramic':[0.35,0,0.8,0.1,0.5,0.2,0.65],
    }
    # A bonded molecule with both orbital signs exercises all three material targets.
    orbital=p.hydrogen_2p_cube().replace('1 -8 -8 -8','2 -8 -8 -8').replace('1 0 0 0 0\n','1 0 0 0 0\n1 0 1.2 0 0\n')
    assert p.load(page,[{'name':'materials.cube','text':orbital}])['ok']
    # Previously saved Glossy remains readable, but is no longer a menu choice.
    result=page.evaluate('''() => VibeMolPreset.import({kind:'vibemol.preset',presetVersion:1,
      settings:{'molecule.style':'kit','surface.materialPreset':'glossy'}},{mode:'strict'})''')
    assert result['ok'] and not result['warnings'],result
    initial=page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')
    assert len(initial)==2 and all(mat['roughness']==0.045 for mat in initial)
    editor(page)
    assert page.locator('#appearanceMaterialPreset option[value="glossy"]').count()==0
    assert page.locator('#appearanceMaterialPreset option').all_text_contents()[1:7]==['Emissive','Satin','Lacquer','Metal','Gel','Ceramic']
    page.locator('#appearanceMaterialPreset').select_option('matte')
    before=rendering(page);layers=p.cubes(page)
    camera=page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
    structure=page.evaluate('() => VibeMolStructure.exportActive().volume')
    carriers=page.evaluate('() => VibeMolTesting.getBondCarrierSnapshots()')
    assert carriers and all(bond['connectorStyle'].startswith('kit') for bond in carriers),carriers
    for name,values in recipes.items():
        page.locator('#appearanceMaterialPreset').select_option(name)
        assert page.locator('#appearanceMaterialPreset').input_value()==name
        for slot in ['atoms','bonds','surfaces']:
            mats=page.evaluate('slot => VibeMolTesting.getLookMaterialSnapshot(slot)',slot)
            assert mats and all(mat['type']=='MeshPhysicalMaterial' for mat in mats)
            for mat in mats:
                for field,expected in zip(fields,values):
                    assert math.isclose(mat[field],expected,abs_tol=1e-8),(name,slot,field,mat[field],expected)
        assert state(page)['settings']['surface.materialPreset']==name
        assert all(mat['surfaceMaterialPreset']==name for mat in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()'))
        assert [mat['geometryId'] for mat in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')]==[mat['geometryId'] for mat in initial]
    page.wait_for_function('() => VibeMolTesting.getLookLightingSnapshot().environment')
    page.locator('#appearanceMaterialPreset').select_option('gel')
    assert float(page.locator('#appearanceMaterialRoughness').input_value())==0.15
    after=rendering(page)
    for key in ['geometry','lighting','coloring','effects']:assert after[key]==before[key]
    assert page.evaluate('() => VibeMolStructure.exportActive().volume')==structure
    assert page.evaluate('() => VibeMolTesting.getBondCarrierSnapshots()')==carriers
    camera_equal(camera,page.evaluate('() => VibeMolTesting.getCameraSnapshot()'))
    surfaces=page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')
    assert [mat['geometryId'] for mat in surfaces]==[mat['geometryId'] for mat in initial]
    assert all(mat['clearcoat']==1 and mat['clearcoatRoughness']==0.02 and math.isclose(mat['reflectivity'],0.5) for mat in surfaces),surfaces
    for old,layer in zip(layers,p.cubes(page)):
        for key in ['iso','autoIso','visible','posColor','negColor','opacity']:assert old[key]==layer[key]
    page.locator('#lookSave').click();page.locator('#lookNameInput').fill('Gel figures');page.locator('#lookNameInput').press('Enter')
    page.locator('#lookSaveDetails > summary').click()
    with page.expect_download() as download:page.locator('#lookExport').click()
    look=json.loads(Path(download.value.path()).read_text())
    assert look['settings']['surface.materialPreset']=='gel'
    assert look['settings']['appearance.rendering']==after
    session=page.evaluate('async () => VibeMolSession.export()')
    fresh=context.browser.new_context();other=fresh.new_page();other.goto(url);other.wait_for_function('() => window.VibeMolAppearanceLooks')
    try:
        other.locator('#lookFileInput').set_input_files({'name':'gel.look.json','mimeType':'application/json','buffer':json.dumps(look).encode()})
        other.wait_for_function('() => VibeMolAppearanceLooks.snapshot().saved.length===1')
        assert rendering(other)==after
        assert other.evaluate('async session => VibeMolSession.import(session)',session)['ok']
        assert rendering(other)==after and p.cubes(other)==p.cubes(page)
        for slot in ['atoms','bonds','surfaces']:
            editor(other)
            assert other.locator('#appearanceMaterialPreset').input_value()=='gel'
            mats=other.evaluate('slot => VibeMolTesting.getLookMaterialSnapshot(slot)',slot)
            assert mats and all(mat['type']=='MeshPhysicalMaterial' and mat['roughness']==0.15 for mat in mats)
    finally:fresh.close()
    print('[looks] six main-branch materials on atoms, bonds, and orbitals; Gel look/session round-trip: passed',flush=True)


def basic_surface_finish(page,context,url):
    orbital=p.hydrogen_2p_cube().replace('1 -8 -8 -8','2 -8 -8 -8').replace('1 0 0 0 0\n','1 0 0 0 0\n1 0 1.2 0 0\n')
    assert p.load(page,[{'name':'basic.cube','text':orbital}])['ok']
    # Simulate the earlier shared Basic appearance, then apply the restored preset.
    page.evaluate('''() => {
      const old=VibeMolAppearanceModel.legacy('basic');delete old.surfaceMaterial;
      VibeMolPreset.import({kind:'vibemol.preset',presetVersion:1,settings:{'appearance.rendering':old}});
    }''')
    atoms=page.evaluate('() => VibeMolTesting.getLookMaterialSnapshot("atoms")')
    bonds=page.evaluate('() => VibeMolTesting.getLookMaterialSnapshot("bonds")')
    surfaces=page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')
    assert len(surfaces)==2 and all(mat['emissiveIntensity']==0 for mat in surfaces)
    ids=[mat['geometryId'] for mat in surfaces];layers=p.cubes(page)
    camera=page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
    page.evaluate("() => VibeMolAppearanceLooks.apply('basic')")
    restored=page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')
    assert [mat['geometryId'] for mat in restored]==ids
    assert page.evaluate('() => VibeMolTesting.getLookMaterialSnapshot("atoms")')==atoms
    assert page.evaluate('() => VibeMolTesting.getLookMaterialSnapshot("bonds")')==bonds
    expected={'roughness':1,'metalness':0,'clearcoat':1,'clearcoatRoughness':0.1,
              'reflectivity':0.5,'emissiveIntensity':0.8,'envMapIntensity':0}
    for mat in restored:
        for key,expected_value in expected.items():assert math.isclose(mat[key],expected_value,abs_tol=1e-8),(key,mat)
    camera_equal(camera,page.evaluate('() => VibeMolTesting.getCameraSnapshot()'))
    for old,layer in zip(layers,p.cubes(page)):
        for key in ['iso','autoIso','visible','opacity']:assert old[key]==layer[key]
    original=rendering(page)
    assert all(layer['material']==original['surfaceMaterial'] for layer in p.cubes(page))
    page.evaluate("() => VibeMolAppearanceLooks.edit('lighting',{dirIntensity:1.2})")
    assert rendering(page)['surfaceMaterial']==original['surfaceMaterial']
    page.evaluate("() => VibeMolAppearanceLooks.apply('basic')")
    session=page.evaluate('async () => VibeMolSession.export()')
    look=page.evaluate('() => VibeMolLooks.exportLook(VibeMolAppearanceLooks.snapshot().activeLook)')
    fresh=context.browser.new_context();other=fresh.new_page();other.goto(url);other.wait_for_function('() => window.VibeMolAppearanceLooks')
    try:
        other.locator('#lookFileInput').set_input_files({'name':'original-basic.look.json','mimeType':'application/json','buffer':json.dumps(look).encode()})
        other.wait_for_function('() => VibeMolAppearanceLooks.snapshot().saved.length===1')
        assert rendering(other)==original
        assert other.evaluate('async session => VibeMolSession.import(session)',session)['ok']
        assert rendering(other)==original and p.cubes(other)==p.cubes(page)
        assert all(mat['emissiveIntensity']==0.8 for mat in other.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()'))
    finally:fresh.close()
    # A material selection explicitly unifies the finishes, even when its atom
    # recipe equals Basic's existing material. Undo restores the complete look.
    editor(page)
    assert page.locator('#appearanceMaterialPreset').input_value()=='custom'
    assert 'original surface finish' in page.locator('#appearanceMaterialScope').inner_text()
    page.locator('#appearanceMaterialPreset').select_option('polished')
    assert rendering(page)['surfaceMaterial'] is None
    assert all(mat['roughness']==0.16 and mat['emissiveIntensity']==0 for mat in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()'))
    page.locator('#lookUndo').click()
    assert rendering(page)==original
    value(page,'appearanceMaterialRoughness',0.33)
    assert rendering(page)['surfaceMaterial'] is None
    for target in ['atoms','bonds','surfaces']:
        assert all(mat['roughness']==0.33 for mat in page.evaluate('target=>VibeMolTesting.getLookMaterialSnapshot(target)',target))
    page.locator('#lookRevert').click();assert rendering(page)==original
    # The restored recipe is also the default for future, uncomputed orbitals.
    assert p.load(page,[{'name':'deferred.molden','text':p.MOLDEN}])['ok']
    assert not page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot().length')
    assert all(layer['material']==original['surfaceMaterial'] for layer in p.cubes(page))
    print('[looks] original Basic surfaces, unchanged atoms/bonds, shared material edits, undo, saved looks/sessions, deferred orbitals: passed',flush=True)


def main():
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True)
        try:
            for run in [basic_surface_finish,components_and_saving,surfaces_and_sessions,shared_material_presets]:
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
