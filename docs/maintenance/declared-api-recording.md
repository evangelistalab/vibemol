# Declared API-surface recording

This reusable recording mode accepts **one API-member removal**, declared in
`tests/baselines/api-surface-delta.json` before recording. It is not an ordinary
comparison exception, a local golden editor, or an automatic baseline update.

The declaration binds an immutable ancestor commit, the SHA256 of its golden
gzip, the fixed102-capture inventory, and exactly one operation with a namespace
and member. Unknown keys, additions, renames, arbitrary paths, multiple changes,
missing/duplicated old members and a capture count other than102 are rejected.
Future removals need a new explicitly reviewed declaration; this machinery
does not expire after the current alias retirement.

`record-release-baseline.yml` offers `mode=declared-api-removal` on an ordinary
branch, with `source_commit` set to the full immutable head. The existing
release mode and its restrictions remain separate. The API mode requires a
workflow dispatch in GitHub CI, exact HEAD/GITHUB_SHA identity, a non-shallow
repository, a byte-identical archived source, two runs, no harness injection,
no fixture preparation and no release-recording flag. It verifies the committed
declaration and the previous baseline digest before starting a browser.

After **each** actual capture, the recorder constructs the expected result by
removing the named member exactly once from `capture.api[namespace]` in every
one of the102 previous captures. A strict recursive comparison then rejects
every other added/removed/changed leaf or type, including float drift and signed
zero. There is no version tolerance. Actual raw captures are saved before this
comparison, so a rejection retains its evidence. A failed comparison cannot
write a new golden.

Two independent CI jobs each record twice. The comparison job checks the same
declared delta against all four raw captures, binds the source proofs and
promoted golden/summary to them, and requires four identical serializations.
The resulting `ci-comparison.json` records102 removals per run and zero residual
differences. Promotion copies the CI-produced files; it does not synthesize a
new local baseline. Dataset provenance changes to the actual capture commit and
`tag: declared-api-removal`; this denotes a dataset, not a Git release tag.
Historical release datasets and tags remain unchanged.

The promoted candidate still needs its own complete ordinary37/0/37 conjunction,
including102 captures twice/exact repeat,48 slots/eight contexts/all minima,
both exporters, both Looks material-family paths, units, WebKit and construction.
The recording run does not supply merge acceptance. No accepted failure is
added and no ordinary comparison reads the declaration.

The first declaration is the human-authorized retirement of
`VibeMolElementUtils.getElementSymbolByAtomicNumber`, against the baseline in
6043d8e. Only that exported name is removed; the existing display-placeholder
helper and strict chemistry helper remain. The old test matrix is retained
against the appropriate current contract. An independent projection prepared
before recording confirms the expected102 API-name removals and zero other
capture differences; actual CI readback must independently prove the same.
