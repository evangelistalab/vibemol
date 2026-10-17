# Selection cache proposal: verification stopped

The app has thirteen reference-only conversions, +178/−178, let 288 → 275. All 1,190 existing function declarations and the entire app match the expected lexical transformation; queries and listener timing are unchanged. The app still has 33,069 lines and 1,181 top-level functions. The shipped QA harness, stock browser assertions and periodic-table controller are unchanged.

The previously named “14 dependencies” is a sum of 13 cache bindings plus the already-existing helper. There is no new controller or dependency interface; the extraction input limit does not apply to these conversions. The actual integrated periodic-table controller remains 19 inputs; the held Colors proposal measures 11.

Local checks and 433 JavaScript / 16 Python unit tests passed. Both 102-capture runs matched unchanged goldens with the approved float-only tolerance and repeated exactly. All 52 composed inventory slots passed in eight contexts with all firing minima. These local results do not replace the candidate CI gate.

All four unchanged UI suites passed on tagged and proposed source: edit_picking, transform_selection, build_orbit and floating_panels. Their assertions/waits and source hashes were independently reconciled; the four already-passing tagged replays were reused, not repeated. The proposed runs completed in 322.54, 43.05, 38.12 and 34.56 seconds respectively. This covers absolute-position/COM editing, cue/gizmo drags, selection/bond scopes, orbit/focus/Escape, fragment/cancel, themes and responsive floating controls.

Issue #17 remains open: direct switching is intended, and the issue-cited click-away is solely a base/proposed comparison workaround. The unchanged 390px bounds assertion fails on both sources in all four launch/theme cases, with identical x=12,width=386,right=398 geometry and no page errors. The collector retains failed status/exit2; only the paired comparison is successful. No assertion was relaxed. The separate desktop sibling-trigger/Coordinates Delete geometry comparison also matches exactly.

The canonical carried list contains #3, #11, axis-gizmo Escape, mode-consistency Coordinates Delete and #17, with #5/#14/#15 follow-ups separately noted. Width390 is tested by axis_gizmo at390×844 and build_panel at390×740. AGENTS.md now allows identical tagged manual findings to be filed/carried without stopping; only a proposed-only failure, gate miss or non-neutral conversion blocks.

The candidate's own CI is pending. The material-preset intermittent remains open; it must be evaluated from this CI's actual Looks completion, both material_families paths and duration. Element Colors stays held; periodic-table input recount is integrated19, held proposal11. Symmetry starts only after Selection's own full gate, merge and integration push.
