# Molecule optimization skip log

The initial pass applied a hard five-minute wall-clock ceiling to each final gas-phase
PBE0-D4/def2-TZVP optimization plus frequency calculation. The ceiling includes
all geometry and Hessian work and is independent of any preliminary conformer
search. Entries were screened before launch using atom count, basis size,
electronic structure, charge/spin ambiguity, and whether the roadmap calls for a
special or multi-structure geometry.

That ceiling has since been retired. This file remains a historical queue, not a
current runtime policy: ordinary single-reference entries may be rerun with
enough time for the analytic Hessian to finish. Scientific exclusions involving
ambiguous states, multireference character, or specifically requested variant
sets still require case-by-case treatment.

The empirical boundary on this machine was narrow: PF3 completed in 283.775 s,
diborane in 292.554 s, and the ammonia-borane calculation in 225.441 s. Acetone
and acetic acid reached 300 s and were terminated. Molecules with comparable or
larger estimated DFT/Hessian cost were therefore skipped without being started.
No timed-out, saddle-point, or otherwise unverified coordinates were added to
the catalog.

| # | Roadmap entry | Disposition and reason |
|---:|---|---|
| 8 | Acetone | Timed out at 300 s during the final calculation. |
| 9 | Acetic acid | Initial run timed out at 300 s. A later capped-fragment parent run completed normally in 607.224 s with no imaginary modes; standalone-catalog promotion remains pending. |
| 21 | Toluene | Pre-screened above the limit: 15 atoms and seven-carbon aromatic basis. |
| 22 | Dichloromethane | Pre-screened above the limit: two chlorine centers make its analytic Hessian more expensive than near-limit PF3. |
| 23 | Chloroform | Pre-screened above the limit: three chlorine centers. |
| 25 | Tetrahydrofuran | Pre-screened above the limit: 13 atoms plus a conformer search. |
| 26 | Dimethyl sulfoxide | Pre-screened above the limit: 10 atoms including sulfur. |
| 27 | Dimethylformamide | Pre-screened above the limit: 12 atoms plus amide conformers. |
| 28 | Diethyl ether | Pre-screened above the limit: 15 atoms plus a conformer search. |
| 29 | Ethyl acetate | Pre-screened above the limit: 14 atoms and multiple rotors. |
| 30 | Isopropanol | Pre-screened above the limit: 12 atoms plus a conformer search. |
| 31 | *n*-Hexane | Pre-screened above the limit: 20 atoms and a large conformer space. |
| 32 | Phenol | Pre-screened above the limit: 13 atoms and an aromatic Hessian. |
| 33 | Aniline | Pre-screened above the limit: 14 atoms and an aromatic Hessian. |
| 34 | Naphthalene | Pre-screened above the limit: 18 atoms and ten carbon centers. |
| 35 | Styrene | Pre-screened above the limit: 16 atoms and eight carbon centers. |
| 37 | Urea | Pre-screened above the limit using the acetic-acid timeout: eight atoms with four non-hydrogen centers. |
| 38 | Glycerol | Pre-screened above the limit: 14 atoms and a large hydrogen-bonded conformer space. |
| 39 | 1,4-Dioxane | Pre-screened above the limit: 14 atoms plus ring conformers. |
| 40 | Cyclopentadiene | Pre-screened above the limit: 11 atoms and five carbon centers. |
| 41 | Ozone | Skipped as an explicitly multireference benchmark; a routine single-reference minimum would be misleading. |
| 42 | C2 carbon dimer | Skipped for strong multireference character and bond-state ambiguity. |
| 43 | F2 | Skipped as a correlation-dominated dissociation benchmark rather than a routine single-reference catalog optimization. |
| 44 | BeH2 | Skipped because the roadmap specifically targets its multireference insertion-path role. |
| 47 | Methylene | Skipped: requested singlet/triplet variant set with multireference state selection. |
| 48 | Cyclobutadiene | Skipped: requested square/rectangular variant set includes a special high-symmetry stationary point. |
| 49 | 1,3-Butadiene | Skipped: requested *s*-cis/*s*-trans variant set. |
| 50 | *p*-Benzyne | Skipped for diradical/multireference character. |
| 51 | *m*-Benzyne | Skipped for diradical/multireference character. |
| 52 | *o*-Benzyne | Skipped for diradical/multireference character. |
| 53 | Trimethylenemethane | Skipped for non-Kekulé triplet/multireference character. |
| 54 | Twisted ethylene (90°) | Skipped because it requires a constrained, non-equilibrium special geometry. |
| 55 | Cr2 | Skipped: transition-metal, strongly multireference system. |
| 56 | FeO | Skipped: transition-metal diatomic with spin-state ambiguity. |
| 57 | NiO | Skipped: transition-metal diatomic with spin-state ambiguity. |
| 58 | Diimide | Skipped: requested *cis*/*trans* variant set. |
| 59 | 1,3,5-Hexatriene | Pre-screened above the limit: 14 atoms and a polyene conformer space. |
| 60 | Anthracene | Pre-screened above the limit: 24 atoms and 14 carbon centers. |
| 62 | PCl5 | Pre-screened above the limit: six heavy atoms and five chlorine centers. |
| 63 | SF6 | Pre-screened above the limit: seven heavy atoms and an expensive fluorine Hessian. |
| 64 | XeF4 | Pre-screened above the limit: xenon/ECP plus four fluorine centers. |
| 65 | ClF3 | Pre-screened above the limit: PF3 already consumed 283.775 s, leaving no credible margin for chlorine. |
| 66 | SF4 | Pre-screened above the limit: five heavy atoms; SO3 and PF3 were already close to the ceiling. |
| 67 | IF5 | Pre-screened above the limit: iodine/ECP plus five fluorine centers. |
| 68 | XeF2 | Pre-screened above the limit: the xenon/ECP analytic Hessian was not expected to fit below the near-limit PF3 result. |
| 76 | Ferrocene | Skipped: transition-metal sandwich complex and above the runtime limit. |
| 77 | Fe(CO)5 | Skipped: transition-metal carbonyl with spin/electronic-state risk. |
| 78 | Ni(CO)4 | Skipped: transition-metal carbonyl with electronic-state risk. |
| 79 | [Fe(H2O)6]2+ | Skipped: charged transition-metal spin-crossover variant. |
| 80 | Zeise's salt anion | Skipped: charged transition-metal complex and special eta2 bonding. |
| 81 | Glycine | Skipped: requested neutral/zwitterion variant set; the gas-phase zwitterion also needs special treatment. |
| 82 | Alanine | Pre-screened above the limit: 13 atoms plus a chiral conformer search. |
| 83 | Phenylalanine | Pre-screened above the limit: 23 atoms and a large conformer space. |
| 84 | Tryptophan | Pre-screened above the limit: 28 atoms and a large conformer space. |
| 85 | Histidine | Skipped: requested tautomer set and 21 atoms. |
| 86 | Cysteine | Pre-screened above the limit: 14 atoms, sulfur, and multiple conformers. |
| 87 | Proline | Pre-screened above the limit: 17 atoms and ring/backbone conformers. |
| 88 | Adenine | Pre-screened above the limit: 15 atoms and ten non-hydrogen centers. |
| 89 | Guanine | Pre-screened above the limit: 16 atoms and 11 non-hydrogen centers. |
| 90 | Cytosine | Pre-screened above the limit: 13 atoms and eight non-hydrogen centers. |
| 91 | Thymine | Pre-screened above the limit: 15 atoms and nine non-hydrogen centers. |
| 92 | Uracil | Pre-screened above the limit: 12 atoms and eight non-hydrogen centers. |
| 93 | Glucose | Skipped: requested alpha/beta pyranose variant set, 24 atoms, and many conformers. |
| 94 | Ribose | Pre-screened above the limit: 20 atoms and many furanose conformers. |
| 95 | Watson-Crick A-T pair | Pre-screened above the limit: large base pair with special hydrogen-bond geometry. |
| 96 | Water dimer | First final calculation converged in 292.945 s to a planar saddle with two imaginary modes (-193.746 and -100.604 cm-1). A symmetry-broken retry was terminated at 300 s. |
| 97 | Benzene dimer | Skipped: requested stacked/T-shaped variant set and 24 atoms. |
| 98 | Porphyrin (free base) | Pre-screened above the limit: 38 atoms and an extended conjugated macrocycle. |
| 99 | Adamantane | Pre-screened above the limit: 26 atoms. |
| 100 | Fullerene C60 | Pre-screened above the limit: 60 carbon atoms. |

Cyclohexane and pyridine were already present and were not part of this skip
set. The existing cyclohexane entry is the verified chair minimum; the roadmap's
additional boat variant remains a future special-geometry task.
