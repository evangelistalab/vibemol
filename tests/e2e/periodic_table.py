#!/usr/bin/env python3
"""Direct periodic-table extraction gate; compares the tagged base and current UI."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright
from helpers import run_http_server
from characterize import unexpected_console

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('VIBEMOL_TEST_ARTIFACT_DIR', str(ROOT / 'out/test-artifacts/periodic-table')))

OBSERVER = '''() => {
  const probe = window.__periodicProbe = { frames: 0, mainFrames: 0 };
  const before = THREE.Mesh.prototype.onBeforeRender;
  THREE.Mesh.prototype.onBeforeRender = function(renderer, scene, camera, ...rest) {
    if (this.userData?.periodicZ === 1) {
      probe.scene = scene; probe.camera = camera; probe.frames++;
    } else if (this.userData?.type === 'atom' && this.userData.index === 0) probe.mainFrames++;
    return before.call(this, renderer, scene, camera, ...rest);
  };
}'''

SNAPSHOT = '''() => {
  const p = __periodicProbe;
  const nodes = [];
  if (p.scene) p.scene.traverse(node => {
    if (Number.isInteger(node.userData?.periodicZ)) nodes.push({
      Z: node.userData.periodicZ, position: node.position.toArray(), scale: node.scale.toArray(),
      color: node.material.color.getHexString(), emissive: node.material.emissiveIntensity,
      outline: node.children[0].material.opacity, label: node.children[1].material.opacity,
    });
  });
  const c = p.camera, canvas = document.getElementById('periodicTableCanvas');
  return {
    open: document.getElementById('elementColorOverlay').getAttribute('aria-hidden'),
    name: document.getElementById('elementColorName').textContent,
    picker: document.getElementById('elementColorPicker').value,
    size: [canvas.width, canvas.height],
    camera: c ? [c.left, c.right, c.top, c.bottom, c.near, c.far, c.zoom] : null,
    nodes,
    overrides: VibeMolPreset.export().settings['global.elementColorOverrides'],
  };
}'''


def presented(page):
    count = page.evaluate('() => __periodicProbe.frames')
    page.wait_for_function('n => __periodicProbe.frames > n', arg=count)


def pick(page, z):
    point = page.evaluate('''z => {
      const p = __periodicProbe; let found;
      p.scene.traverse(node => { if (node.userData?.periodicZ === z) found = node; });
      const v = found.getWorldPosition(new THREE.Vector3()).project(p.camera);
      const r = document.getElementById('periodicTableCanvas').getBoundingClientRect();
      return {x:r.left+(v.x+1)*r.width/2, y:r.top+(1-v.y)*r.height/2};
    }''', z)
    page.mouse.click(point['x'], point['y'])
    page.wait_for_function('z => elementColorName.textContent.endsWith("(Z="+z+")")', arg=z)
    presented(page)


def change(page, color, event):
    page.locator('#elementColorPicker').evaluate('''(el, data) => {
      el.value=data.color; el.dispatchEvent(new Event(data.event,{bubbles:true}));
    }''', {'color': color, 'event': event})
    presented(page)


def run(browser, root, label):
    records = {}
    with run_http_server(root) as url:
        for legacy, theme, size in [(False, 'light', (1440, 1000)), (False, 'dark', (445, 655)),
                                    (True, 'light', (445, 655)), (True, 'dark', (1440, 1000))]:
            context = browser.new_context(viewport={'width': size[0], 'height': size[1]})
            context.add_init_script('localStorage.setItem("vibemol.uiTheme", ' + json.dumps(theme) + ');')
            page = context.new_page()
            errors, console = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda msg: console.append({'type': msg.type, 'text': msg.text}) if msg.type in ('error', 'warning') else None)
            page.goto(url + '?appearanceStudy=1' + ('&workspaceLab=0' if legacy else ''))
            page.wait_for_function('() => window.VibeMolAppearanceLooks && window.VibeMolSession')
            page.evaluate(OBSERVER)
            assert page.evaluate('() => __periodicProbe.frames') == 0
            assert page.evaluate('async () => (await VibeMolEmbed.loadFiles([{name:"carbon.xyz",text:"1\\ncarbon\\nC 0 0 0\\n"}],{clearFirst:true})).ok')
            page.evaluate('() => VibeMolAppearanceLooks.openStudio(); document.getElementById("studioElementColorEdit").click()')
            presented(page)
            history = {'initial': page.evaluate(SNAPSHOT)}
            assert history['initial']['name'].endswith('(Z=6)')
            assert len(history['initial']['nodes']) == 100
            pick(page, 8)
            change(page, '#2468ab', 'input')
            change(page, '#3579bd', 'change')
            history['editedOxygen'] = page.evaluate(SNAPSHOT)
            assert history['editedOxygen']['overrides']['8'] == '#3579bd'
            assert next(n for n in history['editedOxygen']['nodes'] if n['Z'] == 8)['color'] == '3579bd'
            page.locator('#elementColorResetOne').click()
            presented(page)
            history['resetOne'] = page.evaluate(SNAPSHOT)
            assert '8' not in history['resetOne']['overrides']
            pick(page, 6)
            change(page, '#123456', 'change')
            # Exercise the pending native-picker value on preset save as well as ordinary input/change.
            page.locator('#elementColorPicker').evaluate('el => el.value="#abcdef"')
            page.evaluate('() => VibeMolPreset.download()')
            history['pendingSaved'] = page.evaluate(SNAPSHOT)
            assert history['pendingSaved']['overrides']['6'] == '#abcdef'
            page.locator('#elementColorResetAll').click()
            presented(page)
            history['resetAll'] = page.evaluate(SNAPSHOT)
            assert not history['resetAll']['overrides']
            # Import refreshes existing swatches/picker; the controller must read live appearance state.
            assert page.evaluate('''() => VibeMolPreset.import({kind:VibeMolPreset.kind,version:VibeMolPreset.version,
              settings:{'global.elementColorOverrides':{6:'#fedcba'},'global.elementColors':false}}, {mode:'strict'}).ok''')
            presented(page)
            history['imported'] = page.evaluate(SNAPSHOT)
            assert history['imported']['picker'] == '#fedcba'
            exported = page.evaluate('() => VibeMolSession.export()')
            page.locator('#elementColorClose').click()
            page.wait_for_function('() => elementColorOverlay.style.display === "none"')
            frames = page.evaluate('() => [__periodicProbe.frames, __periodicProbe.mainFrames]')
            page.wait_for_function('n => __periodicProbe.mainFrames > n + 2', arg=frames[1])
            assert page.evaluate('() => __periodicProbe.frames') == frames[0]
            page.evaluate('() => VibeMolAppearanceLooks.openStudio(); document.getElementById("studioElementColorEdit").click()')
            presented(page)
            history['reopened'] = page.evaluate(SNAPSHOT)
            assert history['reopened'] == history['imported']
            page.keyboard.press('Escape')
            page.wait_for_function('() => elementColorOverlay.style.display === "none"')
            page.set_viewport_size({'width': 1100, 'height': 800})
            page.evaluate('() => VibeMolAppearanceLooks.openStudio(); document.getElementById("studioElementColorEdit").click()')
            presented(page)
            history['resized'] = page.evaluate(SNAPSHOT)
            page.locator('#elementColorOverlay').click(position={'x': 2, 'y': 2})
            page.wait_for_function('() => elementColorOverlay.style.display === "none"')
            assert page.evaluate('value => VibeMolSession.import(value)', exported)['ok']
            page.evaluate('() => VibeMolAppearanceLooks.openStudio(); document.getElementById("studioElementColorEdit").click()')
            presented(page)
            history['restored'] = page.evaluate(SNAPSHOT)
            assert history['restored']['picker'] == '#fedcba'
            case = ('legacy' if legacy else 'workbench') + '/' + theme
            page.screenshot(path=str(OUT / (label + '-' + case.replace('/', '-') + '.png')))
            errors += unexpected_console(console)
            assert not errors, errors
            records[case] = {'history': history, 'console': errors}
            context.close()
            print('[periodic-table] ' + label + ': ' + case + ' passed', flush=True)
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, default=ROOT)
    parser.add_argument('--base-root', type=Path)
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        try:
            base = run(browser, args.base_root, 'base') if args.base_root else None
            current = run(browser, args.source_root, 'current')
            if base is not None:
                assert current == base, 'Periodic-table interaction captures changed from the tagged base.'
            report = {'sourceAppSha256': hashlib.sha256((args.source_root / 'assets/app/js/app.js').read_bytes()).hexdigest(),
                      'baseCompared': base is not None, 'exactMatch': current == base if base else None,
                      'cases': current}
            (OUT / 'periodic-table-proof.json').write_text(json.dumps(report, indent=2) + '\n')
        finally:
            browser.close()


if __name__ == '__main__':
    main()
