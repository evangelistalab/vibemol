# Completed Stage 3 validation

All 41 mutable caches are integrated (40 memoized accessors and one canonical alias). The tracked app let declaration-line metric reached 265 against target 265. Element Colors adds eight const-DOM fields to els and retains the supported legacy launcher; it does not reduce lets. Its actual factory count is 19 → 18 → 11, ten genuine non-DOM dependencies plus els. No extra helper/controller or hidden dependency was introduced.

| Group | PR | Own CI | Tracked let count | Cache/const inventory |
| --- | --- | --- | --- | --- |
| editBuild* | [#8](https://github.com/evangelistalab/vibemol/pull/8) | [38162234951](https://github.com/evangelistalab/vibemol/actions/runs/38162234951) | 306 → 302 | 4 |
| editAdaptive* | [#13](https://github.com/evangelistalab/vibemol/pull/13) | [38177282064](https://github.com/evangelistalab/vibemol/actions/runs/38177282064) | 302 → 291 | 11 |
| editAtomsMenu* | [#16](https://github.com/evangelistalab/vibemol/pull/16) | [38266303089](https://github.com/evangelistalab/vibemol/actions/runs/38266303089) | 291 → 288 | 3 |
| editSelection* | [#18](https://github.com/evangelistalab/vibemol/pull/18) | [38989104040](https://github.com/evangelistalab/vibemol/actions/runs/38989104040) | 288 → 275 | 13 |
| symmetry/shared launcher | [#22](https://github.com/evangelistalab/vibemol/pull/22) | [39034824420](https://github.com/evangelistalab/vibemol/actions/runs/39034824420) | 275 → 265 | 10 |
| Element Colors const-DOM hand-off | [#23](https://github.com/evangelistalab/vibemol/pull/23) | [39039061120](https://github.com/evangelistalab/vibemol/actions/runs/39039061120) | 265 → 265 | 8 |

The mutable-cache groups introduce no controller dependency interface (N/A). Binding inventories are 4/11/3/13/10; including the existing cache helper yields inventories of 5/12/4/14/11. These are inventory counts. The existing periodic factory now has 11 explicit inputs. App.js is 33,070 lines with 1,181 top-level function declarations; all 1,190 existing app function declarations were byte-identical across the Colors hand-off. Its authorized factory declaration and legacy wiring changes are app +1 and periodic module −9 lines.

| 320px instrumented readback | Integration e35da9c | Symmetry 537e95f |
| --- | ---: | ---: |
| scrollWidth / clientWidth | 442 / 12 | 442 / 12 |
| Since last fitTools entry | 244.2 ms | 230.8 ms |
| Trigger present / hidden / aria-expanded | yes / yes / false | yes / yes / false |
| Menu rows / hidden | 0 / yes | 0 / yes |

Both unchanged assertions failed. [Issue #21](https://github.com/evangelistalab/vibemol/issues/21) carries the integration finding under the human's both-overflow branch. The diagnostic supplies no merge evidence, and its DevTools probe can affect timing; it does not establish a precise production cause. The original Symmetry 33/4 run remains failed. PR #22 passed its own first ordinary 34/3/37 conjunction before merge; edit_tool passed in 85.45 s with no numeric-width readback. Colors passed in 86.72 s, also uninstrumented.

Both current groups independently proved the complete gate: 37 suites once, 34 passing/3 exact accepted failing workflows, 102 unchanged goldens twice/exact serialized repeat, 52 slots in eight contexts with Workbench 47 live + 5 issue-backed absences / legacy 48 + 4 and every firing minimum, checks 433 JS/29 Python and WebKit. The accepted workflows remain axis-gizmo Escape, Coordinates Delete intercepted by the selection card, and #11 after the second video download. No diagnostic/manual finding was added to the accepted failing set.

In Colors' eight contexts, actual presented checks were 39/32 (Workbench/legacy), mode checks 408/9 including 404/6 observer checks beyond explicit calls, panel transitions 783–1127, DOM checks 3104–5470, and restore checks 1 each. Required minima remained presented 39/32, modes 5/4, panels 2, DOM 1 and restore 1. All live nodes stayed connected and equal to the private cache; issue-backed absences retained their exact dispositions.

Symmetry #11 fired at vibration after the second download (vibration reached); Colors fired at trajectory (vibration export not reached in Smoke). Looks completed both Studio/Properties material-families paths in 1,299.27 s/21.65 min for accepted Symmetry and 1,951.74 s/32.53 min for Colors. The original failed Symmetry run completed Looks in 1,905.27 s/31.75 min. #appearanceMaterialPreset did not recur in the accepted groups; its risk remains open. CI runtime was Linux x86_64 / Chromium 156.0.8078.4 / Playwright 1.64.0 / ANGLE Vulkan SwiftShader(Subzero).

Whole sharded CI: performance PR #19 32.03 min; Selection 31.97 min; Symmetry 31.9833 min (75.94% less, 4.156×); Colors 33.6333 min (74.70% less, 3.952×), each compared with 132.93 min. Colors had eight cold-cache misses and Looks was critical. These are individual observed workflows, including queue, setup, artifact and join overhead.

One sustained whole-stage boundary soak passed in 630.988 s, across four long-lived Workbench/legacy × light/dark contexts, with 72 completed mode/Look/editor/Build/selection/Symmetry/session cycles. All sticky 52-slot identity checks stayed clean, with no page errors or unexpected console errors. It used Chromium 145.0.7632.6 and ANGLE Vulkan SwiftShader Device (LLVM 10.0.0). Details and renderer readbacks are in [the soak report](boundary-soak/soak-report.json).

The [removed-markup sweep](../colors/preflight/overlay-sweep.md) classifies 25 retired IDs/26 app references, eight further module/slider/listener cache IDs and six transient/wiring lookups (39 removed-markup IDs total). All 33 cache IDs plus four transient IDs were observed connected in legacy; two transient IDs retain explicit source-inference limitations. Native Workbench Panels → Properties → Look → Colors → Edit… opened the editor through openElementColors in both themes. The retired elementColorBtn stays excluded from the Workbench live set, while its connected and wired legacy route remains supported. Broader cleanup stays open as [issue #14](https://github.com/evangelistalab/vibemol/issues/14).

Carried: #3 projection refresh; #11 second-export crop; axis-gizmo Escape and Coordinates Delete (#4); #17 Metal/Coordination/Translate interception and 390px bounds; #21 intermittent 320px Workbench fitting. Follow-ups #5 compatibility, #14 retired Workbench launcher/broader legacy cleanup, #15 four null slots remain. The old dark-Calculations #hint incomplete was classified as a flake by its own explicit 34/3 outcome; it is not a future CI exception. The material-preset intermittent remains open.

The local review mailbox is retired and left as a record; the human-requested monitor pause remains. No Stage 4/PubChem or Stage 5 implementation followed this completion. Post-merge bookkeeping changes only documentation/validation evidence and keeps all tested production/test/golden bytes unchanged.
