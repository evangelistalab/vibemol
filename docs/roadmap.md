# VibeMol product roadmap

Reviewed **2026-11-19** after PR #107. Latest deployed runtime: **0.10.11** at `297e608fa88038151fa73edc10362281fc6103db`. See [current handoff](../VIBEMOL_CONTEXT.md) for test, recording and deployment references. This replaces the September branch-local roadmap; sessions are shipped, not awaiting merge.

## Current priority

[Command registry v0](api/commands.md) (additive, direct authorization; not the 0.11 bus). Preserve 37 passing / 0 failing / 37 and the intentionally empty accepted-failure set.

Goals remain fast, reproducible scientific visualization, intuitive editing and preservation of user work, through both UI and supported automation.

## Delivered

| Area | Current capability |
| --- | --- |
| Workspace | Stable multi-scene/layer identity, visibility/appearance, arithmetic dependencies and bounded grid caching. [Architecture](scene-architecture.md). |
| Persistence | Portable sessions, retained sources, autosave/recovery, validation before replacement and applied-state verification. Presets/structure transport remain complementary. [Sessions](sessions.md). |
| Measurements | Persistent distances/angles/dihedrals, live coordinate updates, undo and CSV. [Measurements](measurements.md). |
| Playback/export | XYZ trajectories, synchronized playback, vibrations, real cropped WebM from both exporters; PNG/XYZ and batch images. |
| Figures | Publication grids and pinned-browser runner with explicit readiness/environment provenance. [Composer](figure-composer.md), [runner](../api/README.md). |
| Appearance | Shared geometry/material/color/light settings, portable Looks, named libraries, Style Studio and Object/Look inspector. [Looks](appearance-looks.md). |
| Scientific ownership | Private source buffers, copy boundaries, sealing and write-trap checks. [Ownership](maintenance/private-scientific-buffers.md). |
| APIs | Validated twelve-method Edit API, strict first Testing bridge batch, export-only ASET/AVAS interchange. CAS default and approved ROHF/GHF conventions. [Edit](api/edit-build-api.md), [forte2](forte2-interchange.md). |
| 0.10.3–0.10.8 | Live formula/electron count, mode badges/Help, water tutorial, parser/recovery repairs, conjugated bond matching, UFF aromatic typing, import camera fitting and Edit target/drag/placement repairs. |
| 0.10.9 | Transition-metal site-based building, ligand/charge/bond controls, XYZ vector arrows and corrected diffuse-basis Molden normalization. [Vectors](xyz-vectors.md). |
| 0.10.10 | App-settings reset, COM/alignment/gizmo tutorial steps, compact panel tabs with close/add/options. |
| 0.10.11 | CFOUR `.freq` geometry/modes including touching signed fields; all desktop panels default right, saved placements win, compact screens retain bottom presentation. [Workbench](experiments/workbench/README.md). |

The original 0.11 paired-control census found **zero same-scope divergences**, superseding the historical five of fourteen. Keep its invariant; it did not justify starting a command bus. [Decision](maintenance/paired-controls-invariant.md).

## Paused or held

- **AI connector:** paused; shell, adapter and consent reverted from main. Preserve local prototypes/designs; never merge the prototype or widen the Edit audit for it. [Historical consent design](connector-consent.md).
- **Command bus/declarative controls:** stopped at the measurement gate. No Phase 0 or bus.
- **General undo:** design-only; existing Edit/measurement undo stays. Buffer ownership has shipped.
- **Testing wrappers after batch 1:** held, including isolated fragment-cue review. Retain `performSelectionMoveDrag` and native-click suites.
- **Browser sharding:** needs new scope and timing analysis; one Looks duration is not a stable allocation basis.
- **Placement policy #55:** justified, not scheduled. The strict guard supplies the checking/data model; runtime placement is missing. Twelve exact latent pairs are not ordinary accepted failures; coverage remains incomplete. [Audit](maintenance/coordinates-placement-policy.md), [0.11 evidence](maintenance/0.11-controls-evidence.md).
- **Runner migration #81:** Ubuntu 24.04 stays pinned. OS-key caches before unpinning, centralize the pin in that pass and recheck Figure CDP classification when moving Chrome.
- **Clamp/relocations:** preserve branches/evidence. Write-only bindings ride with the first authorized relocation, not this handoff.

Open/unclassified #42/#70, carried #71 and placement findings retain their ledger dispositions. Later passes do not close them. [The ledger](../tests/baselines/carried-defects.json) includes historical `relativeBatchPriority` text for closed #53; it is not a current work order.

## Candidate work awaiting selection

These extend working features rather than introduce missing foundations:

- **Editing:** bounded local heavy-atom relaxation after attachment/substitution, with affected-region feedback, preview/cancel and one undo action; broader clash/valence/force-field fixtures. Whole-structure UFF and hydrogen cleanup already exist.
- **Chemistry-aware starting bond distances (Build review A6).** Deferred. Build places CO on an octahedral Fe site at 2.026 Å using the generic UFF Fe–C single-bond estimate, which it also uses for bare carbon. The goal is a versioned reference library keyed by donor, binding mode, and metal environment, with measured distances and their sources. Start with terminal carbonyls and gather octahedral Fe–CO references before selecting a default for that geometry. Use one lookup for the halo preview, click and drag placement, and the Edit API, with UFF or covalent-radius estimates as fallbacks. Validate placement against independent structures. [Gas-phase Fe(CO)₅ measurements](https://pubmed.ncbi.nlm.nih.gov/11300842/)
- **Integration:** Web/CLI/notebook/VS Code compatibility, packaging provenance, schema compatibility and automation use cases. Connector restart/interchange import require separate scope.
- **Scientific validation/performance:** repeatable timing/memory and chemistry measurements, repeated disposal checks and accuracy documentation. UFF heteroaromatic equalization is a known approximation.
- **Analysis/export:** physical trajectory time, stable-mapping RMSD, trajectory reports, deterministic frame sequences/CLI movies, general synchronized comparisons and recent-session access. Persistent measurements, CSV, Figure grids and real WebM completion already exist.

Reaction Guess Camera and VibeDJ remain unscheduled ideas. No old phase label or unchecked item selects a release scope.

## Delivery discipline

Report the mechanism before product changes. Keep units below 15 dependencies; audit construction order on extraction. Run every local audit before pushing a product candidate. Require all 37 suites, completion counts, captures twice/exact repeat, cache identities, units, WebKit, construction and the 260-binding AST ratchet.

Preserve failures and log comparands. Retries, accepted failures and capture changes require authorization. Capture approvals enumerate exact changes with zero residual difference. Enumerate intended visible changes individually, holding everything else to the accepted captures; the old 0.10.0 zero-visible-change promise does not describe a feature release.

Pushing main publishes production; beta is retired. Follow local merge/tree and deployment verification in [AGENTS](../AGENTS.md) and [asset versioning](asset-versioning.md).
