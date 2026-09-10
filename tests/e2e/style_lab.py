#!/usr/bin/env python3
"""Explicit browser checks for the isolated Visual Style Lab experiment."""
from __future__ import annotations

import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright
from helpers import ensure_artifact_dir, run_http_server, write_failure_artifacts

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ensure_artifact_dir(Path(os.environ.get('VIBEMOL_TEST_ARTIFACT_DIR', str(ROOT / 'out' / 'test-artifacts'))))


def state(page):
    return page.evaluate('() => StyleLab.getState()')


def rendered(page):
    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')


def slider(page, selector, value):
    page.locator(selector).evaluate('(input, value) => { input.value = value; input.dispatchEvent(new Event("input", {bubbles:true})); }', value)
    rendered(page)


def main():
    with run_http_server(ROOT) as url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1440, 'height': 1100}, device_scale_factor=1)
        page = context.new_page()
        errors, console_errors = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
        try:
            page.goto(url + '/docs/experiments/style-lab/', wait_until='networkidle')
            page.wait_for_function('() => window.StyleLab?.ready')
            assert state(page)['environmentReady']
            assert page.locator('.look-card').count() == 6
            assert len(set(page.locator('.look-card img').evaluate_all('images => images.map(image => image.src)'))) == 6
            before = state(page)
            page.locator('#turnLeft').click()
            assert state(page)['camera'] != before['camera']
            rotated = state(page)['camera']
            for name in ['classic', 'porcelain', 'nocturne', 'ink', 'atelier', 'opal']:
                page.locator(f'.look-card[data-look="{name}"]').click()
                current = state(page)
                assert current['atoms'] == before['atoms'], name
                assert current['camera'] == rotated, name
                assert not current['modified']
            print('[style lab] collection, live materials, geometry and camera preservation: passed', flush=True)

            page.locator('.look-card[data-look="nocturne"]').click()
            slider(page, '#smoothness', 0.71)
            assert state(page)['modified'] and page.locator('#modified').is_visible()
            assert page.locator('#updateLook').is_disabled(), 'Built-ins cannot be overwritten'
            page.locator('#lookName').fill('My presentation')
            page.locator('#saveLook').click()
            assert state(page)['savedCount'] == 1 and not state(page)['modified']
            # A rename alone must enable Update, without needing a material edit.
            page.locator('#lookName').fill('My revised presentation')
            assert page.locator('#updateLook').is_enabled()
            page.locator('#updateLook').click()
            assert page.locator('#savedLooks button').inner_text() == 'My revised presentation'
            slider(page, '#smoothness', 0.45)
            page.locator('#revert').click()
            assert state(page)['settings']['smoothness'] == 0.71 and not state(page)['modified']
            slider(page, '#rim', 2.4)
            draft = state(page)['settings']
            page.reload(wait_until='networkidle')
            page.wait_for_function('() => window.StyleLab?.ready')
            assert state(page)['settings'] == draft and state(page)['modified']
            assert state(page)['savedCount'] == 1
            print('[style lab] save, rename, revert, and reload persistence: passed', flush=True)

            with page.expect_download() as event:
                page.locator('#exportLook').click()
            look_file = json.loads(Path(event.value.path()).read_text())
            assert look_file['settings'] == draft
            page.locator('.look-card[data-look="classic"]').click()
            page.locator('#lookFile').set_input_files({'name': 'saved-look.json', 'mimeType': 'application/json', 'buffer': json.dumps(look_file).encode()})
            page.wait_for_function('() => StyleLab.getState().savedCount === 2')
            assert state(page)['settings'] == draft and not state(page)['modified']
            before = state(page)
            look_file['settings']['atomScale'] = 99
            page.locator('#lookFile').set_input_files({'name': 'invalid-look.json', 'mimeType': 'application/json', 'buffer': json.dumps(look_file).encode()})
            page.wait_for_function('() => document.querySelector("#status").classList.contains("error")')
            assert state(page) == before
            with page.expect_download() as event:
                # Export in the same event turn as an edit, before its scheduled redraw.
                page.locator('#rim').evaluate('''input => {
                    input.value = 1.1;
                    input.dispatchEvent(new Event('input', {bubbles:true}));
                    document.querySelector('#savePng').click();
                }''')
            immediate_png = Path(event.value.path()).read_bytes()
            assert immediate_png.startswith(b'\x89PNG\r\n\x1a\n')
            rendered(page)
            with page.expect_download() as event:
                page.locator('#savePng').click()
            assert Path(event.value.path()).read_bytes() == immediate_png, 'Export must include the latest edit'
            print('[style lab] exact look export/import, invalid-file isolation, and PNG export: passed', flush=True)

            page.locator('.look-card[data-look="porcelain"]').click()
            page.locator('#resetView').click()
            for subject, count in [('methane', 5), ('orbital', 1), ('pyridine', 11)]:
                page.locator('#subject').select_option(subject)
                rendered(page)
                assert len(state(page)['atoms']) == count
                assert page.locator('#phaseLegend').is_visible() == (subject == 'orbital')
                assert len(set(page.locator('.look-card img').evaluate_all('images => images.map(image => image.src)'))) == 6
                page.locator('.collection').screenshot(path=str(ARTIFACTS / f'style-lab-{subject}.png'))
            page.screenshot(path=str(ARTIFACTS / 'style-lab-desktop.png'), full_page=True)
            for width in [736, 390, 320]:
                page.set_viewport_size({'width': width, 'height': 1000})
                rendered(page)
                assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth'), width
                page.locator('summary').click()
                rendered(page)
                assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth'), width
                page.locator('summary').click()
            page.screenshot(path=str(ARTIFACTS / 'style-lab-mobile.png'), full_page=True)
            assert not errors and not console_errors, (errors, console_errors)
            print('[style lab] subjects, orbital signs, mobile layout, and browser errors: passed', flush=True)
        except Exception:
            write_failure_artifacts(page, ARTIFACTS, 'style-lab-failure', errors, console_errors)
            raise
        finally:
            context.close()
            browser.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
