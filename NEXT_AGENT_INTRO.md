# Intro prompt for next agent — VibeMol session

Hi. You're picking up VibeMol, a browser-based molecular visualization and editing tool, from a previous agent session. Before we do anything, **read `VIBEMOL_CONTEXT.md` end-to-end.** It's the institutional memory: what's been built, what's been decided, what's open, what to do next.

A few things I want you to know up front:

**The user is Francesco Evangelista** — computational chemist at Emory, deep domain expertise in quantum chemistry, builds Forte/QForte. He's the product owner and the one whose judgment matters. He's direct, gives unambiguous feedback, expects deep technical analysis with concrete recommendations rather than option menus, and pushes back when proposals are too complex or wrong. Match that energy.

**VibeMol is mature.** It's at version v0.8.7t and has shipped Phase 1 (foundation) and all of Phase 2 (arithmetic combinations, multi-trajectory with sync, drag gestures, polish). It's a real tool now. The architecture is sound, the bug rate is low. Don't second-guess load-bearing decisions without conversation. The CONTEXT file lists the invariants explicitly.

**There's one concrete next action.** When Francesco resumes, send the "Create new molecule" prompt. The toolbar button currently labeled "Add file" (icon `note_add`, file-with-plus glyph) needs to be repurposed: click creates a new empty scene with no atoms, eye-off, switches the side panel to Edit mode, and renames the button to "Create new molecule" (or similar). The full design is in the CONTEXT file under "Next concrete actions." The previous agent had drafted the prompt but not sent it.

**After that ships, Phase 2 is fully done.** Then it's time for the Phase 3 strategic conversation — five candidate directions (Persistence, Measurements, Rendering quality, QC integration, Polish/stabilization). Walk Francesco through them, ask the three triage questions in CONTEXT, recommend a starting direction, but don't start Phase 3 work until he picks one.

**Working patterns Francesco prefers** (also in CONTEXT, but worth surfacing):
- Deep analysis with recommendations, not option menus
- Visual/iterative validation — screenshots and demos before committing
- Diagnose root causes via source inspection, don't guess
- Direct feedback is normal; push back on bad ideas with reasons
- Inline test suites for non-trivial new modules
- QA harness pattern: `window.__vmqa = { snap(), rowByLabel(label), errors[] }` set up at session start

**What to NOT do without conversation:**
- Add backend / collaboration / persistence (Phase 3 territory, needs design)
- Switch tech stacks (vanilla JS, Three.js r160, Python local server stay)
- Modify data model invariants (per-scene scoping, bond-order ground truth, frame-locked sync)
- Re-add Glass material or composable Abs (both rejected for reasons)
- Decide Phase 3 direction without Francesco

**Tools and environment:**
- Vanilla JS / Three.js r160 / WebGL2, no bundler
- Local Python HTTP server during dev (port 8000 typically)
- Production at vibemol.org
- `make check`, `make test-unit`, `tests/e2e/smoke.py` for verification
- Chrome MCP for live UI testing (intermittently flaky in long sessions — be ready to fall back to hand-QA checklists)

Read `VIBEMOL_CONTEXT.md` now. Then say hello to Francesco and ask what he wants to do next — or if he says "ship the create-new-molecule button," go straight to that prompt.
