# MINAO preview data

`cc-pvtz-minao.json` is an unchanged copy of
[`forte2/data/basis/cc-pvtz-minao.json`](https://github.com/evangelistalab/forte2/blob/a7283148f4da053e189520e502b2d9d652411389/forte2/data/basis/cc-pvtz-minao.json)
from forte2 commit `a7283148f4da053e189520e502b2d9d652411389`.

SHA-256: `9a54bdd9ad2232c9a640c61f72cc07bcd32761cbec967c8ef9a9d8af1285f7ec`.

The source identifies the data as originating from ccRepo / Grant Hill, revision
2018-10-03. Original MolSSI Basis Set Exchange metadata, per-element reference
keys, exponents and contraction coefficients are preserved in the JSON.

Coverage is H–Ar and Ca–Kr. The source explicitly says **only elements 1–10 have
been pruned**; later elements include additional contractions and polarization
functions. The picker uses the actual source shells, with transition-metal
choices restricted to the valence d shell and its double-shell partner (3d/4d
for Sc–Zn). Other elements retain their source shell choices. K and elements
beyond Kr are absent.

General contractions expand in source order. The shell's principal number starts
at `l + 1` on each atom and increments per contraction of the same angular
momentum, matching forte2 `BasisInfo`. The real spherical components follow
Libint CCA order. No basis data is fetched from an external service at runtime.

See [Calculations](../../../docs/calculations.md) for preview conventions and
limitations when the generated input names a different MINAO basis.
