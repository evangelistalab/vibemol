// Conservative diagnostic census, not an alias-analysis proof or a merge gate.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const babel = name => require(process.env.VIBEMOL_BABEL_ROOT ? path.join(process.env.VIBEMOL_BABEL_ROOT, name) : '@babel/' + name);
const parser = babel('parser'),
  traverse = babel('traverse').default;
const output = process.argv[2];
if (!output) throw new Error('Usage: node tools/diagnostics/scientific_buffer_census.cjs OUTPUT.json');
const fields = new Set(['data', 'alphaRe', 'alphaIm', 'betaRe', 'betaIm', 'frames', 'coefficients', 'displacements', 'equilibrium', 'frameBuffer', 'molden', 'trajectory', 'vibration', 'cubeData']);
const numericParams = new Set(['data', 'frame', 'frames', 'coeffs', 'coefficients', 'eq', 'disp', 're', 'im', 'raw', 'values', 'buffer', 'coords']);
const mutators = new Set(['set', 'fill', 'sort', 'reverse', 'copyWithin', 'push', 'pop', 'shift', 'unshift', 'splice']);
const files = fs.readdirSync(path.join(root, 'assets/app/js')).filter(x => x.endsWith('.js')).map(x => 'assets/app/js/' + x);
const report = {
  sourceCommit: require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8'
  }).trim(),
  files: [],
  mutations: [],
  boundaries: [],
  fieldFunctions: []
};
const unique = xs => [...new Set(xs.flat())];
for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), 'utf8'),
    ast = parser.parse(source, {
      sourceType: 'unambiguous'
    }),
    text = p => source.slice(p.node.start, p.node.end),
    key = p => p?.node ? p.isIdentifier() ? p.node.name : p.isStringLiteral() ? p.node.value : null : null;
  const functionName = p => {
    const f = p.getFunctionParent();
    if (!f) return '<script>';
    if (f.node.id) return f.node.id.name;
    const parent = f.parentPath;
    if (parent.isVariableDeclarator()) return key(parent.get('id')) || '<variable>';
    if (parent.isObjectProperty() || parent.isObjectMethod()) return key(parent.get('key')) || '<property>';
    return '<callback@' + f.node.loc.start.line + '>';
  };
  const member = p => p && (p.isMemberExpression() || p.isOptionalMemberExpression());
  function origins(p, seen = new Set()) {
    if (!p?.node || seen.has(p.node)) return [];
    seen = new Set(seen).add(p.node);
    if (p.isIdentifier()) {
      const binding = p.scope.getBinding(p.node.name);
      if (!binding) return [];
      if (binding.kind === 'param') return ['parameter:' + p.node.name];
      const init = binding.path.isVariableDeclarator() ? binding.path.get('init') : null;
      return unique([origins(init, seen), ...binding.constantViolations.filter(x => x.isAssignmentExpression()).map(x => origins(x.get('right'), seen))]);
    }
    if (member(p)) {
      const prop = key(p.get('property'));
      if (!p.node.computed && fields.has(prop)) return ['field:' + text(p)];
      const src = origins(p.get('object'), seen);
      if (prop === 'buffer') return src.map(x => 'buffer-view:' + x);
      if (p.node.computed && src.some(x => /frames(?:$|\b)/.test(x))) return src.map(x => 'frame-element:' + x);
      return [];
    }
    if (p.isNewExpression() && /^(?:Float|Uint|Int|BigInt|BigUint)\d+(?:Clamped)?Array$/.test(text(p.get('callee')))) {
      const input = p.get('arguments')[0],
        origin = origins(input, seen);
      if (origin.some(x => x.startsWith('buffer-view:'))) return origin.map(x => 'shared-buffer-view:' + x);
      return ['owned-allocation@' + p.node.loc.start.line];
    }
    if (p.isArrayExpression()) return ['owned-array@' + p.node.loc.start.line];
    if (p.isCallExpression() || p.isOptionalCallExpression()) {
      const callee = p.get('callee');
      if (member(callee)) {
        const prop = key(callee.get('property')),
          src = origins(callee.get('object'), seen);
        if (prop === 'subarray') return src.map(x => 'subarray:' + x);
        if (['slice', 'map', 'filter', 'from', 'of'].includes(prop)) return src.length || /Array\.(from|of)$/.test(text(callee)) ? ['copy-or-owned-container@' + p.node.loc.start.line] : [];
      }
    }
    if (p.isConditionalExpression()) return unique([origins(p.get('consequent'), seen), origins(p.get('alternate'), seen)]);
    if (p.isLogicalExpression()) return unique([origins(p.get('left'), seen), origins(p.get('right'), seen)]);
    return [];
  }
  const row = (p, more) => ({
    file,
    line: p.node.loc.start.line,
    function: functionName(p),
    source: text(p).replace(/\s+/g, ' ').slice(0, 420),
    ...more
  });
  const touches = new Map();
  traverse(ast, {
    MemberExpression(p) {
      const prop = key(p.get('property'));
      if (!p.node.computed && fields.has(prop)) {
        const name = functionName(p);
        if (!touches.has(name)) touches.set(name, new Set());
        touches.get(name).add(prop);
      }
    },
    AssignmentExpression(p) {
      const left = p.get('left');
      if (member(left)) {
        const origin = origins(left.get('object'));
        const prop = key(left.get('property'));
        if (origin.length) report.mutations.push(row(p, {
          kind: p.node.operator === '=' ? 'indexed/property-write' : 'read-modify-write',
          computed: !!left.node.computed,
          target: text(left.get('object')),
          origin
        }));else if (!left.node.computed && fields.has(prop)) report.boundaries.push(row(p, {
          kind: 'field-rebind',
          field: prop,
          origin: origins(p.get('right'))
        }));
      }
    },
    UpdateExpression(p) {
      const left = p.get('argument');
      if (member(left)) {
        const origin = origins(left.get('object'));
        if (origin.length) report.mutations.push(row(p, {
          kind: 'increment',
          origin
        }));
      }
    },
    CallExpression(p) {
      const callee = p.get('callee');
      if (member(callee) && mutators.has(key(callee.get('property')))) {
        const origin = origins(callee.get('object'));
        if (origin.length) report.mutations.push(row(p, {
          kind: 'method:' + key(callee.get('property')),
          origin
        }));
      }
      p.get('arguments').forEach((arg, index) => {
        const origin = origins(arg);
        if (origin.length) report.boundaries.push(row(p, {
          kind: 'argument-borrow',
          argument: index,
          origin
        }));
      });
    },
    ReturnStatement(p) {
      if (!p.node.argument) return;
      const arg = p.get('argument'),
        origin = origins(arg);
      if (origin.length) report.boundaries.push(row(p, {
        kind: 'return',
        origin
      }));
      if (arg.isObjectExpression()) for (const prop of arg.get('properties')) {
        if (prop.isObjectProperty()) {
          const src = origins(prop.get('value'));
          if (src.length) report.boundaries.push(row(prop, {
            kind: 'returned-member',
            origin: src
          }));
        }
      }
    }
  });
  report.files.push({
    file,
    sha256: crypto.createHash('sha256').update(source).digest('hex')
  });
  report.fieldFunctions.push(...[...touches].map(([fn, s]) => ({
    file,
    function: fn,
    fields: [...s].sort()
  })));
}
fs.mkdirSync(path.dirname(path.resolve(output)), {
  recursive: true
});
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', {
  flag: 'wx'
});
console.log(JSON.stringify({
  files: report.files.length,
  mutations: report.mutations.length,
  boundaries: report.boundaries.length,
  fieldFunctions: report.fieldFunctions.length
}));
