import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';
const { VibeMolWorkbenchModel: model } = loadGlobalModule('assets/app/js/workbench-model.js');

test('legacy inspectors merge into the active placement without duplicating or minimizing a visible panel', () => {
  const value = model.normalize({ open: ['displayInspector', 'styleStudio'], parked: ['displayInspector'],
    activeBottom: 'styleStudio', placements: { displayInspector: 'right', styleStudio: 'float' },
    positions: { styleStudio: { left: 101, top: 205 } }, rightWidth: 570, bottomHeight: 290 });
  assert.equal(value.open.join(), 'inspector'); assert.equal(value.parked.length, 0);
  assert.equal(value.placements.inspector, 'float'); assert.equal(value.activeBottom, 'inspector');
  assert.equal(value.positions.inspector.left, 101); assert.equal(value.rightWidth, 570);
  assert.equal(JSON.stringify(model.normalize(value)), JSON.stringify(value));
  assert.equal(model.normalize({ open: false }).open.length, 0);
  assert.equal(model.normalize({ open: ['styleStudio'], parked: false }).parked.length, 0);
});

test('workspace imports keep only known windows and bound panel sizes', () => {
  const value = model.normalize({ placements: { coordsPanel: 'float', styleStudio: 'elsewhere' },
    positions: { coordsPanel: { left: -100, top: 99999 }, styleStudio: { left: Infinity, top: 0 }, unknown: { left: 10, top: 10 } },
    open: ['coordsPanel', 'unknown', 'coordsPanel'], parked: ['unknown'], rightWidth: 999999, bottomHeight: -20 });
  assert.equal(value.placements.coordsPanel, 'float');
  assert.equal(value.placements.inspector, 'right');
  assert.equal(value.open.join(), 'coordsPanel');
  assert.equal(value.parked.length, 0);
  assert.equal(value.rightWidth, 680); assert.equal(value.bottomHeight, 180);
  assert.equal(value.positions.coordsPanel.left, 0); assert.equal(value.positions.coordsPanel.top, 10000);
  assert.equal(Object.keys(value.positions).join(), 'coordsPanel');
  assert.equal(model.normalize(null).rightWidth, 380);
});
test('old Quick actions layouts shed the retired window without disturbing other panels', () => {
  const value=model.normalize({open:['viewInspector','coordsPanel'], parked:['viewInspector'],
    placements:{viewInspector:'float',coordsPanel:'bottom'}, activeRight:'viewInspector', activeBottom:'coordsPanel',
    positions:{viewInspector:{left:110,top:150}}, rightWidth:510, bottomHeight:240});
  assert.equal(value.open.join(), 'coordsPanel'); assert.equal(value.parked.length,0);
  assert.equal(value.activeRight,null); assert.equal(value.activeBottom,'coordsPanel');
  assert.equal(value.rightWidth,510); assert.equal(value.bottomHeight,240);
  assert.equal('viewInspector' in value.placements,false); assert.equal('viewInspector' in value.positions,false);
});
test('desktop docks reserve a usable canvas at extreme saved widths', () => {
  for (const width of [1100, 1440, 1920]) {
    const r = model.regions({ width, height: 900, sidebar: 341, right: true, bottom: true, rightWidth: 680, bottomHeight: 480 });
    assert.ok(width-r.left-r.right >= 340);
    assert.ok(900-r.top-r.bottom >= 200);
  }
});
test('small screens combine windows below the canvas without a right overlay', () => {
  const r = model.regions({ width: 390, height: 640, sidebar: 221, right: true });
  assert.ok(r.compact); assert.equal(r.left, 0); assert.equal(r.right, 0); assert.ok(r.bottom > 0);
  assert.ok(640-r.top-r.bottom >= 200);
});
test('focus clears both regions without changing the saved layout', () => {
  const value = { width: 1440, height: 900, sidebar: 341, right: true, bottom: true, focus: true };
  const r = model.regions(value);
  assert.equal(r.left + r.right + r.bottom, 0); assert.equal(value.sidebar, 341);
});
test('a two-row mode bar leaves room for the molecule above the mobile dock', () => {
  const r = model.regions({width:390, height:640, sidebar:0, right:true, top:96, bottomHeight:480});
  assert.equal(r.top,96); assert.ok(640-r.top-r.bottom>=200);
});
