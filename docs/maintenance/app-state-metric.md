# App state metric reconciliation

All historical headline figures counted lines in app.js matching `/^  let /`.
They did not count individual bindings. The read-only Babel audit now reports
both, using the same app-IIFE scope at every immutable source checkpoint.

| Checkpoint | Declaration lines | `let` variable bindings |
| --- | ---: | ---: |
| Tagged v0.9.5-pre-refactor / 1c609b3 | 313 | 324 |
| Published 0.10.0 / 3425e02 | 249 | 260 |
| Defect batch before retirement / d849429 | 251 | 262 |
| PR75 / 036bc3b and PR76 / f8a099f | 250 | 261 |

The release removed 64 app variable bindings: **324 → 260, 19.7531%**.
Its historical line reduction was **313 → 249, 20.4473%**. PR76 removed
63 bindings relative to tagged base (**324 → 261, 19.4444%**).

Since publication, `appearancePresetAutosaveFailure` and `hintMessageSticky`
were added for the approved restore-failure reporting repair; the dormant
`selectionFragmentCuePopoverHideTimer` was removed. This accounted for PR76's
net increase of one variable binding over the release.

The extra eleven bindings existed before the refactor and have not grown:
the Figure holders declare four names together (+3), Calculations holders five
(+4), and Figure post-processing holders three (+2). One input-gesture line
contains three separate `let` statements (+2). No declaration packing created
the apparent reduction.

The previously reported 263 bindings also contained an audit mistake: Babel
assigns `kind: "let"` to the `VmNumberInput` and `VmSlider` class declarations.
They are unchanged at all checkpoints and are now counted separately. The
broader Babel-kind totals are 326 at tagged base, 262 at release and 263 now;
they must not be called variable-let counts.

This measures mutable variable bindings **inside app.js's IIFE**, excluding
function/block locals and state moved into extracted modules. It is not a
claim that total mutable state across the program fell by the same amount.
Historical immutable evidence retains its original metrics; the reconciliation
explains their scope instead of rewriting old results.

`tests/baselines/app-state-metric.json` records source hashes, exact names and
declarations at each checkpoint. Reproduce with the existing Babel tooling:

```sh
NODE_PATH=/usr/local/lib/node_modules/gatsby-cli/node_modules node tools/diagnostics/recount_app_state.cjs out/test-artifacts/app-state-metric.json
```

The historical mode reads Git objects and writes the requested report.

## CI ratchet

Main `994ec027` had 250 matching regex lines and 261 AST variable bindings.
The AST located the same declaration lines and found 252 separate statements.
Removing `__lastBondUpdate` left 249 lines, 251 statements and 260 bindings.
The live cap in `tests/baselines/app-state-metric.json` is **260**.
The [locality audit](app-state-locality.md) records the 37 low-use bindings
and their proposed owners.

CI counts the app IIFE with the pinned Babel parser. It fails above the cap
and compares the recorded cap to the predecessor from the GitHub event.
For the first adoption, it measures the predecessor's app directly. A higher
cap requires exactly one reviewed `approvedIncreases` record with the exact
`baseCommit`, `from`, `to` and a reference to explicit human `authorization`.
The check validates the record's match. Review verifies its authority. Lower
the recorded cap alongside a binding reduction.

The check produces exactly one `app-state-ratchet` receipt, counted separately
from the process exit. Run it with the pinned Babel tooling:

```sh
node tools/diagnostics/recount_app_state.cjs --check out/test-artifacts/app-state-ratchet.json
```

The optional final argument is an explicit comparison base. Local checks
default to the merge base with `origin/main`. Both modes write evidence only.
