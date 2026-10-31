import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {validateJob,selectTargets,stableValue,FigureError,FIGURE_DEFAULTS} from '../../api/figure-job.mjs';
import {loadGlobalModules} from './load-global-module.mjs';
import {Protocol,serveApp,waitForFigureReady} from '../../api/figure-browser.mjs';
import {runFigureJob} from '../../api/figure-runner.mjs';

const example=JSON.parse(await readFile(new URL('../../api/examples/figure.json',import.meta.url),'utf8'));
test('host defaults are an exact typed copy of the product defaults',()=>{
  const ctx=loadGlobalModules(['assets/app/js/figure-composer.js']);
  assert.deepEqual(FIGURE_DEFAULTS,JSON.parse(JSON.stringify(ctx.VibeMolFigureComposer.defaults)));
});
test('strict Figure jobs reject coercions, hidden defaults and unsupported executable input',()=>{
  assert.equal(validateJob(example).figure.fontPt,10);
  const pixels=structuredClone(example);delete pixels.figure.widthIn;pixels.figure.width=512;
  assert.equal(validateJob(validateJob(pixels)).figure.width,512);
  for (const [label,mutate] of [
    ['version',j=>j.version=2],['browser pin',j=>j.environment.browserVersion='156'],
    ['missing theme',j=>delete j.environment.theme],['viewport type',j=>j.environment.viewport.width='1280'],
    ['unknown environment',j=>j.environment.timezone='local'],['boolean type',j=>j.figure.sharedIso='true'],
    ['viewport allocation',j=>Object.assign(j.environment.viewport,{width:8192,height:8192,deviceScaleFactor:4})],
    ['explicit iso',j=>delete j.figure.iso],['negative iso',j=>j.figure.iso=-1],
    ['unknown figure key',j=>j.figure.preview=true],['callback',j=>j.figure.onPanel='x'],
    ['empty targets',j=>j.figure.targets=[]],['duplicate targets',j=>j.figure.targets=['cube-1',{id:'cube-1'}]],
    ['unknown selector',j=>j.figure.targets=[{name:'cube'}]],['truncated label',j=>j.figure.targets=[{id:'cube',label:'x'.repeat(501)}]],
    ['ambiguous size',j=>j.figure.width=512],['NaN',j=>j.figure.dpi=NaN],['unknown job key',j=>j.retry=true],
  ]) {const j=structuredClone(example);mutate(j);assert.throws(()=>validateJob(j),FigureError,label);}
});
test('target resolution preserves requested order/labels and fails with the actual available inventory',()=>{
  const a=[{id:'a',name:'First'},{id:'b',name:'Second'}];
  assert.deepEqual(selectTargets([{id:'b',label:'B'},'a'],a),[{id:'b',label:'B'},{id:'a',label:'First'}]);
  assert.deepEqual(selectTargets('all',a),[{id:'a',label:'First'},{id:'b',label:'Second'}]);
  assert.throws(()=>selectTargets(['absent'],a),e=>e.stage==='targets'&&e.detail.available===a);
  assert.throws(()=>selectTargets('all',[]),/no Figure targets/);
});
test('stability retains types, shape, target identity and frustum changes',()=>{
  assert(stableValue({near:1,position:[1,2,3]},{position:[1,2,3+1e-14],near:1}));
  for (const [a,b] of [[1,'1'],[NaN,NaN],[[1],{0:1}],[{near:1},{near:1,far:2}],[{near:1},{near:1.1}],[{id:'a'},{id:'b'}]]) assert(!stableValue(a,b),JSON.stringify({a,b}));
});
test('presented readiness resets when late import/frustum/target updates arrive',async()=>{
  let frame=0,fontsResolved=false;
  const context=vm.createContext({
    window:{VibeMolSession:{},VibeMolFigure:{},VibeMolPrefs:{}},
    document:{fonts:{ready:Promise.resolve().then(()=>{fontsResolved=true;})},getAnimations:()=>[]},
    VibeMolFigure:{viewport:()=>({near:frame<2?.1:42,far:frame<2?1e6:50}),listTargets:()=>frame<3?[]:[{id:'cube-1'}]},
    performance:{now:()=>frame*16},requestAnimationFrame:cb=>{assert(fontsResolved);frame++;queueMicrotask(()=>cb(frame*16));},
  });
  const ready=await vm.runInContext(`(${waitForFigureReady.toString()})(${JSON.stringify(stableValue.toString())},1000)`,context);
  assert.equal(frame,5);assert.equal(ready.stableFrames,2);assert.equal(ready.viewport.near,42);
  assert(ready.samples.some(s=>s.stableFrames===0));assert.equal(ready.targets[0].id,'cube-1');
});
test('unstable readiness fails with comparands, never returns an optimistic state',async()=>{
  let frame=0;
  const context=vm.createContext({window:{VibeMolSession:{},VibeMolFigure:{},VibeMolPrefs:{}},document:{fonts:{ready:Promise.resolve()},getAnimations:()=>[]},
    VibeMolFigure:{viewport:()=>({near:frame}),listTargets:()=>[]},performance:{now:()=>frame*16},requestAnimationFrame:cb=>{frame++;queueMicrotask(cb);}});
  await assert.rejects(vm.runInContext(`(${waitForFigureReady.toString()})(${JSON.stringify(stableValue.toString())},50)`,context),/readiness deadline.*samples.*near/);
});
class Socket extends EventTarget {
  readyState=1;sent=[];
  send(text) {this.sent.push(JSON.parse(text));}
  close() {this.readyState=3;this.dispatchEvent(new Event('close'));}
  receive(data) {const e=new Event('message');e.data=JSON.stringify(data);this.dispatchEvent(e);}
}
test('protocol disconnect/abort rejects requests and navigation waiters without hanging',async()=>{
  for (const mode of ['disconnect','abort']) {
    const socket=new Socket(),controller=new AbortController(),p=new Protocol(socket,controller.signal);
    const call=p.send('Page.navigate'),event=p.waitForEvent('Page.lifecycleEvent',()=>true);
    const rejected=[assert.rejects(call),assert.rejects(event)];
    if(mode==='disconnect')socket.close();else controller.abort(new Error('cancelled'));
    await Promise.all(rejected);assert.equal(p.pending.size,0);assert.equal(p.waiters.size,0);p.dispose();
  }
});
test('navigation readiness recognizes the exact loader, including already delivered events',async()=>{
  const socket=new Socket(),p=new Protocol(socket,new AbortController().signal);
  socket.receive({method:'Page.lifecycleEvent',params:{loaderId:'old',name:'DOMContentLoaded'}});
  const event=p.waitForEvent('Page.lifecycleEvent',e=>e.loaderId==='new'&&e.name==='DOMContentLoaded');
  socket.receive({method:'Page.lifecycleEvent',params:{loaderId:'new',name:'DOMContentLoaded'}});
  assert.equal((await event).loaderId,'new');
  assert.equal((await p.waitForEvent('Page.lifecycleEvent',e=>e.loaderId==='new')).loaderId,'new');p.dispose();
});
test('teardown waits for Browser.close acknowledgement even after cancellation',async()=>{
  const socket=new Socket(),c=new AbortController(),p=new Protocol(socket,c.signal);c.abort();
  const closing=p.closeBrowser(),request=socket.sent.at(-1);
  assert.equal(request.method,'Browser.close');assert.equal(socket.readyState,1);
  socket.receive({id:request.id,result:{}});await closing;p.dispose();
});
test('local server exposes only app assets and the supplied session, never arbitrary files',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'vm-figure-server-test-'));
  await mkdir(path.join(root,'assets'));await writeFile(path.join(root,'index.html'),'app');await writeFile(path.join(root,'private.txt'),'secret');
  const server=await serveApp(root,'session');
  try {
    assert.equal(await(await fetch(server.origin+'/')).text(),'app');
    assert.equal(await(await fetch(server.origin+'/__figure_session')).text(),'session');
    assert.equal((await fetch(server.origin+'/private.txt')).status,404);
    assert.equal((await fetch(server.origin+'/.git/config')).status,404);
    await writeFile(path.join(root,'index.html'),'changed');assert.equal((await fetch(server.origin+'/')).status,404);
    assert(server.errors.some(e=>e.error.includes('changed during')));
  } finally {await server.close();await rm(root,{recursive:true,force:true});}
});
test('pre-cancelled jobs stop before browser/output setup',async()=>{
  const c=new AbortController();c.abort(new FigureError('cancelled','cancelled'));
  await assert.rejects(runFigureJob('/absent',{browser:'/absent',signal:c.signal}),e=>e.stage==='cancelled');
});
