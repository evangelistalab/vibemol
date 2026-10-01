# Fragment Geometry Calculations

This directory records the capped-parent calculations used for VibeMol's
monovalent organic fragments. Production fragment coordinates live one level
up; large ORCA scratch, Hessian, and restart files are not tracked.

The standard parent protocol is gas-phase
`PBE0 D4 def2-TZVP def2/J RIJCOSX TightSCF TightOpt Freq DEFGRID3` in ORCA
6.1.0. The optimized methyl cap is deleted without relaxing the retained atoms.
The vector from the retained linker atom to the deleted cap carbon is rotated
onto `+Z`, and the linker is translated to the origin.

Ethane, methanol, and acetonitrile reuse accepted parent calculations already
recorded in `../molecule_optimization/`. Methylamine, toluene, propane, dimethyl
ether, fluoromethane, chloromethane, bromomethane, nitromethane, acetic acid,
isobutane, and neopentane converged normally and have no imaginary modes.
Acetamide's retained geometry and gradients stabilized, but the strict
displacement test oscillated along the nearly free cap methyl rotor.
Its lowest-energy tight-gradient structure was therefore checked with a separate
same-level analytic Hessian: all 21 genuine modes are positive, with the lowest
at 15.61 cm^-1. This cap-only exception is recorded explicitly in
`results.json`; the cap is absent from the shipped amide fragment.

Starting 3D conformers came from PubChem; every CID and source URL is recorded in
`results.json`. `inputs/` contains every initial, restart, and verification input
needed to reproduce the retained results. Analytic frequency calculations are
allowed to finish without the earlier five-minute wall-time cutoff. In this
batch their complete optimization-plus-frequency wall times ranged from about
two minutes for fluoromethane to about 25 minutes for neopentane.
