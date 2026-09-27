import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';
const {THREE:T,VibeMolFigureRenderer:F}=loadGlobalModules(['assets/vendor/js/three.min.js','assets/app/js/figure-renderer.js']);
function setup(orthographic=false){
  const camera=orthographic?new T.OrthographicCamera(-5,5,4,-4,.1,100):new T.PerspectiveCamera(45,1.25,.1,100);
  camera.position.set(9,7,6);camera.lookAt(0,0,0);camera.zoom=1.3;camera.updateProjectionMatrix();
  const scene=new T.Scene(),controls={target:new T.Vector3(),enabled:true,autoRotate:true};
  let active=null,pixels=0,restored=false,resumed=false,size=new T.Vector2(1000,800);
  const renderer={getContext:()=>({MAX_RENDERBUFFER_SIZE:1,MAX_TEXTURE_SIZE:2,getParameter:()=>16384}),getSize:v=>v.copy(size),getPixelRatio:()=>1,
    getViewport:v=>v.set(0,0,1000,800),getScissor:v=>v.set(0,0,1000,800),getScissorTest:()=>false,getClearColor:v=>v.set('#ffffff'),getClearAlpha:()=>1,
    setSize:(w,h)=>size.set(w,h),setClearColor:()=>{},setRenderTarget:()=>{},setViewport:()=>{},setScissor:()=>{},setScissorTest:()=>{}};
  const targets=[{min:[-2,-2,-2],max:[2,2,2]},{min:[18,-8,-6],max:[27,6,10]}];
  const bounds=()=>new T.Box3(new T.Vector3(...active.min),new T.Vector3(...active.max));
  const material=new T.ShaderMaterial({uniforms:{uSize:{value:2}}});scene.add(new T.Mesh(new T.SphereGeometry(),material));
  const adapter=F.create({THREE:T,renderer,scene,controls,camera:()=>camera,viewportHeight:()=>800,pause:()=>({value:42}),
    activate:t=>{active=t;},rebuild:()=>{camera.position.set(999,999,999);},bounds,
    renderPixels:(n,scale)=>{pixels=n;assert.equal(material.uniforms.uSize.value,2*scale);return {};},
    restoreApp:s=>{assert.equal(s.value,42);restored=true;},dispose:()=>{},resume:()=>{resumed=true;}});
  return {adapter,camera,controls,targets,material,state:()=>({pixels,size:Array.from(size.toArray()),restored,resumed})};
}
for(const ortho of [false,true])test(`${ortho?'orthographic':'perspective'} union fit pins orientation, framing and restores renderer`,async()=>{
  const {adapter,camera,controls,targets,material,state}=setup(ortho),before=adapter.cameraSnapshot(),saved=adapter.captureState({});
  await adapter.prepare(targets,{camera:'fit'},null,()=>{});
  adapter.capture(1600,{background:'white'});const first=adapter.cameraSnapshot();
  assert.equal(JSON.stringify(first.quaternion),JSON.stringify(before.quaternion));
  for(const target of targets)for(const x of [target.min[0],target.max[0]])for(const y of [target.min[1],target.max[1]])for(const z of [target.min[2],target.max[2]]){
    const p=new T.Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1&&Math.abs(p.z)<1,JSON.stringify(p));
  }
  camera.position.set(-900,0,0);adapter.capture(1600,{background:'white'});assert.deepEqual(adapter.cameraSnapshot(),first);
  assert.equal(material.uniforms.uSize.value,2);adapter.restore(saved);
  assert.deepEqual(adapter.cameraSnapshot(),before);assert.deepEqual(state(),{pixels:1600,size:[1000,800],restored:true,resumed:true});assert.ok(controls.autoRotate);
});
test('current view preserves camera position, quaternion and zoom before every panel',async()=>{
  const {adapter,camera,targets}=setup(),before=adapter.cameraSnapshot(),saved=adapter.captureState({});
  await adapter.prepare(targets,{camera:'current'},null,()=>{});adapter.capture(300,{background:'transparent'});
  const after=adapter.cameraSnapshot();for(const key of ['position','quaternion','zoom','target'])assert.deepEqual(after[key],before[key]);
  assert.equal(camera.aspect,1);assert.equal(adapter.limits().panel,8192);adapter.restore(saved);
});
