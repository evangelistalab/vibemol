import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source=fs.readFileSync(new URL('../e2e/assertion_runtime.js',import.meta.url),'utf8');
const stallSource=fs.readFileSync(new URL('../e2e/stall_diagnostics.js',import.meta.url),'utf8');
function fixture(mode='native',initial=[],unsupported=false,tasks=[]) {
  let clock=0,value=initial,mutation;
  const listeners=new Map(),timers=[];
  const window={addEventListener:(t,fn,c)=>listeners.set(`${t}:${c}`,fn),removeEventListener:(t,fn,c)=>listeners.delete(`${t}:${c}`)};
  class Observer {constructor(fn) {mutation=fn;} observe() {} disconnect() {}}
  class TaskObserver {static supportedEntryTypes=['longtask'];observe() {} disconnect() {} takeRecords() {return tasks.splice(0);}}
  const context={window,document:{documentElement:{}},performance:{now:()=>clock},MutationObserver:Observer,
    PerformanceObserver:unsupported?undefined:TaskObserver,
    setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},requestAnimationFrame:()=>{throw new Error('No polling-frame dependency');}};
  const factory=vm.runInNewContext(source,context),stallFactory=vm.runInNewContext(stallSource,context);
  const config={mode,label:'control',expected:[0],budgetMs:600,event:mode==='native'?'pointerup':'keydown',selector:mode==='native'?'#canvas':null,key:mode==='native'?null:'v',requireTransition:mode!=='native'};
  const receipt=factory(config,()=>value,stallFactory);
  return {receipt,at:n=>{clock=n;},set:v=>{value=v;},mutation:()=>mutation(),deadline:()=>timers[0](),
    event(phase,stamp) {listeners.get(`${config.event}:${phase}`)({timeStamp:stamp,key:'v',ctrlKey:true,isTrusted:true,target:{id:'canvas',closest:()=>true}});}};
}
test('native receipt reads completed input without waiting for a frame',()=>{
  const f=fixture();f.at(100);f.event(true,50);f.set([0]);f.at(102);f.event(false,50);f.at(900);
  const r=f.receipt.inspect();assert.equal(r.passed,true);assert.equal(r.elapsedMs,52);assert.equal(r.observedAt,102);
});
test('correct but late native value still fails the unchanged budget',()=>{
  const f=fixture();f.at(700);f.event(true,0);f.set([0]);f.event(false,0);
  assert.equal(f.receipt.inspect().passed,false);
});
test('observed long tasks do not extend or discount the original input budget',()=>{
  const f=fixture('native',[],false,[{startTime:0,duration:700,name:'self',entryType:'longtask'}]);
  f.at(700);f.event(true,0);f.set([0]);f.event(false,0);
  const r=f.receipt.inspect();assert.equal(r.stalls.longTaskOverlapMs,600);assert.equal(r.passed,false);
});
test('an already correct value without native input cannot pass',()=>{
  const f=fixture('native',[0]);assert.equal(f.receipt.inspect().passed,false);
});
test('a later correct value cannot repair a wrong completed-event receipt',()=>{
  const f=fixture();f.at(100);f.event(true,50);f.event(false,50);f.set([0]);f.at(900);
  const r=f.receipt.inspect();assert.equal(r.passed,false);assert.deepEqual(Array.from(r.actual),[]);
  assert.deepEqual(Array.from(r.current),[0]);
});
test('unavailable stall observations cannot change native assertion acceptance',()=>{
  const f=fixture('native',[],true);f.at(100);f.event(true,50);f.set([0]);f.event(false,50);
  const r=f.receipt.inspect();assert.equal(r.passed,true);assert.match(r.stalls.observerError,/unavailable/);
  assert.equal(r.stalls.hadLongTaskOverlap,null);
});
test('DOM-backed asynchronous value arrives without a polling frame',async()=>{
  const f=fixture('event-dom');f.at(100);f.event(true,90);f.event(false,90);f.at(200);f.set([0]);f.mutation();
  const r=await f.receipt.inspect();assert.equal(r.passed,true);assert.equal(r.elapsedMs,110);
});
test('a delayed DOM callback cannot accept a late correct value',async()=>{
  const f=fixture('event-dom');f.at(10);f.event(true,0);f.at(700);f.set([0]);f.mutation();
  assert.equal((await f.receipt.inspect()).passed,false);
});
test('missing asynchronous value fails with its actual comparand',async()=>{
  const f=fixture('event-dom');f.at(10);f.event(true,0);f.at(600);f.deadline();
  const r=await f.receipt.inspect();assert.equal(r.passed,false);assert.deepEqual(Array.from(r.actual),[]);
});
test('a Promise-valued reader cannot masquerade as a satisfied state',()=>{
  const f=fixture('native',Promise.resolve(false));f.at(10);f.event(true,0);f.event(false,0);
  const r=f.receipt.inspect();assert.equal(r.passed,false);assert.match(r.error,/synchronous value/);
});
