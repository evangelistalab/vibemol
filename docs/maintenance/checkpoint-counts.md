# Reported checkpoint counts

PR87 keeps the ordinary gate at37/0/37 with an intentionally empty accepted
set. It adds a separate completion requirement for the API matrix at the moment
that matrix becomes reachable. Green process exit alone is insufficient.

The rejected run41384810185 executed every existing browser entry point once,
but its API call was after `return 0`. Expected115 comparisons and26 rejected
requests therefore produced zero records. Local direct execution was not CI
acceptance. The corrected call follows original browser retirement and precedes
the return; a real-entry-point unit control verifies that ordering.

The manifest requires these raw JSON record cardinalities:

| Entry point | Marker | Required records |
| --- | --- | ---: |
| Premerge | edit-api | 115 |
| Premerge | edit-api-rejection | 26 |
| Smoke | video-activation | 58 |
| Smoke | video-export-completion | 2 |
| Smoke | smoke-spinor-launcher | 8 |

The API matrix asserts its actual counters before writing a successful summary.
Workers count records independently, preserve the real `processExitCode`, and
record a failed suite outcome when evidence is missing. They still collect all
remaining assigned suites. The join recomputes cardinalities from raw logs and
checks the recorded evidence. Empty, short, extra, malformed or forged counts
fail. Every independent comparison still asserts its values; counting a failed
comparison cannot turn a failed subprocess into a pass.

The audit inventory is `tests/baselines/checkpoint-count-audit.json`. It covers
all37 ordinary entry points,64 local-import files and the dynamically launched
support phases. Actual observations are pinned to run41384810185. Existing
characterization/identity, scientific-buffer cases, paired-control census and
surface contexts already assert their relevant counts or named compositions.

Five other ordinary phases lack a completed-cardinality guard:

| Phase | Observed coverage | Gap |
| --- | --- | --- |
| Appearance registry | 10 states ×50 keys | Reported500 is a formula, not an executed-comparison counter. |
| Native Escape | 62 cases | Case array has no exact completion-count assertion; the separate1248-cell table is guarded. |
| Metal popover | 28 cases | Per-case assertions exist, but no exact completed-case count. |
| Atomic identity | 24 rejected inputs | Rejection records are checked individually, without an exact completion count. |
| Retired-cache UI | 4 cases | Layout/theme cases are checked individually, without an exact completion count. |

These are omission risks, not claims that the observed cases failed or were
absent. Their existing behavior is unchanged in this PR. The separately invoked
autosave fault campaign likewise reports `caseCount` without a requested-campaign
count guard; it is not ordinary37 coverage and varies by requested campaign.

Counts do not prove every behavioral branch was reached. Qualitative success
labels are not numeric coverage declarations, and not every legacy entry point
now has a checkpoint counter. Unit frameworks report totals that can grow; those
are not fixed browser-cardinality contracts. Pixel/grid/array-size and collision
counts are measurements, not numbers of executed assertions. Named collision
allowances can shrink freely, so pinning their observed count would be wrong.

## Authoring check

`make check` invokes `tools/check_unreachable.py`, using ESLint10.14.0 and
Pylint4.1.3. ESLint's sole enabled rule is `no-unreachable:error` in the root
flat config. Python enables only `W0101` on the command line; Ruff/Pyflakes has
no equivalent unreachable-code rule. CI installs the isolated lint tooling,
while the browser/diagnostic Playwright lock stays unchanged.

For local use, activate the CI Python environment, install
`tools/requirements-lint.lock`, and install ESLint10.14.0 into an isolated prefix.
Set `ESLINT` to that prefix's `node_modules/.bin/eslint`; `PYLINT_PYTHON` can name
a separate Python environment if needed. Then run `make check`.

The scope is owned tracked/new source under assets/app, src, api, tests/e2e,
tests/unit and tools. Vendors, generated/copy output and historical evidence are
excluded. This is file lint, so JavaScript embedded in Python strings or HTML is
not covered. It catches unconditional unreachable statements; it is not a full
cross-function reachability proof. The earlier annotation scanner's absent-return-
argument failure is a different AST-nullability case, covered by its own tests.
