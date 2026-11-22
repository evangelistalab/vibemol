# Start here — VibeMol handoff

Reviewed **2026-11-19**, after the 0.10.11 right-panel patch (PR #107).

Read these files in order:

1. [AGENTS.md](AGENTS.md): current instructions first, followed by historical evidence. Historical requests to start a stage are not a current work order.
2. [VIBEMOL_CONTEXT.md](VIBEMOL_CONTEXT.md): shipped behavior, architecture, verification and paused work.
3. [Product roadmap](docs/roadmap.md): delivered features and candidates awaiting Francesco's choice.

The latest deployed runtime is **0.10.11**, commit `297e608fa88038151fa73edc10362281fc6103db`. PR #107's exact source tree passed all **37 browser suites with zero failures**, plus the other required checks. Its separate post-push main run is linked in the context file; read its actual result before claiming it passed. The `v0.10.11` tag remains at the original release, `2d594bb6be90fd2893e3df8abbaf11c422616962`. Documentation-only commits may follow the deployed commit.

The latest choices are CFOUR `.freq` import and right-side panel defaults. Saved panel placements win; compact screens still use the bottom dock. Existing saved layouts are not migrated. Sessions, persistent measurements, the Figure runner, validated Edit API, forte2 export, tutorials and reset-to-defaults are already implemented. Do not schedule them as new features.

**No next product feature has been selected.** Finish the documentation handoff, then follow Francesco's next request. The AI connector is paused and reverted from production. The 0.11 controls program stopped at its measurement gate; command bus work has not begun. General undo remains design-only; remaining Testing-wrapper conversions and browser sharding remain held.

Francesco is the product owner and a computational chemist. Use plain language, concrete measurements and a recommendation. Diagnose before changing product code. Keep visual review iterative when requested. Do not ask again for work already authorized or expand a small repair into an architecture program.

The runtime uses **classic scripts in fixed order, with no bundler or ES modules**. Keep new units below 15 dependencies and audit construction order on extraction. Scientific source buffers have private ownership; use their copy boundaries.

The acceptance rule is **37 passing / 0 failing / 37**, with the accepted-failure set **intentionally empty**. Both video exporters and both Looks material-family paths must complete. Captures, checkpoint counts, cache identities, units, WebKit, construction and the 260-binding AST ratchet remain required. Preserve failures and report them; do not retry, change expectations or re-record captures without the relevant authorization.

Start by reading `git status`, the branch and recent history. Preserve unrelated local files. `docs/connector-pilot/`, `COMMANDS_AND_CONTROLS_PLAN.md` and the reference patch were local, untracked material at this handoff; do not assume another checkout contains them or add them incidentally. See the context file for preserved prototype branches.
