"""Read-only startup diagnosis after the halted gate; no gate retry or fix."""
import hashlib,json,pathlib,sys
root=pathlib.Path.cwd();sys.path.insert(0,str(root/'tests/e2e'))
from helpers import run_http_server
from playwright.sync_api import sync_playwright
out=root/'out/test-artifacts/stage3/colors/boot-diagnosis';out.mkdir(parents=True,exist_ok=True)
names=['elementColorBtn','elementColorOverlay','elementColorClose','periodicTableViewport','periodicTableCanvas','elementColorName','elementColorPicker','elementColorResetOne','elementColorResetAll']
records=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
 for label,source in [('pre-group',root/'out/test-artifacts/stage3/colors/pre-group'),('proposed',root)]:
  with run_http_server(source) as url:
   context=browser.new_context(viewport={'width':1512,'height':1000});page=context.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   if label=='pre-group':
    original=(source/'assets/app/js/app.js').read_text()
    marker='  // Keyboard shortcuts are handled by the mode-aware router defined above.'
    assert original.count(marker)==1
    instrumented=original.replace(marker,'  window.__colorsCacheDiagnostic = () => ({'+','.join(names)+'});\n'+marker)
    page.route('**/assets/app/js/app.js*',lambda route:route.fulfill(body=instrumented,content_type='text/javascript'))
   page.goto(url+'?appearanceStudy=1&qa=1')
   page.wait_for_function('() => window.VibeMolWorkbenchHost && window.__vmqaElementCaches')
   data=page.evaluate('''({label,names}) => {
     const cached = label==='pre-group' ? __colorsCacheDiagnostic() : __vmqaElementCaches.readNodes();
     return {qaInitialized:!!window.__vmqa,inventorySize:Object.keys(__vmqaElementCaches.ids).length,
       nodes:names.map(name=>{const node=cached[name],live=document.getElementById(name);return {
         name,same:node===live,cachedConnected:node?.isConnected,liveConnected:live?.isConnected,
         cachedTag:node?.tagName,liveTag:live?.tagName,cachedParent:node?.parentElement?.id,liveParent:live?.parentElement?.id,
         cachedHtml:node?.outerHTML.slice(0,1000),liveHtml:live?.outerHTML.slice(0,1000)}})};
   }''',{'label':label,'names':names})
   records.append({'source':label,'sourceAppSha256':hashlib.sha256((source/'assets/app/js/app.js').read_bytes()).hexdigest(),
     'observationOnly':True,'preGroupPrivateReadExportInjected':label=='pre-group','pageErrors':errors,**data})
   page.screenshot(path=str(out/(label+'.png')));context.close()
 browser.close()
(out/'result.json').write_text(json.dumps(records,indent=2)+'\n')
for r in records:print(json.dumps({'source':r['source'],'qaInitialized':r['qaInitialized'],'pageErrors':r['pageErrors'],
  'differentNodes':[{k:v for k,v in n.items() if k not in ['cachedHtml','liveHtml']} for n in r['nodes'] if not n['same']]}))
