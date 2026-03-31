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
  const events = [];
  const controller = context.VibeMolFileLoader.createFileLoader({
    detectInputFileKind: options.detectInputFileKind || ((name) => name.endsWith('.xyz') ? 'xyz' : 'cube'),
    parseXYZ: (text) => ({ kind: 'xyz', text }),
    parseMolden: (text) => ({ kind: 'molden', text }),
    parseTwoComponentCube: (text) => ({ kind: 'two_component_cube', text }),
    parseCube: (text) => ({ kind: 'cube', text }),
    ensureVolumeSchema: (vol) => vol,
    setVolume2CComponent: () => {},
    getGlobal2CComponentMode: () => 'alphaPhase',
    getBuilderFragmentOpsByFileFromExtensions: () => ({}),
    cloneJsonLike: (value) => (value == null ? value : JSON.parse(JSON.stringify(value))),
    pruneBuilderOperationsForVolume: () => {},
    getVolumes: () => volumes,
    setVolumes: (next) => { volumes = next; },
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
    hasVolumetricGrid: () => false,
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
  return { controller, events, getVolumes: () => volumes };
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
