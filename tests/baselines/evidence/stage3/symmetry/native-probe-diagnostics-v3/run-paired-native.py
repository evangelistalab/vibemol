import json
import os
import pathlib
import subprocess
import sys

root = pathlib.Path.cwd()
folder = root / 'out/test-artifacts/stage3/symmetry'
env = {**os.environ, 'PYTHONPATH': str(root / 'out/test-artifacts/browser-repair/runtime-site'),
       'PYTHONPYCACHEPREFIX': str(folder / 'pycache'), 'PYTHONUNBUFFERED': '1'}
reports = {}
for label, source in [('tagged-base', root / 'out/test-artifacts/stage3/tagged-base'), ('proposed', root)]:
    dest = folder / 'native' / label
    dest.mkdir(parents=True, exist_ok=True)
    with (dest / 'run.log').open('w') as log:
        result = subprocess.run([sys.executable, str(folder / 'native-matrix.py'), '--source-root', str(source),
                                 '--artifacts', str(dest)], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    assert (dest / 'result.json').exists(), (dest / 'run.log').read_text()[-4000:]
    reports[label] = json.loads((dest / 'result.json').read_text())
    reports[label]['collectorExitCode'] = result.returncode
    print(json.dumps({'source': label, 'exitCode': result.returncode,
                      'cases': [{k: c.get(k) for k in ['launch', 'theme', 'status', 'error']} for c in reports[label]['cases']]}), flush=True)
    if result.returncode:
        print((dest / 'run.log').read_text()[-6000:], flush=True)
base, proposed = reports['tagged-base'], reports['proposed']
comparison = {'taggedAppSha256': base['sourceAppSha256'], 'proposedAppSha256': proposed['sourceAppSha256'],
              'taggedCollectorExitCode': base['collectorExitCode'], 'proposedCollectorExitCode': proposed['collectorExitCode'],
              'caseObservationsExactlyEqual': base['cases'] == proposed['cases'],
              'assertionsRelaxed': False, 'retries': 0, 'cases': proposed['cases']}
(folder / 'native/comparison.json').write_text(json.dumps(comparison, indent=2) + '\n')
assert comparison['caseObservationsExactlyEqual'], 'STOP: source observations differ; inspect raw paired evidence'
assert base['collectorExitCode'] == proposed['collectorExitCode'], 'STOP: proposed-only manual failure'
print(json.dumps({k: comparison[k] for k in ['caseObservationsExactlyEqual', 'taggedCollectorExitCode', 'proposedCollectorExitCode']}), flush=True)
