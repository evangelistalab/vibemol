#!/usr/bin/env python3
"""Startup appearance restoration: fault injection, notices and saved-byte retention.

Relocated and extended from the executed Stage 4 restore-fault/probe.py.
That historical file/results remain immutable. Only served responses are
instrumented; the original app bytes and both hashes are recorded.

PR1's report matrix covers detected failures. Silent semantic shortfalls are
the separate, required two-phase-restore PR2; they are not claimed fixed here.
"""
import argparse
import hashlib
import json
from pathlib import Path

from helpers import run_http_server
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
KEY = 'vibemol.autosavePreset'
HISTORICAL_PROBE = 'tests/baselines/evidence/stage4/pubchem/restore-fault/probe.py'
LEGACY = ROOT / 'tests/fixtures/appearance-autosave-0.9.5.json'

SNAPSHOT = '''() => {
  const hint = document.getElementById('hint');
  const notice = document.getElementById('lookRestoreStatus');
  const state = VibeMolAppearanceLooks.snapshot();
  const result = window.__restoreProbe.result;
  return {result: {status:result.status,reason:result.reason ?? null,
    defaultsInUse:result.defaultsInUse ?? null,
    error:result.error?.message ?? null,fallbackError:result.fallbackError?.message ?? null},
    hint:hint.textContent, ariaHidden:hint.getAttribute('aria-hidden'),
    hintVisible:hint.classList.contains('is-visible'),opacity:getComputedStyle(hint).opacity,
    notice:notice?.textContent,noticeHidden:notice?.hidden,
    stored:window.__restoreProbeRead(),writes:window.__restoreProbeWrites,
    ids:['styleRef','colorsRef'].map(key=>state[key]?.id??null),
    flags:[state.styleModified,state.colorsModified],settings:state.settings,
    appearance:window.__restoreProbe.readAppearance(),defaults:window.__restoreProbe.defaults.settings,
    appearanceAtRestore:window.__restoreProbe.appearanceAtRestore,
    elapsed:performance.now()-window.__restoreProbe.at,
    throwCount:window.__restoreProbeThrowCount,mode:VibeMolWorkbenchHost.getMode()};
}'''

LAYOUT = '''() => {
  const measure = id => {
    const el = document.getElementById(id), rect = el.getBoundingClientRect();
    return {text:el.textContent,x:rect.x,right:rect.right,y:rect.y,bottom:rect.bottom,width:rect.width,
      clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,
      visible:!!el.getClientRects().length && getComputedStyle(el).visibility!=='hidden'};
  };
  return {viewportWidth:innerWidth,hint:measure('hint'),notice:measure('lookRestoreStatus')};
}'''


def instrument(original, count):
    body = original.decode()
    needle = '  const appearanceAutosaveRestoreResult = restoreAppearancePresetAutosave();\n'
    assert body.count(needle) == 1, 'Current startup result must have one caller'
    body = body.replace(needle, needle + '''  window.__restoreProbe = {
    result: appearanceAutosaveRestoreResult, at: performance.now(), hideMs: HINT_AUTO_HIDE_MS,
    defaults: defaultAppearancePresetEnvelope,
    readAppearance: () => exportAppearancePresetEnvelope('Readback').settings,
    // Exact completion boundary, before ordinary startup enables the axes.
    appearanceAtRestore: exportAppearancePresetEnvelope('Restore readback').settings,
  };
''')
    needle = '  function importAppearancePresetEnvelope(presetLike) {\n'
    assert body.count(needle) == 1
    body = body.replace(needle, needle + '    window.__restoreProbeImportCalls++;\n')
    if count:
        needle = '  function updatePubChemMetadataPanel(record) {\n'
        assert body.count(needle) == 1
        body = body.replace(needle, needle + f'''    if (window.__restoreProbeThrowCount < {count}) {{
      window.__restoreProbeThrowCount++;
      throw new Error('RESTORE_FAULT_PROBE_metadata_' + window.__restoreProbeThrowCount);
    }}
''')
    return body


def init_script(raw, read_error, theme):
    return '''(() => {
      const key = 'vibemol.autosavePreset';
      const read = Storage.prototype.getItem, write = Storage.prototype.setItem;
      localStorage.clear();
      localStorage.setItem('vibemol.uiTheme', THEME);
      const raw = RAW;
      if (raw !== null) write.call(localStorage,key,raw);
      window.__restoreProbeRead = () => read.call(localStorage,key);
      window.__restoreProbeWrites = [];
      window.__restoreProbeThrowCount = 0;
      window.__restoreProbeImportCalls = 0;
      Storage.prototype.setItem = function(k,v) {
        if (this === localStorage && k === key) __restoreProbeWrites.push({value:v,at:performance.now()});
        return write.call(this,k,v);
      };
      if (READ_ERROR) Storage.prototype.getItem = function(k) {
        if (this === localStorage && k === key) throw new DOMException('Injected storage read denial','SecurityError');
        return read.call(this,k);
      };
    })();'''.replace('THEME', json.dumps(theme)).replace('RAW', json.dumps(raw)).replace('READ_ERROR', json.dumps(read_error))


def log_assert(condition, actual, expected, label):
    comparands = dict(check=label, actual=actual, expected=expected, passed=bool(condition))
    print('[appearance restore comparands] '+json.dumps(comparands, sort_keys=True), flush=True)
    assert condition, comparands


def run_report_matrix(browser, source, output, url):
    source, output = Path(source), Path(output)
    output.mkdir(parents=True, exist_ok=True)
    assert not (output/'result.json').exists(), 'Use a fresh output directory; preserve previous attempts'
    original = (source/'assets/app/js/app.js').read_bytes()
    source_hashes = {file:hashlib.sha256((source/file).read_bytes()).hexdigest()
                     for file in ['assets/app/js/app.js','assets/app/js/looks-ui.js']}
    valid = json.loads(LEGACY.read_text())
    cases = [
        dict(name='malformed-json', raw='{broken', status='failed', reason='parse', count=0),
        dict(name='storage-read-throws', raw=json.dumps(valid), status='failed', reason='storage-read', count=0, read_error=True),
        dict(name='import-callback-throws', raw=json.dumps(valid), status='failed', reason='import', count=1),
        dict(name='import-and-defaults-throw', raw=json.dumps(valid), status='failed', reason='import', count=2),
    ]
    rows = []
    harness_sha = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    for legacy in [False, True]:
        for theme in ['light', 'dark']:
            active = list(cases)
            if not legacy and theme == 'light':
                active += [dict(name='empty',raw=None,status='empty',count=0),
                           dict(name='study-skipped',raw='{broken',status='skipped',count=0,study=True),
                           dict(name='valid-legacy',raw=json.dumps(valid),status='restored',count=0),
                           dict(name='transient-hint-after-failure',raw='{broken',status='failed',reason='parse',count=0,transient=True)]
            for case in active:
                label = ('legacy' if legacy else 'workbench')+'-'+theme+'-'+case['name']
                body = instrument(original, case['count'])
                context = browser.new_context(viewport={'width':1512,'height':1000})
                context.add_init_script(init_script(case['raw'], case.get('read_error',False), theme))
                page = context.new_page()
                row = dict(case=label, sourceSha256=hashlib.sha256(original).hexdigest(),
                           servedSha256=hashlib.sha256(body.encode()).hexdigest(),console=[],pageerrors=[],observations=[])
                page.on('pageerror',lambda e:row['pageerrors'].append(str(e)))
                def capture(message):
                    if message.type not in ('warning','error','info'): return
                    args = []
                    for arg in message.args:
                        try: args.append(arg.evaluate('(x)=>x instanceof Error?{name:x.name,message:x.message,stack:x.stack}:x'))
                        except Exception as error: args.append(dict(serializationError=str(error)))
                    row['console'].append(dict(type=message.type,text=message.text,args=args,location=message.location))
                page.on('console',capture)
                page.route('**/assets/app/js/app.js*',lambda route:route.fulfill(status=200,content_type='application/javascript',body=body))
                try:
                    suffix = '?workspaceLab='+('0' if legacy else '1')+('&appearanceStudy=1' if case.get('study') else '')
                    page.goto(url+suffix)
                    page.wait_for_function('() => window.VibeMolAppearanceLooks && window.__restoreProbe')
                    first = page.evaluate(SNAPSHOT);row['observations'].append(first)
                    log_assert(first['result']['status']==case['status'],first['result'],dict(status=case['status']),label+' result')
                    if case['status']=='failed':
                        log_assert(first['result']['reason']==case['reason'],first['result']['reason'],case['reason'],label+' failure reason')
                        defaults = case['count'] != 2
                        log_assert(first['result']['defaultsInUse']==defaults,first['result'],dict(defaultsInUse=defaults),label+' fallback')
                        if defaults:
                            log_assert(first['appearanceAtRestore']==first['defaults'],first['appearanceAtRestore'],first['defaults'],label+' actual defaults readback at completion')
                        imports = page.evaluate('__restoreProbeImportCalls')
                        expected_imports = 2 if case['reason']=='import' else 0
                        row['startupImportCalls'] = imports
                        log_assert(imports==expected_imports,imports,expected_imports,label+' import/fallback calls')
                        storage = case['reason']=='storage-read'
                        expected_hint = ('Appearance autosave unavailable. Details in Look.' if storage
                                         else 'Restore failed; autosave paused. Details in Look.')
                        if storage:
                            expected_notice = 'Appearance autosave is unavailable in this browser session. Save a session to keep appearance changes.'
                        else:
                            outcome = ('Saved appearance could not be restored. Defaults were applied at startup.' if defaults
                                       else 'Saved appearance could not be restored, and defaults could not be fully applied.')
                            expected_notice = outcome+' Appearance autosave is paused for this session. Save a session to keep changes. Reload is required to retry restoration and autosave.'
                        log_assert(first['hint']==expected_hint,first['hint'],expected_hint,label+' short hint')
                        # Exercise the real hide deadline, then all available mode-entry hints.
                        page.wait_for_function('() => performance.now()-__restoreProbe.at > __restoreProbe.hideMs+300')
                        expired = page.evaluate(SNAPSHOT);row['observations'].append(expired)
                        log_assert(expired['hint']==expected_hint
                                   and expired['ariaHidden']=='false' and expired['hintVisible']
                                   and float(expired['opacity'])>0.99,expired,
                                   dict(visibleAfterHideDeadline=True,ariaHidden='false'),label+' hide deadline')
                        page.set_viewport_size({'width':390,'height':850})
                        page.evaluate('VibeMolAppearanceLooks.openStudio()')
                        page.locator('#lookRestoreStatus').wait_for(state='visible')
                        page.locator('#lookRestoreStatus').scroll_into_view_if_needed()
                        page.evaluate('''async () => {
                          await document.fonts.ready;
                          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                        }''')
                        narrow = page.evaluate(LAYOUT);row['narrow']=narrow
                        for target in ['hint','notice']:
                            box = narrow[target]
                            bounded = box['visible'] and box['x']>=-1 and box['right']<=391 and box['y']>=-1 and box['bottom']<=851 and box['width']>0 and box['scrollWidth']<=box['clientWidth']+1
                            log_assert(bounded,box,dict(visible=True,withinViewport=390,noHorizontalOverflow=True),label+' 390px '+target)
                        log_assert(narrow['hint']['text']==expected_hint,narrow['hint']['text'],expected_hint,label+' 390px short hint')
                        log_assert(narrow['notice']['text']==expected_notice,narrow['notice']['text'],expected_notice,label+' 390px full notice')
                        page.screenshot(path=str(output/(label+'-390.png')))
                        page.evaluate('VibeMolAppearanceLooks.closeStudio()')
                        page.set_viewport_size({'width':1512,'height':1000})
                        for mode in ['Measure','Edit']+([] if legacy else ['Calculations'])+['Display']:
                            page.locator('#mode'+mode+'Btn').click()
                            observed = page.evaluate(SNAPSHOT);row['observations'].append(observed)
                            log_assert(expected_hint not in observed['hint'],observed['hint'],dict(failureHintReplaced=True),label+' replaced hint '+mode)
                            log_assert(observed['notice']==expected_notice,observed['notice'],expected_notice,label+' durable notice '+mode)
                        if case.get('transient'):
                            page.locator('#modeMeasureBtn').click()
                            page.evaluate('window.__restoreProbeTransientAt=performance.now()')
                            posted = page.evaluate(SNAPSHOT)
                            log_assert(posted['hint']!=expected_hint and posted['hintVisible'] and posted['ariaHidden']=='false',posted,dict(transientVisible=True),label+' transient posted')
                            page.wait_for_function('() => performance.now()-__restoreProbeTransientAt > __restoreProbe.hideMs+300')
                            hidden = page.evaluate(SNAPSHOT)
                            log_assert(hidden['ariaHidden']=='true' and not hidden['hintVisible'] and float(hidden['opacity'])<0.01,hidden,dict(transientAutoHidden=True,ariaHidden='true'),label+' transient expires')
                            log_assert(hidden['notice']==expected_notice,hidden['notice'],expected_notice,label+' durable notice after transient')
                            row['transientHint']=[posted,hidden]
                        page.evaluate('VibeMolAppearanceLooks.openStudio()')
                        page.locator('#lookRestoreStatus').wait_for(state='visible')
                        page.evaluate('''() => {
                          VibeMolAppearanceLooks.apply('toon',{includeColors:true});
                          window.__restoreProbeEditedAt=performance.now();
                        }''')
                        # Deliberate timer test: exceed the normal 500ms write opportunity.
                        page.wait_for_function('() => performance.now()-__restoreProbeEditedAt > 750')
                        last = page.evaluate(SNAPSHOT);row['observations'].append(last)
                        log_assert(last['stored']==case['raw'] and not last['writes'],last,dict(originalPayload=case['raw'],writes=[]),label+' payload survives edit')
                        log_assert(last['notice']==expected_notice and not last['noticeHidden'],last['notice'],expected_notice,label+' durable Looks notice')
                        log_assert(last['throwCount']==case['count'],last['throwCount'],case['count'],label+' injected faults fired')
                        page.screenshot(path=str(output/(label+'.png')))
                    elif case['name']=='valid-legacy':
                        log_assert(first['ids']==['opal','classic'] and first['flags']==[False,False],first,dict(ids=['opal','classic'],flags=[False,False]),label+' migration')
                    if case['status']!='failed':
                        count = page.locator('#lookRestoreStatus').count()
                        log_assert(count==0,count,0,label+' normal DOM has no restore-failure notice')
                    log_assert(not row['pageerrors'],row['pageerrors'],[],label+' pageerrors')
                    row['status']='passed'
                finally:
                    rows.append(row)
                    (output/'progress.json').write_text(json.dumps(rows,indent=2)+'\n')
                    context.close()
    report=dict(status='passed',phase='PR1 reporting',historicalProbe=HISTORICAL_PROBE,
                browserVersion=browser.version,harnessSha256=harness_sha,cases=rows,caseCount=len(rows),
                pendingPR2=['missing-required-key','out-of-range','missing-reference','future-schema'],
                sourceHashes=source_hashes,
                sourceUnchanged=all(hashlib.sha256((source/file).read_bytes()).hexdigest()==expected
                                    for file,expected in source_hashes.items()))
    assert report['sourceUnchanged']
    (output/'result.json').write_text(json.dumps(report,indent=2)+'\n')
    return report


def restore_reporting(page, context, url):
    import premerge as p
    run_report_matrix(context.browser, ROOT, p.ARTIFACTS/'appearance-autosave', url)


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--source-root',type=Path,default=ROOT)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    with run_http_server(args.source_root) as url, sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        try: run_report_matrix(browser,args.source_root,args.output,url)
        finally: browser.close()
