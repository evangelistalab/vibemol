import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules, evaluateInContext } from './load-global-module.mjs';

function setup() {
  const ctx = loadGlobalModules(['assets/app/js/scene-graph.js', 'assets/app/js/scene-sources.js',
    'assets/app/js/session-format.js', 'assets/app/js/session.js'], { globals: { btoa, atob } });
  const fixture = evaluateInContext(ctx, `(() => {
    const graph = VibeMolSceneGraph.createSceneGraphController();
    const sources = VibeMolSceneSources.createSceneSources({ graph, hasGrid: v => !!v.data.length,
      getDefaults: () => ({}), getSceneKey: r => r._sceneGraphSceneKey,
      getSceneName: records => records[0].name, getSourceKind: r => r.vol.kind });
    const volume = (kind = 'cube') => ({ kind, title: 'Source', comment: '', units: 'angstrom', natoms: 2,
      atoms: [{id:'atom-1',Z:6,x:0,y:0,z:0},{id:'atom-2',Z:8,x:1.2,y:0,z:0}],
      bonds: [{id:'bond-1',a:'atom-1',b:'atom-2',order:2,kind:'normal',origin:'explicit',style:'covalent'}],
      annotations: {builder:{byAtomId:{'atom-1':{groupId:'group-3'}}}}, fragmentOps: [{opId:'op-1',addedAtomIds:['atom-1']}],
      nxyz:[2,1,1], origin:[0,0,0], axes:[[1,0,0],[0,1,0],[0,0,1]], data: new Float32Array([0.125,-0.25]), idx: () => 0 });
    const first = {name:'duplicate.cube',_sceneGraphSceneKey:'key-1',vol:volume()};
    const second = {name:'duplicate.cube',_sceneGraphSceneKey:'key-2',vol:volume()};
    sources.reconcile([first,second], {activeRecord:first,preferActiveRecord:true});
    const [one,two] = graph.getScenes();
    const layer = one.layers.find(graph.isCubeLikeLayer);
    layer.name = 'Edited name'; layer.iso = 0.014; layer.opacity = 0.35;
    layer.styleOverrides = { colors:false, opacity:true };
    Object.assign(two.layers.find(graph.isCubeLikeLayer), { autoIso:true, autoIsoEnabled:true, isoPending:true });
    layer.geometry = {renderer:true, circular:graph.getState()};
    const derived = graph.addArithmeticLayer(one, { name:'Difference', inputs:[{layerId:layer.id,coefficient:2}],
      cubeData:volume(), operation:'linear_combination' });
    graph.addArithmeticLayer(one, {name:'Absolute', inputs:[{layerId:derived.id,coefficient:1}],
      cubeData:volume(), operation:'abs'});
    const view = {projection:'orthographic',position:[1,2,3],up:[0,0,1],quaternion:[0,0,0,1],target:[0,0,0],
      contentPosition:[1,0,0],zoom:2,fov:45};
    return { graph, sources, records:[first,second], activeRecord:first, appVersion:'test', view,
      preset:{kind:'vibemol.preset',presetVersion:1,settings:{'molecule.style':'kit'}} };
  })()`);
  const capture = () => ctx.VibeMolSessionModule.capture(fixture);
  const format = ctx.VibeMolSessionFormat;
  return { ctx, fixture, capture, format };
}

test('session round-trip preserves source identity, topology, graph recipes, appearance, and binary values', async () => {
  const {ctx, fixture, capture, format} = setup();
  const snapshot = capture();
  const text = await format.encode(snapshot);
  assert.equal(text.includes('renderer'), false);
  const decoded = await format.decode(text);
  assert.equal(decoded.sources.length, 2);
  assert.equal(decoded.sources[0].name, decoded.sources[1].name);
  assert.notEqual(decoded.sources[0].id, decoded.sources[1].id);
  assert.deepEqual(Array.from(decoded.sources[0].volume.data), [0.125,-0.25]);
  assert.equal(decoded.sources[0].volume.bonds[0].order, 2);
  assert.equal(decoded.sources[0].volume.annotations.builder.byAtomId['atom-1'].groupId, 'group-3');
  const restored = ctx.VibeMolSessionModule.hydrate(decoded);
  fixture.graph.restoreState(restored.graph);
  fixture.sources.restore(restored.sources);
  fixture.sources.reconcile(restored.records);
  const cubes = fixture.graph.getScenes()[0].layers.filter(fixture.graph.isCubeLikeLayer);
  assert.equal(cubes[0].name, 'Edited name');
  assert.equal(cubes[0].iso, 0.014);
  assert.equal(cubes[0].opacity, 0.35);
  assert.deepEqual(JSON.parse(JSON.stringify(cubes[0].styleOverrides)), { colors:false, opacity:true });
  assert.equal(cubes[0].isoPending, false);
  assert.equal(fixture.graph.getScenes()[1].layers.find(fixture.graph.isCubeLikeLayer).isoPending, true);
  assert.equal(cubes[2].inputs[0].layerId, cubes[1].id);
  assert.equal(cubes[0].record, restored.records[0]);
  assert.equal(cubes[0].cubeData, restored.records[0].vol);
  assert.equal(restored.records[0].vol.idx(1,0,0), 1);
  const ids = new Set(fixture.graph.getScenes().flatMap(scene => [scene.id,...scene.layers.map(layer => layer.id)]));
  const next = fixture.graph.addCubeLayer(fixture.graph.getScenes()[0], {cubeData:restored.records[0].vol});
  assert.equal(ids.has(next.id), false);

  // Older sessions have assigned values but no pending-state metadata.
  for (const scene of decoded.graph.scenes) for (const layer of scene.layers) delete layer.isoPending;
  const legacy = ctx.VibeMolSessionModule.hydrate(decoded);
  const legacyCube = legacy.graph.scenes[1].layers.find(fixture.graph.isCubeLikeLayer);
  assert.equal(!!legacyCube.isoPending, false);
  assert.equal(legacyCube.iso, decoded.graph.scenes[1].layers.find(fixture.graph.isCubeLikeLayer).iso);
});

test('capture retains moved sources after original scene removal and never recreates deleted layers', async () => {
  const {ctx, fixture, capture, format} = setup();
  const [one,two] = fixture.graph.getScenes();
  const moved = one.layers.find(fixture.graph.isCubeLikeLayer);
  fixture.graph.moveCubeLayers([moved], two, 0);
  fixture.sources.reconcile([fixture.records[1]]);
  fixture.records = [fixture.records[1]];
  const deleted = two.layers.find(layer => layer.kind === 'cube' && layer.id !== moved.id);
  fixture.graph.removeLayer(deleted.id);
  const restored = ctx.VibeMolSessionModule.hydrate(await format.decode(await format.encode(capture())));
  assert.equal(restored.sources.length, 2);
  fixture.graph.restoreState(restored.graph);
  fixture.sources.restore(restored.sources);
  fixture.sources.reconcile(restored.records);
  assert.equal(fixture.graph.getScenes().length, 1);
  assert.equal(fixture.graph.getLayerById(moved.id).record.name, 'duplicate.cube');
  assert.equal(fixture.graph.getLayerById(deleted.id), null);
});

test('buffers are deduplicated and copied before asynchronous encoding yields', async () => {
  const {fixture, capture, format} = setup();
  const vol = fixture.records[0].vol;
  vol.isTwoComponent = true;
  vol.alphaRe = vol.data;
  vol.alphaIm = new Float32Array([0,1]); vol.betaRe = vol.alphaIm; vol.betaIm = vol.alphaIm;
  const writing = format.encode(capture());
  vol.data[0] = 9;
  const text = await writing;
  const restored = await format.decode(text);
  const saved = restored.sources[0].volume;
  assert.equal(saved.data[0], 0.125);
  assert.equal(saved.data, saved.alphaRe);
  assert.equal(saved.alphaIm, saved.betaRe);
});

test('session import rejects damaged buffers and bad graph references before applying anything', async () => {
  const {ctx, fixture, capture, format} = setup();
  const text = await format.encode(capture());
  let applications = 0;
  const api = ctx.VibeMolSessionModule.createSessionController({getState:()=>fixture,applyState:()=>{applications++;}});
  for (const damage of [
    doc => { doc.sessionVersion = 999; },
    doc => { doc.buffers[0].checksum = 'bad'; },
    doc => { doc.buffers.pop(); },
    doc => { doc.sources[1].id = doc.sources[0].id; },
    doc => { doc.graph.scenes[0].layers.find(x=>x.kind==='cube').sourceId = 'missing'; },
    doc => { doc.graph.scenes[0].layers.find(x=>x.kind==='cube').isoPending = 'pending'; },
    doc => { doc.graph.scenes[0].layers.find(x=>x.kind==='cube').styleOverrides = {colors:'yes',opacity:false}; },
    doc => { const l = doc.graph.scenes[0].layers.find(x=>x.kind==='arithmetic'); l.inputs[0].layerId = l.id; },
    doc => { doc.sources[0].volume.nxyz = [999,1,1]; },
    doc => { doc.sources[0].volume.bonds[0].a = 'missing-atom'; },
  ]) {
    const bad = JSON.parse(text); damage(bad);
    await assert.rejects(api.importText(JSON.stringify(bad)), /session/i);
  }
  assert.equal(applications, 0);
  assert.equal(api.isOpening(), false);
  await assert.rejects(format.encode(capture(), {maxBytes:1}), /exceeds/);
  await assert.rejects(format.decode(text, {maxBytes:1}), /exceeds/);
});

test('Molden sessions omit cached grids and preserve deleted orbital entries through restoration', async () => {
  const {ctx, fixture, capture, format} = setup();
  const record = fixture.records[0];
  record.vol.kind = 'molden';
  record.vol.molden = {basis:{atomBlocks:[],aoCount:2},basisCount:2,moCount:2,
    mos:[{coefficients:new Float32Array([1,0])},{coefficients:new Float32Array([0,1])}]};
  record.moldenMoIndex = 1;
  fixture.graph.clearScenes(); fixture.sources.reset(); fixture.sources.reconcile(fixture.records);
  const scene = fixture.graph.getScenes()[0];
  const cubes = scene.layers.filter(fixture.graph.isCubeLikeLayer);
  fixture.graph.removeLayer(cubes[0].id);
  const saved = capture();
  assert.equal(saved.sources[0].volume.data.length, 0);
  const restored = ctx.VibeMolSessionModule.hydrate(await format.decode(await format.encode(saved)));
  fixture.graph.restoreState(restored.graph); fixture.sources.restore(restored.sources);
  fixture.sources.reconcile(restored.records);
  assert.equal(fixture.graph.getScenes()[0].layers.filter(fixture.graph.isCubeLikeLayer).length, 1);
  assert.equal(restored.records[0].vol.molden.mos[1].coefficients[1], 1);
  assert.equal(restored.records[0].vol.data.length, 0);
});

test('rehydrating an already typed structure retains MO coefficients and vibrational displacements', () => {
  const ctx = loadGlobalModules(['assets/app/js/structure.js']);
  const result = evaluateInContext(ctx, `(() => {
    const original = { nxyz:[0,0,0], data:new Float32Array(0),
      vibration:{modes:[{displacements:new Float32Array([0.1,0.2,0.3])}]},
      molden:{mos:[{coefficients:new Float32Array([1,-1])}]} };
    const first = VibeMolStructureCore.rehydrateClonedVolume(original);
    const second = VibeMolStructureCore.rehydrateClonedVolume(VibeMolStructureCore.cloneStructuredData(first));
    return {modes: second.vibration.modes[0].displacements, coefficients:second.molden.mos[0].coefficients};
  })()`);
  assert.equal(result.modes.constructor.name, 'Float32Array');
  assert.equal(result.modes.length, 3);
  assert.deepEqual(Array.from(result.coefficients), [1,-1]);
});
