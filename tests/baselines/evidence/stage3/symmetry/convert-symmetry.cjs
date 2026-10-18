const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {parse}=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/parser');
const traverse=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/traverse').default;
const base=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(base,'e35da9ca4721ad0645f9b0744aa38bfd9ca4b18d');
const source=fs.readFileSync('assets/app/js/app.js','utf8'),ast=parse(source);
const entries=JSON.parse(fs.readFileSync('tests/baselines/evidence/stage3/lookup-site-audit.json')).wiringSites.flatMap(g=>g.entries).filter(e=>e.group==='remainder'&&e.kind.startsWith('DOM cache'));
assert.equal(entries.length,10);assert.equal(entries.filter(e=>e.kind==='DOM cache alias').length,1);
let app;traverse(ast,{FunctionExpression(p){if(p.node.start<10&&p.parent.type==='CallExpression')app=p;}});assert.ok(app);
const alias=app.scope.getBinding('canvasAdaptiveMenuEl'),canonical=app.scope.getBinding('displayWindowAdaptiveMenuEl');
assert.equal(alias.constantViolations.length,1);const aliasAssignment=alias.constantViolations[0];
assert.equal(aliasAssignment.node.right.name,'displayWindowAdaptiveMenuEl');
const edits=[],inventory=[];
for(const entry of entries){
 const name=entry.name,b=app.scope.getBinding(name),p=b.path,target=name==='canvasAdaptiveMenuEl'?'displayWindowAdaptiveMenuEl':name;
 assert.equal(p.parent.kind,'let');assert.equal(p.node.init.type,'NullLiteral');assert.equal(p.parent.declarations.length,1);assert.equal(b.constantViolations.length,1);
 for(const r of b.referencePaths)edits.push({start:r.node.start,end:r.node.end,value:r.parent.type==='ObjectProperty'&&r.parent.shorthand?`${name}: els.${target}`:`els.${target}`});
 edits.push({start:source.lastIndexOf('\n',p.parent.start)+1,end:source.indexOf('\n',p.parent.end)+1,value:''});
 const a=b.constantViolations[0];
 if(name==='canvasAdaptiveMenuEl')edits.push({start:a.parent.start,end:a.parent.end,value:'// canvasAdaptiveMenuEl shares the canonical displayWindowAdaptiveMenuEl cache.'});
 else{
  assert.equal(a.node.right.callee.object.name,'document');assert.equal(a.node.right.callee.property.name,'getElementById');assert.equal(a.node.right.arguments[0].value,entry.id);assert.equal(a.getFunctionParent(),app);
  edits.push({start:a.node.start,end:a.node.end,value:`cacheElement('${name}', '${entry.id}')`});
 }
 inventory.push({...entry,preStageAuditQueryLine:entry.queryLine,declarationLine:p.node.loc.start.line,queryLine:name==='canvasAdaptiveMenuEl'?canonical.path.node.loc.start.line:a.node.loc.start.line,assignmentLine:a.node.loc.start.line,referenceCount:b.referencePaths.length,canonicalField:target});
}
assert.equal(canonical.path.parent.kind,'const');assert.equal(canonical.constantViolations.length,0);
assert.equal(canonical.path.node.init.callee.object.name,'document');assert.equal(canonical.path.node.init.arguments[0].value,'displayWindowAdaptiveMenu');
for(const r of canonical.referencePaths){
 if(r.node.start>=aliasAssignment.node.start&&r.node.end<=aliasAssignment.node.end)continue;
 edits.push({start:r.node.start,end:r.node.end,value:r.parent.type==='ObjectProperty'&&r.parent.shorthand?'displayWindowAdaptiveMenuEl: els.displayWindowAdaptiveMenuEl':'els.displayWindowAdaptiveMenuEl'});
}
edits.push({start:canonical.path.parent.start,end:canonical.path.parent.end,value:"els.displayWindowAdaptiveMenuEl = document.getElementById('displayWindowAdaptiveMenu');"});
const marker='  const els = {\n';assert.equal(source.split(marker).length,2);const insertion=source.indexOf(marker)+marker.length;
edits.push({start:insertion,end:insertion,value:entries.map(e=>`    ${e.name==='canvasAdaptiveMenuEl'?'displayWindowAdaptiveMenuEl':e.name}: null,\n`).join('')});
edits.sort((a,b)=>b.start-a.start);for(let i=1;i<edits.length;i++)assert.ok(edits[i].end<=edits[i-1].start,'Overlapping lexical edits');
let result=source;for(const e of edits)result=result.slice(0,e.start)+e.value+result.slice(e.end);
parse(result);assert.equal(source.split('\n').length,result.split('\n').length);
assert.equal((source.match(/^  let /gm)||[]).length,275);assert.equal((result.match(/^  let /gm)||[]).length,265);
assert.equal((result.match(/document\.getElementById\('displayWindowAdaptiveMenu'\)/g)||[]).length,1);
assert.ok(!/^  let (?:canvasAdaptiveMenuEl|editSymmetry\w+El) =/m.test(result));
assert.ok(/^  let measurementsPanel = null;/m.test(result)&&/^  let calculationsPanel = null,/m.test(result)&&/^  let helpRestoreFocusEl = null;/m.test(result));
fs.mkdirSync('out/test-artifacts/stage3/symmetry',{recursive:true});
fs.writeFileSync('assets/app/js/app.js',result);
fs.writeFileSync('out/test-artifacts/stage3/symmetry/binding-inventory.json',JSON.stringify({baseCommit:base,group:'symmetry/shared launcher',inventory,mutableCacheBindings:10,newControllers:0,controllerInterfaceCount:'N/A',cacheInventoryPlusHelperCount:11,extractionDependencyLimitApplicable:false,letBefore:275,letAfter:265,conversionNetAppLines:0,canonicalAliasQueryCount:1,accessorConversionsInGroup:9,cumulativeAccessorConversions:40,canonicalAliases:1},null,2)+'\n');
console.log(JSON.stringify({bindings:10,letAfter:265,netAppLines:0,canonicalAliasQueryCount:1}));
