# PubChem migration diagnostic — confirmed candidate-only regression

[One CI run, 39062919011 attempt 1](https://github.com/evangelistalab/vibemol/actions/runs/39062919011), harness `323fbf9332a49477f99cb3a447bb4037335ed104`, ran the full repaired `look_references.py` suite once on each unchanged source in parallel. Both halves of the target compound assertion were split, logged before either could abort, and retained their original expected values and readiness condition. The resolved appearance setting, references, full rendering settings, stored legacy input and timestamp were logged on pass and failure. No production source or golden changed; no further run, fix or merge followed.

| Source | Expected IDs | Actual IDs | Expected flags | Actual flags | Suite |
|---|---|---|---|---|---|
| Tagged `1c609b3` | `[opal,classic]` | `[opal,classic]` | `[false,false]` | `[false,false]` | pass |
| Integration `6c58355` | `[opal,classic]` | `[opal,classic]` | `[false,false]` | `[false,false]` | pass |
| Candidate `25fd30a` | `[opal,classic]` | `[basic,basic]` | `[false,false]` | `[true,true]` | fail |

Both controls also passed `[classic,classic]` / `[false,false]`; the candidate stops on the original first failing predicate. `appearance.look` was absent from public exported settings in every source because it is import-only. The stored legacy `appearance.look` was the same Opal object in all three at the failing comparison, and the complete resolved rendering settings were **exactly equal across sources**. The candidate retained Basic reference identities and marked both halves modified, despite having restored the same rendering values. `comparands.json` contains every measured row; original JSONL files and full results preserve the complete settings.

The result takes the human's **fails only on candidate → regression, stop and report** branch. It is not a carried tagged-base finding. [PR24](https://github.com/evangelistalab/vibemol/pull/24) remains frozen and unmerged; accepted integration is `6c58355` / **265** lets. Proposed PubChem remains **262** lets / **13** dependencies. There is no diagnostic merge-gate substitution.

## Initialization order

The extraction did not move Appearance API publication across migration. The new dependency on a later constructor breaks an already earlier call:

1. Candidate app.js:27745 calls `restoreAppearancePresetAutosave()`.
2. The synchronous import calls `afterApplySettings` → `updateSidePanel` (:29232) → the hoisted metadata wrapper (:30609).
3. The new wrapper reads `const pubchemController`, whose initialization is only at :30630. JavaScript puts that read in the temporal dead zone.
4. The restore function catches the error. `afterImportSettings`, which records pending legacy appearance migration, is skipped.
5. Looks construction still runs at :32423 and publishes `VibeMolAppearanceLooks` at :32484. The public API therefore exists while reference bookkeeping is wrong.

The original metadata function was hoisted and did not depend on the later PubChem busy-state declaration. The earlier structural source audit missed this incoming call before constructor availability. `startup-order-audit.json` preserves source excerpts, hashes and exact positions on all three trees; it is a static source proof, not an invented browser exception trace. The measured comparison establishes the regression independently. A narrow proposed correction would make controller construction available before startup restoration while retaining original DOM lookups and late control binding, after auditing all constructor-input availability. **No production correction was written.**

All original artifact ZIP digests match GitHub. Raw checkout identities, immutable source app/tree hashes, identical harness/test/helper hashes and raw-log/JSONL/report comparands agree. Environment: Chromium **156.0.8078.4**, Playwright **1.64.0**, Python **3.12.15**, Linux x86_64. Generated screenshots and original ZIPs remain in the ignored raw archive.

The original ordinary run39057387687 remains failed at **32/5/37**. Its `#appearanceMaterialPreset` coverage is **not covered this run**, since Looks failed before both material-family paths. The current coverage record supersedes the older “no timeout observed” wording without rewriting the sealed failed-run evidence.

The standing comparand-logging rule is added to `AGENTS.md`. Accepted Stage5 notes are in `docs/stage5-seam-design.md`: **5a** two trajectory shadows with cleanup preserved, **5b** vibration, **5c** symmetry; the shared mirrored-clock hypothesis for #11 is **refuted**, while the observed #11 product defect remains open. No Stage5 implementation began. Workspace documentation/test updates and this curated evidence are uncommitted; neither immutable source branch was changed to attach them.
