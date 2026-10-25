"""Arrival-only mode for the standing Smoke diagnostic; never a merge gate."""
from __future__ import annotations
import ast
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import traceback

CASE = 'grow-add can be followed immediately by atom selection'
HERE = Path(__file__).resolve().parent


class ArrivalProbe:
    def __init__(self):
        self.case = 'setup'
        self.active = False
        self.armed = False
        self.receipt = None
        self.host = {}
        self.waits = []
        self.errors = []

    def start(self, page, values):
        self.active = self.case == CASE
        if self.active:
            self.host['functionStart'] = time.monotonic()

    def before_click(self, page, values):
        if not self.active:
            return
        assert not self.armed, 'No automatic repeated activation'
        assert values['expected'] == [0], values['expected']
        self.host['armSend'] = time.monotonic()
        self.arm = page.raw.evaluate(
            '(payload)=>__selectionArrival.arm(payload.expected,payload.point)',
            dict(expected=values['expected'],point=dict(x=values['x'],y=values['y'])))
        self.host['armReturn'] = time.monotonic()
        self.armed = True
        self.host['clickStart'] = time.monotonic()

    def after_click(self, page, values):
        if self.active:
            self.host['clickReturn'] = time.monotonic()

    def finish(self, page, values):
        if not self.active:
            return
        self.host['functionFinally'] = time.monotonic()
        if self.armed:
            try:
                # Existing default30s is a collection ceiling, not an assertion
                # budget. A late receipt never changes the original600ms result.
                self.receipt = page.raw.evaluate('()=>__selectionArrival.finish(30000)')
            except Exception as error:
                self.errors.append(repr(error))
        self.active = False


class ArrivalPage:
    def __init__(self, raw, probe):
        self.raw, self.probe = raw, probe

    def __getattr__(self, name):
        return getattr(self.raw, name)

    def wait_for_function(self, expression, **kwargs):
        target = self.probe.active and self.probe.armed and kwargs.get('timeout') == 600
        if not target:
            return self.raw.wait_for_function(expression, **kwargs)
        assert 'JSON.stringify(payload.expected)' in expression
        original_options = dict(kwargs)
        wrapped = '(payload)=>__selectionArrival.poll((' + expression + ')(payload))'
        start = time.monotonic()
        error = None
        try:
            return self.raw.wait_for_function(wrapped, **kwargs)
        except Exception as exc:
            error = exc
            raise
        finally:
            end = time.monotonic()
            assert kwargs == original_options
            self.probe.waits.append(dict(hostStart=start,hostEnd=end,elapsedMs=(end-start)*1000,
                                         timeoutMs=600,passed=error is None,error=repr(error) if error else None))


class ArrivalInstrument(ast.NodeTransformer):
    def observation(self, method, node):
        return ast.copy_location(ast.parse('_arrival.'+method+'(page,locals())').body[0],node)

    def visit_FunctionDef(self, node):
        if node.name != 'click_atom_to_select':
            return node
        original = ast.dump(node, include_attributes=False)
        clicks = 0
        for child in ast.walk(node):
            if not isinstance(child, ast.Try) or not child.body:
                continue
            first = child.body[0]
            if isinstance(first,ast.Expr) and isinstance(first.value,ast.Call) and ast.unparse(first.value.func)=='page.mouse.click':
                child.body.insert(0,self.observation('before_click',first))
                child.body.append(self.observation('after_click',first))
                clicks += 1
        assert clicks == 1
        node.body = [self.observation('start',node),ast.copy_location(ast.Try(
            body=node.body,handlers=[],orelse=[],finalbody=[self.observation('finish',node)]),node)]
        stripped = ast.parse(ast.unparse(node)).body[0]
        class Strip(ast.NodeTransformer):
            def visit_Expr(self, item):
                if isinstance(item.value,ast.Call) and isinstance(item.value.func,ast.Attribute) and isinstance(item.value.func.value,ast.Name) and item.value.func.value.id=='_arrival':
                    return None
                return self.generic_visit(item)
        stripped = Strip().visit(stripped)
        stripped.body = stripped.body[0].body
        assert ast.dump(stripped,include_attributes=False)==original, 'Measurement changed the original selection logic'
        return node


def run(args, out, source, checkout):
    from playwright.sync_api import sync_playwright
    original = ast.parse(source)
    transformed = ArrivalInstrument().visit(ast.parse(source))
    ast.fix_missing_locations(transformed)
    probe = ArrivalProbe()
    sys.path.insert(0,str(args.harness_root.resolve()/'tests/e2e'))
    namespace = dict(__file__=str(args.harness_root.resolve()/'tests/e2e/smoke.py'),
                     __name__='arrival_frozen_smoke',__package__='',_arrival=probe)
    exec(compile(transformed,namespace['__file__'],'exec'),namespace)
    namespace['REPO_ROOT'] = args.source_root.resolve()
    namespace['ARTIFACT_DIR'] = out
    original_step = namespace['log_step']
    def stage(label):
        probe.case = label
        original_step(label)
    namespace['log_step'] = stage
    fn = next(n for n in transformed.body if isinstance(n,ast.FunctionDef) and n.name=='main')
    body = next(n for n in next(n for n in fn.body if isinstance(n,ast.With)).body if isinstance(n,ast.Try)).body
    close = next(i for i,n in enumerate(body) if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and ast.unparse(n.value.func)=='browser.close')
    body = body[:close]
    assert next(n for n in ast.walk(original) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='wait_for_function' and any(k.arg=='timeout' and isinstance(k.value,ast.Constant) and k.value.value==600 for k in n.keywords))
    failures, page_errors, console_errors, executed = [], [], [], []
    started = time.monotonic()
    with namespace['run_http_server'](args.source_root.resolve()) as url, sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        raw = browser.new_page(viewport=dict(width=1440,height=1000))
        raw.add_init_script(path=str(HERE/'selection_arrival_probe.js'))
        raw.on('pageerror',lambda error:page_errors.append(str(error)))
        raw.on('console',lambda message:console_errors.append(message.text) if message.type=='error' else None)
        page = ArrivalPage(raw,probe)
        namespace.update(page=page,browser=browser,base_url=url,page_errors=page_errors,console_errors=console_errors)
        try:
            for node in body:
                is_stage = isinstance(node,ast.Expr) and isinstance(node.value,ast.Call) and isinstance(node.value.func,ast.Name) and node.value.func.id=='log_step'
                if is_stage and probe.case == CASE:
                    break  # Entire original target section, no altered seed.
                try:
                    exec(compile(ast.Module(body=[node],type_ignores=[]),namespace['__file__'],'exec'),namespace)
                    executed.append(node.lineno)
                except Exception as error:
                    failures.append(dict(line=node.lineno,case=probe.case,type=type(error).__name__,error=repr(error),traceback=traceback.format_exc()))
                    namespace['write_failure_artifacts'](page,out,'original-failed-assertion',page_errors,console_errors)
                    break
            result = dict(diagnosticOnly=True,notMergeEvidence=True,case=args.case,target=CASE,
                sourceRef=args.source_ref,harnessRef=args.harness_ref,
                diagnosticRef=subprocess.check_output(['git','rev-parse','HEAD'],cwd=checkout,text=True).strip(),
                sourceTree=subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=args.source_root,text=True).strip(),
                sourceCleanAfter=subprocess.check_output(['git','status','--porcelain'],cwd=args.source_root,text=True)=='',
                sourceHashes={path:hashlib.sha256((args.source_root/path).read_bytes()).hexdigest() for path in ['assets/app/js/app.js','assets/app/js/edit-tools.js','assets/app/js/trajectory-video.js']},
                harnessSha256=hashlib.sha256(source.encode()).hexdigest(),probeSha256=hashlib.sha256((HERE/'selection_arrival_probe.js').read_bytes()).hexdigest(),
                originalSelectionWaitMs=600,originalSelectionLogicUnchanged=True,extraObservationCeilingMs=30000,
                observationCeilingIsNotAssertionBudget=True,hostTimeline=probe.host,originalWaits=probe.waits,
                receipt=probe.receipt,measurementErrors=probe.errors,originalFailures=failures,
                executedStatements=executed,originalTargetSectionCompleted=probe.case==CASE and not failures,
                pageErrors=page_errors,consoleErrors=console_errors,elapsedSeconds=time.monotonic()-started,
                runtime=dict(playwright=importlib.metadata.version('playwright'),pyee=importlib.metadata.version('pyee'),greenlet=importlib.metadata.version('greenlet'),typingExtensions=importlib.metadata.version('typing-extensions'),python=sys.version,chromium=browser.version),
                lockSha256=hashlib.sha256((checkout/'api/requirements-ci.lock').read_bytes()).hexdigest(),
                ciRunUrl='https://github.com/'+os.environ['GITHUB_REPOSITORY']+'/actions/runs/'+os.environ['GITHUB_RUN_ID'] if os.environ.get('GITHUB_ACTIONS')=='true' else None,
                ciAttempt=os.environ.get('GITHUB_RUN_ATTEMPT'),runnerImage=os.environ.get('ImageVersion'))
            (out/'arrival.json').write_text(json.dumps(result,indent=2)+'\n')
            print('[selection-arrival] '+json.dumps(result,default=str),flush=True)
        finally:
            browser.close()
    # A preserved600ms assertion failure does not invalidate its measured arrival.
    # Missing receipts/errors DO invalidate collection and cannot count as samples.
    receipt = result['receipt']
    return 0 if receipt and receipt['current']['arrival'] and not result['measurementErrors'] and not receipt['errors'] and receipt['dropped']==0 else 1
