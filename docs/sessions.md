# Sessions and recovery

Use **Save session** to download a `.vibemol-session` file. **Open session**, the ordinary file picker, drag/drop, and embedded file loading can open it. Opening replaces the current workspace after validation. Open one session at a time; add other molecular files afterward.

A session contains the data needed to reopen offline. Original source files do not need to remain on disk. It preserves:

- All loaded sources, including sources retained by copied or moved layers after their original scene was deleted. Duplicate filenames remain separate sources.
- Edited atoms, explicit/perceived/suppressed bonds and metal styles, annotations, and builder operation logs.
- Scene and layer identity, names, order, membership, visibility, expansion, focus, selection, and individual surface/cloud appearance.
- Molden basis/MO coefficients, selected orbitals and grid settings. Deleted entries stay deleted. Disposable MO grids are regenerated when needed for visible layers or explicit calculations.
- Arithmetic results and recipes, including dependency chains that can still be edited after reopening.
- Trajectory frames, selected frame, FPS, loop, and synchronization; vibration modes, equilibrium coordinates, selected mode, amplitude, speed, and phase.
- The global appearance preset and camera position, orientation, projection, zoom, target, and scene shift.

Sessions reopen in View mode with trajectory, vibration, and camera auto-rotation paused. Undo history, active drags/placement previews, temporary atom selections, and floating-window layout are not part of the format. Builder logs are restored with the edited structure; they are not replayed.

## Browser autosave

Autosave uses the same session serializer and writes to IndexedDB. It waits approximately 1.5 seconds after changes settle, or up to 15 seconds during continuous changes. It waits for file loads, calculations, exports, and unfinished placements before taking a snapshot. Encoding numeric buffers yields to the browser between chunks; serialization is not part of the rendering loop.

On reopening the app, **Recover session** explicitly restores the most recent completed autosave. **Start fresh** dismisses the prompt without deleting saved data. An empty startup never overwrites a snapshot. A later successful save of a nonempty workspace rotates the two retained snapshots. If the newest snapshot is damaged, recovery tries the preceding one.

A failed storage transaction preserves the completed snapshots and displays an error next to the session controls. **Retry autosave** retries a failed write; **Save session** downloads a portable file without relying on browser storage. Concurrent tabs use a revision check: a tab cannot silently replace recovery data updated by another tab.

Browser storage belongs to the current browser profile and origin, including the local server port. Clearing site data removes it. Private browsing, `file://` pages, and embedded webviews can have different persistence policies. The portable download moves work between browsers, machines, webviews, or server addresses. Recovery restores the last *completed* snapshot; closing a tab during a write may leave the preceding snapshot as the newest available one.

Portable sessions allow up to 256 MiB of numeric data; browser recovery allows 64 MiB per snapshot. JSON metadata/text is also bounded. Browser quotas may impose a smaller recovery limit. Only two snapshots are retained. A recent-session browser is a separate future feature.

## Version 1 contract

The file is JSON with `kind: "vibemol.session"` and `sessionVersion: 1`. It contains:

| Field | Contents |
| --- | --- |
| `sources` | Stable IDs, names, scene keys, record settings, and parsed molecular data. Payloads are stored once per source. |
| `records`, `activeSourceId` | Source order and active source, independent of filenames. |
| `graph` | Ordered scenes/layers, source references, arithmetic dependencies/results, focus/selection, and synchronization controls. |
| `preset`, `view` | Existing preset settings plus camera pose/zoom. Builder data is restored per source, without filename-based preset merging. |
| `buffers` | Referenced numeric arrays, encoded as base64 little-endian bytes with type, length, and an FNV-1a checksum for accidental corruption detection. Shared references are stored once. |

Renderer objects, functions, GPU resources, derived component caches, and Molden grid caches are excluded. `session-format.js` checks versions, sizes, buffer integrity, molecular/grid shapes, source and layer references, group membership, and arithmetic cycles before `session.js` stages a replacement graph. `app.js` binds it to the existing renderer and preset controls. New IDs are reserved above restored IDs so later imports do not collide.

The asynchronous public API is:

```javascript
const text = await VibeMolSession.exportText();
const envelope = await VibeMolSession.export();
await VibeMolSession.validateText(text); // does not replace the workspace
await VibeMolSession.importText(text);
await VibeMolSession.import(envelope);
```

`kind` and `version` describe the supported format. Successful imports return `{ ok, name, sceneCount, sourceCount }`; failures reject with an error. Session opening and ordinary file imports share a queue. Existing `VibeMolPreset` and `VibeMolStructure` contracts remain available for narrower exports.

`VibeMolRecovery` exposes `getState()`, `flush({ force? })`, `recover()`, and `startFresh()`. Storage failure is reported through state/UI and a `false` flush result. Recovery controls are intentionally outside presets because they describe browser-local storage.

## Validation

Run `make check`, `make test-unit`, and `make test-e2e`. `tests/e2e/sessions.py` covers fresh-page round-trips, failed imports leaving the workspace intact, lazy Molden grids, arithmetic dependency edits, vibrations/topology, downloads/2C data, retained sources, automatic saving, quota errors, corrupt recovery, and concurrent tabs. The existing smoke and focused regressions remain required.
