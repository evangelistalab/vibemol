#!/usr/bin/env python3
"""Minimal VibeMol web API client.

This prototype automates the hosted VibeMol page with Playwright:
1. Opens https://evangelistalab.org/vibemol/
2. Uploads a local .cube/.cub/.xyz/.2ccube file
3. Captures the rendered canvas as PNG on local disk
"""

from __future__ import annotations

import argparse
import base64
import json
import pathlib
import sys
import time
from typing import Any

DEFAULT_URL = "https://evangelistalab.org/vibemol/"
DEFAULT_RC_CANDIDATES = (".vibemolrc", ".vibemolrc.json")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upload a molecular file to VibeMol and save a rendered PNG locally."
    )
    parser.add_argument("input_file", help="Path to .cube/.cub/.2ccube/.xyz file")
    parser.add_argument("output_png", help="Path to output PNG file")
    parser.add_argument("--url", default=DEFAULT_URL, help=f"VibeMol URL (default: {DEFAULT_URL})")
    parser.add_argument("--iso", type=float, default=None, help="Optional iso value")
    parser.add_argument(
        "--style",
        choices=["default", "toon", "fancy", "studio", "glossy"],
        default=None,
        help="Optional molecule style (fancy is accepted as an alias for toon)",
    )
    parser.add_argument(
        "--preset",
        default=None,
        help="Optional path to a VibeMol preset JSON to import before rendering",
    )
    parser.add_argument(
        "--preset-mode",
        choices=["strict", "relaxed"],
        default=None,
        help="Preset import mode (default: relaxed, can also come from rc file)",
    )
    parser.add_argument(
        "--save-preset",
        default=None,
        help="Optional path to write the effective preset after applying overrides",
    )
    parser.add_argument(
        "--preset-name",
        default=None,
        help="Optional name to use when saving preset via --save-preset",
    )
    parser.add_argument(
        "--rc",
        default=None,
        help="Optional config file path (default auto-discovery: .vibemolrc in cwd/home)",
    )
    parser.add_argument(
        "--no-rc",
        action="store_true",
        help="Disable .vibemolrc auto-discovery",
    )
    parser.add_argument(
        "--wait-ms",
        type=int,
        default=1200,
        help="Extra wait time after upload before capture (default: 1200)",
    )
    parser.add_argument(
        "--headed",
        action="store_true",
        help="Run browser in headed mode for debugging",
    )
    return parser.parse_args()


def _normalize_style(style: str | None) -> str | None:
    if style is None:
        return None
    return "toon" if style == "fancy" else style


def _normalize_preset_mode(mode: str | None) -> str:
    if mode in (None, ""):
        return "relaxed"
    if mode not in ("strict", "relaxed"):
        raise ValueError(f"Unsupported preset mode: {mode}")
    return mode


def _read_json_file(path: pathlib.Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError(f"Preset JSON must be an object: {path}")
    return data


def _write_json_file(path: pathlib.Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True)
        f.write("\n")


def _resolve_rc_path(explicit_rc: str | None, *, no_rc: bool = False) -> pathlib.Path | None:
    if no_rc:
        return None
    if explicit_rc:
        p = pathlib.Path(explicit_rc).expanduser().resolve()
        if not p.is_file():
            raise FileNotFoundError(f"Config file does not exist: {p}")
        return p
    search_roots = [pathlib.Path.cwd(), pathlib.Path.home()]
    for root in search_roots:
        for name in DEFAULT_RC_CANDIDATES:
            candidate = root / name
            if candidate.is_file():
                return candidate.resolve()
    return None


def _extract_preset_mode_from_rc(rc_data: dict[str, Any]) -> str | None:
    mode = rc_data.get("preset_mode", rc_data.get("presetMode"))
    if mode is None:
        return None
    if not isinstance(mode, str):
        raise ValueError("rc key preset_mode must be a string")
    return mode


def _extract_preset_from_rc(rc_data: dict[str, Any], rc_path: pathlib.Path) -> dict[str, Any] | None:
    if rc_data.get("kind") == "vibemol.preset":
        return rc_data
    if "settings" in rc_data and isinstance(rc_data["settings"], dict):
        # Allow .vibemolrc to directly contain preset payload.
        return rc_data

    preset_ref = rc_data.get("preset", rc_data.get("preset_path", rc_data.get("presetPath")))
    if preset_ref is None:
        return None

    if isinstance(preset_ref, dict):
        return preset_ref
    if isinstance(preset_ref, str):
        preset_path = pathlib.Path(preset_ref).expanduser()
        if not preset_path.is_absolute():
            preset_path = (rc_path.parent / preset_path).resolve()
        else:
            preset_path = preset_path.resolve()
        if not preset_path.is_file():
            raise FileNotFoundError(f"Preset file from rc does not exist: {preset_path}")
        return _read_json_file(preset_path)
    raise ValueError("rc key preset must be either a JSON object or a file path string")


def _set_input_value(page: Any, selector: str, value: Any, event_name: str = "change") -> bool:
    return bool(
        page.evaluate(
            """(payload) => {
                const el = document.querySelector(payload.selector);
                if (!el) return false;
                el.value = String(payload.value);
                el.dispatchEvent(new Event(payload.eventName, { bubbles: true }));
                return true;
            }""",
            {"selector": selector, "value": value, "eventName": event_name},
        )
    )


def _set_checkbox(page: Any, selector: str, value: bool) -> bool:
    return bool(
        page.evaluate(
            """(payload) => {
                const el = document.querySelector(payload.selector);
                if (!el || el.type !== 'checkbox') return false;
                el.checked = !!payload.value;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }""",
            {"selector": selector, "value": bool(value)},
        )
    )


def _set_style_with_alias(page: Any, style: str) -> str | None:
    return page.evaluate(
        """(style) => {
            const sel = document.getElementById('moleculeStyle');
            if (!sel) return null;
            const values = Array.from(sel.options).map((o) => o.value);
            const candidates = [];
            if (style) candidates.push(style);
            if (style === 'toon') candidates.push('fancy');
            if (style === 'fancy') candidates.push('toon');
            const picked = candidates.find((v) => values.includes(v));
            if (!picked) return null;
            sel.value = picked;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            return picked;
        }""",
        _normalize_style(style),
    )


def _flatten_settings(settings: dict[str, Any], prefix: str = "", out: dict[str, Any] | None = None) -> dict[str, Any]:
    if out is None:
        out = {}
    for key, value in settings.items():
        next_key = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            _flatten_settings(value, next_key, out)
        else:
            out[next_key] = value
    return out


def _has_preset_api(page: Any) -> bool:
    return bool(
        page.evaluate(
            """() => !!(
                window.VibeMolPreset &&
                typeof window.VibeMolPreset.import === 'function' &&
                typeof window.VibeMolPreset.export === 'function'
            )"""
        )
    )


def _import_preset_via_api(page: Any, preset: dict[str, Any], mode: str) -> dict[str, Any]:
    result = page.evaluate(
        """(payload) => {
            try {
                const out = window.VibeMolPreset.import(payload.preset, { mode: payload.mode });
                return { ok: true, result: out };
            } catch (err) {
                return { ok: false, error: String(err && err.message ? err.message : err) };
            }
        }""",
        {"preset": preset, "mode": mode},
    )
    if not result.get("ok"):
        raise RuntimeError(f"Preset import failed via runtime API: {result.get('error', 'unknown error')}")
    return result.get("result", {})


def _import_preset_dom_fallback(page: Any, preset: dict[str, Any], mode: str) -> dict[str, Any]:
    if mode == "strict":
        raise RuntimeError("Preset runtime API not found on page; strict mode disallows DOM fallback.")
    settings_obj = preset.get("settings", {})
    if not isinstance(settings_obj, dict):
        return {"ok": True, "mode": mode, "warnings": ["Preset has no object settings payload"], "applied": []}
    settings = _flatten_settings(settings_obj)
    warnings: list[str] = []
    applied: list[str] = []

    def _apply_input(key: str, selector: str, event_name: str = "change") -> None:
        if key in settings and _set_input_value(page, selector, settings[key], event_name):
            applied.append(key)

    def _apply_checkbox(key: str, selector: str) -> None:
        if key in settings and _set_checkbox(page, selector, bool(settings[key])):
            applied.append(key)

    _apply_input("surface.iso", "#iso", "change")
    _apply_input("surface.opacity", "#opacity", "input")
    _apply_input("surface.style", "#styleSelect", "change")
    _apply_input("surface.posColor", "#posColor", "input")
    _apply_input("surface.negColor", "#negColor", "input")
    _apply_input("global.backgroundColor", "#bgColor", "input")
    _apply_input("render.mode", "#renderMode", "change")
    _apply_input("render.cloudType", "#cloudType", "change")
    _apply_input("render.cloudStride", "#cloudStride", "change")
    _apply_input("render.cloudAlpha", "#cloudAlpha", "change")
    _apply_input("twoComponent.mode", "#componentSelect", "change")
    _apply_input("molecule.glossyBondRadius", "#glossyBondRadius", "change")
    _apply_checkbox("global.showAtoms", "#showAtoms")
    _apply_checkbox("global.showBonds", "#showBonds")
    _apply_checkbox("global.elementColors", "#elementColors")
    _apply_checkbox("global.showBox", "#showBox")
    _apply_checkbox("global.showAxes", "#showAxes")

    if "molecule.style" in settings:
        picked = _set_style_with_alias(page, str(settings["molecule.style"]))
        if picked is not None:
            applied.append("molecule.style")
        else:
            warnings.append("Could not apply molecule.style from preset in DOM fallback mode")

    warnings.append("Used DOM fallback preset import (runtime API unavailable on page)")
    return {"ok": True, "mode": mode, "warnings": warnings, "applied": applied}


def _import_preset(page: Any, preset: dict[str, Any], mode: str) -> dict[str, Any]:
    if _has_preset_api(page):
        return _import_preset_via_api(page, preset, mode)
    return _import_preset_dom_fallback(page, preset, mode)


def _export_preset_via_api(page: Any, preset_name: str | None) -> dict[str, Any]:
    payload = {"name": preset_name} if preset_name else {}
    result = page.evaluate(
        """(payload) => {
            try {
                return { ok: true, preset: window.VibeMolPreset.export(payload || {}) };
            } catch (err) {
                return { ok: false, error: String(err && err.message ? err.message : err) };
            }
        }""",
        payload,
    )
    if not result.get("ok"):
        raise RuntimeError(f"Preset export failed via runtime API: {result.get('error', 'unknown error')}")
    preset = result.get("preset", {})
    if not isinstance(preset, dict):
        raise RuntimeError("Preset export returned a non-object payload")
    return preset


def _export_preset_dom_fallback(page: Any, preset_name: str | None) -> dict[str, Any]:
    values = page.evaluate(
        """() => {
            const get = (id) => document.getElementById(id);
            const bool = (id, fallback=false) => {
                const el = get(id);
                if (!el || el.type !== 'checkbox') return fallback;
                return !!el.checked;
            };
            const str = (id, fallback='') => {
                const el = get(id);
                return el && typeof el.value !== 'undefined' ? String(el.value) : fallback;
            };
            return {
                iso: str('iso', '0.02'),
                opacity: str('opacity', '1.0'),
                style: str('moleculeStyle', 'default'),
                surfaceStyle: str('styleSelect', 'emissive'),
                posColor: str('posColor', '#f2a900'),
                negColor: str('negColor', '#0033a0'),
                bgColor: str('bgColor', '#ffffff'),
                showAtoms: bool('showAtoms', true),
                showBonds: bool('showBonds', true),
                elementColors: bool('elementColors', true),
                showBox: bool('showBox', false),
                showAxes: bool('showAxes', true),
                renderMode: str('renderMode', 'surface'),
            };
        }"""
    )
    style = _normalize_style(values.get("style", "default"))
    return {
        "kind": "vibemol.preset",
        "presetVersion": 1,
        "name": preset_name or "VibeMol Preset",
        "settings": {
            "surface.iso": float(values.get("iso", 0.02)),
            "surface.opacity": float(values.get("opacity", 1.0)),
            "surface.style": values.get("surfaceStyle", "emissive"),
            "surface.posColor": values.get("posColor", "#f2a900"),
            "surface.negColor": values.get("negColor", "#0033a0"),
            "global.backgroundColor": values.get("bgColor", "#ffffff"),
            "global.showAtoms": bool(values.get("showAtoms", True)),
            "global.showBonds": bool(values.get("showBonds", True)),
            "global.elementColors": bool(values.get("elementColors", True)),
            "global.showBox": bool(values.get("showBox", False)),
            "global.showAxes": bool(values.get("showAxes", True)),
            "render.mode": values.get("renderMode", "surface"),
            "molecule.style": style or "default",
        },
        "meta": {"source": "cli-dom-fallback", "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
    }


def _export_preset(page: Any, preset_name: str | None) -> dict[str, Any]:
    if _has_preset_api(page):
        return _export_preset_via_api(page, preset_name)
    return _export_preset_dom_fallback(page, preset_name)


def render_to_png(
    input_file: pathlib.Path,
    output_png: pathlib.Path,
    *,
    url: str = DEFAULT_URL,
    iso: float | None = None,
    style: str | None = None,
    preset: dict[str, Any] | None = None,
    preset_mode: str = "relaxed",
    save_preset_path: pathlib.Path | None = None,
    preset_name: str | None = None,
    wait_ms: int = 1200,
    headed: bool = False,
) -> None:
    try:
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Missing dependency: playwright. Install with:\n"
            "  pip install -r api/requirements.txt\n"
            "  python -m playwright install chromium"
        ) from exc

    input_file = input_file.expanduser().resolve()
    if not input_file.is_file():
        raise FileNotFoundError(f"Input file does not exist: {input_file}")

    output_png = output_png.expanduser().resolve()
    output_png.parent.mkdir(parents=True, exist_ok=True)

    if save_preset_path is not None:
        save_preset_path = save_preset_path.expanduser().resolve()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not headed)
        page = browser.new_page(viewport={"width": 1600, "height": 1000})
        page.goto(url, wait_until="domcontentloaded", timeout=45_000)

        # Wait for app shell.
        # file input is hidden in VibeMol UI, so wait for attachment, not visibility.
        page.wait_for_selector("#fileInput", state="attached", timeout=20_000)
        page.wait_for_selector("#canvas", timeout=20_000)

        if preset is not None:
            preset_result = _import_preset(page, preset, preset_mode)
            warnings = preset_result.get("warnings", [])
            if warnings:
                print(f"[preset] {len(warnings)} warning(s)", file=sys.stderr)
                for w in warnings:
                    print(f"[preset] {w}", file=sys.stderr)

        # Upload molecular file.
        page.set_input_files("#fileInput", str(input_file))

        if iso is not None:
            _set_input_value(page, "#iso", iso, "change")

        if style is not None:
            picked = _set_style_with_alias(page, style)
            if picked is None:
                raise RuntimeError(f"Could not apply style '{style}' on this deployment")

        # Heuristic: wait until hint mentions Loaded, then a short settle.
        try:
            page.wait_for_function(
                "() => (document.getElementById('hint')?.textContent || '').includes('Loaded')",
                timeout=20_000,
            )
        except PlaywrightTimeoutError:
            # Fallback: continue even if hint message is different.
            pass

        if wait_ms > 0:
            page.wait_for_timeout(wait_ms)

        if save_preset_path is not None:
            exported = _export_preset(page, preset_name)
            _write_json_file(save_preset_path, exported)

        # Use the app's own canvas toDataURL to save exactly what's rendered.
        data_url = page.evaluate(
            """() => {
                const canvas = document.getElementById('canvas');
                if (!canvas) return null;
                return canvas.toDataURL('image/png');
            }"""
        )
        if not data_url or not data_url.startswith("data:image/png;base64,"):
            raise RuntimeError("Could not read PNG data from #canvas")

        b64 = data_url.split(",", 1)[1]
        output_png.write_bytes(base64.b64decode(b64))
        browser.close()


def main() -> int:
    args = _parse_args()
    start = time.time()
    try:
        preset_obj: dict[str, Any] | None = None
        rc_mode: str | None = None
        rc_path = _resolve_rc_path(args.rc, no_rc=args.no_rc)
        if rc_path is not None:
            rc_data = _read_json_file(rc_path)
            rc_mode = _extract_preset_mode_from_rc(rc_data)
            if not args.preset:
                preset_obj = _extract_preset_from_rc(rc_data, rc_path)
                if preset_obj is not None:
                    print(f"[rc] loaded preset from {rc_path}", file=sys.stderr)

        if args.preset:
            preset_path = pathlib.Path(args.preset).expanduser().resolve()
            if not preset_path.is_file():
                raise FileNotFoundError(f"Preset file does not exist: {preset_path}")
            preset_obj = _read_json_file(preset_path)
            print(f"[cli] loaded preset from {preset_path}", file=sys.stderr)

        preset_mode = _normalize_preset_mode(args.preset_mode if args.preset_mode is not None else rc_mode)

        render_to_png(
            pathlib.Path(args.input_file),
            pathlib.Path(args.output_png),
            url=args.url,
            iso=args.iso,
            style=args.style,
            preset=preset_obj,
            preset_mode=preset_mode,
            save_preset_path=pathlib.Path(args.save_preset) if args.save_preset else None,
            preset_name=args.preset_name,
            wait_ms=args.wait_ms,
            headed=args.headed,
        )
    except Exception as exc:  # pragma: no cover - prototype cli
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    dt = time.time() - start
    print(f"Saved: {pathlib.Path(args.output_png).expanduser().resolve()} ({dt:.2f}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
