# Live contrast baseline — v0.9.4

The earlier outliner contrast finding was retracted because its CSS color
parsing was incorrect. The custom measurement in `tests/e2e/ux_review.py` has
been removed. The existing v0.9.3 outliner colors remain. The follow-up chip
fix uses the existing dark foreground for C, P and Fe, retaining their CPK
backgrounds and the normal foreground-selection behavior for custom colors.

`tests/e2e/accessibility.py` injects unmodified **axe-core 4.11.0** in real
Chromium and runs only `color-contrast` against the live document. The engine is
pinned and checksum-verified under `tests/vendor/axe-core/`, with its license
and provenance. It is never loaded by the production app.

## Fixture and results

- Chromium **145.0.7632.6**, 1512 × 950 CSS pixels, device scale 1; bundled fonts loaded.
- Fresh isolated browser context for each theme/mode; bundled `sample.cube`.
- View opens Camera; Measure opens Measurements; Edit opens Build; Calculations
  opens Subspace, selects carbon 2p, and expands its settings, basis and π-plane sections.
- The audit covers the whole rendered document, including the selected outliner
  row and top bar. Subspace is additionally scrolled through at overlapping
  positions to test fields beyond its first viewport. No colors, styles, pseudo
  elements or rendering code are modified for the audit.

Counts below are **unique element targets per case**, not counts of rules.
`color-contrast` is the single rule under test.

| Theme | Mode | Violating targets | Unresolved targets | Passing targets |
| --- | --- | ---: | ---: | ---: |
| Light | View | 0 | 4 | 197 |
| Light | Measure | 0 | 4 | 172 |
| Light | Edit | 0 | 6 | 188 |
| Light | Calculations | 0 | 7 | 184 |
| Dark | View | 0 | 4 | 197 |
| Dark | Measure | 0 | 4 | 172 |
| Dark | Edit | 0 | 6 | 188 |
| Dark | Calculations | 0 | 7 | 184 |

**No confirmed violations remain in these fixtures.** All three corrected Build
chips use `#0b1220` text in both themes. Their backgrounds are unchanged:

| Chip | Target | Background | axe contrast ratio |
| --- | --- | --- | ---: |
| C | `button[data-z="6"]` | `#7f7f7f` | 4.67:1 |
| P | `button[data-z="15"]` | `#ff8000` | 7.43:1 |
| Fe | `button[data-z="26"]` | `#e06633` | 5.45:1 |

Previously axe flagged Fe at 3.22:1 and marked C/P incomplete because their
single-character labels failed its short-text heuristic. They were not passes.
The updated harness requires an actual passing `color-contrast` result for each
chip, checks its unchanged background, and records axe's measured ratio. No
heuristic is disabled and no contrast calculations are reimplemented.

**Incomplete is not a pass.** axe requests manual review for:

- The four mode labels in all cases: a pseudo element prevents background determination.
- Edit: Coordination and Fragment attachment selects whose background images
  prevent determination.
- Calculations: Reference and Selection method selects (background images), and
  the generated-input textarea (partially obscured).

For scrolled Subspace views, a node is counted as unresolved only if axe never
obtains a definite result for it. A violation in any view always wins over a
pass in another view. Raw results from every position are retained. These
fixtures are a repeatable baseline, not an accessibility certification of
unopened dialogs, other panel configurations, or the rendered molecular canvas.

## Repeat and review

```sh
python3 tests/e2e/accessibility.py
# Only after inspecting changed findings:
python3 tests/e2e/accessibility.py --update-baseline
```

The first command is part of `make test-e2e`. It fails on newly violating or
newly unresolved element targets, including when totals happen to stay the
same. Existing issues remain explicitly reported. Updating the baseline is a
separate, deliberate command.

`tests/baselines/color-contrast.json` records the app/engine/browser versions,
viewport, counts, target selectors, element HTML and axe's reasoning and
measurements. Raw per-position results and screenshots go to the test artifact
directory (`out/test-artifacts` or `VIBEMOL_TEST_ARTIFACT_DIR`).

The AVAS hit-target regression is in `tests/e2e/ux_review.py`: all six reported
fields are **32 px high**; the supplied document-wide scan of laid-out controls
returns **no targets smaller than 24 × 24 px** in the expanded Subspace fixture.
This checks geometry rather than inferring dimensions from stylesheet values.

API reference: [axe-core documentation](https://github.com/dequelabs/axe-core/blob/v4.11.0/doc/API.md).
