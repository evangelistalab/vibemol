from base64 import b64decode
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

from playwright.sync_api import expect

from helpers import read_app_version
from vibemol import Viewer

VIEWER_PATH = re.compile(r"/\?from=notebook&embed=commands$")
MOLDEN = Path(__file__).parent / "data" / "cyclopropene_cas43.molden"


def send(page, id_, command, **params):
    page.evaluate("request => harness.model.emit(request)",
                  dict(kind="request", id=id_, command=command, params=params))


def response(page, id_):
    return page.wait_for_function("id => harness.sent.find(m => m.kind === 'response' && m.id === id)",
                                  arg=id_).json_value()["result"]


def test_iframe_round_trip_queue_state_and_cleanup(page, app_url):
    held_routes = []
    page.route(VIEWER_PATH, lambda route: held_routes.append(route) if not held_routes else route.continue_())
    with page.expect_request(lambda request: VIEWER_PATH.search(request.url)):
        page.goto(app_url + "python/tests/harness.html", wait_until="domcontentloaded")
    page.wait_for_function("() => !!window.harness")
    token = page.evaluate("harness.token")
    first = page.locator("#first iframe")
    src = urlsplit(first.get_attribute("src"))
    assert src.query == "from=notebook&embed=commands"
    assert src.fragment == "vmtoken=" + token
    expect(first).to_have_css("height", "480px")

    send(page, "queued", "app.info")
    send(page, "molden", "files.load", files=[{"name": MOLDEN.name, "text": MOLDEN.read_text()}])
    assert page.evaluate("harness.model.get('ready')") is False
    assert page.evaluate("harness.sent.filter(message => message.kind === 'response')") == []
    assert len(held_routes) == 1
    held_routes[0].continue_()

    info = {"appVersion": read_app_version(), "commandVersion": 1}
    assert response(page, "queued") == {"ok": True, "value": info}
    assert page.evaluate("harness.model.get('ready')") is True
    assert page.evaluate("harness.model.get('app_info')") == info
    iframe = first.element_handle().content_frame()
    assert iframe.evaluate("location.hash") == ""
    assert response(page, "molden") == {
        "ok": True, "value": {"ok": True, "loadedCount": 1, "loadedNames": [MOLDEN.name]},
    }
    assert page.evaluate("harness.sent.filter(message => message.kind === 'response').map(message => message.id)") == [
        "queued", "molden",
    ]
    send(page, "enter", "edit.enter", tool="transform")
    assert response(page, "enter")["ok"] is True
    send(page, "select", "edit.setSelection", selector={"kind": "labels", "labels": ["C1", "C2"]})
    selected = response(page, "select")
    assert selected["ok"] is True
    assert selected["value"]["indices"] == [0, 1]
    page.wait_for_function("() => harness.model.get('selection')?.count === 2")
    assert page.evaluate("harness.model.get('selection')") == selected["value"]
    assert page.evaluate("harness.model.get('calculations').options.method") == "cas"

    forged = {
        "channel": "vibemol.embed", "v": 1, "token": token, "kind": "state",
        "state": {"selection": {"count": 99}, "calculations": None},
    }
    page.evaluate("message => postMessage(message, location.origin)", forged)
    iframe.evaluate("message => parent.postMessage(message, location.origin)", {**forged, "token": token + "-wrong"})
    send(page, "fence", "edit.getSelection")
    assert response(page, "fence") == selected
    assert page.evaluate("harness.model.get('selection')") == selected["value"]
    assert all(save["selection"] != {"count": 99} for save in page.evaluate("harness.saves"))

    send(page, "plane-selection", "edit.setSelection", selector={"kind": "element", "element": "C"})
    plane_selection = response(page, "plane-selection")
    assert plane_selection["ok"] is True
    assert plane_selection["value"]["indices"] == [0, 1, 2]
    send(page, "basis", "calculations.ready")
    assert response(page, "basis")["ok"] is True
    for index in range(3):
        id_ = f"shell-{index}"
        send(page, id_, "calculations.selectShell", index=index, shell="2p")
        assert response(page, id_)["value"]["assigned"] is True
    send(page, "options", "calculations.configure", method="cumulative", sigma=0.98)
    assert response(page, "options")["ok"] is True
    send(page, "export", "forte2.export", avas={"planes": [{
        "kind": "piPlane", "seed": {"kind": "ids", "ids": plane_selection["value"]["atomIds"]},
    }]})
    exported = response(page, "export")
    assert exported["ok"] is True, exported
    assert exported["value"]["avas"]["arguments"]["subspace_pi_planes"] == [["C1-3"]]

    page.evaluate("harness.display('second')")
    expect(page.locator("#second")).to_have_text("This VibeMol viewer is already displayed above")
    expect(page.locator("iframe")).to_have_count(1)
    page.evaluate("harness.remove('first')")
    expect(page.locator("iframe")).to_have_count(0)
    assert page.evaluate("harness.model.get('ready')") is False
    page.evaluate("harness.display('third')")
    expect(page.locator("#third iframe")).to_have_count(1)
    page.wait_for_function("() => harness.model.get('ready')")
    send(page, "new-view", "app.info")
    assert response(page, "new-view") == {"ok": True, "value": info}


def test_iframe_mode_switch_and_orbital_refusal(page, app_url):
    page.goto(app_url + "python/tests/harness.html", wait_until="domcontentloaded")
    page.wait_for_function("() => window.harness?.model.get('ready')")
    send(page, "molden", "files.load", files=[{"name": MOLDEN.name, "text": MOLDEN.read_text()}])
    assert response(page, "molden")["ok"] is True

    send(page, "edit", "view.setMode", mode="edit")
    edit = {"mode": "edit", "surfacesSuppressed": True}
    assert response(page, "edit") == {"ok": True, "value": edit}
    send(page, "hidden", "orbitals.show", indices=[1], exclusive=True)
    assert response(page, "hidden") == {"ok": False, "error": {
        "code": "not-available",
        "message": "Orbital surfaces are hidden in Edit mode; call view.setMode('view') first.",
        "details": edit,
    }}
    iframe = page.frame_locator("#first iframe")
    expect(iframe.locator("#modeEditBtn")).to_have_class(re.compile(r"\bactive\b"))

    send(page, "view", "view.setMode", mode="view")
    assert response(page, "view") == {"ok": True, "value": {"mode": "view", "surfacesSuppressed": False}}
    send(page, "visible", "orbitals.show", indices=[1], exclusive=True)
    assert response(page, "visible") == {"ok": True, "value": {"visibleIndices": [1]}}

    def run(command, **params):
        send(page, command, command, **params)
        result = response(page, command)
        assert result["ok"] is True, (command, result)
        return result["value"]

    assert run("orbitals.list")["orbitals"][0]["index"] == 1
    assert run("orbitals.configure", indices=[1], iso=0.04, opacity=0.5)["orbitals"] == [
        {"index": 1, "iso": 0.04, "opacity": 0.5},
    ]
    assert run("orbitals.hide")["visibleIndices"] == []
    assert run("view.set", projection="orthographic", axis="+x")["projection"] == "orthographic"
    atoms = run("vectors.list")["atomicNumbers"]
    values = [[0, 0, 1] for _ in atoms]
    forces = run("vectors.setAtoms", name="forces", color="#BB3388", values=values, atomicNumbers=atoms, maxLength=1)
    assert forces["sets"][0]["name"] == "forces"
    dipole = run("vectors.setArrow", name="dipole", color="#229944", vector=[0, 1, 0], length=1, heads="both")
    assert dipole["sets"][1]["heads"] == "both"
    snap = run("view.snapshot", width=320, height=240)
    assert (snap["width"], snap["height"], snap["mime"]) == (320, 240, "image/png")
    assert b64decode(snap["dataBase64"]).startswith(b"\x89PNG\r\n\x1a\n")
    assert [row["name"] for row in run("vectors.remove", name="forces")["sets"]] == ["dipole"]
    assert run("vectors.clear")["sets"] == []


def test_python_widget_vector_commands_follow_edit_history(page, app_url, monkeypatch, capsys):
    page.goto(app_url + "python/tests/harness.html", wait_until="domcontentloaded")
    page.wait_for_function("() => window.harness?.model.get('ready')")
    frame = page.frame_locator("#first iframe")
    water = "3\nVector history water\nO 0 0 0\nH 0.96 0 0\nH -0.24 0.93 0"

    def check(label, actual, expected):
        with capsys.disabled():
            print("[widget-vector-history] " + json.dumps(
                {"label": label, "actual": actual, "expected": expected}, sort_keys=True), flush=True)
        assert actual == expected, (label, actual, expected)

    model = Viewer(url=app_url)
    requests = []

    def bridge(request):
        requests.append(request)
        send(page, request["id"], request["command"], **request["params"])

    def complete(future):
        request = requests[-1]
        raw = response(page, request["id"])
        check(f'{request["command"]} widget success', raw if raw.get("ok") is not True else True, True)
        model._handle_custom_msg({"kind": "response", "id": request["id"], "result": raw}, [])
        return future.result()

    def state():
        volume = json.loads(complete(model.run("session.export")))["sources"][0]["volume"]
        return {"atoms": volume["atoms"], "vectors": {
            field: volume[field] for field in ("xyzVectors", "arrows") if field in volume
        }}

    def press(key):
        frame.locator("#canvas").focus()
        page.keyboard.press(key)

    try:
        monkeypatch.setattr(model, "send", bridge)
        complete(model.load(("water.xyz", water)))
        complete(model.set_mode("edit"))
        values = [[1,0,0],[0,1,0],[0,0,1]]
        complete(model.set_atom_vectors("initial", values, "#228844", scale=1))
        original = state()
        press("p")
        rotated = state()
        check("Align changed atoms and vector components", [
            original["atoms"] != rotated["atoms"], original["vectors"] != rotated["vectors"],
        ], [True, True])
        complete(model.set_atom_vectors("late", values, "#9933AA", scale=1))
        with_atoms = state()
        complete(model.set_arrow("dipole", [0,1,0], "#AA2277", scale=2))
        with_arrow = state()
        check("Widget mutations leave atoms unchanged", [with_atoms["atoms"], with_arrow["atoms"]],
              [rotated["atoms"], rotated["atoms"]])
        for action, key, steps in (
            ("Undo", "ControlOrMeta+z", ((with_atoms,"Vectors"),(rotated,"Vectors"),(original,"Align principal axes"))),
            ("Redo", "ControlOrMeta+Shift+z", ((rotated,"Align principal axes"),(with_atoms,"Vectors"),(with_arrow,"Vectors"))),
        ):
            for index, (expected, label) in enumerate(steps):
                press(key)
                check(f"{action} widget history step {index + 1}",
                      {"hint": frame.locator("#hint .vm-edit-tool-status").text_content(), "state": state()},
                      {"hint": f"{action}: {label}", "state": expected})
    finally:
        model.close()


def test_python_widget_runs_commands_in_order(page, app_url, monkeypatch, capsys):
    page.goto(app_url + "python/tests/harness.html", wait_until="domcontentloaded")
    page.wait_for_function("() => window.harness?.model.get('ready')")
    water = "3\nWater\nO 0 0 0\nH 0.96 0 0\nH -0.24 0.93 0"
    molden = MOLDEN.with_name("cyclopropene_sa2cas43.molden")
    atoms = [1, 1, 1, 1, 6, 6, 6]
    values = [[0, 0, 1] for _ in atoms]
    model = Viewer(url=app_url)
    outgoing = []

    def collect_responses():
        # Send each batch to the real widget ESM before delivering any replies to Python.
        results = []
        while outgoing:
            batch = outgoing[:]
            outgoing.clear()
            page.evaluate("requests => requests.forEach(request => harness.model.emit(request))", batch)
            for request in batch:
                raw = response(page, request["id"])
                value = raw.get("value")
                if request["command"] == "view.snapshot" and raw["ok"]:
                    value = {key: value[key] for key in ("mime", "width", "height")}
                results.append({"command": request["command"], **raw, "value": value})
                model._handle_custom_msg({"kind": "response", "id": request["id"], "result": raw}, [])
        return results

    try:
        monkeypatch.setattr(model, "send", outgoing.append)
        futures = [
            model.load(("water.xyz", water)),
            model.load(molden),
            model.set_atom_vectors("forces", values, "#BB3388", atomic_numbers=atoms, scale=1),
            model.set_view(axis="+x"),
            model.snapshot(width=320, height=240),
        ]
        results = collect_responses()
        vectors = model.run("vectors.list")
        results.extend(collect_responses())

        expected_commands = ["files.load", "files.load", "vectors.setAtoms", "view.set", "view.snapshot", "vectors.list"]
        evidence = {
            "results": results,
            "completed": [future.done() for future in [*futures, vectors]],
            "expected": {"commands": expected_commands, "atomicNumbers": atoms, "sets": ["forces"]},
        }
        with capsys.disabled():
            print("[widget-command-order] " + json.dumps(evidence, sort_keys=True), flush=True)
        assert [row["command"] for row in results] == expected_commands, evidence
        assert all(future.done() for future in [*futures, vectors]), evidence
        assert all(row["ok"] for row in results), evidence
        first, second, _, _, image = [future.result() for future in futures]
        assert first["loadedNames"] == ["water.xyz"]
        assert second["loadedNames"] == [molden.name]
        assert image.data.startswith(b"\x89PNG\r\n\x1a\n")
        state = vectors.result()
        assert state["atomicNumbers"] == atoms, state
        assert [row["name"] for row in state["sets"]] == ["forces"], state
    finally:
        model.close()


def test_incompatible_viewer_never_gets_a_queued_request(page, app_url):
    def incompatible(route):
        route.fulfill(content_type="text/html", body="""<!doctype html>
          <script>
            const token = new URLSearchParams(location.hash.slice(1)).get('vmtoken');
            window.incoming = [];
            addEventListener('message', event => { incoming.push(event.data); });
            parent.postMessage({channel:'vibemol.embed', v:1, token, kind:'ready',
              info:{appVersion:'other', commandVersion:2}}, '*');
          </script>""")

    page.route(VIEWER_PATH, incompatible)
    page.goto(app_url + "python/tests/harness.html", wait_until="domcontentloaded")
    page.wait_for_function("() => window.harness?.model.get('last_error')?.code === 'incompatible'")
    send(page, "refused", "app.info")
    assert response(page, "refused")["error"]["code"] == "incompatible"
    assert page.evaluate("harness.model.get('ready')") is False
    assert page.locator("iframe").element_handle().content_frame().evaluate("incoming") == []
