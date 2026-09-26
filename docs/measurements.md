# Measurements

Enter **Measure** and click two atoms for a distance, three for an angle, or four for a signed dihedral. Each new click adds the adjacent distance and, where defined, the latest angle/dihedral. Repeating a measurement does not duplicate it. **Esc** or **New selection** ends the current picking sequence; recorded measurements remain.

In Workbench, the **Measurements** panel opens on first entering Measure and is available from **Panels** in View and Measure. It follows the same dock, float, minimize, and layout rules as other inspectors, and suspends during Edit. Closing it is respected across mode changes. In a bottom dock, units, precision, and bulk actions are grouped under **Options & export** to leave room for the list. The legacy interface opens Measurements on demand from its launcher, keeping floating windows from obscuring atoms automatically.

- Copy all or one row as CSV; **CSV** downloads the same table with structure name, atom numbers, value, units, and validity status.
- Choose Å/Bohr and 0–6 decimal places (default 3). These are display precision, not an estimate of experimental or computational accuracy.
- Delete individual entries or **Clear all**. Undo/Redo in the panel and Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z in Measure undo measurement changes, independently of structural edits.
- Entries refer to stable atom identities, so reordering atoms does not change their meaning. Missing atoms and undefined geometry are reported explicitly. Angles include 0°/180°; a collinear dihedral is undefined. The signed dihedral uses the right-hand rotation of the projected 2→1 vector to 3→4 about 2→3.
- Values follow coordinates during edits and playback. Sessions/autosave preserve entries, units, precision, and dragged label offsets; undo history and the unfinished picking sequence are transient. Each structure supports up to 200 annotations.

Measure temporarily hides surfaces/clouds to expose the atoms and reframes atoms when entering from a rendered surface. **Show surfaces** restores orbital context while measuring; **Frame atoms** refits without changing viewing direction or projection. The temporary visibility choice never edits a layer or Look. When atom framing was automatic, returning directly to View or enabling Show surfaces restores the previous camera framing for that structure. View restores the surface visibility choices; Edit still suppresses surfaces.

Canvas labels share the table's evaluator, avoid overlap in screen space, and use leader lines when displaced. They retain world-scale zoom behavior within readable screen bounds and use a 4× text backing store for high-density PNGs. Labels can still be dragged. If an unusually crowded viewport cannot fit every label, the remaining values stay available in the list. Images export the actual canvas, including measurement labels.

Implementation: `measurements.js` owns evaluation, stable references, formatting, bounded history, and collision placement. `measurements-panel.js` owns panel controls; `app.js` connects atom picking and Three.js overlays. Measurement settings intentionally belong to records/session state, not portable appearance presets.
