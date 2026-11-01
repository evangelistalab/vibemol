# Browser-test performance diagnostic

Run the original accepted-main Looks and Look References entry points once,
without changing production, original suites, assertions, waits, fixtures,
goldens or the ordinary37/0/37 gate. This is observational evidence, never merge
acceptance or a retry of PR86. Its source remains held separately.

`tools/profile_browser_tests.py` records:

- Every synchronous Playwright API call: method, category, caller, scenario,
  wall duration and outcome. Locator construction and cached properties are
  not browser operations. A wait invocation counts once, not once per poll.
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

Three browserless accounting controls check import classification, nested timing
and CPU self/inclusive accounting. The native self-test verifies real input,
readback, sampled work and cleanup before the original suite starts.
