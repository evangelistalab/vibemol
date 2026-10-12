# Atoms-menu cache group and issue-backed identity guard

The three editAtomsMenu caches use the existing lazy helper at their original app-IIFE query lines 7891–7893. Both guarded functions retain their exact bodies after lexical reference substitution. These old nodes are absent in both supported layouts; issue #15 records their cleanup outside the refactor. No menu is recreated and no null guard is removed.

Mutable module lets **291 → 288**; **4 cache dependencies** (three cache inputs plus the existing helper), no controller/module extraction. The cache conversion is line-neutral. The separately requested nine-reference inventory expansion and known-absence bridge add **32 app lines**: 33,037 → 33,069. Top-level function declarations remain 1,181. All 1,190 existing function declarations match exactly after the nine lexical substitutions.

## Guard amendment and held Element Colors

The original 43 slots already included four null edit slots. With nine original Element Colors const references, the rigid composition is **Workbench 47 live + 5 issue-backed absent; legacy 48 live + 4 absent**, 52 in either layout. #14 covers the detached Workbench elementColorBtn; #15 covers the four null slots. A live node must exist, remain connected and be the exact cached node. Each absent entry declares its issue, ID and retained null/disconnected disposition. Unexpected disappearance/presence, unexplained detachment, missing issue annotation and composition drift fail. Negative controls exercise these failures.

Element Colors remains held. Its proposed controller hand-off measured **19 → 11**, recorded in refactor-stage-risk.json; the integrated factory still takes **19**. None of that proposal's production conversions or module edits enter this group. The normal Workbench route opens the editor; the legacy button remains connected and wired, so cleanup must preserve legacy access. The complete 25-ID census and native reachability proof are in ../cruft-sweep/. Removing only the button yields ungrouped 18; ten non-DOM inputs plus els still equals 11.

## Local validation

make check passed; 433 JavaScript and 16 Python unit tests passed. Two 102-capture runs matched unchanged CI goldens using the approved float-only tolerance (relative 1e-9, absolute 1e-12), matched each other exactly and had no pixel differences. The identity composition passed all eight contexts and every firing minimum. These are local results; the full browser CI conjunction is pending on this candidate.

| Run | Context | Presented | Mode | Observer panel | DOM | Restore |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | workbench/light | 39 | 408 | 1070 | 5321 | 1 |
| 1 | workbench/dark | 39 | 408 | 1058 | 5431 | 1 |
| 1 | legacy/light | 32 | 9 | 678 | 2969 | 1 |
| 1 | legacy/dark | 32 | 9 | 681 | 3083 | 1 |
| 2 | workbench/light | 39 | 408 | 1049 | 5318 | 1 |
| 2 | workbench/dark | 39 | 408 | 1055 | 5430 | 1 |
| 2 | legacy/light | 32 | 9 | 669 | 2967 | 1 |
| 2 | legacy/dark | 32 | 9 | 681 | 3080 | 1 |

Minimum counts remain 39/5 presented/mode in Workbench, 32/4 in legacy, observer panel 2, DOM 1 and session restore 1. Actual observer mode firings are verified separately from explicit checks.

## Manual verification

The unchanged current edit_tool.py, build_panel.py and floating_panels.py suites passed once each on tagged 1c609b3 and once each on the proposed app. This is direct event-path replay, not a claim of human interaction. Assertions and waits were unchanged; only the static server root and evidence destination changed. Raw logs and paired source/test hashes are in manual/.

Covered workflows: tool arming, atom/fragment/molecule placement and Escape, selection, ARIA/keyboard, mode changes and viewport widths; Build search/selection, dock/float/minimize, suspension, layout restoration, mobile and legacy launch; floating-window mouse/touch/keyboard movement, reopen, operator inputs, exclusive launchers and rebuilds. The old absent Atoms slots retain their early-null behavior; live Add Atom/Build entry paths pass. The known axis-gizmo, selection-card and recording-crop production defects remain outside this PR.

The #appearanceMaterialPreset intermittent stays **open**. These local replays do not run looks.py's material_families path and do not classify that risk. Its result and duration must come from this candidate's complete CI run before merging.
