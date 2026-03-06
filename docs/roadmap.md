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
- [x] PubChem search/import with 3D filtering and metadata display.
- [x] Preset save/load in web UI and parity-oriented preset support in Python API.
- [x] Notebook embedding + postMessage file auto-load bridge.
- [x] Edit mode baseline: move/add/delete, cursor HUD, angle snapping, undo/redo.
- [x] Bond-order inference and multi-bond rendering with aromatic ring support.
- [x] Ongoing performance/refactor passes (resource disposal, modular helpers, autoiso worker).

### Partially completed / needs hardening
- [~] Web/CLI parity is strong but not formally tracked in a compatibility matrix.
- [~] Preset reproducibility is broad, but full trajectory/vibration replay reproducibility should be explicitly validated and documented.
- [~] Dynamics quality/performance should be benchmarked with larger systems.

## Priority backlog

### 1) Dynamics and analysis
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

### 2) Builder and editing (high impact)
- [ ] Fragment-based builder v1:
  - curated fragment catalog (alkyl, phenyl, heteroaromatics, carbonyl/amide motifs)
  - anchor-based attach workflow (append, replace-H, fuse-ring)
  - click-to-place with constrained orientation and preview
- [ ] Valence-aware editing:
  - chemistry guardrails by default
  - explicit override mode for advanced users
- [ ] Constraint and cleanup tools:
  - local geometry relax after attach
  - fast cleanup for bond lengths/angles after edits
- [ ] Fragment/session persistence:
  - encode builder operations and fragment metadata in presets/sessions

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
- Finish hard gaps first: analytics overlay, export, reproducibility.
- Ship fragment-builder v1 as the next major UX unlock.
- Add quality gates (parity matrix + e2e tests) before broad feature expansion.
- Keep experimental features behind explicit opt-in toggles.
