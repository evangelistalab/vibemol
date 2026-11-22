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
  run: (params, api) => api.call('VibeMolEdit.getSelection'),
}
```

Descriptors contain `id`, `title`, `params`, `mutates` and `target`. The factory rejects invalid definitions, duplicate IDs and unsupported schema keywords. Target reads through `api.read(path)` and calls through `api.call(path, ...args)` resolve at execution time.

### Parameter schemas

Every schema specifies a `type` of `object`, `array`, `string`, `number`, `integer` or `boolean`. Supported constraints are:

- `properties`, `required` and `additionalProperties: false` for objects.
- `items`, `minItems` and `maxItems` for arrays.
- Inclusive `minimum` and `maximum` for numbers and integers.
- `enum` for exact JSON values.

`validateParams` returns `{ ok: true }` or `{ ok: false, errors: [{ path, message }] }`. Paths start at `$`. The command wrapper takes plain JSON data and clones it before forwarding. The product API still validates domain-specific rules such as file payload alternatives, recursive Edit predicate shapes, preset envelopes and AVAS selections.

### Results

`run` always returns a Promise that resolves to `{ ok: true, value }` or `{ ok: false, error: { code, message, details? } }`. A successful call returns a structured clone of the target's result. If a target uses its own `ok` field, inspect that field inside `value` to learn the product outcome.

| Code | Meaning |
| --- | --- |
| `unknown-command` | The ID is absent from the registry. |
| `invalid-params` | The request failed validation. `details` contains the paths and messages. |
| `not-available` | A required public namespace or member is missing. |
| `failed` | The target threw or rejected. `details.name` contains the original error name when available. A result that cannot be cloned sets `details.code` to `non-serializable-result`. |

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

Enter Edit explicitly before changing atom selection. `edit.setSelection` accepts a documented selection predicate and gives the original resolver result to Edit inside the same call. `calculations.selectShell` uses the atom's zero-based index and toggles the whole shell. See [Edit selection](edit-build-api.md) and [forte2 export](../forte2-interchange.md).

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
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  console.log(value(await run('app.info')));
  const response = await fetch(VibeMolAssets.url('./assets/fragments/water.xyz'));
  assert(response.ok, 'Could not fetch the bundled water file');
  assert(value(await run('files.load', {
    files: [{ name: 'water.xyz', text: await response.text() }],
  })).ok, 'Water did not load');

  value(value(await run('edit.enter', { tool: 'transform' })));
  const { atoms } = value(value(await run('edit.context')));
  const expected = { atomIds: [atoms[0].id, atoms[1].id], indices: [0, 1], count: 2 };
  const selected = value(value(await run('edit.setSelection', {
    selector: { kind: 'labels', labels: ['O1', 'H1'] },
  })));
  assert(same(selected, expected), 'Edit did not apply the requested selection');
  assert(same(value(value(await run('edit.getSelection'))), expected), 'Edit selection differs');

  value(await run('calculations.ready'));
  value(await run('calculations.selectShell', { index: 0, shell: '2p' }));
  value(await run('calculations.configure', { method: 'cumulative', sigma: 0.9 }));
  const state = value(await run('calculations.state'));
  assert(state.selections[0].shells['2p'] === 'all', 'Oxygen 2p is missing');
  assert(state.options.method === 'cumulative' && state.options.sigma === 0.9, 'AVAS options differ');
  const forte2 = value(value(await run('forte2.export', { avas: {} })));
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
  assert(same(value(value(await fresh('edit.getSelection'))), { atomIds: [], indices: [], count: 0 }),
    'Expected an empty Edit selection after opening the session');

  const invalid = await run('edit.setSelection');
  const unknown = await run('app.unknown');
  assert(!invalid.ok && invalid.error.code === 'invalid-params', 'Expected invalid-params');
  assert(!unknown.ok && unknown.error.code === 'unknown-command', 'Expected unknown-command');
  console.log('Command workflow passed', forte2.avas.arguments);
})();
```
