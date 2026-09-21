#!/usr/bin/env python3
"""Complete Look tiles versus independent Style and Color scheme menus."""
import math
import premerge as p
from appearance_controls import change


def complete_look_tiles(page, context, url):
    page.goto(url + '?workspaceLab=1&appearanceStudy=1');page.wait_for_function('()=>window.VibeMolWorkbench')
    assert p.load(page, [{'name': 'sample.cube', 'text': (p.ROOT / 'assets/data/sample.cube').read_text()}])['ok']
    page.evaluate('VibeMolAppearanceLooks.openStudio()')
    page.wait_for_function('()=>[...document.querySelectorAll(".vm-look-card img")].every(im=>im.complete&&im.naturalWidth>0)')
    style = page.locator('#lookPreset');colors = page.locator('#lookColorPreset')
    tile = lambda id_: page.locator('.vm-look-card[data-look="' + id_ + '"]')
    settings = lambda: page.evaluate('VibeMolAppearanceLooks.snapshot().settings')
    pressed = lambda: page.locator('.vm-look-card[aria-pressed=true]').evaluate_all('els=>els.map(el=>el.dataset.look)')
    menus = lambda: [style.input_value(), colors.input_value()]
    full = lambda id_: page.evaluate('id=>VibeMolLooks.equal(VibeMolAppearanceLooks.snapshot().settings,VibeMolLooks.builtins.find(x=>x.id===id).settings)', id_)
    geometry = [m['geometryId'] for m in page.evaluate('VibeMolTesting.getSurfaceMaterialSnapshot()')]
    molecule = page.evaluate('VibeMolStructure.exportActive().volume')
    camera = page.evaluate('VibeMolTesting.getCameraSnapshot()')

    # The six checks from the request, using real controls and renderer state.
    colors.select_option('basic');tile('opal').click()
    assert full('opal') and menus() == ['opal', 'opal'] and pressed() == ['opal']
    assert settings()['global.backgroundColor'] == '#171b2b'
    assert page.locator('#lookStatus').inner_text() == 'Opal applied.'
    page.mouse.move(10, 10)
    page.screenshot(path=str(p.ARTIFACTS / 'look-tiles-opal.png'))
    colors.select_option('classic');assert pressed() == []
    tile('opal').click();assert menus() == ['opal', 'opal'] and pressed() == ['opal'] and full('opal')
    palette = page.evaluate('VibeMolLooks.colors(VibeMolAppearanceLooks.snapshot().settings)')
    style.select_option('ink')
    assert menus() == ['ink', 'opal'] and pressed() == []
    assert page.evaluate('VibeMolLooks.colors(VibeMolAppearanceLooks.snapshot().settings)') == palette
    assert page.locator('#lookStatus').inner_text() == 'Ink style applied. Colors kept.'
    before = settings();tile('classic').click();page.locator('#lookUndo').click()
    assert menus() == ['ink', 'opal'] and pressed() == [] and settings() == before
    assert page.locator('label[for=lookPreset]').inner_text() == 'Style'
    assert page.locator('#lookPreset option[value=""]').inner_text() == 'Custom'
    assert page.get_by_text('Tiles apply a complete look. Use Style and Color scheme to mix them.', exact=True).count() == 1
    assert 'Previews show the original combinations' not in page.locator('body').inner_text()
    assert page.locator('#inspectorLook > .vm-properties-scope').inner_text() == 'Style and color scheme apply across the workspace. Object colors and opacity can override them.'

    # Every tile restores its own full combination, without moving the camera,
    # editing scientific data, or remeshing the loaded orbital.
    for id_ in ['basic', 'classic', 'ink', 'kit', 'opal', 'porcelain', 'toon']:
        colors.select_option('basic');tile(id_).click()
        assert full(id_) and menus() == [id_, id_] and pressed() == [id_], (id_, menus(), pressed())
        assert page.locator('#lookStatus').inner_text() == id_.capitalize() + ' applied.'
        assert page.evaluate('VibeMolStructure.exportActive().volume') == molecule
        now = page.evaluate('VibeMolTesting.getCameraSnapshot()')
        # Hovering the inspector can disable orbit controls; framing stays fixed.
        assert now['mode'] == camera['mode']
        for key in ['camera', 'target', 'up']:
            assert all(math.isclose(now[key][axis], camera[key][axis], abs_tol=1e-8) for axis in ['x', 'y', 'z']), key
        assert [m['geometryId'] for m in page.evaluate('VibeMolTesting.getSurfaceMaterialSnapshot()')] == geometry

    # Hover, pressed, and keyboard focus are distinct and do not move tiles.
    tile('opal').click();page.mouse.move(10, 10)
    box = tile('classic').bounding_box();tile('classic').hover()
    css = lambda node: node.evaluate('el=>{const s=getComputedStyle(el);return {border:s.borderColor,width:s.borderWidth,shadow:s.boxShadow}}')
    assert tile('classic').bounding_box() == box and pressed() == ['opal']
    assert css(tile('classic'))['border'] != css(tile('opal'))['border']
    assert css(tile('classic'))['width'] == '1px' and css(tile('classic'))['shadow'] == 'none'
    page.screenshot(path=str(p.ARTIFACTS / 'look-tiles-hover.png'))
    colors.focus();page.keyboard.press('Tab')
    assert tile('basic').evaluate('el=>el===document.activeElement && el.matches(":focus-visible")')
    assert css(tile('basic'))['shadow'] != 'none'
    for _ in range(4): page.keyboard.press('Tab')
    assert tile('opal').evaluate('el=>el===document.activeElement && el.matches(":focus-visible")')
    assert 'inset' in css(tile('opal'))['shadow'] and '3px' in css(tile('opal'))['shadow']
    page.screenshot(path=str(p.ARTIFACTS / 'look-tiles-focus.png'))
    for theme in ['dark', 'light']:
        page.evaluate('theme=>document.documentElement.dataset.theme=theme', theme)
        tile('classic').hover()
        assert css(tile('classic'))['border'] != css(tile('opal'))['border']
        assert tile('classic').bounding_box() == box

    # A selected-layer palette/opacity override survives a complete tile.
    page.locator('#inspectorObjectTab').click()
    change(page, 'schemeSelect', 'tableau');change(page, 'opacity', 0.42)
    protected = p.cubes(page)[0]
    page.locator('#inspectorLookTab').click();tile('classic').click()
    for key in ['colorScheme', 'posColor', 'negColor', 'opacity', 'styleOverrides', 'iso', 'autoIso', 'visible', 'signFlip']:
        assert p.cubes(page)[0][key] == protected[key], key
    assert settings()['surface.colorScheme'] == 'national'
    page.locator('#inspectorObjectTab').click()
    assert page.locator('#schemeSelect').locator('xpath=ancestor::*[contains(@class,"vm-field-row")]').get_attribute('data-style-state') == 'modified'
    page.locator('#inspectorLookTab').click()

    # Saved looks apply their whole saved combination; their entries in the
    # two mixing menus continue to operate independently.
    tile('opal').click();original = settings()
    page.locator('#lookSave').click();page.locator('#lookNameInput').fill('Complete Opal')
    page.locator('#lookNameInput').press('Enter')
    saved = page.evaluate('VibeMolAppearanceLooks.snapshot().saved[0]')
    tile('classic').click();before = settings()
    page.locator('#lookSaved').select_option(saved['id'])
    assert settings() == original and page.locator('#lookStatus').inner_text() == 'Complete Opal applied.'
    assert pressed() == []
    assert p.cubes(page)[0]['styleOverrides'] == protected['styleOverrides']
    page.locator('#lookUndo').click();assert settings() == before and menus() == ['classic', 'classic']
    style.select_option(saved['id']);assert colors.input_value() == 'classic'
    print('[look tiles] six requested checks, all seven complete looks, menu mixing, Undo, saved looks, preserved overrides, hover/focus and screenshots: passed', flush=True)
