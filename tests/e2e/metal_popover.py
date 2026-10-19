#!/usr/bin/env python3
"""#17: native Metal cue reachability, viewport bounds and unchanged commits.

Focused regression derived from the historical Selection menu probe. No click-away workaround
precedes a sibling cue activation. No event handlers, styles or app source are
instrumented. --diagnostic preserves the predecessor's measured failures.
"""
import argparse
import hashlib
import json
from pathlib import Path

import premerge as p
from helpers import run_http_server, wait_for_presented_state
from playwright.sync_api import sync_playwright


def run_matrix(browser, source, output, url, diagnostic=False):
    source,output=Path(source),Path(output)
    output.mkdir(parents=True,exist_ok=True)
    assert not (output/'result.json').exists(), 'Preserve earlier attempts'
    files=['assets/app/js/app.js','assets/app/css/edit-ui.css']
    hashes={f:hashlib.sha256((source/f).read_bytes()).hexdigest() for f in files}
    report=dict(diagnosticOnly=diagnostic,sourceHashes=hashes,
                harnessSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),cases=[])
    viewports=[(1440,1000),(390,850)] if diagnostic else [
        (1512,1000),(1440,1000),(1280,1000),(1024,1000),(390,850),(320,850),(390,450)]
    def check(ok,actual,expected,label):
        print('[metal-popover] '+json.dumps(dict(check=label,actual=actual,expected=expected,passed=bool(ok)),sort_keys=True),flush=True)
        if not diagnostic: assert ok, dict(check=label,actual=actual,expected=expected)
    def presented(page,predicate='() => true'):
        wait_for_presented_state(page,predicate)
    for legacy in [False,True]:
        for dark in [False,True]:
            context=browser.new_context(viewport={'width':1440,'height':1000})
            # Theme is fixture state. Legacy's separate global utilities can
            # cover the theme label; that unrelated hit target is not this test.
            context.add_init_script('localStorage.setItem("vibemol.uiTheme",'+json.dumps('dark' if dark else 'light')+');')
            page=context.new_page();errors=[];navigations=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('framenavigated',lambda frame:navigations.append(frame.url))
            try:
                page.goto(url+'?appearanceStudy=1'+('&workspaceLab=0' if legacy else ''))
                page.wait_for_function('()=>window.VibeMolTesting')
                runtime=page.evaluate('()=>({testing:!!window.VibeMolTesting,workbench:!!window.VibeMolWorkbench})')
                check(runtime==dict(testing=True,workbench=not legacy),runtime,
                      dict(testing=True,workbench=not legacy),'layout readiness')
                page.evaluate('async()=>{await document.fonts.ready;}')
                check(page.locator('#themeToggleInput').is_checked()==dark,
                      page.locator('#themeToggleInput').is_checked(),dark,'stored theme resolved')
                loaded=p.load(page,[{'name':'iron.xyz','text':'1\nMetal cue regression\nFe 0 0 0\n'}])
                check(loaded['ok'],loaded,dict(ok=True),'Fe fixture loaded')
                assert loaded['ok'],loaded
                # Loading resolves before the first molecular frame. Present
                # that scene before driving another native UI transaction.
                presented(page)
                setup=page.evaluate('()=>({mode:VibeMolWorkbenchHost.getMode(),ready:document.readyState,fonts:document.fonts.status,theme:document.getElementById("themeToggleInput").checked})')
                setup.update(legacy=legacy,dark=dark,pageerrors=errors,navigations=navigations)
                print('[metal-setup] '+json.dumps(setup,sort_keys=True),flush=True)
                (output/'setup-progress.json').write_text(json.dumps(setup,indent=2)+'\n')
                page.locator('#modeEditBtn').click()
                presented(page,'()=>VibeMolWorkbenchHost.getMode()==="edit"')
                if not legacy:page.locator('#editTransformToolBtn').click()
                page.evaluate('()=>VibeMolTesting.setEditSelectionIndices([0])')
                presented(page,'()=>VibeMolTesting.getEditSelectionCount()===1')
                metal=page.locator('#editSelectionMetalBondingCueButton')
                popup=page.locator('#editSelectionMetalBondingCuePopover')
                for width,height in viewports:
                    page.set_viewport_size({'width':width,'height':height})
                    presented(page)
                    # At narrow legacy widths the fixed sidebar and utilities
                    # cover the unopened selection card independently of #17.
                    # Use the shipped sidebar and keyboard-move controls to
                    # stage an unobstructed card; never modify styles/events.
                    if legacy and width<=390:
                        if not page.locator('body').evaluate('e=>e.classList.contains("sidebar-collapsed")'):
                            page.locator('#toolbarCollapseBtn').click()
                            presented(page,'()=>document.body.classList.contains("sidebar-collapsed")')
                        grip=page.locator('#editSelectionTranslateCue [data-vm-drag-handle]').first
                        grip.press('Alt+Home')
                        for _ in range(10):grip.press('Alt+ArrowDown')
                        presented(page)
                    closed=page.evaluate("""()=>{const e=document.getElementById('editSelectionMetalBondingCueButton'),r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},reachable:!!hit&&(hit===e||e.contains(hit)),hit:hit?.id||hit?.className||null,sidebarCollapsed:document.body.classList.contains('sidebar-collapsed')};}""")
                    check(closed['reachable'],closed,'Metal trigger reachable before opening','closed Metal hit')
                    if popup.get_attribute('aria-hidden')!='false':metal.click()
                    presented(page,"()=>document.getElementById('editSelectionMetalBondingCuePopover').getAttribute('aria-hidden')==='false'")
                    label=('legacy' if legacy else 'workbench')+'-'+('dark' if dark else 'light')+'-'+str(width)
                    if height==450:label+='-short'
                    row=dict(context=label,pageerrors=errors,closedMetal=closed,legacyNarrowStaging=legacy and width<=390)
                    geometry=page.evaluate('''() => {
                      const pop=document.getElementById('editSelectionMetalBondingCuePopover');
                      const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
                      const buttons=Array.from(document.querySelectorAll('#editSelectionTranslateCue .editSelectionCueButton'))
                        .filter(el=>el.getClientRects().length && getComputedStyle(el).visibility!=='hidden')
                        .map(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
                          return {id:el.id,rect:rect(el),reachable:!!hit&&(el===hit||el.contains(hit)),hit:hit?.id||hit?.className||null};});
                      const mode=document.getElementById(document.body.classList.contains('sidebar-collapsed')?'toolbarShowBtn':'modeDisplayBtn'),m=mode.getBoundingClientRect();
                      const modeHit=document.elementFromPoint(m.x+m.width/2,m.y+m.height/2);
                      return {viewport:{width:innerWidth,height:innerHeight},popover:rect(pop),
                        clientWidth:pop.clientWidth,scrollWidth:pop.scrollWidth,clientHeight:pop.clientHeight,scrollHeight:pop.scrollHeight,
                        cue:rect(document.getElementById('editSelectionTranslateCue')),buttons,
                        modeButton:{id:mode.id,rect:rect(mode),reachable:!!modeHit&&(mode===modeHit||mode.contains(modeHit)),hit:modeHit?.id||modeHit?.className||null},
                        choices:Array.from(pop.querySelectorAll('[data-metal-bonding-choice]'),x=>x.dataset.metalBondingChoice)};
                    }''')
                    row['geometry']=geometry
                    r=geometry['popover'];v=geometry['viewport']
                    check(r['x']>=0 and r['y']>=0 and r['right']<=v['width']+.1 and r['bottom']<=v['height']+.1,r,v,label+' viewport bounds')
                    check(geometry['scrollWidth']<=geometry['clientWidth']+1,dict(scroll=geometry['scrollWidth'],client=geometry['clientWidth']),'scrollWidth <= clientWidth +1',label+' horizontal content')
                    check(all(b['reachable'] for b in geometry['buttons']),geometry['buttons'],'every visible sibling cue center reachable',label+' sibling reachability')
                    check(geometry['modeButton']['reachable'],geometry['modeButton'],'Visible mode/sidebar control reachable while Metal is open',label+' View reachability')
                    check(geometry['choices']==['auto','force_covalent','force_dative','no_bonds'],geometry['choices'],['auto','force_covalent','force_dative','no_bonds'],label+' four choices')
                    page.screenshot(path=str(output/(label+'.png')))
                    if not diagnostic:
                        # A native single click must dismiss Metal and activate
                        # Coordination, without the historical click-away step.
                        page.locator('#editSelectionCoordinationCueButton').click()
                        presented(page,"()=>document.getElementById('editSelectionCoordinationCuePopover').getAttribute('aria-hidden')==='false'")
                        check(popup.get_attribute('aria-hidden')=='true',popup.get_attribute('aria-hidden'),'true',label+' direct Coordination switch')
                        options=page.locator('#editSelectionCoordinationCuePopover [data-coordination-choice]:not(.is-active)')
                        hits=options.evaluate_all("""es=>es.map(e=>{const r=e.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {choice:e.dataset.coordinationChoice,reachable:!!h&&(e===h||e.contains(h)),hit:h?.id||h?.className||null};})""")
                        check(any(h['reachable'] for h in hits),hits,'an exposed alternative Coordination option',label+' Coordination option hits')
                        chosen_hit=next(h for h in hits if h['reachable'])
                        coordination=page.locator('#editSelectionCoordinationCuePopover [data-coordination-choice="'+chosen_hit['choice']+'"]')
                        row['coordinationOptionHits']=hits
                        chosen=coordination.get_attribute('data-coordination-choice')
                        coordination.click()
                        presented(page,"()=>document.getElementById('editSelectionCoordinationCuePopover').getAttribute('aria-hidden')==='true'")
                        actual_geometry=page.evaluate('''()=>{const v=VibeMolStructure.exportActive().volume;
                          return v.annotations.coordination.byAtomId[String(v.atoms[0].id)].geometryId;}''')
                        check(actual_geometry==chosen,actual_geometry,chosen,label+' Coordination commit')
                        row['coordinationChoice']=chosen
                        committed=[]
                        for target in ['force_covalent','force_dative','no_bonds','auto']:
                            metal.click()
                            presented(page,"()=>document.getElementById('editSelectionMetalBondingCuePopover').getAttribute('aria-hidden')==='false'")
                            popup.locator('[data-metal-bonding-choice="'+target+'"]').click()
                            presented(page,"()=>document.getElementById('editSelectionMetalBondingCuePopover').getAttribute('aria-hidden')==='true'")
                            actual=page.evaluate('''()=>{const v=VibeMolStructure.exportActive().volume;
                              return v.annotations?.metalBonding?.byAtomId?.[String(v.atoms[0].id)]?.mode||'auto';}''')
                            check(actual==target,actual,target,label+' native commit')
                            committed.append(actual)
                        row['committedModes']=committed
                    row['passed']=not diagnostic
                    report['cases'].append(row)
                    (output/'result.json').write_text(json.dumps(report,indent=2)+'\n')
                if not diagnostic:
                    metal.click()
                    if page.locator('body').evaluate('e=>e.classList.contains("sidebar-collapsed")'):
                        page.locator('#toolbarShowBtn').click()
                        presented(page,'()=>!document.body.classList.contains("sidebar-collapsed")')
                    page.locator('#modeDisplayBtn').click()
                    check(popup.get_attribute('aria-hidden')=='true',popup.get_attribute('aria-hidden'),'true','mode suspension')
                check(not errors,errors,[],'page errors')
            finally:context.close()
    report['sourceUnchanged']=all(hashlib.sha256((source/f).read_bytes()).hexdigest()==h for f,h in hashes.items())
    report['status']='diagnostic-complete' if diagnostic else 'passed'
    (output/'result.json').write_text(json.dumps(report,indent=2)+'\n')
    assert report['sourceUnchanged']
    return report


def metal_popover_regression(browser,url):
    run_matrix(browser,p.ROOT,p.ARTIFACTS/'metal-popover',url)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--source-root',type=Path,default=p.ROOT)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--diagnostic',action='store_true')
    args=parser.parse_args()
    with run_http_server(args.source_root) as url,sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
        try:run_matrix(browser,args.source_root,args.output,url,args.diagnostic)
        finally:browser.close()
