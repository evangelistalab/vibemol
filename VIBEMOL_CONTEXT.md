# VibeMol — current handoff

Reviewed **2026-11-19**. This replaces the old v0.8.7t handoff, whose pending-feature list and ES-module instructions were obsolete. [AGENTS.md](AGENTS.md) holds standing instructions and historical evidence; [the roadmap](docs/roadmap.md) separates shipped work from candidates.

## Release and verification state

| Item | Verified reference |
| --- | --- |
| Latest deployed runtime | **0.10.11**, `297e608fa88038151fa73edc10362281fc6103db`, PR #107 |
| Tested source head | `042a319a2cbf8378e96288c9e0a9085f0081c893`; local merge tree matched exactly |
| Complete pre-merge checks | [44562324565](https://github.com/evangelistalab/vibemol/actions/runs/44562324565): **37 passing / 0 failing / 37**, intentionally empty accepted set; both exporters and both Looks material-family paths completed |
| Pages publication | [44569217520](https://github.com/evangelistalab/vibemol/actions/runs/44569217520): build, deploy and report-build-status succeeded; published the merge commit above |
| Separate post-push main checks | [44569217313](https://github.com/evangelistalab/vibemol/actions/runs/44569217313), same merge commit; **still running when this handoff was prepared**. Read the actual result before claiming it passed; do not retry a failure. |
| Existing `v0.10.11` tag | `2d594bb6be90fd2893e3df8abbaf11c422616962`, the original CFOUR release, before the approved same-version patch |

Documentation-only commits can follow the runtime commit. Check refs rather than resetting to a SHA in a handoff. The tag and current deployed tree deliberately differ for this patch; do not move the tag. `v0.9.5-pre-refactor` remains the immutable anchor at `1c609b33`; older tags also stay put.

The failed first panel-patch run [44402656735](https://github.com/evangelistalab/vibemol/actions/runs/44402656735) remains failed at 36/1/37. Measure activates Measurements in the shared right dock, so the test's Coordinates Copy target was hidden. The repair selects Coordinates through its native tab and logs visibility before unchanged row-action assertions. No timeout or assertion was relaxed.

The approved capture delta was exactly **1,214 changed values across 102 captures**: 844 DOM/control values, 268 viewport dimensions and 102 aspect-related projection entries. Zero added/removed leaves or unrelated differences; scientific settings and sessions stayed exact. [Recording 44555184151](https://github.com/evangelistalab/vibemol/actions/runs/44555184151) reproduced it on two workers, twice each. Its scoped recorder remains on `codex/record-right-panel-defaults-0.10.11`; only generated comparisons were merged. This is historical authorization, not permission for another recording.

Local logs are under `out/test-artifacts/right-panel-defaults-0.10.11/` and `out/test-artifacts/cfour-0.10.11/`. Ignored artifacts are not portable documentation; linked CI runs and committed comparisons are the durable references.

## Current product choices

**Panels.** All 12 catalog panel types default right on desktop, including Coordinates, Trajectory and Frequencies. Valid saved right/bottom/floating placements win. Storage does not distinguish automatic persistence from a deliberate placement, so existing layouts are preserved without migration. Compact screens present panels at the bottom while retaining desktop choices. Tabs contain the vertical grip, title and small close control in one selected surface, followed by add-panel/options controls on the same rail. See [Workbench](docs/experiments/workbench/README.md).

**CFOUR frequencies.** `.freq` imports geometry and Cartesian mode vectors from one file. Both convert bohr to Å once; no extra mass-unweighting. One to three modes per block, D exponents, imaginary frequencies and touching signed displacement fields are supported. Symmetry labels survive. Malformed input fails before replacing a scene. See [the format](README.md#web-quick-start) and [sample](tests/fixtures/cfour.freq).

**Settings/tutorial.** App settings includes reset-to-defaults, preserving loaded data and saved named libraries/layouts. The reusable water tutorial follows panel positions and covers loading, navigation/panning, Properties Object/Look, Coordinates, measurement, XYZ copy/paste, COM, principal-axis alignment and the camera gizmo. COM/alignment changes geometry; gizmo clicks change the camera.

**Edit and chemistry.** Build and Transform are tools within Edit. Transform-only floating controls disappear in Build; hint labels distinguish the tools. The edit target must be visible. Atom drags create one appropriately named undo action; Escape cancels an active drag. Metal building exposes and snaps to open coordination sites, respects capacity, and supports donor attachment, X/L ligand choices, formal charges and metal-bond styles. UFF is approximate: resonant typing avoids gross aromatic distortion but can equalize five-membered heteroaromatic bonds by about 0.05 Å. Do not promise quantum-geometry accuracy.

**Scientific input.** Cube parsing separates datasets, honors signed voxel units, rejects invalid tokens and accepts D exponents. XYZ accepts atomic numbers, D/T as ordinary hydrogen, numbered labels and Bq as dummy. Molden normalization was corrected using independent diffuse-basis cube comparisons; retain those tests for AO evaluation. XYZ supports [vector arrows](docs/xyz-vectors.md). Properties → Object → Structure shows a live subscript formula and electron count, with “neutral assumed” when charge is absent.

**Shortcuts.** `V` selects View, `E` Edit and `M` Measure. In View/Measure, `C` opens Coordinates and `Q` Quick actions; Camera is a panel, not the V shortcut. The old global bare S/B/I/A bindings were retired. In Edit, `Shift+R` moves COM to origin, `P` aligns principal axes, `O` optimizes, `S` opens Symmetry, `/` selects Build/focuses search, and Space previews/applies hydrogen adjustment. Text-entry and clipboard guards take precedence. Live Help is the detailed reference.

## Already delivered — do not schedule as new features

- Portable [sessions/recovery](docs/sessions.md), retained sources and validate-before-commit restoration with requested/applied readbacks. Presets and single-structure exports are narrower formats.
- Persistent [measurements](docs/measurements.md), undo, CSV and trajectory-linked updates.
- Publication [Figure grids](docs/figure-composer.md) and a supported [headless runner](api/README.md). Explicit readiness waits for a stable presented view including depth limits; jobs pin/record browser, viewport, scale, theme and typeface. One teardown owner and an explicit completion boundary are required.
- Private scientific-buffer ownership and standing write traps, including [session-capture independence](docs/maintenance/private-scientific-buffers.md).
- Twelve-method validated [Edit API](docs/api/edit-build-api.md). Selection writes validate the whole request; builds reject unsupported sources. Testing functions were requirements evidence, not an API to expose wholesale.
- Export-only [forte2 interchange](docs/forte2-interchange.md); **CAS is default**. ROHF includes singly occupied orbitals in both CAS totals for either sign of ms. GHF CAS counts spinors directly; other methods retain spatial-pair counting. GHF input uses `System(x2c=X2CParams(x2c_type="so"))`. Francesco signed off these conventions. No execution or interchange import.
- Native trajectory/vibration WebM export, PNG/XYZ and batch images. Both video completion paths are mandatory in Smoke.

## Architecture and checks

- **Classic scripts in fixed order, no bundler or ES modules.** Globals are deliberate contracts; inspect `index.html` before moving scripts.
- Source/scene/layer identity is stable, not filename-based. Per-layer grid keys include source/orbital/geometry/settings. Stored topology/annotations remain authoritative after import; perception is explicit, not a render-loop operation. Stored conjugated matching is separate from decorative aromatic-ring detection.
- Keep selection, editing and playback per scene. Trajectories synchronize to the scene master frame with loop/clamp policy, not normalized time fractions. Update drag targets in place rather than rebuilding controls mid-gesture.
- Scientific buffers use private copy boundaries, transfer/detach sealing and shared-buffer rejection. Session capture owns buffers and metadata before returning.
- Keep units **below 15 dependencies**, counted from their actual inputs. Audit earliest callback activation and construction order on extraction; a null guard does not repair initialization order.
- Do not introduce a second setting owner or revive rejected Glass/composable-Abs proposals.

The complete requirement is **37 passing / 0 failing / 37**, accepted set **intentionally empty**: all suites once, both exporters, both Looks paths, 102 captures twice/exact repeat, cache identities in eight contexts/all minima, units, WebKit and construction. Suite/worker/join enforce completion counts; exit zero with missing work fails. Native-click suites stay native unless separately authorized.

The app.js ratchet gates **260 AST variable-let bindings**, not regex lines or declaration statements. A fresh measurement at the deployed tree passed 260/260. The legacy statement audit keeps its original base and exact fingerprinted removal list. The overlap baseline is separate from accepted ordinary failures.

Run `make check`, relevant units and **every local audit** before pushing a product candidate. [Makefile](Makefile), [CI](.github/workflows/ci.yml), [checkpoint notes](docs/maintenance/checkpoint-counts.md) and AGENTS define the contracts. Log actual/expected comparands before assertions on both outcomes. Preserve failures; do not retry or relax them without permission. Diagnostics do not replace acceptance.

Capture recording requires prior approval of exact changes, post-record verification and zero residual difference. Version updates normally change 204 saved fields across 102 captures; each update needs its own approval. No version tolerance/mapping remains.

Pushing `main` publishes **vibemol.org** through Pages independently of ordinary CI. Beta is retired. Merge the tested tree into local main, verify it and local checks, then push only when authorized and green. Verify publication/status jobs. Do not move tags. See [asset versions](docs/asset-versioning.md) for the approved same-version patch URL.

## Paused and unscheduled work

The [command registry v0](docs/api/commands.md) is the directly authorized additive 0.11 work. These other dispositions remain in force:

| Work | Disposition |
| --- | --- |
| AI connector | **Paused/reverted from production.** Preserve designs/prototypes; do not restore shell, adapter, consent, relay or tools incidentally. [Consent document](docs/connector-consent.md) is historical. |
| 0.11 controls/command bus | **Stopped at the measurement gate:** zero same-scope divergences across nine pairs/12 cases; four orbital/default distinctions are explicit. Keep the [invariant](docs/maintenance/paired-controls-invariant.md), no Phase 0/bus. |
| General undo | **Design-only.** Existing Edit/measurement undo stays; ownership landing does not authorize general history. |
| Testing wrappers 2+ | Held, including separate fragment-cue review. Keep `performSelectionMoveDrag`; no native-suite API conversions. |
| Browser profiling/sharding | Measurements exist; no new sharding work selected. Looks duration varies too much to allocate from one sample. |
| Placement #55 | Justified, not scheduled. Guard covers 18 contexts/112 signatures, twelve exact latent pairs; coverage incomplete. Shrinks freely, grows only with permission. Floating UI experiment closed without execution: no obstacle avoidance. [Audit](docs/maintenance/coordinates-placement-policy.md). |
| Runner #81 | Keep Ubuntu 24.04 pin. OS-key caches **before** unpinning; centralize pin in that pass. Recheck Figure's four CDP message strings on a Chrome bump; it fails closed. |
| Clamp/relocations | Preserve held clamp branch. `adaptivePopoverController` and `addGrowNeighborDirs` belong with the first authorized relocation using the exact-removal allowance. |

[Carried findings](tests/baselines/carried-defects.json) retain their classifications: **#42 and #70 open/unclassified, not carried/accepted; #71 carried, unaccepted**. Its inaccurate clear-result flag affects a hint; its mock omitted the callback side effect. Later passes do not classify these findings. Historical `relativeBatchPriority` text for closed #53 is not a new work order.

## Local material and starting point

At review, repo-root main had unrelated `.gitignore` edits and untracked `COMMANDS_AND_CONTROLS_PLAN.md`, `docs/connector-pilot/`, `out/connector-reference/`. Preserve them; this update does not publish them. The contract bundle is not guaranteed in a fresh clone.

Preserved branches include `prototype` (`9e909f65`), `codex/connector-prototype` (`2ee3daf5`), `codex/finite-clamp-contract` (`8e69a99b`), `codex/browser-test-profiling` (`281317c7`) and `feat/palette-close-on-select` (`9a962d5c`). These are snapshots, not prune/reset instructions. **Never merge the prototype into main**: its broad AgentSeam bypasses the product audit. A connector restart needs new scope; intended clients include Claude, ChatGPT and Codex, with empirical compatibility checks.

Read `git status`, refs and the post-push run above, then follow Francesco's next request. Use plain language, report mechanisms before code, and let him review visual iterations before lengthy tests when asked. Create new molecule, sessions, measurements and the other formerly proposed foundations have shipped.
