"""Observe the historical silent partial-selection write; never supplies acceptance."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tests/e2e'))
import premerge as p
from edit_api import METHANE, ready
from surface_shadows import settle


def run(source, output):
    errors = []
    with p.run_http_server(source) as url, p.sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=['--use-angle=swiftshader'])
        try:
            context = browser.new_context(viewport={'width': 1512, 'height': 1000})
            try:
                page = context.new_page()
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(url + '?workspaceLab=0&appearanceStudy=1')
                ready(page, '()=>!!(window.VibeMolTesting&&window.VibeMolEmbed)', site='legacy-selection-control')
                assert p.load(page, [dict(name='control.xyz', text=METHANE)])['ok']
                page.locator('#modeEditBtn').click()
                settle(page)
                result = page.evaluate('''()=>{
                  let result=null,error=null;
                  const before=VibeMolStructure.exportActive().volume;
                  try{result=VibeMolTesting.setEditSelectionIndices([0,999]);}catch(thrown){error=thrown.editApi?.code||thrown.message;}
                  return {requested:[0,999],available:before.atoms.map((_,i)=>i),resolved:VibeMolTesting.getEditSelectionIndices(),result,error,
                    geometryUnchanged:JSON.stringify(before)===JSON.stringify(VibeMolStructure.exportActive().volume)};
                }''')
                result.update(sourceAppSha256=hashlib.sha256((source / 'assets/app/js/app.js').read_bytes()).hexdigest(), pageErrors=errors, browser=browser.version)
                print('[legacy-selection-control] ' + json.dumps(result), flush=True)
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_text(json.dumps(result, indent=2) + '\n')
                assert not errors, result
            finally:
                context.close()
            assert not browser.contexts
        finally:
            browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(args.source.resolve(), args.output.resolve())
