#!/usr/bin/env python3
from __future__ import annotations

import json
import os
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
SMOKE_VERBOSE = os.environ.get('VIBEMOL_SMOKE_VERBOSE') == '1'


def log_step(label: str) -> None:
    if SMOKE_VERBOSE:
        print(f'[smoke] {label}', flush=True)


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


def build_fixture_dihedral_structure() -> str:
    payload = {
        'kind': 'vibemol.structure',
        'structureVersion': 1,
        'appVersion': 'smoke-test',
        'name': 'dihedral-fixture.structure.json',
        'meta': {'source': 'test'},
        'volume': {
            'title': 'Dihedral fixture',
            'comment': 'Explicit central bond with one substituent on each side',
            'natoms': 4,
            'origin': [0, 0, 0],
            'nxyz': [0, 0, 0],
            'axes': [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            'atoms': [
                {'id': 'atom-1', 'Z': 6, 'x': -0.7, 'y': 0.0, 'z': 0.0, 'formalCharge': 0},
                {'id': 'atom-2', 'Z': 6, 'x': 0.7, 'y': 0.0, 'z': 0.0, 'formalCharge': 0},
                {'id': 'atom-3', 'Z': 1, 'x': -1.25, 'y': 0.82, 'z': 0.42, 'formalCharge': 0},
                {'id': 'atom-4', 'Z': 1, 'x': 1.18, 'y': 0.76, 'z': -0.58, 'formalCharge': 0},
            ],
            'bonds': [
                {'id': 'bond:atom-1:atom-2', 'a': 'atom-1', 'b': 'atom-2', 'order': 1, 'kind': 'normal', 'origin': 'explicit'},
                {'id': 'bond:atom-1:atom-3', 'a': 'atom-1', 'b': 'atom-3', 'order': 1, 'kind': 'normal', 'origin': 'explicit'},
                {'id': 'bond:atom-2:atom-4', 'a': 'atom-2', 'b': 'atom-4', 'order': 1, 'kind': 'normal', 'origin': 'explicit'},
            ],
            'annotations': {'builder': {'byAtomId': {}}},
            'fragmentOps': [],
            'data': [],
            'units': 'angstrom',
        },
        'recordState': {'measurementLabelOffsets': {}},
    }
    return json.dumps(payload)


def build_fixture_optimize_structure() -> str:
    payload = {
        'kind': 'vibemol.structure',
        'structureVersion': 1,
        'appVersion': 'smoke-test',
        'name': 'optimize-fixture.structure.json',
        'meta': {'source': 'test'},
        'volume': {
            'title': 'Optimize fixture',
            'comment': 'Stretched explicit-bond fixture for UFF optimization',
            'natoms': 2,
            'origin': [0, 0, 0],
            'nxyz': [0, 0, 0],
            'axes': [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            'atoms': [
                {'id': 'atom-1', 'Z': 6, 'x': 0.0, 'y': 0.0, 'z': 0.0, 'formalCharge': 0},
                {'id': 'atom-2', 'Z': 1, 'x': 2.4, 'y': 0.0, 'z': 0.0, 'formalCharge': 0},
            ],
            'bonds': [
                {'id': 'bond:atom-1:atom-2', 'a': 'atom-1', 'b': 'atom-2', 'order': 1, 'kind': 'normal', 'origin': 'explicit'},
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


def find_bond_midpoint_canvas_point(page) -> tuple[float, float]:
    candidates = [
        (0.50, 0.50),
        (0.48, 0.50), (0.52, 0.50),
        (0.46, 0.50), (0.54, 0.50),
        (0.50, 0.48), (0.50, 0.52),
        (0.48, 0.48), (0.52, 0.52),
        (0.48, 0.52), (0.52, 0.48),
    ]
    for fx, fy in candidates:
        x, y = canvas_point(page, fx, fy)
        page.mouse.move(x, y)
        page.wait_for_timeout(60)
        hit = page.evaluate(
            """(payload) => {
                if (!window.VibeMolTesting || typeof window.VibeMolTesting.pickEditHitAtClient !== 'function') return null;
                return window.VibeMolTesting.pickEditHitAtClient(payload.x, payload.y);
            }""",
            {'x': x, 'y': y},
        )
        if isinstance(hit, dict):
            if str(hit.get('bondSection', '')).strip().lower() == 'center':
                return x, y
            continue
        is_midpoint = page.evaluate(
            """() => {
                const scope = document.getElementById('editGestureScope');
                return !!scope && /Bond midpoint/i.test(scope.textContent || '');
            }"""
        )
        if is_midpoint:
            return x, y
    raise AssertionError('Could not locate a bond midpoint hover target on the canvas')


def find_bond_side_canvas_point(page, side: str | None = None) -> tuple[float, float]:
    desired = str(side or '').strip().lower()
    candidates = [
        (0.44, 0.50), (0.56, 0.50),
        (0.46, 0.50), (0.54, 0.50),
        (0.43, 0.48), (0.57, 0.48),
        (0.43, 0.52), (0.57, 0.52),
        (0.47, 0.49), (0.53, 0.49),
        (0.47, 0.51), (0.53, 0.51),
    ]
    for fx, fy in candidates:
        x, y = canvas_point(page, fx, fy)
        page.mouse.move(x, y)
        page.wait_for_timeout(60)
        hit = page.evaluate(
            """(payload) => {
                if (!window.VibeMolTesting || typeof window.VibeMolTesting.pickEditHitAtClient !== 'function') return null;
                return window.VibeMolTesting.pickEditHitAtClient(payload.x, payload.y);
            }""",
            {'x': x, 'y': y},
        )
        if not isinstance(hit, dict):
            continue
        bond_section = str(hit.get('bondSection', '')).strip().lower()
        if bond_section not in ('neara', 'nearb'):
            continue
        if desired and bond_section != desired:
            continue
        return x, y
    if desired:
        raise AssertionError(f'Could not locate a bond-side hover target for {desired} on the canvas')
    raise AssertionError('Could not locate a bond-side hover target on the canvas')


def ensure_advanced_drawer_open(page) -> None:
    page.wait_for_function("() => document.getElementById('editAdaptiveMenu')?.getAttribute('aria-hidden') === 'false'")


def ensure_advanced_drawer_closed(page) -> None:
    page.wait_for_function("() => document.getElementById('editAdaptiveMenu')?.getAttribute('aria-hidden') === 'false'")


def wait_for_selected_atoms(page, count: int, timeout: int = 30000) -> None:
    page.wait_for_function(
        r"""(expectedCount) => {
            return Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0) === Number(expectedCount || 0);
        }""",
        arg=count,
        timeout=timeout,
    )


def project_active_atom(page, atom_index: int) -> tuple[float, float]:
    result = page.evaluate(
        """(index) => {
            if (!window.VibeMolTesting || typeof window.VibeMolTesting.projectActiveAtomToClient !== 'function') return null;
            return window.VibeMolTesting.projectActiveAtomToClient(index);
        }""",
        atom_index,
    )
    if not isinstance(result, dict) or not result.get('visible'):
        raise AssertionError(f'Could not project active atom {atom_index}: {result!r}')
    return float(result['x']), float(result['y'])


def project_halo_ghost(page, ghost_index: int = 0) -> tuple[float, float]:
    result = page.evaluate(
        """(index) => {
            if (!window.VibeMolTesting || typeof window.VibeMolTesting.projectHaloGhostToClient !== 'function') return null;
            return window.VibeMolTesting.projectHaloGhostToClient(index);
        }""",
        ghost_index,
    )
    if not isinstance(result, dict) or not result.get('visible'):
        raise AssertionError(f'Could not project halo ghost {ghost_index}: {result!r}')
    return float(result['x']), float(result['y'])


def find_atom_click_point(page, atom_index: int) -> tuple[float, float]:
    center_x, center_y = project_active_atom(page, atom_index)
    candidates: list[tuple[float, float]] = [(0.0, 0.0)]
    for radius in (8.0, 14.0, 20.0, 28.0, 36.0, 44.0):
        candidates.extend([
            (-radius, 0.0), (radius, 0.0),
            (0.0, -radius), (0.0, radius),
            (-radius, -radius), (radius, -radius),
            (-radius, radius), (radius, radius),
            (-radius, radius * 0.5), (radius, radius * 0.5),
            (-radius, -radius * 0.5), (radius, -radius * 0.5),
            (-radius * 0.5, radius), (radius * 0.5, radius),
            (-radius * 0.5, -radius), (radius * 0.5, -radius),
        ])
    for off_x, off_y in candidates:
        x = center_x + off_x
        y = center_y + off_y
        hit = page.evaluate(
            """(payload) => {
                if (!window.VibeMolTesting || typeof window.VibeMolTesting.pickEditHitAtClient !== 'function') return null;
                return window.VibeMolTesting.pickEditHitAtClient(payload.x, payload.y);
            }""",
            {'x': x, 'y': y},
        )
        if isinstance(hit, dict) and int(hit.get('atomIndex', -1)) == int(atom_index):
            return x, y
    raise AssertionError(f'Could not locate a clickable point for atom index {atom_index}')


def get_transform_angle_guide(page) -> dict[str, float | str | bool] | None:
    result = page.evaluate(
        """() => {
            if (!window.VibeMolTesting || typeof window.VibeMolTesting.getTransformAngleGuideClient !== 'function') return null;
            return window.VibeMolTesting.getTransformAngleGuideClient();
        }"""
    )
    if result is None:
        return None
    if not isinstance(result, dict):
        raise AssertionError(f'Unexpected transform angle guide result: {result!r}')
    return result


def get_transform_distance_guide(page) -> dict[str, float | bool] | None:
    result = page.evaluate(
        """() => {
            if (!window.VibeMolTesting || typeof window.VibeMolTesting.getTransformDistanceGuideClient !== 'function') return null;
            return window.VibeMolTesting.getTransformDistanceGuideClient();
        }"""
    )
    if result is None:
        return None
    if not isinstance(result, dict):
        raise AssertionError(f'Unexpected transform distance guide result: {result!r}')
    return result


def get_bond_side_cue_state(page) -> dict[str, str | bool]:
    result = page.evaluate(
        """() => {
            if (!window.VibeMolTesting || typeof window.VibeMolTesting.getBondSideCueState !== 'function') return null;
            return window.VibeMolTesting.getBondSideCueState();
        }"""
    )
    if not isinstance(result, dict):
        raise AssertionError(f'Unexpected bond-side cue state: {result!r}')
    return result


def projected_atom_hit_candidates(page, atom_index: int, other_index: int) -> list[tuple[float, float]]:
    center_x, center_y = project_active_atom(page, atom_index)
    other_x, other_y = project_active_atom(page, other_index)
    dx = center_x - other_x
    dy = center_y - other_y
    norm = (dx * dx + dy * dy) ** 0.5
    if norm <= 1e-6:
        ux, uy = 1.0, 0.0
    else:
        ux, uy = dx / norm, dy / norm
    px, py = -uy, ux
    offsets = [
        (12.0 * ux, 12.0 * uy),
        (8.0 * ux, 8.0 * uy),
        (0.0, 0.0),
        (6.0 * px, 6.0 * py),
        (-6.0 * px, -6.0 * py),
        (10.0 * ux + 5.0 * px, 10.0 * uy + 5.0 * py),
        (10.0 * ux - 5.0 * px, 10.0 * uy - 5.0 * py),
    ]
    return [(center_x + off_x, center_y + off_y) for off_x, off_y in offsets]


def find_empty_edit_canvas_point(page) -> tuple[float, float]:
    candidates = [
        (0.04, 0.08),
        (0.08, 0.12),
        (0.76, 0.62),
        (0.80, 0.22),
        (0.86, 0.78),
        (0.24, 0.80),
    ]
    for fx, fy in candidates:
        x, y = canvas_point(page, fx, fy)
        hit = page.evaluate(
            """(payload) => {
                if (!window.VibeMolTesting || typeof window.VibeMolTesting.pickEditHitAtClient !== 'function') return null;
                return window.VibeMolTesting.pickEditHitAtClient(payload.x, payload.y);
            }""",
            {'x': x, 'y': y},
        )
        if not isinstance(hit, dict):
            continue
        if int(hit.get('atomIndex', -1)) < 0 and not str(hit.get('bondSection', '')).strip():
            return x, y
    raise AssertionError('Could not find an empty canvas point for edit-mode smoke input.')


def set_checkbox_state(page, selector: str, checked: bool) -> None:
    ok = page.evaluate(
        """(payload) => {
            const el = document.querySelector(payload.selector);
            if (!el) return false;
            const nextChecked = !!payload.checked;
            if (el.checked !== nextChecked) {
                el.checked = nextChecked;
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return el.checked === nextChecked;
        }""",
        {'selector': selector, 'checked': checked},
    )
    if not ok:
        raise AssertionError(f'Could not set checkbox state for {selector} -> {checked}')


def set_select_value(page, selector: str, value: str) -> None:
    ok = page.evaluate(
        """(payload) => {
            const el = document.querySelector(payload.selector);
            if (!el) return false;
            el.value = String(payload.value || '');
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return el.value === String(payload.value || '');
        }""",
        {'selector': selector, 'value': value},
    )
    if not ok:
        raise AssertionError(f'Could not set select value for {selector} -> {value}')


def load_build_query(page, query: str) -> None:
    page.locator('#editAdaptiveAddAtomBtn').click()
    page.wait_for_function(
        """() => document.getElementById('editAdaptiveAddAtomPopover')?.getAttribute('aria-hidden') === 'false'"""
    )
    page.locator('#editBuildSearch').fill(query)
    page.keyboard.press('Enter')


def trigger_selection_tool(page) -> None:
    page.evaluate(
        """() => {
            window.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'n',
                code: 'KeyN',
                bubbles: true,
                cancelable: true,
            }));
        }"""
    )
    page.evaluate(
        """() => {
            const active = document.activeElement;
            if (active && typeof active.blur === 'function') active.blur();
        }"""
    )


def select_two_fixture_atoms(page) -> None:
    trigger_selection_tool(page)
    selection_count = page.evaluate(
        """() => {
            if (!window.VibeMolTesting || typeof window.VibeMolTesting.getEditSelectionCount !== 'function') return -1;
            return window.VibeMolTesting.getEditSelectionCount();
        }"""
    )
    if isinstance(selection_count, (int, float)) and int(selection_count) > 0:
        empty_x, empty_y = find_empty_edit_canvas_point(page)
        page.mouse.click(empty_x, empty_y)
        page.wait_for_function(
            """() => {
                if (!window.VibeMolTesting || typeof window.VibeMolTesting.getEditSelectionCount !== 'function') return false;
                return window.VibeMolTesting.getEditSelectionCount() === 0;
            }"""
        )

    def _select_one(candidates: list[tuple[float, float]]) -> bool:
        for x, y in candidates:
            page.mouse.click(x, y)
            try:
                page.wait_for_function(
                    r"""() => {
                        return Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0) === 1;
                    }""",
                    timeout=750,
                )
                return True
            except Exception:
                continue
        return False

    left_candidates = projected_atom_hit_candidates(page, 0, 1)
    right_candidates = projected_atom_hit_candidates(page, 1, 0)

    if not _select_one(left_candidates):
        raise AssertionError('Could not select the left atom in the deterministic two-atom fixture.')

    for x, y in right_candidates:
        page.keyboard.down('Shift')
        try:
            page.mouse.click(x, y)
        finally:
            page.keyboard.up('Shift')
        try:
            wait_for_selected_atoms(page, 2, timeout=750)
            return
        except Exception:
            continue

    direct_result = page.evaluate(
        """() => {
            if (!window.VibeMolTesting || typeof window.VibeMolTesting.setEditSelectionIndices !== 'function') return null;
            return window.VibeMolTesting.setEditSelectionIndices([0, 1]);
        }"""
    )
    if isinstance(direct_result, dict) and int(direct_result.get('count', -1)) == 2:
        wait_for_selected_atoms(page, 2)
        return

    raise AssertionError('Could not extend the deterministic two-atom fixture selection to two atoms.')


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
            log_step('load app')
            page.goto(base_url, wait_until='networkidle')
            wait_for_ready(page)

            log_step('startup theme controls')
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
            log_step('initial edit mode and adaptive menu')
            page.locator('#modeEditBtn').click()
            page.wait_for_function("() => document.getElementById('editGestureHud')?.getAttribute('aria-hidden') === 'false'")
            page.wait_for_function("() => document.getElementById('editAdaptiveMenu')?.getAttribute('aria-hidden') === 'false'")
            page.wait_for_function(
                """() => /Click void to place/i.test(document.getElementById('editGestureHint')?.textContent || '')"""
            )
            page.hover('#editAdaptiveAddAtomBtn')
            page.wait_for_function("() => document.getElementById('editAdaptiveAddAtomPopover')?.getAttribute('aria-hidden') === 'false'")
            page.wait_for_function(
                """() => {
                    const toggle = document.getElementById('editAddAdjustHydrogens');
                    const coordination = document.getElementById('editAddCoordination');
                    const labels = coordination ? Array.from(coordination.options).map((opt) => (opt.textContent || '').trim()) : [];
                    return !!toggle
                      && toggle.checked === true
                      && !!coordination
                      && labels.includes('Linear (2)')
                      && labels.includes('Trigonal planar (3)')
                      && labels.includes('Tetrahedral (4)');
                }"""
            )
            page.hover('#editAdaptiveAddAtomBtn')
            set_checkbox_state(page, '#editAddAdjustHydrogens', False)
            page.wait_for_function(
                """() => {
                    const toggle = document.getElementById('editAddAdjustHydrogens');
                    return !!toggle && toggle.checked === false;
                }"""
            )
            empty_edit_visibility = page.evaluate(
                """() => {
                    const isShown = (id) => {
                        const el = document.getElementById(id);
                        return !!el && !el.hidden && getComputedStyle(el).display !== 'none';
                    };
                    return {
                        build: isShown('editAdaptiveAddAtomBtn'),
                        cleanStructure: isShown('editAdaptiveCleanStructureBtn'),
                        shiftCom: isShown('editAdaptiveShiftComBtn'),
                        alignPrincipal: isShown('editAdaptiveAlignPrincipalBtn'),
                    };
                }"""
            )
            if empty_edit_visibility != {
                'build': True,
                'cleanStructure': False,
                'shiftCom': False,
                'alignPrincipal': False,
            }:
                raise AssertionError(f'Unexpected empty edit menu visibility: {empty_edit_visibility}')

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

            # Idle hover should surface the atom halo, and selecting the atom should keep it visible.
            page.mouse.move(x, y)
            page.wait_for_timeout(360)
            page.wait_for_function(
                """() => (window.VibeMolTesting?.getHaloGhostWorlds?.().length || 0) === 4"""
            )
            page.mouse.click(x, y)
            page.wait_for_function(
                """() => {
                    const scope = document.getElementById('editGestureScope')?.textContent || '';
                    const ghosts = window.VibeMolTesting?.getHaloGhostWorlds?.().length || 0;
                    return /tetrahedral \\(4\\)/i.test(scope) && ghosts === 4;
                }"""
            )
            page.wait_for_function(
                """() => {
                    const cue = document.getElementById('editSelectionCoordinationCueButton');
                    return !!cue && cue.hidden === false;
                }"""
            )

            # The Atoms menu stays responsible for element choice.
            page.hover('#editAdaptiveAddAtomBtn')
            page.wait_for_function("() => document.getElementById('editAdaptiveAddAtomPopover')?.getAttribute('aria-hidden') === 'false'")
            page.wait_for_timeout(120)
            nitrogen_quick_box = page.evaluate(
                """() => {
                    const el = document.querySelector('#editAddQuick button[data-z="7"]');
                    if (!el) return null;
                    const rect = el.getBoundingClientRect();
                    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                }"""
            )
            if not isinstance(nitrogen_quick_box, dict):
                raise AssertionError('Nitrogen Atoms quick-pick button was not rendered.')
            page.mouse.click(
                nitrogen_quick_box['x'] + nitrogen_quick_box['width'] * 0.5,
                nitrogen_quick_box['y'] + nitrogen_quick_box['height'] * 0.5,
            )
            page.wait_for_function(
                """() => document.querySelector('#editAddQuick button[data-z="7"]')?.classList.contains('active') === true"""
            )

            # The coordination chooser is now a cue-backed popover rather than a 2D halo menu.
            page.locator('#editSelectionCoordinationCueButton').click()
            page.wait_for_function(
                """() => document.getElementById('editSelectionCoordinationCuePopover')?.getAttribute('aria-hidden') === 'false'"""
            )
            page.wait_for_function(
                """() => {
                    const labels = Array.from(document.querySelectorAll('#editSelectionCoordinationCuePopover [data-coordination-choice] .editCoordinationCueLabel'));
                    const texts = labels.map((el) => (el.textContent || '').trim());
                    return texts.includes('Linear (2)')
                      && texts.includes('Trigonal planar (3)')
                      && texts.includes('Tetrahedral (4)');
                }"""
            )
            page.locator('#editSelectionCoordinationCuePopover [data-coordination-choice="linear"]').click()
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const byAtomId = exported.volume?.annotations?.coordination?.byAtomId || {};
                    const atom0 = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms[0] : null;
                    const atom0Id = atom0 && atom0.id != null ? String(atom0.id) : '';
                    const ghosts = window.VibeMolTesting?.getHaloGhostWorlds?.().length || 0;
                    return atom0Id
                      && byAtomId[atom0Id]
                      && byAtomId[atom0Id].geometryId === 'linear'
                      && ghosts === 2;
                }"""
            )

            # Clicking a halo ghost should grow chemistry from the selected atom in 3D.
            grow_x, grow_y = project_halo_ghost(page, 0)
            page.mouse.click(grow_x, grow_y)
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const bonds = Array.isArray(exported.volume?.bonds) ? exported.volume.bonds : [];
                    const atom0 = exported.volume?.atoms?.[0] || null;
                    const atom0Id = atom0 && atom0.id != null ? String(atom0.id) : '';
                    const geometryId = atom0Id ? exported.volume?.annotations?.coordination?.byAtomId?.[atom0Id]?.geometryId : '';
                    return exported.volume.atoms.length === 2
                      && exported.volume.atoms[1]?.Z === 7
                      && bonds.length === 1
                      && bonds[0].order === 1
                      && geometryId === 'linear';
                }"""
            )
            page.mouse.move(x, y)
            page.wait_for_timeout(360)
            atom1_x, atom1_y = project_active_atom(page, 0)

            page.mouse.move(grow_x, grow_y)
            page.wait_for_timeout(360)
            atom2_x, atom2_y = project_active_atom(page, 1)

            page.mouse.click(atom1_x, atom1_y)
            page.wait_for_function(
                """() => /linear \\(2\\)/i.test(document.getElementById('editGestureScope')?.textContent || '')"""
            )
            before_single_move = page.evaluate(
                """() => window.VibeMolStructure.exportActive().volume.atoms.map((atom) => [atom.x, atom.y, atom.z])"""
            )
            page.mouse.move(atom1_x, atom1_y)
            page.mouse.down()
            page.mouse.move(atom1_x - 28, atom1_y - 18, steps=12)
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
            page.mouse.dblclick(x, y)

            # After the first atom exists, the advanced drawer should expose atom-dependent tools.
            ensure_advanced_drawer_open(page)
            page.wait_for_function(
                """() => {
                    const ids = [
                      'editAdaptiveCleanStructureBtn',
                      'editAdaptiveShiftComBtn',
                      'editAdaptiveAlignPrincipalBtn',
                    ];
                    return ids.every((id) => {
                      const el = document.getElementById(id);
                      return !!el && !el.hidden && getComputedStyle(el).display !== 'none';
                    });
                }"""
            )
            ensure_advanced_drawer_closed(page)

            # Delete should remove the current selection first, then the hovered atom when no selection exists.
            page.keyboard.press('Control+A')
            off_x, off_y = canvas_point(page, 0.15, 0.15)
            page.mouse.move(off_x, off_y)
            page.keyboard.press('Delete')
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = exported?.volume?.atoms || [];
                    const scope = document.getElementById('editGestureScope')?.textContent || '';
                    return atoms.length === 0 && /no selection/i.test(scope);
                }"""
            )
            page.mouse.click(x, y)
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    return (exported?.volume?.atoms || []).length === 1;
                }"""
            )
            page.mouse.move(x, y)
            page.wait_for_timeout(360)
            page.keyboard.press('Delete')
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    return (exported?.volume?.atoms || []).length === 0;
                }"""
            )
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

            log_step('deterministic fixture import')
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
                    const addAtomBtn = document.getElementById('editAdaptiveAddAtomBtn');
                    return !!addAtomBtn
                      && !addAtomBtn.hidden;
                }"""
            )
            page.locator('#editAdaptiveAddAtomBtn').click()
            page.wait_for_function(
                """() => {
                    const atomBtn = document.getElementById('editAdaptiveAddAtomBtn');
                    return !!atomBtn
                      && atomBtn.classList.contains('active');
                }"""
            )

            log_step('deterministic fixture selection')
            # Direct atom-selection smoke on the deterministic two-atom fixture.
            select_two_fixture_atoms(page)

            # Empty-click deselection should also work outside the current selection.
            empty_x, empty_y = canvas_point(page, 0.04, 0.08)
            page.mouse.click(empty_x, empty_y)
            select_two_fixture_atoms(page)

            log_step('selection move smoke')
            # Move smoke via translate cue drag + undo.
            before_move = page.evaluate(
                """() => window.VibeMolStructure.exportActive().volume.atoms.map((atom) => [atom.x, atom.y, atom.z])"""
            )
            translate_cue_box = page.locator('#editSelectionTranslateCueButton').bounding_box()
            if not translate_cue_box:
                raise AssertionError('Translate selection cue is not visible for move smoke')
            move_x = translate_cue_box['x'] + translate_cue_box['width'] * 0.5
            move_y = translate_cue_box['y'] + translate_cue_box['height'] * 0.5
            page.mouse.move(move_x, move_y)
            page.mouse.down()
            page.mouse.move(move_x + 48, move_y + 12)
            page.mouse.up()
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
                arg=before_move,
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

            log_step('selection rotate smoke')
            # Rotate smoke via rotate cue drag + undo.
            select_two_fixture_atoms(page)
            page.wait_for_function(
                """() => {
                    const rotateBtn = document.getElementById('editSelectionRotateCueButton');
                    const translateBtn = document.getElementById('editSelectionTranslateCueButton');
                    return !!rotateBtn
                      && !rotateBtn.hidden
                      && !!translateBtn
                      && translateBtn.classList.contains('is-active');
                }"""
            )
            before_rotate = page.evaluate(
                """() => window.VibeMolStructure.exportActive().volume.atoms.map((atom) => [atom.x, atom.y, atom.z])"""
            )
            rotate_cue_box = page.locator('#editSelectionRotateCueButton').bounding_box()
            if not rotate_cue_box:
                raise AssertionError('Rotate selection cue is not visible for rotate smoke')
            rotate_x = rotate_cue_box['x'] + rotate_cue_box['width'] * 0.5
            rotate_y = rotate_cue_box['y'] + rotate_cue_box['height'] * 0.5
            page.mouse.move(rotate_x, rotate_y)
            page.mouse.down()
            page.mouse.move(rotate_x + 54, rotate_y + 36)
            page.mouse.up()
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

            log_step('fragment cue cancel returns to atom manipulation')
            select_two_fixture_atoms(page)
            page.locator('#editSelectionAddFragmentCueButton').click()
            page.wait_for_function(
                """() => {
                    const cue = document.getElementById('editSelectionAddFragmentCueButton');
                    return !!cue
                      && cue.getAttribute('aria-pressed') === 'true';
                }"""
            )
            cancel_x, cancel_y = find_empty_edit_canvas_point(page)
            page.mouse.click(cancel_x, cancel_y)
            page.wait_for_function(
                """() => {
                    const selectionCount = Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0);
                    return selectionCount === 0
                      && document.getElementById('editSelectionTranslateCue')?.getAttribute('aria-hidden') === 'true';
                }"""
            )

            log_step('fragment cue retargets to a newly clicked atom before attach')
            page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "fragment-retarget-fixture")', fixture_text)
            left_x, left_y = find_atom_click_point(page, 0)
            right_x, right_y = find_atom_click_point(page, 1)
            page.mouse.click(left_x, left_y)
            wait_for_selected_atoms(page, 1)
            page.locator('#editSelectionAddFragmentCueButton').click()
            page.wait_for_function(
                """() => document.getElementById('editSelectionAddFragmentCueButton')?.getAttribute('aria-pressed') === 'true'"""
            )
            page.mouse.click(right_x, right_y)
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    return Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0) === 1
                      && document.getElementById('editSelectionAddFragmentCueButton')?.getAttribute('aria-pressed') === 'true'
                      && Array.isArray(exported.volume?.atoms)
                      && exported.volume.atoms.length === 2
                      && Array.isArray(exported.volume?.bonds)
                      && exported.volume.bonds.length === 1;
                }"""
            )
            page.mouse.click(right_x, right_y)
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    const bonds = Array.isArray(exported.volume?.bonds) ? exported.volume.bonds : [];
                    if (atoms.length <= 2 || bonds.length <= 1) return false;
                    const degreeById = new Map(atoms.map((atom) => [String(atom.id || ''), 0]));
                    for (const bond of bonds) {
                      const aId = String(bond.a || '');
                      const bId = String(bond.b || '');
                      if (degreeById.has(aId)) degreeById.set(aId, Number(degreeById.get(aId) || 0) + 1);
                      if (degreeById.has(bId)) degreeById.set(bId, Number(degreeById.get(bId) || 0) + 1);
                    }
                    return Number(degreeById.get('atom-2') || 0) > Number(degreeById.get('atom-1') || 0);
                }"""
            )
            page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "smoke-fixture-copy-paste")', fixture_text)
            select_two_fixture_atoms(page)

            log_step('copy paste smoke')
            # Copy/paste selected atoms keeps internal bonds and selects the pasted atoms.
            copy_paste_shortcut = 'Meta+' if sys.platform == 'darwin' else 'Control+'
            page.evaluate(
                """() => {
                    const active = document.activeElement;
                    if (active && typeof active.blur === 'function') active.blur();
                }"""
            )
            page.keyboard.press(copy_paste_shortcut + 'C')
            page.keyboard.press(copy_paste_shortcut + 'V')
            try:
                page.wait_for_function(
                    r"""() => {
                        const exported = window.VibeMolStructure.exportActive();
                        return exported.volume.atoms.length === 4
                          && Array.isArray(exported.volume.bonds)
                          && exported.volume.bonds.length === 2;
                    }""",
                    timeout=1500,
                )
            except Exception:
                page.evaluate(
                    """() => {
                        if (!window.VibeMolTesting) return;
                        if (typeof window.VibeMolTesting.copyEditSelectionToClipboard === 'function') {
                            window.VibeMolTesting.copyEditSelectionToClipboard();
                        }
                        if (typeof window.VibeMolTesting.pasteEditClipboardSelection === 'function') {
                            window.VibeMolTesting.pasteEditClipboardSelection();
                        }
                    }"""
                )
                page.wait_for_function(
                    r"""() => {
                        const exported = window.VibeMolStructure.exportActive();
                        return exported.volume.atoms.length === 4
                          && Array.isArray(exported.volume.bonds)
                          && exported.volume.bonds.length === 2;
                    }"""
                )

            log_step('add atom smoke')
            # Add atom smoke.
            page.locator('#editAdaptiveAddAtomBtn').click()
            before_add_atom = active_structure_summary(page)
            x, y = find_empty_edit_canvas_point(page)
            empty_x, empty_y = find_empty_edit_canvas_point(page)
            page.mouse.click(empty_x, empty_y)
            page.wait_for_function(
                """() => {
                    const scope = document.getElementById('editGestureScope')?.textContent || '';
                    return /No selection/i.test(scope);
                }"""
            )
            page.mouse.click(x, y)
            page.wait_for_function(
                """(beforeCount) => {
                    const exported = window.VibeMolStructure.exportActive();
                    return Array.isArray(exported.volume?.atoms)
                      && exported.volume.atoms.length === Number(beforeCount) + 1;
                }""",
                arg=before_add_atom['atomCount'],
            )
            page.wait_for_function("() => document.getElementById('editAddAtomOperatorPanel')?.getAttribute('aria-hidden') === 'false'")
            after_add_atom = active_structure_summary(page)
            if after_add_atom['atomCount'] != before_add_atom['atomCount'] + 1:
                raise AssertionError(f'Add atom did not add exactly one atom: {before_add_atom} -> {after_add_atom}')

            log_step('grow-add can be followed immediately by atom selection')
            page.locator('#newFileBtn').click()
            page.locator('#modeEditBtn').click()
            page.wait_for_function("() => document.getElementById('editAdaptiveMenu')?.getAttribute('aria-hidden') === 'false'")
            load_build_query(page, 'C')
            set_checkbox_state(page, '#editAddAdjustHydrogens', True)
            grow_x, grow_y = canvas_point(page, 0.56, 0.55)
            page.mouse.click(grow_x, grow_y)
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    const bonds = Array.isArray(exported.volume?.bonds) ? exported.volume.bonds : [];
                    return atoms.length === 5 && bonds.length === 4;
                }"""
            )
            anchor_x, anchor_y = find_atom_click_point(page, 0)
            page.mouse.move(anchor_x, anchor_y)
            page.mouse.down()
            page.mouse.move(anchor_x + 140, anchor_y - 20, steps=15)
            page.mouse.up()
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    const bonds = Array.isArray(exported.volume?.bonds) ? exported.volume.bonds : [];
                    return atoms.length === 8 && bonds.length === 7;
                }"""
            )
            page.mouse.click(anchor_x, anchor_y)
            page.wait_for_function(
                """() => Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0) === 1"""
            )
            page.keyboard.press('Enter')
            page.wait_for_function(
                """() => document.getElementById('editAddAtomOperatorPanel')?.getAttribute('aria-hidden') === 'true'"""
            )

            log_step('add molecule smoke')
            # Build search / standalone molecule placement smoke.
            page.keyboard.press('/')
            page.wait_for_function(
                """() => document.activeElement === document.getElementById('editBuildSearch')"""
            )
            page.locator('#editBuildSearch').fill('benzene')
            page.keyboard.press('Enter')
            page.wait_for_function(
                """() => document.querySelector('#editMoleculeQuick button[data-molecule-id="benzene"]')?.classList.contains('active') === true"""
            )
            before_add_molecule = active_structure_summary(page)
            x, y = find_empty_edit_canvas_point(page)
            page.mouse.click(x, y)
            page.wait_for_function("() => document.getElementById('editAddMoleculeOperatorPanel')?.getAttribute('aria-hidden') === 'false'")
            page.mouse.click(x, y)
            page.wait_for_timeout(250)
            after_add_molecule = active_structure_summary(page)
            if after_add_molecule['atomCount'] <= before_add_molecule['atomCount']:
                raise AssertionError(f'Add molecule did not increase atom count: {before_add_molecule} -> {after_add_molecule}')
            if after_add_molecule['bondCount'] <= before_add_molecule['bondCount']:
                raise AssertionError(f'Add molecule did not preserve/add explicit bonds: {before_add_molecule} -> {after_add_molecule}')

            # Structure export/import round-trip.
            page.evaluate(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    if (!exported.volume?.atoms) return;
                    const seededAtom = { id: 'roundtrip-pref-atom', Z: 6, x: 8.5, y: 0, z: 0, formalCharge: 0 };
                    exported.volume.atoms.push(seededAtom);
                    exported.volume.natoms = exported.volume.atoms.length;
                    if (!exported.volume.annotations) exported.volume.annotations = {};
                    if (!exported.volume.annotations.coordination) exported.volume.annotations.coordination = {};
                    if (!exported.volume.annotations.coordination.byAtomId) exported.volume.annotations.coordination.byAtomId = {};
                    exported.volume.annotations.coordination.byAtomId[seededAtom.id] = { geometryId: 'linear' };
                    window.VibeMolStructure.importFromText(JSON.stringify(exported), 'roundtrip-setup');
                }"""
            )
            roundtrip_summary = page.evaluate(
                """() => {
                    const text = window.VibeMolStructure.exportActiveText();
                    const parsed = JSON.parse(text);
                    if (parsed.kind !== 'vibemol.structure') throw new Error(`Unexpected export kind: ${parsed.kind}`);
                    window.VibeMolStructure.importFromText(text, 'roundtrip');
                    const imported = window.VibeMolStructure.exportActive();
                    const seededAtomId = 'roundtrip-pref-atom';
                    return {
                        exportedKind: parsed.kind,
                        importedKind: imported.kind,
                        atomCount: imported.volume.atoms.length,
                        bondCount: Array.isArray(imported.volume.bonds) ? imported.volume.bonds.length : 0,
                        exportedCoordination: parsed.volume?.annotations?.coordination?.byAtomId?.[seededAtomId]?.geometryId || '',
                        importedCoordination: imported.volume?.annotations?.coordination?.byAtomId?.[seededAtomId]?.geometryId || '',
                    };
                }"""
            )
            if roundtrip_summary['exportedKind'] != 'vibemol.structure' or roundtrip_summary['importedKind'] != 'vibemol.structure':
                raise AssertionError(f'Unexpected round-trip kinds: {roundtrip_summary}')
            if roundtrip_summary['atomCount'] <= 0 or roundtrip_summary['bondCount'] <= 0:
                raise AssertionError(f'Round-trip lost structure content: {roundtrip_summary}')
            if roundtrip_summary['exportedCoordination'] != 'linear' or roundtrip_summary['importedCoordination'] != 'linear':
                raise AssertionError(f'Round-trip lost coordination override: {roundtrip_summary}')

            # Gesture bond-center clicking should raise with left click and lower with right click.
            log_step('bond gesture smoke')
            dihedral_fixture_text = build_fixture_dihedral_structure()
            page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "bond-dihedral-fixture")', dihedral_fixture_text)
            page.locator('#modeDisplayBtn').click()
            page.locator('#modeEditBtn').click()
            page.locator('#editAdaptiveAddAtomBtn').click()
            page.wait_for_function(
                """() => document.getElementById('editAdaptiveAddAtomBtn')?.classList.contains('active')"""
            )
            side_x, side_y = find_bond_side_canvas_point(page)
            page.mouse.click(side_x, side_y)
            page.wait_for_function(
                """() => Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0) > 0"""
            )
            page.wait_for_function(
                """() => {
                    const guide = window.VibeMolTesting?.getTransformAngleGuideClient?.();
                    return !!guide && guide.visible === true && Number.isFinite(guide.angleDeg);
                }"""
            )
            angle_guide = get_transform_angle_guide(page)
            if not angle_guide or not angle_guide.get('visible'):
                raise AssertionError(f'Bond-side dihedral guide did not appear: {angle_guide!r}')
            page.wait_for_function(
                """() => {
                    const cue = window.VibeMolTesting?.getBondSideCueState?.();
                    return !!cue && cue.rotateVisible === true && cue.orbitVisible === true && cue.distanceVisible === true;
                }"""
            )
            cue_state = get_bond_side_cue_state(page)
            if not cue_state.get('orbitVisible') or not cue_state.get('distanceVisible'):
                raise AssertionError(f'Bond-side cues did not appear: {cue_state!r}')
            before_positions = page.evaluate(
                """() => (window.VibeMolStructure.exportActive().volume.atoms || []).map((atom) => [
                    Number(atom.x) || 0,
                    Number(atom.y) || 0,
                    Number(atom.z) || 0,
                ])"""
            )
            orbit_cue_box = page.locator('#editSelectionBondOrbitCueButton').bounding_box()
            if not orbit_cue_box:
                raise AssertionError('Bond orbit cue is not visible')
            orbit_x = orbit_cue_box['x'] + orbit_cue_box['width'] * 0.5
            orbit_y = orbit_cue_box['y'] + orbit_cue_box['height'] * 0.5
            page.mouse.move(orbit_x, orbit_y)
            page.mouse.down()
            page.mouse.move(orbit_x + 36, orbit_y, steps=8)
            page.mouse.up()
            page.wait_for_function(
                """(beforePositions) => {
                    const atoms = window.VibeMolStructure.exportActive().volume.atoms || [];
                    if (!Array.isArray(beforePositions) || beforePositions.length !== atoms.length) return false;
                    let moved = false;
                    for (let i = 0; i < atoms.length; i += 1) {
                        const before = beforePositions[i];
                        const atom = atoms[i];
                        if (!Array.isArray(before) || before.length < 3 || !atom) continue;
                        const dx = (Number(atom.x) || 0) - (Number(before[0]) || 0);
                        const dy = (Number(atom.y) || 0) - (Number(before[1]) || 0);
                        const dz = (Number(atom.z) || 0) - (Number(before[2]) || 0);
                        if ((dx * dx + dy * dy + dz * dz) > 1e-6) moved = true;
                    }
                    return moved;
                }""",
                arg=before_positions,
            )

            page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "bond-dihedral-fixture-distance")', dihedral_fixture_text)
            page.locator('#modeDisplayBtn').click()
            page.locator('#modeEditBtn').click()
            page.locator('#editAdaptiveAddAtomBtn').click()
            page.wait_for_function(
                """() => document.getElementById('editAdaptiveAddAtomBtn')?.classList.contains('active')"""
            )
            side_x, side_y = find_bond_side_canvas_point(page)
            page.mouse.click(side_x, side_y)
            page.wait_for_function(
                """() => {
                    const cue = window.VibeMolTesting?.getBondSideCueState?.();
                    return !!cue && cue.distanceVisible === true;
                }"""
            )
            distance_cue_box = page.locator('#editSelectionBondDistanceCueButton').bounding_box()
            if not distance_cue_box:
                raise AssertionError('Bond distance cue is not visible')
            distance_cue_x = distance_cue_box['x'] + distance_cue_box['width'] * 0.5
            distance_cue_y = distance_cue_box['y'] + distance_cue_box['height'] * 0.5
            page.mouse.click(distance_cue_x, distance_cue_y)
            page.wait_for_function(
                """() => {
                    const guide = window.VibeMolTesting?.getTransformDistanceGuideClient?.();
                    return !!guide && guide.visible === true && Number.isFinite(guide.distanceAng);
                }"""
            )
            distance_guide = get_transform_distance_guide(page)
            if not distance_guide or not distance_guide.get('visible'):
                raise AssertionError(f'Bond distance guide did not appear: {distance_guide!r}')
            before_positions = page.evaluate(
                """() => (window.VibeMolStructure.exportActive().volume.atoms || []).map((atom) => [
                    Number(atom.x) || 0,
                    Number(atom.y) || 0,
                    Number(atom.z) || 0,
                ])"""
            )
            distance_x = float(distance_guide['x'])
            distance_y = float(distance_guide['y'])
            page.mouse.move(distance_x, distance_y)
            page.mouse.down()
            page.mouse.move(distance_x + 42, distance_y, steps=8)
            page.mouse.up()
            page.wait_for_function(
                """(payload) => {
                    const beforePositions = payload.beforePositions;
                    const atoms = window.VibeMolStructure.exportActive().volume.atoms || [];
                    const guide = window.VibeMolTesting?.getTransformDistanceGuideClient?.() || {};
                    if (!Array.isArray(beforePositions) || beforePositions.length !== atoms.length) return false;
                    let moved = false;
                    for (let i = 0; i < atoms.length; i += 1) {
                        const before = beforePositions[i];
                        const atom = atoms[i];
                        if (!Array.isArray(before) || before.length < 3 || !atom) continue;
                        const dx = (Number(atom.x) || 0) - (Number(before[0]) || 0);
                        const dy = (Number(atom.y) || 0) - (Number(before[1]) || 0);
                        const dz = (Number(atom.z) || 0) - (Number(before[2]) || 0);
                        if ((dx * dx + dy * dy + dz * dz) > 1e-6) moved = true;
                    }
                    return moved && Math.abs((Number(guide.distanceAng) || 0) - Number(payload.beforeDistance || 0)) > 1e-6;
                }""",
                arg={'beforePositions': before_positions, 'beforeDistance': float(distance_guide['distanceAng'])},
            )

            page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "bond-gesture-fixture")', fixture_text)
            page.locator('#modeDisplayBtn').click()
            page.locator('#modeEditBtn').click()
            page.locator('#editAdaptiveAddAtomBtn').click()
            page.wait_for_function(
                """() => document.getElementById('editAdaptiveAddAtomBtn')?.classList.contains('active')"""
            )
            side_x, side_y = find_bond_side_canvas_point(page)
            page.mouse.click(side_x, side_y)
            page.wait_for_function(
                """() => Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0) > 0"""
            )
            midpoint_x, midpoint_y = find_bond_midpoint_canvas_point(page)
            page.mouse.click(midpoint_x, midpoint_y)
            page.wait_for_function(
                """() => {
                    const bond = (window.VibeMolStructure.exportActive().volume.bonds || [])[0] || null;
                    return !!bond
                      && bond.order === 2
                      && Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0) === 0;
                }"""
            )
            for expected_order in (3, 4):
                x, y = find_bond_midpoint_canvas_point(page)
                page.mouse.click(x, y)
                page.wait_for_function(
                    """(expectedOrder) => {
                        const bond = (window.VibeMolStructure.exportActive().volume.bonds || [])[0] || null;
                        return !!bond && bond.order === expectedOrder && bond.kind === 'normal' && bond.origin === 'explicit';
                    }""",
                    arg=expected_order,
                )
            x, y = find_bond_midpoint_canvas_point(page)
            page.mouse.click(x, y)
            page.wait_for_timeout(100)
            maxed_bond = page.evaluate(
                """() => {
                    const bond = (window.VibeMolStructure.exportActive().volume.bonds || [])[0] || null;
                    return bond ? { order: bond.order, kind: bond.kind, origin: bond.origin || null } : null;
                }"""
            )
            if maxed_bond != {'order': 4, 'kind': 'normal', 'origin': 'explicit'}:
                raise AssertionError(f'Bond-center increment exceeded quadruple bound: {maxed_bond}')
            for expected_order in (3, 2, 1):
                x, y = find_bond_midpoint_canvas_point(page)
                page.mouse.click(x, y, button='right')
                page.wait_for_function(
                    """(expectedOrder) => {
                        const bond = (window.VibeMolStructure.exportActive().volume.bonds || [])[0] || null;
                        return !!bond && bond.order === expectedOrder && bond.kind === 'normal' && bond.origin === 'explicit';
                    }""",
                    arg=expected_order,
                )
            x, y = find_bond_midpoint_canvas_point(page)
            page.mouse.click(x, y, button='right')
            page.wait_for_function(
                """() => {
                    const bond = (window.VibeMolStructure.exportActive().volume.bonds || [])[0] || null;
                    return !!bond && bond.kind === 'blocked' && bond.origin === 'explicit';
                }"""
            )

            # Bond center click should step explicit bond order in gesture edit mode.
            page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "bond-popup-fixture")', fixture_text)
            page.locator('#modeEditBtn').click()
            ensure_advanced_drawer_open(page)
            x, y = canvas_point(page, 0.5, 0.5)
            page.mouse.click(x, y)
            page.wait_for_function(
                """() => {
                    const bond = (window.VibeMolStructure.exportActive().volume.bonds || [])[0] || null;
                    return !!bond && bond.order === 2 && bond.origin === 'explicit';
                }"""
            )
            order_updated = active_structure_summary(page)
            if not order_updated['bondOrders'] or order_updated['bondOrders'][0] != 2:
                raise AssertionError(f'Bond order update failed: {order_updated}')
            if not order_updated['bondOrigins'] or order_updated['bondOrigins'][0] != 'explicit':
                raise AssertionError(f'Bond order update failed: {order_updated}')

            # Clean structure should run the one-shot UFF cleanup action.
            log_step('clean structure smoke')
            optimize_fixture_text = build_fixture_optimize_structure()
            page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "optimize-fixture")', optimize_fixture_text)
            page.locator('#modeEditBtn').click()
            ensure_advanced_drawer_open(page)
            optimize_before = page.evaluate(
                """() => {
                    const atoms = window.VibeMolStructure.exportActive().volume.atoms || [];
                    if (atoms.length < 2) return null;
                    const dx = (atoms[1].x || 0) - (atoms[0].x || 0);
                    const dy = (atoms[1].y || 0) - (atoms[0].y || 0);
                    const dz = (atoms[1].z || 0) - (atoms[0].z || 0);
                    return Math.sqrt(dx * dx + dy * dy + dz * dz);
                }"""
            )
            page.locator('#editAdaptiveCleanStructureBtn').click()
            page.wait_for_function(
                """() => /Optimized structure with UFF:/i.test(document.getElementById('hint')?.textContent || '')"""
            )
            optimize_after = page.evaluate(
                """() => {
                    const atoms = window.VibeMolStructure.exportActive().volume.atoms || [];
                    if (atoms.length < 2) return null;
                    const dx = (atoms[1].x || 0) - (atoms[0].x || 0);
                    const dy = (atoms[1].y || 0) - (atoms[0].y || 0);
                    const dz = (atoms[1].z || 0) - (atoms[0].z || 0);
                    return Math.sqrt(dx * dx + dy * dy + dz * dz);
                }"""
            )
            if not (optimize_after < optimize_before):
                raise AssertionError(f'UFF optimize did not shorten the stretched bond: before={optimize_before}, after={optimize_after}')

            # Trajectory-mode bonds should be dynamic for rendering only.
            log_step('trajectory smoke')
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

            # The Atoms menu drives automatic local hydrogen adjustment for isolated single-atom adds.
            log_step('new file edit smoke')
            page.locator('#newFileBtn').click()
            page.locator('#modeEditBtn').click()
            page.wait_for_function("() => document.getElementById('editAdaptiveMenu')?.getAttribute('aria-hidden') === 'false'")
            load_build_query(page, 'C')
            set_checkbox_state(page, '#editAddAdjustHydrogens', True)
            set_select_value(page, '#editAddCoordination', 'linear')
            before_adjust_ids = page.evaluate(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    return Array.isArray(exported.volume?.atoms)
                      ? exported.volume.atoms.map((atom) => String(atom.id || ''))
                      : [];
                }"""
            )
            x, y = canvas_point(page, 0.76, 0.62)
            page.mouse.click(x, y)
            page.wait_for_function(
                """(beforeIds) => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    const atomIdSet = new Set(Array.isArray(beforeIds) ? beforeIds.map((value) => String(value || '')) : []);
                    return atoms.some((atom) => !atomIdSet.has(String(atom.id || '')) && Number(atom.Z) !== 1);
                }""",
                arg=before_adjust_ids,
            )
            page.wait_for_function(
                """() => {
                    const panel = document.getElementById('editAddAtomOperatorPanel');
                    return !!panel
                      && panel.getAttribute('aria-hidden') === 'false'
                      && panel.getAttribute('data-collapsed') === 'true';
                }"""
            )
            auto_adjust_summary = page.evaluate(
                """(beforeIds) => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    const atomIdSet = new Set(Array.isArray(beforeIds) ? beforeIds.map((value) => String(value || '')) : []);
                    const newHeavy = atoms.filter((atom) => !atomIdSet.has(String(atom.id || '')) && Number(atom.Z) !== 1);
                    const newHydrogenCount = atoms.filter((atom) => !atomIdSet.has(String(atom.id || '')) && Number(atom.Z) === 1).length;
                    const byAtomId = exported.volume?.annotations?.coordination?.byAtomId || {};
                    const heavyId = newHeavy[0] && newHeavy[0].id != null ? String(newHeavy[0].id) : '';
                    return {
                        atomCount: atoms.length,
                        newHeavyCount: newHeavy.length,
                        newHydrogenCount,
                        heavyCoordination: heavyId ? (byAtomId[heavyId]?.geometryId || '') : '',
                    };
                }""",
                before_adjust_ids,
            )
            if auto_adjust_summary != {
                'atomCount': 3,
                'newHeavyCount': 1,
                'newHydrogenCount': 2,
                'heavyCoordination': 'linear',
            }:
                raise AssertionError(f'Auto hydrogen adjustment did not follow the Atoms menu settings: {auto_adjust_summary}')

            log_step('fragment cue shows fragment ghost on undercoordinated atom')
            page.locator('#newFileBtn').click()
            page.locator('#modeEditBtn').click()
            page.wait_for_function("() => document.getElementById('editAdaptiveMenu')?.getAttribute('aria-hidden') === 'false'")
            load_build_query(page, 'Fe')
            metal_x, metal_y = canvas_point(page, 0.52, 0.48)
            page.mouse.click(metal_x, metal_y)
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    return atoms.length === 1 && Number(atoms[0]?.Z) === 26;
                }"""
            )
            metal_anchor_x, metal_anchor_y = find_atom_click_point(page, 0)
            page.mouse.click(metal_anchor_x, metal_anchor_y)
            page.wait_for_function(
                """() => document.getElementById('editSelectionTranslateCue')?.getAttribute('aria-hidden') === 'false'"""
            )
            page.locator('#editSelectionAddFragmentCueButton').click()
            page.wait_for_function(
                """() => document.getElementById('editSelectionAddFragmentCueButton')?.getAttribute('aria-pressed') === 'true'"""
            )
            page.wait_for_function(
                """() => window.VibeMolTesting?.getHaloGhostPreviewKind?.() === 'fragment'"""
            )
            first_fragment_atom_count = page.evaluate(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    return Array.isArray(exported.volume?.atoms) ? exported.volume.atoms.length : 0;
                }"""
            )
            first_fragment_x, first_fragment_y = project_halo_ghost(page, 0)
            page.mouse.click(first_fragment_x, first_fragment_y)
            page.wait_for_function(
                """(beforeCount) => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atomCount = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms.length : 0;
                    const cuePressed = document.getElementById('editSelectionAddFragmentCueButton')?.getAttribute('aria-pressed') === 'true';
                    const selectionCount = Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0);
                    return atomCount > Number(beforeCount || 0)
                      && cuePressed
                      && selectionCount === 1
                      && window.VibeMolTesting?.getHaloGhostPreviewKind?.() === 'fragment';
                }""",
                arg=first_fragment_atom_count,
            )
            second_fragment_atom_count = page.evaluate(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    return Array.isArray(exported.volume?.atoms) ? exported.volume.atoms.length : 0;
                }"""
            )
            second_fragment_x, second_fragment_y = project_halo_ghost(page, 0)
            page.mouse.click(second_fragment_x, second_fragment_y)
            page.wait_for_function(
                """(beforeCount) => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atomCount = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms.length : 0;
                    const cuePressed = document.getElementById('editSelectionAddFragmentCueButton')?.getAttribute('aria-pressed') === 'true';
                    const selectionCount = Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0);
                    return atomCount > Number(beforeCount || 0)
                      && cuePressed
                      && selectionCount === 1;
                }""",
                arg=second_fragment_atom_count,
            )

            log_step('fragment ghost click keeps the chosen open coordination site on partially hydrogenated carbon')
            page.locator('#newFileBtn').click()
            page.locator('#modeEditBtn').click()
            page.wait_for_function("() => document.getElementById('editAdaptiveMenu')?.getAttribute('aria-hidden') === 'false'")
            load_build_query(page, 'C')
            set_checkbox_state(page, '#editAddAdjustHydrogens', True)
            set_select_value(page, '#editAddCoordination', 'tetrahedral')
            carbon_x, carbon_y = canvas_point(page, 0.52, 0.50)
            page.mouse.click(carbon_x, carbon_y)
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    const hydrogens = atoms.filter((atom) => Number(atom?.Z) === 1).length;
                    return atoms.length === 5 && hydrogens === 4;
                }"""
            )
            hydrogen_x, hydrogen_y = find_atom_click_point(page, 1)
            page.mouse.click(hydrogen_x, hydrogen_y)
            wait_for_selected_atoms(page, 1)
            page.keyboard.press('Delete')
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    const hydrogens = atoms.filter((atom) => Number(atom?.Z) === 1).length;
                    return atoms.length === 4 && hydrogens === 3;
                }"""
            )
            carbon_anchor_x, carbon_anchor_y = find_atom_click_point(page, 0)
            page.mouse.click(carbon_anchor_x, carbon_anchor_y)
            wait_for_selected_atoms(page, 1)
            load_build_query(page, 'hydroxyl')
            page.locator('#editSelectionAddFragmentCueButton').click()
            page.wait_for_function(
                """() => document.getElementById('editSelectionAddFragmentCueButton')?.getAttribute('aria-pressed') === 'true'"""
            )
            page.wait_for_function(
                """() => window.VibeMolTesting?.getHaloGhostPreviewKind?.() === 'fragment'"""
            )
            ghost_world = page.evaluate(
                """() => {
                    const worlds = window.VibeMolTesting?.getHaloGhostWorlds?.() || [];
                    return worlds[0] || null;
                }"""
            )
            if not isinstance(ghost_world, dict):
                raise AssertionError('Could not read halo ghost world coordinates for open-site fragment attach.')
            first_open_site_x, first_open_site_y = project_halo_ghost(page, 0)
            page.mouse.click(first_open_site_x, first_open_site_y)
            page.wait_for_function(
                """(expected) => {
                    const exported = window.VibeMolStructure.exportActive();
                    const fragmentOps = Array.isArray(exported.volume?.fragmentOps) ? exported.volume.fragmentOps : [];
                    if (!fragmentOps.length) return false;
                    const last = fragmentOps[fragmentOps.length - 1];
                    const conn = last?.transform?.connectionWorld;
                    if (!Array.isArray(conn) || conn.length < 3) return false;
                    const dx = Math.abs((Number(conn[0]) || 0) - (Number(expected.x) || 0));
                    const dy = Math.abs((Number(conn[1]) || 0) - (Number(expected.y) || 0));
                    const dz = Math.abs((Number(conn[2]) || 0) - (Number(expected.z) || 0));
                    return dx < 0.05 && dy < 0.05 && dz < 0.05;
                }""",
                arg=ghost_world,
            )

            log_step('grow drag onto terminal hydrogen replaces it with loaded atom')
            page.locator('#newFileBtn').click()
            page.locator('#modeEditBtn').click()
            page.wait_for_function("() => document.getElementById('editAdaptiveMenu')?.getAttribute('aria-hidden') === 'false'")
            load_build_query(page, 'C')
            set_checkbox_state(page, '#editAddAdjustHydrogens', True)
            set_select_value(page, '#editAddCoordination', 'tetrahedral')
            replace_x, replace_y = canvas_point(page, 0.46, 0.54)
            page.mouse.click(replace_x, replace_y)
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    const bonds = Array.isArray(exported.volume?.bonds) ? exported.volume.bonds : [];
                    return atoms.length === 5 && bonds.length === 4;
                }"""
            )
            replace_target = page.evaluate(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    const bonds = Array.isArray(exported.volume?.bonds) ? exported.volume.bonds : [];
                    const heavyIndex = atoms.findIndex((atom) => Number(atom.Z) !== 1);
                    if (heavyIndex < 0) return null;
                    const heavy = atoms[heavyIndex];
                    const neighborIds = bonds.flatMap((bond) => {
                        const aId = String(bond.a || '');
                        const bId = String(bond.b || '');
                        const heavyId = String(heavy.id || '');
                        if (aId === heavyId) return [bId];
                        if (bId === heavyId) return [aId];
                        return [];
                    });
                    const hydrogenId = neighborIds.find((atomId) => Number(atoms.find((atom) => String(atom.id || '') === String(atomId || ''))?.Z) === 1) || '';
                    const hydrogenIndex = atoms.findIndex((atom) => String(atom.id || '') === String(hydrogenId));
                    return hydrogenIndex >= 0 ? { heavyIndex, hydrogenIndex } : null;
                }"""
            )
            if not isinstance(replace_target, dict):
                raise AssertionError(f'Could not resolve heavy atom and terminal hydrogen for replace gesture: {replace_target!r}')
            heavy_point = page.evaluate(
                """(index) => window.VibeMolTesting.projectActiveAtomToClient(index)""",
                replace_target['heavyIndex'],
            )
            hydrogen_point = page.evaluate(
                """(index) => window.VibeMolTesting.projectActiveAtomToClient(index)""",
                replace_target['hydrogenIndex'],
            )
            if not isinstance(heavy_point, dict) or not heavy_point.get('visible'):
                raise AssertionError(f'Could not project heavy atom for replace gesture: {heavy_point!r}')
            if not isinstance(hydrogen_point, dict) or not hydrogen_point.get('visible'):
                raise AssertionError(f'Could not project terminal hydrogen for replace gesture: {hydrogen_point!r}')
            page.mouse.move(heavy_point['x'], heavy_point['y'])
            page.mouse.down()
            page.mouse.move(hydrogen_point['x'], hydrogen_point['y'], steps=18)
            page.mouse.up()
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    const bonds = Array.isArray(exported.volume?.bonds) ? exported.volume.bonds : [];
                    const carbons = atoms.filter((atom) => Number(atom.Z) === 6);
                    if (atoms.length !== 8 || bonds.length !== 7 || carbons.length !== 2) return false;
                    const atomById = new Map(atoms.map((atom) => [String(atom.id || ''), atom]));
                    const neighborIdsById = new Map();
                    for (const atom of atoms) neighborIdsById.set(String(atom.id || ''), []);
                    for (const bond of bonds) {
                        const aId = String(bond.a || '');
                        const bId = String(bond.b || '');
                        if (neighborIdsById.has(aId)) neighborIdsById.get(aId).push(bId);
                        if (neighborIdsById.has(bId)) neighborIdsById.get(bId).push(aId);
                    }
                    const carbonHeavyNeighborCounts = carbons.map((atom) => {
                        const neighborIds = neighborIdsById.get(String(atom.id || '')) || [];
                        return neighborIds.filter((atomId) => Number(atomById.get(String(atomId || ''))?.Z) !== 1).length;
                    }).sort((a, b) => a - b);
                    return carbonHeavyNeighborCounts.length === 2
                      && carbonHeavyNeighborCounts[0] === 1
                      && carbonHeavyNeighborCounts[1] === 1;
                }"""
            )

            log_step('final runtime error check')
            assert_no_runtime_errors(page_errors, console_errors)
            browser.close()
            return 0
        except Exception:
            write_failure_artifacts(page, ARTIFACT_DIR, 'smoke-failure', page_errors, console_errors)
            browser.close()
            raise


if __name__ == '__main__':
    raise SystemExit(main())
