#!/usr/bin/env python3
"""Real Workbench Properties: mixed scope, persistence, and one Look editor."""
import json
import premerge as p
from appearance_controls import change
from looks import choose_material


def main():
    with p.run_http_server(p.ROOT) as url, p.sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=['--use-angle=metal'])
        context = browser.new_context(viewport={'width': 1512, 'height': 950})
        page = context.new_page(); errors = []; console_errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
        legacy_layout = {'last': {'open': ['displayInspector', 'styleStudio'], 'activeRight': 'styleStudio',
            'placements': {'displayInspector': 'bottom', 'styleStudio': 'right'}, 'rightWidth': 560}}
        page.add_init_script('localStorage.setItem("vibemol.workbench.lab.v1", '+json.dumps(json.dumps(legacy_layout))+')')
        try:
            page.goto(url+'?workspaceLab=1&appearanceStudy=1'); page.wait_for_function('()=>window.VibeMolWorkbench')
            page.evaluate('''() => { window.__vmqa = { errors: [],
              rowByLabel: label => [...document.querySelectorAll('#inspector .vm-field-row')].find(r => r.querySelector('label')?.textContent === label),
              snap: () => { const body = document.getElementById('inspectorLook'); return {
                clientHeight: body.clientHeight, scrollHeight: body.scrollHeight,
                selection: VibeMolWorkbenchHost.properties.snapshot(),
                materialControls: [...document.querySelectorAll('#materialFields input, #materialFields select, #materialAdvancedFields input, #materialAdvancedFields select')].filter(n=>n.offsetParent!==null).map(n=>n.id) }; }
            }; addEventListener('error', e=>__vmqa.errors.push(e.message)); }''')
            state = page.evaluate('VibeMolWorkbench.snapshot()')
            assert state['open'] == ['inspector'] and state['rightWidth'] == 560, state
            assert page.locator('#inspectorEmpty').is_visible()
            page.screenshot(path=str(p.ARTIFACTS/'properties-empty.png'))
            removed = ['displayInspector','styleStudio','appearanceLookPreset','moleculeShadowsToggle','moleculeFogToggle',
                'appearancePalette','visibilityElementColorsToggle','appearanceBondColorMode','appearanceBondColor','bgColor',
                'moleculeStyle','elementColors','studioSurfaceOpacity','surfaceMaterialPreset']
            assert not page.locator(','.join('#'+id_ for id_ in removed)).count()
            assert page.evaluate('''() => {
              const seen = new Map();
              for (const n of document.querySelectorAll('#inspector input, #inspector select')) {
                if (n.hidden || n.type==='hidden') continue;
                const text = (document.querySelector('label[for="'+n.id+'"]')?.textContent || n.getAttribute('aria-label') || '').trim().toLowerCase();
                if (!text) continue;
                const stem = n.id.replace(/Range$/, '');
                if (seen.has(text) && seen.get(text)!==stem) return text;
                seen.set(text,stem);
              }
              return null;
            }''') is None
            assert page.locator('#sidePanel #showAxes').count() == 1
            assert page.locator('#sidePanel #dofFocusMode').count() == 1
            assert p.load(page,[{'name':'a.cube','text':p.cube(-1)},{'name':'b.cube','text':p.cube(1)}])['ok']
            a,b = p.cubes(page); scene = p.snapshot(page)['scenes'][0]
            molecule = next(layer for layer in scene['layers'] if layer['kind']=='molecule')
            row = lambda id_: page.locator('.vm-outliner-row[data-id="'+id_+'"]')
            row(a['id']).click()
            page.evaluate('window.__originalIsoControl=document.getElementById("iso")')
            change(page,'schemeSelect','bright'); change(page,'opacity',0.42); change(page,'showBox',True)
            assert p.cubes(page)[0]['colorScheme']=='bright' and p.cubes(page)[1]['colorScheme']==b['colorScheme']
            page.screenshot(path=str(p.ARTIFACTS/'properties-surface.png'))
            row(b['id']).click()
            assert page.locator('#schemeSelect').input_value() == b['colorScheme']
            assert not page.locator('#showBox').is_checked()
            row(a['id']).click(modifiers=['Meta']); row(molecule['id']).click(modifiers=['Meta'])
            assert len(p.snapshot(page)['selectedLayerIds'])==3, p.snapshot(page)
            assert page.locator('#inspectorStructure').is_visible() and page.locator('#appearanceSurfacesSection').is_visible()
            assert '3 selected' in page.locator('#inspectorSelection').inner_text()
            assert page.locator('#opacity').input_value() == 'Mixed'
            assert page.locator('#schemeSelect').input_value() == ''
            assert page.locator('#showBox').evaluate('el=>el.indeterminate')
            # Selection never replaces DOM, nor writes the mixed value to either layer.
            assert page.evaluate('window.__originalIsoControl===document.getElementById("iso")')
            assert [layer['opacity'] for layer in p.cubes(page)] == [0.42,b['opacity']]
            change(page,'opacity',0.61)
            assert [layer['opacity'] for layer in p.cubes(page)]==[0.61,0.61]
            before = page.evaluate('VibeMolAppearanceLooks.snapshot().settings')
            page.locator('#inspectorShowAtoms').uncheck()
            assert not page.locator('#inspectorShowAtoms').is_checked()
            assert page.evaluate('VibeMolTesting.getMoleculeRenderSnapshot().atomCount') == 0
            assert page.evaluate('VibeMolAppearanceLooks.snapshot().settings') == before
            page.locator('#inspectorLookTab').click(); page.locator('#lookUndo').click()
            assert page.evaluate('VibeMolTesting.getMoleculeRenderSnapshot().atomCount') == 1
            page.locator('#inspectorObjectTab').click(); page.locator('#inspectorShowAtoms').uncheck()
            page.screenshot(path=str(p.ARTIFACTS/'properties-mixed.png'))
            # Separate scenes retain independent Structure state, including in the ordinary renderer.
            session = page.evaluate('VibeMolSession.export()')
            assert page.evaluate('saved=>VibeMolSession.import(saved)',session)['ok']
            assert page.evaluate('VibeMolTesting.getMoleculeRenderSnapshot().atomCount') == 0
            row(molecule['id']).click(); assert page.locator('#appearanceSurfacesSection').is_hidden()
            page.screenshot(path=str(p.ARTIFACTS/'properties-structure.png'))
            assert p.load(page,[{'name':'other.xyz','text':'He 3 0 0'}],clear_first=False)['ok']
            assert page.evaluate('VibeMolTesting.getMoleculeRenderSnapshot().atomCount') == 1
            row(a['id']).click(); page.locator('#inspectorLookTab').click()
            page.locator('#lookPreset').select_option('classic')
            assert page.evaluate('VibeMolTesting.getMoleculeRenderSnapshot().atomCount') == 1
            assert p.cubes(page)[0]['opacity']==0.61
            page.locator('#inspectorObjectTab').click()
            page.locator('#rowSurfaceOpacity .vm-property-reset').click()
            assert p.cubes(page)[0]['opacity']==1 and p.cubes(page)[1]['opacity']==0.61
            page.locator('#inspectorLookTab').click(); page.locator('#lookUndo').click()
            assert p.cubes(page)[0]['opacity']==0.61
            # Named looks and whole-material resets keep the single shared editor usable.
            page.locator('#lookSave').click();page.locator('#lookNameInput').fill('Properties test');page.locator('#lookNameInput').press('Enter')
            saved = page.evaluate('VibeMolAppearanceLooks.snapshot().saved[0]')
            page.locator('#lookPreset').select_option('opal');page.locator('#lookPreset').select_option(saved['id'])
            assert page.evaluate('VibeMolAppearanceLooks.snapshot().styleRef.id')==saved['id']
            page.locator('#appearanceGeometrySection').evaluate('el=>el.open=false')
            page.locator('#appearanceMaterialsSection').evaluate('el=>el.open=true')
            for look in ['basic','classic','ink','kit','opal','porcelain','toon']:
                page.locator('#lookPreset').select_option(look)
                assert page.locator('#appearanceMaterialPreset').input_value() == look
            page.locator('#lookPreset').select_option(saved['id'])
            material_before = page.evaluate('VibeMolAppearanceLooks.material()')
            choose_material(page,'gel')
            page.locator('#appearanceMaterialPresetRow .vm-property-reset').click()
            assert page.evaluate('VibeMolAppearanceLooks.material()') == material_before
            counts = {}
            for kind in ['basic','classic','emissive','gel','ink','kit','matte','metal','opal','porcelain','toon']:
                choose_material(page,kind)
                assert page.locator('#appearanceMaterialPreset').input_value() == kind
                family = page.evaluate('VibeMolAppearanceLooks.material().model')
                assert page.locator('#appearanceMaterialFamily').input_value() == family
                assert page.locator('#appearanceMaterialPreset option[value="basic"]').count() == (family == 'physical')
                sample = page.evaluate('__vmqa.snap()'); counts[kind] = len(sample['materialControls'])
                assert page.locator('#appearanceMaterialShininess').is_visible() == (family == 'phong')
                assert page.locator('#appearanceMaterialRoughness').is_visible() == (family == 'physical')
                assert page.locator('#appearanceMaterialEnvironment').is_visible() == (family == 'physical')
                assert page.locator('#appearanceToonBands').is_visible() == (kind in ['ink','toon'])
            choose_material(page,'gel')
            # Basic restores the shared Luminous finish while retaining this
            # saved Look's geometry and lighting.
            gel = page.evaluate('VibeMolAppearanceLooks.snapshot()')
            choose_material(page,'basic')
            basic = page.evaluate('VibeMolAppearanceLooks.snapshot()')
            expected = page.evaluate('VibeMolAppearanceModel.legacy("basic")')
            for key in ['material','surfaceMaterial']:
                assert basic['settings']['appearance.rendering'][key] == expected[key]
            assert expected['surfaceMaterial'] is None
            assert expected['material']['emissiveIntensity'] == 0.36
            assert not page.locator('#appearanceUseSurfaceMaterial').is_visible()
            for key in ['geometry','lighting','coloring','effects']:
                assert basic['settings']['appearance.rendering'][key] == gel['settings']['appearance.rendering'][key]
            assert all(basic[key] == gel[key] for key in ['styleRef','colorsRef'])
            assert basic['settings']['surface.materialPreset'] == 'emissive'
            page.locator('#lookUndo').click()
            assert page.evaluate('VibeMolAppearanceLooks.snapshot().settings') == gel['settings']
            assert page.locator('#appearanceMaterialPreset').input_value() == 'gel'
            report = {'materialControls':counts,'after':page.evaluate('__vmqa.snap()')}
            page.screenshot(path=str(p.ARTIFACTS/'properties-look.png'))
            # 2C is explicitly global and remains reachable with a scalar layer active.
            spinor = p.cube(2) + '\n'.join(p.cube(shift).splitlines()[-1] for shift in [-2, 1, -1]) + '\n'
            assert p.load(page,[{'name':'spinor.2ccube','text':spinor}],clear_first=False)['ok']
            two = next(layer for layer in p.cubes(page) if layer['name']=='spinor.2ccube')
            row(a['id']).click(); row(two['id']).click(modifiers=['Meta'])
            page.locator('#inspectorObjectTab').click()
            assert page.locator('#twoComponentModeSelect').is_visible()
            assert 'all loaded two-component files' in page.locator('#appearanceTwoComponentSection').inner_text()
            page.locator('#twoComponentModeSelect').select_option('alphaRe')
            page.locator('#appearanceRenderModeGroup [data-value="cloud"]').click()
            assert all(layer['renderMode']=='cloud' for layer in p.cubes(page) if layer['id'] in [a['id'],two['id']])
            page.locator('#appearanceCloudTypeGroup [data-value="points"]').click()
            assert all(layer['cloudType']=='points' for layer in p.cubes(page) if layer['id'] in [a['id'],two['id']])
            page.locator('#inspectorLookTab').click()
            # Tab keys do not switch the outer dock. Float/park/alias restores keep tab choice.
            page.locator('#inspectorLookTab').focus(); page.keyboard.press('Home')
            assert page.locator('#inspectorObjectTab').get_attribute('aria-selected')=='true'
            page.keyboard.press('ArrowRight'); assert page.locator('#inspectorLookTab').get_attribute('aria-selected')=='true'
            page.evaluate('VibeMolWorkbench.place("displayInspector","float")')
            page.evaluate('VibeMolWorkbench.park("styleStudio")')
            page.evaluate('VibeMolWorkbench.open("inspector")')
            assert page.locator('#inspectorLookTab').get_attribute('aria-selected')=='true'
            layout = page.evaluate('VibeMolWorkbench.snapshot()')
            for mode in ['Edit','Measure','Display']:
                page.locator('#mode'+mode+'Btn').click()
                assert page.evaluate('VibeMolWorkbench.snapshot()') == layout
            # Every control remains inside the narrow panel in both themes.
            for width in [390,768,1512]:
                page.set_viewport_size({'width':width,'height':950})
                for dark in [True,False]:
                    if page.locator('#themeToggleInput').is_checked() != dark: page.locator('#themeToggleShell').click()
                    assert page.locator('#inspectorLook').evaluate('el=>el.scrollWidth<=el.clientWidth+1')
            assert not errors, errors
            assert not page.evaluate('__vmqa.errors'), page.evaluate('__vmqa.errors')
            (p.ARTIFACTS/'properties-report.json').write_text(json.dumps(report,indent=2))
            print('[properties] mixed selection, isolated rendering, reset/Undo, sessions, alias migration, materials, themes and responsive bounds: passed',flush=True)
            print(json.dumps(report),flush=True)
        except Exception:
            p.write_failure_artifacts(page,p.ARTIFACTS,'properties-failure',errors,console_errors)
            raise
        finally: browser.close()


if __name__=='__main__': main()
