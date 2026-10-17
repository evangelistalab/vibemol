"""Validate raw comparands and immutable source identity; diagnostic is not a gate."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

folder=Path(__file__).resolve().parent;root=Path('/Users/fevange/Source/vibemol');ci=folder/'ci-39062919011'
config=json.loads((folder/'sources.json').read_text());run=json.loads((ci/'run.json').read_text());raw=(ci/'run.log').read_text()
head='323fbf9332a49477f99cb3a447bb4037335ed104'
assert run['databaseId']==39062919011 and run['attempt']==1 and run['status']=='completed' and run['headSha']==head
assert len(run['jobs'])==3 and all(j['status']=='completed' for j in run['jobs'])
reports={};rows=[];driver_hashes=[]
for label,source in config.items():
    artifact=ci/('look-migration-'+label)
    files=list(artifact.rglob('result.json'));assert len(files)==1
    d=json.loads(files[0].read_text());reports[label]=d
    assert d['label']==label and d['source']==source and d['sourceStillUnchanged'] and not d['productionSourceChanged']
    assert d['diagnosticOnly'] and d['usableAsMergeGate'] is False and d['harnessCommit']==head
    assert d['ciRun']=='39062919011' and d['ciAttempt']=='1' and d['playwrightVersion']=='1.64.0'
    assert d['originalReadinessAndWaitsPreserved'] and d['originalExpectedComparandsPreserved']
    assert d['targetReached'] and d['scenarios']==['reference_ui','reference_persistence','reference_migration']
    job=next(j for j in run['jobs'] if j['name']==f'Instrumented look_references ({label})')
    own_lines=[line for line in raw.splitlines() if line.startswith(job['name']+'\t')]
    assert all(any(re.search(r'Z '+ref+'$',line) for line in own_lines) for ref in [head,source['commit']])
    marker='[look refs migration comparands] '
    logged=[json.loads(line.split(marker,1)[1]) for line in own_lines if marker in line]
    assert logged==d['observations']
    jsonl=list(artifact.rglob('look-reference-migration-comparands.jsonl'));assert len(jsonl)==1
    assert [json.loads(x) for x in jsonl[0].read_text().splitlines()]==logged
    test=list(artifact.rglob('look_references.py'));assert len(test)==1
    assert hashlib.sha256(test[0].read_bytes()).hexdigest()==d['testSha256']
    driver_hashes.append((d['harnessSha256'],d['testSha256'],d['helpersSha256']))
    for obs in logged:
        a=obs['actual'];assert obs['browserVersion']=='156.0.8078.4'
        assert obs['expectedFlags']==[False,False]
        assert a['appearanceLookPresent'] is False and a['appearanceLook'] is None
        assert a['storedAppearanceLook']==obs['inputAppearanceLook']
        rows.append({'source':label,'expectedIds':obs['expectedIds'],'actualIds':a['ids'],
                     'expectedFlags':obs['expectedFlags'],'actualFlags':a['flags'],
                     'resolvedAppearanceLookPresent':a['appearanceLookPresent'],'resolvedAppearanceLook':a['appearanceLook'],
                     'storedLegacyLookId':a['storedAppearanceLook']['id'],'label':a['label'],
                     'idsMatch':a['ids']==obs['expectedIds'],'flagsMatch':a['flags']==obs['expectedFlags']})
    if label in ['tagged','integration']:
        assert d['suiteStatus']=='passed' and d['exitCode']==0 and job['conclusion']=='success' and len(logged)==2
        assert all(x['actual']['ids']==x['expectedIds'] and x['actual']['flags']==x['expectedFlags'] for x in logged)
    else:
        assert d['suiteStatus']=='failed' and d['exitCode']==1 and job['conclusion']=='failure' and len(logged)==1
        assert d['exception']=='AssertionError' and "assert observed['ids'] == [style, colors], comparands" in d['traceback']
        assert logged[0]['expectedIds']==['opal','classic'] and logged[0]['actual']['ids']==['basic','basic']
        assert logged[0]['actual']['flags']==[True,True]
assert len(set(driver_hashes))==1
settings={k:v['observations'][0]['actual']['resolvedAppearanceSettings'] for k,v in reports.items()}
assert settings['tagged']==settings['integration']==settings['pubchem']
order=json.loads((folder/'startup-order-audit.json').read_text())
assert order['findings']['newEarlyMetadataWrapperReadsPubChemControllerConstBeforeInitialization']
result={'runUrl':run['url'],'attempt':1,'harnessHead':head,'allThreeImmutableSourcesVerified':True,
    'allThreeOriginalZipDigestsVerified':True,'allRawCheckoutIdentitiesVerified':True,
    'sameInstrumentedRepairedSuiteAndHelpers':True,'rawLogAndJsonlComparandsMatchReports':True,
    'classification':'candidate-only regression','decision':'STOP and report: no production fix, merge, carry classification or further run',
    'usableAsMergeGate':False,'rows':rows,'resolvedRenderingSettingsExactlyEqualAcrossSources':True,
    'resolvedAppearanceLook':'Absent in public export in all three (import-only setting); the stored legacy Opal/Classic record and complete resolved state are preserved in every observation.',
    'startupOrder':order['findings'],'materialPresetCoverageForOrdinaryRun':'not covered this run',
    'stage5MirrorHypothesis':'refuted; #11 product defect remains open','integrationLet':265,'candidateLet':262,'pubchemDependencies':13}
(ci/'independent-verification.json').write_text(json.dumps(result,indent=2)+'\n')
(ci/'comparands.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps(result,indent=2))
