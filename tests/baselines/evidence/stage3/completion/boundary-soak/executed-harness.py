"""One sustained whole-stage UI/session soak after all group merges."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
import traceback

p = argparse.ArgumentParser()
p.add_argument('--source-root', type=Path, required=True)
p.add_argument('--config', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
source, out = a.source_root.resolve(), a.output.resolve()
config = json.loads(a.config.read_text())
out.mkdir(parents=True, exist_ok=True)
assert not (out / 'soak-report.json').exists(), 'Do not repeat the whole-stage soak'
assert config['minimumSeconds'] == 600 and config['secondsPerContext'] == 150
git = lambda *args: subprocess.check_output(['git', '-C', str(source), *args], text=True).strip()
assert git('rev-parse','HEAD') == config['integrationCommit']
assert git('rev-parse','HEAD^{tree}') == config['testedTree'] and not git('status','--porcelain')
sha = hashlib.sha256((source/'assets/app/js/app.js').read_bytes()).hexdigest()
assert sha == config['appSha256']
sys.path.insert(0,str(source/'tests/e2e'))
from helpers import run_http_server, wait_for_presented_state
from characterize import unexpected_console
from smoke import build_fixture_distorted_methane_structure
from playwright.sync_api import sync_playwright
fixture = out/'methane.structure.json'
fixture.write_text(build_fixture_distorted_methane_structure())
positions = lambda page: page.evaluate('() => VibeMolStructure.exportActive().volume.atoms.map(a => [a.x,a.y,a.z])')
settle = lambda page: page.evaluate('() => __vmqa.settle()')
cases, started = [], time.monotonic()
status = 'running'

def mode(page, name):
    page.locator('#mode'+name+'Btn').click()
    expected = {'Display':'display','Measure':'measure','Edit':'edit','Calculations':'calculations'}[name]
    wait_for_presented_state(page, '() => VibeMolWorkbenchHost.getMode() === '+json.dumps(expected))
    assert page.evaluate("() => __vmqa.assertElementCacheIdentity('soak mode').count") == 52

def editor(page, legacy):
    if legacy:
        if not page.locator('#elementColorBtn').is_visible():
            page.locator('#displayInspectorBtn').click()
        button = page.locator('#elementColorBtn')
        assert button.is_visible()
    else:
        page.locator('#workbenchPanelsBtn').click()
        page.locator('#workbenchPanelsMenu').get_by_role('menuitemcheckbox',name='Properties',exact=True).click()
        page.locator('#inspectorLookTab').click()
        if not page.locator('#studioElementColorEdit').is_visible():
            page.locator('#appearanceColorsSection > summary').click()
        button = page.locator('#studioElementColorEdit')
    button.click()
    page.locator('#elementColorOverlay').wait_for(state='visible')
    assert page.locator('#elementColorName').inner_text().endswith('(Z=6)')
    page.locator('#elementColorPicker').evaluate('''el => {
      el.value='#2468ab'; el.dispatchEvent(new Event('change',{bubbles:true}));
    }''')
    wait_for_presented_state(page,"() => VibeMolPreset.export().settings['global.elementColorOverrides']['6'] === '#2468ab'")
    page.locator('#elementColorResetOne').click()
    wait_for_presented_state(page,"() => !Object.hasOwn(VibeMolPreset.export().settings['global.elementColorOverrides'],'6')")
    page.locator('#elementColorClose').click()
    page.locator('#elementColorOverlay').wait_for(state='hidden')
    if not legacy:
        page.locator('#inspectorClose').click()

with run_http_server(source) as url, sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    browser_version = browser.version
    try:
        for legacy in [False,True]:
            for theme in ['light','dark']:
                context = browser.new_context(viewport={'width':1440,'height':1000})
                context.add_init_script('localStorage.setItem("vibemol.uiTheme",'+json.dumps(theme)+');')
                page = context.new_page()
                errors, console = [], []
                page.on('pageerror',lambda error: errors.append(str(error)))
                page.on('console',lambda msg: console.append({'type':msg.type,'text':msg.text}) if msg.type in ['warning','error'] else None)
                key = ('legacy' if legacy else 'workbench')+'-'+theme
                case = {'case':key,'cycles':[],'status':'running'}
                case_start = time.monotonic()
                cases.append(case)
                try:
                    page.goto(url+'?qa=1&appearanceStudy=1'+('&workspaceLab=0' if legacy else ''))
                    page.wait_for_function('() => !!window.__vmqa && !!window.VibeMolSession && !!window.VibeMolWorkbenchHost')
                    assert page.locator('#themeToggleInput').is_checked() == (theme=='dark')
                    page.locator('#fileInput').set_input_files(str(fixture))
                    page.wait_for_function('''() => {try{return VibeMolStructure.exportActive().volume.atoms.length===5;}
                      catch(error){if(error.message==='No active structure is loaded.')return false;throw error;}}''')
                    original = positions(page)
                    case['renderer'] = page.evaluate('''() => {
                      const canvas=document.getElementById('canvas');
                      const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
                      const ext=gl.getExtension('WEBGL_debug_renderer_info');
                      return {version:gl.getParameter(gl.VERSION),renderer:gl.getParameter(gl.RENDERER),
                        unmaskedRenderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};
                    }''')
                    n = 0
                    while n == 0 or time.monotonic()-case_start < config['secondsPerContext']:
                        cycle_start = time.monotonic()
                        mode(page,'Display')
                        look = ['basic','toon','kit'][n%3]
                        page.evaluate('id => VibeMolAppearanceLooks.apply(id,{includeColors:true})',look)
                        settle(page)
                        editor(page,legacy)
                        mode(page,'Edit')
                        if page.locator('#editAdaptiveAddAtomPopover').is_hidden():
                            page.locator('#editAdaptiveAddAtomBtn').click()
                        search = page.locator('#editBuildSearch')
                        search.wait_for(state='visible')
                        search.fill('carbon')
                        assert search.input_value()=='carbon'
                        search.press('/')
                        page.locator('#editAdaptiveAddAtomPopover').wait_for(state='hidden')
                        page.locator('#canvas').focus()
                        page.keyboard.press('Escape')
                        if not legacy:
                            page.locator('#editTransformToolBtn').click()
                        page.locator('#canvas').focus()
                        page.keyboard.press('ControlOrMeta+a')
                        wait_for_presented_state(page,'() => VibeMolTesting.getEditSelectionCount()===5')
                        panel=page.locator('#editAdaptiveSymmetryPopover')
                        if panel.is_hidden():
                            page.locator('#editAdaptiveSymmetryBtn').click()
                        panel.wait_for(state='visible')
                        page.locator('#editSymmetryToleranceSelect').select_option('0.100')
                        candidate=panel.locator('[data-symmetry-group-id="Td"]')
                        candidate.click()
                        assert page.locator('#editSymmetryApplyBtn').is_enabled()
                        assert positions(page)==original
                        page.locator('#editSymmetryCancelBtn').click()
                        assert positions(page)==original
                        candidate.click()
                        page.locator('#editSymmetryApplyBtn').click()
                        wait_for_presented_state(page,"() => /Td/.test(document.getElementById('editSymmetryExactResult').textContent)")
                        assert positions(page)!=original
                        page.locator('#canvas').focus()
                        page.keyboard.press('ControlOrMeta+z')
                        wait_for_presented_state(page,'() => true')
                        assert positions(page)==original
                        if panel.is_visible():
                            page.locator('#canvas').focus()
                            page.keyboard.press('s')
                            panel.wait_for(state='hidden')
                        for name in ['Display','Measure']+([] if legacy else ['Calculations'])+['Display']:
                            mode(page,name)
                        before_look=page.evaluate('() => VibeMolAppearanceLooks.snapshot().settings')
                        session=page.evaluate('() => VibeMolSession.export()')
                        imported=page.evaluate('doc => VibeMolSession.import(doc)',session)
                        assert imported['ok'],imported
                        settle(page)
                        assert positions(page)==original
                        assert page.evaluate('() => VibeMolAppearanceLooks.snapshot().settings')==before_look
                        assert page.evaluate("() => __vmqa.assertElementCacheIdentity('session restore').count")==52
                        identity=page.evaluate('() => __vmqa.elementCacheReport()')
                        expected={'live':48,'knownAbsent':4} if legacy else {'live':47,'knownAbsent':5}
                        assert identity['nodeCount']==52 and identity['composition']==expected and not identity['failures']
                        assert not errors,errors
                        assert not unexpected_console(console),unexpected_console(console)
                        n+=1
                        case['cycles'].append({'cycle':n,'look':look,'seconds':round(time.monotonic()-cycle_start,3),'positionsAndLookSessionRestored':True,'selectionCount':5,'symmetryPreviewCancelApplyUndo':True,'editorChangeResetClose':True,'identity':identity,'domElementCount':page.locator('*').count()})
                        (out/'soak-progress.json').write_text(json.dumps({'status':'running','source':config,'cases':cases},indent=2)+'\n')
                        print(json.dumps({'case':key,'cycle':n,'seconds':round(time.monotonic()-case_start,2)}),flush=True)
                    page.screenshot(path=str(out/(key+'.png')))
                    case.update(status='passed',seconds=round(time.monotonic()-case_start,3),pageErrors=errors,unexpectedConsole=unexpected_console(console))
                except BaseException:
                    status='failed'
                    case.update(status='failed',seconds=round(time.monotonic()-case_start,3),traceback=traceback.format_exc(),pageErrors=errors,console=console)
                    (out/(key+'-failure.html')).write_text(page.content())
                    page.screenshot(path=str(out/(key+'-failure.png')))
                    raise
                finally:
                    context.close()
        assert len(cases)==4 and all(c['status']=='passed' and c['seconds']>=150 for c in cases)
        status='passed'
    finally:
        browser.close()
        report={'status':status,'config':config,'browserVersion':browser_version,'seconds':round(time.monotonic()-started,3),'cases':cases,
          'method':'One sustained job, four serial long-lived layout/theme contexts. Native mode, palette/search, selection, Symmetry and both editor entry paths; standard picker change event and native reset/close; public Look/session APIs. QA performs read-only/sticky identity checks. No source rewrite, listener replacement, sleeps, shipped assertion changes or new acceptance exception.',
          'carriedFindings':'tests/baselines/carried-defects.json; this soak does not close #3/#11/#17/#21 or the material-preset intermittent.'}
        (out/'soak-report.json').write_text(json.dumps(report,indent=2)+'\n')
assert status=='passed' and time.monotonic()-started>=600
assert git('rev-parse','HEAD')==config['integrationCommit'] and not git('status','--porcelain')
assert hashlib.sha256((source/'assets/app/js/app.js').read_bytes()).hexdigest()==sha
