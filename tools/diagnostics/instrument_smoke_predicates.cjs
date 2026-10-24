const fs=require('fs'),base=(process.env.VIBEMOL_BABEL_ROOT || '/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel')+'/';
const parser=require(base+'parser'),traverse=require(base+'traverse').default,t=require(base+'types'),generate=require(base+'generator').default;
const sources=JSON.parse(fs.readFileSync(process.argv[2])),out={};
for(const source of sources){
 const ast=parser.parse('const __predicate=('+source+');');
 traverse(ast,{BinaryExpression:{exit(path){
  if(!['===','!==','==','!=','>','>=','<','<='].includes(path.node.operator))return;
  const n=path.node,label=generate(n).code;
  path.replaceWith(t.callExpression(t.identifier('__compare'),[t.stringLiteral(label),n.left,n.right,t.stringLiteral(n.operator)]));path.skip();
 }}});
 const fn=generate(ast.program.body[0].declarations[0].init).code;
 out[source]=`(...args)=>{
  const rows=[];
  const value=x=>{if(x===undefined)return {type:'undefined'};if(x===null||typeof x!=='object')return x;
    if(x instanceof Element){const r=x.getBoundingClientRect();return {tag:x.tagName,id:x.id,hidden:x.hidden,ariaHidden:x.getAttribute('aria-hidden'),x:r.x,y:r.y,width:r.width,height:r.height};}
    try{return JSON.parse(JSON.stringify(x));}catch{return String(x);}};
  const __compare=(label,left,right,op)=>{let result;switch(op){
    case '===':result=left===right;break;case '!==':result=left!==right;break;
    case '==':result=left==right;break;case '!=':result=left!=right;break;
    case '>':result=left>right;break;case '>=':result=left>=right;break;
    case '<':result=left<right;break;case '<=':result=left<=right;break;}
    if(rows.length<300)rows.push({expression:label,left:value(left),right:value(right),operator:op,actual:result});return result;};
  let actual,error;try{actual=(${fn})(...args);return actual;}catch(e){error=String(e);throw e;}
  finally{window.__smokeRegionLastWait={actual:!!actual,returned:value(actual),expected:true,comparands:rows,error,at:performance.now()};}
 }`;
}
fs.writeFileSync(process.argv[3],JSON.stringify(out,null,2)+'\n');
console.log('Instrumented '+sources.length+' predicates; comparison operators, operand evaluation and short-circuiting preserved');
