(function (global) {
  'use strict';

  // The window is built once. Selection changes update existing controls, so
  // disclosure, scroll positions, keyboard focus, and slider gestures survive.
  function createController(deps) {
    const $ = id => document.getElementById(id);
    const old = $('displayInspector'), studio = $('styleStudio');
    const panel = document.createElement('section');
    panel.id = 'inspector'; panel.className = 'motionPanel vm-list-popover';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-labelledby', 'inspectorTitle'); panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
      <header class="motionPanelHeader vm-list-popover__header">
        <div class="title vm-list-popover__title" id="inspectorTitle">Properties</div>
        <div class="actions vm-list-popover__actions"><button id="inspectorClose" class="motionPanelClose vm-list-popover__close" type="button" aria-label="Close Properties"><span class="material-symbols-rounded" aria-hidden="true">close</span></button></div>
      </header>
      <div class="wb-tabs vm-properties-tabs" role="tablist" aria-label="Property scope">
        <button id="inspectorObjectTab" class="wb-tab" type="button" role="tab" aria-selected="true" aria-controls="inspectorObject">Object</button>
        <button id="inspectorLookTab" class="wb-tab" type="button" role="tab" aria-selected="false" aria-controls="inspectorLook" tabindex="-1">Look</button>
      </div>
      <div id="inspectorObject" class="vm-properties-body" role="tabpanel" aria-labelledby="inspectorObjectTab">
        <p id="inspectorSelection" class="vm-stat-label" aria-live="polite"></p>
        <p id="inspectorEmpty" class="vm-session-status">Select a structure or orbital in Scenes to edit its properties. Use ⌘/Ctrl-click to select several objects.</p>
        <section id="inspectorSelectionSection" class="vm-appearance-section"><div id="inspectorVisibilityFields"></div></section>
        <section id="inspectorStructure" class="vm-appearance-section"><h3 id="inspectorStructureTitle" class="vm-section-label">Structure</h3><div id="inspectorStructureFields"></div></section>
      </div>
      <div id="inspectorLook" class="vm-properties-body" role="tabpanel" aria-labelledby="inspectorLookTab" hidden>
        <p class="vm-session-status vm-properties-scope">Style and color scheme apply across the workspace. Object colors and opacity can override them.</p>
      </div>`;
    document.body.append(panel);
    const lookBody = $('inspectorLook'), objectBody = $('inspectorObject');
    lookBody.append($('looksPanel'));
    const surfaces = $('appearanceSurfacesSection'); objectBody.append(surfaces);
    const box = $('showBox').closest('.vm-field-row'); surfaces.append(box);
    box.querySelector('.vm-field-label').textContent = 'Simulation box';
    // These selects are backing state for the existing, accessible button groups.
    for (const id of ['renderMode', 'cloudType']) { const el = $(id); el.hidden = true; surfaces.append(el); }
    for (const id of ['surfBtn', 'surfaceMaterialPreset']) $(id).closest('.vm-field-row').remove();
    $('surfaceUseStyleColors').parentElement.remove();
    for (const id of ['surfaceScopeLabel', 'surfaceStyleScopeStatus']) $(id).remove();
    const camera = $('appearanceCameraSection'); camera.classList.add('vm-view-section');
    camera.querySelector('.vm-section-label').textContent = 'Projection & focus';
    camera.append($('showAxes').closest('.vm-field-row'));
    const focusMode = $('dofFocusMode'); focusMode.hidden = true; camera.append(focusMode);
    $('viewControls').append(camera);
    // Typeface is an application preference, exposed by the workspace menu.
    const preferences = $('appearancePreferencesSection'); preferences.remove();
    const twoComponent = $('appearanceTwoComponentSection');
    twoComponent.querySelector('.vm-section-label').textContent = 'Two-component display';
    $('twoComponentModeRow').querySelector('.vm-field-label').textContent = 'Component';
    const twoNote = document.createElement('p'); twoNote.className = 'vm-session-status';
    twoNote.textContent = 'Applies to all loaded two-component files.'; twoComponent.append(twoNote);
    $('appearanceBackgroundColor').setAttribute('data-tooltip', 'Workspace background, included in the color scheme.');
    // Legacy preset adapters retain their bound backing values off-DOM. The
    // visible editor has one owner for every property and no mirrored controls.
    old.closest('.tb-appearance').remove(); studio.remove();

    let tab = 'object', pending = false;
    const controls = [];
    function toggle(parent, id, title, values, setter, disabled = () => false) {
      const row = document.createElement('div'); row.className = 'vm-field-row';
      row.innerHTML = `<label class="vm-field-label" for="${id}">${title}</label><div class="vm-field-control"><label class="vm-toggle"><input id="${id}" type="checkbox" class="vm-toggle__input" aria-label="${title}"><span class="vm-toggle__thumb" aria-hidden="true"></span></label></div>`;
      $(parent).append(row); const control = $(id);
      control.onchange = () => { if (!control.disabled) setter(control.checked); };
      controls.push(state => {
        const all = values(state), mixed = all.some(value => value !== all[0]);
        control.checked = !!all[0]; control.indeterminate = mixed;
        control.setAttribute('aria-checked', mixed ? 'mixed' : String(!!all[0]));
        control.disabled = !all.length || disabled(state);
        row.dataset.disabled = String(control.disabled);
      });
    }
    toggle('inspectorVisibilityFields', 'inspectorVisible', 'Visible', s => s.objects.map(layer => layer.visible !== false), deps.setVisible);
    for (const [key, label] of [['showAtoms', 'Show atoms'], ['showBonds', 'Show bonds'], ['showHydrogenBonds', 'Hydrogen bonds'], ['showAtomLabels', 'Atom labels'],
      ['showAtomLabelNumbers', 'Atom numbers'], ['showMultiBonds', 'Multiple bonds']]) {
      toggle('inspectorStructureFields', 'inspector' + key[0].toUpperCase() + key.slice(1), label,
        s => s.molecules.map(layer => deps.getMoleculeDisplay(layer)[key]), value => deps.editMoleculeDisplay(key, value),
        s => key === 'showAtomLabelNumbers' && s.molecules.some(layer => !deps.getMoleculeDisplay(layer).showAtomLabels));
    }

    $('inspectorShowHydrogenBonds').closest('.vm-field-row').setAttribute('data-tooltip',
      'Dashed D–H···A contacts within this structure: H···A ≤ 2.5 Å, D···A ≤ 3.5 Å, angle ≥ 120°. Requires explicit H on N/O/F/S and a suitable acceptor.');

    const bindingRows = [];
    for (const [id, group, label] of [['schemeSelect', 'colors', 'surface colors'], ['posColor', 'colors', 'surface colors'],
      ['negColor', 'colors', 'surface colors'], ['opacity', 'opacity', 'surface opacity']]) {
      const row = $(id).closest('.vm-field-row'); row.classList.add('vm-style-property');
      const reset = document.createElement('button'); reset.type = 'button';
      reset.className = 'vm-btn vm-btn--icon vm-property-reset'; reset.hidden = true;
      reset.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">restart_alt</span>';
      const scope = group === 'colors' ? 'color scheme' : 'look';
      reset.setAttribute('aria-label', 'Reset ' + label + ' to ' + scope);
      reset.setAttribute('data-tooltip', 'Use ' + scope + ' defaults for selected ' + label + '. Undo is available in Look.');
      reset.onclick = () => deps.resetSurfaceOverrides([group]); row.append(reset);
      bindingRows.push({ row, reset, group });
    }
    const mover = global.VibeMolFloatingPanels.register(panel, { label: 'Properties', handle: '.vm-list-popover__header' });
    const isOpen = () => panel.classList.contains('open');
    function setOpen(value, { focus = true } = {}) {
      const next = !!value;
      if (next === isOpen()) return;
      panel.classList.toggle('open', next); panel.setAttribute('aria-hidden', String(!next));
      if (next) { sync(); deps.syncLook(); mover.refresh(); }
      else mover.cancelDrag();
      if (focus) (next ? $(tab === 'object' ? 'inspectorObjectTab' : 'inspectorLookTab') : $('workbenchPanelsBtn'))?.focus({ preventScroll: true });
    }
    function setTab(value) {
      if (!['object', 'look'].includes(value)) return;
      tab = value;
      for (const [key, label] of [['object', 'Object'], ['look', 'Look']]) {
        const active = key === tab, button = $('inspector' + label + 'Tab');
        button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
        $('inspector' + label).hidden = !active;
      }
    }
    $('inspectorClose').onclick = () => global.VibeMolWorkbench ? global.VibeMolWorkbench.close('inspector') : setOpen(false);
    for (const [id, key] of [['inspectorObjectTab', 'object'], ['inspectorLookTab', 'look']]) $(id).onclick = () => setTab(key);
    panel.querySelector('[role="tablist"]').addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      setTab(event.key === 'Home' ? 'object' : event.key === 'End' ? 'look' : tab === 'object' ? 'look' : 'object');
      $(tab === 'object' ? 'inspectorObjectTab' : 'inspectorLookTab').focus();
    });
    panel.addEventListener('keydown', event => { event.stopPropagation(); if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); setOpen(false); } });
    panel.addEventListener('keyup', event => event.stopPropagation());
    function sync() {
      pending = false;
      const objects = deps.getObjects(), molecules = objects.filter(layer => layer.kind === 'molecule');
      const surfaceLayers = objects.filter(layer => ['cube', 'arithmetic'].includes(layer.kind));
      $('inspectorSelection').textContent = !objects.length ? 'No object selected' : objects.length === 1
        ? objects[0].name : `${objects.length} selected · ${molecules.length} structure${molecules.length === 1 ? '' : 's'} · ${surfaceLayers.length} surface${surfaceLayers.length === 1 ? '' : 's'}`;
      $('inspectorEmpty').hidden = !!objects.length;
      $('inspectorSelectionSection').hidden = !objects.length;
      $('inspectorStructure').hidden = !molecules.length;
      $('inspectorStructureTitle').textContent = `Structure · ${molecules.length} selected`;
      surfaces.hidden = !surfaceLayers.length;
      surfaces.querySelector('.vm-section-label').textContent = `Surfaces · ${surfaceLayers.length} selected`;
      const state = { objects, molecules, surfaces: surfaceLayers }; for (const update of controls) update(state);
      for (const { row, reset, group } of bindingRows) {
        const overridden = surfaceLayers.filter(layer => deps.getOverrides(layer)[group]).length;
        row.dataset.styleState = overridden ? 'modified' : 'inherited'; reset.hidden = !overridden;
        const scope = group === 'colors' ? 'color scheme' : 'look';
        row.title = overridden ? `${overridden} selected surface${overridden === 1 ? '' : 's'} override the ${scope}` : `Follows the ${scope}`;
      }
      for (const [id, getter] of [['autoIsoBtn', layer => !!layer.autoIso], ['surfaceSignFlipBtn', layer => !!layer.signFlip],
        ['showBox', layer => deps.getBoxVisible(layer)]]) {
        const values = surfaceLayers.map(getter), mixed = values.some(value => value !== values[0]);
        $(id).indeterminate = mixed; $(id).setAttribute('aria-checked', mixed ? 'mixed' : String(!!values[0]));
      }
      // Scientific controls have no reset-to-look: iso, phase, box, and cloud
      // mode depend on loaded data and are not part of a portable Look.
      if (surfaceLayers.length) {
        const mixedScheme = surfaceLayers.some(layer => layer.colorScheme !== surfaceLayers[0].colorScheme);
        if (!$('schemeSelect').querySelector('option[value=""]')) {
          const mixed = new Option('Mixed', ''); mixed.disabled = true; $('schemeSelect').prepend(mixed);
        }
        if (mixedScheme) $('schemeSelect').value = '';
        for (const [id, field] of [['iso', 'iso'], ['opacity', 'opacity']]) {
          if (surfaceLayers.some(layer => layer[field] !== surfaceLayers[0][field]) && document.activeElement !== $(id)) $(id).value = 'Mixed';
        }
      }
      const hasTwoComponent = surfaceLayers.some(deps.isTwoComponent);
      twoComponent.hidden = !hasTwoComponent;
      $('twoComponentModeRow').classList.toggle('vm-appearance-hidden', !hasTwoComponent);
      $('twoComponentModeRow').style.display = hasTwoComponent ? 'grid' : 'none';
      if (hasTwoComponent) $('twoComponentModeSelect').value = deps.getComponentMode();
      $('schemeSelect').disabled = !!surfaceLayers.length && surfaceLayers.every(deps.usesIntrinsicColors);
    }
    function scheduleSync() { if (!pending) { pending = true; queueMicrotask(sync); } }
    document.addEventListener('change', scheduleSync);
    sync();
    return Object.freeze({ panel, preferences, isOpen, setOpen, setTab, sync, scheduleSync,
      snapshot: () => ({ tab, selected: deps.getObjects().map(layer => ({ id: layer.id, kind: layer.kind, name: layer.name })) }) });
  }
  global.VibeMolPropertiesInspector = Object.freeze({ createController });
})(window);
