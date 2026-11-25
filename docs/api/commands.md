# VibeMol command registry v0

## Authorization and scope

AGENTS.md, NEXT_AGENT_INTRO.md and docs/roadmap.md record that the 0.11 controls program stopped at its gate: **no Phase 0 and no command bus**. Francesco directly authorizes **one bounded exception: an additive command registry v0**, defined below. It is **not** the 0.11 command bus or declarative controls:

- Do **not** route any existing UI handler, control, menu or shortcut through the registry.
- Do **not** add undo, transactions or history.
- Do **not** modify `assets/app/js/app.js` (the 260/260 let-binding ratchet and the construction audit must stay unchanged).
- Do **not** merge, adapt or reference the paused AI-connector prototype. Do **not** widen the Edit API audit allowance.
- Do **not** add product capabilities. Every v0 command forwards to a public API member that exists today.

Francesco subsequently authorized explicit Edit entry, in-app selection resolution, AVAS readiness and shell assignment, and an empty Edit selection expectation after session import.

## Discovery and execution

`window.VibeMolCommands` has `kind: 'vibemol.commands'`, `version: 1`, `list()`, `describe(id)` and `run(id, params = {})`. `list()` returns descriptors sorted by ID. `describe(id)` returns a descriptor or `null`. Both return data you can serialize as JSON.

`window.VibeMolCommandRegistry` provides the browserless factory `createCommandRegistry(definitions)` and `validateParams(schema, params)`. A definition has this shape.

```js
{
  id: 'edit.getSelection',
  title: 'Get the current atom selection',
  params: { type: 'object', properties: {}, required: [], additionalProperties: false },
  mutates: false,
  target: 'VibeMolEdit.getSelection',
  outcome: 'envelope',
  run: (params, api) => api.call('VibeMolEdit.getSelection'),
}
```

Descriptors contain `id`, `title`, `params`, `mutates` and `target`. The factory rejects invalid definitions, duplicate IDs and unsupported schema keywords. Target reads through `api.read(path)` and calls through `api.call(path, ...args)` resolve at execution time.

### Parameter schemas

Every schema specifies a supported `type`. Object and array schemas use `object` and `array`, respectively. Scalar types are `string`, `number`, `integer`, `boolean` and `null`. An array of two or more distinct scalar types forms a union.

- `properties`, `required` and `additionalProperties: false` for objects.
- `items`, `minItems` and `maxItems` for arrays.
- Inclusive `minimum` and `maximum` for numeric values, including numeric members of scalar unions.
- `enum` for exact JSON values.

`validateParams` returns `{ ok: true }` or `{ ok: false, errors: [{ path, message }] }`. Paths start at `$`. The command wrapper takes plain JSON data and clones it before forwarding. The product API still validates domain-specific rules such as file payload alternatives, recursive Edit predicate shapes, preset envelopes and AVAS selections.

### Results

`run` always returns a Promise that resolves to `{ ok: true, value }` or `{ ok: false, error: { code, message, details? } }`. The definition's optional `outcome` selects how its adapter result is interpreted. `value` is the default and returns a structured clone of the result as data, including any `ok` field. `envelope` requires a boolean `ok` with exactly one matching payload field, `value` for success or `error` for refusal. The registry unwraps success once and reports a refusal as `rejected`. Outcome declarations belong to definitions. Discovery descriptors retain the fields described above.

| Code | Meaning |
| --- | --- |
| `unknown-command` | The ID is absent from the registry. |
| `invalid-params` | The request failed validation. `details` contains the paths and messages. |
| `not-available` | A required public namespace or member is missing. |
| `rejected` | The product declined the operation or the requested change could not be confirmed. `details` holds the product error or the applied-state readback. A file batch may have loaded some files before reporting a refusal. |
| `failed` | The target threw or its Promise rejected. `details.name` contains the original error name when available. Malformed envelopes and results that cannot be cloned set `details.code` to `malformed-envelope` and `non-serializable-result`, respectively. |

### Commands

| ID | Public target | Changes workspace |
| --- | --- | --- |
| `app.info` | `VibeMolAssets.version` and `VibeMolCommands.version` | No |
| `files.load` | `VibeMolEmbed.loadFiles` | Yes |
| `session.export` | `VibeMolSession.exportText` | No |
| `session.import` | `VibeMolSession.importText` | Yes |
| `structure.export` | `VibeMolStructure.exportActiveText` | No |
| `preset.export` | `VibeMolPreset.export` | No |
| `preset.import` | `VibeMolPreset.import` | Yes |
| `edit.enter` | `VibeMolEdit.enter` | Yes |
| `edit.context` | `VibeMolEdit.context` | No |
| `edit.getSelection` | `VibeMolEdit.getSelection` | No |
| `edit.setSelection` | `VibeMolEdit.resolveSelection`, then `VibeMolEdit.setSelection` | Yes |
| `edit.clearSelection` | `VibeMolEdit.clearSelection` | Yes |
| `calculations.ready` | `VibeMolCalculations.ready` | No |
| `calculations.selectShell` | `VibeMolCalculations.selectShell` | Yes |
| `calculations.state` | `VibeMolCalculations.state` | No |
| `calculations.configure` | `VibeMolCalculations.configure` | Yes |
| `forte2.export` | `VibeMolForte2.export` | No |
| `view.setMode` | `VibeMolOrbitals.setMode` | Yes |

Enter Edit explicitly before changing atom selection. `edit.setSelection` accepts a documented selection predicate and gives the original resolver result to Edit inside the same call. See [Edit selection](edit-build-api.md) and [forte2 export](../forte2-interchange.md).

`calculations.selectShell` uses a zero-based atom index and toggles whole-shell assignment. Its receipt contains `requested`, `applied` and `assigned`. Calling it twice on the same available shell assigns and then removes it. `calculations.configure` returns the requested patch and applied options. When automatic selection counting is enabled, `total` comes from the Calculations state readback.

`preset.import` preserves the product receipt, including applied keys and warnings from relaxed imports.

`files.load` can open a browser confirmation for an XYZ with at least two atoms and no bond candidates at angstrom distances. The call waits for a response before continuing. Accepting converts from bohr to angstroms. Dismissing keeps the original coordinates. Unattended clients need a dialog handler for this case.


`view.set` uses the native axis gizmo's snap. On the +z and −z axes, OrbitControls applies a pole guard of at most 1 × 10⁻⁶ radians. The lateral camera offset is at most the distance to the target multiplied by 1 × 10⁻⁶.

`view.setMode` accepts `view`, `measure`, `edit` or `calculations`. It returns `{mode, surfacesSuppressed}` once the native mode switch is applied. Switching modes preserves the camera pose unless Edit reveals a hidden target. Calculations requires the Workbench interface.

While the current mode suppresses surfaces, `orbitals.show` and `orbitals.configure` return `not-available` with `{mode, surfacesSuppressed: true}` and leave the scene unchanged. Call `view.setMode` with `mode: 'view'` before showing or configuring orbitals. Listing and hiding orbitals work in every mode.

`orbitals.list` reports the active Molden source and its orbitals, including one-based
indices and occupations. `orbitals.show` accepts one to eight distinct indices and
defaults to exclusive visibility. `orbitals.hide` hides all when indices are
omitted. `orbitals.configure` applies iso and opacity and returns the applied values.

`view.snapshot` returns an image/png payload with `width`, `height` and `dataBase64`.
Optional dimensions range from 1 to 4096 pixels per side. Use `transparent: true`
for an alpha background. Encoded responses over 40 MB return `failed`.

A change from `vectors.setAtoms`, `vectors.setArrow`, `vectors.remove` or
`vectors.clear` adds one **Vectors** entry to Edit history for the affected
structure. Undo and Redo restore the complete vector state. Unchanged commands
preserve history, including Redo. The [vector guide](../xyz-vectors.md) covers
atom order, shared scales and free-arrow anchors.

The 0.10.16 release records 19 named members across `VibeMolOrbitals`,
`VibeMolVectors` and `VibeMolVectorsModel`. Edit history uses the model's
`restore` method.

### Proposed follow-up

A separately authorized product change could add a `units: 'prompt' | 'angstrom' | 'bohr'` option so clients can give a unit explicitly.

## Browser console example

Run this in a fresh VibeMol workspace served over HTTP. Loading the bundled water file replaces the current workspace by default. The example opens a second tab for the session import, so allow the popup when running it.

```js
await (async () => {
  const opened = window.open(location.href, '_blank');
  if (!opened) throw new Error('Allow the example to open a new tab.');

  const run = VibeMolCommands.run;
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const value = result => {
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.value;
  };
  const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  };
  const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

  console.log(value(await run('app.info')));
  const response = await fetch(VibeMolAssets.url('./assets/fragments/water.xyz'));
  assert(response.ok, 'Could not fetch the bundled water file');
  assert(value(await run('files.load', {
    files: [{ name: 'water.xyz', text: await response.text() }],
  })).ok, 'Water did not load');

  value(await run('edit.enter', { tool: 'transform' }));
  const { atoms } = value(await run('edit.context'));
  const expected = { atomIds: [atoms[0].id, atoms[1].id], indices: [0, 1], count: 2 };
  const selected = value(await run('edit.setSelection', {
    selector: { kind: 'labels', labels: ['O1', 'H1'] },
  }));
  assert(same(selected, expected), 'Edit did not apply the requested selection');
  assert(same(value(await run('edit.getSelection')), expected), 'Edit selection differs');

  value(await run('calculations.ready'));
  value(await run('calculations.selectShell', { index: 0, shell: '2p' }));
  value(await run('calculations.configure', { method: 'cumulative', sigma: 0.9 }));
  const state = value(await run('calculations.state'));
  assert(state.selections[0].shells['2p'] === 'all', 'Oxygen 2p is missing');
  assert(state.options.method === 'cumulative' && state.options.sigma === 0.9, 'AVAS options differ');
  const forte2 = value(await run('forte2.export', { avas: {} }));
  const { subspace, selection_method, sigma, diagonalize } = forte2.avas.arguments;
  assert(same(subspace, ['O(2p)']) && selection_method === 'cumulative' && sigma === 0.9 && diagonalize,
    'AVAS arguments differ');

  const structure = JSON.parse(value(await run('structure.export'))).volume;
  const text = value(await run('session.export'));
  const deadline = Date.now() + 15000;
  while (!opened.VibeMolCommands && !opened.closed && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert(opened.VibeMolCommands, 'The new app tab did not finish loading');
  const fresh = opened.VibeMolCommands.run;
  const imported = value(await fresh('session.import', { text }));
  assert(imported.ok && imported.sceneCount === 1 && imported.sourceCount === 1, 'Session did not open');
  assert(same(JSON.parse(value(await fresh('structure.export'))).volume, structure), 'Restored structure differs');
  assert(same(value(await fresh('edit.getSelection')), { atomIds: [], indices: [], count: 0 }),
    'Expected an empty Edit selection after opening the session');

  const invalid = await run('edit.setSelection');
  const unknown = await run('app.unknown');
  assert(!invalid.ok && invalid.error.code === 'invalid-params', 'Expected invalid-params');
  assert(!unknown.ok && unknown.error.code === 'unknown-command', 'Expected unknown-command');
  console.log('Command workflow passed', forte2.avas.arguments);
})();
```
