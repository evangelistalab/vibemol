(function (global) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const model = global.VibeMolAppearanceModel;
  const hex = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
  const number = (min, max) => value => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const choice = values => value => values.includes(value);
  const bool = value => typeof value === 'boolean';
  const cameraFields = {
    'render.dof.enabled': [false, bool],
    'render.dof.focusMode': ['auto', choice(['auto', 'manual'])],
    'render.dof.focusDistance': [8, number(0.5, 80)],
    'render.dof.focusRange': [1.5, number(0.1, 20)],
    'render.dof.blurAmount': [4, number(0, 12)],
  };
  const surfaceGroups = Object.freeze({
    colors: Object.freeze(['surface.colorScheme', 'surface.posColor', 'surface.negColor']),
    opacity: Object.freeze(['surface.opacity']),
  });
  function surfaceOverrides(values, defaults, saved) {
    const same = (a, b) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-8
      : typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : a === b;
    return Object.fromEntries(Object.entries(surfaceGroups).map(([group, keys]) => [group,
      typeof saved?.[group] === 'boolean' ? saved[group] : keys.some(key => !same(values[key], defaults[key]))
    ]));
  }
  const extra = {
    'molecule.material.finish': ['inherit', choice(['inherit', 'phong', 'physical', 'toon'])],
    'molecule.material.polish': [0.5, number(0, 1)],
    'molecule.material.environment': [0, number(0, 2)],
    'molecule.material.metalness': [0, number(0, 1)],
    'molecule.material.clearcoat': [0.3, number(0, 1)],
    'molecule.material.iridescence': [0, number(0, 1)],
    'molecule.material.outline': [0, number(0, 0.04)],
    'molecule.material.elementBonds': [true, bool],
    'molecule.material.bondColor': ['#9b9b9b', hex],
    'lighting.custom': [false, bool],
    'lighting.key': [1, number(0, 6)],
    'lighting.fill': [2, number(0, 3)],
    'lighting.ambient': [0.65, number(0, 2)],
    'lighting.rim': [0, number(0, 6)],
    'surface.followMoleculeStyle': [true, bool],
  };
  const fields = {
    'molecule.style': ['basic', choice(['basic', 'toon', 'kit'])],
    'molecule.atomRadiusScale': [1, number(0.6, 1.6)],
    'molecule.bondRadiusScale': [1, number(0.6, 1.6)],
    'molecule.feature.shadows': [true, bool],
    'molecule.feature.fog': [false, bool],
    'molecule.feature.fog.depth': [14, number(6, 40)],
    'global.backgroundColor': ['#ffffff', hex],
    'global.elementColors': [true, bool],
    'global.elementColorOverrides': [{}, value => value && typeof value === 'object' && !Array.isArray(value)
      && Object.entries(value).every(([key, color]) => /^(0|[1-9]\d{0,2})$/.test(key) && +key <= 118 && hex(color))],
    'surface.materialPreset': ['emissive', choice(Object.keys(model.surfacePresets))],
    'surface.opacity': [1, number(0.05, 1)],
    'surface.colorScheme': ['custom', choice(['custom', 'emory', 'national', 'bright', 'electron', 'classic'])],
    'surface.posColor': ['#ff8000', hex],
    'surface.negColor': ['#0066b3', hex],
    'appearance.rendering': [model.legacy('basic'), value => { try { model.normalize(value); return true; } catch { return false; } }],
  };
  const defaults = Object.fromEntries(Object.entries(fields).map(([key, [value]]) => [key, clone(value)]));
  function settings(value, complete = true) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The look has no appearance settings.');
    if (complete && !('appearance.rendering' in value)) value = { ...value, 'appearance.rendering': model.fromLegacy(value) };
    const out = {};
    for (const [key, [, validate]] of Object.entries(fields)) {
      if (!(key in value)) { if (complete) throw new Error(`Missing look setting: ${key}`); else continue; }
      if (!validate(value[key])) throw new Error(`Invalid look setting: ${key}`);
      out[key] = key === 'appearance.rendering' ? model.normalize(value[key]) : clone(value[key]);
    }
    return out;
  }
  // These recipes use the standalone Style Lab's lighting, material response,
  // display radii, and colors as a base. Camera and scientific data stay outside a look.
  function studioRecipe(id, name, description, patch, experimental = false) {
    const s = { finish: 'physical', atomScale: 1, bondRadius: 0.105, smoothness: 0.55,
      outline: 0, key: 3.2, fill: 0.65, rim: 1.3, exposure: 1,
      environment: 0.55, metalness: 0, coat: 0.25, iridescence: 0,
      background: '#f4f1eb', carbon: '#575d63', hydrogen: '#f5f0e7', nitrogen: '#446ac4', oxygen: '#c65449',
      bond: '#aaa9a5', colorScheme: 'custom', positive: '#476fc4', negative: '#d3724f', ...patch };
    const rendering = model.legacy('basic');
    Object.assign(rendering.geometry, { atomScaleMain: s.atomScale, atomScaleTransitionMetal: s.metalScale ?? s.atomScale,
      atomRadii: {1:0.28,6:0.43,7:0.42,8:0.4}, bondRadius: s.bondRadius,
      sphereWidthSegments: 64, sphereHeightSegments: 40, bondRadialSegments: 36, bondHeightSegments: 1 });
    Object.assign(rendering.lighting, { hemiColor:'#ffffff', hemiGroundColor:s.finish==='phong'?'#777777':'#383e47', hemiIntensity:s.fill,
      dirColor:'#ffffff', dirIntensity:s.key, dirPos:[-3.5,5,7], ambIntensity:0,
      rimColor:'#ffffff', rimIntensity:s.rim, rimPos:[3.5,2,-5], exposure:s.exposure,
      toneMapping:s.finish==='phong'?'none':'aces', followTheme:false });
    rendering.coloring = {palette:'basic',elementBonds:false,bondColor:s.bond};
    rendering.effects.outlineWidth = s.outline;
    rendering.material = model.material({ model:s.finish, roughness:0.92-s.smoothness*0.85,
      shininess:2+s.smoothness*35, specularColor:s.finish==='phong'?'#777777':'#ffffff',
      metalness:s.metalness, clearcoat:s.coat, clearcoatRoughness:0.22, envMapIntensity:s.environment,
      iridescence:s.iridescence, iridescenceThicknessRange:[130,380], toonSteps:[70,150,210,255] });
    rendering.surfaceMaterial = null;
    return Object.freeze({ id,name,description,revision:4,experimental,settings:Object.freeze(settings({ ...defaults,
      'appearance.rendering':rendering,
      'global.backgroundColor':s.background, 'global.elementColorOverrides':{1:s.hydrogen,6:s.carbon,7:s.nitrogen,8:s.oxygen},
      'surface.colorScheme':s.colorScheme, 'surface.posColor':s.positive, 'surface.negColor':s.negative })) });
  }
  const builtins = Object.freeze([
    ...['basic', 'toon', 'kit'].map(id => Object.freeze({ id, name: id[0].toUpperCase() + id.slice(1), revision: 4,
      description: {basic:'Original smooth rendering', toon:'Banded shading and contours', kit:'Collar joints and polished materials'}[id],
      settings: Object.freeze(settings({ ...defaults, 'molecule.style': id, 'appearance.rendering': model.legacy(id),
        'surface.colorScheme': 'emory', 'surface.posColor': '#f2a900', 'surface.negColor': '#0033a0' })) })),
    studioRecipe('classic','Classic','Familiar figures', { finish:'phong', atomScale:1, metalScale:1.15, bondRadius:0.11,
      smoothness:0.28, outline:0.007, key:1.8, fill:0.85, rim:0, environment:0, coat:0,
      background:'#ffffff', carbon:'#626262', hydrogen:'#f4f4f4', bond:'#9b9b9b',
      colorScheme:'national', positive:'#e60000', negative:'#0033a0' }),
    studioRecipe('porcelain','Porcelain','Soft studio shading', { smoothness:0.4, atomScale:1.1,
      key:3.4, fill:0.85, rim:1.5, environment:0.7, coat:0.38 }),
    studioRecipe('ink','Ink','Teaching & diagrams', { finish:'toon', outline:0.021,
      background:'#f4eeda', carbon:'#6b7280', hydrogen:'#fff7df', nitrogen:'#3b75bd', bond:'#aaa895',
      positive:'#4b91b3', negative:'#df825c', key:2, fill:0.8, rim:0, environment:0, coat:0, smoothness:0.1 }),
    studioRecipe('opal','Opal','Pearlescent showcase', { background:'#171b2b', carbon:'#a8adc9', hydrogen:'#edeafa',
      nitrogen:'#89a4e9', bond:'#969cb4', positive:'#7aabdb', negative:'#df9ca5', smoothness:0.88,
      environment:1, iridescence:0.7, coat:0.8, metalness:0.12, key:3.6, fill:0.4, rim:3, atomScale:0.9, bondRadius:0.085 }),
    studioRecipe('nocturne','Nocturne','Dark presentations', { background:'#111920', carbon:'#727c88', hydrogen:'#e2e8ee',
      nitrogen:'#6d9cfa', bond:'#8f9daa', positive:'#54bce1', negative:'#e8a75d', key:4.2, fill:0.5, rim:4,
      smoothness:0.7, environment:0.8, metalness:0.15, coat:0.55, atomScale:0.94, bondRadius:0.085 },true),
    studioRecipe('atelier','Atelier','Warm mineral palette', { background:'#e8ded1', carbon:'#a97353', hydrogen:'#f4e9d7',
      nitrogen:'#477c89', bond:'#9d8673', positive:'#4b8e91', negative:'#c68b4d', smoothness:0.62,
      environment:0.9, metalness:0.32, coat:0.35, key:3.4, fill:0.7, rim:1.6, atomScale:1.08 },true),
  ]);
  function normalizeLook(value) {
    if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 60) throw new Error('Give the look a name of 1–60 characters.');
    if (typeof value.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(value.id)) throw new Error('Invalid look identifier.');
    const out = { id: value.id, name: value.name.trim(), revision: 4, settings: settings(value.settings) };
    if (value.thumbnail != null) {
      if (typeof value.thumbnail !== 'string' || value.thumbnail.length > 90000 || !/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(value.thumbnail)) throw new Error('Invalid look thumbnail.');
      out.thumbnail = value.thumbnail;
    }
    return out;
  }
  function equal(a, b) {
    const same = (x, y) => typeof x === 'number' ? typeof y === 'number' && Math.abs(x-y) < 1e-8
      : x && typeof x === 'object' ? y && typeof y === 'object' && Object.keys(x).length === Object.keys(y).length && Object.keys(x).every(key => same(x[key],y[key])) : x === y;
    return Object.keys(fields).every(key => {
      if (key === 'global.elementColorOverrides') {
        const left = a[key] || {}, right = b[key] || {};
        return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(k => left[k] === right[k]);
      }
      return same(a[key], b[key]);
    });
  }
  function exportLook(look) {
    const value = normalizeLook(look);
    return { kind: 'vibemol.preset', presetVersion: 1, name: value.name, meta: { lookVersion: 4 },
      settings: { ...value.settings, 'appearance.look': value } };
  }
  function importLook(value) {
    if (!value || value.kind !== 'vibemol.preset' || value.presetVersion !== 1 || ![1, 2, 3, 4].includes(value.meta?.lookVersion)) throw new Error('Choose a VibeMol look made with Export look.');
    if (value.meta.lookVersion >= 2 && !value.settings?.['appearance.rendering']) throw new Error('The look has no rendering components.');
    const look = normalizeLook(value.settings?.['appearance.look']);
    look.settings = settings(value.settings);
    return look;
  }
  function isLookPreset(value) {
    // Older general exports could retain look metadata. Their view/scientific
    // settings still identify a full preset and must keep their original scope.
    return value?.meta?.lookVersion != null && Object.keys(value.settings || {}).every(key =>
      key in fields || key in cameraFields || key in extra || key === 'appearance.look');
  }
  global.VibeMolLooks = Object.freeze({ builtins, fields, cameraFields, surfaceGroups, surfaceOverrides,
    extra, defaults, settings, normalizeLook, equal, exportLook, importLook, isLookPreset });
})(window);
