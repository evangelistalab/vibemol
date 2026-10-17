"""Validate captured failed-run evidence without accepting or changing the merge gate."""
import copy
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

root = Path.cwd()
ci = Path(sys.argv[1]).resolve()
cfg = json.loads((ci / 'candidate.json').read_text())
sys.path.insert(0, str(root / 'tests/e2e'))
import join_browser_shards
import join_characterize
from ci_evidence import artifact_identity

git = lambda *args: subprocess.check_output(['git', *args], cwd=root, text=True).strip()
assert git('rev-parse', 'HEAD') == cfg['head'] and not git('status', '--porcelain')
assert git('rev-parse', 'HEAD^{tree}') == cfg['tree']
for path, key in [('assets/app/js/app.js', 'appSha256'), ('assets/app/js/pubchem.js', 'pubchemSha256'), ('assets/app/js/qa-characterize.js', 'qaSha256')]:
    assert hashlib.sha256((root / path).read_bytes()).hexdigest() == cfg[key]
run = json.loads((ci / 'run.json').read_text())
pr = json.loads((ci / 'pr.json').read_text())
checkout = json.loads((ci / 'checkout-commit.json').read_text())
assert run['status'] == 'completed' and run['conclusion'] == 'failure'
assert run['databaseId'] == cfg['runId'] and run['headSha'] == cfg['head'] and run['attempt'] == 1
assert pr['state'] == 'OPEN' and pr['headRefOid'] == cfg['head'] and pr['baseRefOid'] == cfg['base']
assert checkout['tree']['sha'] == cfg['tree']
assert [p['sha'] for p in checkout['parents']] == [cfg['base'], cfg['head']]
names = {'checks-and-unit', 'WebKit Properties interactions', 'Exact characterization repeat and goldens',
         'Aggregate browser gate (34/3/37)'} | {f'Browser suites ({s})' for s in ['smoke','looks','balanced-1','balanced-2','balanced-3']} | {f'Characterization ({i})' for i in (1,2)}
jobs = {j['name']: j for j in run['jobs']}
assert set(jobs) == names and len(jobs) == len(run['jobs']) == 11
assert all(j['status'] == 'completed' for j in jobs.values())
assert {name for name, j in jobs.items() if j['conclusion'] != 'success'} == {'Aggregate browser gate (34/3/37)'}
raw = (ci / 'run.log').read_text()
assert {line.split('\t',1)[0] for line in raw.splitlines() if re.search(r'Z ' + checkout['sha'] + '$', line)} == names
identity = artifact_identity(root)
identity.update(commit=checkout['sha'], ciRunUrl=run['url'], ciRunAttempt='1')
browser = join_browser_shards.join_reports(ci / 'artifacts', ci / 'independent-failed/browser-suite', expected_identity=identity)
def portable(report):
    report = copy.deepcopy(report)
    for entry in report['suites']:
        entry.pop('rawLog')
    return report
assert portable(browser) == portable(json.loads((ci / 'artifacts/browser-results/browser-results.json').read_text()))
assert (browser['passed'], browser['failed'], browser['total']) == (32,5,37)
assert browser['allExecutedOnce'] and not browser['matchesAcceptedBaseline']
assert set(browser['unexpectedFailures']) == {'tests/e2e/look_references.py','tests/e2e/looks.py'}
characterization = join_characterize.join_reports(ci / 'artifacts', ci / 'independent-failed/characterize', expected_identity=identity)
assert characterization == json.loads((ci / 'artifacts/characterization-results/characterize-evidence.json').read_text())
assert characterization['runs'] == 2 and characterization['capturesPerRun'] == 102 and characterization['exactlyIdentical']
counts = [{'run': r['run'], 'launch': context['launch'], 'theme': context['theme'],
           'nodeCount': context['identity']['nodeCount'], 'composition': context['identity']['composition'],
           **context['exercise']} for r in characterization['elementCacheIdentityRuns'] for context in r['elementCacheIdentity']]
assert len(counts) == 8
looks = next(e for e in browser['suites'] if e['test'] == 'tests/e2e/looks.py')
looks_raw = (ci / 'artifacts/browser-suite-looks/browser-suite/looks/run.log').read_text()
assert looks['exitCode'] == 1 and looks['firstFailure']['suite'] == 'look_references.py' and looks['firstFailure']['line'] == 182
assert all(f'[materials] {path}:' not in looks_raw for path in ('Studio', 'Properties'))
assert 'appearanceMaterialPreset' not in looks_raw and 'TimeoutError' not in looks_raw
failures = [e for e in browser['suites'] if e['exitCode']]
assert len(failures) == 5 and sum(bool(e['knownDefect']) for e in failures) == 3
renderer = json.loads((ci / 'artifacts/browser-suite-smoke/browser-suite/smoke/renderer.json').read_text())
assert renderer['ciRunUrl'] == run['url'] and renderer['browserVersion'] == characterization['browserVersion']
report = {
    'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'status': 'BLOCKED: unchanged ordinary merge gate failed; no merge, rerun or source amendment',
    'candidateConjunctionVerified': False, 'allElevenJobsPassed': False,
    'independentJoinsMatchCi': True, 'evidenceValidationPassed': True,
    'head': cfg['head'], 'base': cfg['base'], 'tree': cfg['tree'], 'runUrl': run['url'], 'attempt': 1,
    'checkoutMergeCommit': checkout['sha'], 'checkoutTreeAndParentsExact': True, 'allElevenRawCheckoutLogsVerified': True,
    'sourceAppSha256': cfg['appSha256'], 'sourcePubchemSha256': cfg['pubchemSha256'], 'qaSha256': cfg['qaSha256'],
    'checksAndUnit': 'passed (433 JS / 29 Python)', 'webKitProperties': 'passed',
    'browser': {'passed': 32, 'failed': 5, 'total': 37, 'allExecutedOnce': True,
                'expected': browser['expected'], 'matchesAcceptedBaseline': False,
                'unexpectedFailures': browser['unexpectedFailures'], 'failures': failures,
                'issue11Workflow': browser['issue11Workflow'], 'vibrationReachedThisRun': False},
    'characterization': {'runs': 2, 'capturesPerRun': 102, 'unchangedGoldensMatched': True,
                         'exactSerializedRepeat': True, 'identityContexts': 8, 'counts': counts,
                         'pixelChangesDiagnosticOnly': characterization['sameSessionPixelChanges']},
    'renderer': renderer,
    'appearanceMaterialPresetIntermittent': {'timeoutObserved': False, 'bothMaterialFamiliesPathsReached': False,
        'status': 'Coverage incomplete: Looks failed earlier at legacy last-appearance reference migration; no timeout recurrence observed, no closure or causal classification.',
        'looksSeconds': looks['wallTimeSeconds'], 'looksMinutes': looks['wallTimeSeconds'] / 60},
    'failureClassification': 'Both extra suite failures are reference_migration line182 in a fresh browser. Exact failing reference/flag values were not logged; no proposed-only/pre-existing/flake diagnosis made.',
    'newControllerDependencies': 13, 'trackedLetCandidate': 262, 'trackedLetIntegration': 265,
    'localMatrix': '72 tagged and 72 proposed native network/error-path cases passed with exact semantic readbacks',
    'nextAction': 'Stop and report the failed gate directly to the human. Keep the candidate frozen. No baseline, diagnostic or replacement CI is started.'
}
for name, data in [('failed-candidate-verification.json', report), ('identity-firing-counts.json', counts)]:
    with (ci / name).open('x') as f:
        f.write(json.dumps(data, indent=2) + '\n')
print(json.dumps({k: report[k] for k in ['status','candidateConjunctionVerified','independentJoinsMatchCi','browser','appearanceMaterialPresetIntermittent']}, indent=2))
