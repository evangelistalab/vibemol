import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../e2e/stall_diagnostics.js',import.meta.url),'utf8');
function rig({supported=true}={}) {
  let time=0,serial=0,observer;
  const timers=new Map();
  class Observer {
    static supportedEntryTypes=supported?['longtask']:[];
    constructor(callback){this.callback=callback;this.records=[];observer=this;}
    observe(){} disconnect(){} takeRecords(){return this.records.splice(0);}
  }
  const owner=vm.runInNewContext(source)({now:()=>time,PerformanceObserver:Observer,
    setTimeout:(fn,delay)=>{const id=++serial;timers.set(id,{fn,at:time+delay});return id;},
    clearTimeout:id=>timers.delete(id)});
  return {owner,at:()=>time,
    block(ms){time+=ms;},
    responsive(ms){const until=time+ms;
      while(true){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];
        if(!next||next[1].at>until)break;
        time=Math.max(time,next[1].at);timers.delete(next[0]);next[1].fn();
      }time=until;
    },
    task(startTime,duration){observer.records.push({startTime,duration,name:'self',entryType:'longtask'});},
    flood(){for(let i=0;i<4097;i++)this.task(0,1);}
  };
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('responsive work consumes the unchanged budget; exact boundary passes',()=>{
  const r=rig(),b=r.owner.budget(0,600,180000);r.responsive(600);
  const edge=b.sample();near(edge.discountedMs,0);assert.equal(edge.withinBudget,true);
  r.responsive(1);assert.equal(b.step(true).passed,false);
  assert.equal(b.result.timing.failure,'responsive budget');
});
test('pending heartbeat gap is counted before the delayed heartbeat runs',()=>{
  const r=rig(),b=r.owner.budget(0,600,180000);r.block(900);
  const a=b.sample();near(a.heartbeatGapOverlapMs,850);near(a.responsiveElapsedMs,50);
  assert.equal(a.heartbeatGaps[0].provisional,true);assert.equal(b.step(true).passed,true);
});
test('long task plus heartbeat gap uses one union, not their sum',()=>{
  const r=rig(),b=r.owner.budget(0,600,180000);r.block(1000);r.task(20,900);
  const a=b.sample();near(a.longTaskOverlapMs,900);near(a.heartbeatGapOverlapMs,950);
  near(a.discountedMs,980);near(a.responsiveElapsedMs,20);
});
test('PR72 shape: heartbeat sees the six seconds absent from longtask entries',()=>{
  const r=rig(),b=r.owner.budget(0,30000,180000);r.block(24680.9);r.task(6180.9,18500);
  const a=b.sample();near(a.longTaskOverlapMs,18500);near(a.discountedMs,24630.9);
  near(a.discountedMs-a.longTaskOverlapMs,6130.9);near(a.responsiveElapsedMs,50);
});
test('prelude-only stalls never consume or inflate a wait budget',()=>{
  const r=rig();r.block(1000);r.task(0,1000);
  const b=r.owner.budget(1000,100,180000);r.responsive(80);
  const a=b.sample();near(a.longTaskOverlapMs,0);near(a.discountedMs,0);near(a.responsiveElapsedMs,80);
});
test('no longtask support still discounts only the heartbeat evidence',()=>{
  const r=rig({supported:false}),b=r.owner.budget(0,100,180000);r.block(900);
  const a=b.sample();assert.ok(a.observerError);near(a.longTaskOverlapMs,0);
  near(a.discountedMs,850);assert.equal(a.withinBudget,true);
});
test('missing records conservatively charge wall time instead of granting time',()=>{
  const r=rig(),b=r.owner.budget(0,100,180000);r.block(900);r.flood();
  const a=b.sample();assert.equal(a.droppedLongTasks,1);near(a.discountedMs,0);
  near(a.responsiveElapsedMs,900);assert.equal(a.withinBudget,false);assert.ok(a.fallback);
});
test('independent hard wall rejects a correct value even after a full stall',()=>{
  const r=rig(),b=r.owner.budget(0,30000,180000);r.block(180001);r.task(0,180001);
  const a=b.step(true);near(a.timing.responsiveElapsedMs,0);
  assert.equal(a.passed,false);assert.equal(a.timing.failure,'hard wall ceiling');
});
test('never arriving while responsive expires and cannot be repaired later',()=>{
  const r=rig(),b=r.owner.budget(0,100,180000);r.responsive(101);
  const a=b.step(false);assert.equal(a.done,true);assert.equal(a.passed,false);
  r.responsive(20);assert.equal(b.step(true),a);
});
test('a stall does not make a false predicate pass',()=>{
  const r=rig(),b=r.owner.budget(0,100,180000);r.block(10000);r.task(0,10000);
  assert.equal(b.step(false).done,false);r.responsive(101);
  assert.equal(b.step(false).passed,false);assert.equal(b.result.done,true);
});
test('completed-time accounting excludes later host/readback delay',()=>{
  const r=rig(),b=r.owner.budget(0,600,180000);r.responsive(100);r.block(2000);
  const a=b.sample(100);near(a.wallElapsedMs,100);near(a.discountedMs,0);
});
test('settled heartbeat and pending heartbeat produce the same clipped union',()=>{
  const r=rig(),b=r.owner.budget(0,600,180000);r.block(900);r.task(40,860);
  const pending=b.sample();r.responsive(0);const delivered=b.sample();
  near(pending.discountedMs,delivered.discountedMs);near(delivered.discountedMs,860);
});
test('async predicates and invalid windows are rejected',()=>{
  const r=rig();assert.throws(()=>r.owner.budget(-1,100,180000),/Invalid/);
  assert.throws(()=>r.owner.budget(0,100,50),/Invalid/);
  const b=r.owner.budget(0,100,180000);assert.throws(()=>b.step(Promise.resolve(false)),/synchronous/);
});
