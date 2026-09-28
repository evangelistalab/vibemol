# Calculations: AVAS subspace picker

The Workbench has a fourth interaction mode, **Calculations**. Click atoms to
select atomic functions for a forte2 AVAS projector. VibeMol generates a Python
input; it does not run SCF, AVAS, CI, or geometry optimization.

## Workflow

1. Load a structure and enter Calculations. Existing surfaces/clouds are hidden
   temporarily, playback pauses, and the camera frames the atoms. Their graph
   visibility flags remain unchanged. Returning directly to View restores the
   prior camera view.
2. Click atoms to select or deselect them; Shift-click retains an already selected
   atom. **No orbitals are assigned automatically.** Drag to orbit. Clicking empty
   canvas clears editing focus and preserves assigned orbitals.
3. The movable **Atomic orbitals** popup opens for one atom or a group from the same
   periodic-table row. Group controls show only shells available on every atom in
   the bundled reference bases. Mixed-row selections keep their highlights but suppress
   the popup; Subspace explains why. **Choose orbitals** reopens it, while **Edit**
   on an existing assignment focuses just that atom.
4. The compact circular toolbar appears next to the selected atom or group. Toggle
   `(n,l)` shells with its buttons; selecting p/d also opens a dropdown of individual
   orbitals directly below that shell. Its caret opens the dropdown without assigning
   a whole shell. Only one dropdown opens at a time. The popup shares Edit's drag
   grip, selection rings, and remove button; removing orbitals never deletes atoms.
   Changes apply to all focused atoms. Mixed/partial choices are underlined.
   Clicking a whole shell fills it everywhere (or removes it if already full
   everywhere). A first component click replaces whole-shell choices; subsequent
   clicks add the component everywhere, or remove it when every partial choice
   already contains it. Full component sets collapse to a whole shell.
   Menus follow the neutral element's occupied/core shells, complete outer s/p
   shells, and the next s/p set. Elements with occupied 3d also expose 4d. They
   appear in filling order, matching these examples:

   - C: `1s 2s 2p 3s 3p`
   - S: `1s 2s 2p 3s 3p 4s 4p`
   - Fe: `1s 2s 2p 3s 3p 4s 3d 4p 5s 4d 5p`

   H/He expose `1s 2s 2p`; Ca does not offer an unoccupied d shell. The same-period
   group menu is the intersection of each atom's choices. Existing assignments
   outside the menu limits remain intact until explicitly removed.
5. With three or more selected atoms, the toolbar offers **π plane** fitting. All
   must have whole p shells and pass the non-collinear, near-coplanar checks.
   Disabled controls explain the missing condition. Existing planes can be
   removed from the popup or managed in Subspace's **π planes** section.
6. Choose the reference (RHF, ROHF or GHF), charge, selection method and basis
   names. For ROHF, set **Spin projection (ms)**. **Copy input**
   copies a complete script including the current coordinates in angstroms.

The panel supports the same dock, float, minimize, drag, keyboard and layout
operations as the other inspectors. It opens on first entering the mode; a
deliberate close is remembered on later mode changes. Camera, Coordinates and
Properties remain available. If a previous session is awaiting recovery, newly
opened panels still appear; only automatic restoration of saved windows waits
for the recovery choice. Subspace selections, planes and calculation
options belong to each structure and are included in portable sessions and
autosave. They use stable atom IDs and are pruned after atom deletion or a
geometry change that invalidates a plane. They are not Look properties.
Atom editing focus and the popup's position/open state are transient and excluded
from sessions. Camera changes keep the popup near the selection unless manually
moved. Selecting different atoms restores its automatic position and closes the
dropdown. Deselecting or closing the popup never removes assigned orbitals;
use **Remove orbitals**, a row's **Remove**, or **Clear subspace** for that.
Escape first closes the popup, then clears atom focus, then returns to View.

## Scientific contract

- Shell/component names and per-element numbering match forte2's AVAS grammar.
  Consecutive indices compress to ranges; a selection shared by every atom of an
  element uses the bare symbol (for example `C(2px)`, equivalent to `C1(2px)` for
  formaldehyde). `p` components are `py, pz, px`; `d` components are
  `dxy, dyz, dz2, dxz, dx2-y2`. f and higher shells offer whole-shell selection
  only; several f component labels cannot pass forte2's expression grammar.
- Plane fitting uses the smallest eigenvector of the centered coordinate
  covariance matrix, equivalent to the smallest right singular vector used by
  forte2. Collinear sets are rejected. Near-coplanarity means RMS perpendicular
  displacement no greater than **0.100 Å**. The normal points toward the plane
  centroid from the molecular centroid. When that dot product is zero the phase
  is arbitrary, as in the source SVD; the resulting projector is unchanged.
  Shared atoms use the normalized sum of their plane normals.
- A whole p shell on a plane contributes three MINAO functions but **one**
  subspace orbital. The preview displays that same normal-oriented combination.
  Three ring carbons therefore report **9 MINAO functions → 3 subspace orbitals**.
- Available methods are cumulative (`sigma=0.98` by default), cutoff, separate
  occupied/virtual counts, and total count. Diagonalization defaults on. Invalid
  parameters suppress the generated input and show an explanation.
- Total active count follows the selected spin-free subspace, including π-plane
  constraints, until edited. For example, three whole p shells give 9, or 3 with
  a shared π plane. A manual count persists across selection changes and session
  save/open; **Use selection count** restores automatic updates. Older sessions
  with explicit counts keep their values. Occupied/virtual counts remain manual:
  their split requires an SCF result.
- RHF emits a singlet `CISolver` / `MCOptimizer` chain and requires an even
  electron count.
- ROHF enables `ms = (Nα − Nβ)/2`, initially 0, in steps of 0.5. It must match
  electron parity and satisfy `|ms| ≤ nel/2`. The generated ROHF reference and
  CI state share `ms`; the downstream `CISolver` / `MCOptimizer` chain targets
  `S = |ms|` with multiplicity `2|ms| + 1` (for example, 0.5 gives a doublet,
  1 gives a triplet). Other CI spin targets can be edited in the exported input.
  The value is retained in sessions and when switching references, but ignored
  and disabled for RHF/GHF.
- With ROHF, forte2 AVAS always includes all singly occupied orbitals. The
  **Additional active**, **Doubly occupied**, and **Virtual** counts are additional
  to those orbitals, and remain spatial counts. Separate counts can both be 0
  if there are singly occupied orbitals. The current forte2 separate-count
  validator uses signed `2*ms`: for negative `ms`, it additionally requires
  `docc + uocc + 2*ms > 0`. VibeMol explains that restriction and blocks invalid
  input; Total selection or positive `ms` avoids it.
- GHF emits `x2c_type="so"` and
  `CI(RelCISolver(nel=mf.nel))(avas)`. Enter counts as spatial pairs; GHF doubles
  emitted active counts exactly once and labels the projected count **spinors**.
  The MINAO function list remains spin-free. No SCF eigenvalue spectrum or final
  active-space prediction is shown.

## Preview and basis data

Previews evaluate normalized contracted real solid-harmonic GTOs on a 43³ grid.
Each shell uses a contour at **40% of its peak radial amplitude**, with adaptive
local bounds capped at 4 Å. These are AO shape previews, not computed molecular
orbitals. Positive and negative phases inherit the Look's surface colors and
material; a fixed 0.65 opacity keeps the structure visible.

Lobe size adjusts the contour from 65% (small) to 15% (large), showing the fraction in the slider and contour note. This preview-only choice is transient and excluded from scientific presets, sessions, and generated forte2 input. Each shell is normalized to its own peak, and its default radial envelope is scaled into 0.9–1.25 Å. At 40%, native outer extents for C(2p), N(2p), O(2p), and Fe(3d) are approximately 0.94, 0.77, 0.65, and 0.60 Å; the preview therefore leaves C unchanged and enlarges the other three to 0.9 Å. This keeps compact d functions outside the metal sphere and caps diffuse double shells. A fixed per-shell scale is used across slider changes, preserving angular shapes, nodal relationships, and continuous lobe sizing. The note explicitly identifies these as orientation diagrams, not quantitative density surfaces.

Shell and component chips are checkboxes, with a mixed state only on shells. Components are checked when assigned on every focused atom; checking a partially assigned component applies it to the full focused group. The shared Edit cue state helper derives accessibility and visual state together.

Geometry is cached by reference basis, atomic number, shell, component and contour. Repeated atoms instance
the same geometry, and plane-directed p functions rotate a cached px pair.
Construction yields between distinct functions and cancels obsolete work.
At most 128 inactive cache entries remain; meshes needed by the live selection
are retained. Preview bounds participate in camera depth fitting.

The bundled `cc-pvtz-minao` and full `cc-pvtz` bases both match forte2 data and
cover **H–Ar, Ca–Kr**. K and elements beyond Kr remain unsupported. See the
[data provenance](../assets/data/basis/README.md). Menus use the full basis to
expose next-shell choices; stored reference-basis settings still control the
actual functions used for previews, counts and generated input.

The default and older sessions retain `cc-pvtz-minao`. Selecting a function
absent from that basis, such as C(3p), switches the structure's reference basis
to `cc-pvtz`. The basis field, preview note, geometry and generated
`minao_basis_set` all update together, and the choice persists in sessions.
The two datasets have different contractions even for some shared labels;
therefore the whole preview uses the selected reference basis, without mixing
coefficients. Switching explicitly back to a basis missing assigned shells
blocks input generation and explains the missing functions. It never silently
drops them or automatically reverts after a shell is removed.

Shell numbers follow forte2's per-angular-momentum contraction counters. Higher
labels identify reference-basis functions, not computed atomic excited states
or molecular occupancies. The basis-name field also accepts custom names; these
use cc-pVTZ for the preview and warn that the named basis must be checked before
running. Choosing either bundled name uses its exact data.

## Validation and automation

`node --test tests/unit/calculations.test.mjs` checks shell exclusivity,
compression, contraction normalization, CCA harmonics, plane fitting/averaging,
default shells, parameter validation, and RHF/ROHF/GHF generation.

`python3 tests/e2e/calculations.py` verifies viewport picking and orbit gestures,
component controls and focus, π planes, mesh reuse, sessions, mode restoration,
and responsive layouts. It exports screenshots and executable Python inputs for
cyclopropene, formaldehyde, RHF/GHF N₂, and ROHF NO to the configured artifact directory.
The generated scripts are syntax-checked without executing calculations.

Browser automation uses `window.VibeMolCalculations`: `enter()`, `ready()`,
`toggleAtom(index, extend?)`, `selectAtoms(indices)`, `selectShell(index, shell)`,
`selectComponent(index, shell, component)`, `addPlane(indices?)`,
`configure(options)`, `state()`, and `export()`. Atom indices are zero-based;
component arguments omit the principal number (`"px"`, not `"2px"`). Await
`ready()` before programmatically editing shells. `export()` includes code,
compressed specs, plane specs, counts and validation messages.
Atom selection methods change only editing focus; explicit shell/component calls
create AVAS assignments. `state().selectedAtomIds` returns that transient focus;
`state().selections` contains the saved AO assignments.
`configure({total: n})` sets a manual total; `configure({totalFollowsSelection:
true})` resumes selection-based counts. `state().options.total` returns the
effective count, in spatial orbitals for RHF/ROHF and spatial pairs for GHF.
