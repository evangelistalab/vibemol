#!/usr/bin/env python3
"""Diagnostic only: observe the unchanged edit_tool suite on an immutable tree.

The conditional DevTools breakpoint timestamps fitTools entry and always returns
false (no debugger pause). The shipped overflow expression runs first, then its
numeric readback is collected in the SAME JavaScript task. Its original boolean
is returned to the unchanged Python assertion. No source, waits or goldens are
rewritten. Debugger instrumentation can affect timing; both trees use one probe.
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


EXPRESSION = 'el=>el.scrollWidth<=el.clientWidth+1'
SOURCES = {
    'integration': {
        'commit': 'e35da9ca4721ad0645f9b0744aa38bfd9ca4b18d',
        'tree': '6ceaa9597ba745d93b1e0632f7e6a3c7b32f0712',
        'appSha256': 'a02188110418906cabbdb46dd3be31583cb791d821fefe5dc18a51491d493e45',
    },
    'symmetry': {
        'commit': '537e95ff462b5f2eb5fd6d3518e4525c0ea18e2f',
        'tree': '65706809c7c337ee42a11a531e34eb2bb09c2000',
        'appSha256': '40853e5b547e34e8fa9e7dddcc5d11d4df50fe7186de1d9dad4130d302cfc95c',
    },
}
TEST_SHA = '98a36be008222ed186e27e78db1c32bbc56bdbce093e1635b51b4ce7a0c647f0'
WORKBENCH_SHA = '2c2f076d1942ae9508debd82130e5424e61b52ece30ba10f072d106ab58d88b5'
INIT = 'globalThis.__vibemol320Diagnostic = {fitToolsCalls:0,lastFitToolsEntryMs:null};'
CONDITION = '''(globalThis.__vibemol320Diagnostic ? (
  globalThis.__vibemol320Diagnostic.lastFitToolsEntryMs = performance.now(),
  globalThis.__vibemol320Diagnostic.fitToolsCalls++, false) : false)'''
READBACK = '''(el) => {
  const originalAssertionValue = (EXPRESSION)(el);
  const observedAtMs = performance.now();
  const d = globalThis.__vibemol320Diagnostic;
  const trigger = document.getElementById('workbenchOverflowBtn');
  const menu = document.getElementById('workbenchOverflowMenu');
  const visible = node => !!node && !node.hidden && getComputedStyle(node).display !== 'none' && !!node.getClientRects().length;
  const observation = {
    originalAssertionValue, scrollWidth:el.scrollWidth, clientWidth:el.clientWidth,
    viewport:{width:innerWidth,height:innerHeight},
    observedAtMs, lastFitToolsEntryMs:d?.lastFitToolsEntryMs,
    millisecondsSinceLastFitToolsCall:d?.lastFitToolsEntryMs == null ? null : observedAtMs-d.lastFitToolsEntryMs,
    fitToolsCalls:d?.fitToolsCalls,
    overflowTrigger:{present:!!trigger,visible:visible(trigger),hidden:trigger?.hidden ?? null,ariaExpanded:trigger?.getAttribute('aria-expanded') ?? null},
    overflowMenu:{present:!!menu,rowCount:menu?.querySelectorAll('[role="menuitem"]').length ?? null,childCount:menu?.children.length ?? null,hidden:menu?.hidden ?? null,visible:visible(menu),computedDisplay:menu ? getComputedStyle(menu).display : null},
    barClasses:document.getElementById('workbenchBar')?.className ?? null,
    focusedId:document.activeElement?.id,
    buildChecked:document.getElementById('editAdaptiveAddAtomBtn')?.getAttribute('aria-checked') ?? null,
    transformChecked:document.getElementById('editTransformToolBtn')?.getAttribute('aria-checked') ?? null,
    theme:document.documentElement.getAttribute('data-theme'),
    readbackTiming:'Original assertion expression first; numeric readback in the same JavaScript task; no added wait.'
  };
  return {value:originalAssertionValue,observation};
}'''.replace('EXPRESSION', EXPRESSION)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()


def install_fit_probe(page, source):
    anchor = '  function fitTools() {\n    const groups = '
    assert source.count(anchor) == 1, 'fitTools entry anchor changed'
    # CDP line numbers are zero based; stop condition is on the first statement.
    line = source[:source.index(anchor)].count('\n') + 1
    page.add_init_script(INIT)
    cdp = page.context.new_cdp_session(page)
    metadata = {'entryLineOneBased': line + 1, 'condition': CONDITION,
                'resolved': [], 'unexpectedPauses': [], 'scriptIds': []}
    cdp.on('Debugger.breakpointResolved', lambda event: metadata['resolved'].append(event))
    cdp.on('Debugger.scriptParsed', lambda event: metadata['scriptIds'].append(
        {'scriptId': event['scriptId'], 'url': event['url']})
        if '/workbench.js' in event.get('url', '') else None)

    def paused(event):
        metadata['unexpectedPauses'].append(event.get('reason'))
        cdp.send('Debugger.resume')

    cdp.on('Debugger.paused', paused)
    cdp.send('Debugger.enable')
    cdp.send('Debugger.setPauseOnExceptions', {'state': 'none'})
    metadata['breakpoint'] = cdp.send('Debugger.setBreakpointByUrl', {
        'lineNumber': line, 'urlRegex': r'/workbench\.js(?:\?|$)',
        'condition': CONDITION,
    })
    return cdp, metadata


class ToolsLocator:
    def __init__(self, locator, proxy):
        self.locator, self.proxy = locator, proxy

    def evaluate(self, expression, *args, **kwargs):
        if self.proxy.width != 320:
            return self.locator.evaluate(expression, *args, **kwargs)
        assert expression == EXPRESSION, 'Shipped overflow expression changed'
        value = self.locator.evaluate(READBACK, *args, **kwargs)
        record = value['observation']
        assert record['viewport'] == {'width': 320, 'height': 1000}, record
        self.proxy.observations.append(record)
        self.proxy.save()
        print('EDIT_TOOL_320_READBACK ' + json.dumps(record, sort_keys=True), flush=True)
        # Preserve precisely the original boolean for the shipped assertion.
        return value['value']

    def __getattr__(self, name):
        return getattr(self.locator, name)


class DiagnosticPage:
    def __init__(self, page, observations, save):
        self.page, self.observations, self.save = page, observations, save
        self.width = 1440

    def set_viewport_size(self, viewport):
        self.width = viewport['width']
        return self.page.set_viewport_size(viewport)

    def locator(self, selector, *args, **kwargs):
        locator = self.page.locator(selector, *args, **kwargs)
        return ToolsLocator(locator, self) if selector == '.wb-tools' else locator

    def __getattr__(self, name):
        return getattr(self.page, name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--artifacts', type=Path, required=True)
    parser.add_argument('--label', choices=SOURCES, required=True)
    args = parser.parse_args()
    root, output = args.source_root.resolve(), args.artifacts.resolve()
    output.mkdir(parents=True, exist_ok=False)
    expected = SOURCES[args.label]
    assert git(root, 'rev-parse', 'HEAD') == expected['commit']
    assert git(root, 'rev-parse', 'HEAD^{tree}') == expected['tree']
    assert not git(root, 'status', '--porcelain'), 'Target checkout must be clean'
    assert sha(root / 'assets/app/js/app.js') == expected['appSha256']
    assert sha(root / 'tests/e2e/edit_tool.py') == TEST_SHA
    assert sha(root / 'assets/app/js/workbench.js') == WORKBENCH_SHA
    sys.path.insert(0, str(root / 'tests/e2e'))
    import edit_tool as suite
    suite.p.ROOT, suite.p.ARTIFACTS = root, output
    report = {
        'label': args.label, **expected, 'testSha256': TEST_SHA,
        'workbenchSha256': WORKBENCH_SHA, 'harnessSha256': sha(Path(__file__)),
        'diagnosticOnly': True, 'usableAsMergeGate': False,
        'productionSourceChanged': False, 'shippedTestChanged': False,
        'assertionsChanged': False, 'waitsChanged': False, 'goldensChanged': False,
        'fullEditToolSuite': True, 'observations': [],
        'os': platform.system(), 'architecture': platform.machine(),
        'python': platform.python_version(),
        'playwrightVersion': importlib.metadata.version('playwright'),
        'github': {key: os.environ.get(key) for key in
                   ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_SHA', 'ImageOS', 'ImageVersion']},
        'observerEffect': 'Conditional DevTools breakpoint runs timestamp/count writes on fitTools entry and always returns false. Debugger instrumentation can affect timing; the same probe is used on both trees.',
    }
    started = time.monotonic()

    def save():
        (output / 'result.json').write_text(json.dumps(report, indent=2) + '\n')

    save()
    exit_code = 0
    with suite.p.run_http_server(root) as url, suite.p.sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=['--use-angle=swiftshader'])
        report['browserVersion'] = browser.version
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('dialog', lambda dialog: dialog.dismiss())
        cdp, probe = install_fit_probe(page, (root / 'assets/app/js/workbench.js').read_text())
        report['fitToolsProbe'] = probe
        try:
            suite.run(DiagnosticPage(page, report['observations'], save), url)
            suite.visual_schemes(browser, url)
            assert not errors, errors
            report['suiteStatus'] = 'passed'
        except BaseException as error:
            report.update(suiteStatus='failed', exception=type(error).__name__,
                          message=str(error), traceback=traceback.format_exc())
            traceback.print_exc()
            suite.p.write_failure_artifacts(page, output, 'edit-tool-failure', errors, [])
            exit_code = 1
        finally:
            report['pageErrors'] = errors
            report['renderer'] = page.evaluate('''() => {
              const gl=document.createElement('canvas').getContext('webgl2');
              if(!gl)return null;const ext=gl.getExtension('WEBGL_debug_renderer_info');
              return {renderer:gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION),
                unmaskedRenderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};
            }''')
            report['servedWorkbenchSources'] = []
            for script in probe['scriptIds']:
                text = cdp.send('Debugger.getScriptSource', {'scriptId': script['scriptId']})['scriptSource']
                report['servedWorkbenchSources'].append({**script, 'sha256': hashlib.sha256(text.encode()).hexdigest()})
            page.screenshot(path=str(output / 'final-state.png'))
            (output / 'final-state.html').write_text(page.content())
            browser.close()
    observations = report['observations']
    report['probeValid'] = (
        len(observations) == 1 and observations[0]['fitToolsCalls'] > 0
        and observations[0]['millisecondsSinceLastFitToolsCall'] is not None
        and bool(probe['resolved']) and not probe['unexpectedPauses']
        and bool(report['servedWorkbenchSources'])
        and all(item['sha256'] == WORKBENCH_SHA for item in report['servedWorkbenchSources'])
    )
    assert sha(root / 'assets/app/js/app.js') == expected['appSha256']
    assert sha(root / 'tests/e2e/edit_tool.py') == TEST_SHA
    assert sha(root / 'assets/app/js/workbench.js') == WORKBENCH_SHA
    assert not git(root, 'status', '--porcelain'), 'Target checkout changed'
    if not report['probeValid']:
        exit_code = 2
    report['seconds'] = round(time.monotonic() - started, 3)
    report['exitCode'] = exit_code
    save()
    print('EDIT_TOOL_320_RESULT ' + json.dumps(report, sort_keys=True), flush=True)
    return exit_code


if __name__ == '__main__':
    raise SystemExit(main())
