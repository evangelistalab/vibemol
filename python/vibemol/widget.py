"""An asynchronous notebook view of the VibeMol command registry."""

from __future__ import annotations

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

    def __init__(self):
        self._response = None
        self._callbacks: list[Callable[[CommandFuture], None]] = []

    def done(self) -> bool:
        return self._response is not None

    def result(self):
        """Read the response in a later cell or a done callback."""
        if not self.done():
            raise PendingResult("The viewer is still processing the command. Read the result in a later cell.")
        if self._response["ok"]:
            return self._response.get("value")
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


class Viewer(anywidget.AnyWidget):
    """Display a VibeMol workspace and mirror its selection into the kernel.

    Commands and state arrive asynchronously. The kernel processes comm replies
    after the current cell finishes, so read a command result in the next cell
    or register a done callback.
    """

    _esm = Path(__file__).parent / "static" / "widget.js"

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
        self._pending: dict[str, CommandFuture] = {}
        self._startup_requests = {}
        super().__init__(url=_viewer_url(url, source, local_port), height=height, token=secrets.token_urlsafe(32))
        self.on_msg(self._handle_viewer_message)

    def run(self, command: str, **params) -> CommandFuture:
        """Send a command now and return a handle for a later cell."""
        if not isinstance(command, str):
            raise TypeError("command must be a string")
        future = CommandFuture()
        if self.last_error and self.last_error.get("code") == "incompatible":
            future._complete({"ok": False, "error": self.last_error})
            return future
        id_ = str(next(self._next_request))
        request = {"kind": "request", "id": id_, "command": command, "params": params}
        self._pending[id_] = future
        if self._startup_requests is not None:
            self._startup_requests[id_] = request
        self._send_request(request)
        return future

    def load(self, *files, clear_first=True, **options) -> CommandFuture:
        """Load paths, file dictionaries, or (name, text) pairs in one command."""
        if not files:
            raise ValueError("At least one file must be provided.")
        records = [record for spec in files for record in normalize_embed_files(spec, encoding="utf-8")]
        options.setdefault("clearFirst", bool(clear_first))
        return self.run("files.load", files=records, options=options)

    def _send_request(self, request):
        try:
            self.send(request)
        except (TypeError, ValueError) as exc:
            self._finish(request["id"], {"ok": False, "error": {"code": "failed", "message": str(exc)}})

    def _finish(self, id_, result):
        future = self._pending.pop(id_, None)
        if self._startup_requests is not None:
            self._startup_requests.pop(id_, None)
        if future is not None:
            future._complete(result)

    def _handle_viewer_message(self, _widget, message, _buffers):
        if not isinstance(message, dict):
            return
        kind = message.get("kind")
        if kind == "frontend-attached":
            # A request from the creation cell can arrive before the ESM is
            # listening. Replay just that initial window with the same IDs.
            startup, self._startup_requests = self._startup_requests, None
            self.send({"kind": "frontend-sync"})
            for request in (startup or {}).values():
                self._send_request(request)
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
                for id_ in list(self._pending):
                    self._finish(id_, {"ok": False, "error": error})
        elif kind == "response" and isinstance(message.get("id"), str):
            result = message.get("result")
            if not _valid_response(result):
                result = {"ok": False, "error": {"code": "invalid-result", "message": "Malformed command response"}}
            self._finish(message["id"], result)
