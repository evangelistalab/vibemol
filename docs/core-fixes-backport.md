# Independent fixes from the Workbench experiment

The independent rendering and editing fixes from `codex/window-workspace-lab`
are applied to `main` on top of `a894f57`. Main retains its existing interface.
The experimental branch remains available for continued window-management work.

| Source | Included behavior |
| --- | --- |
| `806c812`, `0a3439c` (selected changes) | Edit-mode guidance, Coordinates available/editable in Edit only, cancellation of unfinished coordinate edits on mode changes, and orbital context retained in Measure. |
| `54f65fc` | Shadows enabled by default in all built-in presets; explicit saved choices preserved. |
| `e7f734d` | Higher-resolution shadows, tighter light-space fitting, texel-aligned placement, and scaled bias. |
| `acaf557` | Camera depth fitted to visible atoms, bonds, surfaces and clouds with orbital padding; matching picking and depth-of-field ranges. |
| `a794585` | Bounded bond-picking work, shared cached queries, lazy coordinate tables, and surface/cloud reuse during mode changes. |
| `a03eefa` | Frontmost atom/bond picking, precise instanced dash geometry and gaps, occlusion-aware selection fallbacks, and shifted-scene bond sections. |

The backport also includes the corresponding regression tests, shadow previews,
documentation, a reliable short-video recording check, and the corrected
principal-axis button accessibility label.

Workbench docks, the top menu, floating Appearance, window minimization/layouts,
Focus behavior, mode-specific window policies, launcher rearrangements, and the
Help/axes redesign remain experimental. Main does not load the Workbench scripts,
styles, or host adapter. Its existing Style Studio and movable popups predate this
branch and remain available.

`tests/e2e/mode_consistency.py` exercises the shared mode fixes through the original
interface. On main, `tests/e2e/edit_picking.py` and `tools/profile_nacl_edit.py` also use that
interface with `?appearanceStudy=1`, which isolates test runs from ordinary autosave
and recovery. The original Workbench measurements remain documented in
`docs/experiments/workbench/nacl-edit-performance.md`.

To validate the transferred behavior:

```sh
make check
make test-unit
python tests/e2e/smoke.py
python tests/e2e/looks.py
python tests/e2e/camera_depth.py
python tests/e2e/edit_picking.py
python tests/e2e/mode_consistency.py
python tests/e2e/appearance_scopes.py
python tools/profile_nacl_edit.py --angle metal --output /tmp/vibemol-main-profile
```

The benchmark's `--angle metal` option selects Apple hardware rendering; omit it
on other platforms. Run the benchmark without competing browser tests.
