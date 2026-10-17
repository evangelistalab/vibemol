The authorized issue-17 click-away workaround allowed the tagged-base probe to
open Coordination, commit a coordination choice, exercise all four Metal modes,
and check mode suspension. It then reached a new failing responsive assertion.

At viewport **390 × 850**, the open Metal popover has bounding box
`{x:12, y:12, width:386, height:503.1875}`. Its right edge is **398**, eight CSS
pixels beyond the viewport. The screenshot visibly clips that edge. This is on
unchanged tagged `1c609b3`, Workbench/light, app SHA
`8f782e42993468ec3abcf513b7befdae5c5e67dd8885a8883f3bdfcb0aba95b5`.
The proposed source was not reached by this resumed menu run.

This is another responsive placement symptom in Metal's positioning path,
recorded with #17. The original bounds assertion remains unchanged and failing;
there is no production fix, timeout increase, forced click or retry. The
standing stop rule has paused the sequence before a Selection PR or CI run.
Full source, traceback, screenshot and DOM are retained in
`tests/baselines/evidence/stage3/selection/manual-resumed-stop/`.

The desktop read-only geometry comparison was completed separately on both
tagged and proposed source before this stop: all recorded rectangles, computed
styles and center hit targets were exactly equal. Metal's sibling-trigger
overlap and the existing Coordinates Delete collision have separate positioning
functions, as documented in the issue body. Neither is fixed by this refactor.
