#!/usr/bin/env python3
from __future__ import annotations

import json
import pathlib
import sys
from typing import Any

from playwright.sync_api import sync_playwright

if __package__ in (None, ""):
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    from helpers import ensure_artifact_dir, run_http_server, write_failure_artifacts
else:
    from .helpers import ensure_artifact_dir, run_http_server, write_failure_artifacts

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
ARTIFACT_DIR = ensure_artifact_dir(REPO_ROOT / 'out' / 'test-artifacts')


def build_fixture_structure() -> str:
    payload = {
        'kind': 'vibemol.structure',
        'structureVersion': 1,
        'appVersion': 'smoke-test',
        'name': 'bond-fixture.structure.json',
        'meta': {'source': 'test'},
        'volume': {
            'title': 'Bond fixture',
            'comment': 'Two-carbon explicit-bond fixture',
            'natoms': 2,
            'origin': [0, 0, 0],
            'nxyz': [0, 0, 0],
            'axes': [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            'atoms': [
                {'id': 'atom-1', 'Z': 6, 'x': -0.7, 'y': 0.0, 'z': 0.0, 'formalCharge': 0},
                {'id': 'atom-2', 'Z': 6, 'x': 0.7, 'y': 0.0, 'z': 0.0, 'formalCharge': 0},
            ],
            'bonds': [
                {'id': 'bond:atom-1:atom-2', 'a': 'atom-1', 'b': 'atom-2', 'order': 1, 'kind': 'normal'},
            ],
            'annotations': {'builder': {'byAtomId': {}}},
            'fragmentOps': [],
            'data': [],
            'units': 'angstrom',
        },
        'recordState': {'measurementLabelOffsets': {}},
    }
    return json.dumps(payload)


def active_structure_summary(page) -> dict[str, Any]:
    return page.evaluate(
        """() => {
            const exported = window.VibeMolStructure.exportActive();
            return {
              kind: exported.kind,
              name: exported.name,
              atomCount: exported.volume.atoms.length,
              bondCount: Array.isArray(exported.volume.bonds) ? exported.volume.bonds.length : 0,
              bondOrders: Array.isArray(exported.volume.bonds) ? exported.volume.bonds.map((bond) => bond.order) : [],
            };
        }"""
    )


def canvas_point(page, fx: float = 0.62, fy: float = 0.56) -> tuple[float, float]:
    box = page.locator('#canvas').bounding_box()
    if not box:
        raise RuntimeError('Canvas bounding box is unavailable.')
    return (box['x'] + box['width'] * fx, box['y'] + box['height'] * fy)


def wait_for_ready(page) -> None:
    page.wait_for_function("() => !!window.VibeMolStructure && !!window.VibeMolPreset")


def assert_no_runtime_errors(page_errors: list[str], console_errors: list[str]) -> None:
    if page_errors or console_errors:
        raise AssertionError(
            'Runtime errors detected:\n'
            + '\n'.join([f'page: {err}' for err in page_errors] + [f'console: {err}' for err in console_errors])
        )


def main() -> int:
    page_errors: list[str] = []
    console_errors: list[str] = []
    with run_http_server(REPO_ROOT) as base_url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        page.on('pageerror', lambda err: page_errors.append(str(err)))
        page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
        try:
            page.goto(base_url, wait_until='networkidle')
            wait_for_ready(page)

            # Onboarding + sample load smoke.
            page.locator('#emptyStateSampleBtn').click()
            page.wait_for_function(
                """() => {
                    try { return !!window.VibeMolStructure.exportActive(); }
                    catch { return false; }
                }"""
            )
            sample_summary = active_structure_summary(page)
            if sample_summary['kind'] != 'vibemol.structure':
                raise AssertionError(f"Unexpected structure kind after sample load: {sample_summary['kind']}")
            if sample_summary['atomCount'] <= 0:
                raise AssertionError('Sample load did not produce atoms.')

            # Replace active content with a deterministic explicit-bond fixture.
            fixture_text = build_fixture_structure()
            page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "smoke-fixture")', fixture_text)
            fixture_summary = active_structure_summary(page)
            if fixture_summary['atomCount'] != 2 or fixture_summary['bondCount'] != 1:
                raise AssertionError(f'Fixture import failed: {fixture_summary}')

            # Edit mode + adaptive menu.
            page.locator('#modeEditBtn').click()
            page.wait_for_function("() => document.getElementById('editAdaptiveMenu')?.getAttribute('aria-hidden') === 'false'")
            page.wait_for_function("() => !document.getElementById('emptyState') || getComputedStyle(document.getElementById('emptyState')).display === 'none'")

            # Selection smoke.
            page.locator('#editAdaptiveSelectionBtn').click()
            page.keyboard.press('Meta+A' if sys.platform == 'darwin' else 'Control+A')
            page.wait_for_function(
                """() => /2 atoms selected/i.test(document.getElementById('editAdaptiveSelectionMeta')?.textContent || '')"""
            )

            # Add atom smoke.
            page.locator('#editAdaptiveAddAtomBtn').click()
            before_add_atom = active_structure_summary(page)
            x, y = canvas_point(page)
            page.mouse.click(x, y)
            page.wait_for_function("() => document.getElementById('editAddAtomOperatorPanel')?.getAttribute('aria-hidden') === 'false'")
            after_add_atom = active_structure_summary(page)
            if after_add_atom['atomCount'] != before_add_atom['atomCount'] + 1:
                raise AssertionError(f'Add atom did not add exactly one atom: {before_add_atom} -> {after_add_atom}')
            page.keyboard.press('Enter')

            # Add molecule smoke.
            page.locator('#editAdaptiveAddMoleculeBtn').click()
            before_add_molecule = active_structure_summary(page)
            x, y = canvas_point(page, 0.58, 0.52)
            page.mouse.click(x, y)
            page.wait_for_function("() => document.getElementById('editAddMoleculeOperatorPanel')?.getAttribute('aria-hidden') === 'false'")
            page.keyboard.press('Enter')
            page.wait_for_timeout(150)
            after_add_molecule = active_structure_summary(page)
            if after_add_molecule['atomCount'] <= before_add_molecule['atomCount']:
                raise AssertionError(f'Add molecule did not increase atom count: {before_add_molecule} -> {after_add_molecule}')
            if after_add_molecule['bondCount'] <= before_add_molecule['bondCount']:
                raise AssertionError(f'Add molecule did not preserve/add explicit bonds: {before_add_molecule} -> {after_add_molecule}')

            # Structure export/import round-trip.
            roundtrip_summary = page.evaluate(
                """() => {
                    const text = window.VibeMolStructure.exportActiveText();
                    const parsed = JSON.parse(text);
                    if (parsed.kind !== 'vibemol.structure') throw new Error(`Unexpected export kind: ${parsed.kind}`);
                    window.VibeMolStructure.importFromText(text, 'roundtrip');
                    const imported = window.VibeMolStructure.exportActive();
                    return {
                        exportedKind: parsed.kind,
                        importedKind: imported.kind,
                        atomCount: imported.volume.atoms.length,
                        bondCount: Array.isArray(imported.volume.bonds) ? imported.volume.bonds.length : 0,
                    };
                }"""
            )
            if roundtrip_summary['exportedKind'] != 'vibemol.structure' or roundtrip_summary['importedKind'] != 'vibemol.structure':
                raise AssertionError(f'Unexpected round-trip kinds: {roundtrip_summary}')
            if roundtrip_summary['atomCount'] <= 0 or roundtrip_summary['bondCount'] <= 0:
                raise AssertionError(f'Round-trip lost structure content: {roundtrip_summary}')

            # Bond editing smoke on a deterministic fixture.
            page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "bond-popup-fixture")', fixture_text)
            page.locator('#modeEditBtn').click()
            page.locator('#editAdaptiveBondBtn').click()
            x, y = canvas_point(page, 0.5, 0.5)
            page.mouse.click(x, y)
            page.wait_for_function("() => document.getElementById('bondOrderPopup')?.getAttribute('aria-hidden') === 'false'")
            page.locator('#bondOrderPopup button[data-bond-order-popup="2"]').click()
            page.wait_for_function("() => (window.VibeMolStructure.exportActive().volume.bonds[0] || {}).order === 2")
            order_updated = active_structure_summary(page)
            if order_updated['bondOrders'] != [2]:
                raise AssertionError(f'Bond order update failed: {order_updated}')
            page.mouse.click(x, y)
            page.wait_for_function("() => document.getElementById('bondOrderPopup')?.getAttribute('aria-hidden') === 'false'")
            page.locator('#bondOrderPopup button[data-bond-order-popup="0"]').click()
            page.wait_for_function(
                """() => document.getElementById('bondOrderPopup')?.getAttribute('aria-hidden') === 'true'"""
            )
            page.wait_for_function(
                """() => /Deleted bond C-C\\./i.test(document.getElementById('hint')?.textContent || '')"""
            )

            assert_no_runtime_errors(page_errors, console_errors)
            browser.close()
            return 0
        except Exception:
            write_failure_artifacts(page, ARTIFACT_DIR, 'smoke-failure', page_errors, console_errors)
            browser.close()
            raise


if __name__ == '__main__':
    raise SystemExit(main())
