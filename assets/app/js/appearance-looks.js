(function (global) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const model = global.VibeMolAppearanceModel;
  const hex = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
  const number = (min, max) => value => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const choice = values => value => values.includes(value);
  const bool = value => typeof value === 'boolean';
  const surfaceColorSchemes = Object.freeze({
    emory: Object.freeze({ pos: '#ffba04', neg: '#153fc7' }),
    national: Object.freeze({ pos: '#e60000', neg: '#0033a0' }),
    bright: Object.freeze({ pos: '#ffcc00', neg: '#00bfff' }),
    electron: Object.freeze({ pos: '#ff00bf', neg: '#2eb82e' }),
    tableau: Object.freeze({ pos: '#1f77b4', neg: '#d62728' }),
  });
  const legacySurfaceSchemes = Object.freeze({ classic: 'tableau' });
  function normalizeSurfaceScheme(id) {
    return Object.hasOwn(legacySurfaceSchemes, id) ? legacySurfaceSchemes[id] : id;
  }
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
      typeof saved?.[group] === 'boolean' ? saved[group] : keys.some(key => !same(
        key === 'surface.colorScheme' ? normalizeSurfaceScheme(values[key]) : values[key],
        key === 'surface.colorScheme' ? normalizeSurfaceScheme(defaults[key]) : defaults[key]))
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
    'surface.colorScheme': ['custom', choice(['custom', ...Object.keys(surfaceColorSchemes)])],
    'surface.posColor': ['#ff8000', hex],
    'surface.negColor': ['#0066b3', hex],
    'appearance.rendering': [model.legacy('basic'), value => { try { model.normalize(value); return true; } catch { return false; } }],
  };
  const defaults = Object.fromEntries(Object.entries(fields).map(([key, [value]]) => [key, clone(value)]));
  const colorKeys = Object.freeze(['global.backgroundColor', 'global.elementColors', 'global.elementColorOverrides', ...surfaceGroups.colors]);
  function colors(value) {
    const scheme = normalizeSurfaceScheme(value['surface.colorScheme']);
    const palette = surfaceColorSchemes[scheme];
    return { ...Object.fromEntries(colorKeys.map(key => [key, clone(value[key])])),
      'surface.colorScheme': scheme,
      'surface.posColor': palette?.pos || value['surface.posColor'], 'surface.negColor': palette?.neg || value['surface.negColor'],
      coloring: clone(value['appearance.rendering'].coloring), followTheme: value['appearance.rendering'].lighting.followTheme };
  }
  function withColors(value, source) {
    const out = clone(value), palette = colors(source);
    for (const key of colorKeys) out[key] = palette[key];
    out['appearance.rendering'].coloring = palette.coloring;
    out['appearance.rendering'].lighting.followTheme = palette.followTheme;
    return out;
  }
  function colorsEqual(left, right) {
    const same = (a, b) => a && typeof a === 'object' ? b && typeof b === 'object'
      && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => same(a[key], b[key]))
      : typeof a === 'string' ? typeof b === 'string' && a.toLowerCase() === b.toLowerCase() : a === b;
    return same(colors(left), colors(right));
  }
  function settings(value, complete = true) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The look has no appearance settings.');
    if ('surface.colorScheme' in value) value = { ...value, 'surface.colorScheme': normalizeSurfaceScheme(value['surface.colorScheme']) };
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
      description: {basic:'Luminous shared finish', toon:'Banded shading and contours', kit:'Collar joints and polished materials'}[id],
      settings: Object.freeze(settings({ ...defaults, 'molecule.style': id, 'appearance.rendering': model.legacy(id),
        'surface.colorScheme': 'emory', 'surface.posColor': surfaceColorSchemes.emory.pos, 'surface.negColor': surfaceColorSchemes.emory.neg })) })),
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
  // Use the looks themselves as the source of truth for shared materials.
  // Keep only complementary finishes in the menu; older descriptors
  // remain valid in imported looks, materials, and sessions.
  const materialCatalog = [
    ...builtins.filter(look => !look.experimental).map(({ id, name, settings }) => ({
      id, name, material: settings['appearance.rendering'].material,
      surfaceMaterial: settings['appearance.rendering'].surfaceMaterial,
    })),
    ...['emissive', 'gel', 'matte', 'metal'].map(id => ({
      id, name: id[0].toUpperCase() + id.slice(1),
      // Legacy surface recipes disabled emission on phase-colored geometry.
      // Shared materials use the same fill on atoms, bonds, and phase surfaces.
      material: { ...model.surfacePreset(id), vertexEmissiveColor: null, vertexEmissiveIntensity: null }, surfaceMaterial: null,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const materialFamilies = Object.freeze([
    { id: 'physical', name: 'Physical', defaultRecipe: 'basic' },
    { id: 'phong', name: 'Smooth (Phong)', defaultRecipe: 'classic' },
    { id: 'toon', name: 'Toon', defaultRecipe: 'toon' },
  ].map(Object.freeze));
  const materialPresets = Object.freeze(materialCatalog.map(({ id, name, material }) => Object.freeze({ id, name, family: material.model })));
  function materialRecipe(id) {
    const recipe = materialCatalog.find(item => item.id === id);
    if (!recipe) throw new Error('Unknown material recipe.');
    return clone({ material: recipe.material, surfaceMaterial: recipe.surfaceMaterial });
  }
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
      // A resolved descriptor is authoritative; this tag only serves legacy
      // exports. Compare the material's active shader parameters, not its
      // dormant channels or compatibility tag.
      if (key === 'surface.materialPreset' && a['appearance.rendering'] && b['appearance.rendering']) return true;
      if (key === 'appearance.rendering' && a[key] && b[key]) {
        return Object.keys(a[key]).length === Object.keys(b[key]).length && Object.keys(a[key]).every(part =>
          ['material', 'surfaceMaterial'].includes(part) ? model.materialEqual(a[key][part], b[key][part]) : same(a[key][part], b[key][part]));
      }
      if (key === 'global.elementColorOverrides') {
        const left = a[key] || {}, right = b[key] || {};
        return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(k => left[k] === right[k]);
      }
      return same(a[key], b[key]);
    });
  }
  // Keep the style/color partition identical to the renderer's composition.
  function styleEqual(a, b) { return equal(a, withColors(b, a)); }
  function baseline(styleSettings, colorSettings) { return withColors(styleSettings, colorSettings); }
  const sameReference = (a, b) => !!a && !!b && a.kind === b.kind && a.id === b.id;
  function normalizeReferenceState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid appearance references.');
    const ref = value => {
      if (value === null) return null;
      if (!value || !['builtin', 'user'].includes(value.kind) || typeof value.id !== 'string'
        || !/^[a-z0-9-]{1,80}$/.test(value.id)) throw new Error('Invalid appearance reference.');
      return { kind: value.kind, id: value.id };
    };
    const out = { styleRef: ref(value.styleRef), colorsRef: ref(value.colorsRef) };
    if (value.looks !== undefined) {
      if (!Array.isArray(value.looks) || value.looks.length > 2) throw new Error('Invalid referenced look definitions.');
      out.looks = value.looks.map(normalizeLook);
      if (out.looks.some(look => builtins.some(item => item.id === look.id))
        || new Set(out.looks.map(look => look.id)).size !== out.looks.length) throw new Error('Invalid referenced look identifiers.');
    }
    return out;
  }
  function createReferenceController() {
    let refs = { styleRef: { kind: 'builtin', id: 'basic' }, colorsRef: { kind: 'builtin', id: 'basic' } };
    let library = [], retained = [];
    const reference = look => ({ kind: builtins.some(item => item.id === look.id) ? 'builtin' : 'user', id: look.id });
    const resolve = ref => !ref ? null : (ref.kind === 'builtin' ? builtins : [...library, ...retained]).find(look => look.id === ref.id) || null;
    const get = () => clone(refs);
    function reconcile() {
      for (const key of ['styleRef', 'colorsRef']) if (!resolve(refs[key])) refs[key] = null;
    }
    function select(look, axis = 'both') {
      const value = normalizeLook(look), ref = reference(value);
      if (ref.kind === 'user') retained = [...retained.filter(item => item.id !== value.id), value];
      if (axis !== 'colors') refs.styleRef = ref;
      if (axis !== 'style') refs.colorsRef = ref;
    }
    function restore(value, { prune = true } = {}) {
      const normalized = normalizeReferenceState(value);
      retained = normalized.looks || [];
      refs = { styleRef: normalized.styleRef, colorsRef: normalized.colorsRef };
      if (prune) reconcile();
    }
    function exportState() {
      const looks = [];
      for (const ref of [refs.styleRef, refs.colorsRef]) {
        const look = resolve(ref);
        if (ref?.kind === 'user' && look && !looks.some(item => item.id === look.id)) looks.push(clone(look));
      }
      return { ...get(), ...(looks.length ? { looks } : {}) };
    }
    // The only preset matching path: run once for an old settings file/load.
    function migrate(live, recordedLook) {
      retained = [];
      if (recordedLook?.id && !builtins.some(look => look.id === recordedLook.id)
        && !library.some(look => look.id === recordedLook.id)) {
        try { retained.push(normalizeLook(recordedLook)); } catch { /* An unavailable legacy name has no baseline. */ }
      }
      const users = [...library, ...retained.filter(look => !library.some(item => item.id === look.id))].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      const choices = [...builtins, ...users];
      const styles = choices.filter(look => styleEqual(live, look.settings));
      const style = recordedLook?.id ? choices.find(look => look.id === recordedLook.id) : styles.length === 1 ? styles[0] : null;
      const colors = choices.filter(look => colorsEqual(live, look.settings));
      const color = colors.find(look => look.id === style?.id) || colors[0];
      refs = { styleRef: style ? reference(style) : null, colorsRef: color ? reference(color) : null };
      return get();
    }
    function project(live) {
      const style = resolve(refs.styleRef), colors = resolve(refs.colorsRef);
      const label = style && colors && sameReference(refs.styleRef, refs.colorsRef) ? style.name
        : !style && !colors ? 'Custom' : `${style ? style.name : 'Custom'} style · ${colors ? colors.name : 'Custom'} colors`;
      return { ...get(), styleModified: !!style && !styleEqual(live, style.settings),
        colorsModified: !!colors && !colorsEqual(live, colors.settings), label,
        baseline: baseline(style?.settings || live, colors?.settings || live) };
    }
    return Object.freeze({ get, resolve, reference, select, restore, exportState, migrate, project, reconcile,
      setLibrary: looks => { library = looks.map(normalizeLook); },
      remove: id => {
        library = library.filter(look => look.id !== id); retained = retained.filter(look => look.id !== id);
        for (const key of ['styleRef', 'colorsRef']) if (refs[key]?.kind === 'user' && refs[key].id === id) refs[key] = null;
      } });
  }
  function exportLook(look) {
    const value = normalizeLook(look);
    const resolved = colors(value.settings);
    for (const key of surfaceGroups.colors) value.settings[key] = resolved[key];
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
  global.VibeMolLooks = Object.freeze({ builtins, materialFamilies, materialPresets, materialRecipe, fields, cameraFields, surfaceGroups, surfaceOverrides,
    extra, defaults, surfaceColorSchemes, normalizeSurfaceScheme, colorKeys, colors, withColors, colorsEqual, styleEqual, baseline,
    sameReference, normalizeReferenceState, createReferenceController, settings, normalizeLook, equal, exportLook, importLook, isLookPreset });
})(window);
