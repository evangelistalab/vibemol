"""One unchanged event replay per source/suite; retain any tagged findings."""
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import time

root = pathlib.Path.cwd()
out = root / 'out/test-artifacts/stage3/symmetry/manual'
out.mkdir(parents=True, exist_ok=True)
env = {**os.environ, 'PYTHONPATH': str(root / 'out/test-artifacts/browser-repair/runtime-site'),
       'PYTHONPYCACHEPREFIX': str(root / 'out/test-artifacts/stage3/symmetry/pycache'),
       'PYTHONUNBUFFERED': '1'}
results = []
for label, source in [('tagged-base', root / 'out/test-artifacts/stage3/tagged-base'), ('proposed', root)]:
    for suite in ['symmetry_panel', 'workbench_bar', 'workbench_consistency', 'floating_panels']:
        dest = out / label / suite
        dest.mkdir(parents=True, exist_ok=True)
        command = [sys.executable, str(out.parent / 'replay-ui-suite.py'), suite,
                   '--source-root', str(source), '--artifacts', str(dest)]
        started = time.monotonic()
        with (dest / 'run.log').open('w') as log:
            result = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
        row = {'source': label, 'suite': suite, 'exitCode': result.returncode,
               'processWallTimeSeconds': round(time.monotonic() - started, 2),
               'sourceAppSha256': hashlib.sha256((source / 'assets/app/js/app.js').read_bytes()).hexdigest(),
               'testSha256': hashlib.sha256((root / 'tests/e2e' / (suite + '.py')).read_bytes()).hexdigest(),
               'rawLog': str((dest / 'run.log').relative_to(root)), 'assertionsChanged': False, 'waitsChanged': False}
        results.append(row)
        (out / 'stock-matrix.json').write_text(json.dumps(results, indent=2) + '\n')
        print(json.dumps(row), flush=True)
        if result.returncode:
            print((dest / 'run.log').read_text()[-5000:], flush=True)
            if label == 'proposed' and not next(r for r in results if r['source'] == 'tagged-base' and r['suite'] == suite)['exitCode']:
                raise SystemExit('STOP: proposed-only manual failure')
print('Completed paired stock replay; inspect raw results before classification.', flush=True)
