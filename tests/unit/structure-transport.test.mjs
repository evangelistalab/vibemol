import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';

function createController(options = {}) {
  const context = loadGlobalModule('assets/app/js/structure-transport.js');
  const record = options.record || {
    name: 'sample.xyz',
    vol: {
      atoms: [{ id: 'a1', Z: 6, x: 0, y: 0, z: 0 }, { id: 'a2', Z: 6, x: 1.4, y: 0, z: 0 }],
      bonds: [{ id: 'bond:a1:a2', a: 'a1', b: 'a2', order: 1, kind: 'normal', origin: 'perceived', style: 'covalent' }],
      annotations: {
        coordination: { byAtomId: { a1: { geometryId: 'tetrahedral' } } },
        metalBonding: { byAtomId: { a2: { mode: 'force_dative' } } },
      },
    },
    measurementLabelOffsets: { dist: { dx: 1 } },
    pubchemMeta: { cid: 123 },
  };
  const downloads = [];
  const hints = [];
  const appended = [];
  const finalized = [];
  const controller = context.VibeMolStructureTransport.createStructureTransportController({
    getActiveRecord: () => record,
    getAppVersion: () => '0.6.5',
    cloneStructuredData: (value) => (value == null ? value : JSON.parse(JSON.stringify(value))),
    cloneJsonStructuredData: (value) => (value == null ? value : JSON.parse(JSON.stringify(value))),
    cloneJsonLike: (value) => (value == null ? value : JSON.parse(JSON.stringify(value))),
    rehydrateClonedVolume: (vol) => vol,
    ensureVolumeSchema: (vol) => {
      if (!vol.annotations) vol.annotations = {};
      if (!vol.annotations.coordination) vol.annotations.coordination = {};
      if (!vol.annotations.coordination.byAtomId) vol.annotations.coordination.byAtomId = {};
      if (!vol.annotations.metalBonding) vol.annotations.metalBonding = {};
      if (!vol.annotations.metalBonding.byAtomId) vol.annotations.metalBonding.byAtomId = {};
      if (vol && Array.isArray(vol.bonds)) {
        vol.bonds = vol.bonds.map((bond) => ({
          ...bond,
          origin: bond && bond.origin ? bond.origin : 'explicit',
          style: bond && bond.style ? bond.style : 'covalent',
        }));
      }
      return vol;
    },
    isPlainObject: (value) => !!value && typeof value === 'object' && !Array.isArray(value),
    getVolumeCount: () => options.volumeCount || 0,
    clearPlaceholderVolumesForUserLoad: () => { options.cleared = true; },
    appendParsedVolumeRecord: (name, vol, extras) => appended.push({ name, vol, extras }),
    finalizeLoadedVolumes: (startIndex, opts) => finalized.push({ startIndex, opts }),
    getUniqueVolumeName: (name) => `unique:${name}`,
    hasVolumetricGrid: options.hasVolumetricGrid || (() => false),
    setHintMessage: (msg) => hints.push(msg),
    downloadJsonText: (text, filename) => downloads.push({ text, filename }),
  });
  return { controller, record, downloads, hints, appended, finalized, options };
}

test('structure transport exports active structure envelope', () => {
  const { controller } = createController();
  const exported = controller.exportActiveStructureEnvelope();
  assert.equal(exported.kind, 'vibemol.structure');
  assert.equal(exported.structureVersion, 1);
  assert.equal(exported.appVersion, '0.6.5');
  assert.deepEqual(exported.volume.bonds, [
    { id: 'bond:a1:a2', a: 'a1', b: 'a2', order: 1, kind: 'normal', origin: 'perceived', style: 'covalent' },
  ]);
  assert.deepEqual(exported.volume.annotations.coordination.byAtomId, { a1: { geometryId: 'tetrahedral' } });
  assert.deepEqual(exported.volume.annotations.metalBonding.byAtomId, { a2: { mode: 'force_dative' } });
  assert.deepEqual(exported.recordState.measurementLabelOffsets, { dist: { dx: 1 } });
  assert.deepEqual(exported.recordState.pubchemMeta, { cid: 123 });
});

test('structure transport rejects newer structure versions', () => {
  const { controller } = createController();
  assert.throws(() => controller.parseStructureEnvelopeText(JSON.stringify({
    kind: 'vibemol.structure',
    structureVersion: 99,
    name: 'future',
    volume: {},
  }), 'future.structure.json'), /newer than supported 1/);
});

test('structure transport round-trips record-state extras through parse and import', () => {
  const { controller, appended, finalized } = createController({
    hasVolumetricGrid: () => true,
    volumeCount: 2,
  });
  const imported = controller.loadStructureFromText(JSON.stringify({
    kind: 'vibemol.structure',
    structureVersion: 1,
    name: 'benzene.xyz',
    volume: {
      atoms: [{ id: 'a1', Z: 6, x: 0, y: 0, z: 0 }, { id: 'a2', Z: 6, x: 1.4, y: 0, z: 0 }],
      bonds: [{ id: 'b1', a: 'a1', b: 'a2', order: 2, kind: 'normal', style: 'metal-dative' }],
      annotations: {
        coordination: { byAtomId: { a2: { geometryId: 'linear' } } },
        metalBonding: { byAtomId: { a1: { mode: 'no_bonds' } } },
      },
    },
    recordState: {
      measurementLabelOffsets: { angle: { dx: 2 } },
      pubchemMeta: { cid: 456 },
    },
  }), 'benzene.structure.json');
  assert.equal(imported.name, 'benzene.xyz');
  assert.deepEqual(imported.extras.measurementLabelOffsets, { angle: { dx: 2 } });
  assert.deepEqual(imported.extras.pubchemMeta, { cid: 456 });
  assert.equal(appended.length, 1);
  assert.equal(appended[0].name, 'unique:benzene.xyz');
  assert.deepEqual(appended[0].vol.bonds, [
    { id: 'b1', a: 'a1', b: 'a2', order: 2, kind: 'normal', origin: 'explicit', style: 'metal-dative' },
  ]);
  assert.deepEqual(appended[0].vol.annotations.coordination.byAtomId, { a2: { geometryId: 'linear' } });
  assert.deepEqual(appended[0].vol.annotations.metalBonding.byAtomId, { a1: { mode: 'no_bonds' } });
  assert.equal(appended[0].extras.skipBuilderExtensionMerge, true);
  assert.equal(finalized.length, 1);
  assert.equal(finalized[0].startIndex, 2);
  assert.equal(finalized[0].opts.resetIsoToDefault, true);
  assert.equal(finalized[0].opts.skipAutoIsoOnInitialRebuild, true);
});
