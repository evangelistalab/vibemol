#!/usr/bin/env node
'use strict';
// Private policy extraction uses the same pinned parser as construction audit.
// No production export, runtime fetch or duplicate policy copy is introduced.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const parser=require(process.env.VIBEMOL_BABEL_ROOT?path.join(process.env.VIBEMOL_BABEL_ROOT,'parser'):'@babel/parser');
const traverse=require(process.env.VIBEMOL_BABEL_ROOT?path.join(process.env.VIBEMOL_BABEL_ROOT,'traverse'):'@babel/traverse').default;
const root=path.resolve(__dirname,'..');
function extract(file,names){
 const source=fs.readFileSync(path.join(root,file),'utf8'),ast=parser.parse(source,{sourceType:'script'}),found={};
 function walk(node){
  if(!node||typeof node!=='object')return;
  if((node.type==='VariableDeclarator'||node.type==='FunctionDeclaration')&&names.includes(node.id?.name)){
   const name=node.id.name;assert(!found[name],'Duplicate private declaration '+name);
   found[name]=node.type==='VariableDeclarator'?`const ${name} = ${source.slice(node.init.start,node.init.end)};`:source.slice(node.start,node.end);
  }
  for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}
 }
 walk(ast);for(const name of names)assert(found[name],'Missing private declaration '+name);
 return names.map(name=>found[name]).join('\n');
}
const source=extract('assets/app/js/edit-tool-ui.js',['EDIT_ESCAPE_LADDER','escapeAction'])+'\n'+extract('assets/app/js/app.js',['ESCAPE_LADDER','resolveEscapeDecision','executeEscapeDecision']);
const policy=vm.runInNewContext(source+'\n({levels:ESCAPE_LADDER,edit:EDIT_ESCAPE_LADDER,choose:resolveEscapeDecision,execute:executeEscapeDecision,editAction:escapeAction})',{Object,Error});
const plain=x=>JSON.parse(JSON.stringify(x));
const levels=plain(policy.levels),edit=plain(policy.edit);
assert.deepEqual(levels.map(x=>[x.level,x.id]),[[1,'capture'],[2,'menu'],[3,'draft'],[4,'edit'],[5,'container'],[6,'axis'],[7,'mode']]);
assert.deepEqual(edit.map(x=>[x.id,x.when]),[['cancel','placing'],['transform','build'],['clear','selected']]);
assert.equal(levels[3].subLadder,'EDIT_ESCAPE_LADDER');
const modes=['display','measurement','edit','calculations'];
const focusContract=JSON.parse(fs.readFileSync(path.join(root,'tests/baselines/escape-focus-fixtures.json'),'utf8'));
const focusFixtures=focusContract.fixtures,origins=[...new Set(focusFixtures.map(f=>f.origin))];
assert.equal(focusFixtures.length,8);assert.deepEqual([...new Set(focusFixtures.map(f=>f.kind))].sort(),focusContract.categories.slice().sort());
assert.equal(new Set(focusFixtures.map(f=>f.id)).size,8);
const ids=levels.flatMap(r=>r.actions.map(x=>typeof x==='string'?x:x.id));assert.equal(new Set(ids).size,ids.length);
// Every offered action must be declared; every declaration must have an owner.
const providers=new Map();
function scan(file){
 const ast=parser.parse(fs.readFileSync(file,'utf8'),{sourceType:'script'});
 function walk(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&node.callee.property.name==='offer'&&node.arguments[0]?.type==='StringLiteral'){
   const id=node.arguments[0].value;assert(ids.includes(id),'Undeclared Escape action '+id);
   if(!providers.has(id))providers.set(id,[]);providers.get(id).push(path.relative(root,file));
  }
  for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}
 }
 walk(ast);
}
for(const dir of ['assets/app/js','src/components'])for(const name of fs.readdirSync(path.join(root,dir)))if(name.endsWith('.js'))scan(path.join(root,dir,name));
assert.deepEqual([...providers.keys()].sort(),ids.slice().sort(),'Escape action catalog/owner composition differs');
assert([...providers.values()].every(files=>files.length===1),'Escape action has multiple owners');

let matrixCases=0,declines=0,actions=0,completions=0;
const matrix=[];
// Independent contract eligibility oracle, not the policy's own filter code.
function expected(row,mode,fixture){
 const {origin}=fixture;
 if(row.level===3)return !!fixture.draft || origin==='control';
 if(row.level===4)return mode==='edit'&&origin!=='field';
 if(row.level===6)return origin==='axis';
 if(row.level===7)return origin==='control'||(['scene','filter'].includes(origin)&&['measurement','calculations'].includes(mode));
 return true;
}
function actionId(row,mode,fixture){
 const {origin}=fixture;
 if(row.level===3)return fixture.draft || (origin==='control'?'activation.cancel':null);
 if(row.level===7)return origin==='control'?'mode.outliner-reset':mode==='measurement'?'mode.measure-clear':mode==='calculations'?'mode.calculations-exit':'mode.outliner-reset';
 return typeof row.actions[0]==='string'?row.actions[0]:row.actions[0].id;
}
for(const row of levels)for(const mode of modes)for(const fixture of focusFixtures){
 const {origin}=fixture;
 const id=actionId(row,mode,fixture),called=[],focused=[];
 const context={mode,origin,actions:id?{[id]:{applicable:true,detail:row.level===4?'clear':null,run:()=>{called.push(id);}}}:{}};
 if(row.level===4&&origin==='axis')context.actions['axis.focus-canvas']={applicable:true,run:()=>focused.push('canvas')};
 const chosen=policy.choose(context);const applies=expected(row,mode,fixture);
 // An inapplicable Edit row may still legitimately fall through to axis focus.
 const axisFallback=!applies&&row.level===4&&origin==='axis';
 assert.equal(chosen?.level??null,applies?row.level:axisFallback?6:null,JSON.stringify({row:row.level,mode,origin}));
 policy.execute(context,chosen);
 assert.equal(called.length,applies?1:0);assert.equal(focused.length,(applies&&row.level===4&&origin==='axis')||axisFallback?1:0);
 matrix.push({level:row.level,mode,focus:fixture.id,focusKind:fixture.kind,origin,winner:chosen?.level??null,actions:applies?called.length:axisFallback?focused.length:0});
 matrixCases++;actions+=called.length;completions+=focused.length;if(!chosen)declines++;
}
// Every Edit sub-branch across every mode/origin, including empty state.
let editCases=0;const editMatrix=[];
for(const mode of modes)for(const fixture of focusFixtures)for(let flags=0;flags<32;flags++){
 const {origin}=fixture;
 const targets={atoms:!!(flags&1),transform:!!(flags&2),bondCenter:!!(flags&4)};
 const state={placing:!!(flags&16),build:!!(flags&8),selected:Object.values(targets).some(Boolean)};
 const desired=state.placing?'cancel':state.build?'transform':state.selected?'clear':null;
 assert.equal(policy.editAction(state),desired);
 const calls=[],focus=[],drafts=[];const context={mode,origin,actions:{'edit.perform':{applicable:!!desired,detail:desired,run:()=>calls.push(desired)}}};
 if(fixture.draft)context.actions[fixture.draft]={applicable:true,run:()=>drafts.push(fixture.draft)};
 if(origin==='axis')context.actions['axis.focus-canvas']={applicable:true,run:()=>focus.push('canvas')};
 const decision=policy.choose(context);policy.execute(context,decision);
 const eligible=mode==='edit'&&origin!=='field'&&!fixture.draft&&!!desired;
 assert.equal(calls.length,eligible?1:0);
 assert.equal(decision?.level??null,fixture.draft?3:eligible?4:origin==='axis'?6:null);
 assert.equal(drafts.length,fixture.draft?1:0);
 editMatrix.push({mode,focus:fixture.id,focusKind:fixture.kind,origin,placing:state.placing,build:state.build,targets,winner:decision?.level??null,action:decision?.action??null});
 editCases++;
}
// Deep state is read afresh on every press. No cached decision or carried index.
function sequence(initial,n){
 const state={...initial},events=[];
 for(let press=0;press<n;press++){
  const context={mode:'edit',origin:'scene',actions:{
   'help.close':{applicable:state.modal,run:()=>{state.modal=false;}},
   'menu.panels':{applicable:state.menu,run:()=>{state.menu=false;}},
   'edit.perform':{applicable:state.placing||state.build||state.selected,detail:policy.editAction(state),run:()=>{const action=policy.editAction(state);if(action==='cancel')state.placing=false;else if(action==='transform')state.build=false;else state.selected=false;}}
  }};
  const chosen=policy.choose(context);assert(chosen);events.push([chosen.level,chosen.detail]);policy.execute(context,chosen);
 }
 return events;
}
assert.deepEqual(plain(sequence({modal:true,menu:true,placing:true,build:true,selected:true},2)),[[1,null],[2,null]]);
assert.deepEqual(plain(sequence({modal:true,menu:true,placing:true,build:true,selected:true},3)),[[1,null],[2,null],[4,'cancel']]);
assert.deepEqual(plain(sequence({modal:false,menu:false,placing:true,build:true,selected:true},3)),[[4,'cancel'],[4,'transform'],[4,'clear']]);
// Empty Edit declines to Focus, then to axis, then leaves ordinary scene unclaimed.
for(const mode of modes){
 let calls=[];const context={mode,origin:'axis',actions:{'edit.perform':{applicable:false,run:()=>assert.fail('Inapplicable Edit action')},'focus.exit':{applicable:true,run:()=>calls.push('focus')},'axis.focus-canvas':{applicable:true,run:()=>calls.push('axis')}}};
 assert.equal(policy.choose(context).level,5);policy.execute(context,policy.choose(context));assert.deepEqual(calls,['focus']);
 context.actions['focus.exit'].applicable=false;assert.equal(policy.choose(context).level,6);
}
assert.equal(policy.choose({mode:'edit',origin:'scene',actions:{}}),null);
assert.equal(policy.choose({mode:'display',origin:'scene',actions:{}}),null);
// Throw/false is failure, not decline. Neither invokes a lower action/completion.
for(const failure of [()=>{throw new Error('action failed');},()=>false]){
 const lower=[];const context={mode:'edit',origin:'axis',actions:{'help.close':{applicable:true,run:failure},'axis.focus-canvas':{applicable:true,run:()=>lower.push('axis')}}};
 assert.throws(()=>policy.execute(context,policy.choose(context)));assert.equal(lower.length,0);
}
function describeAction(item){return typeof item==='string'?item:item.id+(item.description?' — '+item.description:'')+(item.modes?' ['+item.modes.join(', ')+']':'')+(item.origins?' ['+item.origins.join(', ')+']':'');}
const table=['<!-- escape-ladder:start -->','| Level | Consumer | Applicability/actions in priority order |','| --- | --- | --- |',...levels.map(r=>`| ${r.level} | ${r.description} | ${r.actions.map(describeAction).join(' → ')}${r.modes?' · modes: '+r.modes.join(', '):''}${r.origins?' · origins: '+r.origins.join(', '):''} |`),'','| Edit branch | Required current state | Action |','| --- | --- | --- |',...edit.map(r=>`| ${r.id} | ${r.when} | ${r.description} |`),'<!-- escape-ladder:end -->'].join('\n');
const doc=path.join(root,'docs/maintenance/axis-escape-contract.md');let text=fs.readFileSync(doc,'utf8');
if(process.argv.includes('--write')){
 if(!text.includes('<!-- escape-ladder:start -->')){
  const start=text.indexOf('| Priority |'),end=text.indexOf('## Regression assertions',start);assert(start>=0&&end>start);
  text=text.slice(0,start)+table+'\n\n'+text.slice(end);
 }else text=text.replace(/<!-- escape-ladder:start -->[\s\S]*?<!-- escape-ladder:end -->/,table);
 fs.writeFileSync(doc,text);
}else assert(text.includes(table),'Escape contract document differs from canonical data; run checker --write');
assert(matrix.every(row=>row.actions===(row.winner===null?0:1)),'One logical action for each winner; zero for decline');
const hashes=Object.fromEntries(['assets/app/js/app.js','assets/app/js/edit-tool-ui.js','tools/check-escape-contract.cjs'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
const dependencies={};
const helpers=['resolveEscapeDecision','executeEscapeDecision','hasVisibleEscapeModalTarget','offerModalEscapes','offerEditEscape','offerLegacyPanelEscapes','offerModeEscapes','offerOutlinerEscape','collectEscapeContext','handleApplicationEscape'];
traverse(parser.parse(fs.readFileSync(path.join(root,'assets/app/js/app.js'),'utf8'),{sourceType:'script'}),{
 FunctionDeclaration(p){
  if(!helpers.includes(p.node.id.name))return;
  const scope=p.parentPath.scope,reads=new Set(),modules=new Set();
  p.traverse({ReferencedIdentifier(ref){const name=ref.node.name,binding=ref.scope.getBinding(name);if(binding&&binding.scope===scope&&name!==p.node.id.name)reads.add(name);},
   MemberExpression(ref){if(ref.node.object.name==='window'&&/^VibeMol/.test(ref.node.property.name||''))modules.add('window.'+ref.node.property.name);}});
  const inputCount=reads.size+modules.size+p.node.params.length;
  dependencies[p.node.id.name]={appClosureReads:[...reads].sort(),globalModuleReads:[...modules].sort(),dataParameters:p.node.params.length,totalInputs:inputCount};
  assert(inputCount<15,'Escape helper exceeds dependency limit: '+p.node.id.name+' '+inputCount);
 }
});
assert.equal(Object.keys(dependencies).length,helpers.length,'Complete helper dependency inventory');
assert.equal(matrixCases,224);assert.equal(editCases,1024);
const report={passed:true,hashes,dependencies,focusFixtures,focusCategories:focusContract.categories,selectionTargetKinds:focusContract.selectionTargets,totalMatrixCases:matrixCases+editCases,previousMatrixCases:300,actionProviders:Object.fromEntries(providers),logicalActions:matrixCases-declines,levels:levels.length,editBranches:edit.length,modes,origins,matrixCases,editCases,declines,actions,completions,repeatedPressSequences:3,failureDoesNotFallThrough:true,matrix,editMatrix};
const target=process.env.VIBEMOL_ESCAPE_CONTRACT_REPORT;if(target){fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');}
console.log('[escape-contract] '+JSON.stringify({...report,matrix:undefined,editMatrix:undefined}));
