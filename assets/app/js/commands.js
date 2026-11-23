(function (global) {
  'use strict';

  const kind = 'vibemol.commands';
  const version = 1;
  const string = { type: 'string' };
  const boolean = { type: 'boolean' };
  const number = { type: 'number' };
  const index = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
  const data = { type: 'object' };
  const object = (properties = {}, required = []) => ({
    type: 'object', properties, required, additionalProperties: false,
  });
  const choice = (...values) => ({ type: 'string', enum: values });
  const array = (items, bounds = {}) => ({ type: 'array', items, ...bounds });
  const nonemptyStrings = array(string, { minItems: 1 });

  // The product resolver checks kind-specific fields and nested predicates.
  // This schema checks the fields common to the documented predicate language.
  const predicate = object({
    kind: choice('all', 'ids', 'element', 'labels', 'fragment', 'component',
      'union', 'intersection', 'difference', 'piPlane'),
    ids: nonemptyStrings, labels: nonemptyStrings, element: string,
    instanceId: string, role: choice('owned', 'footprint'), members: nonemptyStrings,
    seed: data, selectors: array(data, { minItems: 2 }), left: data, right: data,
  }, ['kind']);

  function command(id, title, params, mutates, target, { args = input => [input], outcome = 'value', report = false } = {}) {
    return {
      id, title, params, mutates, target, outcome,
      run(input, api) {
        const result = api.call(target, ...args(input));
        return report ? Promise.resolve(result).then(reportOutcome) : result;
      },
    };
  }
  const noArgs = () => [];
  const envelope = { outcome: 'envelope' };

  // Files and presets report a status alongside their readback rather than
  // returning a value/error pair. Preserve partial load and import receipts.
  function reportOutcome(result) {
    if (result?.ok === true) return { ok: true, value: result };
    if (result?.ok === false) return { ok: false, error: result };
    return null;
  }

  function assignedAtoms(state, shell) {
    return new Set(state.selections.filter(row => row.shells[shell] === 'all').map(row => row.id));
  }

  function toggleShell(requested, api) {
    const { index, shell } = requested;
    const before = assignedAtoms(api.call('VibeMolCalculations.state'), shell);
    api.call('VibeMolCalculations.selectShell', index, shell);
    const after = assignedAtoms(api.call('VibeMolCalculations.state'), shell);
    const changes = [...new Set([...before, ...after])].filter(id => before.has(id) !== after.has(id));
    const applied = changes.length === 1;
    const result = { requested, applied, assigned: applied && after.has(changes[0]) };
    return applied ? { ok: true, value: result }
      : { ok: false, error: { ...result, message: 'The requested shell toggle was not applied' } };
  }

  function configure(requested, api) {
    const before = api.call('VibeMolCalculations.state').options;
    api.call('VibeMolCalculations.configure', requested);
    const applied = api.call('VibeMolCalculations.state').options;
    const expected = { ...requested };
    if (Object.hasOwn(expected, 'total')) {
      // The public model derives the total when selection counting is enabled.
      if (expected.totalFollowsSelection === true) delete expected.total;
      else expected.totalFollowsSelection = false;
    }
    const differences = Object.keys(expected).filter(key => JSON.stringify(expected[key]) !== JSON.stringify(applied[key]));
    return differences.length ? { ok: false, error: { requested, before, applied, differences, message: 'Some Calculations options were not applied' } }
      : { ok: true, value: { requested, applied } };
  }

  const definitions = [
    {
      id: 'app.info', title: 'Get the app and command registry versions',
      params: object(), mutates: false, target: 'VibeMolAssets.version',
      run: (_, api) => ({
        appVersion: api.read('VibeMolAssets.version'),
        commandVersion: api.read('VibeMolCommands.version'),
      }),
    },
    command('files.load', 'Load embedded files', object({
      files: array(object({ name: string, mimeType: string, text: string, base64: string }, ['name']), { minItems: 1 }),
      options: object({ clearFirst: boolean, targetSceneKey: string, newScenes: boolean, extras: data }),
    }, ['files']), true, 'VibeMolEmbed.loadFiles', {
      ...envelope, report: true, args: ({ files, options }) => [files, options],
    }),
    command('session.export', 'Export the workspace session as text',
      object({ maxBytes: { type: 'integer', minimum: 1 } }), false, 'VibeMolSession.exportText'),
    command('session.import', 'Open a workspace session from text', object({ text: string }, ['text']),
      true, 'VibeMolSession.importText', { args: ({ text }) => [text] }),
    command('structure.export', 'Export the active structure as text', object(), false,
      'VibeMolStructure.exportActiveText', { args: noArgs }),
    command('preset.export', 'Export the current preset', object({ name: string, persistScope: string }),
      false, 'VibeMolPreset.export'),
    command('preset.import', 'Import a preset', object({
      preset: data, options: object({ mode: choice('strict', 'relaxed'), afterApply: boolean, applyBuilder: boolean }),
    }, ['preset']), true, 'VibeMolPreset.import', {
      ...envelope, report: true, args: ({ preset, options }) => [preset, options],
    }),
    command('edit.enter', 'Enter Edit mode', object({ tool: choice('transform', 'build') }), true, 'VibeMolEdit.enter', envelope),
    command('edit.context', 'Get the current Edit context', object(), false, 'VibeMolEdit.context', { ...envelope, args: noArgs }),
    command('edit.getSelection', 'Get the current atom selection', object(), false, 'VibeMolEdit.getSelection', { ...envelope, args: noArgs }),
    {
      id: 'edit.setSelection', title: 'Set the atom selection from a predicate',
      params: object({
        selector: predicate,
        options: object({ mode: choice('replace', 'add', 'remove', 'toggle') }),
      }, ['selector']),
      mutates: true, target: 'VibeMolEdit.setSelection', outcome: 'envelope',
      run({ selector, options }, api) {
        const resolution = api.call('VibeMolEdit.resolveSelection', selector);
        if (resolution?.ok !== true || !Object.hasOwn(resolution, 'ok')
          || !Object.hasOwn(resolution, 'value') || Object.hasOwn(resolution, 'error')) return resolution;
        return api.call('VibeMolEdit.setSelection', resolution.value, options);
      },
    },
    command('edit.clearSelection', 'Clear the current atom selection', object(), true, 'VibeMolEdit.clearSelection', { ...envelope, args: noArgs }),
    command('calculations.ready', 'Load the Calculations reference bases', object(), false, 'VibeMolCalculations.ready', { args: noArgs }),
    {
      id: 'calculations.selectShell', title: 'Toggle assignment of a whole shell on an atom',
      params: object({ index, shell: string }, ['index', 'shell']), mutates: true,
      target: 'VibeMolCalculations.selectShell', outcome: 'envelope', run: toggleShell,
    },
    command('calculations.state', 'Get the Calculations state', object(), false, 'VibeMolCalculations.state', { args: noArgs }),
    {
      id: 'calculations.configure', title: 'Configure the Calculations options',
      params: object({
        reference: string, charge: number, ms: number, basis: string, auxiliary: string, minao: string,
        method: string, sigma: number, cutoff: number, docc: number, uocc: number, total: number,
        totalFollowsSelection: boolean, diagonalize: boolean,
        cas: array({ type: ['integer', 'null'], minimum: 0 }, { minItems: 2, maxItems: 2 }),
      }),
      mutates: true, target: 'VibeMolCalculations.configure', outcome: 'envelope', run: configure,
    },
    command('forte2.export', 'Export forte2 input selections', object({
      system: object({ systemId: string, fingerprint: string }, ['systemId', 'fingerprint']),
      fragment: predicate,
      avas: object({
        planes: array(object({ kind: choice('piPlane'), seed: data }, ['kind', 'seed']), { maxItems: 40 }),
      }),
    }), false, 'VibeMolForte2.export', envelope),
  ];

  const { list, describe, run } = global.VibeMolCommandRegistry.createCommandRegistry(definitions);
  global.VibeMolCommands = Object.freeze({ kind, version, list, describe, run });
})(window);
