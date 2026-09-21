#!/usr/bin/env python3
"""Native first-click disclosure and wheel scrolling in the Properties window."""
import argparse
import premerge as p


def settle(page):
    page.evaluate('() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))')


def check_panel(page, placement):
    page.evaluate('place => { VibeMolAppearanceLooks.openStudio(); VibeMolWorkbench.place("inspector", place); }', placement)
    page.evaluate('() => document.fonts.ready')
    page.locator('#lookGallery img').evaluate_all('images => Promise.all(images.map(img => img.decode()))')
    body = page.locator('#inspectorLook')
    box = body.bounding_box()
    page.mouse.move(box['x'] + box['width'] / 2, box['y'] + 75)
    page.mouse.wheel(0, 140)
    page.wait_for_function('() => document.getElementById("inspectorLook").scrollTop > 0')

    # Locator.click() can reposition/retry a moving target, masking a missed
    # human click. Hold the pointer at the original coordinates through release.
    summaries = page.locator('#looksPanel summary')
    for index in range(summaries.count()):
        summary = summaries.nth(index)
        name = summary.inner_text()
        summary.evaluate('''el => {
            for (const details of document.querySelectorAll('#looksPanel details')) details.open = false;
            for (let ancestor = el.parentElement.parentElement; ancestor; ancestor = ancestor.parentElement)
                if (ancestor.tagName === 'DETAILS') ancestor.open = true;
            document.getElementById('inspectorLookTab').focus({preventScroll: true});
            el.scrollIntoView({block: 'center'});
        }''')
        settle(page)
        before = summary.bounding_box()
        scroll = body.evaluate('el => el.scrollTop')
        page.mouse.move(before['x'] + 30, before['y'] + 10)
        page.mouse.down()
        settle(page)
        pressed = summary.bounding_box()
        assert abs(pressed['y'] - before['y']) <= 1, (placement, name, before, pressed)
        assert abs(body.evaluate('el => el.scrollTop') - scroll) <= 1, (placement, name, 'focus scrolled')
        page.mouse.up()
        settle(page)
        assert summary.evaluate('el => el.parentElement.open'), (placement, name, 'first click missed')
        assert abs(summary.bounding_box()['y'] - before['y']) <= 1, (placement, name, 'opening shifted heading')
        # Native summary semantics stay intact; no pointer-only toggle handler.
        page.keyboard.press('Space')
        assert not summary.evaluate('el => el.parentElement.open'), (placement, name, 'Space')
        page.keyboard.press('Enter')
        assert summary.evaluate('el => el.parentElement.open'), (placement, name, 'Enter')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--browser', choices=['chromium', 'webkit'], default='chromium')
    engine = parser.parse_args().browser
    with p.run_http_server(p.ROOT) as url, p.sync_playwright() as pw:
        browser = getattr(pw, engine).launch(headless=True)
        try:
            for width, height, placement in [(1512, 950, 'right'), (445, 655, 'bottom'), (1512, 950, 'float')]:
                page = browser.new_page(viewport={'width': width, 'height': height})
                errors, console_errors = [], []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
                try:
                    page.goto(url + '?workspaceLab=1&appearanceStudy=1')
                    page.wait_for_function('() => window.VibeMolWorkbench')
                    check_panel(page, placement)
                    assert not errors, errors
                    print(f'[disclosures] {engine}: {placement}, {width}x{height}: wheel, first clicks, stable scroll, keyboard passed', flush=True)
                except Exception:
                    p.write_failure_artifacts(page, p.ARTIFACTS, f'disclosures-{engine}-{placement}', errors, console_errors)
                    raise
                finally:
                    page.close()
        finally:
            browser.close()


if __name__ == '__main__':
    main()
