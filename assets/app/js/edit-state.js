(function (global) {
  'use strict';

  /**
   * Create one edit-state controller that owns history stacks and editable-record bootstrap.
   * App-specific scene/UI side effects are injected through callbacks.
   * @param {{
   *   getVolumes:()=>Array<any>,
   *   getCurrentIndex:()=>number,
   *   setCurrentIndex:(index:number)=>void,
   *   ensureVolumeSchema:(vol:any, options?:object)=>any,
   *   normalizeVolumeAtom:(atom:any)=>any,
   *   cloneJsonLike:(value:any)=>any,
   *   cloneBondSnapshot:(vol:any)=>Array<object>,
   *   bondSnapshotsEqual:(a:Array<object>, b:Array<object>)=>boolean,
   *   atomsSnapshotsEqual:(a:Array<object>, b:Array<object>)=>boolean,
   *   coordinateSnapshotsEqual:(a:any, b:any)=>boolean,
   *   createAtomSnapshotCommand:(options:any)=>any,
   *   pruneBuilderOperationsForVolume:(vol:any)=>void,
   *   syncBuilderExtensionFromVolumes:()=>void,
   *   activateVolumeIndex:(index:number, options?:object)=>void,
   *   clearTransientInteractionState:(options?:object)=>void,
   *   syncActiveVolumeControls:()=>void,
   *   rebuildScene:(options?:object)=>void,
   *   updateSidePanel:()=>void,
   *   setHintMessage:(message:string)=>void,
   *   hasVolumetricGrid:(vol:any)=>boolean,
   *   editHistoryLimit?:number,
   * }} options
   */
  function createEditStateController(options = {}) {
    const getVolumes = typeof options.getVolumes === 'function' ? options.getVolumes : (() => []);
    const getCurrentIndex = typeof options.getCurrentIndex === 'function' ? options.getCurrentIndex : (() => -1);
    const setCurrentIndex = typeof options.setCurrentIndex === 'function' ? options.setCurrentIndex : (() => {});
    const ensureVolumeSchema = typeof options.ensureVolumeSchema === 'function' ? options.ensureVolumeSchema : (() => null);
    const normalizeVolumeAtom = typeof options.normalizeVolumeAtom === 'function' ? options.normalizeVolumeAtom : ((atom) => atom);
    const cloneJsonLike = typeof options.cloneJsonLike === 'function' ? options.cloneJsonLike : ((value) => value);
    const cloneBondSnapshot = typeof options.cloneBondSnapshot === 'function' ? options.cloneBondSnapshot : (() => []);
    const bondSnapshotsEqual = typeof options.bondSnapshotsEqual === 'function' ? options.bondSnapshotsEqual : (() => false);
    const atomsSnapshotsEqual = typeof options.atomsSnapshotsEqual === 'function' ? options.atomsSnapshotsEqual : (() => false);
    const coordinateSnapshotsEqual = typeof options.coordinateSnapshotsEqual === 'function' ? options.coordinateSnapshotsEqual : (() => false);
    const createAtomSnapshotCommand = typeof options.createAtomSnapshotCommand === 'function' ? options.createAtomSnapshotCommand : (() => null);
    const pruneBuilderOperationsForVolume = typeof options.pruneBuilderOperationsForVolume === 'function' ? options.pruneBuilderOperationsForVolume : (() => {});
    const syncBuilderExtensionFromVolumes = typeof options.syncBuilderExtensionFromVolumes === 'function' ? options.syncBuilderExtensionFromVolumes : (() => {});
    const activateVolumeIndex = typeof options.activateVolumeIndex === 'function' ? options.activateVolumeIndex : (() => {});
    const clearTransientInteractionState = typeof options.clearTransientInteractionState === 'function' ? options.clearTransientInteractionState : (() => {});
    const syncActiveVolumeControls = typeof options.syncActiveVolumeControls === 'function' ? options.syncActiveVolumeControls : (() => {});
    const rebuildScene = typeof options.rebuildScene === 'function' ? options.rebuildScene : (() => {});
    const updateSidePanel = typeof options.updateSidePanel === 'function' ? options.updateSidePanel : (() => {});
    const setHintMessage = typeof options.setHintMessage === 'function' ? options.setHintMessage : (() => {});
    const hasVolumetricGrid = typeof options.hasVolumetricGrid === 'function' ? options.hasVolumetricGrid : (() => false);
    const editHistoryLimit = Math.max(1, Number(options.editHistoryLimit) || 200);

    let editUndoStack = [];
    let editRedoStack = [];

    function pushHistoryCommand(command) {
      if (!command || typeof command !== 'object') return false;
      editUndoStack.push(command);
      if (editUndoStack.length > editHistoryLimit) {
        editUndoStack.splice(0, editUndoStack.length - editHistoryLimit);
      }
      editRedoStack.length = 0;
      return true;
    }

    function pruneEditHistory() {
      const volumes = getVolumes();
      const keep = (entry) => !!entry && !!entry.record && Array.isArray(volumes) && volumes.includes(entry.record);
      editUndoStack = editUndoStack.filter(keep);
      editRedoStack = editRedoStack.filter(keep);
    }

    function clearEditHistory() {
      editUndoStack = [];
      editRedoStack = [];
    }

    function pushEditHistoryEntry(record, beforeAtoms, afterAtoms, label, historyOptions = {}) {
      if (!record || !record.vol) return;
      if (!Array.isArray(beforeAtoms) || !Array.isArray(afterAtoms)) return;
      const hasOwn = (key) => Object.prototype.hasOwnProperty.call(historyOptions, key);
      const cloneOptionalArray = (key) => {
        if (!hasOwn(key)) return undefined;
        const value = historyOptions[key];
        if (value === null) return null;
        return Array.isArray(value) ? cloneJsonLike(value) : undefined;
      };
      const cloneOptionalObject = (key) => {
        if (!hasOwn(key)) return undefined;
        const value = historyOptions[key];
        if (value === null) return null;
        return value && typeof value === 'object' ? cloneJsonLike(value) : undefined;
      };
      const serializeOptionalSnapshot = (value) => (value === undefined ? '__undefined__' : JSON.stringify(value));
      const beforeFragmentOps = cloneOptionalArray('beforeFragmentOps');
      const afterFragmentOps = cloneOptionalArray('afterFragmentOps');
      const beforeBonds = cloneOptionalArray('beforeBonds');
      const afterBonds = cloneOptionalArray('afterBonds');
      const beforeAnnotations = cloneOptionalObject('beforeAnnotations');
      const afterAnnotations = cloneOptionalObject('afterAnnotations');
      if (atomsSnapshotsEqual(beforeAtoms, afterAtoms)) {
        const beforeJson = serializeOptionalSnapshot(beforeFragmentOps);
        const afterJson = serializeOptionalSnapshot(afterFragmentOps);
        const beforeBondJson = serializeOptionalSnapshot(beforeBonds);
        const afterBondJson = serializeOptionalSnapshot(afterBonds);
        const beforeAnnotationJson = serializeOptionalSnapshot(beforeAnnotations);
        const afterAnnotationJson = serializeOptionalSnapshot(afterAnnotations);
        if (beforeJson === afterJson && beforeBondJson === afterBondJson && beforeAnnotationJson === afterAnnotationJson) return;
      }
      const command = createAtomSnapshotCommand({
        record,
        before: beforeAtoms,
        after: afterAtoms,
        beforeFragmentOps,
        afterFragmentOps,
        beforeBonds,
        afterBonds,
        beforeAnnotations,
        afterAnnotations,
        label: String(label || 'Edit'),
        at: Date.now(),
      });
      if (!command) return;
      pushHistoryCommand(command);
    }

    function pushCoordinateSnapshotHistoryEntry(record, before, after, label) {
      if (!record || !record.vol || !before || !after) return;
      if (!Array.isArray(before.atoms) || !Array.isArray(after.atoms)) return;
      if (coordinateSnapshotsEqual(before, after)) return;
      pushHistoryCommand({
        type: 'coordinate_snapshot',
        record,
        before,
        after,
        label: String(label || 'Edit'),
        at: Date.now(),
        undo(ctx) {
          const apply = ctx && ctx.applyStructureSnapshotToRecord;
          if (typeof apply !== 'function') return false;
          return !!apply(record, before);
        },
        redo(ctx) {
          const apply = ctx && ctx.applyStructureSnapshotToRecord;
          if (typeof apply !== 'function') return false;
          return !!apply(record, after);
        },
      });
    }

    function applyRecordSpatialState(record, atoms, grid = null, fragmentOps = undefined, bonds = undefined, annotations = undefined) {
      if (!record || !record.vol || !Array.isArray(atoms)) return false;
      const volumes = getVolumes();
      const idx = Array.isArray(volumes) ? volumes.indexOf(record) : -1;
      if (idx < 0) return false;
      record.vol.atoms = atoms.map((atom) => normalizeVolumeAtom(atom));
      if (fragmentOps === null) {
        record.vol.fragmentOps = [];
      } else if (Array.isArray(fragmentOps)) {
        record.vol.fragmentOps = cloneJsonLike(fragmentOps) || [];
      } else if (!Array.isArray(record.vol.fragmentOps)) {
        record.vol.fragmentOps = [];
      }
      pruneBuilderOperationsForVolume(record.vol);
      if (grid && hasVolumetricGrid(record.vol)) {
        record.vol.origin = [
          Number(grid.origin && grid.origin[0]) || 0,
          Number(grid.origin && grid.origin[1]) || 0,
          Number(grid.origin && grid.origin[2]) || 0,
        ];
        record.vol.axes = [
          [Number(grid.axes && grid.axes[0] && grid.axes[0][0]) || 0, Number(grid.axes && grid.axes[0] && grid.axes[0][1]) || 0, Number(grid.axes && grid.axes[0] && grid.axes[0][2]) || 0],
          [Number(grid.axes && grid.axes[1] && grid.axes[1][0]) || 0, Number(grid.axes && grid.axes[1] && grid.axes[1][1]) || 0, Number(grid.axes && grid.axes[1] && grid.axes[1][2]) || 0],
          [Number(grid.axes && grid.axes[2] && grid.axes[2][0]) || 0, Number(grid.axes && grid.axes[2] && grid.axes[2][1]) || 0, Number(grid.axes && grid.axes[2] && grid.axes[2][2]) || 0],
        ];
      }
      if (bonds === null) {
        record.vol.bonds = [];
      } else if (Array.isArray(bonds)) {
        record.vol.bonds = cloneJsonLike(bonds) || [];
      }
      if (annotations === null) {
        record.vol.annotations = {};
      } else if (annotations && typeof annotations === 'object') {
        record.vol.annotations = cloneJsonLike(annotations) || {};
      }
      record.vol.natoms = record.vol.atoms.length;
      ensureVolumeSchema(record.vol, { inferMissingBonds: false });
      syncBuilderExtensionFromVolumes();
      setCurrentIndex(idx);
      clearTransientInteractionState();
      syncActiveVolumeControls();
      rebuildScene({ preserveView: true });
      updateSidePanel();
      return true;
    }

    function applyAtomsSnapshotToRecord(record, atoms, fragmentOps = undefined, bonds = undefined, annotations = undefined) {
      return applyRecordSpatialState(record, atoms, null, fragmentOps, bonds, annotations);
    }

    function applyStructureSnapshotToRecord(record, snapshot) {
      if (!snapshot || !Array.isArray(snapshot.atoms)) return false;
      return applyRecordSpatialState(record, snapshot.atoms, snapshot.grid || null);
    }

    function undo() {
      pruneEditHistory();
      if (editUndoStack.length === 0) {
        setHintMessage('Nothing to undo.');
        return false;
      }
      const command = editUndoStack.pop();
      if (!command || typeof command.undo !== 'function' || !command.undo({ applyAtomsSnapshotToRecord, applyStructureSnapshotToRecord })) {
        setHintMessage('Undo failed: target structure is no longer available.');
        return false;
      }
      editRedoStack.push(command);
      if (editRedoStack.length > editHistoryLimit) {
        editRedoStack.splice(0, editRedoStack.length - editHistoryLimit);
      }
      setHintMessage(`Undo: ${command.label || 'Edit'}`);
      return true;
    }

    function redo() {
      pruneEditHistory();
      if (editRedoStack.length === 0) {
        setHintMessage('Nothing to redo.');
        return false;
      }
      const command = editRedoStack.pop();
      if (!command || typeof command.redo !== 'function' || !command.redo({ applyAtomsSnapshotToRecord, applyStructureSnapshotToRecord })) {
        setHintMessage('Redo failed: target structure is no longer available.');
        return false;
      }
      editUndoStack.push(command);
      if (editUndoStack.length > editHistoryLimit) {
        editUndoStack.splice(0, editUndoStack.length - editHistoryLimit);
      }
      setHintMessage(`Redo: ${command.label || 'Edit'}`);
      return true;
    }

    function createEmptyEditableVolume() {
      const idx0 = () => 0;
      return {
        title: 'Untitled molecule',
        comment: 'Created in edit mode',
        natoms: 0,
        origin: [0, 0, 0],
        nxyz: [0, 0, 0],
        axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        atoms: [],
        bonds: [],
        annotations: { builder: { byAtomId: {} }, coordination: { byAtomId: {} } },
        fragmentOps: [],
        data: new Float32Array(0),
        idx: idx0,
        units: 'angstrom',
        isoHint: null,
      };
    }

    function getNextUntitledFileName() {
      const volumes = getVolumes();
      const used = new Set((Array.isArray(volumes) ? volumes : []).map((record) => String((record && record.name) || '').trim().toLowerCase()));
      let n = 1;
      while (used.has(`untitled-${n}.xyz`)) n += 1;
      return `untitled-${n}.xyz`;
    }

    function createNewEditableVolumeRecord(createOptions = {}) {
      const volumes = getVolumes();
      if (!Array.isArray(volumes)) return null;
      const preferred = String(createOptions.name || '').trim();
      const name = preferred || getNextUntitledFileName();
      const record = { name, vol: createEmptyEditableVolume() };
      ensureVolumeSchema(record.vol, { inferMissingBonds: false });
      volumes.push(record);
      activateVolumeIndex(volumes.length - 1, { rebuild: false });
      return record;
    }

    function ensureEditableVolumeRecord() {
      const currentIndex = getCurrentIndex();
      const volumes = getVolumes();
      if (currentIndex >= 0 && Array.isArray(volumes) && volumes[currentIndex] && volumes[currentIndex].vol) return volumes[currentIndex];
      return createNewEditableVolumeRecord();
    }

    return {
      createNewEditableVolumeRecord,
      ensureEditableVolumeRecord,
      pushHistoryCommand,
      pushEditHistoryEntry,
      pushCoordinateSnapshotHistoryEntry,
      applyAtomsSnapshotToRecord,
      applyStructureSnapshotToRecord,
      clearEditHistory,
      pruneEditHistory,
      undo,
      redo,
    };
  }

  global.VibeMolEditState = Object.freeze({
    createEditStateController,
  });
})(window);
