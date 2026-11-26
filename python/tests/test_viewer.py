import json
import re

from IPython.display import Image
import numpy as np
import pytest

from api.vibemol_client import vibemol
from vibemol import CommandError, CommandFuture, PendingResult, Viewer


@pytest.fixture
def viewer(monkeypatch):
    model = Viewer()
    sent = []
    monkeypatch.setattr(model, "send", sent.append)
    yield model, sent
    model.close()


def deliver(model, **message):
    model._handle_custom_msg(message, [])


def test_tokens_and_default_traits():
    first, second = Viewer(), Viewer()
    try:
        assert re.fullmatch(r"[A-Za-z0-9_-]{32,}", first.token)
        assert first.token != second.token
        assert first.height == 640
        assert first.url == "https://vibemol.org/"
        assert first.ready is False
        assert first.app_info == {}
        assert first.selection is first.calculations is first.last_error is None
    finally:
        first.close()
        second.close()


def test_local_url_and_explicit_override():
    local = Viewer(source="local", local_port=8765, height=350)
    explicit = Viewer(url="https://example.org/viewer/?theme=dark", source="unused", local_port=0)
    try:
        assert (local.url, local.height) == ("http://localhost:8765/", 350)
        assert explicit.url == "https://example.org/viewer/?theme=dark"
    finally:
        local.close()
        explicit.close()


@pytest.mark.parametrize("url", ["file:///tmp/index.html", "javascript:alert(1)", "/viewer", "https://", "https://host.test:bad"])
def test_non_http_or_invalid_urls_are_rejected(url):
    with pytest.raises(ValueError):
        Viewer(url=url)


def test_load_matches_the_html_embed_normalizer(viewer, tmp_path):
    model, sent = viewer
    water = tmp_path / "water.xyz"
    water.write_text("1\nwater\nO 0 0 0\n")
    files = [water, {"name": "encoded.xyz", "base64": "YWJj"}, ("memory.xyz", b"hydrated"),
             {"name": "custom.xyz", "path": water}, {"name": "text.xyz", "text": "inline"}]
    old = vibemol(files, options={"newScenes": True}, clear_first=False, auto_display=False).data
    legacy_payload = json.loads(re.search(r"const payload = (.+);", old)[1])
    future = model.load(files, newScenes=True, clear_first=False)
    assert not future.done()
    assert sent[-1]["command"] == "files.load"
    assert sent[-1]["params"] == {key: legacy_payload[key] for key in ("files", "options")}
    deliver(model, kind="response", id=sent[-1]["id"], result={"ok": True})
    model.load(str(water), str(water), clearFirst=False)
    assert len(sent[-1]["params"]["files"]) == 2
    assert sent[-1]["params"]["options"] == {"clearFirst": False}
    with pytest.raises(ValueError):
        model.load()


def test_requests_resolve_by_id_and_notify_callbacks(viewer):
    model, sent = viewer
    first = model.run("app.info")
    second = model.run("edit.getSelection")
    first_request, = sent
    first_id = first_request["id"]
    assert first_request == {"kind": "request", "id": first_id, "command": "app.info", "params": {}}
    assert not first.done()
    with pytest.raises(PendingResult, match="later cell"):
        first.result()
    observed = []
    second.add_done_callback(lambda future: observed.append((future, future.result())))
    deliver(model, kind="response", id="unknown", result={"ok": True, "value": 42})
    assert sent == [first_request]
    assert not first.done() and not second.done()
    failure = {"code": "rejected", "message": "No active system", "details": {"code": "NO_SYSTEM"}}
    deliver(model, kind="response", id=first_id, result={"ok": False, "error": failure})
    assert [request["command"] for request in sent] == ["app.info", "edit.getSelection"]
    second_id = sent[-1]["id"]
    assert first_id != second_id
    assert not second.done() and observed == []
    deliver(model, kind="response", id=second_id, result={"ok": True, "value": {"indices": [2]}})
    assert observed == [(second, {"indices": [2]})]
    assert second.done()
    second.add_done_callback(lambda future: observed.append("late"))
    assert observed[-1] == "late"
    with pytest.raises(CommandError) as error:
        first.result()
    assert (error.value.code, error.value.message, error.value.details) == tuple(failure.values())
    deliver(model, kind="response", id=first_id, result={"ok": True, "value": 42})
    with pytest.raises(CommandError):
        first.result()


def test_two_commands_send_one_at_a_time(viewer):
    model, sent = viewer
    first = model.run("app.info")
    second = model.run("edit.getSelection")
    assert [request["command"] for request in sent] == ["app.info"]
    deliver(model, kind="response", id=sent[0]["id"], result={"ok": True, "value": 1})
    assert first.result() == 1
    assert not second.done()
    assert [request["command"] for request in sent] == ["app.info", "edit.getSelection"]
    deliver(model, kind="response", id=sent[1]["id"], result={"ok": True, "value": 2})
    assert second.result() == 2


@pytest.mark.parametrize("error_type", [TypeError, ValueError])
def test_send_exception_fails_one_future_and_advances_the_queue(viewer, monkeypatch, error_type):
    model, sent = viewer

    def send(request):
        sent.append(request)
        if request["command"] == "invalid":
            raise error_type("cannot send the request")

    monkeypatch.setattr(model, "send", send)
    first = model.run("app.info")
    invalid = model.run("invalid")
    following = model.run("edit.getSelection")
    assert len(sent) == 1
    deliver(model, kind="response", id=sent[0]["id"], result={"ok": True})
    assert first.done()
    assert [request["command"] for request in sent] == ["app.info", "invalid", "edit.getSelection"]
    with pytest.raises(CommandError, match="cannot send the request") as error:
        invalid.result()
    assert error.value.code == "failed"
    deliver(model, kind="response", id=sent[-1]["id"], result={"ok": True, "value": 42})
    assert following.result() == 42


def test_commands_from_done_callbacks_join_the_end_of_the_queue(viewer):
    model, sent = viewer
    first = model.run("app.info")
    second = model.run("edit.getSelection")
    callback_futures = []
    first.add_done_callback(lambda _: callback_futures.append(model.orbitals()))

    deliver(model, kind="response", id=sent[0]["id"], result={"ok": True})
    assert [request["command"] for request in sent] == ["app.info", "edit.getSelection"]
    third, = callback_futures
    assert not second.done() and not third.done()
    deliver(model, kind="response", id=sent[1]["id"], result={"ok": True})
    assert [request["command"] for request in sent] == ["app.info", "edit.getSelection", "orbitals.list"]
    assert second.done() and not third.done()
    deliver(model, kind="response", id=sent[2]["id"], result={"ok": True, "value": []})
    assert third.result() == []


def test_mode_and_orbital_methods_forward_futures_and_preserve_refusal(viewer):
    model, sent = viewer
    mode = model.set_mode("edit")
    assert not mode.done()
    assert sent[-1]["command"] == "view.setMode"
    assert sent[-1]["params"] == {"mode": "edit"}
    applied = {"mode": "edit", "surfacesSuppressed": True}
    deliver(model, kind="response", id=sent[-1]["id"], result={"ok": True, "value": applied})
    assert mode.result() == applied

    show = model.show_orbitals([10, 11], exclusive=False)
    assert not show.done()
    assert [request["command"] for request in sent] == ["view.setMode", "orbitals.show"]
    assert sent[-1]["params"] == {"indices": [10, 11], "exclusive": False}
    refusal = {"code": "not-available",
               "message": "Orbital surfaces are hidden in Edit mode; call view.setMode('view') first.",
               "details": applied}
    deliver(model, kind="response", id=sent[-1]["id"], result={"ok": False, "error": refusal})
    with pytest.raises(CommandError) as error:
        show.result()
    assert error.value.code == refusal["code"]
    assert str(error.value) == error.value.message == refusal["message"]
    assert error.value.details == refusal["details"]
    assert len(sent) == 2


def test_startup_requests_are_replayed_in_order_after_frontend_attachment(viewer):
    model, sent = viewer
    first = model.run("app.info")
    startup = sent.copy()
    second = model.run("edit.getSelection")
    third = model.orbitals()
    assert sent == startup
    deliver(model, kind="frontend-attached")
    assert sent == startup + [{"kind": "frontend-sync"}] + startup
    deliver(model, kind="frontend-attached")
    assert sent[-1] == {"kind": "frontend-sync"}
    assert not first.done() and not second.done()
    deliver(model, kind="response", id=startup[0]["id"], result={"ok": True})
    second_request = sent[-1]
    assert second_request["command"] == "edit.getSelection"
    deliver(model, kind="frontend-attached")
    assert sent[-1] == {"kind": "frontend-sync"}
    deliver(model, kind="response", id=second_request["id"], result={"ok": True})
    third_request = sent[-1]
    assert third_request["command"] == "orbitals.list"
    deliver(model, kind="response", id=third_request["id"], result={"ok": True})
    assert [request["id"] for request in sent if request["kind"] == "request"] == [
        startup[0]["id"], startup[0]["id"], second_request["id"], third_request["id"],
    ]
    assert first.done() and second.done() and third.done()


def test_incompatible_ready_fails_pending_and_future_requests(viewer):
    model, sent = viewer
    pending = model.run("app.info")
    queued = model.run("edit.getSelection")
    from_callback = []
    pending.add_done_callback(lambda _: from_callback.append(model.orbitals()))
    deliver(model, kind="ready", info={"appVersion": "other", "commandVersion": 2})
    assert model.ready is False
    assert model.app_info["commandVersion"] == 2
    assert model.last_error["code"] == "incompatible"
    nested, = from_callback
    for future in (pending, queued, nested, model.run("edit.getSelection")):
        assert future.done()
        with pytest.raises(CommandError) as error:
            future.result()
        assert error.value.code == "incompatible"
    assert len(sent) == 1
    deliver(model, kind="ready", info={"appVersion": "current", "commandVersion": 1})
    assert model.ready is True
    assert model.last_error is None


def test_sequential_commands_capability():
    assert Viewer.sequential_commands is True


@pytest.mark.parametrize(("method", "args", "kwargs", "command", "expected"), [
    ("orbitals", (), {}, "orbitals.list", {}),
    ("show_orbitals", ((10, 11),), {}, "orbitals.show", {"indices": [10, 11], "exclusive": True}),
    ("hide_orbitals", (), {}, "orbitals.hide", {}),
    ("hide_orbitals", ((11,),), {}, "orbitals.hide", {"indices": [11]}),
    ("configure_orbitals", (), {"indices": (10,), "iso": 0.04, "opacity": 0},
     "orbitals.configure", {"indices": [10], "iso": 0.04, "opacity": 0}),
    ("set_view", (), {}, "view.set", {"fit": True}),
    ("set_view", (), {"axis": "+x", "fit": False, "projection": "orthographic"}, "view.set",
     {"axis": "+x", "fit": False, "projection": "orthographic"}),
    ("set_atom_vectors", ("forces", np.array([[0, 1, 0]]), "#AA0099"),
     {"max_length": 1, "atomic_numbers": np.array([6])}, "vectors.setAtoms",
     {"name": "forces", "values": [[0, 1, 0]], "color": "#AA0099", "maxLength": 1, "atomicNumbers": [6]}),
    ("set_atom_vectors", ("forces", [(0, 1, 0)], "#AA0099"), {"scale": 2}, "vectors.setAtoms",
     {"name": "forces", "values": [[0, 1, 0]], "color": "#AA0099", "scale": 2}),
    ("set_arrow", ("dipole", (0, 0, 1), "#AA0099"), {"length": 1}, "vectors.setArrow",
     {"name": "dipole", "vector": [0, 0, 1], "color": "#AA0099", "length": 1, "heads": "tip"}),
    ("set_arrow", ("dipole", (0, 0, 1), "#AA0099"), {"scale": 2, "origin": (0, 0, 0), "heads": "both"},
     "vectors.setArrow",
     {"name": "dipole", "vector": [0, 0, 1], "color": "#AA0099", "scale": 2,
      "heads": "both", "anchor": "point", "origin": [0, 0, 0]}),
    ("remove_vectors", ("forces",), {}, "vectors.remove", {"name": "forces"}),
    ("clear_vectors", (), {}, "vectors.clear", {}),
])
def test_scientific_widget_requests_are_asynchronous(viewer, method, args, kwargs, command, expected):
    model, sent = viewer
    future = getattr(model, method)(*args, **kwargs)
    assert isinstance(future, CommandFuture)
    assert not future.done()
    assert len(sent) == 1
    assert sent[0] == {"kind": "request", "id": sent[0]["id"], "command": command, "params": expected}
    deliver(model, kind="response", id=sent[0]["id"], result={"ok": True, "value": {"name": method}})
    assert future.result() == {"name": method}


def test_snapshot_returns_an_image_and_preserves_release_errors(viewer):
    model, sent = viewer
    future = model.snapshot(width=64, height=48)
    assert isinstance(future, CommandFuture)
    assert not future.done()
    assert sent[-1]["command"] == "view.snapshot"
    assert sent[-1]["params"] == {"width": 64, "height": 48}
    payload = {"mime": "image/png", "width": 64, "height": 48, "dataBase64": "iVBORw0KGgo="}
    deliver(model, kind="response", id=sent[-1]["id"], result={"ok": True, "value": payload})
    image = future.result()
    assert isinstance(image, Image)
    assert image.data == b"\x89PNG\r\n\x1a\n"

    future = model.snapshot()
    assert sent[-1]["params"] == {}
    error = {"code": "failed", "message": "The PNG exceeds the 40 MB response limit."}
    deliver(model, kind="response", id=sent[-1]["id"], result={"ok": False, "error": error})
    with pytest.raises(CommandError) as raised:
        future.result()
    assert raised.value.code == error["code"]
    assert str(raised.value) == error["message"]
