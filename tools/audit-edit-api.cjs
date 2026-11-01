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
  const deps=new Set(),free=new Set(),draftCallbacks=new Set();
  fn.traverse({ReferencedIdentifier(p){
   if(p.node.name==='draft'&&p.parentPath.isMemberExpression()&&p.parent.object===p.node){
    const key=p.parent.computed?p.parent.property.value:p.parent.property.name;
    assert(['vol','minted','added','removed','groups','add','remove','bond','group','operation','nextAtomId'].includes(key),'Unreviewed draft member: '+key);
    if(['add','remove','bond','group','operation','nextAtomId'].includes(key))draftCallbacks.add('draft.'+key);
   }
   const binding=p.scope.getBinding(p.node.name);
   if(binding&&binding.scope!==fn.scope&&!binding.path.findParent(x=>x===fn))free.add(p.node.name);
   if(p.node.name==='deps'&&p.parentPath.isMemberExpression()&&p.parent.object===p.node&&p.parent.property.type==='Identifier')deps.add(p.parent.property.name);
  }});
  free.delete('deps');free.delete(name);
  const callbacks=[...draftCallbacks].sort().concat(name==='editApiRealizeIds'?['allocators.atom','allocators.group','allocators.op','bondId']:['editApiCall','editApiTestingResult'].includes(name)?['action']:[]);
  rows.push({name,count:deps.size+free.size+callbacks.length,deps:[...deps].sort(),closure:[...free].sort(),...(callbacks.length?{parameterCallbacks:callbacks}:{})});
 }});
 return rows;
}
function surface(source){
 const ast=parser.parse(source);let methods,wrappers=[],testing,retained;
 traverse(ast,{VariableDeclarator(p){if(p.node.id.name==='editProductApi')methods=p.node.init.arguments[0].properties.map(n=>n.key.name).sort();},
  AssignmentExpression(p){if(p.node.left.type==='MemberExpression'&&p.node.left.object.name==='window'&&p.node.left.property.name==='VibeMolTesting')testing=p.node.right.arguments[0];}});
 assert(testing&&methods,'Both public surfaces must be statically enumerable');
 for(const prop of testing.properties){
  if(prop.value.type==='ArrowFunctionExpression'&&prop.value.body.type==='CallExpression'&&prop.value.body.callee.name==='callEditApiTesting')wrappers.push(prop.key.name);
  if(prop.key.name==='performSelectionMoveDrag')retained=source.slice(prop.value.start,prop.value.end);
 }
 return {methods,wrappers:wrappers.sort(),testing:testing.properties.map(p=>p.key.name).sort(),retained};
}
if(require.main===module){
 const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'assets/app/js/app.js'),'utf8'),contract=JSON.parse(fs.readFileSync(path.join(root,'tests/baselines/edit-api.json')));
 const rows=inventory(source),actual=surface(source);
 assert.deepEqual(rows,contract.units,'Input inventory changed; re-cut and document before expanding a unit');
 assert(rows.every(r=>r.count<15),'Every private unit must remain under fifteen real inputs including bound helpers');
 assert.deepEqual(actual.methods,contract.methods);assert.deepEqual(actual.wrappers,contract.testing.wrappers);
 assert.equal(actual.wrappers.length,20);assert.equal(contract.testing.retired.length,7);
 for(const name of contract.testing.retired)assert(!actual.testing.includes(name),`Retired export returned: ${name}`);
 const crypto=require('node:crypto');assert.equal(crypto.createHash('sha256').update(actual.retained).digest('hex'),contract.testing.retainedNativeDrag.sha256,'Native drag coverage must remain unchanged pending separate approval');
 console.log(JSON.stringify({status:'passed',methods:actual.methods.length,wrappers:20,retired:7,retainedNativeDrag:true,units:rows.length,maxInputs:Math.max(...rows.map(r=>r.count))}));
}
module.exports={inventory,surface};
