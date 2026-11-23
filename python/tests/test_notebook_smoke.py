"""Exercise the installed widget in a real JupyterLab notebook."""

from contextlib import contextmanager
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

from playwright.sync_api import expect
import pytest

from helpers import find_free_port, read_app_version


PYTHON_DIR = Path(__file__).resolve().parents[1]
NOTEBOOK = Path("examples/viewer_demo.ipynb")
MOLDEN = Path("tests/data/cyclopropene_cas43.molden")
VIEWER = 'iframe[title="VibeMol molecular viewer"]'


@contextmanager
def jupyter_lab(directory, app_url):
    workspace = directory / "notebooks"
    for relative in (NOTEBOOK, MOLDEN):
        target = workspace / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(PYTHON_DIR / relative, target)

    jupyter_data = directory / "jupyter-data"
    kernel = jupyter_data / "kernels" / "python3" / "kernel.json"
    kernel.parent.mkdir(parents=True)
    kernel.write_text(json.dumps({
        "argv": [sys.executable, "-m", "ipykernel_launcher", "-f", "{connection_file}"],
        "display_name": "Python 3 (ipykernel)",
        "language": "python",
    }))
    env = dict(
        os.environ,
        VIBEMOL_VIEWER_URL=app_url,
        JUPYTER_PATH=str(jupyter_data),
        JUPYTER_CONFIG_DIR=str(directory / "jupyter-config"),
        JUPYTER_DATA_DIR=str(jupyter_data),
        JUPYTER_RUNTIME_DIR=str(directory / "jupyter-runtime"),
    )
    port = find_free_port()
    token = secrets.token_urlsafe(32)
    base = f"http://127.0.0.1:{port}"
    log_path = directory / "jupyterlab.log"
    with log_path.open("w") as log:
        process = subprocess.Popen([
            sys.executable, "-m", "jupyterlab", "--no-browser",
            "--ServerApp.ip=127.0.0.1", f"--ServerApp.port={port}",
            "--ServerApp.port_retries=0", f"--ServerApp.root_dir={workspace}",
            f"--IdentityProvider.token={token}",
        ], cwd=workspace, env=env, stdout=log, stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL)
        try:
            status = Request(f"{base}/api/status", headers={"Authorization": f"token {token}"})
            deadline = time.monotonic() + 60
            while process.poll() is None and time.monotonic() < deadline:
                try:
                    with urlopen(status, timeout=1) as response:
                        if response.status == 200:
                            break
                except (URLError, TimeoutError):
                    time.sleep(0.2)
            else:
                raise RuntimeError("JupyterLab did not start")
            yield f"{base}/lab/tree/{NOTEBOOK.as_posix()}?token={token}"
        except Exception:
            print(log_path.read_text().replace(token, "<test-token>"))
            raise
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


@pytest.mark.slow
def test_demo_notebook_displays_and_loads_molden(page, app_url, tmp_path):
    with jupyter_lab(tmp_path, app_url) as notebook_url:
        navigation = page.goto(notebook_url, wait_until="domcontentloaded")
        assert navigation and navigation.ok, "JupyterLab did not serve the demo notebook"
        cells = page.locator(".jp-Notebook .jp-CodeCell")

        def run_cell(index):
            cell = cells.nth(index)
            cell.locator(".jp-InputArea-editor .cm-content").click(timeout=45_000)
            page.keyboard.press("Shift+Enter")
            return cell

        run_cell(0)
        iframe = page.locator(VIEWER)
        expect(iframe).to_be_visible(timeout=60_000)
        run_cell(1)
        viewer = page.frame_locator(VIEWER)
        expect(viewer.get_by_text(MOLDEN.name, exact=True).first).to_be_visible(timeout=30_000)
        status = run_cell(2)
        expect(status.locator(".jp-OutputArea-output")).to_contain_text(
            f"True {read_app_version()}\n1 Molden file loaded", timeout=30_000,
        )

        artifact_dir = Path(os.environ.get(
            "VIBEMOL_WIDGET_ARTIFACT_DIR", "out/test-artifacts/python-widget",
        ))
        artifact_dir.mkdir(parents=True, exist_ok=True)
        iframe.scroll_into_view_if_needed()
        page.screenshot(path=artifact_dir / "viewer_demo.png")
