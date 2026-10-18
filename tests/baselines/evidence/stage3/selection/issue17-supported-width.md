Issue #17 remains open as a supported-range **0.9.x** defect, carried alongside
#3, #11, axis-gizmo Escape and mode-consistency Coordinates Delete. Width 390 is
already tested: `axis_gizmo.py:147` covers **390 × 844**, line 171 also creates a
touch context at that size, and `build_panel.py:107` uses **390 × 740**. The manual
Metal probe used 390 × 850; its eight-pixel horizontal overflow is in a supported
width range and should be fixed in the separate production-defect batch.

The 2026-10-15 standing refactor rule supersedes the earlier stop: a failure
reproducing identically on tagged `v0.9.5-pre-refactor` is a finding, not a
conversion blocker. Preserve the failing assertion and record both sources;
do not resize it away, relax it, count it as a pass or change production here.
Only proposed-only failures, a CI/golden/identity gate miss, or a non-neutral
conversion block these PRs. This does not expand CI's accepted three workflows.
