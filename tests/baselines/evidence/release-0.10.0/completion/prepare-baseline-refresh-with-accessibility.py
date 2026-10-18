"""Apply only the human-authorized post-publication baseline refresh and expiry.

Run from a fresh clean branch at the verified published v0.10.0 commit. The
input is the independent recording verification, never a worker-green claim.
"""
from pathlib import Path
import contextlib,copy,gzip,hashlib,json,shutil,subprocess,sys
ROOT=Path.cwd();cfg=json.loads(Path(sys.argv[1]).read_text());OUT=Path(cfg['output'])
assert OUT.exists() and cfg['independentVerificationPassed'] is True
assert cfg['tag']=='v0.10.0' and cfg['publishedRelease']['isDraft'] is False and cfg['publishedRelease']['isPrerelease'] is False and cfg['publishedRelease']['publishedAt']
git=lambda *a:subprocess.check_output(['git',*a],cwd=ROOT,text=True).strip()
assert not git('status','--porcelain')
assert git('rev-parse','HEAD')==git('rev-parse','v0.10.0^{commit}')==cfg['commit']
assert git('rev-parse','HEAD^{tree}')==cfg['tree']
sys.path.insert(0,str(ROOT/'tests/e2e'))
import characterize
old=json.loads(gzip.decompress((ROOT/'tests/baselines/characterize.json.gz').read_bytes()))
record=Path(cfg['recordingArtifact']);raw=(record/'characterize.json.gz').read_bytes();new=json.loads(gzip.decompress(raw));summary=json.loads((record/'characterize-summary.json').read_text())
assert hashlib.sha256(raw).hexdigest()==cfg['newGoldenCompressedSha256']
assert new['baseline']['tag']=='v0.10.0' and new['baseline']['commit']==cfg['commit'] and len(new['captures'])==102
assert summary['baseline']==new['baseline'] and summary['captures']==102 and summary['determinism']['runs']==2 and summary['determinism']['identical'] and summary['determinism']['exact']
with (OUT/'projection-before-expiry.log').open('w') as f,contextlib.redirect_stdout(f):expected=characterize.expected_captures(old,ROOT)
first=characterize.first_difference(expected,new['captures']);comp={'actualResidualDifference':first,'expectedResidualDifference':None,'expectedVersionLeaves':204,'actualVersionLeaves':sum(c['session']['appVersion']=='0.10.0' for c in new['captures'].values())+sum(c['session']['preset']['appVersion']=='0.10.0' for c in new['captures'].values())}
print('[post-ship-baseline-comparands] '+json.dumps(comp,sort_keys=True),flush=True)
assert first is None and comp['actualVersionLeaves']==204,comp
assert cfg['fourIndependentSerializedCapturesExactlyEqual'] is True
# Keep the previous compressed golden verbatim outside the checkout.
backup=OUT/'original-characterize.json.gz';assert not backup.exists();backup.write_bytes((ROOT/'tests/baselines/characterize.json.gz').read_bytes())
(ROOT/'tests/baselines/characterize.json.gz').write_bytes(raw)
shutil.copyfile(record/'characterize-summary.json',ROOT/'tests/baselines/characterize-summary.json')
p=ROOT/'tests/baselines/characterize-api-additions.json';api=json.loads(p.read_text());assert len(api['modules'])==6
api={'baseTag':'v0.10.0','purpose':'Published0.10.0 CI goldens include all six extracted classic-script namespaces. No additive exception remains.','modules':[]};p.write_text(json.dumps(api,indent=2)+'\n')
for path in ['tests/baselines/release-version-mapping.json','tests/e2e/release_version_mapping.py','tests/unit/test_release_version_mapping.py','tests/baselines/release-accessibility-scope.json']:
 p=ROOT/path;assert p.is_file();p.unlink()
p=ROOT/'tests/e2e/characterize.py';text=p.read_text();before='''    # Temporary and limited to the single human-authorized release tree.
    from release_version_mapping import release_expectations
    return release_expectations(captures, source_root, BASELINE)''';assert text.count(before)==1;p.write_text(text.replace(before,'    return captures'))
p=ROOT/'Makefile';text=p.read_text();token=' tests/e2e/release_version_mapping.py';assert text.count(token)==1;p.write_text(text.replace(token,''))
# The exact API-key assertion moves to the newly recorded full API contract.
# An empty additive list must not delete or weaken this existing purity test.
p=ROOT/'tests/unit/element-utils.test.mjs';text=p.read_text();assert text.count("'tests/baselines/characterize-api-additions.json'")==1 and text.count('contract.modules[0].keys')==1
text=text.replace("'tests/baselines/characterize-api-additions.json'","'tests/baselines/characterize-summary.json'").replace('contract.modules[0].keys','contract.api.VibeMolElementUtils');p.write_text(text)
p=ROOT/'tests/unit/test_characterize_comparison.py';text=p.read_text();anchor='\n\nclass BrowserFailureReportingTests';assert text.count(anchor)==1
method='''
    def test_future_session_versions_are_not_exempted_after_release(self):
        import copy
        import gzip
        import json
        from characterize import expected_captures
        root = pathlib.Path(__file__).resolve().parents[2]
        golden = json.loads(gzip.decompress((root / 'tests/baselines/characterize.json.gz').read_bytes()))
        expected = expected_captures(golden, root)
        self.assertEqual(expected, golden['captures'])
        name = next(iter(expected))
        for path in [('session', 'appVersion'), ('session', 'preset', 'appVersion')]:
            with self.subTest(full_path=path):
                wrong = copy.deepcopy(expected)
                owner = wrong[name]
                for part in path[:-1]:
                    owner = owner[part]
                self.assertEqual(owner[path[-1]], '0.10.0')
                owner[path[-1]] = '0.11.0'
                actual = first_difference(expected, wrong)
                self.assertIsNotNone(actual)
                self.assertIn('.'.join(path), actual)
'''
p.write_text(text.replace(anchor,'\n'+method+anchor))
p=ROOT/'tests/baselines/stage5/run-policy.json';policy=json.loads(p.read_text());policy['group']='0.10.0 baseline refresh';p.write_text(json.dumps(policy,indent=2)+'\n')
# Permanent source and construction checks are unchanged. Documentation/proof
# assembly follows here before this candidate is committed and frozen.
assert not any((ROOT/p).exists() for p in ['tests/baselines/release-version-mapping.json','tests/e2e/release_version_mapping.py','tests/unit/test_release_version_mapping.py','tests/baselines/release-accessibility-scope.json'])
proof={'status':'authorized refresh and exception expiry applied; candidate still requires own first CI','publishedTag':cfg['tag'],'publishedCommit':cfg['commit'],'recordingRunId':cfg['runId'],'previousGoldenCompressedSha256':hashlib.sha256(backup.read_bytes()).hexdigest(),'newGoldenCompressedSha256':hashlib.sha256(raw).hexdigest(),'captures':102,'explicitVersionLeaves':204,'residualDifferenceUnderStandingFloatOnlyPolicy':None,'sixApiNamespacesNowInGolden':True,'pendingApiAdditions':0,'temporaryMappingRemoved':True,'expectedJsUnitTests':433,'expectedPythonUnitTests':60,'noProductionSourceChanges':not git('diff','--name-only','--','assets','src','index.html')}
(OUT/'expiry-source-change.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof,indent=2))
