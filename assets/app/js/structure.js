(function () {
  'use strict';

  let nextBuilderAtomId = 1;
  let nextBuilderGroupId = 1;
  let nextBuilderOpId = 1;

  /**
   * Deep-clone JSON-compatible data.
   * @param {*} value
   * @returns {*}
   */
  function cloneJsonLike(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  /**
   * Deep-clone JSON-compatible data and preserve typed arrays/ArrayBuffers.
   * @param {*} value
   * @returns {*}
   */
  function cloneJsonStructuredData(value) {
    if (value == null || typeof value !== 'object') return value;
    if (ArrayBuffer.isView(value)) return Array.from(value);
    if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
    if (Array.isArray(value)) return value.map((item) => cloneJsonStructuredData(item));
    if (!isPlainObject(value)) return cloneJsonLike(value);
    const out = {};
    for (const [key, next] of Object.entries(value)) {
      if (typeof next === 'function') continue;
      out[key] = cloneJsonStructuredData(next);
    }
    return out;
  }

  /**
   * Return whether one value is a plain object.
   * @param {*} value
   * @returns {boolean}
   */
  function isPlainObject(value) {
    if (!value || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  /**
   * Deep-clone structured volume/metadata state while preserving typed arrays.
   * Function-valued fields are skipped and must be rehydrated explicitly.
   * @param {*} value
   * @returns {*}
   */
  function cloneStructuredData(value) {
    if (value == null || typeof value !== 'object') return value;
    if (ArrayBuffer.isView(value)) return new value.constructor(value);
    if (value instanceof ArrayBuffer) return value.slice(0);
    if (Array.isArray(value)) return value.map((item) => cloneStructuredData(item));
    const out = {};
    for (const [key, next] of Object.entries(value)) {
      if (typeof next === 'function') continue;
      out[key] = cloneStructuredData(next);
    }
    return out;
  }

  /**
   * Clamp requested preview/bond order to supported range [1..4].
   * @param {*} order
   * @returns {number}
   */
  function normalizeEditAddBondOrder(order) {
    const n = Number(order);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(4, Math.round(n)));
  }

  /**
   * Allocate one stable builder atom id.
   * @returns {string}
   */
  function allocateBuilderAtomId() {
    const id = `atom-${nextBuilderAtomId}`;
    nextBuilderAtomId += 1;
    return id;
  }

  /**
   * Allocate one stable builder group id.
   * @returns {string}
   */
  function allocateBuilderGroupId() {
    const id = `group-${nextBuilderGroupId}`;
    nextBuilderGroupId += 1;
    return id;
  }

  /**
   * Allocate one stable builder operation id.
   * @returns {string}
   */
  function allocateBuilderOpId() {
    const id = `op-${nextBuilderOpId}`;
    nextBuilderOpId += 1;
    return id;
  }

  /**
   * Ensure counters advance past an observed builder id suffix.
   * @param {*} raw
   * @param {'atom'|'group'|'op'} prefix
   */
  function absorbObservedBuilderId(raw, prefix) {
    const match = String(raw || '').match(new RegExp(`^${prefix}-(\\d+)$`));
    if (!match) return;
    const n = Number(match[1]);
    if (!Number.isInteger(n) || n < 1) return;
    if (prefix === 'atom') nextBuilderAtomId = Math.max(nextBuilderAtomId, n + 1);
    else if (prefix === 'group') nextBuilderGroupId = Math.max(nextBuilderGroupId, n + 1);
    else if (prefix === 'op') nextBuilderOpId = Math.max(nextBuilderOpId, n + 1);
  }

  /**
   * Ensure one atom carries a stable builder id.
   * @param {*} atom
   * @returns {string}
   */
  function ensureAtomId(atom) {
    if (!atom || typeof atom !== 'object') return '';
    let id = String(atom.id || '').trim();
    if (!id) {
      id = allocateBuilderAtomId();
      atom.id = id;
    } else {
      absorbObservedBuilderId(id, 'atom');
    }
    return id;
  }

  /**
   * Ensure all atoms in one volume carry stable ids.
   * @param {*} vol
   */
  function ensureVolumeAtomIds(vol) {
    if (!vol || !Array.isArray(vol.atoms)) return;
    for (const atom of vol.atoms) ensureAtomId(atom);
  }

  /**
   * Return the builder-annotation map for one volume.
   * @param {*} vol
   * @param {boolean=} create
   * @returns {Record<string, {groupId?:string,entryId?:string,entryKind?:string}>|null}
   */
  function getBuilderAnnotationsMap(vol, create = true) {
    if (!vol || typeof vol !== 'object') return null;
    if (!isPlainObject(vol.annotations)) {
      if (!create) return null;
      vol.annotations = {};
    }
    if (!isPlainObject(vol.annotations.builder)) {
      if (!create) return null;
      vol.annotations.builder = {};
    }
    if (!isPlainObject(vol.annotations.builder.byAtomId)) {
      if (!create) return null;
      vol.annotations.builder.byAtomId = {};
    }
    return vol.annotations.builder.byAtomId;
  }

  /**
   * Normalize one atom to the minimal incremental schema.
   * @param {*} raw
   * @returns {{id:string,Z:number,x:number,y:number,z:number,formalCharge:number}}
   */
  function normalizeVolumeAtom(raw) {
    const atom = (raw && typeof raw === 'object') ? raw : {};
    const out = {
      id: String(atom.id || '').trim() || allocateBuilderAtomId(),
      Z: Number(atom.Z) | 0,
      x: Number(atom.x) || 0,
      y: Number(atom.y) || 0,
      z: Number(atom.z) || 0,
      formalCharge: Number.isFinite(atom.formalCharge) ? Math.round(Number(atom.formalCharge)) : 0,
    };
    absorbObservedBuilderId(out.id, 'atom');
    return out;
  }

  /**
   * Resolve a stable atom id from an atom object/index/string.
   * @param {*} vol
   * @param {*=} atomOrIndex
   * @returns {string}
   */
  function resolveVolumeAtomId(vol, atomOrIndex) {
    if (!vol || !Array.isArray(vol.atoms)) return '';
    if (typeof atomOrIndex === 'string') return String(atomOrIndex).trim();
    if (Number.isInteger(atomOrIndex)) {
      const idx = atomOrIndex | 0;
      return (idx >= 0 && idx < vol.atoms.length && vol.atoms[idx]) ? ensureAtomId(vol.atoms[idx]) : '';
    }
    if (atomOrIndex && typeof atomOrIndex === 'object') return ensureAtomId(atomOrIndex);
    return '';
  }

  /**
   * Read builder provenance for one atom from annotations, with legacy fallback.
   * @param {*} vol
   * @param {*=} atomOrIndex
   * @returns {{groupId:string,entryId:string,entryKind:string}}
   */
  function getAtomBuilderMeta(vol, atomOrIndex) {
    const atomId = resolveVolumeAtomId(vol, atomOrIndex);
    const atom = typeof atomOrIndex === 'object'
      ? atomOrIndex
      : (Number.isInteger(atomOrIndex) && vol && Array.isArray(vol.atoms) ? vol.atoms[atomOrIndex | 0] : null);
    const map = getBuilderAnnotationsMap(vol, false);
    const stored = (map && atomId && isPlainObject(map[atomId])) ? map[atomId] : null;
    const groupId = String((stored && stored.groupId) || (atom && atom.builderGroupId) || '').trim();
    const entryId = String((stored && stored.entryId) || (atom && atom.builderEntryId) || '').trim().toLowerCase();
    const entryKind = String((stored && stored.entryKind) || (atom && atom.builderEntryKind) || '').trim().toLowerCase();
    return { groupId, entryId, entryKind };
  }

  /**
   * Apply builder provenance to one atom via annotations.
   * @param {*} vol
   * @param {*=} atomOrIndex
   * @param {{groupId?:string|null,entryId?:string|null,entryKind?:string|null}=} meta
   */
  function setAtomBuilderMeta(vol, atomOrIndex, meta = {}) {
    const atomId = resolveVolumeAtomId(vol, atomOrIndex);
    if (!atomId) return;
    const map = getBuilderAnnotationsMap(vol, true);
    if (!map) return;
    const prev = getAtomBuilderMeta(vol, atomOrIndex);
    const groupId = meta.groupId == null ? prev.groupId : String(meta.groupId || '').trim();
    const entryId = meta.entryId == null ? prev.entryId : String(meta.entryId || '').trim().toLowerCase();
    const entryKind = meta.entryKind == null ? prev.entryKind : String(meta.entryKind || '').trim().toLowerCase();
    if (!groupId && !entryId && !entryKind) {
      delete map[atomId];
    } else {
      map[atomId] = {};
      if (groupId) {
        map[atomId].groupId = groupId;
        absorbObservedBuilderId(groupId, 'group');
      }
      if (entryId) map[atomId].entryId = entryId;
      if (entryKind) map[atomId].entryKind = entryKind;
    }
    const atom = typeof atomOrIndex === 'object'
      ? atomOrIndex
      : (Number.isInteger(atomOrIndex) && vol && Array.isArray(vol.atoms) ? vol.atoms[atomOrIndex | 0] : null);
    if (atom && typeof atom === 'object') {
      delete atom.builderGroupId;
      delete atom.builderEntryId;
      delete atom.builderEntryKind;
    }
  }

  /**
   * Migrate any legacy atom-level builder metadata into annotations.
   * @param {*} vol
   */
  function migrateLegacyBuilderAnnotations(vol) {
    if (!vol || !Array.isArray(vol.atoms)) return;
    for (const atom of vol.atoms) {
      if (!atom || typeof atom !== 'object') continue;
      const groupId = String(atom.builderGroupId || '').trim();
      const entryId = String(atom.builderEntryId || '').trim().toLowerCase();
      const entryKind = String(atom.builderEntryKind || '').trim().toLowerCase();
      if (groupId || entryId || entryKind) {
        setAtomBuilderMeta(vol, atom, { groupId, entryId, entryKind });
      }
      delete atom.builderGroupId;
      delete atom.builderEntryId;
      delete atom.builderEntryKind;
    }
  }

  /**
   * Build one stable bond id from two atom ids.
   * @param {string} a
   * @param {string} b
   * @returns {string}
   */
  function buildVolumeBondId(a, b) {
    const left = String(a || '').trim();
    const right = String(b || '').trim();
    if (!left || !right) return '';
    return left < right ? `bond:${left}:${right}` : `bond:${right}:${left}`;
  }

  /**
   * Normalize one stored bond kind.
   * @param {*} value
   * @returns {'normal'}
   */
  function normalizeVolumeBondKind(value) {
    return String(value || '').trim().toLowerCase() === 'normal' ? 'normal' : 'normal';
  }

  /**
   * Normalize one persistent bond record to ID endpoints.
   * @param {*} vol
   * @param {*} raw
   * @returns {{id:string,a:string,b:string,order:number,kind:'normal'}|null}
   */
  function normalizeVolumeBondRecord(vol, raw) {
    if (!vol || !Array.isArray(vol.atoms) || !raw || typeof raw !== 'object') return null;
    const atoms = vol.atoms;
    const resolveEndpoint = (value) => {
      if (typeof value === 'string') return String(value).trim();
      if (Number.isInteger(value)) {
        const idx = value | 0;
        return (idx >= 0 && idx < atoms.length && atoms[idx]) ? ensureAtomId(atoms[idx]) : '';
      }
      return '';
    };
    const a = resolveEndpoint(raw.a);
    const b = resolveEndpoint(raw.b);
    if (!a || !b || a === b) return null;
    const id = String(raw.id || '').trim() || buildVolumeBondId(a, b);
    return {
      id,
      a,
      b,
      order: normalizeEditAddBondOrder(raw.order || 1),
      kind: normalizeVolumeBondKind(raw.kind),
    };
  }

  /**
   * Ensure one volume uses the minimal incremental schema.
   * @param {*} vol
   * @param {{inferMissingBonds?:boolean,inferBonds?:(vol:*)=>Array,rehydrateBuilderState?:(vol:*)=>void}=} options
   * @returns {*}
   */
  function ensureVolumeSchema(vol, options = {}) {
    if (!vol || typeof vol !== 'object') return vol;
    if (Array.isArray(vol.atoms)) {
      migrateLegacyBuilderAnnotations(vol);
      vol.atoms = vol.atoms.map((atom) => normalizeVolumeAtom(atom));
      vol.natoms = vol.atoms.length;
    } else {
      vol.atoms = [];
      vol.natoms = 0;
    }
    getBuilderAnnotationsMap(vol, true);
    if (!Array.isArray(vol.fragmentOps)) vol.fragmentOps = [];
    if (typeof options.rehydrateBuilderState === 'function') {
      options.rehydrateBuilderState(vol);
    }
    if (Array.isArray(vol.bonds)) {
      vol.bonds = vol.bonds
        .map((bond) => normalizeVolumeBondRecord(vol, bond))
        .filter(Boolean);
    } else if (options.inferMissingBonds !== false && typeof options.inferBonds === 'function') {
      options.inferBonds(vol);
    } else {
      vol.bonds = [];
    }
    return vol;
  }

  /**
   * Deep-copy one normalized bond array for history snapshots.
   * @param {{atoms?:Array<object>,bonds?:Array<object>}|null} vol
   * @returns {Array<{id:string,a:string,b:string,order:number,kind:string}>}
   */
  function cloneBondSnapshot(vol) {
    const working = {
      atoms: vol && Array.isArray(vol.atoms) ? vol.atoms : [],
      bonds: vol && Array.isArray(vol.bonds) ? vol.bonds : [],
    };
    return working.bonds
      .map((bond) => normalizeVolumeBondRecord(working, bond))
      .filter(Boolean)
      .sort((left, right) => {
        const aKey = `${left.a}:${left.b}:${left.id}`;
        const bKey = `${right.a}:${right.b}:${right.id}`;
        return aKey.localeCompare(bKey);
      })
      .map((bond) => ({
        id: String(bond.id || ''),
        a: String(bond.a || ''),
        b: String(bond.b || ''),
        order: normalizeEditAddBondOrder(bond.order || 1),
        kind: normalizeVolumeBondKind(bond.kind),
      }));
  }

  /**
   * Compare two bond snapshots by value.
   * @param {Array<{id:string,a:string,b:string,order:number,kind:string}>} a
   * @param {Array<{id:string,a:string,b:string,order:number,kind:string}>} b
   * @returns {boolean}
   */
  function bondSnapshotsEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const left = a[i];
      const right = b[i];
      if (!left || !right) return false;
      if (String(left.id || '') !== String(right.id || '')) return false;
      if (String(left.a || '') !== String(right.a || '')) return false;
      if (String(left.b || '') !== String(right.b || '')) return false;
      if (normalizeEditAddBondOrder(left.order || 1) !== normalizeEditAddBondOrder(right.order || 1)) return false;
      if (normalizeVolumeBondKind(left.kind) !== normalizeVolumeBondKind(right.kind)) return false;
    }
    return true;
  }

  /**
   * Return the index of one explicit bond record between two atom ids.
   * @param {*} vol
   * @param {*} atomIdA
   * @param {*} atomIdB
   * @returns {number}
   */
  function findVolumeBondRecordIndex(vol, atomIdA, atomIdB) {
    if (!vol || !Array.isArray(vol.bonds)) return -1;
    const a = String(atomIdA || '').trim();
    const b = String(atomIdB || '').trim();
    if (!a || !b || a === b) return -1;
    for (let i = 0; i < vol.bonds.length; i++) {
      const bond = normalizeVolumeBondRecord(vol, vol.bonds[i]);
      if (!bond) continue;
      if ((bond.a === a && bond.b === b) || (bond.a === b && bond.b === a)) return i;
    }
    return -1;
  }

  /**
   * Create or update one explicit bond between two atom ids.
   * @param {*} vol
   * @param {*} atomIdA
   * @param {*} atomIdB
   * @param {*} order
   * @param {*} [kind='normal']
   * @returns {'created'|'updated'|'unchanged'|null}
   */
  function upsertVolumeBond(vol, atomIdA, atomIdB, order, kind = 'normal') {
    if (!vol || !Array.isArray(vol.atoms)) return null;
    ensureVolumeSchema(vol, { inferMissingBonds: false });
    const a = String(atomIdA || '').trim();
    const b = String(atomIdB || '').trim();
    if (!a || !b || a === b) return null;
    const nextOrder = normalizeEditAddBondOrder(order || 1);
    const nextKind = normalizeVolumeBondKind(kind);
    const index = findVolumeBondRecordIndex(vol, a, b);
    if (index >= 0) {
      const existing = normalizeVolumeBondRecord(vol, vol.bonds[index]);
      if (!existing) return null;
      if (existing.order === nextOrder && existing.kind === nextKind) return 'unchanged';
      vol.bonds[index] = {
        id: existing.id,
        a: existing.a,
        b: existing.b,
        order: nextOrder,
        kind: nextKind,
      };
      return 'updated';
    }
    vol.bonds.push({
      id: buildVolumeBondId(a, b),
      a,
      b,
      order: nextOrder,
      kind: nextKind,
    });
    return 'created';
  }

  /**
   * Remove one explicit bond between two atom ids.
   * @param {*} vol
   * @param {*} atomIdA
   * @param {*} atomIdB
   * @returns {boolean}
   */
  function removeVolumeBond(vol, atomIdA, atomIdB) {
    if (!vol || !Array.isArray(vol.bonds)) return false;
    const index = findVolumeBondRecordIndex(vol, atomIdA, atomIdB);
    if (index < 0) return false;
    vol.bonds.splice(index, 1);
    return true;
  }

  /**
   * Rebuild derived fields on one cloned volume.
   * @param {*} vol
   * @param {{ensureVolumeSchema?:(vol:*)=>*=}=} options
   * @returns {*}
   */
  function rehydrateClonedVolume(vol, options = {}) {
    if (!vol || typeof vol !== 'object') return vol;
    if (Array.isArray(vol.nxyz) && vol.nxyz.length === 3) {
      vol.idx = (i, j, k) => (i * vol.nxyz[1] + j) * vol.nxyz[2] + k;
    } else {
      vol.idx = () => 0;
    }
    if (Array.isArray(vol.data) && !(vol.data instanceof Float32Array)) vol.data = Float32Array.from(vol.data);
    for (const key of ['alphaRe', 'alphaIm', 'betaRe', 'betaIm']) {
      if (Array.isArray(vol[key]) && !(vol[key] instanceof Float32Array)) vol[key] = Float32Array.from(vol[key]);
    }
    if (vol.trajectory && Array.isArray(vol.trajectory.frames)) {
      vol.trajectory.frames = vol.trajectory.frames.map((frame) => (frame instanceof Float32Array) ? frame : Float32Array.from(frame || []));
    }
    if (vol.vibration) {
      if (Array.isArray(vol.vibration.equilibrium) && !(vol.vibration.equilibrium instanceof Float32Array)) {
        vol.vibration.equilibrium = Float32Array.from(vol.vibration.equilibrium);
      }
      if (Array.isArray(vol.vibration.frameBuffer) && !(vol.vibration.frameBuffer instanceof Float32Array)) {
        vol.vibration.frameBuffer = Float32Array.from(vol.vibration.frameBuffer);
      }
      if (Array.isArray(vol.vibration.modes)) {
        vol.vibration.modes = vol.vibration.modes.map((mode) => {
          const next = cloneJsonLike(mode) || {};
          if (Array.isArray(next.displacements) && !(next.displacements instanceof Float32Array)) {
            next.displacements = Float32Array.from(next.displacements);
          }
          return next;
        });
      }
    }
    if (vol.molden && Array.isArray(vol.molden.mos)) {
      vol.molden.mos = vol.molden.mos.map((mo) => {
        const next = cloneJsonLike(mo) || {};
        if (Array.isArray(next.coefficients) && !(next.coefficients instanceof Float32Array)) {
          next.coefficients = Float32Array.from(next.coefficients);
        }
        return next;
      });
    }
    if (typeof options.ensureVolumeSchema === 'function') options.ensureVolumeSchema(vol);
    return vol;
  }

  window.VibeMolStructureCore = Object.freeze({
    cloneJsonLike,
    cloneJsonStructuredData,
    isPlainObject,
    cloneStructuredData,
    normalizeEditAddBondOrder,
    allocateBuilderAtomId,
    allocateBuilderGroupId,
    allocateBuilderOpId,
    absorbObservedBuilderId,
    ensureAtomId,
    ensureVolumeAtomIds,
    getBuilderAnnotationsMap,
    normalizeVolumeAtom,
    resolveVolumeAtomId,
    getAtomBuilderMeta,
    setAtomBuilderMeta,
    migrateLegacyBuilderAnnotations,
    buildVolumeBondId,
    normalizeVolumeBondKind,
    normalizeVolumeBondRecord,
    ensureVolumeSchema,
    cloneBondSnapshot,
    bondSnapshotsEqual,
    findVolumeBondRecordIndex,
    upsertVolumeBond,
    removeVolumeBond,
    rehydrateClonedVolume,
  });
})();
