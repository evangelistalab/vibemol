"""Collect one immutable completed CI attempt without starting or retrying CI."""
import concurrent.futures
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import sys
import zipfile

config = json.loads(Path(sys.argv[1]).read_text())
folder = Path(config['artifactDir']).resolve()
repo = 'evangelistalab/vibemol'
run_id = str(config['runId'])
assert not (folder / 'collection-complete.json').exists(), 'Evidence already collected'
assert not any((folder / name).exists() for name in ['run.json', 'run.log', 'artifact-index.json', 'pr.json', 'checkout-commit.json'])

def gh(*args):
    return subprocess.check_output(['gh', *args], timeout=240)

def save(name, value):
    with (folder / name).open('xb') as f:
        f.write(value)

run_bytes = gh('run', 'view', run_id, '--repo', repo, '--json', 'databaseId,headSha,status,conclusion,url,createdAt,updatedAt,attempt,jobs')
run = json.loads(run_bytes)
assert run['status'] == 'completed', 'Wait for the same running attempt; do not collect partial evidence'
assert run['databaseId'] == config['runId'] and run['headSha'] == config['head'] and run['attempt'] == 1
save('run.json', run_bytes)
commands = {
    'run.log': ('run', 'view', run_id, '--repo', repo, '--log'),
    'artifact-index.json': ('api', f'repos/{repo}/actions/runs/{run_id}/artifacts'),
    'pr.json': ('pr', 'view', str(config['pr']), '--repo', repo, '--json', 'number,url,headRefOid,baseRefOid,state,body,statusCheckRollup,mergeable,mergeStateStatus'),
}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    futures = {pool.submit(gh, *args): name for name, args in commands.items()}
    for future in concurrent.futures.as_completed(futures):
        save(futures[future], future.result())
index = json.loads((folder / 'artifact-index.json').read_text())
artifacts = index['artifacts']
assert index['total_count'] == len(artifacts)
expected = {'browser-suite-' + s for s in ['smoke','looks','balanced-1','balanced-2','balanced-3']} | {'browser-results','characterize-1','characterize-2','characterization-results','construction-order'}
actual = {a['name'] for a in artifacts}
inventory = {'required': sorted(expected), 'actual': sorted(actual),
             'missing': sorted(expected-actual), 'unexpected': sorted(actual-expected-{'webkit-properties'})}
save('artifact-inventory-assessment.json', (json.dumps(inventory, indent=2)+'\n').encode())
# Collection preserves all available evidence even on a gate miss. The separate
# verifier still requires the complete exact inventory before any acceptance.
assert all(not a['expired'] and a['workflow_run']['id'] == config['runId'] and a['workflow_run']['head_sha'] == config['head'] for a in artifacts)
(folder / 'artifact-zips').mkdir()
(folder / 'artifacts').mkdir()

def download(artifact):
    name = artifact['name']
    assert Path(name).name == name and name not in ('.', '..')
    value = gh('api', f"repos/{repo}/actions/artifacts/{artifact['id']}/zip")
    digest = hashlib.sha256(value).hexdigest()
    assert artifact['digest'] == 'sha256:' + digest, 'Original artifact ZIP digest differs'
    path = folder / 'artifact-zips' / (name + '.zip')
    with path.open('xb') as f:
        f.write(value)
    destination = folder / 'artifacts' / name
    destination.mkdir()
    with zipfile.ZipFile(path) as z:
        for item in z.infolist():
            rel = PurePosixPath(item.filename)
            assert not rel.is_absolute() and '..' not in rel.parts
            assert (item.external_attr >> 16) & 0o170000 != 0o120000
        assert z.testzip() is None
        z.extractall(destination)
    return {'name':name,'id':artifact['id'],'zipSha256':digest,'zipBytes':len(value),'digestMatchedGitHub':True}

proof = []
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    for row in pool.map(download, artifacts):
        proof.append(row)
        print('DOWNLOADED ' + row['name'], flush=True)
report = json.loads((folder / 'artifacts/browser-suite-smoke/browser-suite/browser-results.json').read_text())
identity = report['artifactIdentity']
assert identity['tree'] == config['tree'] and identity['appSha256'] == config['appSha256']
assert identity['ciRunUrl'] == run['url'] and identity['ciRunAttempt'] == '1'
save('checkout-commit.json', gh('api', f"repos/{repo}/git/commits/{identity['commit']}"))
save('collection-complete.json', (json.dumps({'runId':config['runId'],'attempt':1,'head':config['head'],'conclusion':run['conclusion'],'checkoutMergeCommit':identity['commit'],'artifacts':proof},indent=2)+'\n').encode())
print(json.dumps({'runId': config['runId'], 'conclusion': run['conclusion'], 'artifacts': len(proof), 'checkout': identity['commit']}, indent=2))
