# Molecule Geometry Calculations

This directory records the calculations used for the standalone molecule entries
in the VibeMol builder library. Production coordinates remain in the parent
directory; large ORCA scratch files and binary restart files are intentionally not
tracked here.

All final calculations use gas-phase PBE0-D4/def2-TZVP in ORCA 6.1.0, with
RIJCOSX/def2-J, TightSCF, TightOpt, DEFGRID3, and an analytic harmonic-frequency
calculation at the same level. A result is accepted only when optimization
converges and the Hessian contains no imaginary vibrational frequencies.

Flexible entries use a bounded native-GFN2-xTB GOAT conformer search when a
nontrivial conformer choice fits the runtime budget. Cyclohexane starts from the
complete PubChem CID 8078 3D conformer, while ethanol starts from PubChem CID
702. Rigid/common entries use either the cited PubChem 3D conformer or an
explicitly recorded idealized VSEPR/reference construction and go directly to
the final calculation.

`inputs/` contains the exact starting inputs. `results.json` records the accepted
energies, source provenance, wall times, charge/multiplicity, and frequency
checks. `SKIPPED.md` records exclusions from the initial time-bounded pass; its
five-minute ceiling is historical and is not a limit for subsequent runs.
Analytic frequencies must be allowed to finish when the optimization itself has
converged. The final coordinates may be translated, rotated, or atom-permuted
for a stable catalog order; those operations do not change the energy or
internal geometry.

References:

- [ORCA geometry optimizations](https://www.faccts.de/docs/orca/6.1/manual/contents/structurereactivity/optimizations.html)
- [ORCA vibrational frequencies](https://www.faccts.de/docs/orca/6.1/manual/contents/structurereactivity/frequencies.html)
- [ORCA GOAT conformer search](https://www.faccts.de/docs/orca/6.1/manual/contents/structurereactivity/goat.html)
- [ORCA native GFN2-xTB](https://www.faccts.de/docs/orca/6.1/manual/contents/modelchemistries/semiempirical.html)
