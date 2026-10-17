#!/usr/bin/env python3
"""One instrumented look_references run against an unchanged immutable app tree."""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import time
import traceback

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--source-root', type=Path, required=True)
p.add_argument('--artifacts', type=Path, required=True)
p.add_argument('--label', choices=['tagged', 'integration', 'pubchem'], required=True)
a = p.parse_args()
root, out = a.source_root.resolve(), a.artifacts.resolve()
harness = Path(__file__).resolve().parents[2]
source = json.loads(Path(__file__).with_name('look-migration-sources.json').read_text())[a.label]
git = lambda *args: subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()
sha = lambda f: hashlib.sha256(f.read_bytes()).hexdigest()
assert git('rev-parse', 'HEAD') == source['commit'] and git('rev-parse', 'HEAD^{tree}') == source['tree']
assert not git('status', '--porcelain') and sha(root/'assets/app/js/app.js') == source['appSha256']
out.mkdir(parents=True, exist_ok=False)
os.environ['VIBEMOL_TEST_ARTIFACT_DIR'] = str(out)
sys.path.insert(0, str(harness/'tests/e2e'))
import look_references as suite
from helpers import run_appearance_scenarios
suite.p.ROOT, suite.p.ARTIFACTS = root, out
report = {'label':a.label, 'source':source, 'harnessCommit':subprocess.check_output(['git','-C',str(harness),'rev-parse','HEAD'],text=True).strip(),
    'harnessSha256':sha(Path(__file__)), 'testSha256':sha(harness/'tests/e2e/look_references.py'),
    'helpersSha256':sha(harness/'tests/e2e/helpers.py'), 'driverBase':'6c583556bcc84bff9442602a7dd8aed056b4a660',
    'diagnosticOnly':True, 'usableAsMergeGate':False, 'productionSourceChanged':False,
    'suite':'look_references.py', 'scenarios':['reference_ui','reference_persistence','reference_migration'],
    'originalReadinessAndWaitsPreserved':True, 'originalExpectedComparandsPreserved':True,
    'observation':'Both ids/flags sampled in one synchronous snapshot before either assertion; public exported appearance.look presence/value, stored legacy input, resolved settings and timestamp logged. No extra polling, retry or production instrumentation.',
    'os':platform.system(), 'architecture':platform.machine(), 'python':platform.python_version(),
    'playwrightVersion':importlib.metadata.version('playwright'), 'ciRun':os.environ.get('GITHUB_RUN_ID'), 'ciAttempt':os.environ.get('GITHUB_RUN_ATTEMPT')}
(out/'result.json').write_text(json.dumps(report,indent=2)+'\n')
start = time.monotonic()
code = 0
try:
    run_appearance_scenarios(root, out, [suite.reference_ui,suite.reference_persistence,suite.reference_migration])
    report['suiteStatus']='passed'
except BaseException as error:
    code=1
    report.update(suiteStatus='failed',exception=type(error).__name__,message=str(error),traceback=traceback.format_exc())
    traceback.print_exc()
finally:
    records=out/'look-reference-migration-comparands.jsonl'
    report['observations']=[json.loads(line) for line in records.read_text().splitlines()] if records.exists() else []
    report['targetReached']=bool(report['observations'])
    report['seconds']=round(time.monotonic()-start,3)
    assert not git('status','--porcelain'), 'Immutable source checkout changed'
    assert sha(root/'assets/app/js/app.js')==source['appSha256']
    report['sourceStillUnchanged']=True
    report['exitCode']=code
    (out/'result.json').write_text(json.dumps(report,indent=2)+'\n')
print('LOOK_MIGRATION_RESULT '+json.dumps({k:report[k] for k in ['label','suiteStatus','targetReached','seconds','exitCode']},sort_keys=True),flush=True)
raise SystemExit(code)
