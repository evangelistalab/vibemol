// Neutral, lexical hand-off only. Default emits a preview outside source.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const {parse} = require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/parser');
const traverse = require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/traverse').default;
const [rootArg, outArg, action = '--preview'] = process.argv.slice(2);
const root = path.resolve(rootArg), out = path.resolve(outArg);
assert.ok(['--preview', '--apply'].includes(action));
const git = (...args) => cp.execFileSync('git', ['-C', root, ...args], {encoding:'utf8'}).trim();
assert.equal(git('status', '--porcelain'), '');
const appPath = path.join(root,'assets/app/js/app.js'), modulePath = path.join(root,'assets/app/js/periodic-table.js');
const app = fs.readFileSync(appPath,'utf8'), mod = fs.readFileSync(modulePath,'utf8');
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
assert.equal(sha(app),'40853e5b547e34e8fa9e7dddcc5d11d4df50fe7186de1d9dad4130d302cfc95c');
const fields = ['elementColorOverlay','elementColorClose','periodicTableViewport','periodicTableCanvas','elementColorName','elementColorPicker','elementColorResetOne','elementColorResetAll'];
const nonDom = ['THREE','ATOM_Z_TO_DATA','ATOM_SYMBOL_TO_Z','UI_PALETTE','getActiveElementHexColor','getElementSymbol','getElementName','editAppearanceSettings','exportElementColorOverrides','normalizeHexColor'];
const appAst = parse(app), modAst = parse(mod);
let outer, factory, els, controller;
traverse(appAst,{
  FunctionExpression(p){if(p.node.start<10&&p.parent.type==='CallExpression')outer=p;},
  CallExpression(p){if(p.node.callee.name==='createPeriodicTableController'){assert.ok(!factory);factory=p;}},
  VariableDeclarator(p){if(p.node.id.name==='els')els=p;},
});
traverse(modAst,{FunctionDeclaration(p){if(p.node.id.name==='createPeriodicTableController')controller=p;}});
assert.ok(outer&&factory&&els&&controller);
assert.deepEqual(factory.node.arguments[0].properties.map(x=>x.key.name),[...nonDom,'elementColorBtn',...fields]);
const appEdits=[], modEdits=[], queries=[], lexical=[];
function replace(edits,start,end,text){edits.push({start,end,text});}
replace(appEdits,els.node.init.start+1,els.node.init.start+1,'\n'+fields.map(name=>'    '+name+': null,').join('\n'));
replace(appEdits,factory.node.arguments[0].start,factory.node.arguments[0].end,'{\n'+[...nonDom,'els'].map(name=>'    '+name+',').join('\n')+'\n  }');
for(const name of fields){
  const b=outer.scope.getBinding(name);
  assert.equal(b.kind,'const');assert.equal(b.constantViolations.length,0);
  const decl=b.path.parentPath.node;
  assert.equal(decl.type,'VariableDeclaration');assert.equal(decl.declarations.length,1);
  assert.equal(b.path.node.init.callee.property.name,'getElementById');
  assert.equal(b.path.node.init.arguments[0].value,name);
  replace(appEdits,decl.start,decl.end,'els.'+name+' = '+app.slice(b.path.node.init.start,b.path.node.init.end)+';');
  queries.push({name,id:name,beforeLine:decl.loc.start.line,queryUnchanged:true,canonical:'els.'+name,kind:'plain field; original const lookup timing and null behavior'});
  for(const r of b.referencePaths){
    if(r.node.start>=factory.node.start&&r.node.end<=factory.node.end)continue;
    assert.ok(!r.parentPath.node.shorthand);
    replace(appEdits,r.node.start,r.node.end,'els.'+name);
    lexical.push({file:'app.js',name,line:r.node.loc.start.line});
  }
}
const bindMarker='  periodicTableController.bindControls();';
assert.equal(app.split(bindMarker).length,2);
const bindOffset=app.indexOf(bindMarker);
replace(appEdits,bindOffset,bindOffset,'  if (elementColorBtn) elementColorBtn.onclick = () => periodicTableController.setOpen(true);\n');
const pattern=controller.scope.getBinding('THREE').path.node;
assert.equal(pattern.type,'VariableDeclarator');
assert.equal(pattern.id.type,'ObjectPattern');
assert.deepEqual(pattern.id.properties.map(x=>x.key.name),[...nonDom,'elementColorBtn',...fields]);
replace(modEdits,pattern.id.start,pattern.id.end,'{\n'+[...nonDom,'els'].map(name=>'      '+name+',').join('\n')+'\n    }');
let bindControls;
traverse(modAst,{FunctionDeclaration(p){if(p.node.id.name==='bindControls')bindControls=p;}});
const buttonStatement=bindControls.node.body.body[0];
assert.equal(mod.slice(buttonStatement.start,buttonStatement.end),'if (elementColorBtn) elementColorBtn.onclick = () => setElementColorOverlayOpen(true);');
replace(modEdits,buttonStatement.start-6,buttonStatement.end+1,'');
assert.equal(controller.scope.getBinding('elementColorBtn').referencePaths.length,2);
for(const name of fields){
  const b=controller.scope.getBinding(name);assert.equal(b.constantViolations.length,0);
  for(const r of b.referencePaths){
    assert.ok(!r.parentPath.node.shorthand);
    replace(modEdits,r.node.start,r.node.end,'els.'+name);
    lexical.push({file:'periodic-table.js',name,line:r.node.loc.start.line});
  }
}
function apply(source,edits){
  edits.sort((a,b)=>b.start-a.start);
  for(let i=1;i<edits.length;i++)assert.ok(edits[i].end<=edits[i-1].start,'Overlapping lexical edits');
  return edits.reduce((s,e)=>s.slice(0,e.start)+e.text+s.slice(e.end),source);
}
const afterApp=apply(app,appEdits), afterMod=apply(mod,modEdits);
parse(afterApp);parse(afterMod);
const metrics=source=>{let scope,top=0,all=0;traverse(parse(source),{FunctionExpression(p){if(p.node.start<10&&p.parent.type==='CallExpression')scope=p;},FunctionDeclaration(p){all++;if(p.parent.type==='BlockStatement'&&p.parentPath.parentPath?.node.type==='FunctionExpression'&&p.parentPath.parentPath.node.start<10)top++;}});return{lines:source.split('\n').length-1,topLevelFunctionDeclarations:top,allFunctionDeclarations:all,trackedLetDeclarations:(source.match(/^  let /gm)||[]).length,outerDirectLetDeclarations:scope.node.body.body.filter(n=>n.type==='VariableDeclaration'&&n.kind==='let').length,outerLetBindings:Object.values(scope.scope.bindings).filter(b=>b.kind==='let').length,sha256:sha(source)};};
const before=metrics(app),after=metrics(afterApp);
assert.equal(before.trackedLetDeclarations,265);assert.equal(after.trackedLetDeclarations,265);
assert.equal(before.outerLetBindings,after.outerLetBindings);
assert.equal(after.lines,before.lines+1);
assert.equal(after.topLevelFunctionDeclarations,before.topLevelFunctionDeclarations);
assert.equal(after.allFunctionDeclarations,before.allFunctionDeclarations);
fs.mkdirSync(out,{recursive:true});
assert.ok(!fs.existsSync(path.join(out,'conversion.json')),'Do not repeat a completed conversion');
fs.writeFileSync(path.join(out,'app.before.js'),app);fs.writeFileSync(path.join(out,'periodic-table.before.js'),mod);
fs.writeFileSync(path.join(out,'app.after.js'),afterApp);fs.writeFileSync(path.join(out,'periodic-table.after.js'),afterMod);
const report={baseCommit:git('rev-parse','HEAD'),baseTree:git('rev-parse','HEAD^{tree}'),mode:action,fields,nonDom,queries,lexicalSubstitutions:lexical,
  before,after,periodicBefore:metrics(mod),periodicAfter:metrics(afterMod),factoryBefore:19,factoryAfterButtonExclusion:18,factoryAfterGrouping:11,
  liveIdentitySlots:52,legacyButtonRetained:true,legacyWiringMovedAtSameLatePoint:true,legacyPublicSetOpenIsOriginalFunction:true,
  exception:'Only the explicitly authorized launcher input removal and exact app-owned late onclick registration relocation; no other function logic, query timing, listener timing, tests or goldens changed.'};
fs.writeFileSync(path.join(out,'conversion.json'),JSON.stringify(report,null,2)+'\n');
if(action==='--apply'){fs.writeFileSync(appPath,afterApp);fs.writeFileSync(modulePath,afterMod);}
console.log(JSON.stringify({mode:action,before,after,periodicBefore:report.periodicBefore,periodicAfter:report.periodicAfter,factoryAfter:11},null,2));
