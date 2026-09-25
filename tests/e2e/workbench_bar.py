#!/usr/bin/env python3
"""Workbench bar semantics, keyboard navigation, and reachable controls."""
import json
import math
import premerge as p


HARNESS = r'''() => {
  window.__vmqa = {
    errors: [],
    rowByLabel: label => [...document.querySelectorAll('#workbenchPanelsMenu [role="menuitemcheckbox"]')]
      .find(row => row.getAttribute('aria-label') === label),
    snap: () => {
      const bar = document.getElementById('workbenchBar'), tools = bar.querySelector('.wb-tools');
      const visible = el => { const r = el.getBoundingClientRect(); return r.width && r.height && getComputedStyle(el).visibility !== 'hidden'; };
      return {
        mode: document.body.dataset.wbMode, width: innerWidth, scrollWidth: tools.scrollWidth, clientWidth: tools.clientWidth,
        occluded: [...bar.querySelectorAll('button')].filter(visible).filter(b => {
          const r = b.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return b !== hit && !b.contains(hit);
        }).map(b => b.id || b.getAttribute('aria-label')),
        pressed: bar.querySelectorAll('[aria-pressed]').length,
        radios: [...bar.querySelectorAll('[role="radio"]')].map(b => ({id: b.id, checked: b.getAttribute('aria-checked'), tab: b.tabIndex})),
        rows: [...document.querySelectorAll('#workbenchPanelsMenu [role="menuitemcheckbox"]')].filter(b => !b.hidden)
          .map(b => ({id: b.dataset.window, checked: b.getAttribute('aria-checked'), detail: b.querySelector('.wb-panel-location').textContent})),
      };
    },
  };
  addEventListener('error', event => __vmqa.errors.push(event.message));
  addEventListener('unhandledrejection', event => __vmqa.errors.push(String(event.reason)));
}'''


def open_menu(page):
    trigger = page.locator('#workbenchPanelsBtn')
    if trigger.get_attribute('aria-expanded') != 'true':
        trigger.click()
    return page.locator('#workbenchPanelsMenu')


def check_bar(page):
    result = page.evaluate('() => __vmqa.snap()')
    assert result['scrollWidth'] <= result['clientWidth'] + 1, result
    assert not result['occluded'], result
    assert result['pressed'] == 0, result
    assert len(result['radios']) == 3, result
    assert sum(r['checked'] == 'true' for r in result['radios']) == 1, result
    assert sum(r['tab'] == 0 for r in result['radios']) == 1, result
    assert all((r['checked'] == 'true') == (r['tab'] == 0) for r in result['radios']), result
    assert page.locator('#toolbarModeRow').get_attribute('role') == 'radiogroup'
    assert page.locator('.wb-tools button[data-window]').count() == 0
    assert page.locator('.wb-context-tools #workbenchClearMeasurements').count() == 1
    assert page.locator('#themeToggleInput').get_attribute('aria-label') == 'Dark mode'
    assert page.locator('#workbenchQuickActions .tb-quickActionBtn').count()==6
    assert not any(row['id']=='viewInspector' for row in result['rows'])
    assert page.evaluate('''()=> {
      const group=document.getElementById('workbenchQuickActions'), panel=document.getElementById('workbenchPanelsBtn');
      return group.parentElement===panel.parentElement && group.nextElementSibling===panel;
    }''')
    bar=page.locator('#workbenchBar').bounding_box();canvas=page.locator('#canvas').bounding_box()
    assert canvas['y']>=bar['y']+bar['height']-1 and canvas['height']>=200
    return result


def screenshot(page, name):
    page.screenshot(path=str(p.ARTIFACTS / ('workbench-bar-' + name + '.png')), animations='disabled')


def run(page):
    page.wait_for_function('() => VibeMolWorkbench.snapshot().open.includes("inspector") && VibeMolWorkbench.snapshot().open.includes("coordsPanel")')
    # The requested desktop report uses the real demo and the existing dock sizes.
    report = {}
    for mode in ['Display', 'Measure', 'Edit']:
        page.locator('#mode' + mode + 'Btn').click()
        report[mode] = check_bar(page)
        screenshot(page, mode.lower())
    assert page.locator('.wb-tabs .wb-tab[role="tab"]').count() > 0
    assert page.locator('#workbenchArrange').get_attribute('aria-expanded') is None
    for id_ in ['editAdaptiveCleanStructureBtn', 'workbenchClearMeasurements', 'workbenchFocus']:
        assert page.locator('#' + id_).get_attribute('aria-expanded') is None

    # A single Tab stop for modes; arrows change the actual mode, not just focus.
    page.locator('#modeDisplayBtn').click()
    for key, target in [('ArrowRight', 'Measure'), ('ArrowRight', 'Edit'), ('ArrowRight', 'Display'),
                        ('ArrowUp', 'Edit'), ('ArrowDown', 'Display'), ('End', 'Edit'), ('Home', 'Display'), ('ArrowLeft', 'Edit')]:
        page.keyboard.press(key)
        assert page.locator('#mode' + target + 'Btn').evaluate('el => document.activeElement === el')
        assert page.locator('#mode' + target + 'Btn').get_attribute('aria-checked') == 'true'
        check_bar(page)
    page.keyboard.press('Tab')
    assert page.locator('#editAdaptiveAddAtomBtn').evaluate('el => document.activeElement === el')

    # Build exposes expansion. Other commands never acquire toggle styling/state.
    page.keyboard.press('Enter')
    assert page.locator('#editAdaptiveAddAtomBtn').get_attribute('aria-expanded') == 'true'
    assert page.locator('#editAdaptiveAddAtomBtn').get_attribute('aria-haspopup') is None
    assert page.locator('#editAdaptiveAddAtomPopover').get_attribute('role') == 'tabpanel'
    page.locator('#editAdaptiveAddAtomBtn').click()
    assert page.locator('#editAdaptiveAddAtomBtn').get_attribute('aria-expanded') == 'false'

    # Menu navigation, type-ahead, dismissal, and the formerly unreachable Camera.
    trigger = page.locator('#workbenchPanelsBtn')
    trigger.focus(); page.keyboard.press('ArrowDown')
    menu = page.locator('#workbenchPanelsMenu')
    rows = menu.locator('[role="menuitemcheckbox"]:visible')
    assert rows.first.evaluate('el => document.activeElement === el')
    page.keyboard.press('End'); assert rows.last.evaluate('el => document.activeElement === el')
    page.keyboard.press('ArrowDown'); assert rows.first.evaluate('el => document.activeElement === el')
    page.keyboard.press('ArrowUp'); assert rows.last.evaluate('el => document.activeElement === el')
    page.keyboard.press('Home'); page.keyboard.press('c'); page.keyboard.press('a')
    camera = menu.get_by_role('menuitemcheckbox', name='Camera', exact=True)
    assert camera.evaluate('el => document.activeElement === el')
    page.keyboard.press('Enter')
    assert menu.is_hidden()
    open_menu(page)
    assert camera.get_attribute('aria-checked') == 'true'
    assert page.locator('#sidePanel').is_visible()
    assert 'Right' in camera.inner_text()
    screenshot(page, 'panels')
    page.keyboard.press('Escape')
    assert menu.is_hidden() and trigger.evaluate('el => document.activeElement === el')
    assert trigger.get_attribute('aria-expanded') == 'false'
    open_menu(page); page.keyboard.press('Tab')
    assert menu.is_hidden() and page.locator('#workbenchArrange').evaluate('el => document.activeElement === el')
    open_menu(page); page.keyboard.press('Shift+Tab')
    assert menu.is_hidden() and page.locator('#viewAxisZBtn').evaluate('el => document.activeElement === el')
    open_menu(page); page.locator('#canvas').click(position={'x': 30, 'y': 30})
    assert menu.is_hidden()
    page.locator('#workbenchArrange').click()
    assert page.locator('#workbenchArrange').get_attribute('aria-expanded') is None
    page.keyboard.press('Escape')

    # Two open windows sharing a dock remain checked as tabs switch.
    page.locator('#modeDisplayBtn').click()
    page.evaluate('() => VibeMolWorkbench.applyLayout({open:["coordsPanel","inspector"],activeBottom:"coordsPanel",activeRight:"inspector"})')
    page.set_viewport_size({'width': 1024, 'height': 950})
    page.wait_for_function('() => VibeMolWorkbench.snapshot().compact')
    for name in ['Properties', 'Coordinates']:
        page.get_by_role('tab', name=name, exact=True).click()
        assert page.locator('.wb-dock .wb-tab[aria-selected="true"]').count() == 1
        for panel in ['Properties', 'Coordinates']:
            row = open_menu(page).get_by_role('menuitemcheckbox', name=panel, exact=True)
            assert row.get_attribute('aria-checked') == 'true'
            assert 'Bottom' in row.inner_text()
        assert page.locator('#workbenchPanelsCount').inner_text() == '2'
        page.keyboard.press('Escape')
    # An inactive checked row closes its window; dock selection is not a checkbox.
    open_menu(page).get_by_role('menuitemcheckbox', name='Properties', exact=True).click()
    assert 'inspector' not in page.evaluate('() => VibeMolWorkbench.snapshot().open')
    assert menu.is_hidden()
    page.evaluate('() => VibeMolWorkbench.park("coordsPanel")')
    row = open_menu(page).get_by_role('menuitemcheckbox', name='Coordinates', exact=True)
    assert row.get_attribute('aria-checked') == 'false' and 'Minimized' in row.inner_text()
    row.click(); open_menu(page)
    assert row.get_attribute('aria-checked') == 'true'
    assert page.locator('#coordsPanel').is_visible()
    page.keyboard.press('Escape')

    # Real data gates rows exactly as it gated the original launchers.
    page.set_viewport_size({'width': 1512, 'height': 950})
    assert p.load(page, [{'name': 'motion.xyz', 'text': p.trajectory_text(3)}])['ok']
    assert open_menu(page).get_by_role('menuitemcheckbox', name='Trajectory', exact=True).is_visible()
    assert menu.get_by_role('menuitemcheckbox', name='Orbitals', exact=True).count() == 0
    page.keyboard.press('Escape')
    page.locator('#modeEditBtn').click(); report['trajectoryEdit'] = check_bar(page)
    # Analysis panels keep the current rule: suspended while editing.
    assert open_menu(page).get_by_role('menuitemcheckbox', name='Trajectory', exact=True).count() == 0
    page.keyboard.press('Escape')
    page.locator('#modeDisplayBtn').click()
    assert p.load(page, [{'name': 'orbitals.molden', 'text': p.MOLDEN}])['ok']
    assert open_menu(page).get_by_role('menuitemcheckbox', name='Orbitals', exact=True).is_visible()
    page.keyboard.press('Escape')

    # Worst case: every catalog capability available, including future combinations.
    # Temporarily expose every capability through the existing visibility source;
    # mode controllers may still hide the underlying legacy launchers normally.
    page.evaluate('''() => {
      window.__allPanelButtons = VibeMolWorkbenchModel.catalog
        .map(item => VibeMolWorkbenchHost.windows.getEntry(item.id).buttonEl).filter(Boolean);
      for (const button of __allPanelButtons) Object.defineProperty(button, 'hidden', {
        configurable: true, get: () => false, set: value => button.toggleAttribute('hidden', !!value),
      });
    }''')
    widths = [1920, 1512, 1440, 1180, 1050, 1024, 900, 760, 650, 390, 320]
    report['responsive'] = []
    for width in widths:
        page.set_viewport_size({'width': width, 'height': 950})
        for mode in ['Display', 'Measure', 'Edit']:
            page.locator('#mode' + mode + 'Btn').click()
            result = check_bar(page)
            assert len(result['rows']) == (9 if mode == 'Edit' else 7), result
            report['responsive'].append({'width': width, **result})
        if width == 320: screenshot(page, 'mobile-edit')
    page.evaluate('() => { for (const button of __allPanelButtons) delete button.hidden; }')

    page.set_viewport_size({'width': 1512, 'height': 950})
    page.locator('#themeToggleShell').click()
    assert page.locator('#themeToggleInput').is_checked()
    assert page.locator('#themeToggleInput').get_attribute('aria-checked') == 'true'
    check_bar(page); screenshot(page, 'dark')
    page.locator('#workbenchFocus').click(); check_bar(page)
    page.locator('#workbenchFocus').click(); check_bar(page)

    # Existing plain shortcuts still reach the real actions.
    page.locator('#canvas').focus(); page.keyboard.press('m')
    assert page.locator('#modeMeasureBtn').get_attribute('aria-checked') == 'true'
    page.keyboard.press('e')
    assert page.locator('#modeEditBtn').get_attribute('aria-checked') == 'true'
    page.keyboard.press('/')
    assert page.locator('#editAdaptiveAddAtomPopover').is_visible()
    page.locator('#editAdaptiveAddAtomBtn').click()
    page.locator('#canvas').focus(); page.keyboard.press('s')
    assert page.locator('#editAdaptiveSymmetryPopover').is_visible()
    page.locator('#editAdaptiveSymmetryBtn').click()
    page.locator('#canvas').focus(); page.keyboard.press('o')
    page.wait_for_function('() => document.getElementById("hint").textContent.includes("UFF")')
    check_bar(page)
    assert page.evaluate('() => __vmqa.errors') == []
    (p.ARTIFACTS / 'workbench-bar-report.json').write_text(json.dumps(report, indent=2))
    print('[workbench bar] desktop widths: ' + json.dumps({mode: report[mode]['scrollWidth'] for mode in ['Display', 'Measure', 'Edit']}), flush=True)
    print('[workbench bar] roles, keyboard, checkmarks, conditional panels, 11 viewport widths, themes and shortcuts: passed', flush=True)


def quick_actions(page, url):
    page.goto(url+'?appearanceStudy=1')
    page.wait_for_function('()=>window.VibeMolWorkbench')
    assert page.locator('#workbenchQuickActions button:disabled').count()==6
    assert p.load(page,[{'name':'hydrogen.xyz','text':'H 2 3 4\nH 2.4 3.4 4.4'}])['ok']
    for mode in ['Display','Measure','Edit']:
        page.locator('#mode'+mode+'Btn').click()
        page.locator('#canvas').focus();page.keyboard.press('q')
        assert page.locator('#centerMassBtn').evaluate('el=>document.activeElement===el')
        assert page.locator('#viewInspector').is_hidden()
        for axis in 'XYZ':
            page.locator('#viewAxis'+axis+'Btn').click()
            camera=page.evaluate('()=>VibeMolTesting.getCameraSnapshot()')
            distance=math.sqrt(sum((camera['camera'][c]-camera['target'][c])**2 for c in 'xyz'))
            for component in 'xyz':
                delta=camera['camera'][component]-camera['target'][component]
                # OrbitControls offsets pole-aligned views by its small epsilon.
                assert (delta>0 if component==axis.lower() else abs(delta)<distance*1e-5),(mode,axis,camera)
    page.locator('#centerMassBtn').click()
    atoms=page.evaluate('()=>VibeMolStructure.exportActive().volume.atoms')
    assert all(abs(sum(a[axis] for a in atoms))<1e-6 for axis in 'xyz')
    page.locator('#alignInertiaBtn').click()
    atoms=page.evaluate('()=>VibeMolStructure.exportActive().volume.atoms')
    delta=[atoms[0][axis]-atoms[1][axis] for axis in 'xyz']
    assert sum(abs(value)>1e-6 for value in delta)==1
    assert math.isclose(sum(value*value for value in delta),.48,abs_tol=1e-6)
    camera=page.evaluate('()=>VibeMolTesting.getCameraSnapshot().camera')
    page.locator('#pointCameraComBtn').click()
    after=page.evaluate('()=>VibeMolTesting.getCameraSnapshot()')
    assert all(math.isclose(camera[axis],after['camera'][axis],abs_tol=1e-6) for axis in 'xyz')
    page.locator('#workbenchFocus').click();page.locator('#canvas').focus();page.keyboard.press('q')
    assert not page.evaluate('()=>VibeMolWorkbench.snapshot().focus')
    assert page.locator('#centerMassBtn').evaluate('el=>document.activeElement===el')
    page.evaluate('()=>VibeMolWorkbench.preset("analyze")')
    assert 'viewPanel' in page.evaluate('()=>VibeMolWorkbench.snapshot().open')
    assert 'viewInspector' not in page.evaluate('()=>VibeMolWorkbench.snapshot().open')
    # The explicit older interface still has its original Quick actions popup.
    page.goto(url+'?workspaceLab=0&appearanceStudy=1')
    page.wait_for_function('()=>window.VibeMolTesting')
    assert p.load(page,[{'name':'hydrogen.xyz','text':'H 0 0 0\nH .7 0 0'}])['ok']
    page.keyboard.press('q')
    assert page.locator('#viewInspector').is_visible()
    assert page.locator('#viewInspector .tb-quickActionBtn').count()==6
    print('[quick actions] moved commands, geometry/camera behavior, Q, Focus, Analyze and legacy: passed',flush=True)


def main():
    with p.run_http_server(p.ROOT) as url, p.sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1512, 'height': 950})
        page.add_init_script('(' + HARNESS + ')()')
        errors = []; consoles = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: consoles.append(m.text) if m.type == 'error' else None)
        page.on('dialog', lambda d: d.dismiss())
        try:
            page.goto(url + '?workspaceLab=1&workspaceDemo=1')
            page.wait_for_function('() => window.VibeMolWorkbench')
            run(page)
            quick_actions(page,url)
            assert not errors, errors
        except Exception:
            p.write_failure_artifacts(page, p.ARTIFACTS, 'workbench-bar-failure', errors, consoles)
            raise
        finally:
            browser.close()


if __name__ == '__main__':
    main()
