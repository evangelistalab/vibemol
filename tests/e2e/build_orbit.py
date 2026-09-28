#!/usr/bin/env python3
"""Build right gestures orbit without selecting, editing, or placing payloads."""
import premerge as p
import build_bonds as bonds
import transform_selection as transform
from edit_tool import arm, close_build
from surface_shadows import settings, settle


def source():
    marker = 'window.VibeMolTesting = Object.freeze({'
    return transform.source().replace(marker, '''window.__buildOrbitProbe = () => ({
      ...__transformSelectionProbe(), build:getEditToolState().build, payload:getCurrentBuildPayload(),
      placement:moleculePlaceActive ? {position:moleculePlacePosition.toArray(), quaternion:moleculePlaceQuaternion.toArray()} : null,
      fuse:!!addFusePreviewState, grow:addGrowActive
    });
    ''' + marker)


def state(page):
    return page.evaluate('()=>__buildOrbitProbe()')


def orbit_only(page, point, shift=False):
    before = state(page)
    transform.click(page, point, 'right')
    after = state(page)
    assert max(abs(a-b) for a,b in zip(before['camera'], after['camera'])) < 1e-8
    for key in ['selection', 'center', 'context', 'atoms', 'bonds', 'target', 'build', 'payload', 'placement', 'fuse', 'grow']:
        assert before[key] == after[key], ('click', key, before, after)
    if shift:page.keyboard.down('Shift')
    page.mouse.move(point['clientX'], point['clientY']);page.mouse.down(button='right')
    page.mouse.move(point['clientX']+48, point['clientY']+27, steps=6)
    page.mouse.up(button='right')
    if shift:page.keyboard.up('Shift')
    settle(page);after = state(page)
    assert max(abs(a-b) for a,b in zip(before['quaternion'], after['quaternion'])) > 1e-3, 'No orbit'
    for key in ['selection', 'center', 'context', 'atoms', 'bonds', 'target', 'build', 'payload', 'placement', 'fuse', 'grow']:
        assert before[key] == after[key], ('drag', key, before, after)


def run(page, url):
    page.route('**/assets/app/js/app.js*', lambda route:route.fulfill(body=source(),content_type='text/javascript'))
    page.goto(url+'?appearanceStudy=1');page.wait_for_function('()=>window.VibeMolWorkbench')
    for name, kind in [('carbon', 'atom'), ('phenyl', 'fragment'), ('benzene', 'molecule')]:
        bonds.load(page)
        page.locator('#editTransformToolBtn').click()
        transform.click(page, transform.atom_point(page, 0))
        arm(page,name);close_build(page)
        assert state(page)['selection'] == [0] and state(page)['payload']['kind'] == kind
        payload = state(page)['payload']
        page.locator('#editTransformToolBtn').click()
        assert not state(page)['build'] and state(page)['payload'] == payload
        transform.click(page, transform.atom_point(page, 0))
        if kind != 'molecule':
            page.locator('#editSelectionAddFragmentCueButton').click()
        else:
            page.locator('#editAdaptiveAddAtomBtn').click()
            close_build(page)
        assert state(page)['build'] and state(page)['payload'] == payload
        for target in ['atom', 'bond', 'void']:
            settings(page, {'view.camera.x':0, 'view.camera.y':0, 'view.camera.z':10,
                            'view.target.x':0, 'view.target.y':0, 'view.target.z':0})
            atom = page.evaluate('()=>VibeMolTesting.projectActiveAtomToClient(0)')
            point = {'clientX':atom['x'], 'clientY':atom['y']} if target=='atom' else (
                bonds.point(page,'center') if target=='bond' else {'clientX':1150, 'clientY':250})
            orbit_only(page, point, shift=target=='void')
        print(f'[build orbit] {kind}: retained payload, inert right click, right-drag and Shift-right-drag over atoms/bonds/void passed',flush=True)
    # An active molecule preview must neither rotate itself nor be confirmed by
    # a camera gesture. Only the user's left placement click may commit it.
    point = {'clientX':1000, 'clientY':280}
    transform.click(page, point)
    assert state(page)['placement'], 'Expected provisional molecule'
    orbit_only(page, point)
    page.screenshot(path=str(p.ARTIFACTS/'build-orbit-molecule-preview.png'))
    page.locator('#canvas').focus();page.keyboard.press('Escape');settle(page)
    assert state(page)['build'] and state(page)['placement'] is None
    print('[build orbit] camera gestures preserve the active molecule preview; Escape still cancels it',flush=True)


def main():
    with p.run_http_server(p.ROOT) as url, p.sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
        page=browser.new_page(viewport={'width':1440,'height':1000});errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.dismiss())
        try:
            run(page,url);assert not errors,errors
        except Exception:
            p.write_failure_artifacts(page,p.ARTIFACTS,'build-orbit-failure',errors,[]);raise
        finally:browser.close()


if __name__=='__main__':main()
