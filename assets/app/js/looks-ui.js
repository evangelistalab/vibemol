(function (global) {
  'use strict';
  const LIBRARY_KEY = 'vibemol.looks.v1', DEFAULT_KEY = 'vibemol.defaultLook.v1', MATERIAL_KEY = 'vibemol.materials.v1';
  const MAX_ENTRIES = 50, clone = value => JSON.parse(JSON.stringify(value));
  function createController(deps) {
    const L = global.VibeMolLooks, M = global.VibeMolAppearanceModel, root = deps.root, references = deps.references;
    if (!root) return null;
    let library = [], materials = [], defaultLook = null, undoState = null, transaction = null, naming = null, syncPending = false, editor;
    let storageMessage = '';
    function read(key) { try { return JSON.parse(global.localStorage.getItem(key) || 'null'); } catch { return null; } }
    function persist() {
      try {
        global.localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
        global.localStorage.setItem(MATERIAL_KEY, JSON.stringify(materials));
        if (defaultLook) global.localStorage.setItem(DEFAULT_KEY, JSON.stringify(defaultLook));
        else global.localStorage.removeItem(DEFAULT_KEY);
        storageMessage = ''; return true;
      } catch { storageMessage = 'Browser storage is unavailable. Export your look or material to keep it.'; return false; }
    }
    const userId = () => `user-${global.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    const name = value => { const result = String(value || '').trim(); if (!result || result.length > 60) throw new Error('Enter a name of 1–60 characters.'); return result; };
    const filename = value => value.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    for (const item of (Array.isArray(read(LIBRARY_KEY)) ? read(LIBRARY_KEY) : []).slice(0, MAX_ENTRIES)) {
      try { const look = L.normalizeLook(item); if (look.id.startsWith('user-') && !library.some(saved => saved.id === look.id)) library.push(look); } catch { /* Keep other valid entries. */ }
    }
    for (const item of (Array.isArray(read(MATERIAL_KEY)) ? read(MATERIAL_KEY) : []).slice(0, MAX_ENTRIES)) {
      try { if (item.id.startsWith('user-') && !materials.some(saved => saved.id === item.id)) materials.push({ id: item.id, name: name(item.name), material: M.validateMaterial(item.material) }); } catch { /* Keep other valid entries. */ }
    }
    try { if (read(DEFAULT_KEY)) defaultLook = L.normalizeLook(read(DEFAULT_KEY)); } catch { /* Ignore an invalid default. */ }
    // Preserve the startup snapshot as its own recipe when its old id now
    // names different settings (an edited legacy default or updated user look).
    const defaultSource = defaultLook && [...L.builtins, ...library].find(look => look.id === defaultLook.id);
    if (defaultSource && !L.equal(defaultSource.settings, defaultLook.settings)) {
      defaultLook.id = userId(); persist();
    }
    references.setLibrary(library); deps.initializeReferences();
    root.innerHTML = `
      <section class="vm-appearance-section" id="lookPresetSection"><h3 class="vm-section-label">Looks</h3>
        <div class="vm-field-row"><label class="vm-field-label" for="lookPreset">Style</label><div class="vm-field-control"><select id="lookPreset" class="vm-select" data-tooltip="Apply geometry, material, lighting and contours; keep the current color scheme."><option value="">Custom</option></select></div></div>
        <div class="vm-field-row"><label class="vm-field-label" for="lookColorPreset">Color scheme</label><div class="vm-field-control"><select id="lookColorPreset" class="vm-select" data-tooltip="Apply atom, bond, orbital and background colors; keep the current style."></select></div></div>
        <p class="vm-session-status">Tiles apply a complete look. Use Style and Color scheme to mix them.</p>
        <div id="lookGallery" class="vm-look-gallery" role="group" aria-label="Preset previews"></div>
        <div class="vm-field-row" id="lookSavedRow"><label class="vm-field-label" for="lookSaved">My looks</label><div class="vm-field-control"><select id="lookSaved" class="vm-select"><option value="">Choose saved look</option></select></div></div>
        <p class="vm-stat-label" id="lookCurrentName"></p>
        <div class="vm-popover__actions"><button id="lookUndo" class="vm-btn vm-btn--ghost vm-btn--sm" type="button" disabled>Undo</button><button id="lookRevert" class="vm-btn vm-btn--ghost vm-btn--sm" type="button" disabled>Revert</button><button id="lookSave" class="vm-btn vm-btn--ghost vm-btn--sm" type="button">Save as new</button></div>
        <div id="lookNameForm" hidden><div class="vm-field-row"><label class="vm-field-label" for="lookNameInput">Look name</label><div class="vm-field-control"><input id="lookNameInput" type="text" maxlength="60" autocomplete="off"></div></div><div class="vm-popover__actions"><button id="lookNameConfirm" class="vm-btn vm-btn--ghost vm-btn--sm" type="button">Save</button><button id="lookNameCancel" class="vm-btn vm-btn--ghost vm-btn--sm" type="button">Cancel</button></div></div>
        <details id="lookSaveDetails"><summary class="inspectorSubsectionSummary"><span class="vm-section-label">Save & share</span></summary>
          <div class="vm-popover__actions"><button id="lookUpdate" class="vm-btn vm-btn--ghost vm-btn--sm" type="button" disabled>Update saved</button><button id="lookRename" class="vm-btn vm-btn--ghost vm-btn--sm" type="button" disabled>Rename</button><button id="lookDelete" class="vm-btn vm-btn--ghost vm-btn--sm" type="button" disabled>Delete</button></div>
          <div class="vm-popover__actions"><button id="lookExport" class="vm-btn vm-btn--ghost vm-btn--sm" type="button">Export look</button><button id="lookImport" class="vm-btn vm-btn--ghost vm-btn--sm" type="button">Import look</button></div>
          <div class="vm-popover__actions"><button id="lookDefault" class="vm-btn vm-btn--ghost vm-btn--sm" type="button">Set as default</button><button id="lookClearDefault" class="vm-btn vm-btn--ghost vm-btn--sm" type="button" hidden>Use last appearance</button></div>
          <p id="lookDefaultStatus" class="vm-session-status"></p><input id="lookFileInput" type="file" accept=".json,application/json" hidden>
        </details><p id="lookStatus" class="vm-session-status" role="status" aria-live="polite"></p>
      </section><div id="lookComponentEditor"></div>`;
    const $ = id => root.querySelector('#' + id), state = () => references.project(deps.captureSettings());
    const managedLook = () => {
      const refs = references.get();
      return [refs.styleRef, refs.colorsRef].map(ref => ref?.kind === 'user' ? library.find(look => look.id === ref.id) : null).find(Boolean);
    };
    const libraryChanged = () => { references.setLibrary(library); persist(); deps.referencesChanged(); };
    const builtinLooks = L.builtins.filter(item => !item.experimental).sort((a, b) => a.name.localeCompare(b.name));
    for (const look of builtinLooks) {
      $('lookPreset').add(new Option(look.name,look.id));
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'vm-look-card'; card.dataset.look = look.id;
      card.setAttribute('aria-pressed', 'false'); card.setAttribute('aria-label', look.name + ' preset');
      const preview = document.createElement('img'); preview.src = `assets/app/img/looks/studio-${look.id}.png`;
      preview.alt = ''; preview.width = 240; preview.height = 160; preview.draggable = false;
      const label = document.createElement('span'); label.textContent = look.name;
      card.append(preview, label); card.addEventListener('click', () => run(() => choose(look, { includeColors: true, message: `${look.name} applied.` })));
      $('lookGallery').append(card);
    }
    const referenceRows = ['style', 'colors'].map(axis => {
      const row = $(axis === 'style' ? 'lookPreset' : 'lookColorPreset').closest('.vm-field-row');
      row.classList.add('vm-style-property');
      const reset = document.createElement('button'); reset.type = 'button'; reset.id = axis === 'style' ? 'lookStyleReset' : 'lookColorsReset';
      reset.className = 'vm-btn vm-btn--icon vm-property-reset'; reset.hidden = true;
      reset.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">restart_alt</span>';
      reset.onclick = () => edit('reset-' + axis, 'change', () => deps.resetReference(axis)); row.append(reset);
      return { row, reset, axis };
    });
    const status = message => { $('lookStatus').textContent = storageMessage || message; };
    const run = action => { try { return action(); } catch (error) { status(error.message); return null; } };
    const snapshotLook = (label, id = userId()) => L.normalizeLook({ id, name: label, settings: deps.captureSettings() });
    function choose(look, { includeColors = false, message } = {}) {
      const before = deps.captureUndo(); deps.applyLook(L.normalizeLook(look), { includeColors }); undoState = before; transaction = null;
      sync(); status(message || (includeColors ? `${look.name} appearance restored.` : `${look.name} style applied. Colors kept.`));
    }
    function chooseColors(look) {
      edit('color-scheme', 'change', () => deps.applyColors(L.normalizeLook(look)));
    }
    function edit(key, phase, action) {
      run(() => {
        const before = transaction === key ? null : deps.captureUndo();
        const changed = action(); if (before && changed !== false) undoState = before;
        transaction = phase === 'input' && (transaction === key || changed !== false) ? key : null;
        if (changed !== false) { sync(); status('Appearance adjusted.'); }
      });
    }
    function sync() {
      syncPending = false;
      const view = state(), modified = view.styleModified || view.colorsModified, managed = managedLook();
      const savedPair = L.sameReference(view.styleRef, view.colorsRef) && view.styleRef.kind === 'user'
        && library.find(look => look.id === view.styleRef.id);
      $('lookCurrentName').textContent = view.label;
      for (const [selector, ref] of [[$('lookPreset'), view.styleRef], [deps.presetSelect, view.styleRef], [$('lookColorPreset'), view.colorsRef]]) {
        if (!selector) continue;
        const custom = new Option('Custom', ''); custom.disabled = true;
        const options = [custom, ...builtinLooks.map(item => new Option(item.name, item.id))];
        if (library.length) {
          const savedGroup = document.createElement('optgroup'); savedGroup.label = 'My looks';
          for (const item of [...library].sort((a, b) => a.name.localeCompare(b.name))) savedGroup.append(new Option(item.name, item.id));
          options.push(savedGroup);
        }
        selector.replaceChildren(...options);
        if (ref && !Array.from(selector.options).some(option => option.value === ref.id)) {
          const option = new Option(references.resolve(ref)?.name || ref.id, ref.id); option.disabled = true; selector.add(option);
        }
        selector.value = ref?.id || '';
      }
      $('lookUndo').disabled = !undoState; $('lookRevert').disabled = !modified;
      $('lookUpdate').disabled = !savedPair || !modified; $('lookRename').disabled = !managed; $('lookDelete').disabled = !managed;
      for (const [id, action] of [['lookRename', 'Rename'], ['lookDelete', 'Delete']]) {
        $(id).setAttribute('data-tooltip', managed ? `${action} ${managed.name} in My looks. Current appearance is kept.` : 'Choose a saved look to manage.');
      }
      $('lookSavedRow').hidden = !library.length;
      $('lookSaved').replaceChildren(new Option('Choose saved look', ''));
      for (const item of library) $('lookSaved').add(new Option(item.name, item.id));
      $('lookSaved').value = managed?.id || '';
      for (const card of $('lookGallery').children) card.setAttribute('aria-pressed',
        String($('lookPreset').value === card.dataset.look && $('lookColorPreset').value === card.dataset.look));
      for (const { row, reset, axis } of referenceRows) {
        const changed = view[axis + 'Modified'], look = references.resolve(view[axis + 'Ref']);
        row.dataset.styleState = changed ? 'modified' : 'inherited'; reset.hidden = !changed;
        const description = axis === 'style' ? `Discard style edits and return to ${look?.name || 'the style'}.`
          : `Discard color edits and return to ${look?.name || 'the scheme'} colors.`;
        reset.setAttribute('aria-label', description); reset.setAttribute('data-tooltip', description);
      }
      $('lookDefaultStatus').textContent = defaultLook ? `New sessions start with ${defaultLook.name}.` : 'New sessions use your last appearance.';
      $('lookClearDefault').hidden = !defaultLook;
      editor?.sync();
    }
    function scheduleSync() { if (!syncPending) { syncPending = true; queueMicrotask(sync); } }
    function beginName(mode) {
      naming = mode; $('lookNameForm').hidden = false;
      $('lookNameInput').value = mode === 'rename' ? managedLook().name : `My ${state().label}`.slice(0, 60);
      $('lookNameConfirm').textContent = mode === 'rename' ? 'Rename' : 'Save';
      $('lookNameInput').focus(); $('lookNameInput').select();
    }
    function saveName() {
      if (naming !== 'rename' && library.length >= MAX_ENTRIES) throw new Error('The library holds 50 looks. Delete one before saving another.');
      const look = snapshotLook(name($('lookNameInput').value), naming === 'rename' ? managedLook().id : userId());
      if (naming === 'rename') {
        look.settings = clone(library.find(item => item.id === look.id).settings);
        library = library.map(item => item.id === look.id ? look : item);
        if (defaultLook?.id === look.id) defaultLook.name = look.name;
      } else { undoState = deps.captureUndo(); transaction = null; library.push(look); references.select(look); }
      libraryChanged(); $('lookNameForm').hidden = true; naming = null; sync();
      status(`${look.name} saved. Orbital overrides stay in your session.`);
    }
    $('lookPreset').onchange = () => run(() => { const look = [...L.builtins, ...library].find(item => item.id===$('lookPreset').value); if (look) choose(look); });
    if (deps.presetSelect) deps.presetSelect.onchange = () => run(() => {
      const look = [...builtinLooks, ...library].find(item => item.id === deps.presetSelect.value);
      if (look) choose(look);
    });
    deps.presetSelect?.setAttribute('data-tooltip', 'Apply a style while keeping colors. Color schemes are available in Style Studio.');
    $('lookSaved').onchange = () => run(() => { const look = library.find(item => item.id === $('lookSaved').value); if (look) choose(look, { includeColors: true, message: `${look.name} applied.` }); });
    $('lookColorPreset').onchange = () => run(() => {
      const look = [...builtinLooks, ...library].find(item => item.id === $('lookColorPreset').value);
      if (look) chooseColors(look);
    });
    $('lookSave').onclick = () => beginName('new'); $('lookRename').onclick = () => beginName('rename');
    $('lookNameCancel').onclick = () => { $('lookNameForm').hidden = true; naming = null; $('lookSave').focus(); };
    $('lookNameConfirm').onclick = () => run(saveName);
    $('lookNameInput').onkeydown = event => { if (['Enter','Escape'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); if (event.key === 'Enter') run(saveName); else $('lookNameCancel').click(); } };
    $('lookUndo').onclick = () => run(() => { if (!undoState) return; deps.restoreUndo(undoState); undoState = null; transaction = null; sync(); status('Previous appearance restored.'); });
    $('lookRevert').onclick = () => { edit('revert', 'change', () => deps.resetReference()); status(`${state().label} appearance restored.`); };
    $('lookRevert').setAttribute('data-tooltip', 'Discard edits to the selected style and color scheme. Undo restores the previous appearance.');
    $('lookUpdate').onclick = () => run(() => {
      const view = state();
      if (!L.sameReference(view.styleRef, view.colorsRef) || view.styleRef.kind !== 'user') return;
      const saved = library.find(look => look.id === view.styleRef.id); if (!saved || !(view.styleModified || view.colorsModified)) return;
      const look = snapshotLook(saved.name, saved.id); library = library.map(item => item.id === look.id ? look : item);
      libraryChanged(); sync(); status('Saved look updated. Set as default again to update the startup default.');
    });
    $('lookDelete').onclick = () => run(() => {
      const look = managedLook(); if (!look) return;
      library = library.filter(item => item.id !== look.id); if (defaultLook?.id === look.id) defaultLook = null;
      references.remove(look.id); undoState = null; transaction = null;
      libraryChanged(); sync(); status('Saved look deleted. Current appearance kept.');
    });
    $('lookDefault').onclick = () => run(() => {
      const view = state(), live = deps.captureSettings();
      const look = L.sameReference(view.styleRef, view.colorsRef) && references.resolve(view.styleRef);
      defaultLook = look && L.equal(live, look.settings) ? clone(look) : snapshotLook(view.label.slice(0, 60));
      persist(); sync(); status('Default saved for new sessions.');
    });
    $('lookClearDefault').onclick = () => { defaultLook = null; persist(); sync(); status('New sessions will use your last appearance.'); };
    $('lookExport').onclick = () => run(() => {
      const view = state(), look = snapshotLook(view.label.slice(0, 60), L.sameReference(view.styleRef, view.colorsRef) ? view.styleRef.id : userId());
      deps.download(L.exportLook(look), `${filename(look.name)}.look.json`); status('Look exported.');
    });
    $('lookImport').onclick = () => $('lookFileInput').click();
    $('lookFileInput').onchange = async () => {
      const file = $('lookFileInput').files[0]; $('lookFileInput').value = ''; if (!file) return;
      try {
        if (file.size > 128 * 1024) throw new Error('Look files must be smaller than 128 KB.');
        if (library.length >= MAX_ENTRIES) throw new Error('Delete a saved look before importing another.');
        importLook(L.importLook(JSON.parse(await file.text())));
      } catch (error) { status(error.message); }
    };
    function importLook(value) {
      if (library.length >= MAX_ENTRIES) throw new Error('Delete a saved look before importing another.');
      const look = L.normalizeLook({ ...value, id: userId() });
      choose(look, { includeColors: true }); library.push(look); libraryChanged(); sync(); status(`${look.name} imported and applied.`);
    }
    editor = global.VibeMolAppearanceEditor.createController({
      root: $('lookComponentEditor'), consolidated: deps.consolidated, showBindings: deps.showBindings, createSlider: deps.createSlider, captureSettings: deps.captureSettings,
      atomFields: deps.atomFields, bondFields: deps.bondFields, getAtomBaseRadius: deps.getAtomBaseRadius,
      getRendering: deps.getRendering, getBaseline: () => { const view = state(); return { name: view.label, settings: view.baseline }; },
      editBackgroundColor: deps.editBackgroundColor,
      editSettings: deps.editSettings, surfaceSelectionMode: deps.surfaceSelectionMode, editSurfaceSelection: deps.editSurfaceSelection, captureSurfaceSettings: deps.captureSurfaceSettings, hasSurfaceSelection: deps.hasSurfaceSelection,
      editSurfaceDefaults: deps.editSurfaceDefaults,
      resetSurfaceOverrides: deps.resetSurfaceOverrides, getSurfaceOverrideCounts: deps.getSurfaceOverrideCounts,
      surfaceColorSchemes: deps.surfaceColorSchemes, openElementColors: deps.openElementColors,
      edit: (section, patch, options, phase) => edit(JSON.stringify([section, Object.keys(patch), options]), phase, () => deps.editComponent(section, patch, options)),
      getMaterials: () => clone(materials),
      updateMaterial: (id, label, material) => run(() => {
        if (!materials.some(item => item.id === id)) throw new Error('Choose a saved material first.');
        const item = { id, name: name(label), material: M.validateMaterial(material) };
        materials = materials.map(old => old.id === id ? item : old); persist(); sync(); status(`${item.name} material updated.`);
      }),
      deleteMaterial: id => run(() => {
        materials = materials.filter(item => item.id !== id); persist(); sync(); status('Saved material deleted. Current appearance kept.');
      }),
      saveMaterial: (label, material) => run(() => {
        if (materials.length >= MAX_ENTRIES) throw new Error('The library holds 50 materials.');
        const item = { id: userId(), name: name(label), material: M.validateMaterial(material) };
        materials.push(item); persist(); sync(); status(`${item.name} material saved.`);
      }),
      exportMaterial: (label, material) => run(() => { deps.download({ kind: 'vibemol.material', version: 1, name: name(label), material: M.validateMaterial(material) }, `${filename(label)}.material.json`); status('Material exported.'); }),
      importMaterial: async file => {
        try {
          if (file.size > 128 * 1024) throw new Error('Material files must be smaller than 128 KB.');
          if (materials.length >= MAX_ENTRIES) throw new Error('The library holds 50 materials.');
          const data = JSON.parse(await file.text());
          if (data.kind !== 'vibemol.material' || data.version !== 1) throw new Error('Unsupported material file.');
          const item = { id: userId(), name: name(data.name), material: M.validateMaterial(data.material) };
          const before = deps.captureUndo(); deps.editComponent('material', item.material, { replace: true });
          undoState = before; transaction = null; materials.push(item); persist(); sync(); status(`${item.name} imported and applied.`);
        } catch (error) { status(error.message); }
      },
    });
    document.addEventListener('change', scheduleSync);
    sync(); if (defaultLook && deps.applyStartupDefault !== false) run(() => { deps.applyLook(defaultLook); sync(); });
    return Object.freeze({ sync, scheduleSync, choose, chooseColors, importLook, edit, getLibrary: () => clone(library), clearUndo: () => { undoState = null; transaction = null; scheduleSync(); } });
  }
  global.VibeMolLooksUi = Object.freeze({ createController });
})(window);
