"""Observe every module binding, cache field and panel node on unchanged source."""
import json,pathlib,sys,hashlib
from html.parser import HTMLParser
root=pathlib.Path.cwd();sys.path.insert(0,str(root/'tests/e2e'))
from helpers import run_http_server
from playwright.sync_api import sync_playwright
out=root/'out/test-artifacts/stage3/cruft-sweep';source=root/'out/test-artifacts/stage3/colors/pre-group'
metadata=json.loads((out/'bindings.json').read_text());by_name={m['name']:m for m in metadata}
class IndexIds(HTMLParser):
 def __init__(self):super().__init__();self.stack=[];self.ids={}
 def handle_starttag(self,tag,attrs):
  a=dict(attrs);entry={'tag':tag,'id':a.get('id'),'class':a.get('class',''),'line':self.getpos()[0]}
  if entry['id']:self.ids[entry['id']]={'line':entry['line'],'ancestors':self.stack.copy()}
  if tag not in ['input','img','br','hr','meta','link','source','area','base','wbr','embed','param','track','col']:self.stack.append(entry)
 def handle_endtag(self,tag):
  for i in range(len(self.stack)-1,-1,-1):
   if self.stack[i]['tag']==tag:self.stack=self.stack[:i];break
index=IndexIds();index.feed((source/'index.html').read_text());records=[]
script=(out/'observational-app.js').read_text()
with run_http_server(source) as url,sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
 for legacy in [False,True]:
  context=browser.new_context(viewport={'width':1512,'height':1000});page=context.new_page();errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/assets/app/js/app.js*',lambda route:route.fulfill(body=script,content_type='text/javascript'))
  page.goto(url+'?appearanceStudy=1'+('&workspaceLab=0' if legacy else ''))
  page.wait_for_function('() => window.VibeMolWorkbenchHost && window.__domReferenceCensus')
  rows=page.evaluate('''meta => {
    const bindings=__domReferenceCensus(),rows=[];
    function add(name,node,queriedId=null) {
      const id=node?.id||queriedId;if(!id)return;
      const live=document.getElementById(id),parents=[];
      for(let p=node?.parentElement;p;p=p.parentElement)parents.push({id:p.id,tag:p.tagName,class:p.className});
      rows.push({name,id,cachedNull:node===null,cachedConnected:node?.isConnected??null,
        liveExists:!!live,same:node===live,tag:node?.tagName??null,ancestors:parents,
        type:node?.type??null,hasClickHandler:typeof node?.onclick==='function'});
    }
    for(const {name,queriedId} of meta) {
      const value=bindings[name];
      if(value instanceof Element || (value===null&&queriedId)) add(name,value,queriedId);
      else if(Array.isArray(value)||value instanceof NodeList||value instanceof HTMLCollection) {
        [...value].forEach((v,i)=>{if(v instanceof Element)add(name+'['+i+']',v);});
      } else if(value&&typeof value==='object'&&value.panel instanceof Element) add(name+'.panel',value.panel);
    }
    for(const [name,node] of Object.entries(bindings.els))add('els.'+name,node);
    return rows;
  }''',metadata)
  for row in rows:
   base_name=row['name'].split('[')[0].split('.')[0];m=by_name.get(base_name,{})
   row.update(declarationLine=m.get('declarationLine'),queryLine=m.get('queryLine'),indexMarkup=index.ids.get(row['id']),referenceSites=m.get('references',[]))
  records.append({'launch':'legacy' if legacy else 'workbench','pageErrors':errors,'references':rows})
  assert not errors,errors;context.close()
 browser.close()
wb,legacy=records;legacy_by={r['name']:r for r in legacy['references']}
retired=[r for r in wb['references'] if not r['same'] and r['cachedConnected'] is False]
absent=[r for r in wb['references'] if r['cachedNull'] and not r['liveExists']]
for row in retired:row['legacyComparison']=legacy_by.get(row['name'])
report={'sourceCommit':'b8baed5236cb675fe3361b630e304de24dc01fea','sourceAppSha256':hashlib.sha256((source/'assets/app/js/app.js').read_bytes()).hexdigest(),'method':__doc__,'moduleBindingsInspected':len(metadata),'records':records,'workbenchDetachedOrReplaced':retired,'nullAbsentReferences':absent}
(out/'dom-census.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'bindingsInspected':len(metadata),'referencesObserved':{r['launch']:len(r['references']) for r in records},'retired':[{'name':r['name'],'id':r['id'],'appLine':r['queryLine'],'markupLine':r['indexMarkup']['line'] if r['indexMarkup'] else None,'liveExists':r['liveExists'],'legacySame':r.get('legacyComparison',{}).get('same')} for r in retired],'nullAbsent':[{'name':r['name'],'id':r['id']} for r in absent]},indent=2))
