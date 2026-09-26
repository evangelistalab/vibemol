#!/usr/bin/env python3
"""Six-direction camera gizmo: hit targets, state isolation, exports and responsive input."""
import math
import os
import premerge as p
from surface_shadows import settings, settle


def pose(page):
    return page.evaluate('()=>VibeMolTesting.getCameraSnapshot()')


def axis_button(page,axis,sign):
    return page.locator('#viewAxis'+('Neg' if sign<0 else '')+axis.upper()+'Btn')


def assert_pose(page,axis,sign,before):
    after=pose(page)
    distance=lambda view:math.sqrt(sum((view['camera'][c]-view['target'][c])**2 for c in 'xyz'))
    assert math.isclose(distance(after),distance(before),rel_tol=1e-6),(before,after)
    for c in 'xyz':
        assert math.isclose(after['target'][c],before['target'][c],abs_tol=1e-6),(before,after)
        delta=after['camera'][c]-after['target'][c]
        assert (delta*sign>0 if c==axis else abs(delta)<distance(after)*1e-5),(axis,sign,after)
    assert after['mode']==before['mode']
    assert after['up']==({'x':0,'y':1,'z':0} if axis=='z' else {'x':0,'y':0,'z':1}),after


def bounded(page):
    return page.evaluate('''()=>{
      const gizmo=document.getElementById('axisGizmo'),box=gizmo.getBoundingClientRect(),canvas=document.getElementById('canvas').getBoundingClientRect();
      const hint=document.getElementById('hint'),hintBox=hint.getBoundingClientRect();
      const ends=[...gizmo.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {
        id:b.id,inside:r.left>=box.left && r.top>=box.top && r.right<=box.right && r.bottom<=box.bottom,
        hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b};});
      return {inside:box.left>=canvas.left && box.right<=canvas.right && box.top>=canvas.top && box.bottom<=canvas.bottom,
        clear:getComputedStyle(hint).visibility==='hidden'||box.bottom<=hintBox.top-10,ends};
    }''')


def run(page,url):
    page.goto(url+'?appearanceStudy=1');page.wait_for_function('()=>window.VibeMolWorkbench')
    assert page.locator('#axisGizmo button').count()==6
    assert page.locator('#workbenchQuickActions button').count()==3
    assert page.locator('#workbenchQuickActions [data-axis]').count()==0
    # Orientation is useful before creating a structure too.
    before=pose(page);axis_button(page,'x',-1).click();assert_pose(page,'x',-1,before)
    assert p.load(page,[{'name':'water.xyz','text':'O 0 0 0\nH 1 0 0\nH -.3 .9 0'}])['ok']
    atoms=page.evaluate('()=>JSON.stringify(VibeMolStructure.exportActive().volume.atoms)')
    page.evaluate('()=>{THREE.Mesh.prototype.onBeforeRender=function(renderer,scene,camera){if(this.userData.type==="atom"){window.axisTestCamera=camera;window.axisTestRenderer=renderer;}};}')
    for projection in ['perspective','orthographic']:
        settings(page,{'view.projection':projection,'view.camera.x':9,'view.camera.y':6,'view.camera.z':8,
          'view.target.x':1,'view.target.y':2,'view.target.z':3,'global.showAxes':True})
        if projection=='orthographic':
            saved=page.evaluate('()=>VibeMolSession.export()');saved['view']['zoom']=.6
            assert page.evaluate('saved=>VibeMolSession.import(saved)',saved)['ok']
        settle(page);zoom=page.evaluate('()=>axisTestCamera.zoom')
        for mode in ['Display','Measure','Edit']:
            page.locator('#mode'+mode+'Btn').click()
            if mode=='Edit':page.evaluate('()=>VibeMolTesting.setEditSelectionIndices([0])')
            for axis in 'xyz':
                for sign in [1,-1]:
                    before=pose(page);axis_button(page,axis,sign).click();settle(page)
                    assert_pose(page,axis,sign,before)
                    assert page.evaluate('()=>axisTestCamera.zoom')==zoom
                    assert axis_button(page,axis,sign).get_attribute('aria-current')=='true'
                    bounds=bounded(page);assert bounds['inside'] and bounds['clear'] and all(e['inside'] and e['hit'] for e in bounds['ends']),bounds
                    assert page.evaluate('()=>JSON.stringify(VibeMolStructure.exportActive().volume.atoms)')==atoms
                    if mode=='Edit':assert page.evaluate('()=>VibeMolTesting.getEditSelectionCount()')==1
    # A pointer drag on the widget cannot become a molecular drag or snap.
    before=pose(page);button=axis_button(page,'x',1);box=button.bounding_box()
    page.mouse.move(box['x']+12,box['y']+12);page.mouse.down()
    page.mouse.move(box['x']+100,box['y']-70,steps=8);page.mouse.up()
    after=pose(page)
    assert all(math.isclose(before[part][c],after[part][c],abs_tol=1e-6) for part in ['camera','target','up'] for c in 'xyz'),(before,after)
    assert page.evaluate('()=>JSON.stringify(VibeMolStructure.exportActive().volume.atoms)')==atoms
    # One Tab stop, wrapping arrows, native Space/Enter and Escape back to canvas.
    button.focus();page.keyboard.press('ArrowLeft')
    assert axis_button(page,'z',-1).evaluate('el=>el===document.activeElement')
    page.keyboard.press('Home');page.keyboard.press('ArrowRight');before=pose(page)
    page.keyboard.press('Space');assert_pose(page,'x',-1,before)
    page.keyboard.press('End');before=pose(page);page.keyboard.press('Enter');assert_pose(page,'z',-1,before)
    assert page.locator('#axisGizmo [tabindex="0"]').count()==1
    page.keyboard.press('Escape');assert page.locator('#canvas').evaluate('el=>el===document.activeElement')
    button.click();page.keyboard.press('m')
    assert page.locator('#modeMeasureBtn').get_attribute('aria-checked')=='true', 'Ordinary app shortcuts remain usable after an axis click'
    # The gizmo is drawn in the actual canvas (PNG/WebM), not only a DOM overlay.
    page.locator('#modeDisplayBtn').click();page.mouse.move(800,100)
    page.evaluate('''()=>{const canvas=document.getElementById('canvas'),r=canvas.getBoundingClientRect(),g=document.getElementById('axisGizmo').getBoundingClientRect();window.axisPixels=()=>{
      const c=document.createElement('canvas');c.width=c.height=144;const ctx=c.getContext('2d');
      ctx.drawImage(canvas,(g.left-r.left)*canvas.width/r.width,(g.top-r.top)*canvas.height/r.height,g.width*canvas.width/r.width,g.height*canvas.height/r.height,0,0,144,144);
      return [...ctx.getImageData(0,0,144,144).data].reduce((a,b)=>a+b,0);};}''')
    settle(page);pixels=page.evaluate('()=>axisPixels()')
    page.screenshot(path=str(p.ARTIFACTS/'axis-gizmo-positive-negative.png'))
    settings(page,{'global.showAxes':False});page.wait_for_function('()=>document.getElementById("axisGizmo").hidden')
    assert page.locator('#axisGizmo').is_hidden()
    settle(page);assert page.evaluate('()=>axisPixels()')!=pixels, 'Axes must be present in the exported canvas pixels'
    settings(page,{'global.showAxes':True});page.wait_for_function('()=>!document.getElementById("axisGizmo").hidden')
    # Docks, Focus and themes all retain the reserved lower-left space.
    page.evaluate('()=>{VibeMolWorkbench.open("coordsPanel");VibeMolWorkbench.open("inspector");}')
    for width,height in [(1440,1000),(850,700),(390,844)]:
        page.set_viewport_size({'width':width,'height':height});settle(page)
        assert page.evaluate('()=>axisTestRenderer.getContext().getError()')==0, 'Gizmo texture resize must not produce WebGL errors'
        for dark in [False,True]:
            page.evaluate('(dark)=>document.documentElement.setAttribute("data-theme",dark?"dark":"light")',dark);settle(page)
            bounds=bounded(page);assert bounds['inside'] and bounds['clear'],bounds
        page.evaluate('()=>VibeMolWorkbench.setFocus(true)');settle(page)
        bounds=bounded(page);assert bounds['inside'] and bounds['clear'] and all(e['hit'] for e in bounds['ends']),bounds
        page.evaluate('()=>VibeMolWorkbench.setFocus(false)')
    page.screenshot(path=str(p.ARTIFACTS/'axis-gizmo-mobile.png'))
    page.goto(url+'?workspaceLab=0&appearanceStudy=1');page.wait_for_function('()=>window.VibeMolTesting')
    before=pose(page);axis_button(page,'y',-1).click();assert_pose(page,'y',-1,before)
    assert page.locator('#viewInspector [data-axis]').count()==0
    print('[axis gizmo] six directions, modes, projections, state isolation, input, bounds, themes and legacy: passed',flush=True)


def main():
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle='+os.environ.get('VIBEMOL_TEST_ANGLE','swiftshader')])
        page=browser.new_page(viewport={'width':1440,'height':1000});errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('dialog',lambda d:d.dismiss())
        try:
            run(page,url);assert not errors,errors
            touch=browser.new_context(viewport={'width':390,'height':844},has_touch=True)
            phone=touch.new_page();phone.goto(url+'?appearanceStudy=1');phone.wait_for_function('()=>window.VibeMolWorkbench')
            before=pose(phone);axis_button(phone,'z',-1).tap();assert_pose(phone,'z',-1,before)
            touch.close();print('[axis gizmo] touch: passed',flush=True)
        except Exception:
            p.write_failure_artifacts(page,p.ARTIFACTS,'axis-gizmo-failure',errors,[]);raise
        finally:browser.close()

if __name__=='__main__':main()
