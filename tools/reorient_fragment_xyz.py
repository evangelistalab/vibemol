#!/usr/bin/env python3
"""Re-orient a fragment XYZ so linker atom is at origin and bond axis is +Z.

Assumptions:
- Atom 1 (index 0) is the linker atom.
- Atom 2 (index 1) is the atom bonded to the linker and defines link direction.

Usage examples:
  python tools/reorient_fragment_xyz.py assets/fragments/phenyl.xyz -o assets/fragments/phenyl.xyz
  python tools/reorient_fragment_xyz.py my_fragment.xyz > out.xyz
"""

from __future__ import annotations

import argparse
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Sequence, Tuple


Vec3 = Tuple[float, float, float]


@dataclass
class AtomRow:
    symbol: str
    x: float
    y: float
    z: float
    tail: str = ""


def v_add(a: Vec3, b: Vec3) -> Vec3:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def v_sub(a: Vec3, b: Vec3) -> Vec3:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def v_dot(a: Vec3, b: Vec3) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def v_cross(a: Vec3, b: Vec3) -> Vec3:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def v_norm(a: Vec3) -> float:
    return math.sqrt(v_dot(a, a))


def v_scale(a: Vec3, s: float) -> Vec3:
    return (a[0] * s, a[1] * s, a[2] * s)


def v_unit(a: Vec3) -> Vec3:
    n = v_norm(a)
    if n < 1e-14:
        raise ValueError("Cannot normalize near-zero vector")
    return v_scale(a, 1.0 / n)


def apply_rot(r: Sequence[Sequence[float]], v: Vec3) -> Vec3:
    return (
        r[0][0] * v[0] + r[0][1] * v[1] + r[0][2] * v[2],
        r[1][0] * v[0] + r[1][1] * v[1] + r[1][2] * v[2],
        r[2][0] * v[0] + r[2][1] * v[1] + r[2][2] * v[2],
    )


def rot_from_to(a: Vec3, b: Vec3) -> Tuple[Tuple[float, float, float], ...]:
    """Return rotation matrix R that maps unit(a) -> unit(b)."""
    ua = v_unit(a)
    ub = v_unit(b)
    dot = max(-1.0, min(1.0, v_dot(ua, ub)))

    if dot > 1.0 - 1e-12:
        return (
            (1.0, 0.0, 0.0),
            (0.0, 1.0, 0.0),
            (0.0, 0.0, 1.0),
        )

    if dot < -1.0 + 1e-12:
        # 180-degree rotation around axis orthogonal to ua.
        axis = v_cross(ua, (1.0, 0.0, 0.0))
        if v_norm(axis) < 1e-10:
            axis = v_cross(ua, (0.0, 1.0, 0.0))
        x, y, z = v_unit(axis)
        # R = -I + 2uu^T
        return (
            (-1.0 + 2.0 * x * x, 2.0 * x * y, 2.0 * x * z),
            (2.0 * y * x, -1.0 + 2.0 * y * y, 2.0 * y * z),
            (2.0 * z * x, 2.0 * z * y, -1.0 + 2.0 * z * z),
        )

    axis = v_unit(v_cross(ua, ub))
    x, y, z = axis
    angle = math.acos(dot)
    c = math.cos(angle)
    s = math.sin(angle)
    t = 1.0 - c

    return (
        (t * x * x + c, t * x * y - s * z, t * x * z + s * y),
        (t * x * y + s * z, t * y * y + c, t * y * z - s * x),
        (t * x * z - s * y, t * y * z + s * x, t * z * z + c),
    )


def parse_xyz(path: Path) -> Tuple[int, str, List[AtomRow], List[str]]:
    raw_lines = path.read_text(encoding="utf-8").splitlines()
    if len(raw_lines) < 2:
        raise ValueError("XYZ must contain at least 2 header lines")

    try:
        natoms = int(raw_lines[0].strip())
    except Exception as exc:
        raise ValueError("First XYZ line must be integer atom count") from exc

    if natoms < 2:
        raise ValueError("Need at least two atoms (linker and bonded atom)")

    comment = raw_lines[1]
    body = raw_lines[2:]
    if len(body) < natoms:
        raise ValueError(f"XYZ atom count mismatch: expected {natoms}, found {len(body)} atom lines")

    atoms: List[AtomRow] = []
    for i in range(natoms):
        line = body[i].strip()
        if not line:
            raise ValueError(f"Empty atom row at index {i + 1}")
        parts = line.split()
        if len(parts) < 4:
            raise ValueError(f"Malformed atom row {i + 1}: '{line}'")
        symbol = parts[0]
        try:
            x, y, z = float(parts[1]), float(parts[2]), float(parts[3])
        except Exception as exc:
            raise ValueError(f"Invalid coordinates in row {i + 1}: '{line}'") from exc
        tail = ""
        if len(parts) > 4:
            tail = " " + " ".join(parts[4:])
        atoms.append(AtomRow(symbol=symbol, x=x, y=y, z=z, tail=tail))

    extra = body[natoms:]
    return natoms, comment, atoms, extra


def reorient_atoms(atoms: Sequence[AtomRow]) -> List[AtomRow]:
    linker = (atoms[0].x, atoms[0].y, atoms[0].z)
    bonded = (atoms[1].x, atoms[1].y, atoms[1].z)
    axis = v_sub(bonded, linker)
    if v_norm(axis) < 1e-12:
        raise ValueError("Linker atom and bonded atom are coincident; cannot define axis")

    # Translate linker to origin, then rotate axis to +Z.
    shifted: List[Vec3] = [v_sub((a.x, a.y, a.z), linker) for a in atoms]
    rot = rot_from_to(axis, (0.0, 0.0, 1.0))

    out: List[AtomRow] = []
    for a, v in zip(atoms, shifted):
        xr, yr, zr = apply_rot(rot, v)
        out.append(AtomRow(symbol=a.symbol, x=xr, y=yr, z=zr, tail=a.tail))
    return out


def format_xyz(natoms: int, comment: str, atoms: Sequence[AtomRow], extra_lines: Sequence[str], precision: int) -> str:
    fmt = f"{{:.{precision}f}}"
    lines: List[str] = [str(natoms), comment]
    for a in atoms:
        lines.append(f"{a.symbol} {fmt.format(a.x)} {fmt.format(a.y)} {fmt.format(a.z)}{a.tail}")
    lines.extend(extra_lines)
    return "\n".join(lines) + "\n"


def main(argv: Sequence[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Reorient XYZ fragment: atom 1 -> origin, atom 2 -> +Z axis")
    p.add_argument("input_xyz", type=Path, help="Input XYZ file")
    p.add_argument("-o", "--output", type=Path, default=None, help="Output XYZ file (default: stdout)")
    p.add_argument("--inplace", action="store_true", help="Overwrite input file")
    p.add_argument("--precision", type=int, default=6, help="Decimal places for coordinates (default: 6)")
    args = p.parse_args(argv)

    if args.inplace and args.output is not None:
        p.error("Use either --inplace or --output, not both")

    try:
        natoms, comment, atoms, extra = parse_xyz(args.input_xyz)
        out_atoms = reorient_atoms(atoms)
        new_comment = comment
        if "reoriented linker->+Z" not in comment:
            suffix = " | reoriented linker->+Z"
            new_comment = (comment + suffix) if comment.strip() else "reoriented linker->+Z"
        text = format_xyz(natoms, new_comment, out_atoms, extra, max(0, args.precision))
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.inplace:
        args.input_xyz.write_text(text, encoding="utf-8")
    elif args.output is not None:
        args.output.write_text(text, encoding="utf-8")
    else:
        sys.stdout.write(text)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
