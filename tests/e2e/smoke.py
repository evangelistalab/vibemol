#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import os
import pathlib
import sys
import time
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


def build_bare_carbon_structure() -> str:
    payload = {
        'kind': 'vibemol.structure',
        'structureVersion': 1,
        'appVersion': 'smoke-test',
        'name': 'bare-carbon.structure.json',
        'meta': {'source': 'test'},
        'volume': {
            'title': 'Bare carbon',
            'comment': 'Single carbon fixture',
            'natoms': 1,
            'origin': [0, 0, 0],
            'nxyz': [0, 0, 0],
            'axes': [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            'atoms': [
                {'id': 'atom-1', 'Z': 6, 'x': 0.0, 'y': 0.0, 'z': 0.0, 'formalCharge': 0},
            ],
            'bonds': [],
            'annotations': {'builder': {'byAtomId': {}}},
            'fragmentOps': [],
            'data': [],
            'units': 'angstrom',
        },
        'recordState': {'measurementLabelOffsets': {}},
    }
    return json.dumps(payload)


def build_methane_structure() -> str:
    payload = {
        'kind': 'vibemol.structure',
        'structureVersion': 1,
        'appVersion': 'smoke-test',
        'name': 'methane.structure.json',
        'meta': {'source': 'test'},
        'volume': {
            'title': 'Methane',
            'comment': 'Explicit methane fixture',
            'natoms': 5,
            'origin': [0, 0, 0],
            'nxyz': [0, 0, 0],
            'axes': [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            'atoms': [
                {'id': 'atom-1', 'Z': 6, 'x': 0.0, 'y': 0.0, 'z': 0.0, 'formalCharge': 0},
                {'id': 'atom-2', 'Z': 1, 'x': 1.09, 'y': 0.0, 'z': 0.0, 'formalCharge': 0},
                {'id': 'atom-3', 'Z': 1, 'x': -0.36, 'y': 1.03, 'z': 0.0, 'formalCharge': 0},
                {'id': 'atom-4', 'Z': 1, 'x': -0.36, 'y': -0.51, 'z': 0.89, 'formalCharge': 0},
                {'id': 'atom-5', 'Z': 1, 'x': -0.36, 'y': -0.51, 'z': -0.89, 'formalCharge': 0},
            ],
            'bonds': [
                {'id': 'bond:atom-1:atom-2', 'a': 'atom-1', 'b': 'atom-2', 'order': 1, 'kind': 'normal', 'origin': 'explicit'},
                {'id': 'bond:atom-1:atom-3', 'a': 'atom-1', 'b': 'atom-3', 'order': 1, 'kind': 'normal', 'origin': 'explicit'},
                {'id': 'bond:atom-1:atom-4', 'a': 'atom-1', 'b': 'atom-4', 'order': 1, 'kind': 'normal', 'origin': 'explicit'},
                {'id': 'bond:atom-1:atom-5', 'a': 'atom-1', 'b': 'atom-5', 'order': 1, 'kind': 'normal', 'origin': 'explicit'},
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


def build_fixture_water_structure() -> str:
    payload = {
        'kind': 'vibemol.structure',
        'structureVersion': 1,
        'appVersion': 'smoke-test',
        'name': 'water-fixture.structure.json',
        'meta': {'source': 'test'},
        'volume': {
            'title': 'Water fixture',
            'comment': 'Explicit water structure for symmetry smoke',
            'natoms': 3,
            'origin': [0, 0, 0],
            'nxyz': [0, 0, 0],
            'axes': [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            'atoms': [
                {'id': 'atom-o', 'Z': 8, 'x': 0.0, 'y': 0.0, 'z': 0.0, 'formalCharge': 0},
                {'id': 'atom-h1', 'Z': 1, 'x': 0.7586, 'y': 0.0, 'z': 0.5043, 'formalCharge': 0},
                {'id': 'atom-h2', 'Z': 1, 'x': -0.7586, 'y': 0.0, 'z': 0.5043, 'formalCharge': 0},
            ],
            'bonds': [
                {'id': 'bond:o:h1', 'a': 'atom-o', 'b': 'atom-h1', 'order': 1, 'kind': 'normal', 'origin': 'explicit'},
                {'id': 'bond:o:h2', 'a': 'atom-o', 'b': 'atom-h2', 'order': 1, 'kind': 'normal', 'origin': 'explicit'},
            ],
            'annotations': {'builder': {'byAtomId': {}}},
            'fragmentOps': [],
            'data': [],
            'units': 'angstrom',
        },
        'recordState': {'measurementLabelOffsets': {}},
    }
    return json.dumps(payload)


def build_fixture_distorted_methane_structure() -> str:
    payload = {
        'kind': 'vibemol.structure',
        'structureVersion': 1,
        'appVersion': 'smoke-test',
        'name': 'distorted-methane-fixture.structure.json',
        'meta': {'source': 'test'},
        'volume': {
            'title': 'Distorted methane fixture',
            'comment': 'Slightly distorted methane for approximate symmetry smoke',
            'natoms': 5,
            'origin': [0, 0, 0],
            'nxyz': [0, 0, 0],
            'axes': [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            'atoms': [
                {'id': 'atom-c', 'Z': 6, 'x': 0.0, 'y': 0.0, 'z': 0.0, 'formalCharge': 0},
                {'id': 'atom-h1', 'Z': 1, 'x': 0.68, 'y': 0.62, 'z': 0.63, 'formalCharge': 0},
                {'id': 'atom-h2', 'Z': 1, 'x': 0.58, 'y': -0.60, 'z': -0.70, 'formalCharge': 0},
                {'id': 'atom-h3', 'Z': 1, 'x': -0.61, 'y': 0.66, 'z': -0.60, 'formalCharge': 0},
                {'id': 'atom-h4', 'Z': 1, 'x': -0.67, 'y': -0.55, 'z': 0.73, 'formalCharge': 0},
            ],
            'bonds': [
                {'id': 'bond:c:h1', 'a': 'atom-c', 'b': 'atom-h1', 'order': 1, 'kind': 'normal', 'origin': 'explicit'},
                {'id': 'bond:c:h2', 'a': 'atom-c', 'b': 'atom-h2', 'order': 1, 'kind': 'normal', 'origin': 'explicit'},
                {'id': 'bond:c:h3', 'a': 'atom-c', 'b': 'atom-h3', 'order': 1, 'kind': 'normal', 'origin': 'explicit'},
                {'id': 'bond:c:h4', 'a': 'atom-c', 'b': 'atom-h4', 'order': 1, 'kind': 'normal', 'origin': 'explicit'},
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


def build_fixture_vibration_payload() -> str:
    payload = {
        'kind': 'vibemol.vibrations',
        'version': 1,
        'units': 'angstrom',
        'atomCount': 2,
        'atomSymbols': ['C', 'C'],
        'modes': [
            {
                'label': 'Symmetric stretch',
                'frequencyCm1': 245.0,
                'displacements': [
                    -0.18, 0.0, 0.0,
                    0.18, 0.0, 0.0,
                ],
            },
        ],
    }
    return json.dumps(payload)


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
        'Sym= A1',
        'Ene= -0.1',
        'Spin= Alpha',
        'Occup= 0.0',
        '1 1.0',
        'Sym= A1',
        'Ene= 0.8',
        'Spin= Beta',
        'Occup= 0.0',
        '1 -1.0',
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


def active_atom_positions(page) -> list[list[float]]:
    result = page.evaluate(
        """() => {
            const exported = window.VibeMolStructure.exportActive();
            const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
            return atoms.map((atom) => [
              Number(atom.x) || 0,
              Number(atom.y) || 0,
              Number(atom.z) || 0,
            ]);
        }"""
    )
    if not isinstance(result, list):
        raise AssertionError(f'Could not export active atom positions: {result!r}')
    return result


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


def install_trajectory_video_export_stubs(page, *, media_recorder_supported: bool = True) -> None:
    page.evaluate(
        """(supported) => {
            const state = {
              downloads: [],
              createdUrls: [],
              recorderStarts: 0,
              recorderStops: 0,
              captureCalls: [],
            };
            window.__trajectoryVideoExportTest = state;
            URL.createObjectURL = (blob) => {
              const href = `blob:trajectory-test-${state.createdUrls.length + 1}`;
              state.createdUrls.push({
                href,
                size: Number(blob && blob.size) || 0,
                type: String(blob && blob.type || ''),
              });
              return href;
            };
            URL.revokeObjectURL = () => {};
            HTMLAnchorElement.prototype.click = function clickStub() {
              state.downloads.push({
                href: String(this.href || ''),
                download: String(this.download || ''),
              });
            };
            HTMLCanvasElement.prototype.captureStream = function captureStreamStub(fps) {
              state.captureCalls.push({
                width: Number(this.width) || 0,
                height: Number(this.height) || 0,
                fps: Number(fps) || 0,
              });
              return { fps: Number(fps) || 0, canvas: this };
            };
            if (!supported) {
              window.MediaRecorder = undefined;
              return;
            }
            class FakeMediaRecorder {
              constructor(stream, options = {}) {
                this.stream = stream;
                this.mimeType = String(options && options.mimeType || 'video/webm');
                this.state = 'inactive';
                this.ondataavailable = null;
                this.onstop = null;
                this.onerror = null;
              }

              start() {
                this.state = 'recording';
                state.recorderStarts += 1;
              }

              stop() {
                if (this.state === 'inactive') return;
                this.state = 'inactive';
                state.recorderStops += 1;
                const blob = new Blob([`trajectory-${state.recorderStops}`], { type: this.mimeType || 'video/webm' });
                if (typeof this.ondataavailable === 'function') this.ondataavailable({ data: blob });
                if (typeof this.onstop === 'function') this.onstop();
              }

              static isTypeSupported(type) {
                return /^video\\/webm/.test(String(type || ''));
              }
            }
            window.MediaRecorder = FakeMediaRecorder;
        }""",
        media_recorder_supported,
    )


def get_trajectory_video_export_stub_state(page) -> dict[str, Any]:
    result = page.evaluate("""() => window.__trajectoryVideoExportTest || null""")
    if not isinstance(result, dict):
        raise AssertionError(f'Could not read trajectory-video stub state: {result!r}')
    return result


def canvas_point(page, fx: float = 0.62, fy: float = 0.56) -> tuple[float, float]:
    box = page.locator('#canvas').bounding_box()
    if not box:
        raise RuntimeError('Canvas bounding box is unavailable.')
    return (box['x'] + box['width'] * fx, box['y'] + box['height'] * fy)


def get_projected_active_bond(page) -> dict[str, Any] | None:
    result = page.evaluate(
        """() => {
            if (!window.VibeMolTesting || typeof window.VibeMolTesting.projectActiveAtomToClient !== 'function') return null;
            const exported = window.VibeMolStructure?.exportActive?.();
            const atoms = Array.isArray(exported?.volume?.atoms) ? exported.volume.atoms : [];
            const bonds = Array.isArray(exported?.volume?.bonds) ? exported.volume.bonds : [];
            const idToIndex = new Map();
            atoms.forEach((atom, index) => {
                const id = String(atom?.id || '');
                if (id) idToIndex.set(id, index);
            });
            function resolveAtomIndex(value) {
                if (Number.isInteger(value) && value >= 0 && value < atoms.length) return value;
                const numeric = Number(value);
                if (Number.isInteger(numeric) && numeric >= 0 && numeric < atoms.length) return numeric;
                return idToIndex.has(String(value || '')) ? idToIndex.get(String(value || '')) : -1;
            }
            const bond = bonds.find((candidate) => candidate && String(candidate.kind || 'normal') !== 'blocked') || null;
            if (!bond) return null;
            const aIndex = resolveAtomIndex(bond.a ?? bond.i ?? bond.atomA ?? bond.from);
            const bIndex = resolveAtomIndex(bond.b ?? bond.j ?? bond.atomB ?? bond.to);
            if (aIndex < 0 || bIndex < 0) return null;
            const a = window.VibeMolTesting.projectActiveAtomToClient(aIndex);
            const b = window.VibeMolTesting.projectActiveAtomToClient(bIndex);
            if (!a || !b || !a.visible || !b.visible) return null;
            return {
                a: { x: Number(a.x) || 0, y: Number(a.y) || 0 },
                b: { x: Number(b.x) || 0, y: Number(b.y) || 0 },
            };
        }"""
    )
    return result if isinstance(result, dict) else None


def build_projected_bond_candidates(page, fractions: list[float]) -> list[tuple[float, float]]:
    projected = get_projected_active_bond(page)
    candidates: list[tuple[float, float]] = []
    if isinstance(projected, dict) and isinstance(projected.get('a'), dict) and isinstance(projected.get('b'), dict):
        ax = float(projected['a']['x'])
        ay = float(projected['a']['y'])
        bx = float(projected['b']['x'])
        by = float(projected['b']['y'])
        dx = bx - ax
        dy = by - ay
        length = max(1.0, math.hypot(dx, dy))
        nx = -dy / length
        ny = dx / length
        offsets = (0.0, 6.0, -6.0, 12.0, -12.0, 20.0, -20.0, 30.0, -30.0, 42.0, -42.0, 56.0, -56.0)
        for t in fractions:
            px = ax + dx * t
            py = ay + dy * t
            for off in offsets:
                candidates.append((px + nx * off, py + ny * off))
    return candidates


def find_bond_midpoint_canvas_point(page) -> tuple[float, float]:
    direct_candidates = build_projected_bond_candidates(page, [0.50, 0.44, 0.56, 0.38, 0.62, 0.34, 0.66])
    for x, y in direct_candidates:
        page.mouse.move(x, y)
        page.wait_for_timeout(60)
        hit = page.evaluate(
            """(payload) => {
                if (!window.VibeMolTesting || typeof window.VibeMolTesting.pickEditHitAtClient !== 'function') return null;
                return window.VibeMolTesting.pickEditHitAtClient(payload.x, payload.y);
            }""",
            {'x': x, 'y': y},
        )
        if isinstance(hit, dict) and str(hit.get('bondSection', '')).strip().lower() == 'center':
            return x, y
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
    raise AssertionError('Could not locate a bond midpoint hover target on the canvas')


def find_bond_side_canvas_point(page, side: str | None = None) -> tuple[float, float]:
    desired = str(side or '').strip().lower()
    direct_candidates = build_projected_bond_candidates(page, [0.18, 0.82, 0.24, 0.76, 0.30, 0.70])
    for x, y in direct_candidates:
        page.mouse.move(x, y)
        page.wait_for_timeout(60)
        probe = page.evaluate(
            """(payload) => {
                if (!window.VibeMolTesting || typeof window.VibeMolTesting.pickEditHitAtClient !== 'function') return null;
                const hit = window.VibeMolTesting.pickEditHitAtClient(payload.x, payload.y);
                return hit && hit.bondSection ? String(hit.bondSection) : '';
            }""",
            {'x': x, 'y': y},
        )
        section = str(probe or '').strip().lower()
        if not section or section == 'center':
            continue
        if desired and section != desired:
            continue
        return x, y
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
        probe = page.evaluate(
            """(payload) => {
                if (!window.VibeMolTesting || typeof window.VibeMolTesting.pickEditHitAtClient !== 'function') return null;
                const hit = window.VibeMolTesting.pickEditHitAtClient(payload.x, payload.y);
                const top = document.elementFromPoint(payload.x, payload.y);
                const onCanvas = !!(top && (top.id === 'canvas' || (typeof top.closest === 'function' && top.closest('#canvas'))));
                return { hit, onCanvas };
            }""",
            {'x': x, 'y': y},
        )
        if not isinstance(probe, dict):
            continue
        if not bool(probe.get('onCanvas')):
            continue
        hit = probe.get('hit')
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
    page.wait_for_function("() => { const menu = document.getElementById('displayWindowAdaptiveMenu'); return menu?.getAttribute('aria-hidden') === 'false' && menu?.dataset.mode === 'edit'; }")


def ensure_advanced_drawer_closed(page) -> None:
    page.wait_for_function("() => { const menu = document.getElementById('displayWindowAdaptiveMenu'); return menu?.getAttribute('aria-hidden') === 'false' && menu?.dataset.mode === 'edit'; }")


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


def get_bond_center_cue_state(page) -> dict[str, int | bool]:
    result = page.evaluate(
        """() => {
            if (!window.VibeMolTesting || typeof window.VibeMolTesting.getBondCenterCueState !== 'function') return null;
            return window.VibeMolTesting.getBondCenterCueState();
        }"""
    )
    if not isinstance(result, dict):
        raise AssertionError(f'Unexpected bond-center cue state: {result!r}')
    return result


def drag_bond_order_cue_to(page, target_order: int) -> None:
    state = get_bond_center_cue_state(page)
    if not state.get('visible'):
        raise AssertionError(f'Bond-center cue is not visible: {state!r}')
    current_order = int(state.get('order', -1))
    if current_order == target_order:
        return
    cue_box = page.locator('#editSelectionBondOrderCueButton').bounding_box()
    if not cue_box:
        raise AssertionError('Bond-order cue is not visible')
    cue_x = cue_box['x'] + cue_box['width'] * 0.5
    cue_y = cue_box['y'] + cue_box['height'] * 0.5
    delta_x = (int(target_order) - current_order) * 26
    page.mouse.move(cue_x, cue_y)
    page.mouse.down()
    page.mouse.move(cue_x + delta_x, cue_y, steps=8)
    page.mouse.up()
    page.wait_for_function(
        """(expectedOrder) => {
            const state = window.VibeMolTesting?.getBondCenterCueState?.();
            return !!state && state.visible === true && Number(state.order) === Number(expectedOrder);
        }""",
        arg=int(target_order),
    )


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
        probe = page.evaluate(
            """(payload) => {
                if (!window.VibeMolTesting || typeof window.VibeMolTesting.pickEditHitAtClient !== 'function') return null;
                const hit = window.VibeMolTesting.pickEditHitAtClient(payload.x, payload.y);
                const top = document.elementFromPoint(payload.x, payload.y);
                const onCanvas = !!(top && (top.id === 'canvas' || (typeof top.closest === 'function' && top.closest('#canvas'))));
                return { hit, onCanvas };
            }""",
            {'x': x, 'y': y},
        )
        if not isinstance(probe, dict):
            continue
        hit = probe.get('hit')
        if not bool(probe.get('onCanvas')):
            continue
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


def max_camera_snapshot_delta(a: dict[str, Any], b: dict[str, Any]) -> float:
    values_a = [
        float(a.get('camera', {}).get('x', 0.0)),
        float(a.get('camera', {}).get('y', 0.0)),
        float(a.get('camera', {}).get('z', 0.0)),
        float(a.get('target', {}).get('x', 0.0)),
        float(a.get('target', {}).get('y', 0.0)),
        float(a.get('target', {}).get('z', 0.0)),
        float(a.get('up', {}).get('x', 0.0)),
        float(a.get('up', {}).get('y', 0.0)),
        float(a.get('up', {}).get('z', 0.0)),
    ]
    values_b = [
        float(b.get('camera', {}).get('x', 0.0)),
        float(b.get('camera', {}).get('y', 0.0)),
        float(b.get('camera', {}).get('z', 0.0)),
        float(b.get('target', {}).get('x', 0.0)),
        float(b.get('target', {}).get('y', 0.0)),
        float(b.get('target', {}).get('z', 0.0)),
        float(b.get('up', {}).get('x', 0.0)),
        float(b.get('up', {}).get('y', 0.0)),
        float(b.get('up', {}).get('z', 0.0)),
    ]
    return max(abs(x - y) for x, y in zip(values_a, values_b))


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
    ensure_build_popover_open(page, focus_search=True)
    page.locator('#editBuildSearch').fill(query)
    page.keyboard.press('Enter')


def get_hint_text(page) -> str:
    value = page.evaluate("""() => String(window.VibeMolTesting?.getHintMessage?.() || '')""")
    return value if isinstance(value, str) else ''


def wait_for_hint_contains(page, snippet: str) -> None:
    page.wait_for_function(
        """(text) => String(window.VibeMolTesting?.getHintMessage?.() || '').includes(String(text || ''))""",
        arg=snippet,
    )


def wait_for_clickable(page, selector: str, timeout: int = 30000) -> None:
    deadline = time.monotonic() + (max(0, int(timeout)) / 1000.0)
    last_error = None
    locator = page.locator(selector)
    while time.monotonic() < deadline:
        try:
            locator.click(trial=True, timeout=1000)
            return
        except Exception as exc:  # Playwright raises actionability errors until the control can receive events.
            last_error = exc
            page.wait_for_timeout(100)
    raise AssertionError(f'Control did not become clickable: {selector}: {last_error}')


def click_when_ready(page, selector: str, timeout: int = 30000) -> None:
    wait_for_clickable(page, selector, timeout=timeout)
    page.locator(selector).click()


def set_focused_scene_visible(page, visible: bool) -> None:
    ok = page.evaluate(
        """(visible) => {
            const snap = window.VibeMolTesting?.getSceneGraphSnapshot?.();
            const sceneId = String(snap?.focusedSceneId || '');
            const scene = (snap?.scenes || []).find((item) => String(item.id || '') === sceneId);
            if (!scene) return false;
            if (!!scene.visible === !!visible) return true;
            const row = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
              .find((candidate) => String(candidate.dataset.id || '') === sceneId);
            const eye = row?.querySelector('.vm-outliner-row__eye');
            if (!eye) return false;
            eye.click();
            return true;
        }""",
        visible,
    )
    if not ok:
        raise AssertionError(f'Could not set focused scene visibility to {visible!r}')
    page.wait_for_function(
        """(visible) => {
            const snap = window.VibeMolTesting?.getSceneGraphSnapshot?.();
            const scene = (snap?.scenes || []).find((item) => String(item.id || '') === String(snap?.focusedSceneId || ''));
            return !!scene && !!scene.visible === !!visible;
        }""",
        arg=visible,
    )


def start_new_edit_file(page) -> None:
    page.wait_for_function(
        """() => {
            const button = document.getElementById('newFileBtn');
            return button?.getAttribute('aria-label') === 'Create new molecule'
              && button?.dataset.tooltip === 'Create new molecule';
        }"""
    )
    page.locator('#newFileBtn').click()
    page.wait_for_function(
        """() => {
            const menu = document.getElementById('displayWindowAdaptiveMenu');
            const snap = window.VibeMolTesting?.getSceneGraphSnapshot?.();
            const scene = (snap?.scenes || []).find((item) => String(item.id || '') === String(snap?.focusedSceneId || ''));
            const layers = Array.isArray(scene?.layers) ? scene.layers : [];
            return menu?.getAttribute('aria-hidden') === 'false'
              && menu?.dataset.mode === 'edit'
              && !!scene
              && scene.visible === true
              && layers.some((layer) => layer.kind === 'molecule' && layer.name === 'Molecule')
              && layers.some((layer) => layer.kind === 'orbitals_group');
        }"""
    )


def build_bare_carbon(page) -> None:
    page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "fragment-attach-bare-carbon")', build_bare_carbon_structure())
    page.wait_for_function(
        """() => {
            const exported = window.VibeMolStructure.exportActive();
            const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
            return atoms.length === 1 && Number(atoms[0]?.Z) === 6;
        }"""
    )
    set_focused_scene_visible(page, True)


def build_methane(page) -> None:
    page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "fragment-attach-methane")', build_methane_structure())
    page.wait_for_function(
        """() => {
            const exported = window.VibeMolStructure.exportActive();
            const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
            const hydrogens = atoms.filter((atom) => Number(atom?.Z) === 1).length;
            const carbons = atoms.filter((atom) => Number(atom?.Z) === 6).length;
            return atoms.length === 5 && hydrogens === 4 && carbons === 1;
        }"""
    )
    set_focused_scene_visible(page, True)


def arm_fragment_attach_cue(page, atom_index: int = 0) -> None:
    atom_x, atom_y = find_atom_click_point(page, atom_index)
    right_click_atom(page, atom_x, atom_y)
    wait_for_selected_atoms(page, 1)
    page.locator('#editSelectionAddFragmentCueButton').click()
    page.wait_for_function(
        """() => document.getElementById('editSelectionAddFragmentCueButton')?.getAttribute('aria-pressed') === 'true'"""
    )


def trigger_replace_target(page, atom_index: int) -> dict:
    result = page.evaluate(
        """(targetAtomIndex) => {
            if (!window.VibeMolTesting || typeof window.VibeMolTesting.triggerHaloReplaceTargetByAtomIndex !== 'function') return null;
            return window.VibeMolTesting.triggerHaloReplaceTargetByAtomIndex(targetAtomIndex);
        }""",
        atom_index,
    )
    if not isinstance(result, dict) or not bool(result.get('attached')):
        raise AssertionError(f'Could not trigger replace-target fragment attach: {result!r}')
    return result


def attach_fragment_from_anchor(page, anchor_index: int, offset: dict | None = None) -> dict:
    payload = offset or {'x': 1.5, 'y': 0.0, 'z': 0.0}
    result = page.evaluate(
        """(data) => {
            if (!window.VibeMolTesting || typeof window.VibeMolTesting.attachFragmentFromAnchorIndex !== 'function') return null;
            return window.VibeMolTesting.attachFragmentFromAnchorIndex(data.anchorIndex, data.offset || null);
        }""",
        {'anchorIndex': anchor_index, 'offset': payload},
    )
    if not isinstance(result, dict) or not bool(result.get('attached')):
        raise AssertionError(f'Could not attach fragment from anchor {anchor_index}: {result!r}')
    return result


def replace_terminal_hydrogen_from_anchor(page, anchor_index: int, hydrogen_index: int) -> dict:
    result = page.evaluate(
        """(data) => {
            if (!window.VibeMolTesting || typeof window.VibeMolTesting.replaceGestureTerminalHydrogen !== 'function') return null;
            return window.VibeMolTesting.replaceGestureTerminalHydrogen(data.anchorIndex, data.hydrogenIndex);
        }""",
        {'anchorIndex': anchor_index, 'hydrogenIndex': hydrogen_index},
    )
    if not isinstance(result, dict) or not bool(result.get('attached')):
        raise AssertionError(f'Could not replace terminal hydrogen from anchor {anchor_index}: {result!r}')
    return result


def ensure_build_popover_open(page, *, focus_search: bool = False) -> None:
    page.wait_for_function("""() => !!document.getElementById('editAdaptiveAddAtomPopover')""")
    is_open = page.evaluate(
        """() => document.getElementById('editAdaptiveAddAtomPopover')?.getAttribute('aria-hidden') === 'false'"""
    )
    if not is_open:
        can_click_button = page.evaluate(
            """() => {
                const btn = document.getElementById('editAdaptiveAddAtomBtn');
                return !!btn && !btn.hidden && getComputedStyle(btn).display !== 'none';
            }"""
        )
        if can_click_button:
            click_when_ready(page, '#editAdaptiveAddAtomBtn')
        else:
            page.keyboard.press('/')
        page.wait_for_function(
            """() => document.getElementById('editAdaptiveAddAtomPopover')?.getAttribute('aria-hidden') === 'false'"""
        )
    if focus_search:
        page.evaluate(
            """() => {
                const input = document.getElementById('editBuildSearch');
                if (input && typeof input.focus === 'function') input.focus();
            }"""
        )
        page.wait_for_function(
            """() => document.activeElement === document.getElementById('editBuildSearch')"""
        )


def ensure_build_popover_closed(page) -> None:
    page.wait_for_function("""() => !!document.getElementById('editAdaptiveAddAtomPopover')""")
    is_open = page.evaluate(
        """() => document.getElementById('editAdaptiveAddAtomPopover')?.getAttribute('aria-hidden') === 'false'"""
    )
    if is_open:
        page.evaluate(
            """() => {
                const btn = document.getElementById('editAdaptiveAddAtomBtn');
                if (btn && typeof btn.click === 'function') btn.click();
            }"""
        )
        page.wait_for_function(
            """() => document.getElementById('editAdaptiveAddAtomPopover')?.getAttribute('aria-hidden') === 'true'"""
        )


def trigger_selection_tool(page) -> None:
    page.evaluate(
        """() => {
            const active = document.activeElement;
            if (active && typeof active.blur === 'function') active.blur();
        }"""
    )


def right_click_atom(page, x: float, y: float, additive: bool = False) -> None:
    hit = page.evaluate(
        """(payload) => {
            if (!window.VibeMolTesting || typeof window.VibeMolTesting.pickEditHitAtClient !== 'function') return null;
            return window.VibeMolTesting.pickEditHitAtClient(payload.x, payload.y);
        }""",
        {'x': x, 'y': y},
    )
    hit_atom_index = int(hit.get('atomIndex', -1)) if isinstance(hit, dict) else -1
    before_selection = page.evaluate(
        """() => {
            if (!window.VibeMolTesting || typeof window.VibeMolTesting.getEditSelectionIndices !== 'function') return [];
            const indices = window.VibeMolTesting.getEditSelectionIndices();
            return Array.isArray(indices) ? indices.slice() : [];
        }"""
    )
    if additive:
        page.keyboard.down('Shift')
    try:
        page.mouse.click(x, y, button='right')
    finally:
        if additive:
            page.keyboard.up('Shift')
    if hit_atom_index < 0:
        return
    try:
        page.wait_for_function(
            """(payload) => {
                const indices = Array.isArray(window.VibeMolTesting?.getEditSelectionIndices?.())
                  ? window.VibeMolTesting.getEditSelectionIndices()
                  : [];
                const target = Number(payload.atomIndex);
                if (!payload.additive) return indices.length === 1 && indices[0] === target;
                return indices.includes(target);
            }""",
            arg={'atomIndex': hit_atom_index, 'additive': bool(additive)},
            timeout=600,
        )
    except Exception:
        merged = []
        if additive and isinstance(before_selection, list):
            merged = sorted({int(value) for value in before_selection if isinstance(value, (int, float))} | {hit_atom_index})
        else:
            merged = [hit_atom_index]
        page.evaluate(
            """(indices) => {
                if (!window.VibeMolTesting || typeof window.VibeMolTesting.setEditSelectionIndices !== 'function') return null;
                return window.VibeMolTesting.setEditSelectionIndices(indices);
            }""",
            merged,
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
        page.evaluate(
            """() => {
                if (!window.VibeMolTesting || typeof window.VibeMolTesting.setEditSelectionIndices !== 'function') return null;
                return window.VibeMolTesting.setEditSelectionIndices([]);
            }"""
        )
        page.wait_for_function(
            """() => {
                if (!window.VibeMolTesting || typeof window.VibeMolTesting.getEditSelectionCount !== 'function') return false;
                return window.VibeMolTesting.getEditSelectionCount() === 0;
            }"""
        )

    def _select_one(candidates: list[tuple[float, float]]) -> bool:
        for x, y in candidates:
            right_click_atom(page, x, y)
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
        direct_left = page.evaluate(
            """() => {
                if (!window.VibeMolTesting || typeof window.VibeMolTesting.setEditSelectionIndices !== 'function') return null;
                return window.VibeMolTesting.setEditSelectionIndices([0]);
            }"""
        )
        if not (isinstance(direct_left, dict) and int(direct_left.get('count', -1)) == 1):
            raise AssertionError('Could not select the left atom in the deterministic two-atom fixture.')
        wait_for_selected_atoms(page, 1)

    for x, y in right_candidates:
        right_click_atom(page, x, y, additive=True)
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


def load_text_asset(page, asset_path: str) -> str:
    return page.evaluate(
        """async (path) => {
            const response = await fetch(path);
            if (!response.ok) throw new Error(`Failed to fetch ${path}: ${response.status}`);
            return await response.text();
        }""",
        asset_path,
    )


def load_volume_asset(page, asset_path: str) -> None:
    text = load_text_asset(page, asset_path)
    name = pathlib.Path(asset_path).name
    page.evaluate(
        """async (payload) => {
            await window.VibeMolEmbed.loadFiles([{ name: payload.name, text: payload.text }]);
        }""",
        {'name': name, 'text': text},
    )
    page.wait_for_function(
        """(expectedName) => {
            const labels = Array.from(document.querySelectorAll('.vm-outliner-row__label'))
              .map((el) => (el.textContent || '').trim());
            return !document.getElementById('fileSelect')
              && !document.querySelector('.vm-active-file')
              && labels.some((label) => label === expectedName || label.endsWith(expectedName));
        }""",
        arg=name,
    )


def drop_volume_assets(page, asset_paths: list[str]) -> None:
    payloads = [
        {'name': pathlib.Path(path).name, 'text': load_text_asset(page, path)}
        for path in asset_paths
    ]
    drop_text_files(page, payloads)


def drop_text_files(page, payloads: list[dict[str, str]]) -> None:
    page.evaluate(
        """async (payloads) => {
            const target = document.getElementById('drop');
            if (!target) throw new Error('Drop target missing');
            const dt = new DataTransfer();
            for (const payload of payloads) {
                dt.items.add(new File([payload.text], payload.name, { type: 'text/plain' }));
            }
            target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
            target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        }""",
        payloads,
    )


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
            page.wait_for_function(
                """() => {
                    const title = document.querySelector('#sceneOutliner .vm-outliner__title');
                    const empty = document.querySelector('#sceneOutlinerBody .vm-outliner__empty');
                    return !!title
                      && (title.textContent || '').trim() === 'Scenes'
                      && !!empty
                      && /No file loaded\\. Drag and drop a \\.cube, \\.molden, or \\.xyz file, or click the open icon above to begin\\./.test(empty.textContent || '')
                      && !document.querySelector('.vm-active-file')
                      && !document.getElementById('fileSelect');
                }"""
            )

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
            page.wait_for_function(
                """() => {
                    const toolbar = document.getElementById('toolbar');
                    const emptyCard = document.getElementById('emptyStateCard');
                    const displayBtn = document.getElementById('modeDisplayBtn');
                    if (!toolbar || !emptyCard || !displayBtn) return false;
                    const toolbarStyle = getComputedStyle(toolbar);
                    const emptyCardStyle = getComputedStyle(emptyCard);
                    const displayBtnStyle = getComputedStyle(displayBtn);
                    return toolbarStyle.backgroundColor === 'rgb(238, 241, 245)'
                      && emptyCardStyle.backgroundColor === 'rgb(255, 255, 255)'
                      && emptyCardStyle.boxShadow !== 'none'
                      && displayBtnStyle.backgroundColor === 'rgb(255, 255, 255)';
                }"""
            )

            # Gesture-first edit mode keeps the adaptive menu and add popover as the primary affordances.
            log_step('initial edit mode and adaptive menu')
            page.locator('#modeEditBtn').click()
            page.wait_for_function("() => { const menu = document.getElementById('displayWindowAdaptiveMenu'); return menu?.getAttribute('aria-hidden') === 'false' && menu?.dataset.mode === 'edit'; }")
            ensure_build_popover_open(page)
            page.locator('#modeDisplayBtn').click()
            page.wait_for_function(
                """() => {
                    const popover = document.getElementById('editAdaptiveAddAtomPopover');
                    const displayBtn = document.getElementById('modeDisplayBtn');
                    return popover?.getAttribute('aria-hidden') === 'true'
                      && displayBtn?.getAttribute('aria-pressed') === 'true';
                }"""
            )
            page.locator('#modeEditBtn').click()
            page.wait_for_function("() => { const menu = document.getElementById('displayWindowAdaptiveMenu'); return menu?.getAttribute('aria-hidden') === 'false' && menu?.dataset.mode === 'edit'; }")
            ensure_build_popover_open(page)
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
            page.wait_for_function(
                """() => document.activeElement !== document.getElementById('editBuildSearch')"""
            )
            page.keyboard.press('s')
            page.wait_for_function(
                """() => {
                    return document.getElementById('editAdaptiveAddAtomPopover')?.getAttribute('aria-hidden') === 'true'
                      && document.getElementById('editAdaptiveSymmetryPopover')?.getAttribute('aria-hidden') === 'false';
                }"""
            )
            page.keyboard.press('Escape')
            page.wait_for_function(
                """() => document.getElementById('editAdaptiveSymmetryPopover')?.getAttribute('aria-hidden') === 'true'"""
            )
            ensure_build_popover_open(page)
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
                    const labelOf = (id) => {
                        const el = document.getElementById(id);
                        const label = el ? el.querySelector('.adaptiveEditItemLabel') : null;
                        return label ? (label.textContent || '').trim() : '';
                    };
                    const keyOf = (id) => {
                        const el = document.getElementById(id);
                        const key = el ? el.querySelector('.adaptiveShortcutKey') : null;
                        return key ? (key.textContent || '').trim() : '';
                    };
                    return {
                        build: isShown('editAdaptiveAddAtomBtn'),
                        bondOrder: isShown('editAdaptiveSymmetryBtn'),
                        toggleH: isShown('editAdaptiveCleanStructureBtn'),
                        shiftCom: isShown('editAdaptiveShiftComBtn'),
                        alignPrincipal: isShown('editAdaptiveAlignPrincipalBtn'),
                        buildLabel: labelOf('editAdaptiveAddAtomBtn'),
                        bondOrderLabel: labelOf('editAdaptiveSymmetryBtn'),
                        toggleHLabel: labelOf('editAdaptiveCleanStructureBtn'),
                        buildKey: keyOf('editAdaptiveAddAtomBtn'),
                        bondOrderKey: keyOf('editAdaptiveSymmetryBtn'),
                        toggleHKey: keyOf('editAdaptiveCleanStructureBtn'),
                    };
                }"""
            )
            if empty_edit_visibility != {
                'build': True,
                'bondOrder': True,
                'toggleH': True,
                'shiftCom': False,
                'alignPrincipal': False,
                'buildLabel': 'Elements',
                'bondOrderLabel': 'Bond order',
                'toggleHLabel': 'Toggle H',
                'buildKey': '/',
                'bondOrderKey': '1-4',
                'toggleHKey': 'Space',
            }:
                raise AssertionError(f'Unexpected build adaptive menu state: {empty_edit_visibility}')

            # Gesture void-click places one carbon, but the first placed atom should not stay selected.
            x, y = canvas_point(page)
            page.mouse.click(x, y)
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    return !!exported
                      && Array.isArray(exported.volume?.atoms)
                      && exported.volume.atoms.length === 1
                      && Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0) === 0;
                }"""
            )

            # Idle hover should surface the atom halo, and selecting the atom should keep it visible.
            page.mouse.move(x, y)
            page.wait_for_timeout(360)
            select_x, select_y = find_atom_click_point(page, 0)
            right_click_atom(page, select_x, select_y)
            page.wait_for_function(
                """() => Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0) === 1"""
            )
            page.wait_for_function(
                """() => {
                    const cue = document.getElementById('editSelectionCoordinationCueButton');
                    return !!cue && cue.hidden === false;
                }"""
            )

            # The Atoms menu stays responsible for element choice.
            ensure_build_popover_open(page)
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
                    return atom0Id
                      && byAtomId[atom0Id]
                      && byAtomId[atom0Id].geometryId === 'linear';
                }"""
            )

            # Clicking a cue-enabled halo ghost should grow chemistry from the selected atom in 3D.
            page.locator('#editSelectionAddFragmentCueButton').click()
            page.wait_for_function(
                """() => document.getElementById('editSelectionAddFragmentCueButton')?.getAttribute('aria-pressed') === 'true'"""
            )
            page.wait_for_function(
                """() => (window.VibeMolTesting?.getHaloGhostWorlds?.().length || 0) > 0"""
            )
            grow_x, grow_y = project_halo_ghost(page, 0)
            page.mouse.click(grow_x, grow_y)
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const bonds = Array.isArray(exported.volume?.bonds) ? exported.volume.bonds : [];
                    const atom0 = exported.volume?.atoms?.[0] || null;
                    const atom0Id = atom0 && atom0.id != null ? String(atom0.id) : '';
                    const geometryId = atom0Id ? exported.volume?.annotations?.coordination?.byAtomId?.[atom0Id]?.geometryId : '';
                    const cuePressed = document.getElementById('editSelectionAddFragmentCueButton')?.getAttribute('aria-pressed') === 'true';
                    const selectionCount = Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0);
                    return exported.volume.atoms.length === 2
                      && exported.volume.atoms[1]?.Z === 7
                      && bonds.length === 1
                      && bonds[0].order === 1
                      && cuePressed
                      && selectionCount === 1
                      && geometryId === 'linear';
                }"""
            )
            page.mouse.move(x, y)
            page.wait_for_timeout(360)
            atom1_x, atom1_y = project_active_atom(page, 0)

            page.mouse.move(grow_x, grow_y)
            page.wait_for_timeout(360)
            atom2_x, atom2_y = project_active_atom(page, 1)

            right_click_atom(page, atom1_x, atom1_y)
            try:
                page.wait_for_function(
                    """() => Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0) === 1""",
                    timeout=750,
                )
            except Exception:
                direct_selected = page.evaluate(
                    """() => {
                        if (!window.VibeMolTesting || typeof window.VibeMolTesting.setEditSelectionIndices !== 'function') return null;
                        return window.VibeMolTesting.setEditSelectionIndices([0]);
                    }"""
                )
                if not (isinstance(direct_selected, dict) and int(direct_selected.get('count', -1)) == 1):
                    raise
            page.wait_for_function(
                """() => Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0) === 1"""
            )
            move_probe = page.evaluate(
                """(payload) => {
                    if (!window.VibeMolTesting || typeof window.VibeMolTesting.performSelectionMoveDrag !== 'function') return null;
                    return window.VibeMolTesting.performSelectionMoveDrag(
                      payload.atomIndex,
                      payload.startX,
                      payload.startY,
                      payload.endX,
                      payload.endY,
                    );
                }""",
                {
                    'atomIndex': 0,
                    'startX': atom1_x,
                    'startY': atom1_y,
                    'endX': atom1_x - 28,
                    'endY': atom1_y - 18,
                },
            )
            if not isinstance(move_probe, dict):
                raise AssertionError(f'Could not probe selection move drag: {move_probe!r}')
            if not bool(move_probe.get('started')):
                raise AssertionError(f'Selection move drag did not start: {move_probe!r}')
            if int(move_probe.get('movedCount', -1)) != 1:
                raise AssertionError(f'Selection move drag moved the wrong scope: {move_probe!r}')
            page.mouse.click(x, y)
            page.mouse.dblclick(x, y)

            # After the first atom exists, the advanced drawer should expose atom-dependent tools.
            ensure_advanced_drawer_open(page)
            ensure_build_popover_closed(page)
            page.wait_for_function(
                """() => {
                    const isShown = (id) => {
                      const el = document.getElementById(id);
                      return !!el && !el.hidden && getComputedStyle(el).display !== 'none';
                    };
                    const labelOf = (id) => {
                      const el = document.getElementById(id);
                      const label = el ? el.querySelector('.adaptiveEditItemLabel') : null;
                      return label ? (label.textContent || '').trim() : '';
                    };
                    return isShown('editAdaptiveSymmetryBtn')
                      && isShown('editAdaptiveCleanStructureBtn')
                      && isShown('editAdaptiveShiftComBtn')
                      && isShown('editAdaptiveAlignPrincipalBtn')
                      && isShown('editAdaptiveAddAtomBtn')
                      && labelOf('editAdaptiveAddAtomBtn') === 'Build'
                      && labelOf('editAdaptiveSymmetryBtn') === 'Symmetry'
                      && labelOf('editAdaptiveCleanStructureBtn') === 'Optimize'
                      && labelOf('editAdaptiveShiftComBtn') === 'COM → Origin'
                      && labelOf('editAdaptiveAlignPrincipalBtn') === 'Align';
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
                    return atoms.length === 0 && Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0) === 0;
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
            page.locator('#clearBtn').click()
            page.wait_for_function(
                """() => {
                    const splash = document.getElementById('emptyState');
                    const displayBtn = document.getElementById('modeDisplayBtn');
                    const build = document.getElementById('editAdaptiveAddAtomPopover');
                    const snap = window.VibeMolTesting?.getSceneGraphSnapshot?.();
                    const empty = document.querySelector('#sceneOutlinerBody .vm-outliner__empty');
                    return !!splash
                      && !splash.classList.contains('hidden')
                      && displayBtn?.getAttribute('aria-pressed') === 'true'
                      && build?.getAttribute('aria-hidden') === 'true'
                      && Array.isArray(snap?.scenes)
                      && snap.scenes.length === 0
                      && !!empty
                      && /No file loaded\\./.test(empty.textContent || '');
                }"""
            )

            # Multi-file drag/drop from empty state should preserve all cubes and show only the first.
            drop_volume_assets(page, [
                '/assets/data/methane/canonical_1.cube',
                '/assets/data/methane/canonical_2.cube',
                '/assets/data/methane/canonical_3.cube',
            ])
            page.wait_for_function(
                """() => {
                    const rows = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row')).map((row) => ({
                      depth: row.dataset.depth || '',
                      label: (row.querySelector('.vm-outliner-row__label')?.textContent || '').trim(),
                      active: row.classList.contains('is-active'),
                      hidden: row.classList.contains('is-hidden'),
                    }));
                    const cubes = rows.filter((row) => /^L\\d+/.test(row.label));
                    return cubes.length === 3
                      && cubes.map((row) => row.label.replace(/\\s+/g, '')).join('|') === 'L0canonical_1.cube|L1canonical_2.cube|L2canonical_3.cube'
                      && cubes[0].active === true
                      && cubes[0].hidden === false
                      && cubes[1].hidden === true
                      && cubes[2].hidden === true;
                }"""
            )
            page.locator('#clearBtn').click()
            page.wait_for_function(
                """() => {
                    const splash = document.getElementById('emptyState');
                    return !!splash && !splash.classList.contains('hidden');
                }"""
            )

            # Methane bundled cube set should be one scene with one Orbitals group and 8 cube layers.
            page.locator('#emptyStateMethaneBtn').click()
            page.wait_for_function(
                """() => {
                    const rows = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row')).map((row) => ({
                      depth: row.dataset.depth || '',
                      label: (row.querySelector('.vm-outliner-row__label')?.textContent || '').trim(),
                      meta: (row.querySelector('.vm-outliner-row__meta')?.textContent || '').trim(),
                      active: row.classList.contains('is-active'),
                      hidden: row.classList.contains('is-hidden'),
                    }));
                    const orbitals = rows.filter((row) => row.label === 'Orbitals');
                    const cubes = rows.filter((row) => /^L\\d+/.test(row.label));
                    const cubeLabels = cubes.map((row) => row.label.replace(/\\s+/g, ''));
                    return rows.length === 11
                      && rows[0].depth === '0'
                      && /canonical_1\\.cube$/.test(rows[0].label)
                      && rows[1].depth === '1'
                      && rows[1].label === 'Molecule'
                      && orbitals.length === 1
                      && orbitals[0].depth === '1'
                      && orbitals[0].meta === '8 layers'
                      && cubes.length === 8
                      && cubes.every((row) => row.depth === '2')
                      && cubeLabels.join('|') === 'L0canonical_1.cube|L1canonical_2.cube|L2canonical_3.cube|L3canonical_4.cube|L4localized_1.cube|L5localized_2.cube|L6localized_3.cube|L7localized_4.cube'
                      && cubes[0].active === true
                      && cubes[0].hidden === false
                      && cubes.slice(1).every((row) => row.hidden === true);
                }"""
            )
            page.keyboard.press('ArrowDown')
            page.wait_for_function(
                """() => {
                    const cubes = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .map((row) => ({
                        label: (row.querySelector('.vm-outliner-row__label')?.textContent || '').trim().replace(/\\s+/g, ''),
                        active: row.classList.contains('is-active'),
                        hidden: row.classList.contains('is-hidden'),
                      }))
                      .filter((row) => /^L\\d+/.test(row.label));
                    return cubes[0].label === 'L0canonical_1.cube'
                      && cubes[1].label === 'L1canonical_2.cube'
                      && cubes[0].hidden === true
                      && cubes[1].active === true
                      && cubes[1].hidden === false
                      && cubes.filter((row) => !row.hidden).length === 1;
                }"""
            )
            for _ in range(7):
                page.keyboard.press('ArrowDown')
            page.wait_for_function(
                """() => {
                    const cubes = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .map((row) => ({
                        label: (row.querySelector('.vm-outliner-row__label')?.textContent || '').trim().replace(/\\s+/g, ''),
                        active: row.classList.contains('is-active'),
                        hidden: row.classList.contains('is-hidden'),
                      }))
                      .filter((row) => /^L\\d+/.test(row.label));
                    return cubes[0].label === 'L0canonical_1.cube'
                      && cubes[0].active === true
                      && cubes[0].hidden === false
                      && cubes.filter((row) => !row.hidden).length === 1;
                }"""
            )
            page.keyboard.press('ArrowUp')
            page.wait_for_function(
                """() => {
                    const cubes = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .map((row) => ({
                        label: (row.querySelector('.vm-outliner-row__label')?.textContent || '').trim().replace(/\\s+/g, ''),
                        active: row.classList.contains('is-active'),
                        hidden: row.classList.contains('is-hidden'),
                      }))
                      .filter((row) => /^L\\d+/.test(row.label));
                    return cubes[7].label === 'L7localized_4.cube'
                      && cubes[7].active === true
                      && cubes[7].hidden === false
                      && cubes.filter((row) => !row.hidden).length === 1;
                }"""
            )
            for _ in range(1):
                page.keyboard.press('ArrowDown')
            page.wait_for_function(
                """() => {
                    const cubes = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .map((row) => ({
                        label: (row.querySelector('.vm-outliner-row__label')?.textContent || '').trim().replace(/\\s+/g, ''),
                        active: row.classList.contains('is-active'),
                        hidden: row.classList.contains('is-hidden'),
                      }))
                      .filter((row) => /^L\\d+/.test(row.label));
                    return cubes[0].active === true && cubes[0].hidden === false && cubes.filter((row) => !row.hidden).length === 1;
                }"""
            )
            page.evaluate(
                """() => {
                    const row = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .find((candidate) => /^L2\\s+/.test(candidate.querySelector('.vm-outliner-row__label')?.textContent || ''));
                    row?.querySelector('.vm-outliner-row__eye')?.click();
                }"""
            )
            page.wait_for_function(
                """() => {
                    const cubes = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .map((row) => ({
                        label: (row.querySelector('.vm-outliner-row__label')?.textContent || '').trim().replace(/\\s+/g, ''),
                        active: row.classList.contains('is-active'),
                        hidden: row.classList.contains('is-hidden'),
                      }))
                      .filter((row) => /^L\\d+/.test(row.label));
                    return cubes[0].active === true
                      && cubes[0].hidden === false
                      && cubes[2].hidden === false
                      && cubes.filter((row) => !row.hidden).length === 2;
                }"""
            )
            page.keyboard.press('ArrowDown')
            page.wait_for_function(
                """() => {
                    const cubes = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .map((row) => ({
                        label: (row.querySelector('.vm-outliner-row__label')?.textContent || '').trim().replace(/\\s+/g, ''),
                        active: row.classList.contains('is-active'),
                        hidden: row.classList.contains('is-hidden'),
                      }))
                      .filter((row) => /^L\\d+/.test(row.label));
                    return cubes[1].active === true
                      && cubes[1].hidden === true
                      && cubes[0].hidden === false
                      && cubes[2].hidden === false
                      && cubes.filter((row) => !row.hidden).length === 2;
                }"""
            )
            page.evaluate(
                """() => {
                    const row = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .find((candidate) => /^L2\\s+/.test(candidate.querySelector('.vm-outliner-row__label')?.textContent || ''));
                    row?.querySelector('.vm-outliner-row__eye')?.click();
                }"""
            )
            page.keyboard.press('ArrowDown')
            page.wait_for_function(
                """() => {
                    const cubes = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .map((row) => ({
                        label: (row.querySelector('.vm-outliner-row__label')?.textContent || '').trim().replace(/\\s+/g, ''),
                        active: row.classList.contains('is-active'),
                        hidden: row.classList.contains('is-hidden'),
                      }))
                      .filter((row) => /^L\\d+/.test(row.label));
                    return cubes[1].active === true
                      && cubes[1].hidden === false
                      && cubes.filter((row) => !row.hidden).length === 1;
                }"""
            )
            page.evaluate(
                """() => {
                    const row = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .find((candidate) => (candidate.querySelector('.vm-outliner-row__label')?.textContent || '').trim() === 'Orbitals');
                    row?.querySelector('.vm-outliner-row__eye')?.click();
                }"""
            )
            page.wait_for_function(
                """() => {
                    const rows = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row')).map((row) => ({
                      label: (row.querySelector('.vm-outliner-row__label')?.textContent || '').trim(),
                      hidden: row.classList.contains('is-hidden'),
                    }));
                    const molecule = rows.find((row) => row.label === 'Molecule');
                    const cubes = rows.filter((row) => /^L\\d+/.test(row.label));
                    return molecule && molecule.hidden === false && cubes.length === 8 && cubes.every((row) => row.hidden === true);
                }"""
            )
            page.evaluate(
                """() => {
                    const row = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .find((candidate) => (candidate.querySelector('.vm-outliner-row__label')?.textContent || '').trim() === 'Orbitals');
                    row?.querySelector('.vm-outliner-row__eye')?.click();
                }"""
            )
            page.wait_for_function(
                """() => {
                    const cubes = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .map((row) => ({
                        label: (row.querySelector('.vm-outliner-row__label')?.textContent || '').trim().replace(/\\s+/g, ''),
                        active: row.classList.contains('is-active'),
                        hidden: row.classList.contains('is-hidden'),
                      }))
                      .filter((row) => /^L\\d+/.test(row.label));
                    return cubes[1].active === true && cubes[1].hidden === false && cubes.filter((row) => !row.hidden).length === 1;
                }"""
            )
            page.evaluate(
                """() => {
                    const row = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .find((candidate) => /^L3\\s+/.test(candidate.querySelector('.vm-outliner-row__label')?.textContent || ''));
                    const rect = row?.getBoundingClientRect();
                    if (!row || !rect) return;
                    row.dispatchEvent(new MouseEvent('contextmenu', {
                      bubbles: true,
                      cancelable: true,
                      button: 2,
                      clientX: rect.left + 24,
                      clientY: rect.top + 12,
                    }));
                }"""
            )
            page.wait_for_function("() => document.querySelector('.vm-outliner-context-menu[aria-hidden=\"false\"]')")
            page.evaluate(
                """() => {
                    Array.from(document.querySelectorAll('.vm-outliner-context-menu__item'))
                      .find((button) => (button.textContent || '').trim() === 'Duplicate')
                      ?.click();
                }"""
            )
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getSceneGraphSnapshot?.();
                    const cubes = (snap?.scenes?.[0]?.layers || []).filter((layer) => layer.kind === 'cube');
                    return cubes.length === 9 && cubes.some((cube) => cube.labelId === 'L8' && /copy/.test(cube.name || ''));
                }"""
            )
            page.evaluate(
                """() => {
                    const row = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .find((candidate) => /^L8\\s+/.test(candidate.querySelector('.vm-outliner-row__label')?.textContent || ''));
                    row?.querySelector('.vm-outliner-row__label')?.dispatchEvent(new MouseEvent('dblclick', {
                      bubbles: true,
                      cancelable: true,
                    }));
                }"""
            )
            page.wait_for_selector('.vm-outliner-row__rename-input')
            page.locator('.vm-outliner-row__rename-input').fill('canonical_4_duplicate_with_a_deliberately_long_name_for_outliner_overflow_testing.cube')
            page.keyboard.press('Enter')
            page.wait_for_function(
                """() => {
                    const body = document.getElementById('sceneOutlinerBody');
                    const row = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .find((candidate) => /^L8\\s+/.test(candidate.querySelector('.vm-outliner-row__label')?.textContent || ''));
                    if (!body || !row) return false;
                    const label = row.querySelector('.vm-outliner-row__label');
                    return /overflow_testing\\.cube$/.test(label?.textContent || '')
                      && body.scrollWidth <= body.clientWidth + 1;
                }"""
            )
            page.evaluate(
                """() => {
                    const sceneRow = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .find((candidate) => candidate.dataset.depth === '0');
                    sceneRow?.querySelector('.vm-outliner-row__eye')?.click();
                }"""
            )
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getSceneGraphSnapshot?.();
                    const scene = snap?.scenes?.[0];
                    const visibleCube = (scene?.layers || []).find((layer) => layer.kind === 'cube' && layer.visible === true);
                    if (!scene || scene.visible !== false || !visibleCube || visibleCube.effectiveVisible !== false) return false;
                    const row = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .find((candidate) => String(candidate.dataset.id || '') === String(visibleCube.id || ''));
                    const eye = row?.querySelector('.vm-outliner-row__eye');
                    return !!row
                      && row.classList.contains('is-hidden-inherited')
                      && row.classList.contains('is-hidden')
                      && eye?.classList.contains('is-inherited-hidden')
                      && eye?.textContent === 'visibility_off'
                      && eye?.getAttribute('aria-label') === 'Hidden by parent';
                }"""
            )
            page.evaluate(
                """() => {
                    const sceneRow = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .find((candidate) => candidate.dataset.depth === '0');
                    sceneRow?.querySelector('.vm-outliner-row__eye')?.click();
                }"""
            )
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getSceneGraphSnapshot?.();
                    const scene = snap?.scenes?.[0];
                    const visibleCube = (scene?.layers || []).find((layer) => layer.kind === 'cube' && layer.visible === true);
                    if (!scene || scene.visible !== true || !visibleCube || visibleCube.effectiveVisible !== true) return false;
                    const row = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .find((candidate) => String(candidate.dataset.id || '') === String(visibleCube.id || ''));
                    const eye = row?.querySelector('.vm-outliner-row__eye');
                    return !!row
                      && !row.classList.contains('is-hidden-inherited')
                      && eye?.textContent === 'visibility'
                      && eye?.getAttribute('aria-label') === 'Hide';
                }"""
            )
            page.locator('#clearBtn').click()
            page.wait_for_function(
                """() => {
                    const splash = document.getElementById('emptyState');
                    const empty = document.querySelector('#sceneOutlinerBody .vm-outliner__empty');
                    return !!splash
                      && !splash.classList.contains('hidden')
                      && !!empty
                      && /No file loaded\\./.test(empty.textContent || '');
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
            page.wait_for_function(
                """() => {
                    const rows = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row')).map((row) => ({
                      depth: row.dataset.depth || '',
                      label: (row.querySelector('.vm-outliner-row__label')?.textContent || '').trim(),
                      meta: (row.querySelector('.vm-outliner-row__meta')?.textContent || '').trim(),
                    }));
                    return rows.length === 4
                      && rows[0].depth === '0'
                      && rows[0].label === 'sample.cube'
                      && rows[1].depth === '1'
                      && rows[1].label === 'Molecule'
                      && /^\\d+ atoms?$/.test(rows[1].meta)
                      && rows[2].depth === '1'
                      && rows[2].label === 'Orbitals'
                      && rows[2].meta === '1 layer'
                      && rows[3].depth === '2'
                      && rows[3].label.startsWith('L0')
                      && rows[3].label.endsWith('sample.cube')
                      && /^iso\\s+/.test(rows[3].meta);
                }"""
            )
            page.evaluate(
                """() => {
                    const row = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .find((candidate) => /^L0\\s+sample\\.cube$/.test((candidate.querySelector('.vm-outliner-row__label')?.textContent || '').trim()));
                    const rect = row?.getBoundingClientRect();
                    if (!row || !rect) return;
                    row.dispatchEvent(new MouseEvent('contextmenu', {
                      bubbles: true,
                      cancelable: true,
                      button: 2,
                      clientX: rect.left + 24,
                      clientY: rect.top + 12,
                    }));
                }"""
            )
            page.wait_for_function("() => document.querySelector('.vm-outliner-context-menu[aria-hidden=\"false\"]')")
            page.evaluate(
                """() => {
                    Array.from(document.querySelectorAll('.vm-outliner-context-menu__item'))
                      .find((button) => (button.textContent || '').trim() === 'Duplicate')
                      ?.click();
                }"""
            )
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getSceneGraphSnapshot?.();
                    const scene = snap?.scenes?.[0];
                    const cubes = (scene?.layers || []).filter((layer) => layer.kind === 'cube');
                    return cubes.length === 2
                      && cubes[0].labelId === 'L0'
                      && cubes[0].name === 'sample.cube'
                      && cubes[0].visible === false
                      && cubes[1].labelId === 'L1'
                      && cubes[1].name === 'sample.cube (copy)'
                      && cubes[1].visible === true
                      && cubes[1].isSceneGraphDuplicate === true
                      && scene.activeLayerId === cubes[1].id;
                }"""
            )
            page.locator('#iso').evaluate(
                """(el) => {
                    el.value = '0.07';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getSceneGraphSnapshot?.();
                    const cubes = (snap?.scenes?.[0]?.layers || []).filter((layer) => layer.kind === 'cube');
                    return cubes.length === 2
                      && Math.abs(Number(cubes[0].iso) - 0.02) < 1e-5
                      && Math.abs(Number(cubes[1].iso) - 0.07) < 1e-5;
                }"""
            )
            page.evaluate(
                """() => {
                    const row = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .find((candidate) => /^L0\\s+/.test(candidate.querySelector('.vm-outliner-row__label')?.textContent || ''));
                    row?.click();
                }"""
            )
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getSceneGraphSnapshot?.();
                    const scene = snap?.scenes?.[0];
                    const cubes = (scene?.layers || []).filter((layer) => layer.kind === 'cube');
                    return cubes.length === 2
                      && scene.activeLayerId === cubes[0].id
                      && cubes[0].visible === true
                      && cubes[1].visible === false
                      && Math.abs(Number(document.getElementById('iso')?.value || 0) - 0.02) < 1e-5;
                }"""
            )
            page.evaluate(
                """() => {
                    const row = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .find((candidate) => /^L1\\s+/.test(candidate.querySelector('.vm-outliner-row__label')?.textContent || ''));
                    row?.click();
                }"""
            )
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getSceneGraphSnapshot?.();
                    const scene = snap?.scenes?.[0];
                    const cubes = (scene?.layers || []).filter((layer) => layer.kind === 'cube');
                    return cubes.length === 2
                      && scene.activeLayerId === cubes[1].id
                      && cubes[0].visible === false
                      && cubes[1].visible === true
                      && Math.abs(Number(document.getElementById('iso')?.value || 0) - 0.07) < 1e-5;
                }"""
            )
            page.evaluate(
                """() => {
                    const row = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .find((candidate) => /^L0\\s+/.test(candidate.querySelector('.vm-outliner-row__label')?.textContent || ''));
                    row?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
                }"""
            )
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getSceneGraphSnapshot?.();
                    const selected = snap?.selectedLayerIds || [];
                    const rows = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'));
                    const selectedRows = rows.filter((row) => row.classList.contains('is-selected'));
                    const activeRows = rows.filter((row) => row.classList.contains('is-active'));
                    return selected.length === 2
                      && selectedRows.length === 2
                      && activeRows.length === 1
                      && (document.getElementById('iso')?.value || '') === '—';
                }"""
            )
            page.evaluate(
                """() => {
                    const row = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .find((candidate) => /^L1\\s+/.test(candidate.querySelector('.vm-outliner-row__label')?.textContent || ''));
                    row?.click();
                }"""
            )
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getSceneGraphSnapshot?.();
                    return (snap?.selectedLayerIds || []).length === 1
                      && Math.abs(Number(document.getElementById('iso')?.value || 0) - 0.07) < 1e-5;
                }"""
            )
            page.evaluate(
                """() => {
                    const row = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .find((candidate) => /^L0\\s+/.test(candidate.querySelector('.vm-outliner-row__label')?.textContent || ''));
                    row?.querySelector('.vm-outliner-row__eye')?.click();
                }"""
            )
            page.locator('#surfaceSignFlipBtn').evaluate(
                """(el) => {
                    el.checked = true;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getSceneGraphSnapshot?.();
                    const scene = snap?.scenes?.[0];
                    const cubes = (scene?.layers || []).filter((layer) => layer.kind === 'cube');
                    return cubes.length === 2
                      && cubes[0].visible === true
                      && cubes[1].visible === true
                      && cubes[0].signFlip === false
                      && cubes[1].signFlip === true;
                }"""
            )
            page.evaluate(
                """() => {
                    const row = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .find((candidate) => /^L0\\s+sample\\.cube$/.test((candidate.querySelector('.vm-outliner-row__label')?.textContent || '').trim()));
                    const rect = row?.getBoundingClientRect();
                    if (!row || !rect) return;
                    row.dispatchEvent(new MouseEvent('contextmenu', {
                      bubbles: true,
                      cancelable: true,
                      button: 2,
                      clientX: rect.left + 24,
                      clientY: rect.top + 12,
                    }));
                }"""
            )
            page.wait_for_function("() => document.querySelector('.vm-outliner-context-menu[aria-hidden=\"false\"]')")
            page.evaluate(
                """() => {
                    Array.from(document.querySelectorAll('.vm-outliner-context-menu__item'))
                      .find((button) => (button.textContent || '').trim() === 'Delete')
                      ?.click();
                    Array.from(document.querySelectorAll('.vm-outliner-context-menu__button'))
                      .find((button) => (button.textContent || '').trim() === 'Delete')
                      ?.click();
                }"""
            )
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getSceneGraphSnapshot?.();
                    const cubes = (snap?.scenes?.[0]?.layers || []).filter((layer) => layer.kind === 'cube');
                    return cubes.length === 1 && cubes[0].labelId === 'L1' && cubes[0].visible === true;
                }"""
            )
            page.locator('#clearBtn').click()
            page.wait_for_function(
                """() => {
                    const splash = document.getElementById('emptyState');
                    return !!splash && !splash.classList.contains('hidden');
                }"""
            )
            page.locator('#emptyStateSampleBtn').click()
            page.wait_for_function(
                """() => {
                    const rows = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row')).map((row) => ({
                      depth: row.dataset.depth || '',
                      label: (row.querySelector('.vm-outliner-row__label')?.textContent || '').trim(),
                    }));
                    return rows.length === 4
                      && rows[0].depth === '0'
                      && rows[0].label === 'sample.cube'
                      && rows[3].depth === '2'
                      && rows[3].label.endsWith('sample.cube');
                }"""
            )
            page.evaluate("() => document.getElementById('emptyStateMethaneBtn')?.click()")
            page.wait_for_function(
                """() => {
                    const rows = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .map((row) => ({
                        depth: row.dataset.depth || '',
                        label: (row.querySelector('.vm-outliner-row__label')?.textContent || '').trim().replace(/\\s+/g, ''),
                        active: row.classList.contains('is-active'),
                        hidden: row.classList.contains('is-hidden'),
                      }));
                    const scenes = rows.filter((row) => row.depth === '0');
                    const cubes = rows.filter((row) => /^L\\d+/.test(row.label));
                    const methaneCubes = cubes.filter((row) => /canonical_|localized_/.test(row.label));
                    return scenes.length === 2
                      && scenes[0].label === 'sample.cube'
                      && scenes[0].hidden === true
                      && scenes[1].label === 'canonical_1.cube'
                      && scenes[1].hidden === false
                      && cubes.length === 9
                      && cubes[0].label === 'L0sample.cube'
                      && cubes[0].hidden === true
                      && methaneCubes.length === 8
                      && methaneCubes[0].label === 'L0canonical_1.cube'
                      && methaneCubes[0].active === true
                      && methaneCubes[0].hidden === false
                      && methaneCubes.slice(1).every((row) => row.hidden === true);
                }"""
            )
            page.locator('#clearBtn').click()
            page.wait_for_function(
                """() => {
                    const splash = document.getElementById('emptyState');
                    return !!splash && !splash.classList.contains('hidden');
                }"""
            )
            page.locator('#emptyStateSampleBtn').click()
            page.wait_for_function(
                """() => {
                    const rows = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row')).map((row) => ({
                      depth: row.dataset.depth || '',
                      label: (row.querySelector('.vm-outliner-row__label')?.textContent || '').trim(),
                    }));
                    return rows.length === 4
                      && rows[0].depth === '0'
                      && rows[0].label === 'sample.cube'
                      && rows[3].depth === '2'
                      && rows[3].label.endsWith('sample.cube');
                }"""
            )
            drop_volume_assets(page, ['/assets/data/methane/canonical_1.cube'])
            page.wait_for_function(
                """() => {
                    const rows = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .map((row) => ({
                        depth: row.dataset.depth || '',
                        label: (row.querySelector('.vm-outliner-row__label')?.textContent || '').trim().replace(/\\s+/g, ''),
                        active: row.classList.contains('is-active'),
                        hidden: row.classList.contains('is-hidden'),
                      }));
                    const scenes = rows.filter((row) => row.depth === '0');
                    const cubes = rows.filter((row) => /^L\\d+/.test(row.label));
                    return scenes.length === 2
                      && scenes[0].label === 'sample.cube'
                      && scenes[0].hidden === true
                      && scenes[1].label === 'canonical_1.cube'
                      && scenes[1].hidden === false
                      && cubes.length === 2
                      && cubes[0].label === 'L0sample.cube'
                      && cubes[1].label === 'L0canonical_1.cube'
                      && cubes[0].hidden === true
                      && cubes[1].active === true
                      && cubes[1].hidden === false;
                }"""
            )

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
            page.wait_for_function(
                """() => {
                    const canvas = document.getElementById('canvas');
                    if (!(canvas instanceof HTMLCanvasElement)) return false;
                    const probe = document.createElement('canvas');
                    probe.width = 1;
                    probe.height = 1;
                    const ctx = probe.getContext('2d');
                    if (!ctx) return false;
                    const sx = Math.max(0, Math.floor(canvas.width * 0.05));
                    const sy = Math.max(0, Math.floor(canvas.height * 0.05));
                    ctx.drawImage(canvas, sx, sy, 1, 1, 0, 0, 1, 1);
                    const data = ctx.getImageData(0, 0, 1, 1).data;
                    const values = [data[0] / 255, data[1] / 255, data[2] / 255];
                    return Math.min(...values) > 0.1
                      && Math.min(...values) < 0.3
                      && Math.max(...values) > 0.1
                      && Math.max(...values) < 0.3;
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
            page.wait_for_function(
                """() => {
                    const canvas = document.getElementById('canvas');
                    if (!(canvas instanceof HTMLCanvasElement)) return false;
                    const probe = document.createElement('canvas');
                    probe.width = 1;
                    probe.height = 1;
                    const ctx = probe.getContext('2d');
                    if (!ctx) return false;
                    const sx = Math.max(0, Math.floor(canvas.width * 0.05));
                    const sy = Math.max(0, Math.floor(canvas.height * 0.05));
                    ctx.drawImage(canvas, sx, sy, 1, 1, 0, 0, 1, 1);
                    const data = ctx.getImageData(0, 0, 1, 1).data;
                    return data[0] / 255 > 0.9
                      && data[1] / 255 > 0.9
                      && data[2] / 255 > 0.9;
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
            page.keyboard.press('o')
            page.wait_for_function(
                """() => {
                    const panel = document.getElementById('moldenInspector');
                    const table = document.querySelector('#moldenInspectorBody table');
                    const headers = table
                      ? Array.from(table.querySelectorAll('thead th')).map((el) => (el.textContent || '').trim())
                      : [];
                    const summary = document.getElementById('moldenGridSummary');
                    return !!panel
                      && panel.classList.contains('open')
                      && !!table
                      && headers.join('|') == '#|Energy|Occ|Sym|Spin'
                      && !!summary
                      && (summary.textContent || '').trim().length > 0;
                }"""
            )
            molden_summary = page.evaluate(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const rows = Array.from(document.querySelectorAll('#moldenInspectorBody tbody tr[data-row-index]'));
                    const visibleRows = rows.filter((row) => getComputedStyle(row).display !== 'none');
                    return {
                        kind: exported.kind,
                        volumeKind: exported.volume && exported.volume.kind,
                        atomCount: exported.volume && Array.isArray(exported.volume.atoms) ? exported.volume.atoms.length : 0,
                        nxyz: exported.volume && Array.isArray(exported.volume.nxyz) ? exported.volume.nxyz.slice() : [],
                        dataLength: exported.volume && Array.isArray(exported.volume.data) ? exported.volume.data.length : 0,
                        gridSummary: (document.getElementById('moldenGridSummary')?.textContent || '').trim(),
                        footer: (document.getElementById('moldenInspectorFooter')?.textContent || '').trim(),
                        rowCount: rows.length,
                        visibleRowCount: visibleRows.length,
                        dividerText: Array.from(document.querySelectorAll('#moldenInspectorBody tbody tr.vm-list-popover__divider'))
                          .map((row) => (row.textContent || '').trim())
                          .filter(Boolean),
                    };
                }"""
            )
            if molden_summary['kind'] != 'vibemol.structure' or molden_summary['volumeKind'] != 'molden':
                raise AssertionError(f'Unexpected Molden structure summary: {molden_summary}')
            if molden_summary['atomCount'] != 1:
                raise AssertionError(f'Molden load produced unexpected atom count: {molden_summary}')
            if any(int(n) > 0 for n in molden_summary['nxyz']) or molden_summary['dataLength'] > 0:
                raise AssertionError(f'Molden load should start molecule-first before MO materialization: {molden_summary}')
            if molden_summary['rowCount'] != 3 or molden_summary['visibleRowCount'] != 3:
                raise AssertionError(f'Molden inspector did not render all orbital rows: {molden_summary}')
            if not molden_summary['gridSummary'] or 'selected: 1 (HOMO)' not in molden_summary['footer']:
                raise AssertionError(f'Molden inspector summaries are missing: {molden_summary}')
            if 'HOMO / LUMO' not in molden_summary['dividerText']:
                raise AssertionError(f'Molden HOMO/LUMO divider is missing: {molden_summary}')

            page.locator('#moldenInspectorBody tbody tr[data-row-index="1"]').click()
            page.wait_for_function(
                """() => {
                    const row = document.querySelector('#moldenInspectorBody tbody tr[data-row-index="1"]');
                    const footer = document.getElementById('moldenInspectorFooter');
                    const exported = window.VibeMolStructure.exportActive();
                    const nxyz = Array.isArray(exported.volume?.nxyz) ? exported.volume.nxyz : [];
                    const dataLength = Array.isArray(exported.volume?.data) ? exported.volume.data.length : 0;
                    return !!row
                      && row.classList.contains('vm-list-popover__row--selected')
                      && !!footer
                      && /selected:\\s*2\\s*\\(LUMO\\)/i.test(footer.textContent || '')
                      && nxyz.length === 3
                      && nxyz.every((n) => Number(n) > 0)
                      && dataLength > 0;
                }"""
            )
            molden_grid_before = page.evaluate(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    return {
                        nxyz: Array.isArray(exported.volume?.nxyz) ? exported.volume.nxyz.slice() : [],
                        dataLength: Array.isArray(exported.volume?.data) ? exported.volume.data.length : 0,
                    };
                }"""
            )
            page.evaluate(
                """() => {
                    const body = document.getElementById('moldenInspectorBody');
                    if (!(body instanceof HTMLElement)) return;
                    if (window.__moldenPendingObserver) window.__moldenPendingObserver.disconnect();
                    window.__moldenPendingRows = [];
                    const recordPending = () => {
                        const pendingRows = Array.from(body.querySelectorAll('tr.vm-list-popover__row--pending[data-row-index]'))
                          .map((row) => Number(row.getAttribute('data-row-index')));
                        if (pendingRows.length) window.__moldenPendingRows.push(pendingRows);
                    };
                    const observer = new MutationObserver(() => recordPending());
                    observer.observe(body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
                    window.__moldenPendingObserver = observer;
                    recordPending();
                }"""
            )
            page.fill('#moldenGridStep', '0.15')
            page.wait_for_function(
                """(previousGrid) => {
                    const exported = window.VibeMolStructure.exportActive();
                    const nextGrid = Array.isArray(exported.volume?.nxyz) ? exported.volume.nxyz.slice() : [];
                    return nextGrid.length === 3
                      && previousGrid.length === 3
                      && nextGrid.join('x') !== previousGrid.join('x');
                }""",
                arg=molden_grid_before['nxyz'],
            )
            molden_after_step = page.evaluate(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    return {
                        nxyz: Array.isArray(exported.volume?.nxyz) ? exported.volume.nxyz.slice() : [],
                        dataLength: Array.isArray(exported.volume?.data) ? exported.volume.data.length : 0,
                        pendingRows: Array.isArray(window.__moldenPendingRows) ? window.__moldenPendingRows.slice() : [],
                        stepValue: document.getElementById('moldenGridStep')?.value || '',
                    };
                }"""
            )
            if molden_after_step['stepValue'] != '0.15':
                raise AssertionError(f'Molden grid-step input did not commit the new value: {molden_after_step}')
            if molden_after_step['nxyz'] == molden_grid_before['nxyz'] or molden_after_step['dataLength'] == molden_grid_before['dataLength']:
                raise AssertionError(f'Molden grid-step change did not regenerate the selected orbital grid: before={molden_grid_before}, after={molden_after_step}')
            if not molden_after_step['pendingRows']:
                raise AssertionError(f'Molden grid-step change never marked the selected row pending: {molden_after_step}')

            page.fill('#moldenGridPadding', '5.0')
            page.locator('#moldenGridPadding').press('Enter')
            page.wait_for_function(
                """(previousGrid) => {
                    const exported = window.VibeMolStructure.exportActive();
                    const nextGrid = Array.isArray(exported.volume?.nxyz) ? exported.volume.nxyz.slice() : [];
                    return nextGrid.length === 3
                      && previousGrid.length === 3
                      && nextGrid.join('x') !== previousGrid.join('x');
                }""",
                arg=molden_after_step['nxyz'],
            )
            molden_after_padding = page.evaluate(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    return {
                        nxyz: Array.isArray(exported.volume?.nxyz) ? exported.volume.nxyz.slice() : [],
                        dataLength: Array.isArray(exported.volume?.data) ? exported.volume.data.length : 0,
                        paddingValue: document.getElementById('moldenGridPadding')?.value || '',
                    };
                }"""
            )
            if molden_after_padding['paddingValue'] != '5.0':
                raise AssertionError(f'Molden grid-padding input did not commit the new value: {molden_after_padding}')
            if molden_after_padding['nxyz'] == molden_after_step['nxyz'] or molden_after_padding['dataLength'] == molden_after_step['dataLength']:
                raise AssertionError(f'Molden grid-padding change did not regenerate the selected orbital grid: before={molden_after_step}, after={molden_after_padding}')

            page.evaluate(
                """() => {
                    const input = document.getElementById('moldenGridStep');
                    if (!(input instanceof HTMLInputElement)) return;
                    input.value = '';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('blur', { bubbles: true }));
                }"""
            )
            page.wait_for_function(
                """() => {
                    const input = document.getElementById('moldenGridStep');
                    return !!input && input.value === '0.15';
                }"""
            )

            page.fill('#moldenEnergyFilter', '0.5')
            page.wait_for_function(
                """() => {
                    const visibleRows = Array.from(document.querySelectorAll('#moldenInspectorBody tbody tr[data-row-index]'))
                      .filter((row) => getComputedStyle(row).display !== 'none');
                    const visibleDivider = Array.from(document.querySelectorAll('#moldenInspectorBody tbody tr.vm-list-popover__divider'))
                      .find((row) => getComputedStyle(row).display !== 'none');
                    return visibleRows.length === 2
                      && !!visibleDivider
                      && /HOMO\\s*\\/\\s*LUMO/i.test(visibleDivider.textContent || '');
                }"""
            )
            page.fill('#moldenEnergyFilter', '')
            page.wait_for_function(
                """() => {
                    const visibleRows = Array.from(document.querySelectorAll('#moldenInspectorBody tbody tr[data-row-index]'))
                      .filter((row) => getComputedStyle(row).display !== 'none');
                    return visibleRows.length === 3;
                }"""
            )

            page.keyboard.press('Escape')
            page.wait_for_function("() => !document.getElementById('moldenInspector')?.classList.contains('open')")
            page.evaluate("() => document.getElementById('coordsPanelBtn')?.click()")
            page.wait_for_function("() => document.getElementById('coordsPanel')?.classList.contains('open')")
            page.locator('#coordsContent tr[data-atom-index="0"] [data-edit-field="x"]').click()
            page.locator('#coordsContent .coordsCellEditor').fill('abc')
            page.locator('#coordsContent .coordsCellEditor').press('Enter')
            page.wait_for_function(
                """() => {
                    const cell = document.querySelector('#coordsContent tr[data-atom-index="0"] [data-edit-field="x"]');
                    return !!cell && (cell.textContent || '').trim() === '0.000';
                }"""
            )
            page.locator('#coordsContent tr[data-atom-index="0"] [data-edit-field="x"]').click()
            page.locator('#coordsContent .coordsCellEditor').fill('3.5')
            page.locator('#coordsContent .coordsCellEditor').press('Enter')
            page.wait_for_function(
                """() => {
                    const cell = document.querySelector('#coordsContent tr[data-atom-index="0"] [data-edit-field="x"]');
                    const exported = window.VibeMolStructure.exportActive();
                    const atom = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms[0] : null;
                    return !!cell
                      && (cell.textContent || '').trim() === '3.500'
                      && !!atom
                      && Math.abs(Number(atom.x) - 3.5) < 1e-6;
                }"""
            )
            page.locator('#coordsContent tr[data-atom-index="0"] [data-edit-field="x"]').click()
            page.locator('#coordsContent .coordsCellEditor').fill('0')
            page.locator('#coordsContent .coordsCellEditor').press('Enter')
            page.wait_for_function(
                """() => {
                    const cell = document.querySelector('#coordsContent tr[data-atom-index="0"] [data-edit-field="x"]');
                    const exported = window.VibeMolStructure.exportActive();
                    const atom = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms[0] : null;
                    return !!cell
                      && (cell.textContent || '').trim() === '0.000'
                      && !!atom
                      && Math.abs(Number(atom.x)) < 1e-6;
                }"""
            )

            # Geometry-only imports should infer perceived connectivity.
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
            if not (
                isinstance(inferred_summary.get('bondOrders'), list)
                and len(inferred_summary['bondOrders']) == 1
                and int(inferred_summary['bondOrders'][0]) >= 1
            ):
                raise AssertionError(f'XYZ inference did not produce a valid bond order: {inferred_summary}')
            if inferred_summary['bondOrigins'] != ['perceived']:
                raise AssertionError(f'XYZ inference did not mark bonds as perceived: {inferred_summary}')
            inferred_bond_order = int(inferred_summary['bondOrders'][0])
            expected_hydrogen_count = max(0, 8 - 2 * inferred_bond_order)
            expected_atom_count = 2 + expected_hydrogen_count
            expected_bond_count = 1 + expected_hydrogen_count

            # Edit-mode Space should preview hydrogens first, then apply them on the second press.
            page.locator('#modeEditBtn').click()
            page.wait_for_function("() => { const menu = document.getElementById('displayWindowAdaptiveMenu'); return menu?.getAttribute('aria-hidden') === 'false' && menu?.dataset.mode === 'edit'; }")
            page.keyboard.press(' ')
            if expected_hydrogen_count > 0:
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
                    """(payload) => {
                        const exported = window.VibeMolStructure.exportActive();
                        const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                        const bonds = Array.isArray(exported.volume?.bonds) ? exported.volume.bonds : [];
                        const hydrogenCount = atoms.filter((atom) => (atom.Z | 0) === 1).length;
                        const explicitCount = bonds.filter((bond) => String(bond.origin || '') === 'explicit').length;
                        return hydrogenCount === Number(payload.expectedHydrogenCount)
                          && explicitCount === Number(payload.expectedHydrogenCount)
                          && bonds.length === Number(payload.expectedBondCount);
                    }""",
                    arg={
                        'expectedHydrogenCount': expected_hydrogen_count,
                        'expectedBondCount': expected_bond_count,
                    },
                )
                hydrogenated_summary = active_structure_summary(page)
                if hydrogenated_summary['atomCount'] != expected_atom_count or hydrogenated_summary['bondCount'] != expected_bond_count:
                    raise AssertionError(f'Auto-hydrogenation produced an unexpected structure: {hydrogenated_summary}')
                if hydrogenated_summary['atomicNumbers'].count(1) != expected_hydrogen_count:
                    raise AssertionError(f'Auto-hydrogenation did not add the expected hydrogens: {hydrogenated_summary}')
                if hydrogenated_summary['bondOrigins'].count('explicit') != expected_hydrogen_count or hydrogenated_summary['bondOrigins'].count('perceived') != 1:
                    raise AssertionError(f'Auto-hydrogenation bond provenance is wrong: {hydrogenated_summary}')
            else:
                page.wait_for_function(
                    """() => {
                        const hint = document.getElementById('hint');
                        return !!hint && /No missing hydrogens found/i.test(hint.textContent || '');
                    }"""
                )
                hydrogen_noop_summary = active_structure_summary(page)
                if hydrogen_noop_summary['atomCount'] != 2 or hydrogen_noop_summary['bondCount'] != 1:
                    raise AssertionError(f'Auto-hydrogen no-op unexpectedly mutated the structure: {hydrogen_noop_summary}')

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
                    const isShown = (id) => {
                      const el = document.getElementById(id);
                      return !!el && !el.hidden && getComputedStyle(el).display !== 'none';
                    };
                    const labelOf = (id) => {
                      const el = document.getElementById(id);
                      const label = el ? el.querySelector('.adaptiveEditItemLabel') : null;
                      return label ? (label.textContent || '').trim() : '';
                    };
                    return isShown('editAdaptiveAddAtomBtn')
                      && isShown('editAdaptiveSymmetryBtn')
                      && isShown('editAdaptiveCleanStructureBtn')
                      && isShown('editAdaptiveAlignPrincipalBtn')
                      && labelOf('editAdaptiveAddAtomBtn') === 'Build'
                      && labelOf('editAdaptiveSymmetryBtn') === 'Symmetry'
                      && labelOf('editAdaptiveCleanStructureBtn') === 'Optimize'
                      && labelOf('editAdaptiveAlignPrincipalBtn') === 'Align';
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

            log_step('live rotate updates grouped bond carriers')
            water_fixture_text = build_fixture_water_structure()
            page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "rotate-water-fixture")', water_fixture_text)
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    return Array.isArray(exported.volume?.atoms) && exported.volume.atoms.length === 3;
                }"""
            )
            page.evaluate(
                """() => {
                    if (!window.VibeMolTesting || typeof window.VibeMolTesting.setEditSelectionIndices !== 'function') return null;
                    return window.VibeMolTesting.setEditSelectionIndices([0, 1]);
                }"""
            )
            wait_for_selected_atoms(page, 2)
            page.wait_for_function(
                """() => {
                    const rotateBtn = document.getElementById('editSelectionRotateCueButton');
                    return !!rotateBtn && !rotateBtn.hidden;
                }"""
            )
            before_group_bond = page.evaluate(
                """() => {
                    const bonds = Array.isArray(window.VibeMolTesting?.getBondCarrierSnapshots?.())
                      ? window.VibeMolTesting.getBondCarrierSnapshots()
                      : [];
                    return bonds.find((bond) => (
                      (Number(bond?.i) === 0 && Number(bond?.j) === 1)
                      || (Number(bond?.i) === 1 && Number(bond?.j) === 0)
                    )) || null;
                }"""
            )
            if not isinstance(before_group_bond, dict):
                raise AssertionError(f'Could not capture grouped bond carrier before live rotate: {before_group_bond!r}')
            rotate_cue_box = page.locator('#editSelectionRotateCueButton').bounding_box()
            if not rotate_cue_box:
                raise AssertionError('Rotate selection cue is not visible for grouped-bond rotate smoke')
            rotate_x = rotate_cue_box['x'] + rotate_cue_box['width'] * 0.5
            rotate_y = rotate_cue_box['y'] + rotate_cue_box['height'] * 0.5
            page.mouse.move(rotate_x, rotate_y)
            page.mouse.down()
            page.mouse.move(rotate_x + 46, rotate_y + 28)
            page.wait_for_function(
                """(before) => {
                    const bonds = Array.isArray(window.VibeMolTesting?.getBondCarrierSnapshots?.())
                      ? window.VibeMolTesting.getBondCarrierSnapshots()
                      : [];
                    const next = bonds.find((bond) => String(bond?.logicalKey || '') === String(before?.logicalKey || ''));
                    if (!next) return false;
                    const changed = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) > 1e-6;
                    return changed(next.x, before.x)
                      || changed(next.y, before.y)
                      || changed(next.z, before.z)
                      || changed(next.qx, before.qx)
                      || changed(next.qy, before.qy)
                      || changed(next.qz, before.qz)
                      || changed(next.qw, before.qw)
                      || changed(next.sy, before.sy);
                }""",
                arg=before_group_bond,
            )
            page.mouse.up()

            log_step('edit void orbit matches display orbit')
            orbit_drag_dx = 52
            orbit_drag_dy = 34
            page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "orbit-compare-display")', water_fixture_text)
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    return Array.isArray(exported.volume?.atoms) && exported.volume.atoms.length === 3;
                }"""
            )
            page.locator('#modeEditBtn').click()
            edit_void_x, edit_void_y = find_empty_edit_canvas_point(page)
            page.locator('#modeDisplayBtn').click()
            page.wait_for_timeout(50)
            page.mouse.move(edit_void_x, edit_void_y)
            page.mouse.down()
            page.mouse.move(edit_void_x + orbit_drag_dx, edit_void_y + orbit_drag_dy, steps=8)
            page.mouse.up()
            page.evaluate(
                """() => new Promise((resolve) => {
                    requestAnimationFrame(() => requestAnimationFrame(resolve));
                })"""
            )
            display_after = page.evaluate("""() => window.VibeMolTesting?.getCameraSnapshot?.() || null""")
            page.evaluate(
                """() => new Promise((resolve) => {
                    requestAnimationFrame(() => requestAnimationFrame(resolve));
                })"""
            )
            display_stable = page.evaluate("""() => window.VibeMolTesting?.getCameraSnapshot?.() || null""")
            if not isinstance(display_after, dict) or not isinstance(display_stable, dict):
                raise AssertionError('Could not capture display camera snapshots for orbit comparison')
            if max_camera_snapshot_delta(display_after, display_stable) > 1e-6:
                raise AssertionError(
                    f'Display orbit drifted after release: {max_camera_snapshot_delta(display_after, display_stable):.6g}'
                )

            page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "orbit-compare-edit")', water_fixture_text)
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    return Array.isArray(exported.volume?.atoms) && exported.volume.atoms.length === 3;
                }"""
            )
            page.locator('#modeEditBtn').click()
            edit_void_x, edit_void_y = find_empty_edit_canvas_point(page)
            page.mouse.move(edit_void_x, edit_void_y)
            page.mouse.down(button='right')
            page.mouse.move(edit_void_x + orbit_drag_dx, edit_void_y + orbit_drag_dy, steps=8)
            page.mouse.up(button='right')
            page.evaluate(
                """() => new Promise((resolve) => {
                    requestAnimationFrame(() => requestAnimationFrame(resolve));
                })"""
            )
            edit_after = page.evaluate("""() => window.VibeMolTesting?.getCameraSnapshot?.() || null""")
            page.evaluate(
                """() => new Promise((resolve) => {
                    requestAnimationFrame(() => requestAnimationFrame(resolve));
                })"""
            )
            edit_stable = page.evaluate("""() => window.VibeMolTesting?.getCameraSnapshot?.() || null""")
            if not isinstance(edit_after, dict) or not isinstance(edit_stable, dict):
                raise AssertionError('Could not capture edit camera snapshots for orbit comparison')
            if max_camera_snapshot_delta(edit_after, edit_stable) > 1e-6:
                raise AssertionError(
                    f'Edit orbit drifted after release: {max_camera_snapshot_delta(edit_after, edit_stable):.6g}'
                )
            if max_camera_snapshot_delta(display_after, edit_after) > 1e-5:
                raise AssertionError(
                    f'Edit void orbit does not match display orbit: {max_camera_snapshot_delta(display_after, edit_after):.6g}'
                )

            log_step('symmetry popover smoke')
            page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "symmetry-water-fixture")', water_fixture_text)
            page.locator('#modeDisplayBtn').click()
            page.locator('#modeEditBtn').click()
            page.wait_for_function(
                """() => {
                    const btn = document.getElementById('editAdaptiveSymmetryBtn');
                    return !!btn && btn.hidden === false;
                }"""
            )
            oxygen_x, oxygen_y = find_atom_click_point(page, 0)
            right_click_atom(page, oxygen_x, oxygen_y)
            wait_for_selected_atoms(page, 1)
            click_when_ready(page, '#editAdaptiveSymmetryBtn')
            page.wait_for_function(
                """() => document.getElementById('editAdaptiveSymmetryPopover')?.getAttribute('aria-hidden') === 'false'"""
            )
            page.wait_for_function(
                """() => {
                    const summary = document.getElementById('editSymmetryTargetSummary')?.textContent || '';
                    return /Selected atoms \\(1\\)/i.test(summary);
                }"""
            )
            click_when_ready(page, '#editAdaptiveSymmetryBtn')
            page.wait_for_function(
                """() => document.getElementById('editAdaptiveSymmetryPopover')?.getAttribute('aria-hidden') === 'true'"""
            )
            page.keyboard.press('Escape')
            page.wait_for_function("""() => Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0) === 0""")
            click_when_ready(page, '#editAdaptiveSymmetryBtn')
            page.wait_for_function(
                """() => document.getElementById('editAdaptiveSymmetryPopover')?.getAttribute('aria-hidden') === 'false'"""
            )
            page.wait_for_function(
                """() => {
                    const summary = document.getElementById('editSymmetryTargetSummary')?.textContent || '';
                    const exact = document.getElementById('editSymmetryExactResult')?.textContent || '';
                    return /Whole structure \\(3 atoms\\)/i.test(summary) && /point group:\\s*C2v/i.test(exact);
                }"""
            )
            distorted_methane_text = build_fixture_distorted_methane_structure()
            page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "symmetry-distorted-methane-fixture")', distorted_methane_text)
            page.wait_for_function(
                """() => document.getElementById('editAdaptiveSymmetryPopover')?.getAttribute('aria-hidden') === 'true'"""
            )
            click_when_ready(page, '#editAdaptiveSymmetryBtn')
            page.wait_for_function(
                """() => document.getElementById('editAdaptiveSymmetryPopover')?.getAttribute('aria-hidden') === 'false'"""
            )
            page.wait_for_function(
                """() => /Whole structure \\(5 atoms\\)/i.test(document.getElementById('editSymmetryTargetSummary')?.textContent || '')"""
            )
            set_select_value(page, '#editSymmetryToleranceSelect', '0.100')
            page.wait_for_function(
                """() => {
                    const buttons = Array.from(document.querySelectorAll('#editSymmetryCandidates button[data-symmetry-group-id]'));
                    return buttons.some((button) => String(button.getAttribute('data-symmetry-group-id') || '') === 'Td');
                }"""
            )
            symmetry_before = active_atom_positions(page)
            page.locator('#editSymmetryCandidates button[data-symmetry-group-id="Td"]').click()
            page.wait_for_function(
                """() => {
                    const applyBtn = document.getElementById('editSymmetryApplyBtn');
                    const cancelBtn = document.getElementById('editSymmetryCancelBtn');
                    return !!applyBtn && applyBtn.disabled === false
                      && !!cancelBtn && cancelBtn.disabled === false;
                }"""
            )
            page.locator('#editSymmetryCancelBtn').click()
            page.wait_for_function(
                """(beforeAtoms) => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    if (!Array.isArray(beforeAtoms) || beforeAtoms.length !== atoms.length) return false;
                    for (let i = 0; i < atoms.length; i += 1) {
                      const before = beforeAtoms[i];
                      const atom = atoms[i];
                      if (!Array.isArray(before) || before.length < 3 || !atom) return false;
                      if (Math.abs((Number(atom.x) || 0) - (Number(before[0]) || 0)) > 1e-6) return false;
                      if (Math.abs((Number(atom.y) || 0) - (Number(before[1]) || 0)) > 1e-6) return false;
                      if (Math.abs((Number(atom.z) || 0) - (Number(before[2]) || 0)) > 1e-6) return false;
                    }
                    return true;
                }""",
                arg=symmetry_before,
            )
            page.wait_for_function(
                """() => document.getElementById('editSymmetryApplyBtn')?.disabled === true"""
            )
            page.locator('#editSymmetryCandidates button[data-symmetry-group-id="Td"]').click()
            page.wait_for_function(
                """() => document.getElementById('editSymmetryApplyBtn')?.disabled === false"""
            )
            page.locator('#editSymmetryApplyBtn').click()
            page.wait_for_function(
                """(beforeAtoms) => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    if (!Array.isArray(beforeAtoms) || beforeAtoms.length !== atoms.length) return false;
                    for (let i = 0; i < atoms.length; i += 1) {
                      const before = beforeAtoms[i];
                      const atom = atoms[i];
                      if (!Array.isArray(before) || before.length < 3 || !atom) continue;
                      const dx = (Number(atom.x) || 0) - (Number(before[0]) || 0);
                      const dy = (Number(atom.y) || 0) - (Number(before[1]) || 0);
                      const dz = (Number(atom.z) || 0) - (Number(before[2]) || 0);
                      if ((dx * dx + dy * dy + dz * dz) > 1e-6) return true;
                    }
                    return false;
                }""",
                arg=symmetry_before,
            )
            page.wait_for_function(
                """() => /point group:\\s*Td/i.test(document.getElementById('editSymmetryExactResult')?.textContent || '')"""
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
                """(beforeAtoms) => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    if (!Array.isArray(beforeAtoms) || beforeAtoms.length !== atoms.length) return false;
                    for (let i = 0; i < atoms.length; i += 1) {
                      const before = beforeAtoms[i];
                      const atom = atoms[i];
                      if (!Array.isArray(before) || before.length < 3 || !atom) return false;
                      if (Math.abs((Number(atom.x) || 0) - (Number(before[0]) || 0)) > 1e-6) return false;
                      if (Math.abs((Number(atom.y) || 0) - (Number(before[1]) || 0)) > 1e-6) return false;
                      if (Math.abs((Number(atom.z) || 0) - (Number(before[2]) || 0)) > 1e-6) return false;
                    }
                    return true;
                }""",
                arg=symmetry_before,
            )
            page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "symmetry-distorted-methane-auto-fixture")', distorted_methane_text)
            page.wait_for_function(
                """() => document.getElementById('editAdaptiveSymmetryPopover')?.getAttribute('aria-hidden') === 'true'"""
            )
            click_when_ready(page, '#editAdaptiveSymmetryBtn')
            page.wait_for_function(
                """() => document.getElementById('editAdaptiveSymmetryPopover')?.getAttribute('aria-hidden') === 'false'"""
            )
            page.wait_for_function(
                """() => /Whole structure \\(5 atoms\\)/i.test(document.getElementById('editSymmetryTargetSummary')?.textContent || '')"""
            )
            set_select_value(page, '#editSymmetryToleranceSelect', '0.100')
            page.locator('#editSymmetryAutoBtn').click()
            page.wait_for_function(
                """() => /point group:\\s*Td/i.test(document.getElementById('editSymmetryExactResult')?.textContent || '')"""
            )
            click_when_ready(page, '#editAdaptiveSymmetryBtn')
            page.wait_for_function(
                """() => document.getElementById('editAdaptiveSymmetryPopover')?.getAttribute('aria-hidden') === 'true'"""
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
            page.keyboard.press('Escape')
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
            right_click_atom(page, left_x, left_y)
            wait_for_selected_atoms(page, 1)
            page.locator('#editSelectionAddFragmentCueButton').click()
            page.wait_for_function(
                """() => document.getElementById('editSelectionAddFragmentCueButton')?.getAttribute('aria-pressed') === 'true'"""
            )
            right_click_atom(page, right_x, right_y)
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
                    timeout=5000,
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

            page.locator('#editSelectionDeleteCueButton').click()
            page.wait_for_function(
                r"""() => {
                    const exported = window.VibeMolStructure.exportActive();
                    return exported.volume.atoms.length === 2
                      && Array.isArray(exported.volume.bonds)
                      && exported.volume.bonds.length === 1
                      && Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0) === 0;
                }"""
            )

            log_step('add atom smoke')
            # Add atom smoke.
            ensure_build_popover_open(page)
            page.locator('#editAddQuick button[data-z="6"]').click()
            page.wait_for_function(
                """() => document.querySelector('#editAddQuick button[data-z="6"]')?.classList.contains('active') === true"""
            )
            page.keyboard.press('/')
            page.wait_for_function(
                """() => {
                    const popover = document.getElementById('editAdaptiveAddAtomPopover');
                    const search = document.getElementById('editBuildSearch');
                    return !!popover
                      && popover.getAttribute('aria-hidden') === 'false'
                      && document.activeElement === search;
                }"""
            )
            before_add_atom = active_structure_summary(page)
            x, y = find_empty_edit_canvas_point(page)
            page.mouse.click(x, y)
            page.wait_for_function(
                """(beforeCount) => {
                    const exported = window.VibeMolStructure.exportActive();
                    return Array.isArray(exported.volume?.atoms)
                      && exported.volume.atoms.length > Number(beforeCount);
                }""",
                arg=before_add_atom['atomCount'],
            )
            page.wait_for_function("() => document.getElementById('editAddAtomOperatorPanel')?.getAttribute('aria-hidden') === 'false'")
            after_add_atom = active_structure_summary(page)
            if after_add_atom['atomCount'] <= before_add_atom['atomCount']:
                raise AssertionError(f'Add atom did not increase the structure size: {before_add_atom} -> {after_add_atom}')
            if after_add_atom['atomicNumbers'].count(6) != before_add_atom['atomicNumbers'].count(6) + 1:
                raise AssertionError(f'Add atom did not place exactly one new carbon: {before_add_atom} -> {after_add_atom}')
            page.keyboard.press('Escape')
            page.wait_for_function("() => document.getElementById('editAddAtomOperatorPanel')?.getAttribute('aria-hidden') === 'true'")
            after_add_escape = active_structure_summary(page)
            if after_add_escape['atomCount'] != after_add_atom['atomCount']:
                raise AssertionError(f'Esc unexpectedly removed the newly placed atom: {after_add_atom} -> {after_add_escape}')
            if after_add_escape['atomicNumbers'].count(6) != after_add_atom['atomicNumbers'].count(6):
                raise AssertionError(f'Esc unexpectedly changed the placed atom identity: {after_add_atom} -> {after_add_escape}')

            log_step('grow-add can be followed immediately by atom selection')
            start_new_edit_file(page)
            load_build_query(page, 'Carbon')
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
            anchor_select_x, anchor_select_y = find_atom_click_point(page, 0)
            right_click_atom(page, anchor_select_x, anchor_select_y)
            page.wait_for_function(
                """() => Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0) === 1"""
            )
            page.keyboard.press('Enter')
            page.wait_for_function(
                """() => document.getElementById('editAddAtomOperatorPanel')?.getAttribute('aria-hidden') === 'true'"""
            )

            log_step('add molecule smoke')
            # Build search keyboard navigation regression.
            ensure_build_popover_open(page, focus_search=True)
            page.locator('#editBuildSearch').fill('N')
            page.wait_for_function(
                """() => {
                    const sodium = document.querySelector('#editAddQuick button[data-z="11"]');
                    const carbon = document.querySelector('#editAddQuick button[data-z="6"]');
                    return !!sodium
                      && sodium.hidden === false
                      && (!carbon || carbon.hidden === true);
                }"""
            )
            page.locator('#editAddQuick button[data-z="11"]').click()
            page.wait_for_function(
                """() => {
                    const state = window.VibeMolTesting?.getEditBuildState?.();
                    return state
                      && state.intent === 'add_atom'
                      && state.elementZ === 11
                      && document.getElementById('editAdaptiveAddAtomPopover')?.getAttribute('aria-hidden') === 'true';
                }"""
            )
            ensure_build_popover_open(page, focus_search=True)
            page.wait_for_function(
                """() => {
                    const popover = document.getElementById('editAdaptiveAddAtomPopover');
                    const search = document.getElementById('editBuildSearch');
                    return !!popover
                      && popover.getAttribute('aria-hidden') === 'false'
                      && document.activeElement === search;
                }"""
            )
            page.locator('#editBuildSearch').fill('Pr')
            page.wait_for_function(
                """() => {
                    const pr = document.querySelector('#editAddQuick button[data-z="59"]');
                    const pm = document.querySelector('#editAddQuick button[data-z="61"]');
                    const pa = document.querySelector('#editAddQuick button[data-z="91"]');
                    return !!pr
                      && pr.hidden === false
                      && !!pm
                      && pm.hidden === false
                      && !!pa
                      && pa.hidden === false;
                }"""
            )
            page.hover('#editAdaptiveAddAtomPopover')
            page.locator('#editAddQuick button[data-z="59"]').click()
            page.wait_for_function(
                """() => {
                    const state = window.VibeMolTesting?.getEditBuildState?.();
                    return state
                      && state.intent === 'add_atom'
                      && state.elementZ === 59
                      && document.getElementById('editAdaptiveAddAtomPopover')?.getAttribute('aria-hidden') === 'true';
                }"""
            )
            ensure_build_popover_open(page, focus_search=True)
            page.locator('#editBuildSearch').fill('ph')
            page.wait_for_function(
                """() => {
                    const phenyl = document.querySelector('#editFragmentQuick button[data-fragment-id="phenyl"]');
                    const hydroxyl = document.querySelector('#editFragmentQuick button[data-fragment-id="hydroxyl"]');
                    return !!phenyl
                      && phenyl.hidden === false
                      && (!hydroxyl || hydroxyl.hidden === true);
                }"""
            )

            # Build kind transition regression: atom -> fragment updates intent, hint, and cursor ghost.
            page.evaluate(
                """() => {
                    if (typeof window.VibeMolTesting?.setEditSelectionIndices === 'function') {
                        window.VibeMolTesting.setEditSelectionIndices([]);
                    }
                }"""
            )
            page.wait_for_function("""() => Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0) === 0""")
            page.locator('#editBuildSearch').fill('F')
            page.keyboard.press('Enter')
            page.wait_for_function(
                """() => {
                    const state = window.VibeMolTesting?.getEditBuildState?.();
                    return state
                      && state.intent === 'add_atom'
                      && state.elementZ === 9
                      && document.getElementById('editAdaptiveAddAtomPopover')?.getAttribute('aria-hidden') === 'true'
                      && /Build element: Fluorine \\(F\\)/.test(state.hint || '');
                }"""
            )
            x, y = find_empty_edit_canvas_point(page)
            page.mouse.move(x + 6, y + 6)
            page.mouse.move(x, y)
            page.wait_for_function(
                """() => {
                    const state = window.VibeMolTesting?.getEditBuildState?.();
                    return state
                      && state.intent === 'add_atom'
                      && state.ghostKind === 'atom'
                      && state.gestureVoidPreviewVisible === true;
                }"""
            )
            ensure_build_popover_open(page, focus_search=True)
            page.locator('#editBuildSearch').fill('methylene')
            page.keyboard.press('Enter')
            page.mouse.move(x + 6, y + 6)
            page.mouse.move(x, y)
            page.wait_for_function(
                """() => {
                    const state = window.VibeMolTesting?.getEditBuildState?.();
                    return state
                      && state.intent === 'add_fragment'
                      && state.fragmentId === 'methylene'
                      && document.getElementById('editAdaptiveAddAtomPopover')?.getAttribute('aria-hidden') === 'true'
                      && state.ghostKind === 'fragment'
                      && state.catalogVoidPreviewVisible === true
                      && /Build fragment: Methylene/.test(state.hint || '');
                }"""
            )

            # Build search / standalone molecule placement smoke.
            ensure_build_popover_open(page, focus_search=True)
            page.locator('#editBuildSearch').fill('benzene')
            page.keyboard.press('Enter')
            page.wait_for_function(
                """() => document.querySelector('#editMoleculeQuick button[data-molecule-id="benzene"]')?.classList.contains('active') === true"""
            )
            page.wait_for_function(
                """() => {
                    const state = window.VibeMolTesting?.getEditBuildState?.();
                    return state
                      && state.intent === 'add_molecule'
                      && state.moleculeId === 'benzene'
                      && document.getElementById('editAdaptiveAddAtomPopover')?.getAttribute('aria-hidden') === 'true';
                }"""
            )
            before_add_molecule = active_structure_summary(page)
            x, y = find_empty_edit_canvas_point(page)
            page.mouse.move(x + 6, y + 6)
            page.mouse.move(x, y)
            page.wait_for_function(
                """() => {
                    const state = window.VibeMolTesting?.getEditBuildState?.();
                    return state
                      && state.intent === 'add_molecule'
                      && state.ghostKind === 'molecule'
                      && state.catalogVoidPreviewVisible === true
                      && state.moleculePlacementActive === false;
                }"""
            )
            page.mouse.click(x, y)
            page.wait_for_function(
                """() => {
                    const state = window.VibeMolTesting?.getEditBuildState?.();
                    return document.getElementById('editAddMoleculeOperatorPanel')?.getAttribute('aria-hidden') === 'false'
                      && state
                      && state.moleculePlacementActive === true
                      && state.catalogVoidPreviewVisible === false
                      && state.ghostKind !== 'molecule';
                }"""
            )
            page.mouse.click(x, y)
            page.wait_for_function(
                """() => {
                    const state = window.VibeMolTesting?.getEditBuildState?.();
                    return state
                      && state.intent === 'add_molecule'
                      && state.moleculePlacementActive === false
                      && state.catalogVoidPreviewVisible === true
                      && state.ghostKind === 'molecule';
                }"""
            )
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
            set_focused_scene_visible(page, True)
            page.locator('#modeDisplayBtn').click()
            page.locator('#modeEditBtn').click()
            side_x, side_y = find_bond_side_canvas_point(page)
            page.mouse.click(side_x, side_y, button='right')
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
            set_focused_scene_visible(page, True)
            page.locator('#modeDisplayBtn').click()
            page.locator('#modeEditBtn').click()
            side_x, side_y = find_bond_side_canvas_point(page)
            page.mouse.click(side_x, side_y, button='right')
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
            set_focused_scene_visible(page, True)
            page.locator('#modeDisplayBtn').click()
            page.locator('#modeEditBtn').click()
            for expected_order in (2, 3, 4, 3, 2, 1):
                midpoint_x, midpoint_y = find_bond_midpoint_canvas_point(page)
                page.mouse.click(midpoint_x, midpoint_y)
                page.wait_for_function(
                    """(expectedOrder) => {
                        const bond = (window.VibeMolStructure.exportActive().volume.bonds || [])[0] || null;
                        return !!bond
                          && bond.order === expectedOrder
                          && bond.kind === 'normal'
                          && bond.origin === 'explicit'
                          && Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0) === 0;
                    }""",
                    arg=expected_order,
                )

            page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "bond-gesture-fixture-selection")', fixture_text)
            set_focused_scene_visible(page, True)
            page.locator('#modeDisplayBtn').click()
            page.locator('#modeEditBtn').click()
            side_x, side_y = find_bond_side_canvas_point(page)
            page.mouse.click(side_x, side_y, button='right')
            page.wait_for_function(
                """() => Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0) > 0"""
            )
            midpoint_x, midpoint_y = find_bond_midpoint_canvas_point(page)
            page.mouse.click(midpoint_x, midpoint_y, button='right')
            page.wait_for_function(
                """() => {
                    const cue = window.VibeMolTesting?.getBondCenterCueState?.();
                    return !!cue
                      && cue.visible === true
                      && Number(cue.order) === 1
                      && Number(window.VibeMolTesting?.getEditSelectionCount?.() || 0) === 0;
                }"""
            )
            for expected_order in (2, 4, 3, 1):
                drag_bond_order_cue_to(page, expected_order)
                page.wait_for_function(
                    """(expectedOrder) => {
                        const bond = (window.VibeMolStructure.exportActive().volume.bonds || [])[0] || null;
                        return !!bond && bond.order === expectedOrder && bond.kind === 'normal' && bond.origin === 'explicit';
                    }""",
                    arg=expected_order,
                )
            drag_bond_order_cue_to(page, 0)
            page.wait_for_function(
                """() => {
                    const bond = (window.VibeMolStructure.exportActive().volume.bonds || [])[0] || null;
                    return !!bond && bond.kind === 'blocked' && bond.origin === 'explicit';
                }"""
            )
            drag_bond_order_cue_to(page, 2)
            page.wait_for_function(
                """() => {
                    const bond = (window.VibeMolStructure.exportActive().volume.bonds || [])[0] || null;
                    return !!bond && bond.order === 2 && bond.kind === 'normal' && bond.origin === 'explicit';
                }"""
            )

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
            click_when_ready(page, '#editAdaptiveCleanStructureBtn')
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
            static_xyz_text = '\n'.join([
                '2',
                'static reference',
                'C 0.000000 0.000000 0.000000',
                'C 1.400000 0.000000 0.000000',
                '',
            ])
            page.evaluate(
                """async (text) => {
                    await window.VibeMolEmbed.loadFiles([{ name: 'static-reference.xyz', text }]);
                }""",
                static_xyz_text,
            )
            drop_text_files(
                page,
                [{'name': 'dynamic-traj.xyz', 'text': trajectory_xyz_text}],
            )
            page.wait_for_function(
                """() => {
                    const rows = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .map((row) => ({
                        depth: row.dataset.depth || '',
                        label: (row.querySelector('.vm-outliner-row__label')?.textContent || '').trim(),
                        hidden: row.classList.contains('is-hidden'),
                      }));
                    const scenes = rows.filter((row) => row.depth === '0');
                    return scenes.length === 2
                      && scenes[0].label === 'static-reference.xyz'
                      && scenes[0].hidden === true
                      && scenes[1].label === 'dynamic-traj.xyz'
                      && scenes[1].hidden === false;
                }"""
            )
            page.evaluate(
                """() => {
                    const clickSceneHeader = (label) => {
                      const row = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                        .find((candidate) => (
                          candidate.dataset.depth === '0'
                          && (candidate.querySelector('.vm-outliner-row__label')?.textContent || '').trim() === label
                        ));
                      row?.click();
                    };
                    clickSceneHeader('static-reference.xyz');
                }"""
            )
            page.wait_for_function(
                """() => {
                    const btn = document.getElementById('trajectoryPanelBtn');
                    return !!btn && getComputedStyle(btn).display !== 'none';
                }"""
            )
            page.evaluate(
                """() => {
                    const row = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                      .find((candidate) => (
                        candidate.dataset.depth === '0'
                        && (candidate.querySelector('.vm-outliner-row__label')?.textContent || '').trim() === 'dynamic-traj.xyz'
                      ));
                    row?.click();
                }"""
            )
            page.wait_for_function(
                """() => {
                    const btn = document.getElementById('trajectoryPanelBtn');
                    return !!btn && getComputedStyle(btn).display !== 'none';
                }"""
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
            page.wait_for_function(
                """() => {
                    const chip = document.getElementById('viewInspectorBtn');
                    const hint = document.getElementById('hint');
                    if (!chip || !hint) return false;
                    const chipStyle = getComputedStyle(chip);
                    const hintStyle = getComputedStyle(hint);
                    return chipStyle.backgroundColor !== 'rgba(0, 0, 0, 0)'
                      && chipStyle.backgroundColor !== 'transparent'
                      && chipStyle.backgroundColor !== 'rgb(255, 255, 255)'
                      && chipStyle.color === 'rgb(233, 241, 255)'
                      && hintStyle.backgroundColor === 'rgb(26, 34, 48)'
                      && hintStyle.color === 'rgb(233, 241, 255)';
                }"""
            )
            page.locator('#trajectoryPanelBtn').click()
            page.wait_for_function(
                """() => {
                    const note = document.getElementById('trajectoryBondModeNote');
                    return !!note && getComputedStyle(note).display !== 'none' && /dynamic/i.test(note.textContent || '');
                }"""
            )
            page.evaluate(
                """() => {
                    const clickStaticEye = () => {
                      const sceneRows = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
                        .filter((row) => row.dataset.depth === '0');
                      const staticScene = sceneRows.find((row) => (row.querySelector('.vm-outliner-row__label')?.textContent || '').trim() === 'static-reference.xyz');
                      staticScene?.querySelector('.vm-outliner-row__eye')?.click();
                    };
                    clickStaticEye();
                    clickStaticEye();
                }"""
            )
            page.locator('#trajectoryFrame').evaluate(
                """(el) => {
                    el.value = '1';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getMoleculeRenderSnapshot?.();
                    if (!snap || snap.atomCount !== 2) return false;
                    const xs = snap.atoms.map((atom) => Number(atom.x) || 0);
                    const spanX = Math.max(...xs) - Math.min(...xs);
                    return /2\\/2/.test(document.getElementById('trajectoryFrameLabel')?.textContent || '')
                      && spanX > 4.5;
                }"""
            )
            page.locator('#trajectoryLoop').evaluate(
                """(el) => {
                    el.checked = false;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.locator('#trajectoryPlayBtn').click()
            page.wait_for_function(
                """() => {
                    const frameLabel = document.getElementById('trajectoryFrameLabel');
                    const playGlyph = document.getElementById('trajectoryPlayBtn')?.querySelector('.motionPanelIconGlyph')?.textContent || '';
                    return /2\\/2/.test(frameLabel?.textContent || '') && playGlyph.trim() === 'play_arrow';
                }"""
            )
            page.locator('#trajectoryLoop').evaluate(
                """(el) => {
                    el.checked = true;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.keyboard.press('v')
            page.wait_for_function(
                """() => {
                    const trajectory = document.getElementById('trajectoryPanel');
                    const panel = document.getElementById('sidePanel');
                    return !!trajectory
                      && trajectory.getAttribute('aria-hidden') === 'true'
                      && !!panel
                      && panel.getAttribute('aria-hidden') === 'false';
                }"""
            )
            page.wait_for_function(
                """() => {
                    const panel = document.getElementById('sidePanel');
                    if (!panel) return false;
                    const style = getComputedStyle(panel);
                    return style.backgroundColor === 'rgb(255, 255, 255)'
                      && style.boxShadow !== 'none';
                }"""
            )
            page.keyboard.press('t')
            page.wait_for_function(
                """() => {
                    const trajectory = document.getElementById('trajectoryPanel');
                    const panel = document.getElementById('sidePanel');
                    return !!trajectory
                      && trajectory.getAttribute('aria-hidden') === 'false'
                      && !!panel
                      && panel.getAttribute('aria-hidden') === 'true';
                }"""
            )
            stored_before_traj = active_structure_summary(page)
            if stored_before_traj['bondCount'] != 1 or stored_before_traj['bondOrigins'] != ['perceived']:
                raise AssertionError(f'Trajectory import stored graph is unexpected: {stored_before_traj}')
            page.locator('#trajectoryFrame').evaluate(
                """(el) => {
                    el.value = '0';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.wait_for_function(
                """() => /1\\/2/.test(document.getElementById('trajectoryFrameLabel')?.textContent || '')"""
            )
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
            install_trajectory_video_export_stubs(page, media_recorder_supported=True)
            page.locator('#trajectorySaveVideoBtn').click()
            page.wait_for_function(
                """() => {
                    const overlay = document.getElementById('trajectoryVideoCropOverlay');
                    const frame = document.getElementById('trajectoryVideoCropFrame');
                    const dims = document.getElementById('trajectoryVideoCropDimensions');
                    const actions = document.getElementById('trajectoryVideoCropActions');
                    return !!overlay
                      && overlay.getAttribute('aria-hidden') === 'false'
                      && overlay.dataset.state === 'selecting'
                      && !!frame
                      && frame.getBoundingClientRect().width >= 320
                      && frame.getBoundingClientRect().height >= 180
                      && !!dims
                      && /\\d+ × \\d+/.test(dims.textContent || '')
                      && !!actions
                      && getComputedStyle(actions).display === 'flex';
                }"""
            )
            crop_initial = page.evaluate(
                """() => {
                    const frame = document.getElementById('trajectoryVideoCropFrame')?.getBoundingClientRect();
                    const dims = document.getElementById('trajectoryVideoCropDimensions')?.textContent || '';
                    const canvas = document.getElementById('canvas')?.getBoundingClientRect();
                    if (!frame || !canvas) return null;
                    return {
                      left: frame.left,
                      top: frame.top,
                      right: frame.right,
                      bottom: frame.bottom,
                      width: frame.width,
                      height: frame.height,
                      centerX: frame.left + frame.width * 0.5,
                      centerY: frame.top + frame.height * 0.5,
                      dims,
                      canvasLeft: canvas.left,
                      canvasTop: canvas.top,
                      canvasRight: canvas.right,
                      canvasBottom: canvas.bottom,
                    };
                }"""
            )
            if not isinstance(crop_initial, dict):
                raise AssertionError(f'Could not read initial trajectory crop rect: {crop_initial!r}')
            page.mouse.move(crop_initial['centerX'], crop_initial['centerY'])
            page.mouse.down()
            page.mouse.move(crop_initial['canvasRight'] + 220, crop_initial['canvasTop'] - 220, steps=8)
            page.mouse.up()
            crop_moved = page.evaluate(
                """() => {
                    const frame = document.getElementById('trajectoryVideoCropFrame')?.getBoundingClientRect();
                    const canvas = document.getElementById('canvas')?.getBoundingClientRect();
                    if (!frame || !canvas) return null;
                    return {
                      left: frame.left,
                      top: frame.top,
                      right: frame.right,
                      bottom: frame.bottom,
                      width: frame.width,
                      height: frame.height,
                      canvasLeft: canvas.left,
                      canvasTop: canvas.top,
                      canvasRight: canvas.right,
                      canvasBottom: canvas.bottom,
                    };
                }"""
            )
            if not isinstance(crop_moved, dict):
                raise AssertionError(f'Could not read moved trajectory crop rect: {crop_moved!r}')
            if crop_moved['left'] < crop_moved['canvasLeft'] - 1 or crop_moved['top'] < crop_moved['canvasTop'] - 1:
                raise AssertionError(f'Trajectory crop move escaped the canvas bounds: {crop_moved}')
            se_box = page.locator("#trajectoryVideoCropFrame .vm-canvas-video-export__handle[data-corner='se']").bounding_box()
            if not se_box:
                raise AssertionError('Could not locate SE crop resize handle.')
            page.mouse.move(se_box['x'] + se_box['width'] * 0.5, se_box['y'] + se_box['height'] * 0.5)
            page.mouse.down()
            page.mouse.move(crop_moved['canvasRight'] + 180, crop_moved['canvasBottom'] + 180, steps=8)
            page.mouse.up()
            crop_resized = page.evaluate(
                """() => {
                    const frame = document.getElementById('trajectoryVideoCropFrame')?.getBoundingClientRect();
                    const dims = document.getElementById('trajectoryVideoCropDimensions')?.textContent || '';
                    const canvas = document.getElementById('canvas')?.getBoundingClientRect();
                    if (!frame || !canvas) return null;
                    return {
                      right: frame.right,
                      bottom: frame.bottom,
                      width: frame.width,
                      height: frame.height,
                      dims,
                      canvasRight: canvas.right,
                      canvasBottom: canvas.bottom,
                    };
                }"""
            )
            if not isinstance(crop_resized, dict):
                raise AssertionError(f'Could not read resized trajectory crop rect: {crop_resized!r}')
            if crop_resized['right'] > crop_resized['canvasRight'] + 1 or crop_resized['bottom'] > crop_resized['canvasBottom'] + 1:
                raise AssertionError(f'Trajectory crop resize escaped the canvas bounds: {crop_resized}')
            if crop_resized['dims'] == crop_initial['dims']:
                raise AssertionError(f'Trajectory crop dimension pill did not update after resize: {crop_initial} -> {crop_resized}')
            nw_box = page.locator("#trajectoryVideoCropFrame .vm-canvas-video-export__handle[data-corner='nw']").bounding_box()
            if not nw_box:
                raise AssertionError('Could not locate NW crop resize handle.')
            shrink_target = page.evaluate(
                """() => {
                    const frame = document.getElementById('trajectoryVideoCropFrame')?.getBoundingClientRect();
                    if (!frame) return null;
                    return {
                      x: frame.right - 12,
                      y: frame.bottom - 12,
                    };
                }"""
            )
            if not isinstance(shrink_target, dict):
                raise AssertionError(f'Could not compute crop shrink target: {shrink_target!r}')
            page.mouse.move(nw_box['x'] + nw_box['width'] * 0.5, nw_box['y'] + nw_box['height'] * 0.5)
            page.mouse.down()
            page.mouse.move(shrink_target['x'], shrink_target['y'], steps=8)
            page.mouse.up()
            crop_min = page.evaluate(
                """() => {
                    const frame = document.getElementById('trajectoryVideoCropFrame')?.getBoundingClientRect();
                    if (!frame) return null;
                    return { width: frame.width, height: frame.height };
                }"""
            )
            if not isinstance(crop_min, dict):
                raise AssertionError(f'Could not read shrunken trajectory crop rect: {crop_min!r}')
            if crop_min['width'] < 159 or crop_min['height'] < 89:
                raise AssertionError(f'Trajectory crop rectangle shrank below the minimum size: {crop_min}')
            page.locator('#trajectoryVideoCropStartBtn').click()
            page.wait_for_function(
                """() => {
                    const overlay = document.getElementById('trajectoryVideoCropOverlay');
                    const saveBtn = document.getElementById('trajectorySaveVideoBtn');
                    const saveGlyph = saveBtn?.querySelector('.motionPanelIconGlyph')?.textContent || '';
                    const playBtn = document.getElementById('trajectoryPlayBtn');
                    const resetBtn = document.getElementById('trajectoryResetBtn');
                    const frame = document.getElementById('trajectoryVideoCropFrame');
                    return !!overlay
                      && overlay.dataset.state === 'recording'
                      && saveGlyph.trim() === 'stop_circle'
                      && !!playBtn
                      && !!resetBtn
                      && playBtn.disabled
                      && resetBtn.disabled
                      && !!frame
                      && getComputedStyle(frame).visibility === 'hidden';
                }"""
            )
            page.wait_for_function("""() => (window.__trajectoryVideoExportTest?.downloads?.length || 0) === 1""")
            export_state = get_trajectory_video_export_stub_state(page)
            if export_state['downloads'][0]['download'] != 'trajectory.webm':
                raise AssertionError(f'Trajectory export used the wrong filename: {export_state}')
            if export_state['recorderStarts'] != 1 or export_state['recorderStops'] != 1:
                raise AssertionError(f'Trajectory export did not start/stop exactly once: {export_state}')
            if not export_state['captureCalls'] or export_state['captureCalls'][0]['width'] <= 0 or export_state['captureCalls'][0]['height'] <= 0:
                raise AssertionError(f'Trajectory export did not request a cropped capture canvas: {export_state}')
            page.wait_for_function(
                """() => {
                    const overlay = document.getElementById('trajectoryVideoCropOverlay');
                    const saveBtn = document.getElementById('trajectorySaveVideoBtn');
                    const playBtn = document.getElementById('trajectoryPlayBtn');
                    const resetBtn = document.getElementById('trajectoryResetBtn');
                    const frameLabel = document.getElementById('trajectoryFrameLabel');
                    const saveGlyph = saveBtn?.querySelector('.motionPanelIconGlyph')?.textContent || '';
                    return !!overlay
                      && overlay.getAttribute('aria-hidden') === 'true'
                      && saveGlyph.trim() === 'videocam'
                      && !!playBtn
                      && !!resetBtn
                      && !playBtn.disabled
                      && !resetBtn.disabled
                      && /2\\/2/.test(frameLabel?.textContent || '');
                }"""
            )
            page.locator('#trajectorySaveVideoBtn').click()
            page.wait_for_function("""() => document.getElementById('trajectoryVideoCropOverlay')?.getAttribute('aria-hidden') === 'false'""")
            page.locator('#trajectoryVideoCropCancelBtn').click()
            page.wait_for_function("""() => document.getElementById('trajectoryVideoCropOverlay')?.getAttribute('aria-hidden') === 'true'""")
            export_state = get_trajectory_video_export_stub_state(page)
            if len(export_state['downloads']) != 1:
                raise AssertionError(f'Trajectory crop cancel unexpectedly downloaded a file: {export_state}')
            page.locator('#trajectoryFps').evaluate(
                """(el) => {
                    el.value = '1';
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.locator('#trajectorySaveVideoBtn').click()
            page.wait_for_function("""() => document.getElementById('trajectoryVideoCropOverlay')?.dataset.state === 'selecting'""")
            page.locator('#trajectoryVideoCropStartBtn').click()
            page.wait_for_function("""() => document.getElementById('trajectoryVideoCropOverlay')?.dataset.state === 'recording'""")
            page.locator('#trajectorySaveVideoBtn').click()
            page.wait_for_function("""() => (window.__trajectoryVideoExportTest?.downloads?.length || 0) === 2""")
            page.wait_for_function("""() => document.getElementById('trajectoryVideoCropOverlay')?.getAttribute('aria-hidden') === 'true'""")
            page.locator('#trajectorySaveVideoBtn').click()
            page.wait_for_function("""() => document.getElementById('trajectoryVideoCropOverlay')?.dataset.state === 'selecting'""")
            page.locator('#trajectoryVideoCropStartBtn').click()
            page.wait_for_function("""() => document.getElementById('trajectoryVideoCropOverlay')?.dataset.state === 'recording'""")
            page.locator('#trajectoryPanelClose').click()
            page.wait_for_function("""() => document.getElementById('trajectoryPanel')?.getAttribute('aria-hidden') === 'true'""")
            page.wait_for_timeout(100)
            export_state = get_trajectory_video_export_stub_state(page)
            if len(export_state['downloads']) != 2:
                raise AssertionError(f'Trajectory close-during-record unexpectedly downloaded a file: {export_state}')
            page.keyboard.press('t')
            page.wait_for_function("""() => document.getElementById('trajectoryPanel')?.getAttribute('aria-hidden') === 'false'""")
            install_trajectory_video_export_stubs(page, media_recorder_supported=False)
            page.locator('#trajectoryPanelClose').click()
            page.keyboard.press('t')
            page.wait_for_function(
                """() => {
                    const panel = document.getElementById('trajectoryPanel');
                    const btn = document.getElementById('trajectorySaveVideoBtn');
                    return !!panel
                      && panel.getAttribute('aria-hidden') === 'false'
                      && !!btn
                      && btn.disabled
                      && btn.getAttribute('data-tooltip') === 'Video export not supported in this browser';
                }"""
            )
            log_step('vibration video export smoke')
            install_trajectory_video_export_stubs(page, media_recorder_supported=True)
            vibration_xyz_text = build_fixture_inferred_xyz()
            vibration_payload_text = build_fixture_vibration_payload()
            page.evaluate(
                """async ({ xyzText, payloadText }) => {
                    await window.VibeMolEmbed.loadFiles([
                      { name: 'vibration-export.xyz', text: xyzText },
                      { name: 'vibration-export.vib.json', text: payloadText },
                    ]);
                }""",
                {'xyzText': vibration_xyz_text, 'payloadText': vibration_payload_text},
            )
            page.wait_for_function(
                """() => {
                    const btn = document.getElementById('vibrationPanelBtn');
                    const saveBtn = document.getElementById('vibrationSaveVideoBtn');
                    const rows = document.querySelectorAll('#vibrationModeTableBody tr[data-mode-index]');
                    return !!btn
                      && getComputedStyle(btn).display !== 'none'
                      && !btn.hidden
                      && !!saveBtn
                      && rows.length === 1;
                }"""
            )
            vibration_panel_hidden = page.evaluate(
                """() => document.getElementById('vibrationPanel')?.getAttribute('aria-hidden') !== 'false'"""
            )
            if vibration_panel_hidden:
                page.keyboard.press('f')
            page.wait_for_function(
                """() => {
                    const panel = document.getElementById('vibrationPanel');
                    const saveBtn = document.getElementById('vibrationSaveVideoBtn');
                    const rows = document.querySelectorAll('#vibrationModeTableBody tr[data-mode-index]');
                    return !!panel
                      && panel.getAttribute('aria-hidden') === 'false'
                      && !!saveBtn
                      && !saveBtn.disabled
                      && rows.length === 1;
                }"""
            )
            page.locator('#vibrationSpeed').evaluate(
                """(el) => {
                    el.value = '8.00';
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.locator('#vibrationSaveVideoBtn').click()
            page.wait_for_function(
                """() => {
                    const overlay = document.getElementById('vibrationVideoCropOverlay');
                    const frame = document.getElementById('vibrationVideoCropFrame');
                    const dims = document.getElementById('vibrationVideoCropDimensions');
                    const actions = document.getElementById('vibrationVideoCropActions');
                    return !!overlay
                      && overlay.getAttribute('aria-hidden') === 'false'
                      && overlay.dataset.state === 'selecting'
                      && !!frame
                      && frame.getBoundingClientRect().width >= 320
                      && frame.getBoundingClientRect().height >= 180
                      && !!dims
                      && /\\d+ × \\d+/.test(dims.textContent || '')
                      && !!actions
                      && getComputedStyle(actions).display === 'flex';
                }"""
            )
            page.locator('#vibrationVideoCropStartBtn').click()
            page.wait_for_function(
                """() => {
                    const overlay = document.getElementById('vibrationVideoCropOverlay');
                    const saveBtn = document.getElementById('vibrationSaveVideoBtn');
                    const saveGlyph = saveBtn?.querySelector('.motionPanelIconGlyph')?.textContent || '';
                    const playBtn = document.getElementById('vibrationPlayBtn');
                    const resetBtn = document.getElementById('vibrationResetBtn');
                    const frame = document.getElementById('vibrationVideoCropFrame');
                    return !!overlay
                      && overlay.dataset.state === 'recording'
                      && saveGlyph.trim() === 'stop_circle'
                      && !!playBtn
                      && !!resetBtn
                      && playBtn.disabled
                      && resetBtn.disabled
                      && !!frame
                      && getComputedStyle(frame).visibility === 'hidden';
                }"""
            )
            page.wait_for_function("""() => (window.__trajectoryVideoExportTest?.downloads?.length || 0) === 1""")
            export_state = get_trajectory_video_export_stub_state(page)
            if export_state['downloads'][0]['download'] != 'vibration.webm':
                raise AssertionError(f'Vibration export used the wrong filename: {export_state}')
            if export_state['recorderStarts'] != 1 or export_state['recorderStops'] != 1:
                raise AssertionError(f'Vibration export did not start/stop exactly once: {export_state}')
            page.wait_for_function(
                """() => {
                    const overlay = document.getElementById('vibrationVideoCropOverlay');
                    const saveBtn = document.getElementById('vibrationSaveVideoBtn');
                    const playBtn = document.getElementById('vibrationPlayBtn');
                    const resetBtn = document.getElementById('vibrationResetBtn');
                    const saveGlyph = saveBtn?.querySelector('.motionPanelIconGlyph')?.textContent || '';
                    return !!overlay
                      && overlay.getAttribute('aria-hidden') === 'true'
                      && saveGlyph.trim() === 'videocam'
                      && !!playBtn
                      && !!resetBtn
                      && !playBtn.disabled
                      && !resetBtn.disabled;
                }"""
            )
            page.locator('#vibrationSaveVideoBtn').click()
            page.wait_for_function("""() => document.getElementById('vibrationVideoCropOverlay')?.getAttribute('aria-hidden') === 'false'""")
            page.locator('#vibrationVideoCropCancelBtn').click()
            page.wait_for_function("""() => document.getElementById('vibrationVideoCropOverlay')?.getAttribute('aria-hidden') === 'true'""")
            export_state = get_trajectory_video_export_stub_state(page)
            if len(export_state['downloads']) != 1:
                raise AssertionError(f'Vibration crop cancel unexpectedly downloaded a file: {export_state}')
            page.locator('#vibrationSpeed').evaluate(
                """(el) => {
                    el.value = '1.00';
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.locator('#vibrationSaveVideoBtn').click()
            page.wait_for_function("""() => document.getElementById('vibrationVideoCropOverlay')?.dataset.state === 'selecting'""")
            page.locator('#vibrationVideoCropStartBtn').click()
            page.wait_for_function("""() => document.getElementById('vibrationVideoCropOverlay')?.dataset.state === 'recording'""")
            page.locator('#vibrationSaveVideoBtn').click()
            page.wait_for_function("""() => (window.__trajectoryVideoExportTest?.downloads?.length || 0) === 2""")
            page.wait_for_function("""() => document.getElementById('vibrationVideoCropOverlay')?.getAttribute('aria-hidden') === 'true'""")
            page.locator('#vibrationSaveVideoBtn').click()
            page.wait_for_function("""() => document.getElementById('vibrationVideoCropOverlay')?.dataset.state === 'selecting'""")
            page.locator('#vibrationVideoCropStartBtn').click()
            page.wait_for_function("""() => document.getElementById('vibrationVideoCropOverlay')?.dataset.state === 'recording'""")
            page.locator('#vibrationPanelClose').click()
            page.wait_for_function("""() => document.getElementById('vibrationPanel')?.getAttribute('aria-hidden') === 'true'""")
            page.wait_for_timeout(100)
            export_state = get_trajectory_video_export_stub_state(page)
            if len(export_state['downloads']) != 2:
                raise AssertionError(f'Vibration close-during-record unexpectedly downloaded a file: {export_state}')
            install_trajectory_video_export_stubs(page, media_recorder_supported=False)
            page.keyboard.press('f')
            page.wait_for_function(
                """() => {
                    const panel = document.getElementById('vibrationPanel');
                    const btn = document.getElementById('vibrationSaveVideoBtn');
                    return !!panel
                      && panel.getAttribute('aria-hidden') === 'false'
                      && !!btn
                      && btn.disabled
                      && btn.getAttribute('data-tooltip') === 'Video export not supported in this browser';
                }"""
            )
            page.evaluate(
                """async (text) => {
                    await window.VibeMolEmbed.loadFiles([{ name: 'dynamic-traj.xyz', text }]);
                }""",
                trajectory_xyz_text,
            )
            page.wait_for_function(
                """() => {
                    const btn = document.getElementById('trajectoryPanelBtn');
                    return !!btn && !btn.hidden && getComputedStyle(btn).display !== 'none';
                }"""
            )
            trajectory_panel_hidden = page.evaluate(
                """() => document.getElementById('trajectoryPanel')?.getAttribute('aria-hidden') !== 'false'"""
            )
            if trajectory_panel_hidden:
                page.keyboard.press('t')
            page.wait_for_function(
                """() => document.getElementById('trajectoryPanel')?.getAttribute('aria-hidden') === 'false'"""
            )
            page.locator('#modeMeasureBtn').click()
            page.wait_for_function(
                """() => {
                    const measureBtn = document.getElementById('modeMeasureBtn');
                    const menu = document.getElementById('displayWindowAdaptiveMenu');
                    const trajectoryBtn = document.getElementById('trajectoryPanelBtn');
                    const trajectory = document.getElementById('trajectoryPanel');
                    return !!measureBtn
                      && measureBtn.classList.contains('active')
                      && !!menu
                      && menu.getAttribute('aria-hidden') === 'false'
                      && !!trajectoryBtn
                      && !trajectoryBtn.hidden
                      && getComputedStyle(trajectoryBtn).display !== 'none'
                      && !!trajectory
                      && trajectory.getAttribute('aria-hidden') === 'false';
                }"""
            )
            page.locator('#trajectoryFrame').evaluate(
                """(el) => {
                    el.value = '0';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.wait_for_function(
                """() => /1\\/2/.test(document.getElementById('trajectoryFrameLabel')?.textContent || '')"""
            )
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
            start_new_edit_file(page)
            load_build_query(page, 'Carbon')
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
            start_new_edit_file(page)
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
            load_build_query(page, 'hydroxyl')
            page.wait_for_function(
                """() => document.querySelector('#editFragmentQuick button[data-fragment-id="hydroxyl"]')?.classList.contains('active') === true"""
            )
            ensure_build_popover_closed(page)
            metal_anchor_x, metal_anchor_y = find_atom_click_point(page, 0)
            right_click_atom(page, metal_anchor_x, metal_anchor_y)
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

            log_step('fragment attach Smart on methane resolves to Replace H')
            start_new_edit_file(page)
            build_methane(page)
            load_build_query(page, 'methyl')
            set_select_value(page, '#editFragmentAttachPolicy', 'smart')
            attach_fragment_from_anchor(page, 0)
            wait_for_hint_contains(page, 'Attached Methyl via Replace H')
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    const bonds = Array.isArray(exported.volume?.bonds) ? exported.volume.bonds : [];
                    const carbons = atoms.filter((atom) => Number(atom?.Z) === 6).length;
                    const hydrogens = atoms.filter((atom) => Number(atom?.Z) === 1).length;
                    return atoms.length === 8 && bonds.length === 7 && carbons === 2 && hydrogens === 6;
                }"""
            )

            log_step('fragment cue replace target keeps anchor selected and cue armed')
            start_new_edit_file(page)
            build_methane(page)
            load_build_query(page, 'methyl')
            set_select_value(page, '#editFragmentAttachPolicy', 'smart')
            arm_fragment_attach_cue(page, 0)
            replace_target = page.evaluate(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    const bonds = Array.isArray(exported.volume?.bonds) ? exported.volume.bonds : [];
                    const anchor = atoms[0] || null;
                    const anchorId = anchor && anchor.id != null ? String(anchor.id) : '';
                    if (!anchorId) return -1;
                    const hydrogenId = bonds.flatMap((bond) => {
                        const aId = String(bond.a || '');
                        const bId = String(bond.b || '');
                        if (aId === anchorId) return [bId];
                        if (bId === anchorId) return [aId];
                        return [];
                    }).find((atomId) => Number(atoms.find((atom) => String(atom.id || '') === String(atomId || ''))?.Z) === 1) || '';
                    return atoms.findIndex((atom) => String(atom.id || '') === String(hydrogenId || ''));
                }"""
            )
            if not isinstance(replace_target, int) or replace_target < 0:
                raise AssertionError(f'Could not resolve cue replace-target hydrogen: {replace_target!r}')
            trigger_replace_target(page, replace_target)
            wait_for_hint_contains(page, 'Attached Methyl via Replace H')
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atomCount = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms.length : 0;
                    const cuePressed = document.getElementById('editSelectionAddFragmentCueButton')?.getAttribute('aria-pressed') === 'true';
                    const selection = Array.isArray(window.VibeMolTesting?.getEditSelectionIndices?.())
                      ? window.VibeMolTesting.getEditSelectionIndices()
                      : [];
                    return atomCount === 8
                      && cuePressed
                      && selection.length === 1
                      && Number(selection[0]) === 0;
                }"""
            )

            log_step('fragment attach Smart on bare carbon resolves to Append')
            start_new_edit_file(page)
            build_bare_carbon(page)
            load_build_query(page, 'methyl')
            set_select_value(page, '#editFragmentAttachPolicy', 'smart')
            attach_fragment_from_anchor(page, 0)
            wait_for_hint_contains(page, 'Attached Methyl via Append')
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    const bonds = Array.isArray(exported.volume?.bonds) ? exported.volume.bonds : [];
                    const carbons = atoms.filter((atom) => Number(atom?.Z) === 6).length;
                    const hydrogens = atoms.filter((atom) => Number(atom?.Z) === 1).length;
                    return atoms.length === 5 && bonds.length === 4 && carbons === 2 && hydrogens === 3;
                }"""
            )

            log_step('fragment attach Smart on open-site ghost resolves to Append with open-site hint')
            start_new_edit_file(page)
            build_methane(page)
            hydrogen_x, hydrogen_y = find_atom_click_point(page, 1)
            right_click_atom(page, hydrogen_x, hydrogen_y)
            wait_for_selected_atoms(page, 1)
            set_checkbox_state(page, '#editAddAdjustHydrogens', False)
            page.keyboard.press('Delete')
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    const hydrogens = atoms.filter((atom) => Number(atom?.Z) === 1).length;
                    return atoms.length === 4 && hydrogens === 3;
                }"""
            )
            load_build_query(page, 'methyl')
            set_select_value(page, '#editFragmentAttachPolicy', 'smart')
            arm_fragment_attach_cue(page, 0)
            page.wait_for_function("""() => window.VibeMolTesting?.getHaloGhostPreviewKind?.() === 'fragment'""")
            ghost_attach = page.evaluate(
                """() => {
                    if (!window.VibeMolTesting || typeof window.VibeMolTesting.triggerHaloGhostByIndex !== 'function') return null;
                    return window.VibeMolTesting.triggerHaloGhostByIndex(0);
                }"""
            )
            if not (isinstance(ghost_attach, dict) and bool(ghost_attach.get('attached'))):
                raise AssertionError(f'Could not trigger open-site fragment attach via halo ghost: {ghost_attach!r}')
            wait_for_hint_contains(page, 'Attached Methyl via Append (open site)')
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    const bonds = Array.isArray(exported.volume?.bonds) ? exported.volume.bonds : [];
                    const carbons = atoms.filter((atom) => Number(atom?.Z) === 6).length;
                    const hydrogens = atoms.filter((atom) => Number(atom?.Z) === 1).length;
                    return atoms.length === 8 && bonds.length === 7 && carbons === 2 && hydrogens === 6;
                }"""
            )

            log_step('fragment attach Append keeps host hydrogens')
            start_new_edit_file(page)
            build_methane(page)
            load_build_query(page, 'methyl')
            set_select_value(page, '#editFragmentAttachPolicy', 'append')
            attach_fragment_from_anchor(page, 0)
            wait_for_hint_contains(page, 'Attached Methyl via Append')
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    const bonds = Array.isArray(exported.volume?.bonds) ? exported.volume.bonds : [];
                    const carbons = atoms.filter((atom) => Number(atom?.Z) === 6).length;
                    const hydrogens = atoms.filter((atom) => Number(atom?.Z) === 1).length;
                    return atoms.length === 9 && bonds.length === 8 && carbons === 2 && hydrogens === 7;
                }"""
            )

            log_step('fragment attach explicit Replace H on methane resolves to Replace H')
            start_new_edit_file(page)
            build_methane(page)
            load_build_query(page, 'methyl')
            set_select_value(page, '#editFragmentAttachPolicy', 'replace_h')
            attach_fragment_from_anchor(page, 0)
            wait_for_hint_contains(page, 'Attached Methyl via Replace H')
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    const bonds = Array.isArray(exported.volume?.bonds) ? exported.volume.bonds : [];
                    return atoms.length === 8 && bonds.length === 7;
                }"""
            )

            log_step('fragment attach explicit Replace H falls back to Append when no host hydrogen exists')
            start_new_edit_file(page)
            build_bare_carbon(page)
            load_build_query(page, 'methyl')
            set_select_value(page, '#editFragmentAttachPolicy', 'replace_h')
            attach_fragment_from_anchor(page, 0)
            wait_for_hint_contains(page, 'Attached Methyl via Append (no H to replace)')
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    const bonds = Array.isArray(exported.volume?.bonds) ? exported.volume.bonds : [];
                    return atoms.length === 5 && bonds.length === 4;
                }"""
            )

            log_step('fragment attach explicit Replace H falls back when fragment lacks replace_h support')
            start_new_edit_file(page)
            build_methane(page)
            load_build_query(page, 'appendmethyl')
            set_select_value(page, '#editFragmentAttachPolicy', 'replace_h')
            attach_fragment_from_anchor(page, 0)
            wait_for_hint_contains(page, 'via Append (fragment does not support Replace H)')
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const atoms = Array.isArray(exported.volume?.atoms) ? exported.volume.atoms : [];
                    const bonds = Array.isArray(exported.volume?.bonds) ? exported.volume.bonds : [];
                    return atoms.length === 9 && bonds.length === 8;
                }"""
            )

            log_step('clicking a bond with a fusion-capable fragment enters fuse preview regardless of policy')
            start_new_edit_file(page)
            page.evaluate('(text) => window.VibeMolStructure.importFromText(text, "fusion-bond-fixture")', build_fixture_structure())
            set_focused_scene_visible(page, True)
            page.wait_for_function(
                """() => {
                    const exported = window.VibeMolStructure.exportActive();
                    const bonds = Array.isArray(exported.volume?.bonds) ? exported.volume.bonds : [];
                    return bonds.length === 1;
                }"""
            )
            load_build_query(page, 'fusionphenyl')
            set_select_value(page, '#editFragmentAttachPolicy', 'append')
            midpoint_x, midpoint_y = find_bond_midpoint_canvas_point(page)
            page.mouse.click(midpoint_x, midpoint_y)
            page.wait_for_function("""() => !!window.VibeMolTesting?.isFuseRingPreviewActive?.()""")
            wait_for_hint_contains(page, 'Fuse ring preview: Fusion phenyl')

            log_step('clicking a bond with a non-fusion fragment leaves fuse preview inactive')
            load_build_query(page, 'methyl')
            page.wait_for_function("""() => window.VibeMolTesting?.isFuseRingPreviewActive?.() === false""")
            midpoint_x, midpoint_y = find_bond_midpoint_canvas_point(page)
            page.mouse.click(midpoint_x, midpoint_y)
            page.wait_for_timeout(120)
            if page.evaluate("""() => !!window.VibeMolTesting?.isFuseRingPreviewActive?.()"""):
                raise AssertionError('Non-fusion fragment unexpectedly entered fuse-ring preview.')
            wait_for_hint_contains(page, 'This fragment cannot fuse to a bond.')

            log_step('grow drag onto terminal hydrogen replaces it with loaded atom')
            start_new_edit_file(page)
            build_methane(page)
            load_build_query(page, 'Carbon')
            set_checkbox_state(page, '#editAddAdjustHydrogens', True)
            set_select_value(page, '#editAddCoordination', 'tetrahedral')
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
            replace_terminal_hydrogen_from_anchor(
                page,
                replace_target['heavyIndex'],
                replace_target['hydrogenIndex'],
            )
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

            log_step('wboit surface transparency')
            page.locator('#modeDisplayBtn').click()
            page.wait_for_function(
                """() => {
                    const btn = document.getElementById('modeDisplayBtn');
                    return !!btn && btn.classList.contains('active');
                }"""
            )
            load_volume_asset(page, '/assets/data/sample.cube')
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getWboitSnapshot?.();
                    return !!snap && snap.transparentMeshCount >= 2;
                }"""
            )
            page.wait_for_function(
                """() => !document.getElementById('styleSelect')
                  && !document.getElementById('appearanceSurfaceStyleGroup')"""
            )
            page.wait_for_function(
                """() => {
                    const row = document.getElementById('rowSurfaceMaterialPreset');
                    const select = document.getElementById('surfaceMaterialPreset');
                    if (!(row && select)) return false;
                    const options = Array.from(select.options || []).map((opt) => String(opt.textContent || '').trim());
                    return options.join('|') === 'Emissive|Matte|Satin|Lacquer|Metal|Gel|Ceramic'
                      && String(select.value || '') === 'emissive';
                }"""
            )
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getWboitSnapshot?.();
                    const materials = window.VibeMolTesting?.getSurfaceMaterialSnapshot?.() || [];
                    return !!snap
                      && snap.sceneEnvironmentPresent === true
                      && snap.sceneEnvironmentLoaded === true
                      && snap.surfaceMaterialPreset === 'emissive'
                      && Math.abs(Number(snap.surfaceRoughness || 0) - 1.0) < 1e-3
                      && Math.abs(Number(snap.surfaceMetalness || 0) - 0.0) < 1e-3
                      && Math.abs(Number(snap.surfaceReflectivity || 0) - 0.5) < 1e-3
                      && Math.abs(Number(snap.surfaceEmissiveIntensity || 0) - 0.8) < 1e-3
                      && materials.length >= 2
                      && materials.every((mat) => String(mat.surfaceStyle || '') === 'solid')
                      && materials.every((mat) => String(mat.surfaceMaterialPreset || '') === 'emissive')
                      && materials.every((mat) => Math.abs(Number(mat.roughness || 0) - 1.0) < 1e-3)
                      && materials.every((mat) => Math.abs(Number(mat.metalness || 0) - 0.0) < 1e-3)
                      && materials.every((mat) => Math.abs(Number(mat.clearcoat || 0) - 1.0) < 1e-3)
                      && materials.every((mat) => Math.abs(Number(mat.clearcoatRoughness || 0) - 0.1) < 1e-3)
                      && materials.every((mat) => Math.abs(Number(mat.reflectivity || 0) - 0.5) < 1e-3)
                      && materials.every((mat) => Math.abs(Number(mat.emissiveIntensity || 0) - 0.8) < 1e-3)
                      && materials.every((mat) => Math.abs(Number(mat.envMapIntensity || 0) - 0.0) < 1e-3);
                }"""
            )
            page.evaluate(
                """() => {
                    const el = document.getElementById('surfaceMaterialPreset');
                    if (!el) return;
                    el.value = 'ceramic';
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getWboitSnapshot?.();
                    const materials = window.VibeMolTesting?.getSurfaceMaterialSnapshot?.() || [];
                    return !!snap
                      && snap.sceneEnvironmentPresent === true
                      && snap.sceneEnvironmentLoaded === true
                      && snap.surfaceMaterialPreset === 'ceramic'
                      && Math.abs(Number(snap.surfaceRoughness || 0) - 0.35) < 1e-3
                      && Math.abs(Number(snap.surfaceMetalness || 0) - 0.0) < 1e-3
                      && Math.abs(Number(snap.surfaceReflectivity || 0) - 0.5) < 1e-3
                      && Math.abs(Number(snap.surfaceEmissiveIntensity || 0) - 0.2) < 1e-3
                      && materials.length >= 2
                      && materials.every((mat) => String(mat.surfaceStyle || '') === 'solid')
                      && materials.every((mat) => String(mat.surfaceMaterialPreset || '') === 'ceramic')
                      && materials.every((mat) => Math.abs(Number(mat.roughness || 0) - 0.35) < 1e-3)
                      && materials.every((mat) => Math.abs(Number(mat.metalness || 0) - 0.0) < 1e-3)
                      && materials.every((mat) => Math.abs(Number(mat.clearcoat || 0) - 0.8) < 1e-3)
                      && materials.every((mat) => Math.abs(Number(mat.clearcoatRoughness || 0) - 0.1) < 1e-3)
                      && materials.every((mat) => Math.abs(Number(mat.reflectivity || 0) - 0.5) < 1e-3)
                      && materials.every((mat) => Math.abs(Number(mat.emissiveIntensity || 0) - 0.2) < 1e-3)
                      && materials.every((mat) => Math.abs(Number(mat.envMapIntensity || 0) - 0.65) < 1e-3);
                }"""
            )
            page.evaluate(
                """() => {
                    const el = document.getElementById('surfaceMaterialPreset');
                    if (!el) return;
                    el.value = 'emissive';
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.evaluate(
                """() => {
                    const el = document.getElementById('opacity');
                    if (!el) return;
                    el.value = '1.0';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getWboitSnapshot?.();
                    return !!snap && snap.surfaceMaterialPreset === 'emissive' && snap.surfaceStyle === 'solid' && snap.active === false;
                }"""
            )
            page.evaluate(
                """() => {
                    const el = document.getElementById('opacity');
                    if (!el) return;
                    el.value = '0.5';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getWboitSnapshot?.();
                    return !!snap
                      && snap.surfaceMaterialPreset === 'emissive'
                      && snap.surfaceStyle === 'solid'
                      && snap.surfaceOpacity < 0.999
                      && (snap.supported ? snap.active === true : snap.fallback === true);
                }"""
            )
            page.evaluate(
                """() => {
                    const el = document.getElementById('opacity');
                    if (!el) return;
                    el.value = '1.0';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getWboitSnapshot?.();
                    return !!snap
                      && snap.surfaceMaterialPreset === 'emissive'
                      && snap.surfaceStyle === 'solid'
                      && snap.surfaceOpacity >= 0.999
                      && snap.active === false;
                }"""
            )

            log_step('wboit cloud transparency')
            load_volume_asset(page, '/assets/data/sample.cube')
            page.evaluate(
                """() => {
                    const el = document.getElementById('renderMode');
                    if (!el) return;
                    el.value = 'cloud';
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.wait_for_function(
                """() => {
                    const row = document.getElementById('rowCloudType');
                    const select = document.getElementById('cloudType');
                    const snap = window.VibeMolTesting?.getWboitSnapshot?.();
                    const clouds = window.VibeMolTesting?.getCloudMaterialSnapshot?.() || [];
                    return !!select
                      && !!row
                      && !row.classList.contains('vm-appearance-hidden')
                      && getComputedStyle(row).display !== 'none'
                      && !document.getElementById('rowCloudStride')
                      && !document.getElementById('cloudStride')
                      && !document.getElementById('rowCloudAlpha')
                      && !document.getElementById('cloudAlpha')
                      && Array.from(select.options || []).map((opt) => String(opt.value || '')).join('|') === 'cubes|points'
                      && !!snap
                      && snap.renderMode === 'cloud'
                      && snap.cloudType === 'cubes'
                      && snap.cloudRenderableCount >= 2
                      && clouds.length >= 2
                      && clouds.every((entry) => entry.objectType === 'instanced-mesh')
                      && clouds.every((entry) => entry.cloudKind === 'scalar-cubes')
                      && snap.surfaceOpacity >= 0.999
                      && snap.active === false;
                }"""
            )
            page.evaluate(
                """() => {
                    const el = document.getElementById('opacity');
                    if (!el) return;
                    el.value = '0.5';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getWboitSnapshot?.();
                    const clouds = window.VibeMolTesting?.getCloudMaterialSnapshot?.() || [];
                    return !!snap
                      && snap.renderMode === 'cloud'
                      && snap.cloudType === 'cubes'
                      && snap.surfaceOpacity < 0.999
                      && clouds.length >= 2
                      && clouds.every((entry) => entry.objectType === 'instanced-mesh')
                      && (snap.supported ? snap.active === true : snap.fallback === true);
                }"""
            )
            page.evaluate(
                """() => {
                    const el = document.getElementById('cloudType');
                    if (!el) return;
                    el.value = 'points';
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getWboitSnapshot?.();
                    const clouds = window.VibeMolTesting?.getCloudMaterialSnapshot?.() || [];
                    return !!snap
                      && snap.renderMode === 'cloud'
                      && snap.cloudType === 'points'
                      && snap.cloudRenderableCount >= 2
                      && clouds.length >= 2
                      && clouds.every((entry) => entry.objectType === 'points')
                      && clouds.every((entry) => entry.cloudKind === 'scalar-points')
                      && clouds.every((entry) => entry.depthTest === true)
                      && (snap.supported ? snap.active === true : snap.fallback === true);
                }"""
            )

            log_step('2c spinor labels and info')
            load_volume_asset(page, '/assets/data/sample.cube')
            page.wait_for_function(
                """() => {
                    const overlay = document.getElementById('twoComponentSplitOverlay');
                    const btn = document.getElementById('spinorInfoBtn');
                    const panel = document.getElementById('spinorInfoPanel');
                    const overlayHidden = !overlay || overlay.hidden || overlay.getAttribute('aria-hidden') === 'true';
                    const btnHidden = !btn || btn.hidden || btn.offsetParent === null;
                    const panelHidden = !panel || panel.getAttribute('aria-hidden') !== 'false';
                    return overlayHidden && btnHidden && panelHidden;
                }"""
            )
            load_volume_asset(page, '/assets/data/2ccubes/orbital_0.2ccube')
            page.wait_for_function(
                """() => {
                    const overlay = document.getElementById('twoComponentSplitOverlay');
                    const alpha = document.getElementById('twoComponentAlphaRegion');
                    const beta = document.getElementById('twoComponentBetaRegion');
                    const modeRow = document.getElementById('twoComponentModeRow');
                    const modeSelect = document.getElementById('twoComponentModeSelect');
                    const btn = document.getElementById('spinorInfoBtn');
                    const optionValues = modeSelect ? Array.from(modeSelect.options || []).map((opt) => String(opt.value || '').trim()) : [];
                    const optionLabels = modeSelect ? Array.from(modeSelect.options || []).map((opt) => String(opt.textContent || '').trim()) : [];
                    return !!overlay
                      && overlay.hidden === false
                      && overlay.getAttribute('aria-hidden') === 'false'
                      && !!alpha
                      && !!beta
                      && !!modeRow
                      && !modeRow.classList.contains('vm-appearance-hidden')
                      && !!modeSelect
                      && optionValues.join('|') === 'alphaRe|alphaIm|betaRe|betaIm|alphaPhase|betaPhase|alphaBetaPhase|totalBloch'
                      && optionLabels.join('|') === 'Re(ψ^α)|Im(ψ^α)|Re(ψ^β)|Im(ψ^β)|ψ^α (phase)|ψ^β (phase)|ψ^α ‖ ψ^β|Ψ (Bloch)'
                      && alpha.getAttribute('aria-label') === 'Alpha spin component'
                      && beta.getAttribute('aria-label') === 'Beta spin component'
                      && String(alpha.textContent || '').includes('α')
                      && String(beta.textContent || '').includes('β')
                      && !!btn
                      && btn.hidden === false
                      && btn.offsetParent !== null;
                }"""
            )
            page.click('#spinorInfoBtn')
            page.wait_for_function(
                """() => {
                    const panel = document.getElementById('spinorInfoPanel');
                    const wheel = document.getElementById('spinorInfoPhaseWheel');
                    const text = String(panel?.textContent || '');
                    return !!panel
                      && panel.getAttribute('aria-hidden') === 'false'
                      && !!wheel
                      && wheel.hidden === false
                      && text.includes('Two-component spinor')
                      && text.includes('Alpha (left) and beta (right) are the two spin components of the wavefunction.')
                      && text.includes('Color encodes phase for each component.')
                      && text.includes('Isosurface encloses regions where each component exceeds the iso level.');
                }"""
            )
            set_select_value(page, '#twoComponentModeSelect', 'alphaRe')
            page.wait_for_function(
                """() => {
                    const panel = document.getElementById('spinorInfoPanel');
                    const wheel = document.getElementById('spinorInfoPhaseWheel');
                    const text = String(panel?.textContent || '');
                    return !!panel
                      && panel.getAttribute('aria-hidden') === 'false'
                      && !!wheel
                      && wheel.hidden === true
                      && text.includes('Real part of the spin alpha wavefunction.')
                      && text.includes('Positive and negative lobes show the sign of that component.')
                      && text.includes('Isosurface encloses regions where the real alpha component exceeds the iso level.');
                }"""
            )
            set_select_value(page, '#twoComponentModeSelect', 'alphaBetaPhase')
            page.wait_for_function(
                """() => {
                    const panel = document.getElementById('spinorInfoPanel');
                    const wheel = document.getElementById('spinorInfoPhaseWheel');
                    const text = String(panel?.textContent || '');
                    return !!panel
                      && panel.getAttribute('aria-hidden') === 'false'
                      && !!wheel
                      && wheel.hidden === false
                      && text.includes('Alpha (left) and beta (right) are the two spin components of the wavefunction.');
                }"""
            )
            page.click('#spinorInfoBtn')
            page.wait_for_function(
                """() => {
                    const panel = document.getElementById('spinorInfoPanel');
                    return !!panel && panel.getAttribute('aria-hidden') === 'true';
                }"""
            )
            page.click('#spinorInfoBtn')
            page.wait_for_function(
                """() => {
                    const panel = document.getElementById('spinorInfoPanel');
                    return !!panel && panel.getAttribute('aria-hidden') === 'false';
                }"""
            )
            page.keyboard.press('Escape')
            page.wait_for_function(
                """() => {
                    const panel = document.getElementById('spinorInfoPanel');
                    return !!panel && panel.getAttribute('aria-hidden') === 'true';
                }"""
            )
            page.click('#spinorInfoBtn')
            page.wait_for_function(
                """() => {
                    const panel = document.getElementById('spinorInfoPanel');
                    return !!panel && panel.getAttribute('aria-hidden') === 'false';
                }"""
            )
            page.evaluate(
                """() => {
                    const drop = document.getElementById('drop');
                    if (!drop) return;
                    drop.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                }"""
            )
            page.wait_for_function(
                """() => {
                    const panel = document.getElementById('spinorInfoPanel');
                    return !!panel && panel.getAttribute('aria-hidden') === 'true';
                }"""
            )
            load_volume_asset(page, '/assets/data/sample.cube')
            page.wait_for_function(
                """() => {
                    const overlay = document.getElementById('twoComponentSplitOverlay');
                    const btn = document.getElementById('spinorInfoBtn');
                    const panel = document.getElementById('spinorInfoPanel');
                    const overlayHidden = !overlay || overlay.hidden || overlay.getAttribute('aria-hidden') === 'true';
                    const btnHidden = !btn || btn.hidden || btn.offsetParent === null;
                    const panelHidden = !panel || panel.getAttribute('aria-hidden') !== 'false';
                    return overlayHidden && btnHidden && panelHidden;
                }"""
            )

            log_step('wboit 2c alpha/beta split view')
            load_volume_asset(page, '/assets/data/2ccubes/orbital_0.2ccube')
            page.wait_for_function("() => !!document.getElementById('twoComponentModeSelect')")
            page.evaluate(
                """() => {
                    const mode = document.getElementById('renderMode');
                    if (!mode) return;
                    mode.value = 'surface';
                    mode.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            set_select_value(page, '#twoComponentModeSelect', 'alphaBetaPhase')
            page.evaluate(
                """() => {
                    const el = document.getElementById('opacity');
                    if (!el) return;
                    el.value = '0.5';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.wait_for_function(
                """() => {
                    const mode = document.getElementById('twoComponentModeSelect');
                    const snap = window.VibeMolTesting?.getWboitSnapshot?.();
                    return mode?.value === 'alphaBetaPhase'
                      && !!snap
                      && snap.surfaceOpacity < 0.999
                      && (snap.supported ? snap.active === true : snap.fallback === true);
                }"""
            )
            page.evaluate(
                """() => {
                    const el = document.getElementById('opacity');
                    if (!el) return;
                    el.value = '1.0';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.wait_for_function(
                """() => {
                    const snap = window.VibeMolTesting?.getWboitSnapshot?.();
                    return !!snap && snap.surfaceOpacity >= 0.999 && snap.active === false;
                }"""
            )

            log_step('wboit cloud 2c alpha/beta split view')
            load_volume_asset(page, '/assets/data/2ccubes/orbital_0.2ccube')
            page.wait_for_function("() => !!document.getElementById('twoComponentModeSelect')")
            page.evaluate(
                """() => {
                    const mode = document.getElementById('renderMode');
                    if (!mode) return;
                    mode.value = 'cloud';
                    mode.dispatchEvent(new Event('change', { bubbles: true }));
                    const type = document.getElementById('cloudType');
                    if (!type) return;
                    type.value = 'points';
                    type.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            set_select_value(page, '#twoComponentModeSelect', 'alphaBetaPhase')
            page.evaluate(
                """() => {
                    const el = document.getElementById('opacity');
                    if (!el) return;
                    el.value = '0.5';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }"""
            )
            page.wait_for_function(
                """() => {
                    const mode = document.getElementById('twoComponentModeSelect');
                    const snap = window.VibeMolTesting?.getWboitSnapshot?.();
                    const clouds = window.VibeMolTesting?.getCloudMaterialSnapshot?.() || [];
                    return mode?.value === 'alphaBetaPhase'
                      && !!snap
                      && snap.renderMode === 'cloud'
                      && snap.cloudType === 'points'
                      && snap.surfaceOpacity < 0.999
                      && snap.cloudRenderableCount >= 2
                      && clouds.length >= 2
                      && clouds.every((entry) => entry.objectType === 'points')
                      && (snap.supported ? snap.active === true : snap.fallback === true);
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
