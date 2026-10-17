const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto'), cp = require('node:child_process');
const {parse} = require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/parser');
const traverse = require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/traverse').default;
const root = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const source = fs.readFileSync(path.join(root, 'assets/app/js/app.js'), 'utf8');
const ast = parse(source); let outer;
traverse(ast, {FunctionExpression(p) { if (p.parent.type === 'CallExpression' && p.node.start < 10) outer = p; }});
assert.ok(outer);
const queriedId = n => n?.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.property.name === 'getElementById' && n.arguments[0]?.type === 'StringLiteral' ? n.arguments[0].value : null;
const references = paths => paths.map(r => ({line: r.node.loc.start.line,
  function: r.getFunctionParent()?.node.id?.name || '(app/anonymous)',
  statement: source.slice(r.getStatementParent().node.start, r.getStatementParent().node.end)}));
const bindings = Object.entries(outer.scope.bindings).map(([name, b]) => {
  let id = queriedId(b.path.node.init), queryLine = id ? b.path.node.loc.start.line : null;
  for (const v of b.constantViolations) {
    const q = queriedId(v.node.right);
    if (q) { if (id) assert.equal(id, q); id = q; queryLine = v.node.loc.start.line; }
  }
  return {name, kind: b.kind, declarationLine: b.identifier.loc.start.line, queriedId: id,
    queryLine, references: references(b.referencePaths)};
});
const fields = {};
traverse(ast, {
  CallExpression(p) {
    if (p.node.callee.name === 'cacheElement' && p.node.arguments[0]?.type === 'StringLiteral') {
      const [name, id] = p.node.arguments.map(n => n.value);
      fields[name] = {name, queriedId: id, queryLine: p.node.loc.start.line, kind: 'memoized accessor', references: []};
    }
  },
  AssignmentExpression(p) {
    const n = p.node;
    if (n.left.type === 'MemberExpression' && n.left.object.name === 'els' && queriedId(n.right)) {
      const name = n.left.property.name;
      fields[name] = {name, queriedId: queriedId(n.right), queryLine: n.loc.start.line, kind: 'plain canonical field', references: []};
    }
  },
});
traverse(ast, {MemberExpression(p) {
  if (p.node.object.name !== 'els' || p.scope.getBinding('els') !== outer.scope.getBinding('els')) return;
  const name = p.node.computed ? p.node.property.value : p.node.property.name;
  if (fields[name]) fields[name].references.push(...references([p]));
}});
const marker = '  // Keyboard shortcuts are handled by the mode-aware router defined above.';
assert.equal(source.split(marker).length, 2);
const expressions = bindings.map(x => `${x.name}: ${x.name}`);
const instrumented = source.replace(marker, '  window.__domReferenceCensus = () => ({' + expressions.join(',') + '});\n' + marker);
fs.mkdirSync(out, {recursive: true});
const metadata = {sourceCommit: cp.execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
  sourceTree: cp.execFileSync('git', ['-C', root, 'rev-parse', 'HEAD^{tree}'], {encoding: 'utf8'}).trim(),
  sourceAppSha256: crypto.createHash('sha256').update(source).digest('hex'),
  instrumentedAppSha256: crypto.createHash('sha256').update(instrumented).digest('hex'),
  method: 'All app-IIFE lexical bindings, direct-ID declarations/assignments, els fields, node collections and controller panel nodes. Observational getter inserted at the existing late marker; no source file modified.', bindings, fields};
fs.writeFileSync(path.join(out, 'bindings.json'), JSON.stringify(metadata, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'observational-app.js'), instrumented);
console.log(JSON.stringify({source: metadata.sourceCommit, moduleBindings: bindings.length,
  directIdCacheBindings: bindings.filter(x => x.queriedId).length, canonicalElsFields: Object.keys(fields).length}));
