import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {loadGlobalModules} from './load-global-module.mjs';

// Load the real private factory without adding a product/test global API.
const app=fs.readFileSync(new URL('../../assets/app/js/app.js',import.meta.url),'utf8');
const body=app.split('// Private scientific-buffer owner: begin.')[1]?.split('// Private scientific-buffer owner: end.')[0];
assert.ok(body,'Private factory boundary missing');
const create=vm.runInNewContext(`(()=>{${body};return createScientificBufferOwner})()`,
  {console,structuredClone,Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array,ArrayBuffer,DataView});
const fixture=()=>({data:new Float32Array([1,2]),alphaRe:new Float32Array([3,4]),atoms:[{Z:6,x:1,y:2,z:3}],
 trajectory:{frames:[new Float32Array([1,2,3])]},vibration:{equilibrium:new Float32Array([1,2,3]),frameBuffer:new Float32Array(3),modes:[{displacements:new Float32Array([.5,0,0])}]},
 kind:'molden',molden:{basis:{atomBlocks:[{atomIndex:0,shells:[{primitives:[{coefficients:[.7]}]}]}]},mos:[{coefficients:new Float32Array([.7])}]}});

test('scientific owner copies ingress, egress and every callback exposure',()=>{
 const attempts=[],owner=create(m=>attempts.push(m)),input=new Float32Array([1,2,3]),source=owner.adopt(input);
 input[0]=9;assert.deepEqual(Array.from(source),[1,2,3]);
 for(const copy of [source.slice(),source.subarray(),new Float32Array(source.buffer),source.map(v=>v)]) {copy[0]=8;assert.equal(source[0],1);}
 assert.equal(source.valueOf(),source);
 for(const action of [a=>{a[0]=4},a=>a.set([4]),a=>a.fill(4),a=>{Object.defineProperty(a,'0',{value:4})},
   a=>{delete a[0]},a=>Object.setPrototypeOf(a,{}),a=>a.forEach((v,i,x)=>{x[i]=4}),a=>a.reduce((acc,v,i,x)=>{x[i]=4},0)]) assert.throws(()=>action(source),/scientific-buffer-write/);
 assert.equal(attempts.length,8);assert.deepEqual(Array.from(source),[1,2,3]);
 assert.equal(ArrayBuffer.isView(source),false);assert.ok(source instanceof Float32Array);
 assert.equal(ArrayBuffer.isView(owner.copy(source)),true);
});

test('sealed drafts detach every writable view and can only be sealed once',()=>{
 const owner=create(()=>{}),input=new Float32Array([1,2]),draft=owner.beginDraft(input),alias=draft.view.subarray();
 draft.view[0]=7;const sealed=owner.sealDraft(draft);
 assert.equal(draft.view.byteLength,0);assert.equal(alias.byteLength,0);alias[0]=9;
 assert.deepEqual(Array.from(sealed),[7,2]);assert.deepEqual(Array.from(input),[1,2]);
 assert.throws(()=>owner.sealDraft(draft),/already sealed/);assert.throws(()=>owner.sealDraft({view:input}),/Unknown/);
 const foreign=create(()=>{});assert.throws(()=>foreign.sealDraft(owner.beginDraft(input)),/Unknown/);
 const detached=owner.beginDraft(input);structuredClone(detached.view.buffer,{transfer:[detached.view.buffer]});
 assert.throws(()=>owner.sealDraft(detached),/detached outside/);
});

test('shared buffers and hostile copy overrides cannot enter private storage',()=>{
 const owner=create(()=>{}),shared=new SharedArrayBuffer(16);
 for(const value of [shared,new Float32Array(shared)]) assert.throws(()=>owner.adopt(value),/Shared/);
 const input=new Float32Array([1,2]);input.slice=()=>input;
 const source=owner.adopt(input);assert.equal(input.byteLength,8);input[0]=9;assert.equal(source[0],1);
 const invalid=fixture();invalid.betaRe=new Float32Array(shared);
 assert.throws(()=>owner.publishVolume(invalid),/Shared/);assert.equal(Object.getOwnPropertyDescriptor(invalid,'data').configurable,true);
});

test('volume source banks preserve intentional aliases, permit version replacement and isolate derived scratch',()=>{
 const owner=create(()=>{}),volume=fixture(),raw=volume.alphaRe;volume.data=raw;
 owner.publishVolume(volume);assert.equal(volume.data,volume.alphaRe);raw[0]=9;assert.equal(volume.data[0],3);
 const old=volume.trajectory.frames[0];volume.trajectory.frames=volume.trajectory.frames.map(()=>new Float32Array([9,8,7]));
 assert.deepEqual(Array.from(old),[1,2,3]);assert.equal(volume.trajectory.frames[0][0],9);
 assert.throws(()=>{volume.trajectory.frames[0]=old},/scientific-buffer-write/);
 // The actual app is non-strict: this must still throw instead of silently
 // discarding a future unadopted replacement.
 assert.throws(()=>Function('bank','bank[0]=null')(volume.trajectory.frames),/scientific-buffer-write/);
 volume.vibration.frameBuffer[0]=8;assert.equal(volume.vibration.equilibrium[0],1);
 const basis=volume.molden.basis.atomBlocks[0];basis.atomIndex=4;assert.equal(basis.atomIndex,4);
 assert.throws(()=>{basis.shells[0].primitives[0].coefficients[0]=8});
 assert.throws(()=>{volume.molden.mos[0].coefficients[0]=8});
 volume.vibration=undefined;assert.equal(volume.vibration,undefined);
 assert.equal(owner.publishVolume(volume),volume);
});

test('bulk readers get independent native arrays and preserve aliases only within their own read',()=>{
 const owner=create(()=>{}),raw=new Float32Array([1,2]),volume=owner.publishVolume({data:raw,alphaRe:raw});
 assert.equal(owner.readVolume(null),null);assert.equal(owner.readVolume(undefined),undefined);
 const first=owner.readVolume(volume),second=owner.readVolume(volume);
 assert.ok(ArrayBuffer.isView(first.data));assert.equal(first.data,first.alphaRe);
 assert.notEqual(first.data,second.data);first.data[0]=9;
 assert.equal(second.data[0],1);assert.equal(owner.readVolume(volume).data[0],1);assert.equal(volume.data[0],1);
 assert.throws(()=>{volume.data=new Float32Array(new SharedArrayBuffer(8))},/Shared/);assert.equal(volume.data[0],1);
});

test('retained-session-capture owns source bytes, containers and basis metadata independently of encode timing',async()=>{
 const ctx=loadGlobalModules(['assets/app/js/structure.js','assets/app/js/session-format.js','assets/app/js/session.js']);
 const owner=create(()=>{}),volume=owner.publishVolume(fixture()),record={name:'retained',vol:volume,_sceneGraphSceneKey:'scene'};
 const scene={id:'scene',name:'retained',sceneKey:'scene',moleculeRecord:record,layers:[{id:'molecule',kind:'molecule',record}]};
 const graph={getScenes:()=>[scene],getState:()=>({focusedSceneId:'scene',activeSceneId:'scene',activeLayerId:'molecule',selectedLayerIds:['molecule'],syncMaster:{}}),isCubeLikeLayer:()=>false};
 const snapshot=ctx.VibeMolSessionModule.capture({graph,sources:{register:()=>({id:'source'})},records:[record],activeRecord:record,preset:{},view:{},appVersion:'test'});
 const capture=snapshot.sources[0].volume;
 const oldFrame=capture.trajectory.frames[0],oldBasis=capture.molden.basis.atomBlocks[0].atomIndex;
 await Promise.resolve();
 volume.trajectory.frames=[new Float32Array([9,8,7])];volume.atoms[0].x=8;volume.molden.basis.atomBlocks[0].atomIndex=4;
 assert.deepEqual(Array.from(oldFrame),[1,2,3]);assert.equal(capture.atoms[0].x,1);assert.equal(capture.molden.basis.atomBlocks[0].atomIndex,oldBasis);
 capture.vibration.equilibrium[0]=7;capture.vibration.modes[0].displacements[0]=9;capture.molden.mos[0].coefficients[0]=9;
 assert.equal(volume.vibration.equilibrium[0],1);assert.equal(volume.vibration.modes[0].displacements[0],.5);
 assert.equal(volume.molden.mos[0].coefficients[0],Math.fround(.7));
});
