import json
import re

import pytest

from api.vibemol_client import vibemol
from vibemol import CommandError, PendingResult, Viewer


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
    model.load(str(water), str(water), clearFirst=False)
    assert len(sent[-1]["params"]["files"]) == 2
    assert sent[-1]["params"]["options"] == {"clearFirst": False}
    with pytest.raises(ValueError):
        model.load()


def test_requests_resolve_by_id_and_notify_callbacks(viewer):
    model, sent = viewer
    first = model.run("app.info")
    second = model.run("edit.getSelection")
    first_id, second_id = [message["id"] for message in sent]
    assert first_id != second_id
    assert sent[0] == {"kind": "request", "id": first_id, "command": "app.info", "params": {}}
    assert not first.done()
    with pytest.raises(PendingResult, match="later cell"):
        first.result()
    observed = []
    second.add_done_callback(lambda future: observed.append((future, future.result())))
    deliver(model, kind="response", id=second_id, result={"ok": True, "value": {"indices": [2]}})
    assert observed == [(second, {"indices": [2]})]
    assert second.done()
    second.add_done_callback(lambda future: observed.append("late"))
    assert observed[-1] == "late"
    assert not first.done()
    failure = {"code": "rejected", "message": "No active system", "details": {"code": "NO_SYSTEM"}}
    deliver(model, kind="response", id=first_id, result={"ok": False, "error": failure})
    with pytest.raises(CommandError) as error:
        first.result()
    assert (error.value.code, error.value.message, error.value.details) == tuple(failure.values())
    deliver(model, kind="response", id=first_id, result={"ok": True, "value": 42})
    with pytest.raises(CommandError):
        first.result()


def test_startup_requests_are_replayed_in_order_after_frontend_attachment(viewer):
    model, sent = viewer
    first = model.run("app.info")
    second = model.run("edit.getSelection")
    startup = sent.copy()
    deliver(model, kind="frontend-attached")
    assert sent == startup + [{"kind": "frontend-sync"}] + startup
    deliver(model, kind="frontend-attached")
    assert sent[-1] == {"kind": "frontend-sync"}
    assert not first.done() and not second.done()


def test_incompatible_ready_fails_pending_and_future_requests(viewer):
    model, sent = viewer
    pending = model.run("app.info")
    deliver(model, kind="ready", info={"appVersion": "other", "commandVersion": 2})
    assert model.ready is False
    assert model.app_info["commandVersion"] == 2
    assert model.last_error["code"] == "incompatible"
    for future in (pending, model.run("edit.getSelection")):
        assert future.done()
        with pytest.raises(CommandError) as error:
            future.result()
        assert error.value.code == "incompatible"
    assert len(sent) == 1
    deliver(model, kind="ready", info={"appVersion": "current", "commandVersion": 1})
    assert model.ready is True
    assert model.last_error is None
