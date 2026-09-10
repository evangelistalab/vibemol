#!/usr/bin/env python3
"""Browser regressions for scene ownership, imports, arithmetic, and export."""
from __future__ import annotations

import math
import json
import os
import pathlib
import re

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

MOLDEN = '\n'.join(['[Molden Format]', '[Atoms] Angs', 'H 1 1 0.0 0.0 0.0', '[GTO]', '1 0', 's 1 1.0', '1.0 1.0',
                    '[MO]', 'Sym= A1', 'Ene= -0.5', 'Spin= Alpha', 'Occup= 2.0', '1 1.0',
                    'Sym= A1', 'Ene= -0.1', 'Spin= Alpha', 'Occup= 0.0', '1 1.0',
                    'Sym= A1', 'Ene= 0.8', 'Spin= Beta', 'Occup= 0.0', '1 -1.0'])


def arithmetic(page, dialogs):
    page.add_init_script('(' + ARITHMETIC_OBSERVER + ')()')
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('() => window.VibeMolTesting')
    assert load(page, [{'name': 'orbitals.molden', 'text': MOLDEN}])['ok']
    for index in (1, 2):
        page.locator(f'#moldenInspectorBody tbody tr[data-row-index="{index}"]').evaluate('el => el.click()')
        page.wait_for_function('(count) => window.VibeMolTesting.getSceneGraphSnapshot().scenes.flatMap(s=>s.layers).filter(l=>l.kind==="cube").length === count', arg=index)
    a, b = cubes(page)
    assert [a['name'], b['name']] == ['MO 2', 'MO 3']
    page.locator(f'.vm-outliner-row[data-id="{a["id"]}"]').click()
    page.locator(f'.vm-outliner-row[data-id="{b["id"]}"]').click(modifiers=['ControlOrMeta'])
    context_item(page, a['id'], 'Combine (2)...')
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
            for run in (molecule_styles, imports, persistence, batch_export, arithmetic, synchronized_trajectories):
                context = browser.new_context(viewport={'width': 1440, 'height': 1000})
                page = context.new_page()
                errors, console_errors, dialogs = [], [], []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
                page.on('dialog', lambda dialog: (dialogs.append(dialog.message), dialog.dismiss()))
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
