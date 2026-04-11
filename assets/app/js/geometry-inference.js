(function (global) {
  'use strict';

  const { countsTowardAtomValence } = global.VibeMolBondInference || {};
  const {
    GeometryId,
    getGeometry,
    getCoordinationProfile,
    resolveAutoCoordinationChoice,
  } = global.VibeMolCoordination || {};

  if (
    ![GeometryId, getGeometry, getCoordinationProfile].every(Boolean)
    || typeof getGeometry !== 'function'
    || typeof getCoordinationProfile !== 'function'
    || typeof countsTowardAtomValence !== 'function'
  ) {
    throw new Error('VibeMolGeometryInference requires VibeMolBondInference and VibeMolCoordination to be loaded first.');
  }

  const EPSILON = 1e-8;

  const VSEPR_TABLE = Object.freeze({
    '1_1': Object.freeze({ geometryId: GeometryId.TERMINAL, label: 'terminal', lonePairs: 0 }),
    '2_2': Object.freeze({ geometryId: GeometryId.LINEAR, label: 'linear', lonePairs: 0 }),
    '2_1': Object.freeze({ geometryId: GeometryId.LINEAR, label: 'terminal (with lp)', lonePairs: 1 }),
    '3_3': Object.freeze({ geometryId: GeometryId.TRIGONAL_PLANAR, label: 'trigonal planar', lonePairs: 0 }),
    '3_2': Object.freeze({ geometryId: GeometryId.TRIGONAL_PLANAR, label: 'bent', lonePairs: 1 }),
    '3_1': Object.freeze({ geometryId: GeometryId.TRIGONAL_PLANAR, label: 'terminal (with 2 lp)', lonePairs: 2 }),
    '4_4': Object.freeze({ geometryId: GeometryId.TETRAHEDRAL, label: 'tetrahedral', lonePairs: 0 }),
    '4_3': Object.freeze({ geometryId: GeometryId.TETRAHEDRAL, label: 'trigonal pyramidal', lonePairs: 1 }),
    '4_2': Object.freeze({ geometryId: GeometryId.TETRAHEDRAL, label: 'bent', lonePairs: 2 }),
    '4_1': Object.freeze({ geometryId: GeometryId.TETRAHEDRAL, label: 'terminal (with 3 lp)', lonePairs: 3 }),
    '5_5': Object.freeze({ geometryId: GeometryId.TRIGONAL_BIPYRAMIDAL, label: 'trigonal bipyramidal', lonePairs: 0 }),
    '5_4': Object.freeze({ geometryId: GeometryId.TRIGONAL_BIPYRAMIDAL, label: 'seesaw', lonePairs: 1 }),
    '5_3': Object.freeze({ geometryId: GeometryId.TRIGONAL_BIPYRAMIDAL, label: 'T-shaped', lonePairs: 2 }),
    '5_2': Object.freeze({ geometryId: GeometryId.TRIGONAL_BIPYRAMIDAL, label: 'linear', lonePairs: 3 }),
    '6_6': Object.freeze({ geometryId: GeometryId.OCTAHEDRAL, label: 'octahedral', lonePairs: 0 }),
    '6_5': Object.freeze({ geometryId: GeometryId.OCTAHEDRAL, label: 'square pyramidal', lonePairs: 1 }),
    '6_4': Object.freeze({ geometryId: GeometryId.OCTAHEDRAL, label: 'square planar', lonePairs: 2 }),
    '7_7': Object.freeze({ geometryId: GeometryId.PENTAGONAL_BIPYRAMIDAL, label: 'pentagonal bipyramidal', lonePairs: 0 }),
    '7_6': Object.freeze({ geometryId: GeometryId.PENTAGONAL_BIPYRAMIDAL, label: 'pentagonal pyramidal', lonePairs: 1 }),
    '7_5': Object.freeze({ geometryId: GeometryId.PENTAGONAL_BIPYRAMIDAL, label: 'pentagonal planar', lonePairs: 2 }),
    '8_8': Object.freeze({ geometryId: GeometryId.SQUARE_ANTIPRISMATIC, label: 'square antiprismatic', lonePairs: 0 }),
  });

  const GROUP1 = new Set([1, 3, 11, 19, 37, 55, 87]);
  const GROUP2 = new Set([2, 4, 12, 20, 38, 56, 88]);
  const GROUP13 = new Set([5, 13, 31, 49, 81, 113]);
  const GROUP14 = new Set([6, 14, 32, 50, 82, 114]);
  const GROUP15 = new Set([7, 15, 33, 51, 83, 115]);
  const GROUP16 = new Set([8, 16, 34, 52, 84, 116]);
  const GROUP17 = new Set([9, 17, 35, 53, 85, 117]);
  const GROUP18 = new Set([10, 18, 36, 54, 86, 118]);

  function getElementSymbol(z) {
    const info = global.ATOM_Z_TO_DATA && global.ATOM_Z_TO_DATA[z | 0];
    return info && info.symbol ? String(info.symbol) : `Z${z | 0}`;
  }

  function isTransitionMetalAtomicNumber(z) {
    const n = z | 0;
    return (n >= 21 && n <= 30) || (n >= 39 && n <= 48) || (n >= 72 && n <= 80) || (n >= 104 && n <= 112);
  }

  function isLanthanideOrActinideAtomicNumber(z) {
    const n = z | 0;
    return (n >= 57 && n <= 71) || (n >= 89 && n <= 103);
  }

  function period(z) {
    const n = z | 0;
    if (n <= 2) return 1;
    if (n <= 10) return 2;
    if (n <= 18) return 3;
    if (n <= 36) return 4;
    if (n <= 54) return 5;
    if (n <= 86) return 6;
    return 7;
  }

  function valenceElectrons(z) {
    const n = z | 0;
    if (GROUP1.has(n)) return 1;
    if (GROUP2.has(n)) return 2;
    if (GROUP13.has(n)) return 3;
    if (GROUP14.has(n)) return 4;
    if (GROUP15.has(n)) return 5;
    if (GROUP16.has(n)) return 6;
    if (GROUP17.has(n)) return 7;
    if (GROUP18.has(n)) return n === 2 ? 2 : 8;
    return 0;
  }

  function clampOrder(value) {
    const order = Math.round(Number(value) || 1);
    return Math.max(1, Math.min(4, order));
  }

  function normalizeDir(dir) {
    const x = Number(dir && dir[0]) || 0;
    const y = Number(dir && dir[1]) || 0;
    const z = Number(dir && dir[2]) || 0;
    const len = Math.hypot(x, y, z);
    if (!(len > EPSILON)) return null;
    return [x / len, y / len, z / len];
  }

  function getAtomId(atom, atomIndex) {
    const raw = atom && atom.id != null ? String(atom.id).trim() : '';
    return raw || `index:${atomIndex | 0}`;
  }

  function buildAtomIndexById(vol) {
    const atoms = Array.isArray(vol && vol.atoms) ? vol.atoms : [];
    const atomIndexById = new Map();
    for (let atomIndex = 0; atomIndex < atoms.length; atomIndex += 1) {
      atomIndexById.set(getAtomId(atoms[atomIndex], atomIndex), atomIndex);
    }
    return atomIndexById;
  }

  function getAtomPosition(vol, atomIndex, options = {}) {
    if (typeof options.getAtomWorld === 'function') {
      const provided = options.getAtomWorld(vol, atomIndex);
      if (Array.isArray(provided) && provided.length >= 3) {
        return [
          Number(provided[0]) || 0,
          Number(provided[1]) || 0,
          Number(provided[2]) || 0,
        ];
      }
    }
    const atom = Array.isArray(vol && vol.atoms) ? vol.atoms[atomIndex | 0] : null;
    if (!atom) return null;
    return [
      Number(atom.x) || 0,
      Number(atom.y) || 0,
      Number(atom.z) || 0,
    ];
  }

  function buildVisibleBondRecords(vol, options = {}) {
    const atoms = Array.isArray(vol && vol.atoms) ? vol.atoms : [];
    const bonds = Array.isArray(vol && vol.bonds) ? vol.bonds : [];
    const atomIndexById = buildAtomIndexById(vol);
    const out = [];
    for (const bond of bonds) {
      if (!bond || typeof bond !== 'object') continue;
      if (String(bond.kind || 'normal') === 'blocked') continue;
      const a = typeof bond.a === 'string' ? atomIndexById.get(String(bond.a).trim()) : (bond.a | 0);
      const b = typeof bond.b === 'string' ? atomIndexById.get(String(bond.b).trim()) : (bond.b | 0);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= atoms.length || b >= atoms.length || a === b) continue;
      const origin = String(bond.origin || 'explicit').trim();
      if (options.explicitOnly && origin !== 'explicit') continue;
      out.push({
        a,
        b,
        order: clampOrder(bond.order),
        origin,
      });
    }
    return out;
  }

  function getStoredPreferredGeometryId(vol, atomIndex, options = {}) {
    if (typeof options.preferredGeometryId === 'string') return String(options.preferredGeometryId).trim();
    const atom = Array.isArray(vol && vol.atoms) ? vol.atoms[atomIndex | 0] : null;
    if (!atom) return '';
    const atomId = getAtomId(atom, atomIndex);
    const map = vol && vol.annotations && vol.annotations.coordination && vol.annotations.coordination.byAtomId;
    return map && map[atomId] ? String(map[atomId].geometryId || '').trim() : '';
  }

  function getFallbackVseprEntry(stericNumber, fullBondCount) {
    const targetSteric = Math.max(1, stericNumber | 0);
    const targetBonds = Math.max(1, fullBondCount | 0);
    let best = null;
    let bestScore = Infinity;
    for (const [key, entry] of Object.entries(VSEPR_TABLE)) {
      const parts = key.split('_');
      const steric = Number(parts[0]) || 0;
      const bonds = Number(parts[1]) || 0;
      const score = Math.abs(steric - targetSteric) * 10 + Math.abs(bonds - targetBonds);
      if (score < bestScore) {
        bestScore = score;
        best = Object.assign({ stericNumber: steric, fullBondCount: bonds }, entry);
      }
    }
    return best;
  }

  function lookupVseprEntry(stericNumber, fullBondCount) {
    const key = `${Math.max(0, stericNumber | 0)}_${Math.max(0, fullBondCount | 0)}`;
    const exact = VSEPR_TABLE[key];
    if (exact) return Object.assign({ stericNumber, fullBondCount }, exact);
    return getFallbackVseprEntry(stericNumber, fullBondCount);
  }

  function computeBaseValenceFromAdjustedElectrons(adjustedVE) {
    return Math.max(0, Math.min(adjustedVE, 8 - adjustedVE));
  }

  function baseValence(z, formalCharge = 0) {
    const atomicNumber = z | 0;
    const adjustedVE = valenceElectrons(atomicNumber) - (Number(formalCharge) || 0);
    return computeBaseValenceFromAdjustedElectrons(adjustedVE);
  }

  function resolveEffectiveValence(z, totalBondOrder, formalCharge = 0) {
    const atomicNumber = z | 0;
    const adjustedVE = valenceElectrons(atomicNumber) - (Number(formalCharge) || 0);
    const baseValenceValue = baseValence(atomicNumber, formalCharge);
    if (totalBondOrder <= baseValenceValue) return baseValenceValue;
    if (period(atomicNumber) < 3) return baseValenceValue;
    let projected = baseValenceValue;
    const maxExpanded = Math.min(6, Math.max(0, adjustedVE));
    for (let expanded = baseValenceValue + 2; expanded <= maxExpanded; expanded += 2) {
      if (expanded >= totalBondOrder) {
        projected = expanded;
        break;
      }
      projected = expanded;
    }
    return Math.max(projected, Math.min(maxExpanded, Math.max(baseValenceValue, totalBondOrder)));
  }

  function buildProjectedValenceCandidates(z, totalBondOrder, formalCharge = 0) {
    const atomicNumber = z | 0;
    const adjustedVE = valenceElectrons(atomicNumber) - (Number(formalCharge) || 0);
    const minimum = resolveEffectiveValence(atomicNumber, totalBondOrder, formalCharge);
    const candidates = [minimum];
    if (period(atomicNumber) >= 3) {
      const maxExpanded = Math.min(6, Math.max(0, adjustedVE));
      for (let expanded = minimum + 2; expanded <= maxExpanded; expanded += 2) {
        candidates.push(expanded);
      }
    }
    return Array.from(new Set(candidates
      .map((value) => Number(value) || 0)
      .filter((value) => value >= 0 && value >= totalBondOrder)));
  }

  function buildMainGroupCandidates(z, formalCharge, currentBonds, totalBondOrder) {
    const atomicNumber = z | 0;
    const adjustedVE = valenceElectrons(atomicNumber) - (Number(formalCharge) || 0);
    const projectedValenceCandidates = buildProjectedValenceCandidates(atomicNumber, totalBondOrder, formalCharge);
    const out = [];
    const seen = new Set();
    for (const projectedValence of projectedValenceCandidates) {
      const rawLonePairs = (adjustedVE - projectedValence) / 2;
      if (rawLonePairs < -EPSILON) continue;
      const lonePairs = Math.max(0, Math.round(rawLonePairs));
      const lonePairAmbiguous = Math.abs(rawLonePairs - lonePairs) > 1e-6;
      const remainingBondOrder = Math.max(0, projectedValence - totalBondOrder);
      const maxFullBondCount = currentBonds + remainingBondOrder;
      for (let fullBondCount = currentBonds; fullBondCount <= maxFullBondCount; fullBondCount += 1) {
        const stericNumber = fullBondCount + lonePairs;
        const entry = lookupVseprEntry(stericNumber, fullBondCount);
        if (!entry || !entry.geometryId) continue;
        const dedupeKey = `${projectedValence}:${fullBondCount}:${entry.geometryId}:${lonePairs}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push({
          geometryId: String(entry.geometryId || ''),
          molecularLabel: String(entry.label || '').trim(),
          stericNumber,
          lonePairs,
          rawLonePairs,
          lonePairAmbiguous,
          fullBondCount,
          remainingBonds: Math.max(0, fullBondCount - currentBonds),
          currentBonds,
          totalBondOrder,
          projectedValence,
          isHypervalent: projectedValence > computeBaseValenceFromAdjustedElectrons(adjustedVE),
        });
      }
    }
    return out.sort((left, right) => {
      if (left.projectedValence !== right.projectedValence) return left.projectedValence - right.projectedValence;
      if (left.fullBondCount !== right.fullBondCount) return left.fullBondCount - right.fullBondCount;
      return String(left.geometryId || '').localeCompare(String(right.geometryId || ''));
    });
  }

  function chooseFallbackCandidate(z, currentBonds, totalBondOrder, preferredGeometryId) {
    const profile = getCoordinationProfile(z | 0);
    const choices = Array.isArray(profile && profile.choices) ? profile.choices : [];
    const preferred = choices.find((choice) => String(choice.geometryId || '') === String(preferredGeometryId || '')) || null;
    const fallback = preferred || choices.find((choice) => (choice.cn | 0) >= currentBonds) || choices[0] || null;
    const geometry = getGeometry(fallback && fallback.geometryId) || getGeometry(GeometryId.TETRAHEDRAL);
    const cn = Math.max(currentBonds, Number(fallback && fallback.cn) || Number(geometry && geometry.cn) || 1);
    return {
      geometryId: geometry ? geometry.id : GeometryId.TETRAHEDRAL,
      molecularLabel: geometry ? geometry.label : 'Tetrahedral',
      stericNumber: cn,
      lonePairs: 0,
      rawLonePairs: 0,
      lonePairAmbiguous: true,
      fullBondCount: cn,
      remainingBonds: Math.max(0, cn - currentBonds),
      currentBonds,
      totalBondOrder,
      projectedValence: totalBondOrder,
      isHypervalent: false,
      usedFallback: true,
    };
  }

  function chooseCandidate(candidates, matcher) {
    const filtered = (Array.isArray(candidates) ? candidates : []).filter(matcher);
    if (!filtered.length) return null;
    return filtered.reduce((best, candidate) => {
      if (!best) return candidate;
      if ((candidate.fullBondCount | 0) !== (best.fullBondCount | 0)) return candidate.fullBondCount > best.fullBondCount ? candidate : best;
      if ((candidate.projectedValence | 0) !== (best.projectedValence | 0)) return candidate.projectedValence > best.projectedValence ? candidate : best;
      return best;
    }, null);
  }

  function inferMainGroupGeometryFromState(state) {
    const atomicNumber = state.z | 0;
    const formalCharge = Number(state.formalCharge) || 0;
    const bonds = Array.isArray(state.bonds) ? state.bonds : [];
    const currentBonds = bonds.length;
    const totalBondOrder = bonds.reduce((sum, bond) => sum + clampOrder(bond && bond.order), 0);
    const adjustedVE = valenceElectrons(atomicNumber) - formalCharge;
    const baseValence = computeBaseValenceFromAdjustedElectrons(adjustedVE);
    const minimalProjectedValence = resolveEffectiveValence(atomicNumber, totalBondOrder, formalCharge);
    const candidates = buildMainGroupCandidates(atomicNumber, formalCharge, currentBonds, totalBondOrder);
    const derivedCandidate = chooseCandidate(
      candidates.filter((candidate) => (candidate.projectedValence | 0) === (minimalProjectedValence | 0)),
      (candidate) => candidate.fullBondCount >= currentBonds
    ) || chooseFallbackCandidate(atomicNumber, currentBonds, totalBondOrder, state.preferredGeometryId);
    const maxPossibleFullBondCount = candidates.length
      ? Math.max(...candidates.map((candidate) => candidate.fullBondCount | 0))
      : (derivedCandidate.fullBondCount | 0);
    const hasOpenSites = maxPossibleFullBondCount > currentBonds;
    const preferredGeometryId = String(state.preferredGeometryId || '').trim();
    const preferredCandidate = hasOpenSites && preferredGeometryId
      ? chooseCandidate(candidates, (candidate) => String(candidate.geometryId || '') === preferredGeometryId)
      : null;
    const activeCandidate = preferredCandidate || derivedCandidate;
    const compatibleGeometryIds = Array.from(new Set(candidates.map((candidate) => String(candidate.geometryId || ''))));
    return Object.freeze({
      z: atomicNumber,
      symbol: getElementSymbol(atomicNumber),
      isTM: false,
      formalCharge,
      adjustedVE,
      baseValence,
      projectedValence: activeCandidate.projectedValence | 0,
      derivedProjectedValence: minimalProjectedValence,
      currentBonds,
      totalBondOrder,
      stericNumber: activeCandidate.stericNumber | 0,
      lonePairs: activeCandidate.lonePairs | 0,
      rawLonePairs: Number(activeCandidate.rawLonePairs) || 0,
      lonePairAmbiguous: !!activeCandidate.lonePairAmbiguous,
      fullBondCount: activeCandidate.fullBondCount | 0,
      derivedFullBondCount: derivedCandidate.fullBondCount | 0,
      remainingBonds: Math.max(0, activeCandidate.remainingBonds | 0),
      maxPossibleFullBondCount,
      geometryId: String(activeCandidate.geometryId || ''),
      derivedGeometryId: String(derivedCandidate.geometryId || ''),
      activeGeometryId: String(activeCandidate.geometryId || ''),
      molecularLabel: String(activeCandidate.molecularLabel || ''),
      derivedMolecularLabel: String(derivedCandidate.molecularLabel || ''),
      preferredGeometryId,
      preferredGeometryCompatible: !!preferredCandidate,
      compatibleGeometryIds: Object.freeze(compatibleGeometryIds),
      hasOpenSites,
      candidates: Object.freeze(candidates.map((candidate) => Object.freeze(Object.assign({}, candidate)))),
      activeCandidate: Object.freeze(Object.assign({}, activeCandidate)),
      derivedCandidate: Object.freeze(Object.assign({}, derivedCandidate)),
    });
  }

  function inferTransitionMetalGeometryFromState(state) {
    const atomicNumber = state.z | 0;
    const bonds = Array.isArray(state.bonds) ? state.bonds : [];
    const currentBonds = bonds.length;
    const totalBondOrder = bonds.reduce((sum, bond) => sum + clampOrder(bond && bond.order), 0);
    const maxBondOrder = bonds.reduce((max, bond) => Math.max(max, clampOrder(bond && bond.order)), 1);
    const profile = getCoordinationProfile(atomicNumber);
    const env = { neighborCount: currentBonds, bondOrderSum: totalBondOrder, maxBondOrder };
    const compatibleChoices = Array.isArray(profile && profile.choices)
      ? profile.choices.filter((choice) => (choice.cn | 0) >= currentBonds)
      : [];
    const preferredGeometryId = String(state.preferredGeometryId || '').trim();
    const derivedChoice = typeof resolveAutoCoordinationChoice === 'function'
      ? resolveAutoCoordinationChoice(atomicNumber, env)
      : (compatibleChoices[0] || (profile && profile.choices && profile.choices[0]) || null);
    const preferredChoice = preferredGeometryId
      ? compatibleChoices.find((choice) => String(choice.geometryId || '') === preferredGeometryId) || null
      : null;
    const activeChoice = preferredChoice || derivedChoice || compatibleChoices[0] || (profile && profile.choices && profile.choices[0]) || null;
    const activeGeometry = getGeometry(activeChoice && activeChoice.geometryId) || getGeometry(GeometryId.OCTAHEDRAL);
    const derivedGeometry = getGeometry(derivedChoice && derivedChoice.geometryId) || activeGeometry;
    const maxPossibleFullBondCount = compatibleChoices.length
      ? Math.max(...compatibleChoices.map((choice) => choice.cn | 0))
      : (activeGeometry ? activeGeometry.cn : currentBonds);
    return Object.freeze({
      z: atomicNumber,
      symbol: getElementSymbol(atomicNumber),
      isTM: true,
      formalCharge: Number(state.formalCharge) || 0,
      currentBonds,
      totalBondOrder,
      stericNumber: activeGeometry ? activeGeometry.cn : currentBonds,
      lonePairs: 0,
      rawLonePairs: 0,
      lonePairAmbiguous: false,
      fullBondCount: activeGeometry ? activeGeometry.cn : currentBonds,
      derivedFullBondCount: derivedGeometry ? derivedGeometry.cn : currentBonds,
      remainingBonds: Math.max(0, (activeGeometry ? activeGeometry.cn : currentBonds) - currentBonds),
      maxPossibleFullBondCount,
      geometryId: activeGeometry ? activeGeometry.id : GeometryId.OCTAHEDRAL,
      derivedGeometryId: derivedGeometry ? derivedGeometry.id : (activeGeometry ? activeGeometry.id : GeometryId.OCTAHEDRAL),
      activeGeometryId: activeGeometry ? activeGeometry.id : GeometryId.OCTAHEDRAL,
      molecularLabel: activeGeometry ? activeGeometry.label : 'Octahedral',
      derivedMolecularLabel: derivedGeometry ? derivedGeometry.label : (activeGeometry ? activeGeometry.label : 'Octahedral'),
      preferredGeometryId,
      preferredGeometryCompatible: !!preferredChoice,
      compatibleGeometryIds: Object.freeze(Array.from(new Set((compatibleChoices.length ? compatibleChoices : (profile && profile.choices) || []).map((choice) => String(choice.geometryId || ''))))),
      hasOpenSites: maxPossibleFullBondCount > currentBonds,
      candidates: Object.freeze((compatibleChoices.length ? compatibleChoices : (profile && profile.choices) || []).map((choice) => Object.freeze({
        geometryId: String(choice.geometryId || ''),
        molecularLabel: String(choice.label || choice.text || ''),
        stericNumber: choice.cn | 0,
        lonePairs: 0,
        rawLonePairs: 0,
        lonePairAmbiguous: false,
        fullBondCount: choice.cn | 0,
        remainingBonds: Math.max(0, (choice.cn | 0) - currentBonds),
        currentBonds,
        totalBondOrder,
        projectedValence: choice.cn | 0,
        isHypervalent: false,
      }))),
      activeCandidate: Object.freeze({
        geometryId: activeGeometry ? activeGeometry.id : GeometryId.OCTAHEDRAL,
        molecularLabel: activeGeometry ? activeGeometry.label : 'Octahedral',
        stericNumber: activeGeometry ? activeGeometry.cn : currentBonds,
        lonePairs: 0,
        rawLonePairs: 0,
        lonePairAmbiguous: false,
        fullBondCount: activeGeometry ? activeGeometry.cn : currentBonds,
        remainingBonds: Math.max(0, (activeGeometry ? activeGeometry.cn : currentBonds) - currentBonds),
        currentBonds,
        totalBondOrder,
        projectedValence: activeGeometry ? activeGeometry.cn : currentBonds,
        isHypervalent: false,
      }),
      derivedCandidate: Object.freeze({
        geometryId: derivedGeometry ? derivedGeometry.id : (activeGeometry ? activeGeometry.id : GeometryId.OCTAHEDRAL),
        molecularLabel: derivedGeometry ? derivedGeometry.label : (activeGeometry ? activeGeometry.label : 'Octahedral'),
        stericNumber: derivedGeometry ? derivedGeometry.cn : currentBonds,
        lonePairs: 0,
        rawLonePairs: 0,
        lonePairAmbiguous: false,
        fullBondCount: derivedGeometry ? derivedGeometry.cn : currentBonds,
        remainingBonds: Math.max(0, (derivedGeometry ? derivedGeometry.cn : currentBonds) - currentBonds),
        currentBonds,
        totalBondOrder,
        projectedValence: derivedGeometry ? derivedGeometry.cn : currentBonds,
        isHypervalent: false,
      }),
    });
  }

  function inferGeometryFromState(state = {}) {
    const atomicNumber = state.z | 0;
    if (isTransitionMetalAtomicNumber(atomicNumber) || isLanthanideOrActinideAtomicNumber(atomicNumber)) {
      return inferTransitionMetalGeometryFromState(state);
    }
    return inferMainGroupGeometryFromState(state);
  }

  function inferAtomGeometry(vol, atomIndex, options = {}) {
    const atoms = Array.isArray(vol && vol.atoms) ? vol.atoms : [];
    const idx = atomIndex | 0;
    if (idx < 0 || idx >= atoms.length || !atoms[idx]) return null;
    const atom = atoms[idx];
    const origin = getAtomPosition(vol, idx, options);
    const bonds = [];
    for (const bond of buildVisibleBondRecords(vol, options)) {
      if (bond.a !== idx && bond.b !== idx) continue;
      const otherIndex = bond.a === idx ? bond.b : bond.a;
      if (!countsTowardAtomValence(atom, atoms[otherIndex])) continue;
      const other = getAtomPosition(vol, otherIndex, options);
      const direction = origin && other
        ? normalizeDir([
          (other[0] || 0) - (origin[0] || 0),
          (other[1] || 0) - (origin[1] || 0),
          (other[2] || 0) - (origin[2] || 0),
        ])
        : null;
      bonds.push({ order: bond.order, direction });
    }
    return inferGeometryFromState({
      z: Number(atom.Z) | 0,
      formalCharge: Number.isFinite(atom.formalCharge) ? Math.round(Number(atom.formalCharge)) : 0,
      bonds,
      preferredGeometryId: getStoredPreferredGeometryId(vol, idx, options),
    });
  }

  function inferAllAtomGeometries(vol, options = {}) {
    const atoms = Array.isArray(vol && vol.atoms) ? vol.atoms : [];
    const result = new Map();
    for (let atomIndex = 0; atomIndex < atoms.length; atomIndex += 1) {
      result.set(getAtomId(atoms[atomIndex], atomIndex), inferAtomGeometry(vol, atomIndex, options));
    }
    return result;
  }

  global.VibeMolGeometryInference = Object.freeze({
    VSEPR_TABLE,
    valenceElectrons,
    period,
    baseValence,
    resolveEffectiveValence,
    inferGeometryFromState,
    inferAtomGeometry,
    inferAllAtomGeometries,
  });
})(typeof window !== 'undefined' ? window : globalThis);
