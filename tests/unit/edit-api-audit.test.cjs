const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const {additiveApp}=require('../../tools/audit-edit-api.cjs');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'assets/app/js/app.js'),'utf8');
const baseline=cp.execFileSync('git',['show','c37bb07e30c711025da325a14bbbb4a8345d06d7:assets/app/js/app.js'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
const contract=JSON.parse(fs.readFileSync(path.join(root,'tests/baselines/edit-api.json')));
const audit=s=>additiveApp(s,baseline,contract.testing.changes);
test('risk batch changes exactly three Testing members and preserves the remaining app',()=>{
 const result=audit(source);assert.equal(result.wrappers,2);assert.equal(result.retirements,0);assert.equal(result.testingChanges.length,3);assert(result.testingMembers>40&&result.legacyStatements>1000);
});
test('a Testing getter conversion cannot masquerade as an additive API',()=>{
 const changed=source.replace('return Array.isArray(selection) ? selection.slice() : [];','return [];');assert.notEqual(changed,source);assert.throws(()=>audit(changed),/Testing object changed/);
});
test('an unrelated legacy product change is rejected',()=>{
 const changed=source.replace("window.addEventListener('keydown', handleApplicationEscape, true);","window.addEventListener('keydown', handleApplicationEscape, false);");assert.notEqual(changed,source);assert.throws(()=>audit(changed),/Existing app statements changed/);
});
test('a newly mutable API binding is rejected',()=>{
 const changed=source.replace('const editApiReadSystem','let editApiReadSystem');assert.notEqual(changed,source);assert.throws(()=>audit(changed),/module let/);
});
test('an authorized member cannot change past its declared fingerprint',()=>{
 const changed=source.replace("callEditApiTesting('selection', indices)","callEditApiTesting('selection', [])");assert.notEqual(changed,source);assert.throws(()=>audit(changed),/changed fingerprint/);
});
test('an omitted declared change cannot silently shrink the batch guard',()=>{
 const changes={...contract.testing.changes};delete changes.projectHaloGhostToClient;
 assert.throws(()=>additiveApp(source,baseline,changes),/Exactly the three/);
});
test('the lazy facade fails before reading a record when the product API is absent',()=>{
 const parser=require(path.join(process.env.VIBEMOL_BABEL_ROOT,'parser')),vm=require('node:vm');
 const node=parser.parse(source).program.body[0].expression.callee.body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='editApiTestingSnapshot');
 const run=vm.runInNewContext('('+source.slice(node.start,node.end)+')',{window:{},editApiFault:code=>{throw Object.assign(new Error(code),{code});}});
 assert.throws(()=>run(),error=>error.code==='API_NOT_READY');
});
test('the projection query rejects an occupied identity and never coerces a request',()=>{
 const {surface}=require('../../tools/audit-edit-api.cjs'),vm=require('node:vm');
 const member=surface(source).testingMembers.projectHaloGhostToClient;
 const query=vm.runInNewContext('({'+member+'}).projectHaloGhostToClient',{
  editHaloController:null,editHaloUiState:{visible:true,ghosts:[{index:1,world:{x:1,y:2,z:3}}]},
  THREE:{Vector3:class{constructor(x,y,z){Object.assign(this,{x,y,z});}}},projectWorldToClient:()=>({x:10,y:20,visible:true})});
 for(const request of [0,'1',1.5,-1,NaN])assert.equal(query(request),null);
 assert.deepEqual(JSON.parse(JSON.stringify(query(1))),{index:1,x:10,y:20,visible:true});
});
