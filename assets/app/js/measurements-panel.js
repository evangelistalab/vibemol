(function (global) {
  'use strict';
  function create(deps) {
    const model = global.VibeMolMeasurements;
    const panel = document.createElement('section'); panel.id = 'measurementsPanel';
    panel.className = 'vm-popover vm-list-popover vm-measurements'; panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Measurements'); panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `<header class="vm-list-popover__header motionPanelHeader" data-vm-drag-handle tabindex="0"><span class="vm-list-popover__title title">Measurements</span><div class="vm-list-popover__actions"><button type="button" class="vm-btn vm-btn--ghost" data-action="close" aria-label="Close Measurements">×</button></div></header>
      <div class="vm-list-popover__subheader" data-active></div>
      <div class="vm-list-popover__controls"><button type="button" class="vm-btn vm-btn--ghost" data-action="units" aria-label="Measurement units">Å</button><label>Decimals <select aria-label="Measurement decimals">${[0,1,2,3,4,5,6].map(n => `<option>${n}</option>`).join('')}</select></label><button type="button" class="vm-btn vm-btn--ghost" data-action="copy">Copy</button><button type="button" class="vm-btn vm-btn--ghost" data-action="csv">CSV</button><button type="button" class="vm-btn vm-btn--ghost" data-action="undo" data-tooltip="Undo measurement change (Cmd/Ctrl+Z in Measure)">Undo</button><button type="button" class="vm-btn vm-btn--ghost" data-action="redo">Redo</button><button type="button" class="vm-btn vm-btn--ghost" data-action="clear">Clear all</button></div>
      <div class="vm-list-popover__controls" data-measure-controls><button type="button" class="vm-btn vm-btn--ghost" data-action="new">New selection</button><button type="button" class="vm-btn vm-btn--ghost" data-action="frame">Frame atoms</button><label><input type="checkbox" data-surfaces> Show surfaces</label></div>
      <div class="vm-list-popover__body"><table class="vm-measurements-table"><thead><tr><th>Type / atoms</th><th>Value</th><th><span class="vm-visually-hidden">Actions</span></th></tr></thead><tbody></tbody></table><p class="vm-session-status" data-empty>Enter Measure and click two, three, or four atoms.</p></div><p class="vm-session-status" data-status role="status">Esc starts a new selection. Saved measurements remain. Decimals control display, not accuracy.</p>`;
    // Keep the data visible in shallow bottom docks. The same controls live in
    // a native disclosure there, without rebuilding controls or losing state.
    const options = document.createElement('details'); options.className = 'vm-measurement-options'; options.open = true;
    const summary = document.createElement('summary'); summary.textContent = 'Options & export'; summary.hidden = true;
    options.append(summary, ...panel.querySelectorAll('.vm-list-popover__controls'));
    panel.insertBefore(options, panel.querySelector('.vm-list-popover__body'));
    let wasBottom = false;
    new MutationObserver(() => {
      const bottom = panel.dataset.wbPlacement === 'bottom';
      if (bottom !== wasBottom) { wasBottom = bottom; options.open = !bottom; summary.hidden = !bottom; }
    }).observe(panel, { attributes: true, attributeFilter: ['data-wb-placement'] });
    document.body.append(panel);
    const mover = global.VibeMolFloatingPanels.register(panel, { label: 'Measurements', handle: '[data-vm-drag-handle]' });
    const action = name => panel.querySelector(`[data-action="${name}"]`);
    const status = text => { panel.querySelector('[data-status]').textContent = text; deps.onStatus?.(text); };
    let signature = '';
    const isOpen = () => panel.classList.contains('open');
    function setOpen(open) {
      panel.classList.toggle('open', !!open); panel.setAttribute('aria-hidden', String(!open));
      if (open) { sync(); if (!global.VibeMolWorkbench && !mover.getPosition()) mover.moveTo(Math.max(12, innerWidth - 420), 80); }
      deps.onOpenChange?.();
    }
    async function copy(rows) {
      try { await navigator.clipboard.writeText(model.csv(deps.getRecord(), rows)); status('Measurements copied as CSV.'); }
      catch (_) { status('Clipboard unavailable. Use CSV to download the measurements.'); }
    }
    function changed() { signature = ''; deps.onChange(); sync(); }
    function sync() {
      if (!isOpen()) return;
      const record = deps.getRecord(), settings = model.state(record), rows = model.rows(record);
      panel.querySelector('[data-active]').textContent = record ? `Active: ${record.name} · ${rows.length} measurements` : 'No active structure';
      action('units').textContent = settings.units === 'bohr' ? 'Bohr' : 'Å';
      action('units').setAttribute('aria-label', settings.units === 'bohr' ? 'Measurements in bohr; switch to angstroms' : 'Measurements in angstroms; switch to bohr');
      panel.querySelector('select').value = settings.decimals;
      for (const name of ['units', 'new', 'frame']) action(name).disabled = !record;
      panel.querySelector('select').disabled = !record;
      for (const name of ['copy', 'csv', 'clear']) action(name).disabled = !rows.length;
      for (const name of ['undo', 'redo']) action(name).disabled = !model.canUndo(record, name === 'redo');
      panel.querySelector('[data-measure-controls]').hidden = !deps.isMeasuring();
      panel.querySelector('[data-surfaces]').checked = deps.showSurfaces();
      panel.querySelector('[data-empty]').hidden = !!rows.length;
      if (rows.length >= model.MAX_ENTRIES) status(`Limit of ${model.MAX_ENTRIES} measurements reached. Delete entries to add more.`);
      const next = JSON.stringify(rows);
      if (signature === next) return; signature = next;
      const body = panel.querySelector('tbody'); body.replaceChildren();
      for (const row of rows) {
        const tr = document.createElement('tr');
        const name = document.createElement('td'); name.textContent = row.type[0].toUpperCase() + row.type.slice(1) + ' · ' + row.atoms;
        const value = document.createElement('td'); value.className = 'vm-mono'; value.textContent = row.text; value.title = row.reason;
        const actions = document.createElement('td');
        for (const [label, glyph, fn] of [['Copy', 'content_copy', () => copy([row])], ['Delete', 'delete', () => { model.remove(record, row.id); changed(); }]]) {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'vm-btn vm-btn--ghost vm-btn--icon';
          button.setAttribute('aria-label', `${label} ${row.type} ${row.atoms}`);
          button.innerHTML = `<span class="material-symbols-rounded" aria-hidden="true">${glyph}</span>`; button.onclick = fn; actions.append(button);
        }
        tr.append(name, value, actions); body.append(tr);
      }
    }
    action('close').onclick = () => setOpen(false);
    action('units').onclick = () => { const r = deps.getRecord(); model.configure(r, { units: model.state(r).units === 'bohr' ? 'angstrom' : 'bohr' }); changed(); };
    panel.querySelector('select').onchange = event => { model.configure(deps.getRecord(), { decimals: Number(event.target.value) }); changed(); };
    action('copy').onclick = () => copy();
    action('csv').onclick = () => {
      const link = document.createElement('a'); link.download = 'vibemol-measurements.csv';
      link.href = URL.createObjectURL(new Blob([model.csv(deps.getRecord())], { type: 'text/csv;charset=utf-8' }));
      link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    };
    action('clear').onclick = () => { model.clear(deps.getRecord()); deps.newSelection(); changed(); };
    for (const name of ['undo', 'redo']) action(name).onclick = () => { model.undo(deps.getRecord(), name === 'redo'); changed(); };
    action('new').onclick = deps.newSelection; action('frame').onclick = deps.frameAtoms;
    panel.querySelector('[data-surfaces]').onchange = event => deps.setShowSurfaces(event.target.checked);
    return Object.freeze({ panel, setOpen, isOpen, sync });
  }
  global.VibeMolMeasurementsPanel = Object.freeze({ create });
})(window);
