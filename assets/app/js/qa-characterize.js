(function (global) {
  'use strict';

  // This script is inert in ordinary launches. It never adds a VibeMol API.
  if (new URLSearchParams(global.location.search).get('qa') !== '1') return;
  if (global.__vmqa?.characterizeVersion === 1) return;

  const errors = [];
  const elementCacheChecks = Object.create(null);
  const elementCacheFailures = [];
  let observedScene = null;
  let observedCamera = null;
  global.addEventListener('error', event => errors.push(event.message));
  global.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));

  // Observe the existing renderer without exporting private app state or
  // replacing rendering. Preserve any callback installed by another test.
  const prototype = global.THREE.Mesh.prototype;
  const beforeRender = prototype.onBeforeRender;
  prototype.onBeforeRender = function (...args) {
    if (this.userData?.type === 'atom') {
      observedCamera = args[2];
      observedScene = this;
      while (observedScene.parent) observedScene = observedScene.parent;
    }
    return beforeRender.apply(this, args);
  };

  const round = value => Number(Number(value).toFixed(4));
  const hash = async bytes => Array.from(new Uint8Array(await global.crypto.subtle.digest('SHA-256', bytes)),
    byte => byte.toString(16).padStart(2, '0')).join('');

  async function canonical(value) {
    if (ArrayBuffer.isView(value)) {
      // Fingerprint decoded numeric contents, never the session's buffer IDs or
      // base64 ordering. Type and length remain part of the golden structure.
      const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      return { typedArray: value.constructor.name, length: value.length, sha256: await hash(bytes) };
    }
    if (Array.isArray(value)) return Promise.all(value.map(canonical));
    if (value && typeof value === 'object') {
      const result = {};
      for (const key of Object.keys(value).sort()) result[key] = await canonical(value[key]);
      return result;
    }
    return value;
  }

  function apiSurface() {
    return Object.fromEntries(Object.keys(global).filter(key => key.startsWith('VibeMol')).sort()
      .map(key => [key, Object.keys(global[key] || {}).sort()]));
  }

  async function decodedSession() {
    const format = global.VibeMolSessionFormat;
    const envelope = await global.VibeMolSession.export();
    const decoded = await format.decode(JSON.stringify(envelope));
    const encoded = await format.encode(decoded);
    const again = await format.decode(encoded);
    // These three metadata values are regenerated on every capture. Retain
    // their keys and validate their format; never mask scientific timestamps.
    function captureTimes(snapshot) {
      for (const [object, key] of [[snapshot, 'savedAt'],
        [snapshot.preset?.meta, 'createdAt'], [snapshot.preset?.meta, 'updatedAt']]) {
        if (!object || !Object.hasOwn(object, key)) continue;
        if (typeof object[key] === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(object[key])
          && Number.isFinite(Date.parse(object[key]))) {
          object[key] = '[capture timestamp]';
        }
      }
    }
    captureTimes(decoded);
    captureTimes(again);
    const snapshot = await canonical(decoded);
    if (JSON.stringify(snapshot) !== JSON.stringify(await canonical(again))) {
      throw new Error('Decoded session changed during encode/decode round-trip.');
    }
    return snapshot;
  }

  function path(element) {
    if (element.id) return '#' + element.id;
    const parent = element.parentElement;
    if (!parent) return element.localName;
    const siblings = Array.from(parent.children).filter(child => child.localName === element.localName);
    return path(parent) + '>' + element.localName + ':nth-of-type(' + (siblings.indexOf(element) + 1) + ')';
  }

  function domContract() {
    const bar = global.document.getElementById('workbenchBar') || global.document.getElementById('toolbar');
    return {
      mode: global.VibeMolWorkbenchHost.getMode(),
      ids: Array.from(global.document.querySelectorAll('[id]'), element => element.id).sort(),
      controls: Array.from(global.document.querySelectorAll(
        '[role="radiogroup"],[role="radio"],[role="checkbox"],[role="menuitemcheckbox"],[role="tab"],[role="tablist"],input[type="checkbox"]'),
      element => ({ path: path(element), role: element.getAttribute('role'),
        ariaChecked: element.getAttribute('aria-checked'), ariaSelected: element.getAttribute('aria-selected'),
        checked: element.type === 'checkbox' ? element.checked : null,
        disabled: 'disabled' in element ? element.disabled : null })),
      toolbarHeight: round(bar.getBoundingClientRect().height),
    };
  }

  function geometry() {
    const THREE = global.THREE;
    const graph = global.VibeMolTesting.getSceneGraphSnapshot();
    const moleculeLayers = graph.scenes.filter(scene => scene.visible).flatMap(scene =>
      scene.layers.filter(layer => layer.kind === 'molecule' && layer.effectiveVisible));
    const layers = graph.scenes.flatMap(scene => scene.layers).map(layer => ({
      id: layer.id, kind: layer.kind, name: layer.name, visible: layer.effectiveVisible,
      atomCount: 0, bondCount: 0, vertices: 0, triangles: 0, objects: 0, bounds: null,
    }));
    const byId = new Map(layers.map(layer => [layer.id, layer]));
    const bounds = new Map(layers.map(layer => [layer.id, new THREE.Box3()]));
    const atomGroups = [], bondGroups = [];
    if (observedScene) {
      observedScene.updateMatrixWorld(true);
      observedScene.traverse(node => {
        if (node.children.some(child => child.userData?.type === 'atom')) atomGroups.push(node);
        if (node.children.some(child => Number.isInteger(child.userData?.i) && Number.isInteger(child.userData?.j))) bondGroups.push(node);
      });
      const owners = new Map();
      // Molecule groups are appended in scene order by applyPostGeometry.
      // Do not depend on generated THREE UUIDs, which vary on every launch.
      moleculeLayers.forEach((layer, index) => {
        if (atomGroups[index]) owners.set(atomGroups[index], layer.id);
        if (bondGroups[index]) owners.set(bondGroups[index], layer.id);
      });
      const bonds = new Map(layers.map(layer => [layer.id, new Set()]));
      const local = new THREE.Box3(), matrix = new THREE.Matrix4(), instance = new THREE.Matrix4();
      observedScene.traverse(node => {
        let owner = node.userData?.sceneLayerId;
        for (let parent = node; !owner && parent; parent = parent.parent) owner = owners.get(parent);
        const layer = byId.get(owner);
        if (!layer) return;
        if (node.userData?.type === 'atom') layer.atomCount++;
        if (Number.isInteger(node.userData?.i) && Number.isInteger(node.userData?.j)) {
          bonds.get(owner).add([node.userData.i, node.userData.j].sort((a, b) => a - b).join(':'));
        }
        if (!node.geometry?.getAttribute('position')) return;
        const count = node.isInstancedMesh ? node.count : 1;
        layer.objects++;
        layer.vertices += node.geometry.getAttribute('position').count * count;
        if (node.isMesh) layer.triangles += (node.geometry.index?.count || node.geometry.getAttribute('position').count) / 3 * count;
        if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
        for (let i = 0; i < count; i++) {
          matrix.copy(node.matrixWorld);
          if (node.isInstancedMesh) { node.getMatrixAt(i, instance); matrix.multiply(instance); }
          bounds.get(owner).union(local.copy(node.geometry.boundingBox).applyMatrix4(matrix));
        }
      });
      layers.forEach(layer => {
        layer.bondCount = bonds.get(layer.id).size;
        const box = bounds.get(layer.id);
        if (!box.isEmpty()) layer.bounds = { min: box.min.toArray().map(round), max: box.max.toArray().map(round) };
      });
    }
    return { layers, molecule: global.VibeMolTesting.getMoleculeRenderSnapshot(),
      materials: { atoms: global.VibeMolTesting.getLookMaterialSnapshot('atoms'),
        bonds: global.VibeMolTesting.getLookMaterialSnapshot('bonds'),
        surfaces: global.VibeMolTesting.getLookMaterialSnapshot('surfaces') },
      look: global.VibeMolAppearanceLooks.snapshot().settings };
  }

  function coordinates() {
    const content = global.document.getElementById('coordsContent');
    return { title: global.document.getElementById('coordsPanelTitle').textContent,
      rows: Array.from(content.querySelectorAll('[data-atom-index]'), row => ({
        index: Number(row.dataset.atomIndex), text: row.textContent.trim(),
        values: Array.from(row.querySelectorAll('input'), input => input.value),
      })) };
  }

  function assertElementCacheIdentity(reason = 'checkpoint') {
    const bridge = global.__vmqaElementCaches;
    // Historical sources can still use this harness through --inject-harness.
    if (!bridge) return null;
    const nodes = bridge.readNodes();
    const liveNames = Object.keys(bridge.ids);
    const absent = bridge.knownAbsent || {};
    const absentNames = Object.keys(absent);
    const expected = global.VibeMolWorkbenchHost?.enabled
      ? { live: 47, knownAbsent: 5 } : { live: 48, knownAbsent: 4 };
    const names = [...liveNames, ...absentNames];
    if (liveNames.length !== expected.live || absentNames.length !== expected.knownAbsent
      || new Set(names).size !== names.length
      || Object.keys(nodes).sort().join() !== names.slice().sort().join()
      || absentNames.some(name => !Number.isInteger(absent[name].issue) || absent[name].issue <= 0
        || typeof absent[name].id !== 'string' || !['null', 'detached'].includes(absent[name].cached))) {
      throw new Error('Element cache composition must contain ' + expected.live + ' live and '
        + expected.knownAbsent + ' issue-backed known-absent nodes.');
    }
    elementCacheChecks[reason] = (elementCacheChecks[reason] || 0) + 1;
    const stale = liveNames.filter(name => {
      const live = global.document.getElementById(bridge.ids[name]);
      return !live || !nodes[name]?.isConnected || nodes[name] !== live;
    }).concat(absentNames.filter(name => {
      const entry = absent[name], node = nodes[name];
      if (global.document.getElementById(entry.id) !== null) return true;
      return entry.cached === 'null' ? node !== null
        : !node || node.nodeType !== 1 || node.isConnected !== false || node.id !== entry.id;
    }));
    if (stale.length) {
      const message = 'Element cache identity failed after ' + reason + ': ' + stale
        .map(name => name + ' (#' + (bridge.ids[name] || absent[name].id) + ')').join(', ');
      elementCacheFailures.push(message);
    }
    if (elementCacheFailures.length) throw new Error(elementCacheFailures[0]);
    return { count: names.length, reason };
  }

  function elementCacheReport() {
    const bridge = global.__vmqaElementCaches;
    const composition = bridge ? { live: Object.keys(bridge.ids).length,
      knownAbsent: Object.keys(bridge.knownAbsent || {}).length } : null;
    return { supported: !!global.__vmqaElementCaches, checks: { ...elementCacheChecks },
      failures: elementCacheFailures.slice(), nodeCount: composition ? composition.live + composition.knownAbsent : 0,
      composition, knownAbsent: bridge?.knownAbsent || {} };
  }

  // Check mutations at the end of the UI operation, once reparenting finishes.
  // Child-list observation also catches replacing a node while retaining its
  // ID and ARIA: the DOM contract alone cannot detect that failure.
  if (global.__vmqaElementCaches && global.MutationObserver) {
    new global.MutationObserver(records => {
      for (const record of records) {
        let reason = null;
        if (record.type === 'childList') reason = 'DOM replacement';
        else if (/^mode(Display|Measure|Edit|Calculations)Btn$/.test(record.target.id)
          && ['aria-checked', 'class'].includes(record.attributeName)) reason = 'mode switch';
        else if (record.target.matches('[data-vm-floating-panel],[data-wb-panel],[role="dialog"],[role="tabpanel"]')) {
          reason = 'panel transition: ' + (record.target.id || record.target.getAttribute('aria-label'));
        }
        if (reason) {
          try { assertElementCacheIdentity(reason); }
          catch (_) { /* Keep the first failure sticky; the next checkpoint throws it. */ }
        }
      }
    }).observe(global.document.body, { subtree: true, childList: true, attributes: true,
      attributeOldValue: true, attributeFilter: ['aria-checked', 'aria-hidden', 'hidden', 'class', 'style', 'open'] });
    assertElementCacheIdentity('QA initialization');
  }

  async function settle() {
    await global.document.fonts.ready;
    await new Promise(resolve => global.requestAnimationFrame(() => global.requestAnimationFrame(resolve)));
    assertElementCacheIdentity('presented checkpoint');
  }

  function renderState() {
    const canvas = global.document.getElementById('canvas');
    const rect = canvas.getBoundingClientRect();
    const camera = observedCamera;
    return { viewport: { cssWidth: round(rect.width), cssHeight: round(rect.height),
      bufferWidth: canvas.width, bufferHeight: canvas.height },
    projection: camera ? { type: camera.type, near: camera.near, far: camera.far,
      zoom: camera.zoom, matrix: camera.projectionMatrix.elements.slice() } : null };
  }

  async function capture() {
    await settle();
    return canonical({ api: apiSurface(), session: await decodedSession(), geometry: geometry(),
      dom: domContract(), coordinates: coordinates(), render: renderState(), errors: errors.slice() });
  }

  async function pixelHash() {
    await settle();
    return hash(new TextEncoder().encode(global.document.getElementById('canvas').toDataURL()));
  }

  global.__vmqa = Object.freeze({ ...global.__vmqa, characterizeVersion: 1,
    errors, apiSurface, decodedSession, domContract, geometry, coordinates, renderState, settle, capture, pixelHash,
    assertElementCacheIdentity, elementCacheReport });
})(window);
