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
import pathlib
import sys
import time

DEFAULT_URL = "https://evangelistalab.org/vibemol/"


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
        choices=["default", "toon", "studio", "glossy"],
        default=None,
        help="Optional molecule style",
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


def render_to_png(
    input_file: pathlib.Path,
    output_png: pathlib.Path,
    *,
    url: str = DEFAULT_URL,
    iso: float | None = None,
    style: str | None = None,
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

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not headed)
        page = browser.new_page(viewport={"width": 1600, "height": 1000})
        page.goto(url, wait_until="domcontentloaded", timeout=45_000)

        # Wait for app shell.
        # file input is hidden in VibeMol UI, so wait for attachment, not visibility.
        page.wait_for_selector("#fileInput", state="attached", timeout=20_000)
        page.wait_for_selector("#canvas", timeout=20_000)

        # Upload molecular file.
        page.set_input_files("#fileInput", str(input_file))

        if iso is not None:
            page.fill("#iso", str(iso))
            page.dispatch_event("#iso", "change")

        if style is not None:
            page.select_option("#moleculeStyle", style)
            page.dispatch_event("#moleculeStyle", "change")

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
        render_to_png(
            pathlib.Path(args.input_file),
            pathlib.Path(args.output_png),
            url=args.url,
            iso=args.iso,
            style=args.style,
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
