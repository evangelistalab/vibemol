import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';
const ctx=loadGlobalModules(['assets/app/js/figure-composer.js'],{globals:{Blob}}), F=ctx.VibeMolFigureComposer;
test('print layout has exact requested width, point labels and uniform slots',()=>{
  const p=F.layout(6);assert.equal(p.width,1950);assert.equal(p.panel,634);assert.equal(p.rows,2);assert.equal(p.height,1426);
  assert.equal(p.font,10*300/72);assert.equal(p.slots[5].x+634,1950);
  const overlay=F.layout(5,{labelPosition:'overlay'});assert.equal(overlay.height,1292);
});
test('GPU limit is explicit and invalid or excessive allocations are rejected',()=>{
  assert.match(F.layout(1,{widthIn:10,dpi:600},4096).error,/4096/);
  for(const input of [{cols:0},{gutter:1000,widthIn:.2},{dpi:NaN},{width:1},{format:'pdf'},{widthIn:40,dpi:2400}])assert.throws(()=>F.layout(3,input));
  assert.throws(()=>F.layout(0));assert.throws(()=>F.layout(129));
});
test('SVG has physical page size and safely escaped editable labels',()=>{
  const p=F.layout(1,{widthIn:6.5,labelPosition:'overlay'});
  const svg=F.svg(p,['data:image/png;base64,AA=='],['<orbital & "a">'],{fontFamily:'Example "Font"',background:null});
  assert.match(svg,/width="6.5in"/);assert.match(svg,/viewBox="0 0 1950 1950"/);assert.match(svg,/<text /);
  assert.match(svg,/&lt;orbital &amp; &quot;a&quot;&gt;/);assert.doesNotMatch(svg,/<orbital/);assert.match(svg,/<image .*data:image\/png;base64/);
});
test('PNG density is replaced with requested DPI without changing IDAT pixels',async()=>{
  const data=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL7sAAAAASUVORK5CYII=','base64');
  const encoded=await F.pngDensity(new Blob([data]),300), bytes=Buffer.from(await encoded.arrayBuffer());
  const offset=bytes.indexOf('pHYs');assert.equal(bytes.readUInt32BE(offset+4),11811);assert.equal(bytes.readUInt32BE(offset+8),11811);assert.equal(bytes[offset+12],1);
  const again=Buffer.from(await (await F.pngDensity(encoded,600)).arrayBuffer());assert.equal(again.length,bytes.length);assert.equal(again.readUInt32BE(offset+4),23622);
  assert.ok(again.includes(data.subarray(data.indexOf('IDAT'),data.indexOf('IEND')-4)));
});
