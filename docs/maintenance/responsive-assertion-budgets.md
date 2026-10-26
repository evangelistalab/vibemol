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

The historical guard rerun40263180674 returned35/2/37 and was held: Properties startup and Surface Schemes' fresh-page navigation both timed
out in unchanged `goto(load)` calls. Resize70 and the strict18-context/112-target
guard passed. The standing diagnostics rule requires request/lifecycle/readyState
comparands before these paths run again, so PR73 added observation only
at those two calls. At that historical stage navigation received no responsive
budget, new ceiling, readiness change or retry. The explicitly authorized
navigation follow-up below changes that coverage. Neither failure is classified as analytics/contention
from a generic resource error. See `tests/baselines/navigation-load-observations.json`.
A separate budget candidate's result cannot retroactively accept or classify
the failed guard candidate.

## CPU attribution and independent wall durations

The780.4ms/0.2ms passing result in40268153418 was a synthetic test page, not
VibeMol rendering or induced OS descheduling. Two `pointerup` handlers deliberately
busy-wait for80ms and700ms. The first writes `model=[0]` after its loop; that
state already matched before this particular control. The second delays event
completion. The self longtask covered334.8–1114.8ms, and the clipped heartbeat
gap covered383.5–1115.0ms; their union was780.2ms of the780.4ms event window.
The remaining0.2ms was pre-handler delay, not a measure of useful rendering.
The loops use elapsed time; no CPU profile apportions incidental scheduler time
inside them. No environment-specific cause can be inferred from this control.

The same clock observations can discount the work a product is doing to satisfy
the predicate. They do not distinguish that work from descheduling. The native
control proves accounting and value-contract preservation, not causal attribution
or performance-regression detection.

Every shared wait invocation now independently emits `[wait-wall]` and appends
`assertion-wall-times.jsonl` on success or failure. Browser event/wait-window raw
wall time is kept separately from the monotonic host invocation duration. A failed
or absent browser readback leaves browser time null and still records host time;
it is never fabricated as zero. File-write failure retains a stdout copy and
cannot replace an assertion exception. Raw wall values are not stall-discounted.

Each CI shard also writes `assertion-wall-times-summary.json` with separate raw
browser/host count/minimum/median/p95/maximum distributions by site, kind and outcome.
These preserve visibility of product slowdowns even when the discounted budget
passes. No new performance threshold or accepted failure is introduced; a drift
requires review, rather than being automatically classified as environment noise.


## Confirmed scope of the budget and stored wall reference

The budget is **not a performance-regression detector**. It credits the page's
own awaited CPU work as well as descheduling. A correct result after a product
slowdown can therefore pass up to the independent 180s wall ceiling. Exact value,
missing-event and hard-ceiling failures remain enforced. Uncredited time can also
expire the nominal responsive budget; that does not make a passing budget proof
of performance. There is no reliable “useful work” quantity here.

`tests/baselines/wait-wall-reference.json` stores all 31 records and their
per-site/kind/outcome raw browser/host distributions from run40382345816:
27 passing invocations, four intentional rejecting controls, and one deliberately
missing browser readback. It retains source/tree/renderer provenance and the raw
archive digest. This is a reference for later comparison, not a golden or drift
gate. No additional performance threshold is authorized.

New environmental timeout occurrences belong in the shared runner/timeout record
with their comparands and pressure/timing evidence. Do not file one issue per
machine stall. A distinct product mechanism still deserves its own issue. This
changes neither the intentionally empty accepted set nor the requirement to stop
on an ordinary gate failure; it authorizes no retries or automatic waivers.


## Navigation coverage and remaining bare wall waits

Before this follow-up navigation had diagnostics only, no shared accounting.
An AST inventory at d849429 finds88 goto,30 reload,537 wait_for_function,
709 click,8 locator wait_for and5 wait_for_selector sites in the56 modules
reachable by imports/literal child scripts from the37 ordinary entrypoints.
These are static sites, not dynamic execution counts or a claim that every
branch runs. The full top-level E2E census has91 goto and543 wait_for_function.

The shared receipt/deadline owners cover the five Smoke receipt sites, the
intentional false-state control, resize70 and Figure preview. Ordinary direct
wait_for_function, locator/actionability, launch, file/download and other
navigation/reload operations retain their own wall deadlines.

This follow-up extends the two observed navigation owners: Properties startup
(two suites) and three Surface Schemes stored-payload loads (two suites), eight
ordinary invocations. The pre-commit request retains the original30s wall limit.
After commit, the helper still requires the load event to complete; a subsequent
task records that dispatch's completion. The predicate is a synchronous receipt
boolean, not a truthy Promise or a weaker DOMContentLoaded condition. Renderer
long tasks and heartbeat gaps are unioned across documents; unobserved transition
time and ordinary network waiting stay charged. The total180s ceiling remains.
Original unsupported/same-document navigation uses the original deadline, never
an unobserved180s wait. No navigation or assertion is retried.

The load receipt latches before later host readback, and a previous document's
load cannot satisfy it. A withheld subresource must fail while still withheld;
a withheld main response must fail at its original pre-commit deadline. After a
pre-commit failure only, stop the still-pending request before context readback:
that readback can otherwise wait for a response that never commits. The original
failure is retained. Post-commit failures preserve the document and pending URLs.

Every invocation removes its preload and current observer/timer and disarms its
bridge. The public Playwright binding is reused once per Page and survives as an
inactive callback until that Page closes; it retains no timing owner and emits no
traffic. Native controls assert no observer on the next navigation, an inactive
bridge, and zero contexts after each case. The helper is Chromium-specific; it
cannot honestly be described as global protection for every wait or every browser.

This extension has the same confirmed limitation as #43: page work can receive
credit. Raw wall records remain independent, with synthetic navigation controls
separated from product loads. No drift threshold or accepted failure is added.
