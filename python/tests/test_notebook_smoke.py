"""Exercise the installed widget in a real JupyterLab notebook."""

from base64 import b64decode, b64encode
from contextlib import ExitStack, contextmanager, suppress
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
from threading import Event, Thread
import time

from playwright.sync_api import Error, expect
import pytest

from helpers import find_free_port, read_app_version


PYTHON_DIR = Path(__file__).resolve().parents[1]
NOTEBOOK = Path("examples/viewer_demo.ipynb")
MOLDEN = Path("tests/data/cyclopropene_cas43.molden")
EXCITED_NOTEBOOK = Path("examples/excited_state_vectors.ipynb")
EXCITED_MOLDEN = Path("tests/data/cyclopropene_sa2cas43.molden")
EXCITED_PROPERTIES = Path("tests/data/cyclopropene_sa2cas43_properties.json")
VIEWER = 'iframe[title="VibeMol molecular viewer"]'
PROMPT = re.compile(r"^\[\s*(?:\*|\d+)\s*\]:?$")
MIN_NON_BACKGROUND_PIXELS = 64
NOTEBOOK_STATE = """() => {
    const cells = Array.from(document.querySelectorAll('.jp-Notebook .jp-CodeCell'));
    const readText = node => node?.textContent.trim() ?? null;
    const statusBar = document.querySelector('#jp-main-statusbar');
    const statusText = Array.from(statusBar?.querySelectorAll('[role="button"], button') ?? [])
        .map(readText).find(text => text.includes('|')) ?? null;
    const editor = document.activeElement;
    return {
        prompts: cells.map(cell => readText(cell.querySelector('.jp-InputPrompt'))),
        kernelStatus: statusText?.split('|').at(-1).trim().toLowerCase() ?? null,
        kernelIndicator: document.querySelector('.jp-Notebook-ExecutionIndicator')?.dataset.status ?? null,
        statusBar: statusText,
        dialogs: Array.from(document.querySelectorAll('.jp-Dialog'))
            .filter(dialog => dialog.getClientRects().length)
            .map(dialog => readText(dialog.querySelector('.jp-Dialog-header'))),
        activeElement: editor ? {
            tag: editor.tagName, id: editor.id, className: editor.getAttribute('class'),
            codeCell: cells.indexOf(editor.closest('.jp-CodeCell'))
        } : null,
        shiftEnter: window.notebookShiftEnter ?? [],
    };
}"""

# Exclude the border and the bottom-left axis gizmo. Compare the central
# sample with its dominant color so a uniform or transparent canvas fails.
PIXEL_STATS = """(source, {x, y, width, height}) => {
    const sample = document.createElement('canvas');
    sample.width = sample.height = 64;
    const context = sample.getContext('2d', {willReadFrequently: true});
    context.drawImage(source, x + width / 4, y + height / 4, width / 2, height / 2, 0, 0, 64, 64);
    const pixels = new Uint32Array(context.getImageData(0, 0, 64, 64).data.buffer);
    const histogram = new Map();
    let background = 0, maxFrequency = 0;
    for (const pixel of pixels) {
        const frequency = (histogram.get(pixel) ?? 0) + 1;
        histogram.set(pixel, frequency);
        if (frequency > maxFrequency) {
            maxFrequency = frequency;
            background = pixel;
        }
    }
    const backgroundRGBA = Array.from(new Uint8Array(new Uint32Array([background]).buffer));
    const deviation = pixel => backgroundRGBA.some((channel, index) =>
        Math.abs(channel - ((pixel >>> (8 * index)) & 255)) > 12);
    const nonBackgroundPixels = pixels.reduce((count, pixel) => count + Number(deviation(pixel)), 0);
    return {width, height, backgroundRGBA, sampledPixels: pixels.length, nonBackgroundPixels};
}"""


@contextmanager
def jupyter_lab(directory, app_url, notebook, fixtures):
    workspace = directory / "notebooks"
    for relative in (notebook, *fixtures):
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
    process = subprocess.Popen([
        sys.executable, "-m", "jupyterlab", "--no-browser",
        "--ServerApp.ip=127.0.0.1", f"--ServerApp.port={port}",
        "--ServerApp.port_retries=0", f"--ServerApp.root_dir={workspace}",
        f"--IdentityProvider.token={token}",
    ], cwd=workspace, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL, text=True, errors="replace")
    ready = Event()
    startup_finished = Event()

    def collect_log():
        with process.stdout as output, log_path.open("w", buffering=1) as log:
            for line in output:
                log.write(line.replace(token, "<test-token>"))
                if f"{base}/lab?token=" in line:
                    ready.set()
                    startup_finished.set()
        startup_finished.set()

    reader = Thread(target=collect_log, daemon=True)
    reader.start()
    try:
        if not startup_finished.wait(timeout=60) or not ready.is_set():
            raise RuntimeError("JupyterLab did not announce its listening URL")
        yield f"{base}/lab/tree/{notebook.as_posix()}?token={token}"
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        reader.join(timeout=5)


def presented_canvas(frame, actual):
    probe = frame.evaluate_handle("""() => {
        const sample = {presented: false, pixels: null};
        requestAnimationFrame(() => requestAnimationFrame(() => { sample.presented = true; }));
        return sample;
    }""")
    try:
        frame.wait_for_function(f"""(sample) => {{
            const canvas = document.querySelector('#canvas');
            if (sample.presented && canvas?.width > 0 && canvas?.height > 0) {{
                sample.pixels = ({PIXEL_STATS})(canvas, {{
                    x: 0, y: 0, width: canvas.width, height: canvas.height
                }});
            }}
            return sample.pixels?.nonBackgroundPixels >= {MIN_NON_BACKGROUND_PIXELS};
        }}""", arg=probe, timeout=30_000)
    finally:
        with suppress(Error):
            actual.update(probe.json_value())


@contextmanager
def notebook_run(page, app_url, tmp_path, capsys, notebook, fixtures):
    artifact_dir = Path(os.environ.get(
        "VIBEMOL_WIDGET_ARTIFACT_DIR", "out/test-artifacts/python-widget",
    ))
    artifact_dir.mkdir(parents=True, exist_ok=True)
    server_log = tmp_path / "jupyterlab.log"
    navigation_started = None

    def observe(checkpoint, outcome, expected, actual):
        try:
            state = page.evaluate(NOTEBOOK_STATE)
        except Error as error:
            state = {"pageReadError": str(error)}
        tail = server_log.read_text().splitlines()[-8:] if server_log.exists() else []
        elapsed = None if navigation_started is None else round(1000 * (time.monotonic() - navigation_started))
        record = dict(checkpoint=checkpoint, outcome=outcome, elapsedSinceNavigationMs=elapsed,
                      state=state, expected=expected, actual=actual, serverLogTail=tail)
        with capsys.disabled():
            print("[notebook-smoke] " + json.dumps(record, sort_keys=True), flush=True)

    @contextmanager
    def check(checkpoint, **expected):
        actual = {}
        observe(checkpoint, "before", expected, actual)
        try:
            yield actual
        except Exception:
            observe(checkpoint, "failed", expected, actual)
            raise
        else:
            observe(checkpoint, "passed", expected, actual)

    def run_cell(index):
        cell = page.locator(".jp-Notebook .jp-CodeCell").nth(index)
        editor = cell.locator(".jp-InputArea-editor .cm-content")
        with check("cell-focus", codeCell=index):
            editor.click(timeout=45_000)
            expect(editor).to_be_focused()
        if index == 0:
            with check("notebook-ready", kernelStatus="idle", connectedKernel=True, dialogs=[], codeCell=index):
                page.wait_for_function(f"""() => {{
                    const state = ({NOTEBOOK_STATE})();
                    return state.kernelStatus === 'idle' && !state.statusBar.startsWith('No Kernel')
                        && !state.dialogs.length && state.activeElement?.codeCell === 0;
                }}""", timeout=45_000)
        with check("cell-execution", codeCell=index, prompt="[*] or [n]", presses=1):
            page.keyboard.press("Shift+Enter")
            expect(cell.locator(".jp-InputPrompt").first).to_have_text(PROMPT, timeout=30_000)
        return cell

    with ExitStack() as server:
        try:
            with check("server-start", listening=True):
                notebook_url = server.enter_context(jupyter_lab(tmp_path, app_url, notebook, fixtures))
            with check("navigation", responseOK=True) as actual:
                page.add_init_script(f"""
                    window.notebookShiftEnter = [];
                    window.addEventListener('keydown', (event) => {{
                        if (event.key !== 'Enter' || !event.shiftKey) return;
                        const state = ({NOTEBOOK_STATE})();
                        window.notebookShiftEnter.push({{
                            codeCell: state.activeElement?.codeCell, trusted: event.isTrusted,
                            kernelStatus: state.kernelStatus, dialogs: state.dialogs
                        }});
                    }}, true);
                """)
                navigation_started = time.monotonic()
                navigation = page.goto(notebook_url, wait_until="domcontentloaded")
                actual["status"] = navigation.status if navigation else None
                assert navigation and navigation.ok, "JupyterLab did not serve the demo notebook"

            yield run_cell, check, artifact_dir
        except Exception:
            observe("notebook-smoke", "failed", {}, {})
            with suppress(Error):
                page.screenshot(path=artifact_dir / f"{notebook.stem}_failure.png", full_page=True)
            raise


def canvas_screenshot(page, iframe, check, path):
    with check("presented-canvas", presented=True, minimumNonBackgroundPixels=MIN_NON_BACKGROUND_PIXELS) as actual:
        iframe.scroll_into_view_if_needed()
        frame = iframe.element_handle().content_frame()
        assert frame is not None
        presented_canvas(frame, actual)

    with check("screenshot", minimumNonBackgroundPixels=MIN_NON_BACKGROUND_PIXELS) as actual:
        bounds = frame.locator("#canvas").bounding_box()
        actual["bounds"] = bounds
        assert bounds is not None
        screenshot = page.screenshot(path=path, scale="css")
        actual["pixels"] = page.evaluate(f"""async ({{png, bounds}}) => {{
            const image = new Image();
            image.src = 'data:image/png;base64,' + png;
            await image.decode();
            return ({PIXEL_STATS})(image, bounds);
        }}""", {"png": b64encode(screenshot).decode("ascii"), "bounds": bounds})
        assert actual["pixels"]["nonBackgroundPixels"] >= MIN_NON_BACKGROUND_PIXELS, actual


@pytest.mark.slow
def test_demo_notebook_displays_and_loads_molden(page, app_url, tmp_path, capsys):
    with notebook_run(page, app_url, tmp_path, capsys, NOTEBOOK, (MOLDEN,)) as (run_cell, check, artifacts):
        run_cell(0)
        iframe = page.locator(VIEWER)
        with check("viewer-output", visible=True, timeoutMs=60_000):
            expect(iframe).to_be_visible(timeout=60_000)
        run_cell(1)
        viewer = page.frame_locator(VIEWER)
        with check("molden-loaded", file=MOLDEN.name, timeoutMs=30_000):
            expect(viewer.get_by_text(MOLDEN.name, exact=True).first).to_be_visible(timeout=30_000)
        status = run_cell(2)
        receipt = f"True {read_app_version()}\n1 Molden file loaded"
        with check("load-receipt", text=receipt, timeoutMs=30_000):
            expect(status.locator(".jp-OutputArea-output")).to_contain_text(receipt, timeout=30_000)
        canvas_screenshot(page, iframe, check, artifacts / "viewer_demo.png")


@pytest.mark.slow
def test_excited_state_notebook_renders_five_panels(page, app_url, tmp_path, capsys):
    with notebook_run(page, app_url, tmp_path, capsys, EXCITED_NOTEBOOK, (EXCITED_MOLDEN, EXCITED_PROPERTIES)) as (
        run_cell, check, artifacts,
    ):
        run_cell(0)
        iframe = page.locator(VIEWER)
        with check("excited-viewer-output", visible=True, timeoutMs=60_000):
            expect(iframe).to_be_visible(timeout=60_000)

        def output(cell_index, *messages):
            cell = run_cell(cell_index)
            with check("excited-cell-output", index=cell_index, messages=messages, timeoutMs=30_000):
                for message in messages:
                    expect(cell.locator(".jp-Cell-outputArea")).to_contain_text(message, timeout=30_000)
            return cell

        def snapshot(cell, name):
            img = cell.locator(".jp-OutputArea-output img").first
            with check("excited-snapshot", panel=name, width=640, height=460,
                       minimumNonBackgroundPixels=MIN_NON_BACKGROUND_PIXELS) as actual:
                expect(img).to_be_visible(timeout=30_000)
                actual["pixels"] = img.evaluate(f"""async image => {{
                    await image.decode();
                    return ({PIXEL_STATS})(image, {{
                        x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight
                    }});
                }}""")
                pixels = actual["pixels"]
                assert [pixels["width"], pixels["height"]] == [640, 460]
                assert pixels["nonBackgroundPixels"] >= MIN_NON_BACKGROUND_PIXELS
                uri = img.get_attribute("src")
                assert uri.startswith("data:image/png;base64,")
                (artifacts / f"excited_{name}.png").write_bytes(b64decode(uri.split(",", 1)[1], validate=True))

        output(1, "Molden orbitals ready")
        output(2, "Active occupations: 1.989, 1.480, 0.530", "View and orbital ready")
        output(3, "Presented orbital 11 in View mode", "S1 forces ready")
        snapshot(output(4, "S1 force scale:", "S0 forces ready"), "s1_forces")
        snapshot(output(5, "S0 uses the S1 force scale: True", "Longest S0 arrow:"), "s0_forces")
        output(6, "S0 dipole ready")
        snapshot(output(7, "S0 dipole z: -0.405 a.u.", "S1 dipole ready"), "s0_dipole")
        snapshot(output(8, "S1 dipole z: +0.604 a.u.", "Same dipole scale: True"), "s1_dipole")
        output(9, "Transition dipole ready")
        snapshot(output(10, "f = 0.278", "Arrow heads: both"), "transition")
        canvas_screenshot(page, iframe, check, artifacts / "excited_state_vectors.png")
