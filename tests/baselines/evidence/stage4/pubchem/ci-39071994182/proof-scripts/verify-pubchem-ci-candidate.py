"""Verify the PubChem extraction, preserving the complete gate and exact planned API addition."""
import copy
import datetime
import gzip
import hashlib
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path.cwd()
config = json.loads(pathlib.Path(sys.argv[1]).read_text())
folder = ROOT / config['artifactDir']
art = folder / 'artifacts'
sys.path.insert(0, str(ROOT / 'tests/e2e'))
import browser_suite
import characterize
import join_browser_shards
import join_characterize
from ci_evidence import artifact_identity, digest

git = lambda *args: subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()
assert git('rev-parse', 'HEAD') == config['head'] and not git('status', '--porcelain')
assert git('rev-parse', 'HEAD^{tree}') == config['tree']
assert digest(ROOT / 'assets/app/js/app.js') == config['appSha256']
assert digest(ROOT / 'assets/app/js/qa-characterize.js') == config['qaSha256']
assert digest(folder/'source-audit.json')==config['sourceAuditSha256']
assert digest(folder/'local-validation.json')==config['localValidationSha256']
assert digest(folder/'construction-order.json')==config['constructionOrderSha256']
reaudit=json.loads((folder/'source-reaudit/source-audit.json').read_text())
assert reaudit['status']=='passed' and reaudit['sourceHead']==config['head']
assert reaudit['sourceHashes']['proposedAppSha256']==config['appSha256']
assert len(reaudit['checks'])==1229 and all(x['passed'] for x in reaudit['checks'])
assert not git('diff', config['base'], '--', '.github', 'tests/unit', 'tests/fixtures',
               'tests/baselines/browser-suite.json', 'tests/baselines/browser-shards.json',
               'tests/baselines/characterize.json.gz', 'tests/baselines/color-contrast.json',
               'assets/app/js/qa-characterize.js')
assert git('diff','--name-only',config['base'],'--','tests/e2e').splitlines()==['tests/e2e/look_references.py']
assert digest(ROOT/'tests/e2e/look_references.py')=='2a1c894c25894779414bb7ca439d5b93fb6feab3a9436760fb76c1a2b340ec87'
assert git('diff', '--name-only', config['base'], '--', 'assets', 'src', 'index.html').splitlines() == ['assets/app/js/app.js', 'assets/app/js/pubchem.js', 'index.html']
base_text = lambda path: subprocess.check_output(['git', 'show', config['base'] + ':' + path], cwd=ROOT, text=True)
expected_make = base_text('Makefile').replace('\tassets/app/js/periodic-table.js \\\n', '\tassets/app/js/periodic-table.js \\\n\tassets/app/js/pubchem.js \\\n')
assert (ROOT / 'Makefile').read_text() == expected_make
expected_index = base_text('index.html').replace('  <script src="./assets/app/js/periodic-table.js?v=0.9.5"></script>', '  <script src="./assets/app/js/pubchem.js?v=0.9.5"></script>\n  <script src="./assets/app/js/periodic-table.js?v=0.9.5"></script>')
assert (ROOT / 'index.html').read_text() == expected_index
expected_api = json.loads(base_text('tests/baselines/characterize-api-additions.json'))
expected_api['modules'].append({'stage':4,'script':'assets/app/js/pubchem.js','global':'VibeMolPubChem','keys':['createPubChemController']})
assert json.loads((ROOT / 'tests/baselines/characterize-api-additions.json').read_text()) == expected_api
assert digest(ROOT / 'assets/app/js/pubchem.js') == config['pubchemSha256']
run = json.loads((folder / 'run.json').read_text())
pr = json.loads((folder / 'pr.json').read_text())
checkout = json.loads((folder / 'checkout-commit.json').read_text())
index = json.loads((folder / 'artifact-index.json').read_text())
raw_log = (folder / 'run.log').read_text()
assert run['databaseId'] == config['runId'] and run['headSha'] == config['head'] and run['attempt'] == 1
assert run['status'] == 'completed' and run['conclusion'] == 'success'
assert pr['headRefOid'] == config['head'] and pr['baseRefOid'] == config['base'] and pr['state'] == 'OPEN'
assert checkout['tree']['sha'] == config['tree']
assert [p['sha'] for p in checkout['parents']] == [config['base'], config['head']]
shards = ['smoke', 'looks', 'balanced-1', 'balanced-2', 'balanced-3']
names = {'checks-and-unit', 'WebKit Properties interactions', 'Exact characterization repeat and goldens',
         'Aggregate browser gate (34/3/37)'} | {f'Browser suites ({s})' for s in shards} | {f'Characterization ({i})' for i in (1, 2)}
jobs = {job['name']: job for job in run['jobs']}
assert set(jobs) == names and len(jobs) == len(run['jobs']) == 11
assert all(job['status'] == 'completed' and job['conclusion'] == 'success' for job in jobs.values())
assert {line.split('\t', 1)[0] for line in raw_log.splitlines()
        if re.search(r'Z ' + checkout['sha'] + '$', line)} == names
artifacts = {'browser-suite-' + s for s in shards} | {'browser-results', 'characterize-1', 'characterize-2', 'characterization-results'}
if any(a['name'] == 'webkit-properties' for a in index['artifacts']):
    artifacts.add('webkit-properties')  # Success may emit no files; the workflow explicitly permits this.
assert index['total_count'] == len(index['artifacts']) == len(artifacts)
assert {a['name'] for a in index['artifacts']} == {p.name for p in art.iterdir()} == artifacts
assert all(not a['expired'] and a['workflow_run']['id'] == config['runId']
           and a['workflow_run']['head_sha'] == config['head'] for a in index['artifacts'])
identity = artifact_identity(ROOT)
identity.update(commit=checkout['sha'], ciRunUrl=run['url'], ciRunAttempt='1')
b = join_browser_shards.join_reports(art, folder / 'independent/browser-suite', expected_identity=identity)
ci_b = json.loads((art / 'browser-results/browser-results.json').read_text())
def portable(report):
    report = copy.deepcopy(report)
    for entry in report['suites']:
        entry.pop('rawLog')
    return report
assert portable(b) == portable(ci_b)
assert {key: b[key] for key in ('passed', 'failed', 'total')} == {'passed': 34, 'failed': 3, 'total': 37}
assert b['matchesAcceptedBaseline'] is True and b['allExecutedOnce'] is True
c = join_characterize.join_reports(art, folder / 'independent/characterize', expected_identity=identity)
assert c == json.loads((art / 'characterization-results/characterize-evidence.json').read_text())
assert c['runs'] == 2 and c['capturesPerRun'] == 102 and c['exactlyIdentical'] is True
assert characterize.BASELINE.read_bytes() == subprocess.check_output(['git', 'show', config['base'] + ':tests/baselines/characterize.json.gz'])
failures = [entry for entry in b['suites'] if entry['exitCode']]
assert {e['test'] for e in failures} == set(json.loads(browser_suite.MANIFEST.read_text())['knownDefects'])
looks = next(e for e in b['suites'] if e['test'] == 'tests/e2e/looks.py')
looks_log = (art / 'browser-suite-looks/browser-suite/looks/run.log').read_text()
assert looks['exitCode'] == 0 and not re.search(r'TimeoutError|Traceback \(most recent call last\)', looks_log)
assert all(f'[materials] {path}: families, controls, recipe matching, undo, personal libraries, sessions: passed' in looks_log
           for path in ('Studio', 'Properties'))
audit = json.loads((folder / 'source-audit.json').read_text())
assert audit['status'] == 'passed' and audit['findings'] == [] and audit['baseline'] == config['base']
assert audit['sha256']['proposedAppSha256'] == config['appSha256']
assert audit['sha256']['proposedModuleSha256'] == config['pubchemSha256']
assert audit['conclusions']['completeAuditCheckCount'] == 1229
assert audit['conclusions']['allBaselineDeclarationsAccounted'] == 1190
assert audit['conclusions']['movedOriginalDeclarationsExactAfterInverseLexicalChanges'] == 19
assert audit['conclusions']['unchangedOtherAppDeclarationsByteExact'] == 1171
assert audit['conclusions']['wholeAppExactAfterIndependentAllowedEdits']
assert audit['conclusions']['wholeModuleExactFromOriginalFragments']
assert audit['conclusions']['noHiddenAppFreeBindings'] and audit['conclusions']['allDepsUsed']
assert audit['conclusions']['actualDeps'] == config['controllerDependencyCount'] == 13 < 15
assert [x['name'] for x in audit['dependencies']] == config['controllerInputs']
assert all(x['actualReferences'] > 0 for x in audit['dependencies'])
metrics=audit['metrics']
assert metrics['baselineApp']['trackedTwoSpaceLetDeclarationLines'] == config['letBefore'] == 265
assert metrics['proposedApp']['trackedTwoSpaceLetDeclarationLines'] == config['letAfter'] == 262
assert metrics['proposedApp']['lines'] == 32669 and metrics['proposedModule']['lines'] == 480
assert metrics['proposedApp']['directIifeFunctionDeclarations'] == 1163
assert len(re.findall(r'^  let ',(ROOT/'assets/app/js/app.js').read_text(),re.M)) == 262
app_source = (ROOT / 'assets/app/js/app.js').read_text()
assert re.search(r'^  let measurementsPanel = null;', app_source, re.M)
assert re.search(r'^  let calculationsPanel = null,', app_source, re.M)
assert re.search(r'^  let helpRestoreFocusEl = null;', app_source, re.M)
order = json.loads((folder/'construction-order.json').read_text())
assert order['status']=='passed' and order['stages'][-1]['status']=='passed' and order['stages'][-1]['afterSha256']==config['appSha256']
assert order['stages'][-2]['status']=='review-required'
assert all(x['status']==('review-required' if x['label']=='Stage 4 original (negative control)' else 'passed') for x in order['stages'])
assert order['toolSha256']==digest(ROOT/'tools/audit-construction-order.cjs')
manual = json.loads((folder / 'local-validation.json').read_text())
assert manual['manualMatrix']['taggedCases'] == manual['manualMatrix']['proposedCases'] == 72
assert manual['manualMatrix']['semanticReadbacksExact']
assert manual['manualMatrix']['fetchFailureMalformedResponseAbortCovered']
assert manual['checksAndUnit']['jsTests'] == 433 and manual['checksAndUnit']['pythonTests'] == 29
counts = [{'run': r['run'], 'launch': context['launch'], 'theme': context['theme'],
           'nodeCount': context['identity']['nodeCount'], 'composition': context['identity']['composition'],
           **context['exercise']} for r in c['elementCacheIdentityRuns'] for context in r['elementCacheIdentity']]
assert len(counts) == 8
stamp = lambda s: datetime.datetime.fromisoformat(s.replace('Z', '+00:00'))
elapsed = (max(stamp(j['completedAt']) for j in jobs.values()) - stamp(run['createdAt'])).total_seconds()
renderer = json.loads((art / 'browser-suite-smoke/browser-suite/smoke/renderer.json').read_text())
assert renderer['ciRunUrl'] == run['url'] and renderer['browserVersion'] == c['browserVersion']
agents = (ROOT / 'AGENTS.md').read_text()
assert agents.count('**Standing conversion rule') == 1 and all(agents.count(f'**({i})**') == 1 for i in (1, 2, 3))
summary = {'pr': config['pr'], 'runUrl': run['url'], 'attempt': 1, 'head': config['head'], 'base': config['base'],
    'tree': config['tree'], 'checkoutMergeCommit': checkout['sha'], 'candidateConjunctionVerified': True,
    'sourceAppSha256': config['appSha256'], 'qaSha256': config['qaSha256'], 'checksAndUnit': 'passed', 'webKitProperties': 'passed',
    'browser': {'passed': 34, 'failed': 3, 'total': 37, 'allExecutedOnce': True, 'acceptedFailures': failures,
                'issue11Workflow': b['issue11Workflow'], 'vibrationReachedThisRun': b['issue11Workflow']['site'] == 'vibration'},
    'renderer': renderer, 'characterization': {'runs': 2, 'capturesPerRun': 102, 'unchangedGoldensMatched': True,
                'exactSerializedRepeat': True, 'identityContexts': 8, 'counts': counts, 'pixelChangesDiagnosticOnly': c['sameSessionPixelChanges']},
    'appearanceMaterialPresetIntermittent': {'recurred': False, 'bothMaterialFamiliesPathsReached': True,
                'looksSeconds': looks['wallTimeSeconds'], 'looksMinutes': round(looks['wallTimeSeconds']/60, 2), 'wholeCiMinutes': round(elapsed/60, 2)},
    'sourceAudit': audit, 'newControllers': 1, 'controllerInterfaceCount': 13,
    'controllerInputs': config['controllerInputs'], 'extractionDependencyLimitApplicable': True,
    'trackedLetBefore': 265, 'trackedLetAfter': 262, 'plannedNamespaceAdditionExact': True,
    'independentJoinsMatchCi': True, 'allElevenJobsPassed': True}
(folder / 'candidate-verification.json').write_text(json.dumps(summary, indent=2) + '\n')
(folder / 'identity-firing-counts.json').write_text(json.dumps(counts, indent=2) + '\n')
print(json.dumps({key: summary[key] for key in ('candidateConjunctionVerified', 'appearanceMaterialPresetIntermittent', 'controllerInterfaceCount')}, indent=2))
print(json.dumps(counts, indent=2))
