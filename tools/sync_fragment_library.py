#!/usr/bin/env python3
"""Validate and normalize the VibeMol fragment/molecule catalog manifest.

Default manifest path:
  assets/fragments/library.json

This tool accepts both legacy manifests with top-level `fragments` and the new
explicit catalog shape with top-level `entries`. It always writes the new shape.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple


ELEMENT_SYMBOLS = [
    "", "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca",
    "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr",
    "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd",
    "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg",
    "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm",
    "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds", "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og",
]
SYMBOL_TO_Z = {sym.upper(): z for z, sym in enumerate(ELEMENT_SYMBOLS) if z > 0}

CATALOG_KIND_FRAGMENT = "fragment"
CATALOG_KIND_MOLECULE = "molecule"
FRAGMENT_ATTACH_MODES = {"append", "replace_h", "fuse_ring"}

KNOWN_ENTRY_KEYS = {
    "kind",
    "id",
    "name",
    "formula",
    "tags",
    "xyz",
    "bonds",
    "connectionAtomIndex",
    "preferredBondOrder",
    "linkBondDirection",
    "attachModes",
    "fuseBondLocalPair",
}


class SyncError(RuntimeError):
    pass


def atom_token_to_symbol(token: str) -> str:
    raw = str(token or "").strip()
    if not raw:
      raise SyncError("empty atom token")
    if raw.lstrip("+-").isdigit():
        z = int(raw)
        if z <= 0 or z >= len(ELEMENT_SYMBOLS):
            raise SyncError(f"unsupported atomic number token '{raw}'")
        return ELEMENT_SYMBOLS[z]
    cleaned = "".join(ch for ch in raw if ch.isalpha())
    if not cleaned:
        raise SyncError(f"invalid atom token '{raw}'")
    symbol = cleaned[:1].upper() + cleaned[1:].lower()
    if symbol.upper() not in SYMBOL_TO_Z:
        raise SyncError(f"unknown element symbol '{raw}'")
    return symbol


def parse_xyz_symbols(path: Path) -> List[str]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError as exc:
        raise SyncError(f"XYZ file not found: {path}") from exc
    except Exception as exc:
        raise SyncError(f"cannot read XYZ file: {path} ({exc})") from exc

    if len(lines) < 2:
        raise SyncError(f"XYZ file too short: {path}")

    try:
        natoms = int(lines[0].strip())
    except Exception as exc:
        raise SyncError(f"invalid XYZ atom count line in {path}") from exc

    if natoms <= 0:
        raise SyncError(f"XYZ atom count must be > 0 in {path}")

    symbols: List[str] = []
    body = lines[2:]
    cursor = 0
    while cursor < len(body) and len(symbols) < natoms:
        row = body[cursor].strip()
        cursor += 1
        if not row:
            continue
        parts = row.split()
        if len(parts) < 4:
            raise SyncError(f"malformed XYZ row {len(symbols)+1} in {path}")
        symbol = atom_token_to_symbol(parts[0])
        for idx in (1, 2, 3):
            try:
                float(parts[idx])
            except Exception as exc:
                raise SyncError(f"invalid coordinate in XYZ row {len(symbols)+1} ({path})") from exc
        symbols.append(symbol)

    if len(symbols) != natoms:
        raise SyncError(f"XYZ atom count mismatch in {path}: expected {natoms}, parsed {len(symbols)}")

    return symbols


def infer_formula(symbols: Sequence[str]) -> str:
    counts: Dict[str, int] = {}
    for symbol in symbols:
        counts[symbol] = counts.get(symbol, 0) + 1

    def fmt(symbol: str) -> str:
        count = counts[symbol]
        return f"{symbol}{count if count > 1 else ''}"

    parts: List[str] = []
    if "C" in counts:
        parts.append(fmt("C"))
        if "H" in counts:
            parts.append(fmt("H"))
    for symbol in sorted(counts.keys()):
        if symbol in {"C", "H"}:
            continue
        parts.append(fmt(symbol))
    if "C" not in counts and "H" in counts:
        parts.insert(0, fmt("H"))
    return "".join(parts)


def normalize_rel_path(path_text: str) -> str:
    path = str(path_text or "").strip().replace("\\", "/")
    if not path:
        raise SyncError("missing xyz path")
    if path.startswith(("http://", "https://")):
        raise SyncError("xyz path must be local relative path, not URL")
    if path.startswith("./") or path.startswith("/"):
        return path
    return f"./{path}"


def normalize_kind(raw: object) -> str:
    return CATALOG_KIND_MOLECULE if str(raw or "").strip().lower() == CATALOG_KIND_MOLECULE else CATALOG_KIND_FRAGMENT


def normalize_tags(raw: object) -> List[str]:
    if not isinstance(raw, list):
        return []
    out: List[str] = []
    seen = set()
    for tag in raw:
        text = str(tag or "").strip().lower()
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


def normalize_link_direction(raw: object) -> List[float]:
    if not isinstance(raw, list) or len(raw) < 3:
        return [0.0, 0.0, 1.0]
    try:
        x = float(raw[0])
        y = float(raw[1])
        z = float(raw[2])
    except Exception:
        return [0.0, 0.0, 1.0]
    norm = math.sqrt(x * x + y * y + z * z)
    if norm < 1e-12:
        return [0.0, 0.0, 1.0]
    return [x / norm, y / norm, z / norm]


def normalize_attach_modes(raw: object) -> List[str]:
    out: List[str] = []
    seen = set()
    values = raw if isinstance(raw, list) else []
    for item in values:
        mode = str(item or "").strip().lower()
        if mode not in FRAGMENT_ATTACH_MODES or mode in seen:
            continue
        seen.add(mode)
        out.append(mode)
    if not out:
        out = ["append", "replace_h"]
    return out


def normalize_fuse_bond_local_pair(raw: object, natoms: int, entry_id: str) -> List[int] | None:
    if raw is None:
        return None
    if not isinstance(raw, list) or len(raw) < 2:
        raise SyncError(f"entry '{entry_id}': fuseBondLocalPair must be a 2-item list")
    try:
        a = int(raw[0])
        b = int(raw[1])
    except Exception as exc:
        raise SyncError(f"entry '{entry_id}': fuseBondLocalPair contains non-integer indices") from exc
    if a == b or a < 0 or b < 0 or a >= natoms or b >= natoms:
        raise SyncError(f"entry '{entry_id}': fuseBondLocalPair indices out of range")
    return [a, b]


def normalize_bonds(raw: object, natoms: int, entry_id: str) -> List[dict]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise SyncError(f"entry '{entry_id}': bonds must be a list")

    seen = set()
    out: List[dict] = []
    for idx, bond in enumerate(raw):
        if not isinstance(bond, dict):
            raise SyncError(f"entry '{entry_id}': bond #{idx+1} must be an object")
        try:
            i = int(bond.get("i"))
            j = int(bond.get("j"))
        except Exception as exc:
            raise SyncError(f"entry '{entry_id}': bond #{idx+1} has invalid indices") from exc
        try:
            order = int(round(float(bond.get("order", 1))))
        except Exception:
            order = 1
        order = max(1, min(4, order))
        if i == j:
            raise SyncError(f"entry '{entry_id}': bond #{idx+1} connects atom to itself")
        if i < 0 or j < 0 or i >= natoms or j >= natoms:
            raise SyncError(f"entry '{entry_id}': bond #{idx+1} index out of range (natoms={natoms})")
        a, b = (i, j) if i < j else (j, i)
        key = (a, b, order)
        if key in seen:
            continue
        seen.add(key)
        out.append({"i": a, "j": b, "order": order})
    out.sort(key=lambda item: (item["i"], item["j"], item["order"]))
    return out


def normalize_entry(entry: dict, manifest_dir: Path, refresh_formula: bool) -> Tuple[dict, List[str]]:
    notes: List[str] = []
    if not isinstance(entry, dict):
        raise SyncError("catalog entry must be an object")

    entry_id = str(entry.get("id", "")).strip().lower()
    if not entry_id:
        raise SyncError("catalog entry is missing 'id'")

    name = str(entry.get("name", "")).strip() or entry_id.replace("_", " ").replace("-", " ").title()
    xyz_rel = normalize_rel_path(str(entry.get("xyz", "")).strip())
    xyz_abs = (manifest_dir / Path(xyz_rel)).resolve() if not Path(xyz_rel).is_absolute() else Path(xyz_rel)
    symbols = parse_xyz_symbols(xyz_abs)
    natoms = len(symbols)
    kind = normalize_kind(entry.get("kind"))
    tags = normalize_tags(entry.get("tags", []))
    bonds = normalize_bonds(entry.get("bonds", []), natoms, entry_id)
    formula_existing = str(entry.get("formula", "")).strip()
    formula = infer_formula(symbols) if refresh_formula or not formula_existing else formula_existing

    normalized = {
        "kind": kind,
        "id": entry_id,
        "name": name,
        "formula": formula,
        "tags": tags,
        "xyz": xyz_rel,
        "bonds": bonds,
    }

    if kind == CATALOG_KIND_FRAGMENT:
        conn_idx_raw = entry.get("connectionAtomIndex", 0)
        try:
            conn_idx = int(conn_idx_raw)
        except Exception:
            conn_idx = 0
            notes.append(f"entry '{entry_id}': connectionAtomIndex reset to 0")
        if conn_idx < 0 or conn_idx >= natoms:
            notes.append(f"entry '{entry_id}': connectionAtomIndex {conn_idx} out of range -> 0")
            conn_idx = 0

        pbo_raw = entry.get("preferredBondOrder", 1)
        try:
            pbo = int(round(float(pbo_raw)))
        except Exception:
            pbo = 1
        pbo = max(1, min(4, pbo))

        attach_modes = normalize_attach_modes(entry.get("attachModes", []))
        fuse_pair = normalize_fuse_bond_local_pair(entry.get("fuseBondLocalPair"), natoms, entry_id)
        if "fuse_ring" in attach_modes and fuse_pair is None:
            notes.append(f"entry '{entry_id}': fuse_ring listed but fuseBondLocalPair missing")
        normalized.update({
            "connectionAtomIndex": conn_idx,
            "preferredBondOrder": pbo,
            "linkBondDirection": normalize_link_direction(entry.get("linkBondDirection", [0, 0, 1])),
            "attachModes": attach_modes,
        })
        if fuse_pair is not None:
            normalized["fuseBondLocalPair"] = fuse_pair

    for key, value in entry.items():
        if key not in KNOWN_ENTRY_KEYS:
            normalized[key] = value

    return normalized, notes


def canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def run(manifest_path: Path, write: bool, check: bool, refresh_formula: bool) -> int:
    if not manifest_path.exists():
        print(f"error: manifest not found: {manifest_path}", file=sys.stderr)
        return 1
    try:
        original_text = manifest_path.read_text(encoding="utf-8")
    except Exception as exc:
        print(f"error: cannot read manifest: {exc}", file=sys.stderr)
        return 1
    try:
        payload = json.loads(original_text)
    except Exception as exc:
        print(f"error: invalid JSON in {manifest_path}: {exc}", file=sys.stderr)
        return 1
    if not isinstance(payload, dict):
        print("error: manifest top-level must be an object", file=sys.stderr)
        return 1

    raw_entries = payload.get("entries")
    if raw_entries is None:
        raw_entries = payload.get("fragments", [])
    if not isinstance(raw_entries, list):
        print("error: manifest field 'entries' must be a list", file=sys.stderr)
        return 1

    normalized_entries: List[dict] = []
    notes_all: List[str] = []
    ids_seen = set()
    duplicates = set()
    manifest_dir = manifest_path.parent.resolve()

    for idx, entry in enumerate(raw_entries):
        try:
            normalized, notes = normalize_entry(entry, manifest_dir, refresh_formula)
        except SyncError as exc:
            print(f"error: entry #{idx+1}: {exc}", file=sys.stderr)
            return 1
        entry_id = normalized["id"]
        if entry_id in ids_seen:
            duplicates.add(entry_id)
        ids_seen.add(entry_id)
        normalized_entries.append(normalized)
        notes_all.extend(notes)

    if duplicates:
        print(f"error: duplicate entry id(s): {', '.join(sorted(duplicates))}", file=sys.stderr)
        return 1

    normalized_entries.sort(key=lambda item: (item.get("kind", "fragment"), item["id"]))

    normalized_payload = {
        "kind": str(payload.get("kind", "vibemol.fragment-library")),
        "version": int(payload.get("version", 1)) if str(payload.get("version", 1)).isdigit() else 1,
        "entries": normalized_entries,
    }
    if "generatedAt" in payload:
        normalized_payload["generatedAt"] = payload.get("generatedAt")
    for key, value in payload.items():
        if key not in {"kind", "version", "generatedAt", "entries", "fragments"}:
            normalized_payload[key] = value

    new_text = json.dumps(normalized_payload, indent=2, ensure_ascii=False) + "\n"
    changed = canonical_json(payload) != canonical_json(normalized_payload)

    print(f"manifest: {manifest_path}")
    print(f"entries: {len(normalized_entries)}")
    if notes_all:
        print(f"notes: {len(notes_all)}")
        for note in notes_all:
            print(f"  - {note}")
    print(f"status: {'would rewrite' if changed and not write else 'ok'}")

    if write:
        manifest_path.write_text(new_text, encoding="utf-8")
        print("status: written")
    if check and changed:
        return 1
    return 0


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate and normalize the VibeMol fragment/molecule catalog manifest")
    parser.add_argument("manifest", nargs="?", default="assets/fragments/library.json", help="Path to fragment library JSON")
    parser.add_argument("--write", action="store_true", help="Rewrite manifest with normalized content")
    parser.add_argument("--check", action="store_true", help="Exit non-zero if normalization changes are required")
    parser.add_argument("--refresh-formula", action="store_true", help="Recompute formulas from XYZ symbols")
    args = parser.parse_args(list(argv) if argv is not None else None)
    return run(Path(args.manifest), args.write, args.check, args.refresh_formula)


if __name__ == "__main__":
    raise SystemExit(main())
