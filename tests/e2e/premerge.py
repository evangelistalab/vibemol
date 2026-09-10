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

from playwright.sync_api import sync_playwright
from helpers import ensure_artifact_dir, run_http_server, write_failure_artifacts

ROOT = pathlib.Path(__file__).resolve().parents[2]
ARTIFACTS = ensure_artifact_dir(pathlib.Path(os.environ.get('VIBEMOL_TEST_ARTIFACT_DIR', str(ROOT / 'out' / 'test-artifacts'))))


def cube(shift: float) -> str:
    header = ['Regression fixture', 'Gaussian scalar field', '1 -4 -4 -4', '9 1 0 0', '9 0 1 0', '9 0 0 1', '1 1 0 0 0']
    values = [0.15 * math.exp(-0.8 * ((i - 4 - shift) ** 2 + (j - 4) ** 2 + (k - 4) ** 2))
              for i in range(9) for j in range(9) for k in range(9)]
    return '\n'.join(header + [' '.join(f'{value:.6e}' for value in values)]) + '\n'


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
    page.locator('#moleculeStyle').evaluate("el => { el.value = 'toon'; el.dispatchEvent(new Event('change', {bubbles:true})); }")


def load_cubes(page):
    result = load(page, [{'name': 'a.cube', 'text': cube(-1)}, {'name': 'b.cube', 'text': cube(1)}])
    assert result['ok'] and result['loadedCount'] == 2, result


def molecule_styles(page, dialogs):
    page.locator('#modeDisplayBtn').click()
    assert load(page, [{'name': 'bond.xyz', 'text': '2\nStyle fixture\nC 0 0 0\nC 1.34 0 0\n'}])['ok']
    styles = ['basic', 'toon', 'kit']
    assert page.locator('#moleculeStyle option').evaluate_all('els => els.map(el => el.value)') == styles
    chips = page.locator('#appearanceMoleculeStyleGroup [role=radio]')
    assert chips.evaluate_all('els => els.map(el => el.dataset.value)') == styles
    page.locator('#displayInspectorBtn').click()
    for style in styles:
        page.locator(f'#appearanceMoleculeStyleGroup [data-value="{style}"]').click()
        assert page.locator('#moleculeStyle').input_value() == style
        rendered = page.evaluate('() => window.VibeMolTesting.getMoleculeRenderSnapshot()')
        assert rendered['atomCount'] == 2 and rendered['bondCarrierCount'] >= 1, rendered
        carriers = page.evaluate('() => window.VibeMolTesting.getBondCarrierSnapshots()')
        expected = ('kit', 'kitCurved') if style == 'kit' else ('basic',)
        assert carriers and all(carrier['connectorStyle'] in expected for carrier in carriers), carriers
        assert page.evaluate('() => window.VibeMolPreset.export().settings["molecule.style"]') == style
    for key, style in zip(('1', '2', '3'), styles):
        page.keyboard.press(key)
        assert page.locator('#moleculeStyle').input_value() == style
    page.keyboard.press('4')
    assert page.locator('#moleculeStyle').input_value() == 'kit'

    # Saved presets can still name a retired style; the normal fallback must render.
    page.evaluate('''() => window.VibeMolPreset.import({kind:'vibemol.preset', presetVersion:1,
      settings:{'molecule.style':'glossy'}})''')
    assert page.locator('#moleculeStyle').input_value() == 'basic'
    assert page.evaluate('() => window.VibeMolPreset.export().settings["molecule.style"]') == 'basic'
    assert page.evaluate('() => !window.VibeMolPreset.listKeys().includes("molecule.glossyBondRadius")')
    assert page.locator('#rowGlossyBond, #glossyBondRadius').count() == 0

    # The edit-only bond-order shortcut is independent of the style shortcuts.
    page.locator('#modeEditBtn').click()
    page.keyboard.press('/')
    page.locator('#editAddQuick button[data-z="6"]').click()
    page.keyboard.press('4')
    assert 'bond order: 4' in page.evaluate('() => window.VibeMolTesting.getHintMessage()')
    assert page.locator('#moleculeStyle').input_value() == 'basic'


def imports(page, dialogs):
    assert load(page, [{'name': 'a.cube', 'text': cube(-1)}])['loadedCount'] == 1
    appended = load(page, [{'name': 'b.cube', 'text': cube(1)}], clear_first=False)
    assert appended == {'ok': True, 'loadedCount': 1, 'loadedNames': ['b.cube']}, appended
    assert [layer['name'] for layer in cubes(page)] == ['a.cube', 'b.cube']
    before = snapshot(page)
    rejected = load(page, [{'name': 'bad.cube', 'text': 'not a cube'}])
    assert not rejected['ok'] and rejected['loadedNames'] == [], rejected
    assert snapshot(page) == before, {'before': before, 'after': snapshot(page)}
    assert 'bad.cube' in dialogs[-1]
    # The picker uses exactly the same failure handling and supports partial success.
    page.locator('#fileInput').set_input_files([
        {'name': 'bad.xyz', 'mimeType': 'text/plain', 'buffer': b'3\ninvalid\n'},
        {'name': 'c.cube', 'mimeType': 'text/plain', 'buffer': cube(0).encode()},
    ])
    page.wait_for_function("() => window.VibeMolTesting.getSceneGraphSnapshot().scenes.flatMap(s=>s.layers).filter(l=>l.kind==='cube').length === 3")
    assert any('bad.xyz' in message for message in dialogs)
    # A sidecar alongside a new primary must not divert the batch to a destructive loader.
    sidecar = json.dumps({'kind':'vibemol.vibrations', 'version':1, 'units':'angstrom', 'atomCount':2, 'atomSymbols':['C','C'], 'modes':[{'frequencyCm1':245, 'displacements':[-0.18,0,0,0.18,0,0]}]})
    xyz = '2\nSidecar fixture\nC -0.7 0 0\nC 0.7 0 0\n'
    result = load(page, [{'name': 'sample.vib.json', 'text': sidecar}, {'name': 'sample.xyz', 'text': xyz}], clear_first=False)
    assert result['ok'] and result['loadedCount'] == 2, result
    assert len(cubes(page)) == 3
    assert page.evaluate("() => !!window.VibeMolStructure.exportActive().volume.vibration")


CLIPBOARD_MODIFIER = 'Meta' if sys.platform == 'darwin' else 'Control'


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
    page.locator('#schemeSelect').select_option('classic')
    set_surface_control(page, '#posColor', '#12ab34')
    set_surface_control(page, '#negColor', '#bc23de')
    set_surface_control(page, '#opacity', 0.65)
    page.locator('#surfaceMaterialPreset').select_option('matte')
    page.locator('#surfaceSignFlipBtn').check()
    page.locator('#appearanceRenderModeGroup [data-value="cloud"]').click()
    page.locator('#appearanceCloudTypeGroup [data-value="points"]').click()
    edited = cubes(page)
    for layer in edited[:2]:
        assert layer['iso'] == 0.045 and layer['opacity'] == 0.65, layer
        assert layer['colorScheme'] == 'custom' and layer['posColor'] == '#12ab34' and layer['negColor'] == '#bc23de', layer
        assert layer['solidPreset'] == 'matte' and layer['signFlip'], layer
        assert layer['renderMode'] == 'cloud' and layer['cloudType'] == 'points', layer
    assert edited[2] == other_before
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
    assert reset[2] == other_before


def molden_group_appearance(page, dialogs):
    page.add_init_script('(' + MOLDEN_GRID_OBSERVER + ')()')
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('() => window.VibeMolTesting')
    assert load(page, [{'name':'group.molden', 'text':MOLDEN}])['ok']
    layers = cubes(page)
    group_id = layers[0]['parentId']
    page.locator(f'.vm-outliner-row[data-id="{group_id}"]').click()
    assert page.locator('#surfaceScopeLabel').inner_text() == 'All 3 surfaces in Orbitals'
    assert page.locator('#appearanceSurfacesSection').is_visible()
    page.locator('#autoIsoBtn').check()
    assert all(layer['autoIso'] for layer in cubes(page))
    page.locator('#autoIsoBtn').uncheck()
    set_surface_control(page, '#iso', 0.035)
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


def main():
    with run_http_server(ROOT) as url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for run in (molecule_styles, imports, xyz_units, clipboard_roundtrip, clipboard_edit_selection,
                        persistence, batch_export, orbital_group_appearance, molden_group_appearance,
                        molden_browsing, arithmetic, synchronized_trajectories):
                context = browser.new_context(viewport={'width': 1440, 'height': 1000})
                page = context.new_page()
                errors, console_errors, dialogs = [], [], []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
                page.on('dialog', lambda dialog: (dialogs.append(dialog.message),
                    dialog.accept() if dialog.type == 'confirm' and getattr(page, '_accept_xyz_conversion', False)
                    else dialog.dismiss()))
                try:
                    page.goto(url, wait_until='domcontentloaded')
                    page.wait_for_function('() => window.VibeMolEmbed && window.VibeMolTesting')
                    run(page, dialogs)
                    assert not errors, errors
                    print(f'[premerge] {run.__name__}: passed', flush=True)
                except Exception:
                    write_failure_artifacts(page, ARTIFACTS, f'premerge-{run.__name__}', errors, console_errors)
                    raise
                finally:
                    context.close()
        finally:
            browser.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
