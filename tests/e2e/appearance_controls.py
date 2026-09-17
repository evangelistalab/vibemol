#!/usr/bin/env python3
"""Scope bindings and shader-driven disclosure preceding the Properties merge."""
import json
import premerge as p

HARNESS = r'''() => {
  window.__vmqa = {
    errors: [],
    rowByLabel: label => [...document.querySelectorAll('.vm-field-row')]
      .find(row => row.querySelector('.vm-field-label')?.textContent.trim() === label),
    snap: () => {
      const body = document.getElementById('looksPanel');
      const controls = [...document.querySelectorAll('[data-section="material"] input, [data-section="material"] select')]
        .filter(el => el.offsetParent !== null);
      return { clientHeight: body.clientHeight, scrollHeight: body.scrollHeight,
        materialControls: controls.map(el => el.id), look: VibeMolAppearanceLooks.snapshot().activeLook.id };
    },
  };
  addEventListener('error', e => __vmqa.errors.push(e.message));
  addEventListener('unhandledrejection', e => __vmqa.errors.push(String(e.reason)));
}'''


def change(page, id_, value):
    page.locator('#' + id_).evaluate('''(el,value) => {
      if (el.type === 'checkbox') el.checked=value; else el.value=value;
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
    }''', value)


def run(page):
    page.wait_for_function('() => VibeMolWorkbench.snapshot().open.includes("styleStudio")')
    page.evaluate('() => VibeMolWorkbench.preset("style")')
    baseline = page.evaluate('() => __vmqa.snap()')
    assert p.load(page,[{'name':'a.cube','text':p.cube(-1)},{'name':'b.cube','text':p.cube(1)}])['ok']
    page.evaluate('() => VibeMolWorkbench.open("displayInspector")')
    a,b=p.cubes(page)
    page.locator(f'.vm-outliner-row[data-id="{a["id"]}"]').click()
    change(page,'schemeSelect','emory')
    assert page.locator('#studioSurfaceScheme').input_value()=='emory'
    change(page,'posColor','#abcdef')
    assert page.locator('#studioSurfaceposColor').input_value()=='#abcdef'
    change(page,'studioSurfacenegColor','#445566')
    assert page.locator('#negColor').input_value()=='#445566'
    assert p.cubes(page)[1]['colorScheme']==b['colorScheme']
    page.locator(f'.vm-outliner-row[data-id="{b["id"]}"]').click()
    assert page.locator('#studioSurfaceScheme').input_value()==b['colorScheme']
    page.locator(f'.vm-outliner-row[data-id="{a["id"]}"]').click()
    assert page.locator('#posColor').input_value()=='#abcdef'
    assert page.locator('#showAxes').evaluate('el=>!!el.closest("#sidePanel")')
    assert page.locator('#dofFocusMode').evaluate('el=>!!el.closest("#sidePanel")')
    assert page.locator('#showBox').evaluate('el=>!!el.closest("#appearanceSurfacesSection")')
    change(page,'showBox',True)
    assert p.cubes(page)[0]['showBox'] is True and p.cubes(page)[1]['showBox'] is None
    assert [box['layerId'] for box in page.evaluate('()=>VibeMolTesting.getSimulationBoxSnapshot()')]==[a['id']]
    page.locator(f'.vm-outliner-row[data-id="{b["id"]}"]').click()
    assert not page.locator('#showBox').is_checked()
    saved_session=page.evaluate('()=>VibeMolSession.export()')
    assert page.evaluate('saved=>VibeMolSession.import(saved)',saved_session)['ok']
    assert p.cubes(page)[0]['showBox'] is True
    page.evaluate('() => VibeMolWorkbench.open("styleStudio")')
    # A saved look must have the same identity in every picker, including after reselecting it.
    page.locator('#lookSave').click();page.locator('#lookNameInput').fill('Scope test');page.locator('#lookNameInput').press('Enter')
    saved=page.evaluate('()=>VibeMolAppearanceLooks.snapshot().saved[0]')
    assert page.locator('#lookPreset').input_value()==page.locator('#appearanceLookPreset').input_value()==saved['id']
    page.locator('#lookPreset').select_option('classic');page.locator('#lookPreset').select_option(saved['id'])
    assert page.evaluate('()=>VibeMolAppearanceLooks.snapshot().activeLook.id')==saved['id']
    # Row resets restore one property, leave other edits intact, and support Undo.
    page.locator('#appearanceGeometrySection').evaluate('el=>el.open=true')
    current=page.evaluate('()=>VibeMolAppearanceLooks.snapshot().settings["appearance.rendering"].geometry')
    change(page,'appearanceAtomSize',1.25);change(page,'appearanceBondRadius',0.15)
    page.locator('#appearanceAtomSizeRow .vm-property-reset').click()
    geometry=page.evaluate('()=>VibeMolAppearanceLooks.snapshot().settings["appearance.rendering"].geometry')
    assert geometry['atomScaleMain']==current['atomScaleMain'] and geometry['bondRadius']==0.15
    assert page.locator('#appearanceAtomSizeRow').get_attribute('data-style-state')=='inherited'
    page.locator('#lookUndo').click()
    assert page.evaluate('()=>VibeMolAppearanceLooks.snapshot().settings["appearance.rendering"].geometry.atomScaleMain')==1.25
    page.locator('#appearanceGeometrySection').evaluate('el=>el.open=false')
    page.locator('#appearanceMaterialsSection').evaluate('el=>el.open=true')
    counts={}
    for kind in ['emissive','satin','lacquer','metal','gel','ceramic','polished','matte','enamel','smooth','toon']:
        page.locator('#appearanceMaterialPreset').select_option(kind)
        snapshot=page.evaluate('()=>__vmqa.snap()');counts[kind]=len(snapshot['materialControls'])
        assert counts[kind]<=10, snapshot
        assert page.locator('#appearanceToonBands').is_visible()==(kind=='toon')
        page.locator('#appearanceMaterialChannels').evaluate('el=>el.open=true')
        assert page.locator('#appearanceToonTone0').is_visible()==(kind=='toon')
        assert page.locator('#appearanceMaterialClearcoat').is_visible()==(kind not in ['toon','smooth'])
        assert not page.locator('#appearancePearlThickness0').is_visible()
        page.locator('#appearanceMaterialChannels').evaluate('el=>el.open=false')
    page.locator('#lookPreset').select_option('opal')
    page.locator('#appearanceMaterialChannels').evaluate('el=>el.open=true')
    assert page.locator('#appearancePearlThickness0').is_visible()
    page.locator('#appearanceMaterialChannels').evaluate('el=>el.open=false')
    assert page.evaluate('()=>__vmqa.errors')==[]
    report={'baseline':baseline,'compactMaterialCounts':counts,'after':page.evaluate('()=>__vmqa.snap()')}
    (p.ARTIFACTS/'appearance-controls-report.json').write_text(json.dumps(report,indent=2))
    page.screenshot(path=str(p.ARTIFACTS/'appearance-controls.png'))
    print('[appearance controls] selected-layer bindings, saved Looks, row reset/Undo, box session round-trip, material disclosure: passed',flush=True)
    print(json.dumps(counts),flush=True)


def main():
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle=metal'])
        page=browser.new_page(viewport={'width':1512,'height':950});errors=[];consoles=[]
        page.add_init_script('('+HARNESS+')()')
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:consoles.append(m.text) if m.type=='error' else None)
        try:
            page.goto(url+'?workspaceLab=1&workspaceDemo=1');page.wait_for_function('()=>window.VibeMolWorkbench')
            run(page);assert not errors,errors
        except Exception:
            p.write_failure_artifacts(page,p.ARTIFACTS,'appearance-controls-failure',errors,consoles);raise
        finally:browser.close()


if __name__=='__main__':main()
