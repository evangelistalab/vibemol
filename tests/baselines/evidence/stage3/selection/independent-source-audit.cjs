const fs = require('node:fs'), cp = require('node:child_process'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { parse } = require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/parser');
const traverse = require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/traverse').default;
const [base, group, out] = process.argv.slice(2);
const file = 'assets/app/js/app.js';
const before = cp.execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const after = fs.readFileSync(file, 'utf8');
const audit = JSON.parse(fs.readFileSync('tests/baselines/evidence/stage3/lookup-site-audit.json'));
const entries = audit.wiringSites.flatMap(g => g.entries).filter(e => e.group === group && e.kind.startsWith('DOM cache')).map(e => ({...e, preStageAuditQueryLine:e.queryLine}));
const names = entries.map(e => e.name);
const replacements = new Map(names.map(name => [name, name === 'canvasAdaptiveMenuEl' ? 'els.displayWindowAdaptiveMenuEl' : 'els.' + name]));
if (group === 'remainder') {
  for (const name of ['displayWindowAdaptiveMenuEl', 'elementColorBtn', 'elementColorOverlay', 'elementColorClose',
    'periodicTableViewport', 'periodicTableCanvas', 'elementColorName', 'elementColorPicker', 'elementColorResetOne', 'elementColorResetAll']) {
    replacements.set(name, 'els.' + name);
  }
}
const edits = [];
const queryEdits = [], declarationEdits = [];
const beforeAst = parse(before);
traverse(beforeAst, { VariableDeclarator(p) {
  const name = p.node.id.name;
  if (!replacements.has(name)) return;
  const entry = entries.find(e => e.name === name);
  if (entry) entry.declarationLine = p.node.loc.start.line;
  if (['editAdaptive*', 'editSelection*'].includes(group)) {
    assert.equal(p.parent.declarations.length, 1);
    assert.equal(p.node.init.type, 'NullLiteral');
    const lineStart = before.lastIndexOf('\n',p.parent.start)+1;
    const lineEnd = before.indexOf('\n',p.parent.end)+1;
    declarationEdits.push({start:lineStart,end:lineEnd,value:''});
  }
  for (const r of p.scope.getBinding(name).referencePaths) {
    edits.push({start:r.node.start, end:r.node.end, value: r.parent.type === 'ObjectProperty' && r.parent.shorthand ? name + ': ' + replacements.get(name) : replacements.get(name)});
  }
}, AssignmentExpression(p) {
  const entry = entries.find(e => e.name === p.node.left.name);
  if (!entry || p.node.right.type !== 'CallExpression' || p.node.right.callee.type !== 'MemberExpression') return;
  assert.equal(p.node.right.callee.object.name,'document');
  assert.equal(p.node.right.callee.property.name,'getElementById');
  assert.equal(p.node.right.arguments[0].value,entry.id);
  assert.equal(p.parent.type,'ExpressionStatement');
  assert.equal(queryEdits.filter(e => e.name === entry.name).length,0);
  entry.assignmentLine = entry.queryLine = p.node.loc.start.line;
  queryEdits.push({name:entry.name,start:p.parent.start,end:p.parent.end,value:`cacheElement('${entry.name}', '${entry.id}');`});
} });
if (['editAdaptive*', 'editSelection*'].includes(group)) {
  assert.equal(queryEdits.length,entries.length);
  const marker = '  const els = {\n';
  const insertion = before.indexOf(marker)+marker.length;
  assert.ok(insertion >= marker.length);
  const allEdits = [...edits,...queryEdits,...declarationEdits,{start:insertion,end:insertion,value:names.map(name=>`    ${name}: null,\n`).join('')}].sort((a,b)=>b.start-a.start);
  let expected = before;
  for (const e of allEdits) expected = expected.slice(0,e.start)+e.value+expected.slice(e.end);
  assert.equal(after,expected,'entire app source differs only by the approved group cache conversions');
}
const functions = source => {
  const result = [];
  traverse(parse(source), { FunctionDeclaration(p) { result.push(p.node); } });
  return result.sort((a,b) => a.start-b.start);
};
const oldFunctions = functions(before), newFunctions = functions(after);
assert.equal(oldFunctions.length, newFunctions.length);
const affected = [];
oldFunctions.forEach((node, index) => {
  let expected = before.slice(node.start, node.end);
  const changes = edits.filter(e => e.start >= node.start && e.end <= node.end).sort((a,b) => b.start-a.start);
  for (const e of changes) expected = expected.slice(0,e.start-node.start)+e.value+expected.slice(e.end-node.start);
  const current = newFunctions[index];
  assert.equal(current.id.name, node.id.name);
  assert.equal(after.slice(current.start,current.end), expected, node.id.name);
  if (changes.length) affected.push({name:node.id.name, beforeLine:node.loc.start.line, afterLine:current.loc.start.line});
});
let cacheScope;
const afterAst = parse(after);
const registrations = [];
traverse(afterAst, { CallExpression(p) {
  if (p.node.callee.name !== 'cacheElement') return;
  const entry = entries.find(e => e.name === p.node.arguments[0]?.value);
  if (!entry) return;
  assert.equal(p.node.arguments[1].value,entry.id);
  registrations.push(entry.name);
  entry.registrationLine = p.node.loc.start.line;
  if (['editAdaptive*', 'editSelection*'].includes(group)) assert.equal(entry.registrationLine,entry.queryLine);
  entry.registeredAtOriginalQueryPoint = true;
} });
if (['editAdaptive*', 'editSelection*'].includes(group)) assert.deepEqual(registrations,names);
traverse(afterAst, { VariableDeclarator(p) { if (p.node.id.name === 'els' && p.node.init?.type === 'ObjectExpression') cacheScope = p.scope.getBinding('els'); } });
const shadowed = [];
const fields = new Set([...replacements.values()].map(value => value.split('.')[1]));
traverse(afterAst, { MemberExpression(p) {
  if (p.node.object.name === 'els' && fields.has(p.node.property.name) && p.scope.getBinding('els') !== cacheScope) shadowed.push(p.node.loc.start.line);
} });
assert.deepEqual(shadowed, []);
const metrics = source => ({lines:source.split('\n').length-1, functionDeclarations:(source.match(/^  (?:async )?function\b/gm)||[]).length,
  letDeclarations:(source.match(/^  let /gm)||[]).length, constDeclarations:(source.match(/^  const /gm)||[]).length,
  sha256:crypto.createHash('sha256').update(source).digest('hex')});
const report = {group, baseCommit:base, inventory:entries, functionsWhoseBodiesReferenceTheConvertedCache:affected,
  allExistingFunctionDeclarationsExactAfterLexicalReferenceSubstitution:true,
  entireAppExactAfterApprovedConversions:['editAdaptive*', 'editSelection*'].includes(group) ? true : undefined,
  lexicalReferenceSubstitutions:edits.length,
  auditedFunctionDeclarations:oldFunctions.length, shadowedElsReferences:shadowed,
  metrics:{before:metrics(before),after:metrics(after)},controllerLetsRetained:/^  let measurementsPanel = null;/m.test(after)&&/^  let calculationsPanel = null,/m.test(after),
  focusStateLetRetained:/^  let helpRestoreFocusEl = null;/m.test(after),queryRegistrationAtOriginalWiringSites:true};
fs.mkdirSync(require('node:path').dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({group,functions:oldFunctions.length,affected:affected.length,metrics:report.metrics}));
