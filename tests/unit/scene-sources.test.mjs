import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';
function setup() {
  const ctx = loadGlobalModules(['assets/app/js/scene-graph.js', 'assets/app/js/scene-sources.js']);
  const graph = ctx.VibeMolSceneGraph.createSceneGraphController();
  const sources = ctx.VibeMolSceneSources.createSceneSources({ graph,
    hasGrid: vol => !!vol.data, getDefaults: () => ({ iso: 0.02 }),
    getSceneKey: record => record.key, getSceneName: records => records[0].name,
    getSourceKind: record => record.vol.kind,
  });
  return { graph, sources };
}
const record = (name, key = 'one') => ({ name, key, vol: { kind: 'cube', atoms: [], data: new Float32Array([1]) } });

test('reconciliation preserves layer identity, names, visibility, and deletion', () => {
  const { graph, sources } = setup();
  const a = record('a'), b = record('b');
  sources.reconcile([a, b], { activeRecord: a, preferActiveRecord: true });
  const [first, second] = graph.getScenes()[0].layers.filter(graph.isCubeLikeLayer);
  graph.rename(first.id, 'My orbital');
  first.visible = false;
  graph.removeLayer(second.id);
  sources.reconcile([a, b, record('c')]);
  assert.equal(graph.getLayerById(first.id), first);
  assert.equal(first.name, 'My orbital');
  assert.equal(first.visible, false);
  assert.equal(graph.getLayerById(second.id), null);
  assert.equal(graph.getScenes()[0].layers.filter(graph.isCubeLikeLayer).length, 2);
});

test('Molden sources materialize only requested orbitals without a generic cube', () => {
  const { graph, sources } = setup();
  const source = record('molden');
  source.vol.kind = 'molden';
  source.moldenMaterializedOrbitalIndices = [1, 2];
  source.moldenMoIndex = 2;
  sources.reconcile([source], { activeRecord: source, preferActiveRecord: true });
  const cubes = graph.getScenes()[0].layers.filter(graph.isCubeLikeLayer);
  assert.deepEqual(Array.from(cubes, cube => cube.moldenMoIndex), [1, 2]);
  assert.equal(graph.getActiveLayer().moldenMoIndex, 2);
  graph.removeLayer(cubes[0].id);
  sources.reconcile([source]);
  assert.equal(graph.getLayerById(cubes[0].id), null);
});

test('moving a source layer survives reconciliation and original-scene removal', () => {
  const { graph, sources } = setup();
  const a = record('a', 'one'), b = record('b', 'two');
  sources.reconcile([a, b]);
  const [first, second] = graph.getScenes();
  const cube = first.layers.find(graph.isCubeLikeLayer);
  graph.moveCubeLayers([cube], second, 0);
  sources.reconcile([a, b]);
  assert.equal(graph.getSceneForLayer(cube), second);
  sources.reconcile([b]);
  assert.equal(graph.getSceneForLayer(cube), second);
  assert.equal(cube.record, a);
  assert.equal(sources.getSources().length, 2);
  sources.reconcile([]);
  assert.equal(sources.getSources().length, 0);
  assert.equal(graph.getScenes().length, 0);
});

test('a deleted orbital is recreated only by an explicit materialization request', () => {
  const { graph, sources } = setup();
  const source = record('molden'); source.vol.kind = 'molden';
  source.moldenMaterializedOrbitalIndices = [1]; source.moldenMoIndex = 1;
  sources.reconcile([source]);
  const first = graph.getScenes()[0].layers.find(graph.isCubeLikeLayer);
  graph.removeLayer(first.id);
  sources.reconcile([source]);
  assert.equal(graph.getScenes()[0].layers.filter(graph.isCubeLikeLayer).length, 0);
  const second = sources.addOrbital(source, 1);
  assert.notEqual(second.id, first.id);
  assert.equal(second.moldenMoIndex, 1);
});
