# Fragment Library Workflow

This folder is the editable source for the VibeMol builder catalog.

## Files
- `library.json`: catalog manifest (entries + bonding + paths to XYZ files)
- `*.xyz`: per-entry geometry files

## Geometry Convention
For each `kind: "fragment"` `*.xyz`:
- Atom **1** (index `0`) is the **linker atom**.
- `linkBondDirection` points from the linker atom toward the external anchor and
  is normally `[0, 0, 1]`.
- The remaining fragment atoms therefore lie predominantly away from `+Z`.
- No retained atom is required to lie on the attachment axis. For capped
  fragments, the axis comes from the deleted linker-to-cap bond.

Standalone `kind: "molecule"` entries do not use the linker convention. The
placement code centers them at their center of mass. Their XYZ files must contain
the complete molecule, including hydrogens, and their explicit bond lists must
cover the same atom indices.

## Molecule Geometry Protocol

Library molecule geometries use a reproducible gas-phase ORCA 6 protocol:

1. Start from a chemically valid, complete 3D structure and preserve the catalog
   atom ordering when replacing an existing entry.
2. For flexible molecules, search conformers first with ORCA's native GFN2-xTB
   GOAT implementation. Rigid molecules may skip this step.
3. Optimize and compute harmonic frequencies at the same level:
   `PBE0 D4 def2-TZVP def2/J RIJCOSX TightSCF TightOpt Freq DEFGRID3`.
4. Accept a geometry only after optimization converges and the frequency analysis
   has no imaginary vibrational modes. Record charge, multiplicity, final energy,
   ORCA version, and conformer-search details in `molecule_optimization/`.
5. Copy the accepted coordinates and bonds to both the XYZ-backed manifest and
   the built-in fallback in `assets/app/js/fragments.js`.

The production XYZ comment should identify the method and minimum check. Keep
large ORCA scratch files and binary restart files out of the repository.

## Fragment Geometry Protocol

Closed-shell organic fragments use a methyl-capped parent when that produces an
unambiguous monovalent fragment:

1. Build and optimize `CH3-fragment` in the gas phase. Run harmonic frequencies
   at `PBE0 D4 def2-TZVP def2/J RIJCOSX TightSCF TightOpt Freq DEFGRID3`.
2. Accept the parent only after optimization converges and the frequency
   analysis has no imaginary modes. A soft cap-only coordinate may instead be
   accepted from a documented near-threshold-gradient frame after an explicit
   all-positive frequency calculation; record the exception in
   `fragment_optimization/`.
   Do not apply the Builder's former five-minute screening cutoff to the analytic
   frequency step: small parents in the current set required up to about 25
   minutes on one core.
3. Record the vector from the retained linker atom to the cap carbon before
   deleting the cap. Remove the cap carbon and all of its hydrogens without
   relaxing the remaining fragment.
4. Translate the linker atom to `(0, 0, 0)` and rotate the recorded cap vector
   onto `+Z`. Preserve the retained internal geometry and catalog atom order.
5. Copy the accepted coordinates to both the XYZ asset and the built-in fallback
   in `assets/app/js/fragments.js`.

The current methyl-capped set is methyl from ethane, hydroxyl from methanol,
amino from methylamine, amide from acetamide, phenyl from toluene, ethyl from
propane, methoxy from dimethyl ether, fluoro/chloro/bromo from their respective
halomethanes, cyano from acetonitrile, nitro from nitromethane, carboxyl from
acetic acid, isopropyl from isobutane, and tert-butyl from neopentane. Methylene
and carbonyl are excluded because they are inherently multi-attachment units in
their present definitions.

## Typical Fragment Edit Loop
1. Edit one fragment XYZ (`assets/fragments/<id>.xyz`).
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

Re-orient XYZ to linker-at-origin and second-atom-on-+Z (legacy/manual internal
axis helper; capped extraction must use the deleted cap bond instead):
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
- `importanceRank` (molecules only; the numbered position in
  `docs/molecule-library-top-100.md`, used for Builder display order)
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
