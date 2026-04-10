(function (global) {
  'use strict';

  /**
   * Create one bond-editing controller that owns popup state and bond-tool edits.
   * App-specific scene/history behavior is injected through callbacks.
   * @param {{
   *   THREE:any,
   *   popupEl:HTMLElement|null,
   *   popupTitleEl:HTMLElement|null,
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
   *   cloneVolumeAnnotationsSnapshot:(vol:any)=>object,
   *   atomUnitsToAng:(vol:any, atom:any)=>any,
   *   adjustHydrogensAfterBondEdit:(vol:any, atomIndices:Array<number>, options?:object)=>({added:number,removed:number}|null),
   *   pushEditHistoryEntry:(record:any, beforeAtoms:Array<object>, afterAtoms:Array<object>, label:string, options?:object)=>void,
   *   clearHover:()=>void,
   *   rebuildScene:(options?:object)=>void,
   *   updateSidePanel:()=>void,
   *   ensureAtomId:(atom:any)=>string,
   *   findVolumeBondRecordIndex:(vol:any, atomIdA:any, atomIdB:any)=>number,
   *   normalizeVolumeBondRecord:(vol:any, raw:any)=>any,
   *   normalizeVolumeBondStyle?:(style:any)=>string,
   *   upsertVolumeBond:(vol:any, atomIdA:any, atomIdB:any, order:any, kind?:any)=>('created'|'updated'|'unchanged'|null),
   *   removeVolumeBond:(vol:any, atomIdA:any, atomIdB:any)=>boolean,
   *   getElementSymbol:(z:any)=>string,
   *   isMetalAtomZ?:(z:any)=>boolean,
   *   getBondStyleLabel?:(style:any)=>string,
   *   resolveDefaultBondStyle?:(atomA:any, atomB:any)=>string,
   *   getBondAction:()=>string,
   *   getBondOrder:()=>number,
   *   setBondOrder:(order:any, options?:object)=>void,
   *   setHintMessage:(message:string)=>void,
   * }} options
   */
  function createBondEditingController(options = {}) {
    const THREE = options.THREE;
    const popupEl = options.popupEl || null;
    const popupTitleEl = options.popupTitleEl || null;
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
    const cloneVolumeAnnotationsSnapshot = typeof options.cloneVolumeAnnotationsSnapshot === 'function'
      ? options.cloneVolumeAnnotationsSnapshot
      : (() => ({ builder: { byAtomId: {} }, coordination: { byAtomId: {} } }));
    const atomUnitsToAng = typeof options.atomUnitsToAng === 'function' ? options.atomUnitsToAng : null;
    const adjustHydrogensAfterBondEdit = typeof options.adjustHydrogensAfterBondEdit === 'function'
      ? options.adjustHydrogensAfterBondEdit
      : null;
    const pushEditHistoryEntry = typeof options.pushEditHistoryEntry === 'function' ? options.pushEditHistoryEntry : (() => {});
    const clearHover = typeof options.clearHover === 'function' ? options.clearHover : (() => {});
    const rebuildScene = typeof options.rebuildScene === 'function' ? options.rebuildScene : (() => {});
    const updateSidePanel = typeof options.updateSidePanel === 'function' ? options.updateSidePanel : (() => {});
    const ensureAtomId = typeof options.ensureAtomId === 'function' ? options.ensureAtomId : ((atom) => String(atom && atom.id || ''));
    const findVolumeBondRecordIndex = typeof options.findVolumeBondRecordIndex === 'function' ? options.findVolumeBondRecordIndex : (() => -1);
    const normalizeVolumeBondRecord = typeof options.normalizeVolumeBondRecord === 'function' ? options.normalizeVolumeBondRecord : (() => null);
    const normalizeVolumeBondStyle = typeof options.normalizeVolumeBondStyle === 'function' ? options.normalizeVolumeBondStyle : ((style) => String(style || 'covalent'));
    const upsertVolumeBond = typeof options.upsertVolumeBond === 'function' ? options.upsertVolumeBond : (() => null);
    const removeVolumeBond = typeof options.removeVolumeBond === 'function' ? options.removeVolumeBond : (() => false);
    const getElementSymbol = typeof options.getElementSymbol === 'function' ? options.getElementSymbol : ((z) => String(z || '?'));
    const isMetalAtomZ = typeof options.isMetalAtomZ === 'function' ? options.isMetalAtomZ : (() => false);
    const getBondStyleLabel = typeof options.getBondStyleLabel === 'function' ? options.getBondStyleLabel : ((style) => String(style || ''));
    const resolveDefaultBondStyle = typeof options.resolveDefaultBondStyle === 'function'
      ? options.resolveDefaultBondStyle
      : (() => 'covalent');
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

    function isMetalPair(atomA, atomB) {
      return !!((atomA && isMetalAtomZ(atomA.Z | 0)) || (atomB && isMetalAtomZ(atomB.Z | 0)));
    }

    function getBondRecord(vol, atomIdA, atomIdB) {
      const index = findVolumeBondRecordIndex(vol, atomIdA, atomIdB);
      return index >= 0 ? normalizeVolumeBondRecord(vol, vol.bonds[index]) : null;
    }

    function getBondPopupState(vol, atomA, atomB, carrier = null) {
      const atomIdA = ensureAtomId(atomA);
      const atomIdB = ensureAtomId(atomB);
      const bond = getBondRecord(vol, atomIdA, atomIdB);
      const metalPair = isMetalPair(atomA, atomB);
      const style = bond ? normalizeVolumeBondStyle(bond.style) : resolveDefaultBondStyle(atomA, atomB);
      const order = bond ? normalizeOrder(bond.order || 1) : normalizeOrder(carrier && carrier.userData && carrier.userData.bondOrder || 1);
      return {
        metalPair,
        style,
        order,
        bond,
      };
    }

    function syncPopupButtons(popupState) {
      if (!popupButtonsEl) return;
      const buttons = popupButtonsEl.querySelectorAll('button[data-bond-order-popup]');
      for (const btn of buttons) {
        const rawOrder = Number(btn.getAttribute('data-bond-order-popup'));
        if (popupState && popupState.metalPair) {
          if (rawOrder === 4) {
            btn.hidden = true;
            btn.classList.remove('active');
            continue;
          }
          btn.hidden = false;
          if (rawOrder === 1) btn.textContent = 'Covalent';
          else if (rawOrder === 2) btn.textContent = 'Coordination';
          else if (rawOrder === 3) btn.textContent = 'Dative';
          else if (rawOrder === 0) btn.textContent = 'None';
          btn.classList.toggle('active',
            (rawOrder === 0 && popupState.style === 'blocked')
            || (rawOrder === 1 && popupState.style === 'covalent')
            || (rawOrder === 2 && popupState.style === 'metal-strong')
            || (rawOrder === 3 && popupState.style === 'metal-dative')
          );
          continue;
        }
        btn.hidden = false;
        if (Number.isFinite(rawOrder)) btn.textContent = String(rawOrder);
        btn.classList.toggle('active', Number.isFinite(rawOrder) && rawOrder > 0 && normalizeOrder(rawOrder) === (popupState ? popupState.order : 1));
      }
      if (popupTitleEl) popupTitleEl.textContent = popupState && popupState.metalPair ? 'Bond style' : 'Bond order';
    }

    function mapMetalPopupChoiceToStyle(rawOrder) {
      if (rawOrder === 1) return 'covalent';
      if (rawOrder === 2) return 'metal-strong';
      if (rawOrder === 3) return 'metal-dative';
      return 'blocked';
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
      const record = ensureEditableRecord();
      const vol = record && record.vol;
      const i = carrier.userData.i | 0;
      const j = carrier.userData.j | 0;
      const atomA = vol && Array.isArray(vol.atoms) ? vol.atoms[i] : null;
      const atomB = vol && Array.isArray(vol.atoms) ? vol.atoms[j] : null;
      syncPopupButtons(vol && atomA && atomB ? getBondPopupState(vol, atomA, atomB, carrier) : null);
      popupEl.setAttribute('aria-hidden', 'false');
      positionPopup();
      if (popupOptions.markClickHandled) popupClickHandled = true;
      return true;
    }

    function refreshPopup() {
      if (popupCarrier) showPopupForCarrier(popupCarrier);
    }

    function buildPreferredDirByAtomId(vol, atomA, atomB) {
      if (!atomA || !atomB) return null;
      const left = atomUnitsToAng ? atomUnitsToAng(vol, atomA) : atomA;
      const right = atomUnitsToAng ? atomUnitsToAng(vol, atomB) : atomB;
      const ax = Number(left && left.x);
      const ay = Number(left && left.y);
      const az = Number(left && left.z);
      const bx = Number(right && right.x);
      const by = Number(right && right.y);
      const bz = Number(right && right.z);
      if (![ax, ay, az, bx, by, bz].every(Number.isFinite)) return null;
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const lenSq = dx * dx + dy * dy + dz * dz;
      if (!(lenSq > 1e-12)) return null;
      if (THREE && typeof THREE.Vector3 === 'function') {
        const map = new Map();
        map.set(String(ensureAtomId(atomA)), new THREE.Vector3(dx, dy, dz));
        map.set(String(ensureAtomId(atomB)), new THREE.Vector3(-dx, -dy, -dz));
        return map;
      }
      return null;
    }

    function applyHydrogenAdjustmentForBondEdit(vol, atomIndexA, atomIndexB, atomA, atomB) {
      if (!adjustHydrogensAfterBondEdit || !vol || !atomA || !atomB) return null;
      const preferredDirByAtomId = buildPreferredDirByAtomId(vol, atomA, atomB);
      return adjustHydrogensAfterBondEdit(vol, [atomIndexA | 0, atomIndexB | 0], {
        preferredDirByAtomId: preferredDirByAtomId || undefined,
      });
    }

    function finalizeBondGraphEdit(record, vol, beforeAtoms, beforeBonds, beforeAnnotations, actionLabel) {
      if (!record || !vol || !Array.isArray(beforeBonds)) return false;
      ensureVolumeSchema(vol, { inferMissingBonds: false });
      const afterBonds = cloneBondSnapshot(vol);
      if (bondSnapshotsEqual(beforeBonds, afterBonds)) return false;
      const afterAtoms = cloneAtomsSnapshot(vol);
      const historyOptions = {
        beforeBonds,
        afterBonds,
      };
      if (Array.isArray(beforeAtoms)) {
        historyOptions.beforeAnnotations = beforeAnnotations && typeof beforeAnnotations === 'object' ? beforeAnnotations : null;
        historyOptions.afterAnnotations = beforeAnnotations && typeof beforeAnnotations === 'object'
          ? cloneVolumeAnnotationsSnapshot(vol)
          : null;
      }
      pushEditHistoryEntry(record, Array.isArray(beforeAtoms) ? beforeAtoms : afterAtoms, afterAtoms, actionLabel, historyOptions);
      clearHover();
      rebuildScene({ preserveView: true });
      updateSidePanel();
      return true;
    }

    function applyBondState(vol, atomIdA, atomIdB, atomA, atomB, applyOptions = {}) {
      const metalPair = isMetalPair(atomA, atomB);
      if (applyOptions.deleteOverride) {
        return upsertVolumeBond(vol, atomIdA, atomIdB, 1, 'blocked', 'explicit', metalPair ? resolveDefaultBondStyle(atomA, atomB) : 'covalent');
      }
      if (metalPair) {
        const nextStyle = normalizeVolumeBondStyle(
          applyOptions.styleOverride == null ? resolveDefaultBondStyle(atomA, atomB) : applyOptions.styleOverride
        );
        return upsertVolumeBond(vol, atomIdA, atomIdB, 1, 'normal', 'explicit', nextStyle);
      }
      const nextOrder = normalizeOrder(Number.isFinite(applyOptions.orderOverride) ? applyOptions.orderOverride : getBondOrder());
      return upsertVolumeBond(vol, atomIdA, atomIdB, nextOrder, 'normal', 'explicit', 'covalent');
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
      const beforeAtoms = cloneAtomsSnapshot(vol);
      const beforeBonds = cloneBondSnapshot(vol);
      const beforeAnnotations = cloneVolumeAnnotationsSnapshot(vol);
      hidePopup();
      clearPendingSelection();
      if (applyOptions.deleteOverride || getBondAction() === 'delete') {
        const status = applyBondState(vol, atomIdA, atomIdB, atomA, atomB, { deleteOverride: true });
        if (!status || status === 'unchanged') return false;
        const symbolA = getElementSymbol(atomA.Z | 0);
        const symbolB = getElementSymbol(atomB.Z | 0);
        applyHydrogenAdjustmentForBondEdit(vol, i, j, atomA, atomB);
        if (finalizeBondGraphEdit(record, vol, beforeAtoms, beforeBonds, beforeAnnotations, `Delete bond ${symbolA}-${symbolB}`)) {
          setHintMessage(`Deleted bond ${symbolA}-${symbolB}.`);
          return true;
        }
        return false;
      }
      const nextOrder = normalizeOrder(Number.isFinite(applyOptions.orderOverride) ? applyOptions.orderOverride : getBondOrder());
      const nextStyle = applyOptions.styleOverride == null ? resolveDefaultBondStyle(atomA, atomB) : applyOptions.styleOverride;
      const status = applyBondState(vol, atomIdA, atomIdB, atomA, atomB, {
        orderOverride: nextOrder,
        styleOverride: nextStyle,
      });
      if (!status || status === 'unchanged') {
        setHintMessage(`Bond tool: ${getElementSymbol(atomA.Z | 0)}-${getElementSymbol(atomB.Z | 0)} is already order ${nextOrder}.`);
        return false;
      }
      const symbolA = getElementSymbol(atomA.Z | 0);
      const symbolB = getElementSymbol(atomB.Z | 0);
      applyHydrogenAdjustmentForBondEdit(vol, i, j, atomA, atomB);
      if (finalizeBondGraphEdit(record, vol, beforeAtoms, beforeBonds, beforeAnnotations, `${status === 'created' ? 'Create' : 'Update'} bond ${symbolA}-${symbolB}`)) {
        if (isMetalPair(atomA, atomB)) setHintMessage(`${status === 'created' ? 'Created' : 'Updated'} ${symbolA}-${symbolB} bond as ${getBondStyleLabel(nextStyle)}.`);
        else setHintMessage(`${status === 'created' ? 'Created' : 'Updated'} ${symbolA}-${symbolB} bond to order ${nextOrder}.`);
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
      const beforeAtoms = cloneAtomsSnapshot(vol);
      const beforeAnnotations = cloneVolumeAnnotationsSnapshot(vol);
      const nextOrder = normalizeOrder(getBondOrder());
      const nextStyle = resolveDefaultBondStyle(pendingAtom, atom);
      const status = applyBondState(vol, ensureAtomId(pendingAtom), atomId, pendingAtom, atom, {
        orderOverride: nextOrder,
        styleOverride: nextStyle,
      });
      clearPendingSelection();
      if (!status || status === 'unchanged') {
        setHintMessage(`Bond already exists between ${getElementSymbol(pendingAtom.Z | 0)} and ${getElementSymbol(atom.Z | 0)}. Click the bond to change its order.`);
        return false;
      }
      const symbolA = getElementSymbol(pendingAtom.Z | 0);
      const symbolB = getElementSymbol(atom.Z | 0);
      applyHydrogenAdjustmentForBondEdit(vol, pendingIndex, idx, pendingAtom, atom);
      if (finalizeBondGraphEdit(record, vol, beforeAtoms, beforeBonds, beforeAnnotations, `${status === 'created' ? 'Create' : 'Update'} bond ${symbolA}-${symbolB}`)) {
        if (isMetalPair(pendingAtom, atom)) setHintMessage(`${status === 'created' ? 'Created' : 'Updated'} ${symbolA}-${symbolB} bond as ${getBondStyleLabel(nextStyle)}.`);
        else setHintMessage(`${status === 'created' ? 'Created' : 'Updated'} ${symbolA}-${symbolB} bond to order ${nextOrder}.`);
        return true;
      }
      return false;
    }

    function applyToAtomPair(atomIndexA, atomIndexB, applyOptions = {}) {
      const record = ensureEditableRecord();
      const vol = record && record.vol;
      const aIndex = atomIndexA | 0;
      const bIndex = atomIndexB | 0;
      if (!record || !vol || !Array.isArray(vol.atoms) || aIndex < 0 || bIndex < 0 || aIndex >= vol.atoms.length || bIndex >= vol.atoms.length || aIndex === bIndex) {
        return false;
      }
      const atomA = vol.atoms[aIndex];
      const atomB = vol.atoms[bIndex];
      const atomIdA = ensureAtomId(atomA);
      const atomIdB = ensureAtomId(atomB);
      const currentIndex = findVolumeBondRecordIndex(vol, atomIdA, atomIdB);
      const currentBond = currentIndex >= 0 ? normalizeVolumeBondRecord(vol, vol.bonds[currentIndex]) : null;
      const beforeAtoms = cloneAtomsSnapshot(vol);
      const beforeBonds = cloneBondSnapshot(vol);
      const beforeAnnotations = cloneVolumeAnnotationsSnapshot(vol);
      hidePopup();
      clearPendingSelection();

      if (applyOptions.cycle) {
        if (isMetalPair(atomA, atomB)) {
          const currentStyle = currentBond && currentBond.kind !== 'blocked'
            ? normalizeVolumeBondStyle(currentBond.style)
            : 'blocked';
          const nextStyle = currentStyle === 'covalent'
            ? 'metal-strong'
            : (currentStyle === 'metal-strong'
              ? 'metal-dative'
              : (currentStyle === 'metal-dative' ? 'blocked' : resolveDefaultBondStyle(atomA, atomB)));
          const status = nextStyle === 'blocked'
            ? applyBondState(vol, atomIdA, atomIdB, atomA, atomB, { deleteOverride: true })
            : applyBondState(vol, atomIdA, atomIdB, atomA, atomB, { styleOverride: nextStyle });
          if (!status || status === 'unchanged') return false;
          const symbolA = getElementSymbol(atomA.Z | 0);
          const symbolB = getElementSymbol(atomB.Z | 0);
          applyHydrogenAdjustmentForBondEdit(vol, aIndex, bIndex, atomA, atomB);
          if (finalizeBondGraphEdit(record, vol, beforeAtoms, beforeBonds, beforeAnnotations, `${nextStyle === 'blocked' ? 'Delete' : (status === 'created' ? 'Create' : 'Update')} bond ${symbolA}-${symbolB}`)) {
            if (nextStyle === 'blocked') setHintMessage(`Deleted ${symbolA}-${symbolB} bond.`);
            else setHintMessage(`${status === 'created' ? 'Created' : 'Updated'} ${symbolA}-${symbolB} bond as ${getBondStyleLabel(nextStyle)}.`);
            return true;
          }
          return false;
        }
        const currentOrder = currentBond && currentBond.kind !== 'blocked' ? normalizeOrder(currentBond.order || 1) : 0;
        if (currentOrder >= 3) {
          const status = applyBondState(vol, atomIdA, atomIdB, atomA, atomB, { deleteOverride: true });
          if (!status || status === 'unchanged') return false;
          const symbolA = getElementSymbol(atomA.Z | 0);
          const symbolB = getElementSymbol(atomB.Z | 0);
          applyHydrogenAdjustmentForBondEdit(vol, aIndex, bIndex, atomA, atomB);
          if (finalizeBondGraphEdit(record, vol, beforeAtoms, beforeBonds, beforeAnnotations, `Delete bond ${symbolA}-${symbolB}`)) {
            setHintMessage(`Deleted ${symbolA}-${symbolB} bond.`);
            return true;
          }
          return false;
        }
        const nextOrder = currentOrder > 0
          ? currentOrder + 1
          : normalizeOrder(Number.isFinite(applyOptions.createOrder) ? applyOptions.createOrder : 1);
        const status = applyBondState(vol, atomIdA, atomIdB, atomA, atomB, { orderOverride: nextOrder });
        if (!status || status === 'unchanged') return false;
        const symbolA = getElementSymbol(atomA.Z | 0);
        const symbolB = getElementSymbol(atomB.Z | 0);
        applyHydrogenAdjustmentForBondEdit(vol, aIndex, bIndex, atomA, atomB);
        if (finalizeBondGraphEdit(record, vol, beforeAtoms, beforeBonds, beforeAnnotations, `${status === 'created' ? 'Create' : 'Update'} bond ${symbolA}-${symbolB}`)) {
          setHintMessage(`${status === 'created' ? 'Created' : 'Updated'} ${symbolA}-${symbolB} bond to order ${nextOrder}.`);
          return true;
        }
        return false;
      }

      if (applyOptions.deleteOverride) {
        const status = applyBondState(vol, atomIdA, atomIdB, atomA, atomB, { deleteOverride: true });
        if (!status || status === 'unchanged') return false;
        const symbolA = getElementSymbol(atomA.Z | 0);
        const symbolB = getElementSymbol(atomB.Z | 0);
        applyHydrogenAdjustmentForBondEdit(vol, aIndex, bIndex, atomA, atomB);
        if (finalizeBondGraphEdit(record, vol, beforeAtoms, beforeBonds, beforeAnnotations, `Delete bond ${symbolA}-${symbolB}`)) {
          setHintMessage(`Deleted ${symbolA}-${symbolB} bond.`);
          return true;
        }
        return false;
      }

      const nextOrder = normalizeOrder(Number.isFinite(applyOptions.orderOverride) ? applyOptions.orderOverride : getBondOrder());
      const nextStyle = applyOptions.styleOverride == null ? resolveDefaultBondStyle(atomA, atomB) : applyOptions.styleOverride;
      const status = applyBondState(vol, atomIdA, atomIdB, atomA, atomB, {
        orderOverride: nextOrder,
        styleOverride: nextStyle,
      });
      if (!status || status === 'unchanged') return false;
      const symbolA = getElementSymbol(atomA.Z | 0);
      const symbolB = getElementSymbol(atomB.Z | 0);
      applyHydrogenAdjustmentForBondEdit(vol, aIndex, bIndex, atomA, atomB);
      if (finalizeBondGraphEdit(record, vol, beforeAtoms, beforeBonds, beforeAnnotations, `${status === 'created' ? 'Create' : 'Update'} bond ${symbolA}-${symbolB}`)) {
        if (isMetalPair(atomA, atomB)) setHintMessage(`${status === 'created' ? 'Created' : 'Updated'} ${symbolA}-${symbolB} bond as ${getBondStyleLabel(nextStyle)}.`);
        else setHintMessage(`${status === 'created' ? 'Created' : 'Updated'} ${symbolA}-${symbolB} bond to order ${nextOrder}.`);
        return true;
      }
      return false;
    }

    function clampInteractiveBondOrder(order) {
      const n = Number(order);
      if (!Number.isFinite(n)) return 0;
      return Math.max(0, Math.min(4, Math.round(n)));
    }

    function stepCarrierOrder(carrier, delta) {
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
      const step = Number(delta) < 0 ? -1 : 1;
      const currentOrder = clampInteractiveBondOrder(getDisplayedOrder(carrier));
      const nextOrder = clampInteractiveBondOrder(currentOrder + step);
      const symbolA = getElementSymbol(atomA.Z | 0);
      const symbolB = getElementSymbol(atomB.Z | 0);
      hidePopup();
      clearPendingSelection();
      if (isMetalPair(atomA, atomB)) {
        const currentBond = getBondRecord(vol, atomIdA, atomIdB);
        const currentStyle = currentBond && currentBond.kind !== 'blocked'
          ? normalizeVolumeBondStyle(currentBond.style)
          : resolveDefaultBondStyle(atomA, atomB);
        const styles = ['covalent', 'metal-strong', 'metal-dative'];
        const currentIndex = Math.max(0, styles.indexOf(currentStyle));
        const nextIndex = Math.max(-1, Math.min(styles.length - 1, currentIndex + step));
        const beforeAtoms = cloneAtomsSnapshot(vol);
        const beforeBonds = cloneBondSnapshot(vol);
        const beforeAnnotations = cloneVolumeAnnotationsSnapshot(vol);
        const status = nextIndex < 0
          ? applyBondState(vol, atomIdA, atomIdB, atomA, atomB, { deleteOverride: true })
          : applyBondState(vol, atomIdA, atomIdB, atomA, atomB, { styleOverride: styles[nextIndex] });
        if (!status || status === 'unchanged') {
          setHintMessage(nextIndex < 0
            ? `${symbolA}-${symbolB} bond is already removed.`
            : `${symbolA}-${symbolB} bond is already ${getBondStyleLabel(styles[nextIndex])}.`);
          return false;
        }
        applyHydrogenAdjustmentForBondEdit(vol, i, j, atomA, atomB);
        if (finalizeBondGraphEdit(record, vol, beforeAtoms, beforeBonds, beforeAnnotations, `${nextIndex < 0 ? 'Delete' : (status === 'created' ? 'Create' : 'Update')} bond ${symbolA}-${symbolB}`)) {
          if (nextIndex < 0) setHintMessage(`Deleted ${symbolA}-${symbolB} bond.`);
          else setHintMessage(`${status === 'created' ? 'Created' : 'Updated'} ${symbolA}-${symbolB} bond as ${getBondStyleLabel(styles[nextIndex])}.`);
          return true;
        }
        return false;
      }
      if (nextOrder === currentOrder) {
        if (nextOrder <= 0) setHintMessage(`${symbolA}-${symbolB} bond is already removed.`);
        else setHintMessage(`${symbolA}-${symbolB} bond is already order ${nextOrder}.`);
        return false;
      }
      const beforeAtoms = cloneAtomsSnapshot(vol);
      const beforeBonds = cloneBondSnapshot(vol);
      const beforeAnnotations = cloneVolumeAnnotationsSnapshot(vol);
      if (nextOrder <= 0) {
        const status = applyBondState(vol, atomIdA, atomIdB, atomA, atomB, { deleteOverride: true });
        if (!status || status === 'unchanged') return false;
        applyHydrogenAdjustmentForBondEdit(vol, i, j, atomA, atomB);
        if (finalizeBondGraphEdit(record, vol, beforeAtoms, beforeBonds, beforeAnnotations, `Delete bond ${symbolA}-${symbolB}`)) {
          setHintMessage(`Deleted ${symbolA}-${symbolB} bond.`);
          return true;
        }
        return false;
      }
      const status = applyBondState(vol, atomIdA, atomIdB, atomA, atomB, { orderOverride: nextOrder });
      if (!status || status === 'unchanged') return false;
      applyHydrogenAdjustmentForBondEdit(vol, i, j, atomA, atomB);
      if (finalizeBondGraphEdit(record, vol, beforeAtoms, beforeBonds, beforeAnnotations, `${status === 'created' ? 'Create' : 'Update'} bond ${symbolA}-${symbolB}`)) {
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
          const record = ensureEditableRecord();
          const vol = record && record.vol;
          const i = carrier && carrier.userData ? (carrier.userData.i | 0) : -1;
          const j = carrier && carrier.userData ? (carrier.userData.j | 0) : -1;
          const atomA = vol && Array.isArray(vol.atoms) ? vol.atoms[i] : null;
          const atomB = vol && Array.isArray(vol.atoms) ? vol.atoms[j] : null;
          const metalPair = !!(vol && atomA && atomB && isMetalPair(atomA, atomB));
          hidePopup();
          if (!Number.isFinite(rawOrder) || rawOrder < 0) return;
          if (rawOrder === 0) {
            applyToCarrier(carrier, { deleteOverride: true });
            return;
          }
          if (metalPair) {
            applyToCarrier(carrier, { styleOverride: mapMetalPopupChoiceToStyle(rawOrder) });
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
      applyToAtomPair,
      stepCarrierOrder,
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
