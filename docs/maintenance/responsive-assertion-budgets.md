# Shared assertion timing (#43)

The direct human release of #43 replaces wall-clock-only acceptance with a
responsive-time budget at the six consolidated short-deadline sites, the
seventh resize-readiness site (#70), and Figure preview (the original #43
request). Numeric tolerance and the expected values/predicates are unchanged.
The ordinary gate remains37/0/37 with an intentionally empty accepted set.

The evidence invalidating the wall-only expectation is [PR72 run40254546952](https://github.com/evangelistalab/vibemol/actions/runs/40254546952):
the real2000-atom/5400-bond resize passed all six720×794 readbacks after a
24680.9ms poll gap, with only18500ms in long-task entries. First matching metrics
were observed24690.7ms after the anchor, first presented success24714ms after it;
these are observations, not exact arrival timestamps. Roughly6.2s of the gap had
no long-task explanation. #50 separately measured correct selection arrivals
at138.7–264.8ms across five workers; #42's later failure artifact had a blob.
This authorization does not retrospectively classify or close #42 or #70.

| Site | Responsive budget | Required state/event |
| --- | ---: | --- |
| smoke.native-selection |600ms|Trusted completed native input, exact selection|
| smoke.select-two-first |600ms|Same receipt, exact first selection|
| smoke.select-two-additive |600ms|Same receipt, exact toggle result|
| smoke.startup-single-selection |600ms|Same receipt, exact startup selection|
| smoke.native-clipboard |5000ms|Native activation plus DOM-backed exact arrival|
| presented-state.false-control |100ms|Intentionally false; must fail|
| edit-picking.resize-readiness |30000ms|Existing two-frame boundary and all six viewport comparisons|
| figure.preview |30000ms|Exact existing `img.src.startsWith('blob:')` predicate|

One owner, `tests/e2e/stall_diagnostics.js`, records long tasks and a50ms
`performance.now()` heartbeat. It discounts the union of intervals overlapping
the wait: completed long tasks and lateness from the heartbeat's expected next
callback to its actual callback. Normal heartbeat intervals consume time.
The pending overdue interval is included before its callback runs, so a budget
callback cannot lose a race with the heartbeat after a stall. Intersections of
long tasks and gaps are counted once. Prelude-only work is never discounted
from a subsequent wait. Host readback after a completed native event never
extends that event's accounting window.

The independent hard wall is180000ms at every site, about7.29× the24.7s observed
gap. Both the browser accounting and the driver wait enforce it; a correct value
after that ceiling fails even when all elapsed time has stall evidence. A false
predicate never becomes true through timing credit. Once an observation expires,
its failed result is frozen; later arrival cannot repair it. This is a ceiling
for acceptance, not a claim that a renderer blocked at the deadline can deliver
a timely diagnostic RPC.

The DOM/native receipt contracts stay separate from timing. A wrong native
completion fails immediately, even if corrected later. Clipboard's budget timer
only expires; it cannot invent a DOM-backed arrival by polling a later value.
Figure retains image history and the original nominal30s snapshot, labelled
with actual observation time and lateness. Such a snapshot is diagnostic after
the timing change, not proof that the responsive budget expired.

Unavailable long-task observations are reported and grant no unknown task time;
retained heartbeat evidence can still be used. Dropped task/gap records or an
invalid observation window conservatively charge all wall time. Reports retain
raw intervals, each individual overlap, union discount, wall and responsive
elapsed times, source availability and any fallback. A real asynchronous
slowdown without stall evidence consumes responsive time. Synchronous long work
is visible in raw entries and remains bounded by the independent hard ceiling.

Deterministic clocks cover gap-only stalls, the PR72-shaped missing6.2s, union
accounting, pending-callback order, prelude exclusion, missing/dropped data,
never-arriving and late-correct states, and hard-wall failure. Bounded real-driver
controls additionally prove a completed native event beyond600 wall ms can pass
with observed stalls while wrong native completion and false readiness fail.
The old numeric tolerances/type/structure comparisons remain exact contracts.

The separately authorized guard rerun40263180674 returned35/2/37 and remains
held: Properties startup and Surface Schemes' fresh-page navigation both timed
out in unchanged `goto(load)` calls. Resize70 and the strict18-context/112-target
guard passed. The standing diagnostics rule requires request/lifecycle/readyState
comparands before these paths run again, so the budget PR adds observation only
at those two calls. Navigation receives no responsive budget, new ceiling,
readiness change or retry. Neither failure is classified as analytics/contention
from a generic resource error. See `tests/baselines/navigation-load-observations.json`.
A separate budget candidate's result cannot retroactively accept or classify
the failed guard candidate.
