#!/usr/bin/env python3
"""Build owns bond-order clicks and highlights the complete logical bond."""
import json
import sys
import premerge as p
import edit_picking as picking
from edit_tool import arm, close_build
from surface_shadows import settings, settle


def source():
    marker = 'window.VibeMolTesting = Object.freeze({'
    return picking.instrumented_source().replace(marker, '''window.__bondHoverObject = () => hoverBondObjects[0]?.userData.hoverOverlay;
    window.__bondHoverProbe = () =>
      hoverBondObjects.map(carrier => {
        const overlay = carrier.userData.hoverOverlay;
        const source = bondDashSources.get(carrier);
        return {section:overlay?.userData.section, count:source?.indices.length ?? 0,
          overlayCount:overlay?.count ?? 0, instanced:!!overlay?.isInstancedMesh,
          matrixMatches:!source || source.indices.every((index,i)=>
            Array.from(source.mesh.instanceMatrix.array.slice(index*16,index*16+16))
              .every((n,j)=>n===overlay?.instanceMatrix?.array[i*16+j])),
          hitEnabled: (()=>{const hits=[]; overlay?.raycast(null,hits);return hits.length>0;})()};
      });
    ''' + marker)


def order(page):
    return page.evaluate('()=>VibeMolStructure.exportActive().volume.bonds[0].order')


def point(page, section):
    return page.evaluate('''section=>__editProbe.points().find(p=>__editProbe.query(p)?.section===section)''', section)


def load(page, style='basic', bond_order=1, hydrogen=False, metal=False):
    picking.mode(page, 'Display')
    payload = json.loads(picking.build_fixture_structure())
    payload['volume']['atoms'][0].update(x=-2, Z=11 if metal else 6)
    payload['volume']['atoms'][1].update(x=2, Z=17 if metal else 1 if hydrogen else 6)
    payload['volume']['bonds'][0].update(order=bond_order, origin='explicit', style='metal-dative' if metal else 'covalent')
    page.evaluate('v=>VibeMolStructure.importFromText(JSON.stringify(v),"build-bond")', payload)
    page.evaluate('style=>VibeMolAppearanceLooks.apply(style)', style)
    settings(page, {'view.camera.x':0, 'view.camera.y':0, 'view.camera.z':10,
                    'view.target.x':0, 'view.target.y':0, 'view.target.z':0,
                    'view.shift.x':0, 'view.shift.y':0, 'view.shift.z':0})
    picking.mode(page, 'Edit')
    arm(page);close_build(page)


def hover(page, pos):
    assert pos, 'No visible bond point'
    page.mouse.move(pos['clientX'],pos['clientY']);settle(page)
    overlays=page.evaluate('()=>__bondHoverProbe()')
    assert overlays and all(o['section']=='' and not o['hitEnabled'] for o in overlays),overlays
    return overlays


def run(page, url):
    page.route('**/assets/app/js/app.js',lambda route:route.fulfill(body=source(),content_type='text/javascript'))
    page.goto(url+'?appearanceStudy=1');page.wait_for_function('()=>window.VibeMolWorkbench')
    load(page)
    page.locator('#editTransformToolBtn').click()
    for section in ['nearA','center','nearB']:
        pos=point(page,section);assert pos,section
        page.mouse.click(pos['clientX'],pos['clientY']);settle(page)
        assert order(page)==1
    arm(page);close_build(page)
    for expected,section in zip([2,3,4,3,2,1],['nearA','nearB','center']*2):
        pos=point(page,section);hover(page,pos)
        page.mouse.click(pos['clientX'],pos['clientY']);settle(page)
        assert order(page)==expected,(expected,order(page))
    # Each click is one undoable change; dragging must not cycle the bond.
    key='Meta' if sys.platform=='darwin' else 'Control'
    page.locator('#canvas').focus();page.keyboard.press(key+'+z');settle(page);assert order(page)==2
    page.keyboard.press(key+'+Shift+z');settle(page);assert order(page)==1
    pos=point(page,'center')
    page.mouse.move(pos['clientX'],pos['clientY']);page.mouse.down()
    page.mouse.move(pos['clientX']+25,pos['clientY'],steps=5);page.mouse.up();settle(page)
    assert order(page)==1
    # Full-length overlays include all cylinders, curved Kit geometry, and dashes.
    for style,count in [('basic',2),('classic',3),('kit',2)]:
        load(page,style,count)
        for section in ['nearA','center','nearB']:
            overlays=hover(page,point(page,section));assert len(overlays)>=count,(style,overlays)
        page.screenshot(path=str(p.ARTIFACTS/f'build-bond-{style}.png'))
    load(page,metal=True)
    pos=page.evaluate('()=>__editProbe.overlapPoints().bond')
    overlays=hover(page,pos)
    assert any(o['instanced'] and o['count']>1 and o['count']==o['overlayCount'] and o['matrixMatches'] for o in overlays),overlays
    page.screenshot(path=str(p.ARTIFACTS/'build-bond-dashed.png'))
    page.evaluate('''()=>{
      window.__overlayDisposed=false;
      const overlay=window.__bondHoverObject();
      overlay.geometry.addEventListener('dispose',()=>window.__overlayDisposed=true);
    }''')
    page.mouse.move(100,150);settle(page)
    assert page.evaluate('()=>window.__overlayDisposed'), 'Hover geometry was not disposed'
    # A foreground atom wins over a remembered bond hover.
    page.evaluate('()=>__editProbe.setAtomDepth(1,2)');settle(page)
    atom=page.evaluate('()=>VibeMolTesting.projectActiveAtomToClient(1)')
    before=order(page);page.mouse.click(atom['x'],atom['y']);settle(page);assert order(page)==before
    load(page,hydrogen=True)
    pos=point(page,'nearB');hover(page,pos);page.mouse.click(pos['clientX'],pos['clientY']);settle(page)
    assert order(page)==1
    assert 'Hydrogen can only form a single bond' in page.locator('#hint').inner_text()
    print('[build bonds] full hover, ends/center, Transform isolation, undo/redo, drags, multiple/curved/dashed bonds and H limit: passed',flush=True)


def main():
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
        page=browser.new_page(viewport={'width':1440,'height':1000});errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.dismiss())
        try:
            run(page,url);assert not errors,errors
        except Exception:
            p.write_failure_artifacts(page,p.ARTIFACTS,'build-bonds-failure',errors,[]);raise
        finally:browser.close()


if __name__=='__main__':main()
