# CI execution and evidence

Checks/unit, five Chromium suite shards, two characterization workers and the WebKit Properties check start independently. Neither matrix cancels siblings when a worker fails. Chromium jobs install only Chromium; the WebKit job installs only WebKit. The binary cache key includes the installed Playwright package version, OS, architecture and browser. Each job still runs `playwright install --with-deps` so Linux system dependencies are present on cache hits, as required by the [Playwright CI guidance](https://playwright.dev/python/docs/ci).

`browser_suite.py` measures each suite's subprocess wall time with `time.monotonic()`, including browser/server startup. It writes `wallTimeSeconds` per suite and for the batch; `seconds` remains a compatibility alias. The committed scheduling measurements in `tests/baselines/browser-suite-timings.json` came from run [38763532071](https://github.com/evangelistalab/vibemol/actions/runs/38763532071), attempt 1, with exact source and browser provenance. These are scheduling data, not acceptance evidence for a different candidate. That run's aggregate was 33/4/37 because of the separately recorded accessibility finding; the current restored gate is34/3/37 after#21 was closed as test synchronization, but this historical accessibility failure is not in the accepted set.

| Slowest suite | Measured wall time |
| --- | ---: |
| looks.py | 1,917.99 s (31.97 min) |
| calculations.py | 854.45 s (14.24 min) |
| smoke.py | 734.96 s (12.25 min) |
| premerge.py | 628.36 s (10.47 min) |
| look_references.py | 397.01 s (6.62 min) |

The serial workflow took **10,278 s (171.30 min)** including setup, two characterization runs and WebKit. Its browser batch took 8,270 s; serial characterization took 1,880 s. `browser-shards.json` isolates Smoke and Looks. The other 35 suites use longest-processing-time allocation to the least-loaded of three shards (ties by suite/shard name): 1,867.74, 1,874.67 and 1,874.50 seconds. The projected suite critical path is Looks at 31.97 minutes, before setup, artifact transport and joins. Actual before/after workflow wall time and the candidate run are recorded in the PR after CI; estimates are not presented as measurements.

Workers run each assigned suite once and retain its actual nonzero exit code and raw log. Completing evidence collection does not certify the gate. `join_browser_shards.py` requires every planned shard and all 37 unique suites, verifies test hashes, recomputes each failure classification from raw logs and current workflow source, then checks exactly **34 passing / 3 failing / 37**. The only accepted failures remain axis-gizmo Escape/canvas focus, the selection card covering Coordinates Delete, issue#11's trajectory or vibration wait after the second download.35/2 is rejected as over-performance; exact workflow keys remain required. [Diagnostic39129507791](https://github.com/evangelistalab/vibemol/actions/runs/39129507791) invalidated Edit320's fixed-sleep expectation: observable compact readiness and a presentation boundary now precede the unchanged overflow comparison and comparand log. #21 is closed as test synchronization; diagnostic results never supply merge acceptance.

Each characterization worker runs one full 102-capture pass, checks unchanged committed goldens using the existing float-only tolerance, exercises four fresh launch/theme identity contexts and verifies session camera pinning. It explicitly leaves repeat certification pending. `join_characterize.py` independently checks both golden comparisons, exact serialized capture equality, the fixed 52-slot compositions and all reason minima in eight contexts. Workbench has 47 live + 5 issue-backed known absences; legacy has 48 + 4. Pixel hashes remain diagnostic. The default local two-run command and the separate original-tag baseline recording workflow retain their behavior.

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

For trajectory 5a and vibration 5b, the direct human rule also requires unchanged #11 behavior, stricter than the older trajectory-or-vibration accepted workflow. After the ordinary browser join, `tools/check-refactor-run.py` compares the exact signature with accepted run 39071994182 (trajectory, after the second download). A changed site/shape or disappearance stops the group. It prints counts, workflow and original-join comparands on both pass and fail. The five Python tests protect the stricter policy; the ordinary manifest is now the direct-human33/4 correction; the shipped320px width check gains comparand logging only.

Report Looks wall time and the actual completion of BOTH Studio and Properties material-family paths for every group run. If either path was not reached, record coverage as not exercised rather than absence of recurrence. The material-preset intermittent remains open after a passing run.

## Shared browser cache scope

The saved keys were correct, but all entries were under `refs/pull/N/merge`. The cache API confirmed no integration-branch entry; later PRs cannot restore another PR merge ref. `playwright-cache.yml` warms Chromium and WebKit on a trusted branch push when dependency/CI files change, using exactly the worker keys. PR27 disproved feature-branch priming: all eight jobs missed despite identical keys and versions. The merged workflow then saved both exact keys on `refs/heads/codex/app-js-decomposition` in automatic run39095059338. Warm only main/integration after relevant pushes; require the next PR’s actual restore logs before claiming the cache task complete. System dependencies are still installed on every worker. Verify actual cache hits from each candidate log; do not infer them from the presence of an action. See [GitHub cache scope](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching).

Ordinary CI and active diagnostics install `api/requirements-ci.lock`, including the same Playwright/transitive package versions, with Python3.12.15. The API client keeps its wider supported range in `api/requirements.txt`; the lock constrains CI deliberately. The published-tag baseline recorder retains its historical1.64.0 provenance and is not a control-comparison workflow. New diagnostic artifacts record the lock SHA256, installed versions and browser revision.

Issue50 arrival mode is part of the standing `smoke_input_diagnostic.py` tool. It executes the original complete prefix through the grow-add section, with the600ms assertion unchanged, and observes the existing authoritative selection setter. Native input, setter bounds, callback completion, first wait observations and frame/long-task records have separate timestamps. A late receipt never converts an original assertion failure into a pass. The separate30s observation ceiling reuses the existing default browser-wait ceiling solely to collect a late or missing receipt; it is not the selection budget. Five independent workers measure one activation each, without retries.
