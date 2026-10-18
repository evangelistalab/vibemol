# Stage 5a trajectory playback core — local proof

The accepted Stage 4 integration is `83024dd0b71251a1e2cfacb4b9c52ab25e394f7a`. This candidate moves the audited playback/scene-clock boundary and removes only the two actual trajectory shadows. Authoritative playback remains on each trajectory record or the scene synchronization master. The common exporter still owns its separate recording state; the mirrored-clock explanation for #11 remains refuted.

## Boundary and count

The factory has eight genuine, used inputs:

| Input | Responsibility |
| --- | --- |
| `getSceneGraphController` | Live access to the existing scene/master owner |
| `getActiveRecord` | Existing current-record selection |
| `TrajectoryClock` | Existing discrete normalization, mapping and advancement |
| `applyAtomCoordinateFrame` | Host geometry/renderer operation |
| `markSessionChanged` | Existing persistence notification |
| `isEditMode` | Live edit-mode predicate |
| `syncTrajectoryControls` | Existing host UI synchronization |
| `getVideoController` | Existing shared exporter target/advance adapter |

The scene-graph dependency is a getter rather than an eager read of the later graph binding. This permits an inert constructor before startup callback registrations. There is no host/service bag, DOM dependency or new playback policy. The app retains panel/window lifecycle, UI, focus activation, mutually exclusive vibration controls, video construction/capture/restore, sessions and batch/figure orchestration. Existing `trajectory-ui.js` retains its separately disclosed 17-input interface. Periodic-table remains eleven used inputs; PubChem remains thirteen.

Tracked app lets are **262 → 260**. `trajectoryPlaying` and the write-only `trajectoryLastStepMs` no longer exist. One private reference retains the actual clock owner until the empty-scene tick, preserving cleanup when the last playing independent record disappears before a UI sync. It duplicates neither playing nor timestamp values. Stop/session paths and the empty tick clear that reference, including the paused-owner case. Batch export pauses records while they remain in the graph; figure rendering skips the normal animation loop while paused. Other host writes to playing state retain their original observation boundaries.

There are 27 original implementations in the new module, plus its constructor and two owner-reference helpers. App wrappers remain at their original named call sites. The app has 32,385 lines and 1,163 direct / 1,172 total function declarations; the module has 410 lines / 30 declarations.

## Independent source and construction proof

`audit-source.cjs` performs inverse reconstruction rather than importing the converter. Its 1,220 checks reconstruct the complete original app AST, compare all 27 moved implementations after the explicit dependency/state rewrites, and compare 1,143 other declarations byte-for-byte. All 1,172 original declarations are accounted for. Full outgoing references, actual input-use counts, protected source/test/golden hashes and all comparands are in `source-audit.json.gz`.

Construction is a required CI item. The local report covers **29 app bindings** (the new factory/instance bindings and all 27 new wrapper parameters) and **129 module bindings**, with every reading reference and conservative activation bound. The instance is constructed at app.js:1207–1216; the earliest possible returned-method activation is bounded after independently proved inert construction at line1216. No dependency callback, DOM operation or network operation executes during construction. The factory lookup is initialized at line335 before its first read at336.

The strengthened tool also checks new parameters/locals inside existing functions and callbacks. Its self-test covers those cases as well as early direct calls, callback escape, corrected order and lexical shadowing. The same tool was rerun over Stages1–4: all accepted stages passed and original PubChem `25fd30a` was still rejected as the deliberate negative control. Those older results are not merge evidence for this candidate.

## Execution and native workflows

`differential.cjs` executes the actual original accepted-integration functions and three exporter adapters against the actual extracted implementation. **109 scenarios / 2,559 checkpoints** compare return values, record/master clocks, coordinate applications, session marks, UI calls and export advance results. It covers discrete FPS/remainder/endpoints, loop/sync, edit guards, invalid frames, unequal trajectories, exporter start/set/restore/advance, clone/stop/reset and last-record removal with playing/paused independent and synchronized owners. An independent constructor probe observed zero dependency calls.

`native-matrix.py` uses one serial browser across tagged and proposed source, Workbench/legacy and light/dark: **eight contexts**, all matching comparands, in91.17s. Real controls exercise frame/FPS/Loop, non-loop endpoint pause, individual/all playback/reset, unequal synchronized endpoints, sync disable, applicable modes, native session download/open, explicit public replacement and native deletion of the last playing scene. Playback observations use native control ARIA: portable session snapshots intentionally omit live master playing/timestamp values. Direct live clocks are tested separately by the execution comparison. This is not a claim that the complete native WebM lifecycle was replayed locally.

The local two-run characterization completed in **1,047.43s**, with both102-capture passes matching unchanged goldens, exact serialized repeat, zero diagnostic pixel differences, and the fixed52-slot composition in all eight contexts with every current firing minimum. Workbench is47 live +5 issue-backed absences; legacy48 +4. Actual reason counts are retained, including observer checks beyond explicit mode switches. Checks433 JS /34 Python passed. The five added Python tests protect the stricter #11 gate and leave every existing shipped assertion unchanged.

The recorded feature soak follows characterization serially, across Workbench/legacy and both themes, with sustained real playback, sync, mode return, session import, FPS/reset, Look/preset application and last-record replacement. Its actual duration and32 checkpoints are in `local-validation.json` and `soak-phase.json.gz`. It is feature verification, not the later release pass: that pass must start with the offline standalone export.

## CI and carried findings

The first automatic ordinary candidate CI is still required. The original conjunction remains34/3/37,102 goldens twice/exact repeat,52 slots/eight contexts/all minima, checks/unit and WebKit. Construction order is also required. For5a/5b the additional direct-human rule requires the exact #11 signature from accepted run39071994182: **trajectory after the second download**. Any changed site/shape, disappearance or new failure stops the group, even when the older ordinary join accepts the other exporter site. `check-refactor-run.py` prints all comparands on either outcome. No retry, gate exception or defect fix is authorized by these diagnostics.

Looks duration and separate Studio/Properties material-family completions must be recorded from the actual CI logs. Local characterization is not a substitute for those paths, and unexercised coverage is not absence of recurrence. The material-preset intermittent stays open.

Carry #25 partial silent appearance restore and #21 unusable320px Edit-toolbar collapse ahead of #17 Metal popover work, with restore reliability first. #3, #11, axis Escape / Coordinates Delete (#4) and follow-ups#5/#14/#15 remain open. No carried finding enlarges the accepted failing set.

Collector diagnostics are retained separately: CJS naming, `map(Array.from)` callback arity, session runtime-field omission, file-picker append behavior, and AST metadata property-order flags. The AST deep-strict assertions already passed; only their reporting flag/canonical hashes were corrected. No production bug, shipped expected value, wait or browser assertion was changed to pass a test. Raw screenshots/HTML and initial reports remain under ignored `out/test-artifacts/stage5/trajectory/`; compressed counterpart logs/readbacks are retained here. `durable-file-hashes.json` verifies this bundle.
