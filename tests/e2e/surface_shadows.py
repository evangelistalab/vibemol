"""Rendered cross-shadows, transparent passes, split spinors, and persistence."""
import math
import premerge as p


def shadow_cube():
    # One blue isosurface between an atom that casts onto it and an atom behind it.
    n, step, origin = 33, 0.16, -2.56
    header = ['Surface shadow regression', 'Angstrom grid', '2 -2.56 -2.56 -2.56',
              f'-{n} {step} 0 0', f'-{n} 0 {step} 0', f'-{n} 0 0 {step}',
              '1 0 -1.55 0.65 1.45', '6 0 1.65 -0.3 -0.65']
    axis = [origin + i * step for i in range(n)]
    values = [math.exp(-(x*x+y*y+z*z)) for x in axis for y in axis for z in axis]
    return '\n'.join(header + [' '.join(f'{v:.7e}' for v in values)]) + '\n'


def settings(page, values):
    page.evaluate('settings => VibeMolPreset.import({kind:"vibemol.preset",presetVersion:1,settings},{mode:"strict"})', values)


def settle(page):
    page.evaluate('() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')


def capture(page, name, mute=''):
    page.evaluate('mute => window.shadowMute = mute', mute)
    settle(page)
    page.evaluate('''name => {
      const src=document.querySelector('#canvas'), dst=document.createElement('canvas');
      dst.width=src.width;dst.height=src.height;
      const ctx=dst.getContext('2d');ctx.drawImage(src,0,0);
      window.shadowImages[name]=ctx.getImageData(0,0,dst.width,dst.height).data;
    }''', name)


def darker_pixels(page, lit, shadowed, region):
    return page.evaluate('''({lit,shadowed,region}) => {
      const a=shadowImages[lit],b=shadowImages[shadowed]; let count=0;
      for(let i=0;i<a.length;i+=4){
        const surface=a[i+2]>1.25*a[i] && a[i+2]>1.05*a[i+1];
        const atom=Math.abs(a[i]-a[i+1])<8 && Math.abs(a[i+1]-a[i+2])<8 && a[i]>15 && a[i]<235;
        if ((region==='surface'?surface:atom) && a[i]+a[i+1]+a[i+2]-b[i]-b[i+1]-b[i+2]>18) count++;
      }
      return count;
    }''', {'lit':lit,'shadowed':shadowed,'region':region})


def shadow_camera_fit(page, context, url):
    # Inspect the actual shadow camera and all visible casters/receivers, including
    # objects a bad frustum might cull before their onBeforeShadow callback.
    page.evaluate('''() => {
      THREE.Mesh.prototype.onBeforeShadow=function(renderer,object,camera,shadowCamera){
        window.fitCamera=shadowCamera;window.fitRenderer=renderer;
      };
      THREE.Mesh.prototype.onBeforeRender=function(renderer,scene,camera,geometry,material){
        if(material===this.material && material.userData.vmAppearanceTarget)window.fitScene=scene;
      };
      window.readShadowFit=() => {
        const clip=new THREE.Box3(),world=new THREE.Box3(),box=new THREE.Box3();
        const view=new THREE.Matrix4().multiplyMatrices(fitCamera.projectionMatrix,fitCamera.matrixWorldInverse);
        const matrix=new THREE.Matrix4();let count=0,light;
        fitScene.traverseVisible(node=>{
          if(node.isDirectionalLight && node.castShadow)light=node;
          if(!node.isMesh || !(node.castShadow || node.receiveShadow) || node.material?.opacity<=0)return;
          if(!node.geometry.boundingBox)node.geometry.computeBoundingBox();
          matrix.multiplyMatrices(view,node.matrixWorld);
          clip.union(box.copy(node.geometry.boundingBox).applyMatrix4(matrix));
          world.union(box.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld));count++;
        });
        return {count,min:clip.min.toArray(),max:clip.max.toArray(),
          map:[light.shadow.map.width,light.shadow.map.height],limit:fitRenderer.capabilities.maxTextureSize,
          area:(fitCamera.right-fitCamera.left)*(fitCamera.top-fitCamera.bottom),
          oldArea:Math.pow(world.getSize(new THREE.Vector3()).length()*1.05,2)};
      };
    }''')
    for file in [
        {'name':'long.xyz','text':'5\nOffset, elongated structure\nC 80 0 0\nH 78.95 0.15 0\nC 104 0 0\nN 105.4 0.3 0\nO 106.65 0 0.2\n'},
        {'name':'surface.cube','text':shadow_cube()},
    ]:
        assert p.load(page,[file])['ok']
        page.evaluate('() => VibeMolAppearanceLooks.apply("classic")')
        settings(page,{'surface.iso':0.03,'surface.autoIsoEnabled':False})
        for direction in [[-3.5,5,7],[0,1,0],[0,-1,0]]:
            page.evaluate('dirPos=>VibeMolAppearanceLooks.edit("lighting",{dirPos})',direction)
            for axis in ['X','Y','Z']:
                page.locator('#viewAxis'+axis+'Btn').evaluate('el=>el.click()');settle(page)
                fit=page.evaluate('() => readShadowFit()')
                assert fit['count']>=3,fit
                assert all(v>=-1.00001 for v in fit['min']) and all(v<=1.00001 for v in fit['max']),fit
                assert fit['map']==[min(2048,fit['limit'])]*2,fit
                if file['name']=='long.xyz':assert fit['area']<fit['oldArea']*0.85,fit
    print('[looks] tighter shadow framing, device map limit, rotated/offset molecules, large surfaces and pole-aligned lights: passed',flush=True)


def surfaces_cast_and_receive(page, context, url):
    # Observe actual shadow draws. Muting a caster in this test changes only its
    # depth draw, allowing pixel comparisons with identical color geometry.
    page.evaluate('''() => {
      window.shadowImages={};window.shadowMute='';window.shadowDraws=[];
      THREE.Mesh.prototype.onBeforeShadow=function(renderer,object,camera,shadowCamera,geometry){
        const target=this.material.userData?.vmAppearanceTarget;
        window.shadowDraws.push({target,which:this.userData.which,geometry:this.geometry.uuid});
        if(window.shadowDraws.length>1000)window.shadowDraws.splice(0,500);
        if(shadowMute===target || (shadowMute==='molecule' && (target==='atoms'||target==='bonds'))){
          this.userData.shadowDrawRange={...geometry.drawRange};geometry.setDrawRange(0,0);
        }
      };
      THREE.Mesh.prototype.onAfterShadow=function(renderer,object,camera,shadowCamera,geometry){
        const range=this.userData.shadowDrawRange;
        if(range){geometry.setDrawRange(range.start,range.count);delete this.userData.shadowDrawRange;}
      };
    }''')
    assert p.load(page,[{'name':'shadows.cube','text':shadow_cube()}])['ok']
    page.evaluate('() => VibeMolAppearanceLooks.apply("classic")')
    page.evaluate('() => VibeMolAppearanceLooks.edit("lighting",{dirPos:[-1.6,0,1],dirIntensity:2.5,hemiIntensity:0.3,hemiColor:"#ffffff",hemiGroundColor:"#ffffff",ambColor:"#ffffff",ambIntensity:0.1,rimIntensity:0})')
    page.evaluate('() => VibeMolAppearanceLooks.edit("material",{emissiveIntensity:0,envMapIntensity:0})')
    settings(page,{'surface.autoIsoEnabled':False,'surface.iso':0.3,'surface.posColor':'#286ed4',
                   'surface.colorScheme':'custom','global.showAxes':False,'molecule.feature.shadows':True})
    page.locator('#viewAxisZBtn').evaluate('el=>el.click()')
    counts=[]
    for opacity in [1,0.55]:
        settings(page,{'surface.opacity':opacity})
        settle(page)
        mats=page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')
        assert mats and all(m['castShadow'] and m['receiveShadow'] for m in mats),mats
        capture(page,'both')
        page.locator('#canvas').screenshot(path=str(p.ARTIFACTS/f'surface-shadows-{opacity}.png'))
        capture(page,'no-molecule','molecule')
        capture(page,'no-surface','surfaces')
        receive=darker_pixels(page,'no-molecule','both','surface')
        cast=darker_pixels(page,'no-surface','both','atom')
        counts.append((opacity,receive,cast))
        assert receive>30 and cast>30,counts
        wboit=page.evaluate('() => VibeMolTesting.getWboitSnapshot()')
        if opacity<1: assert wboit['active'] and not wboit['fallback'],wboit
        else: assert not wboit['active'],wboit
    page.evaluate('() => window.shadowMute=""')
    ids=[m['geometryId'] for m in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')]
    page.locator('#moleculeShadowsToggle').evaluate('el=>{el.checked=false;el.dispatchEvent(new Event("change",{bubbles:true}));}')
    mats=page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')
    assert [m['geometryId'] for m in mats]==ids
    assert all(not m['castShadow'] and not m['receiveShadow'] for m in mats)
    page.evaluate('() => window.shadowDraws=[]');settle(page)
    assert not page.evaluate('() => window.shadowDraws')
    page.locator('#moleculeShadowsToggle').evaluate('el=>{el.checked=true;el.dispatchEvent(new Event("change",{bubbles:true}));}')
    assert [m['geometryId'] for m in page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')]==ids
    saved=page.evaluate('() => VibeMolSession.export()')
    settings(page,{'molecule.feature.shadows':False})
    assert page.evaluate('saved=>VibeMolSession.import(saved)',saved)['ok']
    settle(page)
    assert page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot().every(m=>m.castShadow&&m.receiveShadow)')
    settings(page,{'surface.enabled':False})
    page.evaluate('() => window.shadowDraws=[]');settle(page)
    assert not page.evaluate('() => window.shadowDraws.some(draw=>draw.target==="surfaces")')
    settings(page,{'surface.enabled':True});settle(page)
    assert page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot().some(m=>m.castShadow&&m.receiveShadow)')
    print('[looks] opaque and WBOIT surface cross-shadows (opacity, receive pixels, cast pixels): '+str(counts)+'; toggle geometry and session round-trip: passed',flush=True)


def split_surface_shadows(page, context, url):
    for fallback in [False,True]:
        if fallback:
            page.add_init_script('''{
              const original=WebGL2RenderingContext.prototype.getExtension;
              WebGL2RenderingContext.prototype.getExtension=function(name){
                return ['EXT_color_buffer_float','EXT_color_buffer_half_float'].includes(name)?null:original.call(this,name);
              };
            }''')
            page.goto(url+'?appearanceStudy=1');page.wait_for_function('() => window.VibeMolAppearanceLooks')
        page.evaluate('''() => {
          window.shadowPasses=[];let colorSeen=true;
          THREE.Mesh.prototype.onBeforeShadow=function(){
            if(colorSeen){shadowPasses.push([]);colorSeen=false;}
            const target=this.material.userData?.vmAppearanceTarget;
            shadowPasses.at(-1).push(target==='surfaces'?this.userData.which:target);
          };
          THREE.Mesh.prototype.onBeforeRender=function(renderer,scene,camera,geometry,material){
            if(material===this.material)colorSeen=true;
          };
        }''')
        field=p.cube(1).splitlines()[7]
        spinor=p.cube(-1)+'\n'.join([field,field,field])+'\n'
        assert p.load(page,[{'name':'shadows.2ccube','text':spinor}])['ok']
        page.evaluate('() => VibeMolAppearanceLooks.apply("porcelain")')
        settings(page,{'twoComponent.mode':'alphaBetaPhase','surface.autoIsoEnabled':False,
                       'surface.iso':0.04,'molecule.feature.shadows':True,'render.dof.enabled':True})
        for opacity in [1,0.55]:
            settings(page,{'surface.opacity':opacity});settle(page)
            page.evaluate('() => window.shadowPasses=[]');settle(page)
            passes=page.evaluate('() => window.shadowPasses')
            assert len(passes)>=2,passes
            assert all('atoms' in group for group in passes),passes
            assert all(('alpha' in group)!=('beta' in group) for group in passes),passes
            assert any('alpha' in group for group in passes) and any('beta' in group for group in passes),passes
            mats=page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')
            assert len(mats)==2 and all(m['castShadow'] and m['receiveShadow'] for m in mats),mats
            wboit=page.evaluate('() => VibeMolTesting.getWboitSnapshot()')
            if opacity<1: assert wboit['active']==(not fallback),wboit
        # Phase- and Bloch-colored surfaces use the same registration/material path.
        for mode in ['alphaPhase','totalBloch']:
            settings(page,{'twoComponent.mode':mode});settle(page)
            mats=page.evaluate('() => VibeMolTesting.getSurfaceMaterialSnapshot()')
            assert mats and all(m['phaseHue'] and m['castShadow'] and m['receiveShadow'] for m in mats),mats
    print('[looks] 2C phase/Bloch shadows, separate alpha/beta shadow maps, opacity, depth of field and transparency fallback: passed',flush=True)
