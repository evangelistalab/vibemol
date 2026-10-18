"""Verify human-corrected acceptance of the unchanged first attempt; no merge."""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
FOLDER = HERE.parent
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
git = lambda *a: subprocess.check_output(['git', *a], text=True).strip()
gh = lambda *a: json.loads(subprocess.check_output(['gh', *a], text=True))
config = read(FOLDER/'candidate.json')
decision = read(HERE/'candidate-verification.json')
assert decision['candidateConjunctionVerified'] is True and not decision['stopReasons']
assert decision['humanPolicyCorrection']['noRerun'] is True
assert decision['browser']['passed'] == 33 and decision['browser']['failed'] == 4
assert decision['browser']['total'] == 37 and decision['browser']['allExecutedOnce']
archive = read(FOLDER/'immutable-evidence-proof.json')
assert archive['allEntriesReadBackAndMatched']
assert sha(FOLDER/archive['archive']) == archive['sha256']
# The original assessment and seal retain their original failed disposition.
assert archive['usableAsMergeGate'] is False
for name, expected in read(FOLDER/'archive-input-manifest.json').items():
    assert sha(FOLDER/name) == expected['sha256'], name
assert git('rev-parse', 'HEAD') == config['head']
assert git('rev-parse', 'HEAD^{tree}') == config['tree']
assert not git('status', '--porcelain')
for name, field in [('app.js', 'appSha256'), ('trajectory-playback.js', 'moduleSha256'), ('qa-characterize.js', 'qaSha256')]:
    assert sha(Path('assets/app/js')/name) == config[field]
repo = 'evangelistalab/vibemol'
pr = gh('pr', 'view', '26', '--repo', repo, '--json', 'number,url,headRefOid,baseRefOid,state,isDraft,mergeable,mergeStateStatus,statusCheckRollup')
assert pr['headRefOid'] == config['head'] and pr['baseRefOid'] == config['base']
assert pr['state'] == 'OPEN' and not pr['isDraft'] and pr['mergeable'] == 'MERGEABLE'
assert pr['mergeStateStatus'] == 'UNSTABLE', pr['mergeStateStatus']
checks = pr['statusCheckRollup']
assert len(checks) == 14
assert sum(c.get('conclusion') == 'SUCCESS' for c in checks) == 10
assert sum(c.get('conclusion') == 'SKIPPED' for c in checks) == 3
assert [c['name'] for c in checks if c.get('conclusion') == 'FAILURE'] == ['Aggregate browser gate (34/3/37)']
run = gh('run', 'view', str(config['runId']), '--repo', repo, '--json', 'databaseId,headSha,status,conclusion,attempt,jobs')
assert run['databaseId'] == config['runId'] and run['headSha'] == config['head'] and run['attempt'] == 1
assert run['status'] == 'completed' and run['conclusion'] == 'failure'
assert len(run['jobs']) == 11 and all(j['status'] == 'completed' for j in run['jobs'])
assert [j['name'] for j in run['jobs'] if j['conclusion'] != 'success'] == ['Aggregate browser gate (34/3/37)']
assert [s['name'] for j in run['jobs'] for s in j['steps'] if s['conclusion'] == 'failure'] == ['Verify all suites once, raw failure workflows and aggregate counts']
remote = gh('api', 'repos/'+repo+'/git/ref/heads/codex/app-js-decomposition')
assert remote['object']['sha'] == config['base']
proof = dict(status='passed', authority='Direct human instruction: correct the gate to 33/4/37 and verify then merge PR26',
    expected=dict(passed=33, failed=4, total=37), oldGithubAggregateRemainsFailed=True,
    diagnosticUsedAsGate=False, originalFirstAttemptUsed=True, head=config['head'], base=config['base'], tree=config['tree'],
    runId=config['runId'], attempt=1, pr=pr, ci=run, rawArchiveSha256=archive['sha256'],
    correctedDecisionSha256=sha(HERE/'candidate-verification.json'), checkedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
with (HERE/'pre-merge-verification.json').open('x') as out:
    out.write(json.dumps(proof, indent=2)+'\n')
print(json.dumps(dict(status='passed', expected=proof['expected'], head=config['head'], rawArchiveUnchanged=True)))
