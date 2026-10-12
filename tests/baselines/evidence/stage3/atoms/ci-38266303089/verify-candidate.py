import pathlib,json,gzip,hashlib,sys,subprocess,datetime
root=pathlib.Path.cwd();folder=root/'out/test-artifacts/stage3/atoms/ci-38266303089';art=folder/'artifacts'
sys.path.insert(0,str(root/'tests/e2e'));import characterize,browser_suite
head='6bfd947cbe701073289efe3a5b047be52d2d6a8b';base='b8baed5236cb675fe3361b630e304de24dc01fea';appsha='bf43d66a9d6f256f2c2c882f0375d354731385327801dbf2f9e852920b2ce40a';qasha='e2ce28006c95b93ec193c406bea3d0555e462739465c32860b0ca0c7211a5c88'
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==head
assert hashlib.sha256((root/'assets/app/js/app.js').read_bytes()).hexdigest()==appsha
assert hashlib.sha256((root/'assets/app/js/qa-characterize.js').read_bytes()).hexdigest()==qasha
run=json.loads((folder/'run.json').read_text());assert run['headSha']==head and run['attempt']==1 and run['status']=='completed' and run['conclusion']=='success'
assert all(j['conclusion']=='success' for j in run['jobs'])
for step in next(j for j in run['jobs'] if j['name']=='e2e')['steps']:
 if step['name'] in ('Two-run characterization gate','All 37 browser suites (34 passing, three filed defects)','WebKit Properties interactions'):assert step['conclusion']=='success'
b=json.loads((art/'browser-suite/browser-results.json').read_text());manifest=json.loads(browser_suite.MANIFEST.read_text())
assert b['sourceAppSha256']==appsha and b['ciRunUrl']==run['url']
assert {k:b[k] for k in ('passed','failed','total')}==manifest['expected']=={'passed':34,'failed':3,'total':37}
assert b['matchesAcceptedBaseline'] and not b['unexpectedFailures']
assert [x['test'] for x in b['suites']]==manifest['suites'] and len(b['suites'])==len(set(x['test'] for x in b['suites']))==37
failures=[]
for entry in b['suites']:
 test=root/entry['test'];assert hashlib.sha256(test.read_bytes()).hexdigest()==entry['testSha256']
 raw=art/'browser-suite'/test.stem/'run.log';log=raw.read_text()
 detail=browser_suite.failure_details(log,entry['test'],test.read_text())
 for key,value in detail.items():assert value==entry[key],(entry['test'],key,value,entry[key])
 if entry['exitCode']:
  assert entry['test'] in manifest['knownDefects'] and browser_suite.matches_known_defect({**entry,**detail},manifest['knownDefects'][entry['test']])
  failures.append({**entry,'rawFailureIndependentlyVerified':True})
assert set(e['test'] for e in failures)==set(manifest['knownDefects'])
looks=next(x for x in b['suites'] if x['test']=='tests/e2e/looks.py');lookslog=(art/'browser-suite/looks/run.log').read_text()
assert looks['exitCode']==0 and 'TimeoutError' not in lookslog
for context in ('Studio','Properties'):assert f'[materials] {context}: families, controls, recipe matching, undo, personal libraries, sessions: passed' in lookslog
c=json.loads((art/'characterize/characterize-evidence.json').read_text());identity=json.loads((art/'characterize/characterize-cache-identity.json').read_text())
assert c['baseline']['appSha256']==appsha and identity['sourceAppSha256']==appsha
assert c['baseline']['captureProvenance']['ci']['runUrl']==run['url'] and c['runs']==2 and c['capturesPerRun']==102 and c['exactlyIdentical'] and c['deterministic']
assert not c['sameSessionPixelChanges']
golden_path=characterize.BASELINE;assert golden_path.read_bytes()==subprocess.check_output(['git','show',base+':tests/baselines/characterize.json.gz'])
golden=json.loads(gzip.decompress(golden_path.read_bytes()));expected=characterize.expected_captures(golden,root)
captures=[]
for i in (1,2):
 captures.append(json.loads((art/f'characterize/characterize-run-{i}.json').read_text()));assert len(captures[-1])==102
 assert characterize.first_difference(expected,captures[-1]) is None
assert captures[0]==captures[1]
counts=[]
assert len(c['elementCacheIdentityRuns'])==2
assert identity['elementCacheIdentityRuns']==c['elementCacheIdentityRuns']
for r in c['elementCacheIdentityRuns']:
 contexts=r['elementCacheIdentity'];assert {(x['launch'],x['theme']) for x in contexts}=={(a,t) for a in ('workbench','legacy') for t in ('light','dark')}
 for x in contexts:
  ex=characterize.assert_element_cache_exercise(x['identity'],x['modes'],x['panelOpenClosePairs']);assert ex==x['exercise']
  assert set(x['identity']['knownAbsent'])=={'editAtomsMenuEl','editAtomsMenuBodyEl','editAtomsMenuCurrentEl','editSelectionFragmentCuePopoverEl'}|({'elementColorBtn'} if x['launch']=='workbench' else set())
  counts.append({'run':r['run'],'launch':x['launch'],'theme':x['theme'],'nodeCount':x['identity']['nodeCount'],'composition':x['identity']['composition'],**ex})
assert len(counts)==8
periodic=root/'assets/app/js/periodic-table.js';assert periodic.read_bytes()==subprocess.check_output(['git','show',base+':assets/app/js/periodic-table.js'])
audit=json.loads((folder/'source-audit.json').read_text());assert audit['allExistingFunctionDeclarationsExactAfterLexicalReferenceSubstitution'] and not audit['shadowedElsReferences'] and audit['metrics']['after']['letDeclarations']==288
renderer=json.loads((art/'browser-suite/smoke/renderer.json').read_text());assert renderer['ciRunUrl']==run['url']
started=datetime.datetime.fromisoformat(run['createdAt'].replace('Z','+00:00'));finished=max(datetime.datetime.fromisoformat(j['completedAt'].replace('Z','+00:00')) for j in run['jobs'])
summary={'pr':16,'runUrl':run['url'],'attempt':1,'head':head,'base':base,'sourceAppSha256':appsha,'qaSha256':qasha,'candidateConjunctionVerified':True,'checksAndUnit':'passed','webKitProperties':'passed','browser':{'passed':34,'failed':3,'total':37,'allExecutedOnce':True,'acceptedFailures':failures,'issue11Workflow':b['issue11Workflow'],'vibrationReachedThisRun':b['issue11Workflow']['site']=='vibration'},'renderer':renderer,'characterization':{'runs':2,'capturesPerRun':102,'unchangedGoldensMatched':True,'exactRepeat':True,'identityContexts':8,'counts':counts},'appearanceMaterialPresetIntermittent':{'recurred':False,'bothMaterialFamiliesPathsReached':True,'looksSeconds':looks['seconds'],'looksMinutes':round(looks['seconds']/60,2),'wholeCiMinutes':round((finished-started).total_seconds()/60,2)},'sourceAudit':audit,'periodicControllerIntegratedDependencyCount':19,'groupDependencyCount':4,'conversionNetAppLines':0,'requestedQaInfrastructureNetAppLines':32}
(folder/'candidate-verification.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:summary[k] for k in ['candidateConjunctionVerified','appearanceMaterialPresetIntermittent','groupDependencyCount']},indent=2))
print(json.dumps(counts,indent=2))
