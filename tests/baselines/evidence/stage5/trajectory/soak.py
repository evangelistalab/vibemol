"""Recorded Stage 5a feature soak; deliberate dwell is not a readiness retry."""
import datetime
import hashlib
import json
from pathlib import Path
import sys
import time
import traceback

OUT=Path('/Users/fevange/Source/vibemol/out/test-artifacts/stage5/trajectory')
WORK=OUT/'source-worktree'
sys.path.insert(0,str(WORK/'tests/e2e'))
from helpers import run_http_server, write_failure_artifacts
from playwright.sync_api import sync_playwright

phase=OUT/'soak-phase.json'
assert not phase.exists(), 'Resume this exact soak rather than duplicating it'
assert json.loads((OUT/'characterize-phase.json').read_text())['status']=='passed', 'Local UI stays serial'
source_hash=hashlib.sha256((WORK/'assets/app/js/app.js').read_bytes()).hexdigest()
started=time.monotonic();cases=[]
state=dict(status='running',started=datetime.datetime.now(datetime.timezone.utc).isoformat(),sourceAppSha256=source_hash,
           harnessSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
phase.write_text(json.dumps(state,indent=2)+'\n')

def open_panel(page,legacy):
    if page.locator('#trajectoryPanel').is_visible():return
    if legacy:page.locator('#trajectoryPanelBtn').click()
    else:
        page.locator('#workbenchPanelsBtn').click()
        page.locator('#workbenchPanelsMenu [data-window="trajectoryPanel"]').click()
    page.locator('#trajectoryPanel').wait_for(state='visible')

try:
    with run_http_server(WORK) as url, sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        version=browser.version
        try:
            for legacy in [False,True]:
                for theme in ['light','dark']:
                    case=dict(launch='legacy' if legacy else 'workbench',theme=theme,checkpoints=[])
                    dest=OUT/'soak'/(case['launch']+'-'+theme);dest.mkdir(parents=True,exist_ok=True)
                    context=browser.new_context(viewport=dict(width=1280,height=960))
                    context.add_init_script('localStorage.setItem("vibemol.uiTheme",'+json.dumps(theme)+');')
                    page=context.new_page();errors=[]
                    page.on('pageerror',lambda e:errors.append(str(e)))
                    page.on('dialog',lambda d:d.dismiss())
                    try:
                        page.goto(url+'?appearanceStudy=1'+('&workspaceLab=0' if legacy else ''),wait_until='domcontentloaded')
                        page.wait_for_function('() => !!window.VibeMolSession && !!window.VibeMolTesting && !!window.VibeMolWorkbenchHost')
                        loaded=page.evaluate("files=>VibeMolEmbed.loadFiles(files,{clearFirst:true})",[dict(name='trajectory.xyz',text=(WORK/'tests/fixtures/characterize/trajectory.xyz').read_text())])
                        print(json.dumps(dict(check='fixture load',actual=loaded,expectedOk=True)),flush=True);assert loaded['ok'],loaded
                        open_panel(page,legacy)
                        row=page.locator('.trajectorySceneRow').first
                        row.get_by_label('Loop',exact=True).check()
                        page.locator('#trajectoryPlayBtn').click()
                        for step in range(8):
                            page.wait_for_timeout(8000)
                            old=page.locator('.trajectoryFrameReadout').first.inner_text()
                            observed=page.wait_for_function('old=>{const value=document.querySelector(".trajectoryFrameReadout").textContent;return value!==old?value:false}',arg=old)
                            actual=observed.json_value();observed.dispose()
                            frame,count=[int(x) for x in actual.split('/')]
                            readback=dict(step=step,seconds=time.monotonic()-started,frameBefore=old,frameAfter=actual,
                                          playingButton=page.locator('#trajectoryPlayBtn').get_attribute('aria-label'),pageErrors=list(errors))
                            case['checkpoints'].append(readback);print(json.dumps(readback),flush=True)
                            assert 1<=frame<=count,readback
                            assert old!=actual,readback
                            assert not errors,readback
                            if step==1:
                                page.locator('#trajectoryPlayBtn').click();row.get_by_label('Sync',exact=True).check()
                                page.locator('#trajectoryPlayBtn').click()
                            elif step==2:
                                page.locator('#modeEditBtn').click();page.locator('#modeDisplayBtn').click();open_panel(page,legacy)
                                page.locator('#trajectoryPlayBtn').click()
                            elif step==3:
                                saved=page.evaluate('() => VibeMolSession.export()')
                                imported=page.evaluate('doc=>VibeMolSession.import(doc)',saved)
                                print(json.dumps(dict(check='soak session reload',actual=imported,expectedOk=True)),flush=True);assert imported['ok'],imported
                                open_panel(page,legacy);page.locator('#trajectoryPlayBtn').click()
                            elif step==4:
                                row.get_by_label('Sync',exact=True).uncheck()
                                row.get_by_label('FPS',exact=True).fill('24');row.get_by_label('FPS',exact=True).press('Tab')
                                page.locator('#trajectoryPlayBtn').click()
                            elif step==5:
                                page.locator('#trajectoryResetBtn').click()
                            elif step==6:
                                result=page.evaluate("() => VibeMolPreset.import({kind:'vibemol.preset',presetVersion:1,settings:{'molecule.style':'kit'}})")
                                print(json.dumps(dict(check='Look/preset during playback',actual=result)),flush=True)
                                if page.locator('#trajectoryPlayBtn').get_attribute('aria-label')=='Play all trajectories':page.locator('#trajectoryPlayBtn').click()
                        replaced=page.evaluate("() => VibeMolEmbed.loadFiles([{name:'static.xyz',text:'1\\nHe\\nHe 0 0 0\\n'}],{clearFirst:true})")
                        readback=dict(check='last-record replacement',actual=replaced,rows=page.locator('.trajectorySceneRow').count(),expectedRows=0,pageErrors=errors)
                        print(json.dumps(readback),flush=True);assert replaced['ok'] and readback['rows']==0 and not errors,readback
                        page.screenshot(path=str(dest/'final.png'),full_page=True)
                        case['status']='passed';cases.append(case)
                    except Exception:
                        case.update(status='failed',traceback=traceback.format_exc(),readout=page.locator('.trajectorySceneRow').all_text_contents(),pageErrors=errors)
                        cases.append(case);write_failure_artifacts(page,dest,'failure',errors,[]);raise
                    finally:
                        (dest/'case.json').write_text(json.dumps(case,indent=2)+'\n');context.close()
        finally:browser.close()
    assert hashlib.sha256((WORK/'assets/app/js/app.js').read_bytes()).hexdigest()==source_hash
    state.update(status='passed',seconds=time.monotonic()-started,browserVersion=version,cases=cases)
except Exception:
    state.update(status='failed',seconds=time.monotonic()-started,cases=cases,traceback=traceback.format_exc());raise
finally:
    state['completed']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    phase.write_text(json.dumps(state,indent=2)+'\n')
