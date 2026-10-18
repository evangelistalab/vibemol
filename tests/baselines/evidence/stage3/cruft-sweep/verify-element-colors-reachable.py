"""Normal user UI, no QA flag, private APIs, handler replacement or sleeps."""
import hashlib,json,pathlib,sys
root=pathlib.Path.cwd();sys.path.insert(0,str(root/'tests/e2e'))
from helpers import run_http_server
from playwright.sync_api import sync_playwright
source=root/'out/test-artifacts/stage3/colors/pre-group'
out=root/'out/test-artifacts/stage3/cruft-sweep';out.mkdir(parents=True,exist_ok=True)
fixture=out/'carbon.xyz';fixture.write_text('1\nElement Colors reachability\nC 0 0 0\n')
results=[]
with run_http_server(source) as url,sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
 for legacy in [False,True]:
  context=browser.new_context(viewport={'width':1512,'height':1000});page=context.new_page();errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(url+'?appearanceStudy=1'+('&workspaceLab=0' if legacy else ''))
  page.wait_for_function('() => !!window.VibeMolWorkbenchHost && !!window.VibeMolAppearanceLooks')
  if not legacy:
   page.locator('#fileInput').set_input_files(str(fixture))
   page.wait_for_function('() => VibeMolStructure.exportActive()?.volume.atoms.length === 1')
   page.locator('#workbenchPanelsBtn').click()
   page.locator('#workbenchPanelsMenu').get_by_role('menuitemcheckbox',name='Properties',exact=True).click()
   page.locator('#inspectorLookTab').click()
   page.locator('#appearanceColorsSection > summary').click()
   button=page.locator('#studioElementColorEdit');assert button.is_visible()
   route=button.evaluate('el => el.onclick.toString()');assert 'openElementColors' in route
   button.click()
   page.wait_for_function("() => document.getElementById('elementColorOverlay').style.display === 'flex' && document.getElementById('periodicTableCanvas').width > 0")
   assert page.locator('#elementColorOverlay').is_visible()
   result={'launch':'workbench','editorOpenedThrough':'Panels → Properties → Look → Colors → Edit…',
    'clickHandler':route,'editorOpen':True,'title':page.locator('#elementColorName').inner_text(),
    'legacyButtonPresent':page.locator('#elementColorBtn').count()!=0,'pageErrors':errors}
   page.screenshot(path=str(out/'workbench-editor-native-ui.png'))
   page.locator('#elementColorClose').click();assert page.locator('#elementColorOverlay').is_hidden()
  else:
   result={'launch':'legacy','legacyButton':page.locator('#elementColorBtn').evaluate('el=>({connected:el.isConnected,onclick:typeof el.onclick,handler:el.onclick?.toString(),visible:!!el.getBoundingClientRect().width})'),'pageErrors':errors}
  assert not errors,errors;results.append(result);context.close()
 browser.close()
(out/'reachability.json').write_text(json.dumps({'integrationCommit':'b8baed5236cb675fe3361b630e304de24dc01fea','sourceAppSha256':hashlib.sha256((source/'assets/app/js/app.js').read_bytes()).hexdigest(),'method':__doc__,'results':results},indent=2)+'\n')
print(json.dumps(results))
