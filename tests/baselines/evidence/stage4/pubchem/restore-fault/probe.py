#!/usr/bin/env python3
"""Controlled, one-shot metadata failure during ordinary startup autosave restore.

Diagnostic only. The immutable source files are never changed; one response is
instrumented in memory for the tagged fault case, with both byte hashes saved.
"""
import hashlib
import json
import os
from pathlib import Path
import sys
import time
from urllib.parse import urlparse

ROOT = Path('/Users/fevange/Source/vibemol')
OUT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT/'tests/e2e'))
from helpers import run_http_server
from playwright.sync_api import sync_playwright

assert not (OUT/'result.json').exists(), 'Completed probe must not be repeated'
old = ROOT/'out/test-artifacts/stage4/pubchem'
observation = json.loads((old/'migration-diagnostic/ci-39062919011/look-migration-tagged/out/diagnostic-tagged/result.json').read_text())['observations'][0]
preset = dict(kind='vibemol.preset', presetVersion=1, appVersion='0.9.5', settings={
    **observation['actual']['resolvedAppearanceSettings'], 'appearance.look':observation['inputAppearanceLook']})
(OUT/'input-preset.json').write_text(json.dumps(preset,indent=2)+'\n')
marker = 'RESTORE_FAULT_PROBE_tagged_metadata_after_settings'
snapshot_js = '''() => {
  const s=VibeMolAppearanceLooks.snapshot();
  return {ids:['styleRef','colorsRef'].map(k=>s[k]?.id??null),
    flags:[s.styleModified,s.colorsModified],settings:s.settings,label:s.label,
    stored:JSON.parse(localStorage.getItem('vibemol.autosavePreset')),
    errors:window.__restoreProbeErrors, hint:document.getElementById('hint')?.textContent,
    alerts:[...document.querySelectorAll('[role=alert]')].filter(x=>x.getClientRects().length).map(x=>x.textContent),
    readyState:document.readyState,atMs:performance.now()};
}'''
report = dict(diagnosticOnly=True,usableAsMergeGate=False,marker=marker,cases=[],
              harnessSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  report['browserVersion']=browser.version
  for label,source,fault in [
      ('tagged-control',old/'tagged-source',False),
      ('tagged-induced-failure',old/'tagged-source',True),
      ('candidate-original',old/'source-worktree',False)]:
    original=(source/'assets/app/js/app.js').read_bytes()
    body=original.decode()
    if fault:
      needle='  function updatePubChemMetadataPanel(record) {\n'
      assert body.count(needle)==1
      body=body.replace(needle,needle+f"    if (!window.__restoreProbeThrown) {{ window.__restoreProbeThrown = true; throw new Error('{marker}'); }}\n",1)
      (OUT/'served-fault-app.js').write_text(body)
    row=dict(label=label,sourceRoot=str(source),sourceSha256=hashlib.sha256(original).hexdigest(),
             servedSha256=hashlib.sha256(body.encode()).hexdigest(),injected=fault,
             console=[],pageerrors=[],dialogs=[],expectedIds=['opal','classic'],expectedFlags=[False,False])
    with run_http_server(source) as url:
      context=browser.new_context(viewport={'width':1200,'height':1000})
      context.add_init_script('''window.__restoreProbeErrors=[];
        addEventListener('error',e=>__restoreProbeErrors.push({type:'error',message:e.message}));
        addEventListener('unhandledrejection',e=>__restoreProbeErrors.push({type:'unhandledrejection',message:String(e.reason)}));
        localStorage.setItem('vibemol.autosavePreset', '''+json.dumps(json.dumps(preset))+');')
      page=context.new_page()
      page.on('pageerror',lambda e:row['pageerrors'].append(str(e)))
      page.on('dialog',lambda d:(row['dialogs'].append(dict(type=d.type,message=d.message)),d.dismiss()))
      def capture(message):
        if message.type not in ('warning','error','info'):return
        args=[]
        for arg in message.args:
          try:args.append(arg.evaluate('(x)=>x instanceof Error?{name:x.name,message:x.message,stack:x.stack}:x'))
          except Exception as e:args.append({'serializationError':str(e)})
        row['console'].append(dict(type=message.type,text=message.text,args=args,location=message.location))
      page.on('console',capture)
      if fault:
        page.route('**/assets/app/js/app.js*', lambda route:route.fulfill(status=200,content_type='application/javascript',body=body))
      page.goto(url)
      page.wait_for_function('()=>window.VibeMolAppearanceLooks')
      row['actual']=page.evaluate(snapshot_js)
      page.screenshot(path=str(OUT/(label+'.png')))
      row['faultFired']=page.evaluate('()=>!!window.__restoreProbeThrown')
      context.close()
    row['sourceStillUnchanged']=(source/'assets/app/js/app.js').read_bytes()==original
    report['cases'].append(row)
    print(json.dumps(row,sort_keys=True),flush=True)
  browser.close()
(OUT/'result.json').write_text(json.dumps(report,indent=2)+'\n')
control,fault,candidate=report['cases']
assert control['actual']['ids']==control['expectedIds'],control
assert control['actual']['flags']==control['expectedFlags'],control
for row in (fault,candidate):
  assert row['actual']['ids']==['basic','basic'] and row['actual']['flags']==[True,True],row
  assert row['actual']['settings']==control['actual']['settings'],row
  assert not row['pageerrors'] and not row['actual']['errors'] and not row['dialogs'],row
  assert any(x['type']=='warning' and 'autosave restore failed' in x['text'] for x in row['console']),row
assert fault['faultFired'] and all(x['sourceStillUnchanged'] for x in report['cases'])
print('RESTORE_FAULT_PROBE verified: settings applied; migration skipped; warning only; no pageerror or user dialog',flush=True)
