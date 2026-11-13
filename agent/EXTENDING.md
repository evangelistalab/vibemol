# Extending VibeMol with JavaScript

VibeMol is a browser app written in plain JavaScript (classic scripts, no build
step) with three.js for 3D. New functionality, such as a visualization, a file
format, a panel, a button, or an analysis, is added by writing JavaScript that
runs in the user's tab. Never tell the user a feature "needs a source-code
change" when it can be built this way.

## Workflow
1. Understand the request, then study the relevant existing code with
   `vibemol_read_source` (list files, search, read line ranges). Reuse what
   VibeMol already does instead of re-implementing it.
2. Prototype with `vibemol_run_script`. The user must tick "Allow scripts" in the
   Claude menu and approves each script.
3. Check the result with `vibemol_screenshot`, `vibemol_get_state`, or the UI tools.
4. When it works, keep it with `vibemol_save_extension` (a clear name and one-line
   description). Saved extensions re-run on every page load and appear in the
   Claude menu, where the user can switch them off, download, or delete them.
5. To change a saved extension, read it with `vibemol_list_extensions`
   (includeCode) and save again under the same name.

## Code format
Code is the body of `async function (VibeMol, ext) { ... }`. `VibeMol` is `window`.
Return a JSON-serializable value to report back. Everything added through `ext`
is removed automatically when the extension is disabled, replaced, or deleted,
so prefer `ext` helpers over raw globals.

| `ext` member | Purpose |
|---|---|
| `ext.THREE` | three.js (same instance VibeMol renders with) |
| `ext.add3D(object, { parent: 'content' \| 'scene' })` | add a THREE object. `content` (default) shares the molecule's frame: Angstrom, same axes as `vibemol_list_atoms`. VibeMol re-renders every frame. |
| `ext.mount(element, parentOrSelector)` | add a DOM element (default `document.body`) |
| `ext.listen(target, type, handler, options)` | event listener |
| `ext.onFrame(callback)` | per-frame callback (animation) |
| `ext.registerFileFormat({ extensions, convert })` | new file type (see below) |
| `ext.onDispose(fn)` | extra cleanup |
| `ext.storage.get(key, fallback)` / `.set(key, value)` | per-extension saved settings |
| `ext.hint(text)` | message in VibeMol's status line |
| `ext.scene()`, `ext.contentGroup()`, `ext.camera()`, `ext.canvas()`, `ext.activeRecord()` | live app objects |
| `ext.app.embed.loadFiles(files, { clearFirst })` | load `{ name, text }` files through VibeMol's normal loader |
| `ext.app.preset` | appearance settings (`listSchema()`, `export()`, `import()`) |
| `ext.app.structure`, `ext.app.session` | structure and session import/export |
| `ext.app.host` | the agent's helpers (atoms, trajectories, screenshots, undoable moves) |
| `ext.app.seam` | narrow access to app internals (edit primitives, undo, trajectory state) |

The active structure: `ext.activeRecord().vol.atoms` holds `{ Z, x, y, z }` in
native units. Cube-derived structures are in Bohr, others in Angstrom
(`vol.units === 'angstrom'`); multiply Bohr values by 0.529177210903 to get the
Angstrom frame used by `add3D`.

## Recipe: a new file format
Convert the new format into files VibeMol already reads and let its loader do
the rest. Readable formats: `.xyz` (also multi-frame trajectories), `.cube`,
`.molden`, `.vib.json` (vibrational modes), `.hess`, Psi4 `.out`/`.dat`.

```js
ext.registerFileFormat({
  extensions: ['.nmd'],
  async convert(text, file) {
    // parse text ...
    return [
      { name: file.name.replace(/\.nmd$/i, '.xyz'), text: xyzText },
      { name: file.name.replace(/\.nmd$/i, '.vib.json'), text: JSON.stringify(vibPayload) },
    ];
  },
});
```

Registered formats work for drag-and-drop and the Open dialog. Other files in the
same drop are passed through unchanged. A `.vib.json` payload is a JSON object
with a `modes` array; each mode is an array of per-atom `[dx, dy, dz]`
displacements, or an object with `displacements`, optional `label`, and
`frequencyCm1`. Read `parseVibrationPayload` in `assets/app/js/app.js` for the
exact rules, and `assets/app/js/file-loader.js` for how companion files attach to
their structure.

## Recipe: a 3D visualization
```js
const { THREE } = ext;
const atoms = ext.activeRecord().vol.atoms;
const group = new THREE.Group();
for (const a of atoms) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshBasicMaterial({ color: 0xff00ff }));
  mesh.position.set(a.x, a.y, a.z); // convert from Bohr first if needed
  group.add(mesh);
}
ext.add3D(group);
```

## Rules
- Use public APIs and `ext`; don't overwrite VibeMol's own functions or globals.
- Keep extensions self-contained and idempotent; they may run again on reload.
- Put controls for a feature where users expect them (read the relevant panel's
  markup with `vibemol_read_source` first), and give buttons an `aria-label` or
  `data-tooltip`.
- Extensions exist only in this user's browser. If a feature should ship to
  everyone, suggest downloading it from the Claude menu and turning it into a
  pull request.
