#!/usr/bin/env python3
"""Runtime Appearance/Studio value and writer invariant (0.11 decision gate).

Enumerate the actual editor binding factories and the original Appearance DOM;
discover pairs by independent canonical perturbation, then exercise both existing
event handlers from the same state. Do not infer a shared writer from matching
labels or assume disconnected Workbench backing nodes are live controls.
"""
import argparse
import copy
import hashlib
import json
import time
from pathlib import Path

from appearance_autosave import log_assert
from paired_controls_contract import exact, evaluate, pair_checks, scope_checks
from helpers import run_http_server
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
SETTLE = '''async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}'''
EXPOSE = '''  Object.assign(window.__pairedControls, {
    envelope: () => exportAppearancePresetEnvelope('Paired controls'),
    state: () => ({settings:captureLookSettings(), rendering:appearanceModel.clone(appearanceState),
      material:appearanceModel.clone(appearanceState.material),
      parameters:appearanceModel.materialParameters(appearanceState.material),
      surface:getSurfaceStyleDefaults(), swatch:'custom'}),
    sync: () => { looksUi.sync(); appearanceInspectorController.syncAll(); },
    side: () => { if (propertiesInspector) { propertiesInspector.setTab('object'); propertiesInspector.sync(); } },
    editor: () => { if (propertiesInspector) propertiesInspector.setTab('look'); looksUi.sync(); },
    normalizeSurfaceRequest: patch => normalizeSurfaceStylePatch(patch, getSurfaceStyleDefaults()),
  });
'''


def replace_once(body, anchor, replacement):
    log_assert(body.count(anchor) == 1, body.count(anchor), 1, 'paired probe anchor '+anchor.strip())
    return body.replace(anchor, replacement)


def sources():
    paths = ['app.js', 'appearance-editor.js', 'looks-ui.js']
    original = {name:(ROOT/'assets/app/js'/name).read_text() for name in paths}
    served = dict(original)
    anchor = '  window.VibeMolPreset = getSceneGraphAwarePresetPublicApi();\n'
    served['app.js'] = replace_once(served['app.js'], anchor, anchor+EXPOSE)
    for signature in [
            "  function editAppearanceSettings(patch, phase = 'change') {\n",
            "  function editSceneBackgroundColor(value, phase = 'change') {\n",
            "  function editSurfaceStyle(patch, phase = 'change', defaults = false) {\n",
            "  function editAppearanceComponent(section, patch, options = {}) {\n",
            "  function runAppearanceEdit(key, phase, action) {\n",
            "  function applyNamedLook(look, { includeColors = true } = {}) {\n"]:
        name = signature.split('function ')[1].split('(')[0]
        # Do not serialize action functions; record the grouped transaction key.
        args = {'runAppearanceEdit':'[key, phase]',
                'editSurfaceStyle':'[patch, phase, defaults]',
                'editAppearanceSettings':'[patch, phase]',
                'editSceneBackgroundColor':'[value, phase]',
                'editAppearanceComponent':'[section, patch, options]',
                'applyNamedLook':'[look, {includeColors}]'}[name]
        served['app.js'] = replace_once(served['app.js'], signature,
            signature+f"    window.__pairedControls.record('{name}', {args});\n")
    anchor = '    const root = deps.root, controls = [];\n'
    served['appearance-editor.js'] = replace_once(served['appearance-editor.js'], anchor,
        anchor+'    window.__pairedControls.captureOriginals();\n')
    for kind, signature in [
        ('select', '    function select(parent, id, label, choices, getter, setter, visible = () => true) {\n'),
        ('checkbox', '    function toggle(parent, id, label, getter, setter, visible = () => true) {\n'),
        ('number', '    function slider(parent, id, label, min, max, precision, getter, setter, options = {}) {\n'),
        ('color', '    function color(parent, id, label, getter, setter, visible = () => true) {\n')]:
        extra = ', {min, max, precision}' if kind == 'number' else ''
        served['appearance-editor.js'] = replace_once(served['appearance-editor.js'], signature,
            signature+f"      window.__pairedControls.register(id, '{kind}', getter{extra});\n")
    anchor = "    $('lookPreset').onchange = () => run(() => { const look = [...L.builtins, ...library].find(item => item.id===$('lookPreset').value); if (look) choose(look); });\n"
    served['looks-ui.js'] = replace_once(served['looks-ui.js'],anchor,
        "    window.__pairedControls.choice(deps.presetSelect, $('lookPreset'));\n"+anchor)
    anchor = "    function edit(key, phase, action) {\n"
    served['looks-ui.js'] = replace_once(served['looks-ui.js'],anchor,
        anchor+"      window.__pairedControls.record('looksUi.edit', [key, phase]);\n")
    return original, served


def get_path(value, path):
    for key in path:
        value = value[int(key) if isinstance(value, list) else key]
    return value


def patch(envelope, path, value):
    result = copy.deepcopy(envelope)
    owner = result['settings']
    for key in path[:-1]:
        owner = owner[int(key) if isinstance(owner, list) else key]
    owner[int(path[-1]) if isinstance(owner, list) else path[-1]] = value
    return result


def apply(page, envelope, presented=False):
    result = page.evaluate('value => VibeMolPreset.import(value,{mode:"strict",applyBuilder:false})', envelope)
    log_assert(result['ok'] and not result['warnings'], {'ok':result['ok'],'warnings':result['warnings']},
               {'ok':True,'warnings':[]}, 'paired canonical seed')
    # Discovery reads the actual sync functions directly. Only control writes
    # need the presented-frame boundary; do not make a DOM binding census a
    # repeated renderer benchmark. The write assertions below still await it.
    page.evaluate('__pairedControls.sync()')
    if presented:
        page.evaluate(SETTLE)


def alternate(binding, current):
    if type(current) is bool:
        return not current
    if binding['type'] == 'color':
        return '#345678' if current != '#345678' else '#abcdef'
    if binding.get('choices') and current in binding['choices']:
        return next((v for v in binding['choices'] if v != current), None)
    if type(current) in (float, int) and binding.get('min') is not None:
        value = round((binding['min'] + binding['max'])/2, binding.get('precision',3))
        value = value if value != current else binding['min']
        # JSON coming back from JavaScript has one Number type: 23.0 becomes
        # 23. Preserve that representation here; exact() still rejects true/1.
        return int(value) if isinstance(value,float) and value.is_integer() else value
    return None


def measure(page, layout, output, errors):
    import premerge as p
    report = {'layout':layout,'discovery':[],'pairs':[],'scopeAsymmetries':[],'pageerrors':errors}
    page.wait_for_function('() => window.VibeMolAppearanceLooks && window.__pairedControls.envelope')
    # The same actual cube is present for both UIs; selected-orbital controls
    # must not accidentally be compared only in the empty/defaults state.
    loaded = p.load(page, [{'name':'paired.cube','text':p.cube(0)}])
    log_assert(loaded['ok'], loaded, {'ok':True}, 'paired fixture')
    page.evaluate('VibeMolAppearanceLooks.apply("classic",{includeColors:true})')
    seed = page.evaluate('__pairedControls.envelope()')
    seed['settings'].update({'surface.colorScheme':'custom', 'surface.posColor':'#123456',
                             'surface.negColor':'#654321','molecule.feature.fog':True})
    apply(page, seed)
    page.evaluate('''() => {
      VibeMolAppearanceLooks.openStudio();
      const button=document.getElementById('displayInspectorBtn');
      if(button && button.getAttribute('aria-expanded')!=='true') button.click();
      for(const el of document.querySelectorAll('#displayInspector details,#looksPanel details')) el.open=true;
    }''')
    page.evaluate(SETTLE)
    inventory = page.evaluate('__pairedControls.inventory()')
    report['inventory'] = inventory
    (output/(layout+'-inventory.json')).write_text(json.dumps(inventory,indent=2)+'\n')
    candidates = {}
    for binding in inventory['editor']:
        if len(binding['paths']) != 1:
            continue
        path = binding['paths'][0]
        current = get_path(seed['settings'], path)
        value = alternate(binding, current)
        if value is None or exact(value, current):
            continue
        candidates.setdefault(json.dumps(path), (path, value))
    # Independent read-path discovery precedes any control write. A different
    # writer cannot make a pair disappear by writing the wrong key.
    for path, value in candidates.values():
        apply(page, seed)
        page.evaluate('__pairedControls.side()')
        before = page.evaluate('__pairedControls.values()')
        eligible = set(page.evaluate('__pairedControls.eligible()'))
        apply(page, patch(seed, path, value))
        page.evaluate('__pairedControls.side()')
        after = page.evaluate('__pairedControls.values()')
        eligible.intersection_update(page.evaluate('__pairedControls.eligible()'))
        page.evaluate('__pairedControls.editor()')
        actual = page.evaluate('__pairedControls.inventory().editor')
        changed = [id_ for id_ in before if not exact(before[id_], after[id_])]
        matched = []
        for binding in actual:
            if binding['owner'] != 'looksPanel' or binding['paths'] != [path]:
                continue
            for id_ in sorted(set(changed) & eligible):
                if id_ != binding['id'] and exact(after[id_], binding['value']):
                    matched.append([id_, binding['id']])
        report['discovery'].append({'path':path,'requested':value,'changed':changed,'pairs':matched})
        print('[paired discovery] '+json.dumps(report['discovery'][-1]),flush=True)
        for left, right in matched:
            # Defaults vs selected-orbital overrides are explicitly documented
            # scopes, not competing owners of a single setting. Keep the full
            # traces/readbacks; assert this exact asymmetry below.
            supports_input=page.evaluate('id=>typeof document.getElementById(id).oninput==="function"',left)
            for phase in (['change','input'] if supports_input else ['change']):
                row = {'path':path, 'ids':[left,right], 'phase':phase,'requested':value,'writes':[]}
                for id_ in row['ids']:
                    apply(page, seed)
                    page.evaluate('([id,value,phase]) => __pairedControls.change(id,value,phase)', [id_, after[left],phase])
                    page.evaluate(SETTLE)
                    row['writes'].append(page.evaluate('__pairedControls.readback()'))
                scoped = (len(path) == 1 and path[0] in ['surface.colorScheme','surface.posColor','surface.negColor','surface.opacity'])
                if scoped:
                    row['disposition'] = 'selected orbital versus workspace style default'
                    row['normalizedRequests'] = [page.evaluate('patch=>__pairedControls.normalizeSurfaceRequest(patch)',entry['trace'][0]['args'][0])
                                                 for entry in row['writes']]
                    row['scopeMatchesContract']=all(c['passed'] for c in scope_checks(row))
                    report['scopeAsymmetries'].append(row)
                else:
                    row['passed']=all(c['passed'] for c in pair_checks(row))
                    report['pairs'].append(row)
        (output/(layout+'-partial.json')).write_text(json.dumps(report,indent=2)+'\n')
    for choices in inventory['choices']:
        row = {'path':['appearance.references','styleRef'],'ids':[control['id'] for control in choices],
               'phase':'change','requested':'basic','writes':[]}
        for id_ in row['ids']:
            apply(page,seed)
            page.evaluate('([id,value]) => __pairedControls.change(id,value)',[id_,'basic'])
            page.evaluate(SETTLE)
            row['writes'].append(page.evaluate('__pairedControls.readback()'))
        row['passed']=all(c['passed'] for c in pair_checks(row))
        report['pairs'].append(row)
    report['pageerrors'] = list(report['pageerrors'])
    (output/(layout+'.json')).write_text(json.dumps(report, indent=2)+'\n')
    return report


def run_invariant(browser, url, output, discover=False):
    output.mkdir(parents=True,exist_ok=True)
    started=time.monotonic()
    original, served = sources()
    probe = (HERE/'paired_controls_probe.js').read_text()
    provenance = {'source':{name:hashlib.sha256(body.encode()).hexdigest() for name,body in original.items()},
                  'served':{name:hashlib.sha256(body.encode()).hexdigest() for name,body in served.items()},
                  'harnessSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                  'probeSha256':hashlib.sha256(probe.encode()).hexdigest()}
    (output/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
    reports = []
    log_assert(not browser.contexts,len(browser.contexts),0,'paired zero background contexts')
    for layout in ['legacy','workbench']:
        context = browser.new_context(viewport={'width':1512,'height':1000})
        try:
            context.add_init_script(script=probe)
            page = context.new_page()
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.on('dialog',lambda dialog:dialog.dismiss())
            for name, body in served.items():
                def handler(source):
                    return lambda route: route.fulfill(status=200,content_type='application/javascript',body=source)
                page.route('**/assets/app/js/'+name+'*', handler(body))
            page.goto(url+'?appearanceStudy=1&workspaceLab='+('0' if layout=='legacy' else '1'))
            reports.append(measure(page, layout, output, errors))
        except Exception:
            from helpers import write_failure_artifacts
            write_failure_artifacts(page,output,layout,errors,[])
            raise
        finally:
            context.close()
    log_assert(not browser.contexts, len(browser.contexts), 0, 'paired zero residual contexts')
    summary = {report['layout']:{'pairs':len(set(tuple(row['ids']) for row in report['pairs'])),'writeCases':len(report['pairs']),
                 'divergences':sum(not all(c['passed'] for c in pair_checks(row)) for row in report['pairs']),
                 'scopeAsymmetries':len(set(tuple(row['ids']) for row in report['scopeAsymmetries'])),
                 'scopeContractFailures':sum(not all(c['passed'] for c in scope_checks(row)) for row in report['scopeAsymmetries']),
                 'pageerrors':report['pageerrors']} for report in reports}
    summary.update(wallSeconds=round(time.monotonic()-started,3),discoveryOnly=discover)
    (output/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    print('[paired controls] '+json.dumps(summary),flush=True)
    for name, body in original.items():
        log_assert((ROOT/'assets/app/js'/name).read_text()==body, name, 'unchanged', 'paired source unchanged')
    baseline=None if discover else json.loads((ROOT/'tests/baselines/paired-controls.json').read_text())
    for report in reports:
        if discover:
            checks=[c for row in report['pairs'] for c in pair_checks(row)]
            checks.extend(c for row in report['scopeAsymmetries'] for c in scope_checks(row))
            log_assert(not report['pageerrors'],report['pageerrors'],[],'paired page errors')
            result=dict(passed=all(c['passed'] for c in checks),checks=checks,discoveryOnly=True)
        else:
            result=evaluate(report,baseline['layouts'][report['layout']])
        (output/(report['layout']+'-checks.json')).write_text(json.dumps(result,indent=2)+'\n')
        # Emit ALL independent actual/expected values before an assertion aborts.
        print('[paired comparands] '+json.dumps(result,sort_keys=True),flush=True)
        assert result['passed'], report['layout']+' paired-control contract failed; see all comparands'
    return reports


def paired_control_invariant(page, context, url):
    import premerge as p
    browser=context.browser
    # The census creates two serial pages, never a rendering parent beside them.
    context.close()
    run_invariant(browser,url,p.ARTIFACTS/'paired-controls')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--discover',action='store_true',help='measurement only; no baseline acceptance')
    args=parser.parse_args()
    with run_http_server(ROOT) as url, sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True)
        try:
            run_invariant(browser,url,args.output,args.discover)
        finally:
            browser.close()


if __name__ == '__main__':
    main()
