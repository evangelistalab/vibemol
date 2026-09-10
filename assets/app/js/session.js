(function (global) {
  'use strict';

  const FORMAT = global.VibeMolSessionFormat;
  const VOLUME_FIELDS = ['title', 'comment', 'natoms', 'units', 'kind', 'origin', 'axes', 'nxyz', 'atoms',
    'bonds', 'annotations', 'fragmentOps', 'isoHint', 'data', 'isTwoComponent', 'alphaRe', 'alphaIm', 'betaRe', 'betaIm'];
  const RECORD_FIELDS = ['moldenMoIndex', 'moldenGridStepAng', 'moldenGridPaddingAng',
    'measurementLabelOffsets', 'pubchemMeta', '_sceneGraphHasOrbitalsGroup', '_sceneGraphLayerState', '_moldenSceneGraphLayerStateByMo'];
  const SCENE_FIELDS = ['id', 'name', 'visible', 'expanded', 'sceneKey', 'sourceFile', 'kind', 'meta',
    'moleculeLayerId', 'orbitalsGroupId', 'measurementsGroupId', 'activeLayerId'];
  const LAYER_FIELDS = ['id', 'sceneId', 'parentId', 'kind', 'name', 'visible', 'expanded', 'labelId',
    'moldenMoIndex', 'isSceneGraphDuplicate', 'atomCount', 'operation', 'inputs', 'nameUserEdited', 'cubeDataValid'];

  function pick(value, keys) {
    const out = {};
    for (const key of keys) if (value && value[key] !== undefined) out[key] = value[key];
    return out;
  }

  function captureVolume(vol) {
    const out = pick(vol, VOLUME_FIELDS);
    out.natoms = vol.atoms.length;
    out.units = vol.units || 'bohr';
    out.bonds = vol.bonds || [];
    if (vol.isTwoComponent) out.data = vol.alphaRe;
    if (vol.trajectory) {
      out.trajectory = Object.assign(pick(vol.trajectory, ['frames', 'comments', 'fps', 'loop', 'syncEnabled']), {
        frameIndex: vol.trajectory.currentFrame ?? vol.trajectory.frameIndex ?? 0,
        fps: vol.trajectory.fps || 12,
        playing: false,
      });
    }
    if (vol.vibration) {
      out.vibration = pick(vol.vibration, ['kind', 'sourceName', 'units', 'atomCount', 'atomSymbols', 'modes',
        'modeIndex', 'amplitude', 'speed', 'phase', 'equilibrium']);
    }
    if (vol.kind === 'molden') {
      out.molden = pick(vol.molden, ['atomUnit', 'angularFlags', 'basis', 'basisCount', 'moCount', 'mos']);
      // The selected orbital's compatibility grid is a disposable cache.
      Object.assign(out, { data: new Float32Array(0), nxyz: [0, 0, 0], origin: [0, 0, 0], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] });
    }
    return out;
  }

  function capture({ graph, sources, records, activeRecord, preset, view, appVersion }) {
    const scenes = graph.getScenes();
    const recordsToSave = new Set(records);
    for (const scene of scenes) {
      if (scene.moleculeRecord) recordsToSave.add(scene.moleculeRecord);
      for (const layer of scene.layers) if (layer.record) recordsToSave.add(layer.record);
    }
    const ids = new Map();
    const entries = [];
    const sceneKeys = new Set(scenes.map(scene => scene.sceneKey));
    for (const record of recordsToSave) {
      const source = sources.register(record);
      ids.set(record, source.id);
      // An orphaned source belongs to a surviving scene for legacy record access,
      // while its source ID and the graph's actual layer membership stay intact.
      const owner = scenes.find(scene => scene.moleculeRecord === record || scene.layers.some(layer => layer.record === record));
      const sceneKey = sceneKeys.has(record._sceneGraphSceneKey) ? record._sceneGraphSceneKey : owner && owner.sceneKey;
      const recordState = pick(record, RECORD_FIELDS);
      if (record.vol.kind === 'molden') Object.assign(recordState, {
        moldenMoIndex: record.moldenMoIndex ?? -1,
        moldenGridStepAng: record.moldenGridStepAng ?? 0.35,
        moldenGridPaddingAng: record.moldenGridPaddingAng ?? 3,
      });
      entries.push({ id: source.id, name: record.name, sceneKey, recordState, volume: captureVolume(record.vol) });
    }
    const state = graph.getState();
    return {
      kind: FORMAT.KIND, sessionVersion: FORMAT.VERSION, appVersion,
      name: scenes[0] && scenes[0].name || 'VibeMol session', savedAt: new Date().toISOString(),
      sources: entries, records: Array.from(recordsToSave, record => ids.get(record)), activeSourceId: ids.get(activeRecord) || null,
      graph: Object.assign(pick(state, ['activeSceneId', 'activeLayerId', 'focusedSceneId', 'selectedLayerIds']), {
        syncMaster: { frame: state.syncMaster.frame || 0, fps: state.syncMaster.fps || 12 },
        scenes: scenes.map(scene => Object.assign(pick(scene, SCENE_FIELDS), {
          moleculeSourceId: ids.get(scene.moleculeRecord),
          layers: scene.layers.map(layer => {
            const out = Object.assign(pick(layer, LAYER_FIELDS), { sourceId: ids.get(layer.record) || null });
            if (graph.isCubeLikeLayer(layer)) Object.assign(out, graph.createCubeAppearance(layer));
            if (layer.cubeData && (layer.kind === 'arithmetic' || (!layer.record
              || (layer.isSceneGraphDuplicate && layer.record.vol.kind !== 'molden' && layer.cubeData !== layer.record.vol)))) {
              out.volume = captureVolume(layer.cubeData);
            }
            return out;
          }),
        })),
      }),
      preset, view,
    };
  }

  function hydrate(session, { prepareVolume = value => value } = {}) {
    FORMAT.validate(session);
    const sources = session.sources.map(source => {
      const vol = source.volume;
      vol.idx = (i, j, k) => (i * vol.nxyz[1] + j) * vol.nxyz[2] + k;
      if (vol.trajectory) Object.assign(vol.trajectory, { currentFrame: vol.trajectory.frameIndex, playing: false, _lastStepMs: 0 });
      const record = Object.assign({}, source.recordState, { name: source.name, vol: prepareVolume(vol), _sceneGraphSceneKey: source.sceneKey });
      return { id: source.id, record };
    });
    const byId = new Map(sources.map(source => [source.id, source.record]));
    const graph = global.VibeMolSceneGraph.createSceneGraphController();
    for (const saved of session.graph.scenes) {
      const scene = Object.assign(graph.createScene(saved), { sceneKey: saved.sceneKey, moleculeRecord: byId.get(saved.moleculeSourceId) });
      if (scene.kind === 'trajectory') scene.trajectory = scene.moleculeRecord.vol.trajectory;
      for (const entry of saved.layers) {
        const { volume, ...fields } = entry;
        const record = byId.get(entry.sourceId) || null;
        let cubeData = volume || (record && record.vol.kind !== 'molden' && entry.kind === 'cube' ? record.vol : null);
        if (volume) {
          volume.idx = (i, j, k) => (i * volume.nxyz[1] + j) * volume.nxyz[2] + k;
          cubeData = prepareVolume(volume);
        }
        graph.addLayer(scene, Object.assign({}, fields, { record, cubeData, surfaceMetricCache: new Map() }));
      }
      graph.addScene(scene);
    }
    Object.assign(graph.getState(), pick(session.graph, ['activeSceneId', 'activeLayerId', 'focusedSceneId', 'selectedLayerIds']), {
      syncMaster: Object.assign({}, session.graph.syncMaster, { playing: false, lastStepMs: 0 }),
    });
    return { graph: graph.getState(), sources, records: session.records.map(key => byId.get(key)),
      activeRecord: byId.get(session.activeSourceId) || null, preset: session.preset, view: session.view, name: session.name };
  }

  function createSessionController(deps) {
    let opening = false;
    const busyReason = () => opening ? 'A session is being opened.' : deps.getBusyReason && deps.getBusyReason();
    async function exportText(options = {}) {
      const reason = busyReason();
      if (reason) throw new Error(reason);
      const snapshot = capture(deps.getState());
      FORMAT.validate(snapshot);
      return FORMAT.encode(snapshot, options);
    }
    async function importText(text) {
      const reason = busyReason();
      if (reason) throw new Error(reason);
      opening = true;
      if (deps.setOpening) deps.setOpening(true);
      try {
        const decoded = await FORMAT.decode(text);
        const staged = hydrate(decoded, { prepareVolume: deps.prepareVolume });
        await deps.applyState(staged);
        if (deps.onOpened) deps.onOpened(staged);
        return { ok: true, name: decoded.name, sceneCount: decoded.graph.scenes.length, sourceCount: decoded.sources.length };
      } finally {
        opening = false;
        if (deps.setOpening) deps.setOpening(false);
      }
    }
    return Object.freeze({
      kind: FORMAT.KIND, version: FORMAT.VERSION, exportText, importText,
      export: async options => JSON.parse(await exportText(options)),
      import: envelope => importText(JSON.stringify(envelope)),
      validateText: async text => {
        const session = await FORMAT.decode(text);
        return { ok: true, sceneCount: session.graph.scenes.length, sourceCount: session.sources.length };
      },
      isOpening: () => opening,
    });
  }

  global.VibeMolSessionModule = Object.freeze({ capture, captureVolume, hydrate, createSessionController });
})(typeof window !== 'undefined' ? window : globalThis);
