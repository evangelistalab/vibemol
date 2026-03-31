(function (global) {
  'use strict';

  const STRUCTURE_KIND = 'vibemol.structure';
  const STRUCTURE_VERSION = 1;

  function createStructureTransportController(deps) {
    function buildStructureDownloadFilename(record) {
      const rawName = String(record && record.name || 'structure').trim() || 'structure';
      const safeName = rawName
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
      const base = safeName.replace(/\.[^/.]+$/, '') || 'structure';
      return `${base}.structure.json`;
    }

    function exportStructureVolume(vol) {
      const clone = deps.rehydrateClonedVolume(deps.cloneStructuredData(vol));
      deps.ensureVolumeSchema(clone);
      return deps.cloneJsonStructuredData(clone);
    }

    function exportActiveStructureEnvelope() {
      const record = deps.getActiveRecord();
      if (!record || !record.vol) throw new Error('No active structure is loaded.');
      return {
        kind: STRUCTURE_KIND,
        structureVersion: STRUCTURE_VERSION,
        appVersion: deps.getAppVersion(),
        name: String(record.name || 'structure').trim() || 'structure',
        meta: {
          source: 'web',
          exportedAt: new Date().toISOString(),
        },
        volume: exportStructureVolume(record.vol),
        recordState: {
          measurementLabelOffsets: deps.cloneJsonStructuredData(record.measurementLabelOffsets || {}),
          pubchemMeta: deps.cloneJsonStructuredData(record.pubchemMeta || null),
        },
      };
    }

    function parseStructureEnvelopeText(text, sourceLabel = 'structure') {
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`${sourceLabel}: invalid JSON`);
      }
      if (!deps.isPlainObject(parsed)) throw new Error(`${sourceLabel}: structure payload must be an object.`);
      if (String(parsed.kind || '') !== STRUCTURE_KIND) {
        throw new Error(`${sourceLabel}: unexpected structure kind "${String(parsed.kind || '')}".`);
      }
      const version = Number(parsed.structureVersion);
      if (Number.isFinite(version) && version > STRUCTURE_VERSION) {
        throw new Error(`${sourceLabel}: structure version ${version} is newer than supported ${STRUCTURE_VERSION}.`);
      }
      const name = String(parsed.name || sourceLabel || 'structure').trim() || 'structure';
      if (!deps.isPlainObject(parsed.volume)) throw new Error(`${sourceLabel}: missing "volume" object.`);
      const vol = deps.rehydrateClonedVolume(deps.cloneStructuredData(parsed.volume));
      deps.ensureVolumeSchema(vol);
      const recordState = deps.isPlainObject(parsed.recordState) ? parsed.recordState : {};
      const extras = {};
      if (deps.isPlainObject(recordState.measurementLabelOffsets)) extras.measurementLabelOffsets = deps.cloneJsonLike(recordState.measurementLabelOffsets) || {};
      if (deps.isPlainObject(recordState.pubchemMeta)) extras.pubchemMeta = deps.cloneJsonLike(recordState.pubchemMeta) || null;
      return { name, vol, extras };
    }

    function loadStructureFromText(text, sourceLabel = 'structure') {
      const imported = parseStructureEnvelopeText(text, sourceLabel);
      deps.clearPlaceholderVolumesForUserLoad();
      const startIndex = deps.getVolumeCount();
      deps.appendParsedVolumeRecord(
        deps.getUniqueVolumeName(imported.name),
        imported.vol,
        Object.assign({}, imported.extras || {}, { skipBuilderExtensionMerge: true }),
      );
      deps.finalizeLoadedVolumes(startIndex, {
        resetIsoToDefault: deps.hasVolumetricGrid(imported.vol),
        skipAutoIsoOnInitialRebuild: deps.hasVolumetricGrid(imported.vol),
      });
      return imported;
    }

    function saveCurrentStructureToFile() {
      const record = deps.getActiveRecord();
      if (!record || !record.vol) {
        deps.setHintMessage('No active structure to save.');
        return;
      }
      const filename = buildStructureDownloadFilename(record);
      deps.downloadJsonText(`${JSON.stringify(exportActiveStructureEnvelope(), null, 2)}\n`, filename);
      deps.setHintMessage(`Saved structure: ${filename}`);
    }

    function getPublicApi() {
      return Object.freeze({
        kind: STRUCTURE_KIND,
        version: STRUCTURE_VERSION,
        exportActive: () => exportActiveStructureEnvelope(),
        exportActiveText: () => `${JSON.stringify(exportActiveStructureEnvelope(), null, 2)}\n`,
        parseText: (text, sourceLabel = 'structure') => parseStructureEnvelopeText(text, sourceLabel),
        importFromText: (text, sourceLabel = 'structure') => loadStructureFromText(text, sourceLabel),
      });
    }

    return Object.freeze({
      kind: STRUCTURE_KIND,
      version: STRUCTURE_VERSION,
      buildStructureDownloadFilename,
      saveCurrentStructureToFile,
      exportStructureVolume,
      exportActiveStructureEnvelope,
      parseStructureEnvelopeText,
      loadStructureFromText,
      getPublicApi,
    });
  }

  global.VibeMolStructureTransport = Object.freeze({ createStructureTransportController });
})(typeof window !== 'undefined' ? window : globalThis);
