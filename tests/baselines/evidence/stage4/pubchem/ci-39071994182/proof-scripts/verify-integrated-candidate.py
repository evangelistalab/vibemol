"""Verify the merged/pushed tested tree while preserving the user's .gitignore edit."""
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

root = Path('/Users/fevange/Source/vibemol')
ci = Path(sys.argv[1]).resolve()
cfg = json.loads((ci / 'candidate.json').read_text())
merged = json.loads((ci / 'merge.json').read_text())
v = json.loads((ci / 'candidate-verification.json').read_text())
git = lambda *args: subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()
raw_git = lambda *args: subprocess.check_output(['git', '-C', str(root), *args])
sha = lambda p: hashlib.sha256((root / p).read_bytes()).hexdigest()
assert v['candidateConjunctionVerified'] and v['allElevenJobsPassed'] and v['independentJoinsMatchCi']
assert merged['state'] == 'MERGED' and merged['headRefOid'] == cfg['head']
head = git('rev-parse', 'HEAD')
assert head == merged['mergeCommit']['oid']
assert git('branch', '--show-current') == cfg['baseBranch']
assert git('rev-parse', 'HEAD^{tree}') == cfg['tree']
assert git('rev-list', '--parents', '-n', '1', 'HEAD').split() == [head, cfg['base'], cfg['head']]
for path, key in [('assets/app/js/app.js', 'appSha256'), ('assets/app/js/pubchem.js', 'pubchemSha256'), ('assets/app/js/qa-characterize.js', 'qaSha256')]:
    assert sha(path) == cfg[key]
assert len(re.findall(r'^  let ', (root / 'assets/app/js/app.js').read_text(), re.M)) == 262
assert git('status', '--porcelain').splitlines() == ['M .gitignore']
assert sha('.gitignore') == '30d1ada8b5dd3a028c11de6ed57b3e56d295b99e8fcc81109ac5ef6be4de1fde'
assert hashlib.sha256(raw_git('diff', '--', '.gitignore')).hexdigest() == 'b7ae3de7feec3f41e9584eacd68ed152312547a32e75ff2fd773144c6b0401d9'
remote = git('ls-remote', 'origin', 'refs/heads/' + cfg['baseBranch']).split()
assert remote == [head, 'refs/heads/' + cfg['baseBranch']]
periodic = (root / 'assets/app/js/periodic-table.js').read_text()
inputs = [x.strip() for x in re.search(r'function createPeriodicTableController\(deps\) \{\s+const \{(.*?)\} = deps;', periodic, re.S).group(1).split(',') if x.strip()]
assert len(inputs) == 11
report = {
    'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'integrationCommit': head, 'candidateHead': cfg['head'], 'testedBase': cfg['base'],
    'entireTree': cfg['tree'], 'entireTreeIdenticalToTestedCandidate': True,
    'mergeParentsExact': True, 'sourceAppSha256': cfg['appSha256'],
    'sourcePubchemSha256': cfg['pubchemSha256'], 'qaSha256': cfg['qaSha256'],
    'trackedLet': 262, 'newControllerDependencies': 13, 'periodicFactoryInputs': inputs,
    'remoteCommit': remote[0], 'pushed': True, 'userEditPreserved': True,
    'userEditOnlyDirtyPath': '.gitignore', 'mailbox': 'retired', 'monitor': 'paused by direct human request',
}
with (ci / 'integration-verification.json').open('x') as f:
    f.write(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
