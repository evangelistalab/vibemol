"""Extend the completed app census to private module lookups; not a suite replay."""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import subprocess
import sys

p = argparse.ArgumentParser()
p.add_argument('--source-root', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
source, out = a.source_root.resolve(), a.output.resolve()
target = out / 'module-query-census.json'
assert not target.exists(), 'Do not replay a completed census'
git = lambda *args: subprocess.check_output(['git', '-C', str(source), *args], text=True).strip()
head, tree = git('rev-parse', 'HEAD'), git('rev-parse', 'HEAD^{tree}')
assert not git('status', '--porcelain')
app_sha = hashlib.sha256((source / 'assets/app/js/app.js').read_bytes()).hexdigest()
sys.path.insert(0, str(source / 'tests/e2e'))
from helpers import run_http_server
from playwright.sync_api import sync_playwright

class Ids(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
    def handle_starttag(self, tag, attrs):
        value = dict(attrs).get('id')
        if value:
            self.ids.append(value)
ids = Ids()
ids.feed((source / 'index.html').read_text())
probe = r'''() => {
  const rows = [], seen = new WeakMap();
  const record = (value, method, selector, stack) => {
    if (!(value instanceof Element) || !value.id) return;
    let row = seen.get(value);
    if (!row) {
      row = {node: value, id: value.id, tag: value.tagName, firstSeen: performance.now(),
        initiallyConnected: value.isConnected, sites: new Map()};
      rows.push(row); seen.set(value, row);
    }
    const site = method + '\n' + selector + '\n' + stack;
    const old = row.sites.get(site);
    if (old) old.count++;
    else row.sites.set(site, {method, selector: String(selector), stack, count: 1});
  };
  for (const [prototype, methods] of [
    [Document.prototype, ['getElementById', 'querySelector', 'querySelectorAll', 'getElementsByClassName', 'getElementsByTagName']],
    [Element.prototype, ['querySelector', 'querySelectorAll', 'getElementsByClassName', 'getElementsByTagName']]
  ]) for (const method of methods) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
    if (!descriptor?.value) continue;
    const original = descriptor.value;
    Object.defineProperty(prototype, method, {...descriptor, value: function(...args) {
      const result = Reflect.apply(original, this, args);
      const stack = new Error().stack;
      if (result instanceof Element) record(result, method, args[0], stack);
      else if (result instanceof NodeList || result instanceof HTMLCollection)
        for (const node of result) record(node, method, args[0], stack);
      return result;
    }});
  }
  window.__moduleDomQueryCensus = markupIds => {
    const markup = new Set(markupIds);
    // The original DOM method bypasses the observational wrapper for this readback.
    const liveById = new Map([...document.querySelectorAll('[id]')].map(node => [node.id, node]));
    return rows.filter(row => markup.has(row.id)).map(row => ({id: row.id, tag: row.tag,
      firstSeen: row.firstSeen, initiallyConnected: row.initiallyConnected,
      connected: row.node.isConnected, liveExists: liveById.has(row.id),
      sameAsLive: liveById.get(row.id) === row.node,
      sites: [...row.sites.values()].filter(site => /\/assets\/app\/js\/|\/src\//.test(site.stack))
    })).filter(row => row.sites.length);
  };
}'''
records = []
with run_http_server(source) as url, sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--use-angle=swiftshader'])
    try:
        for legacy in [False, True]:
            context = browser.new_context(viewport={'width': 1512, 'height': 1000})
            context.add_init_script('(' + probe + ')()')
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(url + '?appearanceStudy=1' + ('&workspaceLab=0' if legacy else ''))
            page.wait_for_function('''legacy => typeof __moduleDomQueryCensus === 'function'
              && !!window.VibeMolWorkbenchHost && VibeMolWorkbenchHost.enabled === !legacy
              && (legacy || !!window.VibeMolWorkbench)''', arg=legacy)
            rows = page.evaluate('ids => __moduleDomQueryCensus(ids)', ids.ids)
            assert not errors, errors
            records.append({'launch': 'legacy' if legacy else 'workbench', 'pageErrors': errors, 'references': rows})
            context.close()
        report = {'sourceCommit': head, 'sourceTree': tree, 'sourceAppSha256': app_sha,
          'method': 'Read-only wrappers return the exact original DOM-query results and preserve errors/receiver/arguments. All static scripts, private modules and dynamic selectors are observed during startup. Strong observer references are diagnostic only, not a memory-retention or merge gate. No production response or file rewritten.',
          'coverage': 'Queries returning original index.html IDs, across Document/Element getElementById, querySelector/All and getElementsByClassName/TagName. App lexical census separately identifies cached references and use sites.',
          'browserVersion': browser.version, 'records': records}
        target.write_text(json.dumps(report, indent=2) + '\n')
    finally:
        browser.close()
assert head == git('rev-parse', 'HEAD') and not git('status', '--porcelain')
assert app_sha == hashlib.sha256((source / 'assets/app/js/app.js').read_bytes()).hexdigest()
print(json.dumps({'completed': True, 'lookedUpIds': {r['launch']: len({x['id'] for x in r['references']}) for r in records},
  'detachedIds': {r['launch']: sorted({x['id'] for x in r['references'] if not x['connected']}) for r in records}}, indent=2))
