(function (global) {
  'use strict';

  function createFileLoader(deps) {
    const fetchImpl = deps.fetchImpl || (typeof fetch === 'function' ? fetch.bind(global) : null);

    function normalizeFileStem(name) {
      const raw = String(name || '').trim();
      if (!raw) return '';
      const leaf = raw.split(/[\\/]/).pop() || '';
      const lower = leaf.toLowerCase();
      const suffixes = [
        '.vib.json',
        '.vmodes.json',
        '.modes.json',
        '.2ccube',
        '.output',
        '.cube',
        '.hess',
        '.xyz',
        '.cub',
        '.out',
        '.dat',
        '.json',
      ];
      for (const suffix of suffixes) {
        if (lower.endsWith(suffix) && lower.length > suffix.length) return lower.slice(0, -suffix.length);
      }
      const dot = lower.lastIndexOf('.');
      return dot > 0 ? lower.slice(0, dot) : lower;
    }

    function parseVolumeByName(name, text) {
      const kind = deps.detectInputFileKind(name, text);
      if (kind === 'xyz') return deps.parseXYZ(text);
      if (kind === 'molden') return deps.parseMolden(text);
      if (kind === 'two_component_cube') return deps.parseTwoComponentCube(text);
      return deps.parseCube(text);
    }

    function appendParsedVolumeRecord(name, vol, extras = null) {
      const meta = Object.assign({ name, vol }, extras || {});
      if (vol && vol.isTwoComponent) deps.setVolume2CComponent(meta, deps.getGlobal2CComponentMode());
      if (vol) {
        deps.ensureVolumeSchema(vol, { inferBondOrders: !!(extras && extras.inferBondOrders) });
        const builderMap = deps.getBuilderFragmentOpsByFileFromExtensions();
        const fileKey = String(name || '').trim();
        const skipBuilderExtensionMerge = !!(extras && extras.skipBuilderExtensionMerge);
        if (!skipBuilderExtensionMerge && fileKey && Array.isArray(builderMap[fileKey])) {
          vol.fragmentOps = deps.cloneJsonLike(builderMap[fileKey]) || [];
        } else if (!Array.isArray(vol.fragmentOps)) {
          vol.fragmentOps = [];
        }
        deps.pruneBuilderOperationsForVolume(vol);
      }
      deps.getVolumes().push(meta);
      if (vol && vol.isoHint != null && deps.getIsoInputValue() === '') deps.setIsoInputValue(String(vol.isoHint));
      if (vol && vol.kind === 'molden') {
        console.log('[MOLDEN] Loaded', name, {
          title: vol.title,
          natoms: vol.natoms,
          units: vol.units,
          moCount: vol.molden && vol.molden.moCount,
          basisCount: vol.molden && vol.molden.basisCount,
        });
      } else if (vol && vol.data && vol.data.length) {
        try {
          const stats = deps.arrayMinMax(vol.data);
          console.log('[CUBE] Loaded', name, {
            title: vol.title,
            nxyz: vol.nxyz,
            origin: vol.origin,
            axes: vol.axes,
            natoms: vol.natoms,
            isoHint: vol.isoHint,
            min: stats.min,
            max: stats.max,
          });
        } catch (err) {
          console.warn('[CUBE] Stats failed for', name, err);
        }
      } else {
        console.log('[XYZ] Loaded', name, { natoms: vol ? vol.natoms : 0 });
      }
    }

    function finalizeLoadedVolumes(startIndex, options = {}) {
      const resetIsoToDefault = !!options.resetIsoToDefault;
      const skipAutoIsoOnInitialRebuild = !!options.skipAutoIsoOnInitialRebuild;
      const volumes = deps.getVolumes();
      if (volumes.length > 0) {
        if (resetIsoToDefault) deps.setIsoInputValue(deps.formatIsoInputValue(deps.DEFAULT_ISO_VALUE));
        deps.activateVolumeIndex(startIndex, { skipAutoIso: skipAutoIsoOnInitialRebuild });
      } else {
        deps.syncActiveVolumeControls();
        deps.updateEmptyStateVisibility();
      }
    }

    async function handleFiles(fileList) {
      const arr = Array.from(fileList || []);
      if (arr.length === 0) return;
      const failures = [];
      const pendingVibrationPayloads = [];
      const importedPresetNames = [];
      const batchXyzStems = new Set();
      for (const f of arr) {
        const name = f && f.name ? f.name : '';
        if (deps.detectInputFileKind(name, '') !== 'xyz') continue;
        const stem = normalizeFileStem(name);
        if (stem) batchXyzStems.add(stem);
      }
      const missingOrcaHessCompanions = [];
      for (const f of arr) {
        const name = f && f.name ? String(f.name) : '';
        if (!/\.hess$/iu.test(name)) continue;
        const hessStem = normalizeFileStem(name);
        if (!hessStem || !batchXyzStems.has(hessStem)) missingOrcaHessCompanions.push(name || 'ORCA Hessian');
      }
      if (missingOrcaHessCompanions.length > 0) {
        const header = missingOrcaHessCompanions.length === 1 ? 'ORCA .hess warning:' : 'ORCA .hess warnings:';
        const body = missingOrcaHessCompanions
          .map((name, idx) => `${idx + 1}. ${name}: for ORCA vibrational imports, upload both the .xyz and .hess files together (same base name).`)
          .join('\n');
        deps.alertUser(`${header}\n\n${body}`);
      }
      let hasPreparedTarget = false;
      let startIndex = -1;
      let loadedCount = 0;
      let loadedVolumetricCount = 0;
      for (const f of arr) {
        try {
          const text = await f.text();
          const name = f && f.name ? f.name : '';
          const fileKind = deps.detectInputFileKind(name, text);
          if (fileKind === 'psi4_output' || deps.looksLikePsi4OutputText(text)) {
            const bundle = deps.parsePsi4OutputVibrationBundle(text, name || 'Psi4 output');
            if (!hasPreparedTarget) {
              deps.clearPlaceholderVolumesForUserLoad();
              startIndex = deps.getVolumes().length;
              hasPreparedTarget = true;
            }
            appendParsedVolumeRecord(name || 'Psi4 output', bundle.vol, { inferBondOrders: true });
            loadedCount++;
            pendingVibrationPayloads.push({
              name: name || 'Psi4 output',
              payload: bundle.payload,
              preferredIndex: deps.getVolumes().length - 1,
              sourceStem: normalizeFileStem(name || 'Psi4 output'),
            });
            continue;
          }
          if (fileKind === 'orca_hess') {
            const hessStem = normalizeFileStem(name || '');
            if (!hessStem || !batchXyzStems.has(hessStem)) {
              failures.push(`${name || 'ORCA Hessian'}: ORCA .hess requires both the .xyz and .hess files in the same upload batch (same base name).`);
              continue;
            }
            const bundle = deps.parseOrcaHessianVibrationBundle(text, name || 'ORCA Hessian');
            pendingVibrationPayloads.push({
              name: name || 'ORCA Hessian',
              payload: bundle.payload,
              sourceStem: hessStem,
            });
            continue;
          }
          const explicitVibrationFile = fileKind === 'vibration_payload';
          if (explicitVibrationFile) {
            const payload = deps.parseVibrationPayload(text, f.name || 'vibration payload');
            pendingVibrationPayloads.push({
              name: f.name || 'vibration payload',
              payload,
              sourceStem: normalizeFileStem(f.name || 'vibration payload'),
            });
            continue;
          }
          if (fileKind === 'json') {
            let parsedJson = null;
            try { parsedJson = JSON.parse(text); } catch { }
            const looksLikeVibration = !!(
              parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)
              && (parsedJson.kind === deps.VIBRATION_KIND || Array.isArray(parsedJson.modes) || Array.isArray(parsedJson.vibrations))
            );
            if (looksLikeVibration) {
              const payload = deps.parseVibrationPayload(text, f.name || 'vibration payload');
              pendingVibrationPayloads.push({
                name: f.name || 'vibration payload',
                payload,
                sourceStem: normalizeFileStem(f.name || 'vibration payload'),
              });
              continue;
            }
            const looksLikePreset = !!(
              parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson) && parsedJson.kind === deps.PRESET_KIND
            );
            if (looksLikePreset) {
              const result = deps.importPresetFromText(text, f.name || 'preset');
              importedPresetNames.push(result.name);
              continue;
            }
            const looksLikeStructure = !!(
              parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson) && parsedJson.kind === deps.STRUCTURE_KIND
            );
            if (looksLikeStructure) {
              const imported = deps.parseStructureEnvelopeText(text, f.name || 'structure');
              if (!hasPreparedTarget) {
                deps.clearPlaceholderVolumesForUserLoad();
                startIndex = deps.getVolumes().length;
                hasPreparedTarget = true;
              }
              appendParsedVolumeRecord(deps.getUniqueVolumeName(imported.name), imported.vol, Object.assign({}, imported.extras || {}, { skipBuilderExtensionMerge: true }));
              if (deps.hasVolumetricGrid(imported.vol)) loadedVolumetricCount++;
              loadedCount++;
              continue;
            }
          }
          const vol = parseVolumeByName(f.name, text);
          if (!hasPreparedTarget) {
            deps.clearPlaceholderVolumesForUserLoad();
            startIndex = deps.getVolumes().length;
            hasPreparedTarget = true;
          }
          appendParsedVolumeRecord(f.name, vol, { inferBondOrders: true });
          if (deps.hasVolumetricGrid(vol)) loadedVolumetricCount++;
          loadedCount++;
        } catch (err) {
          const msg = err && err.message ? err.message : String(err);
          console.error('[File import] Failed to parse', f && f.name ? f.name : '(unnamed file)', err);
          failures.push(`${f && f.name ? f.name : 'Unknown file'}: ${msg}`);
        }
      }
      if (loadedCount > 0 && startIndex >= 0) {
        finalizeLoadedVolumes(startIndex, {
          resetIsoToDefault: loadedVolumetricCount > 0,
          skipAutoIsoOnInitialRebuild: loadedVolumetricCount > 0,
        });
        if (deps.getActiveTrajectoryInfo().enabled) deps.setTrajectoryPanelOpen(true);
      } else {
        deps.updateEmptyStateVisibility();
      }
      let attachedVibrationCount = 0;
      for (const item of pendingVibrationPayloads) {
        const result = deps.attachVibrationPayloadToBestVolume(item.name, item.payload, {
          preferredIndex: item.preferredIndex,
          sourceStem: item.sourceStem,
        });
        if (!result.ok) {
          failures.push(`${item.name}: ${result.error || 'Could not attach vibration payload.'}`);
          continue;
        }
        attachedVibrationCount++;
      }
      if (attachedVibrationCount > 0) {
        deps.updateSidePanel();
        if (deps.getActiveVibrationInfo().enabled) deps.setVibrationPanelOpen(true);
        deps.setNavigationHint(`Loaded ${attachedVibrationCount} vibrational mode file${attachedVibrationCount === 1 ? '' : 's'}`);
      } else if (importedPresetNames.length > 0) {
        const label = importedPresetNames.length === 1
          ? `Loaded preset: ${importedPresetNames[0]}`
          : `Loaded ${importedPresetNames.length} preset files`;
        deps.setNavigationHint(label);
      }
      if (failures.length > 0) {
        const header = failures.length === 1
          ? 'Could not load one file due to invalid format:'
          : `Could not load ${failures.length} files due to invalid format:`;
        const popup = `${header}\n\n${failures.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;
        deps.setHintMessage(failures[0]);
        deps.alertUser(popup);
      }
    }

    function decodeBase64Bytes(raw) {
      const input = String(raw || '').replace(/\s+/g, '');
      const out = global.atob(input);
      const bytes = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
      return bytes;
    }

    function buildEmbeddedFile(record, index) {
      if (!record || typeof record !== 'object') throw new Error(`Embedded file entry ${index + 1} must be an object.`);
      const name = String(record.name || '').trim();
      if (!name) throw new Error(`Embedded file entry ${index + 1} is missing a valid "name".`);
      const mimeType = String(record.mimeType || 'text/plain');
      if (Object.prototype.hasOwnProperty.call(record, 'text')) {
        return new File([String(record.text == null ? '' : record.text)], name, { type: mimeType });
      }
      if (Object.prototype.hasOwnProperty.call(record, 'base64')) {
        return new File([decodeBase64Bytes(record.base64)], name, { type: mimeType });
      }
      throw new Error(`Embedded file "${name}" must include "text" or "base64" content.`);
    }

    function clearAllLoadedFiles(options = {}) {
      const includeHint = options.includeHint !== false;
      deps.setVolumes([]);
      deps.clearEditHistory();
      deps.activateVolumeIndex(-1, { rebuild: false, clearSceneWhenEmpty: true });
      if (includeHint) deps.setNavigationHint(deps.HINT_START, { includeStyles: true });
    }

    async function loadEmbeddedFiles(files, options = {}) {
      const arr = Array.isArray(files) ? files : [];
      if (arr.length === 0) throw new Error('No files were provided for embedded load.');
      const fileObjects = arr.map((entry, i) => buildEmbeddedFile(entry, i));
      const clearFirst = options.clearFirst !== false;
      if (clearFirst) clearAllLoadedFiles({ includeHint: false });
      const before = deps.getVolumes().length;
      await handleFiles(fileObjects);
      const loadedCount = Math.max(0, deps.getVolumes().length - before);
      return { ok: loadedCount > 0, loadedCount, loadedNames: fileObjects.map((f) => f.name) };
    }

    async function handleEmbeddedLoadMessage(event) {
      const data = event && event.data;
      if (!data || typeof data !== 'object' || data.type !== 'vibemol:load-files') return;
      const requestId = data.requestId || null;
      const source = event && event.source;
      const postResult = (payload) => {
        if (!source || typeof source.postMessage !== 'function') return;
        const targetOrigin = (event.origin && event.origin !== 'null') ? event.origin : '*';
        source.postMessage(Object.assign({ type: 'vibemol:load-files:result', requestId }, payload), targetOrigin);
      };
      try {
        const result = await loadEmbeddedFiles(data.files, data.options || {});
        postResult(result);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        postResult({ ok: false, error: message });
      }
    }

    function installEmbeddedMessageHandler(target = global) {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener('message', (event) => { void handleEmbeddedLoadMessage(event); });
    }

    function getPublicEmbedApi() {
      return Object.freeze({
        version: 1,
        loadFiles: (files, options = {}) => loadEmbeddedFiles(files, options),
      });
    }

    function installFileInput(inputEl) {
      if (!inputEl || typeof inputEl.addEventListener !== 'function') return;
      inputEl.addEventListener('change', (e) => handleFiles(e && e.target ? e.target.files : []));
    }

    function handleFileDragOver(e) {
      if (!e) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    }

    function handleFileDrop(e) {
      if (!e) return;
      e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) void handleFiles(files);
    }

    function installDragDrop(targets) {
      const list = Array.isArray(targets) ? targets : [targets];
      for (const target of list) {
        if (!target || typeof target.addEventListener !== 'function') continue;
        target.addEventListener('dragover', handleFileDragOver);
        target.addEventListener('drop', handleFileDrop);
      }
    }

    async function fetchText(path) {
      if (!fetchImpl) throw new Error('Fetch API is unavailable.');
      const resp = await fetchImpl(path, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`${path}: HTTP ${resp.status}`);
      return resp.text();
    }

    async function loadSampleCube() {
      try {
        const text = await fetchText('./assets/data/sample.cube');
        const vol = deps.parseCube(text);
        deps.setVolumes([]);
        deps.clearEditHistory();
        deps.getVolumes().push({ name: 'sample.cube', vol, isSample: true });
        if (vol.isoHint != null && (deps.getIsoInputValue() === '' || deps.getVolumes().length === 1)) {
          deps.setIsoInputValue(String(vol.isoHint));
        }
        try {
          const stats = deps.arrayMinMax(vol.data);
          console.log('[CUBE] Loaded sample.cube', { title: vol.title, nxyz: vol.nxyz, origin: vol.origin, axes: vol.axes, natoms: vol.natoms, isoHint: vol.isoHint, min: stats.min, max: stats.max });
        } catch (err) {
          console.warn('[CUBE] Stats failed for sample.cube', err);
        }
        deps.activateVolumeIndex(0);
        deps.setNavigationHint('Loaded sample.cube', { includeStyles: true });
        return true;
      } catch (err) {
        console.warn('[CUBE] Could not auto-load sample.cube:', err);
        return false;
      }
    }

    async function loadBundledVolumeSet(filePaths, label) {
      const paths = Array.isArray(filePaths) ? filePaths.filter(Boolean) : [];
      if (!paths.length) return false;
      try {
        const records = [];
        for (const path of paths) {
          const text = await fetchText(path);
          const name = String(path.split('/').pop() || path);
          const vol = parseVolumeByName(name, text);
          records.push({ name, vol });
        }
        deps.setVolumes([]);
        deps.setCurrentIndex(-1);
        deps.clearSceneMeshes();
        deps.clearEditHistory();
        for (const item of records) appendParsedVolumeRecord(item.name, item.vol, { isSample: true, inferBondOrders: true });
        finalizeLoadedVolumes(0, { resetIsoToDefault: true, skipAutoIsoOnInitialRebuild: true });
        deps.setNavigationHint(`Loaded ${label}`, { includeStyles: true });
        return true;
      } catch (err) {
        console.warn(`[CUBE] Could not load bundled dataset ${label}:`, err);
        return false;
      }
    }

    return Object.freeze({
      parseVolumeByName,
      appendParsedVolumeRecord,
      finalizeLoadedVolumes,
      handleFiles,
      buildEmbeddedFile,
      clearAllLoadedFiles,
      loadEmbeddedFiles,
      handleEmbeddedLoadMessage,
      installDragDrop,
      installFileInput,
      installEmbeddedMessageHandler,
      getPublicEmbedApi,
      loadSampleCube,
      loadBundledVolumeSet,
    });
  }

  global.VibeMolFileLoader = Object.freeze({ createFileLoader });
})(typeof window !== 'undefined' ? window : globalThis);
