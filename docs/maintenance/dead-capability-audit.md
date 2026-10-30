# Dead-capability audit

This is a retained inventory with dispositions, not permission to remove APIs or
tests. The direct human request covers exports and the atom-annotation stores;
dead DOM / unread `els` (Part C) remains deferred.

The source snapshot is main `58b9e15b47ea3b5cedfa527548a845ca63a2c2f9`.
The corrected taxonomy puts the primary result first:

| Bucket | Members |
| --- | ---: |
| built-but-unwired | 66 |
| harness surface | 42 |
| live | 317 |
| deps-passed | 23 |
| console/API | 49 |
| unreached | 62 |
| Total | 559 |

The 89 namespaces exactly match the in-scope part of the existing runtime API
census in `tests/baselines/characterize-summary.json`. That census has 571 members
across 92 namespaces: the other 12 belong to ListPopover, Prefs and Tooltip,
defined under `src/`, outside this request's definition scope. The audit starts
from that contract and recovers source definitions, aliases and factory-return
public APIs; it does not substitute a text grep for the surface check.

The corrected calibration is `VibeMolCoordination.listHaloCoordinationChoices`:
**built-but-unwired**, with its actual call at
`tests/unit/coordination.test.mjs:91` preserved. The first draft missed VM-loader
aliases and incorrectly reported zero references. That draft was rejected;
committed negative controls now cover the loader, lexical renaming, defaulted
dependency parameters, namespace-valued dependencies and finite computed keys.

`VibeMolTesting` is mechanically a harness surface, including currently unused
hooks. Public integration/console homes have reviewed reasons in
`tools/capability-dispositions.json`. Product-module helpers with tests but no
product caller are built-but-unwired. Imports and startup availability guards
do not count as callers; those references remain visible in the counts. Data
reads count as live without pretending that a constant is callable. A
deps-passed result must point to an invocation in the specific receiving
factory, including a renamed local dependency or a whole namespace dependency.

The full per-member dispositions and reference counts are in
[the export inventory](dead-capability-inventory.md). Per-site references and
dependency invocation proofs can be regenerated into an ignored JSON report.
The two baseline sets are explicitly enumerated in
`tests/baselines/dead-capabilities.json`.

An export with no outside caller is not necessarily an unfinished capability.
Many entries are implementations already used privately by their own module,
constants exposed for inspection, or compatibility aliases. The inventory
records internal calls separately. It intentionally does not label these
abandoned or authorize pruning. Investigate per item: wiring, keeping a public
contract, and retiring an unnecessary exported face are different decisions.

Specifically, **47 of the 66 built-but-unwired** and **34 of the 62 unreached**
members have calls inside their defining module. The primary set is mostly
unused exported faces of implementations already used privately. The remaining
entries include constants and compatibility aliases; absence of a direct call
does not by itself classify their history as abandoned or unfinished.

The store trace found exactly three atom-indexed maps in `structure.js` and
112 read/write/snapshot/transport boundaries. No wholly orphaned UI-written
store was found. Builder provenance drives group semantics; coordination feeds
geometry inference, halo targets and hydrogen planning; metal bonding feeds
perception and rendered bond styles. All three survive clipboard and
structure/session transport. See [the complete store inventory](annotation-store-inventory.md).

In particular, the missing call to `listHaloCoordinationChoices` does not prove
the coordination store is disconnected: the halo currently reads choices from
the profile plus inference compatibility. Setting a preference also does not
promise to rearrange existing atom coordinates. Whether that is the desired UI
behavior is separate from whether the preference is consumed.

## Running and maintaining the check

Use the same pinned test-only Babel packages as the construction audit:
`@babel/parser@7.24.4` and `@babel/traverse@7.24.1`. Set
`VIBEMOL_BABEL_ROOT` to their `node_modules/@babel` directory.

```sh
node --test tests/unit/capability-audit.test.cjs
node tools/audit-capabilities.cjs --out out/test-artifacts/capabilities.json
node tools/audit-annotation-stores.cjs out/test-artifacts/annotation-stores.json
```

Pass `--markdown docs/maintenance/dead-capability-inventory.md` to the first
audit, or `--markdown docs/maintenance/annotation-store-inventory.md` after the
JSON output argument to the second, to regenerate the committed tables.
`--inventory` prints counts without performing baseline acceptance; it is for
reviewing a proposed inventory, not for replacing the check. Create the output
directory before writing reports.

Ordinary CI runs the tool's unit controls and both audits after installing
the existing pinned construction-audit dependencies. Raw reports are uploaded
with that job's evidence; the 37 browser suites and their intentionally empty
accepted-failure set are unchanged. This audit does not supply a browser gate.

The check compares each enumerated allowance set with the predecessor baseline
using the pull request base, push `before`, or local merge-base with origin/main;
`--base SHA` makes that comparison explicit. A current new item fails even if
the count is unchanged. Editing the baseline to include it also fails against
its predecessor. Shrinkage is allowed. Growth requires a separately reviewed,
explicit human authorization and a corresponding item-specific guard change;
there is no automatic accept/update switch. The initial audit creates the
baseline once where none existed; subsequent revisions compare against it.

## Limits

This is direct use, not transitive reachability. A caller can itself be dead.
A handler can be attached to a UI element that never renders. Neither case is
proved here; the latter belongs to deferred Part C. Controller instance methods
and nested object schemas are not additional namespace members.

Lexical aliases, destructuring, static brackets, simple local factory returns,
defaulted factory parameters and finite literal-key loops are handled.
Arbitrary dynamic access, reflection, runtime mutation and unknown external
consumers remain limits. The two unresolved `element-utils` expressions read
names from its legacy fixture; their possible targets also have resolved uses
and do not change the classifications. Raw output lists unresolved expressions
and Python-fragment fallbacks instead of silently treating them as proof.

Executable JS, embedded HTML scripts and Python-embedded JavaScript are scanned.
Comments, prose, historical evidence and API-surface membership alone are not
executable callers. Annotation tracing supplements known accessors/direct
paths with explicit whole-volume transport routes; it is not arbitrary
data-flow analysis. These limits prevent reading the inventory as exhaustive
dead-code or product-reachability proof.
