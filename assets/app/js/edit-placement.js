(function (global) {
  'use strict';

  /**
   * Create one controller for edit-mode add/placement workflows.
   * Placement state lives in the injected proxy object so app.js can keep its
   * existing mutable globals while the workflow logic moves here.
   * @param {object} options
   */
  function createEditPlacementController(options = {}) {
    const THREE = options.THREE;
    const state = options.state || {};
    const controls = options.controls || null;
    const addMoleculePreviewGroup = options.addMoleculePreviewGroup || null;
    const addFusePreviewGroup = options.addFusePreviewGroup || null;
    const clearGroup = typeof options.clearGroup === 'function' ? options.clearGroup : (() => {});
    const clearAddGrowPreview = typeof options.clearAddGrowPreview === 'function' ? options.clearAddGrowPreview : (() => {});
    const setHintMessage = typeof options.setHintMessage === 'function' ? options.setHintMessage : (() => {});
    const buildCatalogInstance = typeof options.buildCatalogInstance === 'function' ? options.buildCatalogInstance : (() => null);
    const buildMoleculePlacementData = typeof options.buildMoleculePlacementData === 'function' ? options.buildMoleculePlacementData : (() => null);
    const rebuildMoleculePlacementPreviewMeshes = typeof options.rebuildMoleculePlacementPreviewMeshes === 'function' ? options.rebuildMoleculePlacementPreviewMeshes : (() => {});
    const updateMoleculePlacementPreviewTransform = typeof options.updateMoleculePlacementPreviewTransform === 'function' ? options.updateMoleculePlacementPreviewTransform : (() => {});
    const updateMoleculePlacementOperatorUi = typeof options.updateMoleculePlacementOperatorUi === 'function' ? options.updateMoleculePlacementOperatorUi : (() => {});
    const updateAddAtomOperatorUi = typeof options.updateAddAtomOperatorUi === 'function' ? options.updateAddAtomOperatorUi : (() => {});
    const updateEditToolboxUi = typeof options.updateEditToolboxUi === 'function' ? options.updateEditToolboxUi : (() => {});
    const ensureEditableVolumeRecord = typeof options.ensureEditableVolumeRecord === 'function' ? options.ensureEditableVolumeRecord : (() => null);
    const ensureVolumeSchema = typeof options.ensureVolumeSchema === 'function' ? options.ensureVolumeSchema : (() => null);
    const cloneAtomsSnapshot = typeof options.cloneAtomsSnapshot === 'function' ? options.cloneAtomsSnapshot : (() => []);
    const cloneBondSnapshot = typeof options.cloneBondSnapshot === 'function' ? options.cloneBondSnapshot : (() => []);
    const cloneJsonLike = typeof options.cloneJsonLike === 'function' ? options.cloneJsonLike : ((value) => value);
    const allocateBuilderGroupId = typeof options.allocateBuilderGroupId === 'function' ? options.allocateBuilderGroupId : (() => '');
    const allocateBuilderOpId = typeof options.allocateBuilderOpId === 'function' ? options.allocateBuilderOpId : (() => '');
    const ensureAtomId = typeof options.ensureAtomId === 'function' ? options.ensureAtomId : ((atom) => String(atom && atom.id || ''));
    const ensureVolumeAtomIds = typeof options.ensureVolumeAtomIds === 'function' ? options.ensureVolumeAtomIds : (() => {});
    const setAtomBuilderMeta = typeof options.setAtomBuilderMeta === 'function' ? options.setAtomBuilderMeta : (() => {});
    const normalizeBuilderOperationEntry = typeof options.normalizeBuilderOperationEntry === 'function' ? options.normalizeBuilderOperationEntry : (() => null);
    const rehydrateBuilderStateForVolume = typeof options.rehydrateBuilderStateForVolume === 'function' ? options.rehydrateBuilderStateForVolume : (() => {});
    const syncBuilderExtensionFromVolumes = typeof options.syncBuilderExtensionFromVolumes === 'function' ? options.syncBuilderExtensionFromVolumes : (() => {});
    const worldToAtomUnits = typeof options.worldToAtomUnits === 'function' ? options.worldToAtomUnits : (() => [0, 0, 0]);
    const atomUnitsToAng = typeof options.atomUnitsToAng === 'function' ? options.atomUnitsToAng : (() => new THREE.Vector3());
    const normalizeEditAddBondOrder = typeof options.normalizeEditAddBondOrder === 'function' ? options.normalizeEditAddBondOrder : ((order) => Number(order) || 1);
    const collectBondCandidates = typeof options.collectBondCandidates === 'function' ? options.collectBondCandidates : (() => []);
    const inferBondOrders = typeof options.inferBondOrders === 'function' ? options.inferBondOrders : (() => {});
    const upsertVolumeBond = typeof options.upsertVolumeBond === 'function' ? options.upsertVolumeBond : (() => null);
    const pushEditHistoryEntry = typeof options.pushEditHistoryEntry === 'function' ? options.pushEditHistoryEntry : (() => {});
    const clearHover = typeof options.clearHover === 'function' ? options.clearHover : (() => {});
    const rebuildScene = typeof options.rebuildScene === 'function' ? options.rebuildScene : (() => {});
    const updateSidePanel = typeof options.updateSidePanel === 'function' ? options.updateSidePanel : (() => {});
    const getElementSymbol = typeof options.getElementSymbol === 'function' ? options.getElementSymbol : ((z) => String(z || '?'));
    const getElementName = typeof options.getElementName === 'function' ? options.getElementName : ((z) => String(z || '?'));
    const getFragmentConnectionAtom = typeof options.getFragmentConnectionAtom === 'function' ? options.getFragmentConnectionAtom : (() => null);
    const getFragmentConnectionOutwardDirection = typeof options.getFragmentConnectionOutwardDirection === 'function' ? options.getFragmentConnectionOutwardDirection : (() => new THREE.Vector3(1, 0, 0));
    const resolveFragmentAttachPolicy = typeof options.resolveFragmentAttachPolicy === 'function' ? options.resolveFragmentAttachPolicy : (() => ({ policy: 'append', replaceHydrogen: null }));
    const applyLocalFragmentCleanup = typeof options.applyLocalFragmentCleanup === 'function' ? options.applyLocalFragmentCleanup : (() => ({ bondLengthApplied: false, overlapShift: 0 }));
    const evaluateBuilderPlacementWarnings = typeof options.evaluateBuilderPlacementWarnings === 'function' ? options.evaluateBuilderPlacementWarnings : (() => ({ overlapCount: 0, valencePressureCount: 0 }));
    const getEditAddBondLength = typeof options.getEditAddBondLength === 'function' ? options.getEditAddBondLength : (() => 0);
    const applyMethylAttachmentGeometry = typeof options.applyMethylAttachmentGeometry === 'function' ? options.applyMethylAttachmentGeometry : (() => {});
    const applyHydroxylAttachmentGeometry = typeof options.applyHydroxylAttachmentGeometry === 'function' ? options.applyHydroxylAttachmentGeometry : (() => {});
    const inferVolumeBonds = typeof options.inferVolumeBonds === 'function' ? options.inferVolumeBonds : (() => []);
    const pruneBuilderOperationsForVolume = typeof options.pruneBuilderOperationsForVolume === 'function' ? options.pruneBuilderOperationsForVolume : (() => false);
    const getCamera = typeof options.getCamera === 'function' ? options.getCamera : (() => null);
    const buildFuseRingPlacementGeometry = typeof options.buildFuseRingPlacementGeometry === 'function' ? options.buildFuseRingPlacementGeometry : (() => null);
    const rebuildFuseRingPreviewMeshes = typeof options.rebuildFuseRingPreviewMeshes === 'function' ? options.rebuildFuseRingPreviewMeshes : (() => {});
    const getEditAddMoleculeId = typeof options.getEditAddMoleculeId === 'function' ? options.getEditAddMoleculeId : (() => '');
    const getEditAddFragmentId = typeof options.getEditAddFragmentId === 'function' ? options.getEditAddFragmentId : (() => '');
    const getEditAddBondOrder = typeof options.getEditAddBondOrder === 'function' ? options.getEditAddBondOrder : (() => 1);
    const getEditAddFragmentAttachPolicy = typeof options.getEditAddFragmentAttachPolicy === 'function' ? options.getEditAddFragmentAttachPolicy : (() => 'append');
    const CATALOG_KIND = options.CATALOG_KIND || { FRAGMENT: 'fragment', MOLECULE: 'molecule' };
    const EDIT_FRAGMENT_ATTACH_POLICY = options.EDIT_FRAGMENT_ATTACH_POLICY || { APPEND: 'append', REPLACE_H: 'replace_h', FUSE_RING: 'fuse_ring' };
    const onDeleteAtomPostprocess = typeof options.onDeleteAtomPostprocess === 'function' ? options.onDeleteAtomPostprocess : (() => {});
    const getVolumes = typeof options.getVolumes === 'function' ? options.getVolumes : (() => []);

    function findAtomIndexById(vol, atomId) {
      if (!vol || !Array.isArray(vol.atoms) || !atomId) return -1;
      const targetId = String(atomId);
      for (let i = 0; i < vol.atoms.length; i++) {
        const atom = vol.atoms[i];
        if (!atom) continue;
        if (String(ensureAtomId(atom)) === targetId) return i;
      }
      return -1;
    }

    function recordFragmentOperation(record, entry) {
      if (!record || !record.vol || !entry || typeof entry !== 'object') return;
      const vol = record.vol;
      ensureVolumeAtomIds(vol);
      if (!Array.isArray(vol.fragmentOps)) vol.fragmentOps = [];
      const normalized = normalizeBuilderOperationEntry(entry);
      if (!normalized) return;
      vol.fragmentOps.push(normalized);
      rehydrateBuilderStateForVolume(vol);
      syncBuilderExtensionFromVolumes();
    }

    function clearMoleculePlacementPreview() {
      state.moleculePlaceActive = false;
      state.moleculePlaceOperatorCollapsed = true;
      state.moleculePlaceRotating = false;
      state.moleculePlaceMoved = false;
      state.moleculePlaceTemplate = null;
      state.moleculePlaceTemplateData = null;
      state.moleculePlacePosition.set(0, 0, 0);
      state.moleculePlaceQuaternion.identity();
      state.moleculePlaceLastClientX = 0;
      state.moleculePlaceLastClientY = 0;
      clearGroup(addMoleculePreviewGroup);
      if (addMoleculePreviewGroup) addMoleculePreviewGroup.visible = false;
      try { if (controls) controls.enabled = true; } catch { }
      updateMoleculePlacementOperatorUi();
    }

    function startMoleculePlacementAtWorld(worldPos) {
      const molecule = buildCatalogInstance(getEditAddMoleculeId(), CATALOG_KIND.MOLECULE);
      if (!molecule || !Array.isArray(molecule.atoms) || molecule.atoms.length === 0) {
        setHintMessage('Selected molecule is not available.');
        return false;
      }
      const data = buildMoleculePlacementData(molecule);
      if (!data) {
        setHintMessage('Could not prepare molecule placement preview.');
        return false;
      }
      clearAddGrowPreview();
      clearMoleculePlacementPreview();
      state.moleculePlaceTemplate = molecule;
      state.moleculePlaceTemplateData = data;
      state.moleculePlaceActive = true;
      state.moleculePlaceOperatorCollapsed = true;
      state.moleculePlacePosition.copy(worldPos && worldPos.isVector3 ? worldPos : new THREE.Vector3(0, 0, 0));
      state.moleculePlaceQuaternion.identity();
      rebuildMoleculePlacementPreviewMeshes();
      updateEditToolboxUi({ syncSearch: false });
      setHintMessage(`Placing molecule ${data.name} • Drag to rotate • Click again to place • X/Y/Z align • Esc cancel`);
      return true;
    }

    function updateMoleculePlacementRotationFromEvent(e) {
      if (!state.moleculePlaceActive || !state.moleculePlaceRotating) return;
      const dx = (Number(e.clientX) || 0) - state.moleculePlaceLastClientX;
      const dy = (Number(e.clientY) || 0) - state.moleculePlaceLastClientY;
      state.moleculePlaceLastClientX = Number(e.clientX) || state.moleculePlaceLastClientX;
      state.moleculePlaceLastClientY = Number(e.clientY) || state.moleculePlaceLastClientY;
      if (!(Number.isFinite(dx) && Number.isFinite(dy))) return;
      if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;
      const camera = getCamera();
      if (!camera) return;
      const gain = 0.0085;
      const upAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
      const rightAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
      const qYaw = new THREE.Quaternion().setFromAxisAngle(upAxis, dx * gain);
      const qPitch = new THREE.Quaternion().setFromAxisAngle(rightAxis, dy * gain);
      state.moleculePlaceQuaternion.premultiply(qYaw);
      state.moleculePlaceQuaternion.premultiply(qPitch);
      state.moleculePlaceQuaternion.normalize();
      state.moleculePlaceMoved = true;
      updateMoleculePlacementPreviewTransform();
    }

    function alignMoleculePlacementToAxis(axis) {
      if (!state.moleculePlaceActive || !state.moleculePlaceTemplateData) return false;
      const src = state.moleculePlaceTemplateData.principalAxis
        ? state.moleculePlaceTemplateData.principalAxis.clone()
        : new THREE.Vector3(0, 0, 1);
      if (src.lengthSq() < 1e-10) src.set(0, 0, 1);
      src.normalize();
      const dst = axis === 'y'
        ? new THREE.Vector3(0, 1, 0)
        : (axis === 'z' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0));
      state.moleculePlaceQuaternion.setFromUnitVectors(src, dst);
      state.moleculePlaceQuaternion.normalize();
      updateMoleculePlacementPreviewTransform();
      setHintMessage(`Molecule aligned to +${axis.toUpperCase()} axis.`);
      return true;
    }

    function appendPlacedMoleculeBonds(vol, templateData, addedAtomIds, placedWorldPositions) {
      if (!vol || !Array.isArray(vol.atoms) || !templateData || !Array.isArray(templateData.atoms)) return;
      ensureVolumeSchema(vol, { inferMissingBonds: false });
      const atomIds = Array.isArray(addedAtomIds) ? addedAtomIds : [];
      if (atomIds.length !== templateData.atoms.length) return;
      const explicitBonds = Array.isArray(templateData.bonds) ? templateData.bonds : [];
      if (explicitBonds.length > 0) {
        for (const rawBond of explicitBonds) {
          const i = Number(rawBond && rawBond.i) | 0;
          const j = Number(rawBond && rawBond.j) | 0;
          const a = String(atomIds[i] || '').trim();
          const b = String(atomIds[j] || '').trim();
          if (!a || !b || a === b) continue;
          upsertVolumeBond(vol, a, b, normalizeEditAddBondOrder(rawBond.order || 1), 'normal');
        }
        return;
      }
      const atomPositions = [];
      for (let i = 0; i < templateData.atoms.length; i++) {
        const atom = templateData.atoms[i];
        const pos = Array.isArray(placedWorldPositions) ? placedWorldPositions[i] : null;
        if (!atom || !pos || typeof pos.clone !== 'function') continue;
        atomPositions.push({ pos: pos.clone(), Z: atom.Z | 0 });
      }
      if (atomPositions.length !== templateData.atoms.length) return;
      const edges = collectBondCandidates(atomPositions);
      inferBondOrders(atomPositions, edges);
      for (const edge of edges) {
        const a = String(atomIds[edge.i] || '').trim();
        const b = String(atomIds[edge.j] || '').trim();
        if (!a || !b || a === b) continue;
        upsertVolumeBond(vol, a, b, normalizeEditAddBondOrder(edge.order || 1), 'normal');
      }
    }

    function commitMoleculePlacement() {
      if (!state.moleculePlaceActive || !state.moleculePlaceTemplateData || !Array.isArray(state.moleculePlaceTemplateData.atoms)) return false;
      const templateData = state.moleculePlaceTemplateData;
      const placePosition = state.moleculePlacePosition.clone();
      const placeQuaternion = state.moleculePlaceQuaternion.clone();
      const label = templateData.name || 'molecule';
      const record = ensureEditableVolumeRecord();
      const vol = record && record.vol;
      if (!vol || !Array.isArray(vol.atoms)) return false;
      ensureVolumeSchema(vol);
      const beforeAtoms = cloneAtomsSnapshot(vol);
      const beforeBonds = cloneBondSnapshot(vol);
      const beforeFragmentOps = cloneJsonLike(Array.isArray(vol.fragmentOps) ? vol.fragmentOps : []);
      const builderGroupId = allocateBuilderGroupId();
      const addedAtomIds = [];
      const placedWorldPositions = [];
      for (const atom of templateData.atoms) {
        const world = atom.local.clone().applyQuaternion(placeQuaternion).add(placePosition);
        placedWorldPositions.push(world.clone());
        const coords = worldToAtomUnits(vol, world);
        const newAtom = { Z: atom.Z | 0, x: coords[0], y: coords[1], z: coords[2], formalCharge: 0 };
        ensureAtomId(newAtom);
        setAtomBuilderMeta(vol, newAtom, {
          groupId: builderGroupId,
          entryId: templateData.id || '',
          entryKind: CATALOG_KIND.MOLECULE,
        });
        addedAtomIds.push(newAtom.id);
        vol.atoms.push(newAtom);
      }
      vol.natoms = vol.atoms.length;
      appendPlacedMoleculeBonds(vol, templateData, addedAtomIds, placedWorldPositions);
      const afterAtoms = cloneAtomsSnapshot(vol);
      recordFragmentOperation(record, {
        timestamp: new Date().toISOString(),
        entryId: templateData.id || '',
        entryKind: CATALOG_KIND.MOLECULE,
        attachPolicy: 'append',
        transform: {
          centerWorld: [placePosition.x, placePosition.y, placePosition.z],
          quaternion: [placeQuaternion.x, placeQuaternion.y, placeQuaternion.z, placeQuaternion.w],
        },
        resultingBondOrder: 1,
        builderGroupId,
        addedAtomIds,
      });
      const afterFragmentOps = cloneJsonLike(Array.isArray(vol.fragmentOps) ? vol.fragmentOps : []);
      const afterBonds = cloneBondSnapshot(vol);
      pushEditHistoryEntry(record, beforeAtoms, afterAtoms, `Add molecule: ${label}`, {
        beforeFragmentOps,
        afterFragmentOps,
        beforeBonds,
        afterBonds,
      });
      clearMoleculePlacementPreview();
      clearHover();
      rebuildScene({ preserveView: true });
      updateSidePanel();
      setHintMessage(`Added molecule ${label}.`);
      return true;
    }

    function clearFuseRingPreview() {
      state.addFusePreviewState = null;
      clearGroup(addFusePreviewGroup);
      if (addFusePreviewGroup) addFusePreviewGroup.visible = false;
      try { if (controls) controls.enabled = true; } catch { }
    }

    function getFuseRingOmittedLocalIndices(fragment) {
      const omitted = new Set();
      const pair = Array.isArray(fragment && fragment.fuseBondLocalPair) ? fragment.fuseBondLocalPair : [];
      for (const idx of pair) omitted.add(idx | 0);
      if (!Array.isArray(fragment && fragment.bonds) || !Array.isArray(fragment && fragment.atoms)) return omitted;
      for (const bond of fragment.bonds) {
        if (!bond) continue;
        const i = Number(bond.i) | 0;
        const j = Number(bond.j) | 0;
        if (omitted.has(i) && fragment.atoms[j] && (fragment.atoms[j].Z | 0) === 1) omitted.add(j);
        if (omitted.has(j) && fragment.atoms[i] && (fragment.atoms[i].Z | 0) === 1) omitted.add(i);
      }
      return omitted;
    }

    function startFuseRingPlacementFromBondHit(hit) {
      const record = ensureEditableVolumeRecord();
      const vol = record && record.vol;
      const fragment = buildCatalogInstance(getEditAddFragmentId(), CATALOG_KIND.FRAGMENT);
      if (!vol || !Array.isArray(vol.atoms) || !fragment) return false;
      if (!Array.isArray(fragment.fuseBondLocalPair) || fragment.fuseBondLocalPair.length < 2) {
        setHintMessage('Selected fragment does not define a fuse-ring bond pair.');
        return false;
      }
      const bondObject = hit && hit.object;
      if (!bondObject || !bondObject.userData) return false;
      const i = bondObject.userData.i | 0;
      const j = bondObject.userData.j | 0;
      if (i < 0 || j < 0 || i >= vol.atoms.length || j >= vol.atoms.length || i === j) {
        setHintMessage('Fuse ring requires clicking an existing host bond.');
        return false;
      }
      clearAddGrowPreview();
      clearFuseRingPreview();
      state.addFusePreviewState = {
        record,
        vol,
        fragment,
        hostBond: { i, j },
        omittedLocalIndices: getFuseRingOmittedLocalIndices(fragment),
        spinAngle: 0,
        justStarted: true,
        rotating: false,
        moved: false,
        lastClientX: 0,
      };
      rebuildFuseRingPreviewMeshes();
      updateEditToolboxUi({ syncSearch: false });
      setHintMessage(`Fuse ring preview: ${fragment.name} • Drag to spin around bond • Click again to place • Esc cancel`);
      return true;
    }

    function updateFuseRingPlacementRotationFromEvent(e) {
      const nextState = state.addFusePreviewState;
      if (!nextState || !nextState.rotating) return;
      const dx = (Number(e.clientX) || 0) - (Number(nextState.lastClientX) || 0);
      nextState.lastClientX = Number(e.clientX) || nextState.lastClientX;
      if (Math.abs(dx) < 0.001) return;
      nextState.spinAngle += dx * 0.01;
      nextState.moved = true;
      rebuildFuseRingPreviewMeshes();
    }

    function commitFuseRingPlacement() {
      const nextState = state.addFusePreviewState;
      if (!nextState || !nextState.vol || !nextState.fragment) return false;
      const geom = buildFuseRingPlacementGeometry(nextState);
      if (!geom) return false;
      const vol = nextState.vol;
      const record = nextState.record;
      const beforeAtoms = cloneAtomsSnapshot(vol);
      const beforeBonds = cloneBondSnapshot(vol);
      const beforeFragmentOps = cloneJsonLike(Array.isArray(vol.fragmentOps) ? vol.fragmentOps : []);
      const oldAtomIndexSet = new Set(Array.from({ length: vol.atoms.length }, (_, i) => i));
      const builderGroupId = allocateBuilderGroupId();
      const localToGlobal = new Map([
        [nextState.fragment.fuseBondLocalPair[0] | 0, nextState.hostBond.i],
        [nextState.fragment.fuseBondLocalPair[1] | 0, nextState.hostBond.j],
      ]);
      const addedAtomIndices = [];
      const addedAtomIds = [];
      for (const item of geom.newAtoms) {
        const coords = worldToAtomUnits(vol, item.world);
        const atom = { Z: item.Z | 0, x: coords[0], y: coords[1], z: coords[2], formalCharge: 0 };
        ensureAtomId(atom);
        setAtomBuilderMeta(vol, atom, {
          groupId: builderGroupId,
          entryId: nextState.fragment.id,
          entryKind: CATALOG_KIND.FRAGMENT,
        });
        vol.atoms.push(atom);
        const globalIndex = vol.atoms.length - 1;
        localToGlobal.set(item.localIndex, globalIndex);
        addedAtomIndices.push(globalIndex);
        addedAtomIds.push(atom.id);
      }
      vol.natoms = vol.atoms.length;
      inferVolumeBonds(vol);
      const warnings = evaluateBuilderPlacementWarnings(vol, addedAtomIndices, oldAtomIndexSet, [nextState.hostBond.i, nextState.hostBond.j]);
      const afterAtoms = cloneAtomsSnapshot(vol);
      recordFragmentOperation(record, {
        timestamp: new Date().toISOString(),
        entryId: nextState.fragment.id,
        entryKind: CATALOG_KIND.FRAGMENT,
        attachPolicy: EDIT_FRAGMENT_ATTACH_POLICY.FUSE_RING,
        hostBondAtomIds: [ensureAtomId(vol.atoms[nextState.hostBond.i]), ensureAtomId(vol.atoms[nextState.hostBond.j])],
        hostBondIndices: [nextState.hostBond.i, nextState.hostBond.j],
        addedAtomIds,
        addedAtomIndices,
        omittedLocalAtomIndices: Array.from(nextState.omittedLocalIndices.values()).sort((a, b) => a - b),
        transform: { spinAngle: nextState.spinAngle },
        resultingBondOrder: normalizeEditAddBondOrder(getEditAddBondOrder() || nextState.fragment.preferredBondOrder || 1),
        builderGroupId,
      });
      const afterFragmentOps = cloneJsonLike(Array.isArray(vol.fragmentOps) ? vol.fragmentOps : []);
      const afterBonds = cloneBondSnapshot(vol);
      pushEditHistoryEntry(record, beforeAtoms, afterAtoms, `Fuse ring: ${nextState.fragment.name}`, {
        beforeFragmentOps,
        afterFragmentOps,
        beforeBonds,
        afterBonds,
      });
      clearFuseRingPreview();
      clearHover();
      rebuildScene({ preserveView: true });
      updateSidePanel();
      const warningParts = [];
      if (warnings.overlapCount > 0) warningParts.push(`${warnings.overlapCount} severe overlap${warnings.overlapCount === 1 ? '' : 's'}`);
      if (warnings.valencePressureCount > 0) warningParts.push(`${warnings.valencePressureCount} valence warning${warnings.valencePressureCount === 1 ? '' : 's'}`);
      const warningSuffix = warningParts.length ? ` • Warning: ${warningParts.join(' • ')}` : '';
      setHintMessage(`Fused ${nextState.fragment.name} onto selected bond.${warningSuffix}`);
      return true;
    }

    function resolveAddAtomOperatorSession() {
      const session = state.addAtomOperatorSession;
      if (!session || !session.record || !session.atomId) return null;
      const record = session.record;
      if (!Array.isArray(getVolumes()) || getVolumes().indexOf(record) < 0) return null;
      const vol = record.vol;
      if (!vol || !Array.isArray(vol.atoms)) return null;
      const atomIndex = findAtomIndexById(vol, session.atomId);
      if (atomIndex < 0 || atomIndex >= vol.atoms.length) return null;
      return { record, vol, atomIndex, atom: vol.atoms[atomIndex] };
    }

    function beginAddAtomOperatorSession(record, atomId, beforeAtoms, beforeBonds, label) {
      state.addAtomOperatorSession = {
        record,
        atomId: String(atomId || ''),
        beforeAtoms: Array.isArray(beforeAtoms) ? beforeAtoms : [],
        beforeBonds: Array.isArray(beforeBonds) ? beforeBonds : [],
        label: String(label || 'Add atom'),
      };
      state.addAtomOperatorCollapsed = true;
      updateAddAtomOperatorUi();
    }

    function setAddAtomOperatorWorldPosition(worldPos) {
      const resolved = resolveAddAtomOperatorSession();
      if (!resolved || !worldPos || !worldPos.isVector3) return false;
      const coords = worldToAtomUnits(resolved.vol, worldPos);
      resolved.atom.x = Number(coords[0]) || 0;
      resolved.atom.y = Number(coords[1]) || 0;
      resolved.atom.z = Number(coords[2]) || 0;
      inferVolumeBonds(resolved.vol);
      rebuildScene({ preserveView: true });
      updateAddAtomOperatorUi();
      return true;
    }

    function finalizeAddAtomOperatorSession(finalizeOptions = {}) {
      const session = state.addAtomOperatorSession;
      if (!session) return false;
      const commit = finalizeOptions.commit !== false;
      const announce = finalizeOptions.announce !== false;
      const resolved = resolveAddAtomOperatorSession();
      state.addAtomOperatorSession = null;
      updateAddAtomOperatorUi();
      if (!resolved) return true;
      if (!commit) {
        options.applyAtomsSnapshotToRecord(session.record, session.beforeAtoms, undefined, session.beforeBonds);
        if (announce) setHintMessage('Canceled atom add.');
        return true;
      }
      const afterAtoms = cloneAtomsSnapshot(resolved.vol);
      const afterBonds = cloneBondSnapshot(resolved.vol);
      pushEditHistoryEntry(session.record, session.beforeAtoms, afterAtoms, session.label, {
        beforeBonds: session.beforeBonds,
        afterBonds,
      });
      if (announce) {
        const symbol = getElementSymbol((resolved.atom && resolved.atom.Z) | 0);
        setHintMessage(`Committed Add Atom ${symbol}.`);
      }
      return true;
    }

    function applyAddAtomOperatorInput(axis, inputEl, inputOptions = {}) {
      const resolved = resolveAddAtomOperatorSession();
      if (!resolved || !inputEl) return;
      const text = String(inputEl.value || '').trim();
      if (!text) {
        if (inputOptions.syncOnly) updateAddAtomOperatorUi();
        return;
      }
      const nextValue = Number(text);
      if (!Number.isFinite(nextValue)) {
        if (inputOptions.syncOnly) updateAddAtomOperatorUi();
        return;
      }
      const world = atomUnitsToAng(resolved.vol, resolved.atom);
      if (axis === 'x') world.x = nextValue;
      else if (axis === 'y') world.y = nextValue;
      else world.z = nextValue;
      setAddAtomOperatorWorldPosition(world);
    }

    function appendAtomAtWorld(worldPos, elementZ) {
      if (state.addAtomOperatorSession) finalizeAddAtomOperatorSession({ announce: false });
      const record = ensureEditableVolumeRecord();
      const vol = record && record.vol;
      if (!vol || !Array.isArray(vol.atoms)) return false;
      const beforeAtoms = cloneAtomsSnapshot(vol);
      const beforeBonds = cloneBondSnapshot(vol);
      const z = Number(elementZ) | 0;
      const [x, y, zCoord] = worldToAtomUnits(vol, worldPos);
      const atom = { Z: z, x, y, z: zCoord, formalCharge: 0 };
      ensureAtomId(atom);
      vol.atoms.push(atom);
      vol.natoms = vol.atoms.length;
      inferVolumeBonds(vol);
      rebuildScene({ preserveView: true });
      beginAddAtomOperatorSession(record, ensureAtomId(atom), beforeAtoms, beforeBonds, `Add ${getElementSymbol(z)}`);
      setHintMessage(`Added ${getElementName(z)} (${getElementSymbol(z)}) atom • Adjust location • Enter confirm • Esc cancel`);
      return true;
    }

    function applyCleanupToLatestFragmentOperation() {
      const record = ensureEditableVolumeRecord();
      const vol = record && record.vol;
      if (!vol || !Array.isArray(vol.atoms) || vol.atoms.length === 0) {
        setHintMessage('No editable structure is available for cleanup.');
        return false;
      }
      if (!Array.isArray(vol.fragmentOps) || vol.fragmentOps.length === 0) {
        setHintMessage('No fragment insertion is available for cleanup.');
        return false;
      }
      ensureVolumeAtomIds(vol);
      const atomIndexById = new Map();
      for (let i = 0; i < vol.atoms.length; i++) {
        if (!vol.atoms[i]) continue;
        atomIndexById.set(String(ensureAtomId(vol.atoms[i])), i);
      }
      let targetOp = null;
      let targetFragment = null;
      let targetIndices = null;
      let targetAnchor = -1;
      for (let k = vol.fragmentOps.length - 1; k >= 0; k--) {
        const op = normalizeBuilderOperationEntry(vol.fragmentOps[k]);
        if (!op || op.entryKind !== CATALOG_KIND.FRAGMENT || op.attachPolicy === EDIT_FRAGMENT_ATTACH_POLICY.FUSE_RING) continue;
        const fragment = buildCatalogInstance(op.entryId, CATALOG_KIND.FRAGMENT);
        if (!fragment) continue;
        const conn = getFragmentConnectionAtom(fragment);
        if (!conn) continue;
        const addedIndices = Array.isArray(op.addedAtomIds)
          ? op.addedAtomIds.map((id) => atomIndexById.get(String(id || ''))).filter((idx) => Number.isInteger(idx))
          : [];
        if (addedIndices.length !== fragment.atoms.length) continue;
        const anchor = atomIndexById.get(String(op.anchorAtomIdPost || ''));
        if (!Number.isInteger(anchor)) continue;
        targetOp = op;
        targetFragment = fragment;
        targetIndices = addedIndices;
        targetAnchor = anchor;
        break;
      }
      if (!targetOp || !targetFragment || !Array.isArray(targetIndices)) {
        setHintMessage('No live append/replace-H fragment is available for cleanup.');
        return false;
      }
      const conn = getFragmentConnectionAtom(targetFragment);
      const connectionGlobalIndex = targetIndices[conn.index];
      if (!Number.isInteger(connectionGlobalIndex) || !vol.atoms[connectionGlobalIndex]) {
        setHintMessage('Cleanup could not resolve the fragment connection atom.');
        return false;
      }
      const beforeAtoms = cloneAtomsSnapshot(vol);
      const beforeBonds = cloneBondSnapshot(vol);
      const beforeFragmentOps = cloneJsonLike(Array.isArray(vol.fragmentOps) ? vol.fragmentOps : []);
      const oldAtomIndexSet = new Set(Array.from({ length: vol.atoms.length }, (_, i) => i).filter((i) => !targetIndices.includes(i)));
      const axisArray = Array.isArray(targetOp.transform && targetOp.transform.direction) ? targetOp.transform.direction : null;
      let attachDir = axisArray && axisArray.length >= 3
        ? new THREE.Vector3(Number(axisArray[0]) || 0, Number(axisArray[1]) || 0, Number(axisArray[2]) || 0)
        : atomUnitsToAng(vol, vol.atoms[connectionGlobalIndex]).sub(atomUnitsToAng(vol, vol.atoms[targetAnchor]));
      if (attachDir.lengthSq() < 1e-10) attachDir.set(0, 0, 1);
      const targetLength = Number(targetOp.transform && targetOp.transform.bondLengthAngstrom);
      const bondLength = Number.isFinite(targetLength)
        ? targetLength
        : getEditAddBondLength(vol.atoms[targetAnchor].Z | 0, vol.atoms[connectionGlobalIndex].Z | 0, targetOp.resultingBondOrder || 1);
      const cleanupResult = applyLocalFragmentCleanup(
        vol,
        targetAnchor,
        targetIndices,
        connectionGlobalIndex,
        bondLength,
        oldAtomIndexSet,
        attachDir,
        { force: true }
      );
      const afterAtoms = cloneAtomsSnapshot(vol);
      const afterBonds = cloneBondSnapshot(vol);
      const afterFragmentOps = cloneJsonLike(Array.isArray(vol.fragmentOps) ? vol.fragmentOps : []);
      if (options.atomsSnapshotsEqual && options.atomsSnapshotsEqual(beforeAtoms, afterAtoms)) {
        setHintMessage('Cleanup made no positional changes.');
        return false;
      }
      pushEditHistoryEntry(record, beforeAtoms, afterAtoms, `Cleanup fragment: ${targetFragment.name}`, {
        beforeFragmentOps,
        afterFragmentOps,
        beforeBonds,
        afterBonds,
      });
      rebuildScene({ preserveView: true });
      updateSidePanel();
      const parts = [];
      if (cleanupResult.bondLengthApplied) parts.push('bond length');
      if (cleanupResult.overlapShift > 1e-6) parts.push(`overlap relief ${cleanupResult.overlapShift.toFixed(2)} Å`);
      setHintMessage(`Applied cleanup to ${targetFragment.name}${parts.length ? ` • ${parts.join(' • ')}` : ''}.`);
      return true;
    }

    function appendFragmentAtWorld(anchorIndex, worldPos) {
      const record = ensureEditableVolumeRecord();
      const vol = record && record.vol;
      if (!vol || !Array.isArray(vol.atoms) || vol.atoms.length === 0) {
        setHintMessage('Load or create at least one atom before adding a fragment.');
        return false;
      }
      ensureVolumeAtomIds(vol);
      const fragment = buildCatalogInstance(getEditAddFragmentId(), CATALOG_KIND.FRAGMENT);
      if (!fragment || !Array.isArray(fragment.atoms) || fragment.atoms.length === 0) {
        setHintMessage('Selected fragment is not available.');
        return false;
      }
      let anchor = anchorIndex | 0;
      if (anchor < 0 || anchor >= vol.atoms.length) {
        setHintMessage('Click an anchor atom to place the fragment.');
        return false;
      }

      const beforeAtoms = cloneAtomsSnapshot(vol);
      const beforeBonds = cloneBondSnapshot(vol);
      const beforeFragmentOps = cloneJsonLike(Array.isArray(vol.fragmentOps) ? vol.fragmentOps : []);
      const anchorAtomBefore = vol.atoms[anchor];
      const anchorPosBefore = atomUnitsToAng(vol, anchorAtomBefore);
      let attachDir = worldPos && worldPos.isVector3
        ? worldPos.clone().sub(anchorPosBefore)
        : new THREE.Vector3(1, 0, 0);
      if (attachDir.lengthSq() < 1e-10) {
        const camera = getCamera();
        if (camera) camera.getWorldDirection(attachDir);
        if (attachDir.lengthSq() < 1e-10) attachDir.set(1, 0, 0);
      }
      attachDir.normalize();
      const resolvedPolicy = resolveFragmentAttachPolicy(fragment, vol, anchor, attachDir);
      if (resolvedPolicy.error && resolvedPolicy.policy !== EDIT_FRAGMENT_ATTACH_POLICY.APPEND) {
        setHintMessage(resolvedPolicy.error);
        return false;
      }
      let attachMode = resolvedPolicy.policy === EDIT_FRAGMENT_ATTACH_POLICY.REPLACE_H
        ? EDIT_FRAGMENT_ATTACH_POLICY.REPLACE_H
        : EDIT_FRAGMENT_ATTACH_POLICY.APPEND;
      const removedAtomIndices = [];
      const removedAtomIds = [];
      const replaceHydrogen = resolvedPolicy.replaceHydrogen || null;
      if (replaceHydrogen && Number.isInteger(replaceHydrogen.index)) {
        const hIdx = replaceHydrogen.index | 0;
        if (hIdx >= 0 && hIdx < vol.atoms.length) {
          if (vol.atoms[hIdx]) removedAtomIds.push(ensureAtomId(vol.atoms[hIdx]));
          vol.atoms.splice(hIdx, 1);
          removedAtomIndices.push(hIdx);
          if (hIdx < anchor) anchor -= 1;
          attachDir.copy(replaceHydrogen.direction).normalize();
        }
      }

      const anchorAtom = vol.atoms[anchor];
      if (!anchorAtom) {
        setHintMessage('Fragment placement failed: anchor atom no longer exists.');
        return false;
      }
      const anchorPos = atomUnitsToAng(vol, anchorAtom);
      const conn = getFragmentConnectionAtom(fragment);
      if (!conn) {
        setHintMessage('Fragment placement failed: invalid connection atom.');
        return false;
      }
      const bondOrder = normalizeEditAddBondOrder(getEditAddBondOrder() || fragment.preferredBondOrder || 1);
      const bondLength = getEditAddBondLength(anchorAtom.Z | 0, conn.Z | 0, bondOrder);
      const connectionWorld = anchorPos.clone().addScaledVector(attachDir, bondLength);
      const oldAtomIndexSet = new Set(Array.from({ length: vol.atoms.length }, (_, i) => i));
      const builderGroupId = allocateBuilderGroupId();

      const connLocal = new THREE.Vector3(conn.x, conn.y, conn.z);
      const localOutward = getFragmentConnectionOutwardDirection(fragment);
      const rot = new THREE.Quaternion().setFromUnitVectors(localOutward, attachDir);
      const newIndices = [];
      const addedAtomIds = [];
      for (let i = 0; i < fragment.atoms.length; i++) {
        const atom = fragment.atoms[i];
        const local = new THREE.Vector3(Number(atom.x) || 0, Number(atom.y) || 0, Number(atom.z) || 0).sub(connLocal);
        const world = local.applyQuaternion(rot).add(connectionWorld);
        const coords = worldToAtomUnits(vol, world);
        const newAtom = { Z: atom.Z | 0, x: coords[0], y: coords[1], z: coords[2], formalCharge: 0 };
        ensureAtomId(newAtom);
        setAtomBuilderMeta(vol, newAtom, {
          groupId: builderGroupId,
          entryId: fragment.id,
          entryKind: CATALOG_KIND.FRAGMENT,
        });
        vol.atoms.push(newAtom);
        newIndices.push(vol.atoms.length - 1);
        addedAtomIds.push(newAtom.id);
      }
      applyMethylAttachmentGeometry(vol, fragment, newIndices, anchorPos, connectionWorld, attachDir);
      applyHydroxylAttachmentGeometry(vol, fragment, newIndices, anchorPos, connectionWorld);
      const cleanupResult = applyLocalFragmentCleanup(
        vol,
        anchor,
        newIndices,
        newIndices[conn.index],
        bondLength,
        oldAtomIndexSet,
        attachDir
      );
      vol.natoms = vol.atoms.length;
      inferVolumeBonds(vol);

      const warnings = evaluateBuilderPlacementWarnings(vol, newIndices, oldAtomIndexSet, [anchor]);
      const afterAtoms = cloneAtomsSnapshot(vol);
      recordFragmentOperation(record, {
        opId: allocateBuilderOpId(),
        timestamp: new Date().toISOString(),
        entryId: fragment.id,
        entryKind: CATALOG_KIND.FRAGMENT,
        builderGroupId,
        anchorIndexPre: anchorIndex | 0,
        anchorIndexPost: anchor | 0,
        anchorAtomIdPre: beforeAtoms[anchorIndex | 0] ? String(beforeAtoms[anchorIndex | 0].id || '') : '',
        anchorAtomIdPost: vol.atoms[anchor] ? ensureAtomId(vol.atoms[anchor]) : '',
        attachPolicy: attachMode,
        removedAtomIndices,
        removedAtomIds,
        transform: {
          connectionWorld: [connectionWorld.x, connectionWorld.y, connectionWorld.z],
          direction: [attachDir.x, attachDir.y, attachDir.z],
          quaternion: [rot.x, rot.y, rot.z, rot.w],
          bondLengthAngstrom: bondLength,
        },
        resultingBondOrder: bondOrder,
        atomCountAdded: fragment.atoms.length,
        addedAtomIds,
        addedAtomIndices: newIndices.slice(),
      });
      const afterFragmentOps = cloneJsonLike(Array.isArray(vol.fragmentOps) ? vol.fragmentOps : []);
      const afterBonds = cloneBondSnapshot(vol);
      pushEditHistoryEntry(record, beforeAtoms, afterAtoms, `Add fragment: ${fragment.name}`, {
        beforeFragmentOps,
        afterFragmentOps,
        beforeBonds,
        afterBonds,
      });

      clearAddGrowPreview();
      clearHover();
      rebuildScene({ preserveView: true });
      updateSidePanel();
      const detailParts = [];
      if (warnings.overlapCount > 0) detailParts.push(`${warnings.overlapCount} severe overlap${warnings.overlapCount === 1 ? '' : 's'}`);
      if (warnings.valencePressureCount > 0) detailParts.push(`${warnings.valencePressureCount} valence warning${warnings.valencePressureCount === 1 ? '' : 's'}`);
      if (cleanupResult.bondLengthApplied) detailParts.push('cleanup: bond length');
      if (cleanupResult.overlapShift > 1e-6) detailParts.push(`cleanup: overlap +${cleanupResult.overlapShift.toFixed(2)} Å`);
      const detailSuffix = detailParts.length ? ` • ${detailParts.join(' • ')}` : '';
      setHintMessage(`Added fragment ${fragment.name} (${fragment.formula}) via ${attachMode === EDIT_FRAGMENT_ATTACH_POLICY.REPLACE_H ? 'Replace H' : 'Append'}${detailSuffix}`);
      return true;
    }

    function deleteAtomAtIndex(atomIndex) {
      const record = ensureEditableVolumeRecord();
      const vol = record && record.vol;
      if (!vol || !Array.isArray(vol.atoms)) return false;
      const idx = atomIndex | 0;
      if (idx < 0 || idx >= vol.atoms.length) return false;
      const beforeAtoms = cloneAtomsSnapshot(vol);
      const beforeBonds = cloneBondSnapshot(vol);
      const beforeFragmentOps = cloneJsonLike(Array.isArray(vol.fragmentOps) ? vol.fragmentOps : []);
      const removed = vol.atoms[idx];
      vol.atoms.splice(idx, 1);
      vol.natoms = vol.atoms.length;
      inferVolumeBonds(vol);
      const builderOpsChanged = pruneBuilderOperationsForVolume(vol);
      const afterAtoms = cloneAtomsSnapshot(vol);
      const afterBonds = cloneBondSnapshot(vol);
      const afterFragmentOps = cloneJsonLike(Array.isArray(vol.fragmentOps) ? vol.fragmentOps : []);
      pushEditHistoryEntry(record, beforeAtoms, afterAtoms, `Delete ${getElementSymbol(removed.Z | 0)}`, {
        beforeFragmentOps,
        afterFragmentOps,
        beforeBonds,
        afterBonds,
      });
      onDeleteAtomPostprocess(idx, removed, vol, builderOpsChanged);
      clearAddGrowPreview();
      clearHover();
      rebuildScene({ preserveView: true });
      updateSidePanel();
      syncBuilderExtensionFromVolumes();
      const suffix = builderOpsChanged ? ' • Builder metadata updated' : '';
      setHintMessage(`Deleted ${getElementName(removed.Z | 0)} (${getElementSymbol(removed.Z | 0)}) • Total atoms: ${vol.atoms.length}${suffix}`);
      return true;
    }

    function deleteHoveredAtom() {
      const hoverAtomMesh = state.hoverAtomMesh;
      if (!hoverAtomMesh || !hoverAtomMesh.userData) return false;
      const idx = hoverAtomMesh.userData.index | 0;
      return deleteAtomAtIndex(idx);
    }

    return {
      recordFragmentOperation,
      clearMoleculePlacementPreview,
      startMoleculePlacementAtWorld,
      updateMoleculePlacementRotationFromEvent,
      alignMoleculePlacementToAxis,
      commitMoleculePlacement,
      clearFuseRingPreview,
      startFuseRingPlacementFromBondHit,
      updateFuseRingPlacementRotationFromEvent,
      commitFuseRingPlacement,
      resolveAddAtomOperatorSession,
      beginAddAtomOperatorSession,
      setAddAtomOperatorWorldPosition,
      finalizeAddAtomOperatorSession,
      applyAddAtomOperatorInput,
      appendAtomAtWorld,
      applyCleanupToLatestFragmentOperation,
      appendFragmentAtWorld,
      deleteAtomAtIndex,
      deleteHoveredAtom,
    };
  }

  global.VibeMolEditPlacement = Object.freeze({
    createEditPlacementController,
  });
})(window);
