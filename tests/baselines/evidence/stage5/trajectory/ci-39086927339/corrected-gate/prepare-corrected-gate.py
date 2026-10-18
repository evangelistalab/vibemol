"""Apply the direct human policy correction to preserved evidence, without rerunning CI."""
import json
from pathlib import Path

GROUP = Path(__file__).resolve().parent
ROOT = GROUP / 'source-worktree'
OUT = GROUP / 'ci-39086927339/corrected-gate'
OUT.mkdir(exist_ok=True)
source = (ROOT / 'tests/e2e/browser_suite.py').read_text()
marker = "    elif pathlib.Path(suite).name == 'smoke.py':"
assert source.count(marker) == 1
new_case = '''    elif pathlib.Path(suite).name == 'edit_tool.py':
        # The assertion action and its width comparand identify #21. Traceback
        # line numbers never participate in acceptance, nor do later hit tests.
        expected = parsed_statement("assert page.locator('.wb-tools').evaluate('el=>el.scrollWidth<=el.clientWidth+1'),width")
        if (len(failed) == 1 and same_statement(failed[0], expected[0])
                and re.search(r'^AssertionError: 320\\s*$', log, re.M)
                and any(isinstance(node, ast.Assert) and same_statement(node, expected[0])
                        for node in ast.walk(ast.parse(source)))):
            return {'id': 'issue-21-edit-toolbar-layout-collapse-320'}
'''
(OUT / 'browser_policy.py').write_text(source.replace(marker, new_case + marker))
manifest = json.loads((ROOT / 'tests/baselines/browser-suite.json').read_text())
manifest['expected'] = dict(passed=33, failed=4, total=37)
manifest['knownDefects']['tests/e2e/edit_tool.py'] = dict(
    workflow='issue-21-edit-toolbar-layout-collapse-320', exceptionType='AssertionError',
    defect='Issue #21: .wb-tools layout collapse at 320px',
    issue='https://github.com/evangelistalab/vibemol/issues/21')
manifest['policy'] = ('Direct human correction: exactly 33 passing / 4 failing / 37; '
    'the exact four (suite, workflow) keys are required. 34/3 is over-performance and stops. '
    'Smoke accepts trajectory or vibration only after its second download. '
    'All other characterization, identity, construction and behavior gates remain unchanged.')
manifest['baselineComparison'] = 'Current CI 33/4/37; earlier 34/3/37 results remain historical.'
(OUT / 'browser-suite.json').write_text(json.dumps(manifest, indent=2) + '\n')

verifier = (GROUP / 'verify-ci.py').read_text()
verifier = verifier.replace('import browser_suite\n', 'import browser_suite\nimport importlib.util\n')
needle = "identity=artifact_identity(ROOT);identity.update(commit=checkout['sha'],ciRunUrl=run['url'],ciRunAttempt='1')"
insert = '''corrected=folder/'corrected-gate'
spec=importlib.util.spec_from_file_location('corrected_browser_policy',corrected/'browser_policy.py')
policy=importlib.util.module_from_spec(spec);spec.loader.exec_module(policy)
manifest=read(corrected/'browser-suite.json')
'''
verifier = verifier.replace(needle, insert + needle)
verifier = verifier.replace("gate('all eleven jobs successful',all(j['conclusion']=='success' for j in jobs.values()))\ngate('overall conclusion',run['conclusion'],'success')", """failed_jobs=[j for j in jobs.values() if j['conclusion']!='success']
gate('sole failed job is superseded aggregate policy', [j['name'] for j in failed_jobs], ['Aggregate browser gate (34/3/37)'])
gate('sole failed step is original aggregate workflow/count assertion',
    [s['name'] for j in failed_jobs for s in j['steps'] if s['conclusion']=='failure'],
    ['Verify all suites once, raw failure workflows and aggregate counts'])
gate('original overall conclusion preserved',run['conclusion'],'failure')""")
verifier = verifier.replace("folder/'independent/browser-suite'", "corrected/'independent/original-browser-suite'")
needle = "assert portable(b)==portable(read(art/'browser-results/browser-results.json'))"
new_classification = '''
# The original join still has to reconstruct its original report exactly.
# Only after that proof do we independently classify the same raw failures
# under the human's corrected manifest. Original artifacts remain untouched.
for entry in b['suites']:
    log=Path(entry['rawLog']).read_text()
    details=policy.failure_details(log,entry['test'],(ROOT/entry['test']).read_text())
    if entry['test']!='tests/e2e/edit_tool.py':
        assert all(entry[k]==v for k,v in details.items())
    entry.update(details)
    entry['knownDefect']=entry['test'] in manifest['knownDefects'] and policy.matches_known_defect(entry,manifest['knownDefects'][entry['test']])
b['expected']=manifest['expected']
policy.finish_report(b,manifest)
actual_keys={(e['test'],e['failureWorkflow']['id']) for e in b['suites'] if e['exitCode']}
expected_keys={(name,k['workflow']) for name,k in manifest['knownDefects'].items()}
assert actual_keys==expected_keys
assert not policy.finish_report(dict(suites=[{**e,'exitCode':0} if e['test']=='tests/e2e/edit_tool.py' else dict(e) for e in b['suites']]),manifest), '34/3 must be rejected'
(corrected/'browser-results.json').write_text(json.dumps(b,indent=2)+'\\n')
'''
verifier = verifier.replace(needle, needle + new_classification)
verifier = verifier.replace("{'passed':34,'failed':3,'total':37}", "{'passed':33,'failed':4,'total':37}")
verifier = verifier.replace("folder/'independent/characterize'", "corrected/'independent/characterize'")
verifier = verifier.replace("folder/'candidate-verification.json'", "corrected/'candidate-verification.json'")
verifier = verifier.replace("folder/'identity-firing-counts.json'", "corrected/'identity-firing-counts.json'")
verifier = verifier.replace("(corrected/'candidate-verification.json').write_text", "report['humanPolicyCorrection']={'authority':'direct human instruction in this chat','expected':manifest['expected'],'originalCiConclusion':'failure','onlySupersededGate':'old 34/3 aggregate assertion','noRerun':True,'originalEvidenceUnchanged':True}\n(corrected/'candidate-verification.json').write_text")
(OUT / 'verify-corrected-gate.py').write_text(verifier)
print(OUT)
