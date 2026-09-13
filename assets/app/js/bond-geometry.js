(function (global) {
  'use strict';

  const COMPONENT_SPACING = 2.1;

  function componentOffsets(order) {
    if (order >= 4) {
      const q = Math.SQRT1_2;
      return [[q, q], [-q, q], [-q, -q], [q, -q]];
    }
    if (order >= 3) return [[1, 0], [-0.5, Math.sqrt(3) / 2], [-0.5, -Math.sqrt(3) / 2]];
    return order === 2 ? [[-0.5, 0], [0.5, 0]] : [[0, 0]];
  }

  // A conservative insphere of the latitude/longitude triangle mesh. This is
  // below every face plane, including low-detail spheres, in any bond direction.
  function sphereFitRadius(radius, widthSegments, heightSegments) {
    const w = Math.max(3, Math.floor(widthSegments));
    const h = Math.max(2, Math.floor(heightSegments));
    return Math.max(0, radius) * Math.cos(Math.PI / w) * Math.cos(Math.PI / (2 * h)) * (1 - 1e-4);
  }

  function seatDepth(radius, lateralOffset, rimRadius) {
    // The farthest point on an offset rim is d+r, NOT sqrt(d*d+r*r).
    const outer = Math.abs(lateralOffset) + rimRadius;
    return Math.sqrt(Math.max(0, radius * radius - outer * outer));
  }

  /** Fit a whole connector bundle inside both atom meshes without changing atoms.
   * With plain cylinders: single r<=R, double r<=R/2.05, triple/quad r<=R/3.1.
   * R is the smaller mesh insphere. Collars/contours scale with the connector,
   * and are included in its outer envelope. Spacing follows thickness, so even
   * tiny atoms have a valid fit (an absolute spacing floor cannot guarantee it).
   */
  function fitBond({ radius, radiusA, radiusB, order = 1, widthSegments = 36, heightSegments = 24,
    collarRadius = radius, outlineWidth = 0, outlineFraction = 0, highlightScale = 1 }) {
    const fitA = sphereFitRadius(radiusA, widthSegments, heightSegments);
    const fitB = sphereFitRadius(radiusB, widthSegments, heightSegments);
    const offsetGain = COMPONENT_SPACING * Math.max(...componentOffsets(order).map(([u, v]) => Math.hypot(u, v)));
    const outlineScale = outlineWidth > 0 ? 1 + outlineWidth / radius : 1 + outlineFraction;
    const shellScale = Math.max(1, outlineScale, highlightScale);
    const collarRatio = collarRadius / radius;
    const rimRatio = Math.max(1, collarRatio) * shellScale;
    const maxRadius = Math.min(fitA, fitB) / (offsetGain + rimRatio);
    const fittedRadius = Math.min(radius, maxRadius);
    const rimRadius = fittedRadius * rimRatio;
    const offset = fittedRadius * offsetGain;
    return { radius: fittedRadius, maxRadius, spacing: COMPONENT_SPACING * fittedRadius,
      collarRadius: fittedRadius * collarRatio, rimRadius, outlineScale, fitA, fitB,
      trimA: seatDepth(fitA, offset, rimRadius), trimB: seatDepth(fitB, offset, rimRadius) };
  }

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

  global.VibeMolBondGeometry = Object.freeze({ createCylinder, componentOffsets, sphereFitRadius, seatDepth, fitBond });
})(typeof window !== 'undefined' ? window : globalThis);
