# Hydrogen-bond visualization

Properties → Object → Structure → **Hydrogen bonds** controls the selected molecule layers. It is on by default and independent of **Show bonds**. In mixed structure/orbital selections, the toggle affects only the structure. The choice is session state, preserved by session save/open and recovery; it does not change a Look or the chemical bond graph. Older sessions without the setting inherit the enabled default.

## Criterion

For an explicit donor–hydrogen–acceptor triplet D–H···A, all of these must hold:

- D and A are N, O, F, or S. H has exactly one chemical neighbor, D, connected by a single covalent bond.
- H···A is between **1.2 and 2.5 Å**, D···A is at most **3.5 Å**, and the D–H···A angle is at least **120°** (180° is linear).
- D–H is between 0.4 and 1.35 Å, extended to 1.65 Å for S–H, so a stretched stored bond cannot supply a spurious donor.
- A is neither D nor a chemical neighbor of D. Positive formal-charge acceptors, saturated N/O/S, amide/thioamide nitrogen, pyrrole-like nitrogen, carboxylic-acid OH oxygen, and carbon-bound fluorine are excluded using available topology and bond orders. Free F and HF are allowed. Sulfur is limited to low-valent environments.

These are fixed, deliberately conservative **visualization heuristics**, not a bond-energy calculation or exhaustive atom typing. Missing explicit hydrogens, unknown protonation/charges, or inaccurate bond orders can cause missed or incorrect assignments. The sulfur cutoff is conservative; unusual/weak hydrogen bonds and implicit hydrogens are not covered. No periodic images are generated. Disconnected fragments within the same structure can interact; separate scene structures are evaluated independently.

Both distances and orientation matter. [ChimeraX's documented method](https://www.cgl.ucsf.edu/chimerax/docs/user/commands/hbonds.html) uses chemistry-dependent distance/angle criteria. [MDAnalysis](https://docs.mdanalysis.org/stable/documentation_pages/analysis/hydrogenbonds.html) also combines geometry with donor/acceptor assignment, with different default thresholds. VibeMol's thresholds above are its own simple display policy.

## Rendering and updates

Thin teal dashed cylinders join H to A. They use the current bond material with a distinct contact color and fixed 0.035 Å radius. One instanced mesh per structure batches the dashes, and existing buffers are reused when capacity permits. They cannot be picked as chemical bonds and do not cast or receive shadows. Ordinary atom/bond picking, hydrogen valence restrictions, UFF, and structure/XYZ exports are unchanged.

The detector uses acceptor spatial bins, returns immediately for structures without H, and runs when geometry changes, not during idle drawing or camera rotation. Edits, undo/redo, trajectory/vibration coordinate updates, and appearance rebuilds update the contacts. An empty mesh is retained when necessary so contacts can appear later even when ordinary bonds are hidden.

`assets/app/js/hydrogen-bonds.js` owns the pure detector and dashed-mesh updater. `tests/unit/hydrogen-contacts.test.mjs` covers geometry boundaries, chemistry exclusions, spatial-cell boundaries, immutability, and GPU-buffer reuse. `tests/e2e/hydrogen_contacts.py` covers real imports, Properties scope, visibility, edit/undo, modes, session compatibility, Looks, and trajectory changes.
