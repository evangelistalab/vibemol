# Molden g-shell reference values

- `ne_sph_qz_forte2.molden`: Ne/cc-pVQZ RHF written by forte2 2026.11.2 `write_molden` (spherical `[5D] [7F] [9G]`).
- `ne_cart_qz.molden`: Ne/cc-pVQZ RHF written by PySCF 2.15.1 `tools.molden.from_scf` with a Cartesian basis.
- `molden_g_reference.json`: 64 points (bohr, Ne at the origin) and MO amplitudes for the MOs with the largest g weight
  (9 pure-g spherical virtuals; 15 Cartesian MOs, 9 pure g). MO indices are 0-based positions in the `[MO]` section.

Reference amplitudes come from PySCF evaluating each file. Independent checks at generation time:
PySCF reading the forte2 file agrees with forte2's own AO evaluator (no Molden involved) to 5.2e-11 over all MOs;
PySCF's Cartesian writer agrees with VibeMol's shipped Cartesian d/f evaluation to 2.0e-7 on a Ne2/cc-pVTZ file,
so the Cartesian g reference follows the convention VibeMol already uses for d and f.
Regenerate with `tools/fixtures/make_molden_g_reference.py` (requires forte2 and PySCF; not run in CI).
