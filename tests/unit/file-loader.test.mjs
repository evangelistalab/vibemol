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
    parseXYZ: options.parseXYZ || ((text) => ({ kind: 'xyz', text })),
    BOHR_TO_ANG: 0.529177210903,
    hasXyzBondCandidates: options.hasXyzBondCandidates || (() => true),
    confirmUser: options.confirmUser || (() => { throw new Error('Unexpected unit confirmation'); }),
    parseMolden: (text) => ({ kind: 'molden', text }),
    parseTwoComponentCube: (text) => ({ kind: 'two_component_cube', text }),
    parseCube: options.parseCube || ((text) => ({ kind: 'cube', text })),
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
    activateVolumeIndex: (...args) => { currentIndex = args[0]; events.push(['activateVolumeIndex', ...args]); },
    syncActiveVolumeControls: () => events.push(['syncActiveVolumeControls']),
    updateEmptyStateVisibility: () => events.push(['updateEmptyStateVisibility']),
    looksLikePsi4OutputText: () => false,
    parsePsi4OutputVibrationBundle: () => { throw new Error('unexpected'); },
    parseOrcaHessianVibrationBundle: () => { throw new Error('unexpected'); },
    parseVibrationPayload: options.parseVibrationPayload || (() => { throw new Error('unexpected'); }),
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
    attachVibrationPayloadToBestVolume: options.attachVibrationPayloadToBestVolume || (() => ({ ok: true })),
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
    ['setNavigationHint', 'Start'],
  ]);
});

test('parsed file imports request inferred bond orders during schema normalization', () => {
  const { controller, ensureVolumeSchemaCalls } = createController();
  controller.appendParsedVolumeRecord('sample.xyz', { kind: 'xyz', atoms: [] }, { inferBondOrders: true });
  assert.deepEqual(ensureVolumeSchemaCalls, [{ inferBondOrders: true }]);
});

test('file loader accepts every primary file in one user load', async () => {
  const { controller, events, getVolumes } = createController({
    detectInputFileKind: (name) => name.endsWith('.xyz') ? 'xyz' : 'cube',
    volumes: [],
  });
  await controller.handleFiles([
    new File(['cube text'], 'first.cube', { type: 'text/plain' }),
    new File(['2\nsecond\nH 0 0 0\nH 0 0 1\n'], 'second.xyz', { type: 'text/plain' }),
  ]);
  assert.deepEqual(getVolumes().map(record => record.name), ['first.cube', 'second.xyz']);
  assert.equal(events.some(entry => entry[0] === 'alertUser'), false);
});

test('file loader replaces existing scenes only when explicitly requested', async () => {
  const { controller, getVolumes, getCurrentIndex } = createController({
    detectInputFileKind: (name) => name.endsWith('.xyz') ? 'xyz' : 'cube',
    volumes: [{ name: 'old.cube', vol: { kind: 'cube', text: 'old' } }],
    currentIndex: 0,
  });
  await controller.handleFiles([
    new File(['2\nnew\nH 0 0 0\nH 0 0 1\n'], 'new.xyz', { type: 'text/plain' }),
  ], { clearFirst: true });
  assert.equal(getVolumes().length, 1);
  assert.equal(getVolumes()[0].name, 'new.xyz');
  assert.equal(getCurrentIndex(), 0);
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
  assert.deepEqual(JSON.parse(JSON.stringify(dispatched[0].extras)), [{ inferBondOrders: true, isSample: true }]);
  assert.deepEqual(JSON.parse(JSON.stringify(dispatched[1].names)), ['canonical_1.cube', 'canonical_2.cube']);
  assert.deepEqual(JSON.parse(JSON.stringify(dispatched[1].extras)), [{ inferBondOrders: true, isSample: true }, { inferBondOrders: true, isSample: true }]);
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
  assert.equal(getVolumes()[0]._sceneGraphLayerState.visible, true);
  assert.equal(getVolumes()[1].name, 'a.cube');
  assert.equal(getVolumes()[2].name, 'b.cube');
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
});

test('drag-drop mixed primary files append consistently', async () => {
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

  assert.deepEqual(getVolumes().map(record => record.name), ['old.cube', 'a.cube', 'new.xyz']);
  assert.equal(getCurrentIndex(), 1);
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

test('embedded append counts only new successful inputs and keeps existing files', async () => {
  const { controller, getVolumes } = createController();
  await controller.loadEmbeddedFiles([{ name: 'a.cube', text: 'a' }]);
  const result = await controller.loadEmbeddedFiles([{ name: 'b.cube', text: 'b' }], { clearFirst: false });
  assert.equal(result.ok, true);
  assert.equal(result.loadedCount, 1);
  assert.deepEqual(Array.from(result.loadedNames), ['b.cube']);
  assert.deepEqual(Array.from(getVolumes(), record => record.name), ['a.cube', 'b.cube']);
});

test('invalid replacements preserve the current scene and report a popup', async () => {
  const { controller, events, getVolumes } = createController({
    volumes: [{ name: 'old.cube', vol: {} }],
    parseCube: () => { throw new Error('Malformed grid'); },
  });
  const result = await controller.loadEmbeddedFiles([{ name: 'bad.cube', text: 'bad' }]);
  assert.equal(result.ok, false);
  assert.equal(result.loadedCount, 0);
  assert.deepEqual(Array.from(result.loadedNames), []);
  assert.equal(getVolumes()[0].name, 'old.cube');
  assert.equal(events.filter(event => event[0] === 'alertUser').length, 1);
  assert.match(result.error, /bad.cube: Malformed grid/);
});

test('mixed scene-dispatch batches retain valid files and report each rejected input', async () => {
  const dispatched = [];
  const { controller, events } = createController({
    parseCube: text => { if (text === 'bad') throw new Error('Malformed grid'); return { kind: 'cube' }; },
    handleSceneDropRecords: items => { dispatched.push(...items.map(item => item.name)); return true; },
  });
  const result = await controller.handleFiles([new File(['bad'], 'bad.cube'), new File(['ok'], 'good.cube')], { sceneDispatch: true });
  assert.equal(result.ok, false);
  assert.deepEqual(dispatched, ['good.cube']);
  assert.equal(result.loadedCount, 1);
  assert.deepEqual(Array.from(result.loadedNames), ['good.cube']);
  assert.match(events.find(event => event[0] === 'alertUser')[1], /bad.cube/);
});

test('sidecars in a primary batch are attached after every primary is committed', async () => {
  let primaryCount = 0, attachedAfter = 0;
  const { controller } = createController({
    detectInputFileKind: name => name.endsWith('.vib.json') ? 'vibration_payload' : 'xyz',
    parseVibrationPayload: () => ({ atomCount: 2, modes: [] }),
    handleSceneDropRecords: items => { primaryCount = items.length; return true; },
    attachVibrationPayloadToBestVolume: () => { attachedAfter = primaryCount; return { ok: true }; },
  });
  const result = await controller.handleFiles([new File(['{}'], 'a.vib.json'), new File(['a'], 'a.xyz'), new File(['b'], 'b.xyz')]);
  assert.equal(attachedAfter, 2);
  assert.equal(result.loadedCount, 3);
  assert.equal(result.ok, true);
});

test('the session file size guard does not restrict ordinary molecular imports', async () => {
  const { controller } = createController();
  let sessionRead = false;
  const plan = await controller.parseFiles([
    { name: 'large.cube', size: 600 * 1024 * 1024, text: async () => 'cube data' },
    { name: 'large.vibemol-session', size: 600 * 1024 * 1024,
      text: async () => { sessionRead = true; return '{}'; } },
  ]);
  assert.equal(plan.primaries.length, 1);
  assert.equal(plan.primaries[0].name, 'large.cube');
  assert.equal(plan.failures.length, 1);
  assert.match(plan.failures[0], /Session file exceeds/);
  assert.equal(sessionRead, false);
});

const parseXyz = loadGlobalModule('assets/app/js/parsers.js', {
  globals: { ATOM_SYMBOL_TO_Z: { C: 6, H: 1 } },
}).VibeMolParsers.parseXYZ;
const bohrTrajectory = '2\nFirst frame\nC 2 -3 4\nH 4 -3 4\n2\nSecond frame\nC 3 -2 5\nH 5 -2 5\n';

test('XYZ conversion waits for confirmation before replacing a scene and scales every trajectory frame', async () => {
  let resolveConfirmation;
  let confirmationShown;
  const shown = new Promise(resolve => { confirmationShown = resolve; });
  const oldRecord = { name: 'existing.xyz', vol: parseXyz('1\nExisting atom\nC 0 0 0\n') };
  const { controller, getVolumes, events } = createController({
    volumes: [oldRecord],
    parseXYZ: parseXyz,
    hasXyzBondCandidates: () => false,
    confirmUser: message => {
      assert.match(message, /trajectory.xyz/);
      assert.match(message, /bohr/);
      assert.match(message, /every trajectory frame/);
      confirmationShown();
      return new Promise(resolve => { resolveConfirmation = resolve; });
    },
  });
  const plan = await controller.parseFiles([new File([bohrTrajectory], 'trajectory.xyz')]);
  assert.equal(plan.primaries[0].vol.atoms[0].x, 2, 'Parsing does not convert or prompt');
  const loading = controller.commitFilePlan(plan, { clearFirst: true });
  await shown;
  assert.equal(getVolumes()[0], oldRecord);
  assert.equal(events.some(event => event[0] === 'clearEditHistory'), false);
  resolveConfirmation(true);
  assert.equal((await loading).ok, true);
  const converted = getVolumes()[0].vol;
  const original = parseXyz(bohrTrajectory);
  assert.equal(getVolumes().length, 1);
  assert.equal(converted.units, 'angstrom');
  for (let i = 0; i < original.atoms.length; i++) {
    for (const axis of ['x', 'y', 'z']) {
      assert.equal(converted.atoms[i][axis], original.atoms[i][axis] * 0.529177210903);
    }
  }
  for (let f = 0; f < original.trajectory.frames.length; f++) {
    const actualFrame = converted.trajectory.frames[f];
    assert.equal(actualFrame.constructor.name, 'Float32Array');
    assert.equal(actualFrame.length, 6);
    for (let i = 0; i < actualFrame.length; i++) {
      assert.ok(Math.abs(actualFrame[i] - original.trajectory.frames[f][i] * 0.529177210903) < 1e-6);
    }
  }
  assert.deepEqual(Array.from(converted.trajectory.comments), ['First frame', 'Second frame']);
});

test('XYZ unit decisions apply per input and precede scene registration and sidecars', async () => {
  const prompts = [];
  const registered = [];
  const { controller } = createController({
    parseXYZ: parseXyz,
    detectInputFileKind: name => name.endsWith('.vib.json') ? 'vibration_payload' : 'xyz',
    parseVibrationPayload: () => ({ atomCount: 2, modes: [] }),
    hasXyzBondCandidates: () => false,
    confirmUser: message => { prompts.push(message); return message.includes('convert.xyz'); },
    handleSceneDropRecords: items => { registered.push(...items); return true; },
    attachVibrationPayloadToBestVolume: () => {
      assert.equal(registered.length, 2);
      assert.equal(registered[0].vol.atoms[0].x, 2 * 0.529177210903);
      return { ok: true };
    },
  });
  const result = await controller.loadEmbeddedFiles([
    { name: 'convert.vib.json', text: '{}' },
    { name: 'convert.xyz', text: bohrTrajectory },
    { name: 'keep.xyz', text: bohrTrajectory },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.loadedCount, 3);
  assert.equal(prompts.length, 2);
  const kept = registered[1].vol;
  const original = parseXyz(bohrTrajectory);
  assert.deepEqual(kept.atoms, original.atoms);
  assert.deepEqual(kept.trajectory.frames, original.trajectory.frames);
});

test('bonded XYZ, single atoms, empty XYZ, and other formats do not ask about units', async () => {
  let checks = 0;
  const { controller } = createController({
    parseXYZ: parseXyz,
    parseCube: () => ({ kind: 'cube', units: 'bohr', atoms: parseXyz(bohrTrajectory).atoms }),
    hasXyzBondCandidates: vol => { checks++; assert.equal(vol.atoms.length, 2); return true; },
  });
  const result = await controller.handleFiles([
    new File(['2\nBonded\nC 0 0 0\nH 1 0 0\n'], 'bonded.xyz'),
    new File(['1\nSingle\nC 8 0 0\n'], 'single.xyz'),
    new File(['0\nEmpty\n'], 'empty.xyz'),
    new File(['cube data'], 'known-bohr.cube'),
  ]);
  assert.equal(result.loadedCount, 4);
  assert.equal(checks, 1);
});

test('rejected mixed session imports do not prompt about XYZ units or clear the scene', async () => {
  const { controller, getVolumes } = createController({
    volumes: [{ name: 'existing.cube', vol: {} }],
    parseXYZ: parseXyz,
    hasXyzBondCandidates: () => { throw new Error('Rejected XYZ must not be inspected'); },
    detectInputFileKind: name => name.endsWith('.vibemol-session') ? 'session' : 'xyz',
  });
  const result = await controller.loadEmbeddedFiles([
    { name: 'workspace.vibemol-session', text: '{}' },
    { name: 'bohr.xyz', text: bohrTrajectory },
  ]);
  assert.equal(result.ok, false);
  assert.match(result.error, /Open one session file at a time/);
  assert.equal(getVolumes()[0].name, 'existing.cube');
});
