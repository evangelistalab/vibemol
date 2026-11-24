(function (global) {
  'use strict';

  function invalid(field, condition) {
    const error = new TypeError(`Invalid ${field}: ${condition}.`);
    error.field = field;
    throw error;
  }

  function validName(name) {
    return typeof name === 'string' && name.trim().length > 0;
  }

  function validColor(color) {
    return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color);
  }

  function isVector(value) {
    return Array.isArray(value) && value.length === 3 && [...value].every(Number.isFinite);
  }

  function magnitude(value) {
    return Math.hypot(...value);
  }

  function resolvedScale(input, lengthField, longest) {
    const hasScale = input.scale !== undefined;
    const hasLength = input[lengthField] !== undefined;
    if (hasScale === hasLength) invalid('scale', `provide exactly one of scale and ${lengthField}`);
    if (hasScale && !(Number.isFinite(input.scale) && input.scale > 0)) {
      invalid('scale', 'expected a positive finite number');
    }
    if (hasLength && !(Number.isFinite(input[lengthField]) && input[lengthField] > 0 && input[lengthField] <= 20)) {
      invalid(lengthField, 'expected a length greater than zero and at most 20 Å');
    }
    const scale = hasScale ? input.scale : longest === 0 ? 1 : input[lengthField] / longest;
    if (!(Number.isFinite(scale) && scale > 0 && Number.isFinite(scale * longest))) {
      invalid(hasScale ? 'scale' : lengthField, 'the resulting length and scale must be finite');
    }
    return scale;
  }

  function vectorName(name) {
    if (!validName(name)) invalid('name', 'expected a nonempty name');
    return name.trim();
  }

  function describe(vol) {
    const atomSets = vol.xyzVectors?.sets || [];
    const arrowItems = vol.arrows?.items || [];
    const sets = atomSets.map(({ name, color, scale }, index) => {
      const values = vol.atoms.map(atom => vol.xyzVectors.byAtomId[atom.id]?.[index]?.slice() || [0, 0, 0]);
      const longest = values.reduce((max, value) => Math.max(max, magnitude(value)), 0);
      return { name, kind: 'atoms', color, scale, values, drawnMaxLengthAngstrom: scale * longest };
    });
    for (const arrow of arrowItems) {
      sets.push({ ...arrow, kind: 'arrow', vector: arrow.vector.slice(),
        ...(arrow.origin ? { origin: arrow.origin.slice() } : {}),
        drawnMaxLengthAngstrom: arrow.scale * magnitude(arrow.vector) });
    }
    return { atomicNumbers: vol.atoms.map(atom => atom.Z), sets };
  }

  function atomSetPlan(vol, input) {
    const name = vectorName(input.name);
    if (!validColor(input.color)) invalid('color', 'expected #RRGGBB');
    if (vol.arrows?.items.some(arrow => arrow.name === name)) invalid('name', 'already used by a free arrow');
    if (!Array.isArray(input.values) || input.values.length !== vol.atoms.length || ![...input.values].every(isVector)) {
      invalid('values', 'expected one finite 3-vector per atom in structure order');
    }
    if (input.atomicNumbers !== undefined && (!Array.isArray(input.atomicNumbers)
        || input.atomicNumbers.length !== vol.atoms.length
        || vol.atoms.some((atom, index) => atom.Z !== input.atomicNumbers[index]))) {
      invalid('atomicNumbers', 'expected the exact atomic number sequence in structure order');
    }
    const longest = input.values.reduce((max, value) => Math.max(max, magnitude(value)), 0);
    const scale = resolvedScale(input, 'maxLength', longest);
    const sets = vol.xyzVectors?.sets.slice() || [];
    const matching = sets.findIndex(set => set.name === name);
    const index = matching < 0 ? sets.length : matching;
    sets[index] = { name, color: input.color, scale };
    const byAtomId = Object.fromEntries(vol.atoms.map((atom, row) => {
      const old = vol.xyzVectors?.byAtomId[atom.id];
      const vectors = sets.map((_, column) => column === index ? input.values[row].slice()
        : old?.[column]?.slice() || [0, 0, 0]);
      return [atom.id, vectors];
    }));
    return { xyzVectors: { sets, byAtomId }, arrows: vol.arrows };
  }

  function arrowShape(arrow) {
    if (!['centerOfMass', 'point'].includes(arrow.anchor)) invalid('anchor', 'expected centerOfMass or point');
    const needsOrigin = arrow.anchor === 'point';
    if (needsOrigin ? !isVector(arrow.origin) : Object.hasOwn(arrow, 'origin')) {
      invalid('origin', 'provide a finite 3-vector in Å exactly when anchor is point');
    }
    if (!isVector(arrow.vector)) invalid('vector', 'expected a finite 3-vector');
    if (!['tip', 'both'].includes(arrow.heads)) invalid('heads', 'expected tip or both');
  }

  function arrowPlan(vol, input) {
    const name = vectorName(input.name);
    if (!validColor(input.color)) invalid('color', 'expected #RRGGBB');
    if (vol.xyzVectors?.sets.some(set => set.name === name)) invalid('name', 'already used by an atom vector set');
    const { anchor = 'centerOfMass', heads = 'tip', vector } = input;
    const shape = { anchor, heads, vector, ...(Object.hasOwn(input, 'origin') ? { origin: input.origin } : {}) };
    arrowShape(shape);
    const scale = resolvedScale(input, 'length', magnitude(vector));
    const arrow = { name, color: input.color, scale, anchor, heads, vector: vector.slice(),
      ...(anchor === 'point' ? { origin: input.origin.slice() } : {}) };
    const items = vol.arrows?.items.slice() || [];
    const index = items.findIndex(item => item.name === name);
    items[index < 0 ? items.length : index] = arrow;
    return { xyzVectors: vol.xyzVectors, arrows: { items } };
  }

  function remove(vol, input) {
    const name = vectorName(input.name);
    const sets = vol.xyzVectors?.sets;
    const index = sets?.findIndex(set => set.name === name) ?? -1;
    if (index >= 0) {
      const remaining = sets.filter((_, n) => n !== index);
      const byAtomId = Object.fromEntries(Object.entries(vol.xyzVectors.byAtomId).map(([id, row]) => [
        id, row.filter((_, n) => n !== index),
      ]));
      return { xyzVectors: remaining.length ? { sets: remaining, byAtomId } : undefined, arrows: vol.arrows };
    }
    const items = vol.arrows?.items.filter(arrow => arrow.name !== name);
    return { xyzVectors: vol.xyzVectors, arrows: items?.length ? { items } : undefined };
  }

  function validateArrows(arrows, xyzVectors) {
    if (!arrows || typeof arrows !== 'object' || Array.isArray(arrows) || Object.keys(arrows).length !== 1
        || !Array.isArray(arrows.items) || !arrows.items.length) invalid('arrows', 'expected a nonempty items array');
    const names = new Set(xyzVectors?.sets.map(set => set.name));
    for (const arrow of arrows.items) {
      if (!arrow || typeof arrow !== 'object' || Array.isArray(arrow)
          || Object.keys(arrow).some(key => !['name', 'color', 'scale', 'vector', 'anchor', 'origin', 'heads'].includes(key))) {
        invalid('arrows', 'expected exact arrow data');
      }
      if (!validName(arrow.name) || names.has(arrow.name)) invalid('name', 'expected a unique nonempty name');
      if (!validColor(arrow.color)) invalid('color', 'expected #RRGGBB');
      arrowShape(arrow);
      resolvedScale(arrow, 'length', magnitude(arrow.vector));
      names.add(arrow.name);
    }
  }

  function transform(vol, before, indices, rotate, pivot, delta) {
    const next = {};
    if (rotate && before.xyzVectors) {
      const byAtomId = { ...before.xyzVectors.byAtomId };
      const atoms = indices ? indices.map(index => vol.atoms[index]) : vol.atoms;
      for (const atom of atoms) {
        if (Object.hasOwn(byAtomId, atom.id)) byAtomId[atom.id] = byAtomId[atom.id].map(rotate);
      }
      next.xyzVectors = { ...before.xyzVectors, byAtomId };
    }
    if ((!indices || indices.length === vol.atoms.length) && before.arrows) {
      next.arrows = { items: before.arrows.items.map(arrow => {
        const shifted = { ...arrow };
        if (rotate) shifted.vector = rotate(arrow.vector);
        if (arrow.anchor === 'point') {
          const offset = arrow.origin.map((value, axis) => value - pivot[axis]);
          const point = rotate ? rotate(offset) : offset;
          shifted.origin = point.map((value, axis) => value + pivot[axis] + delta[axis]);
        }
        return shifted;
      }) };
    }
    return next;
  }

  global.VibeMolVectorsModel = Object.freeze({
    describe, atomSetPlan, arrowPlan, remove, validateArrows, transform,
  });
})(typeof window === 'undefined' ? globalThis : window);
