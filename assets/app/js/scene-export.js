(function (global) {
  'use strict';

  function listTargets(graph) {
    return graph.getScenes().flatMap(scene => {
      const cubes = graph.listLayers(scene).filter(layer => graph.isCubeLikeLayer(layer) && layer.cubeDataValid !== false);
      const layers = cubes.length ? cubes : [graph.getLayerById(scene.moleculeLayerId)].filter(Boolean);
      return layers.map(layer => ({ scene, layer, name: cubes.length ? layer.name : scene.name }));
    });
  }

  function captureGraphState(graph) {
    const state = graph.getState();
    return {
      focusedSceneId: state.focusedSceneId,
      activeSceneId: state.activeSceneId,
      activeLayerId: state.activeLayerId,
      selectedLayerIds: state.selectedLayerIds.slice(),
      scenes: graph.getScenes().map(scene => ({
        scene, visible: scene.visible, activeLayerId: scene.activeLayerId, moleculeRecord: scene.moleculeRecord,
        layers: graph.listLayers(scene).map(layer => ({ layer, visible: layer.visible, record: layer.record })),
      })),
    };
  }

  function activateTarget(graph, target) {
    for (const scene of graph.getScenes()) {
      scene.visible = scene === target.scene;
      for (const layer of graph.listLayers(scene)) {
        if (graph.isCubeLikeLayer(layer)) layer.visible = layer === target.layer;
        if (layer.kind === graph.kinds.ORBITALS_GROUP) layer.visible = true;
      }
    }
    graph.setActiveLayer(target.layer.id);
    if (target.layer.record) graph.setMoleculeRecord(target.scene, target.layer.record);
  }

  function restoreGraphState(graph, saved) {
    for (const item of saved.scenes) {
      item.scene.visible = item.visible;
      item.scene.activeLayerId = item.activeLayerId;
      item.scene.moleculeRecord = item.moleculeRecord;
      for (const { layer, visible, record } of item.layers) Object.assign(layer, { visible, record });
    }
    Object.assign(graph.getState(), {
      focusedSceneId: saved.focusedSceneId,
      activeSceneId: saved.activeSceneId,
      activeLayerId: saved.activeLayerId,
      selectedLayerIds: saved.selectedLayerIds.slice(),
    });
  }

  async function exportTargets(targets, { captureState, activate, render, capture, restore }) {
    const state = captureState();
    try {
      for (const target of targets) {
        await activate(target);
        await render(target);
        await capture(target);
      }
    } finally {
      await restore(state);
    }
  }

  global.VibeMolSceneExport = Object.freeze({ listTargets, captureGraphState, activateTarget, restoreGraphState, exportTargets });
})(typeof window !== 'undefined' ? window : globalThis);
