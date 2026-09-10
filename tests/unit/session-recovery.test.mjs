import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';

function setup(initial = {}) {
  const ctx = loadGlobalModule('assets/app/js/session-recovery.js');
  const snapshots = {...initial};
  const messages = [];
  const recovered = [];
  const store = { read: async()=>({...snapshots}), write: async(next, expected) => {
    if ((snapshots.latest?.id || null) !== expected) throw new Error('Another tab wrote a snapshot');
    snapshots.previous = snapshots.latest; snapshots.latest = next;
  }};
  const deps = {store, debounceMs:100000, maxDelayMs:100000, hasWork:()=>true, exportText:async()=>'{"session":"saved"}',
    importText:async text => { if(text==='broken') throw new Error('damaged snapshot'); recovered.push(text); },
    onStatus:state=>messages.push(state), onRecovery:()=>{}};
  const controller = ctx.VibeMolSessionRecovery.createRecoveryController(deps);
  return {controller, deps, snapshots, messages, recovered};
}

test('recovery waits for a decision and never overwrites a snapshot with an empty startup', async () => {
  const {controller, deps, snapshots, recovered} = setup({latest:{id:'old',text:'old data'}});
  await controller.initialize();
  controller.markDirty();
  assert.equal(await controller.flush(), false);
  assert.equal(snapshots.latest.id, 'old');
  assert.equal(await controller.recover(), true);
  assert.deepEqual(recovered, ['old data']);
  deps.hasWork = () => false;
  controller.markDirty();
  assert.equal(await controller.flush({force:true}), false);
  assert.equal(snapshots.latest.id, 'old');
  controller.stop();
});

test('quota failure preserves last good data and requires an explicit retry', async () => {
  const {controller, deps, snapshots, messages} = setup({latest:{id:'old',text:'old data'}});
  await controller.initialize(); controller.startFresh(); controller.markDirty();
  const write = deps.store.write;
  deps.store.write = async()=> { const error = new Error('quota'); error.name='QuotaExceededError'; throw error; };
  assert.equal(await controller.flush(), false);
  assert.equal(snapshots.latest.id, 'old');
  assert.equal(messages.at(-1).state, 'error');
  assert.match(messages.at(-1).message, /storage is full/);
  deps.store.write = write;
  assert.equal(await controller.flush(), false);
  assert.equal(await controller.flush({force:true}), true);
  assert.equal(snapshots.previous.id, 'old');
  controller.stop();
});

test('recovery falls back to the preceding snapshot after corruption', async () => {
  const {controller, recovered, messages} = setup({latest:{id:'new',text:'broken'},previous:{id:'old',text:'valid'}});
  await controller.initialize();
  assert.equal(await controller.recover(), true);
  assert.deepEqual(recovered, ['valid']);
  assert.match(messages.at(-1).message, /newest snapshot was damaged/);
  controller.stop();
});

test('changes during an asynchronous save stay dirty and overlapping saves share one writer', async () => {
  const {controller, deps, snapshots} = setup();
  await controller.initialize(); controller.markDirty();
  let finish;
  deps.exportText = () => new Promise(resolve => {finish=resolve;});
  const first = controller.flush();
  const second = controller.flush();
  controller.markDirty();
  finish('first');
  assert.equal(await first, true); assert.equal(await second, true);
  assert.equal(snapshots.latest.text, 'first');
  assert.ok(controller.getState().revision > controller.getState().savedRevision);
  deps.exportText = async()=> 'second';
  assert.equal(await controller.flush(), true);
  assert.equal(snapshots.previous.text, 'first');
  controller.stop();
});

test('size limits and another tab changing recovery both leave completed snapshots intact', async () => {
  const {controller, deps, snapshots} = setup({latest:{id:'old',text:'valid'}});
  await controller.initialize(); controller.startFresh(); controller.markDirty();
  deps.exportText = async () => { throw new Error('numeric data exceeds recovery limit'); };
  assert.equal(await controller.flush(), false);
  assert.equal(snapshots.latest.id, 'old');
  snapshots.latest = {id:'other-tab',text:'keep me'};
  deps.exportText = async()=> 'this tab';
  assert.equal(await controller.flush({force:true}), false);
  assert.equal(snapshots.latest.text, 'keep me');
  controller.stop();
});

test('starting a new workspace resumes autosave after the preceding workspace exceeded its limit', async () => {
  const {controller, deps, snapshots} = setup();
  await controller.initialize(); controller.markDirty();
  deps.exportText = async () => { throw new Error('numeric data exceeds recovery limit'); };
  assert.equal(await controller.flush(), false);
  assert.equal(controller.getState().failed, true);
  deps.exportText = async () => 'smaller workspace';
  controller.startFresh(); controller.markDirty();
  assert.equal(controller.getState().failed, false);
  assert.equal(await controller.flush(), true);
  assert.equal(snapshots.latest.text, 'smaller workspace');
  controller.stop();
});
