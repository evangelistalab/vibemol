#!/usr/bin/env python3
"""Coordinate permissions and orbital context in the original interface."""
import math
import premerge as p
from surface_shadows import settings, settle


def mode(page, name):
    page.locator('#mode' + name + 'Btn').evaluate('el=>el.click()')
    settle(page)


def coordinates(page):
    assert p.load(page, [{'name': 'water.xyz', 'text': 'O 0 0 0\nH 0.95 0 0\nH -0.24 0.92 0'}])['ok']
    mode(page, 'Display')
    page.locator('#canvas').focus(); page.keyboard.press('c')
    assert page.locator('#coordsPanel').is_visible()
    for name in ['Display', 'Measure']:
        mode(page, name)
        assert page.locator('#coordsContent [data-edit-field]').count() == 0
        assert 'Read-only' in page.locator('#coordsFooter').inner_text()
        assert page.locator('#copyXYZ').is_enabled() and page.locator('#downloadXYZ').is_enabled()
    mode(page, 'Edit')
    assert page.locator('#coordsPanel').is_visible()
    assert page.locator('#coordsContent [data-edit-field]').count() == 18
    cell = page.locator('#coordsContent tr[data-atom-index="0"] [data-edit-field="x"]')
    cell.click(); page.locator('#coordsContent .coordsCellEditor').fill('0.125')
    page.locator('#coordsContent .coordsCellEditor').press('Enter')
    assert math.isclose(page.evaluate('()=>VibeMolStructure.exportActive().volume.atoms[0].x'), 0.125)
    cell.click(); page.locator('#coordsContent .coordsCellEditor').fill('9')
    page.locator('#modeMeasureBtn').evaluate('el=>el.click()')
    assert page.locator('#coordsContent .coordsCellEditor').count() == 0
    assert math.isclose(page.evaluate('()=>VibeMolStructure.exportActive().volume.atoms[0].x'), 0.125)
    page.locator('#coordsPanelClose').click()
    print('[modes] coordinate permissions, Edit access, and unfinished-edit cancellation: passed', flush=True)


def orbital_context(page):
    # Both atoms sit inside an opaque isosurface. Measurement still reaches them.
    mode(page, 'Display')
    field = p.cube(0).replace('1 -4 -4 -4', '2 -4 -4 -4', 1).replace('1 1 0 0 0\n', '1 1 0 0 0\n1 1 1.4 0 0\n', 1)
    assert p.load(page, [{'name': 'enclosed.cube', 'text': field}])['ok']
    settings(page, {'surface.autoIsoEnabled': False, 'surface.iso': 0.03, 'surface.opacity': 1})
    settle(page)
    graph = p.snapshot(page)
    materials = page.evaluate('()=>VibeMolTesting.getSurfaceMaterialSnapshot()')
    assert materials and all(item['visible'] for item in materials)
    for name in ['Measure', 'Edit', 'Measure', 'Display']:
        mode(page, name)
        assert p.snapshot(page) == graph
        meshes = page.evaluate('()=>VibeMolTesting.getSurfaceMaterialSnapshot()')
        assert [m['geometryId'] for m in meshes] == [m['geometryId'] for m in materials]
        assert all(m['visible'] == (name != 'Edit') for m in meshes)
    mode(page, 'Measure')
    assert page.evaluate('()=>VibeMolTesting.getSurfaceMaterialSnapshot()') == materials
    for index in [0, 1]:
        point = page.evaluate('i=>VibeMolTesting.projectActiveAtomToClient(i)', index)
        page.mouse.click(point['x'], point['y'])
    page.wait_for_function('()=>VibeMolTesting.getMeasurementSnapshot().labelCount>0')
    assert page.evaluate('()=>VibeMolTesting.getMeasurementSnapshot().atomIndices') == [0, 1]
    assert page.locator('#surfBtn').is_checked()
    page.locator('#surfBtn').evaluate('el=>el.click()')
    mode(page, 'Edit'); mode(page, 'Display')
    assert not page.locator('#surfBtn').is_checked()
    assert page.evaluate('()=>VibeMolTesting.getSurfaceMaterialSnapshot()') == []
    print('[modes] orbital context, physical measurement picking, mesh reuse and visibility preservation: passed', flush=True)


def main():
    with p.run_http_server(p.ROOT) as url, p.sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1200, 'height': 900})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('dialog', lambda dialog: dialog.dismiss())
        try:
            page.goto(url + '?appearanceStudy=1'); page.wait_for_function('()=>window.VibeMolTesting')
            assert page.locator('#toolbar #displayInspector').count() == 1
            assert page.locator('#toolbarModeRow').count() == 1
            assert page.locator('#workbenchBar').count() == 0
            coordinates(page)
            orbital_context(page)
            assert not errors, errors
        except Exception:
            p.write_failure_artifacts(page, p.ARTIFACTS, 'mode-consistency', errors, []); raise
        finally:
            browser.close()


if __name__ == '__main__':
    main()
