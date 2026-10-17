"""New PubChem-only native matrix; recorded HTTP routes, no production/test rewrites."""
import argparse
import asyncio
import hashlib
import importlib.metadata
import json
from pathlib import Path
import sys
import time
import traceback
from urllib.parse import unquote, urlparse

p=argparse.ArgumentParser()
p.add_argument('--source-root',type=Path,required=True)
p.add_argument('--label',required=True)
p.add_argument('--out',type=Path,required=True)
a=p.parse_args()
source,out=a.source_root.resolve(),a.out.resolve()
out.mkdir(parents=True,exist_ok=True)
assert not (out/'manual-report.json').exists(), 'Never repeat a completed matrix'
repo=Path('/Users/fevange/Source/vibemol')
sys.path.insert(0,str(repo/'tests/e2e'))
from helpers import run_http_server
from playwright.async_api import async_playwright
fixtures=repo/'tests/fixtures/characterize/pubchem'
carbon=out/'carbon.xyz';carbon.write_text('1\nPreserved on PubChem failure\nC 0 0 0\n')
ordinary=out/'ordinary-after-pubchem.xyz';ordinary.write_text('1\nOrdinary import after PubChem\nC 0 0 0\n')
harness_sha=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
(out/('executed-harness-'+harness_sha+'.py')).write_bytes(Path(__file__).read_bytes())
source_sha=hashlib.sha256((source/'assets/app/js/app.js').read_bytes()).hexdigest()
scenarios=['success_button','success_enter','empty_results','http_failure','transport_failure',
 'malformed_json','malformed_response','malformed_sdf','no_3d','metadata_failure',
 'metadata_malformed','abort_cid','abort_sdf','busy_reentry','autocomplete_filter_cache',
 'autocomplete_failure','autocomplete_abort','autocomplete_stale_token']
failure_cases={'empty_results','http_failure','transport_failure','malformed_json','malformed_response',
 'malformed_sdf','no_3d','abort_cid','abort_sdf'}

async def snapshot(page):
 return await page.evaluate('''() => {
   const volume=VibeMolStructure.exportActive().volume;
   return {title:volume.title,comment:volume.comment,atoms:volume.atoms.map(a=>({Z:a.Z,pos:a.pos||[a.x,a.y,a.z]})),
    metadata:[...document.querySelectorAll('#pubchemMetaContent tr')].map(r=>[r.querySelector('th').textContent,r.querySelector('td').textContent]),
    metadataVisible:document.getElementById('pubchemMetaWrap').style.display!=='none'};
 }''')

async def run_case(browser,url,legacy,theme,scenario):
 context=await browser.new_context(viewport={'width':1512,'height':1000},device_scale_factor=1)
 page=await context.new_page()
 key=('legacy' if legacy else 'workbench')+'-'+theme+'-'+scenario
 errors,console,dialogs,requests,failed=[],[],[],[],[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:console.append({'type':m.type,'text':m.text}))
 page.on('requestfailed',lambda r:failed.append({'url':r.url,'failure':r.failure}))
 async def dialog(d):dialogs.append(d.message);await d.accept()
 page.on('dialog',dialog)
 ready,release,stale_complete=asyncio.Event(),asyncio.Event(),asyncio.Event()
 async def replay(route):
  u=urlparse(route.request.url);path=unquote(u.path)
  requests.append({'path':u.path,'query':u.query})
  is_cid='/name/benzene/cids/JSON' in path
  is_sdf='/cid/241/SDF' in path
  is_auto='/rest/autocomplete/' in path
  if scenario=='busy_reentry' and is_cid:ready.set();await release.wait()
  if scenario=='autocomplete_stale_token' and '/compound/ben/JSON' in path:
   ready.set();await release.wait()
  if (scenario=='transport_failure' and is_cid):await route.abort('failed');return
  if (scenario=='abort_cid' and is_cid) or (scenario=='abort_sdf' and is_sdf) or (scenario=='autocomplete_abort' and is_auto):
   await route.abort('aborted');return
  status=200;body=None;mime='application/json'
  if (scenario=='http_failure' and is_cid) or (scenario=='metadata_failure' and '/property/' in path) or (scenario=='autocomplete_failure' and is_auto):status=503;body='{}'
  elif scenario=='malformed_json' and is_cid:body='{"IdentifierList":'
  elif scenario=='malformed_response' and is_cid:body='{"unexpected":true}'
  elif scenario=='empty_results' and is_cid:body='{"IdentifierList":{"CID":[]}}'
  elif scenario=='metadata_malformed' and '/property/' in path:body='{"PropertyTable":'
  elif scenario=='malformed_sdf' and is_sdf:body='invalid SDF';mime='chemical/x-mdl-sdfile'
  elif (scenario=='no_3d' and '/cid/241/conformers/JSON' in path) or '/name/missing3d/conformers/JSON' in path:status=404;body='{}'
  elif is_auto:
   terms=['benzene','BENZENE','missing3d','benzenE ','',123,'trim']
   if scenario=='autocomplete_stale_token':terms=['stale' if '/compound/ben/JSON' in path else 'fresh']
   body=json.dumps({'dictionary_terms':{'compound':terms}})
  elif is_cid:body=(fixtures/'cids.json').read_text()
  elif '/conformers/JSON' in path:body=(fixtures/'conformers.json').read_text()
  elif is_sdf:body=(fixtures/'benzene.sdf').read_text();mime='chemical/x-mdl-sdfile'
  elif '/property/' in path:body=(fixtures/'properties.json').read_text()
  else:raise AssertionError('Unrecorded PubChem request: '+route.request.url)
  await route.fulfill(status=status,body=body,content_type=mime,headers={'Access-Control-Allow-Origin':'*'})
  if '/name/stale/conformers/JSON' in path:stale_complete.set()
 await page.route('https://pubchem.ncbi.nlm.nih.gov/**',replay)
 try:
  await page.goto(url+'?appearanceStudy=1'+('&workspaceLab=0' if legacy else ''))
  await page.wait_for_function('() => !!window.VibeMolEmbed && !!window.VibeMolStructure && !!window.VibeMolWorkbenchHost')
  toggle=page.locator('#themeToggleInput')
  if await toggle.is_checked()!=(theme=='dark'):await toggle.focus();await page.keyboard.press('Space')
  assert await toggle.is_checked()==(theme=='dark')
  await page.locator('#fileInput').set_input_files(str(carbon))
  await page.wait_for_function("() => {try{return VibeMolStructure.exportActive().volume.atoms.length===1}catch(e){if(e.message==='No active structure is loaded.')return false;throw e}}")
  before=await snapshot(page)
  query=page.locator('#pubchemQuery');button=page.locator('#pubchemLoadBtn')
  observations={}
  if scenario.startswith('autocomplete_'):
   if scenario in ('autocomplete_failure','autocomplete_abort'):
    async with page.expect_console_message(predicate=lambda m:'[PubChem] autocomplete failed' in m.text):await query.fill('ben')
    assert await page.locator('#pubchemSuggestions option').count()==0
    assert not dialogs and await button.is_enabled()
   elif scenario=='autocomplete_stale_token':
    await query.fill('ben');await asyncio.wait_for(ready.wait(),30)
    await query.fill('benz')
    await page.wait_for_function("() => [...document.querySelectorAll('#pubchemSuggestions option')].map(n=>n.value).join('|')==='fresh'")
    release.set();await asyncio.wait_for(stale_complete.wait(),30)
    await page.wait_for_function("() => performance.getEntriesByType('resource').some(e=>e.name.includes('/name/stale/conformers/JSON'))")
    await page.evaluate('() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    assert await page.locator('#pubchemSuggestions option').evaluate_all('nodes=>nodes.map(n=>n.value)')==['fresh']
   else:
    await query.fill('ben')
    await page.wait_for_function("() => [...document.querySelectorAll('#pubchemSuggestions option')].map(n=>n.value).join('|')==='benzene|trim'")
    n=sum('/conformers/' in r['path'] for r in requests)
    async with page.expect_request('**/rest/autocomplete/**'):await query.fill('ben')
    await page.wait_for_function("() => performance.getEntriesByType('resource').filter(e=>e.name.includes('/rest/autocomplete/')).length===2")
    await page.evaluate('() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    assert sum('/conformers/' in r['path'] for r in requests)==n==3
    assert await page.locator('#pubchemSuggestions option').evaluate_all('nodes=>nodes.map(n=>n.value)')==['benzene','trim']
   assert await snapshot(page)==before
   observations['suggestions']=await page.locator('#pubchemSuggestions option').evaluate_all('nodes=>nodes.map(n=>n.value)')
  else:
   # The stock characterization uses this setup to avoid an unrelated debounce;
   # loading itself uses native click or Enter, and autocomplete is exercised above.
   await query.evaluate("e=>e.value='benzene'")
   if scenario in ('success_enter','busy_reentry'):await query.press('Enter')
   else:await button.click()
   if scenario=='busy_reentry':
    await asyncio.wait_for(ready.wait(),30)
    assert await button.is_disabled() and await button.get_attribute('aria-busy')=='true'
    await query.press('Enter');assert len(requests)==1
    observations['busyReentryBlocked']=True;release.set()
   await page.wait_for_function("() => document.getElementById('pubchemLoadBtn').getAttribute('aria-busy')==='false'")
   assert await button.is_enabled() and await button.get_attribute('aria-label')=='Search PubChem'
   if scenario in failure_cases:
    assert len(dialogs)==1 and dialogs[0].startswith('PubChem import failed:'),dialogs
    assert await snapshot(page)==before
    observations['existingScenePreserved']=True
   else:
    await page.wait_for_function('() => VibeMolStructure.exportActive().volume.atoms.length===12')
    assert not dialogs
    imported=await snapshot(page)
    assert imported['metadataVisible'] and ['CID','241'] in imported['metadata']
    if scenario in ('metadata_failure','metadata_malformed'):
     assert ['Name','—'] in imported['metadata']
     assert any('[PubChem] metadata lookup failed' in c['text'] for c in console)
    else:assert ['Name','Benzene'] in imported['metadata']
    observations['imported']=imported
    # Leaving a PubChem record clears its metadata through the original app callback.
    await page.locator('#fileInput').set_input_files(str(ordinary))
    await page.wait_for_function('() => VibeMolStructure.exportActive().volume.atoms.length===1')
    assert not (await snapshot(page))['metadataVisible']
    observations['metadataClearedOnOrdinaryImport']=True
  assert not errors,errors
  unexpected=[c for c in console if c['type']=='error' and not ('[PubChem] import failed' in c['text'] or c['text'].startswith('Failed to load resource:'))]
  assert not unexpected,unexpected
  if scenario in ('abort_cid','abort_sdf','autocomplete_abort'):assert any('ERR_ABORTED' in (f['failure'] or '') for f in failed),failed
  if scenario in ('success_button','http_failure'):await page.screenshot(path=str(out/(key+'.png')))
  result={'case':key,'launch':'legacy' if legacy else 'workbench','theme':theme,'scenario':scenario,'status':'passed',
   'sourceAppSha256':source_sha,'harnessSha256':harness_sha,
   'observations':observations,'requests':requests,'dialogs':dialogs,'failedRequests':failed,'pageErrors':errors,'console':console}
  (out/(key+'.json')).write_text(json.dumps(result,indent=2)+'\n')
  print('MANUAL_PASS '+key,flush=True)
  return result
 except BaseException:
  (out/(key+'-failure.log')).write_text(traceback.format_exc())
  (out/(key+'-failure.json')).write_text(json.dumps({'requests':requests,'dialogs':dialogs,'failed':failed,'console':console,'pageErrors':errors},indent=2)+'\n')
  await page.screenshot(path=str(out/(key+'-failure.png')))
  (out/(key+'-failure.html')).write_text(await page.content())
  raise
 finally:await context.close()

async def main():
 started=time.monotonic();cases=[]
 with run_http_server(source) as url:
  async with async_playwright() as pw:
   browser=await pw.chromium.launch(headless=True,
    executable_path=str(Path.home()/'Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
    args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
   try:
    for legacy in (False,True):
     for theme in ('light','dark'):
      for scenario in scenarios:
       key=('legacy' if legacy else 'workbench')+'-'+theme+'-'+scenario
       checkpoint=out/(key+'.json')
       if checkpoint.exists():
        prior=json.loads(checkpoint.read_text())
        assert prior['status']=='passed' and prior['sourceAppSha256']==source_sha
        cases.append(prior)
       else:cases.append(await run_case(browser,url,legacy,theme,scenario))
       (out/'progress.json').write_text(json.dumps({'completedCases':len(cases),'last':cases[-1]['case']},indent=2)+'\n')
    report={'label':a.label,'status':'passed','sourceRoot':str(source),'sourceAppSha256':hashlib.sha256((source/'assets/app/js/app.js').read_bytes()).hexdigest(),
     'browserVersion':browser.version,'playwrightVersion':importlib.metadata.version('playwright'),'seconds':time.monotonic()-started,
     'scenarioCount':len(scenarios),'caseCount':len(cases),'cases':cases,
     'method':'Native load button/Enter/input routes; recorded PUG response fixtures plus explicit failure/malformed/abort responses. Browser network abort is exercised; no cancellation UI or AbortController is invented. No private functions, handler/source replacements, forced clicks, assertion changes or fixed sleeps.'}
    (out/'manual-report.json').write_text(json.dumps(report,indent=2)+'\n')
   finally:await browser.close()
asyncio.run(main())
