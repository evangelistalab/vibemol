#!/usr/bin/env python3
"""Armed Edit tool, Escape ladder, keyboard semantics and visual contrast fixtures."""
import json
import premerge as p
from helpers import wait_for_presented_state
from checkpoint_contract import require_phase_counts
from metal_popover import metal_popover_regression
from smoke import find_atom_click_point


def state(page):
    return page.evaluate('()=>VibeMolTesting.getEditBuildState()')


def arm(page, name='carbon'):
    page.locator('#canvas').focus();page.keyboard.press('/')
    page.locator('#editBuildSearch').fill(name);page.locator('#editBuildSearch').press('Enter')
    page.wait_for_function('()=>document.getElementById("editAdaptiveAddAtomBtn").getAttribute("aria-checked")==="true"')


def tool(page, name):
    page.wait_for_function('(name)=>document.getElementById(name).getAttribute("aria-checked")==="true"',
                           arg='editTransformToolBtn' if name=='transform' else 'editAdaptiveAddAtomBtn')
    radios=page.locator('#editToolStrip [role="radio"]')
    assert radios.count()==2
    assert radios.evaluate_all('(els)=>els.filter(e=>e.tabIndex===0).length')==1
    assert radios.evaluate_all('(els)=>els.filter(e=>e.getAttribute("aria-checked")==="true").length')==1
    assert page.locator('#editToolStrip [aria-pressed]').count()==0
    assert page.locator('#editToolStrip').get_attribute('aria-label')=='Edit tool'
    assert not page.evaluate('()=>document.getElementById("editAdaptiveAddAtomMeta")?.textContent.trim()')


def close_build(page):
    page.locator('#editAdaptiveAddAtomPopover').get_by_role('button',name='Close Build',exact=True).click()


def editing_transactions(page):
    completed=0

    def check(name, actual, expected):
        nonlocal completed
        check_edit_value(name,actual,expected)
        completed+=1

    page.locator('#modeDisplayBtn').click()
    ethanol=(p.ROOT/'assets/fragments/ethanol.xyz').read_text()
    check('load ethanol',p.load(page,[{'name':'ethanol.xyz','text':ethanol}])['ok'],True)
    original=active_atoms(page)
    scene_id=p.snapshot(page)['focusedSceneId']
    page.locator('#modeEditBtn').click()
    page.locator('#newFileBtn').click()
    tool(page,'build')
    close_build(page)
    canvas=page.locator('#canvas')
    box=canvas.bounding_box()
    x,y=box['x']+.74*box['width'],box['y']+.35*box['height']
    page.mouse.click(x,y)
    page.wait_for_function('()=>VibeMolStructure.exportActive().volume.atoms.length>0')
    camera=page.evaluate('()=>VibeMolTesting.getCameraSnapshot()')
    first_atom=active_atoms(page)[0]
    check('first-atom fit',all(abs(camera['target'][axis]-first_atom[axis])<1e-8 for axis in 'xyz'),True)
    first=page.evaluate('()=>VibeMolTesting.projectActiveAtomToClient(0)')
    center={'x':box['x']+box['width']/2,'y':box['y']+box['height']/2}
    check('first atom centered',first['visible'] and abs(first['x']-center['x'])<1
                     and abs(first['y']-center['y'])<1,True)
    row=page.locator(f'.vm-outliner-row[data-id="{scene_id}"]')
    row.locator('.vm-outliner-row__name').click()
    graph=p.snapshot(page)
    check('hidden target switched',graph['focusedSceneId'],scene_id)
    check('visible edit target',[scene['id'] for scene in graph['scenes'] if scene['visible']],[scene_id])
    check('scene switch preserves ethanol',active_atoms(page),original)
    tool(page,'transform')
    oxygen=next(i for i,atom in enumerate(original) if atom['Z']==8)
    x,y=find_atom_click_point(page,oxygen)
    page.mouse.click(x,y)
    check('select oxygen in revealed scene',page.evaluate('()=>VibeMolTesting.getEditSelectionCount()'),1)
    row.locator('[aria-label="Hide"]').click()
    canvas.focus()
    page.mouse.click(x,y)
    page.keyboard.press('Delete')
    check('hidden atom immune to click and Delete',active_atoms(page),original)
    row.locator('.vm-outliner-row__name').click()

    for cancel in (False,True):
        page.locator('#modeDisplayBtn').click()
        check('load drag fixture',p.load(page,[{'name':'oxygen.xyz','text':'1\noxygen\nO 0 0 0\n'}])['ok'],True)
        page.locator('#modeEditBtn').click()
        tool(page,'transform')
        original=active_atoms(page)
        oxygen=0
        canvas.focus()
        check('start drag with empty selection',page.evaluate('()=>VibeMolTesting.getEditSelectionCount()'),0)
        x,y=find_atom_click_point(page,oxygen)
        hit=page.evaluate('([x,y])=>document.elementFromPoint(x,y)?.id',[x,y])
        check('drag starts on canvas',hit,'canvas')
        page.keyboard.down('Alt')
        page.mouse.move(x,y)
        page.mouse.down()
        page.mouse.move(x+46,y+22,steps=5)
        check('drag state after move',page.evaluate('()=>VibeMolTesting.getActiveTransformGesture().dragActive'),True)
        during=active_atoms(page)
        check('native drag changed oxygen',during[oxygen]!=original[oxygen],True)
        if cancel:
            page.keyboard.press('Escape')
            check('Escape restores drag immediately',active_atoms(page),original)
            page.mouse.move(x+73,y+42,steps=3)
        page.mouse.up()
        page.keyboard.up('Alt')
        check('pointer-up geometry',active_atoms(page),original if cancel else during)
        page.keyboard.press('ControlOrMeta+z')
        hint=page.locator('#hint').inner_text()
        check('one real move undo',hint.splitlines()[-1], 'Nothing to undo.' if cancel else 'Undo: Move atom')
        check('undo/cancel exact geometry',active_atoms(page),original)
        if not cancel:
            page.keyboard.press('ControlOrMeta+z')
            hint=page.locator('#hint').inner_text()
            check('no second drag undo',hint.splitlines()[-1],'Nothing to undo.')
            x,y=find_atom_click_point(page,oxygen)
            page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+32,y+19,steps=4)
            check('second gesture starts after first finishes',
                  page.evaluate('()=>VibeMolTesting.getActiveTransformGesture().dragActive'),True)
            page.keyboard.press('Escape')
            page.mouse.up()
            check('second gesture cancels cleanly',active_atoms(page),original)
    return completed


def check_edit_value(name, actual, expected):
    print('[edit-tool-state] '+json.dumps({'case':name,'actual':actual,'expected':expected},sort_keys=True),flush=True)
    assert actual==expected,(name,actual,expected)


def active_atoms(page):
    return page.evaluate('()=>VibeMolStructure.exportActive().volume.atoms')


def placement_exits(page):
    completed=0
    for payload in ('carbon','benzene'):
        for action in ('Escape','Escape in operator','Transform','palette','View','Undo'):
            page.locator('#newFileBtn').click()
            arm(page,payload)
            close_build(page)
            canvas=page.locator('#canvas')
            box=canvas.bounding_box()
            page.mouse.click(box['x']+box['width']*.69,box['y']+box['height']*.44)
            if payload=='benzene':
                page.wait_for_function('()=>VibeMolTesting.getEditBuildState().moleculePlacementActive')
            else:
                page.wait_for_function('()=>VibeMolStructure.exportActive().volume.atoms.length>0')
            if action=='Transform':
                page.locator('#editTransformToolBtn').click()
            elif action=='palette':
                arm(page,'oxygen')
            elif action=='Escape in operator':
                operator='Atom' if payload=='carbon' else 'Molecule'
                page.locator('#editAdd'+operator+'OperatorHeader').click()
                page.locator('#editAdd'+operator+'OperatorX').press('Escape')
            else:
                canvas.focus()
                page.keyboard.press({'Escape':'Escape','View':'v','Undo':'ControlOrMeta+z'}[action])
            count=len(active_atoms(page))
            placed_count=5 if payload=='carbon' else 12
            expected=0 if action.startswith('Escape') or action=='Undo' else placed_count
            check_edit_value(f'{payload}: {action}',count,expected)
            check_edit_value(f'{payload}: {action} no molecule preview',state(page)['moleculePlacementActive'],False)
            completed+=2
            if action=='Undo':
                page.keyboard.press('ControlOrMeta+Shift+z')
                check_edit_value(f'{payload}: Redo',len(active_atoms(page)),placed_count)
                completed+=1
    return completed


def run(page, url):
    page.goto(url+'?appearanceStudy=1');page.wait_for_function('()=>window.VibeMolWorkbench')
    page.locator('#modeEditBtn').click();tool(page,'build')
    assert 'Click to place carbon' in state(page)['hint']
    assert page.locator('#editToolStrip [role="radio"]').evaluate_all('(els)=>els.map(e=>e.id)') == ['editAdaptiveAddAtomBtn', 'editTransformToolBtn']
    assert page.locator('#editTransformToolBtn').inner_text() == 'Transform'
    page.mouse.move(900,340)
    page.wait_for_function('()=>VibeMolTesting.getEditBuildState().gestureVoidPreviewVisible')
    page.locator('#editTransformToolBtn').click();tool(page,'transform')
    assert '/ opens Build' in state(page)['hint'] and 'Select atoms to edit' not in state(page)['hint']
    page.mouse.click(900,340)
    assert not p.snapshot(page)['scenes'], 'Transform unexpectedly created a structure'
    arm(page);tool(page,'build')
    assert page.locator('#editAdaptiveAddAtomBtn').get_attribute('aria-label')=='Build, carbon'
    assert page.locator('#editAdaptiveAddAtomBtn .vm-tool-badge').inner_text()=='C'
    # Escape must disarm and dismiss Build from the search field or viewport.
    page.locator('#editBuildSearch').focus();page.keyboard.press('Escape');tool(page,'transform')
    assert page.locator('#editAdaptiveAddAtomPopover').is_hidden()
    page.locator('#canvas').focus();page.keyboard.press('/')
    tool(page,'build')
    search=page.locator('#editBuildSearch')
    search.fill('zzz')
    actual={'empty':page.get_by_text('No matching Build items.').is_visible(),
            'alignment':page.locator('#editMoleculeAlign').is_visible()}
    expected={'empty':True,'alignment':False}
    print('[edit-build-search] '+json.dumps({'actual':actual,'expected':expected}),flush=True)
    assert actual==expected,(actual,expected)
    page.locator('#canvas').focus();page.keyboard.press('Escape');tool(page,'transform')
    assert page.locator('#editAdaptiveAddAtomPopover').is_hidden()
    page.locator('#canvas').focus();page.keyboard.press('/')
    tool(page,'build')
    actual=search.input_value()
    print('[edit-build-search-reset] '+json.dumps({'actual':actual,'expected':''}),flush=True)
    assert actual=='',actual
    arm(page);close_build(page);page.mouse.move(900,340)
    page.wait_for_function('()=>VibeMolTesting.getEditBuildState().gestureVoidPreviewVisible')
    assert page.locator('#editToolOverlay').is_visible()
    assert page.locator('.vm-build-cursor').is_visible()
    assert page.locator('#canvas').evaluate('el=>getComputedStyle(el).cursor')=='none'
    page.screenshot(path=str(p.ARTIFACTS/'edit-build-panel-closed.png'))
    page.mouse.click(900,340)
    page.wait_for_function('()=>VibeMolStructure.exportActive().volume.atoms.length>0')
    # Atom operator cancellation removes the provisional atom, stays armed.
    assert state(page)['hint']=='BUILD — Adjust location · Enter confirms · Esc discards this atom',state(page)['hint']
    assert page.locator('.vm-edit-tool-hint .vm-tool-badge').inner_text()=='BUILD'
    page.keyboard.press('Escape');tool(page,'build')
    assert not page.evaluate('()=>VibeMolStructure.exportActive().volume.atoms.length')
    assert 'Esc switches to Transform' in state(page)['hint']
    page.keyboard.press('Escape');tool(page,'transform')
    assert page.locator('#editToolOverlay').is_hidden()
    assert page.locator('.vm-build-cursor').is_hidden()
    assert page.locator('#canvas').evaluate('el=>getComputedStyle(el).cursor')!='none'
    # Confirm from the viewport or a coordinate input. Check the hint within
    # the key event's turn: waiting for another rendered frame hid this bug.
    for coordinate_entry in [False, True]:
        arm(page);close_build(page)
        page.mouse.click(900,340)
        page.wait_for_function('()=>VibeMolStructure.exportActive().volume.atoms.length>0')
        assert 'Esc discards this atom' in state(page)['hint']
        if coordinate_entry:
            page.locator('#editAddAtomOperatorHeader').click()
        confirmed=page.evaluate('''coordinateEntry=>{
          const target=document.getElementById(coordinateEntry?'editAddAtomOperatorX':'canvas');
          target.focus();
          target.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
          return {hint:VibeMolTesting.getEditBuildState().hint,structure:VibeMolStructure.exportActive().volume};
        }''',coordinate_entry)
        assert confirmed['hint']=='BUILD — Click to place carbon · Right-drag to rotate · Esc switches to Transform',confirmed['hint']
        page.locator('#canvas').focus();page.keyboard.press('Escape');tool(page,'transform')
        assert page.evaluate('()=>VibeMolStructure.exportActive().volume')==confirmed['structure'],'Esc removed committed atoms or hydrogens'
        page.locator('#newFileBtn').click();tool(page,'build')
        page.locator('#editTransformToolBtn').click();tool(page,'transform')
    # An atom click selects without replacing its element; Esc clears selection.
    assert p.load(page,[{'name':'one.xyz','text':'1\noxygen\nO 0 0 0'}])['ok']
    page.locator('#modeDisplayBtn').click()
    page.locator('#modeEditBtn').click();tool(page,'transform')
    box=page.locator('#canvas').bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
    page.mouse.click(x,y)
    page.wait_for_function('()=>VibeMolTesting.getEditSelectionCount()===1')
    assert page.evaluate('()=>VibeMolStructure.exportActive().volume.atoms[0].Z')==8
    assert 'Esc clears selection' in state(page)['hint']
    # Escape in an editable coordinate retains its native draft cancellation.
    page.wait_for_function('()=>document.querySelector(\'[data-selection-axis="x"]\').value==="0.0000"')
    coordinate=page.locator('[data-selection-axis="x"]');original=coordinate.input_value()
    coordinate.fill('99');coordinate.press('Escape')
    assert coordinate.input_value()==original, (original, coordinate.input_value())
    assert page.evaluate('()=>VibeMolTesting.getEditSelectionCount()')==1
    page.locator('#canvas').focus()
    page.keyboard.press('Escape');page.wait_for_function('()=>!VibeMolTesting.getEditSelectionCount()')
    # Fragment and molecule sessions keep their payload after cancellation.
    for name,kind in [('phenyl','fragment'),('benzene','molecule')]:
        arm(page,name);close_build(page)
        box=page.locator('#canvas').bounding_box();page.mouse.click(box['x']+box['width']*.8,box['y']+box['height']*.3)
        page.wait_for_function('()=>VibeMolTesting.getEditBuildState().moleculePlacementActive')
        assert state(page)['moleculePlacementKind']==kind
        hint=state(page)['hint']
        assert hint.startswith('BUILD — ') and f'Esc discards this {kind}' in hint,hint
        assert name.lower() in hint.lower() and 'Enter confirms' in hint and '•' not in hint,hint
        page.keyboard.press('Escape');tool(page,'build')
        assert not state(page)['moleculePlacementActive'] and state(page)['payload']['kind']==kind
        page.keyboard.press('Escape');tool(page,'transform')
    # One Tab stop. Arrows select without throwing keyboard focus into the palette.
    page.locator('#editTransformToolBtn').focus();page.keyboard.press('Home');tool(page,'build')
    assert page.locator('#editAdaptiveAddAtomBtn').evaluate('el=>document.activeElement===el')
    page.keyboard.press('End');tool(page,'transform')
    page.keyboard.press('Tab');assert page.locator('#editToolStrip').evaluate('el=>!el.contains(document.activeElement)')
    arm(page);close_build(page)
    page.locator('#modeDisplayBtn').click();assert page.locator('#editToolStrip').is_hidden()
    page.locator('#modeEditBtn').click();tool(page,'build')
    # Existing bar remains usable at all supported widths.
    for width in [320,390,768,1440,1920]:
        page.set_viewport_size({'width':width,'height':1000});page.locator('#editTransformToolBtn').focus()
        page.keyboard.press('ArrowRight');tool(page,'build')
        # #21: the fixed sleep read pre-compact state; nine CI observations
        # invalidated that expectation without changing the overflow invariant:
        # https://github.com/evangelistalab/vibemol/actions/runs/39129507791
        if width == 320:
            try:
                page.wait_for_function("() => document.body.dataset.wbCompact === 'true'")
            finally:
                print('[edit-tool-compact] '+json.dumps({
                    'viewportWidth': width,
                    'actual': page.locator('body').get_attribute('data-wb-compact'),
                    'expected': 'true',
                }, sort_keys=True), flush=True)
        wait_for_presented_state(page, '() => true')
        tool_widths = page.locator('.wb-tools').evaluate('el=>({scrollWidth:el.scrollWidth,clientWidth:el.clientWidth})')
        print('[edit-tool-layout] '+json.dumps({
            'viewportWidth': width, 'actual': tool_widths,
            'expected': {'maximumScrollWidth': tool_widths['clientWidth'] + 1},
            'passed': tool_widths['scrollWidth'] <= tool_widths['clientWidth'] + 1,
        }, sort_keys=True), flush=True)
        assert tool_widths['scrollWidth'] <= tool_widths['clientWidth'] + 1, width
        assert page.locator('#editToolStrip').evaluate('''el=>[...el.querySelectorAll('button')].every(b=>{
          const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})'''),width
        page.keyboard.press('ArrowLeft');tool(page,'transform')
    print('[edit tool] arming, selection, atom/fragment/molecule Escape, ARIA, keyboard, modes and widths: passed',flush=True)


def visual_schemes(browser, url):
    # Edit intentionally suppresses surfaces. Override suppression ONLY in this
    # isolated QA page to inspect neutral indicators against real orbital lobes.
    page=browser.new_page(viewport={'width':1440,'height':1000})
    source=(p.ROOT/'assets/app/js/app.js').read_text()
    source=source.replace('const suppressSurfaces = currentMode === MODES.EDIT ||', 'const suppressSurfaces =')
    page.route('**/assets/app/js/app.js*',lambda route:route.fulfill(body=source,content_type='text/javascript'))
    page.goto(url+'?appearanceStudy=1');page.wait_for_function('()=>window.VibeMolWorkbench')
    assert p.load(page,[{'name':'hydrogen-2p.cube','text':p.hydrogen_2p_cube()}])['ok']
    page.locator('#modeEditBtn').click();arm(page);close_build(page)
    # Restored surfaces also activate the View-only hover tooltip; hide that
    # QA artifact so it cannot cover the creation badge under inspection.
    page.add_style_tag(content='#surfaceHoverLabel { display: none !important; }')
    schemes=page.locator('#schemeSelect option').evaluate_all('(els)=>els.map(e=>e.value).filter(v=>v && v!=="custom")')
    assert len(schemes)==5,schemes
    report={}
    for theme in ['light','dark']:
        if page.locator('#themeToggleInput').is_checked() != (theme == 'dark'):
            page.locator('#themeToggleShell').click()
        for scheme in schemes:
            page.locator('#schemeSelect').evaluate('(el,v)=>{el.value=v;el.dispatchEvent(new Event("change",{bubbles:true}))}',scheme)
            page.mouse.move(875,390);page.wait_for_timeout(250)
            assert page.locator('.vm-build-cursor').is_visible()
            assert any(m['visible'] for m in page.evaluate('()=>VibeMolTesting.getSurfaceMaterialSnapshot()'))
            page.screenshot(path=str(p.ARTIFACTS/f'edit-build-{scheme}-{theme}.png'))
        report[theme]=page.evaluate('''()=>{
          const root=getComputedStyle(document.documentElement),badge=getComputedStyle(document.querySelector('.vm-build-cursor .vm-tool-badge'));
          return {accent:root.getPropertyValue('--vm-color-tool-active').trim(),panel:root.getPropertyValue('--vm-color-surface-panel').trim(),text:badge.color};
        }''')
    (p.ARTIFACTS/'edit-tool-colors.json').write_text(json.dumps(report,indent=2))
    page.close();print('[edit tool] both themes × five orbital schemes rendered (QA-only surface visibility): passed',flush=True)


def main():
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
        page=browser.new_page(viewport={'width':1440,'height':1000});errors=[]
        phase='edit-tool'
        page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.dismiss())
        try:
            run(page,url)
            page.close()
            page=browser.new_page(viewport={'width':1440,'height':1000})
            page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.dismiss())
            page.goto(url+'?appearanceStudy=1')
            page.wait_for_function('()=>window.VibeMolWorkbench')
            completed=editing_transactions(page)+placement_exits(page)
            require_phase_counts({'edit-tool-state':completed},'tests/e2e/edit_tool.py','edit-tool-state')
            # Retire Edit before the isolated visual and Metal contexts.
            page.close()
            visual_schemes(browser,url)
            phase='metal-popover'
            print('[edit-tool-phase] '+json.dumps({'phase':phase,'status':'started'},sort_keys=True),flush=True)
            # Run39279175556 and the instrumented full-sequence reproduction
            # reached31.85s in the first native Coordination pointer handler.
            # https://github.com/evangelistalab/vibemol/actions/runs/39279175556
            isolation={'actualContextCount':len(browser.contexts),'expectedContextCount':0}
            print('[metal-isolation] '+json.dumps(isolation,sort_keys=True),flush=True)
            assert isolation['actualContextCount']==isolation['expectedContextCount'],isolation
            metal_popover_regression(browser,url);assert not errors,errors
        except Exception:
            print('[edit-tool-phase] '+json.dumps({'phase':phase,'status':'failed','artifactPrefix':phase+'-failure'},sort_keys=True),flush=True)
            p.write_failure_artifacts(page,p.ARTIFACTS,phase+'-failure',errors,[]);raise
        finally:browser.close()


if __name__=='__main__':main()
