(function (global) {
  'use strict';

  // A conservative, explicit-H visualization heuristic in angstroms. These
  // contacts never enter the chemical bond graph or force-field topology.
  const CRITERIA = Object.freeze({ minHA: 1.2, maxHA: 2.5, maxDA: 3.5, minAngle: 120 });
  const HETERO = new Set([7, 8, 9, 16]);
  const finite = atom => atom?.pos && [atom.pos.x, atom.pos.y, atom.pos.z].every(Number.isFinite);
  const distanceSq = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

  /** Atom records use {Z, pos:{x,y,z}, formalCharge}; edges use {i,j,order,style}.
   * Spatial bins bound the distance search; no all-pairs scan or mutation.
   * No implicit H, periodic images, or contacts between separate scenes.
   */
  function inferContacts(atoms, edges) {
    if (!atoms.some(atom => atom.Z === 1)) return [];
    const adjacent = atoms.map(() => []);
    for (const edge of edges) {
      if (edge.kind === 'blocked' || !adjacent[edge.i] || !adjacent[edge.j] || edge.i === edge.j) continue;
      adjacent[edge.i].push({ index: edge.j, edge });
      adjacent[edge.j].push({ index: edge.i, edge });
    }
    const covalent = edge => !edge.style || edge.style === 'covalent';
    const carbonylNeighbor = (index, except) => atoms[index].Z === 6 && adjacent[index].some(({ index: j, edge }) =>
      j !== except && [8, 16].includes(atoms[j].Z) && covalent(edge) && edge.order >= 2);
    function pyrroleLike(i) {
      function visit(path, doubles) {
        const last = path[path.length - 1];
        if (path.length === 5) return doubles >= 2 && adjacent[last].some(({ index, edge }) => index === i && covalent(edge));
        return adjacent[last].some(({ index, edge }) => covalent(edge) && [6, 7, 8, 16].includes(atoms[index].Z)
          && !path.includes(index) && visit([...path, index], doubles + (edge.order >= 2 ? 1 : 0)));
      }
      return visit([i], 0);
    }
    function acceptor(i) {
      const atom = atoms[i], neighbors = adjacent[i];
      if (!HETERO.has(atom.Z) || !finite(atom) || Number(atom.formalCharge) > 0) return false;
      const cov = neighbors.filter(({ edge }) => covalent(edge));
      const valence = cov.reduce((sum, { edge }) => sum + (edge.order || 1), 0);
      if (atom.Z === 7) {
        if (cov.length >= 4 || valence > 3) return false;
        // Amide/thioamide N and pyrrole-like N donate their lone pair to a pi system.
        if (cov.some(({ index }) => carbonylNeighbor(index, i))) return false;
        if (cov.length === 3 && pyrroleLike(i)) return false;
      }
      if (atom.Z === 8) {
        if (cov.length > 2 || valence > 2) return false;
        // The protonated OH oxygen of a carboxylic acid is not an acceptor.
        if (cov.some(({ index }) => atoms[index].Z === 1) && cov.some(({ index }) => carbonylNeighbor(index, i))) return false;
      }
      if (atom.Z === 9 && cov.some(({ index }) => atoms[index].Z !== 1)) return false;
      // Restrict sulfur to low-valent thiol/thioether/thiocarbonyl environments.
      if (atom.Z === 16 && (cov.length > 2 || valence > 2)) return false;
      return true;
    }
    const bins = new Map(), size = CRITERIA.maxHA;
    const cell = pos => [Math.floor(pos.x / size), Math.floor(pos.y / size), Math.floor(pos.z / size)];
    atoms.forEach((atom, i) => {
      if (!acceptor(i)) return;
      const key = cell(atom.pos).join(',');
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(i);
    });
    const contacts = [], cosLimit = Math.cos(CRITERIA.minAngle * Math.PI / 180);
    atoms.forEach((hydrogen, h) => {
      if (hydrogen.Z !== 1 || !finite(hydrogen) || adjacent[h].length !== 1) return;
      const { index: d, edge } = adjacent[h][0], donor = atoms[d];
      if (!covalent(edge) || edge.order > 1 || !HETERO.has(donor.Z) || !finite(donor)) return;
      const dh2 = distanceSq(donor.pos, hydrogen.pos);
      // Do not use a deliberately stretched stored bond as a donor.
      if (dh2 < 0.16 || dh2 > (donor.Z === 16 ? 1.65 : 1.35) ** 2) return;
      const [x, y, z] = cell(hydrogen.pos);
      const donorNeighbors = new Set(adjacent[d].map(item => item.index));
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const a of bins.get([x + dx, y + dy, z + dz].join(',')) || []) {
          if (a === d || donorNeighbors.has(a)) continue;
          const accept = atoms[a], ha2 = distanceSq(hydrogen.pos, accept.pos), da2 = distanceSq(donor.pos, accept.pos);
          if (ha2 < CRITERIA.minHA ** 2 || ha2 > CRITERIA.maxHA ** 2 || da2 > CRITERIA.maxDA ** 2) continue;
          const cosine = (dh2 + ha2 - da2) / (2 * Math.sqrt(dh2 * ha2));
          if (cosine > cosLimit + 1e-12) continue;
          contacts.push({ donor: d, hydrogen: h, acceptor: a, distance: Math.sqrt(ha2),
            donorDistance: Math.sqrt(da2), angle: Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI });
        }
      }
    });
    return contacts;
  }

  /** Update a single instanced dashed mesh without rebuilding covalent bonds.
   * The caller owns the shared material; mesh/geometry follow the bond group.
   */
  function updateGraphics(THREE, group, atoms, edges, material) {
    const contacts = inferContacts(atoms, edges);
    let mesh = group.children.find(child => child.userData.type === 'hydrogenBondContacts');
    const steps = contacts.map(contact => Math.max(1, Math.ceil(contact.distance / 0.22)));
    const count = steps.reduce((sum, value) => sum + value, 0);
    // Retain an empty mesh so coordinate-update paths still visit this group
    // when ordinary bonds are hidden and a contact subsequently forms.
    if (!mesh || mesh.instanceMatrix.count < count) {
      if (mesh) { group.remove(mesh); mesh.geometry.dispose(); mesh.dispose?.(); }
      mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1), material,
        2 ** Math.ceil(Math.log2(Math.max(1, count))));
      mesh.userData.type = 'hydrogenBondContacts';
      mesh.raycast = () => {}; // An annotation, never an editable/valence bond.
      mesh.frustumCulled = false; // Avoid stale sphere culling as contacts move; depth fitting reads instance bounds.
      group.add(mesh);
    }
    const dummy = new THREE.Object3D(), direction = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let instance = 0;
    contacts.forEach((contact, k) => {
      const start = atoms[contact.hydrogen].pos, end = atoms[contact.acceptor].pos;
      direction.subVectors(end, start).normalize();
      dummy.quaternion.setFromUnitVectors(up, direction);
      dummy.scale.set(0.035, contact.distance / steps[k] * 0.55, 0.035);
      for (let dash = 0; dash < steps[k]; dash++) {
        dummy.position.copy(start).lerp(end, (dash + 0.5) / steps[k]);
        dummy.updateMatrix(); mesh.setMatrixAt(instance++, dummy.matrix);
      }
    });
    mesh.count = count; mesh.visible = count > 0;
    mesh.userData.contacts = contacts;
    mesh.instanceMatrix.needsUpdate = true;
    // Scene fitting can read bounds before the camera-depth cache refreshes.
    mesh.boundingBox = null; mesh.boundingSphere = null;
  }

  global.VibeMolHydrogenBonds = Object.freeze({ CRITERIA, inferContacts, updateGraphics });
})(typeof window !== 'undefined' ? window : globalThis);
