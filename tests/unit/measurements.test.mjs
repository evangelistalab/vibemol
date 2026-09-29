import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';
const { VibeMolMeasurements: model } = loadGlobalModule('assets/app/js/measurements.js');
const record = () => ({name:'test, "molecule"', vol:{ units:'angstrom', atoms:[
  {id:'a',x:0,y:1,z:0}, {id:'b',x:0,y:0,z:0}, {id:'c',x:1,y:0,z:0}, {id:'d',x:1,y:0,z:1} ]}});

test('incremental picking retains six unique measurements with a signed dihedral', () => {
  const r = record();
  for (let n=1;n<=4;n++) model.add(r, ['a','b','c','d'].slice(0,n));
  assert.equal(model.rows(r).length, 6);
  assert.equal(model.rows(r).at(-1).value, 90);
  model.add(r, ['d','c','b','a']); assert.equal(model.rows(r).length, 6);
  r.vol.atoms[3].z = -1;
  assert.equal(model.rows(r).at(-1).value, -90);
});
test('units and decimals format the same values; CSV quotes names and reports units', () => {
  const r = record(); model.add(r,['a','b']);
  model.configure(r,{units:'bohr',decimals:2});
  assert.equal(model.rows(r)[0].number,'1.89');
  assert.equal(model.rows(r)[0].value,1);
  assert.match(model.csv(r), /"test, ""molecule""","distance","1–2","1.89","Bohr"/);
  r.vol.units = 'bohr'; assert.equal(model.rows(r)[0].number, '1.00');
});
test('deletion, clearing and settings are undoable; atom identities survive reordering and removal', () => {
  const r = record(); model.add(r,['a','b']); const id=model.rows(r)[0].id;
  model.remove(r,id); assert.equal(model.rows(r).length,0);
  model.undo(r); assert.equal(model.rows(r).length,1);
  model.clear(r); model.undo(r); model.undo(r,true); assert.equal(model.rows(r).length,0);
  model.undo(r); r.vol.atoms.reverse(); assert.equal(model.rows(r)[0].atoms,'4–3');
  r.vol.atoms.pop(); assert.equal(model.rows(r)[0].value,null);
  assert.match(model.rows(r)[0].reason,/removed/);
});
test('collinear and coincident geometry has honest values, never NaN', () => {
  assert.equal(model.value('angle',[[0,0,0],[1,0,0],[2,0,0]]),180);
  assert.equal(model.value('angle',[[0,0,0],[0,0,0],[2,0,0]]),null);
  assert.equal(model.value('dihedral',[[0,0,0],[1,0,0],[2,0,0],[3,0,0]]),null);
});
test('colliding labels spread inside the viewport, with manual positions given priority', () => {
  const items = Array.from({length:6},(_,id)=>({id,x:160,y:120,w:80,h:24,manual:id===3}));
  const placed=model.layoutLabels(items,400,300);
  assert.equal(placed[0].id,3); assert.equal(placed[0].x,160);
  for (let i=0;i<placed.length;i++) {
    const a=placed[i]; assert.ok(!a.crowded && a.x-a.w/2>=0 && a.y+a.h/2<=300);
    for(const b of placed.slice(i+1)) assert.ok(Math.abs(a.x-b.x)>=(a.w+b.w)/2+4 || Math.abs(a.y-b.y)>=(a.h+b.h)/2+4);
  }
});
