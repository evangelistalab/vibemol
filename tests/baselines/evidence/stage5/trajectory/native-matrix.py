"""Serial native trajectory controls on tagged and proposed trees, no DOM overrides."""
import hashlib
import json
from pathlib import Path
import re
import sys
import time
import traceback

ROOT = Path('/Users/fevange/Source/vibemol')
OUT = ROOT/'out/test-artifacts/stage5/trajectory'
WORK = OUT/'source-worktree'
sys.path.insert(0, str(WORK/'tests/e2e'))
from helpers import run_http_server, wait_for_presented_state, write_failure_artifacts
from playwright.sync_api import sync_playwright


def check(label, actual, expected, case):
    observation = dict(check=label, actual=actual, expected=expected)
    case['checks'].append(observation)
    print(json.dumps(observation), flush=True)
    assert actual == expected, observation


def session(page):
    return page.evaluate('() => VibeMolSession.export()')


def clocks(page):
    doc = session(page)
    labels = page.locator('.trajectorySceneRow .trajectoryMiniButton:first-child').evaluate_all("els=>els.map(el=>el.getAttribute('aria-label'))")
    master = dict(doc['graph']['syncMaster'])
    master['playing'] = page.locator('#trajectorySyncMaster button[aria-label="Pause synchronized trajectories"]').count() > 0
    return dict(master=master, records=[
        dict(name=s['name'], frame=s['volume']['trajectory']['frameIndex'],
             playing=(labels[i] == 'Pause trajectory'), synced=s['volume']['trajectory']['syncEnabled'])
        for i, s in enumerate(s for s in doc['sources'] if 'trajectory' in s['volume'])])


def open_panel(page, legacy):
    if page.locator('#trajectoryPanel').is_visible():
        return
    if legacy:
        page.locator('#trajectoryPanelBtn').click()
    else:
        page.locator('#workbenchPanelsBtn').click()
        page.locator('#workbenchPanelsMenu [data-window="trajectoryPanel"]').click()
    page.locator('#trajectoryPanel').wait_for(state='visible')


def reset(page):
    page.locator('#trajectoryResetBtn').click()
    page.wait_for_function("() => [...document.querySelectorAll('.trajectoryFrameReadout')].every(el=>el.textContent.startsWith('1/'))")


def run_case(browser, url, source_name, source, legacy, theme):
    case = dict(source=source_name, launch='legacy' if legacy else 'workbench', theme=theme, checks=[])
    name = source_name+'-'+case['launch']+'-'+theme
    dest = OUT/'native'/name
    dest.mkdir(parents=True, exist_ok=True)
    context = browser.new_context(viewport=dict(width=1440, height=1000), accept_downloads=True)
    context.add_init_script('localStorage.setItem("vibemol.uiTheme", '+json.dumps(theme)+');')
    page = context.new_page()
    errors, console_errors = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
    page.on('dialog', lambda d: d.dismiss())
    try:
        page.goto(url+'?appearanceStudy=1'+('&workspaceLab=0' if legacy else ''), wait_until='domcontentloaded')
        page.wait_for_function('() => !!window.VibeMolSession && !!window.VibeMolTesting && !!window.VibeMolWorkbenchHost')
        check('requested theme', page.locator('#themeToggleInput').is_checked(), theme=='dark', case)
        files=[]
        for count in (4,6):
            text=''.join(f'2\nframe {i}, angstrom\nC {i*.05} 0 0\nH {1+i*.05} 0 0\n' for i in range(count))
            files.append(dict(name=f'trajectory-{count}.xyz',mimeType='text/plain',buffer=text.encode()))
        page.locator('#fileInput').set_input_files(files)
        page.wait_for_function('() => VibeMolTesting.getSceneGraphSnapshot().scenes.length===2')
        open_panel(page, legacy)
        rows=page.locator('.trajectorySceneRow')
        check('two native rows', rows.count(), 2, case)
        check('initial frames', page.locator('.trajectoryFrameReadout').all_text_contents(), ['1/4','1/6'], case)
        rows.nth(0).get_by_label('Loop', exact=True).uncheck()
        rows.nth(0).get_by_label('FPS', exact=True).fill('4')
        rows.nth(0).get_by_label('FPS', exact=True).press('Tab')
        slider=rows.nth(0).locator('input[type=range]')
        slider.focus(); slider.press('Home'); slider.press('ArrowRight'); slider.press('ArrowRight')
        check('independent native slider', rows.nth(0).locator('.trajectoryFrameReadout').inner_text(), '3/4', case)
        rows.nth(0).get_by_role('button', name='Play trajectory', exact=True).click()
        page.wait_for_function("() => document.querySelector('.trajectoryFrameReadout').textContent==='4/4'")
        page.wait_for_function("() => document.querySelector('.trajectoryMiniButton').getAttribute('aria-label')==='Play trajectory'")
        check('non-loop endpoint paused', clocks(page)['records'][0]['playing'], False, case)
        reset(page)
        page.locator('#trajectoryPlayBtn').click()
        page.wait_for_function("() => [...document.querySelectorAll('.trajectoryFrameReadout')].every(el=>!el.textContent.startsWith('1/'))")
        page.locator('#trajectoryPlayBtn').click()
        check('pause all', [r['playing'] for r in clocks(page)['records']], [False,False], case)
        reset(page)
        for i in range(2): rows.nth(i).get_by_label('Sync',exact=True).check()
        master=page.locator('#trajectorySyncMaster')
        check('synced FPS disabled', [rows.nth(i).get_by_label('FPS',exact=True).is_disabled() for i in range(2)], [True,True],case)
        master_slider=master.locator('input[type=range]')
        master_slider.focus();master_slider.press('End')
        check('unequal synchronized endpoints', page.locator('.trajectoryFrameReadout').all_text_contents(), ['4/4','6/6'],case)
        master.get_by_role('button',name='Play synchronized trajectories',exact=True).click()
        page.wait_for_function("() => document.querySelectorAll('.trajectoryFrameReadout')[1].textContent!=='6/6'")
        master.get_by_role('button',name='Pause synchronized trajectories',exact=True).click()
        check('master paused',clocks(page)['master']['playing'],False,case)
        rows.nth(0).get_by_label('Sync',exact=True).uncheck()
        check('disable one sync preserves other', [rows.nth(i).get_by_label('FPS',exact=True).is_disabled() for i in range(2)], [False,True],case)
        for mode in ['Measure','Edit']+([] if legacy else ['Calculations'])+['Display']:
            page.locator('#mode'+mode+'Btn').click()
            wait_for_presented_state(page,'() => true')
            check('mode '+mode+' pauses master',clocks(page)['master']['playing'],False,case)
        open_panel(page,legacy);reset(page)
        before=session(page)
        with page.expect_download() as pending:
            page.locator('#saveSessionBtn').click()
        download=pending.value
        saved=Path(download.path()).read_bytes()
        (dest/'saved.vibemol-session').write_bytes(saved)
        check('native saved session kind',json.loads(saved)['kind'],'vibemol.session',case)
        # The ordinary picker appends. Exercise explicit replacement through
        # the public load transaction, then use the native saved-session input.
        page.locator('#trajectoryPlayBtn').click()
        replacement = page.evaluate("() => VibeMolEmbed.loadFiles([{name:'static.xyz',text:'1\\nStatic angstrom\\nHe 0 0 0\\n'}],{clearFirst:true})")
        check('public explicit replacement succeeds',replacement['ok'],True,case)
        page.wait_for_function("() => VibeMolTesting.getSceneGraphSnapshot().scenes.length===1 && !document.querySelector('.trajectorySceneRow')")
        check('replace last playing record clears master',clocks(page)['master']['playing'],False,case)
        page.locator('#sessionFileInput').set_input_files(dict(name=download.suggested_filename,mimeType='application/json',buffer=saved))
        page.wait_for_function('() => VibeMolTesting.getSceneGraphSnapshot().scenes.length===2')
        restored=session(page)
        check('session sources round-trip',restored['sources'],before['sources'],case)
        check('session graph round-trip',restored['graph'],before['graph'],case)
        open_panel(page,legacy)
        page.locator('#trajectoryPlayBtn').click()
        for remaining in (1,0):
            scene_id=page.evaluate('() => VibeMolTesting.getSceneGraphSnapshot().scenes[0].id')
            page.locator(f'.vm-outliner-row[data-id="{scene_id}"]').click(button='right')
            page.locator('.vm-outliner-context-menu__item').filter(has_text=re.compile('^Delete scene$')).click()
            page.locator('.vm-outliner-context-menu__button.is-danger').click()
            page.wait_for_function('n => VibeMolTesting.getSceneGraphSnapshot().scenes.length===n',arg=remaining)
        check('native delete last playing scene empties controls',page.locator('.trajectorySceneRow').count(),0,case)
        check('native delete last playing scene stops master',clocks(page)['master']['playing'],False,case)
        check('no page errors',errors,[],case)
        check('no console errors',console_errors,[],case)
        page.screenshot(path=str(dest/'final.png'),full_page=True)
        case['status']='passed'
    except Exception:
        case['status']='failed';case['traceback']=traceback.format_exc()
        try:
            case['failureReadback'] = dict(session=session(page),
                sceneRows=page.locator('.vm-outliner-row').all_text_contents(),
                trajectoryRows=page.locator('.trajectorySceneRow').all_text_contents(),
                mode=page.locator('#toolbarModeRow').inner_text(),pageErrors=errors,consoleErrors=console_errors)
        except Exception as read_error:
            case['readbackError']=str(read_error)
        write_failure_artifacts(page,dest,'failure',errors,console_errors)
        raise
    finally:
        (dest/'case.json').write_text(json.dumps(case,indent=2)+'\n')
        context.close()
    return case


started=time.monotonic();cases=[]
sources=[('tagged',ROOT/'out/test-artifacts/stage4/pubchem/tagged-source'),('proposed',WORK)]
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    try:
        for source_name,source in sources:
            with run_http_server(source) as url:
                for legacy in [False,True]:
                    for theme in ['light','dark']:
                        cases.append(run_case(browser,url,source_name,source,legacy,theme))
                        (OUT/'native-progress.json').write_text(json.dumps(dict(cases=cases),indent=2)+'\n')
    finally:
        browser.close()
report=dict(status='passed',seconds=time.monotonic()-started,browserVersion=browser.version,cases=cases,
            playingObservation='Native control ARIA; portable sessions intentionally omit live playing/timestamp values. Direct live clock cleanup is covered separately by the differential test.',
            harnessSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            sourceAppHashes={name:hashlib.sha256((source/'assets/app/js/app.js').read_bytes()).hexdigest() for name,source in sources})
(OUT/'native-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(status='passed',contexts=len(cases),seconds=report['seconds'])),flush=True)
