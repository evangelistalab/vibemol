import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';
function setup() {
  const ctx = loadGlobalModules(['assets/app/js/scene-graph.js', 'assets/app/js/arithmetic-grid.js', 'assets/app/js/arithmetic-runner.js', 'assets/app/js/arithmetic-layers.js']);
  const graph = ctx.VibeMolSceneGraph.createSceneGraphController();
  const scene = graph.createScene(); graph.addScene(scene);
  const grid = n => ({ nxyz: [1, 1, 1], origin: [0, 0, 0], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], idx: () => 0, data: new Float32Array([n]) });
  const a = graph.addCubeLayer(scene, { cubeData: grid(2) });
  const b = graph.addArithmeticLayer(scene, { cubeData: grid(2), operation: 'abs', inputs: [{ layerId: a.id, coefficient: 1 }] });
  const c = graph.addArithmeticLayer(scene, { cubeData: grid(4), operation: 'product', inputs: [{ layerId: b.id }, { layerId: a.id }] });
  const runner = ctx.VibeMolArithmeticRunner.createArithmeticRunner({ createWorker: () => null });
  const layers = ctx.VibeMolArithmeticLayers.createArithmeticLayers({ graph, runner, getGrid: layer => layer.cubeData,
    cloneGrid: (vol, data) => ({ ...vol, data }) });
  return { graph, scene, layers, a, b, c };
}

test('dependent arithmetic results are staged and committed together', async () => {
  const { layers, a, b, c } = setup();
  const staged = await layers.stageUpdate(b, 'linear_combination', [{ layerId: a.id, coefficient: 3 }], 'triple');
  assert.equal(staged.ok, true);
  assert.equal(b.cubeData.data[0], 2);
  assert.equal(c.cubeData.data[0], 4);
  assert.equal(staged.commit(), true);
  assert.equal(b.cubeData.data[0], 6);
  assert.equal(c.cubeData.data[0], 12);
});

test('cycles, missing operands, and stale edits cannot commit partial output', async () => {
  const { layers, graph, a, b, c } = setup();
  assert.equal((await layers.stageUpdate(b, 'abs', [{ layerId: c.id }], 'cycle')).ok, false);
  assert.equal((await layers.compute('abs', [{ layerId: 'missing' }], 'missing')).ok, false);
  const staged = await layers.stageUpdate(b, 'abs', [{ layerId: a.id }], 'abs');
  graph.removeLayer(c.id);
  assert.equal(staged.commit(), false);
  assert.equal(b.name, 'L1');
});

test('cascade deletion includes every transitive dependent', () => {
  const { layers, a, b, c } = setup();
  const plan = layers.getArithmeticCascadeDeletePlan([a]);
  assert.deepEqual(Array.from(plan.layers, layer => layer.id), [c.id, b.id, a.id]);
});
