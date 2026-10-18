"""Serial fixed-harness checks and a nonblocking presented-frame observation."""
from pathlib import Path
import base64
import hashlib
import json
import os
import sys
import time
import traceback
import subprocess
import struct
import os
import importlib.metadata

root=Path.cwd()
group=root/'out/edit320-presented-frames'
group.mkdir(parents=True,exist_ok=True)
harness=root
sys.path.insert(0,str(harness/'tests/e2e'))
import edit_tool as suite

INIT='''(()=>{const state={frames:[]};window.__edit320PresentedProbe=state;
 const frame=t=>{if(innerWidth===320&&state.frames.length<240){state.frames.push({
   atMs:t,epochMs:performance.timeOrigin+t,width:innerWidth,height:innerHeight,
   compact:document.body?.dataset.wbCompact??null,
   left:document.body?.style.getPropertyValue('--wb-left')??null,
   mode:document.body?.dataset.wbMode??null});}requestAnimationFrame(frame);};
 requestAnimationFrame(frame);})();'''
READBACK='''el=>{const widths={scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};
 const r=document.getElementById('workbenchBar').getBoundingClientRect();
 return {widths,state:{viewport:innerWidth,compact:document.body.dataset.wbCompact,
   mode:document.body.dataset.wbMode,barX:r.x,barWidth:r.width,atMs:performance.now(),
   timeOrigin:performance.timeOrigin}};}'''

class Locator:
    def __init__(self,locator,proxy):self.locator,self.proxy=locator,proxy
    def evaluate(self,expression,*args,**kwargs):
        assert expression=='el=>({scrollWidth:el.scrollWidth,clientWidth:el.clientWidth})'
        result=self.locator.evaluate(READBACK,*args,**kwargs)
        self.proxy.report['widths'].append(result)
        self.proxy.save()
        return result['widths']
    def __getattr__(self,name):return getattr(self.locator,name)

SNAPSHOT="""()=>({atMs:performance.now(),epochMs:performance.timeOrigin+performance.now(),width:innerWidth,height:innerHeight,compact:document.body?.dataset.wbCompact??null,left:document.body?.style.getPropertyValue('--wb-left')??null,mode:document.body?.dataset.wbMode??null})"""

class Page:
    def __init__(self,page,report,save,out):
        self.page,self.report,self.save,self.out=page,report,save,out
        self.cdp=page.context.new_cdp_session(page);self.active=False
        self.cdp.on('Page.screencastFrame',self.frame)
    def frame(self,event):
        index=len(self.report['screencastFrames'])
        name=f'presented-{index:03d}.png';(self.out/name).write_bytes(base64.b64decode(event['data']))
        pixel_width,pixel_height=struct.unpack('>II',(self.out/name).read_bytes()[16:24])
        self.report['screencastFrames'].append({'file':name,'metadata':event['metadata'],'pixelWidth':pixel_width,'pixelHeight':pixel_height,'valid320Raster':pixel_width==320 and pixel_height==1000 and event['metadata']['deviceWidth']==320})
        self.cdp.send('Page.screencastFrameAck',{'sessionId':event['sessionId']})
    def set_viewport_size(self,viewport):
        if viewport['width']==320:
            self.cdp.send('Page.startScreencast',{'format':'png','everyNthFrame':1,'maxWidth':1440,'maxHeight':1000});self.active=True
        elif self.active:
            # Measurement horizon only: the320px assertion has already executed.
            self.page.wait_for_function('()=>window.__edit320PresentedProbe.frames.length>=8')
            self.stop()
        result=self.page.set_viewport_size(viewport)
        if viewport['width']==320:self.report['immediateAfterMetrics']=self.page.evaluate(SNAPSHOT)
        return result
    def wait_for_function(self,expression,*args,**kwargs):
        if expression=="() => document.body.dataset.wbCompact === 'true'":
            self.report['beforeCompactWait']=self.page.evaluate(SNAPSHOT)
        return self.page.wait_for_function(expression,*args,**kwargs)
    def stop(self):
        self.cdp.send('Page.stopScreencast');self.active=False
        self.cdp.remove_listener('Page.screencastFrame',self.frame)
    def locator(self,selector,*args,**kwargs):
        locator=self.page.locator(selector,*args,**kwargs)
        return Locator(locator,self) if selector=='.wb-tools' else locator
    def __getattr__(self,name):return getattr(self.page,name)

out=group/'native-fixed';assert not out.exists();out.mkdir()
sources=[('tagged',root/'diagnostic-sources/tagged'),('integration',root/'diagnostic-sources/integration'),('held-5c',root/'diagnostic-sources/held')]
config=json.loads((root/'tools/diagnostics/edit320-frame-sources.json').read_text())
summary=[]
for repetition,label,source in [(rep,label,source) for rep in [1,2,3] for label,source in sources]:
    expected=config['sources']['held' if label=='held-5c' else label]
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=source,text=True).strip()==expected['commit']
    assert subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=source,text=True).strip()==expected['tree']
    assert not subprocess.check_output(['git','status','--porcelain'],cwd=source,text=True).strip()
    assert hashlib.sha256((harness/'tests/e2e/edit_tool.py').read_bytes()).hexdigest()==config['fixedHarnessSha256']
    dest=out/(label+'-'+str(repetition));dest.mkdir();suite.p.ROOT,suite.p.ARTIFACTS=source,dest
    report={'label':label,'repetition':repetition,'sourceCommit':expected['commit'],'sourceTree':expected['tree'],'github':{k:os.environ.get(k) for k in ['GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_SHA','ImageOS','ImageVersion','RUNNER_NAME']},'playwrightVersion':importlib.metadata.version('playwright'),'sourceAppSha256':hashlib.sha256((source/'assets/app/js/app.js').read_bytes()).hexdigest(),
            'harnessSha256':hashlib.sha256((harness/'tests/e2e/edit_tool.py').read_bytes()).hexdigest(),
            'widths':[],'screencastFrames':[],'productionSourceChanged':False,'diagnosticOnly':True,'usableAsMergeGate':False,
            'frameProbeLimitation':'Compositor screencast plus read-only requestAnimationFrame attribute sampling can affect timing. The probe observes a possible visible transient; it never drives compact state or refreshes Workbench.'}
    assert report['sourceAppSha256']==expected['hashes']['assets/app/js/app.js']
    def save():(dest/'result.json').write_text(json.dumps(report,indent=2)+'\n')
    started=time.monotonic();save()
    with suite.p.run_http_server(source) as url,suite.p.sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
        report['browserVersion']=browser.version
        page=browser.new_page(viewport={'width':1440,'height':1000});errors=[]
        page.add_init_script(INIT);page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.dismiss())
        proxy=Page(page,report,save,dest)
        try:
            suite.run(proxy,url)
            assert [x['state']['viewport'] for x in report['widths']]==[320,390,768,1440,1920]
            assert all(x['widths']['scrollWidth']<=x['widths']['clientWidth']+1 for x in report['widths'])
            assert report['widths'][0]['state']['compact']=='true'
            assert not errors,errors
            report['status']='passed'
        except BaseException as error:
            report.update(status='failed',exception=type(error).__name__,message=str(error),traceback=traceback.format_exc())
            suite.p.write_failure_artifacts(page,dest,'fixed-width-failure',errors,[])
        finally:
            if proxy.active:proxy.stop()
            report['requestAnimationFrames']=page.evaluate('()=>window.__edit320PresentedProbe.frames')
            report['pageErrors']=errors
            report['seconds']=round(time.monotonic()-started,3);save();browser.close()
    summary.append({k:report[k] for k in ['label','repetition','status','widths','browserVersion','seconds']})
    (out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps(summary[-1]),flush=True)
    if report['status']!='passed':raise SystemExit(1)
print('Nine fixed-harness presentation observations complete. Diagnostic only; no merge acceptance.',flush=True)
