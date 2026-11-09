#!/usr/bin/env node
'use strict';
// The supported API and its private seams are an enumerated contract.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const babel=name=>require(process.env.VIBEMOL_BABEL_ROOT?path.join(process.env.VIBEMOL_BABEL_ROOT,name):'@babel/'+name);
const parser=babel('parser'),traverse=babel('traverse').default;
function inventory(source){
 const ast=parser.parse(source),rows=[];
 traverse(ast,{FunctionDeclaration(fn){
  const name=fn.node.id?.name;if(!/^(createEditApi|createEditSelectionApi|classifyEditApiSource|editApi|enterEditApi|callEditApiTesting)/.test(name))return;
  const deps=new Set(),free=new Set(),draftCallbacks=new Set(),externalServices=new Set();
  fn.traverse({ReferencedIdentifier(p){
   if(p.node.name==='window'&&p.parentPath.isMemberExpression()&&p.parent.object===p.node&&p.parent.property.name==='VibeMolEdit')externalServices.add('window.VibeMolEdit');
   if(p.node.name==='draft'&&p.parentPath.isMemberExpression()&&p.parent.object===p.node){
    const key=p.parent.computed?p.parent.property.value:p.parent.property.name;
    assert(['vol','minted','added','removed','groups','add','remove','bond','group','operation','nextAtomId'].includes(key),'Unreviewed draft member: '+key);
    if(['add','remove','bond','group','operation','nextAtomId'].includes(key))draftCallbacks.add('draft.'+key);
   }
   const binding=p.scope.getBinding(p.node.name);
   if(!binding&&p.node.name==='ATOM_Z_TO_DATA')externalServices.add('ATOM_Z_TO_DATA');
   if(binding&&binding.scope!==fn.scope&&!binding.path.findParent(x=>x===fn))free.add(p.node.name);
   if(p.node.name==='deps'&&p.parentPath.isMemberExpression()&&p.parent.object===p.node&&p.parent.property.type==='Identifier')deps.add(p.parent.property.name);
  }});
  free.delete('deps');free.delete(name);
  const callbacks=[...draftCallbacks].sort().concat(name==='editApiRealizeIds'?['allocators.atom','allocators.group','allocators.op','bondId']:['editApiCall','editApiTestingResult'].includes(name)?['action']:[]);
  rows.push({name,count:deps.size+free.size+callbacks.length+externalServices.size,deps:[...deps].sort(),closure:[...free].sort(),...(callbacks.length?{parameterCallbacks:callbacks}:{}),...(externalServices.size?{externalServices:[...externalServices].sort()}:{})});
 }});
 return rows;
}
function surface(source,{requireProduct=true}={}){
 const ast=parser.parse(source);let methods,wrappers=[],testing,retained;
 traverse(ast,{VariableDeclarator(p){if(p.node.id.name==='editProductApi')methods=p.node.init.arguments[0].properties.map(n=>n.key.name).sort();},
  AssignmentExpression(p){if(p.node.left.type==='MemberExpression'&&p.node.left.object.name==='window'&&p.node.left.property.name==='VibeMolTesting')testing=p.node.right.arguments[0];}});
 assert(testing&&(!requireProduct||methods),'Required surfaces must be statically enumerable');
 for(const prop of testing.properties){
  if(prop.value.type==='ArrowFunctionExpression'&&prop.value.body.type==='CallExpression'&&prop.value.body.callee.name==='callEditApiTesting')wrappers.push(prop.key.name);
  if(prop.key.name==='performSelectionMoveDrag')retained=source.slice(prop.value.start,prop.value.end);
 }
 return {methods,wrappers:wrappers.sort(),testing:testing.properties.map(p=>p.key.name).sort(),retained,testingCode:source.slice(testing.start,testing.end),
  testingMembers:Object.fromEntries(testing.properties.map(p=>[p.key.name,source.slice(p.start,p.end)]))};
}
function normalizeHydrogenDefaults(code) {
 return code.replace('vol, plan, allocateAtomId = null','vol, plan')
  .replace(', ...(allocateAtomId ? { id: allocateAtomId() } : {})','')
  .replace("    const enabled = typeof options.enabled === 'boolean' ? options.enabled : editAddAdjustHydrogensEnabled;\n",'')
  .replace('if (!enabled ||','if (!editAddAdjustHydrogensEnabled ||')
  .replace('applyHydrogenPlanToVolume(vol, plan, options.allocateAtomId)','applyHydrogenPlanToVolume(vol, plan)');
}
function additiveApp(source, baseline, testingChanges={}, productChanges={}, legacyStatementRemovals={}) {
 const api=surface(source),old=surface(baseline,{requireProduct:false});
 const hash=s=>require('node:crypto').createHash('sha256').update(s).digest('hex');
 assert.deepEqual(api.testing,old.testing,'Testing members changed');
 assert.deepEqual(Object.keys(testingChanges).sort(),['projectHaloGhostToClient','replaceGestureTerminalHydrogen','setEditSelectionIndices'],'Exactly the three authorized Testing changes');
 for(const name of api.testing){
  const change=testingChanges[name];
  if(change){assert.equal(hash(old.testingMembers[name]),change.before,name+' original fingerprint');assert.equal(hash(api.testingMembers[name]),change.after,name+' changed fingerprint');}
  else assert.equal(api.testingMembers[name],old.testingMembers[name],'Existing Testing object changed: '+name);
 }
 const statements=s=>parser.parse(s).program.body[0].expression.callee.body.body;
 const previousNodes=statements(baseline);
 const previousStatements=previousNodes.map(n=>baseline.slice(n.start,n.end));
 const removed=Object.keys(legacyStatementRemovals).sort();
 assert.deepEqual(removed,['let __lastBondUpdate = 0;'],'Exactly the one authorized legacy statement removal');
 for(const statement of removed) {
  const matches=previousStatements.filter(code=>code===statement);
  assert.equal(matches.length,1,'Authorized removal must appear once in the pinned baseline: '+statement);
  assert.equal(hash(matches[0]),legacyStatementRemovals[statement],'Original legacy statement fingerprint: '+statement);
 }
 const legacy=previousStatements.filter(code=>!Object.hasOwn(legacyStatementRemovals,code));
 const previousFunctions=new Map(previousNodes.filter(n=>n.type==='FunctionDeclaration').map(n=>[n.id.name,baseline.slice(n.start,n.end)]));
 const appliedProductChanges=new Set();
 const preserved=[];let exposed=0;
 const fresh=/^(editApi|createEditApi|createEditSelectionApi|classifyEditApiSource|enterEditApi|callEditApiTesting)/;
 for(const n of statements(source)) {
  if(n.type==='FunctionDeclaration'&&(fresh.test(n.id.name)||n.id.name==='readForte2MinaoSnapshot'))continue;
  if(n.type==='VariableDeclaration'&&n.declarations.every(d=>fresh.test(d.id.name)||d.id.name==='editProductApi'||d.id.name==='forte2ProductApi')) {
   assert.equal(n.kind,'const','New API state must not add a module let');continue;
  }
  if(n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&n.expression.left.type==='MemberExpression'
    &&n.expression.left.object.name==='window'&&n.expression.left.property.name==='VibeMolEdit') {
   assert.equal(n.expression.right.name,'editProductApi');exposed++;continue;
  }
  if(n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&n.expression.left.type==='MemberExpression'&&n.expression.left.object.name==='window'&&n.expression.left.property.name==='VibeMolForte2'){assert.equal(source.slice(n.start,n.end),'window.VibeMolForte2=Object.freeze({export:forte2ProductApi.export});');continue;}
  const code=source.slice(n.start,n.end).replace(api.testingCode,old.testingCode);
  if(n.type==='FunctionDeclaration'&&Object.hasOwn(productChanges,n.id.name)) {
   const change=productChanges[n.id.name],before=previousFunctions.get(n.id.name);
   assert.deepEqual(Object.keys(change).sort(),['after','before','reason','units']);
   assert(typeof change.reason==='string'&&change.reason.trim(),'Named product change requires its human-approved reason');
   assert.equal(hash(before),change.before,n.id.name+' original product fingerprint');
   assert.equal(hash(code),change.after,n.id.name+' changed product fingerprint');
   assert(!appliedProductChanges.has(n.id.name),'Product change must occur once');appliedProductChanges.add(n.id.name);
   preserved.push(before);continue;
  }
  preserved.push(n.type==='FunctionDeclaration'&&['applyHydrogenPlanToVolume','applyAutomaticHydrogenAdjustmentToVolume'].includes(n.id.name)?normalizeHydrogenDefaults(code):code);
 }
 assert.equal(exposed,1,'Exactly one additive product API exposure');
 assert.deepEqual([...appliedProductChanges].sort(),Object.keys(productChanges).sort(),'Every declared product change must be checked');
 assert.deepEqual(preserved,legacy,'Existing app statements changed beyond the opt-in hydrogen extensions');
 assert.equal(preserved.length,previousStatements.length-removed.length,'Legacy statement count must decrease by exactly the authorized removals');
 return {legacyStatements:preserved.length,legacyStatementsBeforeRemovals:previousStatements.length,legacyStatementRemovals:removed,
  testingMembers:old.testing.length,wrappers:api.wrappers.length,retirements:0,testingChanges:Object.keys(testingChanges),...(appliedProductChanges.size?{productChanges:[...appliedProductChanges].sort()}: {})};
}
function semantic(source) {
 return JSON.stringify(parser.parse(source),(key,value)=>['start','end','loc','extra','comments','leadingComments','trailingComments','innerComments','tokens'].includes(key)?undefined:value);
}
function restoreDeclaredModelDefaults(source,previous,changes=[]) {
 const defaults=code=>{
  const body=parser.parse(code).program.body[0].expression.callee.body.body;
  const node=body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations).find(n=>n.id.name==='defaults');
  assert(node&&node.init?.type==='CallExpression'&&node.init.arguments[0]?.type==='ObjectExpression','Model defaults object');
  return node.init.arguments[0].properties;
 };
 const current=defaults(source),old=defaults(previous),edits=[],seen=new Set();
 for(const change of changes){
  assert.deepEqual(Object.keys(change).sort(),['after','before','key','reason']);
  assert(typeof change.reason==='string'&&change.reason.length>0&&!seen.has(change.key),'Distinct documented default changes');seen.add(change.key);
  const value=properties=>properties.find(n=>n.type==='ObjectProperty'&&n.key.name===change.key)?.value;
  const before=value(old),after=value(current);assert(before&&after,'Declared model default exists');
  assert.equal(before.type,'StringLiteral');assert.equal(after.type,'StringLiteral');
  assert.equal(before.value,change.before,'Original model default');assert.equal(after.value,change.after,'Declared model default');
  edits.push([after.start,after.end,JSON.stringify(change.before)]);
 }
 for(const[start,end,replacement]of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+replacement+source.slice(end);
 return source;
}
function additiveHelpers(root, readBase) {
 const files=['calculations-model.js','edit-halo.js','edit-placement.js'];
 for(const name of files) {
  const file='assets/app/js/'+name;let code=fs.readFileSync(path.join(root,file),'utf8');
  if(name==='calculations-model.js') {
   const contract=JSON.parse(fs.readFileSync(path.join(root,'tests/baselines/forte2-export.json')));
   const previous=require('node:child_process').execFileSync('git',['show',contract.baseCommit+':'+file],{cwd:root,encoding:'utf8'});
   code=restoreDeclaredModelDefaults(code,previous,contract.modelDefaultChanges);
   const functions=s=>parser.parse(s).program.body[0].expression.callee.body.body.filter(n=>n.type==='FunctionDeclaration');
   for(const current of functions(code).filter(n=>contract.changedModelFunctions.includes(n.id.name)).sort((a,b)=>b.start-a.start)){
    const old=functions(previous).find(n=>n.id.name===current.id.name);assert(old);
    code=code.slice(0,current.start)+previous.slice(old.start,old.end)+code.slice(current.end);
   }

   code=code.replace('function fitPlane(record, ids, options = {})','function fitPlane(record, ids)');
   for(const text of [", ...(options.diagnostics ? { code: 'PLANE_TOO_SMALL', rms: null, secondEigenvalue: null } : {})",
    ", ...(options.diagnostics ? { code: 'PLANE_COLLINEAR', rms: Math.sqrt(Math.max(0,values[0])/selected.length), secondEigenvalue: values[1] } : {})",
    ", ...(options.diagnostics ? { code: 'PLANE_NONCOPLANAR', rms, secondEigenvalue: values[1] } : {})"]){assert(code.includes(text));code=code.replace(text,'');}
  } else if(name==='edit-placement.js') {
   for(const symbol of ['appendPlacedMoleculeBonds','appendTemplateTopologyBonds','getFuseRingOmittedLocalIndices'])code=code.replace('      '+symbol+',\n','');
  } else {
   const edits=[];traverse(parser.parse(code),{FunctionDeclaration(p){if(p.node.id?.name==='listBuildSites')edits.push([p.node.start,p.node.end]);},ObjectProperty(p){if(p.node.key.name==='listBuildSites')edits.push([p.node.start,p.node.end+(code[p.node.end]===','?1:0)]);}});
   assert.equal(edits.length,2);for(const[a,b]of edits.sort((a,b)=>b[0]-a[0]))code=code.slice(0,a)+code.slice(b);
  }
  assert.equal(semantic(code),semantic(readBase(file)),'Existing helper behavior changed: '+file);
 }
 return files;
}
function kernelInventory(root, entries) {
 return entries.map(entry=>{
  const source=fs.readFileSync(path.join(root,'assets/app/js',entry.file),'utf8'),found=[];
  traverse(parser.parse(source),{FunctionDeclaration(fn){
   if(fn.node.id?.name!==entry.name)return;
   const inputs=new Set();fn.traverse({ReferencedIdentifier(p){
    const binding=p.scope.getBinding(p.node.name);
    if((binding&&binding.scope!==fn.scope&&!binding.path.findParent(x=>x===fn))||(!binding&&p.node.name==='THREE'))inputs.add(p.node.name);
   }});inputs.delete(entry.name);
   const callbacks=entry.parameterCallbacks||[];
   found.push({file:entry.file,name:entry.name,count:inputs.size+callbacks.length,inputs:[...inputs].sort(),...(callbacks.length?{parameterCallbacks:callbacks}:{})});
  }});assert.equal(found.length,1,'Kernel name must resolve once: '+entry.name);return found[0];
 });
}
function audit(root=path.resolve(__dirname,'..')) {
 const cp=require('node:child_process'),crypto=require('node:crypto');
 const contract=JSON.parse(fs.readFileSync(path.join(root,'tests/baselines/edit-api.json'))),source=fs.readFileSync(path.join(root,'assets/app/js/app.js'),'utf8');
 const readBase=file=>cp.execFileSync('git',['show',contract.baseCommit+':'+file],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
 const rows=inventory(source),api=surface(source);
 assert.deepEqual(rows,contract.units,'Input inventory changed; re-cut before expanding');assert(rows.every(r=>r.count<15));
 const kernels=kernelInventory(root,contract.kernelInputs);assert.deepEqual(kernels,contract.kernelInputs,'Reused-kernel inputs changed');assert(kernels.every(r=>r.count<15),'Reused kernels include allocator callbacks in the input count');
 assert.deepEqual(api.methods,contract.methods);assert.deepEqual(api.wrappers,contract.testing.wrappers.slice().sort());assert.deepEqual(contract.testing.retired,[]);
 assert.equal(crypto.createHash('sha256').update(api.retained).digest('hex'),contract.testing.retainedNativeDrag.sha256);
 const productChanges=contract.productChanges||{};
 const productUnits=Object.values(productChanges).flatMap(change=>change.units);
 assert.deepEqual(kernelInventory(root,productUnits),productUnits,'Product helper dependencies changed');
 assert(productUnits.every(r=>r.count<15),'Product helpers must remain below15 inputs');
 const additive=additiveApp(source,readBase('assets/app/js/app.js'),contract.testing.changes,productChanges,contract.legacyStatementRemovals),helperExtensions=additiveHelpers(root,readBase);
 return {status:'passed',methods:api.methods.length,units:rows.length,maxInputs:Math.max(...rows.map(r=>r.count),...contract.kernelInputs.map(r=>r.count)),...additive,helperExtensions,retainedNativeDrag:true};
}
if(require.main===module) {
 const result=audit(),index=process.argv.indexOf('--out');if(index>=0)fs.writeFileSync(process.argv[index+1],JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}
module.exports={inventory,surface,additiveApp,normalizeHydrogenDefaults,kernelInventory,restoreDeclaredModelDefaults,audit};
