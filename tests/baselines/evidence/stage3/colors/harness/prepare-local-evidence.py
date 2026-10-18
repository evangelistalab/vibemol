"""Read completed local proofs independently, then stage durable evidence."""
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

folder = Path(__file__).resolve().parent
source = folder / 'source-worktree'
dest = source / 'tests/baselines/evidence/stage3/colors'
char = folder / 'characterization'
assert not (dest / 'validation.json').exists(), 'Do not repeat completed evidence staging'
sys.path.insert(0, str(source / 'tests/e2e'))
import characterize
e = json.loads((char / 'characterize-evidence.json').read_text())
audit = json.loads((folder / 'source-audit.json').read_text())
sha = hashlib.sha256((source / 'assets/app/js/app.js').read_bytes()).hexdigest()
assert e['runs'] == 2 and e['capturesPerRun'] == 102 and e['exactlyIdentical'] and e['deterministic']
assert e['baseline']['appSha256'] == sha == audit['files']['app.js']['after']['sha256']
assert e['captureSha256PerRun'][0] == e['captureSha256PerRun'][1]
golden_bytes = (source / 'tests/baselines/characterize.json.gz').read_bytes()
assert golden_bytes == subprocess.check_output(['git', '-C', str(source), 'show', '04e01adb68e100282d4a1d211197001a5a461f84:tests/baselines/characterize.json.gz'])
expected = characterize.expected_captures(json.loads(gzip.decompress(golden_bytes)), source)
captures = []
for n in [1, 2]:
    doc = json.loads((char / f'characterize-run-{n}.json').read_text())
    assert len(doc) == 102 and characterize.first_difference(expected, doc) is None
    captures.append(doc)
assert captures[0] == captures[1]
assert (char / 'characterize-run-1.json').read_bytes() == (char / 'characterize-run-2.json').read_bytes()
identity = json.loads((char / 'characterize-cache-identity.json').read_text())
assert identity['sourceAppSha256'] == sha and identity['elementCacheIdentityRuns'] == e['elementCacheIdentityRuns']
assert [r['run'] for r in identity['elementCacheIdentityRuns']] == [1, 2]
counts = []
for run in identity['elementCacheIdentityRuns']:
    assert {(c['launch'], c['theme']) for c in run['elementCacheIdentity']} == {(l,t) for l in ['workbench','legacy'] for t in ['light','dark']}
    for c in run['elementCacheIdentity']:
        actual = characterize.assert_element_cache_exercise(c['identity'], c['modes'], c['panelOpenClosePairs'])
        assert actual == c['exercise'] and c['identity']['nodeCount'] == 52
        counts.append({'run': run['run'], 'launch': c['launch'], 'theme': c['theme'], 'composition': c['identity']['composition'], **actual})
native = json.loads((folder / 'native/native-editor.json').read_text())
periodic = json.loads((folder / 'periodic/periodic-table-proof.json').read_text())
checks = json.loads((folder / 'local-checks.json').read_text())
assert native['passed'] and len(native['cases']) == 4 and native['appSha256'] == sha
assert periodic['baseCompared'] and periodic['exactMatch'] and periodic['sourceAppSha256'] == sha
assert len(periodic['cases']) == 4 and all(len(c['history']) == 9 and not c['console'] for c in periodic['cases'].values())
assert checks['javaScriptTests'] == 433 and checks['pythonTests'] == 29 and checks['unitExit'] == 0
dest.mkdir(parents=True, exist_ok=True)
for name in ['source-audit.json','local-checks.json','periodic-input-recount.json']:
    shutil.copyfile(folder / name, dest / name)
for sub, pattern in [('native','*'),('periodic','*'),('characterization','*.json')]:
    target = dest / sub
    target.mkdir(exist_ok=False)
    for f in sorted((folder / sub).glob(pattern)):
        if not f.is_file():
            continue
        if f.suffix == '.json' and sub == 'characterization':
            (target / (f.name+'.gz')).write_bytes(gzip.compress(f.read_bytes(),mtime=0))
        else:
            shutil.copyfile(f,target/f.name)
for name in ['make-check.log','make-check-pycache.log','unit.log','native.log','periodic.log','characterization.log','source-audit.log','periodic-input-recount.log']:
    (dest / (name+'.gz')).write_bytes(gzip.compress((folder/name).read_bytes(),mtime=0))
scripts = dest / 'harness'
scripts.mkdir(exist_ok=False)
for f in [folder/'verify-native-editor.py',folder/'recount-periodic-inputs.cjs',Path(__file__),folder.parent/'colors-planning/prepare-colors-handoff.cjs',folder.parent/'colors-planning/verify-colors-source.cjs',folder.parent/'verify-colors-ci-candidate.py']:
    shutil.copyfile(f,scripts/f.name)
(folder / 'identity-firing-counts.json').write_text(json.dumps(counts,indent=2)+'\n')
shutil.copyfile(folder / 'identity-firing-counts.json', dest / 'identity-firing-counts.json')
report = {'group':'Element Colors const-DOM hand-off','baseCommit':'04e01adb68e100282d4a1d211197001a5a461f84','sourceCommitBeforeEvidence':native['head'],
 'appSha256':sha,'periodicSha256':audit['files']['periodic-table.js']['after']['sha256'],
 'sourceAudit':{'all1190AppFunctionsByteExact':True,'all19PeriodicFunctionDeclarationsRetained':True,'wholeSourcesExactlyReversedByIndependentAudit':True,'eightOriginalConstQuerySnapshotsPreserved':True,'lateLegacyButtonListenerOrderPreserved':True},
 'trackedLetBefore':265,'trackedLetAfter':265,'mutableCacheConversionsPreviouslyIntegrated':41,'additionalConstFieldsGrouped':8,'retainedLegacyButton':True,
 'periodicFactoryCounts':{'before':19,'excludingLauncherInput':18,'afterGrouping':11,'allTenNonDomInputsUsed':True,'countCorrection':'Ten genuine non-DOM dependencies plus els equals11, not10.'},
 'newControllers':0,'newControllerInterfaceCount':'N/A','existingPeriodicFactoryInterfaceCount':11,
 'appLines':33070,'appTopLevelFunctionDeclarations':1181,'appNetLines':1,'periodicModuleNetLines':-9,
 'localChecks':checks,'nativeEditorCases':native['cases'],'periodicTaggedAndProposedCapturesPerSource':36,'periodicObservationsExactlyEqual':True,
 'characterization':{'runs':2,'capturesPerRun':102,'unchangedGoldensMatched':True,'exactSerializedRepeat':True,'sameSessionPixelChanges':e['sameSessionPixelChanges'],'wallTimeSeconds':e['wallTimeSeconds'],'captureProvenance':e['baseline']['captureProvenance'],'identityContexts':8,'counts':counts},
 'ciStatus':'Not started; no merge until own first-pass complete34/3/37 conjunction. Local evidence is not CI acceptance.',
 'carriedDefects':'tests/baselines/carried-defects.json','materialPresetIntermittent':'Open; local captures are not the two Looks material-family paths.'}
(dest / 'validation.json').write_text(json.dumps(report,indent=2)+'\n')
(folder / 'local-validation.json').write_text(json.dumps(report,indent=2)+'\n')
hashes={str(f.relative_to(dest)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(dest.rglob('*')) if f.is_file()}
(dest / 'local-file-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n')
for name,digest in hashes.items():
    assert hashlib.sha256((dest/name).read_bytes()).hexdigest()==digest
print(json.dumps({'allLocalChecksIndependentlyRead':True,'goldens':102,'runs':2,'exactSerializedRepeat':True,'identityContexts':len(counts),'factoryInputs':11,'durableFiles':len(hashes)+1},indent=2))
