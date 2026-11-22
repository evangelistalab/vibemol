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

  function command(id, title, params, mutates, target, forward = args => [args]) {
    return { id, title, params, mutates, target, run: (args, api) => api.call(target, ...forward(args)) };
  }
  const noArgs = () => [];

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
    }, ['files']), true, 'VibeMolEmbed.loadFiles', ({ files, options }) => [files, options]),
    command('session.export', 'Export the workspace session as text',
      object({ maxBytes: { type: 'integer', minimum: 1 } }), false, 'VibeMolSession.exportText'),
    command('session.import', 'Open a workspace session from text', object({ text: string }, ['text']),
      true, 'VibeMolSession.importText', ({ text }) => [text]),
    command('structure.export', 'Export the active structure as text', object(), false,
      'VibeMolStructure.exportActiveText', noArgs),
    command('preset.export', 'Export the current preset', object({ name: string, persistScope: string }),
      false, 'VibeMolPreset.export'),
    command('preset.import', 'Import a preset', object({
      preset: data, options: object({ mode: choice('strict', 'relaxed'), afterApply: boolean, applyBuilder: boolean }),
    }, ['preset']), true, 'VibeMolPreset.import', ({ preset, options }) => [preset, options]),
    command('edit.enter', 'Enter Edit mode', object({ tool: choice('transform', 'build') }), true, 'VibeMolEdit.enter'),
    command('edit.context', 'Get the current Edit context', object(), false, 'VibeMolEdit.context', noArgs),
    command('edit.getSelection', 'Get the current atom selection', object(), false, 'VibeMolEdit.getSelection', noArgs),
    {
      id: 'edit.setSelection', title: 'Set the atom selection from a predicate',
      params: object({
        selector: predicate,
        options: object({ mode: choice('replace', 'add', 'remove', 'toggle') }),
      }, ['selector']),
      mutates: true, target: 'VibeMolEdit.setSelection',
      run({ selector, options }, api) {
        const resolution = api.call('VibeMolEdit.resolveSelection', selector);
        return resolution.ok ? api.call('VibeMolEdit.setSelection', resolution.value, options) : resolution;
      },
    },
    command('edit.clearSelection', 'Clear the current atom selection', object(), true, 'VibeMolEdit.clearSelection', noArgs),
    command('calculations.ready', 'Load the Calculations reference bases', object(), false, 'VibeMolCalculations.ready', noArgs),
    command('calculations.selectShell', 'Toggle a whole shell on an atom', object({ index, shell: string }, ['index', 'shell']),
      true, 'VibeMolCalculations.selectShell', ({ index, shell }) => [index, shell]),
    command('calculations.state', 'Get the Calculations state', object(), false, 'VibeMolCalculations.state', noArgs),
    command('calculations.configure', 'Configure the Calculations options', object({
      reference: string, charge: number, ms: number, basis: string, auxiliary: string, minao: string,
      method: string, sigma: number, cutoff: number, docc: number, uocc: number, total: number,
      totalFollowsSelection: boolean, diagonalize: boolean, cas: array(index, { minItems: 2, maxItems: 2 }),
    }), true, 'VibeMolCalculations.configure'),
    command('forte2.export', 'Export forte2 input selections', object({
      system: object({ systemId: string, fingerprint: string }, ['systemId', 'fingerprint']),
      fragment: predicate,
      avas: object({
        planes: array(object({ kind: choice('piPlane'), seed: data }, ['kind', 'seed']), { maxItems: 40 }),
      }),
    }), false, 'VibeMolForte2.export'),
  ];

  const { list, describe, run } = global.VibeMolCommandRegistry.createCommandRegistry(definitions);
  global.VibeMolCommands = Object.freeze({ kind, version, list, describe, run });
})(window);
