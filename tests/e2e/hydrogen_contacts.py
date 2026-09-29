#!/usr/bin/env python3
"""Hydrogen-bond annotations: per-object UI, chemistry isolation and live coordinates."""
import copy
import os
import premerge as p

WATER = [('O',0,0,0),('H',1,0,0),('O',2.8,0,0),('H',3.15,.9,0),('H',-.3,.9,0),('H',3.15,-.9,0)]

def xyz(atoms=WATER):
    return '6\nWater dimer\n'+'\n'.join(' '.join(map(str,a)) for a in atoms)+'\n'

def count(page):
    return page.evaluate('()=>VibeMolTesting.getMoleculeRenderSnapshot().hydrogenBondCount')

def molecules(page):
    return [layer for scene in p.snapshot(page)['scenes'] for layer in scene['layers'] if layer['kind']=='molecule']

def select(page, id):
    page.locator('.vm-outliner-row[data-id="'+id+'"]').click()


def run(page,url):
    page.goto(url+'?appearanceStudy=1');page.wait_for_function('()=>window.VibeMolWorkbench')
    page.evaluate('()=>VibeMolWorkbench.applyLayout({})')
    assert p.load(page,[{'name':'water-dimer.xyz','text':xyz()}])['ok']
    first=molecules(page)[0]['id']
    page.evaluate('()=>VibeMolWorkbench.open("inspector")');select(page,first)
    toggle=page.locator('#inspectorShowHydrogenBonds')
    assert toggle.is_checked() and count(page)==1
    original=page.evaluate('()=>VibeMolStructure.exportActive().volume.bonds')
    assert len(original)==4,original
    settings=page.evaluate('()=>VibeMolAppearanceLooks.snapshot().settings')
    page.locator('#inspectorShowBonds').uncheck()
    assert count(page)==1 and page.evaluate('()=>VibeMolTesting.getMoleculeRenderSnapshot().bondCarrierCount')==0
    toggle.uncheck();assert count(page)==0
    assert page.evaluate('()=>VibeMolStructure.exportActive().volume.bonds')==original
    assert page.evaluate('()=>VibeMolAppearanceLooks.snapshot().settings')==settings
    toggle.check();page.locator('#inspectorShowBonds').check()
    for name in ['Measure','Edit','Display']:
        page.locator('#mode'+name+'Btn').click();assert count(page)==1

    # Coordinates and undo update annotations; they do not create chemical bonds.
    page.locator('#modeEditBtn').click()
    hit=page.evaluate('''()=>{const h=VibeMolTesting.projectActiveAtomToClient(1),a=VibeMolTesting.projectActiveAtomToClient(2);
      return VibeMolTesting.pickEditHitAtClient((h.x+a.x)/2,(h.y+a.y)/2);}''')
    assert hit=={'atomIndex':-1,'bondSection':''},hit
    page.evaluate('()=>VibeMolWorkbench.open("coordsPanel")')
    page.locator('#coordsContent tr[data-atom-index="2"] [data-edit-field="x"]').click()
    editor=page.locator('#coordsContent .coordsCellEditor');editor.fill('6.0');editor.press('Enter')
    assert count(page)==0
    page.locator('#canvas').focus();page.keyboard.press('ControlOrMeta+z');assert count(page)==1
    page.locator('#modeDisplayBtn').click()
    page.evaluate('()=>VibeMolWorkbench.close("coordsPanel")')
    page.screenshot(path=str(p.ARTIFACTS/'hydrogen-contacts-on.png'))

    # Independent structure choices and durable session state, separate from Looks.
    toggle.uncheck()
    translated=[(s,x+8,y,z) for s,x,y,z in WATER]
    assert p.load(page,[{'name':'second-dimer.xyz','text':xyz(translated)}],clear_first=False)['ok']
    second=next(layer['id'] for layer in molecules(page) if layer['id']!=first)
    select(page,second);assert toggle.is_checked() and count(page)==1
    select(page,first);assert not toggle.is_checked()
    select(page,second);assert toggle.is_checked()
    saved=page.evaluate('()=>VibeMolSession.export()')
    assert page.evaluate('s=>VibeMolSession.import(s)',saved)['ok']
    select(page,first);assert not toggle.is_checked()
    select(page,second);assert toggle.is_checked() and count(page)==1
    old=copy.deepcopy(saved)
    for scene in old['graph']['scenes']:
        scene['visible']=True
        for layer in scene['layers']:
            layer.get('moleculeDisplay',{}).pop('showHydrogenBonds',None)
    assert page.evaluate('s=>VibeMolSession.import(s)',old)['ok']
    assert count(page)==2, 'Older sessions inherit the enabled default'
    page.locator('#inspectorLookTab').click();page.locator('#lookPreset').select_option('classic')
    assert count(page)==2

    # Playback changes distances in-place; a hidden chemical-bond layer must
    # still produce newly formed contacts after a frame with none.
    apart=[(s,x+(4 if i in [2,3,5] else 0),y,z) for i,(s,x,y,z) in enumerate(WATER)]
    assert p.load(page,[{'name':'water-trajectory.xyz','text':xyz(apart)+xyz()}])['ok']
    page.evaluate('()=>VibeMolWorkbench.open("inspector")')
    page.locator('#inspectorObjectTab').click();select(page,molecules(page)[0]['id'])
    page.locator('#inspectorShowBonds').uncheck();assert count(page)==0
    page.evaluate('()=>{const frame=document.getElementById("trajectoryFrame");frame.value="1";frame.dispatchEvent(new Event("input",{bubbles:true}));}')
    assert count(page)==1
    page.evaluate('()=>{const frame=document.getElementById("trajectoryFrame");frame.value="0";frame.dispatchEvent(new Event("input",{bubbles:true}));}')
    assert count(page)==0
    # Cube atom coordinates are bohr; detection still uses angstrom distances.
    header=['Water dimer','Bohr coordinates','6 0 0 0','2 1 0 0','2 0 1 0','2 0 0 1']
    rows=[' '.join(map(str,[8 if s=='O' else 1,0,x/0.529177210903,y/0.529177210903,z/0.529177210903])) for s,x,y,z in WATER]
    assert p.load(page,[{'name':'water.cube','text':'\n'.join(header+rows+['0 0 0 0 0 0 0 0'])}])['ok']
    assert count(page)==1
    print('[hydrogen contacts] defaults, independent bonds, modes, edit/undo, independent objects, sessions, looks and trajectory: passed',flush=True)


def main():
    with p.run_http_server(p.ROOT) as url,p.sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle='+os.environ.get('VIBEMOL_TEST_ANGLE','swiftshader')])
        page=browser.new_page(viewport={'width':1440,'height':1000})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('dialog',lambda d:d.dismiss())
        try:
            run(page,url);assert not errors,errors
        except Exception:
            p.write_failure_artifacts(page,p.ARTIFACTS,'hydrogen-contacts-failure',errors,[]);raise
        finally:browser.close()


if __name__=='__main__':main()
