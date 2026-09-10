import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';

function loadApi() {
  const context = loadGlobalModule('assets/app/js/scene-graph.js');
  return context.window.VibeMolSceneGraph;
}

test('scene graph creates scene layers and activates first cube', () => {
  const api = loadApi();
  const graph = api.createSceneGraphController();
  const scene = graph.createScene({ name: 'sample.cube', sourceFile: { name: 'sample.cube', kind: 'cube' } });
  graph.addMoleculeLayer(scene, { atomCount: 3 });
  const cube = graph.addCubeLayer(scene, { name: 'sample.cube', cubeData: { data: [1] } }, { iso: 0.04, opacity: 0.7 });
  graph.addScene(scene);

  assert.equal(graph.getActiveScene(), scene);
  assert.equal(graph.getActiveLayer(), cube);
  assert.equal(cube.labelId, 'L0');
  assert.equal(cube.iso, 0.04);
  assert.equal(cube.opacity, 0.7);
  assert.equal(scene.moleculeLayerId.startsWith('molecule-'), true);
  assert.equal(scene.orbitalsGroupId.startsWith('orbitals-'), true);
  assert.equal(graph.getSelection().map((layer) => layer.id).join('|'), cube.id);
});

test('cube label ids are scene-scoped', () => {
  const api = loadApi();
  const graph = api.createSceneGraphController();
  const a = graph.createScene({ name: 'a.cube' });
  const b = graph.createScene({ name: 'b.cube' });
  const a0 = graph.addCubeLayer(a, { name: 'a0' });
  const a1 = graph.addCubeLayer(a, { name: 'a1' });
  const b0 = graph.addCubeLayer(b, { name: 'b0' });

  assert.equal(a0.labelId, 'L0');
  assert.equal(a1.labelId, 'L1');
  assert.equal(b0.labelId, 'L0');
});

test('cube layers share one orbitals group before scene is registered', () => {
  const api = loadApi();
  const graph = api.createSceneGraphController();
  const scene = graph.createScene({ name: 'methane' });

  for (let i = 0; i < 8; i += 1) {
    graph.addCubeLayer(scene, { name: `canonical_${i + 1}.cube` });
  }
  graph.addScene(scene);

  const groups = graph.listLayers(scene).filter((layer) => layer.kind === api.LAYER_KIND.ORBITALS_GROUP);
  const cubes = graph.listLayers(scene).filter((layer) => layer.kind === api.LAYER_KIND.CUBE);
  assert.equal(groups.length, 1);
  assert.equal(cubes.length, 8);
  assert.equal(scene.orbitalsGroupId, groups[0].id);
  for (const cube of cubes) assert.equal(cube.parentId, groups[0].id);
  assert.deepEqual(Array.from(cubes, (cube) => cube.labelId), ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']);
});

test('arithmetic layers share cube labels and behave as selectable renderable layers', () => {
  const api = loadApi();
  const graph = api.createSceneGraphController();
  const scene = graph.createScene({ name: 'combo' });
  const l0 = graph.addCubeLayer(scene, { name: 'a.cube' });
  const l1 = graph.addCubeLayer(scene, { name: 'b.cube' });
  const combo = graph.addArithmeticLayer(scene, {
    name: 'L0 - L1',
    operation: 'linear_combination',
    inputs: [
      { layerId: l0.id, coefficient: 1 },
      { layerId: l1.id, coefficient: -1 },
    ],
    cubeData: { data: [0], nxyz: [1, 1, 1], idx: () => 0 },
  });
  graph.addScene(scene);

  assert.equal(combo.kind, api.LAYER_KIND.ARITHMETIC);
  assert.equal(combo.labelId, 'L2');
  assert.equal(combo.parentId, scene.orbitalsGroupId);
  assert.equal(combo.nameUserEdited, false);
  assert.equal(api.isCubeLikeLayer(combo), true);
  graph.setActiveLayer(combo.id);
  graph.setSelection([combo.id]);
  assert.equal(graph.getSelection().map((layer) => layer.id).join('|'), combo.id);
  assert.equal(graph.listRenderableLayers(scene).some((layer) => layer.id === combo.id), true);
});

test('arithmetic layer name override flag is explicit and preserved', () => {
  const api = loadApi();
  const graph = api.createSceneGraphController();
  const scene = graph.createScene({ name: 'combo' });
  const l0 = graph.addCubeLayer(scene, { name: 'a.cube' });
  const custom = graph.addArithmeticLayer(scene, {
    name: 'MyDifference',
    nameUserEdited: true,
    operation: 'abs',
    inputs: [{ layerId: l0.id, coefficient: 1 }],
  });

  assert.equal(custom.nameUserEdited, true);
  assert.equal(custom.labelId, 'L1');
});

test('cube appearance owns Phase 2a per-layer surface and cloud properties', () => {
  const api = loadApi();
  const appearance = api.createCubeAppearance({
    autoIso: true,
    renderMode: 'cloud',
    cloudType: 'points',
    cloudStride: 4,
    cloudAlpha: 0.35,
    signFlip: true,
  });

  assert.equal(appearance.autoIso, true);
  assert.equal(appearance.autoIsoEnabled, true);
  assert.equal(appearance.renderMode, 'cloud');
  assert.equal(appearance.cloudType, 'points');
  assert.equal(appearance.cloudStride, 4);
  assert.equal(appearance.cloudAlpha, 0.35);
  assert.equal(appearance.signFlip, true);
});

test('active layer changes active scene globally', () => {
  const api = loadApi();
  const graph = api.createSceneGraphController();
  const a = graph.createScene({ name: 'a.cube' });
  const b = graph.createScene({ name: 'b.cube' });
  graph.addMoleculeLayer(a);
  const bMol = graph.addMoleculeLayer(b);
  graph.addScene(a);
  graph.addScene(b);

  graph.setActiveLayer(bMol.id);
  assert.equal(graph.getActiveScene(), b);
  assert.equal(graph.getFocusedScene(), b);
  assert.equal(graph.getActiveLayer(), bMol);
  assert.equal(b.activeLayerId, bMol.id);
});

test('focused scene preserves its own active layer', () => {
  const api = loadApi();
  const graph = api.createSceneGraphController();
  const a = graph.createScene({ name: 'a.cube' });
  const b = graph.createScene({ name: 'b.cube' });
  const a0 = graph.addCubeLayer(a, { name: 'a0' });
  const b0 = graph.addCubeLayer(b, { name: 'b0' });
  graph.addScene(a);
  graph.addScene(b);

  graph.setActiveLayer(a0.id);
  assert.equal(graph.getFocusedScene(), a);
  assert.equal(graph.getActiveLayer(), a0);
  graph.setActiveLayer(b0.id);
  assert.equal(graph.getFocusedScene(), b);
  assert.equal(graph.getActiveLayer(), b0);
  graph.setFocusedScene(a.id);
  assert.equal(graph.getFocusedScene(), a);
  assert.equal(graph.getActiveLayer(), a0);
});

test('visibility cascade preserves child visibility state', () => {
  const api = loadApi();
  const graph = api.createSceneGraphController();
  const scene = graph.createScene({ name: 'sample.cube' });
  const molecule = graph.addMoleculeLayer(scene);
  const cube = graph.addCubeLayer(scene, { name: 'sample.cube' });
  graph.addScene(scene);

  assert.equal(graph.isLayerEffectivelyVisible(molecule), true);
  assert.equal(graph.isLayerEffectivelyVisible(cube), true);
  graph.toggleVisibility(scene.id);
  assert.equal(scene.visible, false);
  assert.equal(cube.visible, true);
  assert.equal(graph.isLayerEffectivelyVisible(cube), false);
  graph.toggleVisibility(scene.id);
  assert.equal(graph.isLayerEffectivelyVisible(cube), true);
  graph.toggleVisibility(cube.id);
  assert.equal(cube.visible, false);
  assert.equal(graph.isLayerEffectivelyVisible(cube), false);
});

test('clearScenes disposes each layer exactly once', () => {
  const api = loadApi();
  const disposed = [];
  const graph = api.createSceneGraphController({
    disposeLayer: (layer) => disposed.push(layer.id),
  });
  const scene = graph.createScene({ name: 'sample.cube' });
  const molecule = graph.addMoleculeLayer(scene);
  const cube = graph.addCubeLayer(scene, { name: 'sample.cube' });
  graph.addScene(scene);
  graph.clearScenes();

  assert.deepEqual(disposed, [molecule.id, scene.orbitalsGroupId, cube.id]);
  assert.equal(graph.getScenes().length, 0);
  assert.equal(graph.getActiveScene(), null);
  assert.equal(graph.getActiveLayer(), null);
});

test('removeLayer disposes one cube and preserves stable labels on siblings', () => {
  const api = loadApi();
  const disposed = [];
  const graph = api.createSceneGraphController({
    disposeLayer: (layer) => disposed.push(layer.id),
  });
  const scene = graph.createScene({ name: 'sample.cube' });
  const a = graph.addCubeLayer(scene, { name: 'a' });
  const b = graph.addCubeLayer(scene, { name: 'b' });
  const c = graph.addCubeLayer(scene, { name: 'c' });
  graph.addScene(scene);

  graph.removeLayer(b.id);
  const cubes = graph.listLayers(scene).filter((layer) => layer.kind === api.LAYER_KIND.CUBE);
  assert.equal(cubes.map((cube) => cube.labelId).join('|'), 'L0|L2');
  assert.equal(disposed.join('|'), b.id);
  assert.equal(graph.getLayerById(b.id), null);
  assert.equal(graph.getActiveLayer(), a);
});

test('cube selection is scoped to the focused scene and keeps active included', () => {
  const api = loadApi();
  const graph = api.createSceneGraphController();
  const a = graph.createScene({ name: 'a.cube' });
  const a0 = graph.addCubeLayer(a, { name: 'a0' });
  const a1 = graph.addCubeLayer(a, { name: 'a1' });
  const b = graph.createScene({ name: 'b.cube' });
  const b0 = graph.addCubeLayer(b, { name: 'b0' });
  graph.addScene(a);
  graph.addScene(b);

  graph.setActiveLayer(a0.id);
  graph.setSelection([a1.id, b0.id]);
  assert.equal(graph.getSelection().map((layer) => layer.id).join('|'), `${a1.id}|${a0.id}`);

  graph.setActiveLayer(b0.id);
  assert.equal(graph.getSelection().map((layer) => layer.id).join('|'), b0.id);

  graph.setActiveLayer(graph.ensureOrbitalsGroup(b).id);
  assert.equal(graph.getSelection().length, 0);
});

test('selection toggle and range helpers follow orbitals-group order', () => {
  const api = loadApi();
  const graph = api.createSceneGraphController();
  const scene = graph.createScene({ name: 'methane' });
  const l0 = graph.addCubeLayer(scene, { name: 'L0' });
  const l1 = graph.addCubeLayer(scene, { name: 'L1' });
  const l2 = graph.addCubeLayer(scene, { name: 'L2' });
  const l3 = graph.addCubeLayer(scene, { name: 'L3' });
  graph.addScene(scene);

  graph.setActiveLayer(l0.id);
  graph.extendSelection(l2.id);
  assert.equal(graph.getSelection().map((layer) => layer.id).join('|'), `${l0.id}|${l2.id}`);

  graph.extendSelection(l0.id);
  assert.equal(graph.getActiveLayer(), l2);
  assert.equal(graph.getSelection().map((layer) => layer.id).join('|'), l2.id);

  graph.extendSelectionRange(l2.id, l0.id);
  assert.equal(graph.getActiveLayer(), l0);
  assert.equal(graph.getSelection().map((layer) => layer.id).join('|'), `${l2.id}|${l0.id}|${l1.id}`);

  graph.clearSelection();
  assert.equal(graph.getSelection().map((layer) => layer.id).join('|'), l0.id);
  graph.extendSelectionRange(l0.id, l3.id);
  assert.equal(graph.getSelection().map((layer) => layer.id).join('|'), `${l0.id}|${l1.id}|${l2.id}|${l3.id}`);
});

test('legacy cube appearance values normalize to solid-only schema', () => {
  const api = loadApi();
  const appearance = api.createCubeAppearance({
    surfaceStyle: 'legacy-reflective',
    reflectivePreset: 'pearl',
    blendAmount: 0.25,
    iso: -1,
    opacity: 2,
  });
  assert.equal(appearance.surfaceStyle, 'solid');
  assert.equal(Object.hasOwn(appearance, 'reflectivePreset'), false);
  assert.equal(Object.hasOwn(appearance, 'blendAmount'), false);
  assert.equal(appearance.iso, 0);
  assert.equal(appearance.opacity, 1);
});

test('trajectory scenes carry trajectory state and graph has a resettable sync master', () => {
  const api = loadApi();
  const graph = api.createSceneGraphController();
  const trajectory = {
    frames: [new Float32Array([0, 0, 0]), new Float32Array([1, 0, 0])],
    currentFrame: 1,
    playing: true,
    fps: 24,
    loop: false,
    syncEnabled: true,
  };
  const scene = graph.createScene({ name: 'movie.xyz', kind: 'trajectory', trajectory });
  graph.addMoleculeLayer(scene, { atomCount: 1 });
  graph.addScene(scene);

  assert.equal(scene.kind, 'trajectory');
  assert.equal(scene.trajectory, trajectory);
  assert.equal(graph.getState().syncMaster.playing, false);
  assert.equal(graph.getState().syncMaster.frame, 0);
  assert.equal(graph.getState().syncMaster.fps, 12);
  assert.equal(graph.getState().syncMaster.lastStepMs, 0);

  graph.getState().syncMaster.playing = true;
  graph.getState().syncMaster.frame = 42;
  graph.getState().syncMaster.fps = 30;
  graph.clearScenes();

  assert.equal(graph.getState().syncMaster.playing, false);
  assert.equal(graph.getState().syncMaster.frame, 0);
  assert.equal(graph.getState().syncMaster.fps, 12);
  assert.equal(graph.getState().syncMaster.lastStepMs, 0);
});
