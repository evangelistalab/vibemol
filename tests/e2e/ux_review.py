#!/usr/bin/env python3
"""0.9.3 review: stable bar, explicit edit tools, AO choices and bounded previews."""
import json
import premerge as p
from calculations import ready
from edit_tool import tool, arm, close_build


def chips(page):
    result=page.locator('#calculationOrbitalsPopup [aria-label$=" shell"], #calculationOrbitalsPopup [aria-label$=" orbital"]').evaluate_all('''els=>els.map(e=>({
      name:e.getAttribute('aria-label'),role:e.getAttribute('role'),checked:e.getAttribute('aria-checked'),
      pressed:e.hasAttribute('aria-pressed'),active:e.classList.contains('is-active')}))''')
    assert result
    for c in result:
        assert c['role']=='checkbox' and c['checked'] in ['true','false','mixed'] and not c['pressed'],c
        assert c['active']==(c['checked']=='true'),c
        assert c['checked']!='mixed' or c['name'].endswith('shell'),c


def run(page,url):
    page.goto(url+'?appearanceStudy=1');page.wait_for_function('()=>window.VibeMolWorkbench')
    assert page.locator('#emptyStateWhatsNewSummary').inner_text()==page.evaluate('()=>`What\'s new in v${VibeMolAssets.version}`')
    sample={'name':'sample.cube','text':(p.ROOT/'assets/data/sample.cube').read_text()}
    assert p.load(page,[sample])['ok']
    report={'heights':{},'previews':{}}
    # Fresh and loaded defaults, then per-scene tool memory.
    page.locator('#modeEditBtn').click();tool(page,'transform')
    arm(page);close_build(page)
    page.locator('#modeDisplayBtn').click();page.locator('#modeEditBtn').click();tool(page,'build')
    first=p.snapshot(page)['scenes'][0]
    assert p.load(page,[{'name':'oxygen.xyz','text':'1\noxygen\nO 0 0 0'}],clear_first=False)['ok']
    tool(page,'transform')
    page.locator('.vm-outliner-row[data-id="'+first['id']+'"]').click();tool(page,'build')
    arm(page,'benzene');close_build(page)
    page.locator('#newFileBtn').click();tool(page,'build')
    empty=page.evaluate('()=>VibeMolTesting.getEditBuildState()')
    assert empty['intent']=='add_atom' and empty['payload']['kind']=='atom' and empty['elementZ']==6,empty
    assert page.locator('#editAdaptiveAddAtomPopover').is_visible()
    close_build(page)
    page.locator('.vm-outliner-row[data-id="'+first['id']+'"]').click();tool(page,'build')
    page.locator('#editTransformToolBtn').click()
    for width in [1512,1280,1024]:
        page.set_viewport_size({'width':width,'height':773})
        heights=[]
        for mode in ['Display','Measure','Edit','Calculations']:
            page.locator('#mode'+mode+'Btn').click();page.wait_for_timeout(200)
            result=page.locator('.wb-bar').evaluate('''bar=>{const tools=bar.querySelector('.wb-tools');return {
              height:bar.getBoundingClientRect().height,wrap:getComputedStyle(tools).flexWrap,scroll:tools.scrollWidth,width:tools.clientWidth,
              occluded:[...bar.querySelectorAll('button')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(e).visibility!=='hidden'&&!e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}).map(e=>e.id)
            }}''')
            assert result['wrap']=='nowrap' and result['scroll']<=result['width']+1 and not result['occluded'],(width,mode,result)
            heights.append(result['height'])
        assert len(set(heights))==1,heights
        report['heights'][width]=heights
    # Keyboard access to overflow commands and actual forwarded action.
    trigger=page.locator('#workbenchOverflowBtn');assert trigger.is_visible()
    trigger.focus();page.keyboard.press('ArrowDown')
    menu=page.locator('#workbenchOverflowMenu');assert menu.is_visible()
    page.keyboard.press('End');assert menu.locator('[role="menuitem"]').last.evaluate('e=>e===document.activeElement')
    page.keyboard.press('Escape');assert menu.is_hidden() and trigger.evaluate('e=>e===document.activeElement')
    page.locator('#workbenchQuickActions [aria-label="Point camera at center of mass"]').evaluate('e=>e.addEventListener("click",()=>window.__forwarded=true,{once:true})')
    trigger.click();menu.get_by_role('menuitem',name='Point camera at center of mass',exact=True).click()
    assert menu.is_hidden() and page.evaluate('()=>window.__forwarded')
    page.set_viewport_size({'width':1512,'height':950})
    page.locator('#modeDisplayBtn').click();assert p.load(page,[sample])['ok']
    page.locator('#modeCalculationsBtn').click();ready(page)
    page.evaluate('()=>VibeMolCalculations.selectAtoms([3])');chips(page)
    popup=page.locator('#calculationOrbitalsPopup')
    popup.get_by_role('button',name='2p components',exact=True).click()
    popup.get_by_role('checkbox',name='2px orbital',exact=True).click();ready(page);chips(page)
    assert popup.get_by_role('checkbox',name='2p shell',exact=True).get_attribute('aria-checked')=='mixed'
    assert '1 MINAO function → 1 subspace orbital · 1 atom' in page.locator('[data-count]').inner_text()
    popup.get_by_role('checkbox',name='2p shell',exact=True).click();ready(page);chips(page)
    page.keyboard.press('Escape')
    # Targets: check actual label/input hit boxes, including plane row.
    page.locator('#subspacePanel [data-planes]').evaluate('e=>e.open=true')
    page.locator('#subspacePanel details').evaluate_all('els=>els.forEach(e=>e.open=true)')
    controls=page.locator('#subspacePanel input, #subspacePanel select, #subspacePanel button').evaluate_all('els=>els.map(e=>({id:e.id||e.type,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})).filter(c=>c.w&&c.h)')
    report['avasControls']=controls
    for id in ['charge','ms','sigma','basis','auxiliary','minao']:
        assert next(c for c in controls if c['id']=='avas-'+id)['h']>=32,controls
    assert all(min(c['w'],c['h'])>=24 for c in controls),controls
    report['undersizedControls']=page.locator('input,select,button,[role="checkbox"],[role="radio"]').evaluate_all('''els=>els.filter(e=>{
      const r=e.getBoundingClientRect();return r.width&&(r.height<24||r.width<24);
    }).map(e=>({id:e.id||e.getAttribute('aria-label')||e.type,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))''')
    assert not report['undersizedControls'],report['undersizedControls']
    code=page.locator('#subspacePanel textarea');assert code.evaluate('e=>e.readOnly')
    code.scroll_into_view_if_needed();assert code.evaluate('e=>e.scrollWidth<=e.clientWidth+1')
    original=code.input_value()
    # Smaller and larger lobes do not change assignments or generated input.
    for value in ['85','35','60']:
        page.locator('#avas-lobe-size').fill(value);page.locator('#avas-lobe-size').dispatch_event('change');ready(page)
        assert code.input_value()==original
    page.locator('#subspacePanel [data-planes]').evaluate('e=>e.open=false')
    # Actual renderer comparisons, including every component of these shells.
    for name,index,shell in [('carbon',3,'2p'),('nitrogen',2,'2p'),('oxygen',0,'2p'),('iron',0,'3d')]:
        page.locator('#modeDisplayBtn').click()
        fixture=sample if name!='iron' else {'name':'iron-carbonyl.xyz','text':'13\noctahedral Fe(CO)6 rendering fixture\nFe 0 0 0\nC 1.8 0 0\nC -1.8 0 0\nC 0 1.8 0\nC 0 -1.8 0\nC 0 0 1.8\nC 0 0 -1.8\nO 2.9 0 0\nO -2.9 0 0\nO 0 2.9 0\nO 0 -2.9 0\nO 0 0 2.9\nO 0 0 -2.9'}
        assert p.load(page,[fixture])['ok']
        page.locator('#modeCalculationsBtn').click();ready(page)
        page.evaluate('v=>VibeMolCalculations.selectShell(...v)',[index,shell]);ready(page)
        page.locator('#subspacePanel .vm-list-popover__body').evaluate('e=>e.scrollTop=0')
        page.mouse.move(750,100);page.wait_for_timeout(500)
        path=p.ARTIFACTS/f'ux-{name}-{shell}.png';page.screenshot(path=str(path))
        report['previews'][name]=str(path)
    (p.ARTIFACTS/'ux-review-report.json').write_text(json.dumps(report,indent=2))
    print('[UX review]',json.dumps(report),flush=True)


def main():
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True)
        page=browser.new_page(viewport={'width':1512,'height':900});errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        try:
            run(page,url);assert not errors,errors
        except Exception:
            p.write_failure_artifacts(page,p.ARTIFACTS,'ux-review',errors,[]);raise
        finally:browser.close()
if __name__=='__main__':main()
