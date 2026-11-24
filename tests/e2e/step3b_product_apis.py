"""Direct browser contracts for Step 3b product APIs."""
import argparse
from base64 import b64decode, b64encode
from hashlib import sha256
import json
import math
from pathlib import Path
import re
from urllib.parse import urljoin

from playwright.sync_api import sync_playwright
from assertion_contract import numbers_close
from helpers import run_http_server, wait_for_presented_state

ROOT = Path(__file__).resolve().parents[2]
CYCLOPROPENE = ROOT / 'python/tests/data/cyclopropene_sa2cas43.molden'
NEON = ROOT / 'tests/fixtures/molden-g/ne_sph_qz_forte2.molden'


def check(action, actual, expected):
    print('[step3b-product] ' + json.dumps({'action': action, 'actual': actual, 'expected': expected}), flush=True)
    assert actual == expected, (action, actual, expected)


def load_product_fixture(page, file):
    loaded = page.evaluate('file => VibeMolEmbed.loadFiles([file], {clearFirst:true})',
                           {'name': file.name, 'text': file.read_text()})
    check('load fixture', loaded['ok'], True)


def product(page, method, params=None):
    return page.evaluate('([method, input]) => VibeMolOrbitals[method](input)', [method, params or {}])


def value(page, method, params=None):
    result = product(page, method, params)
    assert result['ok'], (method, params, result)
    return result['value']


def read_snapshot(page, request):
    return page.evaluate("""async request => {
      const live = document.querySelector('#canvas');
      const viewport = () => [live.width, live.height, live.style.width, live.style.height];
      const before = JSON.stringify([VibeMolOrbitals.setView().value, viewport()]);
      const result = VibeMolOrbitals.snapshot(request);
      if (!result.ok) return result;
      const restored = before === JSON.stringify([VibeMolOrbitals.setView().value, viewport()]);
      const { dataBase64, ...readback } = result.value;
      const blob = await (await fetch('data:image/png;base64,' + dataBase64)).blob();
      const signature = [...new Uint8Array(await blob.slice(0, 8).arrayBuffer())];
      const image = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, image.width, image.height).data;
      let transparent = 0, opaque = 0;
      const colors = new Set();
      for (let i = 0; i < data.length; i += 4) {
        if (!data[i+3]) transparent++;
        if (data[i+3] === 255) opaque++;
        if (data[i+3]) colors.add((data[i] << 16) + (data[i+1] << 8) + data[i+2]);
      }
      return { ...readback, actualWidth:image.width, actualHeight:image.height,
        signature, visibleColors:colors.size, transparent, opaque, restored };
    }""", request)


CANONICAL_TAGGED = """value => JSON.stringify(value, (_, item) => {
  if (typeof item === 'number' && !Number.isFinite(item)) return {$nonFinite: String(item)};
  if (item === undefined) return {$undefined: true};
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
  }
  return item;
})"""


def graph_snapshot(page):
    return page.evaluate('''async () => (ENCODE)({
      testing: VibeMolTesting.getSceneGraphSnapshot(),
      session: (await VibeMolSession.export()).graph,
    })'''.replace('ENCODE', CANONICAL_TAGGED))


def tagged_nonfinite(data, path='$'):
    if isinstance(data, dict):
        if set(data) == {'$nonFinite'}:
            yield {'path': path, 'value': data['$nonFinite']}
        else:
            for name, value in data.items():
                yield from tagged_nonfinite(value, f'{path}.{name}')
    elif isinstance(data, list):
        for index, value in enumerate(data):
            yield from tagged_nonfinite(value, f'{path}[{index}]')


def check_atomic_graph(before, after):
    def describe(snapshot):
        return {'sha256': sha256(snapshot.encode()).hexdigest(),
                'nonFinite': list(tagged_nonfinite(json.loads(snapshot)))}

    print('[step3b-atomic-graph] ' + json.dumps({
        'before': describe(before), 'after': describe(after), 'identical': before == after,
    }), flush=True)
    assert before == after, 'Invalid request changed the canonical graph snapshot.'


def check_finite_readback(page, namespace, method, params):
    nonfinite = page.evaluate('''async ({namespace, method, params}) => {
      const result = await window[namespace][method](params);
      if (!result.ok) return {error:result.error};
      const paths = [];
      function collect(value, path) {
        if (typeof value === 'number' && !Number.isFinite(value)) paths.push(path);
        else if (Array.isArray(value)) value.forEach((child, index) => collect(child, path + '[' + index + ']'));
        else if (value && typeof value === 'object') {
          for (const [key, child] of Object.entries(value)) collect(child, path + '.' + key);
        }
      }
      collect(result.value, '$');
      return paths;
    }''', {'namespace': namespace, 'method': method, 'params': params})
    check(f'{namespace}.{method} finite readback', nonfinite, [])


def vendor_pole_epsilon():
    vendor = ROOT / 'assets/vendor/js'
    controls = (vendor / 'orbit-controls.global.js').read_text()
    spherical = (vendor / 'three.min.js').read_text()
    control_eps, = re.findall(r'\bconst EPS\s*=\s*([\d.eE+-]+);', controls)
    sphere_eps, = re.findall(r'\bmakeSafe\(\)\s*\{\s*const \w+\s*=\s*([\d.eE+-]+);', spherical)
    check('vendored OrbitControls and spherical pole EPS', [float(control_eps), float(sphere_eps)], [1e-6, 1e-6])
    return float(sphere_eps)


def use_camera_probe(page):
    # Both snaps run in one browser task from the very same camera pose. Invoke
    # the built-in button activation and read the raw camera the renderer uses.
    page.evaluate('''() => {
      const previous = THREE.Mesh.prototype.onBeforeRender;
      THREE.Mesh.prototype.onBeforeRender = function(renderer, scene, camera, ...args) {
        if (renderer.domElement.id === 'canvas' && this.userData.type === 'atom') {
          window.__step3bRenderedCamera = camera;
        }
        return previous.call(this, renderer, scene, camera, ...args);
      };
    }''')


def compare_axis_snap(page, axis, projection, pole_eps):
    value(page, 'setView', {'projection': projection, 'fit': True, 'axis': '+x'})
    wait_for_presented_state(page, f"() => window.__step3bRenderedCamera?.is{projection.capitalize()}Camera === true")
    compare = page.evaluate('''axis => {
      const canonical = ENCODE;
      const camera = window.__step3bRenderedCamera;
      const initialCamera = camera.clone();
      const read = () => {
        const current = VibeMolTesting.getCameraSnapshot();
        return {
          projection: current.mode, position: camera.position.toArray(),
          target: [current.target.x, current.target.y, current.target.z],
          up: camera.up.toArray(), near: camera.near, far: camera.far, zoom: camera.zoom,
        };
      };
      const startNative = canonical(read());
      const sign = axis[0] === '+' ? 1 : -1;
      document.querySelector('#axisGizmo [data-axis="' + axis[1] + '"][data-sign="' + sign + '"]').click();
      // An empty patch refreshes the shared near/far calculation without
      // moving the camera. Read the resulting native pose from the renderer.
      const nativeReady = VibeMolOrbitals.setView();
      const native = canonical(read());
      camera.copy(initialCamera);
      const startCommand = canonical(read());
      const actual = VibeMolOrbitals.setView({axis});
      return {startNative, startCommand, nativeReady: nativeReady.ok, native,
        command: canonical(actual.ok ? actual.value : actual),
        rendered: canonical(read()), ok: actual.ok};
    }'''.replace('ENCODE', CANONICAL_TAGGED), axis)
    actual = json.loads(compare['command'])
    position = actual.get('position', [])
    target = actual.get('target', [])
    delta = [a - b for a, b in zip(position, target)]
    if len(delta) == 3:
        dimension = 'xyz'.index(axis[1])
        lateral = math.hypot(*(length for index, length in enumerate(delta) if index != dimension))
        axial = delta[dimension] * (1 if axis[0] == '+' else -1)
        angle, radius = math.atan2(lateral, axial), math.hypot(*delta)
    else:
        lateral = angle = radius = None
    # OrbitControls' pole guard offsets ±z by at most radius × EPS, the same
    # as the native gizmo. The other four axes need no pole displacement.
    bound = pole_eps * (1 + 1e-9) if axis[1] == 'z' else 1e-9
    details = {
        'axis': axis, 'projection': projection, 'angleRadians': angle,
        'lateralOffset': lateral, 'radius': radius, 'angleBoundRadians': bound,
        'lateralBound': radius * math.sin(bound) if radius is not None else None,
        **compare,
    }
    print('[step3b-axis] ' + json.dumps(details), flush=True)
    assert compare['ok'] and compare['nativeReady'], details
    assert compare['startCommand'] == compare['startNative'], details
    assert compare['command'] == compare['native'] == compare['rendered'], details
    assert radius > 0 and angle <= bound, details


def reject_oversized_png(page):
    actual = page.evaluate('''() => {
      const canvas = document.querySelector('#canvas');
      const encode = canvas.toDataURL;
      const before = [canvas.width, canvas.height];
      try {
        canvas.toDataURL = () => 'data:image/png;base64,' + 'A'.repeat(40_000_001);
        const result = VibeMolOrbitals.snapshot({width:64, height:64});
        return {code:result.error?.code, path:result.error?.path, details:result.error?.details,
          restored: before[0] === canvas.width && before[1] === canvas.height};
      } finally {
        delete canvas.toDataURL;
        if (canvas.toDataURL !== encode) throw Error('Canvas encoder was not restored.');
      }
    }''')
    check('40 MB PNG rejection', actual, {
        'code':'failed', 'path':'snapshot', 'details':{'actual':40_000_001,'expected':40_000_000},
        'restored':True,
    })


def orbitals_and_view_cases(page):
    check('unavailable without source', product(page, 'list')['error']['code'], 'not-available')
    load_product_fixture(page, CYCLOPROPENE)
    initial = value(page, 'list')
    check_finite_readback(page, 'VibeMolOrbitals', 'list', {})
    rows = initial['orbitals']
    active = [round(row['occupation'], 3) for row in rows if row['class'] == 'active']
    check('fractional CAS occupations', active, [1.989, 1.48, 0.53])
    check('core count and frontier labels', [sum(row['class'] == 'core' for row in rows),
                                             all(row['frontier'] is None for row in rows)], [9, True])
    check('one-based indices', [row['index'] for row in rows], list(range(1, len(rows) + 1)))
    graph = graph_snapshot(page)
    check('invalid show index', product(page, 'show', {'indices': [10, len(rows) + 1]})['error']['path'], 'indices')
    check_atomic_graph(graph, graph_snapshot(page))

    check('show first active orbital', value(page, 'show', {'indices': [10]})['visibleIndices'], [10])
    check('nonexclusive show', value(page, 'show', {'indices': [11], 'exclusive': False})['visibleIndices'], [10, 11])
    check('exclusive selection of two', value(page, 'show', {'indices': [11, 12]})['visibleIndices'], [11, 12])
    configured = value(page, 'configure', {'indices': [11], 'iso': 0.04, 'opacity': 0.5})
    check('applied orbital appearance', configured['orbitals'], [{'index': 11, 'iso': 0.04, 'opacity': 0.5}])
    check_finite_readback(page, 'VibeMolOrbitals', 'configure', {'indices': [11]})
    check('targeted hide', value(page, 'hide', {'indices': [12]})['visibleIndices'], [11])
    check('hide all', value(page, 'hide')['visibleIndices'], [])

    use_camera_probe(page)
    pole_eps = vendor_pole_epsilon()
    for projection in ('perspective', 'orthographic'):
        for axis in ('+x', '-x', '+y', '-y', '+z', '-z'):
            compare_axis_snap(page, axis, projection, pole_eps)
        check_finite_readback(page, 'VibeMolOrbitals', 'setView', {})
        wait_for_presented_state(page, '() => !!document.querySelector("#canvas").width')
        for transparent in (False, True):
            snap = read_snapshot(page, {'width': 256, 'height': 192, 'transparent': transparent})
            check('PNG decode', [snap.get(key) for key in ('mime','width','height','actualWidth','actualHeight')],
                  ['image/png',256,192,256,192])
            check('PNG signature', snap['signature'], [137,80,78,71,13,10,26,10])
            print('[step3b-png] ' + json.dumps(snap), flush=True)
            check('PNG has a non-blank presented frame', snap['visibleColors'] > 1, True)
            check('PNG alpha and rendered pixels', [snap['transparent'] > 0, snap['opaque'] > 0], [transparent, True])
            check('snapshot restores the live view and viewport', snap['restored'], True)
    reject_oversized_png(page)
    check('snapshot rejects oversized dimensions', product(page, 'snapshot', {'width': 4097})['error']['path'], 'width')
    load_product_fixture(page, NEON)
    integer = value(page, 'list')['orbitals']
    check('integer HOMO and LUMO', [(row['index'], row['frontier']) for row in integer if row['frontier']],
          [(5, 'HOMO'), (6, 'LUMO')])


def call_vectors(page, method, params=None, code=None):
    result = page.evaluate('([method, input]) => VibeMolVectors[method](input)', [method, params or {}])
    if code:
        check(f'vectors.{method} rejection', [result.get('ok'), result.get('error', {}).get('code'),
                                               result.get('error', {}).get('path')], [False, *code])
        return None
    assert result['ok'], (method, params, result)
    return result['value']


def load_vector_water(page):
    loaded = page.evaluate('''text => VibeMolEmbed.loadFiles([{name:'water.xyz',text}], {clearFirst:true})''',
                           '3\nStep 3b water\nO 0 0 0\nH 0.96 0 0\nH -0.24 0.93 0')
    check('load water vector fixture', loaded['ok'], True)


def magenta_pixels(page, image_base64=None):
    return page.evaluate('''async data => {
      const blob = data === null ? await VibeMolFigure.compose({width:400, cols:1, background:'transparent'})
        : await (await fetch('data:image/png;base64,' + data)).blob();
      const image = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      let count = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const [r,g,b,a] = pixels.subarray(index, index + 4);
        if (a > 127 && r > g + 40 && b > g + 40) count++;
      }
      return count;
    }''', image_base64)


def check_arrow_depth_and_pixels(page):
    page.evaluate('''() => {
      const previous = THREE.Mesh.prototype.onBeforeRender;
      THREE.Mesh.prototype.onBeforeRender = function(renderer, scene, camera, ...args) {
        if (this.parent?.userData.type === 'freeVectorArrow' && this.parent.name === 'point') {
          window.__step3bArrowState = {arrow: this.parent, camera};
        }
        return previous.call(this, renderer, scene, camera, ...args);
      };
    }''')
    page.evaluate("""() => VibeMolPreset.import({kind:'vibemol.preset',presetVersion:1,
      settings:{'global.showAxes':false}},{mode:'strict'})""")
    for projection in ('perspective', 'orthographic'):
        view = value(page, 'setView', {'projection':projection, 'fit':True, 'axis':'-z'})
        wait_for_presented_state(page, '() => window.__step3bArrowState?.arrow.parent?.parent !== null && !!window.__step3bArrowState')
        depth = page.evaluate('''() => {
          const {arrow, camera} = window.__step3bArrowState;
          const point = arrow.localToWorld(new THREE.Vector3(0,10,0));
          return { tipDepth:-point.applyMatrix4(camera.matrixWorldInverse).z,
            near:camera.near, far:camera.far, pickable:arrow.children.some(mesh => mesh.raycast === THREE.Mesh.prototype.raycast) };
        }''')
        print('[step3b-arrow-depth] ' + json.dumps({'projection': view['projection'], **depth}), flush=True)
        assert depth['near'] < depth['tipDepth'] < depth['far'] and not depth['pickable'], depth
        value(page, 'setView', {'axis':'+x'})
        snap = value(page, 'snapshot', {'width':400, 'height':400})
        count = magenta_pixels(page, snap['dataBase64'])
        print('[step3b-arrow-png] ' + json.dumps({'projection': projection, 'arrowPixels': count}), flush=True)
        assert count > 0, (projection, count)
    with page.expect_download() as download:
        page.locator('#saveBtn').evaluate('button => button.click()')
    png = Path(download.value.path()).read_bytes()
    check('native Save PNG signature', png[:8].hex(), '89504e470d0a1a0a')
    counts = {'native':magenta_pixels(page, b64encode(png).decode()), 'figure':magenta_pixels(page)}
    print('[step3b-arrow-png] ' + json.dumps(counts), flush=True)
    assert all(count > 0 for count in counts.values()), counts


def vector_session_volume(page):
    return page.evaluate('async () => (await VibeMolSession.export()).sources[0].volume')


def vector_product_cases(page):
    load_vector_water(page)
    initial = call_vectors(page, 'list')
    check('vector atomic numbers', initial['atomicNumbers'], [8,1,1])
    atoms = {'name':'forces', 'color':'#22CC44', 'values':[[0.25,0,0], [0,0,0], [0,0.5,0]], 'maxLength':1}
    point = {'name':'point', 'color':'#FF00FF', 'vector':[0,0,1], 'length':10, 'anchor':'point', 'origin':[0,0,0]}
    transition = {'name':'transition', 'color':'#00AAFF', 'vector':[1,0,0], 'scale':2, 'heads':'both'}
    force_set = call_vectors(page, 'setAtoms', {**atoms, 'atomicNumbers':initial['atomicNumbers']})['sets'][0]
    check('longest atom vector uses requested size', [force_set['scale'],force_set['drawnMaxLengthAngstrom']], [2,1])
    call_vectors(page, 'setArrow', point)
    sets = call_vectors(page, 'setArrow', transition)['sets']
    check('free arrow anchors and heads', [(row['anchor'], row['heads']) for row in sets if row['kind']=='arrow'],
          [('point','tip'), ('centerOfMass','both')])
    check_finite_readback(page, 'VibeMolVectors', 'list', {})
    saved = call_vectors(page, 'list')
    for method, params, field in (
        ('setAtoms', {**atoms, 'scale': 1}, 'scale'),
        ('setAtoms', {**atoms, 'values':[[0,0,0]]}, 'values'),
        ('setAtoms', {**atoms, 'atomicNumbers':[1,8,1]}, 'atomicNumbers'),
        ('setArrow', {**point, 'anchor':'centerOfMass'}, 'origin'),
        ('setArrow', {**transition, 'anchor':'point'}, 'origin'),
        ('setArrow', {**transition, 'name':'forces'}, 'name'),
        ('setArrow', {**transition, 'color':'red'}, 'color'),
    ):
        call_vectors(page, method, params, ('invalid-params', field))
    check('invalid vector writes preserve the full state', call_vectors(page, 'list'), saved)
    check_arrow_depth_and_pixels(page)
    old_session = page.evaluate('() => VibeMolSession.exportText()')
    before_volume = vector_session_volume(page)
    check('session import', page.evaluate('text => VibeMolSession.importText(text)', old_session)['ok'], True)
    restored = vector_session_volume(page)
    for field in ('xyzVectors', 'arrows'):
        check(f'session round-trip {field}', restored[field], before_volume[field])

    check('enter Edit', page.evaluate('() => VibeMolEdit.enter().ok'), True)
    page.locator('#canvas').focus()
    page.keyboard.press('ControlOrMeta+z')
    check('vector commands create no Edit history', call_vectors(page, 'list'), saved)

    def translate(selector, delta):
        result = page.evaluate('''({selector,delta}) => {
          const resolution = VibeMolEdit.resolveSelection(selector);
          return resolution.ok ? VibeMolEdit.translate(resolution.value, delta) : resolution;
        }''', {'selector':selector, 'delta':delta})
        check('Edit translate', result['ok'], True)

    translate({'kind':'all'}, [1,2,3])
    shifted = call_vectors(page, 'list')
    check('whole translation moves only the point origin', shifted['sets'], [
        {**row, 'origin':[1,2,3]} if row['name']=='point' else row for row in saved['sets']
    ])
    page.keyboard.press('ControlOrMeta+z')
    check('Undo restores exact vector state', call_vectors(page, 'list'), saved)
    page.keyboard.press('ControlOrMeta+Shift+z')
    check('Redo restores exact translated vector state', call_vectors(page, 'list'), shifted)
    translate({'kind':'labels', 'labels':['O1']}, [0.25,0,0])
    check('partial translation preserves both vector kinds', call_vectors(page, 'list'), shifted)
    call_vectors(page, 'remove', {'name':'forces'})
    check('last per-atom set removes the session field', 'xyzVectors' in vector_session_volume(page), False)
    check('clear vectors and free arrows', call_vectors(page, 'clear')['sets'], [])
    check('empty free-arrow field is omitted', 'arrows' in vector_session_volume(page), False)
    return old_session, before_volume


def old_release_vector_session(browser, old_source, session_text, volume):
    with run_http_server(old_source) as url:
        context = browser.new_context(viewport={'width':1280, 'height':900})
        try:
            page = context.new_page()
            page.goto(url, wait_until='domcontentloaded')
            page.wait_for_function('() => window.VibeMolSession && window.VibeMolAssets')
            check('old session probe version', page.evaluate('() => VibeMolAssets.version'), '0.10.14')
            result = page.evaluate('text => VibeMolSession.importText(text)', session_text)
            check('0.10.14 imports the session', result['ok'] and not result.get('vibrationWarning'), True)
            old_volume = vector_session_volume(page)
            check('0.10.14 retains atom vectors', old_volume['xyzVectors'], volume['xyzVectors'])
            check('0.10.14 omits arrows on session export', 'arrows' in old_volume, False)
        finally:
            context.close()


def step3b_command_cases(page):
    completed, rejected = [], []

    def invoke(command, params=None, *, encode_failure=False, observe_fit=False):
        observed = page.evaluate("""async ({id, params, encodeFailure, observeFit}) => {
          const canvas = document.querySelector('#canvas');
          const camera = () => {
            const live = window.__step3bRenderedCamera;
            const {x, y, z} = VibeMolTesting.getCameraSnapshot().target;
            return {position: live.position.toArray(), target: [x, y, z], up: live.up.toArray(),
                    near: live.near, far: live.far, zoom: live.zoom};
          };
          const before = observeFit ? camera() : null;
          const setFromObject = THREE.Box3.prototype.setFromObject;
          const fitCalls = [];
          try {
            if (encodeFailure) canvas.toDataURL = () => 'data:,';
            if (observeFit) {
              // frameMeasurementAtoms fits the atom group's bounding box once per call.
              THREE.Box3.prototype.setFromObject = function (...args) {
                if (new Error().stack.split('\\n')[2]?.trim().startsWith('at frameMeasurementAtoms (')) {
                  fitCalls.push(performance.now());
                }
                return setFromObject.apply(this, args);
              };
            }
            const result = await VibeMolCommands.run(id, params);
            const buttons = {view:'Display', measure:'Measure', edit:'Edit', calculations:'Calculations'};
            const mode = Object.keys(buttons).find(key =>
              document.querySelector('#mode' + buttons[key] + 'Btn').classList.contains('active'));
            if (!observeFit) return {mode, result};
            const atResponse = camera();
            const responseAt = performance.now();
            const countAtResponse = fitCalls.length;
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            return {mode, result, fit:{before, atResponse, settled:camera(), fitCalls, countAtResponse, responseAt}};
          } finally {
            if (encodeFailure) delete canvas.toDataURL;
            if (observeFit) THREE.Box3.prototype.setFromObject = setFromObject;
          }
        }""", {'id': command, 'params': params or {}, 'encodeFailure': encode_failure, 'observeFit': observe_fit})
        print('[step3b-command-response] ' + json.dumps({'command': command, 'params': params or {},
                                                         **observed}, sort_keys=True), flush=True)
        return observed

    def accepted(command, params=None):
        result = invoke(command, params)['result']
        check(f'{command} success', result.get('ok'), True)
        completed.append(command)
        return result['value']

    def set_mode(mode, *, suppressed=False, observe_fit=False):
        observed = invoke('view.setMode', {'mode': mode}, observe_fit=observe_fit)
        expected = {'ok': True, 'value': {'mode': mode, 'surfacesSuppressed': suppressed}}
        check(f'{mode} mode result', observed['result'], expected)
        check(f'{mode} active toolbar button', observed['mode'], mode)
        if observe_fit:
            fit = observed['fit']
            check(f'{mode} native fit calls at resolution and two frames later',
                  [fit['countAtResponse'], len(fit['fitCalls'])], [1, 1])
            check(f'{mode} native fit ran before resolution', fit['fitCalls'][0] <= fit['responseAt'], True)
            elements = {
                f'{key}.{axis}': [fit[sample][key][index] for sample in ('before', 'atResponse', 'settled')]
                for key in ('position', 'target', 'up') for index, axis in enumerate('xyz')
            }
            elements.update({key: [fit[sample][key] for sample in ('before', 'atResponse', 'settled')]
                             for key in ('near', 'far', 'zoom')})
            for key, (before, at_response, settled) in elements.items():
                print('[step3b-fit-numeric] ' + json.dumps({
                    'mode': mode, 'field': key, 'before': before, 'atResponse': at_response,
                    'settled': settled, 'difference': at_response - settled,
                }), flush=True)
            check(f'{mode} fit changed the camera pose',
                  any(not numbers_close(before, at_response)
                      for key, (before, at_response, _) in elements.items()
                      if key.startswith(('position.', 'target.'))), True)
            check(f'{mode} fits agree at resolution and two frames later',
                  {key: numbers_close(at_response, settled) for key, (_, at_response, settled) in elements.items()},
                  dict.fromkeys(elements, True))
        completed.append('view.setMode')

    def refusal(command, params, code, path=None, *, expected_error=None, encode_failure=False):
        observed = invoke(command, params, encode_failure=encode_failure)
        result = observed['result']
        error = result.get('error', {})
        check(f'{command} error code', [result.get('ok'), error.get('code')], [False, code])
        if path is not None:
            details = error.get('details')
            paths = [item['path'] for item in details] if isinstance(details, list) else [details.get('path')]
            check(f'{command} error field', path in paths, True)
        if expected_error is not None:
            check(f'{command} refusal envelope', result, {'ok': False, 'error': expected_error})
        rejected.append(code)
        return observed['mode']

    set_mode('view')
    refusal('view.setMode', {'mode':'display'}, 'invalid-params', '$.mode')
    refusal('view.setMode', {}, 'invalid-params', '$.mode')
    load_vector_water(page)
    for command in ('orbitals.list','orbitals.show','orbitals.hide','orbitals.configure'):
        refusal(command, {'indices':[1]} if command == 'orbitals.show' else {}, 'not-available', 'source')
    refusal('view.set', {'axis':'z'}, 'invalid-params', '$.axis')
    refusal('view.snapshot', {'width':4097}, 'invalid-params', '$.width')
    refusal('view.snapshot', {'height':0}, 'invalid-params', '$.height')
    refusal('view.snapshot', {'transparent':1}, 'invalid-params', '$.transparent')

    atoms = {'name':'forces','color':'#2200FF','values':[[2,0,0],[0,0,0],[0,0,0]],'maxLength':1}
    arrow = {'name':'dipole','color':'#FF00FF','vector':[0,0,2],'length':4}
    check('vectors.list active atom order', accepted('vectors.list')['atomicNumbers'], [8,1,1])
    check('vectors.setAtoms applied scale', accepted('vectors.setAtoms', atoms)['sets'][0]['scale'], 0.5)
    check('vectors.setArrow applied scale', accepted('vectors.setArrow', arrow)['sets'][1]['scale'], 2)
    before = accepted('vectors.list')
    for command, request, field in (
        ('vectors.setAtoms', {**atoms, 'scale':1}, 'scale'),
        ('vectors.setAtoms', {**atoms, 'atomicNumbers':[1,8,1]}, 'atomicNumbers'),
        ('vectors.setAtoms', {**atoms, 'values':[[0,0,0]]}, 'values'),
        ('vectors.setArrow', {**arrow, 'scale':1}, 'scale'),
        ('vectors.setArrow', {**arrow, 'anchor':'point'}, 'origin'),
        ('vectors.setArrow', {**arrow, 'origin':[0,0,0]}, 'origin'),
        ('vectors.setArrow', {**arrow, 'name':'forces'}, 'name'),
        ('vectors.remove', {'name':''}, 'name'),
    ):
        refusal(command, request, 'invalid-params', field)
    check('vector command failures leave state exact', accepted('vectors.list'), before)
    check('vectors.remove leaves the other kind', [row['name'] for row in accepted('vectors.remove', {'name':'forces'})['sets']], ['dipole'])
    check('vectors.clear applied', accepted('vectors.clear')['sets'], [])

    load_product_fixture(page, CYCLOPROPENE)
    rows = accepted('orbitals.list')['orbitals']
    check('orbitals.list active count', sum(row['class'] == 'active' for row in rows), 3)
    for command, request, field in (
        ('orbitals.show', {'indices':[]}, '$.indices'),
        ('orbitals.show', {'indices':[10,10]}, 'indices'),
        ('orbitals.hide', {'indices':[len(rows)+1]}, 'indices'),
        ('orbitals.configure', {'indices':[10],'iso':0}, 'iso'),
        ('orbitals.configure', {'indices':[10],'opacity':1.1}, '$.opacity'),
    ):
        refusal(command, request, 'invalid-params', field)
    check('orbitals.show completion', accepted('orbitals.show', {'indices':[10,11]})['visibleIndices'], [10,11])
    appearance = accepted('orbitals.configure', {'indices':[10],'iso':0.04,'opacity':0.5})
    check('orbitals.configure readback', appearance['orbitals'], [{'index':10,'iso':0.04,'opacity':0.5}])
    use_camera_probe(page)
    wait_for_presented_state(page, '() => window.__step3bRenderedCamera?.isCamera === true')
    for mode in ('edit', 'calculations', 'measure'):
        set_mode(mode, suppressed=True, observe_fit=mode in ('calculations', 'measure'))
        expected_error = {
            'code': 'not-available',
            'message': f"Orbital surfaces are hidden in {mode.capitalize()} mode; call view.setMode('view') first.",
            'details': {'mode': mode, 'surfacesSuppressed': True},
        }
        before = graph_snapshot(page)
        for command, params in (('orbitals.show', {'indices':[12]}),
                                ('orbitals.configure', {'indices':[10], 'iso':0.09})):
            refusal(command, params, 'not-available', expected_error=expected_error)
            check_atomic_graph(before, graph_snapshot(page))
        check(f'orbital listing in {mode}', accepted('orbitals.list')['orbitals'], rows)
        check(f'targeted orbital hiding in {mode}', accepted('orbitals.hide', {'indices':[11]})['visibleIndices'], [10])
        set_mode('view')
        check('orbitals.show after returning to View', accepted('orbitals.show', {'indices':[10,11]})['visibleIndices'],
              [10,11])
    check('orbitals.hide completion', accepted('orbitals.hide')['visibleIndices'], [])
    view = accepted('view.set', {'projection':'orthographic','fit':True,'axis':'+y'})
    check('view.set readback', view['projection'], 'orthographic')
    png = accepted('view.snapshot', {'width':240,'height':200,'transparent':True})
    check('view.snapshot PNG and dimensions', [b64decode(png['dataBase64'])[:8].hex(), png['width'], png['height']],
          ['89504e470d0a1a0a',240,200])
    refusal('view.snapshot', {'width':32,'height':32}, 'failed', 'snapshot', encode_failure=True)

    page.goto(urljoin(page.url, '?workspaceLab=0'), wait_until='domcontentloaded')
    page.wait_for_function('() => !!window.VibeMolCommands')
    set_mode('view')
    set_mode('measure', suppressed=True)
    set_mode('edit', suppressed=True)
    mode = refusal('view.setMode', {'mode':'calculations'}, 'not-available', 'mode')
    check('legacy Calculations refusal leaves Edit selected', mode, 'edit')

    return {'commands':sorted(set(completed)), 'successes':len(completed), 'rejections':len(rejected),
            'errorCodes':sorted(set(rejected))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--old-source', type=Path)
    args = parser.parse_args()
    with run_http_server(ROOT) as url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1280, 'height': 900})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url, wait_until='domcontentloaded')
        page.wait_for_function('() => window.VibeMolOrbitals && window.VibeMolWorkbench')
        orbitals_and_view_cases(page)
        session_text, volume = vector_product_cases(page)
        check('page errors', errors, [])
        context.close()
        if args.old_source:
            old_release_vector_session(browser, args.old_source, session_text, volume)
        browser.close()


if __name__ == '__main__':
    main()
