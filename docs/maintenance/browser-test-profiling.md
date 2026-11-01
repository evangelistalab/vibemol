# Browser-test performance diagnostic

Run the original accepted-main Looks and Look References entry points once,
without changing production, original suites, assertions, waits, fixtures,
goldens or the ordinary37/0/37 gate. This is observational evidence, never merge
acceptance or a retry of PR86. Its source remains held separately.

`tools/profile_browser_tests.py` records:

- Every synchronous Playwright `_sync` browser dispatch: method, category,
  caller, scenario, wall duration and outcome. Locator construction, cached
  properties and `EventInfo.value` future waits do not use this dispatch and
  are excluded. A wait invocation counts once, not once per poll. Time outside
  measured dispatches is reported separately rather than assumed absent.
- Individual original scenarios, preserving their entry-point list and setup.
- Page V8 CPU samples at5000 microseconds and raw browser Performance metrics.
  Every page profiler is stopped, disabled and detached before context close.
- Counts, mean/median/p95/max durations, exclusive API wall time, suite wall time,
  environment/source hashes, missing observations and residual contexts.

Start/end operation events are flushed as they happen, so an interrupted run
retains its in-flight method and caller. On Linux, the companion
`tools/profile_browser_processes.py` samples descendant CPU ticks/RSS once per
second, distinguishing GPU, renderer, browser and driver processes. This covers
native work V8 cannot attribute. CPU deltas omit before-first/after-last sample
time; summed RSS double-counts shared pages and is labelled accordingly.

File-import timing is the existing `VibeMolEmbed.loadFiles` call, including the
work its Promise awaits. It is not disk-only timing and does not prove the final
viewport has settled. Native file-input calls and subsequent readiness waits
are separate categories. Host wall time includes scheduling and browser work.
Nested API calls are counted individually but their durations are removed from
the parent's exclusive duration before totals are summed.

CPU samples are sample-weighted time, not instruction counts or whole-machine
CPU accounting. They omit much native/SwiftShader/compositor work. `(idle)` or
`(program)` cannot classify external contention; inclusive function times overlap.
Observer-command time is recorded separately, but profiler overhead is not
assumed zero or subtracted from the test's performance. There is no new threshold,
stall discount, assertion relaxation, snapshot/video trace or application patch.

The private Playwright `_sync` instrumentation is pinned to the ordinary lockfile's
1.64.1; a different version fails loudly. Raw API rows, browser profiles and
reports belong under ignored `out/test-artifacts/`, not the historical evidence
tree. The manual workflow verifies production, original e2e files and every
baseline are byte-identical to accepted mainc37bb07 before profiling. Its two
suites run on separate Ubuntu24.04 workers with the ordinary browser/toolchain.

Local collector check:

```sh
python tools/profile_browser_tests.py --suite self-test --out out/test-artifacts/browser-profile/self-test
```

Full diagnostic (on a fresh output directory):

```sh
python tools/profile_browser_tests.py --suite looks --out out/test-artifacts/browser-profile/looks
```

Five browserless accounting controls check import classification, nested timing,
CPU self/inclusive accounting, process-stat parsing/roles and preservation of a
completed result in the event journal. The native self-test verifies real input,
readback, sampled work and cleanup before the original suite starts.

For Linux native-process measurements, run the companion wrapper on a fresh
output directory:

```sh
python tools/profile_browser_processes.py --suite looks --out out/test-artifacts/browser-profile/measured-looks
```

The existing `browser-ci-probes.yml` workflow has an explicit
`browser-performance` dispatch scope. Supply its exact `source_commit` and the
profiling branch as the workflow ref; the two matrix jobs profile the original
Looks and Look References entry points independently. The legacy diagnostic
jobs are skipped in this scope. This workflow must already be registered on
main; a new workflow file existing only on a branch cannot be dispatched.

The first measured results and interpretation are in
[browser-test-profiling-results.md](browser-test-profiling-results.md). The small
observational reference is `tests/baselines/browser-profile-reference.json`;
it adds no performance threshold or ordinary-gate allowance.
