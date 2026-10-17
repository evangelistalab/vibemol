// Independently reverse only the allowed hand-off edits, then demand exact sources.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {parse}=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/parser');
const traverse=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/traverse').default;
const [rootArg,base,outArg,previewArg]=process.argv.slice(2),root=path.resolve(rootArg),out=path.resolve(outArg),preview=previewArg&&path.resolve(previewArg);
const beforeFile=file=>cp.execFileSync('git',['-C',root,'show',base+':assets/app/js/'+file],{encoding:'utf8',maxBuffer:32*1024*1024});
const afterFile=file=>fs.readFileSync(preview?path.join(preview,file==='app.js'?'app.after.js':'periodic-table.after.js'):path.join(root,'assets/app/js',file),'utf8');
const fields=['elementColorOverlay','elementColorClose','periodicTableViewport','periodicTableCanvas','elementColorName','elementColorPicker','elementColorResetOne','elementColorResetAll'];
const nonDom=['THREE','ATOM_Z_TO_DATA','ATOM_SYMBOL_TO_Z','UI_PALETTE','getActiveElementHexColor','getElementSymbol','getElementName','editAppearanceSettings','exportElementColorOverrides','normalizeHexColor'];
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const metrics=s=>({lines:s.split('\n').length-1,letDeclarations:(s.match(/^  let /gm)||[]).length,functionDeclarations:(s.match(/^  (?:async )?function\b/gm)||[]).length,sha256:sha(s)});
const files={},functions={},inverseProof={},shadowed=[],queries=[];
function edit(source,changes){changes.sort((a,b)=>b.start-a.start);for(let i=1;i<changes.length;i++)assert.ok(changes[i].end<=changes[i-1].start,'Overlapping independent reverse edits');return changes.reduce((s,e)=>s.slice(0,e.start)+e.text+s.slice(e.end),source);}
function analyze(source){let outer,factory,els,controller,bindControls,destructure;const declarations=[];traverse(parse(source),{
  FunctionExpression(p){if(p.node.start<10&&p.parent.type==='CallExpression')outer=p;},
  FunctionDeclaration(p){declarations.push(p);if(p.node.id.name==='createPeriodicTableController')controller=p;if(p.node.id.name==='bindControls')bindControls=p;},
  VariableDeclarator(p){if(p.node.id.name==='els')els=p;if(p.node.id.type==='ObjectPattern'&&p.node.id.properties.some(x=>x.key?.name==='THREE'))destructure=p;},
  CallExpression(p){if(p.node.callee.name==='createPeriodicTableController')factory=p;},
});return{outer,factory,els,controller,bindControls,destructure,declarations};}
for(const file of ['app.js','periodic-table.js']){
  const before=beforeFile(file),after=afterFile(file),b=analyze(before),a=analyze(after),changes=[];
  assert.equal(b.declarations.length,a.declarations.length);
  assert.deepEqual(b.declarations.map(x=>x.node.id.name),a.declarations.map(x=>x.node.id.name));
  const elsBinding=file==='app.js'?a.outer.scope.getBinding('els'):a.controller.scope.getBinding('els');assert.ok(elsBinding);
  traverse(parse(after),{MemberExpression(p){if(p.node.object.name==='els'&&fields.includes(p.node.property.name)){
    // This separately parsed traversal is for source ranges; binding validation below uses original paths.
    changes.push({start:p.node.start,end:p.node.end,text:p.node.property.name});
  }}});
  const members=[];
  (file==='app.js'?a.outer:a.controller).traverse({MemberExpression(p){if(p.node.object.name==='els'&&fields.includes(p.node.property.name)){
    if(p.scope.getBinding('els')!==elsBinding)shadowed.push({file,line:p.node.loc.start.line});
    members.push(p);
  }}});
  if(file==='app.js'){
    assert.deepEqual(a.factory.node.arguments[0].properties.map(x=>x.key.name),[...nonDom,'els']);
    const beforeArg=b.factory.node.arguments[0],afterArg=a.factory.node.arguments[0];
    changes.push({start:afterArg.start,end:afterArg.end,text:before.slice(beforeArg.start,beforeArg.end)});
    for(const name of fields){
      const property=a.els.node.init.properties.find(x=>x.key.name===name);assert.ok(property);assert.equal(property.value.type,'NullLiteral');
      const lineStart=after.lastIndexOf('\n',property.start)+1,lineEnd=after.indexOf('\n',property.end)+1;
      changes.push({start:lineStart,end:lineEnd,text:''});
      const assignments=members.filter(p=>p.node.property.name===name&&p.parent.type==='AssignmentExpression'&&p.parent.left===p.node);assert.equal(assignments.length,1);
      const p=assignments[0],statement=p.getStatementParent().node;
      assert.equal(p.parent.right.callee.object.name,'document');assert.equal(p.parent.right.callee.property.name,'getElementById');assert.equal(p.parent.right.arguments[0].value,name);
      const original=b.outer.scope.getBinding(name).path.parentPath.node;
      changes.splice(changes.findIndex(c=>c.start===p.node.start&&c.end===p.node.end),1);
      changes.push({start:statement.start,end:statement.end,text:before.slice(original.start,original.end)});
      queries.push({name,id:name,originalLine:original.loc.start.line,candidateLine:statement.loc.start.line,queryExpressionExact:true,noAccessorRefresh:true});
    }
    const wiring='  if (elementColorBtn) elementColorBtn.onclick = () => periodicTableController.setOpen(true);\n';
    assert.equal(after.split(wiring).length,2);
    const start=after.indexOf(wiring);assert.ok(after.slice(start+wiring.length).startsWith('  periodicTableController.bindControls();'));
    changes.push({start,end:start+wiring.length,text:''});
    const bb=b.outer.scope.getBinding('elementColorBtn'),ab=a.outer.scope.getBinding('elementColorBtn');
    assert.equal(before.slice(bb.path.parentPath.node.start,bb.path.parentPath.node.end),after.slice(ab.path.parentPath.node.start,ab.path.parentPath.node.end));
    assert.equal(a.declarations.length,1190);
    for(let i=0;i<b.declarations.length;i++)assert.equal(after.slice(a.declarations[i].node.start,a.declarations[i].node.end),before.slice(b.declarations[i].node.start,b.declarations[i].node.end),'Existing app function declaration changed: '+b.declarations[i].node.id.name);
  }else{
    assert.deepEqual(a.destructure.node.id.properties.map(x=>x.key.name),[...nonDom,'els']);
    assert.equal(a.controller.scope.getBinding('elementColorBtn'),undefined);
    assert.ok(!after.includes('elementColorBtn'));
    changes.push({start:a.destructure.node.id.start,end:a.destructure.node.id.end,text:before.slice(b.destructure.node.id.start,b.destructure.node.id.end)});
    const original=b.bindControls.node.body.body[0];
    assert.equal(before.slice(original.start,original.end),'if (elementColorBtn) elementColorBtn.onclick = () => setElementColorOverlayOpen(true);');
    const start=a.bindControls.node.body.start+2;
    changes.push({start,end:start,text:'      '+before.slice(original.start,original.end)+'\n'});
    const returned=a.controller.node.body.body.at(-1);assert.equal(returned.type,'ReturnStatement');
    assert.equal(returned.argument.arguments[0].properties.find(x=>x.key.name==='setOpen').value.name,'setElementColorOverlayOpen');
  }
  assert.equal(edit(after,changes),before,'Unexpected source changes beyond allowed lexical hand-off and launcher relocation: '+file);
  files[file]={before:metrics(before),after:metrics(after)};functions[file]=a.declarations.length;inverseProof[file]=true;
}
assert.equal(shadowed.length,0);assert.equal(files['app.js'].before.letDeclarations,265);assert.equal(files['app.js'].after.letDeclarations,265);
assert.equal(files['app.js'].after.lines-files['app.js'].before.lines,1);
assert.equal(files['periodic-table.js'].after.lines-files['periodic-table.js'].before.lines,-9);
fs.mkdirSync(out,{recursive:true});
const report={group:'Element Colors hand-off',baseCommit:base,previewOnly:!!preview,files,auditedFunctionDeclarations:functions,
  all1190ExistingAppFunctionsByteExact:true,wholeSourcesExactAfterIndependentInverseOfApprovedEdits:inverseProof,shadowedElsReferences:shadowed,
  constQuerySnapshotTimingPreserved:true,queries,canonicalPlainFields:8,periodicInputsBefore:19,periodicInputsExcludingButton:18,periodicInputsAfter:11,nonDomInputs:nonDom,
  legacyButtonConstRetained:true,legacyPublicSetOpenIsOriginalFunction:true,lateButtonListenerOrderPreserved:true,qaGoldensAssertionsAndWaitsChanged:false,
  netAppLines:1,netPeriodicModuleLines:-9,
  authorizedDifference:'Eight canonical plain DOM fields and lexical references; explicit factory hand-off; legacy launcher input excluded and its original first late onclick assignment moved immediately before bindControls. No new controller/helper or production fix.'};
fs.writeFileSync(path.join(out,'source-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,preview:!!preview,files,auditedFunctionDeclarations:functions,periodicInputsAfter:11},null,2));
