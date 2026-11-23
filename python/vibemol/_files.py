"""File normalization shared by the HTML embed and notebook widget."""

from __future__ import annotations

import pathlib
from typing import Any


def _coerce_embed_file_entry(entry: Any, *, encoding: str) -> dict[str, Any]:
    if isinstance(entry, (str, pathlib.Path)):
        p = pathlib.Path(entry).expanduser().resolve()
        if not p.is_file():
            raise FileNotFoundError(f"Embed file does not exist: {p}")
        return {"name": p.name, "mimeType": "text/plain", "text": p.read_text(encoding=encoding)}

    if isinstance(entry, dict):
        payload = dict(entry)
        if "path" in payload and ("text" not in payload and "base64" not in payload):
            p = pathlib.Path(payload["path"]).expanduser().resolve()
            if not p.is_file():
                raise FileNotFoundError(f"Embed file does not exist: {p}")
            payload.setdefault("name", p.name)
            payload.setdefault("mimeType", "text/plain")
            payload["text"] = p.read_text(encoding=encoding)

        name = str(payload.get("name", "")).strip()
        if not name:
            raise ValueError("Embed file dict must include non-empty 'name' (or provide 'path').")

        has_text = "text" in payload
        has_base64 = "base64" in payload
        if not has_text and not has_base64:
            raise ValueError(f"Embed file '{name}' must include 'text' or 'base64'.")

        out = {"name": name, "mimeType": str(payload.get("mimeType", "text/plain"))}
        if has_text:
            text_value = payload["text"]
            if isinstance(text_value, (bytes, bytearray)):
                out["text"] = bytes(text_value).decode(encoding, errors="replace")
            else:
                out["text"] = str(text_value if text_value is not None else "")
        else:
            out["base64"] = str(payload["base64"])
        return out

    if isinstance(entry, (tuple, list)) and len(entry) == 2:
        name, text = entry
        if isinstance(text, (bytes, bytearray)):
            text_value = bytes(text).decode(encoding, errors="replace")
        else:
            text_value = str(text if text is not None else "")
        return {
            "name": str(name),
            "mimeType": "text/plain",
            "text": text_value,
        }

    raise TypeError(
        "Unsupported embed file entry. Use path-like, dict({name,text|base64|path}), "
        "or (name, text) tuple."
    )


def normalize_embed_files(files: Any, *, encoding: str) -> list[dict[str, Any]]:
    if files is None:
        raise ValueError("files cannot be None")

    if isinstance(files, (str, pathlib.Path, dict)):
        raw_items = [files]
    elif isinstance(files, (list, tuple)):
        # Keep `(name, text)` shorthand as a single file record.
        if len(files) == 2 and isinstance(files[0], str) and isinstance(files[1], (str, bytes)):
            raw_items = [files]
        else:
            raw_items = list(files)
    else:
        raw_items = [files]

    result = [_coerce_embed_file_entry(item, encoding=encoding) for item in raw_items]
    if len(result) == 0:
        raise ValueError("At least one file must be provided.")
    return result
