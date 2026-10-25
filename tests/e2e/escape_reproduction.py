"""Paired tagged/source #52 reproduction; observations never supply a merge gate."""
import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re

import premerge as p
from helpers import wait_for_presented_state
from assertion_contract import numbers_close


def check(condition, actual, expected, label):
    print('[escape-reproduction] '+json.dumps(dict(check=label,actual=actual,expected=expected)),flush=True)
    assert condition,(label,actual,expected)


def run(browser, root, output, url, expected_focus):
    source=(root/'assets/app/js/app.js').read_text()
    pattern=r'function handleEditToolEscape\([^)]*\) \{'
    check(len(re.findall(pattern,source))==1,len(re.findall(pattern,source)),1,'private invocation observer anchor')
    served=re.sub(pattern,lambda m:m[0]+' window.__escapeInvocationCount++;',source)
    report=dict(diagnosticOnly=True,sourceSha256=hashlib.sha256(source.encode()).hexdigest(),
                servedSha256=hashlib.sha256(served.encode()).hexdigest(),
                harnessSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                browserVersion=browser.version,playwrightVersion=importlib.metadata.version('playwright'),pageerrors=[])
    output.mkdir(parents=True,exist_ok=False)
    context=browser.new_context(viewport={'width':1440,'height':1000})
    context.add_init_script('''window.__escapeInvocationCount=0;
      window.addEventListener('keydown',e=>{if(e.key==='Escape')window.__escapeEvent=e;},true);''')
    page=context.new_page();page.on('pageerror',lambda e:report['pageerrors'].append(str(e)))
    page.route('**/assets/app/js/app.js*',lambda route:route.fulfill(status=200,content_type='application/javascript',body=served))
    state='''()=>({focus:document.activeElement?.id,selection:VibeMolTesting.getEditSelectionIndices(),
      edit:document.getElementById('modeEditBtn').getAttribute('aria-checked'),
      camera:VibeMolTesting.getCameraSnapshot(),atoms:VibeMolStructure.exportActive().volume.atoms})'''
    try:
        page.goto(url+'?appearanceStudy=1');page.wait_for_function('()=>window.VibeMolWorkbench')
        loaded=p.load(page,[dict(name='escape-water.xyz',text='O 0 0 0\nH 1 0 0\nH -.3 .9 0')])
        check(loaded['ok'],loaded,dict(ok=True),'fixture load')
        page.locator('#modeEditBtn').click();page.locator('#editTransformToolBtn').click()
        page.evaluate('()=>VibeMolTesting.setEditSelectionIndices([0])')
        wait_for_presented_state(page,'()=>VibeMolTesting.getEditSelectionCount()===1')
        page.locator('#viewAxisNegZBtn').focus()
        page.evaluate('''()=>{window.__escapeInvocationCount=0;window.__rootEscapeSeen=false;
          document.getElementById('axisGizmo').addEventListener('keydown',()=>window.__rootEscapeSeen=true,{once:true});}''')
        report['before']=page.evaluate(state)
        check(report['before']['focus']=='viewAxisNegZBtn' and report['before']['selection']==[0],report['before'],dict(focus='viewAxisNegZBtn',selection=[0]),'exact trigger state')
        page.keyboard.press('Escape')
        report['after']=page.evaluate(state)
        report.update(page.evaluate('()=>({invocations:__escapeInvocationCount,defaultPrevented:__escapeEvent.defaultPrevented,rootKeydownSeen:__rootEscapeSeen})'))
        check(report['after']['focus']==expected_focus,report['after']['focus'],expected_focus,'tagged failure / candidate repair focus')
        check(report['invocations']==1,report['invocations'],1,'exactly one Edit action')
        check(report['after']['selection']==[],report['after']['selection'],[],'Transform selection cleared')
        check(report['before']['atoms']==report['after']['atoms'],report['after']['atoms'],report['before']['atoms'],'atoms unchanged')
        check(report['after']['edit']=='true',report['after']['edit'],'true','Edit mode retained')
        check(report['defaultPrevented'] is True,report['defaultPrevented'],True,'one owner consumes')
        same=all(numbers_close(report['before']['camera'][part][axis],report['after']['camera'][part][axis],rel_tol=0,abs_tol=1e-6)
                 for part in ['camera','target','up'] for axis in 'xyz')
        check(same,report['after']['camera'],report['before']['camera'],'existing axis camera tolerance')
        check(not report['pageerrors'],report['pageerrors'],[],'page errors')
        report.update(defectReproduced=expected_focus!='canvas',expectedOutcomeObserved=True)
        page.screenshot(path=str(output/'escape.png'))
    finally:
        (output/'report.json').write_text(json.dumps(report,indent=2)+'\n');context.close()


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tagged-root',required=True,type=Path);parser.add_argument('--out',required=True,type=Path)
    args=parser.parse_args();args.out.mkdir(parents=True,exist_ok=False)
    with p.sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
        try:
            for name,root,focus in [('tagged',args.tagged_root,'viewAxisNegZBtn'),('candidate',p.ROOT,'canvas')]:
                with p.run_http_server(root) as url:run(browser,root,args.out/name,url,focus)
        finally:browser.close()


if __name__=='__main__':main()
