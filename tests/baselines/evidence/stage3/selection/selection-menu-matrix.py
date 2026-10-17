"""Native Selection menu events in both layouts/themes, on tagged/proposed source.

Only public fixture loading and public selection setup are used. Listeners,
controls, rendering and layout are not replaced. No sleeps or timeout retries.
"""
import argparse,pathlib,sys,json,time,hashlib
root=pathlib.Path.cwd();sys.path.insert(0,str(root/'tests/e2e'))
import premerge as p
from helpers import run_http_server,wait_for_presented_state,write_failure_artifacts
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser();parser.add_argument('--source-root',type=pathlib.Path,required=True);parser.add_argument('--artifacts',type=pathlib.Path,required=True)
parser.add_argument('--record-carried-findings',action='store_true',help='Preserve issue-17 assertion failures, finish observations, and exit 2; a separate paired-source comparison must classify them.')
args=parser.parse_args();args.artifacts.mkdir(parents=True,exist_ok=True)
source_sha=hashlib.sha256((args.source_root/'assets/app/js/app.js').read_bytes()).hexdigest();reports=[]
def presented(page,predicate='() => true'):wait_for_presented_state(page,predicate)
def select(page):
 page.evaluate('()=>VibeMolTesting.setEditSelectionIndices([0])')
 presented(page,'() => VibeMolTesting.getEditSelectionCount() === 1')
def mode(page,name):page.locator('#mode'+name+'Btn').click();presented(page)
with run_http_server(args.source_root) as url,sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
 for legacy in (False,True):
  for dark in (False,True):
   name=('legacy' if legacy else 'workbench')+'/'+('dark' if dark else 'light');started=time.monotonic()
   context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   try:
    page.goto(url+'?appearanceStudy=1'+('&workspaceLab=0' if legacy else ''));page.wait_for_function('()=>window.VibeMolTesting')
    if page.locator('#themeToggleInput').is_checked()!=dark:
     # The tagged index.html utility reveal uses :hover/:focus-within in legacy;
     # expose it through its native hover path before clicking the theme label.
     if legacy:
      page.locator('#topRightUtilities').hover()
      presented(page,"() => getComputedStyle(document.getElementById('topRightUtilitiesReveal')).pointerEvents === 'auto'")
     page.locator('#themeToggleShell').click()
    assert p.load(page,[{'name':'iron.xyz','text':'1\nNative metal menu\nFe 0 0 0\n'}])['ok']
    mode(page,'Edit')
    # Legacy has no Workbench tool strip; loaded Fe enters Transform by the
    # 0.9.2 scene-dependent default. Workbench exposes the explicit radio.
    if not legacy:page.locator('#editTransformToolBtn').click()
    select(page)
    metal=page.locator('#editSelectionMetalBondingCueButton');mp=page.locator('#editSelectionMetalBondingCuePopover');coord=page.locator('#editSelectionCoordinationCueButton');cp=page.locator('#editSelectionCoordinationCuePopover')
    metal.click();presented(page,"() => document.getElementById('editSelectionMetalBondingCuePopover').getAttribute('aria-hidden') === 'false'")
    choices=mp.locator('[data-metal-bonding-choice]').evaluate_all('es=>es.map(e=>e.dataset.metalBondingChoice)')
    assert choices==['auto','force_covalent','force_dative','no_bonds'],choices
    # 0.9.x issue #17: Metal covers Coordination's trigger. Direct switching
    # should work in one click; this equal-footing base/proposed workaround
    # explicitly dismisses Metal and does not claim the intended UX is fixed.
    page.locator('#toolbarVersion').click()
    presented(page,"() => document.getElementById('editSelectionMetalBondingCuePopover').getAttribute('aria-hidden') === 'true'")
    assert page.evaluate('() => VibeMolTesting.getEditSelectionCount()')==1
    coord.click();presented(page,"() => document.getElementById('editSelectionCoordinationCuePopover').getAttribute('aria-hidden') === 'false'")
    assert mp.get_attribute('aria-hidden')=='true'
    alternative=cp.locator('[data-coordination-choice]:not(.is-active)').first
    geometry=alternative.get_attribute('data-coordination-choice');assert geometry
    alternative.click();presented(page,"() => document.getElementById('editSelectionCoordinationCuePopover').getAttribute('aria-hidden') === 'true'")
    value=page.evaluate('''() => {const v=VibeMolStructure.exportActive().volume,a=v.atoms[0];return v.annotations.coordination.byAtomId[String(a.id)].geometryId;}''')
    assert value==geometry,(value,geometry)
    updates=[]
    for target in ['force_covalent','force_dative','no_bonds','auto']:
     select(page);metal.click();presented(page,"() => document.getElementById('editSelectionMetalBondingCuePopover').getAttribute('aria-hidden') === 'false'")
     mp.locator('[data-metal-bonding-choice="'+target+'"]').click()
     presented(page,"() => document.getElementById('editSelectionMetalBondingCuePopover').getAttribute('aria-hidden') === 'true'")
     actual=page.evaluate('''() => {const v=VibeMolStructure.exportActive().volume,a=v.atoms[0];return v.annotations?.metalBonding?.byAtomId?.[String(a.id)]?.mode || 'auto';}''')
     assert actual==target,(actual,target);updates.append(actual)
    select(page);metal.click();mode(page,'Display');assert mp.get_attribute('aria-hidden')=='true' and cp.get_attribute('aria-hidden')=='true'
    mode(page,'Edit');select(page);metal.click()
    page.set_viewport_size({'width':390,'height':850});presented(page)
    box=mp.bounding_box();bounds_failure=None
    try:
     assert box and box['x']>=0 and box['y']>=0 and box['x']+box['width']<=390.1 and box['y']+box['height']<=850.1,box
    except AssertionError:
     if not args.record_carried_findings:raise
     # Issue #17 and the 2026-10-15 standing rule: keep this assertion FAILED.
     # Record both sources; only an identical tagged failure may be carried.
     bounds_failure={'issue':17,'assertion':'Metal popover stays inside viewport at 390 x 850','viewport':{'width':390,'height':850},'actualBox':box}
     write_failure_artifacts(page,args.artifacts,'bounds-'+name.replace('/','-'),errors,[])
    page.screenshot(path=str(args.artifacts/(name.replace('/','-')+'.png')))
    assert not errors,errors
    reports.append({'context':name,'status':'failed assertion recorded' if bounds_failure else 'passed','seconds':round(time.monotonic()-started,2),'metalChoices':choices,'committedModes':updates,'coordinationChoice':geometry,'modeSuspension':True,'responsivePopoverBounds':box,'carriedFinding':bounds_failure,'pageErrors':errors})
    (args.artifacts/'result.json').write_text(json.dumps({'sourceAppSha256':source_sha,'method':__doc__,'cases':reports},indent=2)+'\n');print(json.dumps(reports[-1]),flush=True)
   except BaseException:
    write_failure_artifacts(page,args.artifacts,'menus-'+name.replace('/','-'),errors,[]);raise
   finally:context.close()
 browser.close()
assert len(reports)==4 and hashlib.sha256((args.source_root/'assets/app/js/app.js').read_bytes()).hexdigest()==source_sha
if any(r['carriedFinding'] for r in reports):raise SystemExit(2)
