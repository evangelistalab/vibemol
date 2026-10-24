"""Non-gating #47/#48 collector; preserves all original repair and timing policy."""
from __future__ import annotations
import argparse
import ast
import hashlib
import inspect
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import time
import traceback
import types

HERE = Path(__file__).resolve().parent


class Probe:
    def __init__(self, out, source_file):
        self.out, self.source_file = out, str(source_file)
        self.page = None
        self.case = 'setup'
        self.line = None
        self.assertions, self.repairs, self.failures, self.attempts = [], [], [], []
        self.navigation_blocks = []
        self.active_selection = None
        self.pending_fallback = None
        self.sequence = 0
        self.dropped = 0

    def emit(self, kind, **data):
        self.sequence += 1
        row = dict(sequence=self.sequence, hostMonotonic=time.monotonic(), kind=kind,
                   case=self.case, mainLine=self.line, **data)
        with (self.out/'host-events.jsonl').open('a') as stream:
            stream.write(json.dumps(row, default=str)+'\n')
        if kind in ['case','selection-fallback','build-failure','failure','complete']:
            print('[smoke-input] '+json.dumps(row,default=str),flush=True)
        return row

    def callsite(self):
        return [dict(file=f.filename,line=f.lineno,function=f.function)
                for f in inspect.stack()[2:]
                if '/tests/e2e/' in f.filename and Path(f.filename).name != Path(__file__).name]

    def flush(self):
        if not self.page:return
        try:
            data=self.page.raw.evaluate('()=>window.__smokeInputProbe?.take() || null')
            if not data:return
            self.dropped=max(self.dropped,data['dropped'])
            with (self.out/'browser-events.jsonl').open('a') as stream:
                for row in data['rows']:stream.write(json.dumps(row)+'\n')
        except Exception as error:self.emit('probe-read-error',error=str(error))

    def scope(self, kind='case', **data):
        if not self.page:return
        self.page.raw.evaluate('value=>window.__smokeInputProbe?.scope(value)',
                              dict(kind=kind,case=self.case,mainLine=self.line,**data))

    def snapshot(self, point=None):
        return self.page.raw.evaluate('point=>window.__smokeInputProbe?.snapshot(point)',point)

    def check(self, kind, line, expression, actual, expected=True, values=None, status=None):
        row=dict(number=len(self.assertions)+1,kind=kind,line=line,expression=expression,
                 actual=actual,expected=expected,passed=(actual==expected) if status is None else status,
                 values=values,case=self.case,mainLine=self.line,
                 afterRepairs=[r['id'] for r in self.repairs],
                 sameCaseRepairs=[r['id'] for r in self.repairs if r['case']==self.case])
        self.assertions.append(row);self.emit('assertion',check=row)
        return row

    def condition(self, value, expected, line, expression, values):
        # Original condition is evaluated once, returned unchanged.
        safe={key:repr(item)[:4000] for key,item in values.items()}
        self.check('python-assertion',line,expression,bool(value),expected,safe)
        return value

    def stage(self, label):
        self.flush();self.case=label;self.scope();self.emit('case')

    def selection_start(self, page, values):
        self.page=page
        attempt=dict(id=len(self.attempts)+1,case=self.case,mainLine=self.line,
                     callsite=self.callsite(),point=dict(x=values['x'],y=values['y']),
                     additive=values['additive'],assertionStart=len(self.assertions))
        self.active_selection=attempt;self.attempts.append(attempt)
        self.scope('selection',attempt=attempt['id'])
        self.emit('selection-entry',attempt=attempt,state=self.snapshot(attempt['point']))

    def selection_click(self, page, values):
        self.emit('selection-before-click',attempt=self.active_selection['id'],
                  expectedHit=values.get('hit'),beforeSelection=values.get('before_selection'),
                  state=self.snapshot(self.active_selection['point']))

    def fallback(self, page, values):
        self.pending_fallback=dict(attempt=self.active_selection['id'],case=self.case,
                                   callsite=self.callsite(),assertionBoundary=len(self.assertions))
        self.flush()
        self.emit('selection-fallback',fallback=self.pending_fallback,
                  expectedHit=values.get('hit'),beforeSelection=values.get('before_selection'),
                  exception=repr(sys.exception()) if hasattr(sys,'exception') else repr(sys.exc_info()[1]),
                  state=self.snapshot(self.active_selection['point']))

    def repaired(self, page, values):
        repair=dict(id=len(self.repairs)+1,case=self.case,mainLine=self.line,
                    attempt=self.active_selection['id'],assertionBoundary=len(self.assertions),
                    requested=values.get('merged'),callsite=self.callsite())
        self.repairs.append(repair)
        self.emit('selection-repaired',repair=repair,state=self.snapshot(self.active_selection['point']))
        self.pending_fallback=None

    def selection_end(self, page, values):
        self.flush()
        if self.active_selection:
            self.emit('selection-return',attempt=self.active_selection['id'],
                      state=self.snapshot(self.active_selection['point']))
        self.active_selection=None;self.scope()

    def coverage(self):
        summaries=[]
        for repair in self.repairs:
            after=self.assertions[repair['assertionBoundary']:]
            summaries.append(dict(repair=repair,
                downstreamAssertions=len(after),
                downstreamDistinctSites=len({(a['kind'],a['line'],a['expression']) for a in after}),
                sameFixtureAssertions=sum(a['case']==repair['case'] for a in after),
                downstreamPassed=sum(a['passed'] for a in after),
                assertionSites=[dict(kind=a['kind'],line=a['line'],mainLine=a['mainLine'],case=a['case']) for a in after]))
        return dict(definition='Dynamic invocations of wait predicates, Python asserts/explicit failure guards, and explicit clickability guards. Poll iterations are not separate assertions. Later independent checks do not restore coverage of a repaired click.',
                    totalAssertionCheckpoints=len(self.assertions),repairs=summaries)


class Instrument(ast.NodeTransformer):
    def __init__(self, source):self.source=source;self.fallback_handlers=0
    def condition(self, expression, expected, owner):
        names=sorted({n.id for n in ast.walk(expression) if isinstance(n,ast.Name) and isinstance(n.ctx,ast.Load)})
        call=ast.Call(func=ast.Attribute(value=ast.Name(id='_input_probe',ctx=ast.Load()),attr='condition',ctx=ast.Load()),
            args=[expression,ast.Constant(expected),ast.Constant(owner.lineno),ast.Constant(ast.get_source_segment(self.source,expression) or ast.unparse(expression)),
                  ast.Dict(keys=[ast.Constant(n) for n in names],values=[ast.Call(func=ast.Attribute(value=ast.Call(func=ast.Name(id='locals',ctx=ast.Load()),args=[],keywords=[]),attr='get',ctx=ast.Load()),args=[ast.Constant(n)],keywords=[]) for n in names])],keywords=[])
        return ast.copy_location(call,expression)
    def visit_Assert(self,node):
        node=self.generic_visit(node);node.test=self.condition(node.test,True,node);return node
    def visit_If(self,node):
        node=self.generic_visit(node)
        if any(isinstance(n,ast.Raise) and isinstance(n.exc,ast.Call) and isinstance(n.exc.func,ast.Name) and n.exc.func.id=='AssertionError' for n in node.body):
            node.test=self.condition(node.test,False,node)
        return node
    def observe(self,method,location):
        expression=ast.parse('_input_probe.'+method+'(page,locals())').body[0]
        return ast.copy_location(expression,location)
    def visit_FunctionDef(self,node):
        node=self.generic_visit(node)
        if node.name!='click_atom_to_select':return node
        original=ast.dump(node,include_attributes=False)
        for child in ast.walk(node):
            if isinstance(child,ast.ExceptHandler) and any(isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='merged' for t in n.targets) for n in child.body):
                child.body.insert(0,self.observe('fallback',child.body[0]))
                child.body.append(self.observe('repaired',child.body[-1]));self.fallback_handlers+=1
        # Observe immediately before the original native click, after its
        # existing Enter/Escape cleanup and existing hit/selection readbacks.
        for child in ast.walk(node):
            if isinstance(child,ast.Try) and child.body and isinstance(child.body[0],ast.Expr):
                call=child.body[0].value
                if isinstance(call,ast.Call) and isinstance(call.func,ast.Attribute) and call.func.attr=='click' and ast.unparse(call.func.value)=='page.mouse':
                    child.body.insert(0,self.observe('selection_click',child.body[0]))
        original_body=node.body
        node.body=[self.observe('selection_start',node),ast.copy_location(ast.Try(body=original_body,handlers=[],orelse=[],finalbody=[self.observe('selection_end',node)]),node)]
        # A stripped copy must have the exact original logic, including600ms.
        stripped=ast.parse(ast.unparse(node)).body[0]
        class Strip(ast.NodeTransformer):
            def visit_Expr(self,n):
                if isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Attribute) and isinstance(n.value.func.value,ast.Name) and n.value.func.value.id=='_input_probe':return None
                return self.generic_visit(n)
        stripped=Strip().visit(stripped);stripped.body=stripped.body[0].body
        assert ast.dump(stripped,include_attributes=False)==original,'Diagnostic changed the fallback logic'
        return node


class Page:
    def __init__(self, raw, probe, predicates):self.raw,self.probe,self.predicates=raw,probe,predicates
    def __getattr__(self,name):return getattr(self.raw,name)
    def evaluate(self, expression, *args, **kwargs):
        writes=isinstance(expression,str) and 'setEditSelectionIndices' in expression
        if writes:self.probe.emit('selection-api-write-before',callsite=self.probe.callsite(),requested=args,state=self.probe.snapshot())
        result=self.raw.evaluate(expression,*args,**kwargs)
        if writes:self.probe.emit('selection-api-write-after',callsite=self.probe.callsite(),state=self.probe.snapshot())
        if writes and self.probe.pending_fallback is None and re.search(r'setEditSelectionIndices\(\[0(?:,\s*1)?\]\)',expression) and any(f['function']=='select_two_fixture_atoms' for f in self.probe.callsite()):
            repair=dict(id=len(self.probe.repairs)+1,case=self.probe.case,mainLine=self.probe.line,
                        assertionBoundary=len(self.probe.assertions),kind='select_two_fixture_atoms direct fallback',
                        callsite=self.probe.callsite())
            self.probe.repairs.append(repair);self.probe.emit('other-selection-repair',repair=repair,state=self.probe.snapshot())
        return result
    def wait_for_function(self, expression, **kwargs):
        site=self.probe.callsite();line=site[0]['line'] if site else self.probe.line
        error=None
        try:return self.raw.wait_for_function(self.predicates.get(expression,expression),**kwargs)
        except Exception as exc:error=exc;raise
        finally:
            try:
                actual=self.raw.evaluate('()=>window.__smokeRegionLastWait||null') if expression in self.predicates else None
                self.probe.check('wait-predicate',line,expression,error is None,True,
                                 dict(operandReadback=actual,error=repr(error) if error else None,callsite=site))
            except Exception as read_error:self.probe.emit('probe-read-error',error=str(read_error))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root',type=Path,required=True)
    parser.add_argument('--harness-root',type=Path,required=True)
    parser.add_argument('--source-ref',required=True)
    parser.add_argument('--harness-ref',required=True)
    parser.add_argument('--case',required=True)
    parser.add_argument('--bypass-issue11',action='store_true')
    parser.add_argument('--prepare-only',action='store_true')
    parser.add_argument('--reveal-auto-hidden',action='store_true',
                        help='After preserving a launcher failure, use the existing / shortcut to continue diagnosis; never merge evidence')
    args=parser.parse_args()
    out=Path(os.environ['VIBEMOL_TEST_ARTIFACT_DIR']).resolve();out.mkdir(parents=True,exist_ok=True)
    source_file=args.harness_root.resolve()/'tests/e2e/smoke.py'
    source=source_file.read_text();original=ast.parse(source)
    checkout=Path(__file__).resolve().parents[2]
    expected_source=subprocess.check_output(['git','show',args.harness_ref+':tests/e2e/smoke.py'],cwd=checkout)
    assert source.encode()==expected_source,'Harness differs from its frozen source'
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=args.source_root,text=True).strip()==args.source_ref
    assert subprocess.check_output(['git','status','--porcelain'],cwd=args.source_root,text=True)==''
    predicates=sorted({n.args[0].value for n in ast.walk(original) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='wait_for_function' and n.args and isinstance(n.args[0],ast.Constant) and isinstance(n.args[0].value,str)})
    # Include the additional video helper when the original candidate imports it.
    video=args.harness_root/'tests/e2e/video_export_activation.py'
    if video.exists():
        for n in ast.walk(ast.parse(video.read_text())):
            if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='wait_for_function' and n.args and isinstance(n.args[0],ast.Constant) and isinstance(n.args[0].value,str):predicates.append(n.args[0].value)
    (out/'predicates.json').write_text(json.dumps(sorted(set(predicates)))+'\n')
    if args.prepare_only:return 0
    prepared=json.loads((out/'instrumented-predicates.json').read_text())
    probe=Probe(out,source_file)
    transform=Instrument(source);tree=transform.visit(ast.parse(source));ast.fix_missing_locations(tree)
    assert transform.fallback_handlers==1
    os.environ['VIBEMOL_CI_UNBOUNDED_PROBE']='0'
    sys.path.insert(0,str(args.harness_root.resolve()/'tests/e2e'))
    if video.exists():
        helper_source=video.read_text();helper_tree=Instrument(helper_source).visit(ast.parse(helper_source))
        ast.fix_missing_locations(helper_tree)
        helper_module=types.ModuleType('video_export_activation')
        helper_module.__dict__.update(__file__=str(video),__package__='',_input_probe=probe)
        exec(compile(helper_tree,str(video),'exec'),helper_module.__dict__)
        sys.modules['video_export_activation']=helper_module
    namespace=dict(__file__=str(source_file),__name__='diagnostic_frozen_smoke',__package__='',_input_probe=probe)
    exec(compile(tree,str(source_file),'exec'),namespace)
    namespace['REPO_ROOT']=args.source_root.resolve();namespace['ARTIFACT_DIR']=out
    namespace['log_step']=probe.stage
    original_build=namespace['ensure_build_popover_open'];original_clickable=namespace['wait_for_clickable']
    def build(page,**kwargs):
        probe.scope('build');probe.flush();probe.emit('build-before',callsite=probe.callsite(),state=probe.snapshot())
        try:return original_build(page,**kwargs)
        except Exception as error:
            probe.flush();state=probe.snapshot()
            failure=probe.emit('build-failure',error=str(error),callsite=probe.callsite(),state=state)
            hidden=state and any('is-auto-hidden' in (a.get('classes') or '') for a in state['buildAncestors']) and state['buildButton']['pointerEvents']=='none'
            if not (args.reveal_auto_hidden and hidden):raise
            record=dict(number=len(probe.navigation_blocks)+1,failure=failure,
                        originalAssertionPassed=False,diagnosticOnly=True,recovery='existing / shortcut')
            probe.navigation_blocks.append(record)
            namespace['write_failure_artifacts'](page,out,'launcher-block-'+str(record['number']),page_errors,console_errors)
            page.keyboard.press('/')
            original_build(page,**kwargs)
            probe.emit('diagnostic-navigation-recovery',record=record,state=probe.snapshot())
        finally:probe.flush();probe.emit('build-after',state=probe.snapshot());probe.scope()
    namespace['ensure_build_popover_open']=build
    def clickable(page,selector,timeout=30000):
        error=None
        try:return original_clickable(page,selector,timeout=timeout)
        except Exception as exc:error=exc;raise
        finally:
            site=probe.callsite();probe.check('clickability-guard',site[0]['line'] if site else probe.line,
                selector,error is None,True,dict(originalTimeout=timeout,error=str(error) if error else None))
    namespace['wait_for_clickable']=clickable
    bypasses=[]
    if args.bypass_issue11:
        def bypass(page,prefix):
            before=probe.snapshot();mode=page.locator('#'+prefix+'VideoCropOverlay').get_attribute('data-state')
            if mode=='selecting':page.locator('#'+prefix+'VideoCropCancelBtn').click()
            bypasses.append(probe.emit('authorized-issue11-bypass',prefix=prefix,before=before,after=probe.snapshot(),notPassingEvidence=True))
        namespace['wait_for_video_idle']=bypass
    fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main')
    owner=next(n for n in fn.body if isinstance(n,ast.With))
    body=next(n for n in owner.body if isinstance(n,ast.Try)).body
    stop_index=next(i for i,n in enumerate(body) if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Attribute) and ast.unparse(n.value.func)=='browser.close')
    selected=body[:stop_index]
    page_errors=[];console_errors=[];executed=[];blocked=[];skip_case=False
    from playwright.sync_api import sync_playwright
    import importlib.metadata
    started=time.monotonic()
    with namespace['run_http_server'](args.source_root.resolve()) as url,sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True)
        raw=browser.new_page(viewport=dict(width=1440,height=1000))
        raw.add_init_script(path=str(HERE/'smoke_input_probe.js'))
        page=Page(raw,probe,prepared);probe.page=page
        raw.on('pageerror',lambda e:page_errors.append(str(e)))
        raw.on('console',lambda m:console_errors.append(m.text) if m.type=='error' else None)
        namespace.update(page=page,page_errors=page_errors,console_errors=console_errors,base_url=url,browser=browser)
        try:
            for n in selected:
                probe.line=n.lineno
                stage=isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Name) and n.value.func.id=='log_step'
                if stage:skip_case=False
                if skip_case:
                    blocked.append(dict(line=n.lineno,endLine=n.end_lineno,case=probe.case,reason='Prerequisite failed earlier in this section; not a passing assertion'))
                    continue
                try:
                    exec(compile(ast.Module(body=[n],type_ignores=[]),str(source_file),'exec'),namespace)
                    executed.append(n.lineno)
                except Exception as error:
                    probe.flush()
                    row=probe.emit('failure',errorType=type(error).__name__,error=str(error),
                        source=ast.get_source_segment(source,n),traceback=traceback.format_exc(),state=probe.snapshot())
                    probe.failures.append(row)
                    namespace['write_failure_artifacts'](page,out,'failure-'+str(len(probe.failures))+'-line-'+str(n.lineno),page_errors,console_errors)
                    # Never repair#47. Continue only at the next original
                    # section, preserving the blocked dependency inventory.
                    skip_case=True
                    if n.lineno<next(x.lineno for x in ast.walk(original) if isinstance(x,ast.Call) and isinstance(x.func,ast.Name) and x.func.id=='wait_for_video_idle'):break
            probe.flush()
            result=dict(case=args.case,diagnosticOnly=True,notMergeEvidence=True,
                sourceRef=args.source_ref,harnessRef=args.harness_ref,
                sourceTree=subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=args.source_root,text=True).strip(),
                sourceCleanAfter=subprocess.check_output(['git','status','--porcelain'],cwd=args.source_root,text=True)=='',
                diagnosticRef=subprocess.check_output(['git','rev-parse','HEAD'],cwd=checkout,text=True).strip(),
                ciRunUrl=('https://github.com/'+os.environ['GITHUB_REPOSITORY']+'/actions/runs/'+os.environ['GITHUB_RUN_ID']) if os.environ.get('GITHUB_ACTIONS')=='true' else None,
                ciRunAttempt=os.environ.get('GITHUB_RUN_ATTEMPT'),
                sourceRoot=str(args.source_root.resolve()),harnessRoot=str(args.harness_root.resolve()),
                appSha256=hashlib.sha256((args.source_root/'assets/app/js/app.js').read_bytes()).hexdigest(),
                exporterSha256=hashlib.sha256((args.source_root/'assets/app/js/trajectory-video.js').read_bytes()).hexdigest(),
                smokeSha256=hashlib.sha256(source.encode()).hexdigest(),
                collectorSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                observerSha256=hashlib.sha256((HERE/'smoke_input_probe.js').read_bytes()).hexdigest(),
                fallbackLogicUnchanged=True,existingSelectionWaitMs=600,existingClickabilityWaitMs=30000,
                newAssertionDeadlines=[],playwrightVersion=importlib.metadata.version('playwright'),browserVersion=browser.version,
                elapsedSeconds=time.monotonic()-started,executedStatements=executed,blocked=blocked,
                lastAttemptedLine=probe.line,
                unattemptedStatements=[n.lineno for n in selected if n.lineno not in set(executed+[b['line'] for b in blocked]+[f['mainLine'] for f in probe.failures])],
                diagnosticNavigationBlocks=probe.navigation_blocks,
                revealAutoHiddenEnabled=args.reveal_auto_hidden,
                failures=probe.failures,selectionAttempts=probe.attempts,repairs=probe.repairs,
                assertions=probe.assertions,coverage=probe.coverage(),bypasses=bypasses,
                pageErrors=page_errors,consoleErrors=console_errors,droppedBrowserEvents=probe.dropped)
            (out/'result.json').write_text(json.dumps(result,indent=2,default=str)+'\n')
            probe.emit('complete',failures=len(probe.failures),repairs=len(probe.repairs),assertions=len(probe.assertions),blocked=len(blocked))
        finally:browser.close()
    return 0


if __name__=='__main__':raise SystemExit(main())
