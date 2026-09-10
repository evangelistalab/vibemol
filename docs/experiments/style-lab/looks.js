(function (global) {
  'use strict';
  // An isolated exploration format. Production integration should use scoped
  // VibeMol presets, with these additional renderer settings registered there.
  const KIND = 'vibemol.look-study';
  const VERSION = 1;
  const limits = Object.freeze({
    atomScale: [0.55, 1.5], bondRadius: [0.04, 0.22], smoothness: [0, 1],
    outline: [0, 0.04], key: [0, 6], fill: [0, 3], rim: [0, 6],
    exposure: [0.4, 2], environment: [0, 2], metalness: [0, 1],
    coat: [0, 1], iridescence: [0, 1], surfaceOpacity: [0.3, 1],
  });
  const colors = ['background', 'carbon', 'hydrogen', 'nitrogen', 'oxygen', 'bond', 'positive', 'negative'];
  const defaults = {
    finish: 'physical', atomScale: 1, bondRadius: 0.105, smoothness: 0.55,
    outline: 0, key: 3.2, fill: 0.65, rim: 1.3, exposure: 1,
    environment: 0.55, metalness: 0, coat: 0.25, iridescence: 0,
    surfaceOpacity: 0.86, background: '#f4f1eb', carbon: '#575d63',
    hydrogen: '#f5f0e7', nitrogen: '#446ac4', oxygen: '#c65449',
    bond: '#aaa9a5', positive: '#476fc4', negative: '#d3724f',
  };
  const definitions = [
    ['classic', 'Classic', 'The reference, refined', 'Smooth shading, fine contours, neutral bonds. Familiar, crisp, and easy to read in a paper.',
      { finish: 'phong', atomScale: 1.16, bondRadius: 0.14, smoothness: 0.28, outline: 0.007, key: 1.8, fill: 0.85, rim: 0, environment: 0, coat: 0, background: '#ffffff', carbon: '#626262', hydrogen: '#f4f4f4', bond: '#9b9b9b' }],
    ['porcelain', 'Porcelain', 'A new everyday favorite', 'Soft studio reflections and quiet color. Sculptural enough for a cover, restrained enough for everyday work.',
      { smoothness: 0.4, atomScale: 1.1, key: 3.4, fill: 0.85, rim: 1.5, environment: 0.7, coat: 0.38 }],
    ['nocturne', 'Nocturne', 'Made for the big screen', 'A graphite stage, strong edge light, and luminous orbital color. Depth without losing the molecular structure.',
      { background: '#111920', carbon: '#727c88', hydrogen: '#e2e8ee', nitrogen: '#6d9cfa', bond: '#8f9daa', positive: '#54bce1', negative: '#e8a75d', key: 4.2, fill: 0.5, rim: 4, smoothness: 0.7, environment: 0.8, metalness: 0.15, coat: 0.55, atomScale: 0.94, bondRadius: 0.085, surfaceOpacity: 0.8 }],
    ['ink', 'Ink', 'A graphic point of view', 'Banded light, confident silhouettes, and a warm paper ground. A clear visual voice for teaching and diagrams.',
      { finish: 'toon', outline: 0.021, background: '#f4eeda', carbon: '#6b7280', hydrogen: '#fff7df', nitrogen: '#3b75bd', bond: '#aaa895', positive: '#4b91b3', negative: '#df825c', key: 2, fill: 0.8, rim: 0, environment: 0, coat: 0, smoothness: 0.1, surfaceOpacity: 1 }],
    ['atelier', 'Atelier', 'Warm, tactile, unexpected', 'Mineral tones, broad highlights, and copper-colored carbon. An editorial palette for presentations and covers.',
      { background: '#e8ded1', carbon: '#a97353', hydrogen: '#f4e9d7', nitrogen: '#477c89', bond: '#9d8673', positive: '#4b8e91', negative: '#c68b4d', smoothness: 0.62, environment: 0.9, metalness: 0.32, coat: 0.35, key: 3.4, fill: 0.7, rim: 1.6, atomScale: 1.08 }],
    ['opal', 'Opal', 'An orbital showcase', 'A subtle pearlescent finish catches the light as you rotate. Best used sparingly, while keeping orbital signs distinct.',
      { background: '#171b2b', carbon: '#a8adc9', hydrogen: '#edeafa', nitrogen: '#89a4e9', bond: '#969cb4', positive: '#7aabdb', negative: '#df9ca5', smoothness: 0.88, environment: 1, iridescence: 0.7, coat: 0.8, metalness: 0.12, key: 3.6, fill: 0.4, rim: 3, atomScale: 0.9, bondRadius: 0.085, surfaceOpacity: 0.9 }],
  ];
  const builtins = Object.freeze(definitions.map(([id, name, subtitle, description, settings]) => Object.freeze({
    id, name, subtitle, description, settings: Object.freeze({ ...defaults, ...settings }),
  })));
  function validateSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The look has no appearance settings.');
    if (!['physical', 'phong', 'toon'].includes(value.finish)) throw new Error('Unknown material finish.');
    const out = { finish: value.finish };
    for (const [key, [min, max]] of Object.entries(limits)) {
      const number = value[key];
      if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max) throw new Error(`Invalid ${key} setting.`);
      out[key] = number;
    }
    for (const key of colors) {
      if (typeof value[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(value[key])) throw new Error(`Invalid ${key} color.`);
      out[key] = value[key].toLowerCase();
    }
    return out;
  }
  function serialize(name, settings) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) throw new Error('Give your look a name of 1–60 characters.');
    return { kind: KIND, version: VERSION, name: name.trim(), settings: validateSettings(settings) };
  }
  function parse(value) {
    if (!value || value.kind !== KIND || value.version !== VERSION) throw new Error('Open a Visual Style Lab look exported by this preview (version 1).');
    return serialize(value.name, value.settings);
  }
  function equal(a, b) {
    return Object.keys(defaults).every(key => a[key] === b[key]);
  }
  global.StyleLabLooks = Object.freeze({ builtins, limits, colors, validateSettings, serialize, parse, equal });
})(window);
