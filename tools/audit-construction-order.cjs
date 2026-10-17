#!/usr/bin/env node
'use strict';

// Read-only, conservative inverse closure audit. npm packages are test tooling,
// never app dependencies. Set VIBEMOL_BABEL_ROOT to an installed @babel folder.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const babel = name => require(process.env.VIBEMOL_BABEL_ROOT
  ? path.join(process.env.VIBEMOL_BABEL_ROOT, name) : '@babel/' + name);
const parser = babel('parser'), traverse = babel('traverse').default;
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const parse = s => parser.parse(s, {sourceType: 'script'});
const text = (s, p) => s.slice(p.node.start, p.node.end);

function mainScope(ast) {
  let found, count=0;
  traverse(ast, {FunctionExpression(p) {
    if (p.parentPath.isCallExpression() && p.parentPath.parentPath.isExpressionStatement()
        && p.parentPath.parentPath.parentPath.isProgram()) { found = p; count++; }
  }});
  assert.equal(count,1,'Expected exactly one app/module IIFE');
  return found;
}

// A callback passed to another module, published API, getter or event handler
// may execute as soon as it escapes. Do NOT assume a constructor merely stores
// callbacks. This deliberately fails closed on an exposure before construction;
// a path-specific proof or different construction point is required to clear it.
const rootCache = new WeakMap();
const inertFactories = new Map();
function pureInitializer(n) {
  if(!n)return true;
  if(['Identifier','StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral','FunctionExpression','ArrowFunctionExpression'].includes(n.type))return true;
  if(n.type==='ObjectExpression')return n.properties.every(p=>p.type==='ObjectProperty'&&!p.computed&&pureInitializer(p.value));
  if(n.type==='ArrayExpression')return n.elements.every(pureInitializer);
  if(n.type==='NewExpression')return n.callee.type==='Identifier'&&['Map','Set'].includes(n.callee.name)&&n.arguments.length===0;
  return n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&!n.callee.computed&&n.callee.object.name==='Object'&&n.callee.property.name==='freeze'&&n.arguments.every(pureInitializer);
}
function inertFactoryProof(source) {
  const found=[];
  traverse(parse(source),{FunctionDeclaration(p){
    if(!/^create.*Controller$/.test(p.node.id.name))return;
    const eager=p.node.body.body.filter(n=>n.type!=='FunctionDeclaration');
    const safe=eager.every(n=>n.type==='VariableDeclaration'?n.declarations.every(d=>pureInitializer(d.init)):n.type==='ReturnStatement'&&pureInitializer(n.argument));
    if(safe)found.push({name:p.node.id.name,sha256:hash(source.slice(p.node.start,p.node.end)),eagerStatementCount:eager.length,
      proof:'Only dependency destructuring, literals, function values, empty Map/Set allocations and Object.freeze of returned method references execute. No input callback, DOM, network or registration is invoked.'});
  }});return found;
}

function activationRoots(fn, boundary) {
  if (!rootCache.has(boundary)) rootCache.set(boundary,new WeakMap());
  const memo=rootCache.get(boundary);
  if(memo.has(fn.node))return memo.get(fn.node);
  const queue=[{fn,path:[]}], seen=new Set(), roots=new Map();
  while(queue.length) {
    const item=queue.shift(), current=item.fn;
    if(seen.has(current.node))continue;
    seen.add(current.node);
    let binding;
    if(current.isFunctionDeclaration() && current.node.id) binding=current.parentPath.scope.getBinding(current.node.id.name);
    if((current.isArrowFunctionExpression()||current.isFunctionExpression()) && current.parentPath.isVariableDeclarator()
       && current.parentPath.node.id.type==='Identifier')binding=current.parentPath.scope.getBinding(current.parentPath.node.id.name);
    const label=current.node.id?.name||(current.parentPath.isVariableDeclarator()?current.parentPath.node.id.name:'<callback@'+current.node.loc.start.line+'>');
    const chain=[label,...item.path];
    for(const ref of binding?binding.referencePaths:[current]) {
      const owner=ref===current?current.getFunctionParent():ref.getFunctionParent();
      if(!owner||owner===boundary) {
        const factoryCall=ref.findParent(p=>p.isCallExpression()&&p.node.callee.type==='Identifier'&&inertFactories.has(p.node.callee.name));
        const afterFactory=factoryCall?.parentPath.isVariableDeclarator()?factoryCall.parentPath:null;
        const r={offset:afterFactory?afterFactory.node.end:ref.node.start,line:afterFactory?afterFactory.node.loc.end.line:ref.node.loc.start.line,path:chain,
          activation:afterFactory?'returned-method activation after independently proved inert construction':ref.parentPath.isCallExpression()&&ref.parentPath.node.callee===ref.node?'direct call':'callback/API escape (conservative)'};
        if(!roots.has(r.offset)||roots.get(r.offset).path.length>chain.length)roots.set(r.offset,r);
      } else queue.push({fn:owner,path:chain});
    }
  }
  const result=[...roots.values()];memo.set(fn.node,result);return result;
}

function auditBinding(binding, boundary, source) {
  const p = binding.path, n=p.node;
  const hoisted = p.isFunctionDeclaration() || binding.kind === 'param';
  const initializedAt = hoisted ? boundary.node.body.start : n.end;
  const references = binding.referencePaths.map(ref => {
    const owner = ref.getFunctionParent();
    const roots = owner && owner !== boundary ? activationRoots(owner,boundary) :
      [{offset:ref.node.start,line:ref.node.loc.start.line,path:['<startup>'],activation:'direct read'}];
    const sorted = roots.filter(r=>r.offset!==null).sort((a,b)=>a.offset-b.offset);
    return {line:ref.node.loc.start.line,expression:text(source,ref.parentPath).slice(0,220),
      owner:owner?.node.id?.name || (owner===boundary?'<startup>':'<callback>'),
      earliestPossibleActivation:sorted[0] || null,
      earlyRoots:hoisted?[]:sorted.filter(r=>r.offset<initializedAt)};
  });
  const early = references.flatMap(r=>r.earlyRoots.map(root=>({readLine:r.line,...root})));
  return {name:binding.identifier.name,kind:binding.kind,constructionLine:n.loc.start.line,
    initializationEndLine:n.loc.end.line,hoisted,referenceCount:references.length,
    earliestReadingActivation:references.map(r=>r.earliestPossibleActivation).filter(Boolean).sort((a,b)=>a.offset-b.offset)[0]||null,
    references,status:early.length?'review-required':'passed',early};
}

function auditSource(before, after, extraNames=[]) {
  const b=mainScope(parse(before)), a=mainScope(parse(after));
  const introduced=Object.keys(a.scope.bindings).filter(name=>!b.scope.bindings[name]
    || b.scope.bindings[name].kind!==a.scope.bindings[name].kind || extraNames.includes(name));
  const bindings=introduced.map(name=>auditBinding(a.scope.bindings[name],a,after));
  for(const name of introduced) {
    const p=a.scope.bindings[name].path;
    if(!p.isVariableDeclarator()||!p.get('init').isCallExpression())continue;
    for(const arg of p.get('init.arguments')) {
      if(!arg.isObjectExpression())continue;
      for(const prop of arg.get('properties')) {
        const fn=prop.isObjectProperty()?prop.get('value'):prop;
        if(!fn.isFunction())continue;
        for(const b of Object.values(fn.scope.bindings))bindings.push({...auditBinding(b,fn,after),scope:name+'.'+(prop.node.key?.name||'<argument>')});
      }
    }
  }
  // New helpers introduce private lexical state as well as their public holder.
  for (const name of introduced) {
    const bp=a.scope.bindings[name].path;
    const fn=bp.isVariableDeclarator()?bp.get('init'):bp;
    if (!fn?.isFunction()) continue;
    for (const local of Object.values(fn.scope.bindings)) bindings.push({...auditBinding(local,fn,after),scope:name});
  }
  return {beforeSha256:hash(before),afterSha256:hash(after),introducedOrChangedKind:introduced,bindings,
    status:bindings.every(b=>b.status==='passed')?'passed':'review-required'};
}

if (process.argv.includes('--self-test')) {
  const before='(function(){ function render(){}; function restore(){render()} restore(); })();';
  const bad='(function(){ function render(){return controller.render()}; function restore(){render()} restore(); const controller={render(){}}; })();';
  const fixed='(function(){ const controller={render(){}}; function render(){return controller.render()}; function restore(){render()} restore(); })();';
  assert.equal(auditSource(before,bad).status,'review-required');
  assert.equal(auditSource(before,fixed).status,'passed');
  const callback='(function(){ register({afterApply(){return render()}}); function render(){return controller.render()}; const controller={render(){}}; })();';
  assert.equal(auditSource(before,callback).status,'review-required');
  assert.equal(auditSource(before,bad.replace('const controller','var controller')).status,'review-required');
  const shadow='(function(){ const controller={}; function unrelated(){const controller=1;return controller} })();';
  assert.equal(auditSource(before,shadow).status,'passed');
  console.log('construction-order self-test: direct early call, escaped callback, fixed ordering and lexical shadowing passed');
  process.exit(0);
}

const [configPath, outputPath] = process.argv.slice(2);
assert(configPath && outputPath,'Usage: node tools/audit-construction-order.cjs CONFIG.json REPORT.json');
const config=JSON.parse(fs.readFileSync(configPath));
const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024});
const app='assets/app/js/app.js';
const reports=[];
for (const stage of config.stages) {
  inertFactories.clear();
  const constructorProofs=[];
  for(const file of stage.modules||[]) {
    const source=stage.worktree?fs.readFileSync(path.join(stage.worktree,file),'utf8'):git('show',stage.after+':'+file);
    for(const proof of inertFactoryProof(source)){inertFactories.set(proof.name,proof);constructorProofs.push({file,...proof});}
  }
  const before=git('show',stage.before+':'+app);
  const after=stage.worktree?fs.readFileSync(path.join(stage.worktree,app),'utf8'):git('show',stage.after+':'+app);
  const report={label:stage.label,before:git('rev-parse',stage.before).trim(),
    after:stage.worktree?'working-tree':git('rev-parse',stage.after).trim(),...auditSource(before,after,stage.recheck||[])};
  report.constructorProofs=constructorProofs;
  report.consumers=[];
  for(const file of stage.consumers||[]) {
    const old=git('show',stage.before+':'+file),current=git('show',stage.after+':'+file);
    report.consumers.push({file,...auditSource(old,current)});
  }
  if(report.consumers.some(c=>c.status!=='passed'))report.status='review-required';
  report.modules=[];
  for (const file of stage.modules||[]) {
    const s=stage.worktree?fs.readFileSync(path.join(stage.worktree,file),'utf8'):git('show',stage.after+':'+file);
    const scope=mainScope(parse(s));
    const bindings=Object.values(scope.scope.bindings).map(b=>auditBinding(b,scope,s));
    scope.traverse({Function(p){
      for(const binding of Object.values(p.scope.bindings)) bindings.push({...auditBinding(binding,p,s),scope:p.node.id?.name||'<callback@'+p.node.loc.start.line+'>'});
    }});
    const index=stage.worktree?fs.readFileSync(path.join(stage.worktree,'index.html'),'utf8'):git('show',stage.after+':index.html');
    const scripts=[...index.matchAll(/<script[^>]+src=["'](?:\.\/)?([^"'?]+)(?:\?[^"']*)?["']/g)].map(x=>x[1]);
    const scriptTags=index.match(/<script\b[^>]*\bsrc=[^>]*>/gi)||[];
    for(const dependency of [file,app]) {
      const tag=scriptTags.find(t=>t.includes(dependency+'?')||t.includes(dependency+'"')||t.includes(dependency+"'"));
      const comparands={dependency,actualTag:tag||null,expectedTagPresent:true,expectedAsyncOrDefer:false,
        actualAsyncOrDefer:tag?/\s(?:async|defer)(?:\s|=|>)/i.test(tag):null};
      console.log(JSON.stringify({check:'ordered synchronous script',...comparands}));
      assert.equal(!!tag,true,JSON.stringify(comparands));
      assert.equal(comparands.actualAsyncOrDefer,false,JSON.stringify(comparands));
    }
    const modulePos=scripts.indexOf(file);
    const orderComparands={module:file,actualModuleIndex:modulePos,actualAppIndex:scripts.indexOf(app),
      expectedModulePresent:true,expectedAppPresent:true,expectedModuleBeforeApp:true,
      consumers:(stage.consumers||[]).map(file=>({file,actualIndex:scripts.indexOf(file),expectedAfterModule:true}))};
    console.log(JSON.stringify({check:'script positions',...orderComparands}));
    const message=JSON.stringify(orderComparands);
    assert.equal(modulePos>=0,true,message);
    assert.equal(scripts.indexOf(app)>=0,true,message);
    assert.equal(modulePos<scripts.indexOf(app),true,message);
    for(const consumer of orderComparands.consumers)assert.equal(modulePos<consumer.actualIndex,true,message);
    report.modules.push({file,sha256:hash(s),loadedBeforeApp:true,bindings,
      status:bindings.every(b=>b.status==='passed')?'passed':'review-required'});
  }
  if(report.modules.some(m=>m.status!=='passed'))report.status='review-required';
  report.expectedStatus=stage.expectedStatus||'passed';
  report.matchesExpectedStatus=report.status===report.expectedStatus;
  reports.push(report);
}
const result={parserVersion:babel('parser/package.json').version,traverseVersion:babel('traverse/package.json').version,toolSha256:hash(fs.readFileSync(__filename)),policy:'Fail closed on any possible incoming activation/callback exposure before a lexical binding is initialized. Function declarations/parameters are separately classified as hoisted; var value initialization is checked too. Report every reading reference; escaped callbacks are conservatively synchronous, not silently deferred.',
  limitation:'A syntactic conservative bound, not an assertion that every reported branch executes. An early path requires manual proof or construction moved before exposure. Complete runtime gates remain mandatory. Audit captures incoming app references and introduced module/helper local bindings; it does not prove arbitrary external JavaScript behavior.',
  stages:reports,status:reports.every(r=>r.matchesExpectedStatus)?'passed':'failed'};
fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,stages:reports.map(s=>({label:s.label,status:s.status,expected:s.expectedStatus,bindings:s.bindings.length,moduleBindings:s.modules.reduce((n,m)=>n+m.bindings.length,0)}))}));
process.exitCode=result.status==='passed'?0:1;
