(function (global) {
  'use strict';

  /**
   * Create one bond-editing controller that owns popup state and bond-tool edits.
   * App-specific scene/history behavior is injected through callbacks.
   * @param {{
   *   THREE:any,
   *   popupEl:HTMLElement|null,
   *   popupButtonsEl:HTMLElement|null,
   *   canvasEl:HTMLElement|null,
   *   getCamera:()=>any,
   *   canUsePopup:()=>boolean,
   *   normalizeOrder:(order:any)=>number,
   *   getDisplayedOrder:(carrier:any)=>number,
   *   focusCarrier:(carrier:any)=>void,
   *   blurCarrier:(carrier:any)=>void,
   *   onPendingSelectionChanged:()=>void,
   *   ensureEditableRecord:()=>any,
   *   ensureVolumeSchema:(vol:any, options?:object)=>any,
   *   cloneBondSnapshot:(vol:any)=>Array<object>,
   *   bondSnapshotsEqual:(a:Array<object>, b:Array<object>)=>boolean,
   *   cloneAtomsSnapshot:(vol:any)=>Array<object>,
   *   pushEditHistoryEntry:(record:any, beforeAtoms:Array<object>, afterAtoms:Array<object>, label:string, options?:object)=>void,
   *   clearHover:()=>void,
   *   rebuildScene:(options?:object)=>void,
   *   updateSidePanel:()=>void,
   *   ensureAtomId:(atom:any)=>string,
   *   findVolumeBondRecordIndex:(vol:any, atomIdA:any, atomIdB:any)=>number,
   *   normalizeVolumeBondRecord:(vol:any, raw:any)=>any,
   *   upsertVolumeBond:(vol:any, atomIdA:any, atomIdB:any, order:any, kind?:any)=>('created'|'updated'|'unchanged'|null),
   *   removeVolumeBond:(vol:any, atomIdA:any, atomIdB:any)=>boolean,
   *   getElementSymbol:(z:any)=>string,
   *   getBondAction:()=>string,
   *   getBondOrder:()=>number,
   *   setBondOrder:(order:any, options?:object)=>void,
   *   setHintMessage:(message:string)=>void,
   * }} options
   */
  function createBondEditingController(options = {}) {
    const THREE = options.THREE;
    const popupEl = options.popupEl || null;
    const popupButtonsEl = options.popupButtonsEl || null;
    const canvasEl = options.canvasEl || null;
    const canUsePopup = typeof options.canUsePopup === 'function' ? options.canUsePopup : () => false;
    const normalizeOrder = typeof options.normalizeOrder === 'function' ? options.normalizeOrder : ((order) => Number(order) || 1);
    const getDisplayedOrder = typeof options.getDisplayedOrder === 'function' ? options.getDisplayedOrder : (() => 1);
    const focusCarrier = typeof options.focusCarrier === 'function' ? options.focusCarrier : (() => {});
    const blurCarrier = typeof options.blurCarrier === 'function' ? options.blurCarrier : (() => {});
    const onPendingSelectionChanged = typeof options.onPendingSelectionChanged === 'function' ? options.onPendingSelectionChanged : (() => {});
    const ensureEditableRecord = typeof options.ensureEditableRecord === 'function' ? options.ensureEditableRecord : (() => null);
    const ensureVolumeSchema = typeof options.ensureVolumeSchema === 'function' ? options.ensureVolumeSchema : (() => null);
    const cloneBondSnapshot = typeof options.cloneBondSnapshot === 'function' ? options.cloneBondSnapshot : (() => []);
    const bondSnapshotsEqual = typeof options.bondSnapshotsEqual === 'function' ? options.bondSnapshotsEqual : (() => false);
    const cloneAtomsSnapshot = typeof options.cloneAtomsSnapshot === 'function' ? options.cloneAtomsSnapshot : (() => []);
    const pushEditHistoryEntry = typeof options.pushEditHistoryEntry === 'function' ? options.pushEditHistoryEntry : (() => {});
    const clearHover = typeof options.clearHover === 'function' ? options.clearHover : (() => {});
    const rebuildScene = typeof options.rebuildScene === 'function' ? options.rebuildScene : (() => {});
    const updateSidePanel = typeof options.updateSidePanel === 'function' ? options.updateSidePanel : (() => {});
    const ensureAtomId = typeof options.ensureAtomId === 'function' ? options.ensureAtomId : ((atom) => String(atom && atom.id || ''));
    const findVolumeBondRecordIndex = typeof options.findVolumeBondRecordIndex === 'function' ? options.findVolumeBondRecordIndex : (() => -1);
    const normalizeVolumeBondRecord = typeof options.normalizeVolumeBondRecord === 'function' ? options.normalizeVolumeBondRecord : (() => null);
    const upsertVolumeBond = typeof options.upsertVolumeBond === 'function' ? options.upsertVolumeBond : (() => null);
    const removeVolumeBond = typeof options.removeVolumeBond === 'function' ? options.removeVolumeBond : (() => false);
    const getElementSymbol = typeof options.getElementSymbol === 'function' ? options.getElementSymbol : ((z) => String(z || '?'));
    const getBondAction = typeof options.getBondAction === 'function' ? options.getBondAction : (() => 'set');
    const getBondOrder = typeof options.getBondOrder === 'function' ? options.getBondOrder : (() => 1);
    const setBondOrder = typeof options.setBondOrder === 'function' ? options.setBondOrder : (() => {});
    const setHintMessage = typeof options.setHintMessage === 'function' ? options.setHintMessage : (() => {});

    let pendingAtomId = '';
    let popupCarrier = null;
    let popupClickHandled = false;

    function getPendingAtomIndex(vol) {
      if (!vol || !Array.isArray(vol.atoms) || !pendingAtomId) return -1;
      const targetId = String(pendingAtomId || '').trim();
      if (!targetId) return -1;
      for (let i = 0; i < vol.atoms.length; i++) {
        const atom = vol.atoms[i];
        if (!atom) continue;
        if (String(ensureAtomId(atom)) === targetId) return i;
      }
      return -1;
    }

    function clearPendingSelection() {
      if (!pendingAtomId) return false;
      pendingAtomId = '';
      onPendingSelectionChanged();
      return true;
    }

    function getPopupCarrier() {
      return popupCarrier;
    }

    function consumePopupClickHandled() {
      const handled = popupClickHandled;
      popupClickHandled = false;
      return handled;
    }

    function positionPopup() {
      if (!popupEl || !popupCarrier || !canUsePopup() || !THREE || !canvasEl) return;
      const camera = typeof options.getCamera === 'function' ? options.getCamera() : null;
      if (!camera) return;
      const anchor = new THREE.Vector3();
      try {
        popupCarrier.getWorldPosition(anchor);
      } catch {
        return;
      }
      anchor.project(camera);
      if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) || !Number.isFinite(anchor.z)) return;
      const rect = canvasEl.getBoundingClientRect();
      const viewportWidth = Math.max(1, Math.round(window.innerWidth || 0));
      const viewportHeight = Math.max(1, Math.round(window.innerHeight || 0));
      const popupRect = popupEl.getBoundingClientRect();
      const popupWidth = Math.max(132, Math.round(popupRect.width || popupEl.offsetWidth || 132));
      const popupHeight = Math.max(72, Math.round(popupRect.height || popupEl.offsetHeight || 72));
      const pad = 12;
      let left = rect.left + ((anchor.x + 1) * 0.5 * rect.width) + 16;
      let top = rect.top + ((1 - anchor.y) * 0.5 * rect.height) - (popupHeight * 0.5);
      const maxLeft = Math.max(pad, viewportWidth - popupWidth - pad);
      const maxTop = Math.max(pad, viewportHeight - popupHeight - pad);
      if (left > maxLeft) left = Math.max(pad, rect.left + ((anchor.x + 1) * 0.5 * rect.width) - popupWidth - 16);
      left = Math.max(pad, Math.min(maxLeft, left));
      top = Math.max(pad, Math.min(maxTop, top));
      popupEl.style.left = `${Math.round(left)}px`;
      popupEl.style.top = `${Math.round(top)}px`;
    }

    function hidePopup() {
      if (popupCarrier) blurCarrier(popupCarrier);
      popupCarrier = null;
      if (popupEl) popupEl.setAttribute('aria-hidden', 'true');
    }

    function showPopupForCarrier(carrier, popupOptions = {}) {
      if (!carrier || !carrier.userData || !canUsePopup() || !popupEl) {
        hidePopup();
        return false;
      }
      if (popupCarrier && popupCarrier !== carrier) blurCarrier(popupCarrier);
      popupCarrier = carrier;
      focusCarrier(carrier);
      const activeOrder = getDisplayedOrder(carrier);
      if (popupButtonsEl) {
        const buttons = popupButtonsEl.querySelectorAll('button[data-bond-order-popup]');
        for (const btn of buttons) {
          const rawOrder = Number(btn.getAttribute('data-bond-order-popup'));
          btn.classList.toggle('active', Number.isFinite(rawOrder) && rawOrder > 0 && normalizeOrder(rawOrder) === activeOrder);
        }
      }
      popupEl.setAttribute('aria-hidden', 'false');
      positionPopup();
      if (popupOptions.markClickHandled) popupClickHandled = true;
      return true;
    }

    function refreshPopup() {
      if (popupCarrier) showPopupForCarrier(popupCarrier);
    }

    function finalizeBondGraphEdit(record, vol, beforeBonds, actionLabel) {
      if (!record || !vol || !Array.isArray(beforeBonds)) return false;
      ensureVolumeSchema(vol, { inferMissingBonds: false });
      const afterBonds = cloneBondSnapshot(vol);
      if (bondSnapshotsEqual(beforeBonds, afterBonds)) return false;
      const atomSnapshot = cloneAtomsSnapshot(vol);
      pushEditHistoryEntry(record, atomSnapshot, atomSnapshot, actionLabel, {
        beforeBonds,
        afterBonds,
      });
      clearHover();
      rebuildScene({ preserveView: true });
      updateSidePanel();
      return true;
    }

    function applyToCarrier(carrier, applyOptions = {}) {
      const record = ensureEditableRecord();
      const vol = record && record.vol;
      if (!record || !vol || !carrier || !carrier.userData) return false;
      const i = carrier.userData.i | 0;
      const j = carrier.userData.j | 0;
      if (!Array.isArray(vol.atoms) || i < 0 || j < 0 || i >= vol.atoms.length || j >= vol.atoms.length || i === j) return false;
      const atomA = vol.atoms[i];
      const atomB = vol.atoms[j];
      const atomIdA = ensureAtomId(atomA);
      const atomIdB = ensureAtomId(atomB);
      const beforeBonds = cloneBondSnapshot(vol);
      hidePopup();
      clearPendingSelection();
      if (applyOptions.deleteOverride || getBondAction() === 'delete') {
        if (!removeVolumeBond(vol, atomIdA, atomIdB)) {
          setHintMessage('Bond tool: no explicit bond to delete.');
          return false;
        }
        const symbolA = getElementSymbol(atomA.Z | 0);
        const symbolB = getElementSymbol(atomB.Z | 0);
        if (finalizeBondGraphEdit(record, vol, beforeBonds, `Delete bond ${symbolA}-${symbolB}`)) {
          setHintMessage(`Deleted bond ${symbolA}-${symbolB}.`);
          return true;
        }
        return false;
      }
      const nextOrder = normalizeOrder(Number.isFinite(applyOptions.orderOverride) ? applyOptions.orderOverride : getBondOrder());
      const status = upsertVolumeBond(vol, atomIdA, atomIdB, nextOrder, 'normal');
      if (!status || status === 'unchanged') {
        setHintMessage(`Bond tool: ${getElementSymbol(atomA.Z | 0)}-${getElementSymbol(atomB.Z | 0)} is already order ${nextOrder}.`);
        return false;
      }
      const symbolA = getElementSymbol(atomA.Z | 0);
      const symbolB = getElementSymbol(atomB.Z | 0);
      if (finalizeBondGraphEdit(record, vol, beforeBonds, `${status === 'created' ? 'Create' : 'Update'} bond ${symbolA}-${symbolB}`)) {
        setHintMessage(`${status === 'created' ? 'Created' : 'Updated'} ${symbolA}-${symbolB} bond to order ${nextOrder}.`);
        return true;
      }
      return false;
    }

    function applyToAtom(atomIndex) {
      const record = ensureEditableRecord();
      const vol = record && record.vol;
      const idx = atomIndex | 0;
      if (!record || !vol || !Array.isArray(vol.atoms) || idx < 0 || idx >= vol.atoms.length) return false;
      const atom = vol.atoms[idx];
      const atomId = ensureAtomId(atom);
      const pendingIndex = getPendingAtomIndex(vol);
      hidePopup();
      if (pendingIndex < 0) {
        pendingAtomId = atomId;
        onPendingSelectionChanged();
        setHintMessage(`Bond tool: first atom selected (${getElementSymbol(atom.Z | 0)}). Click a second atom to create a bond of order ${getBondOrder()}.`);
        return true;
      }
      if (pendingIndex === idx) {
        clearPendingSelection();
        setHintMessage('Bond tool: first atom selection cleared.');
        return true;
      }
      const pendingAtom = vol.atoms[pendingIndex];
      if (findVolumeBondRecordIndex(vol, ensureAtomId(pendingAtom), atomId) >= 0) {
        clearPendingSelection();
        setHintMessage(`Bond already exists between ${getElementSymbol(pendingAtom.Z | 0)} and ${getElementSymbol(atom.Z | 0)}. Click the bond to change its order.`);
        return false;
      }
      const beforeBonds = cloneBondSnapshot(vol);
      const nextOrder = normalizeOrder(getBondOrder());
      const status = upsertVolumeBond(vol, ensureAtomId(pendingAtom), atomId, nextOrder, 'normal');
      clearPendingSelection();
      if (!status || status === 'unchanged') {
        setHintMessage(`Bond already exists between ${getElementSymbol(pendingAtom.Z | 0)} and ${getElementSymbol(atom.Z | 0)}. Click the bond to change its order.`);
        return false;
      }
      const symbolA = getElementSymbol(pendingAtom.Z | 0);
      const symbolB = getElementSymbol(atom.Z | 0);
      if (finalizeBondGraphEdit(record, vol, beforeBonds, `${status === 'created' ? 'Create' : 'Update'} bond ${symbolA}-${symbolB}`)) {
        setHintMessage(`${status === 'created' ? 'Created' : 'Updated'} ${symbolA}-${symbolB} bond to order ${nextOrder}.`);
        return true;
      }
      return false;
    }

    if (popupButtonsEl) {
      const popupButtons = popupButtonsEl.querySelectorAll('button[data-bond-order-popup]');
      for (const btn of popupButtons) {
        btn.addEventListener('click', () => {
          if (!popupCarrier) return;
          const rawOrder = Number(btn.getAttribute('data-bond-order-popup'));
          const carrier = popupCarrier;
          hidePopup();
          if (!Number.isFinite(rawOrder) || rawOrder < 0) return;
          if (rawOrder === 0) {
            applyToCarrier(carrier, { deleteOverride: true });
            return;
          }
          const order = normalizeOrder(rawOrder);
          setBondOrder(order, { announce: false });
          applyToCarrier(carrier, { orderOverride: order });
        });
      }
    }

    return {
      getPendingAtomIndex,
      clearPendingSelection,
      getPopupCarrier,
      consumePopupClickHandled,
      positionPopup,
      hidePopup,
      showPopupForCarrier,
      refreshPopup,
      applyToCarrier,
      applyToAtom,
      clearState(clearOptions = {}) {
        if (clearOptions.pendingSelection !== false) clearPendingSelection();
        if (clearOptions.popup !== false) hidePopup();
        if (clearOptions.clickHandled !== false) popupClickHandled = false;
      },
    };
  }

  global.VibeMolBondEditing = Object.freeze({
    createBondEditingController,
  });
})(window);
