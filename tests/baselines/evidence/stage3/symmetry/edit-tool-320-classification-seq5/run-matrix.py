"""Exactly three serial focused runs on each of three immutable Git snapshots."""
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import tarfile
import time

root = pathlib.Path.cwd()
out = pathlib.Path(__file__).resolve().parent
plan_path = out / 'plan.json'
assert not plan_path.exists(), 'Existing checkpoint: resume it; do not duplicate these nine runs.'
sources = [
    ('tagged-base', '1c609b338344aaa49ffd11b9ee2ad834a6e0d85d'),
    ('integration', 'e35da9ca4721ad0645f9b0744aa38bfd9ca4b18d'),
    ('proposed', '537e95ff462b5f2eb5fd6d3518e4525c0ea18e2f'),
]
plan = {'reviewerSeq': 5, 'created': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'runsPerSource': 3, 'serial': True, 'sources': [], 'status': 'preparing',
        'method': 'Unchanged edit_tool.run setup/assertions/waits through the first 320px iteration; observation after original overflow evaluate; stop before 390 if target passes. No full-suite or CI retry claim.'}
for label, commit in sources:
    dest = out / 'sources' / label
    dest.mkdir(parents=True, exist_ok=False)
    # Git archive is a read-only export; the live/frozen worktrees stay unchanged.
    proc = subprocess.Popen(['git', 'archive', commit], cwd=root, stdout=subprocess.PIPE)
    with tarfile.open(fileobj=proc.stdout, mode='r|') as tf:
        for member in tf:
            assert not pathlib.PurePosixPath(member.name).is_absolute() and '..' not in pathlib.PurePosixPath(member.name).parts
            assert not member.issym() and not member.islnk(), member.name
            tf.extract(member, path=dest)
    assert proc.wait() == 0
    app = dest / 'assets/app/js/app.js'
    test = dest / 'tests/e2e/edit_tool.py'
    assert hashlib.sha256(test.read_bytes()).hexdigest() == '98a36be008222ed186e27e78db1c32bbc56bdbce093e1635b51b4ce7a0c647f0'
    plan['sources'].append({'label': label, 'commit': commit,
                            'tree': subprocess.check_output(['git', 'rev-parse', commit+'^{tree}'], cwd=root, text=True).strip(),
                            'appSha256': hashlib.sha256(app.read_bytes()).hexdigest(),
                            'testSha256': hashlib.sha256(test.read_bytes()).hexdigest(), 'sourceRoot': str(dest)})
plan['status'] = 'running'
plan_path.write_text(json.dumps(plan, indent=2) + '\n')
env = {**os.environ, 'PYTHONPATH': str(root / 'out/test-artifacts/browser-repair/runtime-site'),
       'PYTHONPYCACHEPREFIX': str(out / 'pycache'), 'PYTHONUNBUFFERED': '1'}
rows = []
for source in plan['sources']:
    for index in range(1, 4):
        folder = out / 'runs' / source['label'] / str(index)
        folder.parent.mkdir(parents=True, exist_ok=True)
        logpath = folder.parent / (str(index)+'.log')
        assert not logpath.exists() and not folder.exists()
        command = [sys.executable, str(out/'run-focused.py'), '--source-root', source['sourceRoot'], '--artifacts', str(folder)]
        before = time.monotonic()
        with logpath.open('x') as log:
            process = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
        result = json.loads((folder/'result.json').read_text())
        assert result['appSha256'] == source['appSha256'] and result['testSha256'] == source['testSha256']
        row = {'source': source['label'], 'commit': source['commit'], 'run': index, 'status': result['status'],
               'exitCode': process.returncode, 'wallTimeSeconds': round(time.monotonic()-before, 2),
               'overflow': result['overflowObservation'], 'result': str(folder/'result.json'), 'log': str(logpath)}
        rows.append(row)
        (out/'matrix.json').write_text(json.dumps(rows, indent=2)+'\n')
        print(json.dumps(row), flush=True)
        assert result['status'] in ('target-passed','target-failed'), 'Unexpected setup/test failure; preserve and report before any more runs.'
        assert not result['pageErrors'], 'Unexpected page errors; preserve and report.'
plan['status'] = 'completed-nine-runs'
plan_path.write_text(json.dumps(plan, indent=2)+'\n')
print('Completed exactly three runs per source; read evidence before selecting any outcome.', flush=True)
