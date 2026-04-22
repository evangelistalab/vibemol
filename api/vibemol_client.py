#!/usr/bin/env python3
"""Minimal VibeMol web API client.

This prototype automates the hosted VibeMol page with Playwright:
1. Opens https://evangelistalab.org/vibemol/
2. Uploads local molecule files (+ optional sidecars such as vibration payloads)
3. Captures the rendered canvas as PNG on local disk
"""

from __future__ import annotations

import argparse
import base64
import glob
import json
import pathlib
import sys
import time
import uuid
from typing import Any

DEFAULT_URL = "https://evangelistalab.org/vibemol/"
DEFAULT_RC_CANDIDATES = (".vibemolrc", ".vibemolrc.json")
LEGACY_SURFACE_STYLE = "emissive"
RenderJob = tuple[pathlib.Path, pathlib.Path]
IMPORT_ERROR_MARKERS = (
    "could not load",
    "invalid format",
    "failed",
    "malformed",
    "no loaded molecule matches",
    "integration:",
)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upload one or more molecular files to VibeMol and save rendered PNGs locally."
    )
    parser.add_argument(
        "input_file",
        nargs="?",
        help="Path to primary molecule file (e.g. .cube/.cub/.2ccube/.xyz/.hess/.dat/.out/.output) in single-file mode",
    )
    parser.add_argument("output_png", nargs="?", help="Path to output PNG file (single-file mode)")
    parser.add_argument(
        "--inputs",
        nargs="+",
        default=None,
        help="Batch mode: one or more input files/patterns to render (glob patterns supported)",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Batch mode: output directory for rendered PNGs",
    )
    parser.add_argument(
        "--name-template",
        default="{stem}.png",
        help=(
            "Batch mode output naming template (default: {stem}.png). "
            "Supported fields: {index}, {stem}, {name}, {ext}"
        ),
    )
    parser.add_argument(
        "--continue-on-error",
        action="store_true",
        help="Batch mode: continue rendering remaining files when one file fails",
    )
    parser.add_argument("--url", default=DEFAULT_URL, help=f"VibeMol URL (default: {DEFAULT_URL})")
    parser.add_argument("--iso", type=float, default=None, help="Optional iso value")
    parser.add_argument(
        "--style",
        type=_parse_style_arg,
        default=None,
        help="Optional molecule style (aliases: default->basic, fancy->toon, studio->kit)",
    )
    parser.add_argument(
        "--extra-file",
        action="append",
        default=None,
        help=(
            "Optional additional file(s) to upload with every render job "
            "(glob patterns supported), e.g. sidecar .vib.json with .xyz."
        ),
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
    aliases = {
        "default": "basic",
        "fancy": "toon",
        "studio": "kit",
    }
    return aliases.get(style, style)


def _parse_style_arg(style: str) -> str:
    normalized = _normalize_style(style)
    if normalized not in ("basic", "toon", "kit", "glossy"):
        raise argparse.ArgumentTypeError(
            f"Unsupported style: {style}. Choose one of basic, toon, kit, glossy"
        )
    return normalized


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


def _resolve_input_paths(paths: list[str]) -> list[pathlib.Path]:
    resolved: list[pathlib.Path] = []
    seen: set[pathlib.Path] = set()
    for raw in paths:
        expanded = pathlib.Path(raw).expanduser()
        pattern = str(expanded)
        if glob.has_magic(pattern):
            matches = sorted(pathlib.Path(p).resolve() for p in glob.glob(pattern, recursive=True))
            files = [p for p in matches if p.is_file()]
            if not files:
                raise FileNotFoundError(f"No input files matched pattern: {raw}")
            for p in files:
                if p in seen:
                    continue
                seen.add(p)
                resolved.append(p)
            continue

        p = expanded.resolve()
        if not p.is_file():
            raise FileNotFoundError(f"Input file does not exist: {p}")
        if p in seen:
            continue
        seen.add(p)
        resolved.append(p)
    return resolved


def _resolve_extra_paths(paths: list[str] | None) -> list[pathlib.Path]:
    if not paths:
        return []
    return _resolve_input_paths(paths)


def _looks_like_import_error(message: str) -> bool:
    text = (message or "").strip().lower()
    if not text:
        return False
    return any(marker in text for marker in IMPORT_ERROR_MARKERS)


def _format_batch_output_name(template: str, input_path: pathlib.Path, index: int) -> str:
    try:
        name = template.format(
            index=index,
            stem=input_path.stem,
            name=input_path.name,
            ext=input_path.suffix.lstrip(".").lower(),
        )
    except KeyError as exc:
        raise ValueError(
            f"Unsupported placeholder in --name-template: {exc}. "
            "Allowed: {index}, {stem}, {name}, {ext}"
        ) from exc

    name = str(name).strip()
    if not name:
        raise ValueError("--name-template produced an empty file name")

    if pathlib.Path(name).name != name:
        raise ValueError("--name-template must not include path separators; use --output-dir for folder selection")

    if not name.lower().endswith(".png"):
        name += ".png"

    return name


def _build_render_jobs(args: argparse.Namespace) -> list[RenderJob]:
    if args.inputs:
        if args.input_file or args.output_png:
            raise ValueError("Do not mix positional input/output with --inputs batch mode.")
        if args.output_dir is None:
            raise ValueError("--output-dir is required when using --inputs.")

        input_paths = _resolve_input_paths(list(args.inputs))
        output_dir = pathlib.Path(args.output_dir).expanduser().resolve()
        output_dir.mkdir(parents=True, exist_ok=True)

        jobs: list[RenderJob] = []
        used_output_paths: set[pathlib.Path] = set()
        for index, input_path in enumerate(input_paths, start=1):
            base_name = _format_batch_output_name(args.name_template, input_path, index)
            output_path = (output_dir / base_name).resolve()
            if output_path in used_output_paths:
                output_path = output_path.with_name(f"{output_path.stem}_{index}{output_path.suffix}")
            used_output_paths.add(output_path)
            jobs.append((input_path, output_path))
        return jobs

    if args.output_dir is not None:
        raise ValueError("--output-dir is only valid when using --inputs.")
    if args.name_template != "{stem}.png":
        raise ValueError("--name-template is only valid when using --inputs.")

    if not args.input_file or not args.output_png:
        raise ValueError("Provide input_file and output_png, or use --inputs with --output-dir.")

    input_paths = _resolve_input_paths([args.input_file])
    if len(input_paths) != 1:
        raise ValueError(
            "Single-file mode input resolved to multiple files. "
            "Use --inputs with --output-dir for wildcard or multi-file rendering."
        )
    input_path = input_paths[0]
    output_path = pathlib.Path(args.output_png).expanduser().resolve()
    return [(input_path, output_path)]


def _resolve_save_preset_path(args: argparse.Namespace, jobs: list[RenderJob]) -> pathlib.Path | None:
    if not args.save_preset:
        return None
    if len(jobs) > 1:
        raise ValueError("--save-preset is only supported in single-file mode.")
    return pathlib.Path(args.save_preset).expanduser().resolve()


def _load_preset_from_sources(args: argparse.Namespace) -> tuple[dict[str, Any] | None, str]:
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
    return preset_obj, preset_mode


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


def _set_toggle_button(page: Any, selector: str, value: bool) -> bool:
    return bool(
        page.evaluate(
            """(payload) => {
                const el = document.querySelector(payload.selector);
                if (!el) return false;
                const current = (el.getAttribute('aria-pressed') === 'true') || el.classList.contains('active');
                if (current !== !!payload.value && typeof el.click === 'function') el.click();
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
            if (style === 'basic') candidates.push('default');
            if (style === 'default') candidates.push('basic');
            if (style === 'toon') candidates.push('fancy');
            if (style === 'fancy') candidates.push('toon');
            if (style === 'kit') candidates.push('studio');
            if (style === 'studio') candidates.push('kit');
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

    def _apply_toggle_button(key: str, selector: str) -> None:
        if key in settings and _set_toggle_button(page, selector, bool(settings[key])):
            applied.append(key)

    _apply_input("surface.iso", "#iso", "change")
    _apply_input("surface.opacity", "#opacity", "input")
    _apply_input("surface.materialPreset", "#surfaceMaterialPreset", "change")
    _apply_input("surface.colorScheme", "#schemeSelect", "change")
    _apply_input("surface.posColor", "#posColor", "input")
    _apply_input("surface.negColor", "#negColor", "input")
    _apply_input("global.backgroundColor", "#bgColor", "input")
    _apply_input("render.mode", "#renderMode", "change")
    _apply_input("render.cloudType", "#cloudType", "change")
    _apply_input("twoComponent.mode", "#componentSelect", "change")
    _apply_input("molecule.glossyBondRadius", "#glossyBondRadius", "change")
    _apply_checkbox("surface.enabled", "#surfBtn")
    _apply_checkbox("global.showAtoms", "#showAtoms")
    _apply_checkbox("global.showAtomLabels", "#showAtomLabels")
    _apply_checkbox("global.showBonds", "#showBonds")
    _apply_checkbox("global.showMultiBonds", "#showMultiBonds")
    _apply_checkbox("global.elementColors", "#elementColors")
    _apply_checkbox("global.showBox", "#showBox")
    _apply_checkbox("global.showAxes", "#showAxes")
    _apply_checkbox("vibration.hideSmallFrequencies", "#vibrationHideLowFreq")
    _apply_toggle_button("surface.autoIsoEnabled", "#autoIsoBtn")

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
            const pressed = (id, fallback=false) => {
                const el = get(id);
                if (!el) return fallback;
                return el.getAttribute('aria-pressed') === 'true' || el.classList.contains('active');
            };
            const appVersionText = (get('versionText')?.textContent || '').trim();
            const appVersion = appVersionText.startsWith('v') ? appVersionText.slice(1) : appVersionText;
            return {
                appVersion,
                iso: str('iso', '0.02'),
                opacity: str('opacity', '1.0'),
                surfaceMaterialPreset: str('surfaceMaterialPreset', 'emissive'),
                style: str('moleculeStyle', 'basic'),
                surfaceStyle: %r,
                colorScheme: str('schemeSelect', 'custom'),
                autoIsoEnabled: pressed('autoIsoBtn', false),
                posColor: str('posColor', '#f2a900'),
                negColor: str('negColor', '#0033a0'),
                bgColor: str('bgColor', '#ffffff'),
                surfaceEnabled: bool('surfBtn', true),
                showAtoms: bool('showAtoms', true),
                showAtomLabels: bool('showAtomLabels', false),
                showBonds: bool('showBonds', true),
                showMultiBonds: bool('showMultiBonds', true),
                elementColors: bool('elementColors', true),
                showBox: bool('showBox', false),
                showAxes: bool('showAxes', true),
                vibrationHideSmallFrequencies: bool('vibrationHideLowFreq', true),
                renderMode: str('renderMode', 'surface'),
            };
        }""" % (LEGACY_SURFACE_STYLE,)
    )
    style = _normalize_style(values.get("style", "basic"))
    preset = {
        "kind": "vibemol.preset",
        "presetVersion": 1,
        "name": preset_name or "VibeMol Preset",
        "settings": {
            "surface.iso": float(values.get("iso", 0.02)),
            "surface.opacity": float(values.get("opacity", 1.0)),
            "surface.materialPreset": values.get("surfaceMaterialPreset", "emissive"),
            "surface.enabled": bool(values.get("surfaceEnabled", True)),
            "surface.style": values.get("surfaceStyle", LEGACY_SURFACE_STYLE),
            "surface.autoIsoEnabled": bool(values.get("autoIsoEnabled", False)),
            "surface.posColor": values.get("posColor", "#f2a900"),
            "surface.negColor": values.get("negColor", "#0033a0"),
            "surface.colorScheme": values.get("colorScheme", "custom"),
            "global.backgroundColor": values.get("bgColor", "#ffffff"),
            "global.showAtoms": bool(values.get("showAtoms", True)),
            "global.showAtomLabels": bool(values.get("showAtomLabels", False)),
            "global.showBonds": bool(values.get("showBonds", True)),
            "global.showMultiBonds": bool(values.get("showMultiBonds", True)),
            "global.elementColors": bool(values.get("elementColors", True)),
            "global.showBox": bool(values.get("showBox", False)),
            "global.showAxes": bool(values.get("showAxes", True)),
            "vibration.hideSmallFrequencies": bool(values.get("vibrationHideSmallFrequencies", True)),
            "render.mode": values.get("renderMode", "surface"),
            "molecule.style": style or "basic",
        },
        "meta": {"source": "cli-dom-fallback", "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
    }
    app_version = values.get("appVersion")
    if isinstance(app_version, str) and app_version.strip():
        preset["appVersion"] = app_version.strip()
    return preset


def _export_preset(page: Any, preset_name: str | None) -> dict[str, Any]:
    if _has_preset_api(page):
        return _export_preset_via_api(page, preset_name)
    return _export_preset_dom_fallback(page, preset_name)


def _resolve_embed_url(url: str | None, source: str, local_port: int) -> str:
    if url:
        return str(url)
    mode = str(source or "web").strip().lower()
    if mode == "local":
        port = int(local_port)
        if port <= 0:
            raise ValueError(f"local_port must be > 0, got: {local_port}")
        return f"http://localhost:{port}/index.html"
    if mode == "web":
        return DEFAULT_URL
    raise ValueError(f"Unsupported source mode: {source!r} (expected 'web' or 'local')")


def _coerce_embed_file_entry(entry: Any, *, encoding: str) -> dict[str, Any]:
    if isinstance(entry, (str, pathlib.Path)):
        p = pathlib.Path(entry).expanduser().resolve()
        if not p.is_file():
            raise FileNotFoundError(f"Embed file does not exist: {p}")
        return {"name": p.name, "mimeType": "text/plain", "text": p.read_text(encoding=encoding)}

    if isinstance(entry, dict):
        payload = dict(entry)
        if "path" in payload and ("text" not in payload and "base64" not in payload):
            p = pathlib.Path(payload["path"]).expanduser().resolve()
            if not p.is_file():
                raise FileNotFoundError(f"Embed file does not exist: {p}")
            payload.setdefault("name", p.name)
            payload.setdefault("mimeType", "text/plain")
            payload["text"] = p.read_text(encoding=encoding)

        name = str(payload.get("name", "")).strip()
        if not name:
            raise ValueError("Embed file dict must include non-empty 'name' (or provide 'path').")

        has_text = "text" in payload
        has_base64 = "base64" in payload
        if not has_text and not has_base64:
            raise ValueError(f"Embed file '{name}' must include 'text' or 'base64'.")

        out = {"name": name, "mimeType": str(payload.get("mimeType", "text/plain"))}
        if has_text:
            text_value = payload["text"]
            if isinstance(text_value, (bytes, bytearray)):
                out["text"] = bytes(text_value).decode(encoding, errors="replace")
            else:
                out["text"] = str(text_value if text_value is not None else "")
        else:
            out["base64"] = str(payload["base64"])
        return out

    if isinstance(entry, (tuple, list)) and len(entry) == 2:
        name, text = entry
        if isinstance(text, (bytes, bytearray)):
            text_value = bytes(text).decode(encoding, errors="replace")
        else:
            text_value = str(text if text is not None else "")
        return {
            "name": str(name),
            "mimeType": "text/plain",
            "text": text_value,
        }

    raise TypeError(
        "Unsupported embed file entry. Use path-like, dict({name,text|base64|path}), "
        "or (name, text) tuple."
    )


def _normalize_embed_files(files: Any, *, encoding: str) -> list[dict[str, Any]]:
    if files is None:
        raise ValueError("files cannot be None")

    if isinstance(files, (str, pathlib.Path, dict)):
        raw_items = [files]
    elif isinstance(files, (list, tuple)):
        # Keep `(name, text)` shorthand as a single file record.
        if len(files) == 2 and isinstance(files[0], str) and isinstance(files[1], (str, bytes)):
            raw_items = [files]
        else:
            raw_items = list(files)
    else:
        raw_items = [files]

    result = [_coerce_embed_file_entry(item, encoding=encoding) for item in raw_items]
    if len(result) == 0:
        raise ValueError("At least one file must be provided.")
    return result


def vibemol(
    files: Any,
    *,
    options: dict[str, Any] | None = None,
    url: str | None = None,
    source: str = "web",
    local_port: int = 8000,
    width: str = "100%",
    height: int = 760,
    clear_first: bool = True,
    show_status: bool = True,
    request_id: str | None = None,
    encoding: str = "utf-8",
    auto_display: bool = True,
) -> Any:
    """Embed VibeMol in a Jupyter notebook and auto-load files into the iframe.

    Parameters
    ----------
    files
        One file or many files. Supported forms:
        - path-like (`str`/`Path`) to a local text file
        - dict with `{name, text}` or `{name, base64}` or `{path}`
        - tuple `(name, text)`
        - list of the above
    options
        Extra load options passed to VibeMol (`clearFirst` is set from `clear_first`
        unless explicitly present here).
    url
        Explicit iframe URL. If omitted, selected from `source`.
    source
        `'web'` (default hosted URL) or `'local'` (`http://localhost:{local_port}/index.html`).
    local_port
        Port used when `source='local'`.
    width, height
        Iframe dimensions.
    clear_first
        Whether to clear existing files before loading payload.
    show_status
        Show a status line under the iframe.
    request_id
        Optional request id for postMessage correlation.
    encoding
        Text encoding for path-like files.
    auto_display
        If True (default), call IPython `display(...)` and return `None`.
        If False, return the `IPython.display.HTML` object without displaying it.
    """
    try:
        from IPython.display import HTML, display
    except ModuleNotFoundError as exc:
        raise RuntimeError("vibemol(...) requires IPython/Jupyter (IPython.display.HTML).") from exc

    embed_url = _resolve_embed_url(url, source, local_port)
    payload_files = _normalize_embed_files(files, encoding=encoding)
    load_options = dict(options or {})
    load_options.setdefault("clearFirst", bool(clear_first))
    request_token = str(request_id or f"vibemol-{uuid.uuid4().hex}")

    uid = uuid.uuid4().hex[:10]
    frame_id = f"vibemolEmbedFrame_{uid}"
    status_id = f"vibemolEmbedStatus_{uid}"
    payload = {
        "type": "vibemol:load-files",
        "requestId": request_token,
        "options": load_options,
        "files": payload_files,
    }
    payload_js = json.dumps(payload)
    status_block = (
        f'<div id="{status_id}" style="font:13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:#1f2b45;">'
        'Waiting for iframe load…'
        '</div>'
    ) if show_status else f'<div id="{status_id}" style="display:none;"></div>'

    width_css = f"{width}px" if isinstance(width, (int, float)) else str(width)

    html = f"""
<div style="display:grid; gap:8px;">
  <iframe id="{frame_id}" src="{embed_url}" style="width:{width_css}; height:{int(height)}px; border:1px solid #ccd1dd; border-radius:8px;"></iframe>
  {status_block}
</div>
<script>
(function() {{
  const frame = document.getElementById({json.dumps(frame_id)});
  const status = document.getElementById({json.dumps(status_id)});
  const payload = {payload_js};
  let posted = false;

  function setStatus(text) {{
    if (status) status.textContent = String(text || '');
  }}

  function postFiles() {{
    if (posted || !frame || !frame.contentWindow) return;
    posted = true;
    frame.contentWindow.postMessage(payload, '*');
    setStatus('Posted files to iframe. Waiting for VibeMol response…');
  }}

  if (frame) {{
    frame.addEventListener('load', function() {{
      setStatus('Iframe loaded. Sending files…');
      setTimeout(postFiles, 250);
    }});
  }}

  window.addEventListener('message', function(event) {{
    const data = event && event.data;
    if (!data || data.type !== 'vibemol:load-files:result') return;
    if (data.requestId !== payload.requestId) return;
    if (data.ok) {{
      const names = Array.isArray(data.loadedNames) ? data.loadedNames.join(', ') : '';
      setStatus(`Loaded ${{data.loadedCount || 0}} file(s): ${{names}}`);
    }} else {{
      setStatus(`Load failed: ${{data.error || 'Unknown error'}}`);
    }}
  }});
}})();
</script>
"""
    result = HTML(html)
    if auto_display:
        display(result)
        return None
    return result


def _wait_for_import_ready(page: Any, timeout_ms: int = 20_000) -> None:
    """Wait until at least one file appears loaded in UI state."""
    page.wait_for_function(
        """() => {
            const sel = document.getElementById('fileSelect');
            if (sel && sel.options && sel.options.length > 0) return true;
            const hint = (document.getElementById('hint')?.textContent || '').toLowerCase();
            if (hint.includes('loaded ') || hint.includes('pubchem')) return true;
            const empty = document.getElementById('emptyState');
            if (empty && typeof window.getComputedStyle === 'function') {
                const style = window.getComputedStyle(empty);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return true;
            }
            return false;
        }""",
        timeout=timeout_ms,
    )


def _collect_import_dialog_errors(dialog_messages: list[str]) -> list[str]:
    return [msg.strip() for msg in dialog_messages if _looks_like_import_error(msg)]


def render_to_png(
    input_file: pathlib.Path,
    output_png: pathlib.Path,
    *,
    extra_files: list[pathlib.Path] | None = None,
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

    resolved_extra_files: list[pathlib.Path] = []
    for extra in (extra_files or []):
        p = extra.expanduser().resolve()
        if not p.is_file():
            raise FileNotFoundError(f"Extra file does not exist: {p}")
        if p == input_file:
            continue
        if p not in resolved_extra_files:
            resolved_extra_files.append(p)

    output_png = output_png.expanduser().resolve()
    output_png.parent.mkdir(parents=True, exist_ok=True)

    if save_preset_path is not None:
        save_preset_path = save_preset_path.expanduser().resolve()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not headed)
        page = browser.new_page(viewport={"width": 1600, "height": 1000})
        import_dialog_messages: list[str] = []

        def _on_dialog(dialog: Any) -> None:
            import_dialog_messages.append(str(getattr(dialog, "message", "") or ""))
            try:
                dialog.accept()
            except Exception:
                pass

        page.on("dialog", _on_dialog)
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

        # Upload molecular file plus optional sidecars (vibration payloads, etc.).
        upload_files = [str(input_file)] + [str(p) for p in resolved_extra_files]
        page.set_input_files("#fileInput", upload_files)

        if iso is not None:
            _set_input_value(page, "#iso", iso, "change")

        if style is not None:
            picked = _set_style_with_alias(page, style)
            if picked is None:
                raise RuntimeError(f"Could not apply style '{style}' on this deployment")

        # Wait for a loaded file state; keep compatibility with older hints/UI.
        try:
            _wait_for_import_ready(page, timeout_ms=20_000)
        except PlaywrightTimeoutError:
            # Continue to explicit error checks below.
            ...

        if wait_ms > 0:
            page.wait_for_timeout(wait_ms)

        import_errors = _collect_import_dialog_errors(import_dialog_messages)
        if import_errors:
            joined = "\n".join(f"- {msg}" for msg in import_errors)
            raise RuntimeError(f"Page reported import error(s):\n{joined}")

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
        jobs = _build_render_jobs(args)
        save_preset_path = _resolve_save_preset_path(args, jobs)
        preset_obj, preset_mode = _load_preset_from_sources(args)
        extra_files = _resolve_extra_paths(args.extra_file)
        failures: list[tuple[pathlib.Path, Exception]] = []
        for index, (input_path, output_path) in enumerate(jobs, start=1):
            run_start = time.time()
            try:
                render_to_png(
                    input_path,
                    output_path,
                    extra_files=extra_files,
                    url=args.url,
                    iso=args.iso,
                    style=args.style,
                    preset=preset_obj,
                    preset_mode=preset_mode,
                    save_preset_path=save_preset_path,
                    preset_name=args.preset_name,
                    wait_ms=args.wait_ms,
                    headed=args.headed,
                )
            except Exception as exc:
                if not args.continue_on_error:
                    raise
                failures.append((input_path, exc))
                print(f"ERROR [{index}/{len(jobs)}] {input_path}: {exc}", file=sys.stderr)
                continue

            dt = time.time() - run_start
            print(f"Saved [{index}/{len(jobs)}]: {output_path} ({dt:.2f}s)")

        if failures:
            print(f"Completed with failures: {len(failures)}/{len(jobs)} file(s) failed.", file=sys.stderr)
            return 1
    except Exception as exc:  # pragma: no cover - prototype cli
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    dt = time.time() - start
    if len(jobs) > 1:
        print(f"Batch complete: {len(jobs)} file(s) in {dt:.2f}s")
    else:
        print(f"Done: {dt:.2f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
