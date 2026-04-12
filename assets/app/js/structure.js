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
   * Parse one builder-style numeric suffix without regex allocation.
   * Returns 0 when the input does not match `${prefix}-<positive integer>`.
   * @param {*} raw
   * @param {'atom'|'group'|'op'} prefix
   * @returns {number}
   */
  function parseObservedBuilderIdSuffix(raw, prefix) {
    const value = String(raw || '').trim();
    const head = `${prefix}-`;
    if (!value.startsWith(head)) return 0;
    const suffix = value.slice(head.length);
    if (!suffix) return 0;
    let n = 0;
    for (let i = 0; i < suffix.length; i += 1) {
      const digit = suffix.charCodeAt(i) - 48;
      if (digit < 0 || digit > 9) return 0;
      n = (n * 10) + digit;
    }
    return n >= 1 ? n : 0;
  }

  /**
   * Ensure counters advance past an observed builder id suffix.
   * @param {*} raw
   * @param {'atom'|'group'|'op'} prefix
   */
  function absorbObservedBuilderId(raw, prefix) {
    const n = parseObservedBuilderIdSuffix(raw, prefix);
    if (n < 1) return;
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
   * Return the coordination-annotation map for one volume.
   * @param {*} vol
   * @param {boolean=} create
   * @returns {Record<string, {geometryId?:string}>|null}
   */
  function getCoordinationAnnotationsMap(vol, create = true) {
    if (!vol || typeof vol !== 'object') return null;
    if (!isPlainObject(vol.annotations)) {
      if (!create) return null;
      vol.annotations = {};
    }
    if (!isPlainObject(vol.annotations.coordination)) {
      if (!create) return null;
      vol.annotations.coordination = {};
    }
    if (!isPlainObject(vol.annotations.coordination.byAtomId)) {
      if (!create) return null;
      vol.annotations.coordination.byAtomId = {};
    }
    return vol.annotations.coordination.byAtomId;
  }

  /**
   * Return the metal-bonding annotation map for one volume.
   * @param {*} vol
   * @param {boolean=} create
   * @returns {Record<string, {mode?:string}>|null}
   */
  function getMetalBondingAnnotationsMap(vol, create = true) {
    if (!vol || typeof vol !== 'object') return null;
    if (!isPlainObject(vol.annotations)) {
      if (!create) return null;
      vol.annotations = {};
    }
    if (!isPlainObject(vol.annotations.metalBonding)) {
      if (!create) return null;
      vol.annotations.metalBonding = {};
    }
    if (!isPlainObject(vol.annotations.metalBonding.byAtomId)) {
      if (!create) return null;
      vol.annotations.metalBonding.byAtomId = {};
    }
    return vol.annotations.metalBonding.byAtomId;
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
   * Read one atom coordination override from annotations.
   * @param {*} vol
   * @param {*=} atomOrIndex
   * @returns {{geometryId:string}}
   */
  function getAtomCoordinationMeta(vol, atomOrIndex) {
    const atomId = resolveVolumeAtomId(vol, atomOrIndex);
    const map = getCoordinationAnnotationsMap(vol, false);
    const stored = (map && atomId && isPlainObject(map[atomId])) ? map[atomId] : null;
    const geometryId = String((stored && stored.geometryId) || '').trim();
    return { geometryId };
  }

  /**
   * Apply one atom coordination override via annotations.
   * @param {*} vol
   * @param {*=} atomOrIndex
   * @param {{geometryId?:string|null}=} meta
   */
  function setAtomCoordinationMeta(vol, atomOrIndex, meta = {}) {
    const atomId = resolveVolumeAtomId(vol, atomOrIndex);
    if (!atomId) return;
    const map = getCoordinationAnnotationsMap(vol, true);
    if (!map) return;
    const prev = getAtomCoordinationMeta(vol, atomOrIndex);
    const geometryId = meta.geometryId == null ? prev.geometryId : String(meta.geometryId || '').trim();
    if (!geometryId) {
      delete map[atomId];
      return;
    }
    map[atomId] = { geometryId };
  }

  function normalizeMetalBondingMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    if (mode === 'force_covalent') return 'force_covalent';
    if (mode === 'force_dative') return 'force_dative';
    if (mode === 'no_bonds') return 'no_bonds';
    return 'auto';
  }

  /**
   * Read one atom metal-bonding override from annotations.
   * @param {*} vol
   * @param {*=} atomOrIndex
   * @returns {{mode:string}}
   */
  function getAtomMetalBondingMeta(vol, atomOrIndex) {
    const atomId = resolveVolumeAtomId(vol, atomOrIndex);
    const map = getMetalBondingAnnotationsMap(vol, false);
    const stored = (map && atomId && isPlainObject(map[atomId])) ? map[atomId] : null;
    return {
      mode: normalizeMetalBondingMode(stored && stored.mode),
    };
  }

  /**
   * Apply one atom metal-bonding override via annotations.
   * @param {*} vol
   * @param {*=} atomOrIndex
   * @param {{mode?:string|null}=} meta
   */
  function setAtomMetalBondingMeta(vol, atomOrIndex, meta = {}) {
    const atomId = resolveVolumeAtomId(vol, atomOrIndex);
    if (!atomId) return;
    const map = getMetalBondingAnnotationsMap(vol, true);
    if (!map) return;
    const prev = getAtomMetalBondingMeta(vol, atomOrIndex);
    const mode = meta.mode == null ? prev.mode : normalizeMetalBondingMode(meta.mode);
    if (!mode || mode === 'auto') {
      delete map[atomId];
      return;
    }
    map[atomId] = { mode };
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
   * Prune atom-indexed annotation namespaces against live atom ids.
   * @param {*} vol
   */
  function pruneVolumeAtomAnnotations(vol, options = {}) {
    if (!vol || !Array.isArray(vol.atoms)) return;
    ensureVolumeAtomIds(vol);
    const liveIds = new Set(vol.atoms.map((atom) => String(ensureAtomId(atom))));
    const builderMap = getBuilderAnnotationsMap(vol, true);
    const coordinationMap = getCoordinationAnnotationsMap(vol, true);
    const metalBondingMap = getMetalBondingAnnotationsMap(vol, true);
    const isCoordinationMetaCompatible = typeof options.isCoordinationMetaCompatible === 'function'
      ? options.isCoordinationMetaCompatible
      : null;
    const isMetalBondingMetaCompatible = typeof options.isMetalBondingMetaCompatible === 'function'
      ? options.isMetalBondingMetaCompatible
      : null;
    for (const atomId of Object.keys(builderMap || {})) {
      if (!liveIds.has(atomId)) delete builderMap[atomId];
    }
    for (const atomId of Object.keys(coordinationMap || {})) {
      if (!liveIds.has(atomId)) {
        delete coordinationMap[atomId];
        continue;
      }
      if (isCoordinationMetaCompatible && !isCoordinationMetaCompatible(atomId, coordinationMap[atomId])) {
        delete coordinationMap[atomId];
      }
    }
    for (const atomId of Object.keys(metalBondingMap || {})) {
      if (!liveIds.has(atomId)) {
        delete metalBondingMap[atomId];
        continue;
      }
      if (isMetalBondingMetaCompatible && !isMetalBondingMetaCompatible(atomId, metalBondingMap[atomId])) {
        delete metalBondingMap[atomId];
      }
    }
  }

  /**
   * Deep-copy one volume annotations object for history/transport snapshots.
   * @param {*} vol
   * @returns {{builder:{byAtomId:object},coordination:{byAtomId:object},metalBonding:{byAtomId:object}}}
   */
  function cloneVolumeAnnotationsSnapshot(vol) {
    if (!vol || typeof vol !== 'object') {
      return {
        builder: { byAtomId: {} },
        coordination: { byAtomId: {} },
        metalBonding: { byAtomId: {} },
      };
    }
    getBuilderAnnotationsMap(vol, true);
    getCoordinationAnnotationsMap(vol, true);
    getMetalBondingAnnotationsMap(vol, true);
    pruneVolumeAtomAnnotations(vol);
    const snapshot = cloneJsonLike(vol.annotations) || {};
    if (!isPlainObject(snapshot.builder)) snapshot.builder = {};
    if (!isPlainObject(snapshot.builder.byAtomId)) snapshot.builder.byAtomId = {};
    if (!isPlainObject(snapshot.coordination)) snapshot.coordination = {};
    if (!isPlainObject(snapshot.coordination.byAtomId)) snapshot.coordination.byAtomId = {};
    if (!isPlainObject(snapshot.metalBonding)) snapshot.metalBonding = {};
    if (!isPlainObject(snapshot.metalBonding.byAtomId)) snapshot.metalBonding.byAtomId = {};
    return snapshot;
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
   * Build one reusable atom-id lookup context for bond normalization.
   * @param {*} vol
   * @returns {{atoms:Array<object>,atomIds:Set<string>,atomIndexById:Map<string, number>}}
   */
  function createVolumeBondNormalizationContext(vol) {
    const atoms = (vol && Array.isArray(vol.atoms)) ? vol.atoms : [];
    const atomIds = new Set();
    const atomIndexById = new Map();
    for (let i = 0; i < atoms.length; i += 1) {
      const atom = atoms[i];
      if (!atom) continue;
      const atomId = String(ensureAtomId(atom) || '').trim();
      if (!atomId) continue;
      atomIds.add(atomId);
      atomIndexById.set(atomId, i);
    }
    return { atoms, atomIds, atomIndexById };
  }

  /**
   * Normalize one stored bond kind.
   * @param {*} value
   * @returns {'normal'|'blocked'}
   */
  function normalizeVolumeBondKind(value) {
    return String(value || '').trim().toLowerCase() === 'blocked' ? 'blocked' : 'normal';
  }

  /**
   * Normalize one stored bond origin.
   * Missing origin defaults to explicit for backward compatibility.
   * @param {*} value
   * @returns {'perceived'|'explicit'}
   */
  function normalizeVolumeBondOrigin(value) {
    return String(value || '').trim().toLowerCase() === 'perceived' ? 'perceived' : 'explicit';
  }

  /**
   * Normalize one stored bond style.
   * @param {*} value
   * @returns {'covalent'|'metal-strong'|'metal-dative'|'metal-metal'}
   */
  function normalizeVolumeBondStyle(value) {
    const style = String(value || '').trim().toLowerCase();
    if (style === 'metal-strong') return 'metal-strong';
    if (style === 'metal-dative') return 'metal-dative';
    if (style === 'metal-metal') return 'metal-metal';
    return 'covalent';
  }

  /**
   * Normalize one persistent bond record to ID endpoints.
   * @param {*} vol
   * @param {*} raw
   * @returns {{id:string,a:string,b:string,order:number,kind:'normal'|'blocked',origin:'perceived'|'explicit',style:string}|null}
   */
  function normalizeVolumeBondRecord(vol, raw, context = null) {
    if (!vol || !Array.isArray(vol.atoms) || !raw || typeof raw !== 'object') return null;
    const atoms = vol.atoms;
    const resolvedContext = (context && context.atoms === atoms)
      ? context
      : createVolumeBondNormalizationContext(vol);
    const atomIds = resolvedContext.atomIds;
    const resolveEndpoint = (value) => {
      if (typeof value === 'string') {
        const atomId = String(value).trim();
        return atomIds.has(atomId) ? atomId : '';
      }
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
      origin: normalizeVolumeBondOrigin(raw.origin),
      style: normalizeVolumeBondStyle(raw.style),
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
    getCoordinationAnnotationsMap(vol, true);
    getMetalBondingAnnotationsMap(vol, true);
    pruneVolumeAtomAnnotations(vol, options.pruneAtomAnnotations || {});
    if (!Array.isArray(vol.fragmentOps)) vol.fragmentOps = [];
    if (typeof options.rehydrateBuilderState === 'function') {
      options.rehydrateBuilderState(vol);
    }
    if (Array.isArray(vol.bonds)) {
      const bondContext = createVolumeBondNormalizationContext(vol);
      vol.bonds = vol.bonds
        .map((bond) => normalizeVolumeBondRecord(vol, bond, bondContext))
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
   * @returns {Array<{id:string,a:string,b:string,order:number,kind:string,origin:string,style:string}>}
   */
  function cloneBondSnapshot(vol) {
    const working = {
      atoms: vol && Array.isArray(vol.atoms) ? vol.atoms : [],
      bonds: vol && Array.isArray(vol.bonds) ? vol.bonds : [],
    };
    const bondContext = createVolumeBondNormalizationContext(working);
    return working.bonds
      .map((bond) => normalizeVolumeBondRecord(working, bond, bondContext))
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
        origin: normalizeVolumeBondOrigin(bond.origin),
        style: normalizeVolumeBondStyle(bond.style),
      }));
  }

  /**
   * Compare two bond snapshots by value.
   * @param {Array<{id:string,a:string,b:string,order:number,kind:string,origin:string,style:string}>} a
   * @param {Array<{id:string,a:string,b:string,order:number,kind:string,origin:string,style:string}>} b
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
      if (normalizeVolumeBondOrigin(left.origin) !== normalizeVolumeBondOrigin(right.origin)) return false;
      if (normalizeVolumeBondStyle(left.style) !== normalizeVolumeBondStyle(right.style)) return false;
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
    const bondContext = createVolumeBondNormalizationContext(vol);
    for (let i = 0; i < vol.bonds.length; i++) {
      const bond = normalizeVolumeBondRecord(vol, vol.bonds[i], bondContext);
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
   * @param {*} [origin]
   * @returns {'created'|'updated'|'unchanged'|null}
   */
  function upsertVolumeBond(vol, atomIdA, atomIdB, order, kind = 'normal', origin, style) {
    if (!vol || !Array.isArray(vol.atoms)) return null;
    ensureVolumeSchema(vol, { inferMissingBonds: false });
    const a = String(atomIdA || '').trim();
    const b = String(atomIdB || '').trim();
    if (!a || !b || a === b) return null;
    const nextOrder = normalizeEditAddBondOrder(order || 1);
    const nextKind = normalizeVolumeBondKind(kind);
    const nextStyle = normalizeVolumeBondStyle(style);
    const index = findVolumeBondRecordIndex(vol, a, b);
    if (index >= 0) {
      const bondContext = createVolumeBondNormalizationContext(vol);
      const existing = normalizeVolumeBondRecord(vol, vol.bonds[index], bondContext);
      if (!existing) return null;
      const nextOrigin = origin == null ? existing.origin : normalizeVolumeBondOrigin(origin);
      const resolvedStyle = style == null ? existing.style : nextStyle;
      if (existing.order === nextOrder && existing.kind === nextKind && existing.origin === nextOrigin && existing.style === resolvedStyle) return 'unchanged';
      vol.bonds[index] = {
        id: existing.id,
        a: existing.a,
        b: existing.b,
        order: nextOrder,
        kind: nextKind,
        origin: nextOrigin,
        style: resolvedStyle,
      };
      return 'updated';
    }
    vol.bonds.push({
      id: buildVolumeBondId(a, b),
      a,
      b,
      order: nextOrder,
      kind: nextKind,
      origin: normalizeVolumeBondOrigin(origin),
      style: nextStyle,
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

  /**
   * Build one clipboard-friendly substructure payload from selected atoms.
   * Atom coordinates are copied as-is unless one mapper overrides them.
   * Bonds are remapped to local clipboard atom indices.
   * @param {*} vol
   * @param {Array<number>} atomIndices
   * @param {{mapAtom?:(atom:object, sourceAtom:object, sourceIndex:number, localIndex:number)=>object}=} options
   * @returns {{atoms:Array<{atom:object,builderMeta:object}>,bonds:Array<{a:number,b:number,order:number,kind:string,origin:string,style:string}>}|null}
   */
  function buildVolumeSelectionClipboard(vol, atomIndices, options = {}) {
    if (!vol || !Array.isArray(vol.atoms)) return null;
    ensureVolumeSchema(vol, { inferMissingBonds: false });
    const selection = Array.from(new Set((Array.isArray(atomIndices) ? atomIndices : [])
      .map((idx) => Number(idx) | 0)
      .filter((idx) => idx >= 0 && idx < vol.atoms.length)))
      .sort((a, b) => a - b);
    if (!selection.length) return null;
    const mapAtom = typeof options.mapAtom === 'function' ? options.mapAtom : null;
    const atomIdToLocalIndex = new Map();
    const atoms = selection.map((sourceIndex, localIndex) => {
      const sourceAtom = vol.atoms[sourceIndex];
      const sourceAtomId = ensureAtomId(sourceAtom);
      atomIdToLocalIndex.set(sourceAtomId, localIndex);
      let atom = normalizeVolumeAtom(sourceAtom);
      if (mapAtom) {
        const mapped = mapAtom(Object.assign({}, atom), sourceAtom, sourceIndex, localIndex);
        if (mapped && typeof mapped === 'object') atom = normalizeVolumeAtom(mapped);
      }
      return {
        atom,
        builderMeta: getAtomBuilderMeta(vol, sourceAtom),
        coordinationMeta: getAtomCoordinationMeta(vol, sourceAtom),
        metalBondingMeta: getAtomMetalBondingMeta(vol, sourceAtom),
      };
    });
    const bonds = cloneBondSnapshot(vol)
      .map((bond) => {
        const localA = atomIdToLocalIndex.get(String(bond.a || ''));
        const localB = atomIdToLocalIndex.get(String(bond.b || ''));
        if (!Number.isInteger(localA) || !Number.isInteger(localB) || localA === localB) return null;
        return {
          a: localA,
          b: localB,
          order: normalizeEditAddBondOrder(bond.order || 1),
          kind: normalizeVolumeBondKind(bond.kind),
          origin: normalizeVolumeBondOrigin(bond.origin),
          style: normalizeVolumeBondStyle(bond.style),
        };
      })
      .filter(Boolean);
    return { atoms, bonds };
  }

  /**
   * Append one clipboard substructure payload into a volume using fresh atom ids.
   * Builder group ids are remapped so pasted groups remain distinct from the source.
   * @param {*} vol
   * @param {{atoms?:Array<{atom:object,builderMeta?:object}>,bonds?:Array<{a:number,b:number,order:number,kind:string,origin?:string,style?:string}>}} payload
   * @param {{mapAtom?:(atom:object, entry:object, localIndex:number)=>object}=} options
   * @returns {{atomIndices:Array<number>,atomIds:Array<string>,bondCount:number}}
   */
  function appendVolumeSelectionClipboard(vol, payload, options = {}) {
    ensureVolumeSchema(vol, { inferMissingBonds: false });
    const entries = Array.isArray(payload && payload.atoms) ? payload.atoms : [];
    if (!entries.length) return { atomIndices: [], atomIds: [], bondCount: 0 };
    const mapAtom = typeof options.mapAtom === 'function' ? options.mapAtom : null;
    const groupIdRemap = new Map();
    const atomIndices = [];
    const atomIds = [];
    for (let localIndex = 0; localIndex < entries.length; localIndex += 1) {
      const entry = entries[localIndex] || {};
      const rawAtom = Object.assign({}, entry.atom || {});
      delete rawAtom.id;
      let atom = normalizeVolumeAtom(rawAtom);
      if (mapAtom) {
        const mapped = mapAtom(Object.assign({}, atom), entry, localIndex);
        if (mapped && typeof mapped === 'object') atom = normalizeVolumeAtom(mapped);
      }
      vol.atoms.push(atom);
      vol.natoms = vol.atoms.length;
      atomIndices.push(vol.atoms.length - 1);
      atomIds.push(ensureAtomId(atom));
      const meta = entry.builderMeta && typeof entry.builderMeta === 'object' ? entry.builderMeta : {};
      const coordinationMeta = entry.coordinationMeta && typeof entry.coordinationMeta === 'object' ? entry.coordinationMeta : {};
      const sourceGroupId = String(meta.groupId || '').trim();
      let groupId = '';
      if (sourceGroupId) {
        groupId = groupIdRemap.get(sourceGroupId) || '';
        if (!groupId) {
          groupId = allocateBuilderGroupId();
          groupIdRemap.set(sourceGroupId, groupId);
        }
      }
      setAtomBuilderMeta(vol, atom, {
        groupId,
        entryId: String(meta.entryId || '').trim().toLowerCase(),
        entryKind: String(meta.entryKind || '').trim().toLowerCase(),
      });
      setAtomCoordinationMeta(vol, atom, {
        geometryId: String(coordinationMeta.geometryId || '').trim(),
      });
      setAtomMetalBondingMeta(vol, atom, {
        mode: String((entry.metalBondingMeta && entry.metalBondingMeta.mode) || '').trim(),
      });
    }
    let bondCount = 0;
    const bonds = Array.isArray(payload && payload.bonds) ? payload.bonds : [];
    for (const rawBond of bonds) {
      if (!rawBond || typeof rawBond !== 'object') continue;
      const localA = Number(rawBond.a) | 0;
      const localB = Number(rawBond.b) | 0;
      if (localA < 0 || localB < 0 || localA >= atomIds.length || localB >= atomIds.length || localA === localB) continue;
      const result = upsertVolumeBond(
        vol,
        atomIds[localA],
        atomIds[localB],
        rawBond.order || 1,
        rawBond.kind || 'normal',
        rawBond.origin,
        rawBond.style
      );
      if (result === 'created' || result === 'updated') bondCount += 1;
    }
    return { atomIndices, atomIds, bondCount };
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
    getCoordinationAnnotationsMap,
    getMetalBondingAnnotationsMap,
    normalizeVolumeAtom,
    resolveVolumeAtomId,
    getAtomBuilderMeta,
    setAtomBuilderMeta,
    getAtomCoordinationMeta,
    setAtomCoordinationMeta,
    normalizeMetalBondingMode,
    getAtomMetalBondingMeta,
    setAtomMetalBondingMeta,
    migrateLegacyBuilderAnnotations,
    pruneVolumeAtomAnnotations,
    cloneVolumeAnnotationsSnapshot,
    buildVolumeBondId,
    createVolumeBondNormalizationContext,
    normalizeVolumeBondKind,
    normalizeVolumeBondOrigin,
    normalizeVolumeBondStyle,
    normalizeVolumeBondRecord,
    ensureVolumeSchema,
    cloneBondSnapshot,
    bondSnapshotsEqual,
    findVolumeBondRecordIndex,
    upsertVolumeBond,
    removeVolumeBond,
    rehydrateClonedVolume,
    buildVolumeSelectionClipboard,
    appendVolumeSelectionClipboard,
  });
})();
