#!/usr/bin/env python3
"""Live axe-core color-contrast baseline: both themes × four Workbench modes."""
import argparse
import hashlib
import json

import premerge as p
from calculations import ready
from helpers import read_app_version

AXE_VERSION = '4.11.0'
AXE_SHA256 = 'e9e5863c33a874f09bc01acd9234b7e3c871479f5eef8802fa582544465e6d01'
AXE_PATH = p.ROOT / 'tests/vendor/axe-core/axe.min.js'
BASELINE = p.ROOT / 'tests/baselines/color-contrast.json'
VIEWPORT = {'width': 1512, 'height': 950}


def prepare(page, url, theme, mode):
    page.goto(url + '?appearanceStudy=1')
    page.wait_for_function('()=>window.VibeMolWorkbench && window.VibeMolCalculations')
    assert p.load(page, [{'name': 'sample.cube', 'text': (p.ROOT / 'assets/data/sample.cube').read_text()}])['ok']
    if page.locator('#themeToggleInput').is_checked() != (theme == 'dark'):
        page.locator('#themeToggleShell').click()
    page.locator('#mode' + mode + 'Btn').click()
    panel = {'Display': 'viewPanel', 'Measure': 'measurementsPanel',
             'Edit': 'editAdaptiveAddAtomPopover', 'Calculations': 'subspacePanel'}[mode]
    # Explicit panel fixtures avoid relying on whichever windows last happened
    # to be open. No DOM/style mocking, color parsing, or contrast exceptions.
    workbench_id = 'buildPanel' if mode == 'Edit' else panel
    page.evaluate('(id)=>VibeMolWorkbench.open(id)', workbench_id)
    page.locator('#' + ('sidePanel' if mode == 'Display' else panel)).wait_for(state='visible')
    if mode == 'Calculations':
        ready(page)
        page.evaluate('()=>VibeMolCalculations.selectShell(3,"2p")')
        ready(page)
        page.locator('#subspacePanel details').evaluate_all('els=>els.forEach(e=>e.open=true)')
    page.mouse.move(750, 130)  # no tooltips/cursor payload over the controls
    page.evaluate('()=>document.fonts.ready')
    page.wait_for_timeout(350)
    return panel


def inspect(page):
    return page.evaluate('''async () => {
      const result=await axe.run(document, {runOnly:{type:'rule',values:['color-contrast']}});
      return {engine:result.testEngine,environment:result.testEnvironment,
        violations:result.violations,incomplete:result.incomplete,
        passes:result.passes,inapplicable:result.inapplicable};
    }''')


def summarize(scans):
    # Scrolling can bring a previously clipped control fully into view. Keep
    # every raw result, count a failure in ANY scan, and resolve an incomplete
    # check only if axe itself obtains a definite result for the same target.
    by_kind = {kind: {} for kind in ['violations', 'incomplete', 'passes', 'inapplicable']}
    for scan in scans:
        for kind, nodes in by_kind.items():
            for rule in scan['result'][kind]:
                for node in rule['nodes']:
                    key = json.dumps([rule['id'], node['target']], sort_keys=True)
                    nodes[key] = dict(rule=rule['id'], **node)
    failures, pending, passes = (by_kind[k] for k in ['violations', 'incomplete', 'passes'])
    resolved = pending.keys() & passes.keys() - failures.keys()
    summary = {'scanCount': len(scans), 'incompleteResolvedByScrolling': len(resolved)}
    for key in failures.keys() | passes.keys():
        pending.pop(key, None)
    for key in failures:
        passes.pop(key, None)
    for kind, by_target in by_kind.items():
        nodes = list(by_target.values())
        summary[kind + 'Count'] = len(nodes)
        if kind in ['violations', 'incomplete']:
            summary[kind] = nodes  # selectors, HTML, reasons, related nodes and axe's measured data
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--update-baseline', action='store_true', help='Record current results for explicit review')
    args = parser.parse_args()
    assert hashlib.sha256(AXE_PATH.read_bytes()).hexdigest() == AXE_SHA256
    report = {'appVersion': read_app_version(), 'axeVersion': AXE_VERSION,
              'viewport': VIEWPORT, 'rule': 'color-contrast', 'cases': {}}
    with p.run_http_server(p.ROOT) as url, p.sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=['--use-angle=swiftshader'])
        report['browser'] = browser.version
        try:
            for theme in ['light', 'dark']:
                for mode in ['Display', 'Measure', 'Edit', 'Calculations']:
                    key = theme + '/' + ('View' if mode == 'Display' else mode)
                    page = browser.new_page(viewport=VIEWPORT, device_scale_factor=1)
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    try:
                        panel = prepare(page, url, theme, mode)
                        page.add_script_tag(path=str(AXE_PATH))
                        assert page.evaluate('axe.version') == AXE_VERSION
                        scans = [{'position': 'top', 'result': inspect(page)}]
                        if mode == 'Calculations':
                            body = page.locator('#subspacePanel .vm-list-popover__body')
                            dimensions = body.evaluate('e=>({height:e.clientHeight,max:e.scrollHeight-e.clientHeight})')
                            step = max(1, int(dimensions['height'] * 0.75))
                            positions = list(range(step, dimensions['max'], step)) + [dimensions['max']]
                            for offset in positions:
                                if offset <= 0:
                                    continue
                                body.evaluate('(e,y)=>e.scrollTop=y', offset)
                                page.wait_for_timeout(100)
                                scans.append({'position': offset, 'result': inspect(page)})
                        assert not errors, errors
                        assert all(s['result']['passes'] or s['result']['violations'] or s['result']['incomplete'] for s in scans), 'Audit ran no checks'
                        case = dict(panel=panel, **summarize(scans))
                        if mode == 'Edit':
                            # Single-character labels are inconclusive when
                            # failing axe's text heuristic, never a pass. Require
                            # an actual passing check for each corrected chip.
                            case['buildChips'] = []
                            passed = [n for r in scans[0]['result']['passes'] for n in r['nodes']]
                            for z, symbol, background in [(6, 'C', '#7f7f7f'), (15, 'P', '#ff8000'), (26, 'Fe', '#e06633')]:
                                target = f'button[data-z="{z}"]'
                                node = next((n for n in passed if target in n['target']), None)
                                assert node, f'{symbol} chip did not pass axe color-contrast'
                                check = next(c['data'] for c in node['any'] if c['id'] == 'color-contrast')
                                assert check['bgColor'] == background and check['fgColor'] == '#0b1220', check
                                assert check['contrastRatio'] >= 4.5, check
                                case['buildChips'].append(dict(symbol=symbol, target=target, **check))
                        report['cases'][key] = case
                        filename = 'contrast-' + key.replace('/', '-').lower()
                        (p.ARTIFACTS / (filename + '.json')).write_text(json.dumps(scans, indent=2) + '\n')
                        page.screenshot(path=str(p.ARTIFACTS / (filename + '.png')))
                        print(f'[axe {key}] {case["violationsCount"]} violating nodes; '
                              f'{case["incompleteCount"]} need review; {case["passesCount"]} pass', flush=True)
                    except Exception:
                        p.write_failure_artifacts(page, p.ARTIFACTS, 'contrast-failure', errors, [])
                        raise
                    finally:
                        page.close()
        finally:
            browser.close()
    (p.ARTIFACTS / 'color-contrast-report.json').write_text(json.dumps(report, indent=2) + '\n')
    if args.update_baseline:
        BASELINE.parent.mkdir(parents=True, exist_ok=True)
        BASELINE.write_text(json.dumps(report, indent=2) + '\n')
        print(f'[axe] Baseline recorded: {BASELINE}. Incomplete checks are NOT passes.', flush=True)
    else:
        baseline = json.loads(BASELINE.read_text())
        assert baseline['axeVersion'] == AXE_VERSION and baseline['viewport'] == VIEWPORT
        assert baseline['cases'].keys() == report['cases'].keys()
        regressions = []
        for key, case in report['cases'].items():
            # Retain known issues, but a new failure OR newly inconclusive node
            # must be reviewed. Counts alone would miss different failing nodes.
            for kind in ['violations', 'incomplete']:
                targets = lambda c: {json.dumps(n['target'], sort_keys=True) for n in c[kind]}
                for target in sorted(targets(case) - targets(baseline['cases'][key])):
                    regressions.append(f'{key} {kind}: {target}')
        assert not regressions, 'Contrast baseline changed; inspect artifacts:\n' + '\n'.join(regressions)
        print('[axe] No new failing/incomplete targets against baseline. See report for existing findings.', flush=True)


if __name__ == '__main__':
    main()
