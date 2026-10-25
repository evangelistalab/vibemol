#!/usr/bin/env python3
"""Camera depth, framing, and picking for slabs and diffuse orbital displays."""
import math
from assertion_contract import numbers_close
import json
import premerge as p
from surface_shadows import settings, settle


def assert_camera_frustum_matches_pose(page, label, expected_distance):
    """Check arithmetic after the tested mutation, without a mode flip or resize."""
    settle(page)
    actual=page.evaluate('''() => {
      const c=depthCamera,t=VibeMolTesting.getCameraSnapshot().target;
      const rect=document.getElementById('canvas').getBoundingClientRect();
      return {type:c.type,position:c.position.toArray(),target:[t.x,t.y,t.z],
        distance:c.position.distanceTo(new THREE.Vector3(t.x,t.y,t.z)),zoom:c.zoom,
        left:c.left,right:c.right,top:c.top,bottom:c.bottom,
        matrixX:c.projectionMatrix.elements[0],matrixY:c.projectionMatrix.elements[5],
        width:rect.width,height:rect.height};
    }''')
    half_height=max(.01,expected_distance)*math.tan(math.pi/8)
    half_width=half_height*actual['width']/actual['height']
    expected=dict(distance=expected_distance,left=-half_width,right=half_width,
        top=half_height,bottom=-half_height,matrixX=actual['zoom']/half_width,matrixY=actual['zoom']/half_height)
    comparands=dict(case=label,actual=actual,expected=expected,actualToExpectedHalfHeight=actual['top']/half_height)
    print('[camera-frustum] '+json.dumps(comparands),flush=True)
    assert actual['type']=='OrthographicCamera',comparands
    for key,value in expected.items():
        assert numbers_close(actual[key],value,rel_tol=1e-9,abs_tol=1e-12),(key,comparands)
    return actual


def projection_pose_refresh(page, context, url):
    # #3: establish a valid starting projection, then mutate ordinary pose inputs.
    # The characterization perspective->orthographic pin must never run AFTER
    # the tested mutation: it records matrices but otherwise masks this defect.
    observe(page)
    settings(page,{'view.projection':'orthographic'})
    assert p.load(page,[{'name':'pose.xyz','text':'2\nSymmetric H2\nH -1 0 0\nH 1 0 0\n'}])['ok']
    settle(page)
    default_distance=page.evaluate('''()=>{
      const t=VibeMolTesting.getCameraSnapshot().target;
      return depthCamera.position.distanceTo(new THREE.Vector3(t.x,t.y,t.z));
    }''')
    def baseline():
        settings(page,{'view.projection':'perspective'})
        settings(page,{'view.camera.x':30,'view.camera.y':20,'view.camera.z':30,
            'view.target.x':0,'view.target.y':0,'view.target.z':0,'view.autoRotate':False})
        settings(page,{'view.projection':'orthographic'})
        assert_camera_frustum_matches_pose(page,'known starting pose',math.sqrt(2200))
    for name,change,distance in [
        ('camera-only',{'view.camera.y':0,'view.camera.z':0},30),
        ('target-only',{'view.target.x':10},math.sqrt(1700)),
        ('combined',{'view.camera.y':0,'view.camera.z':0,'view.target.x':10},20),
        ('same-mode and camera',{'view.projection':'orthographic','view.camera.y':0,'view.camera.z':0},30),
    ]:
        baseline();settings(page,change)
        assert_camera_frustum_matches_pose(page,name,distance)
    baseline()
    page.evaluate('''()=>{for(const [id,value] of [['camY',0],['camZ',0]]){
      const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}}''')
    assert_camera_frustum_matches_pose(page,'Camera numeric inputs',30)
    page.locator('#tgtX').evaluate("e=>{e.value=10;e.dispatchEvent(new Event('input',{bubbles:true}));}")
    assert_camera_frustum_matches_pose(page,'Target numeric input',20)
    page.locator('#pointCameraComBtn').evaluate('e=>e.click()')
    assert_camera_frustum_matches_pose(page,'Point camera at COM',30)
    settings(page,{'view.target.x':10})
    # T04 is a separate ordering bug: Reset refreshes before restoring target.
    # The common observer must cover it before the next projected helper/draw.
    page.locator('#viewReset').evaluate('e=>e.click()')
    assert_camera_frustum_matches_pose(page,'T04 Reset target ordering',default_distance)
    settings(page,{'view.camera.x':30,'view.camera.y':0,'view.camera.z':0,
        'view.target.x':0,'view.target.y':0,'view.target.z':0})
    assert_camera_frustum_matches_pose(page,'guard starting pose',30)
    page.evaluate('''()=>{
      window.projectionOwnerCalls={orthographic:0,perspective:0};
      for(const [kind,prototype] of [['orthographic',THREE.OrthographicCamera.prototype],['perspective',THREE.PerspectiveCamera.prototype]]){
        const original=prototype.updateProjectionMatrix;
        prototype.updateProjectionMatrix=function(...args){
          if(window.traceProjectionOwner && new Error().stack.includes('at updateActiveCameraProjection'))projectionOwnerCalls[kind]++;
          return original.apply(this,args);
        };
      }
    }''')
    for projection in ['orthographic','perspective']:
        settings(page,{'view.projection':projection})
        calls=page.evaluate('''()=>new Promise(resolve=>{
          projectionOwnerCalls={orthographic:0,perspective:0};window.traceProjectionOwner=true;let frames=0;
          function tick(){if(++frames<60)requestAnimationFrame(tick);else{
            window.traceProjectionOwner=false;resolve({frames,...projectionOwnerCalls});}}
          requestAnimationFrame(tick);
        })''')
        print('[camera-projection-owner] '+json.dumps(dict(projection=projection,actual=calls,
            expected=dict(frames=60,orthographic=0,perspective=0))),flush=True)
        assert calls==dict(frames=60,orthographic=0,perspective=0),(projection,calls)


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
        if mode=='Edit':
            page.locator('#canvas').focus();page.keyboard.press('Escape')
        page.mouse.click(point['x'],point['y']);settle(page)
        selected=page.evaluate('() => VibeMolTesting.getMeasurementSnapshot().atomIndices') if mode=='Measure' else page.evaluate('() => VibeMolTesting.getEditSelectionIndices()')
        assert atom['index'] in selected,(mode,atom,selected)
        page.locator('#canvas').focus();page.keyboard.press('Escape')
    page.locator('#modeDisplayBtn').evaluate('el=>el.click()')
    before=covered(page)
    settings(page,{'molecule.feature.shadows':True})
    after=covered(page)
    comparands=dict(phase='slab shadows preserve view',actualPose=after['pose'],expectedPose=before['pose'],
        actualZoom=after['zoom'],expectedZoom=before['zoom'])
    print('[camera-view-preservation] '+json.dumps(comparands),flush=True)
    assert before['pose']==after['pose'],comparands
    assert before['zoom']==after['zoom'],comparands
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
        assert all(numbers_close(before['pose'][vector][a],after['pose'][vector][a],abs_tol=1e-8) for a in ['x','y','z'])
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


def edit_grid_continuity(page, context, url):
    observe(page)
    assert p.load(page,[{'name':'water.xyz','text':'O 0 0 0\nH .96 0 0\nH -.25 .93 0'}])['ok']
    page.locator('#modeEditBtn').evaluate('el=>el.click()')
    settings(page,{'global.showAxes':False,'molecule.feature.shadows':False})
    settle(page)
    page.evaluate('''() => {
      window.gridImage=() => {
        const src=document.getElementById('canvas'),dst=document.createElement('canvas');
        dst.width=src.width;dst.height=src.height;
        const ctx=dst.getContext('2d');ctx.drawImage(src,0,0);
        return ctx.getImageData(0,0,dst.width,dst.height);
      };
      window.gridSamples=() => {
        const c=depthCamera,src=document.getElementById('canvas');
        const groups={outside:[],before:[],after:[]};
        for(let x=-120;x<=120;x+=5)for(let y=-120;y<=120;y+=5){
          const world=new THREE.Vector3(x,y,0),ndc=world.clone().project(c);
          if(Math.abs(ndc.x)>.7 || Math.abs(ndc.y)>.65 || Math.hypot(x,y)<5)continue;
          const distance=world.distanceTo(c.position);
          if(c.isPerspectiveCamera && (world.clone().applyMatrix4(c.matrixWorldInverse).z>=0 || distance>2*depthScene.getObjectByName('edit-grid').material.uniforms.fadeDistance.value))continue;
          const point={x:Math.round((ndc.x+1)*src.width/2),y:Math.round((1-ndc.y)*src.height/2)};
          if(Math.abs(x)>24 || Math.abs(y)>24)groups.outside.push(point);
          if(ndc.z < -1)groups.before.push(point);
          if(ndc.z > 1)groups.after.push(point);
        }
        return groups;
      };
      window.gridDelta=point => {
        let delta=0;
        for(let y=point.y-2;y<=point.y+2;y++)for(let x=point.x-2;x<=point.x+2;x++){
          const i=(y*gridWith.width+x)*4;
          for(let j=0;j<3;j++)delta=Math.max(delta,Math.abs(gridWith.data[i+j]-gridWithout.data[i+j]));
        }
        return delta;
      };
    }''')
    for projection,shift in [('orthographic',0),('orthographic',80),('perspective',0)]:
        settings(page,{'view.projection':projection,'view.camera.x':8+shift,'view.camera.y':-12,'view.camera.z':5,
                       'view.target.x':shift,'view.target.y':0,'view.target.z':0})
        settle(page)
        if projection=='orthographic':
            page.evaluate('''() => {const c=depthCamera;c.left=-40;c.right=40;c.top=30;c.bottom=-30;c.zoom=1;c.updateProjectionMatrix();}''')
        settle(page)
        groups=page.evaluate('() => gridSamples()')
        grid_comparands=dict(projection=projection,shift=shift,
            actualFrustum=page.evaluate('()=>({left:depthCamera.left,right:depthCamera.right,top:depthCamera.top,bottom:depthCamera.bottom,zoom:depthCamera.zoom})'),
            expectedFixtureFrustum=dict(left=-40,right=40,top=30,bottom=-30,zoom=1) if projection=='orthographic' else None,
            actualGroupCounts={key:len(value) for key,value in groups.items()},
            expectedNonemptyGroups=['outside','before','after'] if projection=='orthographic' else ['after'])
        print('[camera-grid-fixture] '+json.dumps(grid_comparands),flush=True)
        depth=page.evaluate('() => [depthCamera.near,depthCamera.far]')
        page.evaluate('''() => {window.gridWith=gridImage();depthScene.getObjectByName('edit-grid').material.visible=false;}''')
        settle(page)
        page.evaluate('() => {window.gridWithout=gridImage();}')
        without_depth=page.evaluate('() => [depthCamera.near,depthCamera.far]')
        assert all(numbers_close(a,b,rel_tol=1e-8,abs_tol=1e-6) for a,b in zip(depth,without_depth)),(depth,without_depth)
        for kind in (['outside','before','after'] if projection=='orthographic' else ['after']):
            points=groups[kind]
            assert points,(projection,shift,kind,grid_comparands)
            deltas=page.evaluate('points => points.map(gridDelta)',points)
            assert all(delta>3 for delta in deltas),(projection,shift,kind,deltas)
        page.evaluate("() => {depthScene.getObjectByName('edit-grid').material.visible=true;}")
        settle(page)
    # The ground must still be occluded by atoms, and remain hidden outside Edit.
    settings(page,{'view.projection':'orthographic','view.camera.x':0,'view.camera.y':0,'view.camera.z':8,
                   'view.target.x':0,'view.target.y':0,'view.target.z':0})
    settle(page)
    page.evaluate('''() => {depthCamera.zoom=8;depthCamera.updateProjectionMatrix();}''')
    settle(page)
    point=page.evaluate('''() => {
      let atom;depthScene.traverseVisible(o=>{if(o.userData.type==='atom' && o.userData.index===0)atom=o;});
      const src=document.getElementById('canvas'),v=atom.getWorldPosition(new THREE.Vector3()).project(depthCamera);
      window.gridWith=gridImage();depthScene.getObjectByName('edit-grid').material.visible=false;
      return {x:Math.round((v.x+1)*src.width/2),y:Math.round((1-v.y)*src.height/2)};
    }''')
    settle(page)
    page.evaluate('() => {window.gridWithout=gridImage();}')
    assert page.evaluate('point => gridDelta(point)',point)<=1
    page.evaluate("() => {depthScene.getObjectByName('edit-grid').material.visible=true;}")
    for mode in ['Display','Measure','Edit']:
        page.locator('#mode'+mode+'Btn').evaluate('el=>el.click()');settle(page)
        assert page.evaluate("() => depthScene.getObjectByName('edit-grid').visible")== (mode=='Edit')
    print('[grid] unbounded extent, panning, signed clipping, perspective, molecular depth/occlusion and mode visibility: passed',flush=True)


def main():
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True)
        try:
            for run in [projection_pose_refresh,slab_rotation_and_picking,orbital_depth,edit_grid_continuity]:
                context=browser.new_context(viewport={'width':1200,'height':1000},device_scale_factor=1)
                page=context.new_page();errors=[];console_errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.on('console',lambda message:console_errors.append(message.text) if message.type=='error' else None)
                page.on('dialog',lambda dialog:dialog.dismiss())
                try:
                    page.goto(url+'?workspaceLab=0&appearanceStudy=1');page.wait_for_function('() => window.VibeMolSession')
                    run(page,context,url);assert not errors,errors
                except Exception:
                    p.write_failure_artifacts(page,p.ARTIFACTS,'camera-depth-'+run.__name__,errors,console_errors);raise
                finally:context.close()
        finally:browser.close()


if __name__=='__main__':main()
