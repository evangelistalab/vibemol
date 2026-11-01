"""Observational profiling of unchanged browser suites; never gate acceptance.

An operation is one synchronous Playwright API call, not an assertion, locator
construction, JavaScript instruction, animation frame or wait-predicate poll.
Host API wall time includes browser work, waiting and scheduling. V8 samples omit
much native/SwiftShader/compositor work and cannot identify descheduling causes.
Profiler overhead is not subtracted or asserted to be zero.
"""
from __future__ import annotations
import argparse
from collections import defaultdict
from contextlib import contextmanager
import functools
import hashlib
from importlib.metadata import version
import inspect
import json
import math
import os
from pathlib import Path
import platform
import runpy
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
BASE = 'c37bb07e30c711025da325a14bbbb4a8345d06d7'


def distribution(values):
    values = sorted(values)
    return dict(count=len(values), totalSeconds=sum(values),
                meanSeconds=sum(values)/len(values),
                medianSeconds=values[len(values)//2] if len(values)%2 else sum(values[len(values)//2-1:len(values)//2+1])/2,
                p95Seconds=values[math.ceil(.95*len(values))-1], maximumSeconds=values[-1]) if values else dict(count=0)


def category(method, expression=''):
    verb = method.split('.')[-1]
    if verb in ('goto', 'reload', 'go_back', 'go_forward'): return 'navigation'
    if verb in ('evaluate', 'evaluate_handle'):
        if 'VibeMolEmbed.loadFiles' in expression: return 'fixture-import'
        if 'VibeMolSession.import' in expression: return 'session-import'
        if 'VibeMolSession.export' in expression: return 'session-export'
        return 'javascript-evaluation'
    if verb.startswith('wait_for') or verb == 'expect_response': return 'explicit-wait'
    if verb in ('set_input_files', 'set_files'): return 'file-input'
    if method.startswith(('Mouse.', 'Keyboard.')) or verb in ('click', 'dblclick', 'fill', 'press', 'select_option', 'check', 'uncheck', 'hover', 'drag_to'): return 'input'
    if verb in ('launch', 'close', 'new_context', 'new_page'): return 'lifecycle'
    return 'read-or-other'


def operation_summary(rows, key):
    groups = defaultdict(list)
    for row in rows: groups[row[key]].append(row)
    return sorted([dict(name=name, **distribution([r['exclusiveSeconds'] for r in group]),
                        inclusiveSeconds=sum(r['seconds'] for r in group),
                        errors=sum(r['error'] is not None for r in group))
                   for name, group in groups.items()], key=lambda r:-r['totalSeconds'])


def sample_summary(profile):
    nodes = {n['id']: n for n in profile['nodes']}
    parents = {child: n['id'] for n in profile['nodes'] for child in n.get('children', [])}
    own, inclusive = defaultdict(float), defaultdict(float)
    samples, deltas = profile.get('samples', []), profile.get('timeDeltas', [])
    if len(samples) != len(deltas): raise ValueError('CPU sample/delta inventory differs')
    for sample, delta in zip(samples, deltas):
        own[sample] += delta/1e6
        seen = set()
        while sample is not None and sample not in seen:
            seen.add(sample); inclusive[sample] += delta/1e6; sample = parents.get(sample)
    rows = [dict(function=n['callFrame']['functionName'] or '(anonymous)',
                 url=n['callFrame']['url'], line=n['callFrame']['lineNumber']+1,
                 sampledSelfSeconds=own[n['id']], sampledInclusiveSeconds=inclusive[n['id']])
            for n in nodes.values()]
    return dict(samples=len(samples), sampledSeconds=sum(deltas)/1e6,
                functions=sorted(rows, key=lambda r:-r['sampledSelfSeconds']))


class BrowserProfiler:
    def __init__(self, output, interval=5000):
        self.output, self.interval = Path(output), interval
        self.output.mkdir(parents=True, exist_ok=False)
        self.harness_sha = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        self.events = (self.output/'operation-events.jsonl').open('w', buffering=1)
        self.started = time.perf_counter()
        self.rows, self.scenarios, self.pages, self.browsers = [], [], {}, []
        self.stack, self.case, self.suppressed = [], '(setup)', 0
        self.errors, self.undo = [], []
        self.observer_seconds = 0.0

    @contextmanager
    def observer(self):
        start = time.perf_counter(); self.suppressed += 1
        try: yield
        finally:
            self.suppressed -= 1
            self.observer_seconds += time.perf_counter()-start

    def patch(self, owner, name, replacement):
        original = getattr(owner, name); setattr(owner, name, replacement)
        self.undo.append(lambda: setattr(owner, name, original))
        return original

    def install(self):
        if version('playwright') != '1.64.1': raise RuntimeError('Profiler requires ordinary CI lockfile Playwright1.64.1; no fallback')
        from playwright._impl._sync_base import SyncBase
        from playwright.sync_api import Browser, BrowserContext, Page, BrowserType
        original_sync = SyncBase._sync
        self.sync_source_sha = hashlib.sha256(inspect.getsource(original_sync).encode()).hexdigest()
        profiler = self

        def measured(obj, coro):
            if profiler.suppressed: return original_sync(obj, coro)
            code = getattr(coro, 'cr_code', getattr(coro, 'gi_code', None))
            frame = getattr(coro, 'cr_frame', getattr(coro, 'gi_frame', None))
            name = type(obj).__name__+'.'+(code.co_name if code else '(unknown)')
            expression = frame.f_locals.get('expression', '') if frame else ''
            expression = expression if isinstance(expression, str) else ''
            caller = sys._getframe(1); site = None
            while caller:
                if str(ROOT/'tests') in caller.f_code.co_filename:
                    site = dict(file=str(Path(caller.f_code.co_filename).relative_to(ROOT)), line=caller.f_lineno, function=caller.f_code.co_name); break
                caller = caller.f_back
            row = dict(id=len(profiler.rows)+len(profiler.stack)+1, method=name,
                       category=category(name, expression), scenario=profiler.case, site=site,
                       startedSeconds=time.perf_counter()-profiler.started, error=None)
            profiler.events.write(json.dumps(dict(phase='start', **row))+'\n')
            state = dict(children=0.0); profiler.stack.append(state)
            start = time.perf_counter()
            try: return original_sync(obj, coro)
            except BaseException as error:
                row['error'] = type(error).__name__; raise
            finally:
                duration = time.perf_counter()-start
                profiler.stack.pop()
                if profiler.stack: profiler.stack[-1]['children'] += duration
                row.update(seconds=duration, exclusiveSeconds=max(0.0, duration-state['children']))
                profiler.rows.append(row)
                profiler.events.write(json.dumps(dict(phase='end', **row))+'\n')
                if len(profiler.rows) % 100 == 0:
                    print('[browser-profile-progress] '+json.dumps(dict(calls=len(profiler.rows),scenario=profiler.case,lastMethod=name,elapsedSeconds=time.perf_counter()-profiler.started)),flush=True)
                if code is None: profiler.errors.append('Unknown Playwright coroutine: '+name)

        self.patch(SyncBase, '_sync', measured)
        for owner in (BrowserContext, Browser):
            original = owner.new_page
            def creation(original):
                @functools.wraps(original)
                def new_page(obj, *args, **kwargs):
                    page = original(obj, *args, **kwargs); profiler.arm_page(page); return page
                return new_page
            self.patch(owner, 'new_page', creation(original))
        for owner in (Page, BrowserContext, Browser):
            original = owner.close
            def closure(original, owner):
                @functools.wraps(original)
                def close(obj, *args, **kwargs):
                    if owner is Page: profiler.finish_page(obj)
                    elif owner is BrowserContext:
                        for page in list(obj.pages): profiler.finish_page(page)
                    else:
                        for context in list(obj.contexts):
                            for page in list(context.pages): profiler.finish_page(page)
                    return original(obj, *args, **kwargs)
                return close
            self.patch(owner, 'close', closure(original, owner))
        original_launch = BrowserType.launch
        def launch(obj, *args, **kwargs):
            browser = original_launch(obj, *args, **kwargs); profiler.browsers.append(browser); return browser
        self.patch(BrowserType, 'launch', launch)

    def arm_page(self, page):
        if page in self.pages: return
        row = dict(id=len(self.pages)+1, scenario=self.case, closed=False)
        self.pages[page] = row
        with self.observer():
            session = page.context.new_cdp_session(page)
            session.send('Profiler.enable'); session.send('Profiler.setSamplingInterval', {'interval': self.interval})
            session.send('Performance.enable'); row['metricsBefore'] = session.send('Performance.getMetrics')
            session.send('Profiler.start')
        row.update(session=session, startedSeconds=time.perf_counter()-self.started)

    def finish_page(self, page):
        row = self.pages.get(page)
        if not row or row['closed']: return
        row['closed'] = True
        session = row.pop('session', None)
        if session is None:
            row['unavailable'] = 'Page profiling did not arm completely'
            self.errors.append(row['unavailable']); return
        try:
            with self.observer():
                profile = session.send('Profiler.stop')['profile']
                row['metricsAfter'] = session.send('Performance.getMetrics')
                session.send('Performance.disable'); session.send('Profiler.disable')
            path = self.output/f"page-{row['id']:03d}.cpuprofile"
            path.write_text(json.dumps(profile, separators=(',', ':')))
            row.update(profile=path.name, cpu=sample_summary(profile))
        except Exception as error:
            row['unavailable'] = str(error); self.errors.append(f"Page{row['id']} profile: {error}")
        finally:
            row['endedSeconds'] = time.perf_counter()-self.started
            try:
                with self.observer(): session.detach()
            except Exception as error: row['detachError'] = str(error)

    def scenario(self, function):
        @functools.wraps(function)
        def measured(*args, **kwargs):
            prior = self.case; self.case = function.__name__
            for page, row in self.pages.items():
                if not row['closed'] and row['scenario'] == '(setup)': row['scenario'] = self.case
            row = dict(name=self.case, sourceFile=str(Path(inspect.getsourcefile(function)).relative_to(ROOT)),
                       sourceSha256=hashlib.sha256(inspect.getsource(function).encode()).hexdigest(),
                       startedSeconds=time.perf_counter()-self.started, status='passed')
            start = time.perf_counter()
            try: return function(*args, **kwargs)
            except BaseException:
                row['status'] = 'failed'; raise
            finally:
                row['seconds'] = time.perf_counter()-start; self.scenarios.append(row); self.case = prior
        return measured

    def run(self, suite):
        # Run the original entry point. Only replace observational timing wrappers.
        sys.path.insert(0, str(ROOT/'tests/e2e'))
        import helpers
        original = helpers.run_appearance_scenarios
        def appearance(root, artifacts, scenarios):
            return original(root, artifacts, [self.scenario(f) for f in scenarios])
        self.patch(helpers, 'run_appearance_scenarios', appearance)
        target = ROOT/'tests/e2e'/f'{suite}.py'
        if suite == 'looks':
            def bootstrap(frame, event, arg):
                if event == 'call' and frame.f_code.co_filename == str(target) and frame.f_code.co_name == 'main':
                    sys.setprofile(None)
                    for name, value in list(frame.f_globals.items()):
                        if inspect.isfunction(value) and list(inspect.signature(value).parameters) == ['page', 'context', 'url']:
                            frame.f_globals[name] = self.scenario(value)
            sys.setprofile(bootstrap)
        try: runpy.run_path(str(target), run_name='__main__')
        finally: sys.setprofile(None)

    def finish(self, suite, failure=None):
        for page in self.pages: self.finish_page(page)
        for undo in reversed(self.undo): undo()
        wall = time.perf_counter()-self.started
        api = sum(r['exclusiveSeconds'] for r in self.rows)
        expected_scenarios = {'looks': 20, 'look_references': 7, 'self-test': 0}.get(suite)
        if failure is None and expected_scenarios is not None and len(self.scenarios) != expected_scenarios:
            self.errors.append(f'Scenario census: {len(self.scenarios)} observed, {expected_scenarios} required')
        for scope in self.scenarios:
            rows = [r for r in self.rows if r['scenario'] == scope['name']]
            scope.update(apiOperations=len(rows), apiExclusiveSeconds=sum(r['exclusiveSeconds'] for r in rows))
        with (self.output/'operations.jsonl').open('w') as stream:
            for row in sorted(self.rows, key=lambda r:r['startedSeconds']): stream.write(json.dumps(row)+'\n')
        pages = [row for row in self.pages.values()]
        report = dict(suite=suite, suiteFailure=failure, ordinaryAcceptance=False,
            suiteWallSeconds=wall, apiOperations=len(self.rows), apiExclusiveSeconds=api,
            expectedScenarios=expected_scenarios,
            meanApiCallSeconds=api/len(self.rows) if self.rows else None,
            amortizedSuiteSecondsPerApiCall=wall/len(self.rows) if self.rows else None,
            outsideMeasuredApiSeconds=wall-api, observerCommandSeconds=self.observer_seconds,
            categories=operation_summary(self.rows, 'category'), methods=operation_summary(self.rows, 'method'),
            scenarios=sorted(self.scenarios, key=lambda r:-r['seconds']), pages=pages,
            profileErrors=self.errors, allPagesFinalized=all(p['closed'] for p in pages),
            residualContexts=sum(len(b.contexts) for b in self.browsers),
            environment=dict(playwright=version('playwright'), python=sys.version, os=platform.platform(),
                machine=platform.machine(), cpuCount=os.cpu_count(), browserVersions=sorted({b.version for b in self.browsers})),
            samplingIntervalMicroseconds=self.interval, syncImplementationSha256=self.sync_source_sha,
            sourceCommit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
            baseCommit=BASE, ciRunId=os.environ.get('GITHUB_RUN_ID'), ciAttempt=os.environ.get('GITHUB_RUN_ATTEMPT'),
            profileHarnessSha256=self.harness_sha,
            sourceSuiteSha256=hashlib.sha256((ROOT/'tests/e2e'/f'{suite}.py').read_bytes()).hexdigest() if suite in ('looks','look_references') else None,
            definitions=__doc__)
        (self.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
        self.events.close()
        print('[browser-profile] '+json.dumps({k:report[k] for k in ('suite','suiteWallSeconds','apiOperations','meanApiCallSeconds','suiteFailure','profileErrors','residualContexts')}), flush=True)
        return report


def self_test(profiler):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        try:
            context = browser.new_context(); page = context.new_page()
            page.goto('data:text/html,<button onclick="this.textContent=\'done\'">go</button>')
            page.locator('button').click(); assert page.locator('button').inner_text() == 'done'
            page.evaluate('()=>{function profileProbe(){let n=0;for(let i=0;i<10000000;i++)n+=Math.sqrt(i);return n;}return profileProbe();}')
            page.wait_for_function('()=>document.querySelector("button").textContent==="done"')
            context.close(); assert len(browser.contexts) == 0
        finally: browser.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--suite', choices=('looks','look_references','self-test'), required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    profiler = BrowserProfiler(args.out); profiler.install()
    failure = None
    try:
        if args.suite == 'self-test': self_test(profiler)
        else: profiler.run(args.suite)
    except BaseException as error:
        failure = type(error).__name__+': '+str(error); raise
    finally:
        report = profiler.finish(args.suite, failure)
    if report['profileErrors'] or report['residualContexts']: raise SystemExit('Profiling incomplete; inspect report.json')


if __name__ == '__main__': main()
