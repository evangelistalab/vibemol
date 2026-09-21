#!/usr/bin/env python3
"""Refresh Style Studio thumbnails using the actual VibeMol renderer."""
import argparse
import base64
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tests/e2e'))
from helpers import run_http_server
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--software', action='store_true', help='Use software WebGL')
    parser.add_argument('--look', help='Refresh just one named preset, e.g. basic')
    args = parser.parse_args()
    with run_http_server(ROOT) as url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=['--use-angle=swiftshader'] if args.software
          else ['--use-angle=metal'] if sys.platform == 'darwin' else [])
        try:
            page = browser.new_page(viewport={'width': 600, 'height': 400}, device_scale_factor=1)
            page.goto(url + '?appearanceStudy=1')
            page.wait_for_function('() => window.VibeMolAppearanceLooks')
            page.locator('#toolbarCollapseBtn').click()
            result = page.evaluate('files => VibeMolEmbed.loadFiles(files, {clearFirst:true})', [
                {'name': 'pyridine.xyz', 'text': (ROOT / 'assets/fragments/pyridine.xyz').read_text()}])
            assert result['ok'], result
            page.evaluate('''() => VibeMolPreset.import({kind:'vibemol.preset',presetVersion:1,settings:{
              'global.showAxes':false,'global.showBox':false}})''')
            page.wait_for_function('() => VibeMolTesting.getWboitSnapshot().sceneEnvironmentLoaded')
            looks = page.evaluate('() => VibeMolAppearanceLooks.list().filter(look => !look.experimental)')
            if args.look:
                looks = [look for look in looks if look['id'] == args.look]
                if not looks:
                    parser.error('Unknown preset: ' + args.look)
            for look in looks:
                page.evaluate('id => VibeMolAppearanceLooks.apply(id,{includeColors:true})', look['id'])
                png = page.evaluate('''async () => {
                  for(let i=0;i<6;i++) await new Promise(requestAnimationFrame);
                  const canvas = document.createElement('canvas'); canvas.width=240; canvas.height=160;
                  const context=canvas.getContext('2d');
                  context.drawImage(document.querySelector('#canvas'),0,0,240,160);
                  const pixels=context.getImageData(0,0,240,160).data;
                  if (!pixels.some((value,i)=>i%4!==3 && value!==pixels[i%4])) throw new Error('Empty preset preview');
                  return canvas.toDataURL('image/png').split(',')[1];
                }''')
                path = ROOT / f"assets/app/img/looks/studio-{look['id']}.png"
                path.write_bytes(base64.b64decode(png))
                print(path.relative_to(ROOT), flush=True)
        finally:
            browser.close()


if __name__ == '__main__':
    main()
