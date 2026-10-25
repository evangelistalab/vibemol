#!/usr/bin/env node
'use strict';
// Independent geometry cases for the private local rule; no new runtime export.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const parser=require(process.env.VIBEMOL_BABEL_ROOT?path.join(process.env.VIBEMOL_BABEL_ROOT,'parser'):'@babel/parser');
const traverse=require(process.env.VIBEMOL_BABEL_ROOT?path.join(process.env.VIBEMOL_BABEL_ROOT,'traverse'):'@babel/traverse').default;
const source=fs.readFileSync(path.join(__dirname,'../assets/app/js/app.js'),'utf8');
const name='positionSelectionCueOutsideCoordinates';let code,inputs;
traverse(parser.parse(source,{sourceType:'script'}),{FunctionDeclaration(p){
 if(p.node.id.name!==name)return;
 assert(!code,'Duplicate local placement owner');code=source.slice(p.node.start,p.node.end);
 const scope=p.parentPath.scope,closure=new Set();
 p.traverse({ReferencedIdentifier(ref){const binding=ref.scope.getBinding(ref.node.name);if(binding&&binding.scope===scope&&ref.node.name!==name)closure.add(ref.node.name);}});
 inputs={closure:[...closure].sort(),parameters:p.node.params.map(p=>p.name)};
}});
assert(code,'Missing local placement rule');assert.deepEqual(inputs.closure,['els']);
assert.equal(inputs.parameters.length,7);assert(inputs.closure.length+inputs.parameters.length<15);
const context=vm.createContext({els:{coordsPanelEl:null},getComputedStyle:()=>({visibility:'visible'})});
vm.runInContext(code+';globalThis.choose='+name+';',context);
const plain=x=>JSON.parse(JSON.stringify(x));const cases=[];
function run(label,args,panel,expected){
 context.els.coordsPanelEl=panel;
 const actual=plain(context.choose(...args));
 console.log('[coordinates-placement] '+JSON.stringify({label,args,actual,expected}));
 assert.deepEqual(actual,expected,label);cases.push({label,args,actual,expected});
}
const panel=(x,y,width,height,open=true)=>({getAttribute:()=>open?'false':'true',getBoundingClientRect:()=>({left:x,top:y,width,height,right:x+width,bottom:y+height})});
const args=[908,73,280,155,312,1200,1000];
run('lookup not initialized: no early binding read',args,null,{left:908,top:73});
run('closed Coordinates',args,panel(766,68,422,260,false),{left:908,top:73});
run('clear preferred position',args,panel(312,500,422,260),{left:908,top:73});
run('legacy interception: nearest clear position is below',args,panel(766,68,422,260),{left:908,top:340});
run('left dock: only clear adjacent side is right',[500,73,280,155,312,1200,1000],panel(312,56,300,944),{left:624,top:73});
run('right dock: prefer clear left side',[1200,73,280,155,312,1512,1000],panel(1000,56,512,944),{left:708,top:73});
run('lower panel: clear position above',[908,800,280,155,312,1200,1000],panel(766,760,422,240),{left:908,top:593});
run('full obstruction: do not silently leave viewport',[12,73,280,155,12,390,450],panel(0,0,390,450),{left:12,top:73});
const report={passed:true,inputs,totalInputs:inputs.closure.length+inputs.parameters.length,cases};
const target=process.env.VIBEMOL_COORDINATES_PLACEMENT_REPORT;
if(target){fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');}
