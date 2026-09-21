#!/usr/bin/env python3
"""Frontmost molecular picking, bounded work, and cheap Edit mode transitions."""
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
        ('pickMoleculeHitUncached(e)', 'queries'),
    ]:
        marker = f'function {signature} {{'
        assert source.count(marker) == 1, marker
        source = source.replace(marker, marker + f' if(window.__pickCounts) __pickCounts.{key}++;')
    marker = 'window.VibeMolTesting = Object.freeze({'
    assert source.count(marker) == 1
    return source.replace(marker, '''window.__editProbe = {
      reset() { window.__pickCounts = {records:0, segments:0, queries:0}; },
      rebuild() { rebuildScene({preserveView:true}); },
      query(point, fresh=false) {
        if(fresh) moleculePickCache.clear();
        const hit=pickBondHit(point);
        return hit ? {i:hit.endpointAIndex,j:hit.endpointBIndex,section:hit.section,t:hit.t} : null;
      },
      geometryQuery(point) {
        setRaycasterFromEvent(point);
        const hit=pickBondHitUncached(point) || pickBondHitFromDisplayedSpan(point);
        return hit ? {i:hit.endpointAIndex,j:hit.endpointBIndex,section:hit.section,t:hit.t} : null;
      },
      overlapPoints() {
        contentGroup.updateMatrixWorld(true);
        const mesh=bondGroup.children.find(o=>o.isInstancedMesh);
        if(!mesh) return {bond:this.points()[1]};
        const matrix=new THREE.Matrix4(), centers=[], gaps=[];
        let previousEnd=null;
        for(let i=0;i<mesh.count;i++) {
          mesh.getMatrixAt(i,matrix); matrix.premultiply(mesh.matrixWorld);
          centers.push(new THREE.Vector3().setFromMatrixPosition(matrix));
          const start=new THREE.Vector3(0,-0.5,0).applyMatrix4(matrix);
          if(previousEnd) gaps.push(previousEnd.add(start).multiplyScalar(0.5));
          previousEnd=new THREE.Vector3(0,0.5,0).applyMatrix4(matrix);
        }
        const centerX=mesh.matrixWorld.elements[12];
        const closest=points=>points.sort((a,b)=>Math.abs(a.x-centerX)-Math.abs(b.x-centerX))[0];
        const project=world=>{const p=projectWorldToClient(world);return {clientX:p.x,clientY:p.y};};
        return {bond:project(closest(centers)),gap:project(closest(gaps))};
      },
      hover() {
        const hit=editGestureController.getHoverBondHit();
        return {atom:hoverAtomMesh?.userData.index ?? -1,
          bond:hit ? [hit.endpointAIndex,hit.endpointBIndex] : null};
      },
      setAtomDepth(index,z) {
        const vol=volumes[currentIndex].vol, frame=vol.atoms.flatMap(a=>[a.x,a.y,a.z]);
        frame[index*3+2]=z; applyAtomCoordinateFrame(vol,frame,vol.atoms.length);
      },
      identity() { return {atoms:atomGroup.uuid, bonds:bondGroup.uuid, revision:bondGroup.userData.pickRevision||0}; },
      points() {
        contentGroup.updateMatrixWorld(true);
        return bondGroup.children.filter(c=>Number.isInteger(c.userData.i)).flatMap(carrier=>{
          const segment=getBondCarrierDisplayedSegment(carrier,volumes[currentIndex].vol);
          if(!segment) return [];
          return [0.15,0.5,0.85].map(t=>{
            let world=segment.start.clone().lerp(segment.end,t).applyMatrix4(bondGroup.matrixWorld);
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
    work = counts(page)
    assert work['queries'] == 1 and work['records'] == 0 and work['segments'] <= 5400, work
    for _ in range(10):
        assert query(page, point) == hit
    assert counts(page)['queries'] == 1
    # A miss must still keep the full-span tolerance path linear in bond count.
    page.evaluate('()=>__editProbe.reset()')
    assert query(page, {'clientX': 350, 'clientY': 120}, fresh=True) is None
    assert counts(page) == {'queries': 1, 'records': 0, 'segments': 5400}, counts(page)
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
            # Validate section math independently of atom occlusion at the caps.
            hits = [page.evaluate('point=>__editProbe.geometryQuery(point)', point) for point in points]
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


def occlusion(page):
    def picked(point):
        return page.evaluate('p=>VibeMolTesting.pickEditHitAtClient(p.clientX,p.clientY)', point)

    def hover(point):
        page.mouse.move(point['clientX'], point['clientY'])
        settle(page)
        return page.evaluate('()=>__editProbe.hover()')

    for style, bond_style, order in [('basic', 'metal-dative', 1), ('basic', 'metal-strong', 1),
                                     ('classic', 'covalent', 1), ('kit', 'covalent', 2)]:
        for projection in ['orthographic', 'perspective']:
            mode(page, 'Display')
            payload = json.loads(build_fixture_structure())
            atoms = payload['volume']['atoms']
            atoms[0].update(Z=11 if bond_style.startswith('metal') else 6, x=-2, z=2)
            atoms[1].update(Z=17 if bond_style.startswith('metal') else 6, x=2, z=2)
            atoms.append({'id': 'rear', 'Z': 11, 'x': 0, 'y': 0, 'z': 0})
            payload['volume']['natoms'] = 3
            payload['volume']['bonds'][0].update(style=bond_style, order=order, origin='explicit')
            page.evaluate('v=>VibeMolStructure.importFromText(JSON.stringify(v),"occlusion")', payload)
            page.evaluate('style=>VibeMolAppearanceLooks.apply(style)', style)
            settings(page, {'view.projection': projection, 'view.camera.x': 0, 'view.camera.y': 0,
                            'view.camera.z': 10, 'view.target.x': 0, 'view.target.y': 0, 'view.target.z': 0,
                            'view.shift.x': 0, 'view.shift.y': 0, 'view.shift.z': 0,
                            'molecule.feature.shadows': False})
            mode(page, 'Edit')
            points = page.evaluate('()=>__editProbe.overlapPoints()')
            point = points['bond']
            assert picked(point) == {'atomIndex': -1, 'bondSection': 'center'}, (style, projection, points, picked(point))
            assert hover(point) == {'atom': -1, 'bond': [0, 1]}, (style, projection, hover(point))
            if 'gap' in points:
                # The hover overlay must not fill the dash gap for picking. The
                # recently hovered bond also must not steal the subsequent click.
                assert picked(points['gap']) == {'atomIndex': 2, 'bondSection': ''}
                assert hover(points['gap']) == {'atom': 2, 'bond': None}
                page.mouse.click(points['gap']['clientX'], points['gap']['clientY'], button='right')
                assert page.evaluate('()=>VibeMolTesting.getEditSelectionIndices()') == [2]
                hover(point)
            # A selected rear atom's drag/context tolerance cannot override the
            # actual foreground bond. Exercise the real right-click handler.
            page.evaluate('()=>VibeMolTesting.setEditSelectionIndices([2])')
            assert hover(point) == {'atom': -1, 'bond': [0, 1]}
            page.mouse.click(point['clientX'], point['clientY'], button='right')
            cue = page.evaluate('()=>VibeMolTesting.getBondCenterCueState()')
            assert cue['visible'] and cue['style'] == bond_style, (style, projection, cue)
            assert 2 not in page.evaluate('()=>VibeMolTesting.getEditSelectionIndices()')
            page.keyboard.press('Escape')
            # Move the rear atom in front without moving the pointer: depth and
            # cached hover results must update after a live coordinate change.
            page.evaluate('()=>__editProbe.setAtomDepth(2,3)')
            assert picked(point) == {'atomIndex': 2, 'bondSection': ''}, (style, projection, picked(point))
            assert hover(point) == {'atom': 2, 'bond': None}
            page.mouse.click(point['clientX'], point['clientY'], button='right')
            assert page.evaluate('()=>VibeMolTesting.getEditSelectionIndices()') == [2]
            page.evaluate('()=>{VibeMolTesting.setEditSelectionIndices([]);__editProbe.setAtomDepth(2,0);}')
            settings(page, {'view.shift.x': 0.8, 'view.shift.y': 0.3, 'view.shift.z': 0.25})
            shifted = page.evaluate('()=>__editProbe.overlapPoints().bond')
            assert picked(shifted) == {'atomIndex': -1, 'bondSection': 'center'}, (style, projection, picked(shifted))

    # Two continuous bonds cross in projection. Their endpoint atoms do not
    # cover the crossing, so bond-vs-bond depth decides the target.
    mode(page, 'Display')
    payload['volume']['atoms'] = [
        {'id': str(i), 'Z': 6, 'x': x, 'y': y, 'z': z}
        for i, (x, y, z) in enumerate([(-2, 0, 2), (2, 0, 2), (0, -2, 0), (0, 2, 0)])]
    payload['volume']['natoms'] = 4
    payload['volume']['bonds'] = [
        {'id': str(i), 'a': str(i), 'b': str(i+1), 'order': 1, 'kind': 'normal', 'origin': 'explicit'}
        for i in [0, 2]]
    page.evaluate('v=>VibeMolStructure.importFromText(JSON.stringify(v),"crossing")', payload)
    page.evaluate('()=>VibeMolAppearanceLooks.apply("basic")')
    settings(page, {'view.camera.x': 0, 'view.camera.y': 0, 'view.camera.z': 10,
                    'view.shift.x': 0, 'view.shift.y': 0, 'view.shift.z': 0,
                    'view.target.x': 0, 'view.target.y': 0, 'view.target.z': 0, 'molecule.feature.shadows': False})
    mode(page, 'Edit')
    point = page.evaluate('()=>__editProbe.overlapPoints().bond')
    assert query(page, point)['i'] == 0
    page.evaluate('()=>{__editProbe.setAtomDepth(2,3);__editProbe.setAtomDepth(3,3);}')
    assert query(page, point)['i'] == 2
    print('[picking] frontmost atoms/bonds, real dash gaps, selected-atom fallbacks, crossing bonds, and both projections: passed', flush=True)


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
        # Box visibility is now a layer-only update, not a full scene rebuild.
        mode(page, 'Edit'); page.evaluate('()=>__editProbe.rebuild()')
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
            occlusion(page)
            orbital_modes(page)
            assert not errors, errors
        except Exception:
            p.write_failure_artifacts(page, p.ARTIFACTS, 'edit-picking', errors, []); raise
        finally:
            browser.close()


if __name__ == '__main__':
    main()
