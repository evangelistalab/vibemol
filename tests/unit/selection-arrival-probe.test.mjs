import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../e2e/selection_arrival_probe.js', import.meta.url), 'utf8');
function harness() {
  let clock = 0, value = [], writes = 0;
  const listeners = new Map();
  const window = {addEventListener(type, callback, capture) {
    listeners.set(`${type}:${capture}`, callback);
  }};
  const state = {};
  Object.defineProperty(state, 'editAtomSelectionIndices', {configurable: true, enumerable: true,
    get() { return value; }, set(next) { writes++; value = next; }});
  window.VibeMolTesting = {getEditSelectionIndices: () => value.slice()};
  const performance = {now: () => clock, timeOrigin: 1000};
  class Observer {observe() {} takeRecords() {return [];}}
  vm.runInNewContext(source, {window, performance, PerformanceObserver: Observer,
    requestAnimationFrame: () => 1, document: {visibilityState: 'visible', hasFocus: () => true},
    setTimeout, clearTimeout});
  return {window,state,at: n => {clock=n;},writes: () => writes,
    event(type, at) {clock=at;listeners.get(`${type}:true`)({timeStamp: at,type,target:{id:'canvas'}});}};
}

test('arrival is the authoritative write, independently of a much later poll', async () => {
  const h=harness();const namespace=Object.freeze({createEditToolsController(options) {
    assert.equal(options.state,h.state);
    return {select(next) { options.state.editAtomSelectionIndices=next; options.onSelectionChanged(next,[],true); }};
  }});
  h.window.VibeMolEditTools=namespace;
  assert.deepEqual(Object.keys(h.window.VibeMolEditTools),Object.keys(namespace));
  assert.equal(Object.isFrozen(h.window.VibeMolEditTools),true);
  const controller=h.window.VibeMolEditTools.createEditToolsController({state:h.state,onSelectionChanged() {}});
  h.at(10);h.window.__selectionArrival.arm([0],{x:1,y:2});h.event('pointerup',20);
  const next=[0];h.at(23);controller.select(next);h.at(900);assert.equal(h.window.__selectionArrival.poll(true),true);
  const record=await h.window.__selectionArrival.finish(30000);
  assert.equal(h.writes(),1);assert.equal(h.state.editAtomSelectionIndices,next);
  assert.equal(record.current.arrival.lower,23);assert.equal(record.current.arrival.upper,23);
  assert.equal(record.events.find(e=>e.kind==='wait-poll').at,900);
  assert.deepEqual(JSON.parse(JSON.stringify(record.current.arrival.actual)),[0]);
  assert.deepEqual(JSON.parse(JSON.stringify(record.errors)),[]);
});

test('measurement preserves callback throws and never writes selection itself', async () => {
  const h=harness(),failure=new Error('original callback');
  h.window.VibeMolEditTools=Object.freeze({createEditToolsController(options) {
    return {select(next) { options.state.editAtomSelectionIndices=next; options.onSelectionChanged(next,[],true); }};
  }});
  const controller=h.window.VibeMolEditTools.createEditToolsController({state:h.state,onSelectionChanged() {throw failure;}});
  h.at(10);h.window.__selectionArrival.arm([0],{});assert.equal(h.writes(),0);
  h.at(15);assert.throws(()=>controller.select([0]),error=>error===failure);
  const record=await h.window.__selectionArrival.finish(30000);
  assert.equal(h.writes(),1);assert.equal(record.current.arrival.upper,15);
  assert.equal(record.events.find(e=>e.kind==='selection-callback').completed,false);
});
