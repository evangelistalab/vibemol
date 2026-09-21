#!/usr/bin/env python3
"""Render the archived Basic comparison from its frozen reference settings."""
import base64
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tests/e2e'))
from helpers import run_http_server
from playwright.sync_api import sync_playwright

DEST = ROOT / 'docs/experiments/style-lab/basic-materials'
SOURCE = ROOT / 'assets/data/methane/canonical_4.cube'
OPTIONS = [
    {'id':'current', 'name':'Original Basic', 'patch':None,
     'description':'Reference: polished atoms and a separate luminous orbital finish.'},
    {'id':'polished', 'name':'A · Polished', 'patch':{},
     'description':'Preserves the original atoms exactly; orbitals gain deeper shadows and rounded highlights.'},
    {'id':'balanced', 'name':'B · Balanced', 'patch':{
        'roughness':0.38, 'metalness':0.04, 'clearcoat':0.9,
        'clearcoatRoughness':0.1, 'emissiveIntensity':0.12},
     'description':'A little color fill softens the shadows while a clearcoat keeps the highlights.'},
    {'id':'luminous', 'name':'C · Luminous', 'patch':{
        'roughness':0.72, 'metalness':0.04, 'clearcoat':1,
        'clearcoatRoughness':0.1, 'emissiveIntensity':0.36},
     'description':'Brighter orbital colors and compact highlights; white atoms have less shading.'},
]


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    reference = json.loads((DEST / 'recipes.json').read_text())['referenceSettings']
    with run_http_server(ROOT) as url, sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=['--use-angle=metal'])
        context = browser.new_context(viewport={'width':640,'height':520}, device_scale_factor=2)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            page.goto(url + '?workspaceLab=0&appearanceStudy=1')
            page.wait_for_function('() => window.VibeMolAppearanceLooks')
            page.locator('#toolbarCollapseBtn').click()
            loaded = page.evaluate('files => VibeMolEmbed.loadFiles(files, {clearFirst:true})', [
                {'name':SOURCE.name, 'text':SOURCE.read_text()}])
            assert loaded['ok'], loaded
            result = page.evaluate('''reference => {
              return VibeMolPreset.import({kind:'vibemol.preset',presetVersion:1,settings:{
                ...reference,
                'global.showAxes':false,'global.showBox':false,'surface.autoIsoEnabled':false,
                'surface.iso':0.06,'surface.opacity':1,'view.autoRotate':false,'view.projection':'perspective'
              }},{mode:'strict'});
            }''', reference)
            assert result['ok'], result
            page.wait_for_function('() => VibeMolTesting.getSurfaceMaterialSnapshot().length>0')
            page.wait_for_function('() => VibeMolTesting.getLookLightingSnapshot().environment')
            camera = page.evaluate('VibeMolTesting.getCameraSnapshot()')
            baseline = page.evaluate('VibeMolAppearanceLooks.snapshot().settings')
            captures = {}
            # Center the subject vertically at these close-up distances. The
            # shift lies in the camera's image plane and leaves its angle fixed.
            up_shift = dict(zip(['x','y','z'], [-0.4 / math.sqrt(6), -0.4 / math.sqrt(6), 0.8 / math.sqrt(6)]))
            for view, scale in [('atoms',0.32),('orbital',0.51)]:
                settings = {'surface.enabled':view=='orbital'}
                for axis in ['x','y','z']:
                    target = camera['target'][axis]
                    settings['view.camera.'+axis] = target + (camera['camera'][axis] - target) * scale + up_shift[axis]
                    settings['view.target.'+axis] = target + up_shift[axis]
                page.evaluate("settings => VibeMolPreset.import({kind:'vibemol.preset',presetVersion:1,settings})", settings)
                fixed_camera = page.evaluate('VibeMolTesting.getCameraSnapshot()')
                captures[view] = fixed_camera
                for option in OPTIONS:
                    page.evaluate('''({patch,reference}) => {
                      VibeMolPreset.import({kind:'vibemol.preset',presetVersion:1,settings:reference});
                      if (patch !== null) VibeMolAppearanceLooks.edit('material', {
                        ...reference['appearance.rendering'].material,...patch
                      },{replace:true});
                    }''', {'patch':option['patch'], 'reference':reference})
                    state = page.evaluate('VibeMolAppearanceLooks.snapshot().settings')
                    rendering = state['appearance.rendering']
                    for key in ['geometry','lighting','coloring','effects']:
                        assert rendering[key] == baseline['appearance.rendering'][key], (option['id'], key)
                    actual_camera = page.evaluate('VibeMolTesting.getCameraSnapshot()')
                    assert actual_camera['mode'] == fixed_camera['mode']
                    for vector in ['camera','target','up']:
                        assert all(math.isclose(actual_camera[vector][axis], fixed_camera[vector][axis], abs_tol=1e-8)
                                   for axis in ['x','y','z']), (vector, actual_camera, fixed_camera)
                    assert state['global.backgroundColor'] == baseline['global.backgroundColor']
                    assert page.evaluate('VibeMolTesting.getLookLightingSnapshot().shadows')
                    if option['patch'] is not None:
                        assert rendering['surfaceMaterial'] is None
                        for target in ['atoms','bonds'] + (['surfaces'] if view=='orbital' else []):
                            materials = page.evaluate('target => VibeMolTesting.getLookMaterialSnapshot(target)', target)
                            assert materials
                            for material in materials:
                                assert material['type'] == 'MeshPhysicalMaterial'
                                for key in ['roughness','metalness','clearcoat','clearcoatRoughness','emissiveIntensity','envMapIntensity']:
                                    assert abs(material[key] - rendering['material'][key]) < 1e-8, (option['id'],target,key)
                                assert material['opacity'] == 1
                    png = page.evaluate('''async () => {
                      for(let i=0;i<6;i++) await new Promise(requestAnimationFrame);
                      return document.querySelector('#canvas').toDataURL('image/png').split(',')[1];
                    }''')
                    (DEST / f"{option['id']}-{view}.png").write_bytes(base64.b64decode(png))
                    if view == 'atoms':
                        option['material'] = rendering['material']
                        option['surfaceMaterial'] = rendering['surfaceMaterial']
                        if option['patch'] is not None:
                            material_file = {'kind':'vibemol.material','version':1,
                                             'name':'Basic '+option['id'].title(),'material':rendering['material']}
                            (DEST / f"{option['id']}.material.json").write_text(json.dumps(material_file, indent=2)+'\n')
                    print(option['id'], view, flush=True)
            assert not errors, errors
            manifest = {'source':str(SOURCE.relative_to(ROOT)), 'iso':0.06, 'opacity':1,
                        'referenceSettings':baseline, 'camera':camera, 'captureViews':captures,
                        'viewport':{'width':640,'height':520,'deviceScaleFactor':2}, 'options':OPTIONS}
            (DEST / 'recipes.json').write_text(json.dumps(manifest, indent=2)+'\n')
            print('Verified shared GPU materials, fixed geometry/lighting/camera, and opaque surfaces.', flush=True)
        finally:
            context.close()
            browser.close()


if __name__ == '__main__':
    main()
