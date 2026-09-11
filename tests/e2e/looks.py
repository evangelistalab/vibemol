#!/usr/bin/env python3
"""Native Looks gallery, scoped orbital finishes, and portable appearance checks.

Use --thumbnails to regenerate the gallery's actual VibeMol renderer previews.
"""
from __future__ import annotations
import base64
import json
import math
import sys
from pathlib import Path
import premerge as p


def state(page):
    return page.evaluate('() => VibeMolAppearanceLooks.snapshot()')


def rendered(page):
    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')


def camera_equal(before, after):
    assert before['mode'] == after['mode']
    for vector in ['camera', 'target', 'up']:
        assert all(math.isclose(before[vector][axis], after[vector][axis], abs_tol=1e-8)
                   for axis in ['x', 'y', 'z']), (before, after)


def open_gallery(page):
    if page.locator('#displayInspectorBtn').get_attribute('aria-expanded') != 'true':
        page.locator('#displayInspectorBtn').click()
    if page.locator('#looksBrowse').get_attribute('aria-expanded') != 'true':
        page.locator('#looksBrowse').click()


def gallery_and_saving(page, context, url):
    assert p.load(page, [{'name':'pyridine.xyz', 'text':(p.ROOT/'assets/fragments/pyridine.xyz').read_text()}])['ok']
    atoms = page.evaluate('() => VibeMolStructure.exportActive().volume.atoms')
    bonds = page.evaluate('() => VibeMolStructure.exportActive().volume.bonds')
    camera = page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
    initial = state(page)['settings']
    open_gallery(page)
    assert page.locator('#lookBuiltins [data-look]').count() == 6
    assert page.locator('#lookBuiltins [data-look]').first.bounding_box()['height'] > 100
    assert page.locator('#lookBuiltins img').evaluate_all('els => els.every(el => el.complete && el.naturalWidth > 0)')
    for name in ['classic', 'porcelain', 'nocturne', 'ink', 'atelier', 'opal']:
        page.locator(f'#lookBuiltins [data-look="{name}"]').click()
        assert state(page)['activeLook']['id'] == name
        assert page.locator('#lookModified').inner_text() != 'Modified'
        assert page.evaluate('() => VibeMolStructure.exportActive().volume.atoms') == atoms
        assert page.evaluate('() => VibeMolStructure.exportActive().volume.bonds') == bonds
        camera_equal(camera, page.evaluate('() => VibeMolTesting.getCameraSnapshot()'))
        materials = page.evaluate('() => VibeMolTesting.getLookMaterialSnapshot()')
        expected = 'MeshPhongMaterial' if name == 'classic' else 'MeshToonMaterial' if name == 'ink' else 'MeshPhysicalMaterial'
        assert materials and all(mat['type'] == expected for mat in materials), (name, materials)
    page.locator('#lookUndo').click()
    assert state(page)['activeLook']['id'] == 'atelier'
    page.locator('[data-look="porcelain"]').click()
    p.set_surface_control(page, '#lookPolish', 0.72)
    assert page.locator('#lookModified').inner_text() == 'Modified'
    assert page.locator('#lookUpdate').is_disabled()
    page.locator('#lookRevert').click()
    assert state(page)['settings']['molecule.material.polish'] == 0.4
    p.set_surface_control(page, '#lookPolish', 0.72)
    page.locator('#lookSave').click()
    page.locator('#lookNameInput').fill('My paper')
    page.locator('#lookNameInput').press('Enter')
    assert len(state(page)['saved']) == 1
    assert page.locator('#lookModified').inner_text() != 'Modified'
    saved = state(page)['settings']
    page.locator('.vm-looks-more summary').click()
    page.locator('#lookRename').click()
    page.locator('#lookNameInput').fill('My figures')
    page.locator('#lookNameConfirm').click()
    assert state(page)['saved'][0]['name'] == 'My figures'
    page.locator('#lookDefault').click()
    page.locator('[data-collection="builtins"]').click()
    page.locator('[data-look="nocturne"]').click()
    second = context.new_page()
    second.goto(url, wait_until='domcontentloaded')
    second.wait_for_function('() => window.VibeMolAppearanceLooks')
    assert state(second)['settings'] == saved, 'Explicit startup default must take precedence over the last draft'
    second.close()
    page.locator('[data-collection="saved"]').click()
    page.locator('#lookSaved [data-look]').click()
    p.set_surface_control(page, '#lookPolish', 0.61)
    page.locator('#lookUpdate').click()
    assert state(page)['saved'][0]['settings']['molecule.material.polish'] == 0.61
    with page.expect_download() as download:
        page.locator('#lookExport').click()
    exported = json.loads(Path(download.value.path()).read_text())
    assert exported['kind'] == 'vibemol.preset' and exported['meta']['lookVersion'] == 1
    assert 'surface.iso' not in exported['settings']
    # A separate context has no named library or defaults: the file is sufficient.
    fresh = context.browser.new_context(viewport={'width':1200, 'height':1000})
    fresh_page = fresh.new_page()
    fresh_page.goto(url, wait_until='domcontentloaded')
    fresh_page.wait_for_function('() => window.VibeMolAppearanceLooks')
    fresh_page.locator('#lookFileInput').set_input_files({'name':'paper.look.json', 'mimeType':'application/json', 'buffer':json.dumps(exported).encode()})
    fresh_page.wait_for_function('() => VibeMolAppearanceLooks.snapshot().saved.length === 1')
    assert state(fresh_page)['settings'] == state(page)['settings']
    before = state(fresh_page)
    bad = dict(exported, meta={'lookVersion':99})
    fresh_page.locator('#lookFileInput').set_input_files({'name':'bad.json', 'mimeType':'application/json', 'buffer':json.dumps(bad).encode()})
    fresh_page.wait_for_function('() => document.getElementById("lookStatus").textContent.includes("Choose a VibeMol look")')
    assert state(fresh_page) == before
    fresh.close()
    page.locator('#lookClearDefault').click()
    p.set_surface_control(page, '#lookPolish', 0.44)
    page.wait_for_function('''() => JSON.parse(localStorage.getItem('vibemol.autosavePreset')).settings['molecule.material.polish'] === 0.44''')
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('() => window.VibeMolAppearanceLooks')
    assert state(page)['settings']['molecule.material.polish'] == 0.44
    assert state(page)['saved'][0]['settings']['molecule.material.polish'] == 0.61
    open_gallery(page)
    assert page.locator('#lookModified').inner_text() == 'Modified'
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    print('[looks] gallery, materials, saved/modified/default/import/reload behavior: passed', flush=True)


def orbital_scope_and_sessions(page, context, url):
    assert p.load(page, [{'name':'orbitals.molden','text':p.MOLDEN}])['ok']
    before = p.cubes(page)
    camera = page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
    open_gallery(page)
    page.locator('[data-look="ink"]').click()
    for old, layer in zip(before, p.cubes(page)):
        for key in ['id', 'iso', 'isoPending', 'autoIso', 'visible', 'signFlip', 'renderMode']:
            assert old[key] == layer[key], (key, old, layer)
    assert page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot().length') == 0, 'Looks must not compute deferred MOs'
    page.locator('[data-finish="enamel"]').click()
    assert all(layer['solidPreset'] == 'enamel' for layer in p.cubes(page))
    # Selection alone does not compute an MO. Choose a row via its context focus.
    layer_id = before[1]['id']
    page.locator(f'.vm-outliner-row[data-id="{layer_id}"]').click()
    page.locator('#lookFinishScope').select_option('selected')
    page.locator('[data-finish="satin"]').click()
    assert [layer['solidPreset'] for layer in p.cubes(page)] == ['enamel','satin','enamel']
    assert all(layer['isoPending'] == old['isoPending'] for old, layer in zip(before, p.cubes(page)))
    page.locator('#lookUndo').click()
    assert all(layer['solidPreset'] == 'enamel' for layer in p.cubes(page))
    camera_equal(camera, page.evaluate('() => VibeMolTesting.getCameraSnapshot()'))
    saved = page.evaluate('async () => VibeMolSession.export()')
    exact = state(page)
    other = context.browser.new_context(viewport={'width':1200,'height':1000})
    target = other.new_page(); target.goto(url,wait_until='domcontentloaded')
    target.wait_for_function('() => window.VibeMolAppearanceLooks')
    assert target.evaluate('async saved => VibeMolSession.import(saved)', saved)['ok']
    assert state(target)['settings'] == exact['settings']
    assert state(target)['activeLook'] == exact['activeLook']
    assert p.cubes(target) == p.cubes(page)
    other.close()
    # Concrete surfaces use independent finishes, and remain opaque/transparent as chosen.
    assert p.load(page, [{'name':'two-lobes.cube','text':p.hydrogen_2p_cube()}])['ok']
    page.evaluate('() => VibeMolAppearanceLooks.apply("ink")')
    page.locator('[data-finish="enamel"]').click()
    materials = page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')
    assert len(materials) == 2 and all(mat['type'] == 'MeshPhysicalMaterial' and mat['surfaceMaterialPreset'] == 'enamel' for mat in materials)
    assert state(page)['settings']['molecule.material.finish'] == 'toon'
    print('[looks] deferred/group/selected orbitals, independent shading, and portable sessions: passed', flush=True)


def thumbnails(page):
    target = p.ROOT/'assets/app/img/looks'; target.mkdir(parents=True, exist_ok=True)
    initial = page.evaluate('() => VibeMolPreset.export()')
    p.load(page, [{'name':'pyridine.xyz','text':(p.ROOT/'assets/fragments/pyridine.xyz').read_text()}])
    page.evaluate('() => VibeMolPreset.import({kind:"vibemol.preset",presetVersion:1,settings:{"global.showAxes":false,"global.showBox":false}})')
    page.wait_for_function('() => VibeMolTesting.getWboitSnapshot().sceneEnvironmentLoaded')
    def capture(filename):
        rendered(page)
        data = page.locator('canvas').first.evaluate('''source => {
            const target = document.createElement('canvas'); target.width = 480; target.height = 320;
            const scale = Math.min(source.width / 480, source.height / 320), w = 480 * scale, h = 320 * scale;
            target.getContext('2d').drawImage(source, (source.width-w)/2, (source.height-h)/2, w, h, 0, 0, 480, 320);
            return target.toDataURL('image/png').split(',')[1];
        }''')
        (target/filename).write_bytes(base64.b64decode(data))
    for name in ['classic','porcelain','nocturne','ink','atelier','opal']:
        page.evaluate('id => VibeMolAppearanceLooks.apply(id)',name); capture(name+'.png')
    page.evaluate('value => VibeMolPreset.import(value)',initial)
    p.load(page,[{'name':'hydrogen-2p.cube','text':p.hydrogen_2p_cube()}])
    page.evaluate('() => VibeMolPreset.import({kind:"vibemol.preset",presetVersion:1,settings:{"surface.iso":0.018,"surface.autoIsoEnabled":false,"global.showAtoms":false,"global.showBonds":false,"global.showAxes":false,"global.showBox":false}})')
    for name in ['emissive','enamel','satin']:
        preset=json.loads((p.ROOT/'docs/experiments/style-lab/presets'/f'orbital-{name}.preset.json').read_text())
        page.evaluate('value => VibeMolPreset.import(value)',preset); capture('finish-'+name+'.png')
    print('[looks] native renderer thumbnails generated',flush=True)


def legacy_toon_scope(page, context, url):
    p.load_cubes(page)
    open_gallery(page)
    page.locator('#appearanceMoleculeStyleGroup [data-value="toon"]').click()
    layers = p.cubes(page)
    for layer in layers:
        row = page.locator(f'.vm-outliner-row[data-id="{layer["id"]}"]')
        if not layer['visible']:
            row.get_by_role('button', name='Show', exact=True).click()
    selected = layers[-1]['id']
    page.locator(f'.vm-outliner-row[data-id="{selected}"]').click()
    page.locator('#lookFinishScope').select_option('selected')
    assert all(mat['type'] == 'MeshToonMaterial' for mat in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()'))

    def check_materials(target):
        materials = target.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')
        assert {mat['sceneLayerId'] for mat in materials} == {layer['id'] for layer in layers}
        assert all(mat['type'] == ('MeshPhysicalMaterial' if mat['sceneLayerId'] == selected else 'MeshToonMaterial') for mat in materials), materials

    page.locator('[data-finish="enamel"]').click()
    check_materials(page)
    page.locator('#lookFinishScope').select_option('group')
    assert page.locator('#lookFinishStatus').inner_text() == 'Mixed finishes'
    page.locator('#lookUndo').click()
    assert all(mat['type'] == 'MeshToonMaterial' for mat in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()'))
    page.locator('#lookFinishScope').select_option('selected')
    page.locator('[data-finish="enamel"]').click()
    saved = page.evaluate('async () => VibeMolSession.export()')
    other = context.browser.new_context()
    try:
        target = other.new_page(); target.goto(url, wait_until='domcontentloaded')
        target.wait_for_function('() => window.VibeMolAppearanceLooks')
        assert target.evaluate('async saved => VibeMolSession.import(saved)', saved)['ok']
        check_materials(target)
        assert p.cubes(target) == p.cubes(page)
    finally:
        other.close()
    page.locator('#appearanceMoleculeStyleGroup [data-value="toon"]').click()
    assert all(not layer['independentMaterial'] for layer in p.cubes(page))
    assert all(mat['type'] == 'MeshToonMaterial' for mat in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()'))
    print('[looks] legacy Toon selected finish, undo, and session restoration: passed', flush=True)


def main():
    with p.run_http_server(p.ROOT) as url, p.sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for run in ([thumbnails] if '--thumbnails' in sys.argv else [gallery_and_saving, orbital_scope_and_sessions, legacy_toon_scope]):
                context = browser.new_context(viewport={'width':1200,'height':1000},device_scale_factor=1)
                page = context.new_page(); errors=[]; console_errors=[]
                page.on('pageerror',lambda error: errors.append(str(error)))
                page.on('console',lambda message:console_errors.append(message.text) if message.type=='error' else None)
                page.on('dialog', lambda dialog: dialog.dismiss())
                if run == thumbnails:
                    placeholder=(p.ROOT/'docs/experiments/style-lab/orbital-enamel.png').read_bytes()
                    page.route('**/assets/app/img/looks/*.png',lambda route:route.fulfill(body=placeholder,content_type='image/png'))
                try:
                    page.goto(url,wait_until='domcontentloaded'); page.wait_for_function('() => window.VibeMolAppearanceLooks')
                    if run == thumbnails: run(page)
                    else: run(page,context,url)
                    assert not errors,errors
                except Exception:
                    p.write_failure_artifacts(page,p.ARTIFACTS,'looks-'+run.__name__,errors,console_errors)
                    raise
                finally: context.close()
        finally: browser.close()


if __name__ == '__main__':
    main()
