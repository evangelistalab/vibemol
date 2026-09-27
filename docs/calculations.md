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
   canvas or **Deselect atoms** clears editing focus and preserves assigned orbitals.
3. The movable **Atomic orbitals** popup opens for one atom or a group from the same
   periodic-table row. Group controls show only shells available on every atom in
   the bundled MINAO basis. Mixed-row selections keep their highlights but suppress
   the popup; Subspace explains why. **Choose orbitals** reopens it, while **Edit**
   on an existing assignment focuses just that atom.
4. Toggle `(n,l)` shells with chips or expand p/d shells to select individual
   orbitals. Changes apply to all focused atoms. Mixed/partial choices are underlined.
   Clicking a whole shell fills it everywhere (or removes it if already full
   everywhere). A first component click replaces whole-shell choices; subsequent
   clicks add the component everywhere, or remove it when every partial choice
   already contains it. Full component sets collapse to a whole shell.
   Transition metals offer only the valence d shell and its double-shell partner,
   `nd` and `(n+1)d`: **3d and 4d** for the supported Sc–Zn series, with all five
   individual d components available. This limit also applies to group edits and
   the selection API. Other elements keep their available basis shells. Existing
   saved assignments outside this limit remain intact until explicitly removed.
5. With three or more selected atoms, the popup offers **π plane** fitting. All
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
from sessions. Deselecting or closing the popup never removes assigned orbitals;
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
Each shell uses a contour at **12% of its peak radial amplitude**, with adaptive
local bounds capped at 4 Å. These are AO shape previews, not computed molecular
orbitals. Positive and negative phases inherit the Look's surface colors and
material; a fixed 0.65 opacity keeps the structure visible.

Geometry is cached by atomic number, shell and component. Repeated atoms instance
the same geometry, and plane-directed p functions rotate a cached px pair.
Construction yields between distinct functions and cancels obsolete work.
At most 128 inactive cache entries remain; meshes needed by the live selection
are retained. Preview bounds participate in camera depth fitting.

The bundled basis matches forte2's `cc-pvtz-minao`: **H–Ar, Ca–Kr**, with only
H–Ne pruned to minimal contractions in the source. See the
[data provenance](../assets/data/basis/README.md). Unsupported elements cannot
be selected, and input generation warns about unavailable basis coverage.
The MINAO name is a text field, not a basis browser. Changing it changes the
generated input only: shells, counts and previews still refer to bundled
cc-pvtz-minao, and the panel states that explicitly. Verify shell availability
in a custom basis before running the generated script.

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
