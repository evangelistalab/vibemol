# Ordered Build/adaptive integration

#8 was merged into the temporary stage branch as `4db8217`, but had not reached the user-named integration branch. The ordered integration now lands both #8 and #13 together on `codex/app-js-decomposition`.

Local integration commits: #8 first `224f32b50415a62dfec60e675cc46233d3dba119` (let 302), then #13 `64c46bf71c2cd6182fe174450bea2e26ec4e78b8` (let 291). Both branches are ancestors. The integration tree after #8 exactly equals the tested Build parent. The production delta from that tree to #13 is exactly app.js +85/−85; harness and all other production files are unchanged. After both merges the entire tree exactly equals the approved #13 stack. This ordered unit was pushed before any next-group branch was created.

## Same-artifact CI

Run [38177282064](https://github.com/evangelistalab/vibemol/actions/runs/38177282064), attempt 1, head `1750dbf55858db66cd57f6d14b411584b9ef6abb`; both CI jobs checked out `7cb554f`, that head merged into `4db82178ee662735059717c006e10aff70592044`. All 37 suites ran exactly once: **34 passing / 3 accepted failures**. Raw logs confirm axis-gizmo Escape interception, selection card blocking Coordinates Delete, and smoke #11 at trajectory after the second download. Vibration was not reached. Both 102-capture runs match unchanged goldens and repeat exactly. All 43 identities passed in eight contexts with every per-reason minimum; checks/unit and WebKit Properties passed. Raw logs/captures are lossless gzip copies.

The **#appearanceMaterialPreset intermittent did not recur**: looks.py completed successfully in **24.38 minutes**, including both Studio and Properties material-families paths. Full CI completed in **132.93 minutes**. This resolves recurrence for adaptive, not the open risk against later groups.

## Stage metrics and remaining assignment

The Stage 3 metric is mutable module-let reduction **306 → 265**, not app lines. Infrastructure growth is expected: #8 app.js **+148/−39 (+109 net)** and QA harness **+53/−1**; #13 app.js **+85/−85**, line-neutral. App length after both is 33,037, top-level functions 1,181, lets 291.

The four remaining groups are one authorized assignment, in order: Element Colors (nine const DOM inputs; controller 19 → at most 11), Atoms menu (three caches), Selection (13 caches, heavier manual matrix), and Symmetry/shared launcher (10 caches). Element Colors adds nine identities, raising the guard from 43 to 52; all subsequent groups require all 52 in eight contexts, per-reason minima, 102 goldens twice and CI 34/3/37. One PR per group, merged in sequence without intermediate human reviews. Each group has fewer than 15 explicit cache dependencies. Stop immediately on any missed gate, more-than-reference logic, material-preset hang, stale identity, or controller remaining above 11. Soak once at the stage boundary.
