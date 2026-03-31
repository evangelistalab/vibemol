from __future__ import annotations

import contextlib
import http.client
import pathlib
import socket
import subprocess
import sys
import time
from typing import Iterator


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen(1)
        return int(sock.getsockname()[1])


@contextlib.contextmanager
def run_http_server(root: pathlib.Path) -> Iterator[str]:
    port = find_free_port()
    process = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=str(root),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    base_url = f"http://127.0.0.1:{port}/"
    deadline = time.time() + 15.0
    try:
        while time.time() < deadline:
            try:
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=0.5)
                conn.request("GET", "/")
                response = conn.getresponse()
                response.read()
                if response.status < 500:
                    break
            except OSError:
                time.sleep(0.1)
            finally:
                with contextlib.suppress(Exception):
                    conn.close()  # type: ignore[name-defined]
        else:
            raise RuntimeError(f"Timed out waiting for local server at {base_url}")
        yield base_url
    finally:
        process.terminate()
        with contextlib.suppress(subprocess.TimeoutExpired):
            process.wait(timeout=5)
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)


def ensure_artifact_dir(root: pathlib.Path) -> pathlib.Path:
    root.mkdir(parents=True, exist_ok=True)
    return root


def write_failure_artifacts(page, artifact_dir: pathlib.Path, name: str, page_errors: list[str], console_errors: list[str]) -> None:
    ensure_artifact_dir(artifact_dir)
    png_path = artifact_dir / f"{name}.png"
    html_path = artifact_dir / f"{name}.html"
    log_path = artifact_dir / f"{name}.log"
    with contextlib.suppress(Exception):
        page.screenshot(path=str(png_path), full_page=True)
    with contextlib.suppress(Exception):
        html_path.write_text(page.content(), encoding="utf-8")
    log_lines = ["[page errors]"]
    log_lines.extend(page_errors or ["(none)"])
    log_lines.append("")
    log_lines.append("[console errors]")
    log_lines.extend(console_errors or ["(none)"])
    log_path.write_text("\n".join(log_lines) + "\n", encoding="utf-8")
