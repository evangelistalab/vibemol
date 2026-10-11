The completed run is **accepted at CI 34/3/37** after correcting the workflow specification. No suites were rerun. `browser-results.json` retains the original mis-specified rejection; `browser-results-reevaluated.json` records acceptance by (suite, workflow). Issue #11 fired in **trajectory** after the second download, so vibration was not reached. The corrected gate accepts either exporter at this exact workflow, and no other smoke failure.

Build identity evidence comes from the separate completed CI run 38100155036 on app SHA `32bbc85f…`, not this pre-cache run. Its eight launch/theme contexts each checked 43 identities and passed all firing minima. The source audit records only four Build conversions, the cache helper and the QA bridge; all 1,190 existing function declarations are exact after reference substitution. This old Build evidence is historical only; it is not combined with this run as merge proof. Merge #12 on its own run, then rebase #8 and require one CI run carrying both gates.

The following records the original interpretation before the user corrected the specification:

Fresh CI run [38141289409](https://github.com/evangelistalab/vibemol/actions/runs/38141289409), head `d2fb002188c8324ac9d4dc1524818b4201d5c0bc`, executed all 37 suites once: **34 passing / 3 failing / 37**, but the exact accepted gate **failed**.

Axis-gizmo Escape routing and mode-consistency's selection-card collision match their accepted fingerprints. Smoke fails at `smoke.py:4394` → `ci_gate_diagnostics.py:88`, waiting for the **trajectory** crop overlay to become hidden after Stop/export. The manifest accepts the **vibration** caller `smoke.py:4531` (historical 4525). Smoke's test hash and exception type are unchanged, but the different caller is correctly rejected. The earlier #11 investigation covers both exporters; this result does not authorize widening the manifest or fixing production code.

Both 102-capture characterization runs match the unchanged goldens and are exactly identical to each other. CI uses Linux x86_64, Chromium 153.0.8010.12 and software SwiftShader. Checks/unit passed. `looks.py` passed; its open material-preset intermittent remains open.

PRs #12 and #8 remain open, Stage 3 stays closed, and the four Build conversions are unchanged. Stop the sequence without rerunning CI, changing the gate, or opening another cache group. This attempt completed before the newly authorized recurring watch was created, so no recurring automation was started. The source and manifest are unchanged; these files record the outcome.
