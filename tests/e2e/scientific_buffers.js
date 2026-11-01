(() => {
  'use strict';

  const arrays = [],
    byArray = new WeakMap(),
    volumes = [],
    seenVolumes = new WeakSet(),
    calls = {},
    workerMessages = [],
    controllers = {};
  const nativeIsView = ArrayBuffer.isView,
    proxyTargets = new WeakMap(),
    guardedViews = new WeakMap(),
    violations = [],
    bufferAccesses = [];
  const numericView = value => nativeIsView(value) || (!!value && /^(?:\[object (?:Float(?:32|64)|(?:Uint|Int)(?:8|16|32)|Uint8Clamped)Array\])$/.test(Object.prototype.toString.call(value)) && Number.isInteger(value.BYTES_PER_ELEMENT));
  const originalError = console.error;
  console.error = function (...args) {
    if (String(args[0]).startsWith('[scientific-buffer-write]')) violations.push({label:'private-owner',operation:String(args[0])});
    return Reflect.apply(originalError,this,args);
  };
  let guardedCalls = 0;
  const mutationMethods = new Set(['set', 'fill', 'sort', 'reverse', 'copyWithin']);
  function readonly(array, label) {
    if (!numericView(array) || array instanceof DataView) return array;
    if (guardedViews.has(array)) return guardedViews.get(array);
    const fail = operation => {
      const row = {
        label,
        operation,
        stack: new Error().stack
      };
      violations.push(row);
      throw new Error('Scientific borrowed-buffer write: ' + label + ' ' + operation);
    };
    const view = new Proxy(array, {
      set(_t, key) {
        return fail('index/property ' + String(key));
      },
      defineProperty(_t, key) {
        return fail('defineProperty ' + String(key));
      },
      deleteProperty(_t, key) {
        return fail('delete ' + String(key));
      },
      get(target, key) {
        if (key === 'buffer') {
          if (nativeIsView(target)) bufferAccesses.push({label,bytes:target.byteLength});
          return target.buffer;
        }
        if (key === 'valueOf') return () => view;
        if (key === 'constructor') return target.constructor;
        if (mutationMethods.has(key)) return () => fail(String(key));
        if (key === 'subarray') return (...args) => nativeIsView(target)
          ? readonly(target.subarray(...args), label + '.subarray') : target.subarray(...args);
        const value = Reflect.get(target, key, target);
        if (['forEach', 'map', 'filter', 'every', 'some', 'find', 'findIndex', 'findLast', 'findLastIndex'].includes(key)) return (fn, receiver) => target[key]((v, i) => fn.call(receiver, v, i, view));
        if (['reduce', 'reduceRight'].includes(key)) return (fn, ...initial) => target[key]((acc, v, i) => fn(acc, v, i, view), ...initial);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
    guardedViews.set(array, view);
    proxyTargets.set(view, array);
    return view;
  }
  function guarded(value, label, seen = new WeakMap()) {
    if (!value || typeof value !== 'object') return value;
    if (proxyTargets.has(value)) return value;
    if (numericView(value)) return readonly(value, label);
    if (seen.has(value)) return seen.get(value);
    if (Array.isArray(value)) {
      const result = [];
      seen.set(value, result);
      value.forEach((v, i) => result.push(guarded(v, label + '[' + i + ']', seen)));
      return result;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    const copy = {};
    seen.set(value, copy);
    for (const [key, next] of Object.entries(value)) copy[key] = guarded(next, label + '.' + key, seen);
    return copy;
  }
  function borrowed(name, fn, receiver, args) {
    guardedCalls++;
    const previous = ArrayBuffer.isView;
    ArrayBuffer.isView = x => proxyTargets.has(x) || nativeIsView(x);
    const seen = new WeakMap();
    try {
      return Reflect.apply(fn, receiver, args.map((x, i) => guarded(x, name + ':' + i, seen)));
    } finally {
      ArrayBuffer.isView = previous;
    }
  }
  const backingBuffers = new WeakMap();
  let nextBackingId = 1;
  function bytesOf(value) {
    return Array.isArray(value) ? new Uint8Array(Float64Array.from(value).buffer) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  const sourceFields = ['data', 'alphaRe', 'alphaIm', 'betaRe', 'betaIm'];
  function track(value, label, kind = 'source') {
    if (proxyTargets.has(value)) value = proxyTargets.get(value);
    if (!(numericView(value) && !(value instanceof DataView)) && !(Array.isArray(value) && value.every(x => typeof x === 'number'))) return;
    let item = byArray.get(value);
    if (!item) {
      item = {
        id: arrays.length + 1,
        value,
        baseline: bytesOf(value).slice(),
        labels: new Set(),
        kinds: new Set(),
        type: Array.isArray(value) ? 'Array<number>' : value.constructor.name
      };
      if (!Array.isArray(value)) {
        if (!backingBuffers.has(value.buffer)) backingBuffers.set(value.buffer, nextBackingId++);
        item.backingId = backingBuffers.get(value.buffer);
        item.byteOffset = value.byteOffset;
      }
      ;
      byArray.set(value, item);
      arrays.push(item);
    }
    item.labels.add(label);
    item.kinds.add(kind);
    return item.id;
  }
  function volume(vol, label) {
    if (!vol || typeof vol !== 'object') return;
    if (!seenVolumes.has(vol)) {
      seenVolumes.add(vol);
      volumes.push({
        vol,
        label
      });
    }
    for (const key of sourceFields) track(vol[key], label + '.' + key);
    vol.trajectory?.frames?.forEach((a, i) => track(a, label + '.trajectory.frames[' + i + ']'));
    if (vol.vibration) {
      track(vol.vibration.equilibrium, label + '.vibration.equilibrium');
      track(vol.vibration.frameBuffer, label + '.vibration.frameBuffer', 'derived');
      vol.vibration.modes?.forEach((m, i) => track(m.displacements, label + '.vibration.modes[' + i + '].displacements'));
    }
    vol.molden?.mos?.forEach((m, i) => track(m.coefficients, label + '.molden.mos[' + i + '].coefficients'));
    vol.molden?.basis?.atomBlocks?.forEach((b, i) => b.shells?.forEach((s, j) => s.primitives?.forEach((p, k) => track(p.coefficients, label + '.molden.basis[' + i + '].shells[' + j + '].primitives[' + k + '].coefficients'))));
  }
  function observe(value, label, depth = 0, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 5) return;
    seen.add(value);
    if (numericView(value)) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => observe(v, label + '[' + i + ']', depth + 1, seen));
      return;
    }
    if (Array.isArray(value.atoms) || value.data && value.nxyz) volume(value, label);
    // Traverse only carriers, never renderer/DOM/atom meshes or arbitrary getters.
    for (const key of ['vol', 'record', 'volume', 'cubeData', 'records', 'sources', 'scenes', 'layers', 'moleculeRecord']) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && 'value' in descriptor) observe(descriptor.value, label + '.' + key, depth + 1, seen);
    }
  }
  function call(name, fn, receiver, args) {
    calls[name] = (calls[name] || 0) + 1;
    args.forEach((arg, i) => observe(arg, name + ':arg' + i));
    let result;
    if (/^(VibeMolVolumeGeometry|VibeMolVolume2C|VibeMolRendering|VibeMolCloudRendering|VibeMolArithmeticGrid)\./.test(name) || /^SessionFormat\.(validate|encode)$/.test(name) || /^VibeMolAutoIso\.(estimateAutoIsoValue|estimateAutoIsoValueAsync|buildAutoIsoWorkerPayload|forEachAutoIsoSample)$/.test(name)) result = borrowed(name, fn, receiver, args);else if (name.endsWith('.deps.applyAtomCoordinateFrame')) {
      guardedCalls++;
      const input = args.slice();
      input[1] = readonly(args[1], name + ':frame');
      result = Reflect.apply(fn, receiver, input);
    } else result = Reflect.apply(fn, receiver, args);
    if (result?.then) return result.then(value => {
      observe(value, name + ':return');
      return value;
    });
    observe(result, name + ':return');
    return result;
  }
  function methods(object, prefix) {
    if (!object || typeof object !== 'object') return object;
    const copy = {
      ...object
    };
    for (const [name, fn] of Object.entries(object)) if (typeof fn === 'function') copy[name] = function (...args) {
      return call(prefix + '.' + name, fn, object, args);
    };
    return Object.isFrozen(object) ? Object.freeze(copy) : copy;
  }
  function hook(name, decorate) {
    let value;
    Object.defineProperty(window, name, {
      configurable: true,
      enumerable: true,
      get: () => value,
      set: original => {
        value = decorate(original);
      }
    });
  }
  hook('VibeMolParsers', module => {
    const copy = {
      ...module
    };
    for (const [name, fn] of Object.entries(module)) if (/^parse/.test(name)) copy[name] = function (...args) {
      const result = fn(...args);
      calls['parser.' + name] = (calls['parser.' + name] || 0) + 1;
      volume(result, 'parser.' + name);
      return result;
    };
    return copy;
  });
  hook('VibeMolGridStore', module => ({
    ...module,
    createGridStore(...args) {
      const store = module.createGridStore(...args);
      return Object.freeze({
        ...store,
        get(...input) {
          const grid = store.get(...input);
          calls['gridStore.get'] = (calls['gridStore.get'] || 0) + 1;
          volume(grid, 'gridStore.get');
          return grid;
        }
      });
    }
  }));
  for (const [moduleName, factory] of [['VibeMolTrajectoryPlayback', 'createTrajectoryPlaybackController'], ['VibeMolVibration', 'createVibrationController'], ['VibeMolAutoIso', 'createAutoIsoController']]) hook(moduleName, module => {
    const copy = {
      ...module
    };
    copy[factory] = function (deps) {
      const observed = {
        ...deps
      };
      for (const [key, fn] of Object.entries(deps)) if (typeof fn === 'function') observed[key] = function (...args) {
        return call(moduleName + '.deps.' + key, fn, this, args);
      };
      if (moduleName === 'VibeMolAutoIso' && new URLSearchParams(location.search).get('aliasWorker') === '1') observed.workerThresholdSamples = 1;
      const controller = module[factory](observed);
      const wrapped = methods(controller, moduleName);
      controllers[moduleName] = wrapped;
      return wrapped;
    };
    return Object.isFrozen(module) ? Object.freeze(copy) : copy;
  });
  for (const name of ['VibeMolVolumeGeometry', 'VibeMolVolume2C', 'VibeMolRendering', 'VibeMolCloudRendering', 'VibeMolArithmeticGrid']) hook(name, module => methods(module, name));
  hook('VibeMolSessionFormat', module => methods(module, 'SessionFormat'));
  hook('VibeMolSessionModule', module => methods(module, 'SessionModule'));
  // Inputs are structured-cloned unless explicitly transferred. Record original
  // source-buffer membership and whether a transfer could detach an owner.
  const send = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (message, transfer) {
    const borrowed = [];
    const seen = new Set();
    function visit(x) {
      if (!x || typeof x !== 'object' || seen.has(x)) return;
      seen.add(x);
      if (ArrayBuffer.isView(x)) {
        const entry = byArray.get(x);
        if (entry) borrowed.push({
          id: entry.id,
          bytes: x.byteLength
        });
        return;
      }
      for (const v of Object.values(x)) visit(v);
    }
    visit(message);
    const list = Array.isArray(transfer) ? transfer : transfer?.transfer || [];
    const transferred = arrays.filter(a => !Array.isArray(a.value) && list.includes(a.value.buffer)).map(a => a.id);
    const result = Reflect.apply(send, this, arguments);
    workerMessages.push({
      kind: message.payload ? 'autoiso' : message.operation ? 'arithmetic' : 'other',
      borrowed,
      transferredSourceIds: transferred,
      byteLengthsAfter: borrowed.map(x => ({
        id: x.id,
        bytes: arrays[x.id - 1].value.byteLength
      }))
    });
    return result;
  };
  async function checkpoint(stage) {
    const rows = [];
    for (const a of arrays) {
      const bytes = bytesOf(a.value);
      const changed = bytes.length !== a.baseline.length || bytes.some((b, i) => b !== a.baseline[i]);
      const hash = async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data))).map(x => x.toString(16).padStart(2, '0')).join('');
      rows.push({
        id: a.id,
        backingId: a.backingId ?? null,
        byteOffset: a.byteOffset ?? null,
        type: a.type,
        bytes: bytes.length,
        labels: [...a.labels],
        kinds: [...a.kinds],
        changed,
        before: await hash(a.baseline),
        after: await hash(bytes)
      });
    }
    return {
      stage,
      guardedCalls,
      violations: violations.slice(),
      bufferAccesses: bufferAccesses.slice(),
      arrays: rows,
      sourceChanges: rows.filter(a => a.changed && a.kinds.includes('source')),
      derivedChanges: rows.filter(a => a.changed && !a.kinds.includes('source')),
      calls: {
        ...calls
      },
      workerMessages: workerMessages.slice(),
      volumes: volumes.length
    };
  }
  const controls = [];
  for (const [name, action] of [['index', a => {
    a[0] = 2;
  }], ['set', a => a.set([2])], ['subarray', a => {
    a.subarray(0, 1)[0] = 2;
  }], ['callback-array', a => a.map((v, i, array) => {
    array[i] = 2;
    return v;
  })]]) {
    const a = new Float32Array([1]);
    let blocked = false;
    try {
      action(readonly(a, 'control'));
    } catch (e) {
      blocked = /borrowed-buffer write/.test(e.message);
    }
    controls.push({
      name,
      blocked,
      sourceUnchanged: a[0] === 1
    });
  }
  violations.length = 0;
  const old = new Float32Array([1, 2]);
  const owned = structuredClone(old.buffer, {
    transfer: [old.buffer]
  });
  let readThrows = false,
    methodWriteThrows = false,
    indexWriteThrows = false;
  try {
    old.slice();
  } catch {
    readThrows = true;
  }
  try {
    old.set([2]);
  } catch {
    methodWriteThrows = true;
  }
  try {
    old[0] = 2;
  } catch {
    indexWriteThrows = true;
  }
  const detachControl = {
    readThrows,
    methodWriteThrows,
    indexWriteThrows,
    indexRead: old[0] ?? null,
    transferredOwnerUnchanged: new Float32Array(owned)[0] === 1
  };
  window.__scientificAliasProbe = {
    checkpoint,
    volume,
    controllers,
    controls,
    detachControl,
    source: kind => volumes.map(x => x.vol).find(v => kind === 'cube' ? v.kind !== 'molden' && !v.isTwoComponent && v.data?.length : kind === 'molden' ? v.kind === 'molden' : kind === 'trajectory' ? v.trajectory : kind === 'vibration' ? v.vibration : v.isTwoComponent),
    borrowReceipt: () => arrays.map(a => ({
      id: a.id,
      labels: [...a.labels],
      kinds: [...a.kinds]
    }))
  };
})();
