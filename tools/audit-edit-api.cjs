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
function appStatements(ast) {
 return ast.program.body[0].expression.callee.body.body;
}
function namedAppStatement(statements, name) {
 if(name.startsWith('statement:let:')) {
  const binding=name.slice('statement:let:'.length);
  return statements.filter(node=>node.type==='VariableDeclaration'&&node.kind==='let'
    &&node.declarations.some(declaration=>declaration.id.name===binding));
 }
 if(name.startsWith('statement:')) {
  const binding=name.slice('statement:'.length);
  const assigned=statements.filter(node=>node.type==='ExpressionStatement'
    &&node.expression.type==='AssignmentExpression'&&node.expression.left.type==='Identifier'
    &&node.expression.left.name===binding);
  if(assigned.length) return assigned;
  return statements.filter(node=>node.type==='VariableDeclaration'
    &&node.declarations.some(declaration=>declaration.id.name===binding));
 }
 return statements.filter(node=>node.type==='FunctionDeclaration'&&node.id.name===name);
}
function deletionBinding(node, name) {
 if(!name.startsWith('statement:')) return name;
 assert(node?.type==='VariableDeclaration'&&node.declarations.length===1&&node.declarations[0].id.type==='Identifier',
  name+' must name a standalone declaration to delete it');
 return node.declarations[0].id.name;
}
function requireDeletedBinding(ast, name) {
 traverse(ast,{
  Scope(p){assert(!p.scope.hasOwnBinding(name),name+' still exists');},
  BindingIdentifier(p){assert.notEqual(p.node.name,name,name+' is still referenced');},
  ReferencedIdentifier(p){assert.notEqual(p.node.name,name,name+' is still referenced');},
 });
}
function additiveApp(source, baseline, testingChanges={}, productChanges={}, legacyStatementRemovals={}) {
 const api=surface(source),old=surface(baseline,{requireProduct:false});
 const hash=s=>require('node:crypto').createHash('sha256').update(s).digest('hex');
 assert.deepEqual(api.testing,old.testing,'Testing members changed');
 assert.deepEqual(Object.keys(testingChanges).sort(),['projectHaloGhostToClient','replaceGestureTerminalHydrogen','setEditSelectionIndices','triggerHaloGhostByIndex'],'Exactly the four authorized Testing changes');
 for(const name of api.testing){
  const change=testingChanges[name];
  if(change){assert.equal(hash(old.testingMembers[name]),change.before,name+' original fingerprint');assert.equal(hash(api.testingMembers[name]),change.after,name+' changed fingerprint');}
  else assert.equal(api.testingMembers[name],old.testingMembers[name],'Existing Testing object changed: '+name);
 }
 const currentAst=parser.parse(source);
 const previousNodes=appStatements(parser.parse(baseline));
 const previousStatements=previousNodes.map(n=>baseline.slice(n.start,n.end));
 const removed=Object.keys(legacyStatementRemovals).sort();
 // Keep the expected list hardcoded so widening it requires editing both this audit and the baseline.
 // Deriving it from Object.keys(contract.legacyStatementRemovals) would make the check tautological.
 assert.deepEqual(removed,[
  "bind('down', 'global', 'a', () => {\n    window.__showAxes__ = !window.__showAxes__;\n    if (toggleAxes) toggleAxes.checked = !!window.__showAxes__;\n    syncAllAppearanceActionToggleButtons();\n    scheduleAppearancePresetAutosave();\n  });",
  "bind('down', 'global', 'b', () => batchBtn && batchBtn.click());",
  "bind('down', 'global', 'i', () => {\n    toggleActiveSurfaceVisibility();\n  });",
  "bind('down', 'global', 's', () => saveBtn && saveBtn.click());",
  "bind('down', MODES.MEASURE, 'v', () => { toggleExclusiveDisplayWindow(NON_EDIT_WINDOW_ID.VIEW_PANEL); });",
  "let __lastBondUpdate = 0;",
 ],'Exactly the six authorized legacy statement removals');
 for(const statement of removed) {
  const matches=previousStatements.filter(code=>code===statement);
  assert.equal(matches.length,1,'Authorized removal must appear once in the pinned baseline: '+statement);
  assert.equal(hash(matches[0]),legacyStatementRemovals[statement],'Original legacy statement fingerprint: '+statement);
 }
 const legacy=previousStatements.filter(code=>!Object.hasOwn(legacyStatementRemovals,code));
 const previousFunctions=new Map(previousNodes.filter(n=>n.type==='FunctionDeclaration').map(n=>[n.id.name,baseline.slice(n.start,n.end)]));
 const statementChanges=new Map(Object.entries(productChanges).filter(([name,change])=>name.startsWith('statement:')&&change.after!==null)
  .map(([name,change])=>[change.after,name]));
 const appliedProductChanges=new Set(), deletedStatements=new Set();
 for(const [name,change] of Object.entries(productChanges)) {
  if(change.after!==null) continue;
  assert.deepEqual(Object.keys(change).sort(),['after','before','reason','units']);
  assert(typeof change.reason==='string'&&change.reason.trim(),'Named product change requires its human-approved reason');
  const nodes=namedAppStatement(previousNodes,name);
  assert.equal(nodes.length,1,name+' must resolve once in the base commit');
  const before=baseline.slice(nodes[0].start,nodes[0].end);
  assert(before&&legacy.includes(before)&&hash(before)===change.before,name+' original product fingerprint');
  requireDeletedBinding(currentAst,deletionBinding(nodes[0],name));
  assert(!deletedStatements.has(before),'Product deletion must occur once');
  deletedStatements.add(before);
  appliedProductChanges.add(name);
 }
 const preserved=[];let exposed=0,orbitalDeclarations=0,orbitalExposures=0,vectorDeclarations=0,vectorExposures=0;
 const fresh=/^(editApi|createEditApi|createEditSelectionApi|classifyEditApiSource|enterEditApi|callEditApiTesting|defaultEditApiMetalLigandType)/;
 for(const n of appStatements(currentAst)) {
  if(n.type==='FunctionDeclaration'&&(fresh.test(n.id.name)||n.id.name==='readForte2MinaoSnapshot'))continue;
  if(n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='orbitalProductApi')) {
   assert.equal(n.kind,'const','New API state must not add a module let');
   assert.equal(n.declarations.length,1,'Declare only the named orbital product API object');
   orbitalDeclarations++;
   continue;
  }
  if(n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='vectorProductApi')) {
   assert.equal(n.kind,'const','New API state must not add a module let');
   assert.equal(n.declarations.length,1,'Declare only the named vector product API object');
   vectorDeclarations++;
   continue;
  }
  if(n.type==='VariableDeclaration'&&n.declarations.every(d=>fresh.test(d.id.name)||d.id.name==='editProductApi'||d.id.name==='forte2ProductApi')) {
   assert.equal(n.kind,'const','New API state must not add a module let');continue;
  }
  if(n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&n.expression.left.type==='MemberExpression'
    &&n.expression.left.object.name==='window'&&n.expression.left.property.name==='VibeMolEdit') {
   assert.equal(n.expression.right.name,'editProductApi');exposed++;continue;
  }
  if(n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&n.expression.left.type==='MemberExpression'&&n.expression.left.object.name==='window'&&n.expression.left.property.name==='VibeMolForte2'){assert.equal(source.slice(n.start,n.end),'window.VibeMolForte2=Object.freeze({export:forte2ProductApi.export});');continue;}
  if(n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&n.expression.left.type==='MemberExpression'
    &&n.expression.left.object.name==='window'&&n.expression.left.property.name==='VibeMolOrbitals') {
   assert.equal(source.slice(n.start,n.end),'window.VibeMolOrbitals=Object.freeze({list:orbitalProductApi.list,show:orbitalProductApi.show,hide:orbitalProductApi.hide,configure:orbitalProductApi.configure,setView:orbitalProductApi.setView,setMode:orbitalProductApi.setMode,snapshot:orbitalProductApi.snapshot});',
    'Exact VibeMolOrbitals exposure');
   orbitalExposures++;
   continue;
  }
  if(n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&n.expression.left.type==='MemberExpression'
    &&n.expression.left.object.name==='window'&&n.expression.left.property.name==='VibeMolVectors') {
   assert.equal(source.slice(n.start,n.end),'window.VibeMolVectors=Object.freeze({list:vectorProductApi.list,setAtoms:vectorProductApi.setAtoms,setArrow:vectorProductApi.setArrow,remove:vectorProductApi.remove,clear:vectorProductApi.clear});',
    'Exact VibeMolVectors exposure');
   vectorExposures++;
   continue;
  }
  const code=source.slice(n.start,n.end).replace(api.testingCode,old.testingCode);
  const name=n.type==='FunctionDeclaration'?n.id.name:statementChanges.get(hash(code));
  if(name&&Object.hasOwn(productChanges,name)) {
   const change=productChanges[name];
   assert.deepEqual(Object.keys(change).sort(),['after','before','reason','units']);
   assert(typeof change.reason==='string'&&change.reason.trim(),'Named product change requires its human-approved reason');
   assert.equal(hash(code),change.after,name+' changed product fingerprint');
   assert(!appliedProductChanges.has(name),'Product change must occur once');appliedProductChanges.add(name);
   if(change.before===null) {
    assert([
      'statement:tutorialConnection','statement:bindTransformShortcut','isEditTargetHidden','prepareOutlinerEditTarget',
      'statement:metalGrowPreview','beginCatalogMetalDrag','finishCatalogMetalDrag','showMetalBuildPressSites',
      'applyCatalogLigandAtMetal','attachCatalogDonorAtPointer','buildXyzVectorArrows','commitAtomAtHaloGhost','describeMetalLigandMoves',
      'getBuildMetalLigandType','getDisplayedMetalBondStyle','getOpenMetalPlacement',
      'selectMetalBuildAnchor','setSelectedAtomFormalCharge','updateGrowPlacementPreview',
      'rejectTrajectoryStructureEdit','statement:trajectoryEditHint',
      'resetAppOptions','resetSceneDisplayOptions','resetVisualizationOptions','statement:defaultAppOptions',
      'syncMoldenOccupationDividers',
      'cloneVectorState','vectorStatesEqual','transformVectorState','applyQuaternionVectorTransform',
      'syncTransformedAtomArrows','prepareCoordinationLigandMoves',
      'applyCoordinationLigandVectors','refreshCoordinationGeometryPresentation',
      'step3bRequest','step3bRequireIdle','readProductMode','setProductMode','requireProductOrbitalSurfaces',
      'moldenProductSource','listProductOrbitals',
      'validateMoldenProductIndices','moldenProductLayers','readVisibleMoldenProductIndices','setMoldenProductLayerVisibility',
      'presentMoldenProductSelection','showProductOrbitals','hideProductOrbitals','configureProductOrbitals',
      'applyMoldenProductAppearance','setProductView','readViewportPng','paintSnapshotFrame',
      'captureViewportPng','snapshotProductView',
      'buildFreeArrowDisplay','vectorProductTarget','readVectorProductTarget','listProductVectors',
      'applyVectorProductState','changeProductVectors','validateVectorProductPlan','setProductAtomVectors',
      'setProductFreeArrow','removeProductVectors','clearProductVectors',
    ].includes(name),
     'Only the enumerated private product statements may be added');
    assert(!previousFunctions.has(name),'A new function may not replace a legacy statement');
   } else {
    const before=n.type==='FunctionDeclaration'?previousFunctions.get(name):legacy.find(statement=>hash(statement)===change.before);
    assert.equal(before?hash(before):null,change.before,name+' original product fingerprint');
    preserved.push(before);
   }
   continue;
  }
  preserved.push(n.type==='FunctionDeclaration'&&['applyHydrogenPlanToVolume','applyAutomaticHydrogenAdjustmentToVolume'].includes(n.id.name)?normalizeHydrogenDefaults(code):code);
 }
 assert.equal(exposed,1,'Exactly one additive product API exposure');
 assert.equal(orbitalDeclarations,1,'Exactly one orbital product API declaration');
 assert.equal(orbitalExposures,1,'Exactly one VibeMolOrbitals exposure');
 assert.equal(vectorDeclarations,1,'Exactly one vector product API declaration');
 assert.equal(vectorExposures,1,'Exactly one VibeMolVectors exposure');
 assert.deepEqual([...appliedProductChanges].sort(),Object.keys(productChanges).sort(),'Every declared product change must be checked');
 assert.deepEqual(preserved,legacy.filter(statement=>!deletedStatements.has(statement)),'Existing app statements changed beyond the opt-in hydrogen extensions');
 assert.equal(preserved.length,previousStatements.length-removed.length-deletedStatements.size,'Legacy statement count must decrease by exactly the authorized removals');
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
function additiveHelpers(root, readBase, placementChanges, haloChanges) {
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
   assert.deepEqual(Object.keys(placementChanges).sort(),[
    'appendAtomAtWorld','beginAddAtomOperatorSession','commitMoleculePlacement',
    'finalizeAddAtomOperatorSession','setAddAtomOperatorWorldPosition',
   ],'Exactly the five authorized placement and history changes');
   const functions=source=>{
    const nodes=new Map();
    traverse(parser.parse(source),{FunctionDeclaration(p){if(Object.hasOwn(placementChanges,p.node.id.name))nodes.set(p.node.id.name,p.node);}});
    return nodes;
   };
   const baseline=readBase(file), before=functions(baseline), after=functions(code);
   const fingerprint=source=>require('node:crypto').createHash('sha256').update(source).digest('hex');
   for(const [symbol,node] of [...after].sort(([,a],[,b])=>b.start-a.start)){
    const original=before.get(symbol), previous=baseline.slice(original.start,original.end);
    const change=placementChanges[symbol];
    assert.equal(fingerprint(previous),change.before,symbol+' original placement fingerprint');
    assert.equal(fingerprint(code.slice(node.start,node.end)),change.after,symbol+' changed placement fingerprint');
    code=code.slice(0,node.start)+previous+code.slice(node.end);
   }
   assert.equal(after.size,Object.keys(placementChanges).length,'Every placement change must be checked');
  } else {
   if (haloChanges) {
    const hash = value => require('node:crypto').createHash('sha256').update(value).digest('hex');
    assert.deepEqual(Object.keys(haloChanges).sort(), ['after', 'before', 'reason']);
    assert.equal(hash(readBase(file)), haloChanges.before, 'Original halo fingerprint');
    assert.equal(hash(code), haloChanges.after, 'Authorized coordination halo fingerprint');
    assert(typeof haloChanges.reason === 'string' && haloChanges.reason.trim());
    continue;
   }
   const edits=[];traverse(parser.parse(code),{FunctionDeclaration(p){if(p.node.id?.name==='listBuildSites')edits.push([p.node.start,p.node.end]);},ObjectProperty(p){if(p.node.key.name==='listBuildSites')edits.push([p.node.start,p.node.end+(code[p.node.end]===','?1:0)]);}});
   assert.equal(edits.length,2);for(const[a,b]of edits.sort((a,b)=>b[0]-a[0]))code=code.slice(0,a)+code.slice(b);
  }
  assert.equal(semantic(code),semantic(readBase(file)),'Existing helper behavior changed: '+file);
 }
 return files;
}
function kernelInventory(root, entries, appSource) {
 return entries.map(entry=>{
  const source=entry.file==='app.js'&&appSource!==undefined ? appSource :
   fs.readFileSync(path.join(root,'assets/app/js',entry.file),'utf8');
  const found=[];
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
function audit(root=path.resolve(__dirname,'..'),candidate) {
 const cp=require('node:child_process'),crypto=require('node:crypto');
 const contract=candidate??JSON.parse(fs.readFileSync(path.join(root,'tests/baselines/edit-api.json'))),source=fs.readFileSync(path.join(root,'assets/app/js/app.js'),'utf8');
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
 const additive=additiveApp(source,readBase('assets/app/js/app.js'),contract.testing.changes,productChanges,contract.legacyStatementRemovals),helperExtensions=additiveHelpers(root,readBase,contract.placementChanges,contract.haloChanges);
 return {status:'passed',methods:api.methods.length,units:rows.length,maxInputs:Math.max(...rows.map(r=>r.count),...contract.kernelInputs.map(r=>r.count)),...additive,helperExtensions,retainedNativeDrag:true};
}
function recordProductChanges(root, source, contract, pinned, names, reason, {units={}, deletions=[]}={}) {
 assert(typeof reason==='string'&&reason.trim(),'Supply --reason with the authorized wording');
 const targets=[...names,...deletions];
 assert(targets.length>0&&targets.length===new Set(targets).size,'Supply distinct recording targets');
 assert(Object.keys(units).every(name=>names.includes(name)),'A helper unit requires a recorded owner');
 assert.equal(contract.baseCommit,pinned.baseCommit,'Original baseCommit changed');
 for(const [name,entry] of Object.entries(pinned.productChanges)) {
  assert.equal(contract.productChanges[name]?.before,entry.before,name+' original fingerprint changed');
  assert.deepEqual(contract.productChanges[name].units,entry.units,name+' unit list changed before recording');
 }
 for(const name of Object.keys(contract.productChanges)) {
  assert(Object.hasOwn(pinned.productChanges,name)||targets.includes(name),name+' is outside the recording request');
 }
 const baseSource=require('node:child_process').execFileSync('git',['show',pinned.baseCommit+':assets/app/js/app.js'],
  {cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
 const baseStatements=appStatements(parser.parse(baseSource));
 const result=structuredClone(contract);
 const ast=parser.parse(source), statements=appStatements(ast);
 const hash=value=>require('node:crypto').createHash('sha256').update(value).digest('hex');
 for(const name of targets) {
  const prior=Object.hasOwn(pinned.productChanges,name)?pinned.productChanges[name]:undefined;
  const deleting=deletions.includes(name), originalNodes=namedAppStatement(baseStatements,name);
  const originalCount=prior?.before===null&&!deleting?0:1;
  assert.equal(originalNodes.length,originalCount,name+' original target must resolve in baseCommit');
  const original=originalNodes[0];
  const before=original?hash(baseSource.slice(original.start,original.end)):null;
  if(Object.hasOwn(contract.productChanges,name)) {
   assert.equal(contract.productChanges[name].before,before,name+' original fingerprint differs from baseCommit');
  }
  let after=null;
  if(deleting) {
   requireDeletedBinding(ast,deletionBinding(original,name));
  } else {
   const nodes=namedAppStatement(statements,name);
   assert.equal(nodes.length,1,'Expected one named app function or statement: '+name);
   after=hash(source.slice(nodes[0].start,nodes[0].end));
  }
  const added=Object.hasOwn(units,name)?units[name]:[];
  const specs=[...(prior?.units||[]),...added.map(unit=>({file:'app.js',name:unit}))];
  assert.equal(new Set(specs.map(unit=>unit.file+':'+unit.name)).size,specs.length,name+' has duplicate helper units');
  const measured=kernelInventory(root,specs,source);
  assert(measured.every(row=>row.count<15),name+' requires fewer than 15 inputs per helper unit: '+JSON.stringify(measured));
  Object.defineProperty(result.productChanges,name,{value:{before,after,reason,units:measured},
   enumerable:true,writable:true,configurable:true});
 }
 return result;
}
function parseRecording(args) {
 const usage='Usage: --record <target>... [--unit <helper>] [--delete <target>] --reason "<text>"';
 const reasonIndex=args.indexOf('--reason');
 assert(reasonIndex>1&&reasonIndex===args.length-2,usage);
 const names=[], deletions=[], units=Object.create(null);
 let recording=false, owner;
 for(let i=0;i<reasonIndex;i++) {
  const arg=args[i];
  if(arg==='--record') {
   assert(i+1<reasonIndex&&!args[i+1].startsWith('--'),usage);
   recording=true;
  } else if(arg==='--delete'||arg==='--unit') {
   const name=args[++i];
   assert(i<reasonIndex&&!name.startsWith('--'),usage);
   if(arg==='--delete') {
    deletions.push(name);
    recording=false;
    owner=undefined;
   } else {
    assert(owner,'--unit must follow its --record target');
    (units[owner]??=[]).push(name);
   }
  } else {
   assert(recording&&!arg.startsWith('--'),usage);
   names.push(arg);
   owner=arg;
  }
 }
 return {names,deletions,units,reason:args.at(-1)};
}
if(require.main===module) {
 const args=process.argv.slice(2),root=path.resolve(__dirname,'..');
 if(['--record','--delete'].includes(args[0])) {
  const {names,deletions,units,reason}=parseRecording(args),file='tests/baselines/edit-api.json';
  const pinned=JSON.parse(require('node:child_process').execFileSync('git',['show','HEAD:'+file],{cwd:root}));
  const filename=path.join(root,file);
  const original=fs.readFileSync(filename,'utf8');
  const contract=JSON.parse(original),source=fs.readFileSync(path.join(root,'assets/app/js/app.js'),'utf8');
  const candidate=recordProductChanges(root,source,contract,pinned,names,reason,{units,deletions});
  audit(root,candidate);
  assert.equal(fs.readFileSync(filename,'utf8'),original,'Ledger changed during recording');
  fs.writeFileSync(filename,JSON.stringify(candidate,null,2)+'\n');
  console.table([...names,...deletions].map(name=>({
   target:name,before:candidate.productChanges[name].before,previousAfter:contract.productChanges[name]?.after,
   after:candidate.productChanges[name].after,units:candidate.productChanges[name].units.map(unit=>unit.count).join(', '),
   reason:candidate.productChanges[name].reason,
  })));
 } else {
  const result=audit(root),index=args.indexOf('--out');
  if(index>=0)fs.writeFileSync(args[index+1],JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
 }
}
module.exports={inventory,surface,additiveApp,normalizeHydrogenDefaults,kernelInventory,restoreDeclaredModelDefaults,audit,recordProductChanges};
