The unchanged `tests/e2e/edit_tool.py` fails its 320 × 1000 Workbench overflow assertion on **both** the current integration control and the frozen Symmetry proposal. The same integration tree previously passed the suite in CI. Carry this finding independently of the Symmetry cache conversion; the CI failing-set gate remains unchanged.

Instrumented diagnostic: [run 39034319620, attempt 1](https://github.com/evangelistalab/vibemol/actions/runs/39034319620). Both jobs use Linux x86_64, Ubuntu image `20261012.334.1`, Python 3.12.15, Playwright 1.64.0, Chromium 156.0.8078.4 and ANGLE Vulkan SwiftShader (Subzero).

| Numeric observation at the original assertion | Integration `e35da9c` | Symmetry `537e95f` |
|---|---:|---:|
| `.wb-tools.scrollWidth` | 442 px | 442 px |
| `.wb-tools.clientWidth` | 12 px | 12 px |
| Original assertion result | false | false |
| Milliseconds since last `fitTools()` entry | 244.2 | 230.8 |
| `fitTools()` calls observed | 150 | 148 |
| Overflow trigger present / hidden | yes / yes | yes / yes |
| Trigger `aria-expanded` | `false` | `false` |
| Overflow menu row count | 0 | 0 |
| Overflow menu hidden | yes | yes |

Both records have `barClasses="wb-bar"`, Build selected, Transform unselected and focus on `editAdaptiveAddAtomBtn`. No page errors occurred. The original assertion, including its one-pixel tolerance, fails identically:

```python
assert page.locator('.wb-tools').evaluate('el=>el.scrollWidth<=el.clientWidth+1'),width
# AssertionError: 320
```

The full stock setup starts at 1440 × 1000, enters the width loop at 320, focuses Transform and presses ArrowRight to select Build, then uses the existing 100 ms wait. No extra click, wait or assertion relaxation was inserted. Both suite executions stopped at this assertion; later widths and visual-scheme checks were not reached.

Measurement method: a harness-only conditional DevTools breakpoint timestamps the first statement of `fitTools()` and always returns false, so it never pauses the debugger. A Python page/locator proxy runs the original JavaScript assertion expression first and captures its numeric readback in the same JavaScript task, returning the original boolean to the unchanged Python assertion. No production source, shipped test or golden was modified, including the source served by the browser. Debugger instrumentation can affect timing; the identical probe was applied to both trees. These measurements establish a failure on integration as well as Symmetry, not the precise production cause or deterministic recurrence.

Exact inputs:

- Integration commit `e35da9ca4721ad0645f9b0744aa38bfd9ca4b18d`, tree `6ceaa9597ba745d93b1e0632f7e6a3c7b32f0712`.
- Symmetry commit `537e95ff462b5f2eb5fd6d3518e4525c0ea18e2f`, tree `65706809c7c337ee42a11a531e34eb2bb09c2000`.
- Diagnostic-only harness commit `6cb226eb9f142ae5327670034858deb56778345b` changes only a new diagnostic workflow and harness.
- Identical stock test SHA256 `98a36be008222ed186e27e78db1c32bbc56bdbce093e1635b51b4ce7a0c647f0`.
- Identical served `workbench.js` SHA256 `2c2f076d1942ae9508debd82130e5424e61b52ece30ba10f072d106ab58d88b5`.

Raw evidence is in run artifacts `edit-tool-320-integration` and `edit-tool-320-symmetry`: emitted numeric objects, result JSON, failure HTML/screenshots/log, exact harness and dependencies. Both artifact archives were downloaded and checked against their GitHub SHA256 digests; extracted files and raw logged readbacks were independently compared.

Prior observations: [integration-equivalent CI 38989104040](https://github.com/evangelistalab/vibemol/actions/runs/38989104040) passed `edit_tool` in 82.10 s but recorded no numeric widths. [Original Symmetry CI 38994402382](https://github.com/evangelistalab/vibemol/actions/runs/38994402382) failed this same assertion in 17.00 s, leaving its original 33/4/37 gate failed. A separate local Chromium 145 focused comparison passed three times on each of tagged base, integration and Symmetry; it does not classify the Linux Chromium 156 outcome as deterministic or prove reproduction on the tag in CI.

Direct human disposition: both-tree overflow is carried as pre-existing at the integration baseline. **This diagnostic is not a merge gate**, does not replace the original failed run, and does not enlarge the three accepted CI failures. A new Symmetry candidate carrying this evidence still needs its own complete first-pass, uninstrumented 34/3/37 + characterization/identity/checks/WebKit conjunction. No production fix is part of this issue filing.
