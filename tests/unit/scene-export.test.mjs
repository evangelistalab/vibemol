import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';
function setup() {
  const ctx = loadGlobalModules(['assets/app/js/scene-graph.js', 'assets/app/js/scene-export.js']);
  const graph = ctx.VibeMolSceneGraph.createSceneGraphController();
  const one = graph.createScene({ name: 'one' }), two = graph.createScene({ name: 'two' });
  graph.addMoleculeLayer(one); graph.addMoleculeLayer(two);
  const a = graph.addCubeLayer(one, { name: 'a' }), b = graph.addCubeLayer(one, { name: 'b' });
  graph.addScene(one); graph.addScene(two);
  graph.setActiveLayer(b.id); graph.setSelection([a.id, b.id]);
  two.visible = false; a.visible = true; b.visible = false;
  return { graph, exporter: ctx.VibeMolSceneExport, a, b, one, two };
}

test('batch targets enumerate each live cube and molecule-only scene once', async () => {
  const { graph, exporter, a, b, two } = setup();
  const targets = exporter.listTargets(graph);
  assert.deepEqual(Array.from(targets, target => target.name), ['a', 'b', 'two']);
  const saved = exporter.captureGraphState(graph);
  const captured = [];
  await exporter.exportTargets(targets, {
    captureState: () => exporter.captureGraphState(graph),
    activate: target => exporter.activateTarget(graph, target), render: () => {},
    capture: target => {
      assert.equal(graph.getFocusedScene(), target.scene);
      assert.equal(graph.getActiveLayer(), target.layer);
      assert.equal(graph.getScenes().filter(scene => scene.visible).length, 1);
      captured.push(target.layer.id);
    },
    restore: state => exporter.restoreGraphState(graph, state),
  });
  assert.deepEqual(captured.slice(0, 2), [a.id, b.id]);
  assert.equal(two.visible, false);
  assert.deepEqual(exporter.captureGraphState(graph), saved);
});

test('capture failure restores scene focus, selection, and visibility', async () => {
  const { graph, exporter } = setup();
  const saved = exporter.captureGraphState(graph);
  await assert.rejects(exporter.exportTargets(exporter.listTargets(graph), {
    captureState: () => exporter.captureGraphState(graph),
    activate: target => exporter.activateTarget(graph, target), render: () => {},
    capture: () => { throw new Error('Download failed'); },
    restore: state => exporter.restoreGraphState(graph, state),
  }), /Download failed/);
  assert.deepEqual(exporter.captureGraphState(graph), saved);
});
