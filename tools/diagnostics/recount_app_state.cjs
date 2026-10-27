const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const types = require('@babel/types');
const refs = ['v0.9.5-pre-refactor', '3425e0231b71eeb8b8a11523806990f553265cba',
  'd849429eca1fe7bdfc8eb14e7c80cb636336d6df', '036bc3bdc7802ef4f56adcc82666547a4923c540',
  'f8a099fac09dc3742c7889921fa4ed2a440f6c1f'];
const file = 'assets/app/js/app.js';
const results = refs.map(ref => {
  const commit = cp.execFileSync('git', ['rev-parse', ref + '^{commit}'], {encoding: 'utf8'}).trim();
  const source = cp.execFileSync('git', ['show', commit + ':' + file], {encoding: 'utf8', maxBuffer: 10000000});
  const lines = source.split('\n');
  let scope, count = 0;
  traverse(parser.parse(source, {sourceType: 'script'}), {FunctionExpression(p) {
    if (p.parentPath.isCallExpression() && p.parentPath.parentPath.isExpressionStatement()
        && p.parentPath.parentPath.parentPath.isProgram()) {scope = p; count++;}
  }});
  if (count !== 1) throw Error('Expected one app IIFE');
  const babelLetKind = Object.values(scope.scope.bindings).filter(b => b.kind === 'let');
  const classBindings = babelLetKind.filter(b => b.path.isClassDeclaration());
  const bindings = babelLetKind.filter(b => !b.path.isClassDeclaration());
  // Independent declaration-first count: never relies on Babel's kind label.
  const declarationFirstNames = [];
  scope.traverse({VariableDeclaration(p) {
    if (p.node.kind !== 'let') return;
    for (const declarator of p.node.declarations) {
      for (const name of Object.keys(types.getBindingIdentifiers(declarator.id))) {
        if (p.scope.getBinding(name)?.scope === scope.scope) declarationFirstNames.push(name);
      }
    }
  }});
  const names = bindings.map(b => b.identifier.name).sort();
  if (JSON.stringify(declarationFirstNames.sort()) !== JSON.stringify(names)) {
    throw Error('Binding-first and declaration-first inventories differ at ' + ref);
  }
  const declarations = new Map();
  for (const binding of bindings) {
    const decl = binding.path.isVariableDeclaration() ? binding.path
      : binding.path.findParent(p => p.isVariableDeclaration());
    if (!decl || decl.node.kind !== 'let') throw Error('Unresolved let declaration: '+JSON.stringify({name:binding.identifier.name,type:binding.path.type,parent:binding.path.parentPath?.type,kind:binding.kind}));
    const key = decl.node.start;
    if (!declarations.has(key)) declarations.set(key, {line: decl.node.loc.start.line,
      source: source.slice(decl.node.start, decl.node.end), names: []});
    declarations.get(key).names.push(binding.identifier.name);
  }
  const rows = [...declarations.values()].sort((a,b) => a.line - b.line);
  const historicalLines = lines.flatMap((line, i) => /^  let /.test(line) ? [{line:i+1,source:line}] : []);
  const declarationLines = new Set(rows.map(r => r.line));
  const regexLines = new Set(historicalLines.map(r => r.line));
  const sameLineDeclarations = [...declarationLines].map(line => ({line,
    declarations:rows.filter(r => r.line === line)})).filter(r => r.declarations.length > 1);
  const mismatch = {regexOnly: [...regexLines].filter(n => !declarationLines.has(n)),
    astOnly: [...declarationLines].filter(n => !regexLines.has(n))};
  return {ref,commit,appSha256: crypto.createHash('sha256').update(source).digest('hex'),
    historicalDeclarationLines:historicalLines.length, astLetDeclarationStatements:rows.length,
    appScopeLetBindings:bindings.length, babelLetKindBindings:babelLetKind.length,
    classBindings:classBindings.map(b => ({name:b.identifier.name,line:b.path.node.loc.start.line})),
    mismatch, multiBindingDeclarations:rows.filter(r => r.names.length > 1), sameLineDeclarations,
    independentDeclarationFirstCount:declarationFirstNames.length,
    allBindings:names};
});
const base = results[0];
for (const row of results) row.reductionFromTagged = {
  declarationLines: {removed:base.historicalDeclarationLines-row.historicalDeclarationLines,
    percent:100*(base.historicalDeclarationLines-row.historicalDeclarationLines)/base.historicalDeclarationLines},
  bindings:{removed:base.appScopeLetBindings-row.appScopeLetBindings,
    percent:100*(base.appScopeLetBindings-row.appScopeLetBindings)/base.appScopeLetBindings}};
const result = {scope:'Mutable lexical let bindings in the app IIFE only; excludes function/block-local lets and extracted-module state.',
  historicalMetric:'Number of source lines matching /^  let /',
  bindingMetric:'Babel lexical app-IIFE variable bindings declared with let; destructuring and multi-declarators counted individually. ClassDeclaration bindings are reported separately even though Babel calls their kind let.',
  parserVersion:require('@babel/parser/package.json').version, results};
fs.mkdirSync(path.dirname(process.argv[2]), {recursive:true});
fs.writeFileSync(process.argv[2], JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(results.map(({ref,commit,historicalDeclarationLines,astLetDeclarationStatements,appScopeLetBindings,babelLetKindBindings,classBindings,mismatch,reductionFromTagged,multiBindingDeclarations}) =>
  ({ref,commit,historicalDeclarationLines,astLetDeclarationStatements,appScopeLetBindings,babelLetKindBindings,classBindingCount:classBindings.length,mismatch,reductionFromTagged,multiBindingDeclarations})),null,2));
