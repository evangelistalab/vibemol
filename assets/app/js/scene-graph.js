(function (global) {
  'use strict';

  const LAYER_KIND = Object.freeze({
    MOLECULE: 'molecule',
    ORBITALS_GROUP: 'orbitals_group',
    CUBE: 'cube',
    ARITHMETIC: 'arithmetic',
    MEASUREMENTS_GROUP: 'measurements_group',
    MEASUREMENT: 'measurement',
  });

  const DEFAULT_CUBE_APPEARANCE = Object.freeze({
    iso: 0.02,
    autoIso: false,
    autoIsoEnabled: false,
    opacity: 1.0,
    surfaceStyle: 'solid',
    solidPreset: 'emissive',
    colorScheme: 'emory',
    posColor: null,
    negColor: null,
    renderMode: 'surfaces',
    cloudType: 'volumetric',
    cloudStride: 2,
    cloudAlpha: 0.6,
    signFlip: false,
  });

  const SURFACE_STYLE = Object.freeze({
    SOLID: 'solid',
  });

  function isPlainObject(value) {
    if (!value || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function cloneShallowObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? Object.assign({}, value) : {};
  }

  function normalizeId(raw) {
    return String(raw || '').trim();
  }

  function normalizeBool(value, fallback = true) {
    return value == null ? !!fallback : !!value;
  }

  function normalizeNumber(value, fallback, min = -Infinity, max = Infinity) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function normalizeSurfaceStyle(value) {
    const key = String(value || '').trim().toLowerCase();
    return key === SURFACE_STYLE.SOLID ? SURFACE_STYLE.SOLID : SURFACE_STYLE.SOLID;
  }

  function normalizeRenderMode(value) {
    const key = String(value || '').trim().toLowerCase();
    if (key === 'cloud') return 'cloud';
    return 'surfaces';
  }

  function normalizeCloudType(value) {
    const key = String(value || '').trim().toLowerCase();
    if (key === 'points') return 'points';
    return 'volumetric';
  }

  function createCubeAppearance(defaults = {}) {
    const source = Object.assign({}, DEFAULT_CUBE_APPEARANCE, cloneShallowObject(defaults));
    const autoIso = source.autoIso == null ? !!source.autoIsoEnabled : !!source.autoIso;
    return {
      iso: normalizeNumber(source.iso, DEFAULT_CUBE_APPEARANCE.iso, 0),
      autoIso,
      autoIsoEnabled: autoIso,
      opacity: normalizeNumber(source.opacity, DEFAULT_CUBE_APPEARANCE.opacity, 0.05, 1),
      surfaceStyle: normalizeSurfaceStyle(source.surfaceStyle),
      solidPreset: String(source.solidPreset || DEFAULT_CUBE_APPEARANCE.solidPreset),
      colorScheme: String(source.colorScheme || DEFAULT_CUBE_APPEARANCE.colorScheme),
      posColor: source.posColor == null ? null : String(source.posColor),
      negColor: source.negColor == null ? null : String(source.negColor),
      renderMode: normalizeRenderMode(source.renderMode),
      cloudType: normalizeCloudType(source.cloudType),
      cloudStride: normalizeNumber(source.cloudStride, DEFAULT_CUBE_APPEARANCE.cloudStride, 1),
      cloudAlpha: normalizeNumber(source.cloudAlpha, DEFAULT_CUBE_APPEARANCE.cloudAlpha, 0.01, 1),
      signFlip: !!source.signFlip,
    };
  }

  function isCubeLikeLayer(layer) {
    return !!(layer && (layer.kind === LAYER_KIND.CUBE || layer.kind === LAYER_KIND.ARITHMETIC));
  }

  function createSceneGraphController(options = {}) {
    const disposeLayer = typeof options.disposeLayer === 'function' ? options.disposeLayer : null;
    const state = {
      scenes: [],
      activeSceneId: null,
      activeLayerId: null,
      focusedSceneId: null,
      selectedLayerIds: [],
      syncMaster: {
        playing: false,
        frame: 0,
        fps: 12,
        lastStepMs: 0,
      },
    };
    const counters = {
      scene: 1,
      molecule: 1,
      orbitals: 1,
      cube: 1,
      arith: 1,
      measurements: 1,
      measurement: 1,
    };

    function allocateId(prefix) {
      const key = String(prefix || 'layer');
      if (!Object.prototype.hasOwnProperty.call(counters, key)) counters[key] = 1;
      const id = `${key}-${counters[key]}`;
      counters[key] += 1;
      return id;
    }

    function getState() {
      return state;
    }

    function getScenes() {
      return state.scenes;
    }

    function findScene(sceneId) {
      const id = normalizeId(sceneId);
      return state.scenes.find((scene) => scene && scene.id === id) || null;
    }

    function getActiveScene() {
      return findScene(state.activeSceneId) || null;
    }

    function getFocusedScene() {
      return findScene(state.focusedSceneId) || getActiveScene();
    }

    function listLayers(sceneOrId) {
      const scene = typeof sceneOrId === 'string' ? findScene(sceneOrId) : sceneOrId;
      if (!scene || !Array.isArray(scene.layers)) return [];
      return scene.layers;
    }

    function getLayerById(layerId) {
      const id = normalizeId(layerId);
      if (!id) return null;
      for (const scene of state.scenes) {
        const layer = listLayers(scene).find((item) => item && item.id === id);
        if (layer) return layer;
      }
      return null;
    }

    function getSceneForLayer(layerOrId) {
      const layer = typeof layerOrId === 'string' ? getLayerById(layerOrId) : layerOrId;
      if (!layer) return null;
      return findScene(layer.sceneId);
    }

    function getActiveLayer() {
      const focused = getFocusedScene();
      if (focused && focused.activeLayerId) {
        const layer = getLayerById(focused.activeLayerId);
        if (layer) return layer;
      }
      return getLayerById(state.activeLayerId);
    }

    function listFocusedSceneCubeLayers() {
      const scene = getFocusedScene();
      if (!scene) return [];
      const orbitalsGroupId = scene.orbitalsGroupId || '';
      return listLayers(scene).filter((layer) => (
        layer
        && isCubeLikeLayer(layer)
        && (!orbitalsGroupId || layer.parentId === orbitalsGroupId)
      ));
    }

    function focusedCubeIdSet() {
      return new Set(listFocusedSceneCubeLayers().map((layer) => layer.id));
    }

    function getFocusedActiveCube() {
      const scene = getFocusedScene();
      if (!scene || !scene.activeLayerId) return null;
      const active = getLayerById(scene.activeLayerId);
      if (!(active && isCubeLikeLayer(active) && active.sceneId === scene.id)) return null;
      const validIds = focusedCubeIdSet();
      return validIds.has(active.id) ? active : null;
    }

    function normalizeSelectionIds(ids, options = {}) {
      const validIds = focusedCubeIdSet();
      const activeCube = getFocusedActiveCube();
      if (!activeCube) return [];
      const out = [];
      const seen = new Set();
      for (const raw of Array.isArray(ids) ? ids : []) {
        const id = normalizeId(raw);
        if (!id || seen.has(id) || !validIds.has(id)) continue;
        seen.add(id);
        out.push(id);
      }
      if (options.ensureActive !== false) {
        if (activeCube && !seen.has(activeCube.id)) out.push(activeCube.id);
      }
      return out;
    }

    function pruneSelection(options = {}) {
      state.selectedLayerIds = normalizeSelectionIds(state.selectedLayerIds, options);
      return state.selectedLayerIds.slice();
    }

    function getSelection() {
      pruneSelection();
      return state.selectedLayerIds.map((id) => getLayerById(id)).filter(Boolean);
    }

    function setSelection(ids) {
      state.selectedLayerIds = normalizeSelectionIds(ids);
      return getSelection();
    }

    function extendSelection(id) {
      const layer = getLayerById(id);
      const validIds = focusedCubeIdSet();
      if (!(layer && isCubeLikeLayer(layer) && validIds.has(layer.id))) return getSelection();
      const selected = normalizeSelectionIds(state.selectedLayerIds, { ensureActive: false });
      const index = selected.indexOf(layer.id);
      if (index >= 0) selected.splice(index, 1);
      else selected.push(layer.id);
      const activeCube = getFocusedActiveCube();
      if (activeCube && !selected.includes(activeCube.id)) {
        const nextActiveId = selected[selected.length - 1] || null;
        if (nextActiveId) {
          const scene = getFocusedScene();
          if (scene) scene.activeLayerId = nextActiveId;
          state.activeLayerId = nextActiveId;
          state.activeSceneId = layer.sceneId;
        }
      }
      state.selectedLayerIds = normalizeSelectionIds(selected);
      return getSelection();
    }

    function extendSelectionRange(fromId, toId) {
      const cubes = listFocusedSceneCubeLayers();
      const fromIndex = cubes.findIndex((layer) => layer.id === normalizeId(fromId));
      const toIndex = cubes.findIndex((layer) => layer.id === normalizeId(toId));
      if (fromIndex < 0 || toIndex < 0) return getSelection();
      const lo = Math.min(fromIndex, toIndex);
      const hi = Math.max(fromIndex, toIndex);
      const selected = normalizeSelectionIds(state.selectedLayerIds, { ensureActive: false });
      const seen = new Set(selected);
      for (let i = lo; i <= hi; i += 1) {
        if (cubes[i] && !seen.has(cubes[i].id)) {
          selected.push(cubes[i].id);
          seen.add(cubes[i].id);
        }
      }
      const target = cubes[toIndex];
      if (target) {
        const scene = getFocusedScene();
        if (scene) scene.activeLayerId = target.id;
        state.activeLayerId = target.id;
        state.activeSceneId = target.sceneId;
      }
      state.selectedLayerIds = normalizeSelectionIds(selected);
      return getSelection();
    }

    function clearSelection() {
      state.selectedLayerIds = [];
      return setSelection([]);
    }

    function setActiveLayer(layerId) {
      const layer = getLayerById(layerId);
      if (!layer) return null;
      const scene = getSceneForLayer(layer);
      if (scene) scene.activeLayerId = layer.id;
      state.activeLayerId = layer.id;
      state.activeSceneId = layer.sceneId;
      state.focusedSceneId = layer.sceneId;
      pruneSelection();
      return layer;
    }

    function setFocusedScene(sceneId) {
      const scene = findScene(sceneId);
      if (!scene) return null;
      state.activeSceneId = scene.id;
      state.focusedSceneId = scene.id;
      const current = scene.activeLayerId ? getLayerById(scene.activeLayerId) : null;
      if (!current || current.sceneId !== scene.id) {
        const firstCube = listLayers(scene).find(isCubeLikeLayer);
        scene.activeLayerId = (firstCube || listLayers(scene).find((layer) => layer.kind === LAYER_KIND.MOLECULE) || scene).id || null;
      }
      state.activeLayerId = scene.activeLayerId || null;
      pruneSelection();
      return scene;
    }

    function setActiveScene(sceneId) {
      return setFocusedScene(sceneId);
    }

    function createLayer(scene, props = {}) {
      const kind = String(props.kind || '').trim();
      const prefix = kind === LAYER_KIND.MOLECULE
        ? 'molecule'
        : kind === LAYER_KIND.ORBITALS_GROUP
          ? 'orbitals'
          : kind === LAYER_KIND.CUBE
            ? 'cube'
            : kind === LAYER_KIND.ARITHMETIC
              ? 'arith'
              : kind === LAYER_KIND.MEASUREMENTS_GROUP
                ? 'measurements'
                : kind === LAYER_KIND.MEASUREMENT
                  ? 'measurement'
                  : 'layer';
      return Object.assign({
        id: normalizeId(props.id) || allocateId(prefix),
        sceneId: scene.id,
        parentId: props.parentId == null ? null : normalizeId(props.parentId),
        kind,
        name: String(props.name || kind || 'Layer'),
        visible: normalizeBool(props.visible, true),
        expanded: normalizeBool(props.expanded, true),
      }, props);
    }

    function createScene(props = {}) {
      const scene = {
        id: normalizeId(props.id) || allocateId('scene'),
        name: String(props.name || props.filename || 'Untitled scene'),
        visible: normalizeBool(props.visible, true),
        expanded: normalizeBool(props.expanded, true),
        moleculeLayerId: props.moleculeLayerId || null,
        orbitalsGroupId: props.orbitalsGroupId || null,
        measurementsGroupId: props.measurementsGroupId || null,
        activeLayerId: props.activeLayerId || null,
        sourceFile: cloneShallowObject(props.sourceFile),
        kind: props.kind || null,
        trajectory: props.trajectory || null,
        layers: [],
        meta: cloneShallowObject(props.meta),
      };
      return scene;
    }

    function addScene(scene) {
      if (!scene || !scene.id) return null;
      if (!Array.isArray(scene.layers)) scene.layers = [];
      state.scenes.push(scene);
      state.activeSceneId = scene.id;
      state.focusedSceneId = scene.id;
      const firstCube = scene.layers.find(isCubeLikeLayer);
      const firstMolecule = scene.layers.find((layer) => layer.kind === LAYER_KIND.MOLECULE);
      if (!scene.activeLayerId) scene.activeLayerId = (firstCube || firstMolecule || null) ? (firstCube || firstMolecule).id : null;
      state.activeLayerId = scene.activeLayerId || null;
      pruneSelection();
      return scene;
    }

    function addLayer(sceneOrId, props = {}) {
      const scene = typeof sceneOrId === 'string' ? findScene(sceneOrId) : sceneOrId;
      if (!scene) return null;
      const layer = createLayer(scene, props);
      scene.layers.push(layer);
      if (layer.kind === LAYER_KIND.MOLECULE && !scene.moleculeLayerId) scene.moleculeLayerId = layer.id;
      if (layer.kind === LAYER_KIND.ORBITALS_GROUP && !scene.orbitalsGroupId) scene.orbitalsGroupId = layer.id;
      if (layer.kind === LAYER_KIND.MEASUREMENTS_GROUP && !scene.measurementsGroupId) scene.measurementsGroupId = layer.id;
      return layer;
    }

    function addMoleculeLayer(sceneOrId, props = {}) {
      return addLayer(sceneOrId, Object.assign({
        kind: LAYER_KIND.MOLECULE,
        parentId: null,
        name: 'Molecule',
      }, props));
    }

    function ensureOrbitalsGroup(sceneOrId, props = {}) {
      const scene = typeof sceneOrId === 'string' ? findScene(sceneOrId) : sceneOrId;
      if (!scene) return null;
      if (scene.orbitalsGroupId) {
        const existing = listLayers(scene).find((layer) => layer && layer.id === scene.orbitalsGroupId)
          || getLayerById(scene.orbitalsGroupId);
        if (existing) return existing;
      }
      const existingByKind = listLayers(scene).find((layer) => layer && layer.kind === LAYER_KIND.ORBITALS_GROUP);
      if (existingByKind) {
        scene.orbitalsGroupId = existingByKind.id;
        return existingByKind;
      }
      return addLayer(scene, Object.assign({
        kind: LAYER_KIND.ORBITALS_GROUP,
        parentId: null,
        name: 'Orbitals',
      }, props));
    }

    function nextCubeLabelId(scene) {
      let maxIndex = -1;
      for (const layer of listLayers(scene)) {
        if (!isCubeLikeLayer(layer)) continue;
        const match = /^L(\d+)$/i.exec(String(layer.labelId || '').trim());
        if (match) maxIndex = Math.max(maxIndex, Number(match[1]) || 0);
      }
      return `L${maxIndex + 1}`;
    }

    function addCubeLayer(sceneOrId, props = {}, defaults = {}) {
      const scene = typeof sceneOrId === 'string' ? findScene(sceneOrId) : sceneOrId;
      if (!scene) return null;
      const group = ensureOrbitalsGroup(scene);
      const labelId = String(props.labelId || nextCubeLabelId(scene));
      const appearance = createCubeAppearance(Object.assign({}, defaults, props));
      return addLayer(scene, Object.assign({
        kind: LAYER_KIND.CUBE,
        parentId: group ? group.id : null,
        name: props.name || labelId,
        labelId,
        cubeData: props.cubeData || props.vol || null,
        record: props.record || null,
        geometry: null,
        posMaterial: null,
        negMaterial: null,
        posMesh: null,
        negMesh: null,
        group: null,
        cloudGroup: null,
        surfaceMetricCache: new Map(),
      }, appearance, props));
    }

    function addArithmeticLayer(sceneOrId, props = {}, defaults = {}) {
      const scene = typeof sceneOrId === 'string' ? findScene(sceneOrId) : sceneOrId;
      if (!scene) return null;
      const group = ensureOrbitalsGroup(scene);
      const labelId = String(props.labelId || nextCubeLabelId(scene));
      const appearance = createCubeAppearance(Object.assign({}, defaults, props));
      const rawInputs = Array.isArray(props.inputs) ? props.inputs : [];
      const inputs = rawInputs.map((input) => ({
        layerId: normalizeId(input && input.layerId),
        coefficient: normalizeNumber(input && input.coefficient, 1),
      })).filter((input) => input.layerId);
      return addLayer(scene, Object.assign({
        kind: LAYER_KIND.ARITHMETIC,
        parentId: group ? group.id : null,
        name: props.name || labelId,
        labelId,
        operation: props.operation || 'linear_combination',
        inputs,
        nameUserEdited: !!props.nameUserEdited,
        cubeData: props.cubeData || null,
        cubeDataValid: props.cubeDataValid !== false,
        record: null,
        geometry: null,
        posMaterial: null,
        negMaterial: null,
        posMesh: null,
        negMesh: null,
        group: null,
        cloudGroup: null,
        surfaceMetricCache: new Map(),
      }, appearance, props, { inputs, nameUserEdited: !!props.nameUserEdited }));
    }

    function ensureMeasurementsGroup(sceneOrId, props = {}) {
      const scene = typeof sceneOrId === 'string' ? findScene(sceneOrId) : sceneOrId;
      if (!scene) return null;
      if (scene.measurementsGroupId) {
        const existing = getLayerById(scene.measurementsGroupId);
        if (existing) return existing;
      }
      return addLayer(scene, Object.assign({
        kind: LAYER_KIND.MEASUREMENTS_GROUP,
        parentId: null,
        name: 'Measurements',
      }, props));
    }

    function isLayerEffectivelyVisible(layerOrId) {
      const layer = typeof layerOrId === 'string' ? getLayerById(layerOrId) : layerOrId;
      if (!layer || !layer.visible) return false;
      const scene = getSceneForLayer(layer);
      if (!scene || !scene.visible) return false;
      let parentId = layer.parentId;
      while (parentId) {
        const parent = getLayerById(parentId);
        if (!parent) break;
        if (!parent.visible) return false;
        parentId = parent.parentId;
      }
      return true;
    }

    function listRenderableLayers(sceneOrId = null) {
      const scenes = sceneOrId ? [typeof sceneOrId === 'string' ? findScene(sceneOrId) : sceneOrId] : state.scenes;
      const out = [];
      for (const scene of scenes) {
        if (!scene || !scene.visible) continue;
        for (const layer of listLayers(scene)) {
          if (!isLayerEffectivelyVisible(layer)) continue;
          if (layer.kind === LAYER_KIND.MOLECULE || isCubeLikeLayer(layer) || layer.kind === LAYER_KIND.MEASUREMENT) out.push(layer);
        }
      }
      return out;
    }

    function toggleVisibility(id) {
      const scene = findScene(id);
      if (scene) {
        scene.visible = !scene.visible;
        return scene.visible;
      }
      const layer = getLayerById(id);
      if (!layer) return null;
      layer.visible = !layer.visible;
      return layer.visible;
    }

    function disposeOneLayer(layer) {
      if (!layer) return;
      if (disposeLayer) disposeLayer(layer);
    }

    function removeScene(sceneId) {
      const scene = findScene(sceneId);
      if (!scene) return false;
      for (const layer of listLayers(scene)) disposeOneLayer(layer);
      const idx = state.scenes.indexOf(scene);
      if (idx >= 0) state.scenes.splice(idx, 1);
      if (state.activeSceneId === scene.id) state.activeSceneId = state.scenes[0] ? state.scenes[0].id : null;
      if (state.focusedSceneId === scene.id) state.focusedSceneId = state.activeSceneId;
      if (state.activeLayerId && !getLayerById(state.activeLayerId)) {
        const active = getActiveScene();
        const firstCube = active && listLayers(active).find(isCubeLikeLayer);
        const firstMolecule = active && listLayers(active).find((layer) => layer.kind === LAYER_KIND.MOLECULE);
        if (active) active.activeLayerId = (firstCube || firstMolecule || {}).id || null;
        state.activeLayerId = active ? active.activeLayerId : null;
      }
      return true;
    }

    function removeLayer(layerOrId) {
      const layer = typeof layerOrId === 'string' ? getLayerById(layerOrId) : layerOrId;
      if (!layer) return false;
      const scene = getSceneForLayer(layer);
      if (!scene) return false;
      const removeIds = new Set();
      const collect = (target) => {
        if (!target || removeIds.has(target.id)) return;
        removeIds.add(target.id);
        for (const child of listLayers(scene)) {
          if (child && child.parentId === target.id) collect(child);
        }
      };
      collect(layer);
      for (const item of listLayers(scene)) {
        if (item && removeIds.has(item.id)) disposeOneLayer(item);
      }
      scene.layers = listLayers(scene).filter((item) => item && !removeIds.has(item.id));
      if (removeIds.has(scene.moleculeLayerId)) scene.moleculeLayerId = null;
      if (removeIds.has(scene.orbitalsGroupId)) scene.orbitalsGroupId = null;
      if (removeIds.has(scene.measurementsGroupId)) scene.measurementsGroupId = null;
      if (removeIds.has(scene.activeLayerId)) {
        const firstCube = listLayers(scene).find(isCubeLikeLayer);
        const firstMolecule = listLayers(scene).find((item) => item.kind === LAYER_KIND.MOLECULE);
        scene.activeLayerId = (firstCube || firstMolecule || {}).id || null;
      }
      if (removeIds.has(state.activeLayerId)) {
        state.activeLayerId = scene.activeLayerId || null;
      }
      pruneSelection();
      return true;
    }

    function clearScenes() {
      const ids = state.scenes.map((scene) => scene.id);
      for (const id of ids) removeScene(id);
      state.scenes = [];
      state.activeSceneId = null;
      state.activeLayerId = null;
      state.focusedSceneId = null;
      state.selectedLayerIds = [];
      state.syncMaster = {
        playing: false,
        frame: 0,
        fps: 12,
        lastStepMs: 0,
      };
    }

    function reset(nextScenes = []) {
      clearScenes();
      for (const scene of nextScenes) addScene(scene);
    }

    return Object.freeze({
      kinds: LAYER_KIND,
      surfaceStyles: SURFACE_STYLE,
      defaultCubeAppearance: DEFAULT_CUBE_APPEARANCE,
      createCubeAppearance,
      isCubeLikeLayer,
      createScene,
      addScene,
      addLayer,
      addMoleculeLayer,
      ensureOrbitalsGroup,
      addCubeLayer,
      addArithmeticLayer,
      ensureMeasurementsGroup,
      allocateId,
      getState,
      getScenes,
      findScene,
      getActiveScene,
      setActiveScene,
      getFocusedScene,
      setFocusedScene,
      listLayers,
      getLayerById,
      getSceneForLayer,
      getActiveLayer,
      setActiveLayer,
      getSelection,
      setSelection,
      extendSelection,
      extendSelectionRange,
      clearSelection,
      isLayerEffectivelyVisible,
      listRenderableLayers,
      toggleVisibility,
      removeLayer,
      removeScene,
      clearScenes,
      reset,
    });
  }

  global.VibeMolSceneGraph = Object.freeze({
    LAYER_KIND,
    SURFACE_STYLE,
    DEFAULT_CUBE_APPEARANCE,
    createCubeAppearance,
    isCubeLikeLayer,
    createSceneGraphController,
  });
})(typeof window !== 'undefined' ? window : globalThis);
