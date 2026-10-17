"""Finish pending Selection observations, retaining failed baseline assertions.

The 2026-10-15 standing rule carries identical tagged findings. Exit 2 from the
menu collector still means a failed assertion, not a passing suite. Exact paired
observation equality is the refactor comparison; CI remains a separate gate.
"""
import json
import os
import pathlib
import subprocess
import sys
import time

root = pathlib.Path.cwd()
evidence = root / 'tests/baselines/evidence/stage3/selection'
out = root / 'out/test-artifacts/stage3/selection/manual-completed-v2'
out.mkdir(parents=True, exist_ok=True)
env = {**os.environ, 'PYTHONPATH': str(root/'out/test-artifacts/browser-repair/runtime-site'),
       'PYTHONPYCACHEPREFIX': str(root/'out/test-artifacts/stage3/selection/pycache')}
results = []
menus = []

def run(label, suite, source, command):
    dest = out/label/suite
    dest.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    with (dest/'run.log').open('w') as log:
        p = subprocess.run([sys.executable, str(command), '--source-root', str(source),
                            '--artifacts', str(dest)] +
                           (['--record-carried-findings'] if suite == 'selection_menus' else []),
                           stdout=log, stderr=subprocess.STDOUT, env=env, cwd=root)
    result = {'source': label, 'suite': suite, 'exitCode': p.returncode,
              'seconds': round(time.monotonic()-started, 2), 'result': str(dest/'result.json')}
    results.append(result)
    (out/'matrix-results.json').write_text(json.dumps(results, indent=2)+'\n')
    print(json.dumps(result), flush=True)
    return p.returncode, dest

for label, source in [('tagged-base',root/'out/test-artifacts/stage3/tagged-base'),('proposed',root)]:
    code, dest = run(label,'selection_menus',source,evidence/'selection-menu-matrix.py')
    if code not in [0, 2]:
        print((dest/'run.log').read_text()[-4000:],flush=True)
        raise SystemExit(code)
    menu = json.loads((dest/'result.json').read_text())
    assert len(menu['cases']) == 4
    menus.append(menu)

def observations(menu):
    return [{k:v for k,v in c.items() if k != 'seconds'} for c in menu['cases']]

assert observations(menus[0]) == observations(menus[1]), 'Proposed manual observations differ from tagged source'
comparison = {'status': 'identical observations; failed bounds assertions carried, not passed',
              'taggedBaseAppSha256': menus[0]['sourceAppSha256'],
              'proposedAppSha256': menus[1]['sourceAppSha256'],
              'allFourLaunchThemeObservationsExactlyEqual': True,
              'carriedFindings': [c['carriedFinding'] for c in menus[0]['cases'] if c['carriedFinding']],
              'assertionChanged': False, 'issue': 17}
(out/'paired-menu-comparison.json').write_text(json.dumps(comparison,indent=2)+'\n')
print(json.dumps(comparison),flush=True)

# Tagged stock-suite replays already passed and are preserved in manual-stop/.
# Complete only the four previously unrun proposed replays, with their current
# source/assertions/waits unchanged. Never count a historical run as CI evidence.
for suite in ['edit_picking','transform_selection','build_orbit','floating_panels']:
    dest = out/'proposed'/suite
    dest.mkdir(parents=True,exist_ok=True)
    started=time.monotonic()
    with (dest/'run.log').open('w') as log:
        p=subprocess.run([sys.executable,str(evidence/'replay-ui-suite.py'),suite,
                          '--source-root',str(root),'--artifacts',str(dest)],
                         stdout=log,stderr=subprocess.STDOUT,env=env,cwd=root)
    result={'source':'proposed','suite':suite,'exitCode':p.returncode,
            'seconds':round(time.monotonic()-started,2),'result':str(dest/'result.json')}
    results.append(result)
    (out/'matrix-results.json').write_text(json.dumps(results,indent=2)+'\n')
    print(json.dumps(result),flush=True)
    if p.returncode:
        print((dest/'run.log').read_text()[-4000:],flush=True)
        raise SystemExit(p.returncode)
