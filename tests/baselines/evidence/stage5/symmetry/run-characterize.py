import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

OUT = Path('/Users/fevange/Source/vibemol/out/test-artifacts/stage5/symmetry')
WORK = OUT/'source-worktree'
phase = OUT/'characterize-phase.json'
assert not phase.exists(), 'Resume this exact invocation; do not duplicate characterization'
source_hash = hashlib.sha256((WORK/'assets/app/js/app.js').read_bytes()).hexdigest()
native = json.loads((OUT/'native/comparison.json').read_text())
assert native['taggedCollectorExitCode'] == native['proposedCollectorExitCode'] == 0
assert native['caseObservationsExactlyEqual'] and len(native['cases']) == 4
assert all(c['status']=='passed' for c in native['cases'])
assert native['proposedAppSha256'] == source_hash
start = time.monotonic()
state = dict(status='running', started=datetime.datetime.now(datetime.timezone.utc).isoformat(),
             sourceAppSha256=source_hash, runs=2, expectedCaptures=102)
phase.write_text(json.dumps(state, indent=2)+'\n')
env = dict(os.environ, PYTHONPATH='/Users/fevange/Source/vibemol/out/test-artifacts/browser-repair/runtime-site',
           PYTHONPYCACHEPREFIX=str(OUT/'pycache'), VIBEMOL_TEST_ARTIFACT_DIR=str(OUT/'characterize'))
with (OUT/'characterize.log').open('x') as log:
    code = subprocess.call(['python3','-u','tests/e2e/characterize.py'], cwd=WORK, env=env, stdout=log, stderr=subprocess.STDOUT)
state.update(status='passed' if code==0 else 'failed',exitCode=code,seconds=time.monotonic()-start,
             completed=datetime.datetime.now(datetime.timezone.utc).isoformat())
phase.write_text(json.dumps(state,indent=2)+'\n')
assert hashlib.sha256((WORK/'assets/app/js/app.js').read_bytes()).hexdigest()==source_hash
raise SystemExit(code)
