"""Direct browser contracts for Step 3b product APIs."""
from hashlib import sha256
import json
import math
from pathlib import Path
import re

from playwright.sync_api import sync_playwright
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


def main():
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
        check('page errors', errors, [])
        context.close()
        browser.close()


if __name__ == '__main__':
    main()
