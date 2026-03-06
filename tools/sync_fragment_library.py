#!/usr/bin/env python3
"""Validate and normalize VibeMol fragment library manifests.

Default manifest path:
  assets/fragments/library.json

This tool checks each fragment against its referenced XYZ file and can rewrite
`library.json` into a normalized format suitable for low-conflict diffs.

Examples:
  python tools/sync_fragment_library.py --check
  python tools/sync_fragment_library.py --write
  python tools/sync_fragment_library.py --write --refresh-formula
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

KNOWN_FRAGMENT_KEYS = {
    "id",
    "name",
    "formula",
    "tags",
    "xyz",
    "bonds",
    "connectionAtomIndex",
    "preferredBondOrder",
    "linkBondDirection",
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
    for s in symbols:
        counts[s] = counts.get(s, 0) + 1

    def fmt(sym: str) -> str:
        c = counts[sym]
        return f"{sym}{c if c > 1 else ''}"

    parts: List[str] = []
    if "C" in counts:
        parts.append(fmt("C"))
        if "H" in counts:
            parts.append(fmt("H"))
    for sym in sorted(counts.keys()):
        if sym in {"C", "H"}:
            continue
        parts.append(fmt(sym))
    if "C" not in counts and "H" in counts:
        parts.insert(0, fmt("H"))
    return "".join(parts)


def normalize_rel_path(path_text: str) -> str:
    p = str(path_text or "").strip().replace("\\", "/")
    if not p:
        raise SyncError("missing xyz path")
    if p.startswith("http://") or p.startswith("https://"):
        raise SyncError("xyz path must be local relative path, not URL")
    if p.startswith("./"):
        return p
    if p.startswith("/"):
        return p
    return f"./{p}"


def normalize_tags(raw: object) -> List[str]:
    if not isinstance(raw, list):
        return []
    out: List[str] = []
    seen = set()
    for tag in raw:
        t = str(tag or "").strip().lower()
        if not t or t in seen:
            continue
        seen.add(t)
        out.append(t)
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
    n = math.sqrt(x * x + y * y + z * z)
    if n < 1e-12:
        return [0.0, 0.0, 1.0]
    return [x / n, y / n, z / n]


def normalize_bonds(raw: object, natoms: int, frag_id: str) -> List[dict]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise SyncError(f"fragment '{frag_id}': bonds must be a list")

    seen = set()
    out: List[dict] = []
    for idx, b in enumerate(raw):
        if not isinstance(b, dict):
            raise SyncError(f"fragment '{frag_id}': bond #{idx+1} must be an object")
        try:
            i = int(b.get("i"))
            j = int(b.get("j"))
        except Exception as exc:
            raise SyncError(f"fragment '{frag_id}': bond #{idx+1} has invalid indices") from exc
        try:
            order = int(round(float(b.get("order", 1))))
        except Exception:
            order = 1
        order = max(1, min(3, order))

        if i == j:
            raise SyncError(f"fragment '{frag_id}': bond #{idx+1} connects atom to itself")
        if i < 0 or j < 0 or i >= natoms or j >= natoms:
            raise SyncError(f"fragment '{frag_id}': bond #{idx+1} index out of range (natoms={natoms})")

        a, c = (i, j) if i < j else (j, i)
        key = (a, c, order)
        if key in seen:
            continue
        seen.add(key)
        out.append({"i": a, "j": c, "order": order})

    out.sort(key=lambda b: (b["i"], b["j"], b["order"]))
    return out


def normalize_fragment(entry: dict, manifest_dir: Path, refresh_formula: bool) -> Tuple[dict, List[str]]:
    notes: List[str] = []

    if not isinstance(entry, dict):
        raise SyncError("fragment entry must be an object")

    frag_id = str(entry.get("id", "")).strip().lower()
    if not frag_id:
        raise SyncError("fragment is missing 'id'")

    name = str(entry.get("name", "")).strip() or frag_id.replace("_", " ").replace("-", " ").title()
    xyz_rel = normalize_rel_path(str(entry.get("xyz", "")).strip())

    xyz_path = Path(xyz_rel)
    xyz_abs = xyz_path if xyz_path.is_absolute() else (manifest_dir / xyz_path).resolve()
    symbols = parse_xyz_symbols(xyz_abs)
    natoms = len(symbols)

    conn_idx_raw = entry.get("connectionAtomIndex", 0)
    try:
        conn_idx = int(conn_idx_raw)
    except Exception:
        conn_idx = 0
        notes.append(f"fragment '{frag_id}': connectionAtomIndex reset to 0")
    if conn_idx < 0 or conn_idx >= natoms:
        notes.append(f"fragment '{frag_id}': connectionAtomIndex {conn_idx} out of range -> 0")
        conn_idx = 0

    pbo_raw = entry.get("preferredBondOrder", 1)
    try:
        pbo = int(round(float(pbo_raw)))
    except Exception:
        pbo = 1
    pbo = max(1, min(3, pbo))

    tags = normalize_tags(entry.get("tags", []))
    bonds = normalize_bonds(entry.get("bonds", []), natoms, frag_id)

    existing_formula = str(entry.get("formula", "")).strip()
    computed_formula = infer_formula(symbols)
    formula = computed_formula if refresh_formula or not existing_formula else existing_formula

    normalized = {
        "id": frag_id,
        "name": name,
        "formula": formula,
        "tags": tags,
        "xyz": xyz_rel,
        "bonds": bonds,
        "connectionAtomIndex": conn_idx,
        "preferredBondOrder": pbo,
        "linkBondDirection": normalize_link_direction(entry.get("linkBondDirection", [0, 0, 1])),
    }

    # Preserve unknown future fields for forward compatibility.
    for key, value in entry.items():
        if key not in KNOWN_FRAGMENT_KEYS:
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

    raw_fragments = payload.get("fragments", [])
    if not isinstance(raw_fragments, list):
        print("error: manifest field 'fragments' must be a list", file=sys.stderr)
        return 1

    normalized_frags: List[dict] = []
    all_notes: List[str] = []
    ids_seen = set()
    ids_dup = set()

    manifest_dir = manifest_path.parent.resolve()
    for idx, entry in enumerate(raw_fragments):
        try:
            normalized, notes = normalize_fragment(entry, manifest_dir, refresh_formula)
        except SyncError as exc:
            print(f"error: fragment #{idx+1}: {exc}", file=sys.stderr)
            return 1

        frag_id = normalized["id"]
        if frag_id in ids_seen:
            ids_dup.add(frag_id)
        ids_seen.add(frag_id)
        normalized_frags.append(normalized)
        all_notes.extend(notes)

    if ids_dup:
        print(f"error: duplicate fragment id(s): {', '.join(sorted(ids_dup))}", file=sys.stderr)
        return 1

    normalized_frags.sort(key=lambda f: f["id"])

    normalized_payload = {}
    normalized_payload["kind"] = str(payload.get("kind", "vibemol.fragment-library"))
    version = payload.get("version", 1)
    try:
        normalized_payload["version"] = int(version)
    except Exception:
        normalized_payload["version"] = 1
    if "generatedAt" in payload:
        normalized_payload["generatedAt"] = payload.get("generatedAt")
    normalized_payload["fragments"] = normalized_frags

    # Preserve unknown top-level keys after canonical keys.
    for key, value in payload.items():
        if key not in {"kind", "version", "generatedAt", "fragments"}:
            normalized_payload[key] = value

    new_text = json.dumps(normalized_payload, indent=2, ensure_ascii=False) + "\n"
    changed = canonical_json(payload) != canonical_json(normalized_payload)

    print(f"manifest: {manifest_path}")
    print(f"fragments: {len(normalized_frags)}")
    if all_notes:
        print(f"notes: {len(all_notes)}")
        for note in all_notes:
            print(f"  - {note}")

    if write:
        manifest_path.write_text(new_text, encoding="utf-8")
        print("status: written")
    else:
        print(f"status: {'would rewrite' if changed else 'ok'}")

    if check and changed:
        return 1

    return 0


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate and normalize VibeMol fragment library manifest")
    parser.add_argument(
        "manifest",
        nargs="?",
        default="assets/fragments/library.json",
        help="Path to fragment library JSON (default: assets/fragments/library.json)",
    )
    parser.add_argument("--write", action="store_true", help="Rewrite manifest with normalized content")
    parser.add_argument("--check", action="store_true", help="Exit non-zero if normalization changes are required")
    parser.add_argument(
        "--refresh-formula",
        action="store_true",
        help="Recompute formula from XYZ symbols for all entries",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    return run(Path(args.manifest), args.write, args.check, args.refresh_formula)


if __name__ == "__main__":
    raise SystemExit(main())
