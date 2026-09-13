(function (global) {
  'use strict';
  const LIBRARY_KEY = 'vibemol.looks.v1', DEFAULT_KEY = 'vibemol.defaultLook.v1', MATERIAL_KEY = 'vibemol.materials.v1';
  const MAX_ENTRIES = 50, clone = value => JSON.parse(JSON.stringify(value));
  function createController(deps) {
    const L = global.VibeMolLooks, M = global.VibeMolAppearanceModel, root = deps.root;
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
    root.innerHTML = `
      <section class="vm-appearance-section" id="lookPresetSection"><h3 class="vm-section-label">Looks</h3>
        <div class="vm-field-row"><label class="vm-field-label" for="lookPreset">Preset</label><div class="vm-field-control"><select id="lookPreset" class="vm-select"><option value="">Custom / saved look</option></select></div></div>
        <div class="vm-field-row" id="lookSavedRow"><label class="vm-field-label" for="lookSaved">My looks</label><div class="vm-field-control"><select id="lookSaved" class="vm-select"><option value="">Choose saved look</option></select></div></div>
        <p class="vm-stat-label"><span id="lookCurrentName"></span> <span id="lookModified"></span></p>
        <div class="vm-popover__actions"><button id="lookUndo" class="vm-btn vm-btn--ghost vm-btn--sm" type="button" disabled>Undo</button><button id="lookRevert" class="vm-btn vm-btn--ghost vm-btn--sm" type="button" disabled>Revert</button><button id="lookSave" class="vm-btn vm-btn--ghost vm-btn--sm" type="button">Save as new</button></div>
        <div id="lookNameForm" hidden><div class="vm-field-row"><label class="vm-field-label" for="lookNameInput">Look name</label><div class="vm-field-control"><input id="lookNameInput" type="text" maxlength="60" autocomplete="off"></div></div><div class="vm-popover__actions"><button id="lookNameConfirm" class="vm-btn vm-btn--ghost vm-btn--sm" type="button">Save</button><button id="lookNameCancel" class="vm-btn vm-btn--ghost vm-btn--sm" type="button">Cancel</button></div></div>
        <details id="lookSaveDetails"><summary class="inspectorSubsectionSummary"><span class="vm-section-label">Save & share</span></summary>
          <div class="vm-popover__actions"><button id="lookUpdate" class="vm-btn vm-btn--ghost vm-btn--sm" type="button" disabled>Update saved</button><button id="lookRename" class="vm-btn vm-btn--ghost vm-btn--sm" type="button" disabled>Rename</button><button id="lookDelete" class="vm-btn vm-btn--ghost vm-btn--sm" type="button" disabled>Delete</button></div>
          <div class="vm-popover__actions"><button id="lookExport" class="vm-btn vm-btn--ghost vm-btn--sm" type="button">Export look</button><button id="lookImport" class="vm-btn vm-btn--ghost vm-btn--sm" type="button">Import look</button></div>
          <div class="vm-popover__actions"><button id="lookDefault" class="vm-btn vm-btn--ghost vm-btn--sm" type="button">Set as default</button><button id="lookClearDefault" class="vm-btn vm-btn--ghost vm-btn--sm" type="button" hidden>Use last appearance</button></div>
          <p id="lookDefaultStatus" class="vm-session-status"></p><input id="lookFileInput" type="file" accept=".json,application/json" hidden>
        </details><p id="lookStatus" class="vm-session-status" role="status" aria-live="polite"></p>
      </section><div id="lookComponentEditor"></div>`;
    const $ = id => root.querySelector('#' + id), current = () => deps.getActiveLook();
    for (const look of L.builtins.filter(item => !item.experimental).sort((a, b) => a.name.localeCompare(b.name))) $('lookPreset').add(new Option(look.name,look.id));
    const status = message => { $('lookStatus').textContent = storageMessage || message; };
    const run = action => { try { return action(); } catch (error) { status(error.message); return null; } };
    const snapshotLook = (label, id = userId()) => L.normalizeLook({ id, name: label, settings: deps.captureSettings() });
    function choose(look) {
      const before = deps.captureUndo(); deps.applyLook(L.normalizeLook(look)); undoState = before; transaction = null;
      sync(); status(`${look.name} applied.`);
    }
    function edit(key, phase, action) {
      run(() => {
        const before = transaction === key ? null : deps.captureUndo();
        const changed = action(); if (before && changed !== false) undoState = before;
        transaction = phase === 'input' ? key : null;
        if (changed !== false) { sync(); status('Appearance adjusted.'); }
      });
    }
    function sync() {
      syncPending = false;
      const look = current(), modified = !!look && (!L.equal(look.settings, deps.captureSettings()) || deps.hasMixedSurfaces());
      const saved = look && library.find(item => item.id === look.id);
      $('lookCurrentName').textContent = look?.name || 'Custom appearance';
      $('lookModified').textContent = modified ? '· Modified' : '';
      $('lookPreset').value = L.builtins.some(item => !item.experimental && item.id===look?.id) ? look.id : '';
      $('lookUndo').disabled = !undoState; $('lookRevert').disabled = !modified;
      $('lookUpdate').disabled = !saved || !modified; $('lookRename').disabled = !saved; $('lookDelete').disabled = !saved;
      $('lookSavedRow').hidden = !library.length;
      $('lookSaved').replaceChildren(new Option('Choose saved look', ''));
      for (const item of library) $('lookSaved').add(new Option(item.name, item.id));
      $('lookSaved').value = saved?.id || '';
      $('lookDefaultStatus').textContent = defaultLook ? `New sessions start with ${defaultLook.name}.` : 'New sessions use your last appearance.';
      $('lookClearDefault').hidden = !defaultLook;
      editor?.sync();
    }
    function scheduleSync() { if (!syncPending) { syncPending = true; queueMicrotask(sync); } }
    function beginName(mode) {
      naming = mode; $('lookNameForm').hidden = false;
      $('lookNameInput').value = mode === 'rename' ? current().name : `My ${current()?.name || 'look'}`;
      $('lookNameConfirm').textContent = mode === 'rename' ? 'Rename' : 'Save';
      $('lookNameInput').focus(); $('lookNameInput').select();
    }
    function saveName() {
      if (naming !== 'rename' && library.length >= MAX_ENTRIES) throw new Error('The library holds 50 looks. Delete one before saving another.');
      const look = snapshotLook(name($('lookNameInput').value), naming === 'rename' ? current().id : userId());
      if (naming === 'rename') {
        look.settings = clone(library.find(item => item.id === look.id).settings);
        library = library.map(item => item.id === look.id ? look : item); deps.setActiveLook({ ...current(), name: look.name });
        if (defaultLook?.id === look.id) defaultLook.name = look.name;
      } else { library.push(look); deps.setActiveLook(look); }
      persist(); $('lookNameForm').hidden = true; naming = null; sync();
      status(deps.hasMixedSurfaces() ? `${look.name} saved using the current orbital. Individual overrides stay in your session.` : `${look.name} saved.`);
    }
    $('lookPreset').onchange = () => run(() => { const look = L.builtins.find(item => item.id===$('lookPreset').value); if (look) choose(look); });
    $('lookSaved').onchange = () => run(() => { const look = library.find(item => item.id === $('lookSaved').value); if (look) choose(look); });
    $('lookSave').onclick = () => beginName('new'); $('lookRename').onclick = () => beginName('rename');
    $('lookNameCancel').onclick = () => { $('lookNameForm').hidden = true; naming = null; $('lookSave').focus(); };
    $('lookNameConfirm').onclick = () => run(saveName);
    $('lookNameInput').onkeydown = event => { if (['Enter','Escape'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); if (event.key === 'Enter') run(saveName); else $('lookNameCancel').click(); } };
    $('lookUndo').onclick = () => run(() => { if (!undoState) return; deps.restoreUndo(undoState); undoState = null; transaction = null; sync(); status('Previous appearance restored.'); });
    $('lookRevert').onclick = () => run(() => choose(current()));
    $('lookUpdate').onclick = () => run(() => {
      const look = snapshotLook(current().name, current().id); library = library.map(item => item.id === look.id ? look : item);
      deps.setActiveLook(look); persist(); sync(); status('Saved look updated. Set as default again to update the startup default.');
    });
    $('lookDelete').onclick = () => run(() => {
      const id = current().id; library = library.filter(item => item.id !== id); if (defaultLook?.id === id) defaultLook = null;
      deps.setActiveLook(null); persist(); sync(); status('Saved look deleted. Current appearance kept.');
    });
    $('lookDefault').onclick = () => run(() => { defaultLook = snapshotLook(current()?.name || 'Custom appearance', current()?.id || userId()); persist(); sync(); status('Default saved for new sessions.'); });
    $('lookClearDefault').onclick = () => { defaultLook = null; persist(); sync(); status('New sessions will use your last appearance.'); };
    $('lookExport').onclick = () => run(() => { const look = snapshotLook(current()?.name || 'My look', current()?.id || userId()); deps.download(L.exportLook(look), `${filename(look.name)}.look.json`); status('Look exported.'); });
    $('lookImport').onclick = () => $('lookFileInput').click();
    $('lookFileInput').onchange = async () => {
      const file = $('lookFileInput').files[0]; $('lookFileInput').value = ''; if (!file) return;
      try {
        if (file.size > 128 * 1024) throw new Error('Look files must be smaller than 128 KB.');
        if (library.length >= MAX_ENTRIES) throw new Error('Delete a saved look before importing another.');
        const look = L.importLook(JSON.parse(await file.text())); look.id = userId(); choose(look);
        library.push(look); persist(); sync(); status(`${look.name} imported and applied.`);
      } catch (error) { status(error.message); }
    };
    editor = global.VibeMolAppearanceEditor.createController({
      root: $('lookComponentEditor'), createSlider: deps.createSlider, captureSettings: deps.captureSettings,
      atomFields: deps.atomFields, bondFields: deps.bondFields, getAtomBaseRadius: deps.getAtomBaseRadius,
      getRendering: deps.getRendering, getActiveLook: current,
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
    if (!current()) {
      const initial = L.builtins.find(look => !look.experimental && L.equal(look.settings, deps.captureSettings()));
      if (initial) deps.setActiveLook(L.normalizeLook(initial));
    }
    sync(); if (defaultLook && deps.applyStartupDefault !== false) run(() => { deps.applyLook(defaultLook); sync(); });
    return Object.freeze({ sync, scheduleSync, choose, edit, getLibrary: () => clone(library), clearUndo: () => { undoState = null; transaction = null; scheduleSync(); } });
  }
  global.VibeMolLooksUi = Object.freeze({ createController });
})(window);
