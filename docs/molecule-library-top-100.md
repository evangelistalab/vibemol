# VibeMol — top 100 molecules for the Molecules palette

Currently shipped: 30 roadmap entries with verified PBE0-D4/def2-TZVP minima. Shipped entries are marked ✓; entries excluded by the five-minute calculation gate are recorded in the molecule-optimization skip log.

## Organizing principle

VibeMol already has PubChem search, so **breadth is solved** — any named compound is one query away. A curated palette earns its place on two things PubChem does not give you:

1. **Speed** — a molecule you place constantly is faster to click than to type and wait for a fetch.
2. **Curated geometry** — PubChem returns a generic conformer. For a benchmark system, the *specific* structure is the point: ozone at its equilibrium geometry, a stretched N₂, a 90°-twisted ethylene.

That pushes drugs and large natural products down the list and benchmark systems up. It also means every entry should ship with a stated geometry source.

---

## Tier 1 · Everyday small molecules (1–20)
Placed constantly, by everyone. Clicking beats typing.

| # | Molecule | Formula | Note |
|---|---|---|---|
| 1 | Water ✓ | H₂O | bent, the universal reference |
| 2 | Methane ✓ | CH₄ | tetrahedral |
| 3 | Ammonia ✓ | NH₃ | pyramidal |
| 4 | Benzene ✓ | C₆H₆ | already shipped |
| 5 | Ethanol ✓ | C₂H₆O | |
| 6 | Carbon dioxide ✓ | CO₂ | linear |
| 7 | Methanol ✓ | CH₄O | |
| 8 | Acetone | C₃H₆O | |
| 9 | Acetic acid | C₂H₄O₂ | |
| 10 | Ethene ✓ | C₂H₄ | planar, π reference |
| 11 | Ethyne ✓ | C₂H₂ | linear |
| 12 | Formaldehyde ✓ | CH₂O | n→π* teaching case |
| 13 | Cyclohexane ✓ | C₆H₁₂ | ship chair **and** boat |
| 14 | Dinitrogen ✓ | N₂ | triple bond reference |
| 15 | Dioxygen ✓ | O₂ | **triplet ground state** |
| 16 | Dihydrogen ✓ | H₂ | |
| 17 | Carbon monoxide ✓ | CO | |
| 18 | Hydrogen peroxide ✓ | H₂O₂ | non-planar, torsion demo |
| 19 | Ethane ✓ | C₂H₆ | staggered/eclipsed |
| 20 | Pyridine ✓ | C₅H₅N | already shipped |

---

## Tier 2 · Solvents and common organics (21–40)
The lab-bench set. Mostly placed as context or starting material.

| # | Molecule | Formula |
|---|---|---|
| 21 | Toluene | C₇H₈ |
| 22 | Dichloromethane | CH₂Cl₂ |
| 23 | Chloroform | CHCl₃ |
| 24 | Acetonitrile ✓ | C₂H₃N |
| 25 | Tetrahydrofuran | C₄H₈O |
| 26 | Dimethyl sulfoxide | C₂H₆OS |
| 27 | Dimethylformamide | C₃H₇NO |
| 28 | Diethyl ether | C₄H₁₀O |
| 29 | Ethyl acetate | C₄H₈O₂ |
| 30 | Isopropanol | C₃H₈O |
| 31 | *n*-Hexane | C₆H₁₄ |
| 32 | Phenol | C₆H₆O |
| 33 | Aniline | C₆H₇N |
| 34 | Naphthalene | C₁₀H₈ |
| 35 | Styrene | C₈H₈ |
| 36 | Formic acid ✓ | CH₂O₂ |
| 37 | Urea | CH₄N₂O |
| 38 | Glycerol | C₃H₈O₃ |
| 39 | 1,4-Dioxane | C₄H₈O₂ |
| 40 | Cyclopentadiene | C₅H₆ |

---

## Tier 3 · Quantum chemistry benchmarks (41–60)
The differentiator for VibeMol's actual audience. These need **stated reference geometries**, not generic conformers — several are only interesting at a specific structure.

| # | System | Why it matters |
|---|---|---|
| 41 | Ozone O₃ | the canonical multireference small molecule |
| 42 | C₂ carbon dimer | bond-order controversy; strong correlation |
| 43 | F₂ | dissociation benchmark, correlation-dominated bond |
| 44 | BeH₂ | textbook insertion-path MR benchmark |
| 45 | LiH ✓ | smallest nontrivial correlation test |
| 46 | HF ✓ | single-reference reference point |
| 47 | Methylene CH₂ | ship **singlet and triplet**; the classic gap |
| 48 | Cyclobutadiene | antiaromatic, automerization; ship square **and** rectangular |
| 49 | 1,3-Butadiene | *s-cis* and *s-trans*; excited-state workhorse |
| 50 | *p*-Benzyne | singlet diradical |
| 51 | *m*-Benzyne | diradical series |
| 52 | *o*-Benzyne | diradical series |
| 53 | Trimethylenemethane | non-Kekulé triplet |
| 54 | Twisted ethylene (90°) | conical-intersection demo; geometry **is** the point |
| 55 | Cr₂ | the hard case for any correlated method |
| 56 | FeO | TM diatomic, spin states |
| 57 | NiO | TM diatomic |
| 58 | Diimide N₂H₂ | *cis*/*trans* isomerization |
| 59 | 1,3,5-Hexatriene | polyene series |
| 60 | Anthracene | singlet fission |

---

## Tier 4 · Bonding, geometry, and inorganic (61–80)
Cheap to store, high teaching value, and they exercise every one of the 11 geometry types in `coordination.js`.

| # | Molecule | Geometry |
|---|---|---|
| 61 | BF₃ ✓ | trigonal planar |
| 62 | PCl₅ | trigonal bipyramidal |
| 63 | SF₆ | octahedral |
| 64 | XeF₄ | square planar |
| 65 | ClF₃ | T-shaped |
| 66 | SF₄ | seesaw |
| 67 | IF₅ | square pyramidal |
| 68 | XeF₂ | linear, hypervalent |
| 69 | SO₂ ✓ | bent |
| 70 | SO₃ ✓ | trigonal planar |
| 71 | NO₂ ✓ | bent radical |
| 72 | N₂O ✓ | linear, asymmetric |
| 73 | PF₃ ✓ | pyramidal |
| 74 | Diborane B₂H₆ ✓ | 3c–2e bridging; breaks naive valence rules |
| 75 | Ammonia borane NH₃BH₃ ✓ | dative bond |
| 76 | Ferrocene | η⁵ sandwich |
| 77 | Fe(CO)₅ | TBP carbonyl |
| 78 | Ni(CO)₄ | tetrahedral carbonyl |
| 79 | [Fe(H₂O)₆]²⁺ | spin-crossover reference |
| 80 | Zeise's salt anion | η² alkene binding |

---

## Tier 5 · Biomolecular and materials (81–100)
Larger, more expensive to store, lower frequency — but the ones users will not want to build by hand.

| # | Structure | Note |
|---|---|---|
| 81 | Glycine | zwitterion **and** neutral |
| 82 | Alanine | simplest chiral residue |
| 83 | Phenylalanine | aromatic side chain |
| 84 | Tryptophan | fluorescence, largest residue |
| 85 | Histidine | both tautomers |
| 86 | Cysteine | disulfide chemistry |
| 87 | Proline | ring-constrained backbone |
| 88 | Adenine | |
| 89 | Guanine | |
| 90 | Cytosine | |
| 91 | Thymine | |
| 92 | Uracil | |
| 93 | Glucose | α and β pyranose |
| 94 | Ribose | furanose |
| 95 | Watson–Crick A·T pair | H-bond geometry |
| 96 | Water dimer | the H-bond benchmark |
| 97 | Benzene dimer | π-stacked and T-shaped; dispersion benchmark |
| 98 | Porphyrin (free base) | |
| 99 | Adamantane | rigid cage |
| 100 | Fullerene C₆₀ | |

---

## Implementation notes

**Geometry provenance should be a field.** For Tiers 1–2 an idealized or UFF-optimized structure is fine. For Tier 3 it is not — a generic conformer of twisted ethylene is just ethylene. Each entry should record where its coordinates came from (experimental, a named level of theory, or idealized) and show it in the UI. That single field is what separates this palette from a PubChem search.

**Several entries are a set, not a structure.** Cyclohexane needs chair and boat; methylene needs singlet and triplet; cyclobutadiene needs square and rectangular; butadiene needs *s-cis* and *s-trans*; glycine needs neutral and zwitterion. Model these as one entry with selectable variants rather than as separate palette items — the same pattern as attachment isomers in the fragment list.

**Spin state is not optional metadata.** O₂ is a triplet, methylene has two relevant states, FeO and [Fe(H₂O)₆]²⁺ are spin-state problems. Since these feed the Calculations mode, each entry should carry charge and multiplicity so the generated forte2 input is right without the user having to remember.

**Tier 4 doubles as a test suite.** Those twenty exercise all 11 geometry types in `coordination.js`, plus hypervalency and 3c–2e bonding. Worth wiring into the QA fixtures — if diborane renders with sane bonds, the bond-inference code is healthy.

**Ordering caveat.** Tiers 1–2 are ordered by general frequency; Tier 3 is ordered by relevance to multireference work rather than by how often it appears anywhere. If VibeMol's users turn out to be mostly students rather than computational chemists, Tier 3 and Tier 4 should swap.

**Next twenty, if the list grows:** coronene, cubane, pentacene, retinal (11-*cis* and all-*trans*), heme b, chlorophyll a, ATP, 18-crown-6, β-cyclodextrin, water hexamer (prism and cage), ammonia dimer, formic acid dimer, HCN/HNC pair, norbornadiene and quadricyclane, azobenzene (*cis*/*trans*), stilbene, spiropyran, Cu₂O₂ isomers, Wilkinson's catalyst, and a graphene flake.
