"""Native Symmetry/shared-launcher events; fixture setup and observation are explicit."""
import argparse
import hashlib
import json
import pathlib
import sys
import time
import traceback

root = pathlib.Path.cwd()
sys.path.insert(0, str(root / 'tests/e2e'))
from helpers import run_http_server, wait_for_presented_state, write_failure_artifacts
from playwright.sync_api import sync_playwright
from smoke import build_fixture_distorted_methane_structure

parser = argparse.ArgumentParser()
parser.add_argument('--source-root', type=pathlib.Path, required=True)
parser.add_argument('--artifacts', type=pathlib.Path, required=True)
args = parser.parse_args()
source = args.source_root.resolve()
out = args.artifacts.resolve()
out.mkdir(parents=True, exist_ok=True)
fixture = out / 'methane.structure.json'
fixture.write_text(build_fixture_distorted_methane_structure())
assert json.loads(fixture.read_text())['kind'] == 'vibemol.structure'
second = out / 'water.xyz'
second.write_text('3\nScene change\nO 0 0 0\nH 0.95 0 0\nH -0.24 0.92 0\n')
sha = hashlib.sha256((source / 'assets/app/js/app.js').read_bytes()).hexdigest()
positions = lambda page: page.evaluate('() => VibeMolStructure.exportActive().volume.atoms.map(a=>[a.x,a.y,a.z])')

def show_symmetry(page):
    panel = page.locator('#editAdaptiveSymmetryPopover')
    if panel.is_hidden():
        page.locator('#canvas').focus()
        page.keyboard.press('s')
    panel.wait_for(state='visible')

results = []
started = time.monotonic()
with run_http_server(source) as url, sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--use-angle=swiftshader'])
    browser_version = browser.version
    for legacy in [False, True]:
        for theme in ['light', 'dark']:
            case = {'launch': 'legacy' if legacy else 'workbench', 'theme': theme, 'events': []}
            context = browser.new_context(viewport={'width': 1440, 'height': 1000})
            # A clean context with the user's saved theme; no DOM/style/handler replacement.
            context.add_init_script('localStorage.setItem("vibemol.uiTheme",' + json.dumps(theme) + ');')
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('dialog', lambda dialog: dialog.dismiss())
            key = case['launch'] + '-' + theme
            try:
                page.goto(url + '?appearanceStudy=1' + ('&workspaceLab=0' if legacy else ''))
                page.wait_for_function('() => !!window.VibeMolStructure && !!window.VibeMolWorkbenchHost')
                assert page.locator('#themeToggleInput').is_checked() == (theme == 'dark')
                page.locator('#fileInput').set_input_files(str(fixture))
                # exportActive intentionally throws before asynchronous file loading finishes.
                # A missing structure is false readiness, never a successful condition.
                page.wait_for_function('() => { try { return VibeMolStructure.exportActive().volume.atoms.length === 5; } catch (_) { return false; } }')
                page.locator('#modeEditBtn').click()
                panel = page.locator('#editAdaptiveSymmetryPopover')
                trigger = page.locator('#editAdaptiveSymmetryBtn')
                trigger.click()
                panel.wait_for(state='visible')
                page.locator('#editSymmetryToleranceSelect').select_option('0.100')
                candidate = panel.locator('[data-symmetry-group-id="Td"]')
                before = positions(page)
                candidate.click()
                assert page.locator('#editSymmetryApplyBtn').is_enabled()
                assert positions(page) == before
                case['events'].append({'event': 'Td preview', 'coordinatesUnchanged': True})
                page.locator('#editSymmetryCancelBtn').click()
                assert page.locator('#editSymmetryApplyBtn').is_disabled()
                assert positions(page) == before
                case['events'].append({'event': 'Cancel', 'coordinatesUnchanged': True})
                candidate.click()
                page.locator('#editSymmetryApplyBtn').click()
                wait_for_presented_state(page, '() => /Td/.test(document.getElementById("editSymmetryExactResult").textContent)')
                assert positions(page) != before
                element = page.locator('#editSymmetryElementSelect')
                options = element.locator('option').evaluate_all('els => els.map(e=>e.value).filter(Boolean)')
                assert options, 'Exact Td must expose symmetry elements'
                element.select_option(options[0])
                assert element.input_value() == options[0]
                case['events'].append({'event': 'Apply and element guide', 'element': options[0],
                                       'groupText': page.locator('#editSymmetryExactResult').inner_text(),
                                       'positions': positions(page)})
                page.locator('#canvas').focus()
                page.keyboard.press('ControlOrMeta+z')
                wait_for_presented_state(page, '() => true')
                assert positions(page) == before
                after_apply_undo_open = panel.is_visible()
                show_symmetry(page)
                page.locator('#editSymmetryAutoBtn').click()
                wait_for_presented_state(page, '() => /Td/.test(document.getElementById("editSymmetryExactResult").textContent)')
                assert positions(page) != before
                page.locator('#canvas').focus()
                page.keyboard.press('ControlOrMeta+z')
                assert positions(page) == before
                after_auto_undo_open = panel.is_visible()
                show_symmetry(page)
                case['events'].append({'event': 'Apply Undo, Auto, Auto Undo', 'exactCoordinatesRestored': True,
                                       'openAfterApplyUndo': after_apply_undo_open,
                                       'openAfterAutoUndo': after_auto_undo_open})
                # Exercise a second option actually offered by the unchanged control.
                page.locator('#editSymmetryToleranceSelect').select_option('0.050')
                assert page.locator('#editSymmetryToleranceSelect').input_value() == '0.050'
                page.locator('#modeDisplayBtn').click()
                assert panel.is_hidden()
                page.locator('#modeEditBtn').click()
                returned_open = panel.is_visible()
                if not returned_open:
                    trigger.click()
                panel.wait_for(state='visible')
                assert page.locator('#editSymmetryToleranceSelect').input_value() == '0.050'
                case['events'].append({'event': 'mode suspension/return', 'reopenedOnModeReturn': returned_open})
                page.locator('#canvas').focus()
                page.keyboard.press('s')
                panel.wait_for(state='hidden')
                page.locator('#canvas').focus()
                page.keyboard.press('s')
                panel.wait_for(state='visible')
                case['events'].append({'event': 'Symmetry keyboard close/reopen', 'passed': True})
                modes = []
                for name in ['Display', 'Measure', 'Edit']:
                    page.locator('#mode' + name + 'Btn').click()
                    wait_for_presented_state(page, '() => true')
                    modes.append({'mode': name, 'menu': page.locator('#displayWindowAdaptiveMenu').evaluate(
                        'el => ({mode:el.dataset.mode,hidden:el.getAttribute("aria-hidden")})')})
                case['events'].append({'event': 'shared launcher mode projection', 'observations': modes})
                page.locator('#modeDisplayBtn').click()
                page.locator('#canvas').focus()
                page.keyboard.press('c')
                page.locator('#coordsPanel').wait_for(state='visible')
                page.locator('#canvas').focus()
                page.keyboard.press('v')
                page.locator('#sidePanel').wait_for(state='visible')
                assert page.locator('#sidePanel').get_attribute('aria-hidden') == 'false'
                if legacy:
                    assert page.locator('#coordsPanel').is_hidden()
                case['events'].append({'event': 'Coordinates to Camera', 'coordinatesRemainVisible': page.locator('#coordsPanel').is_visible()})
                page.locator('#modeEditBtn').click()
                if panel.is_hidden():
                    trigger.click()
                panel.wait_for(state='visible')
                page.set_viewport_size({'width': 390, 'height': 844})
                wait_for_presented_state(page, '() => innerWidth === 390')
                active_on_compact = panel.is_visible()
                # Compact layout has one active tab. Explicitly activate the inspected
                # window, as the unchanged symmetry_panel fixture does after resizing.
                show_symmetry(page)
                box = panel.bounding_box()
                assert box and box['width'] > 0 and box['height'] > 0
                case['events'].append({'event': 'responsive Symmetry', 'bounds': box,
                                       'activeBeforeExplicitReopen': active_on_compact})
                page.set_viewport_size({'width': 1440, 'height': 1000})
                page.locator('#fileInput').set_input_files(str(second))
                page.wait_for_function('() => { try { return VibeMolStructure.exportActive().volume.atoms.length === 3; } catch (_) { return false; } }')
                case['events'].append({'event': 'file-input scene change',
                                       'summary': page.locator('#editSymmetryTargetSummary').inner_text()})
                page.screenshot(path=str(out / (key + '.png')))
                assert not errors, errors
                case['status'] = 'passed'
            except Exception as error:
                case.update(status='failed', exception=type(error).__name__, error=str(error))
                traceback.print_exc()
                write_failure_artifacts(page, out, key + '-failure', errors, [])
            finally:
                case['pageErrors'] = errors
                context.close()
                results.append(case)
                print(json.dumps({'case': key, 'status': case['status'], 'events': len(case['events'])}), flush=True)
    browser.close()
assert hashlib.sha256((source / 'assets/app/js/app.js').read_bytes()).hexdigest() == sha
report = {'sourceAppSha256': sha, 'sourceRoot': str(source), 'browserVersion': browser_version,
          'method': __doc__, 'assertionRelaxation': False, 'retries': 0, 'cases': results,
          'seconds': round(time.monotonic() - started, 2)}
(out / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
raise SystemExit(0 if all(c['status'] == 'passed' for c in results) else 2)
