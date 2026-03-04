(function () {
  /**
   * Build one reversible snapshot command for atom-coordinate edits.
   * @param {{record:*,before:Array<object>,after:Array<object>,label:string,at?:number}} options
   * @returns {{type:string,record:*,before:Array<object>,after:Array<object>,label:string,at:number,undo:(ctx:{applyAtomsSnapshotToRecord:(record:*,atoms:Array<object>)=>boolean})=>boolean,redo:(ctx:{applyAtomsSnapshotToRecord:(record:*,atoms:Array<object>)=>boolean})=>boolean}|null}
   */
  function createAtomSnapshotCommand(options) {
    const record = options && options.record;
    const before = options && Array.isArray(options.before) ? options.before : null;
    const after = options && Array.isArray(options.after) ? options.after : null;
    if (!record || !before || !after) return null;
    return {
      type: 'atom_snapshot',
      record,
      before,
      after,
      label: String((options && options.label) || 'Edit'),
      at: Number.isFinite(options && options.at) ? Number(options.at) : Date.now(),
      undo(ctx) {
        const apply = ctx && ctx.applyAtomsSnapshotToRecord;
        if (typeof apply !== 'function') return false;
        return !!apply(record, before);
      },
      redo(ctx) {
        const apply = ctx && ctx.applyAtomsSnapshotToRecord;
        if (typeof apply !== 'function') return false;
        return !!apply(record, after);
      },
    };
  }

  window.VibeMolEditCommands = Object.freeze({
    createAtomSnapshotCommand,
  });
})();
