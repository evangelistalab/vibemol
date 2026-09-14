# NaCl Edit-mode performance profile

Baseline profiled on 2026-09-14 at `acaf557` on `codex/window-workspace-lab`; the production fix was benchmarked with the same fixture and profiler afterward.

The fix reduces the first pointer-move response from **5,618 ms to 34 ms**, and the median stationary-hover render callback from **1,839 ms to 8.4 ms**. Entering Edit takes **6.9 ms**, down from 149 ms. Shadows and automatic camera-depth fitting remain enabled.

The sustained stall comes from bond hit-testing doing work proportional to **atom count × bond count**. Entering Edit itself adds a smaller, one-time delay. Once the pointer enters the canvas, the Edit halo repeats the expensive bond query on every animation frame, including while the pointer is stationary.

The reproduction uses a generated 20 × 20 × 5 NaCl slab (2,000 atoms, alternating Na/Cl at 2.82 Å spacing), the Basic preset with shadows enabled, and `?workspaceLab=1`. VibeMol infers 5,400 bonds and renders their 27,000 dash segments as instances. Profiling used Playwright Chromium with hardware-accelerated ANGLE Metal on an Apple M1 Max, a 1,200 × 900 viewport, and device pixel ratio 1. These measurements describe this fixture and machine; the user's original file was not supplied.

| Operation | Measured time |
| --- | ---: |
| Import call | 305 ms |
| First rendered frame, including initial shader compilation | 476 ms |
| View frame, median | 9.5 ms |
| Enter Edit, synchronous mode handler | 149 ms |
| Edit frame before pointer entry, median | 10.5 ms |
| Edit frame after pointer entry, median | 1,839 ms |
| First pointer-move action, wall time | 5,618 ms |

The stalled hover profile attributes approximately 90% of its sampled time to `pickBondHit`, and 81% to the nested `buildBondAtomRecords`. Repeated allocations also trigger garbage collection. No page errors occurred.

The expensive path is:

```text
render / pointermove
  editHaloController.refresh
    computeReservedBondCenter
      pickBondHit
        pickBondHitFromDisplayedSpan
          for each bond:
            getBondCarrierInteractionSegment
              buildBondAtomRecords(all atoms)
```

In `assets/app/js/app.js:23668`, `getBondCarrierInteractionSegment` rebuilds all atom records, then uses only the two endpoints of one bond. `pickBondHitFromDisplayedSpan` at line 23684 calls it once for every bond. A single query on this slab therefore constructs **10,800,000 atom records**, plus a second array mapping each record to its position. The records unnecessarily include radii, material-style lookups, IDs, and metal-bonding metadata for a query that only needs coordinates.

NaCl makes this particularly visible because the dashed connector instances deliberately skip mesh raycasting (`createWorldSegmentBondInstances`, line 19211). The interaction system uses lightweight bond carriers and the displayed-span fallback. That design avoids testing every dash triangle, but it reliably reaches the expensive fallback.

`assets/app/js/edit-halo.js:826` calls `computeReservedBondCenter` on each refresh with no selection. `app.js:6760` refreshes that controller every frame. The check still runs with hover activation disabled. Pointer handling also performs the query through multiple paths before the next frame, explaining the multi-second response to one mouse move. Moving the pointer out of the canvas clears the stored pointer and ends the repeated idle queries.

During diagnosis, controlled browser-only instrumentation counted the work and substituted direct conversion of the two endpoint coordinates in `getBondCarrierInteractionSegment`, retaining its existing trim/placement math. Repository application code was not modified during that comparison. Three queries at the same canvas point were run for each size; every baseline/substitution pair returned the same bond and section. The line references above describe the baseline commit.

| Atoms | Bonds | Atom records per baseline query | Baseline query, median | Two-endpoint substitution, median |
| ---: | ---: | ---: | ---: | ---: |
| 500 | 1,300 | 650,000 | 122.1 ms | 2.2 ms |
| 1,000 | 2,650 | 2,650,000 | 448.8 ms | 4.5 ms |
| 2,000 | 5,400 | 10,800,000 | 1,814.5 ms | 8.8 ms |

At 2,000 atoms, disabling both shadows and camera-depth updates still took 1,777–1,802 ms per query. Keeping both enabled and using the endpoint substitution reduced the median stationary-hover frame to 15.5 ms. Additionally bypassing the idle halo check reduced it to 8.1 ms. Those bypasses are diagnostic controls, not a complete proposed implementation.

Implemented changes:

1. Straight-bond endpoint lookup now converts only two atom coordinates. Displayed-span and hit-section calculations share the same trim/placement math. Curved/multiple-bond plane data is built lazily once per bond-group identity/revision, preserving offsets without rebuilding the atom list for every query.
2. Pointer handlers and the Edit halo share one cached hit or miss. The key includes pointer position, mode, volume, bond-group identity/revision, viewport bounds, and camera/projection/group matrices. Live coordinate updates advance the revision; full rebuilds clear the cache. Selection does not affect geometric hit-testing and is handled separately by the interaction controllers.
3. Mode changes hide and restore existing surface/cloud meshes. Unchanged molecular meshes are retained, including for XYZ-only scenes. Actual edits/imports that rebuild the scene in Edit still recreate deferred orbital graphics when returning to View or Measure. Trajectory bonds retain their separate display/edit behavior. Closed Coordinates tables populate when opened, rather than twice during a mode switch.

| Operation | Baseline | Production fix |
| --- | ---: | ---: |
| Enter Edit, synchronous handler | 149.4 ms | 6.9 ms |
| First pointer move, action wall time | 5,618 ms | 34.4 ms |
| Stationary-hover render callback, median CPU time | 1,838.6 ms | 8.4 ms |
| Stationary-hover render callback, 95th percentile | — | 9.1 ms |
| Leave Edit, synchronous handler | 129.2 ms | 7.6 ms |
| View render callback, median CPU time | 9.5 ms | 9.6 ms |

The hover callback is about 219 times faster. These callback measurements exclude GPU completion and should not be interpreted as presentation FPS. Initial shader-compilation timings are excluded from the comparison because the second run benefited from warmed driver caches. Both runs used the same hardware renderer and had no page errors.

A repeat with the saved profiling script measured 6.1 ms to enter Edit, 34.4 ms for the first pointer move, and a 10.6 ms median hover callback (11.9 ms at the 95th percentile). Its raw artifacts are in `final/`. Across the two production runs, entering Edit was 6–7 ms and stationary-hover CPU time was 8–11 ms, with shadows enabled in both.

`tests/e2e/edit_picking.py` asserts that one query on the 2,000-atom fixture processes 5,400 bond spans with **zero** full atom-list builds; repeated stationary frames perform zero new queries. It also checks mode-only mesh reuse, lazy Coordinates population, camera/viewport/mode invalidation, live atom-coordinate updates, double/triple-bond hit regions in Basic/Classic/Kit, and surface/cube-cloud/point-cloud restoration after mode changes and real Edit rebuilds. The work-count test disables shadows so software-rendered CI can run it; the timings above keep shadows on. Unit tests cover hit/miss reuse and projection refits during picking. Workbench and camera tests cover coordinate editing, mode/window preservation, and picking through signed camera depth.

A projected spatial index could further reduce the linear scan for much larger structures; it is not needed to remove this stall and is not part of this fix.

Raw CPU profiles (`load`, `view_idle`, `enter_edit`, `edit_idle`, `edit_hover`, `leave_edit`), generated XYZ, scripts, and measurement JSON are retained locally in `/private/tmp/vibemol-nacl-profile-20260914/`; production results are in its `after/` subdirectory. Load `edit_hover.cpuprofile` in Chromium DevTools to inspect the sampled call tree. `controlled.py` records the temporary diagnostic substitutions; `analyze.py` summarizes the profiles.

To reproduce against the current checkout using Playwright Chromium:

```sh
python tools/profile_nacl_edit.py --angle metal --output /tmp/vibemol-nacl-profile
```

`--angle metal` selects the Apple hardware renderer; omit it for the browser default on other systems. Run the benchmark without other browser tests competing for CPU/GPU time. The script generates the slab, profiles all six phases, and saves the settings, GPU identity, raw callback durations, CPU profiles, and a screenshot.
