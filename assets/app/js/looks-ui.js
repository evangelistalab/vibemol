(function (global) {
  'use strict';
  const LIBRARY_KEY = 'vibemol.looks.v1';
  const DEFAULT_KEY = 'vibemol.defaultLook.v1';
  const MAX_LOOKS = 50;
  const clone = value => JSON.parse(JSON.stringify(value));
  const imageBase = new URL('../img/looks/', document.currentScript.src);
  const imageUrl = name => new URL(name, imageBase).href;

  function createController(deps) {
    const L = global.VibeMolLooks, root = deps.root;
    if (!root) return null;
    let library = [], defaultLook = null, undoState = null, syncPending = false, naming = null;
    let storageMessage = '';
    function read(key) { try { return JSON.parse(global.localStorage.getItem(key) || 'null'); } catch { return null; } }
    function persist() {
      try {
        global.localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
        if (defaultLook) global.localStorage.setItem(DEFAULT_KEY, JSON.stringify(defaultLook));
        else global.localStorage.removeItem(DEFAULT_KEY);
        storageMessage = '';
        return true;
      } catch {
        storageMessage = 'Browser storage is unavailable. Export your look to keep it.';
        return false;
      }
    }
    const stored = read(LIBRARY_KEY);
    if (Array.isArray(stored)) for (const item of stored.slice(0, MAX_LOOKS)) {
      try {
        const look = L.normalizeLook(item);
        if (look.id.startsWith('user-') && !library.some(saved => saved.id === look.id)) library.push(look);
      } catch { /* Ignore an invalid local entry without discarding the rest. */ }
    }
    try { if (read(DEFAULT_KEY)) defaultLook = L.normalizeLook(read(DEFAULT_KEY)); } catch { /* Older or invalid default. */ }
    root.innerHTML = `
      <button id="looksBrowse" class="vm-looks-current" type="button" aria-expanded="false" aria-controls="looksGallery">
        <img id="lookCurrentThumbnail" alt="" hidden><span><small>LOOKS</small><strong id="lookCurrentName">Custom appearance</strong><span id="lookModified"></span></span><span aria-hidden="true">⌄</span>
      </button>
      <div id="looksGallery" class="vm-looks-gallery" hidden>
        <div class="vm-looks-tabs" role="group" aria-label="Look collection"><button type="button" data-collection="builtins" aria-pressed="true">Built-in</button><button type="button" data-collection="saved" aria-pressed="false">My looks</button></div>
        <div id="lookBuiltins" class="vm-looks-grid"></div><div id="lookSaved" class="vm-looks-grid" hidden></div>
        <p id="lookLibraryEmpty" hidden>Save a look to find it here.</p>
        <p class="vm-looks-caption">Built-in previews use the same molecule and view. Looks apply across the scene.</p>
      </div>
      <div class="vm-looks-actions"><button id="lookUndo" type="button" disabled>Undo look</button><button id="lookRevert" type="button" disabled>Revert</button><button id="lookSave" type="button">Save as new</button></div>
      <div id="lookNameForm" class="vm-looks-name" hidden><label for="lookNameInput">Look name</label><input id="lookNameInput" maxlength="60" autocomplete="off"><div class="vm-looks-actions"><button id="lookNameConfirm" type="button">Save</button><button id="lookNameCancel" type="button">Cancel</button></div></div>
      <div id="lookFinishPanel" class="vm-looks-finish" hidden>
        <div class="vm-looks-heading">Orbital finish</div>
        <select id="lookFinishScope" aria-label="Orbital finish scope"><option value="group">All orbitals in this molecule</option><option value="selected">Selected orbital only</option></select>
        <div class="vm-looks-finishes" role="group" aria-label="Orbital finish">
          <button type="button" data-finish="emissive" aria-pressed="false"><img src="${imageUrl('finish-emissive.png')}" alt="">Vivid</button>
          <button type="button" data-finish="enamel" aria-pressed="false"><img src="${imageUrl('finish-enamel.png')}" alt="">Enamel</button>
          <button type="button" data-finish="satin" aria-pressed="false"><img src="${imageUrl('finish-satin.png')}" alt="">Satin</button>
        </div><span id="lookFinishStatus" class="vm-looks-caption"></span>
      </div>
      <div class="vm-looks-tweaks">
        <label>Polish<input id="lookPolish" type="range" min="0" max="1" step="0.01" aria-label="Molecule polish"></label>
        <label>Contours<input id="lookContours" type="range" min="0" max="0.04" step="0.001" aria-label="Molecule contour width"></label>
      </div>
      <details class="vm-looks-more"><summary>Save & share</summary><div class="vm-looks-actions"><button id="lookUpdate" type="button" disabled>Update saved</button><button id="lookRename" type="button" disabled>Rename</button><button id="lookDelete" type="button" disabled>Delete</button></div>
        <div class="vm-looks-actions"><button id="lookExport" type="button">Export look</button><button id="lookImport" type="button">Import look</button></div>
        <div class="vm-looks-actions"><button id="lookDefault" type="button">Set as default</button><button id="lookClearDefault" type="button" hidden>Use last appearance</button></div>
        <p id="lookDefaultStatus" class="vm-looks-caption"></p><input id="lookFileInput" type="file" accept=".json,application/json" hidden>
      </details><p id="lookStatus" class="vm-looks-status" role="status" aria-live="polite"></p>`;
    const $ = id => root.querySelector(`#${id}`);
    const status = message => { $('lookStatus').textContent = storageMessage || message; };
    const userId = () => `user-${global.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    const current = () => deps.getActiveLook();
    const snapshotLook = (name, id = userId()) => {
      const thumbnail = deps.captureThumbnail();
      return L.normalizeLook({ id, name, settings: deps.captureSettings(), ...(thumbnail ? { thumbnail } : {}) });
    };
    function run(action) { try { action(); } catch (error) { status(error.message); } }
    function choose(look) {
      const before = deps.captureUndo();
      deps.applyLook(L.normalizeLook(look));
      undoState = before;
      sync();
      status(`${look.name} applied. Camera and orbital isovalues preserved.`);
    }
    function makeCards() {
      function fill(id, values) {
        $(id).replaceChildren();
        for (const look of values) {
          const button = document.createElement('button');
          button.type = 'button'; button.className = 'vm-look-card'; button.dataset.look = look.id;
          if (!look.id.startsWith('user-') || look.thumbnail) {
            const img = document.createElement('img'); img.alt = ''; img.src = look.thumbnail || imageUrl(`${look.id}.png`); button.append(img);
          } else {
            const swatch = document.createElement('span'); swatch.className = 'vm-look-swatch'; swatch.style.backgroundColor = look.settings['global.backgroundColor'];
            for (const key of ['surface.posColor', 'surface.negColor']) { const dot = document.createElement('i'); dot.style.backgroundColor = look.settings[key]; swatch.append(dot); }
            button.append(swatch);
          }
          const name = document.createElement('strong'); name.textContent = look.name;
          const label = document.createElement('small'); label.textContent = look.description || 'Your saved look';
          button.append(name, label); button.addEventListener('click', () => run(() => choose(look)));
          $(id).append(button);
        }
      }
      fill('lookBuiltins', L.builtins); fill('lookSaved', library);
    }
    function showCollection(collection) {
      $('lookBuiltins').hidden = collection !== 'builtins'; $('lookSaved').hidden = collection !== 'saved';
      $('lookLibraryEmpty').hidden = collection !== 'saved' || library.length > 0;
      root.querySelectorAll('[data-collection]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.collection === collection)));
    }
    function sync() {
      syncPending = false;
      const look = current(), captured = deps.captureSettings();
      const modified = !!look && (!L.equal(look.settings, captured) || deps.hasMixedSurfaces());
      const saved = look && library.find(item => item.id === look.id);
      $('lookCurrentName').textContent = look ? look.name : 'Custom appearance';
      const builtin = look && L.builtins.find(item => item.id === look.id);
      $('lookModified').textContent = modified ? 'Modified' : builtin ? builtin.description : look ? 'Saved look' : 'Choose a look';
      $('lookCurrentThumbnail').hidden = !(builtin || look?.thumbnail);
      if (builtin || look?.thumbnail) $('lookCurrentThumbnail').src = look.thumbnail || imageUrl(`${builtin.id}.png`);
      $('lookUndo').disabled = !undoState;
      $('lookRevert').disabled = !modified;
      $('lookUpdate').disabled = !saved || !modified;
      $('lookRename').disabled = !saved; $('lookDelete').disabled = !saved;
      $('lookPolish').value = captured['molecule.material.polish'];
      $('lookPolish').disabled = ['inherit', 'toon'].includes(captured['molecule.material.finish']);
      $('lookContours').value = captured['molecule.material.outline'];
      $('lookDefaultStatus').textContent = defaultLook ? `New sessions start with ${defaultLook.name}.` : 'New sessions use your last appearance.';
      $('lookClearDefault').hidden = !defaultLook;
      root.querySelectorAll('[data-look]').forEach(button => button.setAttribute('aria-pressed', String(look?.id === button.dataset.look)));
      const scope = deps.getFinishScope($('lookFinishScope').value);
      $('lookFinishPanel').hidden = !scope.available;
      $('lookFinishScope').options[0].textContent = `All ${scope.total} orbitals in this molecule`;
      $('lookFinishScope').options[1].disabled = !scope.selected;
      if (!scope.selected && $('lookFinishScope').value === 'selected') { $('lookFinishScope').value = 'group'; return sync(); }
      root.querySelectorAll('[data-finish]').forEach(button => {
        button.setAttribute('aria-pressed', String(scope.material === button.dataset.finish));
        button.disabled = !scope.available;
      });
      $('lookFinishStatus').textContent = scope.material === 'mixed' ? 'Mixed finishes' : scope.label || '';
    }
    function scheduleSync() {
      if (syncPending) return;
      syncPending = true; queueMicrotask(sync);
    }
    function beginName(mode) {
      naming = mode; $('lookNameForm').hidden = false;
      $('lookNameInput').value = mode === 'rename' ? current().name : `My ${current()?.name || 'look'}`;
      $('lookNameConfirm').textContent = mode === 'rename' ? 'Rename' : 'Save';
      $('lookNameInput').focus(); $('lookNameInput').select();
    }
    function saveName() {
      if (naming !== 'rename' && library.length >= MAX_LOOKS) throw new Error('The library holds 50 looks. Delete one before saving another.');
      const look = snapshotLook($('lookNameInput').value, naming === 'rename' ? current().id : userId());
      if (naming === 'rename') {
        const existing = library.find(item => item.id === look.id);
        look.settings = clone(existing.settings);
        if (existing.thumbnail) look.thumbnail = existing.thumbnail; else delete look.thumbnail;
        library = library.map(item => item.id === look.id ? look : item);
        deps.setActiveLook({ ...current(), name: look.name });
        if (defaultLook?.id === look.id) defaultLook.name = look.name;
      } else { library.push(look); deps.setActiveLook(look); }
      persist(); makeCards(); $('lookNameForm').hidden = true; naming = null;
      showCollection('saved'); $('looksGallery').hidden = false; $('looksBrowse').setAttribute('aria-expanded', 'true');
      sync(); status(deps.hasMixedSurfaces() ? `${look.name} saved using the current orbital. Individual overrides stay in your session.` : `${look.name} saved.`);
    }
    $('looksBrowse').onclick = () => { $('looksGallery').hidden = !$('looksGallery').hidden; $('looksBrowse').setAttribute('aria-expanded', String(!$('looksGallery').hidden)); };
    root.querySelectorAll('[data-collection]').forEach(button => { button.onclick = () => showCollection(button.dataset.collection); });
    $('lookSave').onclick = () => beginName('new'); $('lookRename').onclick = () => beginName('rename');
    $('lookNameCancel').onclick = () => { $('lookNameForm').hidden = true; naming = null; $('lookSave').focus(); };
    $('lookNameConfirm').onclick = () => run(saveName);
    $('lookNameInput').onkeydown = event => {
      if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (event.key === 'Enter') run(saveName); else $('lookNameCancel').click(); }
    };
    $('lookUndo').onclick = () => run(() => { const saved = undoState; if (!saved) return; deps.restoreUndo(saved); undoState = null; sync(); status('Previous appearance restored.'); });
    $('lookRevert').onclick = () => run(() => choose(current()));
    $('lookUpdate').onclick = () => run(() => {
      const look = snapshotLook(current().name, current().id);
      library = library.map(item => item.id === look.id ? look : item); deps.setActiveLook(look);
      persist(); makeCards(); sync(); status('Saved look updated. Set as default again to update the startup default.');
    });
    $('lookDelete').onclick = () => run(() => {
      const id = current().id; library = library.filter(item => item.id !== id);
      if (defaultLook?.id === id) defaultLook = null;
      deps.setActiveLook(null); persist(); makeCards(); showCollection('saved'); sync(); status('Saved look deleted. Current appearance kept.');
    });
    $('lookDefault').onclick = () => run(() => { defaultLook = snapshotLook(current()?.name || 'Custom appearance', current()?.id || userId()); persist(); sync(); status('Default saved for new sessions.'); });
    $('lookClearDefault').onclick = () => { defaultLook = null; persist(); sync(); status('New sessions will use your last appearance.'); };
    $('lookExport').onclick = () => run(() => {
      const look = snapshotLook(current()?.name || 'My look', current()?.id || userId());
      deps.download(L.exportLook(look), `${look.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}.look.json`);
      status('Look exported.');
    });
    $('lookImport').onclick = () => $('lookFileInput').click();
    $('lookFileInput').onchange = async () => {
      const file = $('lookFileInput').files[0]; $('lookFileInput').value = ''; if (!file) return;
      try {
        if (file.size > 128 * 1024) throw new Error('Look files must be smaller than 128 KB.');
        if (library.length >= MAX_LOOKS) throw new Error('Delete a saved look before importing another.');
        const look = L.importLook(JSON.parse(await file.text())); look.id = userId();
        choose(look); library.push(look); persist(); makeCards(); showCollection('saved'); sync(); status(`${look.name} imported and applied.`);
      } catch (error) { status(error.message); }
    };
    root.querySelectorAll('[data-finish]').forEach(button => { button.onclick = () => run(() => {
      const before = deps.captureUndo(); deps.applyFinish(button.dataset.finish, $('lookFinishScope').value);
      undoState = before; sync(); status('Orbital finish updated. Colors and isovalues kept.');
    }); });
    $('lookFinishScope').onchange = sync;
    for (const [id, key] of [['lookPolish', 'molecule.material.polish'], ['lookContours', 'molecule.material.outline']]) {
      $(id).onchange = () => run(() => { const before = deps.captureUndo(); deps.adjust({ [key]: Number($(id).value) }); undoState = before; sync(); status('Appearance adjusted. Save as new to keep this look.'); });
    }
    root.addEventListener('keydown', event => { if (event.key === 'Escape' && !naming && !$('looksGallery').hidden) { event.stopPropagation(); $('looksGallery').hidden = true; $('looksBrowse').setAttribute('aria-expanded', 'false'); $('looksBrowse').focus(); } });
    document.addEventListener('change', scheduleSync);
    makeCards(); sync();
    if (defaultLook) run(() => { deps.applyLook(defaultLook); sync(); });
    return Object.freeze({ sync, scheduleSync, choose, getLibrary: () => clone(library), clearUndo: () => { undoState = null; scheduleSync(); } });
  }
  global.VibeMolLooksUi = Object.freeze({ createController });
})(window);
