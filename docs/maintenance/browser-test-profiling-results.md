# First browser-test profiles

The dominant measured resource in Looks is the browser graphics process, while
Look References also contains substantial deliberate timer coverage. Time spent
inside file-import calls is a small part of either profile. Rendering caused by
an import can continue after its Promise returns, so this does not establish
that all work caused by loading is cheap.

[Diagnostic run 41343567756, attempt 1](https://github.com/evangelistalab/vibemol/actions/runs/41343567756)
ran the two complete original suites once each. Harness commit
`ced5a678dafc8fe924230cf4affde51ad12c125d` retains the production, original e2e,
fixture and golden files from accepted main
`c37bb07e30c711025da325a14bbbb4a8345d06d7` byte-for-byte. Both suites passed:
20 Looks scenarios and seven Look References scenarios. Both Studio and
Properties material-family paths completed in Looks. Look References does not
exercise those material-family paths.

The ordinary 37/0/37 conjunction is unchanged and was not run or supplied by
this diagnostic. Held PR86 remains unchanged; its failed run remains failed.

## Operations and wall time

An operation here is one synchronous Playwright browser API dispatch, such as
a click, evaluate or wait invocation. It is not one user task, assertion, JS
instruction, frame or predicate poll. Locator construction, cached properties
and future-value waits are outside this counter. Exclusive API durations remove
nested child dispatch time before aggregation.

| Original suite | Scenarios | Browser dispatches | Suite wall | Mean API seconds/dispatch | Suite wall divided by dispatches |
| --- | ---: | ---: | ---: | ---: | ---: |
| Looks | 20 | 3,201 | 1,283.46 s / 21.39 min | 0.391 s | 0.401 s |
| Look References | 7 | 3,540 | 677.37 s / 11.29 min | 0.186 s | 0.191 s |

These 6,741 dispatches cover two of the 37 suites, not the whole browser gate.
The rates are measured averages on two separate workers, not a fixed cost per
operation. Looks used an Intel Xeon worker and Look References an AMD EPYC
worker, each with four vCPUs and approximately 16 GiB RAM. Both used Ubuntu
24.04, Python 3.12.15, Playwright 1.64.1 and Chromium 156.0.8078.4.

| Exclusive API category | Looks | Look References |
| --- | ---: | ---: |
| Input | 474 calls / 472.17 s | 209 / 136.97 s |
| JavaScript evaluation | 1,413 / 442.06 s | 2,368 / 196.49 s |
| Navigation | 47 / 82.33 s | 71 / 68.03 s |
| Explicit waits | 88 / 34.59 s | 253 / 225.34 s |
| Common fixture import | 44 / 9.32 s | 5 / 0.94 s |
| Native file input | 10 / 10.47 s | 0 |
| Session import | 19 / 8.97 s | 4 / 1.90 s |
| Session export | 18 / 6.29 s | 3 / 1.28 s |
| Readbacks, screenshots and other | 985 / 181.55 s | 432 / 25.14 s |
| Lifecycle | 103 / 2.34 s | 195 / 3.27 s |

The category totals are 1,250.09 s and 659.36 s. The remaining 33.37 s and
18.00 s include Python work, profiler commands, future waits and work outside
the counted dispatches. Browser graphics work can overlap these categories;
CPU time must not be added to API wall time.

In Looks, the 148 `Locator.click` dispatches averaged **2.010 s**, with median
1.657 s and p95 4.873 s. In Look References, 185 clicks averaged **0.628 s**,
with median 0.209 s and p95 3.521 s. A click includes Playwright's readiness and
interaction work; these numbers do not isolate the application's click handler.
Looks' 1,312 `Page.evaluate` calls averaged 0.229 s and Look References' 2,173
averaged 0.073 s. Browser round trips accumulate even when each read is small.

## Where the time goes

Linux descendant-process samples measured **4,203.8 CPU-seconds in the graphics
process during Looks**, averaging **3.27 logical cores**, or **96.1% of observed
descendant CPU ticks**. Look References measured 1,617.2 CPU-seconds there,
averaging 2.38 cores and 87.0% of descendant ticks. This is strong evidence to
investigate graphics workload. It does not identify a particular shader or
distinguish useful rendering from avoidable background rendering. This profile
did not independently capture GL vendor strings; ordinary same-configuration CI
has reported SwiftShader.

V8 sampling alone misses much of that native graphics work. Its `(program)`
samples cannot classify external descheduling, and inclusive function times
overlap. The process samples are the independent resource measurement.

The slowest Looks scenarios were:

| Scenario | Wall seconds |
| --- | ---: |
| Complete Look tiles | 216.26 |
| Material families, both interfaces | 134.03 |
| Reference UI | 131.48 |
| Independent colors | 117.17 |
| Shared material presets | 117.07 |

Look References spends 329.18 s in restore reporting, 124.14 s in Reference UI,
110.47 s in the paired-control invariant and 79.15 s in persistence. Two timer
assertions in `appearance_autosave.py` account for **206.20 s**: 45 actual
hint-expiry waits take 172.57 s, and 45 checks past the normal autosave opportunity
take 33.63 s. These are intentional coverage, not unexplained sleeps. They were
not shortened or removed.

## Measured leads for a separate optimization

1. **Retire an unused parent page before the restore matrix.**
   `restore_reporting` leaves its helper-created parent context alive while
   opening 49 serial case pages. The profile records 50 pages in that scenario,
   a maximum overlap of two, and a parent lifetime of 329.98 s. All close by
   suite end, so zero residual contexts does not prove absence of competition
   during the matrix. Closing the unused parent is a bounded experiment to
   measure next; no speedup or GPU attribution to that page is yet established.
2. **Batch semantically simultaneous readbacks.** The paired-control invariant
   alone makes 1,388 dispatches in 110.47 s. Combining readbacks may reduce
   round-trip cost while retaining exact JSON types, native writes, mutation
   traces and presentation boundaries. This has not been implemented.
3. **Review repeated scenario coverage before deduplicating.** Reference UI,
   persistence and migration run in both measured suites. Looks imports other
   standalone scenarios too. Shared source is not proof of redundant coverage:
   ordering and cold/warm rendering can differ. Inventory those differences
   before removing an execution. No test was removed by this profiling work.

The previous offline shard model is a separate scheduling lead: six browser
shards could put the existing work near a 32–34-minute critical path if suite
durations hold, versus the measured approximately 45-minute run. It is not a
measured speedup and does not reduce the rendering or timer work above.

## Evidence and limits

The committed observational reference is
`tests/baselines/browser-profile-reference.json`. It records exact method,
category, scenario, environment and process summaries with raw-file hashes.
Artifacts `browser-profile-looks` and `browser-profile-look_references` contain
start/end journals, completed operations, per-page CPU profiles, process samples,
hardware metadata and original test artifacts. The downloaded run metadata,
full log, source proof, independent analysis and archive remain under ignored
`out/test-artifacts/browser-profile/ci/41343567756/`.

Independent checks matched 6,741 completed calls to 13,482 start/end events,
verified exclusive totals, source hashes and scenario inventories, and found
no profiler errors, all pages finalized and zero residual contexts in both
suites. Five browserless accounting controls and the native collector self-test
also passed on both workers.

Profiling adds overhead. Observer commands occupied 29.48 s and 8.82 s; process
sampling did 23.97 s and 13.20 s of work in its separate process. Those intervals
can overlap other work and are not an overhead correction to subtract. There
is only one full sample per suite, with no controlled profiled/unprofiled pair.
The shorter Looks duration than earlier ordinary runs is not an optimization
claim. No performance threshold, budget change, production patch, assertion
change, baseline re-recording or accepted-failure allowance was introduced.
