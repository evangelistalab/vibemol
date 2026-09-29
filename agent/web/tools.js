(function (global) {
  'use strict';

  /**
   * Agent tool registry: one handler per tool in agent/tools.schema.json.
   * The same schema is bundled into the relay (agent/relay), so the page and the
   * server always agree on tool names and arguments.
   * @param {{schema:{tools:Array<{name:string,inputSchema:object}>}, apis?:object}} options
   */
  function createAgentTools(options = {}) {
    const schema = options.schema;
    if (!schema || !Array.isArray(schema.tools)) throw new Error('Agent tool schema is missing.');
    const apis = options.apis || global;
    const host = () => {
      const h = apis.VibeMolAgentHost;
      if (!h) throw new Error('VibeMol is still starting; try again in a moment.');
      return h;
    };

    const ui = () => {
      if (!apis.VibeMolAgentUI) throw new Error('UI reflection module is not loaded.');
      return apis.VibeMolAgentUI;
    };

    const ext = () => {
      if (!apis.VibeMolAgentExtensions) throw new Error('Extensions module is not loaded.');
      return apis.VibeMolAgentExtensions;
    };

    const handlers = {
      vibemol_get_state: () => host().getSummary(),

      vibemol_list_appearance_settings: ({ filter } = {}) => {
        const preset = apis.VibeMolPreset;
        const needle = String(filter || '').toLowerCase();
        const current = preset.export().settings || {};
        return preset.listSchema()
          .filter(entry => !needle || [entry.key, entry.section, entry.description].some(v => String(v || '').toLowerCase().includes(needle)))
          .map(entry => ({ key: entry.key, section: entry.section, type: entry.type, description: entry.description, value: current[entry.key] }));
      },

      vibemol_set_appearance: ({ settings }) => {
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('settings must be an object.');
        const preset = apis.VibeMolPreset;
        const known = new Set(preset.listKeys());
        const unknown = Object.keys(settings).filter(key => !known.has(key));
        if (unknown.length) throw new Error(`Unknown setting keys: ${unknown.join(', ')}. Use vibemol_list_appearance_settings.`);
        const result = preset.import({ kind: preset.kind, presetVersion: preset.version, settings }, { mode: 'relaxed' });
        return { applied: result.applied, warnings: result.warnings };
      },

      vibemol_translate_molecule: ({ dx = 0, dy = 0, dz = 0, frame = 'world' } = {}) => {
        const h = host();
        let delta = [Number(dx) || 0, Number(dy) || 0, Number(dz) || 0];
        if (frame === 'screen') delta = screenToWorld(delta, h.getCameraAxes());
        const label = frame === 'screen' ? 'Agent: move molecule (view frame)' : 'Agent: move molecule';
        return Object.assign({ frame }, h.translateActiveMoleculeAngstrom(delta[0], delta[1], delta[2], label));
      },

      vibemol_center_com: () => ({ moved: !!host().centerActiveMoleculeMassAtOrigin() }),

      vibemol_history: ({ action }) => {
        if (action !== 'undo' && action !== 'redo') throw new Error('action must be "undo" or "redo".');
        return { action, changed: !!host()[action]() };
      },

      vibemol_load_structure_text: async ({ name, text, replace = false }) => {
        const result = await apis.VibeMolEmbed.loadFiles([{ name: String(name), text: String(text) }], { clearFirst: !!replace });
        return { loaded: String(name), result: result === undefined ? null : result };
      },

      vibemol_screenshot: ({ maxSize = 768 } = {}) => ({ image: host().captureImage(maxSize) }),

      vibemol_list_trajectories: () => host().listTrajectories(),

      vibemol_list_atoms: ({ start, count } = {}) => host().listAtoms(start, count),

      vibemol_edit_atoms: (args = {}) => {
        const op = Object.assign({}, args);
        if (op.operation === 'move' && op.frame === 'screen') op.delta = screenToWorld((op.delta || []).map(Number), host().getCameraAxes());
        return host().editAtoms(op);
      },

      // Generic UI reflection (agent/web/ui.js): reaches every control
      // in the page, including features added after this file was written.
      vibemol_list_controls: args => ui().listControls(args),
      vibemol_operate_control: args => ui().operateControl(args),
      vibemol_press_key: args => ui().pressKey(args),
      vibemol_read_text: args => ui().readText(args),
      vibemol_run_script: args => ui().runScript(args),

      vibemol_read_source: args => {
        if (!apis.VibeMolAgentSource) throw new Error('Source reader is not loaded.');
        return apis.VibeMolAgentSource.readSource(args || {});
      },
      vibemol_save_extension: args => ext().save(args || {}),
      vibemol_list_extensions: args => ext().list(args || {}),
      vibemol_manage_extension: args => ext().manage(args || {}),

      vibemol_get_selection: args => {
        if (!apis.VibeMolAgentLasso) throw new Error('Lasso module is not loaded.');
        return apis.VibeMolAgentLasso.getSelection(args || {});
      },

      vibemol_set_trajectory_sync: ({ sceneIds, enabled }) => {
        if (typeof enabled !== 'boolean') throw new Error('enabled must be true or false.');
        return host().setTrajectorySync(sceneIds, enabled);
      },

      vibemol_trajectory_playback: ({ sceneIds, action, frame }) => {
        if (action === 'frame' && !Number.isFinite(Number(frame))) throw new Error('frame is required when action is "frame".');
        return host().setTrajectoryPlayback(sceneIds, action, frame);
      },
    };

    const byName = new Map(schema.tools.map(tool => [tool.name, tool]));
    for (const name of byName.keys()) {
      if (!handlers[name]) throw new Error(`No handler for schema tool ${name}.`);
    }

    async function call(name, args) {
      if (!byName.has(name) || !handlers[name]) throw new Error(`Unknown tool: ${name}`);
      return handlers[name](args && typeof args === 'object' ? args : {});
    }

    return Object.freeze({ list: () => schema.tools.map(tool => tool.name), call, handlerNames: () => Object.keys(handlers) });
  }

  /** Convert a view-frame vector (x right, y up, z toward viewer) to world axes. */
  function screenToWorld(delta, axes) {
    const out = [0, 0, 0];
    const basis = [axes.right, axes.up, axes.towardViewer];
    for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) out[k] += delta[i] * basis[i][k];
    return out;
  }

  let ready = null;
  function whenReady() {
    if (!ready) {
      ready = fetch((global.VibeMolAgentConfig || {}).schemaUrl || './agent/tools.schema.json', { cache: 'no-cache' })
        .then(response => { if (!response.ok) throw new Error(`Schema HTTP ${response.status}`); return response.json(); })
        .then(schema => createAgentTools({ schema }));
    }
    return ready;
  }

  global.VibeMolAgentTools = Object.freeze({ createAgentTools, screenToWorld, whenReady });
})(typeof window !== 'undefined' ? window : globalThis);
