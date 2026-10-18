"""Read-only final validation of the frozen PR and its one accepted CI attempt."""
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ci = Path(sys.argv[1]).resolve()
cfg = json.loads((ci / 'candidate.json').read_text())
root = Path(cfg['candidateWorktree'])
git = lambda *args: subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()
gh = lambda *args: subprocess.check_output(['gh', *args], text=True, timeout=120)
v = json.loads((ci / 'candidate-verification.json').read_text())
assert v['candidateConjunctionVerified'] and v['allElevenJobsPassed'] and v['independentJoinsMatchCi']
assert git('rev-parse', 'HEAD') == cfg['head'] and not git('status', '--porcelain')
assert git('rev-parse', 'HEAD^{tree}') == cfg['tree']
for path, key in [('assets/app/js/app.js', 'appSha256'), ('assets/app/js/pubchem.js', 'pubchemSha256'), ('assets/app/js/qa-characterize.js', 'qaSha256')]:
    assert hashlib.sha256((root / path).read_bytes()).hexdigest() == cfg[key]
assert len(re.findall(r'^  let ', (root / 'assets/app/js/app.js').read_text(), re.M)) == 262
repo = 'evangelistalab/vibemol'
pr = json.loads(gh('pr', 'view', str(cfg['pr']), '--repo', repo, '--json', 'number,url,headRefOid,baseRefOid,state,body,statusCheckRollup,mergeable,mergeStateStatus'))
assert pr['headRefOid'] == cfg['head'] and pr['baseRefOid'] == cfg['base'] and pr['state'] == 'OPEN'
assert pr['mergeable'] == 'MERGEABLE'
run = json.loads(gh('run', 'view', str(cfg['runId']), '--repo', repo, '--json', 'databaseId,headSha,status,conclusion,attempt,jobs'))
assert run['databaseId'] == cfg['runId'] and run['headSha'] == cfg['head'] and run['attempt'] == 1
assert run['status'] == 'completed' and run['conclusion'] == 'success'
expected = {j['name'] for j in json.loads((ci / 'run.json').read_text())['jobs']}
assert len(expected) == len(run['jobs']) == 11
assert {j['name'] for j in run['jobs']} == expected
assert all(j['status'] == 'completed' and j['conclusion'] == 'success' for j in run['jobs'])
checks = pr['statusCheckRollup']
ordinary = [c for c in checks if c['workflowName'] == 'CI']
baseline = [c for c in checks if c['workflowName'] == 'Record characterization baseline on CI']
assert len(ordinary) == 11 and {c['name'] for c in ordinary} == expected
assert all(c['status'] == 'COMPLETED' and c['conclusion'] == 'SUCCESS' and f'/actions/runs/{cfg["runId"]}/' in c['detailsUrl'] for c in ordinary)
assert len(baseline) == 3 and {c['name'] for c in baseline} == {'request', 'record', 'compare'}
assert all(c['status'] == 'COMPLETED' and c['conclusion'] == 'SKIPPED' and f'/actions/runs/{cfg["baselineSkippedRunId"]}/' in c['detailsUrl'] for c in baseline)
assert len(checks) == 14
remote = gh('api', 'repos/' + repo + '/git/ref/heads/' + cfg['baseBranch'])
assert json.loads(remote)['object']['sha'] == cfg['base']
for name, data in [('pre-merge-pr.json', pr), ('pre-merge-verification.json', {
    'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'head': cfg['head'], 'base': cfg['base'], 'tree': cfg['tree'], 'runId': cfg['runId'], 'attempt': 1,
    'frozenCandidateClean': True, 'sourceHashesExact': True, 'trackedLet': 262, 'controllerDependencies': 13,
    'fullConjunctionIndependentlyVerified': True, 'allElevenOrdinaryChecksPassed': True,
    'baselineThreeJobsNormallySkipped': True, 'remoteBaseUnchanged': True,
})]:
    with (ci / name).open('x') as f:
        f.write(json.dumps(data, indent=2) + '\n')
print(json.dumps({'head': cfg['head'], 'base': cfg['base'], 'allElevenOrdinaryChecksPassed': True, 'mergeable': pr['mergeable']}, indent=2))
