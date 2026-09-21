#!/usr/bin/env python3
"""Reference identity, per-axis baselines, persistence, and legacy migration."""
import copy
import json
import premerge as p
from appearance_controls import change


def state(page): return page.evaluate('VibeMolAppearanceLooks.snapshot()')
def ids(page):
    s = state(page)
    return [s[key]['id'] if s[key] else None for key in ['styleRef', 'colorsRef']]
def flags(page):
    s = state(page)
    return [s['styleModified'], s['colorsModified']]
def tile(page, id_): page.locator('.vm-look-card[data-look="' + id_ + '"]').click()
def pure(page, id_):
    assert page.evaluate('id=>VibeMolLooks.equal(VibeMolAppearanceLooks.snapshot().settings,VibeMolLooks.builtins.find(x=>x.id===id).settings)', id_)
def save(page, name):
    page.locator('#lookSave').click();page.locator('#lookNameInput').fill(name);page.locator('#lookNameInput').press('Enter')
    return state(page)['styleRef']['id']


def reference_ui(page, context, url):
    page.goto(url + '?workspaceLab=1');page.wait_for_function('()=>window.VibeMolWorkbench')
    assert p.load(page, [{'name':'sample.cube','text':(p.ROOT/'assets/data/sample.cube').read_text()}])['ok']
    page.evaluate('VibeMolAppearanceLooks.openStudio()')
    style = page.locator('#lookPreset');colors = page.locator('#lookColorPreset');revert = page.locator('#lookRevert')
    pressed = lambda: page.locator('.vm-look-card[aria-pressed=true]').evaluate_all('els=>els.map(el=>el.dataset.look)')
    colors.select_option('basic');style.select_option('classic')
    assert ids(page) == ['classic','basic'] and state(page)['label'] == 'Classic style · Basic colors'
    assert flags(page) == [False,False] and revert.is_disabled() and pressed() == []
    colors.select_option('classic')
    assert state(page)['label'] == 'Classic' and flags(page) == [False,False] and revert.is_disabled()
    pure(page,'classic');assert pressed() == ['classic']
    change(page,'studioShadows',False)
    assert flags(page) == [True,False] and pressed() == ['classic']
    assert page.locator('#lookStyleReset').is_visible() and not page.locator('#lookColorsReset').is_visible()
    assert page.locator('#lookStyleReset').get_attribute('data-tooltip') == 'Discard style edits and return to Classic.'
    assert page.locator('#lookCurrentName').inner_text() == 'Classic' and page.locator('#lookModified').count() == 0
    page.screenshot(path=str(p.ARTIFACTS/'look-refs-classic-edited.png'))
    revert.click();pure(page,'classic');assert ids(page) == ['classic','classic'] and revert.is_disabled()
    change(page,'appearanceBackgroundColor','#123456')
    assert flags(page) == [False,True] and ids(page)[1] == 'classic' and pressed() == ['classic']
    style.select_option('opal')
    assert flags(page) == [False,True] and state(page)['settings']['global.backgroundColor'] == '#123456'
    revert.click();assert flags(page) == [False,False] and ids(page) == ['opal','classic']
    page.screenshot(path=str(p.ARTIFACTS/'look-refs-mixed.png'))
    before = state(page);style.select_option('ink');page.locator('#lookUndo').click();assert state(page) == before
    tile(page,'opal');page.mouse.move(10,10);page.screenshot(path=str(p.ARTIFACTS/'look-refs-opal.png'))
    assert ids(page) == ['opal','opal'] and flags(page) == [False,False]

    # The two reset buttons change only their own half and form one Undo step.
    change(page,'studioShadows',False);change(page,'appearanceBackgroundColor','#123456')
    assert flags(page) == [True,True]
    edited = state(page);page.locator('#lookColorsReset').click()
    assert flags(page) == [True,False] and state(page)['settings']['molecule.feature.shadows'] is False
    page.locator('#lookUndo').click();assert state(page) == edited
    page.locator('#lookStyleReset').click()
    assert flags(page) == [False,True] and state(page)['settings']['global.backgroundColor'] == '#123456'
    revert.click();pure(page,'opal')

    # An Object override never modifies either global baseline, even on Revert.
    page.locator('#inspectorObjectTab').click();change(page,'schemeSelect','tableau');change(page,'opacity',0.42)
    protected = {key:p.cubes(page)[0][key] for key in ['posColor','negColor','colorScheme','opacity','styleOverrides']}
    page.locator('#inspectorLookTab').click();assert flags(page) == [False,False] and revert.is_disabled()
    change(page,'studioShadows',False);revert.click()
    assert {key:p.cubes(page)[0][key] for key in protected} == protected

    # Saving equal colors must not alias their identity back to a built-in.
    tile(page,'basic');alias = save(page,'QA Basic copy')
    assert ids(page) == [alias,alias] and flags(page) == [False,False]
    style.select_option('opal');colors.select_option(alias)
    assert colors.input_value() == alias and state(page)['label'] == 'Opal style · QA Basic copy colors'
    page.locator('#lookSaveDetails').evaluate('el=>el.open=true')
    page.locator('#lookRename').click();page.locator('#lookNameInput').fill('Basic twin');page.locator('#lookNameInput').press('Enter')
    assert ids(page) == ['opal',alias] and state(page)['label'] == 'Opal style · Basic twin colors'
    page.locator('#lookSaved').select_option(alias);change(page,'studioShadows',False)
    assert page.locator('#lookUpdate').is_enabled()
    page.locator('#lookUpdate').click();assert flags(page) == [False,False] and page.locator('#lookUpdate').is_disabled()
    colors.select_option('classic');assert page.locator('#lookUpdate').is_disabled()
    style.select_option('opal');colors.select_option(alias);live = state(page)['settings']
    page.locator('#lookDelete').click()
    assert ids(page) == ['opal',None] and colors.input_value() == ''
    assert state(page)['label'] == 'Opal style · Custom colors' and state(page)['settings'] == live
    assert flags(page) == [False,False] and not page.locator('#lookColorsReset').is_visible()
    style.select_option('classic');page.locator('#lookUndo').click();assert ids(page) == ['opal',None]

    # Filtered-out recipes must still display their real identities.
    page.evaluate('VibeMolAppearanceLooks.apply("nocturne",{includeColors:true})')
    for select in [style,colors]:
        assert select.input_value() == 'nocturne'
        assert select.locator('option:checked').inner_text() == 'Nocturne' and select.locator('option:checked').is_disabled()
    assert flags(page) == [False,False]
    print('[look refs] six requested checks, row resets/Undo, stable aliases, rename/update/delete, nulls, experimental options, Object isolation and screenshots: passed',flush=True)


def reference_persistence(page, context, url):
    page.goto(url+'?workspaceLab=1');page.wait_for_function('()=>window.VibeMolWorkbench')
    assert p.load(page,[{'name':'ref.cube','text':p.hydrogen_2p_cube()}])['ok']
    page.evaluate('VibeMolAppearanceLooks.openStudio()')
    tile(page,'opal');style_id=save(page,'Saved style')
    tile(page,'classic');color_id=save(page,'Saved colors')
    page.locator('#lookPreset').select_option(style_id)
    change(page,'studioShadows',False);before=state(page)
    saved=page.evaluate('VibeMolSession.export()')
    refs=saved['preset']['settings']['appearance.references']
    assert ids(page)==[style_id,color_id] and len(refs['looks'])==2
    assert 'appearance.look' not in saved['preset']['settings']
    for entry in refs['looks']:assert entry['settings']['molecule.feature.shadows'] is True,'persist the reference baseline, not edited live values'
    fresh=context.browser.new_context(viewport={'width':1600,'height':1000});other=fresh.new_page();errors=[]
    other.on('pageerror',lambda e:errors.append(str(e)))
    try:
        other.goto(url+'?workspaceLab=1');other.wait_for_function('()=>window.VibeMolAppearanceLooks')
        assert other.evaluate('saved=>VibeMolSession.import(saved)',saved)['ok']
        after=state(other)
        for key in ['styleRef','colorsRef','styleModified','colorsModified','label','settings']: assert after[key]==before[key],key
        assert after['saved']==[]
        other.evaluate('VibeMolAppearanceLooks.openStudio()')
        for id_ in ['lookPreset','lookColorPreset']:assert other.locator('#'+id_+' option:checked').is_disabled()
        other.locator('#lookRevert').click();assert flags(other)==[False,False] and ids(other)==[style_id,color_id]
        # Explicit nulls are persisted and never re-inferred from identical colors.
        doc=other.evaluate('VibeMolPreset.export()');doc['settings']['appearance.references']={'styleRef':None,'colorsRef':None}
        assert other.evaluate('doc=>VibeMolPreset.import(doc,{mode:"strict"})',doc)['ok']
        assert ids(other)==[None,None] and state(other)['label']=='Custom'
        # Last appearance uses the same new metadata through the ordinary path.
        other.goto(url);other.wait_for_function('()=>window.VibeMolAppearanceLooks')
        assert other.evaluate('doc=>VibeMolPreset.import(doc,{mode:"strict"})',saved['preset'])['ok']
        other.wait_for_function('()=>JSON.parse(localStorage.getItem("vibemol.autosavePreset")||"null")?.settings["appearance.references"]?.styleRef?.kind==="user"')
        other.reload();other.wait_for_function('()=>window.VibeMolAppearanceLooks')
        assert ids(other)==[style_id,color_id] and flags(other)==[True,False]
        # A custom startup default is its own complete, unmodified recipe.
        other.evaluate('VibeMolAppearanceLooks.openStudio()')
        other.locator('#lookSaveDetails').evaluate('el=>el.open=true');other.locator('#lookDefault').click()
        default=other.evaluate('JSON.parse(localStorage.getItem("vibemol.defaultLook.v1"))')
        other.reload();other.wait_for_function('()=>window.VibeMolAppearanceLooks')
        assert ids(other)==[default['id'],default['id']] and flags(other)==[False,False]
        assert state(other)['settings']==before['settings']
        # Updating a saved recipe must not change its previously captured startup
        # default, or make that default claim the updated recipe as its baseline.
        other.evaluate('VibeMolAppearanceLooks.openStudio()')
        user_id=save(other,'Default snapshot')
        other.locator('#lookSaveDetails').evaluate('el=>el.open=true');other.locator('#lookDefault').click()
        default_settings=state(other)['settings']
        change(other,'studioShadows',True);other.locator('#lookUpdate').click()
        other.reload();other.wait_for_function('()=>window.VibeMolAppearanceLooks')
        assert ids(other)[0]==ids(other)[1] and ids(other)[0]!=user_id
        assert flags(other)==[False,False] and state(other)['settings']==default_settings
        assert not errors,errors
    finally:fresh.close()
    # Invalid reference metadata cannot partially replace a working session.
    bad=copy.deepcopy(saved);bad['preset']['settings']['appearance.references']['styleRef']['kind']='invalid'
    before=state(page)
    result=page.evaluate('async saved=>{try{return await VibeMolSession.import(saved)}catch(e){return {ok:false}}}',bad)
    assert not result['ok'] and state(page)==before
    print('[look refs] fresh-browser user baselines, explicit nulls, sessions, last appearance, custom startup default and invalid-file atomicity: passed',flush=True)


def reference_migration(page, context, url):
    page.goto(url+'?workspaceLab=1');page.wait_for_function('()=>window.VibeMolWorkbench')
    assert p.load(page,[{'name':'legacy.cube','text':p.hydrogen_2p_cube()}])['ok']
    page.evaluate('VibeMolAppearanceLooks.openStudio()')
    for style,colors in [('opal','classic'),('classic','classic')]:
        page.evaluate('id=>VibeMolAppearanceLooks.apply(id,{includeColors:true})',style)
        page.evaluate('id=>VibeMolAppearanceLooks.applyColors(id)',colors)
        saved=page.evaluate('VibeMolSession.export()');before=state(page)['settings']
        saved['preset']['settings'].pop('appearance.references')
        # The old file contained a named composite, not its original recipe.
        saved['preset']['settings']['appearance.look']={'id':style,'name':style.capitalize(),'revision':4,'settings':before}
        assert page.evaluate('doc=>VibeMolSession.import(doc)',saved)['ok']
        assert ids(page)==[style,colors] and flags(page)==[False,False] and state(page)['settings']==before
        for mode in ['strict','relaxed']:
            assert page.evaluate('args=>VibeMolPreset.import(args.doc,{mode:args.mode})',{'doc':saved['preset'],'mode':mode})['ok']
            assert ids(page)==[style,colors] and flags(page)==[False,False]
        preset=copy.deepcopy(saved['preset']);preset['settings'].pop('appearance.look')
        assert page.evaluate('doc=>VibeMolPreset.import(doc,{mode:"strict"})',preset)['ok']
        assert ids(page)==[style,colors]
        fresh=context.browser.new_context();other=fresh.new_page()
        try:
            other.add_init_script('localStorage.setItem("vibemol.autosavePreset",'+json.dumps(json.dumps(saved['preset']))+');')
            other.goto(url);other.wait_for_function('()=>window.VibeMolAppearanceLooks')
            assert ids(other)==[style,colors] and flags(other)==[False,False]
        finally:fresh.close()
    print('[look refs] legacy composites, settings-only presets, strict/relaxed imports and old last-appearance migration: passed',flush=True)
