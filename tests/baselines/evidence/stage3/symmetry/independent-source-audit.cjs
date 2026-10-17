const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {parse}=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/parser');
const traverse=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/traverse').default;
const [base,out]=process.argv.slice(2),file='assets/app/js/app.js';
const before=cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8',maxBuffer:10*1024*1024}),after=fs.readFileSync(file,'utf8');
const entries=JSON.parse(fs.readFileSync('tests/baselines/evidence/stage3/lookup-site-audit.json')).wiringSites.flatMap(g=>g.entries).filter(e=>e.group==='remainder'&&e.kind.startsWith('DOM cache'));
assert.equal(entries.length,10);const names=entries.map(e=>e.name),canonical='displayWindowAdaptiveMenuEl';
const targets=new Map(names.map(n=>[n,`els.${n==='canvasAdaptiveMenuEl'?canonical:n}`]));targets.set(canonical,'els.'+canonical);
const references=[],declarations=[],queries=[],functions=[],registrations=[];let aliasAssignment;
traverse(parse(before),{AssignmentExpression(p){if(p.node.left.name==='canvasAdaptiveMenuEl'){assert.equal(p.node.right.name,canonical);assert.ok(!aliasAssignment);aliasAssignment=p.node;}}});
assert.ok(aliasAssignment);
traverse(parse(before),{
 VariableDeclarator(p){
  const name=p.node.id.name;if(!targets.has(name))return;
  const binding=p.scope.getBinding(name);assert.ok(binding);assert.equal(p.parent.declarations.length,1);
  for(const r of binding.referencePaths){
   if(name===canonical&&r.node.start>=aliasAssignment.start&&r.node.end<=aliasAssignment.end)continue;
   references.push({start:r.node.start,end:r.node.end,value:r.parent.type==='ObjectProperty'&&r.parent.shorthand?name+': '+targets.get(name):targets.get(name)});
  }
  const entry=entries.find(e=>e.name===name);
  if(entry){assert.equal(p.parent.kind,'let');assert.equal(p.node.init.type,'NullLiteral');entry.declarationLine=p.node.loc.start.line;declarations.push({start:before.lastIndexOf('\n',p.parent.start)+1,end:before.indexOf('\n',p.parent.end)+1,value:''});}
  else{
   assert.equal(name,canonical);assert.equal(p.parent.kind,'const');assert.equal(binding.constantViolations.length,0);
   assert.equal(p.node.init.callee.object.name,'document');assert.equal(p.node.init.callee.property.name,'getElementById');assert.equal(p.node.init.arguments[0].value,'displayWindowAdaptiveMenu');
   queries.push({name,start:p.parent.start,end:p.parent.end,value:"els.displayWindowAdaptiveMenuEl = document.getElementById('displayWindowAdaptiveMenu');"});
   const alias=entries.find(e=>e.name==='canvasAdaptiveMenuEl');alias.queryLine=p.node.loc.start.line;alias.singleCanonicalDataField=true;
  }
 },
 AssignmentExpression(p){
  const entry=entries.find(e=>e.name===p.node.left.name);if(!entry)return;
  entry.assignmentLine=p.node.loc.start.line;
  if(entry.name==='canvasAdaptiveMenuEl'){
   queries.push({name:entry.name,start:p.parent.start,end:p.parent.end,value:'// canvasAdaptiveMenuEl shares the canonical displayWindowAdaptiveMenuEl cache.'});return;
  }
  assert.equal(p.node.right.callee.object.name,'document');assert.equal(p.node.right.callee.property.name,'getElementById');assert.equal(p.node.right.arguments[0].value,entry.id);
  entry.queryLine=p.node.loc.start.line;
  queries.push({name:entry.name,start:p.parent.start,end:p.parent.end,value:`cacheElement('${entry.name}', '${entry.id}');`});
 },
 FunctionDeclaration(p){functions.push(p.node);}
});
assert.equal(declarations.length,10);assert.equal(queries.length,11);
const marker='  const els = {\n',start=before.indexOf(marker)+marker.length;assert.equal(before.split(marker).length,2);
const edits=[...references,...declarations,...queries,{start,end:start,value:names.map(n=>`    ${n==='canvasAdaptiveMenuEl'?canonical:n}: null,\n`).join('')}].sort((a,b)=>b.start-a.start);
for(let i=1;i<edits.length;i++)assert.ok(edits[i].end<=edits[i-1].start);
let expected=before;for(const e of edits)expected=expected.slice(0,e.start)+e.value+expected.slice(e.end);
assert.equal(after,expected,'Unexpected production edit outside exact Symmetry/alias transformations');
const newFunctions=[];let cacheBinding;const shadowed=[],afterAst=parse(after);
traverse(afterAst,{FunctionDeclaration(p){newFunctions.push(p.node);},VariableDeclarator(p){if(p.node.id.name==='els'&&p.node.init?.type==='ObjectExpression'&&p.getFunctionParent()?.node.start<10)cacheBinding=p.scope.getBinding('els');},CallExpression(p){
 if(p.node.callee.name!=='cacheElement')return;
 const entry=entries.find(e=>e.name===p.node.arguments[0]?.value);if(!entry)return;
 assert.notEqual(entry.name,'canvasAdaptiveMenuEl');assert.equal(p.node.arguments[1].value,entry.id);assert.equal(p.node.loc.start.line,entry.queryLine);
 entry.registrationLine=p.node.loc.start.line;entry.registeredAtOriginalQueryPoint=true;registrations.push(entry.name);
}});
assert.equal(newFunctions.length,functions.length);assert.deepEqual(registrations,names.filter(n=>n!=='canvasAdaptiveMenuEl'));
const affected=[];
functions.forEach((old,i)=>{
 const current=newFunctions[i];assert.equal(old.id.name,current.id.name);let body=before.slice(old.start,old.end);
 const refs=references.filter(r=>r.start>=old.start&&r.end<=old.end).sort((a,b)=>b.start-a.start);
 for(const r of refs)body=body.slice(0,r.start-old.start)+r.value+body.slice(r.end-old.start);
 assert.equal(after.slice(current.start,current.end),body,old.id.name);
 if(refs.length)affected.push({name:old.id.name,beforeLine:old.loc.start.line,afterLine:current.loc.start.line});
});
const fields=new Set([...targets.values()].map(t=>t.split('.')[1]));let canonicalQueries=0,canonicalField;
assert.ok(cacheBinding);
traverse(afterAst,{MemberExpression(p){if(p.node.object.name==='els'&&fields.has(p.node.property.name)&&p.scope.getBinding('els')!==cacheBinding)shadowed.push(p.node.loc.start.line);},AssignmentExpression(p){
 if(p.node.left.object?.name==='els'&&p.node.left.property?.name===canonical){assert.equal(p.node.right.type,'CallExpression');assert.equal(p.node.right.callee.object.name,'document');assert.equal(p.node.right.arguments[0].value,'displayWindowAdaptiveMenu');canonicalQueries++;canonicalField=p.node;}
},ObjectProperty(p){if(p.node.key.name==='canvasAdaptiveMenuEl'&&p.node.value.type==='MemberExpression'){assert.equal(p.node.value.object.name,'els');assert.equal(p.node.value.property.name,canonical);}}});
assert.equal(canonicalQueries,1);assert.equal(canonicalField.loc.start.line,entries.find(e=>e.name==='canvasAdaptiveMenuEl').queryLine);
assert.deepEqual(shadowed,[]);assert.ok(!/cacheElement\('(?:canvasAdaptiveMenuEl|displayWindowAdaptiveMenuEl)'/.test(after));
const metrics=s=>({lines:s.split('\n').length-1,functionDeclarations:(s.match(/^  (?:async )?function\b/gm)||[]).length,letDeclarations:(s.match(/^  let /gm)||[]).length,constDeclarations:(s.match(/^  const /gm)||[]).length,sha256:crypto.createHash('sha256').update(s).digest('hex')});
const report={group:'symmetry/shared launcher',baseCommit:base,inventory:entries,functionsWhoseBodiesReferenceTheConvertedCache:affected,allExistingFunctionDeclarationsExactAfterLexicalReferenceSubstitution:true,entireAppExactAfterApprovedConversions:true,lexicalReferenceSubstitutions:references.length,auditedFunctionDeclarations:functions.length,shadowedElsReferences:shadowed,metrics:{before:metrics(before),after:metrics(after)},controllerLetsRetained:/^  let measurementsPanel = null;/m.test(after)&&/^  let calculationsPanel = null,/m.test(after),focusStateLetRetained:/^  let helpRestoreFocusEl = null;/m.test(after),queryRegistrationAtOriginalWiringSites:true,singleCanonicalAliasQuery:true,canonicalPlainDataFieldPreservesSnapshot:true,independentAliasGetterCount:0,conversionNetAppLines:0};
assert.equal(report.metrics.before.lines,report.metrics.after.lines);assert.equal(report.metrics.before.letDeclarations,275);assert.equal(report.metrics.after.letDeclarations,265);
fs.mkdirSync(require('node:path').dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({group:report.group,functions:functions.length,affected:affected.length,lexicalReferences:references.length,metrics:report.metrics,singleCanonicalAliasQuery:true}));
