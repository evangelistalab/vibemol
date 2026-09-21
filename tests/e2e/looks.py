#!/usr/bin/env python3
"""Native appearance components, fast material edits, and portable looks."""
from __future__ import annotations
import json
import math
from pathlib import Path
import premerge as p
from surface_shadows import shadow_camera_fit, surfaces_cast_and_receive, split_surface_shadows
from surface_schemes import surface_schemes
from look_tiles import complete_look_tiles
from look_references import reference_ui, reference_persistence, reference_migration


def state(page):
    return page.evaluate('() => VibeMolAppearanceLooks.snapshot()')


def pristine(page):
    value = state(page)
    return not value['styleModified'] and not value['colorsModified']


def rendering(page):
    return state(page)['settings']['appearance.rendering']


def editor(page, material=True):
    if page.locator('#displayInspectorBtn').get_attribute('aria-expanded') != 'true':
        page.locator('#displayInspectorBtn').click()
    if page.locator('#styleStudioBtn').get_attribute('aria-expanded') != 'true':
        page.locator('#styleStudioBtn').click()
    # Keep sidebar controls accessible while testing the independent Studio.
    if page.viewport_size['width'] >= 1000:
        panel=page.locator('#styleStudio').bounding_box()
        header=page.locator('#styleStudio .vm-list-popover__header').bounding_box()
        page.mouse.move(header['x']+80,header['y']+15);page.mouse.down()
        page.mouse.move(page.viewport_size['width']-panel['width']+68,header['y']+15);page.mouse.up()
    if material and not page.locator('#appearanceMaterialsSection').evaluate('el => el.open'):
        page.locator('#appearanceMaterialsSection > summary').click()


def value(page, control, number):
    p.set_surface_control(page, '#' + control, number)


def choose_material(page, recipe):
    family=page.evaluate('''id => VibeMolLooks.materialPresets.find(item=>item.id===id)?.family
      || JSON.parse(localStorage.getItem('vibemol.materials.v1') || '[]').find(item=>item.id===id)?.material.model''',recipe)
    if page.locator('#appearanceMaterialFamily').input_value()!=family:
        page.locator('#appearanceMaterialFamily').select_option(family)
    page.locator('#appearanceMaterialPreset').select_option(recipe)


def camera_equal(before, after):
    assert before['mode'] == after['mode']
    for vector in ['camera', 'target', 'up']:
        assert all(math.isclose(before[vector][axis], after[vector][axis], abs_tol=1e-8) for axis in ['x','y','z'])


def material_families(page, context, url):
    def exercise(page, workbench):
        assert p.load(page,[{'name':'family.cube','text':p.hydrogen_2p_cube()}])['ok']
        if workbench:
            page.evaluate('VibeMolAppearanceLooks.openStudio()')
            page.locator('#appearanceMaterialsSection > summary').click()
        else:
            editor(page)
        page.locator('#appearanceGeometrySection').evaluate('el=>el.open=false')
        family=page.locator('#appearanceMaterialFamily'); recipe=page.locator('#appearanceMaterialPreset')
        assert family.locator('option').all_text_contents()==['Physical','Smooth (Phong)','Toon']
        expected={'physical':['basic','emissive','gel','matte','metal','opal','porcelain'],
                  'phong':['classic','kit'],'toon':['ink','toon']}
        defaults={'physical':'basic','phong':'classic','toon':'toon'}
        before=rendering(page); camera=page.evaluate('VibeMolTesting.getCameraSnapshot()')
        geometry_ids=[mat['geometryId'] for mat in page.evaluate('VibeMolTesting.getSurfaceMaterialSnapshot()')]
        for model in ['phong','toon','physical']:
            family.select_option(model)
            assert recipe.input_value()==defaults[model]
            assert recipe.locator('option').evaluate_all('els=>els.map(el=>el.value)')==['custom',*expected[model]]
            assert recipe.locator('option[value=custom]').is_disabled()
            for key in ['geometry','coloring','lighting','effects']: assert rendering(page)[key]==before[key]
            assert [mat['geometryId'] for mat in page.evaluate('VibeMolTesting.getSurfaceMaterialSnapshot()')]==geometry_ids
            assert page.locator('#appearanceMaterialRoughness').is_visible()==(model=='physical')
            assert page.locator('#appearanceMaterialEnvironment').is_visible()==(model=='physical')
            assert page.locator('#appearanceMaterialMetalness').is_visible()==(model=='physical')
            assert page.locator('#appearanceMaterialShininess').is_visible()==(model=='phong')
            assert page.locator('#appearanceToonTone0').is_visible()==(model=='toon')
            assert page.locator('#appearanceMaterialEmission').is_visible()
            family_box=family.bounding_box();recipe_box=recipe.bounding_box()
            assert abs(family_box['x']-recipe_box['x'])<1 and abs(family_box['width']-recipe_box['width'])<1
            camera_equal(camera,page.evaluate('VibeMolTesting.getCameraSnapshot()'))
        choose_material(page,'gel');value(page,'appearanceMaterialRoughness',0.333)
        custom=state(page)['settings']; assert recipe.input_value()=='custom'
        family.select_option('phong');page.locator('#lookUndo').click()
        assert state(page)['settings']==custom and family.input_value()=='physical' and recipe.input_value()=='custom'
        # Real controls can reproduce the other recipe in the same family;
        # inactive legacy Physical fields cannot leave Phong or Toon Custom.
        choose_material(page,'classic');value(page,'appearanceMaterialShininess',145)
        value(page,'appearanceSpecularColor','#ffffff');value(page,'appearanceMaterialEmission',0.06)
        page.locator('#appearanceMaterialChannels').evaluate('el=>el.open=true')
        value(page,'appearanceMaterialEmissionScale',0.02)
        assert recipe.input_value()=='kit'
        choose_material(page,'ink')
        for i,tone in enumerate([12,64,142,255]):value(page,'appearanceToonTone'+str(i),tone)
        value(page,'appearanceMaterialEmission',0.56);value(page,'appearanceMaterialEmissionScale',0.26)
        value(page,'appearanceMaterialEmissionMix',0.06)
        assert recipe.input_value()=='toon'
        page.locator('#lookPreset').select_option('toon')
        value(page,'appearanceToonTone1',91);value(page,'appearanceToonTone1',64)
        assert recipe.input_value()=='toon' and pristine(page)
        # Personal recipes follow their family, including import and session restore.
        value(page,'appearanceToonTone1',91)
        page.locator('#materialLibraryFields').locator('..').evaluate('el=>el.open=true')
        page.locator('#materialName').fill('My bands');page.locator('#saveMaterial').click()
        saved=page.evaluate('JSON.parse(localStorage.getItem("vibemol.materials.v1"))[0]')
        assert recipe.input_value()==saved['id']
        assert recipe.locator('optgroup').get_attribute('label')=='My materials'
        value(page,'appearanceToonTone1',92); assert recipe.input_value()=='custom'
        page.locator('#updateMaterial').click(); assert recipe.input_value()==saved['id']
        session=page.evaluate('VibeMolSession.export()')
        with page.expect_download() as download:page.locator('#exportMaterial').click()
        exported=Path(download.value.path()).read_bytes()
        family.select_option('physical')
        assert recipe.locator('option[value="'+saved['id']+'"]').count()==0
        assert page.locator('#updateMaterial').is_disabled() and page.locator('#deleteMaterial').is_disabled()
        assert page.evaluate('saved=>VibeMolSession.import(saved)',session)['ok']
        assert family.input_value()=='toon' and recipe.input_value()==saved['id']
        family.select_option('phong')
        page.locator('#materialFile').set_input_files({'name':'bands.material.json','mimeType':'application/json','buffer':exported})
        page.wait_for_function('()=>JSON.parse(localStorage.getItem("vibemol.materials.v1")).length===2')
        assert family.input_value()=='toon'
        assert recipe.input_value().startswith('user-') and rendering(page)['material']['toonSteps'][1]==92
        page.locator('#lookUndo').click()
        assert family.input_value()=='phong' and recipe.input_value()=='classic'
        # Slider edits keep both control and option nodes stable.
        page.evaluate('window.__recipeNode=document.querySelector("#appearanceMaterialPreset option[value=kit]")')
        value(page,'appearanceMaterialShininess',80)
        assert page.evaluate('__recipeNode===document.querySelector("#appearanceMaterialPreset option[value=kit]")')
        print('[materials] '+('Properties' if workbench else 'Studio')+': families, controls, recipe matching, undo, personal libraries, sessions: passed',flush=True)
    exercise(page,False)
    fresh=context.browser.new_context(viewport={'width':1512,'height':950})
    other=fresh.new_page();errors=[];other.on('pageerror',lambda error:errors.append(str(error)))
    try:
        other.goto(url+'?workspaceLab=1&appearanceStudy=1');other.wait_for_function('()=>window.VibeMolWorkbench')
        exercise(other,True)
        assert not errors,errors
    finally:fresh.close()


def independent_colors(page, context, url):
    def exercise(page, workbench):
        page.add_init_script('('+p.MOLDEN_GRID_OBSERVER+')()');page.reload()
        page.wait_for_function('()=>window.VibeMolAppearanceLooks')
        assert p.load(page,[{'name':'a.cube','text':p.cube(-1)},{'name':'b.cube','text':p.cube(1)}])['ok']
        if workbench:page.evaluate('VibeMolAppearanceLooks.openStudio()')
        else:editor(page,material=False)
        colors=lambda:page.evaluate('VibeMolLooks.colors(VibeMolAppearanceLooks.snapshot().settings)')
        page.locator('#lookColorPreset').select_option('classic')
        original_colors=colors()
        atom_colors=page.evaluate('VibeMolTesting.getLookMaterialSnapshot().map(m=>m.color)')
        camera=page.evaluate('VibeMolTesting.getCameraSnapshot()')
        molecule=page.evaluate('VibeMolStructure.exportActive().volume')
        geometry_ids=[m['geometryId'] for m in page.evaluate('VibeMolTesting.getSurfaceMaterialSnapshot()')]
        for look in ['toon','kit','opal','porcelain','ink','basic','classic']:
            page.locator('#lookPreset').select_option(look)
            assert colors()==original_colors and page.locator('#lookColorPreset').input_value()=='classic'
            assert page.locator('#appearanceMaterialPreset').input_value()==look
            assert page.evaluate('VibeMolTesting.getLookMaterialSnapshot().map(m=>m.color)')==atom_colors
            assert page.evaluate('VibeMolStructure.exportActive().volume')==molecule
            camera_equal(camera,page.evaluate('VibeMolTesting.getCameraSnapshot()'))
            assert [m['geometryId'] for m in page.evaluate('VibeMolTesting.getSurfaceMaterialSnapshot()')]==geometry_ids
        before=state(page)['settings']
        page.locator('.vm-look-card[data-look=opal]').click()
        assert page.evaluate('VibeMolLooks.equal(VibeMolAppearanceLooks.snapshot().settings,VibeMolLooks.builtins.find(x=>x.id==="opal").settings)')
        page.locator('#lookUndo').click();assert state(page)['settings']==before and colors()==original_colors
        if not workbench:
            page.locator('#appearanceLookPreset').select_option('toon');assert colors()==original_colors
        page.evaluate('VibeMolAppearanceLooks.apply("porcelain")');assert colors()==original_colors
        non_colors=rendering(page);active=state(page)['styleRef']['id']
        for palette in ['ink','kit','opal','classic']:
            page.locator('#lookColorPreset').select_option(palette)
            expected=page.evaluate('id=>VibeMolLooks.colors(VibeMolLooks.builtins.find(x=>x.id===id).settings)',palette)
            assert colors()==expected and state(page)['styleRef']['id']==active,(palette,colors(),expected,state(page)['styleRef']['id'],active)
            assert pristine(page)
            now=rendering(page)
            for key in ['geometry','material','surfaceMaterial','effects']:assert now[key]==non_colors[key]
            assert {**now['lighting'],'followTheme':non_colors['lighting']['followTheme']}==non_colors['lighting']
        before=state(page)['settings']
        page.locator('#lookColorPreset').select_option('opal');page.locator('#lookUndo').click()
        assert state(page)['settings']==before and page.locator('#lookColorPreset').input_value()=='classic'
        page.locator('#appearanceColorsSection').evaluate('el=>el.open=true')
        page.locator('#studioBondColorMode').select_option('uniform');value(page,'studioBondColor','#123456')
        value(page,'appearanceBackgroundColor','#123456');page.locator('#appearanceFollowTheme').check()
        page.locator('#studioSurfaceScheme').select_option('custom');value(page,'studioSurfaceposColor','#abcdef')
        custom=colors();assert page.locator('#lookColorPreset').input_value()=='classic' and state(page)['colorsModified']
        page.locator('#lookPreset').select_option('kit');assert colors()==custom
        page.locator('#appearanceMaterialsSection').evaluate('el=>el.open=true')
        choose_material(page,'gel');assert colors()==custom
        # Preserve explicit orbital overrides; recolor only inherited layers.
        a,b=p.cubes(page)
        page.locator('.vm-outliner-row[data-id="'+a['id']+'"]').click()
        if workbench:page.locator('#inspectorObjectTab').click()
        value(page,'posColor','#765432');value(page,'opacity',0.42)
        protected=p.cubes(page)[0]
        if workbench:page.locator('#inspectorLookTab').click()
        page.locator('#lookColorPreset').select_option('opal')
        a,b=p.cubes(page)
        for key in ['posColor','negColor','colorScheme','opacity','styleOverrides','iso','autoIso','visible']:
            assert a[key]==protected[key],key
        assert b['posColor']==state(page)['settings']['surface.posColor'] and b['styleOverrides']['colors'] is False
        mixed=state(page)['settings'];session=page.evaluate('VibeMolSession.export()')
        page.locator('#lookSave').click();page.locator('#lookNameInput').fill('Gel with Opal colors');page.locator('#lookNameInput').press('Enter')
        saved=state(page)['saved'][0];assert saved['settings']==mixed
        page.locator('#lookSaveDetails').evaluate('el=>el.open=true')
        with page.expect_download() as download:page.locator('#lookExport').click()
        exported=Path(download.value.path()).read_bytes()
        page.locator('#lookColorPreset').select_option('classic');page.locator('#lookPreset').select_option(saved['id'])
        assert page.locator('#lookColorPreset').input_value()=='classic'
        page.locator('#lookColorPreset').select_option(saved['id']);assert state(page)['settings']==mixed
        page.locator('#lookPreset').select_option('basic')
        page.locator('#lookFileInput').set_input_files({'name':'mixed.look.json','mimeType':'application/json','buffer':exported})
        page.wait_for_function('()=>VibeMolAppearanceLooks.snapshot().saved.length===2')
        assert state(page)['settings']==mixed
        page.evaluate('VibeMolAppearanceLooks.apply("ink",{includeColors:true})')
        assert colors()!=page.evaluate('settings=>VibeMolLooks.colors(settings)',mixed)
        assert page.evaluate('saved=>VibeMolSession.import(saved)',session)['ok']
        assert state(page)['settings']==mixed and p.cubes(page)[0]['posColor']=='#765432'
        assert p.load(page,[{'name':'orbitals.molden','text':p.MOLDEN}])['ok']
        page.evaluate('VibeMolAppearanceLooks.applyColors("ink")')
        assert all(not layer['visible'] and layer['posColor']==state(page)['settings']['surface.posColor'] for layer in p.cubes(page))
        assert page.evaluate('window.__moldenGridBuilds')==[]
        print('[colors] '+('Properties' if workbench else 'Studio')+': independent selection, overrides, Undo, saving/import and sessions: passed',flush=True)
    exercise(page,False)
    fresh=context.browser.new_context(viewport={'width':1512,'height':950})
    other=fresh.new_page();errors=[];other.on('pageerror',lambda e:errors.append(str(e)))
    try:
        other.goto(url+'?workspaceLab=1&appearanceStudy=1');other.wait_for_function('()=>window.VibeMolWorkbench')
        exercise(other,True);assert not errors,errors
    finally:fresh.close()


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
    assert page.locator('#appearanceMaterialMetalness').is_visible()
    page.locator('#appearanceMaterialChannels > summary').click()
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
    assert page.locator('#lookPreset option').all_text_contents()[1:]==['Basic','Classic','Ink','Kit','Opal','Porcelain','Toon']
    assert page.locator('#appearanceMaterialTarget, #appearanceMaterialModel, #appearanceLinkBonds, #lookFinishScope').count()==0
    assert not page.locator('#rowSurfaceMaterialPreset').is_visible()
    for style,expected in [('basic','MeshPhysicalMaterial'),('toon','MeshToonMaterial'),('kit','MeshPhongMaterial'),
                           ('classic','MeshPhongMaterial'),('porcelain','MeshPhysicalMaterial'),('ink','MeshToonMaterial'),('opal','MeshPhysicalMaterial')]:
        page.locator('#lookPreset').select_option(style)
        assert state(page)['styleRef']['id']==style and pristine(page)
        assert page.locator('#appearanceMaterialPreset').input_value()==style
        exact=state(page)['settings']
        choose_material(page,style)
        assert state(page)['settings']==exact and pristine(page)
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
    choose_material(page,'toon')
    assert rendering(page)['geometry']==geometry and rendering(page)['lighting']==lighting and rendering(page)['coloring']==palette
    assert all(bond['connectorStyle'].startswith('kit') for bond in page.evaluate('() => VibeMolTesting.getBondCarrierSnapshots()'))
    for slot in ['atoms','bonds']:
        assert all(mat['type']=='MeshToonMaterial' for mat in page.evaluate('slot => VibeMolTesting.getLookMaterialSnapshot(slot)',slot))
    choose_material(page,'gel');value(page,'appearanceMaterialRoughness',0.67)
    for slot in ['atoms','bonds']:
        assert all(mat['roughness']==0.67 for mat in page.evaluate('slot => VibeMolTesting.getLookMaterialSnapshot(slot)',slot))
    page.locator('#lookRevert').click();assert rendering(page)['material']['model']=='phong'
    # Native slider: one undo step for the whole drag, including its final change.
    editor(page); choose_material(page,'gel')
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
    assert len(state(page)['saved']) == 1 and pristine(page)
    saved=state(page)['settings']
    page.locator('#lookSaveDetails > summary').click();page.locator('#lookDefault').click()
    page.locator('#lookPreset').select_option('basic')
    second=context.new_page();second.goto(url+'?workspaceLab=0');second.wait_for_function('() => window.VibeMolAppearanceLooks')
    assert state(second)['settings'] == saved
    second.close()
    page.locator('#lookSaved').select_option(state(page)['saved'][0]['id'])
    with page.expect_download() as download: page.locator('#lookExport').click()
    exported=json.loads(Path(download.value.path()).read_text())
    assert exported['meta']['lookVersion']==4 and 'surface.iso' not in exported['settings']
    fresh=context.browser.new_context();other=fresh.new_page();other.goto(url+'?workspaceLab=0');other.wait_for_function('() => window.VibeMolAppearanceLooks')
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
    choose_material(page,'matte');choose_material(page,swatch['id'])
    assert rendering(page)['material']==swatch['material']
    page.locator('#lookClearDefault').click();value(page,'appearanceMaterialRoughness',0.44)
    page.wait_for_function('() => JSON.parse(localStorage.getItem("vibemol.autosavePreset"))?.settings["appearance.rendering"]?.material.roughness===0.44')
    page.reload();page.wait_for_function('() => window.VibeMolAppearanceLooks')
    assert not page.locator('#appearanceMaterialsSection').evaluate('el => el.open')
    assert rendering(page)['material']['roughness']==0.44
    assert state(page)['saved'][0]['settings']==saved
    editor(page);page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert page.locator('#appearanceMaterialPreset').evaluate('el => el.classList.contains("vm-select")')
    print('[looks] seven presets, shared material, studio lighting, undo, libraries, import/export, defaults, reload: passed',flush=True)


def surface_opacity_rendering(page,context,url):
    page.evaluate('''() => {
      window.opacityMeshes=new Set();window.opacityDisposals=0;
      const dispose=THREE.Material.prototype.dispose;
      THREE.Material.prototype.dispose=function(){
        if(this.userData.vmAppearanceTarget==='surfaces')opacityDisposals++;
        return dispose.call(this);
      };
      THREE.Mesh.prototype.onBeforeRender=function(){
        if(this.material?.userData?.vmAppearanceTarget==='surfaces')opacityMeshes.add(this);
      };
    }''')
    assert p.load(page,[{'name':'orbital.cube','text':p.hydrogen_2p_cube()}])['ok']
    page.locator('#viewAxisYBtn').evaluate('el=>el.click()')
    page.wait_for_function('() => VibeMolTesting.getWboitSnapshot().sceneEnvironmentLoaded')
    for look in ['basic','porcelain']:
        page.evaluate('id=>VibeMolAppearanceLooks.apply(id,{includeColors:true})',look)
        result=page.evaluate('''async () => {
          await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
          const start=opacityDisposals, frames=[], canvas=document.querySelector('#canvas');
          const scratch=document.createElement('canvas');scratch.width=canvas.width;scratch.height=canvas.height;
          const ctx=scratch.getContext('2d');
          const pixels=()=>{ctx.drawImage(canvas,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data;};
          for(const value of [.65,.62,.57,.35,1,.55]){
            const input=document.querySelector('#opacity');input.value=value;
            input.dispatchEvent(new Event('input',{bubbles:true}));
            await new Promise(requestAnimationFrame);const first=pixels();
            await new Promise(requestAnimationFrame);const settled=pixels();
            let changed=0;
            for(let i=0;i<first.length;i+=4){
              const difference=Math.abs(first[i]-settled[i])+Math.abs(first[i+1]-settled[i+1])+Math.abs(first[i+2]-settled[i+2]);
              if(difference>8)changed++;
            }
            frames.push({value,changed,resources:[...opacityMeshes].filter(mesh=>mesh.parent).map(mesh=>[
              mesh.geometry.uuid,mesh.material.uuid,mesh.userData.vmWboit?.accumMaterial.uuid,mesh.userData.vmWboit?.revealMaterial.uuid
            ]),alpha:[...opacityMeshes].filter(mesh=>mesh.parent).map(mesh=>mesh.material.opacity)});
          }
          document.querySelector('#opacity').dispatchEvent(new Event('change',{bubbles:true}));
          return {frames,disposals:opacityDisposals-start};
        }''')
        assert result['disposals']==0,(look,result)
        for frame in result['frames']:
            assert frame['changed']<10,(look,frame)
            assert frame['resources']==result['frames'][0]['resources'],(look,frame)
            assert frame['alpha'] and all(alpha==frame['value'] for alpha in frame['alpha']),frame
    # Deliberate material changes still create new shaders; their first frame
    # must also use the chosen opacity, including front/back and shadow variants.
    changed=page.evaluate('''async () => {
      VibeMolAppearanceLooks.edit('material',{roughness:.61});
      await new Promise(requestAnimationFrame);
      return [...opacityMeshes].filter(mesh=>mesh.parent).flatMap(mesh=>{
        const cache=mesh.userData.vmWboit;
        return [cache.accumMaterial,cache.revealMaterial].map(mat=>mat.userData.vmWboitPass.uniforms.uWboitAlpha.value);
      });
    }''')
    assert changed and all(alpha==0.55 for alpha in changed),changed
    print('[looks] first-frame opacity, stable frames during drag/full-opacity transitions, reusable surface/WBOIT materials, and shader variants: passed',flush=True)


def surface_opacity_controls(page,context,url):
    p.load_cubes(page)
    assert p.load(page,[{'name':'pyridine.xyz','text':(p.ROOT/'assets/fragments/pyridine.xyz').read_text()}],clear_first=False)['ok']
    a,b=p.cubes(page)
    page.locator(f'.vm-outliner-row[data-id="{a["id"]}"]').click()
    editor(page)
    assert page.locator('#appearanceSurfacesSection #opacity').is_visible()
    assert page.locator('#appearanceMaterialOpacity,#materialStatus,#moleculeAtomOpacity,#moleculeBondOpacity').count()==0

    def molecule_is_opaque():
        for target in ['atoms','bonds']:
            mats=page.evaluate('target=>VibeMolTesting.getLookMaterialSnapshot(target)',target)
            assert mats and all(m['opacity']==1 and not m['transparent'] and m['depthWrite'] for m in mats),(target,mats)

    def surface_ids():
        return [m['geometryId'] for m in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')]

    ids=surface_ids();material=rendering(page)['material']
    page.locator('#opacity').fill('0.42');page.locator('#opacity').press('Tab')
    assert [layer['opacity'] for layer in p.cubes(page)]==[0.42,1]
    molecule_is_opaque();assert surface_ids()==ids
    assert rendering(page)['material']==material
    # A native slider drag is one appearance undo step, scoped to this orbital.
    page.locator('#opacityRange').evaluate('''el=>{
      for(const value of [550,620,740]){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}
      el.dispatchEvent(new Event('change',{bubbles:true}));
    }''')
    assert p.cubes(page)[0]['opacity']!=0.42
    page.locator('#lookUndo').click();assert [layer['opacity'] for layer in p.cubes(page)]==[0.42,1]
    page.locator(f'.vm-outliner-row[data-id="{a["parentId"]}"]').click()
    assert page.locator('[data-mixed-key="opacity"]').is_visible()
    ids=surface_ids()
    page.locator('#opacity').fill('0.6');page.locator('#opacity').press('Tab')
    assert [layer['opacity'] for layer in p.cubes(page)]==[0.6,0.6]
    assert not page.locator('[data-mixed-key="opacity"]').is_visible()
    assert surface_ids()==ids;molecule_is_opaque()
    page.locator('#lookUndo').click();assert [layer['opacity'] for layer in p.cubes(page)]==[0.42,1]
    # Strict legacy presets and sessions retain surface values, never molecule transparency.
    legacy={'molecule.opacity.atom':0.2,'molecule.opacity.bond':0.3}
    result=page.evaluate('settings=>VibeMolPreset.import({kind:"vibemol.preset",presetVersion:1,settings},{mode:"strict"})',legacy)
    assert result['ok'],result
    molecule_is_opaque()
    saved=page.evaluate('() => VibeMolSession.export()')
    saved['preset']['settings'].update(legacy)
    before=[layer['opacity'] for layer in p.cubes(page)]
    assert page.evaluate('saved=>VibeMolSession.import(saved)',saved)['ok']
    assert [layer['opacity'] for layer in p.cubes(page)]==before;molecule_is_opaque()
    exported=page.evaluate('() => VibeMolPreset.export().settings')
    assert all(key not in exported for key in legacy)
    # Hidden Molden orbitals accept group opacity edits without computing any grids.
    assert p.load(page,[{'name':'orbitals.molden','text':p.MOLDEN}])['ok']
    orbitals=p.cubes(page)
    page.locator(f'.vm-outliner-row[data-id="{orbitals[0]["parentId"]}"]').click()
    page.locator('#opacity').fill('0.35');page.locator('#opacity').press('Tab')
    assert all(layer['opacity']==0.35 and not layer['visible'] for layer in p.cubes(page))
    assert page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot().length')==0
    page.locator(f'.vm-outliner-row[data-id="{orbitals[0]["id"]}"]').click()
    page.wait_for_function('() => VibeMolTesting.getSurfaceMaterialSnapshot().length>0')
    assert page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot().every(m=>m.opacity===0.35)')
    print('[looks] visible surface-only opacity, individual/group edits, mixed values, slider undo, stable geometry, opaque molecules, legacy presets/sessions and deferred MOs: passed',flush=True)


def surfaces_and_sessions(page,context,url):
    assert p.load(page,[{'name':'orbitals.molden','text':p.MOLDEN}])['ok']
    before=p.cubes(page);editor(page)
    page.locator('#lookPreset').select_option('toon');choose_material(page,'porcelain')
    assert all(math.isclose(layer['material']['roughness'],0.58) for layer in p.cubes(page))
    assert page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot().length')==0
    value(page,'appearanceMaterialRoughness',0.72)
    assert all(layer['material']['roughness']==0.72 for layer in p.cubes(page))
    for old,layer in zip(before,p.cubes(page)):
        for key in ['id','iso','isoPending','autoIso','visible']:assert old[key]==layer[key],(key,old,layer)
    saved=page.evaluate('async () => VibeMolSession.export()');exact=state(page)
    fresh=context.browser.new_context();other=fresh.new_page();other.goto(url+'?workspaceLab=0');other.wait_for_function('() => window.VibeMolAppearanceLooks')
    assert other.evaluate('async saved => VibeMolSession.import(saved)',saved)['ok']
    assert state(other)['settings']==exact['settings'] and p.cubes(other)==p.cubes(page)
    fresh.close()
    assert p.load(page,[{'name':'orbital.cube','text':p.hydrogen_2p_cube()}])['ok']
    # A newly loaded source inherits the same material, with no per-source finish.
    initial=page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()');assert len(initial)==2
    assert all(mat['roughness']==0.72 for mat in initial)
    ids=[item['geometryId'] for item in initial];camera=page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
    choose_material(page,'toon')
    assert all(mat['type']=='MeshToonMaterial' for mat in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()'))
    page.locator('#appearanceLightingSection > summary').click();value(page,'appearanceLightdirIntensity',2.4)
    page.evaluate('() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    pixels=page.locator('canvas').first.evaluate('el=>el.toDataURL()')
    value(page,'appearanceLightexposure',0.6)
    page.evaluate('() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    assert page.locator('canvas').first.evaluate('el=>el.toDataURL()')!=pixels
    value(page,'appearanceLightexposure',1)
    page.locator('#appearanceGeometrySection').evaluate('el=>el.open=true');page.locator('#appearanceConnector').select_option('kit')
    assert [item['geometryId'] for item in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')]==ids
    camera_equal(camera,page.evaluate('() => VibeMolTesting.getCameraSnapshot()'))
    choose_material(page,'gel');value(page,'appearanceMaterialRoughness',0.43)
    value(page,'opacity',0.65)
    assert all(mat['opacity']==0.65 for mat in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()'))
    assert page.evaluate('() => VibeMolTesting.getLookMaterialSnapshot("atoms").every(mat=>mat.opacity===1&&!mat.transparent&&mat.depthWrite)')
    assert [item['geometryId'] for item in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')]==ids
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
        'matte':[0.85,0,0,0.1,0.3,0,0.4],
        'metal':[0.2,1,0,0.1,0.8,0,1.2],
        'gel':[0.15,0,1,0.02,0.5,0.15,1.5],
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
    assert page.locator('#appearanceMaterialPreset option').all_text_contents()==[
        'Custom','Basic','Emissive','Gel','Matte','Metal','Opal','Porcelain']
    # Menu pruning never changes the stored rendering of an older flat preset.
    for name,roughness in [('satin',0.45),('lacquer',0.25),('ceramic',0.35),('enamel',0.28)]:
        result=page.evaluate('''name => VibeMolPreset.import({kind:'vibemol.preset',presetVersion:1,
          settings:{'molecule.style':'kit','surface.materialPreset':name}},{mode:'strict'})''',name)
        assert result['ok'] and not result['warnings'],result
        assert page.locator('#appearanceMaterialPreset').input_value()=='custom'
        mats=page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')
        assert mats and all(mat['roughness']==roughness for mat in mats)
    choose_material(page,'matte')
    initial=page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')
    before=rendering(page);layers=p.cubes(page)
    refs=[state(page)[key] for key in ['styleRef','colorsRef']]
    camera=page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
    structure=page.evaluate('() => VibeMolStructure.exportActive().volume')
    carriers=page.evaluate('() => VibeMolTesting.getBondCarrierSnapshots()')
    assert carriers and all(bond['connectorStyle'].startswith('kit') for bond in carriers),carriers
    for name,values in recipes.items():
        choose_material(page,name)
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
    # All curated look materials use their exact recipes on every target,
    # independently of the currently chosen geometry, colors, and lighting.
    looks=page.evaluate('() => VibeMolLooks.builtins.filter(look=>!look.experimental)')
    shaders={'physical':'MeshPhysicalMaterial','phong':'MeshPhongMaterial','toon':'MeshToonMaterial'}
    for look in looks:
        choose_material(page,look['id'])
        assert page.locator('#appearanceMaterialPreset').input_value()==look['id']
        recipe=look['settings']['appearance.rendering'];current=rendering(page)
        for key in ['material','surfaceMaterial']:assert current[key]==recipe[key],(look['id'],key)
        for key in ['geometry','lighting','coloring','effects']:assert current[key]==before[key],(look['id'],key)
        assert [state(page)[key] for key in ['styleRef','colorsRef']]==refs
        for slot in ['atoms','bonds','surfaces']:
            expected=(recipe['surfaceMaterial'] if slot=='surfaces' else None) or recipe['material']
            mats=page.evaluate('slot => VibeMolTesting.getLookMaterialSnapshot(slot)',slot)
            assert mats and all(mat['type']==shaders[expected['model']] for mat in mats),(look['id'],slot,mats)
            parameters=fields+['iridescence'] if expected['model']=='physical' else ['emissiveIntensity']
            if expected['model']=='phong':parameters+=['shininess']
            for mat in mats:
                for key in parameters:assert math.isclose(mat[key],expected[key],abs_tol=1e-8),(look['id'],slot,key,mat[key],expected[key])
        assert all(layer['material']==(recipe['surfaceMaterial'] or recipe['material']) for layer in p.cubes(page))
        assert [mat['geometryId'] for mat in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')]==[mat['geometryId'] for mat in initial]
    page.wait_for_function('() => VibeMolTesting.getLookLightingSnapshot().environment')
    choose_material(page,'gel')
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
    fresh=context.browser.new_context();other=fresh.new_page();other.goto(url+'?workspaceLab=0');other.wait_for_function('() => window.VibeMolAppearanceLooks')
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
    print('[looks] seven exact preset materials plus four distinct finishes on all targets; legacy imports and Gel look/session round-trip: passed',flush=True)


def material_color_fill(page,context,url):
    # Compare pixels with identical geometry/lights so sphere/cylinder highlights
    # cannot mask a difference between uniform, vertex, and instance color paths.
    results=page.evaluate('''() => {
      const M=VibeMolAppearanceModel, renderer=new THREE.WebGLRenderer();
      const target=new THREE.WebGLRenderTarget(8,8), scene=new THREE.Scene();
      const camera=new THREE.OrthographicCamera(-1,1,1,-1,0.1,10);
      camera.position.z=2;
      scene.add(new THREE.AmbientLight(0xffffff,0.7));
      const light=new THREE.DirectionalLight(0xffffff,1.1);light.position.set(1,2,3);scene.add(light);
      const gradient=new THREE.DataTexture(new Uint8Array([12,64,142,255]),4,1,THREE.RedFormat);
      gradient.needsUpdate=true;
      const recipes=VibeMolLooks.materialPresets.map(({id})=>({id,...VibeMolLooks.materialRecipe(id)}));
      recipes.push({id:'mixed-fill',material:M.material({emissiveIntensity:0.9,emissiveScale:0.4,
        emissiveMix:0.3,emissiveColor:'#8053a2',tint:'#d0e8ff'})});
      recipes.push({id:'fixed-fill',material:M.material({emissiveIntensity:0.7,
        emissiveUsesColor:false,emissiveColor:'#238940'})});
      const results=[];
      try {
        renderer.setRenderTarget(target);
        for (const {id,material:d} of recipes) for (const color of ['#505050','#ed3030','#2559c4']) {
          const element=new THREE.Color(color), tint=new THREE.Color('#eaecf0'), pixels={};
          for (const path of ['uniform','vertex','instance','clone']) {
            const geometry=new THREE.PlaneGeometry(2,2);
            let material=M.createMaterial(THREE,d,path==='uniform'?element.clone().multiply(tint):tint,gradient,
              {vertexColors:path==='vertex'||path==='clone'});
            if (path==='clone') {
              const source=material;
              material=M.cloneMaterial(source);source.dispose();
            }
            let mesh;
            if (path==='instance') {
              mesh=new THREE.InstancedMesh(geometry,material,1);
              mesh.setMatrixAt(0,new THREE.Matrix4());mesh.setColorAt(0,element);
            } else {
              mesh=new THREE.Mesh(geometry,material);
              if (path!=='uniform') geometry.setAttribute('color',new THREE.Float32BufferAttribute(
                Array.from({length:geometry.attributes.position.count},()=>element.toArray()).flat(),3));
            }
            // Runtime intensity changes must scale fixed and color-derived fill equally.
            material.emissiveIntensity*=0.7;
            scene.add(mesh);renderer.render(scene,camera);
            const pixel=new Uint8Array(4);renderer.readRenderTargetPixels(target,4,4,1,1,pixel);
            pixels[path]=Array.from(pixel);scene.remove(mesh);geometry.dispose();material.dispose();
          }
          results.push({id,color,pixels});
        }
        return results;
      } finally { gradient.dispose();target.dispose();renderer.dispose(); }
    }''')
    for result in results:
        expected=result['pixels']['uniform']
        for path,pixel in result['pixels'].items():
            assert max(abs(a-b) for a,b in zip(expected,pixel))<=1,(result['id'],result['color'],path,expected,pixel)
    # The production transparency path must retain the hook on phase surfaces.
    field=p.cube(1).splitlines()[7]
    assert p.load(page,[{'name':'fill.2ccube','text':p.cube(-1)+'\n'.join([field,field,field])+'\n'}])['ok']
    page.evaluate('''() => {
      window.fillPasses=[];
      THREE.Mesh.prototype.onBeforeRender=function(renderer,scene,camera,geometry,material) {
        if (this.userData.phaseHue && material.userData.vmWboitPass)
          fillPasses.push(material.customProgramCacheKey());
      };
      VibeMolPreset.import({kind:'vibemol.preset',presetVersion:1,settings:{
        'twoComponent.mode':'alphaBetaPhase','surface.autoIsoEnabled':false,
        'surface.iso':0.04,'surface.opacity':0.55}});
    }''')
    for material in ['basic','toon','gel','emissive']:
        passes=page.evaluate('''async id => {
          VibeMolAppearanceLooks.edit('material',VibeMolLooks.materialRecipe(id).material,{replace:true});
          window.fillPasses=[];
          for(let i=0;i<4;i++) await new Promise(requestAnimationFrame);
          return fillPasses;
        }''',material)
        assert page.evaluate('() => VibeMolTesting.getWboitSnapshot().active')
        assert passes and all('vm-color-fill-v1:vm-wboit:' in key for key in passes),(material,passes)
    print('[looks] GPU color parity for every material: uniform, vertex, instance, clones, mixed/fixed fill and 2C WBOIT: passed',flush=True)


def basic_surface_finish(page,context,url):
    orbital=p.hydrogen_2p_cube().replace('1 -8 -8 -8','2 -8 -8 -8').replace('1 0 0 0 0\n','1 0 0 0 0\n1 0 1.2 0 0\n')
    assert p.load(page,[{'name':'basic.cube','text':orbital}])['ok']
    # An existing file with the historical pair keeps its stored materials.
    study=json.loads((p.ROOT/'docs/experiments/style-lab/basic-materials/recipes.json').read_text())
    legacy_settings=study['referenceSettings']
    page.evaluate('settings=>VibeMolPreset.import({kind:"vibemol.preset",presetVersion:1,settings})',legacy_settings)
    historical=rendering(page)
    assert historical==legacy_settings['appearance.rendering']
    old_session=page.evaluate('async () => VibeMolSession.export()')
    old_look=page.evaluate('settings=>VibeMolLooks.exportLook({id:"user-old-basic",name:"Historical Basic",settings})',legacy_settings)
    surfaces=page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')
    assert len(surfaces)==2 and all(mat['emissiveIntensity']==0.8 for mat in surfaces)
    assert all(mat['roughness']==0.16 for mat in page.evaluate('VibeMolTesting.getLookMaterialSnapshot("atoms")'))
    ids=[mat['geometryId'] for mat in surfaces];layers=p.cubes(page)
    camera=page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
    page.evaluate("() => VibeMolAppearanceLooks.apply('basic',{includeColors:true})")
    restored=page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')
    assert [mat['geometryId'] for mat in restored]==ids
    atoms=page.evaluate('() => VibeMolTesting.getLookMaterialSnapshot("atoms")')
    bonds=page.evaluate('() => VibeMolTesting.getLookMaterialSnapshot("bonds")')
    expected={'roughness':0.72,'metalness':0.04,'clearcoat':1,'clearcoatRoughness':0.1,
              'reflectivity':0.62,'emissiveIntensity':0.36,'envMapIntensity':0}
    for target in ['atoms','bonds','surfaces']:
        mats=page.evaluate('target=>VibeMolTesting.getLookMaterialSnapshot(target)',target)
        assert mats and all(mat['type']=='MeshPhysicalMaterial' for mat in mats)
        for mat in mats:
            for key,expected_value in expected.items():assert math.isclose(mat[key],expected_value,abs_tol=1e-8),(target,key,mat)
    camera_equal(camera,page.evaluate('() => VibeMolTesting.getCameraSnapshot()'))
    for old,layer in zip(layers,p.cubes(page)):
        for key in ['iso','autoIso','visible','opacity']:assert old[key]==layer[key]
    original=rendering(page)
    assert original['surfaceMaterial'] is None
    assert original['material']==next(item['material'] for item in study['options'] if item['id']=='luminous')
    assert all(layer['material']==original['material'] for layer in p.cubes(page))
    page.evaluate("() => VibeMolAppearanceLooks.edit('lighting',{dirIntensity:1.2})")
    assert rendering(page)['surfaceMaterial']==original['surfaceMaterial']
    page.evaluate("() => VibeMolAppearanceLooks.apply('basic',{includeColors:true})")
    session=page.evaluate('async () => VibeMolSession.export()')
    look=page.evaluate('() => {const s=VibeMolAppearanceLooks.snapshot();return VibeMolLooks.exportLook({id:"user-export",name:s.label,settings:s.settings})}')
    # Both new shared and older paired finishes round-trip exactly.
    for saved,document,recipe,layer_state,emission in [
        (session,look,original,p.cubes(page),0.36),
        (old_session,old_look,historical,layers,0.8),
    ]:
        fresh=context.browser.new_context();other=fresh.new_page();other.goto(url+'?workspaceLab=0');other.wait_for_function('() => window.VibeMolAppearanceLooks')
        try:
            other.locator('#lookFileInput').set_input_files({'name':'basic.look.json','mimeType':'application/json','buffer':json.dumps(document).encode()})
            other.wait_for_function('() => VibeMolAppearanceLooks.snapshot().saved.length===1')
            assert rendering(other)==recipe
            assert other.evaluate('async saved => VibeMolSession.import(saved)',saved)['ok']
            assert rendering(other)==recipe and p.cubes(other)==layer_state
            assert all(mat['emissiveIntensity']==emission for mat in other.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()'))
        finally:fresh.close()
    # Basic is a permanent shared material option and restores all three targets.
    editor(page)
    assert page.locator('#appearanceMaterialPreset').input_value()=='basic'
    assert page.locator('#appearanceMaterialScope').inner_text()=='One material for atoms, bonds, and surfaces.'
    assert not page.locator('#appearanceUseSurfaceMaterial').is_visible()
    material_menu = page.locator('#appearanceMaterialPreset')
    for name in ['gel', 'matte']:
        material_menu.select_option(name)
        changed = rendering(page)
        assert material_menu.locator('option[value="basic"]').inner_text() == 'Basic'
        assert material_menu.locator('option[value="custom"]').inner_text() == 'Custom'
        material_menu.select_option('basic')
        assert rendering(page) == original
        assert state(page)['settings']['surface.materialPreset'] == 'emissive'
        assert [mat['geometryId'] for mat in page.evaluate('VibeMolTesting.getSurfaceMaterialSnapshot()')] == ids
        assert pristine(page)
        assert all(mat['emissiveIntensity']==0.36 for mat in page.evaluate('VibeMolTesting.getSurfaceMaterialSnapshot()'))
        assert page.evaluate('VibeMolTesting.getLookMaterialSnapshot("atoms")') == atoms
        assert page.evaluate('VibeMolTesting.getLookMaterialSnapshot("bonds")') == bonds
        page.locator('#lookUndo').click()
        assert rendering(page) == changed
        material_menu.select_option('basic')
    # Old personal materials remain importable; Undo restores Luminous.
    polished={'kind':'vibemol.material','version':1,'name':'Saved polished','material':historical['material']}
    page.locator('#materialFile').set_input_files({'name':'polished.material.json','mimeType':'application/json','buffer':json.dumps(polished).encode()})
    page.wait_for_function('() => JSON.parse(localStorage.getItem("vibemol.materials.v1") || "[]").length===1')
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
    assert all(layer['material']==original['material'] for layer in p.cubes(page))
    print('[looks] shared Luminous Basic on all targets, menu/revert/undo, historical compatibility, sessions, and deferred orbitals: passed',flush=True)


def bond_colors_and_preset_controls(page, context, url):
    assert p.load(page,[{'name':'bond.xyz','text':'2\nBond fixture\nN 0 0 0\nH 1.02 0 0\n'}])['ok']
    editor(page)
    assert page.locator('#appearanceBondColorMode').evaluate('el=>el.closest("section").id')=='appearanceBondsSection'
    assert page.locator('#appearancePalette').evaluate('el=>el.closest("section").id')=='appearanceAtomsSection'
    scalar_controls={
      'geometry':{'atomScaleMain':'AtomSize','atomScaleTransitionMetal':'MetalSize','bondRadius':'BondRadius','kitCollarRadius':'CollarRadius',
                  'sphereWidthSegments':'SphereSegments','sphereHeightSegments':'SphereRings','bondRadialSegments':'BondSegments','bondHeightSegments':'BondRings'},
      'material':{'roughness':'MaterialRoughness','shininess':'MaterialShininess','specularIntensity':'MaterialHighlight','metalness':'MaterialMetalness',
                  'clearcoat':'MaterialClearcoat','clearcoatRoughness':'MaterialCoatRoughness','envMapIntensity':'MaterialEnvironment',
                  'reflectivity':'MaterialReflectivity','emissiveIntensity':'MaterialEmission','emissiveScale':'MaterialEmissionScale',
                  'emissiveMix':'MaterialEmissionMix','iridescence':'MaterialIridescence'},
      'lighting':{'dirIntensity':'LightdirIntensity','hemiIntensity':'LighthemiIntensity','rimIntensity':'LightrimIntensity','ambIntensity':'LightambIntensity','exposure':'Lightexposure'},
      'effects':{'outlineWidth':'Contours','atomOutlineFraction':'AtomContours','bondOutlineFraction':'BondContours'},
    }
    for preset in ['basic','toon','kit','classic','porcelain','ink','opal']:
        page.locator('#lookPreset').select_option(preset)
        page.locator('#looksPanel details').evaluate_all('els=>els.forEach(el=>el.open=true)')
        before=rendering(page)
        for section,fields in scalar_controls.items():
            for key,suffix in fields.items():
                control=page.locator('#appearance'+suffix)
                if not control.is_visible(): continue # Inactive material models / connector types.
                precision=int(control.locator('..').get_attribute('data-precision'))
                assert math.isclose(float(control.input_value()),before[section][key],abs_tol=0.51*10**(-precision)),(preset,section,key,control.input_value(),before[section][key])
        for z,radius in before['geometry']['atomRadii'].items():
            page.locator('#appearanceRadiusElement').select_option(z)
            assert math.isclose(float(page.locator('#appearanceElementRadius').input_value()),radius,abs_tol=0.0005)
        if before['material']['model']=='toon':
            for i,tone in enumerate(before['material']['toonSteps']): assert int(page.locator('#appearanceToonTone'+str(i)).input_value())==tone
        if before['material']['model']=='physical':
            for i,thickness in enumerate(before['material']['iridescenceThicknessRange']): assert float(page.locator('#appearancePearlThickness'+str(i)).input_value())==thickness
        for key,name in [('dirPos','Light'),('rimPos','Rim')]:
            for axis,coordinate in enumerate('XYZ'):
                assert math.isclose(float(page.locator('#appearance'+name+'Position'+coordinate).input_value()),before['lighting'][key][axis],abs_tol=0.0051)
        assert rendering(page)==before,'opening controls must not rewrite preset values'
        carriers=page.evaluate('() => VibeMolTesting.getBondCarrierSnapshots()')
        assert len(carriers)==1 and carriers[0]['isMesh'] and len(carriers[0]['meshes'])==1,(preset,carriers)
        page.locator('#appearanceBondColorMode').select_option('uniform')
        value(page,'appearanceBondColor','#d426a8')
        carriers=page.evaluate('() => VibeMolTesting.getBondCarrierSnapshots()')
        assert len(carriers[0]['meshes'])==1 and not carriers[0]['meshes'][0]['hasColors']
        assert carriers[0]['meshes'][0]['color']=='d426a8'
        page.locator('#lookUndo').click()
        assert rendering(page)['coloring']['bondColor']==before['coloring']['bondColor']

    page.locator('#lookPreset').select_option('kit')
    page.locator('#appearanceBondColorMode').select_option('element')
    page.locator('#styleStudioClose').click()
    page.locator('#modeEditBtn').click()
    page.evaluate('() => VibeMolTesting.setEditSelectionIndices([0,1])')
    cue=page.locator('#editSelectionTranslateCueButton');cue.wait_for(state='visible')
    box=cue.bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
    before=page.evaluate('() => VibeMolTesting.getBondCarrierSnapshots()')[0]['meshes'][0]
    page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+40,y+24,steps=5)
    page.wait_for_function('(id)=>VibeMolTesting.getBondCarrierSnapshots()[0]?.meshes[0]?.geometryId!==id',arg=before['geometryId'])
    after=page.evaluate('() => VibeMolTesting.getBondCarrierSnapshots()')[0]['meshes'][0]
    assert after['hasColors'] and after['firstColor']==before['firstColor'],after
    page.mouse.up();page.locator('#modeDisplayBtn').click()

    # Every new control edits the canonical object, with one appearance undo.
    editor(page)
    page.locator('#lookPreset').select_option('opal')
    before=rendering(page);value(page,'appearanceLightPositionX',-4.2)
    assert rendering(page)['lighting']['dirPos']==[-4.2,5,7]
    page.locator('#lookUndo').click();assert rendering(page)==before
    for control,section,key,new_value in [('appearanceMetalSize','geometry','atomScaleTransitionMetal',1.4),
       ('appearanceMaterialEmissionScale','material','emissiveScale',0.3),('appearanceMaterialEmissionMix','material','emissiveMix',0.2),
       ('appearanceBondSegments','geometry','bondRadialSegments',48)]:
        before=rendering(page)
        value(page,control,new_value)
        assert rendering(page)[section][key]==new_value
        if control=='appearanceMetalSize': assert rendering(page)['geometry']['atomScaleMain']==before['geometry']['atomScaleMain']
        page.locator('#lookUndo').click();assert rendering(page)==before
    page.locator('#appearanceRadiusElement').select_option('6');value(page,'appearanceElementRadius',0.51)
    assert rendering(page)['geometry']['atomRadii']['6']==0.51
    page.locator('#appearanceRadiusReset').click();assert '6' not in rendering(page)['geometry']['atomRadii']
    page.locator('#lookUndo').click();assert rendering(page)['geometry']['atomRadii']['6']==0.51
    page.locator('#lookPreset').select_option('toon');value(page,'appearanceToonTone1',91)
    assert rendering(page)['material']['toonSteps'][1]==91
    value(page,'appearanceBondContours',0.12);assert rendering(page)['effects']['bondOutlineFraction']==0.12
    assert rendering(page)['effects']['atomOutlineFraction']==0.08
    page.locator('#lookPreset').select_option('basic')
    assert not page.locator('#appearanceUseSurfaceMaterial').is_visible()
    legacy=json.loads((p.ROOT/'docs/experiments/style-lab/basic-materials/recipes.json').read_text())['referenceSettings']['appearance.rendering']
    page.evaluate('saved=>VibeMolAppearanceLooks.edit("material",saved.material,{replace:true,restoreSurfaceMaterial:saved.surfaceMaterial})',legacy)
    surface=rendering(page)['surfaceMaterial'];page.locator('#appearanceUseSurfaceMaterial').click()
    assert rendering(page)['surfaceMaterial'] is None and rendering(page)['material']==surface
    page.locator('#lookUndo').click();assert rendering(page)['surfaceMaterial']==surface
    # Uniform colors also apply to solid and dashed metal connectors.
    assert p.load(page,[{'name':'metal.xyz','text':'4\nCoordination\nFe 0 0 0\nN 2.0 0 0\nN 0 2.6 0\nH 3.01 0 0\n'}])['ok']
    page.locator('#appearanceBondColorMode').select_option('uniform');value(page,'appearanceBondColor','#b02fd1')
    mats=page.evaluate('() => VibeMolTesting.getLookMaterialSnapshot("bonds")')
    assert mats and all(mat['color']=='b02fd1' for mat in mats),mats
    saved=page.evaluate('() => VibeMolSession.export()')
    page.locator('#lookPreset').select_option('kit')
    result=page.evaluate('(saved) => VibeMolSession.import(saved)',saved);assert result['ok'],result
    assert rendering(page)['coloring']=={'palette':'basic','elementBonds':False,'bondColor':'#b02fd1'}
    print('[looks] seamless bonds, uniform/element colors, Kit live edits, preset control values, advanced edits, undo, and sessions: passed',flush=True)


def bond_sphere_fit(page, context, url):
    def fixture(order):
        assert p.load(page,[{'name':'fit.xyz','text':'2\nBond fit\nC -0.64 -0.2 -0.1\nN 0.64 0.2 0.1\n'}])['ok']
        doc=page.evaluate('() => VibeMolStructure.exportActive()')
        left,right=[atom['id'] for atom in doc['volume']['atoms']]
        doc['volume']['bonds']=[{'a':left,'b':right,'order':order,'kind':'normal','origin':'explicit'}]
        result=p.load(page,[{'name':'fit.structure.json','text':json.dumps(doc)}]);assert result['ok'],result

    def check(order):
        bonds=page.evaluate('() => VibeMolTesting.getBondCarrierSnapshots({capFit:true})')
        assert len(bonds)==order,(order,bonds)
        for bond in bonds:
            fit=bond['fit'];assert fit and 0<bond['radius']<=fit['maxRadius']+1e-12
            if bond['capDistances']:
                assert bond['capDistances'][0]<=fit['fitA']+2e-6,bond
                assert bond['capDistances'][1]<=fit['fitB']+2e-6,bond
            if bond['connectorStyle']!='kitCurved':
                for key in ['A','B']:
                    assert math.hypot(bond['trim'+key],bond['offset']+fit['rimRadius'])<=fit['fit'+key]+1e-9,bond
        return bonds

    for order in [2,3,4]:
        fixture(order)
        for preset in ['basic','toon','classic','porcelain','ink','opal','kit']:
            page.evaluate('id=>VibeMolAppearanceLooks.apply(id,{includeColors:true})',preset)
            check(order)
            # Actual meshes fit after extreme thickness, size, and detail changes.
            page.evaluate('() => VibeMolAppearanceLooks.edit("geometry",{bondRadius:0.4,atomScaleMain:0.1,sphereWidthSegments:7,sphereHeightSegments:5})')
            value(page,'moleculeBondRadiusScale',1.6)
            bonds=check(order)
            assert all(bond['radius']<0.1 for bond in bonds)
            assert rendering(page)['geometry']['bondRadius']==0.4,'portable requested size survives per-bond fitting'
            if preset=='kit':
                page.evaluate('() => VibeMolAppearanceLooks.edit("geometry",{curvedMultipleBonds:false})')
                assert all(b['connectorStyle']=='kit' for b in check(order))
    fixture(2);page.evaluate('() => VibeMolAppearanceLooks.apply("classic",{includeColors:true})')
    original=check(2);saved=page.evaluate('() => VibeMolSession.export()')
    page.evaluate('() => VibeMolAppearanceLooks.edit("geometry",{atomRadii:{6:0.07,7:0.05},bondRadius:0.4})')
    check(2)
    assert page.evaluate('saved=>VibeMolSession.import(saved)',saved)['ok']
    restored=check(2)
    assert [b['radius'] for b in restored]==[b['radius'] for b in original]
    print('[looks] sphere-cap containment, all multiple-bond orders/presets, small atoms, radius caps, Kit toggle and sessions: passed',flush=True)


def hydrogen_bond_restrictions(page, context, url):
    assert p.load(page,[{'name':'hydrogen.xyz','text':'3\nHydrogen test\nH -1 0 0\nC 0.1 0 0\nN 3.5 0 0\n'}])['ok']
    # Legacy structure imports repair multiple/over-coordinated H bonds.
    doc=page.evaluate('() => VibeMolStructure.exportActive()')
    h,c,n=[atom['id'] for atom in doc['volume']['atoms']]
    doc['volume']['bonds']=[{'a':h,'b':c,'order':3,'origin':'explicit'},
                            {'a':h,'b':n,'order':2,'origin':'perceived'}]
    assert p.load(page,[{'name':'hydrogen.structure.json','text':json.dumps(doc)}])['ok']
    topology=page.evaluate('() => VibeMolStructure.exportActive().volume.bonds')
    assert len(topology)==1 and topology[0]['order']==1
    page.locator('#modeEditBtn').click()
    from smoke import find_bond_midpoint_canvas_point, find_atom_click_point
    x,y=find_bond_midpoint_canvas_point(page);page.mouse.click(x,y)
    assert page.evaluate('() => VibeMolStructure.exportActive().volume.bonds')==topology
    assert 'single bond' in page.evaluate('() => VibeMolTesting.getHintMessage()')
    # Growing from a saturated H must not leave an unconnected new atom behind.
    page.evaluate('() => VibeMolTesting.setEditSelectionIndices([])')
    x,y=find_atom_click_point(page,0);page.mouse.move(x,y);page.mouse.down()
    page.mouse.move(x,y-150,steps=12);page.mouse.up()
    structure=page.evaluate('() => VibeMolStructure.exportActive().volume')
    assert len(structure['atoms'])==3 and structure['bonds']==topology
    assert 'one atom' in page.evaluate('() => VibeMolTesting.getHintMessage()')
    saved=page.evaluate('() => VibeMolSession.export()')
    assert page.evaluate('saved=>VibeMolSession.import(saved)',saved)['ok']
    assert page.evaluate('() => VibeMolStructure.exportActive().volume.bonds')==topology
    assert p.load(page,[{'name':'h2.xyz','text':'2\nHydrogen molecule\nH -0.37 0 0\nH 0.37 0 0\n'}])['ok']
    bonds=page.evaluate('() => VibeMolStructure.exportActive().volume.bonds')
    assert len(bonds)==1 and bonds[0]['order']==1
    print('[looks] hydrogen import repair, order cycling, saturated-H growth, sessions and H2: passed',flush=True)


def main():
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True)
        try:
            for run in [reference_ui,reference_persistence,reference_migration,complete_look_tiles,surface_schemes,independent_colors,material_families,surface_opacity_rendering,surface_opacity_controls,shadow_camera_fit,surfaces_cast_and_receive,split_surface_shadows,bond_sphere_fit,hydrogen_bond_restrictions,bond_colors_and_preset_controls,material_color_fill,basic_surface_finish,components_and_saving,surfaces_and_sessions,shared_material_presets]:
                context=browser.new_context(viewport={'width':1200,'height':1000},device_scale_factor=1)
                page=context.new_page();errors=[];console_errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.on('console',lambda message:console_errors.append(message.text) if message.type=='error' else None)
                page.on('dialog',lambda dialog:dialog.dismiss())
                try:
                    page.goto(url+'?workspaceLab=0');page.wait_for_function('() => window.VibeMolAppearanceLooks');run(page,context,url)
                    assert not errors,errors
                except Exception:
                    p.write_failure_artifacts(page,p.ARTIFACTS,'looks-'+run.__name__,errors,console_errors);raise
                finally:context.close()
        finally:browser.close()


if __name__=='__main__':main()
