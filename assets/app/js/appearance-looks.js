(function (global) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const model = global.VibeMolAppearanceModel;
  const hex = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
  const number = (min, max) => value => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const choice = values => value => values.includes(value);
  const bool = value => typeof value === 'boolean';
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
    'molecule.opacity.atom': [1, number(0.05, 1)],
    'molecule.opacity.bond': [1, number(0.05, 1)],
    'molecule.feature.shadows': [false, bool],
    'molecule.feature.fog': [false, bool],
    'molecule.feature.fog.depth': [14, number(6, 40)],
    'molecule.feature.ink': [false, bool],
    'molecule.feature.blackbody.enabled': [false, bool],
    'molecule.feature.blackbody.coldColor': ['#2f0202', hex],
    'molecule.feature.blackbody.hotColor': ['#eaf6ff', hex],
    'global.backgroundColor': ['#ffffff', hex],
    'global.elementColors': [true, bool],
    'global.elementColorOverrides': [{}, value => value && typeof value === 'object' && !Array.isArray(value)
      && Object.entries(value).every(([key, color]) => /^(0|[1-9]\d{0,2})$/.test(key) && +key <= 118 && hex(color))],
    'surface.materialPreset': ['emissive', choice(Object.keys(model.surfacePresets))],
    'surface.opacity': [1, number(0.05, 1)],
    'surface.colorScheme': ['custom', choice(['custom', 'emory', 'national', 'bright', 'electron', 'classic'])],
    'surface.posColor': ['#ff8000', hex],
    'surface.negColor': ['#0066b3', hex],
    'render.dof.enabled': [false, bool],
    'render.dof.focusMode': ['auto', choice(['auto', 'manual'])],
    'render.dof.focusDistance': [8, number(0.5, 80)],
    'render.dof.focusRange': [1.5, number(0.1, 20)],
    'render.dof.blurAmount': [4, number(0, 12)],
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
  const palette = (carbon, hydrogen, nitrogen, oxygen = '#c65449') => ({ 1: hydrogen, 6: carbon, 7: nitrogen, 8: oxygen });
  function recipe(id, name, description, patch) {
    const legacySettings = {
      ...defaults, 'molecule.material.finish': 'physical', 'lighting.custom': true,
      'molecule.material.elementBonds': false, 'surface.followMoleculeStyle': false,
      ...patch,
    };
    delete legacySettings['appearance.rendering'];
    return Object.freeze({ id, name, description, revision: 2, experimental: true, settings: Object.freeze(settings(legacySettings)) });
  }
  const builtins = Object.freeze([
    ...['basic', 'toon', 'kit'].map(id => Object.freeze({ id, name: id[0].toUpperCase() + id.slice(1), revision: 2,
      description: {basic:'Original smooth rendering', toon:'Banded shading and contours', kit:'Collar joints and polished materials'}[id],
      settings: Object.freeze(settings({ ...defaults, 'molecule.style': id, 'appearance.rendering': model.legacy(id),
        'surface.colorScheme': 'emory', 'surface.posColor': '#f2a900', 'surface.negColor': '#0033a0' })) })),
    recipe('classic', 'Classic', 'Familiar figures', {
      'molecule.material.finish': 'phong', 'molecule.material.polish': 0.28, 'molecule.material.outline': 0.006,
      'molecule.atomRadiusScale': 1.16, 'molecule.bondRadiusScale': 1.4,
      'global.elementColorOverrides': palette('#626262', '#f4f4f4', '#446ac4'),
      'lighting.key': 1.4, 'lighting.fill': 0.9, 'lighting.ambient': 0.35,
      'surface.materialPreset': 'enamel',
    }),
    recipe('porcelain', 'Porcelain', 'Soft studio shading', {
      'global.backgroundColor': '#f4f1eb', 'global.elementColorOverrides': palette('#575d63', '#f5f0e7', '#446ac4'),
      'molecule.atomRadiusScale': 1.1, 'molecule.material.polish': 0.4,
      'molecule.material.environment': 0.55, 'molecule.material.clearcoat': 0.38,
      'lighting.key': 2.0, 'lighting.fill': 0.85, 'lighting.ambient': 0.25, 'lighting.rim': 1,
      'surface.materialPreset': 'satin',
    }),
    recipe('nocturne', 'Nocturne', 'Dark presentations', {
      'global.backgroundColor': '#111920', 'global.elementColorOverrides': palette('#727c88', '#e2e8ee', '#6d9cfa'),
      'molecule.atomRadiusScale': 0.94, 'molecule.bondRadiusScale': 0.86,
      'molecule.material.bondColor': '#8f9daa', 'molecule.material.polish': 0.7,
      'molecule.material.environment': 0.6, 'molecule.material.metalness': 0.15, 'molecule.material.clearcoat': 0.55,
      'lighting.key': 2.8, 'lighting.fill': 0.5, 'lighting.ambient': 0.2, 'lighting.rim': 2.8,
      'surface.posColor': '#e8a75d', 'surface.negColor': '#54bce1',
    }),
    recipe('ink', 'Ink', 'Teaching & diagrams', {
      'molecule.material.finish': 'toon', 'molecule.material.outline': 0.018,
      'global.backgroundColor': '#f4eeda', 'global.elementColorOverrides': palette('#6b7280', '#fff7df', '#3b75bd'),
      'molecule.material.bondColor': '#aaa895', 'lighting.key': 1.8, 'lighting.fill': 0.8, 'lighting.ambient': 0.2,
      'surface.posColor': '#df825c', 'surface.negColor': '#4b91b3',
    }),
    recipe('atelier', 'Atelier', 'Warm mineral palette', {
      'global.backgroundColor': '#e8ded1', 'global.elementColorOverrides': palette('#a97353', '#f4e9d7', '#477c89'),
      'molecule.atomRadiusScale': 1.08, 'molecule.material.bondColor': '#9d8673', 'molecule.material.polish': 0.62,
      'molecule.material.environment': 0.7, 'molecule.material.metalness': 0.32, 'molecule.material.clearcoat': 0.35,
      'lighting.key': 2.2, 'lighting.fill': 0.7, 'lighting.ambient': 0.25, 'lighting.rim': 1.1,
      'surface.posColor': '#c68b4d', 'surface.negColor': '#4b8e91', 'surface.materialPreset': 'enamel',
    }),
    recipe('opal', 'Opal', 'Pearlescent showcase', {
      'global.backgroundColor': '#171b2b', 'global.elementColorOverrides': palette('#a8adc9', '#edeafa', '#89a4e9'),
      'molecule.atomRadiusScale': 0.9, 'molecule.bondRadiusScale': 0.86, 'molecule.material.bondColor': '#969cb4',
      'molecule.material.polish': 0.88, 'molecule.material.environment': 0.8, 'molecule.material.iridescence': 0.7,
      'molecule.material.clearcoat': 0.8, 'molecule.material.metalness': 0.12,
      'lighting.key': 2.4, 'lighting.fill': 0.4, 'lighting.ambient': 0.2, 'lighting.rim': 2.2,
      'surface.posColor': '#df9ca5', 'surface.negColor': '#7aabdb', 'surface.materialPreset': 'enamel',
    }),
  ]);
  function normalizeLook(value) {
    if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 60) throw new Error('Give the look a name of 1–60 characters.');
    if (typeof value.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(value.id)) throw new Error('Invalid look identifier.');
    const out = { id: value.id, name: value.name.trim(), revision: 2, settings: settings(value.settings) };
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
    return { kind: 'vibemol.preset', presetVersion: 1, name: value.name, meta: { lookVersion: 2 },
      settings: { ...value.settings, 'appearance.look': value } };
  }
  function importLook(value) {
    if (!value || value.kind !== 'vibemol.preset' || value.presetVersion !== 1 || ![1, 2].includes(value.meta?.lookVersion)) throw new Error('Choose a VibeMol look made with Export look.');
    if (value.meta.lookVersion === 2 && !value.settings?.['appearance.rendering']) throw new Error('The look has no rendering components.');
    const look = normalizeLook(value.settings?.['appearance.look']);
    look.settings = settings(value.settings);
    return look;
  }
  global.VibeMolLooks = Object.freeze({ builtins, fields, extra, defaults, settings, normalizeLook, equal, exportLook, importLook });
})(window);
