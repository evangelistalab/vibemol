#!/usr/bin/env python3
"""Export the ten flat icon proposals and their light/dark comparison sheets."""
from pathlib import Path

from playwright.sync_api import sync_playwright


def main():
    folder = Path(__file__).resolve().parent
    icons = sorted(folder.glob('[0-9][0-9]-*.svg'))
    if len(icons) != 10:
        raise ValueError('Expected ten icon proposals')
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            page = browser.new_page(viewport={'width': 256, 'height': 256}, device_scale_factor=1)
            for icon in icons:
                page.set_content('<style>html,body{margin:0;background:transparent}svg{display:block}</style>'
                                 + icon.read_text())
                page.locator('svg').screenshot(path=str(icon.with_suffix('.png')), omit_background=True)
            page.set_viewport_size({'width': 1400, 'height': 950})
            page.goto((folder / 'index.html').as_uri())
            page.evaluate('document.fonts.ready')
            page.locator('main').screenshot(path=str(folder / 'comparison.png'))
            page.get_by_role('button', name='Dark', exact=True).click()
            page.locator('main').screenshot(path=str(folder / 'comparison-dark.png'))
        finally:
            browser.close()
    print(folder / 'comparison.png')


if __name__ == '__main__':
    main()
