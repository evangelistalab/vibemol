"""Regenerate the PR283 CAS oracle from a pinned local forte2 checkout; never runs SCF."""
import argparse
import ast
import builtins
import hashlib
import json
from pathlib import Path
import subprocess
import types

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--forte2-root', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
commit = subprocess.check_output(['git', '-C', str(args.forte2_root), 'rev-parse', 'HEAD'], text=True).strip()
assert commit == 'e03c169bdf1b2aac62ea4197cd0ffa1b875d3b9f', ('Wrong upstream revision', commit)
source = (args.forte2_root/'forte2/orbitals/avas.py').read_text()
assert hashlib.sha256(source.encode()).hexdigest() == 'e3e0dc378986047ffa29c663aead4b85c79ddcffa6205a7c23aa840cb90697ed', 'Upstream source differs from the pinned oracle source' 
tree = ast.parse(source)
cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'AVAS')
node = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == '_check_parameters')
allowed = {'isinstance', 'min', 'max', 'abs', 'round', 'len', 'type', 'TypeError', 'ValueError', 'all', 'int'}
for call in (n for n in ast.walk(node) if isinstance(n, ast.Call)):
    if isinstance(call.func, ast.Name):
        assert call.func.id in allowed, ast.unparse(call.func)
    else:
        assert ast.unparse(call.func) in {'logger.log_info1', 'self.selection_method.lower'}, ast.unparse(call.func)

class RHF:
    pass

class ROHF(RHF):
    pass

class GHF:
    pass

namespace = {
    '__builtins__': {name: getattr(builtins, name) for name in allowed | {'tuple'}},
    'RHF': RHF, 'ROHF': ROHF, 'GHF': GHF,
    'logger': types.SimpleNamespace(log_info1=lambda *args: None),
}
exec(compile(ast.Module(body=[node], type_ignores=[]), 'forte2 parameter checker', 'exec'), namespace)
rows = []
for reference, ms in [('RHF', 0), ('ROHF', .5), ('ROHF', -.5), ('ROHF', 1), ('ROHF', -1), ('GHF', 0)]:
    electrons = 13 if abs(ms) == .5 else 14
    parent = {'RHF': RHF, 'ROHF': ROHF, 'GHF': GHF}[reference]()
    parent.system = types.SimpleNamespace(nmo=30)
    parent.ms, parent.nel = ms, electrons
    parent.na = (electrons + round(2 * ms)) // 2
    parent.nb = electrons - parent.na
    for e in range(17):
        for n in range(14):
            obj = types.SimpleNamespace(parent_method=parent, cas=(e, n), selection_method='cumulative',
                                        sigma=.98, cutoff=.1, num_active_docc=0, num_active_uocc=0, num_active=0)
            row = dict(reference=reference, ms=ms, referenceElectrons=electrons, spatialMOs=30, cas=[e, n])
            try:
                namespace['_check_parameters'](obj)
                row.update(ok=True, occupied=obj.num_active_docc, unoccupied=obj.num_active_uocc, backend=obj.selection_method)
            except Exception as error:
                row.update(ok=False, errorType=type(error).__name__, error=str(error))
            rows.append(row)
result = dict(
    forte2Commit=commit,
    sourceSha256=hashlib.sha256(source.encode()).hexdigest(),
    checkSha256=hashlib.sha256(ast.get_source_segment(source, node).encode()).hexdigest(),
    scope='Exact upstream parameter checker with synthetic SCF metadata; no SCF, no browser, no acceptance.',
    cases=rows,
)
args.output.write_text(json.dumps(result, separators=(',', ':')) + '\n')
examples = []
for row in rows:
    key = (row['reference'], row['ms'], row['cas'])
    if key in [('RHF', 0, [8, 6]), ('ROHF', -.5, [5, 6]), ('GHF', 0, [8, 12])]:
        examples.append(row)
print(json.dumps({'cases': len(rows), 'accepted': sum(r['ok'] for r in rows), 'examples': examples}, indent=2))
