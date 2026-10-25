"""Non-gating continuation behind #53; every bypass remains a native failure.

Execute original assertions/actions once. Only a measured Coordinates click
intercepted by the selection card may continue through a labeled DOM click.
Unknown failures stop that case; later independent cases still get fresh pages.
"""
import argparse
import ast
import hashlib
import inspect
import importlib.metadata
import json
import os
import platform
from pathlib import Path
import time
import traceback
import types

import premerge as p
from ci_evidence import artifact_identity, digest

HERE=Path(__file__).resolve().parent
OUT=Path(os.environ.get('VIBEMOL_TEST_ARTIFACT_DIR',p.ROOT/'out/test-artifacts/coordinates-region')).resolve()


def hit_state(locator):
    return locator.evaluate('''target=>{
      const r=target.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      const hit=document.elementFromPoint(x,y),card=document.getElementById('editSelectionTranslateCue');
      const box=e=>{if(!e)return null;const b=e.getBoundingClientRect(),s=getComputedStyle(e);
        return {id:e.id,x:b.x,y:b.y,width:b.width,height:b.height,zIndex:s.zIndex,
          pointerEvents:s.pointerEvents,moved:e.getAttribute('data-vm-floating-moved')};};
      return {target:box(target),selectionCard:box(card),coordinates:box(document.getElementById('coordsPanel')),
        targetVisible:!!(r.width&&r.height)&&getComputedStyle(target).visibility!=='hidden',targetEnabled:!target.disabled,
        targetOwnsHit:hit===target||target.contains(hit),cardOwnsHit:!!card&&card.contains(hit),
        interceptorId:hit?.closest('#editSelectionPosition, #editSelectionTranslateCue')?.id||null,
        selection:VibeMolTesting.getEditSelectionIndices(),actualHit:hit?.id||hit?.tagName};
    }''')


class Probe:
    def __init__(self):self.case=None;self.checks=[];self.failures=[];self.bypasses=[];self.page=None
    def emit(self,kind,**values):
        row=dict(kind=kind,case=self.case,hostMonotonic=time.monotonic(),**values)
        with (OUT/'events.jsonl').open('a') as stream:stream.write(json.dumps(row)+'\n')
        print('[coordinates-region] '+json.dumps(row),flush=True)
    def check(self,value,line,expression):
        row=dict(line=line,assertion=expression,passed=bool(value),afterBypasses=len(self.bypasses),case=self.case)
        self.checks.append(row);self.emit('assertion',**{k:v for k,v in row.items() if k!='case'})
        return value


class Assertions(ast.NodeTransformer):
    def __init__(self,source):self.source=source;self.sites=[]
    def visit_Assert(self,node):
        text=ast.get_source_segment(self.source,node.test) or ast.unparse(node.test)
        self.sites.append(dict(line=node.lineno,expression=text))
        node.test=ast.copy_location(ast.Call(func=ast.Attribute(value=ast.Name(id='_probe',ctx=ast.Load()),attr='check',ctx=ast.Load()),
            args=[node.test,ast.Constant(node.lineno),ast.Constant(text)],keywords=[]),node.test)
        return node


class Locator:
    def __init__(self,raw,selector,probe):self.raw,self.selector,self.probe=raw,selector,probe
    def __getattr__(self,name):return getattr(self.raw,name)
    def click(self,*args,**kwargs):
        try:return self.raw.click(*args,**kwargs)
        except Exception as error:
            # This is a diagnostic continuation, not an alternative pass path.
            if not self.selector.startswith('#coordsContent'):raise
            try:state=hit_state(self.raw)
            except Exception:raise error
            frames=[dict(function=f.function,line=f.lineno,file=f.filename) for f in inspect.stack()
                    if f.filename==str(HERE/'mode_consistency.py')]
            row=dict(selector=self.selector,line=frames[0]['line'] if frames else None,
                     exceptionType=type(error).__name__,error=str(error),state=state,
                     assertionBoundary=len(self.probe.checks),case=self.probe.case)
            self.probe.failures.append(row);self.probe.emit('native-failure',**{k:v for k,v in row.items() if k!='case'})
            stem='native-failure-'+str(len(self.probe.failures))
            p.write_failure_artifacts(self.probe.page,OUT,stem,[],[])
            known=(type(error).__name__=='TimeoutError' and state['targetVisible'] and state['targetEnabled']
                   and not state['targetOwnsHit'] and state['cardOwnsHit']
                   and state['interceptorId'] in ['editSelectionPosition','editSelectionTranslateCue'])
            if not known:raise
            self.raw.evaluate('el=>el.click()')
            bypass=dict(number=len(self.probe.bypasses)+1,case=self.probe.case,line=row['line'],
                        selector=self.selector,reason='measured #53 selection-card interception',
                        nativeCoverage=False,assertionBoundary=len(self.probe.checks))
            self.probe.bypasses.append(bypass);self.probe.emit('explicit-bypass',**{k:v for k,v in bypass.items() if k!='case'})


class Page:
    def __init__(self,raw,probe):self.raw,self.probe=raw,probe
    def __getattr__(self,name):return getattr(self.raw,name)
    def locator(self,selector,*args,**kwargs):return Locator(self.raw.locator(selector,*args,**kwargs),selector,self.probe)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare-only',action='store_true')
    args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    source_file=HERE/'mode_consistency.py';source=source_file.read_text();tree=ast.parse(source)
    original=ast.dump(tree,include_attributes=False)
    transform=Assertions(source);tree=transform.visit(tree);ast.fix_missing_locations(tree)
    # Independently strip only diagnostic assert observers and compare all AST.
    class Strip(ast.NodeTransformer):
        def visit_Assert(self,node):
            node.test=node.test.args[0];return node
    assert ast.dump(Strip().visit(ast.parse(ast.unparse(tree))),include_attributes=False)==original
    if args.prepare_only:
        print(json.dumps(dict(originalASTExactAfterRemovingObservers=True,assertionSites=len(transform.sites),
                              noBrowserLaunched=True,sourceSuiteSha256=digest(source_file))))
        return 0
    probe=Probe();module=types.ModuleType('_coordinates_region_original')
    module.__file__=str(source_file);module.__dict__['_probe']=probe
    exec(compile(tree,str(source_file),'exec'),module.__dict__)
    identity=artifact_identity();cases=[]
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True)
        try:
            for name,workspace,function in [('legacy-row-actions',0,'coordinate_row_actions'),
                                            ('legacy-orbital-context',0,'orbital_context'),
                                            ('workbench-row-actions',1,'coordinate_row_actions')]:
                context=browser.new_context(viewport={'width':1200,'height':900})
                raw=context.new_page();page=Page(raw,probe);probe.page=raw;probe.case=name
                errors=[];raw.on('pageerror',lambda error:errors.append(str(error)))
                raw.on('dialog',lambda dialog:dialog.dismiss())
                row=dict(case=name,workspace=workspace,function=function,assertionStart=len(probe.checks),bypassStart=len(probe.bypasses))
                try:
                    raw.goto(url+'?workspaceLab='+str(workspace)+'&appearanceStudy=1')
                    raw.wait_for_function('()=>window.VibeMolTesting')
                    getattr(module,function)(page)
                    assert not errors,errors
                    row['execution']='completed original region'
                except Exception as error:
                    row.update(execution='stopped at unknown failure',error=traceback.format_exc())
                    p.write_failure_artifacts(raw,OUT,name,errors,[])
                finally:
                    row.update(assertionEnd=len(probe.checks),bypassEnd=len(probe.bypasses),pageErrors=errors)
                    cases.append(row);probe.emit('case-complete',result=row);context.close()
        finally:
            browser_version=browser.version
            browser.close()
    assert artifact_identity()==identity
    report=dict(diagnosticOnly=True,mergeEvidence=False,artifactIdentity=identity,sourceUnchanged=True,
        harnessSha256=digest(Path(__file__)),sourceSuiteSha256=digest(source_file),
        toolchainLockSha256=digest(p.ROOT/'api/requirements-ci.lock'),cases=cases,
        toolchain=dict(python=platform.python_version(),playwright=importlib.metadata.version('playwright'),
                       chromium=browser_version),
        assertions=probe.checks,nativeFailures=probe.failures,bypasses=probe.bypasses,
        bypassedNativeActionsNeverPass=True,thresholdsChanged=False,
        unexecutedPolicy='A stopped case has remaining original statements unexecuted, never passed; later cases run in independent fresh contexts.',
        isolationLimit='Orbital context and Workbench run independently to expose masking; this is not the ordinary sequential suite gate.')
    (OUT/'result.json').write_text(json.dumps(report,indent=2)+'\n')
    print('[coordinates-region-summary] '+json.dumps(dict(cases=cases,nativeFailures=len(probe.failures),bypasses=len(probe.bypasses),assertions=len(probe.checks))),flush=True)
    return int(any(c['execution']!='completed original region' for c in cases))


if __name__=='__main__':raise SystemExit(main())
