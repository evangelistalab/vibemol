# Fragment Library Workflow

This folder is the editable source for the VibeMol builder catalog.

## Files
- `library.json`: catalog manifest (entries + bonding + paths to XYZ files)
- `*.xyz`: per-entry geometry files

## Geometry Convention
For each fragment-like `*.xyz`:
- Atom **1** (index `0`) is the **linker atom**.
- Atom **2** (index `1`) defines the link direction and should lie on **+Z** after reorientation.

## Typical Edit Loop
1. Edit one entry XYZ (`assets/fragments/<id>.xyz`).
2. Re-orient it to VibeMol convention:
   ```bash
   python3 tools/reorient_fragment_xyz.py assets/fragments/<id>.xyz --inplace
   ```
3. Validate/sync the manifest:
   ```bash
   python3 tools/sync_fragment_library.py --check
   ```
4. If changes are needed, normalize and rewrite:
   ```bash
   python3 tools/sync_fragment_library.py --write
   ```

## Useful Commands

Re-orient XYZ to linker-at-origin and second-atom-on-+Z:
```bash
python3 tools/reorient_fragment_xyz.py input.xyz -o output.xyz
```

In-place reorientation:
```bash
python3 tools/reorient_fragment_xyz.py input.xyz --inplace
```

Validate manifest without editing files:
```bash
python3 tools/sync_fragment_library.py --check
```

Normalize manifest formatting/order:
```bash
python3 tools/sync_fragment_library.py --write
```

Recompute formulas from XYZ symbols:
```bash
python3 tools/sync_fragment_library.py --write --refresh-formula
```

## Manifest Fields (per entry)
Required/expected fields in `library.json`:
- `kind` (`fragment` or `molecule`)
- `id` (lowercase unique key)
- `name`
- `formula`
- `tags` (array)
- `xyz` (relative path, usually `./<id>.xyz`)
- `bonds` (`[{"i": int, "j": int, "order": 1|2|3|4}]`)

Fragment-only fields:
- `connectionAtomIndex` (usually `0`)
- `preferredBondOrder` (`1..4`)
- `linkBondDirection` (unit vector, usually `[0,0,1]`)
- `attachModes` (`append`, `replace_h`, `fuse_ring`)
- `fuseBondLocalPair` (`[i, j]`) when `attachModes` includes `fuse_ring`

## Notes
- `tools/sync_fragment_library.py` accepts legacy top-level `fragments`, but rewrites the manifest using top-level `entries`.
- Keep entry IDs stable once used in presets/operation logs.
