#!/usr/bin/env python3
"""Structure-first AVAS picking, plane projection, rendering and generated forte2 input."""
import ast
import json
import premerge as p
from surface_shadows import settings, settle

CYCLO='''H .912650 0 1.457504
H -.912650 0 1.457504
H 0 -1.585659 -1.038624
H 0 1.585659 -1.038624
C 0 0 .859492
C 0 -.651229 -.499559
C 0 .651229 -.499559'''
H2CO='''C 0 -.000000000006 -.599542970149
O 0 .000000000001 .599382404096
H 0 -.938817812172 -1.186989139808
H 0 .938817812225 -1.186989139839'''

def ready(page):
    page.evaluate('()=>VibeMolCalculations.ready()')
    page.wait_for_function("()=>!document.querySelector('#subspacePanel [data-loading]').textContent.includes('Preparing')")
    settle(page)


def input_artifact(page,name):
    result=page.evaluate('()=>VibeMolCalculations.export()')
    assert not result['validation']['errors'],result
    ast.parse(result['code'])
    (p.ARTIFACTS/(name+'.py')).write_text(result['code'])
    (p.ARTIFACTS/(name+'.json')).write_text(json.dumps(result,indent=2))
    return result


def run(page,url):
    page.goto(url+'?appearanceStudy=1');page.wait_for_function('()=>window.VibeMolCalculations')
    page.evaluate('''()=>{THREE.Mesh.prototype.onBeforeRender=function(renderer,scene,camera){if(this.userData.type==='atom'){window.avasScene=scene;window.avasCamera=camera;}};}''')
    assert page.locator('#toolbarModeRow [role="radio"]').count()==4
    assert p.load(page,[{'name':'cyclopropene.xyz','text':CYCLO}])['ok']
    page.locator('#modeCalculationsBtn').click();ready(page)
    assert page.locator('#subspacePanel').is_visible()
    assert page.locator('#modeCalculationsBtn').get_attribute('aria-checked')=='true'
    # Orbiting is not a selection click; Shift-click preserves an included atom.
    point=page.evaluate('()=>VibeMolTesting.projectActiveAtomToClient(4)')
    page.mouse.move(point['x'],point['y']);page.mouse.down();page.mouse.move(point['x']+30,point['y']+20,steps=5);page.mouse.up();ready(page)
    assert page.evaluate('()=>VibeMolCalculations.state().selections.length')==0
    # Actual viewport picks accumulate; clicking a selected atom again removes it.
    for index in [4,5,6]:
        point=page.evaluate('i=>VibeMolTesting.projectActiveAtomToClient(i)',index)
        page.mouse.click(point['x'],point['y']);ready(page)
    result=page.evaluate('()=>VibeMolCalculations.export()')
    assert result['specs']==[] and result['counts']['minao']==0,result
    assert page.evaluate('()=>VibeMolCalculations.state().selectedAtomIds.length')==3
    page.get_by_role('checkbox',name='2p shell',exact=True).click();ready(page)
    assert page.evaluate('()=>VibeMolCalculations.export().specs')==['C(2p)']
    point=page.evaluate('()=>VibeMolTesting.projectActiveAtomToClient(4)')
    page.keyboard.down('Shift');page.mouse.click(point['x'],point['y']);page.keyboard.up('Shift');ready(page)
    assert page.evaluate('()=>VibeMolCalculations.state().selections.length')==3
    cache=page.evaluate('()=>VibeMolCalculations.cacheSize()')
    assert cache==3,cache  # Nine selected functions share three carbon meshes.
    assert page.locator('#avas-method').input_value()=='cumulative'
    page.locator('#avas-method').select_option('total')
    assert page.locator('#avas-total').input_value()=='9'
    assert not page.get_by_role('button',name='Use selection count',exact=True).is_visible()
    page.get_by_role('button',name='π planes',exact=True).click()
    page.get_by_role('button',name='Fit selected atoms',exact=True).click();ready(page)
    assert page.locator('#avas-total').input_value()=='3'
    assert 'num_active=3,' in page.evaluate('()=>VibeMolCalculations.export().code')
    page.locator('#avas-reference').select_option('GHF');ready(page)
    assert page.locator('#avas-total').input_value()=='3'
    assert 'num_active=6,' in page.evaluate('()=>VibeMolCalculations.export().code')
    page.locator('#avas-reference').select_option('RHF');ready(page)
    result=input_artifact(page,'avas-cyclopropene')
    assert result['counts']=={'minao':9,'orbitals':3,'atoms':3},result
    assert result['planes']==[['C1-3']]
    page.wait_for_function("()=>avasScene.getObjectByName('calculation-subspace').children.some(o=>o.name==='avas-pi-plane')")
    settings(page,{'view.camera.x':3,'view.camera.y':8,'view.camera.z':5,'view.target.x':0,'view.target.y':0,'view.target.z':0});settle(page)
    page.screenshot(path=str(p.ARTIFACTS/'avas-cyclopropene.png'))
    page.locator('#avas-total').fill('4');page.locator('#avas-total').dispatch_event('change')
    # Component editing cannot leave both a shell and one component selected.
    page.get_by_role('button',name='Edit orbitals for C1',exact=True).click()
    page.get_by_role('button',name='2p components',exact=True).click()
    page.get_by_role('checkbox',name='2px orbital',exact=True).click();ready(page)
    assert page.get_by_role('checkbox',name='2px orbital',exact=True).evaluate('e=>e===document.activeElement')
    result=page.evaluate('()=>VibeMolCalculations.export()')
    assert 'C1(2px)' in result['specs'] and 'C1(2p)' not in result['specs'],result
    assert page.get_by_role('checkbox',name='Include C1 in π plane').is_disabled()
    assert 'do not apply to components' in page.locator('#subspacePanel [data-plane-atoms]').inner_text()
    assert page.locator('#avas-total').input_value()=='4'
    page.locator('#avas-method').select_option('cumulative');page.locator('#avas-method').select_option('total')
    page.locator('#modeDisplayBtn').click();page.locator('#modeCalculationsBtn').click();ready(page)
    assert page.locator('#avas-total').input_value()=='4'
    page.get_by_role('button',name='Use selection count',exact=True).click()
    assert page.locator('#avas-total').input_value()=='7'
    assert not page.get_by_role('button',name='Use selection count',exact=True).is_visible()
    page.get_by_role('button',name='Edit orbitals for C1',exact=True).click()
    for component in ['py','pz']:page.get_by_role('checkbox',name='2'+component+' orbital',exact=True).click()
    ready(page);assert page.evaluate('()=>VibeMolCalculations.export().specs')==['C(2p)']
    assert page.locator('#avas-total').input_value()=='9'
    # New files do not inherit another molecule's selection.
    assert p.load(page,[{'name':'formaldehyde.xyz','text':H2CO}])['ok'];page.locator('#modeCalculationsBtn').click();ready(page)
    for index in [0,1]:
        page.evaluate('i=>VibeMolCalculations.toggleAtom(i)',index)
        page.evaluate('i=>VibeMolCalculations.selectComponent(i,"2p","px")',index)
    ready(page);result=input_artifact(page,'avas-formaldehyde')
    assert result['specs']==['C(2px)','O(2px)'] and result['counts']['orbitals']==2,result
    page.locator('#subspacePanel [data-planes]').evaluate('el=>el.open=false')
    page.keyboard.press('Escape')
    settings(page,{'view.camera.x':3,'view.camera.y':8,'view.camera.z':5,'view.target.x':0,'view.target.y':0,'view.target.z':0});settle(page)
    page.screenshot(path=str(p.ARTIFACTS/'avas-formaldehyde.png'))
    page.locator('#themeToggleShell').click();settle(page)
    page.screenshot(path=str(p.ARTIFACTS/'avas-formaldehyde-dark.png'))
    page.locator('#themeToggleShell').click()
    saved=page.evaluate('()=>VibeMolSession.export()')
    assert page.evaluate('s=>VibeMolSession.import(s)',saved)['ok']
    page.locator('#modeCalculationsBtn').click();ready(page)
    assert page.evaluate('()=>VibeMolCalculations.export().specs')==['C(2px)','O(2px)']
    assert page.evaluate('()=>VibeMolCalculations.state().options.total')==2
    assert page.evaluate('()=>VibeMolCalculations.state().options.totalFollowsSelection')
    page.evaluate('()=>VibeMolCalculations.configure({method:"total",total:5})');ready(page)
    saved=page.evaluate('()=>VibeMolSession.export()')
    assert page.evaluate('s=>VibeMolSession.import(s)',saved)['ok']
    page.locator('#modeCalculationsBtn').click();ready(page)
    page.get_by_role('button',name='Remove O1',exact=True).click();ready(page)
    assert page.locator('#avas-total').input_value()=='5'
    assert not page.evaluate('()=>VibeMolCalculations.state().options.totalFollowsSelection')
    page.get_by_role('button',name='Use selection count',exact=True).click()
    assert page.locator('#avas-total').input_value()=='1'
    assert p.load(page,[{'name':'N2.xyz','text':'N 0 0 0\nN 0 0 1.2'}])['ok'];page.locator('#modeCalculationsBtn').click();ready(page)
    for index in [0,1]:page.evaluate('i=>VibeMolCalculations.selectShell(i,"2p")',index)
    page.evaluate('()=>VibeMolCalculations.configure({method:"separate",docc:3,uocc:3})');ready(page)
    rhf=input_artifact(page,'avas-n2-rhf');assert 'num_active_docc=3' in rhf['code']
    page.locator('#avas-reference').select_option('GHF');ready(page)
    ghf=input_artifact(page,'avas-n2-ghf');assert 'num_active_docc=6' in ghf['code'] and 'num_active_uocc=6' in ghf['code']
    assert ghf['counts']['orbitals']==12
    # Preview materials and phase colors follow live Look changes.
    page.evaluate('()=>VibeMolAppearanceLooks.edit("material",{model:"physical",roughness:0.23,tint:"#ffffff"})');ready(page)
    settings(page,{'surface.colorScheme':'custom','surface.posColor':'#16aa44','surface.negColor':'#bb2233'});ready(page)
    preview=page.evaluate('''()=>avasScene.getObjectByName('calculation-subspace').children.filter(o=>o.userData.minao).map(o=>({
      sign:o.name.split(':').at(-1),color:o.material.color.getHexString(),roughness:o.material.roughness,
    }))''')
    assert preview and all(m['color']==('16aa44' if m['sign']=='pos' else 'bb2233') and m['roughness']==0.23 for m in preview),preview
    # Surfaces stay loaded/visible in graph state and return on leaving the mode.
    assert p.load(page,[{'name':'orbital.cube','text':p.cube(1)}])['ok'];page.locator('#modeDisplayBtn').click();settle(page)
    before=p.snapshot(page)
    page.locator('#modeCalculationsBtn').click();ready(page)
    assert page.evaluate("()=>{let n=0;avasScene.traverseVisible(o=>{if(o.userData.sceneLayerId&&o.material?.userData.vmAppearanceTarget==='surfaces')n++});return n}")==0
    assert [l.get('visible') for s in p.snapshot(page)['scenes'] for l in s['layers']]==[l.get('visible') for s in before['scenes'] for l in s['layers']]
    page.locator('#modeDisplayBtn').click();settle(page)
    assert page.evaluate("()=>{let n=0;avasScene.traverseVisible(o=>{if(o.userData.sceneLayerId&&o.material?.userData.vmAppearanceTarget==='surfaces')n++});return n}")>0
    assert not page.locator('#subspacePanel').is_visible()
    page.locator('#modeCalculationsBtn').click();ready(page)
    page.get_by_role('button',name='Clear subspace',exact=True).click()
    assert page.evaluate('()=>VibeMolCalculations.export().counts.minao')==0
    page.get_by_role('button',name='Close Subspace',exact=True).click()
    page.locator('#modeDisplayBtn').click();page.locator('#modeCalculationsBtn').click();settle(page)
    assert not page.locator('#subspacePanel').is_visible()  # Respect deliberate close across modes.
    for width in [1440,850,390,320]:
        page.set_viewport_size({'width':width,'height':900});settle(page)
        assert page.locator('#modeCalculationsBtn').is_visible()
        assert page.evaluate('()=>document.documentElement.scrollWidth<=innerWidth'),width
    print('[calculations] viewport picking, shell/component states, pi planes, automatic/manual totals, RHF/GHF output, sessions, surface restoration and responsive bar: passed',flush=True)


def popup_selection(page,url):
    page.goto(url+'?appearanceStudy=1');page.wait_for_function('()=>window.VibeMolCalculations')
    assert p.load(page,[{'name':'CNOH.xyz','text':'C 0 0 0\nN 1.4 0 0\nO 0 1.4 0\nH 0 0 1.1'}])['ok']
    page.locator('#modeCalculationsBtn').click();ready(page)
    popup=page.locator('#calculationOrbitalsPopup')
    page.evaluate('()=>VibeMolCalculations.toggleAtom(0)');ready(page)
    assert popup.is_visible() and page.evaluate('()=>VibeMolCalculations.export().counts.minao')==0
    assert not popup.locator('[data-components]').is_visible()
    assert popup.get_by_role('button',name='Deselect atoms',exact=True).count()==0
    anchor=page.evaluate('()=>VibeMolTesting.projectActiveAtomToClient(0)')
    box=popup.bounding_box()
    assert max(box['x']-anchor['x'],anchor['x']-box['x']-box['width'],0)<100, (anchor,box)
    assert max(box['y']-anchor['y'],anchor['y']-box['y']-box['height'],0)<100, (anchor,box)
    popup.get_by_role('button',name='2p components',exact=True).click()
    popup.get_by_role('checkbox',name='2px orbital',exact=True).click();ready(page)
    assert page.evaluate('()=>VibeMolCalculations.export().specs')==['C(2px)']
    canvas=page.locator('#canvas').bounding_box();page.mouse.click(canvas['x']+12,canvas['y']+12)
    assert not popup.is_visible() and page.evaluate('()=>VibeMolCalculations.state().selectedAtomIds')==[]
    assert page.evaluate('()=>VibeMolCalculations.export().specs')==['C(2px)']
    page.evaluate('()=>VibeMolCalculations.selectAtoms([0,1])');ready(page)
    assert popup.get_by_role('checkbox',name='2p shell',exact=True).get_attribute('aria-checked')=='mixed'
    popup.get_by_role('button',name='2p components',exact=True).click()
    assert popup.get_by_role('checkbox',name='2px orbital',exact=True).get_attribute('aria-checked')=='false'
    popup.get_by_role('checkbox',name='2px orbital',exact=True).click();ready(page)
    assert page.evaluate('()=>VibeMolCalculations.export().specs')==['C(2px)','N(2px)']
    assert not popup.locator('[data-plane]').is_visible()
    page.evaluate('()=>VibeMolCalculations.selectAtoms([0,1,2])');ready(page)
    assert popup.locator('[data-plane]').is_visible()
    assert popup.get_by_role('button',name='Fit π plane',exact=True).is_disabled()
    popup.get_by_role('checkbox',name='2p shell',exact=True).click();ready(page)
    assert popup.locator('[data-components]').is_visible()  # Selecting a degenerate shell opens its list.
    shell_box=popup.get_by_role('checkbox',name='2p shell',exact=True).bounding_box()
    list_box=popup.locator('[data-components]').bounding_box()
    assert list_box['y']>=shell_box['y']+shell_box['height']
    assert list_box['x']<=shell_box['x']+shell_box['width']/2<=list_box['x']+list_box['width']
    assert page.evaluate('()=>VibeMolCalculations.export().counts.orbitals')==9
    popup.get_by_role('button',name='Fit π plane',exact=True).click();ready(page)
    assert page.evaluate('()=>VibeMolCalculations.export().counts.orbitals')==3
    assert page.evaluate('()=>VibeMolCalculations.export().planes')==[['C1','N1','O1']]
    # Changing focus does not destroy scientific assignments or their plane.
    page.evaluate('()=>VibeMolCalculations.toggleAtom(2)');ready(page)
    assert popup.is_visible() and not popup.locator('[data-plane]').is_visible()
    assert page.evaluate('()=>VibeMolCalculations.export().counts.orbitals')==3
    page.evaluate('()=>VibeMolCalculations.toggleAtom(3)');ready(page)
    assert not popup.is_visible()
    assert 'one periodic-table row' in page.locator('#subspacePanel [data-selection-summary]').inner_text()
    assert page.get_by_role('button',name='Choose orbitals',exact=True).is_disabled()
    page.evaluate('()=>VibeMolCalculations.selectAtoms([0,1,2])');ready(page)
    popup.get_by_role('button',name='Remove π plane',exact=True).click();ready(page)
    assert page.evaluate('()=>VibeMolCalculations.export().counts.orbitals')==9
    # The popup uses the standard movable shell and retains placement through edits.
    handle=popup.locator('[data-vm-drag-handle]');handle.focus()
    before=popup.bounding_box();page.keyboard.press('Alt+ArrowLeft');after=popup.bounding_box()
    assert after['x']<before['x']
    popup.get_by_role('button',name='2p components',exact=True).click()
    popup.get_by_role('checkbox',name='2px orbital',exact=True).click();ready(page)
    assert abs(popup.bounding_box()['x']-after['x'])<1
    page.keyboard.press('Escape');assert not popup.is_visible()
    assert page.locator('#modeCalculationsBtn').get_attribute('aria-checked')=='true'
    page.get_by_role('button',name='Choose orbitals',exact=True).click()
    assert popup.is_visible() and abs(popup.bounding_box()['x']-after['x'])<1
    page.screenshot(path=str(p.ARTIFACTS/'avas-group-popup.png'))
    assigned=page.evaluate('()=>VibeMolCalculations.export().specs')
    saved=page.evaluate('()=>VibeMolSession.export()')
    assert page.evaluate('s=>VibeMolSession.import(s)',saved)['ok']
    page.locator('#modeCalculationsBtn').click();ready(page)
    assert not popup.is_visible() and page.evaluate('()=>VibeMolCalculations.state().selectedAtomIds')==[]
    assert page.evaluate('()=>VibeMolCalculations.export().specs')==assigned
    page.get_by_role('button',name='Edit orbitals for C1',exact=True).click();ready(page)
    assert popup.is_visible()
    popup.get_by_role('button',name='Remove orbitals',exact=True).click();ready(page)
    assert 'C(2px)' not in page.evaluate('()=>VibeMolCalculations.export().specs')
    page.locator('#modeDisplayBtn').click();assert not popup.is_visible()
    page.locator('#modeCalculationsBtn').click();ready(page)
    assert not popup.is_visible()
    page.set_viewport_size({'width':390,'height':850})
    page.evaluate('()=>VibeMolCalculations.selectAtoms([1,2])');ready(page)
    bounds=popup.bounding_box()
    assert bounds['x']>=0 and bounds['x']+bounds['width']<=390 and bounds['y']+bounds['height']<=850
    print('[calculations] atom-only selection, same-row group popup, mixed shell states, planes, movement, dismissal, sessions and compact layout: passed',flush=True)


def transition_metals(page,url):
    page.goto(url+'?appearanceStudy=1');page.wait_for_function('()=>window.VibeMolCalculations')
    assert p.load(page,[{'name':'FeNi.xyz','text':'Fe 0 0 0\nNi 0 0 2.4'}])['ok']
    page.locator('#modeCalculationsBtn').click();ready(page)
    popup=page.locator('#calculationOrbitalsPopup')
    page.evaluate('()=>VibeMolCalculations.selectAtoms([0])');ready(page)
    def shell_names():
        return popup.locator('[data-shells] button[aria-label$=" shell"]').all_text_contents()
    assert shell_names()==['1s','2s','2p','3s','3p','4s','3d','4p','5s','4d','5p']
    assert page.evaluate('()=>VibeMolCalculations.export().counts.minao')==0
    popup.get_by_role('checkbox',name='3d shell',exact=True).click();ready(page)
    popup.get_by_role('button',name='4d components',exact=True).click()
    assert popup.locator('[aria-label$=" orbital"]').count()==5
    popup.get_by_role('checkbox',name='4dz2 orbital',exact=True).click();ready(page)
    assert page.evaluate('()=>VibeMolCalculations.export().specs')==['Fe(3d)','Fe(4dz2)']
    page.evaluate('()=>VibeMolCalculations.selectAtoms([0,1])');ready(page)
    assert shell_names()==['1s','2s','2p','3s','3p','4s','3d','4p','5s','4d','5p']
    popup.get_by_role('checkbox',name='3d shell',exact=True).click();ready(page)
    popup.get_by_role('checkbox',name='4d shell',exact=True).click();ready(page)
    result=input_artifact(page,'avas-transition-double-shell')
    assert result['specs']==['Fe(3d)','Fe(4d)','Ni(3d)','Ni(4d)']
    assert result['counts']['minao']==20 and result['counts']['orbitals']==20
    page.evaluate('()=>{VibeMolCalculations.selectShell(0,"5d");VibeMolCalculations.selectComponent(1,"6d","dxy");}')
    ready(page)
    assert page.evaluate('()=>VibeMolCalculations.export().specs')==result['specs']
    page.screenshot(path=str(p.ARTIFACTS/'avas-transition-double-shell.png'))
    print('[calculations] transition-metal single/group double shells, individual d components, counts and API limits: passed',flush=True)


def rohf(page,url):
    page.goto(url+'?appearanceStudy=1');page.wait_for_function('()=>window.VibeMolCalculations')
    assert p.load(page,[{'name':'NO.xyz','text':'N 0 0 0\nO 0 0 1.15'}])['ok']
    page.locator('#modeCalculationsBtn').click();ready(page)
    ms=page.locator('#avas-ms')
    assert ms.is_visible() and ms.is_disabled()
    for index in [0,1]:page.evaluate('i=>VibeMolCalculations.selectShell(i,"2p")',index)
    ready(page)
    page.locator('#avas-reference').select_option('ROHF');ready(page)
    assert ms.is_enabled() and ms.get_attribute('step')=='0.5'
    assert 'requires half-integer ms' in page.locator('[data-validation]').inner_text()
    assert page.get_by_role('button',name='Copy input',exact=True).is_disabled()
    def spin(value):
        ms.fill(str(value));ms.dispatch_event('change');settle(page)
    spin(.5)
    page.locator('#avas-method').select_option('total');ready(page)
    result=input_artifact(page,'avas-no-rohf')
    assert 'rohf = ROHF(charge=0, ms=0.5)(system)' in result['code']
    assert 'State(nel=rohf.nel, multiplicity=2, ms=0.5)' in result['code']
    assert result['counts']['orbitals']==6 and 'num_active=6,' in result['code']
    assert page.get_by_label('Additional active',exact=True).input_value()=='6'
    assert 'singly occupied orbitals' in page.locator('[data-reference-note]').inner_text()
    # ms is disabled and ignored for other references, and retained on return.
    spin(-.5);page.locator('#avas-reference').select_option('GHF');ready(page)
    assert ms.is_disabled() and 'ms=' not in page.evaluate('()=>VibeMolCalculations.export().code')
    assert 'num_active=12,' in page.evaluate('()=>VibeMolCalculations.export().code')
    page.locator('#avas-reference').select_option('RHF')
    assert ms.is_disabled()
    page.locator('#avas-charge').fill('1');page.locator('#avas-charge').dispatch_event('change')
    assert 'RHF(charge=1)(system)' in page.evaluate('()=>VibeMolCalculations.export().code')
    assert 'multiplicity=1, ms=0.0' in page.evaluate('()=>VibeMolCalculations.export().code')
    page.locator('#avas-reference').select_option('ROHF')
    assert ms.input_value()=='-0.5' and ms.is_enabled()
    assert 'requires integer ms' in page.locator('[data-validation]').inner_text()
    spin(1)
    assert 'multiplicity=3, ms=1' in page.evaluate('()=>VibeMolCalculations.export().code')
    spin(.25);assert 'steps of 0.5' in page.locator('[data-validation]').inner_text()
    spin(9);assert 'half the electron count' in page.locator('[data-validation]').inner_text()
    page.locator('#avas-charge').fill('0');page.locator('#avas-charge').dispatch_event('change');spin(.5)
    saved=page.evaluate('()=>VibeMolSession.export()')
    assert page.evaluate('s=>VibeMolSession.import(s)',saved)['ok']
    page.locator('#modeCalculationsBtn').click();ready(page)
    assert page.locator('#avas-reference').input_value()=='ROHF' and ms.input_value()=='0.5'
    assert ms.is_enabled() and not page.evaluate('()=>VibeMolCalculations.export().validation.errors')
    page.locator('#subspacePanel [data-fields]').scroll_into_view_if_needed();settle(page)
    page.screenshot(path=str(p.ARTIFACTS/'avas-no-rohf.png'))
    # An ROHF active space may consist only of its automatic singly occupied orbitals.
    page.locator('#avas-method').select_option('separate')
    for key in ['docc','uocc']:
        page.locator('#avas-'+key).fill('0');page.locator('#avas-'+key).dispatch_event('change')
    assert not page.evaluate('()=>VibeMolCalculations.export().validation.errors')
    assert 'num_active_docc=0,' in page.evaluate('()=>VibeMolCalculations.export().code')
    spin(-.5);assert 'For negative ms, forte2 AVAS' in page.locator('[data-validation]').inner_text()
    page.locator('#avas-method').select_option('total')
    assert 'multiplicity=2, ms=-0.5' in page.evaluate('()=>VibeMolCalculations.export().code')
    print('[calculations] ROHF ms control, spin validation, input preparation, reference switching and session restoration: passed',flush=True)


def expanded_shells(page,url):
    page.goto(url+'?appearanceStudy=1');page.wait_for_function('()=>window.VibeMolCalculations')
    popup=page.locator('#calculationOrbitalsPopup')
    examples=[('C',['1s','2s','2p','3s','3p']),('S',['1s','2s','2p','3s','3p','4s','4p']),
              ('Fe',['1s','2s','2p','3s','3p','4s','3d','4p','5s','4d','5p'])]
    for element,expected in examples:
        if page.locator('#modeCalculationsBtn').get_attribute('aria-checked')=='true':page.locator('#modeDisplayBtn').click()
        assert p.load(page,[{'name':element+'.xyz','text':element+' 0 0 0'}])['ok']
        page.locator('#modeCalculationsBtn').click();ready(page)
        page.evaluate('()=>VibeMolCalculations.selectAtoms([0])');ready(page)
        assert popup.locator('[data-shell]').all_text_contents()==expected
        shell=expected[-1]
        popup.get_by_role('button',name=shell+' components',exact=True).click()
        popup.get_by_role('checkbox',name=shell+'x orbital',exact=True).click();ready(page)
        result=input_artifact(page,'avas-expanded-'+element)
        assert result['specs']==[element+'('+shell+'x)'] and result['counts']['minao']==1
        if element=='C':
            assert 'minao_basis_set="cc-pvtz"' in result['code']
            assert page.locator('#avas-minao').input_value()=='cc-pvtz'
            assert 'cc-pvtz · includes next-shell' in page.locator('[data-preview-basis]').inner_text()
            saved=page.evaluate('()=>VibeMolSession.export()')
            assert page.evaluate('s=>VibeMolSession.import(s)',saved)['ok']
            page.locator('#modeCalculationsBtn').click();ready(page)
            assert page.evaluate('()=>VibeMolCalculations.export().specs')==['C(3px)']
            assert page.locator('#avas-minao').input_value()=='cc-pvtz'
            page.evaluate('()=>VibeMolCalculations.selectAtoms([0])');ready(page)
        page.mouse.move(800,140);page.screenshot(path=str(p.ARTIFACTS/('avas-expanded-'+element+'.png')))
    for width,height in [(390,850),(320,568),(740,340)]:
        page.set_viewport_size({'width':width,'height':height});ready(page)
        box=popup.bounding_box()
        assert box['x']>=0 and box['x']+box['width']<=width+1 and box['y']+box['height']<=height+1,box
        popup.get_by_role('checkbox',name='5pz orbital',exact=True).click();ready(page)
        assert not popup.evaluate('(e)=>e.scrollWidth>e.clientWidth'),box
    print('[calculations] C/S/Fe expanded menus, next-shell components, matching basis/input, session round-trip and compact metal menu: passed',flush=True)


def main():
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True)
        try:
            context=browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1)
            page=context.new_page();errors=[];console=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('console',lambda m:console.append(m.text) if m.type=='error' else None)
            page.on('dialog',lambda d:d.dismiss())
            try:
                run(page,url)
                page.set_viewport_size({'width':1440,'height':1000});popup_selection(page,url)
                page.set_viewport_size({'width':1440,'height':1000});rohf(page,url)
                transition_metals(page,url)
                expanded_shells(page,url)
                assert not errors,errors;assert not console,console
            except Exception:
                p.write_failure_artifacts(page,p.ARTIFACTS,'calculations',errors,console);raise
        finally:browser.close()

if __name__=='__main__':main()
