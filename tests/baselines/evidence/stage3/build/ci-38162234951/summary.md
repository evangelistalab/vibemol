# Build cache merge evidence

PR #8 merged as `4db82178ee662735059717c006e10aff70592044` after [CI run 38162234951](https://github.com/evangelistalab/vibemol/actions/runs/38162234951), attempt 1, proved the entire gate on head `da3b5e0cafd42837b8554c4c308df3a297cea3a6` against merged #12 `e427e075bef8f8295aa5284d378322bdb1e471ed`. Both CI jobs checked out the same merge artifact `8b2be69`. The merge tree equals the tested candidate tree. This evidence was saved on the next adaptive draft; the tested Build candidate was not modified before merging.

All 37 suites ran once: **CI 34 passing / 3 failing / 37**. Raw logs confirm the accepted `(suite, workflow)` failures:

- `axis_gizmo.py`: Escape interception prevents canvas focus.
- `mode_consistency.py`: the selection card intercepts Coordinates Delete.
- `smoke.py`: #11 at `wait_for_video_idle(page, 'trajectory')` after the second download. Vibration was not reached. The previous run's vibration variant remains visible in its own historical evidence; this run is the trajectory variant.

Checks/unit and the additional WebKit Properties check succeeded. CI used Linux x86_64, Chromium 153.0.8010.12, software SwiftShader. No workflow retry, changed assertion, gate adjustment or production bug fix was included.

Both 102-capture runs match the unchanged committed goldens with the approved float policy, and the repeats are exactly equal. Capture SHA: `6b03ce194fbab60a399d42c42b6435c381b5d1e2e5cec9dd456e2460b77030f2`; golden gzip SHA: `98c26a9db67b9e73a70b53628fb7b12763d41e91a303f9e3fa12f68af650be50`. No pixel changes. Only the already-approved Stage 1/2 namespace additions are included in the expected API captures.

All 43 identities pass in all eight contexts. Per-context minima: presented 39 Workbench / 32 legacy; mode switch 5 / 4; observer panel transition 2; DOM replacement 1; session restore 1. Counts below come from this candidate's own two-run sweep. Observer mode firings exceed explicit calls in every context.

| Run | Launch | Theme | Presented | Mode switch | Observer panel transition | DOM replacement | Session restore |
|---|---|---|---:|---:|---:|---:|---:|
| 1 | Workbench | light | 39 | 408 | 1115 | 5357 | 1 |
| 1 | Workbench | dark | 39 | 408 | 1100 | 5463 | 1 |
| 1 | legacy | light | 32 | 9 | 849 | 3286 | 1 |
| 1 | legacy | dark | 32 | 9 | 834 | 3398 | 1 |
| 2 | Workbench | light | 39 | 412 | 1137 | 5650 | 1 |
| 2 | Workbench | dark | 39 | 408 | 1088 | 5466 | 1 |
| 2 | legacy | light | 32 | 9 | 788 | 2989 | 1 |
| 2 | legacy | dark | 32 | 9 | 823 | 3393 | 1 |

Aggregate: 284 presented, 1,672 mode, 7,734 panel transition, 35,002 DOM replacement, 8 session restore firings, each checking all 43 identities.

App SHA `32bbc85fee87165f4e4505ddd3c84e539de3f40f2eb473978758dce5c96db944` and QA SHA `334d8acc72d6a8bf553bb1e0084c49cf97495d02e481a6341a5361006436592c` are byte-identical to approved #8. All 1,190 existing function declarations match exactly after lexical substitutions. The production difference from #12 consists of the four approved Build conversions, helper and guarded QA bridge. Module lets: **306 after #12 → 302 after #8**; app lines 32,928 → 33,037; top-level functions remain 1,181.

`candidate-verification.json` records independent raw-log classification, test-file hashes, unchanged golden verification and recalculated firing minima. Older runs are historical; none supplies a missing component of this proof. The adaptive draft requires its own CI conjunction and cannot inherit this run as its validation.

Raw browser logs are preserved under `browser/`. `mode_consistency.log.gz` and `ci-run.log.gz` use lossless gzip to preserve original whitespace; decompress them to read the original bytes. The capture run archives are also lossless copies of the CI artifacts, not re-recorded goldens.
