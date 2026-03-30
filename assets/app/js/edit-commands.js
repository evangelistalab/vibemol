(function () {
  /**
   * Build one reversible snapshot command for atom/topology edits.
   * Optional builder metadata and bond snapshots are applied alongside atoms when supplied.
   * @param {{record:*,before:Array<object>,after:Array<object>,beforeFragmentOps?:Array<object>|null,afterFragmentOps?:Array<object>|null,beforeBonds?:Array<object>|null,afterBonds?:Array<object>|null,label:string,at?:number}} options
   * @returns {{type:string,record:*,before:Array<object>,after:Array<object>,beforeFragmentOps:Array<object>|null,afterFragmentOps:Array<object>|null,beforeBonds:Array<object>|null,afterBonds:Array<object>|null,label:string,at:number,undo:(ctx:{applyAtomsSnapshotToRecord:(record:*,atoms:Array<object>,fragmentOps?:Array<object>|null,bonds?:Array<object>|null)=>boolean})=>boolean,redo:(ctx:{applyAtomsSnapshotToRecord:(record:*,atoms:Array<object>,fragmentOps?:Array<object>|null,bonds?:Array<object>|null)=>boolean})=>boolean}|null}
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
      beforeFragmentOps: options && Array.isArray(options.beforeFragmentOps) ? options.beforeFragmentOps : null,
      afterFragmentOps: options && Array.isArray(options.afterFragmentOps) ? options.afterFragmentOps : null,
      beforeBonds: options && Array.isArray(options.beforeBonds) ? options.beforeBonds : null,
      afterBonds: options && Array.isArray(options.afterBonds) ? options.afterBonds : null,
      label: String((options && options.label) || 'Edit'),
      at: Number.isFinite(options && options.at) ? Number(options.at) : Date.now(),
      undo(ctx) {
        const apply = ctx && ctx.applyAtomsSnapshotToRecord;
        if (typeof apply !== 'function') return false;
        return !!apply(record, before, this.beforeFragmentOps, this.beforeBonds);
      },
      redo(ctx) {
        const apply = ctx && ctx.applyAtomsSnapshotToRecord;
        if (typeof apply !== 'function') return false;
        return !!apply(record, after, this.afterFragmentOps, this.afterBonds);
      },
    };
  }

  window.VibeMolEditCommands = Object.freeze({
    createAtomSnapshotCommand,
  });
})();
