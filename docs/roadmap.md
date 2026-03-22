# VibeMol Product Roadmap

This is a living roadmap (not tied to a single version). It tracks what is shipped, what is in progress, and what should come next.

## Product goals
- Make molecular visualization fast, reproducible, and beautiful.
- Support both exploratory work (UI) and scripted pipelines (CLI/notebooks).
- Keep editing/building intuitive for first-time users and efficient for experts.

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
- [x] Bond-order inference and multi-bond rendering with aromatic ring support.
- [x] Coordinates window inline editing for atom order, element type, and Cartesian coordinates.
- [x] Surface hover metrics for normalized orbital-like grids.
- [x] Ongoing performance/refactor passes (resource disposal, modular helpers, autoiso worker).

### Partially completed / needs hardening
- [~] Web/CLI parity is strong but not formally tracked in a compatibility matrix.
- [~] Preset reproducibility is broad, but full trajectory/vibration replay reproducibility should be explicitly validated and documented.
- [~] Dynamics quality/performance should be benchmarked with larger systems.
- [~] Builder core is now present but not finished:
  - external XYZ-backed fragment catalog + manifest loader
  - fragment attach workflow for starter groups
  - standalone molecule placement with click/drag rotate and axis alignment
  - transform tool now supports bond-side selection, additive selection, and explicit rotate modes
  - still missing stronger first-class fragment/molecule identity, fuse-ring operations, replay/session persistence, and cleanup/relax

## Priority backlog

### 1) Builder and editing (highest priority)
- [ ] Fragment-based builder v1 hardening:
  - split catalog semantics cleanly into `atoms`, `fragments`, and `molecules`
  - finish anchor-based attach workflow (`append`, `replace-H`, `fuse-ring`)
  - improve placement UX for standalone molecules (preview polish, explicit rotate/align affordances, commit/cancel clarity)
  - add session/preset persistence for builder operations and fragment metadata
- [ ] Valence-aware editing:
  - chemistry guardrails by default
  - explicit override mode for advanced users
- [ ] Constraint and cleanup tools:
  - local geometry relax after attach
  - fast cleanup for bond lengths/angles after edits
- [ ] Group transforms:
  - move/rotate disconnected molecules and tagged fragments as first-class actions
  - continue improving rotation ergonomics and pivot/orientation feedback in the editor

### Immediate next work
- [ ] Finish builder hardening around attach policies, fragment/molecule identity, and fuse-ring authoring.
- [ ] Replace the remaining transform ambiguity with explicit fragment-vs-molecule targeting rules and clearer rotation behavior.
- [ ] Expand the coordinates window from inline edits to richer selection/inspection workflows.
- [ ] Add regression coverage for editor state changes, coordinate edits, `.hess` companion warnings, and Molden MO rendering.

### 2) Dynamics and analysis
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
- [ ] Trajectory storyboard (keyframe thumbnails + captions).
- [ ] Measurement report export (CSV/JSON over trajectory).
- [ ] Onboarding upgrades:
  - recent files quick access
  - task-oriented startup presets (`publication`, `teaching`, `analysis`, `builder`)

### 4) Platform quality and best practices
- [ ] Feature parity matrix (Web / CLI / Notebook) with explicit support status.
- [ ] End-to-end regression suite for:
  - file import families
  - style/mode switches
  - builder flows (atom/fragment/molecule placement, transform, undo/redo)
  - trajectory/vibration playback
  - preset round-trip and compatibility aliases
- [ ] Performance budgets + telemetry hooks:
  - frame-time targets by atom count
  - memory/resource leak checks on repeated loads
- [ ] API stability policy for preset schema and embed messaging contracts.

### 5) Experimental / quirky (opt-in)
- [ ] Reaction Guess Camera:
  - auto-frame most active region over trajectory
  - smooth pan/zoom to reaction center
- [ ] VibeDJ mode:
  - procedural audio + motion-linked visual pulses
  - clearly marked experimental and off by default

## Delivery approach
- Finish builder hardening first: catalog split, attach policies (`append` / `replace-H` / `fuse-ring`), cleanup/relax, builder persistence.
- After builder v1 is solid, move to dynamics overlays/export/reproducibility.
- Add quality gates (parity matrix + e2e tests) before broad feature expansion.
- Keep experimental features behind explicit opt-in toggles.
