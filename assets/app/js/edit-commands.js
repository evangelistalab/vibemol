(function () {
  /**
   * Build one reversible snapshot command for atom/topology edits.
   * Optional annotations, builder metadata, and bond snapshots are applied alongside atoms only when supplied.
   * Omitted optional snapshots leave the current record state untouched; explicit `null` clears that state.
   * @param {{record:*,before:Array<object>,after:Array<object>,beforeFragmentOps?:Array<object>|null,afterFragmentOps?:Array<object>|null,beforeBonds?:Array<object>|null,afterBonds?:Array<object>|null,beforeAnnotations?:object|null,afterAnnotations?:object|null,label:string,at?:number}} options
   * @returns {{type:string,record:*,before:Array<object>,after:Array<object>,beforeFragmentOps:Array<object>|null|undefined,afterFragmentOps:Array<object>|null|undefined,beforeBonds:Array<object>|null|undefined,afterBonds:Array<object>|null|undefined,beforeAnnotations:object|null|undefined,afterAnnotations:object|null|undefined,label:string,at:number,undo:(ctx:{applyAtomsSnapshotToRecord:(record:*,atoms:Array<object>,fragmentOps?:Array<object>|null,bonds?:Array<object>|null,annotations?:object|null)=>boolean})=>boolean,redo:(ctx:{applyAtomsSnapshotToRecord:(record:*,atoms:Array<object>,fragmentOps?:Array<object>|null,bonds?:Array<object>|null,annotations?:object|null)=>boolean})=>boolean}|null}
   */
  function createAtomSnapshotCommand(options) {
    const record = options && options.record;
    const before = options && Array.isArray(options.before) ? options.before : null;
    const after = options && Array.isArray(options.after) ? options.after : null;
    if (!record || !before || !after) return null;
    const hasOwn = (key) => !!(options && Object.prototype.hasOwnProperty.call(options, key));
    const getOptionalArray = (key) => {
      if (!hasOwn(key)) return undefined;
      const value = options[key];
      if (value === null) return null;
      return Array.isArray(value) ? value : undefined;
    };
    const getOptionalObject = (key) => {
      if (!hasOwn(key)) return undefined;
      const value = options[key];
      if (value === null) return null;
      return value && typeof value === 'object' ? value : undefined;
    };
    return {
      type: 'atom_snapshot',
      record,
      before,
      after,
      beforeFragmentOps: getOptionalArray('beforeFragmentOps'),
      afterFragmentOps: getOptionalArray('afterFragmentOps'),
      beforeBonds: getOptionalArray('beforeBonds'),
      afterBonds: getOptionalArray('afterBonds'),
      beforeAnnotations: getOptionalObject('beforeAnnotations'),
      afterAnnotations: getOptionalObject('afterAnnotations'),
      label: String((options && options.label) || 'Edit'),
      at: Number.isFinite(options && options.at) ? Number(options.at) : Date.now(),
      undo(ctx) {
        const apply = ctx && ctx.applyAtomsSnapshotToRecord;
        if (typeof apply !== 'function') return false;
        return !!apply(record, before, this.beforeFragmentOps, this.beforeBonds, this.beforeAnnotations);
      },
      redo(ctx) {
        const apply = ctx && ctx.applyAtomsSnapshotToRecord;
        if (typeof apply !== 'function') return false;
        return !!apply(record, after, this.afterFragmentOps, this.afterBonds, this.afterAnnotations);
      },
    };
  }

  window.VibeMolEditCommands = Object.freeze({
    createAtomSnapshotCommand,
  });
})();
