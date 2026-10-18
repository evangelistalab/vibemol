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

## Settled scans and the named canvas-backed set

The separate harness correction cites [diagnostic39154813750](https://github.com/evangelistalab/vibemol/actions/runs/39154813750), measured on the tagged base, accepted release PR tree and main three times each. The old fixed350ms preparation and100ms scroll delays did not guarantee a settled audit. Every scan now waits for `document.fonts.ready`, finite CSS transitions to finish or cancel, and two requestAnimationFrames after the last transition. No assertion retry, sleep, color substitution or app-style mutation supplies readiness.

The original `color-contrast.json` incomplete inventory remains unchanged. `accessibility_contract.py` names only light/Calculations and dark/Calculations `#hint`, for axe's `color-contrast` / `imgNode` result with related `#canvas` whose HTML is actually a canvas. It remains an incomplete manual-review finding, never a passing contrast measurement. The same selector with a different reason, another case or canvas, a different target over the canvas, or a confirmed violation fails. Actual/baseline/named/unexpected target sets are printed on success and failure. Negative controls cover those distinctions and same-count target swaps.

The diagnostic is not a merge gate. See `docs/refactor-release-retrospective.md` for the repeated deferral and the distinction between class repair and a passing replay.

The nine-run diagnostic measured original-suite outcomes: tagged base3pass/0fail, accepted04eaf66 tree2/1, main323d03f1/2. All108 raw scans were independently compared;385 compositor-frame hashes were verified, and the three frames immediately before the failing scans were visually reviewed. Eight raw hint-incomplete scans occurred during its auto-hide opacity transition, three in light Calculations and five in dark. The tagged suite can still pass because an earlier definite pass resolves its later incomplete. At the three failing dark scans opacity was0.577596 /0.856722 /0.72195; the hint's theme-background transition had ended3456.10 /4520.50 /3906.70ms earlier. Actual compositor frames show the rendered molecule561.31 /540.13 /572.34ms before axe. The supported mechanism is the hint auto-hide fade, not a scan before canvas presentation or during the earlier theme-color transition. Read-only instrumentation can perturb timing; these counts are observations, not a population flake-rate estimate.
