# VibeMol Product Roadmap

This is a living roadmap. It tracks what is shipped, what still needs hardening, and what should come next.

## Product goals
- Make molecular visualization fast, reproducible, and beautiful.
- Support both exploratory work (UI) and scripted pipelines (CLI/notebooks).
- Keep editing/building intuitive for first-time users and efficient for experts.
- Treat chemistry-aware editing as a first-class workflow rather than an afterthought.

## Status snapshot

### Completed
- [x] Multi-frame XYZ trajectory playback (play/pause, frame scrub, FPS, loop).
- [x] Vibrational mode playback with imports from sidecar JSON, ORCA `.hess`, and Psi4 outputs.
- [x] Molden import with MO selection, grid controls, and MO-to-grid rendering.
- [x] PubChem search/import with 3D filtering and metadata display.
- [x] Preset save/load in web UI and parity-oriented preset support in Python API.
- [x] Drag-and-drop preset JSON import.
- [x] Notebook embedding + postMessage file auto-load bridge.
- [x] Edit mode baseline: move/add/delete/transform, angle snapping, undo/redo, atom numbering, and new-file flows.
- [x] Quaternion view rotation across display, measure, and edit background drags.
- [x] Imported nonmetal bond-order inference with aromatic six-ring display support.
- [x] Metal-aware bond inference and editing with persistent bond styles and per-metal override modes.
- [x] Symmetry tool in edit mode: point-group detection, approximate fits, preview/apply symmetrization, and 3D symmetry-element visualization.
- [x] Coordinates window inline editing for atom order, element type, and Cartesian coordinates.
- [x] Surface hover metrics for normalized orbital-like grids.
- [x] Coordinates-only XYZ import/paste normalization (symbol or atomic-number first column).
- [x] Explicit Build palette and selection `+` build cue for gated open-site placement.
- [x] Post-delete frontier hydrogen repair and lower-valence replacement pruning in edit mode.
- [x] Cloud rendering with both `Cubes` and `Points`, plus WBOIT-backed cloud transparency where supported.
- [x] Two-component split-view polish: math-aware quantity labels, centered `α/β` overlays, and quantity-aware spinor info popover.
- [x] Optional molecule self-shadowing in appearance controls.
- [x] Gradient-based isosurface normals for standard and 2C surfaces (replacing triangle-averaged marching-cubes normals).
- [x] Weighted blended order-independent transparency (WBOIT) for transparent isosurfaces, with fallback on unsupported renderers.
- [x] Ongoing performance/refactor passes (resource disposal, modular helpers, autoiso worker).

### Partially completed / needs hardening
- [~] Web/CLI parity is strong but not formally tracked in a compatibility matrix.
- [~] Preset reproducibility is broad, but full trajectory/vibration replay reproducibility should be explicitly validated and documented.
- [~] Dynamics quality/performance should be benchmarked with larger systems.
- [~] Builder core is present and usable, but still needs polish:
  - external XYZ-backed fragment catalog + manifest loader
  - fragment attach workflow for starter groups
  - standalone molecule placement with click/drag rotate and axis alignment
  - selection-driven build cue for open-site and replaceable-H targets
  - style-consistent preview/ghost rendering across edit/build workflows
  - still missing stronger first-class fragment/molecule identity, replay/session persistence, and more advanced fuse-ring workflows
- [~] Symmetry is shipped, but still needs deeper chemistry validation on larger and lower-symmetry systems.
- [~] Metal-aware bonding is shipped, but the heuristics and rendering should be hardened on a wider set of coordination complexes.

## Priority backlog

### 1) Builder and editing
- [ ] Builder hardening:
  - split catalog semantics cleanly into `atoms`, `fragments`, and `molecules`
  - finish anchor-based attach workflow polish (`append`, `replace-H`, `fuse-ring`)
  - improve preview and commit/cancel clarity for standalone molecules and build-cue driven add targets
  - add session/preset persistence for builder operations and fragment metadata
- [ ] Chemistry guardrails and override UX:
  - clearer advanced override affordances for unusual valence/edit cases
  - better visibility into why a bond/add target is or is not allowed
- [ ] Cleanup and local relaxation:
  - stronger local heavy-atom cleanup after fragment or substitution edits
  - faster, more predictable geometry cleanup for common editing actions
- [ ] Group transforms:
  - move/rotate disconnected molecules and tagged fragments as first-class actions
  - continue improving rotation ergonomics, pivots, and selection feedback

### 2) Symmetry and analysis
- [ ] Symmetry hardening:
  - broader point-group coverage and validation on more distorted structures
  - more benchmark fixtures for approximate fits and symmetrization stability
  - stronger UI guidance for what changed after preview/apply
- [ ] Trajectory analytics overlay:
  - frame index + time readout while playing
  - optional live bond length/angle/dihedral
  - RMSD trace vs selected reference frame
- [ ] Trajectory export:
  - PNG sequence export
  - one-click animated export (GIF/MP4/WebM) in web and/or CLI path
- [ ] Preset + movie reproducibility:
  - serialize playback state (fps, loop, selected frame, camera path, overlays)
  - deterministic replay from preset/session bundle

### 3) Workflow UX and productivity
- [ ] Session autosave/recovery (`.vibemol-session`) and crash-safe restore.
- [ ] Side-by-side compare mode with shared/synced camera.
- [ ] Measurement report export (CSV/JSON over trajectory).
- [ ] Onboarding upgrades:
  - recent files quick access
  - task-oriented startup presets (`publication`, `teaching`, `analysis`, `builder`)
- [ ] Documentation hardening:
  - explicit compatibility matrix (Web / CLI / Notebook)
  - clearer user-facing docs for symmetry, metal bonding, and builder workflows

### 4) Platform quality and best practices
- [ ] End-to-end regression suite for:
  - file import families
  - style/mode switches
  - builder flows (atom/fragment/molecule placement, transform, undo/redo)
  - symmetry workflows
  - metal-bond workflows
  - transparent-surface rendering (WBOIT activation/fallback and split 2C coverage)
  - trajectory/vibration playback
  - preset round-trip and compatibility aliases
- [ ] Performance budgets + telemetry hooks:
  - frame-time targets by atom count
  - memory/resource leak checks on repeated loads
- [ ] API stability policy for preset schema and embed messaging contracts.

### 5) Experimental / opt-in
- [ ] Reaction Guess Camera:
  - auto-frame most active region over trajectory
  - smooth pan/zoom to reaction center
- [ ] VibeDJ mode:
  - procedural audio + motion-linked visual pulses
  - clearly marked experimental and off by default

## Delivery approach
- Keep builder/editing hardening first, because it still has the highest complexity and the most user-visible edge cases.
- Treat symmetry and metal-aware chemistry as shipped features that now need hardening, validation, and UX refinement rather than basic implementation.
- Expand quality gates in parallel with feature work so regressions are caught earlier.
- Keep experimental features behind explicit opt-in toggles.
