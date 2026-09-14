#!/usr/bin/env python3
"""Bounded bond picking, cache invalidation, and cheap Edit mode transitions."""
import json
import os
import sys
import premerge as p
from smoke import build_fixture_structure
from surface_shadows import settings, settle


def instrumented_source():
    # Count real work without replacing the picking/geometry algorithms. Private
    # probes stay in the intercepted test response, outside the shipped API.
    source = (p.ROOT / 'assets/app/js/app.js').read_text()
    for signature, key in [
        ('buildBondAtomRecords(vol, options = {})', 'records'),
        ('getBondCarrierInteractionSegment(carrier, vol)', 'segments'),
        ('pickBondHitUncached(e)', 'queries'),
    ]:
        marker = f'function {signature} {{'
        assert source.count(marker) == 1, marker
        source = source.replace(marker, marker + f' if(window.__pickCounts) __pickCounts.{key}++;')
    marker = 'window.VibeMolTesting = Object.freeze({'
    assert source.count(marker) == 1
    return source.replace(marker, '''window.__editProbe = {
      reset() { window.__pickCounts = {records:0, segments:0, queries:0}; },
      query(point, fresh=false) {
        if(fresh) bondPickCache.clear();
        const hit=pickBondHit(point);
        return hit ? {i:hit.endpointAIndex,j:hit.endpointBIndex,section:hit.section,t:hit.t} : null;
      },
      identity() { return {atoms:atomGroup.uuid, bonds:bondGroup.uuid, revision:bondGroup.userData.pickRevision||0}; },
      points() {
        contentGroup.updateMatrixWorld(true);
        return bondGroup.children.filter(c=>Number.isInteger(c.userData.i)).flatMap(carrier=>{
          const segment=getBondCarrierDisplayedSegment(carrier,volumes[currentIndex].vol);
          if(!segment) return [];
          return [0.15,0.5,0.85].map(t=>{
            let world=segment.start.clone().lerp(segment.end,t);
            if(carrier.userData.connectorStyle==='kitCurved') {
              // Sample the actual curved shaft's centerline, not its chord.
              const shaft=carrier.children[0], pos=shaft.geometry.attributes.position, normal=shaft.geometry.attributes.normal;
              const index=Math.round((pos.count-1)*t);
              world=new THREE.Vector3().fromBufferAttribute(pos,index)
                .addScaledVector(new THREE.Vector3().fromBufferAttribute(normal,index),-carrier.userData.connectorCenterRadius)
                .applyMatrix4(shaft.matrixWorld);
            }
            const p=projectWorldToClient(world);
            return {clientX:p.x,clientY:p.y};
          });
        });
      },
      moveAtom() {
        const vol=volumes[currentIndex].vol;
        const frame=vol.atoms.flatMap(a=>[a.x,a.y,a.z]); frame[4]+=0.4;
        applyAtomCoordinateFrame(vol,frame,vol.atoms.length);
      },
      rotateCamera() { camera.position.applyAxisAngle(new THREE.Vector3(0,1,0),0.2); camera.lookAt(controls.target); },
    };
    ''' + marker)


def mode(page, name):
    page.locator('#mode' + name + 'Btn').evaluate('el=>el.click()')
    settle(page)


def query(page, point, fresh=False):
    return page.evaluate('({point,fresh})=>__editProbe.query(point,fresh)', {'point': point, 'fresh': fresh})


def counts(page):
    return page.evaluate('()=>({...__pickCounts})')


def compare_fresh(page, point):
    # Compare within one turn: OrbitControls may refine the camera between frames.
    result = page.evaluate('''point=>{
        const hit=__editProbe.query(point), counts={...__pickCounts};
        return {hit,counts,fresh:__editProbe.query(point,true)};
    }''', point)
    assert result['hit'] == result['fresh'], result
    return result


def invalidates(page, point, action):
    query(page, point)
    page.evaluate('()=>__editProbe.reset()')
    action()
    assert compare_fresh(page, point)['counts']['queries'] >= 1, 'Changed geometry/view reused a stale hit'


def slab(page):
    rows = [f"{'Na' if (i+j+k)%2==0 else 'Cl'} {(i-9.5)*2.82} {(j-9.5)*2.82} {(k-2)*2.82}"
            for i in range(20) for j in range(20) for k in range(5)]
    # The CPU work-count regression also runs on software-rendered CI. Shadow
    # quality/timing is covered by surface_shadows.py and the hardware benchmark.
    settings(page, {'molecule.feature.shadows': False})
    assert p.load(page, [{'name': 'NaCl.xyz', 'text': '\n'.join(['2000', 'NaCl slab'] + rows)}])['ok']
    assert page.evaluate('()=>VibeMolStructure.exportActive().volume.bonds.length') == 5400
    identity = page.evaluate('()=>__editProbe.identity()')
    for name in ['Edit', 'Measure', 'Display', 'Edit']:
        mode(page, name)
        assert page.evaluate('()=>__editProbe.identity()') == identity
        assert page.locator('#coordsContent tr[data-atom-index]').count() == 0
    point = {'clientX': 750, 'clientY': 450}
    page.evaluate('()=>__editProbe.reset()')
    hit = query(page, point, fresh=True)
    assert hit
    assert counts(page) == {'queries': 1, 'records': 0, 'segments': 5400}, counts(page)
    for _ in range(10):
        assert query(page, point) == hit
    assert counts(page)['queries'] == 1
    # Exercise the real pointer handlers and the halo's stationary-frame refresh.
    page.mouse.move(point['clientX'], point['clientY'])
    settle(page)
    page.evaluate('()=>__editProbe.reset()')
    for _ in range(10):
        settle(page)
    assert counts(page) == {'queries': 0, 'records': 0, 'segments': 0}, counts(page)
    page.mouse.move(5, 5)
    invalidates(page, point, lambda: page.evaluate('()=>__editProbe.rotateCamera()'))
    invalidates(page, point, lambda: page.set_viewport_size({'width': 1100, 'height': 850}))
    invalidates(page, point, lambda: mode(page, 'Measure'))
    mode(page, 'Edit')
    page.evaluate('()=>VibeMolWorkbench.open("coordsPanel")')
    assert page.locator('#coordsContent tr[data-atom-index]').count() == 2000
    assert page.locator('#coordsContent [data-edit-field]').count() > 0
    page.locator('#coordsPanelClose').evaluate('el=>el.click()')
    print('[picking] 2,000 atoms/5,400 bonds: no full atom records, shared idle hits, view invalidation and lazy Coordinates: passed', flush=True)


def multiple_bonds(page):
    mode(page, 'Display')
    for order in [2, 3]:
        payload = json.loads(build_fixture_structure())
        payload['volume']['bonds'][0]['order'] = order
        page.evaluate('value=>VibeMolStructure.importFromText(JSON.stringify(value),"multiple-bond")', payload)
        for style in ['basic', 'classic', 'kit']:
            page.evaluate('style=>VibeMolAppearanceLooks.apply(style)', style)
            settings(page, {'view.camera.x': 0, 'view.camera.y': 0, 'view.camera.z': 6})
            mode(page, 'Edit')
            points = page.evaluate('()=>__editProbe.points()')
            assert len(points) >= order * 3, (style, order, points)
            hits = [query(page, point, fresh=True) for point in points]
            assert all(hit and {hit['i'], hit['j']} == {0, 1} for hit in hits), (style, order, hits)
            assert {'nearA', 'center', 'nearB'}.issubset({hit['section'] for hit in hits}), (style, hits)
            before = page.evaluate('()=>__editProbe.identity()')
            invalidates(page, points[len(points)//2], lambda: page.evaluate('()=>__editProbe.moveAtom()'))
            after = page.evaluate('()=>__editProbe.identity()')
            if style != 'kit':
                assert before['bonds'] == after['bonds'] and after['revision'] > before['revision']
            for point in page.evaluate('()=>__editProbe.points()'):
                compare_fresh(page, point)
    print('[picking] double/triple Basic, Classic and Kit hit regions and live coordinate invalidation: passed', flush=True)


def orbital_modes(page):
    mode(page, 'Display')
    assert p.load(page, [{'name': 'field.cube', 'text': p.cube(0)}])['ok']
    settings(page, {'surface.autoIsoEnabled': False, 'surface.iso': 0.03})
    for render_mode, cloud_type in [('surface', 'cubes'), ('cloud', 'cubes'), ('cloud', 'points')]:
        settings(page, {'render.mode': render_mode, 'render.cloudType': cloud_type})
        settle(page)
        snapshot = 'getSurfaceMaterialSnapshot' if render_mode == 'surface' else 'getCloudMaterialSnapshot'
        before = page.evaluate(f'()=>JSON.parse(JSON.stringify(VibeMolTesting.{snapshot}()))')
        assert before and all(m['visible'] for m in before)
        mode(page, 'Edit')
        hidden = page.evaluate(f'()=>JSON.parse(JSON.stringify(VibeMolTesting.{snapshot}()))')
        assert hidden and all(not m['visible'] for m in hidden)
        mode(page, 'Display')
        after = page.evaluate(f'()=>JSON.parse(JSON.stringify(VibeMolTesting.{snapshot}()))')
        assert after == before, (render_mode, cloud_type, before, after)
        # A real rebuild in Edit drops hidden graphics; leaving must recreate them.
        mode(page, 'Edit'); p.redraw(page)
        assert page.evaluate(f'()=>JSON.parse(JSON.stringify(VibeMolTesting.{snapshot}()))') == []
        mode(page, 'Display')
        restored = page.evaluate(f'()=>JSON.parse(JSON.stringify(VibeMolTesting.{snapshot}()))')
        assert len(restored) == len(before) and all(m['visible'] for m in restored)
    print('[picking] surfaces and cube/point clouds retained on mode switches, restored after an Edit rebuild: passed', flush=True)


def main():
    with p.run_http_server(p.ROOT) as url, p.sync_playwright() as pw:
        angle = os.environ.get('VIBEMOL_TEST_ANGLE', 'metal' if sys.platform == 'darwin' else 'swiftshader')
        browser = pw.chromium.launch(headless=True, args=['--use-angle=' + angle])
        page = browser.new_page(viewport={'width': 1200, 'height': 900}, device_scale_factor=1)
        page.route('**/assets/app/js/app.js', lambda route: route.fulfill(body=instrumented_source(), content_type='application/javascript'))
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('dialog', lambda dialog: dialog.dismiss())
        try:
            page.goto(url + '?workspaceLab=1'); page.wait_for_function('()=>window.__editProbe')
            slab(page)
            multiple_bonds(page)
            orbital_modes(page)
            assert not errors, errors
        except Exception:
            p.write_failure_artifacts(page, p.ARTIFACTS, 'edit-picking', errors, []); raise
        finally:
            browser.close()


if __name__ == '__main__':
    main()
