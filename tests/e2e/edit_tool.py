#!/usr/bin/env python3
"""Armed Edit tool, Escape ladder, keyboard semantics and visual contrast fixtures."""
import json
import premerge as p
from helpers import wait_for_presented_state
from checkpoint_contract import require_phase_counts
from metal_popover import metal_popover_regression
from smoke import canvas_point, find_atom_click_point


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
    page.get_by_role('button',name='Close Build',exact=True).click()


def switch_tools_with_selection(page):
    completed = 0

    def compare(label, actual, expected):
        nonlocal completed
        check_edit_value(label, actual, expected)
        completed += 1

    page.locator('#modeDisplayBtn').click()
    ethylene = (p.ROOT / 'assets/fragments/ethene.xyz').read_text()
    compare('load ethylene', p.load(page, [{'name': 'ethylene.xyz', 'text': ethylene}])['ok'], True)
    original = active_atoms(page)
    page.locator('#modeEditBtn').click()
    tool(page, 'transform')
    page.mouse.click(*find_atom_click_point(page, 0))

    def check(label, *, badge, card, position, translate, build_at_site, move_operator):
        wait_for_presented_state(page, '()=>true')
        actual = page.evaluate('''() => {
          const visible = id => !!document.getElementById(id).getClientRects().length;
          return {
            selection: VibeMolTesting.getEditSelectionIndices(),
            badge: document.querySelector('#hint .vm-tool-badge')?.textContent ?? null,
            card: visible('editSelectionTranslateCue'),
            position: visible('editSelectionPosition'),
            translate: visible('editSelectionTranslateCueButton'),
            buildAtSite: visible('editSelectionAddFragmentCueButton'),
            moveOperator: visible('editAddAtomOperatorPanel'),
            atoms: VibeMolStructure.exportActive().volume.atoms,
          };
        }''')
        expected = dict(selection=[0], badge=badge, card=card, position=position,
                        translate=translate, buildAtSite=build_at_site, moveOperator=move_operator,
                        atoms=original)
        compare(label, actual, expected)

    check('ethylene selected in Transform', badge='TRANSFORM', card=True,
          position=True, translate=True, build_at_site=True, move_operator=True)
    page.locator('#editAdaptiveAddAtomBtn').click()
    page.locator('#editAddQuick button[data-z="6"]').click()
    check('Build carbon hides Transform controls', badge='BUILD', card=False,
          position=False, translate=False, build_at_site=False, move_operator=False)
    page.keyboard.press('Escape')
    check('return to Transform keeps selection', badge='TRANSFORM', card=True,
          position=True, translate=True, build_at_site=True, move_operator=False)
    page.locator('#editSelectionAddFragmentCueButton').click()
    check('Build at open site keeps only the Build control', badge='BUILD', card=True,
          position=False, translate=False, build_at_site=True, move_operator=False)
    return completed


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


def check_edit_value(name, actual, expected, *, phase='edit-tool-state'):
    print(f'[{phase}] '+json.dumps({'case':name,'actual':actual,'expected':expected},sort_keys=True),flush=True)
    assert actual==expected,(name,actual,expected)


def active_atoms(page):
    return page.evaluate('()=>VibeMolStructure.exportActive().volume.atoms')


def metal_build_drag(page, url):
    completed = 0

    def check(case, actual, expected):
        nonlocal completed
        print('[metal-build-drag] ' + json.dumps(dict(case=case, actual=actual, expected=expected)), flush=True)
        assert actual == expected, (case, actual, expected)
        completed += 1

    # Observe rendered meshes without adding to VibeMolTesting or changing input.
    source = (p.ROOT / 'assets/app/js/app.js').read_text()
    marker = 'window.VibeMolTesting = Object.freeze({'
    assert source.count(marker) == 1, source.count(marker)
    probe = '''window.__metalBuildDrag = () => ({
      sites: editHaloGhostPreviewGroup.children.map(group => group.userData.haloGhostIndex).filter(Number.isInteger),
      activeSite: addGrowActive ? metalGrowPreview.activeIndex : -1,
      preview: addPreviewAtomMesh?.visible ? addPreviewAtomMesh.position.toArray() : null,
    });
    '''
    page.route('**/assets/app/js/app.js*', lambda route: route.fulfill(
        body=source.replace(marker, probe + marker), content_type='text/javascript'))
    page.goto(url + '?appearanceStudy=1')
    page.wait_for_function('()=>window.VibeMolWorkbench && VibeMolEdit.listBuildCatalog().value.some(e=>e.entryId==="ammonia")')
    page.locator('#modeEditBtn').click()
    arm(page, 'Fe')
    close_build(page)
    page.mouse.click(*canvas_point(page, .56, .48))
    iron = page.evaluate('''() => {
      const volume = VibeMolStructure.exportActive().volume;
      const atom = volume.atoms[0];
      return {Z:atom.Z, armed:VibeMolTesting.getEditBuildState().payload.symbol,
              geometry:volume.annotations.coordination.byAtomId[atom.id]?.geometryId};
    }''')
    check('first iron retains brush and geometry', iron, dict(Z=26, armed='Fe', geometry='octahedral'))
    page.keyboard.press('Enter')

    for name, site_count, donor_z in [('Cl', 6, 17), ('cyano', 5, 6), ('ammonia', 4, 7)]:
        arm(page, name)
        close_build(page)
        before = page.evaluate('()=>VibeMolStructure.exportActive().volume')
        x, y = find_atom_click_point(page, 0)
        page.mouse.move(x, y)
        page.mouse.down()
        wait_for_presented_state(page, '()=>true')
        held = page.evaluate('()=>({...__metalBuildDrag(), volume:VibeMolStructure.exportActive().volume})')
        check(name + ' press shows free sites before moving',
              dict(count=len(held['sites']), activeSite=held['activeSite'], preview=held['preview'], volume=held['volume']),
              dict(count=site_count, activeSite=-1, preview=None, volume=before))
        if name == 'Cl':
            page.keyboard.press('Escape')
            page.mouse.up()
            wait_for_presented_state(page, '()=>true')
            check('Escape cancels a stationary press', page.evaluate('''() => ({
              volume:VibeMolStructure.exportActive().volume, ...__metalBuildDrag(),
            })'''), dict(volume=before, sites=[], activeSite=-1, preview=None))
            page.mouse.down()
        page.mouse.move(x + 130, y - 80, steps=4)
        wait_for_presented_state(page, '()=>true')
        preview = page.evaluate('()=>__metalBuildDrag()')
        check(name + ' drag renders the free sites', dict(count=len(preview['sites']),
              activeSiteDrawn=preview['activeSite'] in preview['sites'], preview=preview['preview'] is not None),
              dict(count=site_count, activeSiteDrawn=True, preview=True))
        if name == 'ammonia':
            page.keyboard.press('Escape')
            page.mouse.up()
            wait_for_presented_state(page, '()=>true')
            check('Escape cancels catalog drag', page.evaluate('''() => ({
              volume:VibeMolStructure.exportActive().volume, ...__metalBuildDrag(),
            })'''), dict(volume=before, sites=[], activeSite=-1, preview=None))
            continue
        page.mouse.up()
        after = page.evaluate('()=>VibeMolStructure.exportActive().volume')
        prior_ids = {atom['id'] for atom in before['atoms']}
        anchor = before['atoms'][0]['id']
        bonded = {bond['b'] if bond['a'] == anchor else bond['a']
                  for bond in after['bonds'] if anchor in [bond['a'], bond['b']]}
        donors = [[atom['Z'], *[round(atom[axis], 8) for axis in 'xyz']]
                  for atom in after['atoms'] if atom['id'] in bonded - prior_ids]
        check(name + ' release bonds at the displayed site', donors,
              [[donor_z, *[round(value, 8) for value in preview['preview']]]])
        if name == 'Cl':
            page.keyboard.press('Enter')
    arm(page, 'Cl')
    close_build(page)
    before = page.evaluate('()=>VibeMolStructure.exportActive().volume')
    page.mouse.click(*find_atom_click_point(page, 0))
    wait_for_presented_state(page, '()=>true')
    check('plain click selects the metal and leaves its sites open', page.evaluate('''() => ({
      selection:VibeMolTesting.getEditSelectionIndices(), sites:__metalBuildDrag().sites.length,
      volume:VibeMolStructure.exportActive().volume,
    })'''), dict(selection=[0], sites=4, volume=before))
    require_phase_counts({'metal-build-drag': completed}, 'tests/e2e/edit_tool.py', 'metal-build-drag')


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
    transform_button = page.get_by_role('radio', name='Transform', exact=True)
    transform_shortcut = transform_button.locator('kbd')
    assert transform_button.get_attribute('aria-keyshortcuts') == 'w'
    assert transform_shortcut.is_visible() and transform_shortcut.inner_text() == 'w'
    build_button = page.locator('#editAdaptiveAddAtomBtn')
    build_shortcut = build_button.locator('kbd')
    assert build_button.get_attribute('aria-keyshortcuts') == '/'
    assert build_shortcut.is_visible() and build_shortcut.inner_text() == '/'
    page.mouse.move(900,340)
    page.wait_for_function('()=>VibeMolTesting.getEditBuildState().gestureVoidPreviewVisible')
    page.locator('#canvas').focus();page.keyboard.press('w');tool(page,'transform')
    assert build_shortcut.is_visible()
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
    assert search.evaluate('el => el === document.activeElement')
    page.keyboard.press('w')
    assert search.input_value() == 'w' and build_button.get_attribute('aria-checked') == 'true'
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
    assert state(page)['hint']=='BUILD — Adjust location · return confirms · esc discards this atom',state(page)['hint']
    assert page.locator('.vm-edit-tool-hint .vm-tool-badge').inner_text()=='BUILD'
    page.keyboard.press('Escape');tool(page,'build')
    assert not page.evaluate('()=>VibeMolStructure.exportActive().volume.atoms.length')
    assert 'esc switches to Transform' in state(page)['hint']
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
        assert 'esc discards this atom' in state(page)['hint']
        if coordinate_entry:
            page.locator('#editAddAtomOperatorHeader').click()
        confirmed=page.evaluate('''coordinateEntry=>{
          const target=document.getElementById(coordinateEntry?'editAddAtomOperatorX':'canvas');
          target.focus();
          target.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
          return {hint:VibeMolTesting.getEditBuildState().hint,structure:VibeMolStructure.exportActive().volume};
        }''',coordinate_entry)
        assert confirmed['hint']=='BUILD — Click to place carbon · Right-drag to rotate · esc switches to Transform',confirmed['hint']
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
    assert 'esc clears selection' in state(page)['hint']
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
        assert hint.startswith('BUILD — ') and f'esc discards this {kind}' in hint,hint
        assert name.lower() in hint.lower() and 'return confirms' in hint and '•' not in hint,hint
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
        assert build_shortcut.is_visible() and transform_shortcut.is_visible(), width
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


def atom_settings(page, url):
    completed = 0

    def check(name, actual, expected):
        nonlocal completed
        check_edit_value(name, actual, expected, phase='atom-settings')
        completed += 1

    page.goto(url+'?appearanceStudy=1')
    page.wait_for_function('()=>window.VibeMolWorkbench')
    assert p.load(page,[{'name':'iron.xyz','text':'1\nIron atom\nFe 0 0 0\n'}])['ok']
    page.locator('#modeEditBtn').click()
    tool(page, 'transform')
    wait_for_presented_state(page, '()=>true')
    page.mouse.click(*find_atom_click_point(page,0))

    trigger = page.get_by_role('button', name='Atom settings', exact=True)
    trigger.hover()
    tooltip = page.get_by_role('tooltip').filter(has_text='Formal charge and coordination')
    tooltip.wait_for()
    check('Atom settings tooltip', tooltip.inner_text(), 'Formal charge and coordination')
    trigger.click()
    popup = page.locator('#editSelectionCoordinationCuePopover')
    charge = popup.get_by_role('spinbutton', name='Formal charge', exact=True)
    check('Formal charge field visible', charge.is_visible(), True)
    check('Geometry in Atom settings', popup.locator('[data-coordination-choice="octahedral"]').is_visible(), True)
    check('Initial Fe charge', active_atoms(page)[0]['formalCharge'], 0)

    charge.fill('2')
    charge.press('Tab')
    check('Fe charge after commit', active_atoms(page)[0]['formalCharge'], 2)
    page.keyboard.press('Escape')
    page.locator('#canvas').focus()
    page.keyboard.press('ControlOrMeta+z')
    check('Charge undo action', page.locator('#hint').inner_text().splitlines()[-1], 'Undo: Set formal charge')
    check('Fe charge after undo', active_atoms(page)[0]['formalCharge'], 0)
    require_phase_counts({'atom-settings':completed},'tests/e2e/edit_tool.py','atom-settings')


def halo_placement_hint(page, url):
    completed = 0

    def check(name, actual, expected):
        nonlocal completed
        check_edit_value(name, actual, expected, phase='halo-placement-hint')
        completed += 1

    page.goto(url+'?appearanceStudy=1')
    page.wait_for_function('()=>window.VibeMolWorkbench')
    page.locator('#modeMeasureBtn').click()
    measure_key = page.locator('#hint kbd')
    check('Measure Escape key name', [measure_key.inner_text(), measure_key.get_attribute('aria-label')], ['esc', 'Escape'])

    read_hint = '''() => {
      const hint = document.querySelector('.vm-edit-tool-hint');
      return {hint:hint.textContent, keys:Array.from(hint.querySelectorAll('kbd'), k=>[k.textContent,k.getAttribute('aria-label')]),
              elements:VibeMolStructure.exportActive().volume.atoms.map(atom=>atom.Z)};
    }'''
    expected_pending = dict(hint='BUILD — Chlorine placement pending · Adjust location · return confirms · esc discards',
                            keys=[['return', 'Return'], ['esc', 'Escape']], elements=[26, 17])
    for native in (True, False):
        assert p.load(page,[{'name':'iron.xyz','text':'1\nIron atom\nFe 0 0 0\n'}])['ok']
        page.locator('#modeEditBtn').click()
        arm(page, 'Cl')
        close_build(page)
        wait_for_presented_state(page, '()=>true')
        page.mouse.move(*find_atom_click_point(page, 0))
        page.mouse.wheel(0, 480)
        wait_for_presented_state(page, '()=>true')
        for key, elements in [('Escape', [26]), ('Enter', [26, 17])]:
            anchor = find_atom_click_point(page, 0)
            page.mouse.click(*anchor)
            wait_for_presented_state(page, '()=>VibeMolTesting.getHaloGhostWorlds().length>0')
            site = page.evaluate('''([x,y])=>{
              const points = VibeMolTesting.getHaloGhostWorlds().map(g=>VibeMolTesting.projectHaloGhostToClient(g.index));
              const distance = p=>Math.hypot(p.x-x,p.y-y);
              return points.filter(p=>p?.visible && document.elementFromPoint(p.x,p.y)?.id==='canvas' && distance(p)>24)
                .sort((a,b)=>distance(b)-distance(a))[0] ?? null;
            }''', anchor)
            assert site, 'No open halo site is reachable on the canvas'
            if native:
                page.mouse.click(site['x'], site['y'])
                pending = page.evaluate(read_hint)
                check(f'{key} pending before native check', pending, expected_pending)
                page.locator('#canvas').focus()
                page.keyboard.press(key)
                actual = page.evaluate(read_hint)
            else:
                # Read after the app's native placement handler and send the key before any frame runs.
                page.evaluate(f'''key => {{
                  const canvas = document.getElementById('canvas');
                  const readHint = {read_hint};
                  canvas.addEventListener('pointerdown', () => {{
                    const pending = readHint();
                    canvas.focus({{preventScroll:true}});
                    canvas.dispatchEvent(new KeyboardEvent('keydown', {{key, bubbles:true, cancelable:true}}));
                    canvas.haloHintReceipt = {{pending, actual:readHint()}};
                  }}, {{once:true}});
                }}''', key)
                page.mouse.click(site['x'], site['y'])
                receipt = page.locator('#canvas').evaluate('''canvas => {
                  const receipt = canvas.haloHintReceipt;
                  delete canvas.haloHintReceipt;
                  return receipt;
                }''')
                assert receipt, 'No readback from the native halo placement handler'
                check(f'{key} pending before same-event check', receipt['pending'], expected_pending)
                actual = receipt['actual']
            expected = dict(hint='BUILD — Click to place chlorine · Right-drag to rotate · esc switches to Transform',
                            keys=[['esc', 'Escape']], elements=elements)
            check(f'{key} {"native" if native else "same-event"} result', actual, expected)
        page.locator('#modeDisplayBtn').click()
    require_phase_counts({'halo-placement-hint':completed}, 'tests/e2e/edit_tool.py', 'halo-placement-hint')


def halo_hook_sites(page, url):
    completed = 0

    def check(name, actual, expected):
        nonlocal completed
        check_edit_value(name, actual, expected, phase='halo-hook-site')
        completed += 1

    page.goto(url + '?appearanceStudy=1')
    page.wait_for_function('()=>window.VibeMolWorkbench')
    assert p.load(page, [{'name':'iron.xyz', 'text':'1\nIron atom\nFe 0 0 0\n'}])['ok']
    page.locator('#modeEditBtn').click()
    arm(page, 'Cl')
    close_build(page)
    wait_for_presented_state(page, '()=>true')
    page.mouse.click(*find_atom_click_point(page, 0))
    wait_for_presented_state(page, '()=>VibeMolTesting.getHaloGhostWorlds().length === 6')

    # Run every request and readback in one turn so a frame cannot repair stale sites.
    result = page.evaluate('''() => {
      const testing = VibeMolTesting;
      const volume = () => VibeMolStructure.exportActive().volume;
      const reject = index => {
        const before = JSON.stringify(volume());
        const {attached} = testing.triggerHaloGhostByIndex(index);
        return {attached, unchanged: before === JSON.stringify(volume())};
      };
      const ironId = volume().atoms[0].id;
      const invalid = reject(String(testing.getHaloGhostWorlds()[0].index));
      const placements = [];
      let repeated;
      for (let i = 0; i < 6; i += 1) {
        const site = testing.getHaloGhostWorlds()[0];
        if (!site) break;
        const receipt = testing.triggerHaloGhostByIndex(site.index);
        const {atoms, bonds} = volume();
        const atom = atoms.at(-1);
        placements.push({index:site.index, receipt, elements:atoms.map(a => a.Z), bondCount:bonds.length,
          bondedToIron:bonds.some(b => (b.a === ironId && b.b === atom.id) || (b.b === ironId && b.a === atom.id)),
          atSite:Math.hypot(atom.x - site.x, atom.y - site.y, atom.z - site.z) < 1e-8,
          remaining:testing.getHaloGhostWorlds().map(ghost => ghost.index)});
        if (i === 0) repeated = reject(site.index);
      }
      return {invalid, placements, repeated, seventh:reject(5), finalVolume:volume()};
    }''')
    unchanged = dict(attached=False, unchanged=True)
    check('Site ID must be an integer', result['invalid'], unchanged)
    check('Immediate repeat on an occupied site', result['repeated'], unchanged)
    for index, actual in enumerate(result['placements']):
        check(f'Ligand {index + 1} fills its site immediately', actual, dict(
            index=index, receipt=dict(attached=True, anchorIndex=0, ghostIndex=index, kind='atom'),
            elements=[26] + [17] * (index + 1), bondCount=index + 1, bondedToIron=True,
            atSite=True, remaining=list(range(index + 1, 6)),
        ))
    check('Seventh attempt on a saturated metal', result['seventh'], unchanged)
    page.locator('#canvas').focus()
    page.keyboard.press('Enter')
    check('Enter commits the complete structure',
          page.evaluate('()=>VibeMolStructure.exportActive().volume'), result['finalVolume'])
    require_phase_counts({'halo-hook-site':completed}, 'tests/e2e/edit_tool.py', 'halo-hook-site')


def ammonia_halo_cue(page, url):
    completed = 0

    def check(name, actual, expected):
        nonlocal completed
        check_edit_value(name, actual, expected, phase='ammonia-halo-cue')
        completed += 1

    page.goto(url + '?appearanceStudy=1')
    page.wait_for_function('''() => window.VibeMolEdit?.listBuildCatalog().value.some(entry =>
      entry.entryId === 'ammonia' && entry.attachModes.includes('coordinate'))''')
    assert p.load(page, [{'name':'iron.xyz', 'text':'1\nIron atom\nFe 0 0 0\n'}])['ok']
    page.locator('#modeEditBtn').click()
    arm(page, 'Ammonia')
    close_build(page)
    page.locator('#editTransformToolBtn').click()
    page.mouse.move(*find_atom_click_point(page, 0))
    page.mouse.wheel(0, 1050)
    wait_for_presented_state(page, '()=>true')
    anchor = find_atom_click_point(page, 0)
    page.mouse.click(*anchor)
    initial = page.evaluate('()=>VibeMolStructure.exportActive().volume')
    check('Select Fe in Transform', page.evaluate('''() => ({
      selected:VibeMolTesting.getEditSelectionIndices(),
      atoms:VibeMolStructure.exportActive().volume.atoms.map(atom => atom.Z),
      sites:VibeMolTesting.getHaloGhostWorlds().length,
    })'''), dict(selected=[0], atoms=[26], sites=0))

    cue = page.get_by_role('button', name='Build Ammonia at open site', exact=True)
    # The app's listener runs first. This read happens before a frame can refresh the halo.
    cue.evaluate('''el => el.addEventListener('click', event => {
      window.ammoniaCueClick = {trusted:event.isTrusted, pointer:event.pointerType,
        sites:VibeMolTesting.getHaloGhostWorlds().map(site => site.index),
        volume:VibeMolStructure.exportActive().volume};
    }, {once:true})''')
    cue.click()
    check('Trusted cue click publishes all six sites immediately', page.evaluate('()=>window.ammoniaCueClick'),
          dict(trusted=True, pointer='mouse', sites=list(range(6)), volume=initial))

    wait_for_presented_state(page, '()=>true')
    sites = page.evaluate('''([x,y]) => VibeMolTesting.getHaloGhostWorlds().map(site => {
      const point = VibeMolTesting.projectHaloGhostToClient(site.index);
      return {site, point, onCanvas:point?.visible && document.elementFromPoint(point.x,point.y)?.id === 'canvas',
        distance:Math.hypot(point.x-x, point.y-y)};
    })''', anchor)
    check('All six site targets are visible on the canvas', [site['onCanvas'] for site in sites], [True]*6)
    chosen = max(sites, key=lambda item: item['distance'])
    page.mouse.click(chosen['point']['x'], chosen['point']['y'])
    wait_for_presented_state(page, '()=>true')
    attached = page.evaluate('''site => {
      const volume = VibeMolStructure.exportActive().volume;
      const [fe, nitrogen] = volume.atoms;
      const bonds = volume.bonds.map(bond => [bond.a,bond.b]
        .map(id => volume.atoms.find(atom => atom.id === id).Z).sort((a,b) => a-b)).sort();
      const dative = volume.bonds.some(bond => bond.style === 'metal-dative'
        && [bond.a,bond.b].includes(fe.id) && [bond.a,bond.b].includes(nitrogen?.id));
      return {volume, bonds, dative,
        nitrogenAtSite:!!nitrogen && Math.hypot(nitrogen.x-site.x, nitrogen.y-site.y, nitrogen.z-site.z) < 1e-8,
        openSites:VibeMolTesting.getHaloGhostWorlds().length};
    }''', chosen['site'])
    after = attached.pop('volume')
    check('Clicking a target adds intact NH3 through N and leaves five sites', attached,
          dict(bonds=[[1,7],[1,7],[1,7],[7,26]], dative=True, nitrogenAtSite=True, openSites=5))
    check('The plus button stays pressed with sites open', cue.get_attribute('aria-pressed'), 'true')
    cue.click()
    check('Clicking plus again hides the sites and preserves NH3', page.evaluate('''() => ({
      volume:VibeMolStructure.exportActive().volume, sites:VibeMolTesting.getHaloGhostWorlds().length,
      payload:VibeMolTesting.getEditBuildState().payload.id,
    })'''), dict(volume=after, sites=0, payload='ammonia'))
    require_phase_counts({'ammonia-halo-cue':completed}, 'tests/e2e/edit_tool.py', 'ammonia-halo-cue')


def metal_oxygen_hydrogens(page, url):
    completed = 0
    page.goto(url + '?appearanceStudy=1')
    page.wait_for_function('''() => window.VibeMolEdit?.listBuildCatalog().value.some(entry =>
      entry.entryId === 'water' && entry.attachModes.includes('coordinate'))''')
    for payload, ligand_type, adjust, atomic_number, charge, hydrogens, style in (
        ('O', 'auto', True, 8, 0, 2, 'metal-dative'),
        ('O', 'L', True, 8, 0, 2, 'metal-dative'),
        ('O', 'L', False, 8, 0, 0, 'metal-dative'),
        ('O', 'X', True, 8, -1, 0, 'metal-strong'),
        ('N', 'auto', True, 7, 0, 3, 'metal-dative'),
        ('Water', None, True, 8, 0, 2, 'metal-dative'),
    ):
        assert p.load(page, [{'name':'iron.xyz', 'text':'1\nIron atom\nFe 0 0 0\n'}])['ok']
        page.locator('#modeEditBtn').click()
        arm(page, payload)
        if ligand_type:
            page.locator('#editAddAdjustHydrogens').set_checked(adjust)
            page.get_by_role('combobox', name='Metal ligand type').select_option(ligand_type)
        close_build(page)
        wait_for_presented_state(page, '()=>true')
        page.mouse.move(*find_atom_click_point(page, 0))
        page.mouse.wheel(0, 1050)
        wait_for_presented_state(page, '()=>true')
        x, y = find_atom_click_point(page, 0)
        if ligand_type:
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(x + 135, y - 85, steps=4)
            wait_for_presented_state(page, '()=>true')
            page.mouse.up()
            page.locator('#canvas').focus()
            page.keyboard.press('Enter')
        else:
            page.mouse.click(x, y)
        actual = page.evaluate('''() => {
          const {atoms, bonds} = VibeMolStructure.exportActive().volume;
          const iron = atoms[0];
          const link = bonds.find(bond => bond.a === iron.id || bond.b === iron.id);
          const other = (bond, id) => bond.a === id ? bond.b : bond.b === id ? bond.a : null;
          const donor = link && atoms.find(atom => atom.id === other(link, iron.id));
          const attachedHydrogens = donor ? bonds.filter(bond => bond.order === 1 &&
            atoms.some(atom => atom.Z === 1 && atom.id === other(bond, donor.id))).length : 0;
          return {iron:iron.Z, elements:atoms.map(atom => atom.Z).sort((a,b) => a-b),
            donor:donor?.Z ?? null, charge:donor?.formalCharge ?? null,
            coordinationBond:link ? [link.order, link.style] : null, hydrogens:attachedHydrogens};
        }''')
        check_edit_value(f'{payload}, type {ligand_type}, adjust {adjust}', actual, dict(
            iron=26, elements=[1]*hydrogens + [atomic_number, 26], donor=atomic_number, charge=charge,
            coordinationBond=[1, style], hydrogens=hydrogens), phase='metal-oxygen-hydrogens')
        completed += 1
        page.locator('#modeDisplayBtn').click()
    require_phase_counts({'metal-oxygen-hydrogens':completed}, 'tests/e2e/edit_tool.py', 'metal-oxygen-hydrogens')


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
            completed=editing_transactions(page)+placement_exits(page)+switch_tools_with_selection(page)
            require_phase_counts({'edit-tool-state':completed},'tests/e2e/edit_tool.py','edit-tool-state')
            # Retire Edit before the isolated visual and Metal contexts.
            page.close()
            phase='metal-build-drag'
            page=browser.new_page(viewport={'width':1440,'height':1000})
            page.on('pageerror',lambda e:errors.append(str(e)))
            metal_build_drag(page,url)
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
            metal_popover_regression(browser,url)
            phase='atom-settings'
            page=browser.new_page(viewport={'width':1440,'height':1000})
            page.on('pageerror',lambda e:errors.append(str(e)))
            atom_settings(page,url)
            page.close()
            phase='halo-placement-hint'
            page=browser.new_page(viewport={'width':1440,'height':1000})
            page.on('pageerror',lambda e:errors.append(str(e)))
            halo_placement_hint(page,url)
            page.close()
            phase='halo-hook-site'
            page=browser.new_page(viewport={'width':1440,'height':1000})
            page.on('pageerror',lambda e:errors.append(str(e)))
            halo_hook_sites(page,url)
            page.close()
            phase='ammonia-halo-cue'
            page=browser.new_page(viewport={'width':1440,'height':1000})
            page.on('pageerror',lambda e:errors.append(str(e)))
            ammonia_halo_cue(page,url)
            page.close()
            phase='metal-oxygen-hydrogens'
            page=browser.new_page(viewport={'width':1440,'height':1000})
            page.on('pageerror',lambda e:errors.append(str(e)))
            metal_oxygen_hydrogens(page,url)
            assert not errors,errors
        except Exception:
            print('[edit-tool-phase] '+json.dumps({'phase':phase,'status':'failed','artifactPrefix':phase+'-failure'},sort_keys=True),flush=True)
            p.write_failure_artifacts(page,p.ARTIFACTS,phase+'-failure',errors,[]);raise
        finally:browser.close()


if __name__=='__main__':main()
