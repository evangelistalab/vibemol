#!/usr/bin/env node
'use strict';

// Independent, baseline-derived, read-only audit. This script does not import any
// converter implementation or converter report. All writes stay in outputRoot.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const parser = require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/parser');
const traverse = require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/traverse').default;
const baseline = '6c583556bcc84bff9442602a7dd8aed056b4a660';
const sourceRoot = process.argv[2] || '/Users/fevange/Source/vibemol/out/test-artifacts/stage4/pubchem/source-worktree';
const outputRoot = __dirname;
const appPath = 'assets/app/js/app.js';
const modulePath = 'assets/app/js/pubchem.js';
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const git = (...args) => cp.execFileSync('git', args, { cwd: sourceRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const baseFile = file => git('show', `${baseline}:${file}`);
const currentFile = file => fs.readFileSync(path.join(sourceRoot, file), 'utf8');
const checks = [];
function check(name, condition, details = {}) {
  checks.push({ name, passed: !!condition, ...details });
}
const oldApp = baseFile(appPath);
const newApp = currentFile(appPath);
const newModule = currentFile(modulePath);
const startHashes = { app: sha(newApp), module: sha(newModule) };
const parse = text => parser.parse(text, { sourceType: 'script' });
function collect(text) {
  const ast = parse(text);
  const functions = new Map();
  const variables = new Map();
  const top = [];
  const direct = [];
  traverse(ast, {
    FunctionDeclaration(p) {
      if (functions.has(p.node.id.name)) throw new Error(`Duplicate declaration name: ${p.node.id.name}`);
      functions.set(p.node.id.name, p);
      if (p.parentPath.isBlockStatement() && p.parentPath.parentPath.isFunctionExpression()) top.push(p.node.id.name);
    },
    VariableDeclarator(p) {
      if (p.node.id.type === 'Identifier') {
        const name = p.node.id.name;
        if (!variables.has(name)) variables.set(name, []);
        variables.get(name).push(p);
      }
    },
    VariableDeclaration(p) {
      if (p.node.kind === 'let' && p.parentPath.isBlockStatement() && p.parentPath.parentPath.isFunctionExpression()) direct.push(p.node);
    },
  });
  return { ast, functions, variables, top, direct };
}
const b = collect(oldApp), n = collect(newApp), m = collect(newModule);
const movedNames = [...b.functions.keys()].filter(name => /pubchem/i.test(name) || name === 'sdfToXYZText');
const domNames = ['pubchemMetaWrap', 'pubchemMetaContent', 'pubchemQueryInput', 'pubchemLoadBtn', 'pubchemSuggestionsEl'];
const stateNames = ['PUBCHEM_AUTOCOMPLETE_LIMIT', 'pubchemBusy', 'pubchemSuggestTimer', 'pubchemSuggestToken', 'pubchemHas3DByNameCache', 'pubchemHas3DByCidCache'];
const deps = ['els', 'escapeHtml', 'setTooltipText', 'setHintMessage', 'parseXYZ', 'handleSceneDropRecords', 'setVolumes', 'setCurrentIndex', 'clearSceneMeshes', 'clearEditHistory', 'appendParsedVolumeRecord', 'finalizeLoadedVolumes', 'setNavigationHint'];
const ambientAllowed = new Set(['Array', 'Error', 'Map', 'Math', 'Number', 'Object', 'Promise', 'Set', 'String', 'alert', 'clearTimeout', 'console', 'document', 'encodeURIComponent', 'fetch', 'parseFloat', 'parseInt', 'setTimeout', 'undefined']);
const source = (s, node) => s.slice(node.start, node.end);
const lineStart = (s, offset) => s.lastIndexOf('\n', offset - 1) + 1;
const wholeDeclaration = p => p.parentPath.node;
const baseVar = name => {
  const found = b.variables.get(name) || [];
  if (found.length !== 1) throw new Error(`Expected unique baseline variable ${name}, found ${found.length}`);
  return found[0];
};
function patchText(text, patches) {
  const sorted = patches.slice().sort((a, c) => c.start - a.start);
  let previous = text.length;
  for (const edit of sorted) {
    if (edit.end > previous) throw new Error(`Overlapping audit edits: ${edit.label}`);
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    previous = edit.start;
  }
  return text;
}
function inverseMoved(p) {
  const edits = [];
  p.traverse({
    MemberExpression(q) {
      const x = q.node;
      if (!x.computed && x.object.type === 'Identifier' && x.object.name === 'els' && x.property.type === 'Identifier' && domNames.includes(x.property.name)) {
        edits.push({ start: x.start - p.node.start, end: x.end - p.node.start, text: x.property.name, label: 'DOM dependency inverse' });
      }
    },
    CallExpression(q) {
      const x = q.node;
      if (x.callee.type !== 'Identifier' || !['setVolumes', 'setCurrentIndex'].includes(x.callee.name)) return;
      if (q.getFunctionParent() !== p) throw new Error('Setter unexpectedly nested');
      const expected = x.callee.name === 'setVolumes' ? '[]' : '-1';
      if (x.arguments.length !== 1 || source(newModule, x.arguments[0]) !== expected) throw new Error('Setter signature is not its baseline assignment');
      edits.push({ start: x.start - p.node.start, end: x.end - p.node.start, text: `${x.callee.name === 'setVolumes' ? 'volumes' : 'currentIndex'} = ${expected}`, label: 'Explicit state setter inverse' });
    },
  });
  return patchText(source(newModule, p.node), edits).split('\n').map((line, i) => i ? line.replace(/^  /, '') : line).join('\n');
}
check('baseline has exactly 1190 uniquely named function declarations', b.functions.size === 1190);
check('baseline-derived moved function inventory is exactly 19', movedNames.length === 19, { names: movedNames });
const movedProofs = movedNames.map(name => {
  const bp = b.functions.get(name), mp = m.functions.get(name);
  const original = source(oldApp, bp.node);
  const inverse = mp ? inverseMoved(mp) : '';
  const equal = original === inverse;
  check(`moved body inverse exact: ${name}`, equal);
  return { name, baselineLines: [bp.node.loc.start.line, bp.node.loc.end.line], moduleLines: mp ? [mp.node.loc.start.line, mp.node.loc.end.line] : null, baselineSha256: sha(original), inverseSha256: sha(inverse), exact: equal };
});
const unchangedProofs = [...b.functions].filter(([name]) => !movedNames.includes(name)).map(([name, bp]) => {
  const np = n.functions.get(name);
  const oldText = source(oldApp, bp.node), newText = np ? source(newApp, np.node) : '';
  const equal = oldText === newText;
  check(`unchanged body exact: ${name}`, equal);
  return { name, baselineLines: [bp.node.loc.start.line, bp.node.loc.end.line], appLines: np ? [np.node.loc.start.line, np.node.loc.end.line] : null, baselineSha256: sha(oldText), appSha256: sha(newText), exact: equal };
});
check('all baseline declarations accounted for exactly once', movedProofs.length + unchangedProofs.length === b.functions.size);
check('remaining app declarations are originals plus metadata delegator', n.functions.size === unchangedProofs.length + 1);
check('module declarations are 19 originals plus factory and bindControls', m.functions.size === movedNames.length + 2 && m.functions.has('createPubChemController') && m.functions.has('bindControls'));

// Reconstruct the entire proposed app from baseline by this independent list of
// allowed changes, retaining every other byte (including original blank lines).
const edits = [];
const periodicImport = "  const { createPeriodicTableController } = window.VibeMolPeriodicTable || {};\n";
const importStart = oldApp.indexOf(periodicImport);
if (importStart < 0 || oldApp.indexOf(periodicImport, importStart + 1) >= 0) throw new Error('Periodic import anchor not unique');
edits.push({ start: importStart + periodicImport.length, end: importStart + periodicImport.length, text: "  const { createPubChemController } = window.VibeMolPubChem || {};\n  if (typeof createPubChemController !== 'function') {\n    throw new Error('VibeMolPubChem is not loaded. Ensure assets/app/js/pubchem.js is included before assets/app/js/app.js.');\n  }\n", label: 'Exact namespace import/guard' });
for (const name of domNames) {
  const p = baseVar(name), d = wholeDeclaration(p);
  const text = `els.${name} = ${source(oldApp, p.node.init)};`;
  edits.push({ start: d.start, end: d.end, text, label: `Plain canonical DOM field ${name}` });
}
const iconDecl = wholeDeclaration(baseVar('PUBCHEM_SEARCH_ICON_SVG'));
edits.push({ start: lineStart(oldApp, iconDecl.start), end: iconDecl.end + 1, text: '', label: 'Move pure SVG constant' });
const stateNodes = stateNames.map(name => wholeDeclaration(baseVar(name)));
const appFactory = `const pubchemController = createPubChemController({\n${deps.map(name => `    ${name === 'setVolumes' ? 'setVolumes: value => { volumes = value; }' : name === 'setCurrentIndex' ? 'setCurrentIndex: value => { currentIndex = value; }' : name},`).join('\n')}\n  });`;
edits.push({ start: lineStart(oldApp, stateNodes[0].start), end: stateNodes[stateNodes.length - 1].end, text: '', label: 'Remove old six-state block; initialize inert controller before startup callbacks' });
const earlyAnchor = oldApp.indexOf('  const cacheElement = (name, id) => {');
if(earlyAnchor<0)throw Error('Missing unique els-helper anchor');
edits.push({start:earlyAnchor,end:earlyAnchor,text:'  // Construction has no DOM/network effects; metadata rendering is used during\n  // startup preset restoration, before the late control-listener wiring.\n  '+appFactory+'\n',label:'Authorized inert construction immediately after els, before callbacks'});
for (const name of movedNames) {
  const p = b.functions.get(name);
  if (name === 'updatePubChemMetadataPanel') {
    edits.push({ start: p.node.body.start, end: p.node.body.end, text: '{\n    return pubchemController.updatePubChemMetadataPanel(record);\n  }', label: 'Metadata-only delegator' });
  } else {
    const firstComment = (p.node.leadingComments || []).find(c => c.type === 'CommentBlock' && c.value.startsWith('*'));
    if (!firstComment) throw new Error(`Missing baseline docblock ${name}`);
    edits.push({ start: lineStart(oldApp, firstComment.start), end: p.node.end + 1, text: '', label: `Move documented declaration ${name}` });
  }
}
const listenerNodes = [];
traverse(b.ast, { IfStatement(p) {
  if (p.node.test.type === 'Identifier' && ['pubchemQueryInput', 'pubchemLoadBtn'].includes(p.node.test.name)) listenerNodes.push(p.node);
} });
if (listenerNodes.length !== 2 || listenerNodes[0].end > listenerNodes[1].start) throw new Error('Expected original two listener guards');
edits.push({ start: listenerNodes[0].start, end: listenerNodes[1].end, text: 'pubchemController.bindControls();', label: 'Bind once at exact original listeners site' });
const expectedApp = patchText(oldApp, edits);
check('entire app exact after independent allowed edits', expectedApp === newApp, { expectedSha256: sha(expectedApp), actualSha256: sha(newApp), editCount: edits.length });
if (expectedApp !== newApp) fs.writeFileSync(path.join(outputRoot, 'expected-app.js'), expectedApp);

// Independently reconstruct module text, including every old docblock/body,
// indentation-only changes, the exact factory and one exact listener wrapper.
const indent = (text, count) => text.split('\n').map(line => line ? ' '.repeat(count) + line : '').join('\n');
function forwardFeature(text) {
  const ast = parse(`(function () {\n${text}\n})();`), shift = '(function () {\n'.length, changes = [];
  traverse(ast, {
    ReferencedIdentifier(p) {
      if (domNames.includes(p.node.name)) changes.push({ start: p.node.start - shift, end: p.node.end - shift, text: `els.${p.node.name}`, label: 'DOM reference forward' });
    },
    AssignmentExpression(p) {
      const x = p.node;
      if (x.left.type !== 'Identifier' || !['volumes', 'currentIndex'].includes(x.left.name)) return;
      const value = text.slice(x.right.start - shift, x.right.end - shift);
      changes.push({ start: x.start - shift, end: x.end - shift, text: `${x.left.name === 'volumes' ? 'setVolumes' : 'setCurrentIndex'}(${value})`, label: 'Explicit app-owned state setter' });
    },
  });
  return patchText(text, changes);
}
const originalBlock = name => {
  const p = b.functions.get(name), doc = p.node.leadingComments.find(c => c.type === 'CommentBlock' && c.value.startsWith('*'));
  return oldApp.slice(lineStart(oldApp, doc.start), p.node.end);
};
const oldListenerText = oldApp.slice(lineStart(oldApp, listenerNodes[0].start), listenerNodes[1].end);
const expectedModule = `(function (global) {\n  'use strict';\n\n  function createPubChemController(deps) {\n    const {\n${deps.map(name => `      ${name},`).join('\n')}\n    } = deps;\n\n${indent(oldApp.slice(lineStart(oldApp, iconDecl.start), iconDecl.end), 2)}\n\n${indent(oldApp.slice(lineStart(oldApp, stateNodes[0].start), stateNodes[stateNodes.length - 1].end), 2)}\n\n${movedNames.map(name => indent(forwardFeature(originalBlock(name)), 2)).join('\n\n')}\n\n    function bindControls() {\n${indent(forwardFeature(oldListenerText), 4)}\n    }\n\n    return Object.freeze({ updatePubChemMetadataPanel, bindControls });\n  }\n\n  global.VibeMolPubChem = Object.freeze({ createPubChemController });\n})(typeof window !== 'undefined' ? window : globalThis);\n`;
check('entire module exact after independently moving baseline fragments', expectedModule === newModule, { expectedSha256: sha(expectedModule), actualSha256: sha(newModule) });
if (expectedModule !== newModule) fs.writeFileSync(path.join(outputRoot, 'expected-module.js'), expectedModule);

const factory = m.functions.get('createPubChemController');
const depPattern = factory.node.body.body[0];
const declaredDeps = depPattern.declarations[0].id.properties.map(p => p.key.name);
check('factory destructures exactly the 13 explicit approved inputs', JSON.stringify(declaredDeps) === JSON.stringify(deps), { count: declaredDeps.length, names: declaredDeps, under15: declaredDeps.length < 15 });
const dependencyProof = deps.map(name => {
  const binding = factory.scope.getBinding(name);
  const references = binding ? binding.referencePaths.map(p => ({ line: p.node.loc.start.line, column: p.node.loc.start.column, source: source(newModule, p.node) })) : [];
  check(`dependency genuinely used: ${name}`, references.length > 0);
  return { name, count: references.length, references };
});
const freeReferences = new Map();
factory.traverse({ ReferencedIdentifier(p) {
  const name = p.node.name;
  if (p.scope.getBinding(name)) return;
  if (!freeReferences.has(name)) freeReferences.set(name, []);
  freeReferences.get(name).push(p.node.loc.start.line);
} });
const unexpectedFree = [...freeReferences.keys()].filter(name => !ambientAllowed.has(name));
check('no hidden free app dependencies', unexpectedFree.length === 0, { unexpected: unexpectedFree, ambient: [...freeReferences].map(([name, lines]) => ({ name, count: lines.length, lines })).sort((a, c) => a.name.localeCompare(c.name)) });
const internalFeatureBindings = new Set([...movedNames, ...stateNames, 'PUBCHEM_SEARCH_ICON_SVG']);
const baselineOutsideInputs = new Map();
for (const name of movedNames) {
  const feature = b.functions.get(name);
  feature.traverse({ ReferencedIdentifier(p) {
    const id = p.node.name, binding = p.scope.getBinding(id);
    if (!binding || internalFeatureBindings.has(id)) return;
    if (binding.path.node.start >= feature.node.start && binding.path.node.end <= feature.node.end) return;
    if (!baselineOutsideInputs.has(id)) baselineOutsideInputs.set(id, []);
    baselineOutsideInputs.get(id).push({ function: name, line: p.node.loc.start.line, access: 'read' });
  }, AssignmentExpression(p) {
    if (p.node.left.type !== 'Identifier') return;
    const id = p.node.left.name, binding = p.scope.getBinding(id);
    if (!binding || internalFeatureBindings.has(id)) return;
    if (binding.path.node.start >= feature.node.start && binding.path.node.end <= feature.node.end) return;
    if (!baselineOutsideInputs.has(id)) baselineOutsideInputs.set(id, []);
    baselineOutsideInputs.get(id).push({ function: name, line: p.node.loc.start.line, access: 'write', assignment: source(oldApp, p.node) });
  } });
}
const mappedOriginalInputs = [...new Set([...baselineOutsideInputs.keys()].map(name => domNames.includes(name) ? 'els' : name === 'volumes' ? 'setVolumes' : name === 'currentIndex' ? 'setCurrentIndex' : name))].sort();
check('13 actual inputs equal independently derived baseline closure inputs after DOM grouping and write callbacks', JSON.stringify(mappedOriginalInputs) === JSON.stringify(deps.slice().sort()), { baselineInputCount: baselineOutsideInputs.size, baselineInputs: [...baselineOutsideInputs.keys()].sort(), proposedInputs: mappedOriginalInputs });
const factoryEager = factory.node.body.body.filter(x => x.type !== 'FunctionDeclaration').map(x => ({ type: x.type, line: x.loc.start.line, text: source(newModule, x) }));
check('factory has only dependency destructuring, pure initial state, declarations and return', factoryEager.length === 9 && factoryEager.every(x => ['VariableDeclaration', 'ReturnStatement'].includes(x.type)), { statements: factoryEager });

const domProof = domNames.map(name => {
  const oldNode = wholeDeclaration(baseVar(name));
  let matches = [];
  traverse(n.ast, { AssignmentExpression(p) {
    const x = p.node;
    if (x.left.type === 'MemberExpression' && !x.left.computed && x.left.object.name === 'els' && x.left.property.name === name) matches.push(p);
  } });
  check(`single canonical plain assignment: ${name}`, matches.length === 1 && source(newApp, matches[0].node.right) === source(oldApp, baseVar(name).node.init));
  return { name, baselineLine: oldNode.loc.start.line, proposedLine: matches[0]?.node.loc.start.line, query: source(oldApp, baseVar(name).node.init), assignments: matches.length, declarationKindBefore: 'const', fieldKindAfter: 'plain assignment at same statement position' };
});

// Inverse audit includes remaining-code callers, callback escape into other
// modules and introduced local bindings. Keep the old failed candidate as its
// negative control; do not infer safety from the outgoing closure proof alone.
const order = JSON.parse(fs.readFileSync(path.join(outputRoot,'..','construction-order-final.json')));
const corrected = order.stages.find(s=>s.label==='Stage 4 corrected');
const negative = order.stages.find(s=>s.label==='Stage 4 original (negative control)');
check('inverse construction-order audit passes fixed source and rejects original candidate',
 order.status==='passed' && order.toolSha256===sha(currentFile('tools/audit-construction-order.cjs'))
 && order.stages.every(s=>s.status===(s.label==='Stage 4 original (negative control)'?'review-required':'passed')) && corrected.status==='passed' && corrected.afterSha256===sha(newApp)
 && negative.status==='review-required' && negative.bindings.some(b=>b.name==='pubchemController'&&b.early.length));
const controller = n.variables.get('pubchemController')[0];
const availability = deps.filter(k=>!['setVolumes','setCurrentIndex'].includes(k)).map(name=>{
 const binding = controller.scope.getBinding(name);
 return {name,kind:binding?.kind,line:binding?.path.node.loc.start.line,
  ready:!!binding&&(binding.path.isFunctionDeclaration()||binding.path.node.end<controller.node.start)};
});
check('all eager controller inputs initialized or hoisted before early construction',availability.every(x=>x.ready),{availability});

const oldIndex = baseFile('index.html'), index = currentFile('index.html');
const scriptTag = '  <script src="./assets/app/js/pubchem.js?v=0.9.5"></script>\n';
const periodicTag = '  <script src="./assets/app/js/periodic-table.js?v=0.9.5"></script>\n';
check('index exact single versioned script addition preserving periodic/app adjacency', index === oldIndex.replace(periodicTag, scriptTag + periodicTag), { script: scriptTag.trim() });
const oldMake = baseFile('Makefile'), make = currentFile('Makefile');
check('Makefile exact syntax-check addition', make === oldMake.replace('\tassets/app/js/periodic-table.js \\\n', '\tassets/app/js/periodic-table.js \\\n\tassets/app/js/pubchem.js \\\n'));
const oldManifest = JSON.parse(baseFile('tests/baselines/characterize-api-additions.json'));
const manifestText = currentFile('tests/baselines/characterize-api-additions.json');
const expectedManifest = { ...oldManifest, modules: [...oldManifest.modules, { stage: 4, script: modulePath, global: 'VibeMolPubChem', keys: ['createPubChemController'] }] };
check('API manifest exact additive contract, existing exports unchanged', manifestText === JSON.stringify(expectedManifest, null, 2) + '\n');
const allowedChanged = ['Makefile', appPath, 'index.html', 'tests/baselines/characterize-api-additions.json'];
const diffPaths = git('diff', '--name-only', baseline, '--').trim().split('\n').filter(Boolean);
const protectedChanges = diffPaths.filter(name => /^(assets|src|api|tools|\.github|tests\/(e2e|unit))\//.test(name));
check('no other production/workflow/test source beyond exact authorized comparand instrumentation and audit tool changed', protectedChanges.every(name => [appPath, modulePath,'tests/e2e/look_references.py','tools/audit-construction-order.cjs'].includes(name)), { protectedChanges });
check('look migration harness is exact previously human-authorized comparand instrumentation',sha(currentFile('tests/e2e/look_references.py'))==='2a1c894c25894779414bb7ca439d5b93fb6feab3a9436760fb76c1a2b340ec87');
const goldenChanges = git('diff', '--name-only', baseline, '--', 'tests/baselines/characterize*.json', 'tests/baselines/browser-suite.json', 'tests/baselines/browser-shards.json', 'tests/baselines/color-contrast.json').trim().split('\n').filter(Boolean);
check('no golden or suite/assertion manifest changed beyond planned API addition', goldenChanges.every(name => name === 'tests/baselines/characterize-api-additions.json'), { changed: goldenChanges });
check('module new against baseline', git('ls-tree', '--name-only', baseline, '--', modulePath).trim() === '');
check('production source stayed immutable during this audit', sha(currentFile(appPath)) === startHashes.app && sha(currentFile(modulePath)) === startHashes.module);

const metrics = text => { const a = collect(text); return { lines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0), allFunctionDeclarations: a.functions.size, directIifeFunctionDeclarations: a.top.length, trackedTwoSpaceLetDeclarationLines: (text.match(/^  let /gm) || []).length, directIifeLetDeclarationNodes: a.direct.length, directIifeLetDeclarators: a.direct.reduce((sum, x) => sum + x.declarations.length, 0) }; };
const report = {
  status: checks.every(x => x.passed) ? 'passed' : 'failed',
  independent: true,
  scope: 'Read-only baseline-derived complete-source audit; no converter implementation/report imported; no browser/network/git mutation.',
  baselineCommit: baseline,
  sourceHead: git('rev-parse', 'HEAD').trim(),
  sourceRoot,
  sourceHashes: { baselineAppSha256: sha(oldApp), proposedAppSha256: sha(newApp), proposedModuleSha256: sha(newModule), auditScriptSha256: sha(fs.readFileSync(__filename)) },
  metrics: { baselineApp: metrics(oldApp), proposedApp: metrics(newApp), proposedModule: metrics(newModule), existingMovedFunctions: movedNames.length, originalFunctionsAccounted: movedProofs.length + unchangedProofs.length, unchangedAppFunctions: unchangedProofs.length, genuineFactoryInputs: deps.length },
  dependencies: dependencyProof,
  baselineOutsideInputs: [...baselineOutsideInputs].map(([name, references]) => ({ name, references })).sort((a, c) => a.name.localeCompare(c.name)),
  domQueries: domProof,
  movedFunctions: movedProofs,
  originalOtherFunctionProof: 'function-proof.json',
  allowedEdits: edits.map(({ label, start, end, text }) => ({ label, baselineRange: [start, end], replacementSha256: sha(text) })),
  changedTrackedPathsAtAudit: diffPaths,
  checks,
  failed: checks.filter(x => !x.passed).map(x => x.name),
};
fs.writeFileSync(path.join(outputRoot, 'function-proof.json'), JSON.stringify({ baselineCommit: baseline, moved: movedProofs, unchanged: unchangedProofs }, null, 2) + '\n');
fs.writeFileSync(path.join(outputRoot, 'source-audit.json'), JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(path.join(outputRoot, 'audit-readback.json'), JSON.stringify({ status: report.status, sourceHashes: report.sourceHashes, metrics: report.metrics, passedChecks: checks.filter(x => x.passed).length, totalChecks: checks.length, failed: report.failed }, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, metrics: report.metrics, passedChecks: checks.filter(x => x.passed).length, totalChecks: checks.length, failed: report.failed }));
process.exitCode = report.status === 'passed' ? 0 : 1;
