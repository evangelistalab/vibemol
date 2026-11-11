#!/usr/bin/env python3
"""Walk the water tutorial through native desktop and mobile controls."""
import json

import premerge as p
from checkpoint_contract import require_phase_counts
from helpers import wait_for_presented_state
from playwright.sync_api import expect


def drag(page, button='left'):
    bounds = page.locator('#canvas').bounding_box()
    x = bounds['x'] + bounds['width'] * .52
    y = bounds['y'] + bounds['height'] * .48
    page.mouse.move(x, y)
    page.mouse.down(button=button)
    page.mouse.move(x + 48, y + 23, steps=5)
    page.mouse.up(button=button)


def check_target(page, selector):
    page.wait_for_function('''selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      const marker = document.querySelector('.vm-tutorial-target')?.getBoundingClientRect();
      return marker && Math.abs(rect.left - marker.left) < 1 && Math.abs(rect.top - marker.top) < 1
        && Math.abs(rect.right - marker.right) < 1 && Math.abs(rect.bottom - marker.bottom) < 1;
    }''', arg=selector)
    expected = {'matches': True, 'shadePassesPointer': True}
    actual = page.locator(selector).evaluate('''element => {
      const rect = element.getBoundingClientRect();
      const marker = document.querySelector('.vm-tutorial-target').getBoundingClientRect();
      return {
        matches: Math.abs(rect.left - marker.left) < 1 && Math.abs(rect.top - marker.top) < 1
          && Math.abs(rect.right - marker.right) < 1 && Math.abs(rect.bottom - marker.bottom) < 1,
        shadePassesPointer: getComputedStyle(document.querySelector('.vm-tutorial-shade')).pointerEvents === 'none',
      };
    }''')
    assert actual == expected, {'selector': selector, 'actual': actual, 'expected': expected}


def panel_control(page, id_, selector):
    control = page.locator(selector)
    if not control.is_visible():
        tab = page.locator('#wb-tab-' + id_)
        if tab.is_visible():
            tab.click()
        else:
            page.locator('#workbenchPanelsBtn').click()
            page.locator(f'#workbenchPanelsMenu [data-window="{id_}"]').click()
    expect(control).to_be_visible()
    return control


def practice_clipboard(page, guide, mobile):
    expect(guide.get_by_role('heading')).to_have_text('Copy and paste XYZ')
    expect(guide.get_by_role('button', name='Skip clipboard practice')).to_be_visible()
    modifier = '⌘' if p.CLIPBOARD_MODIFIER == 'Meta' else 'Ctrl'
    expect(guide.locator('kbd.vm-key-pill')).to_have_text([f'{modifier}+C', f'{modifier}+V'])
    before = p.snapshot(page)
    page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
    if mobile:
        panel_control(page, 'coordsPanel', '#copyXYZ').tap()
    else:
        page.locator('#canvas').focus()
        page.keyboard.press(p.CLIPBOARD_MODIFIER + '+c')
    source_rows = (p.ROOT / 'assets/fragments/water.xyz').read_text().splitlines()[2:]
    expected = '\n'.join(' '.join([symbol, *(f'{float(value):.6f}' for value in coords)])
                         for symbol, *coords in map(str.split, source_rows))
    page.wait_for_function('async expected => (await navigator.clipboard.readText()).trim() === expected', arg=expected)
    actual = page.evaluate('() => navigator.clipboard.readText()').strip()
    assert actual == expected, {'actual': actual, 'expected': expected, 'mobile': mobile}
    scratch = guide.get_by_role('textbox', name='Paste water XYZ here')
    scratch.press(p.CLIPBOARD_MODIFIER + '+v')
    expect(scratch).to_have_value(expected)
    expect(guide.get_by_text('You copied the water’s three XYZ rows', exact=False)).to_be_visible()
    assert p.snapshot(page) == before, {'actual': p.snapshot(page), 'expected': before}
    page.screenshot(path=str(p.ARTIFACTS / ('tutorial-clipboard-mobile.png' if mobile else 'tutorial-clipboard-desktop.png')))
    guide.get_by_role('button', name='Continue', exact=True).click()


def lesson(page, url, mobile):
    page.goto(url)
    page.wait_for_function('() => window.VibeMolWorkbench && VibeMolRecovery.getState().ready')
    if mobile:
        page.evaluate('VibeMolWorkbench.applyLayout({placements:{inspector:"right", viewPanel:"right", coordsPanel:"right"}})')
    else:
        page.evaluate('VibeMolWorkbench.applyLayout({placements:{viewPanel:"right", inspector:"right", coordsPanel:"bottom"},open:["viewPanel","inspector"],activeRight:"inspector"})')
    page.get_by_role('button', name='Try the water tutorial', exact=True).click()
    guide = page.get_by_role('region', name='Tutorial', exact=True)
    expect(guide.get_by_role('heading')).to_have_text('Load water')
    guide.get_by_role('button', name='Load water', exact=True).click()
    expect(guide.get_by_role('heading')).to_have_text('Navigate the view')
    wait_for_presented_state(page, '() => VibeMolTesting.getMoleculeRenderSnapshot().atomCount === 3')
    motion = page.locator('.vm-tutorial-target > span').evaluate('''el => {
      const style = getComputedStyle(el);
      return [style.animationName, style.animationIterationCount];
    }''')
    expected_motion = ['none', '1'] if mobile else ['vm-tutorial-bounce', '2']
    assert motion == expected_motion, {'actual': motion, 'expected': expected_motion, 'mobile': mobile}
    if mobile:
        canvas = page.locator('#canvas').bounding_box()
        x = canvas['x'] + canvas['width'] * .54
        y = canvas['y'] + canvas['height'] * .49
        cdp = page.context.new_cdp_session(page)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x + 30, 'y': y + 17}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        cdp.detach()
        guide.get_by_role('button', name='Continue without panning').tap()
    else:
        drag(page)
        expect(guide.get_by_text('Hold the right mouse button', exact=False)).to_be_visible()
        drag(page, 'right')
    expect(guide.get_by_role('heading')).to_have_text('Reset the camera')
    panel_control(page, 'viewPanel', '#viewReset')
    check_target(page, '#viewReset')
    page.locator('#viewReset').click()

    expect(guide.get_by_role('heading')).to_have_text('Properties · Object')
    if guide.get_by_text('Select the practice molecule', exact=False).is_visible():
        scene = p.snapshot(page)['scenes'][0]
        layer = next(layer for layer in scene['layers'] if layer['kind'] == 'molecule')
        if page.locator('#toolbarShowBtn').is_visible():
            page.locator('#toolbarShowBtn').click()
        page.locator(f'.vm-outliner-row[data-id="{layer["id"]}"]').click()
    if not mobile:
        page.evaluate('''() => {
          VibeMolWorkbench.open('inspector');
          VibeMolWorkbench.place('inspector', 'float');
          VibeMolFloatingPanels.get(document.getElementById('inspector')).moveTo(390, 100);
        }''')
    labels = panel_control(page, 'inspector', '#inspectorShowAtomLabels')
    expect(page.locator('#inspector')).to_have_attribute('data-wb-placement', 'bottom' if mobile else 'float')
    summary = page.locator('.vm-structure-summary')
    expect(summary).to_contain_text('10 electrons')
    expect(summary.locator('sub')).to_have_text('2')
    if mobile:
        expect(guide.get_by_text('Scroll inside Properties', exact=False)).to_be_visible()
        labels.scroll_into_view_if_needed()
    check_target(page, '#inspectorShowAtomLabels')
    labels.set_checked(not labels.is_checked())
    expect(guide.get_by_role('heading')).to_have_text('Properties · Look')
    before = page.evaluate('VibeMolAppearanceLooks.snapshot().settings')
    page.locator('#inspectorLookTab').click()
    if mobile:
        style = page.locator('#lookPreset')
        style.select_option('ink' if style.input_value() != 'ink' else 'basic')
    else:
        page.get_by_role('button', name='Ink preset', exact=True).click()
    expect(guide.get_by_text('Choose Undo', exact=False)).to_be_visible()
    page.locator('#lookUndo').click()
    restored = page.evaluate('VibeMolAppearanceLooks.snapshot().settings')
    assert restored == before, {'actual': restored, 'expected': before, 'mobile': mobile}
    expect(guide.get_by_role('heading')).to_have_text('Read the coordinates')

    units = panel_control(page, 'coordsPanel', '#coordsUnitsBtn')
    expect(page.locator('#coordsPanel')).to_have_attribute('data-wb-placement', 'bottom')
    if not mobile:
        expect(guide.get_by_text('Move or close Properties to reach Coordinates.')).to_be_visible()
        page.locator('#inspectorClose').click()
    check_target(page, '#coordsUnitsBtn')
    expect(page.locator('#coordsContent tr[data-atom-index]')).to_have_count(3)
    units.click()
    expect(guide.get_by_text('Switch the coordinate units back.')).to_be_visible()
    units.click()
    practice_clipboard(page, guide, mobile)
    expect(guide.get_by_role('heading')).to_have_text('Measure a distance')

    page.locator('#modeMeasureBtn').click()
    expect(guide.get_by_text('Select the red oxygen', exact=False)).to_be_visible()
    if mobile:
        point = page.evaluate('VibeMolTesting.projectActiveAtomToClient(0)')
        assert point['visible'], point
        page.touchscreen.tap(point['x'], point['y'])
        guide.get_by_text('Choose atoms from a list').tap()
        guide.get_by_role('button', name='Hydrogen 2').tap()
    else:
        for index in (0, 1):
            point = page.evaluate('index => VibeMolTesting.projectActiveAtomToClient(index)', index)
            assert point['visible'], point
            page.mouse.click(point['x'], point['y'])
    expect(guide.get_by_role('heading')).to_have_text('Distance recorded')
    expect(guide.get_by_text('0.960 Å', exact=False)).to_be_visible()
    measurement = page.evaluate('VibeMolTesting.getMeasurementSnapshot().rows')
    actual = [(row['type'], row['indices'], row['text']) for row in measurement]
    expected = [('distance', [0, 1], '0.960 Å')]
    assert actual == expected, {'actual': actual, 'expected': expected, 'mobile': mobile}
    page.screenshot(path=str(p.ARTIFACTS / ('tutorial-mobile.png' if mobile else 'tutorial-desktop.png')))
    guide.get_by_role('button', name='Finish', exact=True).click()
    expect(guide).to_have_count(0)
    assert page.evaluate('VibeMolTesting.getMeasurementSnapshot().rows') == measurement

    page.locator('#canvas').focus()
    page.keyboard.press('?')
    page.get_by_role('button', name='Start water tutorial', exact=True).click()
    expect(guide.get_by_role('heading')).to_have_text('Load water')
    guide.get_by_role('button', name='Exit tutorial').click()
    expect(guide).to_have_count(0)
    assert page.evaluate('VibeMolTesting.getMeasurementSnapshot().rows') == measurement
    return {'mobile': mobile, 'lookControl': 'style dropdown' if mobile else 'preview tile',
            'lookRestored': restored == before, 'xyzClipboardRows': 3, 'actual': actual, 'expected': expected}


def run(browser, url):
    receipts = []
    for mobile in (False, True):
        viewport = {'width': 390, 'height': 844} if mobile else {'width': 1512, 'height': 950}
        context = browser.new_context(viewport=viewport, has_touch=mobile, is_mobile=mobile,
                                      reduced_motion='reduce' if mobile else 'no-preference')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            receipt = lesson(page, url, mobile)
            assert not errors, errors
            receipts.append(receipt)
            print('[water-tutorial] ' + json.dumps(receipt), flush=True)
        except Exception:
            p.write_failure_artifacts(page, p.ARTIFACTS, 'tutorial-mobile' if mobile else 'tutorial-desktop', errors, [])
            raise
        finally:
            context.close()
    require_phase_counts({'water-tutorial': len(receipts)}, 'tests/e2e/workbench_release.py', 'water-tutorial')


if __name__ == '__main__':
    with p.run_http_server(p.ROOT) as url, p.sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        try:
            run(browser, url)
        finally:
            browser.close()
