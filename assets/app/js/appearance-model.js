(function (global) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const hex = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
  const MATERIAL_LIMITS = Object.freeze({ roughness: [0, 1], metalness: [0, 1], clearcoat: [0, 1],
    clearcoatRoughness: [0, 1], reflectivity: [0, 1], specularIntensity: [0, 2], shininess: [0, 250],
    emissiveIntensity: [0, 2], emissiveScale: [0, 1], emissiveMix: [0, 1], envMapIntensity: [0, 2], iridescence: [0, 1] });
  const MATERIAL_DEFAULT = Object.freeze({ model: 'physical', roughness: 0.45, metalness: 0, clearcoat: 0,
    clearcoatRoughness: 0.1, reflectivity: 0.5, specularIntensity: 1, shininess: 30,
    specularColor: '#ffffff', tint: '#ffffff', emissiveColor: '#ffffff', emissiveUsesColor: true,
    emissiveIntensity: 0, emissiveScale: 1, emissiveMix: 0, envMapIntensity: 0, iridescence: 0,
    vertexEmissiveColor: null, vertexEmissiveIntensity: null,
    toonSteps: [12, 64, 142, 255], byElement: {} });
  const material = patch => ({ ...clone(MATERIAL_DEFAULT), ...clone(patch || {}) });
  function validateMaterial(value) {
    if (!object(value) || !['physical', 'phong', 'toon'].includes(value.model)) throw new Error('Invalid material model.');
    const out = material(value);
    for (const [key, [min, max]] of Object.entries(MATERIAL_LIMITS)) if (!finite(out[key], min, max)) throw new Error(`Invalid material ${key}.`);
    for (const key of ['specularColor', 'tint', 'emissiveColor']) if (!hex(out[key])) throw new Error(`Invalid material ${key}.`);
    if (out.vertexEmissiveColor !== null && !hex(out.vertexEmissiveColor)) throw new Error('Invalid vertex emission color.');
    if (out.vertexEmissiveIntensity !== null && !finite(out.vertexEmissiveIntensity, 0, 2)) throw new Error('Invalid vertex emission intensity.');
    if (typeof out.emissiveUsesColor !== 'boolean' || !Array.isArray(out.toonSteps) || out.toonSteps.length < 2 || out.toonSteps.length > 8
      || !out.toonSteps.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) throw new Error('Invalid material shading.');
    if (!object(out.byElement) || Object.keys(out.byElement).length > 119) throw new Error('Invalid material element overrides.');
    for (const [z, patch] of Object.entries(out.byElement)) {
      if (!/^(0|[1-9]\d{0,2})$/.test(z) || +z > 118 || !object(patch) || 'byElement' in patch) throw new Error('Invalid material element override.');
      validateMaterial({ ...out, ...patch, byElement: {} });
    }
    return Object.fromEntries(Object.keys(MATERIAL_DEFAULT).map(key => [key, clone(out[key])]));
  }
  const SURFACE_PRESETS = Object.freeze({
    emissive: { roughness: 1, clearcoat: 1, emissiveIntensity: 0.8 },
    // The former Glossy style's solid finish, independent of its connector geometry.
    glossy: { roughness: 0.045, metalness: 0.03, clearcoat: 1, clearcoatRoughness: 0.015, reflectivity: 0.85 },
    matte: { roughness: 0.85, reflectivity: 0.3, envMapIntensity: 0.4 },
    satin: { roughness: 0.45, envMapIntensity: 0.8 },
    enamel: { roughness: 0.28, clearcoat: 0.45, clearcoatRoughness: 0.12, emissiveIntensity: 0.12 },
    lacquer: { roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05, reflectivity: 0.6, envMapIntensity: 1.2 },
    metal: { roughness: 0.2, metalness: 1, reflectivity: 0.8, envMapIntensity: 1.2 },
    gel: { roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.02, emissiveIntensity: 0.15, envMapIntensity: 1.5 },
    ceramic: { roughness: 0.35, clearcoat: 0.8, emissiveIntensity: 0.2, envMapIntensity: 0.65 },
  });
  const surfacePreset = key => material({ ...(SURFACE_PRESETS[key] || SURFACE_PRESETS.emissive), vertexEmissiveColor: '#000000' });
  const BASIC_GEOMETRY = Object.freeze({ connector: 'cylinder', atomScaleMain: 1, atomScaleTransitionMetal: 1,
    sphereWidthSegments: 36, sphereHeightSegments: 24, bondRadius: 0.099, bondRadialSegments: 16,
    bondHeightSegments: 2, kitCollarRadius: 0.114, curvedMultipleBonds: false });
  const BASIC_LIGHTING = Object.freeze({ hemiColor: '#ffffff', hemiGroundColor: '#081018', hemiIntensity: 2,
    dirColor: '#ffffff', dirIntensity: 1, dirPos: [1, 1, 1], ambColor: '#999999', ambIntensity: 0.65,
    rimColor: '#9fb8ff', rimIntensity: 0, exposure: 1, followTheme: true });
  const metals = [...Array.from({ length: 10 }, (_, i) => 21 + i), ...Array.from({ length: 10 }, (_, i) => 39 + i),
    ...Array.from({ length: 9 }, (_, i) => 72 + i), ...Array.from({ length: 9 }, (_, i) => 104 + i)];
  function legacy(name = 'basic') {
    const state = { version: 2, geometry: clone(BASIC_GEOMETRY), lighting: clone(BASIC_LIGHTING),
      coloring: { palette: 'basic', elementBonds: true, bondColor: '#eaecf0' },
      effects: { outlineWidth: 0, atomOutlineFraction: 0, bondOutlineFraction: 0, highlights: false },
      materials: { atoms: material({ roughness: 0.16, metalness: 0.08, clearcoat: 0.82, clearcoatRoughness: 0.12, reflectivity: 0.62 }),
        bonds: material({ roughness: 0.14, metalness: 0.08, clearcoat: 0.68, clearcoatRoughness: 0.14, reflectivity: 0.58 }),
        surfaces: surfacePreset('emissive'), bondsLinked: false } };
    if (name === 'toon' || name === 'fancy') {
      Object.assign(state.geometry, { atomScaleMain: 1.16, atomScaleTransitionMetal: 1.22, bondRadius: 0.095, bondRadialSegments: 20, bondHeightSegments: 1 });
      Object.assign(state.lighting, { hemiColor: '#f8fbff', hemiGroundColor: '#0f1826', hemiIntensity: 1.28,
        dirIntensity: 2.25, dirPos: [1.25, 1.2, 1.1], ambColor: '#9aa6ba', ambIntensity: 0.16, rimIntensity: 1.18 });
      state.coloring = { palette: 'toon', elementBonds: true, bondColor: '#d9e2ee' };
      state.effects = { outlineWidth: 0, atomOutlineFraction: 0.08, bondOutlineFraction: 0.18, highlights: true };
      state.materials.atoms = material({ model: 'toon', emissiveScale: 0.26, emissiveMix: 0.06, emissiveIntensity: 0.56,
        byElement: Object.fromEntries(metals.map(z => [z, { emissiveScale: 0.42, emissiveMix: 0.12, emissiveColor: '#ffe2a3', emissiveIntensity: 0.82 }])) });
      state.materials.bonds = material({ model: 'toon', emissiveUsesColor: false, emissiveColor: '#273244', emissiveIntensity: 0.14, toonSteps: [10, 72, 150, 255] });
      state.materials.surfaces = material({ model: 'toon', emissiveScale: 0.22, emissiveMix: 0.05, emissiveIntensity: 0.4, toonSteps: [8, 58, 132, 214, 255], vertexEmissiveColor: '#5f7392', vertexEmissiveIntensity: 0.2 });
    } else if (name === 'kit' || name === 'studio') {
      Object.assign(state.geometry, { connector: 'kit', atomScaleMain: 1.08, atomScaleTransitionMetal: 1.14,
        bondRadius: 0.068, bondRadialSegments: 20, bondHeightSegments: 1, curvedMultipleBonds: true });
      Object.assign(state.lighting, { hemiColor: '#fafcff', hemiGroundColor: '#515965', hemiIntensity: 1.35,
        dirIntensity: 2.1, dirPos: [1.35, 1.28, 1.18], ambColor: '#9ea7b2', ambIntensity: 0.18, rimColor: '#dfe7f2', rimIntensity: 0.75 });
      state.coloring = { palette: 'kit', elementBonds: false, bondColor: '#e7ebf2' };
      state.materials.atoms = material({ model: 'phong', shininess: 145, emissiveScale: 0.02, emissiveIntensity: 0.06,
        byElement: { 6: { emissiveScale: 0.012 }, ...Object.fromEntries(metals.map(z => [z, { shininess: 175, specularColor: '#ffe7b8', emissiveUsesColor: false, emissiveColor: '#2b2213', emissiveIntensity: 0.18 }])) } });
      state.materials.bonds = material({ model: 'phong', shininess: 185, emissiveUsesColor: false, emissiveColor: '#161b24', emissiveIntensity: 0.02 });
    }
    return state;
  }
  function normalize(value) {
    if (!object(value) || value.version !== 2) throw new Error('Unsupported appearance version.');
    const out = clone(value), g = out.geometry, l = out.lighting, e = out.effects, c = out.coloring, m = out.materials;
    if (!object(g) || !['cylinder', 'kit'].includes(g.connector) || typeof g.curvedMultipleBonds !== 'boolean') throw new Error('Invalid display geometry.');
    for (const key of ['atomScaleMain', 'atomScaleTransitionMetal']) if (!finite(g[key], 0.1, 3)) throw new Error('Invalid atom scale.');
    for (const key of ['bondRadius', 'kitCollarRadius']) if (!finite(g[key], 0.01, 0.4)) throw new Error('Invalid bond radius.');
    for (const key of ['sphereWidthSegments', 'sphereHeightSegments', 'bondRadialSegments', 'bondHeightSegments']) if (!Number.isInteger(g[key]) || !finite(g[key], 1, 128)) throw new Error('Invalid geometry resolution.');
    if (!object(l) || !Array.isArray(l.dirPos) || l.dirPos.length !== 3 || !l.dirPos.every(v => finite(v, -10, 10))
      || Math.hypot(...l.dirPos) < 0.01 || typeof l.followTheme !== 'boolean') throw new Error('Invalid lighting direction.');
    for (const key of ['hemiColor', 'hemiGroundColor', 'dirColor', 'ambColor', 'rimColor']) if (!hex(l[key])) throw new Error('Invalid light color.');
    for (const key of ['hemiIntensity', 'dirIntensity', 'ambIntensity', 'rimIntensity']) if (!finite(l[key], 0, 6)) throw new Error('Invalid light intensity.');
    if (!finite(l.exposure, 0.4, 2)) throw new Error('Invalid exposure.');
    if (!object(e) || !finite(e.outlineWidth, 0, 0.04) || !finite(e.atomOutlineFraction, 0, 0.2)
      || !finite(e.bondOutlineFraction, 0, 0.3) || typeof e.highlights !== 'boolean') throw new Error('Invalid contour settings.');
    if (!object(c) || !['basic', 'toon', 'kit'].includes(c.palette) || typeof c.elementBonds !== 'boolean' || !hex(c.bondColor)) throw new Error('Invalid coloring settings.');
    if (!object(m) || typeof m.bondsLinked !== 'boolean') throw new Error('Invalid material slots.');
    for (const target of ['atoms', 'bonds', 'surfaces']) m[target] = validateMaterial(m[target]);
    return out;
  }
  function fromLegacy(settings) {
    const out = legacy(settings['molecule.style']);
    const finish = settings['molecule.material.finish'];
    if (finish && finish !== 'inherit') {
      const polish = settings['molecule.material.polish'] ?? 0.5;
      const recipe = material({ model: finish, shininess: 2 + polish * 35, specularColor: '#777777', roughness: 0.92 - polish * 0.85,
        metalness: settings['molecule.material.metalness'] ?? 0, clearcoat: settings['molecule.material.clearcoat'] ?? 0.3,
        clearcoatRoughness: 0.15, envMapIntensity: settings['molecule.material.environment'] ?? 0,
        iridescence: settings['molecule.material.iridescence'] ?? 0 });
      out.materials.atoms = recipe; out.materials.bonds = clone(recipe);
      out.materials.bondsLinked = true;
      out.coloring.elementBonds = settings['molecule.material.elementBonds'] !== false;
      out.coloring.bondColor = out.coloring.elementBonds ? '#ffffff' : settings['molecule.material.bondColor'] || '#9b9b9b';
    }
    if (settings['molecule.material.outline'] > 0) Object.assign(out.effects, { outlineWidth: settings['molecule.material.outline'], atomOutlineFraction: 0, bondOutlineFraction: 0 });
    if (settings['lighting.custom']) Object.assign(out.lighting, { hemiColor: '#ffffff', hemiGroundColor: '#383e47',
      dirColor: '#ffffff', ambColor: '#ffffff', rimColor: '#ffffff', followTheme: false,
      hemiIntensity: settings['lighting.fill'] ?? 2, dirIntensity: settings['lighting.key'] ?? 1,
      ambIntensity: settings['lighting.ambient'] ?? 0.65, rimIntensity: settings['lighting.rim'] ?? 0 });
    if (out.materials.surfaces.model !== 'toon' || settings['surface.followMoleculeStyle'] === false) out.materials.surfaces = surfacePreset(settings['surface.materialPreset']);
    return normalize(out);
  }
  function resolvedMaterial(state, target, z = null) {
    const base = target === 'bonds' && state.materials.bondsLinked ? state.materials.atoms : state.materials[target];
    return { ...base, ...(z == null ? {} : base.byElement[z] || {}), byElement: {} };
  }
  function patchMaterial(value, patch) {
    const next = validateMaterial({ ...value, ...patch });
    for (const override of Object.values(next.byElement)) for (const key of Object.keys(patch)) delete override[key];
    if (['emissiveIntensity','emissiveColor','emissiveUsesColor'].some(key => key in patch)) {
      next.vertexEmissiveColor = null; next.vertexEmissiveIntensity = null;
    }
    return next;
  }
  function createMaterial(THREE, value, color, gradient, options = {}) {
    const d = value, col = color.clone().multiply(new THREE.Color(d.tint));
    const emissive = d.emissiveUsesColor ? col.clone().multiplyScalar(d.emissiveScale) : new THREE.Color(d.emissiveColor);
    if (d.emissiveUsesColor && d.emissiveMix) emissive.lerp(new THREE.Color(d.emissiveColor), d.emissiveMix);
    const common = { color: col, emissive, emissiveIntensity: d.emissiveIntensity, vertexColors: !!options.vertexColors };
    if (options.vertexColors) {
      if (d.vertexEmissiveColor != null) emissive.set(d.vertexEmissiveColor);
      if (d.vertexEmissiveIntensity != null) common.emissiveIntensity = d.vertexEmissiveIntensity;
    }
    let mat;
    if (d.model === 'phong') mat = new THREE.MeshPhongMaterial({ ...common, specular: d.specularColor, shininess: d.shininess });
    else if (d.model === 'toon') mat = new THREE.MeshToonMaterial({ ...common, gradientMap: gradient });
    else mat = new THREE.MeshPhysicalMaterial({ ...common, roughness: d.roughness, metalness: d.metalness,
      clearcoat: d.clearcoat, clearcoatRoughness: d.clearcoatRoughness, reflectivity: d.reflectivity,
      specularIntensity: d.specularIntensity, specularColor: d.specularColor, envMapIntensity: d.envMapIntensity,
      iridescence: d.iridescence, iridescenceIOR: 1.3, iridescenceThicknessRange: [180, 420] });
    mat.envMapIntensity = d.envMapIntensity;
    return mat;
  }
  global.VibeMolAppearanceModel = Object.freeze({ clone, material, validateMaterial, normalize, legacy, fromLegacy,
    surfacePreset, surfacePresets: SURFACE_PRESETS, resolvedMaterial, patchMaterial, createMaterial, materialLimits: MATERIAL_LIMITS });
})(window);
