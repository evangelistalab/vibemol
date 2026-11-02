const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {inventory,audit}=require('../../tools/audit-forte2.cjs');
const root=path.resolve(__dirname,'../..');
test('Forte2 inventory is explicit, controller has twelve genuine inputs and all units stay below fifteen',()=>{
 const result=audit(root);assert.equal(result.maxInputs,12);const controller=result.units.find(r=>r.name==='createForte2Controller');
 assert.deepEqual(result.units.find(r=>r.name==='createGeometryEncoder').factoryInputs,['elements']);assert.equal(result.units.find(r=>r.name==='createGeometryEncoder').count,2);
 assert.equal(controller.deps.length,5);assert.equal(controller.closure.length,7);assert.equal(result.units.find(r=>r.name==='readForte2MinaoSnapshot').count,3);
});
test('new free services and lost units cannot silently pass the input inventory',()=>{
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'forte2-inputs-'));
 try{
  const config=JSON.parse(fs.readFileSync(path.join(root,'tests/baselines/forte2-export.json')));
  for(const file of [...new Set(config.units.map(r=>r.file)),'tests/baselines/forte2-export.json']){fs.mkdirSync(path.dirname(path.join(scratch,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(scratch,file));}
  const file=path.join(scratch,'assets/app/js/forte2-format.js'),source=fs.readFileSync(file,'utf8');
  fs.writeFileSync(file,source.replace('  function createForte2Controller(deps) {','  const newService=()=>{};\n  function createForte2Controller(deps) {newService();'));
  assert.equal(inventory(scratch).find(r=>r.name==='createForte2Controller').count,13);assert.throws(()=>audit(scratch),/inventory changed/);
  fs.writeFileSync(file,source.replace('function createForte2Controller(deps)','function renamedForte2Controller(deps)'));assert.throws(()=>audit(scratch),/inventory changed/);
 }finally{fs.rmSync(scratch,{recursive:true,force:true});}
});
