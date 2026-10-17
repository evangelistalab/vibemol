# Three-source 320px diagnostic: CI failure not reproduced locally

Reviewer seq5 requested three focused runs each on tagged `1c609b3`, integration `e35da9c` and proposed `537e95f`. All nine completed with the original overflow boolean true and both unchanged width320 assertions passing. Every case was Workbench/light, 320×1000; tools measured 304 scrollWidth / 304 clientWidth. The overflow button was visible, its five-row menu present but hidden/closed.

This invokes the unchanged `edit_tool.run()` setup and event sequence through its first responsive iteration: focus Transform, ArrowRight selects Build, original 100ms wait and original assertion. A page proxy observes only after that expression evaluates and preserves its boolean. If width320 passes, it stops before width390 and skips the unrelated visual-schemes routine. These are focused comparisons, not full-suite pass claims; no production code, shipped test, assertion or wait was changed.

Runtime: macOS arm64, Playwright 1.60.0 / Chromium 145.0.7632.6, SwiftShader. The failing CI is Linux x86_64, Playwright 1.64.0 / Chromium 156.0.8078.4. The same CI gate remains 33/4/37; no run was retried, no accepted failure added, no merge attempted. Passing these local cases does not classify the CI-only failure as pre-existing, a source regression or a flake.

All nine local passes are outside the reviewer reply's pre-decided failing/inconsistent branches. The unresolved 320px gate cause is handed to the human under the mailbox's second-stop rule. Symmetry stays unmerged, integration remains let275, Colors and the stage-boundary soak remain unstarted. A further diagnostic in the failing environment requires release.

This directory is documentation-only evidence on a separate branch; it does not alter the frozen candidate. JSON records each run and its source/runtime, logs preserve actual exits, PNG/HTML preserve page state. The raw manifest hashes pre-compression bytes; the committed manifest hashes the stored compressed files. Complete raw diagnostic evidence is in the ignored archive identified by `immutable-evidence.sha256`; source snapshot exports and pycache remain ignored and are not duplicated here.
