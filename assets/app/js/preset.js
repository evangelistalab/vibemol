(function (global) {
  'use strict';

  const PRESET_KIND = 'vibemol.preset';
  const PRESET_VERSION = 1;
  const PRESET_OBJECT_VALUE_KEYS = new Set([
    'global.elementColorOverrides',
  ]);
  const PRESET_TOP_LEVEL_KEYS = new Set([
    'kind',
    'presetVersion',
    'appVersion',
    'name',
    'settings',
    'meta',
    'extensions',
  ]);
  const PRESET_MODE = Object.freeze({ STRICT: 'strict', RELAXED: 'relaxed' });

  function createPresetController(deps) {
    const presetSettingRegistry = new Map();
    const presetSettingSchema = new Map();
    let presetUnknownTop = {};
    let presetUnknownSettings = {};
    let presetName = 'VibeMol Preset';
    let presetMeta = {};
    let presetExtensions = {};

    function normalizeBuilderOperationEntry(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const entryId = deps.normalizeFragmentId(raw.entryId || raw.fragmentId || raw.moleculeId);
      const entryKind = String(raw.entryKind || (raw.fragmentId ? deps.CATALOG_KIND.FRAGMENT : '') || '').trim().toLowerCase()
        || (deps.getCatalogEntryById(entryId, deps.CATALOG_KIND.MOLECULE) ? deps.CATALOG_KIND.MOLECULE : deps.CATALOG_KIND.FRAGMENT);
      const attachPolicy = deps.normalizeEditFragmentAttachPolicy(raw.attachPolicy || raw.attachMode);
      const out = {
        opId: String(raw.opId || '').trim() || deps.allocateBuilderOpId(),
        timestamp: String(raw.timestamp || new Date().toISOString()),
        entryId,
        entryKind,
        attachPolicy,
        transform: deps.cloneJsonLike(raw.transform) || null,
        resultingBondOrder: deps.normalizeEditAddBondOrder(raw.resultingBondOrder || raw.preferredBondOrder || 1),
        omittedLocalAtomIndices: Array.isArray(raw.omittedLocalAtomIndices)
          ? raw.omittedLocalAtomIndices.map((v) => Number(v) | 0).filter((v) => v >= 0)
          : [],
        removedAtomIds: Array.isArray(raw.removedAtomIds)
          ? raw.removedAtomIds.map((v) => String(v || '').trim()).filter(Boolean)
          : [],
        addedAtomIds: Array.isArray(raw.addedAtomIds)
          ? raw.addedAtomIds.map((v) => String(v || '').trim()).filter(Boolean)
          : [],
      };
      if (Array.isArray(raw.hostBondAtomIds)) {
        const hostBondAtomIds = raw.hostBondAtomIds.map((v) => String(v || '').trim()).filter(Boolean);
        if (hostBondAtomIds.length >= 2) out.hostBondAtomIds = hostBondAtomIds.slice(0, 2);
      }
      if (raw.anchorAtomIdPre) out.anchorAtomIdPre = String(raw.anchorAtomIdPre).trim();
      if (raw.anchorAtomIdPost) out.anchorAtomIdPost = String(raw.anchorAtomIdPost).trim();
      if (Array.isArray(raw.removedAtomIndices)) out.removedAtomIndices = raw.removedAtomIndices.map((v) => Number(v) | 0).filter((v) => v >= 0);
      if (Array.isArray(raw.addedAtomIndices)) out.addedAtomIndices = raw.addedAtomIndices.map((v) => Number(v) | 0).filter((v) => v >= 0);
      if (Number.isInteger(raw.anchorIndexPre)) out.anchorIndexPre = Number(raw.anchorIndexPre) | 0;
      if (Number.isInteger(raw.anchorIndexPost)) out.anchorIndexPost = Number(raw.anchorIndexPost) | 0;
      if (Array.isArray(raw.hostBondIndices)) out.hostBondIndices = raw.hostBondIndices.map((v) => Number(v) | 0).filter((v) => v >= 0).slice(0, 2);
      if (raw.builderGroupId) {
        out.builderGroupId = String(raw.builderGroupId).trim();
        deps.absorbObservedBuilderId(out.builderGroupId, 'group');
      } else {
        out.builderGroupId = deps.allocateBuilderGroupId();
      }
      deps.absorbObservedBuilderId(out.opId, 'op');
      return out;
    }

    function serializeBuilderOperationEntry(raw) {
      const op = normalizeBuilderOperationEntry(raw);
      if (!op) return null;
      const out = {
        opId: op.opId,
        timestamp: op.timestamp,
        entryId: op.entryId,
        entryKind: op.entryKind,
        attachPolicy: op.attachPolicy,
        transform: deps.cloneJsonLike(op.transform) || null,
        resultingBondOrder: op.resultingBondOrder,
        omittedLocalAtomIndices: Array.isArray(op.omittedLocalAtomIndices) ? op.omittedLocalAtomIndices.slice() : [],
        removedAtomIds: Array.isArray(op.removedAtomIds) ? op.removedAtomIds.slice() : [],
        addedAtomIds: Array.isArray(op.addedAtomIds) ? op.addedAtomIds.slice() : [],
        builderGroupId: op.builderGroupId,
      };
      if (op.anchorAtomIdPre) out.anchorAtomIdPre = op.anchorAtomIdPre;
      if (op.anchorAtomIdPost) out.anchorAtomIdPost = op.anchorAtomIdPost;
      if (Array.isArray(op.hostBondAtomIds) && op.hostBondAtomIds.length) out.hostBondAtomIds = op.hostBondAtomIds.slice(0, 2);
      return out;
    }

    function rehydrateBuilderStateForVolume(vol) {
      if (!vol || !Array.isArray(vol.atoms)) return;
      deps.ensureVolumeAtomIds(vol);
      const atoms = vol.atoms;
      const byAtomId = deps.getBuilderAnnotationsMap(vol, true);
      const liveIds = new Set();
      for (const atom of atoms) {
        if (!atom || typeof atom !== 'object') continue;
        deps.absorbObservedBuilderId(atom.id, 'atom');
        liveIds.add(String(atom.id || ''));
      }
      for (const atomId of Object.keys(byAtomId || {})) {
        if (!liveIds.has(atomId)) delete byAtomId[atomId];
      }
      if (!Array.isArray(vol.fragmentOps)) {
        vol.fragmentOps = [];
        return;
      }
      const normalizedOps = [];
      for (const raw of vol.fragmentOps) {
        const op = normalizeBuilderOperationEntry(raw);
        if (!op) continue;
        if ((!Array.isArray(op.addedAtomIds) || !op.addedAtomIds.length) && Array.isArray(op.addedAtomIndices)) {
          op.addedAtomIds = op.addedAtomIndices
            .map((idx) => (atoms[idx] ? deps.ensureAtomId(atoms[idx]) : ''))
            .filter(Boolean);
        }
        if (!op.anchorAtomIdPost && Number.isInteger(op.anchorIndexPost) && atoms[op.anchorIndexPost]) {
          op.anchorAtomIdPost = deps.ensureAtomId(atoms[op.anchorIndexPost]);
        }
        if (!op.anchorAtomIdPre && Number.isInteger(op.anchorIndexPre) && atoms[op.anchorIndexPre]) {
          op.anchorAtomIdPre = deps.ensureAtomId(atoms[op.anchorIndexPre]);
        }
        if ((!Array.isArray(op.hostBondAtomIds) || !op.hostBondAtomIds.length) && Array.isArray(op.hostBondIndices)) {
          op.hostBondAtomIds = op.hostBondIndices
            .map((idx) => (atoms[idx] ? deps.ensureAtomId(atoms[idx]) : ''))
            .filter(Boolean)
            .slice(0, 2);
        }
        const addedIds = Array.isArray(op.addedAtomIds) ? op.addedAtomIds : [];
        for (const atom of atoms) {
          if (!atom || !addedIds.includes(String(atom.id || ''))) continue;
          deps.setAtomBuilderMeta(vol, atom, {
            groupId: op.builderGroupId,
            entryId: op.entryId,
            entryKind: op.entryKind,
          });
        }
        normalizedOps.push(op);
      }
      vol.fragmentOps = normalizedOps;
    }

    function pruneBuilderOperationsForVolume(vol) {
      if (!vol || !Array.isArray(vol.atoms)) return false;
      deps.ensureVolumeAtomIds(vol);
      if (!Array.isArray(vol.fragmentOps)) {
        vol.fragmentOps = [];
        return false;
      }
      const liveIds = new Set(vol.atoms.map((atom) => String(deps.ensureAtomId(atom))));
      const nextOps = [];
      let changed = false;
      for (const raw of vol.fragmentOps) {
        const op = normalizeBuilderOperationEntry(raw);
        if (!op) {
          changed = true;
          continue;
        }
        const nextAddedAtomIds = Array.isArray(op.addedAtomIds)
          ? op.addedAtomIds.map((id) => String(id || '').trim()).filter((id) => liveIds.has(id))
          : [];
        if (nextAddedAtomIds.length === 0) {
          changed = true;
          continue;
        }
        if (nextAddedAtomIds.length !== (Array.isArray(op.addedAtomIds) ? op.addedAtomIds.length : 0)) changed = true;
        op.addedAtomIds = nextAddedAtomIds;
        if (Array.isArray(op.hostBondAtomIds)) {
          const nextHostBondAtomIds = op.hostBondAtomIds
            .map((id) => String(id || '').trim())
            .filter((id) => liveIds.has(id))
            .slice(0, 2);
          if (nextHostBondAtomIds.length !== op.hostBondAtomIds.length) changed = true;
          if (nextHostBondAtomIds.length >= 2) op.hostBondAtomIds = nextHostBondAtomIds;
          else delete op.hostBondAtomIds;
        }
        if (op.anchorAtomIdPost && !liveIds.has(String(op.anchorAtomIdPost))) {
          delete op.anchorAtomIdPost;
          changed = true;
        }
        nextOps.push(op);
      }
      if (changed || nextOps.length !== vol.fragmentOps.length) vol.fragmentOps = nextOps;
      rehydrateBuilderStateForVolume(vol);
      return changed || nextOps.length !== vol.fragmentOps.length;
    }

    function getBuilderFragmentOpsByFileFromExtensions() {
      const builder = (presetExtensions && typeof presetExtensions === 'object') ? presetExtensions.builder : null;
      if (!builder || typeof builder !== 'object') return {};
      const map = builder.fragmentOpsByFile;
      if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
      return map;
    }

    function applyBuilderExtensionToLoadedVolumes() {
      const map = getBuilderFragmentOpsByFileFromExtensions();
      for (const record of deps.getVolumes()) {
        if (!record || !record.vol) continue;
        const key = String(record.name || '').trim();
        const stored = key && Array.isArray(map[key]) ? map[key] : null;
        if (stored) record.vol.fragmentOps = deps.cloneJsonLike(stored) || [];
        else if (!Array.isArray(record.vol.fragmentOps)) record.vol.fragmentOps = [];
        pruneBuilderOperationsForVolume(record.vol);
      }
    }

    function syncBuilderExtensionFromVolumes() {
      const existingBuilder = (presetExtensions && typeof presetExtensions === 'object' && presetExtensions.builder && typeof presetExtensions.builder === 'object')
        ? deps.cloneJsonLike(presetExtensions.builder)
        : {};
      const existingMap = (existingBuilder && existingBuilder.fragmentOpsByFile && typeof existingBuilder.fragmentOpsByFile === 'object' && !Array.isArray(existingBuilder.fragmentOpsByFile))
        ? deps.cloneJsonLike(existingBuilder.fragmentOpsByFile)
        : {};
      for (const record of deps.getVolumes()) {
        if (!record || !record.vol) continue;
        const key = String(record.name || '').trim();
        if (!key) continue;
        if (Array.isArray(record.vol.fragmentOps) && record.vol.fragmentOps.length > 0) {
          existingMap[key] = record.vol.fragmentOps
            .map((raw) => serializeBuilderOperationEntry(raw))
            .filter(Boolean)
            .map((op) => deps.cloneJsonLike(op));
        } else {
          delete existingMap[key];
        }
      }
      if (!presetExtensions || typeof presetExtensions !== 'object' || Array.isArray(presetExtensions)) presetExtensions = {};
      presetExtensions.builder = Object.assign({}, existingBuilder || {}, {
        version: 1,
        fragmentOpsByFile: existingMap,
      });
    }

    function normalizePresetMode(mode) {
      return mode === PRESET_MODE.STRICT ? PRESET_MODE.STRICT : PRESET_MODE.RELAXED;
    }

    function flattenSettingsTree(node, prefix = '', out = {}) {
      if (!deps.isPlainObject(node)) return out;
      for (const [key, value] of Object.entries(node)) {
        const nextKey = prefix ? `${prefix}.${key}` : key;
        if (deps.isPlainObject(value)) {
          if (PRESET_OBJECT_VALUE_KEYS.has(nextKey)) out[nextKey] = deps.cloneJsonLike(value);
          else flattenSettingsTree(value, nextKey, out);
        } else {
          out[nextKey] = value;
        }
      }
      return out;
    }

    function normalizePersistScope(scope) {
      return (typeof scope === 'string' && scope.trim()) ? scope.trim() : '';
    }

    function registerSetting(key, getter, setter, options = {}) {
      const section = (typeof options.section === 'string' && options.section.trim()) ? options.section.trim() : String(key).split('.')[0];
      const type = (typeof options.type === 'string' && options.type.trim()) ? options.type.trim() : 'any';
      const description = (typeof options.description === 'string') ? options.description : '';
      const persistScope = normalizePersistScope(options.persistScope);
      presetSettingRegistry.set(key, { get: getter, set: setter, persistScope });
      presetSettingSchema.set(key, Object.freeze({ key, section, type, description, persistScope }));
    }

    function listSchema() {
      return Array.from(presetSettingSchema.values()).map((entry) => Object.assign({}, entry));
    }

    function exportEnvelope(options = {}) {
      const persistScope = normalizePersistScope(options.persistScope);
      if (!persistScope) syncBuilderExtensionFromVolumes();
      const settings = persistScope ? {} : (deps.cloneJsonLike(presetUnknownSettings) || {});
      for (const [key, def] of presetSettingRegistry.entries()) {
        if (persistScope && def.persistScope !== persistScope) continue;
        settings[key] = def.get();
      }
      const name = (typeof options.name === 'string' && options.name.trim()) ? options.name.trim() : presetName;
      const now = new Date().toISOString();
      const mergedMeta = Object.assign({}, deps.cloneJsonLike(presetMeta) || {}, {
        source: 'web',
        updatedAt: now,
      });
      if (!mergedMeta.createdAt) mergedMeta.createdAt = now;
      const envelope = {
        kind: PRESET_KIND,
        presetVersion: PRESET_VERSION,
        appVersion: deps.appVersion,
        name,
        settings,
        meta: mergedMeta,
      };
      if (persistScope) return envelope;
      return Object.assign({}, deps.cloneJsonLike(presetUnknownTop) || {}, envelope, {
        extensions: deps.cloneJsonLike(presetExtensions) || {},
      });
    }

    function applyPresetSettings(settingsLike, options = {}) {
      const mode = normalizePresetMode(options.mode);
      const warnings = [];
      const flatSettings = flattenSettingsTree(settingsLike);
      const unknownSettings = {};
      for (const key of Object.keys(flatSettings)) {
        if (!presetSettingRegistry.has(key)) {
          unknownSettings[key] = flatSettings[key];
          warnings.push(`Unknown setting key ignored: ${key}`);
        }
      }
      if (mode === PRESET_MODE.STRICT && Object.keys(unknownSettings).length > 0) {
        throw new Error(`Unknown setting keys: ${Object.keys(unknownSettings).join(', ')}`);
      }

      const applied = [];
      deps.setPresetRebuildSuspended(true);
      try {
        for (const [key, def] of presetSettingRegistry.entries()) {
          if (!(key in flatSettings)) continue;
          let value = flatSettings[key];
          if (typeof deps.normalizeImportedSettingValue === 'function') {
            value = deps.normalizeImportedSettingValue(key, value, warnings);
          }
          try {
            def.set(value);
            applied.push(key);
          } catch (err) {
            const message = `Failed setting ${key}: ${err && err.message ? err.message : String(err)}`;
            if (mode === PRESET_MODE.STRICT) throw new Error(message);
            warnings.push(message);
          }
        }
      } finally {
        deps.setPresetRebuildSuspended(false);
      }

      if (typeof deps.afterApplySettings === 'function') deps.afterApplySettings();
      presetUnknownSettings = deps.cloneJsonLike(unknownSettings) || {};
      return {
        ok: true,
        mode,
        applied,
        warnings,
        unknownSettings: Object.keys(unknownSettings),
      };
    }

    function importEnvelope(preset, options = {}) {
      const mode = normalizePresetMode(options.mode);
      if (!deps.isPlainObject(preset)) throw new Error('Preset must be an object.');
      const warnings = [];

      const kind = preset.kind;
      if (kind !== PRESET_KIND) {
        const msg = `Unexpected preset kind: ${String(kind)} (expected ${PRESET_KIND})`;
        if (mode === PRESET_MODE.STRICT) throw new Error(msg);
        warnings.push(msg);
      }
      const parsedVersion = Number(preset.presetVersion);
      if (Number.isFinite(parsedVersion) && parsedVersion > PRESET_VERSION) {
        const msg = `Preset version ${parsedVersion} is newer than supported ${PRESET_VERSION}`;
        if (mode === PRESET_MODE.STRICT) throw new Error(msg);
        warnings.push(msg);
      }

      const unknownTop = {};
      for (const [key, value] of Object.entries(preset)) {
        if (!PRESET_TOP_LEVEL_KEYS.has(key)) unknownTop[key] = value;
      }
      presetUnknownTop = deps.cloneJsonLike(unknownTop) || {};

      if (typeof preset.name === 'string' && preset.name.trim()) presetName = preset.name.trim();
      if (deps.isPlainObject(preset.meta)) presetMeta = deps.cloneJsonLike(preset.meta) || {};
      if (deps.isPlainObject(preset.extensions)) presetExtensions = deps.cloneJsonLike(preset.extensions) || {};

      const applyResult = applyPresetSettings(preset.settings || {}, { mode });
      applyBuilderExtensionToLoadedVolumes();
      return {
        ok: true,
        mode,
        kind: PRESET_KIND,
        presetVersion: PRESET_VERSION,
        applied: applyResult.applied,
        warnings: warnings.concat(applyResult.warnings),
        unknownTop: Object.keys(unknownTop),
        unknownSettings: applyResult.unknownSettings,
        name: presetName,
      };
    }

    function saveCurrentPresetToFile() {
      if (typeof deps.beforeSavePreset === 'function') deps.beforeSavePreset();
      const preset = exportEnvelope();
      const date = new Date().toISOString().replace(/[:]/g, '-').replace(/\..+/, '');
      deps.downloadJsonText(`${JSON.stringify(preset, null, 2)}\n`, `vibemol-preset-${date}.json`);
    }

    function importFromText(text, sourceLabel = 'preset') {
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`${sourceLabel}: invalid JSON`);
      }
      const result = importEnvelope(parsed, { mode: PRESET_MODE.RELAXED });
      if (result.warnings.length > 0 && typeof deps.warn === 'function') deps.warn('[Preset] import warnings', result.warnings);
      return result;
    }

    function getPublicApi() {
      return Object.freeze({
        kind: PRESET_KIND,
        version: PRESET_VERSION,
        listKeys: () => Array.from(presetSettingRegistry.keys()),
        listSchema: () => listSchema(),
        export: (options = {}) => exportEnvelope(options),
        import: (preset, options = {}) => importEnvelope(preset, options),
      });
    }

    return Object.freeze({
      kind: PRESET_KIND,
      version: PRESET_VERSION,
      modes: PRESET_MODE,
      registerSetting,
      listSchema,
      getBuilderFragmentOpsByFileFromExtensions,
      normalizeBuilderOperationEntry,
      rehydrateBuilderStateForVolume,
      pruneBuilderOperationsForVolume,
      applyBuilderExtensionToLoadedVolumes,
      syncBuilderExtensionFromVolumes,
      exportEnvelope,
      importEnvelope,
      saveCurrentPresetToFile,
      importFromText,
      getPublicApi,
    });
  }

  global.VibeMolPresetModule = Object.freeze({ createPresetController });
})(typeof window !== 'undefined' ? window : globalThis);
