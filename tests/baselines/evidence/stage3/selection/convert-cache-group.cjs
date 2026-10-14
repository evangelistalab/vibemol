const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {parse}=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/parser');
const traverse=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/traverse').default;
const source=fs.readFileSync('assets/app/js/app.js','utf8'),base=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(base,'b517116b6d808a325d6e7348ef8eb7a266f51e9a');
const entries=JSON.parse(fs.readFileSync('tests/baselines/evidence/stage3/lookup-site-audit.json')).wiringSites.flatMap(s=>s.entries).filter(e=>e.group==='editSelection*');
assert.equal(entries.length,13);const names=entries.map(e=>e.name),edits=[],inventory=[];let app;
traverse(parse(source),{FunctionExpression(p){if(p.node.start<10&&p.parent.type==='CallExpression')app=p;}});assert.ok(app);
for(const entry of entries){
 const name=entry.name,b=app.scope.getBinding(name),p=b.path;
 assert.equal(p.parent.kind,'let');assert.equal(p.parent.declarations.length,1);assert.equal(p.node.init.type,'NullLiteral');assert.equal(b.constantViolations.length,1);
 const a=b.constantViolations[0];assert.equal(a.node.type,'AssignmentExpression');assert.equal(a.getFunctionParent(),app);assert.equal(a.node.right.callee.object.name,'document');assert.equal(a.node.right.callee.property.name,'getElementById');assert.equal(a.node.right.arguments[0].value,entry.id);
 for(const r of b.referencePaths)edits.push({start:r.node.start,end:r.node.end,value:r.parent.type==='ObjectProperty'&&r.parent.shorthand?`${name}: els.${name}`:`els.${name}`});
 edits.push({start:source.lastIndexOf('\n',p.parent.start)+1,end:source.indexOf('\n',p.parent.end)+1,value:''});
 edits.push({start:a.node.start,end:a.node.end,value:`cacheElement('${name}', '${entry.id}')`});
 inventory.push({...entry,preStageAuditQueryLine:entry.queryLine,declarationLine:p.node.loc.start.line,queryLine:a.node.loc.start.line,assignmentLine:a.node.loc.start.line,referenceCount:b.referencePaths.length,knownAbsentIssue:entry.presentInStaticShell?undefined:15});
}
const marker='  const els = {\n';assert.equal(source.split(marker).length,2);const pos=source.indexOf(marker)+marker.length;edits.push({start:pos,end:pos,value:names.map(n=>`    ${n}: null,\n`).join('')});
edits.sort((a,b)=>b.start-a.start);for(let i=1;i<edits.length;i++)assert.ok(edits[i].end<=edits[i-1].start);
let result=source;for(const e of edits)result=result.slice(0,e.start)+e.value+result.slice(e.end);
assert.equal(source.split('\n').length,result.split('\n').length);parse(result);
assert.equal((source.match(/^  let /gm)||[]).length,288);assert.equal((result.match(/^  let /gm)||[]).length,275);
assert.ok(/^  let editSelectionPositionUi = null;/m.test(result));
fs.writeFileSync('assets/app/js/app.js',result);
fs.writeFileSync('out/test-artifacts/stage3/selection/binding-inventory.json',JSON.stringify({baseCommit:base,group:'editSelection*',inventory,cacheBindings:13,cacheInventoryPlusHelperCount:14,cacheInventoryDefinition:'13 cache bindings plus the existing helper; not an extraction dependency interface.',newControllers:0,extractionDependencyInterface:null,extractionDependencyLimitApplicable:false,letBefore:288,letAfter:275,conversionNetAppLines:0,entireAppExactAfterApprovedConversions:true},null,2)+'\n');
console.log(JSON.stringify({base,bindings:13,references:inventory.reduce((s,e)=>s+e.referenceCount,0),letAfter:275,netAppLines:0}));
