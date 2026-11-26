"""An asynchronous notebook view of the VibeMol command registry."""

from __future__ import annotations

from base64 import b64decode
from collections import deque
import logging
from itertools import count
from pathlib import Path
import secrets
from typing import Callable
from urllib.parse import urlsplit

import anywidget
import traitlets

from ._files import normalize_embed_files


class PendingResult(RuntimeError):
    """The matching command response has yet to arrive."""


class CommandError(RuntimeError):
    """A command or the widget transport reported an error."""

    def __init__(self, code: str, message: str, details=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details


class CommandFuture:
    """A response handle for a later cell. This class provides no blocking wait."""

    def __init__(self, decode=None):
        self._decode = decode
        self._response = None
        self._callbacks: list[Callable[[CommandFuture], None]] = []

    def done(self) -> bool:
        return self._response is not None

    def result(self):
        """Read the response in a later cell or a done callback."""
        if not self.done():
            raise PendingResult("The viewer is still processing the command. Read the result in a later cell.")
        if self._response["ok"]:
            value = self._response.get("value")
            return self._decode(value) if self._decode else value
        error = self._response["error"]
        raise CommandError(error["code"], error["message"], error.get("details"))

    def add_done_callback(self, fn: Callable[[CommandFuture], None]) -> None:
        if self.done():
            self._notify(fn)
        else:
            self._callbacks.append(fn)

    def _notify(self, fn):
        try:
            fn(self)
        except Exception:
            logging.getLogger(__name__).exception("VibeMol command callback failed")

    def _complete(self, response):
        self._response = response
        callbacks, self._callbacks = self._callbacks, []
        for callback in callbacks:
            self._notify(callback)


def _viewer_url(url, source, local_port):
    if url is None:
        if source == "web":
            url = "https://vibemol.org/"
        elif source == "local":
            port = int(local_port)
            if not 1 <= port <= 65535:
                raise ValueError("local_port must be between 1 and 65535")
            url = f"http://localhost:{port}/"
        else:
            raise ValueError("source must be 'web' or 'local'")
    if not isinstance(url, str):
        raise ValueError("VibeMol requires an absolute http(s) URL")
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("VibeMol requires an absolute http(s) URL")
    # Accessing port also checks the port syntax and range.
    if parsed.port == 0:
        raise ValueError("VibeMol requires a nonzero URL port")
    return url


def _valid_response(result):
    if not isinstance(result, dict):
        return False
    if result.get("ok") is True:
        return True
    error = result.get("error")
    return (result.get("ok") is False and isinstance(error, dict)
            and isinstance(error.get("code"), str) and isinstance(error.get("message"), str))


def _provided(params):
    return {key: value for key, value in params.items() if value is not None}


def _png_image(value):
    from IPython.display import Image

    try:
        if value["mime"] != "image/png":
            raise ValueError("snapshot MIME type")
        data = b64decode(value["dataBase64"], validate=True)
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("snapshot PNG signature")
    except (KeyError, TypeError, ValueError) as exc:
        raise CommandError("invalid-result", "Malformed PNG snapshot response") from exc
    return Image(data=data, format="png")


class Viewer(anywidget.AnyWidget):
    """Display a VibeMol workspace and mirror its selection into the kernel.

    Commands and state arrive asynchronously. The kernel processes comm replies
    after the current cell finishes, so read a command result in the next cell
    or register a done callback.
    """

    _esm = Path(__file__).parent / "static" / "widget.js"
    sequential_commands = True

    url = traitlets.Unicode("https://vibemol.org/").tag(sync=True)
    height = traitlets.Int(640, min=1).tag(sync=True)
    token = traitlets.Unicode().tag(sync=True)
    ready = traitlets.Bool(False).tag(sync=True)
    app_info = traitlets.Dict().tag(sync=True)
    selection = traitlets.Dict(default_value=None, allow_none=True).tag(sync=True)
    calculations = traitlets.Dict(default_value=None, allow_none=True).tag(sync=True)
    last_error = traitlets.Dict(default_value=None, allow_none=True).tag(sync=True)

    def __init__(self, *, url=None, source="web", local_port=8000, height=640):
        self._next_request = count(1)
        self._queue: deque[tuple[dict, CommandFuture]] = deque()
        self._in_flight: tuple[dict, CommandFuture] | None = None
        self._dispatching = False
        self._frontend_attached = False
        super().__init__(url=_viewer_url(url, source, local_port), height=height, token=secrets.token_urlsafe(32))
        self.on_msg(self._handle_viewer_message)

    def run(self, command: str, **params) -> CommandFuture:
        """Queue a command and return a handle for a later cell."""
        return self._run(command, params)

    def _run(self, command, params, *, decode=None):
        if not isinstance(command, str):
            raise TypeError("command must be a string")
        future = CommandFuture(decode)
        if self.last_error and self.last_error.get("code") == "incompatible":
            future._complete({"ok": False, "error": self.last_error})
            return future
        id_ = str(next(self._next_request))
        request = {"kind": "request", "id": id_, "command": command, "params": params}
        self._queue.append((request, future))
        self._dispatch_next()
        return future

    def load(self, *files, clear_first=True, **options) -> CommandFuture:
        """Load paths, file dictionaries, or (name, text) pairs in one command."""
        if not files:
            raise ValueError("At least one file must be provided.")
        records = [record for spec in files for record in normalize_embed_files(spec, encoding="utf-8")]
        options.setdefault("clearFirst", bool(clear_first))
        return self.run("files.load", files=records, options=options)

    def set_mode(self, mode: str) -> CommandFuture:
        """Resolve when the requested mode is applied.

        View, Measure, Edit and Calculations preserve the camera pose unless
        Edit reveals a hidden target.
        """
        return self.run("view.setMode", mode=mode)

    def orbitals(self) -> CommandFuture:
        """List orbitals for the active Molden source."""
        return self.run("orbitals.list")

    def show_orbitals(self, indices, exclusive: bool = True) -> CommandFuture:
        """Present Molden orbitals by one-based index in the current mode."""
        return self.run("orbitals.show", indices=list(indices), exclusive=exclusive)

    def hide_orbitals(self, indices=None) -> CommandFuture:
        """Hide selected one-based indices, or all orbitals when omitted."""
        return self.run("orbitals.hide", **({} if indices is None else {"indices": list(indices)}))

    def configure_orbitals(self, indices=None, iso=None, opacity=None) -> CommandFuture:
        """Configure selected orbitals, defaulting to the currently visible set."""
        params = {"indices": None if indices is None else list(indices), "iso": iso, "opacity": opacity}
        return self.run("orbitals.configure", **_provided(params))

    def set_view(self, axis=None, fit=True, projection=None) -> CommandFuture:
        """Set camera orientation, framing, and projection."""
        return self.run("view.set", **_provided({"axis": axis, "fit": fit, "projection": projection}))

    def snapshot(self, width=None, height=None) -> CommandFuture:
        """Return a future whose result is an IPython PNG image."""
        return self._run("view.snapshot", _provided({"width": width, "height": height}), decode=_png_image)

    def set_atom_vectors(self, name, values, color, scale=None, max_length=None, atomic_numbers=None) -> CommandFuture:
        """Set one vector per atom. Pass array data in the current atom order."""
        values = values.tolist() if hasattr(values, "tolist") else [list(row) for row in values]
        if atomic_numbers is not None:
            atomic_numbers = atomic_numbers.tolist() if hasattr(atomic_numbers, "tolist") else list(atomic_numbers)
        params = {"scale": scale, "maxLength": max_length, "atomicNumbers": atomic_numbers}
        return self.run("vectors.setAtoms", name=name, values=values, color=color, **_provided(params))

    def set_arrow(self, name, vector, color, scale=None, length=None, origin=None, heads="tip") -> CommandFuture:
        """Set a center-of-mass arrow, or anchor it at an explicit world point."""
        params = {"scale": scale, "length": length, "heads": heads}
        if origin is not None:
            params.update(anchor="point", origin=list(origin))
        return self.run("vectors.setArrow", name=name, vector=list(vector), color=color, **_provided(params))

    def remove_vectors(self, name) -> CommandFuture:
        """Remove one atom vector set or free arrow."""
        return self.run("vectors.remove", name=name)

    def clear_vectors(self) -> CommandFuture:
        """Remove all vector sets and free arrows from the active structure."""
        return self.run("vectors.clear")

    def _dispatch_next(self):
        if self._dispatching:
            return
        self._dispatching = True
        try:
            # A synchronous send error frees the slot. Drain those failures
            # in this loop so a long queue does not recurse through _finish.
            while self._in_flight is None and self._queue:
                self._in_flight = self._queue.popleft()
                request, _ = self._in_flight
                self._send_request(request)
        finally:
            self._dispatching = False

    def _send_request(self, request):
        try:
            self.send(request)
        except (TypeError, ValueError) as exc:
            self._finish(request["id"], {"ok": False, "error": {"code": "failed", "message": str(exc)}})

    def _finish(self, id_, result):
        if self._in_flight is None:
            return
        request, future = self._in_flight
        if request["id"] != id_:
            return
        self._in_flight = None
        future._complete(result)
        self._dispatch_next()

    def _handle_viewer_message(self, _widget, message, _buffers):
        if not isinstance(message, dict):
            return
        kind = message.get("kind")
        if kind == "frontend-attached":
            # A request from the creation cell can arrive before the ESM is
            # listening. Replay only the in-flight request on first attach.
            replay = self._in_flight if not self._frontend_attached else None
            self._frontend_attached = True
            self.send({"kind": "frontend-sync"})
            if replay is not None and self._in_flight is replay:
                self._send_request(replay[0])
        elif kind == "ready":
            info = message.get("info", {})
            if not isinstance(info, dict):
                info = {}
            self.app_info = info
            version = info.get("commandVersion")
            self.ready = type(version) is int and version == 1
            if self.ready:
                self.last_error = None
            else:
                error = {"code": "incompatible", "message": "The viewer does not support command registry version 1",
                         "details": {"commandVersion": version}}
                self.last_error = error
                pending, self._queue = self._queue, deque()
                if self._in_flight is not None:
                    pending.appendleft(self._in_flight)
                    self._in_flight = None
                for _, future in pending:
                    future._complete({"ok": False, "error": error})
        elif kind == "response" and isinstance(message.get("id"), str):
            result = message.get("result")
            if not _valid_response(result):
                result = {"ok": False, "error": {"code": "invalid-result", "message": "Malformed command response"}}
            self._finish(message["id"], result)
