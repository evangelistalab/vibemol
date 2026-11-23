from pathlib import Path
import re
from urllib.parse import urlsplit

from playwright.sync_api import expect

from helpers import read_app_version

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
