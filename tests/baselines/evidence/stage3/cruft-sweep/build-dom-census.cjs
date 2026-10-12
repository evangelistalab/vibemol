const fs=require('node:fs'),assert=require('node:assert/strict');
const {parse}=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/parser');
const traverse=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/traverse').default;
const root='out/test-artifacts/stage3/colors/pre-group',source=fs.readFileSync(root+'/assets/app/js/app.js','utf8');
const ast=parse(source);let outer;
traverse(ast,{FunctionExpression(p){if(p.parent.type==='CallExpression'&&p.node.start<10)outer=p;}});assert.ok(outer);
const queriedId=n=>n?.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='getElementById'&&n.arguments[0]?.type==='StringLiteral'?n.arguments[0].value:null;
const bindings=Object.entries(outer.scope.bindings).map(([name,b])=>{
 let id=queriedId(b.path.node.init),queryLine=id?b.path.node.loc.start.line:null;
 for(const v of b.constantViolations){const q=queriedId(v.node.right);if(q){if(id)assert.equal(id,q);id=q;queryLine=v.node.loc.start.line;}}
 return {name,declarationLine:b.identifier.loc.start.line,queriedId:id,queryLine,
   references:b.referencePaths.map(r=>({line:r.node.loc.start.line,function:r.getFunctionParent()?.node.id?.name||'(app/anonymous)',context:source.slice(Math.max(0,r.node.start-50),Math.min(source.length,r.node.end+100)).replace(/\n/g,' ')}))};
});
const expressions=bindings.map(x=>`${x.name}: ${x.name}`);
const marker='  // Keyboard shortcuts are handled by the mode-aware router defined above.';assert.equal(source.split(marker).length,2);
const instrumented=source.replace(marker,'  window.__domReferenceCensus = () => ({'+expressions.join(',')+'});\n'+marker);
fs.mkdirSync('out/test-artifacts/stage3/cruft-sweep',{recursive:true});fs.writeFileSync('out/test-artifacts/stage3/cruft-sweep/bindings.json',JSON.stringify(bindings,null,2)+'\n');fs.writeFileSync('out/test-artifacts/stage3/cruft-sweep/observational-app.js',instrumented);
console.log(JSON.stringify({moduleBindings:bindings.length,directIdCacheBindings:bindings.filter(x=>x.queriedId).length}));
