(function (global) {
  'use strict';

  /**
   * One closed cylinder, optionally colored in two halves. The color boundary
   * duplicates vertices, not surfaces: there are no internal caps or separately
   * transformed halves to produce cracks, outlines, or transparency seams.
   */
  function createCylinder(THREE, radius, length, radialSegments, heightSegments, colorA = null, colorB = null) {
    const colored = !!(colorA && colorB);
    const split = colored && !colorA.equals(colorB);
    // Keep a ring at y=0 so no triangle crosses the sharp color boundary.
    const rings = split ? Math.max(2, Math.ceil(heightSegments / 2) * 2) : heightSegments;
    let geometry = new THREE.CylinderGeometry(radius, radius, length, radialSegments, rings, false);
    if (!colored) return geometry;
    if (split) {
      const indexed = geometry;
      geometry = indexed.toNonIndexed();
      indexed.dispose();
    }
    const position = geometry.getAttribute('position');
    const colors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count;) {
      const count = split ? 3 : 1;
      const y = split ? position.getY(i) + position.getY(i + 1) + position.getY(i + 2) : 0;
      const color = split && y > 0 ? colorB : colorA;
      for (let j = 0; j < count; j++, i++) color.toArray(colors, i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  }

  global.VibeMolBondGeometry = Object.freeze({ createCylinder });
})(typeof window !== 'undefined' ? window : globalThis);
