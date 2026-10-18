"""Serial native vibration controls on tagged/proposed trees; no product/DOM rewrites."""
import hashlib
import json
from pathlib import Path
import sys
import time
import traceback

ROOT=Path('/Users/fevange/Source/vibemol')
OUT=ROOT/'out/test-artifacts/stage5/vibration'
WORK=OUT/'source-worktree'
sys.path.insert(0,str(WORK/'tests/e2e'))
from helpers import run_http_server, wait_for_presented_state, write_failure_artifacts
from smoke import install_trajectory_video_export_stubs, get_trajectory_video_export_stub_state
from playwright.sync_api import sync_playwright

def check(case,label,actual,expected):
    value=dict(check=label,actual=actual,expected=expected)
    case['checks'].append(value);print(json.dumps(value),flush=True)
    assert actual==expected,value

def session(page):
    return page.evaluate('()=>VibeMolSession.export()')

def glyph(page):
    return page.locator('#vibrationPlayBtn .motionPanelIconGlyph').inner_text().strip()

def open_panel(page,legacy):
    if page.locator('#vibrationPanel').is_visible():return
    if legacy:page.locator('#vibrationPanelBtn').click()
    else:
        page.locator('#workbenchPanelsBtn').click()
        page.locator('#workbenchPanelsMenu [data-window="vibrationPanel"]').click()
    page.locator('#vibrationPanel').wait_for(state='visible')

def reset(page):
    page.locator('#vibrationResetBtn').click()
    page.wait_for_function("()=>document.querySelector('#vibrationPlayBtn .motionPanelIconGlyph').textContent.trim()==='play_arrow'")

def run_case(browser,url,label,legacy,theme):
    case=dict(source=label,launch='legacy' if legacy else 'workbench',theme=theme,checks=[])
    dest=OUT/'native'/(label+'-'+case['launch']+'-'+theme);dest.mkdir(parents=True,exist_ok=True)
    context=browser.new_context(viewport=dict(width=1440,height=1000),accept_downloads=True)
    context.add_init_script('localStorage.setItem("vibemol.uiTheme",'+json.dumps(theme)+');')
    page=context.new_page();errors=[];console_errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:console_errors.append(m.text) if m.type=='error' else None)
    page.on('dialog',lambda d:d.dismiss())
    try:
        page.goto(url+'?appearanceStudy=1'+('&workspaceLab=0' if legacy else ''),wait_until='domcontentloaded')
        page.wait_for_function('()=>!!window.VibeMolSession && !!window.VibeMolTesting && !!window.VibeMolWorkbenchHost')
        check(case,'theme',page.locator('#themeToggleInput').is_checked(),theme=='dark')
        fixture=ROOT/'tests/fixtures/characterize'
        page.locator('#fileInput').set_input_files([str(fixture/'vibration.xyz'),str(fixture/'vibration.vib.json')])
        page.wait_for_function("()=>document.querySelectorAll('#vibrationModeTableBody tr[data-mode-index]').length===1")
        open_panel(page,legacy)
        check(case,'low-frequency filter initially hides translation',page.locator('#vibrationModeTableBody tr').count(),1)
        check(case,'visible selected mode',page.locator('#vibrationModeLabel').inner_text().split()[0],'2/2')
        page.locator('#vibrationHideLowFreq').uncheck()
        check(case,'show both modes',page.locator('#vibrationModeTableBody tr').count(),2)
        page.locator('#vibrationModeTableBody tr[data-mode-index="0"] td').nth(2).click()
        check(case,'table row starts selected mode',glyph(page),'pause')
        page.locator('#vibrationPlayBtn').click();check(case,'main pause',glyph(page),'play_arrow')
        for element,value in [('vibrationAmplitude','1.25'),('vibrationSpeed','2.25')]:
            page.locator('#'+element).fill(value);page.locator('#'+element).press('Tab')
            check(case,element,page.locator('#'+element).input_value(),value)
        page.locator('#vibrationPlayBtn').click();check(case,'main play',glyph(page),'pause')
        reset(page);check(case,'reset pauses',glyph(page),'play_arrow')
        page.locator('#vibrationHideLowFreq').check()
        check(case,'filter restores visible stretch',page.locator('#vibrationModeTableBody tr').count(),1)
        check(case,'relative-intensity spectrum', 'relative intensities' in page.locator('#vibrationSpectrumMeta').inner_text(),True)
        payload=json.loads((fixture/'vibration.vib.json').read_text())
        payload['modes'][0]['irIntensityKmMol']=0;payload['modes'][1]['irIntensityKmMol']=15
        page.locator('#fileInput').set_input_files(dict(name='intensities.vib.json',mimeType='application/json',buffer=json.dumps(payload).encode()))
        page.wait_for_function("()=>document.getElementById('vibrationSpectrumMeta').textContent.includes('parsed intensities')")
        check(case,'parsed-intensity spectrum', 'parsed intensities' in page.locator('#vibrationSpectrumMeta').inner_text(),True)
        # Reuse the shipped suite's recorder/stream/download stub. The controls,
        # phase owner, crop controller and restore adapters are real production.
        page.evaluate('''()=>{window.__nativeVibrationBrowserFacilities={
            createObjectURL:URL.createObjectURL,revokeObjectURL:URL.revokeObjectURL,
            anchorClick:HTMLAnchorElement.prototype.click,
            captureStream:HTMLCanvasElement.prototype.captureStream,
            MediaRecorder:window.MediaRecorder};}''')
        install_trajectory_video_export_stubs(page)
        page.locator('#vibrationSaveVideoBtn').click()
        page.wait_for_function("()=>document.getElementById('vibrationVideoCropOverlay').dataset.state==='selecting'")
        page.locator('#vibrationVideoCropCancelBtn').click()
        check(case,'crop cancel downloads nothing',len(get_trajectory_video_export_stub_state(page)['downloads']),0)
        page.locator('#vibrationSpeed').fill('5');page.locator('#vibrationSpeed').press('Tab')
        page.locator('#vibrationSaveVideoBtn').click()
        page.locator('#vibrationVideoCropStartBtn').click()
        page.wait_for_function('()=>(window.__trajectoryVideoExportTest?.downloads?.length||0)===1')
        page.wait_for_function("()=>document.getElementById('vibrationVideoCropOverlay').getAttribute('aria-hidden')==='true'")
        export=get_trajectory_video_export_stub_state(page)
        check(case,'one native vibration export',export['downloads'][0]['download'],'vibration.webm')
        check(case,'single recorder start-stop',[export['recorderStarts'],export['recorderStops']],[1,1])
        page.evaluate('''()=>{const original=window.__nativeVibrationBrowserFacilities;
            URL.createObjectURL=original.createObjectURL;URL.revokeObjectURL=original.revokeObjectURL;
            HTMLAnchorElement.prototype.click=original.anchorClick;
            HTMLCanvasElement.prototype.captureStream=original.captureStream;
            window.MediaRecorder=original.MediaRecorder;}''')
        reset(page)
        for mode in ['Measure','Edit']+([] if legacy else ['Calculations'])+['Display']:
            page.locator('#mode'+mode+'Btn').click();wait_for_presented_state(page,'()=>true')
            check(case,'mode '+mode+' leaves playback paused',glyph(page),'play_arrow')
        open_panel(page,legacy)
        page.locator('#vibrationPlayBtn').click();page.locator('#vibrationPanelClose').click()
        open_panel(page,legacy);check(case,'panel close resets playback',glyph(page),'play_arrow')
        reset(page);before=session(page)
        # Save through the native session control; source/graph equality is
        # measured after an explicit scene replacement and native session open.
        with page.expect_download() as pending:page.locator('#saveSessionBtn').click()
        saved=Path(pending.value.path()).read_bytes();(dest/'saved.vibemol-session').write_bytes(saved)
        replacement=page.evaluate("()=>VibeMolEmbed.loadFiles([{name:'static.xyz',text:'1\\nstatic angstrom\\nHe 0 0 0\\n'}],{clearFirst:true})")
        check(case,'explicit replacement',replacement['ok'],True)
        page.locator('#sessionFileInput').set_input_files(dict(name='saved.vibemol-session',mimeType='application/json',buffer=saved))
        page.wait_for_function("()=>document.querySelectorAll('#vibrationModeTableBody tr').length===1")
        restored=session(page)
        check(case,'native session source round-trip',restored['sources'],before['sources'])
        check(case,'native session graph round-trip',restored['graph'],before['graph'])
        open_panel(page,legacy)
        for width in [1512,1280,1024]:
            page.set_viewport_size(dict(width=width,height=1000));wait_for_presented_state(page,'()=>true')
            check(case,'vibration row remains visible at'+str(width),page.locator('#vibrationModeTableBody tr').is_visible(),True)
        check(case,'no page errors',errors,[]);check(case,'no console errors',console_errors,[])
        page.screenshot(path=str(dest/'final.png'),full_page=True)
        case['status']='passed'
    except Exception:
        case.update(status='failed',traceback=traceback.format_exc())
        write_failure_artifacts(page,dest,'failure',errors,console_errors)
        raise
    finally:
        (dest/'case.json').write_text(json.dumps(case,indent=2)+'\n');context.close()
    return case

assert not (OUT/'native-report.json').exists(),'Do not repeat a completed matrix'
started=time.monotonic();cases=[]
sources=[('tagged',ROOT/'out/test-artifacts/stage4/pubchem/tagged-source'),('proposed',WORK)]
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    version=browser.version
    try:
        for label,source in sources:
            with run_http_server(source) as url:
                for legacy in [False,True]:
                    for theme in ['light','dark']:
                        cases.append(run_case(browser,url,label,legacy,theme))
                        (OUT/'native-progress.json').write_text(json.dumps(dict(cases=cases),indent=2)+'\n')
    finally:browser.close()
for index in range(4):
    assert cases[index]['checks']==cases[index+4]['checks'],dict(tagged=cases[index],proposed=cases[index+4])
report=dict(status='passed',seconds=time.monotonic()-started,cases=cases,contexts=len(cases),browserVersion=version,
    comparandsExactAcrossSources=True,harnessSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    sourceAppHashes={name:hashlib.sha256((source/'assets/app/js/app.js').read_bytes()).hexdigest() for name,source in sources},
    exporterCoverage='One completed native crop/record/download/restore plus crop cancellation per context, using unchanged shipped recorder/stream stub. Second-download#11 is independently assessed from the full candidate CI.')
(OUT/'native-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(status='passed',contexts=len(cases),seconds=report['seconds'])),flush=True)
