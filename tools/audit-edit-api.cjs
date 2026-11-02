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
function additiveApp(source, baseline, testingChanges={}) {
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
 const legacy=statements(baseline).map(n=>baseline.slice(n.start,n.end));
 const preserved=[];let exposed=0;
 const fresh=/^(editApi|createEditApi|createEditSelectionApi|classifyEditApiSource|enterEditApi|callEditApiTesting)/;
 for(const n of statements(source)) {
  if(n.type==='FunctionDeclaration'&&fresh.test(n.id.name))continue;
  if(n.type==='VariableDeclaration'&&n.declarations.every(d=>fresh.test(d.id.name)||d.id.name==='editProductApi')) {
   assert.equal(n.kind,'const','New API state must not add a module let');continue;
  }
  if(n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&n.expression.left.type==='MemberExpression'
    &&n.expression.left.object.name==='window'&&n.expression.left.property.name==='VibeMolEdit') {
   assert.equal(n.expression.right.name,'editProductApi');exposed++;continue;
  }
  const code=source.slice(n.start,n.end).replace(api.testingCode,old.testingCode);
  preserved.push(n.type==='FunctionDeclaration'&&['applyHydrogenPlanToVolume','applyAutomaticHydrogenAdjustmentToVolume'].includes(n.id.name)?normalizeHydrogenDefaults(code):code);
 }
 assert.equal(exposed,1,'Exactly one additive product API exposure');
 assert.deepEqual(preserved,legacy,'Existing app statements changed beyond the opt-in hydrogen extensions');
 return {legacyStatements:legacy.length,testingMembers:old.testing.length,wrappers:api.wrappers.length,retirements:0,testingChanges:Object.keys(testingChanges)};
}
function semantic(source) {
 return JSON.stringify(parser.parse(source),(key,value)=>['start','end','loc','extra','comments','leadingComments','trailingComments','innerComments','tokens'].includes(key)?undefined:value);
}
function additiveHelpers(root, readBase) {
 const files=['calculations-model.js','edit-halo.js','edit-placement.js'];
 for(const name of files) {
  const file='assets/app/js/'+name;let code=fs.readFileSync(path.join(root,file),'utf8');
  if(name==='calculations-model.js') {
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
 const additive=additiveApp(source,readBase('assets/app/js/app.js'),contract.testing.changes),helperExtensions=additiveHelpers(root,readBase);
 return {status:'passed',methods:api.methods.length,units:rows.length,maxInputs:Math.max(...rows.map(r=>r.count),...contract.kernelInputs.map(r=>r.count)),...additive,helperExtensions,retainedNativeDrag:true};
}
if(require.main===module) {
 const result=audit(),index=process.argv.indexOf('--out');if(index>=0)fs.writeFileSync(process.argv[index+1],JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}
module.exports={inventory,surface,additiveApp,normalizeHydrogenDefaults,kernelInventory,audit};
