(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const L = window.StyleLabLooks;
  const STORAGE = 'vibemol.visual-style-lab.v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  let base = L.builtins[1], settings = clone(base.settings), saved = [], subject = 'pyridine';
  let storageAvailable = true, pendingFrame = 0, disposed = false;
  const status = (message, error = false) => {
    $('status').textContent = message;
    $('status').classList.toggle('error', error);
  };
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if (stored && stored.version === 1) {
      saved = (Array.isArray(stored.saved) ? stored.saved : []).slice(0, 50).map(item => {
        const look = L.parse(item);
        if (typeof item.id !== 'string' || !item.id.startsWith('user-')) throw new Error('Invalid saved look.');
        return { ...look, id: item.id };
      });
      base = [...L.builtins, ...saved].find(look => look.id === stored.baseId) || base;
      settings = L.validateSettings(stored.draft || base.settings);
      if (typeof stored.name === 'string') $('lookName').value = stored.name.slice(0, 60);
    }
  } catch {
    saved = []; base = L.builtins[1]; settings = clone(base.settings);
    status('Previous preview settings could not be read. You can still export your look.', true);
  }
  function persist() {
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ version: 1, saved, baseId: base.id, draft: settings, name: $('lookName').value }));
      storageAvailable = true;
      return true;
    } catch {
      storageAvailable = false;
      status('Browser storage is unavailable or full. Export your look to keep it.', true);
      return false;
    }
  }

  const numericControls = [
    ['atomScale', 'Atom size', 0.01, value => value.toFixed(2) + '×'],
    ['bondRadius', 'Bond thickness', 0.005, value => (value / 0.105).toFixed(2) + '×'],
    ['smoothness', 'Polish', 0.01, value => Math.round(value * 100) + '%'],
    ['outline', 'Outline', 0.001, value => value === 0 ? 'Off' : (value * 100).toFixed(1)],
    ['key', 'Key light', 0.1, value => value.toFixed(1)],
    ['rim', 'Edge light', 0.1, value => value.toFixed(1)],
  ];
  const advancedControls = [
    ['fill', 'Fill light', 0.1, value => value.toFixed(1)],
    ['environment', 'Studio reflections', 0.05, value => value.toFixed(2)],
    ['metalness', 'Metallic finish', 0.01, value => Math.round(value * 100) + '%'],
    ['coat', 'Clear coat', 0.01, value => Math.round(value * 100) + '%'],
    ['iridescence', 'Pearlescence', 0.01, value => Math.round(value * 100) + '%'],
    ['surfaceOpacity', 'Orbital opacity', 0.01, value => Math.round(value * 100) + '%'],
    ['exposure', 'Exposure', 0.05, value => value.toFixed(2)],
  ];
  function addSlider(parent, [key, label, step, format]) {
    const group = document.createElement('div');
    const caption = document.createElement('label');
    caption.className = 'slider-label'; caption.htmlFor = key;
    caption.append(document.createTextNode(label));
    const value = document.createElement('output'); value.id = key + 'Value';
    caption.append(value);
    const input = document.createElement('input');
    input.type = 'range'; input.className = 'slider'; input.id = key;
    [input.min, input.max] = L.limits[key]; input.step = step;
    input.addEventListener('input', () => { settings[key] = Number(input.value); change(); });
    group.append(caption, input); parent.append(group);
    return () => { input.value = settings[key]; value.value = format(settings[key]); };
  }
  const syncControls = numericControls.map(control => addSlider($('controls'), control));
  const finishLabel = document.createElement('label'); finishLabel.className = 'field';
  finishLabel.textContent = 'Shading';
  const finish = document.createElement('select'); finish.id = 'finish';
  for (const [value, name] of [['physical', 'Studio'], ['phong', 'Classic'], ['toon', 'Illustrated']]) finish.add(new Option(name, value));
  finish.addEventListener('change', () => { settings.finish = finish.value; change(); });
  finishLabel.append(finish); $('advanced').append(finishLabel);
  syncControls.push(...advancedControls.map(control => addSlider($('advanced'), control)));
  const palette = document.createElement('div'); palette.className = 'colors';
  const colorLabels = { background: 'Background', carbon: 'Carbon', hydrogen: 'Hydrogen', nitrogen: 'Nitrogen', oxygen: 'Oxygen', bond: 'Bonds', positive: 'Positive ψ', negative: 'Negative ψ' };
  for (const key of L.colors) {
    const label = document.createElement('label'); label.className = 'color-field';
    const input = document.createElement('input'); input.type = 'color'; input.id = key;
    input.addEventListener('input', () => { settings[key] = input.value; change(); });
    label.append(input, document.createTextNode(colorLabels[key])); palette.append(label);
  }
  $('advanced').append(palette);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: $('preview'), antialias: true, preserveDrawingBuffer: true });
  } catch {
    status('This preview needs WebGL. Enable hardware acceleration and reload.', true);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 50);
  camera.position.set(0, 0, 14);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false; controls.enablePan = false;
  controls.minZoom = 0.5; controls.maxZoom = 3;
  const lightRig = new THREE.Group();
  scene.add(lightRig);
  const keyLight = new THREE.DirectionalLight('#ffffff', 3);
  keyLight.position.set(-3.5, 5, 7); keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  Object.assign(keyLight.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.1, far: 30 });
  keyLight.shadow.bias = -0.0003; keyLight.shadow.normalBias = 0.025;
  const fillLight = new THREE.HemisphereLight('#ffffff', '#383e47', 0.8);
  const rimLight = new THREE.DirectionalLight('#ffffff', 2);
  rimLight.position.set(3.5, 2, -5);
  lightRig.add(keyLight, fillLight, rimLight);
  const sphere = new THREE.SphereGeometry(1, 64, 40);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 36, 1);
  const gradient = new THREE.DataTexture(new Uint8Array([70, 150, 210, 255]), 4, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter; gradient.needsUpdate = true;
  let group = null, environmentTarget = null, orbitalGeometry = null;
  const up = new THREE.Vector3(0, 1, 0);
  const thumbnails = new Map();
  const models = {
    methane: {
      atoms: [{ Z: 6, x: 0, y: 0, z: 0 }, { Z: 1, x: 0, y: 1.09, z: 0 },
        ...[0, 2 * Math.PI / 3, 4 * Math.PI / 3].map(angle => ({ Z: 1, x: 1.09 * Math.sqrt(8 / 9) * Math.sin(angle), y: -1.09 / 3, z: -1.09 * Math.sqrt(8 / 9) * Math.cos(angle) }))],
      bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]],
      caption: 'Methane · ideal tetrahedral geometry', halfHeight: 1.9,
    },
    orbital: { atoms: [{ Z: 1, x: 0, y: 0, z: 0 }], bonds: [], caption: 'Hydrogen 2p · analytic ψ · |ψ| = 0.018 a₀⁻³ᐟ²', halfHeight: 4.6 },
  };
  try {
    const response = await fetch('../../../assets/fragments/pyridine.xyz');
    if (!response.ok) throw new Error('Could not read the pyridine sample.');
    const volume = VibeMolParsers.parseXYZ(await response.text());
    models.pyridine = {
      // Rotate the catalog's YZ plane to XY, preserving all interatomic distances.
      atoms: volume.atoms.map(atom => ({ Z: atom.Z, x: atom.y, y: atom.z + 1.4, z: atom.x })),
      bonds: [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1], [2, 6, 1], [3, 7, 1], [4, 8, 1], [5, 9, 1], [0, 10, 1]],
      caption: 'Pyridine · C₅H₅N · element palette', halfHeight: 3.3,
    };
  } catch {
    subject = 'methane'; $('subject').value = subject;
    $('subject').querySelector('[value=pyridine]').disabled = true;
    status('Pyridine could not be loaded. Methane and the orbital preview are available.', true);
  }
  try {
    const texture = await new THREE.TextureLoader().loadAsync('../../../assets/environments/monochrome_studio_04_1k.png');
    texture.colorSpace = THREE.SRGBColorSpace;
    const generator = new THREE.PMREMGenerator(renderer);
    try { environmentTarget = generator.fromEquirectangular(texture); scene.environment = environmentTarget.texture; }
    finally { texture.dispose(); generator.dispose(); }
  } catch { status('Studio reflections are unavailable; the direct-light preview is still usable.', true); }

  function clearGroup() {
    if (!group) return;
    const materials = new Set();
    group.traverse(object => { if (object.material) materials.add(object.material); });
    for (const material of materials) material.dispose();
    scene.remove(group);
  }
  function material(color, look, isSurface = false) {
    let value;
    if (look.finish === 'phong') {
      value = new THREE.MeshPhongMaterial({ color, shininess: 2 + look.smoothness * 35, specular: '#777777' });
    } else if (look.finish === 'toon') {
      value = new THREE.MeshToonMaterial({ color, gradientMap: gradient });
    } else {
      value = new THREE.MeshPhysicalMaterial({ color, roughness: 0.92 - look.smoothness * 0.85,
        metalness: look.metalness, clearcoat: look.coat, clearcoatRoughness: 0.22,
        envMapIntensity: look.environment, iridescence: look.iridescence,
        iridescenceIOR: 1.3, iridescenceThicknessRange: [130, 380] });
    }
    if (isSurface) {
      value.side = THREE.DoubleSide;
      value.transparent = look.surfaceOpacity < 1;
      value.opacity = look.surfaceOpacity;
      value.depthWrite = look.surfaceOpacity === 1;
    }
    return value;
  }
  function addOutline(mesh, look, radius, bond = false) {
    if (look.outline <= 0) return;
    const outline = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: '#25262a', side: THREE.BackSide }));
    const scale = 1 + look.outline / radius;
    if (bond) outline.scale.set(scale, 1, scale); else outline.scale.setScalar(scale);
    mesh.add(outline);
  }
  function getOrbitalGeometry() {
    if (orbitalGeometry) return orbitalGeometry;
    // Normalized hydrogen 2p_z in atomic units: ψ = z exp(-r/2)/(4√(2π)).
    // Sample ψ and -ψ at the same positive level; both normals point outward.
    const n = 49, step = 16 / (n - 1), idx = (i, j, k) => (i * n + j) * n + k;
    const data = new Float32Array(n ** 3);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
      const x = i * step - 8, y = j * step - 8, z = k * step - 8;
      data[idx(i, j, k)] = z * Math.exp(-Math.hypot(x, y, z) / 2) / (4 * Math.sqrt(2 * Math.PI));
    }
    const volume = { nxyz: [n, n, n], axes: [[step, 0, 0], [0, step, 0], [0, 0, step]], origin: [-8, -8, -8], units: 'bohr', data, idx };
    const positive = VibeMolVolumeGeometry.makeIsosurface(volume, 0.018);
    volume.data = data.map(value => -value);
    const negative = VibeMolVolumeGeometry.makeIsosurface(volume, 0.018);
    positive.rotateX(-Math.PI / 2); negative.rotateX(-Math.PI / 2);
    orbitalGeometry = [positive, negative];
    return orbitalGeometry;
  }
  function build(look) {
    clearGroup(); group = new THREE.Group(); scene.add(group);
    const model = models[subject];
    scene.background = new THREE.Color(look.background);
    renderer.toneMappingExposure = look.exposure;
    // Classic has no tone compression, to preserve a clean white reference plate.
    renderer.toneMapping = look.finish === 'phong' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    keyLight.intensity = look.key; fillLight.intensity = look.fill; rimLight.intensity = look.rim;
    fillLight.groundColor.set(look.finish === 'phong' ? '#777777' : '#383e47');
    keyLight.castShadow = look.finish !== 'phong' && look.finish !== 'toon';
    const atomMaterials = new Map();
    for (const atom of model.atoms) {
      const color = look[({ 1: 'hydrogen', 6: 'carbon', 7: 'nitrogen', 8: 'oxygen' })[atom.Z]] || look.carbon;
      if (!atomMaterials.has(color)) atomMaterials.set(color, material(color, look));
      const radius = ({ 1: 0.28, 6: 0.43, 7: 0.42, 8: 0.4 })[atom.Z] * look.atomScale;
      const mesh = new THREE.Mesh(sphere, atomMaterials.get(color));
      mesh.position.set(atom.x, atom.y, atom.z); mesh.scale.setScalar(radius);
      mesh.castShadow = mesh.receiveShadow = true;
      addOutline(mesh, look, radius); group.add(mesh);
    }
    const bondMaterial = material(look.bond, look);
    if (!model.bonds.length) bondMaterial.dispose();
    for (const [a, b, order] of model.bonds) {
      const start = new THREE.Vector3(model.atoms[a].x, model.atoms[a].y, model.atoms[a].z);
      const end = new THREE.Vector3(model.atoms[b].x, model.atoms[b].y, model.atoms[b].z);
      const direction = end.clone().sub(start);
      const lateral = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
      const radius = look.bondRadius * (order === 2 ? 0.65 : 1);
      for (let i = 0; i < order; i++) {
        const mesh = new THREE.Mesh(cylinder, bondMaterial);
        mesh.position.copy(start).add(end).multiplyScalar(0.5).addScaledVector(lateral, order === 2 ? (i === 0 ? -1 : 1) * radius * 1.35 : 0);
        mesh.quaternion.setFromUnitVectors(up, direction.clone().normalize());
        mesh.scale.set(radius, direction.length(), radius);
        mesh.castShadow = mesh.receiveShadow = true;
        addOutline(mesh, look, radius, true); group.add(mesh);
      }
    }
    if (subject === 'orbital') {
      getOrbitalGeometry().forEach((geometry, index) => {
        const mesh = new THREE.Mesh(geometry, material(index === 0 ? look.positive : look.negative, look, true));
        mesh.renderOrder = 2; group.add(mesh);
      });
      group.rotation.set(0.07, 0, -0.48);
    } else if (subject === 'methane') group.rotation.set(0.43, 0.43, -0.05);
    else group.rotation.set(0.4, -0.4, -0.32);
  }
  function projection(width, height) {
    const half = models[subject].halfHeight;
    camera.left = -half * width / height; camera.right = -camera.left;
    camera.top = half; camera.bottom = -half; camera.updateProjectionMatrix();
  }
  function draw() {
    if (disposed) return;
    lightRig.quaternion.copy(camera.quaternion);
    renderer.render(scene, camera);
  }
  function resize() {
    const rect = $('preview').getBoundingClientRect();
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    projection(rect.width, rect.height); draw();
  }
  function refreshPreview() { build(settings); resize(); }
  function change() {
    syncUi(); persist();
    if (pendingFrame) return;
    pendingFrame = requestAnimationFrame(() => { pendingFrame = 0; refreshPreview(); });
  }
  function syncUi() {
    const dirty = !L.equal(settings, base.settings);
    $('previewName').textContent = base.name;
    $('modified').hidden = !dirty;
    $('revert').disabled = !dirty;
    $('updateLook').disabled = !base.id.startsWith('user-') || (!dirty && $('lookName').value.trim() === base.name);
    $('finish').value = settings.finish;
    for (const sync of syncControls) sync();
    for (const key of L.colors) $(key).value = settings[key];
    const physical = settings.finish === 'physical';
    for (const key of ['environment', 'metalness', 'coat', 'iridescence']) $(key).disabled = !physical;
    $('smoothness').disabled = settings.finish === 'toon';
    $('surfaceOpacity').disabled = subject !== 'orbital';
    const color = new THREE.Color(settings.background);
    const light = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722 > 0.3;
    document.querySelector('.stage-wrap').style.color = light ? '#454a4e' : '#dbe2ec';
    $('phaseLegend').hidden = subject !== 'orbital';
    $('positiveSwatch').style.background = settings.positive;
    $('negativeSwatch').style.background = settings.negative;
    $('moleculeCaption').textContent = models[subject].caption;
    document.querySelectorAll('[data-look]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.look === base.id)));
  }
  function choose(look) {
    base = look; settings = clone(look.settings);
    $('lookName').value = look.id.startsWith('user-') ? look.name : `My ${look.name}`;
    syncUi(); persist(); refreshPreview();
    if (storageAvailable) status('Edits and named looks stay in this browser.');
  }
  function makeCollection() {
    for (const [index, look] of L.builtins.entries()) {
      const button = document.createElement('button'); button.className = 'look-card'; button.dataset.look = look.id;
      const figure = document.createElement('div'); figure.className = 'look-image';
      const img = document.createElement('img'); img.alt = `${look.name} 3D rendering`; img.id = 'thumb-' + look.id;
      const number = document.createElement('span'); number.className = 'look-number'; number.textContent = '0' + (index + 1);
      number.style.color = ['nocturne', 'opal'].includes(look.id) ? '#e0e4ed' : '#3f4446';
      figure.append(img, number);
      const title = document.createElement('span'); title.className = 'look-title'; title.append(document.createTextNode(look.name));
      const subtitle = document.createElement('small'); subtitle.textContent = look.subtitle; title.append(subtitle);
      const description = document.createElement('span'); description.className = 'look-description'; description.textContent = look.description;
      button.append(figure, title, description); button.onclick = () => choose(look); $('looks').append(button);
    }
  }
  function makeSaved() {
    $('savedLooks').replaceChildren(); $('savedSection').hidden = saved.length === 0;
    for (const look of saved) {
      const button = document.createElement('button'); button.textContent = look.name; button.dataset.look = look.id;
      button.onclick = () => choose(look); $('savedLooks').append(button);
    }
  }
  function renderThumbnails() {
    const key = subject;
    if (!thumbnails.has(key)) {
      const position = camera.position.clone(), quaternion = camera.quaternion.clone(), zoom = camera.zoom;
      camera.position.set(0, 0, 14); camera.lookAt(0, 0, 0); camera.zoom = 1;
      renderer.setSize(480, 325, false); projection(480, 325);
      const images = [];
      for (const look of L.builtins) { build(look.settings); draw(); images.push(renderer.domElement.toDataURL('image/png')); }
      thumbnails.set(key, images);
      camera.position.copy(position); camera.quaternion.copy(quaternion); camera.zoom = zoom;
    }
    L.builtins.forEach((look, index) => { $('thumb-' + look.id).src = thumbnails.get(key)[index]; });
    refreshPreview();
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('revert').onclick = () => choose(base);
  $('lookName').addEventListener('input', () => { syncUi(); persist(); });
  $('saveLook').onclick = () => {
    try {
      if (saved.length >= 50) throw new Error('This preview holds 50 named looks. Export the current look to keep it.');
      const value = { ...L.serialize($('lookName').value, settings), id: 'user-' + crypto.randomUUID() };
      saved.push(value); base = value; makeSaved(); syncUi();
      if (persist()) status(`Saved “${value.name}” in this browser.`);
    } catch (error) { status(error.message, true); }
  };
  $('updateLook').onclick = () => {
    try {
      const index = saved.findIndex(item => item.id === base.id);
      if (index < 0) return;
      base = { ...L.serialize($('lookName').value, settings), id: base.id };
      saved[index] = base; makeSaved(); syncUi();
      if (persist()) status(`Updated “${base.name}”.`);
    } catch (error) { status(error.message, true); }
  };
  $('exportLook').onclick = () => {
    try {
      const look = L.serialize($('lookName').value, settings);
      download(new Blob([JSON.stringify(look, null, 2) + '\n'], { type: 'application/json' }), 'vibemol-look-study.json');
      status('Exported. Import this file here to restore the exact appearance.');
    } catch (error) { status(error.message, true); }
  };
  $('importLook').onclick = () => $('lookFile').click();
  $('lookFile').onchange = async () => {
    try {
      const file = $('lookFile').files[0]; if (!file) return;
      if (file.size > 65536) throw new Error('This look file is too large (maximum 64 KB).');
      if (saved.length >= 50) throw new Error('This preview holds 50 named looks.');
      const look = { ...L.parse(JSON.parse(await file.text())), id: 'user-' + crypto.randomUUID() };
      saved.push(look); makeSaved(); choose(look);
      if (storageAvailable) status(`Imported “${look.name}”.`);
    } catch (error) { status(error.message, true); }
    finally { $('lookFile').value = ''; }
  };
  function resetView() {
    camera.position.set(0, 0, 14); camera.up.set(0, 1, 0); camera.zoom = 1;
    controls.target.set(0, 0, 0); controls.update(); resize();
  }
  $('subject').onchange = () => {
    subject = $('subject').value; resetView(); renderThumbnails(); syncUi();
  };
  $('resetView').onclick = resetView;
  for (const [id, angle] of [['turnLeft', -0.25], ['turnRight', 0.25]]) $(id).onclick = () => {
    camera.position.applyAxisAngle(up, angle); controls.update(); draw();
  };
  $('savePng').onclick = () => {
    if (pendingFrame) {
      cancelAnimationFrame(pendingFrame); pendingFrame = 0; refreshPreview();
    }
    draw(); renderer.domElement.toBlob(blob => {
      if (blob) download(blob, `vibemol-${base.id}-${subject}.png`);
      else status('The image could not be exported.', true);
    }, 'image/png');
  };
  controls.addEventListener('change', draw);
  makeCollection(); makeSaved(); renderThumbnails(); syncUi();
  const observer = new ResizeObserver(resize); observer.observe($('preview'));
  window.StyleLab = Object.freeze({
    getState: () => ({ baseId: base.id, settings: clone(settings), subject, savedCount: saved.length,
      atoms: clone(models[subject].atoms), camera: camera.matrixWorld.toArray(),
      modified: !L.equal(settings, base.settings), environmentReady: !!scene.environment,
      memory: { ...renderer.info.memory } }),
    ready: true,
  });
  window.addEventListener('pagehide', () => {
    disposed = true; cancelAnimationFrame(pendingFrame); observer.disconnect(); controls.dispose();
    clearGroup(); sphere.dispose(); cylinder.dispose(); gradient.dispose();
    if (orbitalGeometry) orbitalGeometry.forEach(geometry => geometry.dispose());
    if (environmentTarget) environmentTarget.dispose();
    keyLight.shadow.dispose(); renderer.dispose();
  }, { once: true });
  window.addEventListener('pageshow', event => { if (event.persisted && disposed) location.reload(); });
})().catch(error => {
  const status = document.getElementById('status');
  status.textContent = `Preview could not start: ${error.message}`; status.classList.add('error');
  console.error(error);
});
