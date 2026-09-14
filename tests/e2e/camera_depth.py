#!/usr/bin/env python3
"""Camera depth, framing, and picking for slabs and diffuse orbital displays."""
import math
import premerge as p
from surface_shadows import settings, settle


def observe(page):
    page.evaluate('''() => {
      THREE.Mesh.prototype.onBeforeRender=function(renderer,scene,camera,geometry,material){
        if(this.userData.type==='atom') {window.depthCamera=camera;window.depthScene=scene;}
        if(material.uniforms?.cameraNear)window.depthDof={near:material.uniforms.cameraNear.value,far:material.uniforms.cameraFar.value};
      };
      window.readDepthBounds=() => {
        const camera=depthCamera, bounds=new THREE.Box3(), box=new THREE.Box3(), matrix=new THREE.Matrix4();
        const atoms=[];let surfaces=0,clouds=0;
        depthScene.traverseVisible(node=>{
          if(!node.geometry || node.material?.visible===false || node.material?.opacity===0)return;
          if(node.userData.type!=='atom' && !node.material?.userData?.vmAppearanceTarget && !node.userData.vmCloudKind)return;
          const geometry=node.geometry;
          if(!geometry.boundingBox)geometry.computeBoundingBox();
          if(node.isInstancedMesh && !node.boundingBox)node.computeBoundingBox();
          matrix.multiplyMatrices(camera.matrixWorldInverse,node.matrixWorld);
          bounds.union(box.copy(node.isInstancedMesh?node.boundingBox:geometry.boundingBox).applyMatrix4(matrix));
          if(node.material?.userData?.vmAppearanceTarget==='surfaces')surfaces++;
          if(node.userData.vmCloudKind)clouds++;
          if(node.userData.type==='atom'){
            const world=node.getWorldPosition(new THREE.Vector3()),ndc=world.clone().project(camera);
            atoms.push({index:node.userData.index,depth:-world.applyMatrix4(camera.matrixWorldInverse).z,ndc:ndc.toArray()});
          }
        });
        return {near:camera.near,far:camera.far,nearest:-bounds.max.z,farthest:-bounds.min.z,atoms,surfaces,clouds,
          pose:VibeMolTesting.getCameraSnapshot(),zoom:camera.zoom,dof:window.depthDof};
      };
    }''')


def covered(page, orthographic=True):
    settle(page)
    result=page.evaluate('() => readDepthBounds()')
    info={key:value for key,value in result.items() if key!='atoms'}
    assert result['farthest']<=result['far']-3+1e-6,info
    if orthographic:assert result['nearest']>=result['near']+3-1e-6,info
    else:assert result['near']>0,info
    clipped=[atom for atom in result['atoms'] if not -1-1e-6<=atom['ndc'][2]<=1+1e-6]
    assert not clipped,(info,clipped)
    return result


def slab_rotation_and_picking(page, context, url):
    atoms=[f"{'Na' if (i+j+k)%2==0 else 'Cl'} {(i-4.5)*2.82} {(j-4.5)*2.82} {(k-1)*2.82}" for i in range(10) for j in range(10) for k in range(3)]
    assert p.load(page,[{'name':'NaCl.xyz','text':'\n'.join([str(len(atoms)),'NaCl slab']+atoms)}])['ok']
    observe(page)
    settings(page,{'view.projection':'orthographic','view.camera.x':9,'view.camera.y':0,'view.camera.z':4.5,
                   'view.target.x':0,'view.target.y':0,'view.target.z':0,'global.showAxes':False,
                   'global.showBonds':False,'molecule.feature.shadows':False})
    saved=page.evaluate('() => VibeMolSession.export()');saved['view']['zoom']=0.27
    assert page.evaluate('value=>VibeMolSession.import(value)',saved)['ok']
    first=covered(page);assert len(first['atoms'])==300 and first['near']<0
    assert any(atom['depth']<0 for atom in first['atoms'])
    original=page.evaluate('() => VibeMolStructure.exportActive().volume.atoms')
    page.locator('#toolbarCollapseBtn').click()
    for mode in ['Measure','Edit']:
        page.locator('#mode'+mode+'Btn').evaluate('el=>el.click()')
        state=covered(page)
        atom=min((a for a in state['atoms'] if abs(a['ndc'][0])<0.9 and abs(a['ndc'][1])<0.9),key=lambda a:a['depth'])
        assert atom['depth']<0
        point=page.evaluate('index=>VibeMolTesting.projectActiveAtomToClient(index)',atom['index'])
        assert point['visible']
        page.mouse.click(point['x'],point['y'],button='right' if mode=='Edit' else 'left');settle(page)
        selected=page.evaluate('() => VibeMolTesting.getMeasurementSnapshot().atomIndices') if mode=='Measure' else page.evaluate('() => VibeMolTesting.getEditSelectionIndices()')
        assert atom['index'] in selected,(mode,atom,selected)
        page.locator('#canvas').focus();page.keyboard.press('Escape')
    page.locator('#modeDisplayBtn').evaluate('el=>el.click()')
    before=covered(page)
    settings(page,{'molecule.feature.shadows':True})
    after=covered(page);assert before['pose']==after['pose'] and before['zoom']==after['zoom']
    for dx,dy in [(150,70),(-260,110)]:
        page.mouse.move(650,120);page.mouse.down();page.mouse.move(650+dx,120+dy,steps=8);page.mouse.up()
        covered(page)
    page.mouse.move(600,400);page.mouse.wheel(0,160);covered(page)
    page.screenshot(path=str(p.ARTIFACTS/'camera-depth-slab.png'))
    assert page.evaluate('() => VibeMolStructure.exportActive().volume.atoms')==original
    saved=page.evaluate('() => VibeMolSession.export()');before=covered(page)
    assert page.evaluate('value=>VibeMolSession.import(value)',saved)['ok']
    after=covered(page)
    assert after['zoom']==before['zoom']
    for vector in ['camera','target','up']:
        assert all(math.isclose(before['pose'][vector][a],after['pose'][vector][a],abs_tol=1e-8) for a in ['x','y','z'])
    # A far dolly after a small-molecule fit must not retain that fit's old far plane.
    assert p.load(page,[{'name':'water.xyz','text':'O 0 0 0\nH 0.96 0 0\nH -0.25 0.93 0'}])['ok']
    settings(page,{'view.projection':'perspective','view.camera.x':0,'view.camera.y':0,'view.camera.z':2000,
                   'view.target.x':0,'view.target.y':0,'view.target.z':0})
    assert covered(page,False)['far']>2000
    print('[camera] 300-atom slab, rotation/zoom, Measure/Edit picking behind camera, shadows, sessions and distant perspective: passed',flush=True)


def orbital_depth(page, context, url):
    observe(page)
    field=p.cube(1).splitlines()[7]
    spinor=p.cube(-1)+'\n'.join([field,field,field])+'\n'
    assert p.load(page,[{'name':'lobes.2ccube','text':spinor}])['ok']
    settings(page,{'view.projection':'orthographic','view.camera.x':0,'view.camera.y':0,'view.camera.z':0.5,
                   'view.target.x':0,'view.target.y':0,'view.target.z':0,'surface.autoIsoEnabled':False,
                   'surface.iso':0.02,'surface.opacity':0.55,'render.dof.enabled':True,'molecule.feature.shadows':True,
                   'twoComponent.mode':'alphaBetaPhase'})
    saved=page.evaluate('() => VibeMolSession.export()');saved['view']['zoom']=0.08
    assert page.evaluate('value=>VibeMolSession.import(value)',saved)['ok']
    for mode in ['alphaBetaPhase','totalBloch']:
        settings(page,{'twoComponent.mode':mode})
        result=covered(page);assert result['surfaces'] and result['near']<0,result
        assert result['dof']=={'near':result['near'],'far':result['far']},result
        assert page.evaluate('() => VibeMolTesting.getWboitSnapshot().active')
    # Clouds must use the instances' full bounds, not the unit cube's bounds.
    for kind in ['cubes','points']:
        settings(page,{'render.mode':'cloud','render.cloudType':kind})
        result=covered(page);assert result['clouds'],result
    page.screenshot(path=str(p.ARTIFACTS/'camera-depth-orbitals.png'))
    print('[camera] orbital padding, transparent 2C split/Bloch surfaces, signed DOF depth and cube/point clouds: passed',flush=True)


def main():
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True)
        try:
            for run in [slab_rotation_and_picking,orbital_depth]:
                context=browser.new_context(viewport={'width':1200,'height':1000},device_scale_factor=1)
                page=context.new_page();errors=[];console_errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.on('console',lambda message:console_errors.append(message.text) if message.type=='error' else None)
                page.on('dialog',lambda dialog:dialog.dismiss())
                try:
                    page.goto(url+'?appearanceStudy=1');page.wait_for_function('() => window.VibeMolSession')
                    run(page,context,url);assert not errors,errors
                except Exception:
                    p.write_failure_artifacts(page,p.ARTIFACTS,'camera-depth-'+run.__name__,errors,console_errors);raise
                finally:context.close()
        finally:browser.close()


if __name__=='__main__':main()
