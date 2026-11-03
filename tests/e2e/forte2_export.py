"""Export-only forte2/CAS contract. Existing native suites are not converted."""
import ast
import json
from pathlib import Path
import premerge as p
from edit_api import ready
from surface_shadows import settle
from checkpoint_contract import require_phase_counts

CASES = ['surface','lazy-fields','load','focus-not-orbitals','aset-labels','export-unchanged','subspace-owner','plane-override','plane-copy-only',
         'element-absent','ordinal-range','atom-missing','plane-small','plane-components','duplicate-plane','empty-planes','stale',
         'rhf-cas','rhf-tuple','rohf-positive','rohf-negative','ghf-cas','ghf-label','cas-odd','cas-capacity','cas-negative','cas-noninteger',
         'cas-session','native-hit','page-errors']
XYZ='7\ncyclopropene\nC 0 0 .859492\nC 0 -.651229 -.499559\nC 0 .651229 -.499559\nH .91265 0 1.457504\nH -.91265 0 1.457504\nH 0 -1.585659 -1.038624\nH 0 1.585659 -1.038624\n'
PLANE={'kind':'piPlane','seed':{'kind':'element','element':'C'}}

def run_matrix(output):
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    rows=[]
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
        try:
            # Calculations' native panel is a Workbench surface. Legacy has no
            # Subspace launcher; its API is covered separately below.
            for legacy in (False,):
                for dark in (False,True):
                    name=('legacy' if legacy else 'workbench')+('-dark' if dark else '-light')
                    context=browser.new_context(viewport={'width':1512,'height':1000},color_scheme='dark' if dark else 'light')
                    context.add_init_script("localStorage.setItem('vibemol.uiTheme',"+json.dumps('dark' if dark else 'light')+")")
                    page=context.new_page();errors=[];seen=[]
                    page.on('pageerror',lambda error:errors.append(str(error)))
                    def check(case,actual,expected):
                        row=dict(context=name,case=case,actual=actual,expected=expected)
                        print('[forte2-case] '+json.dumps(row),flush=True)
                        assert actual==expected,row
                        assert case in CASES and case not in seen,row
                        rows.append(row);seen.append(case)
                    def export(request):
                        row=page.evaluate('''request=>{
                          const state=()=>JSON.stringify({volume:VibeMolStructure.exportActive().volume,calculations:VibeMolCalculations.state(),selection:VibeMolEdit.getSelection()});
                          const before=state(),result=VibeMolForte2.export(request);return {result,unchanged:before===state()};
                        }''',request)
                        row['expectedUnchanged']=True
                        print('[forte2-export] '+json.dumps(row),flush=True)
                        assert row['unchanged'],row
                        return row['result']
                    try:
                        page.goto(url+'?appearanceStudy=1&qa=1'+('&workspaceLab=0' if legacy else ''))
                        ready(page,'()=>!!window.VibeMolForte2',site='forte2-startup')
                        check('surface',dict(members=page.evaluate('()=>Object.keys(VibeMolForte2)'),theme=page.locator('html').get_attribute('data-theme')),dict(members=['export'],theme='dark' if dark else 'light'))
                        check('lazy-fields',page.locator('#avas-casElectrons').count(),0)
                        check('load',p.load(page,[dict(name='forte2.xyz',text=XYZ)])['ok'],True)
                        page.evaluate('()=>VibeMolCalculations.enter()');ready(page,'()=>!!document.querySelector("#subspacePanel.open")',site='forte2-panel')
                        page.evaluate('()=>VibeMolCalculations.ready()');settle(page)
                        page.evaluate('()=>VibeMolCalculations.selectAtoms([0,1,2])')
                        check('focus-not-orbitals',dict(error=export({'avas':{}})['error']['code'],
                            method=page.locator('#avas-method').input_value(),
                            electrons=page.locator('#avas-casElectrons').input_value(),
                            orbitals=page.locator('#avas-casOrbitals').input_value()),
                            dict(error='AVAS_INVALID',method='cas',electrons='',orbitals=''))
                        page.locator('#avas-method').select_option('cumulative');settle(page)
                        for index in range(3):page.evaluate('i=>VibeMolCalculations.selectShell(i,"2p")',index)
                        value=export({'fragment':{'kind':'labels','labels':['C1','C3']},'avas':{}})['value']
                        check('aset-labels',value['aset'],{'fragment':['C1','C3']})
                        check('export-unchanged',value['geometry']['atoms'][0]['position'],[0,0,.859492])
                        check('subspace-owner',value['avas']['arguments']['subspace'],['C(2p)'])
                        value=export({'avas':{'planes':[PLANE]}})['value']
                        check('plane-override',value['avas']['arguments']['subspace_pi_planes'],[['C1-3']])
                        check('plane-copy-only',page.evaluate('()=>VibeMolCalculations.state().planes'),[])
                        for case,predicate,expected in [('element-absent',{'kind':'element','element':'O'},'ELEMENT_ABSENT'),
                          ('ordinal-range',{'kind':'labels','labels':['C4']},'ELEMENT_INDEX_OUT_OF_RANGE'),
                          ('atom-missing',{'kind':'ids','ids':['missing']},'ATOM_NOT_FOUND'),
                          ('plane-small',{'kind':'piPlane','seed':{'kind':'labels','labels':['C1','C2']}},'PLANE_TOO_SMALL')]:
                            check(case,export({'fragment':predicate})['error']['code'],expected)
                        page.evaluate('()=>VibeMolCalculations.selectComponent(0,"2p","px")')
                        check('plane-components',export({'avas':{'planes':[PLANE]}})['error']['code'],'AVAS_PLANE_INVALID')
                        page.evaluate('()=>VibeMolCalculations.selectShell(0,"2p")')
                        check('duplicate-plane',export({'avas':{'planes':[PLANE,PLANE]}})['error']['code'],'DUPLICATE_PLANE')
                        check('empty-planes','subspace_pi_planes' in export({'avas':{'planes':[]}})['value']['avas']['arguments'],False)
                        check('stale',export({'system':{'systemId':'stale','fingerprint':'stale'},'avas':{}})['error']['code'],'STALE_CONTEXT')
                        page.locator('#avas-method').select_option('cas')
                        def configure(**patch):page.evaluate('patch=>VibeMolCalculations.configure(patch)',patch);settle(page)
                        configure(reference='RHF',charge=0,cas=[4,3])
                        result=page.evaluate('()=>VibeMolCalculations.export()');print('[forte2-cas-program] '+json.dumps(result),flush=True)
                        check('rhf-cas',dict(errors=result['validation']['errors'],tuple='cas=(4, 3),' in result['code'],method='selection_method="cas"' in result['code']),dict(errors=[],tuple=True,method=False))
                        tree=ast.parse(result['code']);calls=[n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='AVAS']
                        cas=next(k.value for k in calls[0].keywords if k.arg=='cas')
                        check('rhf-tuple',dict(type=type(cas).__name__,values=[n.value for n in cas.elts]),dict(type='Tuple',values=[4,3]))
                        for case,ms in [('rohf-positive',.5),('rohf-negative',-.5)]:
                            configure(reference='ROHF',charge=1,ms=ms,cas=[5,6]);r=export({'avas':{}})
                            check(case,dict(ok=r['ok'],socc=r.get('value',{}).get('avas',{}).get('cas',{}).get('singlyOccupied')),dict(ok=True,socc=1))
                        configure(reference='GHF',charge=0,cas=[8,12])
                        value=export({'avas':{}})['value'];code=page.evaluate('()=>VibeMolCalculations.export().code')
                        check('ghf-cas',dict(cas=value['avas']['arguments']['cas'],tuple='cas=(8, 12),' in code,x2c='x2c=X2CParams(x2c_type="so")' in code),dict(cas=[8,12],tuple=True,x2c=True))
                        check('ghf-label',page.locator('label[for="avas-casOrbitals"]').inner_text(),'CAS spinors')
                        for case,pair in [('cas-odd',[3,4]),('cas-capacity',[8,3]),('cas-negative',[-2,4]),('cas-noninteger',[2.5,4])]:
                            configure(reference='RHF',cas=pair)
                            r=export({'avas':{}});check(case,dict(ok=r['ok'],code=r['error']['code'],program=page.evaluate('()=>VibeMolCalculations.export().code')),dict(ok=False,code='AVAS_INVALID',program=''))
                        configure(reference='RHF',cas=[4,3]);saved=page.evaluate('()=>VibeMolSession.export()');imported=page.evaluate('s=>VibeMolSession.import(s)',saved)
                        page.evaluate('()=>VibeMolCalculations.enter()');settle(page)
                        check('cas-session',dict(importOk=imported['ok'],cas=page.evaluate('()=>VibeMolCalculations.state().options.cas')),dict(importOk=True,cas=[4,3]))
                        page.set_viewport_size(dict(width=390,height=850));settle(page)
                        field=page.locator('#avas-casElectrons');field.scroll_into_view_if_needed()
                        hit=field.evaluate('e=>{const b=e.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2,t=document.elementFromPoint(x,y);return {eligible:t===e||e.contains(t),width:innerWidth,right:b.right};}')
                        field.fill('6');field.press('Tab');settle(page)
                        check('native-hit',dict(eligible=hit['eligible'],inViewport=hit['right']<=390,theme=page.locator('html').get_attribute('data-theme'),applied=page.evaluate('()=>VibeMolCalculations.state().options.cas')),dict(eligible=True,inViewport=True,theme='dark' if dark else 'light',applied=[6,3]))
                        page.screenshot(path=str(output/(name+'-cas390.png')))
                        check('page-errors',errors,[])
                        assert seen==CASES,dict(actual=seen,expected=CASES)
                    except Exception:
                        p.write_failure_artifacts(page,output,name+'-forte2',errors,[]);raise
                    finally:context.close()
                    assert len(browser.contexts)==0,dict(actual=len(browser.contexts),expected=0)
            for dark in (False,True):
                name='legacy-'+('dark' if dark else 'light')
                context=browser.new_context(viewport={'width':1512,'height':1000},color_scheme='dark' if dark else 'light')
                context.add_init_script("localStorage.setItem('vibemol.uiTheme',"+json.dumps('dark' if dark else 'light')+")")
                page=context.new_page();errors=[];seen=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                try:
                    page.goto(url+'?appearanceStudy=1&qa=1&workspaceLab=0')
                    ready(page,'()=>!!window.VibeMolForte2',site='legacy-forte2-startup')
                    # Reuse only the count/log owner, not Workbench-only UI preconditions.
                    check('load',p.load(page,[dict(name='legacy-forte2.xyz',text=XYZ)])['ok'],True)
                    check('aset-labels',export({'fragment':{'kind':'labels','labels':['C1','C3']}})['value']['aset'],{'fragment':['C1','C3']})
                    page.evaluate('()=>VibeMolCalculations.ready()')
                    for index in range(3):page.evaluate('i=>VibeMolCalculations.selectShell(i,"2p")',index)
                    page.evaluate('()=>VibeMolCalculations.configure({method:"cas",cas:[4,3]})')
                    check('rhf-cas',export({'avas':{}})['value']['avas']['arguments']['cas'],[4,3])
                    check('page-errors',dict(errors=errors,theme=page.locator('html').get_attribute('data-theme')),dict(errors=[],theme='dark' if dark else 'light'))
                    assert seen==['load','aset-labels','rhf-cas','page-errors'],seen
                except Exception:
                    p.write_failure_artifacts(page,output,name+'-forte2',errors,[]);raise
                finally:context.close()
                assert len(browser.contexts)==0,dict(actual=len(browser.contexts),expected=0)
        finally:browser.close()
    require_phase_counts({'forte2-case':len(rows)},'tests/e2e/calculations.py','forte2-case')
    (output/'matrix.json').write_text(json.dumps(dict(cases=CASES,contexts=4,workbenchCases=30,legacyCases=4,checkpointCounts={'forte2-case':len(rows)},checkpoints=rows,residualContexts=0),indent=2)+'\n')
