#!/usr/bin/env python3
"""Actual scoped registry: exact STRICT import/export symmetry and exclusions.

Runs inside look_references.py with its existing browser. Served-response
instrumentation exposes the private autosave boundary; production has no probe.
The legacy import-only appearance.look key must migrate explicitly to references.
"""
import argparse
import hashlib
import json
from pathlib import Path

from appearance_autosave import log_assert
from helpers import run_appearance_scenarios

ROOT = Path(__file__).resolve().parents[2]
RETIRED = ['molecule.glossyBondRadius', 'render.cloudAlpha', 'render.cloudStride',
           'molecule.feature.ink', 'molecule.feature.blackbody.enabled',
           'molecule.feature.blackbody.coldColor', 'molecule.feature.blackbody.hotColor',
           'molecule.opacity.atom', 'molecule.opacity.bond']
EXPOSE = '''  window.__appearanceRegistry = {
    schema: () => listPresetSettingSchema(), scope: APPEARANCE_AUTOSAVE_PERSIST_SCOPE,
    export: () => exportAppearancePresetEnvelope('Registry symmetry'),
    prepare: raw => prepareAppearanceAutosaveRestore(raw, []),
    commit: candidate => importAppearancePresetEnvelope(candidate),
  };
'''


def exact(left, right):
    # Python's True == 1 must not hide a changed exported representation.
    return json.dumps(left, sort_keys=True, separators=(',', ':')) == json.dumps(right, sort_keys=True, separators=(',', ':'))


def registry_symmetry(page, context, url):
    import premerge as p
    output = p.ARTIFACTS / 'appearance-registry'
    output.mkdir(parents=True, exist_ok=True)
    original = (ROOT/'assets/app/js/app.js').read_bytes()
    needle = '  window.VibeMolPreset = getSceneGraphAwarePresetPublicApi();\n'
    log_assert(original.decode().count(needle) == 1, original.decode().count(needle), 1, 'registry probe anchor')
    served = original.decode().replace(needle, needle+EXPOSE)
    report = dict(sourceSha256=hashlib.sha256(original).hexdigest(),
                  servedSha256=hashlib.sha256(served.encode()).hexdigest(),
                  harnessSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), cases=[], pageerrors=[])
    fresh = context.browser.new_context(viewport={'width':1512, 'height':1000})
    other = fresh.new_page()
    other.on('pageerror', lambda error: report['pageerrors'].append(str(error)))
    other.route('**/assets/app/js/app.js*', lambda route: route.fulfill(
        status=200, content_type='application/javascript', body=served))
    try:
        other.goto(url+'?appearanceStudy=1')
        other.wait_for_function('() => window.VibeMolAppearanceLooks && window.__appearanceRegistry')
        other.evaluate('''async () => {
          await document.fonts.ready;
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        }''')
        inventory = other.evaluate('''() => {
          const probe=__appearanceRegistry;
          return {scoped:probe.schema().filter(x=>x.persistScope===probe.scope).map(x=>x.key).sort(),
            exported:Object.keys(probe.export().settings).sort()};
        }''')
        expected = sorted(set(inventory['scoped'])-{'appearance.look'})
        log_assert('appearance.look' in inventory['scoped'], inventory, 'legacy import-only key registered', 'legacy scope')
        log_assert(inventory['exported'] == expected, inventory, dict(exported=expected), 'every scoped key exported except explicit legacy migration')
        report['inventory'] = inventory
        # All current recipes plus a genuinely edited/custom state exercise the
        # live setters, after-import reconciliation and exporter, without mocks.
        states = other.evaluate('VibeMolLooks.builtins.map(x=>x.id)') + ['custom']
        for state in states:
            observed = other.evaluate('''state => {
              VibeMolAppearanceLooks.apply(state==='custom'?'basic':state,{includeColors:true});
              if(state==='custom') VibeMolPreset.import({kind:VibeMolPreset.kind,presetVersion:VibeMolPreset.version,
                settings:{'global.showAxes':false,'global.showBonds':false,'surface.colorScheme':'custom',
                  'surface.posColor':'#123456','surface.negColor':'#654321'}},{mode:'strict'});
              const before=__appearanceRegistry.export(), imported=VibeMolPreset.import(before,{mode:'strict',applyBuilder:false});
              return {state,imported,before:before.settings,after:__appearanceRegistry.export().settings};
            }''', state)
            report['cases'].append(observed)
            log_assert(observed['imported']['ok'] and not observed['imported']['warnings'], observed['imported'], dict(ok=True,warnings=[]), state+' STRICT import')
            log_assert(sorted(observed['after']) == expected, sorted(observed['after']), expected, state+' export composition')
            for key in expected:
                log_assert(exact(observed['before'][key], observed['after'][key]), observed['after'][key], observed['before'][key], state+' round trip '+key)
        # The only non-exported scoped key is intentionally one-way. Assert its
        # canonical destination rather than weakening equality for all settings.
        legacy = other.evaluate('''() => {
          const raw=__appearanceRegistry.export();
          delete raw.settings['appearance.references'];
          raw.settings['appearance.look']=VibeMolLooks.builtins.find(x=>x.id==='basic');
          const candidate=__appearanceRegistry.prepare(raw), result=__appearanceRegistry.commit(candidate);
          return {candidate,result,after:__appearanceRegistry.export().settings};
        }''')
        report['legacy'] = legacy
        migrations = [x for x in legacy['candidate']['normalizations'] if x['key']=='appearance.look']
        log_assert(len(migrations)==1 and migrations[0].get('toKey')=='appearance.references', migrations, 'one explicit migration to appearance.references', 'legacy import-only disposition')
        log_assert(legacy['result']['complete'] and 'appearance.look' not in legacy['after'], legacy['result'], dict(complete=True), 'legacy canonical readback')
        policies = other.evaluate('''retired => {
          const probe=__appearanceRegistry, rows=[];
          for(const kind of ['retired','unknown','outside','future']) {
            const raw=probe.export(), before=probe.export().settings;
            if(kind==='retired') for(const key of retired) raw.settings[key]=1;
            if(kind==='unknown') raw.settings['appearance.unrecognized']=true;
            if(kind==='outside') raw.settings['view.autoRotate']=true;
            if(kind==='future') { raw.presetVersion++; raw.settings['appearance.unrecognized']=true; }
            try { const candidate=probe.prepare(raw); rows.push({kind,ok:true,excluded:candidate.excluded,before,after:probe.export().settings}); }
            catch(error) { rows.push({kind,ok:false,error:error.message,before,after:probe.export().settings}); }
          }
          return rows;
        }''', RETIRED)
        report['policies'] = policies
        for row in policies:
            log_assert(exact(row['before'],row['after']), row['after'], row['before'], row['kind']+' preparation does not mutate')
            if row['kind']=='retired':
                expected_excluded = [dict(key=key,reason='retired legacy setting') for key in RETIRED]
                log_assert(row['ok'] and row['excluded']==expected_excluded, row, dict(ok=True,excluded=expected_excluded), 'current schema exclusion composition')
            else:
                error = {'unknown':'Unsupported autosaved appearance setting: appearance.unrecognized',
                         'outside':'Autosaved setting is outside appearance scope: view.autoRotate',
                         'future':'Unsupported autosaved appearance schema version.'}[row['kind']]
                log_assert(not row['ok'] and row['error']==error, row.get('error'), error, row['kind']+' rejection')
        log_assert(not report['pageerrors'], report['pageerrors'], [], 'registry page errors')
        report['passed'] = True
        print('[appearance registry] '+json.dumps(dict(scoped=len(inventory['scoped']),exported=len(expected),states=len(states),exactReadbacks=len(states)*len(expected),passed=True)), flush=True)
    finally:
        report['sourceUnchanged'] = (ROOT/'assets/app/js/app.js').read_bytes()==original
        (output/'result.json').write_text(json.dumps(report,indent=2)+'\n')
        fresh.close()


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    import premerge as p
    p.ARTIFACTS=args.output
    run_appearance_scenarios(ROOT,args.output,[registry_symmetry])
