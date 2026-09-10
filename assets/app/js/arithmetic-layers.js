(function (global) {
  'use strict';

  // Dependency traversal and staged computation have no DOM or popover state.
  function createArithmeticLayers({ graph: sceneGraphController, runner, getGrid, cloneGrid }) {
    const SCENE_LAYER_KIND = sceneGraphController.kinds;
    const isCubeLikeLayer = sceneGraphController.isCubeLikeLayer;
    const getCubeLayersInScene = scene => sceneGraphController.listLayers(scene).filter(isCubeLikeLayer);

    async function compute(operation, inputs, name, settings = {}) {
      try {
        const operands = (inputs || []).map(input => {
          const layer = sceneGraphController.getLayerById(input.layerId);
          const override = settings.overrides && settings.overrides.get(input.layerId);
          return {
            layer,
            label: layer && (layer.labelId || layer.name),
            coefficient: Number(input.coefficient),
            vol: override || (layer && layer.cubeDataValid !== false ? getGrid(layer) : null),
          };
        });
        if (!operands.length || operands.some(item => !isCubeLikeLayer(item.layer) || !item.vol)) {
          return { ok: false, error: 'An operand is missing or has invalid data.' };
        }
        const computed = await runner.compute(operation, operands, name, settings);
        if (!computed.ok) return computed;
        if (operands.some(item => sceneGraphController.getLayerById(item.layer.id) !== item.layer)) {
          return { ok: false, error: 'An operand was removed during calculation. Please try again.' };
        }
        return { ok: true, cubeData: cloneGrid(computed.baseVol, computed.data, name), resamplePlan: computed.resamplePlan };
      } catch (err) {
        return { ok: false, error: String(err && err.message || err) };
      }
    }

    async function stageUpdate(layer, operation, inputs, name, settings = {}) {
      const scene = sceneGraphController.getSceneForLayer(layer);
      if (!scene) return { ok: false, error: 'Layer no longer exists.' };
      if ((inputs || []).some(input => arithmeticLayerDependsOn(input.layerId, layer.id))) {
        return { ok: false, error: 'Choose a non-circular operand.' };
      }
      const affected = [layer, ...getArithmeticDependentsInRecomputeOrder(scene, layer.id)];
      const snapshots = affected.map(item => ({ item, data: item.cubeData, config: JSON.stringify([item.operation, item.inputs]) }));
      const overrides = new Map();
      let stagedBytes = 0;
      const maxBytes = Math.min(Number(settings.limits && settings.limits.maxBytes) || 256 * 1024 * 1024, 256 * 1024 * 1024);
      for (const item of affected) {
        const result = await compute(item === layer ? operation : item.operation,
          item === layer ? inputs : item.inputs, item === layer ? name : item.name,
          Object.assign({}, settings, { overrides, limits: Object.assign({}, settings.limits, { maxBytes: Math.max(1, maxBytes - stagedBytes) }) }));
        if (!result.ok) return result;
        overrides.set(item.id, result.cubeData);
        stagedBytes += result.cubeData.data.byteLength;
      }
      return { ok: true, commit() {
        if (settings.signal && settings.signal.aborted) return false;
        if (snapshots.some(({ item, data, config }) => sceneGraphController.getLayerById(item.id) !== item
          || item.cubeData !== data || JSON.stringify([item.operation, item.inputs]) !== config)) return false;
        Object.assign(layer, { operation, inputs, name });
        for (const item of affected) Object.assign(item, { cubeData: overrides.get(item.id), cubeDataValid: true });
        return true;
      } };
    }

    function arithmeticLayerDependsOn(layerOrId, targetLayerId, visited = new Set()) {
      const layer = typeof layerOrId === 'string' ? sceneGraphController.getLayerById(layerOrId) : layerOrId;
      const targetId = String(targetLayerId || '');
      if (!(layer && targetId) || visited.has(layer.id)) return false;
      if (layer.id === targetId) return true;
      visited.add(layer.id);
      if (layer.kind !== SCENE_LAYER_KIND.ARITHMETIC) return false;
      for (const input of Array.isArray(layer.inputs) ? layer.inputs : []) {
        const inputId = String(input && input.layerId || '');
        if (inputId === targetId) return true;
        const inputLayer = sceneGraphController.getLayerById(inputId);
        if (arithmeticLayerDependsOn(inputLayer, targetId, visited)) return true;
      }
      return false;
    }

    function getCircularOperandIdsForEdit(scene, editedLayerId) {
      const out = new Set();
      if (!scene || !editedLayerId) return out;
      for (const layer of getCubeLayersInScene(scene)) {
        if (!isCubeLikeLayer(layer)) continue;
        if (layer.id === editedLayerId || arithmeticLayerDependsOn(layer, editedLayerId)) out.add(layer.id);
      }
      return out;
    }

    function buildArithmeticDependencyDepthMap(scene) {
      const layers = getCubeLayersInScene(scene);
      const byId = new Map(layers.map((layer) => [layer.id, layer]));
      const memo = new Map();
      const depthFor = (layerId, stack = new Set()) => {
        if (memo.has(layerId)) return memo.get(layerId);
        const layer = byId.get(layerId);
        if (!(layer && layer.kind === SCENE_LAYER_KIND.ARITHMETIC) || stack.has(layerId)) {
          memo.set(layerId, 0);
          return 0;
        }
        stack.add(layerId);
        let depth = 0;
        for (const input of Array.isArray(layer.inputs) ? layer.inputs : []) {
          depth = Math.max(depth, 1 + depthFor(input.layerId, stack));
        }
        stack.delete(layerId);
        memo.set(layerId, depth);
        return depth;
      };
      for (const layer of layers) depthFor(layer.id);
      return memo;
    }

    function getArithmeticCascadeDeletePlan(seedLayers) {
      const seeds = (Array.isArray(seedLayers) ? seedLayers : []).filter(isCubeLikeLayer);
      const scene = seeds.length ? sceneGraphController.getSceneForLayer(seeds[0]) : null;
      if (!scene) return { scene: null, seedLayers: [], layers: [], dependents: [] };
      const seedIds = new Set(seeds.map((layer) => layer.id));
      const deleteIds = new Set(seedIds);
      let changed = true;
      while (changed) {
        changed = false;
        for (const layer of getCubeLayersInScene(scene)) {
          if (!(layer && layer.kind === SCENE_LAYER_KIND.ARITHMETIC) || deleteIds.has(layer.id)) continue;
          const inputs = Array.isArray(layer.inputs) ? layer.inputs : [];
          if (inputs.some((input) => deleteIds.has(input && input.layerId))) {
            deleteIds.add(layer.id);
            changed = true;
          }
        }
      }
      const depth = buildArithmeticDependencyDepthMap(scene);
      const layers = getCubeLayersInScene(scene)
        .filter((layer) => deleteIds.has(layer.id))
        .sort((a, b) => (Number(depth.get(b.id)) || 0) - (Number(depth.get(a.id)) || 0));
      return {
        scene,
        seedLayers: seeds,
        seedIds,
        layers,
        dependents: layers.filter((layer) => !seedIds.has(layer.id)),
      };
    }

    function getArithmeticDependentsInRecomputeOrder(scene, rootLayerId) {
      const rootId = String(rootLayerId || '');
      if (!scene || !rootId) return [];
      const arithmeticLayers = getCubeLayersInScene(scene).filter((layer) => layer && layer.kind === SCENE_LAYER_KIND.ARITHMETIC);
      const directDependents = new Map();
      for (const layer of arithmeticLayers) {
        for (const input of Array.isArray(layer.inputs) ? layer.inputs : []) {
          const inputId = String(input && input.layerId || '');
          if (!inputId) continue;
          if (!directDependents.has(inputId)) directDependents.set(inputId, []);
          directDependents.get(inputId).push(layer);
        }
      }
      const affected = new Map();
      const collect = (layerId) => {
        for (const dependent of directDependents.get(layerId) || []) {
          if (dependent.id === rootId || affected.has(dependent.id)) continue;
          affected.set(dependent.id, dependent);
          collect(dependent.id);
        }
      };
      collect(rootId);
      const remaining = new Map(affected);
      const ordered = [];
      while (remaining.size) {
        let progressed = false;
        for (const [id, layer] of Array.from(remaining.entries())) {
          const waitsForAffectedInput = (Array.isArray(layer.inputs) ? layer.inputs : [])
            .some((input) => remaining.has(String(input && input.layerId || '')));
          if (waitsForAffectedInput) continue;
          ordered.push(layer);
          remaining.delete(id);
          progressed = true;
        }
        if (!progressed) {
          ordered.push(...remaining.values());
          break;
        }
      }
      return ordered;
    }

    return Object.freeze({ compute, stageUpdate, arithmeticLayerDependsOn, getCircularOperandIdsForEdit,
      getArithmeticCascadeDeletePlan, getArithmeticDependentsInRecomputeOrder });
  }

  global.VibeMolArithmeticLayers = Object.freeze({ createArithmeticLayers });
})(typeof window !== 'undefined' ? window : globalThis);
