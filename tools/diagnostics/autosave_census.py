#!/usr/bin/env python3
"""Read-only compatibility census, using real old-build writes and current STRICT import.

Shares the startup probe's serial browser, served-response instrumentation,
source hashes and state/console readbacks. No production bytes are edited.
"""
import argparse
import gzip
import subprocess
import tarfile
import shutil
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
OUT = None
sys.path.insert(0, str(ROOT / 'tests/e2e'))
from helpers import run_http_server
from playwright.sync_api import sync_playwright

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def generate(browser):
    rows = []
    for version in ['v0.9.0', 'v0.9.5']:
        source = OUT / 'sources' / version
        with run_http_server(source) as url:
            context = browser.new_context(viewport={'width': 1512, 'height': 1000})
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(url)
            page.wait_for_function('() => window.VibeMolAppearanceLooks && window.VibeMolWorkbench')
            look_ids = page.evaluate('VibeMolLooks.builtins.map(x => x.id)')
            for theme in ['light', 'dark']:
                page.locator('#themeToggleInput').set_checked(theme == 'dark', force=True)
                for look_id in look_ids:
                    # Each case writes through the actual build's normal autosave timer.
                    page.evaluate('''id => {
                      localStorage.removeItem('vibemol.autosavePreset');
                      VibeMolAppearanceLooks.apply(id, {includeColors: true});
                    }''', look_id)
                    page.wait_for_function('() => localStorage.getItem("vibemol.autosavePreset") !== null')
                    stored = page.evaluate('JSON.parse(localStorage.getItem("vibemol.autosavePreset"))')
                    rows.append(dict(version=version, theme=theme, case=look_id, preset=stored,
                                     sourceAppSha256=hashlib.sha256((source/'assets/app/js/app.js').read_bytes()).hexdigest()))
                    (OUT/'generated-progress.json').write_text(json.dumps(rows,indent=2)+'\n')
            # Generate a retained user reference, an edited recipe and split style/colors.
            page.evaluate('VibeMolAppearanceLooks.openStudio()')
            page.locator('#lookSave').click()
            page.locator('#lookNameInput').fill('Restore compatibility census')
            page.locator('#lookNameInput').press('Enter')
            page.wait_for_function('''() => {
              const p=JSON.parse(localStorage.getItem('vibemol.autosavePreset')||'null');
              return p?.settings?.['appearance.references']?.styleRef?.kind === 'user';
            }''')
            rows.append(dict(version=version, theme='dark', case='saved-user',
                             preset=page.evaluate('JSON.parse(localStorage.getItem("vibemol.autosavePreset"))')))
            page.evaluate('''() => {
              localStorage.removeItem('vibemol.autosavePreset');
              VibeMolAppearanceLooks.apply('opal', {includeColors: true});
              VibeMolAppearanceLooks.applyColors('classic');
              const el=document.getElementById('appearanceBackgroundColor'); el.value='#123456';
              el.dispatchEvent(new Event('input', {bubbles:true}));
              el.dispatchEvent(new Event('change', {bubbles:true}));
            }''')
            page.wait_for_function('() => localStorage.getItem("vibemol.autosavePreset") !== null')
            rows.append(dict(version=version, theme='dark', case='mixed-edited',
                             preset=page.evaluate('JSON.parse(localStorage.getItem("vibemol.autosavePreset"))')))
            assert not errors, errors
            context.close()
    (OUT/'generated-payloads.json').write_text(json.dumps(rows, indent=2)+'\n')
    return rows

EXPOSE = '''
  window.__restoreCensus = {
    project: buildAppearanceAutosaveImportEnvelope,
    schema: () => listPresetSettingSchema(),
    test: raw => {
      const candidate = buildAppearanceAutosaveImportEnvelope(raw);
      const result = runWithAppearancePresetAutosaveSuppressed(() =>
        presetController.importEnvelope(candidate, {mode: PRESET_MODE.STRICT}));
      return {candidate, result, stored: exportAppearancePresetEnvelope('Readback'),
        references: lookReferences.exportState(), snapshot: lookReferences.project(captureLookSettings())};
    }
  };
'''

def census(browser, generated, startup=False):
    corpus = json.loads((OUT/'corpus-payloads.json').read_text())
    sources = json.loads((OUT/'corpus-occurrences.json').read_text())
    for row in generated:
        h = digest(row['preset']); corpus[h] = row['preset']
        sources.append(dict(source='generated:'+row['version'], path=row['theme']+'/'+row['case'], sha256=h))
    original = (ROOT/'assets/app/js/app.js').read_bytes()
    needle = '  window.VibeMolPreset = getSceneGraphAwarePresetPublicApi();\n'
    assert original.decode().count(needle) == 1
    served = original.decode().replace(needle, needle+EXPOSE)
    if startup:
        start=served.index('  function importAppearancePresetEnvelope(')
        end=served.index('\n  function ',start+5)
        old=served[start:end]
        assert old.count('PRESET_MODE.RELAXED')==1 and old.count('return runWith')==1
        served=served.replace(old,old.replace('return runWith','return window.__strictStartupImportReport = runWith').replace('PRESET_MODE.RELAXED','PRESET_MODE.STRICT'))
    expected = {r['sha256']:r['actual']['references'] for r in json.loads((OUT/'direct-import-results.json').read_text())['cases']} if startup else {}
    rows = []
    with run_http_server(ROOT) as url:
        for h, preset in corpus.items():
            context = browser.new_context(viewport={'width': 1512, 'height': 1000})
            if startup:
                context.add_init_script('localStorage.setItem("vibemol.autosavePreset",'+json.dumps(json.dumps(preset))+');')
            page = context.new_page(); warnings = []; errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: warnings.append(m.text) if m.type in ('warning','error') else None)
            page.route('**/assets/app/js/app.js*', lambda route: route.fulfill(
                status=200, content_type='application/javascript', body=served))
            page.goto(url+('' if startup else '?appearanceStudy=1'))
            page.wait_for_function('() => window.VibeMolAppearanceLooks && window.VibeMolWorkbench')
            value = page.evaluate('''() => {
              const result=window.__strictStartupImportReport;
              return {ok:result?.ok===true && result.mode==='strict',result,
                references:VibeMolPreset.export().settings['appearance.references'],
                snapshot:VibeMolAppearanceLooks.snapshot()};
            }''') if startup else page.evaluate('''preset => {
              try { return {ok: true, ...__restoreCensus.test(preset)}; }
              catch (e) { return {ok: false, error: {name:e.name,message:e.message,stack:e.stack}}; }
            }''', preset)
            row = dict(sha256=h, appVersion=preset.get('appVersion'), origins=[x for x in sources if x['sha256']==h],
                       actual=value, warnings=warnings, pageerrors=errors)
            if startup:
                value['referencesMatchDirect']=value['references']==expected[h]
                value['ok']=value['ok'] and value['referencesMatchDirect'] and not errors and not any('autosave restore failed' in w for w in warnings)
            rows.append(row)
            (OUT/'progress.json').write_text(json.dumps(rows,indent=2)+'\n')
            print(json.dumps(dict(sha256=h, appVersion=row['appVersion'], ok=value['ok'],
                                  warnings=value.get('result',{}).get('warnings',[]), error=value.get('error'))), flush=True)
            context.close()
    report = dict(sourceSha256=hashlib.sha256(original).hexdigest(),
                  servedSha256=hashlib.sha256(served.encode()).hexdigest(),
                  diagnosticOnly=True, usableAsMergeGate=False, startup=startup, browserVersion=browser.version,cases=rows,
                  testedUnique=len(rows), strictPassed=sum(x['actual']['ok'] for x in rows),
                  sourceUnchanged=(ROOT/'assets/app/js/app.js').read_bytes()==original)
    (OUT/'strict-import-results.json').write_text(json.dumps(report,indent=2)+'\n')


def prepare_sources(root, out):
    for label, ref in [('v0.9.0','v0.9.0'),('v0.9.5','v0.9.5-pre-refactor')]:
        dest=out/'sources'/label
        assert not dest.exists(), 'Source snapshot already exists'
        dest.mkdir(parents=True)
        process=subprocess.Popen(['git','-C',str(root),'archive',ref],stdout=subprocess.PIPE)
        with tarfile.open(fileobj=process.stdout,mode='r|') as archive:
            archive.extractall(str(dest))
        assert process.wait()==0

def scan_corpus(root, out):
    payloads={};occurrences=[];scanned=[]
    def visit(value,source,path='$'):
        if isinstance(value,dict):
            if value.get('kind')=='vibemol.preset' and isinstance(value.get('settings'),dict):
                h=digest(value);payloads[h]=value
                occurrences.append(dict(source=source,path=path,sha256=h))
            for key,item in value.items():visit(item,source,path+'.'+key)
        elif isinstance(value,list):
            for i,item in enumerate(value):visit(item,source,path+'['+str(i)+']')
        elif isinstance(value,str) and 'vibemol.preset' in value and value.lstrip().startswith(('{','[')):
            try: decoded=json.loads(value)
            except ValueError:return
            visit(decoded,source,path+'<json>')
    for name in subprocess.check_output(['git','-C',str(root),'ls-files','-z'],text=True).split('\0'):
        if not name or name.startswith('ops/') or not name.endswith(('.json','.json.gz','.vibemol-session','.jsonl','.log','.log.gz','.txt')):continue
        raw=(root/name).read_bytes()
        if name.endswith('.gz'):raw=gzip.decompress(raw)
        text=raw.decode(errors='replace')
        if name.endswith(('.log','.log.gz','.txt')):
            decoder=json.JSONDecoder()
            for n,line in enumerate(text.splitlines(),1):
                if 'vibemol.preset' not in line:continue
                for start,char in enumerate(line):
                    if char not in '[{':continue
                    try:value,_=decoder.raw_decode(line[start:])
                    except ValueError:continue
                    visit(value,name,'line:'+str(n));break
        else:
            try:value=json.loads(text)
            except ValueError:
                # Editor configuration JSONC is not an appearance payload.
                assert name.startswith('src/vscode_ext/') and 'vibemol.preset' not in text, name
                continue
            visit(value,name)
        scanned.append(name)
    (out/'corpus-payloads.json').write_text(json.dumps(payloads,indent=2)+'\n')
    (out/'corpus-occurrences.json').write_text(json.dumps(occurrences,indent=2)+'\n')
    (out/'scan.json').write_text(json.dumps(dict(scanned=scanned),indent=2)+'\n')

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--generated-only',action='store_true')
    parser.add_argument('--startup',action='store_true')
    parser.add_argument('--input-census',type=Path)
    parser.add_argument('--source-root',type=Path,default=ROOT)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();ROOT=args.source_root.resolve();OUT=args.output.resolve()
    OUT.mkdir(parents=True,exist_ok=True)
    assert not (OUT/'strict-import-results.json').exists(), 'Preserve completed census; use a fresh output directory'
    if args.input_census:
        for name in ['corpus-payloads.json','corpus-occurrences.json','generated-payloads.json']:
            shutil.copyfile(args.input_census/name,OUT/name)
        shutil.copyfile(args.input_census/'strict-import-results.json',OUT/'direct-import-results.json')
    else:
        scan_corpus(ROOT,OUT)
        prepare_sources(ROOT,OUT)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        print('browser '+browser.version, flush=True)
        generated = json.loads((OUT/'generated-payloads.json').read_text()) if (OUT/'generated-payloads.json').exists() else generate(browser)
        if not args.generated_only: census(browser, generated, args.startup)
        browser.close()
