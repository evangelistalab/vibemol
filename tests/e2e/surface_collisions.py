"""Initial interactive-overlap guard: real co-open surfaces, no placement repair.

The current three opening profiles are an initial subset. Default execution
fails on every collision outside the explicitly authorized exact signatures. --diagnostic collects the same failures
without supplying any merge-gate acceptance. The twelve-pair baseline is latent risk, never accepted suite failures; global
surface coverage is explicitly incomplete.
"""
import sys,json,hashlib,os,itertools,argparse,time
from pathlib import Path
HARNESS_ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('--source-root',type=Path,default=HARNESS_ROOT)
parser.add_argument('--out',type=Path,required=True)
parser.add_argument('--diagnostic',action='store_true')
parser.add_argument('--sampling',choices=['centers','intersections'],default='intersections')
args=parser.parse_args()
ROOT=args.source_root.resolve()
sys.path.insert(0,str(HARNESS_ROOT/'tests/e2e'))
import premerge as p
from helpers import wait_for_presented_state
from browser_lifetime import assert_browser_lifetime,child_usage,child_usage_delta
OUT=args.out;OUT.mkdir(parents=True,exist_ok=False)
SNAP=(HARNESS_ROOT/'tests/e2e/surface_collision_probe.js').read_text()
guard_started=time.monotonic();usage_before=child_usage()
report=dict(lifetime=[],caseCosts=[],peaks=dict(contexts=0,pages=0),sourceSha256=hashlib.sha256((ROOT/'assets/app/js/app.js').read_bytes()).hexdigest(),harnessSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),probeSha256=hashlib.sha256(SNAP.encode()).hexdigest(),diagnosticOnly=args.diagnostic,catalogComplete=False,cases=[],errors=[])
with p.run_http_server(ROOT) as url,p.sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader']);report['browserVersion']=browser.version
 def observe_live():
  live=list(browser.contexts)
  report['peaks']['contexts']=max(report['peaks']['contexts'],len(live))
  report['peaks']['pages']=max(report['peaks']['pages'],sum(len(c.pages)for c in live))
 try:
  assert_browser_lifetime(browser,stage='guard browser created',contexts=0,pages=0,connected=True,records=report['lifetime'])
  for legacy,width,profile in itertools.product([False,True],[1512,1024,390],['coordinates-selection','build-selection','metal-selection']):
   context=None;page=None;errors=[];case_started=time.monotonic()
   name=('legacy' if legacy else 'Workbench')+f'-{width}-{profile}'
   try:
    assert_browser_lifetime(browser,stage=name+'/before',contexts=0,pages=0,connected=True,records=report['lifetime'])
    context=browser.new_context(viewport=dict(width=width,height=1000));observe_live()
    context.on('page',lambda _:observe_live());page=context.new_page();observe_live()
    page.on('pageerror',lambda e:errors.append(str(e)))
    assert_browser_lifetime(browser,stage=name+'/opened',contexts=1,pages=1,connected=True,records=report['lifetime'])
    page.goto(url+'?appearanceStudy=1'+('&workspaceLab=0' if legacy else ''));page.wait_for_function('()=>window.VibeMolTesting')
    page.evaluate('async()=>{await document.fonts.ready;}')
    payload='O 0 0 0\nH .95 0 0\nH -.24 .92 0' if profile!='metal-selection' else 'Fe 0 0 0'
    loaded=p.load(page,[dict(name='surface.xyz',text=payload)]);print('[surface-load] '+json.dumps(dict(actual=loaded,expected={'ok':True})),flush=True);assert loaded['ok'],loaded
    if profile=='coordinates-selection':page.locator('#coordsPanelBtn').evaluate('e=>e.click()')
    page.locator('#modeEditBtn').evaluate('e=>e.click()')
    if not legacy:page.locator('#editTransformToolBtn').evaluate('e=>e.click()')
    page.evaluate('()=>VibeMolTesting.setEditSelectionIndices([0])')
    wait_for_presented_state(page,'()=>document.getElementById("editSelectionTranslateCue").getAttribute("aria-hidden")==="false"')
    if profile=='build-selection':page.locator('#editAdaptiveAddAtomBtn').evaluate('e=>e.click()')
    if profile=='metal-selection':page.locator('#editSelectionMetalBondingCueButton').evaluate('e=>e.click()')
    wait_for_presented_state(page,'()=>true')
    row=dict(context=name,legacy=legacy,width=width,profile=profile,**page.evaluate(SNAP,dict(sampling=args.sampling)),pageerrors=errors)
    report['cases'].append(row);page.screenshot(path=str(OUT/(name+'.png')))
    print('[surface-identities] '+json.dumps(dict(context=name,actual=row['identityErrors'],expected=[])),flush=True)
    assert not row['identityErrors'],row['identityErrors']
    print(json.dumps(dict(context=name,surfaces=len(row['surfaces']),pairs=len(row['pairs']),targets=len(row['targets']),collisions=len(row['collisions']))),flush=True)
   except Exception as e:report['errors'].append(dict(context=name,error=str(e)));raise
   finally:
    try:
     if context is not None:context.close()
    finally:
     report['caseCosts'].append(dict(context=name,wallMs=(time.monotonic()-case_started)*1000,
       originalPageClosed=page.is_closed()if page is not None else None))
     try:
      assert_browser_lifetime(browser,stage=name+'/closed',contexts=0,pages=0,connected=True,records=report['lifetime'])
      if page is not None:assert page.is_closed(),dict(context=name,actualPageClosed=False,expected=True)
     finally:(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
 finally:
  try:
   assert_browser_lifetime(browser,stage='guard phase before browser close',contexts=0,pages=0,connected=True,records=report['lifetime'])
  finally:
   try:browser.close()
   finally:
    try:assert_browser_lifetime(browser,stage='guard browser retired',contexts=0,pages=0,connected=False,records=report['lifetime'])
    finally:(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
report['resourceCost']=dict(wallMs=(time.monotonic()-guard_started)*1000,
    childResources=child_usage_delta(usage_before,child_usage()),
    maxLiveContexts=report['peaks']['contexts'],
    maxLivePages=report['peaks']['pages'],peakObservation='Context creation and page-open events, plus explicit phase snapshots',
    serialContexts=18,managedBrowserRetired=report['lifetime'][-1]['passed'])
print('[surface-resource-cost] '+json.dumps(report['resourceCost']),flush=True)
pairs={tuple(sorted([c['surface'],c['hitSurface']])) for r in report['cases'] for c in r['collisions']}
report['collisionPairs']=sorted(pairs);report['pairCount']=len(pairs)
(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(collisionPairs=report['collisionPairs'],count=len(pairs))),flush=True)

from surface_overlap_contract import evaluate
report['overlapContract']=evaluate(report['cases'])
expected_contexts={('legacy' if legacy else 'Workbench')+f'-{width}-{profile}' for legacy,width,profile in itertools.product([False,True],[1512,1024,390],['coordinates-selection','build-selection','metal-selection'])}
report['coverageScope']=dict(contexts=sorted(expected_contexts),collectedContexts=sorted(c['context'] for c in report['cases']),globalSurfaceCoverageComplete=False)
report['scopeComplete']=len(report['cases'])==18 and set(report['coverageScope']['collectedContexts'])==expected_contexts
report['strictSampling']=all(c['sampling']=='intersections' for c in report['cases'])
report['passed']=report['overlapContract']['passed'] and not report['errors'] and report['scopeComplete'] and report['strictSampling']
(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
if not args.diagnostic:
 unexpected=sorted({tuple(r['signature'])for r in report['overlapContract']['unexpected']},key=str)
 print('[surface-guard] '+json.dumps(dict(actualUnexpected=unexpected,expected=[],rawReport=str(OUT/'report.json'))),flush=True)
 assert report['overlapContract']['passed'],dict(actualUnexpected=unexpected,expected=[],rawReport=str(OUT/'report.json'))
 assert report['scopeComplete'],dict(actual=report['coverageScope'],expected='all18 declared contexts exactly once')
 assert report['strictSampling'],dict(actual=args.sampling,expected='intersections; center-only collection is diagnostic, never strict guard acceptance')
 # Direct human authorizes this strict subset with global coverage incomplete.
 # Do not turn catalogComplete=true or describe these profiles as exhaustive.
