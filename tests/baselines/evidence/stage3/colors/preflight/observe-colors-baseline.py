"""Read-only native editor routes, then the app-owned DOM retirement census."""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import subprocess
import sys
import traceback

parser = argparse.ArgumentParser()
parser.add_argument('--source-root', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--resume-incomplete-native', action='store_true')
parser.add_argument('--attempt-label', default='initial')
args = parser.parse_args()
source, out = args.source_root.resolve(), args.output.resolve()
out.mkdir(parents=True, exist_ok=True)
assert args.resume_incomplete_native or not (out / 'reachability.json').exists(), 'Do not duplicate completed native proof'
sys.path.insert(0, str(source / 'tests/e2e'))
from helpers import run_http_server
from playwright.sync_api import sync_playwright

metadata = json.loads((out / 'bindings.json').read_text())
assert metadata['sourceAppSha256'] == hashlib.sha256((source / 'assets/app/js/app.js').read_bytes()).hexdigest()
git = lambda *args: subprocess.check_output(['git', '-C', str(source), *args], text=True).strip()
assert git('rev-parse', 'HEAD') == metadata['sourceCommit']
assert not git('status', '--porcelain')
fixture = out / 'carbon.xyz'
fixture.write_text('1\nElement Colors native route\nC 0 0 0\n')
native, records = [], []
if args.resume_incomplete_native:
    native = json.loads((out / 'reachability.json').read_text())['results']
    assert {row['case'] for row in native} == {'workbench-light', 'workbench-dark', 'legacy-light'}
    assert (out / 'legacy-dark-failure.log').exists() and not (out / 'dom-census.json').exists()
script = (out / 'observational-app.js').read_text()
by_name = {row['name']: row for row in metadata['bindings']}


class MarkupIds(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack, self.ids = [], {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        node = {'tag': tag, 'id': attrs.get('id'), 'class': attrs.get('class', ''), 'line': self.getpos()[0]}
        if node['id']:
            self.ids[node['id']] = {'line': node['line'], 'ancestors': self.stack.copy()}
        if tag not in ['input', 'img', 'br', 'hr', 'meta', 'link', 'source', 'area', 'base', 'wbr', 'embed', 'param', 'track', 'col']:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i]['tag'] == tag:
                self.stack = self.stack[:i]
                break


index = MarkupIds()
index.feed((source / 'index.html').read_text())
renderer = None
with run_http_server(source) as url, sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--use-angle=swiftshader'])
    try:
        for legacy in [False, True]:
            for theme in ['light', 'dark']:
                case = ('legacy' if legacy else 'workbench') + '-' + theme
                if any(row['case'] == case for row in native):
                    continue
                context = browser.new_context(viewport={'width': 1512, 'height': 1000})
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                try:
                    page.goto(url + '?appearanceStudy=1' + ('&workspaceLab=0' if legacy else ''))
                    page.wait_for_function('() => !!window.VibeMolWorkbenchHost && !!window.VibeMolAppearanceLooks')
                    if page.locator('#themeToggleInput').is_checked() != (theme == 'dark'):
                        # Legacy utilities are intentionally hover/focus-revealed
                        # (index.html CSS). Use their ordinary keyboard route;
                        # the failed unrevealed pointer attempt remains saved.
                        if args.resume_incomplete_native:
                            page.locator('#themeToggleInput').focus()
                            page.keyboard.press('Space')
                        else:
                            page.locator('#themeToggleShell').click()
                        assert page.locator('#themeToggleInput').is_checked() == (theme == 'dark')
                    page.locator('#fileInput').set_input_files(str(fixture))
                    page.wait_for_function('''() => {
                      try { return VibeMolStructure.exportActive()?.volume.atoms.length === 1; }
                      catch (error) {
                        if (error.message === 'No active structure is loaded.') return false;
                        throw error;
                      }
                    }''')
                    if legacy:
                        page.locator('#displayInspectorBtn').click()
                        button = page.locator('#elementColorBtn')
                        assert button.is_visible()
                        route = button.evaluate('el => el.onclick.toString()')
                        path = 'Appearance → Element colors → Edit… (supported legacy button)'
                    else:
                        page.locator('#workbenchPanelsBtn').click()
                        page.locator('#workbenchPanelsMenu').get_by_role('menuitemcheckbox', name='Properties', exact=True).click()
                        page.locator('#inspectorLookTab').click()
                        page.locator('#appearanceColorsSection > summary').click()
                        button = page.locator('#studioElementColorEdit')
                        assert button.is_visible()
                        route = button.evaluate('el => el.onclick.toString()')
                        assert 'openElementColors' in route
                        path = 'Panels → Properties → Look → Colors → Edit… via openElementColors'
                    button.click()
                    page.wait_for_function("() => document.getElementById('elementColorOverlay').style.display === 'flex' && document.getElementById('periodicTableCanvas').width > 0")
                    assert page.locator('#elementColorOverlay').is_visible()
                    observation = {'case': case, 'launch': 'legacy' if legacy else 'workbench',
                                   'theme': theme, 'path': path, 'clickHandler': route,
                                   'editorOpen': True, 'title': page.locator('#elementColorName').inner_text(),
                                   'oldButtonConnected': page.locator('#elementColorBtn').count() == 1,
                                   'themeAction': 'native checkbox focus/Space after unrevealed-label collector mistake' if args.resume_incomplete_native else 'native pointer',
                                   'pageErrors': errors.copy()}
                    page.screenshot(path=str(out / (case + '-native-editor.png')))
                    page.locator('#elementColorClose').click()
                    assert page.locator('#elementColorOverlay').is_hidden()
                    assert not errors, errors
                    native.append(observation)
                    (out / 'reachability.json').write_text(json.dumps({'source': metadata['sourceCommit'],
                        'sourceAppSha256': metadata['sourceAppSha256'], 'method': 'Native clicks and file picker; no QA, private control API, response rewriting or sleeps in native cases.',
                        'results': native, 'complete': len(native) == 4}, indent=2) + '\n')
                    print('NATIVE_PASS ' + case, flush=True)
                except BaseException:
                    failure = case + '-' + args.attempt_label + '-failure'
                    (out / (failure + '.log')).write_text(traceback.format_exc())
                    page.screenshot(path=str(out / (failure + '.png')))
                    (out / (failure + '.html')).write_text(page.content())
                    raise
                finally:
                    context.close()
        for legacy in [False, True]:
            context = browser.new_context(viewport={'width': 1512, 'height': 1000})
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.route('**/assets/app/js/app.js*', lambda route: route.fulfill(body=script, content_type='text/javascript'))
            page.goto(url + '?appearanceStudy=1' + ('&workspaceLab=0' if legacy else ''))
            page.wait_for_function('''legacy => typeof window.__domReferenceCensus === 'function'
              && !!window.VibeMolWorkbenchHost && VibeMolWorkbenchHost.enabled === !legacy
              && (legacy || !!window.VibeMolWorkbench)''', arg=legacy)
            rows = page.evaluate('''meta => {
              const bindings=__domReferenceCensus(), rows=[];
              function add(name,node,queriedId=null) {
                const id=node?.id||queriedId;if(!id)return;
                const live=document.getElementById(id),parents=[];
                for(let p=node?.parentElement;p;p=p.parentElement)parents.push({id:p.id,tag:p.tagName,class:p.className});
                rows.push({name,id,cachedNull:node===null,cachedConnected:node?.isConnected??null,
                  liveExists:!!live,same:node===live,tag:node?.tagName??null,ancestors:parents,
                  type:node?.type??null,hasClickHandler:typeof node?.onclick==='function'});
              }
              for(const {name,queriedId} of meta.bindings) {
                const value=bindings[name];
                if(value instanceof Element || (value===null&&queriedId))add(name,value,queriedId);
                else if(Array.isArray(value)||value instanceof NodeList||value instanceof HTMLCollection)
                  [...value].forEach((v,i)=>{if(v instanceof Element)add(name+'['+i+']',v);});
                else if(value&&typeof value==='object'&&value.panel instanceof Element)add(name+'.panel',value.panel);
              }
              for(const [name,node] of Object.entries(bindings.els))add('els.'+name,node,meta.fields[name]?.queriedId);
              return rows;
            }''', metadata)
            for row in rows:
                entry = metadata['fields'].get(row['name'][4:], {}) if row['name'].startswith('els.') else by_name.get(row['name'].split('[')[0].split('.')[0], {})
                row.update(declarationLine=entry.get('declarationLine'), queryLine=entry.get('queryLine'),
                           indexMarkup=index.ids.get(row['id']), referenceSites=entry.get('references', []))
            assert not errors, errors
            records.append({'launch': 'legacy' if legacy else 'workbench', 'pageErrors': errors, 'references': rows})
            renderer = page.evaluate('''() => {const gl=document.createElement('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return {version:gl.getParameter(gl.VERSION),unmaskedRenderer:gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)};}''')
            context.close()
        workbench, legacy = records
        legacy_by_name = {row['name']: row for row in legacy['references']}
        retired = [row for row in workbench['references'] if not row['same'] and row['cachedConnected'] is False]
        absent = [row for row in workbench['references'] if row['cachedNull'] and not row['liveExists']]
        for row in retired:
            row['legacyComparison'] = legacy_by_name.get(row['name'])
        report = {key: metadata[key] for key in ['sourceCommit', 'sourceTree', 'sourceAppSha256', 'instrumentedAppSha256', 'method']}
        report.update(moduleBindingsInspected=len(metadata['bindings']), directIdCacheBindings=sum(bool(x['queriedId']) for x in metadata['bindings']),
                      canonicalElsFields=len(metadata['fields']), records=records, workbenchDetachedOrReplaced=retired,
                      nullAbsentReferences=absent, browserVersion=browser.version, renderer=renderer)
        (out / 'dom-census.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps({'nativeCasesPassed': len(native), 'moduleBindings': report['moduleBindingsInspected'],
                          'references': {x['launch']: len(x['references']) for x in records},
                          'detachedReferences': len(retired), 'detachedIds': len({x['id'] for x in retired}),
                          'retired': [{'name': x['name'], 'id': x['id'], 'legacyConnected': x['legacyComparison']['cachedConnected']} for x in retired]}, indent=2))
    finally:
        browser.close()
assert hashlib.sha256((source / 'assets/app/js/app.js').read_bytes()).hexdigest() == metadata['sourceAppSha256']
assert not git('status', '--porcelain')
