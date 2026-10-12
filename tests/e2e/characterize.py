#!/usr/bin/env python3
"""Characterize v0.9.5-pre-refactor (1c609b3); pixel hashes are diagnostic.

Use --source-root with an archived baseline and --inject-harness before changing
production scripts. --update-baseline is permitted only on CI with the original app.js.
"""
from __future__ import annotations

import argparse
import copy
import gzip
import hashlib
import json
import math
import os
import pathlib
import platform
import re
import subprocess
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright
from helpers import ensure_artifact_dir, run_http_server, write_failure_artifacts

ROOT = pathlib.Path(__file__).resolve().parents[2]
FIXTURES = ROOT / 'tests/fixtures/characterize'
BASELINE = ROOT / 'tests/baselines/characterize.json.gz'
SUMMARY = ROOT / 'tests/baselines/characterize-summary.json'
API_ADDITIONS = ROOT / 'tests/baselines/characterize-api-additions.json'
BASE_COMMIT = '1c609b338344aaa49ffd11b9ee2ad834a6e0d85d'
BASE_TAG = 'v0.9.5-pre-refactor'
VIEWPORT = {'width': 1512, 'height': 1000}
ARTIFACTS = ensure_artifact_dir(pathlib.Path(os.environ.get(
    'VIBEMOL_TEST_ARTIFACT_DIR', str(ROOT / 'out/test-artifacts'))))
QA = (ROOT / 'assets/app/js/qa-characterize.js').read_text()
VENDOR_WARNING = ('Scripts "build/three.js" and "build/three.min.js" are deprecated with r150+, '
                  'and will be removed with r160. Please use ES Modules or alternatives: '
                  'https://threejs.org/docs/index.html#manual/en/introduction/Installation')
READBACK_DIAGNOSTIC = re.compile(
    r'^\[\.WebGL-0x[0-9a-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): '
    r'GPU stall due to ReadPixels(?: \(this message will no longer repeat\))?$')
COMPARISON_POLICY = {
    'floatLeaves': {'relTol': 1e-9, 'absTol': 1e-12},
    'exact': ['types', 'integers', 'booleans', 'strings', 'keys', 'lengths', 'structure'],
    'reason': 'The complete CI/local audit found only 32 one- or four-ULP bond-z differences: '
              'maximum absolute 4.235164736271502e-22, relative 7.82384323679457e-16. '
              'The tolerance accommodates floating-point platform drift while rejecting a 1e-6 change.',
    'summary': 'Goldens are compared with tolerance for float leaves and are expected to hold across machines; '
               'all other leaves, types and structure remain exact.'}


def unexpected_console(messages):
    # Preserve vendor warnings and browser readback diagnostics in the evidence,
    # rather than changing Three.js or silencing console.warn. No application
    # message, shader error, or other driver warning is allowed.
    return [message for message in messages if not (message['type'] == 'warning' and
            (message['text'] == VENDOR_WARNING or READBACK_DIAGNOSTIC.fullmatch(message['text'])))]


def read_fixture(path):
    file = FIXTURES / path
    return gzip.decompress(file.read_bytes()).decode() if path.endswith('.gz') else file.read_text()


def file_input(path):
    return {'name': pathlib.Path(path.removesuffix('.gz')).name, 'text': read_fixture(path)}


def load(page, paths):
    result = page.evaluate('files => VibeMolEmbed.loadFiles(files)', [file_input(path) for path in paths])
    assert result['ok'], result
    if (any(path.endswith('.vibemol-session.gz') for path in paths)
            and page.evaluate('() => !!window.__vmqaElementCaches')):
        page.evaluate("() => __vmqa.assertElementCacheIdentity('session restore')")


def first_difference(expected, actual, path='$'):
    if type(expected) is not type(actual):
        return f'{path}: {type(expected).__name__} != {type(actual).__name__}'
    if isinstance(expected, dict):
        if expected.keys() != actual.keys():
            return f'{path}: missing {sorted(expected.keys()-actual.keys())}; added {sorted(actual.keys()-expected.keys())}'
        for key in expected:
            diff = first_difference(expected[key], actual[key], f'{path}.{key}')
            if diff:
                return diff
    elif isinstance(expected, list):
        if len(expected) != len(actual):
            return f'{path}: length {len(expected)} != {len(actual)}'
        for index, (a, b) in enumerate(zip(expected, actual)):
            diff = first_difference(a, b, f'{path}[{index}]')
            if diff:
                return diff
    elif isinstance(expected, float):
        if not math.isclose(expected, actual, rel_tol=1e-9, abs_tol=1e-12):
            return f'{path}: {expected!r} != {actual!r}'
    elif expected != actual:
        return f'{path}: {str(expected)[:180]!r} != {str(actual)[:180]!r}'
    return None


def pin(page):
    # Work around the 0.9.x app defect: camera/target preset setters do not refresh
    # an existing orthographic frustum (evangelistalab/vibemol#3). This pin masks
    # that defect; passing characterization does not verify the ordinary API.
    # Refresh explicitly so the pin never depends on a pending dock resize.
    page.evaluate("""() => VibeMolPreset.import({kind:'vibemol.preset',presetVersion:1,
      settings:{'view.projection':'perspective'}},{mode:'strict'})""")
    page.evaluate('''() => VibeMolPreset.import({kind:'vibemol.preset',presetVersion:1,settings:{
      'view.autoRotate':false,'view.projection':'orthographic',
      'view.camera.x':30,'view.camera.y':0,'view.camera.z':0,
      'view.target.x':0,'view.target.y':0,'view.target.z':0,
      'surface.autoIsoEnabled':false,'surface.iso':0.02,'surface.opacity':1
    }},{mode:'strict'})''')
    page.evaluate('() => __vmqa.settle()')


def new_page(browser, url, inject):
    context = browser.new_context(viewport=VIEWPORT, device_scale_factor=1)
    page = context.new_page()
    page.set_default_timeout(60000)
    page.set_default_navigation_timeout(60000)
    errors, console = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: console.append({'type': message.type, 'text': message.text})
            if message.type in ('error', 'warning') else None)
    page.on('dialog', lambda dialog: dialog.dismiss())
    page.goto(url + '?appearanceStudy=1&qa=1', wait_until='domcontentloaded')
    page.wait_for_function('() => window.VibeMolSession && window.VibeMolWorkbench && window.VibeMolAppearanceLooks')
    if inject:
        page.add_script_tag(content=QA)
    page.wait_for_function('() => window.__vmqa?.characterizeVersion === 1')
    if not inject:
        versions = page.evaluate('''() => performance.getEntriesByType('resource')
          .filter(entry=>new URL(entry.name).pathname.endsWith('/qa-characterize.js'))
          .map(entry=>new URL(entry.name).searchParams.get('v'))''')
        assert versions == [page.evaluate('() => VibeMolAssets.version')], versions
    page.evaluate('() => __vmqa.settle()')
    return context, page, errors, console


def prepare_fixtures(browser, url, inject):
    context, page, errors, console = new_page(browser, url, inject)
    try:
        page.evaluate("() => VibeMolAppearanceLooks.apply('basic',{includeColors:true})")
        look = page.evaluate("() => VibeMolLooks.exportLook(VibeMolLooks.builtins.find(look=>look.id==='basic'))")
        (FIXTURES / 'basic.look.json').write_text(json.dumps(look, indent=2) + '\n')
        load(page, ['sample.cube.gz'])
        assert page.evaluate("() => VibeMolEmbed.loadFiles([{name:'water.xyz',text:'3\\nWater\\nO 0 0 0\\nH 0.96 0 0\\nH -0.25 0.93 0\\n'}],{clearFirst:false})")['ok']
        pin(page)
        session = page.evaluate('() => VibeMolSession.export()')
        assert len(session['graph']['scenes']) == 2
        session['savedAt'] = '2026-10-09T00:00:00.000Z'
        data = (json.dumps(session, separators=(',', ':')) + '\n').encode()
        (FIXTURES / 'two-scenes.vibemol-session.gz').write_bytes(gzip.compress(data, mtime=0))
        assert not errors and not unexpected_console(console), (errors, console)
    finally:
        context.close()


def pubchem(page):
    requests = []
    def replay(route):
        url = urlparse(route.request.url)
        requests.append(url.path + ('?' + url.query if url.query else ''))
        if url.path.endswith('/name/benzene/cids/JSON'):
            file = 'cids.json'
        elif url.path.endswith('/cid/241/conformers/JSON'):
            file = 'conformers.json'
        elif url.path.endswith('/cid/241/SDF') and url.query == 'record_type=3d':
            file = 'benzene.sdf'
        elif '/cid/241/property/' in url.path:
            file = 'properties.json'
        else:
            raise AssertionError('Unrecorded PubChem request: ' + route.request.url)
        route.fulfill(status=200, body=(FIXTURES / 'pubchem' / file).read_bytes(),
                      content_type='chemical/x-mdl-sdfile' if file.endswith('.sdf') else 'application/json',
                      headers={'Access-Control-Allow-Origin': '*'})
    page.route('https://pubchem.ncbi.nlm.nih.gov/**', replay)
    # Set the query without starting an autocomplete timer. Click exercises the
    # actual CID -> conformer -> SDF -> metadata -> scene registration flow.
    page.locator('#pubchemQuery').evaluate("element=>element.value='benzene'")
    page.locator('#pubchemLoadBtn').click()
    page.wait_for_function("() => VibeMolTesting.getSceneGraphSnapshot().scenes.some(scene=>scene.name.includes('241'))")
    page.wait_for_function("() => document.getElementById('pubchemLoadBtn').getAttribute('aria-busy')==='false'")
    assert len(requests) == 4, requests
    return requests


def recipes():
    assets = json.loads((FIXTURES / 'assets.json').read_text())
    for entry in assets:
        assert hashlib.sha256(read_fixture(entry['path']).encode()).hexdigest() == entry['sha256'], entry
    return {
        'sample': ['sample.cube.gz'],
        'methane': [entry['path'] for entry in assets if entry['path'].startswith('methane/')],
        'two-component': [entry['path'] for entry in assets if entry['path'].startswith('2ccubes/')],
        'pubchem': [],
        'session': ['two-scenes.vibemol-session.gz'],
        'look': ['sample.cube.gz', 'basic.look.json'],
        'trajectory': ['trajectory.xyz'],
        'vibration': ['vibration.xyz', 'vibration.vib.json'],
    }


def verify_session_camera_pin(browser, url, inject):
    # Reproduce both resize orderings after restore. Compare the actual projected
    # geometry and buffer, since session view serialization omits the frustum.
    context, page, errors, console = new_page(browser, url, inject)
    try:
        load(page, ['two-scenes.vibemol-session.gz'])
        page.evaluate("() => VibeMolWorkbench.open('coordsPanel')")
        page.wait_for_function('() => VibeMolTesting.getWboitSnapshot().sceneEnvironmentLoaded')
        results = []
        for resize_first in (True, False):
            if resize_first:
                page.evaluate("() => dispatchEvent(new Event('resize'))")
                page.evaluate('() => __vmqa.settle()')
            pin(page)
            before = page.evaluate('() => __vmqa.capture()')
            pixel_before = page.evaluate('() => __vmqa.pixelHash()')
            page.evaluate("() => dispatchEvent(new Event('resize'))")
            page.evaluate('() => __vmqa.settle()')
            after = page.evaluate('() => __vmqa.capture()')
            assert before == after, first_difference(before, after)
            assert pixel_before == page.evaluate('() => __vmqa.pixelHash()'), 'Pin depended on resize order.'
            results.append({'resizeBeforePin': resize_first, 'render': after['render'],
                            'structuredIdentical': True, 'pixelsIdentical': True})
        assert not errors and not unexpected_console(console), (errors, console)
        return results
    finally:
        context.close()


def run_once(browser, url, inject):
    captures, pixels, console_by_fixture = {}, {}, {}
    for name, paths in recipes().items():
        for theme in ('light', 'dark'):
            key = name + '/' + theme
            context, page, errors, console = new_page(browser, url, inject)
            try:
                page.evaluate("() => VibeMolAppearanceLooks.apply('basic',{includeColors:true})")
                page.locator('#themeToggleInput').evaluate('''(element,dark)=>{
                  if(element.checked!==dark){element.checked=dark;element.dispatchEvent(new Event('change',{bubbles:true}));}
                }''', theme == 'dark')
                if name == 'pubchem':
                    requests = pubchem(page)
                else:
                    load(page, paths)
                    requests = []
                page.evaluate("() => VibeMolWorkbench.open('coordsPanel')")
                pin(page)
                page.wait_for_function('() => VibeMolTesting.getWboitSnapshot().sceneEnvironmentLoaded')
                for mode in ('Display', 'Measure', 'Edit', 'Calculations'):
                    page.locator('#mode' + mode + 'Btn').click()
                    page.evaluate('() => VibeMolCalculations.ready()')
                    if name == 'sample' and mode == 'Calculations':
                        page.evaluate("() => VibeMolCalculations.selectShell(5,'2p')")
                        result = page.evaluate('() => VibeMolCalculations.export()')
                        assert result['specs'] == ['C3(2p)'] and not result['validation']['errors'], result
                    pin(page)
                    capture = page.evaluate('() => __vmqa.capture()')
                    assert capture['dom']['toolbarHeight'] == 56, capture['dom']['toolbarHeight']
                    assert capture['geometry']['molecule']['atomCount'] > 0, key
                    if name == 'sample' and mode == 'Calculations':
                        capture['forte2'] = result['code']
                    capture['pubchemRequests'] = requests
                    captures[key + '/' + mode] = capture
                    pixels[key + '/' + mode] = page.evaluate('() => __vmqa.pixelHash()')
                page.locator('#modeDisplayBtn').click()
                # Every bundled orbital must be rendered at least once. A page
                # that loads cleanly cannot expose a delayed closure reference.
                if name in ('methane', 'two-component'):
                    graph = page.evaluate('() => VibeMolTesting.getSceneGraphSnapshot()')
                    orbitals = [layer for scene in graph['scenes'] for layer in scene['layers'] if layer['kind'] == 'cube']
                    assert len(orbitals) == len(paths)
                    for layer in orbitals:
                        page.locator('.vm-outliner-row[data-id="' + layer['id'] + '"]').click()
                        pin(page)
                        captures[key + '/orbital/' + layer['name']] = page.evaluate('() => __vmqa.capture()')
                if name == 'trajectory':
                    page.evaluate("() => VibeMolWorkbench.open('trajectoryPanel')")
                    row = page.locator('.trajectorySceneRow')
                    row.get_by_role('button', name='Play trajectory', exact=True).click()
                    page.wait_for_function("() => document.querySelector('.trajectoryFrameReadout').textContent!=='1/4'")
                    row.get_by_role('button', name='Pause trajectory', exact=True).click()
                    # Drive the focused slider like a user. A synthetic input
                    # on an unfocused slider can be overwritten by UI refresh.
                    slider = row.locator('input[type=range]')
                    slider.press('Home')
                    slider.press('ArrowRight')
                    slider.press('ArrowRight')
                    page.wait_for_function("() => document.querySelector('.trajectoryFrameReadout').textContent==='3/4'")
                    row.get_by_label('FPS', exact=True).fill('9')
                    row.get_by_label('FPS', exact=True).dispatch_event('change')
                    row.get_by_label('Loop', exact=True).uncheck()
                    pin(page)
                    capture = page.evaluate('() => __vmqa.capture()')
                    trajectory = capture['session']['sources'][0]['volume']['trajectory']
                    assert trajectory['frameIndex'] == 2 and not trajectory['playing'], trajectory
                    captures[key + '/frame-3'] = capture
                    page.locator('#trajectoryResetBtn').click()
                if name == 'vibration':
                    page.evaluate("() => VibeMolWorkbench.open('vibrationPanel')")
                    page.locator('#vibrationHideLowFreq').uncheck()
                    page.locator('#vibrationAmplitude').fill('0.8')
                    page.locator('#vibrationAmplitude').dispatch_event('change')
                    page.locator('#vibrationSpeed').fill('1.25')
                    page.locator('#vibrationSpeed').dispatch_event('change')
                    page.locator('#vibrationPlayBtn').click()
                    page.wait_for_function('async () => (await VibeMolSession.export()).sources[0].volume.vibration.phase>0')
                    page.locator('#vibrationPlayBtn').click()
                    page.locator('#vibrationResetBtn').click()
                    pin(page)
                    captures[key + '/controls'] = page.evaluate('() => __vmqa.capture()')
                    page.locator('#vibrationResetBtn').click()
                assert not errors and not unexpected_console(console), (key, errors, console)
                console_by_fixture[key] = {'errors': errors, 'console': console}
                print('[characterize] ' + key + ': API, session, geometry, DOM and console captured', flush=True)
            except Exception:
                write_failure_artifacts(page, ARTIFACTS, 'characterize-' + name + '-' + theme,
                                        errors, [message['text'] for message in console])
                raise
            finally:
                context.close()
    return captures, pixels, console_by_fixture


def require_element_cache_result(result, inject):
    """Only an explicitly injected historical harness may skip the sweep."""
    if isinstance(result, dict) and result.get('historicalSourceWithoutCacheBridge'):
        if not inject:
            raise AssertionError('element cache bridge missing on current source')
        return
    assert isinstance(result, list) and len(result) == 4, result


def assert_element_cache_exercise(identity, modes, panels):
    """Require actual checkpoint and observer firings in each fresh context."""
    expected = {'live': 47, 'knownAbsent': 5} if len(modes) == 4 else {'live': 48, 'knownAbsent': 4}
    assert identity['supported'] and identity['composition'] == expected, identity
    assert identity['nodeCount'] == sum(expected.values()), identity
    absent = identity['knownAbsent']
    assert len(absent) == expected['knownAbsent'], identity
    assert all(type(entry.get('issue')) is int and entry['issue'] > 0
               for entry in absent.values()), identity
    assert not identity['failures'], identity
    checks = identity['checks']
    counts = {reason: checks.get(reason, 0) for reason in (
        'presented checkpoint', 'mode switch', 'DOM replacement', 'session restore')}
    counts['panel transition'] = sum(count for reason, count in checks.items()
                                      if reason.startswith('panel transition: '))
    minimums = {
        # One settle for each explicit mode, panel open/close and restore.
        'presented checkpoint': len(modes) + 2 * len(panels) + 1,
        # Explicit mode assertions share this reason with the observer. Require
        # an additional firing so those calls cannot hide a dormant observer.
        'mode switch': len(modes) + 1,
        # These two reasons are emitted only by the MutationObserver. Require
        # at least two panel mutations and a child-list mutation, without pinning
        # the much larger counts that vary with rendering and panel activity.
        'panel transition': 2,
        'DOM replacement': 1,
        'session restore': 1,
    }
    deficits = [f'{reason}: {counts[reason]} < {minimum}'
                for reason, minimum in minimums.items() if counts[reason] < minimum]
    assert not deficits, 'element cache sweep not exercised: ' + '; '.join(deficits)
    return {'checksByReason': counts, 'minimumChecksByReason': minimums,
            'explicitModeChecks': len(modes),
            'observedModeChecks': counts['mode switch'] - len(modes)}


def verify_element_caches(browser, url, inject):
    """Additional identity gate; keep the 102 golden payloads unchanged."""
    results = []
    for legacy in (False, True):
        for dark in (False, True):
            context = browser.new_context(viewport=VIEWPORT, device_scale_factor=1)
            page = context.new_page()
            page.set_default_timeout(60000)
            page.goto(url + '?appearanceStudy=1&qa=1' + ('&workspaceLab=0' if legacy else ''))
            page.wait_for_function('() => window.VibeMolSession && window.VibeMolWorkbenchHost')
            if inject:
                page.add_script_tag(content=QA)
            try:
                if not page.evaluate('() => !!window.__vmqaElementCaches'):
                    if not inject:
                        raise AssertionError('element cache bridge missing on current source')
                    return {'historicalSourceWithoutCacheBridge': True}
                page.wait_for_function('() => window.__vmqa?.characterizeVersion === 1')
                page.locator('#themeToggleInput').evaluate('''(el, dark) => {
                    if (el.checked !== dark) { el.checked = dark; el.dispatchEvent(new Event('change', {bubbles:true})); }
                }''', dark)
                load(page, ['sample.cube.gz'])
                modes = ('Display', 'Measure', 'Edit') + (() if legacy else ('Calculations',))
                for mode in modes:
                    page.locator('#mode' + mode + 'Btn').click()
                    page.evaluate('() => __vmqa.settle()')
                    assert page.evaluate("() => __vmqa.assertElementCacheIdentity('mode switch').count") == 52
                ids = page.evaluate('''() => [...new Set([
                    ...Object.values(VibeMolWorkbenchHost.windows.ids), 'inspector',
                    'measurementsPanel', 'subspacePanel', 'figurePanel', 'buildPanel', 'symmetryPanel'
                ])].filter(id => VibeMolWorkbenchHost.windows.getEntry(id)?.setOpen)''')
                for panel in ids:
                    mode = ('Edit' if panel in ('buildPanel', 'symmetryPanel') else
                            'Calculations' if panel == 'subspacePanel' and not legacy else 'Display')
                    page.locator('#mode' + mode + 'Btn').click()
                    for opened in (True, False):
                        page.evaluate('''({panel,opened}) => VibeMolWorkbenchHost.windows.getEntry(panel).setOpen(opened)''',
                                      {'panel': panel, 'opened': opened})
                        page.evaluate('() => __vmqa.settle()')
                        assert page.evaluate('(reason) => __vmqa.assertElementCacheIdentity(reason).count',
                                             ('panel open: ' if opened else 'panel close: ') + panel) == 52
                session = page.evaluate('() => VibeMolSession.export()')
                page.evaluate('doc => VibeMolSession.import(doc)', session)
                page.evaluate('() => __vmqa.settle()')
                assert page.evaluate("() => __vmqa.assertElementCacheIdentity('session restore').count") == 52
                identity = page.evaluate('() => __vmqa.elementCacheReport()')
                exercise = assert_element_cache_exercise(identity, modes, ids)
                launch, theme = 'legacy' if legacy else 'workbench', 'dark' if dark else 'light'
                results.append({'launch': launch, 'theme': theme,
                                'modes': list(modes), 'panelOpenClosePairs': ids,
                                'identity': identity, 'exercise': exercise})
                print(f'[element cache] {launch}/{theme}: ' +
                      json.dumps(exercise['checksByReason'], sort_keys=True), flush=True)
            finally:
                context.close()
    return results


def metadata(source_root):
    app = (source_root / 'assets/app/js/app.js').read_bytes()
    text = app.decode()
    return {'commit': BASE_COMMIT, 'tag': BASE_TAG, 'appSha256': hashlib.sha256(app).hexdigest(), 'viewport': VIEWPORT,
            'captureTimestampFields': ['savedAt', 'preset.meta.createdAt', 'preset.meta.updatedAt'],
            'pinnedCamera': [30, 0, 0],
            'metrics': {'lines': len(text.splitlines()),
                        'functionDeclarations': len(re.findall(r'^  (?:async )?function\b', text, re.M)),
                        'letDeclarations': len(re.findall(r'^  let\b', text, re.M)),
                        'constDeclarations': len(re.findall(r'^  const\b', text, re.M))}}


def capture_provenance(browser):
    provenance = {'os': platform.system(), 'osRelease': platform.release(),
                  'architecture': platform.machine(), 'browserName': browser.browser_type.name,
                  'browserVersion': browser.version}
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        provenance['ci'] = {'provider': 'GitHub Actions',
                            'runUrl': f"https://github.com/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}",
                            'runAttempt': os.environ.get('GITHUB_RUN_ATTEMPT', '1'),
                            'runnerImage': os.environ.get('ImageOS')}
    return provenance


def expected_captures(golden, source_root):
    # Preserve all original goldens. A planned new classic-script module has an
    # explicit additive contract; float leaves use COMPARISON_POLICY, everything else stays exact.
    captures = copy.deepcopy(golden['captures'])
    additions = json.loads(API_ADDITIONS.read_text())['modules'] if API_ADDITIONS.exists() else []
    for module in additions:
        if not (source_root / module['script']).is_file():
            assert metadata(source_root)['appSha256'] == golden['baseline']['appSha256'], module['script']
            continue
        for capture in captures.values():
            assert module['global'] not in capture['api'], module['global']
            capture['api'][module['global']] = module['keys']
    return captures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=pathlib.Path, default=ROOT)
    parser.add_argument('--inject-harness', action='store_true')
    parser.add_argument('--prepare-fixtures', action='store_true')
    parser.add_argument('--update-baseline', action='store_true')
    parser.add_argument('--runs', type=int, default=2)
    args = parser.parse_args()
    assert args.runs >= 2, 'The determinism gate requires at least two runs.'
    if args.update_baseline:
        assert os.environ.get('GITHUB_ACTIONS') == 'true', 'Re-record characterization goldens on GitHub CI, never locally.'
    meta = metadata(args.source_root)
    if args.update_baseline or args.prepare_fixtures:
        tagged = subprocess.check_output(['git', 'rev-parse', BASE_TAG + '^{commit}'], cwd=ROOT).decode().strip()
        assert tagged == BASE_COMMIT, 'The pre-refactor tag must still identify the original base.'
        original = subprocess.check_output(['git', 'show', BASE_COMMIT + ':assets/app/js/app.js'], cwd=ROOT)
        assert meta['appSha256'] == hashlib.sha256(original).hexdigest(), 'Capture goldens before changing app.js.'
    if not args.update_baseline and not args.prepare_fixtures:
        golden = json.loads(gzip.decompress(BASELINE.read_bytes()))
        expected = expected_captures(golden, args.source_root)
    with run_http_server(args.source_root) as url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        try:
            meta['captureProvenance'] = capture_provenance(browser)
            if args.prepare_fixtures:
                prepare_fixtures(browser, url, args.inject_harness)
                print('[characterize] Exported Look and two-scene session fixtures.', flush=True)
                return 0
            # Ordinary launches must retain their original global namespace.
            context = browser.new_context(viewport=VIEWPORT)
            page = context.new_page()
            qa_requests = []
            page.on('request', lambda request: qa_requests.append(request.url)
                    if urlparse(request.url).path.endswith('/qa-characterize.js') else None)
            page.goto(url + '?appearanceStudy=1')
            page.wait_for_function('() => window.VibeMolWorkbench')
            assert page.evaluate('() => window.__vmqa === undefined')
            assert not qa_requests, qa_requests
            context.close()
            camera_pin = None
            baseline = pixel_baseline = None
            pixel_changes = []
            capture_hashes = []
            cache_identity_runs = []
            for run in range(1, args.runs + 1):
                cache_identity = verify_element_caches(browser, url, args.inject_harness)
                require_element_cache_result(cache_identity, args.inject_harness)
                cache_identity_runs.append({'run': run, 'elementCacheIdentity': cache_identity})
                # Preserve the exercised safety-net evidence even if a later
                # scientific golden comparison fails (including on CI).
                (ARTIFACTS / 'characterize-cache-identity.json').write_text(json.dumps({
                    'sourceAppSha256': meta['appSha256'], 'requestedRuns': args.runs,
                    'elementCacheIdentityRuns': cache_identity_runs}, indent=2) + '\n')
                if camera_pin is None:
                    camera_pin = verify_session_camera_pin(browser, url, args.inject_harness)
                captures, pixels, console = run_once(browser, url, args.inject_harness)
                capture_hashes.append(hashlib.sha256(json.dumps(captures, indent=2).encode()).hexdigest())
                (ARTIFACTS / f'characterize-run-{run}.json').write_text(json.dumps(captures, indent=2) + '\n')
                (ARTIFACTS / f'characterize-pixels-{run}.json').write_text(json.dumps(pixels, indent=2) + '\n')
                if baseline is None:
                    baseline, pixel_baseline = captures, pixels
                else:
                    diff = first_difference(baseline, captures)
                    assert not diff, 'Non-deterministic characterization: ' + str(diff)
                    assert captures == baseline, 'Within-machine runs must be exactly identical, even when float drift is within cross-machine tolerance.'
                    pixel_changes.extend(key for key in pixels if pixels[key] != pixel_baseline[key])
                if not args.update_baseline:
                    diff = first_difference(expected, captures)
                    assert not diff, 'Characterization regression: ' + str(diff)
            if args.update_baseline:
                raw = (json.dumps({'baseline': meta, 'captures': baseline}, indent=2) + '\n').encode()
                BASELINE.write_bytes(gzip.compress(raw, mtime=0))
                SUMMARY.write_text(json.dumps({'baseline': meta, 'captures': len(baseline),
                    'comparison': COMPARISON_POLICY,
                    'determinism': {'runs': args.runs, 'identical': True, 'exact': True,
                                    'captureSha256PerRun': capture_hashes},
                    'api': next(iter(baseline.values()))['api'],
                    'goldenSha256': hashlib.sha256(raw).hexdigest(),
                    'pixelDiagnostic': {'hashesPerRun': len(pixel_baseline),
                                        'changedSnapshots': sorted(set(pixel_changes))},
                    'consoleExceptions': {'vendorWarning': VENDOR_WARNING,
                                          'browserReadbackDiagnostic': READBACK_DIAGNOSTIC.pattern}}, indent=2) + '\n')
            evidence = {'baseline': meta, 'runs': args.runs, 'capturesPerRun': len(baseline),
                        'browserVersion': browser.version,
                        'comparison': COMPARISON_POLICY, 'exactlyIdentical': True,
                        'captureSha256PerRun': capture_hashes,
                        'deterministic': True, 'console': console,
                        'sessionCameraPin': camera_pin,
                        'elementCacheIdentity': cache_identity,
                        'elementCacheIdentityRuns': cache_identity_runs,
                        'sameSessionPixelChanges': sorted(set(pixel_changes))}
            (ARTIFACTS / 'characterize-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n')
            print(f'[characterize] {args.runs} identical runs; {len(baseline)} snapshots each; '
                  f'{len(set(pixel_changes))} diagnostic pixel differences.', flush=True)
        finally:
            browser.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
