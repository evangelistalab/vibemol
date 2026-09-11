(function (global) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
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
    'surface.materialPreset': ['emissive', choice(['emissive', 'matte', 'satin', 'enamel', 'lacquer', 'metal', 'gel', 'ceramic'])],
    'surface.opacity': [1, number(0.05, 1)],
    'surface.colorScheme': ['custom', choice(['custom', 'emory', 'national', 'bright', 'electron', 'classic'])],
    'surface.posColor': ['#ff8000', hex],
    'surface.negColor': ['#0066b3', hex],
    'render.dof.enabled': [false, bool],
    'render.dof.focusMode': ['auto', choice(['auto', 'manual'])],
    'render.dof.focusDistance': [8, number(0.5, 80)],
    'render.dof.focusRange': [1.5, number(0.1, 20)],
    'render.dof.blurAmount': [4, number(0, 12)],
    ...extra,
  };
  const defaults = Object.fromEntries(Object.entries(fields).map(([key, [value]]) => [key, clone(value)]));
  function settings(value, complete = true) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The look has no appearance settings.');
    const out = {};
    for (const [key, [, validate]] of Object.entries(fields)) {
      if (!(key in value)) { if (complete) throw new Error(`Missing look setting: ${key}`); else continue; }
      if (!validate(value[key])) throw new Error(`Invalid look setting: ${key}`);
      out[key] = clone(value[key]);
    }
    return out;
  }
  const palette = (carbon, hydrogen, nitrogen, oxygen = '#c65449') => ({ 1: hydrogen, 6: carbon, 7: nitrogen, 8: oxygen });
  function recipe(id, name, description, patch) {
    return Object.freeze({ id, name, description, revision: 1, settings: Object.freeze(settings({
      ...defaults, 'molecule.material.finish': 'physical', 'lighting.custom': true,
      'molecule.material.elementBonds': false, 'surface.followMoleculeStyle': false,
      ...patch,
    })) });
  }
  const builtins = Object.freeze([
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
    const out = { id: value.id, name: value.name.trim(), revision: 1, settings: settings(value.settings) };
    if (value.thumbnail != null) {
      if (typeof value.thumbnail !== 'string' || value.thumbnail.length > 90000 || !/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(value.thumbnail)) throw new Error('Invalid look thumbnail.');
      out.thumbnail = value.thumbnail;
    }
    return out;
  }
  function equal(a, b) {
    return Object.keys(fields).every(key => {
      if (key === 'global.elementColorOverrides') {
        const left = a[key] || {}, right = b[key] || {};
        return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(k => left[k] === right[k]);
      }
      return typeof a[key] === 'number' ? Math.abs(a[key] - b[key]) < 1e-8 : a[key] === b[key];
    });
  }
  function exportLook(look) {
    const value = normalizeLook(look);
    return { kind: 'vibemol.preset', presetVersion: 1, name: value.name, meta: { lookVersion: 1 },
      settings: { ...value.settings, 'appearance.look': value } };
  }
  function importLook(value) {
    if (!value || value.kind !== 'vibemol.preset' || value.presetVersion !== 1 || value.meta?.lookVersion !== 1) throw new Error('Choose a VibeMol look made with Export look.');
    const look = normalizeLook(value.settings?.['appearance.look']);
    look.settings = settings(value.settings);
    return look;
  }
  function createMaterial(THREE, state, color, gradientMap, bond = false) {
    const finish = state['molecule.material.finish'];
    if (finish === 'inherit') return null;
    const polish = state['molecule.material.polish'];
    let mat;
    if (finish === 'phong') mat = new THREE.MeshPhongMaterial({ color, specular: 0x777777, shininess: 2 + polish * 35 });
    else if (finish === 'toon') mat = new THREE.MeshToonMaterial({ color, gradientMap });
    else mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.92 - polish * 0.85,
      metalness: state['molecule.material.metalness'], clearcoat: state['molecule.material.clearcoat'],
      clearcoatRoughness: 0.15, envMapIntensity: state['molecule.material.environment'],
      iridescence: state['molecule.material.iridescence'], iridescenceIOR: 1.3, iridescenceThicknessRange: [180, 420] });
    if (bond) mat.vertexColors = state['molecule.material.elementBonds'];
    return mat;
  }
  global.VibeMolLooks = Object.freeze({ builtins, fields, extra, defaults, settings, normalizeLook, equal, exportLook, importLook, createMaterial });
})(window);
