#!/usr/bin/env node
'use strict';

// Static, direct-use audit, not a whole-program reachability proof. Test tooling
// only: use the same pinned Babel installation as audit-construction-order.cjs.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const babel = name => require(process.env.VIBEMOL_BABEL_ROOT
  ? path.join(process.env.VIBEMOL_BABEL_ROOT, name) : '@babel/' + name);
const parser = babel('parser'), traverse = babel('traverse').default;
const ROOT = path.resolve(__dirname, '..');
const BASELINE = 'tests/baselines/dead-capabilities.json';
const POLICY = 'tools/capability-dispositions.json';
const buckets = ['built-but-unwired', 'harness surface', 'live', 'deps-passed', 'console/API', 'unreached'];
const member = p => p && (p.isMemberExpression() || p.isOptionalMemberExpression());
const call = p => p && (p.isCallExpression() || p.isOptionalCallExpression() || p.isNewExpression());
const key = n => !n ? null : n.type === 'Identifier' ? n.name
  : ['StringLiteral', 'NumericLiteral'].includes(n.type) ? String(n.value) : null;
const union = (...xs) => [...new Set(xs.flat())];

function staticKeys(p, seen = new Set()) {
  if (!p?.node || seen.has(p.node)) return [];
  seen = new Set(seen).add(p.node);
  if (p.isStringLiteral()) return [p.node.value];
  if (p.isConditionalExpression()) return union(staticKeys(p.get('consequent'), seen), staticKeys(p.get('alternate'), seen));
  if (p.isArrayExpression()) return union(...p.get('elements').map(e => staticKeys(e, seen)));
  if (p.isIdentifier()) {
    const b = p.scope.getBinding(p.node.name);
    if (b?.path.isVariableDeclarator()) {
      const loop = b.path.parentPath.parentPath;
      if (loop.isForOfStatement()) return staticKeys(loop.get('right'), seen);
      return staticKeys(b.path.get('init'), seen);
    }
  }
  return [];
}

function parse(code) {
  return parser.parse(code, {sourceType: 'unambiguous', allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true, errorRecovery: false});
}

function unit(file, code, line = 1, kind = 'product') {
  const ast = parse(code), paths = new Map();
  traverse(ast, {enter(p) { paths.set(p.node, p); }});
  return {file, code, line, kind, ast, paths};
}

function loc(u, p) {
  let owner = '<top-level>';
  for (let f = p.getFunctionParent(); f; f = f.getFunctionParent()) {
    const label = f.node.id?.name || (f.parentPath.isVariableDeclarator() ? f.parentPath.node.id.name : null)
      || (f.isObjectMethod() ? key(f.node.key) : null);
    if (label) { owner = label; break; }
  }
  return {file: u.file, line: u.line + p.node.loc.start.line - 1,
    owner};
}

// Provenance follows lexical bindings (including renaming/destructuring), never
// a bare method-name grep. A dependency parameter can be seeded separately.
function resolve(p, seeds = new Map(), seen = new Set()) {
  if (!p?.node || seen.has(p.node)) return [];
  seen = new Set(seen).add(p.node);
  if (p.isIdentifier()) {
    if (/^VibeMol\w+$/.test(p.node.name) && !p.scope.getBinding(p.node.name)) return [p.node.name];
    const b = p.scope.getBinding(p.node.name);
    if (!b) return [];
    if (seeds.has(b.identifier)) return seeds.get(b.identifier);
    const d = b.path;
    if (d.isVariableDeclarator()) {
      const values = resolve(d.get('init'), seeds, seen);
      if (d.node.id.type === 'Identifier') return values;
      if (d.node.id.type === 'ObjectPattern') {
        const prop = d.node.id.properties.find(x => x.type === 'ObjectProperty'
          && (x.value.name || x.value.left?.name) === p.node.name);
        if (prop && /^VibeMol\w+$/.test(key(prop.key))) return [key(prop.key)];
        return prop ? values.map(x => x + '.' + key(prop.key)) : [];
      }
    }
    // Assignment aliases are common in feature detection and browser harnesses.
    return union(...b.constantViolations.filter(x => x.isAssignmentExpression())
      .map(x => resolve(x.get('right'), seeds, seen)));
  }
  if (member(p)) {
    const keys = p.node.computed ? staticKeys(p.get('property')) : [key(p.node.property)].filter(Boolean);
    if (!keys.length) return [];
    const k = keys[0];
    // VM test contexts expose the same named namespace as window/global.
    if (/^VibeMol\w+$/.test(k)) return [k];
    return resolve(p.get('object'), seeds, seen).flatMap(x => keys.map(k => x + '.' + k));
  }
  if (p.isLogicalExpression()) return union(resolve(p.get('left'), seeds, seen), resolve(p.get('right'), seeds, seen));
  if (p.isConditionalExpression()) return union(resolve(p.get('consequent'), seeds, seen), resolve(p.get('alternate'), seeds, seen));
  if (p.isAssignmentPattern()) return resolve(p.get('left'), seeds, seen);
  if (call(p) && p.get('callee').isIdentifier()) {
    const b = p.scope.getBinding(p.node.callee.name);
    const fn = b?.path.isFunction() ? b.path
      : b?.path.isVariableDeclarator() && b.path.get('init').isFunction() ? b.path.get('init') : null;
    if (fn) {
      const returns = [];
      fn.traverse({ReturnStatement(r) {
        if (r.getFunctionParent() === fn) returns.push(...resolve(r.get('argument'), seeds, seen));
      }});
      return union(returns);
    }
  }
  return [];
}

function object(p) {
  if (p?.isObjectExpression()) return p;
  if (call(p) && ['Object.freeze', 'Object.seal'].includes(p.get('callee').toString())) return object(p.get('arguments.0'));
  if (p?.isIdentifier()) {
    const b = p.scope.getBinding(p.node.name);
    if (b?.path.isVariableDeclarator()) return object(b.path.get('init'));
  }
  return null;
}

function namedReturn(units, file, name) {
  const u = units.find(x => x.file === file);
  let result;
  traverse(u.ast, {FunctionDeclaration(p) {
    if (p.node.id.name !== name) return;
    p.traverse({ReturnStatement(r) {
      if (r.getFunctionParent() === p && object(r.get('argument'))) result = object(r.get('argument'));
    }});
  }});
  assert(result, `Missing reviewed public return ${file}:${name}`);
  return {u, obj: result};
}

function exportsOf(units) {
  const exports = new Map(), namespaces = new Set();
  const add = (ns, obj, u, assignment) => {
    for (const prop of obj.get('properties')) {
      assert(!prop.isSpreadElement(), `Unresolved export spread: ${ns} ${u.file}`);
      const k = key(prop.node.key);
      assert(k && !prop.node.computed, `Unresolved export key: ${ns} ${u.file}`);
      const id = ns + '.' + k;
      const value = prop.isObjectMethod() ? prop : prop.get('value');
      exports.set(id, {id, namespace: ns, member: k, definition: loc(u, prop),
        exposure: loc(u, assignment), u, value, refs: [], invocations: [], deps: []});
    }
  };
  for (const u of units.filter(x => x.file.startsWith('assets/app/js/'))) {
    traverse(u.ast, {AssignmentExpression(p) {
      const ns = resolve(p.get('left'));
      if (ns.length !== 1 || !/^VibeMol\w+$/.test(ns[0])) return;
      assert(!namespaces.has(ns[0]), `Repeated namespace publication: ${ns[0]}`);
      namespaces.add(ns[0]);
      const obj = object(p.get('right'));
      if (obj) return add(ns[0], obj, u, p);
      // These public APIs are factories, not syntactic export literals. Resolve
      // their reviewed return objects, including Preset's overriding wrapper.
      const factories = {
        VibeMolStructure: ['assets/app/js/structure-transport.js', 'getPublicApi'],
        VibeMolEmbed: ['assets/app/js/file-loader.js', 'getPublicEmbedApi'],
        VibeMolPreset: ['assets/app/js/preset.js', 'getPublicApi'],
      };
      assert(factories[ns[0]], `Unresolved export object ${ns[0]} at ${u.file}:${p.node.loc.start.line}`);
      const result = namedReturn(units, ...factories[ns[0]]);
      add(ns[0], result.obj, result.u, result.obj);
      for (const e of exports.values()) if (e.namespace === ns[0]) e.exposure = loc(u, p);
      if (ns[0] === 'VibeMolPreset') {
        let overrides;
        traverse(u.ast, {FunctionDeclaration(f) {
          if (f.node.id.name !== 'getSceneGraphAwarePresetPublicApi') return;
          f.traverse({CallExpression(c) {
            if (c.get('callee').toString() === 'Object.assign' && c.getFunctionParent() === f)
              overrides = c.get('arguments').find(a => a.isObjectExpression() && a.node.properties.length);
          }});
        }});
        assert(overrides, 'Public Preset wrapper override could not be resolved');
        add(ns[0], overrides, u, p);
      }
    }});
  }
  return {exports, namespaces};
}

function functionOf(p, exports, seen = new Set()) {
  if (!p?.node || seen.has(p.node)) return null;
  seen = new Set(seen).add(p.node);
  if (p.isFunction()) return p;
  const ids = resolve(p);
  if (ids.length === 1 && exports.has(ids[0])) return functionOf(exports.get(ids[0]).value, exports, seen);
  if (p.isIdentifier()) {
    const b = p.scope.getBinding(p.node.name);
    if (b?.path.isFunction()) return b.path;
    if (b?.path.isVariableDeclarator()) return functionOf(b.path.get('init'), exports, seen);
  }
  return null;
}

function dependencySeeds(fn, index) {
  let param = fn.get('params')[index];
  if (param?.isAssignmentPattern()) param = param.get('left');
  if (param?.isIdentifier()) return new Map([[fn.scope.getBinding(param.node.name).identifier, ['$deps']]]);
  if (param?.isObjectPattern()) {
    const seeds = new Map();
    for (const prop of param.node.properties) {
      if (prop.type !== 'ObjectProperty') continue;
      const name = prop.value.name || prop.value.left?.name, b = fn.scope.getBinding(name);
      if (b) seeds.set(b.identifier, ['$deps.'+key(prop.key)]);
    }
    return seeds;
  }
  return new Map();
}

function dependencyProof(p, exported, units, exports) {
  if (!p.parentPath.isObjectProperty() || p.key !== 'value') return [];
  const prop = p.parentPath, obj = prop.parentPath, invocation = obj.parentPath;
  if (!call(invocation)) return [];
  const fn = functionOf(invocation.get('callee'), exports);
  if (!fn) return [];
  const index = invocation.node.arguments.indexOf(obj.node);
  const seeds = dependencySeeds(fn, index);
  if (!seeds.size) return [];
  const wanted = '$deps.' + key(prop.node.key), sites = [];
  const u = units.find(x => x.paths.has(fn.node));
  fn.traverse({'CallExpression|OptionalCallExpression'(c) {
    if (resolve(c.get('callee'), seeds).includes(wanted)) sites.push(loc(u, c));
  }});
  return sites.map(site => ({...site, via: loc(units.find(x => x.paths.has(p.node)), prop), export: exported}));
}

function analyze(units, policy) {
  const {exports, namespaces} = exportsOf(units), unresolved = [];
  for (const u of units) {
    const record = (p, kind) => {
      if (member(p) && p.node.computed && !staticKeys(p.get('property')).length) {
        for (const ns of resolve(p.get('object'))) if (namespaces.has(ns)) {
          unresolved.push({...loc(u, p), namespace: ns, expression: p.toString(), kind: u.kind});
        }
      }
      for (const token of resolve(p)) {
        const id = token.split('.').slice(0, 2).join('.'), e = exports.get(id);
        if (!e || e.definition.file === u.file || e.exposure.file === u.file) continue;
        // Namespace member paths count once, at the exported member, not once
        // per suffix in chained reads. Alias calls count at their lexical use.
        if (member(p) && token.split('.').length !== 2) continue;
        const site = {...loc(u, p), kind: u.kind, use: kind};
        e.refs.push(site);
        if (call(p.parentPath) && p.parentPath.node.callee === p.node) e.invocations.push(site);
        if (u.kind === 'product') e.deps.push(...dependencyProof(p, id, units, exports));
      }
    };
    traverse(u.ast, {
      MemberExpression(p) { record(p, 'member'); },
      OptionalMemberExpression(p) { record(p, 'member'); },
      ReferencedIdentifier(p) { record(p, 'alias'); },
      VariableDeclarator(p) {
        if (p.node.id.type !== 'ObjectPattern') return;
        for (const prop of p.get('id.properties')) {
          if (!prop.isObjectProperty()) continue;
          for (const ns of resolve(p.get('init'))) {
            const e = exports.get(ns + '.' + key(prop.node.key));
            if (e && e.definition.file !== u.file) e.refs.push({...loc(u, prop), kind: u.kind, use: 'destructure'});
          }
        }
      },
      'CallExpression|OptionalCallExpression'(p) {
        if (u.kind !== 'product') return;
        const fn = functionOf(p.get('callee'), exports);
        if (!fn) return;
        const receiver = units.find(x => x.paths.has(fn.node));
        for (const [index, arg] of p.get('arguments').entries()) {
          if (!arg.isObjectExpression()) continue;
          const seeds = dependencySeeds(fn, index);
          if (!seeds.size) continue;
          for (const prop of arg.get('properties')) {
            if (!prop.isObjectProperty()) continue;
            const tokens = resolve(prop.get('value')).filter(x => /^VibeMol\w+$/.test(x));
            for (const ns of tokens) {
              const prefix = '$deps.' + key(prop.node.key) + '.';
              fn.traverse({'CallExpression|OptionalCallExpression'(c) {
                for (const target of resolve(c.get('callee'), seeds)) {
                  if (!target.startsWith(prefix)) continue;
                  const e = exports.get(ns + '.' + target.slice(prefix.length));
                  if (e) {
                    const site = {...loc(receiver, c), kind: 'product', use: 'dependency-invocation'};
                    e.refs.push(site);
                    e.deps.push({...site, via: loc(u, prop), export: e.id});
                  }
                }
              }});
            }
          }
        }
      },
    });
  }
  const entries = [...exports.values()].sort((a,b) => a.id.localeCompare(b.id)).map(e => {
    const uniq = xs => [...new Map(xs.map(x => [JSON.stringify(x), x])).values()];
    e.refs = uniq(e.refs); e.invocations = uniq(e.invocations); e.deps = uniq(e.deps);
    const product = e.refs.filter(x => x.kind === 'product');
    const tests = e.refs.filter(x => x.kind === 'test');
    const auxiliary = e.refs.filter(x => x.kind === 'auxiliary');
    const calls = e.invocations.filter(x => x.kind === 'product');
    const isFunction = !!functionOf(e.value, exports);
    let bucket, reason;
    if (policy.harnessNamespaces.includes(e.namespace)) { bucket = 'harness surface'; reason = 'Explicitly test-facing home object; preserve regardless of current test-reference count.'; }
    else if (calls.length) { bucket = 'live'; reason = 'Direct product invocation, following lexical aliases.'; }
    else if (e.deps.length) { bucket = 'deps-passed'; reason = 'Product dependency hand-off with a verified callee invocation.'; }
    else if (product.length && !isFunction) { bucket = 'live'; reason = 'Product reads/passes this exported data value; not a function-call claim.'; }
    else if (policy.consoleNamespaces.includes(e.namespace)) { bucket = 'console/API'; reason = policy.consoleReasons[e.namespace]; }
    else if (auxiliary.length) { bucket = 'console/API'; reason = 'Used by a repository client/diagnostic outside the product; retain tooling API.'; }
    else if (tests.length || product.length) { bucket = 'built-but-unwired'; reason = product.length
      ? 'Product names this function but no product invocation or verified dependency invocation was found; inspect recorded imports/guards/hand-offs before wiring.'
      : 'Product-module export with executable tests but no product caller; retain tests and investigate wiring/intent separately.'; }
    else { bucket = 'unreached'; reason = 'No executable reference outside the defining/exposure files.'; }
    return {id: e.id, definition: e.definition, exposure: e.exposure, bucket, reason,
      externalReferenceCount: e.refs.length, references: e.refs, invocations: e.invocations, dependencyInvocations: e.deps,
      valueKind: isFunction ? 'function' : 'data-or-factory-value',
      internalCalls: e.value.isIdentifier() ? (e.value.scope.getBinding(e.value.node.name)?.referencePaths || [])
        .filter(p => call(p.parentPath) && p.parentPath.node.callee === p.node).map(p => loc(e.u, p)) : []};
  });
  const counts = Object.fromEntries(buckets.map(b => [b, entries.filter(e => e.bucket === b).length]));
  return {schemaVersion: 1, namespaceCount: namespaces.size, memberCount: entries.length, counts,
    limits: policy.limits, unresolved, entries};
}

function loadUnits(root) {
  const files = cp.execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
  const units = [], skippedSnippets = [];
  const pythonFiles = [];
  for (const file of files) {
    if (file.startsWith('tests/baselines/') || file.startsWith('assets/vendor/')
        || file === POLICY || file.includes('audit-capabilit') || file.includes('capability-audit')
        || file.includes('dead-capabilit')) continue;
    const kind = file.startsWith('tests/') ? 'test'
      : /^(assets\/app\/js\/|src\/|index.html$)/.test(file) ? 'product' : 'auxiliary';
    if (/\.(?:js|mjs|cjs)$/.test(file)) {
      const u = unit(file, fs.readFileSync(path.join(root, file), 'utf8'), 1,
        file === 'assets/app/js/qa-characterize.js' ? 'test' : kind);
      units.push(u);
      if (kind !== 'product') traverse(u.ast, {enter(p) {
        const s = p.isStringLiteral() ? p.node.value
          : p.isTemplateLiteral() && !p.node.expressions.length ? p.node.quasis[0].value.cooked : null;
        if (!s?.includes('VibeMol') || !call(p.parentPath)
            || !/evaluate|runInContext/.test(p.parentPath.get('callee').toString())) return;
        try { units.push(unit(file, s, p.node.loc.start.line, kind)); }
        catch { skippedSnippets.push({file, line: p.node.loc.start.line, explicitMembersRetained: 0}); }
      }});
    } else if (/\.py$/.test(file)) pythonFiles.push(file);
    else if (/\.html$/.test(file)) {
      const s = fs.readFileSync(path.join(root, file), 'utf8');
      for (const m of s.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
        if (!m[1].trim() || /type=["'](?:importmap|application\/)/.test(m[0])) continue;
        units.push(unit(file, m[1], s.slice(0, m.index + m[0].indexOf('>') + 1).split('\n').length, kind));
      }
    }
  }
  const snippets = JSON.parse(cp.execFileSync('python3', ['-c',
    'import ast,json,sys,pathlib\nr=[]\nfor f in json.loads(sys.stdin.read()):\n t=ast.parse(pathlib.Path(f).read_text())\n for n in ast.walk(t):\n  if isinstance(n,ast.Constant) and isinstance(n.value,str) and ("VibeMol" in n.value or len(n.value)>60):r.append([f,n.lineno,n.value])\nprint(json.dumps(r))',
  ], {cwd: root, input: JSON.stringify(pythonFiles), encoding: 'utf8', maxBuffer: 32*1024*1024}));
  for (const [file, line, code] of snippets) {
    try { units.push(unit(file, code, line, file.startsWith('tests/') ? 'test' : 'auxiliary')); }
    catch {
      if (!code.includes('VibeMol')) continue;
      // Incomplete/f-string JavaScript fragments still retain explicit qualified
      // member references. Never guess a receiver from a bare method name.
      const names = [...code.matchAll(/(?:window\.|global\.|globalThis\.)?(VibeMol\w+)\??\.([A-Za-z_$][\w$]*)/g)];
      const stub = names.map(m => `${m[1]}.${m[2]};`).join('\n');
      if (stub) units.push(unit(file, stub, line, file.startsWith('tests/') ? 'test' : 'auxiliary'));
      skippedSnippets.push({file, line, explicitMembersRetained: names.length});
    }
  }
  return {units, skippedSnippets};
}

function checkBaseline(report, baseline, predecessor) {
  const actual = report.entries.filter(e => e.bucket === 'unreached').map(e => e.id).sort();
  const allowed = baseline.unreached;
  assert.equal(new Set(allowed).size, allowed.length, 'Duplicate baseline identities');
  const growth = actual.filter(x => !allowed.includes(x));
  const baselineGrowth = predecessor ? allowed.filter(x => !predecessor.unreached.includes(x)) : [];
  const actualUnwired = report.entries.filter(e => e.bucket === 'built-but-unwired').map(e => e.id).sort();
  const unwiredGrowth = actualUnwired.filter(x => !(baseline.builtButUnwired || []).includes(x));
  const unwiredBaselineGrowth = predecessor ? (baseline.builtButUnwired || [])
    .filter(x => !(predecessor.builtButUnwired || []).includes(x)) : [];
  console.log(JSON.stringify({counts: report.counts, actualUnreached: actual, growth, baselineGrowth,
    actualBuiltButUnwired: actualUnwired, unwiredGrowth, unwiredBaselineGrowth,
    staleAllowances: allowed.filter(x => !actual.includes(x))}, null, 2));
  assert.deepEqual(growth, [], 'New unreached exports require human disposition/authorization');
  assert.deepEqual(baselineGrowth, [], 'Unreached baseline may shrink; growth requires new human authorization');
  assert.deepEqual(unwiredGrowth, [], 'New built-but-unwired exports require human disposition/authorization');
  assert.deepEqual(unwiredBaselineGrowth, [], 'Built-but-unwired baseline may shrink; growth requires new human authorization');
  const calibration = report.entries.find(e => e.id === baseline.calibration.id);
  assert(calibration && calibration.bucket === baseline.calibration.expectedBucket,
    'Calibration disposition changed; inspect the actual external call before changing expectations');
}

function markdown(report) {
  const source = x => `[${x.file}:${x.line}](../../${x.file}#L${x.line})`;
  const rows = ['# Export capability inventory', '',
    'Generated by `tools/audit-capabilities.cjs --markdown`. Direct-use inventory, not a deletion list. Nothing is removed.', '',
    `Source snapshot: ${report.sourceCommit}. ${report.namespaceCount} namespaces / ${report.memberCount} direct members.`, '',
    '| Disposition | Members |', '| --- | ---: |',
    ...buckets.map(b => `| ${b} | ${report.counts[b]} |`), '',
    'The API census matches every in-scope member of `tests/baselines/characterize-summary.json`. Its ListPopover, Prefs and Tooltip namespaces are defined under src/ and are outside the requested assets/app/js definition scope.', '',
    'The corrected calibration is **VibeMolCoordination.listHaloCoordinationChoices → built-but-unwired**: its test calls it; no product caller exists. Preserve the test.', '',
    `${report.entries.filter(e => e.bucket === 'built-but-unwired' && e.internalCalls.length).length} of ${report.counts['built-but-unwired']} built-but-unwired exports and ${report.entries.filter(e => e.bucket === 'unreached' && e.internalCalls.length).length} of ${report.counts.unreached} unreached exports have calls inside their own module. Most therefore are unused exported faces of privately used implementations, not evidence of abandoned or unfinished behavior. Remaining call-free entries include data and compatibility aliases; their intent still needs per-item review.`, '',
    'A product import/availability guard alone is not a caller. Such functions appear in built-but-unwired with their external-reference count preserved. Internal calls mean the module itself uses the implementation, so its exported face being unused does not establish an unfinished feature. No entry here is declared safe to prune.', '',
    'Counts are static reference sites, not runtime frequency. A destructuring read and a later alias call are separate sites. References in the defining/exposure files are excluded from the external count. Raw per-site references, direct calls and receiving-factory invocation proofs are emitted by --out.', ''];
  for (const b of buckets) {
    rows.push('## '+b, '', '| Export member | External sites | Internal calls | Definition | Disposition |', '| --- | ---: | ---: | --- | --- |');
    for (const e of report.entries.filter(e => e.bucket === b)) {
      const disposition = b === 'built-but-unwired' || b === 'unreached'
        ? e.internalCalls.length ? 'Retain; implementation is used inside its home module. Review exported API intent separately.'
          : 'Retain; investigate intended use/alternative wiring before any per-item decision.'
        : e.reason;
      rows.push(`| ${e.id} | ${e.externalReferenceCount} | ${e.internalCalls.length} | ${source(e.definition)} | ${disposition} |`);
    }
    rows.push('');
  }
  rows.push('## Limits', '', ...report.limits.map(x => '- '+x), '',
    'Unresolved computed member expressions are reported rather than guessed:', '',
    ...report.unresolved.map(x => `- ${source(x)}: \`${x.expression}\` (${x.kind}).`), '',
    'Python fragment fallbacks are separately enumerated in the raw output; they are mostly prose or split strings and never count bare member names. The two unresolved element-utils expressions enumerate the legacy fixture catalog; every possible target already has another resolved use, so neither changes a disposition.', '');
  return rows.join('\n');
}

function main() {
  const args = process.argv.slice(2), value = flag => args.includes(flag) ? args[args.indexOf(flag)+1] : null;
  const root = path.resolve(value('--root') || ROOT), policy = JSON.parse(fs.readFileSync(path.join(root, POLICY)));
  const {units, skippedSnippets} = loadUnits(root), report = analyze(units, policy);
  report.sourceCommit = cp.execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root,encoding:'utf8'}).trim();
  report.fragmentFallbacks = skippedSnippets;
  // The existing runtime census is the starting surface contract. AST recovery
  // supplies definitions/aliases and the factory-return facades it cannot explain.
  const summary = JSON.parse(fs.readFileSync(path.join(root, 'tests/baselines/characterize-summary.json'))).api;
  const actual = report.entries.map(e => e.id).sort(), homes = new Set(report.entries.map(e => e.id.split('.')[0]));
  const expected = Object.entries(summary).filter(([ns]) => homes.has(ns)).flatMap(([ns, ms]) => ms.map(m => ns+'.'+m)).sort();
  assert.deepEqual(actual, expected, 'Source enumeration differs from the existing runtime API surface census');
  report.surfaceCrossCheck = {summary: 'tests/baselines/characterize-summary.json', inScopeMembers: expected.length,
    outsideAssetsAppJs: Object.keys(summary).filter(ns => !homes.has(ns)).sort(), exact: true};
  if (value('--out')) fs.writeFileSync(value('--out'), JSON.stringify(report, null, 2) + '\n');
  if (value('--markdown')) fs.writeFileSync(value('--markdown'), markdown(report));
  if (args.includes('--inventory')) console.log(JSON.stringify({namespaces: report.namespaceCount, members: report.memberCount, counts: report.counts}));
  else {
    const baseline = JSON.parse(fs.readFileSync(path.join(root, BASELINE)));
    let predecessor = null;
    let base = value('--base');
    if (!base && process.env.GITHUB_EVENT_PATH) {
      const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH));
      base = event.pull_request?.base?.sha || event.before;
    }
    if (!base) base = cp.execFileSync('git', ['merge-base','HEAD','origin/main'], {cwd:root,encoding:'utf8'}).trim();
    if (base && !/^0+$/.test(base)) {
      const old = cp.spawnSync('git', ['show', `${base}:${BASELINE}`], {cwd: root, encoding: 'utf8'});
      if (!old.status) predecessor = JSON.parse(old.stdout);
    }
    checkBaseline(report, baseline, predecessor);
  }
}
module.exports = {analyze, unit, checkBaseline, resolve, staticKeys};
if (require.main === module) main();
