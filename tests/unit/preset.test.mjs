import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';

function createController(options = {}) {
  const context = loadGlobalModule('assets/app/js/preset.js');
  const volumes = options.volumes || [];
  const downloads = [];
  const controller = context.VibeMolPresetModule.createPresetController({
    appVersion: '0.6.5',
    CATALOG_KIND: { FRAGMENT: 'fragment', MOLECULE: 'molecule' },
    normalizeFragmentId: (value) => String(value || '').trim() || 'entry',
    getCatalogEntryById: () => null,
    normalizeEditFragmentAttachPolicy: (value) => String(value || '').trim().toLowerCase() || 'append',
    allocateBuilderOpId: (() => { let i = 0; return () => `op-${++i}`; })(),
    cloneJsonLike: (value) => (value == null ? value : JSON.parse(JSON.stringify(value))),
    normalizeEditAddBondOrder: (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? Math.max(1, Math.min(4, Math.round(n))) : 1;
    },
    absorbObservedBuilderId: () => {},
    allocateBuilderGroupId: (() => { let i = 0; return () => `group-${++i}`; })(),
    ensureVolumeAtomIds: (vol) => {
      if (!Array.isArray(vol.atoms)) return;
      for (let i = 0; i < vol.atoms.length; i += 1) {
        if (!vol.atoms[i].id) vol.atoms[i].id = `atom-${i + 1}`;
      }
    },
    getBuilderAnnotationsMap: (vol, ensure) => {
      if (!vol.annotations) vol.annotations = {};
      if (!vol.annotations.builder) vol.annotations.builder = {};
      if (!vol.annotations.builder.byAtomId && ensure) vol.annotations.builder.byAtomId = {};
      return vol.annotations.builder.byAtomId || {};
    },
    ensureAtomId: (atom) => {
      if (!atom.id) atom.id = `atom-${Math.random().toString(36).slice(2)}`;
      return atom.id;
    },
    setAtomBuilderMeta: (vol, atom, meta) => {
      if (!vol.annotations) vol.annotations = {};
      if (!vol.annotations.builder) vol.annotations.builder = {};
      if (!vol.annotations.builder.byAtomId) vol.annotations.builder.byAtomId = {};
      vol.annotations.builder.byAtomId[String(atom.id)] = { ...meta };
    },
    getVolumes: () => volumes,
    isPlainObject: (value) => !!value && typeof value === 'object' && !Array.isArray(value),
    setPresetRebuildSuspended: () => {},
    normalizeImportedSettingValue: options.normalizeImportedSettingValue,
    afterApplySettings: options.afterApplySettings || (() => {}),
    beforeSavePreset: options.beforeSavePreset || (() => {}),
    downloadJsonText: (text, filename) => downloads.push({ text, filename }),
    warn: (...args) => { (options.warns || []).push(args); },
  });
  return { controller, downloads, volumes };
}

test('preset controller exports registered settings into a preset envelope', () => {
  const state = { style: 'toon', speed: 2 };
  const { controller } = createController();
  controller.registerSetting('molecule.style', () => state.style, (value) => { state.style = value; });
  controller.registerSetting('view.autoRotateSpeed', () => state.speed, (value) => { state.speed = value; });
  const preset = controller.exportEnvelope({ name: 'Demo' });
  assert.equal(preset.kind, 'vibemol.preset');
  assert.equal(preset.presetVersion, 1);
  assert.equal(preset.appVersion, '0.6.5');
  assert.equal(preset.name, 'Demo');
  assert.equal(preset.settings['molecule.style'], 'toon');
  assert.equal(preset.settings['view.autoRotateSpeed'], 2);
});

test('preset controller exports scoped appearance settings only', () => {
  const state = { style: 'toon', atomScale: 1.12, iso: 0.03 };
  const { controller } = createController();
  controller.registerSetting(
    'molecule.style',
    () => state.style,
    (value) => { state.style = value; },
    { persistScope: 'appearanceAutosave' }
  );
  controller.registerSetting(
    'molecule.atomRadiusScale',
    () => state.atomScale,
    (value) => { state.atomScale = value; },
    { section: 'molecule', type: 'number', persistScope: 'appearanceAutosave' }
  );
  controller.registerSetting('surface.iso', () => state.iso, (value) => { state.iso = value; });

  const schema = controller.listSchema();
  assert.equal(schema.find((entry) => entry.key === 'molecule.style').persistScope, 'appearanceAutosave');
  assert.equal(schema.find((entry) => entry.key === 'surface.iso').persistScope, '');

  const preset = controller.exportEnvelope({ name: 'Autosave', persistScope: 'appearanceAutosave' });
  assert.deepEqual(Object.keys(preset.settings).sort(), ['molecule.atomRadiusScale', 'molecule.style']);
  assert.equal('extensions' in preset, false);
});

test('preset controller imports in relaxed mode and preserves unknown keys', () => {
  const state = { style: 'basic' };
  const afterApplyCalls = [];
  const { controller } = createController({
    normalizeImportedSettingValue: (key, value, warnings) => {
      if (key === 'molecule.style' && value === 'fancy') {
        warnings.push('mapped fancy');
        return 'toon';
      }
      return value;
    },
    afterApplySettings: () => afterApplyCalls.push('after'),
  });
  controller.registerSetting('molecule.style', () => state.style, (value) => { state.style = value; });
  const result = controller.importEnvelope({
    kind: 'vibemol.preset',
    presetVersion: 1,
    name: 'Imported',
    settings: {
      molecule: { style: 'fancy' },
      unknownSection: { flag: true },
    },
    meta: { origin: 'test' },
    extraTop: 42,
  }, { mode: controller.modes.RELAXED });
  assert.equal(state.style, 'toon');
  assert.deepEqual(Array.from(result.unknownTop), ['extraTop']);
  assert.deepEqual(Array.from(result.unknownSettings), ['unknownSection.flag']);
  assert.deepEqual(afterApplyCalls, ['after']);
});

test('preset controller round-trips builder extensions through export and import', () => {
  const vol = {
    atoms: [{ id: 'a1' }, { id: 'a2' }],
    fragmentOps: [{ entryId: 'benzene', entryKind: 'molecule', addedAtomIds: ['a1'], builderGroupId: 'group-1' }],
    annotations: { builder: { byAtomId: {} } },
  };
  const { controller, volumes } = createController({ volumes: [{ name: 'benzene.xyz', vol }] });
  controller.registerSetting('surface.iso', () => 0.02, () => {});
  const exported = controller.exportEnvelope();
  assert.equal(exported.extensions.builder.fragmentOpsByFile['benzene.xyz'][0].entryId, 'benzene');
  volumes[0].vol.fragmentOps = [];
  controller.importEnvelope(exported, { mode: controller.modes.RELAXED });
  assert.equal(volumes[0].vol.fragmentOps.length, 1);
  assert.equal(volumes[0].vol.annotations.builder.byAtomId.a1.entryKind, 'molecule');
});
