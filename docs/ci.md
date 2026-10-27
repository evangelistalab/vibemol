# CI execution and evidence

Checks/unit, five Chromium suite shards, two characterization workers and the WebKit Properties check start independently. Neither matrix cancels siblings when a worker fails. Chromium jobs install only Chromium; the WebKit job installs only WebKit. The binary cache key includes the installed Playwright package version, OS, architecture and browser. Each job still runs `playwright install --with-deps` so Linux system dependencies are present on cache hits, as required by the [Playwright CI guidance](https://playwright.dev/python/docs/ci).

`browser_suite.py` measures each suite's subprocess wall time with `time.monotonic()`, including browser/server startup. It writes `wallTimeSeconds` per suite and for the batch; `seconds` remains a compatibility alias. The committed scheduling measurements in `tests/baselines/browser-suite-timings.json` came from run [38763532071](https://github.com/evangelistalab/vibemol/actions/runs/38763532071), attempt 1, with exact source and browser provenance. These are scheduling data, not acceptance evidence for a different candidate. That run's aggregate was 33/4/37 because of the separately recorded accessibility finding; the historical restored gate was34/3/37 after#21 was closed as test synchronization; the authorized#11/#45 repair later used35/2/37. Subsequent#52/#53 repairs brought the current gate to37/0/37 with an intentionally empty accepted set; the historical accessibility failure was never accepted.

| Slowest suite | Measured wall time |
| --- | ---: |
| looks.py | 1,917.99 s (31.97 min) |
| calculations.py | 854.45 s (14.24 min) |
| smoke.py | 734.96 s (12.25 min) |
| premerge.py | 628.36 s (10.47 min) |
| look_references.py | 397.01 s (6.62 min) |

The serial workflow took **10,278 s (171.30 min)** including setup, two characterization runs and WebKit. Its browser batch took 8,270 s; serial characterization took 1,880 s. `browser-shards.json` isolates Smoke and Looks. The other 35 suites use longest-processing-time allocation to the least-loaded of three shards (ties by suite/shard name): 1,867.74, 1,874.67 and 1,874.50 seconds. The projected suite critical path is Looks at 31.97 minutes, before setup, artifact transport and joins. Actual before/after workflow wall time and the candidate run are recorded in the PR after CI; estimates are not presented as measurements.

Workers run each assigned suite once and retain its actual nonzero exit code and raw log. Completing evidence collection does not certify the gate. `join_browser_shards.py` requires every planned shard and all 37 unique suites, verifies test hashes, recomputes each failure classification from raw logs and current workflow source, then checks exactly **37 passing /0 failing /37**. The accepted set is intentionally empty after#11/#45 and#52/#53 were repaired. Both exporter completion/activation records remain required by the policy check, including four fresh Save readbacks per site. Any failure, omission, duplication or different arithmetic blocks; the semantic matcher stays for attribution and negative controls, not as an allowance. [Diagnostic39129507791](https://github.com/evangelistalab/vibemol/actions/runs/39129507791) invalidated Edit320's fixed-sleep expectation: observable compact readiness and a presentation boundary now precede the unchanged overflow comparison and comparand log. #21 is closed as test synchronization; diagnostic results never supply merge acceptance.

Each characterization worker runs one full 102-capture pass, checks unchanged committed goldens using the existing float-only tolerance, exercises four fresh launch/theme identity contexts and verifies session camera pinning. It explicitly leaves repeat certification pending. `join_characterize.py` independently checks both golden comparisons, exact serialized capture equality, the current48-slot compositions and all reason minima in eight contexts. Workbench has47live+1legacy-only known absence; legacy has48live+0absent. PR75 removed four explicitly retired null slots; earlier52-slot results retain their historical compositions. Pixel hashes remain diagnostic. The default local two-run command and the separate original-tag baseline recording workflow retain their behavior.

Both joins require identical commit/tree, app/QA/golden/manifest hashes and CI run/attempt. Missing, duplicated, unfinished or mixed worker evidence fails. Joins run after failed workers so available diagnostics survive. Artifacts are:

- `browser-suite-{shard}`: all raw suite artifacts, `browser-suite/browser-results.json` and `browser-suite/{suite}/run.log`.
- `browser-results`: the independently joined result and raw logs in manifest order.
- `characterize-{1,2}`: one full capture pass and its four identity contexts under `characterize/`.
- `characterization-results`: both captures, combined eight-context identities and exact-repeat evidence.
- `webkit-properties`: the independent WebKit interaction evidence (it may emit no artifact on success).
- `construction-order`: Stage 5 checks/unit retains the inverse audit report and exact source/run identity. It uses pinned test-only Babel packages and full Git history; it checks app/module construction plus newly introduced parameters/locals inside existing wrappers and callbacks.

For wall-time comparisons, use workflow creation to the latest job completion, and report queue/setup/artifact overhead as part of the observed result. Do not sum parallel job durations. Compare the critical path and cache-hit status separately. If Smoke becomes the measured critical path, propose a themed-file split for review before changing it.

## Additional Stage 5 gates

The eleven-job layout and both aggregate joins remain unchanged. The checks/unit job now requires the inverse construction-order audit in `tests/baselines/stage5/construction-order.json`; its separate artifact makes ten core artifacts, plus optional WebKit output. The self-test includes old-wrapper parameters and an early reading closure inside an existing callback. Unresolved early activation is a failed gate.

Historical trajectory5a/vibration5b gates required an unchanged#11 failure signature. Those strict policy fixtures remain tested. The current post-release policy explicitly requires37/0/37, every suite passed, an intentionally empty accepted set, and both complete exporter records. The earlier35/2/37 two-workflow allowance belongs to the historical#11/#45 repair, not the current gate. The join independently recomputes the records from raw logs; `tools/check-refactor-run.py` checks both sites and all activation/fresh-Save fields. Historical strictness never substitutes for the newly authorized composition.

Report Looks wall time and the actual completion of BOTH Studio and Properties material-family paths for every group run. If either path was not reached, record coverage as not exercised rather than absence of recurrence. The material-preset intermittent remains open after a passing run.

## Shared browser cache scope

The saved keys were correct, but all entries were under `refs/pull/N/merge`. The cache API confirmed no integration-branch entry; later PRs cannot restore another PR merge ref. `playwright-cache.yml` warms Chromium and WebKit on a trusted branch push when dependency/CI files change, using exactly the worker keys. PR27 disproved feature-branch priming: all eight jobs missed despite identical keys and versions. The merged workflow then saved both exact keys on `refs/heads/codex/app-js-decomposition` in automatic run39095059338. Warm only main/integration after relevant pushes; require the next PR’s actual restore logs before claiming the cache task complete. System dependencies are still installed on every worker. Verify actual cache hits from each candidate log; do not infer them from the presence of an action. See [GitHub cache scope](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching).

Ordinary CI and active diagnostics install `api/requirements-ci.lock`, including the same Playwright/transitive package versions, with Python3.12.15. The API client keeps its wider supported range in `api/requirements.txt`; the lock constrains CI deliberately. The published-tag baseline recorder retains its historical1.64.0 provenance and is not a control-comparison workflow. New diagnostic artifacts record the lock SHA256, installed versions and browser revision.

Issue50 arrival mode is part of the standing `smoke_input_diagnostic.py` tool. It executes the original complete prefix through the grow-add section, with the600ms assertion unchanged, and observes the existing authoritative selection setter. Native input, setter bounds, callback completion, first wait observations and frame/long-task records have separate timestamps. A late receipt never converts an original assertion failure into a pass. The separate30s observation ceiling reuses the existing default browser-wait ceiling solely to collect a late or missing receipt; it is not the selection budget. Five independent workers measure one activation each, without retries.

The#45 completion gate holds `performance.now()` before Start while real frames and input delivery continue. The render loop feeds that time to both playback owners, whose recording-start paths reset their timestamps. Every later delta is zero until the test releases the gate. This proves natural completion cannot overtake pointerdown, even if host action delivery stalls. The gate releases after the early-Stop click or between press/key-down and release/key-up for the product regression. No sleeps, retries or longer recording window establish readiness. Native MediaRecorder verification is available with `tests/e2e/video_export_activation.py`; Smoke uses its existing recorder stubs. #11 and#45 remain separate ledger entries.

## One-run infrastructure characterization (40396382688)

The repository is public; ordinary jobs use standard GitHub-hosted ubuntu-latest
VMs, not self-hosted runners. The one explicitly dispatched profile observed
Ubuntu24.04 image20261023.334.3, Linux6.17.0-1022-azure, four vCPUs (Intel Xeon
6973P-C),16,372,440KiB guest RAM, and a145GB root volume with85GB available.
These are observed VM values, distinct from GitHub's documented nominal runner
specifications. Each ordinary shard has its own VM; suites within a shard remain
serial. Chromium uses software SwiftShader.

Using the ordinary Python3.12.15/Playwright1.64.1 lockfile, the original Edit
prelude and unchanged slab assertions ran once on the actual2,000-atom/5,400-bond
scene.196 one-second samples include144 complete dense-phase process-tree
observations: peak PSS1,050,133KiB (~1.00GiB), at least14,397,880KiB (~13.73GiB)
host memory available. V8 used42.1MB against a3.76GB heap limit. Memory-pressure
some/full totals stayed0; memory-controller files were unavailable and are not
reported as zero.29 missing process-memory observations all occurred during
retirement as children exited. These are sampled peaks, not allocation maxima.

Dense-phase CPU utilization was98.43% across the four vCPUs, with zero recorded
steal ticks and no cgroup throttled time. This measures CPU saturation, not memory
limit proximity. It neither diagnoses the old unclassified navigations nor proves
that every timeout was external machine noise. No individual timeout issue is
filed from this profile; new occurrences belong in the shared infrastructure
record with their evidence. A distinct product mechanism stays separate.

The organization API reports the Free plan and larger hosted runners unsupported.
GitHub offers8-vCPU/32GB Ubuntu and larger configurations to Team/Enterprise
organizations; those runners are billed even for public repositories. Moving to
one requires an administrator's plan/billing/runner configuration change. No such
change was made. A controlled8-vCPU comparison would address the measured CPU
limit; increasing RAM alone is not supported by this profile.

Compact reference: tests/baselines/runner-characterization.json. Raw process,
pressure, runner identity and scene evidence: diagnostic run40396382688. This is
not ordinary merge acceptance, a recurring benchmark, or a new performance gate.
Sources: https://docs.github.com/en/actions/reference/runners/github-hosted-runners
and https://docs.github.com/en/actions/concepts/runners/larger-runners and
https://docs.github.com/en/actions/reference/runners/larger-runners.

## Browser worker configuration

All 37 entrypoints uses the direct synchronous Python Playwright
library. There is no Playwright Test/pytest worker pool or half-CPU worker
default in this execution path. `browser_suite.py` starts one suite with blocking
`subprocess.run` and waits for it to exit before starting the next. Per runner:

| Shard | Suite entrypoints | Concurrent suite workers |
| --- | ---: | ---: |
| Smoke | 1 | 1 |
| Looks | 1 | 1 |
| balanced-1 | 11 | 1 |
| balanced-2 | 12 | 1 |
| balanced-3 | 12 | 1 |

The two characterization jobs and WebKit also use one synchronous owner each on
separate hosted VMs. GitHub matrix concurrency is not a Playwright worker count
inside one VM. The original 40396382688 CPU profile already launched exactly one
browser, one context and one page before measuring98.43% CPU use. One browser's
software renderer can use multiple processes and threads. Re-reading the 144
saved dense-phase samples accounts for 98.41% of the VM CPU capacity in the
observed process tree, including 97.65% in Chrome processes (against 98.43%
whole-VM busy time). No second profile was dispatched. Process names cannot
distinguish GPU and renderer roles; this does not diagnose old timeouts. A one-worker owner
also does not mean one page: Looks persistence/library tests and Sessions'
cross-tab test deliberately open additional pages. Killing those pages would
change test coverage, not configure a worker pool.

`tests/baselines/browser-worker-configuration.json` enumerates all37 suites and
the source hash of the serial runner. No ignored `--workers` argument or inert
worker-count environment variable has been added. The first automatic main run
after PR76,40434881659, provides a further observation of the existing one-worker
configuration against the identical tested PR tree/run40428946697. Its wall-time
and recorded long-task comparison is **1→1 observational variation**, not a
2→1 concurrency experiment or a causal claim about contention. No extra CI run
is dispatched for that observation.

The completed 1→1 observation is recorded in
`tests/baselines/browser-worker-observation.json`. Both runs independently
passed the full 37/0/37 conjunction (738 checks) on the identical tree and
Playwright 1.64.1 / Chromium 156 software renderer:

| Run | Whole CI | Looks |
| --- | ---: | ---: |
| PR76 / 40428946697 | 42.8333 min | 1097.47 s / 18.2912 min |
| main / 40434881659 | 43.1333 min | 1651.18 s / 27.5197 min |

Whole time increased by 18 s (0.7004%); balanced-2 was critical in both runs. Both
material-family paths completed in both, with no appearanceMaterialPreset
timeout in either covered run; its risk remains open. Across the same 31 product
wait windows (synthetic controls excluded), wait-overlapping long-task durations
were median 142→108 ms, p95 546→797 ms, maximum 6217→4476 ms. The summed
duration of those tasks increased from 21,078 to 28,210 ms. These mixed changes do not establish
improvement, especially since no worker configuration changed. No drift
threshold or new allowance was added.
