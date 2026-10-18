#!/usr/bin/env python3
"""Diagnostic replay only. Run the common, unchanged edit_tool.run() body.

Fresh browser for each observation; the original width list, assertions, waits
and event sequence are retained. visual_schemes is outside the 320px workflow
and is not run. No app response is rewritten. Source checkouts stay clean.
"""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import time
import traceback

WIDTHS_EXPRESSION = 'el=>({scrollWidth:el.scrollWidth,clientWidth:el.clientWidth})'
INIT = 'globalThis.__vibemol320Diagnostic={fitToolsCalls:0,lastFitToolsEntryMs:null};'
CONDITION = '''(globalThis.__vibemol320Diagnostic ? (
  globalThis.__vibemol320Diagnostic.lastFitToolsEntryMs=performance.now(),
  globalThis.__vibemol320Diagnostic.fitToolsCalls++,false) : false)'''
READBACK = '''el=>{
  const widths=(WIDTHS_EXPRESSION)(el);
  const now=performance.now(), d=globalThis.__vibemol320Diagnostic;
  const trigger=document.getElementById('workbenchOverflowBtn');
  const menu=document.getElementById('workbenchOverflowMenu');
  const visible=n=>!!n&&!n.hidden&&getComputedStyle(n).display!=='none'&&!!n.getClientRects().length;
  const box=n=>{if(!n)return null;const r=n.getBoundingClientRect(),s=getComputedStyle(n);
    return {x:r.x,y:r.y,width:r.width,height:r.height,clientWidth:n.clientWidth,
      scrollWidth:n.scrollWidth,display:s.display,flex:s.flex,flexBasis:s.flexBasis,
      minWidth:s.minWidth,widthStyle:s.width,boxSizing:s.boxSizing,
      classes:n.className,hidden:n.hidden??null};};
  return {widths,observation:{...widths,viewport:{width:innerWidth,height:innerHeight},
    expectedMaximum:widths.clientWidth+1,assertionPass:widths.scrollWidth<=widths.clientWidth+1,
    observedAtMs:now,lastFitToolsEntryMs:d?.lastFitToolsEntryMs??null,
    millisecondsSinceLastFitToolsCall:d?.lastFitToolsEntryMs==null?null:now-d.lastFitToolsEntryMs,
    fitToolsCalls:d?.fitToolsCalls??null,
    overflowTrigger:{present:!!trigger,visible:visible(trigger),hidden:trigger?.hidden??null,
      ariaExpanded:trigger?.getAttribute('aria-expanded')??null},
    overflowMenu:{present:!!menu,rowCount:menu?.querySelectorAll('[role="menuitem"]').length??null,
      childCount:menu?.children.length??null,hidden:menu?.hidden??null,visible:visible(menu)},
    bodyMode:document.body.dataset.wbMode,compact:document.body.dataset.wbCompact,
    adaptiveMode:document.getElementById('displayWindowAdaptiveMenu')?.dataset.mode,
    bar:box(document.getElementById('workbenchBar')),tools:box(el),
    modes:box(document.getElementById('toolbarModeRow')),
    children:[...el.children].map(n=>({id:n.id,...box(n)})),
    focusedId:document.activeElement?.id,
    fontStatus:document.fonts?.status,
    buildChecked:document.getElementById('editAdaptiveAddAtomBtn')?.getAttribute('aria-checked'),
    theme:document.documentElement.dataset.theme,
    timing:'Original width read first; diagnostics follow in the same JavaScript task; original widths returned to Python.'}};
}'''.replace('WIDTHS_EXPRESSION', WIDTHS_EXPRESSION)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()

def install_probe(page, source):
    anchor='  function fitTools() {\n    const groups = '
    assert source.count(anchor)==1, 'fitTools anchor changed'
    line=source[:source.index(anchor)].count('\n')+1
    page.add_init_script(INIT)
    cdp=page.context.new_cdp_session(page)
    metadata={'entryLineOneBased':line+1,'condition':CONDITION,'resolved':[],'pauses':[],'scripts':[]}
    cdp.on('Debugger.breakpointResolved',lambda event:metadata['resolved'].append(event))
    cdp.on('Debugger.scriptParsed',lambda event:metadata['scripts'].append(
        {'scriptId':event['scriptId'],'url':event['url']}) if '/workbench.js' in event.get('url','') else None)
    def paused(event):
        metadata['pauses'].append(event.get('reason'))
        cdp.send('Debugger.resume')
    cdp.on('Debugger.paused',paused)
    cdp.send('Debugger.enable')
    cdp.send('Debugger.setPauseOnExceptions',{'state':'none'})
    metadata['breakpoint']=cdp.send('Debugger.setBreakpointByUrl',{
        'lineNumber':line,'urlRegex':r'/workbench\.js(?:\?|$)','condition':CONDITION})
    return cdp,metadata

class ToolsLocator:
    def __init__(self,locator,proxy): self.locator,self.proxy=locator,proxy
    def evaluate(self,expression,*args,**kwargs):
        if self.proxy.width!=320: return self.locator.evaluate(expression,*args,**kwargs)
        assert expression==WIDTHS_EXPRESSION, {'actual':expression,'expected':WIDTHS_EXPRESSION}
        result=self.locator.evaluate(READBACK,*args,**kwargs)
        self.proxy.report['observations'].append(result['observation'])
        self.proxy.save()
        print('EDIT_TOOL_320_READBACK '+json.dumps(result['observation'],sort_keys=True),flush=True)
        return result['widths']
    def __getattr__(self,name): return getattr(self.locator,name)

class DiagnosticPage:
    def __init__(self,page,report,save): self.page,self.report,self.save,self.width=page,report,save,1440
    def set_viewport_size(self,viewport):
        self.width=viewport['width']
        return self.page.set_viewport_size(viewport)
    def locator(self,selector,*args,**kwargs):
        locator=self.page.locator(selector,*args,**kwargs)
        return ToolsLocator(locator,self) if selector=='.wb-tools' else locator
    def __getattr__(self,name): return getattr(self.page,name)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-root',type=Path,required=True)
    p.add_argument('--harness-root',type=Path,required=True)
    p.add_argument('--config',type=Path,required=True)
    p.add_argument('--artifacts',type=Path,required=True)
    p.add_argument('--label',choices=['tagged','integration','held'],required=True)
    p.add_argument('--repetition',type=int,choices=[1,2,3],required=True)
    args=p.parse_args();root=args.source_root.resolve();harness=args.harness_root.resolve()
    out=args.artifacts.resolve();out.mkdir(parents=True,exist_ok=False)
    config=json.loads(args.config.read_text());expected=config['sources'][args.label]
    assert git(root,'rev-parse','HEAD')==expected['commit']
    assert git(root,'rev-parse','HEAD^{tree}')==expected['tree']
    assert not git(root,'status','--porcelain')
    for name,value in expected['hashes'].items(): assert sha(root/name)==value,(name,'source SHA')
    for name,value in config['suiteFromIntegration']['hashes'].items(): assert sha(harness/name)==value,(name,'common harness SHA')
    os.environ['VIBEMOL_TEST_ARTIFACT_DIR']=str(out)
    sys.path.insert(0,str(harness/'tests/e2e'))
    import edit_tool as suite
    suite.p.ROOT,suite.p.ARTIFACTS=root,out
    report={'label':args.label,'repetition':args.repetition,**expected,
      'commonHarness':config['suiteFromIntegration'],'harnessSha256':sha(Path(__file__)),
      'diagnosticOnly':True,'usableAsMergeGate':False,'productionSourceChanged':False,
      'shippedAssertionChanged':False,'waitsChanged':False,'goldensChanged':False,
      'scope':'Unchanged complete edit_tool.run body, including original 320→1920 width loop; excludes separate visual_schemes surface fixtures.',
      'observations':[],'python':platform.python_version(),'os':platform.system(),
      'architecture':platform.machine(),'playwrightVersion':importlib.metadata.version('playwright'),
      'github':{k:os.environ.get(k) for k in ['GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_SHA','ImageOS','ImageVersion','RUNNER_NAME']},
      'observerEffect':'Same non-pausing conditional DevTools breakpoint timestamps fitTools entry on all sources. Debugger instrumentation can affect timing; numeric reads execute before additional DOM diagnostics.'}
    def save(): (out/'result.json').write_text(json.dumps(report,indent=2)+'\n')
    save();started=time.monotonic();exit_code=0
    with suite.p.run_http_server(root) as url,suite.p.sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
        report['browserVersion']=browser.version
        page=browser.new_page(viewport={'width':1440,'height':1000});errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.dismiss())
        cdp,probe=install_probe(page,(root/'assets/app/js/workbench.js').read_text());report['fitToolsProbe']=probe
        try:
            suite.run(DiagnosticPage(page,report,save),url)
            assert not errors,errors
            report['suiteRunStatus']='passed'
        except BaseException as error:
            report.update(suiteRunStatus='failed',exception=type(error).__name__,message=str(error),traceback=traceback.format_exc())
            traceback.print_exc();suite.p.write_failure_artifacts(page,out,'edit-tool-failure',errors,[]);exit_code=1
        finally:
            report['pageErrors']=errors
            report['renderer']=page.evaluate('''()=>{const gl=document.createElement('canvas').getContext('webgl2');
              if(!gl)return null;const ext=gl.getExtension('WEBGL_debug_renderer_info');
              return {renderer:gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION),
                unmaskedRenderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};}''')
            report['servedWorkbenchSources']=[]
            for item in probe['scripts']:
                text=cdp.send('Debugger.getScriptSource',{'scriptId':item['scriptId']})['scriptSource']
                report['servedWorkbenchSources'].append({**item,'sha256':hashlib.sha256(text.encode()).hexdigest()})
            page.screenshot(path=str(out/'final-state.png'));(out/'final-state.html').write_text(page.content())
            browser.close()
    observations=report['observations']
    report['probeValid']=(len(observations)==1 and observations[0]['viewport']=={'width':320,'height':1000}
      and observations[0]['fitToolsCalls']>0 and observations[0]['millisecondsSinceLastFitToolsCall'] is not None
      and bool(probe['resolved']) and not probe['pauses'] and bool(report['servedWorkbenchSources'])
      and all(item['sha256']==expected['hashes']['assets/app/js/workbench.js'] for item in report['servedWorkbenchSources']))
    for name,value in expected['hashes'].items(): assert sha(root/name)==value,name
    assert not git(root,'status','--porcelain')
    if not report['probeValid']:exit_code=2
    report['seconds']=round(time.monotonic()-started,3);report['exitCode']=exit_code;save()
    print('EDIT_TOOL_320_RESULT '+json.dumps({k:report[k] for k in ['label','repetition','suiteRunStatus','probeValid','observations','seconds','exitCode']},sort_keys=True),flush=True)
    return exit_code

if __name__=='__main__': raise SystemExit(main())
