The Metal bond mode popover covers adjacent Selection cue buttons, so direct
switching from Metal to Coordination cannot reach the Coordination handler.
Expected: one click on Coordination dismisses Metal and opens Coordination.
This is pre-existing **0.9.x production work**, outside the behavior-preserving
cache refactor.

Reproduced on `v0.9.5-pre-refactor`
(`1c609b338344aaa49ffd11b9ee2ad834a6e0d85d`), normal Workbench/light launch,
1440 × 1000, Chromium 145 / software SwiftShader. No QA harness, event-handler
replacement, style modification or forced click was used. Fixture loading and
selection setup used the existing public testing API; menu opening used native
pointer events. The original stopped matrix and read-only geometry probe are
retained under `tests/baselines/evidence/stage3/selection/`.

Normal UI reproduction:

1. Load an XYZ containing one Fe atom at `(0,0,0)`.
2. Enter Edit / Transform and select Fe.
3. Open the Metal bond mode cue.
4. Click the adjacent Coordination cue. Its center is underneath Metal's
   Automatic option; the intended trigger never receives the pointer.

Measured `getBoundingClientRect()` values, in CSS pixels:

| Element | Left, top | Width × height | Metal overlap |
|---|---|---|---|
| Metal popover | 880, 12 | 386 × 503.1875 | — |
| Translate cue | 1178, 109 | 42 × 42 | 42 × 42 |
| Coordination cue | 1228, 109 | 42 × 42 | 38 × 42 |
| Metal cue | 1278, 109 | 42 × 42 | none |
| Build/fragment cue | 1328, 109 | 42 × 42 | none |
| Delete cue | 1378, 109 | 42 × 42 | none |

Rotate and bond-specific sibling cues are hidden (zero-sized rectangles) for
this atom selection. `elementFromPoint(1249,130)`, the Coordination center,
returns the Metal Automatic option, not the Coordination trigger.

The popovers' own `pointerdown.stopPropagation()` correctly prevents the
document outside-dismiss listener from treating an inside click as outside.
Removing it would not make the covered trigger receive the pointer. Preserve
that behavior and solve placement/hit reachability separately.

Compared against the existing `mode_consistency.py` defect tracked in #4:
at legacy 1200 × 900, the selection cue card is `(908,73,280,154.78125)`;
its position-input child is `(908,135,280,92.78125)`. Coordinates row 1 Delete
is `(1153,207.890625,28,28)`, overlapping the child by `28 × 19.890625`.
The Delete center hits `#editSelectionPosition` instead of Delete.

**Separate positioning paths:** Metal uses
`positionSelectionMetalBondingCuePopover()`, anchored to its trigger with
right/left placement and viewport clamping. The card uses
`renderEditSelectionTranslateCue()`, anchored to projected selection bounds
and clamped to the viewport/sidebar. Metal's effective z-index is 60 in
Workbench; the card is 34. They are both Edit overlay collisions, but they
are not one positioning path, so this is filed separately and linked to #4.

Refactor verification may explicitly click away from Metal before opening
Coordination on **both** tagged and proposed source, citing this issue. That
is an equal-footing workaround, not an assertion that dismiss-then-click is
the correct product workflow. The intended one-click switch remains broken
and open. No production change is included in the refactor.
