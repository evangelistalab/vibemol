(function (global) {
  'use strict';

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
   * Build candidate bonds from atom positions using covalent-radius heuristics.
   * @param {Array<{pos:THREE.Vector3,Z:number}>} atomPositions
   * @returns {Array<{i:number,j:number,len:number,singleRef:number,cutoff:number,order:number,maxOrder:number}>}
   */
  function collectBondCandidates(atomPositions) {
    const edges = [];
    const n = atomPositions.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ai = atomPositions[i];
        const aj = atomPositions[j];
        const ri = getCovalentRadiusAngstrom(ai.Z);
        const rj = getCovalentRadiusAngstrom(aj.Z);
        const singleRef = ri + rj;
        const cutoff = 1.15 * singleRef;
        const len = ai.pos.distanceTo(aj.pos);
        if (len < 0.4 || len > cutoff) continue;
        edges.push({
          i,
          j,
          len,
          singleRef,
          cutoff,
          order: 1,
          maxOrder: getPairMaxBondOrder(ai.Z, aj.Z),
        });
      }
    }
    return edges;
  }

  /**
   * Infer bond orders by promoting single bonds while satisfying valence deficits.
   * This intentionally targets organic/main-group chemistry and avoids metals/f-block.
   * @param {Array<{Z:number}>} atomPositions
   * @param {Array<{i:number,j:number,len:number,singleRef:number,order:number,maxOrder:number}>} edges
   */
  function inferBondOrders(atomPositions, edges) {
    if (!edges.length) return;
    const n = atomPositions.length;
    const currentValence = new Array(n).fill(0);
    for (const e of edges) {
      currentValence[e.i] += e.order;
      currentValence[e.j] += e.order;
    }
    const targetValence = currentValence.map((v, idx) => {
      const z = atomPositions[idx].Z | 0;
      if (isTransitionMetalAtomicNumber(z) || isLanthanideOrActinideAtomicNumber(z)) return v;
      return chooseTargetValence(z, v);
    });
    const deficit = targetValence.map((v, idx) => Math.max(0, v - currentValence[idx]));

    const maxPromotions = edges.reduce((sum, e) => sum + Math.max(0, (e.maxOrder | 0) - 1), 0);
    let promotions = 0;
    while (promotions < maxPromotions) {
      let bestIdx = -1;
      let bestScore = 0;
      for (let k = 0; k < edges.length; k++) {
        const e = edges[k];
        if (e.order >= e.maxOrder) continue;
        if (deficit[e.i] <= 0 || deficit[e.j] <= 0) continue;
        const ratio = e.len / Math.max(1e-6, e.singleRef);
        const distanceBonus = Math.max(0, 1.15 - ratio) * 2.5;
        const valenceBonus = deficit[e.i] + deficit[e.j];
        const score = valenceBonus + distanceBonus;
        if (score > bestScore + 1e-8) {
          bestScore = score;
          bestIdx = k;
        }
      }
      if (bestIdx < 0) break;
      const e = edges[bestIdx];
      e.order += 1;
      deficit[e.i] = Math.max(0, deficit[e.i] - 1);
      deficit[e.j] = Math.max(0, deficit[e.j] - 1);
      promotions += 1;
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
    tryVariant([...cycle].reverse());
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

      const meanLen = cycleEdgeLengths.reduce((s, v) => s + v, 0) / cycleEdgeLengths.length;
      let varLen = 0;
      for (const v of cycleEdgeLengths) {
        const d = v - meanLen;
        varLen += d * d;
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
    getCovalentRadiusAngstrom,
    isLanthanideOrActinideAtomicNumber,
    isMonovalentMainGroupAtomicNumber,
    getAllowedMainGroupValences,
    chooseTargetValence,
    getPairMaxBondOrder,
    collectBondCandidates,
    inferBondOrders,
    buildBondAdjacency,
    getUndirectedPairKey,
    findSimpleCyclesOfSize,
    enforceAlternatingSixRingBondOrders,
    inferAromaticSixRings,
    isTransitionMetalAtomicNumber,
  });
})(typeof window !== 'undefined' ? window : globalThis);
