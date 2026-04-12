(function (global) {
  'use strict';

  const AUTO_BOND_TOLERANCE = 1.15;
  const AUTO_BOND_MIN_DISTANCE = 0.4;
  const METAL_BOND_RADIUS = Object.freeze({
    Li: 1.50, Be: 1.20, Na: 1.80, Mg: 1.60, Al: 1.50, K: 2.10, Ca: 1.90,
    Sc: 1.70, Ti: 1.65, V: 1.60, Cr: 1.55, Mn: 1.55, Fe: 1.55, Co: 1.50,
    Ni: 1.50, Cu: 1.50, Zn: 1.50, Ga: 1.45, Rb: 2.20, Sr: 2.00,
    Y: 1.80, Zr: 1.75, Nb: 1.70, Mo: 1.65, Tc: 1.60, Ru: 1.55, Rh: 1.55,
    Pd: 1.55, Ag: 1.65, Cd: 1.60, In: 1.55, Sn: 1.55,
    La: 1.95, Hf: 1.75, Ta: 1.70, W: 1.65, Re: 1.60, Os: 1.55, Ir: 1.55,
    Pt: 1.55, Au: 1.55, Hg: 1.55, Tl: 1.60, Pb: 1.60, Bi: 1.60,
    Ce: 1.90, Pr: 1.90, Nd: 1.88, Sm: 1.85, Eu: 1.85, Gd: 1.82,
    Tb: 1.80, Dy: 1.78, Ho: 1.78, Er: 1.76, Tm: 1.75, Yb: 1.75, Lu: 1.72,
  });
  const MAX_METAL_COORDINATION = Object.freeze({
    Li: 6, Be: 4, Na: 6, Mg: 6, Al: 6, K: 8, Ca: 8,
    Sc: 8, Ti: 8, V: 6, Cr: 6, Mn: 7, Fe: 6, Co: 6,
    Ni: 6, Cu: 6, Zn: 6, Ga: 6,
    Zr: 8, Mo: 7, Ru: 6, Rh: 6, Pd: 6, Ag: 6, Cd: 6,
    La: 12, Hf: 8, Ta: 7, W: 6, Re: 7, Os: 6, Ir: 6,
    Pt: 6, Au: 6, Hg: 6,
    Ce: 12, Nd: 12, Gd: 10, Lu: 9,
  });
  const METAL_BOND_MODE_AUTO = 'auto';
  const METAL_BOND_MODE_FORCE_COVALENT = 'force_covalent';
  const METAL_BOND_MODE_FORCE_DATIVE = 'force_dative';
  const METAL_BOND_MODE_NO_BONDS = 'no_bonds';

  function getElementSymbol(z) {
    return (global.ATOM_Z_TO_DATA && global.ATOM_Z_TO_DATA[z] && global.ATOM_Z_TO_DATA[z].symbol) || '';
  }

  function normalizeMetalBondMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    if (mode === METAL_BOND_MODE_FORCE_COVALENT) return METAL_BOND_MODE_FORCE_COVALENT;
    if (mode === METAL_BOND_MODE_FORCE_DATIVE) return METAL_BOND_MODE_FORCE_DATIVE;
    if (mode === METAL_BOND_MODE_NO_BONDS) return METAL_BOND_MODE_NO_BONDS;
    return METAL_BOND_MODE_AUTO;
  }

  function isMetalAtomicNumber(z) {
    return !!METAL_BOND_RADIUS[getElementSymbol(z)];
  }

  function resolveAtomicNumber(atomOrZ) {
    if (atomOrZ && typeof atomOrZ === 'object') return Number(atomOrZ.Z) | 0;
    return Number(atomOrZ) | 0;
  }

  function countsTowardAtomValence(atomOrZ, otherAtomOrZ) {
    const atomIsMetal = isMetalAtomicNumber(resolveAtomicNumber(atomOrZ));
    const otherIsMetal = isMetalAtomicNumber(resolveAtomicNumber(otherAtomOrZ));
    if (atomIsMetal === otherIsMetal) return true;
    return atomIsMetal;
  }

  /**
   * Look up the covalent radius for an atomic number in angstroms.
   * Falls back to a generic radius when element metadata is unavailable.
   * @param {number} z
   * @returns {number}
   */
  function getCovalentRadiusAngstrom(z) {
    return (global.ATOM_Z_TO_DATA && global.ATOM_Z_TO_DATA[z] && global.ATOM_Z_TO_DATA[z].radius_covalent) || 0.70;
  }

  /**
   * Check whether an atomic number belongs to lanthanides/actinides.
   * @param {number} z
   * @returns {boolean}
   */
  function isLanthanideOrActinideAtomicNumber(z) {
    const n = z | 0;
    return (n >= 57 && n <= 71) || (n >= 89 && n <= 103);
  }

  /**
   * Detect whether an element is typically monovalent in organic chemistry.
   * @param {number} z
   * @returns {boolean}
   */
  function isMonovalentMainGroupAtomicNumber(z) {
    return z === 1 || z === 9 || z === 17 || z === 35 || z === 53;
  }

  /**
   * Return preferred valence states for a main-group element.
   * Empty result means "do not infer bond order by valence".
   * @param {number} z
   * @returns {number[]}
   */
  function getAllowedMainGroupValences(z) {
    switch (z | 0) {
      case 1: return [1];
      case 5: return [3];
      case 6: return [4];
      case 7: return [3, 5];
      case 8: return [2];
      case 9: return [1];
      case 14: return [4];
      case 15: return [3, 5];
      case 16: return [2, 4, 6];
      case 17: return [1];
      case 35: return [1];
      case 53: return [1];
      default: return [];
    }
  }

  /**
   * Pick the nearest plausible target valence that is not below the
   * current connectivity count, if possible.
   * @param {number} z
   * @param {number} currentValence
   * @returns {number}
   */
  function chooseTargetValence(z, currentValence) {
    const allowed = getAllowedMainGroupValences(z);
    if (!allowed.length) return currentValence;
    for (const v of allowed) {
      if (v >= currentValence) return v;
    }
    return allowed[allowed.length - 1];
  }

  /**
   * Check whether an atomic number belongs to a transition metal block.
   * @param {number} z
   * @returns {boolean}
   */
  function isTransitionMetalAtomicNumber(z) {
    const n = z | 0;
    return (
      (n >= 21 && n <= 30) ||
      (n >= 39 && n <= 48) ||
      (n >= 72 && n <= 80) ||
      (n >= 104 && n <= 112)
    );
  }

  /**
   * Return true when automatic geometry-based bonding is supported for one element.
   * This intentionally targets organic/main-group chemistry and skips metals by default.
   * @param {number} z
   * @returns {boolean}
   */
  function isAutoBondSupportedAtomicNumber(z) {
    switch (z | 0) {
      case 1:
      case 5:
      case 6:
      case 7:
      case 8:
      case 9:
      case 14:
      case 15:
      case 16:
      case 17:
      case 35:
      case 53:
        return true;
      default:
        return false;
    }
  }

  /**
   * Return the maximum coordination count used by auto-bond perception.
   * Unsupported elements return 0 and are skipped.
   * @param {number} z
   * @returns {number}
   */
  function getElementMaxCoordination(z) {
    switch (z | 0) {
      case 1: return 1;
      case 5: return 4;
      case 6: return 4;
      case 7: return 4;
      case 8: return 2;
      case 9: return 1;
      case 14: return 4;
      case 15: return 5;
      case 16: return 6;
      case 17: return 1;
      case 35: return 1;
      case 53: return 1;
      default: return 0;
    }
  }

  function getMetalBondRadiusAngstrom(z) {
    const symbol = getElementSymbol(z);
    return METAL_BOND_RADIUS[symbol] || 1.60;
  }

  function getMetalBondMode(atom) {
    return normalizeMetalBondMode(atom && atom.metalBondMode);
  }

  function getMetalCoordinationCap(atom) {
    const symbol = getElementSymbol(atom && atom.Z);
    return MAX_METAL_COORDINATION[symbol] || 6;
  }

  function compareMetalCandidatePriority(left, right) {
    const leftRank = left && left.style === 'metal-strong' ? 0 : 1;
    const rightRank = right && right.style === 'metal-strong' ? 0 : 1;
    if (leftRank !== rightRank) return leftRank - rightRank;
    const lenDelta = (Number(left && left.len) || 0) - (Number(right && right.len) || 0);
    if (Math.abs(lenDelta) > 1e-8) return lenDelta;
    const iDelta = (left && left.i || 0) - (right && right.i || 0);
    if (iDelta !== 0) return iDelta;
    return (left && left.j || 0) - (right && right.j || 0);
  }

  function classifyMetalLigandStyle(distance, metalAtom, ligandAtom) {
    const mode = getMetalBondMode(metalAtom);
    if (mode === METAL_BOND_MODE_NO_BONDS) return null;
    const rM = getMetalBondRadiusAngstrom(metalAtom && metalAtom.Z);
    const rL = getCovalentRadiusAngstrom(ligandAtom && ligandAtom.Z);
    const rSum = rM + rL;
    if (!(rSum > 0) || !Number.isFinite(distance) || distance < AUTO_BOND_MIN_DISTANCE) return null;
    if (mode === METAL_BOND_MODE_FORCE_COVALENT) {
      return distance <= 0.90 * rSum ? 'covalent' : null;
    }
    if (mode === METAL_BOND_MODE_FORCE_DATIVE) {
      return distance <= 1.15 * rSum ? 'metal-dative' : null;
    }
    if (distance <= 0.90 * rSum) return 'metal-strong';
    if (distance <= 1.15 * rSum) return 'metal-dative';
    return null;
  }

  function buildMetalLigandCandidates(atomPositions) {
    const candidatesByMetal = new Map();
    const atomCount = Array.isArray(atomPositions) ? atomPositions.length : 0;
    for (let i = 0; i < atomCount; i += 1) {
      const atomI = atomPositions[i];
      if (!atomI || !atomI.pos || typeof atomI.pos.distanceTo !== 'function') continue;
      const isMetalI = isMetalAtomicNumber(atomI.Z);
      for (let j = i + 1; j < atomCount; j += 1) {
        const atomJ = atomPositions[j];
        if (!atomJ || !atomJ.pos || typeof atomJ.pos.distanceTo !== 'function') continue;
        const isMetalJ = isMetalAtomicNumber(atomJ.Z);
        if (isMetalI === isMetalJ) continue;
        const metalIndex = isMetalI ? i : j;
        const ligandIndex = isMetalI ? j : i;
        const metalAtom = isMetalI ? atomI : atomJ;
        const ligandAtom = isMetalI ? atomJ : atomI;
        const len = atomI.pos.distanceTo(atomJ.pos);
        const style = classifyMetalLigandStyle(len, metalAtom, ligandAtom);
        if (!style) continue;
        const list = candidatesByMetal.get(metalIndex) || [];
        list.push({
          i: Math.min(metalIndex, ligandIndex),
          j: Math.max(metalIndex, ligandIndex),
          len,
          singleRef: getMetalBondRadiusAngstrom(metalAtom.Z) + getCovalentRadiusAngstrom(ligandAtom.Z),
          cutoff: style === 'covalent' || style === 'metal-strong'
            ? 0.90 * (getMetalBondRadiusAngstrom(metalAtom.Z) + getCovalentRadiusAngstrom(ligandAtom.Z))
            : 1.15 * (getMetalBondRadiusAngstrom(metalAtom.Z) + getCovalentRadiusAngstrom(ligandAtom.Z)),
          ratio: len / Math.max(1e-6, getMetalBondRadiusAngstrom(metalAtom.Z) + getCovalentRadiusAngstrom(ligandAtom.Z)),
          order: 1,
          maxOrder: 1,
          style,
          metalIndex,
          ligandIndex,
        });
        candidatesByMetal.set(metalIndex, list);
      }
    }
    return candidatesByMetal;
  }

  function buildMetalLigandEdges(atomPositions) {
    if (!Array.isArray(atomPositions) || !atomPositions.length) return [];
    const candidatesByMetal = buildMetalLigandCandidates(atomPositions);
    const accepted = [];
    const seen = new Set();
    for (const [metalIndex, candidates] of candidatesByMetal.entries()) {
      const metalAtom = atomPositions[metalIndex];
      if (!metalAtom) continue;
      const maxCoordination = getMetalCoordinationCap(metalAtom);
      const sorted = Array.isArray(candidates) ? candidates.slice().sort(compareMetalCandidatePriority) : [];
      let count = 0;
      for (const candidate of sorted) {
        if (count >= maxCoordination) break;
        const key = getUndirectedPairKey(candidate.i, candidate.j);
        if (seen.has(key)) continue;
        seen.add(key);
        accepted.push(candidate);
        count += 1;
      }
    }
    return accepted;
  }

  function classifyMetalMetalStyle(distance, atomA, atomB) {
    const modeA = getMetalBondMode(atomA);
    const modeB = getMetalBondMode(atomB);
    if (modeA === METAL_BOND_MODE_NO_BONDS || modeB === METAL_BOND_MODE_NO_BONDS) return null;
    const cutoff = 1.05 * (getMetalBondRadiusAngstrom(atomA && atomA.Z) + getMetalBondRadiusAngstrom(atomB && atomB.Z));
    if (!Number.isFinite(distance) || distance < AUTO_BOND_MIN_DISTANCE || distance > cutoff) return null;
    if (modeA === METAL_BOND_MODE_FORCE_DATIVE || modeB === METAL_BOND_MODE_FORCE_DATIVE) return 'metal-dative';
    if (modeA === METAL_BOND_MODE_FORCE_COVALENT || modeB === METAL_BOND_MODE_FORCE_COVALENT) return 'covalent';
    return 'metal-metal';
  }

  function buildMetalMetalEdges(atomPositions) {
    const edges = [];
    const atomCount = Array.isArray(atomPositions) ? atomPositions.length : 0;
    for (let i = 0; i < atomCount; i += 1) {
      const atomI = atomPositions[i];
      if (!atomI || !atomI.pos || typeof atomI.pos.distanceTo !== 'function' || !isMetalAtomicNumber(atomI.Z)) continue;
      for (let j = i + 1; j < atomCount; j += 1) {
        const atomJ = atomPositions[j];
        if (!atomJ || !atomJ.pos || typeof atomJ.pos.distanceTo !== 'function' || !isMetalAtomicNumber(atomJ.Z)) continue;
        const len = atomI.pos.distanceTo(atomJ.pos);
        const style = classifyMetalMetalStyle(len, atomI, atomJ);
        if (!style) continue;
        const singleRef = getMetalBondRadiusAngstrom(atomI.Z) + getMetalBondRadiusAngstrom(atomJ.Z);
        edges.push({
          i,
          j,
          len,
          singleRef,
          cutoff: 1.05 * singleRef,
          ratio: len / Math.max(1e-6, singleRef),
          order: 1,
          maxOrder: 1,
          style,
        });
      }
    }
    return edges;
  }

  /**
   * Resolve the maximum supported bond order for an element pair.
   * Conservative by design: only common organic/main-group pairs are promoted.
   * Quadruple-order support is enabled for C-C to allow C2-like cases.
   * @param {number} zi
   * @param {number} zj
   * @returns {number}
   */
  function getPairMaxBondOrder(zi, zj) {
    const a = zi | 0;
    const b = zj | 0;
    if (isTransitionMetalAtomicNumber(a) || isTransitionMetalAtomicNumber(b)) return 1;
    if (isLanthanideOrActinideAtomicNumber(a) || isLanthanideOrActinideAtomicNumber(b)) return 1;
    if (isMonovalentMainGroupAtomicNumber(a) || isMonovalentMainGroupAtomicNumber(b)) return 1;

    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    switch (key) {
      case '6-6':
        return 4;
      case '6-7':
      case '7-7':
        return 3;
      case '6-8':
      case '6-15':
      case '6-16':
      case '7-8':
      case '7-15':
      case '7-16':
      case '8-8':
      case '8-15':
      case '8-16':
      case '6-14':
      case '15-15':
      case '15-16':
      case '16-16':
        return 2;
      default:
        return 1;
    }
  }

  /**
   * Build raw candidate pairs from atom positions using covalent-radius heuristics.
   * Acceptance here only means "consider for ranking"; final connectivity is capped later.
   * @param {Array<{pos:THREE.Vector3,Z:number}>} atomPositions
   * @param {{tolerance?:number,minDistance?:number,skipUnsupported?:boolean}=} options
   * @returns {Array<{i:number,j:number,len:number,singleRef:number,cutoff:number,ratio:number,order:number,maxOrder:number}>}
   */
  function collectRawBondCandidates(atomPositions, options = {}) {
    const edges = [];
    const n = Array.isArray(atomPositions) ? atomPositions.length : 0;
    const tolerance = Number.isFinite(options.tolerance) ? Number(options.tolerance) : AUTO_BOND_TOLERANCE;
    const minDistance = Number.isFinite(options.minDistance) ? Number(options.minDistance) : AUTO_BOND_MIN_DISTANCE;
    const skipUnsupported = options.skipUnsupported !== false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ai = atomPositions[i];
        const aj = atomPositions[j];
        if (!ai || !aj || !ai.pos || !aj.pos || typeof ai.pos.distanceTo !== 'function') continue;
        if (skipUnsupported && (!isAutoBondSupportedAtomicNumber(ai.Z) || !isAutoBondSupportedAtomicNumber(aj.Z))) continue;
        const ri = getCovalentRadiusAngstrom(ai.Z);
        const rj = getCovalentRadiusAngstrom(aj.Z);
        const singleRef = ri + rj;
        if (!(singleRef > 0)) continue;
        const cutoff = tolerance * singleRef;
        const len = ai.pos.distanceTo(aj.pos);
        if (!Number.isFinite(len) || len < minDistance || len > cutoff) continue;
        edges.push({
          i,
          j,
          len,
          singleRef,
          cutoff,
          ratio: len / Math.max(1e-6, singleRef),
          order: 1,
          maxOrder: 1,
        });
      }
    }
    return edges;
  }

  /**
   * Accept raw bond candidates greedily by distance rank while enforcing per-element
   * coordination caps.
   * @param {Array<{pos:THREE.Vector3,Z:number}>} atomPositions
   * @param {Array<{i:number,j:number,len:number,singleRef:number,cutoff:number,ratio:number,order:number,maxOrder:number}>} candidates
   * @param {{maxCoordinationOverride?:Record<string, number>}=} options
   * @returns {Array<{i:number,j:number,len:number,singleRef:number,cutoff:number,ratio:number,order:number,maxOrder:number}>}
   */
  function acceptBondCandidatesByDistanceRank(atomPositions, candidates, options = {}) {
    if (!Array.isArray(atomPositions) || !Array.isArray(candidates) || !candidates.length) return [];
    const sorted = candidates.slice().sort((left, right) => {
      const ratioDelta = (Number(left && left.ratio) || 0) - (Number(right && right.ratio) || 0);
      if (Math.abs(ratioDelta) > 1e-8) return ratioDelta;
      const lenDelta = (Number(left && left.len) || 0) - (Number(right && right.len) || 0);
      if (Math.abs(lenDelta) > 1e-8) return lenDelta;
      const iDelta = (left && left.i || 0) - (right && right.i || 0);
      if (iDelta !== 0) return iDelta;
      return (left && left.j || 0) - (right && right.j || 0);
    });
    const coordination = new Array(atomPositions.length).fill(0);
    const maxCoordinationOverride = options.maxCoordinationOverride && typeof options.maxCoordinationOverride === 'object'
      ? options.maxCoordinationOverride
      : null;
    const accepted = [];
    for (const candidate of sorted) {
      if (!candidate) continue;
      const i = candidate.i | 0;
      const j = candidate.j | 0;
      const atomI = atomPositions[i];
      const atomJ = atomPositions[j];
      if (!atomI || !atomJ || i < 0 || j < 0 || i >= atomPositions.length || j >= atomPositions.length || i === j) continue;
      const hasOverrideI = !!(maxCoordinationOverride && Object.prototype.hasOwnProperty.call(maxCoordinationOverride, i));
      const hasOverrideJ = !!(maxCoordinationOverride && Object.prototype.hasOwnProperty.call(maxCoordinationOverride, j));
      const maxI = hasOverrideI && Number.isFinite(Number(maxCoordinationOverride[i]))
        ? Math.max(0, Number(maxCoordinationOverride[i]) | 0)
        : getElementMaxCoordination(atomI.Z);
      const maxJ = hasOverrideJ && Number.isFinite(Number(maxCoordinationOverride[j]))
        ? Math.max(0, Number(maxCoordinationOverride[j]) | 0)
        : getElementMaxCoordination(atomJ.Z);
      if (maxI <= 0 || maxJ <= 0) continue;
      if (coordination[i] >= maxI || coordination[j] >= maxJ) continue;
      coordination[i] += 1;
      coordination[j] += 1;
      accepted.push({
        i,
        j,
        len: Number(candidate.len) || 0,
        singleRef: Number(candidate.singleRef) || 0,
        cutoff: Number(candidate.cutoff) || 0,
        ratio: Number(candidate.ratio) || 0,
        order: 1,
        maxOrder: 1,
      });
    }
    return accepted;
  }

  /**
   * Perceive one conservative bond connectivity graph from atom coordinates.
   * Returned edges are single bonds only; explicit/user-edited higher orders are kept elsewhere.
   * @param {Array<{pos:THREE.Vector3,Z:number}>} atomPositions
   * @param {{tolerance?:number,minDistance?:number,skipUnsupported?:boolean,maxCoordinationOverride?:Record<string, number>}=} options
   * @returns {Array<{i:number,j:number,len:number,singleRef:number,cutoff:number,ratio:number,order:number,maxOrder:number}>}
   */
  function perceiveBondConnectivity(atomPositions, options = {}) {
    const covalentCandidates = collectRawBondCandidates(atomPositions, options);
    const covalentEdges = acceptBondCandidatesByDistanceRank(atomPositions, covalentCandidates, options)
      .map((edge) => ({
        i: edge.i,
        j: edge.j,
        len: edge.len,
        singleRef: edge.singleRef,
        cutoff: edge.cutoff,
        ratio: edge.ratio,
        order: 1,
        maxOrder: 1,
        style: 'covalent',
      }));
    const seen = new Set(covalentEdges.map((edge) => getUndirectedPairKey(edge.i, edge.j)));
    const accepted = covalentEdges.slice();
    for (const edge of buildMetalLigandEdges(atomPositions)) {
      const key = getUndirectedPairKey(edge.i, edge.j);
      if (seen.has(key)) continue;
      seen.add(key);
      accepted.push(edge);
    }
    for (const edge of buildMetalMetalEdges(atomPositions)) {
      const key = getUndirectedPairKey(edge.i, edge.j);
      if (seen.has(key)) continue;
      seen.add(key);
      accepted.push(edge);
    }
    accepted.sort((left, right) => {
      const iDelta = (left && left.i || 0) - (right && right.i || 0);
      if (iDelta !== 0) return iDelta;
      return (left && left.j || 0) - (right && right.j || 0);
    });
    return accepted;
  }

  /**
   * Deprecated compatibility alias.
   * @deprecated Use collectRawBondCandidates(...) or perceiveBondConnectivity(...).
   */
  function collectBondCandidates(atomPositions, options = {}) {
    return collectRawBondCandidates(atomPositions, options);
  }

  /**
   * Deprecated compatibility alias that mutates the input edge array in place.
   * @deprecated App code should call perceiveBondConnectivity(...) directly.
   */
  function inferBondOrders(atomPositions, edges) {
    if (!Array.isArray(atomPositions) || !Array.isArray(edges)) return;
    const atomCount = atomPositions.length | 0;
    const valence = new Array(atomCount).fill(0);
    const targetValence = new Array(atomCount).fill(0);
    for (const edge of edges) {
      if (!edge) continue;
      const i = edge.i | 0;
      const j = edge.j | 0;
      if (i < 0 || j < 0 || i >= atomCount || j >= atomCount || i === j) continue;
      const atomI = atomPositions[i];
      const atomJ = atomPositions[j];
      if (!atomI || !atomJ) continue;
      const baseOrder = Math.max(1, Number(edge.order) || 1);
      const style = String(edge.style || 'covalent');
      edge.order = baseOrder;
      if (style !== 'covalent') {
        edge.maxOrder = 1;
        continue;
      }
      edge.maxOrder = Math.max(baseOrder, getPairMaxBondOrder(atomI.Z, atomJ.Z) | 0);
      valence[i] += baseOrder;
      valence[j] += baseOrder;
    }
    for (let index = 0; index < atomCount; index += 1) {
      const atom = atomPositions[index];
      targetValence[index] = atom ? chooseTargetValence(atom.Z, valence[index]) : valence[index];
    }
    while (true) {
      let bestEdge = null;
      let bestScore = Infinity;
      for (const edge of edges) {
        if (!edge) continue;
        const i = edge.i | 0;
        const j = edge.j | 0;
        if (i < 0 || j < 0 || i >= atomCount || j >= atomCount || i === j) continue;
        if ((Number(edge.order) || 1) >= (Number(edge.maxOrder) || 1)) continue;
        if (valence[i] >= targetValence[i] || valence[j] >= targetValence[j]) continue;
        const score = Number.isFinite(Number(edge.ratio)) ? Number(edge.ratio) : Number(edge.len) || Infinity;
        if (score + 1e-12 < bestScore) {
          bestEdge = edge;
          bestScore = score;
        }
      }
      if (!bestEdge) break;
      const i = bestEdge.i | 0;
      const j = bestEdge.j | 0;
      bestEdge.order = Math.min((Number(bestEdge.maxOrder) || 1), (Number(bestEdge.order) || 1) + 1);
      valence[i] += 1;
      valence[j] += 1;
    }
  }

  /**
   * Build an undirected adjacency list from bond edges.
   * @param {Array<{i:number,j:number}>} edges
   * @param {number} atomCount
   * @returns {number[][]}
   */
  function buildBondAdjacency(edges, atomCount) {
    const n = Math.max(0, atomCount | 0);
    const adjacency = Array.from({ length: n }, () => []);
    for (const edge of edges) {
      if (!edge) continue;
      const i = edge.i | 0;
      const j = edge.j | 0;
      if (i < 0 || j < 0 || i >= n || j >= n || i === j) continue;
      adjacency[i].push(j);
      adjacency[j].push(i);
    }
    return adjacency;
  }

  /**
   * Build a canonical undirected key for an atom pair.
   * @param {number} i
   * @param {number} j
   * @returns {string}
   */
  function getUndirectedPairKey(i, j) {
    const a = i | 0;
    const b = j | 0;
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }

  function buildBondIdFromAtomIds(a, b) {
    const left = String(a || '').trim();
    const right = String(b || '').trim();
    if (!left || !right) return '';
    return left < right ? `bond:${left}:${right}` : `bond:${right}:${left}`;
  }

  function normalizeBondOriginValue(value) {
    return String(value || '').trim().toLowerCase() === 'perceived' ? 'perceived' : 'explicit';
  }

  /**
   * Classify the difference between the current stored graph and a newly perceived graph.
   * The input volume is expected to already use normalized atom ids and bond records.
   * @param {{atoms?:Array<object>,bonds?:Array<object>}|null} vol
   * @param {Array<{pos:THREE.Vector3,Z:number}>} atomPositions
   * @param {{tolerance?:number,minDistance?:number,skipUnsupported?:boolean,maxCoordinationOverride?:Record<string, number>}=} options
   * @returns {{perceived:Array<object>,additions:Array<object>,removable:Array<object>,warnings:Array<object>}}
   */
  function classifyBondCleanupDiff(vol, atomPositions, options = {}) {
    const empty = { perceived: [], additions: [], removable: [], warnings: [] };
    if (!vol || !Array.isArray(vol.atoms) || !Array.isArray(atomPositions) || atomPositions.length !== vol.atoms.length) return empty;
    const atomIndexById = new Map();
    for (let i = 0; i < vol.atoms.length; i++) {
      const atom = vol.atoms[i];
      const atomId = String(atom && atom.id || '').trim();
      if (atomId) atomIndexById.set(atomId, i);
    }
    const perceivedEdges = perceiveBondConnectivity(atomPositions, options).map((edge) => {
      const atomA = vol.atoms[edge.i];
      const atomB = vol.atoms[edge.j];
      const a = String(atomA && atomA.id || '').trim();
      const b = String(atomB && atomB.id || '').trim();
      const key = buildBondIdFromAtomIds(a, b);
      return {
        id: key,
        key,
        a,
        b,
        i: edge.i,
        j: edge.j,
        len: edge.len,
        order: 1,
        kind: 'normal',
        origin: 'perceived',
        style: String(edge.style || 'covalent'),
      };
    }).filter((edge) => edge.id && edge.a && edge.b && edge.a !== edge.b);
    const perceivedByKey = new Map(perceivedEdges.map((edge) => [edge.key, edge]));
    const currentByKey = new Map();
    const blockedKeys = new Set();
    for (const raw of vol.bonds || []) {
      if (!raw || typeof raw !== 'object') continue;
      const a = String(raw.a || '').trim();
      const b = String(raw.b || '').trim();
      if (!a || !b || a === b) continue;
      const i = atomIndexById.get(a);
      const j = atomIndexById.get(b);
      if (!Number.isInteger(i) || !Number.isInteger(j) || i === j) continue;
      const posA = atomPositions[i] && atomPositions[i].pos;
      const posB = atomPositions[j] && atomPositions[j].pos;
      const len = posA && posB && typeof posA.distanceTo === 'function' ? posA.distanceTo(posB) : 0;
      const key = buildBondIdFromAtomIds(a, b);
      const kind = String(raw.kind || 'normal') || 'normal';
      if (kind === 'blocked') {
        blockedKeys.add(key);
        continue;
      }
      currentByKey.set(key, {
        id: String(raw.id || '').trim() || key,
        key,
        a,
        b,
        i,
        j,
        len,
        order: Number(raw.order) || 1,
        kind: String(raw.kind || 'normal') || 'normal',
        origin: normalizeBondOriginValue(raw.origin),
        style: String(raw.style || 'covalent') || 'covalent',
      });
    }
    const additions = [];
    for (const edge of perceivedEdges) {
      if (blockedKeys.has(edge.key)) continue;
      if (!currentByKey.has(edge.key)) additions.push(edge);
    }
    const removable = [];
    const warnings = [];
    for (const bond of currentByKey.values()) {
      if (perceivedByKey.has(bond.key)) continue;
      if (bond.origin === 'perceived') removable.push(bond);
      else warnings.push(bond);
    }
    return { perceived: perceivedEdges, additions, removable, warnings };
  }

  /**
   * Canonicalize a simple cycle so duplicates (rotation/reversal) map to one key.
   * @param {number[]} cycle
   * @returns {{key:string, nodes:number[]}}
   */
  function canonicalizeCycle(cycle) {
    const n = cycle.length | 0;
    if (n <= 0) return { key: '', nodes: [] };
    let best = null;
    let bestKey = '';
    const tryVariant = (arr) => {
      for (let shift = 0; shift < n; shift++) {
        const seq = new Array(n);
        for (let k = 0; k < n; k++) seq[k] = arr[(shift + k) % n];
        const key = seq.join('-');
        if (!best || key < bestKey) {
          best = seq;
          bestKey = key;
        }
      }
    };
    tryVariant(cycle);
    tryVariant(cycle.slice().reverse());
    return { key: bestKey, nodes: best || cycle.slice() };
  }

  /**
   * Find simple cycles of a fixed size in an undirected adjacency list.
   * @param {number[][]} adjacency
   * @param {number} size
   * @returns {number[][]}
   */
  function findSimpleCyclesOfSize(adjacency, size) {
    const n = adjacency.length | 0;
    const target = Math.max(3, size | 0);
    const cycles = [];
    const seen = new Set();
    const path = [];
    const inPath = new Array(n).fill(false);

    function dfs(start, current, depth) {
      const neighbors = adjacency[current];
      if (!Array.isArray(neighbors)) return;
      for (const next of neighbors) {
        if (next === start) {
          if (depth === target) {
            const canonical = canonicalizeCycle(path);
            if (canonical.key && !seen.has(canonical.key)) {
              seen.add(canonical.key);
              cycles.push(canonical.nodes);
            }
          }
          continue;
        }
        if (depth >= target) continue;
        if ((next | 0) < (start | 0)) continue;
        if (inPath[next]) continue;
        inPath[next] = true;
        path.push(next);
        dfs(start, next, depth + 1);
        path.pop();
        inPath[next] = false;
      }
    }

    for (let start = 0; start < n; start++) {
      path.length = 0;
      path.push(start);
      inPath[start] = true;
      dfs(start, start, 1);
      inPath[start] = false;
    }
    return cycles;
  }

  /**
   * Select one of the two alternating patterns for a six-member ring and apply
   * it as single/double bonds.
   * @param {Array<{order:number,maxOrder:number}>} edges
   * @param {number[]} ringEdgeIndices
   */
  function enforceAlternatingSixRingBondOrders(edges, ringEdgeIndices) {
    if (!Array.isArray(ringEdgeIndices) || ringEdgeIndices.length !== 6) return;
    for (const edgeIdx of ringEdgeIndices) {
      const e = edges[edgeIdx];
      if (!e || (e.maxOrder | 0) < 2) return;
    }
    const scorePattern = (phase) => {
      let score = 0;
      for (let k = 0; k < ringEdgeIndices.length; k++) {
        const e = edges[ringEdgeIndices[k]];
        const wantDouble = ((k + phase) % 2) === 0;
        const order = e.order | 0;
        if (wantDouble) {
          if (order >= 2) score += 3;
          else score += 1;
        } else if (order === 1) {
          score += 2;
        }
      }
      return score;
    };
    const phase = scorePattern(1) > scorePattern(0) ? 1 : 0;
    for (let k = 0; k < ringEdgeIndices.length; k++) {
      const edge = edges[ringEdgeIndices[k]];
      const wantDouble = ((k + phase) % 2) === 0;
      edge.order = wantDouble ? 2 : 1;
    }
  }

  /**
   * Detect benzene-like aromatic six-member carbon rings from inferred bonds.
   * Matching rings are normalized to alternating single/double order and
   * returned for dashed inner-ring rendering.
   * @param {Array<{pos:THREE.Vector3,Z:number}>} atomPositions
   * @param {Array<{i:number,j:number,len:number,order:number,maxOrder:number}>} edges
   * @returns {Array<{atoms:number[],center:THREE.Vector3,normal:THREE.Vector3,radius:number}>}
   */
  function inferAromaticSixRings(atomPositions, edges) {
    if (!Array.isArray(edges) || !edges.length) return [];
    const n = atomPositions.length | 0;
    const carbonAdj = Array.from({ length: n }, () => []);
    const edgeIndexByPair = new Map();
    for (let idx = 0; idx < edges.length; idx++) {
      const e = edges[idx];
      if (!e) continue;
      edgeIndexByPair.set(getUndirectedPairKey(e.i, e.j), idx);
    }
    for (const e of edges) {
      if (!e) continue;
      const ai = atomPositions[e.i];
      const aj = atomPositions[e.j];
      if (!ai || !aj) continue;
      if ((ai.Z | 0) !== 6 || (aj.Z | 0) !== 6) continue;
      if (e.len < 1.2 || e.len > 1.55) continue;
      carbonAdj[e.i].push(e.j);
      carbonAdj[e.j].push(e.i);
    }
    const cycles = findSimpleCyclesOfSize(carbonAdj, 6);
    const aromaticRings = [];
    for (const cycle of cycles) {
      if (!Array.isArray(cycle) || cycle.length !== 6) continue;
      let valid = true;
      const cycleSet = new Set(cycle);
      const cycleEdgeLengths = [];
      for (const atomIdx of cycle) {
        const atom = atomPositions[atomIdx];
        if (!atom || (atom.Z | 0) !== 6) { valid = false; break; }
        const neighbors = Array.isArray(carbonAdj[atomIdx]) ? carbonAdj[atomIdx] : null;
        if (!neighbors || neighbors.length < 2 || neighbors.length > 3) { valid = false; break; }
        let neighborsInCycle = 0;
        for (const nb of neighbors) {
          if (cycleSet.has(nb)) neighborsInCycle += 1;
        }
        if (neighborsInCycle !== 2) { valid = false; break; }
      }
      if (!valid) continue;

      const edgeIndices = [];
      for (let k = 0; k < cycle.length; k++) {
        const i = cycle[k];
        const j = cycle[(k + 1) % cycle.length];
        const edgeIdx = edgeIndexByPair.get(getUndirectedPairKey(i, j));
        if (!Number.isInteger(edgeIdx)) { valid = false; break; }
        const edgeLen = Number(edges[edgeIdx] && edges[edgeIdx].len);
        if (!Number.isFinite(edgeLen)) { valid = false; break; }
        cycleEdgeLengths.push(edgeLen);
        edgeIndices.push(edgeIdx);
      }
      if (!valid || edgeIndices.length !== 6) continue;

      const meanLen = cycleEdgeLengths.reduce((sum, value) => sum + value, 0) / cycleEdgeLengths.length;
      let varLen = 0;
      for (const value of cycleEdgeLengths) {
        const delta = value - meanLen;
        varLen += delta * delta;
      }
      const stdLen = Math.sqrt(varLen / cycleEdgeLengths.length);
      if (meanLen < 1.32 || meanLen > 1.47 || stdLen > 0.09) continue;

      const center = new global.THREE.Vector3();
      for (const atomIdx of cycle) center.add(atomPositions[atomIdx].pos);
      center.multiplyScalar(1 / cycle.length);

      const normal = new global.THREE.Vector3();
      for (let k = 0; k < cycle.length; k++) {
        const p0 = atomPositions[cycle[k]].pos.clone().sub(center);
        const p1 = atomPositions[cycle[(k + 1) % cycle.length]].pos.clone().sub(center);
        normal.add(new global.THREE.Vector3().crossVectors(p0, p1));
      }
      if (normal.lengthSq() < 1e-10) continue;
      normal.normalize();

      let maxPlaneDeviation = 0;
      let avgRadius = 0;
      for (const atomIdx of cycle) {
        const rel = atomPositions[atomIdx].pos.clone().sub(center);
        maxPlaneDeviation = Math.max(maxPlaneDeviation, Math.abs(rel.dot(normal)));
        const projected = rel.clone().addScaledVector(normal, -rel.dot(normal));
        avgRadius += projected.length();
      }
      avgRadius /= cycle.length;
      if (!Number.isFinite(avgRadius) || avgRadius < 0.2) continue;
      if (maxPlaneDeviation > 0.12) continue;

      enforceAlternatingSixRingBondOrders(edges, edgeIndices);
      aromaticRings.push({
        atoms: cycle.slice(),
        center,
        normal,
        radius: avgRadius * 0.56,
      });
    }
    return aromaticRings;
  }

  global.VibeMolBondInference = Object.freeze({
    AUTO_BOND_TOLERANCE,
    AUTO_BOND_MIN_DISTANCE,
    METAL_BOND_RADIUS,
    MAX_METAL_COORDINATION,
    getCovalentRadiusAngstrom,
    getMetalBondRadiusAngstrom,
    isLanthanideOrActinideAtomicNumber,
    isMonovalentMainGroupAtomicNumber,
    getAllowedMainGroupValences,
    chooseTargetValence,
    getPairMaxBondOrder,
    isAutoBondSupportedAtomicNumber,
    getElementMaxCoordination,
    isMetalAtomicNumber,
    countsTowardAtomValence,
    normalizeMetalBondMode,
    collectRawBondCandidates,
    acceptBondCandidatesByDistanceRank,
    perceiveBondConnectivity,
    collectBondCandidates,
    inferBondOrders,
    buildBondAdjacency,
    getUndirectedPairKey,
    findSimpleCyclesOfSize,
    enforceAlternatingSixRingBondOrders,
    inferAromaticSixRings,
    classifyBondCleanupDiff,
    isTransitionMetalAtomicNumber,
  });
})(typeof window !== 'undefined' ? window : globalThis);
