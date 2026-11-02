#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const babel=name=>require(path.join(process.env.VIBEMOL_BABEL_ROOT,name));
const parser=babel('parser'),traverse=babel('traverse').default;
const files=['assets/app/js/forte2-format.js','assets/app/js/calculations-model.js','assets/app/js/calculations-panel.js','assets/app/js/app.js'];
const selected={
 'assets/app/js/calculations-model.js':['normalize','setOptions','validation','generate'],
 'assets/app/js/calculations-panel.js':['create'],
 'assets/app/js/app.js':['readForte2MinaoSnapshot']
};
function inventory(root){
 const rows=[];
 for(const file of files){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  traverse(parser.parse(source),{FunctionDeclaration(fn){
   const name=fn.node.id.name;if(selected[file]&&!selected[file].includes(name))return;
   const free=new Set(),deps=new Set(),callbacks=new Set(),services=new Set(),factoryInputs=new Set();
   fn.traverse({ReferencedIdentifier(p){
    const binding=p.scope.getBinding(p.node.name);
    if(p.node.name==='global'&&p.parentPath.isMemberExpression()&&p.parent.object===p.node&&p.parent.property.type==='Identifier')services.add('global.'+p.parent.property.name);
    if(binding&&binding.scope!==fn.scope&&!binding.path.findParent(x=>x===fn))free.add(p.node.name);
    if(p.node.name==='deps'&&p.parentPath.isMemberExpression()&&p.parent.object===p.node)deps.add(p.parent.property.name);
    if(binding?.kind==='param'&&binding.scope===fn.scope&&p.node.name!=='deps'&&name.startsWith('create')&&p.getFunctionParent()!==fn)factoryInputs.add(p.node.name);
    if(binding?.kind==='param'&&binding.scope===fn.scope&&p.parentPath.isCallExpression()&&p.parent.callee===p.node)callbacks.add(p.node.name);
   }});free.delete(name);free.delete('deps');if(services.size)free.delete('global');
   rows.push({file,name,count:free.size+deps.size+new Set([...callbacks,...factoryInputs]).size+services.size,factoryInputs:[...factoryInputs].sort(),services:[...services].sort(),closure:[...free].sort(),deps:[...deps].sort(),callbacks:[...callbacks].sort()});
  }});
 }
 return rows;
}
function audit(root=path.resolve(__dirname,'..')){
 const contract=JSON.parse(fs.readFileSync(path.join(root,'tests/baselines/forte2-export.json'))),rows=inventory(root);
 assert.deepEqual(rows,contract.units,'Forte2 input inventory changed; re-cut/review before expansion');assert(rows.every(r=>r.count<15),'Every unit must remain below 15 inputs');
 const hashes=Object.fromEntries(files.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
 return {status:'passed',units:rows,maxInputs:Math.max(...rows.map(r=>r.count)),hashes};
}
if(require.main===module){const r=audit(),i=process.argv.indexOf('--out');if(i>=0)fs.writeFileSync(process.argv[i+1],JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));}
module.exports={inventory,audit};
