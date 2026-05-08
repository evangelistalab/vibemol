import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';

function createController(options = {}) {
  const context = loadGlobalModule('assets/app/js/file-loader.js', {
    globals: {
      atob: (value) => Buffer.from(String(value), 'base64').toString('binary'),
      File,
    },
  });
  let volumes = options.volumes || [];
  let currentIndex = options.currentIndex ?? -1;
  const events = [];
  const ensureVolumeSchemaCalls = [];
  const controller = context.VibeMolFileLoader.createFileLoader({
    detectInputFileKind: options.detectInputFileKind || ((name) => name.endsWith('.xyz') ? 'xyz' : 'cube'),
    detectAndNormalizeXyzText: options.detectAndNormalizeXyzText || (() => null),
    parseXYZ: (text) => ({ kind: 'xyz', text }),
    parseMolden: (text) => ({ kind: 'molden', text }),
    parseTwoComponentCube: (text) => ({ kind: 'two_component_cube', text }),
    parseCube: (text) => ({ kind: 'cube', text }),
    ensureVolumeSchema: (vol, schemaOptions = {}) => {
      ensureVolumeSchemaCalls.push(JSON.parse(JSON.stringify(schemaOptions || {})));
      return vol;
    },
    setVolume2CComponent: () => {},
    getGlobal2CComponentMode: () => 'alphaPhase',
    getBuilderFragmentOpsByFileFromExtensions: () => ({}),
    cloneJsonLike: (value) => (value == null ? value : JSON.parse(JSON.stringify(value))),
    pruneBuilderOperationsForVolume: () => {},
    getVolumes: () => volumes,
    setVolumes: (next) => { volumes = next; },
    setCurrentIndex: (next) => { currentIndex = next; },
    getIsoInputValue: () => '',
    setIsoInputValue: () => {},
    arrayMinMax: () => ({ min: -1, max: 1 }),
    activateVolumeIndex: (...args) => events.push(['activateVolumeIndex', ...args]),
    syncActiveVolumeControls: () => events.push(['syncActiveVolumeControls']),
    updateEmptyStateVisibility: () => events.push(['updateEmptyStateVisibility']),
    looksLikePsi4OutputText: () => false,
    parsePsi4OutputVibrationBundle: () => { throw new Error('unexpected'); },
    parseOrcaHessianVibrationBundle: () => { throw new Error('unexpected'); },
    parseVibrationPayload: () => { throw new Error('unexpected'); },
    VIBRATION_KIND: 'vibemol.vibration',
    PRESET_KIND: 'vibemol.preset',
    STRUCTURE_KIND: 'vibemol.structure',
    importPresetFromText: () => ({ name: 'Preset' }),
    parseStructureEnvelopeText: () => ({ name: 'Imported', vol: { atoms: [] }, extras: {} }),
    clearPlaceholderVolumesForUserLoad: () => events.push(['clearPlaceholderVolumesForUserLoad']),
    getUniqueVolumeName: (name) => `unique:${name}`,
    hasVolumetricGrid: options.hasVolumetricGrid || (() => false),
    handleSceneDropRecords: options.handleSceneDropRecords,
    getActiveTrajectoryInfo: () => ({ enabled: false }),
    setTrajectoryPanelOpen: () => events.push(['setTrajectoryPanelOpen']),
    attachVibrationPayloadToBestVolume: () => ({ ok: true }),
    updateSidePanel: () => events.push(['updateSidePanel']),
    getActiveVibrationInfo: () => ({ enabled: false }),
    setVibrationPanelOpen: () => events.push(['setVibrationPanelOpen']),
    setNavigationHint: (...args) => events.push(['setNavigationHint', ...args]),
    setHintMessage: (...args) => events.push(['setHintMessage', ...args]),
    alertUser: (...args) => events.push(['alertUser', ...args]),
    clearEditHistory: () => events.push(['clearEditHistory']),
    clearSceneMeshes: () => events.push(['clearSceneMeshes']),
    HINT_START: 'Start',
    formatIsoInputValue: (v) => String(v),
    DEFAULT_ISO_VALUE: 0.02,
    fetchImpl: options.fetchImpl,
  });
  return { controller, events, getVolumes: () => volumes, getCurrentIndex: () => currentIndex, ensureVolumeSchemaCalls };
}

test('file loader routes volume parsing by detected kind', () => {
  const { controller } = createController({
    detectInputFileKind: (name) => {
      if (name.endsWith('.xyz')) return 'xyz';
      if (name.endsWith('.molden')) return 'molden';
      if (name.endsWith('.2ccube')) return 'two_component_cube';
      return 'cube';
    },
  });
  assert.equal(controller.parseVolumeByName('sample.xyz', 'x').kind, 'xyz');
  assert.equal(controller.parseVolumeByName('sample.molden', 'x').kind, 'molden');
  assert.equal(controller.parseVolumeByName('sample.2ccube', 'x').kind, 'two_component_cube');
  assert.equal(controller.parseVolumeByName('sample.cube', 'x').kind, 'cube');
});

test('file loader wraps coordinates-only xyz files before parsing', () => {
  const { controller } = createController({
    detectInputFileKind: (name) => name.endsWith('.xyz') ? 'xyz' : 'cube',
    detectAndNormalizeXyzText: (text, options = {}) => ({
      atomCount: 2,
      wrapped: true,
      xyzText: `2\n${String(options.comment || 'Imported XYZ')}\nC 0 0 0\nH 0 0 1\n`,
    }),
  });
  const parsed = controller.parseVolumeByName('coords-only.xyz', 'C 0 0 0\nH 0 0 1\n');
  assert.equal(parsed.kind, 'xyz');
  assert.equal(parsed.text, '2\ncoords-only.xyz\nC 0 0 0\nH 0 0 1\n');
});

test('file loader preserves multi-frame xyz trajectory text during normalization', () => {
  const trajectoryText = [
    '2',
    'frame 1',
    'C 0 0 0',
    'H 0 0 1',
    '2',
    'frame 2',
    'C 0.1 0 0',
    'H 0.1 0 1',
    '',
  ].join('\n');
  const { controller } = createController({
    detectInputFileKind: (name) => name.endsWith('.xyz') ? 'xyz' : 'cube',
    detectAndNormalizeXyzText: () => ({
      atomCount: 2,
      wrapped: false,
      xyzText: trajectoryText,
    }),
  });
  const parsed = controller.parseVolumeByName('traj.xyz', trajectoryText);
  assert.equal(parsed.kind, 'xyz');
  assert.equal(parsed.text, trajectoryText);
});

test('file loader builds embedded files from text and base64 payloads', async () => {
  const { controller } = createController();
  const textFile = controller.buildEmbeddedFile({ name: 'a.txt', text: 'hello', mimeType: 'text/plain' }, 0);
  assert.equal(textFile.name, 'a.txt');
  assert.equal(await textFile.text(), 'hello');
  const b64 = Buffer.from('abc', 'utf8').toString('base64');
  const binFile = controller.buildEmbeddedFile({ name: 'b.bin', base64: b64, mimeType: 'application/octet-stream' }, 1);
  assert.equal(binFile.name, 'b.bin');
  assert.equal(Buffer.from(await binFile.arrayBuffer()).toString('utf8'), 'abc');
});

test('file loader clearAllLoadedFiles resets state and emits startup hint', () => {
  const { controller, events, getVolumes } = createController({ volumes: [{ name: 'sample.cube', vol: {} }] });
  controller.clearAllLoadedFiles();
  assert.deepEqual(Array.from(getVolumes()), []);
  assert.deepEqual(JSON.parse(JSON.stringify(events.slice(0, 3))), [
    ['clearEditHistory'],
    ['activateVolumeIndex', -1, { rebuild: false, clearSceneWhenEmpty: true }],
    ['setNavigationHint', 'Start', { includeStyles: true }],
  ]);
});

test('parsed file imports request inferred bond orders during schema normalization', () => {
  const { controller, ensureVolumeSchemaCalls } = createController();
  controller.appendParsedVolumeRecord('sample.xyz', { kind: 'xyz', atoms: [] }, { inferBondOrders: true });
  assert.deepEqual(ensureVolumeSchemaCalls, [{ inferBondOrders: true }]);
});

test('file loader keeps only the first primary file in one user load', async () => {
  const { controller, events, getVolumes } = createController({
    detectInputFileKind: (name) => name.endsWith('.xyz') ? 'xyz' : 'cube',
    volumes: [],
  });
  await controller.handleFiles([
    new File(['cube text'], 'first.cube', { type: 'text/plain' }),
    new File(['2\nsecond\nH 0 0 0\nH 0 0 1\n'], 'second.xyz', { type: 'text/plain' }),
  ]);
  assert.equal(getVolumes().length, 1);
  assert.equal(getVolumes()[0].name, 'first.cube');
  assert.equal(events.some((entry) => entry[0] === 'alertUser' && String(entry[1]).includes('Loaded the first primary file only')), true);
});

test('file loader replaces existing primary scene on a new primary load', async () => {
  const { controller, getVolumes, getCurrentIndex } = createController({
    detectInputFileKind: (name) => name.endsWith('.xyz') ? 'xyz' : 'cube',
    volumes: [{ name: 'old.cube', vol: { kind: 'cube', text: 'old' } }],
    currentIndex: 0,
  });
  await controller.handleFiles([
    new File(['2\nnew\nH 0 0 0\nH 0 0 1\n'], 'new.xyz', { type: 'text/plain' }),
  ]);
  assert.equal(getVolumes().length, 1);
  assert.equal(getVolumes()[0].name, 'new.xyz');
  assert.equal(getCurrentIndex(), -1);
});

test('file input uses scene-aware dispatch for primary files', async () => {
  const dispatched = [];
  const { controller, getVolumes } = createController({
    detectInputFileKind: (name) => name.endsWith('.xyz') ? 'xyz' : 'cube',
    handleSceneDropRecords: (items, options) => {
      dispatched.push({
        names: items.map((item) => item.name),
        kinds: items.map((item) => item.fileKind),
        volKinds: items.map((item) => item.vol.kind),
        options,
      });
      return true;
    },
  });
  let changeHandler = null;
  controller.installFileInput({
    addEventListener: (type, handler) => {
      if (type === 'change') changeHandler = handler;
    },
  });
  await changeHandler({
    target: {
      files: [
        new File(['cube a'], 'a.cube', { type: 'text/plain' }),
        new File(['2\nnew\nH 0 0 0\nH 0 0 1\n'], 'new.xyz', { type: 'text/plain' }),
      ],
    },
  });

  assert.equal(getVolumes().length, 0);
  assert.equal(dispatched.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(dispatched[0].names)), ['a.cube', 'new.xyz']);
  assert.deepEqual(JSON.parse(JSON.stringify(dispatched[0].kinds)), ['cube', 'xyz']);
  assert.deepEqual(JSON.parse(JSON.stringify(dispatched[0].volKinds)), ['cube', 'xyz']);
  assert.equal(dispatched[0].options.resetIsoToDefault, false);
});

test('scene-aware file loading forwards a target scene key for outliner add actions', async () => {
  const dispatched = [];
  const { controller, getVolumes } = createController({
    handleSceneDropRecords: (items, options) => {
      dispatched.push({ names: items.map((item) => item.name), options });
      return true;
    },
  });
  await controller.handleFiles([
    new File(['cube a'], 'a.cube', { type: 'text/plain' }),
  ], { sceneDispatch: true, targetSceneKey: 'scene-target' });

  assert.equal(getVolumes().length, 0);
  assert.equal(dispatched.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(dispatched[0].names)), ['a.cube']);
  assert.equal(dispatched[0].options.targetSceneKey, 'scene-target');
});

test('bundled sample loaders use scene-aware dispatch without clearing existing scenes', async () => {
  const dispatched = [];
  const fetched = {
    './assets/data/sample.cube': 'sample cube',
    '/assets/data/methane/canonical_1.cube': 'methane 1',
    '/assets/data/methane/canonical_2.cube': 'methane 2',
  };
  const { controller, getVolumes } = createController({
    volumes: [{ name: 'old.cube', vol: { kind: 'cube', text: 'old' } }],
    hasVolumetricGrid: (vol) => vol && vol.kind === 'cube',
    handleSceneDropRecords: (items, options) => {
      dispatched.push({
        names: items.map((item) => item.name),
        extras: items.map((item) => item.extras || {}),
        options,
      });
      return true;
    },
    fetchImpl: async (path) => ({
      ok: Object.prototype.hasOwnProperty.call(fetched, path),
      status: Object.prototype.hasOwnProperty.call(fetched, path) ? 200 : 404,
      text: async () => fetched[path],
    }),
  });

  assert.equal(await controller.loadSampleCube(), true);
  assert.equal(await controller.loadBundledVolumeSet([
    '/assets/data/methane/canonical_1.cube',
    '/assets/data/methane/canonical_2.cube',
  ], 'methane'), true);

  assert.deepEqual(Array.from(getVolumes(), (record) => record.name), ['old.cube']);
  assert.equal(dispatched.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(dispatched[0].names)), ['sample.cube']);
  assert.deepEqual(JSON.parse(JSON.stringify(dispatched[0].extras)), [{ isSample: true }]);
  assert.deepEqual(JSON.parse(JSON.stringify(dispatched[1].names)), ['canonical_1.cube', 'canonical_2.cube']);
  assert.deepEqual(JSON.parse(JSON.stringify(dispatched[1].extras)), [{ isSample: true }, { isSample: true }]);
  assert.equal(dispatched[1].options.resetIsoToDefault, true);
});

test('drag-drop appends cube files to the existing scene', async () => {
  const { controller, events, getVolumes } = createController({
    detectInputFileKind: (name) => name.endsWith('.xyz') ? 'xyz' : 'cube',
    hasVolumetricGrid: (vol) => vol && vol.kind === 'cube',
    volumes: [{ name: 'old.cube', vol: { kind: 'cube', text: 'old' }, _sceneGraphLayerState: { visible: true } }],
    currentIndex: 0,
  });
  await controller.handleFiles([
    new File(['cube a'], 'a.cube', { type: 'text/plain' }),
    new File(['cube b'], 'b.cube', { type: 'text/plain' }),
  ], { appendDroppedCubes: true });

  assert.equal(getVolumes().length, 3);
  assert.equal(getVolumes()[0]._sceneGraphLayerState.visible, false);
  assert.equal(getVolumes()[1].name, 'a.cube');
  assert.equal(getVolumes()[1]._sceneGraphLayerState.visible, true);
  assert.equal(getVolumes()[2].name, 'b.cube');
  assert.equal(getVolumes()[2]._sceneGraphLayerState.visible, false);
  const activateEvent = events.find((entry) => entry[0] === 'activateVolumeIndex');
  assert.equal(activateEvent[1], 1);
  assert.deepEqual(JSON.parse(JSON.stringify(activateEvent[2])), { skipAutoIso: true });
});

test('drag-drop keeps all cube files when starting from empty state', async () => {
  const { controller, getVolumes } = createController({
    hasVolumetricGrid: (vol) => vol && vol.kind === 'cube',
    volumes: [],
  });
  await controller.handleFiles([
    new File(['cube a'], 'a.cube', { type: 'text/plain' }),
    new File(['cube b'], 'b.cube', { type: 'text/plain' }),
    new File(['cube c'], 'c.cube', { type: 'text/plain' }),
  ], { appendDroppedCubes: true });

  assert.deepEqual(Array.from(getVolumes(), (record) => record.name), ['a.cube', 'b.cube', 'c.cube']);
  assert.deepEqual(Array.from(getVolumes(), (record) => record._sceneGraphLayerState.visible), [true, false, false]);
});

test('drag-drop xyz displaces instead of appending cubes', async () => {
  const { controller, getVolumes, getCurrentIndex } = createController({
    detectInputFileKind: (name) => name.endsWith('.xyz') ? 'xyz' : 'cube',
    hasVolumetricGrid: (vol) => vol && vol.kind === 'cube',
    volumes: [{ name: 'old.cube', vol: { kind: 'cube', text: 'old' }, _sceneGraphLayerState: { visible: true } }],
    currentIndex: 0,
  });
  await controller.handleFiles([
    new File(['cube a'], 'a.cube', { type: 'text/plain' }),
    new File(['2\nnew\nH 0 0 0\nH 0 0 1\n'], 'new.xyz', { type: 'text/plain' }),
  ], { appendDroppedCubes: true });

  assert.equal(getVolumes().length, 1);
  assert.equal(getVolumes()[0].name, 'new.xyz');
  assert.equal(getCurrentIndex(), -1);
});

test('drag-drop delegates mixed primary files to scene-aware dispatch hook', async () => {
  const dispatched = [];
  const { controller, getVolumes } = createController({
    detectInputFileKind: (name) => name.endsWith('.xyz') ? 'xyz' : 'cube',
    handleSceneDropRecords: (items, options) => {
      dispatched.push({
        names: items.map((item) => item.name),
        kinds: items.map((item) => item.fileKind),
        volKinds: items.map((item) => item.vol.kind),
        options,
      });
      return true;
    },
  });
  await controller.handleFiles([
    new File(['cube a'], 'a.cube', { type: 'text/plain' }),
    new File(['2\nnew\nH 0 0 0\nH 0 0 1\n'], 'new.xyz', { type: 'text/plain' }),
  ], { appendDroppedCubes: true });

  assert.equal(getVolumes().length, 0);
  assert.equal(dispatched.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(dispatched[0].names)), ['a.cube', 'new.xyz']);
  assert.deepEqual(JSON.parse(JSON.stringify(dispatched[0].kinds)), ['cube', 'xyz']);
  assert.deepEqual(JSON.parse(JSON.stringify(dispatched[0].volKinds)), ['cube', 'xyz']);
});
