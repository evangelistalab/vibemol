#!/usr/bin/env python3
"""Rasterize the editable VS Code extension icon with the existing Playwright setup."""
from pathlib import Path

from playwright.sync_api import sync_playwright


def main():
    root = Path(__file__).resolve().parents[1]
    resources = root / 'src/vscode_ext/vibemol/resources'
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            page = browser.new_page(viewport={'width': 256, 'height': 256}, device_scale_factor=1)
            page.set_content('<style>html,body{margin:0;background:transparent}svg{display:block}</style>'
                             + (resources / 'icon.svg').read_text())
            page.locator('svg').screenshot(path=str(resources / 'icon.png'), omit_background=True)
        finally:
            browser.close()
    print(resources / 'icon.png')


if __name__ == '__main__':
    main()
