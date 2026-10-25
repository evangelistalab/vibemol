"""Private Escape-table readback and native integration checks within axis_gizmo.

The browser receives an observed copy of app.js, following PR36's private-registry
probe pattern. No production API or disk source is modified. The table checker
separately enumerates every level/mode/origin and all Edit sub-ladder states.
"""
import hashlib
import importlib.metadata
import json
from pathlib import Path

import premerge as p
from helpers import wait_for_presented_state
from assertion_contract import numbers_close

ROOT = Path(__file__).resolve().parents[2]
EVENT_OBSERVER = '''window.addEventListener('keydown', event => {
  if(event.key==='Escape') window.__escapeNativeEvent=event;
},true);
window.addEventListener('keydown', event => {
  if(event.key==='Escape') window.__escapeReachedBubble=true;
});'''
EXPOSE = '''  window.__escapeContract = {
    table: ESCAPE_LADDER, resolve: resolveEscapeDecision, execute: executeEscapeDecision,
    records: [], actions: [], completions: [],
    setSelectionTargets: mask => {
      clearEditSelectionsOnEmptyClick();
      setEditAtomSelection(mask & 1 ? [0] : []);
      setTransformSelection(mask & 2 ? [1] : []);
      if (mask & 4) {
        const atoms=volumes[currentIndex].vol.atoms;
        bondCenterSelectionState=normalizeBondCenterSelectionIds(ensureAtomId(atoms[0]),ensureAtomId(atoms[1]));
      }
    },
    state: () => ({mode:currentMode, focus:document.activeElement?.id || '',
      edit:getEditToolState(), selection:(currentMode===MODES.MEASURE ? editSel : window.VibeMolTesting.getEditSelectionIndices()).slice(),
      targets:{atoms:getEditAtomSelection(),transform:transformSelectionIndices.slice(),bondCenter:bondCenterSelectionState},
      camera:window.VibeMolTesting.getCameraSnapshot(),
      help:isHelpOpen(), focusMode:window.VibeMolWorkbench?.snapshot().focus || false}),
  };
'''


def check(condition, actual, expected, label):
    print('[escape-contract] '+json.dumps(dict(check=label,actual=actual,expected=expected)),flush=True)
    assert condition, (label,actual,expected)


def observed_source():
    original = (ROOT/'assets/app/js/app.js').read_text()
    changes = [
        ('  window.VibeMolPreset = getSceneGraphAwarePresetPublicApi();\n',
         '  window.VibeMolPreset = getSceneGraphAwarePresetPublicApi();\n'+EXPOSE),
        ('      const decision = resolveEscapeDecision(context);\n',
         '      const decision = resolveEscapeDecision(context);\n'
         '      window.__escapeContract.records.push({mode:context.mode,origin:context.origin,decision});\n'),
        ('    if (offer.run() === false)',
         '    if ((window.__escapeContract.actions.push(decision.action), offer.run()) === false)'),
        ('      focus.run();\n',
         '      window.__escapeContract.completions.push("axis.focus-canvas");\n      focus.run();\n'),
    ]
    served=original
    for before,after in changes:
        check(served.count(before)==1,served.count(before),1,'unique observer anchor '+before.strip())
        served=served.replace(before,after)
    return served,dict(sourceSha256=hashlib.sha256(original.encode()).hexdigest(),
                      servedSha256=hashlib.sha256(served.encode()).hexdigest())


def press(page, report, label, action, *, detail=None, selection=None, mode=None, focus=None, targets=None):
    before=page.evaluate('()=>__escapeContract.state()')
    page.evaluate('()=>{__escapeContract.records=[];__escapeContract.actions=[];__escapeContract.completions=[];window.__escapeNativeEvent=null;window.__escapeReachedBubble=false;}')
    page.keyboard.press('Escape')
    actual=page.evaluate('()=>({records:__escapeContract.records,actions:__escapeContract.actions,completions:__escapeContract.completions,defaultPrevented:__escapeNativeEvent?.defaultPrevented,reachedBubble:__escapeReachedBubble,after:__escapeContract.state()})')
    report['cases'].append(dict(label=label,before=before,**actual))
    expected=[] if action is None else [action]
    check(actual['actions']==expected,actual['actions'],expected,label+' exactly one applicable action')
    check(actual['defaultPrevented']==bool(expected),actual['defaultPrevented'],bool(expected),label+' consume only on a winner')
    check(actual['reachedBubble']==(not expected),actual['reachedBubble'],not expected,label+' decline preserves propagation')
    check(len(actual['records'])==1,actual['records'],'one fresh decision',label+' decision count')
    decision=actual['records'][0]['decision']
    if detail is not None:check(decision and decision['detail']==detail,decision,detail,label+' Edit branch')
    if selection is not None:check(actual['after']['selection']==selection,actual['after']['selection'],selection,label+' selection')
    if targets is not None:check(actual['after']['targets']==targets,actual['after']['targets'],targets,label+' concrete selection targets')
    if mode is not None:check(actual['after']['mode']==mode,actual['after']['mode'],mode,label+' mode')
    if focus is not None:check(actual['after']['focus']==focus,actual['after']['focus'],focus,label+' focus')
    if before['mode']==actual['after']['mode']:
        left,right=actual['after']['camera'],before['camera']
        same=all(numbers_close(left[part][axis],right[part][axis],rel_tol=0,abs_tol=1e-6)
                 for part in ['camera','target','up'] for axis in 'xyz')
        check(same and left['mode']==right['mode'],left,right,label+' camera unchanged (existing axis tolerance)')
    return actual


def prepare(page, mode):
    page.evaluate('()=>window.VibeMolWorkbench?.setFocus(false)')
    page.locator('#mode'+{'display':'Display','measurement':'Measure','edit':'Edit','calculations':'Calculations'}[mode]+'Btn').click()
    if mode=='edit':
        if page.locator('#editTransformToolBtn').count():page.locator('#editTransformToolBtn').click()
        else:
            build=page.evaluate('()=>__escapeContract.state().edit.build')
            check(not build,build,False,'legacy initially uses Transform')
    page.evaluate('()=>{if(window.VibeMolWorkbench){VibeMolWorkbench.setFocus(false);for(const id of ["inspector","coordsPanel","editAdaptiveAddAtomPopover","editAdaptiveSymmetryPopover","calculationsPanel"])VibeMolWorkbench.close(id);}VibeMolTesting.setEditSelectionIndices([]);}')
    wait_for_presented_state(page,'()=>document.getElementById("canvas").getBoundingClientRect().width>0')


def escape_regression(browser,url):
    served,identity=observed_source()
    report=dict(**identity,browserVersion=browser.version,playwrightVersion=importlib.metadata.version('playwright'),
                cases=[],pageerrors=[],passed=False)
    output=p.ARTIFACTS/'escape-contract';output.mkdir(parents=True,exist_ok=True)
    try:
        for legacy in [False,True]:
            context=browser.new_context(viewport={'width':1512,'height':1000})
            context.add_init_script(EVENT_OBSERVER)
            page=context.new_page();page.on('pageerror',lambda error:report['pageerrors'].append(str(error)))
            page.route('**/assets/app/js/app.js*',lambda route:route.fulfill(status=200,content_type='application/javascript',body=served))
            try:
                page.goto(url+'?appearanceStudy=1'+('&workspaceLab=0' if legacy else ''))
                page.wait_for_function('()=>window.__escapeContract && window.VibeMolTesting')
                check(p.load(page,[{'name':'escape-water.xyz','text':'O 0 0 0\nH 1 0 0\nH -.3 .9 0'}])['ok'],True,True,'load native Escape fixture')
                table=page.evaluate('()=>__escapeContract.table')
                check([row['level'] for row in table]==list(range(1,8)),table,'seven ordered levels','runtime table composition')
                for mode in ['display','measurement','edit']+([] if legacy else ['calculations']):
                    for origin in ['axis','scene']:
                        prepare(page,mode)
                        if mode=='edit':page.evaluate('()=>VibeMolTesting.setEditSelectionIndices([0])')
                        if mode=='measurement':
                            page.locator('#canvas').focus();page.keyboard.press('Escape')
                            point=page.evaluate('()=>VibeMolTesting.projectActiveAtomToClient(0)')
                            hit=page.evaluate('p=>document.elementFromPoint(p.x,p.y)?.id',point)
                            check(hit=='canvas',hit,'canvas','Measure native pick eligibility')
                            page.mouse.click(point['x'],point['y'])
                            selected=page.evaluate('()=>VibeMolTesting.getMeasurementSnapshot().atomIndices')
                            check(selected==[0],selected,[0],'Measure native pick')
                        page.locator('#viewAxisNegZBtn' if origin=='axis' else '#canvas').focus()
                        action=('edit.perform' if mode=='edit' else 'axis.focus-canvas' if origin=='axis'
                                else 'mode.measure-clear' if mode=='measurement' else 'mode.calculations-exit' if mode=='calculations' else None)
                        expected_mode='display' if action=='mode.calculations-exit' else mode
                        expected_selection=([0] if origin=='axis' and mode=='measurement' else [])
                        press(page,report,('legacy' if legacy else 'Workbench')+'/'+mode+'/'+origin,action,
                              detail='clear' if mode=='edit' else None,selection=expected_selection,
                              mode=expected_mode,focus='canvas')
                # Exercise real cleanup against every combination of the three
                # authoritative selection targets, not a fabricated success
                # callback behind one generic selected=true flag.
                for origin in ['axis','scene']:
                    for mask in range(8):
                        prepare(page,'edit')
                        page.evaluate('mask=>__escapeContract.setSelectionTargets(mask)',mask)
                        before=page.evaluate('()=>__escapeContract.state()')
                        check(before['edit']['selected']==bool(mask),before['targets'],bool(mask),'selection target setup '+str(mask))
                        page.locator('#viewAxisNegZBtn' if origin=='axis' else '#canvas').focus()
                        action='edit.perform' if mask else 'axis.focus-canvas' if origin=='axis' else None
                        press(page,report,('legacy' if legacy else 'Workbench')+'/selection-targets/'+origin+'/'+str(mask),action,
                              detail='clear' if mask else None,selection=[],mode='edit',focus='canvas',
                              targets=dict(atoms=[],transform=[],bondCenter=None))
                # Empty Edit must decline, then axis focus may win. Scene has no fabricated no-op.
                prepare(page,'edit');page.locator('#viewAxisNegZBtn').focus()
                press(page,report,'empty Edit axis declines to focus','axis.focus-canvas',selection=[],mode='edit',focus='canvas')
                press(page,report,'empty Edit scene unclaimed',None,selection=[],mode='edit',focus='canvas')
                if not legacy:
                    # Native modal -> Edit clear -> Focus exit. Every press changes
                    # real state, so a cached winner or carried index fails here.
                    for count in [2,3]:
                        prepare(page,'edit');page.evaluate('()=>{VibeMolTesting.setEditSelectionIndices([0]);VibeMolWorkbench.setFocus(true);}')
                        page.locator('#canvas').focus();page.keyboard.press('?')
                        check(page.locator('#helpOverlay').get_attribute('aria-hidden')=='false',page.locator('#helpOverlay').get_attribute('aria-hidden'),'false','deep-state Help opened')
                        sequence=['help.close','edit.perform','focus.exit'][:count]
                        for index,action in enumerate(sequence):
                            press(page,report,f'{count}-press native sequence/{index+1}',action,
                                  detail='clear' if action=='edit.perform' else None,
                                  selection=[] if index else [0],mode='edit')
                        state=page.evaluate('()=>__escapeContract.state()')
                        check(state['focusMode']==(count==2),state['focusMode'],count==2,f'{count}-press Focus state')
                    # Draft cancellation must beat Edit selection clearing.
                    prepare(page,'edit');page.evaluate('()=>VibeMolTesting.setEditSelectionIndices([0])')
                    field=page.locator('#editSelectionPosition [data-selection-axis="x"]');field.focus();field.fill('9')
                    press(page,report,'selection position draft beats Edit','draft.selection-position',selection=[0],mode='edit')
                    # Menus, then the current tool: native key rather than a DOM repair.
                    prepare(page,'edit');page.evaluate('()=>VibeMolTesting.setEditSelectionIndices([0])')
                    page.locator('#workbenchPanelsBtn').click()
                    press(page,report,'Panels menu beats Edit','menu.panels',selection=[0],mode='edit')
                if legacy:
                    # Actual field-owner dispatch. The name form owns a draft;
                    # a native select has no draft and may reach its panel.
                    prepare(page,'display')
                    page.locator('#displayInspectorBtn').click();page.locator('#styleStudioBtn').click()
                    page.locator('#lookSave').click();page.locator('#lookNameInput').fill('Uncommitted Escape name')
                    press(page,report,'Looks text draft retains Studio','draft.look-name',mode='display',focus='lookSave')
                    actual=dict(studio=page.locator('#styleStudio').is_visible(),form=page.locator('#lookNameForm').is_visible())
                    check(actual==dict(studio=True,form=False),actual,dict(studio=True,form=False),'name draft before parent dismissal')
                    page.locator('#lookPreset').focus()
                    press(page,report,'native select without draft dismisses Studio','panel.style-studio',mode='display')
                    check(not page.locator('#styleStudio').is_visible(),page.locator('#styleStudio').is_visible(),False,'committed form control parent dismissal')
                # The Orbitals threshold is a live value, not a cancellable
                # inline draft. Escape must reach the owning panel even when
                # focus remains in its header rather than its table body.
                prepare(page,'display')
                check(p.load(page,[{'name':'escape-orbitals.molden','text':p.MOLDEN}])['ok'],True,True,'load Orbitals focus fixture')
                if not legacy:page.evaluate("()=>VibeMolWorkbench.open('moldenInspector')")
                page.locator('#moldenEnergyFilter').focus();page.locator('#moldenEnergyFilter').fill('')
                press(page,report,'committed Orbitals energy field closes panel','panel.list' if legacy else 'panel.workbench',mode='display')
                actual=dict(open=page.locator('#moldenInspector').evaluate("el=>el.classList.contains('open')"),ariaHidden=page.locator('#moldenInspector').get_attribute('aria-hidden'))
                check(actual==dict(open=False,ariaHidden='true'),actual,dict(open=False,ariaHidden='true'),'Orbitals live field parent dismissal')
                if legacy:
                    page.locator('#viewPanelBtn').click();page.locator('#camX').focus()
                    press(page,report,'committed legacy Camera field closes its window','legacy-window.close',mode='display')
                    actual=dict(open=page.locator('#sidePanel').evaluate("el=>el.classList.contains('open')"),ariaHidden=page.locator('#sidePanel').get_attribute('aria-hidden'))
                    check(actual==dict(open=False,ariaHidden='true'),actual,dict(open=False,ariaHidden='true'),'legacy committed field does not fabricate a draft')
                check(not report['pageerrors'],report['pageerrors'],[],'native Escape page errors')
            except Exception:
                p.write_failure_artifacts(page,output,'escape-contract-failure',report['pageerrors'],[])
                raise
            finally:context.close()
        report['passed']=True
    finally:
        (output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
