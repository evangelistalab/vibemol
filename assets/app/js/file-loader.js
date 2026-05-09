(function (global) {
  'use strict';

  function createFileLoader(deps) {
    const fetchImpl = deps.fetchImpl || (typeof fetch === 'function' ? fetch.bind(global) : null);
    function isCubeDebugLoggingEnabled() {
      return !!(global && global.VIBEMOL_DEBUG_CUBE);
    }

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
      if (kind === 'xyz') {
        const detected = typeof deps.detectAndNormalizeXyzText === 'function'
          ? deps.detectAndNormalizeXyzText(text, { comment: String(name || '').trim() || 'Imported XYZ' })
          : null;
        return deps.parseXYZ(detected && detected.xyzText ? detected.xyzText : text);
      }
      if (kind === 'molden') return deps.parseMolden(text);
      if (kind === 'two_component_cube') return deps.parseTwoComponentCube(text);
      return deps.parseCube(text);
    }

    function isPrimaryFileKind(kind, parsedJson = null) {
      if (kind === 'xyz' || kind === 'molden' || kind === 'two_component_cube' || kind === 'cube' || kind === 'psi4_output') return true;
      if (kind === 'json') {
        return !!(
          parsedJson
          && typeof parsedJson === 'object'
          && !Array.isArray(parsedJson)
          && parsedJson.kind === deps.STRUCTURE_KIND
        );
      }
      return false;
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
      if (!isCubeDebugLoggingEnabled()) return;
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

    function preparePrimaryLoadTarget() {
      if (typeof deps.setVolumes === 'function') deps.setVolumes([]);
      if (typeof deps.setCurrentIndex === 'function') deps.setCurrentIndex(-1);
      if (typeof deps.clearSceneMeshes === 'function') deps.clearSceneMeshes();
      if (typeof deps.clearEditHistory === 'function') deps.clearEditHistory();
      return 0;
    }

    async function handleFiles(fileList, options = {}) {
      let arr = Array.from(fileList || []);
      if (arr.length === 0) return;
      const textCache = new Map();
      async function readFileText(file) {
        if (!textCache.has(file)) textCache.set(file, await file.text());
        return textCache.get(file);
      }
      async function tryHandleSceneDropDispatch() {
        const useSceneDispatch = !!(options.sceneDispatch || options.appendDroppedCubes);
        if (!useSceneDispatch || typeof deps.handleSceneDropRecords !== 'function') return false;
        const parsedItems = [];
        for (const f of arr) {
          const text = await readFileText(f);
          const name = f && f.name ? f.name : '';
          const fileKind = deps.detectInputFileKind(name, text);
          if (fileKind === 'cube' || fileKind === 'two_component_cube' || fileKind === 'molden' || fileKind === 'xyz') {
            const vol = parseVolumeByName(name, text);
            parsedItems.push({ file: f, name, text, fileKind, vol });
            continue;
          }
          if (fileKind === 'psi4_output' || deps.looksLikePsi4OutputText(text)) {
            const bundle = deps.parsePsi4OutputVibrationBundle(text, name || 'Psi4 output');
            parsedItems.push({
              file: f,
              name: name || 'Psi4 output',
              text,
              fileKind: 'psi4_output',
              vol: bundle.vol,
              vibrationPayload: bundle.payload,
              sourceStem: normalizeFileStem(name || 'Psi4 output'),
              forceNewScene: true,
            });
            continue;
          }
          return false;
        }
        if (!parsedItems.length) return false;
        return !!deps.handleSceneDropRecords(parsedItems, {
          resetIsoToDefault: parsedItems.some((item) => deps.hasVolumetricGrid(item.vol)),
          skipAutoIsoOnInitialRebuild: parsedItems.some((item) => deps.hasVolumetricGrid(item.vol)),
          targetSceneKey: options.targetSceneKey || '',
        });
      }
      async function tryHandleDroppedCubeAppend() {
        if (!options.appendDroppedCubes) return false;
        const cubeFiles = [];
        for (const f of arr) {
          const text = await readFileText(f);
          const name = f && f.name ? f.name : '';
          const fileKind = deps.detectInputFileKind(name, text);
          if (fileKind === 'cube' || fileKind === 'two_component_cube') {
            cubeFiles.push({ file: f, name, text, fileKind });
            continue;
          }
          let parsedJsonForPrimaryCheck = null;
          if (fileKind === 'json') {
            try { parsedJsonForPrimaryCheck = JSON.parse(text); } catch { }
          }
          if (isPrimaryFileKind(fileKind, parsedJsonForPrimaryCheck) || fileKind === 'psi4_output' || deps.looksLikePsi4OutputText(text)) {
            return false;
          }
        }
        if (!cubeFiles.length) return false;
        const existingVolumes = deps.getVolumes();
        const startIndex = existingVolumes.length;
        if (startIndex === 0) {
          preparePrimaryLoadTarget();
        } else {
          for (const record of existingVolumes) {
            if (!record || !deps.hasVolumetricGrid(record.vol)) continue;
            record._sceneGraphLayerState = Object.assign({}, record._sceneGraphLayerState || {}, { visible: false });
          }
        }
        let loadedVolumetricCount = 0;
        const failures = [];
        let appendedCubeCount = 0;
        for (let i = 0; i < cubeFiles.length; i += 1) {
          const item = cubeFiles[i];
          try {
            const vol = parseVolumeByName(item.name, item.text);
            appendParsedVolumeRecord(item.name, vol, {
              inferBondOrders: true,
              _sceneGraphLayerState: { visible: appendedCubeCount === 0 },
            });
            appendedCubeCount++;
            if (deps.hasVolumetricGrid(vol)) loadedVolumetricCount++;
          } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            console.error('[File import] Failed to parse', item.name || '(unnamed file)', err);
            failures.push(`${item.name || 'Unknown file'}: ${msg}`);
          }
        }
        if (deps.getVolumes().length > startIndex) {
          finalizeLoadedVolumes(startIndex, {
            resetIsoToDefault: loadedVolumetricCount > 0,
            skipAutoIsoOnInitialRebuild: loadedVolumetricCount > 0,
          });
          const loadedNames = cubeFiles.slice(0, deps.getVolumes().length - startIndex).map((item) => item.name || 'cube');
          deps.setNavigationHint(`Added ${loadedNames.length} cube layer${loadedNames.length === 1 ? '' : 's'}: ${loadedNames.join(', ')}`);
        } else {
          deps.updateEmptyStateVisibility();
        }
        if (failures.length > 0) {
          const header = failures.length === 1
            ? 'Could not load one cube file due to invalid format:'
            : `Could not load ${failures.length} cube files due to invalid format:`;
          const popup = `${header}\n\n${failures.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;
          deps.setHintMessage(failures[0]);
          deps.alertUser(popup);
        }
        return true;
      }
      if (await tryHandleSceneDropDispatch()) return;
      if (await tryHandleDroppedCubeAppend()) return;
      if (options.appendDroppedCubes) {
        const withKind = [];
        for (let i = 0; i < arr.length; i += 1) {
          const f = arr[i];
          const text = await readFileText(f);
          const name = f && f.name ? f.name : '';
          const kind = deps.detectInputFileKind(name, text);
          let parsedJsonForPrimaryCheck = null;
          if (kind === 'json') {
            try { parsedJsonForPrimaryCheck = JSON.parse(text); } catch { }
          }
          const displaces = kind === 'xyz' || kind === 'molden' || kind === 'psi4_output'
            || deps.looksLikePsi4OutputText(text)
            || (kind === 'json' && isPrimaryFileKind(kind, parsedJsonForPrimaryCheck));
          withKind.push({ file: f, index: i, displaces });
        }
        if (withKind.some((item) => item.displaces)) {
          arr = withKind
            .slice()
            .sort((a, b) => (Number(b.displaces) - Number(a.displaces)) || (a.index - b.index))
            .map((item) => item.file);
        }
      }
      const failures = [];
      const skippedPrimaryNames = [];
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
      let loadedPrimaryCount = 0;
      for (const f of arr) {
        try {
          const text = await readFileText(f);
          const name = f && f.name ? f.name : '';
          const fileKind = deps.detectInputFileKind(name, text);
          let parsedJsonForPrimaryCheck = null;
          if (fileKind === 'json') {
            try { parsedJsonForPrimaryCheck = JSON.parse(text); } catch { }
          }
          if (fileKind === 'psi4_output' || deps.looksLikePsi4OutputText(text)) {
            if (loadedPrimaryCount > 0) {
              skippedPrimaryNames.push(name || 'Psi4 output');
              continue;
            }
            const bundle = deps.parsePsi4OutputVibrationBundle(text, name || 'Psi4 output');
            if (!hasPreparedTarget) {
              startIndex = preparePrimaryLoadTarget();
              hasPreparedTarget = true;
            }
            appendParsedVolumeRecord(name || 'Psi4 output', bundle.vol, { inferBondOrders: true });
            loadedPrimaryCount++;
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
            let parsedJson = parsedJsonForPrimaryCheck;
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
              if (loadedPrimaryCount > 0) {
                skippedPrimaryNames.push(name || 'structure');
                continue;
              }
              const imported = deps.parseStructureEnvelopeText(text, f.name || 'structure');
              if (!hasPreparedTarget) {
                startIndex = preparePrimaryLoadTarget();
                hasPreparedTarget = true;
              }
              appendParsedVolumeRecord(deps.getUniqueVolumeName(imported.name), imported.vol, Object.assign({}, imported.extras || {}, { skipBuilderExtensionMerge: true }));
              loadedPrimaryCount++;
              if (deps.hasVolumetricGrid(imported.vol)) loadedVolumetricCount++;
              loadedCount++;
              continue;
            }
          }
          if (isPrimaryFileKind(fileKind, parsedJsonForPrimaryCheck) && loadedPrimaryCount > 0) {
            skippedPrimaryNames.push(name || 'primary file');
            continue;
          }
          const vol = parseVolumeByName(f.name, text);
          if (!hasPreparedTarget) {
            startIndex = preparePrimaryLoadTarget();
            hasPreparedTarget = true;
          }
          appendParsedVolumeRecord(f.name, vol, { inferBondOrders: true });
          loadedPrimaryCount++;
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
        if (deps.getActiveTrajectoryInfo().enabled) deps.setTrajectoryPanelOpen(true, { auto: true });
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
      if (skippedPrimaryNames.length > 0) {
        const message = `Loaded the first primary file only. Skipped ${skippedPrimaryNames.length} additional primary file${skippedPrimaryNames.length === 1 ? '' : 's'}: ${skippedPrimaryNames.join(', ')}`;
        deps.setHintMessage(message);
        deps.alertUser(message);
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
      inputEl.addEventListener('change', (e) => handleFiles(e && e.target ? e.target.files : [], { sceneDispatch: true }));
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
      if (files && files.length > 0) void handleFiles(files, { appendDroppedCubes: true, sceneDispatch: true });
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
        if (typeof deps.handleSceneDropRecords === 'function') {
          const handled = deps.handleSceneDropRecords([{
            name: 'sample.cube',
            fileKind: 'cube',
            vol,
            extras: { isSample: true },
          }], {
            resetIsoToDefault: true,
            skipAutoIsoOnInitialRebuild: true,
          });
          if (handled) {
            deps.setNavigationHint('Loaded sample.cube', { includeStyles: true });
            return true;
          }
        }
        deps.setVolumes([]);
        deps.clearEditHistory();
        deps.getVolumes().push({ name: 'sample.cube', vol, isSample: true });
        if (vol.isoHint != null && (deps.getIsoInputValue() === '' || deps.getVolumes().length === 1)) {
          deps.setIsoInputValue(String(vol.isoHint));
        }
        if (isCubeDebugLoggingEnabled()) {
          try {
            const stats = deps.arrayMinMax(vol.data);
            console.log('[CUBE] Loaded sample.cube', { title: vol.title, nxyz: vol.nxyz, origin: vol.origin, axes: vol.axes, natoms: vol.natoms, isoHint: vol.isoHint, min: stats.min, max: stats.max });
          } catch (err) {
            console.warn('[CUBE] Stats failed for sample.cube', err);
          }
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
        if (typeof deps.handleSceneDropRecords === 'function') {
          const handled = deps.handleSceneDropRecords(records.map((item) => ({
            name: item.name,
            fileKind: item.vol && item.vol.isTwoComponent ? 'two_component_cube' : 'cube',
            vol: item.vol,
            extras: { isSample: true },
          })), {
            resetIsoToDefault: records.some((item) => deps.hasVolumetricGrid(item.vol)),
            skipAutoIsoOnInitialRebuild: records.some((item) => deps.hasVolumetricGrid(item.vol)),
          });
          if (handled) {
            deps.setNavigationHint(`Loaded ${label}`, { includeStyles: true });
            return true;
          }
        }
        deps.setVolumes([]);
        deps.setCurrentIndex(-1);
        deps.clearSceneMeshes();
        deps.clearEditHistory();
        for (let i = 0; i < records.length; i += 1) {
          const item = records[i];
          appendParsedVolumeRecord(item.name, item.vol, {
            isSample: true,
            inferBondOrders: true,
            _sceneGraphLayerState: { visible: i === 0 },
          });
        }
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
