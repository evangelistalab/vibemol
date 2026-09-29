#!/usr/bin/env python3
"""Figure camera/renderer transactions, print composition and native panel workflow."""
import base64,json,math,struct,xml.etree.ElementTree as ET
import premerge as p
from surface_shadows import settings,settle


def same_view(a,b):
    for key in a:
        if isinstance(a[key],list):
            assert all(math.isclose(x,y,rel_tol=1e-12,abs_tol=1e-12) for x,y in zip(a[key],b[key])),(a,b)
        elif key in ["near","far"]:assert math.isclose(a[key],b[key],rel_tol=1e-12,abs_tol=1e-12),(a,b)
        else:assert a[key]==b[key],(a,b)

def compose(page, options, name=None):
    result=page.evaluate('''async options=>{
      const before=VibeMolFigure.viewport(), graph=JSON.parse(JSON.stringify(VibeMolTesting.getSceneGraphSnapshot())), cams=[], layers=[];
      const blob=await VibeMolFigure.compose({...options,onPanel:p=>{cams.push(p);layers.push(VibeMolTesting.getSceneGraphSnapshot().scenes.flatMap(s=>s.layers).find(l=>l.id===p.layerId));}});
      const after=VibeMolFigure.viewport(),graphAfter=JSON.parse(JSON.stringify(VibeMolTesting.getSceneGraphSnapshot()));
      const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
      return {before,after,graph,graphAfter,cams,layers,type:blob.type,data:btoa(binary)};
    }''',options)
    same_view(result['before'],result['after'])
    if result['graph']!=result['graphAfter']:
        (p.ARTIFACTS/'figure-state-mismatch.json').write_text(json.dumps(result,indent=2))
        before={l['id']:l for s in result['graph']['scenes'] for l in s['layers']}
        after={l['id']:l for s in result['graphAfter']['scenes'] for l in s['layers']}
        raise AssertionError([(id_,key,l.get(key),after[id_].get(key)) for id_,l in before.items() for key in set(l)|set(after[id_]) if l.get(key)!=after[id_].get(key)])
    cameras=[{k:v for k,v in c.items() if k not in ['index','layerId']} for c in result['cams']]
    assert [c['index'] for c in result['cams']]==list(range(len(cameras)))
    assert all(c==cameras[0] for c in cameras),cameras
    data=base64.b64decode(result.pop('data'))
    if name:(p.ARTIFACTS/name).write_bytes(data)
    return data,result


def run(page,url):
    page.goto(url+'?appearanceStudy=1');page.wait_for_function('()=>window.VibeMolFigure')
    assert p.load(page,[{'name':'first.cube','text':p.cube(-.5)},{'name':'second.cube','text':p.cube(.8)}])['ok']
    settings(page,{'surface.autoIsoEnabled':False,'surface.iso':.03})
    data,result=compose(page,{'widthIn':6.5,'dpi':300,'cols':2,'sharedIso':True,'camera':'fit'},'figure-regression.png')
    assert struct.unpack('>II',data[16:24])[0]==1950
    assert b'pHYs' in data
    assert all(layer['iso']==.03 and not layer['autoIso'] for layer in result['layers']),result['layers']
    assert len({(l['opacity'],l['colorScheme'],l['posColor'],l['negColor']) for l in result['layers']})==1
    assert result['cams'][0]['position']!=result['before']['position']
    _,result=compose(page,{'width':500,'cols':2,'camera':'current'})
    assert result['cams'][0]['position']==result['before']['position']
    settings(page,{'view.projection':'orthographic'})
    compose(page,{'width':400,'cols':2,'camera':'fit'})
    settings(page,{'view.projection':'perspective'})
    page.locator('#modeEditBtn').click()
    compose(page,{'width':400,'cols':2})
    assert page.locator('#modeEditBtn').get_attribute('aria-checked')=='true'
    assert page.evaluate('()=>VibeMolTesting.getMeasurementSnapshot().surfacesSuppressed')
    page.locator('#modeDisplayBtn').click()
    failure=page.evaluate('''async()=>{const before=VibeMolFigure.viewport(),graph=JSON.parse(JSON.stringify(VibeMolTesting.getSceneGraphSnapshot()));let error;
      try{await VibeMolFigure.compose({width:512,_forceThrowOnPanel:2});}catch(e){error=e.message;}
      return {before,after:VibeMolFigure.viewport(),graph,afterGraph:JSON.parse(JSON.stringify(VibeMolTesting.getSceneGraphSnapshot())),error,inert:document.querySelectorAll('[inert]').length};}''')
    same_view(failure['before'],failure['after']);assert failure['graph']==failure['afterGraph'],failure
    assert 'Forced figure capture failure' in failure['error'] and not failure['inert'],failure
    # An aborted capture also restores the transaction, including inert UI.
    assert page.evaluate('''async()=>{const before=VibeMolFigure.viewport(),controller=new AbortController();let error;
      try{await VibeMolFigure.compose({width:400,signal:controller.signal,onPanel:()=>controller.abort()});}catch(e){error=e.name;}
      const after=VibeMolFigure.viewport();return error==='AbortError'&&before.width===after.width&&before.height===after.height&&!document.querySelector('[inert]');}''')
    transparent=page.evaluate('''async()=>{const blob=await VibeMolFigure.compose({width:400,background:'transparent',cols:2});const image=await createImageBitmap(blob);
      const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const p=ctx.getImageData(0,0,c.width,c.height).data;
      let transparent=0,opaque=0;for(let i=3;i<p.length;i+=4){transparent+=p[i]===0;opaque+=p[i]===255;}
      return {corner:[...p.slice(0,4)],transparent,opaque};}''')
    assert transparent['corner'][3]==0 and transparent['transparent']>100 and transparent['opaque']>100,transparent
    settings(page,{'surface.opacity':.4,'render.dof.enabled':True,'render.dof.blurAmount':3})
    data,_=compose(page,{'width':400,'cols':2,'background':'transparent'},'figure-transparent-dof.png')
    settings(page,{'surface.opacity':1,'render.dof.enabled':False})
    targets=page.evaluate('()=>VibeMolFigure.listTargets()')
    labels=[{'id':t['id'],'label':'Orbital <a> & b'} for t in targets]
    data,_=compose(page,{'widthIn':6.5,'dpi':72,'format':'svg','targets':labels},'figure-regression.svg')
    root=ET.fromstring(data);assert root.attrib['width']=='6.5in'
    assert [el.text for el in root.findall('{http://www.w3.org/2000/svg}text')]==['Orbital <a> & b']*2
    limits=page.evaluate('()=>VibeMolFigure.limits()');print('[figure] device limits',limits,flush=True)
    failure=page.evaluate('''async()=>{try{await VibeMolFigure.compose({width:12000,cols:1});}catch(e){return e.message;}}''')
    assert 'limit' in failure or 'supports up to' in failure,failure
    # Open from the native Panels menu; Figure starts in the right dock.
    page.locator('#workbenchPanelsBtn').click();page.locator('[data-window="figurePanel"]').click()
    panel=page.locator('#figurePanel');assert panel.is_visible()
    page.wait_for_function('()=>document.querySelector("#figurePanel img").src.startsWith("blob:")')
    assert panel.get_attribute('data-wb-placement')=='right'
    grip=panel.get_by_role('button',name='Reorder second.cube',exact=True);grip.focus();page.keyboard.press('Alt+ArrowUp')
    assert panel.locator('.vm-figure-targets li').first.get_attribute('data-target')==targets[1]['id']
    panel.get_by_role('switch',name='Shared iso value').check()
    assert panel.locator('[data-iso]').is_visible()
    assert panel.locator('.vm-toggle__thumb').count()==3
    panel.locator('#figure-widthIn').fill('2');panel.locator('#figure-dpi').fill('72')
    panel.locator('#figure-format').select_option('svg')
    page.wait_for_function('()=>!document.querySelector("[inert]")')
    with page.expect_download() as download:panel.get_by_role('button',name='Export figure',exact=True).click()
    download.value.save_as(p.ARTIFACTS/'figure-ui-download.svg')
    assert ET.parse(p.ARTIFACTS/'figure-ui-download.svg').getroot().attrib['width']=='2in'
    page.screenshot(path=str(p.ARTIFACTS/'figure-panel.png'))
    page.locator('#themeToggleShell').click()
    for width in [320,768,1440]:
        page.set_viewport_size({'width':width,'height':1000});settle(page)
        # Right and bottom docks retain independent active tabs across sizes.
        page.evaluate('()=>VibeMolWorkbench.open("figurePanel")');settle(page)
        assert panel.is_visible()
        box=panel.bounding_box();assert box['x']>=-1 and box['x']+box['width']<=width+1,box
        assert panel.locator('.vm-list-popover__body').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
    page.screenshot(path=str(p.ARTIFACTS/'figure-panel-dark.png'))
    page.evaluate('()=>VibeMolWorkbench.close("figurePanel")')
    print('[figure] fixed cameras, union fit, renderer/graph restoration, exception cleanup, PNG size/DPI/alpha, SVG labels, dock and keyboard order passed',flush=True)


def samples(page,url):
    page.goto(url+'?appearanceStudy=1');page.wait_for_function('()=>window.VibeMolFigure')
    # A restored Figure dock may schedule an independent live-preview render.
    page.evaluate('()=>VibeMolWorkbench.close("figurePanel")');settle(page)
    files=[{'name':f'orbital_{i}.2ccube','text':(p.ROOT/f'assets/data/2ccubes/orbital_{i}.2ccube').read_text()} for i in range(6)]
    assert p.load(page,files)['ok'];settings(page,{'surface.autoIsoEnabled':False,'surface.iso':.03})
    options={'widthIn':6.5,'dpi':300,'cols':3,'camera':'fit','sharedIso':True,'sharedLook':True,'background':'white'}
    data,result=compose(page,options,'two-component-figure.png')
    data,_=compose(page,{**options,'format':'svg'},'two-component-figure.svg')
    (p.ARTIFACTS/'figure-report.json').write_text(json.dumps({'limits':page.evaluate('()=>VibeMolFigure.limits()'),'cameras':result['cams']},indent=2))
    print('[figure] six two-component orbitals composed as PNG and SVG',flush=True)


def auto_iso(page,url):
    page.goto(url+'?appearanceStudy=1');page.wait_for_function('()=>window.VibeMolFigure')
    page.evaluate('()=>VibeMolWorkbench.close("figurePanel")');settle(page)
    # Rotated copies have identical distributions; an amplitude-scaled copy
    # needs a scaled threshold to retain the same enclosed orbital shape.
    def orbital(axis,amplitude=1):
        n,step=21,.4
        header=['Auto-iso figure regression','Rotated localized p orbital','1 -4 -4 -4',
                f'{n} {step} 0 0',f'{n} 0 {step} 0',f'{n} 0 0 {step}','1 0 0 0 0']
        grid=[i*step-4 for i in range(n)]
        values=[amplitude*.15*(x,y,z)[axis]*math.exp(-.4*(x*x+y*y+z*z)) for x in grid for y in grid for z in grid]
        return '\n'.join(header+[' '.join(f'{v:.8e}' for v in values)])+'\n'
    assert p.load(page,[{'name':name,'text':orbital(axis,amp)} for name,axis,amp in [('px.cube',0,1),('py.cube',1,1),('pz-scaled.cube',2,3)]])['ok']
    group=p.snapshot(page)['scenes'][0]['layers'][1]['id']
    page.locator(f'.vm-outliner-row[data-id="{group}"]').click()
    page.locator('#autoIsoBtn').evaluate('el=>{el.checked=true;el.dispatchEvent(new Event("change",{bubbles:true}));}')
    before=p.cubes(page);assert all(l['autoIso'] for l in before) and any(l['isoPending'] for l in before),before
    reference=before[0]['iso'];assert not math.isclose(reference,.02)
    assert p.load(page,[{'name':'manual.cube','text':orbital(0)}],clear_first=False)['ok']
    manual=next(l for l in p.cubes(page) if l['name']=='manual.cube');assert not manual['autoIso']
    expected={'px.cube':reference,'py.cube':reference,'pz-scaled.cube':reference*3,'manual.cube':manual['iso']}
    options={'width':600,'cols':2,'camera':'fit','sharedIso':False}
    for extra,name in [({'preview':True},None),({},'figure-auto-iso.png'),({'format':'svg'},'figure-auto-iso.svg')]:
        _,result=compose(page,{**options,**extra},name)
        for layer in result['layers']:
            assert math.isclose(layer['iso'],expected[layer['name']],rel_tol=1e-7),(layer['name'],layer['iso'],expected[layer['name']])
            assert not layer['isoPending']
    _,locked=compose(page,{**options,'sharedIso':True,'iso':.017})
    assert all(l['iso']==.017 and not l['autoIso'] for l in locked['layers'])
    failure=page.evaluate('''async()=>{const before=JSON.stringify(VibeMolTesting.getSceneGraphSnapshot());let error;
      try{await VibeMolFigure.compose({width:300,sharedIso:false,_forceThrowOnPanel:2});}catch(e){error=e.message;}
      return {restored:before===JSON.stringify(VibeMolTesting.getSceneGraphSnapshot()),error};}''')
    assert failure['restored'] and 'Forced figure capture failure' in failure['error'],failure
    # The main renderer must resolve the same per-orbital values on activation.
    for layer in p.cubes(page):
        page.locator(f'.vm-outliner-row[data-id="{layer["id"]}"]').click();settle(page)
        live=next(l for l in p.cubes(page) if l['id']==layer['id'])
        assert math.isclose(live['iso'],expected[live['name']],rel_tol=1e-7),(live,expected)
    # Both raw and phase-like spinor channels must use their own distributions.
    settings(page,{'surface.autoIsoEnabled':True})
    def spinor(axis):
        lines=orbital(axis).splitlines();values=[float(v) for v in lines[-1].split()]
        return '\n'.join(lines[:-1]+[' '.join(f'{v*scale:.8e}' for scale in [1,2,.5,.25] for v in values)])+'\n'
    assert p.load(page,[{'name':'px.2ccube','text':spinor(0)},{'name':'py.2ccube','text':spinor(1)}])['ok']
    for mode in ['alphaBetaPhase','betaIm']:
        settings(page,{'twoComponent.mode':mode})
        # Preset import synchronizes the rounded iso input. Resolve through the
        # ordinary render path before comparing its full-precision threshold.
        p.redraw(page);settle(page)
        reference=p.cubes(page)[0]['iso']
        _,result=compose(page,{'width':320,'camera':'fit','sharedIso':False})
        assert all(math.isclose(l['iso'],reference,rel_tol=1e-7) for l in result['layers']),(mode,reference,result['layers'])
    # Unvisited Molden orbitals have not even generated a grid yet.
    assert p.load(page,[{'name':'auto.molden','text':p.MOLDEN}])['ok']
    assert all(l['autoIso'] and l['isoPending'] for l in p.cubes(page))
    _,result=compose(page,{'width':360,'camera':'fit','sharedIso':False})
    reference=result['layers'][0]['iso'];assert not math.isclose(reference,.02)
    assert all(not l['isoPending'] and math.isclose(l['iso'],reference,rel_tol=1e-7) for l in result['layers'])
    page.locator(f'.vm-outliner-row[data-id="{p.cubes(page)[0]["id"]}"]').click();settle(page)
    assert math.isclose(p.cubes(page)[0]['iso'],reference,rel_tol=1e-7)
    print('[figure] rotated/scaled hidden orbitals honor Auto-iso in preview/PNG/SVG, match viewport, retain manual/shared values, and restore layer state',flush=True)
    print('[figure] raw/phase spinors and deferred Molden Auto-iso match viewport thresholds; failed exports restore pending values',flush=True)


def main():
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True)
        page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
        errors=[];console=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:console.append(m.text) if m.type=='error' else None)
        page.on('dialog',lambda d:d.dismiss())
        try:
            run(page,url);auto_iso(page,url);samples(page,url);assert not errors,errors;assert not console,console
        except Exception:
            p.write_failure_artifacts(page,p.ARTIFACTS,'figure',errors,console);raise
        finally:browser.close()
if __name__=='__main__':main()
