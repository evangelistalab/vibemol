# AVAS reference-basis data

`cc-pvtz-minao.json` is an unchanged copy of
[`forte2/data/basis/cc-pvtz-minao.json`](https://github.com/evangelistalab/forte2/blob/a7283148f4da053e189520e502b2d9d652411389/forte2/data/basis/cc-pvtz-minao.json)
from forte2 commit `a7283148f4da053e189520e502b2d9d652411389`.

SHA-256: `9a54bdd9ad2232c9a640c61f72cc07bcd32761cbec967c8ef9a9d8af1285f7ec`.

The source identifies the data as originating from ccRepo / Grant Hill, revision
2018-10-03. Original MolSSI Basis Set Exchange metadata, per-element reference
keys, exponents and contraction coefficients are preserved in the JSON.

Coverage is H–Ar and Ca–Kr. The source explicitly says **only elements 1–10 have
been pruned**; later elements include additional contractions and polarization
functions. K and elements beyond Kr are absent.

`cc-pvtz.json` is an unchanged copy of
[`forte2/data/basis/cc-pvtz.json`](https://github.com/evangelistalab/forte2/blob/a7283148f4da053e189520e502b2d9d652411389/forte2/data/basis/cc-pvtz.json)
from the same forte2 commit. Its SHA-256 is
`701f9117c5b2fc3487ab079ae6fa9e8ee0717fed874957ace1b2dc6c036e53fe`.
Original BSE metadata and per-element references are preserved.

The full cc-pVTZ dataset supplies next-shell functions missing from the pruned
minimal basis, including C(3s) and C(3p). Menus limit its catalog to occupied/core,
outer s/p, next s/p and occupied-d double shells, in filling order. A selection
requiring a function missing from cc-pvtz-minao switches the record to cc-pvtz.
Previews and the exported reference-basis name then both use the full dataset;
the coefficients of different bases are never mixed. Older sessions using
cc-pvtz-minao keep that basis and its original coefficients. Custom basis names
use a cc-pVTZ preview with an explicit verification warning.

General contractions expand in source order. The shell's principal number starts
at `l + 1` on each atom and increments per contraction of the same angular
momentum, matching forte2 `BasisInfo`. The real spherical components follow
Libint CCA order. No basis data is fetched from an external service at runtime.

See [Calculations](../../../docs/calculations.md) for preview conventions and
limitations when the generated input names a different MINAO basis.
