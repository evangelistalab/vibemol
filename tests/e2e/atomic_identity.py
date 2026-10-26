"""Input-boundary #5 regression; failure reports must precede any live replacement."""
import json
import premerge as p


def cube(z,two=False):
    return '\n'.join(['Identity boundary','one voxel','1 0 0 0','1 1 0 0',
        '1 0 1 0','1 0 0 1',f'{z} 0 0 0 0','0.1 0.2 0.3 0.4'if two else'0.1'])


def molden(z):
    return '\n'.join(['[Molden Format]','[Atoms] Angs',f'C 1 {z} 0 0 0',
        '[GTO]','1 0','s 1 1.0','1.0 1.0','[MO]','Sym= A1','Ene= -0.5',
        'Spin= Alpha','Occup= 2.0','1 1.0'])


def run(page,dialogs):
    assert p.load(page,[dict(name='preserved.xyz',text='1\nKnown carbon\nC 0 0 0\n')])['ok']
    before=p.snapshot(page)
    envelope=page.evaluate('()=>VibeMolStructure.exportActive()')
    cases=[]
    for z in [6.9,101,119]:
        for name,text in [(f'bad-{z}.cube',cube(z)),(f'bad-{z}.2ccube',cube(z,True)),
                          (f'bad-{z}.molden',molden(z)),
                          (f'bad-{z}.structure.json',json.dumps(dict(envelope,
                            volume=dict(envelope['volume'],atoms=[dict(envelope['volume']['atoms'][0],Z=z)]))))]:
            for clear in [False,True]:
                previous_dialogs=len(dialogs)
                result=p.load(page,[dict(name=name,text=text)],clear_first=clear)
                hint=page.locator('#hint').inner_text()
                actual=dict(ok=result['ok'],loaded=result['loadedCount'],
                    failureExplained='atomic number'in result.get('error','').lower(),
                    hintExplained='atomic number'in hint.lower(),sceneUnchanged=p.snapshot(page)==before,
                    alertFired=len(dialogs)==previous_dialogs+1 and 'Could not load'in dialogs[-1])
                expected=dict(ok=False,loaded=0,failureExplained=True,hintExplained=True,sceneUnchanged=True,alertFired=True)
                row=dict(file=name,Z=z,clearFirst=clear,actual=actual,expected=expected,result=result,hint=hint,
                    alerts=dialogs[previous_dialogs:])
                print('[atomic-identity] '+json.dumps(row),flush=True)
                assert actual==expected,row
                cases.append(row)
    result=p.load(page,[dict(name='dummy.xyz',text='1\nCatalogued Dummy\nX 0 0 0\n')])
    actual=dict(ok=result['ok'],Z=page.evaluate('()=>VibeMolStructure.exportActive().volume.atoms[0].Z'))
    expected=dict(ok=True,Z=0)
    print('[atomic-identity] '+json.dumps(dict(case='existing Dummy input',actual=actual,expected=expected)),flush=True)
    assert actual==expected,(actual,expected)
    saved=page.evaluate('()=>VibeMolSession.exportText()')
    assert p.load(page,[dict(name='replacement.xyz',text='1\nReplacement\nC 0 0 0\n')])['ok']
    restored=page.evaluate('text=>VibeMolSession.importText(text)',saved)
    readback=page.evaluate('()=>VibeMolStructure.exportActive().volume.atoms[0].Z')
    session=dict(actual=dict(Z=readback),expected=dict(Z=0),restoreResult=restored)
    print('[atomic-identity] '+json.dumps(dict(case='Dummy session round-trip',**session)),flush=True)
    assert session['actual']==session['expected'],session
    report=dict(passed=True,rejectedCases=cases,dummy=dict(actual=actual,expected=expected),session=session)
    (p.ARTIFACTS/'atomic-identity.json').write_text(json.dumps(report,indent=2)+'\n')
    return report


if __name__=='__main__':
    with p.run_http_server(p.ROOT)as url,p.sync_playwright()as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
        context=browser.new_context();page=context.new_page();dialogs=[];errors=[]
        page.on('dialog',lambda dialog:(dialogs.append(dialog.message),dialog.dismiss()))
        page.on('pageerror',lambda error:errors.append(str(error)))
        try:
            from navigation_budget import goto_with_budget
            goto_with_budget(page,url+'?appearanceStudy=1&workspaceLab=0',p.ARTIFACTS,label='atomic-identity-startup')
            page.wait_for_function('()=>window.VibeMolTesting&&window.VibeMolEmbed')
            run(page,dialogs);assert not errors,errors
        except Exception:
            p.write_failure_artifacts(page,p.ARTIFACTS,'atomic-identity',errors,[]);raise
        finally:
            context.close();assert not browser.contexts
            browser.close()
