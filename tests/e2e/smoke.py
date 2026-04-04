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
                {'id': 'bond:atom-1:atom-2', 'a': 'atom-1', 'b': 'atom-2', 'order': 1, 'kind': 'normal', 'origin': 'perceived'},
            ],
            'annotations': {'builder': {'byAtomId': {}}},
            'fragmentOps': [],
            'data': [],
            'units': 'angstrom',
        },
        'recordState': {'measurementLabelOffsets': {}},
    }
    return json.dumps(payload)


def build_fixture_cleanup_structure() -> str:
    payload = {
        'kind': 'vibemol.structure',
        'structureVersion': 1,
        'appVersion': 'smoke-test',
        'name': 'cleanup-fixture.structure.json',
        'meta': {'source': 'test'},
        'volume': {
            'title': 'Cleanup fixture',
            'comment': 'Perceived vs explicit cleanup fixture',
            'natoms': 4,
            'origin': [0, 0, 0],
            'nxyz': [0, 0, 0],
            'axes': [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            'atoms': [
                {'id': 'atom-1', 'Z': 6, 'x': 0.0, 'y': 0.0, 'z': 0.0, 'formalCharge': 0},
                {'id': 'atom-2', 'Z': 6, 'x': 1.4, 'y': 0.0, 'z': 0.0, 'formalCharge': 0},
                {'id': 'atom-3', 'Z': 6, 'x': 2.8, 'y': 0.0, 'z': 0.0, 'formalCharge': 0},
                {'id': 'atom-4', 'Z': 6, 'x': 7.0, 'y': 0.0, 'z': 0.0, 'formalCharge': 0},
            ],
            'bonds': [
                {'id': 'bond:atom-1:atom-2', 'a': 'atom-1', 'b': 'atom-2', 'order': 1, 'kind': 'normal', 'origin': 'perceived'},
                {'id': 'bond:atom-1:atom-3', 'a': 'atom-1', 'b': 'atom-3', 'order': 2, 'kind': 'normal', 'origin': 'explicit'},
                {'id': 'bond:atom-3:atom-4', 'a': 'atom-3', 'b': 'atom-4', 'order': 1, 'kind': 'normal', 'origin': 'perceived'},
            ],
            'annotations': {'builder': {'byAtomId': {}}},
            'fragmentOps': [],
            'data': [],
            'units': 'angstrom',
        },
        'recordState': {'measurementLabelOffsets': {}},
    }
    return json.dumps(payload)


def build_fixture_inferred_xyz() -> str:
    return '\n'.join([
        '2',
        'two carbons',
        'C 0.000000 0.000000 0.000000',
        'C 1.400000 0.000000 0.000000',
        '',
    ])


def build_fixture_trajectory_xyz() -> str:
    return '\n'.join([
        '2',
        'frame 1',
        'C 0.000000 0.000000 0.000000',
        'C 1.400000 0.000000 0.000000',
        '2',
        'frame 2',
        'C 0.000000 0.000000 0.000000',
        'C 5.000000 0.000000 0.000000',
        '',
    ])


def build_fixture_molden() -> str:
    return '\n'.join([
        '[Molden Format]',
        '[Atoms] Angs',
        'H 1 1 0.0 0.0 0.0',
        '[GTO]',
        '1 0',
        's 1 1.0',
        '  1.0 1.0',
        '[MO]',
        'Sym= A1',
        'Ene= -0.5',
        'Spin= Alpha',
        'Occup= 2.0',
        '1 1.0',
    ])


def active_structure_summary(page) -> dict[str, Any]:
    return page.evaluate(
        """() => {
            const exported = window.VibeMolStructure.exportActive();
            return {
              kind: exported.kind,
              name: exported.name,
              atomCount: exported.volume.atoms.length,
              atomicNumbers: Array.isArray(exported.volume.atoms) ? exported.volume.atoms.map((atom) => atom.Z | 0) : [],
              bondCount: Array.isArray(exported.volume.bonds) ? exported.volume.bonds.length : 0,
              bondOrders: Array.isArray(exported.volume.bonds) ? exported.volume.bonds.map((bond) => bond.order) : [],
              bondOrigins: Array.isArray(exported.volume.bonds) ? exported.volume.bonds.map((bond) => bond.origin || null) : [],
            };
        }"""
    )


def sample_scene_canvas_rgb(page) -> dict[str, float]:
    sample = page.evaluate(
        """() => {
            const canvas = document.getElementById('canvas');
            if (!(canvas instanceof HTMLCanvasElement)) return null;
            const probe = document.createElement('canvas');
            probe.width = 1;
            probe.height = 1;
            const ctx = probe.getContext('2d');
            if (!ctx) return null;
            const sx = Math.max(0, Math.floor(canvas.width * 0.05));
            const sy = Math.max(0, Math.floor(canvas.height * 0.05));
            ctx.drawImage(canvas, sx, sy, 1, 1, 0, 0, 1, 1);
            const data = ctx.getImageData(0, 0, 1, 1).data;
            return { r: data[0] / 255, g: data[1] / 255, b: data[2] / 255 };
        }"""
    )
    if not isinstance(sample, dict):
        raise AssertionError(f"Could not sample scene canvas background: {sample!r}")
    return sample


def sample_canvas_region_rgb(page, fx: float = 0.5, fy: float = 0.5, size: int = 9) -> dict[str, float]:
    sample = page.evaluate(
        """({ fx, fy, size }) => {
            const canvas = document.getElementById('canvas');
            if (!(canvas instanceof HTMLCanvasElement)) return null;
            const probe = document.createElement('canvas');
            probe.width = Math.max(1, size | 0);
            probe.height = Math.max(1, size | 0);
            const ctx = probe.getContext('2d');
            if (!ctx) return null;
            const sx = Math.max(0, Math.floor(canvas.width * fx - probe.width * 0.5));
            const sy = Math.max(0, Math.floor(canvas.height * fy - probe.height * 0.5));
            ctx.drawImage(canvas, sx, sy, probe.width, probe.height, 0, 0, probe.width, probe.height);
            const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
            let r = 0;
            let g = 0;
            let b = 0;
            const count = Math.max(1, probe.width * probe.height);
            for (let i = 0; i < data.length; i += 4) {
              r += data[i];
              g += data[i + 1];
              b += data[i + 2];
            }
            return { r: r / (255 * count), g: g / (255 * count), b: b / (255 * count) };
        }""",
        {"fx": fx, "fy": fy, "size": size},
    )
    if not isinstance(sample, dict):
        raise AssertionError(f"Could not sample canvas region: {sample!r}")
    return sample


def canvas_point(page, fx: float = 0.62, fy: float = 0.56) -> tuple[float, float]:
    box = page.locator('#canvas').bounding_box()
    if not box:
        raise RuntimeError('Canvas bounding box is unavailable.')
    return (box['x'] + box['width'] * fx, box['y'] + box['height'] * fy)


def drag_canvas_box(page, start_fx: float, start_fy: float, end_fx: float, end_fy: float) -> None:
    start_x, start_y = canvas_point(page, start_fx, start_fy)
    end_x, end_y = canvas_point(page, end_fx, end_fy)
    page.mouse.move(start_x, start_y)
    page.mouse.down()
    page.mouse.move(end_x, end_y, steps=12)
    page.mouse.up()


def ensure_advanced_drawer_open(page) -> None:
    is_hidden = page.evaluate(
        """() => document.getElementById('editAdaptiveMenu')?.getAttribute('aria-hidden') !== 'false'"""
    )
    if is_hidden:
        page.locator('#editGestureAdvancedBtn').click()
    page.wait_for_function("() => document.getElementById('editAdaptiveMenu')?.getAttribute('aria-hidden') === 'false'")


def ensure_advanced_drawer_closed(page) -> None:
    is_open = page.evaluate(
        """() => document.getElementById('editAdaptiveMenu')?.getAttribute('aria-hidden') === 'false'"""
    )
    if is_open:
        page.locator('#editGestureAdvancedBtn').click()
    page.wait_for_function("() => document.getElementById('editAdaptiveMenu')?.getAttribute('aria-hidden') === 'true'")


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

            page.wait_for_function(
                """() => {
                    const reveal = document.getElementById('topRightUtilitiesReveal');
                    const link = document.getElementById('githubRepoLink');
                    const themeInput = document.getElementById('themeToggleInput');
                    const toolbarLight = document.querySelector('#toolbar .themeLogoLight');
                    const toolbarDark = document.querySelector('#toolbar .themeLogoDark');
                    const splashLight = document.getElementById('emptyStateLeadLogo');
                    const splashDark = document.getElementById('emptyStateLeadLogoDark');
                    if (!reveal || !link || !themeInput) return false;
                    const style = getComputedStyle(reveal);
                    return /github\\.com\\/evangelistalab\\/vibemol/i.test(link.href || '')
                      && Number(style.opacity || '0') < 0.05
                      && themeInput.checked === false
                      && document.documentElement.getAttribute('data-theme') !== 'dark'
                      && !!toolbarLight && !!toolbarDark && !!splashLight && !!splashDark
                      && getComputedStyle(toolbarLight).display !== 'none'
                      && getComputedStyle(toolbarDark).display === 'none'
                      && getComputedStyle(splashLight).display !== 'none'
                      && getComputedStyle(splashDark).display === 'none';
                }"""
            )
            page.hover('#topRightUtilities')
            page.wait_for_function(
                """() => {
                    const reveal = document.getElementById('topRightUtilitiesReveal');
                    const light = document.querySelector('.themeToggleTextLight');
                    const dark = document.querySelector('.themeToggleTextDark');
                    if (!reveal || !light || !dark) return false;
                    return Number(getComputedStyle(reveal).opacity || '0') > 0.95
                      && /Theme:\\s*Light/i.test(light.textContent || '')
                      && /Theme:\\s*Dark/i.test(dark.textContent || '');
                }"""
            )
            page.locator('#themeToggleShell').click()
            page.wait_for_function(
                """() => {
                    const themeInput = document.getElementById('themeToggleInput');
                    const light = document.querySelector('.themeToggleTextLight');
                    const dark = document.querySelector('.themeToggleTextDark');
                    const toolbarLight = document.querySelector('#toolbar .themeLogoLight');
                    const toolbarDark = document.querySelector('#toolbar .themeLogoDark');
                    const splashLight = document.getElementById('emptyStateLeadLogo');
                    const splashDark = document.getElementById('emptyStateLeadLogoDark');
                    if (!themeInput || !light || !dark) return false;
                    return themeInput.checked === true
                      && document.documentElement.getAttribute('data-theme') === 'dark'
                      && window.localStorage.getItem('vibemol.uiTheme') === 'dark'
                      && !!toolbarLight && !!toolbarDark && !!splashLight && !!splashDark
                      && getComputedStyle(toolbarLight).display === 'none'
                      && getComputedStyle(toolbarDark).display !== 'none'
                      && getComputedStyle(splashLight).display === 'none'
                      && getComputedStyle(splashDark).display !== 'none'
                      && Number(getComputedStyle(dark).opacity || '0') > 0.95
                      && Number(getComputedStyle(light).opacity || '1') < 0.1;
                }"""
            )
            page.locator('#themeToggleShell').click()
            page.wait_for_function(
                """() => {
                    const themeInput = document.getElementById('themeToggleInput');
                    const toolbarLight = document.querySelector('#toolbar .themeLogoLight');
                    const toolbarDark = document.querySelector('#toolbar .themeLogoDark');
                    const splashLight = document.getElementById('emptyStateLeadLogo');
                    const splashDark = document.getElementById('emptyStateLeadLogoDark');
                    return !!themeInput
                      && themeInput.checked === false
                      && document.documentElement.getAttribute('data-theme') === 'light'
                      && window.localStorage.getItem('vibemol.uiTheme') === 'light'
                      && !!toolbarLight && !!toolbarDark && !!splashLight && !!splashDark
                      && getComputedStyle(toolbarLight).display !== 'none'
                      && getComputedStyle(toolbarDark).display === 'none'
                      && getComputedStyle(splashLight).display !== 'none'
                      && getComputedStyle(splashDark).display === 'none';
                }"""
            )

            # Gesture-mode edit HUD should be primary, with the advanced drawer opt-in.
            page.locator('#modeEditBtn').click()
            page.wait_for_function("() => document.getElementById('editGestureHud')?.getAttribute('aria-hidden') === 'false'")
            page.wait_for_function("() => document.getElementById('editAdaptiveMenu')?.getAttribute('aria-hidden') === 'true'")
            page.wait_for_function(
                """() => /Click void to place/i.test(document.getElementById('editGestureHint')?.textContent || '')"""
            )
            ensure_advanced_drawer_open(page)
            empty_edit_visibility = page.evaluate(
                """() => {
                    const isShown = (id) => {
                        const el = document.getElementById(id);
                        return !!el && !el.hidden && getComputedStyle(el).display !== 'none';
                    };
                    return {
                        selection: isShown('editAdaptiveSelectionBtn'),
                        move: isShown('editAdaptiveMoveBtn'),
                        rotate: isShown('editAdaptiveRotateBtn'),
                        addAtom: isShown('editAdaptiveAddAtomBtn'),
                        addFragment: isShown('editAdaptiveAddFragmentBtn'),
                        addMolecule: isShown('editAdaptiveAddMoleculeBtn'),
                        bond: isShown('editAdaptiveBondBtn'),
                        transform: isShown('editAdaptiveTransformBtn'),
                        delete: isShown('editAdaptiveDeleteBtn'),
                    };
                }"""
            )
            if empty_edit_visibility != {
                'selection': False,
                'move': False,
                'rotate': False,
                'addAtom': True,
                'addFragment': True,
                'addMolecule': True,
                'bond': False,
                'transform': False,
                'delete': False,
            }:
                raise AssertionError(f'Unexpected empty edit menu visibility: {empty_edit_visibility}')
            ensure_advanced_drawer_closed(page)

            # Gesture void-click places one carbon, but the first placed atom should not stay selected.
            x, y = canvas_point(page)
            page.mouse.click(x, y)
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const scopeText = (document.getElementById('editGestureScope')?.textContent || '').trim();
                    return !!exported
                      && Array.isArray(exported.volume?.atoms)
                      && exported.volume.atoms.length === 1
                      && /no selection/i.test(scopeText);
                }"""
            )

            # Selected terminal atom drag should still grow chemistry, with keyboard bond-order override.
            grow_x, grow_y = canvas_point(page, 0.70, 0.52)
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(grow_x, grow_y, steps=14)
            page.keyboard.press('2')
            page.wait_for_function(
                """() => document.getElementById('editGestureBondOrderPill')?.textContent?.trim() === 'Bond 2'"""
            )
            page.mouse.up()
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const bonds = Array.isArray(exported.volume?.bonds) ? exported.volume.bonds : [];
                    return exported.volume.atoms.length === 2 && bonds.length === 1 && bonds[0].order === 2;
                }"""
            )

            # Dragging between existing atoms should keep cycling the explicit bond order.
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(grow_x, grow_y, steps=14)
            page.mouse.up()
            page.wait_for_function(
                """() => {
                    const bonds = window.VibeMolStructure.exportActive().volume.bonds || [];
                    return bonds.length === 1 && bonds[0].order === 3 && bonds[0].origin === 'explicit';
                }"""
            )
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(grow_x, grow_y, steps=14)
            page.mouse.up()
            page.wait_for_function(
                """() => {
                    const bonds = window.VibeMolStructure.exportActive().volume.bonds || [];
                    return bonds.length === 1
                      && bonds[0].kind === 'blocked'
                      && bonds[0].origin === 'explicit';
                }"""
            )
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(grow_x, grow_y, steps=14)
            page.keyboard.press('1')
            page.mouse.up()
            page.wait_for_function(
                """() => {
                    const bonds = window.VibeMolStructure.exportActive().volume.bonds || [];
                    return bonds.length === 1 && bonds[0].order === 1 && bonds[0].origin === 'explicit';
                }"""
            )
            page.mouse.move(min(x, grow_x) - 120, min(y, grow_y) - 120)
            page.mouse.down()
            page.mouse.move(max(x, grow_x) + 120, max(y, grow_y) + 120, steps=12)
            page.mouse.up()
            page.wait_for_function(
                """() => {
                    const meta = document.getElementById('editAdaptiveSelectionMeta');
                    const marquee = document.getElementById('editSelectionMarquee');
                    return /2 atoms selected/i.test(meta?.textContent || '')
                      && marquee?.getAttribute('aria-hidden') === 'true';
                }"""
            )
            empty_x, empty_y = canvas_point(page, 0.04, 0.08)
            page.mouse.click(empty_x, empty_y)
            page.wait_for_function(
                """() => /Click atoms to build a selection/i.test(document.getElementById('editAdaptiveSelectionMeta')?.textContent || '')"""
            )
            page.mouse.click(x, y)
            page.wait_for_function(
                """() => /1 atom selected/i.test(document.getElementById('editAdaptiveSelectionMeta')?.textContent || '')"""
            )
            before_single_move = page.evaluate(
                """() => window.VibeMolStructure.exportActive().volume.atoms.map((atom) => [atom.x, atom.y, atom.z])"""
            )
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(x - 28, y - 18, steps=12)
            page.mouse.up()
            page.wait_for_function(
                """(beforeAtoms) => {
                    const atoms = window.VibeMolStructure.exportActive().volume.atoms || [];
                    if (atoms.length !== beforeAtoms.length) return false;
                    let moved = 0;
                    for (let i = 0; i < atoms.length; i += 1) {
                      const atom = atoms[i];
                      const before = beforeAtoms[i];
                      const dx = Math.abs((atom.x || 0) - before[0]);
                      const dy = Math.abs((atom.y || 0) - before[1]);
                      const dz = Math.abs((atom.z || 0) - before[2]);
                      if (dx > 1e-6 || dy > 1e-6 || dz > 1e-6) moved += 1;
                    }
                    return moved === 1;
                }""",
                arg=before_single_move,
            )
            page.mouse.click(x, y)
            page.wait_for_function(
                """() => /1 atom selected/i.test(document.getElementById('editAdaptiveSelectionMeta')?.textContent || '')"""
            )
            page.mouse.dblclick(x, y)
            page.wait_for_function(
                """() => /2 atoms selected/i.test(document.getElementById('editAdaptiveSelectionMeta')?.textContent || '')"""
            )

            # After the first atom exists, the advanced drawer should expose atom-dependent tools.
            ensure_advanced_drawer_open(page)
            page.wait_for_function(
                """() => {
                    const ids = [
                      'editAdaptiveSelectionBtn',
                      'editAdaptiveMoveBtn',
                      'editAdaptiveRotateBtn',
                      'editAdaptiveBondBtn',
                      'editAdaptiveTransformBtn',
                      'editAdaptiveDeleteBtn',
                    ];
                    return ids.every((id) => {
                      const el = document.getElementById(id);
                      return !!el && !el.hidden && getComputedStyle(el).display !== 'none';
                    });
                }"""
            )
            ensure_advanced_drawer_closed(page)
            page.locator('#removeFileBtn').click()
            page.locator('#modeDisplayBtn').click()
            page.wait_for_function(
                """() => {
                    const splash = document.getElementById('emptyState');
                    return !!splash && !splash.classList.contains('hidden');
                }"""
            )

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

            light_bg = sample_scene_canvas_rgb(page)
            assert light_bg['r'] > 0.9 and light_bg['g'] > 0.9 and light_bg['b'] > 0.9, light_bg
            page.hover('#topRightUtilities')
            page.locator('#themeToggleShell').click()
            page.wait_for_function(
                """() => {
                    const themeInput = document.getElementById('themeToggleInput');
                    return !!themeInput
                      && themeInput.checked === true
                      && document.documentElement.getAttribute('data-theme') === 'dark'
                      && window.localStorage.getItem('vibemol.uiTheme') === 'dark';
                }"""
            )
            dark_bg = sample_scene_canvas_rgb(page)
            assert dark_bg['r'] < light_bg['r'] and dark_bg['g'] < light_bg['g'] and dark_bg['b'] < light_bg['b'], (light_bg, dark_bg)
            assert 0.1 < min(dark_bg['r'], dark_bg['g'], dark_bg['b']) < 0.3, dark_bg
            assert 0.1 < max(dark_bg['r'], dark_bg['g'], dark_bg['b']) < 0.3, dark_bg
            page.locator('#themeToggleShell').click()
            page.wait_for_function(
                """() => {
                    const themeInput = document.getElementById('themeToggleInput');
                    return !!themeInput
                      && themeInput.checked === false
                      && document.documentElement.getAttribute('data-theme') === 'light'
                      && window.localStorage.getItem('vibemol.uiTheme') === 'light';
                }"""
            )
            light_bg_2 = sample_scene_canvas_rgb(page)
            assert light_bg_2['r'] > 0.9 and light_bg_2['g'] > 0.9 and light_bg_2['b'] > 0.9, light_bg_2

            # Molden load/render smoke.
            molden_text = build_fixture_molden()
            page.evaluate(
                """async (text) => {
                    await window.VibeMolEmbed.loadFiles([{ name: 'mini.molden', text }]);
                }""",
                molden_text,
            )
            page.wait_for_function(
                """() => {
                    const row = document.getElementById('moldenMoRow');
                    const summary = document.getElementById('moldenGridSummary');
                    return !!row
                      && getComputedStyle(row).display !== 'none'
                      && !!summary
                      && (summary.textContent || '').trim().length > 0;
                }"""
            )
            molden_summary = page.evaluate(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    return {
                        kind: exported.kind,
                        volumeKind: exported.volume && exported.volume.kind,
                        atomCount: exported.volume && Array.isArray(exported.volume.atoms) ? exported.volume.atoms.length : 0,
                        nxyz: exported.volume && Array.isArray(exported.volume.nxyz) ? exported.volume.nxyz.slice() : [],
                        dataLength: exported.volume && Array.isArray(exported.volume.data) ? exported.volume.data.length : 0,
                        moSummary: (document.getElementById('moldenMoSummary')?.textContent || '').trim(),
                        gridSummary: (document.getElementById('moldenGridSummary')?.textContent || '').trim(),
                    };
                }"""
            )
            if molden_summary['kind'] != 'vibemol.structure' or molden_summary['volumeKind'] != 'molden':
                raise AssertionError(f'Unexpected Molden structure summary: {molden_summary}')
            if molden_summary['atomCount'] != 1:
                raise AssertionError(f'Molden load produced unexpected atom count: {molden_summary}')
            if len(molden_summary['nxyz']) != 3 or any(int(n) <= 0 for n in molden_summary['nxyz']):
                raise AssertionError(f'Molden load did not generate a valid grid: {molden_summary}')
            if molden_summary['dataLength'] <= 0:
                raise AssertionError(f'Molden render path did not populate grid data: {molden_summary}')
            if not molden_summary['moSummary'] or not molden_summary['gridSummary']:
                raise AssertionError(f'Molden inspector summaries are missing: {molden_summary}')

            # Geometry-only imports should infer single perceived bonds.
            inferred_xyz_text = build_fixture_inferred_xyz()
            page.evaluate(
                """async (text) => {
                    await window.VibeMolEmbed.loadFiles([{ name: 'two-carbons.xyz', text }]);
                }""",
                inferred_xyz_text,
            )
            inferred_summary = active_structure_summary(page)
            if inferred_summary['atomCount'] != 2 or inferred_summary['bondCount'] != 1:
                raise AssertionError(f'XYZ inference failed: {inferred_summary}')
            if inferred_summary['bondOrders'] != [1]:
                raise AssertionError(f'XYZ inference created non-single orders: {inferred_summary}')
            if inferred_summary['bondOrigins'] != ['perceived']:
                raise AssertionError(f'XYZ inference did not mark bonds as perceived: {inferred_summary}')

            # Edit-mode Space should preview hydrogens first, then apply them on the second press.
            page.locator('#modeEditBtn').click()
            page.wait_for_function("() => document.getElementById('editGestureHud')?.getAttribute('aria-hidden') === 'false'")
            page.keyboard.press(' ')
            page.wait_for_function(
                """() => {
                    const hint = document.getElementById('hint');
                    return !!hint && /Press Space again to apply/i.test(hint.textContent || '');
                }"""
            )
            hydrogen_preview_summary = active_structure_summary(page)
            if hydrogen_preview_summary['atomCount'] != 2 or hydrogen_preview_summary['bondCount'] != 1:
                raise AssertionError(f'Auto-hydrogen preview mutated the structure too early: {hydrogen_preview_summary}')
            page.keyboard.press(' ')
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    const bonds = Array.isArray(exported.volume?.bonds) ? exported.volume.bonds : [];
                    const hydrogenCount = atoms.filter((atom) => (atom.Z | 0) === 1).length;
                    const explicitCount = bonds.filter((bond) => String(bond.origin || '') === 'explicit').length;
                    return hydrogenCount === 6 && explicitCount === 6 && bonds.length === 7;
                }"""
            )
            hydrogenated_summary = active_structure_summary(page)
            if hydrogenated_summary['atomCount'] != 8 or hydrogenated_summary['bondCount'] != 7:
                raise AssertionError(f'Auto-hydrogenation produced an unexpected structure: {hydrogenated_summary}')
            if hydrogenated_summary['atomicNumbers'].count(1) != 6:
                raise AssertionError(f'Auto-hydrogenation did not add six hydrogens: {hydrogenated_summary}')
            if hydrogenated_summary['bondOrigins'].count('explicit') != 6 or hydrogenated_summary['bondOrigins'].count('perceived') != 1:
                raise AssertionError(f'Auto-hydrogenation bond provenance is wrong: {hydrogenated_summary}')

            # Replace active content with a deterministic explicit-bond fixture.
            fixture_text = build_fixture_structure()
            page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "smoke-fixture")', fixture_text)
            fixture_summary = active_structure_summary(page)
            if fixture_summary['atomCount'] != 2 or fixture_summary['bondCount'] != 1:
                raise AssertionError(f'Fixture import failed: {fixture_summary}')

            # Edit mode + adaptive menu.
            page.locator('#modeEditBtn').click()
            ensure_advanced_drawer_open(page)
            page.wait_for_function("() => !document.getElementById('emptyState') || getComputedStyle(document.getElementById('emptyState')).display === 'none'")
            page.wait_for_function(
                """() => {
                    const selectionBtn = document.getElementById('editAdaptiveSelectionBtn');
                    const addAtomBtn = document.getElementById('editAdaptiveAddAtomBtn');
                    return !!selectionBtn
                      && !selectionBtn.hidden
                      && !!addAtomBtn
                      && !addAtomBtn.hidden;
                }"""
            )
            page.locator('#editAdaptiveTransformBtn').click()
            page.wait_for_function(
                """() => {
                    const select = document.getElementById('editTransformMode');
                    if (!select) return false;
                    const values = Array.from(select.options || []).map((option) => option.value);
                    return !values.includes('move') && select.value === 'rotate_fragment';
                }"""
            )
            page.locator('#editAdaptiveSelectionBtn').click()

            # Selection marquee smoke.
            page.locator('#editAdaptiveSelectionBtn').click()
            # Marquee selection uses projected atom centers, not full sphere extents.
            # Use a generously centered rectangle so minor fit/render differences
            # in headless Chromium do not make this test flaky.
            drag_canvas_box(page, 0.22, 0.22, 0.78, 0.78)
            page.wait_for_function(
                """() => /2 atoms selected/i.test(document.getElementById('editAdaptiveSelectionMeta')?.textContent || '')"""
            )

            # Select-all smoke.
            page.keyboard.press('Meta+A' if sys.platform == 'darwin' else 'Control+A')
            page.wait_for_function(
                """() => /2 atoms selected/i.test(document.getElementById('editAdaptiveSelectionMeta')?.textContent || '')"""
            )

            # Empty-click deselection should also work in non-selection tools.
            page.locator('#editAdaptiveMoveBtn').click()
            empty_x, empty_y = canvas_point(page, 0.04, 0.08)
            page.mouse.click(empty_x, empty_y)
            page.wait_for_function(
                """() => /Click atoms to build a selection/i.test(document.getElementById('editAdaptiveSelectionMeta')?.textContent || '')"""
            )
            page.locator('#editAdaptiveSelectionBtn').click()
            page.keyboard.press('Meta+A' if sys.platform == 'darwin' else 'Control+A')
            page.wait_for_function(
                """() => /2 atoms selected/i.test(document.getElementById('editAdaptiveSelectionMeta')?.textContent || '')"""
            )

            # Move smoke via operator panel + undo.
            before_move = page.evaluate(
                """() => window.VibeMolStructure.exportActive().volume.atoms.map((atom) => [atom.x, atom.y, atom.z])"""
            )
            page.locator('#editAdaptiveMoveBtn').click()
            page.wait_for_function("() => document.getElementById('editMoveOperatorPanel')?.getAttribute('aria-hidden') === 'false'")
            page.locator('#editMoveOperatorHeader').click()
            move_input = page.locator('#editMoveOperatorX')
            move_input.click()
            move_input.fill('0.500')
            page.keyboard.press('Enter')
            page.wait_for_function(
                """(beforeAtoms) => {
                    const atoms = window.VibeMolStructure.exportActive().volume.atoms || [];
                    if (atoms.length !== beforeAtoms.length) return false;
                    for (let i = 0; i < atoms.length; i += 1) {
                      if (Math.abs((atoms[i].x || 0) - beforeAtoms[i][0]) > 1e-6) return true;
                    }
                    return false;
                }""",
                arg=before_move,
            )
            page.evaluate(
                """() => {
                    const active = document.activeElement;
                    if (active && typeof active.blur === 'function') active.blur();
                }"""
            )
            page.evaluate(
                """(isMac) => {
                    window.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'z',
                        metaKey: !!isMac,
                        ctrlKey: !isMac,
                        bubbles: true,
                        cancelable: true,
                    }));
                }""",
                arg=(sys.platform == 'darwin'),
            )
            page.wait_for_function(
                """() => /Undo: Move 2 atoms/i.test(document.getElementById('hint')?.textContent || '')"""
            )

            # Rotate smoke via operator panel + undo.
            page.locator('#editAdaptiveSelectionBtn').click()
            page.keyboard.press('Meta+A' if sys.platform == 'darwin' else 'Control+A')
            page.wait_for_function(
                """() => /2 atoms selected/i.test(document.getElementById('editAdaptiveSelectionMeta')?.textContent || '')"""
            )
            before_rotate = page.evaluate(
                """() => window.VibeMolStructure.exportActive().volume.atoms.map((atom) => [atom.x, atom.y, atom.z])"""
            )
            page.locator('#editAdaptiveRotateBtn').click()
            page.wait_for_function("() => document.getElementById('editRotateOperatorPanel')?.getAttribute('aria-hidden') === 'false'")
            page.locator('#editRotateOperatorHeader').click()
            rotate_input = page.locator('#editRotateOperatorZ')
            rotate_input.click()
            rotate_input.fill('30')
            page.keyboard.press('Enter')
            page.wait_for_function(
                """(beforeAtoms) => {
                    const atoms = window.VibeMolStructure.exportActive().volume.atoms || [];
                    if (atoms.length !== beforeAtoms.length) return false;
                    for (let i = 0; i < atoms.length; i += 1) {
                      const atom = atoms[i];
                      const before = beforeAtoms[i];
                      if (Math.abs((atom.x || 0) - before[0]) > 1e-6) return true;
                      if (Math.abs((atom.y || 0) - before[1]) > 1e-6) return true;
                      if (Math.abs((atom.z || 0) - before[2]) > 1e-6) return true;
                    }
                    return false;
                }""",
                arg=before_rotate,
            )
            page.evaluate(
                """() => {
                    const active = document.activeElement;
                    if (active && typeof active.blur === 'function') active.blur();
                }"""
            )
            page.evaluate(
                """(isMac) => {
                    window.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'z',
                        metaKey: !!isMac,
                        ctrlKey: !isMac,
                        bubbles: true,
                        cancelable: true,
                    }));
                }""",
                arg=(sys.platform == 'darwin'),
            )
            page.wait_for_function(
                """() => /Undo: Rotate 2 atoms/i.test(document.getElementById('hint')?.textContent || '')"""
            )
            page.locator('#editAdaptiveSelectionBtn').click()
            page.keyboard.press('Meta+A' if sys.platform == 'darwin' else 'Control+A')
            page.wait_for_function(
                """() => /2 atoms selected/i.test(document.getElementById('editAdaptiveSelectionMeta')?.textContent || '')"""
            )

            # Copy/paste selected atoms keeps internal bonds and selects the pasted atoms.
            copy_paste_shortcut = 'Meta+' if sys.platform == 'darwin' else 'Control+'
            page.keyboard.press(copy_paste_shortcut + 'C')
            page.keyboard.press(copy_paste_shortcut + 'V')
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    return exported.volume.atoms.length === 4
                      && Array.isArray(exported.volume.bonds)
                      && exported.volume.bonds.length === 2
                      && /2 atoms selected/i.test(document.getElementById('editAdaptiveSelectionMeta')?.textContent || '');
                }"""
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
            ensure_advanced_drawer_open(page)
            page.locator('#editAdaptiveBondBtn').click()
            x, y = canvas_point(page, 0.5, 0.5)
            page.mouse.click(x, y)
            page.wait_for_function("() => document.getElementById('bondOrderPopup')?.getAttribute('aria-hidden') === 'false'")
            page.locator('#bondOrderPopup button[data-bond-order-popup="2"]').click()
            page.wait_for_function(
                """() => {
                    const bond = (window.VibeMolStructure.exportActive().volume.bonds || [])[0] || null;
                    return !!bond && bond.order === 2 && bond.origin === 'explicit';
                }"""
            )
            order_updated = active_structure_summary(page)
            if order_updated['bondOrders'] != [2] or order_updated['bondOrigins'] != ['explicit']:
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

            # Clean Up Bonds preview/apply should only remove perceived bonds and warn on explicit ones.
            cleanup_fixture_text = build_fixture_cleanup_structure()
            page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "cleanup-fixture")', cleanup_fixture_text)
            page.locator('#modeEditBtn').click()
            ensure_advanced_drawer_open(page)
            page.locator('#editAdaptiveBondBtn').click()
            page.locator('#editBondCleanupStartBtn').click()
            page.wait_for_function(
                """() => /Add 1 .* Remove 1 perceived .* Warn 1 explicit/i.test(document.getElementById('editBondCleanupSummary')?.textContent || '')"""
            )
            page.locator('#editBondCleanupApplyBtn').click()
            page.wait_for_function(
                """() => {
                    const bonds = window.VibeMolStructure.exportActive().volume.bonds || [];
                    const pairs = bonds.map((bond) => [bond.a, bond.b].sort().join(':')).sort();
                    const origins = Object.fromEntries(bonds.map((bond) => [[bond.a, bond.b].sort().join(':'), bond.origin]));
                    return pairs.join('|') === 'atom-1:atom-2|atom-1:atom-3|atom-2:atom-3'
                      && origins['atom-1:atom-2'] === 'perceived'
                      && origins['atom-1:atom-3'] === 'explicit'
                      && origins['atom-2:atom-3'] === 'perceived';
                }"""
            )
            page.wait_for_function(
                """() => /Applied bond cleanup:/i.test(document.getElementById('hint')?.textContent || '')"""
            )

            # Trajectory-mode bonds should be dynamic for rendering only.
            trajectory_xyz_text = build_fixture_trajectory_xyz()
            page.locator('#modeDisplayBtn').click()
            page.evaluate(
                """async (text) => {
                    await window.VibeMolEmbed.loadFiles([{ name: 'dynamic-traj.xyz', text }]);
                }""",
                trajectory_xyz_text,
            )
            page.locator('#viewInspectorBtn').click()
            page.wait_for_function(
                """() => {
                    const inspector = document.getElementById('viewInspector');
                    const btn = document.getElementById('trajectoryPanelBtn');
                    return !!inspector
                      && inspector.getAttribute('aria-hidden') === 'false'
                      && !!btn
                      && getComputedStyle(btn).display !== 'none';
                }"""
            )
            page.locator('#trajectoryPanelBtn').click()
            page.wait_for_function(
                """() => {
                    const note = document.getElementById('trajectoryBondModeNote');
                    return !!note && getComputedStyle(note).display !== 'none' && /dynamic/i.test(note.textContent || '');
                }"""
            )
            stored_before_traj = active_structure_summary(page)
            if stored_before_traj['bondCount'] != 1 or stored_before_traj['bondOrigins'] != ['perceived']:
                raise AssertionError(f'Trajectory import stored graph is unexpected: {stored_before_traj}')
            frame1_sample = sample_canvas_region_rgb(page, 0.5, 0.5, 11)
            page.locator('#trajectoryFrame').evaluate(
                """(el) => {
                    el.value = '1';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.wait_for_function(
                """() => /2\\/2/.test(document.getElementById('trajectoryFrameLabel')?.textContent || '')"""
            )
            frame2_sample = sample_canvas_region_rgb(page, 0.5, 0.5, 11)
            if (frame2_sample['r'] + frame2_sample['g'] + frame2_sample['b']) <= (frame1_sample['r'] + frame1_sample['g'] + frame1_sample['b']) + 0.05:
                raise AssertionError(f'Trajectory frame switch did not visibly remove the bond: {frame1_sample} -> {frame2_sample}')
            stored_after_traj = active_structure_summary(page)
            if stored_after_traj['bondCount'] != 1 or stored_after_traj['bondOrigins'] != ['perceived']:
                raise AssertionError(f'Trajectory rendering mutated stored topology: {stored_after_traj}')
            xyz_export = page.evaluate(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    return window.VibeMolUI.volumeToXYZ(
                      { name: exported.name, vol: exported.volume },
                      0.52917721092,
                      window.ATOM_Z_TO_DATA,
                      'angstrom'
                    );
                }"""
            )
            if not isinstance(xyz_export, str) or '"kind"' in xyz_export or 'origin' in xyz_export or 'bond' in xyz_export.lower():
                raise AssertionError(f'XYZ export was not plain XYZ text: {xyz_export!r}')

            assert_no_runtime_errors(page_errors, console_errors)
            browser.close()
            return 0
        except Exception:
            write_failure_artifacts(page, ARTIFACT_DIR, 'smoke-failure', page_errors, console_errors)
            browser.close()
            raise


if __name__ == '__main__':
    raise SystemExit(main())
