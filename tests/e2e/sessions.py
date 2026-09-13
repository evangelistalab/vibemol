#!/usr/bin/env python3
"""Portable workspace and browser recovery regressions."""
from __future__ import annotations

import copy
import json
import math
import os
import pathlib

from playwright.sync_api import sync_playwright
from helpers import ensure_artifact_dir, run_http_server, write_failure_artifacts
from premerge import cube, MOLDEN, MOLDEN_GRID_OBSERVER, arithmetic, load, snapshot, cubes, context_item, trajectory_text, redraw

ROOT = pathlib.Path(__file__).resolve().parents[2]
ARTIFACTS = ensure_artifact_dir(pathlib.Path(os.environ.get('VIBEMOL_TEST_ARTIFACT_DIR', str(ROOT / 'out' / 'test-artifacts'))))


def export(page):
    return page.evaluate('() => window.VibeMolSession.export()')


def open_session(page, session):
    return page.evaluate('doc => window.VibeMolSession.import(doc)', session)


def assert_close(actual, expected):
    if isinstance(expected, dict):
        assert actual.keys() == expected.keys(), (actual, expected)
        for key in expected: assert_close(actual[key], expected[key])
    elif isinstance(expected, list):
        assert len(actual) == len(expected)
        for a, b in zip(actual, expected): assert_close(a, b)
    elif isinstance(expected, (int, float)) and not isinstance(expected, bool):
        assert math.isclose(actual, expected, rel_tol=1e-9, abs_tol=1e-9), (actual, expected)
    else: assert actual == expected, (actual, expected)


def portable_round_trip(page, dialogs):
    arithmetic(page, dialogs)
    assert load(page, [{'name':'same.cube','text':cube(-1)}, {'name':'same.cube','text':cube(1)}], clear_first=False)['ok']
    orbital = next(layer for layer in cubes(page) if layer['name'] == 'MO 2')
    page.locator(f'.vm-outliner-row[data-id="{orbital["id"]}"]').click()
    assert load(page, [{'name':'short.xyz','text':trajectory_text(3)}, {'name':'long.xyz','text':trajectory_text(5)}], clear_first=False)['ok']
    rows = page.locator('.trajectorySceneRow')
    for i in range(2):
        rows.nth(i).get_by_label('Sync', exact=True).check()
    rows.nth(0).get_by_label('Loop', exact=True).uncheck()
    page.locator('#trajectorySyncMaster input[type=range]').evaluate("el => { el.value='4'; el.dispatchEvent(new Event('input',{bubbles:true})); }")
    page.evaluate("() => window.VibeMolPreset.import({kind:'vibemol.preset',presetVersion:1,settings:{'molecule.style':'kit','view.projection':'orthographic','view.camera.x':7,'view.camera.y':5,'view.camera.z':9}})")
    saved = export(page)
    before = snapshot(page)
    camera_before = page.evaluate('() => window.VibeMolTesting.getCameraSnapshot()')
    assert len(saved['sources']) == 5
    duplicates = [source for source in saved['sources'] if source['name'] == 'same.cube']
    assert len(duplicates) == 2 and duplicates[0]['id'] != duplicates[1]['id']
    molden = next(source for source in saved['sources'] if source['volume'].get('kind') == 'molden')
    buffer = next(buffer for buffer in saved['buffers'] if buffer['id'] == molden['volume']['data']['$array'])
    assert buffer['length'] == 0, 'Molden caches must not be serialized'
    # A fresh page must reconstruct everything from this file alone.
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('() => window.VibeMolSession')
    assert snapshot(page)['scenes'] == []
    result = open_session(page, saved)
    assert result['ok'] and result['sourceCount'] == 5, result
    after = snapshot(page)
    assert before == after, {'before':before,'after':after}
    camera_after = page.evaluate('() => window.VibeMolTesting.getCameraSnapshot()')
    assert_close(camera_after, camera_before)
    restored = export(page)
    assert restored['sources'] == saved['sources']
    assert restored['graph'] == saved['graph']
    assert_close(restored['view'], saved['view'])
    assert page.locator('.trajectorySceneRow').nth(0).locator('.trajectoryFrameReadout').inner_text() == '3/3'
    assert page.locator('.trajectorySceneRow').nth(1).locator('.trajectoryFrameReadout').inner_text() == '5/5'
    assert not restored['graph']['syncMaster'].get('playing', False)
    # Importing another file after restore cannot collide with restored IDs.
    ids = {layer['id'] for scene in before['scenes'] for layer in scene['layers']}
    assert load(page, [{'name':'new.xyz','text':'1\nNew molecule\nN 2 3 4\n'}], clear_first=False)['ok']
    all_ids = [layer['id'] for scene in snapshot(page)['scenes'] for layer in scene['layers']]
    assert len(set(all_ids)) == len(all_ids) and ids.issubset(set(all_ids))


def failed_imports(page, dialogs):
    assert load(page, [{'name':'a.cube','text':cube(0)}])['ok']
    saved = export(page)
    before = snapshot(page)
    for field in ('version','missing','dimensions','corrupt'):
        bad = copy.deepcopy(saved)
        if field == 'version': bad['sessionVersion'] = 999
        if field == 'missing': bad['sources'] = []
        if field == 'dimensions': bad['sources'][0]['volume']['nxyz'] = [10000,10000,10000]
        if field == 'corrupt': bad['buffers'][0]['checksum'] = 'invalid'
        result = page.evaluate('async doc => { try { await VibeMolSession.import(doc); return "accepted"; } catch(e) { return e.message; } }', bad)
        assert result != 'accepted' and 'Invalid session' in result, result
        assert snapshot(page) == before
    mixed = load(page, [{'name':'saved.vibemol-session','text':json.dumps(saved)}, {'name':'other.cube','text':cube(1)}])
    assert not mixed['ok'] and mixed['loadedCount'] == 0
    assert snapshot(page) == before
    assert 'one session file at a time' in dialogs[-1]
    assert load(page, [{'name':'saved.vibemol-session','text':json.dumps(saved)}])['ok']
    assert snapshot(page) == before


def arithmetic_and_lazy_orbitals(page, dialogs):
    arithmetic(page, dialogs)
    layers = cubes(page)
    context_item(page, layers[0]['id'], 'Delete')
    page.locator('.vm-outliner-context-menu__button.is-danger').click()
    parent = next(layer for layer in cubes(page) if layer['kind'] == 'arithmetic')
    context_item(page, parent['id'], 'Rename')
    page.locator('.vm-outliner-row__rename-input').fill('My combination')
    page.locator('.vm-outliner-row__rename-input').press('Enter')
    saved = export(page)
    before = snapshot(page)
    builds_before = page.evaluate('() => window.__moldenGridBuilds.length')
    # Saving itself must not evaluate deleted/unvisited MOs.
    export(page)
    assert page.evaluate('() => window.__moldenGridBuilds.length') == builds_before
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('() => window.VibeMolSession')
    open_session(page, saved)
    assert snapshot(page) == before
    assert page.evaluate('() => window.__moldenGridBuilds.length') == 0, 'Only the saved arithmetic result is visible'
    redraw(page)
    assert not any(layer['name'] == 'MO 1' for layer in cubes(page))
    assert len(cubes(page)) == 4
    # Dependency updates must still reach the child after reopening.
    context_item(page, parent['id'], 'Edit combination...')
    page.locator('.vm-combine-popover__coefficient').nth(1).fill('-1')
    page.locator('.vm-combine-popover__coefficient').nth(1).press('Tab')
    page.locator('.vm-combine-popover__button.is-primary').click()
    page.wait_for_function("() => document.querySelector('.vm-combine-popover').hidden")
    results = page.evaluate('() => window.__arithmeticResults')
    assert len(results) == 2 and all(item['output'] > 0.1 for item in results), results
    assert page.evaluate('() => window.__moldenGridBuilds.map(item=>item.index)') == [1,2]


def vibration_and_topology(page, dialogs):
    xyz = '3\nModes\nC 0 0 0\nO 1.2 0 0\nH -1 0 0\n'
    sidecar = json.dumps({'kind':'vibemol.vibrations','version':1,'units':'angstrom','atomCount':3,
        'atomSymbols':['C','O','H'],'modes':[{'frequencyCm1':245,'displacements':[0.1,0,0,-0.1,0,0,0,0,0]},
                                            {'frequencyCm1':650,'displacements':[0,0.1,0,0,0,0,0,-0.1,0]}]})
    assert load(page, [{'name':'mode.xyz','text':xyz},{'name':'mode.vib.json','text':sidecar}])['ok']
    # Structure transport supplies edited bonds/annotations without altering frame data.
    structure = page.evaluate('() => JSON.parse(VibeMolStructure.exportActiveText())')
    vol = structure['volume']
    first, second, third = [atom['id'] for atom in vol['atoms']]
    vol['bonds'] = [{'id':'bond-explicit','a':first,'b':second,'order':2,'kind':'normal','origin':'explicit','style':'covalent'},
                    {'id':'bond-blocked','a':first,'b':third,'order':1,'kind':'blocked','origin':'explicit','style':'covalent'}]
    vol['annotations']['coordination']['byAtomId'][first] = {'geometryId':'trigonal_planar'}
    page.evaluate('text => VibeMolStructure.importFromText(text)', json.dumps(structure))
    page.evaluate("() => VibeMolPreset.import({kind:'vibemol.preset',presetVersion:1,settings:{'vibration.modeIndex':1,'vibration.amplitude':1.25,'vibration.speed':1.7}})")
    page.locator('#vibrationPlayBtn').evaluate('el=>el.click()')
    page.wait_for_function('() => VibeMolStructure.exportActive().volume.vibration.phase > 0')
    page.locator('#vibrationPlayBtn').evaluate('el=>el.click()')
    saved = export(page)
    active = next(source for source in saved['sources'] if source['id'] == saved['activeSourceId'])
    assert active['volume']['vibration']['phase'] > 0
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('() => window.VibeMolSession')
    open_session(page, saved)
    restored = export(page)
    assert restored['sources'] == saved['sources'], (saved['sources'],restored['sources'])
    assert page.evaluate('() => VibeMolStructure.exportActive().volume.bonds') == vol['bonds']
    page.locator('#vibrationPlayBtn').evaluate('el=>el.click()')
    page.wait_for_function('phase => { const next=VibeMolStructure.exportActive().volume.vibration.phase; return next>0 && Math.abs(next-phase)>1e-8; }',
                           arg=active['volume']['vibration']['phase'])
    page.locator('#vibrationPlayBtn').evaluate('el=>el.click()')
    assert export(page)['sources'] != saved['sources'], 'Vibration remains playable after restore'


def recovery_and_quota(page, dialogs):
    page.wait_for_function('() => VibeMolRecovery.getState().ready')
    assert load(page, [{'name':'recover.cube','text':cube(0)}])['ok']
    assert page.evaluate('() => VibeMolRecovery.flush({force:true})')
    expected = snapshot(page)
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('() => VibeMolRecovery && VibeMolRecovery.getState().pending')
    assert snapshot(page)['scenes'] == [], 'Recovery must be explicit'
    page.locator('#recoverSessionBtn').click()
    page.wait_for_function('() => !VibeMolRecovery.getState().pending')
    assert snapshot(page) == expected
    # Real IndexedDB transaction rollback must retain the previous snapshot.
    page.evaluate("""() => {
      window.__normalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function() { throw new DOMException('Injected quota failure', 'QuotaExceededError'); };
    }""")
    assert not page.evaluate('() => VibeMolRecovery.flush({force:true})')
    assert 'storage is full' in page.locator('#sessionStatus').inner_text()
    page.evaluate('() => { IDBObjectStore.prototype.put = window.__normalPut; }')
    assert page.evaluate('() => VibeMolRecovery.flush({force:true})')
    # Two completed saves exist. Damage the newest and recover the older one.
    page.evaluate("""async () => {
      const db = await new Promise((resolve,reject)=> {const r=indexedDB.open(VibeMolSessionRecovery.DATABASE,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      await new Promise((resolve,reject)=> { const t=db.transaction('snapshots','readwrite');const s=t.objectStore('snapshots');
        const r=s.get('latest');r.onsuccess=()=>s.put({...r.result,text:'broken'},'latest');t.oncomplete=resolve;t.onabort=()=>reject(t.error); });
      db.close();
    }""")
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('() => VibeMolRecovery && VibeMolRecovery.getState().pending')
    page.locator('#recoverSessionBtn').click()
    page.wait_for_function('() => !VibeMolRecovery.getState().pending')
    assert snapshot(page) == expected
    assert 'newest snapshot was damaged' in page.locator('#sessionStatus').inner_text()


def spinor_and_download(page, dialogs):
    field = cube(1).splitlines()[7]
    spinor = cube(-1) + '\n'.join([field, field, field]) + '\n'
    assert load(page, [{'name':'spinor.2ccube','text':spinor}])['ok']
    page.evaluate("() => VibeMolPreset.import({kind:'vibemol.preset',presetVersion:1,settings:{'twoComponent.mode':'alphaBetaPhase','molecule.style':'toon'}})")
    saved = export(page)
    assert saved['sources'][0]['volume']['isTwoComponent']
    before = snapshot(page)
    with page.expect_download() as pending:
        page.locator('#saveSessionBtn').click()
    download = pending.value
    assert download.suggested_filename.endswith('.vibemol-session')
    payload = pathlib.Path(download.path()).read_bytes()
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('() => window.VibeMolSession')
    page.locator('#sessionFileInput').set_input_files({'name':download.suggested_filename,'mimeType':'application/json','buffer':payload})
    page.wait_for_function('() => VibeMolTesting.getSceneGraphSnapshot().scenes.length === 1')
    assert snapshot(page) == before
    assert export(page)['sources'] == saved['sources']
    assert page.locator('#twoComponentModeSelect').input_value() == 'alphaBetaPhase'
    page.screenshot(path=str(ARTIFACTS / 'session-spinor-restored.png'))


def retained_source(page, dialogs):
    for copy_mode in (False, True):
        assert load(page, [{'name':'original.cube','text':cube(0)}])['ok']
        structure = page.evaluate('() => JSON.parse(VibeMolStructure.exportActiveText())')
        structure['name'] = 'Destination'
        page.evaluate('text => VibeMolStructure.importFromText(text)', json.dumps(structure))
        original, destination = snapshot(page)['scenes']
        layer = next(layer for layer in original['layers'] if layer['kind'] == 'cube')
        source_row = page.locator(f'.vm-outliner-row[data-id="{layer["id"]}"]')
        destination_row = page.locator(f'.vm-outliner-row[data-id="{destination["id"]}"]')
        transfer = page.evaluate_handle('new DataTransfer()')
        source_row.dispatch_event('dragstart', {'dataTransfer':transfer})
        destination_row.dispatch_event('dragover', {'dataTransfer':transfer,'shiftKey':copy_mode})
        destination_row.dispatch_event('drop', {'dataTransfer':transfer,'shiftKey':copy_mode})
        transfer.dispose()
        moved_layers = snapshot(page)['scenes'][1]['layers']
        assert len([layer for layer in moved_layers if layer['kind'] == 'cube']) == 2, snapshot(page)
        context_item(page, original['id'], 'Delete scene')
        page.locator('.vm-outliner-context-menu__button.is-danger').click()
        assert len(snapshot(page)['scenes']) == 1
        saved = export(page)
        assert len(saved['sources']) == 2, 'Keep a source referenced by surviving layers'
        before = snapshot(page)
        page.reload(wait_until='domcontentloaded')
        page.wait_for_function('() => window.VibeMolSession')
        open_session(page, saved)
        assert snapshot(page) == before
        redraw(page)
        assert len(snapshot(page)['scenes']) == 1, 'Do not recreate the deleted original scene'


def autosave_and_tab_conflict(page, dialogs):
    page.wait_for_function('() => VibeMolRecovery.getState().ready')
    assert load(page, [{'name':'first.cube','text':cube(0)}])['ok']
    page.wait_for_function('() => VibeMolRecovery.getState().lastSavedAt !== null')
    first_saved_at = page.evaluate('() => VibeMolRecovery.getState().lastSavedAt')
    layer = cubes(page)[0]
    context_item(page, layer['id'], 'Rename')
    page.locator('.vm-outliner-row__rename-input').fill('Autosaved edit')
    page.locator('.vm-outliner-row__rename-input').press('Enter')
    page.wait_for_function('stamp => VibeMolRecovery.getState().lastSavedAt !== stamp', arg=first_saved_at)
    renamed_saved_at = page.evaluate('() => VibeMolRecovery.getState().lastSavedAt')
    before_zoom = export(page)['view']
    canvas = page.locator('#canvas').bounding_box()
    page.mouse.move(canvas['x'] + canvas['width'] * 0.65, canvas['y'] + canvas['height'] * 0.5)
    page.mouse.wheel(0, 180)
    page.wait_for_function('stamp => VibeMolRecovery.getState().lastSavedAt !== stamp', arg=renamed_saved_at)
    zoomed = export(page)['view']
    assert zoomed != before_zoom, 'Camera-only wheel changes must trigger autosave'
    another = page.context.new_page()
    try:
        another.goto(page.url, wait_until='domcontentloaded')
        another.wait_for_function('() => window.VibeMolRecovery && VibeMolRecovery.getState().pending')
        assert another.evaluate('() => VibeMolRecovery.recover()')
        assert cubes(another)[0]['name'] == 'Autosaved edit'
        assert_close(export(another)['view'], zoomed)
        assert another.evaluate('() => VibeMolRecovery.flush({force:true})')
        assert not page.evaluate('() => VibeMolRecovery.flush({force:true})')
        assert 'Another tab updated recovery data' in page.locator('#sessionStatus').inner_text()
    finally: another.close()


def main():
    with run_http_server(ROOT) as url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for run in (portable_round_trip, failed_imports, arithmetic_and_lazy_orbitals, vibration_and_topology,
                        recovery_and_quota, spinor_and_download, retained_source, autosave_and_tab_conflict):
                context = browser.new_context(viewport={'width':1440,'height':1000})
                page = context.new_page()
                errors, console_errors, dialogs = [], [], []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
                page.on('dialog', lambda dialog: (dialogs.append(dialog.message), dialog.dismiss()))
                try:
                    page.goto(url, wait_until='domcontentloaded')
                    page.wait_for_function('() => window.VibeMolSession')
                    run(page, dialogs)
                    assert not errors, errors
                    print(f'[sessions] {run.__name__}: passed', flush=True)
                except Exception:
                    write_failure_artifacts(page, ARTIFACTS, f'sessions-{run.__name__}', errors, console_errors)
                    raise
                finally: context.close()
        finally: browser.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
