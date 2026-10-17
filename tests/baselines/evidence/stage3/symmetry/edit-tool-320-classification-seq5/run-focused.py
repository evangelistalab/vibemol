"""Run the unchanged edit_tool.run through its 320px iteration only.

The page proxy observes the original overflow expression after it has evaluated.
It neither changes the expression/result nor adds a wait before the assertion.
If the 320px assertions pass, stop before the suite begins its 390px iteration.
This produces a focused result, never a claim that the full suite passed.
"""
import argparse
import hashlib
import importlib.metadata
import json
import pathlib
import platform
import sys
import time
import traceback

parser = argparse.ArgumentParser()
parser.add_argument('--source-root', type=pathlib.Path, required=True)
parser.add_argument('--artifacts', type=pathlib.Path, required=True)
args = parser.parse_args()
repo = pathlib.Path(__file__).resolve().parents[5]
sys.path.insert(0, str(repo / 'tests/e2e'))
import edit_tool as suite

args.artifacts.mkdir(parents=True, exist_ok=False)
suite.p.ROOT = args.source_root.resolve()
suite.p.ARTIFACTS = args.artifacts.resolve()
test = repo / 'tests/e2e/edit_tool.py'
source = args.source_root / 'assets/app/js/app.js'
started = time.monotonic()
report = {
    'suite': 'tests/e2e/edit_tool.py',
    'testSha256': hashlib.sha256(test.read_bytes()).hexdigest(),
    'sourceRoot': str(args.source_root),
    'appSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'focus': 'Unchanged run() setup through viewport 320x1000; focus Transform button, ArrowRight selects Build; original overflow assertion and subsequent hit-test.',
    'launch': 'Workbench', 'query': '?appearanceStudy=1',
    'initialViewport': {'width': 1440, 'height': 1000},
    'targetViewport': {'width': 320, 'height': 1000},
    'browserName': 'chromium', 'os': platform.system(),
    'architecture': platform.machine(),
    'playwrightVersion': importlib.metadata.version('playwright'),
    'assertionsChanged': False, 'waitsChanged': False,
    'ciRetry': False, 'claimsFullSuitePass': False,
    'overflowObservation': None,
}


class FocusedTargetComplete(Exception):
    pass


class ToolsLocator:
    def __init__(self, locator, page):
        self.locator = locator
        self.page = page

    def evaluate(self, expression, *positional, **options):
        assert expression == 'el=>el.scrollWidth<=el.clientWidth+1'
        # First execute precisely the shipped expression at its original point.
        value = self.locator.evaluate(expression, *positional, **options)
        observation = self.page.evaluate('''() => {
          const tools=document.querySelector('.wb-tools');
          const button=document.getElementById('workbenchOverflowBtn');
          const menu=document.getElementById('workbenchOverflowMenu');
          const visible=el=>!!el && !el.hidden && getComputedStyle(el).display!=='none' && !!el.getClientRects().length;
          const rect=tools.getBoundingClientRect();
          return {viewport:{width:innerWidth,height:innerHeight},launch:window.VibeMolWorkbench?'Workbench':'other',
            theme:document.documentElement.getAttribute('data-theme'),
            scrollWidth:tools.scrollWidth,clientWidth:tools.clientWidth,
            toolsRect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
            overflowButtonPresent:!!button,overflowButtonVisible:visible(button),
            overflowButtonHidden:button?.hidden,overflowExpanded:button?.getAttribute('aria-expanded'),
            overflowMenuPresent:!!menu,overflowMenuVisible:visible(menu),overflowMenuHidden:menu?.hidden,
            overflowMenuRows:menu?.children.length,
            barClasses:document.getElementById('workbenchBar')?.className,
            overflowedGroups:[...document.querySelectorAll('.wb-overflowed')].map(el=>({id:el.id,classes:el.className})),
            focusedId:document.activeElement?.id,
            buildChecked:document.getElementById('editAdaptiveAddAtomBtn')?.getAttribute('aria-checked'),
            transformChecked:document.getElementById('editTransformToolBtn')?.getAttribute('aria-checked')};
        }''')
        observation['originalOverflowAssertionValue'] = value
        observation['observationTiming'] = 'Read-only snapshot immediately after the original overflow expression evaluated; the original boolean is preserved.'
        report['overflowObservation'] = observation
        (args.artifacts / 'overflow-observation.json').write_text(json.dumps(observation, indent=2) + '\n')
        return value

    def __getattr__(self, name):
        return getattr(self.locator, name)


class FocusedPage:
    def __init__(self, page):
        self.page = page

    def set_viewport_size(self, viewport):
        if viewport['width'] != 320:
            assert viewport['width'] == 390 and report['overflowObservation']['originalOverflowAssertionValue'] is True
            raise FocusedTargetComplete()
        return self.page.set_viewport_size(viewport)

    def locator(self, selector, *positional, **options):
        locator = self.page.locator(selector, *positional, **options)
        return ToolsLocator(locator, self.page) if selector == '.wb-tools' else locator

    def __getattr__(self, name):
        return getattr(self.page, name)


exit_code = 0
with suite.p.run_http_server(suite.p.ROOT) as url, suite.p.sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--use-angle=swiftshader'])
    report['browserVersion'] = browser.version
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.dismiss())
    try:
        suite.run(FocusedPage(page), url)
        raise AssertionError('Focused execution should stop before width390')
    except FocusedTargetComplete:
        report['status'] = 'target-passed'
        report['stopReason'] = 'Both unchanged width320 assertions and ArrowLeft completed; stopped before width390, no visual_schemes run.'
    except BaseException as error:
        report['status'] = 'target-failed' if report['overflowObservation'] and report['overflowObservation']['originalOverflowAssertionValue'] is False else 'other-failure'
        report['exception'] = type(error).__name__
        report['message'] = str(error)
        report['traceback'] = traceback.format_exc()
        traceback.print_exc()
        suite.p.write_failure_artifacts(page, args.artifacts, 'edit-tool-failure', errors, [])
        exit_code = 1
    finally:
        report['pageErrors'] = errors
        report['renderer'] = page.evaluate('''() => {
          const gl=document.createElement('canvas').getContext('webgl2');
          if(!gl)return null;const ext=gl.getExtension('WEBGL_debug_renderer_info');
          return {renderer:gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION),
            unmaskedRenderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};
        }''')
        page.screenshot(path=str(args.artifacts / 'target-state.png'))
        (args.artifacts / 'target-state.html').write_text(page.content())
        browser.close()
assert report['appSha256'] == hashlib.sha256(source.read_bytes()).hexdigest()
assert report['testSha256'] == hashlib.sha256(test.read_bytes()).hexdigest()
report['seconds'] = round(time.monotonic() - started, 2)
report['exitCode'] = exit_code
(args.artifacts / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: report[k] for k in ['status', 'exitCode', 'seconds', 'browserVersion', 'overflowObservation']}), flush=True)
raise SystemExit(exit_code)
