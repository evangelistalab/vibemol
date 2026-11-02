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
| Premerge | atomic-identity-rejection | 24 |
| Smoke | video-activation | 58 |
| Smoke | video-export-completion | 2 |
| Smoke | smoke-spinor-launcher | 8 |
| Look references | registry-readback | 500 |
| Axis gizmo | escape-native-case | 62 |
| Edit tool | metal-native-case | 28 |
| Build panel | retired-cache-case | 4 |

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

The five ordinary gaps identified by the audit are now guarded in each matrix, worker and join:

| Phase | Required completion records | Guard |
| --- | --- | --- |
| Appearance registry | 500 | Actual completed key comparisons, replacing the former formula. |
| Native Escape | 62 | One record after every completed native press case; the1248-cell table stays separately guarded. |
| Metal popover | 28 | One ordinary native case completion record per context/viewport. |
| Atomic identity | 24 | One record after every fully checked rejected-input case. |
| Retired-cache UI | 4 | One record after each fully checked layout/theme case and context retirement. |

These guards close omission risks; the observed original cases did not fail and
were not absent. Existing functional assertions, waits and native behavior are
unchanged. Each matrix checks only its explicitly named phase markers, while
the worker and join require the whole entry point inventory. A missing phase
cannot disappear from its own expected set by reporting an empty counter. The separately invoked
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

The count-guard PR88 first run41507894572 passed the complete37/0/37
conjunction at cd3fe13 and merged as03f1741 with an identical entire tree.
All five matrix counters and independently recounted raw comparands matched.
The durable record is `tests/baselines/checkpoint-count-ci.json`; raw artifacts
and the immutable archive remain ignored. The separate risk batch adds84
Testing-adapter cases under Premerge with the same matrix/worker/join guards.
