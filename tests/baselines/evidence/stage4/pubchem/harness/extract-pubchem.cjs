const fs=require('fs'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert/strict');
const babel='/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/';
const parser=require(babel+'parser'),traverse=require(babel+'traverse').default;
const root='/Users/fevange/Source/vibemol/out/test-artifacts/stage4/pubchem/source-worktree';
const base='6c583556bcc84bff9442602a7dd8aed056b4a660';
const source=cp.execFileSync('git',['-C',root,'show',base+':assets/app/js/app.js'],{encoding:'utf8',maxBuffer:10000000});
assert.equal(fs.readFileSync(root+'/assets/app/js/app.js','utf8'),source,'Run converter exactly once on the frozen base');
const audit=JSON.parse(fs.readFileSync('/Users/fevange/Source/vibemol/out/test-artifacts/stage4/pubchem/preflight/dependency-audit.json'));
assert.equal(audit.projectedCount,13);
const ast=parser.parse(source,{sourceType:'script'}),fns=new Set(audit.functions.map(f=>f.name));
const states=['PUBCHEM_AUTOCOMPLETE_LIMIT','pubchemBusy','pubchemSuggestTimer','pubchemSuggestToken','pubchemHas3DByNameCache','pubchemHas3DByCidCache'];
const dom=new Set(audit.domFieldsGroupedAsExistingEls),edits=[],moved=[],stateNodes={},substitutions=[];
const lineStart=i=>source.lastIndexOf('\n',i-1)+1;
function transform(start,end){
 const list=[];
 traverse(ast,{ReferencedIdentifier(p){
  const n=p.node;
  if(n.start<start||n.end>end||!dom.has(n.name))return;
  const binding=p.scope.getBinding(n.name);
  if(!binding||binding.path.node.start<0)return;
  list.push({start:n.start,end:n.end,text:'els.'+n.name});
 },AssignmentExpression(p){
  const n=p.node;
  if(n.start<start||n.end>end||n.left.type!=='Identifier')return;
  if(n.left.name==='volumes')list.push({start:n.start,end:n.end,text:'setVolumes('+source.slice(n.right.start,n.right.end)+')'});
  if(n.left.name==='currentIndex')list.push({start:n.start,end:n.end,text:'setCurrentIndex('+source.slice(n.right.start,n.right.end)+')'});
 }});
 let text=source.slice(start,end);
 for(const e of list.sort((a,b)=>b.start-a.start))text=text.slice(0,e.start-start)+e.text+text.slice(e.end-start);
 substitutions.push(...list);return text;
}
traverse(ast,{FunctionDeclaration(p){
 const n=p.node;if(!fns.has(n.id.name))return;
 const comments=(n.leadingComments||[]).filter(c=>c.type==='CommentBlock'&&/^\*/.test(c.value));
 const start=lineStart(comments.length?comments.at(-1).start:n.start),end=n.end;
 moved.push({name:n.id.name,start,end,text:transform(start,end)});
 if(n.id.name==='updatePubChemMetadataPanel')edits.push({start:n.start,end,text:'function updatePubChemMetadataPanel(record) {\n    return pubchemController.updatePubChemMetadataPanel(record);\n  }'});
 else edits.push({start,end:end+1,text:''});
},VariableDeclaration(p){
 const n=p.node;if(n.declarations.length!==1||n.declarations[0].id.type!=='Identifier')return;
 const name=n.declarations[0].id.name;
 if(dom.has(name)){
  const d=n.declarations[0];edits.push({start:n.start,end:n.end,text:'els.'+name+' = '+source.slice(d.init.start,d.init.end)+';'});
 }
 if(states.includes(name)||name==='PUBCHEM_SEARCH_ICON_SVG')stateNodes[name]=n;
}});
assert.equal(moved.length,19);
const first=stateNodes.PUBCHEM_AUTOCOMPLETE_LIMIT.start,last=stateNodes.pubchemHas3DByCidCache.end;
const deps=audit.projectedExplicitDeps.map(name=>name==='setVolumes'?'    setVolumes: value => { volumes = value; },':name==='setCurrentIndex'?'    setCurrentIndex: value => { currentIndex = value; },':'    '+name+',').join('\n');
edits.push({start:lineStart(first),end:last,text:'  const pubchemController = createPubChemController({\n'+deps+'\n  });'});
const icon=stateNodes.PUBCHEM_SEARCH_ICON_SVG;edits.push({start:lineStart(icon.start),end:icon.end+1,text:''});
const wiringStart=source.indexOf('  if (pubchemQueryInput) {\n    pubchemQueryInput.addEventListener'),wiringEnd=source.indexOf('\n',source.indexOf("  if (pubchemLoadBtn) pubchemLoadBtn.onclick =",wiringStart));
assert(wiringStart>0&&wiringEnd>wiringStart);
const wiring=transform(wiringStart,wiringEnd);
edits.push({start:wiringStart,end:wiringEnd,text:'  pubchemController.bindControls();'});
const anchor='  const { createPeriodicTableController } = window.VibeMolPeriodicTable || {};';
assert(source.includes(anchor));
edits.push({start:source.indexOf(anchor)+anchor.length,end:source.indexOf(anchor)+anchor.length,text:"\n  const { createPubChemController } = window.VibeMolPubChem || {};\n  if (typeof createPubChemController !== 'function') {\n    throw new Error('VibeMolPubChem is not loaded. Ensure assets/app/js/pubchem.js is included before assets/app/js/app.js.');\n  }"});
let app=source;
const sorted=edits.sort((a,b)=>b.start-a.start);
for(let i=0;i<sorted.length;i++){
 const e=sorted[i];if(i)assert(e.end<=sorted[i-1].start,'Overlapping extraction edits');
 app=app.slice(0,e.start)+e.text+app.slice(e.end);
}
const indent=text=>text.split('\n').map(line=>'  '+line).join('\n');
const declarations=[source.slice(lineStart(icon.start),icon.end),source.slice(lineStart(first),last)].map(indent).join('\n\n');
const functions=moved.sort((a,b)=>a.start-b.start).map(f=>indent(f.text)).join('\n\n');
const moduleSource="(function (global) {\n  'use strict';\n\n  function createPubChemController(deps) {\n    const {\n"+audit.projectedExplicitDeps.map(x=>'      '+x+',').join('\n')+'\n    } = deps;\n\n'+declarations+'\n\n'+functions+'\n\n    function bindControls() {\n'+indent(indent(wiring))+'\n    }\n\n    return Object.freeze({ updatePubChemMetadataPanel, bindControls });\n  }\n\n  global.VibeMolPubChem = Object.freeze({ createPubChemController });\n})(typeof window !== \'undefined\' ? window : globalThis);\n';
fs.writeFileSync(root+'/assets/app/js/app.js',app);
fs.writeFileSync(root+'/assets/app/js/pubchem.js',moduleSource);
const plan={base,projectedCount:13,functions:moved.map(({name,start,end})=>({name,start,end})),edits:sorted,substitutions,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),appSha256:crypto.createHash('sha256').update(app).digest('hex'),moduleSha256:crypto.createHash('sha256').update(moduleSource).digest('hex')};
fs.mkdirSync('/Users/fevange/Source/vibemol/out/test-artifacts/stage4/pubchem/conversion',{recursive:true});
fs.writeFileSync('/Users/fevange/Source/vibemol/out/test-artifacts/stage4/pubchem/conversion/plan.json',JSON.stringify(plan,null,2)+'\n');
console.log(JSON.stringify({functions:moved.length,deps:13,appSha256:plan.appSha256,moduleSha256:plan.moduleSha256,letBefore:(source.match(/^  let /gm)||[]).length,letAfter:(app.match(/^  let /gm)||[]).length}));
