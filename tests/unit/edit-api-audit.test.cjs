const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const {additiveApp}=require('../../tools/audit-edit-api.cjs');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'assets/app/js/app.js'),'utf8');
const baseline=cp.execFileSync('git',['show','c37bb07e30c711025da325a14bbbb4a8345d06d7:assets/app/js/app.js'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
test('additive API retains the complete original app and Testing owner',()=>{
 const result=additiveApp(source,baseline);assert.equal(result.wrappers,0);assert.equal(result.retirements,0);assert(result.testingMembers>40&&result.legacyStatements>1000);
});
test('a Testing getter conversion cannot masquerade as an additive API',()=>{
 const changed=source.replace('return Array.isArray(selection) ? selection.slice() : [];','return [];');assert.notEqual(changed,source);assert.throws(()=>additiveApp(changed,baseline),/Testing object changed/);
});
test('an unrelated legacy product change is rejected',()=>{
 const changed=source.replace("window.addEventListener('keydown', handleApplicationEscape, true);","window.addEventListener('keydown', handleApplicationEscape, false);");assert.notEqual(changed,source);assert.throws(()=>additiveApp(changed,baseline),/Existing app statements changed/);
});
test('a newly mutable API binding is rejected',()=>{
 const changed=source.replace('const editApiReadSystem','let editApiReadSystem');assert.notEqual(changed,source);assert.throws(()=>additiveApp(changed,baseline),/module let/);
});
