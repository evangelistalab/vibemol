(function (global) {
  'use strict';

  const KIND = 'vibemol.session';
  const VERSION = 1;
  const MAX_BYTES = 256 * 1024 * 1024;
  const TYPES = { Float32Array, Float64Array, Int32Array, Uint32Array, Uint8Array };
  const LAYER_KINDS = new Set(['molecule', 'orbitals_group', 'cube', 'arithmetic', 'measurements_group', 'measurement']);
  const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));

  function requireValue(condition, message) {
    if (!condition) throw new Error(`Invalid session: ${message}`);
  }

  function object(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value) && !ArrayBuffer.isView(value);
  }

  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function integer(value, min = 0) { return Number.isSafeInteger(value) && value >= min; }
  function vector(value, size = 3) { return Array.isArray(value) && value.length === size && value.every(finite); }
  function id(value) { return typeof value === 'string' && value.length > 0 && value.length <= 200; }

  function uniqueMap(items, label) {
    requireValue(Array.isArray(items), `${label} must be an array.`);
    const map = new Map();
    for (const item of items) {
      requireValue(object(item) && id(item.id) && !map.has(item.id), `${label} contains a missing or duplicate ID.`);
      map.set(item.id, item);
    }
    return map;
  }

  function validateVolume(vol, label) {
    requireValue(object(vol) && Array.isArray(vol.atoms), `${label}: missing molecular data.`);
    requireValue(vol.units === 'angstrom' || vol.units === 'bohr' || vol.units == null, `${label}: unsupported units.`);
    const atoms = uniqueMap(vol.atoms, `${label} atoms`);
    for (const atom of vol.atoms) {
      requireValue(integer(atom.Z, 1) && atom.Z <= 118 && [atom.x, atom.y, atom.z].every(finite), `${label}: invalid atom.`);
    }
    requireValue(Array.isArray(vol.bonds), `${label}: missing bonds.`);
    const bonds = uniqueMap(vol.bonds, `${label} bonds`);
    for (const bond of bonds.values()) {
      requireValue(atoms.has(bond.a) && atoms.has(bond.b) && bond.a !== bond.b, `${label}: bond references a missing atom.`);
      requireValue(integer(bond.order, 0) && bond.order <= 4, `${label}: invalid bond order.`);
      requireValue(['normal', 'blocked'].includes(bond.kind), `${label}: invalid bond kind.`);
      requireValue(['explicit', 'perceived'].includes(bond.origin), `${label}: invalid bond origin.`);
      requireValue(['covalent', 'metal-strong', 'metal-dative', 'metal-metal'].includes(bond.style), `${label}: invalid bond style.`);
    }
    requireValue(vector(vol.origin) && Array.isArray(vol.axes) && vol.axes.length === 3 && vol.axes.every(axis => vector(axis)), `${label}: invalid grid geometry.`);
    requireValue(Array.isArray(vol.nxyz) && vol.nxyz.length === 3 && vol.nxyz.every(n => integer(n)), `${label}: invalid grid dimensions.`);
    const count = vol.nxyz.reduce((a, b) => a * b, 1);
    requireValue(integer(count) && count <= MAX_BYTES / 4, `${label}: grid exceeds the session limit.`);
    const numericArray = (value, length, name) => {
      requireValue(ArrayBuffer.isView(value) && value.length === length, `${label}: ${name} has the wrong length.`);
    };
    numericArray(vol.data, count, 'scalar data');
    if (count) requireValue(vol.axes.every(axis => Math.hypot(...axis) > 0), `${label}: grid has a zero step.`);
    if (vol.isTwoComponent) for (const key of ['alphaRe', 'alphaIm', 'betaRe', 'betaIm']) numericArray(vol[key], count, key);
    const coordinates = vol.atoms.length * 3;
    if (vol.trajectory) {
      const traj = vol.trajectory;
      requireValue(Array.isArray(traj.frames) && traj.frames.length > 0, `${label}: missing trajectory frames.`);
      traj.frames.forEach(frame => numericArray(frame, coordinates, 'trajectory frame'));
      requireValue(integer(traj.frameIndex) && traj.frameIndex < traj.frames.length, `${label}: invalid trajectory frame.`);
      requireValue(finite(traj.fps) && traj.fps >= 1 && traj.fps <= 120, `${label}: invalid trajectory FPS.`);
    }
    if (vol.vibration) {
      const vib = vol.vibration;
      requireValue(Array.isArray(vib.modes) && vib.modes.length > 0, `${label}: missing vibrational modes.`);
      numericArray(vib.equilibrium, coordinates, 'vibrational equilibrium');
      for (const mode of vib.modes) {
        requireValue(object(mode) && finite(mode.frequencyCm1), `${label}: invalid vibration frequency.`);
        numericArray(mode.displacements, coordinates, 'vibrational displacement');
      }
      requireValue(integer(vib.modeIndex) && vib.modeIndex < vib.modes.length, `${label}: invalid vibration mode.`);
      requireValue(finite(vib.phase) && finite(vib.amplitude) && vib.amplitude >= 0 && vib.amplitude <= 8
        && finite(vib.speed) && vib.speed >= 0.1 && vib.speed <= 30, `${label}: invalid vibration controls.`);
    }
    if (vol.kind === 'molden') {
      const mo = vol.molden;
      requireValue(object(mo) && Array.isArray(mo.mos) && object(mo.basis) && Array.isArray(mo.basis.atomBlocks), `${label}: missing Molden basis or orbitals.`);
      requireValue(integer(mo.basisCount) && count === 0, `${label}: invalid Molden metadata.`);
      mo.mos.forEach(orbital => numericArray(orbital.coefficients, mo.basisCount, 'MO coefficients'));
      for (const block of mo.basis.atomBlocks) {
        requireValue(integer(block.atomIndex) && block.atomIndex < vol.atoms.length && Array.isArray(block.shells), `${label}: invalid basis atom.`);
        for (const shell of block.shells) {
          requireValue(['s', 'p', 'sp', 'd', 'f', 'g', 'h', 'i'].includes(shell.label) && Array.isArray(shell.primitives) && shell.primitives.length > 0, `${label}: invalid basis shell.`);
          for (const primitive of shell.primitives) {
            requireValue(finite(primitive.exponent) && primitive.exponent > 0 && Array.isArray(primitive.coefficients)
              && primitive.coefficients.length === (shell.label === 'sp' ? 2 : 1) && primitive.coefficients.every(finite), `${label}: invalid basis primitive.`);
          }
        }
      }
    }
    return vol;
  }

  // Validate all references and payload shapes before any live workspace is changed.
  function validate(session) {
    requireValue(object(session) && session.kind === KIND, 'unexpected file kind.');
    requireValue(session.sessionVersion === VERSION, `unsupported version ${session.sessionVersion}; expected ${VERSION}.`);
    const sources = uniqueMap(session.sources, 'sources');
    sources.forEach(source => {
      requireValue(typeof source.name === 'string' && id(source.sceneKey) && object(source.recordState), 'invalid source metadata.');
      validateVolume(source.volume, source.name || source.id);
      if (source.volume.kind === 'molden') {
        const s = source.recordState;
        requireValue(integer(s.moldenMoIndex, -1) && s.moldenMoIndex < source.volume.molden.mos.length, 'invalid selected MO.');
        requireValue(finite(s.moldenGridStepAng) && s.moldenGridStepAng >= 0.12 && s.moldenGridStepAng <= 1.2
          && finite(s.moldenGridPaddingAng) && s.moldenGridPaddingAng >= 0.5 && s.moldenGridPaddingAng <= 8, 'invalid Molden grid settings.');
      }
    });
    requireValue(object(session.graph), 'missing scene graph.');
    const graph = session.graph;
    const scenes = uniqueMap(graph.scenes, 'scenes');
    requireValue(Array.isArray(session.records) && new Set(session.records).size === session.records.length
      && session.records.every(key => sources.has(key)), 'invalid source order.');
    requireValue(session.activeSourceId == null || session.records.includes(session.activeSourceId), 'invalid active source.');
    const allLayers = [];
    const sceneKeys = new Set();
    for (const scene of scenes.values()) {
      requireValue(id(scene.sceneKey) && !sceneKeys.has(scene.sceneKey), 'duplicate or missing scene key.');
      sceneKeys.add(scene.sceneKey);
      requireValue(sources.has(scene.moleculeSourceId), `${scene.name}: missing molecule source.`);
      requireValue(Array.isArray(scene.layers), 'missing layers.');
      allLayers.push(...scene.layers);
    }
    const layers = uniqueMap(allLayers, 'layers');
    for (const source of sources.values()) requireValue(sceneKeys.has(source.sceneKey), 'source belongs to a missing scene.');
    for (const scene of scenes.values()) {
      const local = new Map(scene.layers.map(layer => [layer.id, layer]));
      requireValue(typeof scene.name === 'string' && typeof scene.visible === 'boolean' && typeof scene.expanded === 'boolean', 'invalid scene presentation.');
      requireValue(session.records.some(key => sources.get(key).sceneKey === scene.sceneKey), 'scene has no registered source.');
      for (const [key, kind] of [['moleculeLayerId', 'molecule'], ['orbitalsGroupId', 'orbitals_group'], ['measurementsGroupId', 'measurements_group']]) {
        requireValue(scene[key] == null || (local.has(scene[key]) && local.get(scene[key]).kind === kind), `invalid ${key}.`);
      }
      requireValue(scene.activeLayerId == null || local.has(scene.activeLayerId), 'invalid scene selection.');
      for (const layer of scene.layers) {
        requireValue(!scenes.has(layer.id) && LAYER_KINDS.has(layer.kind) && layer.sceneId === scene.id, 'invalid layer kind or membership.');
        requireValue(typeof layer.name === 'string' && typeof layer.visible === 'boolean' && typeof layer.expanded === 'boolean', 'invalid layer presentation.');
        requireValue(layer.parentId == null || (local.has(layer.parentId) && ['orbitals_group', 'measurements_group'].includes(local.get(layer.parentId).kind)), 'invalid layer parent.');
        requireValue(!['orbitals_group', 'measurements_group', 'molecule'].includes(layer.kind) || layer.parentId == null, 'invalid group nesting.');
        requireValue(layer.sourceId == null || sources.has(layer.sourceId), 'missing layer source.');
        if (layer.kind === 'molecule') requireValue(sources.has(layer.sourceId) && layer.sourceId === scene.moleculeSourceId, 'missing or mismatched molecule data.');
        if (layer.kind === 'cube') {
          const source = sources.get(layer.sourceId);
          requireValue(!!source || !!layer.volume, 'missing cube data.');
          if (source && source.volume.kind === 'molden') {
            requireValue(integer(layer.moldenMoIndex) && layer.moldenMoIndex < source.volume.molden.mos.length, 'invalid orbital reference.');
          } else requireValue((layer.volume || source.volume).data.length > 0, 'missing scalar grid.');
        }
        if (layer.volume) validateVolume(layer.volume, layer.name || layer.id);
        if (layer.kind === 'cube' || layer.kind === 'arithmetic') {
          requireValue(finite(layer.iso) && layer.iso >= 0 && finite(layer.opacity) && layer.opacity >= 0.05 && layer.opacity <= 1, 'invalid surface appearance.');
          requireValue(layer.isoPending == null || typeof layer.isoPending === 'boolean', 'invalid pending iso state.');
        }
        if (layer.kind === 'arithmetic') {
          requireValue(['linear_combination', 'product', 'abs'].includes(layer.operation), 'unsupported arithmetic operation.');
          requireValue(Array.isArray(layer.inputs) && layer.inputs.length > 0
            && (layer.operation !== 'abs' || layer.inputs.length === 1), 'invalid arithmetic inputs.');
          requireValue(layer.cubeDataValid === false || (layer.volume && layer.volume.data.length > 0), 'missing arithmetic result.');
          for (const input of layer.inputs) {
            requireValue(object(input) && finite(input.coefficient) && local.has(input.layerId)
              && ['cube', 'arithmetic'].includes(local.get(input.layerId).kind), 'missing arithmetic dependency.');
          }
        }
      }
    }
    const visited = new Set();
    const visiting = new Set();
    function visit(layer) {
      requireValue(!visiting.has(layer.id), 'circular arithmetic dependency.');
      if (visited.has(layer.id)) return;
      visiting.add(layer.id);
      if (layer.kind === 'arithmetic') layer.inputs.forEach(input => visit(layers.get(input.layerId)));
      visiting.delete(layer.id);
      visited.add(layer.id);
    }
    layers.forEach(visit);
    requireValue([graph.activeSceneId, graph.focusedSceneId].every(key => key == null || scenes.has(key)), 'invalid scene focus.');
    requireValue(graph.activeLayerId == null || layers.has(graph.activeLayerId), 'invalid active layer.');
    requireValue(Array.isArray(graph.selectedLayerIds) && new Set(graph.selectedLayerIds).size === graph.selectedLayerIds.length
      && graph.selectedLayerIds.every(key => layers.has(key) && layers.get(key).sceneId === graph.focusedSceneId
        && ['cube', 'arithmetic'].includes(layers.get(key).kind)), 'invalid layer selection.');
    requireValue(object(graph.syncMaster) && integer(graph.syncMaster.frame) && finite(graph.syncMaster.fps)
      && graph.syncMaster.fps >= 1 && graph.syncMaster.fps <= 120, 'invalid synchronized playback controls.');
    const view = session.view;
    requireValue(object(view) && ['perspective', 'orthographic'].includes(view.projection)
      && ['position', 'up', 'target', 'contentPosition'].every(key => vector(view[key]))
      && vector(view.quaternion, 4) && finite(view.zoom) && view.zoom > 0
      && finite(view.fov) && view.fov > 0 && view.fov < 180, 'invalid camera state.');
    requireValue(object(session.preset) && session.preset.kind === 'vibemol.preset' && session.preset.presetVersion === 1
      && object(session.preset.settings), 'invalid appearance preset.');
    return session;
  }

  function hashBytes(bytes) {
    let hash = 2166136261;
    for (let i = 0; i < bytes.length; i++) hash = Math.imul(hash ^ bytes[i], 16777619);
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  // Snapshot metadata and copy each distinct numeric buffer before the first yield.
  // No renderer objects or cache fields are accepted by the session capture layer.
  async function encode(snapshot, options = {}) {
    const maxBytes = Math.min(MAX_BYTES, options.maxBytes || MAX_BYTES);
    const seen = new Map();
    const pending = [];
    let bytes = 0;
    function pack(value, depth = 0) {
      requireValue(depth < 100, 'metadata is nested too deeply.');
      if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      if (ArrayBuffer.isView(value)) {
        if (seen.has(value)) return { $array: seen.get(value) };
        const type = value.constructor.name;
        requireValue(Object.hasOwn(TYPES, type), 'unsupported numeric buffer.');
        bytes += value.byteLength;
        requireValue(bytes <= maxBytes, `numeric data exceeds ${Math.floor(maxBytes / 1024 / 1024)} MiB.`);
        const key = `buffer-${pending.length + 1}`;
        seen.set(value, key);
        const copy = new TYPES[type](value);
        requireValue(copy.every(finite), 'numeric data contains a non-finite value.');
        pending.push({ id: key, type, length: copy.length, bytes: new Uint8Array(copy.buffer) });
        return { $array: key };
      }
      if (Array.isArray(value)) return value.map(item => pack(item, depth + 1));
      requireValue(object(value), 'unsupported metadata value.');
      const out = {};
      for (const [key, child] of Object.entries(value)) {
        requireValue(!FORBIDDEN_KEYS.has(key), 'unsupported metadata key.');
        if (child !== undefined) out[key] = pack(child, depth + 1);
      }
      return out;
    }
    const envelope = pack(snapshot);
    envelope.buffers = [];
    for (const buffer of pending) {
      if (!littleEndian) {
        const size = TYPES[buffer.type].BYTES_PER_ELEMENT;
        for (let i = 0; i < buffer.bytes.length; i += size) buffer.bytes.subarray(i, i + size).reverse();
      }
      const parts = [];
      // A multiple of three keeps independently encoded chunks concatenable.
      const chunkSize = 3 * 16384;
      for (let i = 0; i < buffer.bytes.length; i += chunkSize) {
        parts.push(global.btoa(String.fromCharCode(...buffer.bytes.subarray(i, i + chunkSize))));
        if (i % (chunkSize * 16) === 0) await yieldTask();
      }
      envelope.buffers.push({ id: buffer.id, type: buffer.type, length: buffer.length,
        checksum: hashBytes(buffer.bytes), data: parts.join('') });
    }
    const text = JSON.stringify(envelope);
    requireValue(text.length <= maxBytes * 2, 'encoded file exceeds the session size limit.');
    return text;
  }

  async function decode(text, options = {}) {
    const maxBytes = Math.min(MAX_BYTES, options.maxBytes || MAX_BYTES);
    requireValue(typeof text === 'string' && text.length <= maxBytes * 2, 'file exceeds the session size limit.');
    let envelope;
    try { envelope = JSON.parse(text); } catch { throw new Error('Invalid session: the file is not valid JSON.'); }
    requireValue(object(envelope) && envelope.kind === KIND, 'unexpected file kind.');
    requireValue(envelope.sessionVersion === VERSION, `unsupported version ${envelope.sessionVersion}; expected ${VERSION}.`);
    const buffers = uniqueMap(envelope.buffers, 'buffers');
    const decoded = new Map();
    let bytes = 0;
    for (const buffer of buffers.values()) {
      requireValue(Object.hasOwn(TYPES, buffer.type) && integer(buffer.length), 'invalid numeric buffer.');
      const size = TYPES[buffer.type].BYTES_PER_ELEMENT;
      const byteLength = buffer.length * size;
      bytes += byteLength;
      requireValue(integer(byteLength) && bytes <= maxBytes, 'numeric data exceeds the session size limit.');
      requireValue(typeof buffer.data === 'string' && buffer.data.length === Math.ceil(byteLength / 3) * 4
        && !/[^A-Za-z0-9+/=]/.test(buffer.data), 'invalid buffer encoding.');
      const raw = new Uint8Array(byteLength);
      let offset = 0;
      for (let i = 0; i < buffer.data.length; i += 65536) {
        const chunk = global.atob(buffer.data.slice(i, i + 65536));
        for (let j = 0; j < chunk.length; j++) raw[offset++] = chunk.charCodeAt(j);
        if (i % (65536 * 16) === 0) await yieldTask();
      }
      requireValue(hashBytes(raw) === buffer.checksum, `damaged buffer ${buffer.id}.`);
      if (!littleEndian) for (let i = 0; i < raw.length; i += size) raw.subarray(i, i + size).reverse();
      const array = new TYPES[buffer.type](raw.buffer);
      requireValue(array.every(finite), 'numeric data contains a non-finite value.');
      decoded.set(buffer.id, array);
    }
    delete envelope.buffers;
    function unpack(value, depth = 0) {
      requireValue(depth < 100, 'metadata is nested too deeply.');
      if (Array.isArray(value)) return value.map(item => unpack(item, depth + 1));
      if (!object(value)) return value;
      if (Object.hasOwn(value, '$array')) {
        requireValue(Object.keys(value).length === 1 && decoded.has(value.$array), 'missing numeric buffer.');
        return decoded.get(value.$array);
      }
      const out = {};
      for (const [key, child] of Object.entries(value)) {
        requireValue(!FORBIDDEN_KEYS.has(key), 'unsupported metadata key.');
        out[key] = unpack(child, depth + 1);
      }
      return out;
    }
    return validate(unpack(envelope));
  }

  global.VibeMolSessionFormat = Object.freeze({ KIND, VERSION, MAX_BYTES, encode, decode, validate, validateVolume });
})(typeof window !== 'undefined' ? window : globalThis);
