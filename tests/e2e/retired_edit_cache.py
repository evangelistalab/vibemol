"""Native routes and pane ownership after the explicitly approved #14/#15 cleanup."""
import json,os
from pathlib import Path
import premerge as p


def run(browser, url):
    assert not browser.contexts, 'Retire the parent Build page before native cache cases'
    results=[]
    for legacy in (False, True):
        for dark in (False, True):
            context=browser.new_context(viewport={'width':1512,'height':1000})
            page=context.new_page();errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            case=dict(legacy=legacy,dark=dark,observations=[])
            def read(label):
                state=page.evaluate('''()=>({panes:['editAddAtomPane','editAddFragmentPane','editAddMoleculePane'].map(id=>{
                  const pane=document.getElementById(id);return {id,connected:pane?.isConnected,parent:pane?.parentElement?.id};}),
                  editor:document.getElementById('elementColorOverlay').style.display==='flex',
                  legacyButton:!!document.getElementById('elementColorBtn'),
                  absentIds:['editAtomsMenu','editAtomsMenuBody','editAtomsMenuCurrent','editSelectionFragmentCuePopover'].filter(id=>document.getElementById(id))})''')
                expected=dict(allPanesConnected=True,allPanesHaveParent=True,legacyButton=legacy,absentIds=[])
                actual=dict(allPanesConnected=all(x['connected']for x in state['panes']),
                            allPanesHaveParent=all(x['parent']for x in state['panes']),
                            legacyButton=state['legacyButton'],absentIds=state['absentIds'])
                row=dict(label=label,state=state,actual=actual,expected=expected)
                print('[retired-cache-ui] '+json.dumps(row),flush=True)
                assert actual==expected,row
                case['observations'].append(row);return state
            try:
                page.goto(url+'?appearanceStudy=1&qa=1'+('&workspaceLab=0'if legacy else ''))
                page.wait_for_function('()=>window.VibeMolWorkbenchHost&&window.VibeMolAppearanceLooks')
                if dark:
                    page.locator('#themeToggleInput').evaluate("el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}))}")
                assert p.load(page,[dict(name='carbon.xyz',text='1\nCache maintenance\nC 0 0 0\n')])['ok']
                initial=read('initial homes')
                if legacy:
                    page.locator('#displayInspectorBtn').click()
                    handler=page.locator('#elementColorBtn').evaluate('el=>el.onclick.toString()')
                    assert 'periodicTableController.setOpen(true)'in handler,handler
                    page.locator('#elementColorBtn').click()
                else:
                    page.locator('#workbenchPanelsBtn').click()
                    page.locator('#workbenchPanelsMenu').get_by_role('menuitemcheckbox',name='Properties',exact=True).click()
                    page.locator('#inspectorLookTab').click()
                    page.locator('#appearanceColorsSection > summary').click()
                    handler=page.locator('#studioElementColorEdit').evaluate('el=>el.onclick.toString()')
                    assert 'openElementColors'in handler,handler
                    page.locator('#studioElementColorEdit').click()
                page.wait_for_function("()=>document.getElementById('elementColorOverlay').style.display==='flex'&&document.getElementById('periodicTableCanvas').width>0")
                assert read('native editor open')['editor']
                page.locator('#elementColorClose').click()
                page.locator('#modeEditBtn').click()
                page.locator('#editAdaptiveAddAtomBtn').click()
                page.wait_for_function("()=>document.getElementById('editAdaptiveAddAtomPopover').getAttribute('aria-hidden')==='false'")
                opened=read('Build panes in live hosts')
                assert [x['parent']for x in opened['panes']]==['editBuildAtomsHost','editBuildFragmentsHost','editBuildMoleculesHost'],opened
                page.locator('#editBuildSearch').fill('methyl')
                page.locator('#editAdaptiveAddAtomPopover #editFragmentQuick button:visible').first.click()
                assert page.evaluate("()=>VibeMolTesting.getEditBuildState().payload.kind")== 'fragment'
                read('native fragment selected')
                # Workbench suspends a remembered Build window across modes; legacy
                # closes the palette on selection. Neither uses the dead popup.
                page.locator('#modeMeasureBtn').click()
                suspended=read('Measure preserves current live owner')
                expected_owners=initial['panes']if legacy else opened['panes']
                assert [x['parent']for x in suspended['panes']]==[x['parent']for x in expected_owners],suspended
                if not legacy:
                    page.locator('#modeEditBtn').click()
                    page.get_by_role('button',name='Close Build',exact=True).click()
                restored=read('Explicit close restores pane homes')
                assert [x['parent']for x in restored['panes']]==[x['parent']for x in initial['panes']],restored
                assert not errors,errors
                case.update(handler=handler,pageErrors=errors);results.append(case)
            except Exception:
                p.write_failure_artifacts(page,p.ARTIFACTS,'retired-cache-failure',errors,[]);raise
            finally:
                context.close();assert not browser.contexts,'Native cache case left a background context'
    result=dict(passed=True,cases=results,allContextsRetired=True)
    (p.ARTIFACTS/'retired-edit-cache.json').write_text(json.dumps(result,indent=2)+'\n')
    return result


if __name__=='__main__':
    with p.run_http_server(Path(os.environ.get("VIBEMOL_SOURCE_ROOT",p.ROOT)))as url,p.sync_playwright()as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
        try:run(browser,url)
        finally:browser.close()
