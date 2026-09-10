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

    async function resolveXyzUnits(item) {
      const vol = item.vol;
      if (item.fileKind !== 'xyz' || !vol || !Array.isArray(vol.atoms) || vol.atoms.length < 2) return;
      if (deps.hasXyzBondCandidates(vol)) return;
      const frameNote = vol.trajectory ? ' The same conversion will apply to every trajectory frame.' : '';
      const convert = await deps.confirmUser(
        `No bonds were detected in "${item.name}" using angstrom coordinates.\n\n` +
        'These XYZ coordinates might be in bohr. Convert them to angstroms (1 bohr = 0.529177 angstrom)?' + frameNote +
        '\n\nOK: convert from bohr.\nCancel: keep the original coordinates as angstroms.'
      );
      if (!convert) return;
      for (const atom of vol.atoms) {
        atom.x *= deps.BOHR_TO_ANG;
        atom.y *= deps.BOHR_TO_ANG;
        atom.z *= deps.BOHR_TO_ANG;
      }
      for (const frame of (vol.trajectory && vol.trajectory.frames) || []) {
        for (let i = 0; i < frame.length; i++) frame[i] *= deps.BOHR_TO_ANG;
      }
      vol.units = 'angstrom';
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

    // All entrypoints share the same parse -> plan -> commit pipeline. Parsing is
    // side-effect free so a rejected replacement cannot erase a working scene.
    async function parseFiles(fileList, options = {}) {
      const plan = { primaries: [], sidecars: [], presets: [], sessions: [], failures: [] };
      for (const file of Array.from(fileList || [])) {
        const inputName = String(file && file.name || 'Unknown file');
        try {
          if (/\.vibemol-session$/i.test(inputName) && file.size > 512 * 1024 * 1024) {
            throw new Error('Session file exceeds the 512 MiB import limit.');
          }
          const text = await file.text();
          const fileKind = deps.detectInputFileKind(inputName, text);
          const item = { name: inputName, inputName, fileKind, sourceStem: normalizeFileStem(inputName) };
          const json = fileKind === 'json' ? JSON.parse(text) : null;
          if (fileKind === 'session' || (json && json.kind === 'vibemol.session')) {
            plan.sessions.push(Object.assign(item, { text }));
            continue;
          } else if (fileKind === 'psi4_output' || deps.looksLikePsi4OutputText(text)) {
            const bundle = deps.parsePsi4OutputVibrationBundle(text, inputName);
            Object.assign(item, { vol: bundle.vol, vibrationPayload: bundle.payload, forceNewScene: true });
          } else if (fileKind === 'orca_hess') {
            const bundle = deps.parseOrcaHessianVibrationBundle(text, inputName);
            plan.sidecars.push(Object.assign(item, { payload: bundle.payload, requiresXyz: true }));
            continue;
          } else if (fileKind === 'vibration_payload' || (json && (json.kind === deps.VIBRATION_KIND || Array.isArray(json.modes) || Array.isArray(json.vibrations)))) {
            plan.sidecars.push(Object.assign(item, { payload: deps.parseVibrationPayload(text, inputName) }));
            continue;
          } else if (json && json.kind === deps.PRESET_KIND) {
            plan.presets.push(Object.assign(item, { text }));
            continue;
          } else if (json && json.kind === deps.STRUCTURE_KIND) {
            const imported = deps.parseStructureEnvelopeText(text, inputName);
            Object.assign(item, {
              name: imported.name, vol: imported.vol, forceNewScene: true,
              extras: Object.assign({}, imported.extras, { skipBuilderExtensionMerge: true }),
            });
          } else {
            item.vol = parseVolumeByName(inputName, text);
          }
          item.extras = Object.assign({ inferBondOrders: true }, options.extras, item.extras);
          plan.primaries.push(item);
        } catch (err) {
          plan.failures.push(`${inputName}: ${err && err.message || err}`);
        }
      }
      const xyzStems = new Set(plan.primaries.filter(item => item.fileKind === 'xyz').map(item => item.sourceStem));
      plan.sidecars = plan.sidecars.filter(item => {
        if (!item.requiresXyz || xyzStems.has(item.sourceStem)) return true;
        plan.failures.push(`${item.name}: ORCA .hess requires both the .xyz and .hess files in the same upload batch (same base name).`);
        return false;
      });
      return plan;
    }

    async function commitFilePlan(plan, options = {}) {
      const { primaries, sidecars, presets, sessions = [], failures } = plan;
      const successful = new Set();
      const attempt = async (item, callback) => {
        try { await callback(); successful.add(item); }
        catch (err) { failures.push(`${item.inputName}: ${err && err.message || err}`); }
      };
      if (sessions.length) {
        if (sessions.length !== 1 || primaries.length || sidecars.length || presets.length || failures.length) {
          failures.push('Open one session file at a time. Add other files after the session opens.');
          primaries.length = 0;
          sidecars.length = 0;
          presets.length = 0;
        } else {
          await attempt(sessions[0], () => deps.importSessionText(sessions[0].text));
        }
      }
      if (primaries.length) {
        // Resolve units on staged XYZ data before replacement, bond inference,
        // scene-source registration, or vibration sidecar attachment.
        for (const item of primaries) await resolveXyzUnits(item);
        if (options.clearFirst === true) clearAllLoadedFiles({ includeHint: false });
        const hasGrid = primaries.some(item => deps.hasVolumetricGrid(item.vol));
        const commitOptions = {
          resetIsoToDefault: hasGrid,
          skipAutoIsoOnInitialRebuild: hasGrid,
          targetSceneKey: options.targetSceneKey || '',
        };
        if (typeof deps.handleSceneDropRecords === 'function') {
          try {
            const result = await deps.handleSceneDropRecords(primaries, commitOptions);
            if (!result) throw new Error('Could not add files to the scene.');
            for (const item of primaries) successful.add(item);
          } catch (err) {
            for (const item of primaries) failures.push(`${item.inputName}: ${err && err.message || err}`);
          }
        } else {
          const start = deps.getVolumes().length;
          for (const item of primaries) await attempt(item, () => {
            item.recordIndex = deps.getVolumes().length;
            appendParsedVolumeRecord(item.name, item.vol, item.extras);
          });
          if (deps.getVolumes().length > start) finalizeLoadedVolumes(start, commitOptions);
        }
        if (deps.getActiveTrajectoryInfo().enabled) deps.setTrajectoryPanelOpen(true, { auto: true });
      }
      for (const item of presets) await attempt(item, () => deps.importPresetFromText(item.text, item.name));
      const payloads = sidecars.concat(primaries.filter(item => successful.has(item) && item.vibrationPayload));
      let attached = 0;
      for (const item of payloads) {
        // A Psi4 file contributes one successful input, including its modes.
        successful.delete(item);
        await attempt(item, () => {
          const result = deps.attachVibrationPayloadToBestVolume(item.name, item.payload || item.vibrationPayload, {
            preferredIndex: item.recordIndex,
            sourceStem: item.sourceStem,
          });
          if (!result.ok) throw new Error(result.error || 'Could not attach vibration payload.');
          attached++;
        });
      }
      if (attached) {
        deps.updateSidePanel();
        if (deps.getActiveVibrationInfo().enabled) deps.setVibrationPanelOpen(true);
      }
      if (!successful.size) deps.updateEmptyStateVisibility();
      const loadedNames = Array.from(successful, item => item.inputName);
      if (loadedNames.length) deps.setNavigationHint(`Loaded ${loadedNames.length} file${loadedNames.length === 1 ? '' : 's'}`);
      if (failures.length) {
        deps.setHintMessage(failures[0]);
        deps.alertUser(`Could not load ${failures.length === 1 ? 'one file' : `${failures.length} files`}:\n\n${failures.map((failure, i) => `${i + 1}. ${failure}`).join('\n')}`);
      }
      return {
        ok: loadedNames.length > 0 && !failures.length,
        loadedCount: loadedNames.length,
        loadedNames,
        ...(failures.length ? { error: failures.join('\n'), failures: failures.slice() } : {}),
      };
    }

    let loadQueue = Promise.resolve();
    let pendingLoads = 0;
    function runExclusive(callback) {
      pendingLoads++;
      const next = loadQueue.then(callback).finally(() => { pendingLoads--; });
      loadQueue = next.catch(() => {});
      return next;
    }
    function handleFiles(fileList, options = {}) {
      const files = Array.from(fileList || []);
      return runExclusive(async () => commitFilePlan(await parseFiles(files, options), options));
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
      return handleFiles(fileObjects, Object.assign({}, options, { clearFirst: options.clearFirst !== false }));
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
      return loadBundledVolumeSet(['./assets/data/sample.cube'], 'sample.cube');
    }

    async function loadBundledVolumeSet(filePaths, label) {
      const paths = Array.isArray(filePaths) ? filePaths.filter(Boolean) : [];
      if (!paths.length) return false;
      try {
        const files = await Promise.all(paths.map(async path => new File(
          [await fetchText(path)], String(path.split('/').pop() || path), { type: 'text/plain' }
        )));
        const result = await handleFiles(files, { extras: { isSample: true } });
        if (result.ok) deps.setNavigationHint(`Loaded ${label}`, { includeStyles: true });
        return result.ok;
      } catch (err) {
        const message = `Could not load ${label}: ${err && err.message || err}`;
        deps.setHintMessage(message);
        deps.alertUser(message);
        return false;
      }
    }

    return Object.freeze({
      parseVolumeByName,
      appendParsedVolumeRecord,
      finalizeLoadedVolumes,
      parseFiles,
      commitFilePlan,
      handleFiles,
      runExclusive,
      whenIdle: () => loadQueue,
      isLoading: () => pendingLoads > 0,
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
