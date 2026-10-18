"""Read-only geometry probe for two pre-existing Edit overlay collisions.

Fixture loading/selection use the existing public test API; all menu/window
opening uses real UI events. No QA harness, event stubs, style changes or fixes.
"""
import argparse
import hashlib
import json
import pathlib
import sys

root = pathlib.Path.cwd()
sys.path.insert(0, str(root / 'tests/e2e'))
import premerge as p
from helpers import run_http_server, wait_for_presented_state
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--source-root', type=pathlib.Path, required=True)
parser.add_argument('--artifacts', type=pathlib.Path, required=True)
args = parser.parse_args()
args.artifacts.mkdir(parents=True, exist_ok=True)

GEOMETRY = r"""({overlayId, targetSelectors}) => {
  const box = e => { const r=e.getBoundingClientRect(),s=getComputedStyle(e);
    return {id:e.id,rect:{x:r.x,y:r.y,width:r.width,height:r.height,
      left:r.left,right:r.right,top:r.top,bottom:r.bottom},display:s.display,
      position:s.position,zIndex:s.zIndex,pointerEvents:s.pointerEvents,
      hidden:e.hidden,ariaHidden:e.getAttribute('aria-hidden')}; };
  const overlay=document.getElementById(overlayId), o=box(overlay);
  const targets=targetSelectors.flatMap(s=>Array.from(document.querySelectorAll(s))).map(e=>{
    const t=box(e),a=o.rect,b=t.rect;
    const width=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left));
    const height=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
    const x=b.left+b.width/2,y=b.top+b.height/2,hit=document.elementFromPoint(x,y);
    return {...t,overlap:{width,height,area:width*height},center:{x,y},
      centerHit:hit?{id:hit.id,tag:hit.tagName,className:hit.className,
        metalChoice:hit.closest('[data-metal-bonding-choice]')?.dataset.metalBondingChoice||null,
        inOverlay:overlay.contains(hit),inTarget:e.contains(hit)}:null};
  });
  return {overlay:o,targets};
}"""

results = {'method': __doc__, 'sourceAppSha256': hashlib.sha256(
    (args.source_root / 'assets/app/js/app.js').read_bytes()).hexdigest(), 'cases': []}
with run_http_server(args.source_root) as url, sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--use-angle=swiftshader'])
    for name, legacy, fixture, viewport in [
        ('metal-popover', False, {'name': 'iron.xyz', 'text': '1\nMetal overlap\nFe 0 0 0\n'},
         {'width': 1440, 'height': 1000}),
        ('coordinates-delete', True, {'name': 'water.xyz', 'text': 'O 0 0 0\nH 0.95 0 0\nH -0.24 0.92 0'},
         {'width': 1200, 'height': 900}),
    ]:
        context = browser.new_context(viewport=viewport)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        try:
            page.goto(url + '?appearanceStudy=1' + ('&workspaceLab=0' if legacy else ''))
            page.wait_for_function('() => !!window.VibeMolTesting')
            assert p.load(page, [fixture])['ok']
            if legacy:
                page.locator('#canvas').focus()
                page.keyboard.press('c')
                wait_for_presented_state(page, "() => document.getElementById('coordsPanel').getAttribute('aria-hidden') !== 'true'")
            page.locator('#modeEditBtn').click()
            # Only Workbench mounts the named tool strip. Loaded structures
            # already enter Transform in legacy (0.9.2 scene-dependent default).
            if not legacy:
                page.locator('#editTransformToolBtn').click()
            indices = [0, 2] if legacy else [0]
            page.evaluate('indices => VibeMolTesting.setEditSelectionIndices(indices)', indices)
            wait_for_presented_state(page, '() => document.getElementById("editSelectionTranslateCue").getAttribute("aria-hidden") === "false"')
            if not legacy:
                page.locator('#editSelectionMetalBondingCueButton').click()
                wait_for_presented_state(page, '() => document.getElementById("editSelectionMetalBondingCuePopover").getAttribute("aria-hidden") === "false"')
                geometry = page.evaluate(GEOMETRY, {'overlayId': 'editSelectionMetalBondingCuePopover',
                    'targetSelectors': ['#editSelectionTranslateCue .editSelectionCueButton']})
            else:
                geometry = page.evaluate(GEOMETRY, {'overlayId': 'editSelectionTranslateCue',
                    'targetSelectors': ['#coordsContent [data-atom-index="1"] [data-coords-action="delete"]']})
                geometry['positionCard'] = page.evaluate(GEOMETRY, {'overlayId': 'editSelectionPosition',
                    'targetSelectors': ['#coordsContent [data-atom-index="1"] [data-coords-action="delete"]']})
            page.screenshot(path=str(args.artifacts / (name + '.png')))
            results['cases'].append({'name': name, 'layout': 'legacy' if legacy else 'workbench',
                'viewport': viewport, 'geometry': geometry, 'pageErrors': errors})
            assert not errors, errors
        finally:
            context.close()
    browser.close()
(args.artifacts / 'result.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
