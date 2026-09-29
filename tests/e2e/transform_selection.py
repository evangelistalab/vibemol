#!/usr/bin/env python3
"""Transform uses left selection and right-drag camera orbit, over every target."""
import premerge as p
import build_bonds as bonds
from surface_shadows import settings, settle


def source():
    marker = 'window.VibeMolTesting = Object.freeze({'
    return bonds.source().replace(marker, '''window.__transformClickPoint = ({point,section,index}) => {
      for (const [dx,dy] of [[0,0],[-35,0],[35,0],[-20,16],[20,-16]]) {
        const e={clientX:point.clientX+dx,clientY:point.clientY+dy};
        if (editGizmos.pickMoveHit(e) || editGizmos.pickRotateHit(e)) continue;
        if (section ? pickBondHit(e)?.section===section : pickAtom(e)?.userData.index===index) return e;
      }
      return null;
    };
    window.__transformSelectionProbe = () => ({
      selection:getEditAtomSelection(), center:bondCenterSelectionState,
      context:getCurrentTransformSelectionContext(),
      camera:camera.position.toArray(), quaternion:camera.quaternion.toArray(), target:controls.target.toArray(),
      atoms:volumes[currentIndex].vol.atoms.map(a=>[a.x,a.y,a.z]),
      bonds:JSON.parse(JSON.stringify(volumes[currentIndex].vol.bonds))
    });
    ''' + marker)


def state(page):
    return page.evaluate('()=>__transformSelectionProbe()')


def click(page, pos, button='left'):
    assert pos, 'Target not visible'
    page.mouse.click(pos['clientX'], pos['clientY'], button=button)
    settle(page)


def atom_point(page, index):
    pos = page.evaluate('i=>VibeMolTesting.projectActiveAtomToClient(i)', index)
    return page.evaluate('p=>__transformClickPoint(p)', {'point': {'clientX': pos['x'], 'clientY': pos['y']}, 'index': index})


def bond_point(page, section):
    return page.evaluate('p=>__transformClickPoint(p)', {'point': bonds.point(page, section), 'section': section})


def clear(page):
    page.locator('#canvas').focus();page.keyboard.press('Escape');settle(page)


def run(page, url):
    page.route('**/assets/app/js/app.js*', lambda route: route.fulfill(body=source(), content_type='text/javascript'))
    page.goto(url+'?appearanceStudy=1');page.wait_for_function('()=>window.VibeMolWorkbench')
    for projection in ['orthographic', 'perspective']:
        bonds.load(page)
        settings(page, {'view.projection': projection})
        page.locator('#editTransformToolBtn').click();settle(page)
        initial = state(page)
        # Switching sides, then center, then back to an end must all work.
        for section in ['nearA', 'nearB', 'center', 'nearA', 'center']:
            click(page, bond_point(page, section))
            selected = state(page)
            if section == 'center':
                assert selected['center'] and not selected['selection'], selected
            else:
                assert not selected['center'] and selected['context']['type'] == 'bond', selected
                assert selected['selection'] == [0 if section == 'nearA' else 1], selected
            assert selected['atoms'] == initial['atoms'] and selected['bonds'] == initial['bonds']
        # Atom clicks replace bond scope; Shift-click adds/removes atoms.
        click(page, atom_point(page, 0));assert state(page)['selection'] == [0]
        assert not state(page)['center'] and not state(page)['context']
        page.keyboard.down('Shift')
        click(page, atom_point(page, 1));assert state(page)['selection'] == [0, 1]
        click(page, atom_point(page, 1));assert state(page)['selection'] == [0]
        page.keyboard.up('Shift')
        # A selected bond-side atom can still be selected individually by click.
        clear(page);click(page, bond_point(page, 'nearB'))
        click(page, atom_point(page, 1));assert state(page)['selection'] == [1]
        assert not state(page)['context']
        clear(page);click(page, bond_point(page, 'center'))
        # Right click/drag never selects, deletes, changes order, or moves atoms.
        for target in ['atom', 'nearA', 'center', 'nearB', 'void']:
            settings(page, {'view.camera.x': 0, 'view.camera.y': 0, 'view.camera.z': 10,
                            'view.target.x': 0, 'view.target.y': 0, 'view.target.z': 0})
            pos = atom_point(page, 0) if target == 'atom' else (
                {'clientX': 1150, 'clientY': 250} if target == 'void' else bond_point(page, target))
            before = state(page)
            click(page, pos, 'right')
            after = state(page)
            assert max(abs(a-b) for a,b in zip(before['camera'], after['camera'])) < 1e-8
            for key in ['selection', 'center', 'context', 'atoms', 'bonds', 'target']:
                assert before[key] == after[key], (target, key, before, after)
            page.mouse.move(pos['clientX'], pos['clientY']);page.mouse.down(button='right')
            page.mouse.move(pos['clientX']+45, pos['clientY']+25, steps=6)
            page.mouse.up(button='right');settle(page)
            after = state(page)
            assert before['quaternion'] != after['quaternion'], (target, 'No rotation')
            for key in ['selection', 'center', 'context', 'atoms', 'bonds', 'target']:
                assert before[key] == after[key], (target, key, before, after)
        page.screenshot(path=str(p.ARTIFACTS/f'transform-selection-{projection}.png'))
        clear(page);assert not state(page)['selection'] and not state(page)['center']
    print('[transform] atom/center/end selection, Shift toggles, scope switching, right orbit and geometry preservation: passed', flush=True)


def main():
    with p.run_http_server(p.ROOT) as url, p.sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=['--use-angle=swiftshader'])
        page = browser.new_page(viewport={'width': 1440, 'height': 1000});errors=[]
        page.on('pageerror', lambda e: errors.append(str(e)));page.on('dialog', lambda d: d.dismiss())
        try:
            run(page, url);assert not errors, errors
        except Exception:
            p.write_failure_artifacts(page, p.ARTIFACTS, 'transform-selection-failure', errors, []);raise
        finally:
            browser.close()


if __name__ == '__main__':main()
