#!/usr/bin/env python3
"""Legacy surface palette migration, polarity labels, and persistence."""
import json
import premerge as p
from appearance_controls import change


LABELS = {
    'emory': 'Emory (gold + / blue −)', 'national': 'National (red + / navy −)',
    'bright': 'Bright (yellow + / sky −)', 'electron': 'Electron (magenta + / green −)',
    'tableau': 'Tableau (blue + / red −)', 'custom': 'Custom',
}
LEGACY = {'surface.colorScheme': 'classic', 'surface.posColor': '#1f77b4', 'surface.negColor': '#d62728'}


def assert_palette(value, dotted=False):
    prefix = 'surface.' if dotted else ''
    assert [value[prefix + key] for key in ['colorScheme', 'posColor', 'negColor']] == ['tableau', '#1f77b4', '#d62728'], value


def materials(page):
    return [{k: v for k, v in material.items() if k != 'geometryId'}
            for material in page.evaluate('VibeMolTesting.getSurfaceMaterialSnapshot()')]


def check_labels(page):
    for id_ in ['schemeSelect', 'studioSurfaceScheme']:
        options = page.locator('#' + id_ + ' option').evaluate_all('els=>Object.fromEntries(els.filter(el=>el.value).map(el=>[el.value,el.textContent.trim()]))')
        assert options == LABELS, (id_, options)
    assert page.evaluate('''() => {
      const L=VibeMolLooks, classic=L.builtins.find(x=>x.id==='classic');
      return !('classic' in L.surfaceColorSchemes)
        && L.normalizeSurfaceScheme('classic')==='tableau' && L.normalizeSurfaceScheme('national')==='national'
        && L.surfaceColorSchemes.tableau.pos==='#1f77b4' && L.surfaceColorSchemes.tableau.neg==='#d62728'
        && L.colors(classic.settings)['surface.posColor']==='#e60000'
        && L.materialRecipe('classic').material.model==='phong';
    }''')
    for id_ in ['lookPreset', 'lookColorPreset']:
        assert page.locator('#' + id_ + ' option[value=classic]').inner_text() == 'Classic'


def surface_schemes(page, context, url):
    page.goto(url + '?workspaceLab=1&appearanceStudy=1');page.wait_for_function('()=>window.VibeMolWorkbench')
    assert p.load(page, [{'name': 'polarity.cube', 'text': p.hydrogen_2p_cube()}])['ok']
    page.evaluate('VibeMolWorkbench.open("inspector")')
    check_labels(page)
    change(page, 'schemeSelect', 'tableau')
    before = materials(page)
    assert {m['sign'] for m in before} == {'pos', 'neg'}
    saved = page.evaluate('VibeMolSession.export()')
    # Reproduce the old serialized id, retaining the actual layer colors/phase.
    for scene in saved['graph']['scenes']:
        for layer in scene['layers']:
            if layer['kind'] in ['cube', 'arithmetic']: layer['colorScheme'] = 'classic'
    for source in saved['sources']:
        source['recordState']['_sceneGraphLayerState']['colorScheme'] = 'classic'
    assert page.evaluate('saved=>VibeMolSession.import(saved)', saved)['ok']
    assert_palette(p.cubes(page)[0]);assert materials(page) == before
    assert not p.cubes(page)[0]['signFlip']
    assert page.locator('#schemeSelect').input_value() == 'tableau'
    assert page.locator('#schemeSelect').locator('xpath=ancestor::*[contains(@class,"vm-field-row")]').get_attribute('data-style-state') == 'modified'
    exported = page.evaluate('VibeMolSession.export()')
    for source in exported['sources']: assert_palette(source['recordState']['_sceneGraphLayerState'])
    assert page.evaluate('saved=>VibeMolSession.import(saved)', exported)['ok']
    assert_palette(p.cubes(page)[0]);assert materials(page) == before
    change(page, 'schemeSelect', 'national')
    national = p.cubes(page)[0]
    assert [national[key] for key in ['posColor', 'negColor', 'signFlip']] == ['#e60000', '#0033a0', False]
    expected_colors = page.evaluate('''() => ['#e60000','#0033a0'].map(hex=>{
      const c=new THREE.Color(hex); return {r:c.r,g:c.g,b:c.b}; })''')
    assert [m['color'] for m in materials(page)] == expected_colors

    # Look import must normalize before its strict settings validator runs.
    look = page.evaluate('VibeMolLooks.exportLook(VibeMolLooks.builtins.find(x=>x.id==="classic"))')
    for settings in [look['settings'], look['settings']['appearance.look']['settings']]: settings.update(LEGACY)
    assert p.load(page, [{'name': 'inherited.cube', 'text': p.hydrogen_2p_cube()}])['ok']
    result = page.evaluate('look=>VibeMolPreset.import(look,{mode:"strict"})', look)
    assert result['ok'] and not result['warnings'], result
    assert_palette(page.evaluate('VibeMolAppearanceLooks.snapshot().settings'), dotted=True)
    assert_palette(p.cubes(page)[0])
    assert [m['color'] for m in materials(page)] == [m['color'] for m in before]
    exported = page.evaluate('() => {const s=VibeMolAppearanceLooks.snapshot();return VibeMolLooks.exportLook({id:"user-export",name:s.label,settings:s.settings})}')
    assert_palette(exported['settings'], dotted=True)
    assert_palette(exported['settings']['appearance.look']['settings'], dotted=True)

    # Both regular preset layouts, strict and relaxed, reach the same setter.
    for mode in ['strict', 'relaxed']:
        for settings in [LEGACY, {'surface': {key.split('.')[1]: value for key, value in LEGACY.items()}}]:
            preset = {'kind': 'vibemol.preset', 'presetVersion': 1, 'settings': settings}
            result = page.evaluate('args=>VibeMolPreset.import(args.preset,{mode:args.mode})', {'preset': preset, 'mode': mode})
            assert result['ok'] and not result['warnings'], result
            assert_palette(page.evaluate('VibeMolPreset.export().settings'), dotted=True)

    # Browser libraries and startup defaults go through normalizeLook; ordinary
    # appearance autosave goes through the preset reader (Lab skips autosave).
    library_look = look['settings']['appearance.look']
    library_look.update({'id': 'user-legacy-tableau', 'name': 'Legacy blue-positive'})
    presets = {'kind': 'vibemol.preset', 'presetVersion': 1, 'settings': LEGACY}
    cases = [('vibemol.looks.v1', [library_look]), ('vibemol.defaultLook.v1', library_look), ('vibemol.autosavePreset', presets)]
    for key, data in cases:
        fresh = context.browser.new_context(viewport={'width': 1280, 'height': 950})
        other = fresh.new_page();errors = []
        other.on('pageerror', lambda error: errors.append(str(error)))
        try:
            other.add_init_script('localStorage.setItem(' + json.dumps(key) + ',' + json.dumps(json.dumps(data)) + ');')
            other.goto(url);other.wait_for_function('()=>window.VibeMolAppearanceLooks')
            check_labels(other)
            if key == 'vibemol.looks.v1':
                change(other, 'lookColorPreset', 'user-legacy-tableau')
            assert_palette(other.evaluate('VibeMolAppearanceLooks.snapshot().settings'), dotted=True)
            assert p.load(other, [{'name': 'startup.cube', 'text': p.hydrogen_2p_cube()}])['ok']
            assert_palette(p.cubes(other)[0])
            assert [m['color'] for m in materials(other)] == [m['color'] for m in before]
            assert not errors, errors
        finally: fresh.close()
    print('[surface palettes] legacy sessions/Looks/presets/libraries/defaults/autosave, exact labels, rendered polarity and Tableau round-trip: passed', flush=True)


if __name__ == '__main__':
    with p.run_http_server(p.ROOT) as url, p.sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            context = browser.new_context(viewport={'width': 1280, 'height': 950})
            page = context.new_page();errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            surface_schemes(page, context, url)
            assert not errors, errors
        finally: browser.close()
