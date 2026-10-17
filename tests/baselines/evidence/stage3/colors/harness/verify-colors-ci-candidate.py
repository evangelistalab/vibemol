"""Verify the Colors hand-off, with unchanged complete CI gates and explicit source allowance."""
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
assert not git('diff', config['base'], '--', '.github', 'Makefile', 'tests/e2e', 'tests/unit',
               'tests/fixtures', 'tests/baselines/browser-suite.json', 'tests/baselines/browser-shards.json',
               'tests/baselines/characterize.json.gz', 'tests/baselines/characterize-api-additions.json',
               'tests/baselines/color-contrast.json', 'assets/app/js/qa-characterize.js')
assert git('diff', '--name-only', config['base'], '--', 'assets', 'src', 'index.html').splitlines() == ['assets/app/js/app.js', 'assets/app/js/periodic-table.js']
numstat = git('diff', '--numstat', config['base'], '--', 'assets/app/js/app.js').split()
assert int(numstat[0]) - int(numstat[1]) == 1, 'Only authorized launcher wiring may add one app line'
module_numstat = git('diff', '--numstat', config['base'], '--', 'assets/app/js/periodic-table.js').split()
assert int(module_numstat[0]) - int(module_numstat[1]) == -9, 'Factory input grouping and launcher exclusion must remove nine module lines'
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
assert audit['baseCommit'] == config['base'] and audit['group'] == config['auditGroup']
assert not audit['previewOnly']
assert audit['all1190ExistingAppFunctionsByteExact'] is True
assert audit['wholeSourcesExactAfterIndependentInverseOfApprovedEdits'] == {'app.js': True, 'periodic-table.js': True}
assert audit['shadowedElsReferences'] == [] and audit['canonicalPlainFields'] == 8
assert audit['constQuerySnapshotTimingPreserved'] and audit['legacyButtonConstRetained']
assert audit['legacyPublicSetOpenIsOriginalFunction'] and audit['lateButtonListenerOrderPreserved']
assert audit['qaGoldensAssertionsAndWaitsChanged'] is False
assert len(audit['queries']) == 8 and all(q['queryExpressionExact'] and q['noAccessorRefresh'] for q in audit['queries'])
assert audit['auditedFunctionDeclarations'] == {'app.js': 1190, 'periodic-table.js': 19}
assert audit['files']['app.js']['before']['letDeclarations'] == config['letBefore'] == 265
assert audit['files']['app.js']['after']['letDeclarations'] == config['letAfter'] == 265
assert audit['files']['app.js']['after']['sha256'] == config['appSha256']
assert audit['files']['periodic-table.js']['after']['sha256'] == config['periodicSha256']
assert audit['files']['app.js']['before']['lines'] == 33069 and audit['files']['app.js']['after']['lines'] == 33070
assert audit['files']['app.js']['before']['functionDeclarations'] == audit['files']['app.js']['after']['functionDeclarations'] == 1181
assert audit['netAppLines'] == 1 and audit['netPeriodicModuleLines'] == -9
assert audit['periodicInputsBefore'] == 19 and audit['periodicInputsExcludingButton'] == 18 and audit['periodicInputsAfter'] == 11
app_source = (ROOT / 'assets/app/js/app.js').read_text()
assert re.search(r'^  let measurementsPanel = null;', app_source, re.M)
assert re.search(r'^  let calculationsPanel = null,', app_source, re.M)
assert re.search(r'^  let helpRestoreFocusEl = null;', app_source, re.M)
periodic_js = r"""
const fs=require('node:fs');
const {parse}=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/parser');
const traverse=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/traverse').default;
const calls=[];
traverse(parse(fs.readFileSync('assets/app/js/app.js','utf8')),{CallExpression(p){
 if(p.node.callee.name==='createPeriodicTableController')calls.push(p.node.arguments[0].properties.map(p=>p.key.name));
}});
if(calls.length!==1)throw Error('periodic factory count');
process.stdout.write(JSON.stringify(calls[0]));
"""
periodic = json.loads(subprocess.check_output(['node', '-e', periodic_js], cwd=ROOT, text=True))
assert len(periodic) == config['periodicIntegratedInputs'] == 11
assert periodic == audit['nonDomInputs'] + ['els']
assert digest(ROOT / 'assets/app/js/periodic-table.js') == config['periodicSha256']
recount = json.loads((folder / 'periodic-input-recount.json').read_text())
assert recount['sourceAppSha256'] == config['appSha256'] and recount['sourcePeriodicSha256'] == config['periodicSha256']
assert recount['factoryInputs'] == periodic and recount['allTenNonDomInputsUsed'] is True
assert set(recount['domFieldsReadFromEls']) == set(q['name'] for q in audit['queries'])
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
    'sourceAudit': audit, 'periodicControllerIntegratedDependencyCount': len(periodic), 'periodicControllerInputs': periodic,
    'periodicInputsBefore': 19, 'periodicInputsAfterLauncherExclusion': 18, 'periodicInputsAfterGrouping': 11, 'cacheBindingInventory': config['inventoryBindings'],
    'cacheInventoryPlusHelperCount': config['inventoryPlusHelper'], 'newControllers': 0, 'controllerInterfaceCount': 'N/A',
    'extractionDependencyLimitApplicable': False, 'conversionNetAppLines': 1, 'periodicModuleNetLines': -9, 'authorizedLauncherWiringRelocation': True, 'requestedQaInfrastructureNetAppLines': 0,
    'independentJoinsMatchCi': True, 'allElevenJobsPassed': True}
(folder / 'candidate-verification.json').write_text(json.dumps(summary, indent=2) + '\n')
(folder / 'identity-firing-counts.json').write_text(json.dumps(counts, indent=2) + '\n')
print(json.dumps({key: summary[key] for key in ('candidateConjunctionVerified', 'appearanceMaterialPresetIntermittent', 'cacheBindingInventory', 'controllerInterfaceCount')}, indent=2))
print(json.dumps(counts, indent=2))
