# VibeMol — Context for the next agent

This document is the institutional memory for VibeMol's development. It captures what's been built, what's been decided, what's open, and what to do next. Read this end-to-end before touching code.

---

## What VibeMol is

VibeMol is a browser-based molecular visualization and editing tool. Vanilla JavaScript, Three.js r160, WebGL2. Served via a local Python HTTP server during development; deployed to **vibemol.org**. Built by Francesco Evangelista (Emory University, computational chemist, DSRG/UCC/selected-CI research). Tightly aligned with the Forte/QForte quantum chemistry stack the group develops.

The product has reached genuine capability after Phase 1 (per-scene scoping and core data model) and Phase 2 (arithmetic combinations, multi-trajectory, drag gestures, polish). It's no longer "a viewer" — it's a tool you can do real work in.

Current version: **v0.8.7t** (or whichever was latest at the time of compaction).

### What it can do today

- Load any combination of cube files, trajectories, molecule files. Auto-dispatch them into appropriately scoped scenes (per Phase 1's "different molecule = new scene" rule).
- Render orbitals with multiple material presets (Emissive, Matte, Satin, Lacquer, Metal — the Solid material system that replaced the failed Glass approach), color schemes, render modes.
- Compose orbitals via arithmetic — Linear combinations, Products, Abs — with auto-resampled grids when operands have mismatched grids.
- Edit existing arithmetic combinations in place with downstream auto-recompute.
- Multi-select layers, multi-edit appearance, cascade-delete with full dependency tracking.
- Play multiple trajectories simultaneously, frame-locked sync optional, with master/follower clock model.
- Reorder layers via drag, merge between scenes via drag, duplicate via shift-drag.
- Inline rename anything renameable; right-click any kind for kind-appropriate actions.
- `+` button next to SCENES opens an "Add cube file..." menu.
- Auto-focus newest item on add (the just-added thing becomes active/visible/focused).
- Auto-hide other scenes on add (only the focused scene renders; user can re-enable manually but next add resets).

### What it can't do yet

- Persist anything across reloads. Every refresh starts from zero. (Phase 3 territory.)
- Measure anything (distances, angles, integrals, plots along trajectories). Measurements group is a placeholder. (Phase 3.)
- Export figure-quality output (high-res screenshots, video, POV-Ray). (Phase 3.)
- Integrate with QC backends (Forte/QForte direct hooks, job submission, cloud QC). (Phase 3, most ambitious.)
- Be properly tested or documented. Test coverage hasn't kept pace with feature shipping. (Phase 3 stabilization.)
- Multi-user / collaborative anything. (Deferred indefinitely.)

---

## Architecture & key invariants

These are load-bearing decisions. Don't violate them without explicit conversation.

### Bond orders are the sole ground truth

Hybridization, geometry, and coordination are always derived. Formula:
```
adjustedVE = ve − formalCharge
lonePairs = (adjustedVE − projectedBV) / 2
stericNumber = fullBondCount + lonePairs   → VSEPR lookup
```

Coordination geometry rules: general `min(ve, 8−ve)` for main-group base valence; step-of-2 hypervalent extensions for period ≥ 3; hardcoded exception tables for groups 13–14 and transition metals. 11 geometries from CN=1 through CN=8 fully implemented with passing test suites (`coordination.js`: 155 tests; `geometry-inference.js`: 92 tests).

### Per-scene scoping is non-negotiable

Each scene wraps one molecule and its associated cubes/trajectories. Selection, multi-edit, arithmetic operands, and the trajectory popover all scope per-scene. The "different molecule = new scene" dispatch rule is what enables this. Don't break it without rewriting the data model.

### Bonds are first-class data; perception is a utility service

Bond orders and connectivity are stored explicitly in the molecule's data, not re-derived on every render. Bond perception (auto-detect from atom positions) is a utility for new molecules; once a bond is in the data, it stays.

### Frame-locked sync over time-normalized

When trajectories of different lengths are sync'd, master.frame is monotonic and each trajectory shows `master.frame % traj.length` (with optional clamp if loop is off). Time-normalized sync (mapping all trajectories to [0,1]) was rejected as confusing UX.

### Build-once, update-in-place for the trajectory popover

The trajectory popover was rewritten to build its DOM once and update only attributes/values on tick or state change. NEVER rebuild children on every frame. This was a major performance and correctness fix; verified zero `childList` mutations during 3-second playback. Don't regress this.

When the user is actively editing an input (`document.activeElement === fpsInput`, or slider `:active`), don't overwrite their value from the tick. Their edit is the source of truth until blur/release.

### Cube data binding is per-layer, not per-label

Cube volume data must be keyed on the layer's stable ID (or scene + layer position), never on label like "L0". Earlier bug: the second scene's L0 was rendering the first scene's L0 data because of a label-keyed cache. Fixed in commit `08bce69` (v0.8.7r). Record-backed cube layers resolve render data from `record.vol`, not stale `layer.cubeData`. Layer-owned data is retained only for arithmetic layers and duplicates.

### Session-only state

Per-layer state (iso, preset, color scheme, name, visibility) is intentionally session-only. No persistence across reloads. This matches Phase 1's data model and keeps things simple. Persistence is Phase 3 territory and needs its own design (schema versioning, IndexedDB, conflict resolution).

### Material system: Solid, not Glass

Glass material was abandoned after repeated failures. Root cause: Beer-Lambert absorption asymmetry between bright gold (`#f2a900`) and very dark navy (`#0033a0`, brightness ≈ 0.18, not the assumed 0.37). Replaced with a Solid material system (Emissive / Matte / Satin / Lacquer / Metal, plus Gel and Ceramic candidates).

### Design tokens

Emory brand colors: gold `#f2a900`, navy `#0033a0`. Geist/Geist Mono is the default font pair; Inter and IBM Plex alternatives are supported app preferences. Use the shared font and color tokens for consistent UI styling.

### Tech stack constraints

- Vanilla JavaScript, no bundler.
- Three.js r160 (NOT r142+). Don't use `THREE.CapsuleGeometry` (r142+) or `THREE.OrbitControls` (unavailable). Use `CylinderGeometry`, `SphereGeometry`, or custom geometries instead.
- WebGL2.
- Local Python HTTP server during dev.

### Testing infrastructure

- All code targets ES modules with explicit exports.
- Inline test suites where they exist (coordination.js, geometry-inference.js).
- E2E smoke test: `tests/e2e/smoke.py`. Run with `VIBEMOL_SMOKE_VERBOSE=1`.
- `make check` and `make test-unit` are the standard commands.
- No comprehensive UI/visual regression test coverage yet — this is a known gap.

### Browser automation for QA

Claude in Chrome MCP can drive the browser for live testing, but it's intermittently flaky in long sessions. Patterns that work:
- Load methane sample via "Open methane valence orbitals" link
- Inject synthetic cube files via `document.getElementById('fileInput').files = dataTransfer.files; fi.dispatchEvent(new Event('change'))` to simulate file drops
- Track DOM mutations via MutationObserver to verify build-once architecture
- A `window.__vmqa` test harness pattern: `{ snap(), rowByLabel(label), errors[] }` is consistently set up by the agent at session start

Source line numbers shift as code changes — always re-search by function name rather than using cached line numbers.

When app.js logs are scrubbed by the classifier, return character-code arrays (`charCodeAt`) instead of raw strings.

---

## Phase 1 — Done

Per-scene scoping, the dispatcher rule (different molecule = new scene), the core scene-graph data model, the outliner with its kind-aware rows. This is the foundation everything else sits on. Don't second-guess Phase 1 invariants.

---

## Phase 2 — Done

Five sub-clusters all shipped:

### 2a — Layered cubes
- **2a-1**: Per-cube-layer properties + Duplicate gesture
- **2a-2**: Multi-select infrastructure + multi-edit + multi-delete
- **2a-3**: Arithmetic combine layers (Linear combination, Product, Abs)
- **2a-4**: Auto-resample for mismatched grids (trilinear interpolation, finest-bounding-box target, zero-extrapolation outside operand grids)
- **2a-5**: Edit existing arithmetic + auto-recompute downstream

### 2b — Multi-trajectory + sync
Two-clock model: per-scene independent vs sync master. Frame-locked sync with modulo wrap. RAF tick loop. Sync controls disable on sync'd rows. Master Reset button. Header Play/Reset are global. Build-once update-in-place architecture for the popover (the major rewrite — see Architecture section).

### 2c-1 — Inline rename + `+` button + right-click on all kinds
Double-click to rename; rename works on cubes, arithmetic layers, scenes, trajectory scenes, molecules. Group rows are NOT renameable. `+` button next to SCENES opens "Add cube file..." menu. Right-click extended to Molecule rows, Orbitals group headers, scene wrappers, trajectory scenes — each with kind-appropriate items.

### 2c-2 — Drag gestures
Drag-reorder within a group (with label renumbering). Drag-merge between scenes (rejected on molecule mismatch with toast). Shift-drag duplicate. Multi-select drag preserves order. Eye icons and rename inputs have `draggable="false"` to prevent accidental drag from interactive children.

### Polish bundles
Multiple polish PRs shipped along the way:
- Sync controls disable correctly when row is sync'd
- Trajectory popover widened (Sync label no longer clipped)
- `[CUBE]` debug logs guarded behind `window.VIBEMOL_DEBUG_CUBE` flag
- Scene wrapper names stable across active-layer changes and graph rebuilds; also preserve user-renamed names
- Trajectory scene meta shows "N frames" not "N atoms"
- Cube data leakage between scenes fixed (commit `08bce69`, v0.8.7r)
- Auto-focus newest item on add
- Auto-hide other scenes on add (every add cascades)

---

## What's open RIGHT NOW (the live thread when this context was captured)

The user (Francesco) was working through the "Add file" toolbar button. Conversation arc:

1. Francesco asked: when adding a file, only the newest should be visible; he was getting accumulation. → Drafted "auto-hide other scenes on add" prompt; agent shipped it.
2. Francesco tested; reported it didn't work consistently. → I tested at v0.8.7t and found the cascade DID work for new-scene loads and duplicates. Then I started testing same-molecule append.
3. Francesco redirected: he was actually pointing at the "Add file" toolbar button (icon `note_add`, file-with-plus glyph at toolbar coord ~50,127, distinct from the "Open file" `upload_file` button at ~14,127 and the SCENES `+` at ~301,164).
4. I drafted a "force new scene" interpretation. Francesco corrected me: the actual intent is **"Create new molecule"** — start a brand-new empty scene for editing, switch to Edit mode, render nothing.
5. I drafted a complete prompt for that interpretation. **The prompt was finalized but NOT yet sent to the agent.** It's the immediate next action item.

The full final prompt is in the conversation transcript; I'll summarize it inline below in "Next concrete actions."

---

## Phase 3 — The strategic conversation (parked)

Phase 2 is done. Phase 3 is "what kind of product VibeMol becomes." Five candidate directions discussed extensively but not yet committed:

### Direction A — Persistent state
Autosave per-layer state, named sessions, IndexedDB-backed sessions, JSON export/import, URL-hash state for simple cases. Most foundational. Affects everyone. Requires schema versioning. Estimated couple months of focused work.

### Direction B — Measurements and analysis
Distances, angles, dihedrals, isosurface integrals, difference-density integrals, plot panel along trajectory frames, CSV export. Most aligned with chemistry research workflows. Less flashy than rendering features, more useful for paper-writing.

### Direction C — Rendering quality and export
High-res screenshot, video/GIF export, POV-Ray/Blender export, camera bookmarks, animation paths, better materials (subsurface scattering, more transparency). Best for publication figures.

### Direction D — QC integration
Direct integration with Forte/QForte. Submit jobs from VibeMol. Pull from cloud QC. Templates for NTOs, EDA, IBO, etc. Maybe a Python kernel for custom analysis. Most ambitious; multi-quarter; transforms the product. Forces architectural decisions that propagate everywhere.

### Direction E — Polish/stabilization
Stop adding features for a quarter. Comprehensive test coverage, accessibility, performance (large molecules, long trajectories), documentation, browser compat (only Chrome tested currently). Unsexy but the right call before D.

### Direction F — Collaboration
Multi-user, sharing, comments, real-time co-viewing. Adds backend infrastructure VibeMol doesn't currently need. Actively deferred.

### My read
- **A is the most natural next step.** Phase 2 made VibeMol capable; without persistence, users can't keep what they make.
- **E is the most responsible next step.** Phase 2 shipped fast and bug surface needs hardening before real research use.
- **A and E together** would be the strongest combination if pursuing two.
- **D is the strategic long-term direction** if VibeMol's role is the visualization layer of the Evangelista group's research stack.

Three questions that decide:
1. Who's actually using VibeMol right now and for what?
2. Is there a near-term external event (conference, paper, demo)?
3. What's the loudest user complaint?

Francesco hasn't picked a direction yet. Don't start Phase 3 work until he does.

---

## Open items (discussed but never implemented)

Things that came up across the conversations but were deferred or never made it into a prompt:

### Beta channel infrastructure (advice given, not implemented)
Recommended: `beta.vibemol.org` subdomain (separate origin = isolated localStorage; matches what every major product does). Setup via Cloudflare Pages / Vercel / Netlify with branch-based subdomains, OR Emory server vhost. Build-time `CHANNEL` constant flipped via `sed` in deploy script. BETA badge in UI. Version string includes channel suffix. Branch model: feature → beta → main; promote regularly.

### "Create new molecule" button — DRAFTED, NOT SENT
The next concrete action when Francesco resumes. See "Next concrete actions" below.

### Phase 2c-3 — Arithmetic ergonomics (deferred indefinitely)
- Visual indicator for arithmetic dependencies (hover an arithmetic layer, briefly highlight its inputs)
- Keyboard shortcut for Combine popover (Cmd+K)

Both are nice-to-have. Defer until users complain.

### Composable Abs (dropped permanently)
Abs as a unary operation works. Composable Abs (e.g., `|L0 + L1| − |L2 + L3|`) was discussed and explicitly dropped. Don't re-add without conversation.

### FPS clamp-to-max-on-blur (minor, not critical)
The FPS input doesn't clamp to max=120 on blur; values like 999 stick. Spec mentioned this as a suggestion. Not critical.

### Draft Operand reordering in Combine popover (deferred)
For non-commutative operations. Phase 2c-2 didn't include this; it's listed in 2c-3 territory.

### Scene-creation menu beyond "Add cube file..." (deferred)
The `+` button's menu currently has just one item. Future expansions discussed: "New combined layer...", "Add measurement", etc. Wait until users have a clear need.

### Persistent dismissal of trajectory popover (session-only by design)
The flag tracking "user closed the trajectory popover" is session-only. Persistence across reloads is part of Phase 3 / Direction A.

### Manual reopen of closed trajectory popover via toolbar (lightly handled)
There's a toolbar Trajectory toggle. The auto-open-on-first-trajectory and auto-close-on-last-removed behaviors cover the common case. If improvements are needed, they're polish-level.

---

## Working patterns Francesco prefers

After many sessions:

- **Deep technical analysis with concrete recommendations**, not high-level options menus. Don't ask 5 questions; pick a direction and explain the trade-offs.
- **Visual/iterative validation**: screenshots and demos before committing to implementation. Show, don't just describe.
- **Diagnose root causes via source inspection**, don't guess. When a bug surfaces, the expected workflow is: search source for the relevant function, read it, identify what's wrong, prescribe a fix.
- **Direct unambiguous feedback** is normal. Push back on ideas with reasons.
- **"Dream big" on interaction design** is welcomed, but proposals must survive critical UX scrutiny. Don't propose gesture-based editing as a real plan (rejected once already as too hard to learn).
- **Inline test suites** for new modules with non-trivial logic. Match the pattern in coordination.js / geometry-inference.js.
- **Verification via QA harness** at end of each shipped feature: load methane sample, exercise the new path, confirm via DOM inspection or visual check, report what passes and what fails.

---

## Next concrete actions (in order)

### 1. Send the "Create new molecule" prompt (it's drafted, ready)

The toolbar button currently labeled "Add file" (icon `note_add`, file-with-plus glyph at toolbar coord ~50,127, near the "Open file" button) should be repurposed. Click does NOT open a file picker. Instead:

1. Creates a new empty scene immediately, in-process. Default name "New molecule" (or auto-incrementing "Molecule N"). The scene contains an empty Molecule child (zero atoms) and an empty Orbitals group (zero cube layers).
2. The new scene's wrapper visibility is OFF (eye-crossed) — nothing renders.
3. Other scenes auto-hide per the existing cascade rule.
4. The new scene becomes focused.
5. Side panel auto-switches to Edit mode (whatever the existing Edit tab offers — atom palette, fragment library, etc.).
6. Rename the button: aria-label and tooltip become "Create new molecule" (or "New molecule" if shorter is preferred). Icon stays `note_add` or change to `science`/`add_circle`.

The full prompt with verification steps is in the conversation transcript right before the compaction request. If you can't find it, ping Francesco — but the summary above covers the load-bearing pieces.

### 2. After "Create new molecule" ships, ask Francesco about Phase 3 direction

Phase 2 will be fully complete after this small button rewire. Then it's time for the Phase 3 strategic conversation. Walk Francesco through directions A–E, ask the three triage questions, recommend a starting direction.

### 3. Don't start Phase 3 work until Francesco picks a direction

He hasn't committed yet. Don't draft a Phase 3a prompt unprompted.

---

## Things to NOT do without explicit conversation

- Add backend infrastructure (collaboration, server-side rendering, anything that's not static-site).
- Switch tech stacks. Keep vanilla JS, Three.js r160, Python local server.
- Modify the data model invariants (per-scene scoping, bond-order ground truth, frame-locked sync).
- Re-add Glass material (failed; Solid replaced it for good reasons).
- Re-add composable Abs.
- Implement persistence (IndexedDB, localStorage, anything across reloads) — that's a Phase 3 design conversation, not a small PR.
- Use synthetic shift-drag tests to verify "shift-drag duplicate" — the Chrome MCP `left_click_drag` modifier parameter doesn't reliably hold shift through the drop. Verify by hand instead.
- Decide on Phase 3 direction without Francesco. He's the product owner.

---

## Files and locations to know

- `assets/app/js/app.js` — main application code (large file, search by function name)
- `assets/app/js/arithmetic-grid.js` — arithmetic compute (added in Phase 2a-4)
- `assets/app/js/coordination.js` — VSEPR/coordination geometry (155 tests, all passing)
- `assets/app/js/geometry-inference.js` — geometry inference (92 tests, all passing)
- `tests/e2e/smoke.py` — E2E smoke test
- `Makefile` — `make check`, `make test-unit`
- Sample cubes: `/assets/data/methane/canonical_1.cube` etc.
- Test cubes (when you generate them for QA): `/mnt/user-data/outputs/test_cubes/`

---

## Closing note

VibeMol is in genuinely good shape. Phase 2 delivered a coherent, capable product. The architecture is sound. The bug rate is low. The remaining work is choosing what kind of product it becomes next, and that's Francesco's call.

When in doubt: ask, then act. Francesco's feedback is direct and worth listening to closely.
