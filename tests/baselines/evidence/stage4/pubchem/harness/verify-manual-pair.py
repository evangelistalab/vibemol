"""Read existing complete PubChem matrices; never opens or re-runs a browser."""
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

root=Path('/Users/fevange/Source/vibemol/out/test-artifacts/stage4/pubchem')
reports={name:json.loads((root/'manual'/name/'manual-report.json').read_text()) for name in ('tagged','proposed')}
for name,r in reports.items():
 assert r['status']=='passed' and r['caseCount']==len(r['cases'])==72 and r['scenarioCount']==18
 assert len({c['case'] for c in r['cases']})==72
 assert all(c['status']=='passed' and not c['pageErrors'] for c in r['cases'])
 assert len({(c['launch'],c['theme']) for c in r['cases']})==4
 assert all(len([c for c in r['cases'] if c['launch']==launch and c['theme']==theme])==18 for launch in ('workbench','legacy') for theme in ('light','dark'))
 assert r['sourceAppSha256']==hashlib.sha256((Path(r['sourceRoot'])/'assets/app/js/app.js').read_bytes()).hexdigest()
 for c in r['cases']:
  if c['scenario'] in ('abort_cid','abort_sdf','autocomplete_abort'):
   assert any(urlparse(x['url']).hostname=='pubchem.ncbi.nlm.nih.gov' and 'ERR_ABORTED' in (x['failure'] or '') for x in c['failedRequests']),c['case']
left={c['case']:c for c in reports['tagged']['cases']};right={c['case']:c for c in reports['proposed']['cases']}
assert left.keys()==right.keys()
def semantic(c):
 requests=c['requests']
 if c['scenario'].startswith('autocomplete_'):
  requests=sorted(requests,key=lambda x:(x['path'],x['query']))
 return {'case':c['case'],'observations':c['observations'],'requests':requests,'dialogs':c['dialogs'],
  'failedRequests':[x for x in c['failedRequests'] if urlparse(x['url']).hostname=='pubchem.ncbi.nlm.nih.gov'],'pageErrors':c['pageErrors']}
for key in left:
 assert semantic(left[key])==semantic(right[key]),key
scenarios=sorted({c['scenario'] for c in reports['tagged']['cases']})
assert {'http_failure','transport_failure','malformed_json','malformed_response','malformed_sdf','abort_cid','abort_sdf','autocomplete_abort'}<=set(scenarios)
out={'status':'passed','taggedCases':72,'proposedCases':72,'scenarioCount':18,'contextsPerSource':4,
 'semanticReadbacksExact':True,'fetchFailureMalformedResponseAbortCovered':True,
 'sourceAppSha256':{name:r['sourceAppSha256'] for name,r in reports.items()},
 'browserVersion':reports['proposed']['browserVersion'],'scenarioNames':scenarios,
 'comparison':'User-visible metadata/geometry, preserved prior scenes, busy behavior, dialogs, native input/load paths, PubChem failed requests and recorded request paths/counts. Parallel autocomplete request order is a multiset; every raw order is retained. Unrelated Analytics failures with client IDs/timestamps, source-dependent console stack locations and elapsed time remain preserved but are outside the PubChem semantic comparison. The original over-broad comparison failure and diagnosis are retained separately.',
 'abortScope':'Browser transport abort at CID/SDF/autocomplete; no cancellation UI or AbortController was added.',
 'cases':[{'case':k,'equal':True,'requests':len(left[k]['requests'])} for k in left]}
(root/'manual-pair-verification.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({k:v for k,v in out.items() if k!='cases'},indent=2))
