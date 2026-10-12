"""Direct legacy adaptive-action events in both themes; no human action claimed.

The current tree also checks all 43 cached identities after each mode/action.
Historical tagged source has no cache bridge and is explicitly recorded as such.
No source response, handler or timer is replaced, and no failed wait is retried.
"""
import argparse
import hashlib
import itertools
import json
import math
import pathlib
import sys

parser=argparse.ArgumentParser()
parser.add_argument('--source-root',type=pathlib.Path,required=True)
parser.add_argument('--artifacts',type=pathlib.Path,required=True)
parser.add_argument('--current',action='store_true')
args=parser.parse_args()
root=pathlib.Path.cwd()
sys.path.insert(0,str(root/'tests/e2e'))
from helpers import run_http_server,wait_for_presented_state,write_failure_artifacts
from playwright.sync_api import sync_playwright
from smoke import build_fixture_optimize_structure

args.artifacts.mkdir(parents=True,exist_ok=True)
sha=hashlib.sha256((args.source_root/'assets/app/js/app.js').read_bytes()).hexdigest()
results=[]
def positions(page):
    return page.evaluate('() => VibeMolStructure.exportActive().volume.atoms.map(a=>[a.x,a.y,a.z])')
def check_identity(page,reason):
    if args.current:
        assert page.evaluate('() => !!window.__vmqaElementCaches && !!window.__vmqa')
        result=page.evaluate('(reason) => __vmqa.assertElementCacheIdentity(reason)',reason)
        report=page.evaluate('() => __vmqa.elementCacheReport()')
        assert report['supported'] and report['nodeCount']==43 and not report['failures'],report
        return report
    return {'historicalTaggedSourceWithoutBridge':True}

with run_http_server(args.source_root.resolve()) as url,sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
    for theme in ['light','dark']:
        context=browser.new_context(viewport={'width':1440,'height':1000})
        context.add_init_script('localStorage.setItem("vibemol.uiTheme",'+json.dumps(theme)+');')
        page=context.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('dialog',lambda d:d.dismiss())
        case={'launch':'legacy','theme':theme,'sourceAppSha256':sha,'actions':[]}
        try:
            page.goto(url+'?workspaceLab=0&appearanceStudy=1'+('&qa=1' if args.current else ''))
            page.wait_for_function('() => !!window.VibeMolTesting && !!window.VibeMolStructure')
            if args.current:
                page.wait_for_function('() => !!window.__vmqaElementCaches && !!window.__vmqa')
            # Equal masses give a directly observable COM, deliberately shifted
            # away from origin and with non-diagonal principal inertia axes.
            fixture='4\nShifted asymmetric carbons\nC 3.2 2.1 1.0\nC 4.5 2.8 1.7\nC 2.7 3.3 1.8\nC 3.4 2.7 3.0\n'
            loaded=page.evaluate('text => VibeMolEmbed.loadFiles([{name:"adaptive.xyz",text}])',fixture)
            assert loaded['ok'],loaded
            for mode in ['Display','Measure','Edit']:
                page.locator('#mode'+mode+'Btn').click()
                wait_for_presented_state(page,'() => true')
                check_identity(page,'direct UI mode '+mode)
            # 5f6a390 (v0.9.2) makes loaded scenes enter Transform. The legacy
            # launch does not call workbench.js mountToolbar(), which creates
            # editTransformToolBtn; observe its existing intent instead.
            wait_for_presented_state(page,"() => VibeMolTesting.getEditBuildState().intent === 'atom_manipulation'")
            ids=['editAdaptiveAddAtomBtn','editAdaptiveSymmetryBtn','editAdaptiveSymmetryMeta',
                 'editAdaptiveCleanStructureBtn','editAdaptiveCleanStructureMeta','editAdaptiveShiftComBtn',
                 'editAdaptiveShiftComMeta','editAdaptiveAlignPrincipalBtn','editAdaptiveAlignPrincipalMeta']
            case['chipNodes']=page.evaluate('ids => ids.map(id=>{const el=document.getElementById(id);return {id,present:!!el,text:el?.textContent.trim(),hidden:el?.hidden};})',ids)
            assert all(node['present'] for node in case['chipNodes'])
            before=positions(page)
            page.locator('#editAdaptiveShiftComBtn').click()
            wait_for_presented_state(page,"() => /Shifted active molecule COM to origin/.test(document.getElementById('hint').textContent)")
            centered=positions(page)
            assert centered!=before
            assert all(abs(sum(p[axis] for p in centered)/len(centered))<1e-10 for axis in range(3)),centered
            case['actions'].append({'action':'COM via cached legacy button','meanCoordinateTolerance':1e-10,'before':before,'after':centered})
            check_identity(page,'direct UI COM')
            page.locator('#editAdaptiveAlignPrincipalBtn').click()
            wait_for_presented_state(page,"() => /Aligned principal inertia axes to X\/Y\/Z/.test(document.getElementById('hint').textContent)")
            aligned=positions(page)
            assert aligned!=centered
            for a,b in itertools.combinations(range(3),2):
                assert abs(sum(p[a]*p[b] for p in aligned))<1e-8,aligned
            for i,j in itertools.combinations(range(len(aligned)),2):
                assert math.isclose(math.dist(centered[i],centered[j]),math.dist(aligned[i],aligned[j]),rel_tol=1e-9,abs_tol=1e-9)
            case['actions'].append({'action':'principal axes via cached legacy button','positions':aligned,'offDiagonalTolerance':1e-8,'distanceTolerance':1e-9})
            check_identity(page,'direct UI principal axes')
            page.locator('#canvas').focus();page.keyboard.press('ControlOrMeta+z')
            wait_for_presented_state(page,'() => true')
            assert positions(page)==centered
            case['actions'].append({'action':'principal alignment Undo','exactCoordinateRestore':True})
            check_identity(page,'direct UI Undo')
            page.locator('#canvas').focus();page.keyboard.press('/')
            page.wait_for_function("() => document.activeElement === document.getElementById('editBuildSearch')")
            check_identity(page,'direct UI Build open')
            page.locator('#editBuildSearch').press('/')
            page.wait_for_function("() => document.getElementById('editAdaptiveAddAtomPopover').getAttribute('aria-hidden') === 'true'")
            check_identity(page,'direct UI Build close')
            wait_for_presented_state(page,"() => VibeMolTesting.getEditBuildState().intent === 'atom_manipulation'")
            page.locator('#editAdaptiveSymmetryBtn').click()
            page.wait_for_function("() => document.getElementById('editAdaptiveSymmetryPopover').getAttribute('aria-hidden') === 'false'")
            check_identity(page,'direct UI Symmetry open')
            page.locator('#editSymmetryToleranceSelect').focus();page.keyboard.press('s')
            page.wait_for_function("() => document.getElementById('editAdaptiveSymmetryPopover').getAttribute('aria-hidden') === 'true'")
            check_identity(page,'direct UI Symmetry close')
            case['actions'].append({'action':'Build slash focus/close; Symmetry button and key close','passed':True})
            page.evaluate('text => VibeMolStructure.importFromText(text,"optimize-fixture")',build_fixture_optimize_structure())
            page.locator('#modeEditBtn').click()
            wait_for_presented_state(page,"() => VibeMolTesting.getEditBuildState().intent === 'atom_manipulation'")
            before_length=math.dist(*positions(page))
            page.locator('#editAdaptiveCleanStructureBtn').click()
            wait_for_presented_state(page,"() => /Optimized structure with UFF:/.test(document.getElementById('hint').textContent)")
            after_length=math.dist(*positions(page))
            assert after_length<before_length
            case['actions'].append({'action':'UFF optimize via cached legacy button','beforeBondLength':before_length,'afterBondLength':after_length})
            case['identity']=check_identity(page,'direct UI optimize')
            page.screenshot(path=str(args.artifacts/f'legacy-{theme}-adaptive-actions.png'))
            assert not errors,errors
            case['pageErrors']=errors;case['status']='passed'
            results.append(case)
            print(json.dumps({'theme':theme,'status':'passed','actions':len(case['actions'])}),flush=True)
        except Exception:
            write_failure_artifacts(page,args.artifacts,'actions-failure-'+theme,errors,[])
            raise
        finally:context.close()
    browser.close()
assert hashlib.sha256((args.source_root/'assets/app/js/app.js').read_bytes()).hexdigest()==sha
(args.artifacts/'result.json').write_text(json.dumps({'sourceAppSha256':sha,'currentCacheBridgeRequired':args.current,
 'method':'Native pointer/keyboard events and observable app-state waits; no source injection, sleeps or retries; no human interaction claimed.',
 'cases':results},indent=2)+'\n')
