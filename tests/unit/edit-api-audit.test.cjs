const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const {additiveApp}=require('../../tools/audit-edit-api.cjs');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'assets/app/js/app.js'),'utf8');
const baseline=cp.execFileSync('git',['show','c37bb07e30c711025da325a14bbbb4a8345d06d7:assets/app/js/app.js'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
const contract=JSON.parse(fs.readFileSync(path.join(root,'tests/baselines/edit-api.json')));
const audit=(s,productChanges=contract.productChanges||{},removals=contract.legacyStatementRemovals)=>
 additiveApp(s,baseline,contract.testing.changes,productChanges,removals);
test('risk batch preserves app statements except separately fingerprinted product repairs',()=>{
 const result=audit(source);assert.equal(result.wrappers,2);assert.equal(result.retirements,0);assert.equal(result.testingChanges.length,3);assert(result.testingMembers>40&&result.legacyStatements>1000);
 const actual={before:result.legacyStatementsBeforeRemovals,after:result.legacyStatements,removed:result.legacyStatementRemovals};
 const expected={before:2502,after:2496,removed:[
  "bind('down', 'global', 'a', () => {\n    window.__showAxes__ = !window.__showAxes__;\n    if (toggleAxes) toggleAxes.checked = !!window.__showAxes__;\n    syncAllAppearanceActionToggleButtons();\n    scheduleAppearancePresetAutosave();\n  });",
  "bind('down', 'global', 'b', () => batchBtn && batchBtn.click());",
  "bind('down', 'global', 'i', () => {\n    toggleActiveSurfaceVisibility();\n  });",
  "bind('down', 'global', 's', () => saveBtn && saveBtn.click());",
  "bind('down', MODES.MEASURE, 'v', () => { toggleExclusiveDisplayWindow(NON_EDIT_WINDOW_ID.VIEW_PANEL); });",
  "let __lastBondUpdate = 0;",
 ]};
 console.log(JSON.stringify({actual,expected}));
 assert.deepEqual(actual,expected);
});
test('the authorized removal does not permit another legacy statement to disappear',()=>{
 const statement='const BOHR_TO_ANG = 0.529177210903;';
 const changed=source.replace(statement,'');assert.notEqual(changed,source);
 let actual='accepted';
 try { audit(changed); } catch(error) { actual=error.message.split('\n',1)[0]; }
 const expected='Existing app statements changed beyond the opt-in hydrogen extensions';
 console.log(JSON.stringify({unlistedRemoval:statement,actual,expected}));
 assert.equal(actual,expected);
});
test('the removal allowance requires the exact key set and baseline fingerprint',()=>{
 const removals=contract.legacyStatementRemovals;
 assert.throws(()=>audit(source,undefined,{}),/Exactly the six authorized legacy statement removals/);
 assert.throws(()=>audit(source,undefined,{...removals,'const BOHR_TO_ANG = 0.529177210903;':'0'.repeat(64)}),
  /Exactly the six authorized legacy statement removals/);
 assert.throws(()=>audit(source,undefined,{...removals,'let __lastBondUpdate = 0;':'0'.repeat(64)}),
  /Original legacy statement fingerprint/);
});
test('the three-pixel connection repair cannot drift past its declared fingerprint',()=>{
 const changed=source.replace('lineWidth: { value: 3 }','lineWidth: { value: 4 }');assert.notEqual(changed,source);
 assert.throws(()=>audit(changed),/changed product fingerprint/);
});
test('an approved product repair must match its original source fingerprint too',()=>{
 const changes=structuredClone(contract.productChanges);changes.updateEditSelectionVisuals.before='0'.repeat(64);
 assert.throws(()=>audit(source,changes),/original product fingerprint/);
});
test('the View shortcut replacement must match both statement fingerprints',()=>{
 const changed=source.replace('if (!e.altKey) setMode(MODES.DISPLAY);','if (!e.altKey) setMode(MODES.MEASURE);');
 assert.notEqual(changed,source);
 assert.throws(()=>audit(changed),/Every declared product change must be checked/);
 const changes=structuredClone(contract.productChanges);changes['statement:bindViewMode'].before='0'.repeat(64);
 assert.throws(()=>audit(source,changes),/statement:bindViewMode original product fingerprint/);
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
 assert.throws(()=>additiveApp(source,baseline,changes,contract.productChanges,contract.legacyStatementRemovals),/Exactly the three/);
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
test('native-suite error collectors receive rejection comparands and serialization cannot swallow the original error',()=>{
 const parser=require(path.join(process.env.VIBEMOL_BABEL_ROOT,'parser')),vm=require('node:vm');
 const node=parser.parse(source).program.body[0].expression.callee.body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='callEditApiTesting');
 const records=[],error=Object.assign(new Error('ATOM_NOT_FOUND'),{editApi:{code:'ATOM_NOT_FOUND',details:{actual:999,expected:[0,1]}}});
 const run=vm.runInNewContext('('+source.slice(node.start,node.end)+')',{editApiTestingSetSelection:()=>{throw error;},console:{error:line=>records.push(line)}});
 assert.throws(()=>run('selection',[0,999]),caught=>caught===error);
 const receipt=JSON.parse(records.pop().slice('[edit-testing-rejection] '.length));
 assert.deepEqual(receipt,{operation:'selection',requested:[[0,999]],error:error.editApi});
 const cyclic=[];cyclic.push(cyclic);assert.throws(()=>run('selection',cyclic),caught=>caught===error);
 assert.equal(JSON.parse(records.pop().slice('[edit-testing-rejection] '.length)).requested,'non-JSON request');
});

test('only the declared CAS default is normalized and other settings still fail the legacy freeze',()=>{
 const {restoreDeclaredModelDefaults}=require('../../tools/audit-edit-api.cjs');
 const previous="(function(){const defaults=Object.freeze({method:'cumulative',sigma:.98});})();";
 const source="(function(){const defaults=Object.freeze({method:'cas',sigma:.98});})();";
 const changes=[{key:'method',before:'cumulative',after:'cas',reason:'Human-authorized CAS default'}];
 const semantic=code=>JSON.stringify(require(path.join(process.env.VIBEMOL_BABEL_ROOT,'parser')).parse(code),
  (key,value)=>['start','end','loc','extra'].includes(key)?undefined:value);
 assert.equal(semantic(restoreDeclaredModelDefaults(source,previous,changes)),semantic(previous));
 assert.throws(()=>restoreDeclaredModelDefaults(source.replace("method:'cas'","method:'total'"),previous,changes),/Declared model default/);
 assert.throws(()=>restoreDeclaredModelDefaults(source,previous,[{...changes[0],before:'cutoff'}]),/Original model default/);
 assert.notEqual(semantic(restoreDeclaredModelDefaults(source.replace('sigma:.98','sigma:.97'),previous,changes)),semantic(previous));
 assert.notEqual(semantic(restoreDeclaredModelDefaults(source,previous,[])),semantic(previous));
});
