#!/usr/bin/env python3
"""Browser regressions for scene ownership, imports, arithmetic, and export."""
from __future__ import annotations

import math
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile

from playwright.sync_api import expect, sync_playwright
from assertion_contract import numbers_close
from checkpoint_contract import require_phase_counts
from helpers import ensure_artifact_dir, read_app_version, run_http_server, write_failure_artifacts
from step3b_product_apis import step3b_command_cases

ROOT = pathlib.Path(__file__).resolve().parents[2]
ARTIFACTS = ensure_artifact_dir(pathlib.Path(os.environ.get('VIBEMOL_TEST_ARTIFACT_DIR', str(ROOT / 'out' / 'test-artifacts'))))


def cube(shift: float) -> str:
    header = ['Regression fixture', 'Gaussian scalar field', '1 -4 -4 -4', '9 1 0 0', '9 0 1 0', '9 0 0 1', '1 1 0 0 0']
    values = [0.15 * math.exp(-0.8 * ((i - 4 - shift) ** 2 + (j - 4) ** 2 + (k - 4) ** 2))
              for i in range(9) for j in range(9) for k in range(9)]
    return '\n'.join(header + [' '.join(f'{value:.6e}' for value in values)]) + '\n'


def hydrogen_2p_cube() -> str:
    n, step = 41, 0.4
    header = ['Analytic hydrogen 2p', 'Reference rendering; coordinates in bohr', '1 -8 -8 -8',
              f'{n} {step} 0 0', f'{n} 0 {step} 0', f'{n} 0 0 {step}', '1 0 0 0 0']
    axis = [i * step - 8 for i in range(n)]
    values = [z * math.exp(-math.sqrt(x*x + y*y + z*z) / 2) / (4 * math.sqrt(2 * math.pi))
              for x in axis for y in axis for z in axis]
    return '\n'.join(header + [' '.join(f'{value:.7e}' for value in values)]) + '\n'


def snapshot(page):
    return page.evaluate('() => JSON.parse(JSON.stringify(window.VibeMolTesting.getSceneGraphSnapshot()))')


def cubes(page):
    return [layer for scene in snapshot(page)['scenes'] for layer in scene['layers'] if layer['kind'] in ('cube', 'arithmetic')]


def load(page, files, clear_first=True):
    return page.evaluate('async ({files, clearFirst}) => window.VibeMolEmbed.loadFiles(files, {clearFirst})',
                         {'files': files, 'clearFirst': clear_first})


def context_item(page, layer_id, label):
    page.locator(f'.vm-outliner-row[data-id="{layer_id}"]').click(button='right')
    page.locator('.vm-outliner-context-menu__item').filter(has_text=re.compile('^' + re.escape(label) + '$')).click()


def redraw(page):
    # Box visibility is layer-scoped in Properties, so redispatching that control
    # edits the selected layer. Exercise a real redraw without changing settings.
    page.evaluate('() => VibeMolTesting.rebuildScene()')


def load_cubes(page):
    result = load(page, [{'name': 'a.cube', 'text': cube(-1)}, {'name': 'b.cube', 'text': cube(1)}])
    assert result['ok'] and result['loadedCount'] == 2, result


def scene_creation(page, dialogs):
    page.add_init_script('(' + MOLDEN_GRID_OBSERVER + ')()')
    page.reload()
    page.wait_for_function('() => window.VibeMolSession && window.VibeMolTesting')

    def open_add_menu():
        page.locator('#sceneOutlinerAddBtn').click()
        assert page.locator('.vm-outliner-context-menu__item').all_text_contents() == ['Create empty scene', 'From file...']

    def from_files(files):
        page.locator('#modeDisplayBtn').click()
        count = len(snapshot(page)['scenes'])
        open_add_menu()
        with page.expect_file_chooser() as picker:
            page.get_by_role('menuitem', name='From file...', exact=True).click()
        assert {'.xyz', '.cube', '.cub', '.molden'}.issubset(set(picker.value.element.get_attribute('accept').split(',')))
        picker.value.set_files([{'name': name, 'mimeType': 'text/plain', 'buffer': text.encode()} for name, text in files])
        page.wait_for_function('count => VibeMolTesting.getSceneGraphSnapshot().scenes.length === count + 1', arg=count)
        state = snapshot(page)
        return next(scene for scene in state['scenes'] if scene['id'] == state['focusedSceneId'])

    assert snapshot(page)['scenes'] == []
    open_add_menu()
    page.get_by_role('menuitem', name='Create empty scene', exact=True).click()
    first = snapshot(page)['scenes'][0]
    assert page.locator('#modeEditBtn').get_attribute('aria-pressed') == 'true'
    assert page.evaluate('() => VibeMolStructure.exportActive().volume.atoms') == []
    assert {layer['kind'] for layer in first['layers']} == {'molecule', 'orbitals_group'}
    assert first['visible'] and snapshot(page)['focusedSceneId'] == first['id']
    open_add_menu()
    page.get_by_role('menuitem', name='Create empty scene', exact=True).click()
    state = snapshot(page)
    second = next(scene for scene in state['scenes'] if scene['id'] != first['id'])
    assert second['name'] != first['name'] and state['focusedSceneId'] == second['id']

    # A new empty scene is immediately editable, without changing the earlier one.
    canvas = page.locator('#canvas').bounding_box()
    page.mouse.click(canvas['x'] + canvas['width'] * 0.7, canvas['y'] + canvas['height'] * 0.6)
    page.wait_for_function('() => VibeMolStructure.exportActive().volume.atoms.length > 0')
    page.keyboard.press('Enter')
    page.locator('#modeDisplayBtn').click()
    saved = page.evaluate('() => VibeMolSession.export()')
    assert len(saved['sources']) == 2
    assert any(source['volume']['atoms'] == [] for source in saved['sources'])
    before = snapshot(page)
    page.reload()
    page.wait_for_function('() => window.VibeMolSession')
    assert page.evaluate('doc => VibeMolSession.import(doc)', saved)['ok']
    assert snapshot(page) == before, 'Empty scenes survive a complete session round-trip'

    # Repeated structures explicitly create scenes here instead of matching an existing scene.
    xyz = '1\nHydrogen\nH 0 0 0\n'
    xyz_scene = from_files([('hydrogen.xyz', xyz)])
    repeated = from_files([('hydrogen.xyz', xyz)])
    assert repeated['id'] != xyz_scene['id']
    assert page.evaluate('() => VibeMolStructure.exportActive().volume.atoms.length') == 1
    cube_scene = from_files([('a.cube', cube(-1)), ('b.cub', cube(1))])
    assert len([layer for layer in cube_scene['layers'] if layer['kind'] == 'cube']) == 2
    assert len(snapshot(page)['scenes']) == 5

    # The Orbitals group's existing add action still appends layers to that scene.
    group = next(layer for layer in cube_scene['layers'] if layer['kind'] == 'orbitals_group')
    with page.expect_file_chooser() as picker:
        context_item(page, group['id'], 'Add cube file...')
    picker.value.set_files({'name': 'extra.cube', 'mimeType': 'text/plain', 'buffer': cube(0).encode()})
    page.wait_for_function('() => VibeMolTesting.getSceneGraphSnapshot().scenes.flatMap(s=>s.layers).some(l=>l.name==="extra.cube")')
    assert len(snapshot(page)['scenes']) == 5
    assert len(cubes(page)) == 3
    molden_scene = from_files([('hydrogen.molden', MOLDEN)])
    orbitals = [layer for layer in molden_scene['layers'] if layer['kind'] == 'cube']
    assert len(orbitals) == 3 and not any(layer['visible'] for layer in orbitals)
    assert page.evaluate('() => window.__moldenGridBuilds') == []
    assert page.locator('#moldenInspector').is_visible()
    assert {first['id'], second['id']}.issubset({scene['id'] for scene in snapshot(page)['scenes']})

    # Canceling or rejecting a file cannot create a placeholder or erase an existing scene.
    before = snapshot(page)
    open_add_menu()
    with page.expect_file_chooser() as picker:
        page.get_by_role('menuitem', name='From file...', exact=True).click()
    picker.value.set_files([])
    assert snapshot(page) == before
    open_add_menu()
    with page.expect_file_chooser() as picker:
        page.get_by_role('menuitem', name='From file...', exact=True).click()
    previous_dialogs = len(dialogs)
    picker.value.set_files({'name': 'broken.cube', 'mimeType': 'text/plain', 'buffer': b'invalid cube'})
    expect(page.locator('#hint')).to_have_text('broken.cube: Not enough lines for a CUBE file.', timeout=30000)
    assert len(dialogs) == previous_dialogs, dialogs[previous_dialogs:]
    assert snapshot(page) == before


def molecule_styles(page, dialogs):
    page.locator('#modeDisplayBtn').click()
    assert load(page, [{'name': 'bond.xyz', 'text': '2\nStyle fixture\nC 0 0 0\nC 1.34 0 0\n'}])['ok']
    styles = ['basic', 'toon', 'kit']
    assert page.locator('#moleculeStyle option').evaluate_all('els => els.map(el => el.value)') == styles
    assert page.locator('#lookPreset option').evaluate_all('els => els.slice(1).map(el => el.value)') == ['basic','classic','ink','kit','opal','porcelain','toon']
    page.locator('#displayInspectorBtn').click()
    page.locator('#styleStudioBtn').click()
    for style in styles:
        page.locator('#lookPreset').select_option(style)
        assert page.locator('#moleculeStyle').input_value() == style
        rendered = page.evaluate('() => window.VibeMolTesting.getMoleculeRenderSnapshot()')
        assert rendered['atomCount'] == 2 and rendered['bondCarrierCount'] >= 1, rendered
        carriers = page.evaluate('() => window.VibeMolTesting.getBondCarrierSnapshots()')
        expected = ('kit', 'kitCurved') if style == 'kit' else ('basic',)
        assert carriers and all(carrier['connectorStyle'] in expected for carrier in carriers), carriers
        assert page.evaluate('() => window.VibeMolPreset.export().settings["molecule.style"]') == style
    # Number keys must leave the full appearance unchanged, including idle Edit.
    page.locator('#lookPreset').select_option('classic')
    page.locator('#styleStudioClose').click()
    appearance = page.evaluate('() => VibeMolAppearanceLooks.snapshot().settings')
    for mode in ['Display', 'Measure', 'Edit']:
        page.locator('#mode' + mode + 'Btn').click()
        for key in '0123456789':
            page.keyboard.press(key)
            assert page.evaluate('() => VibeMolAppearanceLooks.snapshot().settings') == appearance, (mode, key)
            assert page.locator('#lookPreset').input_value() == 'classic', (mode, key)
    page.locator('#modeDisplayBtn').click()
    assert 'Style:' not in page.locator('#hint').text_content()

    # Saved presets can still name a retired style; the normal fallback must render.
    page.evaluate('''() => window.VibeMolPreset.import({kind:'vibemol.preset', presetVersion:1,
      settings:{'molecule.style':'glossy'}})''')
    assert page.locator('#moleculeStyle').input_value() == 'basic'
    assert page.evaluate('() => window.VibeMolPreset.export().settings["molecule.style"]') == 'basic'
    assert page.evaluate('() => !window.VibeMolPreset.listKeys().includes("molecule.glossyBondRadius")')
    assert page.locator('#rowGlossyBond, #glossyBondRadius').count() == 0

    # Bond-order keys still work in edit mode.
    page.locator('#modeEditBtn').click()
    page.keyboard.press('/')
    page.locator('#editAddQuick button[data-z="6"]').click()
    for key in '1234':
        page.keyboard.press(key)
        assert 'bond order: ' + key in page.evaluate('() => window.VibeMolTesting.getHintMessage()')
        assert page.locator('#moleculeStyle').input_value() == 'basic'


def orbital_reference_presets(page, dialogs):
    assert load(page, [{'name': 'hydrogen-2p.cube', 'text': hydrogen_2p_cube()}])['ok']
    page.evaluate('''() => VibeMolPreset.import({kind:'vibemol.preset',presetVersion:1,settings:{
        'surface.iso':0.023,'surface.autoIsoEnabled':false,'global.showBonds':false,
        'render.dof.enabled':true,'molecule.style':'toon',
        'surface.opacity':0.35,'surface.materialPreset':'lacquer'
    }}, {mode:'strict'})''')
    geometry = page.evaluate('() => VibeMolStructure.exportActive().volume.atoms')
    camera = page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
    layer_before = cubes(page)[0]
    presets = ROOT / 'docs' / 'experiments' / 'style-lab' / 'presets'
    for material in ['enamel', 'emissive', 'satin']:
        preset = json.loads((presets / f'orbital-{material}.preset.json').read_text())
        result = page.evaluate('preset => VibeMolPreset.import(preset, {mode:"strict"})', preset)
        assert result['ok'] and not result['warnings'], result
        layer = cubes(page)[0]
        for key in ['id', 'iso', 'autoIso', 'isoPending', 'visible', 'signFlip']:
            assert layer[key] == layer_before[key], (key, layer)
        assert layer['solidPreset'] == material and layer['opacity'] == 1, (material, layer)
        assert layer['posColor'] == '#ff8000' and layer['negColor'] == '#0066b3'
        materials = page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')
        assert len(materials) == 2
        for mat in materials:
            assert mat['type'] == 'MeshPhysicalMaterial' and mat['surfaceMaterialPreset'] == material
            assert mat['opacity'] == 1 and not mat['transparent'] and mat['depthWrite']
            assert mat['metalness'] == 0 and mat['transmission'] == 0
            if material == 'enamel':
                assert mat['envMapIntensity'] == 0 and mat['roughness'] == 0.28 and mat['emissiveIntensity'] == 0.12
        assert page.evaluate('() => VibeMolStructure.exportActive().volume.atoms') == geometry
        camera_after = page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
        assert camera_after['mode'] == camera['mode']
        for vector in ['camera', 'target', 'up']:
            assert all(math.isclose(camera_after[vector][axis], camera[vector][axis], abs_tol=1e-9)
                       for axis in ['x', 'y', 'z']), (camera, camera_after)
        exported = page.evaluate('() => VibeMolPreset.export().settings')
        assert all(exported[key] == value for key, value in preset['settings'].items())
        assert exported['global.showBonds'] is False and exported['surface.iso'] == 0.023

    # The same material survives a complete session, including ordinary UI changes.
    set_surface_control(page, '#surfaceMaterialPreset', 'enamel')
    saved_layer = cubes(page)[0]
    session = page.evaluate('async () => VibeMolSession.export()')
    set_surface_control(page, '#surfaceMaterialPreset', 'matte')
    assert page.evaluate('async session => VibeMolSession.import(session)', session)['ok']
    assert cubes(page)[0] == saved_layer
    assert all(mat['surfaceMaterialPreset'] == 'enamel'
               for mat in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()'))

    # Turning blur off must also recreate the shared targets needed by transparency.
    set_surface_control(page, '#opacity', '0.5')
    page.locator('#dofToggle').evaluate("el => { el.checked = true; el.dispatchEvent(new Event('change', {bubbles:true})); }")
    page.wait_for_function('''() => {
        const s = VibeMolTesting.getWboitSnapshot();
        return s.targetSize.width > 0 && s.transparentMeshCount === 2;
    }''')
    page.locator('#dofToggle').evaluate("el => { el.checked = false; el.dispatchEvent(new Event('change', {bubbles:true})); }")
    page.wait_for_function('''() => {
        const s = VibeMolTesting.getWboitSnapshot();
        return s.supported ? s.active && s.targetSize.width > 0 : s.fallback;
    }''')
    assert not page.evaluate('() => VibeMolPreset.export().settings["render.dof.enabled"]')

    # Named palettes stage their colors too, without losing other imported values.
    page.evaluate('''() => VibeMolPreset.import({kind:'vibemol.preset',presetVersion:1,settings:{
        'surface.opacity':0.75,'surface.materialPreset':'enamel','surface.colorScheme':'national'
    }}, {mode:'strict'})''')
    layer = cubes(page)[0]
    assert layer['solidPreset'] == 'enamel' and layer['opacity'] == 0.75
    assert layer['colorScheme'] == 'national' and layer['posColor'] == '#e60000' and layer['negColor'] == '#0033a0'
    assert not dialogs, dialogs


def imports(page, dialogs):
    assert load(page, [{'name': 'a.cube', 'text': cube(-1)}])['loadedCount'] == 1
    appended = load(page, [{'name': 'b.cube', 'text': cube(1)}], clear_first=False)
    assert appended == {'ok': True, 'loadedCount': 1, 'loadedNames': ['b.cube']}, appended
    assert [layer['name'] for layer in cubes(page)] == ['a.cube', 'b.cube']
    before = snapshot(page)
    rejected = load(page, [{'name': 'bad.cube', 'text': 'not a cube'}])
    assert not rejected['ok'] and rejected['loadedNames'] == [], rejected
    assert snapshot(page) == before, {'before': before, 'after': snapshot(page)}
    expect(page.locator('#hint')).to_have_text('bad.cube: Not enough lines for a CUBE file.')
    assert not dialogs, dialogs
    # The picker uses exactly the same failure handling and supports partial success.
    page.locator('#fileInput').set_input_files([
        {'name': 'bad.xyz', 'mimeType': 'text/plain', 'buffer': b'3\ninvalid\n'},
        {'name': 'c.cube', 'mimeType': 'text/plain', 'buffer': cube(0).encode()},
    ])
    page.wait_for_function("() => window.VibeMolTesting.getSceneGraphSnapshot().scenes.flatMap(s=>s.layers).filter(l=>l.kind==='cube').length === 3")
    expect(page.locator('#hint')).to_have_text(
        'bad.xyz: Malformed XYZ file: expected 3 atom lines after line 2, but file ended early.', timeout=30000)
    assert not dialogs, dialogs
    # A sidecar alongside a new primary must not divert the batch to a destructive loader.
    sidecar = json.dumps({'kind':'vibemol.vibrations', 'version':1, 'units':'angstrom', 'atomCount':2, 'atomSymbols':['C','C'], 'modes':[{'frequencyCm1':245, 'displacements':[-0.18,0,0,0.18,0,0]}]})
    xyz = '2\nSidecar fixture\nC -0.7 0 0\nC 0.7 0 0\n'
    result = load(page, [{'name': 'sample.vib.json', 'text': sidecar}, {'name': 'sample.xyz', 'text': xyz}], clear_first=False)
    assert result['ok'] and result['loadedCount'] == 2, result
    assert len(cubes(page)) == 3
    assert page.evaluate("() => !!window.VibeMolStructure.exportActive().volume.vibration")


CLIPBOARD_MODIFIER = 'Meta' if sys.platform == 'darwin' else 'Control'


def psi4_frequencies(page, dialogs):
    fixture = ROOT / 'tests' / 'fixtures' / 'psi4-bohr-frequencies.dat'
    page.locator('#fileInput').set_input_files(fixture)
    page.wait_for_function('() => document.querySelectorAll("#vibrationModeTableBody tr[data-mode-index]").length === 6')
    volume = page.evaluate('() => VibeMolStructure.exportActive().volume')
    assert volume['units'] == 'angstrom' and [atom['Z'] for atom in volume['atoms']] == [6, 1, 1, 1]
    assert abs(volume['atoms'][1]['z'] - 1.804854386616 * 0.529177210903) < 1e-6
    assert volume['atoms'][3]['z'] == 0, 'Use the reference geometry, not a finite-difference displacement'
    modes = volume['vibration']['modes']
    assert [mode['frequencyCm1'] for mode in modes] == [1422.9415, 1425.4028, 1425.5502, 3073.0924, 3289.7818, 3290.0800]
    assert [mode['irIntensityKmMol'] for mode in modes] == [7.8126, 18.7514, 18.7323, 0.0002, 91.2878, 91.1759]
    assert all(len(mode['displacements']) == 12 for mode in modes)
    assert abs(modes[0]['displacements'][0] + 0.08) < 1e-6
    if page.locator('#vibrationPanel').get_attribute('aria-hidden') != 'false':
        page.locator('#vibrationPanelBtn').click()
    # Selecting a mode starts playback automatically.
    page.locator('#vibrationModeTableBody tr[data-mode-index="1"]').click()
    page.wait_for_function('''() => {
        const volume = VibeMolStructure.exportActive().volume;
        return volume.vibration.modeIndex === 1 && volume.vibration.phase > 0.1
            && Math.abs(volume.atoms[3].z) > 0.001;
    }''')
    page.locator('#vibrationPlayBtn').click()
    assert page.locator('#vibrationPlayBtn').inner_text() == 'play_arrow'

    # Angstrom logs still import without rescaling, through the shared embedded path.
    text = fixture.read_text().replace('Geometry (in Bohr)', 'Geometry (in Angstrom)')
    assert load(page, [{'name':'angstrom.out', 'text':text}])['ok']
    volume = page.evaluate('() => VibeMolStructure.exportActive().volume')
    assert abs(volume['atoms'][1]['z'] - 1.804854386616) < 1e-6
    assert len(volume['vibration']['modes']) == 6
    assert not dialogs, dialogs

    # Recognized but malformed Psi4 data must not fall through to the CUBE parser.
    before = snapshot(page)
    bad = 'Psi4: An Open-Source Ab Initio Electronic Structure Package\n==> Harmonic Vibrational Analysis <=='
    result = load(page, [{'name':'missing-geometry.dat', 'text':bad}])
    assert not result['ok'] and 'Psi4 integration' in result['error'] and 'Geometry' in result['error'], result
    assert 'CUBE' not in result['error'] and snapshot(page) == before


def cfour_frequencies(page, dialogs):
    fixture = ROOT / 'tests' / 'fixtures' / 'cfour.freq'
    page.locator('#fileInput').set_input_files(fixture)
    rows = page.locator('#vibrationModeTableBody tr[data-mode-index]')
    expect(rows).to_have_count(3)
    volume = page.evaluate('() => VibeMolStructure.exportActive().volume')
    modes = volume['vibration']['modes']
    expected = {
        'units': 'angstrom',
        'atomicNumbers': [8, 1, 1],
        'labels': ['A1', 'A1', 'B2'],
        'frequencies': [1659.6203, 3834.8942, 3958.1028],
        'firstHydrogenY': 1.43 * 0.529177210903,
        'firstModeHydrogenY': -0.24 * 0.529177210903,
        'lastModeOxygenY': -0.07 * 0.529177210903,
    }
    actual = {
        'units': volume['units'],
        'atomicNumbers': [atom['Z'] for atom in volume['atoms']],
        'labels': [mode['label'] for mode in modes],
        'frequencies': [mode['frequencyCm1'] for mode in modes],
        'firstHydrogenY': volume['atoms'][1]['y'],
        'firstModeHydrogenY': modes[0]['displacements'][4],
        'lastModeOxygenY': modes[2]['displacements'][1],
    }
    print(f'[CFOUR import] expected={expected} actual={actual}', flush=True)
    assert all(actual[key] == expected[key] for key in ('units', 'atomicNumbers', 'labels', 'frequencies'))
    assert math.isclose(actual['firstHydrogenY'], expected['firstHydrogenY'], abs_tol=1e-6)
    assert math.isclose(actual['firstModeHydrogenY'], expected['firstModeHydrogenY'], abs_tol=1e-6)
    assert math.isclose(actual['lastModeOxygenY'], expected['lastModeOxygenY'], abs_tol=1e-6)

    if page.locator('#vibrationPanel').get_attribute('aria-hidden') != 'false':
        page.locator('#vibrationPanelBtn').click()
    rows.nth(2).click()
    page.wait_for_function('''() => {
        const volume = VibeMolStructure.exportActive().volume;
        return volume.vibration.modeIndex === 2 && Math.abs(volume.atoms[0].y) > 0.001;
    }''')
    page.locator('#vibrationPlayBtn').click()

    # Reopening a file of the same name must attach its modes to the new scene.
    text = fixture.read_text().replace('1659.6203', '1670.0')
    result = load(page, [{'name': fixture.name, 'text': text}], clear_first=False)
    assert result['ok'] and result['loadedNames'] == [fixture.name], result
    frequency = page.evaluate('() => VibeMolStructure.exportActive().volume.vibration?.modes[0].frequencyCm1')
    assert frequency == 1670.0, {'expected': 1670.0, 'actual': frequency}
    assert not dialogs, dialogs


def focus_clipboard_page(page):
    page.bring_to_front()
    page.evaluate('() => { document.activeElement?.blur(); window.getSelection()?.removeAllRanges(); }')


def copy_coordinates(page):
    focus_clipboard_page(page)
    before_windows = page.evaluate('() => VibeMolTesting.getOpenNonEditWindows()')
    page.keyboard.press(CLIPBOARD_MODIFIER + '+c')
    text = page.evaluate('() => navigator.clipboard.readText()')
    assert page.evaluate('() => VibeMolTesting.getOpenNonEditWindows()') == before_windows, 'Cmd/Ctrl+C must not toggle Coordinates'
    return text


def xyz_units(page, dialogs):
    factor = 0.529177210903
    # Bond visibility is a display setting, not an input-unit heuristic.
    page.evaluate("() => VibeMolPreset.import({kind:'vibemol.preset',presetVersion:1,settings:{'global.showBonds':false}})")
    assert load(page, [
        {'name': 'bonded.xyz', 'text': '2\nAngstrom\nC 0 0 0\nH 1.09 0 0\n'},
        {'name': 'single.xyz', 'text': '1\nSingle atom\nH 8 -2 4\n'},
        {'name': 'metal.xyz', 'text': '2\nMetal bond\nFe 0 0 0\nN 2.2 0 0\n'},
    ])['ok']
    assert not dialogs, dialogs
    page.evaluate("() => VibeMolPreset.import({kind:'vibemol.preset',presetVersion:1,settings:{'global.showBonds':true}})")

    # Picker import converts before inference and retains every trajectory frame.
    page._accept_xyz_conversion = True
    trajectory = '2\nBohr frame 1\nC 2 -3 4\nH 4 -3 4\n2\nBohr frame 2\nC 3 -2 5\nH 5 -2 5\n'
    page.locator('#fileInput').set_input_files({
        'name': 'bohr-trajectory.xyz', 'mimeType': 'chemical/x-xyz', 'buffer': trajectory.encode(),
    })
    page.wait_for_function("() => VibeMolStructure.exportActive().name === 'bohr-trajectory.xyz'")
    assert len(dialogs) == 1 and 'bohr-trajectory.xyz' in dialogs[-1] and 'every trajectory frame' in dialogs[-1], dialogs
    converted = page.evaluate('() => VibeMolStructure.exportActive().volume')
    assert converted['units'] == 'angstrom'
    assert len(converted['bonds']) == 1, converted['bonds']
    for actual, original in zip(converted['trajectory']['frames'], ([2, -3, 4, 4, -3, 4], [3, -2, 5, 5, -2, 5])):
        assert all(abs(a - b * factor) < 1e-6 for a, b in zip(actual, original)), actual
    slider = page.locator('.trajectorySceneRow input[type=range]')
    slider.focus()
    slider.press('End')
    atoms = page.evaluate('() => VibeMolStructure.exportActive().volume.atoms')
    assert abs(atoms[1]['x'] - 5 * factor) < 1e-6, atoms

    # Declining a dropped file still imports it, with its original coordinates.
    page._accept_xyz_conversion = False
    page.evaluate(r"""() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['C 0 0 0\nH 2 0 0\n'], 'keep-angstrom.xyz', {type:'chemical/x-xyz'}));
      document.getElementById('canvas').dispatchEvent(new DragEvent('drop', {dataTransfer:transfer,bubbles:true,cancelable:true}));
    }""")
    page.wait_for_function("() => VibeMolStructure.exportActive().name === 'keep-angstrom.xyz'")
    kept = page.evaluate('() => VibeMolStructure.exportActive().volume')
    assert kept['atoms'][1]['x'] == 2 and kept['units'] == 'angstrom'
    assert len(dialogs) == 2 and 'keep-angstrom.xyz' in dialogs[-1], dialogs

    # Native paste uses the same warning, including coordinate-only atomic-number rows.
    page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
    page._accept_xyz_conversion = True
    for text in ('6 2 -3 4\n1 4 -3 4\n', '2\nStandard pasted XYZ\nC 2 -3 4\nH 4.2 -3 4\n'):
        before = len(snapshot(page)['scenes'])
        page.evaluate('text => navigator.clipboard.writeText(text)', text)
        focus_clipboard_page(page)
        page.keyboard.press(CLIPBOARD_MODIFIER + '+v')
        page.wait_for_function('count => VibeMolTesting.getSceneGraphSnapshot().scenes.length === count + 1', arg=before)
        pasted = page.evaluate('() => VibeMolStructure.exportActive().volume')
        assert abs(pasted['atoms'][0]['x'] - 2 * factor) < 1e-6, pasted['atoms']
        assert abs(pasted['atoms'][1]['y'] + 3 * factor) < 1e-6, pasted['atoms']
        assert len(pasted['bonds']) == 1
    assert len(dialogs) == 4 and 'pasted-xyz' in dialogs[-1], dialogs

    # Converted geometry copies back in angstroms and does not convert a second time.
    text = copy_coordinates(page)
    assert load(page, [{'name': 'roundtrip.xyz', 'text': text}])['ok']
    assert len(dialogs) == 4, dialogs
    assert copy_coordinates(page) == text

    # The render client's dialog handler must not silently opt into conversion.
    with tempfile.TemporaryDirectory(prefix='vibemol-xyz-units-') as directory:
        source = pathlib.Path(directory) / 'unbonded.xyz'
        target = pathlib.Path(directory) / 'render.png'
        source.write_text('2\nUnbonded coordinates\nC 0 0 0\nH 2 0 0\n', encoding='utf-8')
        rendered = subprocess.run([
            sys.executable, str(ROOT / 'api' / 'vibemol_client.py'), str(source), str(target),
            '--url', page.url, '--wait-ms', '100',
        ], capture_output=True, text=True, timeout=60)
        assert rendered.returncode == 0, rendered.stderr
        assert 'Kept the original coordinates.' in rendered.stderr, rendered.stderr
        assert target.read_bytes().startswith(b'\x89PNG\r\n\x1a\n')


def clipboard_roundtrip(page, dialogs):
    page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
    page.evaluate("() => navigator.clipboard.writeText('clipboard fixture')")
    bohr_cube = cube(0).replace('1 1 0 0 0\n', '1 1 2 -3 4\n')
    assert load(page, [{'name': 'bohr.cube', 'text': bohr_cube}])['ok']
    expected = 'H 1.058354 -1.587532 2.116709'
    assert copy_coordinates(page) == expected

    # Copy remains in angstroms even when the coordinate table displays bohr.
    page.keyboard.press('c')
    page.locator('#coordsUnitsBtn').click()
    assert page.locator('#coordsUnitsBtn').get_attribute('aria-label') == 'Switch coordinates to angstrom'
    assert copy_coordinates(page) == expected
    page.locator('#copyXYZ').click()
    assert page.evaluate('() => navigator.clipboard.readText()') == expected
    # Exercise the clipboard fallback without replacing the native copy event.
    page.evaluate("""() => { window.__writeText = navigator.clipboard.writeText;
      navigator.clipboard.writeText = async () => { throw new Error('Clipboard API unavailable'); }; }""")
    page.locator('#copyXYZ').click()
    assert page.evaluate('() => navigator.clipboard.readText()') == expected
    assert page.evaluate("() => document.activeElement.id === 'copyXYZ'")
    page.evaluate('() => { navigator.clipboard.writeText = window.__writeText; }')

    # A fresh VibeMol window must consume the operating-system clipboard alone.
    receiver = page.context.new_page()
    receiver_errors = []
    receiver.on('pageerror', lambda error: receiver_errors.append(str(error)))
    try:
        receiver.goto(page.url, wait_until='domcontentloaded')
        receiver.wait_for_function('() => window.VibeMolTesting && window.VibeMolEmbed')
        assert len(snapshot(receiver)['scenes']) == 0
        focus_clipboard_page(receiver)
        receiver.keyboard.press(CLIPBOARD_MODIFIER + '+v')
        receiver.wait_for_function('() => VibeMolTesting.getSceneGraphSnapshot().scenes.length === 1')
        volume = receiver.evaluate('() => VibeMolStructure.exportActive().volume')
        assert volume['units'] == 'angstrom'
        assert [(atom['Z'], atom['x'], atom['y'], atom['z']) for atom in volume['atoms']] == [(1, 1.058354, -1.587532, 2.116709)]
        assert receiver.evaluate('() => VibeMolTesting.getOpenNonEditWindows()') == [], 'Paste must not toggle View'
        assert copy_coordinates(receiver) == expected
        assert not receiver_errors, receiver_errors
    finally:
        receiver.close()

    # Copy also works in Measure, while native text copy/paste stays native.
    page.bring_to_front()
    page.locator('#modeMeasureBtn').click()
    assert copy_coordinates(page) == expected
    context_item(page, cubes(page)[0]['id'], 'Rename')
    rename = page.locator('.vm-outliner-row__rename-input')
    rename.fill('Native rename text')
    rename.press(CLIPBOARD_MODIFIER + '+a')
    rename.press(CLIPBOARD_MODIFIER + '+c')
    assert page.evaluate('() => navigator.clipboard.readText()') == 'Native rename text'
    page.evaluate('text => navigator.clipboard.writeText(text)', expected)
    rename.press(CLIPBOARD_MODIFIER + '+v')
    assert rename.input_value() == expected
    assert len(snapshot(page)['scenes']) == 1, 'Pasting into a text field must not import XYZ'
    rename.press('Escape')
    focus_clipboard_page(page)
    page.evaluate("""() => {
      const p = document.createElement('p'); p.id = 'clipboard-text-probe'; p.textContent = 'Selected page text';
      document.body.appendChild(p); const range = document.createRange(); range.selectNodeContents(p);
      window.getSelection().addRange(range);
    }""")
    page.keyboard.press(CLIPBOARD_MODIFIER + '+c')
    assert page.evaluate('() => navigator.clipboard.readText()') == 'Selected page text'
    page.evaluate("() => { window.getSelection().removeAllRanges(); document.getElementById('clipboard-text-probe').remove(); }")
    # Modified clipboard/browser shortcuts must not invoke plain-letter tools.
    before_windows = page.evaluate('() => VibeMolTesting.getOpenNonEditWindows()')
    assert page.evaluate("""() => ['c', 'v', 'x'].every(key => {
      const e = new KeyboardEvent('keydown', {key, ctrlKey:true, shiftKey:true, bubbles:true, cancelable:true});
      window.dispatchEvent(e); return !e.defaultPrevented;
    })""")
    assert page.evaluate('() => VibeMolTesting.getOpenNonEditWindows()') == before_windows


def clipboard_edit_selection(page, dialogs):
    page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
    assert load(page, [{'name': 'edit-copy.xyz', 'text': '3\nClipboard fixture\nC 2 3 4\nC 3.4 3 4\nH 5 3 4\n'}])['ok']
    page.evaluate("""() => {
      const doc = VibeMolStructure.exportActive();
      doc.volume.bonds = [{id:'copy-bond', a:doc.volume.atoms[0].id, b:doc.volume.atoms[1].id,
        order:2, kind:'normal', origin:'explicit', style:'covalent'}];
      VibeMolStructure.importFromText(JSON.stringify(doc), 'edit-copy');
    }""")
    page.locator('#modeEditBtn').click()
    initial_scene_count = len(snapshot(page)['scenes'])
    assert len(copy_coordinates(page).splitlines()) == 3, 'No atom selection copies the full structure in Edit'
    page.evaluate('() => VibeMolTesting.setEditSelectionIndices([0, 1])')
    expected = 'C 2.000000 3.000000 4.000000\nC 3.400000 3.000000 4.000000'
    assert copy_coordinates(page) == expected, 'Selection copy uses original coordinates, not centered fragment coordinates'
    receiver = page.context.new_page()
    receiver_errors = []
    receiver.on('pageerror', lambda error: receiver_errors.append(str(error)))
    try:
        receiver.goto(page.url, wait_until='domcontentloaded')
        receiver.wait_for_function('() => window.VibeMolTesting && window.VibeMolEmbed')
        focus_clipboard_page(receiver)
        receiver.keyboard.press(CLIPBOARD_MODIFIER + '+v')
        receiver.wait_for_function('() => VibeMolTesting.getSceneGraphSnapshot().scenes.length === 1')
        assert copy_coordinates(receiver) == expected
        assert len(receiver.evaluate('() => VibeMolStructure.exportActive().volume.atoms')) == 2
        assert not receiver_errors, receiver_errors
    finally:
        receiver.close()
    # Recopy in the original window to retain its selection token for duplication.
    assert copy_coordinates(page) == expected
    page.keyboard.press(CLIPBOARD_MODIFIER + '+v')
    page.wait_for_function('() => VibeMolStructure.exportActive().volume.atoms.length === 5')
    volume = page.evaluate('() => VibeMolStructure.exportActive().volume')
    assert len(snapshot(page)['scenes']) == initial_scene_count
    assert len(volume['bonds']) == 2 and all(bond['order'] == 2 and bond['origin'] == 'explicit' for bond in volume['bonds'])
    assert page.evaluate('() => VibeMolTesting.getEditSelectionIndices().length') == 2
    # Replacing the clipboard must not resurrect a cached atom selection.
    page.evaluate("() => navigator.clipboard.writeText('unrelated clipboard text')")
    focus_clipboard_page(page)
    page.keyboard.press(CLIPBOARD_MODIFIER + '+v')
    assert len(page.evaluate('() => VibeMolStructure.exportActive().volume.atoms')) == 5
    page.evaluate('text => navigator.clipboard.writeText(text)', expected)
    page.keyboard.press(CLIPBOARD_MODIFIER + '+v')
    page.wait_for_function('count => VibeMolTesting.getSceneGraphSnapshot().scenes.length === count + 1', arg=initial_scene_count)
    assert len(page.evaluate('() => VibeMolStructure.exportActive().volume.atoms')) == 2


def persistence(page, dialogs):
    load_cubes(page)
    a, b = cubes(page)
    context_item(page, a['id'], 'Rename')
    page.locator('.vm-outliner-row__rename-input').fill('Named orbital')
    # An unrelated redraw must preserve the mounted input and its draft text.
    redraw(page)
    assert page.locator('.vm-outliner-row__rename-input').input_value() == 'Named orbital'
    page.locator('.vm-outliner-row__rename-input').press('Enter')
    context_item(page, b['id'], 'Delete')
    page.locator('.vm-outliner-context-menu__button.is-danger').click()
    redraw(page)
    assert [(layer['id'], layer['name']) for layer in cubes(page)] == [(a['id'], 'Named orbital')]
    load(page, [{'name': 'third.cube', 'text': cube(0)}], clear_first=False)
    assert [(layer['id'], layer['name']) for layer in cubes(page)][0] == (a['id'], 'Named orbital')
    assert all(layer['id'] != b['id'] for layer in cubes(page))


def batch_export(page, dialogs):
    load_cubes(page)
    layers = cubes(page)
    page.locator(f'.vm-outliner-row[data-id="{layers[1]["id"]}"]').click()
    before = snapshot(page)
    page.evaluate("""() => {
      window.__exports = [];
      HTMLAnchorElement.prototype.click = function() {
        window.__exports.push({name:this.download, image:this.href,
          graph:window.VibeMolTesting.getSceneGraphSnapshot()});
      };
      document.getElementById('batchBtn').click();
    }""")
    page.wait_for_function("() => window.__exports.length === 2 && !document.getElementById('batchBtn').disabled")
    result = page.evaluate("() => ({unique:new Set(window.__exports.map(x=>x.image)).size, exports:window.__exports.map(({image,...x})=>x)})")
    assert result['unique'] == 2, result
    assert [item['name'].split('_iso')[0] for item in result['exports']] == ['a', 'b']
    assert snapshot(page) == before, {'before': before, 'after': snapshot(page)}
    page.evaluate("""() => {
      HTMLAnchorElement.prototype.click = function() { throw new Error('Injected download failure'); };
      document.getElementById('batchBtn').click();
    }""")
    page.wait_for_function("() => !document.getElementById('batchBtn').disabled && /Injected download failure/.test(window.VibeMolTesting.getHintMessage())")
    assert snapshot(page) == before, {'before': before, 'after': snapshot(page)}


ARITHMETIC_OBSERVER = """() => {
  window.__arithmeticResults = [];
  window.__arithmeticWorkers = 0;
  const NativeWorker = window.Worker;
  if (NativeWorker) window.Worker = class extends NativeWorker {
    constructor(url, ...args) { super(url, ...args); if (String(url).includes('arithmetic-worker.js')) window.__arithmeticWorkers++; }
  };
  let api;
  Object.defineProperty(window, 'VibeMolArithmeticRunner', { configurable:true, get:()=>api, set:original=> {
    api = {...original, createArithmeticRunner: options => {
      const runner = original.createArithmeticRunner(options);
      return {compute:async (operation, operands, name, settings) => {
        const peak = data => { let p=0; for (const x of data || []) p=Math.max(p, Math.abs(x)); return p; };
        const result = await runner.compute(operation, operands, name, settings);
        window.__arithmeticResults.push({ok:result.ok, sameVolume:operands[0]?.vol===operands[1]?.vol,
          inputs:operands.map(x=>peak(x.vol.data)), output:peak(result.data)});
        return result;
      }};
    }};
  }});
}"""

MOLDEN_GRID_OBSERVER = """() => {
  window.__moldenGridBuilds = [];
  let api;
  Object.defineProperty(window, 'VibeMolGridStore', { configurable:true, get:()=>api, set:original=> {
    api = {...original, createGridStore: options => {
      const store = original.createGridStore(options);
      return {...store, get: (source, key, evaluate) => store.get(source, key, () => {
        window.__moldenGridBuilds.push({name:source.name, index:Number(key.split('|')[0])});
        return evaluate();
      })};
    }};
  }});
}"""

MOLDEN = '\n'.join(['[Molden Format]', '[Atoms] Angs', 'H 1 1 0.0 0.0 0.0', '[GTO]', '1 0', 's 1 1.0', '1.0 1.0',
                    '[MO]', 'Sym= A1', 'Ene= -0.5', 'Spin= Alpha', 'Occup= 2.0', '1 1.0',
                    'Sym= A1', 'Ene= -0.1', 'Spin= Alpha', 'Occup= 0.0', '1 1.0',
                    'Sym= A1', 'Ene= 0.8', 'Spin= Beta', 'Occup= 0.0', '1 -1.0'])


def set_surface_control(page, selector, value):
    page.locator(selector).evaluate('''(el, value) => {
        el.value = value; el.dispatchEvent(new Event('input', {bubbles:true}));
        el.dispatchEvent(new Event('change', {bubbles:true}));
    }''', str(value))


def orbital_group_appearance(page, dialogs):
    other_cube = cube(0).replace('1 1 0 0 0\n', '8 8 0 0 0\n')
    assert load(page, [{'name':'a.cube', 'text':cube(-1)}, {'name':'b.cube', 'text':cube(1)},
                       {'name':'other.cube', 'text':other_cube}])['ok']
    a, b, other = cubes(page)
    assert a['parentId'] == b['parentId'] != other['parentId']
    for scene in snapshot(page)['scenes']:
        if not scene['visible']:
            page.locator(f'.vm-outliner-row[data-id="{scene["id"]}"] .vm-outliner-row__eye').click()
    page.locator(f'.vm-outliner-row[data-id="{a["id"]}"]').click()
    set_surface_control(page, '#iso', 0.025)
    page.locator(f'.vm-outliner-row[data-id="{b["id"]}"] .vm-outliner-row__eye').click()
    before_visibility = [layer['visible'] for layer in cubes(page)]
    other_before = cubes(page)[2]
    assert other_before['effectiveVisible']
    # Focus a different scene first to exercise scope changes across scenes.
    page.locator(f'.vm-outliner-row[data-id="{other["id"]}"]').click()
    page.locator(f'.vm-outliner-row[data-id="{a["parentId"]}"]').click()
    assert page.locator('#displayInspector').is_visible()
    assert page.evaluate('() => VibeMolStructure.exportActive().name') == 'a.cube'
    assert page.locator('#surfaceScopeLabel').inner_text() == 'All 2 surfaces in Orbitals'
    assert page.locator('[data-mixed-key="iso"]').is_visible()
    assert snapshot(page)['selectedLayerIds'] == [], 'Group appearance must not create a destructive multi-selection'
    assert [layer['visible'] for layer in cubes(page)] == before_visibility

    page.locator('#iso').fill('0.045')
    page.locator('#iso').press('Tab')
    page.locator('#schemeSelect').select_option('tableau')
    set_surface_control(page, '#posColor', '#12ab34')
    set_surface_control(page, '#negColor', '#bc23de')
    set_surface_control(page, '#opacity', 0.65)
    page.locator('#styleStudioBtn').click()
    page.locator('#appearanceMaterialsSection > summary').click()
    page.locator('#appearanceMaterialPreset').select_option('matte')
    page.locator('#styleStudioClose').click()
    page.locator('#surfaceSignFlipBtn').check()
    page.locator('#appearanceRenderModeGroup [data-value="cloud"]').click()
    page.locator('#appearanceCloudTypeGroup [data-value="points"]').click()
    edited = cubes(page)
    for layer in edited[:2]:
        assert layer['iso'] == 0.045 and layer['opacity'] == 0.65, layer
        assert layer['colorScheme'] == 'custom' and layer['posColor'] == '#12ab34' and layer['negColor'] == '#bc23de', layer
        assert layer['material']['roughness'] == 0.85 and layer['signFlip'], layer
        assert layer['renderMode'] == 'cloud' and layer['cloudType'] == 'points', layer
    assert edited[2]['material']['roughness'] == 0.85
    assert all(layer['solidPreset']=='matte' for layer in edited)
    material_keys={'material','solidPreset'}
    assert {key:value for key,value in edited[2].items() if key not in material_keys} == {key:value for key,value in other_before.items() if key not in material_keys}
    other_before=edited[2]
    assert [layer['visible'] for layer in edited] == before_visibility
    assert not page.locator('[data-mixed-key="iso"]').is_visible()

    # Parent visibility is independent of the children's visibility choices.
    page.locator('#surfBtn').uncheck()
    assert [layer['visible'] for layer in cubes(page)] == before_visibility
    assert not any(layer['effectiveVisible'] for layer in cubes(page)[:2])
    assert cubes(page)[2]['effectiveVisible']
    page.locator('#surfBtn').check()
    assert [layer['visible'] for layer in cubes(page)] == before_visibility

    # An individual edit leaves its sibling alone; the header exposes mixed Auto-iso.
    page.locator(f'.vm-outliner-row[data-id="{a["id"]}"]').click()
    page.locator('#autoIsoBtn').check()
    assert [layer['autoIso'] for layer in cubes(page)[:2]] == [True, False]
    page.locator(f'.vm-outliner-row[data-id="{a["parentId"]}"]').click()
    assert page.locator('#autoIsoBtn').evaluate('el => el.indeterminate')
    assert page.locator('[data-mixed-key="autoIso"]').is_visible()
    assert page.locator('#iso').is_disabled()
    page.locator('#autoIsoBtn').click()
    assert all(layer['autoIso'] for layer in cubes(page)[:2])
    page.locator('#autoIsoBtn').uncheck()
    assert not any(layer['autoIso'] for layer in cubes(page)[:2])
    assert page.locator('#iso').is_enabled()
    set_surface_control(page, '#iso', 0.04)
    assert all(layer['iso'] == 0.04 for layer in cubes(page)[:2])
    assert cubes(page)[2] == other_before

    page.locator('#appearanceResetBtn').click()
    page.locator('#appearanceResetConfirmBtn').click()
    reset = cubes(page)
    for key in ('iso', 'autoIso', 'opacity', 'solidPreset', 'colorScheme', 'renderMode', 'cloudType', 'signFlip'):
        assert reset[0][key] == reset[1][key], (key, reset)
    assert reset[0]['colorScheme'] != 'custom' and not reset[0]['signFlip']
    assert {key:value for key,value in reset[2].items() if key!='material'} == {key:value for key,value in other_before.items() if key!='material'}


def molden_group_appearance(page, dialogs):
    page.add_init_script('(' + MOLDEN_GRID_OBSERVER + ')()')
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('() => window.VibeMolTesting')
    assert load(page, [{'name':'group.molden', 'text':MOLDEN}])['ok']
    layers = cubes(page)
    group_id = layers[0]['parentId']

    def iso_labels():
        return [page.locator(f'.vm-outliner-row[data-id="{layer["id"]}"] .vm-outliner-row__meta').inner_text()
                for layer in layers]

    assert all(label.startswith('iso ') for label in iso_labels())
    page.locator(f'.vm-outliner-row[data-id="{group_id}"]').click()
    assert page.locator('#surfaceScopeLabel').inner_text() == 'All 3 surfaces in Orbitals'
    assert page.locator('#appearanceSurfacesSection').is_visible()
    page.locator('#autoIsoBtn').check()
    assert all(layer['autoIso'] for layer in cubes(page))
    assert iso_labels() == ['', '', ''], 'Pending Auto-iso must not display fallback values'
    page.locator('#autoIsoBtn').uncheck()
    assert iso_labels() == ['', '', ''], 'Disabling Auto-iso alone does not assign a new value'
    set_surface_control(page, '#iso', 0.035)
    assert all(label.startswith('iso 0.035') for label in iso_labels())
    set_surface_control(page, '#posColor', '#123456')
    set_surface_control(page, '#negColor', '#abcdef')
    set_surface_control(page, '#opacity', 0.6)
    before = snapshot(page)
    assert not any(layer['visible'] for layer in cubes(page))
    assert page.evaluate('() => window.__moldenGridBuilds') == [], 'Group edits must keep unvisited orbitals lazy'

    # Save/open must retain the group focus and every hidden orbital's appearance.
    saved = page.evaluate('() => window.VibeMolSession.export()')
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('() => window.VibeMolSession')
    assert page.evaluate('doc => window.VibeMolSession.import(doc)', saved)['ok']
    assert snapshot(page) == before
    assert page.evaluate('() => window.__moldenGridBuilds') == []
    page.locator(f'.vm-outliner-row[data-id="{layers[1]["id"]}"]').click()
    assert page.evaluate('() => window.__moldenGridBuilds.map(x => x.index)') == [1]
    shown = cubes(page)[1]
    assert shown['effectiveVisible'] and shown['iso'] == 0.035 and shown['opacity'] == 0.6, shown
    assert shown['posColor'] == '#123456' and shown['negColor'] == '#abcdef', shown
    page.locator(f'.vm-outliner-row[data-id="{group_id}"]').click()
    page.locator('#autoIsoBtn').check()
    assert all(layer['autoIso'] for layer in cubes(page))
    assert page.evaluate('() => window.__moldenGridBuilds.map(x => x.index)') == [1]
    assert [layer['visible'] for layer in cubes(page)] == [False, True, False]
    assert iso_labels()[0] == iso_labels()[2] == '' and iso_labels()[1].startswith('iso ')

    # Pending labels survive save/open; computing another orbital resolves just its label.
    before = snapshot(page)
    saved = page.evaluate('() => window.VibeMolSession.export()')
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('() => window.VibeMolSession')
    assert page.evaluate('doc => window.VibeMolSession.import(doc)', saved)['ok']
    assert snapshot(page) == before
    assert iso_labels()[0] == iso_labels()[2] == '' and iso_labels()[1].startswith('iso ')
    page.locator(f'.vm-outliner-row[data-id="{layers[2]["id"]}"]').click()
    assert page.evaluate('() => window.__moldenGridBuilds.map(x => x.index)') == [1, 2]
    assert iso_labels()[0] == '' and all(label.startswith('iso ') for label in iso_labels()[1:])

    # Imports made with Auto-iso already enabled also begin with pending labels.
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('() => window.VibeMolPreset')
    page.evaluate("() => VibeMolPreset.import({kind:'vibemol.preset',presetVersion:1,settings:{'surface.autoIsoEnabled':true}})")
    assert load(page, [{'name':'auto.molden', 'text':MOLDEN}])['ok']
    layers = cubes(page)
    assert all(layer['autoIso'] and layer['isoPending'] for layer in layers)
    assert iso_labels() == ['', '', '']
    assert page.evaluate('() => window.__moldenGridBuilds') == []


def first_molden_surface_camera(page):
    from camera_depth import observe
    from surface_shadows import settings, settle
    from tutorials import drag

    def pose():
        state = page.evaluate('() => VibeMolTesting.getCameraSnapshot()')
        position, target, up = ([state[key][axis] for axis in 'xyz'] for key in ('camera', 'target', 'up'))
        distance = math.dist(position, target)
        return dict(mode=state['mode'], direction=[(v-t)/distance for v, t in zip(position, target)],
                    target=target, up=up, distance=distance)

    def matches(actual, expected):
        return len(actual) == len(expected) and all(numbers_close(a, b, abs_tol=1e-9) for a, b in zip(actual, expected))

    observe(page)
    canonical = [1 / math.sqrt(3)] * 3
    default_up = [0, 0, 1]
    results = []
    for projection in ('perspective', 'orthographic'):
        for entry in ('panel', 'outliner'):
            settings(page, {'view.projection': projection, 'view.autoRotate': False, 'global.showBox': False})
            assert load(page, [{'name': 'first-surface.molden', 'text': MOLDEN}])['ok']
            layers = cubes(page)
            hidden = [layer['effectiveVisible'] for layer in layers]
            # Displace the target as well so preserving the whole camera cannot pass.
            settings(page, {'view.target.x': 0.25})
            drag(page)
            before = pose()
            layer_id = layers[0]['id']
            row = ('#moldenInspectorBody tr[data-row-index="0"]' if entry == 'panel'
                   else f'.vm-outliner-row[data-id="{layer_id}"]')
            page.locator(row).click()
            page.wait_for_function("""id => VibeMolTesting.getSceneGraphSnapshot().activeLayerId === id
                && !document.querySelector('#moldenInspectorBody .vm-list-popover__row--pending')
                && VibeMolTesting.getSurfaceMaterialSnapshot().some(m => m.visible && m.sceneLayerId === id)""",
                                   arg=layer_id)
            settle(page)
            fitted = pose()
            geometry = page.evaluate("""id => {
                const atoms = new THREE.Box3(), surface = new THREE.Box3();
                depthScene.traverseVisible(node => {
                    if (node.userData.type === 'atom') atoms.expandByObject(node);
                    if (node.isMesh && node.userData.sceneLayerId === id) surface.expandByObject(node);
                });
                const center = atoms.getCenter(new THREE.Vector3());
                const corners = box => [box.min.x, box.max.x].flatMap(x =>
                    [box.min.y, box.max.y].flatMap(y => [box.min.z, box.max.z].map(z => new THREE.Vector3(x,y,z))));
                const radius = box => Math.max(...corners(box).map(point => point.distanceTo(center)));
                const rect = document.querySelector('#canvas').getBoundingClientRect();
                return {center: center.toArray(), atomRadius: radius(atoms), surfaceRadius: radius(surface),
                    fitRadius: radius(atoms.clone().union(surface)), aspect: rect.width / rect.height,
                    surfaceNdc: corners(surface).map(point => point.project(depthCamera).toArray())};
            }""", layer_id)
            # A sphere with the scene's fit radius must clear the limiting half-FOV.
            half_fov = min(math.pi/8, math.atan(math.tan(math.pi/8) * geometry['aspect']))
            fit_distance = 1.12 * geometry['fitRadius'] / math.sin(half_fov)
            page.locator('#viewReset').evaluate('button => button.click()')
            reset = pose()
            expected = dict(mode=projection, direction=before['direction'], up=before['up'],
                            target=geometry['center'], distance=fit_distance)
            reset_expected = dict(expected, direction=canonical, up=default_up)
            checks = dict(initiallyHidden=hidden == [False]*3,
                          rotated=not matches(before['direction'], canonical) and not matches(before['up'], default_up),
                          displacedTarget=not matches(before['target'], geometry['center']),
                          extendsBeyondAtoms=geometry['surfaceRadius'] > geometry['atomRadius'],
                          insideFrustum=all(numbers_close(value, max(-1, min(1, value)), abs_tol=1e-9)
                                            for corner in geometry['surfaceNdc'] for value in corner))
            for label, actual, wanted in [('fit', fitted, expected), ('reset', reset, reset_expected)]:
                for key in ('target', 'direction', 'up'):
                    checks[f'{label}.{key}'] = matches(actual[key], wanted[key])
                checks[f'{label}.mode'] = actual['mode'] == wanted['mode']
                checks[f'{label}.distance'] = numbers_close(actual['distance'], wanted['distance'], abs_tol=1e-9)
            receipt = dict(entry=entry, projection=projection, before=before, hidden=hidden, geometry=geometry,
                           ndcRange=[-1, 1], fit=fitted, expected=expected, reset=reset, resetExpected=reset_expected,
                           checks=checks)
            print('[first-molden-surface-camera] ' + json.dumps(receipt), flush=True)
            results.append((projection, entry, [name for name, passed in checks.items() if not passed]))
    require_phase_counts({'first-molden-surface-camera': len(results)}, 'tests/e2e/premerge.py',
                         'first-molden-surface-camera')
    assert all(not failures for _, _, failures in results), results


def molden_browsing(page, dialogs):
    page.add_init_script('(' + MOLDEN_GRID_OBSERVER + ')()')
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('() => window.VibeMolTesting')
    page.locator('#fileInput').set_input_files({
        'name': 'browse.molden', 'mimeType': 'text/plain', 'buffer': MOLDEN.encode(),
    })
    panel = page.locator('#moldenInspector')
    panel.wait_for(state='visible')
    assert panel.get_attribute('aria-hidden') == 'false'
    assert page.locator('#moldenInspectorBody tbody tr[data-row-index]').count() == 3
    initial_layers = cubes(page)
    assert [layer['name'] for layer in initial_layers] == ['MO 1', 'MO 2', 'MO 3']
    assert not any(layer['effectiveVisible'] for layer in initial_layers)
    for layer in initial_layers:
        assert page.locator(f'.vm-outliner-row[data-id="{layer["id"]}"]').is_visible()
    assert page.evaluate('() => window.__moldenGridBuilds') == []
    redraw(page)
    page.locator('#moldenGridStep').fill('0.4')
    page.wait_for_function("() => document.getElementById('moldenGridStep').value === '0.40'")
    assert page.evaluate('() => window.__moldenGridBuilds') == [], 'Metadata and grid settings must remain lazy'

    def wait_for_orbital(name):
        page.wait_for_function('''(name) => {
            const state = window.VibeMolTesting.getSceneGraphSnapshot();
            const visible = state.scenes.flatMap(scene => scene.layers).filter(layer =>
                layer.kind === 'cube' && layer.effectiveVisible);
            return visible.length === 1 && visible[0].name === name
                && state.activeLayerId === visible[0].id
                && !document.querySelector('#moldenInspectorBody .vm-list-popover__row--pending');
        }''', arg=name)

    def choose(index, name):
        page.locator(f'#moldenInspectorBody tbody tr[data-row-index="{index}"]').click()
        wait_for_orbital(name)

    # Selecting a deferred outliner entry computes just that MO and synchronizes the inspector.
    page.locator(f'.vm-outliner-row[data-id="{initial_layers[2]["id"]}"]').click()
    wait_for_orbital('MO 3')
    assert page.evaluate('() => window.__moldenGridBuilds.map(x => x.index)') == [2]
    assert 'selected: 3' in page.locator('#moldenInspectorFooter').inner_text()
    redraw(page)
    assert page.evaluate('() => window.__moldenGridBuilds.map(x => x.index)') == [2]
    choose(0, 'MO 1')
    first = cubes(page)[0]
    context_item(page, first['id'], 'Rename')
    page.locator('.vm-outliner-row__rename-input').fill('Named orbital')
    page.locator('.vm-outliner-row__rename-input').press('Enter')
    page.locator('#iso').evaluate("el => { el.value = '0.025'; el.dispatchEvent(new Event('input', {bubbles:true})); }")
    choose(1, 'MO 2')
    choose(2, 'MO 3')
    choose(0, 'Named orbital')
    assert page.evaluate('() => window.__moldenGridBuilds.map(x => x.index)') == [2, 0, 1]
    layers = cubes(page)
    assert len(layers) == 3, layers
    assert layers[0]['id'] == first['id'] and layers[0]['iso'] == 0.025, layers

    # Clicking an already-selected row must also restore exclusive visibility.
    page.locator(f'.vm-outliner-row[data-id="{layers[1]["id"]}"] .vm-outliner-row__eye').click()
    assert len([layer for layer in cubes(page) if layer['effectiveVisible']]) == 2
    # Grid edits refresh the current selection without changing an intentional overlay.
    page.locator('#moldenGridStep').fill('0.3')
    page.wait_for_function('''() => document.getElementById('moldenGridStep').value === '0.30'
        && !document.querySelector('#moldenInspectorBody .vm-list-popover__row--pending')''')
    assert len([layer for layer in cubes(page) if layer['effectiveVisible']]) == 2
    choose(0, 'Named orbital')
    page.locator(f'.vm-outliner-row[data-id="{first["id"]}"] .vm-outliner-row__eye').click()
    assert not any(layer['effectiveVisible'] for layer in cubes(page))
    choose(0, 'Named orbital')

    # Multiple selections before the next rendered frame must honor the last one.
    page.evaluate('''() => {
        for (const index of [1, 2, 0, 2]) {
            document.querySelector(`#moldenInspectorBody tr[data-row-index="${index}"]`).click();
        }
    }''')
    wait_for_orbital('MO 3')
    assert len(cubes(page)) == 3
    before = snapshot(page)
    page.locator('#moldenInspectorClose').click()
    redraw(page)
    assert not panel.is_visible(), 'A redraw must respect a manually closed Orbitals window'
    assert snapshot(page) == before

    # A subsequent import opens the window again; other input families still close it.
    assert load(page, [{'name': 'reopened.molden', 'text': MOLDEN}])['ok']
    assert panel.is_visible()
    assert load(page, [{'name': 'molecule.xyz', 'text': '1\nHydrogen\nH 0 0 0\n'}])['ok']
    assert not panel.is_visible()
    first_molden_surface_camera(page)


def molden_fractional_occupations(page, dialogs):
    fixture = ROOT / 'python/tests/data/cyclopropene_sa2cas43.molden'
    result = load(page, [{'name': fixture.name, 'text': fixture.read_text()}])
    assert result['ok'] and result['loadedCount'] == 1, result
    panel = page.locator('#moldenInspector')
    panel.wait_for(state='visible')
    table = panel.locator('tbody')
    rows = table.locator('tr[data-row-index]').evaluate_all('''rows => rows.map(row => ({
        index: Number(row.dataset.rowIndex) + 1,
        kind: row.dataset.occupationClass,
        occupation: row.children[2].textContent,
    }))''')
    counts = {kind: sum(row['kind'] == kind for row in rows) for kind in ('core', 'active', 'virtual')}
    actual = {'counts': counts, 'active': [row for row in rows if row['kind'] == 'active']}
    expected = {'counts': {'core': 9, 'active': 3, 'virtual': len(rows) - 12},
                'active': [{'index': index, 'kind': 'active', 'occupation': occupation}
                           for index, occupation in ((10, '1.99'), (11, '1.48'), (12, '0.53'))]}
    print('[molden-occupations] ' + json.dumps({'actual': actual, 'expected': expected}), flush=True)
    assert counts['virtual'] > 0 and actual == expected, (actual, expected)

    def check_dividers(expected):
        actual = table.locator('.vm-list-popover__divider').evaluate_all('''rows => rows.map(row => [
            row.textContent, Number(row.nextElementSibling?.dataset.rowIndex) + 1,
        ])''')
        print('[molden-dividers] ' + json.dumps({'actual': actual, 'expected': expected}), flush=True)
        assert actual == expected, (actual, expected)

    check_dividers([['Core / Active', 10], ['Active / Virtual', 13]])
    energy = page.locator('#moldenEnergyFilter')
    energy.fill('0.25')
    energy.press('Tab')
    check_dividers([['Core / Active', 10], ['Active / Virtual', 16]])
    energy.fill('0.60')
    energy.press('Tab')
    check_dividers([['Active / Virtual', 21]])
    energy.fill('0')
    energy.press('Tab')
    check_dividers([['Core / Active', 10], ['Active / Virtual', 13]])

    result = load(page, [{'name': 'integer.molden', 'text': MOLDEN}])
    assert result['ok'] and result['loadedCount'] == 1, result
    check_dividers([['HOMO / LUMO', 2]])


def arithmetic(page, dialogs):
    page.add_init_script('(' + ARITHMETIC_OBSERVER + ')()')
    page.add_init_script('(' + MOLDEN_GRID_OBSERVER + ')()')
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('() => window.VibeMolTesting')
    assert load(page, [{'name': 'orbitals.molden', 'text': MOLDEN}])['ok']
    assert page.evaluate('() => window.__moldenGridBuilds') == []
    for index in (1, 2):
        page.locator(f'#moldenInspectorBody tbody tr[data-row-index="{index}"]').evaluate('el => el.click()')
        page.wait_for_function('''(name) => {
            const state = window.VibeMolTesting.getSceneGraphSnapshot();
            return state.scenes.flatMap(scene => scene.layers).some(layer =>
                layer.id === state.activeLayerId && layer.name === name && layer.effectiveVisible)
                && !document.querySelector('#moldenInspectorBody .vm-list-popover__row--pending');
        }''', arg=f'MO {index + 1}')
    _, a, b = cubes(page)
    assert [a['name'], b['name']] == ['MO 2', 'MO 3']
    assert page.evaluate('() => window.__moldenGridBuilds.map(x => x.index)') == [1, 2]
    page.locator(f'.vm-outliner-row[data-id="{a["id"]}"]').click()
    page.locator(f'.vm-outliner-row[data-id="{b["id"]}"]').click(modifiers=['ControlOrMeta'])
    context_item(page, a['id'], 'Combine (2)...')
    assert page.evaluate('() => window.__moldenGridBuilds.map(x => x.index)') == [1, 2], 'Operand menus must not evaluate unused MOs'
    page.locator('.vm-combine-popover__button.is-primary').click()
    page.wait_for_function('() => window.__arithmeticResults.length === 1')
    page.wait_for_function("() => document.querySelector('.vm-combine-popover').hidden")
    result = page.evaluate('() => window.__arithmeticResults[0]')
    assert result['ok'] and not result['sameVolume'], result
    assert abs(result['output'] - 2 * result['inputs'][0]) < 1e-6, result
    assert page.evaluate('() => window.__arithmeticWorkers') == 1
    combination = cubes(page)[-1]
    context_item(page, combination['id'], 'Combine...')
    page.locator('.vm-combine-popover__button.is-primary').click()
    page.wait_for_function('() => window.__arithmeticResults.length === 2')
    page.wait_for_function("() => document.querySelector('.vm-combine-popover').hidden")
    # Updating the parent must also refresh its dependent absolute-value layer.
    context_item(page, combination['id'], 'Edit combination...')
    page.locator('.vm-combine-popover__coefficient').nth(1).fill('1')
    page.locator('.vm-combine-popover__coefficient').nth(1).press('Tab')
    page.locator('.vm-combine-popover__button.is-primary').click()
    page.wait_for_function('() => window.__arithmeticResults.length === 4')
    page.wait_for_function("() => document.querySelector('.vm-combine-popover').hidden")
    assert all(result['output'] < 1e-7 for result in page.evaluate('() => window.__arithmeticResults.slice(2)'))
    before = snapshot(page)
    redraw(page)
    assert snapshot(page) == before, {'before': before, 'after': snapshot(page)}


def trajectory_text(frames):
    return ''.join(f'2\nframe {index}\nC {index * 0.05} 0 0\nH {1 + index * 0.05} 0 0\n' for index in range(frames))


def synchronized_trajectories(page, dialogs):
    page.locator('#modeDisplayBtn').click()
    result = load(page, [{'name': 'short.xyz', 'text': trajectory_text(3)}, {'name': 'long.xyz', 'text': trajectory_text(5)}])
    assert result['ok'] and result['loadedCount'] == 2
    rows = page.locator('.trajectorySceneRow')
    assert rows.count() == 2
    rows.nth(0).get_by_label('Loop', exact=True).uncheck()
    for i in range(2):
        rows.nth(i).get_by_label('Sync', exact=True).check()
    master = page.locator('#trajectorySyncMaster')
    slider = master.locator('input[type=range]')
    assert slider.get_attribute('max') == '4'
    slider.evaluate("el => { el.value='4'; el.dispatchEvent(new Event('input', {bubbles:true})); }")
    assert rows.nth(0).locator('.trajectoryFrameReadout').inner_text() == '3/3'
    assert rows.nth(1).locator('.trajectoryFrameReadout').inner_text() == '5/5'
    assert rows.nth(0).get_by_label('FPS', exact=True).is_disabled()
    slider.evaluate("el => { el.value='0'; el.dispatchEvent(new Event('input', {bubbles:true})); }")
    master.get_by_role('button', name='Play synchronized trajectories').click()
    page.wait_for_function("() => document.querySelectorAll('.trajectoryFrameReadout')[1].textContent !== '1/5'")
    master.get_by_role('button', name='Pause synchronized trajectories').click()
    rows.nth(0).get_by_label('Sync', exact=True).uncheck()
    assert not rows.nth(0).get_by_label('FPS', exact=True).is_disabled()
    assert rows.nth(1).get_by_label('FPS', exact=True).is_disabled()


def commands(page, dialogs):
    def check(label, actual, expected):
        row = dict(case=label, actual=actual, expected=expected)
        print('[premerge commands] ' + json.dumps(row, sort_keys=True), flush=True)
        assert json.dumps(actual, sort_keys=True) == json.dumps(expected, sort_keys=True), row

    def invoke(id_, params=None, *, target=None):
        active = page if target is None else target
        return active.evaluate('({id, params}) => VibeMolCommands.run(id, params)', dict(id=id_, params=params or {}))

    def success(id_, params=None, *, target=None):
        result = invoke(id_, params, target=target)
        check(id_ + ' command result', True if result['ok'] is True else result, True)
        return result['value']

    app_version = re.search(r"const APP_VERSION = '([^']+)'",
                            (ROOT / 'assets/app/js/asset-urls.js').read_text())[1]
    check('app.info versions', success('app.info'), dict(appVersion=app_version, commandVersion=1))
    water = (ROOT / 'assets/fragments/water.xyz').read_text()
    check('loaded water', success('files.load', {'files': [{'name': 'water.xyz', 'text': water}]}),
          dict(ok=True, loadedCount=1, loadedNames=['water.xyz']))
    fresh_options = success('calculations.state')['options']
    success('calculations.configure', fresh_options)
    check('fresh Calculations options round trip', success('calculations.state')['options'], fresh_options)
    preset = success('preset.export')
    axes_key = 'global.showAxes'
    original_axes = preset['settings'][axes_key]
    changed_axes = not original_axes
    changed_preset = {**preset, 'settings': {**preset['settings'], axes_key: changed_axes}}
    import_result = success('preset.import', {'preset': changed_preset})
    check('preset import applied axes setting', axes_key in import_result['applied'], True)
    check('preset axes round trip', success('preset.export')['settings'][axes_key], changed_axes)
    success('preset.import', {'preset': preset})
    check('restored preset axes setting', success('preset.export')['settings'][axes_key], original_axes)
    check('entered Edit', success('edit.enter', {'tool': 'transform'}),
          dict(mode='edit', tool='transform'))
    atoms = success('edit.context')['atoms']
    check('water atom labels', [atom['label'] for atom in atoms], ['O1', 'H1', 'H2'])
    selection = dict(atomIds=[atoms[0]['id'], atoms[1]['id']], indices=[0, 1], count=2)
    check('set two atoms', success('edit.setSelection', {'selector': {'kind': 'labels', 'labels': ['O1', 'H1']}}), selection)
    refused_selection = invoke('edit.setSelection', {'selector': {'kind': 'labels', 'labels': ['Ar1']}})
    check('refused Edit selection', [refused_selection.get('ok'), refused_selection.get('error', {}).get('code'),
                                     refused_selection.get('error', {}).get('details', {}).get('code')],
          [False, 'rejected', 'ELEMENT_ABSENT'])
    check('read two atoms', success('edit.getSelection'), selection)

    basis = success('calculations.ready')
    check('oxygen basis', isinstance(basis, dict) and bool(basis.get('8')), True)
    unavailable_shell = {'index': 0, 'shell': '9f'}
    check('refused shell assignment', invoke('calculations.selectShell', unavailable_shell), {
        'ok': False, 'error': {'code': 'rejected', 'message': 'The requested shell toggle was not applied',
                               'details': {'requested': unavailable_shell, 'applied': False, 'assigned': False,
                                           'message': 'The requested shell toggle was not applied'}},
    })
    check('empty state after refused shell', success('calculations.state')['selections'], [])
    shell = {'index': 0, 'shell': '2p'}
    check('shell toggled on', success('calculations.selectShell', shell), dict(requested=shell, applied=True, assigned=True))
    check('shell toggled off', success('calculations.selectShell', shell), dict(requested=shell, applied=True, assigned=False))
    check('empty state after removing shell', success('calculations.state')['selections'], [])
    check('shell toggled back on', success('calculations.selectShell', shell), dict(requested=shell, applied=True, assigned=True))
    success('calculations.configure', {'method': 'cumulative', 'sigma': 0.9})
    state = success('calculations.state')
    check('shell assignment', state['selections'], [{'id': atoms[0]['id'], 'shells': {'2p': 'all'}}])
    check('applied AVAS options', [state['options'][key] for key in ('method', 'sigma')], ['cumulative', 0.9])
    avas = success('forte2.export', {'avas': {}})
    check('exported AVAS arguments', avas['avas']['arguments'],
          dict(subspace=['O(2p)'], selection_method='cumulative', sigma=0.9, diagonalize=True))

    structure = json.loads(success('structure.export'))['volume']
    text = success('session.export')
    check('exported session text', isinstance(text, str) and bool(text), True)
    context = page.context.browser.new_context(viewport=page.viewport_size)
    reopened = context.new_page()
    errors = []
    reopened.on('pageerror', lambda error: errors.append(str(error)))
    try:
        reopened.goto(page.url, wait_until='domcontentloaded')
        reopened.wait_for_function('() => !!window.VibeMolCommands')
        imported = success('session.import', {'text': text}, target=reopened)
        check('session import counts', [imported[key] for key in ('ok', 'sceneCount', 'sourceCount')], [True, 1, 1])
        check('restored structure', json.loads(success('structure.export', target=reopened))['volume'], structure)
        check('restored mode', success('edit.context', target=reopened)['mode'], 'display')
        check('restored selection', success('edit.getSelection', target=reopened),
              dict(atomIds=[], indices=[], count=0))
        check('reopened page errors', errors, [])
    except Exception:
        write_failure_artifacts(reopened, ARTIFACTS, 'premerge-commands-reopened', errors, [])
        raise
    finally:
        context.close()

    empty_selection = dict(atomIds=[], indices=[], count=0)
    check('Edit selection before clear', success('edit.getSelection'), selection)
    check('clear Edit selection', success('edit.clearSelection'), empty_selection)
    check('read cleared Edit selection', success('edit.getSelection'), empty_selection)

    success('calculations.configure', {'cas': [2, None]})
    partial_options = success('calculations.state')['options']
    check('partially cleared CAS', partial_options['cas'], [2, None])
    success('calculations.configure', partial_options)
    check('partial CAS options round trip', success('calculations.state')['options'], partial_options)

    check('invalid params envelope', invoke('edit.setSelection'), {
        'ok': False, 'error': {'code': 'invalid-params', 'message': 'Invalid command parameters',
                               'details': [{'path': '$.selector', 'message': 'Required property'}]},
    })
    check('unknown command envelope', invoke('app.unknown'),
          {'ok': False, 'error': {'code': 'unknown-command', 'message': 'Unknown command id'}})
    helium = {'name': 'separated.xyz', 'text': '2\nSeparated helium atoms\nHe 0 0 0\nHe 12 0 0\n'}
    check('ambiguous XYZ load settles', success('files.load', {'files': [helium]}),
          dict(ok=True, loadedCount=1, loadedNames=['separated.xyz']))
    check('ambiguous XYZ confirmation', dialogs, [{
        'type': 'confirm',
        'message': 'No bonds were detected in "separated.xyz" using angstrom coordinates.\n\n'
                   'These XYZ coordinates might be in bohr. Convert them to angstroms (1 bohr = 0.529177 angstrom)?\n\n'
                   'OK: convert from bohr.\nCancel: keep the original coordinates as angstroms.',
    }])
    return dict(restoredSceneCount=imported['sceneCount'], restoredSourceCount=imported['sourceCount'], dialogCount=len(dialogs))


STEP3B_COMMAND_COMPLETION = {
    'commands': ['orbitals.configure', 'orbitals.hide', 'orbitals.list', 'orbitals.show',
                 'vectors.clear', 'vectors.list', 'vectors.remove', 'vectors.setArrow', 'vectors.setAtoms',
                 'view.set', 'view.setMode', 'view.snapshot'],
    'successes': 32, 'rejections': 31, 'errorCodes': ['failed', 'invalid-params', 'not-available'],
}


def run_commands(browser, url):
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    errors, console_errors, dialogs = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
    def dismiss_dialog(dialog):
        dialogs.append(dict(type=dialog.type, message=dialog.message))
        dialog.dismiss()
    page.on('dialog', dismiss_dialog)
    try:
        page.goto(url, wait_until='domcontentloaded')
        page.wait_for_function('() => !!window.VibeMolCommands')
        completion = commands(page, dialogs)
        expected = dict(restoredSceneCount=1, restoredSourceCount=1, dialogCount=1)
        row = dict(case='workflow completion', actual=completion, expected=expected)
        print('[premerge commands] ' + json.dumps(row, sort_keys=True), flush=True)
        assert completion == expected, row
        step3b = step3b_command_cases(page)
        print('[premerge commands] ' + json.dumps({
            'case': 'Step 3b workflow completion', 'actual': step3b, 'expected': STEP3B_COMMAND_COMPLETION,
        }, sort_keys=True), flush=True)
        assert step3b == STEP3B_COMMAND_COMPLETION, step3b
        print('[premerge commands] ' + json.dumps(dict(case='page errors', actual=errors, expected=[])), flush=True)
        assert not errors, errors
    except Exception:
        write_failure_artifacts(page, ARTIFACTS, 'premerge-commands', errors, console_errors)
        raise
    finally:
        context.close()
    print('[commands-completion] ' + json.dumps(completion, sort_keys=True), flush=True)
    print('[step3b-command-completion] ' + json.dumps(step3b, sort_keys=True), flush=True)


def embed_bridge(page, url):
    token = 'embed-bridge-test-token-0123456789abcdef'
    fixture = url + 'tests/fixtures/embed-bridge.html'
    page.goto(fixture)
    page.evaluate("""() => {
      window.messages = [];
      addEventListener('message', event => {
        const frame = [...document.querySelectorAll('iframe')].find(el => el.contentWindow === event.source);
        if (frame && event.data?.channel === 'vibemol.embed') messages.push({ frame: frame.id, ...event.data });
      });
    }""")

    def check(case, actual, expected):
        row = dict(case=case, actual=actual, expected=expected)
        print('[premerge embed bridge] ' + json.dumps(row, sort_keys=True), flush=True)
        assert json.dumps(actual, sort_keys=True) == json.dumps(expected, sort_keys=True), row

    def frame(name, src):
        page.evaluate("""({name, src}) => {
          const iframe = document.createElement('iframe');
          iframe.id = iframe.name = name;
          iframe.width = 1100;
          iframe.height = 650;
          iframe.src = src;
          document.body.append(iframe);
        }""", dict(name=name, src=src))
        page.wait_for_function("""({name, src}) => {
          const iframe = document.getElementById(name);
          return iframe.contentWindow.location.pathname === new URL(src).pathname && !!iframe.contentDocument.body;
        }""", arg=dict(name=name, src=src))

    def send(id_, command, params=None, *, target='viewer', key=token, sender=page):
        sender.evaluate("""({target, request}) => {
          const owner = window === parent ? window : parent;
          owner.document.getElementById(target).contentWindow.postMessage(request, location.origin);
        }""", dict(target=target, request=dict(channel='vibemol.embed', v=1, token=key,
                                             kind='request', id=id_, command=command, params=params or {})))

    def messages(kind, target='viewer'):
        return page.evaluate("({kind,target}) => messages.filter(m => m.kind === kind && m.frame === target)",
                             dict(kind=kind, target=target))

    def response(id_):
        return page.wait_for_function(
            "id => messages.find(m => m.frame === 'viewer' && m.kind === 'response' && m.id === id)", arg=id_
        ).json_value()['result']

    def states(count):
        page.wait_for_function("n => messages.filter(m => m.frame === 'viewer' && m.kind === 'state').length >= n", arg=count)
        return [m['state'] for m in messages('state')]

    frame('viewer', f'{url}?embed=commands#vmtoken={token}')
    viewer = page.frame(name='viewer')
    ready = page.wait_for_function("() => messages.find(m => m.frame === 'viewer' && m.kind === 'ready')").json_value()
    check('ready envelope', ready, dict(frame='viewer', channel='vibemol.embed', v=1, token=token, kind='ready',
                                       info=dict(appVersion=read_app_version(), commandVersion=1)))
    check('fragment stripped', viewer.evaluate('location.hash'), '')

    send('water', 'files.load', {'files': [{'name': 'water.xyz', 'text': (ROOT/'assets/fragments/water.xyz').read_text()}]})
    check('load response', response('water'), dict(ok=True, value=dict(ok=True, loadedCount=1, loadedNames=['water.xyz'])))
    initial = dict(atomIds=[], indices=[], count=0)
    calculations = viewer.evaluate("async () => (await VibeMolCommands.run('calculations.state')).value")
    expected = [dict(selection=initial, calculations=calculations)]
    check('load broadcasts one snapshot', states(1), expected)

    send('mode', 'edit.enter', {'tool': 'transform'})
    check('mode response', response('mode'), dict(ok=True, value=dict(mode='edit', tool='transform')))
    send('selection', 'edit.setSelection', {'selector': {'kind': 'labels', 'labels': ['O1', 'H1']}})
    atoms = viewer.evaluate("() => VibeMolEdit.context().value.atoms.map(atom => atom.id)")
    selected = dict(atomIds=atoms[:2], indices=[0, 1], count=2)
    check('selection response', response('selection'), dict(ok=True, value=selected))
    expected.append(dict(selection=selected, calculations=calculations))
    check('selection broadcasts one snapshot', states(2), expected)

    direct = viewer.evaluate("""() => {
      const found = VibeMolEdit.resolveSelection({kind: 'labels', labels: ['H2']});
      const result = VibeMolEdit.setSelection(found.value);
      document.dispatchEvent(new Event('pointerup'));
      document.dispatchEvent(new Event('keyup'));
      return result.value;
    }""")
    direct_selection = dict(atomIds=atoms[2:], indices=[2], count=1)
    check('direct selection applied', direct, direct_selection)
    expected.append(dict(selection=direct_selection, calculations=calculations))
    check('debounced interactions broadcast one snapshot', states(3), expected)

    frame('sibling', fixture)
    send('wrong-token', 'edit.clearSelection', key='invalid-012345678901234567890123456789')
    send('wrong-source', 'edit.clearSelection', sender=page.frame(name='sibling'))
    send('fence', 'edit.getSelection')
    check('rejected inputs preserve active selection', response('fence'), dict(ok=True, value=direct_selection))

    frame('inactive', f'{url}#vmtoken={token}')
    inactive = page.frame(name='inactive')
    inactive.wait_for_function('() => !!window.VibeMolCommands')
    read_context = "() => VibeMolCommands.run('edit.context')"
    inactive_before = inactive.evaluate(read_context)
    inactive.evaluate("""() => {
      addEventListener('message', event => {
        if (event.data?.id === 'inactive') document.body.dataset.seenRequest = 'yes';
      });
    }""")
    send('inactive', 'files.load', {'files': [{'name': 'wrong.xyz', 'text': '1\nwrong\nHe 0 0 0\n'}]}, target='inactive')
    inactive.wait_for_function("() => document.body.dataset.seenRequest === 'yes'")
    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    check('inactive fragment retained', inactive.evaluate('location.hash'), f'#vmtoken={token}')
    check('inactive received no bridge messages', page.evaluate("() => messages.filter(m => m.frame === 'inactive')"), [])
    check('inactive workspace unchanged', inactive.evaluate(read_context), inactive_before)
    check('exact response sequence', [m['id'] for m in messages('response')], ['water', 'mode', 'selection', 'fence'])
    check('exact final state sequence', [m['state'] for m in messages('state')], expected)
    check('one ready message', len(messages('ready')), 1)
    return dict(responses=len(messages('response')), snapshots=len(messages('state')), ignoredRequests=3)


def run_embed_bridge(browser, url):
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        completion = embed_bridge(page, url)
        assert completion == dict(responses=4, snapshots=3, ignoredRequests=3), completion
        assert not errors, errors
    except Exception:
        write_failure_artifacts(page, ARTIFACTS, 'premerge-embed-bridge', errors, [])
        raise
    finally:
        context.close()
    print('[embed-bridge-completion] ' + json.dumps(completion, sort_keys=True), flush=True)


def main():
    from atomic_identity import run as atomic_identity
    with run_http_server(ROOT) as url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for run in (atomic_identity, scene_creation, molecule_styles, orbital_reference_presets, imports, psi4_frequencies,
                        cfour_frequencies, xyz_units, clipboard_roundtrip, clipboard_edit_selection,
                        persistence, batch_export, orbital_group_appearance, molden_group_appearance,
                        molden_browsing, molden_fractional_occupations, arithmetic, synchronized_trajectories):
                context = browser.new_context(viewport={'width': 1440, 'height': 1000})
                page = context.new_page()
                errors, console_errors, dialogs = [], [], []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
                page.on('dialog', lambda dialog: (dialogs.append(dialog.message),
                    dialog.accept() if dialog.type == 'confirm' and getattr(page, '_accept_xyz_conversion', False)
                    else dialog.dismiss()))
                try:
                    page.goto(url+'?workspaceLab=0', wait_until='domcontentloaded')
                    page.wait_for_function('() => window.VibeMolEmbed && window.VibeMolTesting')
                    run(page, dialogs)
                    assert not errors, errors
                    print(f'[premerge] {run.__name__}: passed', flush=True)
                except Exception:
                    write_failure_artifacts(page, ARTIFACTS, f'premerge-{run.__name__}', errors, console_errors)
                    raise
                finally:
                    context.close()
            run_commands(browser, url)
            run_embed_bridge(browser, url)
        finally:
            browser.close()
    from edit_api import run_matrix as edit_api_matrix
    edit_api_matrix(ARTIFACTS/'validated-edit-api')
    from edit_testing_adapters import run_matrix as edit_testing_matrix
    edit_testing_matrix(ARTIFACTS/'edit-testing-adapters')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
