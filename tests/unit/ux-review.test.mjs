import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGlobalModules} from './load-global-module.mjs';
const {VibeMolEditUi:U,VibeMolUI:Text}=loadGlobalModules(['assets/app/js/edit-ui.js','assets/app/js/ui.js']);
function chip() {
  const attrs=new Map(),classes=new Set();
  return {attrs,classes,setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),
    classList:{toggle:(k,v)=>v?classes.add(k):classes.delete(k)}};
}
test('one shared cue state keeps checkbox semantics through mixed/full/empty transitions',()=>{
  const b=chip();U.setCueState(b,true);
  for(const state of ['mixed','true','false','mixed']) {
    U.setCueState(b,state,{checkbox:true,allowMixed:true});
    assert.equal(b.attrs.get('role'),'checkbox');assert.equal(b.attrs.get('aria-checked'),state);
    assert.equal(b.attrs.has('aria-pressed'),false);assert.equal(b.classes.has('is-active'),state==='true');
  }
  U.setCueState(b,'mixed',{checkbox:true});assert.equal(b.attrs.get('aria-checked'),'false');
});
test('edit cue buttons keep toggle semantics',()=>{
  const b=chip();U.setCueState(b,true);assert.equal(b.attrs.get('aria-pressed'),'true');
  assert.equal(b.attrs.has('aria-checked'),false);assert.equal(b.classes.has('is-active'),true);
});
test('counts use singular only at one',()=>{
  for(const noun of ['MINAO function','subspace orbital','atom','spinor']) {
    assert.equal(Text.plural(1,noun),`1 ${noun}`);
    for(const n of [0,2])assert.equal(Text.plural(n,noun),`${n} ${noun}s`);
  }
});
