(function (global) {
  'use strict';

  function normalizeVisibleRowIndices(count, indices) {
    const max = Math.max(0, Number(count) | 0);
    if (!Array.isArray(indices) || !indices.length) {
      return Array.from({ length: max }, (_value, index) => index);
    }
    const seen = new Set();
    const out = [];
    for (const value of indices) {
      const index = Number(value);
      if (!Number.isInteger(index) || index < 0 || index >= max || seen.has(index)) continue;
      seen.add(index);
      out.push(index);
    }
    out.sort((a, b) => a - b);
    return out;
  }

  function findNextEditableCellPosition(columnSchema, rowCount, currentRowIndex, currentColumnKey, direction = 1) {
    const columns = Array.isArray(columnSchema) ? columnSchema : [];
    const editableKeys = columns
      .filter((column) => column && column.editable)
      .map((column) => String(column.key || '').trim())
      .filter(Boolean);
    const totalRows = Math.max(0, Number(rowCount) | 0);
    if (!editableKeys.length || totalRows <= 0) return null;
    const linear = [];
    for (let rowIndex = 0; rowIndex < totalRows; rowIndex += 1) {
      for (const columnKey of editableKeys) linear.push({ rowIndex, columnKey });
    }
    const needleRow = Math.max(0, Number(currentRowIndex) | 0);
    const needleKey = String(currentColumnKey || '').trim();
    const currentLinearIndex = linear.findIndex((entry) => entry.rowIndex === needleRow && entry.columnKey === needleKey);
    if (currentLinearIndex < 0) return direction >= 0 ? linear[0] : linear[linear.length - 1];
    const nextLinearIndex = currentLinearIndex + (direction < 0 ? -1 : 1);
    if (nextLinearIndex < 0 || nextLinearIndex >= linear.length) return null;
    return linear[nextLinearIndex];
  }

  function formatOrbitalSpinGlyph(spin) {
    const raw = typeof spin === 'string' ? spin.trim().toLowerCase() : '';
    if (raw === 'alpha' || raw === 'a') return 'α';
    if (raw === 'beta' || raw === 'b') return 'β';
    return '·';
  }

  function getOrbitalBoundary(items) {
    const list = Array.isArray(items) ? items : [];
    let lastOccupiedIndex = -1;
    let firstVirtualIndex = -1;
    for (let index = 0; index < list.length; index += 1) {
      const item = list[index];
      const occValue = Number(item && (item.occValue != null ? item.occValue : item.occ));
      if (Number.isFinite(occValue) && occValue > 0) {
        lastOccupiedIndex = index;
      } else if (firstVirtualIndex < 0) {
        firstVirtualIndex = index;
      }
    }
    if (lastOccupiedIndex >= 0 && firstVirtualIndex < 0 && lastOccupiedIndex + 1 < list.length) {
      firstVirtualIndex = lastOccupiedIndex + 1;
    }
    return { lastOccupiedIndex, firstVirtualIndex };
  }

  function formatOrbitalRelativeLabel(items, selectedIndex) {
    const index = Number(selectedIndex);
    if (!Number.isInteger(index) || index < 0) return '';
    const boundary = getOrbitalBoundary(items);
    const hasHomo = boundary.lastOccupiedIndex >= 0;
    const hasLumo = boundary.firstVirtualIndex >= 0;
    if (hasHomo && index === boundary.lastOccupiedIndex) return 'HOMO';
    if (hasLumo && index === boundary.firstVirtualIndex) return 'LUMO';
    if (hasHomo && index < boundary.lastOccupiedIndex) return `HOMO-${boundary.lastOccupiedIndex - index}`;
    if (hasLumo && index > boundary.firstVirtualIndex) return `LUMO+${index - boundary.firstVirtualIndex}`;
    return '';
  }

  function passesOrbitalEnergyThreshold(energyEh, threshold) {
    const energy = Number(energyEh);
    const limit = Number(threshold);
    if (!Number.isFinite(energy)) return false;
    if (!Number.isFinite(limit) || limit <= 0) return true;
    return Math.abs(energy) >= limit;
  }

  function resolveSingleDividerPlacement(items, visibleRowIndices, getDividerBeforeIndex) {
    const list = Array.isArray(items) ? items : [];
    const visible = normalizeVisibleRowIndices(list.length, visibleRowIndices);
    if (typeof getDividerBeforeIndex !== 'function' || !visible.length) return null;
    const visibleSet = new Set(visible);
    for (let rowIndex = 0; rowIndex < list.length; rowIndex += 1) {
      if (!visibleSet.has(rowIndex)) continue;
      const label = getDividerBeforeIndex(rowIndex, list.slice(), visible);
      if (label) return { rowIndex, label: String(label) };
    }
    return null;
  }

  function applyColumnClasses(el, column, prefix) {
    if (!el || !column) return;
    const align = String(column.align || '').toLowerCase();
    if (align === 'center' || align === 'right' || align === 'left') {
      el.classList.add(`${prefix}--${align}`);
    }
    if (column.mono) el.classList.add(`${prefix}--mono`);
    if (column.italic) el.classList.add(`${prefix}--italic`);
    if (column.headerClass && prefix === 'vm-list-popover__head') el.classList.add(String(column.headerClass));
    if (column.cellClass && prefix === 'vm-list-popover__cell') el.classList.add(String(column.cellClass));
    if (Number.isFinite(Number(column.width)) && Number(column.width) > 0) {
      el.style.width = `${Number(column.width)}px`;
      el.style.minWidth = `${Number(column.width)}px`;
    }
  }

  function setElementContent(el, value) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
    if (value == null) return;
    if (value instanceof global.Node) {
      el.appendChild(value);
      return;
    }
    el.textContent = String(value);
  }

  function createListPopoverController(options) {
    const rootEl = options && options.rootEl ? options.rootEl : null;
    const titleEl = options && options.titleEl ? options.titleEl : null;
    const subheaderEl = options && options.subheaderEl ? options.subheaderEl : null;
    const controlsEl = options && options.controlsEl ? options.controlsEl : null;
    const bodyEl = options && options.bodyEl ? options.bodyEl : null;
    const footerEl = options && options.footerEl ? options.footerEl : null;
    const filterInputEl = options && options.filterInputEl ? options.filterInputEl : null;
    const onRequestClose = options && typeof options.onRequestClose === 'function' ? options.onRequestClose : null;
    const onInlineEditStateChange = options && typeof options.onInlineEditStateChange === 'function'
      ? options.onInlineEditStateChange
      : null;
    if (!bodyEl || typeof options.getItems !== 'function' || !Array.isArray(options.columnSchema)) {
      throw new Error('VibeMolListPopover requires bodyEl, columnSchema, and getItems().');
    }

    const state = {
      items: [],
      rows: [],
      dividerEl: null,
      dividerCellEl: null,
      keyboardRowIndex: -1,
      hoveredRowIndex: -1,
      activeEdit: null,
      tableEl: null,
      tbodyEl: null,
    };

    bodyEl.tabIndex = bodyEl.tabIndex >= 0 ? bodyEl.tabIndex : 0;

    function getHoveredRowIndex() {
      if (typeof options.getHoveredRowIndex === 'function') {
        const index = Number(options.getHoveredRowIndex());
        return Number.isInteger(index) ? index : -1;
      }
      return state.hoveredRowIndex;
    }

    function setHoveredRowIndex(index) {
      const next = Number.isInteger(index) ? index : -1;
      if (typeof options.setHoveredRowIndex === 'function') options.setHoveredRowIndex(next);
      state.hoveredRowIndex = next;
      state.keyboardRowIndex = next;
      syncRowStateClasses();
    }

    function getSelectedRowIndex() {
      const index = options && typeof options.getSelectedRowIndex === 'function'
        ? Number(options.getSelectedRowIndex())
        : -1;
      return Number.isInteger(index) ? index : -1;
    }

    function getPendingRowIndex() {
      const index = options && typeof options.getPendingRowIndex === 'function'
        ? Number(options.getPendingRowIndex())
        : -1;
      return Number.isInteger(index) ? index : -1;
    }

    function getVisibleRowIndices() {
      const rowCount = state.items.length;
      if (typeof options.getVisibleRowIndices !== 'function') {
        return normalizeVisibleRowIndices(rowCount);
      }
      return normalizeVisibleRowIndices(rowCount, options.getVisibleRowIndices(state.items.slice()));
    }

    function getColumnSchema() {
      return options.columnSchema;
    }

    function getColumnValue(column, item, rowIndex) {
      if (typeof column.getValue === 'function') {
        return column.getValue(item, rowIndex, state.items.slice());
      }
      return item ? item[column.key] : undefined;
    }

    function getDisplayValue(column, item, rowIndex, context = {}) {
      const value = getColumnValue(column, item, rowIndex);
      if (typeof column.renderCell === 'function') {
        return column.renderCell(value, item, rowIndex, state.items.slice(), context);
      }
      if (typeof column.format === 'function') {
        return column.format(value, item, rowIndex, state.items.slice(), context);
      }
      if (value == null) return '';
      return String(value);
    }

    function getEditValue(column, item, rowIndex) {
      const value = getColumnValue(column, item, rowIndex);
      if (typeof column.getEditValue === 'function') {
        return column.getEditValue(value, item, rowIndex, state.items.slice());
      }
      if (value == null) return '';
      return String(value);
    }

    function focusBody() {
      try {
        bodyEl.focus({ preventScroll: true });
      } catch {
        try { bodyEl.focus(); } catch { }
      }
    }

    function getRowMetaByIndex(rowIndex) {
      return state.rows.find((row) => row.rowIndex === rowIndex) || null;
    }

    function ensureRowVisible(rowIndex) {
      const meta = getRowMetaByIndex(rowIndex);
      if (!meta || !meta.rowEl) return;
      const rowTop = meta.rowEl.offsetTop;
      const rowBottom = rowTop + meta.rowEl.offsetHeight;
      const viewTop = bodyEl.scrollTop;
      const viewBottom = viewTop + bodyEl.clientHeight;
      if (rowTop < viewTop) bodyEl.scrollTop = rowTop;
      else if (rowBottom > viewBottom) bodyEl.scrollTop = Math.max(0, rowBottom - bodyEl.clientHeight);
    }

    function focusEditableCell(rowIndex, columnKey) {
      if (!bodyEl) return;
      const selector = `[data-row-index="${rowIndex}"] [data-edit-field="${String(columnKey)}"]`;
      const button = bodyEl.querySelector(selector);
      if (button && typeof button.focus === 'function') {
        try {
          button.focus({ preventScroll: true });
        } catch {
          try { button.focus(); } catch { }
        }
      }
      ensureRowVisible(rowIndex);
    }

    function focusNextEditableCell(rowIndex, columnKey, direction) {
      const next = findNextEditableCellPosition(getColumnSchema(), state.items.length, rowIndex, columnKey, direction);
      if (!next) {
        focusBody();
        return;
      }
      focusEditableCell(next.rowIndex, next.columnKey);
    }

    function setEditStateSnapshot(editState) {
      if (!onInlineEditStateChange) return;
      onInlineEditStateChange(editState);
    }

    function cancelInlineEdit(options = {}) {
      const activeEdit = state.activeEdit;
      if (!activeEdit) return;
      state.activeEdit = null;
      setEditStateSnapshot(null);
      buildTable();
      if (options.focusButton !== false) focusEditableCell(activeEdit.rowIndex, activeEdit.columnKey);
    }

    function commitInlineEdit(options = {}) {
      const activeEdit = state.activeEdit;
      if (!activeEdit) return false;
      const column = activeEdit.column;
      const inputEl = activeEdit.inputEl;
      const item = state.items[activeEdit.rowIndex];
      state.activeEdit = null;
      setEditStateSnapshot(null);
      let committed = false;
      const parseResult = column && typeof column.parse === 'function'
        ? column.parse(String(inputEl && inputEl.value != null ? inputEl.value : ''), item, activeEdit.rowIndex, state.items.slice())
        : { ok: true, value: String(inputEl && inputEl.value != null ? inputEl.value : '') };
      if (parseResult && parseResult.ok) {
        if (typeof options.onEditCell === 'function') {
          options.onEditCell(activeEdit.rowIndex, column.key, parseResult.value, state.items.slice(), column);
        } else if (typeof column.onEdit === 'function') {
          column.onEdit(activeEdit.rowIndex, parseResult.value, state.items.slice());
        }
        committed = true;
      }
      buildTable();
      if (options.advanceDirection) focusNextEditableCell(activeEdit.rowIndex, activeEdit.columnKey, options.advanceDirection);
      else if (options.focusButton !== false) focusEditableCell(activeEdit.rowIndex, activeEdit.columnKey);
      return committed;
    }

    function beginInlineEdit(rowIndex, columnKey, cellEl) {
      let item = state.items[rowIndex];
      const column = getColumnSchema().find((entry) => entry && String(entry.key) === String(columnKey));
      if (!item || !column || !column.editable || !cellEl) return;
      if (state.activeEdit) {
        commitInlineEdit({ onEditCell: options.onEditCell, focusButton: false });
        item = state.items[rowIndex];
        const freshButton = bodyEl.querySelector(`[data-row-index="${rowIndex}"] [data-edit-field="${String(columnKey)}"]`);
        cellEl = freshButton ? (freshButton.parentElement || freshButton) : cellEl;
      }
      const inputEl = global.document.createElement('input');
      inputEl.className = `vm-list-popover__editor ${String(column.editorClassName || '').trim()}`.trim();
      inputEl.type = column.inputType || 'text';
      const inputAttrs = column.inputAttributes || {};
      for (const [key, value] of Object.entries(inputAttrs)) {
        if (value == null) continue;
        inputEl.setAttribute(key, String(value));
      }
      inputEl.value = getEditValue(column, item, rowIndex);
      while (cellEl.firstChild) cellEl.removeChild(cellEl.firstChild);
      cellEl.appendChild(inputEl);
      const activeEdit = { rowIndex, columnKey, column, cellEl, inputEl };
      state.activeEdit = activeEdit;
      setEditStateSnapshot(activeEdit);
      inputEl.addEventListener('keydown', (event) => {
        if (state.activeEdit !== activeEdit) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          commitInlineEdit({ onEditCell: options.onEditCell });
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancelInlineEdit();
          return;
        }
        if (event.key === 'Tab') {
          event.preventDefault();
          event.stopPropagation();
          commitInlineEdit({
            onEditCell: options.onEditCell,
            advanceDirection: event.shiftKey ? -1 : 1,
            focusButton: false,
          });
        }
      });
      inputEl.addEventListener('blur', () => {
        if (state.activeEdit !== activeEdit) return;
        commitInlineEdit({ onEditCell: options.onEditCell, focusButton: false });
      });
      inputEl.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      try {
        inputEl.focus({ preventScroll: true });
      } catch {
        try { inputEl.focus(); } catch { }
      }
      if (typeof inputEl.select === 'function') inputEl.select();
    }

    function syncHeaderChrome() {
      if (titleEl && typeof options.getTitleText === 'function') {
        titleEl.textContent = String(options.getTitleText() || '');
      }
      if (subheaderEl) {
        const text = typeof options.getSubheaderText === 'function' ? String(options.getSubheaderText() || '') : '';
        subheaderEl.textContent = text;
        subheaderEl.hidden = !text;
      }
      if (controlsEl && typeof options.renderControls === 'function') {
        options.renderControls(controlsEl, state.items.slice());
      }
      if (footerEl) {
        const text = typeof options.getFooterText === 'function' ? String(options.getFooterText() || '') : '';
        footerEl.textContent = text;
        footerEl.hidden = !text;
      }
    }

    function syncRowStateClasses() {
      const hoveredIndex = getHoveredRowIndex();
      const selectedIndex = getSelectedRowIndex();
      const pendingIndex = getPendingRowIndex();
      for (const row of state.rows) {
        const isHovered = row.rowIndex === hoveredIndex;
        const isSelected = row.rowIndex === selectedIndex;
        const isPending = row.rowIndex === pendingIndex;
        row.rowEl.classList.toggle('vm-list-popover__row--hovered', isHovered);
        if (options.hoverClassName) row.rowEl.classList.toggle(String(options.hoverClassName), isHovered);
        row.rowEl.classList.toggle('vm-list-popover__row--selected', isSelected);
        row.rowEl.classList.toggle('vm-list-popover__row--pending', isPending);
      }
    }

    function syncVisibleRows() {
      const visibleRowIndices = getVisibleRowIndices();
      const visibleSet = new Set(visibleRowIndices);
      for (const row of state.rows) {
        row.rowEl.style.display = visibleSet.has(row.rowIndex) ? '' : 'none';
      }
      const dividerPlacement = resolveSingleDividerPlacement(
        state.items,
        visibleRowIndices,
        options.getDividerBeforeIndex
      );
      if (state.dividerEl && state.tbodyEl) {
        if (dividerPlacement) {
          const targetRow = getRowMetaByIndex(dividerPlacement.rowIndex);
          if (state.dividerCellEl) state.dividerCellEl.textContent = dividerPlacement.label;
          if (targetRow && targetRow.rowEl) {
            state.tbodyEl.insertBefore(state.dividerEl, targetRow.rowEl);
          } else if (state.dividerEl.parentNode !== state.tbodyEl) {
            state.tbodyEl.appendChild(state.dividerEl);
          }
        } else if (state.dividerEl.parentNode === state.tbodyEl) {
          state.tbodyEl.removeChild(state.dividerEl);
        }
      }
      if (!visibleSet.size) {
        setHoveredRowIndex(-1);
        state.keyboardRowIndex = -1;
      } else if (!visibleSet.has(state.keyboardRowIndex)) {
        state.keyboardRowIndex = visibleRowIndices[0];
      }
      syncRowStateClasses();
    }

    function buildTable() {
      state.items = Array.isArray(options.getItems()) ? options.getItems().slice() : [];
      bodyEl.innerHTML = '';
      syncHeaderChrome();
      if (!state.items.length) {
        const emptyEl = global.document.createElement('div');
        emptyEl.className = 'vm-list-popover__empty';
        emptyEl.textContent = typeof options.getEmptyText === 'function'
          ? String(options.getEmptyText() || '')
          : 'No items';
        bodyEl.appendChild(emptyEl);
        state.tableEl = null;
        state.tbodyEl = null;
        state.rows = [];
        return;
      }
      const tableEl = global.document.createElement('table');
      tableEl.className = `vm-list-popover__table ${String(options.tableClassName || '').trim()}`.trim();
      const theadEl = global.document.createElement('thead');
      const headerRowEl = global.document.createElement('tr');
      for (const column of getColumnSchema()) {
        const th = global.document.createElement('th');
        th.className = 'vm-list-popover__head';
        applyColumnClasses(th, column, 'vm-list-popover__head');
        th.textContent = String(column && column.label != null ? column.label : '');
        headerRowEl.appendChild(th);
      }
      theadEl.appendChild(headerRowEl);
      const tbodyEl = global.document.createElement('tbody');
      const dividerEl = global.document.createElement('tr');
      dividerEl.className = 'vm-list-popover__divider';
      const dividerCellEl = global.document.createElement('td');
      dividerCellEl.colSpan = getColumnSchema().length;
      dividerEl.appendChild(dividerCellEl);
      const visibleRowIndices = getVisibleRowIndices();
      const rows = [];
      for (let rowIndex = 0; rowIndex < state.items.length; rowIndex += 1) {
        const item = state.items[rowIndex];
        const rowEl = global.document.createElement('tr');
        rowEl.className = 'vm-list-popover__row';
        rowEl.dataset.rowIndex = String(rowIndex);
        if (typeof options.getRowDataset === 'function') {
          const dataset = options.getRowDataset(item, rowIndex, state.items.slice()) || {};
          for (const [key, value] of Object.entries(dataset)) {
            if (value == null) continue;
            rowEl.dataset[key] = String(value);
          }
        }
        for (const column of getColumnSchema()) {
          const td = global.document.createElement('td');
          td.className = 'vm-list-popover__cell';
          applyColumnClasses(td, column, 'vm-list-popover__cell');
          if (column && column.editable) {
            const button = global.document.createElement('button');
            button.type = 'button';
            button.className = String(column.buttonClassName || 'vm-list-popover__cell-button');
            button.dataset.rowIndex = String(rowIndex);
            button.dataset.editField = String(column.key || '');
            setElementContent(button, getDisplayValue(column, item, rowIndex, {
              isSelected: rowIndex === getSelectedRowIndex(),
              isPending: rowIndex === getPendingRowIndex(),
            }));
            td.appendChild(button);
          } else {
            const content = getDisplayValue(column, item, rowIndex, {
              isSelected: rowIndex === getSelectedRowIndex(),
              isPending: rowIndex === getPendingRowIndex(),
            });
            setElementContent(td, content);
          }
          rowEl.appendChild(td);
        }
        tbodyEl.appendChild(rowEl);
        rows.push({ rowIndex, rowEl });
      }
      tableEl.appendChild(theadEl);
      tableEl.appendChild(tbodyEl);
      bodyEl.appendChild(tableEl);
      state.tableEl = tableEl;
      state.tbodyEl = tbodyEl;
      state.dividerEl = dividerEl;
      state.dividerCellEl = dividerCellEl;
      state.rows = rows;
      syncVisibleRows();
    }

    function moveKeyboardRow(command) {
      const visibleRowIndices = getVisibleRowIndices();
      if (!visibleRowIndices.length) return;
      let nextIndex = visibleRowIndices[0];
      const currentIndex = visibleRowIndices.includes(state.keyboardRowIndex)
        ? state.keyboardRowIndex
        : visibleRowIndices[0];
      const currentVisibleOffset = visibleRowIndices.indexOf(currentIndex);
      if (command === 'up') {
        nextIndex = visibleRowIndices[Math.max(0, currentVisibleOffset - 1)];
      } else if (command === 'down') {
        nextIndex = visibleRowIndices[Math.min(visibleRowIndices.length - 1, currentVisibleOffset + 1)];
      } else if (command === 'home') {
        nextIndex = visibleRowIndices[0];
      } else if (command === 'end') {
        nextIndex = visibleRowIndices[visibleRowIndices.length - 1];
      } else if (command === 'pageup' || command === 'pagedown') {
        const direction = command === 'pageup' ? -1 : 1;
        const delta = Math.max(1, Math.floor(bodyEl.clientHeight / 28));
        const nextOffset = Math.max(0, Math.min(visibleRowIndices.length - 1, currentVisibleOffset + (direction * delta)));
        nextIndex = visibleRowIndices[nextOffset];
      }
      state.keyboardRowIndex = nextIndex;
      setHoveredRowIndex(nextIndex);
      ensureRowVisible(nextIndex);
    }

    function activateRow(rowIndex) {
      const item = state.items[rowIndex];
      if (!item || typeof options.onActivateRow !== 'function') return;
      options.onActivateRow(rowIndex, item, state.items.slice());
    }

    bodyEl.addEventListener('mouseover', (event) => {
      const rowEl = event.target && typeof event.target.closest === 'function'
        ? event.target.closest('tr[data-row-index]')
        : null;
      if (!rowEl || !bodyEl.contains(rowEl)) return;
      const rowIndex = Number(rowEl.dataset.rowIndex);
      if (!Number.isInteger(rowIndex)) return;
      setHoveredRowIndex(rowIndex);
    });

    bodyEl.addEventListener('mouseleave', () => {
      setHoveredRowIndex(-1);
    });

    bodyEl.addEventListener('click', (event) => {
      if (state.activeEdit && event.target && typeof event.target.closest === 'function') {
        const editor = event.target.closest('.vm-list-popover__editor');
        if (editor) return;
      }
      const editButton = event.target && typeof event.target.closest === 'function'
        ? event.target.closest('[data-edit-field]')
        : null;
      if (editButton && bodyEl.contains(editButton)) {
        const rowIndex = Number(editButton.dataset.rowIndex);
        const columnKey = String(editButton.dataset.editField || '');
        if (Number.isInteger(rowIndex) && columnKey) {
          beginInlineEdit(rowIndex, columnKey, editButton.parentElement || editButton);
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
      const rowEl = event.target && typeof event.target.closest === 'function'
        ? event.target.closest('tr[data-row-index]')
        : null;
      if (!rowEl || !bodyEl.contains(rowEl)) return;
      const rowIndex = Number(rowEl.dataset.rowIndex);
      if (!Number.isInteger(rowIndex)) return;
      state.keyboardRowIndex = rowIndex;
      setHoveredRowIndex(rowIndex);
      focusBody();
      activateRow(rowIndex);
    });

    bodyEl.addEventListener('keydown', (event) => {
      if (state.activeEdit) return;
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveKeyboardRow('up');
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveKeyboardRow('down');
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        moveKeyboardRow('home');
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        moveKeyboardRow('end');
        return;
      }
      if (event.key === 'PageUp') {
        event.preventDefault();
        moveKeyboardRow('pageup');
        return;
      }
      if (event.key === 'PageDown') {
        event.preventDefault();
        moveKeyboardRow('pagedown');
        return;
      }
      if (event.key === 'Enter') {
        const rowIndex = Number.isInteger(state.keyboardRowIndex) ? state.keyboardRowIndex : getHoveredRowIndex();
        if (Number.isInteger(rowIndex) && rowIndex >= 0) {
          event.preventDefault();
          activateRow(rowIndex);
        }
        return;
      }
      if (event.key === '/' && filterInputEl && global.document.activeElement !== filterInputEl) {
        event.preventDefault();
        try {
          filterInputEl.focus({ preventScroll: true });
        } catch {
          try { filterInputEl.focus(); } catch { }
        }
        if (typeof filterInputEl.select === 'function') filterInputEl.select();
        return;
      }
      if (event.key === 'Escape' && onRequestClose) {
        event.preventDefault();
        onRequestClose();
      }
    });

    return Object.freeze({
      render: buildTable,
      syncVisibleRows,
      destroy() {
        bodyEl.innerHTML = '';
        state.items = [];
        state.rows = [];
        state.activeEdit = null;
        setEditStateSnapshot(null);
      },
      focusFilter() {
        if (!filterInputEl || typeof filterInputEl.focus !== 'function') return;
        try {
          filterInputEl.focus({ preventScroll: true });
        } catch {
          try { filterInputEl.focus(); } catch { }
        }
      },
      focusBody,
      cancelInlineEdit,
      commitInlineEdit() {
        return commitInlineEdit({ onEditCell: options.onEditCell });
      },
    });
  }

  global.VibeMolListPopover = Object.freeze({
    createListPopoverController,
    findNextEditableCellPosition,
    formatOrbitalSpinGlyph,
    getOrbitalBoundary,
    formatOrbitalRelativeLabel,
    passesOrbitalEnergyThreshold,
    resolveSingleDividerPlacement,
  });
})(window);
