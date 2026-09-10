(function (global) {
  'use strict';

  // Source records supply new data. Once imported, the graph owns layer names,
  // order, membership, visibility, and deletion independently of those records.
  function createSceneSources({ graph, hasGrid, getDefaults, getSceneKey, getSceneName, getSourceKind }) {
    let sources = new Map();
    let nextSourceId = 1;

    function reset() {
      graph.clearScenes();
      sources = new Map();
    }

    function addOrbital(record, index) {
      const source = sources.get(record);
      const scene = graph.getScenes().find(item => item.sceneKey === getSceneKey(record));
      if (!source || !scene) return null;
      const existing = graph.getScenes().flatMap(item => graph.listLayers(item)).find(layer =>
        layer.record === record && layer.moldenMoIndex === index && !layer.isSceneGraphDuplicate);
      if (existing) return existing;
      const layer = graph.addCubeLayer(scene, Object.assign({}, getDefaults(), (record._moldenSceneGraphLayerStateByMo || {})[index] || {}, {
        sourceId: source.id, name: `MO ${index + 1}`, record, cubeData: null,
        moldenMoIndex: index, visible: index === record.moldenMoIndex,
      }));
      source.orbitals.add(index);
      return layer;
    }

    function reconcile(records, { activeRecord = null, preferActiveRecord = false } = {}) {
      const live = new Set(records || []);
      if (!live.size) { reset(); return null; }
      const byKey = new Map();
      for (const record of live) {
        const key = getSceneKey(record);
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(record);
      }
      for (const scene of graph.getScenes().slice()) {
        const group = byKey.get(scene.sceneKey);
        if (!group) { graph.removeScene(scene.id); continue; }
        if (!live.has(scene.moleculeRecord)) {
          scene.moleculeRecord = group[0];
          const molecule = graph.getLayerById(scene.moleculeLayerId);
          if (molecule) molecule.record = group[0];
        }
      }
      const focusedBefore = graph.getFocusedScene();
      let activeScene = null;
      let activeLayer = null;
      for (const [key, group] of byKey) {
        let scene = graph.getScenes().find(item => item.sceneKey === key);
        if (!scene) {
          const primary = group[0];
          const frames = primary.vol && primary.vol.trajectory && primary.vol.trajectory.frames;
          const trajectory = Array.isArray(frames) && frames.length > 1;
          scene = graph.createScene({
            name: getSceneName(group, { moleculeRecord: primary, trajectoryRecord: trajectory ? primary : null }),
            sourceFile: { name: primary.name, kind: getSourceKind(primary) },
            kind: trajectory ? 'trajectory' : null,
            trajectory: trajectory ? primary.vol.trajectory : null,
            meta: { frameCount: trajectory ? frames.length : 0 },
          });
          scene.sceneKey = key;
          scene.moleculeRecord = primary;
          graph.addMoleculeLayer(scene, { record: primary, atomCount: (primary.vol.atoms || []).length });
          graph.addScene(scene);
        }
        for (const record of group) {
          let source = sources.get(record);
          if (!source) {
            source = { id: `source-${nextSourceId++}`, record, cubeImported: false, orbitals: new Set() };
            sources.set(record, source);
          }
          const molden = record.vol && record.vol.kind === 'molden';
          if (record._sceneGraphHasOrbitalsGroup || molden || hasGrid(record.vol)) graph.ensureOrbitalsGroup(scene);
          if (!molden && hasGrid(record.vol) && !source.cubeImported) {
            const first = !graph.listLayers(scene).some(graph.isCubeLikeLayer);
            graph.addCubeLayer(scene, Object.assign({}, getDefaults(), record._sceneGraphLayerState || {}, {
              sourceId: source.id,
              name: record.name,
              record,
              cubeData: record.vol,
              visible: record._sceneGraphLayerState && record._sceneGraphLayerState.visible != null
                ? record._sceneGraphLayerState.visible : first,
            }));
            source.cubeImported = true;
          }
          for (const index of molden ? record.moldenMaterializedOrbitalIndices || [] : []) {
            if (source.orbitals.has(index)) continue;
            const layer = addOrbital(record, index);
            if (record === activeRecord && index === record.moldenMoIndex) activeLayer = layer;
          }
          if (record === activeRecord) {
            activeScene = scene;
            activeLayer = graph.getScenes().flatMap(item => graph.listLayers(item)).find(layer => (
              layer.kind === graph.kinds.CUBE && layer.record === record && !layer.isSceneGraphDuplicate
              && (!molden || layer.moldenMoIndex === record.moldenMoIndex)
            )) || activeLayer;
          }
        }
      }
      // Copied layers can still refer to a source whose original scene was removed.
      const referenced = new Set(graph.getScenes().flatMap(scene => graph.listLayers(scene)).map(layer => layer.record));
      for (const record of sources.keys()) if (!live.has(record) && !referenced.has(record)) sources.delete(record);
      if (preferActiveRecord && activeLayer) {
        graph.setActiveLayer(activeLayer.id);
        graph.setSelection([activeLayer.id]);
      }
      else if (preferActiveRecord && activeScene) graph.setFocusedScene(activeScene.id);
      else if (focusedBefore && graph.findScene(focusedBefore.id)) graph.setFocusedScene(focusedBefore.id);
      if (preferActiveRecord && activeRecord) graph.setMoleculeRecord(graph.getFocusedScene(), activeRecord);
      return graph.getFocusedScene();
    }

    return Object.freeze({ reconcile, reset, addOrbital, getSources: () => Array.from(sources.values()) });
  }

  global.VibeMolSceneSources = Object.freeze({ createSceneSources });
})(typeof window !== 'undefined' ? window : globalThis);
