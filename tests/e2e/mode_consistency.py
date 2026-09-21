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


def coordinate_row_actions(page):
    page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
    mode(page, 'Display')
    assert p.load(page, [{'name': 'water.xyz', 'text': 'O 0 0 0\nH 0.95 0 0\nH -0.24 0.92 0'}])['ok']
    page.locator('#canvas').focus(); page.keyboard.press('c')
    rows = page.locator('#coordsContent tr[data-atom-index]')
    copy_h = page.locator('#coordsContent [data-atom-index="1"] [data-coords-action="copy"]')
    for name in ['Display', 'Measure']:
        mode(page, name)
        assert page.locator('#coordsContent [data-coords-action="delete"]').count() == 0
        copy_h.click()
        assert page.evaluate('()=>navigator.clipboard.readText()') == 'H 0.950000 0.000000 0.000000'
    # The native keyboard action and clipboard fallback copy just this atom,
    # even when the displayed units are bohr.
    page.locator('#coordsUnitsBtn').click()
    copy_h.focus(); copy_h.press('Enter')
    assert page.evaluate('()=>navigator.clipboard.readText()') == 'H 0.950000 0.000000 0.000000'
    page.evaluate("""()=>{window.__writeText=navigator.clipboard.writeText;
      navigator.clipboard.writeText=async()=>{throw new Error('Unavailable')};} """)
    page.locator('#coordsContent [data-atom-index="2"] [data-coords-action="copy"]').click()
    copied = page.evaluate('()=>navigator.clipboard.readText()')
    assert copied == 'H -0.240000 0.920000 0.000000'
    page.evaluate('()=>{navigator.clipboard.writeText=window.__writeText}')
    page.locator('#coordsUnitsBtn').click()
    # Paste in a fresh window uses the same headerless XYZ contract.
    receiver = page.context.new_page()
    try:
        receiver.goto(page.url); receiver.wait_for_function('()=>window.VibeMolTesting')
        receiver.locator('#canvas').focus(); receiver.keyboard.press(p.CLIPBOARD_MODIFIER + '+v')
        receiver.wait_for_function('()=>VibeMolTesting.getSceneGraphSnapshot().scenes.length===1')
        assert len(receiver.evaluate('()=>VibeMolStructure.exportActive().volume.atoms')) == 1
        atom = receiver.evaluate('()=>VibeMolStructure.exportActive().volume.atoms[0]')
        assert atom['Z'] == 1 and atom['x'] == -0.24 and atom['y'] == 0.92
    finally:
        receiver.close()
    page.bring_to_front()
    mode(page, 'Edit')
    assert page.locator('#coordsContent [data-coords-action="delete"]').count() == 3
    page.locator('#editAddAdjustHydrogens').evaluate("el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}))}")
    page.evaluate('()=>VibeMolTesting.setEditSelectionIndices([0,2])')
    before = page.evaluate('()=>VibeMolStructure.exportActive().volume')
    deleted_id = before['atoms'][1]['id']
    page.locator('#coordsContent [data-atom-index="1"] [data-coords-action="delete"]').click()
    after = page.evaluate('()=>VibeMolStructure.exportActive().volume')
    assert after['atoms'] == [atom for atom in before['atoms'] if atom['id'] != deleted_id]
    assert after['bonds'] == [bond for bond in before['bonds'] if deleted_id not in (bond['a'], bond['b'])]
    assert rows.count() == 2 and page.locator('#editAddAdjustHydrogens').is_checked()
    page.keyboard.press(p.CLIPBOARD_MODIFIER + '+z')
    assert page.evaluate('()=>VibeMolStructure.exportActive().volume.atoms') == before['atoms']
    assert page.evaluate('()=>VibeMolStructure.exportActive().volume.bonds') == before['bonds']
    page.keyboard.press(p.CLIPBOARD_MODIFIER + '+Shift+z')
    assert page.evaluate('()=>VibeMolStructure.exportActive().volume.atoms') == after['atoms']
    page.keyboard.press(p.CLIPBOARD_MODIFIER + '+z')
    # Row actions still fire on the first click when an inline edit is open.
    # Reordering must not make the deletion target a different atom.
    page.locator('#coordsContent [data-atom-index="1"] [data-edit-field="order"]').click()
    page.locator('#coordsContent .coordsCellEditor').fill('3')
    page.locator('#coordsContent [data-atom-index="1"] [data-coords-action="delete"]').click()
    assert page.evaluate('()=>VibeMolStructure.exportActive().volume.atoms') == after['atoms']
    # Enter/Space operate the button, not global edit shortcuts or row activation.
    delete_h = page.locator('#coordsContent [data-atom-index="1"] [data-coords-action="delete"]')
    delete_h.focus(); delete_h.press('Enter')
    assert rows.count() == 1
    delete_o = page.locator('#coordsContent [data-coords-action="delete"]')
    delete_o.focus(); delete_o.press('Space')
    assert page.evaluate('()=>VibeMolStructure.exportActive().volume.atoms.length') == 0
    # Workbench suspends Coordinates when there is no structure to inspect.
    if page.locator('#coordsPanel').is_visible():
        assert rows.count() == 0 and 'No atoms' in page.locator('#coordsContent').inner_text()
    page.keyboard.press(p.CLIPBOARD_MODIFIER + '+z')
    if not page.locator('#coordsPanel').is_visible():
        page.locator('#canvas').focus(); page.keyboard.press('c')
    assert rows.count() == 1
    mode(page, 'Display')
    assert page.locator('#coordsContent [data-coords-action="delete"]').count() == 0
    page.locator('#coordsPanelClose').click()
    print('[modes] per-atom copy/paste, units, delete targeting, inline edit, Undo/Redo and keyboard: passed', flush=True)


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
        context = browser.new_context(viewport={'width': 1200, 'height': 900})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('dialog', lambda dialog: dialog.dismiss())
        try:
            page.goto(url + '?appearanceStudy=1'); page.wait_for_function('()=>window.VibeMolTesting')
            assert page.locator('#toolbar #displayInspector').count() == 1
            assert page.locator('#toolbarModeRow').count() == 1
            assert page.locator('#workbenchBar').count() == 0
            coordinates(page)
            coordinate_row_actions(page)
            orbital_context(page)
            page.goto(url + '?workspaceLab=1'); page.wait_for_function('()=>window.VibeMolTesting')
            coordinate_row_actions(page)
            assert not errors, errors
        except Exception:
            p.write_failure_artifacts(page, p.ARTIFACTS, 'mode-consistency', errors, []); raise
        finally:
            browser.close()


if __name__ == '__main__':
    main()
