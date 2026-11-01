# Scientific-buffer alias audit

Measured production source: main `d281e8ff4d9ad0ef41d987f07f4fa255d023ac33`,
which merged PR83's approved `b1f3920` with the exact tested tree.
This is an inventory and diagnostic, not ownership or undo implementation.

## Finding

**Raw references are handed out, but no current product consumer was found
writing published source numeric arrays through a borrowed reference.** This
includes scalar/2C grid samples, trajectory frames, vibrational equilibrium and
displacements, MO coefficients and primitive coefficients. No numerical alias
corruption defect was established, and no production repair is proposed here.

The distinction matters: the grid-store comment says its samples are read-only,
but freezing the grid object does not enforce that. The audit supports the
existing consumers' discipline; it does not manufacture structural enforcement.
There is no source-buffer-writer migration demonstrated by these measurements.
A future owner can enforce the publication/borrow boundary without preserving
in-place source-sample writes, because none was found. That conclusion does not
size the separate atom/bond/annotation history work or promise a one-day delivery.

## Enumerated handouts

The JSON inventory enumerates 35 boundary families and 42 exact record/graph
carrier sites (33 expose a source or a carrier that can reach one; the remainder
return names, IDs, counts, copied snapshots or UI status). Each row names the
source function, location, consumer and disposition. It includes these routes:

| Route | Actual handout and consumer behavior |
| --- | --- |
| Parser → record/schema | Fresh scalar/channel/frame/coefficient allocations become sources; ordinary loading retains compatible typed views. |
| Orbital cache → layer/compatibility volume | Raw `grid.data` aliases; lattice metadata is frozen/copied. Existing renderers read samples. |
| MO → grid evaluator | A coefficient `subarray` is read by the shell evaluator. Its written `data` argument is a fresh output, before cache publication. |
| Grid → surfaces/clouds/statistics/metrics | Read-only samples. Mesh/normal/color arrays and percentile samples are separate output/copies. |
| Grid → Auto-iso | Synchronous readers borrow. Worker payloads slice samples, then structured-clone them; original source buffers are not transferred. |
| Grid → arithmetic | Cooperative sampling borrows and writes a new result. Worker requests clone inputs; only the worker's new result is transferred back. |
| Source → duplicate/Figure | Non-arithmetic layers share input fields. Arithmetic results copy. Figure reuses the read-only sampling/rendering paths. |
| Frame → playback | `applyAtomCoordinateFrame` reads values into atom/mesh state without modifying the frame. |
| Vibration → animation | Equilibrium/displacements are read. `frameBuffer` is intentionally mutable derived output, with separate storage. |
| Coordinates edit/reorder | Replacement numeric buffers, not in-place modification of the old ones. Molden basis `atomIndex` metadata changes in place; coefficients do not. |
| Existing Coordinates Undo | Numeric arrays are copied; restoring installs copies. This is existing behavior, not the proposed new history. |
| Session capture → codec | Shallow capture aliases live data, but the product immediately packs it. All typed data and metadata are copied before the first await. A retained raw capture would not be a safe Undo snapshot. |
| Decode → hydration | Fresh decoder-owned arrays are adopted. Supported import does not install caller-owned live typed views. |
| Structure export/import | Explicit structured-data/JSON copies. Supported public exports do not expose app-owned sample arrays. |
| UFF / AO previews | UFF copies coordinates into its own Float64 workspace; finite differences mutate that workspace. MINAO preview grids are fresh output. |

`scientific-buffer-aliases.json` is descriptive, not a new accepted-failure list,
ordinary gate or deletion authorization. Its source hashes pin all 82 app JS
files. The static census identifies 107 field-touching functions; its broader
all-parameter scan finds 1,011 mutation candidates, mostly unrelated UI/material
and object-state writes. The 24 non-fresh computed-index/mutator groups are
explicitly classified, including the private UFF writes and mutable vibration
output. Those counts are not defect counts or a proof of whole-program reachability.

## Runtime evidence

The scratch probe uses pinned Playwright/browser metadata, serial fresh contexts,
exact before/after bytes, and write traps on selected read-only typed-array
handoffs. It observes worker source membership and transfer lists. Positive
controls reject index, `set`, `subarray` and callback-array writes; the real
vibration scratch-buffer changes are also detected and reported separately.

Core cases cover scalar surfaces, cloud points/cubes, scalar and phase-like 2C,
Molden evaluation/all-orbital Figure export, Auto-iso sync and worker routes,
arithmetic cooperative and worker routes, trajectory playback, vibration phases,
session round-trip and structure export. A separate legacy Coordinates case
checks native coordinate/order commits and recorded comparands: replacement
trajectory frames, replacement equilibrium, and changed basis indices with
unchanged coefficient storage. Hit eligibility is checked before each edit.
No source input changes or borrowed-write violations were observed.

Detachment controls refute using an exception alone as a writer detector:
`slice()` on a detached view throws too; `set()` throws; an indexed store can
silently do nothing. The transferred owner's bytes remain intact. Consequently
an exception must be classified by the operation, and traps plus byte readback
are used instead of labelling every detach failure a corruption bug.

The diagnostic's copies/proxies are measurement instruments, not a shipped
private-buffer API and not performance measurements. Runtime coverage is finite;
static checks are conservative and not a general alias/reachability analysis.
External console code, arbitrary monkeypatches, every scene size and all possible
interleavings are not proven. An end-of-stage hash alone could miss a temporary
write restored before comparison; the traps and inspected private helper bodies
supply complementary evidence. Metadata mutations are deliberately distinct from
source numeric-buffer mutation.

## Collector history and boundaries

Earlier logs are retained separately from final proof: a return-shape mistake
in the Auto-iso diagnostic, an open Build popup intercepting a Coordinates cell,
an unsupported legacy Transform-toolbar precondition, and an Escape assumption
about that persistent panel. The final precondition uses its existing native
slash-close handler and asserts the cell's hit eligibility. No forced clicks,
selection repair, CSS changes or product workaround is used. The failed main/PR
runs and gate expectations were not changed. These collector failures are not
scientific alias findings; the popup observation is not classified as a new
product defect or added to the overlap baseline.

The first byte-only run's log/code remain, but its detailed checkpoint directory
was reused during collector development. Final runs use distinct output folders;
no claim of immutable preservation is made for those overwritten early JSONs.
All failed collector logs and the immutable PR83 CI failure archive remain.

Undo stays design-only. Retaining immutable source buffers and versioning mutable
structure/metadata remain different tasks. In particular, do not retain
`captureVolume()` output as a history snapshot merely because numeric readers
currently behave: its frame containers and basis metadata are still aliases.

## Repeating the diagnostic

Use the shared CI lock in an isolated Python environment and its installed pinned
Chromium shell. The probe checks both package and browser metadata, never chooses
a system browser, and requires a new output directory:

```sh
PLAYWRIGHT_BROWSERS_PATH=/path/to/pinned-cache \
python tools/diagnostics/scientific_aliases.py --output out/test-artifacts/alias-new-run
```

`--owners-only` selects the native Coordinates case. The full run includes both
core routing cases and that case. Each context closes before the next opens,
with zero remaining contexts asserted. The output includes actual toolchain and
harness hashes, every checkpoint, worker transfers and final exact readback.
The conservative Babel census is separate:

```sh
VIBEMOL_BABEL_ROOT=/path/to/@babel \
node tools/diagnostics/scientific_buffer_census.cjs out/test-artifacts/alias-census.json
```

Neither tool adds an ordinary suite or changes 37/0/37. Their diagnostics never
supply acceptance. Main run 41261857334 is independently verified 37/0/37 with
all 11 jobs, both exporters/58 activation records, 102 goldens twice/exact repeat,
48 slots/eight contexts/all minima, 497 JS/190 Python, WebKit and construction.
Looks 1466.26 s (24.44 min) completes both material paths; total 43.72 min.
No CI retry was performed.
