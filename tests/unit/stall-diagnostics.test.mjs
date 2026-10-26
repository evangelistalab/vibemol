import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source=fs.readFileSync(new URL('../e2e/stall_diagnostics.js',import.meta.url),'utf8');
function fixture(entries=[],{unsupported=false,readError=false}={}) {
  let clock=0,buffer=entries.slice(),disconnected=false;
  class Observer {
    static supportedEntryTypes=unsupported?[]:['longtask'];
    observe(options) {assert.deepEqual(JSON.parse(JSON.stringify(options)),{type:'longtask',buffered:true});}
    takeRecords() {if(readError)throw new Error('Read failed');const result=buffer;buffer=[];return result;}
    disconnect() {disconnected=true;}
  }
  const factory=vm.runInNewContext(source,{PerformanceObserver:Observer,performance:{now:()=>clock},setTimeout:()=>1,clearTimeout:()=>{}});
  const observer=factory();return {observer,at:value=>{clock=value;},disconnected:()=>disconnected};
}
const task=(startTime,duration)=>({startTime,duration,name:'self',entryType:'longtask'});
test('long-task attribution clips to the full wait and unions overlap; nominal wall deadline remains diagnostic',()=>{
  const f=fixture([task(80,40),task(110,70),task(160,90)]);f.at(260);
  const row=f.observer.finish({startedAtMs:100,timeoutMs:100,completedAtMs:250,
    deadlineSample:{observedAtMs:250,scheduledAtMs:200,latenessMs:50}});
  assert.equal(row.longTaskOverlapMs,150);assert.equal(row.hadLongTaskOverlap,true);
  assert.equal(row.longTasksOverlappingWait.length,3);assert.equal(row.longTasksCrossingDeadline.length,1);
  assert.equal(row.deadlineSample.latenessMs,50);assert.equal(row.readbackAfterDeadlineMs,60);
  assert.equal(f.disconnected(),true);
});
test('a delayed host readback cannot extend an already completed input window',()=>{
  const f=fixture([task(120,100)]);f.at(1000);
  const row=f.observer.finish({startedAtMs:100,timeoutMs:600,completedAtMs:150});
  assert.equal(row.longTaskOverlapMs,30);assert.equal(row.observedWaitEndAtMs,150);
  assert.equal(row.deadlineSample,null);assert.equal(row.readbackAfterDeadlineMs,300);
});
test('missing native input reports a missing wait rather than zero stall time',()=>{
  const f=fixture([task(20,70)]);f.at(100);
  const row=f.observer.finish({timeoutMs:600});
  assert.equal(row.wait,null);assert.equal(row.longTaskOverlapMs,null);assert.equal(row.hadLongTaskOverlap,null);
});
test('unsupported long-task observations are explicitly unknown',()=>{
  const f=fixture([],{unsupported:true});f.at(100);
  const row=f.observer.finish({startedAtMs:10,timeoutMs:100,completedAtMs:90});
  assert.match(row.observerError,/unavailable/);assert.equal(row.hadLongTaskOverlap,null);
});
test('dropped observations do not imply absence of a stall',()=>{
  const f=fixture(Array.from({length:4097},()=>task(1,1)));f.at(300);
  const row=f.observer.finish({startedAtMs:100,timeoutMs:100,completedAtMs:180});
  assert.equal(row.longTasks.length,4096);assert.equal(row.droppedLongTasks,1);
  assert.equal(row.hadLongTaskOverlap,null);
});
test('observer read failure is recorded without throwing into the assertion',()=>{
  const f=fixture([],{readError:true});f.at(100);
  const row=f.observer.finish({startedAtMs:10,timeoutMs:100,completedAtMs:90});
  assert.match(row.observerError,/Read failed/);assert.equal(row.hadLongTaskOverlap,null);
});
